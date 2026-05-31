# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Solder Sidekick™ is a web application that converts 3D printers into automated soldering robots. It processes Excellon drill files from PCB design software and generates G-code to control the printer for automated through-hole soldering.

## Commands

### Development
- `npm run dev` - Start the development server on http://localhost:5173
- `npm run build` - Build for production
- `npm run preview` - Preview the production build

### Testing
No test framework is currently configured. When implementing tests, consider adding Vitest for unit tests and Playwright/Cypress for E2E tests.

### Code Quality
No linting or formatting tools are configured. Consider adding ESLint and Prettier when requested.

## Architecture

### Tech Stack
- **Framework**: Vue 3 with Composition API
- **Build Tool**: Vite
- **State Management**: Pinia with persistence plugin (localStorage)
- **3D Visualization**: Three.js
- **UI Framework**: Bootstrap 5
- **Router**: Vue Router

### Key Components

1. **State Management** (`src/stores/store.js`):
   - Central store managing multi-PCB tray, machine profiles, and G-code generation
   - `pcbs[]` array holds all loaded PCBs; `activePcbId` tracks the selected PCB
   - `createPcb()` factory function creates PCB objects with defaults
   - Backward-compatible getter/setters proxy `drillStore.drillData`, `.path`, `.originOffsetX/Y`, etc. to the active PCB
   - No-go zones split into `globalNoGoZones` (bed space) and per-PCB `noGoZones` (drill space)
   - `splineCurves` maps pad area to soak/feed/dwell values

2. **Core Functionality**:
   - **File Processing**: `src/composables/useFileHandlers.js` - Parses Excellon drill files, creates PCB objects
   - **G-code Generation**: `src/composables/useGcodeGenerator.js` - Multi-PCB G-code with safe-Z lifts, spline interpolation, PCB comments
   - **2D Visualization**: `src/components/ToolpathEditor.vue` - Interactive canvas editor with sidebar PCB list
   - **3D Simulator**: `src/components/GcodeSimulator.vue` - Three.js simulator rendering all PCBs

3. **Main Views**:
   - **HomeView**: Main toolpath editor interface

### G-code Generation Flow
1. User uploads Excellon drill file(s) — each becomes a PCB in the tray
2. Files are parsed to extract drill coordinates per PCB
3. Points are optimized using nearest-neighbor algorithm (with no-go zone avoidance)
4. G-code is generated using customizable templates (start, per-point, end)
5. Safe-Z lifts are inserted between PCB transitions
6. Spline curves map pad area to soak/feed/dwell values
7. Waypoint G0 rapid moves are inserted when the path must route around no-go zones
8. User can preview in 2D canvas, simulate in 3D, and download the result

### Important Implementation Details

- **Coordinate System**: Uses Three.js coordinate system with transformations for PCB visualization
- **Path Optimization**: Implements nearest-neighbor algorithm for efficient soldering paths, with no-go zone avoidance using visibility graph + Dijkstra shortest path routing
- **No-Go Zones**: Split into global (bed space, `globalNoGoZones`) and per-PCB (drill space, `pcb.noGoZones`). Points inside zones are excluded; path segments crossing zones are routed around zone corners via `computeRouteAroundZones()`. Waypoints appear in both canvas rendering and G-code output.
- **Templates**: G-code templates support variable substitution for coordinates and offsets. Per-point templates include `PCB_THICKNESS`, `PCB_INDEX`, `PCB_NAME`.
- **Mobile Support**: Detects mobile devices and shows appropriate messaging
- **Analytics**: Includes Google Analytics and Facebook Pixel integration
- **Persistence**: All configuration and profiles stored in localStorage via Pinia plugin
- **G-code Simulator**: `GcodeSimulator.vue` parses actual G-code (G0/G1 moves, G4 dwells, G92 origin, M117 messages) to animate a soldering iron in a Three.js scene. Uses `requestAnimationFrame` with timeline interpolation. The iron is tilted 10° to match the physical setup. Scene uses Z-up convention. Build plate uses a canvas-generated tiled texture matching the 2D editor's brick grid pattern. Colors/branding match the 2D view. Solder point dwell commands are extracted as timeline markers with prev/next skip navigation and a point counter.
- **3D Model Loading**: Supports GLB/GLTF (via `GLTFLoader`), STL (via `STLLoader`), and STEP/IGES (via `occt-import-js` WebAssembly, lazy-loaded on first use ~8 MB WASM). Models are loaded at native scale (no auto-scaling). GLB/GLTF and STEP/IGES models are rotated from Y-up to Z-up. PCB-related objects are grouped in a `pcbGroup` for easy removal/replacement. The loaded model is wrapped in a `modelPivot` group (centered on the model's bounding box) that supports user-controlled 90° rotation steps and mm-level offset adjustments via an overlay panel. Adjustment settings (rotation + offset relative to base) can be saved/loaded as a `model-alignment.json` file for reuse across sessions. The WASM file for STEP support lives in `public/occt-import-js.wasm` and is only fetched when a STEP/IGES file is loaded.

## Development Notes

- The project targets Ender-3 3D printers specifically
- No authentication system - runs entirely client-side
- File processing happens in the browser using FileReader API
- Bootstrap modals are used extensively for UI interactions
- The app includes cookie consent management for compliance