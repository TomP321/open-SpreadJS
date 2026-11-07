import { describe, expect, it } from 'vitest';
import { activeFormulaCall, builtinHintNames, filterFormulaNames } from '../src/features/formula-hints.js';

describe('formula suggestion filtering', () => {
  it('includes UI-only functions and excludes builtins absent from the popup', () => {
    const names = builtinHintNames();
    expect(filterFormulaNames(names, 'S')[0]).toBe('SCATTERSPARKLINE');
    expect(names).not.toContain('DATESTRING');
    expect(names).not.toContain('FORECAST.LINEAR');
  });
  it('filters case-insensitively, deduplicates and sorts names', () => {
    expect(filterFormulaNames(['SUMIF', 'sum', 'SUBTOTAL', 'sum', 'AVERAGE'], 'su')).toEqual(['SUBTOTAL', 'SUM', 'SUMIF']);
    expect(filterFormulaNames(['SUM', 'SUMIF'], 'x')).toEqual([]);
  });
});

describe('active formula call', () => {
  it.each([
    ['=IF(A1,SUM(B1,C1),', { name: 'IF', argument: 2 }],
    ['=IF(A1,SUM(B1,', { name: 'SUM', argument: 1 }],
    ['=IF("a,b",', { name: 'IF', argument: 1 }],
    ['=IF("a"",b",', { name: 'IF', argument: 1 }],
    ['=SUM((1+2),', { name: 'SUM', argument: 1 }],
    ['=SUM({1,2},', { name: 'SUM', argument: 1 }],
    ['=SUM(A1)', undefined],
  ])('identifies the call in %s', (formula, expected) => {
    expect(activeFormulaCall(formula, formula.length)).toEqual(expected);
  });
  it('uses the caret position rather than the end of the formula', () => {
    const formula = '=IF(A1,SUM(B1,C1),D1)';
    expect(activeFormulaCall(formula, formula.indexOf('C1'))).toEqual({ name: 'SUM', argument: 1 });
    expect(activeFormulaCall(formula, formula.indexOf('D1'))).toEqual({ name: 'IF', argument: 2 });
  });
});
