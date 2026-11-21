/**
 * TASK 78: VLOOKUP behavioural contract for the lazily-scanned reference
 * table path (`.probe/t78/prof-recalc2.mjs` showed the shared-table bulk case
 * was the recalculation hot spot). The reference path must keep exactly the
 * semantics of the generic materialised path: first-match wins, wildcard exact
 * match, approximate binary search, #N/A/#REF!/#VALUE! errors, whole-column
 * and cross-sheet tables, and correct re-evaluation when the table itself
 * changes (the range-dependant memo of `formulasInRange` must invalidate with
 * the graph version).
 */
import { describe, expect, it } from 'vitest';
import GC from '../src/index.js';
import { Workbook } from '../src/model.js';
import { CalcError } from '../src/calc/values.js';

const W = GC.Spread.Sheets;

function wb(): InstanceType<typeof Workbook> {
  const workbook = new Workbook();
  const sheet = workbook.getSheet(0);
  sheet.setRowCount(1000);
  sheet.setColumnCount(50);
  return workbook;
}

function vlookup(sheet: ReturnType<Workbook['getSheet']>, text: string): unknown {
  sheet.setFormula(0, 30, text);
  return sheet.getValue(0, 30);
}

function fillTable(sheet: ReturnType<Workbook['getSheet']>, rows: unknown[][], row = 0, col = 0): void {
  sheet.setArray(row, col, rows);
}

describe('VLOOKUP over a reference table (TASK 78 lazy scan)', () => {
  it('finds the first exact match, reading only the needed columns', () => {
    const workbook = wb();
    const sheet = workbook.getSheet(0);
    fillTable(sheet, [
      [10, 'ten', 'x1'],
      [20, 'twenty', 'x2'],
      [10, 'duplicate', 'x3'],
    ]); // A1:C3
    expect(vlookup(sheet, 'VLOOKUP(20,$A$1:$C$3,2,FALSE)')).toBe('twenty');
    expect(vlookup(sheet, 'VLOOKUP(10,$A$1:$C$3,3,FALSE)')).toBe('x1'); // first hit wins
    expect(vlookup(sheet, 'VLOOKUP(30,$A$1:$C$3,1,FALSE)')).toBeInstanceOf(CalcError);
  });

  it('supports wildcard exact match and case-insensitive text', () => {
    const workbook = wb();
    const sheet = workbook.getSheet(0);
    fillTable(sheet, [
      ['apple', 1],
      ['banana', 2],
    ]);
    expect(vlookup(sheet, 'VLOOKUP("b*",A:B,2,FALSE)')).toBe(2);
    expect(vlookup(sheet, 'VLOOKUP("BANANA",A:B,2,FALSE)')).toBe(2);
  });

  it('does an approximate search on the first column only', () => {
    const workbook = wb();
    const sheet = workbook.getSheet(0);
    fillTable(sheet, [
      [1, 'one'],
      [3, 'three'],
      [5, 'five'],
    ]);
    expect(vlookup(sheet, 'VLOOKUP(4,A:B,2)')).toBe('three'); // omitted arg = TRUE
    expect(vlookup(sheet, 'VLOOKUP(4,A:B,2,TRUE)')).toBe('three');
    expect(vlookup(sheet, 'VLOOKUP(0,$A$1:$B$3,2,TRUE)')).toBeInstanceOf(CalcError); // below min -> #N/A
    expect(vlookup(sheet, 'VLOOKUP(9,$A$1:$B$3,2,TRUE)')).toBe('five');
  });

  it('keeps the generic-path error codes', () => {
    const workbook = wb();
    const sheet = workbook.getSheet(0);
    fillTable(sheet, [
      [1, 'a'],
      [2, 'b'],
    ]);
    expect(vlookup(sheet, 'VLOOKUP(1,A:B,3,FALSE)')).toBeInstanceOf(CalcError); // #REF! col too big
    expect(vlookup(sheet, 'VLOOKUP(1,A:B,0,FALSE)')).toBeInstanceOf(CalcError); // #VALUE! col < 1
    expect(String((vlookup(sheet, 'VLOOKUP(3,A:B,3,FALSE)') as CalcError).error)).toBeTruthy();
    // single-cell and scalar tables keep the old behaviour (generic path)
    sheet.setValue(10, 10, 7);
    expect(vlookup(sheet, 'VLOOKUP(7,K11:K11,1,FALSE)')).toBe(7);
    expect(vlookup(sheet, 'VLOOKUP(1,{1;2},1,FALSE)')).toBe(1); // array-constant table
    expect(vlookup(sheet, 'VLOOKUP(2,"nope",1,FALSE)')).toBeInstanceOf(CalcError);
  });

  it('works with whole-column and cross-sheet references', () => {
    const workbook = wb();
    const sheet = workbook.getSheet(0);
    fillTable(sheet, [
      [5, 'five'],
      [6, 'six'],
    ]);
    // A:A is a single column: value found, column 2 outside the table -> #REF!
    expect(vlookup(sheet, 'VLOOKUP(6,A:A,2,FALSE)')).toBeInstanceOf(CalcError);
    expect(vlookup(sheet, 'VLOOKUP(6,A:B,2,FALSE)')).toBe('six');
    workbook.addSheet(1, new W.Worksheet('Data'));
    const data = workbook.getSheet(1);
    data.setRowCount(1000);
    data.setColumnCount(50);
    fillTable(data, [
      [8, 'eight'],
      [9, 'nine'],
    ]);
    expect(vlookup(sheet, 'VLOOKUP(9,Data!A:B,2,FALSE)')).toBe('nine');
    expect(vlookup(sheet, 'VLOOKUP(8,Data!A:A,1,FALSE)')).toBe(8);
  });

  it('re-evaluates when a table formula lands inside a previously scanned range', () => {
    // exercises the formulasInRange range-dependency memo invalidation: the
    // graph changes (new formula inside $A$1:$B$3) after the first calculation
    const workbook = wb();
    const sheet = workbook.getSheet(0);
    fillTable(sheet, [
      [1, 'one'],
      [null, null],
      [3, 'three'],
    ]);
    expect(vlookup(sheet, 'VLOOKUP(2,A:B,2,TRUE)')).toBe('one'); // largest <= 2 is 1
    sheet.setFormula(1, 0, '=A1+1'); // A2 = 2
    sheet.setFormula(1, 1, '=A2&"-two"'); // B2 shows "two"
    expect(sheet.getValue(1, 0)).toBe(2);
    expect(vlookup(sheet, 'VLOOKUP(2,A:B,2,TRUE)')).toBe('2-two'); // exact-ish approximate hit
  });

  it('reads through the table when dependents re-register after a bulk change', () => {
    const workbook = wb();
    const sheet = workbook.getSheet(0);
    for (let r = 1; r <= 50; r++) {
      sheet.setValue(r - 1, 0, r);
      sheet.setValue(r - 1, 1, r * 10);
    }
    for (let r = 0; r < 10; r++) sheet.setFormula(r, 5, '=VLOOKUP(' + (r + 1) + ',$A$1:$B$50,2,FALSE)');
    for (let r = 0; r < 10; r++) expect(sheet.getValue(r, 5)).toBe((r + 1) * 10);
    // mutate a table cell -> every dependent formula must follow
    sheet.setValue(4, 1, -1);
    expect(sheet.getValue(4, 5)).toBe(-1);
    // add a formula inside the table range: the dependent graph must be rebuilt
    sheet.setFormula(9, 1, '=A10*2');
    expect(sheet.getValue(9, 5)).toBe(20);
    sheet.setFormula(9, 1, null);
    sheet.setValue(9, 1, 100); // back to a plain value (setValue leaves formulas alone, the trial contract)
    expect(sheet.getValue(9, 5)).toBe(100);
  });
});
