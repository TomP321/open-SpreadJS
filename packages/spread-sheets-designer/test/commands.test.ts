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

  it('writes the trial font semantics on the active selection', () => {
    // Trial (TASK 75 r3 probe): a bare fontWeight execute materialises `fontWeight:
    // 'normal'` — the ribbon checkbox passes the NEXT state as `value`.
    applyBuiltin(d as never, 'fontWeight');
    expect(d.getWorkbook().getActiveSheet().getActualStyle(1, 1).fontWeight).toBe('normal');
    applyBuiltin(d as never, 'fontWeight', { value: true });
    expect(d.getWorkbook().getActiveSheet().getActualStyle(1, 1).fontWeight).toBe('bold');
    applyBuiltin(d as never, 'fontWeight', { value: false });
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
    // Trial (TASK 75 r3, true multi-selection probes): every merge command works on the
    // bare execute path; the earlier "bare no-op" reading was a harness artifact from the
    // selection collapsing. `mergeCells` writes the span only, `mergeAcross` one span per
    // row, `mergeCenterButton` the span plus hAlign:center on the anchor (no vAlign).
    applyBuiltin(d as never, 'mergeCells');
    expect(sheet.getSpan(1, 1)).toEqual({ row: 1, col: 1, rowCount: 2, colCount: 2 });
    expect(sheet.getStyle(1, 1)).toBeNull();
    applyBuiltin(d as never, 'unMergeCells');
    expect(sheet.getSpan(1, 1)).toBeNull();
    applyBuiltin(d as never, 'mergeAcross');
    expect(sheet.getSpan(1, 1)).toEqual({ row: 1, col: 1, rowCount: 1, colCount: 2 });
    expect(sheet.getSpan(2, 1)).toEqual({ row: 2, col: 1, rowCount: 1, colCount: 2 });
    applyBuiltin(d as never, 'unMergeCells');
    applyBuiltin(d as never, 'mergeCenterButton');
    expect(sheet.getSpan(1, 1)).toBeTruthy();
    expect(sheet.getStyle(1, 1)).toEqual({ hAlign: 1 });
    // A single-cell selection never spans; only the centre variant aligns.
    sheet.setSelection(3, 3, 1, 1);
    applyBuiltin(d as never, 'mergeCells');
    expect(sheet.getSpan(3, 3)).toBeNull();
    applyBuiltin(d as never, 'mergeCenterButton');
    expect(sheet.getSpan(3, 3)).toBeNull();
    expect(sheet.getActualStyle(3, 3).hAlign).toBe(1);
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

  it('routes gallery commands like the trial: highlight presets open the New Rule dialog, data bars apply', () => {
    const sheet = d.getWorkbook().getActiveSheet();
    sheet.setSelection(1, 1, 2, 1);
    const before = sheet.conditionalFormats.getRules().length;
    // Trial (TASK 75 sweep): the Highlight Cells / Top Bottom rules menus open the New
    // Formatting Rule dialog — a bare execute writes no rule.
    const opened: string[] = [];
    (d as { showNewFormattingRuleDialog?: (kind: string) => void }).showNewFormattingRuleDialog = (kind: string) => opened.push(kind);
    applyBuiltin(d as never, 'highlightCellsRulesGreaterThan');
    applyBuiltin(d as never, 'topBottomRulesTop10');
    expect(opened).toEqual(['contain', 'topBottom']);
    expect(sheet.conditionalFormats.getRules().length).toBe(before);
    // The data-bar / color-scale / icon-set presets DO write their rule on execute.
    applyBuiltin(d as never, 'gradientFillBlueDataBar');
    applyBuiltin(d as never, 'colorScaleGyr');
    applyBuiltin(d as never, 'iconSetThreeStars');
    expect(sheet.conditionalFormats.getRules().length).toBe(before + 3);
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
    // Trial (TASK 75 r3, true multi-selection probes): the AutoSum family writes the
    // function over the numeric run ABOVE/LEFT of the band's last cell and leaves the
    // selection alone (the old "collapses to the anchor, writes nothing" reading came
    // from a harness that collapsed the selection before executing).
    sheet.setSelection(1, 1, 3, 1);
    applyBuiltin(d as never, 'editingAutoSum');
    expect([sheet.getSelections()[0].rowCount, sheet.getSelections()[0].colCount]).toEqual([3, 1]);
    expect(sheet.getFormula(3, 1)).toBe('SUM(B2:B3)');
    sheet.setSelection(1, 0, 1, 3);
    applyBuiltin(d as never, 'average');
    expect(sheet.getFormula(1, 2)).toBe('AVERAGE(A2:B2)');
    // A single-cell selection inserts nothing.
    sheet.setSelection(4, 1, 1, 1);
    applyBuiltin(d as never, 'max');
    expect(sheet.getFormula(4, 1)).toBeNull();
    sheet.setSelection(1, 1, 1, 1);
    applyBuiltin(d as never, 'clearContent');
    expect(sheet.getValue(1, 1)).toBeNull();
  });
});
