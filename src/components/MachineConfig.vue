<script setup>
import { ref, watch, onMounted, computed  } from "vue";
import ProfileManager from './ProfileManager.vue';
import GcodeEditor from './GcodeEditor.vue';
import SplineGraphEditor from './SplineGraphEditor.vue';

import { useDrillStore } from "@/stores/store";


const drillStore = useDrillStore();


// Profile selection
const selectedProfile = computed({
  get: () => drillStore.currentProfile,
  set: (val) => drillStore.setCurrentProfile(val)
});

const profileNames = computed(() => Object.keys(drillStore.profiles));

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


const pcbThickness = computed({
  get: () => drillStore.pcbThickness,
  set: (val) => {
    drillStore.pcbThickness = val;
  }
});

const bedWidth = computed({
  get: () => drillStore.profiles[drillStore.currentProfile].bedWidth ?? 235,
  set: (val) => {
    drillStore.updateCurrentProfileSettings({ bedWidth: val });
    drillStore.triggerCanvasUpdate();
  }
});

const bedHeight = computed({
  get: () => drillStore.profiles[drillStore.currentProfile].bedHeight ?? 235,
  set: (val) => {
    drillStore.updateCurrentProfileSettings({ bedHeight: val });
    drillStore.triggerCanvasUpdate();
  }
});

const startSafeZ = computed({
  get: () => drillStore.profiles[drillStore.currentProfile].startSafeZ,
  set: (val) => drillStore.updateCurrentProfileSettings({ startSafeZ: val })
});

const solderSafeZ = computed({
  get: () => drillStore.profiles[drillStore.currentProfile].solderSafeZ,
  set: (val) => drillStore.updateCurrentProfileSettings({ solderSafeZ: val })
});

const solderPrimeZ = computed({
  get: () => drillStore.profiles[drillStore.currentProfile].solderPrimeZ,
  set: (val) => drillStore.updateCurrentProfileSettings({ solderPrimeZ: val })
});

const endSafeZ = computed({
  get: () => drillStore.profiles[drillStore.currentProfile].endSafeZ,
  set: (val) => drillStore.updateCurrentProfileSettings({ endSafeZ: val })
});

const solderFeedMultiplier = computed({
  get: () => drillStore.profiles[drillStore.currentProfile].solderFeedMultiplier,
  set: (val) => drillStore.updateCurrentProfileSettings({ solderFeedMultiplier: val })
});

const feedPrime = computed({
  get: () => drillStore.profiles[drillStore.currentProfile].feedPrime,
  set: (val) => drillStore.updateCurrentProfileSettings({ feedPrime: val })
});

const feedRetract = computed({
  get: () => drillStore.profiles[drillStore.currentProfile].feedRetract,
  set: (val) => drillStore.updateCurrentProfileSettings({ feedRetract: val })
});

const retractAfterSolder = computed({
  get: () => drillStore.profiles[drillStore.currentProfile].retractAfterSolder,
  set: (val) => drillStore.updateCurrentProfileSettings({ retractAfterSolder: val })
});

const playBeep = computed({
  get: () => drillStore.profiles[drillStore.currentProfile].playBeep,
  set: (val) => drillStore.updateCurrentProfileSettings({ playBeep: val })
});

const startGcode = computed({
  get: () => drillStore.profiles[drillStore.currentProfile].startGcode,
  set: (val) => drillStore.updateCurrentProfileSettings({ startGcode: val })
});

const perPointGcode = computed({
  get: () => drillStore.profiles[drillStore.currentProfile].perPointGcode,
  set: (val) => drillStore.updateCurrentProfileSettings({ perPointGcode: val })
});

const endGcode = computed({
  get: () => drillStore.profiles[drillStore.currentProfile].endGcode,
  set: (val) => drillStore.updateCurrentProfileSettings({ endGcode: val })
});

// Add new computed property for point offset X
const solderOffset = computed({
  get: () => drillStore.profiles[drillStore.currentProfile].solderOffset ?? 0,
  set: (val) => drillStore.updateCurrentProfileSettings({ solderOffset: val })
});

function resetToDefaults() {
  drillStore.resetCurrentProfileToDefault();
}

const splineSoak = computed({
  get: () => drillStore.splineCurves.soak,
  set: (val) => { drillStore.splineCurves.soak = val; }
});
const splineFeed = computed({
  get: () => drillStore.splineCurves.feed,
  set: (val) => { drillStore.splineCurves.feed = val; }
});
const splineDwell = computed({
  get: () => drillStore.splineCurves.dwell,
  set: (val) => { drillStore.splineCurves.dwell = val; }
});
const splineGraphMaxX = computed({
  get: () => drillStore.splineGraphMaxX,
  set: (val) => { drillStore.splineGraphMaxX = val; }
});
const splineGraphMaxY = computed({
  get: () => drillStore.splineGraphMaxY,
  set: (val) => { drillStore.splineGraphMaxY = val; }
});
const splineGraphXIncrement = computed({
  get: () => drillStore.splineGraphXIncrement,
  set: (val) => { drillStore.splineGraphXIncrement = val; }
});

const allDrillAreas = computed(() => {
  const areas = [];
  const viaFilterDiameter = drillStore.viaFilterDiameter ?? 0.4;
  
  for (const pcb of drillStore.pcbs) {
    for (const d of pcb.drillData) {
      const diameter = parseFloat(d.size);
      // Only include holes larger than the via filter diameter
      if (!isNaN(diameter) && diameter > viaFilterDiameter) {
        areas.push(Math.PI * Math.pow(diameter / 2, 2));
      }
    }
  }
  return areas;
});

const maxDrillArea = computed(() => {
  if (allDrillAreas.value.length === 0) return 50;
  return Math.max(...allDrillAreas.value) * 1.2;
});

</script>

<template>
  <div class="modal fade" id="machineConfigModal" tabindex="-1" aria-hidden="true">
    <div class="modal-dialog modal-xl modal-dialog-scrollable modal-fullscreen-ish">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title">
            <i class="fa-solid fa-gears"></i> Advanced Settings
          </h5>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>

        <div class="modal-body">
          <div class="container-fluid">


           <div class="mb-3 d-flex align-items-center">
  <label class="me-2">Profile:</label>
  <ProfileManager />
  <button class="btn btn-outline-secondary ms-3" @click="resetToDefaults">
    Reset to Defaults
  </button>
</div>


            <!-- Start G-code Settings + GcodeEditor in same row -->
            <div class="row">
              <div class="col-md-6">
                <h5 class="mt-3"><i class="fa-solid fa-play"></i> Start G-code</h5>

                <label class="form-label mt-3" title="{PCB_THICKNESS}">PCB Thickness (mm)</label>
                <input type="number" class="form-control" v-model="pcbThickness" step="0.1" />

                <label class="form-label mt-3">Bed Size (mm)</label>
                <div class="row">
                  <div class="col-6">
                    <label class="form-label form-label-sm">Width</label>
                    <input type="number" class="form-control" v-model.number="bedWidth" step="1" min="1" />
                  </div>
                  <div class="col-6">
                    <label class="form-label form-label-sm">Height</label>
                    <input type="number" class="form-control" v-model.number="bedHeight" step="1" min="1" />
                  </div>
                </div>

                <label class="form-label mt-3" title="{START_SAFE_Z}">Start Safe Z</label>
                <input type="number" class="form-control" v-model="startSafeZ" step="0.1" />

                <label class="form-label mt-3" title="{MULTIPLIER}">Solder Feed Multiplier</label>
                <input type="number" class="form-control" v-model="solderFeedMultiplier" step="0.1"/>
              </div>

              <div class="col-md-6">
                <GcodeEditor
                  :code="startGcode"
                  title="Start G-code"
                  icon="fa-play"
                  @update:code="startGcode = $event"
                />
              </div>
            </div>

            <!-- Per Point + End Settings remain grouped -->
            <div class="row mt-4">
              <div class="col-md-6">
                <h5><i class="fa-solid fa-crosshairs"></i> Per Point G-code</h5>

                <label class="form-label mt-3" title="{PRIME}">Solder Prime</label>
                <input type="number" class="form-control" v-model="feedPrime" step="0.1"/>

                <label class="form-label mt-3" title="{PRIME_RETRACT}">Solder Prime Retract</label>
                <input type="number" class="form-control" v-model="feedRetract" step="0.1"/>

                <label class="form-label mt-3" title="{SOLDER_OFFSET}">Solder Offset</label>
                <input type="number" class="form-control" v-model="solderOffset" step="0.1" />

                <label class="form-label mt-3" title="{RETRACT}">Solder Retract</label>
                <input type="number" class="form-control" v-model="retractAfterSolder" step="0.1"/>

                <label class="form-label mt-3" title="{SOLDER_SAFE_Z}">Solder Prime Z</label>
                <input type="number" class="form-control" v-model="solderPrimeZ" step="0.1"/>

                <label class="form-label mt-3" title="{SOLDER_SAFE_Z}">Solder Safe Z</label>
                <input type="number" class="form-control" v-model="solderSafeZ" step="0.1"/>
              </div>

              <div class="col-md-6">
                <GcodeEditor
                  :code="perPointGcode"
                  title="Per-Point G-code"
                  icon="fa-crosshairs"
                  @update:code="perPointGcode = $event"
                />
              </div>
            </div>

            <div class="row mt-4">
              <div class="col-md-6">
                <h5><i class="fa-solid fa-stop"></i> End G-code</h5>
                <label class="form-label" title="{END_SAFE_Z}">End Safe Z</label>
                <input type="number" class="form-control" v-model="endSafeZ" step="0.1"/>

                <div class="form-check mt-3">
                  <input class="form-check-input" type="checkbox" v-model="playBeep" />
                  <label class="form-check-label" title="{BEEP}">Play Beep</label>
                </div>
              </div>

              <div class="col-md-6">
                <GcodeEditor
                  :code="endGcode"
                  title="End G-code"
                  icon="fa-stop"
                  @update:code="endGcode = $event"
                />
              </div>
            </div>

            <!-- Spline Graphs -->
            <div class="row mt-4">
              <div class="col-12">
                <h5><i class="fa-solid fa-chart-line"></i> Spline Graphs</h5>
                <p class="text-muted small">Map pad area (mm²) to soldering parameters. Click to add points, drag to adjust, right-click to remove. These override per-point soak/feed/dwell values.</p>
                
                <div class="row mt-2">
                  <div class="col-md-4">
                    <label class="form-label form-label-sm">Graph Max X (mm²)</label>
                    <input type="number" class="form-control form-control-sm" v-model.number="splineGraphMaxX" step="1" min="1" />
                  </div>
                  <div class="col-md-4">
                    <label class="form-label form-label-sm">Graph Max Y (value)</label>
                    <input type="number" class="form-control form-control-sm" v-model.number="splineGraphMaxY" step="0.1" min="0.1" />
                  </div>
                  <div class="col-md-4">
                    <label class="form-label form-label-sm">X Increment (snap)</label>
                    <input type="number" class="form-control form-control-sm" v-model.number="splineGraphXIncrement" step="0.5" min="0.5" />
                  </div>
                </div>
              </div>
              <div class="col-md-4">
                <SplineGraphEditor
                  v-model="splineSoak"
                  title="Soak Time"
                  yLabel="Time (s)"
                  :maxX="splineGraphMaxX"
                  :maxY="splineGraphMaxY"
                  :xIncrement="splineGraphXIncrement"
                  :drillAreas="allDrillAreas"
                />
              </div>
              <div class="col-md-4">
                <SplineGraphEditor
                  v-model="splineFeed"
                  title="Solder Feed"
                  yLabel="Feed (mm)"
                  :maxX="splineGraphMaxX"
                  :maxY="splineGraphMaxY"
                  :xIncrement="splineGraphXIncrement"
                  :drillAreas="allDrillAreas"
                />
              </div>
              <div class="col-md-4">
                <SplineGraphEditor
                  v-model="splineDwell"
                  title="Dwell Time"
                  yLabel="Time (s)"
                  :maxX="splineGraphMaxX"
                  :maxY="splineGraphMaxY"
                  :xIncrement="splineGraphXIncrement"
                  :drillAreas="allDrillAreas"
                />
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-fullscreen-ish {
  max-width: 95vw;
  max-height: 95vh;
  margin: 2.5vh auto;
}

.modal-fullscreen-ish .modal-content {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.modal-fullscreen-ish .modal-body {
  flex: 1;
  overflow-y: auto;
}

.gcode-textarea {
  min-height: 18vh;
  resize: vertical;
}
</style>