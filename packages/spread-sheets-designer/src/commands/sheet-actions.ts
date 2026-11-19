/* Sheet commands: clear, insert/delete cells and rows/columns, autofit, hide,
 * filters, AutoSum, fill, sort, freeze panes and the conditional-formatting
 * galleries (highlight rules, data bars, color scales, icon sets). */
import type { DesignerApi as Designer } from '../designer-api.js';
import type { StorageType, Workbook } from '../core-internals.js';
import { conditionRulesOf, internals, rowFilterWriter } from '../core-internals.js';
import type GC from '@mescius/spread-sheets';
import { activeRanges, activeSheet, selectionBounds, topCell } from './base.js';

export function clearContent(d: Designer): void {
  const sheet = activeSheet(d);
  for (const range of activeRanges(sheet)) {
    if (range.row < 0 || range.col < 0) sheet.clear(range.row, range.col, range.rowCount, range.colCount, 3, 1);
    else sheet.clear(range.row, range.col, range.rowCount, range.colCount, 3, 1);
  }
}

export function clearAll(d: Designer): void {
  const sheet = activeSheet(d);
  for (const range of activeRanges(sheet)) sheet.clear(range.row, range.col, range.rowCount, range.colCount, 3, 0xff as StorageType);
}
export function clearFormat(d: Designer): void {
  const sheet = activeSheet(d);
  for (const range of activeRanges(sheet)) sheet.clear(range.row, range.col, range.rowCount, range.colCount, 3, 4);
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
  wb.addSheet(wb.getSheetCount());
  wb.setActiveSheetIndex(wb.getSheetCount() - 1);
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
  for (const range of activeRanges(sheet)) for (let i = 0; i < range.rowCount; i++) sheet.setRowVisible(Math.max(0, range.row) + i, !hide);
}
export function hideColumns(d: Designer, hide: boolean): void {
  const sheet = activeSheet(d);
  for (const range of activeRanges(sheet)) for (let i = 0; i < range.colCount; i++) sheet.setColumnVisible(Math.max(0, range.col) + i, !hide);
}

export function toggleFilter(d: Designer): void {
  const sheet = activeSheet(d);
  const range = activeRanges(sheet)[0];
  if (!range) return;
  const r = Math.max(0, range.row), c = Math.max(0, range.col);
  const rc = range.rowCount < 0 ? sheet.getRowCount() - r : range.rowCount;
  const cc = range.colCount < 0 ? sheet.getColumnCount() - c : range.colCount;
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
  const srcR = direction === 'up' ? r + rc - 1 : r;
  const srcC = direction === 'left' ? c + cc - 1 : c;
  if (direction === 'down' || direction === 'up') {
    for (let row = 0; row < rc; row++) for (let col = 0; col < cc; col++) {
      if (row === (direction === 'down' ? 0 : rc - 1)) continue;
      const sourceRow = direction === 'down' ? r : r + rc - 1;
      const f = sheet.getFormula(sourceRow, c + col);
      if (f) sheet.setFormula(r + row, c + col, f); else sheet.setValue(r + row, c + col, sheet.getValue(sourceRow, c + col));
    }
  } else {
    for (let row = 0; row < rc; row++) for (let col = 0; col < cc; col++) {
      if (col === (direction === 'right' ? 0 : cc - 1)) continue;
      const sourceCol = direction === 'right' ? c : c + cc - 1;
      const f = sheet.getFormula(r + row, sourceCol);
      if (f) sheet.setFormula(r + row, c + col, f); else sheet.setValue(r + row, c + col, sheet.getValue(r + row, sourceCol));
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

export function applyDataBar(d: Designer, color: string): void {
  const sheet = activeSheet(d);
  const GC = d.gc;
  const ranges = activeRanges(sheet).map((range) => new GC.Spread.Sheets.Range(
    Math.max(0, range.row), Math.max(0, range.col),
    range.rowCount < 0 ? sheet.getRowCount() : range.rowCount,
    range.colCount < 0 ? sheet.getColumnCount() : range.colCount,
  ));
  sheet.conditionalFormats.addDataBarRule(1, 0, 2, 0, color, ranges);
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
    gyr: ['#63be7b', '#ffeb84', '#f8696b'], ryg: ['#f8696b', '#ffeb84', '#63be7b'],
    gwr: ['#63be7b', '#ffffff', '#f8696b'], rwg: ['#f8696b', '#ffffff', '#63be7b'],
    bwr: ['#5a8ac6', '#ffffff', '#f8696b'], rwb: ['#f8696b', '#ffffff', '#5a8ac6'],
    wr: ['#ffffff', '#f8696b'], rw: ['#f8696b', '#ffffff'],
    gw: ['#63be7b', '#ffffff'], wg: ['#ffffff', '#63be7b'],
    gy: ['#63be7b', '#ffeb84'], yg: ['#ffeb84', '#63be7b'],
  };
  const p = pairs[kind] ?? pairs.gyr;
  if (p.length === 3) sheet.conditionalFormats.add3ScaleRule(1, 0, p[0], 4, 50, p[1], 2, 0, p[2] as string, ranges);
  else sheet.conditionalFormats.add2ScaleRule(1, 0, p[0], 2, 0, p[1], ranges);
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
  if (bounds.rowCount < 2) return;
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
