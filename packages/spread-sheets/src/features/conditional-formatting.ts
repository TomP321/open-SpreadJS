/**
 * Conditional formatting rules: cell-value, text, formula, date, top/bottom,
 * unique/duplicate, average, two-/three-colour scales, data bars and icon sets.
 */
import { Range, Style } from '../primitives.js';
import { GC } from '../generated/enums.js';
import { Condition } from './conditions.js';
import { serializeValue, styleFromJSON, styleToJSON, type JsonRecord } from '../serialization.js';

export { Condition } from './conditions.js';
const CF = GC.Spread.Sheets.ConditionalFormatting as unknown as {
  RuleType: Record<string, number>;
  ComparisonOperators: Record<string, number>;
  TextComparisonOperators: Record<string, number>;
  ScaleValueType: Record<string, number>;
  Top10ConditionType: Record<string, number>;
  AverageConditionType: Record<string, number>;
  DateOccurringType: Record<string, number>;
  IconSetType: Record<string, number>;
  IconValueType: Record<string, number>;
  DataBarAxisPosition: Record<string, number>;
  BarDirection: Record<string, number>;
};
const RuleType = CF.RuleType;
const ScaleType = CF.ScaleValueType;

function rangesToJSON(ranges: Range[]): JsonRecord[] {
  return ranges.map((range) => ({
    row: range.row,
    col: range.col,
    rowCount: range.rowCount,
    colCount: range.colCount,
  }));
}
function rangesFromJSON(value: unknown): Range[] {
  return (Array.isArray(value) ? value : []).map((raw) => {
    const json = raw as JsonRecord;
    return new Range(Number(json.row), Number(json.col), Number(json.rowCount), Number(json.colCount));
  });
}
function styleOrUndefined(value: unknown): Style | undefined {
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

export class NormalConditionRule extends ConditionRuleBase {
  operatorValue?: number;
  textValue = '';
  formulaValue = '';
  typeValue = 0;
  rankValue = 1;
  percentValue?: boolean;
  percentSpecified = false;
  value1Value: unknown = null;
  value2Value: unknown = null;
  constructor(
    ruleType: number,
    ranges?: Range[],
    style?: Style,
    operator?: number,
    value1?: unknown,
    value2?: unknown,
    text?: string,
    formula?: string,
    type?: number,
    rank?: number,
    isPercent?: boolean,
  ) {
    super(ruleType, style, ranges);
    this.operatorValue = operator;
    this.value1Value = value1;
    this.value2Value = value2;
    this.textValue = text ?? '';
    this.formulaValue = formula ?? '';
    this.typeValue = type ?? 0;
    this.rankValue = rank ?? 1;
    this.percentValue = isPercent;
    this.percentSpecified = isPercent !== undefined;
    this.conditionValue = this.createCondition();
  }
  operator(value?: number): number | this {
    if (value === undefined) return this.operatorValue!;
    this.operatorValue = value;
    return this;
  }
  text(value?: string): string | this {
    if (value === undefined) return this.textValue;
    this.textValue = value;
    return this;
  }
  formula(formulaOrBaseRow?: string | number, baseColumn?: number): unknown {
    if (typeof formulaOrBaseRow === 'number') {
      this.value1Value = formulaOrBaseRow;
      this.value2Value = baseColumn ?? 0;
      return this;
    }
    if (formulaOrBaseRow === undefined) return this.formulaValue;
    this.formulaValue = formulaOrBaseRow;
    return this;
  }
  type(value?: number): number | this {
    if (value === undefined) return this.typeValue;
    this.typeValue = value;
    return this;
  }
  rank(value?: number): number | this {
    if (value === undefined) return this.rankValue;
    this.rankValue = value;
    return this;
  }
  isPercent(value?: boolean): boolean | this {
    if (value === undefined) return this.percentValue as boolean;
    this.percentValue = !!value;
    return this;
  }
  value1(valueOrBaseRow?: unknown, baseColumn?: number): unknown {
    if (typeof valueOrBaseRow === 'number' && baseColumn !== undefined) {
      this.value1Value = valueOrBaseRow;
      this.value2Value = baseColumn;
      return this;
    }
    if (valueOrBaseRow === undefined) return this.value1Value;
    this.value1Value = valueOrBaseRow;
    return this;
  }
  value2(valueOrBaseRow?: unknown, baseColumn?: number): unknown {
    if (typeof valueOrBaseRow === 'number' && baseColumn !== undefined) {
      this.value1Value = valueOrBaseRow;
      this.value2Value = baseColumn;
      return this;
    }
    if (valueOrBaseRow === undefined) return this.value2Value;
    this.value2Value = valueOrBaseRow;
    return this;
  }
  override createCondition(): Condition {
    const type = this.ruleTypeValue;
    if (type === RuleType.cellValueRule) {
      if (this.operatorValue === 6 || this.operatorValue === 7) {
        const outer = new Condition(CFType.relationCondition, { compareType: 1 });
        if (this.operatorValue === 6) {
          outer.item1(new Condition(CFType.cellValueCondition, { compareType: 3, expected: this.value1Value }));
          outer.item2(new Condition(CFType.cellValueCondition, { compareType: 5, expected: this.value2Value }));
        } else {
          outer.item1(new Condition(CFType.cellValueCondition, { compareType: 4, expected: this.value1Value }));
          outer.item2(new Condition(CFType.cellValueCondition, { compareType: 2, expected: this.value2Value }));
        }
        return outer;
      }
      return new Condition(CFType.cellValueCondition, {
        compareType: this.operatorValue,
        expected: this.value1Value,
      });
    }
    if (type === RuleType.specificTextRule) {
      const map: Record<number, number> = { 0: 6, 1: 7, 2: 2, 3: 4 };
      return new Condition(CFType.textCondition, {
        compareType: map[this.operatorValue ?? 0] ?? -1,
        expected: this.textValue,
      });
    }
    if (type === RuleType.formulaRule) {
      return new Condition(CFType.formulaCondition, { formula: this.formulaValue });
    }
    if (type === RuleType.dateOccurringRule) {
      return new Condition(CFType.dateCondition, { expected: this.typeValue });
    }
    if (type === RuleType.top10Rule) {
      return new Condition(CFType.top10Condition, { expected: this.rankValue });
    }
    if (type === RuleType.averageRule) {
      return new Condition(CFType.averageCondition, { expected: this.typeValue });
    }
    return new Condition(CFType.uniqueCondition, {});
  }
  override evaluate(evaluator: unknown, baseRow: number, baseColumn: number, actual: unknown): Style | null {
    if (this.ruleTypeValue === RuleType.formulaRule) {
      const range = this.rangesValue[0];
      const sheet = evaluator as { getParent?: () => { _calcEngine?: () => { translateFormula?: (text: string, rows: number, columns: number) => string } } } | undefined;
      const engine = sheet?.getParent?.()._calcEngine?.();
      const dr = range ? baseRow - range.row : 0, dc = range ? baseColumn - range.col : 0;
      const text = engine?.translateFormula?.(this.formulaValue, dr, dc) ?? this.formulaValue;
      const condition = new Condition(CFType.formulaCondition, { formula: text });
      return condition.evaluate(evaluator, baseRow, baseColumn, actual) ? (this.styleValue ?? new Style()) : null;
    }
    if (this.ruleTypeValue === RuleType.top10Rule || this.ruleTypeValue === RuleType.averageRule) {
      return null;
    }
    return super.evaluate(evaluator, baseRow, baseColumn, actual);
  }
  override reset(): void {
    super.reset();
    this.conditionValue = this.createCondition();
  }
  override toJSON(): JsonRecord {
    const result = super.toJSON();
    const type = this.ruleTypeValue;
    if (type === RuleType.cellValueRule) {
      result.operator = this.operatorValue;
      result.value1 = this.value1Value;
      if (this.operatorValue === 6 || this.operatorValue === 7) result.value2 = this.value2Value;
    } else if (type === RuleType.specificTextRule) {
      result.operator = this.operatorValue;
      result.text = this.textValue;
    } else if (type === RuleType.formulaRule) {
      result.formula = this.formulaValue;
      result.value1 = '=' + this.formulaValue;
    } else if (
      type === RuleType.dateOccurringRule ||
      type === RuleType.top10Rule ||
      type === RuleType.averageRule
    ) {
      result.type = this.typeValue;
      if (type === RuleType.top10Rule) {
        result.rank = this.rankValue;
        if (this.percentValue) result.isPercent = true;
        else if (this.percentSpecified) result.isPercent = false;
      }
    }
    return result;
  }
  override readJSON(json: JsonRecord): void {
    super.readJSON(json);
    if (json.operator !== undefined) this.operatorValue = Number(json.operator);
    if (json.text !== undefined) this.textValue = String(json.text);
    if (json.formula !== undefined) this.formulaValue = String(json.formula);
    if (json.type !== undefined) this.typeValue = Number(json.type);
    if (json.rank !== undefined) this.rankValue = Number(json.rank);
    if (json.isPercent !== undefined) this.percentValue = !!json.isPercent;
    if (json.value1 !== undefined) this.value1Value = json.value1;
    if (json.value2 !== undefined) this.value2Value = json.value2;
    this.conditionValue = this.createCondition();
  }
}
const CFType = (GC.Spread.Sheets.ConditionalFormatting as unknown as { ConditionType: Record<string, number> }).ConditionType;

export class ScaleRule extends ConditionRuleBase {
  minTypeValue = ScaleType.lowestValue;
  minValueValue = 0;
  minColorValue = '';
  midTypeValue = ScaleType.percent;
  midValueValue = 0;
  midColorValue = '';
  maxTypeValue = ScaleType.highestValue;
  maxValueValue = 0;
  maxColorValue = '';
  constructor(
    ruleType: number,
    minType?: number,
    minValue?: number | string,
    minColor?: string,
    midType?: number,
    midValue?: number | string,
    midColor?: string,
    maxType?: number,
    maxValue?: number | string,
    maxColor?: string,
    ranges?: Range[],
  ) {
    super(ruleType, undefined, ranges);
    if (minType !== undefined) this.minTypeValue = minType;
    if (minValue !== undefined) this.minValueValue = Number(minValue);
    if (minColor !== undefined) this.minColorValue = minColor;
    if (midType !== undefined) this.midTypeValue = midType;
    if (midValue !== undefined) this.midValueValue = Number(midValue);
    if (midColor !== undefined) this.midColorValue = midColor;
    if (maxType !== undefined) this.maxTypeValue = maxType;
    if (maxValue !== undefined) this.maxValueValue = Number(maxValue);
    if (maxColor !== undefined) this.maxColorValue = maxColor;
  }
  private prop(key: string, value?: unknown): unknown {
    const record = this as unknown as Record<string, unknown>;
    if (value === undefined) return record[key];
    record[key] = value;
    return this;
  }
  override createCondition(): Condition { return super.createCondition(); }
  minType(value?: number): unknown { return this.prop('minTypeValue', value); }
  minValue(value?: number): unknown { return this.prop('minValueValue', value); }
  minColor(value?: string): unknown { return this.prop('minColorValue', value); }
  midType(value?: number): unknown { return this.prop('midTypeValue', value); }
  midValue(value?: number): unknown { return this.prop('midValueValue', value); }
  midColor(value?: string): unknown { return this.prop('midColorValue', value); }
  maxType(value?: number): unknown { return this.prop('maxTypeValue', value); }
  maxValue(value?: number): unknown { return this.prop('maxValueValue', value); }
  maxColor(value?: string): unknown { return this.prop('maxColorValue', value); }
  override stopIfTrue(value?: boolean): boolean | this { return super.stopIfTrue(value) as boolean | this; }
  override evaluate(): Style | null {
    return null;
  }
  override toJSON(): JsonRecord {
    const result = super.toJSON();
    result.minType = this.minTypeValue;
    result.minValue = this.minValueValue;
    result.minColor = this.minColorValue;
    result.maxType = this.maxTypeValue;
    result.maxValue = this.maxValueValue;
    result.maxColor = this.maxColorValue;
    if (this.ruleTypeValue === RuleType.threeScaleRule) {
      result.midType = this.midTypeValue;
      result.midColor = this.midColorValue;
    }
    delete result.style;
    return result;
  }
  override readJSON(json: JsonRecord): void {
    super.readJSON(json);
    if (json.minType !== undefined) this.minTypeValue = Number(json.minType);
    if (json.minValue !== undefined) this.minValueValue = Number(json.minValue);
    if (json.minColor !== undefined) this.minColorValue = String(json.minColor);
    if (json.midType !== undefined) this.midTypeValue = Number(json.midType);
    if (json.midValue !== undefined) this.midValueValue = Number(json.midValue);
    if (json.midColor !== undefined) this.midColorValue = String(json.midColor);
    if (json.maxType !== undefined) this.maxTypeValue = Number(json.maxType);
    if (json.maxValue !== undefined) this.maxValueValue = Number(json.maxValue);
    if (json.maxColor !== undefined) this.maxColorValue = String(json.maxColor);
  }
}

export class DataBarRule extends ScaleRule {
  colorValue = '#638ec6';
  override evaluate(): Style | null { return null; }
  constructor(
    minType: number,
    minValue: number | string,
    maxType: number,
    maxValue: number | string,
    color: string,
    ranges: Range[],
  ) {
    super(RuleType.dataBarRule, minType, minValue, undefined, undefined, undefined, undefined, maxType, maxValue, undefined, ranges);
    this.colorValue = color;
  }
  color(value?: string): unknown {
    if (value === undefined) return this.colorValue;
    this.colorValue = value;
    return this;
  }
  gradient(value?: boolean): unknown {
    if (value === undefined) return this.gradientValue ?? true;
    this.gradientValue = value;
    return this;
  }
  gradientValue?: boolean;
  showBarOnly(value?: boolean): unknown {
    if (value === undefined) return this.showBarOnlyValue ?? false;
    this.showBarOnlyValue = value;
    return this;
  }
  showBarOnlyValue?: boolean;
  showBorder(value?: boolean): unknown {
    if (value === undefined) return this.showBorderValue ?? false;
    this.showBorderValue = value;
    return this;
  }
  showBorderValue?: boolean;
  borderColor(value?: string): unknown {
    if (value === undefined) return this.borderColorValue;
    this.borderColorValue = value;
    return this;
  }
  borderColorValue?: string;
  negativeFillColor(value?: string): unknown {
    if (value === undefined) return this.negativeFillColorValue;
    this.negativeFillColorValue = value;
    return this;
  }
  negativeFillColorValue?: string;
  useNegativeFillColor(value?: boolean): unknown {
    if (value === undefined) return this.useNegativeFillColorValue ?? false;
    this.useNegativeFillColorValue = value;
    return this;
  }
  useNegativeFillColorValue?: boolean;
  negativeBorderColor(value?: string): unknown {
    if (value === undefined) return this.negativeBorderColorValue;
    this.negativeBorderColorValue = value;
    return this;
  }
  negativeBorderColorValue?: string;
  useNegativeBorderColor(value?: boolean): unknown {
    if (value === undefined) return this.useNegativeBorderColorValue ?? false;
    this.useNegativeBorderColorValue = value;
    return this;
  }
  useNegativeBorderColorValue?: boolean;
  axisColor(value?: string): unknown {
    if (value === undefined) return this.axisColorValue ?? 'black';
    this.axisColorValue = value;
    return this;
  }
  axisColorValue?: string;
  axisPosition(value?: number): unknown {
    if (value === undefined) return this.axisPositionValue ?? 0;
    this.axisPositionValue = value;
    return this;
  }
  axisPositionValue?: number;
  dataBarDirection(value?: number): unknown {
    if (value === undefined) return this.directionValue ?? 0;
    this.directionValue = value;
    return this;
  }
  directionValue?: number;
  override toJSON(): JsonRecord {
    const result = super.toJSON();
    delete result.minColor;
    delete result.maxColor;
    if (this.minTypeValue !== ScaleType.automin && this.minTypeValue !== ScaleType.lowestValue) result.minType = this.minTypeValue;
    else delete result.minType;
    if (this.maxTypeValue !== ScaleType.automax && this.maxTypeValue !== ScaleType.highestValue) result.maxType = this.maxTypeValue;
    else delete result.maxType;
    result.color = this.colorValue;
    if (this.gradientValue === false) result.gradient = false;
    if (this.showBarOnlyValue) result.showBarOnly = true;
    if (this.showBorderValue) { result.showBorder = true; if (this.borderColorValue) result.borderColor = this.borderColorValue; }
    if (this.negativeFillColorValue) result.negativeFillColor = this.negativeFillColorValue;
    if (this.useNegativeBorderColorValue) { result.useNegativeBorderColor = true; if (this.negativeBorderColorValue) result.negativeBorderColor = this.negativeBorderColorValue; }
    if (this.axisColorValue) result.axisColor = this.axisColorValue;
    if (this.axisPositionValue) result.axisPosition = this.axisPositionValue;
    if (this.directionValue) result.dataBarDirection = this.directionValue;
    return result;
  }
  override readJSON(json: JsonRecord): void {
    super.readJSON(json);
    if (json.color !== undefined) this.colorValue = String(json.color);
    if (json.gradient !== undefined) this.gradientValue = !!json.gradient;
    if (json.showBarOnly !== undefined) this.showBarOnlyValue = !!json.showBarOnly;
    if (json.showBorder !== undefined) this.showBorderValue = !!json.showBorder;
    if (json.borderColor !== undefined) this.borderColorValue = String(json.borderColor);
    if (json.negativeFillColor !== undefined) this.negativeFillColorValue = String(json.negativeFillColor);
    if (json.useNegativeFillColor !== undefined) this.useNegativeFillColorValue = !!json.useNegativeFillColor;
    if (json.negativeBorderColor !== undefined) this.negativeBorderColorValue = String(json.negativeBorderColor);
    if (json.useNegativeBorderColor !== undefined) this.useNegativeBorderColorValue = !!json.useNegativeBorderColor;
    if (json.axisColor !== undefined) this.axisColorValue = String(json.axisColor);
    if (json.axisPosition !== undefined) this.axisPositionValue = Number(json.axisPosition);
    if (json.dataBarDirection !== undefined) this.directionValue = Number(json.dataBarDirection);
  }
}

export class IconCriterion {
  constructor(
    public isGreaterThanOrEqualTo: boolean,
    public iconValueType: number,
    public iconValue: unknown,
  ) {}
  toJSON(): JsonRecord {
    return {
      isGreaterThanOrEqualTo: this.isGreaterThanOrEqualTo,
      iconValueType: this.iconValueType,
      iconValue: this.iconValue,
    };
  }
}

export class IconSetRule extends ScaleRule {
  iconSet = 0;
  override evaluate(): Style | null { return null; }
  criteria: IconCriterion[] = [];
  iconInfos: { iconSetType: number; iconIndex: number }[] = [];
  reverse = false;
  iconOnly = false;
  constructor(iconSetType: number, ranges: Range[]) {
    super(RuleType.iconSetRule, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, ranges);
    this.iconSet = iconSetType;
    this.resetCriteria();
  }
  private resetCriteria(): void {
    const count = iconCount(this.iconSet);
    this.criteria = Array.from({ length: Math.max(0, count - 1) }, (_, index) => {
      const boundary = Math.round(((index + 1) * 100) / count);
      return new IconCriterion(true, 4, boundary);
    });
    this.iconInfos = Array.from({ length: count }, (_, index) => ({ iconSetType: this.iconSet, iconIndex: index }));
  }
  static getIcon(iconSetType: number, iconIndex: number): unknown {
    return { iconSetType, iconIndex };
  }
  iconSetType(value?: number): number | this {
    if (value === undefined) return this.iconSet;
    this.iconSet = value;
    this.resetCriteria();
    return this;
  }
  iconCriteria(value?: IconCriterion[]): IconCriterion[] | this {
    if (value === undefined) return this.criteria;
    this.criteria = value;
    return this;
  }
  icons(iconInfos?: { iconSetType: number; iconIndex: number }[]): { iconSetType: number; iconIndex: number }[] | this {
    if (iconInfos === undefined) return this.iconInfos;
    this.iconInfos = iconInfos;
    return this;
  }
  reverseIconOrder(value?: boolean): boolean | this {
    if (value === undefined) return this.reverse;
    this.reverse = value;
    return this;
  }
  showIconOnly(value?: boolean): boolean | this {
    if (value === undefined) return this.iconOnly;
    this.iconOnly = value;
    return this;
  }
  override reset(): void {
    super.reset();
    this.resetCriteria();
  }
  override toJSON(): JsonRecord {
    const result = super.toJSON();
    delete result.minType; delete result.minValue; delete result.minColor;
    delete result.maxType; delete result.maxValue; delete result.maxColor;
    result.iconCriteria = this.criteria.map((criterion) => criterion.toJSON());
    result.icons = this.iconInfos.map((info) => ({ iconSetType: info.iconSetType, iconIndex: info.iconIndex }));
    if (this.iconSet) result.iconSetType = this.iconSet;
    if (this.reverse) result.reverseIconOrder = true;
    if (this.iconOnly) result.showIconOnly = true;
    return result;
  }
  override readJSON(json: JsonRecord): void {
    super.readJSON(json);
    if (json.iconCriteria !== undefined) {
      this.criteria = (json.iconCriteria as JsonRecord[]).map(
        (raw) => new IconCriterion(!!raw.isGreaterThanOrEqualTo, Number(raw.iconValueType), raw.iconValue),
      );
    }
    if (json.icons !== undefined) {
      this.iconInfos = (json.icons as JsonRecord[]).map((raw) => ({
        iconSetType: Number(raw.iconSetType),
        iconIndex: Number(raw.iconIndex),
      }));
      this.iconSet = this.iconInfos[0]?.iconSetType ?? this.iconSet;
    }
    if (json.reverseIconOrder !== undefined) this.reverse = !!json.reverseIconOrder;
    else if (json.reverse !== undefined) this.reverse = !!json.reverse;
    if (json.showIconOnly !== undefined) this.iconOnly = !!json.showIconOnly;
  }
}
function iconCount(iconSet: number): number {
  if (iconSet <= 9) return 3;
  if (iconSet <= 14) return 4;
  return 5;
}

export class StateRule extends ConditionRuleBase {
  stateValue?: number;
  state(value?: number): number | this {
    if (value === undefined) return this.stateValue as number;
    this.stateValue = value;
    return this;
  }
  isRow(): boolean {
    return this.ruleTypeValue === RuleType.rowStateRule;
  }
  override toJSON(): JsonRecord {
    const result = super.toJSON();
    if (this.stateValue !== undefined) result.state = this.stateValue;
    return result;
  }
  override readJSON(json: JsonRecord): void {
    super.readJSON(json);
    if (json.state !== undefined) this.stateValue = Number(json.state);
  }
}
export class SparklineRule extends ConditionRuleBase {
  constructor(type?: number, options?: unknown, ranges?: Range[]) {
    super(16, undefined, ranges);
    this.sparklineTypeValue = type;
    this.sparklineOptionsValue = options;
  }
  sparklineTypeValue?: number;
  sparklineOptionsValue?: unknown;
  sparklineType(): number | undefined { return this.sparklineTypeValue; }
  sparklineOptions(value?: unknown): unknown {
    if (value === undefined) return this.sparklineOptionsValue;
    this.sparklineOptionsValue = value;
    return this;
  }
  showSparklineOnly(value?: boolean): unknown {
    if (value === undefined) return this.sparklineOnlyValue ?? false;
    this.sparklineOnlyValue = value;
    return this;
  }
  sparklineOnlyValue?: boolean;
  override evaluate(_evaluator: unknown, _baseRow: number, _baseColumn: number, _actual: unknown): Style | null {
    return null;
  }
  override reset(): void { super.reset(); }
  override toJSON(): JsonRecord {
    const result = super.toJSON();
    if (this.sparklineTypeValue !== undefined) result.sparklineType = String(this.sparklineTypeValue).toUpperCase();
    if (this.sparklineOptionsValue !== undefined) result.sparklineOptions = serializeValue(this.sparklineOptionsValue);
    if (this.sparklineOnlyValue) result.showSparklineOnly = true;
    return result;
  }
}


export interface CFRuleVisual {
  backColor?: string;
  bar?: {
    fraction: number;
    negative?: boolean;
    color: string;
    gradient: boolean;
    showBorder: boolean;
    borderColor?: string;
    axisPosition?: number;
  };
  icon?: { iconSetType: number; iconIndex: number; iconOnly: boolean };
}

function numericValues(sheet: { getValue(r: number, c: number): unknown }, ranges: Range[]): number[] {
  const values: number[] = [];
  for (const range of ranges)
    for (let r = Math.max(0, range.row); r < range.row + range.rowCount; r++)
      for (let c = Math.max(0, range.col); c < range.col + range.colCount; c++) {
        const value = sheet.getValue(r, c);
        if (typeof value === 'number' && Number.isFinite(value)) values.push(value);
      }
  values.sort((a, b) => a - b);
  return values;
}
function percentile(values: number[], pct: number): number {
  if (!values.length) return 0;
  if (pct <= 0) return values[0]!;
  if (pct >= 100) return values[values.length - 1]!;
  const position = ((values.length - 1) * pct) / 100;
  const low = Math.floor(position), high = Math.ceil(position);
  return values[low]! + (values[high]! - values[low]!) * (position - low);
}
function scaleValue(sheet: { getValue(r: number, c: number): unknown }, rule: ScaleRule, values: number[], type: number, value: number, isMin: boolean): number {
  switch (type) {
    case ScaleType.lowestValue:
      return values.length ? values[0]! : 0;
    case ScaleType.automin:
      return values.length ? Math.min(0, values[0]!) : 0;
    case ScaleType.highestValue:
      return values.length ? values[values.length - 1]! : 1;
    case ScaleType.automax:
      return values.length ? Math.max(0, values[values.length - 1]!) : 1;
    case ScaleType.percent:
      return values.length ? values[0]! + (value / 100) * (values[values.length - 1]! - values[0]!) : 0;
    case ScaleType.percentile:
      return percentile(values, value);
    case ScaleType.number:
      return value;
    case ScaleType.formula: {
      const range = rule.ranges()[0];
      const condition = new Condition(1, { expected: value });
      void sheet;
      return Number(condition.getExpected(sheet, range?.row ?? 0, range?.col ?? 0)) || 0;
    }
    default:
      return isMin ? 0 : 1;
  }
}
function parseColor(color: string): [number, number, number] {
  if (/^#[0-9a-f]{6}$/i.test(color)) return [parseInt(color.slice(1, 3), 16), parseInt(color.slice(3, 5), 16), parseInt(color.slice(5, 7), 16)];
  if (/^#[0-9a-f]{3}$/i.test(color)) return [parseInt(color[1]! + color[1]!, 16), parseInt(color[2]! + color[2]!, 16), parseInt(color[3]! + color[3]!, 16)];
  return [0, 0, 0];
}
function mixColor(from: string, to: string, t: number): string {
  const a = parseColor(from), b = parseColor(to);
  const channel = (i: number) => Math.round(a[i]! + (b[i]! - a[i]!) * Math.max(0, Math.min(1, t)));
  return `rgba(${channel(0)},${channel(1)},${channel(2)},1)`;
}

/** Range-level rule matching (top/bottom, unique, duplicate, average). */
function rangeRuleMatches(sheet: { getValue(r: number, c: number): unknown }, rule: ConditionRuleBase, row: number, column: number, value: unknown): boolean {
  const type = rule.ruleType();
  const numeric = numericValues(sheet, rule.ranges());
  if (type === RuleType.top10Rule) {
    const normal = rule as NormalConditionRule;
    const rank = Number((normal as unknown as { rankValue: number }).rankValue);
    if (typeof value !== 'number') return false;
    const topType = Number((normal as unknown as { typeValue: number }).typeValue);
    const sorted = [...numeric].sort((a, b) => topType === CF.Top10ConditionType.bottom ? a - b : b - a);
    const count = normal.isPercent() ? Math.max(1, Math.ceil((numeric.length * rank) / 100)) : rank;
    return sorted.slice(0, count).includes(value);
  }
  if (type === RuleType.uniqueRule || type === RuleType.duplicateRule) {
    let count = 0;
    for (const range of rule.ranges())
      for (let r = range.row; r < range.row + range.rowCount; r++)
        for (let c = range.col; c < range.col + range.colCount; c++)
          if (Object.is(sheet.getValue(r, c), value)) count++;
    return type === RuleType.uniqueRule ? count === 1 : count > 1;
  }
  if (type === RuleType.averageRule) {
    if (typeof value !== 'number' || !numeric.length) return false;
    const mean = numeric.reduce((a, b) => a + b, 0) / numeric.length;
    const sd = Math.sqrt(numeric.reduce((a, b) => a + (b - mean) ** 2, 0) / numeric.length);
    const average = rule as NormalConditionRule;
    switch (Number((average as unknown as { typeValue: number }).typeValue)) {
      case CF.AverageConditionType.above: return value > mean;
      case CF.AverageConditionType.below: return value < mean;
      case CF.AverageConditionType.equalOrAbove: return value >= mean;
      case CF.AverageConditionType.equalOrBelow: return value <= mean;
      case CF.AverageConditionType.above1StdDev: return value > mean + sd;
      case CF.AverageConditionType.below1StdDev: return value < mean - sd;
      case CF.AverageConditionType.above2StdDev: return value > mean + 2 * sd;
      case CF.AverageConditionType.below2StdDev: return value < mean - 2 * sd;
      case CF.AverageConditionType.above3StdDev: return value > mean + 3 * sd;
      case CF.AverageConditionType.below3StdDev: return value < mean - 3 * sd;
      default: return false;
    }
  }
  if (type === RuleType.dateOccurringRule) {
    const normal = rule as NormalConditionRule;
    const date = value instanceof Date ? value : typeof value === 'number' ? new Date(Math.round((value - 25569) * 86400000)) : null;
    if (!date) return false;
    const now = new Date();
    const day = 86400000;
    const start = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const today = start(now), target = start(date);
    switch (Number((normal as unknown as { typeValue: number }).typeValue)) {
      case CF.DateOccurringType.today: return target === today;
      case CF.DateOccurringType.yesterday: return target === today - day;
      case CF.DateOccurringType.tomorrow: return target === today + day;
      case CF.DateOccurringType.last7Days: return target >= today - 7 * day && target <= today;
      case CF.DateOccurringType.thisMonth: return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
      case CF.DateOccurringType.lastMonth: { const d = new Date(now.getFullYear(), now.getMonth() - 1, 1); return date.getMonth() === d.getMonth() && date.getFullYear() === d.getFullYear(); }
      case CF.DateOccurringType.nextMonth: { const d = new Date(now.getFullYear(), now.getMonth() + 1, 1); return date.getMonth() === d.getMonth() && date.getFullYear() === d.getFullYear(); }
      case CF.DateOccurringType.thisYear: return date.getFullYear() === now.getFullYear();
      case CF.DateOccurringType.lastYear: return date.getFullYear() === now.getFullYear() - 1;
      case CF.DateOccurringType.nextYear: return date.getFullYear() === now.getFullYear() + 1;
      default: return false;
    }
  }
  return false;
}

export class ConditionalFormats {
  private rules: ConditionRuleBase[] = [];
  constructor(private sheet: unknown) {}
  private assignPriority(rule: ConditionRuleBase): void {
    for (const existing of this.rules) existing._setPriority(existing._priority() + 1);
    rule._setPriority(1);
    (rule as unknown as { priorityExplicit?: boolean }).priorityExplicit = false;
  }
  addRule(rule: ConditionRuleBase): ConditionRuleBase {
    this.assignPriority(rule);
    this.rules.push(rule);
    (this.sheet as { invalidateLayout?: () => void }).invalidateLayout?.();
    return rule;
  }
  addCellValueRule(
    comparisonOperator: number,
    value1: unknown,
    value2: unknown,
    style: Style,
    ranges: Range[],
  ): ConditionRuleBase {
    return this.addRule(
      new NormalConditionRule(RuleType.cellValueRule, ranges, style, comparisonOperator, value1, value2),
    );
  }
  addSpecificTextRule(comparisonOperator: number, text: string, style: Style, ranges: Range[]): ConditionRuleBase {
    return this.addRule(new NormalConditionRule(RuleType.specificTextRule, ranges, style, comparisonOperator, null, null, text));
  }
  addFormulaRule(formula: string, style: Style, ranges: Range[]): ConditionRuleBase {
    const normalized = formula.startsWith('=') ? formula.slice(1) : formula;
    const rule = new NormalConditionRule(RuleType.formulaRule, ranges, style, undefined, null, null, '', normalized);
    this.addRule(rule);
    return rule;
  }
  addDateOccurringRule(type: number, style: Style, ranges: Range[]): ConditionRuleBase {
    return this.addRule(new NormalConditionRule(RuleType.dateOccurringRule, ranges, style, undefined, null, null, '', '', type));
  }
  addTop10Rule(type: number, rank: number, style: Style, ranges: Range[], isPercent?: boolean): ConditionRuleBase {
    const rule = new NormalConditionRule(RuleType.top10Rule, ranges, style, undefined, null, null, '', '', type, rank, isPercent);
    this.addRule(rule);
    return rule;
  }
  addUniqueRule(style: Style, ranges: Range[]): ConditionRuleBase {
    return this.addRule(new NormalConditionRule(RuleType.uniqueRule, ranges, style));
  }
  addDuplicateRule(style: Style, ranges: Range[]): ConditionRuleBase {
    return this.addRule(new NormalConditionRule(RuleType.duplicateRule, ranges, style));
  }
  addAverageRule(type: number, style: Style, ranges: Range[]): ConditionRuleBase {
    return this.addRule(new NormalConditionRule(RuleType.averageRule, ranges, style, undefined, null, null, '', '', type));
  }
  add2ScaleRule(
    minType: number,
    minValue: number,
    minColor: string,
    maxType: number,
    maxValue: number,
    maxColor: string,
    ranges: Range[],
  ): ConditionRuleBase {
    return this.addRule(new ScaleRule(RuleType.twoScaleRule, minType, minValue, minColor, undefined, undefined, undefined, maxType, maxValue, maxColor, ranges));
  }
  add3ScaleRule(
    minType: number,
    minValue: number,
    minColor: string,
    midType: number,
    midValue: number,
    midColor: string,
    maxType: number,
    maxValue: number,
    maxColor: string,
    ranges: Range[],
  ): ConditionRuleBase {
    return this.addRule(new ScaleRule(RuleType.threeScaleRule, minType, minValue, minColor, midType, midValue, midColor, maxType, maxValue, maxColor, ranges));
  }
  addDataBarRule(
    minType: number,
    minValue: number,
    maxType: number,
    maxValue: number,
    color: string,
    ranges: Range[],
  ): ConditionRuleBase {
    return this.addRule(new DataBarRule(minType, minValue, maxType, maxValue, color, ranges));
  }
  addIconSetRule(iconSetType: number, ranges: Range[]): ConditionRuleBase {
    return this.addRule(new IconSetRule(iconSetType, ranges));
  }
  addRowStateRule(state: number, style: Style | Style[], ranges: Range[]): ConditionRuleBase {
    const rule = new StateRule(RuleType.rowStateRule, Array.isArray(style) ? style[0] : style, ranges);
    rule.stateValue = state;
    return this.addRule(rule);
  }
  addColumnStateRule(state: number, style: Style | Style[], ranges: Range[]): ConditionRuleBase {
    const rule = new StateRule(RuleType.columnStateRule, Array.isArray(style) ? style[0] : style, ranges);
    rule.stateValue = state;
    return this.addRule(rule);
  }
  addSparklineRule(type: number, options?: unknown, ranges?: Range[]): SparklineRule {
    return this.addRule(new SparklineRule(type, options, ranges)) as SparklineRule;
  }
  clearRule(): void {
    this.rules = [];
    (this.sheet as { invalidateLayout?: () => void }).invalidateLayout?.();
  }
  containsRule(rule: ConditionRuleBase, row: number, column: number): boolean {
    return this.rules.includes(rule) && rule.contains(row, column);
  }
  count(): number {
    return this.rules.length;
  }
  _hasRules(): boolean { return this.rules.length > 0; }
  getRule(index: number): ConditionRuleBase {
    return this.rules[index]!;
  }
  getRules(row?: number, column?: number): ConditionRuleBase[] {
    if (row === undefined || column === undefined) return [...this.rules];
    return this.rules.filter((rule) => rule.contains(row, column));
  }
  removeRule(rule: ConditionRuleBase): void {
    const index = this.rules.indexOf(rule);
    if (index < 0) return;
    this.rules.splice(index, 1);
    this.rules.forEach((item, i) => item._setPriority(i + 1));
    (this.sheet as { invalidateLayout?: () => void }).invalidateLayout?.();
  }
  removeRuleByRange(row: number, column: number, rowCount: number, columnCount: number): void {
    const target = new Range(row, column, rowCount, columnCount);
    this.rules = this.rules.filter(
      (rule) => !rule.ranges().every((range) => target.containsRange(range)),
    );
    this.rules.forEach((item, i) => item._setPriority(i + 1));
    (this.sheet as { invalidateLayout?: () => void }).invalidateLayout?.();
  }
  /** Adjusts rule ranges after inserted/removed rows or columns. */
  _shift(axis: 'row' | 'col', index: number, amount: number, remove: boolean): void {
    for (const rule of this.rules) rule._shiftRanges(axis, index, amount, remove);
  }
  /** Applies matching normal rules in priority order. */
  styleFor(row: number, column: number, value: unknown): Style | null {
    if (!this.rules.length) return null;
    let result: Style | null = null;
    const matching = this.rules
      .filter((rule) => rule.contains(row, column))
      .sort((a, b) => a._priority() - b._priority());
    const visual = this._visualFor(row, column, value);
    if (visual?.backColor) result = Object.assign(new Style(), { backColor: visual.backColor });
    for (const rule of matching) {
      let style = rule.evaluate(this.sheet, row, column, value);
      if (!style && (rule.ruleType() === RuleType.top10Rule || rule.ruleType() === RuleType.uniqueRule || rule.ruleType() === RuleType.duplicateRule || rule.ruleType() === RuleType.averageRule || rule.ruleType() === RuleType.dateOccurringRule))
        if (rangeRuleMatches(this.sheet as { getValue(r: number, c: number): unknown }, rule, row, column, value)) style = (rule.style() as Style | undefined) ?? new Style();
      if (style) result = Object.assign(result ?? new Style(), style);
      if (rule.stopIfTrue()) break;
    }
    return result;
  }
  /** Computes scale/data-bar/icon visuals for a cell. */
  _visualFor(row: number, column: number, value: unknown): CFRuleVisual | null {
    if (!this.rules.length || column < 0) return null;
    const matching = this.rules
      .filter((rule) => rule.contains(row, column))
      .sort((a, b) => a._priority() - b._priority());
    let visual: CFRuleVisual | null = null;
    for (const rule of matching) {
      const type = rule.ruleType();
      if (type === RuleType.twoScaleRule || type === RuleType.threeScaleRule) {
        const scale = rule as ScaleRule;
        const values = numericValues(this.sheet as { getValue(r: number, c: number): unknown }, scale.ranges());
        if (!values.length || typeof value !== 'number') continue;
        const min = scaleValue(this.sheet as { getValue(r: number, c: number): unknown }, scale, values, Number(scale.minType()), Number(scale.minValue()), true);
        const max = scaleValue(this.sheet as { getValue(r: number, c: number): unknown }, scale, values, Number(scale.maxType()), Number(scale.maxValue()), false);
        if (max === min) { visual = { ...(visual ?? {}), backColor: String(scale.minColor()) }; continue; }
        const t = (value - min) / (max - min);
        if (type === RuleType.twoScaleRule)
          visual = { ...(visual ?? {}), backColor: mixColor(String(scale.minColor()), String(scale.maxColor()), t) };
        else {
          const mid = scaleValue(this.sheet as { getValue(r: number, c: number): unknown }, scale, values, Number(scale.midType()), Number(scale.midValue()), false);
          visual = {
            ...(visual ?? {}),
            backColor: value <= mid
              ? mixColor(String(scale.minColor()), String(scale.midColor()), mid === min ? 0 : (value - min) / (mid - min))
              : mixColor(String(scale.midColor()), String(scale.maxColor()), max === mid ? 1 : (value - mid) / (max - mid)),
          };
        }
      } else if (type === RuleType.dataBarRule) {
        const barRule = rule as DataBarRule;
        const values = numericValues(this.sheet as { getValue(r: number, c: number): unknown }, barRule.ranges());
        if (!values.length || typeof value !== 'number') continue;
        const min = scaleValue(this.sheet as { getValue(r: number, c: number): unknown }, barRule, values, Number(barRule.minType()), Number(barRule.minValue()), true);
        const max = scaleValue(this.sheet as { getValue(r: number, c: number): unknown }, barRule, values, Number(barRule.maxType()), Number(barRule.maxValue()), false);
        const fraction = max === min ? 1 : Math.max(0, Math.min(1, (value - min) / (max - min)));
        visual = {
          ...(visual ?? {}),
          bar: {
            fraction,
            negative: value < 0,
            color: String(barRule.color()),
            gradient: barRule.gradient() !== false,
            showBorder: barRule.showBorder() === true,
            borderColor: barRule.borderColor() as string | undefined,
            axisPosition: Number(barRule.axisPosition()),
          },
        };
      } else if (type === RuleType.iconSetRule) {
        const icon = rule as IconSetRule;
        const values = numericValues(this.sheet as { getValue(r: number, c: number): unknown }, icon.ranges());
        if (!values.length || typeof value !== 'number') continue;
        const criteria = icon.iconCriteria() as IconCriterion[];
        let index = 0;
        for (const criterion of criteria) {
          let threshold: number;
          if (criterion.iconValueType === 4) threshold = values[0]! + (Number(criterion.iconValue) / 100) * (values[values.length - 1]! - values[0]!);
          else if (criterion.iconValueType === 5) threshold = percentile(values, Number(criterion.iconValue));
          else threshold = Number(criterion.iconValue);
          if (criterion.isGreaterThanOrEqualTo ? value >= threshold : value > threshold) index++;
          else break;
        }
        const infos = icon.icons() as { iconSetType: number; iconIndex: number }[];
        if (icon.reverseIconOrder() === true) index = infos.length - 1 - index;
        visual = { ...(visual ?? {}), icon: { iconSetType: Number(icon.iconSetType()), iconIndex: index, iconOnly: icon.showIconOnly() === true } };
      }
      if (rule.stopIfTrue()) break;
    }
    return visual;
  }

  toJSON(): JsonRecord {
    if (!this.rules.length) return {};
    return { rules: this.rules.map((rule) => rule.toJSON()) };
  }
  fromJSON(data: unknown): void {
    const json = data as JsonRecord;
    this.rules = [];
    for (const raw of Array.isArray(json.rules) ? json.rules : []) {
      const rule = ruleFromJSON(raw as JsonRecord);
      if (rule) this.rules.push(rule);
    }
  }
}

export function ruleFromJSON(json: JsonRecord): ConditionRuleBase | null {
  const type = Number(json.ruleType);
  let rule: ConditionRuleBase;
  if (
    type === RuleType.cellValueRule ||
    type === RuleType.specificTextRule ||
    type === RuleType.formulaRule ||
    type === RuleType.dateOccurringRule ||
    type === RuleType.top10Rule ||
    type === RuleType.uniqueRule ||
    type === RuleType.duplicateRule ||
    type === RuleType.averageRule
  )
    rule = new NormalConditionRule(type);
  else if (type === RuleType.dataBarRule) rule = new DataBarRule(ScaleType.automin, 0, ScaleType.automax, 0, '#638ec6', []);
  else if (type === RuleType.iconSetRule) rule = new IconSetRule(0, []);
  else if (type === RuleType.twoScaleRule || type === RuleType.threeScaleRule)
    rule = new ScaleRule(type);
  else rule = new ConditionRuleBase(type);
  rule.readJSON(json);
  return rule;
}

export const conditionalFormattingEnums = { RuleType, ScaleType, CF };
