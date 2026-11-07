import { describe, expect, it } from 'vitest';
import { builtinHintNames, filterFormulaNames } from '../src/features/formula-hints.js';

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
