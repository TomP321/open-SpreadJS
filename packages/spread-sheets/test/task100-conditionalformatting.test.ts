// @vitest-environment jsdom
/*
 * TASK 100 — ConditionalFormatting namespace burn-down: one unit test per declared member
 * (Condition, ConditionalFormats, ConditionRuleBase, DataBarRule, IconCriterion, IconSetRule,
 * NormalConditionRule, ScaleRule, ScaleValue, SparklineRule, StateRule). Expectations follow
 * the public d.ts contract and trial-observed behaviour from the earlier CF tasks.
 */
import { describe, expect, it } from 'vitest';
import GC from '../src/index.js';
import type { IconCriterion, NormalConditionRule, StateRule } from '../src/features/conditional-formatting.js';

const CF = GC.Spread.Sheets.ConditionalFormatting;
const Range = GC.Spread.Sheets.Range;

describe('ConditionalFormatting.Condition', () => {
  const numberCondition = () => new CF.Condition(CF.ConditionType.numberCondition, { compareType: CF.ComparisonOperators.greaterThan, expected: 10 });
  it('compareType gets and chains its setter', () => {
    const c = numberCondition();
    expect(c.compareType()).toBe(CF.ComparisonOperators.greaterThan);
    expect(c.compareType(CF.ComparisonOperators.lessThan)).toBe(c);
    expect(c.compareType()).toBe(CF.ComparisonOperators.lessThan);
  });
  it('evaluate matches the actual value against the expected one', () => {
    const c = numberCondition();
    expect(c.evaluate(null, 0, 0, 15)).toBe(true);
    expect(c.evaluate(null, 0, 0, 5)).toBe(false);
  });
  it('expected gets and chains its setter', () => {
    const c = numberCondition();
    expect(c.expected()).toBe(10);
    expect(c.expected(20)).toBe(c);
    expect(c.expected()).toBe(20);
  });
  it('formula stores the formula and base position', () => {
    const c = new CF.Condition(CF.ConditionType.formulaCondition);
    c.formula('A1>2');
    expect(c.formula()).toBe('A1>2');
    expect(c.formula(1, 2)).toBe(c); // numeric call sets the base row/column
  });
  it('fromSource builds an area condition from a range source', () => {
    const c = CF.Condition.fromSource('$A$1:$A$3');
    expect(c.expected()).toBe('$A$1:$A$3');
  });
  it('fromFormula builds an area condition from a formula source', () => {
    const c = CF.Condition.fromFormula('=$A$1:$A$3');
    expect(c.formula()).toBeTruthy();
  });
  it('fromDay builds a date-expecting condition for the day of month', () => {
    expect(CF.Condition.fromDay(15).evaluate(null, 0, 0, new Date(2024, 4, 15))).toBe(true);
  });
  it('fromMonth builds a date-expecting condition for the month', () => {
    // Contract (d.ts): "The first month is 0" -> May is 4 (supervisor fix at the F99+F100 merge).
    expect(CF.Condition.fromMonth(4).evaluate(null, 0, 0, new Date(2024, 4, 1))).toBe(true);
    expect(CF.Condition.fromMonth(5).evaluate(null, 0, 0, new Date(2024, 4, 1))).toBe(false);
  });
  it('fromQuarter builds a date-expecting condition for the quarter', () => {
    // QuarterType is zero-based (0 = January-March, trial-measured in TASK 99) -> May is quarter 1.
    expect(CF.Condition.fromQuarter(1).evaluate(null, 0, 0, new Date(2024, 4, 1))).toBe(true);
    expect(CF.Condition.fromQuarter(2).evaluate(null, 0, 0, new Date(2024, 4, 1))).toBe(false);
  });
  it('fromWeek builds a date-expecting condition for the week of year', () => {
    const c = CF.Condition.fromWeek(1);
    expect(c).toBeInstanceOf(CF.Condition);
  });
  it('fromYear builds a date-expecting condition for the year', () => {
    expect(CF.Condition.fromYear(2024).evaluate(null, 0, 0, new Date(2024, 0, 1))).toBe(true);
  });
  it('getExpected resolves numbers, text and formulas against the base cell', () => {
    expect(numberCondition().getExpected(null, 0, 0)).toBe(10);
    const wb = new GC.Spread.Sheets.Workbook();
    const sheet = wb.getActiveSheet();
    sheet.setValue(0, 0, 7);
    const c = new CF.Condition(CF.ConditionType.numberCondition, { compareType: CF.ComparisonOperators.equalsTo, expected: '' });
    c.formula('A1');
    expect(c.getExpected(sheet, 0, 0)).toBe(7);
  });
  it('getValidList returns the option list for area/list sources', () => {
    const c = CF.Condition.fromSource('red,green,blue');
    expect(c.getValidList(null, 0, 0)).toEqual(['red', 'green', 'blue']);
  });
  it('ignoreBlank toggles blank cells passing the test', () => {
    const c = numberCondition();
    expect(c.ignoreBlank()).toBe(false);
    c.ignoreBlank(true);
    expect(c.ignoreBlank()).toBe(true);
    expect(c.evaluate(null, 0, 0, '')).toBe(true);
  });
  it('ignoreCase toggles case-sensitive text comparison', () => {
    const c = new CF.Condition(CF.ConditionType.textCondition, { compareType: CF.TextCompareType.equalsTo, expected: 'abc' });
    c.ignoreCase(true);
    expect(c.ignoreCase()).toBe(true);
    expect(c.evaluate(null, 0, 0, 'ABC')).toBe(true);
  });
  it('item1 stores the left-hand side of a relation condition', () => {
    const c = new CF.Condition(CF.ConditionType.relationCondition);
    c.item1(numberCondition());
    expect(c.item1()).toBeInstanceOf(CF.Condition);
  });
  it('item2 stores the right-hand side of a relation condition', () => {
    const c = new CF.Condition(CF.ConditionType.relationCondition);
    c.item1(numberCondition());
    c.item2(new CF.Condition(CF.ConditionType.numberCondition, { compareType: CF.ComparisonOperators.lessThan, expected: 20 }));
    expect(c.item2()).toBeInstanceOf(CF.Condition);
    expect(c.evaluate(null, 0, 0, 15)).toBe(true);
  });
  it('preciseCompareDate toggles exact date comparison', () => {
    const c = numberCondition();
    expect(c.preciseCompareDate()).toBe(false);
    c.preciseCompareDate(true);
    expect(c.preciseCompareDate()).toBe(true);
  });
  it('ranges gets and sets the condition ranges', () => {
    const c = numberCondition();
    expect(c.ranges()).toEqual([]);
    c.ranges([new Range(1, 1, 2, 2)] as never);
    expect(c.ranges()[0].row).toBe(1);
  });
  it('reset clears the stored comparison data', () => {
    const c = numberCondition();
    c.compareType(CF.ComparisonOperators.between);
    c.reset();
    expect(c.compareType()).toBeUndefined();
  });
  it('treatNullValueAsZero toggles nulls comparing as zero', () => {
    const c = new CF.Condition(CF.ConditionType.numberCondition, { compareType: CF.ComparisonOperators.equalsTo, expected: 0 });
    const blankBefore = c.evaluate(null, 0, 0, null);
    c.treatNullValueAsZero(true);
    expect(blankBefore).not.toBe(c.evaluate(null, 0, 0, null));
    expect(c.treatNullValueAsZero()).toBe(true);
    expect(c.evaluate(null, 0, 0, null)).toBe(true);
  });
  it('useWildCards toggles wildcard text matching', () => {
    const c = new CF.Condition(CF.ConditionType.textCondition, { compareType: CF.TextCompareType.equalsTo, expected: 'a*' });
    expect(c.useWildCards()).toBe(true);
    expect(c.evaluate(null, 0, 0, 'abc')).toBe(true);
    c.useWildCards(false);
    expect(c.evaluate(null, 0, 0, 'abc')).toBe(false);
  });
});

describe('ConditionalFormatting.ConditionRuleBase', () => {
  const makeRule = () => new CF.ConditionRuleBase(CF.RuleType.cellValueRule, { backColor: '#FFFF00' } as never, [new Range(0, 0, 3, 3) as never]);
  it('condition gets and sets the rule condition', () => {
    const rule = makeRule();
    const condition = new CF.Condition(CF.ConditionType.numberCondition, { compareType: CF.ComparisonOperators.greaterThan, expected: 5 });
    expect(rule.condition(condition)).toBe(rule);
    expect(rule.condition()).toBe(condition);
  });
  it('contains reports whether the cell lies in a rule range', () => {
    const rule = makeRule();
    expect(rule.contains(1, 1)).toBe(true);
    expect(rule.contains(9, 9)).toBe(false);
  });
  it('createCondition returns the condition backing the rule', () => {
    const rule = makeRule();
    expect(rule.createCondition()).toBeInstanceOf(CF.Condition);
  });
  it('evaluate answers the rule style when the condition matches', () => {
    const rule = new CF.ConditionRuleBase(CF.RuleType.cellValueRule, { backColor: '#FFFF00' } as never, [new Range(0, 0, 3, 3) as never]);
    rule.condition(new CF.Condition(CF.ConditionType.numberCondition, { compareType: CF.ComparisonOperators.greaterThan, expected: 5 }));
    const style = rule.evaluate(null, 0, 0, 10);
    expect(style).not.toBeNull();
    expect((style as never as { backColor: string }).backColor).toBe('#FFFF00');
    expect(rule.evaluate(null, 0, 0, 1)).toBeNull();
  });
  it('getExpected answers the applied style', () => {
    const rule = makeRule();
    expect((rule.getExpected() as never as { backColor: string }).backColor).toBe('#FFFF00');
  });
  it('intersects reports range overlap with the rule ranges', () => {
    const rule = makeRule();
    expect(rule.intersects(2, 2, 5, 5)).toBe(true);
    expect(rule.intersects(4, 4, 2, 2)).toBe(false);
  });
  it('isScaleRule is false for a plain condition rule', () => {
    expect(makeRule().isScaleRule()).toBe(false);
    expect(new CF.ScaleRule(CF.RuleType.threeScaleRule).isScaleRule()).toBe(true);
  });
  it('priority gets and chains its setter', () => {
    const rule = makeRule();
    expect(rule.priority(3)).toBe(rule);
    expect(rule.priority()).toBe(3);
  });
  it('ranges gets and sets the rule ranges', () => {
    const rule = makeRule();
    expect(rule.ranges().length).toBe(1);
    expect(rule.ranges([new Range(1, 1, 2, 2) as never])).toBe(rule);
    expect(rule.ranges()[0].col).toBe(1);
  });
  it('reset drops the condition, priority and stopIfTrue state', () => {
    const rule = makeRule();
    rule.stopIfTrue(true);
    rule.priority(4);
    rule.reset();
    expect(rule.stopIfTrue()).toBe(false);
    expect(rule.condition()).toBeUndefined();
  });
  it('ruleType gets and chains its setter', () => {
    const rule = makeRule();
    expect(rule.ruleType()).toBe(CF.RuleType.cellValueRule);
    expect(rule.ruleType(CF.RuleType.formulaRule)).toBe(rule);
  });
  it('stopIfTrue toggles the rule short-circuit', () => {
    const rule = makeRule();
    expect(rule.stopIfTrue()).toBe(false);
    rule.stopIfTrue(true);
    expect(rule.stopIfTrue()).toBe(true);
  });
  it('style gets and sets the applied style', () => {
    const rule = makeRule();
    const style = { foreColor: '#FF0000' } as never;
    rule.style(style);
    expect(rule.style()).toBe(style);
  });
});

describe('ConditionalFormatting.NormalConditionRule', () => {
  const make = () => new CF.NormalConditionRule(CF.RuleType.cellValueRule, [new Range(0, 0, 3, 3) as never], { backColor: '#00FF00' } as never, CF.ComparisonOperators.between, 1, 10);
  it('createCondition rebuilds the condition from the current values', () => {
    const rule = make();
    expect(rule.createCondition()).toBeInstanceOf(CF.Condition);
  });
  it('formula stores the formula-condition text', () => {
    const rule = new CF.NormalConditionRule(CF.RuleType.formulaRule);
    rule.formula('A1>2');
    expect(rule.formula()).toBe('A1>2');
  });
  it('isPercent toggles percent ranking for top-10 rules', () => {
    const rule = new CF.NormalConditionRule(CF.RuleType.top10Rule);
    expect(rule.isPercent()).toBeUndefined();
    expect(rule.isPercent(true)).toBe(rule);
    expect(rule.isPercent()).toBe(true);
  });
  it('operator stores the comparison operator', () => {
    const rule = make();
    expect(rule.operator()).toBe(CF.ComparisonOperators.between);
    rule.operator(CF.ComparisonOperators.greaterThan);
    expect(rule.operator()).toBe(CF.ComparisonOperators.greaterThan);
  });
  it('rank stores the top-10 rank', () => {
    const rule = new CF.NormalConditionRule(CF.RuleType.top10Rule);
    expect(rule.rank()).toBe(1);
    rule.rank(5);
    expect(rule.rank()).toBe(5);
  });
  it('reset clears rule state and re-derives the backing condition', () => {
    const rule = make();
    rule.stopIfTrue(true);
    rule.priority(5);
    rule.reset();
    expect(rule.stopIfTrue()).toBe(false);
    expect(rule.priority()).toBe(1); // back to the default priority
    expect(rule.condition()).toBeInstanceOf(CF.Condition);
  });
  it('text stores the specific-text operand', () => {
    const rule = new CF.NormalConditionRule(CF.RuleType.specificTextRule);
    rule.text('contains-me');
    expect(rule.text()).toBe('contains-me');
  });
  it('type stores the date/top-10/average sub-type', () => {
    const rule = new CF.NormalConditionRule(CF.RuleType.top10Rule);
    rule.type(CF.Top10ConditionType.top);
    expect(rule.type()).toBe(CF.Top10ConditionType.top);
  });
  it('value1 stores the first comparison operand', () => {
    const rule = make();
    expect(rule.value1()).toBe(1);
    rule.value1(2);
    expect(rule.value1()).toBe(2);
  });
  it('value2 stores the second comparison operand', () => {
    const rule = make();
    expect(rule.value2()).toBe(10);
    rule.value2(20);
    expect(rule.value2()).toBe(20);
  });
});

describe('ConditionalFormatting.ScaleRule', () => {
  const make = () => new CF.ScaleRule(CF.RuleType.threeScaleRule, CF.ScaleValueType.number, 0, '#FF0000', CF.ScaleValueType.percent, 50, '#FFFF00', CF.ScaleValueType.number, 10, '#00FF00', [new Range(0, 0, 3, 3) as never]);
  it('createCondition answers a condition instance', () => {
    expect(make().createCondition()).toBeInstanceOf(CF.Condition);
  });
  it('evaluate returns null (scale colours render through the sheet rule pipeline)', () => {
    expect((make().evaluate as (...ignored: unknown[]) => unknown)()).toBeNull();
  });
  it('minType stores the lower-bound scale type', () => {
    const rule = make();
    expect(rule.minType()).toBe(CF.ScaleValueType.number);
    expect(rule.minType(CF.ScaleValueType.lowestValue)).toBe(rule);
    expect(rule.minType()).toBe(CF.ScaleValueType.lowestValue);
  });
  it('minValue stores the lower-bound scale value', () => {
    const rule = make();
    expect(rule.minValue()).toBe(0);
    expect(rule.minValue(3)).toBe(rule);
    expect(rule.minValue()).toBe(3);
  });
  it('minColor stores the lower-bound colour', () => {
    const rule = make();
    expect(rule.minColor()).toBe('#FF0000');
    rule.minColor('#111111');
    expect(rule.minColor()).toBe('#111111');
  });
  it('midType stores the middle scale type', () => {
    const rule = make();
    expect(rule.midType()).toBe(CF.ScaleValueType.percent);
    rule.midType(CF.ScaleValueType.percentile);
    expect(rule.midType()).toBe(CF.ScaleValueType.percentile);
  });
  it('midValue stores the middle scale value', () => {
    const rule = make();
    expect(rule.midValue()).toBe(50);
    rule.midValue(25);
    expect(rule.midValue()).toBe(25);
  });
  it('midColor stores the middle colour', () => {
    const rule = make();
    expect(rule.midColor()).toBe('#FFFF00');
    rule.midColor('#222222');
    expect(rule.midColor()).toBe('#222222');
  });
  it('maxType stores the upper-bound scale type', () => {
    const rule = make();
    expect(rule.maxType()).toBe(CF.ScaleValueType.number);
    rule.maxType(CF.ScaleValueType.highestValue);
    expect(rule.maxType()).toBe(CF.ScaleValueType.highestValue);
  });
  it('maxValue stores the upper-bound scale value', () => {
    const rule = make();
    expect(rule.maxValue()).toBe(10);
    rule.maxValue(30);
    expect(rule.maxValue()).toBe(30);
  });
  it('maxColor stores the upper-bound colour', () => {
    const rule = make();
    expect(rule.maxColor()).toBe('#00FF00');
    rule.maxColor('#333333');
    expect(rule.maxColor()).toBe('#333333');
  });
  it('stopIfTrue chains like the base accessor', () => {
    const rule = make();
    expect(rule.stopIfTrue(true)).toBe(rule);
    expect(rule.stopIfTrue()).toBe(true);
  });
});

describe('ConditionalFormatting.ScaleValue', () => {
  it('type is a declared property carrying the scale value type', () => {
    const sv = new CF.ScaleValue(CF.ScaleValueType.number, 10);
    expect(Object.getOwnPropertyDescriptor(CF.ScaleValue.prototype, 'type')).toBeDefined();
    expect(sv.type).toBe(CF.ScaleValueType.number);
  });
  it('value is a declared property carrying the scale value', () => {
    const sv = new CF.ScaleValue(CF.ScaleValueType.percent, 50);
    expect(sv.value).toBe(50);
    expect(new CF.ScaleValue().value).toBeUndefined();
  });
});

describe('ConditionalFormatting.DataBarRule', () => {
  const make = () => new CF.DataBarRule(CF.ScaleValueType.lowestValue, 0, CF.ScaleValueType.highestValue, 10, '#0000FF', [new Range(0, 0, 3, 3) as never]);
  it('axisColor stores the data bar axis color', () => {
    const rule = make();
    rule.axisColor('#FF0000');
    expect(rule.axisColor()).toBe('#FF0000');
  });
  it('axisPosition stores the axis placement', () => {
    const rule = make();
    rule.axisPosition(CF.DataBarAxisPosition.cellMidPoint);
    expect(rule.axisPosition()).toBe(CF.DataBarAxisPosition.cellMidPoint);
  });
  it('borderColor stores the bar border color', () => {
    const rule = make();
    rule.borderColor('#00FF00');
    expect(rule.borderColor()).toBe('#00FF00');
  });
  it('color stores the bar fill color', () => {
    const rule = make();
    expect(rule.color()).toBe('#0000FF');
    expect(rule.color('#638ec6')).toBe(rule);
  });
  it('dataBarDirection sets the bar growth direction', () => {
    const rule = make();
    rule.dataBarDirection(CF.BarDirection.rightToLeft);
    expect(rule.dataBarDirection()).toBe(CF.BarDirection.rightToLeft);
  });
  it('evaluate returns null (bars render through the sheet rule pipeline)', () => {
    expect((make().evaluate as (...ignored: unknown[]) => unknown)()).toBeNull();
  });
  it('gradient toggles the gradient fill', () => {
    const rule = make();
    rule.gradient(true);
    expect(rule.gradient()).toBe(true);
  });
  it('negativeBorderColor stores the negative bar border color', () => {
    const rule = make();
    rule.negativeBorderColor('#000000');
    expect(rule.negativeBorderColor()).toBe('#000000');
  });
  it('negativeFillColor stores the negative bar fill color', () => {
    const rule = make();
    rule.negativeFillColor('#FF0000');
    expect(rule.negativeFillColor()).toBe('#FF0000');
  });
  it('showBarOnly hides the cell value', () => {
    const rule = make();
    expect(rule.showBarOnly(true)).toBe(rule);
    expect(rule.showBarOnly()).toBe(true);
  });
  it('showBorder toggles the bar border', () => {
    const rule = make();
    rule.showBorder(false);
    expect(rule.showBorder()).toBe(false);
  });
  it('useNegativeBorderColor enables the negative border color', () => {
    const rule = make();
    rule.useNegativeBorderColor(true);
    expect(rule.useNegativeBorderColor()).toBe(true);
  });
  it('useNegativeFillColor enables the negative fill color', () => {
    const rule = make();
    expect(rule.useNegativeFillColor(false)).toBe(rule);
    expect(rule.useNegativeFillColor()).toBe(false);
  });
});

describe('ConditionalFormatting.IconSetRule', () => {
  const make = () => new CF.IconSetRule(CF.IconSetType.threeArrowsColored, [new Range(0, 0, 3, 3) as never]);
  it('evaluate returns null (icons render through the sheet rule pipeline)', () => {
    expect((make().evaluate as (...ignored: unknown[]) => unknown)()).toBeNull();
  });
  it('getIcon answers the icon info for a set and index', () => {
    expect(CF.IconSetRule.getIcon(CF.IconSetType.threeArrowsColored, 1)).toEqual({ iconSetType: CF.IconSetType.threeArrowsColored, iconIndex: 1 });
  });
  it('iconCriteria stores the value thresholds', () => {
    const rule = make();
    expect((rule.iconCriteria() as IconCriterion[]).length).toBe(2);
    const criteria = [new CF.IconCriterion(true, CF.IconValueType.number, 1), new CF.IconCriterion(true, CF.IconValueType.number, 5)];
    expect(rule.iconCriteria(criteria)).toBe(rule);
    expect(rule.iconCriteria()).toEqual(criteria);
  });
  it('icons stores the icon infos shown per criterion', () => {
    const rule = make();
    expect((rule.icons() as { iconSetType: number; iconIndex: number }[]).length).toBe(3);
    const infos = [{ iconSetType: CF.IconSetType.threeArrowsColored, iconIndex: 0 }];
    rule.icons(infos);
    expect(rule.icons()).toEqual(infos);
  });
  it('iconSetType stores and re-derives criteria on change', () => {
    const rule = make();
    expect(rule.iconSetType()).toBe(CF.IconSetType.threeArrowsColored);
    rule.iconSetType(CF.IconSetType.fiveArrowsColored);
    expect(rule.iconSetType()).toBe(CF.IconSetType.fiveArrowsColored);
    expect((rule.iconCriteria() as IconCriterion[]).length).toBe(4);
  });
  it('reset restores the default criteria for the icon set', () => {
    const rule = make();
    rule.iconCriteria([]);
    rule.reset();
    expect((rule.iconCriteria() as IconCriterion[]).length).toBe(2);
  });
  it('reverseIconOrder mirrors the icon order', () => {
    const rule = make();
    expect(rule.reverseIconOrder(true)).toBe(rule);
    expect(rule.reverseIconOrder()).toBe(true);
  });
  it('showIconOnly hides the cell value', () => {
    const rule = make();
    rule.showIconOnly(true);
    expect(rule.showIconOnly()).toBe(true);
  });
});

describe('ConditionalFormatting.IconCriterion', () => {
  it('constructs with the comparison direction, value type and value', () => {
    const criterion = new CF.IconCriterion(true, CF.IconValueType.percent, 50);
    expect(criterion.toJSON()).toEqual({ isGreaterThanOrEqualTo: true, iconValueType: CF.IconValueType.percent, iconValue: 50 });
  });
});

describe('ConditionalFormatting.SparklineRule', () => {
  const make = () => new CF.SparklineRule(0, { max: true });
  it('evaluate returns null (sparklines render through the sheet rule pipeline)', () => {
    expect((make().evaluate as (...ignored: unknown[]) => unknown)()).toBeNull();
  });
  it('reset clears rule state like the base rule', () => {
    const rule = make();
    rule.reset();
    expect(rule.condition()).toBeUndefined();
  });
  it('showSparklineOnly hides the cell value', () => {
    const rule = make();
    expect(rule.showSparklineOnly()).toBe(false);
    rule.showSparklineOnly(true);
    expect(rule.showSparklineOnly()).toBe(true);
  });
  it('sparklineOptions gets and sets the sparkline options', () => {
    const rule = make();
    expect(rule.sparklineOptions()).toEqual({ max: true });
    expect(rule.sparklineOptions({ lineWeight: 2 })).toBe(rule);
    expect(rule.sparklineOptions()).toEqual({ lineWeight: 2 });
  });
  it('sparklineType answers the declared sparkline type', () => {
    const rule = make();
    expect(rule.sparklineType()).toBe(0);
    expect(new CF.SparklineRule().sparklineType()).toBeUndefined();
  });
});

describe('ConditionalFormatting.StateRule', () => {
  it('isRow distinguishes row-state from column-state rules', () => {
    expect(new CF.StateRule(CF.RuleType.rowStateRule).isRow()).toBe(true);
    expect(new CF.StateRule(CF.RuleType.columnStateRule).isRow()).toBe(false);
  });
  it('state stores the sheet state the rule highlights', () => {
    const rule = new CF.StateRule(CF.RuleType.rowStateRule);
    expect(rule.state(1)).toBe(rule);
    expect(rule.state()).toBe(1);
  });
});

describe('ConditionalFormatting.ConditionalFormats', () => {
  const formats = () => new GC.Spread.Sheets.Workbook().getActiveSheet().conditionalFormats;
  const r = () => [new Range(0, 0, 3, 3) as never];
  const st = () => ({ backColor: '#FFFF00' }) as never;
  it('addRule appends a rule and answers it', () => {
    const cf = formats();
    const rule = new CF.ConditionRuleBase(CF.RuleType.cellValueRule, st(), r());
    expect(cf.addRule(rule)).toBe(rule);
    expect(cf.count()).toBe(1);
  });
  it('add2ScaleRule adds a two-colour scale rule', () => {
    const cf = formats();
    cf.add2ScaleRule(CF.ScaleValueType.lowestValue, 0, '#FF0000', CF.ScaleValueType.highestValue, 10, '#00FF00', r());
    expect(cf.count()).toBe(1);
    expect(cf.getRule(0).ruleType()).toBe(CF.RuleType.twoScaleRule);
  });
  it('add3ScaleRule adds a three-colour scale rule', () => {
    const cf = formats();
    cf.add3ScaleRule(CF.ScaleValueType.lowestValue, 0, '#FF0000', CF.ScaleValueType.percent, 50, '#FFFF00', CF.ScaleValueType.highestValue, 10, '#00FF00', r());
    expect(cf.getRule(0).ruleType()).toBe(CF.RuleType.threeScaleRule);
  });
  it('addAverageRule adds an above/below-average rule', () => {
    const cf = formats();
    cf.addAverageRule(CF.AverageConditionType.above, st(), r());
    expect(cf.getRule(0).ruleType()).toBe(CF.RuleType.averageRule);
  });
  it('addCellValueRule adds a cell-value comparison rule', () => {
    const cf = formats();
    cf.addCellValueRule(CF.ComparisonOperators.greaterThan, 5, null, st(), r());
    const rule = cf.getRule(0);
    expect(rule.ruleType()).toBe(CF.RuleType.cellValueRule);
    expect((rule as never as NormalConditionRule).value1()).toBe(5);
  });
  it('addColumnStateRule adds a column-state rule', () => {
    const cf = formats();
    cf.addColumnStateRule(1, st(), r());
    expect(cf.getRule(0).ruleType()).toBe(CF.RuleType.columnStateRule);
    expect((cf.getRule(0) as never as StateRule).isRow()).toBe(false);
  });
  it('addDataBarRule adds a data bar rule', () => {
    const cf = formats();
    cf.addDataBarRule(CF.ScaleValueType.lowestValue, 0, CF.ScaleValueType.highestValue, 10, '#0000FF', r());
    expect(cf.getRule(0).ruleType()).toBe(CF.RuleType.dataBarRule);
  });
  it('addDateOccurringRule adds a date-occurring rule', () => {
    const cf = formats();
    cf.addDateOccurringRule(CF.DateOccurringType.today, st(), r());
    expect(cf.getRule(0).ruleType()).toBe(CF.RuleType.dateOccurringRule);
  });
  it('addDuplicateRule adds a duplicate-value rule', () => {
    const cf = formats();
    cf.addDuplicateRule(st(), r());
    expect(cf.getRule(0).ruleType()).toBe(CF.RuleType.duplicateRule);
  });
  it('addFormulaRule adds a formula rule', () => {
    const cf = formats();
    cf.addFormulaRule('=A1>2', st(), r());
    expect(cf.getRule(0).ruleType()).toBe(CF.RuleType.formulaRule);
  });
  it('addIconSetRule adds an icon-set rule', () => {
    const cf = formats();
    cf.addIconSetRule(CF.IconSetType.threeTrafficLightsUnrimmed, r());
    expect(cf.getRule(0).ruleType()).toBe(CF.RuleType.iconSetRule);
  });
  it('addRowStateRule adds a row-state rule', () => {
    const cf = formats();
    cf.addRowStateRule(1, st(), r());
    expect(cf.getRule(0).ruleType()).toBe(CF.RuleType.rowStateRule);
    expect((cf.getRule(0) as never as StateRule).isRow()).toBe(true);
  });
  it('addSparklineRule adds a sparkline rule with its options', () => {
    const cf = formats();
    const rule = cf.addSparklineRule(0, { max: true }, r());
    expect(rule.ruleType()).toBe(CF.RuleType.sparklineRule);
    expect(rule.sparklineOptions()).toEqual({ max: true });
  });
  it('addSpecificTextRule adds a text-comparison rule', () => {
    const cf = formats();
    cf.addSpecificTextRule(CF.TextComparisonOperators.contains, 'ell', st(), r());
    const rule = cf.getRule(0) as never as NormalConditionRule;
    expect(rule.ruleType()).toBe(CF.RuleType.specificTextRule);
    expect(rule.text()).toBe('ell');
  });
  it('addTop10Rule adds a top/bottom rule with rank', () => {
    const cf = formats();
    cf.addTop10Rule(CF.Top10ConditionType.top, 3, st(), r());
    const rule = cf.getRule(0) as never as NormalConditionRule;
    expect(rule.ruleType()).toBe(CF.RuleType.top10Rule);
    expect(rule.rank()).toBe(3);
  });
  it('addUniqueRule adds a unique-value rule', () => {
    const cf = formats();
    cf.addUniqueRule(st(), r());
    expect(cf.getRule(0).ruleType()).toBe(CF.RuleType.uniqueRule);
  });
  it('clearRule removes every rule', () => {
    const cf = formats();
    cf.addUniqueRule(st(), r());
    cf.addDuplicateRule(st(), r());
    cf.clearRule();
    expect(cf.count()).toBe(0);
  });
  it('containsRule reports membership and range coverage', () => {
    const cf = formats();
    const rule = cf.addCellValueRule(CF.ComparisonOperators.greaterThan, 5, null, st(), r());
    expect(cf.containsRule(rule, 1, 1)).toBe(true);
    expect(cf.containsRule(rule, 8, 8)).toBe(false);
  });
  it('count answers the number of stored rules', () => {
    const cf = formats();
    expect(cf.count()).toBe(0);
    cf.addUniqueRule(st(), r());
    expect(cf.count()).toBe(1);
  });
  it('getRule answers the rule at an index', () => {
    const cf = formats();
    const rule = cf.addUniqueRule(st(), r());
    expect(cf.getRule(0)).toBe(rule);
  });
  it('getRules lists all rules or the ones covering a cell', () => {
    const cf = formats();
    cf.addUniqueRule(st(), r());
    cf.addCellValueRule(CF.ComparisonOperators.greaterThan, 5, null, st(), [new Range(9, 9, 1, 1) as never]);
    expect(cf.getRules().length).toBe(2);
    expect(cf.getRules(0, 0).length).toBe(1);
  });
  it('removeRule deletes a specific rule', () => {
    const cf = formats();
    const rule = cf.addUniqueRule(st(), r());
    cf.removeRule(rule);
    expect(cf.count()).toBe(0);
  });
  it('removeRuleByRange deletes rules fully inside the given range', () => {
    const cf = formats();
    cf.addUniqueRule(st(), r());
    cf.removeRuleByRange(0, 0, 10, 10);
    expect(cf.count()).toBe(0);
  });
});
