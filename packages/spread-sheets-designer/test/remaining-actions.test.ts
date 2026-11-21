/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it } from 'vitest';
import GC from '@mescius/spread-sheets';
import { applyBuiltin, applyFormatCells } from '../src/commands/actions.js';
import { Designer } from '../src/designer.js';

describe('M6b command regressions', () => {
  let sheet: any, d: any;
  beforeEach(() => {
    const workbook = new GC.Spread.Sheets.Workbook();
    sheet = workbook.getActiveSheet();
    // Object.create the prototype so `Designer.prototype.X.call(d)` flows can use their
    // companion `this.Y(...)` methods (showConfirmPassword, applySheetProtection, ...).
    d = Object.assign(Object.create(Designer.prototype), { gc: GC, getWorkbook: () => workbook, invalidate: () => undefined });
  });

  it('moves sheets and copies their content with a unique name', () => {
    const workbook = d.getWorkbook();
    sheet.name('Data'); sheet.setValue(0, 0, 'original');
    workbook.addSheet(1); workbook.getSheet(1).name('Data (2)');
    workbook.addSheet(2); workbook.getSheet(2).name('Other');
    let submit: any;
    d.showDialog = (_name: string, _data: any, callback: any) => { submit = callback; };
    Designer.prototype.showMoveOrCopySheet.call(d);
    submit({ before: '(move to end)', copy: true });
    expect(workbook.getActiveSheet().name()).toBe('Data (3)');
    expect(workbook.getActiveSheet().getValue(0, 0)).toBe('original');
    workbook.setActiveSheetIndex(0);
    Designer.prototype.showMoveOrCopySheet.call(d);
    submit({ before: 'Other', copy: false });
    expect(workbook.sheets.map((item: any) => item.name())).toEqual(['Data (2)', 'Data', 'Other', 'Data (3)']);
    expect(workbook.getActiveSheet()).toBe(sheet);
  });

  it('offers hidden sheets and reveals only the submitted selection', () => {
    const workbook = d.getWorkbook();
    workbook.addSheet(1);
    workbook.addSheet(2);
    workbook.getSheet(1).name('Hidden A');
    workbook.getSheet(2).name('Hidden B');
    workbook.getSheet(1).visible(false);
    workbook.getSheet(2).visible(false);
    let initial: any, submit: any;
    d.showDialog = (_name: string, data: any, callback: any) => { initial = data; submit = callback; };
    Designer.prototype.showUnhideSheet.call(d);
    expect(initial).toEqual({ names: ['Hidden A', 'Hidden B'], selected: ['Hidden A'] });
    submit({ selected: ['Hidden B'] });
    expect(!!workbook.getSheet(1).visible()).toBe(false);
    expect(!!workbook.getSheet(2).visible()).toBe(true);
  });

  it('removes only duplicates inside the selected rows and terminates on blank tails', () => {
    sheet.setArray(0, 0, [['Name', 'Count'], ['A', 1], ['A', 1], ['B', 2], ['Outside', 3]]);
    sheet.setValue(2, 3, 'Keep');
    const data = { region: { row: 0, col: 0, rowCount: 4, colCount: 2 }, hasHeaders: true, columns: [0, 1] };
    const args = { data, result: null as any };
    applyBuiltin(d, 'removeDuplicatesApply', args);
    expect(args.result).toEqual({ removed: 1, unique: 2 });
    expect(sheet.getArray(0, 0, 5, 2)).toEqual([['Name', 'Count'], ['A', 1], ['B', 2], [null, null], ['Outside', 3]]);
    expect(sheet.getValue(2, 3)).toBe('Keep');
    const tail = { region: { row: 5, col: 0, rowCount: 3, colCount: 1 }, hasHeaders: false, columns: [0] };
    applyBuiltin(d, 'removeDuplicatesApply', { data: tail, result: null });
    expect(sheet.getRowCount()).toBe(200);
  });

  it('keeps typed duplicate keys distinct and avoids separator collisions', () => {
    sheet.setArray(0, 0, [[1, 'A'], ['1', 'A'], ['x\u0001y', 'z'], ['x', 'y\u0001z']]);
    const data = { region: { row: 0, col: 0, rowCount: 4, colCount: 2 }, hasHeaders: false, columns: [0, 1] };
    const args = { data, result: null as any };
    applyBuiltin(d, 'removeDuplicatesApply', args);
    expect(args.result).toEqual({ removed: 0, unique: 4 });
    expect(sheet.getRowCount()).toBe(200);
  });

  it('compares only the columns checked in the dialog and refuses outlined ranges', () => {
    sheet.setArray(0, 0, [['a', 1, 'x'], ['a', 1, 'y']]);
    const data = { region: { row: 0, col: 0, rowCount: 2, colCount: 3 }, hasHeaders: false, columns: [0, 1] };
    const args = { data, result: null as any };
    applyBuiltin(d, 'removeDuplicatesApply', args);
    expect(args.result).toEqual({ removed: 1, unique: 1 });
    expect(sheet.getArray(0, 0, 3, 3)).toEqual([['a', 1, 'x'], [null, null, null], [null, null, null]]);
    sheet.clear(0, 0, 5, 5, 1, 15);
    sheet.setArray(0, 0, [['a', 1], ['a', 1]]);
    sheet.rowOutlines.group(0, 2);
    const outlined = { data: { region: { row: 0, col: 0, rowCount: 2, colCount: 2 }, hasHeaders: false, columns: [0, 1] }, result: null as any };
    applyBuiltin(d, 'removeDuplicatesApply', outlined);
    expect(outlined.result).toBeNull(); // the trial refuses and warns
    expect(sheet.getValue(1, 0)).toBe('a');
  });

  it('applies numeric/list validation and removes validation for Any value', () => {
    sheet.setSelection(1, 1, 2, 1);
    applyBuiltin(d, 'applyDataValidation', { data: { validationType: 'Whole number', operator: GC.Spread.Sheets.ConditionalFormatting.ComparisonOperators.between, source: 2, formula2: 5 } });
    for (const row of [1, 2]) {
      const validator = sheet.getDataValidator(row, 1);
      expect(validator.isValid(sheet, row, 1, 3)).toBe(true);
      expect(validator.isValid(sheet, row, 1, 6)).toBe(false);
    }
    applyBuiltin(d, 'applyDataValidation', { data: { validationType: 'List', source: 'Red,Green', inCellDropdown: true } });
    expect(sheet.getDataValidator(1, 1).isValid(sheet, 1, 1, 'Red')).toBe(true);
    expect(sheet.getDataValidator(1, 1).isValid(sheet, 1, 1, 'Blue')).toBe(false);
    applyBuiltin(d, 'applyDataValidation', { data: { validationType: 'Any value' } });
    expect(sheet.getDataValidator(1, 1)).toBeNull();
    expect(sheet.getDataValidator(2, 1)).toBeNull();
  });

  it('reopens validation with its criteria, messages, alert style and highlight intact', () => {
    sheet.setSelection(1, 1, 1, 1);
    applyBuiltin(d, 'applyDataValidation', { data: {
      validationType: 'Decimal', operator: 6, source: 2, formula2: 5, ignoreBlank: false,
      showInputMessage: true, inputTitle: 'Amount', inputMessage: 'Enter 2–5',
      showErrorMessage: true, errorStyle: 1, errorTitle: 'Outside range', errorMessage: 'Check the amount',
      highlightType: 1, highlightColor: '#ff8800',
    } });
    let data: Record<string, unknown> = {};
    d.showDialog = (_name: string, initial: typeof data) => { data = initial; };
    Designer.prototype.showDataValidation.call(d);
    expect(data).toMatchObject({ validationType: 'Decimal', operator: 6, source: 2, formula2: 5, ignoreBlank: false, inputTitle: 'Amount', inputMessage: 'Enter 2–5', errorStyle: 1, errorTitle: 'Outside range', errorMessage: 'Check the amount', highlightType: 1, highlightColor: '#ff8800' });
    expect(sheet.getDataValidator(1, 1).highlightStyle()).toEqual({ type: 1, color: '#ff8800' });
  });

  it('supports input messages on cells without restricting their values', () => {
    sheet.setSelection(0, 0, 1, 1);
    applyBuiltin(d, 'applyDataValidation', { data: { validationType: 'Any value', inputTitle: 'Hint', inputMessage: 'Enter any value', showInputMessage: true } });
    const validator = sheet.getDataValidator(0, 0);
    expect(validator.inputTitle()).toBe('Hint');
    expect(validator.inputMessage()).toBe('Enter any value');
    expect(validator.isValid(sheet, 0, 0, 'anything')).toBe(true);
  });

  // The Data tab dropdown fires the ribbon command ids observed in the trial
  // (circleInvalidDataCommand / clearInvalidCircles); they must route to the
  // highlight handlers, not fall through to the NotImplemented default.
  it('circles and clears invalid data through the ribbon command ids', () => {
    sheet.setSelection(1, 1, 1, 1);
    applyBuiltin(d, 'applyDataValidation', { data: { validationType: 'Whole number', operator: 6, source: 1, formula2: 10 } });
    sheet.setValue(1, 1, 99);
    applyBuiltin(d, 'circleInvalidDataCommand', {});
    expect(d.getWorkbook().options.highlightInvalidData).toBe(true);
    expect(sheet.getDataValidator(1, 1).highlightStyle()).toMatchObject({ type: 0, color: 'red' });
    applyBuiltin(d, 'clearInvalidCircles', {});
    expect(d.getWorkbook().options.highlightInvalidData).toBe(false);
  });

  it('clears filter criteria while keeping the filter range and buttons', () => {
    d.getCommand = () => undefined;
    expect(Designer.prototype.getCommandState.call(d, 'reapplyFilterData').enabled).toBe(false);
    sheet.setArray(0, 0, [['Name'], ['A'], ['B']]);
    sheet.setSelection(0, 0, 3, 1);
    applyBuiltin(d, 'setFilterData');
    const filter = sheet.rowFilter();
    expect(Designer.prototype.getCommandState.call(d, 'reapplyFilterData').enabled).toBe(true);
    applyBuiltin(d, 'clearFilterData');
    expect(sheet.rowFilter()).toBe(filter);
    applyBuiltin(d, 'reapplyFilterData');
    expect(sheet.rowFilter()).toBe(filter);
    applyBuiltin(d, 'setFilterData');
    expect(sheet.rowFilter()).toBeNull();
    expect(Designer.prototype.getCommandState.call(d, 'reapplyFilterData').enabled).toBe(false);
  });

  it('groups, collapses, expands and ungroups the selection', () => {
    sheet.setSelection(1, 0, 3, 1);
    // Trial (TASK 75 sweep): the "Group..."/"Ungroup..." gallery footers only act through
    // their dialogs — a bare execute leaves the outline untouched.
    applyBuiltin(d, 'innerGroup');
    expect(sheet.rowOutlines.getLevel(1)).toBe(-1);
    sheet.rowOutlines.group(1, 3);
    applyBuiltin(d, 'hideDetail');
    expect(sheet.getRowVisible(1)).toBe(false);
    applyBuiltin(d, 'showDetail');
    expect(sheet.getRowVisible(1)).toBe(true);
    // Trial (TASK 75 r3, five-case probe): bare Ungroup... never ungroups — its dialog
    // collects the level first; the outline survives the call untouched.
    applyBuiltin(d, 'innerUngroup');
    expect(sheet.rowOutlines.getLevel(1)).toBe(0);
    applyBuiltin(d, 'clearOutline');
    expect(sheet.rowOutlines.getLevel(1)).toBe(-1);
  });

  it('freezes leading/trailing panes and resets every frozen count', () => {
    sheet.setSelection(3, 2, 1, 1);
    applyBuiltin(d, 'freezePanes');
    expect([sheet.frozenRowCount(), sheet.frozenColumnCount()]).toEqual([3, 2]);
    applyBuiltin(d, 'freezeBottomRow'); applyBuiltin(d, 'freezeLastColumn');
    expect([sheet.frozenTrailingRowCount(), sheet.frozenTrailingColumnCount()]).toEqual([1, 1]);
    applyBuiltin(d, 'unfreezePanes');
    expect([sheet.frozenRowCount(), sheet.frozenColumnCount(), sheet.frozenTrailingRowCount(), sheet.frozenTrailingColumnCount()]).toEqual([0, 0, 0, 0]);
  });

  it('toggles workbook and sheet visibility options through their live models', () => {
    for (const command of ['showHideVGridLine', 'showHideHGridLine', 'showHideRowHeader', 'showHideColumnHeader', 'showHideTabStrip', 'showHideNewTab', 'showFormulas']) {
      // Trial (TASK 75 sweep): these toggle through the ribbon path (propertyName set);
      // a bare execute of showFormulas is a no-op on the trial.
      const before = JSON.stringify({ sheet: sheet.options, workbook: d.getWorkbook().options });
      applyBuiltin(d, command, { propertyName: command });
      expect(JSON.stringify({ sheet: sheet.options, workbook: d.getWorkbook().options }), command).not.toBe(before);
      applyBuiltin(d, command, { propertyName: command });
      expect(JSON.stringify({ sheet: sheet.options, workbook: d.getWorkbook().options }), command).toBe(before);
    }
  });

  it('writes public padding/mask fields, honours font styles, and clears borders', () => {
    sheet.setSelection(0, 0, 1, 1);
    applyFormatCells(d, { paddingTop: 1, paddingRight: 2, paddingBottom: 3, paddingLeft: 4, maskPattern: '000', maskPlaceholder: '_', fontStyle: 'Bold Italic', fontSize: '14', borderPreset: 'outline', lineStyle: 'double' });
    let style = sheet.getActualStyle(0, 0);
    expect(style.cellPadding).toBe('1 2 3 4');
    // The trial omits the mask placeholder when it equals the default '_' (probe .probe/t6).
    expect(style.mask).toEqual({ pattern: '000' });
    expect([style.fontWeight, style.fontStyle, style.fontSize]).toEqual(['bold', 'italic', '14pt']);
    expect(style.borderTop.style).toBe(6);
    applyFormatCells(d, { paddingTop: 1, paddingRight: 2, paddingBottom: 3, paddingLeft: 8, borderPreset: 'none' });
    style = sheet.getActualStyle(0, 0);
    expect(style.cellPadding).toBe('1 2 3 8');
    expect(style.borderTop).toBeFalsy();
  });

  it('reports unsupported commands instead of silently succeeding', () => {
    for (const name of ['autoOutline', 'selectionPaneButton', 'showFormulaEditorPanel', 'commandPaletteButton', 'unknownCommand']) expect(() => applyBuiltin(d, name)).toThrow(`NotImplemented: Designer command ${name}`);
  });

  it('stores the public cell-button and decoration structures without invented properties', () => {
    sheet.setSelection(0, 0, 1, 1);
    const cellButtons = [{ caption: 'Run', command: 'run', enabled: true, width: 20, position: 1, visibility: 0, buttonBackColor: '#ffffff' }];
    const decoration = { cornerFold: { position: 3, size: 8, color: '#ff0000' }, icons: [{ src: '/icon.svg', position: 1, width: 16, height: 16 }] };
    applyFormatCells(d, { cellButtons, decoration });
    // Trial shape (probe .probe/t6/format-tabs3): the six core fields always, defaults dropped.
    expect(sheet.getActualStyle(0, 0).cellButtons).toEqual([
      { imageType: 5, visibility: 0, position: 1, command: 'run', enabled: true, useButtonStyle: false, caption: 'Run', buttonBackColor: '#ffffff' },
    ]);
    expect(sheet.getActualStyle(0, 0).decoration).toEqual(decoration);
    applyFormatCells(d, { cellButtons: [], decoration: {} });
    expect(sheet.getActualStyle(0, 0).cellButtons).toEqual([]);
    expect(sheet.getActualStyle(0, 0).decoration).toBeUndefined();
  });

  it('protects with a real password verifier without storing the password in worksheet options', () => {
    const submits: ((data: Record<string, unknown>) => void)[] = [];
    const boxes: string[] = [];
    d.showDialog = (_name: string, _data: unknown, success: (data: Record<string, unknown>) => void) => { submits.push(success); };
    d.showMessageBox = (message: string) => { boxes.push(message); };
    Designer.prototype.showProtectSheet.call(d);
    // A password opens the Confirm Password companion dialog first.
    submits[0]({ password: 'secret', allowSelectLocked: true, allowSelectUnlocked: true });
    expect(submits.length).toBe(2);
    submits[1]({ password: 'typo' });
    expect(boxes).toContain('Confirmation password is not identical.');
    expect(sheet.options.isProtected).toBe(false);
    Designer.prototype.showProtectSheet.call(d);
    submits[2]({ password: 'secret', allowSelectLocked: false, allowSort: true });
    submits[3]({ password: 'secret' });
    expect(sheet.options.isProtected).toBe(true);
    expect(sheet.hasPassword()).toBe(true);
    expect(sheet.options.protectionOptions.allowSelectLockedCells).toBe(false);
    expect(sheet.options.protectionOptions.allowSort).toBe(true);
    expect(sheet.options.protectionOptions).not.toHaveProperty('password');
    expect(JSON.stringify(sheet.toJSON())).not.toContain('secret');
    // The verifier gates unprotect: wrong password keeps the sheet protected.
    expect(sheet.unprotect('wrong')).toBe(false);
    expect(sheet.options.isProtected).toBe(true);
    expect(sheet.unprotect('secret')).toBe(true);
    expect(sheet.options.isProtected).toBe(false);
    // A bare (password-less) protect still works and writes no verifier.
    Designer.prototype.showProtectSheet.call(d);
    submits[4]({ password: '', allowSelectLocked: true });
    expect(sheet.options.isProtected).toBe(true);
    expect(sheet.hasPassword()).toBe(false);
  });
});
