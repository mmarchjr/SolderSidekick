# Multi-PCB Implementation Plan

## Phase 1: Data Model Refactor ✅

### 1.1 Define PCB Entity
**File:** `src/stores/store.js`

Create a `createPcb()` factory function that returns a PCB object:
```javascript
{
  id: string,              // "pcb_" + timestamp
  filename: string,        // Original filename
  drillData: [],           // Array of drill point objects
  path: [],                // Ordered path of drill point IDs
  toolSizes: {},           // Tool ID → diameter (mm)
  outline: [],             // Board outline points (drill space)
  originOffsetX: 16,       // PCB position on bed
  originOffsetY: 16,
  rotation: 0,             // Degrees
  thickness: 1.6,          // mm
  noGoZones: [],           // Per-PCB zones (drill coordinate space)
  viaFilterDiameter: 0.4,  // mm
}
```

### 1.2 Refactor Store State
**File:** `src/stores/store.js`

Replace flat single-PCB state with:
```javascript
state: () => ({
  pcbs: [],                    // Array of PCB objects
  activePcbId: null,           // Currently selected PCB
  globalNoGoZones: [],         // Bed-space no-go zones
  // Spline curves (global)
  splineCurves: {
    soak: [],                  // [{area: mm², value: seconds}, ...]
    feed: [],                  // [{area: mm², value: mm}, ...]
    dwell: [],                 // [{area: mm², value: seconds}, ...]
  },
  // Machine/profile settings (unchanged)
  mountHeight: 28.8,
  feedPrime: 2.75,
  feedRetract: 0.25,
  defaultSolderAllPoints: false,
  defaultSoakTime: 4.0,
  defaultSolderFeed: 5.0,
  defaultDwellTime: 1.5,
  // ... rest of profile settings unchanged
})
```

Remove from root state: `drillData`, `path`, `toolSizes`, `drillFilename`, `originOffsetX`, `originOffsetY`, `rotation`, `pcbThickness`, `noGoZones`, `pcbOutline`, `viaFilterDiameter`.

### 1.3 Add Active PCB Getter
**File:** `src/stores/store.js`

Add computed getter:
```javascript
activePcb: (state) => state.pcbs.find(p => p.id === state.activePcbId) || null
```

### 1.4 Add PCB Management Actions
**File:** `src/stores/store.js`

New actions:
- `addPcb(pcbData)` — Add a new PCB to the tray, set as active
- `removePcb(pcbId)` — Remove a PCB from the tray
- `duplicatePcb(pcbId)` — Deep-copy a PCB (including no-go zones)
- `clearAllPcbs()` — Remove all PCBs
- `setActivePcb(pcbId)` — Change the active PCB
- `reorderPcbs(fromIndex, toIndex)` — Drag-and-drop reorder

### 1.5 Refactor `drillToBedSpace()`
**File:** `src/stores/store.js`

Change signature to accept a PCB object:
```javascript
drillToBedSpace(drill, pcb) {
  const rad = -(pcb.rotation * Math.PI) / 180;
  // ... apply pcb.originOffsetX/Y
}
```

### 1.6 Refactor No-Go Zone Logic
**File:** `src/stores/store.js`

Split into two methods:
- `isPointInGlobalNoGoZone(x, y)` — Tests bed-space coordinates against `globalNoGoZones`
- `isPointInPcbNoGoZone(drill, pcb)` — Transforms drill point to bed space, tests against `pcb.noGoZones`

Update `computeRouteAroundZones()` to accept both zone arrays.

---

## Phase 2: G-code Generator Refactor ✅

### 2.1 Refactor `getSolderPoints()`
**File:** `src/composables/useGcodeGenerator.js`

Change to iterate over all PCBs in visit order:
```javascript
function getSolderPoints() {
  const points = [];
  for (const pcb of drillStore.pcbs) {
    const angle = -(pcb.rotation * Math.PI) / 180;
    for (const id of pcb.path) {
      const drill = pcb.drillData.find(d => d.id === id);
      if (drill && drill.solder) {
        // Apply pcb-specific rotation and offset
        points.push({
          ...drill,
          transformedX: rotatedX + pcb.originOffsetX,
          transformedY: rotatedY + pcb.originOffsetY,
          pcbId: pcb.id,
          pcbIndex: drillStore.pcbs.indexOf(pcb),
          pcbName: pcb.filename,
          pcbThickness: pcb.thickness,
        });
      }
    }
  }
  return points;
}
```

### 2.2 Add PCB Transition Logic
**File:** `src/composables/useGcodeGenerator.js`

In `generateGcode()`, detect PCB transitions and insert:
1. Safe-Z lift (`G0 Z{START_SAFE_Z}`)
2. Travel to next PCB's first point
3. PCB comment (`; --- PCB N: filename ---`)

### 2.3 Update Template Variables
**File:** `src/composables/useGcodeGenerator.js`

Per-point variables now include:
- `PCB_THICKNESS` — from the point's PCB
- `PCB_INDEX` — 1-based index of the PCB
- `PCB_NAME` — filename of the PCB

Remove `PCB_THICKNESS` from start G-code template variables.

### 2.4 Spline Curve Interpolation
**File:** `src/composables/useGcodeGenerator.js`

Add helper function:
```javascript
function interpolateSpline(curve, padArea) {
  // curve is sorted array of {area, value}
  // Find bracketing points and linearly interpolate
}
```

Replace `point.soak`, `point.feed`, `point.dwell` with:
```javascript
SOAK: interpolateSpline(drillStore.splineCurves.soak, padArea),
FEED: interpolateSpline(drillStore.splineCurves.feed, padArea),
DWELL: interpolateSpline(drillStore.splineCurves.dwell, padArea),
```

Pad area calculated from `point.size` (tool diameter).

---

## Phase 3: File Handling Refactor ✅

### 3.1 Refactor `setDrillData()` → `setPcbDrillData()`
**File:** `src/stores/store.js`

Rename and change to operate on a specific PCB:
```javascript
setPcbDrillData(pcbId, parsedDrills, toolSizes) {
  const pcb = this.pcbs.find(p => p.id === pcbId);
  if (!pcb) return;
  pcb.drillData = parsedDrills.map((d, i) => ({
    ...d,
    id: i,
    solder: false,
    selected: false,
    pathIndex: null,
    feed: this.defaultSolderFeed,
    soak: this.defaultSoakTime,
    dwell: this.defaultDwellTime,
    xOffset: 0.0,
    yOffset: 0.0,
    zOffset: 0.0,
  }));
  pcb.toolSizes = toolSizes;
  pcb.path = [];
  this.updatePcbPathIndices(pcbId);
}
```

### 3.2 Refactor File Parser
**File:** `src/composables/useFileHandlers.js`

`parseDrillFile()` should:
1. Parse the Excellon file (existing logic)
2. Create a new PCB object
3. Call `addPcb()` then `setPcbDrillData()` on the new PCB
4. Set the new PCB as active

### 3.3 Refactor Project Save/Load
**File:** `src/composables/useFileHandlers.js`

**Save (v2 format):**
```javascript
{
  version: 2,
  pcbs: [...],
  activePcbId: "...",
  globalNoGoZones: [...],
  splineCurves: {...},
  profiles: {...},
  currentProfile: "Default",
}
```

**Load:**
- Detect `version` field
- If missing or `1`: convert single-PCB format to v2 (wrap in `pcbs[]`)
- If `2`: load directly

### 3.4 Refactor ImportWizard
**File:** `src/components/ImportWizard.vue`

- Remove duplicated parser code — import from `useFileHandlers.js`
- Import adds new PCB to tray (not replacing)
- Parser creates PCB object and calls `addPcb()`

---

## Phase 4: UI Refactor ✅

### 4.1 Sidebar PCB List
**File:** `src/components/ToolpathEditor.vue`

Add PCB list component to sidebar:
- ✅ Collapsible list of PCBs
- ✅ Click to select (sets `activePcbId`)
- ✅ Drag-and-drop to reorder
- ✅ Right-click context menu: Duplicate, Delete
- ✅ "Add PCB" button opens file picker
- ✅ "Clear All" button with confirmation

### 4.2 PCB Properties Panel
**File:** `src/components/ToolpathEditor.vue`

When a PCB is selected, show:
- ✅ Filename (read-only)
- ✅ Origin X/Y offset (number inputs)
- ✅ Rotation (number input + rotate buttons)
- ✅ Thickness (number input)
- ✅ Via filter diameter (number input)
- ✅ Per-PCB no-go zones list

### 4.3 Refactor Drill Point Table
**File:** `src/components/ToolpathEditor.vue`

- ✅ Filter to active PCB's drill data only
- ✅ Remove soak/feed/dwell columns (replaced by spline graphs)
- ✅ Keep: tool, size, solder toggle, X/Y/Z offsets

### 4.4 Refactor Canvas Rendering
**File:** `src/components/ToolpathEditor.vue`

Loop over all PCBs:
- Draw outlines (dimmed for inactive)
- Draw drill points (dimmed for inactive)
- Draw per-PCB no-go zones (always visible)
- Draw global no-go zones (always visible)
- Highlight active PCB outline

### 4.5 Refactor No-Go Zone Drawing
**File:** `src/components/ToolpathEditor.vue`

When drawing a new no-go zone:
- If global mode: store in `globalNoGoZones` (bed space)
- If per-PCB mode: store in active PCB's `noGoZones` (drill space)
- Toggle between modes in the UI

### 4.6 Per-PCB Origin Calculator
**File:** `src/components/ToolpathEditor.vue`

Adapt existing origin calculator:
- ✅ Select drill point on active PCB
- ✅ Enter machine coordinates
- ✅ Calculate `originOffsetX/Y` for the active PCB (not machine origin)

### 4.7 Refactor 3D Simulator
**File:** `src/components/GcodeSimulator.vue`

- `buildPCB()` loops over all PCBs
- Each PCB renders at its bed-space position
- Camera auto-fits to full tray
- G-code parser unchanged (already handles full output)

---

## Phase 5: Spline Graph UI ✅

### 5.1 Spline Graph Component
**File:** `src/components/SplineGraphEditor.vue` (new)

- SVG-based graph with draggable control points
- X-axis: pad area (mm²), auto-scaled to loaded PCBs
- Y-axis: value (seconds or mm)
- Max 10 control points
- Add point by clicking curve
- Remove point by right-clicking
- Shows drill point dots on graph (visual feedback)

### 5.2 Advanced Settings Integration
**File:** `src/components/MachineConfig.vue`

Add spline graph section:
- Three graphs (soak, feed, dwell)
- Default linear slope curves
- Saved to store and project file

---

## Phase 6: Cleanup ✅

### 6.1 Remove Duplicated Parser Code
**File:** `src/components/ImportWizard.vue`

- Import `parseDrillFile` and `parseGerberFile` from composables
- Remove inline parser duplicates (~300 lines)

### 6.2 Update Default Templates
**File:** `src/stores/store.js` (or template file)

- Remove `PCB_THICKNESS` from start G-code template
- Add comment noting `PCB_THICKNESS` is available in per-point template

### 6.3 Undo/Redo Refactor
**File:** `src/stores/store.js`

- ✅ Snapshot entire `pcbs[]` array (deep copy)
- ✅ Include `activePcbId` in snapshots
- ✅ Add/remove PCB operations push to undo stack

---

## Implementation Order

All phases completed:

1. **Phase 1** (Data Model) ✅ — Foundation
2. **Phase 2** (G-code Generator) ✅ — Multi-PCB iteration, splines
3. **Phase 3** (File Handling) ✅ — Parser refactor, v2 project format
4. **Phase 4** (UI) ✅ — Sidebar, canvas, no-go zones, simulator
5. **Phase 5** (Spline Graphs) ✅ — SVG graph component in Advanced Settings
6. **Phase 6** (Cleanup) ✅ — Duplicated parser removed, undo/redo updated

## Key Risks

- **ImportWizard parser duplication** — Must be cleaned up to avoid maintenance burden. Import from composables instead of duplicating.
- **Undo memory** — Full snapshots with multiple PCBs could grow large. Monitor and add limits if needed.
- **Canvas performance** — Rendering many PCBs with many drill points could slow down. Use instanced rendering (already done for single PCB).
