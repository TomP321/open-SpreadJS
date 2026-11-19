/* Dialog openers for sheet-level commands: Protect Sheet / Workbook (and the
 * Unprotect dialogs), Focus Cell toggles, Zoom-to-selection, Move or Copy
 * Sheet, Unhide Sheet, Row Height / Column Width and the Spread / Sheet
 * Settings dialogs with their companion managers. The class methods are thin
 * wrappers around these functions. */
import type { DesignerApi as Designer } from './designer-api.js';
import { TemplateNames } from './names-generated.js';
import { activeRanges, activeSheet, topCell } from './commands/actions.js';
import { internals } from './core-internals.js';
import {
  applySettings, namedPatternEdits, readSettings, settingsTabForCommand, sheetSettingTabs, spreadSettingTabs,
  userCustomLists, workbookSettingsOwner, worksheetSettingsOwner, type SettingValue,
} from './settings-model.js';

/** Official Protect Sheet dialog: 18 permission checkboxes plus an optional password. */
export function showProtectSheet(d: Designer): void {
  d.showDialog(TemplateNames.ProtectSheetDialogTemplate ?? 'protectSheetDialogTemplate', {
    password: '',
    allowSelectLockedCells: true, allowSelectUnlockedCells: true,
    formatCells: false, allowSort: false, allowFilter: false,
    allowResizeRows: false, allowResizeColumns: false, allowUsePivotTable: false,
    allowEditObjects: false, allowEditScenarios: false,
    allowDragInsertRows: false, allowDragInsertColumns: false,
    allowInsertRows: false, allowInsertColumns: false,
    allowDeleteRows: false, allowDeleteColumns: false,
    formatRows: false, formatColumns: false,
  }, (data) => {
    const password = String(data.password ?? '');
    if (password) {
      d.showConfirmPassword((confirmed) => {
        if (confirmed === null) return;
        if (confirmed !== password) {
          d.showMessageBox('Confirmation password is not identical.', 'SpreadJS Designer', 3);
          return;
        }
        applySheetProtection(d, data, password);
      });
      return;
    }
    applySheetProtection(d, data, '');
  });
}
function applySheetProtection(d: Designer, data: Record<string, unknown>, password: string): void {
  const sheet = activeSheet(d);
  sheet.protect(password);
  const options = sheet.options.protectionOptions as Record<string, unknown>;
  for (const key of ['allowSelectLockedCells', 'allowSelectUnlockedCells', 'formatCells', 'allowSort', 'allowFilter',
    'allowResizeRows', 'allowResizeColumns', 'allowUsePivotTable', 'allowEditObjects', 'allowEditScenarios',
    'allowDragInsertRows', 'allowDragInsertColumns', 'allowInsertRows', 'allowInsertColumns',
    'allowDeleteRows', 'allowDeleteColumns', 'formatRows', 'formatColumns'])
    options[key] = !!data[key];
  d.invalidate();
}
/** Official "Confirm Password" companion dialog; callback receives null on cancel. */
export function showConfirmPassword(d: Designer, done: (password: string | null) => void): void {
  d.showDialog(TemplateNames.ConfirmPasswordDialogTemplate ?? 'confirmPasswordDialogTemplate', { password: '' },
    (data) => done(String(data.password ?? '')),
    (error) => { if ((error as Error)?.message === 'Cancelled') done(null); });
}
/** Official Unprotect Sheet dialog: prompts for the password and reports mismatches. */
export function showUnprotectSheet(d: Designer): void {
  const sheet = activeSheet(d);
  d.showDialog(TemplateNames.UnprotectSheetDialogTemplate ?? 'unprotectSheetDialogTemplate', { password: '' }, (data) => {
    if (sheet.unprotect(String(data.password ?? ''))) { d.invalidate(); return; }
    d.showMessageBox('The password you supplied is not correct. Verify that the CAPS LOCK key is off and be sure to use the correct capitalization.', 'SpreadJS Designer', 3);
  });
}
/**
 * Workbook structure protection. The interop trial exposes no ribbon entry for
 * this, so the enforcement is designer-scoped: while active the sheet tab
 * operations (insert/delete/rename/move/hide) are blocked until unprotect.
 */
export function showProtectWorkbook(d: Designer): void {
  if (d._structureProtection.protected) {
    d.showDialog('protectWorkbookDialog', { password: '', structure: true, windows: false }, (data) => {
      if (String(data.password ?? '') !== d._structureProtection.password) {
        d.showMessageBox('The password you supplied is not correct. Verify that the CAPS LOCK key is off and be sure to use the correct capitalization.', 'SpreadJS Designer', 3);
        return;
      }
      d._structureProtection = { protected: false, password: '' };
      d.invalidate();
    });
    return;
  }
  d.showDialog('protectWorkbookDialog', { password: '', structure: true, windows: false }, (data) => {
    d._structureProtection = { protected: data.structure !== false || data.windows === true, password: String(data.password ?? '') };
    d.invalidate();
  });
}
/** Toggle the workbook-level Focus Cell highlight (active row/column tint). */
export function toggleFocusCell(d: Designer): void {
  const focus = (d.getWorkbook().options.focusCell ?? {}) as { enabled?: boolean; color?: string; opacity?: number };
  d.getWorkbook().options.focusCell = { ...focus, enabled: !focus.enabled };
  d._focusCell = !!d.getWorkbook().options.focusCell.enabled;
  d.invalidate();
}
/** Set the Focus Cell tint colour (implies enabling the highlight). */
export function applyFocusCellColor(d: Designer, color: string): void {
  const focus = (d.getWorkbook().options.focusCell ?? {}) as { enabled?: boolean; color?: string; opacity?: number };
  d.getWorkbook().options.focusCell = { ...focus, enabled: true, color };
  d._focusCell = true;
  d.invalidate();
}
export function zoomToSelection(d: Designer): void {
  const sheet = activeSheet(d);
  const range = activeRanges(sheet)[0];
  const viewportWidth = sheet.getViewportWidth(1);
  const viewportHeight = sheet.getViewportHeight(1);
  if (!range || !viewportWidth || !viewportHeight) return;
  let width = 0, height = 0;
  for (let c = range.col; c < range.col + Math.max(1, range.colCount); c++) width += sheet.getColumnWidth(c) ?? 0;
  for (let r = range.row; r < range.row + Math.max(1, range.rowCount); r++) height += sheet.getRowHeight(r) ?? 0;
  if (width <= 0 || height <= 0) return;
  // The trial measures the selection inside the full canvas, headers included:
  // zoom = canvasWidth / (selectionWidth + rowHeaderWidth) (and the vertical twin).
  const headerWidth = (sheet.options.rowHeaderVisible ?? true) ? sheet.defaults.rowHeaderColWidth as number : 0;
  const headerHeight = (sheet.options.colHeaderVisible ?? true) ? sheet.defaults.colHeaderRowHeight as number : 0;
  const zoom = Math.min((viewportWidth + headerWidth) / (width + headerWidth), (viewportHeight + headerHeight) / (height + headerHeight));
  sheet.zoom(Math.min(4, Math.max(0.25, zoom)));
}
export function showMoveOrCopySheet(d: Designer): void {
  if (!d.ensureStructureEditable()) return;
  const workbook = d.getWorkbook();
  const sheet = workbook.getActiveSheet();
  const names = workbook.sheets.map((candidate) => candidate.name());
  d.showDialog('moveOrCopySheetDialog', { names, before: sheet.name(), copy: false }, (data) => {
    const source = workbook.getSheetIndex(sheet.name());
    let target = data.before === '(move to end)' ? workbook.getSheetCount() : workbook.getSheetIndex(String(data.before));
    if (target < 0 || source < 0) return;
    if (data.copy) {
      let suffix = 2;
      while (workbook.getSheetFromName(`${sheet.name()} (${suffix})`)) suffix++;
      const name = `${sheet.name()} (${suffix})`;
      const copy = new d.gc.Spread.Sheets.Worksheet(name);
      copy.fromJSON(sheet.toJSON());
      copy.name(name);
      workbook.addSheet(target, copy);
      workbook.setActiveSheetIndex(target);
    } else if (target !== source && target !== source + 1) {
      workbook.removeSheet(source);
      if (target > source) target--;
      workbook.addSheet(target, sheet);
      workbook.setActiveSheetIndex(target);
    }
    d.invalidate();
  });
}

export function showUnhideSheet(d: Designer): void {
  if (!d.ensureStructureEditable()) return;
  const workbook = d.getWorkbook();
  const names = workbook.sheets.filter((sheet) => !sheet.visible()).map((sheet) => sheet.name());
  if (!names.length) return;
  d.showDialog(TemplateNames.UnhideSheetTemplate, { names, selected: [names[0]] }, (data) => {
    for (const name of data.selected as string[]) {
      const sheet = workbook.sheets.find((candidate) => candidate.name() === name);
      if (sheet && !sheet.visible()) sheet.visible(true);
    }
    d.invalidate();
  });
}

export function showDimensionDialog(d: Designer, axis: 'row' | 'column'): void {
  const sheet = activeSheet(d);
  const range = activeRanges(sheet)[0];
  const index = Math.max(0, axis === 'row' ? range.row : range.col);
  const size = axis === 'row' ? sheet.getRowHeight(index) : sheet.getColumnWidth(index);
  const template = axis === 'row' ? TemplateNames.RowHeightDialogTemplate : TemplateNames.ColumnWidthDialogTemplate;
  d.showDialog(template, { size }, (data) => {
    const value = Number(data.size);
    if (String(data.size).trim() && Number.isFinite(value) && value >= 0) d.runUndoable('setDimensionSize', { axis, value });
  });
}
/**
 * TASK 68: the trial's `defaultRowHeight` / `defaultColumnWidth` commands open the
 * small "Standard Height" / "Standard Width" dialog; OK writes the sheet default
 * through the public `setRowHeight(-1)` / `setColumnWidth(-1)` API.
 */
export function showDefaultDimensionDialog(d: Designer, axis: 'row' | 'column'): void {
  const sheet = activeSheet(d);
  const size = axis === 'row' ? internals(sheet).getDefaultRowHeight() : Number(sheet.defaults?.colWidth ?? 90);
  const template = axis === 'row'
    ? TemplateNames.DefaultRowHeightDialogTemplate ?? 'defaultRowHeightDialogTemplate'
    : TemplateNames.DefaultColumnWidthDialogTemplate ?? 'defaultColumnWidthDialogTemplate';
  d.showDialog(template, { size }, (data) => {
    const value = Number(data.size);
    if (!String(data.size).trim() || !Number.isFinite(value) || value <= 0) return;
    d.runUndoable('setDefaultDimensionSize', { axis, value });
  });
}
/**
 * Opens the Spread Settings dialog. Every ribbon button of the group opens the
 * same window, each on its own tab (observed in the trial), and like the trial
 * nothing reaches the workbook until OK.
 */
export function showSettings(d: Designer, command: string): void {
  const workbook = d.getWorkbook();
  const inputMask = d.gc.Spread.Sheets.InputMask;
  const patterns: { name: string; pattern: string }[] = (inputMask?.getNamedPatterns?.() ?? []).map((entry) => ({ name: String(entry.name), pattern: String(entry.pattern ?? '') }));
  d._settingsBefore = readSettings(workbookSettingsOwner(workbook), spreadSettingTabs);
  d.showDialog(TemplateNames.SpreadSettingDialogTemplate ?? 'spreadSettingDialogTemplate', {
    kind: 'spread',
    command,
    tabOption: settingsTabForCommand[command] ?? 'general',
    values: { ...d._settingsBefore },
    customLists: userCustomLists(workbook).map((items) => [...items]),
    patterns,
  }, (data) => {
    applySettings(workbookSettingsOwner(workbook), d._settingsBefore ?? {}, (data.values ?? {}) as Record<string, SettingValue>);
    d._settingsBefore = null;
    // Custom lists and named patterns are workbook-wide settings too, so the
    // trial's OK button commits them together with the options.
    if (Array.isArray(data.customLists)) workbook.options.customList = (data.customLists as string[][]).map((items) => [...items]);
    for (const edit of namedPatternEdits(patterns, (data.patterns ?? patterns) as { name: string; pattern: string }[])) {
      inputMask?.namedPattern?.(edit.name, edit.pattern);
    }
    d.invalidate();
  });
}
/** Opens the Sheet Settings dialog for the active sheet. */
export function showSheetSettings(d: Designer, command: string): void {
  const sheet = activeSheet(d);
  d._settingsBefore = readSettings(worksheetSettingsOwner(sheet), sheetSettingTabs);
  d.showDialog(TemplateNames.SheetSettingDialogTemplate ?? 'sheetSettingDialogTemplate', {
    kind: 'sheet',
    command,
    tabOption: settingsTabForCommand[command] ?? 'general',
    values: { ...d._settingsBefore },
  }, (data) => {
    applySettings(worksheetSettingsOwner(sheet), d._settingsBefore ?? {}, (data.values ?? {}) as Record<string, SettingValue>);
    d._settingsBefore = null;
    d.invalidate();
  });
}
/** `Manage Icons` on the General tab: the workbook's built-in file icons. */
export function showBuiltInFileIcons(d: Designer): void {
  const workbook = d.getWorkbook();
  const icons = { ...((workbook.options?.builtInFileIcons ?? {}) as Record<string, string>) };
  d.showDialog(TemplateNames.BuiltInFileIconsDialogTemplate ?? 'BuiltInFileIconsDialogTemplate', { icons }, (data) => {
    workbook.options.builtInFileIcons = { ...((data.icons ?? {}) as Record<string, string>) };
    d.invalidate();
  });
}
/** `Manage Style`: the sheet-tab state styles of the workbook. */
export function showTabStyleSettings(d: Designer): void {
  const workbook = d.getWorkbook();
  const styles = { ...((workbook.options?.defaultSheetTabStyles ?? {}) as Record<string, unknown>) };
  d.showDialog(TemplateNames.TabStyleSettingDialogTemplate ?? 'TabStyleSettingDialogTemplate', { styles }, (data) => {
    workbook.options.defaultSheetTabStyles = { ...((data.styles ?? {}) as Record<string, unknown>) };
    d.invalidate();
  });
}
/** Format Comment... dialog for the legacy comment at the active cell. */
export function showFormatComment(d: Designer): void {
  const sheet = activeSheet(d);
  const { row, col } = topCell(sheet);
  const existing = sheet.comments.get(row, col);
  d.showDialog(TemplateNames.FormatCommentDialogTemplate ?? 'formatCommentDialogTemplate', { text: existing?.text() ?? '', author: 'Author' }, (data) => {
    sheet.comments.add(row, col, String(data.text ?? ''));
    d.invalidate();
  });
}
/** Sheet Background: opens the native file picker and stores the image URL. */
export function pickWorksheetBackground(d: Designer): void {
  const sheet = activeSheet(d);
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.style.display = 'none';
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    input.remove();
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const option = internals(sheet).getBackgroundImageInfo().option;
      sheet.backgroundImage(String(reader.result ?? ''), { layout: option.layout, paintOrder: option.paintOrder });
      d.invalidate();
    };
    reader.readAsDataURL(file);
  });
  document.body.appendChild(input);
  input.click();
}

/** Returns false (and explains why) while structure protection blocks sheet lifecycle edits. */
export function ensureStructureEditable(d: Designer): boolean {
  if (!d._structureProtection?.protected) return true;
  d.showMessageBox('The workbook structure is protected. Unprotect the workbook to add, delete, rename, move or hide sheets.', 'SpreadJS Designer', 2);
  return false;
}
