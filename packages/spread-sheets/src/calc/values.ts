/**
 * Runtime value model of the calculation engine.
 *
 * Formula results are plain scalars (`number`, `string`, `boolean`, `Date`,
 * `null`), formula errors, array values or references. Keeping references as a
 * first-class value is what allows functions such as ROW, OFFSET and INDEX to
 * observe the address of their argument instead of only its contents.
 */
import type { Worksheet } from '../worksheet.js';

/** Error values used by the engine. */
export const ErrorCode = {
  null: '#NULL!',
  div0: '#DIV/0!',
  value: '#VALUE!',
  ref: '#REF!',
  name: '#NAME?',
  num: '#NUM!',
  na: '#N/A',
  spill: '#SPILL!',
  calc: '#CALC!',
  gettingData: '#GETTING_DATA',
} as const;
export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode];

/**
 * Numeric error identities, copied from what the official 19.2.5 trial answers
 * for `JSON.stringify(…getValue())` (its error object serialises as
 * `{ _calcError, _code }` through a `toJSON` method on the prototype).
 */
export const ErrorCodeValueMap: Record<string, number> = {
  '#NULL!': 0,
  '#DIV/0!': 7,
  '#VALUE!': 15,
  '#REF!': 23,
  '#NAME?': 29,
  '#NUM!': 36,
  '#N/A': 42,
  '#GETTING_DATA': 101,
  '#SPILL!': 99,
  '#CALC!': 100,
};

/** A calculation error, matching the public `GC.Spread.CalcEngine.CalcError`. */
export class CalcError {
  error: string;
  constructor(error: string) {
    this.error = error;
  }
  static parse(value: string): CalcError {
    return new CalcError(value);
  }
  toString(): string {
    return this.error;
  }
  /** A copy of this error, like the trial's `clone`. */
  clone(): CalcError {
    return new CalcError(this.error);
  }
  /** The identity the trial serialises an error with. */
  toJSON(): { _calcError: string; _code: number } {
    return { _calcError: this.error, _code: ErrorCodeValueMap[this.error] ?? 0 };
  }
}

const KNOWN_ERRORS = new Set<string>(Object.values(ErrorCode));
/** Recognises SpreadJS/Excel error literals. */
export function isErrorString(value: string): boolean {
  return KNOWN_ERRORS.has(value);
}
export function isError(value: unknown): value is CalcError {
  return value instanceof CalcError;
}
export function error(code: string): CalcError {
  return new CalcError(code);
}

/**
 * Thrown by coercion helpers to short-circuit the evaluation of a function.
 * Caught by the evaluator and converted to the error value.
 */
export class ErrorThrown {
  constructor(readonly value: CalcError) {}
}
export function raise(code: string): never {
  throw new ErrorThrown(new CalcError(code));
}
export function raiseError(value: CalcError): never {
  throw new ErrorThrown(value);
}
/** Sentinel for an omitted function argument. */
export class MissingValue {
  private static singleton: MissingValue | undefined;
  private constructor() {}
  static get instance(): MissingValue {
    return (MissingValue.singleton ??= new MissingValue());
  }
}
export const MISSING = MissingValue.instance;
export type Missing = MissingValue;

/** A rectangular array result. Mirrors the public `CalcArray` class. */
export class CalcArray {
  array: Value[][];
  constructor(array?: Value[][]) {
    this.array = array ?? [[]];
    if (!this.array.length) this.array = [[]];
  }
  get rowCount(): number {
    return this.array.length;
  }
  get colCount(): number {
    return this.array.reduce((max, row) => Math.max(max, row.length), 0);
  }
  at(row: number, col: number): ScalarValue {
    const value = this.array[row]?.[col];
    return value === undefined ? null : (value as ScalarValue);
  }
}

/** A rectangular area on a worksheet. Bounds are inclusive, zero based. */
export interface AreaRef {
  sheet: Worksheet;
  r1: number;
  c1: number;
  r2: number;
  c2: number;
  /** Whole column reference (`A:A`); rendered without row numbers. */
  wholeCol?: boolean;
  /** Whole row reference (`1:1`); rendered without column letters. */
  wholeRow?: boolean;
  /** `$` markers used when rendering the reference back to text. */
  abs?: [boolean, boolean, boolean, boolean];
}

/** A reference value: one or more areas (union references have several). */
export class ReferenceValue {
  areas: AreaRef[];
  constructor(areas: AreaRef[]) {
    this.areas = areas;
  }
  get single(): AreaRef | undefined {
    return this.areas.length === 1 ? this.areas[0] : undefined;
  }
}

/** A LAMBDA closure. */
export interface LambdaValue {
  kind: 'lambda';
  params: string[];
  body: unknown;
  context: EvalEnvironment;
}

export class SparklineExValue {
  readonly typeName = 'SparklineExValue';
  constructor(public name: string, public value: Record<string, unknown>) {}
  toString(): string { return ''; }
}
export class BarcodeExValue {
  /**
   * TASK 46: the trial reports `BC_*` results as a `SparklineExValue`-shaped record whose
   * payload carries `isBarcode: true` (probe bc46p); our own class stays distinct so the
   * renderer can branch on it.
   */
  readonly typeName = 'SparklineExValue';
  constructor(public name: string, public value: Record<string, unknown>) {}
  toString(): string { return ''; }
}
export class ImageExValue {
  readonly typeName = 'ImageExValue';
  constructor(public value: Record<string, unknown>) {}
  toString(): string { return ''; }
}
export type ScalarValue = number | string | boolean | Date | CalcError | SparklineExValue | BarcodeExValue | ImageExValue | null;
export type Value = ScalarValue | ReferenceValue | CalcArray | LambdaValue | MissingValue;

export function isLambda(value: unknown): value is LambdaValue {
  return typeof value === 'object' && value !== null && (value as LambdaValue).kind === 'lambda';
}
export function isReference(value: unknown): value is ReferenceValue {
  return value instanceof ReferenceValue;
}
export function isArray(value: unknown): value is CalcArray {
  return value instanceof CalcArray;
}
export function isMissing(value: unknown): value is MissingValue {
  return value instanceof MissingValue;
}

/** Evaluation environment for names and LET/LAMBDA bindings. */
export interface EvalEnvironment {
  vars: Map<string, Value>;
  parent?: EvalEnvironment;
}
export function lookupVar(env: EvalEnvironment | undefined, name: string): Value | undefined {
  const key = name.toUpperCase();
  for (let current = env; current; current = current.parent) {
    if (current.vars.has(key)) return current.vars.get(key);
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Numbers, dates and text
// ---------------------------------------------------------------------------

/** Rounds a double to 15 significant digits, matching SpreadJS display precision. */
export function normalizeNumber(value: number): number {
  if (!Number.isFinite(value) || value === 0) return value;
  // Integers below 1e15 are exact at SpreadJS's 15 significant digits.
  if (Number.isInteger(value) && Math.abs(value) < 1e15) return value;
  return Number(value.toPrecision(15));
}

const DAY = 86400000;
/** SpreadJS date serial epoch: 1899-12-30 (no 1900 leap-year fiction). */
export const SERIAL_EPOCH = Date.UTC(1899, 11, 30);

export function dateToSerial(date: Date): number {
  return (date.getTime() - SERIAL_EPOCH) / DAY;
}
export function serialToDate(serial: number): Date {
  return new Date(SERIAL_EPOCH + Math.round(serial * DAY));
}
/** UTC based construction used by DATE/TIME so results do not depend on TZ. */
export function makeDate(year: number, month: number, day: number, hours = 0, minutes = 0, seconds = 0): Date {
  const date = new Date(Date.UTC(year, month - 1, day, hours, minutes, seconds));
  return date;
}

function scientificText(precision: string): string {
  const [mantissa, exponent = '0'] = precision.split('e');
  const trimmed = mantissa!.includes('.') ? mantissa!.replace(/0+$/, '').replace(/\.$/, '') : mantissa!;
  const digits = Number(exponent);
  return `${trimmed}E${digits >= 0 ? '+' : '-'}${Math.abs(digits)}`;
}

/** Expands a `toPrecision` result that uses exponent notation into plain digits. */
function expandExponential(precision: string): string {
  const match = /^(-?)(\d+)(?:\.(\d+))?e([+-]\d+)$/.exec(precision);
  if (!match) return precision;
  const sign = match[1]!;
  const digits = match[2]! + (match[3] ?? '');
  const exponent = Number(match[4]!);
  const point = match[2]!.length + exponent;
  let text: string;
  if (point <= 0) text = '0.' + '0'.repeat(-point) + digits;
  else if (point >= digits.length) text = digits + '0'.repeat(point - digits.length);
  else text = digits.slice(0, point) + '.' + digits.slice(point);
  return sign + text;
}

/** Text form of a number as used by `&`, CONCAT and TEXT(...,"General"). */
export function numberToText(value: number): string {
  if (Number.isNaN(value)) return 'NaN';
  if (!Number.isFinite(value)) return value > 0 ? 'Infinity' : '-Infinity';
  if (value === 0) return '0';
  const abs = Math.abs(value);
  const precision = value.toPrecision(15);
  // SpreadJS keeps plain notation for [1e-18, 1e20) unless the expanded form
  // would need more than 18 decimal places.
  if (abs >= 1e20 || abs < 1e-18) return scientificText(precision);
  let plain = expandExponential(precision);
  if (plain.includes('.')) plain = plain.replace(/0+$/, '').replace(/\.$/, '');
  const decimals = plain.includes('.') ? plain.split('.')[1]!.length : 0;
  if (decimals > 18) return scientificText(precision);
  return plain;
}

/** Parses a numeric string the way SpreadJS coerces text in arithmetic. */
export function parseNumberText(text: string): number | undefined {
  let value = text.trim();
  if (!value) return undefined;
  let negative = false;
  if (value.startsWith('(') && value.endsWith(')')) {
    negative = true;
    value = value.slice(1, -1).trim();
  }
  value = value.replace(/^([+-]?)\s*([$€£¥])/, '$1');
  let percent = false;
  if (value.endsWith('%')) {
    percent = true;
    value = value.slice(0, -1).trim();
  }
  // Thousands separators: groups of three digits.
  if (/^[+-]?\d{1,3}(,\d{3})+(\.\d*)?$/.test(value)) value = value.replace(/,/g, '');
  if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(value)) return undefined;
  let result = Number(value);
  if (negative) result = -result;
  if (percent) result /= 100;
  return result;
}

/** Excel-like string ordering for comparisons (case insensitive). */
export function compareText(a: string, b: string): number {
  const left = a.toLowerCase();
  const right = b.toLowerCase();
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}
