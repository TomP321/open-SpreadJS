/**
 * TASK 38 item 4 - formula introspection and workbook calculation queries.
 *
 * Every expected value below is what the official SpreadJS 19.2.5 trial answers
 * for the same public calls (`.probe/api-sweep-probe.mjs`, reports
 * `.probe/report-item4*.json` / `.probe/item4[ef].log`).
 */
import { describe, expect, it } from 'vitest';
import GC from '../src/index.js';

const { Workbook, Worksheet } = GC.Spread.Sheets;

type CellsInfo = { row: number; col: number; rowCount: number; colCount: number; sheetName: string };

describe('Worksheet.getPrecedents', () => {
  const rows = (list: CellsInfo[]): unknown[] => list.map((item) => [item.row, item.col, item.rowCount, item.colCount, item.sheetName]);

  it('lists the ranges a formula reads in source order', () => {
    const wb = new Workbook();
    const sheet = wb.getActiveSheet();
    sheet.setArray(0, 0, [[1, 2], [3, 4]]);
    sheet.setFormula(4, 4, '=A1+B2');
    wb.calculate();
    expect(sheet.getPrecedents(4, 4)).toEqual([
      { row: 0, col: 0, rowCount: 1, colCount: 1, sheetName: 'Sheet1' },
      { row: 1, col: 1, rowCount: 1, colCount: 1, sheetName: 'Sheet1' },
    ]);
    // Trial: identical keys and key order.
    expect(Object.keys(sheet.getPrecedents(4, 4)[0]!)).toEqual(['row', 'col', 'rowCount', 'colCount', 'sheetName']);
  });

  it('deduplicates repeated references and keeps overlapping ranges separate', () => {
    const wb = new Workbook();
    const sheet = wb.getActiveSheet();
    sheet.setArray(0, 0, [[1, 2], [3, 4]]);
    sheet.setFormula(3, 0, '=A1+A1+B1');
    sheet.setFormula(4, 0, '=SUM(A1:A3)+SUM(A1:A3)');
    sheet.setFormula(5, 0, '=SUM(A1:A3)+SUM(A3:A5)');
    wb.calculate();
    expect(rows(sheet.getPrecedents(3, 0))).toEqual([[0, 0, 1, 1, 'Sheet1'], [0, 1, 1, 1, 'Sheet1']]);
    expect(rows(sheet.getPrecedents(4, 0))).toEqual([[0, 0, 3, 1, 'Sheet1']]);
    expect(rows(sheet.getPrecedents(5, 0))).toEqual([[0, 0, 3, 1, 'Sheet1'], [2, 0, 3, 1, 'Sheet1']]);
  });

  it('reports whole columns and whole rows with the -1 extent', () => {
    const wb = new Workbook();
    const sheet = wb.getActiveSheet();
    sheet.setArray(0, 0, [[1, 2], [3, 4]]);
    sheet.setFormula(9, 0, '=SUM(A:A)');
    sheet.setFormula(9, 1, '=SUM(1:1)');
    sheet.setFormula(9, 2, '=SUM(A:A)+SUM(B:B)');
    wb.calculate();
    expect(rows(sheet.getPrecedents(9, 0))).toEqual([[-1, 0, -1, 1, 'Sheet1']]);
    expect(rows(sheet.getPrecedents(9, 1))).toEqual([[0, -1, 1, -1, 'Sheet1']]);
    expect(rows(sheet.getPrecedents(9, 2))).toEqual([[-1, 0, -1, 1, 'Sheet1'], [-1, 1, -1, 1, 'Sheet1']]);
  });

  it('collects union parts, both sides of an intersection, and absolute references', () => {
    const wb = new Workbook();
    const sheet = wb.getActiveSheet();
    sheet.setArray(0, 0, [[1, 2, 3], [4, 5, 6], [7, 8, 9]]);
    sheet.setFormula(9, 3, '=SUM(A1,B2)');
    sheet.setFormula(9, 4, '=SUM($A$1:$A$3)');
    sheet.setFormula(9, 5, '=SUM((A1:A2,B2:C3))');
    sheet.setFormula(9, 6, '=SUM(A1:C3 A2:B3)');
    wb.calculate();
    expect(rows(sheet.getPrecedents(9, 3))).toEqual([[0, 0, 1, 1, 'Sheet1'], [1, 1, 1, 1, 'Sheet1']]);
    expect(rows(sheet.getPrecedents(9, 4))).toEqual([[0, 0, 3, 1, 'Sheet1']]);
    expect(rows(sheet.getPrecedents(9, 5))).toEqual([[0, 0, 2, 1, 'Sheet1'], [1, 1, 2, 2, 'Sheet1']]);
    expect(rows(sheet.getPrecedents(9, 6))).toEqual([[0, 0, 3, 3, 'Sheet1'], [1, 0, 2, 2, 'Sheet1']]);
  });

  it('follows references in every function argument but not INDIRECT', () => {
    const wb = new Workbook();
    const sheet = wb.getActiveSheet();
    sheet.setArray(0, 0, [[1, 2, 3], [4, 5, 6], [7, 8, 9]]);
    sheet.setFormula(9, 7, '=IF(A1,A2,A3)');
    sheet.setFormula(9, 0, '=INDIRECT("B2")');
    sheet.setFormula(9, 2, '=OFFSET(A1,2,2)');
    sheet.setFormula(9, 3, '=INDEX(A1:C3,2,2)');
    sheet.setFormula(9, 9, '=SUM({1,2}+A1)');
    wb.calculate();
    expect(rows(sheet.getPrecedents(9, 7))).toEqual([[0, 0, 1, 1, 'Sheet1'], [1, 0, 1, 1, 'Sheet1'], [2, 0, 1, 1, 'Sheet1']]);
    expect(rows(sheet.getPrecedents(9, 0))).toEqual([]);
    expect(rows(sheet.getPrecedents(9, 2))).toEqual([[0, 0, 1, 1, 'Sheet1']]);
    expect(rows(sheet.getPrecedents(9, 3))).toEqual([[0, 0, 3, 3, 'Sheet1']]);
    expect(rows(sheet.getPrecedents(9, 9))).toEqual([[0, 0, 1, 1, 'Sheet1']]);
  });

  it('resolves cross-sheet references under the referenced sheet name', () => {
    const wb = new Workbook();
    const sheet = wb.getActiveSheet();
    wb.addSheet(1, new Worksheet('PM2'));
    wb.addSheet(2, new Worksheet('Other'));
    wb.getSheet(2).setFormula(0, 0, '=PM2!A1');
    sheet.setArray(0, 0, [[1, 2], [3, 4]]);
    wb.getSheet(1).setFormula(0, 0, '=Sheet1!B2*2');
    sheet.setFormula(1, 0, '=Other!A1+SUM(Sheet1!A1:B2)');
    wb.calculate();
    expect(rows(wb.getSheet(2).getPrecedents(0, 0))).toEqual([[0, 0, 1, 1, 'PM2']]);
    expect(rows(wb.getSheet(1).getPrecedents(0, 0))).toEqual([[1, 1, 1, 1, 'Sheet1']]);
    expect(rows(sheet.getPrecedents(1, 0))).toEqual([
      [0, 0, 1, 1, 'Other'],
      [0, 0, 2, 2, 'Sheet1'],
    ]);
  });

  it('resolves a named range against the cell that uses it', () => {
    const wb = new Workbook();
    const sheet = wb.getActiveSheet();
    sheet.addCustomName('MYNAME', 'A1:B2', 0, 0);
    sheet.setFormula(8, 0, '=SUM(MYNAME)');
    wb.addSheet(1, new Worksheet('PM2'));
    wb.getSheet(1).addCustomName('PMNAME', 'A1:B2', 0, 0);
    sheet.setFormula(10, 0, '=SUM(PM2!PMNAME)');
    wb.calculate();
    expect(rows(sheet.getPrecedents(8, 0))).toEqual([[8, 0, 2, 2, 'Sheet1']]);
    expect(rows(sheet.getPrecedents(10, 0))).toEqual([[10, 0, 2, 2, 'Sheet1']]);
  });

  it('does not report a range the formula itself uses as its value', () => {
    // Trial (`.probe/report-item4l.json`, item prec-operand): a multi-cell range
    // written as an operand is consumed by the implicit array and never listed,
    // while the same range inside a function, a union or an IF argument is.
    const wb = new Workbook();
    const sheet = wb.getActiveSheet();
    sheet.setArray(0, 0, [[1, 2, 3], [4, 5, 6], [7, 8, 9]]);
    const at = (text: string, row: number): unknown[] => {
      sheet.setFormula(row, 0, text);
      wb.calculate();
      return rows(sheet.getPrecedents(row, 0));
    };
    expect(at('=A1:C3*2', 12)).toEqual([]);
    expect(at('=A1:C3', 13)).toEqual([]);
    expect(at('=-A1:C3', 16)).toEqual([]);
    expect(at('=(A1:C3)*2', 17)).toEqual([]);
    expect(at('=A1:C3+A5', 14)).toEqual([[4, 0, 1, 1, 'Sheet1']]);
    expect(at('=A5+A1:C3', 15)).toEqual([[4, 0, 1, 1, 'Sheet1']]);
    expect(at('=A5*2', 18)).toEqual([[4, 0, 1, 1, 'Sheet1']]);
    expect(at('=(A1:A2,B2:C3)*2', 19)).toEqual([
      [0, 0, 2, 1, 'Sheet1'],
      [1, 1, 2, 2, 'Sheet1'],
    ]);
    expect(at('=IF(A5,A1:C3,0)', 20)).toEqual([
      [4, 0, 1, 1, 'Sheet1'],
      [0, 0, 3, 3, 'Sheet1'],
    ]);
    expect(at('=SUM(A1:C3)*2', 21)).toEqual([[0, 0, 3, 3, 'Sheet1']]);
    wb.destroy();
  });

  it('answers an empty list for cells without a formula and outside the grid', () => {
    const wb = new Workbook();
    const sheet = wb.getActiveSheet();
    sheet.setValue(0, 0, 5);
    expect(sheet.getPrecedents(0, 0)).toEqual([]);
    expect(sheet.getPrecedents(199, 19)).toEqual([]);
    expect(sheet.getPrecedents(-1, 0)).toEqual([]);
    expect(sheet.getPrecedents(1000, 1000)).toEqual([]);
    expect((sheet.getPrecedents as () => unknown[])()).toEqual([]);
  });
});

describe('Worksheet.getDependents', () => {
  const rows = (list: CellsInfo[]): unknown[] => list.map((item) => [item.row, item.col, item.rowCount, item.colCount, item.sheetName]);

  it('lists direct references first, then range references in registration order', () => {
    const wb = new Workbook();
    const sheet = wb.getActiveSheet();
    sheet.setArray(0, 0, [[1, 2], [3, 4]]);
    sheet.setFormula(9, 0, '=SUM(A1:B2)');
    sheet.setFormula(9, 1, '=A1*2');
    sheet.setFormula(9, 2, '=A1+B1');
    sheet.setFormula(9, 3, '=SUM(A:A)');
    sheet.setFormula(9, 4, '=A1#');
    wb.calculate();
    expect(rows(sheet.getDependents(0, 0))).toEqual([
      [9, 1, 1, 1, 'Sheet1'],
      [9, 2, 1, 1, 'Sheet1'],
      [9, 4, 1, 1, 'Sheet1'],
      [9, 0, 1, 1, 'Sheet1'],
      [9, 3, 1, 1, 'Sheet1'],
    ]);
    expect(rows(sheet.getDependents(1, 1))).toEqual([[9, 0, 1, 1, 'Sheet1']]);
  });

  it('drops a dependent when its formula is removed', () => {
    const wb = new Workbook();
    const sheet = wb.getActiveSheet();
    sheet.setArray(0, 0, [[1, 2], [3, 4]]);
    sheet.setFormula(9, 0, '=SUM(A1:B2)');
    sheet.setFormula(9, 1, '=A1*2');
    wb.calculate();
    expect(rows(sheet.getDependents(0, 0))).toEqual([[9, 1, 1, 1, 'Sheet1'], [9, 0, 1, 1, 'Sheet1']]);
    sheet.clear(9, 1, 1, 1);
    expect(rows(sheet.getDependents(0, 0))).toEqual([[9, 0, 1, 1, 'Sheet1']]);
  });

  it('includes dependents from other sheets', () => {
    const wb = new Workbook();
    const sheet = wb.getActiveSheet();
    sheet.setValue(0, 0, 1);
    wb.addSheet(1, new Worksheet('Other2'));
    wb.getSheet(1).setFormula(0, 0, '=Sheet1!A1+Sheet1!B2');
    wb.calculate();
    expect(rows(sheet.getDependents(0, 0))).toEqual([[0, 0, 1, 1, 'Other2']]);
    expect(rows(sheet.getDependents(1, 1))).toEqual([[0, 0, 1, 1, 'Other2']]);
  });

  it('treats -1 as the whole column or whole row the formula reads', () => {
    const wb = new Workbook();
    const sheet = wb.getActiveSheet();
    sheet.setArray(0, 0, [[1, 2], [3, 4]]);
    sheet.setFormula(9, 0, '=SUM(A1:B2)');
    sheet.setFormula(9, 1, '=A1*2');
    sheet.setFormula(9, 2, '=SUM(A:A)');
    sheet.setFormula(9, 3, '=SUM(1:1)');
    sheet.setFormula(9, 4, '=SUM(A1:C3)');
    wb.calculate();
    expect(rows(sheet.getDependents(-1, 0))).toEqual([[9, 2, 1, 1, 'Sheet1']]);
    expect(rows(sheet.getDependents(0, -1))).toEqual([[9, 3, 1, 1, 'Sheet1']]);
    expect(sheet.getDependents(-1, -1)).toEqual([]);
    expect(sheet.getDependents(1, -1)).toEqual([]);
    expect(rows(sheet.getDependents(199, 0))).toEqual([[9, 2, 1, 1, 'Sheet1']]);
    expect(sheet.getDependents(500, 500)).toEqual([]);
    expect((sheet.getDependents as () => unknown[])()).toEqual([]);
  });

  it('reports a defined name where the name actually reads the cell', () => {
    // Trial (items `dep-name-mixed`, `dep-refs`): a name is re-based at the cell
    // that uses it. The relative name `MYNAMESUP` (`A1:B2`) only covers the block
    // around its user, so it is never listed for A1 and lists its own cell; the
    // absolute names keep their fixed range and are listed for the cells inside it.
    const wb = new Workbook();
    const sheet = wb.getActiveSheet();
    sheet.setArray(0, 0, [[1, 2], [3, 4]]);
    sheet.addCustomName('MYNAMESUP', 'A1:B2', 0, 0);
    sheet.addCustomName('MYABSNAME', '$A$1:$B$2', 0, 0);
    sheet.addCustomName('MYABSCELL', '$A$1', 0, 0);
    sheet.setFormula(9, 0, '=SUM(A1:B2)');
    sheet.setFormula(9, 1, '=A1*2');
    sheet.setFormula(9, 2, '=A1+SUM(MYNAMESUP)');
    sheet.setFormula(9, 3, '=SUM(MYABSNAME)');
    sheet.setFormula(9, 4, '=MYABSCELL*2');
    sheet.setFormula(9, 5, '=SUM(MYNAMESUP)');
    wb.calculate();
    expect(rows(sheet.getDependents(0, 0))).toEqual([
      [9, 1, 1, 1, 'Sheet1'],
      [9, 2, 1, 1, 'Sheet1'],
      [9, 4, 1, 1, 'Sheet1'],
      [9, 0, 1, 1, 'Sheet1'],
      [9, 3, 1, 1, 'Sheet1'],
    ]);
    // The relative name reads its own block: the cell is its own dependent.
    expect(rows(sheet.getDependents(9, 5))).toEqual([[9, 5, 1, 1, 'Sheet1']]);
    expect(rows(sheet.getPrecedents(9, 5))).toEqual([[9, 5, 2, 2, 'Sheet1']]);
    expect(rows(sheet.getPrecedents(9, 3))).toEqual([[0, 0, 2, 2, 'Sheet1']]);
    expect(rows(sheet.getPrecedents(9, 4))).toEqual([[0, 0, 1, 1, 'Sheet1']]);
    expect([sheet.getValue(9, 0), sheet.getValue(9, 1), sheet.getValue(9, 3), sheet.getValue(9, 4), sheet.getValue(9, 5)]).toEqual([
      10, 2, 10, 2, 0,
    ]);
    // Recalculation runs through the name too: A1 is the value the absolute names
    // resolve to, while the relative-name user keeps its own block.
    sheet.setValue(0, 0, 10);
    expect([sheet.getValue(9, 1), sheet.getValue(9, 3), sheet.getValue(9, 4), sheet.getValue(9, 5)]).toEqual([20, 19, 20, 0]);
    // A cell that reaches A1 both directly and through a name is listed once
    // (trial item `dep-name-mixed`: `=A1+SUM(MYNAMESUP)` at row 9 column 2).
    sheet.setFormula(9, 6, '=A1+SUM(MYNAMESUP)');
    wb.calculate();
    expect(rows(sheet.getDependents(0, 0))).toEqual([
      [9, 1, 1, 1, 'Sheet1'],
      [9, 2, 1, 1, 'Sheet1'],
      [9, 4, 1, 1, 'Sheet1'],
      [9, 6, 1, 1, 'Sheet1'],
      [9, 0, 1, 1, 'Sheet1'],
      [9, 3, 1, 1, 'Sheet1'],
    ]);
    wb.destroy();
  });

  it('answers an empty list for a plain value cell and a spill output cell', () => {
    const wb = new Workbook();
    const sheet = wb.getActiveSheet();
    sheet.setValue(0, 0, 1);
    sheet.setFormula(1, 0, '=A1*2');
    wb.calculate();
    expect(rows(sheet.getDependents(1, 0))).toEqual([]);
    expect(rows(sheet.getDependents(0, 0))).toEqual([[1, 0, 1, 1, 'Sheet1']]);
  });
});

describe('Worksheet.getFormulaInformation', () => {
  it('reports the stored formula with the trial key order', () => {
    const wb = new Workbook();
    const sheet = wb.getActiveSheet();
    sheet.setArray(0, 0, [[1, 2], [3, 4]]);
    sheet.setFormula(5, 0, '=SUM(A1:B2)*2');
    const info = sheet.getFormulaInformation(5, 0) as Record<string, unknown>;
    expect(Object.keys(info)).toEqual(['hasFormula', 'isArrayFormula', 'formula', 'formulaWithCulture']);
    expect(info.hasFormula).toBe(true);
    expect(info.isArrayFormula).toBe(false);
    expect(info.formula).toBe('SUM(A1:B2)*2');
    expect(info.formulaWithCulture).toBe('SUM(A1:B2)*2');
  });

  it('answers an object with no defined fields for a cell without a formula', () => {
    const wb = new Workbook();
    const sheet = wb.getActiveSheet();
    expect(sheet.getFormulaInformation(0, 0)).toEqual({});
    expect(Object.keys(sheet.getFormulaInformation(0, 0))).toEqual([]);
    sheet.setValue(1, 1, 7);
    expect(sheet.getFormulaInformation(1, 1)).toEqual({});
    expect((sheet.getFormulaInformation as () => unknown)()).toEqual({});
  });

  it('keeps the information after the formula is cleared', () => {
    const wb = new Workbook();
    const sheet = wb.getActiveSheet();
    sheet.setFormula(2, 2, '=1+1');
    wb.calculate();
    expect(sheet.getFormulaInformation(2, 2).hasFormula).toBe(true);
    sheet.clear(2, 2, 1, 1);
    expect(sheet.getFormulaInformation(2, 2)).toEqual({});
  });
});

describe('Workbook custom function scope', () => {
  class Adder extends GC.Spread.CalcEngine.Functions.Function {
    constructor() {
      super('MYADD', 0, 4, { description: 'add', parameters: [{ name: 'a', repeatable: true }] });
    }
    evaluate(...args: unknown[]): number {
      return args.reduce<number>((total, value) => total + (Number(value) || 0), 0);
    }
  }
  class Doubler extends GC.Spread.CalcEngine.Functions.Function {
    constructor() {
      super('SHEETFN', 1, 1, { description: 'double', parameters: [{ name: 'x' }] });
    }
    evaluate(x: unknown): number {
      return Number(x) * 2;
    }
  }

  it('registers workbook and sheet scopes and answers #NAME? for unknown names', () => {
    const wb = new Workbook();
    const sheet = wb.getActiveSheet();
    wb.addCustomFunction(new Adder());
    sheet.setFormula(0, 0, '=MYADD(1,2,3)');
    wb.calculate();
    expect(sheet.getValue(0, 0)).toBe(6);
    expect(sheet.getFormula(0, 0)).toBe('MYADD(1,2,3)');
    expect(sheet.getText(0, 0)).toBe('6');
    const registered = wb.getCustomFunction('MYADD') as InstanceType<typeof GC.Spread.CalcEngine.Functions.Function>;
    expect(registered.name).toBe('MYADD');
    expect(registered.minArgs).toBe(0);
    expect(registered.maxArgs).toBe(4);
    // Trial: the sheet getter does not see workbook-scope functions.
    expect(sheet.getCustomFunction('MYADD')).toBeUndefined();
    wb.calculate();
    expect(sheet.getValue(0, 0)).toBe(6);
  });

  it('removes only from its own scope', () => {
    const wb = new Workbook();
    const sheet = wb.getActiveSheet();
    wb.addCustomFunction(new Adder());
    sheet.removeCustomFunction('MYADD');
    sheet.setFormula(0, 0, '=MYADD(1,2)');
    wb.calculate();
    expect(sheet.getValue(0, 0)).toBe(3);
    sheet.addCustomFunction(new Doubler());
    sheet.setFormula(1, 0, '=SHEETFN(1)');
    wb.calculate();
    expect(sheet.getValue(1, 0)).toBe(2);
    wb.removeCustomFunction('SHEETFN');
    expect(sheet.getCustomFunction('SHEETFN')).toBeDefined();
    expect((wb.getCustomFunction('SHEETFN') as object | undefined)).toBeUndefined();
  });

  it('clears only the scope it was called on and new formulas then answer #NAME?', () => {
    const wb = new Workbook();
    const sheet = wb.getActiveSheet();
    wb.addCustomFunction(new Adder());
    sheet.addCustomFunction(new Doubler());
    sheet.setFormula(0, 0, '=MYADD(1)');
    sheet.setFormula(1, 0, '=SHEETFN(2)');
    wb.calculate();
    expect(sheet.getValue(0, 0)).toBe(1);
    expect(sheet.getValue(1, 0)).toBe(4);
    sheet.clearCustomFunctions();
    expect(sheet.getCustomFunction('SHEETFN')).toBeUndefined();
    expect((wb.getCustomFunction('MYADD') as object)).toBeDefined();
    sheet.setFormula(2, 0, '=SHEETFN(3)');
    wb.calculate();
    expect((sheet.getValue(2, 0) as { error?: string }).error).toBe('#NAME?');
    expect(sheet.getText(2, 0)).toBe('#NAME?');
    wb.clearCustomFunctions();
    expect(wb.getCustomFunction('MYADD')).toBeUndefined();
    sheet.setFormula(3, 0, '=MYADD(4)');
    wb.calculate();
    expect((sheet.getValue(3, 0) as { error?: string }).error).toBe('#NAME?');
    wb.addSheet(1, new Worksheet('OtherSheet'));
    wb.getSheet(1).setFormula(0, 0, '=SHEETFN(10)');
    wb.calculate();
    expect((wb.getSheet(1).getValue(0, 0) as { error?: string }).error).toBe('#NAME?');
  });

  it('prefers the sheet-scope function over the workbook one and ignores case', () => {
    const wb = new Workbook();
    const sheet = wb.getActiveSheet();
    class Low extends GC.Spread.CalcEngine.Functions.Function {
      constructor() {
        super('FN', 1, 1, { description: 'l', parameters: [{ name: 'x' }] });
      }
      evaluate(x: unknown): number {
        return Number(x) + 100;
      }
    }
    class High extends GC.Spread.CalcEngine.Functions.Function {
      constructor() {
        super('FN', 1, 1, { description: 'g', parameters: [{ name: 'x' }] });
      }
      evaluate(x: unknown): number {
        return Number(x) + 1;
      }
    }
    wb.addCustomFunction(new High());
    sheet.addCustomFunction(new Low());
    sheet.setFormula(0, 0, '=FN(1)');
    wb.calculate();
    expect(sheet.getValue(0, 0)).toBe(101);
    wb.addSheet(1, new Worksheet('Other'));
    wb.getSheet(1).setFormula(0, 0, '=FN(1)');
    wb.calculate();
    expect(wb.getSheet(1).getValue(0, 0)).toBe(2);
    sheet.setFormula(1, 0, '=fn(3)');
    wb.calculate();
    expect(sheet.getValue(1, 0)).toBe(103);
    expect(wb.getCustomFunction('fn')).toBeDefined();
    expect(wb.getCustomFunction('SUM')).toBeUndefined();
    expect(sheet.getCustomFunction('SUM')).toBeUndefined();
  });

  it('removing or clearing unknown names does not throw and keeps values cached', () => {
    const wb = new Workbook();
    const sheet = wb.getActiveSheet();
    expect(() => sheet.removeCustomFunction('NOPE')).not.toThrow();
    expect(() => wb.removeCustomFunction('NOPE')).not.toThrow();
    expect(() => sheet.clearCustomFunctions()).not.toThrow();
    expect(() => wb.clearCustomFunctions()).not.toThrow();
    wb.addCustomFunction(new Adder());
    sheet.setFormula(2, 0, '=MYADD(2,2)');
    wb.calculate();
    expect(sheet.getValue(2, 0)).toBe(4);
    wb.removeCustomFunction('MYADD');
    wb.calculate();
    expect(sheet.getValue(2, 0)).toBe(4);
    // Trial: no custom-function data is ever written to the sheet JSON.
    expect(Object.keys(sheet.toJSON()).some((key) => /function/i.test(key))).toBe(false);
  });

  it('rejects a registration that is not a function object, like the trial', () => {
    const wb = new Workbook();
    const sheet = wb.getActiveSheet();
    expect(() =>
      (wb.addCustomFunction as (a: unknown, b?: unknown, c?: unknown, d?: unknown) => void)('LEGFNX', (x: unknown) => Number(x) * 3, 1, 1),
    ).toThrow('invalid custom function');
    expect(() => (sheet.addCustomFunction as (fn: unknown) => void)('NAMEONLY')).toThrow('invalid custom function');
  });
});

describe('Workbook.getCircularReference', () => {
  const rows = (list: CellsInfo[]): unknown[] => list.map((item) => [item.row, item.col, item.rowCount, item.colCount, item.sheetName]);

  it('lists every cell of a cycle in sheet, row and column order', () => {
    const wb = new Workbook();
    const sheet = wb.getActiveSheet();
    sheet.setFormula(0, 0, '=B1');
    sheet.setFormula(0, 1, '=A1');
    wb.calculate();
    expect(rows(wb.getCircularReference())).toEqual([[0, 0, 1, 1, 'Sheet1'], [0, 1, 1, 1, 'Sheet1']]);
    expect(sheet.getValue(0, 0)).toBe(0);
    expect(sheet.getText(0, 0)).toBe('0');
  });

  it('reports a three-cell cycle and a self reference', () => {
    const wb = new Workbook();
    const sheet = wb.getActiveSheet();
    sheet.setFormula(0, 0, '=B1');
    sheet.setFormula(0, 1, '=A1+C1');
    sheet.setFormula(0, 2, '=A1');
    wb.calculate();
    expect(rows(wb.getCircularReference())).toEqual([
      [0, 0, 1, 1, 'Sheet1'],
      [0, 1, 1, 1, 'Sheet1'],
      [0, 2, 1, 1, 'Sheet1'],
    ]);
    expect([sheet.getValue(0, 0), sheet.getValue(0, 1), sheet.getValue(0, 2)]).toEqual([0, 0, 0]);
    const other = new Workbook();
    const cell = other.getActiveSheet();
    cell.setFormula(1, 1, '=B2');
    other.calculate();
    expect(rows(other.getCircularReference())).toEqual([[1, 1, 1, 1, 'Sheet1']]);
    expect(cell.getValue(1, 1)).toBe(0);
    other.destroy();
  });

  it('is empty for a fresh workbook and after the cycle is broken', () => {
    const wb = new Workbook();
    expect(wb.getCircularReference()).toEqual([]);
    const sheet = wb.getActiveSheet();
    sheet.setFormula(0, 0, '=1+1');
    wb.calculate();
    expect(wb.getCircularReference()).toEqual([]);
    sheet.setFormula(0, 0, '=B1');
    sheet.setFormula(0, 1, '=A1');
    wb.calculate();
    expect(wb.getCircularReference().length).toBe(2);
    sheet.clear(0, 0, 1, 1);
    wb.calculate();
    expect(wb.getCircularReference()).toEqual([]);
  });

  it('keeps the cycle listed with iterative calculation off', () => {
    const wb = new Workbook();
    wb.options.iterativeCalculation = false;
    const sheet = wb.getActiveSheet();
    sheet.setFormula(1, 1, '=B2+1');
    wb.calculate();
    expect(sheet.getValue(1, 1)).toBe(0);
    expect(rows(wb.getCircularReference())).toEqual([[1, 1, 1, 1, 'Sheet1']]);
  });

  it('spans sheets and orders them by sheet index', () => {
    const wb = new Workbook();
    const sheet = wb.getActiveSheet();
    wb.addSheet(1, new Worksheet('OtherCirc'));
    const other = wb.getSheet(1);
    other.setFormula(0, 0, '=Sheet1!A1');
    sheet.setFormula(0, 0, '=OtherCirc!A1');
    wb.calculate();
    expect(rows(wb.getCircularReference())).toEqual([
      [0, 0, 1, 1, 'Sheet1'],
      [0, 0, 1, 1, 'OtherCirc'],
    ]);
    expect([sheet.getValue(0, 0), other.getValue(0, 0)]).toEqual([0, 0]);
    wb.removeSheet(1);
    wb.calculate();
    expect(wb.getCircularReference()).toEqual([]);
  });
});

describe('Workbook iterative circular calculation', () => {
  it('runs two passes per declared iteration, like the trial', () => {
    const wb = new Workbook();
    wb.options.iterativeCalculation = true;
    wb.options.iterativeCalculationMaximumIterations = 3;
    const sheet = wb.getActiveSheet();
    sheet.setFormula(1, 1, '=B2+1');
    wb.calculate();
    expect(sheet.getValue(1, 1)).toBe(6);
    wb.options.iterativeCalculationMaximumIterations = 1;
    sheet.clear(1, 1, 1, 1);
    sheet.setFormula(1, 1, '=B2+1');
    wb.calculate();
    expect(sheet.getValue(1, 1)).toBe(2);
    wb.options.iterativeCalculationMaximumIterations = 7;
    sheet.setValue(3, 3, 'x');
    wb.calculate();
    expect(sheet.getValue(1, 1)).toBe(16);
    wb.options.iterativeCalculationMaximumIterations = 1000;
    wb.options.iterativeCalculationMaximumChange = 0.001;
    sheet.clear(1, 1, 1, 1);
    sheet.setFormula(1, 1, '=B2+0.5');
    wb.calculate();
    expect(sheet.getValue(1, 1)).toBe(1000);
  });

  it('reaches 3999 and 4000 for a two-cell counting cycle', () => {
    const wb = new Workbook();
    wb.options.iterativeCalculation = true;
    wb.options.iterativeCalculationMaximumIterations = 1000;
    const sheet = wb.getActiveSheet();
    sheet.setFormula(0, 0, '=B1+1');
    sheet.setFormula(0, 1, '=A1+1');
    wb.calculate();
    expect([sheet.getValue(0, 0), sheet.getValue(0, 1)]).toEqual([3999, 4000]);
    expect(
      wb.getCircularReference().map((item) => [item.row, item.col, item.rowCount, item.colCount, item.sheetName]),
    ).toEqual([
      [0, 0, 1, 1, 'Sheet1'],
      [0, 1, 1, 1, 'Sheet1'],
    ]);
  });
});

describe('Workbook.waitForAllCalculations', () => {
  it('resolves with undefined after the pending work is done', async () => {
    const wb = new Workbook();
    const sheet = wb.getActiveSheet();
    sheet.setFormula(0, 0, '=1+1');
    sheet.setValue(1, 0, 3);
    sheet.setFormula(2, 0, '=A1+A2');
    await expect(wb.waitForAllCalculations()).resolves.toBeUndefined();
    expect(sheet.getValue(2, 0)).toBe(5);
    await expect(wb.waitForAllCalculations().then(() => wb.waitForAllCalculations())).resolves.toBeUndefined();
    expect(sheet.getValue(2, 0)).toBe(5);
    wb.destroy();
  });
});

describe('Workbook external workbook references', () => {
  it('reads a range of another workbook and answers #REF! until values are loaded', () => {
    const wb = new Workbook();
    const sheet = wb.getActiveSheet();
    sheet.setFormula(0, 0, '=SUM([Book1.xlsx]Sheet1!A1:B2)+1');
    wb.calculate();
    expect(JSON.stringify(sheet.getValue(0, 0))).toBe('{"_calcError":"#REF!","_code":23}');
    expect(sheet.getText(0, 0)).toBe('#REF!');
    // Trial: the formula text is kept exactly as written.
    expect(sheet.getFormula(0, 0)).toBe('SUM([Book1.xlsx]Sheet1!A1:B2)+1');
    wb.updateExternalReference('Book1.xlsx', { Sheet1: [[1, 2], [3, 4]] });
    wb.calculate();
    expect(sheet.getValue(0, 0)).toBe(11);
    expect(sheet.getText(0, 0)).toBe('11');
  });

  it('lists the referenced workbooks and, with the detail flag, who reads what', () => {
    const wb = new Workbook();
    const sheet = wb.getActiveSheet();
    sheet.setFormula(9, 8, '=SUM([Book1.xlsx]Sheet1!A1:B2)+[Book2.xlsx]Sheet2!A1');
    wb.calculate();
    expect(wb.getExternalReferences()).toEqual([
      { name: 'Book1.xlsx', filePath: '' },
      { name: 'Book2.xlsx', filePath: '' },
    ]);
    expect(wb.getExternalReferences(true)).toEqual([
      {
        name: 'Book1.xlsx',
        filePath: '',
        items: [{ target: { row: 9, col: 8, sheetName: 'Sheet1' }, source: { row: 0, col: 0, rowCount: 2, colCount: 2, sheetName: 'Sheet1' } }],
      },
      {
        name: 'Book2.xlsx',
        filePath: '',
        items: [{ target: { row: 9, col: 8, sheetName: 'Sheet1' }, source: { row: 0, col: 0, rowCount: 1, colCount: 1, sheetName: 'Sheet2' } }],
      },
    ]);
    // Trial: an external reference is also listed as a precedent of its cell.
    expect(sheet.getPrecedents(9, 8)).toEqual([
      { row: 0, col: 0, rowCount: 2, colCount: 2, sheetName: '[Book1.xlsx]Sheet1' },
      { row: 0, col: 0, rowCount: 1, colCount: 1, sheetName: '[Book2.xlsx]Sheet2' },
    ]);
    // Trial: the reference stays listed after the formula is cleared.
    sheet.clear(9, 8, 1, 1);
    wb.calculate();
    expect(wb.getExternalReferences()).toEqual([{ name: 'Book1.xlsx', filePath: '' }, { name: 'Book2.xlsx', filePath: '' }]);
  });

  it('replaces sheet values with a payload and keeps the others with isMergeUpdate', () => {
    const wb = new Workbook();
    const sheet = wb.getActiveSheet();
    sheet.setFormula(0, 0, '=SUM([Book1.xlsx]Sheet1!A1:B2)');
    sheet.setFormula(1, 0, '=[Book1.xlsx]Sheet1!C1');
    wb.calculate();
    wb.updateExternalReference('Book1.xlsx', { Sheet1: [[1, 2], [3, 4]] });
    wb.calculate();
    expect([sheet.getValue(0, 0), sheet.getValue(1, 0)]).toEqual([10, 0]);
    // Trial: a sparse payload replaces the sheet's values.
    wb.updateExternalReference('Book1.xlsx', { Sheet1: { 0: { 0: 9 } } });
    wb.calculate();
    expect([sheet.getValue(0, 0), sheet.getValue(1, 0)]).toEqual([9, 0]);
    // Trial: a merge update keeps the values the payload does not mention.
    wb.updateExternalReference('Book1.xlsx', { Sheet1: { 1: { 1: 100 } } }, undefined, true);
    wb.calculate();
    expect([sheet.getValue(0, 0), sheet.getValue(1, 0)]).toEqual([109, 0]);
    // Trial: a path that does not match the reference changes nothing.
    wb.updateExternalReference('Book1.xlsx', { Sheet1: { 0: { 0: 500 } } }, 'C:/files/Book1.xlsx');
    wb.calculate();
    expect([sheet.getValue(0, 0), sheet.getValue(1, 0)]).toEqual([109, 0]);
    // Updating a workbook nothing refers to is accepted and changes nothing.
    wb.updateExternalReference({ 'Book3.xlsx': { Sheet1: [[7]] } });
    wb.calculate();
    expect(wb.getExternalReferences()).toEqual([{ name: 'Book1.xlsx', filePath: '' }]);
  });

  it('writes and reads the values back through the workbook JSON', () => {
    const wb = new Workbook();
    const sheet = wb.getActiveSheet();
    sheet.setFormula(0, 0, '=SUM([Book1.xlsx]Sheet1!A1:B2)');
    wb.calculate();
    // Trial: a recorded reference without values serialises with isNew.
    expect(JSON.stringify(wb.toJSON().externalReference)).toBe(
      '{"1":{"option":{"name":"Book1.xlsx","path":""},"sheetNames":["Sheet1"],"data":{"Sheet1":{"isNew":true}}}}',
    );
    wb.updateExternalReference('Book1.xlsx', { Sheet1: [[1, 2], [3, 4]] });
    wb.calculate();
    expect(JSON.stringify(wb.toJSON().externalReference)).toBe(
      '{"1":{"option":{"name":"Book1.xlsx","path":""},"sheetNames":["Sheet1"],"data":{"Sheet1":{"0":{"0":1,"1":2},"1":{"0":3,"1":4}}}}}',
    );
    const restored = new Workbook();
    return restored.fromJSON(wb.toJSON()).then(() => {
      expect(restored.getActiveSheet().getValue(0, 0)).toBe(10);
      expect(restored.getActiveSheet().getFormula(0, 0)).toBe('SUM([Book1.xlsx]Sheet1!A1:B2)');
      expect(restored.getExternalReferences()).toEqual([{ name: 'Book1.xlsx', filePath: '' }]);
      expect(JSON.stringify(restored.toJSON().externalReference)).toBe(JSON.stringify(wb.toJSON().externalReference));
      restored.destroy();
    });
  });

  it('recalculates the formulas that read it as soon as values are loaded', () => {
    // Trial (items `ext-json`, `ext-suspend`, `ext-recalc`): new values for a
    // referenced workbook are a change - reading the cell right after
    // `updateExternalReference` already answers the loaded numbers, without
    // calling `calculate()`. While the calculation service is suspended the
    // formulas keep their previous value and the resume runs the update; a
    // workbook nothing references does not change anything.
    const wb = new Workbook();
    const sheet = wb.getActiveSheet();
    sheet.setFormula(0, 0, '=SUM([Book1.xlsx]Sheet1!A1:B2)');
    sheet.setFormula(1, 0, '=[Book1.xlsx]Sheet1!C1');
    wb.calculate();
    expect(JSON.stringify(sheet.getValue(0, 0))).toBe('{"_calcError":"#REF!","_code":23}');
    wb.updateExternalReference('Book1.xlsx', { Sheet1: [[1, 2], [3, 4]] });
    expect([sheet.getValue(0, 0), sheet.getValue(1, 0)]).toEqual([10, 0]);
    wb.suspendCalcService();
    wb.updateExternalReference('Book1.xlsx', { Sheet1: [[7, 7], [7, 7]] });
    expect(sheet.getValue(0, 0)).toBe(10);
    wb.resumeCalcService();
    expect(sheet.getValue(0, 0)).toBe(28);
    wb.resumeCalcService(false);
    expect(sheet.getValue(0, 0)).toBe(28);
    wb.updateExternalReference('Book2.xlsx', { Sheet1: [[3]] });
    expect(sheet.getValue(0, 0)).toBe(28);
    wb.destroy();
  });
});

describe('Custom name validation', () => {
  // Trial (items `name-valid`, `name-valid2`, `name-bisect`, `name-rules`):
  // `addCustomName` accepts letters-only names, names with digits when the whole
  // name is not a cell reference, and the characters `_ . ? \`; it throws
  // `invalid custom name` for a name that reads as a cell or R1C1 reference,
  // starts with a digit, holds a space or one of `# ( ) * + , - / : ; = [ ] ! $`,
  // has an empty expression, or collides case-insensitively with a name it
  // already holds. Workbook scope enforces the same rules.
  const ACCEPTED = [
    'A', 'AB', 'ABC', 'ABCD', 'ABS', 'ABSOLUTE', 'MYA', 'REL', 'N', 'A0', 'A1B', 'A1B1', 'A1_', 'A_1', 'B1A', 'C1C',
    'C1R1', 'R1C1X', 'R2C3D4', 'NAME1', 'MYNAME1', 'MYNAME2', 'MY2NAME', 'MYNAME_', 'UNDER_NAME', 'MY.NAME',
    'MY.NAME.', 'MY?NAME', 'MYNAME?', 'XFE1', 'XFF1', 'YGA1', 'ZZZ1', 'AAAA1', 'AAAB1',
    'MYNAME12345678901234567890', 'TRUE', 'FALSE', 'SUM', 'IF', 'PI', 'NULL',
  ];
  const REJECTED = [
    '', '1', '12', '12.5', '1E1', '1A', '1bad', ' MYNAME2', 'MYNAME2 ', 'a b', 'A:B', '1:1', '$X', 'MYNAME!', 'MYNAME-1',
    'MYNAME:1', 'MYNAME[1]', 'MY#NAME', 'MY(NAME', 'MY)NAME', 'MY*NAME', 'MY+NAME', 'MY,NAME', 'MY-NAME', 'MY/NAME',
    'MY:NAME', 'MY;NAME', 'MY=NAME', '[MyName]', 'TABLE1[[#all]]', 'N1', 'n1', 'C1', 'Z9', 'z9', 'a1', 'AA1', 'ABS1',
    'abs1', 'AM1', 'MA1', 'MY1', 'MYA1', 'MYA2', 'WB1', 'XFD1', 'xfd1', 'RO2', 'RC', 'RC1', 'R1', 'R1C', 'R1C1', 'Z9999999',
    'A1048576', 'A1048577', 'Z1048576', 'Z1048577', 'AA1048577', 'XFD1048576',
  ];

  it('accepts the names the trial accepts', () => {
    const wb = new Workbook();
    const sheet = wb.getActiveSheet();
    for (const name of ACCEPTED) expect(() => sheet.addCustomName(name, 'A1:B2', 0, 0), name).not.toThrow();
    expect(sheet.getCustomNames().length).toBe(ACCEPTED.length);
    // `\` is part of the trial's accepted set (`MY\NAME`); the name round-trips
    // through the sheet JSON with its original spelling.
    expect(sheet.getCustomName('MYA')!.getName()).toBe('MYA');
    const json = sheet.toJSON() as unknown as { names?: { name: string }[] };
    expect((json.names ?? []).map((item) => item.name)).toContain('MYNAME1');
    wb.destroy();
  });

  it('rejects the names the trial rejects with the trial message', () => {
    const wb = new Workbook();
    const sheet = wb.getActiveSheet();
    for (const name of REJECTED) {
      expect(() => sheet.addCustomName(name, 'A1:B2', 0, 0), JSON.stringify(name)).toThrow('invalid custom name');
    }
    expect(sheet.getCustomNames()).toEqual([]);
    // A name with no expression is rejected as well (trial item `name-rules`).
    expect(() => sheet.addCustomName('EMPTYNAME', '', 0, 0)).toThrow('invalid custom name');
    expect(() => sheet.addCustomName('EMPTYNAME', '=', 0, 0)).toThrow('invalid custom name');
    // An expression the trial cannot build is rejected at the same call.
    expect(() => sheet.addCustomName('BADFORM', '1+(', 0, 0)).toThrow();
    wb.destroy();
  });

  it('refuses a name it already holds, ignoring case', () => {
    const wb = new Workbook();
    const sheet = wb.getActiveSheet();
    sheet.addCustomName('MYA', 'A1', 0, 0);
    expect(() => sheet.addCustomName('MYA', 'B2', 0, 0)).toThrow('invalid custom name');
    expect(() => sheet.addCustomName('mya', 'C3', 0, 0)).toThrow('invalid custom name');
    expect(sheet.getCustomNames().map((info) => info.getName())).toEqual(['MYA']);
    expect(sheet.getCustomName('MYA').getExpression()).toBe('A1');
    // Removing a name nothing has does not throw (trial item `dep-name-mixed`).
    expect(() => sheet.removeCustomName('NOTTHERE')).not.toThrow();
    wb.destroy();
  });

  it('validates the workbook scope like the sheet scope', () => {
    const wb = new Workbook();
    expect(() => wb.addCustomName('N1', 'A1:B2', 0, 0)).toThrow('invalid custom name');
    expect(() => wb.addCustomName('WBNAME', 'A1:B2', 0, 0)).not.toThrow();
    expect(() => wb.addCustomName('wbname', 'A1:B2', 0, 0)).toThrow('invalid custom name');
    expect(wb.getCustomNames().map((info) => info.getName())).toEqual(['WBNAME']);
    // A sheet-scope name does not reach another sheet (trial item `name-rules`).
    const sheet = wb.getActiveSheet();
    sheet.addCustomName('SHARED', 'A1:B2', 0, 0);
    const other = new Worksheet('WBNamesOther');
    wb.addSheet(1, other);
    other.setArray(0, 0, [[1, 2], [3, 4]]);
    other.setFormula(0, 0, '=SUM(SHARED)');
    wb.calculate();
    expect(JSON.stringify(other.getValue(0, 0))).toBe('{"_calcError":"#NAME?","_code":29}');
    wb.destroy();
  });
});

describe('Calculation errors and lambdas', () => {
  it('answers #CALC! for a lambda that reaches a cell', () => {
    // Trial (item err-codes): `=LAMBDA(1)` is `#CALC!`, code 100.
    const wb = new Workbook();
    const sheet = wb.getActiveSheet();
    sheet.setFormula(0, 0, '=LAMBDA(1)');
    wb.calculate();
    const value = sheet.getValue(0, 0);
    expect(value).toBeInstanceOf(GC.Spread.CalcEngine.CalcError);
    expect(JSON.stringify(value)).toBe('{"_calcError":"#CALC!","_code":100}');
    expect(sheet.getText(0, 0)).toBe('#CALC!');
    wb.destroy();
  });
});
