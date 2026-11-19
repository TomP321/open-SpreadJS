/* Selection helpers shared by every command module: the active sheet, its
 * selection ranges, the top cell of the first range and the resolved bounds
 * of the current selection. */
import type { DesignerApi as Designer } from '../designer-api.js';
import { recordView, type SelectionRange, type Worksheet } from '../core-internals.js';

export function activeSheet(d: Designer): Worksheet {
  return d.getWorkbook().getActiveSheet();
}

export function activeRanges(sheet: Worksheet): SelectionRange[] {
  const ranges = sheet.getSelections();
  if (ranges.length) return ranges;
  const r = sheet.getActiveRowIndex(), c = sheet.getActiveColumnIndex();
  return [{ row: r, col: c, rowCount: 1, colCount: 1 }];
}

export function topCell(sheet: Worksheet): { row: number; col: number } {
  const range = activeRanges(sheet)[0];
  const row = range.row < 0 ? 0 : range.row;
  const col = range.col < 0 ? 0 : range.col;
  return { row, col };
}

export function currentStyle(d: Designer): Record<string, unknown> {
  const sheet = activeSheet(d);
  const { row, col } = topCell(sheet);
  return recordView(sheet.getActualStyle(row, col));
}

/** The current selection clamped to concrete, positive cell bounds. */
export function selectionBounds(sheet: Worksheet): { row: number; col: number; rowCount: number; colCount: number } {
  const range = activeRanges(sheet)[0];
  const row = Math.max(0, range.row), col = Math.max(0, range.col);
  return {
    row, col,
    rowCount: range.rowCount < 0 ? sheet.getRowCount() - row : Math.max(1, range.rowCount),
    colCount: range.colCount < 0 ? sheet.getColumnCount() - col : Math.max(1, range.colCount),
  };
}
