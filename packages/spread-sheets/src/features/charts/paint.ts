/**
 * Chart painting: frame, title, legend, axes and series on the chart canvas.
 * All geometry and colours are measured from the trial (black-box); every
 * glyph is drawn by our own code.
 */
import type { Chart } from './chart.js';
import type { JsonRecord } from './types.js';
import { buildPaintModel, type PaintGroup, type PaintModel, type PaintSeries } from './paint-model.js';
import { BOTTOM_GUTTER, RIGHT_GUTTER, computeLayout, type ChartLayout } from './layout.js';
import { formatAxisNumber, formatValue } from './scale.js';
import { resolveChartColor } from './colors-resolve.js';
import { getTitle, getLegend, getAxes } from './accessors.js';
import { resolveRefText } from './data.js';
import { autoTrendlineName } from './trendlines.js';
import { dashArray } from './paint-decorations.js';
import { drawGroup } from './paint-series.js';
import { paintDataChart } from './paint-data-charts.js';

const AXIS_FONT = '12px Calibri, "Segoe UI", Arial, sans-serif';

export interface PaintContext {
  ctx: CanvasRenderingContext2D;
  chart: Chart;
  layout: ChartLayout;
  model: PaintModel;
  sheet: NonNullable<Chart['_sheet']>;
}

export function paintChart(chart: Chart, ctx: CanvasRenderingContext2D, width: number, height: number): void {
  const sheet = chart._sheet;
  ctx.clearRect(0, 0, width, height);
  const space = chart._space;
  if (space.chart?.plotArea?.plotAreaRegion) {
    paintDataChart(chart, ctx, width, height);
    return;
  }
  const area = (space.spPr ?? {}) as JsonRecord;
  const background = resolveChartColor(area.solidFill ?? 'background 1 0', sheet, '#ffffff') ?? '#ffffff';
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);
  if (!sheet) return;
  const model = buildPaintModel(chart, sheet);
  const primary = model.groups[0];
  const horizontal = !!primary?.horizontal;
  const titleInfo = getTitle(space, chart._loaded, ref => resolveRefText(sheet, ref));
  const legendInfo = getLegend(space);
  const axesInfo = getAxes(space);
  const legendEntries = legendEntriesFor(chart, model);
  // A user-set chartArea border of width w shifts the whole drawing inward
  // by w px and strokes the frame with that width (trial-measured).
  const userBorderW = area.ln?.solidFill && Number(area.ln?.w) > 1 ? Number(area.ln.w) : 0;
  const valueLabels = valueLabelStrings(model, horizontal);
  const isPieLike = !primary || primary.kind === 'pie' || primary.kind === 'doughnut';
  const isArea = !!primary && primary.kind === 'area';
  const isXY = !!primary && (primary.kind === 'scatter' || primary.kind === 'bubble');
  const isRadar = !!primary && primary.kind === 'radar';
  // Stock family (trial-measured): no legend is painted; the plot uses the
  // standard title band and bottom band (42.5..254 on the 420x280 reference),
  // a 16 px right margin (single axis) / 26 px (secondary axis), and its left
  // gutter floor is 16 px (bar charts keep 23).
  const isStock = model.groups.some(g => g.kind === 'stock');
  const categories = primary && !isPieLike ? primary.categories.map(String) : [];
  const valueWidths = valueLabels.map(text => measure(ctx, text, AXIS_FONT));
  const categoryWidths = categories.map(text => measure(ctx, text, AXIS_FONT));
  const catHidden = axesInfo.primaryCategory?.visible === false;
  // Trial-measured gutters: scatter/bubble use a wide plot (left 17, right 7)
  // with extra headroom under the title band; radar keeps the bar gutters but
  // a 28 px bottom band for its outer category labels.
  const leftGutter = isPieLike ? 0
    : isStock ? Math.max(model.secondaryScale ? 16 : 23, ...valueWidths.map(w => w + 8))
    : isXY ? Math.max(17, ...valueWidths.map(w => w + 9))
    : horizontal ? (catHidden ? 6 : Math.max(20, ...categoryWidths.map(w => w + 10))) : Math.max(23, ...valueWidths.map(w => w + 8));
  // Horizontal bar charts keep the last value label inside the frame: the
  // right edge sits half a label-width (plus a small pad) from the chart edge.
  const hRightGutter = horizontal && valueLabels.length
    ? Math.max(6, Math.round(Math.max(...valueWidths) / 2) + 3) : 6;
  // The trial lays areas (stacked or not) on a wider band: right margin ~21 px.
  const rightGutter = isXY ? 7 : isStock ? (model.secondaryScale ? 26 : 16) : horizontal ? hRightGutter : isArea ? 21 : RIGHT_GUTTER;
  const layout = computeLayout(width, height, {
    titleText: String(titleInfo.text ?? ''),
    titleFontSize: Number(titleInfo.fontSize ?? 18.67),
    legendVisible: legendInfo.visible !== false && legendEntries.length > 0 && !isStock,
    legendPosition: Number(legendInfo.position ?? 4),
    leftGutter: leftGutter + (axesInfo.primaryValue?.title?.text && !isPieLike && !horizontal ? 24 : 0),
    rightGutter,
    bottomGutter: (isPieLike ? 0 : isStock ? BOTTOM_GUTTER : isRadar || horizontal ? 28 : catHidden ? 12 : BOTTOM_GUTTER)
      + (!isPieLike && !horizontal && axesInfo.primaryCategory?.title?.text && axesInfo.primaryCategory?.visible !== false ? 18 : 0)
      + (legendInfo.visible !== false && Number(legendInfo.position ?? 4) === 4 ? Math.max(0, (Number(legendInfo.fontSize ?? 12) - 12) * 1.5) : 0),
    horizontal,
    pieLike: isPieLike,
    areaStackedLike: isArea && !!primary?.stacked && !primary?.percent,
    topPadExtra: isXY ? 11 : 0,
    leftFloor: isStock && model.secondaryScale ? 16 : 23,
    inset: userBorderW,
  });
  // The trial extends the category axis to the line layout whenever the chart
  // contains a PRIMARY-axis line group (bars share the widened bands). A
  // candle-stock group without a volume pair uses the same wide band (measured:
  // the trial lays its categories on pitch (width-12-left)/n).
  const candleSingle = isStock && !model.secondaryScale
    && model.groups.some(g => g.kind === 'stock' && g.series.length >= 4);
  if (model.groups.some(g => g.kind === 'line' && g.axisGroup !== 1) || candleSingle) layout.plot = layout.plotLine;
  // A category-axis title band lifts the bottom legend (trial-measured 18 px).
  if (layout.legend && !isPieLike && !horizontal
    && axesInfo.primaryCategory?.title?.text && axesInfo.primaryCategory?.visible !== false
    && Number(legendInfo.position ?? 4) === 4) layout.legend.y -= 18;
  // A larger legend font raises the legend (trial: ~1.2 px per size point).
  if (layout.legend && legendInfo.visible !== false && Number(legendInfo.position ?? 4) === 4)
    layout.legend.y -= Math.max(0, (Number(legendInfo.fontSize ?? 12) - 12) * 1.2);
  // chart area border (TASK 54 canvas probe `.probe/t54/probe-t54-canvas54.json`: the trial
  // strokes the frame as a w-wide line hugging the box [x-1..x+w-2] — canvas coords [0, w)).
  const borderColor = resolveChartColor(area.ln?.solidFill ?? 'text 1 85', sheet, '#d9d9d9') ?? '#d9d9d9';
  ctx.strokeStyle = borderColor;
  const borderW = userBorderW > 0 ? userBorderW : 1;
  ctx.lineWidth = borderW;
  ctx.strokeRect(borderW / 2, borderW / 2, Math.max(1, width - borderW), Math.max(1, height - borderW));
  // The chart canvas element is anchored at (x-1, y-1) (trial frame box, see chart.ts), while
  // all content keeps the chart-rect coordinate system the trial uses: shift it +1 to undo the
  // canvas shift. (Measured: trial plot = rect + 23.35..398 on the 420x280 reference.)
  ctx.save();
  ctx.translate(1, 1);
  // title
  if (titleInfo.text) {
    ctx.font = `${Number(titleInfo.fontSize ?? 18.67)}px Calibri, "Segoe UI", Arial, sans-serif`;
    ctx.fillStyle = resolveChartColor(titleInfo.color, sheet, '#595959') ?? '#595959';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(titleInfo.text), width / 2, (layout.title?.y ?? 0) + (layout.title?.height ?? 0) / 2);
  }
  const pc: PaintContext = { ctx, chart, layout, model, sheet };
  drawAxes(pc, axesInfo, valueLabels);
  for (const group of model.groups) drawGroup(pc, group);
  drawLegend(pc, legendInfo, legendEntries);
  ctx.restore();

}

function legendEntriesFor(chart: Chart, model: PaintModel): LegendEntry[] {
  const out: LegendEntry[] = [];
  const pieGroup = model.groups.find(g => g.kind === 'pie' || g.kind === 'doughnut');
  if (pieGroup) {
    const palette = (chart._space.colorScheme?.[1] as string[] | undefined) ?? [];
    pieGroup.categories.forEach((label, index) => out.push({
      name: String(label), color: resolveChartColor(palette[index % palette.length] ?? 'accent 1 0', chart._sheet, '#4472c4'), kind: pieGroup.kind, chartType: pieGroup.chartType, hasMarker: false,
    }));
    return out;
  }
  for (const group of model.groups) {
    // Clustered bar charts list the series in slot order (top slot first =
    // last series); stacked bars keep the creation order (trial-measured).
    const order = group.horizontal && group.kind === 'bar' && !group.stacked ? [...group.series].reverse() : group.series;
    order.forEach((ser, index) => {
      out.push({ name: ser.name || `Series ${index + 1}`, color: ser.color, kind: group.kind, chartType: group.chartType, hasMarker: !!ser.marker });
      // Trial (TASK 92 probe): each trendline follows its series with a dashed
      // swatch and the (auto-generated) trendline name.
      for (const tl of ser.trendlines ?? []) {
        const ln = tl.spPr?.ln as JsonRecord | undefined;
        out.push({
          name: tl.name !== undefined ? String(tl.name) : autoTrendlineName(Number(tl.trendlineType ?? 1), tl.period, ser.name),
          color: resolveChartColor(ln?.solidFill ?? 'accent 1 0', chart._sheet, '#4472c4') ?? '#4472c4',
          kind: group.kind, chartType: group.chartType, hasMarker: false, dash: dashArray(ln?.prstDash),
        });
      }
    });
  }
  return out;
}

export function valueLabelStrings(model: PaintModel, horizontal: boolean): string[] {
  void horizontal;
  const axis = model.valueAxis;
  if (axis?.tickLblPos === 3 || axis?.delete) return [];
  // 100%-stacked value axes carry a "%" suffix on every tick label (trial).
  const percent = model.groups.some(g => g.percent && g.axisGroup === 0);
  const fmt = axis?.numFmt?.formatCode as string | undefined;
  return model.scale.ticks.map(tick => (fmt && fmt !== 'General' ? formatValue(tick, fmt) : formatAxisNumber(tick)) + (percent ? '%' : ''));
}

function measure(ctx: CanvasRenderingContext2D, text: string, font: string): number {
  ctx.font = font;
  return ctx.measureText(text).width;
}

function drawAxes(pc: PaintContext, axesInfo: JsonRecord, valueLabels: string[]): void {
  const { ctx, layout, model } = pc;
  const primary = model.groups[0];
  if (!primary || primary.kind === 'pie' || primary.kind === 'doughnut') return;
  // Radar draws its own rings, spoke labels and outer categories in paint-series.
  if (primary.kind === 'radar') return;
  const horizontal = primary.horizontal;
  const gridColor = resolveChartColor(model.valueAxis?.majorGridlines?.spPr?.ln?.solidFill ?? 'rgb(217,217,217)', pc.sheet, '#d9d9d9') ?? '#d9d9d9';
  const labelColor = resolveChartColor('text 1 35', pc.sheet, '#595959') ?? '#595959';
  const plot = primary.kind === 'line' ? layout.plotLine : layout.plot;
  // plotArea fill / border (set through `plotArea()`).
  const paSp = (pc.chart._space.chart.plotArea?.spPr ?? {}) as JsonRecord;
  if (paSp.solidFill) {
    const fill = resolveChartColor(paSp.solidFill, pc.sheet, '') ?? '';
    if (fill) { ctx.fillStyle = fill; ctx.fillRect(plot.x, plot.y, plot.width, plot.height); }
  }
  if (paSp.ln?.solidFill) {
    ctx.strokeStyle = resolveChartColor(paSp.ln.solidFill, pc.sheet, '#d9d9d9') ?? '#d9d9d9';
    ctx.lineWidth = Math.max(1, Number(paSp.ln.w ?? 1));
    ctx.strokeRect(plot.x + 0.5, plot.y + 0.5, Math.max(1, plot.width - 1), Math.max(1, plot.height - 1));
  }
  const scale = model.scale;
  const showValues = axesInfo.primaryValue?.visible !== false;
  const showCategories = axesInfo.primaryCategory?.visible !== false;
  const majorVisible = model.valueAxis?.majorGridlines !== undefined;
  const minorGrid = model.valueAxis?.minorGridlines as JsonRecord | undefined;
  const minorColor = resolveChartColor(minorGrid?.spPr?.ln?.solidFill ?? 'rgb(242,242,242)', pc.sheet, '#f2f2f2') ?? '#f2f2f2';
  // Value/category label fonts follow the axis txPr (trial `style` option).
  const axisFont = (axis: JsonRecord | null | undefined, fallbackSize: number): { font: string, color: string } => {
    const rPr = (axis?.txPr?.p?.[0]?.elements?.[0]?.rPr ?? {}) as JsonRecord;
    const size = Number(rPr.sz ?? fallbackSize);
    const color = rPr.solidFill?.srgbClr ? `rgb(${(rPr.solidFill.srgbClr.val as number[]).join(',')})` : labelColor;
    return { font: `${size}px Calibri, "Segoe UI", Arial, sans-serif`, color };
  };
  const valueFont = axisFont(model.valueAxis, 12);
  const catFont = axisFont(model.categoryAxis, 12);
  // gridlines + value labels
  model.scale.ticks.forEach((tick, index) => {
    const ratio = (tick - scale.min) / (scale.max - scale.min);
    if (majorVisible && (index > 0 || !hasAxisLine(model))) {
      ctx.strokeStyle = gridColor;
      ctx.lineWidth = Number(model.valueAxis?.majorGridlines?.spPr?.ln?.w ?? 1);
      ctx.beginPath();
      if (horizontal) { ctx.moveTo(plot.x + plot.width * ratio, plot.y); ctx.lineTo(plot.x + plot.width * ratio, plot.y + plot.height); }
      else { ctx.moveTo(plot.x, plot.y + plot.height * (1 - ratio)); ctx.lineTo(plot.x + plot.width, plot.y + plot.height * (1 - ratio)); }
      ctx.stroke();
    }
    if (minorGrid) {
      // Minor gridlines split every major interval in half (trial default).
      const mid = tick + scale.unit / 2;
      if (mid < scale.max - 1e-9) {
        const mr = (mid - scale.min) / (scale.max - scale.min);
        ctx.strokeStyle = minorColor;
        ctx.lineWidth = Number(minorGrid?.spPr?.ln?.w ?? 1);
        ctx.beginPath();
        if (horizontal) { ctx.moveTo(plot.x + plot.width * mr, plot.y); ctx.lineTo(plot.x + plot.width * mr, plot.y + plot.height); }
        else { ctx.moveTo(plot.x, plot.y + plot.height * (1 - mr)); ctx.lineTo(plot.x + plot.width, plot.y + plot.height * (1 - mr)); }
        ctx.stroke();
      }
    }
    if (showValues && valueLabels[index] !== undefined && valueLabels.length) {
      ctx.font = valueFont.font;
      ctx.fillStyle = valueFont.color;
      if (horizontal) {
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(valueLabels[index], plot.x + plot.width * ratio, plot.y + plot.height + 4);
      } else {
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(valueLabels[index], plot.x - 6, plot.y + plot.height * (1 - ratio));
      }
    }
  });
  // axis lines
  ctx.strokeStyle = resolveChartColor(model.valueAxis?.spPr?.ln?.solidFill ?? 'text 1 85', pc.sheet, '#d9d9d9') ?? '#d9d9d9';
  ctx.lineWidth = Number(model.valueAxis?.spPr?.ln?.w ?? 1);
  ctx.beginPath();
  if (horizontal) {
    ctx.moveTo(Math.round(plot.x) + 0.5, plot.y);
    ctx.lineTo(Math.round(plot.x) + 0.5, plot.y + plot.height);
    ctx.moveTo(plot.x, Math.round(plot.y + plot.height) + 0.5);
    ctx.lineTo(plot.x + plot.width, Math.round(plot.y + plot.height) + 0.5);
  } else {
    ctx.moveTo(Math.round(plot.x) + 0.5, plot.y);
    ctx.lineTo(Math.round(plot.x) + 0.5, plot.y + plot.height);
    ctx.moveTo(plot.x, Math.round(plot.y + plot.height) + 0.5);
    ctx.lineTo(plot.x + plot.width, Math.round(plot.y + plot.height) + 0.5);
  }
  ctx.stroke();
  // Secondary value axis: light vertical line at the plot right edge plus its
  // own tick labels (the trial draws no secondary gridlines).
  const s2 = pc.model.secondaryScale;
  if (s2 && pc.model.secondaryValueAxis && axesInfo.secondaryValue?.visible !== false) {
    const right = plot.x + plot.width;
    ctx.strokeStyle = '#f4f4f4';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(Math.round(right) + 1.5, plot.y);
    ctx.lineTo(Math.round(right) + 1.5, plot.y + plot.height);
    ctx.stroke();
    ctx.font = AXIS_FONT;
    ctx.fillStyle = labelColor;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    s2.ticks.forEach(tick => {
      const ratio = (tick - s2.min) / (s2.max - s2.min);
      ctx.fillText(formatAxisNumber(tick), right + 7, plot.y + plot.height * (1 - ratio));
    });
  }
  // category labels (scatter/bubble: numeric x-axis tick labels instead)
  if (primary.kind === 'scatter' || primary.kind === 'bubble') {
    if (showCategories) {
      const x = model.xScale;
      ctx.font = AXIS_FONT;
      ctx.fillStyle = labelColor;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      x.ticks.forEach(tick => {
        const ratio = x.max > x.min ? (tick - x.min) / (x.max - x.min) : 0;
        ctx.fillText(formatAxisNumber(tick), plot.x + plot.width * ratio, plot.y + plot.height + 4);
      });
    }
    return;
  }
  if (showCategories && primary.categories.length) {
    ctx.font = catFont.font;
    ctx.fillStyle = catFont.color;
    const count = primary.categories.length;
    const tickBased = primary.kind === 'line' || primary.kind === 'area';
    primary.categories.forEach((label, index) => {
      const text = String(label);
      if (horizontal) {
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        const slot = plot.height / count;
        ctx.fillText(text, plot.x - 6, plot.y + slot * (count - 1 - index) + slot / 2);
      } else {
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        const x = primary.kind === 'line' ? plot.x + (plot.width * (index + 0.5)) / count
          : tickBased && count > 1 ? plot.x + (plot.width * index) / (count - 1) : plot.x + (plot.width * index) / count + plot.width / count / 2;
        ctx.fillText(text, x, plot.y + plot.height + 4);
      }
    });
  }
  // Axis titles (chart.axes({ primaryValue: { title: {...} } })).
  const valTitleText = String(axesInfo.primaryValue?.title?.text ?? '');
  if (valTitleText && showValues) {
    ctx.font = valueFont.font;
    ctx.fillStyle = valueFont.color;
    ctx.save();
    ctx.translate(Math.max(10, plot.x - 14), plot.y + plot.height / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(valTitleText, 0, 0);
    ctx.restore();
  }
  const catTitleText = String(axesInfo.primaryCategory?.title?.text ?? '');
  if (catTitleText && showCategories && !horizontal) {
    ctx.font = catFont.font;
    ctx.fillStyle = catFont.color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    // Trial: the category title sits in the band right below the category
    // labels (and lifts the bottom legend by the same 18 px).
    ctx.fillText(catTitleText, plot.x + plot.width / 2, plot.y + plot.height + 34);
  }
}

function hasAxisLine(model: PaintModel): boolean {
  void model;
  return true;
}

type LegendEntry = { name: string; color: string | null; kind: PaintGroup["kind"]; chartType: number; hasMarker: boolean; dash?: number[] };

/** Legend icon+label for one series or trendline (trendline entries carry a dash pattern). */

function drawLegend(pc: PaintContext, legendInfo: JsonRecord, entries: LegendEntry[]): void {
  if (legendInfo.visible === false || !entries.length || !pc.layout.legend) return;
  const { ctx, layout } = pc;
  const band = layout.legend as NonNullable<typeof layout.legend>;
  const position = Number(legendInfo.position ?? 4);
  const fontSize = Number(legendInfo.fontSize ?? 12);
  ctx.font = `${fontSize}px Calibri, "Segoe UI", Arial, sans-serif`;
  const color = resolveChartColor(legendInfo.color, pc.sheet, '#595959') ?? '#595959';
  const backColor = legendInfo.backColor && legendInfo.backColor !== '' ? resolveChartColor(legendInfo.backColor, pc.sheet, '') : '';
  const box = (x0: number, x1: number, cy: number): void => {
    if (!backColor) return;
    ctx.fillStyle = String(backColor);
    ctx.fillRect(x0 - 6, cy - fontSize * 0.9, x1 - x0 + 12, fontSize * 1.8);
  };
  const radarFilledLegend = (pc.chart._space.chart.plotArea?.chartGroups ?? [])
    .some((g: JsonRecord) => Number(g.chartType) === 2 && Number(g.radarStyle) === 2);
  const icon = (x: number, y: number, entry: LegendEntry): void => {
    ctx.fillStyle = entry.color ?? '#4472c4';
    ctx.strokeStyle = entry.color ?? '#4472c4';
    if (entry.dash) {
      // Trial: a trendline legend entry is a dashed line segment in the trendline color.
      ctx.lineWidth = 2;
      ctx.setLineDash(entry.dash);
      ctx.beginPath();
      ctx.moveTo(x, y + 5);
      ctx.lineTo(x + 24, y + 5);
      ctx.stroke();
      ctx.setLineDash([]);
    } else if (entry.kind === 'line') {
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, y + 5);
      ctx.lineTo(x + 20, y + 5);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x + 10, y + 5, 3, 0, Math.PI * 2);
      ctx.fill();
    } else if (entry.kind === 'scatter') {
      ctx.beginPath();
      ctx.arc(x + 5, y + 5, 4.5, 0, Math.PI * 2);
      ctx.fill();
    } else if (entry.kind === 'bubble') {
      ctx.beginPath();
      ctx.arc(x + 5, y + 5, 3.5, 0, Math.PI * 2);
      ctx.fill();
    } else if (entry.kind === 'radar' && !radarFilledLegend) {
      // Trial: radar legends show a plain line; radar markers add a centre dot.
      // Filled radar uses the small square marker icon instead.
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, y + 5);
      ctx.lineTo(x + 20, y + 5);
      ctx.stroke();
      if (entry.hasMarker) {
        ctx.beginPath();
        ctx.arc(x + 10, y + 5, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      ctx.fillRect(x, y, 10, 10);
    }
  };
  const advance = (entry: LegendEntry): number => entry.dash || entry.kind === 'line' || entry.kind === 'radar' ? 24 : entry.kind === 'scatter' ? 15 : entry.kind === 'bubble' ? 13 : 14;
  const widthOf = (entry: LegendEntry): number => ctx.measureText(entry.name).width + advance(entry);
  if (position === 3) {
    // Trial stacks the left legend from the plot bottom upward (pitch ~28.5).
    const pitch = 28.5;
    let y = Math.max(band.y + 2, pc.layout.plot.y + pc.layout.plot.height - 14 - (entries.length - 1) * pitch);
    for (const entry of entries) {
      icon(band.x + 2, y + 1, entry);
      ctx.fillStyle = color;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(entry.name, band.x + 18, y + 6);
      y += pitch;
    }
    return;
  }
  if (position === 2 || position === 5) {
    const width = Math.max(...entries.map(widthOf));
    let y = band.y + 2;
    for (const entry of entries) {
      icon(band.x + 2, y + 1, entry);
      ctx.fillStyle = color;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(entry.name, band.x + 18, y + 6);
      y += 27.5;
    }
    void width;
    return;
  }
  const total = entries.reduce((sum, entry) => sum + widthOf(entry) + 10, -10);
  const centerY = band.y + band.height / 2;
  let x = band.x + Math.max(0, (band.width - total) / 2);
  if (position === 4 || position === 1) box(x, x + total, centerY);
  for (const entry of entries) {
    icon(x, centerY - 5, entry);
    ctx.fillStyle = color;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(entry.name, x + advance(entry), centerY);
    x += widthOf(entry) + 10;
  }
}

export type { PaintSeries };
