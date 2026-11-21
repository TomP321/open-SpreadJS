/* Clipboard commands: designer-side copy of the selection rectangle and the
 * full Paste Options / Paste Special matrix of paste modes. */
import type { ClipboardData, ClipCell, DesignerApi as Designer } from '../designer-api.js';
import type { GCRoot, SelectionRange, Style, Workbook, Worksheet } from '../core-internals.js';
import { internals, newStyle, recordView, shapesOf, styleWriter } from '../core-internals.js';
import { activeRanges, activeSheet, topCell } from './base.js';
import { rangeToPixels } from './insert.js';

export type { ClipboardData, ClipCell };

export function copySelection(d: Designer, cut: boolean): ClipboardData | null {
  const sheet = activeSheet(d);
  const range = activeRanges(sheet)[0];
  if (!range) return null;
  const r = Math.max(0, range.row), c = Math.max(0, range.col);
  const rc = range.rowCount < 0 ? sheet.getRowCount() - r : range.rowCount;
  const cc = range.colCount < 0 ? sheet.getColumnCount() - c : range.colCount;
  const cells: ClipCell[][] = [];
  for (let row = 0; row < rc; row++) {
    const line: ClipCell[] = [];
    for (let col = 0; col < cc; col++)
      line.push({ value: sheet.getValue(r + row, c + col), formula: sheet.getFormula(r + row, c + col), style: sheet.getStyle(r + row, c + col) });
    cells.push(line);
  }
  const data: ClipboardData = { cells, cut, sheet, range: { row: r, col: c, rowCount: rc, colCount: cc } };
  d._clipboard = data;
  const text = cells.map((line) => line.map((cell) => cell.formula ? `=${cell.formula}` : String(cell.value ?? '')).join('\t')).join('\n');
  try { void navigator.clipboard?.writeText(text); } catch { /* clipboard permission is optional */ }
  return data;
}

/** Extra Paste Special options: arithmetic operation and the skip-blanks switch. */
export interface PasteOptions { operation?: 'none' | 'add' | 'subtract' | 'multiply' | 'divide'; skipBlanks?: boolean; transpose?: boolean }

/** True for properties that describe a cell border (used by "All except borders"). */
const BORDER_KEY = /^(border|diagonal)/i;

/** Column index to its A1 letter (`0` -> `A`). */
function columnLabel(col: number): string {
  let label = '';
  for (let n = col; ; n = Math.floor(n / 26) - 1) {
    label = String.fromCharCode(65 + (n % 26)) + label;
    if (n < 26) break;
  }
  return label;
}

/** Sheet name as a formula reference quotes it (only names with special characters get quoted). */
function sheetQuote(name: string): string {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name) ? name : `'${name}'`;
}

/** Style properties the trial keeps on top of the materialised record when a Paste command
 *  keeps the SOURCE formatting (TASK 75 r5 `.probe/t75r5/p10.json`: `font`, `locked` and
 *  `hidden` appear there and `themeFont` does not). */
const SOURCE_FORMAT_KEYS = ['font', 'fontSize', 'fontStyle', 'fontWeight', 'fontFamily', 'textDecoration', 'locked', 'hidden'];

/**
 * The style the trial's Paste commands leave in the target cell: the source cell's COMPUTED
 * style materialised as a record — the same shape a Fill writes (defaults `hAlign:3`, `vAlign:0`,
 * `themeFont:"Body"`, `imeMode:1` always appear, an explicit `font` only when it differs from the
 * sheet default), plus the source's own properties. Measured for every Paste Options mode in
 * `.probe/t75r5/p10.json`.
 */
function pasteStyleRecord(sourceSheet: Worksheet, row: number, col: number, sourceFormatting: boolean): Record<string, unknown> {
  const record = { ...(internals(sourceSheet)._fillStyleRecord(row, col) as Record<string, unknown>) };
  if (!sourceFormatting) return record;
  const actual = recordView(sourceSheet.getActualStyle(row, col));
  delete record.themeFont;
  for (const key of SOURCE_FORMAT_KEYS) if (actual[key] !== undefined && actual[key] !== null) record[key] = actual[key];
  return record;
}

/** Writes the materialised record with the source cell's explicit properties merged on top. */
function pasteStyleOnto(targetSheet: Worksheet, sourceSheet: Worksheet, sr: number, sc: number, tr: number, tc: number, sourceFormatting: boolean, dropBorders: boolean, gc: GCRoot): void {
  const record = pasteStyleRecord(sourceSheet, sr, sc, sourceFormatting);
  const raw = recordView(sourceSheet.getStyle(sr, sc));
  if (raw) for (const key of Object.keys(raw)) if (raw[key] !== undefined) record[key] = raw[key];
  // "All except borders" (trial: the materialised record without any border property, and the
  // target's OWN borders stay — TASK 61's paired measurement).
  if (dropBorders) for (const key of Object.keys(record)) if (BORDER_KEY.test(key)) delete record[key];
  const existing = dropBorders ? recordView(targetSheet.getStyle(tr, tc)) : null;
  const style = newStyle(gc);
  Object.assign(style, existing ?? {}, record);
  targetSheet.setStyle(tr, tc, style);
}

/** Copies the allowed properties of `source` on top of the target's own style. */
function mergeStyle(targetSheet: Worksheet, row: number, col: number, source: unknown, keep: (key: string) => boolean): void {
  if (!source) return;
  const sourceStyle = source as Record<string, unknown>;
  const keys = Object.keys(sourceStyle).filter(keep);
  /* Trial (TASK 75 r5): a number-format-only paste of a cell without a formatter leaves NO style
   * record at all — ours materialised an empty `{}`. */
  if (!keys.length) return;
  const existing = targetSheet.getStyle(row, col) as Style | null;
  const merged = existing?.clone?.() ?? new ((source as Style).constructor as new () => Style)();
  const mergedRecord = recordView(merged);
  for (const key of keys) mergedRecord[key] = sourceStyle[key];
  targetSheet.setStyle(row, col, merged);
}

export function pasteClipboard(d: Designer, mode: string, options: PasteOptions = {}): void {
  const sheet = activeSheet(d);
  const source = internals(sheet)._clipboardSource?.();
  if (!source) return;
  const cut = internals(sheet)._clipboardMode?.() === 'cut';
  const wb: Workbook = d.getWorkbook();
  const sourceSheet = wb.sheets.find((item) => item.name() === source.sheetName) ?? sheet;
  const data: ClipboardData = {
    sheet: sourceSheet,
    range: { row: source.row, col: source.col } as SelectionRange,
    cut,
    cells: Array.from({ length: source.rowCount }, (_, row) => Array.from({ length: source.colCount }, (_, col) => ({
      value: sourceSheet.getValue(source.row + row, source.col + col),
      formula: sourceSheet.getFormula(source.row + row, source.col + col),
      style: sourceSheet.getStyle(source.row + row, source.col + col),
    }))),
  };
  const target = topCell(sheet);
  const sourceCells = data.cells;
  const sourceRange = data.range;
  // What each of the context-menu Paste Options modes and the Paste Special dialog writes.
  // Measured on the trial: "Paste Formula" leaves cells without a formula untouched,
  // "Values & Formatting" writes both.
  const withFormat = ['all', 'pasteAll', 'transpose', 'formatting', 'values-format', 'values-sourceformat',
    'formulas-format', 'source-theme', 'no-borders', 'column-widths'].includes(mode);
  const numberFormatOnly = mode === 'values-numberformat' || mode === 'formulas-numberformat';
  /* TASK 75 r5 probe: "Keep Source Formatting", "No Borders" and "Keep Source Column Widths" paste
   * the whole block (values, formulas, styles) — only their style handling differs. */
  const wantValue = ['all', 'pasteAll', 'transpose', 'values', 'values-format', 'values-sourceformat',
    'values-numberformat', 'source-theme', 'no-borders', 'column-widths'].includes(mode);
  const wantFormula = ['all', 'pasteAll', 'transpose', 'formulas', 'formulas-format', 'formulas-numberformat',
    'source-theme', 'no-borders', 'column-widths'].includes(mode);
  const wantComments = mode === 'comments';
  const wantValidation = mode === 'validation';
  const wantWidths = mode === 'column-widths';
  const linkMode = mode === 'links';
  const transpose = mode === 'transpose' || options.transpose === true;
  const operation = options.operation ?? 'none';
  const blank = (value: unknown): boolean => value === null || value === undefined || value === '';
  for (let row = 0; row < sourceCells.length; row++) {
    for (let col = 0; col < sourceCells[row].length; col++) {
      const src = sourceCells[row][col];
      if (options.skipBlanks && blank(src.value) && !src.formula) continue;
      const tr = transpose ? target.row + col : target.row + row;
      const tc = transpose ? target.col + row : target.col + col;
      if (linkMode) {
        /* Trial (TASK 77 probe `.probe/t77/run/t77-paste.json`): Paste Link writes NO values,
         * formulas or styles of its own — every cell of the pasted block becomes a plain formula
         * referencing its source cell (`B5` becomes `=B1`, …). The reference core serialises the
         * block as one shared group (`{si:n}` per cell plus a sheet-level `sharedFormulas` record
         * anchored at the block's top-left); our shared-formula coalescing reproduces that record
         * byte-identically from the per-cell references written here. */
        const sr = source.row + row, sc = source.col + col;
        const ref = columnLabel(sc) + String(sr + 1);
        sheet.setFormula(tr, tc, sourceSheet === sheet ? ref : `${sheetQuote(sourceSheet.name())}!${ref}`);
        continue;
      }
      if (wantComments) {
        const comment = sourceSheet.comments.get(source.row + row, source.col + col);
        if (comment) sheet.comments.add(tr, tc, String(comment.text?.() ?? ''));
        continue;
      }
      if (wantValidation) {
        const validator = sourceSheet.getDataValidator?.(source.row + row, source.col + col);
        if (validator) sheet.setDataValidator?.(tr, tc, validator);
        continue;
      }
      if (wantWidths) {
        // "Keep Source Column Widths" is a full paste plus the column widths (TASK 75 r5 probe).
        if (sourceSheet === sheet) sheet.setColumnWidth(tc, sourceSheet.getColumnWidth(source.col + col));
      }
      let value: unknown = src.value;
      if (wantValue || wantFormula) {
        if (operation !== 'none') {
          const current = Number(sheet.getValue(tr, tc));
          const next = Number(value);
          if (Number.isFinite(current) || !blank(sheet.getValue(tr, tc))) {
            if (operation === 'add') value = current + next;
            else if (operation === 'subtract') value = current - next;
            else if (operation === 'multiply') value = current * next;
            else value = next === 0 ? current : current / next;
          }
        }
        if (wantFormula && src.formula) sheet.setFormula(tr, tc, src.formula);
        else if (wantValue) sheet.setValue(tr, tc, value);
        // Formula-only modes skip cells that carry no formula, like the trial.
      }
      if (numberFormatOnly) mergeStyle(sheet, tr, tc, src.style, (key) => key === 'formatter');
      else if (withFormat)
        pasteStyleOnto(sheet, sourceSheet, source.row + row, source.col + col, tr, tc,
          mode === 'source-theme' || mode === 'values-sourceformat', mode === 'no-borders',
          d.gc);
    }
  }
  if (data.cut && mode !== 'formatting') {
    // Same-sheet cut is a move; keep formulas intact.
    const sr = sourceRange.row, sc = sourceRange.col, src = data.sheet;
    if (src === sheet) {
      for (let row = 0; row < sourceCells.length; row++) for (let col = 0; col < sourceCells[row].length; col++) {
        const tr = target.row + row, tc = target.col + col;
        if (tr === sr + row && tc === sc + col) continue;
        src.setValue(sr + row, sc + col, null);
        styleWriter(src).setStyle(sr + row, sc + col, null);
      }
      internals(sheet)._clipboardClear?.();
    }
  }
  if (transpose) {
    /* Trial (TASK 75 r5 probe `.probe/t75r5/p8.json`, `pasteTranspose`): the transpose paste ends
     * with the PASTED (row/column swapped) block selected, not the copied shape. */
    sheet.setSelection(target.row, target.col, sourceCells[0]?.length ?? 1, sourceCells.length);
  }
}

/**
 * Paste ▸ Linked Picture (TASK 77 probe `.probe/t77/run/t77-paste.json`): the paste changes NO
 * cells and writes no styles — the trial inserts a camera shape named `Picture N` whose reference
 * is the copied SOURCE range in absolute A1 form (`=Data!$B$1:$E$2`), placed at the paste target
 * and sized to the source range's pixel extent. Our core keeps camera shapes in its own flat
 * shape JSON (the recorded core serialization gap every shape-gallery command is compared through
 * the public accessors for), so the inserted shape is behavior-parity, not byte-parity.
 */
export function insertLinkedPicture(d: Designer): void {
  const sheet = activeSheet(d);
  const source = internals(sheet)._clipboardSource?.();
  if (!source) return;
  const wb: Workbook = d.getWorkbook();
  const sourceSheet = wb.sheets.find((item) => item.name() === source.sheetName) ?? sheet;
  const reference = `=${sheetQuote(sourceSheet.name())}!$${columnLabel(source.col)}$${source.row + 1}:$${columnLabel(source.col + source.colCount - 1)}$${source.row + source.rowCount}`;
  const box = rangeToPixels(sourceSheet, { row: source.row, col: source.col, rowCount: source.rowCount, colCount: source.colCount });
  const at = topCell(sheet);
  /* Trial geometry (TASK 77 probes .probe/t77/run/t77-picture.json / t77-picture-anchor.json,
   * measured on both sides): the picture sits 20 px right and 20 px down from the paste target's
   * top-left cell — a constant offset, proven by making the target row 30 px tall: the trial kept
   * y = target top + 20 (its anchor startPoint carries the offset, normalized to the next row at
   * default heights: `{row: at.row + 1, col: at.col, rowOffset: 0, colOffset: 20}` for a 20 px
   * row) — and spans the SOURCE range's pixels plus the 1 px gridline on its right and bottom
   * (source B1:E2 = 248x40 into target B5 gave x=130, y=100, w=249, h=41 on the compare
   * workbook's 110/62 px columns and 20 px rows). Our core keeps camera shapes in its own flat
   * shape JSON (the recorded core serialization gap every shape-gallery command is compared
   * through the public accessors for), so the inserted shape is behavior-parity, not byte-parity. */
  const origin = rangeToPixels(sheet, { row: at.row, col: at.col, rowCount: 1, colCount: 1 });
  const name = shapesOf(sheet).uniqueName(d.nextShapeName('Picture'));
  const shape = shapesOf(sheet).addCameraShape(name, reference, origin.x + 20, origin.y + 20, box.width + 1, box.height + 1);
  /* Trial answer of `allowResize()` on this shape is the numeric 0 (not `false`), and the shape
   * serializes it as such; the designer writes the trial's own value (core stores it verbatim). */
  shape.allowResize(0);
  d.invalidate();
}
