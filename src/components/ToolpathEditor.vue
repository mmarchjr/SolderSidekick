<template>

    <div class="row toolpath-layout gx-3">

      <div class="col-lg-7 position-relative canvas-wrapper"
        @dragover.prevent
        @drop.prevent="handleCanvasDrop"
      >

<div class="container topbar-overlay d-flex">
  <div class="row">

  <div class="mb-3 d-flex align-items-center pcb-controls">
      <label class="form-label">PCB Offset (mm) <i class="fas fa-arrows-alt-h pcb-icon"></i></label>
      <input type="number" class="form-control d-inline w-auto pcb-input" v-model.number="drillStore.originOffsetX" @input="saveOffsetUndoState(); updateCanvas()">
      <label class="form-label"><i class="fas fa-arrows-alt-v pcb-icon"></i></label>
      <input type="number" class="form-control d-inline w-auto pcb-input" v-model.number="drillStore.originOffsetY"@input="saveOffsetUndoState(); updateCanvas()">

      <label class="form-label pcb-section">Rotate</label>
      <button class="btn btn-outline-secondary" @click="rotateAndSave(-90)">
        <i class="fa-solid fa-rotate-left"></i>
      </button>
      <button class="btn btn-outline-secondary" @click="rotateAndSave(90)">
        <i class="fa-solid fa-rotate-right"></i>
      </button>


      <label class="form-label mw-5 pcb-section">Flip</label>
      <button class="btn btn-outline-secondary" @click="mirrorHorizontal"><i class="fa-solid fa-right-left"></i></button>
      <button class="btn btn-outline-secondary" @click="mirrorVertical"><i class="fa-solid fa-right-left r90"></i></button>

      <label class="form-label pcb-section">Via Filter (mm) <i class="fas fa-filter"></i></label>
      <input type="number" class="form-control d-inline w-auto pcb-input" v-model.number="drillStore.viaFilterDiameter" step="0.1" min="0" @input="updateCanvas()">

    </div>

    <!-- Toolbar -->
    <div class="toolbar d-flex align-items-center mb-3">
      <button class="btn btn-primary" @click="autoOptimizePath"><i class="fa-solid fa-wand-magic-sparkles"></i> Auto Optimize Path</button>
      <button class="btn btn-secondary" @click="optimizeSelected"><i class="fa-solid fa-border-all"></i> Optimize Selection</button>

      <button class="btn" :class="isDrawingNoGoZone ? 'btn-danger' : 'btn-outline-danger'" @click="toggleNoGoZoneMode">
        <i class="fa-solid fa-ban"></i> No-Go Zone
      </button>
      <select v-if="isDrawingNoGoZone" v-model="noGoZoneMode" class="form-select form-select-sm d-inline-block w-auto ms-1">
        <option value="global">Global (Bed)</option>
        <option value="perpcb">Per-PCB</option>
      </select>

      <label class="form-label">Solder</label>
      <button class="btn btn-success" @click="setSelectedSolder(true)"><i class="fa-solid fa-check"></i></button>
      <button class="btn btn-secondary" @click="setSelectedSolder(false)"><i class="fa-solid fa-xmark"></i></button>

      <button class="btn btn-outline-danger" @click="clearPath"><i class="fa-solid fa-trash"></i> Clear Path</button>
      <button class="btn btn-outline-dark" @click="undo"><i class="fa-solid fa-rotate-left"></i> Undo</button>
      <button class="btn btn-outline-dark" @click="redo"><i class="fa-solid fa-rotate-right"></i> Redo</button>
    </div>
  </div>
</div>
        <canvas
          ref="canvas"
          class="toolpath-canvas"
          :class="{ 'nogo-cursor': isDrawingNoGoZone }"
          @mousedown="handleMouseDown"
          @mousemove="handleMouseMove"
          @mouseup="handleMouseUp"
          @wheel.prevent="handleZoom"
          @contextmenu.prevent
        ></canvas>
        <div class="editor-instructions">
          <transition name="fade" mode="out-in">
            <div
              class="editor-label"
              v-html="editorLabels[currentLabelIndex].html"
              :key="currentLabelIndex"
            />
          </transition>

          <button class="btn btn-outline-dark fixed-help-button" @click="$refs.introModal.show()">
            <i class="fas fa-question-circle"></i> Getting Started
          </button>
        </div>


      </div>

      <div class="col-lg-5 position-relative right-panel">

        <div class="align-items-center">
  <div class="mx-3 my-2">

    <div class="profile-content" v-if="!showOriginCalculator">
    <div class="d-flex align-items-center my-2">
      <label class="form-label profile-label me-2">Machine Profile</label>
      <ProfileManager />
    </div>

    <!-- PCB Tray List -->
    <div class="pcb-tray-section mb-3">
      <div class="d-flex align-items-center justify-content-between mb-1">
        <label class="form-label profile-label mb-0">PCB Tray</label>
        <div>
          <button class="btn btn-sm btn-outline-primary" @click="openFileDialog" title="Add PCB">
            <i class="fa-solid fa-plus"></i> Add
          </button>
          <button class="btn btn-sm btn-outline-danger ms-1" @click="clearAllPcbs" title="Clear All PCBs" :disabled="drillStore.pcbs.length === 0">
            <i class="fa-solid fa-trash"></i> Clear
          </button>
        </div>
      </div>
      <div class="pcb-list" v-if="drillStore.pcbs.length > 0">
        <div
          v-for="(pcb, idx) in drillStore.pcbs"
          :key="pcb.id"
          class="pcb-list-item d-flex align-items-center"
          :class="{ active: pcb.id === drillStore.activePcbId }"
          draggable="true"
          @click="drillStore.setActivePcb(pcb.id); updateCanvas()"
          @contextmenu.prevent="showPcbContextMenu($event, idx)"
          @dragstart="onPcbDragStart(idx, $event)"
          @dragover.prevent="onPcbDragOver(idx, $event)"
          @drop="onPcbDrop(idx, $event)"
          @dragend="onPcbDragEnd"
        >
          <i class="fa-solid fa-grip-vertical me-1 text-muted" style="cursor: grab;"></i>
          <i class="fa-solid fa-file-lines me-2 text-muted"></i>
          <span class="pcb-name text-truncate">{{ pcb.filename || 'Untitled' }}</span>
          <span class="badge bg-secondary me-1">{{ pcb.drillData.length }}</span>
          <button class="btn btn-sm btn-link p-0 text-decoration-none" @click.stop="drillStore.setActivePcb(pcb.id); toggleOriginCalculator()" title="Calculate PCB Offset">
            <i class="fa-solid fa-crosshairs"></i>
          </button>
        </div>
      </div>
      <div v-else class="text-muted small fst-italic">No PCBs loaded</div>

      <!-- Context Menu -->
      <div v-if="pcbContextMenu.show" class="pcb-context-menu" :style="{ top: pcbContextMenu.y + 'px', left: pcbContextMenu.x + 'px' }">
        <button class="dropdown-item" @click="duplicatePcbFromMenu"><i class="fa-solid fa-copy me-2"></i>Duplicate</button>
        <button class="dropdown-item text-danger" @click="removePcbFromMenu"><i class="fa-solid fa-trash me-2"></i>Delete</button>
      </div>
    </div>

    <!-- Per-PCB Properties Panel -->
    <div v-if="drillStore.activePcb" class="pcb-properties-section mb-3">
      <label class="form-label profile-label">PCB Properties</label>
      <div class="small">
        <div class="d-flex align-items-center mb-1">
          <span class="text-muted me-2" style="min-width:70px;">File:</span>
          <span class="text-truncate">{{ drillStore.activePcb.filename || 'Untitled' }}</span>
        </div>
        <div class="d-flex align-items-center mb-1">
          <span class="text-muted me-2" style="min-width:70px;">Holes:</span>
          <span>{{ drillStore.activePcb.drillData.length }}</span>
        </div>
        <div class="d-flex align-items-center mb-1">
          <label class="text-muted me-2 mb-0" style="min-width:70px;">Offset X:</label>
          <input type="number" class="form-control form-control-sm d-inline w-auto" v-model.number="drillStore.originOffsetX" step="0.5" @input="saveOffsetUndoState(); updateCanvas()">
        </div>
        <div class="d-flex align-items-center mb-1">
          <label class="text-muted me-2 mb-0" style="min-width:70px;">Offset Y:</label>
          <input type="number" class="form-control form-control-sm d-inline w-auto" v-model.number="drillStore.originOffsetY" step="0.5" @input="saveOffsetUndoState(); updateCanvas()">
        </div>
        <div class="d-flex align-items-center mb-1">
          <label class="text-muted me-2 mb-0" style="min-width:70px;">Offset Z:</label>
          <input type="number" class="form-control form-control-sm d-inline w-auto" v-model.number="drillStore.originOffsetZ" step="0.5">
          <span class="ms-1">mm</span>
        </div>
        <div class="d-flex align-items-center mb-1">
          <label class="text-muted me-2 mb-0" style="min-width:70px;">Rotation:</label>
          <input type="number" class="form-control form-control-sm d-inline w-auto" v-model.number="drillStore.rotation" step="90" @change="updateCanvas()">
          <span class="ms-1">°</span>
        </div>
        <div class="d-flex align-items-center mb-1">
          <label class="text-muted me-2 mb-0" style="min-width:70px;">Thickness:</label>
          <input type="number" class="form-control form-control-sm d-inline w-auto" v-model.number="pcbThickness" step="0.1">
          <span class="ms-1">mm</span>
        </div>
        <div class="d-flex align-items-center mb-1">
          <label class="text-muted me-2 mb-0" style="min-width:70px;">Via Filter:</label>
          <input type="number" class="form-control form-control-sm d-inline w-auto" v-model.number="drillStore.viaFilterDiameter" step="0.1" min="0" @input="updateCanvas()">
          <span class="ms-1">mm</span>
        </div>
        <div v-if="drillStore.activePcb.noGoZones.length > 0" class="mt-1">
          <span class="text-muted">No-Go Zones: {{ drillStore.activePcb.noGoZones.length }}</span>
        </div>
      </div>
    </div>

     <div class="my-2">
      <label class="form-label">PCB Thickness (mm) <i class="fas fa-layer-group"></i></label>
      <input
        type="number"
        class="form-control d-inline w-auto pcb-input ms-2"
        step="0.1"
        v-model.number="pcbThickness"
      />
    </div>

    

    <div v-if="zeroX === null || zeroY === null || zeroZ === null" class="measure-note my-1">
      <p class="text-muted">Measure/enter the origin offset for your machine</p>
    </div>

    </div>

    <div class="origin-calculator" v-if="showOriginCalculator">
    <button class="btn btn-outline-dark close-calculator" @click="closeCalculator"><i class="fa-solid fa-xmark"></i></button>
    <h3>Select a Point</h3>
    <p>Move 3D printer to selected point, enter machine X, Y, Z position</p>
    <div class="d-flex align-items-center sidebar-home-origin my-2">
      <label class="form-label profile-label">Machine X</label>
      <input type="number" class="form-control d-inline w-auto ms-2" v-model="pointX" step="0.01"/>
      <label class="form-label profile-label mw-1">Y</label>
      <input type="number" class="form-control d-inline w-auto ms-1" v-model="pointY" step="0.01"/>
      <label class="form-label profile-label mw-1">Z</label>
      <input type="number" class="form-control d-inline w-auto ms-1" v-model="pointZ" step="0.01"/>
    </div>
    
    <button class="btn btn-outline-dark my-1" @click="calculateOrigin"><i class="fa-solid fa-calculator"></i> Calculate PCB Offset</button>
    </div>


    

    
  </div>
</div>
       

      <div class="scrolling-table">
        <table class="table table-sm table-striped">
          <thead class="table-dark">
            <tr>
              <th title="Should the point be soldered?"><i class="fa-solid fa-fire"></i></th>
              <th title="The order in which the point will be soldered">#</th>
              <th title="X position in mm">X</th>
              <th title="Y position in mm">Y</th>
              <th title="Hole diameter (mm)"><i class="fas fa-circle"></i></th>
              <th title="Pad area (mm²) — used for spline graph lookup">Area</th>
              <th title="X offset (mm) from drill point"><i class="fas fa-arrows-alt-h"></i> X</th>
              <th title="Y offset (mm) from drill point"><i class="fas fa-arrows-alt-v"></i> Y</th>
              <th title="Z offset (mm) from top of PCB surface"><i class="fa-solid fa-layer-group"></i> Z</th>
            </tr>
          </thead>
          
          <tbody>
            <tr
              v-for="(hole, index) in sortedDrillData"
              :key="hole.id"
              :class="{ 'table-primary': hole.selected }"
              @click="(e) => toggleSelect(hole.id, index, e)"

            >
              <td class="checkbox-cell">
                <input type="checkbox" v-model="hole.solder" @change="onSolderToggle(hole)" />
              </td>
              <td><b>{{ hole.pathIndex !== null ? hole.pathIndex + 1 : '-' }}</b></td>
              <td>{{ hole.x.toFixed(1) }}</td>
              <td>{{ hole.y.toFixed(1) }}</td>
              <td>{{ getDiameter(hole.size) }}</td>
              <td>{{ getPadArea(hole.size).toFixed(1) }}</td>
              <td>
                <input
                  type="number"
                  class="form-control form-control-sm"
                  :value="hole.xOffset"
                  step="0.1"
                  style="max-width: 90px;"
                  @click.stop
                  @change="updateField(hole, 'xOffset', $event.target.valueAsNumber)"
                />
              </td>
               <td>
                <input
                  type="number"
                  class="form-control form-control-sm"
                  :value="hole.yOffset"
                  step="0.1"
                  style="max-width: 90px;"
                  @click.stop
                  @change="updateField(hole, 'yOffset', $event.target.valueAsNumber)"
                />
              </td>
               <td>
                <input
                  type="number"
                  class="form-control form-control-sm"
                  :value="hole.zOffset"
                  step="0.1"
                  style="max-width: 90px;"
                  @click.stop
                  @change="updateField(hole, 'zOffset', $event.target.valueAsNumber)"
                />
              </td>


            </tr>
          </tbody>

          
        </table>

        <div v-if="drillStore.drillData.length === 0" class="m-3 p-3 text-center example-drill-file">
          <p class="mb-2"><b>Need an example drill file?</b></p>
          <button class="btn btn-outline-dark" @click="downloadExampleDrillFile">
            <i class="fa fa-download me-1"></i> Download PCB_breadboard.drl
          </button>
          <a href="https://github.com/RinthLabs/SolderSidekick/blob/main/Documentation.md" target="_blank" class="d-block mt-3">
            How to export drill file
          </a>
        </div>
      </div>

      <div class="bottom-button-container d-flex">
  <button class="simulate-button btn btn-primary" @click="openSimulator">
    <i class="fa-solid fa-play me-1"></i> Simulate
  </button>
  <button class="save-button btn btn-success" @click="saveGcode">
    <i class="fa-solid fa-save me-1"></i> Save G-code
  </button>
      </div>



</div>
    </div>

<GcodeSimulator ref="simulatorRef" />
<ImportWizard ref="importWizardRef" />
</template>

<script setup>
import { ref, computed, onMounted, watch, onBeforeUnmount, nextTick  } from "vue";
import GcodeSimulator from "@/components/GcodeSimulator.vue";
import ImportWizard from "@/components/ImportWizard.vue";
import ProfileManager from '@/components/ProfileManager.vue';
import { useDrillStore } from "@/stores/store";
import { useFileHandlers } from "@/composables/useFileHandlers";
import { useGcodeGenerator } from "@/composables/useGcodeGenerator";
const { parseDrillFile, parseProjectFile, saveProject } = useFileHandlers();
const { generateGcode, saveGcodeFile } = useGcodeGenerator();


const drillStore = useDrillStore();
const canvas = ref(null);
const simulatorRef = ref(null);
const importWizardRef = ref(null);

// Profile selection
const selectedProfile = computed({
  get: () => drillStore.currentProfile,
  set: (val) => drillStore.setCurrentProfile(val)
});


// Homing inputs
const homeX = computed({
  get: () => drillStore.profiles[drillStore.currentProfile].homeX,
  set: (val) => drillStore.updateCurrentProfileSettings({ homeX: val })
});
const homeY = computed({
  get: () => drillStore.profiles[drillStore.currentProfile].homeY,
  set: (val) => drillStore.updateCurrentProfileSettings({ homeY: val })
});
const homeZ = computed({
  get: () => drillStore.profiles[drillStore.currentProfile].homeZ,
  set: (val) => drillStore.updateCurrentProfileSettings({ homeZ: val })
});

let pendingRenderFrame = null;


const editorLabels = ref([
  { html: '<img src="/mouse-right.svg" alt="Right Click Mouse">+ <b>Drag to Pan</b>' },
  { html: '<img src="/mouse-middle.svg" alt="Middle Mouse Scroll"> to <b>Zoom</b>' },
  { html: '<img src="/mouse-left.svg" alt="Left Click Mouse"> to <b>Add Point to Toolpath</b>' },
  { html: '<span class="key-icon">Ctrl</span> +<img src="/mouse-left.svg" alt="Left Click Mouse"> to <b>Remove Points from Path</b>' },
  { html: '<img src="/mouse-left.svg" alt="Left Click Mouse"> <b>Drag to Box Select</b>' },
  { html: '<img src="/mouse-left.svg" alt="Left Click Mouse"> drag <img src="/origin-icon.svg" alt="Origin Icon"> to <b>Position PCB</b>' },
  { html: '<i class="fa-solid fa-ban" style="color:red"></i> <b>No-Go Zones</b> exclude areas from Auto Optimize' },
]);

const currentLabelIndex = ref(0);
const lastSelectedIndex = ref(null);


let ctx, scale = 1, offsetX = 0, offsetY = 0;

const radius = 4;

let isPanning = false;
let startX = 0;
let startY = 0;

let isSelecting = false;
let selectionStart = null;
let selectionEnd = null;

let isDraggingOrigin = false;
let dragOriginStart = null;

const isDrawingNoGoZone = ref(false);
const noGoZoneMode = ref("global"); // "global" or "perpcb"
let isDrawingNoGoRect = false;
let noGoZoneStart = null;
let noGoZoneEnd = null;
let resizingZone = null;

// Origin calculator state
const showOriginCalculator = ref(false);
const pointX = ref(null);
const pointY = ref(null);
const pointZ = ref(null);
const isSelectingOriginPoint = ref(false);
const selectedOriginPoint = ref(null);

const pcbThickness = computed({
  get: () => drillStore.profiles[drillStore.currentProfile].pcbThickness ?? drillStore.pcbThickness,
  set: (val) => {
    drillStore.saveTransformUndoState();
    drillStore.updateCurrentProfileSettings({ pcbThickness: val });
    drillStore.pcbThickness = val; // Also update store level
    updateCanvas();
  }
});

const saveGcode = () => {
  try {
    const solderPoints = drillStore.drillData.filter(d => d.solder && drillStore.path.includes(d.id));
    
    if (solderPoints.length === 0) {
      alert("No solder points selected! Please select points to solder.");
      return;
    }
    const gcode = generateGcode();
    saveGcodeFile(gcode);
    console.log("G-code saved successfully!");
  } catch (error) {
    console.error("Error generating G-code:", error);
    alert(`Error generating G-code: ${error.message}`);
  }
};

const openSimulator = () => {
  try {
    const solderPoints = drillStore.drillData.filter(d => d.solder && drillStore.path.includes(d.id));
    if (solderPoints.length === 0) {
      alert("No solder points selected! Please select points to solder.");
      return;
    }
    const gcode = generateGcode();
    simulatorRef.value.show(gcode);
  } catch (error) {
    console.error("Error opening simulator:", error);
    alert(`Error: ${error.message}`);
  }
};

const openFileDialog = () => {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".drl,.txt,.json,.zip";
  input.onchange = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const ext = file.name.split('.').pop().toLowerCase();
    if (ext === "json") {
      parseProjectFile(file);
    } else if (ext === "zip") {
      if (importWizardRef.value) {
        importWizardRef.value.openZipFile(file);
      }
    } else {
      parseDrillFile(file);
    }
  };
  input.click();
};


const fitCanvasToBuildPlate = () => {
  const canvasEl = canvas.value;
  if (!canvasEl) return;

  const screenWidth = canvasEl.width / (window.devicePixelRatio || 1);
  const screenHeight = canvasEl.height / (window.devicePixelRatio || 1);

  // 10% padding around the build plate
  const padding = 0.1;
  const bedWidth = drillStore.currentBedWidth;
  const bedHeight = drillStore.currentBedHeight;

  const scaleX = screenWidth / (bedWidth * (1 + padding));
  const scaleY = screenHeight / (bedHeight * (1 + padding));
  scale = Math.min(scaleX, scaleY);

  // Center the build plate in the view
  offsetX = screenWidth / 2 - (bedWidth * scale) / 2;
  offsetY = screenHeight / 2 + (bedHeight * scale) / 2;

  updateCanvas();
};


const resizeCanvas = () => {
  const canvasEl = canvas.value;
  if (!canvasEl) return;

  const dpr = window.devicePixelRatio || 1;
  const width = canvasEl.parentElement.clientWidth;
  const height = window.innerHeight * 1.0;
  // const height = window.innerHeight * 1.0;

  canvasEl.width = width * dpr;
  canvasEl.height = height * dpr;
  canvasEl.style.width = width + "px";
  canvasEl.style.height = height + "px";

  ctx.setTransform(1, 0, 0, 1, 0, 0); // reset transform
  ctx.scale(dpr, dpr);

  offsetX = width / 3;
  offsetY = height * 0.75;

  updateCanvas();
};

watch(
  () => drillStore.canvasShouldUpdate,
  (val) => {
    if (val) {
      updateCanvas();
      drillStore.acknowledgeCanvasUpdate(); // ✅ reset the flag
    }
  }
);

onBeforeUnmount(() => {
  window.removeEventListener("resize", resizeCanvas);
  window.removeEventListener("keydown", handleKeyDown);
  window.removeEventListener("mousedown", handleWindowMouseDown);
  window.removeEventListener("mouseup", handleWindowMouseUp);
  window.removeEventListener("mousemove", handleWindowMouseMove);
  document.removeEventListener("click", hidePcbContextMenu);
});


onMounted(async () => {
  console.log('[canvas] MOUNTED canvas=', !!canvas.value);
  const canvasEl = canvas.value;
  if (!canvasEl) return;
  ctx = canvasEl.getContext("2d");
  console.log('[canvas] CTX SET', !!ctx);

  if (!drillStore.profiles[selectedProfile.value]) {
    drillStore.initProfiles();
  }
  const s = drillStore.profiles[selectedProfile.value] || {};

  resizeCanvas();          // sets canvas size and devicePixelRatio
  fitCanvasToBuildPlate(); // zooms and centers based on build plate

  // Ensure layout is settled before final fit
  await nextTick();
  resizeCanvas();
  fitCanvasToBuildPlate();

  window.addEventListener("resize", () => {
    resizeCanvas();
    fitCanvasToBuildPlate(); // re-fit on resize too
  });

  const handleKeyDown = (e) => {
    if (e.ctrlKey || e.metaKey) {
      switch (e.key.toLowerCase()) {
        case 'z':
          e.preventDefault();
          undo();
          break;
        case 'y':
          e.preventDefault();
          redo();
          break;
        case 's':
          e.preventDefault();
          saveProject();
          break;
        case 'o':
          e.preventDefault();
          openFileDialog();
          break;
      }
    }
  };

  window.addEventListener("keydown", handleKeyDown);

  const handleWindowMouseDown = (e) => {
    if (e.shiftKey) {
      document.body.classList.add("prevent-select");
    }
  };
  const handleWindowMouseUp = () => {
    if (isPanning) console.log('[canvas] PAN END');
    document.body.classList.remove("prevent-select");
    isPanning = false;
  };
  const handleWindowMouseMove = (e) => {
    if (isPanning) {
      console.log('[canvas] PAN MOVE dx=', e.clientX - startX, 'dy=', e.clientY - startY);
      offsetX += e.clientX - startX;
      offsetY += e.clientY - startY;
      startX = e.clientX;
      startY = e.clientY;
      updateCanvas();
    }
  };
  window.addEventListener("mousedown", handleWindowMouseDown);
  window.addEventListener("mouseup", handleWindowMouseUp);
  window.addEventListener("mousemove", handleWindowMouseMove);

  document.addEventListener("click", hidePcbContextMenu);

  setInterval(() => {
    currentLabelIndex.value = (currentLabelIndex.value + 1) % editorLabels.value.length;
  }, 6000); // 3 seconds per label

});


const updateField = (hole, field, value) => {
  drillStore.addUndoSnapshot(drillStore._takeSnapshot());
  drillStore.redoStack = [];

  hole[field] = value;

  drillStore.drillData.forEach(d => {
    if (d.selected && d.id !== hole.id) {
      d[field] = value;
    }
  });

  updateCanvas();
};


const rotateAndSave = (angleDelta) => {
  drillStore.saveTransformUndoState();
  drillStore.rotation = (drillStore.rotation + angleDelta + 360) % 360;
  updateCanvas();
};

const saveOffsetUndoState = () => {
  drillStore.addUndoSnapshot(drillStore._takeSnapshot());
  drillStore.redoStack = [];
};

const toggleOriginCalculator = () => {
  showOriginCalculator.value = true;
  isSelectingOriginPoint.value = true;
  selectedOriginPoint.value = null;
  // Clear any existing selections
  drillStore.drillData.forEach(d => d.selected = false);
  updateCanvas();
};

const closeCalculator = () => {
  showOriginCalculator.value = false;
  isSelectingOriginPoint.value = false;
  selectedOriginPoint.value = null;
  pointX.value = null;
  pointY.value = null;
  pointZ.value = null;
  updateCanvas();
};

const calculateOrigin = () => {
  if (!selectedOriginPoint.value || pointX.value === null || pointY.value === null || pointZ.value === null) {
    alert("Please select a point on the PCB and enter the machine X, Y, Z coordinates");
    return;
  }

  const pcb = drillStore.activePcb;
  if (!pcb) return;
  const selectedDrill = pcb.drillData.find(d => d.id === selectedOriginPoint.value);
  if (!selectedDrill) return;

  // Rotate the drill point (no offset yet — we're solving for it)
  const rad = -(pcb.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const rotatedX = selectedDrill.x * cos - selectedDrill.y * sin;
  const rotatedY = selectedDrill.x * sin + selectedDrill.y * cos;

  // machine coords = rotated + offset → offset = machine - rotated
  const newOffsetX = pointX.value - rotatedX;
  const newOffsetY = pointY.value - rotatedY;

  // originOffsetZ = machine Z position
  const newOriginZoffset = pointZ.value;

  drillStore.saveTransformUndoState();
  pcb.originOffsetX = newOffsetX;
  pcb.originOffsetY = newOffsetY;
  pcb.originOffsetZ = newOriginZoffset;

  updateCanvas();
  closeCalculator();
};

const getTransformedCoordinates = (drill) => {
  // Match exactly how coordinates are transformed in the mouse handling code
  // This uses negative rotation because it's transforming from drill space to screen space
  const rad = -(drillStore.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  
  // Apply rotation first (matching the handleMouseDown logic)
  const rotatedX = drill.x * cos - drill.y * sin;
  const rotatedY = drill.x * sin + drill.y * cos;

  // Then apply offsets (translate after rotation)
  const x = rotatedX + drillStore.originOffsetX;
  const y = rotatedY + drillStore.originOffsetY;

  return { x, y };
};



const onSolderToggle = (hole) => {
  if (!hole.solder) {
    drillStore.removeFromPath(hole.id);
  } else {
    drillStore.addToPath(hole.id);
  }
  updateCanvas();
};


const setSelectedSolder = (state) => {
  drillStore.addUndoSnapshot(drillStore._takeSnapshot());
  drillStore.redoStack = [];

  drillStore.drillData.forEach(d => {
    if (d.selected) {
      d.solder = state;
      if (!state) {
        drillStore.removeFromPath(d.id);
      }
    }
  });
  updateCanvas();
};

const mirrorHorizontal = () => {
  drillStore.saveTransformUndoState();

  const newDrillData = drillStore.drillData.map(d => {
    // Flip X in base coordinate space (no rotation compensation)
    // Rotation will be applied separately during rendering and G-code generation
    return { ...d, x: -d.x };
  });

  drillStore.drillData = newDrillData;
  updateCanvas();
};


const mirrorVertical = () => {
  drillStore.saveTransformUndoState();

  const newDrillData = drillStore.drillData.map(d => {
    // Flip Y in base coordinate space (no rotation compensation)
    // Rotation will be applied separately during rendering and G-code generation
    return { ...d, y: -d.y };
  });

  drillStore.drillData = newDrillData;
  updateCanvas();
};





const drawClippedGrid = (ctx, width, height, spacing = 16, color = "#aaaaaa") => {
  ctx.save();

  // === Draw Clipped Grid Lines ===
  ctx.beginPath();
  ctx.rect(0, -height, width, height);
  ctx.clip();

  ctx.strokeStyle = color;
  ctx.lineWidth = 0.5 / scale;

  for (let x = 0; x <= width; x += spacing) {
    ctx.beginPath();
    ctx.moveTo(x, -height);
    ctx.lineTo(x, 0);
    ctx.stroke();
  }

  for (let y = 0; y <= height; y += spacing) {
    ctx.beginPath();
    ctx.moveTo(0, -y);
    ctx.lineTo(width, -y);
    ctx.stroke();
  }

  // Optional: Dotted circle grid
  const circleSpacing = 8;
  const circleRadius = 2.5;
  const offsetX = 4;
  const offsetY = 4;
  ctx.fillStyle = "#d0d0d0";

  for (let x = offsetX; x <= width; x += circleSpacing) {
    for (let y = offsetY; y <= height; y += circleSpacing) {
      ctx.beginPath();
      ctx.arc(x, -y, circleRadius, 0, 2 * Math.PI);
      ctx.fill();
    }
  }

  ctx.restore(); // ✨ Exit clipping before drawing labels

  // === Axis Labels ===
  ctx.save();
  ctx.font = `${10 / scale}px sans-serif`;
  ctx.fillStyle = "#000";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // X-axis labels (skip 0)
  for (let x = 0; x <= width; x += spacing) {
    if (x !== 0) {
      ctx.fillText(`${x}`, x, 6 / scale);
    }
  }

  // Y-axis labels (skip 0)
  ctx.textAlign = "right";
  for (let y = 0; y <= height; y += spacing) {
    if (y !== 0) {
      ctx.fillText(`${y}`, -6 / scale, -y);
    }
  }
  ctx.restore();
};


const updateCanvas = () => {
  if (!ctx) { console.log('[canvas] UPDATE BLOCKED - no ctx'); return; }
  if (pendingRenderFrame) { console.log('[canvas] UPDATE SKIPPED - pending frame'); return; }
  console.log('[canvas] UPDATE pcbs=', drillStore.pcbs.length, 'active=', drillStore.activePcbId);

  pendingRenderFrame = requestAnimationFrame(() => {
    pendingRenderFrame = null;
    const dpr = window.devicePixelRatio || 1;
    console.log('[canvas] RAF DRAW offsetX=', offsetX.toFixed(1), 'offsetY=', offsetY.toFixed(1), 'scale=', scale.toFixed(2), 'dpr=', dpr, 'cw=', canvas.value?.width, 'ch=', canvas.value?.height);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.value.width, canvas.value.height);
    ctx.scale(dpr, dpr);
  ctx.save();
  ctx.translate(offsetX, offsetY);
  ctx.scale(scale, scale);

  const bedWidth = drillStore.currentBedWidth;
  const bedHeight = drillStore.currentBedHeight;
  ctx.fillStyle = "#c9c9c9";
  ctx.fillRect(0, -bedHeight, bedWidth, bedHeight);

  drawClippedGrid(ctx, bedWidth, bedHeight, 16);

  drawNoGoZones(ctx);

  for (let pcbIdx = 0; pcbIdx < drillStore.pcbs.length; pcbIdx++) {
    const pcb = drillStore.pcbs[pcbIdx];
    const isActive = pcb.id === drillStore.activePcbId;
    const alpha = isActive ? 1.0 : 0.35;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(pcb.originOffsetX, -pcb.originOffsetY);
    ctx.rotate((pcb.rotation * Math.PI) / 180);

    ctx.strokeStyle = "magenta";
    ctx.lineWidth = 2 / scale;
    const originLength = 8;
    ctx.beginPath();
    ctx.moveTo(-originLength / scale, 0);
    ctx.lineTo(originLength / scale, 0);
    ctx.moveTo(0, -originLength / scale);
    ctx.lineTo(0, originLength / scale);
    ctx.stroke();

    drawPathLines(pcb);
    drawPcbOutline(pcb);
    drawDrillHoles(pcb);
    ctx.restore();
  }

  drawPathLabels();

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);
  ctx.save();
  const originX = offsetX;
  const originY = offsetY;

  ctx.strokeStyle = "blue";
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(originX - 16, originY);
  ctx.lineTo(originX + 16, originY);
  ctx.moveTo(originX, originY - 16);
  ctx.lineTo(originX, originY + 16);
  ctx.stroke();

  drawFixedArrow(ctx, originX, originY, 60, 0, "red");
  drawFixedArrow(ctx, originX, originY, 0, -60, "green");

  ctx.restore();

  drawSelectionBox();
});

};


const drawNoGoZones = (ctx) => {
  const zones = [...drillStore.globalNoGoZones];

  const activePcb = drillStore.activePcb;
  if (activePcb) {
    for (const z of activePcb.noGoZones) {
      zones.push(z);
    }
  }

  if (isDrawingNoGoRect && noGoZoneStart && noGoZoneEnd) {
    zones.push({
      id: 'preview',
      x1: Math.min(noGoZoneStart.x, noGoZoneEnd.x),
      y1: Math.min(noGoZoneStart.y, noGoZoneEnd.y),
      x2: Math.max(noGoZoneStart.x, noGoZoneEnd.x),
      y2: Math.max(noGoZoneStart.y, noGoZoneEnd.y),
    });
  }

  if (zones.length === 0) return;

  const editMode = isDrawingNoGoZone.value;

  for (const z of zones) {
    const x = z.x1;
    const y = -z.y2;
    const w = z.x2 - z.x1;
    const h = z.y2 - z.y1;

    ctx.save();

    ctx.fillStyle = "rgba(255, 60, 60, 0.18)";
    ctx.fillRect(x, y, w, h);

    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();

    ctx.strokeStyle = "rgba(255, 60, 60, 0.35)";
    ctx.lineWidth = 1 / scale;
    const step = 4;
    for (let i = -Math.max(w, h); i < Math.max(w, h) * 2; i += step) {
      ctx.beginPath();
      ctx.moveTo(x + i, y);
      ctx.lineTo(x + i + h, y + h);
      ctx.stroke();
    }

    ctx.restore();

    ctx.strokeStyle = "rgba(220, 40, 40, 0.7)";
    ctx.lineWidth = 1.5 / scale;
    ctx.setLineDash([4 / scale, 3 / scale]);
    ctx.strokeRect(x, y, w, h);
    ctx.setLineDash([]);

    if (w * scale > 50 && h * scale > 20) {
      ctx.save();
      const fontSize = Math.min(12 / scale, h * 0.4, w * 0.2);
      ctx.font = `bold ${fontSize}px sans-serif`;
      ctx.fillStyle = "rgba(200, 30, 30, 0.6)";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("NO-GO", x + w / 2, y + h / 2);
      ctx.restore();
    }

    if (editMode && z.id !== 'preview') {
      const hs = 3.5 / scale;
      const cx = (z.x1 + z.x2) / 2;
      const cy = (z.y1 + z.y2) / 2;
      const handlePositions = [
        z.x1, z.y1, z.x2, z.y1, z.x1, z.y2, z.x2, z.y2,
        cx, z.y1, cx, z.y2, z.x1, cy, z.x2, cy,
      ];
      ctx.fillStyle = "rgba(255, 255, 255, 0.92)";
      ctx.strokeStyle = "rgba(180, 30, 30, 0.85)";
      ctx.lineWidth = 1.2 / scale;
      for (let i = 0; i < handlePositions.length; i += 2) {
        const hx = handlePositions[i];
        const hy = -handlePositions[i + 1];
        ctx.fillRect(hx - hs, hy - hs, hs * 2, hs * 2);
        ctx.strokeRect(hx - hs, hy - hs, hs * 2, hs * 2);
      }

      // Delete button at top-right corner
      const btnR = 7 / scale;
      const btnX = z.x2 + btnR * 0.3;
      const btnY = -(z.y2 + btnR * 0.3);
      ctx.save();
      ctx.fillStyle = "rgba(200, 40, 40, 0.92)";
      ctx.beginPath();
      ctx.arc(btnX, btnY, btnR, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 1.5 / scale;
      const xOff = btnR * 0.45;
      ctx.beginPath();
      ctx.moveTo(btnX - xOff, btnY - xOff);
      ctx.lineTo(btnX + xOff, btnY + xOff);
      ctx.moveTo(btnX + xOff, btnY - xOff);
      ctx.lineTo(btnX - xOff, btnY + xOff);
      ctx.stroke();
      ctx.restore();
    }
  }
};

// Convert bed-space waypoint to drill-space for drawing inside the rotated canvas context
const bedToDrillCanvas = (wp) => {
  const rad = (drillStore.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = wp.x - drillStore.originOffsetX;
  const dy = wp.y - drillStore.originOffsetY;
  return { x: dx * cos - dy * sin, y: -(dx * sin + dy * cos) };
};

// Draw all path lines (after transform applied), routing around no-go zones
const drawPathLines = (pcb) => {
  const path = pcb.path;
  if (!Array.isArray(path) || path.length < 2) return;

  const zones = drillStore._getAllNoGoZones(pcb);
  const hasZones = zones.length > 0;

  ctx.strokeStyle = "#999";
  ctx.lineWidth = 8 / scale;
  ctx.beginPath();

  let prevPt = null;
  let prevBed = null;

  for (let i = 0; i < path.length; i++) {
    const pt = pcb.drillData.find(d => d.id === path[i]);
    if (!pt) continue;

    if (!prevPt) {
      ctx.moveTo(pt.x, -pt.y);
      prevPt = pt;
      if (hasZones) prevBed = drillStore.drillToBedSpace(pt, pcb);
      continue;
    }

    if (hasZones) {
      const curBed = drillStore.drillToBedSpace(pt, pcb);
      const waypoints = drillStore.computeRouteAroundZones(
        prevBed.x, prevBed.y, curBed.x, curBed.y, zones
      );
      for (const wp of waypoints) {
        const dc = bedToDrillCanvas(wp);
        ctx.lineTo(dc.x, dc.y);
      }
      prevBed = curBed;
    }

    ctx.lineTo(pt.x, -pt.y);
    prevPt = pt;
  }
  ctx.stroke();

  if (hasZones) {
    ctx.fillStyle = "rgba(255, 140, 0, 0.7)";
    prevPt = null;
    prevBed = null;
    for (let i = 0; i < path.length; i++) {
      const pt = pcb.drillData.find(d => d.id === path[i]);
      if (!pt) continue;
      if (!prevPt) {
        prevPt = pt;
        prevBed = drillStore.drillToBedSpace(pt, pcb);
        continue;
      }
      const curBed = drillStore.drillToBedSpace(pt, pcb);
      const waypoints = drillStore.computeRouteAroundZones(
        prevBed.x, prevBed.y, curBed.x, curBed.y, zones
      );
      const markerSize = 3 / scale;
      for (const wp of waypoints) {
        const dc = bedToDrillCanvas(wp);
        ctx.beginPath();
        ctx.moveTo(dc.x, dc.y - markerSize);
        ctx.lineTo(dc.x + markerSize, dc.y);
        ctx.lineTo(dc.x, dc.y + markerSize);
        ctx.lineTo(dc.x - markerSize, dc.y);
        ctx.closePath();
        ctx.fill();
      }
      prevPt = pt;
      prevBed = curBed;
    }
  }
};

// Draw PCB board outline (after transform applied, same space as drill points)
const drawPcbOutline = (pcb) => {
  const outline = pcb.outline;
  if (!outline || outline.length < 2) return;

  ctx.save();
  ctx.strokeStyle = "rgba(0, 120, 200, 0.7)";
  ctx.lineWidth = 2 / scale;
  ctx.setLineDash([]);
  ctx.beginPath();

  let started = false;
  for (let i = 0; i < outline.length; i++) {
    const pt = outline[i];
    if (pt === null) {
      if (started) ctx.stroke();
      ctx.beginPath();
      started = false;
      continue;
    }
    if (!started) {
      ctx.moveTo(pt.x, -pt.y);
      started = true;
    } else {
      ctx.lineTo(pt.x, -pt.y);
    }
  }
  if (started) ctx.stroke();

  ctx.fillStyle = "rgba(0, 120, 200, 0.04)";
  ctx.fill();
  ctx.restore();
};

const drawDrillHoles = (pcb) => {
  const viaFilter = pcb.viaFilterDiameter ?? 0.4;
  for (const d of pcb.drillData) {
    const holeDiameter = getDiameter(d.size);
    if (holeDiameter < viaFilter) continue;
    const x = d.x, y = -d.y;
    const r = (holeDiameter / 2) || (radius / scale);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, 2 * Math.PI);
    
    if (isSelectingOriginPoint.value && pcb.id === drillStore.activePcbId && d.id === selectedOriginPoint.value) {
      ctx.fillStyle = "yellow";
      ctx.strokeStyle = "orange";
      ctx.lineWidth = 3 / scale;
    } else {
      ctx.fillStyle = d.solder ? "red" : "gray";
      ctx.strokeStyle = d.selected ? "cyan" : "black";
      ctx.lineWidth = 2 / scale;
    }
    
    ctx.fill();
    ctx.stroke();
  }
};

// Draw drill path labels in screen space (if zoomed in)
const drawPathLabels = () => {
  const dpr = window.devicePixelRatio || 1;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.save();
  ctx.font = `bold ${12}px sans-serif`;
  ctx.fillStyle = "black";
  ctx.textAlign = "left";
  ctx.textBaseline = "bottom";

  const rad = -(drillStore.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  for (const d of filteredDrillData.value) {
    if (d.pathIndex == null) continue;
    const rx = d.x * cos - d.y * sin + drillStore.originOffsetX;
    const ry = d.x * sin + d.y * cos + drillStore.originOffsetY;
    const sx = offsetX + rx * scale + 6;
    const sy = offsetY - ry * scale - 6;
    ctx.fillText((d.pathIndex + 1).toString(), sx, sy);
  }

  ctx.restore();
};

// Draw the selection rectangle (screen space)
const drawSelectionBox = () => {
  if (!(isSelecting && selectionStart && selectionEnd)) return;

  ctx.save();
  ctx.translate(offsetX, offsetY);
  ctx.scale(scale, scale);

  const x = selectionStart.x;
  const y = -selectionStart.y;
  const w = selectionEnd.x - selectionStart.x;
  const h = -(selectionEnd.y - selectionStart.y);

  ctx.strokeStyle = "cyan";
  ctx.lineWidth = 1 / scale;
  ctx.strokeRect(x, y, w, h);

  ctx.restore();
};


const drawFixedArrow = (ctx, x, y, dx, dy, color) => {
  const headLength = 16; // tip size
  const angle = Math.atan2(dy, dx);

  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 6;

  const endX = x + dx;
  const endY = y + dy;

  // Move shaft endpoint *back* a bit so it doesn't draw under the arrowhead
  const shaftEndX = endX - Math.cos(angle) * headLength * 0.9;
  const shaftEndY = endY - Math.sin(angle) * headLength * 0.9;

  // Draw shaft
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(shaftEndX, shaftEndY);
  ctx.stroke();

  // Draw arrowhead
  ctx.beginPath();
  ctx.moveTo(endX, endY);
  ctx.lineTo(
    endX - headLength * Math.cos(angle - Math.PI / 6),
    endY - headLength * Math.sin(angle - Math.PI / 6)
  );
  ctx.lineTo(
    endX - headLength * Math.cos(angle + Math.PI / 6),
    endY - headLength * Math.sin(angle + Math.PI / 6)
  );
  ctx.closePath();
  ctx.fill();
};





// Helper function to extract diameter from size string (e.g., "0.8 mm" -> 0.8)
const getDiameter = (sizeString) => {
  if (!sizeString) return 0;
  const match = sizeString.match(/[\d.]+/);
  return match ? parseFloat(match[0]) : 0;
};

const getPadArea = (sizeString) => {
  const d = getDiameter(sizeString);
  return Math.PI * Math.pow(d / 2, 2);
};

// Computed property that filters drill points by diameter
// Always shows points that are marked for soldering or are in the toolpath
const filteredDrillData = computed(() => {
  return drillStore.drillData.filter(hole => {
    // Always show if marked to solder or in the path
    if (hole.solder || hole.pathIndex !== null) return true;

    // Otherwise, filter by diameter
    const diameter = getDiameter(hole.size);
    return diameter >= drillStore.viaFilterDiameter;
  });
});

const sortedDrillData = computed(() => {
  return [...filteredDrillData.value].sort((a, b) => {
    if (a.pathIndex === null) return 1;
    if (b.pathIndex === null) return -1;
    return a.pathIndex - b.pathIndex;
  });
});

const handleMouseDown = (e) => {
  console.log('[canvas] mousedown button=', e.button, 'ctx=', !!ctx, 'canvas=', !!canvas.value);
  // Right-click pan must be checked FIRST — before getMousePosition which may throw
  if (e.button === 2) {
    isPanning = true;
    startX = e.clientX;
    startY = e.clientY;
    console.log('[canvas] PAN START');
    return;
  }

  if (!canvas.value) return;
  const mouse = getMousePosition(e, false); // don't apply offset

  // No-go zone edit mode (left-click only, allow right-click panning)
  if (isDrawingNoGoZone.value && e.button === 0) {
    const delId = findNoGoDeleteBtn(mouse);
    if (delId) {
      if (drillStore.globalNoGoZones.some(z => z.id === delId)) {
        drillStore.removeGlobalNoGoZone(delId);
      } else {
        drillStore.removeNoGoZone(delId);
      }
      updateCanvas();
      return;
    }
    const handle = findResizeHandle(mouse);
    if (handle) {
      resizingZone = handle;
      return;
    }
    isDrawingNoGoRect = true;
    noGoZoneStart = { ...mouse };
    noGoZoneEnd = { ...mouse };
    return;
  }

  const dx = mouse.x - drillStore.originOffsetX;
  const dy = mouse.y - drillStore.originOffsetY;
  const distanceToOrigin = Math.hypot(dx, dy);

  if (e.button === 0 && distanceToOrigin < 2 && !isSelectingOriginPoint.value) {
    // Begin dragging origin if close to it (but not in origin selection mode)
    drillStore.saveTransformUndoState();
    isDraggingOrigin = true;
    dragOriginStart = { x: e.clientX, y: e.clientY, offsetX: drillStore.originOffsetX, offsetY: drillStore.originOffsetY };
    return;
  }

  const pt = getMousePosition(e);
  const rad = -(drillStore.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  const clicked = filteredDrillData.value.find(d => {
    const dx = d.x;
    const dy = d.y;

    const rotatedX = dx * cos - dy * sin + drillStore.originOffsetX;
    const rotatedY = dx * sin + dy * cos + drillStore.originOffsetY;

    return Math.hypot(rotatedX - mouse.x, rotatedY - mouse.y) < 1;
  });

  if (isSelectingOriginPoint.value) {
    // In origin selection mode - only allow selecting a single point
    drillStore.drillData.forEach(d => d.selected = false);
    if (clicked) {
      selectedOriginPoint.value = clicked.id;
      clicked.selected = true;
    } else {
      selectedOriginPoint.value = null;
    }
    updateCanvas();
    return;
  }

  if (clicked) {
  if (e.ctrlKey) {
    drillStore.removeFromPath(clicked.id);
    clicked.solder = false; // uncheck solder box
  } else {
    drillStore.addToPath(clicked.id);
    clicked.solder = true; // check solder box
  }
  clicked.selected = true;
} else {
  // Clicked empty space: deselect all
  drillStore.drillData.forEach(d => d.selected = false);
}

if (!clicked && e.button === 0) {
  isSelecting = true;
  const pt = getMousePosition(e, false); // ⬅️ don't apply offset for selection box
  selectionStart = pt;
  selectionEnd = pt;
}


updateCanvas();

};

const handleMouseMove = (e) => {
  if (!canvas.value) return;
  if (resizingZone) {
    const mouse = getMousePosition(e, false);
    const z = drillStore._getAllNoGoZones().find(zn => zn.id === resizingZone.zoneId);
    if (z) {
      const nb = { ...resizingZone.orig };
      for (const p of resizingZone.dragProps) {
        if (p === 'x1' || p === 'x2') nb[p] = mouse.x;
        if (p === 'y1' || p === 'y2') nb[p] = mouse.y;
      }
      z.x1 = Math.min(nb.x1, nb.x2);
      z.y1 = Math.min(nb.y1, nb.y2);
      z.x2 = Math.max(nb.x1, nb.x2);
      z.y2 = Math.max(nb.y1, nb.y2);
    }
    updateCanvas();
    return;
  }
  if (isDrawingNoGoRect && noGoZoneStart) {
    noGoZoneEnd = getMousePosition(e, false);
    updateCanvas();
    return;
  }
  if (isDraggingOrigin && dragOriginStart) {
    const dx = (e.clientX - dragOriginStart.x) / scale;
    const dy = (e.clientY - dragOriginStart.y) / scale;

    // Snap to nearest 8mm
    const newOffsetX = dragOriginStart.offsetX + dx;
    const newOffsetY = dragOriginStart.offsetY - dy;

    drillStore.originOffsetX = newOffsetX;
    drillStore.originOffsetY = newOffsetY;
    updateCanvas();
    return;
  }
  if (isPanning) return;
  if (isSelecting) {
    selectionEnd = getMousePosition(e, false); // ⬅️ match startInteraction logic
    updateCanvas();
  }


};

const handleMouseUp = () => {

  if (resizingZone) {
    resizingZone = null;
    updateCanvas();
    return;
  }

  if (isDrawingNoGoRect && noGoZoneStart && noGoZoneEnd) {
    const w = Math.abs(noGoZoneEnd.x - noGoZoneStart.x);
    const h = Math.abs(noGoZoneEnd.y - noGoZoneStart.y);
    if (w > 0.5 && h > 0.5) {
      const zone = {
        x1: noGoZoneStart.x,
        y1: noGoZoneStart.y,
        x2: noGoZoneEnd.x,
        y2: noGoZoneEnd.y,
      };
      if (noGoZoneMode.value === "global") {
        drillStore.addGlobalNoGoZone(zone);
      } else {
        drillStore.addNoGoZone(zone);
      }
    }
    isDrawingNoGoRect = false;
    noGoZoneStart = null;
    noGoZoneEnd = null;
    updateCanvas();
    return;
  }

  if (isDraggingOrigin) {
    isDraggingOrigin = false;
    dragOriginStart = null;
    return;
  }

  isPanning = false;
  if (isSelecting && selectionStart && selectionEnd) {
  const [x1, x2] = [selectionStart.x, selectionEnd.x].sort((a, b) => a - b);
  const [y1, y2] = [selectionStart.y, selectionEnd.y].sort((a, b) => a - b);

  const rad = -(drillStore.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  filteredDrillData.value.forEach(d => {
    // Apply offset and then rotate
    const dx = d.x;
    const dy = d.y;
    const rotatedX = dx * cos - dy * sin + drillStore.originOffsetX;
    const rotatedY = dx * sin + dy * cos + drillStore.originOffsetY;

    d.selected = rotatedX >= x1 && rotatedX <= x2 && rotatedY >= y1 && rotatedY <= y2;
  });

}
isSelecting = false;
selectionStart = selectionEnd = null;
updateCanvas();

};

const handleZoom = (e) => {
  if (!canvas.value) return;
  const rect = canvas.value.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;
  const oldScale = scale;
  const delta = e.deltaY * -0.005;
  scale = Math.max(0.1, Math.min(30, scale + delta));
  offsetX = mx - (mx - offsetX) * (scale / oldScale);
  offsetY = my - (my - offsetY) * (scale / oldScale);
  updateCanvas();
};


const getMousePosition = (e, applyOffset = true) => {
  const rect = canvas.value.getBoundingClientRect();
  let x = (e.clientX - rect.left - offsetX) / scale;
  let y = -(e.clientY - rect.top - offsetY) / scale;

  if (applyOffset) {
    x -= drillStore.originOffsetX;
    y -= drillStore.originOffsetY;

    const rad = -(drillStore.rotation * Math.PI) / 180;
    const rotatedX = x * Math.cos(rad) - y * Math.sin(rad);
    const rotatedY = x * Math.sin(rad) + y * Math.cos(rad);
    x = rotatedX;
    y = rotatedY;
  }

  return { x, y };
};



// const toggleSelect = (id) => {
//   drillStore.toggleSelection(id);
//   updateCanvas();
// };

const toggleSelect = (id, index, event) => {
  const drillData = drillStore.drillData;
  const clicked = drillData.find(d => d.id === id);
  if (!clicked) return;

  const tableBody = event.currentTarget?.closest("tbody");
  if (event.shiftKey && tableBody) {
    tableBody.classList.add("no-select");     // Prevent text selection

    requestAnimationFrame(() => {
      tableBody.classList.remove("no-select"); // Re-enable selection shortly after
    });
  }

  if (event.shiftKey && lastSelectedIndex.value != null) {
    const start = Math.min(lastSelectedIndex.value, index);
    const end = Math.max(lastSelectedIndex.value, index);
    for (let i = start; i <= end; i++) {
      drillData[i].selected = true;
    }
  } else {
    clicked.selected = !clicked.selected;
    lastSelectedIndex.value = index;
  }

  updateCanvas();
};



const autoOptimizePath = () => {
  drillStore.autoOptimizePath();
  updateCanvas();
};

const optimizeSelected = () => {
  drillStore.optimizeSelection();
  updateCanvas();
};


const clearPath = () => {
  drillStore.clearPath();
  updateCanvas();
};

const undo = () => {
  drillStore.undoLast();
  updateCanvas();
};

const redo = () => {
  drillStore.redoLast();
  updateCanvas();
};

const toggleNoGoZoneMode = () => {
  isDrawingNoGoZone.value = !isDrawingNoGoZone.value;
  isDrawingNoGoRect = false;
  noGoZoneStart = null;
  noGoZoneEnd = null;
  resizingZone = null;
};

const findNoGoDeleteBtn = (pt) => {
  const btnR = 7 / scale;
  const allZones = drillStore._getAllNoGoZones();
  for (let i = allZones.length - 1; i >= 0; i--) {
    const z = allZones[i];
    const btnX = z.x2 + btnR * 0.3;
    const btnY = z.y2 + btnR * 0.3;
    if (Math.hypot(pt.x - btnX, pt.y - btnY) < btnR * 1.5) {
      return z.id;
    }
  }
  return null;
};

const findResizeHandle = (pt) => {
  const hitR = 5 / scale;
  const allZones = drillStore._getAllNoGoZones();
  for (let i = allZones.length - 1; i >= 0; i--) {
    const z = allZones[i];
    const cx = (z.x1 + z.x2) / 2;
    const cy = (z.y1 + z.y2) / 2;
    const handles = [
      { hx: z.x1, hy: z.y1, dp: ['x1', 'y1'] },
      { hx: z.x2, hy: z.y1, dp: ['x2', 'y1'] },
      { hx: z.x1, hy: z.y2, dp: ['x1', 'y2'] },
      { hx: z.x2, hy: z.y2, dp: ['x2', 'y2'] },
      { hx: cx, hy: z.y1, dp: ['y1'] },
      { hx: cx, hy: z.y2, dp: ['y2'] },
      { hx: z.x1, hy: cy, dp: ['x1'] },
      { hx: z.x2, hy: cy, dp: ['x2'] },
    ];
    for (const h of handles) {
      if (Math.abs(pt.x - h.hx) < hitR && Math.abs(pt.y - h.hy) < hitR) {
        return {
          zoneId: z.id,
          dragProps: h.dp,
          orig: { x1: z.x1, y1: z.y1, x2: z.x2, y2: z.y2 },
        };
      }
    }
  }
  return null;
};

const removePcb = (pcbId) => {
  drillStore.removePcb(pcbId);
  drillStore.triggerCanvasUpdate();
};

const clearAllPcbs = () => {
  if (drillStore.pcbs.length === 0) return;
  if (confirm("Remove all PCBs from the tray?")) {
    drillStore.clearAllPcbs();
    drillStore.triggerCanvasUpdate();
  }
};

const duplicatePcb = (pcbId) => {
  drillStore.duplicatePcb(pcbId);
  drillStore.triggerCanvasUpdate();
};

// PCB drag-and-drop reorder
let dragPcbIndex = -1;
const onPcbDragStart = (idx, event) => {
  dragPcbIndex = idx;
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", idx);
};
const onPcbDragOver = (idx, event) => {
  event.dataTransfer.dropEffect = "move";
};
const onPcbDrop = (idx, event) => {
  event.preventDefault();
  if (dragPcbIndex >= 0 && dragPcbIndex !== idx) {
    drillStore.reorderPcbs(dragPcbIndex, idx);
    drillStore.triggerCanvasUpdate();
  }
  dragPcbIndex = -1;
};
const onPcbDragEnd = () => { dragPcbIndex = -1; };

// PCB context menu
const pcbContextMenu = ref({ show: false, x: 0, y: 0, index: -1 });
const showPcbContextMenu = (event, idx) => {
  pcbContextMenu.value = { show: true, x: event.clientX, y: event.clientY, index: idx };
};
const hidePcbContextMenu = () => { pcbContextMenu.value.show = false; };
const duplicatePcbFromMenu = () => {
  const idx = pcbContextMenu.value.index;
  if (idx >= 0 && drillStore.pcbs[idx]) {
    duplicatePcb(drillStore.pcbs[idx].id);
  }
  hidePcbContextMenu();
};
const removePcbFromMenu = () => {
  const idx = pcbContextMenu.value.index;
  if (idx >= 0 && drillStore.pcbs[idx]) {
    removePcb(drillStore.pcbs[idx].id);
  }
  hidePcbContextMenu();
};

const clearFile = () => {
  drillStore.clearDrillFile();
  drillStore.triggerCanvasUpdate();
};

const handleCanvasDrop = (event) => {
  const file = Array.from(event.dataTransfer.files).find(f =>
    f.name.endsWith(".drl") || f.name.endsWith(".txt") || f.name.endsWith(".json") || f.name.endsWith(".zip")
  );
  if (!file) return;

  const ext = file.name.split('.').pop().toLowerCase();
  if (ext === "json") {
    parseProjectFile(file);
  } else if (ext === "zip") {
    if (importWizardRef.value) {
      importWizardRef.value.openZipFile(file);
    }
  } else {
    parseDrillFile(file);
  }
};

function downloadExampleDrillFile() {
  const url = "https://raw.githubusercontent.com/RinthLabs/SolderSidekick/refs/heads/main/example/PCB_breadboard-PTH.drl";
  fetch(url)
    .then(res => res.blob())
    .then(blob => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "PCB_breadboard-PTH.drl";
      a.click();
      URL.revokeObjectURL(a.href);
    });
}


</script>

<style scoped>
.pcb-tray-section {
  border: 1px solid #dee2e6;
  border-radius: 6px;
  padding: 8px 10px;
  background: #f8f9fa;
}
.pcb-list {
  max-height: 150px;
  overflow-y: auto;
}
.pcb-list-item {
  padding: 4px 8px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.85rem;
  border: 1px solid transparent;
}
.pcb-list-item:hover {
  background: #e9ecef;
}
.pcb-list-item.active {
  background: #cfe2ff;
  border-color: #86b7fe;
}
.pcb-name {
  max-width: 160px;
}
.pcb-context-menu {
  position: fixed;
  z-index: 1050;
  background: #fff;
  border: 1px solid #dee2e6;
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  padding: 4px 0;
  min-width: 140px;
}
.pcb-context-menu .dropdown-item {
  padding: 6px 14px;
  font-size: 0.85rem;
  cursor: pointer;
}
.pcb-context-menu .dropdown-item:hover {
  background: #f0f0f0;
}
.pcb-properties-section {
  border: 1px solid #dee2e6;
  border-radius: 6px;
  padding: 8px 10px;
  background: #f8f9fa;
}

.toolpath-canvas {
  border: 1px solid #eeeeee;
  width: 100%;
  aspect-ratio: 1.5;
}


.table-primary {
  background-color: rgba(0, 255, 242, 0.2) !important;
  --bs-table-striped-bg: rgba(0, 255, 242, 0.2) !important;
  --bs-table-bg: #008bab47 !important
}

.toolpath-canvas {
  border: 1px solid #ccc;
  background-color: #e8e8e8; /* light gray */
  width: 100%;
  aspect-ratio: 1.5;
}

.r90{
  -webkit-transform: rotate(90deg); /* Safari and Chrome */
    -moz-transform: rotate(90deg);   /* Firefox */
    -ms-transform: rotate(90deg);   /* IE 9 */
    -o-transform: rotate(90deg);   /* Opera */
    transform: rotate(90deg);
    display: inline-block; /* 👈 Needed to allow transform to work */
}

.r180{
  -webkit-transform: rotate(180deg); /* Safari and Chrome */
    -moz-transform: rotate(180deg);   /* Firefox */
    -ms-transform: rotate(180deg);   /* IE 9 */
    -o-transform: rotate(180deg);   /* Opera */
    transform: rotate(180deg);
    display: inline-block; /* 👈 Needed to allow transform to work */
}

.pcb-input {
  width: 5rem !important;
}

.pcb-controls{
  gap:0.5rem;
  margin-top: 0.5rem;
}

.pcb-controls .form-label {
  margin: 0;
  line-height: 1;
  display: flex;
  align-items: center;
}

.pcb-controls .pcb-icon {
  margin: 0 !important;
  margin-top: 4px !important;
  margin-left: 4px !important;
}

.pcb-section{
  margin-left: 0.75rem !important;
}

/* .canvas-wrapper {
  position: relative;
} */


.editor-instructions {
  position: absolute;
  bottom: 0.75rem;
  left: 1rem;
  /* padding-left: 0.5rem; */
  font-size: 0.85rem;
  line-height: 1.3;
  pointer-events: none; /* 👈 This makes it ignore all mouse interaction */
}

.editor-instructions button {
  margin-top: 1rem;
  pointer-events: auto; /* 👈 This makes the button clickable */
}


.editor-label {
  margin-bottom: 3.25rem;
}


.toolbar{
  gap:0.5rem !important;
}

.toolbar .form-label {
  margin: 0;
  line-height: 1;
  display: flex;
  align-items: center;
  margin-left: 1rem !important;
}

.form-label{
  font-weight: 700 !important;
}

.toolpath-layout {
  width: 100%;
  margin: 0;
  display: flex;
  flex-wrap: nowrap;
}

.toolpath-layout .canvas-wrapper {
  flex: 1;
  min-width: 0;
  --bs-gutter-x: 0;
}

.right-panel {
  width: 650px;
  display: flex;
  flex-direction: column;
  position: relative;
  padding: 0;
}

.scrolling-table {
  flex: 1;
  max-height: calc(100vh - 64px); /* Adjust height as needed */
  overflow-y: auto;
  border: 0px solid #ddd;
  background-color: #ddd;
  padding-bottom: 3rem;
  /* padding-right: 0.5rem;
  padding-left: 0.5rem; */
  /* margin-bottom: 3.5rem; */
}

.save-button,
.simulate-button {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
  height: 4rem;
  padding: 0.5rem 1rem;
  gap: 0.5rem;
  font-weight: 600;
  font-size: 1.1rem;
  border-radius: 0;
}

.bottom-button-container{
   position: absolute;
  bottom: 0;
  right: 0;
  z-index: 10;

  background-color: #fff;
  width: 100%;
}

.sidebar-home-origin input{
  width: 5.5rem !important;
}

.profile-dropdown{
  width: inherit;
}

.profile-label{
  margin-bottom: 0;
}

.measure-note{
  /* padding-left: 2rem;
  padding-right: 2rem; */
  /* margin-top: 0.5rem; */
}




.checkbox-cell {
  max-width: fit-content;
  padding-left: 0.75rem; /* Add this line */
}

th:first-child {
  padding-left: 0.75rem; /* Match checkbox cell padding */
}

.canvas-wrapper.drag-hover {
  outline: 3px dashed #00aaff;
  background-color: #eefbff;
}

.topbar-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  /* background: rgba(0, 0, 0, 0.6); */
  color: #000;
  border-radius: 0.25rem;
  font-size: 0.85rem;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  z-index: 10;
}


.table-dark{
  background-color: var(--bs-secondary) !important;
}

table th {
  background-color: var(--bs-secondary) !important;
}

.btn-outline-secondary, .btn-outline-danger, .btn-outline-dark{
  background-color: #fff !important;
  
}

.btn-outline-danger:hover{
  background-color: #dc3545 !important;
  color: #FFF !important;
}

.btn-outline-secondary:hover{
  background-color: #6c757d !important;
  color: #FFF !important;
}

.btn-outline-dark:hover{
  background-color: #212529 !important;
  color: #FFF !important;
}

.toolpath-layout {
  height: calc(100vh - 105px);
  overflow: hidden;
}

.toolpath-canvas {
  width: 100%;
  height: 100%;
  display: block;
}

.canvas-wrapper {
  height: 100%;
  overflow: hidden;
  position: relative;
}


.fade-enter-active, .fade-leave-active {
  transition: opacity 0.5s ease;
}
.fade-enter-from, .fade-leave-to {
  opacity: 0;
}

.fixed-help-button {
  position: absolute;
  bottom: 0;
  left: 0;
  margin-top: 1rem;
  pointer-events: auto;
  width: 200px;
}

.example-drill-file{
  background-color: #fff;
  border-radius: 0.5rem;
  
}

.mw-1{
  margin-left: 1rem;
}

.origin-calculator{
  position: relative;
}

.close-calculator{
  position: absolute;
  right: 0;
}

.nogo-cursor {
  cursor: crosshair !important;
}

</style>


<style>
.key-icon {
  border: 1px solid #000;
  border-radius: 0.25rem;
  padding: 0.1rem 0.2rem 0.2rem 0.2rem;
  color: #000;
  font-weight: 600;
  background-color: #fff;
  margin: 0;
}

/* Add this to your <style scoped> or global style */
.no-select * {
  user-select: none !important;
}

body.prevent-select,
body.prevent-select * {
  user-select: none !important;
}


</style>