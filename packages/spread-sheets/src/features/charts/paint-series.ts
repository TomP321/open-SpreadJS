/**
 * Series glyph painting (bars, lines, markers, areas, scatter points, pie and
 * doughnut slices, data labels) on the chart canvas.
 */
import type { PaintContext } from './paint.js';
import type { PaintGroup, PaintSeries } from './paint-model.js';
import type { JsonRecord } from './types.js';
import { formatValue } from './scale.js';

interface Plot { x: number, y: number, width: number, height: number }

/**
 * Compose and paint one data label honouring the trial's flags (series name,
 * category, value, percent joined by `separator`), its `txPr` font/colour and
 * the position code (column: 2 centre, 3 insideBase, 4 insideEnd, 6
 * outsideEnd; line/scatter: 1 below, 2 centre, 7 right, 8 above).
 */
function seriesLabelText(pc: PaintContext, ser: PaintSeries, category: string | number, valueText: string, percentText?: string): string | null {
  const d = ser.dLbls;
  void pc;
  if (!d) return null;
  const parts: string[] = [];
  if (d.showSerName) parts.push(ser.name);
  if (d.showCatName) parts.push(String(category));
  if (d.showVal) parts.push(valueText);
  if (d.showPercent && percentText) parts.push(percentText);
  if (!parts.length) return null;
  return parts.join(String(d.separator ?? ', '));
}

function seriesLabelStyle(pc: PaintContext, ser: PaintSeries): void {
  const { ctx } = pc;
  const rPr = (ser.dLbls?.txPr?.p?.[0]?.elements?.[0]?.rPr ?? {}) as JsonRecord;
  const sz = Number(rPr.sz ?? 12);
  ctx.font = `${rPr.b ? 'bold ' : ''}${sz}px Calibri, "Segoe UI", Arial, sans-serif`;
  ctx.fillStyle = rPr.solidFill?.srgbClr ? `rgb(${(rPr.solidFill.srgbClr.val as number[]).join(',')})` : '#595959';
}

function drawBarLabel(pc: PaintContext, ser: PaintSeries, category: string | number, text: string, box: { x: number, y: number, w: number, h: number }, horizontal: boolean): void {
  const { ctx } = pc;
  const pos = Number(ser.dLbls?.dLblPos ?? 6);
  seriesLabelStyle(pc, ser);
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  if (!horizontal) {
    if (pos === 2) { ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, cx, cy); }
    else if (pos === 3) { ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillText(text, cx, box.y + box.h - 2); }
    else if (pos === 4) { ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText(text, cx, box.y + 2); }
    else { ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillText(text, cx, box.y - 2); }
    return;
  }
  if (pos === 2) { ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, cx, cy); }
  else if (pos === 3) { ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(text, box.x + 3, cy); }
  else if (pos === 4) { ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillText(text, box.x + box.w - 3, cy); }
  else { ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(text, box.x + box.w + 3, cy); }
}

function drawPointLabel(pc: PaintContext, ser: PaintSeries, category: string | number, text: string, x: number, y: number): void {
  const { ctx } = pc;
  void category;
  // Area charts never carry `dLblPos` (trial) and paint like the line default.
  const pos = Number(ser.dLbls?.dLblPos ?? 7);
  seriesLabelStyle(pc, ser);
  if (pos === 8) { ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillText(text, x, y - 4); }
  else if (pos === 1) { ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText(text, x, y + 6); }
  else if (pos === 2) { ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, x, y); }
  else { ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(text, x + 4, y - 6); }
}

export function drawGroup(pc: PaintContext, group: PaintGroup): void {
  const plot = pc.layout.plot;
  if (group.kind === 'bar') drawBars(pc, group, plot);
  else if (group.kind === 'line' || group.kind === 'area') drawLines(pc, group, plot);
  else if (group.kind === 'scatter') drawScatter(pc, group, plot);
  else if (group.kind === 'bubble') drawBubble(pc, group, plot);
  else if (group.kind === 'radar') drawRadar(pc, group, plot);
  else if (group.kind === 'stock') drawStock(pc, group, plot);
  else if (group.kind === 'pie' || group.kind === 'doughnut') drawPie(pc, group, plot);
}

function valueY(pc: PaintContext, value: number): number {
  const { plot } = pc.layout;
  const scale = pc.model.scale;
  return plot.y + plot.height * (1 - (value - scale.min) / (scale.max - scale.min));
}

function valueX(pc: PaintContext, value: number): number {
  const { plot } = pc.layout;
  const scale = pc.model.scale;
  return plot.x + plot.width * (value - scale.min) / (scale.max - scale.min);
}

function zeroY(pc: PaintContext): number {
  const scale = pc.model.scale;
  return valueY(pc, Math.min(Math.max(0, scale.min), scale.max));
}

function drawBars(pc: PaintContext, group: PaintGroup, plot: Plot): void {
  const { ctx } = pc;
  const count = Math.max(1, group.categories.length);
  const seriesN = group.series.length;
  const slot = (group.horizontal ? plot.height : plot.width) / count;
  // Trial bar sizing (TASK 54 `.probe/t54/measure-bars2.mjs`, sub-pixel edges of the painted
  // clusters; `gapWidth`/`overlap` read back through the public getters): the CATEGORY GAP is
  // `gapWidth% of the cluster width divided by the number of series`, not of one bar. Solving
  // `slot = cluster + gapWidth * cluster / seriesN` and `cluster = barW * (1 + (n-1)*(1-overlap))`
  // gives the exact trial values (measured, 3 series / 3 categories / gap 182 / overlap -27:
  // cluster 124.89 -> bar 21.96 step 27.85; 2 series: 28.81 / 36.56; 1 series: 44.29, and the
  // gap 150 / 50 cases `slot / (1 + gapWidth)` for a single series).
  const pitch = 1 - group.overlap;
  const cluster = group.stacked ? slot / (1 + group.gapWidth)
    : (slot * seriesN) / (seriesN + group.gapWidth);
  const barW = group.stacked ? cluster : cluster / (1 + (seriesN - 1) * pitch);
  // Horizontal bars pack series touching (step == barW); columns spread by overlap.
  const step = group.stacked || group.horizontal ? barW : barW * pitch;
  const groupSpan = group.stacked ? barW : barW + (seriesN - 1) * step;
  const totals = group.categories.map((_, index) => group.series.reduce((sum, ser) => sum + Math.abs(ser.values[index] ?? 0), 0));
  const stacks = new Array<number>(count).fill(0);
  for (const ser of group.series) {
    ser.values.forEach((rawValue, index) => {
      if (rawValue === null) return;
      let from = 0;
      let to = 0;
      if (group.percent) {
        const base = totals[index] || 1;
        from = (stacks[index] / base) * 100;
        stacks[index] += Math.abs(rawValue);
        to = (stacks[index] / base) * 100;
      } else if (group.stacked) {
        from = stacks[index];
        stacks[index] += rawValue;
        to = stacks[index];
      } else {
        from = 0;
        to = rawValue;
      }
      const color = ser.color ?? '#4472c4';
      ctx.fillStyle = color;
      // Horizontal bar charts stack the series top-to-bottom in reverse
      // creation order (the trial puts the first series closest to the labels).
      const si = group.horizontal ? group.series.length - 1 - group.series.indexOf(ser) : group.series.indexOf(ser);
      if (group.horizontal) {
        const slotCenter = plot.y + slot * (count - 1 - index) + slot / 2;
        const y0 = slotCenter - groupSpan / 2 + (group.stacked ? 0 : step * si);
        const a = valueX(pc, Math.min(from, to));
        const b = valueX(pc, Math.max(from, to));
        ctx.fillRect(a, y0, Math.max(1, b - a), Math.max(1, barW));
        const text = seriesLabelText(pc, ser, group.categories[index] ?? '', formatValue(to, ser.dLbls?.numFmt?.formatCode));
        if (text) drawBarLabel(pc, ser, group.categories[index] ?? '', text, { x: a, y: y0, w: Math.max(1, b - a), h: barW }, true);
      } else {
        const slotCenter = plot.x + slot * index + slot / 2;
        const x0 = slotCenter - groupSpan / 2 + (group.stacked ? 0 : step * si);
        const yTop = valueY(pc, Math.max(from, to));
        const yBottom = valueY(pc, Math.min(from, to));
        ctx.fillRect(x0, yTop, Math.max(1, barW), Math.max(1, yBottom - yTop));
        const text = seriesLabelText(pc, ser, group.categories[index] ?? '', formatValue(to, ser.dLbls?.numFmt?.formatCode));
        if (text) drawBarLabel(pc, ser, group.categories[index] ?? '', text, { x: x0, y: yTop, w: barW, h: Math.max(1, yBottom - yTop) }, false);
      }
    });
  }
}

function lineX(pc: PaintContext, index: number, count: number, kind: string, secondary = false): number {
  if (kind === 'line') {
    const p = secondary ? pc.layout.plot : pc.layout.plotLine;
    return p.x + (count > 0 ? (p.width * (index + 0.5)) / count : p.width / 2);
  }
  const { plot } = pc.layout;
  return plot.x + (count > 1 ? (plot.width * index) / (count - 1) : plot.width / 2);
}

function drawLines(pc: PaintContext, group: PaintGroup, plot: Plot): void {
  const { ctx } = pc;
  void plot;
  // Secondary-axis lines sit on the (non-widened) bar bands and use the
  // secondary value scale.
  const secondary = group.axisGroup !== 0 && pc.model.secondaryScale !== undefined;
  const band = secondary ? pc.layout.plot : pc.layout.plotLine;
  const scale = secondary ? pc.model.secondaryScale! : pc.model.scale;
  const yOf = (v: number) => band.y + band.height * (1 - (v - scale.min) / (scale.max - scale.min));
  const stacks = new Array<number>(Math.max(1, group.categories.length)).fill(0);
  // 100%-stacked lines/areas normalise every category column to 100 the same
  // way the bars do: cumulative sum of |value| over the per-category |total|.
  const totals = new Array<number>(Math.max(1, group.categories.length)).fill(0);
  if (group.percent) {
    for (const ser of group.series) ser.values.forEach((v, i) => { totals[i] += Math.abs(v ?? 0); });
  }
  for (const ser of group.series) {
    const count = ser.values.length;
    const points: { x: number, y: number, prevY: number, value: number }[] = [];
    ser.values.forEach((value, index) => {
      if (value === null) return;
      let stackedValue: number;
      let prevValue: number;
      if (group.percent) {
        const base = totals[index] || 1;
        prevValue = (stacks[index] / base) * 100;
        stacks[index] += Math.abs(value);
        stackedValue = (stacks[index] / base) * 100;
      } else if (group.stacked) {
        prevValue = stacks[index];
        stackedValue = stacks[index] += value;
      } else {
        prevValue = 0;
        stackedValue = value;
      }
      points.push({
        x: lineX(pc, index, count, group.kind, secondary),
        y: yOf(stackedValue),
        prevY: group.stacked || group.percent ? yOf(prevValue) : zeroY(pc),
        value,
      });
    });
    if (!points.length) continue;
    if (group.kind === 'area') {
      // Stacked areas fill the band between the previous and the new stack
      // level; plain areas fill down to zero (unchanged behaviour).
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].prevY);
      for (const point of points) ctx.lineTo(point.x, point.y);
      for (let i = points.length - 1; i >= 0; i--) ctx.lineTo(points[i].x, points[i].prevY);
      ctx.closePath();
      ctx.fillStyle = ser.color ?? '#4472c4';
      ctx.fill();
    }
    ctx.strokeStyle = ser.color ?? '#4472c4';
    ctx.lineWidth = 2;
    ctx.beginPath();
    points.forEach((point, index) => (index === 0 ? ctx.moveTo(point.x, point.y) : ctx.lineTo(point.x, point.y)));
    ctx.stroke();
    if (ser.marker) {
      for (const point of points) drawMarker(ctx, point.x, point.y, ser.marker.shape, ser.marker.size, ser.marker.fill ?? ser.color ?? '#4472c4');
    }
    if (ser.dLbls) {
      points.forEach((point, index) => {
        const text = seriesLabelText(pc, ser, group.categories[index] ?? '', formatValue(point.value, ser.dLbls?.numFmt?.formatCode));
        if (text) drawPointLabel(pc, ser, group.categories[index] ?? '', text, point.x, point.y);
      });
    }
  }
}

function drawScatter(pc: PaintContext, group: PaintGroup, plot: Plot): void {
  const { ctx } = pc;
  void group;
  const scale = pc.model.xScale;
  for (const ser of group.series) {
    const xValues = ser.valuesFallbackX ?? ser.values;
    const points: { x: number, y: number, value: number }[] = [];
    ser.values.forEach((value, index) => {
      if (value === null) return;
      const x = scale.max > scale.min ? plot.x + plot.width * ((xValues[index] ?? value) - scale.min) / (scale.max - scale.min) : plot.x;
      points.push({ x, y: valueY(pc, value), value });
    });
    // Line-drawing scatter variants keep the series connector (trial `ln`
    // without `noFill`); plain xyScatter and the NoMarkers types differ only
    // in the marker.
    if (ser.hasLine && points.length > 1) {
      ctx.strokeStyle = ser.color ?? '#4472c4';
      ctx.lineWidth = 2;
      strokeSeriesPath(ctx, points.map(p => ({ x: p.x, y: p.y })), !!ser.smooth);
    }
    if (ser.marker) for (const point of points) drawMarker(ctx, point.x, point.y, ser.marker.shape, ser.marker.size, ser.marker.fill ?? ser.color ?? '#4472c4');
    if (ser.dLbls) {
      points.forEach((point, index) => {
        const text = seriesLabelText(pc, ser, group.categories[index] ?? '', formatValue(point.value, ser.dLbls?.numFmt?.formatCode));
        if (text) drawPointLabel(pc, ser, group.categories[index] ?? '', text, point.x, point.y);
      });
    }
  }
}

function drawBubble(pc: PaintContext, group: PaintGroup, plot: Plot): void {
  const { ctx } = pc;
  const scale = pc.model.xScale;
  // Trial (bubbleScale 100): the largest bubble's diameter is 30% of the plot
  // height; others scale with sqrt(size / global max size).
  const max = pc.model.bubbleMax && pc.model.bubbleMax > 0 ? pc.model.bubbleMax : 1;
  const bubbleGroup = (pc.chart._space.chart.plotArea?.chartGroups ?? []).find((g: JsonRecord) => Number(g.chartType) === 3);
  const dMax = 0.3 * plot.height * (Number(bubbleGroup?.bubbleScale ?? 100) / 100);
  for (const ser of group.series) {
    const xValues = ser.valuesFallbackX ?? ser.values;
    ctx.fillStyle = ser.color ?? '#4472c4';
    ser.values.forEach((value, index) => {
      if (value === null) return;
      const x = scale.max > scale.min ? plot.x + plot.width * ((xValues[index] ?? value) - scale.min) / (scale.max - scale.min) : plot.x;
      const size = ser.sizes?.[index] ?? 1;
      const r = Math.max(0.5, (dMax / 2) * Math.sqrt(Math.max(0, Number(size)) / max));
      ctx.beginPath();
      ctx.arc(x, valueY(pc, value), r, 0, Math.PI * 2);
      ctx.fill();
    });
  }
}

/**
 * Radar (trial-measured on a 420x280 chart): rings are polygons through the
 * category spokes, first category at the top going clockwise; centre
 * `cy = plot.bottom - 19 - r/2`, radius `r = (plot.height + 12)/2`; value
 * labels stack on the top spoke; categories sit outside the outer vertices.
 */
function drawRadar(pc: PaintContext, group: PaintGroup, plot: Plot): void {
  const { ctx } = pc;
  const scale = pc.model.scale;
  const cats = group.categories.length ? group.categories : group.series[0]?.values.map((_, i) => i + 1) ?? [];
  const n = Math.max(1, cats.length);
  const r = (plot.height + 12) / 2;
  const cx = plot.x + plot.width / 2;
  const cy = plot.y + plot.height - 19 - r / 2;
  const radiusOf = (value: number) => ((value - scale.min) / (scale.max - scale.min)) * r;
  const angleOf = (index: number) => -Math.PI / 2 + (index * 2 * Math.PI) / n;
  // rings (polygon through the category directions at every tick above min)
  ctx.strokeStyle = '#d9d9d9';
  ctx.lineWidth = 1;
  for (const tick of scale.ticks) {
    if (tick <= scale.min) continue;
    const rr = radiusOf(tick);
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const a = angleOf(i);
      const x = cx + rr * Math.cos(a);
      const y = cy + rr * Math.sin(a);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();
  }
  // value labels on the top spoke (0..max, centred just left of the vertex)
  ctx.font = '12px Calibri, "Segoe UI", Arial, sans-serif';
  ctx.fillStyle = '#595959';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (const tick of scale.ticks) ctx.fillText(formatValue(tick), cx - 1, cy - radiusOf(tick) - 1);
  // series polygons — filled when the group carries `radarStyle: 2` (trial)
  const filled = (pc.chart._space.chart.plotArea?.chartGroups ?? [])
    .some((g: JsonRecord) => Number(g.chartType) === 2 && Number(g.radarStyle) === 2);
  for (const ser of group.series) {
    const points: { x: number, y: number }[] = [];
    ser.values.forEach((value, index) => {
      if (value === null) return;
      const a = angleOf(index);
      const rr = radiusOf(value);
      points.push({ x: cx + rr * Math.cos(a), y: cy + rr * Math.sin(a) });
    });
    if (!points.length) continue;
    ctx.beginPath();
    points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.closePath();
    if (filled) {
      ctx.fillStyle = ser.color ?? '#4472c4';
      ctx.fill();
    } else {
      ctx.strokeStyle = ser.color ?? '#4472c4';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    if (ser.marker && !filled) {
      for (const p of points) drawMarker(ctx, p.x, p.y, ser.marker.shape, ser.marker.size, ser.marker.fill ?? ser.color ?? '#4472c4');
    }
  }
  // category labels outside the outer ring vertices
  ctx.fillStyle = '#595959';
  ctx.font = '12px Calibri, "Segoe UI", Arial, sans-serif';
  cats.forEach((label, index) => {
    const a = angleOf(index);
    const x = cx + r * Math.cos(a);
    const y = cy + r * Math.sin(a);
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    if (Math.abs(cos) < 0.05 && sin < 0) {
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillText(String(label), cx, y - 8);
    } else if (cos > 0.05) {
      ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText(String(label), x + 5, y + 6);
    } else if (cos < -0.05) {
      ctx.textAlign = 'right'; ctx.textBaseline = 'top'; ctx.fillText(String(label), x - 5, y + 6);
    } else {
      ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText(String(label), x, y + 6);
    }
  });
}

/** Stroke a polyline; smooth curves use Catmull-Rom-derived cubic Béziers. */
function strokeSeriesPath(ctx: CanvasRenderingContext2D, points: { x: number, y: number }[], smooth: boolean): void {
  ctx.beginPath();
  if (!smooth || points.length < 3) {
    points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  } else {
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[Math.max(0, i - 1)];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[Math.min(points.length - 1, i + 2)];
      ctx.bezierCurveTo(
        p1.x + (p2.x - p0.x) / 6, p1.y + (p2.y - p0.y) / 6,
        p2.x - (p3.x - p1.x) / 6, p2.y - (p3.y - p1.y) / 6,
        p2.x, p2.y,
      );
    }
  }
  ctx.stroke();
}

export function drawMarker(ctx: CanvasRenderingContext2D, x: number, y: number, shape: number, size: number, fill: string): void {
  const r = size * 0.75;
  ctx.fillStyle = fill;
  ctx.strokeStyle = fill;
  ctx.lineWidth = 1;
  ctx.beginPath();
  switch (shape) {
    case 1: ctx.moveTo(x - r, y); ctx.lineTo(x + r, y); ctx.stroke(); return;
    case 2: ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y); ctx.closePath(); break;
    case 3: ctx.arc(x, y, r * 0.8, 0, Math.PI * 2); break;
    case 6: ctx.moveTo(x - r, y); ctx.lineTo(x + r, y); ctx.moveTo(x, y - r); ctx.lineTo(x, y + r); ctx.stroke(); return;
    case 7: ctx.rect(x - r * 0.85, y - r * 0.85, r * 1.7, r * 1.7); break;
    case 8: starPath(ctx, x, y, r); break;
    case 9: ctx.moveTo(x, y - r); ctx.lineTo(x + r, y + r * 0.8); ctx.lineTo(x - r, y + r * 0.8); ctx.closePath(); break;
    case 10: ctx.moveTo(x - r, y - r); ctx.lineTo(x + r, y + r); ctx.moveTo(x - r, y + r); ctx.lineTo(x + r, y - r); ctx.stroke(); return;
    default: ctx.arc(x, y, r, 0, Math.PI * 2); break;
  }
  ctx.fill();
}

function starPath(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  for (let i = 0; i < 10; i++) {
    const radius = i % 2 === 0 ? r : r * 0.45;
    const angle = (Math.PI / 5) * i - Math.PI / 2;
    const px = x + radius * Math.cos(angle);
    const py = y + radius * Math.sin(angle);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

/**
 * Stock glyphs (trial-measured on a 420x280 chart). A single stock group is
 * laid out one glyph per category, centred in the slot:
 *  - <=3 series -> HiLo-Close: a vertical high..low line with a horizontal
 *    close tick on the right (high = max, low = min over the series);
 *  - 4 series -> OHLC: a hollow body from open..close with wicks to high/low
 *    (series order Open, High, Low, Close).
 * The colour is the group's first series accent (green in the trial). Volume
 * (VHLC/VOHLC) is a separate bar group painted by the bar path; the stock
 * group here sits on the secondary scale.
 */
function drawStock(pc: PaintContext, group: PaintGroup, plot: Plot): void {
  const { ctx } = pc;
  const secondary = group.axisGroup !== 0 && pc.model.secondaryScale !== undefined;
  const scale = secondary ? pc.model.secondaryScale! : pc.model.scale;
  const yOf = (v: number) => plot.y + plot.height * (1 - (v - scale.min) / (scale.max - scale.min));
  const count = Math.max(1, group.categories.length);
  const slot = plot.width / count;
  // Trial hard-codes the glyph colours: HiLo-Close in green (32,140,52),
  // the OHLC candle lines in grey (~115), independent of the series accent.
  const n = group.series.length;
  const color = n >= 4 ? 'rgb(115,115,115)' : 'rgb(32,140,52)';
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 1;
  group.categories.forEach((_, i) => {
    const vals = group.series.map(ser => ser.values[i] ?? null);
    if (vals.every(v => v === null)) return;
    const cx = plot.x + slot * i + slot / 2;
    if (n >= 4) {
      const [open, close] = [vals[0], vals[n - 1]] as number[];
      const present = vals.filter((v): v is number => v !== null);
      const top = yOf(Math.max(...present));
      const bot = yOf(Math.min(...present));
      // Trial (measured): candle body = rectangle between the first and last
      // series (open..close), 70% of the category slot wide; the wick spans
      // min..max of all four values; the lines are grey rgb(115,115,115).
      const half = slot * 0.35;
      ctx.beginPath();
      ctx.moveTo(cx, top); ctx.lineTo(cx, bot);
      ctx.stroke();
      const bTop = Math.min(yOf(open), yOf(close));
      ctx.strokeRect(cx - half, bTop, half * 2, Math.max(1, Math.abs(yOf(open) - yOf(close))));
      return;
    }
    const present = vals.filter((v): v is number => v !== null);
    const high = Math.max(...present);
    const low = Math.min(...present);
    const close = present[present.length - 1];
    const half = Math.min(9, slot * 0.14);
    ctx.beginPath();
    ctx.moveTo(cx, yOf(high)); ctx.lineTo(cx, yOf(low));
    ctx.moveTo(cx, yOf(close)); ctx.lineTo(cx + half, yOf(close));
    ctx.stroke();
  });
}

function drawPie(pc: PaintContext, group: PaintGroup, plot: Plot): void {
  const { ctx } = pc;
  // The trial shrinks a plain pie to ~84.8% of the annulus radius (label room).
  const radius = Math.min(plot.width, plot.height) / 2 * (group.kind === 'pie' ? 0.848 : 1);
  // Doughnut rings shrink geometrically: ring i spans r*h^i .. r*h^(i+1)
  // where h is the hole size (measured from the trial's 3-ring doughnut).
  const hole = group.kind === 'doughnut' ? Math.max(0.1, Math.min(0.95, group.holeSize)) : 0;
  const cx = plot.x + plot.width / 2;
  const cy = plot.y + plot.height / 2;
  const start = (-90 + group.firstSliceAng) * (Math.PI / 180);
  if (group.kind === 'pie') {
    const ser = group.series[0];
    if (!ser) return;
    const total = ser.values.reduce((sum: number, value) => sum + Math.abs(value ?? 0), 0) || 1;
    let angle = start;
    ser.values.forEach((value, index) => {
      const magnitude = Math.abs(value ?? 0);
      if (magnitude <= 0) return;
      const sweep = (magnitude / total) * Math.PI * 2;
      slice(ctx, cx, cy, radius, 0, angle, angle + sweep, ser.pointColors[index] ?? ser.color ?? '#4472c4');
      const label = seriesLabelText(pc, ser, group.categories[index] ?? '', formatValue(magnitude, ser.dLbls?.numFmt?.formatCode), `${Math.round((magnitude / total) * 100)}%`);
      if (label) {
        const mid = angle + sweep / 2;
        const lr = radius * 0.65;
        seriesLabelStyle(pc, ser);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, cx + lr * Math.cos(mid), cy + lr * Math.sin(mid));
      }
      angle += sweep;
    });
    return;
  }
  // Doughnut: one ring per CATEGORY (outermost first); equal annulus slots,
  // the 2px white slice stroke leaves the visible gaps between bands.
  const ringN = Math.max(1, group.categories.length);
  const pitch = (radius * (1 - hole)) / ringN;
  group.categories.forEach((_, ringIndex) => {
    const outer = radius - ringIndex * pitch;
    const inner = outer - pitch;
    const total = group.series.reduce((sum, ser) => sum + Math.abs(ser.values[ringIndex] ?? 0), 0) || 1;
    let angle = start;
    for (const ser of group.series) {
      const magnitude = Math.abs(ser.values[ringIndex] ?? 0);
      if (magnitude <= 0) continue;
      const sweep = (magnitude / total) * Math.PI * 2;
      slice(ctx, cx, cy, outer, inner, angle, angle + sweep, ser.color ?? '#4472c4');
      angle += sweep;
    }
  });
}

function slice(ctx: CanvasRenderingContext2D, cx: number, cy: number, outer: number, inner: number, from: number, to: number, color: string): void {
  ctx.beginPath();
  ctx.arc(cx, cy, outer, from, to);
  if (inner > 0) ctx.arc(cx, cy, inner, to, from, true);
  else ctx.lineTo(cx, cy);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.stroke();
}
