import { useDrillStore } from "@/stores/store";

/**
 * Parse a Gerber RS-274X file and extract the board outline.
 * Returns an array of { x, y } points in mm, with null separators between subpaths.
 */
function parseGerberText(text) {
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
  let lastOperation = "move";
  const outline = [];

  for (const line of lines) {
    if (line.startsWith("%FS")) {
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

  for (const line of lines) {
    if (line.startsWith("ADD")) {
      const addMatch = line.match(/ADD(\d+),([A-Za-z])(?:,([^\s%]*))?/);
      if (addMatch) {
        const code = parseInt(addMatch[1]);
        const shape = addMatch[2].toUpperCase();
        const params = addMatch[3] ? addMatch[3].split("X").map(Number) : [];
        apertures[code] = { shape, params };
      }
    }
  }

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
    if (line.startsWith("G04") || line.startsWith(";") || line === "*") continue;

    const gMatch = line.match(/\bG(\d+)/);
    if (gMatch) interpolateMode = parseInt(gMatch[1]);

    let operation = null;
    if (/D0[123]\b/.test(line)) {
      const dOpMatch = line.match(/D0([123])\b/);
      if (dOpMatch) {
        operation = ["none", "draw", "move", "flash"][parseInt(dOpMatch[1])];
      }
    }

    const dApertureMatch = line.match(/\bD(\d{2,})\b/);
    if (dApertureMatch) {
      const dCode = parseInt(dApertureMatch[1]);
      if (dCode >= 10) currentAperture = dCode;
    }

    const xMatch = line.match(/X([+-]?\d+)/);
    const yMatch = line.match(/Y([+-]?\d+)/);
    const iMatch = line.match(/I([+-]?\d+)/);
    const jMatch = line.match(/J([+-]?\d+)/);

    const hasX = xMatch !== null;
    const hasY = yMatch !== null;

    if (hasX || hasY || operation !== null) {
      let newX = hasX ? parseCoord(xMatch[1]) : currentX;
      let newY = hasY ? parseCoord(yMatch[1]) : currentY;
      const iVal = iMatch ? parseCoord(iMatch[1]) : 0;
      const jVal = jMatch ? parseCoord(jMatch[1]) : 0;

      if (operation === null) {
        operation = lastOperation;
      }

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
        const radius = Math.hypot(cx - startX, cy - startY);
        if (radius > 0.001) {
          const startAngle = Math.atan2(startY - cy, startX - cx);
          let endAngle = Math.atan2(toMm(newY) - cy, toMm(newX) - cx);
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
            outline.push({
              x: Math.round((cx + radius * Math.cos(a)) * 1000) / 1000,
              y: Math.round((cy + radius * Math.sin(a)) * 1000) / 1000,
            });
          }
        }
      }

      if (operation === "move" || operation === null) {
        if (hasX || hasY) {
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

      if (operation !== null && operation !== "none") {
        lastOperation = operation;
      }
    }
  }

  // Don't remove consecutive duplicates anymore since nulls are path breaks
  return outline;
}

/**
 * Parse a Gerber file (as File object or string) and return outline points.
 */
function parseGerberFile(fileOrText) {
  if (typeof fileOrText === "string") {
    return parseGerberText(fileOrText);
  }
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      resolve(parseGerberText(e.target.result));
    };
    reader.readAsText(fileOrText);
  });
}

export function useGerberParser() {
  const drillStore = useDrillStore();

  async function loadGerberOutline(file) {
    const outline = await parseGerberFile(file);
    drillStore.setPcbOutline(outline);
    drillStore.triggerCanvasUpdate();
    return outline;
  }

  return {
    parseGerberText,
    parseGerberFile,
    loadGerberOutline,
  };
}
