<template>
  <div class="spline-graph-editor">
    <div class="d-flex align-items-center justify-content-between mb-1">
      <label class="form-label mb-0 fw-bold">{{ title }}</label>
      <span class="text-muted small">{{ modelValue.length }}/{{ maxPoints }} points</span>
    </div>
    <svg
      ref="svgEl"
      class="spline-svg"
      :viewBox="`0 0 ${svgWidth} ${svgHeight}`"
      @click="handleClick"
      @contextmenu.prevent="handleRightClick"
    >
      <!-- Background -->
      <rect x="0" y="0" :width="svgWidth" :height="svgHeight" fill="#f8f9fa" rx="4" />

      <!-- Grid lines -->
      <g class="grid" stroke="#dee2e6" stroke-width="0.5">
        <line v-for="x in gridLinesX" :key="'gx'+x" :x1="x" :y1="padTop" :x2="x" :y2="svgHeight - padBottom" />
        <line v-for="y in gridLinesY" :key="'gy'+y" :x1="padLeft" :y1="y" :x2="svgWidth - padRight" :y2="y" />
      </g>

      <!-- Axes -->
      <line :x1="padLeft" :y1="svgHeight - padBottom" :x2="svgWidth - padRight" :y2="svgHeight - padBottom" stroke="#333" stroke-width="1.5" />
      <line :x1="padLeft" :y1="padTop" :x2="padLeft" :y2="svgHeight - padBottom" stroke="#333" stroke-width="1.5" />

      <!-- Axis labels -->
      <text :x="svgWidth / 2" :y="svgHeight - 4" text-anchor="middle" class="axis-label">Pad Area (mm²)</text>
      <text :x="8" :y="svgHeight / 2" text-anchor="middle" class="axis-label" :transform="`rotate(-90, 8, ${svgHeight / 2})`">{{ yLabel }}</text>

      <!-- Axis tick labels -->
      <text v-for="(tick, i) in xTicks" :key="'xt'+i" :x="tick.x" :y="svgHeight - padBottom + 14" text-anchor="middle" class="tick-label">{{ tick.label }}</text>
      <text v-for="(tick, i) in yTicks" :key="'yt'+i" :x="padLeft - 6" :y="tick.y + 3" text-anchor="end" class="tick-label">{{ tick.label }}</text>

      <!-- Drill frequency bar chart -->
      <g class="drill-bars">
        <rect
          v-for="(bar, i) in drillDots"
          :key="'bar'+i"
          :x="bar.x"
          :y="bar.y"
          :width="bar.width"
          :height="bar.height"
          fill="#6c757d"
          opacity="0.35"
        />
        <!-- Bar count labels -->
        <text
          v-for="(bar, i) in drillDots"
          :key="'label'+i"
          :x="bar.x + bar.width / 2"
          :y="bar.y - 4"
          text-anchor="middle"
          class="bar-label"
        >{{ bar.count }}</text>
      </g>

      <!-- Spline curve -->
      <defs>
        <clipPath :id="'plotClip-' + title.replace(/\s+/g, '-')">
          <rect :x="padLeft" :y="padTop" :width="plotWidth" :height="plotHeight" />
        </clipPath>
      </defs>
      <path
        v-if="sortedPoints.length >= 1"
        :d="smoothCurvePath"
        fill="none"
        stroke="#0d6efd"
        stroke-width="2"
        stroke-linejoin="round"
        :clip-path="`url(#plotClip-${title.replace(/\s+/g, '-')})`"
      />

      <!-- Control points -->
      <g
        v-for="(pt, i) in screenPoints"
        :key="'cp'+i"
        class="control-point"
        @mousedown.stop="startDrag(i, $event)"
      >
        <circle :cx="pt.x" :cy="pt.y" r="6" fill="#0d6efd" stroke="#fff" stroke-width="2" style="cursor: grab;" />
        <text 
          :x="pointLabels[i].x" 
          :y="pointLabels[i].y" 
          :text-anchor="pointLabels[i].textAnchor"
          :dominant-baseline="pointLabels[i].dominantBaseline"
          class="point-label"
        >{{ pointLabels[i].area.toFixed(0) }},{{ pointLabels[i].value.toFixed(2) }}</text>
      </g>
    </svg>
  </div>
</template>

<script setup>
import { ref, computed, watch } from "vue";

const props = defineProps({
  modelValue: { type: Array, default: () => [] },
  title: { type: String, default: "Spline Curve" },
  yLabel: { type: String, default: "Value" },
  yUnit: { type: String, default: "" },
  maxX: { type: Number, default: 50 },
  maxY: { type: Number, default: 10 },
  xIncrement: { type: Number, default: 5 },
  drillAreas: { type: Array, default: () => [] },
  maxPoints: { type: Number, default: 10 },
});

const emit = defineEmits(["update:modelValue"]);

// Auto-create a default point if array is empty
watch(() => props.modelValue, (newVal) => {
  if (!newVal || newVal.length === 0) {
    emit("update:modelValue", [{ area: 0, value: 0 }]);
  }
}, { immediate: true });

// Clamp points to graph bounds when maxX or maxY changes
watch([() => props.maxX, () => props.maxY], () => {
  if (!props.modelValue || props.modelValue.length === 0) return;
  
  const maxX = Math.max(props.maxX, 1);
  const maxY = Math.max(props.maxY, 0.1);
  
  const clampedPoints = props.modelValue.map(pt => ({
    area: Math.min(pt.area, maxX),
    value: Math.min(pt.value, maxY)
  }));
  
  // Only emit if something actually changed
  const hasChanged = props.modelValue.some((pt, i) => 
    pt.area !== clampedPoints[i].area || pt.value !== clampedPoints[i].value
  );
  
  if (hasChanged) {
    emit("update:modelValue", clampedPoints);
  }
});

const svgEl = ref(null);
const svgWidth = 320;
const svgHeight = 200;
const padLeft = 45;
const padRight = 15;
const padTop = 15;
const padBottom = 30;

const plotWidth = svgWidth - padLeft - padRight;
const plotHeight = svgHeight - padTop - padBottom;

const sortedPoints = computed(() =>
  [...props.modelValue].sort((a, b) => a.area - b.area)
);

function areaToX(area) {
  const maxX = Math.max(props.maxX, 1);
  return padLeft + (area / maxX) * plotWidth;
}

function valueToY(value) {
  const maxY = Math.max(props.maxY, 1);
  return svgHeight - padBottom - (value / maxY) * plotHeight;
}

function xToArea(x) {
  const maxX = Math.max(props.maxX, 1);
  return Math.max(0, ((x - padLeft) / plotWidth) * maxX);
}

function yToValue(y) {
  const maxY = Math.max(props.maxY, 1);
  return Math.max(0, ((svgHeight - padBottom - y) / plotHeight) * maxY);
}

const screenPoints = computed(() =>
  sortedPoints.value.map(pt => ({
    x: areaToX(pt.area),
    y: valueToY(pt.value),
    area: pt.area,
    value: pt.value,
  }))
);

const pointLabels = computed(() => {
  const labelOffsets = {
    x: 10,
    y: -8
  };
  const labelWidth = 50; // Approximate label width in pixels
  const labelHeight = 12; // Approximate label height in pixels
  const margin = 5;
  
  return screenPoints.value.map(pt => {
    let offsetX = labelOffsets.x;
    let offsetY = labelOffsets.y;
    let textAnchor = "start";
    let dominantBaseline = "middle";
    
    // Check if label would be cut off on the right
    if (pt.x + offsetX + labelWidth > svgWidth - padRight) {
      offsetX = -margin;
      textAnchor = "end";
    }
    
    // Check if label would be cut off at the top
    if (pt.y + offsetY - labelHeight / 2 < padTop) {
      offsetY = margin + labelHeight / 2;
      dominantBaseline = "hanging";
    }
    
    return {
      x: pt.x + offsetX,
      y: pt.y + offsetY,
      textAnchor,
      dominantBaseline,
      area: pt.area,
      value: pt.value
    };
  });
});

function solveCubicSpline(xs, ys) {
  const n = xs.length;
  if (n < 2) return { xs, ys, m: ys.map(() => 0), h: [] };
  if (n === 2) {
    return { xs, ys, m: [0, 0], h: [xs[1] - xs[0]] };
  }

  const h = [];
  const alpha = [];
  const l = [];
  const mu = [];
  const z = [];
  const m = new Array(n).fill(0);

  for (let i = 0; i < n - 1; i++) {
    h[i] = xs[i + 1] - xs[i];
  }
  for (let i = 1; i < n - 1; i++) {
    alpha[i] = (3 / h[i]) * (ys[i + 1] - ys[i]) - (3 / h[i - 1]) * (ys[i] - ys[i - 1]);
  }

  l[0] = 1;
  mu[0] = 0;
  z[0] = 0;
  for (let i = 1; i < n - 1; i++) {
    l[i] = 2 * (xs[i + 1] - xs[i - 1]) - h[i - 1] * mu[i - 1];
    mu[i] = h[i] / l[i];
    z[i] = (alpha[i] - h[i - 1] * z[i - 1]) / l[i];
  }
  l[n - 1] = 1;
  z[n - 1] = 0;

  for (let j = n - 2; j >= 0; j--) {
    m[j] = z[j] - mu[j] * m[j + 1];
  }

  return { xs, ys, m, h };
}

function evalCubicSpline(spline, x) {
  const { xs, ys, m, h } = spline;
  const n = xs.length;

  if (n === 1) return Math.max(0, ys[0]);

  // Linear extrapolation beyond endpoints
  if (x <= xs[0]) {
    if (n === 1) {
      // Single point: return as horizontal line
      return Math.max(0, ys[0]);
    }
    const slope = (ys[1] - ys[0]) / (h[0] || 1);
    return Math.max(0, ys[0] + slope * (x - xs[0]));
  }
  if (x >= xs[n - 1]) {
    if (n === 1) {
      // Single point: return as horizontal line
      return Math.max(0, ys[0]);
    }
    const slope = (ys[n - 1] - ys[n - 2]) / (h[n - 2] || 1);
    return Math.max(0, ys[n - 1] + slope * (x - xs[n - 1]));
  }

  let i = 0;
  for (; i < n - 2; i++) {
    if (x < xs[i + 1]) break;
  }

  const hi = h[i] || (xs[i + 1] - xs[i]);
  const a = (xs[i + 1] - x) / hi;
  const b = (x - xs[i]) / hi;

  const result = a * ys[i] + b * ys[i + 1] +
    ((a * a * a - a) * m[i] + (b * b * b - b) * m[i + 1]) * (hi * hi) / 6;
  
  return Math.max(0, result);
}

const smoothCurvePath = computed(() => {
  const pts = sortedPoints.value;
  if (pts.length === 0) return "";
  
  // Handle single point case: draw horizontal line
  if (pts.length === 1) {
    const xMin = 0;
    const xMax = Math.max(props.maxX, 1);
    const sx1 = areaToX(xMin);
    const sx2 = areaToX(xMax);
    const sy = valueToY(pts[0].value);
    return `M${sx1.toFixed(1)},${sy.toFixed(1)} L${sx2.toFixed(1)},${sy.toFixed(1)}`;
  }

  const xs = pts.map(p => p.area);
  const ys = pts.map(p => p.value);
  const spline = solveCubicSpline(xs, ys);

  const xMin = 0;
  const xMax = Math.max(props.maxX, 1);
  const steps = 120;
  let d = "";

  for (let i = 0; i <= steps; i++) {
    const x = xMin + (i / steps) * xMax;
    const y = evalCubicSpline(spline, x);
    const sx = areaToX(x);
    const sy = valueToY(y);
    d += (i === 0 ? "M" : " L") + sx.toFixed(1) + "," + sy.toFixed(1);
  }

  return d;
});

const drillDots = computed(() => {
  if (!props.drillAreas || props.drillAreas.length === 0) return [];
  
  // Count frequency of each area (grouped by 0.1mm diameter increments)
  // Convert area back to diameter, round to 1mm, then convert back to area
  const areaFrequency = {};
  props.drillAreas.forEach(area => {
    // area = π * (diameter/2)^2, so diameter = 2 * sqrt(area/π)
    const diameter = 2 * Math.sqrt(area / Math.PI);
    const roundedDiameter = Math.round(diameter * 10) / 10; // Round to 0.1mm
    const roundedArea = Math.PI * Math.pow(roundedDiameter / 2, 2);
    const key = roundedArea.toFixed(3); // Use string key for precision
    areaFrequency[key] = (areaFrequency[key] || 0) + 1;
  });
  
  // Find max frequency for autoscaling
  const maxFreq = Math.max(...Object.values(areaFrequency));
  
  // Create bar data
  const bars = [];
  const binSizeDiameter = 0.1; // 0.1mm diameter increments
  
  Object.entries(areaFrequency).forEach(([areaKey, count]) => {
    const area = parseFloat(areaKey);
    const diameter = 2 * Math.sqrt(area / Math.PI);
    
    // Calculate bin boundaries in diameter space
    const binStartDiameter = diameter - binSizeDiameter / 2;
    const binEndDiameter = diameter + binSizeDiameter / 2;
    
    // Convert bin boundaries back to area
    const binStartArea = Math.PI * Math.pow(binStartDiameter / 2, 2);
    const binEndArea = Math.PI * Math.pow(binEndDiameter / 2, 2);
    
    // Convert to X-axis coordinates
    const x1 = areaToX(binStartArea);
    const x2 = areaToX(binEndArea);
    const barWidth = Math.abs(x2 - x1);
    
    const x = Math.min(x1, x2);
    const baseY = svgHeight - padBottom;
    
    // Scale bar height relative to max frequency
    const barHeightScale = (plotHeight - 20) / maxFreq; // Leave 20px padding at top
    const barHeight = count * barHeightScale;
    
    bars.push({
      x,
      y: baseY - barHeight,
      width: barWidth,
      height: barHeight,
      count,
      area
    });
  });
  
  return bars;
});

const gridLinesX = computed(() => {
  const lines = [];
  const maxX = Math.max(props.maxX, 1);
  const step = niceStep(maxX, 5);
  for (let v = 0; v <= maxX; v += step) {
    lines.push(areaToX(v));
  }
  return lines;
});

const gridLinesY = computed(() => {
  const lines = [];
  const maxY = Math.max(props.maxY, 1);
  const step = niceStep(maxY, 4);
  for (let v = 0; v <= maxY; v += step) {
    lines.push(valueToY(v));
  }
  return lines;
});

const xTicks = computed(() => {
  const ticks = [];
  const maxX = Math.max(props.maxX, 1);
  const step = niceStep(maxX, 5);
  for (let v = 0; v <= maxX; v += step) {
    ticks.push({ x: areaToX(v), label: v % 1 === 0 ? v.toString() : v.toFixed(1) });
  }
  return ticks;
});

const yTicks = computed(() => {
  const ticks = [];
  const maxY = Math.max(props.maxY, 1);
  const step = niceStep(maxY, 4);
  for (let v = 0; v <= maxY; v += step) {
    ticks.push({ y: valueToY(v), label: v % 1 === 0 ? v.toString() : v.toFixed(1) });
  }
  return ticks;
});

function niceStep(maxVal, targetTicks) {
  const rough = maxVal / targetTicks;
  const mag = Math.pow(10, Math.floor(Math.log10(rough)));
  const normalized = rough / mag;
  let nice;
  if (normalized <= 1) nice = 1;
  else if (normalized <= 2) nice = 2;
  else if (normalized <= 5) nice = 5;
  else nice = 10;
  return nice * mag || 1;
}

let dragIndex = -1;
let justDragged = false;

function startDrag(index, event) {
  dragIndex = index;
  justDragged = false;
  const onMove = (e) => {
    if (dragIndex < 0) return;
    justDragged = true;
    const svg = svgEl.value;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const scaleX = svgWidth / rect.width;
    const scaleY = svgHeight / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    
    // Clamp x and y to graph bounds
    const clampedX = Math.max(padLeft, Math.min(x, svgWidth - padRight));
    const clampedY = Math.max(padTop, Math.min(y, svgHeight - padBottom));
    
    let newArea = xToArea(clampedX);
    let newValue = yToValue(clampedY);
    
    // Snap X axis to increment
    newArea = Math.round(newArea / props.xIncrement) * props.xIncrement;
    
    // Ensure minimum bounds
    newArea = Math.max(0, newArea);
    newValue = Math.max(0, newValue);
    
    // Check if this X-axis value is occupied by another point
    const areaOccupied = props.modelValue.some((pt, i) => i !== dragIndex && pt.area === newArea);
    if (areaOccupied) {
      return; // Prevent moving to an occupied X-axis value
    }
    
    const pts = [...props.modelValue];
    pts[dragIndex] = { area: newArea, value: Math.round(newValue * 1000) / 1000 };
    emit("update:modelValue", pts);
  };
  const onUp = () => {
    dragIndex = -1;
    document.removeEventListener("mousemove", onMove);
    document.removeEventListener("mouseup", onUp);
  };
  document.addEventListener("mousemove", onMove);
  document.addEventListener("mouseup", onUp);
}

function handleClick(event) {
  if (justDragged) { justDragged = false; return; }
  if (props.modelValue.length >= props.maxPoints) return;
  const svg = svgEl.value;
  if (!svg) return;
  const rect = svg.getBoundingClientRect();
  const scaleX = svgWidth / rect.width;
  const scaleY = svgHeight / rect.height;
  const x = (event.clientX - rect.left) * scaleX;
  const y = (event.clientY - rect.top) * scaleY;
  if (x < padLeft || x > svgWidth - padRight || y < padTop || y > svgHeight - padBottom) return;
  
  let area = xToArea(x);
  const value = yToValue(y);
  
  // Snap X axis to increment
  area = Math.round(area / props.xIncrement) * props.xIncrement;
  
  // Check if X-axis value already exists
  const areaExists = props.modelValue.some(pt => pt.area === area);
  if (areaExists) {
    return; // Prevent adding duplicate X-axis value
  }
  
  const pts = [...props.modelValue, { area, value: Math.round(value * 1000) / 1000 }];
  pts.sort((a, b) => a.area - b.area);
  emit("update:modelValue", pts);
}

function handleRightClick(event) {
  const svg = svgEl.value;
  if (!svg) return;
  const rect = svg.getBoundingClientRect();
  const scaleX = svgWidth / rect.width;
  const scaleY = svgHeight / rect.height;
  const mx = (event.clientX - rect.left) * scaleX;
  const my = (event.clientY - rect.top) * scaleY;
  let closestIdx = -1;
  let closestDist = 15;
  const pts = sortedPoints.value;
  for (let i = 0; i < pts.length; i++) {
    const px = areaToX(pts[i].area);
    const py = valueToY(pts[i].value);
    const d = Math.hypot(mx - px, my - py);
    if (d < closestDist) {
      closestDist = d;
      closestIdx = i;
    }
  }
  if (closestIdx >= 0) {
    // Prevent deletion if only one point remains
    if (props.modelValue.length <= 1) {
      return;
    }
    const newPts = pts.filter((_, i) => i !== closestIdx);
    emit("update:modelValue", newPts);
  }
}

</script>

<style scoped>
.spline-graph-editor {
  border: 1px solid #dee2e6;
  border-radius: 6px;
  padding: 8px;
  background: #fff;
}
.spline-svg {
  width: 100%;
  height: auto;
  cursor: crosshair;
}
.axis-label {
  font-size: 9px;
  fill: #555;
  font-family: sans-serif;
}
.tick-label {
  font-size: 8px;
  fill: #666;
  font-family: sans-serif;
}
.control-point circle {
  cursor: grab;
}
.control-point circle:active {
  cursor: grabbing;
}
.point-label {
  font-size: 9px;
  fill: #000;
  font-family: monospace;
  font-weight: bold;
  pointer-events: none;
  background: white;
  padding: 1px 2px;
}
.bar-label {
  font-size: 8px;
  fill: #495057;
  font-family: sans-serif;
  font-weight: bold;
  pointer-events: none;
}
</style>
