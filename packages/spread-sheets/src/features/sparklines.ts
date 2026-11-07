import { Range, clone } from '../primitives.js';
import type { Worksheet } from '../model.js';
import { resolveColor } from '../colors.js';
import type { JsonRecord } from '../serialization.js';
export type SparklineOptions = Record<string, string | number | boolean>;
export const sparklineDefaults: SparklineOptions = {
  axisColor: 'black', firstMarkerColor: '#95b3d7', highMarkerColor: 'Blue', lastMarkerColor: '#95b3d7', lowMarkerColor: 'Blue',
  markersColor: '#244062', negativeColor: 'Brown', seriesColor: '#244062', displayEmptyCellsAs: 0, rightToLeft: false,
  displayHidden: false, displayXAxis: false, showFirst: false, showHigh: false, showLast: false, showLow: false,
  showNegative: false, showMarkers: false, manualMax: 0, manualMin: 0, maxAxisType: 0, minAxisType: 0,
  groupMaxValue: -Number.MAX_VALUE, groupMinValue: Number.MAX_VALUE, lineWeight: 1,
};
export class SparklineSetting {
  options: SparklineOptions;
  constructor(setting: SparklineOptions = {}) { this.options = { ...sparklineDefaults, ...setting }; }
  clone(): SparklineSetting { return new SparklineSetting({ ...this.options }); }
  toJSON(): JsonRecord { return Object.fromEntries(Object.entries(this.options).filter(([key, value]) => key.startsWith('group') || value !== sparklineDefaults[key])); }
  fromJSON(json: object): void { this.options = { ...sparklineDefaults, ...json }; }
}
export function sparklineRange(input: Range | string): { range: Range; sheetName: string | null } {
  if (typeof input !== 'string') return { range: new Range(input.row, input.col, input.rowCount, input.colCount), sheetName: null };
  const match = /^(?:(?:'((?:[^']|'')+)'|([^!]+))!)?\$?([A-Z]+)\$?(\d+)(?::\$?([A-Z]+)\$?(\d+))?$/i.exec(input);
  if (!match) throw new Error('Invalid sparkline data reference');
  const col = (letters: string) => [...letters.toUpperCase()].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;
  const r1 = Number(match[4]) - 1, c1 = col(match[3]), r2 = Number(match[6] ?? match[4]) - 1, c2 = col(match[5] ?? match[3]);
  return { range: new Range(Math.min(r1, r2), Math.min(c1, c2), Math.abs(r2 - r1) + 1, Math.abs(c2 - c1) + 1), sheetName: (match[1] ?? match[2])?.replaceAll("''", "'") ?? null };
}
export class Sparkline {
  row: number; column: number;
  _sheet?: Worksheet;
  private reference: Range;
  private sheetName: string | null = null;
  private orientation: number;
  private axis?: Range;
  private axisOrientation = 1;
  private displayAxis = false;
  private owner: SparklineGroup;
  constructor(row = 0, column = 0, dataReference = new Range(0, 0, 1, 1), dataOrientation = 0, type = 0, setting = new SparklineSetting()) {
    this.row = row; this.column = column; this.reference = dataReference; this.orientation = dataOrientation;
    this.owner = new SparklineGroup(type, setting); this.owner.add(this);
  }
  private changed(): void { this._sheet?._view()?.schedule(); }
  _reference(input: Range | string): void { const ref = sparklineRange(input); this.reference = ref.range; this.sheetName = ref.sheetName; }
  data(value?: Range): Range | this { if (value === undefined) return this.reference; this.reference = value; this.changed(); return this; }
  dataOrientation(value?: number): number | this { if (value === undefined) return this.orientation; this.orientation = value; this.changed(); return this; }
  dateAxisData(value?: Range): Range | undefined | this { if (value === undefined) return this.axis; this.axis = value; this.displayAxis = true; this.changed(); return this; }
  dateAxisOrientation(value?: number): number | this { if (value === undefined) return this.axisOrientation; this.axisOrientation = value; this.changed(); return this; }
  displayDateAxis(value?: boolean): boolean | this { if (value === undefined) return this.displayAxis; this.displayAxis = value; this.changed(); return this; }
  group(value?: SparklineGroup): SparklineGroup | this { if (value === undefined) return this.owner; this.owner = value; this.changed(); return this; }
  setting(value?: SparklineSetting): SparklineSetting | this { if (value === undefined) return this.owner.setting; this.owner.setting = value; this.changed(); return this; }
  sparklineType(value?: number): number | this { if (value === undefined) return this.owner.sparklineType; this.owner.sparklineType = value; this.changed(); return this; }
  clone(): Sparkline { const s = new Sparkline(this.row, this.column, clone(this.reference), this.orientation, this.owner.sparklineType, this.owner.setting.clone()); s.axis = this.axis && clone(this.axis); s.axisOrientation = this.axisOrientation; s.displayAxis = this.displayAxis; s.sheetName = this.sheetName; return s; }
  _values(): (number | null)[] {
    const sheet = this.sheetName ? this._sheet?.getParent()?.getSheetFromName(this.sheetName) : this._sheet;
    if (!sheet) return [];
    const range = this.reference, values: (number | null)[] = [];
    const count = this.orientation === 0 ? range.rowCount : range.colCount;
    for (let i = 0; i < count; i++) { const row = range.row + (this.orientation === 0 ? i : 0), col = range.col + (this.orientation === 1 ? i : 0); if (!this.owner.setting.options.displayHidden && (!sheet.getRowVisible(row) || !sheet.getColumnVisible(col))) continue; const value = sheet.getValue(row, col); values.push(typeof value === 'number' && Number.isFinite(value) ? value : null); }
    return values;
  }
  paintSparkline(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void { paintSparkline(ctx, this._values(), this.owner.sparklineType, this.owner.setting.options, x, y, w, h, this.owner.setting.options.minAxisType === 1 || this.owner.setting.options.maxAxisType === 1 ? this.owner._members.flatMap(s => s._values()).filter((n): n is number => n !== null) : []); }
  toJSON(): JsonRecord {
    const result: JsonRecord = { row: this.row, col: this.column, orientation: this.orientation, data: { row: this.reference.row, col: this.reference.col, rowCount: this.reference.rowCount, colCount: this.reference.colCount, sheetName: this.sheetName } };
    if (this.axis) { result.dateAxisData = { row: this.axis.row, col: this.axis.col, rowCount: this.axis.rowCount, colCount: this.axis.colCount, sheetName: null }; result.dateAxisOrientation = this.axisOrientation; result.displayDateAxis = this.displayAxis; }
    return result;
  }
  static fromJSON(json: JsonRecord, type: number, setting: SparklineSetting): Sparkline {
    const data = json.data as JsonRecord; const spark = new Sparkline(Number(json.row), Number(json.col), new Range(Number(data.row), Number(data.col), Number(data.rowCount), Number(data.colCount)), Number(json.orientation), type, setting);
    spark.sheetName = data.sheetName as string | null; const axis = json.dateAxisData as JsonRecord | undefined;
    if (axis) spark.axis = new Range(Number(axis.row), Number(axis.col), Number(axis.rowCount), Number(axis.colCount));
    spark.axisOrientation = Number(json.dateAxisOrientation ?? 1); spark.displayAxis = !!json.displayDateAxis; return spark;
  }
}
export class SparklineGroup {
  _members: Sparkline[] = [];
  sparklineType = 0;
  setting = new SparklineSetting();
  constructor(type = 0, setting = new SparklineSetting()) { this.sparklineType = type; this.setting = setting; }
  add(item: Sparkline): void { if (this.contains(item)) return; const old = item.group() as SparklineGroup; if (old && old !== this) old.remove(item); this._members.push(item); item.group(this); }
  remove(item: Sparkline): Sparkline[] { this._members = this._members.filter(s => s !== item); return [...this._members]; }
  contains(item: Sparkline): boolean { return this._members.includes(item); }
  count(): number { return this._members.length; }
  clone(): SparklineGroup { const group = new SparklineGroup(this.sparklineType, this.setting.clone()); this._members.forEach(s => group.add(s.clone())); return group; }
  dateAxisData(value?: Range): unknown { if (value === undefined) return this._members[0]?.dateAxisData(); this._members.forEach(s => s.dateAxisData(value)); return this; }
  dateAxisOrientation(value?: number): unknown { if (value === undefined) return this._members[0]?.dateAxisOrientation(); this._members.forEach(s => s.dateAxisOrientation(value)); return this; }
  toJSON(): JsonRecord { return { setting: this.setting.toJSON(), sparklineType: this.sparklineType, sparklines: this._members.map(s => s.toJSON()) }; }
}
export function paintSparkline(ctx: CanvasRenderingContext2D, data: (number | null)[], type: number, settings: SparklineOptions, x: number, y: number, w: number, h: number, groupValues: number[] = []): void {
  const values = settings.displayEmptyCellsAs === 1 ? data.map(n => n ?? 0) : data;
  const numeric = values.filter((n): n is number => n !== null);
  if (!numeric.length) return;
  const min = settings.minAxisType === 2 ? Number(settings.manualMin) : Math.min(...(settings.minAxisType === 1 && groupValues.length ? groupValues : numeric));
  const max = settings.maxAxisType === 2 ? Number(settings.manualMax) : Math.max(...(settings.maxAxisType === 1 && groupValues.length ? groupValues : numeric));
  // Reserve the cell's trailing grid pixel as well as the chart inset. Bars
  // use a smaller inset than lines, whose markers need extra breathing room.
  const inset = type === 0 ? 4 : 2, left = x + inset, top = y + inset;
  const width = Math.max(0, w - (type === 0 ? 10 : 5)), height = Math.max(0, h - inset * 2 - 1);
  const lo = type === 0 ? min : Math.min(0, min), hi = type === 0 ? max : Math.max(0, max);
  const scale = (n: number) => top + height - (n - lo) / (hi === lo ? 1 : hi - lo) * height;
  const base = type === 2 ? top + height / 2 : Math.max(top, Math.min(top + height, scale(0)));
  const color = (value: number, index: number) => settings.showLow && value === min ? settings.lowMarkerColor : settings.showHigh && value === max ? settings.highMarkerColor : settings.showFirst && index === 0 ? settings.firstMarkerColor : settings.showLast && index === values.length - 1 ? settings.lastMarkerColor : settings.showNegative && value < 0 ? settings.negativeColor : type === 0 ? settings.markersColor : settings.seriesColor;
  ctx.save(); ctx.beginPath(); ctx.rect(x, y, w - 1, h - 1); ctx.clip();
  const cx = (i: number) => left + ((settings.rightToLeft ? values.length - 1 - i : i) + 0.5) * width / Math.max(1, values.length);
  if (type === 0) {
    ctx.strokeStyle = resolveColor(String(settings.seriesColor)); ctx.lineWidth = Number(settings.lineWeight); ctx.beginPath(); let connected = false;
    values.forEach((value, i) => { if (value === null) { if (settings.displayEmptyCellsAs !== 2) connected = false; return; } const py = min === max ? top + height / 2 : scale(value); if (connected) ctx.lineTo(cx(i), py); else ctx.moveTo(cx(i), py); connected = true; }); ctx.stroke();
    values.forEach((value, i) => { if (value === null) return; if (settings.showMarkers || settings.showLow && value === min || settings.showHigh && value === max || settings.showFirst && i === 0 || settings.showLast && i === values.length - 1 || settings.showNegative && value < 0) { ctx.fillStyle = resolveColor(String(color(value, i))); const px = cx(i), py = min === max ? top + height / 2 : scale(value); ctx.save(); ctx.translate(px, py); ctx.rotate(Math.PI / 4); ctx.fillRect(-1, -1, 2, 2); ctx.restore(); } });
  } else {
    const slot = width / values.length;
    values.forEach((value, i) => { if (value === null || value === 0 && type === 2) return; const index = settings.rightToLeft ? values.length - 1 - i : i; const end = type === 2 ? value > 0 ? top : top + height : scale(value); ctx.fillStyle = resolveColor(String(color(value, i))); ctx.fillRect(left + Math.round((index + .25) * slot), Math.min(base, end), Math.max(1, Math.round(slot * .5)), Math.max(1, Math.abs(base - end))); });
  }
  if (settings.displayXAxis && lo < 0 && hi > 0) { ctx.strokeStyle = resolveColor(String(settings.axisColor)); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(left, Math.floor(base) + .5); ctx.lineTo(left + width + (type === 0 ? 1 : 0), Math.floor(base) + .5); ctx.stroke(); }
  ctx.restore();
}
/** Paints the small-chart values returned by the formula engine. */
export function paintFormulaSparkline(ctx: CanvasRenderingContext2D, spark: { name: string; value: Record<string, unknown> }, x: number, y: number, w: number, h: number): void {
  const value = spark.value;
  if (/^(LINE|COLUMN|WINLOSS)/.test(spark.name)) {
    const matrix = value.values as unknown[][], orientation = Number(value.dataOrientation);
    const data = (orientation === 0 ? matrix.map(row => row[0]) : matrix[0] ?? []).map(n => typeof n === 'number' ? n : null);
    paintSparkline(ctx, data, Number(value.sparklineType), (value.setting as { options: SparklineOptions }).options, x, y, w, h); return;
  }
  const values = (value.values as unknown[]).map(Number).filter(Number.isFinite), colors = value.colors as string[];
  if (!values.length) return;
  ctx.save(); ctx.beginPath(); ctx.rect(x, y, w - 1, h - 1); ctx.clip();
  if (spark.name === 'PIESPARKLINE') {
    const total = values.reduce((sum, n) => sum + Math.abs(n), 0), radius = Math.max(0, (Math.min(w, h) - 9) / 2);
    let angle = -Math.PI / 2;
    const palette = ['#a9a9a9', '#878787', '#515151', '#202020', '#060606'];
    values.forEach((n, i) => { const end = angle + Math.abs(n) / (total || 1) * Math.PI * 2; ctx.beginPath(); ctx.moveTo(x + (w - 1) / 2, y + (h - 1) / 2); ctx.arc(x + (w - 1) / 2, y + (h - 1) / 2, radius, angle, end); ctx.closePath(); ctx.fillStyle = resolveColor(colors[i] || palette[i % palette.length]); ctx.fill(); ctx.strokeStyle = 'white'; ctx.lineWidth = 1; ctx.stroke(); angle = end; });
  } else if (spark.name === 'HBARSPARKLINE' || spark.name === 'VBARSPARKLINE') {
    const fraction = Math.max(-1, Math.min(1, values[0])); ctx.fillStyle = resolveColor(colors[0] || 'gray');
    if (spark.name === 'HBARSPARKLINE') ctx.fillRect(x + 2, y + 2, (w - 4) * Math.abs(fraction), h - 4);
    else ctx.fillRect(x + 2, y + h - 2 - (h - 4) * Math.abs(fraction), w - 4, (h - 4) * Math.abs(fraction));
  } else if (spark.name === 'AREASPARKLINE') {
    const min = Math.min(0, ...values), max = Math.max(0, ...values), py = (v: number) => y + h - 2 - (v - min) / (max - min || 1) * (h - 4);
    ctx.beginPath(); ctx.moveTo(x + 2, py(0)); values.forEach((v, i) => ctx.lineTo(x + 2 + i / Math.max(1, values.length - 1) * (w - 4), py(v))); ctx.lineTo(x + w - 2, py(0)); ctx.closePath(); ctx.fillStyle = resolveColor(colors[0] || '#787878'); ctx.fill();
  }
  ctx.restore();
}
