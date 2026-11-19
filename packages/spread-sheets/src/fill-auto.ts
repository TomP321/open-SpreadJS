/**
 * Worksheet.fillAuto (TASK 46 item 2): pattern fill over a whole range, seeded
 * from a start range. Every rule below reproduces values observed on the trial
 * through the public API (.probe/api-sweep-probe.mjs segments fa46c/fa46d/fa46e):
 *
 *  - `fillType` must be 0..4 (direction/linear/growth/date/auto); an invalid
 *    fillType (or missing options) fills nothing.
 *  - `direction` must be 0..3 (left/right/up/down); an invalid direction fills nothing.
 *  - `series` defaults to column when missing/invalid (trial: series "both" filled as column).
 *  - The whole range must overlap the start range; disjoint ranges fill nothing.
 *  - Fill cells are the whole range minus the start cells, extended in the chosen
 *    direction only; geometric extension is anchored at the start block's first cell.
 *  - Plain number lines extend arithmetically (step from the first two values, +1 for a
 *    single value, step 0 constant); growth mode uses a geometric ratio; date lines
 *    extend by their day delta (+1 day for a single date); the direction/date fill types
 *    copy the line's first value; month and weekday names cycle through the calendar
 *    lists; text sharing an affix pair with trailing numbers increments the number part
 *    (zero padding preserved); any other text line repeats the start pattern.
 *  - Start cells holding formulas are replicated with relative reference shifts; plain
 *    cells in such a line advance by (lineLength - 1) per repeat
 *    (trial: [1, =A1+1] -> 1,2,2,3,3,4; [1,2,=A1+A2] -> 1,2,3,3,4,7).
 */
import { Range } from './primitives.js';
import { adjustFormula } from './range.js';
import type { Worksheet } from './worksheet.js';

interface FillOptions {
  fillType?: unknown;
  series?: unknown;
  direction?: unknown;
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEK_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const mod = (n: number, count: number): number => ((n % count) + count) % count;

interface Series {
  /** Value at the start-anchored index k (negative for fills above/left of the block). */
  at(k: number): unknown;
}

/** Detects the trial's fill series for one line of start cells. */
function detectSeries(values: unknown[], fillType: number): Series | null {
  const n = values.length;
  if (!n) return null;
  if (fillType === 0 || fillType === 3) {
    // direction/date types: the trial copies the line's first value everywhere.
    const first = values[0];
    return { at: () => first };
  }
  const allNumber = values.every(v => typeof v === 'number');
  if (allNumber) {
    const first = Number(values[0]);
    if (fillType === 2) {
      const ratio = n > 1 && first !== 0 ? Number(values[1]) / first : 2;
      return { at: (k) => first * Math.pow(ratio, k) };
    }
    const step = n > 1 ? Number(values[1]) - first : 1;
    return { at: (k) => first + step * k };
  }
  if (fillType === 1 || fillType === 2) return null; // forced numeric series on non-numeric lines: nothing
  const allDate = values.every(v => v instanceof Date);
  const allString = values.every(v => typeof v === 'string');
  if (allDate) {
    const first = (values[0] as Date).getTime();
    const dayMs = 86400000;
    const delta = n > 1 ? ((values[1] as Date).getTime() - first) / dayMs : 1;
    return { at: (k) => new Date(first + delta * dayMs * k) };
  }
  if (allString) {
    const strings = values as string[];
    const cycle = (list: string[]): Series | null => {
      if (!strings.every(v => list.includes(v))) return null;
      const pos = list.indexOf(strings[0]!);
      return { at: (k) => list[mod(pos + k, list.length)] };
    };
    const calendar = cycle(MONTH_NAMES) ?? cycle(MONTHS_FULL) ?? cycle(WEEK_DAYS);
    if (calendar) return calendar;
    const parts = strings.map(v => /^(.*?)(\d+)(\D*)$/.exec(v));
    if (parts.every(m => !!m) && parts.every(m => m![1] === parts[0]![1] && m![3] === parts[0]![3])) {
      const base = parts[0]!;
      const step = n > 1 ? Number(parts[1]![2]) - Number(base[2]) : 1;
      const width = base[2].length;
      return {
        at: (k) => {
          const next = Number(base[2]) + step * k;
          const text = next >= 0 && width > 1 && String(next).length < width ? String(next).padStart(width, '0') : String(next);
          return `${base[1]}${text}${base[3]}`;
        },
      };
    }
    // Plain text: repeat the start pattern.
    return { at: (k) => strings[mod(k, n)] };
  }
  return null; // mixed types: the trial fills nothing
}

export function fillAuto(sheet: Worksheet, startRange: Range, wholeRange: Range, options: FillOptions): void {
  const isRange = (r: unknown): r is Range =>
    !!r && typeof (r as Range).row === 'number' && typeof (r as Range).col === 'number'
    && typeof (r as Range).rowCount === 'number' && typeof (r as Range).colCount === 'number';
  if (!isRange(startRange) || !isRange(wholeRange)) return;
  for (const r of [startRange, wholeRange])
    if (!Number.isSafeInteger(r.row) || !Number.isSafeInteger(r.col) || !Number.isSafeInteger(r.rowCount) || !Number.isSafeInteger(r.colCount)
      || r.row < 0 || r.col < 0 || r.rowCount < 1 || r.colCount < 1)
      throw new RangeError('Row, column, rowCount and colCount must be non-negative safe integers.');
  const fillType = Number(options?.fillType);
  if (![0, 1, 2, 3, 4].includes(fillType)) return; // trial: an invalid fillType fills nothing
  const direction = Number(options?.direction);
  if (![0, 1, 2, 3].includes(direction)) return; // trial: an invalid direction fills nothing
  const rowSeries = Number(options?.series) === 1; // default/invalid series behaves as column

  const overlapRow = wholeRange.row < startRange.row + startRange.rowCount && startRange.row < wholeRange.row + wholeRange.rowCount;
  const overlapCol = wholeRange.col < startRange.col + startRange.colCount && startRange.col < wholeRange.col + wholeRange.colCount;
  if (!overlapRow || !overlapCol) return; // trial: a disjoint whole range fills nothing

  // fillType 0 (direction) and 3 (date): the trial copies the first start cell across
  // the entire whole range, including the start cells themselves (fa46c dateFill probe:
  // a start cell holding Jan3 became Jan2).
  if (fillType === 0 || fillType === 3) {
    const firstFormula = sheet.getFormula(startRange.row, startRange.col);
    const firstValue = sheet.getValue(startRange.row, startRange.col);
    for (let r = wholeRange.row; r < wholeRange.row + wholeRange.rowCount; r++)
      for (let c = wholeRange.col; c < wholeRange.col + wholeRange.colCount; c++) {
        if (r === startRange.row && c === startRange.col) continue;
        if (typeof firstFormula === 'string' && firstFormula.length)
          sheet.setFormula(r, c, adjustFormula(firstFormula, r - startRange.row, c - startRange.col));
        else {
          sheet.setFormula(r, c, null);
          sheet.setValue(r, c, firstValue);
        }
      }
    return;
  }

  const columnSeries = !rowSeries;
  if (columnSeries ? direction === 0 || direction === 1 : direction === 2 || direction === 3) return; // axis mismatch

  if (rowSeries) {
    const positive = direction === 1; // right
    const rowLo = Math.max(wholeRange.row, startRange.row);
    const rowHi = Math.min(wholeRange.row + wholeRange.rowCount - 1, startRange.row + startRange.rowCount - 1);
    for (let row = rowLo; row <= rowHi; row++)
      fillLine(sheet, row, startRange.col, 1, startRange.colCount, positive,
        wholeRange.col, wholeRange.col + wholeRange.colCount - 1, fillType);
  } else {
    const positive = direction === 3; // down
    const colLo = Math.max(wholeRange.col, startRange.col);
    const colHi = Math.min(wholeRange.col + wholeRange.colCount - 1, startRange.col + startRange.colCount - 1);
    for (let col = colLo; col <= colHi; col++)
      fillLine(sheet, col, startRange.row, 0, startRange.rowCount, positive,
        wholeRange.row, wholeRange.row + wholeRange.rowCount - 1, fillType);
  }
}

/**
 * Fills one start line (a column when axis is 0, a row when axis is 1) along the axis.
 * `lineIndex` is the fixed coordinate (column or row), `startEdge` the axis position of
 * the first start cell; `wholeLo`/`wholeHi` bound the fill along the axis.
 */
function fillLine(
  sheet: Worksheet,
  lineIndex: number,
  startEdge: number,
  axis: 0 | 1,
  lineLength: number,
  positive: boolean,
  wholeLo: number,
  wholeHi: number,
  fillType: number,
): void {
  const at = (pos: number): [number, number] => (axis === 0 ? [pos, lineIndex] : [lineIndex, pos]);
  const values: unknown[] = [];
  const formulas: (string | undefined)[] = [];
  for (let i = 0; i < lineLength; i++) {
    const [r, c] = at(startEdge + i);
    values.push(sheet.getValue(r, c));
    const formula = sheet.getFormula(r, c);
    formulas.push(typeof formula === 'string' && formula.length ? formula : undefined);
  }
  const hasFormula = formulas.some(f => f !== undefined);
  const plain = values.filter((_, i) => formulas[i] === undefined);
  const detected = detectSeries(hasFormula ? plain : values, fillType);
  const bottomExclusive = startEdge + lineLength;

  const put = (pos: number): void => {
    const [r, c] = at(pos);
    if (hasFormula && fillType !== 0 && fillType !== 3) {
      // Formula lines: replicate formula cells with relative shifts (trial-verified);
      // plain cells advance by (lineLength - 1) per full repeat of the block.
      const d = positive ? pos - bottomExclusive : startEdge - 1 - pos;
      if (d < 0) return;
      const offset = positive ? mod(d, lineLength) : lineLength - 1 - mod(d, lineLength);
      const repeat = Math.floor(d / lineLength) + 1;
      const formula = formulas[offset];
      if (formula !== undefined) {
        const shift = pos - (startEdge + offset);
        sheet.setFormula(r, c, adjustFormula(formula, axis === 0 ? shift : 0, axis === 0 ? 0 : shift));
        return;
      }
      const base = values[offset];
      if (typeof base === 'number') sheet.setValue(r, c, base + (positive ? 1 : -1) * (lineLength - 1) * repeat);
      else sheet.setValue(r, c, base);
      return;
    }
    if (!detected) return;
    const value = detected.at(pos - startEdge);
    if (value !== undefined) sheet.setValue(r, c, value);
  };

  if (positive) {
    for (let pos = Math.max(bottomExclusive, wholeLo); pos <= wholeHi; pos++) put(pos);
  } else {
    for (let pos = Math.min(startEdge - 1, wholeHi); pos >= wholeLo; pos--) put(pos);
  }
}
