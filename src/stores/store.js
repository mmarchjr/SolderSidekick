import { defineStore } from "pinia";
import { ref, computed } from "vue";

let pcbIdCounter = 0;

export function createPcb(overrides = {}) {
  return {
    id: "pcb_" + Date.now() + "_" + (pcbIdCounter++),
    filename: "",
    drillData: [],
    path: [],
    toolSizes: {},
    outline: [],
    originOffsetX: 16,
    originOffsetY: 16,
    originOffsetZ: 0,
    rotation: 0,
    thickness: 1.6,
    noGoZones: [],
    viaFilterDiameter: 0.4,
    ...overrides,
  };
}

const startGcodeTemplate = `; Start G-code
M117 Homing XYZ
G28 X Y ; Home X and Y
G28 Z ; Home Z
G0 Z{START_SAFE_Z} F800 ; Initial lift height

M221 S{MULTIPLIER} ; Extruder multiplier
M302 S0 ; Allow cold extrusion
M83 ; Set extruder to relative mode

G0 X0 Y0 Z{START_SAFE_Z} F800 ; Initial lift height
`;

const perPointTemplate = `; Solder Point G-code
M117 Soldering {INDEX + 1}/{TOTAL_POINTS}
M73 P{INDEX / TOTAL_POINTS * 100} ; Set progress bar %
G0 X{X + X_OFFSET + SOLDER_OFFSET} Y{Y + Y_OFFSET} F6000 ; Move slightly to the right of the point
G1 Z{Z_OFFSET + SOLDER_PRIME_Z} F800; ; Get near the point
G1 E{PRIME} F600 ; Prime soldering iron with a small amount of solder
G1 E-{PRIME_RETRACT} F800 ; Retract solder from touching soldering iron
G1 Z{Z_OFFSET} F800; Move to PCB height
G1 X{X + X_OFFSET} F800 ; Move to solder point
G4 P{SOAK * 1000} ; Soak time (ms)
G1 E{FEED} F500 ; Solder the point
G1 E-{RETRACT} F800 ; Retract solder from touching soldering iron
G4 P{DWELL * 1000} ; Dwell time (ms)
G1 Z{Z_OFFSET + SOLDER_SAFE_Z} F800 ; Lift soldering iron`;

const endGcodeTemplate = `; End G-code
M117 Soldering Complete!
M73 P100 ; Set progress bar to 100%
G0 Z{END_SAFE_Z} F800 ; Lift soldering iron
G0 X200 Y200 ; Go to back corner

M300 S440 P{BEEP} ; Beep
G4 P500 ; Wait for 0.5 seconds
M300 S440 P{BEEP} ; Beep
G4 P500 ; Wait for 0.5 seconds
M300 S440 P{BEEP} ; Beep
`;

const defaultSplineCurves = {
  soak: [
    { area: 0, value: 0 },
    { area: 10, value: 2 },
    { area: 20, value: 4 },
    { area: 30, value: 6 },
    { area: 50, value: 10 },
  ],
  feed: [
    { area: 0, value: 0 },
    { area: 10, value: 3 },
    { area: 20, value: 6 },
    { area: 30, value: 9 },
    { area: 50, value: 15 },
  ],
  dwell: [
    { area: 0, value: 0 },
    { area: 10, value: 2 },
    { area: 20, value: 4 },
    { area: 30, value: 6 },
    { area: 50, value: 10 },
  ],
};

const defaultProfileSettings = {
  zeroX: null,
  zeroY: null,
  zeroZ: null,
  startSafeZ: 12,
  solderSafeZ: 3.5,
  solderPrimeZ: 3.5,
  endSafeZ: 12,
  solderFeedMultiplier: 104,
  feedPrime: 2.0,
  feedRetract: 0.25,
  retractAfterSolder: 0.5,
  playBeep: true,
  solderOffset: 0.25,
  pointOffsetX: 0.0,
  pointOffsetY: 0.0,
  pointOffsetZ: 0.0,
  bedWidth: 235,
  bedHeight: 235,
  startGcode: startGcodeTemplate,
  perPointGcode: perPointTemplate,
  endGcode: endGcodeTemplate,
  splineCurves: JSON.parse(JSON.stringify(defaultSplineCurves)),
  splineGraphMaxX: 50,
  splineGraphMaxY: 10,
  splineGraphXIncrement: 5,
};

export const useDrillStore = defineStore("drill", () => {
  // --- State ---
  const pcbs = ref([]);
  const activePcbId = ref(null);
  const globalNoGoZones = ref([]);

  const splineCurves = computed({
    get() {
      const profile = profiles.value[currentProfile.value];
      if (!profile || !profile.splineCurves) {
        return defaultProfileSettings.splineCurves;
      }
      return profile.splineCurves;
    },
    set(val) {
      const profile = profiles.value[currentProfile.value];
      if (profile) {
        profile.splineCurves = val;
        saveProfilesToStorage();
      }
    }
  });

  const splineGraphMaxX = computed({
    get() {
      const profile = profiles.value[currentProfile.value];
      return profile?.splineGraphMaxX ?? 50;
    },
    set(val) {
      const profile = profiles.value[currentProfile.value];
      if (profile) {
        profile.splineGraphMaxX = val;
        saveProfilesToStorage();
      }
    }
  });

  const splineGraphMaxY = computed({
    get() {
      const profile = profiles.value[currentProfile.value];
      return profile?.splineGraphMaxY ?? 10;
    },
    set(val) {
      const profile = profiles.value[currentProfile.value];
      if (profile) {
        profile.splineGraphMaxY = val;
        saveProfilesToStorage();
      }
    }
  });

  const splineGraphXIncrement = computed({
    get() {
      const profile = profiles.value[currentProfile.value];
      return profile?.splineGraphXIncrement ?? 5;
    },
    set(val) {
      const profile = profiles.value[currentProfile.value];
      if (profile) {
        profile.splineGraphXIncrement = val;
        saveProfilesToStorage();
      }
    }
  });
  const undoStack = ref([]);
  const redoStack = ref([]);
  const canvasShouldUpdate = ref(false);
  const mountHeight = ref(28.8);
  const feedPrime = ref(2.75);
  const feedRetract = ref(0.25);
  const defaultSoakTime = ref(4.0);
  const defaultSolderFeed = ref(5.0);
  const defaultDwellTime = ref(1.5);
  const defaultSolderOffset = ref(0.25);
  const defaultXOffset = ref(0.0);
  const defaultYOffset = ref(0.0);
  const defaultZOffset = ref(0.0);
  const defaultSolderAllPoints = ref(false);
  const profiles = ref({});
  const currentProfile = ref("Default");

  // --- Getters ---
  const activePcb = computed(() => pcbs.value.find(p => p.id === activePcbId.value) || null);

  const selectedPoints = computed(() => {
    const pcb = activePcb.value;
    return pcb ? pcb.drillData.filter(d => d.selected) : [];
  });

  const currentPcbThickness = computed(() => {
    return activePcb.value?.thickness ?? 1.6;
  });

  const currentBedWidth = computed(() => profiles.value[currentProfile.value]?.bedWidth ?? 235);
  const currentBedHeight = computed(() => profiles.value[currentProfile.value]?.bedHeight ?? 235);
  const zeroX = computed(() => profiles.value[currentProfile.value]?.zeroX ?? null);
  const zeroY = computed(() => profiles.value[currentProfile.value]?.zeroY ?? null);
  const zeroZ = computed(() => profiles.value[currentProfile.value]?.zeroZ ?? null);

  // --- Backward-compatible proxies to active PCB ---
  const drillData = computed({
    get() { return activePcb.value?.drillData ?? []; },
    set(val) { const pcb = activePcb.value; if (pcb) pcb.drillData = val; },
  });
  const path = computed({
    get() { return activePcb.value?.path ?? []; },
    set(val) { const pcb = activePcb.value; if (pcb) pcb.path = val; },
  });
  const toolSizes = computed({
    get() { return activePcb.value?.toolSizes ?? {}; },
    set(val) { const pcb = activePcb.value; if (pcb) pcb.toolSizes = val; },
  });
  const drillFilename = computed({
    get() { return activePcb.value?.filename ?? ""; },
    set(val) { const pcb = activePcb.value; if (pcb) pcb.filename = val; },
  });
  const originOffsetX = computed({
    get() { return activePcb.value?.originOffsetX ?? 16; },
    set(val) { const pcb = activePcb.value; if (pcb) pcb.originOffsetX = val; },
  });
  const originOffsetY = computed({
    get() { return activePcb.value?.originOffsetY ?? 16; },
    set(val) { const pcb = activePcb.value; if (pcb) pcb.originOffsetY = val; },
  });
  const originOffsetZ = computed({
    get() { return activePcb.value?.originOffsetZ ?? 0; },
    set(val) { const pcb = activePcb.value; if (pcb) pcb.originOffsetZ = val; },
  });
  const rotation = computed({
    get() { return activePcb.value?.rotation ?? 0; },
    set(val) { const pcb = activePcb.value; if (pcb) pcb.rotation = val; },
  });
  const pcbThickness = computed({
    get() { return activePcb.value?.thickness ?? 1.6; },
    set(val) { const pcb = activePcb.value; if (pcb) pcb.thickness = val; },
  });
  const noGoZones = computed({
    get() { return activePcb.value?.noGoZones ?? []; },
    set(val) { const pcb = activePcb.value; if (pcb) pcb.noGoZones = val; },
  });
  const pcbOutline = computed({
    get() { return activePcb.value?.outline ?? []; },
    set(val) { const pcb = activePcb.value; if (pcb) pcb.outline = val; },
  });
  const viaFilterDiameter = computed({
    get() { return activePcb.value?.viaFilterDiameter ?? 0.4; },
    set(val) { const pcb = activePcb.value; if (pcb) pcb.viaFilterDiameter = val; },
  });


  // --- Profile actions ---
  function initProfiles() {
    const stored = localStorage.getItem("solderProfiles");
    const storedCurrentProfile = localStorage.getItem("solderCurrentProfile");
    if (stored) profiles.value = JSON.parse(stored);
    if (Object.keys(profiles.value).length === 0) {
      profiles.value["Default"] = JSON.parse(JSON.stringify(defaultProfileSettings));
      saveProfilesToStorage();
    }
    for (let key in profiles.value) {
      // Merge defaults to ensure all fields exist
      profiles.value[key] = { ...JSON.parse(JSON.stringify(defaultProfileSettings)), ...profiles.value[key] };
    }
    if (storedCurrentProfile && profiles.value[storedCurrentProfile]) {
      currentProfile.value = storedCurrentProfile;
    } else if (!profiles.value[currentProfile.value]) {
      currentProfile.value = Object.keys(profiles.value)[0] || "Default";
    }
    loadSettingsFromProfile(currentProfile.value);
  }

  function createProfile(name) {
    if (!name || name.trim().length === 0) throw new Error("Profile name must be at least 1 character");
    if (profiles.value[name]) throw new Error("Profile already exists");
    profiles.value[name] = { ...profiles.value[currentProfile.value] };
    saveProfilesToStorage();
    return name;
  }

  function deleteProfile(name) {
    if (Object.keys(profiles.value).length <= 1) throw new Error("Cannot delete the last profile");
    delete profiles.value[name];
    if (currentProfile.value === name) {
      currentProfile.value = Object.keys(profiles.value)[0];
      loadSettingsFromProfile(currentProfile.value);
      saveCurrentProfileToStorage();
    }
    saveProfilesToStorage();
  }

  function renameProfile(oldName, newName) {
    if (!newName || newName.trim().length === 0) throw new Error("Profile name must be at least 1 character");
    if (oldName === newName) return;
    if (profiles.value[newName]) throw new Error("Profile already exists");
    profiles.value[newName] = profiles.value[oldName];
    delete profiles.value[oldName];
    if (currentProfile.value === oldName) {
      currentProfile.value = newName;
      saveCurrentProfileToStorage();
    }
    saveProfilesToStorage();
  }

  function duplicateProfile(name, newName) {
    if (!newName || newName.trim().length === 0) throw new Error("Profile name must be at least 1 character");
    if (profiles.value[newName]) throw new Error("Profile already exists");
    profiles.value[newName] = { ...profiles.value[name] };
    saveProfilesToStorage();
    return newName;
  }

  function saveProfilesToStorage() {
    localStorage.setItem("solderProfiles", JSON.stringify(profiles.value));
  }

  function saveCurrentProfileToStorage() {
    localStorage.setItem("solderCurrentProfile", currentProfile.value);
  }

  function setCurrentProfile(name) {
    currentProfile.value = name;
    loadSettingsFromProfile(name);
    saveCurrentProfileToStorage();
  }

  function updateCurrentProfileSettings(newSettings) {
    profiles.value[currentProfile.value] = { ...profiles.value[currentProfile.value], ...newSettings };
    saveProfilesToStorage();
  }

  function resetCurrentProfileToDefault() {
    profiles.value[currentProfile.value] = JSON.parse(JSON.stringify(defaultProfileSettings));
    loadSettingsFromProfile(currentProfile.value);
    saveProfilesToStorage();
  }

  function loadProfilesFromProject(projectProfiles, projectCurrentProfile) {
    if (projectProfiles && Object.keys(projectProfiles).length > 0) {
      profiles.value = projectProfiles;
      for (let key in profiles.value) {
        profiles.value[key] = { ...JSON.parse(JSON.stringify(defaultProfileSettings)), ...profiles.value[key] };
      }
      if (projectCurrentProfile && profiles.value[projectCurrentProfile]) {
        currentProfile.value = projectCurrentProfile;
      } else {
        currentProfile.value = Object.keys(profiles.value)[0];
      }
      saveProfilesToStorage();
      saveCurrentProfileToStorage();
      loadSettingsFromProfile(currentProfile.value);
    }
  }

  function loadSettingsFromProfile(name) {
    const settings = profiles.value[name];
    if (!settings) return;
    // Load all profile settings into their respective refs
    if (settings.feedPrime !== undefined) feedPrime.value = settings.feedPrime;
    if (settings.feedRetract !== undefined) feedRetract.value = settings.feedRetract;
    // Note: Most settings are accessed directly from profiles.value[currentProfile.value]
    // via computed properties in components, so no need to load them into refs here
  }

  // --- Undo/Redo ---
  function addUndoSnapshot(snapshot) {
    if (undoStack.value.length >= 50) undoStack.value.shift();
    undoStack.value.push(snapshot);
  }

  function _takeSnapshot() {
    return {
      pcbs: JSON.parse(JSON.stringify(pcbs.value)),
      activePcbId: activePcbId.value,
    };
  }

  function _restoreSnapshot(snapshot) {
    pcbs.value = snapshot.pcbs;
    activePcbId.value = snapshot.activePcbId;
  }

  // --- File actions ---
  function setDrillFile(fileContent, filename) {
    const pcb = activePcb.value;
    if (pcb) pcb.filename = filename;
  }

  function clearDrillFile() {
    clearAllPcbs();
  }

  function triggerCanvasUpdate() {
    canvasShouldUpdate.value = true;
  }

  function acknowledgeCanvasUpdate() {
    canvasShouldUpdate.value = false;
  }

  // --- PCB Management ---
  function addPcb(overrides = {}) {
    addUndoSnapshot(_takeSnapshot());
    redoStack.value = [];
    const pcb = createPcb(overrides);
    pcbs.value.push(pcb);
    activePcbId.value = pcb.id;
    return pcb;
  }

  function removePcb(pcbId) {
    const idx = pcbs.value.findIndex(p => p.id === pcbId);
    if (idx === -1) return;
    addUndoSnapshot(_takeSnapshot());
    redoStack.value = [];
    pcbs.value.splice(idx, 1);
    if (activePcbId.value === pcbId) {
      activePcbId.value = pcbs.value.length > 0 ? pcbs.value[0].id : null;
    }
  }

  function duplicatePcb(pcbId) {
    const source = pcbs.value.find(p => p.id === pcbId);
    if (!source) return;
    addUndoSnapshot(_takeSnapshot());
    redoStack.value = [];
    const copy = createPcb({
      ...JSON.parse(JSON.stringify(source)),
      id: "pcb_" + Date.now() + "_" + (pcbIdCounter++),
      filename: source.filename + " (copy)",
      originOffsetX: source.originOffsetX + 10,
      originOffsetY: source.originOffsetY + 10,
    });
    // Reassign drill data IDs so they don't collide with the source
    copy.drillData = copy.drillData.map((d, i) => ({ ...d, id: i }));
    copy.path = copy.path.map(() => null).map((_, i) => i);
    const idx = pcbs.value.findIndex(p => p.id === pcbId);
    pcbs.value.splice(idx + 1, 0, copy);
    activePcbId.value = copy.id;
    return copy;
  }

  function clearAllPcbs() {
    pcbs.value = [];
    activePcbId.value = null;
    undoStack.value = [];
    redoStack.value = [];
  }

  function setActivePcb(pcbId) {
    if (pcbs.value.find(p => p.id === pcbId)) {
      activePcbId.value = pcbId;
    }
  }

  function reorderPcbs(fromIndex, toIndex) {
    addUndoSnapshot(_takeSnapshot());
    redoStack.value = [];
    const [moved] = pcbs.value.splice(fromIndex, 1);
    pcbs.value.splice(toIndex, 0, moved);
  }

  function setPcbDrillData(pcbId, parsedDrills, toolSizesObj = {}) {
    const pcb = pcbs.value.find(p => p.id === pcbId);
    if (!pcb) return;
    pcb.drillData = parsedDrills.map((d, i) => ({
      ...d,
      id: i,
      solder: defaultSolderAllPoints.value,
      selected: false,
      pathIndex: null,
      feed: defaultSolderFeed.value,
      soak: defaultSoakTime.value,
      dwell: defaultDwellTime.value,
      xOffset: defaultXOffset.value,
      yOffset: defaultYOffset.value,
      zOffset: defaultZOffset.value,
    }));
    pcb.toolSizes = toolSizesObj;
    pcb.path = [];
    updatePcbPathIndices(pcbId);
  }

  function restorePcbDrillData(pcbId, savedDrills, toolSizesObj = {}) {
    const pcb = pcbs.value.find(p => p.id === pcbId);
    if (!pcb) return;
    pcb.drillData = savedDrills.map((d, i) => ({
      ...d,
      id: i,
      // Preserve user-set values from saved data, with fallbacks to defaults
      solder: d.solder !== undefined ? d.solder : defaultSolderAllPoints.value,
      selected: d.selected !== undefined ? d.selected : false,
      pathIndex: d.pathIndex !== undefined ? d.pathIndex : null,
      feed: d.feed !== undefined ? d.feed : defaultSolderFeed.value,
      soak: d.soak !== undefined ? d.soak : defaultSoakTime.value,
      dwell: d.dwell !== undefined ? d.dwell : defaultDwellTime.value,
      xOffset: d.xOffset !== undefined ? d.xOffset : defaultXOffset.value,
      yOffset: d.yOffset !== undefined ? d.yOffset : defaultYOffset.value,
      zOffset: d.zOffset !== undefined ? d.zOffset : defaultZOffset.value,
    }));
    pcb.toolSizes = toolSizesObj;
    updatePcbPathIndices(pcbId);
  }

  function setPcbOutline(outline) {
    const pcb = activePcb.value;
    if (pcb) pcb.outline = outline || [];
  }

  // --- Path actions ---
  function toggleSelection(id) {
    const pcb = activePcb.value;
    if (!pcb) return;
    const drill = pcb.drillData.find(d => d.id === id);
    if (drill) drill.selected = !drill.selected;
  }

  function addToPath(id) {
    const pcb = activePcb.value;
    if (!pcb) return;
    if (!pcb.path.includes(id)) {
      addUndoSnapshot(_takeSnapshot());
      redoStack.value = [];
      pcb.path.push(id);
      updatePcbPathIndices(pcb.id);
    }
  }

  function removeFromPath(id) {
    const pcb = activePcb.value;
    if (!pcb) return;
    if (pcb.path.includes(id)) {
      addUndoSnapshot(_takeSnapshot());
      pcb.path = pcb.path.filter(p => p !== id);
      updatePcbPathIndices(pcb.id);
    }
  }

  function clearPath() {
    const pcb = activePcb.value;
    if (!pcb) return;
    addUndoSnapshot(_takeSnapshot());
    pcb.path = [];
    updatePcbPathIndices(pcb.id);
  }

  function undoLast() {
    if (undoStack.value.length === 0) return;
    redoStack.value.push(_takeSnapshot());
    const previous = undoStack.value.pop();
    _restoreSnapshot(previous);
  }

  function redoLast() {
    if (redoStack.value.length === 0) return;
    undoStack.value.push(_takeSnapshot());
    const next = redoStack.value.pop();
    _restoreSnapshot(next);
  }

  function saveTransformUndoState() {
    addUndoSnapshot(_takeSnapshot());
    redoStack.value = [];
  }

  function updatePcbPathIndices(pcbId) {
    const pcb = pcbs.value.find(p => p.id === pcbId);
    if (!pcb) return;
    pcb.drillData.forEach(d => d.pathIndex = null);
    pcb.path.forEach((id, i) => {
      const d = pcb.drillData.find(drill => drill.id === id);
      if (d) d.pathIndex = i;
    });
  }

  // --- Global No-Go Zone actions ---
  function addGlobalNoGoZone(zone) {
    globalNoGoZones.value.push({
      id: Date.now() + Math.random(),
      x1: Math.min(zone.x1, zone.x2),
      y1: Math.min(zone.y1, zone.y2),
      x2: Math.max(zone.x1, zone.x2),
      y2: Math.max(zone.y1, zone.y2),
    });
  }

  function removeGlobalNoGoZone(id) {
    globalNoGoZones.value = globalNoGoZones.value.filter(z => z.id !== id);
  }

  function clearGlobalNoGoZones() {
    globalNoGoZones.value = [];
  }

  // --- Per-PCB No-Go Zone actions ---
  function addNoGoZone(zone) {
    const pcb = activePcb.value;
    if (!pcb) return;
    pcb.noGoZones.push({
      id: Date.now() + Math.random(),
      x1: Math.min(zone.x1, zone.x2),
      y1: Math.min(zone.y1, zone.y2),
      x2: Math.max(zone.x1, zone.x2),
      y2: Math.max(zone.y1, zone.y2),
    });
  }

  function removeNoGoZone(id) {
    const pcb = activePcb.value;
    if (!pcb) return;
    pcb.noGoZones = pcb.noGoZones.filter(z => z.id !== id);
  }

  function clearNoGoZones() {
    const pcb = activePcb.value;
    if (pcb) pcb.noGoZones = [];
  }

  // --- Coordinate transforms ---
  function drillToBedSpace(drill, pcb) {
    pcb = pcb || activePcb.value;
    if (!pcb) return { x: drill.x, y: drill.y };
    const rad = -(pcb.rotation * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    return {
      x: drill.x * cos - drill.y * sin + pcb.originOffsetX,
      y: drill.x * sin + drill.y * cos + pcb.originOffsetY,
    };
  }

  // --- No-Go zone helpers ---
  function _getAllNoGoZones(pcb) {
    pcb = pcb || activePcb.value;
    const perPcb = pcb ? pcb.noGoZones : [];
    return [...globalNoGoZones.value, ...perPcb];
  }

  function isPointInNoGoZone(drill, pcb) {
    const zones = _getAllNoGoZones(pcb);
    if (zones.length === 0) return false;
    const bed = drillToBedSpace(drill, pcb);
    return zones.some(z => bed.x >= z.x1 && bed.x <= z.x2 && bed.y >= z.y1 && bed.y <= z.y2);
  }

  function isPointInGlobalNoGoZone(x, y) {
    return globalNoGoZones.value.some(z => x >= z.x1 && x <= z.x2 && y >= z.y1 && y <= z.y2);
  }

  function isPointInPcbNoGoZone(drill, pcb) {
    if (!pcb || pcb.noGoZones.length === 0) return false;
    const bed = drillToBedSpace(drill, pcb);
    return pcb.noGoZones.some(z => bed.x >= z.x1 && bed.x <= z.x2 && bed.y >= z.y1 && bed.y <= z.y2);
  }

  function segmentCrossesNoGoZone(ax, ay, bx, by, zones) {
    zones = zones || _getAllNoGoZones();
    const dx = bx - ax;
    const dy = by - ay;
    for (const z of zones) {
      let tmin = 0, tmax = 1;
      if (dx !== 0) {
        let t1 = (z.x1 - ax) / dx;
        let t2 = (z.x2 - ax) / dx;
        if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
        tmin = Math.max(tmin, t1);
        tmax = Math.min(tmax, t2);
        if (tmin > tmax) continue;
      } else {
        if (ax < z.x1 || ax > z.x2) continue;
      }
      if (dy !== 0) {
        let t1 = (z.y1 - ay) / dy;
        let t2 = (z.y2 - ay) / dy;
        if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
        tmin = Math.max(tmin, t1);
        tmax = Math.min(tmax, t2);
        if (tmin > tmax) continue;
      } else {
        if (ay < z.y1 || ay > z.y2) continue;
      }
      return true;
    }
    return false;
  }

  function getNoGoCorners(margin, zones) {
    margin = margin ?? 0.5;
    zones = zones || _getAllNoGoZones();
    const corners = [];
    for (const z of zones) {
      const candidates = [
        { x: z.x1 - margin, y: z.y1 - margin },
        { x: z.x2 + margin, y: z.y1 - margin },
        { x: z.x2 + margin, y: z.y2 + margin },
        { x: z.x1 - margin, y: z.y2 + margin },
      ];
      for (const c of candidates) {
        const insideAny = zones.some(oz => c.x > oz.x1 && c.x < oz.x2 && c.y > oz.y1 && c.y < oz.y2);
        if (!insideAny) corners.push(c);
      }
    }
    return corners;
  }

  function computeRouteAroundZones(ax, ay, bx, by, zones) {
    zones = zones || _getAllNoGoZones();
    if (zones.length === 0) return [];
    if (!segmentCrossesNoGoZone(ax, ay, bx, by, zones)) return [];
    const corners = getNoGoCorners(0.5, zones);
    const nodes = [{ x: ax, y: ay }, ...corners, { x: bx, y: by }];
    const n = nodes.length;
    const endIdx = n - 1;
    const dist = new Array(n).fill(Infinity);
    const prev = new Array(n).fill(-1);
    const visited = new Array(n).fill(false);
    dist[0] = 0;
    for (let step = 0; step < n; step++) {
      let u = -1;
      for (let i = 0; i < n; i++) {
        if (!visited[i] && (u === -1 || dist[i] < dist[u])) u = i;
      }
      if (u === -1 || dist[u] === Infinity) break;
      if (u === endIdx) break;
      visited[u] = true;
      for (let v = 0; v < n; v++) {
        if (visited[v]) continue;
        if (segmentCrossesNoGoZone(nodes[u].x, nodes[u].y, nodes[v].x, nodes[v].y, zones)) continue;
        const d = dist[u] + Math.hypot(nodes[u].x - nodes[v].x, nodes[u].y - nodes[v].y);
        if (d < dist[v]) { dist[v] = d; prev[v] = u; }
      }
    }
    if (dist[endIdx] === Infinity) return [];
    const route = [];
    let cur = endIdx;
    while (cur !== -1) { route.push(cur); cur = prev[cur]; }
    route.reverse();
    return route.slice(1, -1).map(i => nodes[i]);
  }

  function routedDistance(ax, ay, bx, by, zones) {
    zones = zones || _getAllNoGoZones();
    if (zones.length === 0 || !segmentCrossesNoGoZone(ax, ay, bx, by, zones)) {
      return Math.hypot(bx - ax, by - ay);
    }
    const waypoints = computeRouteAroundZones(ax, ay, bx, by, zones);
    let d = 0, cx = ax, cy = ay;
    for (const wp of waypoints) { d += Math.hypot(wp.x - cx, wp.y - cy); cx = wp.x; cy = wp.y; }
    d += Math.hypot(bx - cx, by - cy);
    return d;
  }

  function _nearestNeighborWithZoneAvoidance(points, pcb) {
    if (points.length === 0) return [];
    pcb = pcb || activePcb.value;
    const zones = _getAllNoGoZones(pcb);
    const hasZones = zones.length > 0;
    const bedCoords = new Map();
    if (hasZones) { for (const d of points) bedCoords.set(d.id, drillToBedSpace(d, pcb)); }
    const pathArr = [];
    const visited = new Set();
    let current = points[0];
    pathArr.push(current.id);
    visited.add(current.id);
    while (pathArr.length < points.length) {
      const remaining = points.filter(d => !visited.has(d.id));
      if (remaining.length === 0) break;
      let best = null;
      if (hasZones) {
        const curBed = bedCoords.get(current.id);
        const scored = remaining.map(d => ({ drill: d, dist: routedDistance(curBed.x, curBed.y, bedCoords.get(d.id).x, bedCoords.get(d.id).y, zones) }));
        scored.sort((a, b) => a.dist - b.dist);
        best = scored[0].drill;
      } else {
        remaining.sort((a, b) => Math.hypot(current.x - a.x, current.y - a.y) - Math.hypot(current.x - b.x, current.y - b.y));
        best = remaining[0];
      }
      pathArr.push(best.id);
      visited.add(best.id);
      current = best;
    }
    return pathArr;
  }

  function autoOptimizePath() {
    const pcb = activePcb.value;
    if (!pcb) return;
    const unsorted = pcb.drillData.filter(d => d.solder && !isPointInNoGoZone(d, pcb));
    if (unsorted.length === 0) return;
    addUndoSnapshot(_takeSnapshot());
    pcb.path = _nearestNeighborWithZoneAvoidance(unsorted, pcb);
    updatePcbPathIndices(pcb.id);
  }

  function optimizeSelection() {
    const pcb = activePcb.value;
    if (!pcb) return;
    const selected = pcb.drillData.filter(d => d.selected);
    if (selected.length < 2) return;
    addUndoSnapshot(_takeSnapshot());
    redoStack.value = [];
    selected.forEach(d => { d.solder = true; });
    const newOrder = _nearestNeighborWithZoneAvoidance(selected, pcb);
    const idsToReplace = new Set(selected.map(d => d.id));
    pcb.path = pcb.path.filter(id => !idsToReplace.has(id));
    pcb.path.push(...newOrder);
    updatePcbPathIndices(pcb.id);
  }

  return {
    // State refs (for persistence plugin)
    pcbs, activePcbId, globalNoGoZones, splineCurves,
    splineGraphMaxX, splineGraphMaxY, splineGraphXIncrement,
    undoStack, redoStack, canvasShouldUpdate,
    mountHeight, feedPrime, feedRetract,
    defaultSoakTime, defaultSolderFeed, defaultDwellTime,
    defaultSolderOffset, defaultXOffset, defaultYOffset, defaultZOffset,
    defaultSolderAllPoints,
    profiles, currentProfile,

    // Getters
    activePcb, selectedPoints, currentPcbThickness, currentBedWidth, currentBedHeight,
    zeroX, zeroY, zeroZ,

    // Writable proxies
    drillData, path, toolSizes, drillFilename,
    originOffsetX, originOffsetY, originOffsetZ, rotation, pcbThickness,
    noGoZones, pcbOutline, viaFilterDiameter,

    // Actions
    initProfiles, createProfile, deleteProfile, renameProfile, duplicateProfile,
    saveProfilesToStorage, saveCurrentProfileToStorage,
    setCurrentProfile, updateCurrentProfileSettings, resetCurrentProfileToDefault,
    loadProfilesFromProject, loadSettingsFromProfile,
    addUndoSnapshot, _takeSnapshot, _restoreSnapshot,
    setDrillFile, clearDrillFile, triggerCanvasUpdate, acknowledgeCanvasUpdate,
    addPcb, removePcb, duplicatePcb, clearAllPcbs, setActivePcb, reorderPcbs,
    setPcbDrillData, restorePcbDrillData, setPcbOutline,
    toggleSelection, addToPath, removeFromPath, clearPath,
    undoLast, redoLast, saveTransformUndoState, updatePcbPathIndices,
    addGlobalNoGoZone, removeGlobalNoGoZone, clearGlobalNoGoZones,
    addNoGoZone, removeNoGoZone, clearNoGoZones,
    drillToBedSpace, _getAllNoGoZones,
    isPointInNoGoZone, isPointInGlobalNoGoZone, isPointInPcbNoGoZone,
    segmentCrossesNoGoZone, getNoGoCorners,
    computeRouteAroundZones, routedDistance,
    _nearestNeighborWithZoneAvoidance, autoOptimizePath, optimizeSelection,

    // Template constants
    defaultProfileSettings,
  };
}, {
  persist: {
    pick: ["pcbs", "activePcbId", "globalNoGoZones", "profiles", "currentProfile"],
  },
});
