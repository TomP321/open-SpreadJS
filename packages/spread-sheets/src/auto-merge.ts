/**
 * Worksheet.autoMerge (TASK 46 item 2). The trial records the auto-merge request
 * on the worksheet instead of creating real spans: `autoMerge(range, ...)` returns
 * undefined, the request is persisted in the sheet JSON as `autoMergeRangeInfos`
 * entries `{range, direction, mode, sheetArea, selectionMode}`, re-registering an
 * overlapping range throws "The range should not intersect with exsit ranges."
 * (trial message, verbatim), and `AutoMergeDirection.none` cancels the entries that
 * intersect the given range. Defaults observed on the trial: direction column (1),
 * mode free (0), sheetArea viewport (3), selectionMode source (0).
 * The stored entries drive the trial's visual merge painting; our renderer paints
 * them in a follow-up task (see docs/STATUS.md).
 */
import { Range } from './primitives.js';
import type { Worksheet } from './worksheet.js';

export interface AutoMergeInfo {
  range: Range;
  direction: number;
  mode: number;
  sheetArea: number;
  selectionMode: number;
}

const noneValue = 0;

function num(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isSafeInteger(n) ? n : fallback;
}

function intersects(a: Range, b: Range): boolean {
  return a.row < b.row + b.rowCount && b.row < a.row + a.rowCount
    && a.col < b.col + b.colCount && b.col < a.col + a.colCount;
}

export function autoMerge(
  sheet: Worksheet,
  range: Range,
  direction?: number,
  mode?: number,
  sheetArea?: number,
  selectionMode?: number,
): void {
  if (!range || !(range instanceof Range))
    throw new TypeError('autoMerge requires a GC.Spread.Sheets.Range.');
  for (const [value, minimum] of [[range.row, 0], [range.col, 0], [range.rowCount, 1], [range.colCount, 1]] as const)
    if (!Number.isSafeInteger(value) || value < minimum)
      throw new RangeError('Row, column, rowCount and colCount must be non-negative safe integers.');
  const area = num(sheetArea, 3);
  const entry: AutoMergeInfo = {
    range: new Range(range.row, range.col, range.rowCount, range.colCount),
    direction: num(direction, 1),
    mode: num(mode, 0),
    sheetArea: area,
    selectionMode: num(selectionMode, 0),
  };
  const stored = sheet._autoMerges;
  if (entry.direction === noneValue) {
    // Trial: `AutoMergeDirection.none` cancels the auto-merge entries intersecting the range.
    for (let i = stored.length - 1; i >= 0; i--)
      if (stored[i]!.sheetArea === area && intersects(stored[i]!.range, entry.range)) stored.splice(i, 1);
    return;
  }
  for (const info of stored)
    if (info.sheetArea === area && intersects(info.range, entry.range))
      throw new Error('The range should not intersect with exsit ranges.');
  stored.push(entry);
}

/** Serialized trial-shaped entries for `Worksheet.toJSON()`. */
export function autoMergeInfosToJSON(sheet: Worksheet): Record<string, unknown>[] {
  return sheet._autoMerges.map(info => ({
    range: { row: info.range.row, col: info.range.col, rowCount: info.range.rowCount, colCount: info.range.colCount },
    direction: info.direction,
    mode: info.mode,
    sheetArea: info.sheetArea,
    selectionMode: info.selectionMode,
  }));
}

export function autoMergeInfosFromJSON(sheet: Worksheet, value: unknown): void {
  sheet._autoMerges = Array.isArray(value)
    ? value.map((raw: Record<string, unknown>) => {
      const r = (raw?.range ?? {}) as Record<string, number>;
      return {
        range: new Range(Number(r.row) || 0, Number(r.col) || 0, Number(r.rowCount) || 1, Number(r.colCount) || 1),
        direction: num(raw?.direction, 1),
        mode: num(raw?.mode, 0),
        sheetArea: num(raw?.sheetArea, 3),
        selectionMode: num(raw?.selectionMode, 0),
      };
    })
    : [];
}
