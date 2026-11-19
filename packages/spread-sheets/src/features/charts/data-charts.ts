/**
 * The DataCharts model (TASK 39 family 4): boxWhisker, funnel, paretoLine,
 * regionMap, sunburst, treemap and waterfall. The trial (19.2.5 charts
 * plugin) serialises these types NOT with `plotArea.chartGroups` but with a
 * `plotArea.plotAreaRegion` whose `series[]` entries carry a `layoutId`
 * (16..22), a `dataId`, `tx.txData.f.formula` and a `formulaObj`
 * {strDim, numDim, strDimDir:1, numDimDir:1}. Every structural detail here
 * was measured black-box from the official trial via `chart.toJSON()` in the
 * apps/compare dual-runtime harness (out dir .probe/chart-comparison/f3).
 */
import type { JsonRecord, RectLike } from './types.js';
import type { BuildInput } from './chart-space.js';
import { refsFor } from './chart-space.js';
import { ACCENT_SOLID, LINE_COLOR, txPr } from './defaults.js';
import { DEFAULT_COLOR_LIST } from './color-schemes.js';
import { resolveToken } from './colors-resolve.js';
import { parseRanges } from './refs.js';

/** public ChartType -> internal layoutId (trial-observed). */
export const DATA_LAYOUT_ID: Record<number, number> = { 53: 16, 54: 17, 55: 18, 56: 19, 57: 20, 58: 21, 59: 22 };
/** layoutId -> public ChartType. */
export const LAYOUT_PUBLIC_TYPE: Record<number, number> = Object.fromEntries(
  Object.entries(DATA_LAYOUT_ID).map(([t, l]) => [l, Number(t)]));

export function isDataChartType(chartType: number): boolean {
  return DATA_LAYOUT_ID[Number(chartType)] !== undefined;
}

export function isDataChartSpace(space: JsonRecord): boolean {
  return space?.chart?.plotArea?.plotAreaRegion !== undefined;
}

/** The trial's default resolved palette (theme accents 1..3 measured srgb). */
export function dataChartPalette(list: string[] = DEFAULT_COLOR_LIST): [number, number, number][] {
  return list.map(token => {
    const css = resolveToken(undefined, token) ?? token;
    const hex = /^#([0-9a-f]{6})$/i.exec(css);
    if (hex) { const n = parseInt(hex[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
    const rgb = /^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/i.exec(css);
    if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
    return [68, 114, 196];
  });
}

const WHITE_LN = { solidFill: { srgbClr: { val: [255, 255, 255] } }, w: 2, prstDash: 0 };

/**
 * The DataCharts txPr variant: the title run carries the literal default
 * text and `endParaRPr` repeats the full run properties (trial-observed;
 * standard chart groups keep `t:''` and an empty `endParaRPr`).
 */
function dataTxPr(sz: number | undefined, text: string, withBody = false, color?: JsonRecord): JsonRecord {
  const rPr: JsonRecord = { latin: { typeface: '+mn-lt' }, ...(sz === undefined ? {} : { sz }), b: false, solidFill: color ?? { schemeClr: { val: 1, lumMod: [65000], lumOff: [35000] } } };
  const out: JsonRecord = {
    p: [{ elements: [{ elementType: 0, t: text, rPr: { ...rPr } }], pPr: { defRPr: { ...rPr } }, endParaRPr: { ...rPr } }],
  };
  if (withBody) { out.bodyPr = {}; out.lstStyle = {}; }
  return out;
}

function dataSeries(input: DataBuildInput, rect: RectLike, sheetName: string): JsonRecord[] {
  const layoutId = DATA_LAYOUT_ID[Number(input.chartType)];
  const refs = refsFor(rect, sheetName, input.orientation);
  return refs.map((ref, i) => {
    const ser: JsonRecord = {
      dataId: { val: i }, layoutId, hidden: false,
      tx: { txData: { f: { formula: ref.name } } },
      formulaObj: { strDim: ref.category, numDim: ref.value, strDimDir: 1, numDimDir: 1 },
    };
    if (layoutId === 18 || layoutId === 19) ser.spPr = { solidFill: ACCENT_SOLID(i + 1) };
    if (layoutId === 20 || layoutId === 21) {
      const palette = dataChartPalette(input.colorSchemeList);
      const catRect = parseRanges(ref.category)[0];
      const points = catRect ? Math.max(1, catRect.rowCount * catRect.colCount) : refs.length;
      ser.dataPt = Array.from({ length: points }, (_, k) => ({
        idx: k,
        spPr: { solidFill: { srgbClr: { val: [...(palette[k % palette.length] ?? [68, 114, 196])] } }, ln: { ...WHITE_LN } },
      }));
      ser.spPr = { ln: { solidFill: { srgbClr: { val: [255, 255, 255] } }, w: 2 } };
      const white = { latin: { typeface: '+mn-lt' }, b: false, solidFill: { srgbClr: { val: [255, 255, 255] } } };
      // Trial quirk: only the FIRST series' label template carries `spPr`.
      const dataLabels: JsonRecord = {
        txPr: { p: [{ elements: [{ elementType: 0, t: '', rPr: { ...white } }], pPr: { defRPr: { ...white } }, endParaRPr: {} }] },
        dLblPos: 2, showLeaderLines: false, showBubbleSize: false, showLegendKey: false, showPercent: false,
        visibility: { seriesName: false, categoryName: true, value: false },
        separator: ', ',
      };
      if (i === 0) ser.dataLabels = { spPr: { noFill: true, ln: { noFill: true } }, ...dataLabels };
      else ser.dataLabels = dataLabels;
    }
    if (layoutId === 22) ser.layoutPr = { visibility: { connectorLines: '1' } };
    return ser;
  });
}

function dataCatAxis(gapWidth: number): JsonRecord {
  return {
    catScaling: { gapWidth },
    majorTickMarks: 2, minorTickMarks: 2,
    numFmt: { formatCode: 'General' },
    txPr: dataTxPr(12, ''),
    spPr: { ln: { solidFill: { schemeClr: { ...LINE_COLOR } } } },
  };
}

function dataValAxis(): JsonRecord {
  return {
    valScaling: {},
    units: { unit: 'percentage' },
    majorGridlines: { spPr: { ln: { solidFill: { srgbClr: { val: [217, 217, 217] } }, w: 1 }, effectLst: {} } },
    majorTickMarks: 2, minorTickMarks: 2,
    numFmt: { formatCode: 'General' },
    txPr: dataTxPr(12, ''),
    spPr: { ln: { solidFill: { schemeClr: { ...LINE_COLOR } } } },
  };
}

function dataLegend(legendPos: number): JsonRecord {
  return { legendPos, spPr: { noFill: true, ln: { noFill: true } }, txPr: dataTxPr(12, '') };
}

function dataTitle(): JsonRecord {
  return { txPr: dataTxPr(18.67, 'Chart Title', true), overlay: false, spPr: { noFill: true, ln: { noFill: true }, effectLst: {} } };
}

/** Category-axis `gapWidth` the trial writes per layout (0 = no axis). */
export const DATA_CAT_GAP: Record<number, number> = { 16: 0.06, 17: 0.06, 22: 0.5 };

export interface DataBuildInput extends BuildInput { colorSchemeList?: string[] }

/** Full chartSpace for the seven DataCharts types (trial-observed). */
export function buildDataChartSpace(input: DataBuildInput): JsonRecord {
  const space: JsonRecord = {
    typeName: 'chartSpace', roundedCorners: false,
    colorScheme: [0, [...DEFAULT_COLOR_LIST]],
    spPr: {
      solidFill: { schemeClr: { val: 0 } },
      ln: { solidFill: { schemeClr: { ...LINE_COLOR } }, w: 1 },
    },
    txPr: txPr(undefined, true),
  };
  if (input.colorSchemeList) space.colorScheme = [0, [...input.colorSchemeList]];
  const layoutId = DATA_LAYOUT_ID[Number(input.chartType)];
  const rect = parseRanges(input.dataRange)[0];
  const series = rect ? dataSeries(input, rect, input.sheetName) : [];
  const plotArea: JsonRecord = {
    plotAreaRegion: { plotSurface: { spPr: { noFill: true } }, series },
  };
  const gap = DATA_CAT_GAP[layoutId];
  if (gap !== undefined) plotArea.axes = layoutId === 22 ? [dataCatAxis(gap), dataValAxis()] : [dataCatAxis(gap)];
  const chart: JsonRecord = {
    title: dataTitle(),
    autoTitleDeleted: false,
    plotArea,
    plotVisOnly: true,
    dispBlanksAs: layoutId === 20 || layoutId === 21 ? 2 : 1,
    dispNaAsBlank: false,
  };
  if (layoutId === 16 || layoutId === 18 || layoutId === 19) chart.legend = dataLegend(4);
  if (layoutId === 21 || layoutId === 22) chart.legend = dataLegend(1);
  if (layoutId === 22) space.fmtOvrs = [0, 1, 2].map(idx => ({ idx, spPr: { ln: { w: 0 } } }));
  space.chart = chart;
  return space;
}

/** Rebuilds the plotAreaRegion series for a new data range/orientation. */
export function rebuildDataRefs(space: JsonRecord, input: DataBuildInput): void {
  const rect = parseRanges(input.dataRange)[0];
  if (!rect) return;
  const layoutId = Number(space.chart.plotArea.plotAreaRegion.series?.[0]?.layoutId ?? DATA_LAYOUT_ID[Number(input.chartType)]);
  space.chart.plotArea.plotAreaRegion.series = dataSeries(
    { ...input, chartType: LAYOUT_PUBLIC_TYPE[layoutId] ?? Number(input.chartType) }, rect, input.sheetName);
}

/** The `formulaObj` references of every data-chart series. */
export function dataSeriesRefs(space: JsonRecord): { name: string, category: string, value: string }[] {
  return (space.chart?.plotArea?.plotAreaRegion?.series ?? []).map((ser: JsonRecord) => ({
    name: String(ser.tx?.txData?.f?.formula ?? ''),
    category: String(ser.formulaObj?.strDim ?? ''),
    value: String(ser.formulaObj?.numDim ?? ''),
  }));
}
