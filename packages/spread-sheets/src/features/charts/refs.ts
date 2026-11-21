/**
 * A1 reference helpers for chart series bindings: normalisation to the trial's
 * `Sheet1!$A$1:$C$4` form, comma-joined multi-area ranges and the structural
 * shift/split the trial applies to the data range on row/column operations.
 */

export interface Rect { row: number; col: number; rowCount: number; colCount: number }

const SEGMENT = /([a-z]{1,3})\$?(\d+)?/gi;

function columnFromLetters(letters: string): number {
  let value = 0;
  for (const char of letters.toLowerCase()) value = value * 26 + char.charCodeAt(0) - 96;
  return value - 1;
}

export function lettersFromColumn(index: number): string {
  let value = index + 1, out = '';
  while (value > 0) { const mod = (value - 1) % 26; out = String.fromCharCode(65 + mod) + out; value = Math.floor((value - 1) / 26); }
  return out;
}

export function cellAddress(row: number, col: number, absolute = true): string {
  const letters = lettersFromColumn(col), digits = String(row + 1);
  return absolute ? `$${letters}$${digits}` : `${letters}${digits}`;
}

export function rectToString(rect: Rect, sheetName: string): string {
  const start = cellAddress(rect.row, rect.col);
  if (rect.rowCount === 1 && rect.colCount === 1) return `${sheetName}!${start}`;
  return `${sheetName}!${start}:${cellAddress(rect.row + rect.rowCount - 1, rect.col + rect.colCount - 1)}`;
}

function parseSegment(text: string): Rect | null {
  const withoutSheet = text.replace(/^('[^']*'|[a-z0-9_.$]+)!\s*/i, '');
  const found = [...withoutSheet.matchAll(SEGMENT)];
  if (!found.length) return null;
  const read = (match: RegExpExecArray): { row: number; col: number } => ({
    col: columnFromLetters(match[1]),
    row: match[2] ? Number(match[2]) - 1 : 0,
  });
  const a = read(found[0] as RegExpExecArray);
  const b = found[1] ? read(found[1] as RegExpExecArray) : a;
  const row = Math.min(a.row, b.row), col = Math.min(a.col, b.col);
  return { row, col, rowCount: Math.abs(b.row - a.row) + 1, colCount: Math.abs(b.col - a.col) + 1 };
}

/** Parse `Sheet1!$A$1:$C$4` or comma separated multi-area strings into rectangles. */
export function parseRanges(formula: unknown): Rect[] {
  return String(formula ?? '').split(',').map(parseSegment).filter((rect): rect is Rect => !!rect);
}

