/**
 * Conversions between the public option objects (`title()`, `legend()`,
 * `axes()`, `chartArea()`, `plotArea()`, `dataLabels()`) and the canonical
 * chartSpace JSON. Default getter objects were measured from the trial.
 */
import type { JsonRecord } from './types.js';
import { GETTER_DEFAULTS, TEXT_COLOR, txPr } from './defaults.js';
import { colorObjectToGetter, tokenToColorObject, userColorToObject } from './tokens.js';

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

function firstText(container: JsonRecord | undefined): string {
  return String(container?.p?.[0]?.elements?.[0]?.t ?? '');
}

function rPrOf(container: JsonRecord | undefined): JsonRecord | undefined {
  return container?.p?.[0]?.elements?.[0]?.rPr;
}

function richText(space: JsonRecord, text: string, sz: number | undefined, colorObj: JsonRecord): JsonRecord {
  const rPr: JsonRecord = { latin: { typeface: '+mn-lt' }, ...(sz === undefined ? {} : { sz }), b: false, solidFill: clone(colorObj) };
  return { p: [{ elements: [{ elementType: 0, t: text, rPr }], pPr: { defRPr: { ...rPr } }, endParaRPr: {} }], bodyPr: {}, lstStyle: {} };
}

export function autoTitleText(space: JsonRecord, resolve?: (ref: string) => string): string {
  // Box-whisker (trial quirk): its getter reports the first series name as the
  // (still default-looking) chart title.
  const region = space.chart?.plotArea?.plotAreaRegion as JsonRecord | undefined;
  if (region && resolve && Number(region.series?.[0]?.layoutId) === 16) {
    const f = region.series[0]?.tx?.txData?.f?.formula;
    if (f) return resolve(String(f)) || 'Chart Title';
  }
  const groups = space.chart.plotArea.chartGroups ?? [];
  const isPie = groups.some((g: JsonRecord) => g.chartType === 10);
  // TASK 53 measured on the trial (`.probe/t53/probe-chart-bars.json`): a chart whose data collapses
  // to a SINGLE series reports (and paints) that series' name as its title - e.g. `A1:B4`
  // columnClustered titles itself "Q1", `A1:D2` titles itself "Apples" - while multi-series charts
  // keep "Chart Title". The pie family uses the first series name for any series count (already
  // measured), box-whisker above.
  const seriesCount = groups.reduce((total: number, g: JsonRecord) => total + (g.ser?.length ?? 0), 0);
  if ((isPie || seriesCount === 1) && resolve) {
    // Only a series NAME counts: a headless single series (no `tx`, measured in the TASK 54
    // `single-row`/`single-col` cases — a one-line numeric selection `A1:D1`/`A1:A4`) keeps the
    // default `Chart Title`; the single-series titles the trial reports all carry a `tx`.
    const name = groups[0]?.ser?.[0]?.tx?.strRef?.f;
    if (name) return resolve(String(name)) || 'Chart Title';
  }
  return 'Chart Title';
}

/** `chart.title()` getter. */
export function getTitle(space: JsonRecord, loaded: boolean, resolve?: (ref: string) => string): JsonRecord {
  const out = clone(GETTER_DEFAULTS.title);
  const title = space.chart.title;
  const container = title?.tx?.rich ?? title?.txPr;
  const text = firstText(container);
  const regionSpace = !!space.chart?.plotArea?.plotAreaRegion && !title?.tx;
  out.text = text && !regionSpace ? text : autoTitleText(space, resolve);
  const rPr = rPrOf(container);
  out.fontSize = Number(rPr?.sz ?? 18.67);
  if (rPr?.solidFill) {
    const getter = colorObjectToGetter(rPr.solidFill);
    out.color = loaded || getter === 'rgb(89,89,89)' ? getter : 'rgb(89,89,89)';
  }
  if (title?.tx) out.bold = !!rPr?.b;
  if (title?.spPr?.solidFill) out.backColor = colorObjectToGetter(title.spPr.solidFill);
  return out;
}

/** `chart.title({...})` setter: writes `tx.rich` (trial behaviour). */
export function setTitle(space: JsonRecord, options: JsonRecord): void {
  const title = space.chart.title ??= {};
  const oldRPr = rPrOf(title.tx?.rich ?? title.txPr);
  const sz = options.fontSize !== undefined ? Number(options.fontSize) : Number(oldRPr?.sz ?? 18.67);
  const colorObj = options.color !== undefined ? (tokenToColorObject(options.color) ?? colorOfCss(options.color))
    : (oldRPr?.solidFill ?? { schemeClr: { ...TEXT_COLOR } });
  const text = options.text !== undefined ? String(options.text) : firstText(title.tx?.rich ?? title.txPr);
  title.tx = { rich: richText(space, text, sz, colorObj) };
  delete title.txPr;
  const rPr = title.tx.rich.p[0].elements[0].rPr;
  void rPr;
  if (options.fontFamily !== undefined) rPr.latin = { typeface: String(options.fontFamily) };
  if (options.backColor !== undefined) {
    title.spPr = title.spPr ?? {};
    const back = tokenToColorObject(options.backColor) ?? colorOfCss(options.backColor);
    if (options.backColor === 'transparent' || !back) title.spPr.noFill = true;
    else { delete title.spPr.noFill; title.spPr.solidFill = back; }
  }
}

function colorOfCss(css: unknown): JsonRecord | null { return tokenToColorObject(String(css ?? '')); }

export function getLegend(space: JsonRecord, loaded = false): JsonRecord {
  const legend = space.chart.legend;
  // With no legend node the trial reports only visibility + position + a null border.
  if (!legend) return { visible: false, position: 2, borderStyle: null };
  const out = clone(GETTER_DEFAULTS.legend);
  if (loaded) out.borderStyle = { transparency: 0, color: '', dashStyle: 0 };
  out.position = Number(legend.legendPos ?? 4);
  if (legend.txPr) out.fontSize = Number(rPrOf(legend.txPr)?.sz ?? 12);
  if (legend.spPr?.solidFill) out.backColor = colorObjectToGetter(legend.spPr.solidFill);
  return out;
}

export function setLegend(space: JsonRecord, options: JsonRecord): void {
  const visible = options.visible === undefined ? true : !!options.visible;
  if (!visible) { delete space.chart.legend; return; }
  if (space.chart.legend === undefined && options.visible === true) {
    space.chart.legend = { legendPos: Number(options.position ?? 2), spPr: { noFill: true, ln: { noFill: true } }, txPr: txPr(12, true) };
  }
  const legend = space.chart.legend ??= { legendPos: 4, spPr: { noFill: true, ln: { noFill: true } }, txPr: txPr(12, true) };
  if (options.position !== undefined) legend.legendPos = Number(options.position);
  if (options.fontSize !== undefined) setTxSize(legend.txPr, Number(options.fontSize));
  if (options.backColor !== undefined) {
    const back = userColorToObject(options.backColor);
    if (!back) legend.spPr = { ...(legend.spPr ?? {}), noFill: true };
    else { delete legend.spPr?.noFill; legend.spPr = { ...(legend.spPr ?? {}), solidFill: back }; }
  }
}

function setTxSize(container: JsonRecord | undefined, size: number): void {
  if (!container?.p?.[0]) return;
  const p = container.p[0];
  if (p.elements?.[0]?.rPr) p.elements[0].rPr.sz = size;
  if (p.pPr?.defRPr) p.pPr.defRPr.sz = size;
}

export function getAxes(space: JsonRecord, loaded = false): JsonRecord {
  // DataCharts types (53..59) report a fixed default category+value pair no
  // matter what the (minimal) `plotAreaRegion.axes` carry (trial-measured).
  if (space.chart?.plotArea?.plotAreaRegion) {
    const base = (): JsonRecord => ({
      visible: true, tickLabelPosition: 2, format: 'General', numberFormatLinked: true,
      majorTickPosition: 2, minorTickPosition: 2,
      majorGridLine: { visible: false }, minorGridLine: { visible: false },
      title: { text: '' },
      style: { color: 'rgb(89,89,89)', fontFamily: 'Calibri', fontSize: 12, transparency: 0 },
      lineStyle: { color: 'text 1 85', width: 1, transparency: 0 },
      scaling: { orientation: 0 }, crossPoint: 'auto',
    });
    const category = base();
    category.categoryType = 0;
    const value = base();
    value.majorGridLine = { width: 1, transparency: 0, color: 'rgb(217,217,217)', dashStyle: 0, visible: true };
    return { primaryCategory: category, primaryValue: value };
  }
  const out: JsonRecord = {};
  for (const axis of space.chart.plotArea.axes ?? []) {
    const role = Number(axis.AxisGroup) === 1 ? 'secondary' : 'primary';
    // Scatter charts have two value axes; the x-axis is reported as category.
    const kind = Number(axis.axisType) === 0 || Number(axis.AxisType) === 0 ? 'Category' : 'Value';
    const value: JsonRecord = {
      visible: !axis.delete,
      tickLabelPosition: Number(axis.tickLblPos ?? 2),
      format: axis.numFmt?.formatCode ?? 'General',
      numberFormatLinked: axis.numFmt?.sourceLinked !== false,
      majorTickPosition: Number(axis.majorTickMark ?? 2),
      minorTickPosition: Number(axis.minorTickMark ?? 2),
      majorGridLine: axis.majorGridlines
        ? {
          width: Number(axis.majorGridlines.spPr?.ln?.w ?? 1), transparency: 0,
          color: colorObjectToGetter(axis.majorGridlines.spPr?.ln?.solidFill) || 'rgb(217,217,217)',
          dashStyle: Number(axis.majorGridlines.spPr?.ln?.prstDash ?? 0), visible: true,
        }
        : { visible: false },
      minorGridLine: axis.minorGridlines
        ? {
          width: Number(axis.minorGridlines.spPr?.ln?.w ?? 1), transparency: 0,
          color: colorObjectToGetter(axis.minorGridlines.spPr?.ln?.solidFill) || 'rgb(242,242,242)',
          dashStyle: Number(axis.minorGridlines.spPr?.ln?.prstDash ?? 0), visible: true,
        }
        : { visible: false },
      title: axis.title ? {
        text: firstText(axis.title.tx?.rich ?? axis.title.txPr),
        color: colorObjectToGetter(rPrOf(axis.title.tx?.rich ?? axis.title.txPr)?.solidFill?.srgbClr ? rPrOf(axis.title.tx?.rich ?? axis.title.txPr)!.solidFill : undefined) || 'rgb(89,89,89)',
        fontFamily: 'Calibri', fontSize: Number(rPrOf(axis.title.tx?.rich ?? axis.title.txPr)?.sz ?? 13.33), transparency: 0,
      } : { text: '' },
      style: loaded ? { color: 'text 1 35', fontFamily: 'Calibri', fontSize: 12, transparency: 0 } : clone(GETTER_DEFAULTS.axisStyle),
      lineStyle: clone(GETTER_DEFAULTS.axisLine),
    };
    if (kind === 'Category') value.categoryType = Number(axis.AxisType ?? 0);
    if (axis.txPr) {
      value.style.fontSize = Number(rPrOf(axis.txPr)?.sz ?? 12);
      const styleFill = rPrOf(axis.txPr)?.solidFill;
      if (styleFill?.srgbClr) value.style.color = colorObjectToGetter(styleFill) || value.style.color;
    }
    if (axis.spPr?.ln?.solidFill) value.lineStyle.color = colorObjectToGetter(axis.spPr.ln.solidFill) || value.lineStyle.color;
    // An invisible axis line (`ln {noFill:true}`, e.g. the radar value axis)
    // reads back as an empty colour (trial).
    else if (axis.spPr?.ln?.noFill) value.lineStyle.color = '';
    value.scaling = { orientation: Number(axis.scaling?.orientation ?? 1) === 1 ? 0 : 1 };
    if (axis.scaling?.logBase !== undefined) value.scaling.logBase = axis.scaling.logBase;
    if (kind === 'Category') {
      value.crossPoint = Number(axis.crosses ?? 1) === 1 ? 'auto' : Number(axis.crosses) === 2 ? 'min' : 'max';
      // The trial reports a category axis' crossPoint from the paired value axis.
      const pair = (space.chart.plotArea.axes ?? []).find((a: JsonRecord) => a.axId === axis.crossAx);
      if (Number(pair?.crosses) === 2) value.crossPoint = 'max';
    } else {
      value.crossPoint = Number(axis.crosses) === 3 ? 'max' : 'auto';
    }
    if (axis.scaling?.min !== undefined) value.min = axis.scaling.min;
    if (axis.scaling?.max !== undefined) value.max = axis.scaling.max;
    if (axis.majorUnit !== undefined) value.majorUnit = axis.majorUnit;
    if (axis.minorUnit !== undefined) value.minorUnit = axis.minorUnit;
    if (axis.displayUnits !== undefined) value.displayUnit = axis.displayUnits;
    if (axis.tickLblSkip !== undefined) value.tickLabelSpacing = axis.tickLblSkip;
    if (axis.spPr?.ln?.w !== undefined) value.lineStyle.width = Number(axis.spPr.ln.w);
    out[`${role}${kind}`] = value;
  }
  return out;
}

export function setAxes(space: JsonRecord, options: JsonRecord): void {
  const axes: JsonRecord[] = space.chart.plotArea.axes ??= [];
  // Trial behaviour: every axes() call drops the numeric overrides that were
  // set by earlier calls (scaling.min/max and majorUnit come back as null).
  for (const axis of axes) {
    axis.scaling = { orientation: Number(axis.scaling?.orientation ?? 1) };
    delete axis.majorUnit;
    delete axis.minorUnit;
  }
  for (const [key, rawValue] of Object.entries(options ?? {})) {
    const value = rawValue as JsonRecord;
    const secondary = key.startsWith('secondary');
    const category = key.endsWith('Category');
    const axis = axes.find(a => (Number(a.AxisGroup) === 1) === secondary
      && (Number(a.axisType) === 0) === category);
    if (!axis) continue;
    if (value.visible !== undefined) axis.delete = !value.visible;
    if (value.tickLabelPosition !== undefined) axis.tickLblPos = Number(value.tickLabelPosition);
    if (value.majorTickPosition !== undefined) axis.majorTickMark = Number(value.majorTickPosition);
    if (value.minorTickPosition !== undefined) axis.minorTickMark = Number(value.minorTickPosition);
    if (value.format !== undefined) axis.numFmt = { ...(axis.numFmt ?? {}), formatCode: String(value.format), sourceLinked: axis.numFmt?.sourceLinked ?? false };
    if (value.numberFormatLinked !== undefined) axis.numFmt = { ...(axis.numFmt ?? {}), sourceLinked: !!value.numberFormatLinked };
    if (value.majorUnit !== undefined) axis.majorUnit = Number(value.majorUnit);
    if (value.minorUnit !== undefined) axis.minorUnit = Number(value.minorUnit);
    if (value.min !== undefined) axis.scaling = { ...(axis.scaling ?? {}), min: Number(value.min) };
    if (value.max !== undefined) axis.scaling = { ...(axis.scaling ?? {}), max: Number(value.max) };
    if (value.scaling?.orientation !== undefined) axis.scaling = { ...(axis.scaling ?? {}), orientation: Number(value.scaling.orientation) === 1 ? 0 : 1 };
    if (value.scaling?.logBase !== undefined) axis.scaling = { ...(axis.scaling ?? {}), logBase: Number(value.scaling.logBase) };
    if (value.crossPoint !== undefined) axis.crosses = value.crossPoint === 'auto' ? 1 : value.crossPoint === 'min' ? 2 : 3;
    if (value.majorGridLine) {
      const grid = value.majorGridLine as JsonRecord;
      if (grid.visible === false) delete axis.majorGridlines;
      else {
        const node = (axis.majorGridlines ??= { spPr: { ln: { solidFill: { srgbClr: { val: [217, 217, 217] } }, w: 1 }, effectLst: {} } });
        const ln = (node.spPr.ln ??= {});
        if (grid.width !== undefined) ln.w = Number(grid.width);
        if (grid.color !== undefined) { const obj = userColorToObject(grid.color); if (obj) { delete ln.noFill; ln.solidFill = obj; } }
      }
    }
    if (value.minorGridLine) {
      const grid = value.minorGridLine as JsonRecord;
      if (grid.visible === false) delete axis.minorGridlines;
      else {
        const node = (axis.minorGridlines ??= { spPr: { ln: { solidFill: { srgbClr: { val: [242, 242, 242] } }, w: 1 }, effectLst: {} } });
        const ln = (node.spPr.ln ??= {});
        if (grid.width !== undefined) ln.w = Number(grid.width);
        if (grid.color !== undefined) { const obj = userColorToObject(grid.color); if (obj) { delete ln.noFill; ln.solidFill = obj; } }
      }
    }
    if (value.lineStyle) {
      const line = value.lineStyle as JsonRecord;
      axis.spPr = axis.spPr ?? {};
      axis.spPr.ln = axis.spPr.ln ?? {};
      if (line.width !== undefined) axis.spPr.ln.w = Number(line.width);
      if (line.color !== undefined) {
        const obj = userColorToObject(line.color);
        if (obj) { delete axis.spPr.ln.noFill; axis.spPr.ln.solidFill = obj; }
        else if (line.color === '' || line.color === 'transparent') { delete axis.spPr.ln.solidFill; axis.spPr.ln.noFill = true; }
      }
    }
    if (value.style?.fontSize !== undefined) setTxSize(axis.txPr, Number(value.style.fontSize));
    if (value.style?.color !== undefined) {
      const obj = userColorToObject(value.style.color);
      if (obj && axis.txPr?.p?.[0]) {
        const p = axis.txPr.p[0];
        for (const target of [p.elements?.[0]?.rPr, p.pPr?.defRPr]) if (target) target.solidFill = JSON.parse(JSON.stringify(obj));
      }
    }
    if (value.title && (value.title.text !== undefined || value.title.fontSize !== undefined || value.title.color !== undefined || value.title.bold !== undefined)) {
      axis.title = axis.title ?? {};
      axis.title.overlay = false;
      const oldRPr = rPrOf(axis.title.tx?.rich ?? axis.title.txPr);
      const sz = value.title.fontSize !== undefined ? Number(value.title.fontSize) : undefined;
      const colorObj = value.title.color !== undefined ? (userColorToObject(value.title.color) ?? { schemeClr: { ...TEXT_COLOR } })
        : (oldRPr?.solidFill ?? { schemeClr: { ...TEXT_COLOR } });
      const text = value.title.text !== undefined ? String(value.title.text) : firstText(axis.title.tx?.rich ?? axis.title.txPr);
      axis.title.tx = { rich: richText(space, text, sz, colorObj) };
      delete axis.title.txPr;
    }
  }
}
