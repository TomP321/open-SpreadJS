import type { DesignerApi as Designer, FindSearchOptions as SearchOptions, FindSearchResult as SearchResult } from './designer-api.js';
import { TemplateNames } from './names-generated.js';
import type { Workbook } from './core-internals.js';

function regexFor(text: string, options: SearchOptions): RegExp {
  let pattern = options.useWildcards ? text.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') : text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (options.matchExactly) pattern = `^${pattern}$`;
  return new RegExp(pattern, options.matchCase ? '' : 'i');
}

function cellReference(row: number, col: number): string {
  let label = '';
  for (let n = col + 1; n > 0; n = Math.floor((n - 1) / 26)) label = String.fromCharCode(65 + ((n - 1) % 26)) + label;
  return `${label}${row + 1}`;
}

export class FindReplaceController {
  private lastIndex = 0;
  constructor(private designer: Designer) {}

  open(mode: 'find' | 'replace', searchText?: string): void {
    const data: SearchOptions & Record<string, unknown> = {
      // TASK 68: the trial's defaults, measured from the running dialog.
      searchText: searchText ?? '', replaceText: '', within: 'sheet', searchOrder: 'rows', lookIn: 'formulas',
      matchCase: false, matchExactly: false, useWildcards: false, ignoreHidden: false, results: [],
      resultsLabel: '', resultsShown: false, optionsOpen: false, initialTab: mode, activeTab: mode,
    };
    const templateName = TemplateNames.FindDialogTemplate ?? 'findDialogTemplate';
    this.designer.showDialog(templateName, data, () => { /* keep the workbook selection */ });
    if (this.designer.dialog) this.designer.dialog.initialTab = mode;
    this.designer.invalidate();
  }

  private collected(data: SearchOptions): SearchResult[] {
    const text = String(data.searchText ?? '');
    if (!text) return [];
    const wb: Workbook = this.designer.getWorkbook();
    const re = regexFor(text, data);
    const results: SearchResult[] = [];
    const indices = data.within === 'workbook' ? Array.from({ length: wb.getSheetCount() }, (_, index) => index) : [wb.getActiveSheetIndex()];
    for (const sheetIndex of indices) {
      const sheet = wb.getSheet(sheetIndex);
      if (!sheet) continue;
      const rows = sheet.getRowCount();
      const cols = sheet.getColumnCount();
      const order = data.searchOrder === 'columns'
        ? Array.from({ length: cols }, (_, col) => Array.from({ length: rows }, (_, row) => [row, col] as const)).flat()
        : Array.from({ length: rows }, (_, row) => Array.from({ length: cols }, (_, col) => [row, col] as const)).flat();
      for (const [row, col] of order) {
        if (data.ignoreHidden && !(sheet.getRowVisible?.(row) && sheet.getColumnVisible?.(col))) continue;
        // TASK 70 (measured on the trial): "Look in: Formulas" — the trial's default since TASK 68 —
        // matches FORMULA TEXT and plain contents alike (a value cell's "formula" IS its value), so
        // the trial finds "North" in a value cell. Only formula cells differ between the two modes.
        const value = data.lookIn === 'formulas' ? (sheet.getFormula(row, col) ?? sheet.getText(row, col)) : sheet.getText(row, col);
        if (value == null || value === '') continue;
        if (re.test(String(value))) results.push({
          book: wb.name || 'Book1', sheet: sheet.name(), cell: cellReference(row, col), value: String(value),
          row, col, sheetIndex,
        });
      }
    }
    return results;
  }

  findNext(data: SearchOptions): boolean {
    const results = this.collected(data);
    data.results = results;
    if (!results.length) {
      data.resultsLabel = 'Spread cannot find the data you are searching for.';
      this.designer.showMessageBox('Spread cannot find the data you are searching for.', 'SpreadJS Designer', 1);
      return false;
    }
    const wb: Workbook = this.designer.getWorkbook();
    const active = wb.getActiveSheet();
    const activeRow = active.getActiveRowIndex(), activeCol = active.getActiveColumnIndex();
    let index = this.lastIndex++ % results.length;
    const current = results.findIndex((r) => r.sheetIndex === wb.getActiveSheetIndex() && r.row === activeRow && r.col === activeCol);
    if (current >= 0) index = (current + 1) % results.length;
    const match = results[index]!;
    wb.setActiveSheetIndex(match.sheetIndex);
    wb.getSheet(match.sheetIndex)?.setSelection(match.row, match.col, 1, 1);
    data.resultsLabel = `${match.sheet}!${match.cell}`;
    this.designer.invalidate();
    return true;
  }

  findAll(data: SearchOptions): SearchResult[] {
    const results = this.collected(data);
    data.results = results;
    if (!results.length) {
      // Like the trial: a message box, the dialog keeps its current size.
      this.designer.showMessageBox('Spread cannot find the data you are searching for.', 'SpreadJS Designer', 1);
      this.designer.invalidate();
      return results;
    }
    (data as Record<string, unknown>).resultsShown = true;
    (data as Record<string, unknown>).resultsLabel = `${results.length} cell(s) found`;
    this.designer.invalidate();
    return results;
  }

  replaceNext(data: SearchOptions): boolean {
    const wb: Workbook = this.designer.getWorkbook();
    const sheet = wb.getActiveSheet();
    let row = sheet.getActiveRowIndex(), col = sheet.getActiveColumnIndex();
    const text = String(data.searchText ?? '');
    const replacement = String(data.replaceText ?? '');
    if (!text) return false;
    const re = regexFor(text, data);
    const started = `${row}:${col}`;
    for (let guard = 0; guard < sheet.getRowCount() * 2; guard++) {
      const value = data.lookIn === 'formulas' ? (sheet.getFormula(row, col) ?? sheet.getText(row, col)) : sheet.getText(row, col);
      if (value != null && re.test(String(value))) {
        const next = String(value).replace(re, replacement);
        if (String(value).startsWith('=')) sheet.setFormula(row, col, next); else sheet.setValue(row, col, next);
        this.designer.invalidate();
        return true;
      }
      col++;
      if (col >= sheet.getColumnCount()) { col = 0; row++; }
      if (row >= sheet.getRowCount()) row = 0;
      if (`${row}:${col}` === started) break;
    }
    this.designer.showMessageBox('Spread cannot find a match.', 'Replace', 1);
    return false;
  }

  replaceAll(data: SearchOptions): number {
    const results = this.collected(data);
    const wb: Workbook = this.designer.getWorkbook();
    const replacement = String(data.replaceText ?? '');
    const re = regexFor(String(data.searchText ?? ''), data);
    let count = 0;
    for (const result of results) {
      const sheet = wb.getSheet(result.sheetIndex);
      if (!sheet) continue;
      // TASK 70: same semantics as `collected()` — a value cell matches "Formulas" too, and its
      // content (not the null formula) is what gets replaced.
      const value = data.lookIn === 'formulas' ? (sheet.getFormula(result.row, result.col) ?? sheet.getText(result.row, result.col)) : sheet.getText(result.row, result.col);
      if (value == null) continue;
      const next = String(value).replace(re, replacement);
      if (data.lookIn === 'formulas' && String(value).startsWith('=')) sheet.setFormula(result.row, result.col, next); else sheet.setValue(result.row, result.col, next);
      count++;
    }
    data.results = [];
    data.resultsLabel = `All done, We made ${count} replacements.`;
    this.designer.invalidate();
    return count;
  }
}
