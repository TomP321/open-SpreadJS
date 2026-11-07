import { describe, expect, it } from 'vitest';
import { filterFormulaNames } from '../src/features/formula-hints.js';

describe('formula suggestion filtering', () => {
  it('filters case-insensitively, deduplicates and sorts names', () => {
    expect(filterFormulaNames(['SUMIF', 'sum', 'SUBTOTAL', 'sum', 'AVERAGE'], 'su')).toEqual(['SUBTOTAL', 'SUM', 'SUMIF']);
    expect(filterFormulaNames(['SUM', 'SUMIF'], 'x')).toEqual([]);
  });
});
