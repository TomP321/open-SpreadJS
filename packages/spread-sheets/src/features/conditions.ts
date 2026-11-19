import { resolveColor } from '../colors.js';
/**
 * Conditional-formatting conditions shared by conditional formatting, data
 * validation and row filters. Conditions compare a candidate value with a
 * literal, another cell, a formula or a list source.
 */
import { Range } from '../primitives.js';
import { GC } from '../generated/enums.js';
import { evaluateFormula } from '../calc/api.js';
import type { Worksheet } from '../worksheet.js';
import { serializeValue, deserializeValue, type JsonRecord } from '../serialization.js';

const ConditionType = GC.Spread.Sheets.ConditionalFormatting.ConditionType;
const Compare = GC.Spread.Sheets.ConditionalFormatting.ComparisonOperators;
const TextCompare = GC.Spread.Sheets.ConditionalFormatting.TextCompareType;
const DateCompare = GC.Spread.Sheets.ConditionalFormatting.DateCompareType;

export type EvalHost = Worksheet;

const isBlank = (value: unknown): boolean => value === null || value === undefined || value === '';
const asNumber = (value: unknown): number => {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'string' && value.trim() !== '') return Number(value);
  return NaN;
};
function timeFraction(value: unknown): number {
  if (value instanceof Date) {
    const ms = (((value.getHours() * 60 + value.getMinutes()) * 60 + value.getSeconds()) * 1000 + value.getMilliseconds());
    return ms / 86400000;
  }
  if (typeof value === 'string' && value.startsWith('/OADate(')) value = Number(value.slice(8, -1));
  if (typeof value === 'number' && Number.isFinite(value)) return ((value % 1) + 1) % 1;
  return NaN;
}
const asText = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  return String(value);
};
function textMatches(actual: string, expected: string, operator: number, ignoreCase = true): boolean {
  const a = ignoreCase ? actual.toLowerCase() : actual;
  const b = ignoreCase ? expected.toLowerCase() : expected;
  switch (operator) {
    case TextCompare.equalsTo:
      return a === b;
    case TextCompare.notEqualsTo:
      return a !== b;
    case TextCompare.beginsWith:
      return a.startsWith(b);
    case TextCompare.doesNotBeginWith:
      return !a.startsWith(b);
    case TextCompare.endsWith:
      return a.endsWith(b);
    case TextCompare.doesNotEndWith:
      return !a.endsWith(b);
    case TextCompare.contains:
      return a.includes(b);
    case TextCompare.doesNotContain:
      return !a.includes(b);
    default:
      return false;
  }
}
function compareValues(actual: unknown, expected: unknown, operator: number): boolean {
  if (actual instanceof Date || expected instanceof Date) {
    const a = actual instanceof Date ? actual.getTime() : asNumber(actual);
    const b = expected instanceof Date ? expected.getTime() : asNumber(expected);
    if (Number.isNaN(a) || Number.isNaN(b)) return false;
    return compareNumbers(a, b, operator);
  }
  if (typeof actual === 'number' || typeof expected === 'number') {
    const a = asNumber(actual);
    const b = asNumber(expected);
    if (Number.isNaN(a) || Number.isNaN(b)) return false;
    return compareNumbers(a, b, operator);
  }
  const a = asText(actual).toLowerCase();
  const b = asText(expected).toLowerCase();
  switch (operator) {
    case Compare.equalsTo:
      return a === b;
    case Compare.notEqualsTo:
      return a !== b;
    case Compare.greaterThan:
      return a > b;
    case Compare.greaterThanOrEqualsTo:
      return a >= b;
    case Compare.lessThan:
      return a < b;
    case Compare.lessThanOrEqualsTo:
      return a <= b;
    default:
      return false;
  }
}
function compareNumbers(a: number, b: number, operator: number): boolean {
  switch (operator) {
    case Compare.equalsTo:
      return a === b;
    case Compare.notEqualsTo:
      return a !== b;
    case Compare.greaterThan:
      return a > b;
    case Compare.greaterThanOrEqualsTo:
      return a >= b;
    case Compare.lessThan:
      return a < b;
    case Compare.lessThanOrEqualsTo:
      return a <= b;
    default:
      return false;
  }
}
function serialDate(value: unknown): Date | null {
  if (value instanceof Date) return value;
  if (typeof value === 'number') {
    const ms = Math.round((value - 25569) * 86400000);
    return new Date(ms);
  }
  if (typeof value === 'string' && value) {
    const match = /^\/OADate\((-?[\d.]+)\)\/$/.exec(value);
    if (match) return serialDate(Number(match[1]));
  }
  return null;
}
function dateCompare(actual: unknown, expected: unknown, operator: number, precise = false): boolean {
  const a = serialDate(actual);
  const b = serialDate(expected);
  if (!a || !b) return false;
  let av = a.getTime();
  let bv = b.getTime();
  if (!precise) {
    av = Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate());
    bv = Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate());
  }
  switch (operator) {
    case DateCompare.equalsTo:
      return av === bv;
    case DateCompare.notEqualsTo:
      return av !== bv;
    case DateCompare.before:
      return av < bv;
    case DateCompare.beforeEqualsTo:
      return av <= bv;
    case DateCompare.after:
      return av > bv;
    case DateCompare.afterEqualsTo:
      return av >= bv;
    default:
      return false;
  }
}

export class Condition {
  /** Public constructor signature: (conditionType, args). */
  constructor(conditionType: number, args: JsonRecord = {}) {
    this.conType = Number(conditionType);
    this.args = { ...args };
    if (args.compareType !== undefined) this.cmp = Number(args.compareType);
    if (args.ignoreCase !== undefined) this.ignoreCase_ = !!args.ignoreCase;
    if (args.useWildCards !== undefined) this.wildCards_ = !!args.useWildCards;
    if (args.item1 !== undefined) this.one = args.item1 as Condition;
    if (args.item2 !== undefined) this.two = args.item2 as Condition;
  }
  private conType: number;
  private args: JsonRecord;
  private cmp?: number;
  private one?: Condition;
  private two?: Condition;
  private ranges_: Range[] = [];
  private ignoreBlank_ = false;
  private ignoreCase_ = false;
  private wildCards_ = true;
  private precise_ = false;
  private treatNullAsZero_ = false;
  private baseRow_ = 0;
  private baseColumn_ = 0;

  static fromSource(expected: string): Condition {
    return new Condition(ConditionType.areaCondition!, { expected });
  }
  static fromFormula(formula: string): Condition {
    return new Condition(ConditionType.areaCondition!, { expected: '', formula });
  }
  static fromDay(day: number): Condition {
    return new Condition(ConditionType.dateExCondition!, { expectTypeId: 5, expected: day });
  }
  static fromMonth(month: number): Condition {
    return new Condition(ConditionType.dateExCondition!, { expectTypeId: 3, expected: month });
  }
  static fromQuarter(quarter: number): Condition {
    return new Condition(ConditionType.dateExCondition!, { expectTypeId: 4, expected: quarter });
  }
  static fromWeek(week: number): Condition {
    return new Condition(ConditionType.dateExCondition!, { expectTypeId: 2, expected: week });
  }
  static fromYear(year: number): Condition {
    return new Condition(ConditionType.dateExCondition!, { expectTypeId: 1, expected: year });
  }
  static fromJSON(data: unknown): Condition {
    const json = data && typeof data === 'object' ? (data as JsonRecord) : {};
    const condition = new Condition(Number(json.conType ?? 0), deserializeValue(json) as JsonRecord);
    condition.readJSON(json);
    return condition;
  }

  private cachedValue<T>(key: string, get: () => T): T {
    if (this.args[key] !== undefined) return this.args[key] as T;
    const value = get();
    this.args[key] = value as unknown;
    return value;
  }

  compareType(value?: number): number | this {
    if (value === undefined) return this.cmp!;
    this.cmp = value;
    return this;
  }
  expected(value?: unknown): unknown {
    if (value === undefined) return this.cachedValue('expected', () => '');
    this.args.expected = value;
    return this;
  }
  formula(formulaOrBaseRow?: string | number, baseColumn?: number): unknown {
    if (typeof formulaOrBaseRow === 'number') {
      this.baseRow_ = formulaOrBaseRow;
      this.baseColumn_ = baseColumn ?? 0;
      return this;
    }
    if (formulaOrBaseRow === undefined) return this.args.formula ?? '';
    this.args.formula = formulaOrBaseRow;
    return this;
  }
  ignoreBlank(value?: boolean): boolean | this {
    if (value === undefined) return this.ignoreBlank_;
    this.ignoreBlank_ = !!value;
    this.args.ignoreBlank = !!value;
    this.one?.ignoreBlank(value);
    this.two?.ignoreBlank(value);
    return this;
  }
  ignoreCase(value?: boolean): boolean | this {
    if (value === undefined) return this.ignoreCase_;
    this.ignoreCase_ = !!value;
    return this;
  }
  useWildCards(value?: boolean): boolean | this {
    if (value === undefined) return this.wildCards_;
    this.wildCards_ = !!value;
    return this;
  }
  preciseCompareDate(value?: boolean): boolean | this {
    if (value === undefined) return this.precise_;
    this.precise_ = !!value;
    return this;
  }
  treatNullValueAsZero(value?: boolean): boolean | this {
    if (value === undefined) return this.treatNullAsZero_;
    this.treatNullAsZero_ = !!value;
    return this;
  }
  item1(value?: Condition): Condition | this {
    if (value === undefined) return this.one!;
    this.one = value;
    this.args.item1 = value;
    return this;
  }
  item2(value?: Condition): Condition | this {
    if (value === undefined) return this.two!;
    this.two = value;
    this.args.item2 = value;
    return this;
  }
  ranges(): Range[];
  ranges(value: Range[]): this;
  ranges(value?: Range[]): Range[] | this {
    if (value === undefined) return this.ranges_;
    this.ranges_ = value;
    this.args.ranges = value;
    this.one?.ranges(value);
    this.two?.ranges(value);
    return this;
  }
  reset(): void {
    this.args = {};
    this.cmp = undefined;
    this.one = undefined;
    this.two = undefined;
    this.ranges_ = [];
    this.ignoreBlank_ = false;
    this.ignoreCase_ = false;
    this.wildCards_ = true;
    this.precise_ = false;
  }
  toJSON(): JsonRecord {
    const json: JsonRecord = { conType: this.conType };
    if (this.cmp !== undefined) json.compareType = this.cmp;
    if (this.one) { json.item1 = this.one.toJSON(); if (!this.ranges_.length || this.one.conType === 13) delete (json.item1 as JsonRecord).ignoreBlank; }
    if (this.two) { json.item2 = this.two.toJSON(); if (!this.ranges_.length || this.two.conType === 13) delete (json.item2 as JsonRecord).ignoreBlank; }
    for (const key of ['expected', 'formula', 'expectTypeId', 'customValueType', 'integerValue'])
      if (this.args[key] !== undefined && !(key === 'integerValue' && !this.args[key])) json[key] = serializeValue(this.args[key]);
    if (this.args.ignoreBlank !== undefined) json.ignoreBlank = this.args.ignoreBlank;
    if (this.args.ignoreCase !== undefined) json.ignoreCase = this.args.ignoreCase;
    if (this.args.useWildCards !== undefined) json.useWildCards = this.args.useWildCards;
    if (this.ranges_.length)
      json.ranges = this.ranges_.map((range) => ({
        row: range.row,
        col: range.col,
        rowCount: range.rowCount,
        colCount: range.colCount,
      }));
    return json;
  }
  private readJSON(json: JsonRecord): void {
    if (json.compareType !== undefined) this.cmp = Number(json.compareType);
    if (json.item1) this.one = Condition.fromJSON(json.item1);
    if (json.item2) this.two = Condition.fromJSON(json.item2);
    if (json.expected !== undefined) this.args.expected = deserializeValue(json.expected);
    if (json.formula !== undefined) this.args.formula = json.formula;
    if (json.expectTypeId !== undefined) this.args.expectTypeId = Number(json.expectTypeId);
    if (json.customValueType !== undefined) this.args.customValueType = Number(json.customValueType);
    if (json.integerValue !== undefined) this.args.integerValue = !!json.integerValue;
    if (json.ignoreBlank !== undefined) this.ignoreBlank_ = !!json.ignoreBlank;
    for (const raw of Array.isArray(json.ranges) ? json.ranges : []) {
      const range = raw as JsonRecord;
      this.ranges_.push(
        new Range(Number(range.row), Number(range.col), Number(range.rowCount), Number(range.colCount)),
      );
    }
  }

  /** Expected value, evaluating a formula or a cell reference when necessary. */
  getExpected(evaluator: unknown, baseRow: number, baseColumn: number): unknown {
    const sheet = evaluator as EvalHost | undefined;
    const value = this.args.expected;
    const formula = this.args.formula;
    if (typeof formula === 'string' && formula) {
      if (sheet && typeof evaluateFormula === 'function') {
        try {
          return evaluateFormula(sheet, formula.startsWith('=') ? formula : `=${formula}`, baseRow, baseColumn);
        } catch {
          return formula;
        }
      }
      return formula;
    }
    if (typeof value === 'string' && value.startsWith('=') && sheet) {
      try {
        return evaluateFormula(sheet, value, baseRow, baseColumn);
      } catch {
        return value;
      }
    }
    return value;
  }

  /** List of allowed values for list conditions. */
  getValidList(evaluator: unknown, baseRow: number, baseColumn: number): unknown[] {
    const sheet = evaluator as EvalHost | undefined;
    const formula = this.args.formula;
    if (typeof formula === 'string' && formula) {
      const text = formula.startsWith('=') ? formula.slice(1) : formula;
      if (sheet) {
        const rangeMatch = /^([A-Za-z]{1,3})(\d+):([A-Za-z]{1,3})(\d+)$/.exec(text.trim());
        if (rangeMatch) {
          const col = (letters: string): number => {
            let value = 0;
            for (const ch of letters.toUpperCase()) value = value * 26 + ch.charCodeAt(0) - 64;
            return value - 1;
          };
          const c1 = col(rangeMatch[1]!), r1 = Number(rangeMatch[2]) - 1;
          const c2 = col(rangeMatch[3]!), r2 = Number(rangeMatch[4]) - 1;
          const rows = sheet.getArray(Math.min(r1, r2), Math.min(c1, c2), Math.abs(r2 - r1) + 1, Math.abs(c2 - c1) + 1);
          return rows.flat();
        }
        try {
          const result = evaluateFormula(sheet, formula.startsWith('=') ? formula : `=${formula}`, baseRow, baseColumn);
          return flattenValues(result);
        } catch {
          return [];
        }
      }
      return [];
    }
    const expected = this.args.expected;
    if (Array.isArray(expected)) return expected;
    if (typeof expected === 'string') return expected.split(',').map((value) => value.trim());
    return expected == null ? [] : [expected];
  }

  evaluate(evaluator: unknown, baseRow: number, baseColumn: number, actualObj: unknown): boolean {
    if (this.ignoreBlank_ && isBlank(actualObj)) return true;
    const actual = actualObj;
    switch (this.conType) {
      case ConditionType.relationCondition:
        return (
          (this.one?.evaluate(evaluator, baseRow, baseColumn, actual) ?? false) &&
          (this.two?.evaluate(evaluator, baseRow, baseColumn, actual) ?? false)
        );
      case ConditionType.numberCondition:
      case ConditionType.cellValueCondition: {
        const expected = this.getExpected(evaluator, baseRow, baseColumn);
        if (this.args.integerValue && !Number.isInteger(asNumber(actual))) return false;
        return compareValues(actual, expected, this.cmp ?? Compare.equalsTo);
      }
      case ConditionType.textCondition: {
        const expected = asText(this.getExpected(evaluator, baseRow, baseColumn));
        return textMatches(asText(actual), expected, this.cmp ?? TextCompare.equalsTo, this.ignoreCase_);
      }
      case ConditionType.formulaCondition: {
        const formula = String(this.args.formula ?? '');
        if (!formula) return false;
        try {
          const result = evaluateFormula(evaluator as Worksheet, formula.startsWith('=') ? formula : `=${formula}`, baseRow, baseColumn);
          return !!result && !(result as { error?: string }).error;
        } catch {
          return false;
        }
      }
      case ConditionType.dateCondition: {
        const expected = this.getExpected(evaluator, baseRow, baseColumn);
        return dateCompare(actual, expected, this.cmp ?? DateCompare.equalsTo, this.precise_);
      }
      case ConditionType.dateExCondition: {
        const date = serialDate(actual);
        if (!date) return false;
        const expected = Number(this.args.expected);
        switch (this.args.expectTypeId) {
          case 1:
            return date.getFullYear() === expected;
          case 2: {
            const start = new Date(date.getFullYear(), 0, 1);
            const week = Math.floor((date.getTime() - start.getTime()) / 604800000) + 1;
            return week === expected;
          }
          case 3:
            return date.getMonth() + 1 === expected;
          case 4:
            return Math.floor(date.getMonth() / 3) + 1 === expected;
          case 5:
            return date.getDate() === expected;
          default:
            return false;
        }
      }
      case 13: {
        const expected = this.getExpected(evaluator, baseRow, baseColumn);
        const actualFraction = timeFraction(actual);
        const expectedFraction = timeFraction(expected);
        if (!Number.isFinite(actualFraction) || !Number.isFinite(expectedFraction)) return false;
        const cmp = this.cmp ?? DateCompare.equalsTo;
        return cmp === DateCompare.equalsTo
          ? actualFraction === expectedFraction
          : cmp === DateCompare.notEqualsTo
            ? actualFraction !== expectedFraction
            : cmp === DateCompare.before
              ? actualFraction < expectedFraction
              : cmp === DateCompare.beforeEqualsTo
                ? actualFraction <= expectedFraction
                : cmp === DateCompare.after
                  ? actualFraction > expectedFraction
                  : actualFraction >= expectedFraction;
      }
      case ConditionType.textLengthCondition: {
        const expected = Number(this.getExpected(evaluator, baseRow, baseColumn));
        const length = asText(actual).length;
        return compareNumbers(length, expected, this.cmp ?? Compare.equalsTo);
      }
      case ConditionType.areaCondition: {
        const values = this.getValidList(evaluator, baseRow, baseColumn);
        const text = asText(actual);
        return values.some((value) => asText(value) === text);
      }
      case ConditionType.colorCondition: {
        const style = (evaluator as Worksheet)?.getActualStyle?.(baseRow, baseColumn);
        const color = style?.[this.cmp === 1 ? 'foreColor' : 'backColor'];
        return typeof color === 'string' && resolveColor(color) === resolveColor(String(this.args.expected));
      }
      default:
        return false;
    }
  }
}

/** Flattens an evaluation result (array, reference or scalar) into plain values. */
export function flattenValues(value: unknown): unknown[] {
  if (value === null || value === undefined) return [];
  if (Array.isArray(value)) return value.flatMap(flattenValues);
  if (value instanceof Date) return [value];
  if (typeof value === 'object') {
    const record = value as { toArray?: () => unknown[][]; error?: string; value?: unknown };
    if (typeof record.toArray === 'function') return flattenValues(record.toArray());
    if (record.error) return [value];
    if ('value' in record) return flattenValues(record.value);
  }
  return [value];
}
export const conditionEnums = { ConditionType, Compare, TextCompare, DateCompare };
