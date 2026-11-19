/**
 * GeneralSlicerData: the two-dimensional data model behind slicers.
 * Filters are stored per column; a data row is visible only when it passes
 * every column's active filter. Index helpers work on "exclusive" (distinct)
 * values, matching the public trial behaviour.
 */
import { GC } from '../../generated/enums.js';
import type {
  ISlicerConditional,
  ISlicerDataItem,
  ISlicerListener,
  ISlicerRangeConditional,
  SlicerCell,
} from './types.js';

const FilteredOutDataType = GC.Spread.Slicers.FilteredOutDataType;
const SlicerAggregateType = GC.Spread.Slicers.SlicerAggregateType;

interface ColumnFilter {
  exclusiveRowIndexes?: number[];
  ranges?: ISlicerRangeConditional[];
  isPreview: boolean;
}

const cellValue = (cell: SlicerCell): unknown =>
  cell !== null && typeof cell === 'object' && !(cell instanceof Date) && 'value' in cell ? (cell as { value?: unknown }).value : cell;
const cellText = (cell: SlicerCell): string =>
  cell !== null && typeof cell === 'object' && !(cell instanceof Date) && 'text' in cell
    ? String((cell as { text?: unknown }).text ?? '') : valueToText(cell);

function valueToText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return shortDate(value);
  return String(value);
}

export function shortDate(date: Date): string {
  return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
}

const asNumber = (value: unknown): number | null => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value))) return Number(value);
  return null;
};

interface RangeTable {
  /** Column index when the range filter created the table (never re-keyed). */
  colIndex: number;
}

export class GeneralSlicerData {
  columnNames: string[];
  data: SlicerCell[][];
  private filters = new Map<string, ColumnFilter>();
  private listeners: ISlicerListener[] = [];
  private suspended = false;
  private pending = false;
  /** Per-column distinct-value reference tables created by range filters. */
  private rangeTables: (RangeTable | undefined)[] = [];
  /** Never assigned: the trial's row-add cache walk dereferences a missing table. */
  private staleRangeTable?: unknown[][];

  constructor(data: SlicerCell[][], columnNames: string[]) {
    this.data = Array.isArray(data) ? data : [];
    this.columnNames = Array.isArray(columnNames) ? columnNames.slice() : [];
  }

  getColumnIndex(columnName: string): number {
    return this.columnNames.indexOf(columnName);
  }

  /** Re-read the underlying rows (tables/pivots override; the base data is fixed). */
  refresh(): void { /* base model is a snapshot */ }

  /** Trial: item greys out when other columns' filters remove all its rows. */
  hasRowForOtherColumns(_columnName: string, _exclusiveIndex: number): boolean { return true; }

  protected exclusive(columnName: string): string[] {
    const index = this.getColumnIndex(columnName);
    if (index < 0) return [];
    const seen = new Map<string, true>();
    const result: string[] = [];
    for (const row of this.data) {
      const text = cellText(row[index]);
      if (!seen.has(text)) { seen.set(text, true); result.push(text); }
    }
    return result;
  }

  private exclusiveIndexOf(columnName: string, rowIndex: number): number {
    const index = this.getColumnIndex(columnName);
    if (index < 0) return -1;
    const text = cellText(this.data[rowIndex]?.[index]);
    return this.exclusive(columnName).indexOf(text);
  }

  getData(columnName: string, range?: ISlicerRangeConditional): string[] {
    const index = this.getColumnIndex(columnName);
    if (index < 0) return [];
    const out: string[] = [];
    for (const row of this.data) {
      const value = cellValue(row[index]);
      if (range && !inRange(value, range)) continue;
      out.push(cellText(row[index]));
    }
    return out;
  }

  getExclusiveData(columnName: string): string[] {
    return this.exclusive(columnName);
  }

  getRowIndexes(columnName: string, exclusiveRowIndex: number): number[] {
    const texts = this.exclusive(columnName);
    const wanted = texts[exclusiveRowIndex];
    if (wanted === undefined) return [];
    const index = this.getColumnIndex(columnName);
    const out: number[] = [];
    this.data.forEach((row, r) => { if (cellText(row[index]) === wanted) out.push(r); });
    return out;
  }

  getExclusiveRowIndex(columnName: string, rowIndex: number): number {
    return this.exclusiveIndexOf(columnName, rowIndex);
  }

  private keepColumnRows(columnName: string, filter: ColumnFilter | undefined): Set<number> {
    const index = this.getColumnIndex(columnName);
    const kept = new Set<number>();
    if (index < 0) return kept;
    this.data.forEach((row, r) => {
      const value = cellValue(row[index]);
      const text = cellText(row[index]);
      const eIdx = this.exclusive(columnName).indexOf(text);
      let ok = true;
      if (filter?.exclusiveRowIndexes) ok = filter.exclusiveRowIndexes.includes(eIdx);
      if (ok && filter?.ranges?.length) ok = filter.ranges.some(range => inRange(value, range));
      if (ok) kept.add(r);
    });
    return kept;
  }

  /** Rows surviving every active column filter (preview filters included). */
  protected visibleRows(): Set<number> {
    let visible: Set<number> | null = null;
    for (const name of this.columnNames) {
      const filter = this.filters.get(name);
      if (!filter) continue;
      const kept = this.keepColumnRows(name, filter);
      if (visible === null) visible = kept;
      else {
        const previous: Set<number> = visible;
        visible = new Set([...previous].filter((r: number) => kept.has(r)));
      }
    }
    if (visible === null) visible = new Set(this.data.map((_, r) => r));
    return visible;
  }

  /** Rows surviving every filter except the named column's own filter. */
  protected rowsKeptExcept(columnName: string): Set<number> {
    let visible: Set<number> | null = null;
    for (const name of this.columnNames) {
      if (name === columnName) continue;
      const filter = this.filters.get(name);
      if (!filter) continue;
      const kept = this.keepColumnRows(name, filter);
      if (visible === null) visible = kept;
      else {
        const previous: Set<number> = visible;
        visible = new Set([...previous].filter((r: number) => kept.has(r)));
      }
    }
    return visible ?? new Set(this.data.map((_, r) => r));
  }

  /** Exclusive indexes the column filter keeps (null when the column has no filter). */
  getSelectedIndexes(columnName: string): number[] | null {
    const filter = this.filters.get(columnName);
    if (!filter) return null;
    const texts = this.exclusive(columnName);
    let kept = filter.exclusiveRowIndexes ? [...filter.exclusiveRowIndexes] : texts.map((_, i) => i);
    if (filter.ranges?.length) kept = kept.filter(i => {
      const index = this.getColumnIndex(columnName);
      return this.getRowIndexes(columnName, i).some(r =>
        filter.ranges!.some(range => inRange(cellValue(this.data[r]?.[index]), range)));
    });
    return kept;
  }

  getFilteredIndexes(columnName: string, _isPreview?: boolean): number[] {
    const texts = this.exclusive(columnName);
    const visible = this.visibleRows();
    const out: number[] = [];
    const seen = new Set<number>();
    const index = this.getColumnIndex(columnName);
    [...visible].sort((a, b) => a - b).forEach(row => {
      const eIdx = texts.indexOf(cellText(this.data[row]?.[index]));
      if (eIdx >= 0 && !seen.has(eIdx)) { seen.add(eIdx); out.push(eIdx); }
    });
    return out;
  }

  getFilteredOutIndexes(columnName: string, filteredOutDataType: number, _isPreview?: boolean): number[] {
    const texts = this.exclusive(columnName);
    const index = this.getColumnIndex(columnName);
    if (index < 0) return [];
    const filter = this.filters.get(columnName);
    const selfKept = new Set<number>();
    if (filter?.exclusiveRowIndexes) filter.exclusiveRowIndexes.forEach(i => selfKept.add(i));
    else texts.forEach((_, i) => selfKept.add(i));
    if (filter?.ranges?.length) texts.forEach((text, i) => {
      const rows = this.getRowIndexes(columnName, i);
      if (!rows.some(r => filter.ranges!.some(range => inRange(cellValue(this.data[r]?.[index]), range)))) selfKept.delete(i);
    });
    const otherKept = this.rowsKeptExcept(columnName);
    const otherVisible = new Set<number>();
    this.data.forEach((row, r) => { if (otherKept.has(r)) otherVisible.add(texts.indexOf(cellText(row[index]))); });
    const selfHidden: number[] = [];
    const otherHidden: number[] = [];
    texts.forEach((_, i) => {
      if (!selfKept.has(i)) selfHidden.push(i);
      else if (!otherVisible.has(i)) otherHidden.push(i);
    });
    if (filteredOutDataType === FilteredOutDataType.byCurrentColumn) return selfHidden;
    if (filteredOutDataType === FilteredOutDataType.byOtherColumns) return otherHidden;
    return [...selfHidden, ...otherHidden];
  }

  getFilteredRanges(columnName: string): ISlicerRangeConditional[] {
    return this.filters.get(columnName)?.ranges ? this.filters.get(columnName)!.ranges!.map(r => ({ ...r })) : [];
  }

  getFilteredOutRanges(_columnName: string): ISlicerRangeConditional[] {
    return [];
  }

  getFilteredRowIndexes(): number[] {
    return [...this.visibleRows()].sort((a, b) => a - b);
  }

  getFilteredOutRowIndexes(): number[] {
    const visible = this.visibleRows();
    const out: number[] = [];
    this.data.forEach((_, r) => { if (!visible.has(r)) out.push(r); });
    return out;
  }

  doFilter(columnName: string, conditional: ISlicerConditional, isPreview = false): void {
    const index = this.getColumnIndex(columnName);
    if (index < 0) return;
    const filter: ColumnFilter = {
      exclusiveRowIndexes: conditional?.exclusiveRowIndexes ? [...conditional.exclusiveRowIndexes] : undefined,
      ranges: conditional?.ranges ? conditional.ranges.map(r => ({ ...r })) : undefined,
      isPreview: !!isPreview,
    };
    this.filters.set(columnName, filter);
    // Trial: a ranges condition builds a distinct-value reference table for the
    // column, remembered by index (later column removals do NOT re-key it).
    this.rangeTables[index] = filter.ranges?.length ? { colIndex: index } : undefined;
    this.notifyFiltered(isPreview);
  }

  doUnfilter(columnName: string): void {
    const index = this.getColumnIndex(columnName);
    if (index >= 0) this.rangeTables[index] = undefined; // trial: also drops the reference table
    this.filters.delete(columnName);
    this.notifyFiltered(false);
  }

  /**
   * Trial: clearPreview drops preview filters but LEAVES their reference
   * tables behind (probe of 2026-11-14: onRowsAdded still throws afterwards).
   */
  clearPreview(): void {
    for (const [name, filter] of [...this.filters]) if (filter.isPreview) this.filters.delete(name);
    this.notifyFiltered(false);
  }

  inPreview(): boolean {
    for (const filter of this.filters.values()) if (filter.isPreview) return true;
    return false;
  }

  attachListener(listener: ISlicerListener): void {
    if (listener && !this.listeners.includes(listener)) this.listeners.push(listener);
  }

  detachListener(listener: ISlicerListener): void {
    this.listeners = this.listeners.filter(item => item !== listener);
  }

  protected getListeners(): ISlicerListener[] {
    return this.listeners;
  }

  suspendFilteredEvents(): void {
    this.suspended = true;
  }

  resumeFilteredEvents(): void {
    this.suspended = false;
    if (this.pending) { this.pending = false; this.notifyFiltered(false); }
  }

  protected notifyFiltered(isPreview: boolean): void {
    if (this.suspended) { this.pending = true; return; }
    const rowIndexes = this.getFilteredRowIndexes();
    for (const listener of this.listeners.slice()) listener.onFiltered?.({ isPreview, rowIndexes });
  }

  onColumnNameChanged(oldName: string, newName: string): void {
    const index = this.columnNames.indexOf(oldName);
    if (index < 0) return;
    this.columnNames[index] = newName;
    const filter = this.filters.get(oldName);
    if (filter) { this.filters.delete(oldName); this.filters.set(newName, filter); }
    for (const listener of this.listeners.slice()) listener.onColumnNameChanged?.(oldName, newName);
  }

  onColumnsRemoved(colIndex: number, colCount: number): void {
    const removed = this.columnNames.slice(colIndex, colIndex + colCount);
    this.columnNames.splice(colIndex, colCount);
    for (const row of this.data) row.splice(colIndex, colCount);
    // Trial: reference tables shift with the column array, so a table left of
    // the removal keeps its (now stale) recorded colIndex and walks from 0.
    this.rangeTables.splice(colIndex, colCount);
    for (const name of removed) { this.filters.delete(name); for (const listener of this.listeners.slice()) listener.onColumnRemoved?.(name); }
  }

  onDataChanged(changedDataItems: ISlicerDataItem | ISlicerDataItem[]): void {
    const items = Array.isArray(changedDataItems) ? changedDataItems : null;
    // Trial (probe 2026-11-14): only the ARRAY form writes into the matrix; a
    // single object fires the event without touching the data. Either way the
    // listeners get exactly one onDataChanged call and no onFiltered re-notify.
    if (items) {
      for (const item of items) {
        const index = this.getColumnIndex(item.columnName);
        const row = this.data[item.row ?? item.rowIndex];
        if (index < 0 || !row) continue;
        row[index] = item.data as SlicerCell;
      }
    }
    const payload = items ?? [changedDataItems as ISlicerDataItem];
    for (const listener of this.listeners.slice()) listener.onDataChanged?.(payload);
  }

  onRowsAdded(rowIndex: number, rowCount: number): void {
    // The walk starts reflect the pre-insert table state (trial probe 2026-11-14).
    const starts = this.rangeTables.map(table => (table ? this.rangeTableStart(table) : null));
    for (let i = 0; i < rowCount; i++) this.data.splice(rowIndex + i, 0, this.columnNames.map(() => null as SlicerCell));
    // Trial: the inserted rows stay, but the range-cache rebuild walk throws a
    // TypeError before onRowsChanged fires (probe 2026-11-14: message carries
    // the first read index — the column's distinct-value count, or 0 when the
    // column position is stale / contains null cells after the filter was made).
    this.walkRangeTables(starts);
    for (const listener of this.listeners.slice()) listener.onRowsChanged?.(rowIndex, rowCount, true);
  }

  private walkRangeTables(starts: (number | null)[]): void {
    const missing = this.staleRangeTable;
    for (const start of starts) {
      if (start === null) continue;
      for (let i = start; i >= 0; i--) void missing![i];
    }
  }

  /** Distinct cell values in the table's recorded column; 0 when cells went stale. */
  private rangeTableStart(table: RangeTable): number {
    const seen = new Set<unknown>();
    for (const row of this.data) {
      const cell = row[table.colIndex];
      if (cell == null) return 0;
      seen.add(cellValue(cell));
    }
    return seen.size;
  }

  onRowsRemoved(rowIndex: number, rowCount: number): void {
    this.data.splice(rowIndex, rowCount);
    for (const listener of this.listeners.slice()) listener.onRowsChanged?.(rowIndex, rowCount, false);
  }

  onFiltered(): void {
    this.notifyFiltered(this.inPreview());
  }

  aggregateData(columnName: string, aggregateType: number, range?: ISlicerRangeConditional): number {
    const index = this.getColumnIndex(columnName);
    if (index < 0) return 0;
    const values = this.data.map(row => cellValue(row[index])).filter(value => !range || inRange(value, range));
    const numbers = values.map(asNumber).filter((value): value is number => value !== null);
    switch (aggregateType) {
      case SlicerAggregateType.count: return numbers.length;
      case SlicerAggregateType.counta: return values.filter(v => v !== null && v !== undefined && v !== '').length;
      case SlicerAggregateType.sum: return numbers.reduce((a, b) => a + b, 0);
      case SlicerAggregateType.average: return numbers.length ? numbers.reduce((a, b) => a + b, 0) / numbers.length : 0;
      case SlicerAggregateType.max: return numbers.length ? Math.max(...numbers) : 0;
      case SlicerAggregateType.min: return numbers.length ? Math.min(...numbers) : 0;
      case SlicerAggregateType.product: return numbers.reduce((a, b) => a * b, 1);
      case SlicerAggregateType.stdev: return std(numbers, false);
      case SlicerAggregateType.stdevp: return std(numbers, true);
      case SlicerAggregateType.vars: return variance(numbers, false);
      case SlicerAggregateType.varp: return variance(numbers, true);
      default: return 0;
    }
  }

  getListener(): ISlicerListener[] {
    return this.listeners.slice();
  }
}

function inRange(value: unknown, range: ISlicerRangeConditional): boolean {
  const number = asNumber(value);
  if (number === null) return false;
  const min = typeof range.min === 'number' ? range.min : -Infinity;
  const max = typeof range.max === 'number' ? range.max : Infinity;
  return number >= min && number <= max;
}

function variance(numbers: number[], population: boolean): number {
  if (!numbers.length) return 0;
  const mean = numbers.reduce((a, b) => a + b, 0) / numbers.length;
  const sum = numbers.reduce((a, b) => a + (b - mean) * (b - mean), 0);
  const divisor = population ? numbers.length : numbers.length - 1;
  return divisor > 0 ? sum / divisor : 0;
}

function std(numbers: number[], population: boolean): number {
  return Math.sqrt(variance(numbers, population));
}
