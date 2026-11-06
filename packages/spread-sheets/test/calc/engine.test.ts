import { describe, expect, it } from 'vitest';
import GC from '../../src/index.js';
import { Workbook } from '../../src/model.js';
import { CalcError } from '../../src/calc/values.js';

const W = GC.Spread.Sheets;

function sheet(cells: Record<string, unknown> = {}) {
  const workbook = new Workbook();
  const worksheet = workbook.getSheet(0);
  worksheet.setRowCount(1000);
  worksheet.setColumnCount(50);
  for (const [address, value] of Object.entries(cells)) {
    const match = /^([A-Z]+)(\d+)$/.exec(address)!;
    let col = 0;
    for (const ch of match[1]!) col = col * 26 + ch.charCodeAt(0) - 64;
    worksheet.setValue(Number(match[2]) - 1, col - 1, value);
  }
  return { workbook, sheet: worksheet };
}

function formula(cells: Record<string, unknown>, text: string): unknown {
  const { sheet: worksheet } = sheet(cells);
  worksheet.setFormula(0, 20, text);
  return worksheet.getValue(0, 20);
}

describe('calculation engine', () => {
  it('calculates formulas and coerces values like SpreadJS', () => {
    expect(formula({ A1: 1, A2: 2, A3: 3 }, 'SUM(A1:A3)')).toBe(6);
    expect(formula({ A1: '1', A2: '2', A3: true }, 'SUM(A1:A3)')).toBe(4);
    expect(formula({ A1: 'text' }, 'A1*2')).toBeInstanceOf(CalcError);
    expect(formula({}, '1/0')).toBeInstanceOf(CalcError);
    expect(formula({}, '0.1+0.2')).toBe(0.3);
    expect(formula({}, '"3"+4')).toBe(7);
    expect(formula({}, '1+2&3')).toBe('33');
    expect(formula({}, '-2^2')).toBe(4);
  });

  it('handles implicit intersection and whole row/column references', () => {
    expect(formula({ A1: 1, A2: 2 }, 'A1:A2')).toBe(1);
    expect(formula({ A1: 1, A2: 2 }, 'SUM(A:A)')).toBe(3);
    {
      const { sheet: worksheet } = sheet({ A1: 1, B1: 2 });
      worksheet.setFormula(5, 0, 'SUM(1:1)');
      expect(worksheet.getValue(5, 0)).toBe(3);
    }
    const { sheet: worksheet } = sheet({ A1: 1, A2: 2, A3: 3 });
    worksheet.setFormula(3, 1, 'A1:A3');
    expect(worksheet.getValue(3, 1)).toBeInstanceOf(CalcError);
  });

  it('recalculates chains and ranges incrementally', () => {
    const { workbook, sheet: worksheet } = sheet();
    worksheet.setValue(0, 0, 1);
    worksheet.setFormula(1, 0, 'A1*2');
    worksheet.setFormula(2, 0, 'A2+A1');
    expect(worksheet.getValue(2, 0)).toBe(3);
    worksheet.setValue(0, 0, 10);
    expect(worksheet.getValue(2, 0)).toBe(30);
    worksheet.setValue(0, 0, 'x');
    expect(worksheet.getValue(1, 0)).toBeInstanceOf(CalcError);
    worksheet.setValue(0, 0, null);
    expect(worksheet.getValue(1, 0)).toBe(0);

    worksheet.setValue(10, 1, 5);
    worksheet.setFormula(0, 2, 'SUM(B1:B100)');
    expect(worksheet.getValue(0, 2)).toBe(5);
    worksheet.setValue(49, 1, 7);
    expect(worksheet.getValue(0, 2)).toBe(12);
    workbook.destroy();
  });

  it('recalculates across sheets and follows sheet renames', () => {
    const workbook = new Workbook();
    workbook.getSheet(0).name('Main');
    workbook.addSheet(1);
    workbook.getSheet(1).name('Data');
    const data = workbook.getSheetFromName('Data');
    {
      const mainSheet = workbook.getSheetFromName('Main');
      mainSheet.setFormula(0, 0, '=Data!A1*2');
      data!.setValue(0, 0, 21);
      expect(mainSheet.getValue(0, 0)).toBe(42);
      data!.name('Data2');
      expect(mainSheet.getFormula(0, 0)).toBe('Data2!A1*2');
      expect(mainSheet.getValue(0, 0)).toBe(42);
    }
    workbook.destroy();
  });

  it('solves circular references iteratively', () => {
    const workbook = new Workbook();
    workbook.options.iterativeCalculationMaximumIterations = 3;
    const worksheet = workbook.getSheet(0);
    worksheet.setFormula(0, 0, 'A1+1');
    expect(worksheet.getValue(0, 0)).toBe(3);
    workbook.options.iterativeCalculationMaximumIterations = 1000;
    const other = new Workbook();
    const second = other.getSheet(0);
    second.setFormula(0, 0, '=B1+1');
    second.setFormula(0, 1, '=A1+1');
    expect(second.getValue(0, 0)).toBe(2001);
    expect(second.getValue(0, 1)).toBe(2000);
    workbook.destroy();
    other.destroy();
  });

  it('supports R1C1 reference style', () => {
    const workbook = new Workbook();
    workbook.options.referenceStyle = W.ReferenceStyle.r1c1;
    const worksheet = workbook.getSheet(0);
    worksheet.setValue(0, 0, 4);
    worksheet.setValue(1, 0, 6);
    worksheet.setFormula(0, 1, '=SUM(R1C1:R2C1)');
    expect(worksheet.getFormula(0, 1)).toBe('SUM(R1C1:R2C1)');
    expect(worksheet.getValue(0, 1)).toBe(10);
    worksheet.setFormula(1, 1, '=R[-1]C[-1]+RC[-1]');
    expect(worksheet.getValue(1, 1)).toBe(10);
    workbook.destroy();
  });

  it('batches calculation while suspended', () => {
    const { workbook, sheet: worksheet } = sheet();
    let evaluations = 0;
    worksheet.bind(W.Events.ValueChanged, () => evaluations++);
    workbook.suspendCalcService();
    worksheet.setValue(0, 0, 1);
    worksheet.setFormula(1, 0, 'A1+1');
    worksheet.setFormula(2, 0, 'A2+1');
    expect(worksheet.getValue(2, 0)).toBeNull();
    workbook.resumeCalcService();
    expect(worksheet.getValue(2, 0)).toBe(3);
    expect(evaluations).toBeGreaterThan(0);
    workbook.destroy();
  });

  it('spills dynamic arrays, gates them on allowDynamicArray and detects collisions', () => {
    const workbook = new Workbook();
    const worksheet = workbook.getSheet(0);
    worksheet.setFormula(0, 0, '=SEQUENCE(3,2)');
    expect(worksheet.getValue(0, 0)).toBeInstanceOf(CalcError);
    workbook.options.allowDynamicArray = true;
    worksheet.setFormula(0, 0, '=SEQUENCE(3,2)');
    expect(worksheet.getValue(0, 0)).toBe(1);
    expect(worksheet.getValue(2, 1)).toBe(6);
    expect(worksheet.getValue(4, 0)).toBeNull();
    worksheet.setValue(1, 0, 'x');
    worksheet.setFormula(0, 0, '=SEQUENCE(3)');
    expect(worksheet.getValue(0, 0)).toBeInstanceOf(CalcError);
    expect(String(worksheet.getValue(0, 0))).toBe('#SPILL!');
    worksheet.setValue(1, 0, null);
    worksheet.setFormula(0, 0, '=SEQUENCE(4)');
    worksheet.setFormula(0, 4, '=SUM(A1#)');
    expect(worksheet.getValue(0, 4)).toBe(10);
    worksheet.setValue(0, 6, 3);
    worksheet.setFormula(0, 7, '=SEQUENCE(B1)');
    worksheet.setFormula(0, 9, '=SUM(H1#)');
    workbook.destroy();
  });

  it('invalidates references when a sheet is removed', () => {
    const workbook = new Workbook();
    workbook.getSheet(0).setFormula(0, 0, '=Data!A1+1');
    workbook.addSheet(1);
    workbook.getSheet(1).name('Data');
    workbook.getSheet(1).setValue(0, 0, 5);
    expect(workbook.getSheet(0).getValue(0, 0)).toBe(6);
    workbook.removeSheet(1);
    expect(workbook.getSheet(0).getFormula(0, 0)).toBe('#REF!+1');
    expect(String(workbook.getSheet(0).getValue(0, 0))).toBe('#REF!');
    workbook.destroy();
  });

  it('adjusts formulas when columns are inserted', () => {
    const { sheet: worksheet } = sheet({ A1: 1, B1: 2, C1: 3 });
    worksheet.setFormula(0, 4, '=SUM(A1:C1)');
    expect(worksheet.getValue(0, 4)).toBe(6);
    worksheet.addColumns(1, 1);
    expect(worksheet.getFormula(0, 5)).toBe('SUM(A1:D1)');
    worksheet.setValue(0, 1, 10);
    expect(worksheet.getValue(0, 5)).toBe(16);
  });

  it('supports custom names in formulas', () => {
    const workbook = new Workbook();
    const worksheet = workbook.getSheet(0);
    worksheet.setRowCount(50);
    worksheet.setColumnCount(20);
    worksheet.setValue(0, 0, 10);
    worksheet.addCustomName('Absolute', '=$A$1+1', 0, 0);
    worksheet.setFormula(0, 2, '=Absolute');
    expect(worksheet.getValue(0, 2)).toBe(11);
    workbook.addCustomName('WBName', '=$A$1*2', 0, 0);
    worksheet.setFormula(1, 2, '=WBName');
    expect(worksheet.getValue(1, 2)).toBe(20);
    worksheet.setValue(0, 0, 50);
    expect(worksheet.getValue(0, 2)).toBe(51);
    worksheet.removeCustomName('Absolute');
    expect(String(worksheet.getValue(0, 2))).toBe('#NAME?');
    workbook.addCustomName('LAMBDA2', '=LAMBDA(x,x*2)', 0, 0);
    expect(workbook.getCustomNames().length).toBe(2);
    expect(worksheet.getCustomNames().length).toBe(0);
    workbook.destroy();
  });

  it('runs custom functions from global, workbook and sheet scopes', () => {
    class Double extends GC.Spread.CalcEngine.Functions.Function {
      constructor() {
        super('DOUBLE', 1, 1);
      }
      evaluate(value: number) {
        return value * 2;
      }
    }
    GC.Spread.CalcEngine.Functions.defineGlobalCustomFunction('DOUBLE', new Double());
    const workbook = new Workbook();
    const worksheet = workbook.getSheet(0);
    worksheet.setFormula(0, 0, '=DOUBLE(4)');
    expect(worksheet.getValue(0, 0)).toBe(8);
    class Plus extends GC.Spread.CalcEngine.Functions.Function {
      constructor() {
        super('PLUSONE', 1, 1);
      }
      evaluate(value: number) {
        return value + 1;
      }
    }
    workbook.addCustomFunction(new Plus());
    worksheet.setFormula(0, 1, '=PLUSONE(4)');
    expect(worksheet.getValue(0, 1)).toBe(5);
    class Contextual extends GC.Spread.CalcEngine.Functions.Function {
      constructor() {
        super('POS', 0, 0);
      }
      isContextSensitive() {
        return true;
      }
      evaluate(context: { row: number; column: number }) {
        return `${context.row}/${context.column}`;
      }
    }
    workbook.addCustomFunction(new Contextual());
    worksheet.setFormula(2, 3, '=POS()');
    expect(worksheet.getValue(2, 3)).toBe('2/3');
    class Branch extends GC.Spread.CalcEngine.Functions.Function {
      constructor() {
        super('PICK', 3, 3);
      }
      isBranch() {
        return true;
      }
      findTestArgument() {
        return 0;
      }
      findBranchArgument(test: unknown) {
        return test ? 1 : 2;
      }
      evaluate(test: unknown, yes: unknown, no: unknown) {
        return test ? yes : no;
      }
    }
    worksheet.addCustomFunction(new Branch());
    worksheet.setFormula(3, 0, '=PICK(TRUE,1,1/0)');
    expect(worksheet.getValue(3, 0)).toBe(1);
    GC.Spread.CalcEngine.Functions.removeGlobalFunction('DOUBLE');
    workbook.destroy();
  });

  it('exposes the public CalcEngine API', () => {
    const workbook = new Workbook();
    const worksheet = workbook.getSheet(0);
    worksheet.setValue(0, 0, 5);
    worksheet.setValue(1, 0, 7);
    worksheet.setValue(0, 1, 9);
    const api = GC.Spread.Sheets.CalcEngine;
    expect(api.evaluateFormula(worksheet, 'SUM(A1:A2)', 0, 0)).toBe(12);
    expect(api.evaluateFormula(worksheet, 'A1:B2', 0, 0, false, true)).toEqual([
      [5, 9],
      [7, null],
    ]);
    const expression = api.formulaToExpression(worksheet, '=SUM(A1:B2)', 0, 0);
    expect(expression.type).toBe(GC.Spread.CalcEngine.ExpressionType.function);
    expect((expression as unknown as { functionName: string }).functionName).toBe('SUM');
    expect(api.expressionToFormula(worksheet, expression, 0, 0)).toBe('SUM(A1:B2)');
    const ranges = api.formulaToRanges(worksheet, 'SUM(A1:B2)+A4', 0, 0);
    expect(ranges.length).toBe(2);
    const range = new W.Range(1, 1, 2, 2);
    expect(api.rangeToFormula(range, 0, 0)).toBe('$B$2:$C$3');
    expect(api.rangeToFormula(range, 0, 0, W.CalcEngine.RangeReferenceRelative.endRowRelative)).toBe('$B$2:$C3');
    expect(api.rangeToFormula(range, 0, 0, 0, true)).toBe('R2C2:R3C3');
    expect(api.rangesToFormula([range, new W.Range(0, 0, 1, 1)])).toBe('$B$2:$C$3,$A$1');
    workbook.destroy();
  });

  it('adjusts formulas when rows and columns are inserted or deleted', () => {
    const { sheet: worksheet } = sheet({ A1: 1, A2: 2, A3: 3 });
    worksheet.setFormula(0, 1, '=SUM(A1:A3)');
    worksheet.setFormula(1, 1, '=A2*10');
    worksheet.addRows(1, 1);
    expect(worksheet.getFormula(0, 1)).toBe('SUM(A1:A4)');
    expect(worksheet.getFormula(2, 1)).toBe('A3*10');
    expect(worksheet.getValue(0, 1)).toBe(6);
    worksheet.deleteRows(1, 1);
    expect(worksheet.getFormula(0, 1)).toBe('SUM(A1:A3)');
    expect(worksheet.getFormula(1, 1)).toBe('A2*10');
    worksheet.setFormula(7, 1, '=A6+1');
    worksheet.deleteRows(5, 1);
    expect(worksheet.getFormula(6, 1)).toBe('#REF!+1');
    expect(String(worksheet.getValue(6, 1))).toBe('#REF!');
  });

  it('translates references when copying formulas', () => {
    const { sheet: worksheet } = sheet({ A1: 1, A2: 2, B1: 10, B2: 20 });
    worksheet.setFormula(0, 2, '=A1+B$1+$A2');
    worksheet.copyTo(0, 2, 1, 2, 1, 1, W.CopyToOptions.formula);
    expect(worksheet.getFormula(1, 2)).toBe('A2+B$1+$A3');
    expect(worksheet.getValue(0, 2)).toBe(13);
  });

  it('evaluates legacy array formulas over their fixed range', () => {
    const workbook = new Workbook();
    const worksheet = workbook.getSheet(0);
    worksheet.setRowCount(20);
    worksheet.setColumnCount(10);
    for (let row = 0; row < 4; row++) {
      worksheet.setValue(row, 1, row + 1);
      worksheet.setValue(row, 2, 10);
    }
    worksheet.setArrayFormula(0, 3, 4, 1, 'B1:B4*C1:C4');
    expect(worksheet.getFormula(0, 3)).toBe('B1:B4*C1:C4');
    expect([0, 1, 2, 3].map((row) => worksheet.getValue(row, 3))).toEqual([10, 20, 30, 40]);
    workbook.destroy();
  });

  it('round-trips formulas and cached values through JSON', async () => {
    const workbook = new Workbook();
    const worksheet = workbook.getSheet(0);
    worksheet.setValue(0, 0, 2);
    worksheet.setFormula(1, 0, '=A1*3');
    const json = workbook.toJSON();
    expect((json.sheets as Record<string, { data: { dataTable: Record<number, Record<number, { formula: string }>> } }>).Sheet1.data.dataTable[1]![0]!.formula).toBe('A1*3');
    const restored = new Workbook();
    await restored.fromJSON(json);
    expect(restored.getSheet(0).getFormula(1, 0)).toBe('A1*3');
    expect(restored.getSheet(0).getValue(1, 0)).toBe(6);
    restored.getSheet(0).setValue(0, 0, 5);
    expect(restored.getSheet(0).getValue(1, 0)).toBe(15);
    workbook.destroy();
    restored.destroy();
  });
});
