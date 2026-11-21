// TASK 75 probe: `sheet.clear(..., data)` must recalc dependents before toJSON
// (the trial reports SUM=450 right after clearing B2 of SUM(B2:E2)).
import { describe, expect, it } from 'vitest';
import GC from '../src/index.js';

const { Workbook } = GC.Spread.Sheets;

describe('clear recalc probe', () => {
  it('recalcs dependents synchronously after clear', () => {
    const wb = new Workbook();
    const sh = wb.getSheet(0);
    sh.setValue(1, 1, 120); sh.setValue(1, 2, 135); sh.setValue(1, 3, 150); sh.setValue(1, 4, 165);
    sh.setFormula(1, 5, '=SUM(B2:E2)');
    expect(sh.getValue(1, 5)).toBe(570);
    sh.clear(1, 1, 1, 1, GC.Spread.Sheets.SheetArea.viewport, 1);
    expect(sh.getValue(1, 5)).toBe(450);
    const j = wb.toJSON();
    const parsed = typeof j === 'string' ? JSON.parse(j) : j;
    // The sheet section is keyed by sheet name (Object form, as the trial serialises it).
    const sheetNode = Array.isArray(parsed.sheets) ? parsed.sheets[0] : parsed.sheets[sh.name()];
    const cellF2 = sheetNode.data?.dataTable ?? sheetNode.data?.data?.dataTable;
    expect(cellF2['1']['5'].value).toBe(450);
  });
});
