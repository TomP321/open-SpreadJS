/**
 * SparklineEx: the small-chart formula classes of
 * `GC.Spread.Sheets.Sparklines` (trial-observed shapes). Each class has a
 * zero-argument constructor, an own `typeName` data field (empty string on the
 * trial), and `name()`/`toJSON()`/`fromJSON()`/`createFunction()`/`paint()`.
 * `createFunction()` returns a calc-engine function object carrying the class's
 * formula name and arity; the base `SparklineEx` answers `null` there and paints
 * nothing — custom subclasses override `createFunction`/`paint` instead.
 *
 * The value records below reproduce the key set the 19.2.5 trial stores in the
 * cell (`sheet.getValue()`), observed through the public API: option slots keep
 * the formula order, an unspecified argument reports `null`, and the statistics
 * the trial computes itself (box-plot quartiles, histogram bins, spread
 * frequencies, the month/year day alignment) are computed here too.
 */
import { Function as CalcFunctionObject, type CalcFunction } from '../calc/functions-api.js';
import type { Args, EvalContext } from '../calc/evaluate.js';
import type { ReferenceValue } from '../calc/values.js';
import { SparklineExValue, raise, ErrorCode } from '../calc/values.js';
import type { JsonRecord } from '../serialization.js';
import { sparklineDefaults, type SparklineOptions } from './sparklines.js';

interface SparklineFunctionSpec {
  name: string;
  min: number;
  max: number;
  acceptsArray?: boolean[];
  acceptsReference?: boolean[];
  contextSensitive?: boolean;
}

/** Arity and flag tables observed on the trial via `createFunction()`. */
export const SPARKLINE_FUNCTION_SPECS: SparklineFunctionSpec[] = [
  { name: 'AREASPARKLINE', min: 1, max: 7, acceptsArray: [true], acceptsReference: [true] },
  { name: 'BOXPLOTSPARKLINE', min: 1, max: 10, acceptsArray: [true], acceptsReference: [true] },
  { name: 'BULLETSPARKLINE', min: 3, max: 17, acceptsReference: new Array(17).fill(true) },
  { name: 'CASCADESPARKLINE', min: 1, max: 10, acceptsArray: [true, false, true], acceptsReference: [true, false, true] },
  { name: 'COLUMNSPARKLINE', min: 2, max: 5, acceptsArray: [true, false, true], acceptsReference: [true, false, true] },
  { name: 'GAUGEKPISPARKLINE', min: 4, max: 255, acceptsReference: [true, true, true, true, false, true, true, true, true, true, true] },
  { name: 'HBARSPARKLINE', min: 1, max: 4, acceptsReference: [true] },
  { name: 'HISTOGRAMSPARKLINE', min: 1, max: 9, acceptsArray: new Array(9).fill(true), acceptsReference: [true] },
  { name: 'LOLLIPOPVARISPARKLINE', min: 3, max: 13, acceptsArray: [true, true], acceptsReference: [true, true, false, true, true, true] },
  { name: 'LINESPARKLINE', min: 2, max: 5, acceptsArray: [true, false, true], acceptsReference: [true, false, true] },
  { name: 'MONTHSPARKLINE', min: 3, max: 7, acceptsArray: [false, false, true, true], acceptsReference: [false, false, true, true] },
  { name: 'PARETOSPARKLINE', min: 2, max: 12, acceptsArray: [true, false, true], acceptsReference: [true, false, true] },
  { name: 'PIESPARKLINE', min: 1, max: 255, acceptsArray: [true], acceptsReference: [true] },
  { name: 'PROGRESSSPARKLINE', min: 2, max: 5 },
  { name: 'RANGEBLOCKSPARKLINE', min: 2, max: 2, acceptsReference: [true], contextSensitive: true },
  { name: 'SCATTERSPARKLINE', min: 1, max: 18, acceptsArray: [true, true], acceptsReference: [true, true] },
  { name: 'SPREADSPARKLINE', min: 1, max: 7, acceptsArray: [true], acceptsReference: [true] },
  { name: 'STACKEDSPARKLINE', min: 1, max: 13, acceptsArray: [true, true, true], acceptsReference: [true, true, true] },
  { name: 'VARISPARKLINE', min: 1, max: 10, acceptsReference: new Array(10).fill(true) },
  { name: 'VBARSPARKLINE', min: 1, max: 4, acceptsReference: [true] },
  { name: 'WINLOSSSPARKLINE', min: 2, max: 5, acceptsArray: [true, false, true], acceptsReference: [true, false, true] },
  { name: 'YEARSPARKLINE', min: 2, max: 6, acceptsArray: [false, true, true], acceptsReference: [false, true, true] },
];

const specFor = new Map(SPARKLINE_FUNCTION_SPECS.map((spec) => [spec.name, spec]));
const FLAG_SLOTS = 255;

/** One evaluated formula argument list, read slot by slot. */
interface SlotAccess {
  count(): number;
  /** Raw value of a slot; `null` when the argument is missing. */
  raw(index: number): unknown;
  /** Cell rows of a reference/array slot; `null` for a plain scalar slot. */
  rows(index: number): unknown[][] | null;
  /** Bounding rectangle of a reference slot; `null` for anything else. */
  area(index: number): { row: number; col: number; rowCount: number; colCount: number } | null;
  sheetName(index: number): string | undefined;
}

function isReference(value: unknown): value is ReferenceValue {
  return value instanceof Object && Array.isArray((value as ReferenceValue).areas);
}
function isMatrix(value: unknown): value is { array: unknown[][] } {
  return value instanceof Object && Array.isArray((value as { array?: unknown[][] }).array);
}
function referenceRows(reference: ReferenceValue): unknown[][] {
  const rows: unknown[][] = [];
  for (const area of reference.areas)
    for (let row = area.r1; row <= area.r2; row++) {
      const line: unknown[] = [];
      for (let col = area.c1; col <= area.c2; col++) line.push(area.sheet.getValue(row, col));
      rows.push(line);
    }
  return rows;
}
function referenceArea(reference: ReferenceValue): { row: number; col: number; rowCount: number; colCount: number } | null {
  const area = reference.areas[0];
  if (!area) return null;
  return { row: area.r1, col: area.c1, rowCount: area.r2 - area.r1 + 1, colCount: area.c2 - area.c1 + 1 };
}

/** Slot view over the calc engine's argument list. */
class EngineSlots implements SlotAccess {
  constructor(private readonly args: Args) {}
  count(): number { return this.args.count; }
  raw(index: number): unknown { return index < this.args.count ? this.args.safe(index) : null; }
  rows(index: number): unknown[][] | null {
    const value = this.raw(index);
    if (isReference(value)) return referenceRows(value);
    if (isMatrix(value)) return value.array.map((row) => (Array.isArray(row) ? row : [row]));
    return null;
  }
  area(index: number) {
    const value = this.raw(index);
    return isReference(value) ? referenceArea(value) : null;
  }
  sheetName(index: number): string | undefined {
    const value = this.raw(index);
    return isReference(value) ? value.areas[0]?.sheet.name() : undefined;
  }
}

/** Slot view over plain JavaScript values (a direct `function.evaluate(...)`). */
class ListSlots implements SlotAccess {
  constructor(private readonly values: unknown[]) {}
  count(): number { return this.values.length; }
  raw(index: number): unknown { return index < this.values.length ? this.values[index] : null; }
  rows(index: number): unknown[][] | null {
    const value = this.raw(index);
    if (!Array.isArray(value)) return null;
    return value.map((row) => (Array.isArray(row) ? row : [row]));
  }
  area(): { row: number; col: number; rowCount: number; colCount: number } | null { return null; }
  sheetName(): string | undefined { return undefined; }
}

function scalarAt(slots: SlotAccess, index: number): unknown {
  const value = slots.raw(index);
  return isReference(value) || isMatrix(value) ? null : value ?? null;
}
/** Values of a slot, flattened row-major (as the trial stores data ranges). */
function flatAt(slots: SlotAccess, index: number): unknown[] {
  const rows = slots.rows(index);
  if (rows) return rows.flat();
  const value = slots.raw(index);
  return value === null || value === undefined ? [] : [value];
}
/** Range-only slots: a scalar argument contributes nothing (trial behaviour). */
function rangeAt(slots: SlotAccess, index: number): unknown[] {
  const rows = slots.rows(index);
  return rows ? rows.flat() : [];
}
function numericOf(values: unknown[]): number[] {
  return values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
}

/* --------------------------------------------------- trial-observed stats -- */

/** Excel `PERCENTILE.INC`: linear interpolation over the sorted values. */
function percentile(sorted: number[], fraction: number): number {
  if (!sorted.length) return 0;
  const position = (sorted.length - 1) * fraction;
  const low = Math.floor(position), high = Math.ceil(position);
  return roundTrial(sorted[low] + (sorted[high] - sorted[low]) * (position - low));
}
/** Population standard deviation (the trial's `stDev`). */
function populationDeviation(values: number[]): number {
  if (!values.length) return 0;
  const mean = values.reduce((sum, n) => sum + n, 0) / values.length;
  return Math.sqrt(values.reduce((sum, n) => sum + (n - mean) ** 2, 0) / values.length);
}
const roundTrial = (value: number): number => Math.round(value * 1e10) / 1e10;

/**
 * The trial bins histogram values on a `1`, `2` or `5` times a power of ten step
 * (observed: `0.25` renders as `0.5`, `1`, `2` and `5` unchanged).
 */
function niceStep(scale: unknown): number {
  const requested = typeof scale === 'number' && Number.isFinite(scale) && scale > 0 ? scale : 1;
  const exponent = Math.floor(Math.log10(requested));
  for (const factor of [1, 2, 5, 10]) {
    const step = factor * 10 ** exponent;
    if (step >= requested - 1e-12) return step;
  }
  return requested;
}
/** Bin labels: the first bin is closed on both ends, the rest are `(start, end]`. */
function histogramBins(values: unknown[], scale: unknown): { axis: string; value: number }[] {
  const numeric = numericOf(values);
  if (!numeric.length) return [];
  const step = niceStep(scale);
  const label = (n: number) => String(roundTrial(n));
  const start = Math.floor(Math.min(...numeric) / step) * step;
  let end = Math.ceil(Math.max(...numeric) / step) * step;
  if (end <= start + 1e-9) end = start + step;
  const bins: { axis: string; value: number }[] = [];
  for (let index = 0; start + index * step < end - 1e-9; index++) {
    const from = start + index * step, to = from + step;
    const count = numeric.filter((n) => n <= to + 1e-9 && (index === 0 ? n >= from - 1e-9 : n > from + 1e-9)).length;
    bins.push({ axis: index === 0 ? `[${label(from)},${label(to)}]` : `(${label(from)},${label(to)}]`, value: count });
  }
  return bins;
}

/** Distinct values with their counts, ascending (the trial's `spreadData`). */
function spreadFrequencies(values: unknown[]): { key: number; value: number }[] {
  const counts = new Map<number, number>();
  for (const value of numericOf(values)) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => a[0] - b[0]).map(([key, count]) => ({ key, value: count }));
}

/**
 * MONTH/YEAR data ranges list `date, value` rows; the trial keeps the value of
 * every row whose date falls in the requested period (no matching date, no entry).
 */
function calendarValues(rows: unknown[][] | null, year: number, month?: number): (number | null)[] {
  const result: (number | null)[] = [];
  for (const row of rows ?? []) {
    const when = row[0];
    if (!(when instanceof Date)) continue;
    if (when.getFullYear() !== year) continue;
    if (month !== undefined && when.getMonth() + 1 !== month) continue;
    const value = row.length > 1 ? row[1] : null;
    result.push(typeof value === 'number' && Number.isFinite(value) ? value : null);
  }
  return result;
}

/** Trial-observed argument-shape checks; failures evaluate to `#VALUE!`. */
type Validator = (slots: SlotAccess) => boolean;

/** A data range's first column holds dates or nothing; other values are invalid. */
const dateRangeValidator = (index: number): Validator => (slots) => {
  const rows = slots.rows(index);
  if (!rows) return false;
  return rows.every((row) => row[0] === null || row[0] === undefined || row[0] === '' || row[0] instanceof Date);
};

/** `pointIndex` is one scalar: a literal or a single cell. */
const singleValueValidator = (index: number): Validator => (slots) => {
  const rows = slots.rows(index);
  if (!rows) return true;
  return rows.length === 1 && rows[0].length === 1;
};

/** A slot must be numeric (text values are invalid). */
const numericValidator = (index: number): Validator => (slots) => {
  const value = slots.raw(index);
  if (value instanceof Date) return false;
  if (typeof value === 'string') return value.trim() !== '' && Number.isFinite(Number(value));
  return typeof value === 'number' && Number.isFinite(value);
};

/** The variance charts index a column across the planned/actual ranges. */
const seriesIndexValidator: Validator = (slots) => {
  const index = Number(scalarAt(slots, 2));
  if (!Number.isFinite(index) || index < 1) return false;
  const width = (column: number) => (slots.rows(column) ?? []).reduce((widest, row) => Math.max(widest, row.length), 0);
  return index <= width(0) + width(1);
};

const VALIDATORS: Record<string, Validator> = {
  MONTHSPARKLINE: dateRangeValidator(2),
  YEARSPARKLINE: dateRangeValidator(1),
  PARETOSPARKLINE: singleValueValidator(1),
  PROGRESSSPARKLINE: numericValidator(1),
  LOLLIPOPVARISPARKLINE: seriesIndexValidator,
  // Observed on the trial: `min < max` and the current value inside that range.
  GAUGEKPISPARKLINE: (slots) => {
    const min = Number(scalarAt(slots, 2)), max = Number(scalarAt(slots, 3)), current = Number(scalarAt(slots, 1));
    return Number.isFinite(min) && Number.isFinite(max) && Number.isFinite(current) && min < max && current >= min && current <= max;
  },
};

/* ------------------------------------------------------- value recorders -- */

type Recorder = (slots: SlotAccess, ctx: EvalContext | undefined) => Record<string, unknown>;
const missing = (value: unknown): unknown => value === undefined ? null : value;

/** LINE/COLUMN/WINLOSS share the trial's series record (type 0/1/2). */
function seriesRecord(type: number): Recorder {
  return (slots, ctx) => {
    const setting: SparklineOptions = { ...sparklineDefaults };
    const raw = scalarAt(slots, 4);
    if (typeof raw === 'string' && raw) {
      try { Object.assign(setting, JSON.parse(raw)); } catch { /* unrecognised settings use defaults, as the trial */ }
    }
    const dateRows = slots.rows(2);
    return {
      values: slots.rows(0) ?? [],
      dataOrientation: scalarAt(slots, 1) ?? 1,
      data: slots.area(0),
      dataSheetName: slots.sheetName(0) ?? ctx?.sheet.name(),
      dateAxisData: dateRows ?? null,
      dateAxisDataSheetName: dateRows ? slots.sheetName(2) ?? ctx?.sheet.name() : null,
      dateAxisOrientation: scalarAt(slots, 3) ?? null,
      dateValues: numericOf(flatAt(slots, 2)),
      displayDateAxis: dateRows ? true : null,
      setting: { options: setting },
      sparklineType: type,
    };
  };
}

/** One labelled gauge value (the trial stores font and label per value). */
function gaugeOption(value: unknown, label: unknown, font: string): Record<string, unknown> {
  return { value: value ?? null, label: label === undefined || label === null ? value ?? null : label, font, fontAfterZoom: null };
}

const RECORDERS: Record<string, Recorder> = {
  AREASPARKLINE: (slots) => ({
    points: flatAt(slots, 0),
    mini: missing(scalarAt(slots, 1)), maxi: missing(scalarAt(slots, 2)),
    line1: missing(scalarAt(slots, 3)), line2: missing(scalarAt(slots, 4)),
    colorPositive: missing(scalarAt(slots, 5)), colorNegative: missing(scalarAt(slots, 6)),
  }),
  BOXPLOTSPARKLINE: (slots) => {
    const points = flatAt(slots, 0);
    const numeric = numericOf(points);
    const sorted = [...numeric].sort((a, b) => a - b);
    return {
      points,
      boxPlotClass: missing(scalarAt(slots, 1)),
      showAverage: missing(scalarAt(slots, 2)),
      scaleStart: missing(scalarAt(slots, 3)), scaleEnd: missing(scalarAt(slots, 4)),
      acceptableStart: missing(scalarAt(slots, 5)), acceptableEnd: missing(scalarAt(slots, 6)),
      colorScheme: missing(scalarAt(slots, 7)), style: missing(scalarAt(slots, 8)), vertical: missing(scalarAt(slots, 9)),
      q1: percentile(sorted, 0.25), q3: percentile(sorted, 0.75), median: percentile(sorted, 0.5),
      perc02: percentile(sorted, 0.02), perc09: percentile(sorted, 0.09), perc10: percentile(sorted, 0.1),
      perc90: percentile(sorted, 0.9), perc91: percentile(sorted, 0.91), perc98: percentile(sorted, 0.98),
      stDev: populationDeviation(numeric),
    };
  },
  BULLETSPARKLINE: (slots) => ({
    measure: scalarAt(slots, 0), target: scalarAt(slots, 1), maxi: scalarAt(slots, 2),
    good: missing(scalarAt(slots, 3)), bad: missing(scalarAt(slots, 4)),
    forecast: missing(scalarAt(slots, 5)), tickUnit: missing(scalarAt(slots, 6)),
    colorScheme: missing(scalarAt(slots, 7)), vertical: missing(scalarAt(slots, 8)),
    measureColor: missing(scalarAt(slots, 9)), targetColor: missing(scalarAt(slots, 10)),
    maxiColor: missing(scalarAt(slots, 11)), goodColor: missing(scalarAt(slots, 12)),
    badColor: missing(scalarAt(slots, 13)), forecastColor: missing(scalarAt(slots, 14)),
    allowMeasureOverMaxi: missing(scalarAt(slots, 15)), barSize: missing(scalarAt(slots, 16)),
  }),
  CASCADESPARKLINE: (slots) => ({
    points: flatAt(slots, 0),
    pointIndex: missing(scalarAt(slots, 1)),
    labels: rangeAt(slots, 2),
    minimum: missing(scalarAt(slots, 3)), maximum: missing(scalarAt(slots, 4)),
    colorPositive: missing(scalarAt(slots, 5)), colorNegative: missing(scalarAt(slots, 6)),
    vertical: missing(scalarAt(slots, 7)),
    itemTypeRange: rangeAt(slots, 8),
    colorTotal: missing(scalarAt(slots, 9)),
  }),
  COLUMNSPARKLINE: seriesRecord(1),
  LINESPARKLINE: seriesRecord(0),
  WINLOSSSPARKLINE: seriesRecord(2),
  GAUGEKPISPARKLINE: (slots) => ({
    targetValueOption: gaugeOption(scalarAt(slots, 0), scalarAt(slots, 5), '16px Calibri'),
    currentValueOption: gaugeOption(scalarAt(slots, 1), scalarAt(slots, 6), 'bold 22px Calibri'),
    minValueOption: gaugeOption(scalarAt(slots, 2), scalarAt(slots, 7), '12px Calibri'),
    maxValueOption: gaugeOption(scalarAt(slots, 3), scalarAt(slots, 8), '12px Calibri'),
    gaugeType: scalarAt(slots, 13) ?? 0,
    minAngle: scalarAt(slots, 10) ?? -90, maxAngle: scalarAt(slots, 11) ?? 90,
    radiusRatio: scalarAt(slots, 12) ?? 0,
    ranges: rangeAt(slots, 14),
    showLabel: scalarAt(slots, 4) ?? true,
  }),
  HBARSPARKLINE: (slots) => ({
    value: scalarAt(slots, 0), colorScheme: missing(scalarAt(slots, 1)),
    axisVisible: missing(scalarAt(slots, 2)), barHeight: missing(scalarAt(slots, 3)),
  }),
  VBARSPARKLINE: (slots) => ({
    value: scalarAt(slots, 0), colorScheme: missing(scalarAt(slots, 1)),
    axisVisible: missing(scalarAt(slots, 2)), barWidth: missing(scalarAt(slots, 3)),
  }),
  HISTOGRAMSPARKLINE: (slots) => ({
    barColor: scalarAt(slots, 5) ?? '#5B9BD5',
    barWidth: scalarAt(slots, 4) ?? 1,
    continuous: scalarAt(slots, 1) ?? true,
    edgeColor: scalarAt(slots, 8) ?? '#C0C0C0',
    labelColor: scalarAt(slots, 7) ?? '#000000',
    labelFontStyle: missing(scalarAt(slots, 6)),
    paintLabel: scalarAt(slots, 2) ?? false,
    values: histogramBins(flatAt(slots, 0), scalarAt(slots, 3)),
  }),
  LOLLIPOPVARISPARKLINE: (slots) => ({
    plannedValue: flatAt(slots, 0), actualValue: flatAt(slots, 1),
    index: scalarAt(slots, 2),
    absolute: missing(scalarAt(slots, 3)), reference: missing(scalarAt(slots, 4)),
    mini: missing(scalarAt(slots, 5)), maxi: missing(scalarAt(slots, 6)),
    tickUnit: missing(scalarAt(slots, 7)), legend: missing(scalarAt(slots, 8)),
    colorPositive: missing(scalarAt(slots, 9)), colorNegative: missing(scalarAt(slots, 10)),
    lollipopHeaderColor: missing(scalarAt(slots, 11)), vertical: missing(scalarAt(slots, 12)),
  }),
  MONTHSPARKLINE: (slots) => ({
    emptyColor: missing(scalarAt(slots, 3)), endColor: missing(scalarAt(slots, 6)),
    middleColor: missing(scalarAt(slots, 5)), month: scalarAt(slots, 1),
    startColor: missing(scalarAt(slots, 4)),
    values: calendarValues(slots.rows(2), Number(scalarAt(slots, 0)), Number(scalarAt(slots, 1))),
    year: scalarAt(slots, 0),
  }),
  YEARSPARKLINE: (slots) => ({
    emptyColor: missing(scalarAt(slots, 2)), endColor: missing(scalarAt(slots, 5)),
    middleColor: missing(scalarAt(slots, 4)), startColor: missing(scalarAt(slots, 3)),
    values: calendarValues(slots.rows(1), Number(scalarAt(slots, 0))),
    year: scalarAt(slots, 0),
  }),
  PARETOSPARKLINE: (slots) => ({
    barSize: missing(scalarAt(slots, 11)),
    colorRange: rangeAt(slots, 2),
    highlightPosition: missing(scalarAt(slots, 5)),
    label: missing(scalarAt(slots, 6)),
    labelColor: missing(scalarAt(slots, 10)),
    pointIndex: missing(scalarAt(slots, 1)),
    points: flatAt(slots, 0),
    target: missing(scalarAt(slots, 3)), target2: missing(scalarAt(slots, 4)),
    target2Color: missing(scalarAt(slots, 9)), targetColor: missing(scalarAt(slots, 8)),
    vertical: missing(scalarAt(slots, 7)),
  }),
  PIESPARKLINE: (slots) => {
    const values: number[] = [], colors: string[] = [];
    for (let index = 0; index < slots.count(); index++)
      for (const value of flatAt(slots, index)) {
        if (typeof value === 'number' && Number.isFinite(value)) values.push(value);
        else if (typeof value === 'string') colors.push(value);
      }
    return { colors, values };
  },
  PROGRESSSPARKLINE: (slots) => {
    const value = Number(scalarAt(slots, 0));
    return {
      bandColor: scalarAt(slots, 3) ?? 'Accent 1 80',
      barColor: scalarAt(slots, 2) ?? 'Accent 1',
      mode: scalarAt(slots, 1) ?? 0,
      progress: Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0,
      showValue: scalarAt(slots, 4) ?? true,
    };
  },
  RANGEBLOCKSPARKLINE: (slots, ctx) => ({
    bindingObject: scalarAt(slots, 1),
    templateRange: slots.area(0),
    templateSheetName: slots.sheetName(0) ?? ctx?.sheet.name(),
  }),
  SCATTERSPARKLINE: (slots) => ({
    color1: missing(scalarAt(slots, 15)), color2: missing(scalarAt(slots, 16)),
    dash: missing(scalarAt(slots, 17)), drawLines: missing(scalarAt(slots, 14)),
    drawSymbol: missing(scalarAt(slots, 13)), hLine: missing(scalarAt(slots, 6)),
    maxX: missing(scalarAt(slots, 3)), maxY: missing(scalarAt(slots, 5)),
    minX: missing(scalarAt(slots, 2)), minY: missing(scalarAt(slots, 4)),
    points1: slots.rows(0) ?? [], points2: slots.rows(1) ?? [],
    tags: missing(scalarAt(slots, 12)), vLine: missing(scalarAt(slots, 7)),
    xMaxZone: missing(scalarAt(slots, 9)), xMinZone: missing(scalarAt(slots, 8)),
    yMaxZone: missing(scalarAt(slots, 11)), yMinZone: missing(scalarAt(slots, 10)),
  }),
  SPREADSPARKLINE: (slots) => ({
    colorScheme: missing(scalarAt(slots, 5)),
    scaleEnd: missing(scalarAt(slots, 3)), scaleStart: missing(scalarAt(slots, 2)),
    showAverage: missing(scalarAt(slots, 1)),
    spreadData: spreadFrequencies(flatAt(slots, 0)),
    style: missing(scalarAt(slots, 4)), vertical: missing(scalarAt(slots, 6)),
  }),
  STACKEDSPARKLINE: (slots) => ({
    color: missing(scalarAt(slots, 8)),
    colorRange: rangeAt(slots, 1),
    highlightPosition: missing(scalarAt(slots, 9)),
    labelRange: rangeAt(slots, 2),
    maximum: missing(scalarAt(slots, 3)),
    points: flatAt(slots, 0),
    targetBlue: missing(scalarAt(slots, 6)), targetGreen: missing(scalarAt(slots, 5)),
    targetRed: missing(scalarAt(slots, 4)), targetYellow: missing(scalarAt(slots, 7)),
    textOrientation: missing(scalarAt(slots, 11)), textSize: missing(scalarAt(slots, 12)),
    vertical: missing(scalarAt(slots, 10)),
  }),
  VARISPARKLINE: (slots) => ({
    colorNegative: missing(scalarAt(slots, 8)), colorPositive: missing(scalarAt(slots, 7)),
    legend: missing(scalarAt(slots, 6)), mark: missing(scalarAt(slots, 4)),
    maxi: missing(scalarAt(slots, 3)), mini: missing(scalarAt(slots, 2)),
    reference: missing(scalarAt(slots, 1)), tickUnit: missing(scalarAt(slots, 5)),
    variance: scalarAt(slots, 0), vertical: missing(scalarAt(slots, 9)),
  }),
};

/** The trial's value record of one built-in sparkline function. */
function recordFor(name: string, slots: SlotAccess, ctx: EvalContext | undefined): Record<string, unknown> {
  const recorder = RECORDERS[name];
  return recorder ? recorder(slots, ctx) : {};
}

/** The `GC.Spread.CalcEngine.Functions.Function` object a class registers. */
class SparklineFunction extends CalcFunctionObject {
  constructor(spec: SparklineFunctionSpec) {
    super(spec.name, spec.min, spec.max);
    // The trial's sparkline function objects report an empty typeName.
    Object.defineProperty(this, 'typeName', { value: '', writable: true, enumerable: true, configurable: true });
    functionFlags.set(this, spec);
    const evaluate = (...args: unknown[]): unknown => recordFor(spec.name, new ListSlots(args), undefined);
    Object.defineProperty(this, 'evaluate', { value: evaluate, writable: true, enumerable: true, configurable: true });
  }
  override acceptsArray(index: number): boolean { return slotOf(functionFlags.get(this)!.acceptsArray, index); }
  override acceptsReference(index: number): boolean { return slotOf(functionFlags.get(this)!.acceptsReference, index); }
  override isContextSensitive(): boolean { return functionFlags.get(this)!.contextSensitive === true; }
}
const functionFlags = new WeakMap<SparklineFunction, SparklineFunctionSpec>();
function slotOf(flags: boolean[] | undefined, index: number): boolean {
  return index < FLAG_SLOTS && (flags?.[index] ?? false) === true;
}

/**
 * Base class of the small-chart formula sparklines. The trial's SparklineEx is
 * a plain (ES5) constructor, so user subclasses can use the documented
 * `SparklineEx.apply(this, arguments)` + prototype pattern; we implement it the
 * same way. Built-in subclasses carry their formula name on the constructor.
 */
export interface SparklineExObject {
  /** User subclasses add their own data fields (trial `SparklineEx.apply`). */
  [key: string]: unknown;
  typeName: string;
  /** Internal formula-function name reported by `name()`. */
  _name?: string;
  createFunction(): CalcFunctionObject | null;
  name(): string | undefined;
  paint(context: CanvasRenderingContext2D, value: unknown, x: number, y: number, width: number, height: number): void;
  toJSON(): JsonRecord;
  fromJSON(settings: object): void;
  /** Engine evaluation of this class's built-in formula function. */
  evaluateFormula(args: Args, ctx: EvalContext): SparklineExValue;
}

type SparklineExConstructor = { new(): SparklineExObject; prototype: SparklineExObject; sparklineFunctionName?: string } & Record<string, unknown>;

function createFunction(this: SparklineExObject): CalcFunctionObject | null {
  const key = this._name ?? (this.constructor as { sparklineFunctionName?: string }).sparklineFunctionName;
  const spec = key ? specFor.get(key) : undefined;
  return spec ? new SparklineFunction(spec) : null;
}
function name(this: SparklineExObject): string | undefined {
  return this._name !== undefined ? this._name : (this.typeName || undefined);
}
function paint(this: SparklineExObject, _context: CanvasRenderingContext2D, _value: unknown, _x: number, _y: number, _width: number, _height: number): void {
  void this; /* the base paints nothing; subclasses and registrations draw their own chart */
}
function toJSON(this: SparklineExObject): JsonRecord {
  const result: JsonRecord = {};
  for (const key of Object.keys(this)) {
    const value = (this as Record<string, unknown>)[key];
    if (typeof value === 'function') continue;
    result[key] = value;
  }
  return result;
}
function fromJSON(this: SparklineExObject, settings: object): void {
  for (const [key, value] of Object.entries(settings ?? {})) {
    if (typeof value === 'function') continue;
    (this as Record<string, unknown>)[key] = value;
  }
}
/** Engine evaluation entry point (prototype member): delegates with `this`. */
function evaluateFormula(this: SparklineExObject, args: Args, ctx: EvalContext): SparklineExValue {
  return evaluateFormulaFor(this, args, ctx);
}

function evaluateFormulaFor(owner: SparklineExObject, args: Args, ctx: EvalContext): SparklineExValue {
  const name = owner._name ?? (owner.constructor as { sparklineFunctionName?: string }).sparklineFunctionName;
  const spec = name ? specFor.get(name) : undefined;
  if (!spec) {
    // A user registration: its own `createFunction().evaluate` builds the value.
    const fn = owner.createFunction();
    const raw: unknown[] = [];
    for (let index = 0; index < args.count; index++) raw.push(args.safe(index));
    const value = fn ? fn.evaluate(...raw) : {};
    return new SparklineExValue(String(name ?? owner.typeName ?? ''), value instanceof SparklineExValue ? value.value : (value as Record<string, unknown>) ?? {});
  }
  const slots = new EngineSlots(args);
  const validate = VALIDATORS[spec.name];
  if (validate && !validate(slots)) raise(ErrorCode.value);
  return new SparklineExValue(spec.name, recordFor(spec.name, slots, ctx));
}

const sparklineExMembers = { createFunction, name, paint, toJSON, fromJSON, evaluateFormula };

function SparklineExBase(this: SparklineExObject): void {
  this.typeName = '';
  const own = (this.constructor as { sparklineFunctionName?: string }).sparklineFunctionName;
  if (own) this._name = own;
  else {
    // User subclasses define `createFunction` on their prototype: the trial
    // stores the created function's name on the instance (`name()` reports it).
    const fn = this.createFunction?.();
    if (fn && typeof fn.name === 'string' && fn.name) this._name = fn.name;
  }
}
// `typeName` is a declared data property: keep a real own descriptor on the
// prototype so the fallback installer leaves it alone, and let every instance
// own its own value (trial shape).
Object.defineProperty(SparklineExBase.prototype, 'typeName', { value: '', writable: true, enumerable: false, configurable: true });
for (const [key, member] of Object.entries(sparklineExMembers))
  Object.defineProperty(SparklineExBase.prototype, key, { value: member, writable: true, enumerable: false, configurable: true });
export const SparklineEx = SparklineExBase as unknown as SparklineExConstructor;

/** A built-in subclass: same members, own prototypes (trial layout), own formula name. */
function sparklineClass(functionName: string, statics: Record<string, unknown> = {}): SparklineExConstructor {
  const ctor = (function (this: SparklineExObject) {
    SparklineExBase.call(this);
  }) as unknown as SparklineExConstructor;
  ctor.prototype = Object.create(SparklineExBase.prototype) as SparklineExObject;
  Object.defineProperty(ctor.prototype, 'constructor', { value: ctor, writable: true, enumerable: false, configurable: true });
  for (const [key, member] of Object.entries(sparklineExMembers))
    Object.defineProperty(ctor.prototype, key, { value: member, writable: true, enumerable: false, configurable: true });
  ctor.sparklineFunctionName = functionName;
  Object.assign(ctor, statics);
  return ctor;
}

export const AreaSparkline = sparklineClass('AREASPARKLINE');
export const BoxPlotSparkline = sparklineClass('BOXPLOTSPARKLINE');
export const BulletSparkline = sparklineClass('BULLETSPARKLINE');
export const CascadeSparkline = sparklineClass('CASCADESPARKLINE');
export const ColumnSparkline = sparklineClass('COLUMNSPARKLINE');
export const GaugeKPISparkline = sparklineClass('GAUGEKPISPARKLINE');
export const HBarSparkline = sparklineClass('HBARSPARKLINE');
export const HistogramSparkline = sparklineClass('HISTOGRAMSPARKLINE');
/** The trial's IMAGE class has no calc function (`createFunction()` null). */
export const ImageSparkline = sparklineClass('IMAGE');
export const LineSparkline = sparklineClass('LINESPARKLINE');
export const LollipopVariSparkline = sparklineClass('LOLLIPOPVARISPARKLINE');
export const MonthSparkline = sparklineClass('MONTHSPARKLINE');
export const ParetoSparkline = sparklineClass('PARETOSPARKLINE');
export const PieSparkline = sparklineClass('PIESPARKLINE');
export const ProgressSparkline = sparklineClass('PROGRESSSPARKLINE');
export const RangeBlockSparkline = sparklineClass('RANGEBLOCKSPARKLINE');
export const ScatterSparkline = sparklineClass('SCATTERSPARKLINE');
export const SpreadSparkline = sparklineClass('SPREADSPARKLINE');
export const StackedSparkline = sparklineClass('STACKEDSPARKLINE');
export const VariSparkline = sparklineClass('VARISPARKLINE');
export const VBarSparkline = sparklineClass('VBARSPARKLINE');
export const WinlossSparkline = sparklineClass('WINLOSSSPARKLINE');
export const YearSparkline = sparklineClass('YEARSPARKLINE', {
  /** Static day tables of the YEARSPARKLINE helper class (trial-observed). */
  daysOfMonth: [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31],
  dayInYear: [31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334, 365],
});

const classFor = new Map<string, new () => SparklineExObject>([
  ['AREASPARKLINE', AreaSparkline], ['BOXPLOTSPARKLINE', BoxPlotSparkline], ['BULLETSPARKLINE', BulletSparkline],
  ['CASCADESPARKLINE', CascadeSparkline], ['COLUMNSPARKLINE', ColumnSparkline], ['GAUGEKPISPARKLINE', GaugeKPISparkline],
  ['HBARSPARKLINE', HBarSparkline], ['HISTOGRAMSPARKLINE', HistogramSparkline], ['IMAGE', ImageSparkline],
  ['LINESPARKLINE', LineSparkline], ['LOLLIPOPVARISPARKLINE', LollipopVariSparkline], ['MONTHSPARKLINE', MonthSparkline],
  ['PARETOSPARKLINE', ParetoSparkline], ['PIESPARKLINE', PieSparkline], ['PROGRESSSPARKLINE', ProgressSparkline],
  ['RANGEBLOCKSPARKLINE', RangeBlockSparkline], ['SCATTERSPARKLINE', ScatterSparkline], ['SPREADSPARKLINE', SpreadSparkline],
  ['STACKEDSPARKLINE', StackedSparkline], ['VARISPARKLINE', VariSparkline], ['VBARSPARKLINE', VBarSparkline],
  ['WINLOSSSPARKLINE', WinlossSparkline], ['YEARSPARKLINE', YearSparkline],
]);
const shared = new Map<string, SparklineExObject>();
export function sparklineFor(name: string): SparklineExObject | undefined {
  const key = String(name).toUpperCase();
  let sparkline = shared.get(key);
  if (!sparkline) {
    const Ctor = classFor.get(key);
    if (!Ctor) return undefined;
    sparkline = new Ctor();
    shared.set(key, sparkline);
  }
  return sparkline;
}

/** A SparklineEx registration as seen by the calc engine. */
export interface SparklineFunctionEntry extends CalcFunction {
  sparkline: SparklineExObject;
}

const registeredSparklines = new WeakMap<object, SparklineExObject[]>();
function sparklineKeys(sparkline: SparklineExObject): string[] {
  return [sparkline.name(), sparkline.typeName].filter((key): key is string => Boolean(key));
}
export function addSparklineExTo(owner: object, sparklineEx: SparklineExObject): void {
  const list = registeredSparklines.get(owner) ?? [];
  registeredSparklines.set(owner, list);
  const same = list.findIndex((item) => item === sparklineEx);
  if (same >= 0) list.splice(same, 1);
  list.push(sparklineEx);
}
export function removeSparklineExFrom(owner: object, name: string): SparklineExObject[] {
  const list = registeredSparklines.get(owner);
  if (!list) return [];
  const key = String(name);
  const removed = list.filter((item) => sparklineKeys(item).includes(key));
  if (removed.length) registeredSparklines.set(owner, list.filter((item) => !removed.includes(item)));
  return removed;
}
export function registeredSparklineExs(owner: object): SparklineExObject[] {
  return [...(registeredSparklines.get(owner) ?? [])];
}
/** The registered sparkline whose formula function paints this cell value. */
export function registeredSparklineFor(owner: object, formulaName: string): SparklineExObject | undefined {
  return (registeredSparklines.get(owner) ?? []).find((item) => item.name() === formulaName);
}
/** Only instances carrying a `typeName` are serialized (trial behaviour). */
export function serializedSparklineExs(owner: object): JsonRecord[] {
  return registeredSparklineExs(owner)
    .filter((item) => Boolean(item.typeName))
    .map((item) => item.toJSON());
}

/** The workbook-registered SparklineEx painting this formula value (custom subclasses). */
export function workbookSparklineOf(sheet: unknown, formulaName: string): SparklineExObject | undefined {
  const workbook = (sheet as { getParent?: () => { _sparklineFor?: (name: string) => SparklineExObject | undefined } | undefined })?.getParent?.();
  return workbook?._sparklineFor?.(formulaName);
}
