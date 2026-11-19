/**
 * Sorting and row filters. The filter model mirrors the trial's public API and
 * serialisation, including its quirks (the header row participates in value
 * filtering and sortColumn reorders the whole range).
 */
import { Range } from '../primitives.js';
import { GC } from '../generated/enums.js';
import { Events } from '../events.js';
import type { Worksheet } from '../worksheet.js';
import { Condition } from './conditions.js';
import { serializeValue, deserializeValue, type JsonRecord } from '../serialization.js';

const SortState = GC.Spread.Sheets.SortState;
const Filter = GC.Spread.Sheets.Filter;

export const SortStateEnum = SortState;

export interface SortInfo {
  index: number;
  ascending: boolean;
}

function compareValues(a: unknown, b: unknown): number {
  if (a instanceof Date || b instanceof Date) {
    const av = a instanceof Date ? a.getTime() : Number(a);
    const bv = b instanceof Date ? b.getTime() : Number(b);
    return Number.isNaN(av) || Number.isNaN(bv) ? 0 : av - bv;
  }
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'number') return -1;
  if (typeof b === 'number') return 1;
  const at = a == null ? '' : String(a);
  const bt = b == null ? '' : String(b);
  const al = at.toLowerCase();
  const bl = bt.toLowerCase();
  if (al === bl) {
    // Empty values sort last for ascending comparisons in the trial.
    return at === '' ? 1 : bt === '' ? -1 : 0;
  }
  return al < bl ? -1 : 1;
}

interface SortRangeOptions {
  byRows: boolean;
  sortInfo: (SortInfo & {
    compare?: (a: unknown, b: unknown) => number;
    compareFunction?: (a: unknown, b: unknown) => number;
    backColor?: string;
    fontColor?: string;
    order?: 'top' | 'bottom';
  })[];
}

/**
 * Sorts a rectangle of cells by a list of columns (byRows=false: values down a
 * column order rows) or rows (byRows=true: values across a row order columns).
 * Cell styles, tags, validators, hyperlinks and comments move with their cell;
 * formulas do not move (matching the trial), and whole-row/column sizes are
 * unchanged.
 */
export function sortRange(
  sheet: Worksheet,
  row: number,
  column: number,
  rowCount: number,
  columnCount: number,
  byRows: boolean,
  sortInfo: SortRangeOptions['sortInfo'],
  sortOption?: { sortByValue?: boolean; sortByColor?: boolean },
): boolean {
  const range = new Range(row, column, rowCount, columnCount).normalized(
    sheet.getRowCount(),
    sheet.getColumnCount(),
  );
  if (range.rowCount <= 0 || range.colCount <= 0 || !sortInfo?.length) return false;
  const info = {
    sheet,
    sheetName: sheet.name(),
    byRows,
    range: new Range(range.row, range.col, range.rowCount, range.colCount),
    sortInfo: sortInfo.map((item) => ({ ...item })),
    cancel: false,
  };
  sheet._emit(Events.RangeSorting, info);
  if (info.cancel) return false;
  // byRows=true reorders rows using the values of the columns named by
  // sortInfo.index; byRows=false reorders columns using the rows.
  const count = byRows ? range.rowCount : range.colCount;
  const order = Array.from({ length: count }, (_, index) => index);
  /**
   * The trial accepts both condition shapes: the flat `{ index, ascending }`
   * entry and the `{ sortBy: [{ index, ascending }], rowTop }` wrapper (the
   * Designer writes the second one). Only the sort keys are read; `rowTop` has
   * no effect on the trial either (verified by the probe).
   */
  const keysOf = (item: SortRangeOptions['sortInfo'][number]): { index: number; ascending?: boolean }[] => {
    const nested = (item as { sortBy?: { index: number; ascending?: boolean }[] }).sortBy;
    return nested?.length ? nested : [{ index: item.index, ascending: item.ascending }];
  };
  const valueFor = (position: number, item: { index: number }): unknown =>
    byRows
      ? sheet.getValue(range.row + position, range.col + item.index)
      : sheet.getValue(range.row + item.index, range.col + position);
  const colorFor = (position: number, kind: 'backColor' | 'foreColor', item: { index: number }): string | undefined => {
    // Rows carry their color in the sorted column, columns in the sorted row.
    const style = byRows
      ? sheet.getStyle(range.row + position, range.col + item.index)
      : sheet.getStyle(range.row + item.index, range.col + position);
    const value = style ? style[kind] : undefined;
    return typeof value === 'string' ? value : undefined;
  };
  const compare = (a: number, b: number): number => {
    for (const item of sortInfo) {
      for (const key of keysOf(item)) {
        let result: number;
        const fn = item.compare ?? item.compareFunction;
        if (fn) result = fn(valueFor(a, key), valueFor(b, key));
        else if (item.backColor !== undefined || item.fontColor !== undefined) {
          const kind: 'backColor' | 'foreColor' = item.backColor !== undefined ? 'backColor' : 'foreColor';
          const wanted = item.backColor ?? item.fontColor;
          const colorA = colorFor(a, kind, key);
          const colorB = colorFor(b, kind, key);
          // An empty wanted color selects cells with no explicit fill/font color.
          const matches = (color: string | undefined): boolean => color === wanted || (color === undefined && (wanted === '' || wanted === undefined));
          result = matches(colorA) ? (matches(colorB) ? 0 : -1) : matches(colorB) ? 1 : 0;
          if (item.order === 'bottom') result = -result;
        } else result = compareValues(valueFor(a, key), valueFor(b, key));
        if (result) return (key.ascending ?? item.ascending) === false ? -result : result;
      }
    }
    return 0;
  };
  order.sort(compare);
  if (order.some((value, index) => value !== index)) {
    const snapshot = (row: number, col: number) => ({
      value: sheet.getValue(row, col),
      style: sheet.getStyle(row, col),
      tag: sheet.getTag(row, col),
      validator: sheet.getDataValidator(row, col),
      hyperlink: sheet.getHyperlink(row, col),
      comment: sheet.comments.get(row, col),
      span: sheet.getSpan(row, col),
    });
    type Snapshot = ReturnType<typeof snapshot>;
    const apply = (row: number, col: number, data: Snapshot) => {
      sheet.setValue(row, col, data.value);
      sheet.setStyle(row, col, data.style ?? null);
      sheet.setTag(row, col, data.tag);
      sheet.setDataValidator(row, col, data.validator ?? null);
      sheet.setHyperlink(row, col, (data.hyperlink ?? null) as JsonRecord | null);
      if (data.comment) sheet.comments.set(row, col, data.comment);
      else sheet.comments.remove(row, col);
    };
    sheet.suspendCalcService();
    sheet.suspendPaint();
    try {
      const cells = new Map<string, Snapshot>();
      if (byRows) {
        for (let r = 0; r < range.rowCount; r++)
          for (let c = 0; c < range.colCount; c++) cells.set(`${r}:${c}`, snapshot(range.row + r, range.col + c));
        for (let r = 0; r < range.rowCount; r++) {
          const source = order[r]!;
          for (let c = 0; c < range.colCount; c++) apply(range.row + r, range.col + c, cells.get(`${source}:${c}`)!);
        }
      } else {
        for (let r = 0; r < range.rowCount; r++)
          for (let c = 0; c < range.colCount; c++) cells.set(`${r}:${c}`, snapshot(range.row + r, range.col + c));
        for (let c = 0; c < range.colCount; c++) {
          const source = order[c]!;
          for (let r = 0; r < range.rowCount; r++) apply(range.row + r, range.col + c, cells.get(`${r}:${source}`)!);
        }
      }
    } finally {
      sheet.resumePaint();
      sheet.resumeCalcService();
    }
  }
  void sortOption;
  sheet._emit(Events.RangeSorted, info);
  return true;
}

interface RowFilterJSON extends JsonRecord {
  range?: { row: number; col: number; rowCount: number; colCount: number };
  filterItemMap?: { index: number; conditions: JsonRecord[] }[];
}

/** Public base filter shared by HideRowFilter (and table filters). */
export class RowFilterBase {
  readonly typeName: string = 'RowFilterBase';
  range: Range | null;
  extendedRange: Range | null;
  private items = new Map<number, Condition[]>();
  private filtered = new Set<number>();
  private filteredColumns = new Set<number>();
  private buttons = new Map<number, boolean>();
  private sort: { index: number; ascending: boolean; compareFunction: null } | null = null;
  private dialogVisible: JsonRecord = {};
  showFilterButton = true;
  private suppressFilteredOut = false;
  protected sheet?: Worksheet;
  private tableName?: string;
  _table(name: string): void { this.tableName = name; }
  constructor(range?: Range) {
    this.range = range ? new Range(range.row, range.col, range.rowCount, range.colCount) : null;
    this.extendedRange = this.range;
  }
  _attach(sheet: Worksheet): void {
    this.sheet = sheet;
    if (this.range) {
      this.extendedRange = new Range(this.range.row, this.range.col, this.range.rowCount, this.range.colCount);
      // The trial materialises button visibility on attach only while the
      // view is live; table filters always materialise it.
      if (!this.buttons.size && !sheet.isPaintSuspended())
        for (let c = 0; c < this.range.colCount; c++) this.buttons.set(c, true);
    }
  }
  private columnCount(): number {
    return this.range?.colCount ?? 0;
  }
  filterButtonVisible(col?: number | boolean, value?: boolean): boolean | this {
    if (col === undefined) {
      for (let c = 0; c < this.columnCount(); c++) if (this.buttons.get(c) !== false) return true;
      return this.columnCount() === 0;
    }
    if (typeof col === 'boolean') {
      for (let c = 0; c < this.columnCount(); c++) this.buttons.set(c, col);
      this.showFilterButton = col;
      return this;
    }
    if (value === undefined) return this.buttons.get(col) ?? true;
    if (!this.buttons.size)
      for (let c = 0; c <= col && c < this.columnCount(); c++) this.buttons.set(c, true);
    this.buttons.set(col, value);
    return this;
  }
  addFilterItem(col: number, condition: Condition | Condition[]): void {
    const list = Array.isArray(condition) ? condition : [condition];
    this.items.set(col, list);
  }
  removeFilterItems(col: number): void {
    this.items.delete(col);
    this.filteredColumns.delete(col);
  }
  getFilterItems(col: number): Condition[] {
    return [...(this.items.get(col) ?? [])];
  }
  getFilteredItems(): Condition[] {
    return [...this.filteredColumns].flatMap((column) => this.items.get(column) ?? []);
  }
  isFiltered(col?: number): boolean {
    if (col === undefined) return this.filtered.size > 0;
    return this.filteredColumns.has(col);
  }
  isRowFilteredOut(row: number): boolean {
    return this.filtered.has(row);
  }
  getSortState(col: number): number {
    if (!this.sort || this.sort.index !== col) return SortState.none;
    return this.sort.ascending ? SortState.ascending : SortState.descending;
  }
  filterDialogVisibleInfo(visibleInfo?: JsonRecord): JsonRecord | this {
    if (visibleInfo === undefined)
      return {
        sortByValue: true,
        sortByColor: true,
        filterByColor: true,
        filterByValue: true,
        listFilterArea: true,
        ...this.dialogVisible,
      };
    this.dialogVisible = { ...visibleInfo };
    return this;
  }
  _hasButtons(): boolean {
    return this.buttons.size > 0;
  }
  _clearButtons(): void {
    this.buttons.clear();
  }
  private setRowVisible(row: number, visible: boolean): void {
    this.sheet?.setRowVisible(row, visible);
  }
  filter(col?: number): void {
    const sheet = this.sheet;
    if (!sheet || !this.range) return;
    const columns = col === undefined ? [...this.items.keys()] : [col];
    columns.forEach((c) => this.filteredColumns.add(c));
    const activeColumns = [...this.filteredColumns];
    this.suppressFilteredOut = false;
    for (let row = this.range.row; row < this.range.row + this.range.rowCount; row++) {
      let keep = true;
      for (const c of activeColumns) {
        const conditions = this.items.get(c);
        if (!conditions?.length) continue;
        const actual = sheet.getValue(row, this.range.col + c);
        if (!conditions.some((condition) => condition.evaluate(sheet, row, this.range!.col + c, actual))) {
          keep = false;
          break;
        }
      }
      if (keep) {
        this.filtered.delete(row);
        this.setRowVisible(row, true);
      } else {
        this.filtered.add(row);
        this.setRowVisible(row, false);
      }
    }
    sheet._emit(this.tableName ? Events.TableFiltering : Events.RangeFiltering, this.eventArgs(col === undefined ? columns : [col], Filter.FilterActionType.filter));
    sheet._emit(this.tableName ? Events.TableFiltered : Events.RangeFiltered, this.eventArgs(col === undefined ? columns : [col], Filter.FilterActionType.filter));
  }
  private eventArgs(columns: number[], action: number): JsonRecord {
    return {
      action,
      ...(this.tableName ? { tableName: this.tableName } : {}),
      sheet: this.sheet,
      range: this.range ? new Range(this.range.row, this.range.col, this.range.rowCount, this.range.colCount) : null,
      filteredRows: [...this.range ? Array.from({ length: this.range.rowCount }, (_, i) => this.range!.row + i) : []].filter(
        (row) => !this.filtered.has(row),
      ),
      filteredOutRows: [...this.filtered],
      columns,
    };
  }
  unfilter(col?: number): void {
    const sheet = this.sheet;
    if (!sheet) return;
    const columns = col === undefined ? [...this.filteredColumns] : [col];
    const info = this.eventArgs(columns, Filter.FilterActionType.unfilter);
    sheet._emit(this.tableName ? Events.TableFilterClearing : Events.RangeFilterClearing, info);
    for (const c of columns) this.filteredColumns.delete(c);
    if (col === undefined) this.filtered.clear();
    else if (this.range)
      for (let row = this.range.row; row < this.range.row + this.range.rowCount; row++) this.filtered.delete(row);
    for (const row of this.filtered) this.setRowVisible(row, true);
    for (let row = this.range?.row ?? 0; row < (this.range?.row ?? 0) + (this.range?.rowCount ?? 0); row++) {
      if (!this.filtered.has(row)) this.setRowVisible(row, true);
    }
    sheet._emit(this.tableName ? Events.TableFilterCleared : Events.RangeFilterCleared, info);
  }
  reset(): void {
    this.items.clear();
    this.filtered.clear();
    this.filteredColumns.clear();
    this.buttons.clear();
    this.sort = null;
    this.dialogVisible = {};
    if (this.sheet && this.range)
      for (let row = this.range.row; row < this.range.row + this.range.rowCount; row++)
        this.sheet.setRowVisible(row, true);
  }
  sortColumn(col: number, ascending: boolean): void {
    if (!this.sheet || !this.range) return;
    sortRange(this.sheet, this.range.row, this.range.col, this.range.rowCount, this.range.colCount, true, [
      { index: col, ascending },
    ]);
    this.sort = { index: col, ascending, compareFunction: null };
  }
  toJSON(): JsonRecord {
    const result: JsonRecord = this.range
      ? {
          range: { row: this.range.row, col: this.range.col, rowCount: this.range.rowCount, colCount: this.range.colCount },
          typeName: this.typeName,
          dialogVisibleInfo: { ...this.dialogVisible },
        }
      : { typeName: this.typeName, dialogVisibleInfo: { ...this.dialogVisible } };
    if (this.items.size)
      result.filterItemMap = [...this.items].map(([index, conditions]) => ({
        index,
        conditions: conditions.map((condition) => condition.toJSON()),
      }));
    if (this.filteredColumns.size) result.filteredColumns = [...this.filteredColumns];
    if (this.sort) result.sortInfo = { ...this.sort };
    if (this.buttons.size) result.filterButtonVisibleInfo = Object.fromEntries(this.buttons);
    result.showFilterButton = this.showFilterButton;
    result.filteredOutRows = this.suppressFilteredOut ? [] : [...this.filtered];
    if (this.tableName) result.tableName = this.tableName;
    return result;
  }
  fromJSON(settings: object): void {
    const json = settings as RowFilterJSON;
    if (json.range) {
      const r = json.range;
      this.range = new Range(r.row, r.col, r.rowCount, r.colCount);
      this.extendedRange = new Range(r.row, r.col, r.rowCount, r.colCount);
    }
    this.items.clear();
    for (const entry of json.filterItemMap ?? [])
      this.items.set(Number(entry.index), (entry.conditions ?? []).map((condition) => Condition.fromJSON(condition)));
    this.filtered = new Set((json.filteredOutRows as number[] | undefined) ?? []);
    this.suppressFilteredOut = true;
    this.filteredColumns = new Set((json.filteredColumns as number[] | undefined) ?? []);
    const buttons = json.filterButtonVisibleInfo as Record<string, boolean> | undefined;
    this.buttons.clear();
    for (const [key, value] of Object.entries(buttons ?? {})) this.buttons.set(Number(key), value);
    const sort = json.sortInfo as { index: number; ascending: boolean } | undefined;
    this.sort = sort ? { index: sort.index, ascending: sort.ascending, compareFunction: null } : null;
    this.dialogVisible = (json.dialogVisibleInfo as JsonRecord | undefined) ?? {};
    this.showFilterButton = json.showFilterButton !== false;
  }
  openFilterDialog(hitInfo: unknown): void {
    const hit = hitInfo as { col?: number; x?: number; y?: number; row?: number };
    const view = this.sheet?._view();
    if (!view || !this.range) return;
    const column = Math.max(0, (hit.col ?? this.range.col) - this.range.col);
    const cell = view.cellRect(hit.row ?? this.range.row, this.range.col + column);
    view.interaction.openFilter(this, column, hit.x ?? cell.x, hit.y ?? cell.y, this.sheet!.getText(Math.max(0, this.range.row - 1), this.range.col + column));
  }
  onFilter(_args: unknown): void {}
}

export class HideRowFilter extends RowFilterBase {
  override readonly typeName: string = 'HideRowFilter';
  override filterDialogVisibleInfo(visibleInfo?: JsonRecord): JsonRecord | this {
    return super.filterDialogVisibleInfo(visibleInfo) as JsonRecord | this;
  }
}

/** Returns the row-filter representation persisted in a table's JSON. */
export function filterToJSON(filter: RowFilterBase, tableName?: string): JsonRecord {
  const json = filter.toJSON();
  if (tableName) {
    json.range = { ...(json.range as JsonRecord) };
    json.tableName = tableName;
    const result: JsonRecord = {
      range: json.range,
      typeName: json.typeName,
      dialogVisibleInfo: json.dialogVisibleInfo,
    };
    if (json.filterButtonVisibleInfo) result.filterButtonVisibleInfo = json.filterButtonVisibleInfo;
    result.showFilterButton = json.showFilterButton;
    result.filteredOutRows = json.filteredOutRows;
    result.tableName = tableName;
    if (json.filterItemMap) result.filterItemMap = json.filterItemMap;
    if (json.filteredColumns) result.filteredColumns = json.filteredColumns;
    if (json.sortInfo) result.sortInfo = json.sortInfo;
    return result;
  }
  return serializeValue(json) as JsonRecord;
}

/** Builds a filter from persisted JSON (table or sheet level). */
export function filterFromJSON(json: unknown, table = false): HideRowFilter {
  const filter = new HideRowFilter();
  filter.fromJSON(deserializeValue(json) as object);
  void table;
  return filter;
}
