// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { functionCatalog } from '../src/calc/function-catalog.js';
import { FormulaHints } from '../src/features/formula-hints.js';
import type { Workbook } from '../src/model.js';

describe('function catalog', () => {
  it.each([
    ['AVERAGE', 'number1, [number2], ...'],
    ['AVERAGEIF', 'range, criteria, [average_range]'],
    ['AVERAGEIFS', 'average_range, criteria_range1, criteria1, [criteria_range2], [criteria2], ...'],
    ['COUNT', 'value1, [value2], ...'],
    ['COUNTA', 'value1, [value2], ...'],
    ['COUNTIFS', 'criteria_range1, criteria1, [criteria_range2], [criteria2], ...'],
    ['IF', 'logical_test, value_if_true, [value_if_false]'],
    ['INDEX', 'array, row_num, [column_num]'],
    ['LEFT', 'text, [num_chars]'],
    ['MATCH', 'lookup_value, lookup_array, [match_type]'],
    ['MAX', 'number1, [number2], ...'],
    ['MIN', 'number1, [number2], ...'],
    ['RIGHT', 'text, [num_chars]'],
    ['SUBSTITUTE', 'text, old_text, new_text, [instance_num]'],
    ['SUBTOTAL', 'function_num, ref1, [ref2], ...'],
    ['SUM', 'number1, [number2], ...'],
    ['SUMIF', 'range, criteria, [sum_range]'],
    ['SUMIFS', 'sum_range, criteria_range1, criteria1, [criteria_range2], [criteria2], ...'],
    ['VLOOKUP', 'lookup_value, table_array, col_index_num, [range_lookup]'],
    ['NOW', ''],
  ])('shows the documented signature for %s', (name, signature) => {
    const anchor = document.createElement('div');
    const workbook = { getCustomFunction: () => undefined } as unknown as Workbook;
    const hints = new FormulaHints(workbook, anchor, () => {});
    const formula = `=${name}(`;
    hints.update(formula, formula.length);
    expect(document.querySelector('[role=tooltip]')?.textContent).toBe(`${name}(${signature})`);
    expect(functionCatalog[name].description.trim()).not.toBe('');
    hints.close();
  });
  it.each([
    ['=SUM(1,2,3,', '[number2]'],
    ['=SUMIFS(A1,B1,1,C1,2,D1,', '[criteria2]'],
    ['=SUMIFS(A1,B1,1,C1,2,', '[criteria_range2]'],
    ['=IF(A1,1,2,', undefined],
  ])('highlights the active argument in %s', (formula, expected) => {
    const hints = new FormulaHints({ getCustomFunction: () => undefined } as unknown as Workbook, document.createElement('div'), () => {});
    hints.update(formula, formula.length);
    expect(document.querySelector('[role=tooltip] b')?.textContent).toBe(expected);
    hints.close();
  });
});
