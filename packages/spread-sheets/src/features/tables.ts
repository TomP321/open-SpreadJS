import { CellBindingSource, getPath, setPath } from './binding.js';
/**
 * Tables: range model, column metadata, built-in themes, structured-reference
 * support and JSON round-trip. Styles are resolved lazily so table edits are
 * reflected by getActualStyle and the renderer without copying cell styles.
 */
import { Style, Range } from '../primitives.js';
import { Events } from '../events.js';
import type { Worksheet } from '../worksheet.js';
import { HideRowFilter } from './filters.js';
import { type JsonRecord } from '../serialization.js';
import { type ThemeJSON } from './table-theme-data.js';
import { TableColumn, TableTheme, TableThemes, themeByName } from './table-style.js';
import { CustomThemeManagerBase } from './workbook-managers.js';
import { TableSlicerData } from './slicers/table-data.js';

// Public classes and style helpers live in the `table-style.ts` leaf module
// (moved out unchanged); re-exported here so existing import paths and the
// `GC.Spread.Sheets.Tables` namespace wiring keep working.
export {
  TableColumn,
  TableStyle,
  TableTheme,
  TableThemes,
  cloneBorder,
  mergeStyle,
  objectRecord,
  resolveColor,
  resolveThemeStyle,
  styleFromProps,
  themeByName,
  usingThemedDocument,
} from './table-style.js';

export interface TableOptions {
  showHeader?: boolean;
  showFooter?: boolean;
  useFooterDropDownList?: boolean;
  showResizeHandle?: boolean;
}

export class Table {
  sheet!: Worksheet;
  tableName = 'Table1';
  row = 0;
  col = 0;
  rowCount = 1;
  colCount = 1;
  options: Required<TableOptions> & { bandRows: boolean; bandColumns: boolean; highlightFirstColumn: boolean; highlightLastColumn: boolean; allowAutoExpand: boolean; autoGenerateColumns: boolean; bindingPath: string; expandBoundRows: boolean } = {
    showHeader: true,
    showFooter: false,
    useFooterDropDownList: false,
    showResizeHandle: false,
    bandRows: true,
    bandColumns: false,
    highlightFirstColumn: false,
    highlightLastColumn: false,
    allowAutoExpand: true,
    autoGenerateColumns: true,
    bindingPath: '',
    expandBoundRows: false,
  };
  tableStyle!: TableTheme;
  columns: TableColumn[] = [];
  filter: HideRowFilter;
  layoutStyles = new Map<number, JsonRecord>();
  dataSource: unknown = null;
  parsedFromJSON = false;
  reservedElement: unknown = undefined;
  /** Column indices the trial auto-named (`Column…`/derived names) on expansion. */
  _blankColumns = new Set<number>();

  constructor(
    name?: string,
    row?: number,
    col?: number,
    rowCount?: number,
    colCount?: number,
    style?: string | TableTheme,
    options?: TableOptions,
  ) {
    this.tableName = name ?? 'Table1';
    this.row = row ?? 0;
    this.col = col ?? 0;
    this.rowCount = rowCount ?? 1;
    this.colCount = colCount ?? 1;
    if (options)
      for (const key of ['showHeader', 'showFooter', 'useFooterDropDownList', 'showResizeHandle'] as const)
        if (options[key] !== undefined) this.options[key] = options[key]!;
    if (this.options.showHeader) {
      this.row += 1;
      this.rowCount = Math.max(0, this.rowCount - 1);
    }
    if (this.options.showFooter) this.rowCount = Math.max(0, this.rowCount - 1);
    this.tableStyle = typeof style === 'string' ? themeByName(style) ?? TableThemes.medium2 as TableTheme : style ?? (TableThemes.medium2 as TableTheme);
    this.filter = new HideRowFilter();
    this.filter.showFilterButton = true;
    this.resetColumns();
  }
  _attach(sheet: Worksheet): void {
    _attach(this, sheet);
  }
  _isAttached(): boolean {
    return !!this.sheet;
  }
  writeHeaderValues(): void {
    const header = this.headerIndex();
    if (header < 0) return;
    for (let c = 0; c < this.colCount; c++)
      this.sheet.setValue(header, this.col + c, this.getColumnName(c));
  }
  resetColumns(): void {
    this.columns = Array.from({ length: this.colCount }, (_, index) => {
      const existing = this.sheet && this.options.showHeader ? this.sheet.getValue(this.headerIndex(), this.col + index) : undefined;
      const name = existing != null && String(existing) !== '' ? String(existing) : `Column${index + 1}`;
      return new TableColumn(index + 1, undefined, name);
    });
  }
  name(value?: string): unknown {
    if (value === undefined) return this.tableName;
    if (!isValidTableName(value)) throw new Error('The table name is not valid.');
    if (this.sheet && this.sheet.tables.findByName(value) && this.sheet.tables.findByName(value) !== this)
      throw new Error('The current worksheet already exists in a table with the same name.');
    this.tableName = value;
    this.sheet?._tablesChanged();
    return this;
  }
  range(): Range {
    const start = this.options.showHeader ? this.row - 1 : this.row;
    return new Range(
      start,
      this.col,
      this.rowCount + (this.options.showHeader ? 1 : 0) + (this.options.showFooter ? 1 : 0),
      this.colCount,
    );
  }
  dataRange(): Range {
    return new Range(this.row, this.col, this.rowCount, this.colCount);
  }
  headerIndex(): number {
    return this.options.showHeader ? this.row - 1 : -1;
  }
  footerIndex(): number {
    return this.options.showFooter ? this.row + this.rowCount : -1;
  }
  /**
   * Internal (Designer table row commands): grow/shrink the table's own row span without touching
   * sheet row metadata. The caller has already shifted the cells inside the table's columns
   * (`Worksheet._shiftRowsInColumns`), matching the trial's Insert/Delete Table Rows behaviour.
   */
  _growRowCount(delta: number): void {
    this.rowCount = Math.max(0, this.rowCount + delta);
    const data = this.dataRange();
    this.filter.range = new Range(data.row, data.col, data.rowCount, data.colCount);
    this.filter.extendedRange = this.filter.range;
    this.sheet._tablesChanged();
  }
  /** Internal mirror of `_growRowCount` for the table's columns. */
  _growColCount(delta: number): void {
    const old = this.colCount;
    this.colCount = Math.max(1, this.colCount + delta);
    if (this.colCount > old)
      for (let c = old; c < this.colCount; c++) {
        const existing = this.sheet && this.options.showHeader ? this.sheet.getValue(this.headerIndex(), this.col + c) : undefined;
        const name = existing != null && String(existing) !== '' ? String(existing) : `Column${c + 1}`;
        if (existing == null || String(existing) === '') this._blankColumns.add(c);
        this.columns.push(new TableColumn(c + 1, undefined, name));
      }
    else {
      this.columns.length = this.colCount;
      for (const index of [...this._blankColumns]) if (index >= this.colCount) this._blankColumns.delete(index);
    }
    const data = this.dataRange();
    this.filter.range = new Range(data.row, data.col, data.rowCount, data.colCount);
    this.filter.extendedRange = this.filter.range;
    for (let c = 0; c < this.colCount; c++) this.filter.filterButtonVisible(c, true);
    this.sheet._tablesChanged();
  }
  showHeader(value?: boolean): unknown {
    if (value === undefined) return this.options.showHeader;
    if (this.options.showHeader === value) return this;
    this.options.showHeader = value;
    if (this.sheet) {
      const data = this.dataRange();
      this.filter.range = new Range(data.row, data.col, data.rowCount, data.colCount);
      if (value) this.writeHeaderValues();
      else this.filter._clearButtons();
    }
    return this;
  }
  showFooter(value?: boolean, isFooterInserted?: boolean): unknown {
    if (value === undefined) return this.options.showFooter;
    if (this.options.showFooter === value) return this;
    this.options.showFooter = value;
    if (value) {
      if (this.sheet && isFooterInserted === false) {
        this.sheet.addRows(this.footerIndex(), 1);
      }
      if (this.sheet) this.writeFooterValues();
    }
    if (this.sheet) {
      const data = this.dataRange();
      this.filter.range = new Range(data.row, data.col, data.rowCount, data.colCount);
    }
    return this;
  }
  useFooterDropDownList(value?: boolean): unknown {
    if (value === undefined) return this.options.useFooterDropDownList;
    this.options.useFooterDropDownList = value;
    return this;
  }
  showResizeHandle(value?: boolean): unknown {
    if (value === undefined) return this.options.showResizeHandle;
    this.options.showResizeHandle = value;
    return this;
  }
  bandRows(value?: boolean): unknown {
    if (value === undefined) return this.options.bandRows;
    this.options.bandRows = value;
    return this;
  }
  bandColumns(value?: boolean): unknown {
    if (value === undefined) return this.options.bandColumns;
    this.options.bandColumns = value;
    return this;
  }
  highlightFirstColumn(value?: boolean): unknown {
    if (value === undefined) return this.options.highlightFirstColumn;
    this.options.highlightFirstColumn = value;
    return this;
  }
  highlightLastColumn(value?: boolean): unknown {
    if (value === undefined) return this.options.highlightLastColumn;
    this.options.highlightLastColumn = value;
    return this;
  }
  allowAutoExpand(value?: boolean): unknown {
    if (value === undefined) return this.options.allowAutoExpand;
    this.options.allowAutoExpand = value;
    return this;
  }
  autoGenerateColumns(value?: boolean): unknown {
    if (value === undefined) return this.options.autoGenerateColumns;
    this.options.autoGenerateColumns = value;
    return this;
  }
  expandBoundRows(value?: boolean): unknown {
    if (value === undefined) return this.options.expandBoundRows;
    this.options.expandBoundRows = value;
    return this;
  }
  bindingPath(value?: string): unknown {
    if (value === undefined) return this.options.bindingPath;
    this.options.bindingPath = value;
    this._refreshBinding();
    return this;
  }
  style(value?: string | TableTheme): unknown {
    if (value === undefined) {
      // A cleared style (`style(null)`, the gallery's Clear) reads back as null.
      if (!this.tableStyle) return null;
      const copy = new TableTheme(this.tableStyle.toJSON() as ThemeJSON);
      return copy;
    }
    this.tableStyle = typeof value === 'string' ? themeByName(value) ?? this.tableStyle : value;
    this.sheet?.invalidateLayout();
    return this;
  }
  getStyleName(): string | undefined {
    const name = this.tableStyle?.name?.();
    return name ? String(name).toLowerCase() : undefined;
  }
  filterButtonVisible(tableColumnIndex?: number | boolean, value?: boolean): unknown {
    if (tableColumnIndex === undefined) {
      if (!this.options.showHeader) return false;
      let any = false;
      for (let c = 0; c < this.colCount; c++) if (this.filter.filterButtonVisible(c) !== false) any = true;
      return any;
    }
    if (typeof tableColumnIndex === 'boolean') {
      for (let c = 0; c < this.colCount; c++) this.filter.filterButtonVisible(c, tableColumnIndex);
      return this;
    }
    if (value === undefined) return this.filter.filterButtonVisible(tableColumnIndex);
    this.filter.filterButtonVisible(tableColumnIndex, value);
    return this;
  }
  rowFilter(): HideRowFilter {
    this.filter._table(this.tableName);
    return this.filter;
  }
  getColumnName(tableColumnIndex: number): string {
    return String(this.columns[tableColumnIndex]?.name() ?? '');
  }
  setColumnName(tableColumnIndex: number, name: string): this {
    const column = this.columns[tableColumnIndex];
    if (column) {
      column.name(name);
      if (this.options.showHeader) this.sheet?.setValue(this.headerIndex(), this.col + tableColumnIndex, name);
      this.sheet?._tablesChanged();
    }
    return this;
  }
  getColumnDataField(tableColumnIndex: number): string {
    return String(this.columns[tableColumnIndex]?.dataField() ?? '');
  }
  setColumnDataField(tableColumnIndex: number, dataField: string): this {
    this.columns[tableColumnIndex]?.dataField(dataField);
    return this;
  }
  getColumnFormula(tableColumnIndex: number): string {
    const fields = this.columns[tableColumnIndex].fields;
    return String(fields.formula ?? fields.footerFormula ?? '');
  }
  setColumnFormula(tableColumnIndex: number, formula: string): this {
    const column = this.columns[tableColumnIndex];
    if (column) {
      const canonical = formula.replace(/(^|[^A-Za-z0-9_])\[([^\]]+)\]/g, (_m, prefix: string, inner: string) =>
        /^#|^@/.test(inner) ? `${prefix}[${inner}]` : `${prefix}${this.tableName}[${inner}]`,
      );
      column.fields.formula = formula;
      // The footer formula is qualified only when a footer actually exists.
      column.fields.footerFormula = this.options.showFooter ? canonical : formula;
      if (this.sheet && this.options.showFooter) {
        this.sheet.setFormula(this.footerIndex(), this.col + tableColumnIndex, canonical);
      }
    }
    return this;
  }
  setColumnDataFormula(tableColumnIndex: number, formula: string | null): this {
    const column = this.columns[tableColumnIndex];
    if (column) {
      if (formula == null) delete column.fields.dataAreaFormula;
      else column.fields.dataAreaFormula = formula;
    }
    return this;
  }
  writeDataFormulas(): void {
    if (!this.sheet) return;
    const data = this.dataRange();
    for (let c = 0; c < this.colCount; c++) {
      const formula = this.columns[c]?.fields.dataAreaFormula;
      if (typeof formula !== 'string') continue;
      for (let r = data.row; r < data.row + data.rowCount; r++)
        this.sheet.setFormula(r, this.col + c, formula);
    }
  }
  getColumnValue(tableColumnIndex: number): unknown {
    const column = this.columns[tableColumnIndex];
    return column?.fields.value ?? null;
  }
  setColumnValue(tableColumnIndex: number, value: object): this {
    const column = this.columns[tableColumnIndex];
    if (column) column.fields.value = value;
    return this;
  }
  columnLayoutStyle(tableColumnIndex: number, value?: JsonRecord): unknown {
    if (value === undefined) return this.layoutStyles.get(tableColumnIndex) ?? {};
    this.layoutStyles.set(tableColumnIndex, value);
    return this;
  }
  layoutStyle(value?: JsonRecord): unknown {
    if (value === undefined) return Object.fromEntries(this.layoutStyles);
    for (const [index, style] of Object.entries(value)) this.layoutStyles.set(Number(index), style as JsonRecord);
    return this;
  }
  writeFooterValues(): void {
    if (!this.sheet || !this.options.showFooter) return;
    const footer = this.footerIndex();
    for (let c = 0; c < this.colCount; c++) {
      const raw = this.columns[c]?.fields.footerFormula;
      if (typeof raw === 'string') this.sheet.setFormula(footer, this.col + c, raw);
    }
  }
  getBindingSource(): object | null {
    return (this.dataSource as object) ?? null;
  }
  getDirtyRows(): unknown[] {
    return [];
  }
  clearPendingChanges(): void {}
  isTableLayoutDirty(): boolean {
    return false;
  }
  /** The shared slicer-data model for this table (created on first use). */
  _slicerData?: TableSlicerData;
  getSlicerData(): unknown {
    if (!this._slicerData) this._slicerData = new TableSlicerData(this);
    return this._slicerData;
  }
  adjustTableRangeForBind(): void { this._refreshBinding(); }
  boundRecords(): Record<string, unknown>[] | null {
    const source = this.dataSource ?? this.sheet?.getDataSource();
    const records = source instanceof CellBindingSource ? source.getValue(this.options.bindingPath) : this.options.bindingPath ? getPath(source, this.options.bindingPath) : source;
    return Array.isArray(records) ? records : null;
  }
  _refreshBinding(): void {
    const records = this.boundRecords(); if (!records || !this.sheet) return;
    this.sheet._enableBindings();
    if (this.options.autoGenerateColumns && !this.columns.some(c => c.dataField())) this.columns = Object.keys(records[0] ?? {}).map((key, i) => new TableColumn(i + 1, key, key));
    this.colCount = Math.max(1, this.columns.length);
    this.rowCount = records.length;
    this.sheet.suspendPaint(); this.sheet.suspendDirty();
    try { this.writeHeaderValues(); const range = this.dataRange(); for (let r = 0; r < records.length; r++) for (let c = 0; c < this.columns.length; c++) { const path = String(this.columns[c].dataField() ?? this.columns[c].name() ?? ''); this.sheet.setValue(range.row + r, range.col + c, getPath(records[r], path)); } }
    finally { this.sheet.resumeDirty(); this.sheet.resumePaint(); }
    this.sheet._tablesChanged();
  }
  _bindingValue(row: number, col: number): { value: unknown } | undefined { const records = this.boundRecords(), range = this.dataRange(); if (!records || !range.contains(row, col)) return undefined; const record = records[row - range.row], column = this.columns[col - range.col]; return { value: record && column ? getPath(record, String(column.dataField() ?? column.name())) : null }; }
  _setBindingValue(row: number, col: number, value: unknown): void { const records = this.boundRecords(), range = this.dataRange(); if (!records || !range.contains(row, col)) return; const record = records[row - range.row], column = this.columns[col - range.col]; if (record && column) setPath(record, String(column.dataField() ?? column.name()), value); }
  bind(columns: TableColumn[], path?: string, dataSource?: object | string): this {
    this.bindColumns(columns);
    if (path !== undefined) this.options.bindingPath = path;
    if (dataSource !== undefined) this.dataSource = dataSource;
    this._refreshBinding();
    return this;
  }
  bindColumns(columns: TableColumn[]): void {
    this.columns = columns;
    if (this.sheet) this.writeHeaderValues();
  }

  /* ---- table-scoped structural changes (trial-observed, probes f40c..f40e) ---- */

  /**
   * Integer coercion of a structural-change argument (probes f40c..f40af): a
   * non-numeric string reads as 0, `undefined`/`null` read as 0, but a real
   * negative number is rejected with the axis' range error.
   */
  private _paramIndex(value: unknown, name: 'col' | 'row'): number {
    if (typeof value === 'string') {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        if (parsed < 0) throw this._rangeError(name);
        return Math.trunc(parsed);
      }
      return 0;
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      if (value < 0) throw this._rangeError(name);
      return Math.trunc(value);
    }
    if (value === undefined || value === null) return 0;
    throw this._rangeError(name);
  }

  private _rangeError(name: 'col' | 'row'): Error {
    return new Error(name === 'col' ? 'The param col out of data range of table.' : 'The param row out of data range of table.');
  }

  /**
   * Trial rule (probes f40h-name-decide2 t1, f40c-delete-semantics): the cells a
   * table mutation shifts may only move inside the acting table's own band — an
   * occupied source cell whose destination lands in another table's band is
   * refused.
   */
  private _checkMoveConflict(axis: 'row' | 'col', sourceStart: number, sourceEnd: number, delta: number, crossStart: number, crossEnd: number): void {
    if (sourceEnd < sourceStart || crossEnd < crossStart) return;
    for (const other of this.sheet.tables.all()) {
      if (other === this) continue;
      const otherRange = other.range();
      const crossFrom = Math.max(axis === 'row' ? other.col : otherRange.row, crossStart);
      const crossTo = Math.min(axis === 'row' ? other.col + other.colCount - 1 : otherRange.row + otherRange.rowCount - 1, crossEnd);
      if (crossTo < crossFrom) continue;
      const alongStart = axis === 'row' ? otherRange.row : other.col;
      const alongEnd = axis === 'row' ? otherRange.row + otherRange.rowCount - 1 : other.col + other.colCount - 1;
      for (let source = sourceStart; source <= sourceEnd; source++) {
        const destination = source + delta;
        if (destination < alongStart || destination > alongEnd) continue;
        for (let cross = crossFrom; cross <= crossTo; cross++) {
          const occupied = axis === 'row' ? this.sheet.getValue(cross, source) : this.sheet.getValue(source, cross);
          if (occupied !== null && occupied !== undefined && occupied !== '')
            throw new Error("This won't work because it would move cells in a table on your worksheet.");
        }
      }
    }
  }

  private _nextColumnId(): number {
    return this.columns.reduce((max, column) => Math.max(max, column.id() as number), 0) + 1;
  }

  /**
   * Column name the trial gives to an inserted column whose header cell is blank.
   * Trial model (probes f40ba-name-a1, f40c, f40e, f40h, f40x-seq-A/B):
   * - base: the name of the column left of the insertion point. When that left
   *   neighbour is itself a blank the trial created, its LAST character is cut
   *   (with leading zeros dropped): `02` -> ``, `12` -> `1`, `Column12` -> `Column1`.
   * - appended number: the 1-based position the first shifted column lands on;
   *   for a tail insertion the left neighbour's trailing number + 1.
   * - when the result collides with an existing name, the trial shortens the base
   *   to the left name minus its last character and appends that last digit + 1
   *   (`10,102,103` insert at 1 -> `11`).
   * - with no usable numeric context the trial counts `Column1, Column2, …`
   *   (continuing the table's existing `Column<n>` counter).
   */
  private _blankColumnName(
    insertAt: number,
    offsetInBlock: number,
    originalColCount: number,
    originalHeaders: string[],
    originalBlankIndices: Set<number>,
    leftNeighborName: string | undefined,
    leftIsBlank: boolean,
    usedNames: Set<string>,
  ): string {
    const trailingRun = (name: string): string => (name.match(/(\d+)$/) ?? ['', ''])[1];
    const lastDigit = (name: string): string => (name.match(/(\d)$/) ?? ['', ''])[1];
    const isColumnNamed = (name: string): boolean => /^Column\d+$/i.test(name);
    const shortenBase = (name: string): string => {
      const cut = name.slice(0, -1);
      return /^\d+$/.test(cut) ? (cut === '0' ? '' : cut.replace(/^0+(?=\d)/, '')) : cut;
    };
    // `Column<n>` fallback: the trial fills the LOWEST unused counter number
    // (probe f40w-blank-mixed: a table already holding `Column2` names its next
    // blank `Column1`; blanks inserted in the same operation walk it forward).
    const columnFallback = (): string => {
      const taken = new Set<number>();
      for (const name of usedNames) if (isColumnNamed(name)) taken.add(Number(trailingRun(name)));
      let n = 1;
      while (taken.has(n)) n++;
      return `Column${n + offsetInBlock}`;
    };
    const left = leftNeighborName ?? '';
    if (left === '') return columnFallback();
    if (trailingRun(left) === '') {
      // Text left neighbour (`A`, `X`): the trial counts Column names (probe
      // f40w-blank-mixed a/c: `A | insert | 2` -> `Column1`).
      void originalHeaders;
      return columnFallback();
    }
    let base: string;
    let appended: string;
    const anchorAtPoint =
      insertAt < originalColCount && originalBlankIndices.has(insertAt) && !isColumnNamed(originalHeaders[insertAt])
        ? originalHeaders[insertAt]
        : undefined;
    if (insertAt >= originalColCount) {
      // Tail append behind the last column: the trial repeats the left name's
      // number (probe f40c-insert-columns: `… 1, 2 | insert |` -> `22`).
      base = left;
      appended = trailingRun(left);
    } else if (leftIsBlank) {
      // Chain from the blank directly left: `02 -> 3`, `12 -> 13`, `Column12 -> Column13`.
      base = shortenBase(left);
      appended = String(Number(lastDigit(left) || '0') + 1);
    } else if (anchorAtPoint !== undefined) {
      // A numeric blank sits at the insertion point: continue its number.
      base = left;
      appended = String(Number(lastDigit(anchorAtPoint) || '0') + 1);
    } else if (originalBlankIndices.size > 0) {
      base = left;
      appended = String(Number(lastDigit(left) || '0') + 1);
    } else if (isColumnNamed(left) && insertAt >= originalColCount - 1) {
      // Insert directly before the last `Column<n>` column: the trial repeats the
      // left number (probe f40ba-name-a1 C: `Column1, Column2 | insert | Column3`
      // -> `Column22`).
      base = left;
      appended = trailingRun(left);
    } else {
      base = left;
      appended = String(insertAt + 1 + offsetInBlock);
    }
    let name = `${base}${appended}`;
    if (usedNames.has(name)) {
      // Trial collision rule (probe f40ba-name-a1 D/E: `10,102,103` insert at 1
      // -> `11`): shorten the base to the left name minus its last character and
      // continue with that last digit + 1.
      base = shortenBase(left);
      const last = Number(lastDigit(left) || '0');
      appended = String(last + 1 + offsetInBlock);
      name = `${base}${appended}`;
      while (usedNames.has(name)) name = `${base}${Number(trailingRun(name) || '0') + 1}`;
    }
    return name;
  }

  /**
   * Re-read header cell values into the table's column names (the trial syncs a
   * table's names with its header row lazily; probe f40ba-name-a1: header values
   * written *after* `tables.add` become the column names, duplicates get the
   * 1-based column index appended: `10, 102, 103`). Bound (data-source) tables
   * keep their binding-derived names.
   */
  _syncNamesFromHeader(): void {
    if (this.dataSource || !this.sheet) return;
    const header = this.headerIndex();
    if (header < 0) return;
    const used = new Set<string>();
    for (let c = 0; c < this.columns.length; c++) {
      const value = this.sheet.getValue(header, this.col + c);
      const name = value !== null && value !== undefined && String(value) !== '' ? String(value) : undefined;
      if (name === undefined) continue;
      const final = used.has(name) ? `${name}${c + 1}` : name;
      used.add(final);
      if (String(this.columns[c].name() ?? '') !== final) {
        this.columns[c].name(final);
        this._blankColumns.delete(c);
      }
    }
  }

  insertColumns(col: number, count: number, isInsertAfter?: boolean): void {
    const sheet = this.sheet;
    const start = this._paramIndex(col, 'col');
    const amount = Math.max(0, this._paramIndex(count, 'col'));
    // The trial validates the *argument* against the table width (probes
    // f40c-insert-edge vs f40e-insert-bounds): `col` must name an existing
    // column; `isInsertAfter` then moves the insertion point one further.
    if (start >= this.colCount && !(start === 0 && this.colCount === 0))
      throw this._rangeError('col');
    const pos = isInsertAfter === true ? start + 1 : start;
    if (pos > this.colCount || pos + amount > sheet.getColumnCount() - this.col)
      throw this._rangeError('col');
    const header = this.headerIndex();
    const rowStart = header >= 0 ? header : this.row;
    const rowEnd = rowStart + this.rowCount + (header >= 0 ? 1 : 0) - 1;
    this._checkMoveConflict('col', this.col + pos, this.col + this.colCount - 1, amount, rowStart, rowEnd);
    const originalColCount = this.colCount;
    this._syncNamesFromHeader();
    const originalHeaders = this.columns.map((column) => String(column.name() ?? ''));
    const originalBlankIndices = new Set(this._blankColumns);
    sheet._shiftColumnsInRows(this.col + pos, amount, rowStart, rowEnd, false);
    this.colCount += amount;
    let nextId = this._nextColumnId();
    const usedNames = new Set(originalHeaders);
    for (let offset = 0; offset < amount; offset++) {
      const at = pos + offset;
      const headerValue = header >= 0 ? sheet.getValue(header, this.col + at) : undefined;
      const leftName = at > 0 ? String(this.columns[at - 1].name() ?? '') : undefined;
      const name = headerValue !== null && headerValue !== undefined && String(headerValue) !== ''
        ? String(headerValue)
        : this._blankColumnName(at, offset, originalColCount, originalHeaders, originalBlankIndices, leftName, at > 0 && this._blankColumns.has(at - 1), usedNames);
      usedNames.add(name);
      const column = new TableColumn(nextId++, undefined, name);
      this.columns.splice(at, 0, column);
      const remapped = new Set<number>();
      for (const index of this._blankColumns) remapped.add(index >= at ? index + 1 : index);
      remapped.add(at);
      this._blankColumns.clear();
      for (const index of remapped) this._blankColumns.add(index);
    }
    if (this.columns.length > this.colCount) this.columns.length = this.colCount;
    if (header >= 0) this.writeHeaderValues();
    for (let c = 0; c < this.colCount; c++) this.filter.filterButtonVisible(c, true);
    const data = this.dataRange();
    this.filter.range = new Range(data.row, data.col, data.rowCount, data.colCount);
    this.filter.extendedRange = this.filter.range;
    sheet._tablesChanged();
  }

  deleteColumns(col: number, count: number): void {
    const sheet = this.sheet;
    const start = this._paramIndex(col, 'col');
    const requested = Math.max(0, this._paramIndex(count, 'col'));
    if (start >= this.colCount) throw this._rangeError('col');
    // Trial (probes f40af, f40w-del-cols): deleting the full width from index 0 is refused,
    // an overshooting count is clamped to the remaining data columns.
    if (start === 0 && requested >= this.colCount) throw new Error('The param count to delete will cause empty table.');
    const amount = Math.min(requested, this.colCount - start);
    const header = this.headerIndex();
    const rowStart = header >= 0 ? header : this.row;
    const rowEnd = rowStart + this.rowCount + (header >= 0 ? 1 : 0) - 1;
    this._checkMoveConflict('col', this.col + start + amount, this.col + this.colCount - 1, -amount, rowStart, rowEnd);
    sheet._shiftColumnsInRows(this.col + start, amount, rowStart, rowEnd, true);
    this.columns.splice(start, amount);
    {
      const remapped = new Set<number>();
      for (const index of this._blankColumns) {
        if (index >= start + amount) remapped.add(index - amount);
        else if (index < start) remapped.add(index);
      }
      this._blankColumns.clear();
      for (const index of remapped) this._blankColumns.add(index);
    }
    this._growColCount(-amount);
    const data = this.dataRange();
    this.filter.range = new Range(data.row, data.col, data.rowCount, data.colCount);
    this.filter.extendedRange = this.filter.range;
    if (header >= 0) this.writeHeaderValues();
    sheet._tablesChanged();
  }

  insertRows(row: number, count: number, isInsertAfter?: boolean): void {
    const sheet = this.sheet;
    const start = this._paramIndex(row, 'row');
    const amount = Math.max(0, this._paramIndex(count, 'row'));
    // Trial: `row` must address an existing data row (probes f40c/f40e bounds).
    if (start >= this.rowCount) throw this._rangeError('row');
    const pos = isInsertAfter === true ? start + 1 : start;
    if (pos + amount > this.rowCount && pos + amount > sheet.getRowCount() - this.row)
      throw this._rangeError('row');
    this._checkMoveConflict('row', this.row + pos, this.row + this.rowCount - 1, amount, this.col, this.col + this.colCount - 1);
    sheet._shiftRowsInColumns(this.row + pos, amount, this.col, this.col + this.colCount - 1, false);
    this._growRowCount(amount);
    if (this.options.showFooter && this.dataSource) this.writeFooterValues();
    sheet._tablesChanged();
  }

  deleteRows(row: number, count: number): void {
    const sheet = this.sheet;
    const start = this._paramIndex(row, 'row');
    const requested = Math.max(0, this._paramIndex(count, 'row'));
    if (start >= this.rowCount) throw this._rangeError('row');
    // Trial (probes f40af, f40z-del-rows-*): an overshooting count is clamped to the
    // remaining data rows — the table keeps its header row, no "empty table" error.
    const amount = Math.min(requested, this.rowCount - start);
    this._checkMoveConflict('row', this.row + start + amount, this.row + this.rowCount - 1, -amount, this.col, this.col + this.colCount - 1);
    sheet._shiftRowsInColumns(this.row + start, amount, this.col, this.col + this.colCount - 1, true);
    this._growRowCount(-amount);
    sheet._tablesChanged();
  }

  /** Internal: auto-expands by rows/columns. */
  _grow(rows: number, cols: number): void {
    this.rowCount += rows;
    this.colCount += cols;
    if (cols > 0)
      while (this.columns.length < this.colCount) {
        this._blankColumns.add(this.columns.length);
        const column = new TableColumn(this.columns.length + 1, undefined, `Column${this.columns.length + 1}`);
        this.columns.push(column);
      }
    if (this.sheet) this.writeHeaderValues();
    this.sheet?.invalidateLayout();
  }

  /** Internal: applies a new range (TableManager.resize). */
  _resize(range: Range): void {
    _resize(this, range);
  }
  /** Internal: repositions the table without reordering its columns. */
  _move(row: number, col: number): void {
    this.row = row + (this.options.showHeader ? 1 : 0);
    this.col = col;
    if (this.sheet) this.writeHeaderValues();
  }
  /** Internal: shifts table bounds after a row/column structural change. */
  _shift(axis: 'row' | 'col', index: number, amount: number, remove: boolean): void {
    _shift(this, axis, index, amount, remove);
  }

  /** Resolved role style for a sheet cell; null when the cell is outside this table. */
  _styleFor(row: number, col: number): Style | null {
    return _styleFor(this, row, col);
  }
  toJSON(): JsonRecord {
    return toJSON(this);
  }
  fromJSON(settings: object): void {
    fromJSON(this, settings);
  }
}
import {
  _attach,
  _resize,
  _shift,
  _styleFor,
  fromJSON,
  toJSON,
} from './table-ops.js';

export function isValidTableName(name: string): boolean {
  if (!/^[A-Za-z_][A-Za-z0-9_.]*$/.test(name)) return false;
  if (/^(TRUE|FALSE)$/i.test(name)) return false;
  // Trial-observed reserved families (probes f40zb-*, fresh-sheet single adds):
  // `T1`-style (the auto-naming family), `Tb1`-style, and `Table11`-style
  // (`Table` + two or more digits; `Table1` itself is the trial's own default
  // name and stays valid). Names that parse as a 1-3 letter cell reference
  // (`A11`, `CA1`, `ZZ999`, `abc123`) are rejected too.
  if (/^T\d+$/i.test(name)) return false;
  if (/^TB\d+$/i.test(name)) return false;
  if (/^TABLE\d{2,}$/i.test(name)) return false;
  if (/^[A-Za-z]{1,3}\d+$/.test(name)) return false;
  if (/^R\d+C\d+$/i.test(name)) return false;
  return true;
}

/**
 * `GC.Spread.Sheets.Tables.CustomTableThemeManager` (`wb.customTableThemes`), the
 * concrete manager behind `CustomThemeManagerBase`. Trial behaviour: `add(name)`
 * stores a new *empty* theme carrying exactly that name (a built-in theme is never
 * copied, so `add('light1')` serialises as `{ name: 'light1' }`); adding a name
 * that already exists answers `undefined` and leaves the stored theme untouched;
 * `get` is case-insensitive; `update(old, newTheme)` drops the old name and keeps
 * the theme under its own name; `remove` of an unknown name does nothing. The
 * themes serialise as the workbook key `tableStyles`.
 */
export class CustomTableThemeManager extends CustomThemeManagerBase {
  add(theme: string | TableTheme): TableTheme | undefined {
    if (typeof theme === 'string') {
      if (!theme || this.get(theme)) return undefined;
      const created = new TableTheme();
      created.name(theme);
      return super.add(created);
    }
    return super.add(theme);
  }
  remove(name: string): void {
    super.remove(name);
  }
  /** @internal The workbook `tableStyles` JSON, `undefined` while there are none. */
  _toJSON(): JsonRecord[] | undefined {
    const themes = this.all();
    return themes.length ? themes.map((theme) => theme.toJSON()) : undefined;
  }
  /** @internal Reads imported `tableStyles` records back into the store. */
  _fromJSON(records: unknown): void {
    const store = this._themes();
    store.clear();
    for (const raw of (records as JsonRecord[] | undefined) ?? []) {
      const settings = raw as JsonRecord;
      const name = String(settings.name ?? '');
      if (!name) continue;
      store.set(name.toLowerCase(), new TableTheme(settings as ThemeJSON));
    }
  }
}

export class TableManager {
  tables: Table[] = [];
  constructor(private sheet: Worksheet) {}
  _hasAny(): boolean { return this.tables.length > 0; }
  /**
   * The theme a table gets when no style is passed: the trial builds it from
   * `Workbook.defaultTableTheme()`, falling back to the medium2 built-in.
   */
  _workbookTheme(): TableTheme | undefined {
    const parent = this.sheet.parent as { defaultTableTheme?: () => TableTheme | null | undefined } | undefined;
    return parent?.defaultTableTheme?.() ?? undefined;
  }
  /**
   * Resolves a table style name: the trial answers built-in `TableThemes` names
   * first and the workbook's `customTableThemes` second, and builds a new table
   * from `Workbook.defaultTableTheme()` when no style is given.
   */
  _themeName(name: string): TableTheme | undefined {
    const parent = this.sheet.parent as { customTableThemes?: CustomTableThemeManager } | undefined;
    return themeByName(name) ?? parent?.customTableThemes?.get(name);
  }
  add(
    name?: string,
    row?: number,
    column?: number,
    rowCount?: number,
    columnCount?: number,
    style?: string | TableTheme,
    options?: TableOptions,
  ): Table {
    const tableName = name ?? this.nextName();
    if (!isValidTableName(tableName)) throw new Error('The table name is not valid.');
    const r = row ?? 0, c = column ?? 0, rc = rowCount ?? 1, cc = columnCount ?? 1;
    const range = new Range(r, c, rc, cc);
    if (range.row + range.rowCount > this.sheet.getRowCount() || range.col + range.colCount > this.sheet.getColumnCount())
      throw new RangeError('Invalid column index or column count.');
    for (const existing of this.tables)
      if (existing.range().intersect(r, c, rc, cc)) throw new Error('The tables cannot be intersected.');
    if (this.findByName(tableName)) throw new Error('The current worksheet already exists in a table with the same name.');
    const theme =
      style === undefined
        ? this._workbookTheme()
        : typeof style === 'string'
          ? this._themeName(style)
          : style;
    const table = new Table(tableName, r, c, rc, cc, theme, options);
    table._attach(this.sheet);
    this.tables.push(table);
    this.sheet._tablesChanged();
    return table;
  }
  addFromDataSource(
    name: string,
    row: number,
    column: number,
    dataSource: unknown,
    style?: TableTheme,
    options?: TableOptions,
  ): Table {
    const rows = Array.isArray(dataSource) ? dataSource : [];
    const columns = rows.length ? Object.keys(rows[0] as object) : [];
    const table = this.add(name, row, column, rows.length + 1, Math.max(1, columns.length), style, options);
    table.bind(
      columns.map((field, index) => new TableColumn(index + 1, field, field)),
      undefined,
      dataSource as object,
    );
    rows.forEach((item, index) => {
      for (let c = 0; c < columns.length; c++)
        this.sheet.setValue(row + 1 + index, column + c, (item as JsonRecord)[columns[c]!]);
    });
    return table;
  }
  nextName(): string {
    let index = this.tables.length + 1;
    while (this.findByName(`Table${index}`)) index++;
    return `Table${index}`;
  }
  all(): Table[] {
    return [...this.tables];
  }
  find(row: number, column: number): Table | null {
    return this.tables.find((table) => {
      const range = table.range();
      return row >= range.row && row < range.row + range.rowCount && column >= range.col && column < range.col + range.colCount;
    }) ?? null;
  }
  findByName(name: string): Table | null {
    return this.tables.find((table) => String(table.name()).toLowerCase() === name.toLowerCase()) ?? null;
  }
  remove(table: Table | string, options: number): Table | null {
    const target = typeof table === 'string' ? this.findByName(table) : table;
    if (!target) return null;
    const index = this.tables.indexOf(target);
    if (index < 0) return null;
    const range = target.range();
    this.tables.splice(index, 1);
    if (!(options & 1)) {
      for (const [row, col] of rangeCells(range))
        if (row >= 0 && col >= 0) this.sheet.setValue(row, col, null);
    }
    if (!(options & 2))
      for (const [row, col] of rangeCells(range))
        if (row >= 0 && col >= 0) this.sheet.setStyle(row, col, null);
    this.sheet._tablesChanged();
    return target;
  }
  resize(table: Table | string, range: Range): void {
    const target = typeof table === 'string' ? this.findByName(table) : table;
    if (!target) return;
    const info = {
      sheet: this.sheet,
      sheetName: this.sheet.name(),
      table: target,
      newRange: new Range(range.row, range.col, range.rowCount, range.colCount),
      cancel: false,
    };
    this.sheet._emit(Events.TableResizing, info);
    if (info.cancel) return;
    target._resize(range);
    this.sheet._tablesChanged();
    this.sheet._emit(Events.TableResized, info);
  }
  move(table: Table | string, row: number, column: number): void {
    const target = typeof table === 'string' ? this.findByName(table) : table;
    if (!target) return;
    const current = target.range();
    const info = {
      sheet: this.sheet,
      sheetName: this.sheet.name(),
      table: target,
      newRange: new Range(row, column, current.rowCount, current.colCount),
      cancel: false,
    };
    this.sheet._emit(Events.TableResizing, info);
    if (info.cancel) return;
    target._move(row, column);
    this.sheet._tablesChanged();
    this.sheet._emit(Events.TableResized, info);
  }
  convertFromDataTable(table: Table | string): Table { return typeof table === 'string' ? this.findByName(table)! : table; }
  convertToDataTable(table: Table | string): Table { return typeof table === 'string' ? this.findByName(table)! : table; }
  _fromJSON(json: unknown): void {
    for (const raw of Array.isArray(json) ? json : []) {
      const table = new Table();
      table.fromJSON(raw as object);
      table._attach(this.sheet);
      this.tables.push(table);
    }
  }
  _clear(): void {
    this.tables = [];
  }
  _shift(axis: 'row' | 'col', index: number, amount: number, remove: boolean): void {
    for (const table of this.tables) table._shift(axis, index, amount, remove);
  }
}
function* rangeCells(range: Range): Generator<[number, number]> {
  for (let r = 0; r < range.rowCount; r++)
    for (let c = 0; c < range.colCount; c++) yield [range.row + r, range.col + c];
}
