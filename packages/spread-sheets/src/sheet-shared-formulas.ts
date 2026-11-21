/**
 * Shared-formula serialisation (trial JSON parity, TASK 75).
 *
 * The reference core coalesces formula cells that share the same *relative*
 * reference pattern when it serialises a sheet: every member cell stores
 * `{"si": n}` and the group (anchored at the top-left member) lives in the
 * sheet-level `sharedFormulas` record with its bounding box. Cells whose
 * formula cannot be parsed, array formulas and patterns used by a single cell
 * stay plain strings. `fromJSON` materialises the members back to concrete
 * formula text by translating the group's references to each cell position.
 */
import { astToText, parseFormula, translateRefs } from './calc/parser.js';
import type { JsonRecord } from './serialization.js';

/* Translating relative refs into a canonical pattern must stay in positive
 * coordinate space for any sheet position, so shift by a large constant. */
const SHIFT = 4_000_000;

function canonicalPattern(text: string, row: number, col: number): string | null {
  try {
    return astToText(translateRefs(parseFormula(text), SHIFT - row, SHIFT - col));
  } catch {
    return null;
  }
}

/** Expand one shared-formula group member for cell `(row, col)`. */
export function expandSharedFormula(
  text: string,
  baseRow: number,
  baseColumn: number,
  row: number,
  col: number,
): string | null {
  try {
    return astToText(translateRefs(parseFormula(text), row - baseRow, col - baseColumn));
  } catch {
    return null;
  }
}

/**
 * Rewrite the serialised `dataTable` in place: group equal relative patterns
 * and return the sheet's `sharedFormulas` record, or `undefined` when no
 * group has two or more members.
 */
export function coalesceSharedFormulas(table: JsonRecord): JsonRecord | undefined {
  interface Group {
    text: string;
    baseRow: number;
    baseColumn: number;
    lastRow: number;
    lastColumn: number;
    cells: { row: number; col: number }[];
  }
  const groups = new Map<string, Group>();
  const rowKeys = Object.keys(table).sort((a, b) => Number(a) - Number(b));
  for (const r of rowKeys) {
    const rowNode = table[r] as JsonRecord | undefined;
    if (!rowNode) continue;
    for (const c of Object.keys(rowNode).sort((x, y) => Number(x) - Number(y))) {
      const node = rowNode[c] as JsonRecord | undefined;
      if (!node || typeof node.formula !== 'string' || node.arrayInfo) continue;
      const pattern = canonicalPattern(node.formula, Number(r), Number(c));
      if (pattern === null) continue;
      let group = groups.get(pattern);
      if (!group)
        groups.set(pattern, (group = {
          text: node.formula,
          baseRow: Number(r),
          baseColumn: Number(c),
          lastRow: Number(r),
          lastColumn: Number(c),
          cells: [],
        }));
      group.cells.push({ row: Number(r), col: Number(c) });
      group.lastRow = Math.max(group.lastRow, Number(r));
      group.lastColumn = Math.max(group.lastColumn, Number(c));
    }
  }
  let shared: JsonRecord | undefined;
  let si = 0;
  for (const group of groups.values()) {
    if (group.cells.length < 2) continue;
    shared ??= {};
    for (const cell of group.cells) {
      const rowNode = table[String(cell.row)] as JsonRecord;
      (rowNode[String(cell.col)] as JsonRecord).formula = { si };
    }
    shared[String(si)] = {
      formula: group.text,
      baseRow: group.baseRow,
      baseColumn: group.baseColumn,
      lastRow: group.lastRow,
      lastColumn: group.lastColumn,
    };
    si += 1;
  }
  if (shared) shared.nextIndex = si;
  return shared;
}
