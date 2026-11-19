/**
 * Shared base class and helpers for conditional-formatting rules, plus the
 * generated-enum accessors every rule module uses. Moved out of
 * `features/conditional-formatting.ts` unchanged (with `export` added to the
 * previously module-private consts and helpers).
 */
import { Range, Style } from '../primitives.js';
import { GC } from '../generated/enums.js';
import { Condition } from './conditions.js';
import { styleFromJSON, styleToJSON, type JsonRecord } from '../serialization.js';

export { Condition };
/** The `ConditionalFormatting` enum tables of the generated contract, e.g. `CF.RuleType`. */
export const CF = GC.Spread.Sheets.ConditionalFormatting;
export const RuleType = CF.RuleType;
export const ScaleType = CF.ScaleValueType;

export function rangesToJSON(ranges: Range[]): JsonRecord[] {
  return ranges.map((range) => ({
    row: range.row,
    col: range.col,
    rowCount: range.rowCount,
    colCount: range.colCount,
  }));
}
export function rangesFromJSON(value: unknown): Range[] {
  return (Array.isArray(value) ? value : []).map((raw) => {
    const json = raw as JsonRecord;
    return new Range(Number(json.row), Number(json.col), Number(json.rowCount), Number(json.colCount));
  });
}
export function styleOrUndefined(value: unknown): Style | undefined {
  if (!value) return undefined;
  if (value instanceof Style) return value;
  if (typeof value === 'string') return Object.assign(new Style(), { parentName: value });
  return styleFromJSON(value) as Style;
}

export class ConditionRuleBase {
  protected ruleTypeValue: number;
  protected styleValue?: Style;
  protected rangesValue: Range[];
  protected priorityValue?: number;
  protected stopValue = false;
  protected conditionValue?: Condition;
  protected priorityExplicit = false;
  constructor(ruleType: number, style?: Style, ranges?: Range[]) {
    this.ruleTypeValue = Number(ruleType);
    this.styleValue = style;
    this.rangesValue = ranges ? ranges.map((range) => new Range(range.row, range.col, range.rowCount, range.colCount)) : [];
  }
  ruleType(value?: number): number | this {
    if (value === undefined) return this.ruleTypeValue;
    this.ruleTypeValue = value;
    return this;
  }
  style(value?: Style): Style | undefined | this {
    if (value === undefined) return this.styleValue;
    this.styleValue = value;
    return this;
  }
  ranges(): Range[];
  ranges(value: Range[]): this;
  ranges(value?: Range[]): Range[] | this {
    if (value === undefined) return this.rangesValue;
    this.rangesValue = value.map((range) => new Range(range.row, range.col, range.rowCount, range.colCount));
    return this;
  }
  priority(value?: number): number | this {
    if (value === undefined) return this.priorityValue ?? 1;
    this.priorityValue = Number(value);
    this.priorityExplicit = true;
    return this;
  }
  _setPriority(value: number): void {
    this.priorityValue = value;
  }
  /** @internal Forget the explicit-priority mark when a rule is (re)inserted. */
  _resetPriorityExplicit(): void {
    this.priorityExplicit = false;
  }
  _priority(): number {
    return this.priorityValue ?? 1;
  }
  stopIfTrue(value?: boolean): boolean | this {
    if (value === undefined) return this.stopValue;
    this.stopValue = !!value;
    return this;
  }
  condition(value?: Condition): Condition | undefined | this {
    if (value === undefined) return this.conditionValue;
    this.conditionValue = value;
    return this;
  }
  createCondition(): Condition {
    return this.conditionValue ?? new Condition(0, {});
  }
  contains(row: number, column: number): boolean {
    return this.rangesValue.some(
      (range) =>
        range.row === -1 ||
        (row >= range.row && row < range.row + range.rowCount && column >= range.col && column < range.col + range.colCount),
    );
  }
  intersects(row: number, column: number, rowCount: number, columnCount: number): boolean {
    return this.rangesValue.some((range) => range.intersect(row, column, rowCount, columnCount));
  }
  isScaleRule(): boolean {
    return (
      this.ruleTypeValue === RuleType.twoScaleRule ||
      this.ruleTypeValue === RuleType.threeScaleRule ||
      this.ruleTypeValue === RuleType.dataBarRule ||
      this.ruleTypeValue === RuleType.iconSetRule
    );
  }
  getExpected(): Style | undefined {
    return this.styleValue;
  }
  evaluate(evaluator: unknown, baseRow: number, baseColumn: number, actual: unknown): Style | null {
    if (!this.conditionValue) return null;
    return this.conditionValue.evaluate(evaluator, baseRow, baseColumn, actual) ? (this.styleValue ?? new Style()) : null;
  }
  reset(): void {
    this.conditionValue = undefined;
    this.stopValue = false;
    this.priorityValue = undefined;
    this.priorityExplicit = false;
  }
  _shiftRanges(axis: 'row' | 'col', index: number, amount: number, remove: boolean): void {
    this.rangesValue = this.rangesValue.flatMap((range) => {
      const start = axis === 'row' ? range.row : range.col;
      const size = axis === 'row' ? range.rowCount : range.colCount;
      const end = start + size;
      if (remove) {
        if (end <= index) return [range];
        if (start >= index + amount) {
          return axis === 'row'
            ? [new Range(start - amount, range.col, size, range.colCount)]
            : [new Range(range.row, start - amount, range.rowCount, size)];
        }
        const nextStart = start < index ? start : index;
        const nextEnd = end >= index + amount ? end - amount : index;
        const nextSize = nextEnd - nextStart;
        if (nextSize <= 0) return [];
        return axis === 'row'
          ? [new Range(nextStart, range.col, nextSize, range.colCount)]
          : [new Range(range.row, nextStart, range.rowCount, nextSize)];
      }
      if (index <= start) {
        return axis === 'row'
          ? [new Range(start + amount, range.col, size, range.colCount)]
          : [new Range(range.row, start + amount, range.rowCount, size)];
      }
      if (index < end) {
        return axis === 'row'
          ? [new Range(start, range.col, size + amount, range.colCount)]
          : [new Range(range.row, start, range.rowCount, size + amount)];
      }
      return [range];
    });
  }
  toJSON(): JsonRecord {
    const result: JsonRecord = {
      ruleType: this.ruleTypeValue,
      ranges: rangesToJSON(this.rangesValue),
    };
    if (this.styleValue) result.style = styleToJSON(this.styleValue);
    if (this.priorityValue !== undefined && this.priorityValue !== 1) result.priority = this._priority();
    if (this.stopValue) result.stopIfTrue = true;
    return result;
  }
  readJSON(json: JsonRecord): void {
    if (json.priority !== undefined) {
      this.priorityValue = Number(json.priority);
      this.priorityExplicit = true;
    }
    if (json.stopIfTrue !== undefined) this.stopValue = !!json.stopIfTrue;
    if (json.ranges !== undefined) this.rangesValue = rangesFromJSON(json.ranges);
    if (json.style !== undefined) this.styleValue = styleOrUndefined(json.style);
  }
}
