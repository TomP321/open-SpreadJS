/**
 * Data validation: criteria types, conditions, list sources, messages,
 * highlight styles and the factory helpers exposed by the trial.
 */
import { Range } from '../primitives.js';
import { GC } from '../generated/enums.js';
import { Condition } from './conditions.js';
import { columnLabel } from '../calc/parser.js';
import { deserializeValue, serializeValue, type JsonRecord } from '../serialization.js';

const Criteria = GC.Spread.Sheets.DataValidation.CriteriaType;
const Comparison = GC.Spread.Sheets.ConditionalFormatting.ComparisonOperators;

export function rangeToAddress(range: Range): string {
  const start = range.row < 0 ? '' : `${columnLabel(range.col)}${range.row + 1}`;
  if (range.rowCount <= 1 && range.colCount <= 1) return start;
  const end = `${columnLabel(range.col + range.colCount - 1)}${range.row + range.rowCount}`;
  return `${start}:${end}`;
}
export function addressToRange(address: string): Range {
  const text = String(address ?? '').replace(/\$/g, '');
  const [start, end = start] = text.split(':');
  const parse = (part?: string): [number, number] => {
    const match = /^([A-Za-z]+)(\d+)$/.exec(part ?? '');
    if (!match) return [0, 0];
    let col = 0;
    for (const ch of match[1]!.toUpperCase()) col = col * 26 + ch.charCodeAt(0) - 64;
    return [Number(match[2]) - 1, col - 1];
  };
  const [r1, c1] = parse(start);
  const [r2, c2] = parse(end);
  return new Range(Math.min(r1, r2), Math.min(c1, c2), Math.abs(r2 - r1) + 1, Math.abs(c2 - c1) + 1);
}

function defaultHighlight(): string {
  return JSON.stringify({ type: 0, color: 'red' });
}

export class DefaultDataValidator {
  private conditionValue?: Condition;
  private typeValue = Criteria.anyValue;
  private comparisonOperatorValue?: number;
  private ignoreBlankValue = true;
  private dropdownValue = true;
  private errorStyleValue = 0;
  private showErrorMessageValue = true;
  private showInputMessageValue = true;
  private errorTitleValue = '';
  private errorMessageValue = '';
  private inputTitleValue = '';
  private inputMessageValue = '';
  private highlight = defaultHighlight();
  private precise = false;
  private ranges_: Range[] = [];
  constructor(condition?: Condition) {
    this.conditionValue = condition;
  }
  type(value?: number): number | this {
    if (value === undefined) return this.typeValue;
    this.typeValue = value;
    return this;
  }
  condition(value?: Condition): Condition | undefined | this {
    if (value === undefined) return this.conditionValue;
    this.conditionValue = value;
    return this;
  }
  /** Numeric `compareType` of a condition (the getter also returns `this` on set calls). */
  private static cmpOf(condition: Condition): number {
    const value: unknown = condition.compareType();
    return typeof value === 'number' ? value : 0;
  }
  comparisonOperator(value?: number): number | this {
    if (value === undefined) {
      if (this.comparisonOperatorValue !== undefined) return this.comparisonOperatorValue;
      const condition = this.conditionValue;
      if (!condition) return 0;
      const ops = GC.Spread.Sheets.ConditionalFormatting.ComparisonOperators;
      const first = condition.item1();
      const second = condition.item2();
      if (first && second)
        return DefaultDataValidator.cmpOf(first) === 3 || DefaultDataValidator.cmpOf(second) === 3 ? ops.between : ops.notBetween;
      if (this.typeValue === Criteria.date || this.typeValue === Criteria.time) {
        const map: Record<number, number> = { 0: 0, 1: 1, 2: 4, 3: 5, 4: 2, 5: 3 };
        return map[DefaultDataValidator.cmpOf(condition)] ?? 0;
      }
      return DefaultDataValidator.cmpOf(condition);
    }
    this.comparisonOperatorValue = value;
    return this;
  }
  ignoreBlank(value?: boolean): boolean | this {
    if (value === undefined) return this.ignoreBlankValue;
    this.ignoreBlankValue = !!value;
    this.conditionValue?.ignoreBlank(value);
    return this;
  }
  inCellDropdown(value?: boolean): boolean | this {
    if (value === undefined) return this.dropdownValue;
    this.dropdownValue = !!value;
    return this;
  }
  errorStyle(value?: number): number | this {
    if (value === undefined) return this.errorStyleValue;
    this.errorStyleValue = value;
    return this;
  }
  errorTitle(value?: string): string | this {
    if (value === undefined) return this.errorTitleValue;
    this.errorTitleValue = value;
    return this;
  }
  errorMessage(value?: string): string | this {
    if (value === undefined) return this.errorMessageValue;
    this.errorMessageValue = value;
    return this;
  }
  inputTitle(value?: string): string | this {
    if (value === undefined) return this.inputTitleValue;
    this.inputTitleValue = value;
    return this;
  }
  inputMessage(value?: string): string | this {
    if (value === undefined) return this.inputMessageValue;
    this.inputMessageValue = value;
    return this;
  }
  showErrorMessage(value?: boolean): boolean | this {
    if (value === undefined) return this.showErrorMessageValue;
    this.showErrorMessageValue = !!value;
    return this;
  }
  showInputMessage(value?: boolean): boolean | this {
    if (value === undefined) return this.showInputMessageValue;
    this.showInputMessageValue = !!value;
    return this;
  }
  highlightStyle(style?: JsonRecord | string): JsonRecord | string | this {
    if (style === undefined) {
      try {
        return JSON.parse(this.highlight) as JsonRecord;
      } catch {
        return this.highlight;
      }
    }
    this.highlight = typeof style === 'string' ? style : JSON.stringify(style);
    return this;
  }
  preciseCompareDate(value?: boolean): boolean | this {
    if (value === undefined) return this.precise;
    this.precise = !!value;
    this.conditionValue?.preciseCompareDate(value);
    return this;
  }
  value1(baseRow?: number, baseColumn?: number): unknown {
    const condition = this.conditionValue;
    if (!condition) return null;
    if (condition.item1()) return condition.item1()!.getExpected(null, baseRow ?? 0, baseColumn ?? 0);
    const formula = condition.formula();
    if ((this.typeValue === Criteria.custom || this.typeValue === Criteria.list) && formula)
      return '=' + String(formula);
    return condition.getExpected(null, baseRow ?? 0, baseColumn ?? 0);
  }
  value2(baseRow?: number, baseColumn?: number): unknown {
    const item = this.conditionValue?.item2();
    if (item) return item.getExpected(null, baseRow ?? 0, baseColumn ?? 0);
    return this.value1(baseRow, baseColumn);
  }
  reset(): void {
    this.conditionValue = undefined;
    this.typeValue = Criteria.anyValue;
    this.comparisonOperatorValue = undefined;
    this.ignoreBlankValue = true;
    this.dropdownValue = true;
    this.errorStyleValue = 0;
    this.showErrorMessageValue = true;
    this.showInputMessageValue = true;
    this.errorTitleValue = '';
    this.errorMessageValue = '';
    this.inputTitleValue = '';
    this.inputMessageValue = '';
    this.highlight = defaultHighlight();
  }
  getValidList(evaluator: unknown, baseRow: number, baseColumn: number): unknown[] {
    return this.conditionValue?.getValidList(evaluator, baseRow, baseColumn) ?? [];
  }
  isValid(evaluator: unknown, baseRow: number, baseColumn: number, actual: unknown): boolean {
    if (this.typeValue === Criteria.anyValue) return true;
    if (this.ignoreBlankValue && (actual === null || actual === undefined || actual === '')) return true;
    if (!this.conditionValue) return true;
    return this.conditionValue.evaluate(evaluator, baseRow, baseColumn, actual);
  }
  _ranges(value?: Range[]): Range[] {
    if (value === undefined) return this.ranges_;
    this.ranges_ = value;
    return this.ranges_;
  }
  toJSON(): JsonRecord {
    const result: JsonRecord = {};
    const relation =
      this.conditionValue && this.conditionValue.item1() !== undefined;
    const operator = this.comparisonOperator();
    if (
      (!relation || operator === 7) &&
      (this.comparisonOperatorValue !== undefined ||
        (!!this.conditionValue && (relation ||
          [Criteria.wholeNumber, Criteria.decimalValues, Criteria.date, Criteria.time, Criteria.textLength].includes(this.typeValue))))
    )
      result.comparisonOperator = operator;
    if (this.errorMessageValue) result.errorMessage = this.errorMessageValue;
    if (this.errorStyleValue) result.errorStyle = this.errorStyleValue;
    if (this.errorTitleValue) result.errorTitle = this.errorTitleValue;
    result.highlightStyle = this.highlight;
    if (this.inputMessageValue) result.inputMessage = this.inputMessageValue;
    if (this.inputTitleValue) result.inputTitle = this.inputTitleValue;
    if (!this.dropdownValue) result.inCellDropdown = false;
    if (!this.showErrorMessageValue) result.showErrorMessage = false;
    if (!this.showInputMessageValue) result.showInputMessage = false;
    if (!this.ignoreBlankValue) result.ignoreBlank = false;
    if (this.conditionValue) {
      if (this.ranges_.length) this.conditionValue.ranges(this.ranges_);
      result.condition = serializeValue(this.conditionToJSON(this.conditionValue));
    }
    result.ranges = this.ranges_.length ? this.ranges_.map(rangeToAddress).join(', ') : '';
    result.type = this.typeValue;
    return result;
  }
  private conditionToJSON(condition: Condition): JsonRecord {
    const json = condition.toJSON();
    if (condition.ranges().length && json.ranges === undefined)
      json.ranges = condition.ranges().map((range) => ({
        row: range.row,
        col: range.col,
        rowCount: range.rowCount,
        colCount: range.colCount,
      }));
    return json;
  }
  fromJSON(data: object): void {
    const json = deserializeValue(data) as JsonRecord;
    this.reset();
    this.typeValue = Number(json.type ?? Criteria.anyValue);
    if (json.comparisonOperator !== undefined) this.comparisonOperatorValue = Number(json.comparisonOperator);
    if (json.errorMessage !== undefined) this.errorMessageValue = String(json.errorMessage);
    if (json.errorStyle !== undefined) this.errorStyleValue = Number(json.errorStyle);
    if (json.errorTitle !== undefined) this.errorTitleValue = String(json.errorTitle);
    if (json.inputMessage !== undefined) this.inputMessageValue = String(json.inputMessage);
    if (json.inputTitle !== undefined) this.inputTitleValue = String(json.inputTitle);
    if (json.inCellDropdown !== undefined) this.dropdownValue = !!json.inCellDropdown;
    if (json.showErrorMessage !== undefined) this.showErrorMessageValue = !!json.showErrorMessage;
    if (json.showInputMessage !== undefined) this.showInputMessageValue = !!json.showInputMessage;
    if (json.ignoreBlank !== undefined) this.ignoreBlankValue = !!json.ignoreBlank;
    if (json.highlightStyle !== undefined)
      this.highlight = typeof json.highlightStyle === 'string' ? json.highlightStyle : JSON.stringify(json.highlightStyle);
    if (json.condition) this.conditionValue = Condition.fromJSON(json.condition);
    const ranges = json.ranges;
    if (typeof ranges === 'string')
      this.ranges_ = ranges.trim() ? ranges.split(',').map((address) => addressToRange(address)) : [];
  }
}

function setType(validator: DefaultDataValidator, type: number, condition: Condition): DefaultDataValidator {
  validator.type(type);
  validator.condition(condition);
  condition.ignoreBlank(true);
  return validator;
}
export function createListValidator(source: string): DefaultDataValidator {
  return setType(new DefaultDataValidator(), Criteria.list, Condition.fromSource(source));
}
export function createFormulaListValidator(formula: string): DefaultDataValidator {
  const normalized = formula.startsWith('=') ? formula.slice(1) : formula;
  return setType(new DefaultDataValidator(), Criteria.list, Condition.fromFormula(normalized));
}
export function createNumberValidator(
  typeOperator: number,
  v1: unknown,
  v2?: unknown,
  isIntegerValue?: boolean,
): DefaultDataValidator {
  const type = isIntegerValue ? Criteria.wholeNumber : Criteria.decimalValues;
  const condition = numberCondition(typeOperator, v1, v2, !!isIntegerValue);
  return setType(new DefaultDataValidator(), type, condition);
}
function numberCondition(typeOperator: number, v1: unknown, v2: unknown, integer: boolean): Condition {
  if (typeOperator === Comparison.between || typeOperator === Comparison.notBetween) {
    const low = typeOperator === Comparison.between ? Comparison.greaterThanOrEqualsTo : Comparison.lessThan;
    const high = typeOperator === Comparison.between ? Comparison.lessThanOrEqualsTo : Comparison.greaterThan;
    const outer = new Condition(0, { compareType: typeOperator === Comparison.between ? 1 : 0 });
    outer.item1(new Condition(1, { compareType: low, expected: v1, integerValue: integer }));
    outer.item2(new Condition(1, { compareType: high, expected: v2, integerValue: integer }));
    return outer;
  }
  return new Condition(1, {
    compareType: typeOperator,
    expected: v1,
    ...(integer ? { integerValue: true } : {}),
  });
}
export function createDateValidator(typeOperator: number, v1: unknown, v2?: unknown): DefaultDataValidator {
  const condition = dateCondition(typeOperator, v1, v2);
  return setType(new DefaultDataValidator(), Criteria.date, condition);
}
function dateCondition(typeOperator: number, v1: unknown, v2: unknown): Condition {
  if (typeOperator === Comparison.between || typeOperator === Comparison.notBetween) {
    const outer = new Condition(0, { compareType: 1 });
    outer.item1(new Condition(5, { compareType: 5, expected: v1 }));
    outer.item2(new Condition(5, { compareType: 3, expected: v2 }));
    return outer;
  }
  const dateOp: Record<number, number> = { 0: 0, 1: 1, 2: 4, 3: 5, 4: 2, 5: 3 };
  return new Condition(5, { compareType: dateOp[typeOperator] ?? typeOperator, expected: v1 });
}
export function createTimeValidator(typeOperator: number, v1: unknown, v2?: unknown): DefaultDataValidator {
  const timeOp: Record<number, number> = { 0: 0, 1: 1, 2: 4, 3: 5, 4: 2, 5: 3 };
  if (typeOperator === Comparison.between || typeOperator === Comparison.notBetween) {
    const outer = new Condition(0, { compareType: 1 });
    outer.item1(new Condition(13, { compareType: Comparison.lessThanOrEqualsTo, expected: v1 }));
    outer.item2(new Condition(13, { compareType: Comparison.greaterThanOrEqualsTo, expected: v2 }));
    return setType(new DefaultDataValidator(), Criteria.time, outer);
  }
  return setType(new DefaultDataValidator(), Criteria.time, new Condition(13, { compareType: timeOp[typeOperator] ?? typeOperator, expected: v1 }));
}
export function createTextLengthValidator(typeOperator: number, v1: unknown, v2?: unknown): DefaultDataValidator {
  if (typeOperator === Comparison.between || typeOperator === Comparison.notBetween) {
    const between = typeOperator === Comparison.between;
    const outer = new Condition(0, { compareType: between ? 1 : 0 });
    outer.item1(new Condition(7, { compareType: between ? Comparison.greaterThanOrEqualsTo : Comparison.lessThan, expected: v1 }));
    outer.item2(new Condition(7, { compareType: between ? Comparison.lessThanOrEqualsTo : Comparison.greaterThan, expected: v2 }));
    return setType(new DefaultDataValidator(), Criteria.textLength, outer);
  }
  return setType(new DefaultDataValidator(), Criteria.textLength, new Condition(7, { compareType: typeOperator, expected: v1 }));
}
export function createFormulaValidator(formula: string): DefaultDataValidator {
  const normalized = formula.startsWith('=') ? formula.slice(1) : formula;
  const condition = new Condition(4, { customValueType: 4, formula: normalized });
  return setType(new DefaultDataValidator(), Criteria.custom, condition);
}

export interface ValidatorRecord {
  ranges: Range[];
  validator: DefaultDataValidator;
}
export function validatorFromJSON(data: unknown): { record: ValidatorRecord; validator: DefaultDataValidator } {
  const json = deserializeValue(data) as JsonRecord;
  const validator = new DefaultDataValidator();
  validator.fromJSON(json);
  const ranges = json.ranges;
  const list = typeof ranges === 'string' ? ranges.split(/\s*,\s*/) : ['A1'];
  return { record: { ranges: list.map((address) => addressToRange(address)), validator }, validator };
}
