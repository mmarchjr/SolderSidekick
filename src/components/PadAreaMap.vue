<template>
  <div class="pad-area-map-wrapper">
    <div class="pad-area-map-legend mb-2" v-if="legendEntries.length > 0">
      <div class="fw-semibold small mb-1">Legend (area)</div>
      <div class="d-flex flex-wrap gap-2">
        <div v-for="entry in legendEntries" :key="entry.label" class="d-flex align-items-center gap-1">
          <span class="legend-swatch" :style="{ backgroundColor: entry.color }"></span>
          <span class="small">{{ entry.label }} mm²: {{ entry.count }}</span>
        </div>
      </div>
    </div>
    <div v-else class="text-muted small fst-italic mb-2">No holes above current via filter.</div>

    <div class="pad-area-map-canvas-container" ref="containerRef">
      <canvas
        ref="canvasRef"
        class="pad-area-map-canvas"
        @wheel.prevent="handleZoom"
        @mousedown="handleMouseDown"
        @mousemove="handleMouseMove"
        @mouseup="handleMouseUp"
        @mouseleave="handleMouseUp"
        @contextmenu.prevent
      ></canvas>
      <button class="btn btn-sm btn-outline-dark pad-area-map-reset" @click="fitToPads" title="Reset view">
        <i class="fa-solid fa-expand"></i>
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from "vue";
import { useDrillStore } from "@/stores/store";

const drillStore = useDrillStore();
const canvasRef = ref(null);
const containerRef = ref(null);

const viewScale = ref(1);
const viewOffsetX = ref(0);
const viewOffsetY = ref(0);
let isPanning = false;
let panStartX = 0;
let panStartY = 0;

const PALETTE = [
  "#e6194b", "#3cb44b", "#4363d8", "#f58231", "#911eb4",
  "#42d4f4", "#f032e6", "#bfef45", "#fabed4", "#469990",
  "#dcbeff", "#9A6324", "#800000", "#aaffc3", "#808000",
  "#ffd8b1", "#000075", "#a9a9a9", "#000000", "#e6beff",
];

function parseDiameter(sizeValue) {
  if (typeof sizeValue === "number") return Number.isFinite(sizeValue) ? sizeValue : NaN;
  if (typeof sizeValue !== "string") return NaN;
  const match = sizeValue.match(/[\d.]+/);
  return match ? Number(match[0]) : NaN;
}

const padData = computed(() => {
  const result = [];
  for (const pcb of drillStore.pcbs) {
    const viaFilter = pcb.viaFilterDiameter ?? 0.4;
    for (const d of pcb.drillData) {
      if (!d.solder) continue;
      const diameter = parseDiameter(d.size);
      if (!Number.isFinite(diameter) || diameter <= viaFilter) continue;
      result.push({ pcb, drill: d, diameter });
    }
  }
  return result;
});

const uniqueDiameters = computed(() => {
  const set = new Set(padData.value.map(p => p.diameter));
  return [...set].sort((a, b) => a - b);
});

const diameterColorMap = computed(() => {
  const map = new Map();
  uniqueDiameters.value.forEach((d, i) => {
    map.set(d, PALETTE[i % PALETTE.length]);
  });
  return map;
});

const legendEntries = computed(() => {
  const counts = new Map();
  for (const p of padData.value) {
    counts.set(p.diameter, (counts.get(p.diameter) || 0) + 1);
  }
  return uniqueDiameters.value.map(d => {
    const area = Math.PI * Math.pow(d / 2, 2);
    const areaStr = area.toFixed(area % 1 === 0 ? 0 : (area * 10 % 1 === 0 ? 1 : 2));
    return {
      label: areaStr,
      color: diameterColorMap.value.get(d),
      count: counts.get(d) || 0,
      diameter: d,
    };
  });
});

const getDiameter = (sizeString) => {
  if (!sizeString) return 0;
  const match = sizeString.match(/[\d.]+/);
  return match ? parseFloat(match[0]) : 0;
};

function computePadBounds() {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let hasPads = false;

  for (const pcb of drillStore.pcbs) {
    const viaFilter = pcb.viaFilterDiameter ?? 0.4;
    const angle = -(pcb.rotation * Math.PI) / 180;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    for (const d of pcb.drillData) {
      if (!d.solder) continue;
      const diameter = getDiameter(d.size);
      if (diameter <= viaFilter) continue;

      const bx = d.x * cos - d.y * sin + pcb.originOffsetX;
      const by = d.x * sin + d.y * cos + pcb.originOffsetY;
      const r = diameter / 2;

      minX = Math.min(minX, bx - r);
      maxX = Math.max(maxX, bx + r);
      minY = Math.min(minY, by - r);
      maxY = Math.max(maxY, by + r);
      hasPads = true;
    }
  }

  return hasPads ? { minX, minY, maxX, maxY } : null;
}

function fitToPads() {
  const container = containerRef.value;
  if (!container) return;

  const cw = container.clientWidth;
  const ch = container.clientHeight;
  const bounds = computePadBounds();

  if (!bounds) {
    viewScale.value = 1;
    viewOffsetX.value = cw / 2;
    viewOffsetY.value = ch / 2;
    drawPadMap();
    return;
  }

  const padW = bounds.maxX - bounds.minX;
  const padH = bounds.maxY - bounds.minY;
  const padCenterX = (bounds.minX + bounds.maxX) / 2;
  const padCenterY = (bounds.minY + bounds.maxY) / 2;
  const padMargin = Math.max(padW, padH) * 0.15 || 2;

  const viewW = padW + padMargin * 2;
  const viewH = padH + padMargin * 2;

  const scaleX = cw / viewW;
  const scaleY = ch / viewH;
  viewScale.value = Math.min(scaleX, scaleY);
  viewOffsetX.value = cw / 2 - padCenterX * viewScale.value;
  viewOffsetY.value = ch / 2 + padCenterY * viewScale.value;

  drawPadMap();
}

const drawGrid = (ctx, w, h, spacing) => {
  ctx.save();
  ctx.strokeStyle = "#d9d9d9";
  ctx.lineWidth = 0.5;

  for (let x = 0; x <= w; x += spacing) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, -h);
    ctx.stroke();
  }
  for (let y = 0; y <= h; y += spacing) {
    ctx.beginPath();
    ctx.moveTo(0, -y);
    ctx.lineTo(w, -y);
    ctx.stroke();
  }
  ctx.restore();
};

const drawPadMap = () => {
  const canvas = canvasRef.value;
  const container = containerRef.value;
  if (!canvas || !container) return;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  const cw = container.clientWidth;
  const ch = container.clientHeight;

  canvas.width = cw * dpr;
  canvas.height = ch * dpr;
  canvas.style.width = cw + "px";
  canvas.style.height = ch + "px";

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.scale(dpr, dpr);

  const bedWidth = drillStore.currentBedWidth;
  const bedHeight = drillStore.currentBedHeight;
  const scale = viewScale.value;
  const offsetX = viewOffsetX.value;
  const offsetY = viewOffsetY.value;

  const bounds = computePadBounds();
  if (!bounds) {
    ctx.fillStyle = "#c9c9c9";
    ctx.fillRect(0, 0, cw, ch);
    ctx.fillStyle = "#666";
    ctx.font = "14px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("No solder pads to display", cw / 2, ch / 2);
    return;
  }

  ctx.save();
  ctx.translate(offsetX, offsetY);
  ctx.scale(scale, scale);

  ctx.fillStyle = "#c9c9c9";
  ctx.fillRect(0, -bedHeight, bedWidth, bedHeight);
  ctx.strokeStyle = "#bbb";
  ctx.lineWidth = 1 / scale;
  ctx.strokeRect(0, -bedHeight, bedWidth, bedHeight);

  for (const pcb of drillStore.pcbs) {
    ctx.save();
    ctx.translate(pcb.originOffsetX, -pcb.originOffsetY);
    ctx.rotate((pcb.rotation * Math.PI) / 180);

    const viaFilter = pcb.viaFilterDiameter ?? 0.4;
    for (const d of pcb.drillData) {
      if (!d.solder) continue;
      const diameter = getDiameter(d.size);
      if (diameter <= viaFilter) continue;
      const color = diameterColorMap.value.get(diameter);
      if (!color) continue;

      const r = diameter / 2;
      ctx.beginPath();
      ctx.arc(d.x, -d.y, r, 0, 2 * Math.PI);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = "#000";
      ctx.lineWidth = 0.5 / scale;
      ctx.stroke();
    }

    ctx.restore();
  }

  ctx.restore();
};

function handleZoom(e) {
  const canvas = canvasRef.value;
  if (!canvas) return;

  const rect = canvas.getBoundingClientRect();
  const mouseX = e.clientX - rect.left;
  const mouseY = e.clientY - rect.top;

  const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
  const newScale = viewScale.value * zoomFactor;

  viewOffsetX.value = mouseX - (mouseX - viewOffsetX.value) * zoomFactor;
  viewOffsetY.value = mouseY - (mouseY - viewOffsetY.value) * zoomFactor;
  viewScale.value = newScale;

  drawPadMap();
}

function handleMouseDown(e) {
  if (e.button === 2) {
    isPanning = true;
    panStartX = e.clientX;
    panStartY = e.clientY;
  }
}

function handleMouseMove(e) {
  if (!isPanning) return;
  const dx = e.clientX - panStartX;
  const dy = e.clientY - panStartY;
  panStartX = e.clientX;
  panStartY = e.clientY;
  viewOffsetX.value += dx;
  viewOffsetY.value += dy;
  drawPadMap();
}

function handleMouseUp() {
  isPanning = false;
}

const resizeObserver = ref(null);

onMounted(() => {
  nextTick(() => {
    fitToPads();
    if (containerRef.value) {
      resizeObserver.value = new ResizeObserver(() => fitToPads());
      resizeObserver.value.observe(containerRef.value);
    }
  });
});

onBeforeUnmount(() => {
  if (resizeObserver.value) resizeObserver.value.disconnect();
});

let pendingFit = false;
watch(
  () => [drillStore.pcbs, drillStore.viaFilterDiameter, drillStore.currentBedWidth, drillStore.currentBedHeight],
  () => {
    if (!pendingFit) {
      pendingFit = true;
      nextTick(() => {
        pendingFit = false;
        fitToPads();
      });
    }
  },
  { deep: true }
);

watch(
  () => drillStore.activePcbId,
  () => nextTick(fitToPads)
);
</script>

<style scoped>
.pad-area-map-canvas-container {
  position: relative;
  width: 100%;
  height: 220px;
  min-width: 300px;
  border: 1px solid #dee2e6;
  border-radius: 0.375rem;
  background: #fff;
  overflow: hidden;
}

.pad-area-map-canvas {
  display: block;
  width: 100%;
  height: 100%;
  cursor: grab;
}

.pad-area-map-canvas:active {
  cursor: grabbing;
}

.pad-area-map-reset {
  position: absolute;
  bottom: 6px;
  right: 6px;
  z-index: 10;
  padding: 2px 6px;
  font-size: 0.75rem;
}

.pad-area-map-legend {
  flex-shrink: 0;
}

.legend-swatch {
  display: inline-block;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 1px solid #333;
  flex-shrink: 0;
}
</style>
