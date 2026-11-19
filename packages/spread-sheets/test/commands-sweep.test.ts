// @vitest-environment jsdom
// TASK 44 item 1: GC.Spread.Sheets.Commands (constants + transactions), GC.Spread.Common.Events,
// Comments extras, ConditionalFormatting sparkline extras, TableSheet.BuiltInRowActions and
// ThreadedComments non-panel members. Every expected value below was captured from the official
// 19.2.5 trial through its public API (probe .probe/api-sweep-probe.mjs, segments `cmd:*`,
// `txn:*`, `comments:*`, `cf:*`, `tc:*`, `ts:*`, 2026-11-16) and is recorded per probe name.
import { describe, expect, it } from 'vitest';
import GC from '../src/index.js';
import type { CommandOptions } from '../src/commands.js';

const { Workbook, Worksheet, Range } = GC.Spread.Sheets;
const Commands = GC.Spread.Sheets.Commands;
const CommandNames = GC.Spread.Sheets.Commands as unknown as Record<string, { canUndo?: boolean; execute?: unknown }>;
const { CommentDeleteUndoAction, CommentPropertyUndoAction } = GC.Spread.Sheets.Comments;
const CF = GC.Spread.Sheets.ConditionalFormatting;
const { BuiltInRowActions } = GC.Spread.Sheets.TableSheet;
const TC = GC.Spread.Sheets.ThreadedComments;

// Trial `canUndo` values from probe `cmd:canundo-all`; the trial core leaves the
// reportSheet*/Report* names undefined (registered only by the reportsheet add-on)
// - our core keeps them as documented NotImplemented fallbacks (see STATUS).
const TRIAL_CAN_UNDO: Record<string, boolean> = {
  autoFitColumn: true, autoFitRow: true, cancelInput: false, changeEditorStatus: false,
  changeFormulaReference: false, clear: false, clearAndEditing: false, clearValues: true,
  clipboardPaste: true, commitArrayFormula: false, commitInput: false,
  commitInputNavigationDown: false, commitInputNavigationUp: false, copy: false,
  copySheet: false, cut: false, DefineColumn: true, deleteFloatingObjects: true,
  dragCopyFloatingObjects: true, dragDrop: true, editCell: true, expandColumnOutline: true,
  expandColumnOutlineForLevel: true, expandRowOutline: true, expandRowOutlineForLevel: true,
  fill: true, ModifyColumn: true, moveFloatingObjects: true, moveSheet: false,
  moveToNextCell: false, moveToNextCellThenControl: false, moveToPreviousCell: false,
  moveToPreviousCellThenControl: false, navigationBottom: false, navigationDown: false,
  navigationEnd: false, navigationEnd2: false, navigationFirst: false, navigationHome: false,
  navigationHome2: false, navigationLast: false, navigationLeft: false, navigationNextSheet: false,
  navigationPageDown: false, navigationPageUp: false, navigationPreviousSheet: false,
  navigationRight: false, navigationTop: false, navigationUp: false, openCalculator: false,
  openColorPicker: false, openDateTimePicker: false, openList: false, openMonthPicker: false,
  openMultiColumn: false, openPasteSpecialDialog: false, openSlider: false, openTimePicker: false,
  openUrl: false, openWorkflowList: false, outlineColumn: true, outlineRow: true, paste: false,
  pasteFloatingObjects: true, redo: false, RemoveColumn: true, removeColumnOutline: true,
  removeRowOutline: true, renameSheet: true, resizeColumn: true, resizeFloatingObjects: true,
  resizeRow: true, selectionBottom: false, selectionDown: false, selectionEnd: false,
  selectionFirst: false, selectionHome: false, selectionLast: false, selectionLeft: false,
  selectionPageDown: false, selectionPageUp: false, selectionRight: false, selectionTop: false,
  selectionUp: false, selectNextControl: false, selectPreviousControl: false,
  splitResizeColumn: true, splitResizeRow: true, startEdit: false, tableDeleteColumns: true,
  tableDeleteRows: true, tableInsertColumns: true, tableInsertRows: true, tableResize: true,
  TableSheetAddSortColumn: true, TableSheetFilterColumn: true, TableSheetRemoveFilterColumn: true,
  TableSheetRemoveSortColumn: true, TableSheetSortColumn: true, tableSubmitChanges: false,
  undo: false, zoom: true,
};
// Trial core exposes only these as `undefined` (add-on-registered); our core keeps
// the NotImplemented fallbacks for them (probe `cmd:canundo-all` -> "undef").
const ADDON_ONLY = ['ReportChartPreviewVisible', 'ReportCollapseButtonToggle', 'reportSheetAddRecord',
  'reportSheetCollapseAll', 'reportSheetDeleteRecord', 'reportSheetExpandAll', 'reportSheetRegenerateReport',
  'reportSheetResetCellValue', 'reportSheetSubmit'];

describe('GC.Spread.Sheets.Commands namespace constants', () => {
  for (const [name, canUndo] of Object.entries(TRIAL_CAN_UNDO)) {
    it(`Commands.${name} is a Command object with the trial canUndo`, () => {
      const command = CommandNames[name];
      expect(typeof command).toBe('object');
      expect(command.canUndo).toBe(canUndo);
      expect(typeof command.execute).toBe('function');
    });
  }
  it('keeps the add-on-only command names as documented fallbacks', () => {
    for (const name of ADDON_ONLY)
      expect(() => CommandNames[name]).toThrow(/NotImplemented/);
  });
});

describe('GC.Spread.Sheets.Commands transactions (trial probes txn:*)', () => {
  it('startTransaction/endTransaction record changes onto options and undoTransaction reverts values', () => {
    const wb = new Workbook();
    const sheet = wb.getActiveSheet();
    sheet.setValue(1, 1, 'b');
    const options = { cmd: 'mine', sheetName: sheet.name() };
    Commands.startTransaction(wb, options);
    sheet.setValue(1, 1, 'c');
    Commands.endTransaction(wb, options);
    expect(sheet.getValue(1, 1)).toBe('c');
    // Trial probe `txn:basic`: options gains a `changes<sheetName>` key; undo reverts the value.
    expect(Object.keys(options).sort()).toEqual(['changesSheet1', 'cmd', 'sheetName']);
    Commands.undoTransaction(wb, options);
    expect(sheet.getValue(1, 1)).toBe('b');
  });
  it('undoes cell styles recorded in a transaction (trial probe `txn:style-range`)', () => {
    const wb = new Workbook();
    const sheet = wb.getActiveSheet();
    const options = { cmd: 'mine2', sheetName: sheet.name() };
    Commands.startTransaction(wb, options);
    sheet.getRange(2, 2, 1, 1).backColor('red');
    Commands.endTransaction(wb, options);
    expect(sheet.getRange(2, 2, 1, 1).backColor()).toBe('red');
    Commands.undoTransaction(wb, options);
    // Trial probe `txn:style-range`: after undo the getter yields no value (the probe
    // harness normalizes `undefined` to `null`).
    expect(sheet.getRange(2, 2, 1, 1).backColor()).toBeUndefined();
  });
  it('names the change key after the sheet (trial probe `txn:zeta-keys`: changesZeta)', () => {
    const wb = new Workbook();
    const sheet = wb.getActiveSheet();
    sheet.name('Zeta');
    const options = { cmd: 'mine', sheetName: 'Zeta' };
    Commands.startTransaction(wb, options);
    sheet.setValue(1, 1, 'b');
    Commands.endTransaction(wb, options);
    expect(Object.keys(options)).toContain('changesZeta');
    Commands.undoTransaction(wb, options);
    expect(sheet.getValue(1, 1)).toBeNull();
  });
  it('without sheetName nothing is recorded and undo does nothing (trial probe `txn:nosheetname`)', () => {
    const wb = new Workbook();
    const sheet = wb.getActiveSheet();
    const options = { cmd: 'mine5' };
    Commands.startTransaction(wb, options);
    sheet.setValue(0, 0, 'q');
    Commands.endTransaction(wb, options);
    expect((options as Record<string, unknown>).changesSheet1).toBeUndefined();
    Commands.undoTransaction(wb, options);
    expect(sheet.getValue(0, 0)).toBe('q');
  });
  it('records per sheet for an array sheetName and reverts both (trial probe `txn:multi-correct`)', () => {
    const wb = new Workbook();
    wb.addSheet(1, new Worksheet('TxnB'));
    const a = wb.getSheet(0), b = wb.getSheet(1);
    const options = { cmd: 'mine3', sheetName: [a.name(), b.name()] };
    Commands.startTransaction(wb, options);
    a.setValue(5, 5, 'x');
    b.setValue(6, 6, 'y');
    Commands.endTransaction(wb, options);
    expect(Object.keys(options).filter((k) => k.startsWith('changes')).sort()).toEqual(['changesSheet1', 'changesTxnB']);
    Commands.undoTransaction(wb, options);
    expect(a.getValue(5, 5)).toBeNull();
    expect(b.getValue(6, 6)).toBeNull();
  });
  it('nested transactions record only into the outermost (trial probe `txn:nested`)', () => {
    const wb = new Workbook();
    const sheet = wb.getActiveSheet();
    const o1 = { cmd: 'a', sheetName: sheet.name() };
    const o2 = { cmd: 'b', sheetName: sheet.name() };
    Commands.startTransaction(wb, o1);
    Commands.startTransaction(wb, o2);
    sheet.setValue(0, 0, 1);
    Commands.endTransaction(wb, o2);
    sheet.setValue(0, 1, 2);
    Commands.endTransaction(wb, o1);
    Commands.undoTransaction(wb, o2);
    expect(sheet.getValue(0, 0)).toBe(1); // trial: inner undo is a no-op
    Commands.undoTransaction(wb, o1);
    expect(sheet.getValue(0, 1)).toBeNull();
  });
  it('undoTransaction without a startTransaction does not throw (trial probe `txn:no-start`)', () => {
    const wb = new Workbook();
    expect(() => Commands.undoTransaction(wb, { cmd: 'x', sheetName: wb.getActiveSheet().name() })).not.toThrow();
  });
  it('works with the documented register pattern and commandManager undo (trial probe `txn:undo-cmd`)', () => {
    const wb = new Workbook();
    const sheet = wb.getActiveSheet();
    const command = {
      canUndo: true,
      execute: (context: import('../src/workbook.js').Workbook, options: CommandOptions, isUndo: boolean) => {
        if (isUndo) { Commands.undoTransaction(context, options); return true; }
        Commands.startTransaction(context, options);
        context.getSheetFromName(String(options.sheetName)).setValue(Number(options.row), Number(options.col), options.value);
        Commands.endTransaction(context, options);
        return true;
      },
    };
    const cm = wb.commandManager();
    cm.register('customTxn', command as never);
    expect(cm.execute({ cmd: 'customTxn', sheetName: sheet.name(), row: 3, col: 3, value: 42 })).toBe(true);
    expect(sheet.getValue(3, 3)).toBe(42);
    expect(cm.execute({ cmd: 'undo', sheetName: sheet.name() })).toBe(true);
    expect(sheet.getValue(3, 3)).toBeNull();
  });
});

describe('built-in command behaviors (isolated trial values, probe `cmd:isolated`)', () => {
  const fresh = () => {
    const wb = new Workbook();
    return { wb, sheet: wb.getActiveSheet(), cm: wb.commandManager() };
  };
  const result = (wb: { commandManager(): { execute(options: never): unknown } }, options: { [key: string]: unknown }) => wb.commandManager().execute(options as never);

  it('undo/redo return true even with an empty history (trial probe `cmd:undo-redo-solo`)', () => {
    const { wb } = fresh();
    expect(result(wb, { cmd: 'undo', sheetName: 'Sheet1' })).toBe(true);
    expect(result(wb, { cmd: 'redo', sheetName: 'Sheet1' })).toBe(true);
  });
  it('zoom applies the factor and is undoable (trial probes `cmd:isolated`, `txn:zoom-undo`)', () => {
    const { wb, sheet } = fresh();
    expect(result(wb, { cmd: 'zoom', sheetName: sheet.name(), zoomFactor: 1.5 })).toBe(true);
    expect(sheet.zoom()).toBe(1.5);
    expect(result(wb, { cmd: 'undo', sheetName: sheet.name() })).toBe(true);
    expect(sheet.zoom()).toBe(1);
  });
  it('zoom without a factor fails (trial: requires options)', () => {
    const { wb } = fresh();
    expect(result(wb, { cmd: 'zoom', sheetName: 'Sheet1' })).toBe(false);
  });
  it('clear removes selection content and a single undo restores it (trial probe `cmd:clear-undo`)', () => {
    const { wb, sheet } = fresh();
    sheet.setValue(0, 0, 'x');
    sheet.setSelection(0, 0, 1, 1);
    expect(result(wb, { cmd: 'clear', sheetName: sheet.name() })).toBe(true);
    expect(sheet.getValue(0, 0)).toBeNull();
    expect(result(wb, { cmd: 'undo', sheetName: sheet.name() })).toBe(true);
    expect(sheet.getValue(0, 0)).toBe('x');
  });
  it('clearValues/clearAndEditing return true on a fresh workbook (trial isolated values)', () => {
    const a = fresh();
    expect(result(a.wb, { cmd: 'clearValues', sheetName: 'Sheet1' })).toBe(true);
    const b = fresh();
    expect(result(b.wb, { cmd: 'clearAndEditing', sheetName: 'Sheet1' })).toBe(true);
  });
  it('copy/cut/paste run without changing the model (trial probes `cmd:copy-paste-sel`, `cmd:cut-sel`)', () => {
    const { wb, sheet } = fresh();
    sheet.setValue(0, 0, 'src');
    sheet.setSelection(0, 0, 1, 1);
    expect(result(wb, { cmd: 'copy', sheetName: sheet.name() })).toBeUndefined();
    sheet.setSelection(2, 0, 1, 1);
    expect(result(wb, { cmd: 'paste', sheetName: sheet.name() })).toBeUndefined();
    expect(sheet.getValue(0, 0)).toBe('src');
    expect(sheet.getValue(2, 0)).toBeNull();
  });
  it('clipboardPaste needs pastedRanges (trial: false without them, runs otherwise)', () => {
    const { wb, sheet } = fresh();
    expect(result(wb, { cmd: 'clipboardPaste', sheetName: sheet.name() })).toBe(false);
    expect(result(wb, { cmd: 'clipboardPaste', sheetName: sheet.name(), pastedRanges: [new Range(2, 0, 1, 1)] })).toBeUndefined();
  });
  it('fill requires Range instances and repeats the start pattern into a disjoint fill range (trial probe `cmd:fill-combos`)', () => {
    const { wb, sheet } = fresh();
    expect(result(wb, { cmd: 'fill', sheetName: sheet.name() })).toBeUndefined();
    sheet.setValue(0, 0, 1);
    sheet.setValue(1, 0, 2);
    const ok = result(wb, {
      cmd: 'fill', sheetName: sheet.name(),
      startRange: new Range(0, 0, 2, 1), fillRange: new Range(2, 0, 2, 1),
      autoFillType: 0, fillDirection: 0,
    });
    expect(ok).toBe(true);
    expect([sheet.getValue(2, 0), sheet.getValue(3, 0)]).toEqual([1, 2]); // trial: [true, 1, 2]
    expect(result(wb, { cmd: 'undo', sheetName: sheet.name() })).toBe(true);
    expect([sheet.getValue(2, 0), sheet.getValue(3, 0)]).toEqual([null, null]);
  });
  it('fill with an overlapping range changes nothing and returns true (trial probe `cmd:fill-range`)', () => {
    const { wb, sheet } = fresh();
    sheet.setValue(0, 0, 1);
    sheet.setValue(1, 0, 2);
    expect(result(wb, {
      cmd: 'fill', sheetName: sheet.name(),
      startRange: new Range(0, 0, 2, 1), fillRange: new Range(0, 0, 4, 1),
      autoFillType: 0, fillDirection: 0,
    })).toBe(true);
    expect([sheet.getValue(2, 0), sheet.getValue(3, 0)]).toEqual([null, null]);
  });
  it('dragDrop copies the source range when copy is set (trial probe `cmd:dragdrop-opts`)', () => {
    const { wb, sheet } = fresh();
    expect(result(wb, { cmd: 'dragDrop', sheetName: sheet.name() })).toBe(false);
    sheet.setValue(0, 0, 'dd');
    const ok = result(wb, {
      cmd: 'dragDrop', sheetName: sheet.name(), fromRow: 0, fromColumn: 0, toRow: 2, toColumn: 0,
      rowCount: 1, columnCount: 1, copy: true, insert: false, option: 0,
    });
    expect(ok).toBe(true);
    expect(sheet.getValue(0, 0)).toBe('dd');
    expect(sheet.getValue(2, 0)).toBe('dd');
  });
  it('renameSheet with { sheetName, name } renames and is undoable (trial probe `cmd:rename-forms`)', () => {
    const { wb, cm } = fresh();
    expect(result(wb, { cmd: 'renameSheet', sheetName: 'Sheet1' })).toBe(false); // trial: false without `name`
    expect(cm.execute({ cmd: 'renameSheet', sheetName: 'Sheet1', name: 'Renamed' } as never)).toBe(true);
    expect(wb.sheets.map((s) => s.name())).toEqual(['Renamed']);
    expect(result(wb, { cmd: 'undo', sheetName: 'Renamed' })).toBe(true);
    expect(wb.sheets.map((s) => s.name())).toEqual(['Sheet1']);
  });
  it('copySheet clones a sheet at the target index (trial probe `cmd:move-copy-sheets`: true + Copy1)', () => {
    const wb = new Workbook();
    wb.addSheet(1, new Worksheet('B'));
    wb.getSheet(0).setValue(0, 0, 'origin');
    const r = wb.commandManager().execute({ cmd: 'copySheet', sheetName: 'Sheet1', targetIndex: 2, newName: 'Copy1', includeBindingSource: true } as never);
    expect(r).toBe(true);
    expect(wb.sheets.map((s) => s.name())).toEqual(['Sheet1', 'B', 'Copy1']);
    expect(wb.getSheetFromName('Copy1').getValue(0, 0)).toBe('origin');
  });
  it('moveSheet reorders via { sheetName, targetIndex } (trial probe `cmd:move-copy-sheets`: true)', () => {
    const wb = new Workbook();
    wb.addSheet(1, new Worksheet('B'));
    const r = wb.commandManager().execute({ cmd: 'moveSheet', sheetName: 'B', targetIndex: 0 } as never);
    expect(r).toBe(true);
    expect(wb.sheets.map((s) => s.name())).toEqual(['B', 'Sheet1']);
    expect(result(wb, { cmd: 'moveSheet', sheetName: 'B' })).toBe(false); // trial: false without targetIndex
  });
  it('outlineRow groups with { index, count }; expand/remove follow the trial outcomes (probe `cmd:outline-forms2`)', () => {
    const { wb, sheet } = fresh();
    for (let r = 0; r < 12; r++) sheet.setValue(r, 0, r + 1);
    expect(result(wb, { cmd: 'outlineRow', sheetName: sheet.name(), index: 2, count: 4 })).toBe(true);
    expect(result(wb, { cmd: 'expandRowOutline', sheetName: sheet.name(), index: 2 })).toBe(false); // trial: false (nothing collapsed)
    expect(result(wb, { cmd: 'removeRowOutline', sheetName: sheet.name(), index: 2 })).toBe(false); // trial: false without `count`
    expect(result(wb, { cmd: 'removeRowOutline', sheetName: sheet.name(), index: 2, count: 4 })).toBe(true);
    expect(result(wb, { cmd: 'outlineColumn', sheetName: sheet.name(), index: 1, count: 2 })).toBe(true);
  });
  it('table row/column commands follow the trial outcomes (probes `cmd:table-ops2`, `cmd:delete-rows-fresh`)', () => {
    const { wb, sheet } = fresh();
    for (let r = 0; r < 4; r++) { sheet.setValue(r, 0, r === 0 ? 'H1' : `d${r}`); sheet.setValue(r, 1, r === 0 ? 'H2' : `x${r}`); }
    sheet.tables.add('Table1', 0, 0, 3, 2);
    const range = () => [sheet.tables.findByName('Table1')!.range().row, sheet.tables.findByName('Table1')!.range().rowCount];
    expect(result(wb, { cmd: 'tableInsertRows', sheetName: sheet.name(), tableName: 'Table1', row: 1, count: 2 })).toBe(true);
    expect(range()).toEqual([0, 5]); // trial: [0,5]
    expect(result(wb, { cmd: 'tableInsertColumns', sheetName: sheet.name(), tableName: 'Table1', col: 1, count: 1 })).toBe(true);
    expect(sheet.tables.findByName('Table1')!.range().colCount).toBe(3); // trial: 3
    expect(result(wb, { cmd: 'tableDeleteColumns', sheetName: sheet.name(), tableName: 'Table1', col: 1, count: 1 })).toBe(true);
    expect(sheet.tables.findByName('Table1')!.range().colCount).toBe(2); // trial: 2
    // Trial probes `cmd:delete-rows-fresh`/`cmd:delete-rows-variants`: tableDeleteRows
    // returned false for every probed option shape on plain range tables (see STATUS).
    expect(result(wb, { cmd: 'tableDeleteRows', sheetName: sheet.name(), tableName: 'Table1', row: 1, count: 1 })).toBe(false);
    expect(result(wb, { cmd: 'tableDeleteRows', sheetName: sheet.name(), tableName: 'Table1', row: 0, count: 1 })).toBe(false);
    expect(range()).toEqual([0, 5]);
    expect(result(wb, { cmd: 'tableResize', sheetName: sheet.name(), tableName: 'Table1' })).toBe(false); // trial: false without resizeToRange
  });
  it('navigation/selection commands return the trial isolated values (probe `cmd:isolated`)', () => {
    const { wb, sheet } = fresh();
    for (const name of ['navigationLeft', 'navigationRight', 'navigationUp', 'navigationDown', 'navigationHome', 'navigationEnd', 'navigationTop', 'navigationBottom', 'navigationFirst', 'navigationLast', 'navigationHome2', 'navigationEnd2', 'navigationPageDown', 'navigationPageUp', 'selectionLeft', 'selectionRight', 'selectionUp', 'selectionDown', 'selectionHome', 'selectionEnd', 'selectionTop', 'selectionBottom', 'selectionFirst', 'selectionLast', 'selectionPageDown', 'selectionPageUp', 'moveToNextCell', 'moveToPreviousCell', 'moveToNextCellThenControl', 'commitInputNavigationDown', 'commitInputNavigationUp', 'startEdit', 'editCell', 'changeEditorStatus', 'deleteFloatingObjects', 'moveFloatingObjects', 'pasteFloatingObjects', 'resizeFloatingObjects', 'dragCopyFloatingObjects', 'outlineColumn', 'outlineRow', 'removeColumnOutline', 'removeRowOutline', 'expandRowOutline', 'expandColumnOutline', 'moveSheet', 'copySheet', 'renameSheet', 'tableSubmitChanges'])
      expect([name, result(wb, { cmd: name, sheetName: sheet.name(), row: 0, col: 0 })]).toEqual([name, name.startsWith('navigation') || name.startsWith('selection') || name.startsWith('moveTo') || ['commitInputNavigationDown', 'commitInputNavigationUp', 'startEdit', 'editCell'].includes(name) ? true : false]);
    // Trial: navigationNextSheet/navigationPreviousSheet are null on a single-sheet workbook.
    expect(result(wb, { cmd: 'navigationNextSheet', sheetName: sheet.name() })).toBeUndefined();
    expect(result(wb, { cmd: 'navigationPreviousSheet', sheetName: sheet.name() })).toBeUndefined();
    // navigationDown moves the active cell (trial probe `cmd:navigate-states`: row 2 -> 3).
    sheet.setSelection(2, 2, 1, 1);
    result(wb, { cmd: 'navigationDown', sheetName: sheet.name() });
    expect(sheet.getSelections()[0].row).toBe(3);
    result(wb, { cmd: 'commitInputNavigationDown', sheetName: sheet.name() });
    expect(sheet.getSelections()[0].row).toBe(4); // trial probe `cmd:commit-nav2`: row 1 from (0,0)
  });
  it('edit-state commands match the trial isolated values (commitInput false, cancelInput null, commitArrayFormula true)', () => {
    const a = fresh();
    expect(result(a.wb, { cmd: 'commitInput', sheetName: 'Sheet1', row: 0, col: 0 })).toBe(false);
    const b = fresh();
    expect(result(b.wb, { cmd: 'cancelInput', sheetName: 'Sheet1', row: 0, col: 0 })).toBeUndefined();
    const c = fresh();
    expect(result(c.wb, { cmd: 'commitArrayFormula', sheetName: 'Sheet1', row: 0, col: 0 })).toBe(true);
    const d = fresh();
    expect(result(d.wb, { cmd: 'changeFormulaReference', sheetName: 'Sheet1', row: 0, col: 0 })).toBeUndefined();
  });
  it('editor-open commands match the trial matrix (probe `cmd:isolated`)', () => {
    const { wb } = fresh();
    for (const name of ['openCalculator', 'openColorPicker', 'openDateTimePicker', 'openList', 'openMonthPicker', 'openMultiColumn', 'openSlider', 'openTimePicker', 'openWorkflowList'])
      expect([name, result(wb, { cmd: name, sheetName: 'Sheet1', row: 0, col: 0, sheetArea: 0 })]).toEqual([name, true]);
    expect(result(wb, { cmd: 'openUrl', sheetName: 'Sheet1', row: 0, col: 0, sheetArea: 0 })).toBe(false); // no hyperlink
    expect(result(wb, { cmd: 'openPasteSpecialDialog', sheetName: 'Sheet1' })).toBe(false); // empty clipboard
  });
  it('control-select commands return the trial object (probe `cmd:isolated`)', () => {
    const { wb } = fresh();
    expect(result(wb, { cmd: 'selectNextControl', sheetName: 'Sheet1' })).toEqual({ ignoreCancelDefault: true });
    expect(result(wb, { cmd: 'selectPreviousControl', sheetName: 'Sheet1' })).toEqual({ ignoreCancelDefault: true });
  });
  it('nextControl/previousControl store the element and the select commands focus it (trial probes `wb:controls`, `wb:nextcontrol-cmd`)', () => {
    const { wb } = fresh();
    let focusCount = 0;
    const next = document.createElement('div');
    const previous = document.createElement('div');
    next.focus = () => { focusCount += 2; };
    previous.focus = () => { focusCount += 1; };
    expect(wb.nextControl(next)).toBe(wb); // trial: setter returns the workbook
    expect(wb.previousControl(previous)).toBe(wb);
    expect(wb.nextControl()).toBe(next);
    expect(wb.previousControl()).toBe(previous);
    expect(result(wb, { cmd: 'selectNextControl', sheetName: 'Sheet1' })).toEqual({ ignoreCancelDefault: false });
    expect(result(wb, { cmd: 'selectPreviousControl', sheetName: 'Sheet1' })).toEqual({ ignoreCancelDefault: false });
    expect(focusCount).toBe(3); // trial: each select command focuses its control once
  });
  it('autoFit commands require the columns/rows option (trial isolated: false)', () => {
    const { wb } = fresh();
    expect(result(wb, { cmd: 'autoFitColumn', sheetName: 'Sheet1' })).toBe(false);
    expect(result(wb, { cmd: 'autoFitRow', sheetName: 'Sheet1' })).toBe(false);
  });
  it('resize commands without rows/columns fail like the trial; with them our core applies the documented size (see STATUS trial note)', () => {
    const { wb, sheet } = fresh();
    expect(result(wb, { cmd: 'resizeRow', sheetName: sheet.name() })).toBe(false);
    expect(result(wb, { cmd: 'resizeColumn', sheetName: sheet.name() })).toBe(false);
    expect(result(wb, { cmd: 'splitResizeColumn', sheetName: sheet.name() })).toBeUndefined(); // trial: null without options
    expect(result(wb, { cmd: 'resizeRow', sheetName: sheet.name(), rows: [{ row: 1 }], size: 40 })).toBe(true);
    expect(sheet.getRowHeight(1)).toBe(40);
    expect(result(wb, { cmd: 'undo', sheetName: sheet.name() })).toBe(true);
    expect(sheet.getRowHeight(1)).toBe(20);
    expect(result(wb, { cmd: 'resizeColumn', sheetName: sheet.name(), columns: [{ col: 1 }], size: 70 })).toBe(true);
    expect(sheet.getColumnWidth(1)).toBe(70);
  });
});

describe('GC.Spread.Common.Events (trial probe `events:*`)', () => {
  it('is a constructible class holding the static CurrentUserChanged name', () => {
    const Events = GC.Spread.Common.Events as unknown as new () => Record<string, unknown>;
    expect(typeof Events).toBe('function');
    const instance = new Events();
    expect(Object.keys(instance)).toEqual([]);
    // Trial: typeof 'string', length 18 (probe `events:currentUserChanged`).
    expect((Events as unknown as { CurrentUserChanged: string }).CurrentUserChanged).toBe('CurrentUserChanged');
  });
});

describe('GC.Spread.Sheets.Comments extras (trial probes `comments:*`)', () => {
  it('CommentDeleteUndoAction deletes and restores a comment', () => {
    const wb = new Workbook();
    const sheet = wb.getActiveSheet();
    const comment = sheet.comments.add(1, 1, 'note text');
    const action = new CommentDeleteUndoAction(sheet, comment);
    expect(typeof action.execute).toBe('function');
    expect(typeof action.undo).toBe('function');
    expect(action.execute()).toBe(true);
    expect(sheet.comments.get(1, 1)).toBeNull();
    expect(action.undo()).toBe(true);
    expect(sheet.comments.get(1, 1)!.text()).toBe('note text');
  });
  it('CommentPropertyUndoAction carries execute/undo/toJSON like the trial', () => {
    const wb = new Workbook();
    const sheet = wb.getActiveSheet();
    const before = sheet.comments.add(2, 2, 'old');
    const after = before.clone();
    after.text('new');
    const action = new CommentPropertyUndoAction(sheet, { row: 2, col: 2, before, after });
    expect(action.execute()).toBe(true);
    expect(sheet.comments.get(2, 2)!.text()).toBe('new');
    expect(action.undo()).toBe(true);
    expect(sheet.comments.get(2, 2)!.text()).toBe('old');
    expect(action.toJSON().row).toBe(2);
  });
  it('CommentManager exposes getUsedRange/hitTest/dispose like the trial runtime', () => {
    const wb = new Workbook();
    const sheet = wb.getActiveSheet();
    const manager = sheet.comments;
    expect(manager.getUsedRange()).toEqual({}); // trial probe `comments:usedrange-json`: `{}` when empty
    manager.add(1, 1, 'a');
    manager.add(3, 4, 'b');
    // Trial: `{minRow:1,minCol:1,maxRow:3,maxCol:4}`
    expect(manager.getUsedRange()).toEqual({ minRow: 1, minCol: 1, maxRow: 3, maxCol: 4 });
    expect(manager.hitTest(0, 0)).toBeNull(); // trial probe `comments:hit` at (0,0): null
    expect(typeof manager.dispose).toBe('function');
    manager.dispose();
    expect(manager.all()).toHaveLength(0);
  });
  it('Comment.clone copies text/properties and Comment.assignId exists (trial Comment.prototype)', () => {
    const comment = new GC.Spread.Sheets.Comments.Comment('hello');
    comment.width(120);
    const copy = comment.clone();
    expect(copy.text()).toBe('hello');
    expect(copy.width()).toBe(120);
    expect(typeof comment.assignId).toBe('function');
    comment.assignId();
  });
});

describe('GC.Spread.Sheets.ConditionalFormatting sparkline/date extras (trial probes `cf:*`)', () => {
  it('exposes DateExConditionExpectType with the trial enum values', () => {
    expect(CF.DateExConditionExpectType).toMatchObject({
      dateOccurring: 0, yearOccurring: 1, quarterOccurring: 2, monthOccurring: 3,
      weekOccurring: 4, dayOccurring: 5, yearToDate: 6,
    });
  });
  it('exposes the trial placeholder constants', () => {
    expect(CF.CF_CELL_PLACEHOLDER).toBe('@');
    expect(CF.CF_RANGE_PLACEHOLDER).toBe('$CF_RANGE$');
  });
  it('SparklineFormulaBuilder reproduces the trial-observed statics', () => {
    const Builder = CF.SparklineFormulaBuilder as unknown as new () => object;
    expect(typeof Builder).toBe('function');
    expect(new Builder()).toBeInstanceOf(Builder);
    // Trial probe `cf:sf-shapes`: buildFormulaFromArray('1,2,3') -> '=1,2,3()'; buildArguments({paramOrder:[]}) -> [].
    expect((Builder as never as { buildFormulaFromArray(v: unknown): string }).buildFormulaFromArray('1,2,3')).toBe('=1,2,3()');
    expect((Builder as never as { buildArguments(o: unknown): unknown[] }).buildArguments({ paramOrder: [] })).toEqual([]);
  });
  it('sparkline validators return the trial messages/values', () => {
    expect(CF.validateSparklineType('LINESPARKLINE', {})).toBeNull(); // trial `cf:validate-valid`: null
    expect(CF.validateSparklineType('line', { max: 1 })).toBe('Sparkline rule requires a valid sparkline type (e.g., "PIESPARKLINE", "LINESPARKLINE", "AREASPARKLINE")');
    expect(CF.validateSparklineOptions({ max: true, min: false }, 'line')).toBe('Sparkline rule options must be a plain object containing sparkline configuration');
    expect(CF.normalizeSparklineFormulaPlaceholdersForCollaboration('1,2,3', { row: 0, column: 0 })).toBe('1,2,3');
    expect(CF.restoreSparklineFormulaPlaceholders('@,$CF_RANGE$,1,2')).toBe('@,$CF_RANGE$,1,2');
  });
});

describe('GC.Spread.Sheets.TableSheet.BuiltInRowActions (trial probes `ts:*`)', () => {
  it('exposes the six statics with the trial names and commands', () => {
    expect(typeof BuiltInRowActions).toBe('function');
    expect(new BuiltInRowActions()).toBeInstanceOf(BuiltInRowActions);
    for (const key of ['dirtyStatus', 'pinRow', 'removeRow', 'resetRow', 'saveRow', 'warningInfo'])
      expect(BuiltInRowActions[key as keyof typeof BuiltInRowActions]).toBeTruthy();
    expect(BuiltInRowActions.dirtyStatus.name).toBe('dirtyStatus');
    expect(BuiltInRowActions.pinRow.name).toBe('pinRow');
    expect(BuiltInRowActions.pinRow.command).toBe('PinRow');
    expect(BuiltInRowActions.removeRow.command).toBe('RemoveRow');
    expect(BuiltInRowActions.resetRow.command).toBe('ResetRow');
    expect(BuiltInRowActions.saveRow.command).toBe('SaveRow');
    expect(BuiltInRowActions.warningInfo.name).toBe('warningInfo');
  });
  it('uses the trial ButtonImageType icon codes for remove/reset/save and data-URI SVGs elsewhere (clean-room art)', () => {
    expect(BuiltInRowActions.removeRow.icons).toEqual([10]); // trial icons:[10]
    expect(BuiltInRowActions.resetRow.icons).toEqual([2]); // trial icons:[2]
    expect(BuiltInRowActions.saveRow.icons).toEqual([4]); // trial icons:[4]
    expect(BuiltInRowActions.dirtyStatus.icons).toHaveLength(3); // trial: 3 icons
    expect(BuiltInRowActions.pinRow.icons).toHaveLength(1);
    expect(BuiltInRowActions.warningInfo.icons).toHaveLength(1);
    for (const icon of [...BuiltInRowActions.dirtyStatus.icons, ...BuiltInRowActions.pinRow.icons, ...BuiltInRowActions.warningInfo.icons])
      expect(String(icon)).toMatch(/^data:image\/svg\+xml;base64,/);
  });
  it('can be concatenated into rowActionOptions like the trial examples show', () => {
    const wb = new Workbook(undefined, { sheetCount: 0 });
    const view = wb.dataManager().addTable('bt', { data: [{ a: 1 }] }).addView('BV', ['a']);
    const tab = wb.addSheetTab(0, 'TS1', GC.Spread.Sheets.SheetType.tableSheet) as unknown as {
      setDataView(view: unknown): void;
      rowActionOptions(options?: { name?: string }[]): { name?: string }[];
    };
    tab.setDataView(view);
    tab.rowActionOptions([BuiltInRowActions.removeRow, BuiltInRowActions.saveRow, BuiltInRowActions.resetRow]);
    expect(tab.rowActionOptions().map((a: { name?: string }) => a.name)).toEqual(['removeRow', 'saveRow', 'resetRow']);
  });
});

describe('GC.Spread.Sheets.ThreadedComments non-panel members (trial probes `tc:*`)', () => {
  it('manager exposes hasComments and the trial getUsedRange shape', () => {
    const wb = new Workbook();
    const manager = wb.getActiveSheet().threadedComments;
    expect(manager.hasComments()).toBe(false);
    expect(manager.getUsedRange()).toEqual({}); // trial probe `tc:usedrange-json`: `{}` when empty
    manager.add(1, 1);
    expect(manager.hasComments()).toBe(true);
    // Trial: `{minRow:1,minCol:1,maxRow:1,maxCol:1}`
    expect(manager.getUsedRange()).toEqual({ minRow: 1, minCol: 1, maxRow: 1, maxCol: 1 });
  });
  it('exposes ThreadedCommentFilterType with the trial enum values (probe `tc:extras`)', () => {
    expect(TC.ThreadedCommentFilterType).toMatchObject({ None: 0, MentionsMe: 1, ActiveOnly: 2, ResolvedOnly: 4 });
  });
  it('Reply class carries assignId/clone/fromJSON/toJSON like the trial', () => {
    const reply = new TC.Reply();
    expect(typeof reply.assignId).toBe('function');
    expect(typeof reply.clone).toBe('function');
    expect(typeof reply.fromJSON).toBe('function');
    expect(typeof reply.toJSON).toBe('function');
    reply.fromJSON({ message: [{ type: 0, value: 'text' }], createdAt: new Date('2020-01-01T00:00:00Z'), authorId: '{A}' });
    expect(reply.toJSON().message).toEqual([{ type: 0, value: 'text' }]);
    reply.assignId('{B}');
    expect(reply.authorId).toBe('{B}');
    const copy = reply.clone();
    expect(copy.authorId).toBe('{B}');
  });
  it('ThreadedComment.assignId re-assigns author ids (trial exposes the method)', () => {
    const wb = new Workbook();
    const thread = wb.getActiveSheet().threadedComments.add(0, 0)!;
    thread.add('one');
    const before = thread.get(0)!.authorId;
    thread.assignId();
    expect(thread.get(0)!.authorId).not.toBe(before);
  });
  it('cloneContentBlock keeps only schema fields (trial probe `tc:conv`)', () => {
    expect(TC.cloneContentBlock({ type: 0, value: 'v' })).toEqual({ type: 0, value: 'v' });
    expect(TC.cloneContentBlock({ type: 1, text: 'blk' } as never)).toEqual({ type: 1 }); // trial dropped the text
  });
  it('fromSJSThreadedComment converts classic comment data like the trial (probe `tc:conv`)', () => {
    const wb = new Workbook();
    const classic = wb.getActiveSheet().comments.add(5, 5, 'classic note');
    expect(TC.fromSJSThreadedComment(classic.toJSON())).toEqual({ message: [], createdAt: null });
  });
  it('replyToIReply/replyToCapabilityCommentText convert replies', () => {
    const wb = new Workbook();
    const thread = wb.getActiveSheet().threadedComments.add(0, 0)!;
    thread.add('say hi');
    const reply = thread.get(0)!;
    expect(TC.replyToIReply(reply).message).toEqual([{ type: 0, value: 'say hi' }]);
    expect(TC.replyToCapabilityCommentText(reply)).toBe('say hi');
  });
  it('thread undo actions add/remove/update/restore (trial namespace classes)', () => {
    const wb = new Workbook();
    const sheet = wb.getActiveSheet();
    const { AddThreadedCommentUndoAction, RemoveThreadedCommentUndoAction, UpdateThreadedCommentUndoAction, AddThreadedCommentReplyUndoAction, RemoveThreadedCommentReplyUndoAction, UpdateThreadedCommentReplyUndoAction, NavigateNextThreadedCommentAction, NavigatePreviousThreadedCommentAction } = TC;
    const add = new AddThreadedCommentUndoAction(sheet, { row: 2, col: 3 });
    expect(add.execute()).toBe(true);
    expect(!!sheet.threadedComments.get(2, 3)).toBe(true);
    expect(add.undo()).toBe(true);
    expect(sheet.threadedComments.get(2, 3)).toBeUndefined();
    sheet.threadedComments.add(2, 3)?.add('keep');
    const remove = new RemoveThreadedCommentUndoAction(sheet, { row: 2, col: 3 });
    remove.execute();
    expect(sheet.threadedComments.get(2, 3)).toBeUndefined();
    remove.undo();
    expect(sheet.threadedComments.get(2, 3)!.all()[0]).toMatchObject({ message: [{ type: 0, value: 'keep' }] });
    const update = new UpdateThreadedCommentUndoAction(sheet, { row: 2, col: 3 });
    update.execute({ replies: [{ message: [{ type: 0, value: 'replaced' }], createdAt: new Date('2020-01-01T00:00:00Z'), authorId: '{U}' }], resolved: true });
    expect(sheet.threadedComments.get(2, 3)!.all()[0].message).toEqual([{ type: 0, value: 'replaced' }]);
    expect(sheet.threadedComments.get(2, 3)!.resolved()).toBe(true);
    update.undo();
    expect(sheet.threadedComments.get(2, 3)!.all()[0].message).toEqual([{ type: 0, value: 'keep' }]);
    const addReply = new AddThreadedCommentReplyUndoAction(sheet, { row: 2, col: 3 });
    addReply.execute('extra');
    expect(sheet.threadedComments.get(2, 3)!.all()).toHaveLength(2);
    addReply.undo();
    expect(sheet.threadedComments.get(2, 3)!.all()).toHaveLength(1);
    const removeReply = new RemoveThreadedCommentReplyUndoAction(sheet, { row: 2, col: 3 });
    removeReply.execute(0);
    expect(sheet.threadedComments.get(2, 3)!.all()).toHaveLength(0);
    removeReply.undo();
    expect(sheet.threadedComments.get(2, 3)!.all()).toHaveLength(1);
    const setReply = new UpdateThreadedCommentReplyUndoAction(sheet, { row: 2, col: 3 });
    setReply.execute(0, { message: [{ type: 0, value: 'edited' }], createdAt: new Date('2020-01-01T00:00:00Z'), authorId: '{U}' });
    expect(sheet.threadedComments.get(2, 3)!.get(0)!.message).toEqual([{ type: 0, value: 'edited' }]);
    setReply.undo();
    expect(sheet.threadedComments.get(2, 3)!.get(0)!.message).toEqual([{ type: 0, value: 'keep' }]);
    sheet.threadedComments.add(9, 9);
    sheet.setSelection(0, 0, 1, 1);
    expect(new NavigateNextThreadedCommentAction(sheet).execute()).toBe(true);
    expect(sheet.getSelections()[0].row).toBe(2); // first thread after the active cell (2,3)
    expect(new NavigateNextThreadedCommentAction(sheet).execute()).toBe(true);
    expect(sheet.getSelections()[0].row).toBe(9); // then (9,9)
    expect(new NavigatePreviousThreadedCommentAction(sheet).execute()).toBe(true);
    expect(sheet.getSelections()[0].row).toBe(2);
  });
});
