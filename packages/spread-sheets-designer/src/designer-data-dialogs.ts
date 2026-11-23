/* Dialog openers for the Data / Formulas / Names commands: Insert Table,
 * Hyperlink, Insert Function + Function Arguments, Name Manager + New Name,
 * Data Validation, Sort, Remove Duplicates, Text to Columns, Subtotal,
 * Auto Outline, Circle Invalid Data, Goal Seek and Zoom. The class methods
 * are thin wrappers around these functions. */
import type { DesignerApi as Designer, DialogData } from './designer-api.js';
import { pivotTablesOf, recordView, slicerWriter } from './core-internals.js';
import { TemplateNames } from './names-generated.js';
import { activeRanges, activeSheet, topCell } from './commands/actions.js';
import { duplicateDataFromSelection, sortDataFromSelection, subtotalDataFromSelection, textToColumnsDataFromSelection } from './dialogs/DataDialogs.js';
import { currentRegion, sheetHasOutlines, type Bounds, type SortLevel } from './data-engine.js';
import { definedNames, deleteDefinedName, saveDefinedName, validateDefinedName } from './defined-names.js';
import { allCategory, formulaFromArguments, functionParameters } from './function-library.js';
import { applySelection, applySeriesFill, computeSpecialSelection, gotoNameItems, resolveReference } from './dialogs/GoToDialogs.js';
import { validationDefaults } from './dialogs/extra-templates.js';
import { messageText , resolveText} from './resolve.js';

function columnName(col: number): string {
  let out = '';
  for (let n = col + 1; n > 0; n = Math.floor((n - 1) / 26)) out = String.fromCharCode(65 + ((n - 1) % 26)) + out;
  return out;
}
function columnIndexOf(label: string): number {
  let col = 0;
  for (const ch of label.toUpperCase()) col = col * 26 + ch.charCodeAt(0) - 64;
  return col - 1;
}

/**
 * TASK 68: like the trial, `insertTable` opens the small "Create Table" dialog:
 * a single-cell selection expands to the current region, the range is shown in
 * absolute A1 style and the header row is detected from the data.
 */
export function showInsertTable(d: Designer): void {
  const sheet = activeSheet(d);
  const range = activeRanges(sheet)[0];
  const bounds = { row: Math.max(0, range?.row ?? 0), col: Math.max(0, range?.col ?? 0), rowCount: Math.max(1, range?.rowCount ?? 1), colCount: Math.max(1, range?.colCount ?? 1) };
  const region = bounds.rowCount === 1 && bounds.colCount === 1 ? currentRegion(sheet, bounds) : bounds;
  const endCol = region.col + Math.max(1, region.colCount) - 1;
  const endRow = region.row + Math.max(1, region.rowCount) - 1;
  const reference = `$${columnName(region.col)}$${region.row + 1}:$${columnName(endCol)}$${endRow + 1}`;
  const headers: string[] = [];
  const cc = Math.max(1, region.colCount);
  let hasHeaders = true;
  for (let i = 0; i < cc; i++) { const value = sheet.getValue(region.row, region.col + i); if (typeof value !== 'string') { hasHeaders = false; break; } }
  for (let i = 0; i < cc; i++) headers.push(hasHeaders ? String(sheet.getValue(region.row, region.col + i) ?? `Column${i + 1}`) : `Column${i + 1}`);
  d.showDialog(TemplateNames.InsertTableDialogTemplate ?? 'insertTableDialogTemplate', { range: reference, hasHeaders, headers: headers.join(', '), tableStyle: 'medium2' },
    (data) => d.runUndoable('applyTable', { data }), (error) => { if ((error as Error)?.message !== 'Cancelled') d.showMessageBox(String(error), messageText(d, 'createTable', 'Create Table'), 3); });
}
export function showHyperlink(d: Designer): void {
  const sheet = activeSheet(d);
  const { row, col } = topCell(sheet);
  const current = sheet.getHyperlink(row, col);
  const targets = ['blank', 'self', 'parent', 'top'];
  d.showDialog(TemplateNames.HyperlinkDialogTemplate ?? 'hyperlinkDialogTemplate', {
    text: String(sheet.getText(row, col) ?? ''), address: String(current?.url ?? ''), tooltip: String(current?.tooltip ?? ''),
    target: targets[Number(current?.target ?? 0)] ?? 'blank', linkColor: String(current?.linkColor ?? '#0563c1'), visitedLinkColor: String(current?.visitedLinkColor ?? '#954f72'),
    reference: '', email: '', subject: '', remove: false,
  },
    (data) => d.runUndoable('applyHyperlink', { data }), (error) => { if ((error as Error)?.message !== 'Cancelled') d.showMessageBox(String(error), messageText(d, 'hyperlink', 'Hyperlink'), 3); });
}
/** Formulas ▸ Insert Function: search, category gallery and function gallery. */
export function showInsertFunction(d: Designer): void {
  d.showDialog(TemplateNames.InsertFunctionDialogTemplate ?? 'insertFunctionDialogTemplate', { category: allCategory, search: '', function: 'ABS' },
    (data) => d.openFunctionArguments(String(data.function ?? 'ABS')));
}
/**
 * Opens the Function Arguments dialog (the trial's `moreFunctionDialogTemplate`)
 * for one function. It is reached from Insert Function and straight from a
 * Formulas tab gallery, and OK writes the formula into the active cell.
 */
export function openFunctionArguments(d: Designer, name: string): void {
  const parameters = functionParameters(name);
  d.showDialog(TemplateNames.MoreFunctionDialogTemplate ?? 'moreFunctionDialogTemplate',
    { function: name, args: parameters.map(() => '') },
    (data) => {
      const formula = formulaFromArguments(name, Array.isArray(data.args) ? data.args.map(String) : []);
      d.insertFormula(formula);
    });
}
/** Writes a finished formula into the active cell through the undoable editor. */
export function insertFormula(d: Designer, formula: string): void {
  const sheet = activeSheet(d);
  const { row, col } = topCell(sheet);
  const text = formula.startsWith('=') ? formula : `=${formula}`;
  d._rangePick = null;
  d.runUndoable('editCell', { row, col, value: text });
  d.invalidate();
}
/** Name Manager: the names grid, the trial's filters and its toolbar. */
export function showNameManager(d: Designer): void {
  const items = definedNames(d.getWorkbook());
  d.showDialog(TemplateNames.NameManagerDialogTemplate ?? 'nameManagerDialogTemplate',
    { names: items, selected: items[0]?.id ?? '', filter: '', sort: { key: 'name', direction: 1 } }, () => undefined);
}
/** Go To (Find & Select): names list + reference editor; OK selects the range. */
export function showGoTo(d: Designer): void {
  d.showDialog(TemplateNames.GotoDialogTemplate ?? 'gotoDialogTemplate',
    { names: gotoNameItems(d), reference: '' },
    (data) => {
      const reference = String(data.reference ?? '').trim();
      if (!reference) return;
      const resolved = resolveReference(d, reference);
      if (!resolved) {
        d.showMessageBox(messageText(d, 'invalidReference', 'The reference is not valid.'), messageText(d, 'goTo', 'Go To'), 3);
        return;
      }
      resolved.sheet.setActiveCell(resolved.bounds.row, resolved.bounds.col);
      applySelection(d, resolved.sheet, [resolved.bounds], resolved.bounds);
      if (resolved.name) d.setNameBoxSelection(resolved.name, resolved.bounds.row, resolved.bounds.col);
      d.invalidate();
    });
}
/** Go To Special: the trial's `Select` groups; OK applies the computed selection. */
export function showGoToSpecial(d: Designer): void {
  d.showDialog(TemplateNames.GotoSpecialDialogTemplate ?? 'gotoSpecialDialogTemplate',
    { option: 'notes', numbers: true, text: true, logicals: true, errors: true },
    (data) => {
      const result = computeSpecialSelection(d, data as never);
      if (!result) {
        d.showMessageBox(messageText(d, 'noCellsFound', 'No cells were found.'), 'SpreadJS Designer', 2);
        return;
      }
      const sheet = activeSheet(d);
      if (result.ranges.length) applySelection(d, sheet, result.ranges, result.active);
      d.invalidate();
    });
}
/** Series (Home > Fill): fills the selection through the core's `fillAuto`. */
export function showSeries(d: Designer): void {
  const sheet = activeSheet(d);
  const selection = activeRanges(sheet)[0] ?? { row: sheet.getActiveRowIndex(), col: sheet.getActiveColumnIndex(), rowCount: 1, colCount: 1 };
  const scope: Bounds = {
    row: Math.max(0, selection.row), col: Math.max(0, selection.col),
    rowCount: selection.rowCount < 0 ? sheet.getRowCount() - selection.row : Math.max(1, selection.rowCount),
    colCount: selection.colCount < 0 ? sheet.getColumnCount() - selection.col : Math.max(1, selection.colCount),
  };
  // The trial remembers the last dialog options instead of re-deriving them from the new selection.
  const previous = d._seriesSettings;
  d.showDialog(TemplateNames.FillSeriesDialogTemplate ?? 'fillSeriesDialogTemplate',
    {
      seriesIn: previous?.seriesIn ?? (scope.rowCount >= scope.colCount ? 'columns' : 'rows'),
      type: previous?.type ?? 'linear',
      unit: previous?.unit ?? 'day',
      trend: previous?.trend ?? false,
      step: previous?.step ?? '1',
      stop: previous?.stop ?? '',
    },
    (data) => {
      const options = {
        seriesIn: String(data.seriesIn ?? 'columns'),
        type: String(data.type ?? 'linear'),
        unit: String(data.unit ?? 'day'),
        trend: data.trend === true,
        step: String(data.step ?? '1'),
        stop: String(data.stop ?? ''),
      };
      d._seriesSettings = options;
      applySeriesFill(d.gc, sheet, scope, options);
      d.invalidate();
    });
}
export function showNewName(d: Designer, previousId?: string): void {
  const wb = d.getWorkbook(), sheet = activeSheet(d), { row, col } = topCell(sheet);
  // Opened from the Name Manager: the trial returns to that dialog afterwards.
  const returnToManager = d.dialog?.name === (TemplateNames.NameManagerDialogTemplate ?? 'nameManagerDialogTemplate');
  const previous = definedNames(wb).find((item) => item.id === previousId);
  const scopes = [{ text: resolveText('${res.findDialog.workBook}', d.resources) || 'Workbook', value: 'Workbook' }, ...Array.from({ length: wb.getSheetCount() }, (_, i) => ({ text: wb.getSheet(i).name(), value: wb.getSheet(i).name() }))];
  const sheetReference = /^[A-Za-z_][\w.]*$/.test(sheet.name()) ? sheet.name() : `'${sheet.name().replace(/'/g, "''")}'`;
  d.showDialog(TemplateNames.NewNameTemplate ?? 'newNameTemplate', {
    name: previous?.name ?? '', refersTo: previous?.refersTo ?? `=${sheetReference}!$${columnName(col)}$${row + 1}`,
    comment: previous?.comment ?? '', scope: previous?.scope ?? 'Workbook', scopes,
  }, (data) => { saveDefinedName(wb, data, previousId); if (returnToManager) showNameManager(d); else d.invalidate(); },
  (error) => { if ((error as Error)?.message === 'Cancelled') { if (returnToManager) showNameManager(d); } else d.showMessageBox(String((error as Error)?.message ?? error), previous ? messageText(d, 'editNameTitle', 'Edit Name') : messageText(d, 'newNameTitle', 'New Name'), 3); },
  (data) => {
    try { validateDefinedName(wb, data, previousId); return true; }
    catch (error) { d.showMessageBox(String((error as Error)?.message ?? error), previous ? messageText(d, 'editNameTitle', 'Edit Name') : messageText(d, 'newNameTitle', 'New Name'), 3); return false; }
  });
}
export function deleteName(d: Designer, id: string): void {
  deleteDefinedName(d.getWorkbook(), id);
  showNameManager(d);
}
/**
 * The trial confirms before removing a name: a message box with the name in
 * the sentence. Deleting does not create an undo unit there, so neither do we.
 */
export function confirmDeleteName(d: Designer, id: string): void {
  const entry = definedNames(d.getWorkbook()).find((item) => item.id === id);
  if (!entry) return;
  d.showMessageBox(messageText(d, 'deleteNameConfirm', 'Are you sure you want to delete the name {0}?', [entry.name]), 'SpreadJS Designer', 1, (result: number) => {
    if (result === 1 || result === 2) deleteName(d, id);
  });
}
export function showDataValidation(d: Designer): void {
  const sheet = activeSheet(d), { row, col } = topCell(sheet);
  const validator = sheet.getDataValidator(row, col);
  const data: Record<string, unknown> = { ...validationDefaults };
  if (validator) {
    const types = recordView(d.gc.Spread.Sheets.DataValidation.CriteriaType);
    const labels: Record<string, string> = { wholeNumber: 'Whole number', decimalValues: 'Decimal', list: 'List', date: 'Date', time: 'Time', textLength: 'Text length', custom: 'Custom' };
    data.validationType = Object.entries(labels).find(([key]) => types[key] === validator.type())?.[1] ?? 'Any value';
    data.operator = validator.comparisonOperator(); data.source = validator.value1(row, col) ?? ''; data.formula2 = validator.value2(row, col) ?? '';
    // Every option key below is a contract getter on the validator; read them through this typed table.
    const optionGetters: Record<string, () => unknown> = {
      ignoreBlank: () => validator.ignoreBlank(), inCellDropdown: () => validator.inCellDropdown(),
      showErrorMessage: () => validator.showErrorMessage(), showInputMessage: () => validator.showInputMessage(),
      errorTitle: () => validator.errorTitle(), errorMessage: () => validator.errorMessage(),
      inputTitle: () => validator.inputTitle(), inputMessage: () => validator.inputMessage(),
      errorStyle: () => validator.errorStyle(),
    };
    for (const key of Object.keys(optionGetters)) data[key] = optionGetters[key]();
    const highlight = validator.highlightStyle();
    if (highlight && typeof highlight === 'object') {
      data.highlightType = highlight.type ?? 0;
      data.highlightColor = highlight.color ?? 'red';
      data.highlightPosition = highlight.position ?? 4;
      data.highlightImage = highlight.image ?? '';
    }
  }
  d.showDialog(TemplateNames.DataValidationDialogTemplate ?? 'dataValidationDialogTemplate', data,
    (data) => d.runUndoable('applyDataValidation', { data }), (error) => { if ((error as Error)?.message !== 'Cancelled') d.showMessageBox(String(error), messageText(d, 'dataValidation', 'Data Validation'), 3); });
}
/** Custom Sort dialog. The trial keeps the level list for the whole session. */
export function showSort(d: Designer): void {
  const data = sortDataFromSelection(d, d._sortSettings);
  d.showDialog(TemplateNames.CustomSortDialogTemplate ?? 'customSortDialogTemplate', data,
    (submitted) => {
      d._sortSettings = { levels: submitted.levels as SortLevel[], hasHeaders: submitted.hasHeaders as boolean, byRows: submitted.byRows as boolean };
      d.runUndoable('applySort', { data: submitted });
    }, (error) => { if ((error as Error)?.message !== 'Cancelled') d.showMessageBox(String(error), messageText(d, 'sort', 'Sort'), 3); });
}
export function showRemoveDuplicates(d: Designer): void {
  const data = duplicateDataFromSelection(d);
  d.showDialog(TemplateNames.RemoveDuplicatesTemplate ?? 'removeDuplicatesTemplate', data, (submitted) => {
    const args: DialogData = { data: submitted, result: null };
    d.runUndoable('removeDuplicatesApply', args);
    const result = args.result as { removed: number; unique: number } | null;
    if (!result) {
      d.showMessageBox(messageText(d, 'removeDuplicatesOutline', 'You cannot remove duplicate information when the range has an outline. To remove duplicates, clear the outline and perform the remove duplicates operation again.'), 'SpreadJS Designer', 2);
      return;
    }
    d.showMessageBox(result.removed
      ? `${result.removed} duplicate values found and removed; ${result.unique} unique values remain.`
      : 'No duplicate values found.', 'SpreadJS Designer', 1);
  });
}
export function showTextToColumns(d: Designer): void {
  const data = textToColumnsDataFromSelection(d);
  const run = (submitted: DialogData): void => {
    const args: DialogData = { data: submitted };
    d.runUndoable('splitTextToColumns', args);
    if (args.needsReplace) {
      // The trial warns before overwriting live cells outside the source range.
      d.showMessageBox(messageText(d, 'replaceDataConfirm', "There's already data here. Do you want to replace it?"), 'SpreadJS Designer', 2, () => {
        d.runUndoable('splitTextToColumns', { data: { ...submitted, confirmed: true } });
      });
    }
  };
  d.showDialog(TemplateNames.TextToColumnDialogWizardStep1Template ?? 'textToColumnDialogWizardStep1Template', data,
    run, (error) => { if ((error as Error)?.message !== 'Cancelled') d.showMessageBox(String(error), messageText(d, 'textToColumns', 'Text to Columns'), 3); });
}
export function showSubtotal(d: Designer): void {
  const data = subtotalDataFromSelection(d);
  d.showDialog(TemplateNames.SubTotalDialogTemplate ?? 'subTotalDialogTemplate', data,
    (submitted) => d.runUndoable('applySubtotal', { data: submitted }),
    (error) => { if ((error as Error)?.message !== 'Cancelled') d.showMessageBox(String(error), messageText(d, 'subtotal', 'Subtotal'), 3); });
}
/** The Subtotal dialog's Remove button: strip subtotal rows and outlines. */
export function removeSubtotalsNow(d: Designer, data?: DialogData): void {
  void data;
  d.runUndoable('removeSubtotals', {});
}
/** Group ▸ Auto Outline; the trial asks before touching an existing outline. */
export function showAutoOutline(d: Designer): void {
  const sheet = activeSheet(d);
  const run = (): void => {
    const selection = activeRanges(sheet)[0];
    const bounds = { row: Math.max(0, selection.row), col: Math.max(0, selection.col), rowCount: selection.rowCount < 0 ? sheet.getRowCount() - selection.row : Math.max(1, selection.rowCount), colCount: selection.colCount < 0 ? sheet.getColumnCount() - selection.col : Math.max(1, selection.colCount) };
    const region = bounds.rowCount === 1 && bounds.colCount === 1 ? currentRegion(sheet, bounds) : bounds;
    d.runUndoable('autoOutlineApply', { data: { region } });
  };
  if (sheetHasOutlines(sheet)) d.showMessageBox(messageText(d, 'modifyOutline', 'Modify existing outline?'), 'SpreadJS Designer', 2, () => run());
  else run();
}
/** Data Validation ▸ Circle Invalid Data / Clear Validation Circles. */
export function showCircleInvalidData(d: Designer): void {
  d.runUndoable('circleInvalidData', {});
}
export function showClearInvalidCircles(d: Designer): void {
  d.runUndoable('clearInvalidCircles', {});
}
export function showGoalSeek(d: Designer): void {
  const sheet = activeSheet(d);
  const { row, col } = topCell(sheet);
  d.showDialog(TemplateNames.GoalSeekDialogTemplate ?? 'GoalSeekDialogTemplate', { formulaCell: `$${columnName(col)}$${row + 1}`, goal: '', changingCell: '', maxIterations: 200, tolerance: 0.001 }, (data) => {
    const changing = String(data.changingCell ?? '').match(/^\$?([A-Za-z]+)\$?(\d+)$/);
    if (!changing) throw new Error(messageText(d, 'validChangingCell', 'Enter a valid changing cell'));
    const changingCol = columnIndexOf(changing[1]);
    const changingRow = Number(changing[2]) - 1;
    const gp = d.gc.Spread.Sheets.CalcEngine?.goalSeek;
    if (!gp) throw new Error(messageText(d, 'goalSeekUnavailable', 'Goal Seek is not available'));
    gp(sheet, changingRow, changingCol, sheet, row, col, Number(data.goal ?? 0));
  }, (error) => { if ((error as Error)?.message !== 'Cancelled') d.showMessageBox(String((error as Error)?.message ?? error), messageText(d, 'goalSeek', 'Goal Seek'), 3); });
}
/**
 * TASK 68: Insert Slicer (Data ribbon). The trial lists the pivot-table fields
 * of the active sheet; with none (like the plain comparison workbook) the list
 * stays empty. OK creates a `sheet.slicers` entry per checked field through the
 * public `add(name, target, item, style, SlicerType.pivotTable)` + `position()` API.
 */
export function showInsertSlicerDialog(d: Designer): void {
  const sheet = activeSheet(d);
  const fields: { id: string; pivot: string; field: string; checked: boolean }[] = [];
  for (const pivot of pivotTablesOf(sheet).all()) {
    for (const sourceField of pivot.getSourceFields?.() ?? []) {
      const label = String(sourceField.caption ?? sourceField.fieldName ?? sourceField.name ?? '');
      if (label) fields.push({ id: `${pivot.name()}::${label}`, pivot: String(pivot.name()), field: label, checked: false });
    }
  }
  d.showDialog(TemplateNames.InsertSlicerDialogTemplate ?? 'insertSlicerDialogTemplate', { fields }, (data) => {
    const chosen = ((data.fields as { pivot: string; field: string; checked?: boolean }[]) ?? []).filter((item) => item.checked);
    if (!chosen.length) return;
    const slicers = slicerWriter(sheet);
    const slicerType = d.gc.Spread.Sheets.Slicers.SlicerType.pivotTable;
    const range = activeRanges(sheet)[0];
    let top = (Math.max(0, range?.row ?? 0) + Math.max(1, range?.rowCount ?? 1) + 1) * 20;
    for (const item of chosen) {
      const name = `${item.field} Slicer`.replace(/[\\/*?:[\]]/g, ' ');
      const created = slicers.add(name, item.pivot, item.field, undefined, slicerType);
      created.position?.({ x: (Math.max(0, range?.col ?? 0) + 7) * 90, y: top });
      top += 280;
    }
    d.invalidate();
  }, (error) => { if ((error as Error)?.message !== 'Cancelled') d.showMessageBox(String(error), messageText(d, 'insertSlicer', 'Insert Slicer'), 3); });
}

export function showZoom(d: Designer): void {
  const sheet = activeSheet(d);
  const percent = Math.round((sheet.zoom?.() ?? 1) * 100);
  const presets = ['200', '100', '75', '50', '25'];
  const choice = presets.includes(String(percent)) ? String(percent) : 'custom';
  d.showDialog(TemplateNames.ZoomDialogTemplate ?? 'zoomDialogTemplate', { choice, custom: percent }, (data) => {
    if (data.choice === 'fit') { d.zoomToSelection(); d.invalidate(); return; }
    const percentValue = data.choice === 'custom' ? Number(data.custom ?? 100) : Number(data.choice);
    if (!Number.isFinite(percentValue)) return;
    sheet.zoom(Math.min(400, Math.max(10, percentValue)) / 100);
    d.invalidate();
  });
}
