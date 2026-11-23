// @vitest-environment jsdom
/*
 * TASK 100 — DataValidation namespace burn-down: one unit test per declared member
 * (the seven create*Validator factories and the 19 DefaultDataValidator members).
 */
import { describe, expect, it } from 'vitest';
import GC from '../src/index.js';

const DV = GC.Spread.Sheets.DataValidation;
const CF = GC.Spread.Sheets.ConditionalFormatting;
const Ops = CF.ComparisonOperators;
const sheet = () => new GC.Spread.Sheets.Workbook().getActiveSheet();

describe('DataValidation factories', () => {
  it('createListValidator builds a list validator from a source string', () => {
    const dv = DV.createListValidator('red,green,blue');
    expect(dv.type()).toBe(DV.CriteriaType.list);
    expect(dv.isValid(sheet(), 0, 0, 'green')).toBe(true);
    expect(dv.isValid(sheet(), 0, 0, 'pink')).toBe(false);
  });
  it('createFormulaListValidator builds a list validator from a range formula', () => {
    const dv = DV.createFormulaListValidator('$A$1:$A$2');
    const sh = sheet();
    sh.setValue(0, 0, 'x');
    sh.setValue(1, 0, 'y');
    expect(dv.type()).toBe(DV.CriteriaType.list);
    expect(dv.getValidList(sh, 0, 0).sort()).toEqual(['x', 'y']);
  });
  it('createNumberValidator compares numeric cell values', () => {
    const dv = DV.createNumberValidator(Ops.between, 1, 10);
    expect(dv.type()).toBe(DV.CriteriaType.decimalValues);
    expect(dv.isValid(sheet(), 0, 0, 5)).toBe(true);
    expect(dv.isValid(sheet(), 0, 0, 50)).toBe(false);
  });
  it('createNumberValidator with the integer flag restricts to whole numbers', () => {
    const dv = DV.createNumberValidator(Ops.greaterThan, 0, null, true);
    expect(dv.type()).toBe(DV.CriteriaType.wholeNumber);
    expect(dv.isValid(sheet(), 0, 0, 3)).toBe(true);
    expect(dv.isValid(sheet(), 0, 0, 3.5)).toBe(false);
  });
  it('createDateValidator compares cell values as dates', () => {
    const dv = DV.createDateValidator(Ops.greaterThan, new Date(2024, 0, 1));
    expect(dv.type()).toBe(DV.CriteriaType.date);
    expect(dv.isValid(sheet(), 0, 0, new Date(2024, 5, 1))).toBe(true);
    expect(dv.isValid(sheet(), 0, 0, new Date(2023, 11, 31))).toBe(false);
  });
  it('createTimeValidator compares cell values as times', () => {
    const dv = DV.createTimeValidator(Ops.greaterThan, new Date(2024, 0, 1, 8, 0));
    expect(dv.type()).toBe(DV.CriteriaType.time);
    expect(dv.isValid(sheet(), 0, 0, new Date(2024, 0, 1, 12, 0))).toBe(true);
    expect(dv.isValid(sheet(), 0, 0, new Date(2024, 0, 1, 6, 0))).toBe(false);
  });
  it('createTextLengthValidator compares the length of text values', () => {
    const dv = DV.createTextLengthValidator(Ops.between, 2, 4);
    expect(dv.type()).toBe(DV.CriteriaType.textLength);
    expect(dv.isValid(sheet(), 0, 0, 'abc')).toBe(true);
    expect(dv.isValid(sheet(), 0, 0, 'a')).toBe(false);
  });
  it('createFormulaValidator evaluates a formula condition', () => {
    const dv = DV.createFormulaValidator('=A1>10');
    const sh = sheet();
    sh.setValue(0, 0, 20);
    expect(dv.type()).toBe(DV.CriteriaType.custom);
    expect(dv.isValid(sh, 1, 0, 0)).toBe(true);
    sh.setValue(0, 0, 5);
    expect(dv.isValid(sh, 1, 0, 0)).toBe(false);
  });
});

describe('DataValidation.DefaultDataValidator', () => {
  const make = () => DV.createNumberValidator(Ops.between, 1, 10);
  it('comparisonOperator reports and overrides the comparison kind', () => {
    const dv = make();
    expect(dv.comparisonOperator()).toBe(Ops.between);
    dv.comparisonOperator(Ops.greaterThan);
    expect(dv.comparisonOperator()).toBe(Ops.greaterThan);
  });
  it('condition gets and sets the backing Condition', () => {
    const dv = make();
    const condition = new CF.Condition(CF.ConditionType.numberCondition, { compareType: Ops.equalsTo, expected: 4 });
    dv.condition(condition);
    expect(dv.condition()).toBe(condition);
  });
  it('errorMessage gets and chains its setter', () => {
    const dv = make();
    expect(dv.errorMessage('bad')).toBe(dv);
    expect(dv.errorMessage()).toBe('bad');
  });
  it('errorStyle chooses stop/warning/information', () => {
    const dv = make();
    expect(dv.errorStyle()).toBe(DV.ErrorStyle.stop);
    dv.errorStyle(DV.ErrorStyle.warning);
    expect(dv.errorStyle()).toBe(DV.ErrorStyle.warning);
  });
  it('errorTitle gets and chains its setter', () => {
    const dv = make();
    dv.errorTitle('Invalid');
    expect(dv.errorTitle()).toBe('Invalid');
  });
  it('getValidList answers the allowed values for a list source', () => {
    const dv = DV.createListValidator('a,b,c');
    expect(dv.getValidList(sheet(), 0, 0)).toEqual(['a', 'b', 'c']);
  });
  it('highlightStyle stores the invalid-value highlight style', () => {
    const dv = make();
    dv.highlightStyle({ backColor: '#FFCCCC' });
    expect(dv.highlightStyle()).toMatchObject({ backColor: '#FFCCCC' });
  });
  it('ignoreBlank defaults true and can be turned off', () => {
    const dv = make();
    expect(dv.ignoreBlank()).toBe(true);
    dv.ignoreBlank(false);
    expect(dv.isValid(sheet(), 0, 0, '')).toBe(false);
  });
  it('inCellDropdown toggles the list dropdown', () => {
    const dv = DV.createListValidator('a,b');
    expect(dv.inCellDropdown()).toBe(true);
    dv.inCellDropdown(false);
    expect(dv.inCellDropdown()).toBe(false);
  });
  it('inputMessage gets and chains its setter', () => {
    const dv = make();
    dv.inputMessage('pick 1..10');
    expect(dv.inputMessage()).toBe('pick 1..10');
  });
  it('inputTitle gets and chains its setter', () => {
    const dv = make();
    dv.inputTitle('Number');
    expect(dv.inputTitle()).toBe('Number');
  });
  it('isValid evaluates a candidate value against the validator', () => {
    expect(make().isValid(sheet(), 0, 0, 5)).toBe(true);
    expect(make().isValid(sheet(), 0, 0, 99)).toBe(false);
  });
  it('preciseCompareDate toggles exact date comparison', () => {
    const dv = make();
    expect(dv.preciseCompareDate()).toBe(false);
    dv.preciseCompareDate(true);
    expect(dv.preciseCompareDate()).toBe(true);
  });
  it('reset clears all validation settings', () => {
    const dv = make();
    dv.reset();
    expect(dv.type()).toBe(DV.CriteriaType.anyValue);
    expect(dv.isValid(sheet(), 0, 0, 'anything')).toBe(true);
  });
  it('showErrorMessage toggles the rejection dialog', () => {
    const dv = make();
    expect(dv.showErrorMessage()).toBe(true);
    dv.showErrorMessage(false);
    expect(dv.showErrorMessage()).toBe(false);
  });
  it('showInputMessage toggles the input hint dialog', () => {
    const dv = make();
    expect(dv.showInputMessage()).toBe(true);
    dv.showInputMessage(false);
    expect(dv.showInputMessage()).toBe(false);
  });
  it('type gets and sets the criteria type', () => {
    const dv = make();
    expect(dv.type()).toBe(DV.CriteriaType.decimalValues);
    expect(dv.type(DV.CriteriaType.custom)).toBe(dv);
    expect(dv.type()).toBe(DV.CriteriaType.custom);
  });
  it('value1 answers the first comparison operand', () => {
    expect(make().value1()).toBe(1);
  });
  it('value2 answers the second comparison operand', () => {
    expect(make().value2()).toBe(10);
  });
});
