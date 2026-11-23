/**
 * Formula introspection over the dependency graph: the ranges a formula reads
 * (`Worksheet.getPrecedents`), the formula cells that read one cell
 * (`Worksheet.getDependents`), the stored formula text
 * (`Worksheet.getFormulaInformation`) and the cells caught in a calculation
 * cycle (`Workbook.getCircularReference`).
 *
 * The returned records match the shape and order the official 19.2.5 trial
 * answers with the same public calls (see docs/STATUS.md, task 38 item 4).
 */
import type { Worksheet } from '../model.js';
import type { AstNode, NameNode, RefNode } from './parser.js';
import { collectRefs, localizeFormulaText, translateRefs } from './parser.js';
import { getActiveCalcLanguagePackage } from './language-packages.js';
import { forEachIndexEntry } from './engine-deps.js';
import type { CalcEngine, FormulaCell } from './engine.js';

/** Public `GC.Spread.Sheets.ICellsInfo` record. */
export interface CellsInfo {
  row: number;
  col: number;
  rowCount: number;
  colCount: number;
  sheetName: string;
}

/** Public `GC.Spread.Sheets.IFormulaInfo` record. */
export interface FormulaInfo {
  hasFormula?: boolean;
  baseRange?: { row: number; col: number; rowCount: number; colCount: number };
  isArrayFormula?: boolean;
  formula?: string;
  formulaWithCulture?: string;
  isDynamicArray?: boolean;
}

/** A whole-column or whole-row reference has no finite row/column extent. */
const WHOLE = -1;

function isInside(sheet: Worksheet, row: number, col: number): boolean {
  return row >= 0 && col >= 0 && row < sheet.getRowCount() && col < sheet.getColumnCount();
}

export function formulaCellAt(engine: CalcEngine, sheet: Worksheet, row: number, col: number): FormulaCell | undefined {
  if (!isInside(sheet, row, col)) return undefined;
  return engine.formulas.get(engine.key(sheet, row, col));
}

/** One collected reference, before it is turned into a public record. */
interface Collected {
  sheet: Worksheet | string;
  r1: number;
  c1: number;
  r2: number;
  c2: number;
  /** The reference covers whole rows (columns) of the sheet. */
  rows: boolean;
  cols: boolean;
}

/**
 * Collects every range a formula reads, in source order.
 *
 * Named ranges are resolved against the cell that uses them (a name stores its
 * expression relative to the position it was declared at and is re-based at
 * each use), structured (`Table1[Column]`) references resolve to their table
 * areas, and whole-column/whole-row references report the `-1` extent the trial
 * uses instead of the sheet's row and column counts.
 */
export function precedentsOf(engine: CalcEngine, sheet: Worksheet, row: number, col: number): CellsInfo[] {
  const cell = formulaCellAt(engine, sheet, row, col);
  if (!cell) return [];
  const found: Collected[] = [];
  const seen = new Set<string>();
  const nameOf = (target: Worksheet | string): string => (typeof target === 'string' ? target : target.name());
  const add = (item: Collected): void => {
    let { r1, c1, r2, c2 } = item;
    if (r1 > r2) [r1, r2] = [r2, r1];
    if (c1 > c2) [c1, c2] = [c2, c1];
    if (r1 === WHOLE && r2 !== WHOLE) r2 = WHOLE;
    if (c1 === WHOLE && c2 !== WHOLE) c2 = WHOLE;
    const key = `${nameOf(item.sheet)}:${r1}:${c1}:${r2}:${c2}`;
    if (seen.has(key)) return;
    seen.add(key);
    found.push({ ...item, r1, c1, r2, c2 });
  };
  const refNode = (node: RefNode): void => {
    let target: Worksheet | string = cell.sheet;
    if (node.external) {
      // The trial names an external precedent after the workbook it lives in:
      // `[Book1.xlsx]Sheet1`.
      const workbook = node.external.path
        ? `[${node.external.path}[${node.external.name}]]`
        : `[${node.external.name}]`;
      target = `${workbook}${node.external.sheet}`;
    } else if (node.sheet) {
      const other = engine.sheetFromName(node.sheet);
      target = other ?? node.sheet;
    }
    const rows = Boolean(node.wholeCol || node.colOnly);
    const cols = Boolean(node.wholeRow || node.rowOnly);
    let r1 = rows ? WHOLE : node.r1;
    let c1 = cols ? WHOLE : node.c1;
    let r2 = rows ? WHOLE : node.r2;
    let c2 = cols ? WHOLE : node.c2;
    if (!rows && !cols) {
      // A reference that reaches outside the grid (`A0:A2`) contributes only its
      // valid endpoint, the way the trial lists it.
      const startValid = r1 >= 0 && c1 >= 0;
      const endValid = r2 >= 0 && c2 >= 0;
      if (!startValid && !endValid) return;
      if (!startValid) {
        r1 = r2;
        c1 = c2;
      } else if (!endValid) {
        r2 = r1;
        c2 = c1;
      }
    }
    add({
      sheet: target,
      r1,
      c1,
      r2,
      c2,
      rows,
      cols,
    });
  };
  const nameNode = (node: NameNode): void => {
    if (engine.isLocalVar(cell.ast, node.name)) return;
    const context = node.sheet ? (engine.sheetFromName(node.sheet) ?? cell.sheet) : cell.sheet;
    const info = engine.resolveName(node.name, context);
    if (!info) return;
    const ast = engine.isR1C1() ? info.ast : translateRefs(info.ast, cell.row - info.baseRow, cell.col - info.baseCol);
    for (const item of collectRefs(ast)) refNode(item);
  };
  const walk = (node: AstNode, operand = false): void => {
    switch (node.kind) {
      case 'ref':
        // The trial does not report a multi-cell range that a formula *uses as a
        // value* (`=A1:C3`, `=A1:C3*2`, `=-(A1:C3)`): the reference is consumed by
        // the implicit array, not read as a precedent. A range passed to a
        // function, or one side of a union or intersection, is reported.
        if (operand && !node.wholeCol && !node.wholeRow && !node.colOnly && !node.rowOnly && (node.r2 > node.r1 || node.c2 > node.c1))
          return;
        refNode(node);
        break;
      case 'name':
        nameNode(node);
        break;
      case 'structured': {
        const areas = engine.resolveStructuredAreas(node.table, node.spec, cell.sheet, cell.row, cell.col);
        for (const area of areas ?? []) add({ sheet: area.sheet, r1: area.r1, c1: area.c1, r2: area.r2, c2: area.c2, rows: false, cols: false });
        break;
      }
      case 'range':
        walk(node.start, operand);
        walk(node.end, operand);
        break;
      case 'union':
        for (const part of node.parts) walk(part, false);
        break;
      case 'intersect':
        walk(node.left, false);
        walk(node.right, false);
        break;
      case 'binary':
        walk(node.left, true);
        walk(node.right, true);
        break;
      case 'unary':
      case 'percent':
        walk(node.operand, true);
        break;
      case 'paren':
        walk(node.inner, operand);
        break;
      case 'function':
        for (const arg of node.args) walk(arg, false);
        break;
      case 'array':
        for (const item of node.rows) for (const value of item) walk(value, false);
        break;
      case 'spill':
        walk(node.ref, operand);
        break;
      case 'call':
        walk(node.callee, operand);
        for (const arg of node.args) walk(arg, false);
        break;
      default:
        break;
    }
  };
  walk(cell.ast, true);
  return found.map((item) => ({
    row: item.rows ? WHOLE : item.r1,
    col: item.cols ? WHOLE : item.c1,
    rowCount: item.rows ? WHOLE : item.r2 - item.r1 + 1,
    colCount: item.cols ? WHOLE : item.c2 - item.c1 + 1,
    sheetName: nameOf(item.sheet),
  }));
}

/**
 * Every formula cell that reads the given cell.
 *
 * The trial lists the cells that name it directly (`=A1*2`, `=A1#`) first, in
 * the order their formulas were registered, and then the cells that read it
 * through a range (`=SUM(A1:B2)`, `=SUM(A:A)`), again in registration order.
 * Row or column `-1` selects the whole column or row, the same wildcard the
 * trial answers for those arguments.
 */
export function dependentsOfCell(engine: CalcEngine, sheet: Worksheet, row: number, col: number): CellsInfo[] {
  // The trial writes a whole-column reference with row `-1` and a whole-row
  // reference with column `-1`, so `getDependents(-1, c)` means "every formula
  // that reads the whole column c" and `getDependents(r, -1)` the row version.
  const queryWholeColumn = row === WHOLE;
  const queryWholeRow = col === WHOLE;
  if (!queryWholeColumn && (row < 0 || row >= sheet.getRowCount())) return [];
  if (!queryWholeRow && (col < 0 || col >= sheet.getColumnCount())) return [];
  const key = engine.key(sheet, row, col);
  const out: CellsInfo[] = [];
  const seen = new Set<string>();
  const push = (formulaKey: string): void => {
    if (seen.has(formulaKey)) return;
    const cell = engine.formulas.get(formulaKey);
    if (!cell) return;
    seen.add(formulaKey);
    out.push({ row: cell.row, col: cell.col, rowCount: 1, colCount: 1, sheetName: cell.sheet.name() });
  };
  // 1. Direct single-cell references, in registration order. A link that comes
  // from a defined name is registered with the coordinates the name resolves to
  // at the cell that uses it, so the trial's `getDependents` result appears
  // here without extra filtering.
  const direct = engine.cellDependents.get(key);
  forEachIndexEntry(direct, push);
  if (queryWholeColumn || queryWholeRow) {
    // Only formulas whose reference covers the whole column (or row) match.
    const sheetIdForQuery = engine.sheetId(sheet);
    const matches: { order: number; index: number; key: string }[] = [];
    for (const [id, entry] of engine.rangeEntries) {
      if (entry.sheetId !== sheetIdForQuery || !entry.whole) continue;
      if (queryWholeColumn && !queryWholeRow) {
        if (entry.whole !== 'col' || entry.c1 > col || entry.c2 < col) continue;
      } else if (queryWholeRow && !queryWholeColumn) {
        if (entry.whole !== 'row' || entry.r1 > row || entry.r2 < row) continue;
      } else continue;
      const owner = engine.formulas.get(entry.key);
      if (!owner) continue;
      matches.push({ order: owner.order, index: Number(id.slice(entry.key.length + 1)), key: owner.key });
    }
    matches.sort((a, b) => a.order - b.order || a.index - b.index);
    for (const item of matches) push(item.key);
    return out;
  }
  // 2. Range references, ordered by the registration order of their formula.
  const sheetId = engine.sheetId(sheet);
  const entries = new Map<string, { order: number; index: number; key: string }>();
  const collect = (candidate: { id: string; key: string; r1: number; c1: number; r2: number; c2: number } | undefined): void => {
    if (!candidate) return;
    if (candidate.r1 > row || candidate.r2 < row || candidate.c1 > col || candidate.c2 < col) return;
    const formula = engine.formulas.get(candidate.key);
    if (!formula) return;
    const index = Number(candidate.id.slice(candidate.key.length + 1));
    entries.set(candidate.id, { order: formula.order, index, key: candidate.key });
  };
  for (const entry of engine.columnRanges.get(sheetId)?.get(col) ?? []) collect(entry);
  for (const entry of engine.singleRowRanges.get(sheetId)?.get(row) ?? []) collect(entry);
  for (const entry of engine.rowBuckets.get(sheetId)?.get(Math.floor(row / 64)) ?? []) collect(entry);
  for (const entry of engine.longRanges.get(sheetId) ?? []) collect(entry);
  const ordered = [...entries.values()].sort((a, b) => a.order - b.order || a.index - b.index);
  for (const entry of ordered) push(entry.key);
  return out;
}

/**
 * The stored formula of a cell, in the key order the trial emits. A cell
 * without a formula yields an empty object: the trial leaves every declared
 * field `undefined` there.
 */
export function formulaInformationOf(
  engine: CalcEngine,
  sheet: Worksheet,
  row: number,
  col: number,
  storedFormula?: string | null,
): FormulaInfo {
  const info: FormulaInfo = {};
  const cell = formulaCellAt(engine, sheet, row, col);
  const text = cell ? cell.text : storedFormula !== undefined && storedFormula !== null ? storedFormula : null;
  if (text === null) return info;
  info.hasFormula = true;
  info.isArrayFormula = Boolean(sheet._arrayFormula(row, col));
  info.formula = text;
  // TASK 89: the engine's official slot for the localized display form.
  info.formulaWithCulture = localizeFormulaText(text, getActiveCalcLanguagePackage(), engine.isR1C1());
  const spill = cell?.spill;
  if (spill && engine.allowDynamicArray()) {
    info.isDynamicArray = true;
    info.baseRange = { row, col, rowCount: spill.rowCount, colCount: spill.colCount };
  }
  return info;
}

/**
 * Cells that take part in a calculation cycle, ordered the way the trial lists
 * them: sheet order, then row, then column.
 */
export function circularReferences(engine: CalcEngine): CellsInfo[] {
  const cells: FormulaCell[] = [];
  for (const key of engine.cycleCells) {
    const cell = engine.formulas.get(key);
    if (cell) cells.push(cell);
  }
  const workbook = engine.workbook;
  cells.sort((a, b) => {
    const sheetDelta = workbook.getSheetIndex(a.sheet.name()) - workbook.getSheetIndex(b.sheet.name());
    return sheetDelta || a.row - b.row || a.col - b.col;
  });
  return cells.map((cell) => ({
    row: cell.row,
    col: cell.col,
    rowCount: 1,
    colCount: 1,
    sheetName: cell.sheet.name(),
  }));
}
