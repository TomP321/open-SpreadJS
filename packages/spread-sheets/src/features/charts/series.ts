/**
 * `SeriesCollection` plus the JSON <-> API conversions for series objects.
 * Series are stored inside chartSpace `plotArea.chartGroups[].ser[]`; the
 * public `order` runs through all groups in order while `idx` keeps the
 * creation sequence (trial behaviour measured through add/remove).
 */
import type { Worksheet } from '../../worksheet.js';
import type { JsonRecord } from './types.js';
import { GroupType, metaFor } from './types.js';
import { LAYOUT_PUBLIC_TYPE } from './data-charts.js';
import { ACCENT_SOLID } from './defaults.js';
import { buildDataLabelEntry, typeDefaultLabelPosition } from './dlabels.js';
import { colorObjectToGetter, tokenToColorObject } from './tokens.js';
import { DEFAULT_COLOR_LIST } from './color-schemes.js';

export interface ChartLike {
  chartType(value?: number): number | unknown;
  _space: JsonRecord;
  _sheet?: Worksheet;
  _changed(): void;
  _markSeriesManual(): void;
  _markSeriesOp(kind: 'add' | 'add-new-group' | 'set' | 'remove'): void;
  /** Set once `ignoreHidden()` was called (mirrors the trial's series getter). */
  _ignoreHidden?: boolean;
  _seriesView(group: JsonRecord, ser: JsonRecord): JsonRecord;
  _buildSeries(chartType: number, refs: { name: string, category: string, value: string }[], startIdx: number, withStyle?: boolean): JsonRecord[];
}

export function groupsOf(chart: ChartLike): JsonRecord[] {
  return chart._space.chart.plotArea.chartGroups;
}

export function flattenSeries(chart: ChartLike): { group: JsonRecord, ser: JsonRecord }[] {
  const out: { group: JsonRecord, ser: JsonRecord }[] = [];
  const region = chart._space.chart.plotArea.plotAreaRegion as JsonRecord | undefined;
  if (region?.series) return (region.series as JsonRecord[]).map(ser => ({ group: region, ser }));
  for (const group of groupsOf(chart)) for (const ser of group.ser ?? []) out.push({ group, ser });
  return out;
}

export function axisGroupOf(chart: ChartLike, group: JsonRecord): number {
  const axes: JsonRecord[] = chart._space.chart.plotArea.axes ?? [];
  const axId = (group.axId ?? [])[0];
  const axis = axes.find(a => a.axId === axId);
  return Number(axis?.AxisGroup ?? 0);
}

/** Public ChartType of a group (reverse of the group-code mapping). */
export function groupPublicType(group: JsonRecord): number {
  const markerSymbol = (group.ser?.[0]?.marker ?? {}).symbol;
  const markerOn = markerSymbol !== undefined && markerSymbol !== 4;
  switch (group.chartType) {
    case GroupType.bar:
      return (group.barDir ?? 1) === 1
        ? (group.grouping === 3 ? 13 : group.grouping === 0 && group.overlap === 100 ? 14 : 12)
        : (group.grouping === 3 ? 19 : group.grouping === 0 && group.overlap === 100 ? 20 : 18);
    case GroupType.line:
      return group.grouping === 2 ? (markerOn ? 27 : 24)
        : group.grouping === 0 ? (markerOn ? 28 : 25) : (markerOn ? 26 : 9);
    case GroupType.area:
      return group.grouping === 2 ? 37 : group.grouping === 0 ? 38 : 8;
    case GroupType.scatter: {
      const style = Number(group.scatterStyle ?? 2);
      if (style === 5) return markerOn ? 33 : 34;
      if (style === 4) return 34;
      if (style === 1) return markerOn ? 35 : 36;
      // style 2: markers-only (noFill line) vs lines-with-markers (solid line).
      if (!markerOn) return 36;
      return group.ser?.[0]?.spPr?.ln?.noFill ? 1 : 35;
    }
    case GroupType.radar:
      return group.radarStyle === 2 ? 43 : markerOn ? 42 : 2;
    case GroupType.bubble: return 11;
    case GroupType.stock: return 9; // trial reports stock series as line
    case GroupType.pie: return 10;
    case GroupType.doughnut: return 3;
    default: return 12;
  }
}

function seriesColor(chart: ChartLike, ser: JsonRecord, group?: JsonRecord): string {
  if (ser.spPr?.solidFill) return colorObjectToGetter(ser.spPr.solidFill);
  // A line series without an explicit fill paints black (trial behaviour).
  if (group && group.chartType === GroupType.line) return 'rgb(0,0,0)';
  const list = (chart._space.colorScheme?.[1] as string[] | undefined)?.length ? (chart._space.colorScheme[1] as string[]) : DEFAULT_COLOR_LIST;
  return list[Number(ser.idx ?? 0) % list.length] ?? list[0];
}

function borderFor(chart: ChartLike, group: JsonRecord, ser: JsonRecord): JsonRecord {
  const ln = ser.spPr?.ln;
  const lineFamily = group.chartType === GroupType.line;
  const scatter = group.chartType === GroupType.scatter;
  const radar = group.chartType === GroupType.radar;
  const stock = group.chartType === GroupType.stock;
  const pie = group.chartType === GroupType.pie || group.chartType === GroupType.doughnut;
  const width = Number(ln?.w ?? (lineFamily || scatter || stock || pie ? 2 : 0));
  // Line borders fall back to the palette colour even when the fill is black.
  // Radar lines do the same, but only while the line is visible (trial:
  // radarFilled with `ln {w:0}` still reports the plain black default).
  // Stock series report the line-style default `{color:'',width:2}`.
  const list = (chart._space.colorScheme?.[1] as string[] | undefined)?.length ? (chart._space.colorScheme[1] as string[]) : DEFAULT_COLOR_LIST;
  const fallback = stock ? ''
    : lineFamily || scatter ? (list[Number(ser.idx ?? 0) % list.length] ?? 'accent 1 0')
    : radar ? (width > 0 ? (list[Number(ser.idx ?? 0) % list.length] ?? 'accent 1 0') : 'rgb(0,0,0)')
    : pie ? 'rgb(255,255,255)' : 'rgb(0,0,0)';
  const color = ln?.solidFill ? colorObjectToGetter(ln.solidFill) : ln?.noFill ? '' : fallback;
  return { color, transparency: 0, lineType: Number(ln?.prstDash ?? 0), width };
}

function dataLabelsFor(chart: ChartLike, group: JsonRecord, ser: JsonRecord): JsonRecord {
  const isPie = group.chartType === GroupType.pie || group.chartType === GroupType.doughnut;
  if (!ser.dLbls) {
    const minimal: JsonRecord = { showValue: false, showSeriesName: false, showCategoryName: false, showDataLabelsRange: false };
    if (isPie) minimal.showPercentage = false;
    return minimal;
  }
  const d = ser.dLbls;
  const rPr = (d.txPr?.p?.[0]?.elements?.[0]?.rPr ?? {}) as JsonRecord;
  const out: JsonRecord = {
    showValue: !!d.showVal, showSeriesName: !!d.showSerName, showCategoryName: !!d.showCatName,
    position: Number(d.dLblPos ?? typeDefaultLabelPosition(groupPublicType(group))), format: d.numFmt?.formatCode ?? 'General',
    numberFormatLinked: d.numFmt?.sourceLinked !== false,
    dataLabelsRange: '', separator: d.separator ?? ', ',
    color: rPr.solidFill?.srgbClr ? (colorObjectToGetter(rPr.solidFill) || 'rgb(89,89,89)') : 'rgb(89,89,89)', transparency: 0,
    fontFamily: 'Calibri', fontSize: Number(rPr.sz ?? 13.33),
    fontBold: !!rPr.b, backColor: '', backColorTransparency: 0,
    borderColor: '', borderColorTransparency: 0,
    showDataLabelsRange: false,
  };
  if (isPie) out.showPercentage = !!d.showPercent;
  return out;
}

function markerSymbol(chart: ChartLike, group: JsonRecord, ser: JsonRecord): JsonRecord | undefined {
  const marker = ser.marker;
  if (!marker || marker.symbol === undefined || marker.symbol === 4) return undefined;
  const color = seriesColor(chart, ser);
  return {
    fill: color, fillColorTransparency: 0, size: Number(marker.size ?? 7), shape: Number(marker.symbol),
    border: { color: marker.spPr?.ln?.solidFill ? colorObjectToGetter(marker.spPr.ln.solidFill) : color, colorTransparency: 0, width: 1, lineType: 0 },
  };
}

/**
 * Series getter for the DataCharts types (53..59, trial-measured): the view
 * carries the `formulaObj` refs, the public type, type-specific extras
 * (`gapWidth`/`showConnectorLines`/`subtotals` for waterfall and funnel,
 * category `dataPoints` for sunburst/treemap) and no `smooth`/`symbol`.
 */
function dataSeriesGetter(chart: ChartLike, region: JsonRecord, ser: JsonRecord, points = 0): JsonRecord {
  const layoutId = Number(ser.layoutId);
  const publicType = LAYOUT_PUBLIC_TYPE[layoutId] ?? 0;
  const list = (chart._space.colorScheme?.[1] as string[] | undefined)?.length ? (chart._space.colorScheme[1] as string[]) : DEFAULT_COLOR_LIST;
  const idx = Number(ser.dataId?.val ?? 0);
  const pieLike = layoutId === 20 || layoutId === 21;
  const catAxis = ((chart._space.chart.plotArea.axes ?? []) as JsonRecord[]).find(a => a.catScaling) ?? {};
  const out: JsonRecord = {
    name: ser.tx?.txData?.f?.formula ?? '',
    xValues: ser.formulaObj?.strDim ?? '',
    yValues: ser.formulaObj?.numDim === undefined ? '' : ser.formulaObj.numDim,
    chartType: publicType,
    axisGroup: 0,
    backColor: ser.spPr?.solidFill ? colorObjectToGetter(ser.spPr.solidFill) : layoutId === 22 ? 'auto' : list[idx % list.length] ?? list[0],
    backColorTransparency: 0,
    border: layoutId === 22
      ? { color: 'auto', transparency: 0, lineType: 0, width: 0 }
      : pieLike
        ? { color: 'rgb(255,255,255)', transparency: 0, lineType: 0, width: 2 }
        : { color: 'rgb(0,0,0)', transparency: 0, lineType: 0, width: 0 },
    errorBars: null,
    trendlines: null,
    dataLabels: pieLike
      ? {
        showValue: false, showSeriesName: false, showCategoryName: true, position: 2,
        format: 'General', separator: ', ', numberFormatLinked: true, color: 'rgb(255,255,255)', transparency: 0,
        fontFamily: 'Calibri', fontSize: 13.33, fontBold: false, backColor: '', backColorTransparency: 0,
        borderColor: '', borderColorTransparency: 0,
      }
      : { showValue: false, showSeriesName: false, showCategoryName: false, showDataLabelsRange: false },
    dataPoints: {},
    plotVisibleOnly: chart._ignoreHidden !== undefined ? !!chart._ignoreHidden : !!chart._space.chart.plotVisOnly,
  };
  if (layoutId === 17 || layoutId === 22) out.gapWidth = Number(catAxis.catScaling?.gapWidth ?? 0);
  if (layoutId === 22) {
    out.showConnectorLines = ser.layoutPr?.visibility?.connectorLines !== '0' && ser.layoutPr?.visibility?.connectorLines !== false;
    out.subtotals = [];
  }
  if (pieLike) {
    const palette = DEFAULT_COLOR_LIST;
    for (let i = 0; i < points; i++) {
      const dp = (ser.dataPt ?? []).find((p: JsonRecord) => Number(p.idx) === i);
      out.dataPoints[String(i)] = {
        backColor: dp?.spPr?.solidFill ? colorObjectToGetter(dp.spPr.solidFill) : palette[i % palette.length] ?? 'accent 1 0',
        backColorTransparency: 0,
        border: { color: 'rgb(255,255,255)', transparency: 0, width: 2, lineType: 0 },
        invertIfNegative: false,
      };
    }
  }
  return out;
}

export function seriesGetter(chart: ChartLike, group: JsonRecord, ser: JsonRecord, points = 0): JsonRecord {
  if (group.plotSurface !== undefined) return dataSeriesGetter(chart, group, ser, points);
  const isBar = group.chartType === GroupType.bar;
  const isPie = group.chartType === GroupType.pie;
  const isDoughnut = group.chartType === GroupType.doughnut;
  const idx = Number(ser.idx ?? 0);
  const out: JsonRecord = {
    name: ser.tx?.strRef?.f ?? '',
    xValues: (ser.cat?.strRef ?? ser.cat?.numRef ?? ser.xVal?.numRef ?? ser.xVal?.strRef ?? {}).f ?? '',
    yValues: (ser.val?.numRef ?? ser.val?.strRef ?? ser.yVal?.numRef ?? {}).f ?? '',
    chartType: groupPublicType(group),
    axisGroup: axisGroupOf(chart, group),
    ...(group.chartType === GroupType.bubble
      ? { ...(ser.bubbleSize?.numRef?.f ? { bubbleSizes: ser.bubbleSize.numRef.f } : {}), bubbleScale: Number(group.bubbleScale ?? 100) } : {}),
    backColor: isPie || isDoughnut ? 'auto' : seriesColor(chart, ser, group),
    // Pie/doughnut series report backColorTransparency only past the first ring
    // once the series owns a styled label entry — trial quirk measured black-box.
    ...(!isPie && !isDoughnut || idx === 0 || (isDoughnut ? idx > 0 : !!ser.dLbls?.spPr)
      ? { backColorTransparency: Number(ser.spPr?.solidFill?.alphaMod ? (100000 - ser.spPr.solidFill.alphaMod) / 1000 : 0) } : {}),
    border: borderFor(chart, group, ser),
    errorBars: ser.errBars ? ser.errBars : null,
    trendlines: ser.trendlines ? ser.trendlines.map((t: JsonRecord) => ({ ...t })) : null,
    dataLabels: dataLabelsFor(chart, group, ser),
    dataPoints: {},
    plotVisibleOnly: chart._ignoreHidden !== undefined ? !!chart._ignoreHidden : ser.plotVisOnly !== false,
  };
  const makePoint = (i: number): JsonRecord => {
    const palette = (chart._space.colorScheme?.[1] as string[] | undefined)?.length ? (chart._space.colorScheme[1] as string[]) : DEFAULT_COLOR_LIST;
    const dpt = (ser.dPt ?? []).find((p: JsonRecord) => Number(p.idx) === i);
    return {
      backColor: dpt?.spPr?.solidFill ? colorObjectToGetter(dpt.spPr.solidFill) : (palette[i % palette.length] ?? 'accent 1 0'),
      backColorTransparency: 0,
      border: { color: 'rgb(255,255,255)', transparency: 0, width: 2, lineType: 0 },
    };
  };
  if (isDoughnut) for (let i = 0; i < points; i++) out.dataPoints[String(i)] = makePoint(i);
  else if (isPie) {
    if (idx === 0) for (let i = 0; i < points; i++) out.dataPoints[String(i)] = makePoint(i);
    else if (points > 0) out.dataPoints['0'] = makePoint(0);
  }
  if (isBar) {
    if (group.barDir !== 0) out.invertIfNegative = ser.invertIfNegative === true;
    out.invertColor = 'rgb(255,255,255)';
    out.gapWidth = Number(group.gapWidth ?? 150) / 100;
    out.overlap = Number(group.overlap ?? 0) / 100;
  }
  const symbol = markerSymbol(chart, group, ser);
  if (symbol) out.symbol = symbol;
  // Trial: line groups, every scatter variant EXCEPT plain xyScatter
  // (markers-only, `ln {noFill}`) and stock groups report a `smooth` flag.
  const scatterSmoothFlag = (group.chartType === GroupType.scatter
    && (Number(group.scatterStyle ?? 2) !== 2 || !ser.spPr?.ln?.noFill))
    || group.chartType === GroupType.stock;
  if (group.chartType === GroupType.line || scatterSmoothFlag) out.smooth = ser.smooth === true || group.smooth === true;
  if (group.chartType === GroupType.pie) out.startAngle = Number(group.firstSliceAng ?? 0);
  if (group.chartType === GroupType.doughnut) {
    out.startAngle = Number(group.firstSliceAng ?? 0);
    out.doughnutHoleSize = Number(group.holeSize ?? 75) / 100;
  }
  return out;
}

function reindexOrders(chart: ChartLike): void {
  let order = 0;
  for (const group of groupsOf(chart)) for (const ser of group.ser ?? []) ser.order = order++;
}

/** Find the group that should host `chartType` + `axisGroup`, creating it when needed. */
function targetGroup(chart: ChartLike, chartType: number, axisGroup: number): JsonRecord {
  const meta = metaFor(chartType);
  const groups = groupsOf(chart);
  const existing: JsonRecord | undefined = groups.find((g: JsonRecord) => g.chartType === meta.group
    && (meta.group !== GroupType.bar || g.barDir === meta.barDir)
    && axisGroupOf(chart, g) === axisGroup);
  if (existing) return existing;
  const space = chart._space;
  const axes: JsonRecord[] = space.chart.plotArea.axes ?? [];
  let axIds: number[];
  if (axisGroup === 1) {
    const next = (axes.reduce((max, a) => Math.max(max, Number(a.axId ?? 0)), 0) || 90000000) + 11;
    const cat: JsonRecord = meta.hasAxes ? { ...(axes.find(a => Number(a.AxisGroup) === 0 && Number(a.axisType) === 0) ?? {}), axId: next, AxisGroup: 1, axPos: 3 } : null as never;
    const val: JsonRecord = meta.hasAxes ? { ...(axes.find(a => Number(a.AxisGroup) === 0 && Number(a.axisType) === 3) ?? {}), axId: next + 1, AxisGroup: 1, axPos: 2 } : null as never;
    if (cat && val) {
      cat.crossAx = val.axId; val.crossAx = cat.axId;
      cat.delete = true;
      delete val.majorGridlines;
      val.crosses = 2;
      axes.push(cat, val);
    }
    axIds = meta.hasAxes ? [next, next + 1] : [];
  } else {
    axIds = axes.length ? [axes[0].axId, (axes.find(a => Number(a.axisType) === 3) ?? axes[0]).axId] : [];
  }
  const group: JsonRecord = { chartType: meta.group };
  if (meta.group === GroupType.bar) Object.assign(group, { axId: axIds, barDir: meta.barDir, grouping: meta.grouping, gapWidth: meta.gapWidth, varyColors: false, overlap: meta.overlap });
  else if (meta.group === GroupType.line) Object.assign(group, { axId: axIds, grouping: meta.grouping ?? 1, varyColors: false, smooth: false, marker: meta.marker !== null && meta.marker !== undefined && meta.marker.symbol !== 4 });
  else if (meta.group === GroupType.area) Object.assign(group, { axId: axIds, grouping: meta.grouping ?? 1, varyColors: false });
  else if (meta.group === GroupType.scatter) Object.assign(group, { axId: axIds.slice().reverse(), scatterStyle: meta.scatterStyle ?? 2, varyColors: false });
  else if (meta.group === GroupType.radar) Object.assign(group, { axId: axIds, radarStyle: meta.radarStyle ?? 1, varyColors: false });
  else if (meta.group === GroupType.bubble) Object.assign(group, { axId: axIds.slice().reverse(), varyColors: false, bubbleScale: 100, sizeRepresents: 0 });
  else Object.assign(group, { varyColors: true, firstSliceAng: 0 });
  if (meta.group === GroupType.doughnut) group.holeSize = 75;
  group.ser = [];
  groups.push(group);
  return group;
}

function toRef(formula: unknown, numeric: boolean): JsonRecord {
  const f = String(formula ?? '');
  return numeric
    ? { numRef: { f, numCache: { formatCode: 'General' } } }
    : { strRef: { f } };
}

export function applySeriesOptions(chart: ChartLike, group: JsonRecord, ser: JsonRecord, options: JsonRecord): void {
  void chart;
  if (group.plotSurface !== undefined) {
    // DataCharts series carry `tx.txData` / `formulaObj` instead of strRef/numRef.
    if (options.name !== undefined) ser.tx = { txData: { f: { formula: String(options.name) } } };
    if (options.xValues !== undefined) ser.formulaObj = { ...(ser.formulaObj ?? {}), strDim: String(options.xValues) };
    if (options.yValues !== undefined) ser.formulaObj = { ...(ser.formulaObj ?? {}), numDim: String(options.yValues) };
    return;
  }
  const xyFamily = group.chartType === GroupType.scatter || group.chartType === GroupType.bubble;
  if (options.name !== undefined) ser.tx = { strRef: { f: String(options.name) } };
  if (options.xValues !== undefined) {
    if (xyFamily) ser.xVal = toRef(options.xValues, true);
    else ser.cat = toRef(options.xValues, false);
  }
  if (options.yValues !== undefined) {
    if (xyFamily) ser.yVal = toRef(options.yValues, true);
    else ser.val = toRef(options.yValues, true);
  }
  if (options.bubbleSizes !== undefined && group.chartType === GroupType.bubble) {
    ser.bubbleSize = toRef(options.bubbleSizes, true);
  }
  if (options.backColor !== undefined) {
    ser.spPr = ser.spPr ?? {};
    const obj = tokenToColorObject(options.backColor) ?? tokenToColorObject('accent 1 0');
    if (options.backColor === 'auto') delete ser.spPr.solidFill;
    else ser.spPr.solidFill = obj;
  }
  if (options.border !== undefined) {
    ser.spPr = ser.spPr ?? {};
    const border = options.border as JsonRecord;
    ser.spPr.ln = { ...(border.color ? { solidFill: tokenToColorObject(border.color) ?? ACCENT_SOLID(1) } : { noFill: true }), w: Number(border.width ?? 0), prstDash: Number(border.lineType ?? 0) };
    if (ser.spPr.ln.noFill) delete ser.spPr.ln.solidFill;
  }
  if (options.dataLabels !== undefined) {
    const d = options.dataLabels as JsonRecord;
    ser.dLbls = buildDataLabelEntry({
      existing: ser.dLbls, chartType: groupPublicType(group), idx: Number(ser.idx ?? 0),
      position: d.position, value: d, overwrite: true,
    });
  }
  if (typeof options.gapWidth === 'number') group.gapWidth = Math.round(options.gapWidth * 100);
  if (typeof options.overlap === 'number') group.overlap = Math.round(options.overlap * 100);
  if (typeof options.doughnutHoleSize === 'number') group.holeSize = Math.round(options.doughnutHoleSize * 100);
  if (typeof options.startAngle === 'number') group.firstSliceAng = Math.round(options.startAngle);
  if (options.invertIfNegative !== undefined) ser.invertIfNegative = !!options.invertIfNegative;
  if (options.smooth !== undefined) ser.smooth = !!options.smooth;
  if (options.symbol !== undefined) {
    const s = options.symbol as JsonRecord;
    ser.marker = { ...(ser.marker ?? {}), symbol: Number(s.shape ?? 0), size: Number(s.size ?? 7) };
  }
}

export class SeriesCollection {
  constructor(private chart: ChartLike) {}

  add(seriesOrList: JsonRecord | JsonRecord[]): void {
    const list = Array.isArray(seriesOrList) ? seriesOrList : [seriesOrList];
    let nextIdx = flattenSeries(this.chart).reduce((max, item) => Math.max(max, Number(item.ser.idx ?? -1)), -1) + 1;
    for (const options of list) {
      const chartType = Number(options?.chartType ?? this.chart.chartType());
      const axisGroup = Number(options?.axisGroup ?? 0);
      const groupBefore = groupsOf(this.chart).length;
      const group = targetGroup(this.chart, chartType, axisGroup);
      const created = this.chart._buildSeries(chartType, [toSeriesRef(options)], nextIdx, false);
      const ser = created[0];
      if (options && Object.prototype.hasOwnProperty.call(options, 'name') && ser.tx) ser.tx = { strRef: { f: String(options.name ?? '') } };
      applySeriesOptions(this.chart, group, ser, options ?? {});
      group.ser.push(ser);
      nextIdx += 1;
      this.chart._markSeriesOp(groupsOf(this.chart).length > groupBefore ? 'add-new-group' : 'add');
    }
    this.chart._markSeriesManual();
    this.chart._changed();
  }

  get(index?: number): JsonRecord | JsonRecord[] | null | undefined {
    const flat = flattenSeries(this.chart);
    if (index === undefined) return flat.map((item) => this.chart._seriesView(item.group, item.ser));
    const item = flat.find((entry, position) => Number(entry.ser.order ?? position) === Number(index));
    if (!item) return null;
    return this.chart._seriesView(item.group, item.ser);
  }

  remove(index: number): void {
    const flat = flattenSeries(this.chart);
    const item = flat.find((entry, position) => Number(entry.ser.order ?? position) === Number(index));
    if (!item) return;
    const list: JsonRecord[] = item.group.ser;
    list.splice(list.indexOf(item.ser), 1);
    if (!list.length) {
      const groups = groupsOf(this.chart);
      groups.splice(groups.indexOf(item.group), 1);
    }
    reindexOrders(this.chart);
    this.chart._markSeriesManual();
    this.chart._markSeriesOp('remove');
    this.chart._changed();
  }

  set(index: number, series: JsonRecord): void {
    const flat = flattenSeries(this.chart);
    const item = flat.find((entry, position) => Number(entry.ser.order ?? position) === Number(index));
    if (!item || !series) return;
    applySeriesOptions(this.chart, item.group, item.ser, series);
    this.chart._markSeriesManual();
    // Only ref-carrying sets break the trial's internal dataRange cache.
    const touchesRefs = series.name !== undefined || series.xValues !== undefined || series.yValues !== undefined;
    if (touchesRefs) this.chart._markSeriesOp('set');
    this.chart._changed();
  }

  all(): JsonRecord[] {
    return flattenSeries(this.chart).map(entry => this.chart._seriesView(entry.group, entry.ser));
  }
}

function toSeriesRef(options: JsonRecord): { name: string, category: string, value: string } {
  return { name: String(options?.name ?? ''), category: String(options?.xValues ?? ''), value: String(options?.yValues ?? '') };
}
