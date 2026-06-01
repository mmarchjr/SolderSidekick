import { useDrillStore } from "@/stores/store";

export function useFileHandlers() {
  const drillStore = useDrillStore();

  function inchesToMm(inches) {
    return Math.round(inches * 25.4 * 1000) / 1000;
  }

  function parseDrillFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result;
      const { drills, toolSizes } = parseDrillText(text, file.name);

      console.log("Format detected:", { file: file.name });

      const pcb = drillStore.addPcb({ filename: file.name });
      drillStore.setPcbDrillData(pcb.id, drills, toolSizes);
      drillStore.triggerCanvasUpdate();
    };
    reader.readAsText(file);
  }

  function parseDrillText(text, filename) {
    const lines = text.split("\n").map(line => line.trim()).filter(l => l.length);
    let unitMode = "inch";
    let isEagle = false;
    let isAltium = false;
    let isEasyEDA = false;
    let easyEDAFormat = null;
    let lastX = null;
    let lastY = null;

    for (const line of lines) {
      if (line.includes("METRIC")) unitMode = "mm";
      if (line.includes("INCH")) unitMode = "inch";
      if (line.includes("M72")) isEagle = true;
      if (line.startsWith("METRIC,LZ")) {
        isEasyEDA = lines.some(l => l.includes("EasyEDA"));
        if (!isEasyEDA) isAltium = true;
      }
      if (line.includes("FILE_FORMAT=")) {
        const formatMatch = line.match(/FILE_FORMAT=(\d+):(\d+)/);
        if (formatMatch) {
          easyEDAFormat = {
            beforeDecimal: parseInt(formatMatch[1]),
            afterDecimal: parseInt(formatMatch[2])
          };
        }
      }
    }

    const parsedDrills = [];
    const toolSizes = {};
    let currentTool = null;

    for (const line of lines) {
      const toolMatch = line.match(/^T(\d+)[FS0-9]*C([\d.]+)/);
      if (toolMatch) {
        const toolId = `T${toolMatch[1]}`;
        const size = parseFloat(toolMatch[2]);
        toolSizes[toolId] = unitMode === "inch" ? inchesToMm(size) : size;
      }
    }

    for (const line of lines) {
      if (line.startsWith("T") && !line.includes("C")) {
        currentTool = line.trim();
        continue;
      }

      const matchFull = line.match(/X([-+]?\d*\.?\d+)Y([-+]?\d*\.?\d+)/);
      const matchXOnly = line.match(/X([-+]?\d*\.?\d+)$/);
      const matchYOnly = line.match(/Y([-+]?\d*\.?\d+)$/);

      let x = null;
      let y = null;

      if (matchFull) {
        x = parseFloat(matchFull[1]);
        y = parseFloat(matchFull[2]);
      } else if (matchXOnly) {
        x = parseFloat(matchXOnly[1]);
        y = lastY;
      } else if (matchYOnly) {
        x = lastX;
        y = parseFloat(matchYOnly[1]);
      }

      if (x !== null && y !== null) {
        lastX = x;
        lastY = y;

        if (isEagle) {
          x = inchesToMm(x / 10000);
          y = inchesToMm(y / 10000);
        } else if (isEasyEDA) {
          if (easyEDAFormat) {
            const divisor = Math.pow(10, easyEDAFormat.afterDecimal);
            x = x / divisor;
            y = y / divisor;
          } else if (unitMode === "mm") {
            // Already in mm
          } else {
            x = inchesToMm(x / 1000);
            y = inchesToMm(y / 1000);
          }
        } else if (isAltium) {
          x = (x / 100);
          y = (y / 100);
        } else if (unitMode === "inch") {
          x = inchesToMm(x);
          y = inchesToMm(y);
        }

        parsedDrills.push({
          tool: currentTool || "Unknown",
          size: toolSizes[currentTool] ? `${toolSizes[currentTool]} mm` : "Unknown",
          x,
          y,
        });
      }
    }

    return { drills: parsedDrills, toolSizes };
  }

  function parseProjectFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const project = JSON.parse(e.target.result);

      if (project.version === 2 || project.pcbs) {
        loadV2Project(project);
      } else {
        loadV1Project(project);
      }
    };
    reader.readAsText(file);
  }

  function loadV2Project(project) {
    drillStore.clearAllPcbs();

    if (project.pcbs && Array.isArray(project.pcbs)) {
      for (const pcbData of project.pcbs) {
        const pcb = drillStore.addPcb({
          id: pcbData.id,
          filename: pcbData.filename || "",
          originOffsetX: pcbData.originOffsetX ?? 16,
          originOffsetY: pcbData.originOffsetY ?? 16,
          originOffsetZ: pcbData.originOffsetZ ?? 0,
          rotation: pcbData.rotation ?? 0,
          thickness: pcbData.thickness ?? 1.6,
          noGoZones: pcbData.noGoZones || [],
          viaFilterDiameter: pcbData.viaFilterDiameter ?? 0.4,
          outline: pcbData.outline || [],
        });

        if (pcbData.drillData && pcbData.drillData.length > 0) {
          drillStore.restorePcbDrillData(pcb.id, pcbData.drillData, pcbData.toolSizes || {});
          pcb.path = pcbData.path || [];
          drillStore.updatePcbPathIndices(pcb.id);
        }
      }
    }

    drillStore.activePcbId = project.activePcbId || (drillStore.pcbs.length > 0 ? drillStore.pcbs[0].id : null);
    drillStore.globalNoGoZones = project.globalNoGoZones || [];

    if (project.profiles) {
      drillStore.loadProfilesFromProject(project.profiles, project.currentProfile);
      // Backward compatibility: if old splineCurves exist at root level, merge them into current profile
      if (project.splineCurves && drillStore.profiles[drillStore.currentProfile]) {
        drillStore.profiles[drillStore.currentProfile].splineCurves = project.splineCurves;
        drillStore.saveProfilesToStorage();
      }
    } else if (project.currentProfile && project.profileSettings) {
      const profiles = {
        [project.currentProfile]: project.profileSettings
      };
      // Add splineCurves if they exist in the project
      if (project.splineCurves) {
        profiles[project.currentProfile].splineCurves = project.splineCurves;
      }
      drillStore.loadProfilesFromProject(profiles, project.currentProfile);
    } else {
      drillStore.initProfiles();
      // Backward compatibility: if old splineCurves exist, set them in current profile
      if (project.splineCurves && drillStore.profiles[drillStore.currentProfile]) {
        drillStore.profiles[drillStore.currentProfile].splineCurves = project.splineCurves;
        drillStore.saveProfilesToStorage();
      }
    }

    drillStore.triggerCanvasUpdate();
  }

  function loadV1Project(project) {
    drillStore.clearAllPcbs();

    const pcb = drillStore.addPcb({
      filename: project.drillFilename || "imported.drl",
      originOffsetX: project.originOffsetX ?? 16,
      originOffsetY: project.originOffsetY ?? 16,
      rotation: project.rotation ?? 0,
      thickness: project.pcbThickness ?? 1.6,
      noGoZones: project.noGoZones || [],
      viaFilterDiameter: project.viaFilterDiameter ?? 0.4,
      outline: project.pcbOutline || [],
    });

    if (project.drillData && project.drillData.length > 0) {
      drillStore.restorePcbDrillData(pcb.id, project.drillData, project.toolSizes || {});
      pcb.path = project.path || [];
      drillStore.updatePcbPathIndices(pcb.id);
    }

    if (project.profiles) {
      drillStore.loadProfilesFromProject(project.profiles, project.currentProfile);
    } else if (project.currentProfile && project.profileSettings) {
      const profiles = {
        [project.currentProfile]: project.profileSettings
      };
      drillStore.loadProfilesFromProject(profiles, project.currentProfile);
    } else {
      drillStore.initProfiles();
    }

    drillStore.triggerCanvasUpdate();
  }

  function saveProject() {
    const baseName = drillStore.pcbs[0]?.filename?.replace(/\.[^/.]+$/, "") || "solder-project";

    const pcbsData = drillStore.pcbs.map(pcb => ({
      id: pcb.id,
      filename: pcb.filename,
      drillData: pcb.drillData,
      path: pcb.path,
      toolSizes: pcb.toolSizes,
      outline: pcb.outline,
      originOffsetX: pcb.originOffsetX,
      originOffsetY: pcb.originOffsetY,
      originOffsetZ: pcb.originOffsetZ ?? 0,
      rotation: pcb.rotation,
      thickness: pcb.thickness,
      noGoZones: pcb.noGoZones,
      viaFilterDiameter: pcb.viaFilterDiameter,
    }));

    const project = {
      version: 2,
      pcbs: pcbsData,
      activePcbId: drillStore.activePcbId,
      globalNoGoZones: drillStore.globalNoGoZones,
      splineCurves: drillStore.splineCurves,
      currentProfile: drillStore.currentProfile,
      profiles: drillStore.profiles,
    };

    const blob = new Blob([JSON.stringify(project, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${baseName}.pcb-project.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return {
    parseDrillFile,
    parseDrillText,
    parseProjectFile,
    saveProject,
  };
}
