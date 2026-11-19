/**
 * Painting for the DataCharts types (boxWhisker, funnel, paretoLine,
 * regionMap, sunburst, treemap, waterfall). The trial renders these offline
 * with simplified fallback glyphs; every rectangle radius, band and colour
 * here was measured black-box from the official trial screenshots on the
 * 420x280 comparison chart (see docs/STATUS.md TASK 39 family 4 notes).
 */
import type { Chart } from './chart.js';
import type { JsonRecord } from './types.js';
import { LAYOUT_PUBLIC_TYPE, dataSeriesRefs } from './data-charts.js';
import { computeScale, formatAxisNumber } from './scale.js';
import { readSeriesData } from './data.js';
import { resolveRefText } from './data.js';
import { resolveChartColor } from './colors-resolve.js';
import { getTitle, getLegend } from './accessors.js';
import { DEFAULT_COLOR_LIST } from './color-schemes.js';

const AXIS_FONT = '12px Calibri, "Segoe UI", Arial, sans-serif';
const LEGEND_FONT = '12px Calibri, "Segoe UI", Arial, sans-serif';
const GRID = '#d9d9d9';
const LABEL = '#595959';

interface Rect { x: number, y: number, width: number, height: number }

export function paintDataChart(chart: Chart, ctx: CanvasRenderingContext2D, width: number, height: number): void {
  const space = chart._space;
  const sheet = chart._sheet;
  const region = space.chart.plotArea.plotAreaRegion as JsonRecord;
  const layoutId = Number(region.series?.[0]?.layoutId ?? 0);
  ctx.clearRect(0, 0, width, height);
  const area = (space.spPr ?? {}) as JsonRecord;
  ctx.fillStyle = resolveChartColor(area.solidFill ?? 'background 1 0', sheet, '#ffffff') ?? '#ffffff';
  ctx.fillRect(0, 0, width, height);
  if (!sheet) return;
  const userBorderW = area.ln?.solidFill && Number(area.ln?.w) > 1 ? Number(area.ln.w) : 0;
  ctx.strokeStyle = resolveChartColor(area.ln?.solidFill ?? 'text 1 85', sheet, '#d9d9d9') ?? '#d9d9d9';
  ctx.lineWidth = userBorderW > 0 ? userBorderW : 1;
  if (userBorderW > 0) ctx.strokeRect(userBorderW + 1.5, userBorderW + 1.5, Math.max(1, width - 3 - userBorderW * 2), Math.max(1, height - 3 - userBorderW * 2));
  else ctx.strokeRect(0.5, 0.5, width - 1, height - 1);

  const titleInfo = getTitle(space, chart._loaded, ref => resolveRefText(sheet, ref));
  if (titleInfo.text) {
    ctx.font = `${Number(titleInfo.fontSize ?? 18.67)}px Calibri, "Segoe UI", Arial, sans-serif`;
    ctx.fillStyle = resolveChartColor(titleInfo.color, sheet, '#595959') ?? '#595959';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(titleInfo.text), width / 2, 15);
  }
  const dispBlanksAs = Number(space.chart.dispBlanksAs ?? 1);
  const data = readSeriesData(sheet, dataSeriesRefs(space), dispBlanksAs);
  const publicType = LAYOUT_PUBLIC_TYPE[layoutId] ?? 0;
  const legend = getLegend(space);
  if (publicType === 53 || publicType === 55 || publicType === 56) {
    paintColumnFallback(chart, ctx, width, height, data, publicType, legend);
  } else if (publicType === 54) {
    paintFunnel(ctx, width, height, data);
  } else if (publicType === 59) {
    paintWaterfall(ctx, width, height, data, region, legend);
  } else if (publicType === 57) {
    paintSunburst(ctx, width, height, data, region);
  } else if (publicType === 58) {
    paintTreemap(ctx, width, height, data, region, legend);
  }
}

/** boxWhisker / paretoLine / regionMap: clustered columns (first row / all rows). */
function paintColumnFallback(chart: Chart, ctx: CanvasRenderingContext2D, width: number, height: number,
  data: ReturnType<typeof readSeriesData>, publicType: number, legend: JsonRecord): void {
  const sheet = chart._sheet;
  const single = publicType === 53;
  const series = single ? data.series.slice(0, 1) : data.series;
  const all = series.flatMap(s => s.values).filter((v): v is number => v !== null);
  const max = all.length ? Math.max(...all) : 1;
  const scale = computeScale(Math.min(0, ...all), max, { exactMax: true });
  const plot: Rect = { x: 16, y: 38, width: Math.max(10, width - 16 - 11), height: Math.max(10, height - 38 - 78) };
  drawValueAxis(ctx, plot, scale, legend.visible !== false);
  const count = Math.max(1, data.categories.length);
  const band = plot.width * 0.752;
  const bandX = plot.x + (plot.width - band) / 2;
  const slot = band / count;
  series.forEach((ser, s) => {
    const cluster = single ? slot / 1.06 : slot * 0.7;
    const barW = single ? cluster : (cluster - (series.length - 1)) / series.length;
    data.categories.forEach((_, i) => {
      const v = ser.values[i];
      if (v === null || v === undefined) return;
      const y = plot.y + plot.height * (1 - (v - scale.min) / (scale.max - scale.min));
      const bx = single
        ? bandX + slot * i
        : bandX + slot * i + (slot - cluster) / 2 + s * (barW + 1);
      ctx.fillStyle = resolveChartColor(single ? 'accent 1 0' : `accent ${s + 1} 0`, sheet, '#4472c4') ?? '#4472c4';
      ctx.fillRect(Math.round(bx), Math.round(y), Math.round(barW), Math.round(plot.y + plot.height - y));
    });
  });
  // categories
  ctx.font = AXIS_FONT;
  ctx.fillStyle = LABEL;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  data.categories.forEach((label, i) => {
    ctx.fillText(String(label), bandX + slot * i + slot / 2, plot.y + plot.height + 8);
  });
  if (legend.visible !== false) drawLegend(ctx, width, height, legendEntriesFor(chart, data, publicType), Number(legend.position ?? 4));
}

function paintFunnel(ctx: CanvasRenderingContext2D, width: number, height: number, data: ReturnType<typeof readSeriesData>): void {
  const values = (data.series[0]?.values ?? []).filter((v): v is number => v !== null);
  const max = values.length ? Math.max(...values) : 1;
  const plot: Rect = { x: 31, y: height * 0.2214, width: Math.max(10, width - 31 - 7), height: Math.max(10, height * (0.875 - 0.2214)) };
  const count = Math.max(1, data.categories.length);
  const slot = plot.height / count;
  data.categories.forEach((label, i) => {
    const v = data.series[0]?.values[i] ?? 0;
    const w = (Number(v) / max) * plot.width;
    ctx.fillStyle = 'rgb(91,155,213)';
    ctx.fillRect(Math.round(plot.x + (plot.width - w) / 2), Math.round(plot.y + slot * i), Math.round(w), Math.round(slot - 2));
    ctx.font = AXIS_FONT;
    ctx.fillStyle = LABEL;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(label), plot.x - 3, plot.y + slot * i + slot / 2);
  });
}

function paintWaterfall(ctx: CanvasRenderingContext2D, width: number, height: number, data: ReturnType<typeof readSeriesData>,
  region: JsonRecord, legend: JsonRecord): void {
  const values = data.series[0]?.values ?? [];
  let cum = 0;
  const steps: { from: number, to: number }[] = values.map(v => {
    const from = cum;
    cum += Number(v ?? 0);
    return { from, to: cum };
  });
  const min = Math.min(0, ...steps.map(s => Math.min(s.from, s.to)));
  const max = Math.max(...steps.map(s => Math.max(s.from, s.to)), min + 1);
  // Trial: the running-total maximum sits exactly at the plot top and the
  // gridline list stops at the last whole unit below it.
  const scale = computeScale(min, max, { exactTop: true });
  const plot: Rect = { x: 28, y: 78, width: Math.max(10, width - 28 - 8), height: Math.max(10, 250 - 78) };
  // gridlines at whole units below the exact top (no left axis line).
  scale.ticks.forEach(tick => {
    const ratio = (tick - scale.min) / (scale.max - scale.min);
    const y = plot.y + plot.height * (1 - ratio);
    ctx.strokeStyle = GRID;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(plot.x, Math.round(y) + 0.5);
    ctx.lineTo(plot.x + plot.width, Math.round(y) + 0.5);
    ctx.stroke();
    ctx.font = AXIS_FONT;
    ctx.fillStyle = LABEL;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(formatAxisNumber(tick), plot.x - 2, y);
  });
  const count = Math.max(1, steps.length);
  const band = plot.width * 0.75;
  const bandX = plot.x + (plot.width - band) / 2;
  const slot = band / count;
  const barW = slot / 1.5;
  const yOf = (v: number) => plot.y + plot.height * (1 - (v - scale.min) / (scale.max - scale.min));
  steps.forEach((step, i) => {
    const x = bandX + slot * i + (slot - barW) / 2;
    const top = yOf(Math.max(step.from, step.to));
    const bot = yOf(Math.min(step.from, step.to));
    ctx.fillStyle = 'rgb(91,155,213)';
    ctx.fillRect(Math.round(x), Math.round(top), Math.round(barW), Math.max(1, Math.round(bot - top)));
    // connector to the next bar at the running total level
    const next = steps[i + 1];
    if (next) {
      ctx.strokeStyle = GRID;
      ctx.lineWidth = 1;
      const y = Math.round(yOf(step.to)) + 0.5;
      ctx.beginPath();
      ctx.moveTo(x + barW, y);
      ctx.lineTo(bandX + slot * (i + 1) + (slot - barW) / 2, y);
      ctx.stroke();
    }
    ctx.font = AXIS_FONT;
    ctx.fillStyle = LABEL;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(String(data.categories[i] ?? ''), x + barW / 2, plot.y + plot.height + 8);
  });
  void legend;
  drawLegend(ctx, width, height, [
    { name: 'Increase', color: 'rgb(91,155,213)' },
    { name: 'Decrease', color: 'rgb(237,125,49)' },
    { name: 'Total', color: 'rgb(165,165,165)' },
  ], 1);
}

function paintSunburst(ctx: CanvasRenderingContext2D, width: number, height: number, data: ReturnType<typeof readSeriesData>,
  region: JsonRecord): void {
  const values = data.series[0]?.values ?? [];
  const cats = data.categories;
  const pts = (region.series?.[0]?.dataPt ?? []) as JsonRecord[];
  const items = cats.map((label, i) => ({
    label: String(label),
    value: Math.max(0, Number(values[i] ?? 0)),
    color: pts[i]?.spPr?.solidFill ? cssOf(pts[i].spPr.solidFill) : `rgb(91,155,213)`,
  })).filter(it => it.value > 0).sort((a, b) => b.value - a.value);
  const total = items.reduce((sum, it) => sum + it.value, 0) || 1;
  const top = 38;
  const bottom = height - 11;
  const cx = width / 2 - 1.5;
  const cy = (top + bottom) / 2;
  const rOuter = (bottom - top) / 2 + 1.5;
  const rInner = rOuter / 3;
  let angle = -Math.PI / 2;
  items.forEach(it => {
    const sweep = (it.value / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(cx, cy, rOuter, angle, angle + sweep, false);
    ctx.arc(cx, cy, rInner, angle + sweep, angle, true);
    ctx.closePath();
    ctx.fillStyle = it.color;
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();
    // category label
    const mid = angle + sweep / 2;
    const lx = cx + Math.cos(mid) * (rInner + (rOuter - rInner) * 0.56);
    const ly = cy + Math.sin(mid) * (rInner + (rOuter - rInner) * 0.56);
    ctx.font = '12px Calibri, "Segoe UI", Arial, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(it.label, lx, ly);
    angle += sweep;
  });
}

function paintTreemap(ctx: CanvasRenderingContext2D, width: number, height: number, data: ReturnType<typeof readSeriesData>,
  region: JsonRecord, legend: JsonRecord): void {
  const values = data.series[0]?.values ?? [];
  const pts = (region.series?.[0]?.dataPt ?? []) as JsonRecord[];
  const items = data.categories.map((label, i) => ({
    label: String(label),
    value: Math.max(0, Number(values[i] ?? 0)),
    color: pts[i]?.spPr?.solidFill ? cssOf(pts[i].spPr.solidFill) : 'rgb(91,155,213)',
  })).filter(it => it.value > 0).sort((a, b) => b.value - a.value);
  const total = items.reduce((sum, it) => sum + it.value, 0) || 1;
  const plot: Rect = { x: 6, y: 79, width: Math.max(10, width - 6 - 9), height: Math.max(10, height - 4 - 79) };
  let x = plot.x;
  items.forEach(it => {
    const w = (it.value / total) * plot.width;
    ctx.fillStyle = it.color;
    ctx.fillRect(x, plot.y, w, plot.height);
    // Trial: the white cell borders are 2 px strokes ON the cell edges.
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, plot.y, w, plot.height);
    ctx.font = '12px Calibri, "Segoe UI", Arial, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(it.label, x + 7, plot.y + plot.height - 12);
    x += w;
  });
  void legend;
  // Legend lists the categories in sorted (descending) order.
  drawLegend(ctx, width, height, items.map(it => ({ name: it.label, color: it.color })), 1);
}

function cssOf(colorObj: JsonRecord): string {
  if (colorObj?.srgbClr?.val) return `rgb(${(colorObj.srgbClr.val as number[]).join(',')})`;
  return 'rgb(91,155,213)';
}

function drawValueAxis(ctx: CanvasRenderingContext2D, plot: Rect, scale: ReturnType<typeof computeScale>, showValues: boolean): void {
  scale.ticks.forEach(tick => {
    const ratio = (tick - scale.min) / (scale.max - scale.min);
    const y = Math.round(plot.y + plot.height * (1 - ratio)) + 0.5;
    ctx.strokeStyle = GRID;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(plot.x, y);
    ctx.lineTo(plot.x + plot.width, y);
    ctx.stroke();
    if (showValues) {
      ctx.font = AXIS_FONT;
      ctx.fillStyle = LABEL;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(formatAxisNumber(tick), plot.x - 6, plot.y + plot.height * (1 - ratio));
    }
  });
  ctx.strokeStyle = GRID;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(Math.round(plot.x) + 0.5, plot.y);
  ctx.lineTo(Math.round(plot.x) + 0.5, plot.y + plot.height);
  ctx.stroke();
}

function legendEntriesFor(chart: Chart, data: ReturnType<typeof readSeriesData>, publicType: number): { name: string, color: string | null }[] {
  const single = publicType === 53;
  const series = single ? data.series.slice(0, 1) : data.series;
  return series.map((ser, i) => ({
    name: ser.name || `Series ${i + 1}`,
    color: resolveChartColor(single ? 'accent 1 0' : DEFAULT_COLOR_LIST[i % DEFAULT_COLOR_LIST.length], chart._sheet, '#4472c4'),
  }));
}

function drawLegend(ctx: CanvasRenderingContext2D, width: number, height: number, entries: { name: string, color: string | null }[], position: number): void {
  if (!entries.length) return;
  ctx.font = LEGEND_FONT;
  const total = entries.reduce((sum, entry) => sum + ctx.measureText(entry.name).width + 24, -10);
  const centerY = position === 1 ? 54 : height - 26;
  let x = Math.max(0, (width - total) / 2);
  for (const entry of entries) {
    ctx.fillStyle = entry.color ?? '#4472c4';
    ctx.fillRect(x, centerY - 5, 10, 10);
    ctx.fillStyle = LABEL;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(entry.name, x + 14, centerY);
    x += ctx.measureText(entry.name).width + 24;
  }
}
