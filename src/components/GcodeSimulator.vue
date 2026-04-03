<template>
  <div class="modal fade" ref="modalEl" tabindex="-1" aria-hidden="true">
    <div class="modal-dialog modal-fullscreen">
      <div class="modal-content bg-dark">
        <div class="modal-header py-2 bg-dark text-white border-bottom border-secondary">
          <h6 class="modal-title mb-0">
            <i class="fa-solid fa-play me-2"></i>G-code Simulator
          </h6>
          <span v-if="statusMessage" class="badge bg-info ms-3 text-truncate" style="max-width: 400px">
            {{ statusMessage }}
          </span>
          <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
        </div>
        <div class="modal-body p-0 d-flex flex-column">
          <div ref="viewport" class="simulator-viewport flex-grow-1"></div>
          <div class="simulator-controls bg-dark border-top border-secondary px-3 py-2 d-flex align-items-center gap-3">
            <button class="btn btn-sm btn-outline-light" @click="restart" title="Restart">
              <i class="fa-solid fa-backward-fast"></i>
            </button>
            <button class="btn btn-sm" :class="isPlaying ? 'btn-warning' : 'btn-success'" @click="togglePlay" style="width:42px">
              <i :class="isPlaying ? 'fa-solid fa-pause' : 'fa-solid fa-play'"></i>
            </button>
            <input
              type="range" class="form-range flex-grow-1 mx-2"
              min="0" :max="totalTime" step="0.01"
              :value="currentTime"
              @input="seekTo($event.target.valueAsNumber)"
            />
            <span class="text-white text-nowrap small" style="min-width: 100px">
              {{ formatTime(currentTime) }} / {{ formatTime(totalTime) }}
            </span>
            <select class="form-select form-select-sm bg-dark text-white border-secondary"
              style="width: 80px" v-model.number="playbackSpeed">
              <option :value="1">1×</option>
              <option :value="2">2×</option>
              <option :value="5">5×</option>
              <option :value="10">10×</option>
              <option :value="25">25×</option>
              <option :value="50">50×</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onBeforeUnmount } from 'vue';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Modal } from 'bootstrap';
import { useDrillStore } from '@/stores/store';

const drillStore = useDrillStore();

const modalEl = ref(null);
const viewport = ref(null);

const isPlaying = ref(false);
const currentTime = ref(0);
const totalTime = ref(1);
const playbackSpeed = ref(10);
const statusMessage = ref('');

let scene, camera, renderer, controls, animationId, resizeObserver;
let ironGroup, tipMat, tipLight, shadowDisc;
let timeline = [];
let lastTimestamp = null;
let bsModal = null;

// ── G-code Parser ────────────────────────────────────────────

function extractParams(line) {
  const p = {};
  for (const m of line.matchAll(/([A-Z])([-\d.]+)/g)) {
    p[m[1]] = parseFloat(m[2]);
  }
  return p;
}

function parseGcode(text) {
  const cmds = [];
  let x = 0, y = 0, z = 0, feed = 6000;
  let originSet = false;

  for (const raw of text.split('\n')) {
    const semi = raw.indexOf(';');
    const code = (semi >= 0 ? raw.substring(0, semi) : raw).trim();

    const m117 = raw.match(/M117\s+(.*)/);
    if (m117) {
      cmds.push({ type: 'msg', text: m117[1].trim() });
      continue;
    }

    if (!code) continue;
    if (code.startsWith('G28')) continue;

    if (code.startsWith('G92')) {
      const p = extractParams(code);
      if (p.X !== undefined) x = p.X;
      if (p.Y !== undefined) y = p.Y;
      if (p.Z !== undefined) z = p.Z;
      originSet = true;
      cmds.push({ type: 'pos', x, y, z });
      continue;
    }

    if (code.startsWith('G0') || code.startsWith('G1')) {
      const rapid = code[1] === '0';
      const p = extractParams(code);
      if (p.E !== undefined && p.X === undefined && p.Y === undefined && p.Z === undefined) continue;
      const nx = p.X ?? x, ny = p.Y ?? y, nz = p.Z ?? z;
      if (p.F !== undefined) feed = p.F;

      const dist = Math.sqrt((nx - x) ** 2 + (ny - y) ** 2 + (nz - z) ** 2);
      if (dist > 0.001 && originSet) {
        const speed = rapid ? Math.max(feed, 6000) : feed;
        cmds.push({
          type: 'move', fx: x, fy: y, fz: z,
          tx: nx, ty: ny, tz: nz,
          duration: dist / (speed / 60), rapid,
        });
      }
      x = nx; y = ny; z = nz;
      continue;
    }

    if (code.startsWith('G4')) {
      const p = extractParams(code);
      const dur = (p.P ?? 0) / 1000 + (p.S ?? 0);
      if (dur > 0 && originSet) {
        cmds.push({ type: 'dwell', duration: dur, x, y, z });
      }
      continue;
    }
  }
  return cmds;
}

function buildTimeline(cmds) {
  let t = 0;
  for (const c of cmds) {
    c.startTime = t;
    if (c.type === 'move' || c.type === 'dwell') t += c.duration;
  }
  return t;
}

function getStateAtTime(t) {
  let x = 0, y = 0, z = 0, msg = '';
  for (const c of timeline) {
    if (c.type === 'pos') { x = c.x; y = c.y; z = c.z; continue; }
    if (c.type === 'msg') { if (c.startTime <= t) msg = c.text; continue; }
    if (c.startTime > t) break;
    if (c.type === 'move') {
      const elapsed = t - c.startTime;
      if (elapsed >= c.duration) {
        x = c.tx; y = c.ty; z = c.tz;
      } else {
        const p = elapsed / c.duration;
        return {
          x: c.fx + (c.tx - c.fx) * p,
          y: c.fy + (c.ty - c.fy) * p,
          z: c.fz + (c.tz - c.fz) * p,
          msg,
        };
      }
    } else if (c.type === 'dwell') {
      x = c.x; y = c.y; z = c.z;
      if (t < c.startTime + c.duration) return { x, y, z, msg };
    }
  }
  return { x, y, z, msg };
}

// ── Three.js Scene ───────────────────────────────────────────

function initScene(gcode) {
  cleanup();
  timeline = parseGcode(gcode);
  totalTime.value = buildTimeline(timeline) || 1;
  currentTime.value = 0;
  isPlaying.value = false;
  statusMessage.value = '';

  const container = viewport.value;
  if (!container) return;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a1a2e);

  scene.add(new THREE.AmbientLight(0xffffff, 0.5));
  const dir1 = new THREE.DirectionalLight(0xffffff, 0.9);
  dir1.position.set(80, 60, 120);
  scene.add(dir1);
  const dir2 = new THREE.DirectionalLight(0xffffff, 0.3);
  dir2.position.set(-60, -40, 80);
  scene.add(dir2);

  const w = container.clientWidth || 800;
  const h = container.clientHeight || 600;

  camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 2000);
  camera.up.set(0, 0, 1);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(w, h);
  container.appendChild(renderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.1;

  buildPCB();
  buildPathLine();
  buildIronTip();

  const bounds = getPCBBounds();
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;
  const diag = Math.sqrt((bounds.maxX - bounds.minX) ** 2 + (bounds.maxY - bounds.minY) ** 2) || 100;

  camera.position.set(cx - diag * 0.2, cy - diag * 0.7, diag * 0.9);
  controls.target.set(cx, cy, 0);
  controls.update();

  resizeObserver = new ResizeObserver(() => {
    if (!renderer || !container) return;
    const rw = container.clientWidth;
    const rh = container.clientHeight;
    camera.aspect = rw / rh;
    camera.updateProjectionMatrix();
    renderer.setSize(rw, rh);
  });
  resizeObserver.observe(container);

  lastTimestamp = null;
  animate();
}

function getPCBBounds() {
  const allBed = drillStore.drillData.map(d => drillStore.drillToBedSpace(d));
  if (allBed.length === 0) return { minX: 0, maxX: 50, minY: 0, maxY: 50 };
  const xs = allBed.map(p => p.x);
  const ys = allBed.map(p => p.y);
  const pad = 3;
  return {
    minX: Math.min(...xs) - pad,
    maxX: Math.max(...xs) + pad,
    minY: Math.min(...ys) - pad,
    maxY: Math.max(...ys) + pad,
  };
}

function buildPCB() {
  const b = getPCBBounds();
  const pw = b.maxX - b.minX;
  const ph = b.maxY - b.minY;
  const thick = drillStore.profiles[drillStore.currentProfile]?.pcbThickness ?? 1.6;

  // PCB board
  const pcbGeom = new THREE.BoxGeometry(pw, ph, thick);
  const pcbMat = new THREE.MeshStandardMaterial({ color: 0x1a7a3a, roughness: 0.6, metalness: 0.1 });
  const pcb = new THREE.Mesh(pcbGeom, pcbMat);
  pcb.position.set(b.minX + pw / 2, b.minY + ph / 2, -thick / 2);
  scene.add(pcb);

  // Drill holes as dark circles on surface
  const allBed = drillStore.drillData.map(d => ({ bed: drillStore.drillToBedSpace(d), ...d }));
  if (allBed.length > 0) {
    const holeGeom = new THREE.CircleGeometry(0.4, 12);
    const holeMat = new THREE.MeshBasicMaterial({ color: 0x0a0a0a });
    const holes = new THREE.InstancedMesh(holeGeom, holeMat, allBed.length);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < allBed.length; i++) {
      dummy.position.set(allBed[i].bed.x, allBed[i].bed.y, 0.02);
      dummy.updateMatrix();
      holes.setMatrixAt(i, dummy.matrix);
    }
    scene.add(holes);
  }

  // Solder point markers (copper rings)
  const solderPts = drillStore.path
    .map(id => drillStore.drillData.find(d => d.id === id))
    .filter(d => d && d.solder)
    .map(d => drillStore.drillToBedSpace(d));

  if (solderPts.length > 0) {
    const ringGeom = new THREE.RingGeometry(0.35, 0.9, 16);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xcc6633, side: THREE.DoubleSide });
    const rings = new THREE.InstancedMesh(ringGeom, ringMat, solderPts.length);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < solderPts.length; i++) {
      dummy.position.set(solderPts[i].x, solderPts[i].y, 0.03);
      dummy.updateMatrix();
      rings.setMatrixAt(i, dummy.matrix);
    }
    scene.add(rings);
  }

  // No-go zones
  for (const z of drillStore.noGoZones) {
    const zw = z.x2 - z.x1;
    const zh = z.y2 - z.y1;
    const zoneGeom = new THREE.BoxGeometry(zw, zh, 0.3);
    const zoneMat = new THREE.MeshStandardMaterial({
      color: 0xff2222, transparent: true, opacity: 0.25, roughness: 0.8,
    });
    const zone = new THREE.Mesh(zoneGeom, zoneMat);
    zone.position.set(z.x1 + zw / 2, z.y1 + zh / 2, 0.15);
    scene.add(zone);
  }

  // Reference grid below PCB
  const gridSize = Math.max(pw, ph) * 2;
  const grid = new THREE.GridHelper(gridSize, Math.round(gridSize / 10), 0x333355, 0x222244);
  grid.rotation.x = Math.PI / 2;
  grid.position.set(b.minX + pw / 2, b.minY + ph / 2, -thick - 0.1);
  scene.add(grid);
}

function buildPathLine() {
  const pts = [];
  for (const c of timeline) {
    if (c.type === 'pos') {
      pts.push(new THREE.Vector3(c.x, c.y, c.z));
    } else if (c.type === 'move') {
      if (pts.length === 0) pts.push(new THREE.Vector3(c.fx, c.fy, c.fz));
      pts.push(new THREE.Vector3(c.tx, c.ty, c.tz));
    }
  }
  if (pts.length < 2) return;

  const geom = new THREE.BufferGeometry().setFromPoints(pts);
  const mat = new THREE.LineBasicMaterial({ color: 0x4488ff, transparent: true, opacity: 0.35 });
  scene.add(new THREE.Line(geom, mat));
}

function buildIronTip() {
  ironGroup = new THREE.Group();

  // Tapered tip (narrow bottom, wider top)
  const tipGeom = new THREE.CylinderGeometry(0.3, 1.5, 6, 16);
  tipGeom.rotateX(-Math.PI / 2);
  tipMat = new THREE.MeshStandardMaterial({ color: 0xcc8844, metalness: 0.8, roughness: 0.2 });
  const tipMesh = new THREE.Mesh(tipGeom, tipMat);
  tipMesh.position.z = 3;

  // Shaft
  const shaftGeom = new THREE.CylinderGeometry(2.5, 2.5, 20, 16);
  shaftGeom.rotateX(-Math.PI / 2);
  const shaftMat = new THREE.MeshStandardMaterial({ color: 0x444444, metalness: 0.5, roughness: 0.5 });
  const shaft = new THREE.Mesh(shaftGeom, shaftMat);
  shaft.position.z = 16;

  // Glow light at tip
  tipLight = new THREE.PointLight(0xff6600, 0, 15);
  tipLight.position.z = 0;

  ironGroup.add(tipMesh, shaft, tipLight);
  ironGroup.rotation.y = (10 * Math.PI) / 180;
  scene.add(ironGroup);

  // Shadow disc on PCB surface
  const shadowGeom = new THREE.CircleGeometry(3, 24);
  const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.15 });
  shadowDisc = new THREE.Mesh(shadowGeom, shadowMat);
  shadowDisc.position.z = 0.01;
  scene.add(shadowDisc);
}

// ── Animation Loop ───────────────────────────────────────────

function animate(timestamp) {
  animationId = requestAnimationFrame(animate);

  if (isPlaying.value && lastTimestamp !== null) {
    const dt = (timestamp - lastTimestamp) / 1000;
    currentTime.value = Math.min(currentTime.value + dt * playbackSpeed.value, totalTime.value);
    if (currentTime.value >= totalTime.value) {
      isPlaying.value = false;
    }
  }
  lastTimestamp = timestamp;

  const state = getStateAtTime(currentTime.value);

  if (ironGroup) {
    ironGroup.position.set(state.x, state.y, state.z);
    const nearPCB = state.z < 2;
    tipMat.emissive.set(nearPCB ? 0xff4400 : 0x000000);
    tipMat.emissiveIntensity = nearPCB ? 0.6 : 0;
    tipLight.intensity = nearPCB ? 1.2 : 0;
  }
  if (shadowDisc) {
    shadowDisc.position.x = state.x;
    shadowDisc.position.y = state.y;
  }
  if (state.msg) statusMessage.value = state.msg;

  controls?.update();
  renderer?.render(scene, camera);
}

// ── Playback Controls ────────────────────────────────────────

function togglePlay() {
  if (currentTime.value >= totalTime.value) {
    currentTime.value = 0;
  }
  isPlaying.value = !isPlaying.value;
  if (isPlaying.value) lastTimestamp = null;
}

function restart() {
  currentTime.value = 0;
  isPlaying.value = false;
  lastTimestamp = null;
}

function seekTo(t) {
  currentTime.value = t;
  isPlaying.value = false;
  lastTimestamp = null;
}

function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ── Modal Lifecycle ──────────────────────────────────────────

function show(gcode) {
  if (!modalEl.value) return;

  bsModal = new Modal(modalEl.value);

  modalEl.value.addEventListener('shown.bs.modal', () => {
    initScene(gcode);
    isPlaying.value = true;
    lastTimestamp = null;
  }, { once: true });

  modalEl.value.addEventListener('hidden.bs.modal', () => {
    cleanup();
  }, { once: true });

  bsModal.show();
}

function cleanup() {
  isPlaying.value = false;
  if (animationId) { cancelAnimationFrame(animationId); animationId = null; }
  if (resizeObserver) { resizeObserver.disconnect(); resizeObserver = null; }
  if (renderer) {
    renderer.dispose();
    renderer.domElement?.remove();
    renderer = null;
  }
  if (scene) {
    scene.traverse(obj => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        mats.forEach(m => m.dispose());
      }
    });
    scene = null;
  }
  controls = null;
  camera = null;
  ironGroup = null;
  tipMat = null;
  tipLight = null;
  shadowDisc = null;
  timeline = [];
}

onBeforeUnmount(cleanup);

defineExpose({ show });
</script>

<style scoped>
.simulator-viewport {
  width: 100%;
  min-height: 0;
  overflow: hidden;
}

.simulator-controls .form-range {
  accent-color: #44bb66;
}

.simulator-controls .form-range::-webkit-slider-runnable-track {
  height: 6px;
  border-radius: 3px;
  background: #444;
}

.simulator-controls .form-range::-webkit-slider-thumb {
  width: 16px;
  height: 16px;
  margin-top: -5px;
}
</style>
