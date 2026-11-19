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

/** Normalise a user range to the trial getter form (`A1:C4` -> `Sheet1!$A$1:$C$4`). */
export function normalizeRanges(formula: unknown, sheetName: string): string {
  const rects = parseRanges(formula);
  return rects.length ? rects.map((rect) => rectToString(rect, sheetName)).join(',') : String(formula ?? '');
}

function shiftOne(rect: Rect, axis: 'row' | 'col', index: number, amount: number, remove: boolean): Rect | null {
  const position = axis === 'row' ? rect.row : rect.col;
  const size = axis === 'row' ? rect.rowCount : rect.colCount;
  const end = position + size;
  if (remove) {
    const overlap = Math.max(0, Math.min(end, index + amount) - Math.max(position, index));
    const nextSize = size - overlap;
    if (nextSize <= 0) return null;
    const nextStart = position >= index + amount ? position - amount : position >= index ? index : position;
    return axis === 'row' ? { ...rect, row: nextStart, rowCount: nextSize } : { ...rect, col: nextStart, colCount: nextSize };
  }
  if (index <= position) return axis === 'row' ? { ...rect, row: position + amount } : { ...rect, col: position + amount };
  if (index < end) return axis === 'row' ? { ...rect, rowCount: size + amount } : { ...rect, colCount: size + amount };
  return { ...rect };
}

/**
 * Shift one rectangle like the trial shifts a series reference: insertions at
 * the start or outside shift/expand the whole rect; the rect never splits.
 */
export function shiftRefFormula(formula: string, axis: 'row' | 'col', index: number, amount: number, remove: boolean): string {
  const rects = parseRanges(formula);
  if (!rects.length) return formula;
  const sheet = String(formula).match(/^('[^']*'|[a-z0-9_.$]+)!\s*/i)?.[0]?.replace(/!\s*$/, '') ?? 'Sheet1';
  const next = rects.map((rect) => shiftOne(rect, axis, index, amount, remove)).filter((r): r is Rect => !!r);
  return next.length ? next.map((rect) => rectToString(rect, sheet)).join(',') : '';
}

/**
 * Shift a chart data range like the trial: an insertion strictly inside an
 * area splits it into two comma-joined areas (the inserted band stays out).
 */
export function shiftRangeFormula(formula: unknown, sheetName: string, axis: 'row' | 'col', index: number, amount: number, remove: boolean): string {
  const rects = parseRanges(formula);
  if (!rects.length) return String(formula ?? '');
  const out: Rect[] = [];
  for (const rect of rects) {
    const position = axis === 'row' ? rect.row : rect.col;
    const size = axis === 'row' ? rect.rowCount : rect.colCount;
    const end = position + size;
    if (!remove && index > position && index < end) {
      const firstSize = index - position, secondSize = end - index;
      const first = axis === 'row' ? { ...rect, rowCount: firstSize } : { ...rect, colCount: firstSize };
      const second = axis === 'row'
        ? { ...rect, row: index + amount, rowCount: secondSize }
        : { ...rect, col: index + amount, colCount: secondSize };
      out.push(first, second);
      continue;
    }
    const next = shiftOne(rect, axis, index, amount, remove);
    if (next) out.push(next);
  }
  out.sort((a, b) => a.col - b.col || a.row - b.row);
  return out.map((rect) => rectToString(rect, sheetName)).join(',');
}
