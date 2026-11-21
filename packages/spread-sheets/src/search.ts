/**
 * `Workbook.search` and `Worksheet.search`.
 *
 * The records (`SearchCondition`, `SearchResult`), their field order and
 * defaults, and the scan rules below are what the official 19.2.5 trial answers
 * for the same public calls (task 38 item 5; probe `.probe/api-sweep-probe.mjs`,
 * reports `.probe/report-item5*.json`):
 *
 * - `rowStart` and `columnStart` are the cell the scan starts at (inclusive,
 *   `-1` means the beginning of the sheet). `rowEnd` and `columnEnd` are read
 *   but never limit the scan: a value below the start only hides the matches
 *   that sit before it (probe items `search-7`, `search-8`).
 * - `searchOrder` 1 scans the same window backwards.
 * - `searchTarget` is a bit set: 1 cell text, 4 cell tag, 8 cell formula, 16
 *   comment, 32 threaded comment. Bit 2 searches nothing. The answer carries the
 *   union of the targets that matched at the found cell, and `foundString`
 *   comes from the highest of them.
 * - The formula target reads the formula with its leading `=` and, for a cell
 *   without a formula, the text the cell displays.
 * - The scan needs `findBeginRow`/`findBeginColumn` on the condition; a foreign
 *   object without them finds nothing, and a missing condition answers
 *   `undefined` entirely.
 * - A sheet-level search reports `foundSheetIndex` -1; only `Workbook.search`
 *   names the sheet it found, and its `startSheetIndex`/`endSheetIndex` window
 *   must fit the workbook.
 */
import { GC } from './generated/enums.js';
import { getText } from './sheet-cells.js';
import type { CellData } from './sheet-common.js';
import type { Workbook } from './workbook.js';
import type { Worksheet } from './worksheet.js';

const { SheetArea } = GC.Spread.Sheets;
const { SearchFoundFlags, SearchFlags, SearchOrder } = GC.Spread.Sheets.Search;

/**
 * The query record, in the trial's own field order and with the values a freshly
 * constructed condition carries there.
 */
export class SearchCondition {
  startSheetIndex = -1;
  endSheetIndex = -1;
  searchString: string | null = null;
  searchFlags: number = SearchFlags.none;
  searchOrder: number = SearchOrder.zOrder;
  searchTarget: number = SearchFoundFlags.cellText;
  sheetArea: number = SheetArea.viewport;
  rowStart = -1;
  columnStart = -1;
  rowEnd = -1;
  columnEnd = -1;
  /** Position the scan begins at; the trial leaves it alone after a search. */
  findBeginRow = -1;
  findBeginColumn = -1;
}

/** The answer record, in the trial's field order. */
export class SearchResult {
  foundColumnIndex = -1;
  foundRowIndex = -1;
  searchFoundFlag: number = SearchFoundFlags.none;
  foundSheetIndex = -1;
  foundString: unknown = null;
}

/** One searchable record of a cell. */
interface CellTarget {
  flag: number;
  text: string;
}

/** Wildcards, exact match and case sensitivity as the trial applies them. */
function matches(text: string, needle: string, flags: number): boolean {
  const ignoreCase = (flags & SearchFlags.ignoreCase) !== 0;
  const exact = (flags & SearchFlags.exactMatch) !== 0;
  const wildCards = (flags & SearchFlags.useWildCards) !== 0;
  let haystack = text;
  let pattern = needle;
  if (ignoreCase) {
    haystack = haystack.toLowerCase();
    pattern = pattern.toLowerCase();
  }
  if (wildCards) {
    // The pattern is matched against the whole text: `a*a` finds `alpha` and
    // not `ALPHAx`, whichever way the scan runs (probe item `search-8`).
    const source = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '[\\s\\S]*')
      .replace(/\?/g, '.');
    return new RegExp(`^${source}$`).test(haystack);
  }
  return exact ? haystack === pattern : haystack.includes(pattern);
}

/** Text of a threaded comment: the plain text of every reply block. */
function threadedText(thread: { all(): { message?: unknown }[] }): string {
  const parts: string[] = [];
  const walk = (node: unknown): void => {
    if (typeof node === 'string') {
      parts.push(node);
      return;
    }
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    if (node && typeof node === 'object') {
      const record = node as Record<string, unknown>;
      // A text block is `{ type: ContentType.text, value: 'the text' }`.
      if (typeof record.value === 'string') parts.push(record.value);
      else for (const key of ['text', 'blocks', 'elements']) if (key in record) walk(record[key]);
    }
  };
  for (const reply of thread.all()) walk(reply?.message);
  return parts.join('');
}

/** Axis sizes of the searched sheet area. */
function areaSize(sheet: Worksheet, area: number): { rows: number; cols: number } {
  if (area === SheetArea.colHeader) return { rows: 1, cols: sheet.getColumnCount() };
  if (area === SheetArea.rowHeader) return { rows: sheet.getRowCount(), cols: 1 };
  if (area === SheetArea.corner) return { rows: 1, cols: 1 };
  return { rows: sheet.getRowCount(), cols: sheet.getColumnCount() };
}

/** The searchable texts of one cell, in ascending target order. */
function cellTargets(
  sheet: Worksheet,
  row: number,
  col: number,
  condition: SearchCondition,
  cell: CellData | undefined,
): CellTarget[] {
  const target = condition.searchTarget ?? SearchFoundFlags.cellText;
  const area = condition.sheetArea ?? SheetArea.viewport;
  const text = getText(sheet, row, col, area);
  const out: CellTarget[] = [];
  if (target & SearchFoundFlags.cellText) out.push({ flag: SearchFoundFlags.cellText, text });
  if (target & SearchFoundFlags.cellTag) {
    const tag = cell?.tag ?? sheet.areas.get(area)?.tag;
    out.push({ flag: SearchFoundFlags.cellTag, text: tag === undefined || tag === null ? '' : String(tag) });
  }
  // The trial reads the formula of a cell with its `=`, and the text the cell
  // displays when it has no formula at all (probe items `formulaText`, `formula`).
  if (target & SearchFoundFlags.cellFormula) out.push({ flag: SearchFoundFlags.cellFormula, text: cell?.formula ? `=${cell.formula}` : text });
  if (target & SearchFoundFlags.cellComment) {
    const comment = sheet.comments.get(row, col);
    out.push({ flag: SearchFoundFlags.cellComment, text: comment ? comment.text() : '' });
  }
  if (target & SearchFoundFlags.cellThreadedComment) {
    const thread = sheet.threadedComments.get(row, col);
    out.push({ flag: SearchFoundFlags.cellThreadedComment, text: thread ? threadedText(thread) : '' });
  }
  return out;
}

/** Positions that can carry searchable content, sorted for the scan direction. */
function candidateCells(
  sheet: Worksheet,
  condition: SearchCondition,
  target: number,
  from: { row: number; col: number },
  size: { rows: number; cols: number },
): Iterable<[number, number]> {
  const data = sheet.areas.get(condition.sheetArea ?? SheetArea.viewport);
  const cellLike = (target & (SearchFoundFlags.cellText | SearchFoundFlags.cellTag | SearchFoundFlags.cellFormula)) !== 0;
  const commentLike = (target & (SearchFoundFlags.cellComment | SearchFoundFlags.cellThreadedComment)) !== 0;
  // Fast path: the common cell text/tag/formula search streams the sparse grid
  // in scan order and stops at the first match — no materialisation, no sort.
  if (data && cellLike && !commentLike) {
    const reverse = condition.searchOrder === SearchOrder.nOrder;
    const slots = size.rows * size.cols;
    const cellCount = data.cells.size;
    if (slots <= Math.max(65536, cellCount * 32)) {
      // Dense rectangle: probing (row, col) positions beats streaming three
      // merged generators — no per-position allocation, near-array cost.
      return (function* probe(): Iterable<[number, number]> {
        if (!reverse) {
          for (let row = from.row; row < size.rows; row++)
            for (let col = row === from.row ? from.col : 0; col < size.cols; col++)
              if (data.cells.has(row, col)) yield [row, col];
        } else {
          for (let row = size.rows - 1; row >= from.row; row--)
            for (let col = size.cols - 1; col >= (row === from.row ? from.col : 0); col--)
              if (data.cells.has(row, col)) yield [row, col];
        }
      })();
    }
    return (function* stream(): Iterable<[number, number]> {
      for (const [row, col, cell] of data.cells.orderedEntries(reverse)) {
        if (!cell) continue;
        if (row < 0 || row >= size.rows || col < 0 || col >= size.cols) continue;
        if (row < from.row || (row === from.row && col < from.col)) continue;
        yield [row, col];
      }
    })();
  }
  const found = new Map<string, [number, number]>();
  const add = (row: number, col: number): void => {
    if (row < from.row || row >= size.rows || col < 0 || col >= size.cols) return;
    if (row === from.row && col < from.col) return;
    found.set(`${row}:${col}`, [row, col]);
  };
  if (data && cellLike) for (const [row, col, cell] of data.cells.entries()) if (cell) add(row, col);
  if (data && target & SearchFoundFlags.cellComment) for (const comment of sheet.comments.all()) add(comment.rowIndex(), comment.colIndex());
  if (data && target & SearchFoundFlags.cellThreadedComment)
    for (const thread of sheet.threadedComments.all()) add(thread.row(), thread.col());
  const reverse = condition.searchOrder === SearchOrder.nOrder;
  return [...found.values()].sort((a, b) =>
    reverse ? b[0] - a[0] || b[1] - a[1] : a[0] - b[0] || a[1] - b[1],
  );
}

/** Searches one sheet; `sheetIndex` is reported as `foundSheetIndex` (`-1` for a sheet-level search). */
export function searchSheet(sheet: Worksheet, condition: SearchCondition, sheetIndex: number): SearchResult {
  const result = new SearchResult();
  const needle =
    condition.searchString === null || condition.searchString === undefined ? '' : String(condition.searchString);
  if (needle === '') return result;
  // The trial starts its scan from these; a condition that does not carry them
  // (a foreign object) never reaches a cell (probe item `search-8`, `plainObj`).
  if (typeof condition.findBeginRow !== 'number' || typeof condition.findBeginColumn !== 'number') return result;
  const target = condition.searchTarget ?? SearchFoundFlags.cellText;
  const area = condition.sheetArea ?? SheetArea.viewport;
  const data = sheet.areas.get(area);
  const size = areaSize(sheet, area);
  const from = {
    row: Math.max(0, condition.rowStart >= 0 ? condition.rowStart : 0),
    col: Math.max(0, condition.columnStart >= 0 ? condition.columnStart : 0),
  };
  for (const [row, col] of candidateCells(sheet, condition, target, from, size)) {
    const cell = data?.cells.peek(row, col);
    let flag = SearchFoundFlags.none;
    let text = '';
    for (const item of cellTargets(sheet, row, col, condition, cell)) {
      if (item.text === '') continue;
      if (matches(item.text, needle, condition.searchFlags ?? 0)) {
        flag |= item.flag;
        text = item.text;
      }
    }
    if (flag === SearchFoundFlags.none) continue;
    result.searchFoundFlag = flag;
    result.foundSheetIndex = sheetIndex;
    result.foundRowIndex = row;
    result.foundColumnIndex = col;
    result.foundString = text;
    return result;
  }
  return result;
}

/** `Workbook.search`: the sheet window the condition allows, in workbook order. */
export function searchWorkbook(workbook: Workbook, condition: SearchCondition): SearchResult {
  const sheets = workbook.sheets;
  const from = condition.startSheetIndex >= 0 ? condition.startSheetIndex : 0;
  const to = condition.endSheetIndex >= 0 ? condition.endSheetIndex : sheets.length - 1;
  // The window has to fit the workbook: an end index beyond the last sheet finds
  // nothing at all (probe item `search-8`, `wbBoundsOver`).
  if (from > to || to >= sheets.length || from >= sheets.length) return new SearchResult();
  for (let index = from; index <= to; index++) {
    const answer = searchSheet(sheets[index]!, condition, index);
    if (answer.searchFoundFlag !== SearchFoundFlags.none) return answer;
  }
  return new SearchResult();
}
