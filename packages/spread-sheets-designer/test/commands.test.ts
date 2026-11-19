/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, beforeEach } from 'vitest';
import GC from '@mescius/spread-sheets';
import { applyBuiltin, commandEnabled, isUndoableAction } from '../src/commands/actions.js';

function makeDesigner(): { gc: any; getWorkbook: () => any; spreadsheet: any; invalidate: () => void } {
  const workbook = new GC.Spread.Sheets.Workbook();
  return {
    gc: GC,
    spreadsheet: workbook,
    getWorkbook: () => workbook,
    invalidate: () => undefined,
  };
}

describe('built-in designer commands', () => {
  let d: ReturnType<typeof makeDesigner>;
  beforeEach(() => {
    d = makeDesigner();
    const sheet = d.getWorkbook().getActiveSheet();
    sheet.setValue(0, 0, 'Name');
    sheet.setValue(1, 0, 'North');
    sheet.setValue(1, 1, 120);
    sheet.setValue(2, 0, 'South');
    sheet.setValue(2, 1, 90);
    sheet.setSelection(1, 1, 1, 1);
  });

  it('toggles font style state and alignment on the active selection', () => {
    applyBuiltin(d as never, 'fontWeight');
    expect(d.getWorkbook().getActiveSheet().getActualStyle(1, 1).fontWeight).toBe('bold');
    applyBuiltin(d as never, 'fontWeight');
    expect(d.getWorkbook().getActiveSheet().getActualStyle(1, 1).fontWeight).toBe('normal');
    applyBuiltin(d as never, 'centerAlign');
    expect(d.getWorkbook().getActiveSheet().getActualStyle(1, 1).hAlign).toBe(1);
    applyBuiltin(d as never, 'fontFamily', { value: 'Georgia' });
    expect(d.getWorkbook().getActiveSheet().getActualStyle(1, 1).fontFamily).toBe('Georgia');
    applyBuiltin(d as never, 'fontSize', { value: 18 });
    expect(String(d.getWorkbook().getActiveSheet().getActualStyle(1, 1).fontSize)).toContain('18');
  });

  it('applies number formats and styles through the same path the ribbon uses', () => {
    applyBuiltin(d as never, 'formatPercentage');
    expect(d.getWorkbook().getActiveSheet().getActualStyle(1, 1).formatter).toBe('0%');
    applyBuiltin(d as never, 'backColor', { value: '#ff0000' });
    expect(d.getWorkbook().getActiveSheet().getActualStyle(1, 1).backColor).toBe('#ff0000');
    applyBuiltin(d as never, 'applyFormatCells', { data: { hAlign: 2, vAlign: 1, wrapText: true, fontFamily: 'Arial' } });
    const style = d.getWorkbook().getActiveSheet().getActualStyle(1, 1);
    expect(style.hAlign).toBe(2);
    expect(style.vAlign).toBe(1);
    expect(style.wordWrap).toBe(true);
    expect(style.fontFamily).toBe('Arial');
  });

  it('merges and unmerges a range', () => {
    const sheet = d.getWorkbook().getActiveSheet();
    sheet.setSelection(1, 1, 2, 2);
    applyBuiltin(d as never, 'mergeCells');
    expect(sheet.getSpan(1, 1)).toBeTruthy();
    applyBuiltin(d as never, 'unMergeCells');
    expect(sheet.getSpan(1, 1)).toBeNull();
  });

  it('inserts and deletes rows and columns', () => {
    const sheet = d.getWorkbook().getActiveSheet();
    sheet.setSelection(1, 1, 1, 1);
    applyBuiltin(d as never, 'insertSheetRows');
    expect(sheet.getValue(2, 0)).toBe('North');
    applyBuiltin(d as never, 'deleteSheetRows');
    expect(sheet.getValue(1, 0)).toBe('North');
  });

  it('sets the sizes of all selected rows and columns', () => {
    const sheet = d.getWorkbook().getActiveSheet();
    sheet.setSelection(2, 3, 2, 3);
    applyBuiltin(d as never, 'setDimensionSize', { axis: 'row', value: 42 });
    applyBuiltin(d as never, 'setDimensionSize', { axis: 'column', value: 95 });
    expect([sheet.getRowHeight(2), sheet.getRowHeight(3)]).toEqual([42, 42]);
    expect([sheet.getColumnWidth(3), sheet.getColumnWidth(4), sheet.getColumnWidth(5)]).toEqual([95, 95, 95]);
    expect(sheet.getRowHeight(1)).not.toBe(42);
    expect(sheet.getColumnWidth(2)).not.toBe(95);
  });

  it('creates a table from the format-table gallery content', () => {
    const sheet = d.getWorkbook().getActiveSheet();
    sheet.setSelection(0, 0, 3, 2);
    applyBuiltin(d as never, 'formatTableListContent', { value: 'medium2' });
    expect(sheet.tables.all()).toHaveLength(1);
    expect(sheet.tables.all()[0].name()).toContain('Table');
  });

  it('adds conditional-formatting rules with the public CF model', () => {
    const sheet = d.getWorkbook().getActiveSheet();
    sheet.setSelection(1, 1, 2, 1);
    const before = sheet.conditionalFormats.getRules().length;
    applyBuiltin(d as never, 'highlightCellsRulesGreaterThan');
    expect(sheet.conditionalFormats.getRules().length).toBe(before + 1);
    applyBuiltin(d as never, 'gradientFillBlueDataBar');
    applyBuiltin(d as never, 'colorScaleGyr');
    applyBuiltin(d as never, 'iconSetThreeStars');
    expect(sheet.conditionalFormats.getRules().length).toBe(before + 4);
  });

  it('marks mutating commands undoable and leaves navigation/dialog commands alone', () => {
    expect(isUndoableAction('fontWeight')).toBe(true);
    expect(isUndoableAction('pasteAll')).toBe(true);
    expect(isUndoableAction('find')).toBe(false);
    expect(isUndoableAction('conditionFormat')).toBe(false);
    expect(commandEnabled(d as never, 'undo')).toBe(false);
  });

  it('supports auto-sum and clear operations', () => {
    const sheet = d.getWorkbook().getActiveSheet();
    sheet.setSelection(3, 1, 1, 1);
    applyBuiltin(d as never, 'editingAutoSum');
    expect(String(sheet.getFormula(3, 1))).toContain('SUM');
    sheet.setSelection(1, 1, 1, 1);
    applyBuiltin(d as never, 'clearContent');
    expect(sheet.getValue(1, 1)).toBeNull();
  });
});
