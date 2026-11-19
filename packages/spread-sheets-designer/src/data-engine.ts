/* Model engine behind the Data tab dialogs. Every function here is pure model
 * work (no UI): range detection, duplicate compaction, the text-to-columns
 * parser, the subtotal transformer and the auto-outline analyzer. Behaviour
 * mirrors the trial as observed through the public API. */
import type GC from '@mescius/spread-sheets';
import type { GCRoot, Worksheet } from './core-internals.js';
import { styleWriter } from './core-internals.js';

export type Bounds = { row: number; col: number; rowCount: number; colCount: number };

export type SortLevel = {
  /** Region-relative column index (row index when sorting left to right); -1 = not chosen yet. */
  column: number;
  /** The trial's "Sort On" wording. */
  sortOn: 'Values' | 'Cell Color' | 'Font Color';
  /** The trial's "Order" wording: A to Z | Z to A | On Top | On Bottom. */
  order: string;
  /** Selected fill/font color for color sorts; '' = No Cell Color. */
  color: string;
};

export type SortData = {
  region: Bounds;
  hasHeaders: boolean;
  byRows: boolean;
  levels: SortLevel[];
};

export type DuplicateData = {
  region: Bounds;
  hasHeaders: boolean;
  /** Region-relative column indices that participate in the comparison. */
  columns: number[];
};

export type TextColumnFormat = {
  format: 'General' | 'Text' | 'Date' | 'Skip';
  dateType: string;
  thousandsSeparator?: string;
  decimalSeparator?: string;
};

export type TextToColumnsData = {
  mode: 'Delimited' | 'Fixed width';
  region: Bounds;
  delimiters: { tab: boolean; semicolon: boolean; comma: boolean; space: boolean; other: string };
  consecutive: boolean;
  qualifier: string;
  /** Character offsets (in the trimmed source text) where fixed-width breaks sit. */
  breaks: number[];
  /** One entry per preview column. */
  formats: TextColumnFormat[];
  destination: string;
};

export type SubtotalData = {
  region: Bounds;
  /** Region-relative index of the "At each change in" column. */
  groupColumn: number;
  /** Sum | Count | Average | Max | Min | Product. */
  fn: string;
  /** Region-relative indices that receive subtotal formulas. */
  columns: number[];
  replace: boolean;
  pageBreak: boolean;
  summaryBelow: boolean;
};

/** SUBTOTAL function numbers; the trial's "Count" is COUNTA (3). */
const SUBTOTAL_CODE: Record<string, number> = { Sum: 9, Count: 3, Average: 1, Max: 4, Min: 5, Product: 6 };

/** Function word used in the "East <word>" label; the trial writes "Total" for Sum. */
export function subtotalWord(fn: string): string {
  return !fn || fn === 'Sum' ? 'Total' : fn;
}

export function columnName(index: number): string {
  let name = '';
  let n = index + 1;
  while (n > 0) {
    const rem = (n - 1) % 26;
    name = String.fromCharCode(65 + rem) + name;
    n = Math.floor((n - rem) / 26);
  }
  return name;
}

function notEmpty(sheet: Worksheet, row: number, col: number): boolean {
  const value = sheet.getValue(row, col);
  if (value === null || value === undefined) return false;
  if (typeof value === 'string' && value.trim() === '') return false;
  return true;
}

function rowHasContent(sheet: Worksheet, row: number, col: number, colCount: number): boolean {
  for (let c = col; c < col + colCount; c++) if (notEmpty(sheet, row, c)) return true;
  return false;
}

function colHasContent(sheet: Worksheet, col: number, row: number, rowCount: number): boolean {
  for (let r = row; r < row + rowCount; r++) if (notEmpty(sheet, r, col)) return true;
  return false;
}

/**
 * Expand a rectangle over adjacent non-empty cells (the trial's CurrentRegion).
 * A column/row counts as adjacent content when any cell of the neighbouring
 * line inside the current block extent is non-empty.
 */
export function currentRegion(sheet: Worksheet, bounds: Bounds): Bounds {
  let { row, col, rowCount, colCount } = bounds;
  if (rowCount < 0) rowCount = sheet.getRowCount() - row;
  if (colCount < 0) colCount = sheet.getColumnCount() - col;
  row = Math.max(0, row); col = Math.max(0, col);
  rowCount = Math.max(1, rowCount); colCount = Math.max(1, colCount);
  const maxRow = sheet.getRowCount(), maxCol = sheet.getColumnCount();
  let grew = true;
  while (grew) {
    grew = false;
    if (row > 0 && rowHasContent(sheet, row - 1, col, colCount)) { row--; rowCount++; grew = true; continue; }
    if (row + rowCount < maxRow && rowHasContent(sheet, row + rowCount, col, colCount)) { rowCount++; grew = true; continue; }
    if (col > 0 && colHasContent(sheet, col - 1, row, rowCount)) { col--; colCount++; grew = true; continue; }
    if (col + colCount < maxCol && colHasContent(sheet, col + colCount, row, rowCount)) { colCount++; grew = true; continue; }
  }
  return { row, col, rowCount, colCount };
}

/**
 * True when every cell of the line is a non-empty string (trial header rule).
 * The line is the first row by default; pass `byColumns` for the trial's
 * "Sort left to right" orientation, where the header line is the first column.
 */
export function lineLooksLikeHeader(sheet: Worksheet, row: number, col: number, count: number, byColumns = false): boolean {
  for (let i = 0; i < count; i++) {
    const value = byColumns ? sheet.getValue(row + i, col) : sheet.getValue(row, col + i);
    if (typeof value !== 'string' || value.trim() === '') return false;
  }
  return true;
}

/** Column labels: header text when headers are on, otherwise ColumnA... */
export function columnLabels(sheet: Worksheet, region: Bounds, hasHeaders: boolean): string[] {
  return Array.from({ length: region.colCount }, (_, index) => {
    const name = hasHeaders ? String(sheet.getValue(region.row, region.col + index) ?? '').trim() : '';
    return name || `Column${columnName(region.col + index)}`;
  });
}

/* ------------------------------------------------------------------ sort -- */

/**
 * One level's sortRange info object. The trial's combo wording maps onto the
 * public sort-info shapes: values use IValueSortInfo, the color rows use
 * ICellColorSortInfo/IFontColorSortInfo (order 'top' = "On Top").
 */
export type LevelSortInfo = GC.Spread.Sheets.IValueSortInfo | GC.Spread.Sheets.ICellColorSortInfo | GC.Spread.Sheets.IFontColorSortInfo;

export function levelSortInfo(level: SortLevel): LevelSortInfo {
  const index = Number(level.column);
  if (level.sortOn === 'Cell Color' || level.sortOn === 'Font Color') {
    const color = level.color ?? '';
    const order = level.order === 'On Bottom' ? 'bottom' : 'top';
    return level.sortOn === 'Cell Color'
      ? { index, backColor: color, order }
      : { index, fontColor: color, order };
  }
  return { index, ascending: level.order !== 'Z to A' };
}

/**
 * Sort infos in list order, one per dialog level.
 */
export function sortInfosFor(data: SortData): LevelSortInfo[] {
  const byRows = data.byRows !== false;
  const keyCount = byRows ? data.region.colCount : data.region.rowCount;
  const levels = (data.levels ?? []).filter((level) => level && level.column >= 0 && level.column < keyCount);
  return levels.map(levelSortInfo);
}

export function applySortToSheet(sheet: Worksheet, data: SortData): void {
  const byRows = data.byRows !== false;
  const skip = data.hasHeaders ? 1 : 0;
  const infos = sortInfosFor(data);
  if (!infos.length) return;
  // "Sort top to bottom" reorders rows around a column, "left to right"
  // reorders columns around a row; the header line never moves.
  const row = data.region.row + (byRows ? skip : 0);
  const col = data.region.col + (byRows ? 0 : skip);
  const rowCount = data.region.rowCount - (byRows ? skip : 0);
  const colCount = data.region.colCount - (byRows ? 0 : skip);
  if (byRows ? rowCount < 2 : colCount < 2) return;
  sheet.sortRange(row, col, rowCount, colCount, byRows, infos);
}

/**
 * Labels of the "Sort by" list: the column headers (or ColumnA…) when sorting
 * top to bottom, the sheet's row numbers when sorting left to right — the
 * orientation decides which line the trial lets you sort by.
 */
export function sortKeyLabels(sheet: Worksheet, region: Bounds, hasHeaders: boolean, byRows: boolean): string[] {
  if (byRows) return columnLabels(sheet, region, hasHeaders);
  const first = region.row + (hasHeaders ? 1 : 0);
  return Array.from({ length: region.rowCount - (hasHeaders ? 1 : 0) }, (_, index) => `Row${first + index + 1}`);
}

/* ------------------------------------------------------- remove duplicates -- */

export type DuplicateResult = { removed: number; unique: number };

/**
 * Compact the region in place, keeping the first occurrence of each row keyed
 * by the compared columns. Cells below the last kept row (full region width)
 * are cleared; the sheet size and neighbouring cells stay untouched.
 */
export function removeDuplicateRows(sheet: Worksheet, data: DuplicateData, GC: GCRoot): DuplicateResult {
  const region = data.region;
  const columns = (data.columns ?? []).filter((index) => index >= 0 && index < region.colCount);
  if (!columns.length) return { removed: 0, unique: 0 };
  const start = region.row + (data.hasHeaders ? 1 : 0);
  const end = region.row + region.rowCount;
  const seen = new Set<string>();
  let removed = 0;
  let writeRow = start;
  for (let r = start; r < end; r++) {
    const key = JSON.stringify(columns.map((index) => sheet.getValue(r, region.col + index)));
    if (seen.has(key)) { removed++; continue; }
    seen.add(key);
    if (writeRow !== r) sheet.copyTo(r, region.col, writeRow, region.col, 1, region.colCount, GC.Spread.Sheets.CopyToOptions.all);
    writeRow++;
  }
  if (writeRow < end) sheet.clear(writeRow, region.col, end - writeRow, region.colCount, 3, GC.Spread.Sheets.StorageType.data);
  return { removed, unique: writeRow - start };
}

/* ------------------------------------------------------ text to columns -- */

const DELIMITER_CHARS: { key: keyof Omit<TextToColumnsData['delimiters'], 'other'>; char: string }[] = [
  { key: 'tab', char: '\t' }, { key: 'semicolon', char: ';' }, { key: 'comma', char: ',' }, { key: 'space', char: ' ' },
];

export function delimiterChars(data: TextToColumnsData): string[] {
  const chars = DELIMITER_CHARS.filter((entry) => data.delimiters[entry.key]).map((entry) => entry.char);
  if (data.delimiters.other) chars.push(data.delimiters.other);
  return chars;
}

/**
 * Split one source text on the chosen delimiters, honouring the trial's text
 * qualifier. The state machine reproduces what the trial writes into the
 * sheet (probed through its wizard):
 *  - a quote toggles the qualified state and never reaches the cell text;
 *  - a quote that opens while the field already has text ends that field, so
 *    `a"b,c` becomes `a` | `b,c`;
 *  - text right after a closing quote continues the same field (`"x"y` -> `xy`);
 *  - a quote directly after a closing quote splits the field (`"a""b"` ->
 *    `a` | `b`), and the delimiter that then follows is kept as the first
 *    character of the next field (`"a""b",c` -> `a` | `b` | `,c`).
 */
export function parseDelimited(text: string, chars: string[], qualifier: string, consecutive: boolean): string[] {
  if (!chars.length) return [text];
  const fields: string[] = [];
  const isDelim = (char: string): boolean => chars.includes(char);
  let field = '';
  let quoted = false;
  let afterQuote = false;
  // Set once a quote directly follows a closing quote: from then on the trial
  // keeps delimiters inside the field text instead of splitting.
  let afterAdjacentQuote = false;
  let index = 0;
  while (index < text.length) {
    const char = text[index]!;
    if (qualifier && char === qualifier) {
      if (!quoted) {
        // A quote after text closes that field and opens a qualified one.
        if (field !== '') { fields.push(field); field = ''; }
        if (afterQuote) afterAdjacentQuote = true;
        quoted = true;
      } else if (afterAdjacentQuote) {
        // The boundary field ends at its closing quote.
        fields.push(field);
        field = '';
        quoted = false;
      } else quoted = false;
      afterQuote = true;
      index++;
      continue;
    }
    afterQuote = false;
    if (!quoted && isDelim(char)) {
      if (afterAdjacentQuote) { field += char; index++; continue; }
      fields.push(field);
      field = '';
      index++;
      if (consecutive) while (index < text.length && isDelim(text[index]!)) index++;
      continue;
    }
    field += char;
    index++;
  }
  // A text that ends on a closing quote produced no further field (trial).
  if (!(field === '' && afterQuote)) fields.push(field);
  return fields;
}

export function parseFixedWidth(text: string, breaks: number[]): string[] {
  const sorted = [...new Set(breaks)].filter((n) => n > 0 && n < text.length).sort((a, b) => a - b);
  const parts: string[] = [];
  let previous = 0;
  for (const at of sorted) { parts.push(text.slice(previous, at)); previous = at; }
  parts.push(text.slice(previous));
  return parts;
}

/** Split every source row into fields (before per-column formatting). */
export function splitRows(data: TextToColumnsData, texts: string[]): string[][] {
  if (data.mode === 'Fixed width') return texts.map((text) => parseFixedWidth(text, data.breaks));
  const chars = delimiterChars(data);
  return texts.map((text) => parseDelimited(text, chars, data.qualifier, data.consecutive));
}

const NUMBER_LIKE = /^[-+]?(\d+(\.\d*)?|\.\d+)([eE][-+]?\d+)?$/;
const DATE_TOKENS = /^(MDY|DMY|YMD|MY|YM|MD|D|M|Y)$/;

/** Convert one split field to its final cell value under the column format. */
export function coerceFieldValue(raw: string, format: TextColumnFormat, GC: GCRoot): unknown {
  const trimmed = format.format === 'Text' ? raw : raw.trim();
  if (format.format === 'Text') return raw;
  if (format.format === 'Date' && DATE_TOKENS.test(format.dateType) && trimmed) {
    const date = parseDateString(trimmed, format.dateType);
    if (date) return dateToSerial(GC, date);
    return trimmed;
  }
  if (format.format === 'General' || format.format === 'Date') {
    let candidate = trimmed;
    if (format.thousandsSeparator && candidate.includes(format.thousandsSeparator)) candidate = candidate.split(format.thousandsSeparator).join('');
    const decimal = format.decimalSeparator ?? '.';
    if (decimal !== '.' && candidate.includes(decimal)) candidate = candidate.split(decimal).join('.');
    if (NUMBER_LIKE.test(candidate) && candidate !== '') return Number(candidate);
    if (/^(TRUE|FALSE)$/i.test(candidate)) return candidate.toUpperCase() === 'TRUE';
  }
  return trimmed;
}

export function parseDateString(text: string, token: string): Date | null {
  const parts = text.split(/[-/.,\s]+/).filter((part) => part);
  const numbers = parts.map(Number);
  if (!numbers.length || numbers.some((n) => !Number.isFinite(n))) return null;
  let year = 1900, month = 1, day = 1;
  if (token === 'MDY' || token === 'DMY' || token === 'YMD') {
    const order = token === 'YMD' ? [0, 1, 2] : token === 'MDY' ? [1, 2, 0] : [2, 1, 0];
    [month, day, year] = [numbers[order[0]!], numbers[order[1]!], numbers[order[2]!]];
  } else if (token === 'MY' || token === 'YM') {
    const monthName = parts[token === 'MY' ? 0 : 1]!;
    year = numbers[token === 'MY' ? 1 : 0]!;
    month = monthNumber(monthName);
  } else if (token === 'MD') {
    month = numbers[0]!; day = numbers[1]!;
  } else if (token === 'D') { day = numbers[0]!; month = 1; }
  else if (token === 'M') { month = numbers[0]!; day = 1; }
  else if (token === 'Y') { year = numbers[0]!; month = 1; day = 1; }
  if (!month || !year) return null;
  const date = new Date(Date.UTC(year < 100 ? 2000 + year : year, (month || 1) - 1, day || 1));
  return Number.isNaN(date.getTime()) ? null : date;
}

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
function monthNumber(name: string): number {
  const lower = name.toLowerCase();
  const index = MONTHS.findIndex((month) => month.startsWith(lower.slice(0, 3)));
  return index < 0 ? Number(name) || 1 : index + 1;
}

/** Convert a Date into the workbook's 1900-based serial number. */
function dateToSerial(_GC: GCRoot, date: Date): number {
  const utc = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  return Math.floor(utc / 86400000) + 25569;
}

/** Parse `=A1`, `A1` or `=A1:B3` (the range top-left is used). */
export function parseDestinationAddress(text: string): { row: number; col: number } | null {
  const match = /\$?([A-Za-z]{1,3})\$?(\d{1,7})/.exec(String(text ?? '').trim());
  if (!match) return null;
  return { row: Math.max(0, Number(match[2]) - 1), col: parseColumnName(match[1]!.toUpperCase()) };
}

/**
 * Write the split result starting at the destination. Returns false when the
 * destination overlaps live cells that are not part of the source region.
 */
export function writeSplitColumns(sheet: Worksheet, GC: GCRoot, data: TextToColumnsData, destination: { row: number; col: number }, rows: string[][], allowReplace = false): { replaced: boolean } {
  const region = data.region;
  const fieldCount = rows.reduce((max, row) => Math.max(max, row.length), 0);
  let replaced = false;
  for (let r = 0; r < rows.length; r++) {
    for (let c = 0; c < fieldCount; c++) {
      const targetRow = destination.row + r, targetCol = destination.col + c;
      const insideSource = targetRow >= region.row && targetRow < region.row + region.rowCount && targetCol >= region.col && targetCol < region.col + region.colCount;
      if (!insideSource && notEmpty(sheet, targetRow, targetCol)) replaced = true;
    }
  }
  if (replaced && !allowReplace) return { replaced };
  for (let r = 0; r < rows.length; r++) {
    for (let c = 0; c < fieldCount; c++) {
      const format = data.formats[c] ?? { format: 'General' as const, dateType: 'MDY' };
      const targetRow = destination.row + r, targetCol = destination.col + c;
      if (format.format === 'Skip') continue;
      const raw = rows[r]?.[c];
      if (raw === undefined) continue;
      sheet.clear(targetRow, targetCol, 1, 1, 3, GC.Spread.Sheets.StorageType.data);
      const value = coerceFieldValue(raw, format, GC);
      if (value !== '') sheet.setValue(targetRow, targetCol, value);
      if (format.format === 'Date') styleWriter(sheet).setStyle(targetRow, targetCol, { formatter: 'm/d/yyyy' });
    }
  }
  return { replaced: false };
}

/* ----------------------------------------------------------- subtotal -- */

type GroupRun = { start: number; end: number; key: unknown };

export function removeSubtotalRows(sheet: Worksheet, bounds?: Bounds): number {
  // The trial scans the selected range only: subtotal rows outside it stay.
  const area = bounds ?? { row: 0, col: 0, rowCount: Math.min(sheet.getRowCount(), 2000), colCount: Math.min(sheet.getColumnCount(), 64) };
  const from = Math.max(0, area.row);
  const to = Math.min(sheet.getRowCount(), area.row + area.rowCount);
  const right = Math.min(sheet.getColumnCount(), area.col + area.colCount);
  const doomed: number[] = [];
  for (let r = from; r < to; r++) {
    let isSubtotal = false;
    for (let c = area.col; c < right; c++) {
      const formula = sheet.getFormula(r, c);
      if (typeof formula === 'string' && /^=?SUBTOTAL\(/i.test(formula.trim())) { isSubtotal = true; break; }
    }
    if (isSubtotal) doomed.push(r);
  }
  // deleteRows (the trial's API name) shifts outlines, styles and formulas.
  for (let i = doomed.length - 1; i >= 0; i--) sheet.deleteRows(doomed[i]!, 1);
  if (doomed.length) {
    sheet.rowOutlines.ungroup();
    for (let r = from; r < Math.min(sheet.getRowCount(), to + doomed.length); r++) sheet.setRowPageBreak(r, false);
  }
  return doomed.length;
}

/**
 * Insert subtotal rows like the trial's Subtotal command: one summary row per
 * contiguous run of the group column plus a grand total ("Grand Total" for
 * Sum, "Grand <Function>" otherwise), row outlines around each group (detail
 * rows one level deeper than the summary row), bold labels in the group
 * column and SUBTOTAL formulas in the checked columns.
 */
export function applySubtotalToSheet(sheet: Worksheet, data: SubtotalData): void {
  const region = data.region;
  const fn = SUBTOTAL_CODE[data.fn] !== undefined ? data.fn : 'Sum';
  const code = SUBTOTAL_CODE[fn]!;
  const word = subtotalWord(fn);
  if (data.replace) removeSubtotalRows(sheet);
  const groupCol = region.col + data.groupColumn;
  const firstData = region.row + 1;
  const lastData = region.row + region.rowCount - 1;
  if (lastData < firstData) return;
  // Contiguous runs sharing the group-column value (original indices).
  const groups: GroupRun[] = [];
  let runStart = firstData;
  for (let r = firstData + 1; r <= lastData + 1; r++) {
    if (r > lastData || !valuesLooseEqual(sheet.getValue(r, groupCol), sheet.getValue(runStart, groupCol))) {
      groups.push({ start: runStart, end: r - 1, key: sheet.getValue(runStart, groupCol) });
      runStart = r;
    }
  }
  if (!groups.length) return;
  // Planned row insertions: one per group plus the grand total, each with the
  // final layout position resolved after sorting.
  const below = data.summaryBelow !== false;
  type Pending = { at: number; grand: boolean; group?: GroupRun };
  const pending: Pending[] = groups.map((group) => ({ at: below ? group.end + 1 : group.start, grand: false, group }));
  pending.push({ at: below ? lastData + 1 : firstData, grand: true });
  // Ascending by position; at the same slot the grand total goes below the
  // last group summary (summaryBelow) or above the first group summary.
  pending.sort((a, b) => a.at - b.at || (a.at === b.at ? (below ? Number(a.grand) - Number(b.grand) : Number(b.grand) - Number(a.grand)) : 0));
  const finalOfOriginal = (r: number): number => r + pending.filter((item) => item.at <= r).length;
  // Bottom-up keeps earlier (smaller) positions valid during addRows.
  for (let i = pending.length - 1; i >= 0; i--) sheet.addRows(pending[i]!.at, 1);
  const summaryColumns = (data.columns ?? []).filter((index) => index >= 0 && index < region.colCount && index !== data.groupColumn);
  const formula = (colIndex: number, from: number, to: number): string =>
    `=SUBTOTAL(${code},${columnName(colIndex)}${from + 1}:${columnName(colIndex)}${to + 1})`;
  const finalFirst = finalOfOriginal(firstData);
  const finalLast = finalOfOriginal(lastData);
  // The trial bolds the label cell only, keeping the sheet's own font.
  const labelFont = (row: number): { font: string } => {
    const base = typeof sheet.getActualStyle === 'function' ? sheet.getActualStyle(row, groupCol)?.font : null;
    const rest = String(base ?? '').replace(/^(normal\s+)+/i, '').replace(/\b(bold|bolder|lighter|100|200|300|400|500|600|700|800|900)\b\s*/i, '').trim();
    return { font: `bold ${rest || '13.3px Calibri'}` };
  };
  let grandRow = -1;
  pending.forEach((item, i) => {
    const row = item.at + i;
    styleWriter(sheet).setStyle(row, groupCol, labelFont(row));
    if (item.grand) {
      grandRow = row;
      sheet.setValue(row, groupCol, `Grand ${word}`);
      for (const column of summaryColumns) sheet.setFormula(row, region.col + column, formula(region.col + column, finalFirst, finalLast));
      return;
    }
    const group = item.group!;
    const groupStart = finalOfOriginal(group.start);
    const groupEnd = finalOfOriginal(group.end);
    sheet.setValue(row, groupCol, `${String(group.key ?? '')} ${word}`.trim());
    for (const column of summaryColumns) sheet.setFormula(row, region.col + column, formula(region.col + column, groupStart, groupEnd));
    // Outlines: summary row at level 0, detail rows one level deeper (trial).
    const outerStart = Math.min(groupStart, row), outerEnd = Math.max(groupEnd, row);
    sheet.rowOutlines.group(outerStart, outerEnd - outerStart + 1);
    sheet.rowOutlines.group(groupStart, groupEnd - groupStart + 1);
  });
  if (data.pageBreak) {
    // The trial breaks the page at the top of every group but the first (the
    // summary row when summaries sit above the data), and after the grand
    // total when the summaries sit below it.
    let firstRow = -1;
    pending.forEach((item, i) => {
      if (item.grand) return;
      const row = item.at + i;
      const blockStart = below ? finalOfOriginal(item.group!.start) : row;
      if (firstRow < 0) firstRow = blockStart;
      else sheet.setRowPageBreak(blockStart, true);
    });
    if (below && grandRow >= 0) sheet.setRowPageBreak(grandRow + 1, true);
  }
}

function valuesLooseEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || a === undefined) return b === null || b === undefined || b === '';
  if (b === null || b === undefined) return a === null || a === undefined || a === '';
  return String(a) === String(b);
}

/* ------------------------------------------------------- auto outline -- */

/**
 * Group the detail rows/columns that feed same-line summary formulas inside
 * the region, mirroring the trial's Auto Outline: a cell whose formula
 * aggregates a vertical range of its own column makes those rows a group;
 * a horizontal range of its own row makes those columns a group.
 */
export function applyAutoOutline(sheet: Worksheet, region: Bounds): { rowGroups: number; colGroups: number } {
  const rowSpans: [number, number][] = [];
  const colSpans: [number, number][] = [];
  const endRow = region.row + region.rowCount, endCol = region.col + region.colCount;
  for (let r = region.row; r < endRow; r++) {
    for (let c = region.col; c < endCol; c++) {
      // Worksheet.getFormula hands back the text without its leading '='.
      const formula = cellFormula(sheet, r, c);
      if (!formula) continue;
      const ref = /([A-Za-z]{1,3})(\d+)(?::([A-Za-z]{1,3})(\d+))?/.exec(formula);
      if (!ref) continue;
      const [, letter1, digits1, letter2, digits2] = ref;
      const col1 = parseColumnName(letter1!);
      if (!letter2 || !digits2) continue;
      const col2 = parseColumnName(letter2), row1 = Number(digits1) - 1, row2 = Number(digits2) - 1;
      // Vertical range inside the cell's own column -> the referenced rows are detail.
      if (col1 === col2 && col1 === c && col1 >= region.col && col1 < endCol) {
        rowSpans.push([Math.max(region.row, Math.min(row1, row2)), Math.min(endRow - 1, Math.max(row1, row2))]);
      }
      // Horizontal range inside the cell's own row -> the referenced columns are detail.
      if (col1 !== col2 && row1 === row2 && row1 === r && r >= region.row && r < endRow) {
        colSpans.push([Math.max(region.col, Math.min(col1, col2)), Math.min(endCol - 1, Math.max(col1, col2))]);
      }
    }
  }
  const rowBlocks = mergeSpans(rowSpans.filter(([from, to]) => to > from)).filter((span) => !spanIsFormulaRow(sheet, span, region));
  const colBlocks = mergeSpans(colSpans.filter(([from, to]) => to > from)).filter((span) => !spanIsFormulaCol(sheet, span, region));
  for (const [start, end] of rowBlocks) if (end > start) sheet.rowOutlines.group(start, end - start + 1);
  for (const [start, end] of colBlocks) if (end > start) sheet.columnOutlines.group(start, end - start + 1);
  return { rowGroups: rowBlocks.length, colGroups: colBlocks.length };
}

function parseColumnName(letters: string): number {
  let n = 0;
  for (const char of letters.toUpperCase()) n = n * 26 + (char.charCodeAt(0) - 64);
  return n - 1;
}

/** The formula text of a cell without its leading '=' ('' when it has none). */
function cellFormula(sheet: Worksheet, row: number, col: number): string {
  const value = typeof sheet.getFormula === 'function' ? sheet.getFormula(row, col) : null;
  return typeof value === 'string' ? value.trim().replace(/^=/, '') : '';
}

function mergeSpans(spans: [number, number][]): [number, number][] {
  const sorted = [...spans].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const merged: [number, number][] = [];
  for (const span of sorted) {
    const last = merged[merged.length - 1];
    if (last && span[0] <= last[1] + 1) last[1] = Math.max(last[1], span[1]);
    else merged.push([span[0], span[1]]);
  }
  return merged;
}

function spanIsFormulaRow(sheet: Worksheet, block: [number, number], region: Bounds): boolean {
  for (let r = block[0]; r <= block[1]; r++) {
    for (let c = region.col; c < region.col + region.colCount; c++) {
      if (hasFormulaInRegion(sheet, r, c, region)) return true;
    }
  }
  return false;
}

function spanIsFormulaCol(sheet: Worksheet, block: [number, number], region: Bounds): boolean {
  for (let c = block[0]; c <= block[1]; c++) {
    for (let r = region.row; r < region.row + region.rowCount; r++) {
      if (hasFormulaInRegion(sheet, r, c, region)) return true;
    }
  }
  return false;
}

function hasFormulaInRegion(sheet: Worksheet, row: number, col: number, region: Bounds): boolean {
  if (col < region.col || col >= region.col + region.colCount) return false;
  const formula = sheet.getFormula(row, col);
  return typeof formula === 'string' && formula.trim().startsWith('=');
}

/** True when either outline already groups a row/column (trial confirm case). */
export function sheetHasOutlines(sheet: Worksheet): boolean {
  const max = Math.min(sheet.getRowCount(), 400);
  for (let i = 0; i < max; i++) if (sheet.rowOutlines.getLevel(i) >= 0) return true;
  const maxCol = Math.min(sheet.getColumnCount(), 100);
  for (let i = 0; i < maxCol; i++) if (sheet.columnOutlines.getLevel(i) >= 0) return true;
  return false;
}
