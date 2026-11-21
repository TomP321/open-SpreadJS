/* Sheet commands: clear, insert/delete cells and rows/columns, autofit, hide,
 * filters, AutoSum, fill, sort, freeze panes and the conditional-formatting
 * galleries (highlight rules, data bars, color scales, icon sets). */
import type { DesignerApi as Designer } from '../designer-api.js';
import type { StorageType, Workbook, Worksheet } from '../core-internals.js';
import { conditionFormatsOf, conditionRulesOf, internals, rowFilterWriter, workbookDefaultFont } from '../core-internals.js';
import type GC from '@mescius/spread-sheets';
import { activeRanges, activeSheet, selectionBounds, topCell } from './base.js';

export function clearContent(d: Designer): void {
  const sheet = activeSheet(d);
  for (const range of activeRanges(sheet)) {
    if (range.row < 0 || range.col < 0) sheet.clear(range.row, range.col, range.rowCount, range.colCount, 3, 1);
    else sheet.clear(range.row, range.col, range.rowCount, range.colCount, 3, 1);
  }
}

/* Trial (TASK 75 sweep): the Editing ▸ Clear commands leave a materialised "empty"
 * style record on every cleared cell (the reference Style serialised in full).
 * The `sheet.clear` API itself does NOT do this — the command applies it. */
export function clearedStyleRecord(sheet: Worksheet): Record<string, unknown> {
  const font = workbookDefaultFont(internals(sheet).parent) ?? '14.6667px Calibri';
  return {
    backColor: null, foreColor: null, hAlign: 3, vAlign: 0, font, themeFont: 'Body', formatter: null,
    borderLeft: null, borderTop: null, borderRight: null, borderBottom: null, locked: true,
    textIndent: null, wordWrap: null, showEllipsis: null, shrinkToFit: null, backgroundImage: null,
    cellType: null, backgroundImageLayout: null, tabStop: null, textDecoration: null, imeMode: 1,
    parentName: null, watermark: null, cellPadding: null, quotePrefix: null,
    diagonalDown: null, diagonalUp: null, isVerticalText: null, cellButtons: [], dropDowns: null,
    textOrientation: null, borderRadius: null,
  };
}
function materializeClearedStyles(d: Designer, storage: { row: number; col: number; rowCount: number; colCount: number }): void {
  const sheet = activeSheet(d);
  const style = Object.assign(new d.gc.Spread.Sheets.Style(), clearedStyleRecord(sheet));
  for (let row = storage.row; row < storage.row + Math.max(1, storage.rowCount); row++)
    for (let col = storage.col; col < storage.col + Math.max(1, storage.colCount); col++)
      sheet.setStyle(row, col, style);
}
export function clearAll(d: Designer): void {
  const sheet = activeSheet(d);
  for (const range of activeRanges(sheet)) sheet.clear(range.row, range.col, range.rowCount, range.colCount, 3, 0xff as StorageType);
  for (const range of activeRanges(sheet)) materializeClearedStyles(d, range);
}
export function clearFormat(d: Designer): void {
  const sheet = activeSheet(d);
  for (const range of activeRanges(sheet)) sheet.clear(range.row, range.col, range.rowCount, range.colCount, 3, 4);
  for (const range of activeRanges(sheet)) materializeClearedStyles(d, range);
}

export function insertRows(d: Designer): void {
  const sheet = activeSheet(d);
  for (const range of activeRanges(sheet)) {
    const row = Math.max(0, range.row);
    sheet.addRows(row, Math.max(1, range.rowCount));
  }
}
export function insertColumns(d: Designer): void {
  const sheet = activeSheet(d);
  for (const range of activeRanges(sheet)) sheet.addColumns(Math.max(0, range.col), Math.max(1, range.colCount));
}
export function deleteRows(d: Designer): void {
  const sheet = activeSheet(d);
  for (const range of [...activeRanges(sheet)].reverse()) sheet.deleteRows(Math.max(0, range.row), Math.max(1, range.rowCount));
}
export function deleteColumns(d: Designer): void {
  const sheet = activeSheet(d);
  for (const range of [...activeRanges(sheet)].reverse()) sheet.deleteColumns(Math.max(0, range.col), Math.max(1, range.colCount));
}

/**
 * Insert cells (shift down/right): trial semantics — only the selection's column/row band moves,
 * formula references pointing into the moved cells follow (see `_shiftRowsInColumns`).
 */
export function shiftCells(d: Designer, down: boolean): void {
  const sheet = activeSheet(d);
  for (const range of activeRanges(sheet)) {
    const r = Math.max(0, range.row), c = Math.max(0, range.col);
    const rc = Math.max(1, range.rowCount), cc = Math.max(1, range.colCount);
    if (down) internals(sheet)._shiftRowsInColumns(r, rc, c, c + cc - 1, false);
    else internals(sheet)._shiftColumnsInRows(c, cc, r, r + rc - 1, false);
  }
}

/** Delete → Shift cells up/left: pull the surrounding band cells into the cleared range. */
export function collapseCells(d: Designer, up: boolean): void {
  const sheet = activeSheet(d);
  for (const range of activeRanges(sheet)) {
    const r = Math.max(0, range.row), c = Math.max(0, range.col);
    const rc = Math.max(1, range.rowCount), cc = Math.max(1, range.colCount);
    if (up) internals(sheet)._shiftRowsInColumns(r, rc, c, c + cc - 1, true);
    else internals(sheet)._shiftColumnsInRows(c, cc, r, r + rc - 1, true);
  }
}

/** Insert Copied/Cut Cells...: make room at the anchor, then paste the clipboard range into it. */
export function pasteShift(d: Designer, direction: string, cut: boolean): void {
  const sheet = activeSheet(d);
  const source = internals(sheet)._clipboardSource?.();
  if (!source) return;
  const wb: Workbook = d.getWorkbook();
  const from = wb.sheets.find((item) => item.name() === source.sheetName) ?? sheet;
  const range = activeRanges(sheet)[0] ?? { row: sheet.getActiveRowIndex(), col: sheet.getActiveColumnIndex(), rowCount: 1, colCount: 1 };
  const r = Math.max(0, range.row), c = Math.max(0, range.col);
  // Trial: the shift covers the copied rectangle's column/row band only and references pointing
  // into the moved cells follow the move (unlike full-row `addRows` this keeps other columns).
  if (direction === 'right') internals(sheet)._shiftColumnsInRows(c, source.colCount, r, r + source.rowCount - 1, false);
  else internals(sheet)._shiftRowsInColumns(r, source.rowCount, c, c + source.colCount - 1, false);
  // GC.Spread.Sheets.CopyToOptions.all — Insert Copied Cells pastes content and formatting.
  sheet.copyTo(source.row, source.col, r, c, source.rowCount, source.colCount, 65535);
  if (cut && from === sheet) from.clear(source.row, source.col, source.rowCount, source.colCount, 3, 15 as StorageType);
  internals(sheet)._clipboardClear?.();
}

/** Transform Cells...: evaluate `expression` (x = the current cell value) per selected cell. */
export function applyTransformCells(d: Designer, expression: string): void {
  const sheet = activeSheet(d);
  let body = expression.trim().replace(/^=/, '');
  const lambda = body.match(/^LAMBDA\s*\(\s*x\s*,\s*([\s\S]*)\)\s*$/i);
  if (lambda) body = lambda[1];
  const scratch = sheet.getRowCount() - 1;
  const scratchCol = sheet.getColumnCount() - 1;
  const before = new Map<string, { value: unknown; formula: string | null }>();
  for (const range of activeRanges(sheet)) {
    for (let row = Math.max(0, range.row); row < range.row + Math.max(1, range.rowCount); row++)
      for (let col = Math.max(0, range.col); col < range.col + Math.max(1, range.colCount); col++) before.set(`${row},${col}`, { value: sheet.getValue(row, col), formula: sheet.getFormula(row, col) });
  }
  for (const [key, cell] of before) {
    const [row, col] = key.split(',').map(Number);
    const literal = typeof cell.value === 'number' ? String(cell.value) : cell.value == null ? '""' : `"${String(cell.value).replaceAll('"', '""')}"`;
    sheet.setFormula(scratch, scratchCol, `=${body.replaceAll(/\bx\b/g, literal)}`);
    const result = sheet.getValue(scratch, scratchCol);
    sheet.clear(scratch, scratchCol, 1, 1, 3, 15 as StorageType);
    if (typeof result === 'string' && result.startsWith('#')) sheet.setValue(row, col, cell.value);
    else sheet.setValue(row, col, result);
  }
}

export function insertSheet(d: Designer): void {
  const wb = d.getWorkbook();
  // Trial behaviour (TASK 75): the ribbon insertSheet command lands the new tab
  // at position 0 and activates it.
  wb.addSheet(0);
  wb.setActiveSheetIndex(0);
}
export function deleteSheet(d: Designer): void {
  const wb = d.getWorkbook();
  if (wb.getSheetCount() <= 1) return;
  wb.removeSheet(wb.getActiveSheetIndex());
}

export function autoFitColumn(d: Designer): void {
  const sheet = activeSheet(d);
  for (const range of activeRanges(sheet)) {
    if (range.col < 0) continue;
    for (let col = range.col; col < range.col + range.colCount; col++) sheet.autoFitColumn(col);
  }
}
export function autoFitRow(d: Designer): void {
  const sheet = activeSheet(d);
  for (const range of activeRanges(sheet)) {
    if (range.row < 0) continue;
    for (let row = range.row; row < range.row + range.rowCount; row++) sheet.autoFitRow(row);
  }
}

export function hideRows(d: Designer, hide: boolean): void {
  const sheet = activeSheet(d);
  /* Trial (TASK 75 r5 unhide probe): showing rows touches only the ones that ARE hidden —
   * an already-visible row gets no `visible: true` record. */
  for (const range of activeRanges(sheet))
    for (let i = 0; i < range.rowCount; i++) {
      const row = Math.max(0, range.row) + i;
      if (hide ? sheet.getRowVisible(row) : !sheet.getRowVisible(row)) sheet.setRowVisible(row, !hide);
    }
}
export function hideColumns(d: Designer, hide: boolean): void {
  const sheet = activeSheet(d);
  for (const range of activeRanges(sheet))
    for (let i = 0; i < range.colCount; i++) {
      const col = Math.max(0, range.col) + i;
      if (hide ? sheet.getColumnVisible(col) : !sheet.getColumnVisible(col)) sheet.setColumnVisible(col, !hide);
    }
}

/* Trial (TASK 75 probe): the Filter button expands a single-cell selection to the
 * contiguous data region and records a visible filter button per column. */
function currentRegion(sheet: Worksheet, row: number, col: number): { row: number; col: number; rowCount: number; colCount: number } {
  const filled = (r: number, c: number): boolean => {
    const v = sheet.getValue(r, c);
    return v !== null && v !== undefined && v !== '';
  };
  if (!filled(row, col)) return { row, col, rowCount: 1, colCount: 1 };
  let top = row; while (top > 0 && filled(top - 1, col)) top--;
  let bottom = row; while (bottom + 1 < sheet.getRowCount() && filled(bottom + 1, col)) bottom++;
  let left = col; while (left > 0 && [...Array(bottom - top + 1)].some((_, i) => filled(top + i, left - 1))) left--;
  let right = col; while (right + 1 < sheet.getColumnCount() && [...Array(bottom - top + 1)].some((_, i) => filled(top + i, right + 1))) right++;
  return { row: top, col: left, rowCount: bottom - top + 1, colCount: right - left + 1 };
}

export function toggleFilter(d: Designer): void {
  const sheet = activeSheet(d);
  const range = activeRanges(sheet)[0];
  if (!range) return;
  let r = Math.max(0, range.row), c = Math.max(0, range.col);
  let rc = range.rowCount < 0 ? sheet.getRowCount() - r : range.rowCount;
  let cc = range.colCount < 0 ? sheet.getColumnCount() - c : range.colCount;
  if (rc <= 1 && cc <= 1) {
    const region = currentRegion(sheet, r, c);
    r = region.row; c = region.col; rc = region.rowCount; cc = region.colCount;
  }
  const GC = d.gc;
  const current = sheet.rowFilter();
  if (current) {
    current.filterButtonVisible(false);
    rowFilterWriter(sheet).rowFilter(null);
  } else {
    const filter = new GC.Spread.Sheets.Filter.HideRowFilter(new GC.Spread.Sheets.Range(r, c, rc, cc));
    sheet.rowFilter(filter);
    filter.filterButtonVisible(true);
  }
}

export function autoSum(d: Designer, fn: string): void {
  const sheet = activeSheet(d);
  const { row, col } = topCell(sheet);
  let targetRow = row; const targetCol = col;
  const empty = sheet.getValue(row, col) == null || sheet.getValue(row, col) === '';
  if (!empty) {
    // Excel-like: put the result below a contiguous numeric range in this column.
    let r = row;
    while (r >= 0 && (typeof sheet.getValue(r, col) === 'number' || sheet.getFormula(r, col))) r--;
    targetRow = row + 1;
    const f = fn === 'sum' ? `=SUM(${colLetter(col)}${r + 2}:${colLetter(col)}${row + 1})`
      : fn === 'average' ? `=AVERAGE(${colLetter(col)}${r + 2}:${colLetter(col)}${row + 1})`
      : fn === 'count' ? `=COUNT(${colLetter(col)}${r + 2}:${colLetter(col)}${row + 1})`
      : fn === 'max' ? `=MAX(${colLetter(col)}${r + 2}:${colLetter(col)}${row + 1})`
      : `=MIN(${colLetter(col)}${r + 2}:${colLetter(col)}${row + 1})`;
    sheet.setFormula(targetRow, targetCol, f);
    sheet.setSelection(targetRow, targetCol, 1, 1);
    return;
  }
  let r = row - 1, count = 0;
  while (r >= 0 && typeof sheet.getValue(r, col) === 'number') { r--; count++; }
  if (count) {
    const start = r + 1;
    const f = fn === 'sum' ? `=SUM(${colLetter(col)}${start + 1}:${colLetter(col)}${row})`
      : fn === 'average' ? `=AVERAGE(${colLetter(col)}${start + 1}:${colLetter(col)}${row})`
      : fn === 'count' ? `=COUNT(${colLetter(col)}${start + 1}:${colLetter(col)}${row})`
      : fn === 'max' ? `=MAX(${colLetter(col)}${start + 1}:${colLetter(col)}${row})`
      : `=MIN(${colLetter(col)}${start + 1}:${colLetter(col)}${row})`;
    sheet.setFormula(row, col, f);
  }
}

export function colLetter(col: number): string {
  let out = '';
  for (let n = col + 1; n > 0; n = Math.floor((n - 1) / 26)) out = String.fromCharCode(65 + ((n - 1) % 26)) + out;
  return out;
}

export function fillDirection(d: Designer, direction: string): void {
  const sheet = activeSheet(d);
  const range = activeRanges(sheet)[0];
  if (!range) return;
  const r = Math.max(0, range.row), c = Math.max(0, range.col);
  const rc = Math.max(1, range.rowCount), cc = Math.max(1, range.colCount);
  /* Trial (TASK 75 sweep): a Fill command on a SINGLE cell copies the adjacent source
   * cell across the fill edge — value or relative-adjusted formula, plus the source's
   * computed style condensed into a materialized record. */
  if (rc === 1 && cc === 1) {
    const src = direction === 'down' ? [r - 1, c] : direction === 'up' ? [r + 1, c]
      : direction === 'left' ? [r, c + 1] : [r, c - 1];
    if (src[0] < 0 || src[1] < 0 || src[0] >= sheet.getRowCount() || src[1] >= sheet.getColumnCount()) return;
    const formula = sheet.getFormula(src[0], src[1]);
    if (formula) sheet.setFormula(r, c, internals(sheet)._translateFormula(formula, r - src[0], c - src[1]));
    else sheet.setValue(r, c, sheet.getValue(src[0], src[1]));
    const record = internals(sheet)._fillStyleRecord(src[0], src[1]);
    const style = Object.assign(new d.gc.Spread.Sheets.Style(), record);
    sheet.setStyle(r, c, style);
    return;
  }
  const srcR = direction === 'up' ? r + rc - 1 : r;
  const srcC = direction === 'left' ? c + cc - 1 : c;
  /* Trial (TASK 75 r4, Fill Down probe): the multi-cell fill copies the source cell's
   * computed style onto every target as a materialised record, exactly like the
   * single-cell path. */
  const fillStyle = (targetRow: number, targetCol: number, sourceRow: number, sourceCol: number): void => {
    const record = internals(sheet)._fillStyleRecord(sourceRow, sourceCol);
    sheet.setStyle(targetRow, targetCol, Object.assign(new d.gc.Spread.Sheets.Style(), record));
  };
  if (direction === 'down' || direction === 'up') {
    for (let row = 0; row < rc; row++) for (let col = 0; col < cc; col++) {
      if (row === (direction === 'down' ? 0 : rc - 1)) continue;
      const sourceRow = direction === 'down' ? r : r + rc - 1;
      const f = sheet.getFormula(sourceRow, c + col);
      if (f) sheet.setFormula(r + row, c + col, f); else sheet.setValue(r + row, c + col, sheet.getValue(sourceRow, c + col));
      fillStyle(r + row, c + col, sourceRow, c + col);
    }
  } else {
    for (let row = 0; row < rc; row++) for (let col = 0; col < cc; col++) {
      if (col === (direction === 'right' ? 0 : cc - 1)) continue;
      const sourceCol = direction === 'right' ? c : c + cc - 1;
      const f = sheet.getFormula(r + row, sourceCol);
      if (f) sheet.setFormula(r + row, c + col, f); else sheet.setValue(r + row, c + col, sheet.getValue(r + row, sourceCol));
      fillStyle(r + row, c + col, r + row, sourceCol);
    }
  }
  void srcR; void srcC;
}

export function applyConditional(d: Designer, kind: string): void {
  const sheet = activeSheet(d);
  const GC = d.gc;
  const style = new GC.Spread.Sheets.Style();
  style.backColor = '#ffc7ce';
  style.foreColor = '#9c0006';
  const ranges = activeRanges(sheet).map((range) => new GC.Spread.Sheets.Range(
    Math.max(0, range.row), Math.max(0, range.col),
    range.rowCount < 0 ? sheet.getRowCount() : range.rowCount,
    range.colCount < 0 ? sheet.getColumnCount() : range.colCount,
  ));
  const cf = conditionRulesOf(sheet);
  if (kind === 'greater') cf.addCellValueRule(2, 0, null, style, ranges);
  else if (kind === 'less') cf.addCellValueRule(4, 0, null, style, ranges);
  else if (kind === 'between') cf.addCellValueRule(6, 0, 100, style, ranges);
  else if (kind === 'equal') cf.addCellValueRule(0, 0, null, style, ranges);
  else if (kind === 'contains') cf.addSpecificTextRule(0, 'text', style, ranges);
  else if (kind === 'date') cf.addDateOccurringRule(0, style, ranges);
  else if (kind === 'duplicate') cf.addDuplicateRule(style, ranges);
  else if (kind === 'unique') cf.addUniqueRule(style, ranges);
  else if (kind === 'top') cf.addTop10Rule(0, 10, style, ranges);
  else if (kind === 'topPercent') cf.addTop10Rule(0, 10, style, ranges, true);
  else if (kind === 'bottom') cf.addTop10Rule(1, 10, style, ranges);
  else if (kind === 'bottomPercent') cf.addTop10Rule(1, 10, style, ranges, true);
  else if (kind === 'aboveAverage') cf.addAverageRule(0, style, ranges);
  else if (kind === 'belowAverage') cf.addAverageRule(1, style, ranges);
  else cf.addCellValueRule(2, 0, null, style, ranges);
}

/* Trial (TASK 75 probe): data bars serialise the named colour, `(Automatic)` bounds
 * and — for the solid-fill gallery row — `gradient:false`; colour scales store the
 * scale colours reversed (first name = max colour) as plain colour names. */
export function applyDataBar(d: Designer, color: string, gradient = true): void {
  const sheet = activeSheet(d);
  const GC = d.gc;
  const ranges = activeRanges(sheet).map((range) => new GC.Spread.Sheets.Range(
    Math.max(0, range.row), Math.max(0, range.col),
    range.rowCount < 0 ? sheet.getRowCount() : range.rowCount,
    range.colCount < 0 ? sheet.getColumnCount() : range.colCount,
  ));
  // Trial preset json: `minValue`/`maxValue` are the literal `(Automatic)` string and
  // the types serialise as automatic (omitted); solid-fill bars add `gradient:false`.
  const rule = conditionFormatsOf(sheet).addDataBarRule(1, '(Automatic)', 2, '(Automatic)', color, ranges);
  if (!gradient) rule.gradient(false);
}
export function applyColorScale(d: Designer, kind: string): void {
  const sheet = activeSheet(d);
  const GC = d.gc;
  const ranges = activeRanges(sheet).map((range) => new GC.Spread.Sheets.Range(
    Math.max(0, range.row), Math.max(0, range.col),
    range.rowCount < 0 ? sheet.getRowCount() : range.rowCount,
    range.colCount < 0 ? sheet.getColumnCount() : range.colCount,
  ));
  const pairs: Record<string, [string, string, string?]> = {
    gyr: ['green', 'yellow', 'red'], ryg: ['red', 'yellow', 'green'],
    gwr: ['green', 'white', 'red'], rwg: ['red', 'white', 'green'],
    bwr: ['blue', 'white', 'red'], rwb: ['red', 'white', 'blue'],
    wr: ['white', 'red'], rw: ['red', 'white'],
    gw: ['green', 'white'], wg: ['white', 'green'],
    gy: ['green', 'yellow'], yg: ['yellow', 'green'],
  };
  const p = pairs[kind] ?? pairs.gyr;
  // The trial stores min = the scale's right-most colour, max = its left-most one,
  // and never a bound value on the preset path (types 1/2/4 carry automatic/percent).
  const min = String(p[p.length - 1]), max = String(p[0]);
  const cf = conditionFormatsOf(sheet);
  if (p.length === 3) cf.add3ScaleRule(1, undefined, min, 4, undefined, String(p[1]), 2, undefined, max, ranges);
  else cf.add2ScaleRule(1, undefined, min, 2, undefined, max, ranges);
}
export function applyIconSet(d: Designer, iconSet: number): void {
  const sheet = activeSheet(d);
  const GC = d.gc;
  const ranges = activeRanges(sheet).map((range) => new GC.Spread.Sheets.Range(
    Math.max(0, range.row), Math.max(0, range.col),
    range.rowCount < 0 ? sheet.getRowCount() : range.rowCount,
    range.colCount < 0 ? sheet.getColumnCount() : range.colCount,
  ));
  sheet.conditionalFormats.addIconSetRule(iconSet as GC.Spread.Sheets.ConditionalFormatting.IconSetType, ranges);
}

export function clearConditional(d: Designer, sheetWide: boolean): void {
  const sheet = activeSheet(d);
  if (sheetWide) sheet.conditionalFormats.clearRule();
  else for (const range of activeRanges(sheet)) sheet.conditionalFormats.removeRuleByRange(range.row, range.col, range.rowCount, range.colCount);
  sheet.invalidateLayout();
}

export function sortSelection(d: Designer, ascending: boolean): void {
  const sheet = activeSheet(d);
  const anchorRow = Math.max(0, sheet.getActiveRowIndex()), anchorCol = Math.max(0, sheet.getActiveColumnIndex());
  // Like the trial, a cell inside a table sorts the whole table by the active column.
  let bounds = selectionBounds(sheet);
  let hasHeader: boolean | null = null;
  for (const table of sheet.tables.all()) {
    const r = table.range();
    if (anchorRow >= r.row && anchorRow < r.row + r.rowCount && anchorCol >= r.col && anchorCol < r.col + r.colCount) {
      bounds = { row: r.row, col: r.col, rowCount: r.rowCount, colCount: r.colCount };
      hasHeader = table.showHeader() !== false;
      break;
    }
  }
  // Trial (TASK 75 sweep): even a 1-row selection records a `sortState`; the sort of a
  // single row is a data no-op, so do not bail out early here.
  // The trial treats the first row as a header only when every cell of it is a
  // non-empty string (and then sorts the remaining rows).
  if (hasHeader === null) {
    hasHeader = true;
    for (let c = bounds.col; c < bounds.col + bounds.colCount; c++) {
      const value = sheet.getValue(bounds.row, c);
      if (typeof value !== 'string' || value.trim() === '') { hasHeader = false; break; }
    }
  }
  const start = hasHeader ? 1 : 0;
  const index = Math.max(0, Math.min(bounds.colCount - 1, anchorCol - bounds.col));
  sheet.sortRange(bounds.row + start, bounds.col, bounds.rowCount - start, bounds.colCount, true, [{ index, ascending }]);
  /* Trial (TASK 75 r4, true multi-selection probes): the ribbon sort records the state of
   * the SORTED range (header row excluded) — a 1x1 selection is the degenerate 1x1 case
   * the earlier probe mistook for the rule. The absolute active column goes into the
   * recorded condition's `index` (the trial stores it un-adjusted for the range). */
  internals(sheet).sortStateValue = {
    row: bounds.row + start, col: bounds.col, rowCount: bounds.rowCount - start, colCount: bounds.colCount,
    byRow: true, sortConditions: [{ index: anchorCol, ascending }],
  };
}

export function freezePanes(d: Designer, mode: string): void {
  const sheet = activeSheet(d);
  const { row, col } = topCell(sheet);
  if (mode === 'viewportFreezePanes' || mode === 'freezePanes') {
    sheet.frozenRowCount(row); sheet.frozenColumnCount(col);
  } else if (mode === 'freezeTopRow') { sheet.frozenRowCount(1); sheet.frozenColumnCount(0); }
  else if (mode === 'freezeFirstColumn') { sheet.frozenRowCount(0); sheet.frozenColumnCount(1); }
  else if (mode === 'freezeBottomRow') sheet.frozenTrailingRowCount(1, true);
  else if (mode === 'freezeLastColumn') sheet.frozenTrailingColumnCount(1, true);
}
