/* Clipboard commands: designer-side copy of the selection rectangle and the
 * full Paste Options / Paste Special matrix of paste modes. */
import type { ClipboardData, ClipCell, DesignerApi as Designer } from '../designer-api.js';
import type { SelectionRange, Style, Workbook, Worksheet } from '../core-internals.js';
import { internals, recordView, styleWriter } from '../core-internals.js';
import { activeRanges, activeSheet, topCell } from './base.js';

export type { ClipboardData, ClipCell };

export function copySelection(d: Designer, cut: boolean): ClipboardData | null {
  const sheet = activeSheet(d);
  const range = activeRanges(sheet)[0];
  if (!range) return null;
  const r = Math.max(0, range.row), c = Math.max(0, range.col);
  const rc = range.rowCount < 0 ? sheet.getRowCount() - r : range.rowCount;
  const cc = range.colCount < 0 ? sheet.getColumnCount() - c : range.colCount;
  const cells: ClipCell[][] = [];
  for (let row = 0; row < rc; row++) {
    const line: ClipCell[] = [];
    for (let col = 0; col < cc; col++)
      line.push({ value: sheet.getValue(r + row, c + col), formula: sheet.getFormula(r + row, c + col), style: sheet.getStyle(r + row, c + col) });
    cells.push(line);
  }
  const data: ClipboardData = { cells, cut, sheet, range: { row: r, col: c, rowCount: rc, colCount: cc } };
  d._clipboard = data;
  const text = cells.map((line) => line.map((cell) => cell.formula ? `=${cell.formula}` : String(cell.value ?? '')).join('\t')).join('\n');
  try { void navigator.clipboard?.writeText(text); } catch { /* clipboard permission is optional */ }
  return data;
}

/** Extra Paste Special options: arithmetic operation and the skip-blanks switch. */
export interface PasteOptions { operation?: 'none' | 'add' | 'subtract' | 'multiply' | 'divide'; skipBlanks?: boolean; transpose?: boolean }

/** True for properties that describe a cell border (used by "All except borders"). */
const BORDER_KEY = /^(border|diagonal)/i;

/** Copies the allowed properties of `source` on top of the target's own style. */
function mergeStyle(targetSheet: Worksheet, row: number, col: number, source: unknown, keep: (key: string) => boolean): void {
  if (!source) return;
  const sourceStyle = source as Record<string, unknown>;
  const existing = targetSheet.getStyle(row, col) as Style | null;
  const merged = existing?.clone?.() ?? new ((source as Style).constructor as new () => Style)();
  const mergedRecord = recordView(merged);
  for (const key of Object.keys(sourceStyle)) if (keep(key)) mergedRecord[key] = sourceStyle[key];
  targetSheet.setStyle(row, col, merged);
}

export function pasteClipboard(d: Designer, mode: string, options: PasteOptions = {}): void {
  const sheet = activeSheet(d);
  const source = internals(sheet)._clipboardSource?.();
  if (!source) return;
  const cut = internals(sheet)._clipboardMode?.() === 'cut';
  const wb: Workbook = d.getWorkbook();
  const sourceSheet = wb.sheets.find((item) => item.name() === source.sheetName) ?? sheet;
  const data: ClipboardData = {
    sheet: sourceSheet,
    range: { row: source.row, col: source.col } as SelectionRange,
    cut,
    cells: Array.from({ length: source.rowCount }, (_, row) => Array.from({ length: source.colCount }, (_, col) => ({
      value: sourceSheet.getValue(source.row + row, source.col + col),
      formula: sourceSheet.getFormula(source.row + row, source.col + col),
      style: sourceSheet.getStyle(source.row + row, source.col + col),
    }))),
  };
  const target = topCell(sheet);
  const sourceCells = data.cells;
  const sourceRange = data.range;
  // What each of the context-menu Paste Options modes and the Paste Special dialog writes.
  // Measured on the trial: "Paste Formula" leaves cells without a formula untouched,
  // "Values & Formatting" writes both.
  const withFormat = ['all', 'pasteAll', 'transpose', 'formatting', 'values-format', 'formulas-format', 'source-theme', 'no-borders'].includes(mode);
  const numberFormatOnly = mode === 'values-numberformat' || mode === 'formulas-numberformat';
  const wantValue = ['all', 'pasteAll', 'transpose', 'values', 'values-format', 'values-numberformat'].includes(mode);
  const wantFormula = ['all', 'pasteAll', 'transpose', 'formulas', 'formulas-format', 'formulas-numberformat'].includes(mode);
  const wantComments = mode === 'comments';
  const wantValidation = mode === 'validation';
  const wantWidths = mode === 'column-widths';
  const transpose = mode === 'transpose' || options.transpose === true;
  const operation = options.operation ?? 'none';
  const blank = (value: unknown): boolean => value === null || value === undefined || value === '';
  for (let row = 0; row < sourceCells.length; row++) {
    for (let col = 0; col < sourceCells[row].length; col++) {
      const src = sourceCells[row][col];
      if (options.skipBlanks && blank(src.value) && !src.formula) continue;
      const tr = transpose ? target.row + col : target.row + row;
      const tc = transpose ? target.col + row : target.col + col;
      if (wantComments) {
        const comment = sourceSheet.comments.get(source.row + row, source.col + col);
        if (comment) sheet.comments.add(tr, tc, String(comment.text?.() ?? ''));
        continue;
      }
      if (wantValidation) {
        const validator = sourceSheet.getDataValidator?.(source.row + row, source.col + col);
        if (validator) sheet.setDataValidator?.(tr, tc, validator);
        continue;
      }
      if (wantWidths) {
        if (sourceSheet === sheet) sheet.setColumnWidth(tc, sourceSheet.getColumnWidth(source.col + col));
        continue;
      }
      let value: unknown = src.value;
      if (wantValue || wantFormula) {
        if (operation !== 'none') {
          const current = Number(sheet.getValue(tr, tc));
          const next = Number(value);
          if (Number.isFinite(current) || !blank(sheet.getValue(tr, tc))) {
            if (operation === 'add') value = current + next;
            else if (operation === 'subtract') value = current - next;
            else if (operation === 'multiply') value = current * next;
            else value = next === 0 ? current : current / next;
          }
        }
        if (wantFormula && src.formula) sheet.setFormula(tr, tc, src.formula);
        else if (wantValue) sheet.setValue(tr, tc, value);
        // Formula-only modes skip cells that carry no formula, like the trial.
      }
      if (numberFormatOnly) mergeStyle(sheet, tr, tc, src.style, (key) => key === 'formatter');
      else if (mode === 'no-borders') mergeStyle(sheet, tr, tc, src.style, (key) => !BORDER_KEY.test(key));
      else if (withFormat && src.style) { const sourceStyle = src.style as Style; sheet.setStyle(tr, tc, sourceStyle.clone ? sourceStyle.clone() : sourceStyle); }
    }
  }
  if (data.cut && mode !== 'formatting') {
    // Same-sheet cut is a move; keep formulas intact.
    const sr = sourceRange.row, sc = sourceRange.col, src = data.sheet;
    if (src === sheet) {
      for (let row = 0; row < sourceCells.length; row++) for (let col = 0; col < sourceCells[row].length; col++) {
        const tr = target.row + row, tc = target.col + col;
        if (tr === sr + row && tc === sc + col) continue;
        src.setValue(sr + row, sc + col, null);
        styleWriter(src).setStyle(sr + row, sc + col, null);
      }
      internals(sheet)._clipboardClear?.();
    }
  }
}
