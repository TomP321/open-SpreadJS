/**
 * Calculation engine: dependency tracking, incremental recalculation, dynamic
 * array spills and iterative circular reference solving.
 */
import type { Workbook, Worksheet } from '../model.js';
import {
  AstNode,
  RefNode,
  adjustRefsForStructure,
  astToText,
  collectRefs,
  containsFunction,
  parseFormula,
  translateRefs,
} from './parser.js';
import {
  AreaRef,
  CalcArray,
  CalcError,
  ErrorCode,
  ErrorThrown,
  ScalarValue,
  Value,
  error,
  isArray,
  isLambda,
  isReference,
  normalizeNumber,
  } from './values.js';
import {
  EvalContext,
  EvalHost,
  Evaluator,
  builtinNames,
  getBuiltin,
  implicitIntersect,
  toMatrix,
} from './evaluate.js';
import { getGlobalFunction } from './functions-api.js';

const NAME_MARKERS = new Set<string>();
function hasNameNodes(node: AstNode): boolean {
  switch (node.kind) {
    case 'name':
      return true;
    case 'binary':
      return hasNameNodes(node.left) || hasNameNodes(node.right);
    case 'unary':
    case 'percent':
      return hasNameNodes(node.operand);
    case 'paren':
      return hasNameNodes(node.inner);
    case 'range':
      return hasNameNodes(node.start) || hasNameNodes(node.end);
    case 'union':
      return node.parts.some(hasNameNodes);
    case 'intersect':
      return hasNameNodes(node.left) || hasNameNodes(node.right);
    case 'function':
      return node.args.some(hasNameNodes);
    case 'array':
      return node.rows.some((row) => row.some(hasNameNodes));
    case 'spill':
      return hasNameNodes(node.ref);
    case 'call':
      return hasNameNodes(node.callee) || node.args.some(hasNameNodes);
    default:
      return false;
  }
}
import type { CalcFunction } from './functions-api.js';
import './functions/index.js';

interface FormulaCell {
  key: string;
  sheet: Worksheet;
  row: number;
  col: number;
  ast: AstNode;
  text: string;
  order: number;
  value: ScalarValue;
  volatile: boolean;
  spill?: SpillInfo;
  cellDeps: string[];
  rangeDeps: RangeDep[];
  upstream?: FormulaCell[];
  upstreamVersion?: number;
  context?: EvalContext;
  args?: import('./evaluate.js').Args;
}

interface SpillInfo {
  rowCount: number;
  colCount: number;
  cells: { sheet: Worksheet; row: number; col: number }[];
}

interface RangeDep {
  sheetId: number;
  r1: number;
  c1: number;
  r2: number;
  c2: number;
}

interface RangeEntry extends RangeDep {
  id: string;
  key: string;
  long: boolean;
}

interface Change {
  sheet: Worksheet;
  row: number;
  col: number;
}

const BUCKET = 64;
const LONG_RANGE_ROWS = 8192;

export class CalcEngine implements EvalHost {
  private readonly workbook: Workbook;
  private readonly evaluator: Evaluator;
  private sheetIds = new WeakMap<Worksheet, number>();
  private nextSheetId = 1;
  private readonly formulas = new Map<string, FormulaCell>();
  private readonly bySheet = new Map<number, Map<string, FormulaCell>>();
  private readonly cellDependents = new Map<string, Set<string>>();
  private readonly rangeEntries = new Map<string, RangeEntry>();
  private readonly rowBuckets = new Map<number, Map<number, Set<RangeEntry>>>();
  private readonly longRanges = new Map<number, RangeEntry[]>();
  private readonly pending: Change[] = [];
  private readonly cycleCells = new Set<string>();
  private readonly volatileCells = new Set<string>();
  private readonly customFunctions = new Map<string, CalcFunction>();
  private readonly sheetFunctions = new WeakMap<Worksheet, Map<string, CalcFunction>>();
  private readonly globalFunctions = new Map<string, CalcFunction>();
  private readonly nameCache = new Map<string, { text: string; r1c1: boolean; ast: AstNode }>();
  private readonly spillOwners = new Map<string, string>();
  private readonly spillTouched = new Set<string>();
  private readonly formulaColumns = new Map<number, Map<number, Set<string>>>();
  private readonly columnRanges = new Map<number, Map<number, Set<RangeEntry>>>();
  private readonly singleRowRanges = new Map<number, Map<number, Set<RangeEntry>>>();
  private readonly formulaRows = new Map<number, Map<number, Set<string>>>();
  private graphVersion = 0;
  private recalculating = false;
  private minimal = false;
  private orderCounter = 0;
  private lastParsed: { text: string; r1c1: boolean; ast: AstNode } | undefined;
  private nameDepth = 0;

  constructor(workbook: Workbook) {
    this.workbook = workbook;
    this.evaluator = new Evaluator(this);
  }

  // -------------------------------------------------------------------------
  // EvalHost
  // -------------------------------------------------------------------------
  getCellValue(sheet: Worksheet, row: number, col: number): ScalarValue {
    const value = sheet._fastValue(row, col);
    if (value === null || value === undefined) return null;
    if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') return value;
    if (value instanceof Date) return value;
    if (value instanceof CalcError) return value;
    if (value instanceof CalcArray) return value.at(0, 0);
    if (value && typeof value === 'object' && 'error' in value)
      return new CalcError(String((value as { error: unknown }).error));
    return String(value);
  }

  getSpillRange(sheet: Worksheet, row: number, col: number): AreaRef | undefined {
    const cell = this.formulas.get(this.key(sheet, row, col));
    if (!cell?.spill) return undefined;
    return {
      sheet,
      r1: cell.row,
      c1: cell.col,
      r2: cell.row + cell.spill.rowCount - 1,
      c2: cell.col + cell.spill.colCount - 1,
    };
  }

  resolveName(name: string, sheet: Worksheet): { ast: AstNode; baseRow: number; baseCol: number } | undefined {
    if (this.nameDepth > 32) return undefined;
    const info = sheet.getCustomName(name) ?? this.workbook.getCustomName(name);
    if (!info) return undefined;
    const text = String(info.getExpression() ?? '');
    const r1c1 = this.isR1C1();
    const cacheKey = name.toLowerCase();
    let cached = this.nameCache.get(cacheKey);
    if (!cached || cached.text !== text || cached.r1c1 !== r1c1) {
      try {
        const ast = parseFormula(text, { r1c1 });
        cached = { text, r1c1, ast };
        this.nameCache.set(cacheKey, cached);
      } catch {
        return undefined;
      }
    }
    return { ast: cached.ast, baseRow: info.getRow(), baseCol: info.getColumn() };
  }

  getCustomFunction(name: string, sheet: Worksheet): CalcFunction | undefined {
    const upper = name.toUpperCase();
    return (
      this.sheetFunctions.get(sheet)?.get(upper) ??
      this.customFunctions.get(upper) ??
      this.globalFunctions.get(upper) ??
      getGlobalFunction(upper)
    );
  }

  sheetFromName(name: string): Worksheet | undefined {
    return this.workbook.sheets.find((sheet) => sheet.name().toLowerCase() === name.toLowerCase());
  }

  private r1c1Cache: boolean | undefined;
  private dynamicCache: boolean | undefined;

  isR1C1(): boolean {
    if (this.r1c1Cache === undefined)
      this.r1c1Cache = Number(this.workbook.options.referenceStyle) === 1;
    return this.r1c1Cache;
  }

  allowDynamicArray(): boolean {
    if (this.dynamicCache === undefined) this.dynamicCache = Boolean(this.workbook.options.allowDynamicArray);
    return this.dynamicCache;
  }

  /** Invalidates cached workbook options (reference style, dynamic arrays). */
  optionsChanged(): void {
    this.r1c1Cache = undefined;
    this.dynamicCache = undefined;
    this.lastParsed = undefined;
    if (this.formulas.size) this.recalculate(undefined, true, 0);
  }

  hasFormula(sheet: Worksheet, row: number, col: number): boolean {
    return sheet.getFormula(row, col) !== null;
  }

  getFormulaText(sheet: Worksheet, row: number, col: number): string | null {
    return sheet.getFormula(row, col);
  }

  workbookIndex(sheet: Worksheet): number {
    return this.workbook.getSheetIndex(sheet.name()) + 1;
  }

  sheetCount(): number {
    return this.workbook.getSheetCount();
  }

  enterName(): boolean {
    if (this.nameDepth > 32) return false;
    this.nameDepth++;
    return true;
  }
  leaveName(): void {
    this.nameDepth = Math.max(0, this.nameDepth - 1);
  }

  // -------------------------------------------------------------------------
  // Registration
  // -------------------------------------------------------------------------
  private sheetId(sheet: Worksheet): number {
    let id = this.sheetIds.get(sheet);
    if (!id) this.sheetIds.set(sheet, (id = this.nextSheetId++));
    if (!this.bySheet.has(id)) {
      this.bySheet.set(id, new Map());
      this.rowBuckets.set(id, new Map());
      this.longRanges.set(id, []);
    }
    return id;
  }

  private key(sheet: Worksheet, row: number, col: number): string {
    return `${this.sheetId(sheet)}:${row}:${col}`;
  }
  private keyFor(sheetId: number, row: number, col: number): string {
    return `${sheetId}:${row}:${col}`;
  }

  sheetChanged(sheet: Worksheet): void {
    this.sheetId(sheet);
  }

  /** Invalidates cached name expressions and recalculates dependents. */
  namesChanged(): void {
    this.nameCache.clear();
    this.rebuildFormulas(true);
  }

  /** Parses/validates a formula and returns its canonical text. */
  parseFormula(sheet: Worksheet, row: number, col: number, formula: string): string {
    void row;
    void col;
    return this.parseFormulaText(sheet, formula);
  }

  parseFormulaText(sheet: Worksheet, formula: string, r1c1 = this.isR1C1()): string {
    const ast = this.compile(formula, r1c1);
    this.validate(ast, sheet);
    return astToText(ast, { r1c1 });
  }

  private compile(formula: string, r1c1 = this.isR1C1()): AstNode {
    if (this.lastParsed && this.lastParsed.text === formula && this.lastParsed.r1c1 === r1c1)
      return this.lastParsed.ast;
    const ast = parseFormula(formula, { r1c1 });
    this.lastParsed = { text: formula, r1c1, ast };
    return ast;
  }

  private validate(ast: AstNode, sheet: Worksheet): void {
    const visit = (node: AstNode): void => {
      switch (node.kind) {
        case 'function': {
          const name = node.name.replace(/^_XLFN\./, '');
          const builtin = getBuiltin(name);
          const custom = this.getCustomFunction(name, sheet);
          const min = builtin?.min ?? custom?.minArgs;
          const max = builtin?.max ?? custom?.maxArgs;
          if (min !== undefined) {
            const high = max === undefined ? min : max;
            if (node.args.length < min || node.args.length > high) throw new Error('Invalid Formula');
          }
          for (const arg of node.args) visit(arg);
          break;
        }
        case 'binary':
          visit(node.left);
          visit(node.right);
          break;
        case 'unary':
        case 'percent':
          visit(node.operand);
          break;
        case 'paren':
          visit(node.inner);
          break;
        case 'range':
          visit(node.start);
          visit(node.end);
          break;
        case 'union':
          for (const part of node.parts) visit(part);
          break;
        case 'intersect':
          visit(node.left);
          visit(node.right);
          break;
        case 'array':
          for (const row of node.rows) for (const value of row) visit(value);
          break;
        case 'spill':
          visit(node.ref);
          break;
        case 'call':
          visit(node.callee);
          for (const arg of node.args) visit(arg);
          break;
        default:
          break;
      }
    };
    visit(ast);
  }

  formulaChanged(sheet: Worksheet, row: number, col: number, formula: string | null): void {
    this.sheetId(sheet);
    const key = this.key(sheet, row, col);
    this.removeFormula(key);
    this.detachSpillCell(sheet, row, col, false);
    if (formula) {
      const text = formula.replace(/^=/, '');
      let ast: AstNode | undefined;
      try {
        ast = this.compile(text);
      } catch {
        ast = undefined;
      }
      if (ast)
        this.installFormula(sheet, row, col, ast, astToText(ast, { r1c1: this.isR1C1() }), false);
    }
    this.pending.push({ sheet, row, col });
  }

  valueChanged(sheet: Worksheet, row: number, col: number): void {
    this.detachSpillCell(sheet, row, col, true);
    const key = this.key(sheet, row, col);
    // A plain value write over a formula cell removes its registration.
    if (this.formulas.has(key) && sheet.getFormula(row, col) === null) this.removeFormula(key);
    this.pending.push({ sheet, row, col });
  }

  /** Called before a user write so spill ownership can be revoked. */
  cellWriting(sheet: Worksheet, row: number, col: number): void {
    this.detachSpillCell(sheet, row, col, true);
  }

  /** Registers a formula already present in a cell (e.g. after JSON import). */
  registerExistingFormula(sheet: Worksheet, row: number, col: number, formula: string): void {
    const key = this.key(sheet, row, col);
    this.removeFormula(key);
    const text = formula.replace(/^=/, '');
    try {
      const ast = this.compile(text);
      this.installFormula(sheet, row, col, ast, text, true);
    } catch {
      // Invalid imported formula: keep its text but do not calculate it.
    }
  }

  private installFormula(
    sheet: Worksheet,
    row: number,
    col: number,
    ast: AstNode,
    text: string,
    preserveValue: boolean,
  ): void {
    const key = this.key(sheet, row, col);
    this.graphVersion++;
    const cell: FormulaCell = {
      key,
      sheet,
      row,
      col,
      ast,
      text,
      order: ++this.orderCounter,
      value: preserveValue ? this.getCellValue(sheet, row, col) : null,
      volatile: this.isVolatileAst(ast, sheet),
      cellDeps: [],
      rangeDeps: [],
    };
    this.formulas.set(key, cell);
    const sheetId = this.sheetId(sheet);
    this.bySheet.get(sheetId)!.set(`${row}:${col}`, cell);
    this.indexFormula(sheetId, row, col, key);
    this.registerDependencies(cell);
    if (cell.volatile) this.volatileCells.add(key);
    else this.volatileCells.delete(key);
  }

  private isVolatileAst(ast: AstNode, sheet: Worksheet): boolean {
    if (
      containsFunction(
        ast,
        new Set(['NOW', 'TODAY', 'RAND', 'RANDBETWEEN', 'RANDARRAY', 'OFFSET', 'INDIRECT', 'CELL', 'INFO']),
      )
    )
      return true;
    const visit = (node: AstNode): boolean => {
      switch (node.kind) {
        case 'function': {
          const custom = this.getCustomFunction(node.name.replace(/^_XLFN\./, ''), sheet);
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

  private registerDependencies(cell: FormulaCell): void {
    const refs = collectRefs(cell.ast);
    for (const ref of refs) this.registerRef(cell, ref);
    // Names may contain their own references; register those too.
    if (containsFunction(cell.ast, NAME_MARKERS) || hasNameNodes(cell.ast))
      this.registerNameDependencies(cell, cell.ast);
  }

  private registerNameDependencies(cell: FormulaCell, node: AstNode): void {
    const check = (name: string, sheet: Worksheet): void => {
      const info = this.resolveName(name, sheet);
      if (!info) return;
      for (const ref of collectRefs(info.ast)) this.registerRef(cell, ref, info.baseRow, info.baseCol);
      this.registerNameRefs(cell, info.ast, info.baseRow, info.baseCol);
    };
    const walk = (current: AstNode): void => {
      switch (current.kind) {
        case 'name':
          if (!this.isLocalVar(cell.ast, current.name)) {
            const sheet = current.sheet ? (this.sheetFromName(current.sheet) ?? cell.sheet) : cell.sheet;
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

  private registerNameRefs(cell: FormulaCell, node: AstNode, baseRow: number, baseCol: number): void {
    const deltaRow = cell.row - baseRow;
    const deltaCol = cell.col - baseCol;
    const ast = this.isR1C1() ? node : translateRefs(node, deltaRow, deltaCol);
    for (const ref of collectRefs(ast)) this.registerRef(cell, ref);
  }

  /** Detects whether a name is a LET/LAMBDA parameter (not a sheet name). */
  private isLocalVar(ast: AstNode, name: string): boolean {
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

  private registerRef(cell: FormulaCell, node: RefNode, baseRow?: number, baseCol?: number): void {
    let sheet = cell.sheet;
    if (node.sheet) {
      const found = this.sheetFromName(node.sheet);
      if (!found) return;
      sheet = found;
    }
    const ownId = this.sheetId(sheet);
    const r1c1 = this.isR1C1();
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
    if (r1 === r2 && c1 === c2) {
      this.addCellDependency(cell, this.keyFor(ownId, r1, c1));
      return;
    }
    const dep: RangeDep = { sheetId: ownId, r1, c1, r2, c2 };
    cell.rangeDeps.push(dep);
    const index = cell.rangeDeps.length - 1;
    const entry: RangeEntry = {
      ...dep,
      id: `${cell.key}|${index}`,
      key: cell.key,
      long: r2 - r1 + 1 > LONG_RANGE_ROWS,
    };
    this.rangeEntries.set(entry.id, entry);
    if (r1 === r2) {
      let rows = this.singleRowRanges.get(ownId);
      if (!rows) this.singleRowRanges.set(ownId, (rows = new Map()));
      let set = rows.get(r1);
      if (!set) rows.set(r1, (set = new Set()));
      set.add(entry);
    } else if (c1 === c2) {
      let columns = this.columnRanges.get(ownId);
      if (!columns) this.columnRanges.set(ownId, (columns = new Map()));
      let set = columns.get(c1);
      if (!set) columns.set(c1, (set = new Set()));
      set.add(entry);
    } else if (entry.long) this.longRanges.get(ownId)!.push(entry);
    else {
      const buckets = this.rowBuckets.get(ownId)!;
      for (let row = r1; row <= r2; row += BUCKET) {
        const bucket = Math.floor(row / BUCKET);
        let set = buckets.get(bucket);
        if (!set) buckets.set(bucket, (set = new Set()));
        set.add(entry);
      }
    }
  }

  private indexFormula(sheetId: number, row: number, col: number, key: string): void {
    let columns = this.formulaColumns.get(sheetId);
    if (!columns) this.formulaColumns.set(sheetId, (columns = new Map()));
    let columnSet = columns.get(col);
    if (!columnSet) columns.set(col, (columnSet = new Set()));
    columnSet.add(key);
    let rows = this.formulaRows.get(sheetId);
    if (!rows) this.formulaRows.set(sheetId, (rows = new Map()));
    let rowSet = rows.get(row);
    if (!rowSet) rows.set(row, (rowSet = new Set()));
    rowSet.add(key);
  }

  private unindexFormula(sheetId: number, row: number, col: number, key: string): void {
    const columns = this.formulaColumns.get(sheetId);
    columns?.get(col)?.delete(key);
    const rows = this.formulaRows.get(sheetId);
    rows?.get(row)?.delete(key);
  }

  private addCellDependency(cell: FormulaCell, dependencyKey: string): void {
    cell.cellDeps.push(dependencyKey);
    let set = this.cellDependents.get(dependencyKey);
    if (!set) this.cellDependents.set(dependencyKey, (set = new Set()));
    set.add(cell.key);
  }

  private removeFormula(key: string): void {
    const cell = this.formulas.get(key);
    if (!cell) return;
    this.graphVersion++;
    this.formulas.delete(key);
    const sheetId = this.sheetId(cell.sheet);
    this.bySheet.get(sheetId)?.delete(`${cell.row}:${cell.col}`);
    this.unindexFormula(sheetId, cell.row, cell.col, key);
    for (const dep of cell.cellDeps) {
      const set = this.cellDependents.get(dep);
      set?.delete(key);
      if (set && !set.size) this.cellDependents.delete(dep);
    }
    for (let index = 0; index < cell.rangeDeps.length; index++) {
      const id = `${key}|${index}`;
      const entry = this.rangeEntries.get(id);
      this.rangeEntries.delete(id);
      if (!entry) continue;
      if (entry.r1 === entry.r2) this.singleRowRanges.get(entry.sheetId)?.get(entry.r1)?.delete(entry);
      else if (entry.c1 === entry.c2) this.columnRanges.get(entry.sheetId)?.get(entry.c1)?.delete(entry);
      else if (entry.long) {
        const list = this.longRanges.get(entry.sheetId)!;
        const position = list.indexOf(entry);
        if (position >= 0) list.splice(position, 1);
      } else {
        const buckets = this.rowBuckets.get(entry.sheetId)!;
        for (let row = entry.r1; row <= entry.r2; row += BUCKET) buckets.get(Math.floor(row / BUCKET))?.delete(entry);
      }
    }
    this.cycleCells.delete(key);
    this.volatileCells.delete(key);
    if (cell.spill) this.clearSpill(cell);
  }

  private clearSpill(cell: FormulaCell): void {
    if (!cell.spill) return;
    for (const target of cell.spill.cells) {
      const targetKey = this.key(target.sheet, target.row, target.col);
      if (this.spillOwners.get(targetKey) === cell.key) {
        this.spillOwners.delete(targetKey);
        target.sheet._setCalculatedValue(target.row, target.col, null);
      }
    }
    cell.spill = undefined;
  }

  private spillBlocked(cell: FormulaCell, rowCount: number, colCount: number): boolean {
    if (cell.row + rowCount - 1 >= cell.sheet.getRowCount()) return true;
    if (cell.col + colCount - 1 >= cell.sheet.getColumnCount()) return true;
    for (let r = 0; r < rowCount; r++)
      for (let c = 0; c < colCount; c++) {
        if (!r && !c) continue;
        const row = cell.row + r,
          col = cell.col + c;
        const formula = this.formulas.get(this.key(cell.sheet, row, col));
        if (formula && formula !== cell) return true;
        const owner = this.spillOwners.get(this.key(cell.sheet, row, col));
        const value = cell.sheet.getValue(row, col);
        if (owner === cell.key) continue;
        if (value !== null && value !== undefined) return true;
      }
    return false;
  }

  private applySpill(cell: FormulaCell, array: CalcArray): void {
    const rowCount = array.rowCount;
    const colCount = array.colCount;
    if (rowCount <= 1 && colCount <= 1) {
      this.clearSpill(cell);
      cell.spill = { rowCount: 1, colCount: 1, cells: [] };
      cell.value = array.at(0, 0);
      cell.sheet._setCalculatedValue(cell.row, cell.col, cell.value);
      return;
    }
    if (this.spillBlocked(cell, rowCount, colCount)) {
      this.clearSpill(cell);
      cell.value = error(ErrorCode.spill);
      cell.sheet._setCalculatedValue(cell.row, cell.col, cell.value);
      return;
    }
    this.clearSpill(cell);
    const cells: { sheet: Worksheet; row: number; col: number }[] = [];
    for (let r = 0; r < rowCount; r++)
      for (let c = 0; c < colCount; c++) {
        if (!r && !c) continue;
        const row = cell.row + r,
          col = cell.col + c;
        const value = array.at(r, c);
        cell.sheet._setCalculatedValue(row, col, value);
        this.spillOwners.set(this.key(cell.sheet, row, col), cell.key);
        this.spillTouched.add(this.key(cell.sheet, row, col));
        cells.push({ sheet: cell.sheet, row, col });
      }
    cell.spill = { rowCount, colCount, cells };
    cell.value = array.at(0, 0);
    cell.sheet._setCalculatedValue(cell.row, cell.col, cell.value);
  }

  // -------------------------------------------------------------------------
  // Recalculation
  // -------------------------------------------------------------------------
  recalculate(_sheet?: Worksheet, all = false, type?: number): void {
    if (this.recalculating) return;
    if (!this.pending.length && !all && type === undefined && !this.cycleCells.size && !this.volatileCells.size)
      return;
    this.recalculating = true;
    try {
      this.minimal = type === 2;
      const changes = this.pending.splice(0);
      const dirty = this.collectDirty(all, changes);
      if (!dirty.size) return;
      this.findCycles(dirty);
      const done = new Set<string>();
      const deferred = new Set<string>();
      for (const key of dirty) {
        if (this.cycleCells.has(key)) continue;
        const cell = this.formulas.get(key);
        if (cell && !deferred.has(key) && this.upstreamFormulas(cell).length === 0) {
          this.computeFormula(cell);
          done.add(key);
          continue;
        }
        this.evaluateFormula(key, done, deferred);
      }
      if (this.cycleCells.size) this.solveCircular();
      for (const key of deferred) if (this.formulas.has(key)) this.evaluateFormula(key, done, new Set());
      // Re-evaluate formulas that depend on spilled cells whose values changed.
      if (this.spillTouched.size) {
        const touched = [...this.spillTouched];
        this.spillTouched.clear();
        const extra = new Set<string>();
        for (const key of touched)
          for (const dependent of this.dependentsOf(key)) if (!done.has(dependent)) extra.add(dependent);
        for (const key of extra) this.evaluateFormula(key, done, new Set());
      }
    } finally {
      this.recalculating = false;
      this.minimal = false;
    }
  }

  private collectDirty(all: boolean, changes: Change[] = []): Set<string> {
    const dirty = new Set<string>();
    if (all) {
      for (const key of this.formulas.keys()) dirty.add(key);
      return dirty;
    }
    const queue: string[] = [];
    const add = (key: string) => {
      if (!this.formulas.has(key) || dirty.has(key)) return;
      dirty.add(key);
      queue.push(key);
    };
    for (const change of changes) {
      const key = this.key(change.sheet, change.row, change.col);
      add(key);
      for (const dependent of this.dependentsOf(key)) add(dependent);
    }
    if (!this.minimal) {
      for (const key of this.volatileCells) add(key);
      for (const key of this.cycleCells) add(key);
    }
    while (queue.length) {
      const key = queue.pop()!;
      for (const dependent of this.dependentsOf(key)) add(dependent);
    }
    return dirty;
  }

  private dependentsOf(key: string): string[] {
    const result: string[] = [];
    const direct = this.cellDependents.get(key);
    if (direct) result.push(...direct);
    const [sheetIdText, rowText, colText] = key.split(':');
    const sheetId = Number(sheetIdText);
    const row = Number(rowText);
    const col = Number(colText);
    const column = this.columnRanges.get(sheetId)?.get(col);
    if (column) for (const entry of column) if (entry.r1 <= row && entry.r2 >= row) result.push(entry.key);
    const singleRow = this.singleRowRanges.get(sheetId)?.get(row);
    if (singleRow) for (const entry of singleRow) if (entry.c1 <= col && entry.c2 >= col) result.push(entry.key);
    const bucket = this.rowBuckets.get(sheetId)?.get(Math.floor(row / BUCKET));
    if (bucket)
      for (const entry of bucket) {
        if (entry.r1 <= row && entry.r2 >= row && entry.c1 <= col && entry.c2 >= col)
          result.push(entry.key);
      }
    for (const entry of this.longRanges.get(sheetId) ?? [])
      if (entry.r1 <= row && entry.r2 >= row && entry.c1 <= col && entry.c2 >= col) result.push(entry.key);
    return result;
  }

  /** Formula cells inside a dependency range, using the sparse position index. */
  private formulasInRange(dep: RangeDep): FormulaCell[] {
    const result: FormulaCell[] = [];
    const sheetMap = this.bySheet.get(dep.sheetId);
    if (!sheetMap || !sheetMap.size) return result;
    if (dep.c1 === dep.c2) {
      const column = this.formulaColumns.get(dep.sheetId)?.get(dep.c1);
      if (!column) return result;
      for (const key of column) {
        const cell = this.formulas.get(key);
        if (cell && cell.row >= dep.r1 && cell.row <= dep.r2) result.push(cell);
      }
      return result;
    }
    if (dep.r1 === dep.r2) {
      const row = this.formulaRows.get(dep.sheetId)?.get(dep.r1);
      if (!row) return result;
      for (const key of row) {
        const cell = this.formulas.get(key);
        if (cell && cell.col >= dep.c1 && cell.col <= dep.c2) result.push(cell);
      }
      return result;
    }
    for (let row = dep.r1; row <= dep.r2; row++) {
      const rowSet = this.formulaRows.get(dep.sheetId)?.get(row);
      if (!rowSet) continue;
      for (const key of rowSet) {
        const cell = this.formulas.get(key);
        if (cell && cell.col >= dep.c1 && cell.col <= dep.c2) result.push(cell);
      }
    }
    return result;
  }

  private upstreamFormulas(cell: FormulaCell): FormulaCell[] {
    if (cell.upstream && cell.upstreamVersion === this.graphVersion) return cell.upstream;
    const result: FormulaCell[] = [];
    for (const dependency of cell.cellDeps) {
      const formula = this.formulas.get(dependency);
      if (formula) result.push(formula);
    }
    for (const dep of cell.rangeDeps) result.push(...this.formulasInRange(dep));
    cell.upstream = result;
    cell.upstreamVersion = this.graphVersion;
    return result;
  }

  private evaluateFormula(key: string, done: Set<string>, deferred: Set<string>): void {
    if (done.has(key)) return;
    const target = this.formulas.get(key);
    if (!target) return;
    if (!this.cycleCells.has(key) && !deferred.has(key) && this.upstreamFormulas(target).length === 0) {
      this.computeFormula(target);
      done.add(key);
      return;
    }
    type Frame = { cell: FormulaCell; deps: FormulaCell[]; index: number; defer: boolean };
    const stack: Frame[] = [];
    const visiting = new Set<string>();
    const push = (cell: FormulaCell) => {
      stack.push({ cell, deps: this.upstreamFormulas(cell), index: 0, defer: deferred.has(cell.key) });
      visiting.add(cell.key);
    };
    push(target);
    while (stack.length) {
      const frame = stack[stack.length - 1]!;
      if (frame.defer) {
        stack.pop();
        visiting.delete(frame.cell.key);
        deferred.add(frame.cell.key);
        continue;
      }
      let descended = false;
      while (frame.index < frame.deps.length) {
        const dependency = frame.deps[frame.index++]!;
        if (dependency.key === frame.cell.key || this.cycleCells.has(dependency.key) || deferred.has(dependency.key)) {
          frame.defer = true;
          break;
        }
        if (done.has(dependency.key)) continue;
        if (visiting.has(dependency.key)) {
          frame.defer = true;
          break;
        }
        push(dependency);
        descended = true;
        break;
      }
      if (descended || frame.defer) continue;
      this.computeFormula(frame.cell);
      done.add(frame.cell.key);
      visiting.delete(frame.cell.key);
      stack.pop();
    }
  }

  private computeFormula(cell: FormulaCell): void {
    if (cell.row >= cell.sheet.getRowCount() || cell.col >= cell.sheet.getColumnCount()) {
      cell.value = null;
      return;
    }
    const arrayRange = cell.sheet._arrayFormula(cell.row, cell.col);
    const ctx = cell.context ?? (cell.context = this.contextFor(cell.sheet, cell.row, cell.col, this.allowDynamicArray()));
    ctx.arrayMode = this.allowDynamicArray() || Boolean(arrayRange);
    let result: Value;
    try {
      result = this.evaluator.evaluate(cell.ast, ctx);
    } catch (thrown) {
      if (thrown instanceof ErrorThrown) result = thrown.value;
      else if (thrown instanceof CalcError) result = thrown;
      else throw thrown;
    }
    if (isReference(result)) {
      const scalarResult = implicitIntersect(ctx, result);
      result = scalarResult === null ? 0 : scalarResult;
    }
    if (isLambda(result)) result = error(ErrorCode.value);
    if (arrayRange) {
      this.applyArrayFormula(cell, result, arrayRange);
      return;
    }
    if (isArray(result) && this.allowDynamicArray()) this.applySpill(cell, result);
    else {
      if (isArray(result)) result = result.at(0, 0);
      this.clearSpill(cell);
      let value: ScalarValue = result === undefined ? null : (result as ScalarValue);
      if (typeof value === 'number') value = normalizeNumber(value);
      cell.value = value;
      cell.sheet._setCalculatedValue(cell.row, cell.col, value);
    }
  }

  /** Writes a legacy array formula result over its fixed range. */
  private applyArrayFormula(
    cell: FormulaCell,
    result: Value,
    range: { rowCount: number; colCount: number },
  ): void {
    const matrix: ScalarValue[][] = isArray(result)
      ? result.array.map((row) => row.map((item) => (item as ScalarValue)))
      : isReference(result)
        ? toMatrix(this.contextFor(cell.sheet, cell.row, cell.col, true), result)
        : [[result as ScalarValue]];
    for (let row = 0; row < range.rowCount; row++) {
      for (let col = 0; col < range.colCount; col++) {
        const value = matrix[row]?.[col] ?? matrix[0]?.[0] ?? null;
        if (!row && !col) cell.value = value;
        else cell.sheet._setCalculatedValue(cell.row + row, cell.col + col, value);
      }
    }
    cell.sheet._setCalculatedValue(cell.row, cell.col, cell.value);
  }

  private contextFor(sheet: Worksheet, row: number, col: number, arrayMode = false): EvalContext {
    return { host: this, sheet, row, col, arrayMode: arrayMode && this.allowDynamicArray() };
  }

  // -------------------------------------------------------------------------
  // Circular references
  // -------------------------------------------------------------------------
  private findCycles(dirty: Set<string>): void {
    if (!this.cycleCells.size) {
      let hasEdge = false;
      for (const key of dirty) {
        const cell = this.formulas.get(key);
        if (cell && this.upstreamFormulas(cell).length) {
          hasEdge = true;
          break;
        }
      }
      if (!hasEdge) return;
    }
    const index = new Map<string, number>();
    const low = new Map<string, number>();
    const onStack = new Set<string>();
    const stack: string[] = [];
    let counter = 0;
    const visit = (start: string) => {
      type Frame = { key: string; deps: FormulaCell[]; index: number };
      const frame: Frame = {
        key: start,
        deps: this.upstreamFormulas(this.formulas.get(start)!),
        index: 0,
      };
      index.set(start, counter);
      low.set(start, counter++);
      stack.push(start);
      onStack.add(start);
      const frames = [frame];
      while (frames.length) {
        const current = frames[frames.length - 1]!;
        if (current.index < current.deps.length) {
          const dep = current.deps[current.index++]!;
          if (!this.formulas.has(dep.key)) continue;
          if (!index.has(dep.key)) {
            index.set(dep.key, counter);
            low.set(dep.key, counter++);
            stack.push(dep.key);
            onStack.add(dep.key);
            frames.push({ key: dep.key, deps: this.upstreamFormulas(dep), index: 0 });
          } else if (onStack.has(dep.key)) {
            low.set(current.key, Math.min(low.get(current.key)!, index.get(dep.key)!));
          }
          continue;
        }
        frames.pop();
        if (frames.length) {
          const parent = frames[frames.length - 1]!.key;
          low.set(parent, Math.min(low.get(parent)!, low.get(current.key)!));
        }
        if (low.get(current.key) === index.get(current.key)) {
          const component: string[] = [];
          for (;;) {
            const member = stack.pop()!;
            onStack.delete(member);
            component.push(member);
            if (member === current.key) break;
          }
          if (component.length > 1) for (const member of component) this.cycleCells.add(member);
          else {
            const only = component[0]!;
            const cell = this.formulas.get(only);
            if (cell && this.upstreamFormulas(cell).some((item) => item.key === only)) this.cycleCells.add(only);
          }
        }
      }
    };
    for (const key of dirty) if (this.formulas.has(key) && !index.has(key)) visit(key);
  }

  private solveCircular(): void {
    const cells = [...this.cycleCells]
      .map((key) => this.formulas.get(key))
      .filter((cell): cell is FormulaCell => Boolean(cell));
    if (!cells.length) return;
    cells.sort((a, b) => b.order - a.order);
    const maxIterations = Math.max(
      1,
      Number(this.workbook.options.iterativeCalculationMaximumIterations) || 1000,
    );
    const maxChange = Math.max(0, Number(this.workbook.options.iterativeCalculationMaximumChange) ?? 0.01);
    if (this.workbook.options.iterativeCalculation === false) {
      for (const cell of cells) {
        if (cell.value === null) {
          cell.value = 0;
          cell.sheet._setCalculatedValue(cell.row, cell.col, 0);
        }
      }
      return;
    }
    for (let iteration = 0; iteration < maxIterations; iteration++) {
      let maxDelta = 0;
      for (const cell of cells) {
        const previous = this.getCellValue(cell.sheet, cell.row, cell.col);
        this.computeFormula(cell);
        const next = cell.value;
        const previousNumber = previous === null ? 0 : previous;
        if (typeof previousNumber === 'number' && typeof next === 'number')
          maxDelta = Math.max(maxDelta, Math.abs(next - previousNumber));
        else if (!Object.is(previous, next)) maxDelta = Math.max(maxDelta, 1);
      }
      if (maxDelta < maxChange) break;
    }
  }

  // -------------------------------------------------------------------------
  // Spill ownership
  // -------------------------------------------------------------------------
  private detachSpillCell(sheet: Worksheet, row: number, col: number, keepValue: boolean): void {
    const key = this.key(sheet, row, col);
    const owner = this.spillOwners.get(key);
    if (!owner) return;
    this.spillOwners.delete(key);
    const cell = this.formulas.get(owner);
    if (cell?.spill) {
      const oldValue = this.getCellValue(sheet, row, col);
      cell.spill = { ...cell.spill, cells: cell.spill.cells.filter((item) => item.row !== row || item.col !== col) };
      if (!keepValue && oldValue !== null) this.pending.push({ sheet, row, col });
      if (oldValue !== null) this.spillTouched.add(key);
    }
    this.pending.push({ sheet, row, col });
  }

  // -------------------------------------------------------------------------
  // Public operations
  // -------------------------------------------------------------------------
  recalcAll(type?: number): void {
    this.pending.length = 0;
    this.recalculate(undefined, true, type ?? 0);
  }

  calculate(type = 0, address?: string): void {
    this.pending.length = 0;
    if (address) {
      const match = /(?:([^!]+)!)?([A-Za-z]+)(\d+)(?::([A-Za-z]+)(\d+))?/.exec(address.replace(/\$/g, ''));
      if (match) {
        const sheet = match[1] ? this.sheetFromName(match[1]) : this.workbook.getActiveSheet();
        if (sheet) {
          this.pending.push({ sheet, row: Number(match[3]) - 1, col: columnNumber(match[2]!) });
          this.recalculate(sheet, false, type);
          return;
        }
      }
    }
    if (type === 0 || type === 1) this.recalculate(undefined, true, type);
    else this.recalculate(undefined, false, type);
  }

  /** Rewrites formulas after a structural change and rebuilds the graph. */
  adjustStructure(sheet: Worksheet, axis: 'row' | 'col', index: number, amount: number, remove: boolean): void {
    // Cells already moved in the model; rebuild so formula coordinates match.
    this.rebuildFormulas(false);
    const sheetName = sheet.name();
    for (const cell of this.formulas.values()) {
      const ast = adjustRefsForStructure(
        cell.ast,
        axis,
        index,
        amount,
        remove,
        sheetName,
        cell.sheet === sheet,
      );
      const text = astToText(ast, { r1c1: this.isR1C1() });
      if (text !== cell.text) cell.sheet._setFormulaText(cell.row, cell.col, text);
    }
    this.rebuildFormulas(false);
    this.recalculate(undefined, true, 1);
  }

  /** Translates relative references for copy/fill. */
  translateFormula(formula: string, rows: number, columns: number): string {
    try {
      const ast = parseFormula(formula, { r1c1: this.isR1C1() });
      return astToText(translateRefs(ast, rows, columns), { r1c1: this.isR1C1() });
    } catch {
      return formula;
    }
  }

  sheetRenamed(_sheet: Worksheet, oldName: string, newName: string): void {
    for (const cell of this.formulas.values()) {
      const ast = renameSheetRefs(cell.ast, oldName, newName);
      const text = astToText(ast, { r1c1: this.isR1C1() });
      if (text !== cell.text) cell.sheet._setFormulaText(cell.row, cell.col, text);
    }
    this.nameCache.clear();
    this.rebuildFormulas();
  }

  sheetRemoved(sheet: Worksheet): void {
    const name = sheet.name();
    for (const cell of [...this.formulas.values()]) {
      const ast = invalidateSheetRefs(cell.ast, name);
      const text = astToText(ast, { r1c1: this.isR1C1() });
      if (text !== cell.text) cell.sheet._setFormulaText(cell.row, cell.col, text);
    }
    this.rebuildFormulas();
  }

  /** Clears all calculation state and re-registers stored formulas. */
  rebuildFormulas(calculate = true): void {
    this.formulas.clear();
    this.bySheet.clear();
    this.cellDependents.clear();
    this.rangeEntries.clear();
    this.columnRanges.clear();
    this.singleRowRanges.clear();
    this.formulaColumns.clear();
    this.formulaRows.clear();
    this.rowBuckets.clear();
    this.longRanges.clear();
    this.cycleCells.clear();
    this.volatileCells.clear();
    this.spillOwners.clear();
    this.spillTouched.clear();
    this.pending.length = 0;
    for (const sheet of this.workbook.sheets) {
      this.sheetId(sheet);
      for (const [row, col, , formula] of sheet._storedCells())
        if (formula) this.registerStoredFormula(sheet, row, col, formula);
    }
    if (calculate) this.recalculate(undefined, true, 1);
  }

  private registerStoredFormula(sheet: Worksheet, row: number, col: number, formula: string): void {
    const text = formula.replace(/^=/, '');
    let ast: AstNode | undefined;
    try {
      ast = this.compile(text);
    } catch {
      ast = undefined;
    }
    if (ast) this.installFormula(sheet, row, col, ast, text, true);
  }

  /** Loads cached formula values without recalculating (JSON import). */
  loadFormulas(): void {
    this.formulas.clear();
    this.bySheet.clear();
    this.cellDependents.clear();
    this.rangeEntries.clear();
    this.columnRanges.clear();
    this.singleRowRanges.clear();
    this.formulaColumns.clear();
    this.formulaRows.clear();
    this.rowBuckets.clear();
    this.longRanges.clear();
    this.cycleCells.clear();
    this.volatileCells.clear();
    this.spillOwners.clear();
    this.spillTouched.clear();
    this.pending.length = 0;
    this.nameCache.clear();
    this.lastParsed = undefined;
    this.sheetIds = new WeakMap();
    this.nextSheetId = 1;
    for (const sheet of this.workbook.sheets) {
      this.sheetId(sheet);
      for (const [row, col, , formula] of sheet._storedCells())
        if (formula) this.registerStoredFormula(sheet, row, col, formula);
    }
  }

  // -------------------------------------------------------------------------
  // Custom functions
  // -------------------------------------------------------------------------
  addFunction(fn: CalcFunction, sheet?: Worksheet): void {
    if (sheet) {
      let map = this.sheetFunctions.get(sheet);
      if (!map) this.sheetFunctions.set(sheet, (map = new Map()));
      map.set(fn.name.toUpperCase(), fn);
    } else this.customFunctions.set(fn.name.toUpperCase(), fn);
  }
  removeFunction(name: string, sheet?: Worksheet): void {
    if (sheet) this.sheetFunctions.get(sheet)?.delete(name.toUpperCase());
    else this.customFunctions.delete(name.toUpperCase());
  }
  registerGlobalFunction(fn: CalcFunction): void {
    this.globalFunctions.set(fn.name.toUpperCase(), fn);
  }
  removeGlobalFunction(name: string): void {
    this.globalFunctions.delete(name.toUpperCase());
  }

  // -------------------------------------------------------------------------
  // Public formula helpers used by the CalcEngine API
  // -------------------------------------------------------------------------
  evaluateFormulaValue(
    context: Worksheet | object,
    formula: string,
    baseRow = 0,
    baseCol = 0,
    useR1C1 = false,
    preserveArrayResult = false,
  ): unknown {
    const sheet = this.resolveContextSheet(context);
    if (!sheet) return error(ErrorCode.value);
    const ast = parseFormula(formula, { r1c1: useR1C1 });
    const ctx: EvalContext = {
      host: this,
      sheet,
      row: baseRow,
      col: baseCol,
      arrayMode: preserveArrayResult,
    };
    try {
      const result = this.evaluator.evaluate(ast, ctx);
      if (isReference(result)) {
        if (preserveArrayResult) return toMatrix(ctx, result);
        const scalarResult = implicitIntersect(ctx, result);
        return scalarResult === null ? 0 : scalarResult;
      }
      if (isArray(result)) return preserveArrayResult ? result.array : result.at(0, 0);
      if (isLambda(result)) return error(ErrorCode.value);
      return result === undefined ? null : result;
    } catch (thrown) {
      if (thrown instanceof ErrorThrown) return thrown.value;
      throw thrown;
    }
  }

  evaluateFormulaAsyncValue(
    context: Worksheet | object,
    formula: string,
    baseRow = 0,
    baseCol = 0,
  ): Promise<unknown> {
    try {
      return Promise.resolve(this.evaluateFormulaValue(context, formula, baseRow, baseCol));
    } catch (thrown) {
      return Promise.reject(thrown);
    }
  }

  private resolveContextSheet(context: Worksheet | object): Worksheet | undefined {
    if (context && typeof (context as Worksheet).getRowCount === 'function') return context as Worksheet;
    const record = context as Record<string, unknown>;
    const name = record.sheetName ?? record.name;
    if (typeof name === 'string') return this.sheetFromName(name);
    return this.workbook.sheets[0];
  }

  formulaRanges(formula: string, sheet: Worksheet, baseRow = 0, baseCol = 0, r1c1 = false): AreaRef[] {
    let ast: AstNode;
    try {
      ast = parseFormula(formula, { r1c1 });
    } catch {
      return [];
    }
    const ctx = this.contextFor(sheet, baseRow, baseCol);
    const result: AreaRef[] = [];
    for (const ref of collectRefs(ast)) {
      const value = this.evaluator.resolveRef(ref, ctx);
      if (isReference(value)) result.push(...value.areas);
    }
    return result;
  }

  astToExpression(ast: AstNode): unknown {
    return toExpression(ast);
  }

  expressionToText(expression: unknown, r1c1 = false): string {
    const ast = fromExpression(expression);
    return ast ? astToText(ast, { r1c1 }) : '';
  }

  get evaluatorInstance(): Evaluator {
    return this.evaluator;
  }
  get workbookRef(): Workbook {
    return this.workbook;
  }
  get functionNames(): string[] {
    return builtinNames();
  }
}

function columnNumber(letters: string): number {
  let col = 0;
  for (const ch of letters.toUpperCase()) col = col * 26 + ch.charCodeAt(0) - 64;
  return col - 1;
}

// ---------------------------------------------------------------------------
// AST transforms for sheet lifecycle
// ---------------------------------------------------------------------------
function renameSheetRefs(node: AstNode, oldName: string, newName: string): AstNode {
  const rename = (sheet: string | undefined) =>
    sheet && sheet.toLowerCase() === oldName.toLowerCase() ? newName : sheet;
  return mapAst(node, (current) => {
    if (current.kind === 'ref' || current.kind === 'name') return { ...current, sheet: rename(current.sheet) };
    return current;
  });
}

function invalidateSheetRefs(node: AstNode, sheetName: string): AstNode {
  return mapAst(node, (current) => {
    if (current.kind === 'ref' && current.sheet && current.sheet.toLowerCase() === sheetName.toLowerCase())
      return { kind: 'error', value: '#REF!' };
    return current;
  });
}

function mapAst(node: AstNode, map: (node: AstNode) => AstNode): AstNode {
  const visit = (current: AstNode): AstNode => {
    switch (current.kind) {
      case 'range':
        return { ...current, start: visit(current.start), end: visit(current.end) };
      case 'union':
        return { ...current, parts: current.parts.map(visit) };
      case 'intersect':
        return { ...current, left: visit(current.left), right: visit(current.right) };
      case 'binary':
        return { ...current, left: visit(current.left), right: visit(current.right) };
      case 'unary':
        return { ...current, operand: visit(current.operand) };
      case 'percent':
        return { ...current, operand: visit(current.operand) };
      case 'paren':
        return { ...current, inner: visit(current.inner) };
      case 'function':
        return { ...current, args: current.args.map(visit) };
      case 'spill':
        return { ...current, ref: visit(current.ref) };
      case 'call':
        return { ...current, callee: visit(current.callee), args: current.args.map(visit) };
      case 'array':
        return current;
      default:
        return map(current);
    }
  };
  return visit(node);
}

// ---------------------------------------------------------------------------
// Public expression tree conversion
// ---------------------------------------------------------------------------
export interface PublicExpression {
  type: number;
  [key: string]: unknown;
}

function toExpression(node: AstNode): PublicExpression {
  switch (node.kind) {
    case 'number':
      return { type: 2, value: node.value };
    case 'string':
      return { type: 3, value: node.value };
    case 'boolean':
      return { type: 4, value: node.value };
    case 'error':
      return { type: 5, value: node.value };
    case 'missing':
      return { type: 11 };
    case 'name':
      return { type: 8, name: node.name, sheet: node.sheet };
    case 'ref':
      return {
        type: 1,
        row: node.r1,
        column: node.c1,
        rowCount: node.r2 - node.r1 + 1,
        columnCount: node.c2 - node.c1 + 1,
        sheet: node.sheet,
        wholeRow: node.wholeRow,
        wholeCol: node.wholeCol,
        _node: node,
      };
    case 'range':
      return { type: 9, operator: ':', left: toExpression(node.start), right: toExpression(node.end) };
    case 'union':
      return { type: 9, operator: ',', arguments: node.parts.map(toExpression) };
    case 'intersect':
      return { type: 9, operator: ' ', left: toExpression(node.left), right: toExpression(node.right) };
    case 'binary':
      return { type: 9, operator: node.op, left: toExpression(node.left), right: toExpression(node.right) };
    case 'unary':
      return { type: 9, operator: node.op, argument: toExpression(node.operand) };
    case 'percent':
      return { type: 9, operator: '%', argument: toExpression(node.operand) };
    case 'paren':
      return { type: 10, argument: toExpression(node.inner) };
    case 'function':
      return {
        type: 7,
        functionName: node.name,
        arguments: node.args.map(toExpression),
        _args: node.args,
        _name: node.name,
      };
    case 'array':
      return { type: 6, value: node.rows.map((row) => row.map(renderArrayValue)) };
    case 'spill':
      return { type: 12, argument: toExpression(node.ref) };
    case 'structured':
      return { type: 13, table: node.table, spec: node.spec };
    case 'call':
      return {
        type: 7,
        functionName: '(call)',
        callee: toExpression(node.callee),
        arguments: node.args.map(toExpression),
      };
  }
}

function renderArrayValue(node: AstNode): unknown {
  if (node.kind === 'number') return node.value;
  if (node.kind === 'string') return node.value;
  if (node.kind === 'boolean') return node.value;
  if (node.kind === 'error') return new CalcError(node.value);
  return null;
}

function fromExpression(expression: unknown): AstNode | undefined {
  const expr = expression as Record<string, unknown> | undefined;
  if (!expr || typeof expr.type !== 'number') return undefined;
  switch (expr.type) {
    case 2:
      return { kind: 'number', value: Number(expr.value), raw: String(expr.value) };
    case 3:
      return { kind: 'string', value: String(expr.value) };
    case 4:
      return { kind: 'boolean', value: Boolean(expr.value) };
    case 5:
      return { kind: 'error', value: String(expr.value) };
    case 8:
      return { kind: 'name', name: String(expr.name), sheet: expr.sheet as string | undefined };
    case 1: {
      if (expr._node) return expr._node as AstNode;
      const row = Number(expr.row ?? 0);
      const col = Number(expr.column ?? 0);
      const rowCount = Number(expr.rowCount ?? 1);
      const colCount = Number(expr.columnCount ?? 1);
      return {
        kind: 'ref',
        sheet: expr.sheet as string | undefined,
        r1: row,
        c1: col,
        r2: row + rowCount - 1,
        c2: col + colCount - 1,
        r1Rel: false,
        c1Rel: false,
        r2Rel: false,
        c2Rel: false,
        r1Abs: true,
        c1Abs: true,
        r2Abs: true,
        c2Abs: true,
        wholeRow: Boolean(expr.wholeRow),
        wholeCol: Boolean(expr.wholeCol),
      };
    }
    case 7: {
      const args =
        (expr.arguments as unknown[] | undefined)
          ?.map(fromExpression)
          .filter((item): item is AstNode => Boolean(item)) ?? [];
      if (expr.callee) {
        const callee = fromExpression(expr.callee);
        if (!callee) return undefined;
        return { kind: 'call', callee, args };
      }
      return { kind: 'function', name: String(expr.functionName ?? ''), args };
    }
    case 9: {
      const operator = String(expr.operator ?? '');
      const argument = expr.argument ? fromExpression(expr.argument) : undefined;
      if (argument && (operator === '-' || operator === '+' || operator === '@'))
        return { kind: 'unary', op: operator as '-' | '+' | '@', operand: argument };
      if (argument && operator === '%') return { kind: 'percent', operand: argument };
      if (operator === ',') {
        const parts =
          (expr.arguments as unknown[] | undefined)
            ?.map(fromExpression)
            .filter((item): item is AstNode => Boolean(item)) ?? [];
        return parts.length ? { kind: 'union', parts } : undefined;
      }
      const left = expr.left ? fromExpression(expr.left) : undefined;
      const right = expr.right ? fromExpression(expr.right) : undefined;
      if (!left || !right) return undefined;
      if (operator === ':') return { kind: 'range', start: left, end: right };
      if (operator === ' ') return { kind: 'intersect', left, right };
      return { kind: 'binary', op: operator, left, right };
    }
    case 10: {
      const inner = expr.argument ? fromExpression(expr.argument) : undefined;
      return inner ? { kind: 'paren', inner } : undefined;
    }
    case 11:
      return { kind: 'missing' };
    default:
      return undefined;
  }
}
