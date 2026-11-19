/**
 * Worksheet data/state API (task 38 item 3): the trial-verified behaviour of
 * `getDirtyRows`/`getInsertRows`/`getDeletedRows`, `getDataItem`/`getDataColumnName`,
 * `getSortState`, `isSelected`, `editorStatus`, `hitTest` and `reset`.
 *
 * Every rule here comes from calling the official 19.2.5 trial through the
 * public API (see `.probe/report-item3*.json`); nothing was read from the
 * official sources.
 */
import { GC } from './generated/enums.js';
import { axisSlots, type AxisSlot } from './rendering-geometry.js';
import type { AxisLayout } from './structures.js';
import type { Worksheet } from './worksheet.js';
import { worksheetFromJSON } from './sheet-serialization.js';

const SheetArea = GC.Spread.Sheets.SheetArea;
const EditorStatus = GC.Spread.Sheets.EditorStatus;

/** `getDirtyRows`/`getInsertRows` entry (the trial always carries `item`). */
export interface RowChangeInfo {
  row: number;
  item: unknown;
}
/** `getDeletedRows` entry (the trial carries the removed row's data item). */
export interface DeletedRowInfo {
  row: number;
  originalItem: unknown;
}
/** `getSortState` result, as the trial reports the last `sortRange` call. */
export interface SortState {
  row: number;
  col: number;
  rowCount: number;
  colCount: number;
  byRow: boolean;
  sortConditions: unknown[];
}
/** `hitTest` result (`IHitTestInformation`); the trial's `resizeInfo`/`dragInfo` extras are not reproduced. */
export interface HitTestInformation {
  x: number;
  y: number;
  rowViewportIndex: number | null;
  colViewportIndex: number | null;
  row?: number;
  col?: number;
  hitTestType: number;
}

/**
 * Row index set kept as merged intervals, so a million-row structural change
 * stays cheap (`getDeletedRows`/`getInsertRows` only expand when asked).
 */
export class RowIndexList {
  private spans: { start: number; end: number }[] = [];
  /** Expanded row indices, ascending: what the trial reports, one entry per row. */
  get values(): number[] {
    const rows: number[] = [];
    for (const span of this.spans) for (let row = span.start; row < span.end; row++) rows.push(row);
    return rows;
  }
  add(start: number, count: number): void {
    if (count <= 0) return;
    this.spans.push({ start, end: start + count });
    this.merge();
  }
  /** Mirrors the trial: entries inside the removed band leave, the rest shift up. */
  remove(start: number, count: number): void {
    if (count <= 0) return;
    const end = start + count;
    const next: { start: number; end: number }[] = [];
    for (const span of this.spans) {
      if (span.end <= start) next.push(span);
      else if (span.start >= end) next.push({ start: span.start - count, end: span.end - count });
      else {
        if (span.start < start) next.push({ start: span.start, end: start });
        if (span.end > end) next.push({ start: start, end: start + (span.end - end) });
      }
    }
    this.spans = next;
    this.merge();
  }
  clear(): void {
    this.spans = [];
  }
  private merge(): void {
    this.spans.sort((a, b) => a.start - b.start);
    const merged: { start: number; end: number }[] = [];
    for (const span of this.spans) {
      const last = merged.at(-1);
      if (last && span.start <= last.end) last.end = Math.max(last.end, span.end);
      else merged.push(span);
    }
    this.spans = merged;
  }
}

/** `getDirtyRows`: one entry per row that holds dirty cells, ascending. */
export function getDirtyRows(sheet: Worksheet): RowChangeInfo[] {
  const rows = new Set<number>();
  for (const [row] of sheet.dirty.entries()) rows.add(row);
  return [...rows].sort((a, b) => a - b).map((row) => ({ row, item: null }));
}

/** `getInsertRows`: rows added since the last `clearPendingChanges`. */
export function getInsertRows(sheet: Worksheet): RowChangeInfo[] {
  return sheet.insertedRows.values.map((row) => ({ row, item: null }));
}

/** `getDeletedRows`: rows removed since the last `clearPendingChanges`. */
export function getDeletedRows(sheet: Worksheet): DeletedRowInfo[] {
  return sheet.deletedRows.values.map((row) => ({ row, originalItem: null }));
}

/** Structural row change bookkeeping, called by `sheet-shifts.ts`. */
export function noteRowChange(sheet: Worksheet, index: number, count: number, removed: boolean): void {
  if (removed) {
    sheet.insertedRows.remove(index, count);
    sheet.deletedRows.add(index, count);
  } else {
    sheet.insertedRows.add(index, count);
    sheet.deletedRows.remove(index, count);
  }
}

/** The bound records, whichever binding style the sheet uses. */
function boundItems(sheet: Worksheet): unknown[] | null {
  if (sheet.cellSource) {
    const source = sheet.cellSource.getSource();
    return Array.isArray(source) ? source : null;
  }
  return Array.isArray(sheet.source) ? sheet.source : null;
}

/**
 * `getDataItem`: the bound record of that row. Like the trial, a row outside
 * the records answers an object carrying the registered data column names with
 * `null` values (an empty object when no data column is registered), and an
 * unbound sheet answers `null`.
 */
export function getDataItem(sheet: Worksheet, row: number): unknown {
  const items = boundItems(sheet);
  if (!items) return null;
  const item = items[row];
  if (item !== undefined) return item;
  const result: Record<string, unknown> = {};
  for (const [, column] of sheet.boundColumns) result[column.name] = null;
  return result;
}

/**
 * `getDataColumnName`: the data column name bound to that sheet column - `null`
 * when nothing is bound or the index is outside the sheet, `undefined` when the
 * column exists but carries no data column (trial-verified distinction).
 */
export function getDataColumnName(sheet: Worksheet, column: number): string | null | undefined {
  if (!boundItems(sheet)) return null;
  if (column < 0 || column >= sheet.getColumnCount()) return null;
  return sheet.boundColumns.get(column)?.name ?? undefined;
}

/** `getSortState`: `undefined` on a fresh sheet, `null` after `reset` (both trial values). */
export function getSortState(sheet: Worksheet): SortState | null | undefined {
  return sheet.sortStateValue;
}

/** Records the state the trial keeps for the last `sortRange` call. */
export function noteSortRange(
  sheet: Worksheet,
  row: number,
  col: number,
  rowCount: number,
  colCount: number,
  byRows: boolean,
  sortInfo: unknown[],
  succeeded: boolean,
): void {
  if (succeeded) sheet.sortStateValue = { row, col, rowCount, colCount, byRow: byRows, sortConditions: sortInfo };
}

/**
 * `isSelected`: getter returns the stored state (the trial keeps the raw value,
 * so `isSelected(1)` makes `isSelected()` answer `1`); a setter mirrors it into
 * the sheet JSON and answers the sheet, like the trial. A sheet nobody selected
 * answers whether it is the workbook's active sheet - a sheet in no workbook is
 * never selected (`false`).
 */
export function isSelected(sheet: Worksheet, argc: number, value?: unknown): unknown {
  if (!argc) {
    const stored = sheet.settings.isSelected;
    if (stored !== undefined) return stored;
    return !!sheet.parent && sheet.parent.getActiveSheet() === sheet;
  }
  sheet.settings.isSelected = value;
  return sheet;
}

/** `editorStatus`/`startEdit`/`setEditorStatus`/`endEdit`/`isEditing`, trial-verified. */
export function editorStatus(sheet: Worksheet): number {
  return sheet.editorStatusValue ?? EditorStatus.ready;
}
export function startEdit(sheet: Worksheet): void {
  sheet.editorStatusValue = EditorStatus.enter;
}
export function setEditorStatus(sheet: Worksheet, status: number): void {
  sheet.editorStatusValue = status;
}
export function endEdit(sheet: Worksheet, _ignoreValueChange?: boolean): boolean {
  sheet.editorStatusValue = EditorStatus.ready;
  return true;
}
export function isEditing(sheet: Worksheet): boolean {
  return editorStatus(sheet) !== EditorStatus.ready;
}

/**
 * `reset`: back to the state a freshly created sheet has (name and workbook
 * position kept), like the trial: values, formulas, styles, spans, comments,
 * tags, hyperlinks, validators, outlines, filters, tables, sparklines, frozen
 * panes, dimensions and selections return to the defaults, dirty/inserted/
 * deleted rows and the sort state are cleared, and the selection flag returns
 * to whether the sheet is the workbook's active sheet.
 */
export function reset(sheet: Worksheet): void {
  const name = sheet.name();
  worksheetFromJSON(sheet, { name });
  sheet.insertedRows.clear();
  sheet.deletedRows.clear();
  sheet.dirty.clear();
  sheet.editorStatusValue = EditorStatus.ready;
  sheet.settings.isSelected = !!sheet.parent && sheet.parent.getActiveSheet() === sheet;
  sheet.rowFilterValue = null;
  sheet.batch.invalidate(true);
}

/** The trial numbers its sheets monotonically (`_id`) and gives each a random 8-character token (`__ID__`). */
let sheetIdCounter = 0;
const TOKEN_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

/** Fresh identifier for a sheet: the token `getId()` answers and `__ID__` carries. */
export function nextSheetToken(): { id: number; token: string } {
  let token = '';
  for (let index = 0; index < 8; index++)
    token += TOKEN_ALPHABET[Math.floor(Math.random() * TOKEN_ALPHABET.length)]!;
  return { id: ++sheetIdCounter, token };
}

/** The viewport bands a point can fall into: -1 header strip, 0 frozen, 1 scrollable, 2 trailing frozen. */
function bandIndex(point: number, origin: number, extent: number, leadingEnd: number, trailingStart: number): number | null {
  if (point <= 0 || point >= extent) return null;
  if (point < origin) return -1;
  if (point === origin || point === leadingEnd || point === trailingStart) return null;
  if (point > origin && point < leadingEnd) return 0;
  if (point > leadingEnd && point < trailingStart) return 1;
  if (point > trailingStart) return 2;
  return null;
}

function slotIndex(slots: AxisSlot[], point: number): number | undefined {
  return slots.find((slot) => point >= Math.max(slot.min, slot.position) && point < Math.min(slot.max, slot.position + slot.size))?.index;
}

/** Bands and indices of one axis for a viewport-relative coordinate. */
function hitAxis(
  axis: AxisLayout,
  point: number,
  origin: number,
  extent: number,
  offset: number,
  zoom: number,
  leading: number,
  trailing: number,
  viewportBands: boolean,
): { index: number | null; band: number | null } {
  const clampedLeading = Math.min(leading, axis.count),
    clampedTrailing = Math.min(trailing, Math.max(0, axis.count - clampedLeading));
  const leadingEnd = Math.min(extent, origin + axis.prefixSum(clampedLeading) * zoom),
    trailingStart = Math.max(leadingEnd, extent - axis.sum(axis.count - clampedTrailing, clampedTrailing) * zoom);
  const band = bandIndex(point, origin, extent, leadingEnd, trailingStart);
  if (band === null) return { index: null, band: null };
  if (band === -1) return { index: 0, band };
  // A sheet the workbook does not display has no viewport bands (trial-verified).
  if (!viewportBands) return { index: null, band: null };
  return { index: slotIndex(axisSlots(axis, origin, extent, offset, zoom, clampedLeading, clampedTrailing), point) ?? null, band };
}

/**
 * `hitTest(x, y)`: the trial's `IHitTestInformation` core fields. Coordinates
 * are sheet-viewport pixels (the top-left header corner is `(0, 0)`). Uses the
 * attached renderer's geometry when the sheet is displayed; a headless sheet
 * answers with its own layout and no scroll offset. The trial's boundary
 * extras (`resizeInfo`, `dragInfo`, `XL`/`YL`) are not reproduced - see
 * docs/STATUS.md.
 */
export function hitTest(sheet: Worksheet, x: number, y: number): HitTestInformation {
  const view = sheet.parent?._renderer?.();
  const displayed = !!view && view.sheet === sheet;
  // The renderer measures in its animation frame; a synchronous hit test has to
  // make sure the viewport geometry exists before reading it.
  if (displayed && (!view!.viewWidth || !view!.viewHeight)) view!.layout();
  const zoom = displayed ? view!.zoom : 1;
  const gutters = sheet._outlineGutters();
  const headerWidth = displayed
    ? view!.headerWidth
    : sheet.options.rowHeaderVisible
      ? sheet._columnLayout(SheetArea.rowHeader).prefixSum(sheet.getColumnCount(SheetArea.rowHeader)) * zoom + gutters.row
      : 0;
  const headerHeight = displayed
    ? view!.headerHeight
    : sheet.options.colHeaderVisible
      ? sheet._rowLayout(SheetArea.colHeader).prefixSum(sheet.getRowCount(SheetArea.colHeader)) * zoom + gutters.col
      : 0;
  const viewWidth = displayed ? view!.viewWidth : Number.POSITIVE_INFINITY;
  const viewHeight = displayed ? view!.viewHeight : Number.POSITIVE_INFINITY;
  const columns = hitAxis(sheet._columnLayout(SheetArea.viewport), x, headerWidth, viewWidth, displayed ? view!.scrollX : 0, zoom, sheet.frozenColumnCount(), sheet.frozenTrailingColumnCount(), displayed);
  const rows = hitAxis(sheet._rowLayout(SheetArea.viewport), y, headerHeight, viewHeight, displayed ? view!.scrollY : 0, zoom, sheet.frozenRowCount(), sheet.frozenTrailingRowCount(), displayed);
  // The trial always creates the `row`/`col` own properties in this key order
  // (they stay `undefined` when the point is not inside a row/column band, which
  // is what `Object.keys` and `JSON.stringify` of the trial's result show).
  return {
    x,
    y,
    rowViewportIndex: rows.band,
    colViewportIndex: columns.band,
    row: rows.band === -1 ? 0 : rows.band !== null && rows.index !== null ? rows.index : undefined,
    col: columns.band === -1 ? 0 : columns.band !== null && columns.index !== null ? columns.index : undefined,
    hitTestType:
      rows.band === -1 && columns.band === -1
        ? SheetArea.corner
        : rows.band === -1
          ? SheetArea.colHeader
          : columns.band === -1
            ? SheetArea.rowHeader
            : SheetArea.viewport,
  };
}
