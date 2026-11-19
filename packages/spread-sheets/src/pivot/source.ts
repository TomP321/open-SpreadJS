/**
 * Pivot data sources (TASK 41 item 1).
 * A `PivotSource` is a string (a table name or a `Sheet!A1:D10` range, the
 * table form also written as `=tableName`) or a `{ source, autoRefresh }`
 * descriptor. The first row of the resolved range carries the field headers.
 */
import type { Worksheet, WorkbookHost } from '../worksheet.js';
import { PivotSource } from './types.js';

export interface ResolvedSource {
  /** Normalised reference string, as `getSource()` reports it. */
  ref: string;
  fields: string[];
  rows: unknown[][];
  autoRefresh: boolean;
  /** The worksheet holding the source range, when it is a cell range. */
  sourceSheet?: Worksheet;
  /** Range of the source (header row included), when resolved from cells. */
  range?: { row: number; col: number; rowCount: number; colCount: number };
}

export interface PivotSheetLike {
  name(): string;
  getValue(row: number, col: number): unknown;
  parent?: WorkbookHost;
}

/** Parse `Sheet1!A1:D10` (sheet part optional). */
export function parseRangeRef(ref: string): { sheet: string | null; row: number; col: number; rowCount: number; colCount: number } | null {
  const m = /^(?:([^!]+)!)?\$?([A-Za-z]{1,3})\$?(\d+)(?::\$?([A-Za-z]{1,3})\$?(\d+))?$/.exec(ref.trim());
  if (!m) return null;
  const col = lettersToIndex(m[2]!);
  const row = Number(m[3]) - 1;
  const col2 = m[4] ? lettersToIndex(m[4]) : col;
  const row2 = m[5] ? Number(m[5]) - 1 : row;
  return { sheet: m[1] ?? null, row: Math.min(row, row2), col: Math.min(col, col2), rowCount: Math.abs(row2 - row) + 1, colCount: Math.abs(col2 - col) + 1 };
}

export function indexToLetters(index: number): string {
  let out = '';
  let n = index;
  for (;;) {
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26) - 1;
    if (n < 0) break;
  }
  return out;
}

function lettersToIndex(letters: string): number {
  let n = 0;
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}
export { lettersToIndex };

/** Resolve the source string against the pivot sheet's workbook. */
export function resolveSource(sheet: Worksheet, source: PivotSource | undefined): ResolvedSource {
  const descriptor = typeof source === 'string' ? { source } : source ?? { source: '' };
  const ref = String(descriptor.source ?? '');
  const autoRefresh = descriptor.autoRefresh ?? false;
  const trimmed = ref.replace(/^=/, '');
  const host = sheet.parent as unknown as WorkbookHost | undefined;

  // 1. bound table name (any sheet of the workbook)
  if (host && (ref.startsWith('=') || !ref.includes('!'))) {
    for (const candidate of host.sheets) {
      if (!candidate || typeof candidate.tables?.findByName !== 'function') continue;
      const table = candidate.tables.findByName(trimmed);
      if (table) {
        const range = table.range();
        const read = readRange(candidate, range.row, range.col, range.rowCount, range.colCount);
        return { ref: '=' + trimmed, ...read, autoRefresh, sourceSheet: candidate, range: { ...range } };
      }
    }
  }

  // 2. Sheet!A1:D10 / A1:D10 (current sheet); the `=` prefix (trial form
  // "=Data!$A$1:$F$5") is accepted for ranges too and normalised away.
  const parsed = parseRangeRef(trimmed);
  if (parsed) {
    const target = parsed.sheet
      ? (host?.getSheetFromName?.(unquoteSheetName(parsed.sheet)) as Worksheet | undefined) ?? sheet
      : sheet;
    const sheetName = target.name();
    const read = readRange(target, parsed.row, parsed.col, parsed.rowCount, parsed.colCount);
    return {
      ref: `${sheetName}!${indexToLetters(parsed.col)}${parsed.row + 1}:${indexToLetters(parsed.col + parsed.colCount - 1)}${parsed.row + parsed.rowCount}`,
      ...read, autoRefresh, sourceSheet: target, range: { row: parsed.row, col: parsed.col, rowCount: parsed.rowCount, colCount: parsed.colCount },
    };
  }
  throw new Error(`Invalid pivot source: ${ref}`);
}

function unquoteSheetName(name: string): string {
  const t = name.trim();
  return t.startsWith("'") && t.endsWith("'") ? t.slice(1, -1) : t;
}

function readRange(sheet: Worksheet, row: number, col: number, rowCount: number, colCount: number) {
  const grid: unknown[][] = [];
  for (let r = 0; r < rowCount; r++) {
    const line: unknown[] = [];
    for (let c = 0; c < colCount; c++) line.push(sheet.getValue(row + r, col + c));
    grid.push(line);
  }
  const header = (grid.shift() ?? []).map((cell, i) => cell == null || cell === '' ? `Column${i + 1}` : String(cell));
  return { fields: header, rows: grid };
}
