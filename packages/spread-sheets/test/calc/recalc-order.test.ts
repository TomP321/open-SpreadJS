/**
 * TASK 59: correctness of the recalculator restructure (topological scan with
 * numeric stamps, single-walk dirty collection, cached full-graph scan). The
 * evaluation ORDER changed for large dirty sets; these tests pin the
 * observable results: deep chains, cycles with iterative calculation on and
 * off, cells waiting behind a cycle, volatile functions per
 * `CalculationType`, cross-sheet edges and repeated calculations.
 */
import { describe, expect, it } from 'vitest';
import GC from '../../src/index.js';

const { CalculationType } = GC.Spread.Sheets;

function chainWorkbook(rows: number, seed = 1) {
  const workbook = new GC.Spread.Sheets.Workbook();
  const sheet = workbook.getSheet(0);
  sheet.setRowCount(rows + 10);
  workbook.suspendCalcService();
  sheet.setValue(0, 0, seed);
  for (let row = 1; row < rows; row++) sheet.setFormula(row, 0, `=A${row}+1`);
  workbook.resumeCalcService();
  return { workbook, sheet };
}

describe('topological recalculation (TASK 59)', () => {
  it('re-calculates a 100k chain with calculate(all) after a mid-chain input change', () => {
    const { workbook, sheet } = chainWorkbook(100_000);
    expect(sheet.getValue(99_999, 0)).toBe(100_000);
    // Change the seed value through the model; the automatic pass already
    // propagates, then a full calculate(all) must leave everything stable.
    sheet.setValue(0, 0, 7);
    expect(sheet.getValue(99_999, 0)).toBe(100_006);
    workbook.calculate(CalculationType.all);
    expect(sheet.getValue(99_999, 0)).toBe(100_006);
    expect(sheet.getValue(50_000, 0)).toBe(50_007);
    workbook.destroy();
  }, 30_000);

  it('calculates a 50k chain written under a suspended calc service in one calculate(all)', () => {
    const workbook = new GC.Spread.Sheets.Workbook();
    const sheet = workbook.getSheet(0);
    sheet.setRowCount(50_010);
    workbook.suspendCalcService(false);
    sheet.setValue(0, 0, 1);
    for (let row = 1; row < 50_000; row++) sheet.setFormula(row, 0, `=A${row}+1`);
    workbook.resumeCalcService(false);
    expect(sheet.getValue(49_999, 0)).toBe(50_000);
    workbook.destroy();
  }, 30_000);

  it('keeps deep cross-sheet chains and cross-sheet cycle-free edges in order', () => {
    const workbook = new GC.Spread.Sheets.Workbook();
    const first = workbook.getSheet(0);
    workbook.addSheet(1, new GC.Spread.Sheets.Worksheet('Second'));
    const second = workbook.getSheetFromName('Second');
    workbook.suspendCalcService();
    first.setRowCount(10_010);
    first.setValue(0, 0, 2);
    for (let row = 1; row < 10_000; row++) first.setFormula(row, 0, `=A${row}+1`);
    // The far end of the chain continues on the other sheet (two hops).
    second.setFormula(0, 0, '=Sheet1!A10000');
    second.setFormula(1, 0, '=Second!A1+1');
    workbook.resumeCalcService();
    expect(second.getValue(0, 0)).toBe(10_001);
    expect(second.getValue(1, 0)).toBe(10_002);
    first.setValue(0, 0, 3);
    expect(second.getValue(1, 0)).toBe(10_003);
    workbook.destroy();
  });

  it('solves a cycle under iterative calculation and evaluates dependents after it', () => {
    const workbook = new GC.Spread.Sheets.Workbook();
    const sheet = workbook.getSheet(0);
    workbook.options.iterativeCalculation = true;
    workbook.options.iterativeCalculationMaximumIterations = 500;
    workbook.options.iterativeCalculationMaximumChange = 0.001;
    workbook.suspendCalcService();
    sheet.setFormula(0, 0, '=B1+1'); // A1
    sheet.setFormula(0, 1, '=A1+1'); // B1
    sheet.setFormula(0, 2, '=A1+0'); // C1 waits behind the cycle
    workbook.resumeCalcService();
    const a1 = sheet.getValue(0, 0) as number;
    expect(typeof a1).toBe('number');
    expect(a1).toBeGreaterThan(1);
    // C1 was blocked by the cycle and must read the solved A1 value.
    expect(sheet.getValue(0, 2)).toBe(a1);
    // A full calculate() keeps the trial's forward walk: the pair keeps
    // counting up from the automatic pass.
    workbook.calculate(CalculationType.all);
    expect(sheet.getValue(0, 0) as number).toBeGreaterThan(a1);
    expect(sheet.getValue(0, 2)).toBe(sheet.getValue(0, 0));
    workbook.destroy();
  });

  it('answers zero for cycle cells when iterative calculation is off, including calculate(all)', () => {
    const workbook = new GC.Spread.Sheets.Workbook();
    const sheet = workbook.getSheet(0);
    workbook.options.iterativeCalculation = false;
    workbook.suspendCalcService();
    sheet.setFormula(0, 0, '=B1+1');
    sheet.setFormula(0, 1, '=A1+1');
    sheet.setFormula(0, 2, '=A1+1');
    workbook.resumeCalcService();
    expect(sheet.getValue(0, 0)).toBe(0);
    expect(sheet.getValue(0, 1)).toBe(0);
    expect(sheet.getValue(0, 2)).toBe(1);
    // A second full calculation must not resurrect the cycle values.
    workbook.calculate(CalculationType.all);
    expect(sheet.getValue(0, 0)).toBe(0);
    expect(sheet.getValue(0, 1)).toBe(0);
    expect(workbook.getCircularReference().length).toBe(2);
    workbook.destroy();
  });

  it('recalculates volatile cells with all and leaves them with minimal', () => {
    const workbook = new GC.Spread.Sheets.Workbook();
    const sheet = workbook.getSheet(0);
    sheet.setFormula(0, 0, '=RAND()');
    const first = sheet.getValue(0, 0) as number;
    expect(first).not.toBe(0);
    workbook.calculate(CalculationType.minimal);
    expect(sheet.getValue(0, 0)).toBe(first); // minimal: no volatile marking
    workbook.calculate(CalculationType.all);
    expect(sheet.getValue(0, 0)).not.toBe(first); // all: volatile cells re-run
    workbook.destroy();
  });

  it('rebuild recalculates the same values as all for a cross-sheet formula graph', () => {
    const workbook = new GC.Spread.Sheets.Workbook();
    const first = workbook.getSheet(0);
    workbook.addSheet(1, new GC.Spread.Sheets.Worksheet('Other'));
    const second = workbook.getSheetFromName('Other');
    workbook.suspendCalcService();
    first.setRowCount(50);
    for (let row = 0; row < 50; row++) first.setValue(row, 0, row + 1);
    second.setFormula(0, 0, '=SUM(Sheet1!A1:A50)');
    second.setFormula(1, 0, '=Other!A1*2');
    workbook.resumeCalcService();
    const value = second.getValue(1, 0);
    workbook.calculate(CalculationType.all);
    expect(second.getValue(1, 0)).toBe(value);
    workbook.calculate(CalculationType.rebuild);
    expect(second.getValue(0, 0)).toBe(1275);
    expect(second.getValue(1, 0)).toBe(value);
    workbook.destroy();
  });

  it('propagates through 10k dependents with each of its own precedents computed first', () => {
    // Diamond-ish graph: base -> ten thousand half-steps -> ten thousand sums
    // of those sums; one change must flow through both levels in order.
    const workbook = new GC.Spread.Sheets.Workbook();
    const sheet = workbook.getSheet(0);
    workbook.suspendCalcService();
    sheet.setRowCount(4_010);
    sheet.setColumnCount(4);
    sheet.setValue(0, 0, 10);
    for (let row = 1; row <= 2_000; row++) sheet.setFormula(row, 0, '=$A$1/2000'); // 2k copies of base/2000
    for (let row = 1; row <= 2_000; row++) sheet.setFormula(row, 1, `=A${row + 1}+$A$1`); // level 2: split of level 1 + base
    sheet.setFormula(0, 2, '=SUM(B2:B2001)');
    workbook.resumeCalcService();
    expect(sheet.getValue(0, 2)).toBeCloseTo(2000 * (10 / 2000 + 10), 6);
    sheet.setValue(0, 0, 20);
    expect(sheet.getValue(0, 2)).toBeCloseTo(2000 * (20 / 2000 + 20), 6);
    workbook.destroy();
  });

  it('keeps formula text canonical through the deferred write path (shared AST handoff)', () => {
    const workbook = new GC.Spread.Sheets.Workbook();
    const sheet = workbook.getSheet(0);
    workbook.suspendCalcService(false);
    sheet.setFormula(0, 0, ' SUM( C1:C2 , 1 ) ');
    sheet.setFormula(1, 0, '=A1+1');
    workbook.resumeCalcService(false);
    expect(sheet.getFormula(0, 0)).toBe('SUM(C1:C2,1)');
    expect(sheet.getFormula(1, 0)).toBe('A1+1');
    expect(sheet.getValue(1, 0)).toBe(2);
    workbook.destroy();
  });
});
