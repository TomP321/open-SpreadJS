/**
 * External workbook references (`=[Book1.xlsx]Sheet1!A1:B2`).
 *
 * The trial remembers every workbook a formula points at, keeps the values it
 * was handed through `Workbook.updateExternalReference`, answers `#REF!` while
 * no values are loaded, and writes the pair (reference plus values) into the
 * workbook JSON under the key `externalReference`. This module owns that
 * record; every shape below is what the official 19.2.5 trial shows for the
 * same public calls (task 38 item 4, probe `.probe/report-item4*.json`).
 */

/** Cell block of loaded values: row index to column index to value. */
export type ExternalSheetValues = Map<number, Map<number, unknown>>;

export interface ExternalReferenceItem {
  target: { row: number; col: number; sheetName: string };
  source: { row: number; col: number; rowCount: number; colCount: number; sheetName: string };
}

export interface ExternalReferenceEntry {
  /** Workbook name inside the brackets (`Book1.xlsx`). */
  name: string;
  /** Path prefix of the bracketed reference; empty for the bare form. */
  path: string;
  /** Sheet names of this workbook that formulas address, in first-seen order. */
  sheetNames: string[];
  /** Sheets whose values were loaded. A sheet is absent until values arrive. */
  values: Map<string, ExternalSheetValues>;
  /** Where each external range is read from. */
  items: ExternalReferenceItem[];
}

/** `Sheet1` inside `[Book1.xlsx]Sheet1!A1` may also be written quoted. */
export function unquoteSheetName(name: string): string {
  const trimmed = name.trim();
  if (/^'.*'$/.test(trimmed)) return trimmed.slice(1, -1).replace(/''/g, "'");
  return trimmed;
}

/**
 * Splits a bracketed reference into workbook name and path. Excel writes the
 * path form as `[C:\files\[Book1.xlsx]]`; the bare form has an empty path.
 */
export function splitExternalReference(bracketed: string): { name: string; path: string } {
  const text = bracketed.replace(/^\[/, '').replace(/\]$/, '');
  const nested = /\[([^\[\]]*)\]\s*$/.exec(text);
  if (nested) return { name: nested[1]!, path: text.slice(0, nested.index) };
  const separator = Math.max(text.lastIndexOf('\\'), text.lastIndexOf('/'));
  if (separator >= 0) return { name: text.slice(separator + 1), path: text.slice(0, separator + 1) };
  return { name: text, path: '' };
}

/**
 * `true` when bracketed text names a workbook file rather than a table column.
 *
 * Structured paths are never workbook files: `[@[obj].[a.b]]` ends with a
 * bracketed column name that happens to contain a dot, so only a leading path
 * (`[C:\files\...]`) or a bare file name with no `@`/`#`/bracket in front of the
 * extension counts.
 */
export function looksExternal(bracketed: string): boolean {
  const text = bracketed.replace(/^\[/, '').replace(/\]$/, '');
  if (!text) return false;
  if (text.includes('#') || text.includes('@')) return false;
  if (text.includes('\\') || text.includes('/')) return true;
  const nested = /\[([^\[\]]*)\]$/.exec(text);
  if (nested) {
    // Excel writes the path form as `[C:\dir\[Book1.xlsx]]`: the part in front of
    // the nested bracket is a directory path, and a structured column is not.
    const prefix = text.slice(0, nested.index);
    return !prefix.includes('[') && prefix.length > 0 && (prefix.includes('\\') || prefix.includes('/'));
  }
  return /^[^\[\]#@]*\.[A-Za-z0-9]{2,4}$/.test(text);
}

/** The references of one workbook, in first-seen order. */
export class ExternalReferenceStore {
  private readonly list: ExternalReferenceEntry[] = [];
  private readonly index = new Map<string, ExternalReferenceEntry>();

  /** Every recorded reference, oldest first. */
  entries(): readonly ExternalReferenceEntry[] {
    return this.list;
  }

  find(name: string): ExternalReferenceEntry | undefined {
    return this.index.get(name.toLowerCase());
  }

  /** Records the workbook itself, without any values. */
  register(name: string, path = ''): ExternalReferenceEntry {
    const existing = this.find(name);
    if (existing) {
      if (path && !existing.path) existing.path = path;
      return existing;
    }
    const entry: ExternalReferenceEntry = { name, path, sheetNames: [], values: new Map(), items: [] };
    this.list.push(entry);
    this.index.set(name.toLowerCase(), entry);
    return entry;
  }

  /** Records one read of an external range by a formula cell. */
  registerItem(name: string, path: string, sheetName: string, item: ExternalReferenceItem): ExternalReferenceEntry {
    const entry = this.register(name, path);
    if (sheetName && !entry.sheetNames.includes(sheetName)) entry.sheetNames.push(sheetName);
    const known = entry.items.some(
      (other) =>
        other.target.row === item.target.row &&
        other.target.col === item.target.col &&
        other.target.sheetName === item.target.sheetName &&
        other.source.row === item.source.row &&
        other.source.col === item.source.col &&
        other.source.rowCount === item.source.rowCount &&
        other.source.colCount === item.source.colCount &&
        other.source.sheetName === item.source.sheetName,
    );
    if (!known) entry.items.push(item);
    return entry;
  }

  /** Loaded values of one external sheet, or `undefined` when never loaded. */
  sheetValues(name: string, sheetName: string): ExternalSheetValues | undefined {
    return this.find(name)?.values.get(sheetName);
  }

  /**
   * Applies an `updateExternalReference` payload. A sheet payload is either a
   * rectangular array of values or a sparse `{ row: { column: value } }` map;
   * without `merge` the sheet's values are replaced by the payload, with `merge`
   * the cells the payload does not mention are kept.
   *
   * The trial only updates a workbook it already knows about, and only when the
   * path it was given matches the path the reference was written with - an
   * update for an unknown name or a different path changes nothing.
   */
  update(name: string, payload: unknown, filePath: string | null | undefined, merge: boolean): boolean {
    const entry = this.find(name);
    if (!entry) return false;
    if (filePath && filePath !== entry.path) return false;
    if (filePath) entry.path = filePath;
    if (!payload || typeof payload !== 'object') return false;
    const record = payload as Record<string, unknown>;
    // A workbook JSON payload is not a value block; the trial loads values from
    // the file itself, which needs a file system this build does not have.
    if (Array.isArray(record.sheets)) return false;
    for (const [sheetName, value] of Object.entries(record)) {
      const rows: ExternalSheetValues = merge ? (entry.values.get(sheetName) ?? new Map()) : new Map();
      if (Array.isArray(value)) {
        value.forEach((row, rowIndex) => {
          if (!Array.isArray(row)) return;
          const cells = merge ? (rows.get(rowIndex) ?? new Map()) : new Map<number, unknown>();
          row.forEach((cell, colIndex) => {
            if (cell === undefined) return;
            cells.set(colIndex, cell);
          });
          if (cells.size) rows.set(rowIndex, cells);
        });
      } else if (value && typeof value === 'object') {
        for (const [rowKey, rowValue] of Object.entries(value as Record<string, unknown>)) {
          const rowIndex = Number(rowKey);
          if (!Number.isFinite(rowIndex) || !rowValue || typeof rowValue !== 'object') continue;
          const cells = merge ? (rows.get(rowIndex) ?? new Map()) : new Map<number, unknown>();
          for (const [colKey, cell] of Object.entries(rowValue as Record<string, unknown>)) {
            const colIndex = Number(colKey);
            if (!Number.isFinite(colIndex) || cell === undefined) continue;
            cells.set(colIndex, cell);
          }
          if (cells.size) rows.set(rowIndex, cells);
        }
      } else continue;
      entry.values.set(sheetName, rows);
      if (!entry.sheetNames.includes(sheetName)) entry.sheetNames.push(sheetName);
    }
    return true;
  }

  /** Drops every recorded reference and value (workbook reset). */
  clear(): void {
    this.list.length = 0;
    this.index.clear();
  }

  /** The workbook JSON record, or nothing when no reference was recorded. */
  toJSON(): Record<string, unknown> | undefined {
    if (!this.list.length) return undefined;
    const out: Record<string, unknown> = {};
    this.list.forEach((entry, position) => {
      const sheets = [...new Set([...entry.sheetNames, ...entry.values.keys()])];
      const data: Record<string, unknown> = {};
      for (const sheetName of sheets) {
        const rows = entry.values.get(sheetName);
        if (!rows || !rows.size) {
          data[sheetName] = { isNew: true };
          continue;
        }
        const record: Record<string, unknown> = {};
        for (const [row, cells] of [...rows].sort((a, b) => a[0] - b[0])) {
          const line: Record<string, unknown> = {};
          for (const [col, value] of [...cells].sort((a, b) => a[0] - b[0])) line[String(col)] = value;
          record[String(row)] = line;
        }
        data[sheetName] = record;
      }
      out[String(position + 1)] = {
        option: { name: entry.name, path: entry.path },
        sheetNames: sheets,
        data,
      };
    });
    return out;
  }

  /** Restores references and values from a workbook JSON record. */
  fromJSON(record: unknown): void {
    if (!record || typeof record !== 'object') return;
    const keys = Object.keys(record as Record<string, unknown>)
      .filter((key) => /^\d+$/.test(key))
      .sort((a, b) => Number(a) - Number(b));
    for (const key of keys) {
      const item = (record as Record<string, Record<string, unknown>>)[key];
      if (!item || typeof item !== 'object') continue;
      const option = (item.option ?? {}) as Record<string, unknown>;
      const name = typeof option.name === 'string' ? option.name : '';
      if (!name) continue;
      const entry = this.register(name, typeof option.path === 'string' ? option.path : '');
      for (const sheetName of Array.isArray(item.sheetNames) ? (item.sheetNames as string[]) : [])
        if (!entry.sheetNames.includes(sheetName)) entry.sheetNames.push(sheetName);
      const data = item.data;
      if (!data || typeof data !== 'object') continue;
      for (const [sheetName, value] of Object.entries(data as Record<string, unknown>)) {
        if (!sheetName || !value || typeof value !== 'object') continue;
        if (!entry.sheetNames.includes(sheetName)) entry.sheetNames.push(sheetName);
        const rows: ExternalSheetValues = new Map();
        for (const [rowKey, rowValue] of Object.entries(value as Record<string, unknown>)) {
          const rowIndex = Number(rowKey);
          if (!Number.isFinite(rowIndex) || !rowValue || typeof rowValue !== 'object') continue;
          const cells = new Map<number, unknown>();
          for (const [colKey, cell] of Object.entries(rowValue as Record<string, unknown>)) {
            const colIndex = Number(colKey);
            if (!Number.isFinite(colIndex)) continue;
            cells.set(colIndex, cell);
          }
          if (cells.size) rows.set(rowIndex, cells);
        }
        if (rows.size) entry.values.set(sheetName, rows);
      }
    }
  }
}
