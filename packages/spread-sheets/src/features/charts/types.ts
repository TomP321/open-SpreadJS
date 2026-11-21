/**
 * Shared types for the charts feature. JSON records are plain objects;
 * `ChartSpaceJson` is the canonical chart model (same shape the trial
 * serialises under shapeData.graphicFrame.graphic.graphicData.chart.chartSpace).
 */
/* eslint-disable-next-line @typescript-eslint/no-explicit-any -- chart JSON is dynamically shaped */
export type JsonRecord = Record<string, any>;

export interface RectLike { row: number; col: number; rowCount: number; colCount: number }

export const CT_SHAPE_TYPE = 8;

/** Internal chart-group codes used inside chartSpace (trial-observed). */
export const GroupType = {
  stock: 0, bar: 6, line: 8, pie: 10, doughnut: 12, area: 4, scatter: 1, radar: 2, bubble: 3,
} as const;

/** Chart-type -> group metadata. `axes`: [category axisType, value axisType]. */
export interface TypeMeta {
  group: number;
  seriesType: number;
  /** barDir / grouping / gapWidth / overlap defaults for bar-family groups. */
  barDir?: number;
  grouping?: number;
  gapWidth?: number;
  overlap?: number;
  varyColors?: boolean;
  scatterStyle?: number;
  firstSliceAng?: number;
  holeSize?: number;
  hasAxes: boolean;
  /** the pie-family has no axes and no legend keys per series */
  pieFamily: boolean;
  marker?: { symbol: number; size?: number } | null;
  smooth?: boolean;
  lineSeries?: boolean;
  /** trial default `chart.dispBlanksAs` for this type (1 gap, 2 zero, 3 span). */
  dispBlanksAs?: number;
  /** scatter series keep a painted line (`ln {w:2}`) instead of `noFill`. */
  scatterLines?: boolean;
  /** radar groups carry `radarStyle` (1 line/marker, 2 filled). */
  radarStyle?: number;
  /** the trial lays this type's legend at the given position by default. */
  defaultLegendPos?: number;
}

export const TYPE_META: Record<number, TypeMeta> = {
  12: { group: 6, seriesType: 0, barDir: 1, grouping: 1, gapWidth: 150, overlap: -27, varyColors: false, hasAxes: true, pieFamily: false }, // columnClustered
  13: { group: 6, seriesType: 0, barDir: 1, grouping: 3, gapWidth: 150, overlap: 100, varyColors: false, hasAxes: true, pieFamily: false }, // columnStacked
  14: { group: 6, seriesType: 0, barDir: 1, grouping: 0, gapWidth: 150, overlap: 100, varyColors: false, hasAxes: true, pieFamily: false }, // columnStacked100 (trial: grouping 0 + overlap 100)
  18: { group: 6, seriesType: 0, barDir: 0, grouping: 1, gapWidth: 182, overlap: 0, varyColors: false, hasAxes: true, pieFamily: false }, // barClustered
  19: { group: 6, seriesType: 0, barDir: 0, grouping: 3, gapWidth: 150, overlap: 100, varyColors: false, hasAxes: true, pieFamily: false }, // barStacked (stacked bars use gapWidth 150, not 182)
  20: { group: 6, seriesType: 0, barDir: 0, grouping: 0, gapWidth: 150, overlap: 100, varyColors: false, hasAxes: true, pieFamily: false }, // barStacked100
  60: { group: 6, seriesType: 0, barDir: 1, grouping: 1, gapWidth: 150, overlap: -27, varyColors: false, hasAxes: true, pieFamily: false }, // clusteredColumn
  9: { group: 8, seriesType: 2, grouping: 1, varyColors: false, hasAxes: true, pieFamily: false, marker: { symbol: 4 }, smooth: false, lineSeries: true }, // line
  24: { group: 8, seriesType: 2, grouping: 2, varyColors: false, hasAxes: true, pieFamily: false, marker: { symbol: 4 }, smooth: false, lineSeries: true, dispBlanksAs: 2 }, // lineStacked (trial: grouping 2)
  25: { group: 8, seriesType: 2, grouping: 0, varyColors: false, hasAxes: true, pieFamily: false, marker: { symbol: 4 }, smooth: false, lineSeries: true, dispBlanksAs: 2 }, // lineStacked100 (trial: grouping 0)
  26: { group: 8, seriesType: 2, grouping: 1, varyColors: false, hasAxes: true, pieFamily: false, marker: { symbol: 0, size: 7 }, smooth: false, lineSeries: true }, // lineMarkers
  27: { group: 8, seriesType: 2, grouping: 2, varyColors: false, hasAxes: true, pieFamily: false, marker: { symbol: 0, size: 7 }, smooth: false, lineSeries: true, dispBlanksAs: 2 },
  28: { group: 8, seriesType: 2, grouping: 0, varyColors: false, hasAxes: true, pieFamily: false, marker: { symbol: 0, size: 7 }, smooth: false, lineSeries: true, dispBlanksAs: 2 },
  8: { group: 4, seriesType: 1, grouping: 1, varyColors: false, hasAxes: true, pieFamily: false }, // area
  37: { group: 4, seriesType: 1, grouping: 2, varyColors: false, hasAxes: true, pieFamily: false }, // areaStacked (trial: grouping 2)
  38: { group: 4, seriesType: 1, grouping: 0, varyColors: false, hasAxes: true, pieFamily: false }, // areaStacked100 (trial: grouping 0)
  10: { group: 10, seriesType: 3, varyColors: true, firstSliceAng: 0, hasAxes: false, pieFamily: true }, // pie
  3: { group: 12, seriesType: 3, varyColors: true, firstSliceAng: 0, holeSize: 75, hasAxes: false, pieFamily: true }, // doughnut (trial writes seriesType 3 like pie)
  1: { group: 1, seriesType: 5, scatterStyle: 2, varyColors: false, hasAxes: true, pieFamily: false, marker: { symbol: 0, size: 7 }, smooth: false }, // xyScatter
  33: { group: 1, seriesType: 5, scatterStyle: 5, varyColors: false, hasAxes: true, pieFamily: false, marker: { symbol: 0, size: 7 }, smooth: true, scatterLines: true }, // xyScatterSmooth
  34: { group: 1, seriesType: 5, scatterStyle: 4, varyColors: false, hasAxes: true, pieFamily: false, marker: { symbol: 4 }, smooth: true, scatterLines: true }, // xyScatterSmoothNoMarkers
  35: { group: 1, seriesType: 5, scatterStyle: 2, varyColors: false, hasAxes: true, pieFamily: false, marker: { symbol: 0, size: 7 }, smooth: false, scatterLines: true }, // xyScatterLines
  36: { group: 1, seriesType: 5, scatterStyle: 1, varyColors: false, hasAxes: true, pieFamily: false, marker: { symbol: 4 }, smooth: false, scatterLines: true }, // xyScatterLinesNoMarkers
  11: { group: 3, seriesType: 6, varyColors: false, hasAxes: true, pieFamily: false }, // bubble
  49: { group: 0, seriesType: 2, varyColors: false, hasAxes: true, pieFamily: false, marker: { symbol: 4 }, smooth: false }, // stockHLC
  50: { group: 0, seriesType: 2, varyColors: false, hasAxes: true, pieFamily: false, marker: { symbol: 4 }, smooth: false }, // stockOHLC
  51: { group: 0, seriesType: 2, varyColors: false, hasAxes: true, pieFamily: false, marker: { symbol: 4 }, smooth: false }, // stockVHLC (volume bar + stock group)
  52: { group: 0, seriesType: 2, varyColors: false, hasAxes: true, pieFamily: false, marker: { symbol: 4 }, smooth: false }, // stockVOHLC (volume bar + stock group)
  2: { group: 2, seriesType: 4, radarStyle: 1, varyColors: false, hasAxes: true, pieFamily: false, marker: { symbol: 4 }, defaultLegendPos: 1 }, // radar
  42: { group: 2, seriesType: 4, radarStyle: 1, varyColors: false, hasAxes: true, pieFamily: false, marker: { symbol: 0, size: 7 }, defaultLegendPos: 1 }, // radarMarkers
  43: { group: 2, seriesType: 4, radarStyle: 2, varyColors: false, hasAxes: true, pieFamily: false, marker: { symbol: 4 }, defaultLegendPos: 1 }, // radarFilled
};

export function metaFor(chartType: number): TypeMeta {
  return TYPE_META[Number(chartType)] ?? TYPE_META[12];
}

/**
 * Stacking state from a serialised group (trial-observed internal codes):
 * bar groups: 1 clustered, 3 stacked, 0+overlap100 = stacked100;
 * line/area groups: 1 standard, 2 stacked, 0 percent-stacked.
 */
export function groupStacking(groupType: number, grouping: number, overlap: number): { stacked: boolean; percent: boolean } {
  const g = Number(grouping ?? 1);
  if (groupType === 6) return g === 3 ? { stacked: true, percent: false }
    : g === 0 && Number(overlap) === 100 ? { stacked: true, percent: true } : { stacked: false, percent: false };
  if (groupType === 8 || groupType === 4) return g === 2 ? { stacked: true, percent: false }
    : g === 0 ? { stacked: true, percent: true } : { stacked: false, percent: false };
  return { stacked: false, percent: false };
}
