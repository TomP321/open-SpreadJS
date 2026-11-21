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
import type { Worksheet } from '../../worksheet.js';
import type { JsonRecord, RectLike } from './types.js';
import type { BuildInput } from './chart-space.js';
import { headerEdgesOf } from './chart-space.js';
import { ACCENT_SOLID, LINE_COLOR, txPr } from './defaults.js';
import { DEFAULT_COLOR_LIST } from './color-schemes.js';
import { resolveToken } from './colors-resolve.js';
import { parseRanges, rectToString } from './refs.js';

/** public ChartType -> internal layoutId (trial-observed). */
export const DATA_LAYOUT_ID: Record<number, number> = { 53: 16, 54: 17, 55: 18, 56: 19, 57: 20, 58: 21, 59: 22 };
/** layoutId -> public ChartType. */
export const LAYOUT_PUBLIC_TYPE: Record<number, number> = Object.fromEntries(
  Object.entries(DATA_LAYOUT_ID).map(([t, l]) => [l, Number(t)]));

export function isDataChartType(chartType: number): boolean {
  return DATA_LAYOUT_ID[Number(chartType)] !== undefined;
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

/**
 * TASK 75 r4 (chart-preview probes over 7 selection shapes): a DataChart takes the FIRST line
 * of the selection along the orientation axis as its category dimension and every remaining
 * line as one series. The header edges only decide whether the corner line is excluded from
 * both and whether the series carry a name — `tx` appears only when the selection has headers
 * on BOTH edges (a text top row *and* a text left column). A one-line selection has no
 * category dimension at all. `strDimDir`/`numDimDir` are the orientation (`0` down a column,
 * `1` along a row); a missing `strDim` reports `0`.
 *
 * TASK 75 r5: the header edges are the trial's measured rule (`headerEdgesOf` — a BLANK corner
 * makes BOTH edges headers, otherwise the LAST cell of an edge decides), not "every cell of the
 * edge is text". The blank-corner grid `A1:D4` is exactly the TASK 39 fixture the DataCharts
 * model was first measured on (`strDim $B$1:$D$1`, `numDim $B$2:$D$2`, `tx $A$2`).
 */
function dataRefsFor(rect: RectLike, sheetName: string, sheet?: Worksheet): JsonRecord[] {
  const line = (value: RectLike) => rectToString(value, sheetName);
  if (rect.rowCount === 1 || rect.colCount === 1)
    return [{ name: '', category: '', value: line(rect), dir: rect.rowCount === 1 ? 1 : 0 }];
  const edges = sheet ? headerEdgesOf(sheet, rect) : { top: true, left: true };
  const top = edges.top, left = edges.left;
  const dataRows = rect.rowCount - (top ? 1 : 0);
  const dataCols = rect.colCount - (left ? 1 : 0);
  const byColumns = dataRows > dataCols;
  const dir = byColumns ? 0 : 1;
  const refs: JsonRecord[] = [];
  if (byColumns) {
    const category = line({
      row: top ? rect.row + 1 : rect.row, col: rect.col,
      rowCount: dataRows, colCount: 1,
    });
    for (let col = rect.col + 1; col < rect.col + rect.colCount; col++)
      refs.push({
        name: top ? line({ row: rect.row, col, rowCount: 1, colCount: 1 }) : '',
        category,
        value: line({ row: top ? rect.row + 1 : rect.row, col, rowCount: dataRows, colCount: 1 }),
        dir,
      });
    return refs;
  }
  const category = line({
    row: rect.row, col: left ? rect.col + 1 : rect.col,
    rowCount: 1, colCount: dataCols,
  });
  for (let row = rect.row + 1; row < rect.row + rect.rowCount; row++)
    refs.push({
      name: left ? line({ row, col: rect.col, rowCount: 1, colCount: 1 }) : '',
      category,
      value: line({ row, col: left ? rect.col + 1 : rect.col, rowCount: 1, colCount: dataCols }),
      dir,
    });
  return refs;
}

function dataSeries(input: DataBuildInput, rect: RectLike, sheetName: string, sheet?: Worksheet): JsonRecord[] {
  const layoutId = DATA_LAYOUT_ID[Number(input.chartType)];
  const refs = dataRefsFor(rect, sheetName, sheet);
  return refs.map((ref, i) => {
    const ser: JsonRecord = { dataId: { val: i }, layoutId, hidden: false };
    if (ref.name) ser.tx = { txData: { f: { formula: ref.name } } };
    const formulaObj: JsonRecord = {};
    if (ref.category) formulaObj.strDim = ref.category;
    formulaObj.numDim = ref.value;
    formulaObj.strDimDir = ref.category ? Number(ref.dir) : 0;
    formulaObj.numDimDir = Number(ref.dir);
    ser.formulaObj = formulaObj;
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
export function buildDataChartSpace(input: DataBuildInput, sheet?: Worksheet): JsonRecord {
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
  const series = rect ? dataSeries(input, rect, input.sheetName, sheet) : [];
  const plotArea: JsonRecord = {
    // Trial (TASK 39, synchronous `chart.toJSON()`): at creation the plot surface carries the
    // no-fill only; the no-line marker arrives with the first layout pass (see `Chart`'s
    // `_lnReady` deferral and `refreshPlotAreaSpPr`).
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
export function rebuildDataRefs(space: JsonRecord, input: DataBuildInput, sheet?: Worksheet): void {
  const rect = parseRanges(input.dataRange)[0];
  if (!rect) return;
  const layoutId = Number(space.chart.plotArea.plotAreaRegion.series?.[0]?.layoutId ?? DATA_LAYOUT_ID[Number(input.chartType)]);
  space.chart.plotArea.plotAreaRegion.series = dataSeries(
    { ...input, chartType: LAYOUT_PUBLIC_TYPE[layoutId] ?? Number(input.chartType) }, rect, input.sheetName, sheet);
}

/** The `formulaObj` references of every data-chart series. */
export function dataSeriesRefs(space: JsonRecord): { name: string, category: string, value: string }[] {
  return (space.chart?.plotArea?.plotAreaRegion?.series ?? []).map((ser: JsonRecord) => ({
    name: String(ser.tx?.txData?.f?.formula ?? ''),
    category: String(ser.formulaObj?.strDim ?? ''),
    value: String(ser.formulaObj?.numDim ?? ''),
  }));
}
