import { bench, describe } from 'vitest';
import GC from '../src/index.js';
import { parseFormula } from '../src/calc/parser.js';

/** Builds a chain of `size` formulas, each depending on the previous cell. */
function buildChain(size: number) {
  const workbook = new GC.Spread.Sheets.Workbook();
  const sheet = workbook.getSheet(0);
  sheet.setRowCount(size + 10);
  workbook.suspendCalcService();
  sheet.setValue(0, 0, 1);
  for (let row = 1; row < size; row++) sheet.setFormula(row, 0, `=A${row}+1`);
  workbook.resumeCalcService();
  return { workbook, sheet };
}

/** Builds `count` SUM formulas that all depend on the same 100-cell range. */
function buildSums(count: number) {
  const workbook = new GC.Spread.Sheets.Workbook();
  const sheet = workbook.getSheet(0);
  sheet.setRowCount(count + 10);
  sheet.setColumnCount(10);
  workbook.suspendCalcService();
  for (let row = 0; row < 100; row++) sheet.setValue(row, 0, row);
  for (let row = 0; row < count; row++) sheet.setFormula(row, 1, '=SUM(A1:A100)');
  workbook.resumeCalcService();
  // Warm up the recalculation paths.
  sheet.setValue(49, 0, 49);
  return { workbook, sheet };
}

const chain100k = buildChain(100_000);
const sums10k = buildSums(10_000);
let chainValue = 2;
let sumValue = 50;

describe('calculation engine performance', () => {
  bench('parse 100k formulas', () => {
    for (let index = 0; index < 100_000; index++) parseFormula('SUM(A1:B2)+A3*4');
  });
  bench('recalculate a 100k-cell dependency chain', () => {
    chain100k.sheet.setValue(0, 0, chainValue++);
  });
  bench('recalculate 10k SUMs after one input change', () => {
    sums10k.sheet.setValue(49, 0, sumValue++);
  });
});
