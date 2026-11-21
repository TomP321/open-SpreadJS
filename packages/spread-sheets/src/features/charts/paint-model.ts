/**
 * Builds the paintable view of a chart: reads the chartSpace model plus the
 * live cell values (series names, categories, values, colours) on every
 * paint so cell edits update the chart immediately.
 */
import type { Worksheet } from '../../worksheet.js';
import type { JsonRecord } from './types.js';
import { groupStacking } from './types.js';
import { groupsOf } from './series.js';

/** Unique chartGroups of the chartSpace, in serialised order. */
function flattenSeriesUnique(chart: ChartLike): { group: JsonRecord }[] {
  return groupsOf(chart).map(group => ({ group }));
}
import { resolveRefText, resolveRefValues, resolveRefCategories } from './data.js';
import { resolveChartColor } from './colors-resolve.js';
import { computeScale, type AxisScale } from './scale.js';
import type { ChartLike } from './series.js';

export interface PaintSeries {
  name: string;
  values: (number | null)[];
  colorToken: string;
  color: string | null;
  fillToken: string | null;
  lineToken: string | null;
  marker: { shape: number; size: number; fill: string | null } | null;
  smooth: boolean;
  dLbls: JsonRecord | null;
  pointColors: (string | null)[];
  explosion: number;
  valuesFallbackX?: number[];
  /** Bubble sizes (bubble group only). */
  sizes?: (number | null)[];
  /** Scatter series that keep a painted connector line (trial `ln` without `noFill`). */
  hasLine?: boolean;
}

export interface PaintGroup {
  kind: 'bar' | 'line' | 'area' | 'scatter' | 'pie' | 'doughnut' | 'radar' | 'bubble' | 'stock' | 'other';
  chartType: number;
  stacked: boolean;
  percent: boolean;
  horizontal: boolean;
  gapWidth: number;
  overlap: number;
  holeSize: number;
  firstSliceAng: number;
  series: PaintSeries[];
  categories: (string | number)[];
  axisGroup: number;
}

export interface PaintModel {
  groups: PaintGroup[];
  scale: AxisScale;
  xScale: AxisScale;
  valueAxis: JsonRecord;
  categoryAxis: JsonRecord;
  secondaryScale?: AxisScale;
  secondaryValueAxis?: JsonRecord | null;
  /** Largest bubble size over all series (trial scales bubbles to this). */
  bubbleMax?: number;
}

function seriesFillToken(chart: ChartLike, ser: JsonRecord, group: JsonRecord): string {
  void group;
  // The trial ignores custom palette entries for theme scheme 0 (bars keep
  // their accent colours); explicit entries only recolor non-zero schemes.
  const schemeIdx = Number(chart._space.colorScheme?.[0] ?? 0);
  const list = schemeIdx !== 0 && (chart._space.colorScheme?.[1] as string[] | undefined)?.length
    ? (chart._space.colorScheme[1] as string[]) : null;
  if (ser.spPr?.solidFill) {
    const fill = ser.spPr.solidFill;
    // A palette-default accent fill follows the current colour scheme (trial
    // behaviour: `colorScheme()` recolours series that were never edited).
    const isDefaultAccent = fill.schemeClr && fill.schemeClr.lumMod === undefined
      && Number(fill.schemeClr.val) === 3 + ((Number(ser.idx ?? 0) % 6) + 1);
    if (!(isDefaultAccent && list)) {
      if (fill.srgbClr) return `rgb(${(fill.srgbClr.val as number[]).join(',')})`;
      if (fill.schemeClr) {
        const map: Record<number, string> = { 4: 'accent 1', 5: 'accent 2', 6: 'accent 3', 7: 'accent 4', 8: 'accent 5', 9: 'accent 6' };
        return `${map[Number(fill.schemeClr.val)] ?? 'accent 1'} ${(fill.schemeClr.lumOff?.[0] ?? 0) / 1000 || (fill.schemeClr.lumMod?.[0] !== undefined ? -(100 - fill.schemeClr.lumMod[0] / 1000) : 0)}`;
      }
    }
  }
  return list ? list[Number(ser.idx ?? 0) % list.length] : `accent ${(Number(ser.idx ?? 0) % 6) + 1} 0`;
}

function kindOf(groupType: number): PaintGroup['kind'] {
  switch (groupType) {
    case 6: return 'bar';
    case 8: return 'line';
    case 4: return 'area';
    case 1: return 'scatter';
    case 2: return 'radar';
    case 3: return 'bubble';
    case 0: return 'stock';
    case 10: return 'pie';
    case 12: return 'doughnut';
    default: return 'other';
  }
}

function axisFor(space: JsonRecord, group: JsonRecord, value: boolean): JsonRecord {
  const axes: JsonRecord[] = space.chart.plotArea.axes ?? [];
  const axId = (group.axId ?? [])[value ? 1 : 0];
  return axes.find(a => a.axId === axId) ?? axes.find(a => (Number(a.axisType) === 3) === value) ?? {};
}

/** Collect live data for painting. */
export function buildPaintModel(chart: ChartLike, sheet: Worksheet): PaintModel {
  const space = chart._space;
  const blanksAs = Number(space.chart.dispBlanksAs ?? 1);
  const model: PaintGroup[] = [];
  let dataMin = 0;
  let dataMax = Number.NaN;
  let xMin = 0;
  let xMax = Number.NaN;
  let primaryValueAxis: JsonRecord = {};
  let primaryPercent = false;
  let primaryAreaStacked = false;
  let secMin = 0;
  let secMax = Number.NaN;
  let primaryCategoryAxis: JsonRecord = {};
  let scatter = false;
  let radar = false;
  let secondaryStockSeen = false;
  let bubbleMax = Number.NaN;
  for (const { group } of flattenSeriesUnique(chart)) {
    const kind = kindOf(Number(group.chartType));
    if (kind === 'other') continue;
    const stacking = groupStacking(Number(group.chartType), Number(group.grouping ?? 1), Number(group.overlap ?? 0));
    const pieLike = kind === 'pie' || kind === 'doughnut';
    const seriesDefs: JsonRecord[] = pieLike && kind === 'pie' ? (group.ser ?? []).slice(0, 1) : (group.ser ?? []);
    // Trial: a stock group on the secondary axis (VHLC/VOHLC volume split)
    // feeds only the secondary scale, never the primary one.
    const secondaryStock = kind === 'stock' && Number(axisFor(space, group, true).AxisGroup ?? 0) !== 0;
    const categories = seriesDefs.length
      ? resolveRefCategories(sheet, (seriesDefs[0].cat?.strRef ?? seriesDefs[0].cat?.numRef ?? {}).f ?? '')
      : [];
    const paintSeries: PaintSeries[] = seriesDefs.map(ser => {
      const values = resolveRefValues(sheet, (ser.val?.numRef ?? ser.val?.strRef ?? ser.yVal?.numRef ?? {}).f ?? '', blanksAs);
      const xValues = resolveRefValues(sheet, (ser.xVal?.numRef ?? {}).f ?? '', blanksAs);
      const token = seriesFillToken(chart, ser, group);
      const color = resolveChartColor(token, sheet);
      const pointSchemeIdx = Number(chart._space.colorScheme?.[0] ?? 0);
      const pointTokenList = pointSchemeIdx !== 0 && (chart._space.colorScheme?.[1] as string[] | undefined)?.length
        ? (chart._space.colorScheme[1] as string[]) : [];
      const dPt: JsonRecord[] = Array.isArray(ser.dPt) ? ser.dPt : [];
      const pointColors = values.map((_, i) => {
        const point = dPt.find(p => Number(p.idx) === i);
        const fallback = pointTokenList.length ? pointTokenList[i % pointTokenList.length] : `accent ${(i % 6) + 1} 0`;
        return resolveChartColor(point?.spPr?.solidFill ?? fallback, sheet);
      });
      for (const value of values) {
        if (value === null || secondaryStock) continue;
        dataMin = Math.min(dataMin, value);
        dataMax = Number.isNaN(dataMax) ? value : Math.max(dataMax, value);
      }
      for (const value of xValues) {
        if (value === null) continue;
        xMin = Math.min(xMin, value);
        xMax = Number.isNaN(xMax) ? value : Math.max(xMax, value);
      }
      const marker = ser.marker && Number(ser.marker.symbol ?? 4) !== 4
        ? { shape: Number(ser.marker.symbol), size: Number(ser.marker.size ?? 7), fill: color }
        : null;
      const sizes = Number(group.chartType) === 3
        ? (ser.bubbleSize?.numRef
          ? resolveRefValues(sheet, ser.bubbleSize.numRef.f ?? '', blanksAs)
          : (Array.isArray(ser.bubbleSize?.numLit?.pt) ? ser.bubbleSize.numLit.pt.map((v: unknown) => Number(v)) : null))
        : undefined;
      if (sizes) for (const value of sizes) {
        if (value === null || Number.isNaN(value)) continue;
        bubbleMax = Number.isNaN(bubbleMax) ? value : Math.max(bubbleMax, value);
      }
      return {
        name: resolveRefText(sheet, ser.tx?.strRef?.f ?? ''),
        values, colorToken: token, color, fillToken: token, lineToken: token,
        marker, smooth: !!ser.smooth, dLbls: ser.dLbls ?? null,
        pointColors, explosion: Number(ser.explosion ?? 0),
        sizes: sizes ?? undefined,
        hasLine: group.chartType === 1
          ? !!ser.spPr?.ln && !ser.spPr.ln.noFill && Number(ser.spPr.ln.w ?? 2) > 0
          : undefined,
      };
    });
    // Stacked (non-percent) groups scale to the largest per-category total,
    // not the max point; percent groups pin the axis to 0..100 elsewhere.
    if (stacking.stacked && !stacking.percent) {
      const catCount = Math.max(1, categories.length);
      for (let i = 0; i < catCount; i++) {
        let total = 0;
        for (const ser of paintSeries) total += Math.abs(ser.values[i] ?? 0);
        dataMax = Number.isNaN(dataMax) ? total : Math.max(dataMax, total);
      }
    }
    if (!pieLike && (kind === 'scatter' || kind === 'bubble')) {      // text x-values fall back to 1-based positions (trial behaviour).
      for (const ser of seriesDefs) {
        const raw = resolveRefValues(sheet, (ser.xVal?.numRef ?? {}).f ?? '', blanksAs);
        if (raw.every(v => v === null)) {
          const cats = resolveRefCategories(sheet, (ser.xVal?.numRef ?? {}).f ?? '');
          const fallback = cats.map((_, i) => i + 1);
          paintSeries[seriesDefs.indexOf(ser)].valuesFallbackX = fallback;
          for (const value of fallback) {
            xMin = Math.min(xMin, value);
            xMax = Number.isNaN(xMax) ? value : Math.max(xMax, value);
          }
        }
      }
      scatter = true;
    }
    if (kind === 'radar') radar = true;
    const entry: PaintGroup = {
      kind, chartType: Number(group.chartType),
      stacked: stacking.stacked,
      percent: stacking.percent,
      horizontal: Number(group.barDir ?? 1) === 0,
      gapWidth: Number(group.gapWidth ?? 150) / 100, overlap: Number(group.overlap ?? 0) / 100,
      holeSize: Number(group.holeSize ?? 75) / 100, firstSliceAng: Number(group.firstSliceAng ?? 0),
      series: paintSeries, categories,
      axisGroup: Number(axisFor(space, group, true).AxisGroup ?? 0),
    };
    model.push(entry);
    secondaryStockSeen = secondaryStockSeen || secondaryStock;
    if (Number(entry.axisGroup) === 0) {
      primaryValueAxis = axisFor(space, group, true);
      primaryCategoryAxis = axisFor(space, group, false);
      if (!pieLike) {
        if (entry.percent) primaryPercent = true;
        if (kind === 'area' && entry.stacked) primaryAreaStacked = true;
      }
    } else if (!pieLike) {
      for (const ser of paintSeries) for (const v of ser.values) {
        if (v === null) continue;
        secMin = Math.min(secMin, v);
        secMax = Number.isNaN(secMax) ? v : Math.max(secMax, v);
      }
    }
  }
  if (Number.isNaN(dataMax)) { dataMax = 1; }
  const forced = {
    // 100%-stacked charts always span exactly 0..100 on the value axis (trial).
    min: primaryValueAxis.scaling?.min ?? (primaryPercent ? 0 : undefined),
    max: primaryValueAxis.scaling?.max ?? (primaryPercent ? 100 : undefined),
    majorUnit: primaryValueAxis.majorUnit,
  };
  const horizontalBar = model.some(g => g.kind === 'bar' && g.horizontal && g.axisGroup === 0);
  const scale = computeScale(Number.isNaN(dataMin) ? 0 : dataMin, dataMax,
    {
      ...forced,
      exactMax: scatter || radar || secondaryStockSeen,
      exactTop: primaryAreaStacked,
      // Horizontal bar axes use ~9 gridline steps (deciles appear on the
      // 0..100 percent axis; the interval pad below rounds to whole tens).
      targetIntervals: horizontalBar ? 9 : 5,
      // Horizontal bar axes always span a full multiple of 10 gridline steps
      // (0..10 for clustered 0..8, 0..20 step 2 for stacked totals 16).
      ...(horizontalBar ? { padToIntervals: 10 } : {}),
    });
  const xScale = Number.isNaN(xMax) ? scale : computeScale(Math.min(0, xMin), xMax, { exactMax: true, scatterX: scatter });
  const secondaryValueAxis = model.some(g => g.axisGroup !== 0 && g.kind !== 'pie' && g.kind !== 'doughnut')
    ? ((space.chart.plotArea.axes ?? []).find((a: JsonRecord) => Number(a.AxisGroup) === 1 && Number(a.axisType) !== 0) ?? {})
    : null;
  const secondaryScale = secondaryValueAxis
    ? computeScale(secMin, Number.isNaN(secMax) ? 1 : secMax, { targetIntervals: 5, exactMax: true })
    : undefined;
  return { groups: model, scale, xScale, valueAxis: primaryValueAxis, categoryAxis: primaryCategoryAxis, secondaryScale, secondaryValueAxis,
    bubbleMax: Number.isNaN(bubbleMax) ? undefined : bubbleMax };
}
