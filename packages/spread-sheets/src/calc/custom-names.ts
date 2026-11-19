/**
 * Validation rules of a custom name (`Worksheet.addCustomName` /
 * `Workbook.addCustomName`).
 *
 * Every rule below is what the official 19.2.5 trial answers for the same
 * public call: it rejects the name and throws `invalid custom name` for names
 * that are empty, contain a space or one of `# ( ) * + , - / : ; = [ ] ! $`,
 * start with a digit, read as an A1-style cell reference (`N1`, `C1`, `ABS1`,
 * `Z9`, `AM1`, `R1C1`-style `R1`, `R1C`, `R1C1`, `RC`, `RC1`) or are an empty
 * expression. Letters-only names (`ABS`, `ABC`, `MYA`), longer names with digits
 * (`NAME1`, `MYNAME2`, `MY2NAME`), names with `_`, `.`, `\` or `?`
 * (`UNDER_NAME`, `MY.NAME`, `MY\NAME`, `MY?NAME`), `A0` (row 0 is not a cell
 * reference) and references beyond the grid (`XFE1`, `Z9999999`) are accepted;
 * `A1_`, `A1B`, `B1A`, `C1R1`, `R1C1X`, `R2C3D4` are accepted because they do
 * not read as a reference.
 *
 * Probe: `.probe/api-sweep-probe.mjs`, reports `.probe/report-item4n.json`,
 * `.probe/report-item4o.json`, `.probe/report-item4q.json`.
 */
import { parseFormula } from './parser.js';

/** First character must be a letter or an underscore; the rest of these plus `_ . ? \`. */
const CUSTOM_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_.?\\]*$/;
/** `1-3 letters` followed by a row number: an A1-style reference. */
const CELL_REFERENCE_PATTERN = /^([A-Za-z]{1,3})([1-9][0-9]*)$/;
/** R1C1-style references: `R1`, `R1C`, `R1C1`, `RC`, `RC1`, `C1` (the last through the cell rule). */
const R1C1_REFERENCE_PATTERN = /^R([1-9][0-9]*)?C([1-9][0-9]*)?$|^R[1-9][0-9]*$|^RC[1-9][0-9]*$/;

/** `true` when the letters name a column of the grid (`AAA`..`XFD`). */
function isGridColumn(letters: string): boolean {
  const upper = letters.toUpperCase();
  return upper.length < 3 || upper <= 'XFD';
}

/** The trial's own wording for a rejected name. */
export const INVALID_CUSTOM_NAME = 'invalid custom name';
const INVALID_NAME = INVALID_CUSTOM_NAME;

/**
 * Throws `invalid custom name` the way the trial does. `formula` is the stored
 * expression; an empty one is rejected too.
 */
export function assertCustomName(name: unknown, formula: unknown): void {
  if (typeof name !== 'string' || !CUSTOM_NAME_PATTERN.test(name)) throw new Error(INVALID_NAME);
  const cellLike = CELL_REFERENCE_PATTERN.exec(name);
  if (cellLike && isGridColumn(cellLike[1]!)) throw new Error(INVALID_NAME);
  if (R1C1_REFERENCE_PATTERN.test(name.toUpperCase())) throw new Error(INVALID_NAME);
  if (typeof formula !== 'string' || formula.replace(/^=/, '').trim() === '') throw new Error(INVALID_NAME);
}

/**
 * Parses the expression of a custom name. The trial builds the expression when
 * the name is added and fails there for an expression it cannot parse
 * (`1+(`), so the failure is reported at `addCustomName` time here as well.
 */
export function assertNameFormula(formula: string, r1c1 = false): void {
  try {
    parseFormula(formula, { r1c1 });
  } catch {
    throw new Error(INVALID_NAME);
  }
}
