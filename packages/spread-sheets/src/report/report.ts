import type { DataManager } from '../data/index.js';
import { GC } from '../generated/enums.js';
import { CellRange } from '../range.js';
import { Worksheet } from '../worksheet.js';
import { notImplemented } from '../not-implemented.js';
import { TemplateSheet, type TemplateCell } from './template.js';
import { selectRows } from './data.js';
import { ReportChanges, type Cell, type Field, type RecordRef } from './changes.js';
import { expandHierarchy, type HierarchyCell } from './hierarchy.js';
import { expandAxes } from './axes.js';
import { chunkRecords } from './paginate.js';
import { cellAddress, parseCellAddress } from './address.js';
import type { SerializationOptions } from '../sheet-common.js';
import { Workbook } from '../workbook.js';
import { CellBindingSource, getPath, setPath } from '../features/binding.js';
import { Events } from '../events.js';
import { Style } from '../primitives.js';

type Mode = 'Design' | 'Preview' | 'PaginatedPreview';
type Row = Record<string, unknown>;
/** `GC.Spread.Report.IReportOptions`, exposed on the sheet options of the trial. */
type ReportOptions = { printAllPages?: boolean; showHiddenRowCol?: boolean; dirtyStyle?: Style;
  hiddenRowColStyle?: Style; joinType?: 'Left' | 'Right'; renderMode?: Mode };

export class ReportSheet extends Worksheet {
  /** Marks the sheet for the renderer (same pattern as `_isTableSheet`/`_isGanttSheet`). */
  readonly _isReportSheet = true;
  private template = new TemplateSheet('Template');
  private changes = new ReportChanges(this, () => this.template.getDataEntrySetting(),
    (row, fields, forDelete) => this.resolveRecord(row, fields, forDelete));
  private mode: Mode = 'Preview';
  private params: Record<string, unknown> = {};
  private page = 0;
  private printIndexes: number[] = [];
  private height = 1;
  private width = 1;
  private pages = 1;
  private generatedSpans: [number, number][] = [];
  private sourceCells = new Map<string, TemplateCell>();
  private cellOrigins = new Map<string, [number, number][]>();
  private collapsed = new Set<string>();
  private collapseButtons = new Map<string, boolean>();
  private chartPreviews = new Map<string, boolean>();
  private contextExtents = new Map<string, number>();
  private columnExtents = new Map<string, number>();
  private phantomOrigins = new Map<string, { value: unknown; rowCount: number; colCount: number }[]>();
  private collapseHiddenRows = new Map<number, boolean>();
  private collapseHiddenColumns = new Map<number, boolean>();
  private collapseModes = new Map<string, 'toggle' | 'descendant' | 'initial'>();
  private parameterWorkbook?: Workbook;
  constructor(name: string, private data?: DataManager) {
    super(name);
    this.template.name(name);
    // The trial keeps the report options on the sheet. Ours adds them to the sheet options, so
    // `report.options.printAllPages` and friends behave the same way (see docs/STATUS.md).
    Object.assign(this.options as unknown as ReportOptions, { printAllPages: true, showHiddenRowCol: false,
      joinType: 'Left' as const, renderMode: this.mode,
      dirtyStyle: new Style({ decoration: { cornerFold: { size: 6, position: 1, color: '#FF3D00' } } }),
      hiddenRowColStyle: new Style() });
  }
  private reportOptions(): ReportOptions { return this.options as unknown as ReportOptions; }
  updateCellValue(row: number, col: number, value: unknown): void {
    // A write onto a cell covered by a generated group span (not its anchor) is ignored, like
    // the trial: the value stays put and no change is recorded (TASK 48 `entry-blank-insert`).
    const span = this.getSpan(row, col);
    if (span && (span.row !== row || span.col !== col)) return;
    this.changes.update(row, col, value);
  }
  addRecordAt(row: number, col: number): void {
    if (!this.sourceCells.has(`${row},${col}`)) return;
    this.checkRecordLayout(row, col);
    this.addRows(row + 1, 1);
    this.changes.insert(row + 1, col);
    this.shiftOrigins(row + 1, 1);
    this.resizeBlocks(row, 1);
    this.height++;
  }
  deleteRecordAt(row: number, col: number): void {
    if (!this.sourceCells.has(`${row},${col}`)) return;
    this.checkRecordLayout(row, col);
    this.changes.remove(row, col, () => this.recordRows());
    this.deleteRows(row, 1);
    this.shiftOrigins(row, -1);
    this.resizeBlocks(row, -1);
    this.height = Math.max(1, this.height - 1);
  }
  /** Live data rows of the table the first bound field points at (delete claim resolution). */
  private recordRows(): Record<string, unknown>[] {
    const rules = (this.template.getDataEntrySetting() ?? []) as { tableName: string }[];
    const table = rules.length ? this.data?.tables[rules[0]!.tableName] : undefined;
    if (!table) return [];
    return Array.from({ length: table.rowCount() }, (_, index) => table.get(index)!);
  }
  /** Template context edges of the current template, on both axes (used by collapse and record layout). */
  private contextParents(): Map<TemplateCell, Set<TemplateCell>> {
    const entries = this.template.entries().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const lookup = (address: string): TemplateCell | undefined =>
      entries.find(([row, col]) => cellAddress(row, col) === address.toUpperCase())?.[2];
    const parents = new Map<TemplateCell, Set<TemplateCell>>();
    const link = (cell: TemplateCell, parent: TemplateCell | undefined): void => {
      if (!parent || parent === cell) return;
      const set = parents.get(cell) ?? new Set<TemplateCell>();
      set.add(parent);
      parents.set(cell, set);
    };
    let previous: TemplateCell | undefined;
    for (const [, , cell] of entries) {
      const vertical = cell.context?.vertical;
      link(cell, vertical === 'None' ? undefined : vertical ? lookup(vertical) : previous);
      const horizontal = cell.context?.horizontal;
      link(cell, horizontal && horizontal !== 'None' ? lookup(horizontal) : undefined);
      if (cell.type !== 'Summary') previous = cell;
    }
    return parents;
  }
  /** The template address a generated cell came from. */
  private templateOf(row: number, col: number): [number, number] | undefined {
    for (const [key, origins] of this.cellOrigins) if (origins.some(([r, c]) => r === row && c === col)) {
      const [r, c] = key.split(',').map(Number) as [number, number];
      return [r, c];
    }
    return undefined;
  }
  /**
   * After a record row was inserted or deleted, the blocks and merged group cells that contain
   * that row take part in the change: a group keeps spanning its records (TASK 48).
   */
  private resizeBlocks(row: number, delta: 1 | -1): void {
    const extents = new Map<string, number>();
    for (const [key, extent] of this.contextExtents) {
      const [r, c] = key.split(',').map(Number) as [number, number];
      if (delta === -1 && r === row) continue;
      const moved = r > row ? r + delta : r;
      const cell = this.sourceCells.get(key);
      const covers = cell?.type === 'Group' && cell.spillDirection !== 'Horizontal' &&
        moved <= row && row < moved + extent;
      extents.set(`${moved},${c}`, Math.max(1, extent + (covers ? delta : 0)));
    }
    this.contextExtents = extents;
    const parents = this.contextParents();
    const spans = new Map<string, number>();
    for (const [key, cell] of this.sourceCells) {
      const [r, c] = key.split(',').map(Number) as [number, number];
      const extent = this.contextExtents.get(key) ?? 1;
      const template = this.templateOf(r, c);
      const merged = cell.type === 'Group' && cell.spillDirection !== 'Horizontal' && !!template &&
        this.template.entries().some(([entryRow, , entryCell]) => parents.get(entryCell)?.has(cell) && entryRow === template[0]) &&
        extent > 1;
      const span = this.getSpan(r, c);
      if (merged) {
        if (!span || span.row !== r || span.col !== c || span.rowCount !== extent) {
          if (span && span.row === r && span.col === c) this.removeSpan(r, c);
          this.addSpan(r, c, extent, 1);
        }
        spans.set(`${r},${c}`, 1);
      } else if (span && span.row === r && span.col === c && this.generatedSpans.some(([x, y]) => x === r && y === c)) {
        this.removeSpan(r, c);
      }
    }
    this.generatedSpans = [...spans.keys()].map(key => key.split(',').map(Number) as [number, number]);
  }
  private checkRecordLayout(row: number, col: number): void {
    const cell = this.sourceCells.get(`${row},${col}`);
    if (this.mode !== 'Preview' || !cell || cell.type === 'Summary' ||
      !cell.binding?.match(/^([^\[]+)\[([^\]]+)\]$/)) {
      notImplemented('GC.Spread.Report.ReportSheet record editing for this layout');
    }
  }
  /**
   * The data record a report row shows (TASK 48): every rule field is resolved to the cell of
   * that field in the same report row, falling back to the expanded cell whose block covers the
   * row (a group header or a merged span) or, for a field whose data column spills past the row,
   * to the nearest instance cell at or above it - like the trial binds records for write-back.
   * `dataIndex` is the index of the data record the row displays in the sheet's data order.
   */
  /**
   * The data record a report row shows (TASK 48 probes e1..e12/ed1..ed9): every rule field
   * resolves to the cell that carries that field's value on the row - the row's own instance
   * cell, or the group header whose span/block covers it (a blank pending row keeps its own
   * empty cell for a non-primary field but uses the covering header for a primary field).
   * `covering` carries the primary values resolved from above (the group block the record
   * writes into); `dataIndex` is the index of the data record the row displays in the sheet's
   * data order.
   */
  private resolveRecord(row: number, fields: Field[], forDelete: boolean):
  RecordRef | undefined {
    const originRows = (address: [number, number]): number[] =>
      (this.cellOrigins.get(`${address[0]},${address[1]}`) ?? []).map(([r]) => r).sort((a, b) => a - b);
    const dataRows = new Set<number>();
    const parsed: { field: Field; address: [number, number] }[] = [];
    for (const field of fields) {
      const address = parseCellAddress(field.formula);
      // An expression write-back formula binds no report cell (trial probe `e14`: it is
      // accepted but resolves to nothing in `getChanges` and never submits a value).
      if (!address) continue;
      parsed.push({ field, address });
      for (const r of originRows(address)) dataRows.add(r);
    }
    if (!fields.length) for (const r of this.boundDataRows()) dataRows.add(r);
    const sortedDataRows = [...dataRows].sort((a, b) => a - b);
    const bound = Math.max(1, sortedDataRows.filter(r => r <= row).length);
    const pendingNew = this.changes.isInserted(row);
    const cells: Cell[] = [];
    const covering = new Map<string, unknown>();
    for (const { field, address } of parsed) {
      const rows = originRows(address);
      const ownCell = rows.includes(row) || pendingNew;
      const spanned = rows.find(r => {
        // Only an expanded group cell forms a covering block (a plain list instance never does).
        const src = this.sourceCells.get(`${r},${address[1]}`);
        if (!src || src.type !== 'Group' || src.spillDirection === 'Horizontal') return false;
        const extent = Math.max(this.getSpan(r, address[1])?.rowCount ?? 1,
          this.contextExtents.get(`${r},${address[1]}`) ?? 1);
        return r < row && row < r + extent;
      });
      const above = spanned ?? rows.filter(r => r < row).pop();
      const ownValue = ownCell ? this.getValue(row, address[1]) : undefined;
      const ownTouched = ownCell && (this.changes.isEdited(row, address[1]) ||
        (ownValue !== null && ownValue !== undefined && ownValue !== ''));
      let cellRow: number | undefined;
      let value: unknown;
      if (ownTouched) { cellRow = row; value = ownValue; }
      else if (rows.includes(row) && (forDelete || !pendingNew)) { cellRow = row; value = ownValue; }
      else if (spanned !== undefined) { cellRow = spanned; value = this.getValue(spanned, address[1]); }
      else if (pendingNew && !field.isPrimary) { cellRow = row; value = ownValue; }
      else if (above !== undefined && !pendingNew) { cellRow = above; value = this.getValue(above, address[1]); }
      else if (ownCell) { cellRow = row; value = ownValue; }
      if (cellRow === undefined) continue;
      cells.push({ field: field.dbColumnName, row: cellRow, col: address[1], value });
      const nonEmpty = (item: unknown): boolean => item !== null && item !== undefined && item !== '';
      if (cellRow !== row && nonEmpty(value)) covering.set(field.dbColumnName, value);
    }
    if (!cells.length) return undefined;
    return { anchor: row, pendingNew, cells, covering, dataIndex: bound - 1 };
  }
  /** Report rows that display a data record (generated cells of every bound vertical field). */
  boundDataRows(): number[] {
    const rows = new Set<number>();
    const seen = new Set<TemplateCell>();
    for (const [r, c, cell] of this.template.entries()) {
      if (!cell.binding || cell.type === 'Summary' || cell.spillDirection === 'Horizontal') continue;
      if (seen.has(cell)) continue;
      seen.add(cell);
      for (const [or] of this.cellOrigins.get(`${r},${c}`) ?? []) rows.add(or);
    }
    return [...rows];
  }
  private shiftOrigins(row: number, delta: 1 | -1): void {
    const cells = new Map<string, TemplateCell>();
    for (const [key, cell] of this.sourceCells) {
      const [r, c] = key.split(',').map(Number) as [number, number];
      if (delta === -1 && r === row) continue;
      cells.set(`${r >= row ? r + delta : r},${c}`, cell);
      if (delta === 1 && r === row - 1) cells.set(`${row},${c}`, cell);
    }
    this.sourceCells = cells;
    for (const [key, origins] of this.cellOrigins) {
      this.cellOrigins.set(key, origins.filter(([r]) => delta !== -1 || r !== row)
        .map(([r, c]) => [r >= row ? r + delta : r, c]));
    }
    const columnExtents = new Map<string, number>();
    for (const [key, extent] of this.columnExtents) {
      const [r, c] = key.split(',').map(Number) as [number, number];
      if (delta === -1 && r === row) continue;
      columnExtents.set(`${r >= row ? r + delta : r},${c}`, extent);
    }
    this.columnExtents = columnExtents;
    const phantomOrigins = new Map<string, { value: unknown; rowCount: number; colCount: number }[]>();
    for (const [key, phantoms] of this.phantomOrigins) {
      const [r, c] = key.split(',').map(Number) as [number, number];
      if (delta === -1 && r === row) continue;
      phantomOrigins.set(`${r >= row ? r + delta : r},${c}`, phantoms);
    }
    this.phantomOrigins = phantomOrigins;
  }
  resetCellValue(row: number, col: number): void { this.changes.reset(row, col); }
  getChanges(): ReturnType<ReportChanges['get']> { return this.changes.get(); }
  isDirty(): boolean { return this.changes.isDirty(); }
  submit(): void {
    const changes = this.changes.get();
    for (const change of changes) {
      const table = this.data?.tables[change.rule.tableName];
      if (!table) {
        if (change.records.length || change.deleteRecords.length)
          notImplemented('GC.Spread.Report.ReportSheet.submit missing data table');
        continue;
      }
      // The trial removes the claimed rows first, then lets each record write back (through its
      // primary values) onto the first remaining row matching them (via the group block it
      // belongs to); records without a match are appended. Remote tables take the same local
      // write-back path when no remote endpoints are configured (TASK 48 probe e6).
      const claimed = new Set(this.changes.deleteClaims(
        Array.from({ length: table.rowCount() }, (_, index) => table.get(index)!)));
      for (const index of [...claimed].sort((a, b) => b - a)) table.removeItems([index]);
      const rows = () => Array.from({ length: table.rowCount() }, (_, index) => table.get(index)!);
      for (const record of change.records) {
        const primaryFields = change.rule.fields.filter(field => field.isPrimary);
        const primaries: { name: string; value: unknown }[] = [];
        for (const field of primaryFields) {
          const info = record.info[field.dbColumnName];
          if (!info) continue;
          const own = this.getValue(info.row, info.col);
          const value = own !== null && own !== undefined && own !== '' ? own : this.resolveCovering(info.row, field);
          if (value !== undefined && value !== null && value !== '') primaries.push({ name: field.dbColumnName, value });
        }
        if (!primaries.length || primaries.length !== primaryFields.length) continue;
        let hasValue = false;
        for (const value of Object.values(record.entity))
          if (value !== null && value !== undefined && value !== '') hasValue = true;
        if (!hasValue) continue;
        const index = rows().findIndex(row => primaries.every(primary =>
          Object.is(row[primary.name], primary.value)));
        if (index < 0) {
          const entity: Record<string, unknown> = { ...record.entity };
          for (const field of change.rule.fields) {
            const info = record.info[field.dbColumnName];
            if (info?.state === 'new') entity[field.dbColumnName] = this.getValue(info.row, info.col);
          }
          table.insertItem(table.rowCount(), entity);
          continue;
        }
        const values: Record<string, unknown> = {};
        for (const field of change.rule.fields) {
          const info = record.info[field.dbColumnName];
          if (!info) continue;
          // 'new' cells write their value through even when empty (trial ed6: the pending blank
          // sets the matched row's field to blank); other cells write their non-empty values.
          if (info.state === 'new') { values[field.dbColumnName] = this.getValue(info.row, info.col); continue; }
          const value = record.entity[field.dbColumnName];
          if (value !== null && value !== undefined && value !== '') values[field.dbColumnName] = value;
        }
        table.updateItem(index, values);
      }
    }
    this.changes.clear();
  }
  /** The group-block primary value a pending record writes into (covering resolution). */
  private resolveCovering(row: number, field: { dbColumnName: string; formula: string }): unknown {
    const ref = this.resolveRecord(row, [field], false);
    return ref?.covering.get(field.dbColumnName);
  }
  getTemplate(): TemplateSheet { return this.template; }
  /** The trial's ReportSheet answers `undefined` (not `null`) for a cell without a style. */
  override getStyle(row: number, col: number, area?: number): Style | null {
    return (super.getStyle(row, col, area) ?? undefined) as Style | null;
  }
  getTemplateCell(row: number, col: number): TemplateCell | undefined {
    return this.mode === 'Design' ? this.template.getTemplateCell(row, col) : this.sourceCells.get(`${row},${col}`);
  }
  renderMode(): Mode;
  renderMode(value: Mode): Mode;
  renderMode(value?: Mode): Mode {
    if (value !== undefined) { this.mode = value; this.reportOptions().renderMode = value; this.refresh(); }
    return this.mode;
  }
  /**
   * Print hook (TASK 48): the report pages the print pipeline should paginate. Defined only for
   * a paginated preview with `options.printAllPages`; `printPageIndexes` restricts the pages.
   */
  _printPageIndices(): number[] | undefined {
    if (this.mode !== 'PaginatedPreview' || !this.reportOptions().printAllPages || this.pages <= 1) return undefined;
    const wanted = this.printIndexes.length ? this.printIndexes : Array.from({ length: this.pages }, (_, index) => index);
    return wanted.filter(index => Number.isInteger(index) && index >= 0 && index < this.pages);
  }
  async setRenderModeAsync(value: Mode): Promise<void> { this.renderMode(value); }
  parameter(value?: Record<string, unknown>): Record<string, unknown> {
    if (value !== undefined) this.params = value;
    return this.params;
  }
  setParametersUI(host: HTMLElement | string, init: (sheet: Worksheet) => void,
    onChange: (sheet: ReportSheet, args: { tag: unknown; oldValue: unknown; newValue: unknown }) => void): void {
    this.parameterWorkbook?.destroy();
    const workbook = new Workbook(host);
    this.parameterWorkbook = workbook;
    const sheet = workbook.getActiveSheet();
    sheet.setDataSource(new CellBindingSource(structuredClone(this.params)));
    init(sheet);
    sheet.bind(Events.EditEnded, (_sender, event) => {
      const { row, col, isCancel } = event as { row: number; col: number; isCancel?: boolean };
      if (isCancel) return;
      const path = sheet.getBindingPath(row, col);
      if (!path) return;
      const args = { tag: sheet.getTag(row, col), oldValue: getPath(this.params, path), newValue: sheet.getValue(row, col) };
      onChange(this, args);
      setPath(this.params, path, args.newValue);
      sheet.setValue(row, col, args.newValue);
    });
    sheet.bind(Events.ButtonClicked, (_sender, event) => {
      const { row, col } = event as { row: number; col: number };
      onChange(this, { tag: sheet.getTag(row, col), oldValue: undefined, newValue: undefined });
    });
  }
  currentPage(value?: number): number {
    if (value !== undefined) { this.page = value; if (this.mode === 'PaginatedPreview') this.renderPage(value); }
    return this.page;
  }
  getPageCount(): number { return this.pages; }
  getPagesCount(): number { return this.getPageCount(); }
  getCollapseState(row: number, col: number): boolean { return this.collapsed.has(`${row},${col}`); }
  /** Internal: all Group-cell instances of the rendered layout (collapse command targets). */
  _groupInstances(): [number, number][] {
    return [...this.sourceCells].filter(([, cell]) => cell.type === 'Group')
      .map(([key]) => key.split(',').map(Number) as [number, number]);
  }
  /** Internal: the cell hosts a data record (add/delete record targets). */
  _hasRecordCell(row: number, col: number): boolean { return this.sourceCells.has(`${row},${col}`); }
  /** Internal: coordinates of every generated cell (reset-cell-value sweep). */
  _recordCells(): [number, number][] {
    return [...this.sourceCells.keys()].map((key) => key.split(',').map(Number) as [number, number]);
  }
  /** Internal: layout serialization + change bookkeeping for the record commands' undo. */
  _undoState(): { json: Record<string, unknown>; changes: unknown } {
    return { json: this.toJSON(), changes: this.changes._snapshot() };
  }
  /** Internal: rebuild the layout, then restore the change bookkeeping (`renderPage` clears it). */
  _restoreUndoState(state: { json: Record<string, unknown>; changes: unknown }): void {
    this.fromJSON(state.json);
    this.changes._restore(state.changes as never);
  }
  /** Internal: per-cell collapse-button visibility (trial template setting, default on). */
  _collapseButtonVisible(row: number, col: number, value?: boolean): boolean {
    const key = `${row},${col}`;
    if (value !== undefined) {
      if (value) this.collapseButtons.delete(key);
      else this.collapseButtons.set(key, false);
    }
    return this.collapseButtons.get(key) !== false;
  }
  /** Internal: per-chart preview visibility (trial template setting, default off). */
  _chartPreviewVisible(row: number, col: number, value?: boolean): boolean {
    const key = `${row},${col}`;
    if (value !== undefined) this.chartPreviews.set(key, value);
    return this.chartPreviews.get(key) === true;
  }
  toggleCollapseState(row: number, col: number, targetState?: 'Collapsed' | 'Expanded', recursive = false): void {
    const entries = this.template.entries();
    const key = `${row},${col}`;
    if (this.sourceCells.get(key)?.type !== 'Group') return;
    const collapse = targetState === undefined ? !this.collapsed.has(key) : targetState === 'Collapsed';
    const span = this.getSpan(row, col);
    const end = row + (this.contextExtents.get(key) ?? span?.rowCount ?? 1);
    const parents = this.contextParents();
    const root = this.sourceCells.get(key);
    const descendsFromRoot = (cell: TemplateCell): boolean => {
      const seen = new Set<TemplateCell>([cell]);
      const queue = [...parents.get(cell) ?? []];
      while (queue.length) {
        const parent = queue.pop()!;
        if (parent === root) return true;
        if (seen.has(parent)) continue;
        seen.add(parent);
        queue.push(...parents.get(parent) ?? []);
      }
      return false;
    };
    const hasChild = (cell: TemplateCell): boolean => entries.some(([, , entry]) => parents.get(entry)?.has(cell));
    const targets = recursive ? [...this.sourceCells].filter(([candidate, cell]) => {
      const [r, c] = candidate.split(',').map(Number) as [number, number];
      return cell.type === 'Group' && r >= row && r < end && c >= col &&
        (candidate === key || (hasChild(cell) && descendsFromRoot(cell)));
    }).map(([candidate]) => candidate) : [key];
    for (const target of targets) {
      if (collapse) { this.collapsed.add(target); this.collapseModes.set(target, target === key ? 'toggle' : 'descendant'); }
      else { this.collapsed.delete(target); this.collapseModes.delete(target); }
    }
    this.applyCollapse();
  }
  /**
   * Re-apply the visibility of every collapsed instance. A collapsed group hides the rows its
   * block expanded; a group that its template collapsed through `initialExpansionState` also
   * hides the columns of a horizontal group up to the next instance of the same group, while
   * the last instance keeps its column, like the trial.
   */
  private applyCollapse(): void {
    for (const [hiddenRow, wasVisible] of this.collapseHiddenRows) this.setRowVisible(hiddenRow, wasVisible);
    this.collapseHiddenRows.clear();
    for (const [hiddenColumn, wasVisible] of this.collapseHiddenColumns) this.setColumnVisible(hiddenColumn, wasVisible);
    this.collapseHiddenColumns.clear();
    for (const collapsed of this.collapsed) {
      const [row, column] = collapsed.split(',').map(Number) as [number, number];
      const span = this.getSpan(row, column);
      const extent = this.contextExtents.get(collapsed) ?? span?.rowCount ?? 1;
      for (let hiddenRow = row + 1; hiddenRow < row + extent; hiddenRow++) {
        if (!this.collapseHiddenRows.has(hiddenRow)) this.collapseHiddenRows.set(hiddenRow, this.getRowVisible(hiddenRow));
        this.setRowVisible(hiddenRow, false);
      }
      const cell = this.sourceCells.get(collapsed);
      if (!cell || cell.spillDirection !== 'Horizontal' || cell.context?.vertical !== 'None') continue;
      const mode = this.collapseModes.get(collapsed) ?? 'descendant';
      if (mode === 'descendant') continue;
      const columns = [...this.sourceCells].filter(([, other]) => other === cell)
        .map(([key]) => Number(key.split(',')[1])).sort((a, b) => a - b);
      // A collapsed instance of a horizontal group hides the instance columns to its left;
      // the last instance therefore keeps its own column, like the trial.
      const from = columns[0]!;
      const to = column - 1;
      for (let hiddenColumn = from; hiddenColumn <= to; hiddenColumn++) {
        if (!this.collapseHiddenColumns.has(hiddenColumn))
          this.collapseHiddenColumns.set(hiddenColumn, this.getColumnVisible(hiddenColumn));
        this.setColumnVisible(hiddenColumn, false);
      }
    }
  }
  printPageIndexes(value?: number[]): number[] {
    if (value !== undefined) this.printIndexes = value;
    return this.printIndexes;
  }
  generatePageSheets(addToSpread: boolean, sheetNameGenerator?: (pageIndex: number) => string): Worksheet[] {
    if (this.mode !== 'PaginatedPreview') return [];
    const current = this.page;
    const count = this.pages;
    const sheets: Worksheet[] = [];
    try {
      for (let index = 0; index < count; index++) {
        this.renderPage(index);
        const sheet = this.toWorksheet();
        sheet.name(sheetNameGenerator?.(index) ?? `${this.name()}-${index + 1}`);
        sheets.push(sheet);
      }
    } finally {
      this.currentPage(current);
    }
    if (addToSpread) {
      const parent = this.getParent() as unknown as { sheets: readonly Worksheet[]; addSheet(index: number, sheet: Worksheet): void };
      if (parent) for (const sheet of sheets) parent.addSheet(parent.sheets.length, sheet);
    }
    return sheets;
  }
  toWorksheet(): Worksheet {
    const sheet = new Worksheet(this.name());
    const range = this.getRange();
    sheet.setRowCount(range.rowCount);
    sheet.setColumnCount(range.colCount);
    for (let row = 0; row < range.rowCount; row++) {
      const height = this.getRowHeight(row);
      if (height !== undefined) sheet.setRowHeight(row, height);
      for (let col = 0; col < range.colCount; col++) {
        const value = this.getValue(row, col);
        if (value !== null && value !== undefined) sheet.setValue(row, col, value);
        const style = this.getStyle(row, col);
        if (style) sheet.setStyle(row, col, style);
        const span = this.getSpan(row, col);
        if (span && span.row === row && span.col === col) sheet.addSpan(row, col, span.rowCount, span.colCount);
      }
    }
    for (let col = 0; col < range.colCount; col++) {
      const width = this.getColumnWidth(col);
      if (width !== undefined) sheet.setColumnWidth(col, width);
    }
    return sheet;
  }
  override getRange(): CellRange;
  override getRange(row: number, col: number, rowCount?: number, colCount?: number, area?: number): CellRange;
  override getRange(address: string, area?: number): CellRange;
  override getRange(row?: number | string, col = 0, rowCount = 1, colCount = 1, area?: number): CellRange {
    if (row === undefined) return new CellRange(this, 0, 0,
      this.mode === 'Design' ? this.template.getRowCount() : this.height,
      this.mode === 'Design' ? this.template.getColumnCount() : this.width);
    return typeof row === 'string' ? super.getRange(row, col) : super.getRange(row, col, rowCount, colCount, area);
  }
  getCells(row: number, col: number, currentRow?: number, currentCol?: number):
  { value: unknown; row: number; col: number; rowCount: number; colCount: number }[] {
    let origins = this.cellOrigins.get(`${row},${col}`) ?? [];
    let phantom = true;
    if (currentRow !== undefined && currentCol !== undefined) {
      const current = this.sourceCells.get(`${currentRow},${currentCol}`);
      const contains = (key: string, cell: TemplateCell): boolean => {
        const [r, c] = key.split(',').map(Number) as [number, number];
        const span = this.getSpan(r, c);
        return r <= currentRow && currentRow < r + (this.contextExtents.get(key) ?? span?.rowCount ?? 1) && c <= currentCol &&
          currentCol < c + (cell.spillDirection === 'Horizontal' ? this.columnExtents.get(key) ?? span?.colCount ?? 1
            : Number.POSITIVE_INFINITY);
      };
      const laidOut = this.sourceCells.has(`${currentRow},${currentCol}`) || [...this.sourceCells].some(([key]) => {
        const [r, c] = key.split(',').map(Number) as [number, number];
        const span = this.getSpan(r, c);
        return !!span && r <= currentRow && currentRow < r + span.rowCount && c <= currentCol && currentCol < c + span.colCount;
      });
      const own = current?.type === 'List';
      if (own) {
        // The record of the current list cell is the context.
        origins = origins.filter(([r, c]) => current!.spillDirection === 'Horizontal' ? c === currentCol : r === currentRow);
      } else if (laidOut) {
        const group = [...this.sourceCells].filter(([key, cell]) => cell.type === 'Group' && contains(key, cell))
          .sort((a, b) => {
            const [ra, ca] = a[0].split(',').map(Number) as [number, number];
            const [rb, cb] = b[0].split(',').map(Number) as [number, number];
            return ra !== rb ? ra - rb : ca - cb;
          }).pop();
        if (group) {
          const [key, cell] = group;
          const [r, c] = key.split(',').map(Number) as [number, number];
          const span = this.getSpan(r, c);
          const end = r + (this.contextExtents.get(key) ?? span?.rowCount ?? 1);
          const columns = cell.spillDirection === 'Horizontal' ? c + (this.columnExtents.get(key) ?? span?.colCount ?? 1)
            : Number.POSITIVE_INFINITY;
          origins = origins.filter(([candidate, candidateCol]) => candidate >= r && candidate < end &&
            candidateCol >= c && candidateCol < columns);
        }
        // Only a group context reports the instances its block has no room for.
        if (current) phantom = current.type === 'Group';
      }
      // Outside every expanded cell the selection is the whole report, like the trial.
    }
    return origins.flatMap(([r, c]) => {
      const span = this.getSpan(r, c);
      const cells = [{ value: this.getValue(r, c), row: r, col: c, rowCount: span?.rowCount ?? 1,
        colCount: span?.colCount ?? 1 }];
      for (const item of phantom ? this.phantomOrigins.get(`${r},${c}`) ?? [] : [])
        cells.push({ value: item.value, row: r, col: c, rowCount: item.rowCount, colCount: item.colCount });
      return cells;
    });
  }
  private recordOrigin(row: number, col: number, r: number, c: number): void {
    const key = `${row},${col}`;
    const cells = this.cellOrigins.get(key) ?? [];
    cells.push([r, c]);
    this.cellOrigins.set(key, cells);
  }
  override toJSON(options: SerializationOptions = {}): Record<string, unknown> {
    const report = this.reportOptions();
    return { template: this.template.toJSON(options), reportName: this.name(), name: this.name(), sheetType: 3,
      renderMode: this.mode, printAllPages: report.printAllPages ?? true, joinType: report.joinType ?? 'Left',
      parameter: this.params };
  }
  override fromJSON(value: object): void {
    const json = value as { template?: object; name?: string; reportName?: string; renderMode?: Mode;
      parameter?: Record<string, unknown> };
    if (json.name ?? json.reportName) this.name(json.name ?? json.reportName!);
    if (json.template) this.template.fromJSON(json.template);
    this.mode = json.renderMode ?? 'Preview';
    this.params = json.parameter ?? {};
    this.refresh();
  }
  loadTemplate(value: object): void { this.template.fromJSON(value); this.refresh(); }
  async loadTemplateAsync(value: object): Promise<void> { this.loadTemplate(value); }
  regenerateReport(): void { this.refresh(); }
  async regenerateReportAsync(): Promise<void> { this.refresh(); }
  async refreshAsync(): Promise<void> { this.refresh(); }
  refresh(): void { this.page = 0; this.renderPage(0); }
  /**
   * Record range shown on one page of a report whose pagination data cell is a plain list
   * (TASK 48 trial probes `report-pgcheck2/4/5`, `city8perPage3`, `amount8plain`,
   * `listSummary8`): records are sliced sequentially, `page * perPage` records per page; a page
   * index past the last chunk repeats the last chunk.
   */
  private singleColumnPageRange(page: number, chunks: number, recordCount: number, perPage: number):
  [number, number] {
    const index = Math.min(page, chunks - 1);
    return [index * perPage, Math.min(recordCount, (index + 1) * perPage)];
  }
  private renderPage(page: number): void {
    this.changes.clear();
    for (const [row, wasVisible] of this.collapseHiddenRows) this.setRowVisible(row, wasVisible);
    this.collapseHiddenRows.clear();
    for (const [column, wasVisible] of this.collapseHiddenColumns) this.setColumnVisible(column, wasVisible);
    this.collapseHiddenColumns.clear();
    this.collapsed.clear();
    this.collapseModes.clear();
    const entries = this.template.entries().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const rowSizes = new Map<number, number>();
    const pagination = this.template.getPaginationSetting();
    const paginationAddress = pagination?.rowPagination && parseCellAddress(pagination.rowPagination.paginationDataCell);
    const paginationRow = paginationAddress?.[0] ?? -1;
    const paginationCol = paginationAddress?.[1] ?? -1;
    const perPage = pagination?.rowPagination?.rowCountPerPage ?? 0;
    const paginatedCell = pagination?.rowPagination ? this.template.getTemplateCell(paginationRow, paginationCol) : undefined;
    const splits = this.mode === 'PaginatedPreview' && !!pagination?.rowPagination && perPage > 0 &&
      paginatedCell?.type === 'List';
    const single = this.mode !== 'Design' && !!pagination && !splits;
    // Rows inside the configured title range repeat at the top of every page and rows inside a
    // configured end range repeat at the bottom. Rows above the paginated template row that are
    // not titles belong to the first page only, rows below it (when the report splits) to the
    // last page only, like the trial. A report that fits on a single page (`paperSizePagination`,
    // column ranges, a missing/invalid row pagination) shows all rows once, in template order.
    const titleRows = (row: number): boolean => !!pagination?.titleRow &&
      row >= pagination.titleRow.start && row <= pagination.titleRow.end;
    const endRows = (row: number): boolean => !!pagination?.endRow &&
      row >= pagination.endRow.start && row <= pagination.endRow.end;
    const visibleRow = (row: number): boolean => !pagination?.rowPagination || single || row === paginationRow ||
      (row < paginationRow ? titleRows(row) || page === 0
        : endRows(row) || page === Math.max(1, this.pages) - 1);
    const rowOffset = (row: number) => Array.from({ length: row }, (_, key) =>
      visibleRow(key) ? Math.max(1, rowSizes.get(key) ?? 1) : 0).reduce((sum, size) => sum + size, 0);
    if (this.template.getLayoutSetting()) {
      return notImplemented('GC.Spread.Report.ReportSheet.refresh layout setting');
    }
    for (const [row, col] of this.generatedSpans) this.removeSpan(row, col);
    this.generatedSpans = [];
    this.clear(0, 0, this.getRowCount(), this.getColumnCount(), 3, GC.Spread.Sheets.StorageType.data | GC.Spread.Sheets.StorageType.style);
    this.sourceCells.clear();
    this.cellOrigins.clear();
    this.contextExtents.clear();
    this.columnExtents.clear();
    this.phantomOrigins.clear();
    this.height = 1; this.width = 1;
    const hierarchyBinding = entries.find(([, , cell]) => !!cell.binding)?.[2].binding?.match(/^([^\[]+)\[([^\]]+)\]$/);
    const hierarchyTable = hierarchyBinding && this.data?.tables[hierarchyBinding[1]!];
    const tableRows = hierarchyTable
      ? Array.from({ length: hierarchyTable.rowCount() }, (_, index) => hierarchyTable.get(index)!) : [];
    const paginating = splits;
    // Trial observations (TASK 48 probes `report-pgcheck2..6`, `gb1..gb7`):
    // - Only a `List` pagination data cell splits pages (a group data cell keeps the whole
    //   report on one page).
    // - Records always pack strictly in data order, `perPage` per page; group boundaries never
    //   force an early break and `paginateBeforeRow` showed no packing effect (gb3: a page
    //   holds a group's tail and the next group's head; gb5 == gb1 with and without it).
    // - Every data cell on the pagination row takes the same sequential record slice
    //   (`city8perPage3`: pages A,B,C / D,A,B / C,D).
    // - When the title range covers the pagination row, each page after the first starts with
    //   the full expansion of the first group block of that row (gb1/gb2/gb3/gb6: the whole
    //   first group repeats, then the page's own records follow).
    const rootDataCell = entries.filter(([, , cell]) => cell.type !== 'Summary' && cell.binding)
      .sort((a, b) => a[0] - b[0] || a[1] - b[1])[0];
    const packMode = paginating && !!hierarchyTable &&
      entries.some(([row, col, cell]) => cell.type === 'Group' && cell.binding &&
        row === paginationRow && col < paginationCol);
    const parityMode = paginating && !packMode && !!rootDataCell && !!hierarchyTable;
    const fullLayout = this.mode !== 'Design' && !!hierarchyTable && !parityMode &&
      entries.every(([row, col]) => !this.template.getSpan(row, col))
      ? expandHierarchy(entries, tableRows, this.params) : undefined;
    let hierarchy = fullLayout;
    let repeatContentGroups: { field: string; cell: TemplateCell }[] = [];
    let pageRange: [number, number] | undefined;
    this.pages = 1;
    if (paginating && parityMode) {
      const rootRows = selectRows(tableRows, rootDataCell![2], this.params);
      const chunks = Math.max(1, Math.ceil(rootRows.length / perPage));
      this.pages = chunks;
      pageRange = this.singleColumnPageRange(page, chunks, rootRows.length, perPage);
    } else if (paginating && packMode) {
      // Group blocks beside the paginated list: the page keeps its own records expanded with
      // their groups, and (when the pagination row is a title row) after the first page the
      // first group block repeats above them, like the trial.
      const anchorAddress = cellAddress(paginationRow, paginationCol);
      const sorted = [...entries].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      const parentOf = (cell: TemplateCell): TemplateCell | undefined => {
        const position = sorted.findIndex(([, , entry]) => entry === cell);
        const context = cell.context?.vertical;
        if (context === 'None') return undefined;
        if (context) return sorted.find(([row, col]) => cellAddress(row, col) === context.toUpperCase())?.[2];
        for (let above = position - 1; above >= 0; above--) if (sorted[above]![2].type !== 'Summary') return sorted[above]![2];
        return undefined;
      };
      const chainGroups: { field: string; cell: TemplateCell }[] = [];
      let node = parentOf(paginatedCell!);
      while (node && node.type === 'Group') {
        const [row] = entries.find(([, , entry]) => entry === node)!;
        const field = node.binding?.match(/^([^\[]+)\[([^\]]+)\]$/)?.[2];
        if (!field || row !== paginationRow) break;
        chainGroups.push({ field, cell: node });
        node = parentOf(node);
      }
      const dataEntries = entries.filter(([, , cell]) => !!cell.binding &&
        ['Group', 'List', 'Summary'].includes(cell.type) &&
        (!cell.spillDirection || cell.spillDirection === 'Vertical'));
      const full = expandHierarchy(dataEntries, tableRows, this.params);
      const leafRecords = full ? (full.get(anchorAddress) ?? []).flatMap(item => item.rows ?? []) : [];
      if (leafRecords.length) {
        const segments = chunkRecords(leafRecords, perPage);
        this.pages = segments.length;
        const segment = segments[Math.min(page, segments.length - 1)]!;
        const pageRecords = segment.records;
        repeatContentGroups = chainGroups.filter(group => group.cell.repeatContentWhenPaging === true);
        hierarchy = expandHierarchy(dataEntries, pageRecords, this.params);
        if (hierarchy && segment.start > 0 && chainGroups.length && titleRows(paginationRow)) {
          const outer = chainGroups[chainGroups.length - 1]!;
          const firstValue = leafRecords[0]![outer.field];
          let firstEnd = leafRecords.length;
          for (let i = 0; i < leafRecords.length; i++)
            if (!Object.is(leafRecords[i]![outer.field], firstValue)) { firstEnd = i; break; }
          const titleEntries = dataEntries.filter(([row]) => row === paginationRow);
          const titleLayout = expandHierarchy(titleEntries, leafRecords.slice(0, firstEnd), this.params);
          if (titleLayout) {
            const height = Math.max(paginationRow + 1,
              ...[...titleLayout.values()].flat().map(item => item.row + item.rowCount)) - paginationRow;
            const merged = new Map<string, HierarchyCell[]>(titleLayout);
            for (const [key, items] of hierarchy) {
              const list = merged.get(key) ?? [];
              for (const item of items) list.push({ ...item, row: item.row + height });
              merged.set(key, list);
            }
            hierarchy = merged;
          }
        }
      } else {
        this.pages = Math.max(1, Math.ceil(selectRows(tableRows, paginatedCell!, this.params).length / perPage));
      }
    } else if (paginating) {
      this.pages = Math.max(1, Math.ceil(selectRows(tableRows, paginatedCell!, this.params).length / perPage));
    }
    const viewCells = [...(this.template._viewCellStore()?.entries() ?? [])];
    const axes = !hierarchy && this.mode !== 'Design' && !pagination && hierarchyTable &&
      entries.some(([, , cell]) => cell.spillDirection === 'Horizontal') &&
      viewCells.every(([row, col]) => this.template.getTemplateCell(row, col))
      ? expandAxes(entries, tableRows, this.params)
      : undefined;
    for (const [row, col, cell] of entries) {
      if (axes) continue;
      if (pagination?.rowPagination && !visibleRow(row)) continue;
      if (hierarchy && cell.binding) {
        for (const item of hierarchy.get(cellAddress(row, col)) ?? []) {
          const targetRow = item.row;
          if (targetRow >= this.getRowCount()) this.setRowCount(targetRow + 1);
          if (col >= this.getColumnCount()) this.setColumnCount(col + 1);
          this.setValue(targetRow, col, item.value);
          const style = this.template.getStyle(row, col);
          if (style) this.setStyle(targetRow, col, style);
          const height = this.template.getRowHeight(row);
          if (height !== undefined) for (let i = 0; i < item.rowCount; i++) this.setRowHeight(targetRow + i, height);
          const width = this.template.getColumnWidth(col);
          if (width !== undefined) this.setColumnWidth(col, width);
          if (item.rowCount > 1) {
            this.addSpan(targetRow, col, item.rowCount, 1);
            this.generatedSpans.push([targetRow, col]);
          }
          this.sourceCells.set(`${targetRow},${col}`, cell);
          this.contextExtents.set(`${targetRow},${col}`, item.extent);
          this.recordOrigin(row, col, targetRow, col);
          if (repeatContentGroups.some(group => group.cell === cell)) {
            // `repeatContentWhenPaging` groups show their value on every covered row instead of
            // merging them, like the trial.
            for (let filled = targetRow + 1; filled < targetRow + item.extent; filled++) this.setValue(filled, col, item.value);
          }
          this.height = Math.max(this.height, targetRow + item.rowCount);
          this.width = Math.max(this.width, col + 1);
        }
        rowSizes.set(row, Math.max(rowSizes.get(row) ?? 1, this.height - row));
        continue;
      }
      if (hierarchy) {
        // A static template row inside a pack-mode layout takes exactly its own row, after the
        // blocks of the rows above it (trial `gb1`: the `End` row follows a gap row).
        const baseRow = rowOffset(row);
        const value = this.template.getValue(row, col);
        const style = this.template.getStyle(row, col);
        if (baseRow >= this.getRowCount()) this.setRowCount(baseRow + 1);
        if (col >= this.getColumnCount()) this.setColumnCount(col + 1);
        if (value !== null && value !== undefined) this.setValue(baseRow, col, value);
        if (style) this.setStyle(baseRow, col, style);
        const rowHeight = this.template.getRowHeight(row);
        if (rowHeight !== undefined) this.setRowHeight(baseRow, rowHeight);
        const columnWidth = this.template.getColumnWidth(col);
        if (columnWidth !== undefined) this.setColumnWidth(col, columnWidth);
        const span = this.template.getSpan(row, col);
        if (span && span.row === row && span.col === col) {
          this.addSpan(baseRow, col, span.rowCount, span.colCount);
          this.generatedSpans.push([baseRow, col]);
        }
        rowSizes.set(row, 1);
        this.height = Math.max(this.height, baseRow + 1); this.width = Math.max(this.width, col + 1);
        continue;
      }
      const leftGroup = entries.find(([r, c, entry]) => r === row && c < col && entry.type === 'Group');
      const groupAddress = leftGroup ? cellAddress(row, leftGroup[1]) : undefined;
      if (cell.context && Object.values(cell.context).some(value => value !== 'None' && value !== groupAddress)) {
        return notImplemented('GC.Spread.Report.ReportSheet.refresh context');
      }
      const baseRow = this.mode === 'Design' ? row : rowOffset(row);
      const match = cell.binding?.match(/^([^\[]+)\[([^\]]+)\]$/);
      const table = match && this.data?.tables[match[1]!];
      let rows: Row[] = selectRows(table ? Array.from({ length: table.rowCount() }, (_, index) => table.get(index)!) : [],
        cell, this.params);
      if (paginating && row === paginationRow && pageRange && match)
        rows = rows.slice(pageRange[0], pageRange[1]);
      const leftMatch = leftGroup?.[2].binding?.match(/^([^\[]+)\[([^\]]+)\]$/);
      if ((cell.type === 'List' || cell.type === 'Group') && cell.context?.vertical !== 'None' &&
        leftMatch && match && leftMatch[1] === match[1]) {
        const keys = [...new Set(rows.map(item => item[leftMatch[2]!]))];
        rows = keys.flatMap(key => rows.filter(item => item[leftMatch[2]!] === key));
      }
      let values: unknown[] = match ? rows.map(item => item[match[2]!]) : [this.template.getValue(row, col)];
      if (cell.type === 'Group') {
        if (leftMatch && match && leftMatch[1] === match[1] && cell.context?.vertical !== 'None') {
          const keys = [...new Set(rows.map(item => item[leftMatch[2]!]))];
          values = keys.flatMap(key => [...new Set(rows.filter(item => item[leftMatch[2]!] === key).map(item => item[match[2]!] ))]);
        } else values = [...new Set(values)];
      }
      if (cell.type === 'Summary') {
        const group = entries.find(([r, c, entry]) => r === row && c < col &&
          (entry.type === 'Group' || entry.type === 'List') && cell.context?.vertical !== 'None');
        const groupMatch = group?.[2].binding?.match(/^([^\[]+)\[([^\]]+)\]$/);
        const subsets = groupMatch && match && groupMatch[1] === match[1]
          ? group?.[2].type === 'List' ? rows.map(item => [item])
            : [...new Set(rows.map(item => item[groupMatch[2]!]))].map(key => rows.filter(item => item[groupMatch[2]!] === key))
          : [rows];
        values = subsets.map(subset => {
          const items = subset.map(item => match ? item[match[2]!] : undefined);
          const numbers = items.filter((value): value is number => typeof value === 'number');
          const sum = numbers.reduce((a, b) => a + b, 0);
          return cell.aggregate === 'Count' ? items.length : cell.aggregate === 'Avg' ? sum / numbers.length
            : cell.aggregate === 'Max' ? Math.max(...numbers) : cell.aggregate === 'Min' ? Math.min(...numbers) : sum;
        });
      }
      const nextGroup = entries.find(([r, c, entry]) => r === row && c > col && entry.context?.vertical !== 'None' &&
        (entry.type === 'Group' || entry.type === 'List'));
      if (this.mode !== 'Design' && cell.type === 'Group' && nextGroup && match && cell.spillDirection !== 'Horizontal') {
        const nextMatch = nextGroup[2].binding?.match(/^([^\[]+)\[([^\]]+)\]$/);
        if (nextMatch && nextMatch[1] === match[1]) {
          const groups = [...new Set(rows.map(item => item[match[2]!] ))];
          let offset = 0;
          for (const group of groups) {
            const groupRows = rows.filter(item => item[match[2]!] === group);
            const size = nextGroup[2].type === 'List' ? groupRows.length
              : new Set(groupRows.map(item => item[nextMatch[2]!])).size;
            if (baseRow + offset + size > this.getRowCount()) this.setRowCount(baseRow + offset + size);
            if (col >= this.getColumnCount()) this.setColumnCount(col + 1);
            this.setValue(baseRow + offset, col, group);
            const style = this.template.getStyle(row, col);
            if (style) this.setStyle(baseRow + offset, col, style);
            const rowHeight = this.template.getRowHeight(row);
            if (rowHeight !== undefined) {
              for (let i = 0; i < size; i++) this.setRowHeight(baseRow + offset + i, rowHeight);
            }
            const columnWidth = this.template.getColumnWidth(col);
            if (columnWidth !== undefined) this.setColumnWidth(col, columnWidth);
            this.recordOrigin(row, col, baseRow + offset, col);
            this.sourceCells.set(`${baseRow + offset},${col}`, cell);
            if (size > 1) { this.addSpan(baseRow + offset, col, size, 1); this.generatedSpans.push([baseRow + offset, col]); }
            offset += size;
          }
          rowSizes.set(row, Math.max(rowSizes.get(row) ?? 1, offset));
          this.height = Math.max(this.height, baseRow + offset); this.width = Math.max(this.width, col + 1);
          continue;
        }
      }
      if (cell.spillDirection === 'None' && cell.type === 'List') values = [values];
      if (this.mode === 'Design') values = [this.template.getValue(row, col)];
      if (cell.spillDirection !== 'Horizontal') {
        const rowStep = this.template.getSpan(row, col)?.rowCount ?? 1;
        rowSizes.set(row, Math.max(rowSizes.get(row) ?? 1, 1 + (values.length - 1) * rowStep));
      }
      for (let i = 0; i < values.length; i++) {
        const span = this.template.getSpan(row, col);
        const rowStep = span?.rowCount ?? 1;
        const colStep = span?.colCount ?? 1;
        const r = baseRow + (cell.spillDirection === 'Horizontal' ? 0 : i * rowStep);
        const c = col + (cell.spillDirection === 'Horizontal' ? i * colStep : 0);
        if (r >= this.getRowCount()) this.setRowCount(r + 1);
        if (c >= this.getColumnCount()) this.setColumnCount(c + 1);
        this.setValue(r, c, values[i]);
        const style = this.template.getStyle(row, col);
        if (style) this.setStyle(r, c, style);
        if (span && span.row === row && span.col === col) {
          this.addSpan(r, c, span.rowCount, span.colCount);
          this.generatedSpans.push([r, c]);
        }
        const rowHeight = this.template.getRowHeight(row);
        const columnWidth = this.template.getColumnWidth(col);
        if (rowHeight !== undefined) this.setRowHeight(r, rowHeight);
        if (columnWidth !== undefined) this.setColumnWidth(c, columnWidth);
        this.sourceCells.set(`${r},${c}`, cell);
        this.recordOrigin(row, col, r, c);
        this.height = Math.max(this.height, r + rowStep); this.width = Math.max(this.width, c + colStep);
      }
    }
    if (axes) {
      for (const item of axes.cells) {
        const [templateRow, templateCol] = item.from;
        if (item.row >= this.getRowCount()) this.setRowCount(item.row + item.rowCount);
        if (item.col >= this.getColumnCount()) this.setColumnCount(item.col + item.colCount);
        this.setValue(item.row, item.col, item.value);
        const style = this.template.getStyle(templateRow, templateCol);
        if (style) this.setStyle(item.row, item.col, style);
        const rowHeight = this.template.getRowHeight(templateRow);
        if (rowHeight !== undefined) for (let i = 0; i < item.rowCount; i++) this.setRowHeight(item.row + i, rowHeight);
        const columnWidth = this.template.getColumnWidth(templateCol);
        if (columnWidth !== undefined) this.setColumnWidth(item.col, columnWidth);
        if (item.rowCount > 1 || item.colCount > 1) {
          this.addSpan(item.row, item.col, item.rowCount, item.colCount);
          this.generatedSpans.push([item.row, item.col]);
        }
        this.sourceCells.set(`${item.row},${item.col}`, item.source);
        this.contextExtents.set(`${item.row},${item.col}`, item.extent);
        this.columnExtents.set(`${item.row},${item.col}`, item.colExtent);
        if (item.phantoms?.length) this.phantomOrigins.set(`${item.row},${item.col}`, item.phantoms);
        this.recordOrigin(templateRow, templateCol, item.row, item.col);
        this.height = Math.max(this.height, item.row + item.rowCount);
        this.width = Math.max(this.width, item.col + item.colCount);
      }
      // Row blocks reserve their full depth even where the last rows carry no value.
      this.height = Math.max(this.height, axes.height);
    }
    for (const [row, col] of this.template._viewCellStore()?.entries() ?? []) {
      if (this.template.getTemplateCell(row, col)) continue;
      if (pagination?.rowPagination && !visibleRow(row)) continue;
      const count = this.mode === 'Design' ? 1 : rowSizes.get(row) ?? 1;
      const base = this.mode === 'Design' ? row : rowOffset(row);
      const formula = this.template.getFormula(row, col);
      const value = this.template.getValue(row, col);
      const style = this.template.getStyle(row, col);
      for (let i = 0; i < count; i++) {
        const r = base + i;
        if (r >= this.getRowCount()) this.setRowCount(r + 1);
        if (col >= this.getColumnCount()) this.setColumnCount(col + 1);
        if (formula) this._setFormula(r, col, this._translateFormula(formula, r - row, 0));
        else if (value !== null && value !== undefined) this.setValue(r, col, value);
        if (style) this.setStyle(r, col, style);
        this.recordOrigin(row, col, r, col);
        this.height = Math.max(this.height, r + 1);
        this.width = Math.max(this.width, col + 1);
      }
    }
    for (const [key, cell] of this.sourceCells) {
      if (cell.type === 'Group' && cell.initialExpansionState === 'Collapsed') {
        this.collapsed.add(key);
        this.collapseModes.set(key, 'initial');
      }
    }
    if (this.collapsed.size) this.applyCollapse();
  }
}
