import { useDrillStore } from "@/stores/store";

export function useGcodeGenerator() {
  const drillStore = useDrillStore();

  function interpolateSpline(curve, padArea) {
    if (!curve || curve.length === 0) return 0;

    const sorted = [...curve].sort((a, b) => a.area - b.area);
    if (sorted.length === 1) return sorted[0].value;

    const xs = sorted.map(p => p.area);
    const ys = sorted.map(p => p.value);
    const n = xs.length;

    // Linear fallback for 2 points
    if (n === 2) {
      const slope = (ys[1] - ys[0]) / (xs[1] - xs[0]);
      if (padArea <= xs[0]) return ys[0] + slope * (padArea - xs[0]);
      if (padArea >= xs[1]) return ys[1] + slope * (padArea - xs[1]);
      return ys[0] + slope * (padArea - xs[0]);
    }

    const h = [];
    for (let i = 0; i < n - 1; i++) h[i] = xs[i + 1] - xs[i];

    const alpha = new Array(n).fill(0);
    for (let i = 1; i < n - 1; i++) {
      alpha[i] = (3 / h[i]) * (ys[i + 1] - ys[i]) - (3 / h[i - 1]) * (ys[i] - ys[i - 1]);
    }

    const l = new Array(n).fill(0);
    const mu = new Array(n).fill(0);
    const z = new Array(n).fill(0);
    const m = new Array(n).fill(0);

    l[0] = 1;
    for (let i = 1; i < n - 1; i++) {
      l[i] = 2 * (xs[i + 1] - xs[i - 1]) - h[i - 1] * mu[i - 1];
      mu[i] = h[i] / l[i];
      z[i] = (alpha[i] - h[i - 1] * z[i - 1]) / l[i];
    }
    l[n - 1] = 1;

    for (let j = n - 2; j >= 0; j--) {
      m[j] = z[j] - mu[j] * m[j + 1];
    }

    // Linear extrapolation beyond endpoints
    if (padArea <= xs[0]) {
      const slope = (ys[1] - ys[0]) / h[0];
      return ys[0] + slope * (padArea - xs[0]);
    }
    if (padArea >= xs[n - 1]) {
      const slope = (ys[n - 1] - ys[n - 2]) / h[n - 2];
      return ys[n - 1] + slope * (padArea - xs[n - 1]);
    }

    let i = 0;
    for (; i < n - 2; i++) {
      if (padArea < xs[i + 1]) break;
    }

    const hi = h[i] || (xs[i + 1] - xs[i]);
    const a = (xs[i + 1] - padArea) / hi;
    const b = (padArea - xs[i]) / hi;

    return a * ys[i] + b * ys[i + 1] +
      ((a * a * a - a) * m[i] + (b * b * b - b) * m[i + 1]) * (hi * hi) / 6;
  }

  function getPadArea(point) {
    const diameter = parseFloat(point.size);
    if (isNaN(diameter) || diameter <= 0) return 0;
    return Math.PI * Math.pow(diameter / 2, 2);
  }

  function generateGcode() {
    const profile = drillStore.profiles[drillStore.currentProfile];

    const solderPoints = getSolderPoints();

    if (solderPoints.length === 0) {
      throw new Error("No solder points selected");
    }

    let gcode = "";

    gcode += processTemplate(profile.startGcode, {
      START_SAFE_Z: profile.startSafeZ,
      ORIGIN_X: profile.zeroX ?? 0,
      ORIGIN_Y: profile.zeroY ?? 0,
      ORIGIN_Z: profile.zeroZ ?? 0,
      MULTIPLIER: profile.solderFeedMultiplier ?? 0,
    });
    gcode += "\n\n";

    if (profile.periodicAtStart && profile.periodicHoleCount > 0) {
      gcode += processTemplate(profile.periodicGcode, {
        PERIODIC_HOLE_COUNT: profile.periodicHoleCount,
        START_SAFE_Z: profile.startSafeZ,
        END_SAFE_Z: profile.endSafeZ,
        ORIGIN_X: profile.zeroX ?? 0,
        ORIGIN_Y: profile.zeroY ?? 0,
        ORIGIN_Z: profile.zeroZ ?? 0,
        MULTIPLIER: profile.solderFeedMultiplier ?? 0,
      });
      gcode += "\n\n";
    }

    let lastPcbId = null;

    solderPoints.forEach((point, index) => {
      if (point.pcbId !== lastPcbId) {
        if (lastPcbId !== null) {
          gcode += processTemplate(profile.betweenBoardGcode, {
            START_SAFE_Z: profile.startSafeZ,
          });
          gcode += "\n";
        }
        gcode += `; --- PCB ${point.pcbIndex + 1}: ${point.pcbName} ---\n`;
        lastPcbId = point.pcbId;
      }

      if (index > 0) {
        const prev = solderPoints[index - 1];
        const zones = drillStore._getAllNoGoZones();
        const waypoints = drillStore.computeRouteAroundZones(
          prev.transformedX, prev.transformedY,
          point.transformedX, point.transformedY,
          zones
        );
        if (waypoints.length > 0) {
          gcode += "; Route around no-go zone\n";
          for (const wp of waypoints) {
            gcode += `G0 X${wp.x.toFixed(2)} Y${wp.y.toFixed(2)} F6000\n`;
          }
          gcode += "\n";
        }
      }

      const pointNumber = index + 1;
      const progressPercent = Math.round((index / solderPoints.length) * 100);

      const padArea = getPadArea(point);
      const soakCurve = drillStore.splineCurves.soak;
      const feedCurve = drillStore.splineCurves.feed;
      const dwellCurve = drillStore.splineCurves.dwell;

      const pointVars = {
        INDEX: index,
        TOTAL_POINTS: solderPoints.length,
        X: point.transformedX,
        Y: point.transformedY,
        SOLDER_OFFSET: profile.solderOffset ?? 0,
        X_OFFSET: point.xOffset ?? 0,
        Y_OFFSET: point.yOffset ?? 0,
        Z_OFFSET: (point.zOffset ?? 0) + (point.originOffsetZ ?? 0),
        SOAK: soakCurve.length > 0 ? interpolateSpline(soakCurve, padArea) : point.soak,
        FEED: feedCurve.length > 0 ? interpolateSpline(feedCurve, padArea) : point.feed,
        DWELL: dwellCurve.length > 0 ? interpolateSpline(dwellCurve, padArea) : point.dwell,
        PRIME: profile.feedPrime ?? 0,
        PRIME_RETRACT: profile.feedRetract ?? 0,
        RETRACT: profile.retractAfterSolder ?? 0,
        SOLDER_SAFE_Z: profile.solderSafeZ ?? 0,
        SOLDER_PRIME_Z: profile.solderPrimeZ ?? 0,
        POINT_NUMBER: pointNumber,
        PROGRESS_PERCENT: progressPercent,
        PCB_THICKNESS: point.pcbThickness,
        PCB_INDEX: point.pcbIndex + 1,
        PCB_NAME: point.pcbName,
      };

      gcode += processTemplate(profile.perPointGcode, pointVars);
      gcode += "\n\n";

      if (profile.periodicHoleCount > 0 && (index + 1) % profile.periodicHoleCount === 0 && index < solderPoints.length - 1) {
        gcode += processTemplate(profile.periodicGcode, {
          PERIODIC_HOLE_COUNT: profile.periodicHoleCount,
          START_SAFE_Z: profile.startSafeZ,
          END_SAFE_Z: profile.endSafeZ,
          ORIGIN_X: profile.zeroX ?? 0,
          ORIGIN_Y: profile.zeroY ?? 0,
          ORIGIN_Z: profile.zeroZ ?? 0,
          MULTIPLIER: profile.solderFeedMultiplier ?? 0,
        });
        gcode += "\n\n";
      }
    });

    if (profile.periodicAtEnd && profile.periodicHoleCount > 0) {
      gcode += processTemplate(profile.periodicGcode, {
        PERIODIC_HOLE_COUNT: profile.periodicHoleCount,
        START_SAFE_Z: profile.startSafeZ,
        END_SAFE_Z: profile.endSafeZ,
        ORIGIN_X: profile.zeroX ?? 0,
        ORIGIN_Y: profile.zeroY ?? 0,
        ORIGIN_Z: profile.zeroZ ?? 0,
        MULTIPLIER: profile.solderFeedMultiplier ?? 0,
      });
      gcode += "\n\n";
    }

    gcode += processTemplate(profile.endGcode, {
      END_SAFE_Z: profile.endSafeZ,
      BEEP: profile.playBeep ? 200 : 0,
    });

    return gcode;
  }

  function getSolderPoints() {
    const points = [];

    for (let pcbIndex = 0; pcbIndex < drillStore.pcbs.length; pcbIndex++) {
      const pcb = drillStore.pcbs[pcbIndex];
      const angle = -(pcb.rotation * Math.PI) / 180;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);

      for (const id of pcb.path) {
        const drill = pcb.drillData.find(d => d.id === id);
        if (drill && drill.solder) {
          const rotatedX = drill.x * cos - drill.y * sin;
          const rotatedY = drill.x * sin + drill.y * cos;

          points.push({
            ...drill,
            transformedX: rotatedX + pcb.originOffsetX,
            transformedY: rotatedY + pcb.originOffsetY,
            originOffsetZ: pcb.originOffsetZ || 0,
            pcbId: pcb.id,
            pcbIndex,
            pcbName: pcb.filename,
            pcbThickness: pcb.thickness,
          });
        }
      }
    }

    return points;
  }

  function randInt(min, max) {
    const lo = Math.ceil(min);
    const hi = Math.floor(max);
    return Math.floor(Math.random() * (hi - lo + 1)) + lo;
  }

  function processTemplate(template, variables) {
    let processed = template;

    processed = processed.replace(/\{INDEX\s*\+\s*1\}/g, '{POINT_NUMBER}');
    processed = processed.replace(/\{INDEX\s*\/\s*TOTAL_POINTS\s*\*\s*100\}/g, '{PROGRESS_PERCENT}');

    processed = processed.replace(/\{([^}]+)\}/g, (match, expression) => {
      const trimmed = expression.trim();

      const randMatch = trimmed.match(/^RAND\s*\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)$/);
      if (randMatch) {
        return randInt(Number(randMatch[1]), Number(randMatch[2]));
      }

      if (variables.hasOwnProperty(trimmed)) {
        const value = variables[trimmed];
        if (typeof value === 'number') {
          if (['INDEX', 'TOTAL_POINTS', 'MULTIPLIER', 'BEEP', 'POINT_NUMBER', 'PROGRESS_PERCENT', 'PCB_INDEX'].includes(trimmed)) {
            return value.toString();
          }
          return value.toFixed(2);
        }
        return value.toString();
      }

      try {
        const func = new Function(...Object.keys(variables), `return ${expression}`);
        const result = func(...Object.values(variables));

        if (typeof result === 'number') {
          if (expression.includes('Math.round') || Number.isInteger(result)) {
            return result.toString();
          }
          return result.toFixed(2);
        }

        return result.toString();
      } catch (e) {
        console.error(`Failed to evaluate expression: "${expression}"`, e);
        return match;
      }
    });

    return processed;
  }

  function saveGcodeFile(gcode) {
    const firstPcb = drillStore.pcbs[0];
    const baseName = firstPcb?.filename?.replace(/\.[^/.]+$/, "") || "solder-gcode";
    const blob = new Blob([gcode], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${baseName}.gcode`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return {
    generateGcode,
    saveGcodeFile,
  };
}