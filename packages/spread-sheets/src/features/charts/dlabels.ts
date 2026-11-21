/**
 * Data-label entries inside the chartSpace (`dLbls`). Measured black-box from
 * the trial: creating an entry writes a compact form; a second write expands
 * every series to the full template (numFmt + spPr + txPr). Chart-level sets
 * only ever turn flags ON (passing false keeps the previous value), while a
 * series-level `set()` writes the flags as given. Only the first pie series
 * carries leader lines; pie/doughnut series all carry the ext-list.
 */
import type { JsonRecord } from './types.js';
import { userColorToObject } from './tokens.js';

export function typeDefaultLabelPosition(chartType: number): number {
  if (chartType === 10 || chartType === 3) return 0;
  if (chartType === 9 || chartType === 26 || (chartType >= 24 && chartType <= 28)) return 7;
  if (chartType === 1 || (chartType >= 33 && chartType <= 36)) return 7;
  if (chartType === 8 || chartType === 37 || chartType === 38) return 2; // area: getter default
  return 6;
}

/**
 * Trial-measured position normalisation: each family rejects the positions it
 * cannot render and maps them onto a supported one (the JSON is written with
 * the MAPPED value; `undefined` means the trial omits `dLblPos` entirely).
 */
const POSITION_BY_TYPE: Record<number, Record<number, number> | null> = {
  // column family (clustered/stacked/100%)
  12: { 0: 6, 1: 6, 5: 4, 7: 6, 8: 6 },
  13: { 0: 6, 1: 6, 5: 4, 7: 6, 8: 6 },
  14: { 0: 6, 1: 6, 5: 4, 7: 6, 8: 6 },
  60: { 0: 6, 1: 6, 5: 4, 7: 6, 8: 6 },
  // horizontal bar family
  18: { 0: 6, 1: 6, 5: 4, 7: 4, 8: 4 },
  19: { 0: 6, 1: 6, 5: 4, 7: 4, 8: 4 },
  20: { 0: 6, 1: 6, 5: 4, 7: 4, 8: 4 },
  // line family
  9: { 0: 7, 4: 2, 6: 2 }, 26: { 0: 7, 4: 2, 6: 2 },
  24: { 0: 7, 4: 2, 6: 2 }, 27: { 0: 7, 4: 2, 6: 2 },
  25: { 0: 7, 4: 2, 6: 2 }, 28: { 0: 7, 4: 2, 6: 2 },
  // scatter family
  1: { 0: 7, 6: 2 }, 33: { 0: 7, 6: 2 }, 34: { 0: 7, 6: 2 }, 35: { 0: 7, 6: 2 }, 36: { 0: 7, 6: 2 },
  // pie family
  10: { 1: 0, 3: 0, 8: 6 }, 3: { 1: 0, 3: 0, 8: 6 },
  // area family: the trial never writes dLblPos
  8: null, 37: null, 38: null,
};

export function normalizeLabelPosition(chartType: number, position: number): number | undefined {
  const map = POSITION_BY_TYPE[Number(chartType)];
  if (map === undefined) return position;
  if (map === null) return undefined;
  return map[position] ?? position;
}

const LEADER_LINES = { spPr: { ln: { solidFill: { schemeClr: { val: 1, lumMod: [35000], lumOff: [65000] } }, w: 1 } } };
const EXT_LST = { ext: [{ uri: '{CE6537A1-D6FC-4f65-9D91-7224C49458BB}', showLeaderLines: true }] };
const SP_PR = { noFill: true, ln: { noFill: true } };

function labelTxPr(): JsonRecord {
  const rPr: JsonRecord = { latin: { typeface: 'Calibri' }, sz: 13.33, b: false, solidFill: { srgbClr: { val: [89, 89, 89] } } };
  return { p: [{ elements: [{ elementType: 0, t: '', rPr }], pPr: { defRPr: { ...rPr } }, endParaRPr: {} }] };
}

export interface DataLabelWrite {
  /** Existing per-series entry (undefined when the series has none yet). */
  existing?: JsonRecord | null;
  chartType: number;
  /** Series `idx` — the first pie series gets the leader-line extras. */
  idx: number;
  position?: number;
  value: JsonRecord;
  /** `false` flags overwrite (series `set()`); chart-level keeps old values. */
  overwrite?: boolean;
}

/** Builds the new `ser.dLbls` node for one series. */
export function buildDataLabelEntry(w: DataLabelWrite): JsonRecord {
  const pie = w.chartType === 10 || w.chartType === 3;
  const existing = w.existing ?? null;
  const create = existing === null;
  const flag = (optKey: string, jsonKey: string): boolean => {
    if (w.value[optKey] === true) return true;
    if (w.overwrite) return !!w.value[optKey];
    return existing ? !!existing[jsonKey] : false;
  };
  const entry: JsonRecord = {};
  // numFmt / txPr expansion on re-write happens for pie-family only, and only
  // when the options object carries a `format` (the trial's getter proxy does).
  const expand = !create && pie && w.value.format !== undefined;
  const numFmt = existing?.numFmt ? { ...(existing.numFmt as JsonRecord) } : null;
  if (w.value.format && w.value.format !== 'General') entry.numFmt = { formatCode: String(w.value.format), sourceLinked: false };
  else if (numFmt) entry.numFmt = numFmt;
  else if (expand) entry.numFmt = { formatCode: 'General' };
  if (entry.numFmt && w.value.numberFormatLinked === false) entry.numFmt.sourceLinked = false;
  if (!create || (!pie || w.idx === 0)) entry.spPr = existing?.spPr ? { ...(existing.spPr as JsonRecord) } : { ...SP_PR };
  // Font/colour options write a `txPr` run-properties template (trial: the
  // latin typeface stays `+mn-lt`, the colour becomes srgbClr); a plain
  // rewrite preserves the existing template.
  const styled = w.value.fontSize !== undefined || w.value.fontBold !== undefined || w.value.color !== undefined || w.value.fontFamily !== undefined;
  if (styled) {
    const old = existing?.txPr as JsonRecord | undefined;
    const oldRPr = (old?.p?.[0]?.elements?.[0]?.rPr ?? {}) as JsonRecord;
    const rPr: JsonRecord = {
      latin: { typeface: String(w.value.fontFamily ?? oldRPr.latin?.typeface ?? '+mn-lt') },
      ...(w.value.fontSize !== undefined ? { sz: Number(w.value.fontSize) } : oldRPr.sz !== undefined ? { sz: oldRPr.sz } : {}),
      b: w.value.fontBold !== undefined ? !!w.value.fontBold : !!oldRPr.b,
    };
    const fill = w.value.color !== undefined ? userColorToObject(w.value.color)
      : oldRPr.solidFill ? oldRPr.solidFill : { schemeClr: { val: 1, lumMod: [65000], lumOff: [35000] } };
    if (fill) rPr.solidFill = fill;
    entry.txPr = { p: [{ elements: [{ elementType: 0, t: '', rPr }], pPr: { defRPr: { ...rPr } }, endParaRPr: {} }] };
  }
  else if (expand) entry.txPr = existing?.txPr ?? labelTxPr();
  else if (existing?.txPr) entry.txPr = existing.txPr;
  const posIn = w.position !== undefined ? Number(w.position) : Number(existing?.dLblPos ?? typeDefaultLabelPosition(w.chartType));
  const pos = normalizeLabelPosition(w.chartType, posIn);
  if (pos !== undefined) entry.dLblPos = pos;
  entry.showLeaderLines = pie;
  entry.showBubbleSize = false;
  entry.showLegendKey = false;
  entry.showPercent = flag('showPercentage', 'showPercent');
  entry.showCatName = flag('showCategoryName', 'showCatName');
  entry.showSerName = flag('showSeriesName', 'showSerName');
  entry.showVal = flag('showValue', 'showVal');
  entry.separator = w.value.separator ?? existing?.separator ?? ', ';
  if (pie) {
    entry.extLst = { ext: [{ ...EXT_LST.ext[0] }] };
    if (w.idx === 0) entry.leaderLines = existing?.leaderLines ? { ...(existing.leaderLines as JsonRecord) } : JSON.parse(JSON.stringify(LEADER_LINES));
  }
  if (!pie) delete (entry as Record<string, unknown>).extLst;
  return entry;
}

/** The trial stamps `plotArea.spPr.ln = {noFill}` when the chart re-lays-out. */
export function refreshPlotAreaSpPr(space: JsonRecord): void {
  const spPr = space?.chart?.plotArea?.spPr;
  if (spPr && !spPr.ln) spPr.ln = { noFill: true };
  /* TASK 75 r5: a DataChart's plot surface carries the same no-line marker once the chart has
   * been laid out (the Designer sweep snapshots ~250 ms after the gallery insert). */
  const surface = space?.chart?.plotArea?.plotAreaRegion?.plotSurface as JsonRecord | undefined;
  if (surface?.spPr && !surface.spPr.ln) surface.spPr.ln = { noFill: true };
}
