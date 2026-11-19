// Outline column (`GC.Spread.Sheets.OutlineColumn.OutlineColumn`).
//
// Trial semantics (probes f40sc2-outline..f40oc7-combos, .probe/report-item5{b-g}.json):
// - `options(obj)` REPLACES the option set (not merged) and chains (`=== oc`);
//   `options()` answers the current options object (`{}` internally until one
//   is set; the trial wraps them in its private-state object `{_ps:{...}}`).
// - The hierarchy is read from the `textIndent` style of the cells in
//   `options.columnIndex` (viewport). A row's group is the run of following
//   rows whose indent is deeper, ending at the first row with an indent less
//   than or equal to the row's own.
// - Check status (`getCheckStatus`/`setCheckStatus`) answers `null` (all rows)
//   until an options object with `showCheckBox` has appeared; after that the
//   flags persist across option replacements. Setting a row cascades the same
//   status to its whole group; unchecking additionally unchecks every ancestor
//   up the indent chain. One `OutlineColumnCheckStatusChanged` event per call
//   with `{sheet, sheetName, row, col, status}`.
// - Collapsed flags: `setCollapsed(row, true)` marks the row and continues
//   down the first-child chain while each child is itself a group start (its
//   next row is deeper); a child without children is not marked. Visibility
//   hides exactly the row's group descendants; `false` expands. Collapsed
//   state is not serialized. Without a `columnIndex` the setters are no-ops.
// - `sheet.toJSON().outlineColumnOptions` serializes the options fields (in
//   the given order) plus `data: {row: {checked: true}}` for checked rows.
// - `refresh()` answers nothing and keeps all state; the visual checkbox /
//   image / indicator painting is panel-style UI left to the designer module.
import { Events } from '../events.js';
import type { Worksheet } from '../worksheet.js';

export interface IOutlineColumnOptions {
  columnIndex?: number;
  showImage?: boolean;
  images?: string[];
  showCheckBox?: boolean;
  showIndicator?: boolean;
  expandIndicator?: string;
  collapseIndicator?: string;
  maxLevel?: number;
}

interface StoredOutlineJSON {
  data?: Record<string, { checked?: boolean }>;
  [option: string]: unknown;
}

export class OutlineColumn {
  private _options: IOutlineColumnOptions = {};
  private _checked: boolean[] | null = null;
  private _collapsed: boolean[] = [];
  private _loaded = false;

  constructor(private sheet: Worksheet) {}

  options(): IOutlineColumnOptions;
  options(outlineColumnOptions: IOutlineColumnOptions): this;
  options(outlineColumnOptions?: IOutlineColumnOptions): IOutlineColumnOptions | this {
    this._ensureLoaded();
    if (outlineColumnOptions === undefined) return { ...this._options };
    this._options = { ...outlineColumnOptions };
    if (outlineColumnOptions.showCheckBox && this._checked === null)
      this._checked = this._resize([], this.sheet.getRowCount(), false);
    this._syncJSON(false);
    return this;
  }

  getCheckStatus(row?: number): unknown {
    this._ensureLoaded();
    const count = this.sheet.getRowCount();
    if (this._checked === null) return row === undefined ? new Array(count).fill(null) : null;
    this._resize(this._checked, count, false);
    return row === undefined ? [...this._checked] : (this._checked[row] ?? false);
  }

  getCollapsed(row?: number): unknown {
    this._ensureLoaded();
    const count = this.sheet.getRowCount();
    this._resize(this._collapsed, count, false);
    return row === undefined ? [...this._collapsed] : (this._collapsed[row] ?? false);
  }

  setCheckStatus(row: number, checkStatus: boolean): void {
    this._ensureLoaded();
    if (!this._enabled() || this._checked === null) return;
    const status = Boolean(checkStatus);
    this._resize(this._checked, this.sheet.getRowCount(), false);
    this._checked[row] = status;
    for (const child of this._group(row)) this._checked[child] = status;
    if (!status) {
      let current = row;
      for (;;) {
        const parent = this._parent(current);
        if (parent === undefined) break;
        this._checked[parent] = false;
        current = parent;
      }
    }
    this._syncJSON(true);
    this.sheet._emit(Events.OutlineColumnCheckStatusChanged, {
      sheet: this.sheet,
      sheetName: this.sheet.name(),
      row,
      col: this._options.columnIndex,
      status,
    });
  }

  setCollapsed(row: number, collapsed: boolean): void {
    this._ensureLoaded();
    if (!this._enabled()) return;
    this._resize(this._collapsed, this.sheet.getRowCount(), false);
    this._collapsed[row] = Boolean(collapsed);
    if (collapsed) {
      let current = row;
      for (;;) {
        const child = current + 1;
        if (child >= this.sheet.getRowCount() || this._indent(child) <= this._indent(current)) break;
        const grandChild = child + 1;
        if (grandChild >= this.sheet.getRowCount() || this._indent(grandChild) <= this._indent(child)) break;
        this._collapsed[child] = true;
        current = child;
      }
    }
    this._applyVisibility();
  }

  refresh(): void {
    this._ensureLoaded();
    this._applyVisibility();
    this.sheet.invalidateLayout();
    return undefined;
  }

  // --- internals ---------------------------------------------------------------
  private _enabled(): boolean {
    return typeof this._options.columnIndex === 'number' && !Number.isNaN(this._options.columnIndex);
  }

  private _indent(row: number): number {
    const column = Number(this._options.columnIndex ?? 0);
    const indent = this.sheet.getRange(row, column, 1, 1).textIndent();
    return typeof indent === 'number' ? indent : 0;
  }

  /** The group rows of `row`: following deeper-indented rows up to (not incl.) the first row with an indent ≤ the row's. */
  private _group(row: number): number[] {
    const base = this._indent(row);
    const count = this.sheet.getRowCount();
    const result: number[] = [];
    for (let r = row + 1; r < count && this._indent(r) > base; r++) result.push(r);
    return result;
  }

  private _parent(row: number): number | undefined {
    const base = this._indent(row);
    for (let r = row - 1; r >= 0; r--) if (this._indent(r) < base) return r;
    return undefined;
  }

  /** Rows hidden by the current collapsed flags (group descendants union). */
  private _hiddenRows(): Set<number> {
    const hidden = new Set<number>();
    const count = this.sheet.getRowCount();
    for (let r = 0; r < count; r++) {
      if (!this._collapsed[r]) continue;
      for (const child of this._group(r)) hidden.add(child);
    }
    return hidden;
  }

  private _applyVisibility(): void {
    const hidden = this._hiddenRows();
    const count = this.sheet.getRowCount();
    for (let r = 0; r < count; r++) {
      const visible = !hidden.has(r);
      if (this.sheet.getRowVisible(r) !== visible) this.sheet.setRowVisible(r, visible);
    }
  }

  private _resize(array: boolean[], count: number, fill: boolean): boolean[] {
    while (array.length < count) array.push(fill);
    return array;
  }

  private _syncJSON(withData: boolean): void {
    if (!Object.keys(this._options).length) return;
    const result: StoredOutlineJSON = { ...this._options };
    if (withData && this._checked) {
      let data: Record<string, { checked: boolean }> | undefined;
      for (let row = 0; row < this._checked.length; row++) {
        if (!this._checked[row]) continue;
        (data ??= {})[String(row)] = { checked: true };
      }
      if (data) result.data = data;
    }
    this.sheet.extraJSON.outlineColumnOptions = result;
  }

  private _ensureLoaded(): void {
    if (this._loaded) return;
    this._loaded = true;
    const stored = this.sheet.extraJSON.outlineColumnOptions as StoredOutlineJSON | undefined;
    if (!stored || typeof stored !== 'object') return;
    const { data, ...rest } = stored;
    this._options = rest;
    if (data && typeof data === 'object') {
      const rows = Object.keys(data).map(Number);
      const maxRow = Math.max(this.sheet.getRowCount() - 1, ...rows, 0);
      this._checked = this._resize(new Array(maxRow + 1).fill(false), maxRow + 1, false);
      for (const row of rows) if (data[String(row)]?.checked) this._checked[row] = true;
    } else if (this._options.showCheckBox) {
      this._checked = this._resize([], this.sheet.getRowCount(), false);
    }
  }
}
