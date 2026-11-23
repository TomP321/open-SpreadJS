import { describe, expect, it } from 'vitest';
import { activeFormulaCall, builtinHintNames, filterFormulaNames, functionCanonicalName, functionDisplayName, functionListSeparator } from '../src/features/formula-hints.js';
import { languagePackages } from '../src/calc/language-packages.js';
import { registerItalianCalcLanguagePackage } from '../src/calc/italian-language-package.js';

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

describe('TASK 89: Italian language package in hints and tooltips', () => {
  it('resolves localized call names and the ; argument separator', () => {
    registerItalianCalcLanguagePackage();
    expect(languagePackages('it')).toBe('it');
    try {
      for (const [text, expected] of [
        ['=SOMMA(A1;A2', { name: 'SUM', argument: 1 }],
        ['=SE(A1>0;1;2', { name: 'IF', argument: 2 }],
        ['=MEDIA.PIÙ.SE(A1:A2;">0";A1:A2', { name: 'AVERAGEIFS', argument: 2 }],
        ['=CERCA.VERT(1;A1:B2;2;FALSO', { name: 'VLOOKUP', argument: 3 }],
      ] as const) expect(activeFormulaCall(text, text.length)).toEqual(expected);
      expect(functionDisplayName('SUM')).toBe('SOMMA');
      expect(functionCanonicalName('CERCA.VERT')).toBe('VLOOKUP');
      expect(functionListSeparator()).toBe(';');
    } finally {
      languagePackages(null);
    }
    expect(activeFormulaCall('=SUM(A1,', 8)).toEqual({ name: 'SUM', argument: 1 });
    expect(functionDisplayName('SUM')).toBe('SUM');
    expect(functionListSeparator()).toBe(',');
  });
});
