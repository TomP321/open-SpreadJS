/* Dialog openers for sheet-level commands: Protect Sheet / Workbook (and the
 * Unprotect dialogs), Focus Cell toggles, Zoom-to-selection, Move or Copy
 * Sheet, Unhide Sheet, Row Height / Column Width and the Spread / Sheet
 * Settings dialogs with their companion managers. The class methods are thin
 * wrappers around these functions. */
import type { DesignerApi as Designer } from './designer-api.js';
import { TemplateNames } from './names-generated.js';
import { activeRanges, activeSheet, topCell } from './commands/actions.js';
import { cellTypesNamespace, internals } from './core-internals.js';
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
/* TASK 75 (trial sweep): Clear Cell Type / Clear Cell Dropdowns write the cleared
 * defaults onto every cell of the selection (`cellType: null` / `cellButtons: []`). */
export function clearSelectionCellType(d: Designer): void {
  const sheet = activeSheet(d);
  for (const range of activeRanges(sheet))
    for (let row = range.row; row < range.row + Math.max(1, range.rowCount); row++)
      for (let col = range.col; col < range.col + Math.max(1, range.colCount); col++)
        internals(sheet)._setStyleProperty(row, col, 'cellType', null);
  d.invalidate();
}
/** Gallery names of the Cell Types dropdown that map to a core cell type (the rest of the
 * trial's gallery lives in the cell-editors add-in). */
const GALLERY_CELL_TYPES: Record<string, string> = {
  checkboxCellType: 'CheckBox', ribbonButtonButtonCellType: 'Button', comboBoxCellType: 'ComboBox',
  hyperlinkCellType: 'HyperLink', fileUploadCellType: 'FileName',
};
/** Ribbon path of the Cell Types gallery (TASK 75): inserts the type over the selection;
 * types from the cell-editors add-in keep the M6b notice. */
export function applySelectionCellType(d: Designer, commandName: string): void {
  const className = GALLERY_CELL_TYPES[commandName];
  const cellTypes = cellTypesNamespace(d.gc);
  const CellTypeCtor = className ? cellTypes[className] : undefined;
  if (typeof CellTypeCtor !== 'function') {
    d.showMessageBox(`NotImplemented: ${commandName} requires the cell editors add-in.`, 'SpreadJS Designer', 1);
    return;
  }
  const sheet = activeSheet(d);
  for (const range of activeRanges(sheet))
    for (let row = range.row; row < range.row + Math.max(1, range.rowCount); row++)
      for (let col = range.col; col < range.col + Math.max(1, range.colCount); col++)
        internals(sheet)._setStyleProperty(row, col, 'cellType', new CellTypeCtor());
  d.invalidate();
}
export function clearSelectionCellDropdown(d: Designer): void {
  const sheet = activeSheet(d);
  for (const range of activeRanges(sheet))
    for (let row = range.row; row < range.row + Math.max(1, range.rowCount); row++)
      for (let col = range.col; col < range.col + Math.max(1, range.colCount); col++)
        internals(sheet)._setStyleProperty(row, col, 'cellButtons', []);
  d.invalidate();
}
/** Toggle the workbook-level Focus Cell highlight (active row/column tint). */
export function toggleFocusCell(d: Designer): void {  const focus = (d.getWorkbook().options.focusCell ?? {}) as { enabled?: boolean; color?: string; opacity?: number };
  // Trial (TASK 75 probe): enabling serialises the default green colour explicitly.
  const next = { ...focus, enabled: !focus.enabled };
  if (next.enabled && next.color === undefined) next.color = '#00b050';
  d.getWorkbook().options.focusCell = next;
  d._focusCell = !!next.enabled;
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
  if (!range) return;
  let width = 0, height = 0;
  for (let c = range.col; c < range.col + Math.max(1, range.colCount); c++) width += sheet.getColumnWidth(c) ?? 0;
  for (let r = range.row; r < range.row + Math.max(1, range.rowCount); r++) height += sheet.getRowHeight(r) ?? 0;
  if (width <= 0 || height <= 0) return;
  // Trial (TASK 75 r3, four-viewport probe): fit the whole selection into the viewport
  // plus headers: z = min((vw+40)/(W+40), (vh+20)/(H+20)), clamped to [0.1, 4].
  // `vw`/`vh` are the viewport rects *without* the row-/column-header strips; the
  // constants 40/20 add the header strips back (both sides' header sizes).
  let vw = sheet.getViewportWidth(1), vh = sheet.getViewportHeight(1);
  if (!(vw > 0) || !(vh > 0)) {
    // Narrow/headless hosts can report non-positive rects; fall back to the raw canvas
    // rect (which already includes the header strips the constants below would add).
    const view = internals(sheet)._view?.();
    if (view?.viewWidth && view.viewWidth > 0) vw = view.viewWidth - (view.headerWidth ?? 0);
    if (view?.viewHeight && view.viewHeight > 0) vh = view.viewHeight - (view.headerHeight ?? 0);
    if (!(vw > 0) || !(vh > 0)) return;
  }
  const zoom = Math.min((vw + 40) / (width + 40), (vh + 20) / (height + 20));
  // Trial (TASK 75 r4): the fitted factor is kept at 12 significant digits (its JSON shows
  // 3.76829268293 for a 2x2 selection, not the full double).
  sheet.zoom(Number(Math.min(4, Math.max(0.1, zoom)).toPrecision(12)));
  // The trial also scrolls the selection to the viewport origin (leftCell/topCell = selection start).
  sheet.showCell(range.row, range.col, 0, 0);
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
