/**
 * `Worksheet.getUsedRange(type)`: the bounding box of everything the sheet uses
 * of the requested `UsedRangeType` kind, as a `Range`, or `null` when the sheet
 * has nothing of that kind. Like the trial, calling it without a type answers
 * `null`, formulas count as data, and a kind that spans a whole axis (row or
 * column grouping, row and column styles) keeps the `-1` extent.
 *
 * Kinds belonging to modules we do not model yet (`shape`, `chart`, `picture`,
 * `sparkLine`, `slicer`, `pivottable`, `dataRange`, `filter`, `table`,
 * `threadedComment`, `conditionFormat`) answer `null`; see docs/STATUS.md.
 */
import { GC } from '../generated/enums.js';
import { Range, Style, getFont } from '../primitives.js';
import type { Worksheet } from '../worksheet.js';

const USED = GC.Spread.Sheets.UsedRangeType;
const SheetArea = GC.Spread.Sheets.SheetArea;
const AREAS = [SheetArea.viewport, SheetArea.rowHeader, SheetArea.colHeader, SheetArea.corner];

interface Box {
  row: number;
  col: number;
  rowCount: number;
  colCount: number;
}

/** Union of boxes; a `-1` (whole-axis) extent propagates like the trial's. */
function union(boxes: Box[]): Range | null {
  if (!boxes.length) return null;
  let row = Infinity,
    col = Infinity,
    bottom = -Infinity,
    right = -Infinity,
    wholeRows = false,
    wholeColumns = false;
  for (const box of boxes) {
    row = Math.min(row, box.row);
    col = Math.min(col, box.col);
    if (box.rowCount < 0) wholeRows = true;
    else bottom = Math.max(bottom, box.row + box.rowCount - 1);
    if (box.colCount < 0) wholeColumns = true;
    else right = Math.max(right, box.col + box.colCount - 1);
  }
  return new Range(
    row,
    col,
    wholeRows ? -1 : bottom - row + 1,
    wholeColumns ? -1 : right - col + 1,
  );
}

export function usedRange(sheet: Worksheet, type: number | undefined): Range | null {
  if (type === undefined) return null;
  const all = (type >>> 0) === (USED.all >>> 0);
  const has = (kind: number) => all || (type & kind) === kind;
  const boxes: Box[] = [];
  for (const area of AREAS) {
    const data = sheet.area(area);
    if (has(USED.data) || has(USED.formula) || has(USED.style) || has(USED.tag) || has(USED.dataValidation))
      for (const [row, col, cell] of data.cells.entries()) {
        if (has(USED.data) && (cell.value !== undefined && cell.value !== null || cell.formula || cell.defaultValue !== undefined))
          boxes.push({ row, col, rowCount: 1, colCount: 1 });
        else if (has(USED.formula) && cell.formula) boxes.push({ row, col, rowCount: 1, colCount: 1 });
        else if (has(USED.style) && cell.style && (typeof cell.style === 'string' || Object.keys(cell.style).length || (cell.style instanceof Style && getFont(cell.style) !== undefined)))
          boxes.push({ row, col, rowCount: 1, colCount: 1 });
        else if (has(USED.tag) && cell.tag !== undefined) boxes.push({ row, col, rowCount: 1, colCount: 1 });
        else if (has(USED.dataValidation) && cell.validator) boxes.push({ row, col, rowCount: 1, colCount: 1 });
      }
    if (has(USED.span)) for (const span of data.spans) boxes.push({ row: span.row, col: span.col, rowCount: span.rowCount, colCount: span.colCount });
    if (has(USED.rowStyle)) for (const row of data.rowStyles.keys()) boxes.push({ row, col: 0, rowCount: 1, colCount: -1 });
    if (has(USED.colStyle)) for (const col of data.colStyles.keys()) boxes.push({ row: 0, col, rowCount: -1, colCount: 1 });
  }
  if (has(USED.comment)) for (const [row, col] of sheet.comments.positions()) boxes.push({ row, col, rowCount: 1, colCount: 1 });
  if (has(USED.axis)) {
    // The trial reports the whole grouped run (summary and detail rows) and
    // keeps the `-1` extent on the crossed axis.
    for (const [outline, vertical] of [
      [sheet.rowOutlines, true],
      [sheet.columnOutlines, false],
    ] as const) {
      const items = ((outline.toJSON() as { items?: unknown[] }).items ?? []) as unknown[];
      let run = -1;
      const flush = (end: number): void => {
        if (run < 0 || end < run) return;
        boxes.push(
          vertical
            ? { row: run, col: 0, rowCount: end - run + 1, colCount: -1 }
            : { row: 0, col: run, rowCount: -1, colCount: end - run + 1 },
        );
        run = -1;
      };
      for (let index = 0; index < items.length; index++) {
        if (items[index]) {
          if (run < 0) run = index;
        } else flush(index - 1);
      }
      flush(items.length - 1);
    }
  }
  return union(boxes);
}
