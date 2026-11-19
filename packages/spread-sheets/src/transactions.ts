/**
 * `GC.Spread.Sheets.Commands.startTransaction / endTransaction / undoTransaction`
 * (TASK 44, trial-observed semantics).
 *
 * Trial behaviour captured black-box on the 19.2.5 trial page:
 * - `startTransaction(wb, options)` remembers the data-model state of every
 *   worksheet named in `options.sheetName` (a string or an array of names).
 *   Without `sheetName` nothing is recorded (trial: `undoTransaction` then
 *   leaves the model untouched).
 * - `endTransaction(wb, options)` stores the recorded changes onto the same
 *   options object under a `changes<sheetName>` key (trial observed:
 *   `{ cmd, sheetName, changesSheet1 }`; a renamed sheet produced
 *   `changesZeta`). The trial also attaches private bookkeeping properties to
 *   the options object; those are internal and not reproduced here.
 * - `undoTransaction(wb, options)` reverts every change recorded for that
 *   options object (trial: value writes and a cell backColor set inside the
 *   transaction are undone).
 * - Nested transactions: changes are recorded into the OUTERMOST open
 *   transaction only; undoing an inner transaction does nothing (trial: the
 *   inner undo left the value, the outer undo reverted both cells).
 * - `undoTransaction` for an options object that never started a transaction
 *   is a no-op and does not throw.
 *
 * The snapshot/diff helpers are shared with the built-in command constants
 * (`command-constants.ts`) which record their own undo state.
 */
import { clone } from './primitives.js';
import { queueCalc } from './sheet-cells.js';
import type { CommandOptions } from './commands.js';
import type { Workbook } from './workbook.js';
import type { Worksheet } from './worksheet.js';
import type { CellData } from './sheet-common.js';
import { GC } from './generated/enums.js';

const VIEW = GC.Spread.Sheets.SheetArea.viewport;

interface TxnFrame {
  options: CommandOptions;
  snapshots: Map<string, Map<string, CellData>>;
}

const openTransactions = new WeakMap<Workbook, TxnFrame[]>();

function frames(workbook: Workbook): TxnFrame[] {
  let list = openTransactions.get(workbook);
  if (!list) openTransactions.set(workbook, (list = []));
  return list;
}

function transactionSheets(workbook: Workbook, options: CommandOptions): Worksheet[] {
  const value = options.sheetName;
  if (value === undefined || value === null) return [];
  const names = Array.isArray(value) ? value : [value];
  const out: Worksheet[] = [];
  for (const name of names) {
    const sheet = workbook.getSheetFromName(String(name));
    if (sheet && !out.includes(sheet)) out.push(sheet);
  }
  return out;
}

function snapshotCells(sheet: Worksheet): Map<string, CellData> {
  const out = new Map<string, CellData>();
  const area = sheet.areas.get(VIEW);
  if (!area) return out;
  for (const [row, col, cell] of area.cells.entries()) out.set(`${row},${col}`, clone(cell));
  return out;
}

/** Cloned cell records for the cells inside a rectangle (existing cells only). */
export function captureRect(sheet: Worksheet, row: number, col: number, rowCount: number, colCount: number): Map<string, CellData> {
  const out = new Map<string, CellData>();
  const area = sheet.areas.get(VIEW);
  if (!area) return out;
  for (const [r, c, cell] of area.cells.entries()) {
    if (r >= row && r < row + rowCount && c >= col && c < col + colCount) out.set(`${r},${c}`, clone(cell));
  }
  return out;
}

function encodeCell(cell: CellData | undefined): string {
  return JSON.stringify(cell ?? null);
}

export interface CellChange {
  row: number;
  col: number;
  before?: CellData;
  after?: CellData;
}

/** Cell-level data-model diff between two snapshots. */
export function diffSnapshots(before: Map<string, CellData>, after: Map<string, CellData>): CellChange[] {
  const changes: CellChange[] = [];
  for (const key of new Set([...before.keys(), ...after.keys()])) {
    const b = before.get(key), a = after.get(key);
    if (encodeCell(b) === encodeCell(a)) continue;
    const comma = key.indexOf(',');
    const row = Number(key.slice(0, comma)), col = Number(key.slice(comma + 1));
    changes.push({ row, col, ...(b ? { before: b } : {}), ...(a ? { after: a } : {})});
  }
  return changes;
}

/**
 * Writes one recorded cell state back onto the sheet. Raw store writes keep
 * every recorded field (value, formula, style, tag, hyperlink, validator) at
 * full fidelity; the calculation engine is informed through the normal
 * change queue and the sheet is repainted.
 */
export function restoreCell(sheet: Worksheet, change: CellChange, applyUndo: boolean): void {
  const area = sheet.areas.get(VIEW);
  if (!area) return;
  const data = applyUndo ? change.before : change.after;
  const record = data === undefined ? undefined : clone(data);
  area.cells.set(change.row, change.col, record);
  const formula = typeof record?.formula === 'string' ? record.formula : null;
  queueCalc(sheet, {
    kind: formula !== null ? 'formula' : 'value',
    row: change.row,
    col: change.col,
    formula,
    value: record?.value,
  });
  sheet._invalidate();
}

export function startTransaction(context: Workbook, options: CommandOptions): void {
  const stack = frames(context);
  const snapshots = new Map<string, Map<string, CellData>>();
  for (const sheet of transactionSheets(context, options)) snapshots.set(sheet.name(), snapshotCells(sheet));
  stack.push({ options, snapshots });
}

export function endTransaction(context: Workbook, _options: CommandOptions): void {
  const stack = openTransactions.get(context);
  if (!stack || !stack.length) return;
  const frame = stack.pop()!;
  // Nested transactions record into the outermost frame only (trial).
  if (stack.length) return;
  for (const [name, before] of frame.snapshots) {
    const sheet = context.getSheetFromName(name);
    if (!sheet) continue;
    const changes = diffSnapshots(before, snapshotCells(sheet));
    (frame.options as Record<string, unknown>)[`changes${name}`] = changes;
  }
}

export function undoTransaction(context: Workbook, options: CommandOptions): void {
  for (const key of Object.keys(options)) {
    if (!key.startsWith('changes')) continue;
    const sheet = context.getSheetFromName(key.slice('changes'.length));
    if (!sheet) continue;
    const changes = options[key] as CellChange[];
    if (!Array.isArray(changes)) continue;
    for (const change of changes) restoreCell(sheet, change, true);
  }
}
