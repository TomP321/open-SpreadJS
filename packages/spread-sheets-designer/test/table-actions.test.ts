/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Task 61 items 3/6: the Table context submenu actions must perform the trial's
 * model semantics. All expectations below were measured on the trial with the
 * paired Playwright spec (apps/designer-compare/test/context-entries.spec.ts)
 * and the black-box truth probes in .probe/t6/t3-truth*.json:
 *  - Table Rows Above / Table Rows (delete) / Totals Row shift rows ONLY within
 *    the table's columns; cells outside the band keep their addresses (their
 *    formula references still adjust) and the sheet row count does not change.
 *  - Totals Row defaults: "Total" under the first column and a live
 *    `SUBTOTAL(109,[LastColumn])` under the last table column.
 *  - Convert to Range keeps values and styles (TableRemoveOptions.keepAll).
 */
import { describe, expect, it } from 'vitest';
import GC from '@mescius/spread-sheets';
import { applyBuiltin } from '../src/commands/actions.js';

function makeDesigner(): { d: any; sheet: any } {
  const workbook = new GC.Spread.Sheets.Workbook();
  const sheet = workbook.getActiveSheet();
  const rows = [
    ['Region', 'Q1', 'Q2', 'Q3', 'Q4', 'Total'],
    ['North', 120, 135, 150, 165, 570],
    ['South', 90, 105, 95, 125, 415],
    ['East', 75, 80, 90, 100, 345],
    ['West', 110, 115, 105, 130, 460],
  ];
  rows.forEach((row, r) => row.forEach((value, c) => sheet.setValue(r, c, value)));
  for (let r = 1; r <= 4; r++) sheet.setFormula(r, 5, `=SUM(B${r + 1}:E${r + 1})`);
  sheet.tables.add('Sales', 0, 0, 4, 5);
  const d = { gc: GC, spreadsheet: workbook, getWorkbook: () => workbook, invalidate: () => undefined };
  return { d, sheet };
}

const rangeOf = (sheet: any): Record<string, unknown> => ({ ...(sheet.tables.findByName('Sales') as any).range() });

describe('Insert > Table Rows Above', () => {
  it('inserts one row inside the table columns only, keeps rowCount and adjusts references', () => {
    const { d, sheet } = makeDesigner();
    applyBuiltin(d as never, 'tableInsert', { where: 'rows', at: 2, count: 1, table: 'Sales' });
    expect(sheet.getRowCount()).toBe(200);
    expect(rangeOf(sheet)).toMatchObject({ row: 0, col: 0, rowCount: 5, colCount: 5 });
    expect(sheet.getValue(2, 0)).toBeNull();
    expect(sheet.getValue(3, 0)).toBe('South');
    expect(sheet.getValue(5, 0)).toBe('West');
    // F cells stay at their addresses; references follow the moved rows.
    expect(sheet.getFormula(2, 5)).toBe('SUM(B4:E4)');
    expect(sheet.getValue(2, 5)).toBe(415);
    expect(sheet.getFormula(4, 5)).toBe('SUM(B6:E6)');
    expect(sheet.getValue(4, 5)).toBe(460);
  });
});

describe('Delete > Table Rows', () => {
  it('removes one row inside the table columns only and turns hit references into #REF!', () => {
    const { d, sheet } = makeDesigner();
    applyBuiltin(d as never, 'tableDelete', { what: 'rows', at: 2, count: 1, table: 'Sales' });
    expect(sheet.getRowCount()).toBe(200);
    expect(rangeOf(sheet)).toMatchObject({ rowCount: 3 });
    expect(sheet.getValue(2, 0)).toBe('East');
    expect(sheet.getValue(3, 0)).toBe('West');
    const errorCell = sheet.getValue(2, 5) as any;
    expect(errorCell && typeof errorCell === 'object' ? errorCell.error : errorCell).toBe('#REF!');
    expect(sheet.getFormula(3, 5)).toBe('SUM(B3:E3)');
    expect(sheet.getValue(3, 5)).toBe(345);
  });
});

describe('Table > Totals Row', () => {
  it('inserts the footer row, writes the trial defaults and evaluates the structured subtotal', () => {
    const { d, sheet } = makeDesigner();
    applyBuiltin(d as never, 'toggleTableTotalsRow', { table: 'Sales' });
    expect((sheet.tables.findByName('Sales') as any).showFooter()).toBe(true);
    expect(rangeOf(sheet)).toMatchObject({ rowCount: 5 });
    expect(sheet.getValue(4, 0)).toBe('Total');
    expect(sheet.getValue(4, 1)).toBeNull();
    expect(sheet.getValue(4, 4)).toBe(390);
    expect(sheet.getFormula(4, 4)).toBe('SUBTOTAL(109,[Q4])');
    // West data shifted down, its F formula stayed with an adjusted reference.
    expect(sheet.getValue(5, 0)).toBe('West');
    expect(sheet.getFormula(4, 5)).toBe('SUM(B6:E6)');
    expect(sheet.getRowCount()).toBe(200);
  });

  it('toggles off again: the footer row is removed and everything returns', () => {
    const { d, sheet } = makeDesigner();
    applyBuiltin(d as never, 'toggleTableTotalsRow', { table: 'Sales' });
    applyBuiltin(d as never, 'toggleTableTotalsRow', { table: 'Sales' });
    expect((sheet.tables.findByName('Sales') as any).showFooter()).toBe(false);
    expect(rangeOf(sheet)).toMatchObject({ rowCount: 4 });
    expect(sheet.getValue(4, 0)).toBe('West');
    expect(sheet.getValue(4, 4)).toBe(130);
    expect(sheet.getValue(4, 5)).toBe(460);
    expect(sheet.getValue(5, 0)).toBeNull();
  });
});

describe('Table > Convert to Range', () => {
  it('drops the table but keeps values and styles (trial keepAll behaviour)', () => {
    const { d, sheet } = makeDesigner();
    const style = new GC.Spread.Sheets.Style();
    style.fontWeight = 'bold';
    sheet.setStyle(1, 0, style);
    applyBuiltin(d as never, 'convertTableToRange', { table: 'Sales' });
    expect(sheet.tables.all()).toHaveLength(0);
    expect(sheet.getValue(1, 0)).toBe('North');
    expect(sheet.getValue(4, 5)).toBe(460);
    expect(sheet.getActualStyle(1, 0).fontWeight).toBe('bold');
  });
});

describe('Insert Copied Cells ▸ Shift Cells Down/Right', () => {
  it('shifts only the copied band and pastes content into the target', () => {
    const { d, sheet } = makeDesigner();
    (sheet as any)._clipboardSource = () => ({ sheetName: sheet.name(), row: 1, col: 0, rowCount: 1, colCount: 1 });
    (sheet as any)._clipboardMode = () => 'copy';
    sheet.setSelection(9, 0, 1, 1);
    sheet.setValue(10, 0, 'X11');
    sheet.setValue(10, 1, 'B11');
    applyBuiltin(d as never, 'insertCopiedCellsDirection', { direction: 'down' });
    expect(sheet.getValue(9, 0)).toBe('North');
    expect(sheet.getValue(10, 0)).toBeNull();
    expect(sheet.getValue(11, 0)).toBe('X11');
    // Cells outside the copied column band do not move (trial semantics).
    expect(sheet.getValue(10, 1)).toBe('B11');
  });

  it('shifts right within the copied row band only', () => {
    const { d, sheet } = makeDesigner();
    (sheet as any)._clipboardSource = () => ({ sheetName: sheet.name(), row: 1, col: 0, rowCount: 1, colCount: 1 });
    (sheet as any)._clipboardMode = () => 'copy';
    sheet.setSelection(9, 1, 1, 1);
    sheet.setValue(10, 1, 'B11');
    applyBuiltin(d as never, 'insertCopiedCellsDirection', { direction: 'right' });
    expect(sheet.getValue(9, 1)).toBe('North');
    expect(sheet.getValue(9, 2)).toBeNull();
    // The neighbour row keeps its address (Excel table-style band shift).
    expect(sheet.getValue(10, 1)).toBe('B11');
  });
});
