// Data ranges (`GC.Spread.Sheets.DataRange.DataRangeManager` / `DataRange`).
//
// Trial semantics (probes f40sc2..f40sc5, f40dr1b, f40dr3, .probe/report-item5{c-g}.json):
// - `sheet.dataRanges` is a manager keyed by the name given to `add()`.
//   `DataRange.name('new')` renames the handle's display name only — `get()`
//   and `remove()` still take the original key, `all()` reports the new name.
// - Values: every read of a cell inside the range answers the provider's
//   `getValue(relativeRow, relativeColumn)` (coordinates relative to the range
//   origin); a `undefined` provider answer falls through to the sheet model.
//   A direct `sheet.setValue` inside the range is dropped: the model keeps its
//   value and the provider `setValue` hook is not reached (f40dr1b recorded no
//   `s` calls and the cell still reads back the provider value).
// - `range()` answers a `GC.Spread.Sheets.Range` instance; the setter accepts
//   a `Range` or a plain `{row,col,rowCount,colCount}` object and answers
//   nothing. `name(value)` answers the new name string; `repaint()` re-reads
//   the provider and answers nothing.
// - `options` is an own property normalized to `{ sticky: { top: 0 } }`.
// - `sheet.toJSON().dataRanges` serializes `[{name, range, dataProvider:
//   provider.toJSON(), options}]` (the trial crashes when the provider has no
//   `toJSON` — we serialize what the provider gives and stay loadable).
import { Range } from '../primitives.js';
import { notImplemented } from '../not-implemented.js';
import type { Worksheet } from '../worksheet.js';

export interface IDataProvider {
  host?: DataRange;
  getValue?: (row: number, col: number) => unknown;
  setValue?: (row: number, col: number, value: unknown, changes: unknown[]) => boolean;
  getStyle?: (row: number, col: number) => unknown;
  getSpans?: (row: number, col: number, rowCount: number, colCount: number) => Range[];
  onRowChange?: (row: number, rowCount: number, changeType: 'add' | 'delete', changes: unknown[]) => void;
  onColumnChange?: (col: number, colCount: number, changeType: 'add' | 'delete', changes: unknown[]) => void;
  onCopy?: (name: string) => { name: string, dataProvider: IDataProvider } | boolean;
  onClear?: (row: number, col: number, rowCount: number, colCount: number, changes: unknown[]) => boolean;
  onDestroy?: () => void;
  undo?: (change: unknown) => void;
  // The trial accepts provider JSON without `typeName` (probe
  // f40dr3-manager-json: our `{ kind: 'probe' }` round-tripped verbatim), so
  // the member is optional in our declaration.
  toJSON?: () => { typeName?: string, [prop: string]: unknown };
  fromJSON?: (options: { typeName: string, [prop: string]: unknown }) => void;
  [prop: string]: unknown;
}

export interface IDataRangeOptions {
  sticky: {
    top: number;
  };
}

interface DataRangeRecord {
  name: string;
  range: { row: number, col: number, rowCount: number, colCount: number };
  dataProvider?: unknown;
  options: IDataRangeOptions;
}

export class DataRange {
  /** Trial exposes the provider and the normalized options as own properties. */
  dataProvider: IDataProvider;
  options: IDataRangeOptions;

  constructor(
    name: string,
    dataProvider: IDataProvider,
    range: Range | { row: number, col: number, rowCount: number, colCount: number },
    options: Partial<IDataRangeOptions> = {},
  ) {
    this._displayName = String(name);
    this.dataProvider = dataProvider;
    this.options = {
      sticky: { top: Number(options.sticky?.top ?? 0) || 0, ...(options.sticky ?? {}) },
    };
    const box = range as { row?: number, col?: number, rowCount?: number, colCount?: number };
    this._box = {
      row: Number(box.row ?? 0),
      col: Number(box.col ?? 0),
      rowCount: Number(box.rowCount ?? 0),
      colCount: Number(box.colCount ?? 0),
    };
    (this.dataProvider as { host?: DataRange }).host = this;
  }

  private _displayName: string;
  private _box: { row: number, col: number, rowCount: number, colCount: number };
  /** Provider values read so far, keyed by `row:col` absolute coordinates. */
  private _shadow = new Map<string, unknown>();

  name(): string;
  name(name: string): string;
  name(name?: string): string {
    if (name !== undefined) this._displayName = String(name);
    return this._displayName;
  }

  range(): Range;
  range(range: Range | { row: number, col: number, rowCount: number, colCount: number }): void;
  range(range?: Range | { row: number, col: number, rowCount: number, colCount: number }): Range | void {
    if (range === undefined) return new Range(this._box.row, this._box.col, this._box.rowCount, this._box.colCount);
    const box = range as { row?: number, col?: number, rowCount?: number, colCount?: number };
    this._box = {
      row: Number(box.row ?? 0),
      col: Number(box.col ?? 0),
      rowCount: Number(box.rowCount ?? 0),
      colCount: Number(box.colCount ?? 0),
    };
    this.refresh();
    return undefined;
  }

  repaint(): void {
    this.refresh();
    return undefined;
  }

  /** Absolute coordinates covered by the range. */
  _covers(row: number, col: number): boolean {
    return row >= this._box.row && row < this._box.row + this._box.rowCount
      && col >= this._box.col && col < this._box.col + this._box.colCount;
  }

  /** Provider shadow value for a cell inside the range (lazy, per cell). */
  _valueAt(row: number, col: number): { found: boolean, value?: unknown } {
    if (!this._covers(row, col)) return { found: false };
    const key = `${row}:${col}`;
    if (this._shadow.has(key)) return { found: true, value: this._shadow.get(key) };
    const getValue = this.dataProvider?.getValue;
    if (typeof getValue !== 'function') return { found: false };
    // After an invalidation the trial re-asks the provider on the next read
    // (f40dr1b recorded two extra `g1/1` calls after the blocked write).
    const value = getValue(row - this._box.row, col - this._box.col);
    if (value === undefined) return { found: false };
    this._shadow.set(key, value);
    return { found: true, value };
  }

  /** Re-reads every provider cell of the range into the shadow layer. */
  private refresh(): void {
    this._shadow.clear();
    const getValue = this.dataProvider?.getValue;
    if (typeof getValue !== 'function') return;
    for (let r = 0; r < this._box.rowCount; r++) {
      for (let c = 0; c < this._box.colCount; c++) {
        const value = getValue(r, c);
        if (value !== undefined) this._shadow.set(`${this._box.row + r}:${this._box.col + c}`, value);
      }
    }
  }

  _dropShadow(row: number, col: number): void {
    this._shadow.delete(`${row}:${col}`);
  }

  _toRecord(): DataRangeRecord {
    const toJSON = (this.dataProvider as { toJSON?: unknown } | undefined)?.toJSON;
    return {
      name: this._displayName,
      range: { ...this._box },
      ...(typeof toJSON === 'function' ? { dataProvider: (this.dataProvider as IDataProvider).toJSON!() } : {}),
      options: this.options,
    };
  }
}

export class DataRangeManager {
  private ranges = new Map<string, DataRange>();
  private loaded = false;

  constructor(private sheet: Worksheet) {}

  add(
    name: string,
    dataProvider: IDataProvider | string,
    range: Range | { row: number, col: number, rowCount: number, colCount: number },
    options?: Partial<IDataRangeOptions>,
  ): DataRange {
    this._ensureLoaded();
    if (typeof dataProvider === 'string')
      notImplemented('DataRange.DataRangeManager.add(string dataProvider)');
    const key = String(name);
    const created = new DataRange(key, dataProvider, range, options);
    this.ranges.set(key, created); // duplicate names replace (trial keeps one entry)
    created.repaint();
    this._syncJSON();
    return created;
  }

  all(): DataRange[] {
    this._ensureLoaded();
    return [...this.ranges.values()];
  }

  get(name: string): DataRange | undefined {
    this._ensureLoaded();
    return this.ranges.get(String(name));
  }

  remove(name: string): void {
    this._ensureLoaded();
    const range = this.ranges.get(String(name));
    if (!range) return; // trial: unknown names are a silent no-op
    (range.dataProvider as { onDestroy?: () => void } | undefined)?.onDestroy?.();
    this.ranges.delete(String(name));
    this._syncJSON();
  }

  clear(): void {
    this._ensureLoaded();
    for (const range of this.ranges.values())
      (range.dataProvider as { onDestroy?: () => void } | undefined)?.onDestroy?.();
    this.ranges.clear();
    this._syncJSON();
  }

  toJSON(): DataRangeRecord[] {
    this._ensureLoaded();
    return [...this.ranges.values()].map((range) => range._toRecord());
  }

  fromJSON(json: unknown): void {
    this.ranges.clear();
    if (!Array.isArray(json)) return;
    for (const raw of json) {
      const record = raw as DataRangeRecord;
      if (!record || typeof record.name !== 'string') continue;
      const provider = (record.dataProvider ?? {}) as IDataProvider;
      const created = new DataRange(record.name, provider, record.range ?? { row: 0, col: 0, rowCount: 0, colCount: 0 }, record.options);
      (provider as { fromJSON?: (options: { typeName: string, [prop: string]: unknown }) => void }).fromJSON?.(
        (record.dataProvider ?? { typeName: '' }) as { typeName: string, [prop: string]: unknown },
      );
      this.ranges.set(record.name, created);
    }
    this.loaded = true;
    this.sheet._dataRangesActive = this.ranges.size > 0;
  }

  // --- sheet wiring -------------------------------------------------------------
  /** Value layer: a covered cell answers its provider shadow value. */
  _valueAt(row: number, col: number): { found: boolean, value?: unknown } {
    if (!this.loaded && !this.ranges.size && !this.sheet.extraJSON.dataRanges) return { found: false };
    this._ensureLoaded();
    for (const range of this.ranges.values()) {
      const hit = range._valueAt(row, col);
      if (hit.found) return hit;
    }
    return { found: false };
  }

  /** A direct model write inside a data range is dropped by the trial. */
  _blocksWrite(row: number, col: number): boolean {
    if (!this.ranges.size) return false;
    for (const range of this.ranges.values()) if (range._covers(row, col)) return true;
    return false;
  }

  /** Blocked writes invalidate the shadow so the next read re-asks the provider. */
  _invalidate(row: number, col: number): void {
    for (const range of this.ranges.values())
      if (range._covers(row, col)) range._dropShadow(row, col);
  }

  private _syncJSON(): void {
    this.sheet._dataRangesActive = this.ranges.size > 0;
    if (this.ranges.size) this.sheet.extraJSON.dataRanges = this.toJSON();
    else delete this.sheet.extraJSON.dataRanges;
  }

  private _ensureLoaded(): void {
    if (this.loaded) return;
    this.loaded = true;
    const stored = this.sheet.extraJSON.dataRanges;
    if (Array.isArray(stored)) this.fromJSON(stored);
  }
}
