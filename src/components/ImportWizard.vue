<template>
  <!-- Import Wizard Modal -->
  <div class="modal fade" ref="modalEl" tabindex="-1" aria-hidden="true" data-bs-backdrop="static">
    <div class="modal-dialog modal-lg modal-dialog-scrollable">
      <div class="modal-content">
        <div class="modal-header bg-dark text-white">
          <h5 class="modal-title">
            <i class="fa-solid fa-file-zipper me-2"></i>Gerber Import Wizard
          </h5>
          <button type="button" class="btn-close btn-close-white" @click="close" :disabled="importing"></button>
        </div>
        <div class="modal-body">

          <!-- Loading / Importing state -->
          <div v-if="loading || importing" class="py-3">
            <div class="d-flex align-items-center mb-3">
              <div class="spinner-border text-primary me-3" role="status" v-if="!importDone"></div>
              <i class="fa-solid fa-circle-check text-success fa-2x me-3" v-else></i>
              <div>
                <h6 class="mb-0">{{ progressTitle }}</h6>
                <small class="text-muted">{{ progressSubtitle }}</small>
              </div>
            </div>

            <!-- Progress steps -->
            <div class="progress-steps">
              <div
                v-for="(step, i) in progressSteps"
                :key="i"
                class="progress-step d-flex align-items-start mb-2"
                :class="{
                  'text-success': step.status === 'done',
                  'text-primary': step.status === 'active',
                  'text-muted': step.status === 'pending'
                }"
              >
                <span class="step-icon me-2 mt-1">
                  <i class="fa-solid fa-circle-check" v-if="step.status === 'done'"></i>
                  <i class="fa-solid fa-spinner fa-spin" v-else-if="step.status === 'active'"></i>
                  <i class="fa-regular fa-circle" v-else></i>
                </span>
                <span>{{ step.label }}</span>
              </div>
            </div>

            <!-- Overall progress bar -->
            <div class="progress mt-3" style="height: 8px;">
              <div
                class="progress-bar"
                :class="importDone ? 'bg-success' : 'bg-primary'"
                role="progressbar"
                :style="{ width: progressPercent + '%' }"
              ></div>
            </div>
          </div>

          <!-- File selection state -->
          <div v-else>
            <p class="text-muted mb-3">
              Select the files to import from <strong>{{ zipName }}</strong>.
              Drill files will be combined into a single set of points.
            </p>

            <!-- Drill Files Section -->
            <div v-if="drillFiles.length" class="mb-4">
              <h6 class="text-primary">
                <i class="fa-solid fa-circle-dot me-1"></i> Drill Files
                <span class="badge bg-secondary ms-1">{{ drillFiles.length }}</span>
              </h6>
              <div class="form-check" v-for="f in drillFiles" :key="f.name">
                <input
                  class="form-check-input"
                  type="checkbox"
                  :id="'drill-' + f.name"
                  v-model="f.selected"
                />
                <label class="form-check-label" :for="'drill-' + f.name">
                  <code>{{ f.name }}</code>
                  <span class="text-muted ms-2">({{ formatSize(f.size) }})</span>
                </label>
              </div>
            </div>

            <!-- Outline Files Section -->
            <div v-if="outlineFiles.length" class="mb-4">
              <h6 class="text-success">
                <i class="fa-solid fa-vector-square me-1"></i> Board Outline Files
                <span class="badge bg-secondary ms-1">{{ outlineFiles.length }}</span>
              </h6>
              <div class="form-check" v-for="f in outlineFiles" :key="f.name">
                <input
                  class="form-check-input"
                  type="radio"
                  :id="'outline-' + f.name"
                  name="outline-file"
                  v-model="selectedOutlineName"
                  :value="f.name"
                />
                <label class="form-check-label" :for="'outline-' + f.name">
                  <code>{{ f.name }}</code>
                  <span class="text-muted ms-2">({{ formatSize(f.size) }})</span>
                </label>
              </div>
              <div class="form-check">
                <input
                  class="form-check-input"
                  type="radio"
                  id="outline-none"
                  name="outline-file"
                  v-model="selectedOutlineName"
                  value=""
                />
                <label class="form-check-label" for="outline-none">
                  <em class="text-muted">No outline</em>
                </label>
              </div>
            </div>

            <!-- Other Files Section (collapsed) -->
            <div v-if="otherFiles.length" class="mb-3">
              <h6
                class="text-secondary"
                role="button"
                @click="showOther = !showOther"
                style="cursor: pointer"
              >
                <i class="fa-solid" :class="showOther ? 'fa-chevron-down' : 'fa-chevron-right'"></i>
                Other Files
                <span class="badge bg-secondary ms-1">{{ otherFiles.length }}</span>
              </h6>
              <div v-if="showOther" class="ms-3">
                <div class="form-check text-muted" v-for="f in otherFiles" :key="f.name">
                  <input
                    class="form-check-input"
                    type="checkbox"
                    :id="'other-' + f.name"
                    v-model="f.selected"
                  />
                  <label class="form-check-label" :for="'other-' + f.name">
                    <code>{{ f.name }}</code>
                    <span class="text-muted ms-2">({{ formatSize(f.size) }})</span>
                  </label>
                </div>
              </div>
            </div>

            <!-- No files warning -->
            <div v-if="drillFiles.length === 0 && outlineFiles.length === 0 && !loading" class="alert alert-warning">
              <i class="fa-solid fa-triangle-exclamation me-1"></i>
              No recognizable drill or outline files found in this ZIP.
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" @click="close" :disabled="importing">
            {{ importing ? 'Importing...' : 'Cancel' }}
          </button>
          <button
            v-if="!loading && !importing"
            type="button"
            class="btn btn-primary"
            :disabled="!hasSelection"
            @click="importFiles"
          >
            <i class="fa-solid fa-file-import me-1"></i> Import
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from "vue";
import JSZip from "jszip";
import { Modal } from "bootstrap";
import { useDrillStore } from "@/stores/store";
import { useFileHandlers } from "@/composables/useFileHandlers";

const drillStore = useDrillStore();
const { parseDrillText } = useFileHandlers();

const modalEl = ref(null);
const loading = ref(false);
const importing = ref(false);
const importDone = ref(false);
const zipName = ref("");
const drillFiles = ref([]);
const outlineFiles = ref([]);
const otherFiles = ref([]);
const selectedOutlineName = ref("");
const showOther = ref(false);
let rawFiles = {};

// Progress tracking
const progressTitle = ref("");
const progressSubtitle = ref("");
const progressPercent = ref(0);
const progressSteps = ref([]);

const OUTLINE_EXTENSIONS = ["gko", "gml", "gm1", "outline", "bsn", "bcm"];
const DRILL_EXTENSIONS = ["drl", "xln", "txt"];

const hasSelection = computed(() => {
  const hasDrill = drillFiles.value.some(f => f.selected);
  const hasOutline = !!selectedOutlineName.value;
  const hasOther = otherFiles.value.some(f => f.selected);
  return hasDrill || hasOutline || hasOther;
});

function categorizeFile(name) {
  const ext = name.split(".").pop().toLowerCase();
  if (DRILL_EXTENSIONS.includes(ext)) return "drill";
  if (OUTLINE_EXTENSIONS.includes(ext)) return "outline";
  return "other";
}

function isDrillFile(name) {
  const ext = name.split(".").pop().toLowerCase();
  if (DRILL_EXTENSIONS.includes(ext)) return true;
  if (ext === "txt" && /drill|xln/i.test(name)) return true;
  return false;
}

function isOutlineFile(name) {
  const ext = name.split(".").pop().toLowerCase();
  if (OUTLINE_EXTENSIONS.includes(ext)) return true;
  if (/board.?outline|pcb.?outline|edge.?cuts/i.test(name)) return true;
  return false;
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function updateStep(index, status) {
  if (progressSteps.value[index]) {
    progressSteps.value[index].status = status;
  }
}

async function openZipFile(file) {
  console.log("[ImportWizard] openZipFile called:", file.name, file.size, "bytes");
  loading.value = true;
  zipName.value = file.name;
  drillFiles.value = [];
  outlineFiles.value = [];
  otherFiles.value = [];
  selectedOutlineName.value = "";
  rawFiles = {};

  // Open the modal first
  show();

  try {
    console.log("[ImportWizard] Parsing ZIP with JSZip...");
    const zip = await JSZip.loadAsync(file);
    console.log("[ImportWizard] ZIP parsed successfully");
    const entries = [];

    zip.forEach((path, entry) => {
      if (entry.dir) return;
      if (path.startsWith(".") || path.startsWith("__MACOSX")) return;
      entries.push({ name: path, entry, size: entry._initialDataLength || 0 });
      console.log("[ImportWizard] ZIP entry:", path, `(${entry._initialDataLength || 0} bytes)`);
    });

    entries.sort((a, b) => a.name.localeCompare(b.name));

    for (const e of entries) {
      const cat = categorizeFile(e.name);
      const fileObj = {
        name: e.name,
        selected: cat === "drill",
        size: e.size,
      };

      rawFiles[e.name] = { entry: e.entry };

      if (isDrillFile(e.name) || cat === "drill") {
        drillFiles.value.push(fileObj);
      } else if (isOutlineFile(e.name)) {
        outlineFiles.value.push(fileObj);
      } else {
        otherFiles.value.push(fileObj);
      }
    }

    if (outlineFiles.value.length > 0) {
      selectedOutlineName.value = outlineFiles.value[0].name;
    }

    console.log("[ImportWizard] Categorized:", {
      drill: drillFiles.value.length,
      outline: outlineFiles.value.length,
      other: otherFiles.value.length,
    });
  } catch (err) {
    console.error("[ImportWizard] Failed to read ZIP:", err);
    alert("Failed to read ZIP file. Please ensure it is a valid ZIP archive.");
    close();
  }

  loading.value = false;
}

async function importFiles() {
  const selectedDrills = drillFiles.value.filter(f => f.selected);
  const selectedOther = otherFiles.value.filter(f => f.selected);
  const hasOutline = !!selectedOutlineName.value;

  if (selectedDrills.length === 0 && !hasOutline && selectedOther.length === 0) {
    return;
  }

  const totalSteps = selectedDrills.length + selectedOther.length + (hasOutline ? 1 : 0);
  let currentStep = 0;

  // Build progress steps
  progressSteps.value = [];
  for (const f of selectedDrills) {
    progressSteps.value.push({ label: `Parse drill: ${f.name}`, status: "pending" });
  }
  for (const f of selectedOther) {
    progressSteps.value.push({ label: `Parse: ${f.name}`, status: "pending" });
  }
  if (hasOutline) {
    progressSteps.value.push({ label: `Parse outline: ${selectedOutlineName.value}`, status: "pending" });
  }
  progressSteps.value.push({ label: "Apply to canvas", status: "pending" });

  importing.value = true;
  importDone.value = false;
  progressTitle.value = "Importing Gerber files...";
  progressSubtitle.value = `0 of ${totalSteps} files processed`;
  progressPercent.value = 0;

  try {
    let allDrills = [];
    let combinedToolSizes = {};

    // Parse drill files
    for (let i = 0; i < selectedDrills.length; i++) {
      const drillFile = selectedDrills[i];
      updateStep(i, "active");
      progressTitle.value = `Parsing drill file...`;
      progressSubtitle.value = drillFile.name;
      progressPercent.value = Math.round((currentStep / totalSteps) * 100);
      console.log(`[ImportWizard] Parsing drill file ${i + 1}/${selectedDrills.length}:`, drillFile.name);

      const data = rawFiles[drillFile.name];
      if (!data) {
        console.warn(`[ImportWizard] No raw data for ${drillFile.name}, skipping`);
        updateStep(i, "done");
        currentStep++;
        continue;
      }

      const text = await data.entry.async("text");
      console.log(`[ImportWizard] Read ${text.length} chars from ${drillFile.name}`);

      const parsed = parseDrillText(text, drillFile.name);
      console.log(`[ImportWizard] Parsed ${parsed.drills.length} drill points from ${drillFile.name}`, parsed.toolSizes);

      for (const point of parsed.drills) {
        allDrills.push({ ...point });
      }

      Object.assign(combinedToolSizes, parsed.toolSizes);
      updateStep(i, "done");
      currentStep++;
      progressPercent.value = Math.round((currentStep / totalSteps) * 100);
    }

    // Parse "other" files
    for (let i = 0; i < selectedOther.length; i++) {
      const otherFile = selectedOther[i];
      const stepIdx = selectedDrills.length + i;
      updateStep(stepIdx, "active");
      progressTitle.value = `Parsing file...`;
      progressSubtitle.value = otherFile.name;
      console.log(`[ImportWizard] Parsing other file: ${otherFile.name}`);

      const data = rawFiles[otherFile.name];
      if (!data) {
        updateStep(stepIdx, "done");
        currentStep++;
        continue;
      }

      const text = await data.entry.async("text");
      const parsed = parseDrillText(text, otherFile.name);
      console.log(`[ImportWizard] Parsed ${parsed.drills.length} points from ${otherFile.name}`);

      allDrills.push(...parsed.drills);
      Object.assign(combinedToolSizes, parsed.toolSizes);
      updateStep(stepIdx, "done");
      currentStep++;
      progressPercent.value = Math.round((currentStep / totalSteps) * 100);
    }

    // Set drill data — create a new PCB for the imported data
    if (allDrills.length > 0) {
      const filename = selectedDrills.length === 1
        ? selectedDrills[0].name
        : selectedDrills.map(f => f.name).join(", ");
      console.log(`[ImportWizard] Setting ${allDrills.length} total drill points, filename: ${filename}`);
      const pcb = drillStore.addPcb({ filename });
      drillStore.setPcbDrillData(pcb.id, allDrills, combinedToolSizes);
    } else {
      console.warn("[ImportWizard] No drill points parsed from any file");
    }

    // Parse outline
    if (hasOutline) {
      const outlineIdx = selectedDrills.length + selectedOther.length;
      updateStep(outlineIdx, "active");
      progressTitle.value = `Parsing board outline...`;
      progressSubtitle.value = selectedOutlineName.value;
      console.log(`[ImportWizard] Parsing outline: ${selectedOutlineName.value}`);

      const outlineData = rawFiles[selectedOutlineName.value];
      if (outlineData) {
        const outlineText = await outlineData.entry.async("text");
        console.log(`[ImportWizard] Outline raw (${outlineText.length} chars):`, outlineText.substring(0, 500));
        const outline = parseGerberTextInline(outlineText);
        console.log(`[ImportWizard] Outline parsed: ${outline.length} points`, outline.slice(0, 10));
        const activePcb = drillStore.activePcb;
        if (activePcb) activePcb.outline = outline;
      }
      updateStep(outlineIdx, "done");
      currentStep++;
      progressPercent.value = Math.round((currentStep / totalSteps) * 100);
    }

    // Apply to canvas
    const applyIdx = progressSteps.value.length - 1;
    updateStep(applyIdx, "active");
    progressTitle.value = "Applying to canvas...";
    progressSubtitle.value = "Rendering PCB with imported data";
    progressPercent.value = 100;
    console.log("[ImportWizard] Triggering canvas update");

    drillStore.triggerCanvasUpdate();

    updateStep(applyIdx, "done");
    importDone.value = true;
    progressTitle.value = "Import complete!";
    progressSubtitle.value = `${allDrills.length} drill points loaded` + (hasOutline ? `, outline loaded` : "");

    console.log("[ImportWizard] Import complete. Closing modal in 1s...");
    setTimeout(() => {
      close();
      resetState();
    }, 1200);

  } catch (err) {
    console.error("[ImportWizard] Import failed:", err);
    alert("Failed to import files: " + err.message);
    importing.value = false;
  }
}

function resetState() {
  loading.value = false;
  importing.value = false;
  importDone.value = false;
  progressTitle.value = "";
  progressSubtitle.value = "";
  progressPercent.value = 0;
  progressSteps.value = [];
}

/**
 * Inline Gerber parser for extracting board outlines.
 */
function parseGerberTextInline(text) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);

  let unitMode = "mm";
  let integerDigits = 3;
  let decimalDigits = 6;
  let useLeadingZeros = true;
  const apertures = {};
  let currentAperture = null;
  let currentX = 0;
  let currentY = 0;
  let interpolateMode = 1;
  let lastOperation = "move"; // modal state: defaults to "move" (D02)
  const outline = [];

  for (const line of lines) {
    if (line.startsWith("%FS")) {
      // Match %FSLAX3:6Y3:6% or %FSLAX3:6Y3:6*%
      const fsMatch = line.match(/%FS(L?[AI])(\d+):(\d+)[\*]?%/);
      if (fsMatch) {
        useLeadingZeros = fsMatch[1].includes("L");
        integerDigits = parseInt(fsMatch[2]);
        decimalDigits = parseInt(fsMatch[3]);
      }
    }
    if (line === "%MOIN%" || line === "MOIN") unitMode = "inch";
    if (line === "%MOMM%" || line === "MOMM") unitMode = "mm";
  }

  console.log(`[GerberParser] Format: ${integerDigits}:${decimalDigits}, unitMode=${unitMode}, leadingZeros=${useLeadingZeros}`);

  function parseCoord(val) {
    if (val === undefined || val === null || val === "") return 0;
    const s = String(val);
    const sign = s.startsWith("-") ? -1 : 1;
    const abs = s.replace("-", "");
    const total = integerDigits + decimalDigits;
    let padded;
    if (useLeadingZeros) {
      padded = abs.padStart(total, "0");
    } else {
      padded = abs.padEnd(total, "0");
    }
    const intPart = padded.slice(0, integerDigits);
    const decPart = padded.slice(integerDigits);
    return sign * parseFloat(`${intPart || "0"}.${decPart || "0"}`);
  }

  function toMm(val) {
    return unitMode === "inch" ? Math.round(val * 25.4 * 1000) / 1000 : val;
  }

  for (const line of lines) {
    // Skip comments and standalone separators
    if (line.startsWith("G04") || line.startsWith(";") || line === "*") continue;

    // Handle G codes for interpolation mode
    const gMatch = line.match(/\bG(\d+)/);
    if (gMatch) interpolateMode = parseInt(gMatch[1]);

    // Determine operation from D01/D02/D03
    // Use \b word boundary to avoid matching D01 inside D010, D011, etc.
    // If no explicit D code, inherit the last modal operation
    let operation = null;
    if (/D0[123]\b/.test(line)) {
      const dOpMatch = line.match(/D0([123])\b/);
      if (dOpMatch) {
        operation = ["none", "draw", "move", "flash"][parseInt(dOpMatch[1])];
      }
    }

    // Handle aperture selection (D10+) — only match 2+ digit D codes
    const dApertureMatch = line.match(/\bD(\d{2,})\b/);
    if (dApertureMatch) {
      const dCode = parseInt(dApertureMatch[1]);
      if (dCode >= 10) currentAperture = dCode;
    }

    // Extract coordinate values
    const xMatch = line.match(/X([+-]?\d+)/);
    const yMatch = line.match(/Y([+-]?\d+)/);
    const iMatch = line.match(/I([+-]?\d+)/);
    const jMatch = line.match(/J([+-]?\d+)/);

    const hasX = xMatch !== null;
    const hasY = yMatch !== null;

    // Only process lines that have coordinates or an explicit operation
    if (hasX || hasY || operation !== null) {
      let newX = hasX ? parseCoord(xMatch[1]) : currentX;
      let newY = hasY ? parseCoord(yMatch[1]) : currentY;
      const iVal = iMatch ? parseCoord(iMatch[1]) : 0;
      const jVal = jMatch ? parseCoord(jMatch[1]) : 0;

      // If no explicit D code on this line, inherit the last modal operation
      if (operation === null) {
        operation = lastOperation;
      }

      const rawX = hasX ? xMatch[1] : "-";
      const rawY = hasY ? yMatch[1] : "-";
      console.log(`[GerberParser] line="${line}" rawX=${rawX} rawY=${rawY} parsedX=${newX.toFixed(3)} parsedY=${newY.toFixed(3)} op=${operation} mode=${interpolateMode}`);

      if (operation === "draw" && interpolateMode === 1) {
        const x1 = toMm(currentX), y1 = toMm(currentY);
        const x2 = toMm(newX), y2 = toMm(newY);
        if (x1 !== x2 || y1 !== y2) {
          if (outline.length === 0 || outline[outline.length - 1] === null) {
            outline.push({ x: x1, y: y1 });
          }
          outline.push({ x: x2, y: y2 });
        }
      } else if (operation === "draw" && (interpolateMode === 2 || interpolateMode === 3)) {
        const cx = toMm(currentX + iVal), cy = toMm(currentY + jVal);
        const startX = toMm(currentX), startY = toMm(currentY);
        const endX = toMm(newX), endY = toMm(newY);
        const radius = Math.hypot(cx - startX, cy - startY);
        if (radius > 0.001) {
          const startAngle = Math.atan2(startY - cy, startX - cx);
          let endAngle = Math.atan2(endY - cy, endX - cx);
          let angleDiff = endAngle - startAngle;
          if (interpolateMode === 2) {
            if (angleDiff > 0) angleDiff -= 2 * Math.PI;
          } else {
            if (angleDiff < 0) angleDiff += 2 * Math.PI;
          }
          const steps = Math.max(8, Math.ceil(Math.abs(angleDiff) / (Math.PI / 16)));
          for (let s = 1; s <= steps; s++) {
            const t = s / steps;
            const a = startAngle + angleDiff * t;
            outline.push({ x: Math.round((cx + radius * Math.cos(a)) * 1000) / 1000, y: Math.round((cy + radius * Math.sin(a)) * 1000) / 1000 });
          }
        }
      }

      if (operation === "move" || operation === null) {
        if (hasX || hasY) {
          // Insert null to break the path — next draw starts a new subpath
          if (outline.length > 0 && outline[outline.length - 1] !== null) {
            outline.push(null);
          }
          currentX = newX;
          currentY = newY;
        }
      }
      if ((operation === "draw" || operation === "flash") && (hasX || hasY)) {
        currentX = newX;
        currentY = newY;
      }

      // Remember the last operation for modal continuation
      if (operation !== null && operation !== "none") {
        lastOperation = operation;
      }
    }
  }

  const cleaned = [];
  for (const pt of outline) {
    if (pt === null) {
      // Always keep path-break markers
      if (cleaned.length > 0 && cleaned[cleaned.length - 1] !== null) {
        cleaned.push(null);
      }
      continue;
    }
    if (cleaned.length === 0 || cleaned[cleaned.length - 1] === null) {
      cleaned.push(pt);
      continue;
    }
    const last = cleaned[cleaned.length - 1];
    if (Math.abs(last.x - pt.x) > 0.001 || Math.abs(last.y - pt.y) > 0.001) {
      cleaned.push(pt);
    }
  }
  console.log(`[GerberParser] Final outline: ${cleaned.length} points`, cleaned);
  return cleaned;
}

function show() {
  if (modalEl.value) {
    const modal = new Modal(modalEl.value);
    modal.show();
  }
}

function close() {
  if (modalEl.value) {
    const instance = Modal.getInstance(modalEl.value);
    if (instance) instance.hide();
  }
}

defineExpose({ openZipFile, show, close });
</script>

<style scoped>
.modal-body {
  max-height: 60vh;
}
.form-check {
  padding: 0.25rem 0 0.25rem 1.75rem;
}
.form-check-label {
  cursor: pointer;
}
code {
  font-size: 0.85em;
}
.progress-steps {
  font-size: 0.9rem;
}
.progress-step .step-icon {
  width: 1.2em;
  text-align: center;
}
</style>
