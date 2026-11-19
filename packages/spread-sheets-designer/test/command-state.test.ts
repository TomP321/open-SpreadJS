/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from 'vitest';
import GC from '@mescius/spread-sheets';
import { computeCommandState } from '../src/designer-state.js';

/** Minimal Designer stub; computeCommandState only reads these members (TASK 51). */
function makeDesigner(): any {
  const workbook = new GC.Spread.Sheets.Workbook();
  return {
    gc: GC,
    spreadsheet: workbook,
    getWorkbook: () => workbook,
    getCommand: () => undefined,
    getActiveSheet: () => workbook.getActiveSheet(),
    invalidate: () => undefined,
    host: { getBoundingClientRect: () => ({ left: 0, top: 0, right: 1000, bottom: 800, width: 1000, height: 800 }) },
    options: {},
  };
}

describe('cellsFormat Lock/Unlock visibility (TASK 51)', () => {
  it('shows only "Unlock Cells" for the default (inherited-locked) cell', () => {
    const d = makeDesigner();
    d.getWorkbook().getActiveSheet().setSelection(1, 1, 1, 1);
    expect(computeCommandState(d, 'lockCells').visible).toBe(false);
    expect(computeCommandState(d, 'unLockCells').visible).toBe(true);
  });

  it('shows only "Lock Cells" once the cell is explicitly unlocked', () => {
    const d = makeDesigner();
    const sheet = d.getWorkbook().getActiveSheet();
    const style = new GC.Spread.Sheets.Style();
    (style as any).locked = false;
    sheet.setStyle(1, 1, style);
    sheet.setSelection(1, 1, 1, 1);
    expect(computeCommandState(d, 'lockCells').visible).toBe(true);
    expect(computeCommandState(d, 'unLockCells').visible).toBe(false);
  });

  it('keeps Protect/Unprotect Sheet mutually visible like the trial', () => {
    const d = makeDesigner();
    const sheet = d.getWorkbook().getActiveSheet();
    expect(computeCommandState(d, 'cellFormatProtectSheet').visible).toBe(true);
    expect(computeCommandState(d, 'unProtectSheet').visible).toBe(false);
    sheet.options.isProtected = true;
    expect(computeCommandState(d, 'cellFormatProtectSheet').visible).toBe(false);
    expect(computeCommandState(d, 'unProtectSheet').visible).toBe(true);
  });
});
