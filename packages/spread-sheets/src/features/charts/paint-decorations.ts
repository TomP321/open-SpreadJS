/**
 * Trendline and error-bar painting (TASK 92) on the chart canvas. Both read the
 * raw chartSpace entries carried on each `PaintSeries` and draw them with our
 * own vector art; all geometry follows the series glyphs in `paint-series.ts`
 * so a trendline runs through its bars/markers and an error bar is centred on
 * each point.
 */
import type { PaintContext } from './paint.js';
import type { PaintGroup, PaintSeries } from './paint-model.js';
import type { JsonRecord } from './types.js';
import { fitTrendline, TRENDLINE_TYPE } from './trendlines.js';
import { resolveChartColor } from './colors-resolve.js';
import { resolveRefValues } from './data.js';

interface Plot { x: number, y: number, width: number, height: number }

/** Map a chartSpace `prstDash` index to a canvas dash pattern (PresetLineDashStyle). */
export function dashArray(prstDash: number | undefined): number[] {
  switch (Number(prstDash ?? 0)) {
    case 1: return [1, 2];
    case 2: return [4, 3];
    case 3: return [7, 3];
    case 4: return [4, 2, 1, 2];
    case 5: return [7, 2, 1, 2];
    case 6: return [7, 2, 1, 2, 1, 2];
    case 7: return [3, 2];
    case 8: return [1, 2]; // sysDot — the trial's default trendline
    case 9: return [3, 2, 1, 2];
    case 10: return [3, 2, 1, 2, 1, 2];
    default: return [];
  }
}

function secondaryOf(pc: PaintContext, group: PaintGroup): boolean {
  return group.axisGroup !== 0 && pc.model.secondaryScale !== undefined;
}

/** The plot band the group's series are laid on (line groups use the widened band). */
function bandFor(pc: PaintContext, group: PaintGroup): Plot {
  if (group.kind === 'line' && !secondaryOf(pc, group)) return pc.layout.plotLine;
  return pc.layout.plot;
}

function scaleFor(pc: PaintContext, group: PaintGroup) {
  return secondaryOf(pc, group) ? pc.model.secondaryScale! : pc.model.scale;
}

/** Sample a fitted curve across the extended domain and stroke it, clipped to the plot band. */
function strokeTrendline(
  pc: PaintContext, group: PaintGroup,
  domainLo: number, domainHi: number, valueAt: (d: number) => number | null,
  color: string, width: number, dash: number[],
): boolean {
  const { ctx } = pc;
  const band = bandFor(pc, group);
  const scale = scaleFor(pc, group);
  const count = Math.max(1, group.categories.length);
  const horizontal = group.horizontal;
  const xy = (d: number): { x: number, y: number } | null => {
    const v = valueAt(d);
    if (v === null || !Number.isFinite(v)) return null;
    if (group.kind === 'scatter' || group.kind === 'bubble') {
      const x = pc.model.xScale.max > pc.model.xScale.min
        ? band.x + band.width * (d - pc.model.xScale.min) / (pc.model.xScale.max - pc.model.xScale.min) : band.x;
      return { x, y: band.y + band.height * (1 - (v - scale.min) / (scale.max - scale.min)) };
    }
    // category domain → pixel along the category axis
    let catPx: number;
    if (group.kind === 'line') catPx = (d - 0.5) / count;
    else if (group.kind === 'area') catPx = count > 1 ? (d - 1) / (count - 1) : 0.5;
    else catPx = (d - 0.5) / count; // bar
    const valueRatio = (v - scale.min) / (scale.max - scale.min);
    if (horizontal) return { x: band.x + band.width * valueRatio, y: band.y + band.height * (1 - catPx) };
    return { x: band.x + band.width * catPx, y: band.y + band.height * (1 - valueRatio) };
  };
  const steps = 60;
  ctx.save();
  ctx.beginPath();
  ctx.rect(band.x - 1, band.y - 1, band.width + 2, band.height + 2);
  ctx.clip();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.setLineDash(dash);
  let started = false;
  let painted = false;
  ctx.beginPath();
  for (let i = 0; i <= steps; i++) {
    const d = domainLo + (domainHi - domainLo) * (i / steps);
    const p = xy(d);
    if (!p) { started = false; continue; }
    if (!started) { ctx.moveTo(p.x, p.y); started = true; } else ctx.lineTo(p.x, p.y);
    painted = true;
  }
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
  return painted;
}

/** Draw the moving-average polyline through the per-point sequence. */
function strokeSequence(pc: PaintContext, group: PaintGroup, seq: (number | null)[], color: string, width: number, dash: number[]): void {
  const { ctx } = pc;
  const band = bandFor(pc, group);
  const scale = scaleFor(pc, group);
  const count = Math.max(1, group.categories.length);
  const horizontal = group.horizontal;
  ctx.save();
  ctx.beginPath();
  ctx.rect(band.x - 1, band.y - 1, band.width + 2, band.height + 2);
  ctx.clip();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.setLineDash(dash);
  ctx.beginPath();
  let started = false;
  for (let i = 0; i < seq.length; i++) {
    const v = seq[i];
    if (v === null) { started = false; continue; }
    let catPx: number;
    if (group.kind === 'line') catPx = (i + 0.5) / count;
    else if (group.kind === 'area') catPx = count > 1 ? i / (count - 1) : 0.5;
    else catPx = (i + 0.5) / count;
    const valueRatio = (v - scale.min) / (scale.max - scale.min);
    const x = horizontal ? band.x + band.width * valueRatio : band.x + band.width * catPx;
    const y = horizontal ? band.y + band.height * (1 - catPx) : band.y + band.height * (1 - valueRatio);
    if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

/** Draw the equation / R-squared label near the trendline's right end (trial style). */
function drawTrendlineLabel(pc: PaintContext, group: PaintGroup, lines: string[], endX: number, endY: number): void {
  if (!lines.length) return;
  const { ctx } = pc;
  const band = bandFor(pc, group);
  // Trial renders the equation/R-squared label italic (black-box screenshot, TASK 92).
  ctx.font = 'italic 12px Calibri, "Segoe UI", Arial, sans-serif';
  ctx.fillStyle = '#595959';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  const x = Math.min(band.x + band.width - 4, endX - 4);
  let y = Math.max(band.y + 12, endY - 6);
  for (let i = lines.length - 1; i >= 0; i--) {
    ctx.fillText(lines[i], x, y);
    y -= 13;
  }
}

function trendlineColor(pc: PaintContext, tl: JsonRecord): string {
  const solid = tl.spPr?.ln?.solidFill;
  return resolveChartColor(solid ?? 'accent 1 0', pc.sheet, '#4472c4') ?? '#4472c4';
}

function errorBarColor(pc: PaintContext, eb: JsonRecord): string {
  return resolveChartColor(eb.spPr?.ln?.solidFill ?? 'rgb(89,89,89)', pc.sheet, '#595959') ?? '#595959';
}

/** Sample a trendline's pixel end-point (for label anchoring). */
function trendlineEnd(pc: PaintContext, group: PaintGroup, domainHi: number, valueAt: (d: number) => number | null): { x: number, y: number } | null {
  const band = bandFor(pc, group);
  const scale = scaleFor(pc, group);
  const count = Math.max(1, group.categories.length);
  const v = valueAt(domainHi);
  if (v === null || !Number.isFinite(v)) return null;
  if (group.kind === 'scatter' || group.kind === 'bubble') {
    const x = pc.model.xScale.max > pc.model.xScale.min ? band.x + band.width * (domainHi - pc.model.xScale.min) / (pc.model.xScale.max - pc.model.xScale.min) : band.x;
    return { x, y: band.y + band.height * (1 - (v - scale.min) / (scale.max - scale.min)) };
  }
  let catPx: number;
  if (group.kind === 'area') catPx = count > 1 ? (domainHi - 1) / (count - 1) : 0.5;
  else catPx = (domainHi - 0.5) / count;
  const valueRatio = (v - scale.min) / (scale.max - scale.min);
  if (group.horizontal) return { x: band.x + band.width * valueRatio, y: band.y + band.height * (1 - catPx) };
  return { x: band.x + band.width * catPx, y: band.y + band.height * (1 - valueRatio) };
}

/**
 * Draw every trendline of one series. Category charts regress on the 1-based
 * category index; scatter/bubble on the real x-value. forward/backward extend
 * the drawn domain.
 */
function drawTrendlines(pc: PaintContext, group: PaintGroup, ser: PaintSeries): void {
  const tls = ser.trendlines;
  if (!tls || !tls.length) return;
  const count = ser.values.length;
  const scatter = group.kind === 'scatter' || group.kind === 'bubble';
  // Domain x per point.
  const xs: number[] = scatter
    ? (ser.dataX ?? ser.values.map((_, i) => i + 1))
    : ser.values.map((_, i) => i + 1);
  for (const tl of tls) {
    const type = Number(tl.trendlineType ?? 1);
    const fit = fitTrendline(xs, ser.values, {
      type,
      order: Number(tl.order ?? 2),
      period: Number(tl.period ?? 2),
      intercept: tl.intercept === undefined ? undefined : Number(tl.intercept),
    });
    if (!fit.valid) continue;
    const color = trendlineColor(pc, tl);
    const width = Math.max(1, Number(tl.spPr?.ln?.w ?? 2));
    const dash = dashArray(tl.spPr?.ln?.prstDash);

    if (type === TRENDLINE_TYPE.movingAverage) {
      strokeSequence(pc, group, fit.sequence ?? [], color, width, dash);
      continue;
    }

    // Extended drawing domain.
    let domainLo: number, domainHi: number;
    if (scatter) {
      const xv = xs.filter(v => Number.isFinite(v));
      const lo = Math.min(...xv), hi = Math.max(...xv);
      const span = hi - lo || 1;
      domainLo = lo - Number(tl.backward ?? 0) * span;
      domainHi = hi + Number(tl.forward ?? 0) * span;
    } else {
      domainLo = 1 - Number(tl.backward ?? 0);
      domainHi = count + Number(tl.forward ?? 0);
    }
    const valueAt = (d: number): number | null => fit.predict(d);
    const painted = strokeTrendline(pc, group, domainLo, domainHi, valueAt, color, width, dash);
    if (!painted) continue;

    // Equation / R-squared label.
    const labelLines: string[] = [];
    if (tl.dispEq && fit.equation) labelLines.push(fit.equation);
    if (tl.dispRSqr && fit.rSquaredText) labelLines.push(`R² = ${fit.rSquaredText}`);
    if (labelLines.length) {
      const end = trendlineEnd(pc, group, domainHi, valueAt);
      if (end) drawTrendlineLabel(pc, group, labelLines, end.x, end.y);
    }
  }
}

function stdDev(values: number[]): number {
  const n = values.length;
  if (n < 1) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / n;
  const variance = values.reduce((s, v) => s + (v - mean) * (v - mean), 0) / Math.max(1, n - 1);
  return Math.sqrt(variance);
}

/** Compute the positive / negative error amount for each data point. */
function errorAmounts(pc: PaintContext, ser: PaintSeries, eb: JsonRecord, blanksAs: number): { plus: (number | null)[]; minus: (number | null)[] } {
  const values = ser.values;
  const finite = values.filter((v): v is number => v !== null && Number.isFinite(v));
  const n = finite.length || 1;
  const valueType = Number(eb.errValType ?? 1);
  const barType = Number(eb.errBarType ?? 0);
  const val = Number(eb.val ?? 0);
  const showPlus = barType === 0 || barType === 2;
  const showMinus = barType === 0 || barType === 1;
  const plus: (number | null)[] = new Array(values.length).fill(null);
  const minus: (number | null)[] = new Array(values.length).fill(null);

  if (valueType === 0) { // custom
    const pos = eb.plus?.numRef?.f ? resolveRefValues(pc.sheet, eb.plus.numRef.f, blanksAs) : [];
    const neg = eb.minus?.numRef?.f ? resolveRefValues(pc.sheet, eb.minus.numRef.f, blanksAs) : [];
    for (let i = 0; i < values.length; i++) {
      if (values[i] === null) continue;
      const p = Number(pos[i]);
      const m = Number(neg[i]);
      if (showPlus && Number.isFinite(p)) plus[i] = Math.abs(p);
      if (showMinus && Number.isFinite(m)) minus[i] = Math.abs(m);
    }
    return { plus, minus };
  }

  let amount: (value: number) => number;
  if (valueType === 1) amount = () => val;
  else if (valueType === 2) amount = (value) => Math.abs(value) * val / 100;
  else if (valueType === 3) { const sd = stdDev(finite); amount = () => (eb.val === undefined ? 1 : val) * sd; }
  else if (valueType === 4) { const se = stdDev(finite) / Math.sqrt(n); amount = () => (eb.val === undefined ? 1 : val) * se; }
  else amount = () => val;

  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v === null) continue;
    const a = amount(v);
    if (showPlus) plus[i] = a;
    if (showMinus) minus[i] = a;
  }
  return { plus, minus };
}

/**
 * Draw the error bars of one series: a line through each plotted point along
 * the value axis (vertical for column/line/scatter, horizontal for bar), with
 * optional end caps.
 */
function drawErrorBars(pc: PaintContext, group: PaintGroup, ser: PaintSeries, serIndex: number): void {
  const ebs = ser.errBars;
  if (!ebs || !ebs.length) return;
  const { ctx } = pc;
  const band = bandFor(pc, group);
  const scale = scaleFor(pc, group);
  const count = Math.max(1, group.categories.length);
  const horizontal = group.horizontal;
  const blanksAs = Number(pc.chart._space.chart.dispBlanksAs ?? 1);
  const valueRatio = (v: number) => (v - scale.min) / (scale.max - scale.min);

  // Category-axis pixel for the series' points, and the individual bar centre.
  const seriesN = group.series.length;
  const slot = (horizontal ? band.height : band.width) / count;
  const cluster = group.stacked ? slot / (1 + group.gapWidth) : (slot * seriesN) / (seriesN + group.gapWidth);
  const barW = group.stacked ? cluster : cluster / (1 + (seriesN - 1) * (1 - group.overlap));
  const step = group.stacked || horizontal ? barW : barW * (1 - group.overlap);
  const groupSpan = group.stacked ? barW : barW + (seriesN - 1) * step;
  const si = horizontal ? seriesN - 1 - serIndex : serIndex;
  const categoryPixel = (i: number): number => (horizontal ? slot * (count - 1 - i) + slot / 2 : slot * i + slot / 2);
  const barCentre = (i: number): number => categoryPixel(i) - groupSpan / 2 + (group.stacked ? 0 : step * si) + barW / 2;
  const capHalf = group.kind === 'bar' ? Math.min(barW / 2, 8) : 4;

  for (const eb of ebs) {
    const { plus, minus } = errorAmounts(pc, ser, eb, blanksAs);
    const color = errorBarColor(pc, eb);
    const width = Math.max(1, Number(eb.spPr?.ln?.w ?? 1));
    const dash = dashArray(eb.spPr?.ln?.prstDash);
    const noCap = eb.noEndCap === true;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.setLineDash(dash);
    for (let i = 0; i < ser.values.length; i++) {
      const v = ser.values[i];
      if (v === null || !Number.isFinite(v)) continue;
      const plusAmt = plus[i];
      const minusAmt = minus[i];
      if (plusAmt === null && minusAmt === null) continue;
      const hi = v + (plusAmt ?? 0);
      const lo = v - (minusAmt ?? 0);
      if (horizontal) {
        const cy = group.kind === 'bar' ? barCentre(i) : categoryPixel(i);
        const a = band.x + band.width * valueRatio(lo);
        const b = band.x + band.width * valueRatio(hi);
        ctx.beginPath();
        ctx.moveTo(a, cy);
        ctx.lineTo(b, cy);
        ctx.stroke();
        if (!noCap) {
          ctx.beginPath();
          if (minusAmt !== null) { ctx.moveTo(a, cy - capHalf); ctx.lineTo(a, cy + capHalf); }
          if (plusAmt !== null) { ctx.moveTo(b, cy - capHalf); ctx.lineTo(b, cy + capHalf); }
          ctx.stroke();
        }
      } else {
        const cx = group.kind === 'bar' ? barCentre(i)
          : (group.kind === 'scatter' || group.kind === 'bubble')
            ? (pc.model.xScale.max > pc.model.xScale.min ? band.x + band.width * (((ser.dataX?.[i] ?? ser.values[i] ?? 0)) - pc.model.xScale.min) / (pc.model.xScale.max - pc.model.xScale.min) : band.x)
            : group.kind === 'line' ? band.x + band.width * (i + 0.5) / count
              : group.kind === 'area' ? band.x + band.width * (count > 1 ? i / (count - 1) : 0.5)
                : categoryPixel(i);
        const yHi = band.y + band.height * (1 - valueRatio(hi));
        const yLo = band.y + band.height * (1 - valueRatio(lo));
        ctx.beginPath();
        ctx.moveTo(cx, yLo);
        ctx.lineTo(cx, yHi);
        ctx.stroke();
        if (!noCap) {
          ctx.beginPath();
          if (minusAmt !== null) { ctx.moveTo(cx - capHalf, yLo); ctx.lineTo(cx + capHalf, yLo); }
          if (plusAmt !== null) { ctx.moveTo(cx - capHalf, yHi); ctx.lineTo(cx + capHalf, yHi); }
          ctx.stroke();
        }
      }
    }
    ctx.setLineDash([]);
  }
}

/**
 * Draw all trendlines and error bars of a group (called after the series glyphs
 * so the decorations sit on top). Supported on column/bar/line/area/scatter.
 */
export function drawSeriesDecorations(pc: PaintContext, group: PaintGroup): void {
  if (group.kind !== 'bar' && group.kind !== 'line' && group.kind !== 'area' && group.kind !== 'scatter' && group.kind !== 'bubble') return;
  group.series.forEach((ser, index) => {
    drawErrorBars(pc, group, ser, index);
    drawTrendlines(pc, group, ser);
  });
}
