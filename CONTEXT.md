# CONTEXT.md

## Glossary

### Core Concepts

**PCB** — A single printed circuit board loaded into the tray. Each PCB has its own drill data, outline, origin offset, rotation, thickness, no-go zones, and via filter. Stored as an object in the `pcbs[]` array.

**Tray** — The collection of all PCBs loaded on the build plate. The tray replaces the single-PCB state model. Managed via the sidebar PCB list.

**Active PCB** — The PCB currently selected for editing in the sidebar. Determines which drill points, outlines, and per-PCB no-go zones are shown in detail.

### Coordinate Spaces

**Drill Space** — The raw coordinate system from the Excellon file. Stored as `drill.x`, `drill.y`. Each PCB has its own drill space.

**Bed Space** — The 3D printer's physical coordinate system. Calculated by applying rotation and origin offset to drill space coordinates. Shared across all PCBs.

**Origin Offset** (`originOffsetX`, `originOffsetY`) — Per-PCB translation from drill space to bed space. Positions the PCB on the build plate.

**Origin Z Offset** (`originOffsetZ`) — Per-PCB elevation above the build plate surface in mm. Accounts for fixtures, jigs, or standoffs that raise the PCB. Factored into all Z coordinates during G-code generation and the origin calculator.

**Machine Origin** (`zeroX`, `zeroY`, `zeroZ`) — Global machine-level setting. The physical printer position where the bed-space origin is located. Set once per machine profile.

### No-Go Zones

**Global No-Go Zone** — A rectangular exclusion area in bed coordinate space. Applies regardless of which PCB is being soldered. Used for printer clamps, fixtures, etc.

**Per-PCB No-Go Zone** — A rectangular exclusion area in drill coordinate space. Transforms with the PCB when it is moved or rotated. Used for keep-out areas on the board (connectors, components).

### Path Optimization

**Per-PCB Path** — Default mode. The solder path is optimized independently within each PCB. PCBs are visited in sidebar list order.

**Cross-PCB Path** — Optional mode (advanced settings). All solder points from all PCBs are merged and optimized as one pool. The iron may jump between PCBs to minimize travel distance.

**Visit Order** — The sequence in which PCBs are soldered. Determined by the sidebar list order. Adjustable via drag-and-drop.

### Spline Graphs

**Area Spline Curve** — A piecewise-linear curve mapping pad area (mm²) to a soldering parameter value. Three independent curves exist: soak time, solder feed, and dwell time. Global across all PCBs.

**Pad Area** — The area of a drill hole's pad, calculated from the tool size: π × (diameter/2)². Used as the input to the spline curves.

### G-code Concepts

**Safe-Z Lift** — The iron lifts to a clearance height (`START_SAFE_Z`) when transitioning between PCBs. Prevents dragging the iron across boards.

**Per-PCB Comment** — A G-code comment (`; --- PCB N: filename ---`) inserted before each PCB's solder points. Generated automatically, not via template.

**Per-Point Template Variables** — Variables available in the per-point G-code template: `PCB_THICKNESS`, `PCB_INDEX`, `PCB_NAME` (new for multi-PCB), plus existing variables (X, Y, SOAK, FEED, DWELL, etc.).

### UI Concepts

**Sidebar PCB List** — The UI panel listing all PCBs in the tray. Supports selection, drag-and-drop reordering, duplicate, and delete. Drill point table appears below for the active PCB.

**Hybrid Positioning** — PCBs can be positioned on the bed via canvas drag-and-drop (rough) and coordinate entry (precise). Both methods are available simultaneously.

**Per-PCB Origin Calculator** — A tool that computes a PCB's `originOffsetX/Y` by: user selects a drill point, jogs the printer to that point, enters machine coordinates, and the system calculates the offset.
