/**
 * Dependency-graph bookkeeping of the calculation engine: formula
 * install/remove, range/name/table dependency registration, volatility
 * detection, dirty collection and the structural-change ref adjustments.
 * Bodies moved out of `calc/engine.ts` unchanged (`this` renamed to the
 * `engine` parameter); the class keeps thin delegating methods.
 */

import type { Worksheet } from '../worksheet.js';



const BUCKET = 64;
const LONG_RANGE_ROWS = 8192;
import type { AstNode, RefNode } from './parser.js';
import { adjustRefsForStructure, astToText, moveRefsForRange, parseFormula, translateRefs } from './parser.js';
import type { CalcFunction } from './functions-api.js';
import type { CalcEngine, Change, FormulaCell, RangeDep, RangeEntry } from './engine.js';

export function registerNameDependencies(engine: CalcEngine, cell: FormulaCell, node: AstNode): void {
    const check = (name: string, sheet: Worksheet): void => {
      const info = engine.resolveName(name, sheet);
      if (!info) return;
      // A name stores its expression relative to the position it was declared at
      // and is re-based at every use. Both the evaluation (`Evaluator.evaluateName`)
      // and the dependency graph use the same re-based coordinates, which is what
      // the trial reports: an absolute name keeps its fixed range and is listed by
      // `getDependents` for the cells inside it, while a relative name only covers
      // the range around the cell that uses it (probe item `dep-name-mixed`).
      const r1c1 = engine.isR1C1();
      const ast = r1c1 ? info.ast : translateRefs(info.ast, cell.row - info.baseRow, cell.col - info.baseCol);
      // In R1C1 mode the parsed coordinates are offsets, so the re-basing happens
      // through the origin: the cell that uses the name.
      const originRow = r1c1 ? cell.row : undefined;
      const originCol = r1c1 ? cell.col : undefined;
      engine.registerNameRefs(cell, ast, originRow, originCol);
    };
    const walk = (current: AstNode): void => {
      switch (current.kind) {
        case 'name':
          if (!engine.isLocalVar(cell.ast, current.name)) {
            const sheet = current.sheet ? (engine.sheetFromName(current.sheet) ?? cell.sheet) : cell.sheet;
            check(current.name, sheet);
          }
          break;
        case 'binary':
          walk(current.left);
          walk(current.right);
          break;
        case 'unary':
        case 'percent':
          walk(current.operand);
          break;
        case 'paren':
          walk(current.inner);
          break;
        case 'range':
          walk(current.start);
          walk(current.end);
          break;
        case 'union':
          for (const part of current.parts) walk(part);
          break;
        case 'intersect':
          walk(current.left);
          walk(current.right);
          break;
        case 'function':
          for (const arg of current.args) walk(arg);
          break;
        case 'array':
          for (const row of current.rows) for (const value of row) walk(value);
          break;
        case 'spill':
          walk(current.ref);
          break;
        case 'call':
          walk(current.callee);
          for (const arg of current.args) walk(arg);
          break;
        default:
          break;
      }
    };
    walk(node);
}

export function isLocalVar(engine: CalcEngine, ast: AstNode, name: string): boolean {
    const upper = name.toUpperCase();
    const visit = (node: AstNode): boolean => {
      if (node.kind === 'function' && (node.name === 'LET' || node.name === 'LAMBDA')) {
        if (node.name === 'LET') {
          for (let i = 0; i + 1 < node.args.length; i += 2) {
            const first = node.args[i]!;
            if (first.kind === 'name' && first.name.toUpperCase() === upper) return true;
          }
          return node.args.some(visit);
        }
        for (let i = 0; i < node.args.length - 1; i++) {
          const param = node.args[i]!;
          if (param.kind === 'name' && param.name.toUpperCase() === upper) return true;
        }
        return false;
      }
      switch (node.kind) {
        case 'binary':
          return visit(node.left) || visit(node.right);
        case 'unary':
        case 'percent':
          return visit(node.operand);
        case 'paren':
          return visit(node.inner);
        case 'range':
          return visit(node.start) || visit(node.end);
        case 'union':
          return node.parts.some(visit);
        case 'intersect':
          return visit(node.left) || visit(node.right);
        case 'array':
          return node.rows.some((row) => row.some(visit));
        case 'spill':
          return visit(node.ref);
        case 'call':
          return visit(node.callee) || node.args.some(visit);
        default:
          return false;
      }
    };
    return visit(ast);
}

/** Function names that always re-evaluate (the trial's volatility list). */
const VOLATILE_FUNCTION_NAMES = ['NOW', 'TODAY', 'RAND', 'RANDBETWEEN', 'RANDARRAY', 'OFFSET', 'INDIRECT', 'CELL', 'INFO'];

export function isVolatileAst(engine: CalcEngine, ast: AstNode, sheet: Worksheet): boolean {
    const visit = (node: AstNode): boolean => {
      switch (node.kind) {
        case 'function': {
          const name = node.name.replace(/^_XLFN\./, '');
          if (VOLATILE_FUNCTION_NAMES.includes(name)) return true;
          const custom = engine.getCustomFunction(name, sheet);
          if (custom?.isVolatile?.()) return true;
          return node.args.some(visit);
        }
        case 'binary':
          return visit(node.left) || visit(node.right);
        case 'unary':
        case 'percent':
          return visit(node.operand);
        case 'paren':
          return visit(node.inner);
        case 'range':
          return visit(node.start) || visit(node.end);
        case 'union':
          return node.parts.some(visit);
        case 'intersect':
          return visit(node.left) || visit(node.right);
        case 'array':
          return node.rows.some((row) => row.some(visit));
        case 'spill':
          return visit(node.ref);
        case 'call':
          return visit(node.callee) || node.args.some(visit);
        default:
          return false;
      }
    };
    return visit(ast);
}

export function addRangeDependency(
  engine: CalcEngine,
  cell: FormulaCell,
  sheet: Worksheet,
  r1: number,
  c1: number,
  r2: number,
  c2: number,
  whole?: 'col' | 'row',
): void {
    const ownId = engine.sheetId(sheet);
    if (r1 > r2) [r1, r2] = [r2, r1];
    if (c1 > c2) [c1, c2] = [c2, c1];
    if (r1 === r2 && c1 === c2 && !whole) {
      engine.addCellDependency(cell, engine.keyFor(ownId, r1, c1));
      return;
    }
    const dep: RangeDep = { sheetId: ownId, r1, c1, r2, c2 };
    if (whole) dep.whole = whole;
    cell.rangeDeps.push(dep);
    const index = cell.rangeDeps.length - 1;
    const entry: RangeEntry = {
      ...dep,
      id: `${cell.key}|${index}`,
      key: cell.key,
      long: r2 - r1 + 1 > LONG_RANGE_ROWS,
    };
    engine.rangeEntries.set(entry.id, entry);
    if (r1 === r2) {
      let rows = engine.singleRowRanges.get(ownId);
      if (!rows) engine.singleRowRanges.set(ownId, (rows = new Map()));
      let set = rows.get(r1);
      if (!set) rows.set(r1, (set = new Set()));
      set.add(entry);
    } else if (c1 === c2) {
      let columns = engine.columnRanges.get(ownId);
      if (!columns) engine.columnRanges.set(ownId, (columns = new Map()));
      let set = columns.get(c1);
      if (!set) columns.set(c1, (set = new Set()));
      set.add(entry);
    } else if (entry.long) engine.longRanges.get(ownId)!.push(entry);
    else {
      const buckets = engine.rowBuckets.get(ownId)!;
      for (let row = r1; row <= r2; row += BUCKET) {
        const bucket = Math.floor(row / BUCKET);
        let set = buckets.get(bucket);
        if (!set) buckets.set(bucket, (set = new Set()));
        set.add(entry);
      }
    }
}

export function registerRef(engine: CalcEngine, cell: FormulaCell, node: RefNode, baseRow?: number, baseCol?: number): void {
    if (node.external) {
      engine.registerExternalReference(cell, node);
      return;
    }
    let sheet = cell.sheet;
    if (node.sheet) {
      const found = engine.sheetFromName(node.sheet);
      if (!found) return;
      sheet = found;
    }
    const r1c1 = engine.isR1C1();
    const originRow = baseRow ?? cell.row;
    const originCol = baseCol ?? cell.col;
    let r1 = node.r1Rel && r1c1 ? originRow + node.r1 : node.r1;
    let c1 = node.c1Rel && r1c1 ? originCol + node.c1 : node.c1;
    let r2 = node.r2Rel && r1c1 ? originRow + node.r2 : node.r2;
    let c2 = node.c2Rel && r1c1 ? originCol + node.c2 : node.c2;
    if (node.wholeRow) {
      c1 = 0;
      c2 = Math.max(0, sheet.getColumnCount() - 1);
    } else if (node.wholeCol) {
      r1 = 0;
      r2 = Math.max(0, sheet.getRowCount() - 1);
    } else if (node.rowOnly) {
      c1 = 0;
      c2 = Math.max(0, sheet.getColumnCount() - 1);
    } else if (node.colOnly) {
      r1 = 0;
      r2 = Math.max(0, sheet.getRowCount() - 1);
    }
    if (r1 > r2) [r1, r2] = [r2, r1];
    if (c1 > c2) [c1, c2] = [c2, c1];
    if (r1 < 0 || c1 < 0) return;
    const whole = node.wholeCol || node.colOnly ? 'col' : node.wholeRow || node.rowOnly ? 'row' : undefined;
    engine.addRangeDependency(cell, sheet, r1, c1, r2, c2, whole);
}

export function indexFormula(engine: CalcEngine, sheetId: number, row: number, col: number, key: string): void {
    // Inlined single-slot index insert (hot in bulk formula registration).
    let columns = engine.formulaColumns.get(sheetId);
    if (!columns) engine.formulaColumns.set(sheetId, (columns = new Map()));
    const existingCol = columns.get(col);
    if (existingCol === undefined) columns.set(col, key);
    else if (typeof existingCol === 'string') {
      if (existingCol !== key) columns.set(col, new Set([existingCol, key]));
    } else existingCol.add(key);
    let rows = engine.formulaRows.get(sheetId);
    if (!rows) engine.formulaRows.set(sheetId, (rows = new Map()));
    const existingRow = rows.get(row);
    if (existingRow === undefined) rows.set(row, key);
    else if (typeof existingRow === 'string') {
      if (existingRow !== key) rows.set(row, new Set([existingRow, key]));
    } else existingRow.add(key);
}

export function unindexFormula(engine: CalcEngine, sheetId: number, row: number, col: number, key: string): void {
    removeFromIndex(engine.formulaColumns.get(sheetId), col, key);
    removeFromIndex(engine.formulaRows.get(sheetId), row, key);
}

function removeFromIndex(index: Map<number, string | Set<string>> | undefined, slot: number, key: string): void {
    if (!index) return;
    const existing = index.get(slot);
    if (existing === undefined) return;
    if (typeof existing === 'string') {
      if (existing === key) index.delete(slot);
      return;
    }
    existing.delete(key);
    if (existing.size === 1) {
      const [only] = existing;
      index.set(slot, only!);
    } else if (!existing.size) index.delete(slot);
}

/**
 * Iterates one slot of a `string | Set<string>` index. A lone key is stored as
 * the plain string; a naive `for..of` over that union would iterate its
 * characters, so every consumer goes through here.
 */
export function forEachIndexEntry(entry: string | Set<string> | undefined, visit: (key: string) => void): void {
    if (entry === undefined) return;
    if (typeof entry === 'string') visit(entry);
    else for (const key of entry) visit(key);
}

export function installFormula(engine: CalcEngine,
    sheet: Worksheet,
    row: number,
    col: number,
    ast: AstNode,
    text: string,
    preserveValue: boolean,
    key?: string,
  ): void {
    key ??= engine.key(sheet, row, col);
    engine.graphVersion++;
    const cell: FormulaCell = {
      key,
      sheet,
      row,
      col,
      ast,
      text,
      order: ++engine.orderCounter,
      value: preserveValue ? engine.getCellValue(sheet, row, col) : null,
      volatile: engine.isVolatileAst(ast, sheet),
      cellDeps: [],
      rangeDeps: [],
    };
    engine.formulas.set(key, cell);
    const sheetId = engine.sheetId(sheet);
    engine.bySheet.get(sheetId)!.set(`${row}:${col}`, cell);
    engine.indexFormula(sheetId, row, col, key);
    engine.registerDependencies(cell);
    engine.bindCustomFunctions(cell);
    if (cell.volatile) engine.volatileCells.add(key);
    else engine.volatileCells.delete(key);
}

/**
 * Records the user-registered functions this formula resolves *now*, so the
 * cell keeps evaluating with them after `removeCustomFunction` or
 * `clearCustomFunctions` (the trial caches the parsed model; only a re-parsed
 * formula - a new `setFormula` or `calculate(CalculationType.rebuild)` - starts
 * answering `#NAME?` for the removed name).
 */
export function bindCustomFunctions(engine: CalcEngine, cell: FormulaCell): void {
    let names: Set<string> | undefined;
    const walk = (node: AstNode): void => {
        switch (node.kind) {
            case 'function':
                (names ??= new Set<string>()).add(node.name.startsWith('_XLFN.') ? node.name.slice(6) : node.name);
                for (const arg of node.args) walk(arg);
                break;
            case 'range':
                walk(node.start);
                walk(node.end);
                break;
            case 'union':
                for (const part of node.parts) walk(part);
                break;
            case 'intersect':
            case 'binary':
                walk(node.left);
                walk(node.right);
                break;
            case 'unary':
            case 'percent':
                walk(node.operand);
                break;
            case 'paren':
                walk(node.inner);
                break;
            case 'array':
                for (const rowNodes of node.rows) for (const item of rowNodes) walk(item);
                break;
            case 'spill':
                walk(node.ref);
                break;
            case 'call':
                walk(node.callee);
                for (const arg of node.args) walk(arg);
                break;
            default:
                break;
        }
    };
    walk(cell.ast);
    if (!names?.size) return;
    const bound = new Map<string, CalcFunction>();
    for (const name of names) {
        const fn = engine.getRegisteredFunction(name, cell.sheet);
        if (fn) bound.set(name.toUpperCase(), fn);
    }
    if (bound.size) cell.customs = bound;
}

export function registerExistingFormula(engine: CalcEngine, sheet: Worksheet, row: number, col: number, formula: string): void {
    const key = engine.key(sheet, row, col);
    engine.removeFormula(key);
    const text = formula.replace(/^=/, '');
    try {
      const ast = engine.compile(text);
      engine.installFormula(sheet, row, col, ast, text, true);
    } catch {
      // Invalid imported formula: keep its text but do not calculate it.
    }
}

export function registerStoredFormula(engine: CalcEngine, sheet: Worksheet, row: number, col: number, formula: string): void {
    const text = formula.replace(/^=/, '');
    let ast: AstNode | undefined;
    try {
      ast = engine.compile(text);
    } catch {
      ast = undefined;
    }
    if (ast) engine.installFormula(sheet, row, col, ast, text, true);
}

export function removeFormula(engine: CalcEngine, key: string): void {
    const cell = engine.formulas.get(key);
    if (!cell) return;
    // Only a real removal changes the graph; bumping `graphVersion` here
    // invalidates the `upstream` cache and the cycle scan, so a no-op removal
    // (the usual `setFormula` into an empty cell) must leave them intact.
    engine.graphVersion++;
    engine.formulas.delete(key);
    const sheetId = engine.sheetId(cell.sheet);
    engine.bySheet.get(sheetId)?.delete(`${cell.row}:${cell.col}`);
    engine.unindexFormula(sheetId, cell.row, cell.col, key);
    for (const dep of cell.cellDeps) {
      const existing = engine.cellDependents.get(dep);
      if (existing === undefined) continue;
      if (typeof existing === 'string') {
        if (existing === key) engine.cellDependents.delete(dep);
        continue;
      }
      existing.delete(key);
      if (existing.size === 1) {
        const [only] = existing;
        engine.cellDependents.set(dep, only!);
      } else if (!existing.size) engine.cellDependents.delete(dep);
    }
    for (let index = 0; index < cell.rangeDeps.length; index++) {
      const id = `${key}|${index}`;
      const entry = engine.rangeEntries.get(id);
      engine.rangeEntries.delete(id);
      if (!entry) continue;
      if (entry.r1 === entry.r2) engine.singleRowRanges.get(entry.sheetId)?.get(entry.r1)?.delete(entry);
      else if (entry.c1 === entry.c2) engine.columnRanges.get(entry.sheetId)?.get(entry.c1)?.delete(entry);
      else if (entry.long) {
        const list = engine.longRanges.get(entry.sheetId)!;
        const position = list.indexOf(entry);
        if (position >= 0) list.splice(position, 1);
      } else {
        const buckets = engine.rowBuckets.get(entry.sheetId)!;
        for (let row = entry.r1; row <= entry.r2; row += BUCKET) buckets.get(Math.floor(row / BUCKET))?.delete(entry);
      }
    }
    engine.cycleCells.delete(key);
    engine.volatileCells.delete(key);
    if (cell.spill) engine.clearSpill(cell);
}

export function collectDirty(engine: CalcEngine, all: boolean, changes: Change[] = []): Set<string> {
    const dirty = new Set<string>();
    const token = ++engine.dirtyToken;
    if (all) {
      for (const cell of engine.formulas.values()) {
        cell.dirtyAt = token;
        dirty.add(cell.key);
      }
      return dirty;
    }
    const queue: string[] = [];
    const add = (key: string) => {
      if (dirty.has(key)) return;
      const cell = engine.formulas.get(key);
      if (!cell) return;
      dirty.add(key);
      cell.dirtyAt = token;
      queue.push(key);
    };
    for (const change of changes) {
      const key = change.key ?? engine.key(change.sheet, change.row, change.col);
      add(key);
      // Dependents are collected from the queue walk below (each key walked
      // exactly once: formula cells by their `walkedAt` stamp). The previous
      // code walked every seed here AND again from the queue, doubling the
      // reverse-edge work for batch writes.
      queue.push(key);
    }
    if (!engine.minimal) {
      for (const key of engine.volatileCells) add(key);
      for (const key of engine.cycleCells) add(key);
    }
    while (queue.length) {
      const key = queue.pop()!;
      const cell = engine.formulas.get(key);
      if (cell) {
        if (cell.walkedAt === token) continue;
        cell.walkedAt = token;
      }
      forEachDependent(engine, key, add);
    }
    return dirty;
}

export function moveRange(engine: CalcEngine,
    sheet: Worksheet,
    fromRow: number,
    fromCol: number,
    toRow: number,
    toCol: number,
    rowCount: number,
    colCount: number,
  ): void {
    const dr = toRow - fromRow,
      dc = toCol - fromCol;
    if (!dr && !dc) return;
    engine.rebuildFormulas(false);
    for (const cell of engine.formulas.values()) {
      const ast = moveRefsForRange(
        cell.ast,
        fromRow,
        fromCol,
        fromRow + rowCount - 1,
        fromCol + colCount - 1,
        toRow,
        toCol,
        dr,
        dc,
        sheet.name(),
        cell.row,
        cell.col,
        rowCount,
        colCount,
        cell.sheet === sheet,
      );
      if (ast !== cell.ast) {
        const text = astToText(ast, { r1c1: engine.isR1C1() });
        if (text !== cell.text) cell.sheet._setFormulaText(cell.row, cell.col, text);
      }
    }
    engine.rebuildFormulas(false);
    engine.recalculate(undefined, true, 1);
}

export function adjustStructure(engine: CalcEngine,
    sheet: Worksheet,
    axis: 'row' | 'col',
    index: number,
    amount: number,
    remove: boolean,
    crossStart?: number,
    crossEnd?: number,
  ): void {
    // Cells already moved in the model; rebuild so formula coordinates match.
    engine.rebuildFormulas(false);
    const sheetName = sheet.name();
    const cross = crossStart !== undefined && crossEnd !== undefined && Number.isFinite(crossStart) ? ([crossStart, crossEnd] as [number, number]) : undefined;
    for (const cell of engine.formulas.values()) {
      const ast = adjustRefsForStructure(
        cell.ast,
        axis,
        index,
        amount,
        remove,
        sheetName,
        cell.sheet === sheet,
        cross,
      );
      const text = astToText(ast, { r1c1: engine.isR1C1() });
      if (text !== cell.text) cell.sheet._setFormulaText(cell.row, cell.col, text);
    }
    engine.rebuildFormulas(false);
    engine.recalculate(undefined, true, 1);
}

export function rebuildFormulas(engine: CalcEngine, calculate = true): void {
    engine.formulas.clear();
    engine.bySheet.clear();
    engine.cellDependents.clear();
    engine.rangeEntries.clear();
    engine.columnRanges.clear();
    engine.singleRowRanges.clear();
    engine.formulaColumns.clear();
    engine.formulaRows.clear();
    engine.rowBuckets.clear();
    engine.longRanges.clear();
    engine.cycleCells.clear();
    engine.cachedCycles = new Set<string>();
    engine.cycleScanVersion = -1;
    engine.topoOrder = undefined;
    engine.topoVersion = -1;
    engine.volatileCells.clear();
    engine.spillOwners.clear();
    engine.spillTouched.clear();
    engine.pending.length = 0;
    for (const sheet of engine.workbook.sheets) {
      engine.sheetId(sheet);
      for (const [row, col, , formula] of sheet._storedCells())
        if (formula) engine.registerStoredFormula(sheet, row, col, formula);
    }
    if (calculate) engine.recalculate(undefined, true, 1);
}

export function loadFormulas(engine: CalcEngine, ): void {
    engine.formulas.clear();
    engine.bySheet.clear();
    engine.cellDependents.clear();
    engine.rangeEntries.clear();
    engine.columnRanges.clear();
    engine.singleRowRanges.clear();
    engine.formulaColumns.clear();
    engine.formulaRows.clear();
    engine.rowBuckets.clear();
    engine.longRanges.clear();
    engine.cycleCells.clear();
    engine.cachedCycles = new Set<string>();
    engine.cycleScanVersion = -1;
    engine.topoOrder = undefined;
    engine.topoVersion = -1;
    engine.volatileCells.clear();
    engine.spillOwners.clear();
    engine.spillTouched.clear();
    engine.pending.length = 0;
    engine.nameCache.clear();
    engine.lastParsed = undefined;
    engine.sheetIds = new WeakMap();
    engine.nextSheetId = 1;
    for (const sheet of engine.workbook.sheets) {
      engine.sheetId(sheet);
      for (const [row, col, , formula] of sheet._storedCells())
        if (formula) engine.registerStoredFormula(sheet, row, col, formula);
    }
}

export function formulasInRange(engine: CalcEngine, dep: RangeDep): FormulaCell[] {
    const result: FormulaCell[] = [];
    const sheetMap = engine.bySheet.get(dep.sheetId);
    if (!sheetMap || !sheetMap.size) return result;
    if (dep.c1 === dep.c2) {
      const column = engine.formulaColumns.get(dep.sheetId)?.get(dep.c1);
      if (!column) return result;
      forEachIndexEntry(column, (key) => {
        const cell = engine.formulas.get(key);
        if (cell && cell.row >= dep.r1 && cell.row <= dep.r2) result.push(cell);
      });
      return result;
    }
    if (dep.r1 === dep.r2) {
      const row = engine.formulaRows.get(dep.sheetId)?.get(dep.r1);
      if (!row) return result;
      forEachIndexEntry(row, (key) => {
        const cell = engine.formulas.get(key);
        if (cell && cell.col >= dep.c1 && cell.col <= dep.c2) result.push(cell);
      });
      return result;
    }
    for (let row = dep.r1; row <= dep.r2; row++) {
      const rowSet = engine.formulaRows.get(dep.sheetId)?.get(row);
      forEachIndexEntry(rowSet, (key) => {
        const cell = engine.formulas.get(key);
        if (cell && cell.col >= dep.c1 && cell.col <= dep.c2) result.push(cell);
      });
    }
    return result;
}

export function dependentsOf(engine: CalcEngine, key: string): string[] {
    const result: string[] = [];
    forEachDependent(engine, key, (dependent) => result.push(dependent));
    return result;
}

/**
 * Iterates the formula cells reading `key` without materialising an array.
 * With no range entries registered the reverse-edge table is the complete
 * dependent set, which skips the key parsing and the four range-index lookups
 * per cell - the hot path for chained formulas (100k-cell recalculation).
 */
export function forEachDependent(engine: CalcEngine, key: string, visit: (dependent: string) => void): void {
    const direct = engine.cellDependents.get(key);
    forEachIndexEntry(direct, visit);
    if (!engine.rangeEntries.size) return;
    const [sheetIdText, rowText, colText] = key.split(':');
    const sheetId = Number(sheetIdText);
    const row = Number(rowText);
    const col = Number(colText);
    const column = engine.columnRanges.get(sheetId)?.get(col);
    if (column) for (const entry of column) if (entry.r1 <= row && entry.r2 >= row) visit(entry.key);
    const singleRow = engine.singleRowRanges.get(sheetId)?.get(row);
    if (singleRow) for (const entry of singleRow) if (entry.c1 <= col && entry.c2 >= col) visit(entry.key);
    const bucket = engine.rowBuckets.get(sheetId)?.get(Math.floor(row / BUCKET));
    if (bucket)
      for (const entry of bucket) {
        if (entry.r1 <= row && entry.r2 >= row && entry.c1 <= col && entry.c2 >= col)
          visit(entry.key);
      }
    const long = engine.longRanges.get(sheetId);
    if (long)
      for (const entry of long)
        if (entry.r1 <= row && entry.r2 >= row && entry.c1 <= col && entry.c2 >= col) visit(entry.key);
}

export function upstreamFormulas(engine: CalcEngine, cell: FormulaCell): FormulaCell[] {
    if (cell.upstream && cell.upstreamVersion === engine.graphVersion) return cell.upstream;
    const result: FormulaCell[] = [];
    for (const dependency of cell.cellDeps) {
      const formula = engine.formulas.get(dependency);
      if (formula) result.push(formula);
    }
    for (const dep of cell.rangeDeps) result.push(...engine.formulasInRange(dep));
    cell.upstream = result;
    cell.upstreamVersion = engine.graphVersion;
    return result;
}

export function resolveName(engine: CalcEngine, name: string, sheet: Worksheet): { ast: AstNode; baseRow: number; baseCol: number } | undefined {
    if (engine.nameDepth > 32) return undefined;
    const info = sheet.getCustomName(name) ?? engine.workbook.getCustomName(name);
    if (!info) return undefined;
    const text = String(info.getExpression() ?? '');
    const r1c1 = engine.isR1C1();
    const cacheKey = name.toLowerCase();
    let cached = engine.nameCache.get(cacheKey);
    if (!cached || cached.text !== text || cached.r1c1 !== r1c1) {
      try {
        const ast = parseFormula(text, { r1c1 });
        cached = { text, r1c1, ast };
        engine.nameCache.set(cacheKey, cached);
      } catch {
        return undefined;
      }
    }
    return { ast: cached.ast, baseRow: info.getRow(), baseCol: info.getColumn() };
}
