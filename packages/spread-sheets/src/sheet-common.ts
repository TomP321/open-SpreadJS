/**
 * Shared model plumbing used by `worksheet.ts`, `workbook.ts` and the
 * `sheet-*.ts` helper modules: coordinate guards, cell/area storage shapes,
 * serialization option types and the paint/calc batching helper.
 *
 * This module is a LEAF: it imports only other leaves (enums, primitives,
 * structures) so no class module can be dragged into a cycle through it.
 */
import { CellStore } from './structures.js';
import { Range, Style } from './primitives.js';
import workbookDefaults from './workbook-defaults.json';
import worksheetDefaults from './worksheet-defaults.json';

export function coordinate(value: number, sentinel = false): void {
  if (!Number.isSafeInteger(value) || value < (sentinel ? -1 : 0))
    throw new RangeError('Cell coordinates must be non-negative safe integers');
}
export function count(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new RangeError('Count must be a non-negative safe integer');
}
/** Subtracts a rectangle from another, returning up to four remaining rectangles. */
export function subtractRange(source: Range, cut: Range): Range[] {
  const sx1 = source.row, sy1 = source.col, sx2 = sx1 + source.rowCount, sy2 = sy1 + source.colCount;
  const cx1 = Math.max(sx1, cut.row), cy1 = Math.max(sy1, cut.col);
  const cx2 = Math.min(sx2, cut.row + cut.rowCount), cy2 = Math.min(sy2, cut.col + cut.colCount);
  if (cx1 >= cx2 || cy1 >= cy2) return [new Range(source.row, source.col, source.rowCount, source.colCount)];
  const parts: Range[] = [];
  if (cx1 > sx1) parts.push(new Range(sx1, sy1, cx1 - sx1, source.colCount));
  if (cx2 < sx2) parts.push(new Range(cx2, sy1, sx2 - cx2, source.colCount));
  if (cy1 > sy1) parts.push(new Range(cx1, sy1, cx2 - cx1, cy1 - sy1));
  if (cy2 < sy2) parts.push(new Range(cx1, cy2, cx2 - cx1, sy2 - cy2));
  return parts;
}
export interface CellData {
  value?: unknown;
  formula?: string;
  arrayFormula?: { rowCount: number; colCount: number };
  /** Per-cell style record: a named-style string, or the compacted/frozen internal
   *  style record (TASK 79) handed to the public API as a fresh `Style` view on read. */
  style?: Style | string;
  tag?: unknown;
  bindingPath?: string;
  defaultValue?: unknown;
  altText?: unknown;
  hyperlink?: unknown;
  validator?: unknown;
}
export interface AreaData {
  cells: CellStore<CellData>;
  rowStyles: Map<number, Style | string>;
  colStyles: Map<number, Style | string>;
  defaultStyle: Style;
  spans: Range[];
  tag?: unknown;
}
export interface DirtyCell {
  row: number;
  col: number;
  oldValue: unknown;
  newValue: unknown;
}
export interface SerializationOptions {
  ignoreStyle?: boolean;
  ignoreFormula?: boolean;
  [key: string]: unknown;
}
export type LiveWorkbookOptions = Omit<
  typeof workbookDefaults,
  'backgroundImage' | 'grayAreaBackColor' | 'showHorizontalScrollbar' | 'showVerticalScrollbar' | 'customList'
> & {
  backgroundImage: string | null;
  grayAreaBackColor: string | null;
  showHorizontalScrollbar: boolean | 'auto';
  showVerticalScrollbar: boolean | 'auto';
  customList: string[][];
  font?: string | null;
  [key: string]: unknown;
};
export type WorkbookOptions = Partial<LiveWorkbookOptions> & { sheetCount?: number };
export type WorksheetOptions = typeof worksheetDefaults & {
  sheetTabColor?: string;
  selectionBackColor?: string;
  selectionBorderColor?: string;
  [key: string]: unknown;
};
export class Batching {
  constructor(
    private suspended: () => boolean = () => false,
    private onDirty?: (layout: boolean) => void,
  ) {}
  paint = 0;
  calc = 0;
  /**
   * Set while the calc service is suspended once more value-change
   * notifications than `CALC_QUEUE_BULK_THRESHOLD` have arrived: the flush
   * then recomputes every registered formula (a superset of the dependents of
   * all dropped cells) instead of walking the reverse edges per cell.
   */
  calcBulk = false;
  calcBulkCount = 0;
  dirty = false;
  layoutDirty = false;
  onInvalidate?: (layout: boolean) => void;
  invalidate(layout = false): void {
    this.dirty = true;
    this.layoutDirty ||= layout;
    this.onDirty?.(layout);
    if (!this.paint && !this.suspended()) this.flush();
  }
  flush(): void {
    if (!this.dirty || this.paint || this.suspended()) return;
    const layout = this.layoutDirty;
    this.dirty = false;
    this.layoutDirty = false;
    this.onInvalidate?.(layout);
  }
}
