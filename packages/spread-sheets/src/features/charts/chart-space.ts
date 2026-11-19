/**
 * Builds the canonical chartSpace JSON model for a new chart and (re)builds
 * the series references when the data range or orientation changes.
 * Reference layout rules were measured from the trial: orientation 0 (default)
 * makes every data row one series with the header row as categories;
 * orientation 1 makes every data column one series with the header column as
 * categories. Scatter binds xVal/yVal instead of cat/val.
 */
import type { Worksheet } from '../../worksheet.js';
import type { JsonRecord, RectLike } from './types.js';
import { metaFor, GroupType } from './types.js';
import {
  categoryAxis, chartSpaceDefaults, defaultLegend, defaultTitle, makeAxisIds,
  scatterValueAxis, valueAxis, ACCENT_SOLID,
} from './defaults.js';
import { rectToString, parseRanges } from './refs.js';
import { groupPublicType } from './series.js';
import { isDataChartType, buildDataChartSpace, rebuildDataRefs } from './data-charts.js';
import { DEFAULT_COLOR_LIST } from './color-schemes.js';
import { parseColor } from '../../colors.js';

export interface BuildInput {
  chartType: number;
  dataRange: string;
  sheetName: string;
  orientation: number;
  name: string;
  /** True when the application passed `dataOrientation` (wins over the trial header rules). */
  explicitOrientation?: boolean;
}

/**
 * Bubble series consume TWO data lines each (trial-observed): the series row
 * provides y-values, the NEXT row provides the bubble sizes. The last series
 * without a size row falls back to literal 1s.
 */
function bubbleRefsFor(rect: RectLike, sheetName: string, orientation: number): JsonRecord[] {
  const out: JsonRecord[] = [];
  const rows = rect.rowCount, cols = rect.colCount;
  if (orientation === 1) {
    for (let j = 1; j < cols; j += 2) out.push({
      name: rectToString({ row: rect.row, col: rect.col + j, rowCount: 1, colCount: 1 }, sheetName),
      category: rectToString({ row: rect.row + 1, col: rect.col, rowCount: rows - 1, colCount: 1 }, sheetName),
      value: rectToString({ row: rect.row + 1, col: rect.col + j, rowCount: rows - 1, colCount: 1 }, sheetName),
      size: j + 1 < cols
        ? rectToString({ row: rect.row + 1, col: rect.col + j + 1, rowCount: rows - 1, colCount: 1 }, sheetName) : null,
    });
    return out;
  }
  for (let i = 1; i < rows; i += 2) out.push({
    name: rectToString({ row: rect.row + i, col: rect.col, rowCount: 1, colCount: 1 }, sheetName),
    category: rectToString({ row: rect.row, col: rect.col + 1, rowCount: 1, colCount: cols - 1 }, sheetName),
    value: rectToString({ row: rect.row + i, col: rect.col + 1, rowCount: 1, colCount: cols - 1 }, sheetName),
    size: i + 1 < rows
      ? rectToString({ row: rect.row + i + 1, col: rect.col + 1, rowCount: 1, colCount: cols - 1 }, sheetName) : null,
  });
  return out;
}

/**
 * Trial header/orientation model (TASK 54 probe `.probe/t54/probe-t54-chart-header.json`,
 * 30 measured grid/range combinations through `charts.add` + the chartSpace refs; TASK 53
 * `.probe/t53/probe-chart-bars.json` for the header fixtures):
 *
 * 1. an edge of the selection is a HEADER when
 *    - the corner cell (top-left of the range) is BLANK, which makes BOTH edges headers, or
 *    - the LAST cell of that edge holds text (`D1` for the top row, `A4` for the left column).
 *      Text in the middle of an edge does not count: `B1` alone or `B1+C1` stay headless,
 *      while `D1` alone or `C1+D1` give a header row (measured, `top-partial-*`, `top-B1C1`,
 *      `top-C1D1`, `left-A3-only`, `left-A2A3`, `left-A3A4`).
 * 2. trimming must leave a data region: a one-line selection (`A1:D1`) keeps everything as
 *    data (`single-row`, `single-col`).
 * 3. the series axis is decided by the shape of the DATA region (range minus the header
 *    edges): taller than wide -> every data COLUMN is one series, otherwise every data ROW.
 *    This reproduces the TASK 53 range table (headers on both edges -> the range rule) and the
 *    single-header cases, where the other edge is NOT trimmed (`A1:D4` with only the top row
 *    as header -> 3 row series spanning `$A$2:$D$2` etc.).
 * 4. role of an edge: for row series the top edge carries the categories and the left edge the
 *    series names; for column series it is the other way round. A header that carries names is
 *    not a category header (`wide-left-only`: names `$A$1`,`$A$2`, `cat` absent). With headers
 *    on both edges the corner cell belongs to neither ref.
 * 5. no headers at all -> HEADLESS: no `tx`, no `cat`, every series spans a full row/column.
 * 6. an explicit `dataOrientation` always wins over the shape rule.
 */
export interface HeaderEdges {
  top: boolean;
  left: boolean;
}

function cellIsText(sheet: Worksheet, row: number, col: number): boolean {
  const value = sheet.getValue(row, col);
  return typeof value === 'string' && value.trim() !== '';
}

function cellIsBlank(sheet: Worksheet, row: number, col: number): boolean {
  const value = sheet.getValue(row, col);
  return value === null || value === undefined || (typeof value === 'string' && value.trim() === '');
}

export function headerEdgesOf(sheet: Worksheet, rect: RectLike): HeaderEdges {
  const { row, col, rowCount, colCount } = rect;
  const cornerBlank = cellIsBlank(sheet, row, col);
  const top = colCount > 1 && (cornerBlank || cellIsText(sheet, row, col + colCount - 1));
  const left = rowCount > 1 && (cornerBlank || cellIsText(sheet, row + rowCount - 1, col));
  if (rowCount - (top ? 1 : 0) <= 0 || colCount - (left ? 1 : 0) <= 0) return { top: false, left: false };
  return { top, left };
}

/** Data region of a selection after the measured header edges are taken off. */
function regionOf(rect: RectLike, edges: HeaderEdges): RectLike {
  return {
    row: rect.row + (edges.top ? 1 : 0),
    col: rect.col + (edges.left ? 1 : 0),
    rowCount: rect.rowCount - (edges.top ? 1 : 0),
    colCount: rect.colCount - (edges.left ? 1 : 0),
  };
}

/** Selection with no header edges (a full row or a full column per series, no `tx`, no `cat`). */
function headlessRefsFor(rect: RectLike, sheetName: string, orientation: number): JsonRecord[] {
  const out: JsonRecord[] = [];
  if (orientation === 1) {
    for (let j = 0; j < rect.colCount; j++) out.push({
      name: '',
      category: '',
      value: rectToString({ row: rect.row, col: rect.col + j, rowCount: rect.rowCount, colCount: 1 }, sheetName),
    });
    return out;
  }
  for (let i = 0; i < rect.rowCount; i++) out.push({
    name: '',
    category: '',
    value: rectToString({ row: rect.row + i, col: rect.col, rowCount: 1, colCount: rect.colCount }, sheetName),
  });
  return out;
}

/**
 * Series references of a selection under the measured model. `data` is the (possibly trimmed)
 * data region, `names` is the edge that carries the series names (`null` = no name header),
 * `categories` the edge that carries the categories (`null` = no category header); with headers
 * on both edges the corner cell is excluded from both refs (`corner-blank`, `tails-both`).
 */
function edgeRefsFor(
  data: RectLike, sheetName: string, orientation: number,
  nameEdge: RectLike | null, categoryEdge: RectLike | null,
): JsonRecord[] {
  const cell = (row: number, col: number) => rectToString({ row, col, rowCount: 1, colCount: 1 }, sheetName);
  const line = (row: number, col: number, rowCount: number, colCount: number) =>
    rectToString({ row, col, rowCount, colCount }, sheetName);
  const out: JsonRecord[] = [];
  if (orientation === 1) {
    for (let j = 0; j < data.colCount; j++) out.push({
      name: nameEdge ? cell(nameEdge.row, nameEdge.col + j) : '',
      category: categoryEdge ? line(categoryEdge.row, categoryEdge.col, categoryEdge.rowCount, 1) : '',
      value: line(data.row, data.col + j, data.rowCount, 1),
    });
    return out;
  }
  for (let i = 0; i < data.rowCount; i++) out.push({
    name: nameEdge ? cell(nameEdge.row + i, nameEdge.col) : '',
    category: categoryEdge ? line(categoryEdge.row, categoryEdge.col, 1, categoryEdge.colCount) : '',
    value: line(data.row + i, data.col, 1, data.colCount),
  });
  return out;
}

function refsFor(rect: RectLike, sheetName: string, orientation: number, sheet?: Worksheet, explicitOrientation = false): JsonRecord[] {
  const edges = sheet ? headerEdgesOf(sheet, rect) : { top: true, left: true };
  const data = regionOf(rect, edges);
  if (!edges.top && !edges.left) {
    // Headless grids never eat a header line: the selection bounds every series.
    return headlessRefsFor(rect, sheetName, explicitOrientation ? orientation : (rect.rowCount > rect.colCount ? 1 : 0));
  }
  const axis = explicitOrientation ? orientation : (data.rowCount > data.colCount ? 1 : 0);
  const both = edges.top && edges.left;
  const topEdge: RectLike = { row: rect.row, col: both ? rect.col + 1 : rect.col, rowCount: 1, colCount: both ? rect.colCount - 1 : rect.colCount };
  const leftEdge: RectLike = { row: both ? rect.row + 1 : rect.row, col: rect.col, rowCount: both ? rect.rowCount - 1 : rect.rowCount, colCount: 1 };
  return edgeRefsFor(
    data, sheetName, axis,
    axis === 1 ? (edges.top ? topEdge : null) : (edges.left ? leftEdge : null),
    axis === 1 ? (edges.left ? leftEdge : null) : (edges.top ? topEdge : null),
  );
}


/**
 * Orientation the trial picks on its own when `charts.add(...)` gets no `dataOrientation`
 * (TASK 53 `.probe/t53/probe-chart-bars.json`, TASK 54 `.probe/t54/probe-t54-chart-header.json`):
 * it is the shape of the DATA REGION, i.e. the selection minus its header edges.
 *
 * | range    | headers        | data region | trial series names            | orientation |
 * | -------- | -------------- | ----------- | ----------------------------- | ----------- |
 * | `A1:B4`  | both (blank A1)| 3x1         | `Sheet1!$B$1`                 | columns (1) |
 * | `A1:C4`  | both           | 3x2         | `$B$1`, `$C$1`                | columns (1) |
 * | `A1:D2`  | both           | 1x3         | `$A$2`                        | rows (0)    |
 * | `A1:D4`  | both           | 3x3         | `$A$2`, `$A$3`, `$A$4`        | rows (0)    |
 * | `A1:D4`  | none (numeric) | 4x4         | - (headless full rows)        | rows (0)    |
 * | `A1:B4`  | none (numeric) | 4x2         | - (headless full columns)     | columns (1) |
 * | `A1:D4`  | top only       | 3x4         | - (`cat $A$1:$D$1`)           | rows (0)    |
 * | `A1:D4`  | left only      | 4x3         | - (`cat $A$1:$A$4`)           | columns (1) |
 * | `A1:B4`  | top only       | 3x2         | `$A$1`, `$B$1`                | columns (1) |
 * | `A1:D2`  | left only      | 2x3         | `$A$1`, `$A$2`                | rows (0)    |
 *
 * i.e. taller than wide -> every data COLUMN becomes a series, otherwise every data ROW does.
 * An explicit `dataOrientation` always wins.
 */
export function autoOrientation(dataRange: string, sheet?: Worksheet): number {
  const rect = parseRanges(dataRange)[0];
  if (!rect) return 0;
  if (!sheet) return rect.rowCount > rect.colCount ? 1 : 0;
  const data = regionOf(rect, headerEdgesOf(sheet, rect));
  return data.rowCount > data.colCount ? 1 : 0;
}

export function defaultColorFor(index: number, colorScheme?: [number, string[]]): JsonRecord {
  const list = colorScheme?.[1]?.length ? colorScheme[1] : DEFAULT_COLOR_LIST;
  const token = list[index % list.length];
  const accent = /^accent (\d)(?: ([+-]?\d+(?:\.\d+)?))?$/i.exec(token);
  if (accent && (accent[2] === undefined || accent[2] === '0')) return ACCENT_SOLID(Number(accent[1]));
  const rgba = parseColor(token);
  if (rgba) return { srgbClr: { val: [rgba[0], rgba[1], rgba[2]] } };
  return ACCENT_SOLID((index % 6) + 1);
}

function seriesSpPr(chartType: number, index: number, withStyle: boolean): JsonRecord | null {
  const meta = metaFor(chartType);
  const fill = ACCENT_SOLID(index + 1);
  if (meta.pieFamily) return { ln: { solidFill: { srgbClr: { val: [255, 255, 255] } }, w: 2 } };
  // Stock series carry only the solidFill (trial): the glyph paints itself.
  if (meta.group === GroupType.stock) return withStyle ? { solidFill: fill } : null;
  if (meta.group === GroupType.radar) {
    const w = meta.radarStyle === 2 ? 0 : 2;
    return withStyle ? { solidFill: fill, ln: { w } } : { ln: { w } };
  }
  if (meta.lineSeries) return withStyle ? { solidFill: fill, ln: { w: 2 } } : { ln: { w: 2 } };
  if (meta.group === GroupType.scatter) {
    // Trial: line-drawing scatter variants keep a solid `ln {w:2}`, the
    // markers-only type writes `ln {noFill:true, w:2}`.
    const ln = meta.scatterLines ? { w: 2 } : { noFill: true, w: 2 };
    return withStyle ? { solidFill: fill, ln } : { ln };
  }
  return withStyle ? { solidFill: fill } : null;
}

function pointCountOf(ref: string): number {
  const rect = parseRanges(ref)[0];
  return rect ? Math.max(1, rect.rowCount * rect.colCount) : 1;
}

function literalPoints(ref: string, value: number): string[] {
  return Array.from({ length: pointCountOf(ref) }, () => String(value));
}

function buildSeries(chartType: number, refs: JsonRecord[], startIdx: number, withStyle = true): JsonRecord[] {
  const meta = metaFor(chartType);
  return refs.map((ref, position) => {
    const idx = startIdx + position;
    const ser: JsonRecord = { seriesType: meta.seriesType, idx, order: idx };
    // Headless series (trial `headless2` probe): no `tx`, no `cat` - only the full-row `val`.
    if (ref.name) ser.tx = { strRef: { f: ref.name } };
    const spPr = seriesSpPr(chartType, idx, withStyle);
    if (spPr) ser.spPr = spPr;
    if (meta.group === GroupType.scatter) {
      ser.xVal = { numRef: { f: ref.category, numCache: { formatCode: 'General' } } };
      ser.yVal = { numRef: { f: ref.value, numCache: { formatCode: 'General' } } };
      if (meta.smooth !== undefined) ser.smooth = meta.smooth;
      if (meta.marker) ser.marker = { ...meta.marker };
    } else if (meta.group === GroupType.bubble) {
      ser.xVal = { numRef: { f: ref.category, numCache: { formatCode: 'General' } } };
      ser.yVal = { numRef: { f: ref.value, numCache: { formatCode: 'General' } } };
      ser.bubbleSize = ref.size
        ? { numRef: { f: ref.size, numCache: { formatCode: 'General' } } }
        : { numLit: { formatCode: 'General', ptCount: pointCountOf(ref.value), pt: literalPoints(ref.value, 1) } };
      ser.bubble3D = false;
    } else {
      if (ref.category) ser.cat = { strRef: { f: ref.category } };
      ser.val = { numRef: { f: ref.value, numCache: { formatCode: 'General' } } };
      if (meta.smooth !== undefined) ser.smooth = meta.smooth;
      if (meta.marker) ser.marker = { ...meta.marker };
    }
    if (meta.group === GroupType.bar) {
      if (meta.barDir === 1) ser.invertIfNegative = false;
      ser.shape = 2;
    }
    if (meta.pieFamily) ser.explosion = 0;
    return ser;
  });
}

function buildGroup(input: BuildInput, refs: JsonRecord[], axIds: number[], startIdx = 0): JsonRecord {
  const meta = metaFor(input.chartType);
  const group: JsonRecord = { chartType: meta.group };
  const ser = buildSeries(input.chartType, refs, startIdx);
  if (meta.group === GroupType.bar) {
    group.axId = [axIds[0], axIds[1]];
    group.barDir = meta.barDir;
    group.grouping = meta.grouping;
    group.gapWidth = meta.gapWidth;
    group.varyColors = false;
    group.overlap = meta.overlap;
  } else if (meta.group === GroupType.line) {
    group.axId = [axIds[0], axIds[1]];
    group.grouping = meta.grouping ?? 1;
    group.varyColors = false;
    group.smooth = false;
    group.marker = meta.marker !== null && meta.marker !== undefined && meta.marker.symbol !== 4;
  } else if (meta.group === GroupType.area) {
    group.axId = [axIds[0], axIds[1]];
    group.grouping = meta.grouping ?? 1;
    group.varyColors = false;
  } else if (meta.group === GroupType.scatter) {
    group.axId = [axIds[2], axIds[1]];
    group.scatterStyle = meta.scatterStyle ?? 2;
    group.varyColors = false;
  } else if (meta.group === GroupType.radar) {
    group.axId = [axIds[0], axIds[1]];
    group.radarStyle = meta.radarStyle ?? 1;
    group.varyColors = false;
  } else if (meta.group === GroupType.bubble) {
    group.axId = [axIds[2], axIds[1]];
    group.varyColors = false;
    group.bubbleScale = 100;
    group.sizeRepresents = 0;
  } else if (meta.group === GroupType.stock) {
    group.axId = [axIds[0], axIds[1]];
    group.hiLowLines = {};
    // OHLC families draw candle bodies: the trial adds `upDownBars` (HLC ones omit it).
    if (Number(input.chartType) === 50 || Number(input.chartType) === 52) group.upDownBars = { gapWidth: 150 };
  } else {
    group.varyColors = true;
    group.firstSliceAng = 0;
    if (meta.group === GroupType.doughnut) group.holeSize = 75;
  }
  group.ser = ser;
  return group;
}

/** Creates a full chartSpace model (trial default styles included). */
export function buildChartSpace(input: BuildInput, colorScheme?: [number, string[]], sheet?: Worksheet): JsonRecord {
  if (isDataChartType(input.chartType)) {
    return buildDataChartSpace({ ...input, colorSchemeList: colorScheme?.[1] });
  }
  const space = chartSpaceDefaults();
  space.colorScheme = [0, [...DEFAULT_COLOR_LIST]];
  if (colorScheme) space.colorScheme = [Number(colorScheme[0]) || 0, [...(colorScheme[1] ?? [])]];
  const rect = parseRanges(input.dataRange)[0];
  const axIds = makeAxisIds();
  const meta = metaFor(input.chartType);
  const axes: JsonRecord[] = [];
  if (meta.hasAxes) {
    if (meta.group === GroupType.scatter || meta.group === GroupType.bubble) {
      // Trial: the scatter/bubble x-axis has no gridlines; both axes numeric.
      const xAxis = scatterValueAxis(axIds[2], axIds[1], 0);
      delete xAxis.majorGridlines;
      const yAxis = valueAxis(axIds[1], axIds[2]);
      if (meta.group === GroupType.scatter) yAxis.crossBetween = 1;
      axes.push(xAxis, yAxis);
    } else if (meta.group === GroupType.radar) {
      // Trial: the radar value axis line is invisible (`ln {noFill:true}`).
      const yAxis = valueAxis(axIds[1], axIds[0]);
      yAxis.spPr = { ln: { noFill: true } };
      axes.push(categoryAxis(axIds[0], axIds[1], 0), yAxis);
    } else {
      axes.push(categoryAxis(axIds[0], axIds[1], meta.group === GroupType.bar && meta.barDir === 0 ? 1 : 0), valueAxis(axIds[1], axIds[0]));
    }
  }
  const refs = rect
    ? (meta.group === GroupType.bubble ? bubbleRefsFor(rect, input.sheetName, input.orientation) : refsFor(rect, input.sheetName, input.orientation, sheet, input.explicitOrientation))
    : [];
  // Stock families (trial-measured): validation + VHLC/VOHLC split into a
  // volume BAR group (primary axis) + a stock group on a secondary pair.
  if (meta.group === GroupType.stock && rect) {
    const kind = Number(input.chartType);
    const need = kind === 49 ? 3 : kind === 50 ? 4 : kind === 51 ? 4 : 5;
    if (kind !== 49 && refs.length < need) {
      const order = kind === 50
        ? 'opening price, high price, low price, closing price'
        : kind === 51
          ? 'volume traded, high price, low price, closing price'
          : 'volume traded, opening price, high price, low price, closing price';
      throw new Error(`To create this stock chart, arrange the data on your sheet in this order: ${order}. Use dates or stock names as label`);
    }
    if (kind === 51 || kind === 52) {
      // The generic block above already pushed the primary cat+value pair;
      // add the secondary pair (trial: deleted secondary category axis + a
      // secondary value axis on the right with `crosses:2`, no gridlines).
      const secCat = categoryAxis(axIds[2], axIds[3], 3);
      secCat.AxisGroup = 1;
      secCat.delete = true;
      const secVal = valueAxis(axIds[3], axIds[2], );
      secVal.axPos = 2;
      secVal.AxisGroup = 1;
      secVal.crosses = 2;
      delete secVal.majorGridlines;
      axes.push(secCat, secVal);
      const barGroup = buildGroup({ ...input, chartType: 12 }, refs.slice(0, 1), [axIds[0], axIds[1]]);
      const stockGroup = buildGroup(input, refs.slice(1), [axIds[2], axIds[3]], refs[0] ? 1 : 0);
      space.chart = {
        title: defaultTitle(),
        autoTitleDeleted: false,
        plotArea: { axes, chartGroups: [barGroup, stockGroup], spPr: { noFill: true } },
        legend: defaultLegend(4),
        plotVisOnly: true,
        dispBlanksAs: 1,
        dispNaAsBlank: false,
      };
      return space;
    }
  }
  const groups = rect ? [buildGroup(input, refs, axIds)] : [];
  space.chart = {
    title: defaultTitle(),
    autoTitleDeleted: false,
    plotArea: { ...(meta.hasAxes ? { axes } : {}), chartGroups: groups, spPr: { noFill: true } },
    legend: defaultLegend(meta.defaultLegendPos ?? 4),
    plotVisOnly: true,
    // Area and stacked-line charts default to the "zero" blank policy (trial).
    dispBlanksAs: meta.dispBlanksAs ?? (meta.group === GroupType.area ? 2 : 1),
    dispNaAsBlank: false,
  };
  return space;
}

/** Rebuilds all series references for the given range/orientation. */
export function rebuildRefs(space: JsonRecord, input: BuildInput, withStyle = true, sheet?: Worksheet): void {
  const rect = parseRanges(input.dataRange)[0];
  if (!rect) return;
  if (space.chart.plotArea.plotAreaRegion) {
    rebuildDataRefs(space, { ...input, colorSchemeList: space.colorScheme?.[1] as string[] | undefined });
    return;
  }
  const group = space.chart.plotArea.chartGroups[0];
  if (!group) return;
  const bubble = Number(group.chartType) === GroupType.bubble;
  const refs = bubble ? bubbleRefsFor(rect, input.sheetName, input.orientation) : refsFor(rect, input.sheetName, input.orientation, sheet, input.explicitOrientation);
  group.ser = buildSeries(groupPublicType(group), refs, 0, withStyle);
}

export { refsFor, buildSeries };
