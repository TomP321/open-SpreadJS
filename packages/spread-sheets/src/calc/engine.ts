import { BarcodeExValue, ImageExValue, SparklineExValue } from './values.js';
import type { SparklineFunctionEntry } from '../features/sparkline-ex.js';
/**
 * Calculation engine: dependency tracking, incremental recalculation, dynamic
 * array spills and iterative circular reference solving.
 */
import type { Workbook, Worksheet } from '../model.js';
import { AstNode, RefNode, astToText, collectRefs, containsFunction, parseFormula, translateRefs } from './parser.js';
import { AreaRef, CalcArray, CalcError, ScalarValue, Value, ReferenceValue, isReference } from './values.js';
import { EvalContext, EvalHost, Evaluator, builtinNames } from './evaluate.js';
import { getGlobalFunction } from './functions-api.js';

import { NAME_MARKERS, fromExpression, hasNameNodes, invalidateSheetRefs, renameSheetRefs, toExpression } from './engine-ast.js';

import type { CalcFunction } from './functions-api.js';
import {
  parseStructuredSpec,
  registerStructuredDependencies,
  registerTableNameDependencies,
  resolveStructured,
  resolveStructuredAreas,
  validate,
  validateStructured,
} from './engine-structured.js';
import {
  addRangeDependency,
  adjustStructure,
  bindCustomFunctions,
  collectDirty,
  dependentsOf,
  formulasInRange,
  indexFormula,
  installFormula,
  isLocalVar,
  isVolatileAst,
  loadFormulas,
  moveRange,
  registerExistingFormula,
  registerNameDependencies,
  registerRef,
  registerStoredFormula,
  rebuildFormulas,
  removeFormula,
  resolveName,
  unindexFormula,
  upstreamFormulas,
} from './engine-deps.js';
import {
  circularReferences,
  dependentsOfCell,
  formulaCellAt,
  formulaInformationOf,
  precedentsOf,
  type CellsInfo,
  type FormulaInfo,
} from './engine-introspect.js';
import {
  applyArrayFormula,
  applySpill,
  calculate,
  clearSpill,
  computeFormula,
  detachSpillCell,
  evaluateFormula,
  evaluateFormulaAsyncValue,
  evaluateFormulaValue,
  findCycles,
  getSpillRange,
  solveCircular,
  spillBlocked,
} from './engine-eval.js';
import './functions/index.js';

export interface FormulaCell {
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
  /**
   * Recalculation scratch stamps. `walkedAt` guards one dependents walk per
   * key inside one `collectDirty` run; `dirtyAt` marks membership in that run's
   * dirty set; `cycleAt` marks cycle membership from the newest cycle scan;
   * `doneAt` marks cells the newest topological pass has computed. A stamp is
   * valid only while it equals the engine's current token for that pass.
   */
  walkedAt?: number;
  dirtyAt?: number;
  cycleAt?: number;
  doneAt?: number;
  /** Scratch fields of the `findCycles` Tarjan scan; `cycScan` holds the scan token that makes them valid. */
  cycScan?: number;
  cycIndex?: number;
  cycLow?: number;
  cycIt?: number;
  cycOnStack?: boolean;
  context?: EvalContext;
  args?: import('./evaluate.js').Args;
  /**
   * The user-registered functions this formula resolved when it was parsed.
   *
   * The trial keeps a parsed formula working after `removeCustomFunction` or
   * `clearCustomFunctions` - the value it produced stays cached and it keeps
   * evaluating with the function it was built with - and only a re-parsed
   * formula (a new `setFormula`, or `calculate(CalculationType.rebuild)`)
   * answers `#NAME?` for the removed name.
   */
  customs?: Map<string, CalcFunction>;
}

export interface SpillInfo {
  rowCount: number;
  colCount: number;
  cells: { sheet: Worksheet; row: number; col: number }[];
}

export interface RangeDep {
  sheetId: number;
  r1: number;
  c1: number;
  r2: number;
  c2: number;
  /** The reference was written as a whole column (`A:A`) or whole row (`1:1`). */
  whole?: 'col' | 'row';
}

export interface RangeEntry extends RangeDep {
  id: string;
  key: string;
  long: boolean;
}

export interface Change {
  sheet: Worksheet;
  row: number;
  col: number;
  /** The engine key, carried along so dirty collection does not rebuild it. */
  key?: string;
}


export class CalcEngine implements EvalHost {
  readonly workbook: Workbook;
  readonly evaluator: Evaluator;
  sheetIds = new WeakMap<Worksheet, number>();
  nextSheetId = 1;
  readonly formulas = new Map<string, FormulaCell>();
  readonly bySheet = new Map<number, Map<string, FormulaCell>>();
  /** Reverse edges for exact single-cell dependencies: a lone dependent is stored as the key itself, multiple ones as a Set. */
  readonly cellDependents = new Map<string, string | Set<string>>();
  readonly rangeEntries = new Map<string, RangeEntry>();
  readonly rowBuckets = new Map<number, Map<number, Set<RangeEntry>>>();
  readonly longRanges = new Map<number, RangeEntry[]>();
  readonly pending: Change[] = [];
  readonly cycleCells = new Set<string>();
  readonly volatileCells = new Set<string>();
  readonly customFunctions = new Map<string, CalcFunction>();
  readonly sheetFunctions = new WeakMap<Worksheet, Map<string, CalcFunction>>();
  readonly globalFunctions = new Map<string, CalcFunction>();
  /** SparklineEx registrations (`Workbook.addSparklineEx`). */
  readonly sparklineFunctions = new Map<string, SparklineFunctionEntry>();
  readonly nameCache = new Map<string, { text: string; r1c1: boolean; ast: AstNode }>();
  readonly spillOwners = new Map<string, string>();
  readonly spillTouched = new Set<string>();
  /** Formula keys per sheet column/row (a lone key is stored as the string itself, several as a Set). */
  readonly formulaColumns = new Map<number, Map<number, string | Set<string>>>();
  readonly columnRanges = new Map<number, Map<number, Set<RangeEntry>>>();
  readonly singleRowRanges = new Map<number, Map<number, Set<RangeEntry>>>();
  readonly formulaRows = new Map<number, Map<number, string | Set<string>>>();
  graphVersion = 0;
  /**
   * Memo of `formulasInRange` results keyed by the range dep, valid only while
   * `rangeMemoVersion === graphVersion`. Bulk-loaded sheets repeat identical
   * wide deps (e.g. 16k formulas all reading one $W$1:$X$500 table); without
   * the memo every topo build re-scans the full row span of each occurrence.
   */
  readonly rangeDepMemo = new Map<string, FormulaCell[]>();
  rangeMemoVersion = -1;
  /** findCycles scratch: token of the newest Tarjan scan and the graph version it fully covered. */
  cycleScanToken = 0;
  cycleScanVersion = -1;
  /** All cycle members of the full formula graph at `cycleScanVersion` (Tarjan scratch lives on the cells). */
  cachedCycles = new Set<string>();
  /**
   * Every formula cell in evaluation order (dependencies before dependents),
   * produced as a side effect of the full-graph Tarjan scan and valid while
   * `topoVersion === graphVersion`. SCC members are appended together, so a
   * cycle is a contiguous block that the caller can detect with `cycleAt`.
   */
  topoOrder: FormulaCell[] | undefined;
  topoVersion = -1;
  /** Tokens for the numeric scratch stamps (`dirtyAt`, `walkedAt`, `doneAt`, `cycleAt`). */
  dirtyToken = 0;
  doneToken = 0;
  cycleToken = 0;
  recalculating = false;
  minimal = false;
  orderCounter = 0;
  lastParsed: { text: string; r1c1: boolean; ast: AstNode } | undefined;
  nameDepth = 0;

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
    if (value instanceof Date || value instanceof SparklineExValue || value instanceof BarcodeExValue || value instanceof ImageExValue) return value;
    if (value instanceof CalcError) return value;
    if (value instanceof CalcArray) return value.at(0, 0);
    if (value && typeof value === 'object' && 'error' in value)
      return new CalcError(String((value as { error: unknown }).error));
    return String(value);
  }

  getSpillRange(sheet: Worksheet, row: number, col: number): AreaRef | undefined {
    return getSpillRange(this, sheet, row, col);
  }

  resolveName(name: string, sheet: Worksheet): { ast: AstNode; baseRow: number; baseCol: number } | undefined {
    return resolveName(this, name, sheet);
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

  /** A user-registered function only (sheet, workbook or global custom scope). */
  getRegisteredFunction(name: string, sheet: Worksheet): CalcFunction | undefined {
    const upper = name.toUpperCase();
    return (
      this.sheetFunctions.get(sheet)?.get(upper) ??
      this.customFunctions.get(upper) ??
      this.globalFunctions.get(upper)
    );
  }

  /**
   * The user function the formula cell at this position resolved when its
   * formula was parsed, or `undefined` when the name was not a registered
   * custom function then (built-ins and later registrations resolve live).
   */
  boundFunction(name: string, sheet: Worksheet, row: number, col: number): CalcFunction | undefined {
    return this.formulas.get(this.key(sheet, row, col))?.customs?.get(name.toUpperCase());
  }

  bindCustomFunctions(cell: FormulaCell): void {
    bindCustomFunctions(this, cell);
  }

  /**
   * Re-creates the function bindings of a cell whose formula text did not
   * change. The trial re-parses on every `setFormula`, so a name whose
   * registration was removed in the meantime stops resolving there.
   */
  rebindFormula(sheet: Worksheet, row: number, col: number): void {
    const key = this.key(sheet, row, col);
    const cell = this.formulas.get(key);
    if (!cell) return;
    // Only the bindings are re-resolved: the formula text, the stored value and
    // any spill output stay, and the dependency graph is untouched.
    cell.customs = undefined;
    this.bindCustomFunctions(cell);
    this.pending.push({ sheet, row, col, key });
  }

  sheetFromName(name: string): Worksheet | undefined {
    return this.workbook.sheets.find((sheet) => sheet.name().toLowerCase() === name.toLowerCase());
  }

  r1c1Cache: boolean | undefined;
  dynamicCache: boolean | undefined;

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
  sheetId(sheet: Worksheet): number {
    let id = this.sheetIds.get(sheet);
    if (!id) this.sheetIds.set(sheet, (id = this.nextSheetId++));
    if (!this.bySheet.has(id)) {
      this.bySheet.set(id, new Map());
      this.rowBuckets.set(id, new Map());
      this.longRanges.set(id, []);
    }
    return id;
  }

  key(sheet: Worksheet, row: number, col: number): string {
    return `${this.sheetId(sheet)}:${row}:${col}`;
  }
  keyFor(sheetId: number, row: number, col: number): string {
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
    const text = this.parseFormulaText(sheet, formula);
    this.validateStructured(this.compile(formula), sheet, row, col);
    return text;
  }

  parseFormulaText(sheet: Worksheet, formula: string, r1c1 = this.isR1C1()): string {
    const ast = this.compile(formula, r1c1);
    this.validate(ast, sheet);
    return astToText(ast, { r1c1 });
  }

  compile(formula: string, r1c1 = this.isR1C1()): AstNode {
    if (this.lastParsed && this.lastParsed.text === formula && this.lastParsed.r1c1 === r1c1)
      return this.lastParsed.ast;
    const ast = parseFormula(formula, { r1c1 });
    this.lastParsed = { text: formula, r1c1, ast };
    return ast;
  }

  validate(ast: AstNode, sheet: Worksheet): void {
    validate(this, ast, sheet);
  }

  formulaChanged(
    sheet: Worksheet,
    row: number,
    col: number,
    formula: string | null,
    /**
     * AST already parsed from this exact text by the public `setFormula`
     * validation (via `parseFormula`). The write path then defers registration
     * while the calc service is suspended; handing the AST along saves parsing
     * the same text a second time on the flush.
     */
    parsedAst?: AstNode,
    parsedR1c1?: boolean,
    /**
     * `true` when the caller knows the cell had no stored formula, so no
     * engine registration can exist for it (the write path keeps the two in
     * lockstep) and the removal step is a guaranteed miss.
     */
    knownUnregistered?: boolean,
  ): void {
    this.sheetId(sheet);
    const key = this.key(sheet, row, col);
    if (!knownUnregistered) this.removeFormula(key);
    this.detachSpillCell(sheet, row, col, false);
    if (formula) {
      // A leading `=` was stripped on write already; only slice when present
      // (a regex replace per registered formula shows up in bulk profiles).
      const text = formula.charCodeAt(0) === 61 /* '=' */ ? formula.slice(1) : formula;
      let ast: AstNode | undefined = parsedAst && parsedR1c1 === this.isR1C1() ? parsedAst : undefined;
      if (!ast) {
        try {
          ast = this.compile(text);
        } catch {
          ast = undefined;
        }
      }
      if (ast) {
        // The reused write-side AST was rendered to `text` by `parseFormula`
        // itself, so `text` is already canonical; otherwise skip the
        // re-render when the input text matches what the AST would print.
        let canonical = text;
        if (ast !== parsedAst || parsedR1c1 !== this.isR1C1()) {
          const rendered = astToText(ast, { r1c1: this.isR1C1() });
          if (rendered !== text) canonical = rendered;
        }
        this.installFormula(sheet, row, col, ast, canonical, false, key);
      }
    }
    this.pending.push({ sheet, row, col, key });
  }

  valueChanged(sheet: Worksheet, row: number, col: number): void {
    this.detachSpillCell(sheet, row, col, true);
    const key = this.key(sheet, row, col);
    const storeFormula = sheet.getFormula(row, col);
    // A plain value write over a formula cell removes its registration.
    if (this.formulas.has(key)) {
      if (storeFormula === null) this.removeFormula(key);
    } else if (storeFormula && !sheet._arrayFormula(row, col)) {
      // While the calculation service is suspended the write queue keeps one
      // notification per cell (latest wins), so a `setFormula` + `setValue`
      // pair on the same cell arrives here as a value notification only - the
      // formula text is already in the store but was never registered.
      // Register it now; the evaluation pass below overwrites the plain value
      // with the formula result, matching the un-suspended behaviour.
      this.formulaChanged(sheet, row, col, storeFormula);
    }
    this.pending.push({ sheet, row, col, key });
  }

  /** Called before a user write so spill ownership can be revoked. */
  cellWriting(sheet: Worksheet, row: number, col: number): void {
    this.detachSpillCell(sheet, row, col, true);
  }

  /** Registers a formula already present in a cell (e.g. after JSON import). */
  registerExistingFormula(sheet: Worksheet, row: number, col: number, formula: string): void {
    registerExistingFormula(this, sheet, row, col, formula);
  }

  /** Parses a structured reference spec into tokens. */
  parseStructuredSpec(spec: string): { special: string[]; columns: string[]; columnRange: [string, string] | null; thisRow: boolean } {
    return parseStructuredSpec(this, spec);
  }
  /** Excel resolves an unqualified `[Column]` reference against the table that
   *  contains the formula cell (falling back to the sheet's single table). */
  implicitTableName(sheet: Worksheet, row: number, col: number): string {
    const tables = (sheet.tables?.all() ?? []) as Array<{ name(): unknown; range(): { contains(row: number, col: number): boolean } }>;
    const inside = tables.find((table) => table.range().contains(row, col));
    return inside ? String(inside.name()) : tables.length === 1 ? String(tables[0]!.name()) : '';
  }
  /** Resolves a structured reference to sheet areas. */
  resolveStructuredAreas(
    table: string,
    spec: string,
    sheet: Worksheet,
    row: number,
    col: number,
  ): AreaRef[] | undefined {
    return resolveStructuredAreas(this, table, spec, sheet, row, col);
  }
  /** Evaluation hook for structured references. */
  resolveStructured(table: string, spec: string, sheet: Worksheet, row: number, col: number): Value {
    return resolveStructured(this, table, spec, sheet, row, col);
  }
  /** Validates structured references in a formula. */
  validateStructured(ast: AstNode, sheet: Worksheet, row: number, col: number): void {
    validateStructured(this, ast, sheet, row, col);
  }
  installFormula(
    sheet: Worksheet,
    row: number,
    col: number,
    ast: AstNode,
    text: string,
    preserveValue: boolean,
    key?: string,
  ): void {
    installFormula(this, sheet, row, col, ast, text, preserveValue, key);
  }

  isVolatileAst(ast: AstNode, sheet: Worksheet): boolean {
    return isVolatileAst(this, ast, sheet);
  }

  registerDependencies(cell: FormulaCell): void {
    const refs = collectRefs(cell.ast);
    for (const ref of refs) this.registerRef(cell, ref);
    this.registerStructuredDependencies(cell);
    this.registerTableNameDependencies(cell);
    // Names may contain their own references; register those too.
    if (containsFunction(cell.ast, NAME_MARKERS) || hasNameNodes(cell.ast))
      this.registerNameDependencies(cell, cell.ast);
  }

  registerNameDependencies(cell: FormulaCell, node: AstNode): void {
    registerNameDependencies(this, cell, node);
  }

  /**
   * Registers the references a defined name resolves to. `node` is the name's
   * expression already re-based at the cell that uses it (`A1`-style names are
   * shifted, `R1C1`-style names keep their offsets and resolve through the
   * origin, which is that same cell).
   */
  registerNameRefs(cell: FormulaCell, node: AstNode, originRow?: number, originCol?: number): void {
    for (const ref of collectRefs(node)) this.registerRef(cell, ref, originRow, originCol);
  }

  /** Detects whether a name is a LET/LAMBDA parameter (not a sheet name). */
  isLocalVar(ast: AstNode, name: string): boolean {
    return isLocalVar(this, ast, name);
  }

  registerRef(cell: FormulaCell, node: RefNode, baseRow?: number, baseCol?: number): void {
    registerRef(this, cell, node, baseRow, baseCol);
  }
  /**
   * Records that a formula reads a range of another workbook
   * (`=[Book1.xlsx]Sheet1!A1:B2`), the way the trial lists it in
   * `Workbook.getExternalReferences`.
   */
  registerExternalReference(cell: FormulaCell, node: RefNode): void {
    const external = node.external;
    if (!external) return;
    const store = this.workbook._externalReferences();
    if (!store) return;
    const wholeColumn = Boolean(node.wholeCol || node.colOnly);
    const wholeRowFlag = Boolean(node.wholeRow || node.rowOnly);
    store.registerItem(external.name, external.path, external.sheet, {
      target: { row: cell.row, col: cell.col, sheetName: cell.sheet.name() },
      source: {
        row: wholeColumn ? -1 : node.r1,
        col: wholeRowFlag ? -1 : node.c1,
        rowCount: wholeColumn ? -1 : node.r2 - node.r1 + 1,
        colCount: wholeRowFlag ? -1 : node.c2 - node.c1 + 1,
        sheetName: external.sheet,
      },
    });
  }
  /** Loaded values of one sheet of a referenced workbook. */
  externalValues(name: string, sheetName: string): Map<number, Map<number, unknown>> | undefined {
    return this.workbook._externalReferences()?.sheetValues(name, sheetName);
  }
  /** Marks the formulas that read a workbook whose values just changed. */
  externalValuesChanged(name: string): void {
    const store = this.workbook._externalReferences();
    if (!store) return;
    for (const entry of store.entries()) {
      if (entry.name !== name) continue;
      for (const item of entry.items) {
        const sheet = this.sheetFromName(item.target.sheetName);
        if (!sheet) continue;
        this.pending.push({ sheet, row: item.target.row, col: item.target.col });
      }
    }
  }
  addRangeDependency(cell: FormulaCell, sheet: Worksheet, r1: number, c1: number, r2: number, c2: number, whole?: 'col' | 'row'): void {
    addRangeDependency(this, cell, sheet, r1, c1, r2, c2, whole);
  }
  /** Resolves a bare table name to its data range. */
  resolveTableName(name: string, sheet: Worksheet): Value | undefined {
    const table = sheet.tables?.findByName(name);
    if (!table) return undefined;
    const data = table.dataRange();
    return new ReferenceValue([{ sheet, r1: data.row, c1: data.col, r2: data.row + data.rowCount - 1, c2: data.col + data.colCount - 1 }]);
  }
  registerTableNameDependencies(cell: FormulaCell): void {
    registerTableNameDependencies(this, cell);
  }
  registerStructuredDependencies(cell: FormulaCell): void {
    registerStructuredDependencies(this, cell);
  }
  /** Rebuilds formulas after table definitions changed. */
  tablesChanged(): void {
    this.rebuildFormulas(true);
  }

  indexFormula(sheetId: number, row: number, col: number, key: string): void {
    indexFormula(this, sheetId, row, col, key);
  }

  unindexFormula(sheetId: number, row: number, col: number, key: string): void {
    unindexFormula(this, sheetId, row, col, key);
  }

  addCellDependency(cell: FormulaCell, dependencyKey: string): void {
    cell.cellDeps.push(dependencyKey);
    const existing = this.cellDependents.get(dependencyKey);
    if (existing === undefined) this.cellDependents.set(dependencyKey, cell.key);
    else if (typeof existing === 'string') {
      if (existing !== cell.key) this.cellDependents.set(dependencyKey, new Set([existing, cell.key]));
    } else existing.add(cell.key);
  }

  removeFormula(key: string): void {
    removeFormula(this, key);
  }

  clearSpill(cell: FormulaCell): void {
    clearSpill(this, cell);
  }

  spillBlocked(cell: FormulaCell, rowCount: number, colCount: number): boolean {
    return spillBlocked(this, cell, rowCount, colCount);
  }

  applySpill(cell: FormulaCell, array: CalcArray): void {
    applySpill(this, cell, array);
  }

  // -------------------------------------------------------------------------
  // Recalculation
  // -------------------------------------------------------------------------
  /**
   * `true` while the engine still holds queued work: cells marked dirty by a
   * change that arrived while the calculation service was suspended (an external
   * workbook value, a rebuilt formula) or cells inside a calculation cycle.
   */
  hasPendingWork(): boolean {
    return this.pending.length > 0 || this.cycleCells.size > 0;
  }

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
      const topoRun = this.evaluateTopologicalRun(dirty, type);
      const done = new Set<string>();
      if (!topoRun) {
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
        if (this.cycleCells.size) this.solveCircular(type !== undefined);
        for (const key of deferred) if (this.formulas.has(key)) this.evaluateFormula(key, done, new Set());
      }
      // Re-evaluate formulas that depend on spilled cells whose values changed.
      if (this.spillTouched.size) {
        // The spill pass must see which cells the run already evaluated; the
        // topological pass keeps that in the `doneAt` stamps, so materialize
        // it lazily, only when spills were actually touched this run.
        if (topoRun && this.topoOrder)
          for (const cell of this.topoOrder) if (cell.doneAt === this.doneToken) done.add(cell.key);
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

  /**
   * Evaluates the dirty cells by a single scan of the cached topological order
   * (every cell's precedents appear before it), which replaces the per-key
   * `done`/`deferred`/`upstream` work of the generic walk with integer stamp
   * comparisons. Used for a whole-workbook calculation and for dirty sets that
   * cover enough of the graph for the scan to beat the per-cell graph walks;
   * small dirty sets keep the graph walk so the cost stays proportional to the
   * changes. Returns `false` when no fresh topological order is available (or
   * the set is small) and the caller must use the generic walk.
   */
  evaluateTopologicalRun(dirty: Set<string>, type?: number): boolean {
    const order = this.topoOrder;
    if (!order || this.topoVersion !== this.graphVersion) return false;
    const size = order.length;
    if (size > 32 && dirty.size * 16 < size) return false;
    const dirtyAt = this.dirtyToken;
    const cycleAt = this.cycleToken;
    const run = ++this.doneToken;
    const hasCycles = this.cycleCells.size > 0;
    let afterCycle: FormulaCell[] | undefined;
    for (const cell of order) {
      if (cell.dirtyAt !== dirtyAt) continue;
      if (cell.cycleAt === cycleAt) continue; // `solveCircular` evaluates cycle cells
      if (hasCycles) {
        // Blocked when a dirty precedent has not been computed yet: it either
        // waits behind a cycle (the cycle is solved by `solveCircular` after
        // this scan) or is itself waiting in `afterCycle` - topological order
        // guarantees it is evaluated first there.
        const upstream = cell.upstream;
        let blocked = false;
        if (upstream)
          for (const dependency of upstream)
            if (dependency.dirtyAt === dirtyAt && dependency.doneAt !== run) {
              blocked = true;
              break;
            }
        if (blocked) {
          (afterCycle ??= []).push(cell);
          continue;
        }
      }
      cell.doneAt = run;
      this.computeFormula(cell);
    }
    if (hasCycles) this.solveCircular(type !== undefined);
    if (afterCycle)
      for (const cell of afterCycle)
        if (this.formulas.has(cell.key)) {
          cell.doneAt = run;
          this.computeFormula(cell);
        }
    return true;
  }

  collectDirty(all: boolean, changes: Change[] = []): Set<string> {
    return collectDirty(this, all, changes);
  }

  dependentsOf(key: string): string[] {
    return dependentsOf(this, key);
  }

  /** Formula cells inside a dependency range, using the sparse position index. */
  formulasInRange(dep: RangeDep): FormulaCell[] {
    return formulasInRange(this, dep);
  }

  upstreamFormulas(cell: FormulaCell): FormulaCell[] {
    return upstreamFormulas(this, cell);
  }

  evaluateFormula(key: string, done: Set<string>, deferred: Set<string>): void {
    evaluateFormula(this, key, done, deferred);
  }

  computeFormula(cell: FormulaCell): void {
    computeFormula(this, cell);
  }

  /** Writes a legacy array formula result over its fixed range. */
  applyArrayFormula(
    cell: FormulaCell,
    result: Value,
    range: { rowCount: number; colCount: number },
  ): void {
    applyArrayFormula(this, cell, result, range);
  }

  contextFor(sheet: Worksheet, row: number, col: number, arrayMode = false): EvalContext {
    return { host: this, sheet, row, col, arrayMode: arrayMode && this.allowDynamicArray() };
  }

  // -------------------------------------------------------------------------
  // Circular references
  // -------------------------------------------------------------------------
  findCycles(dirty: Set<string>): void {
    findCycles(this, dirty);
  }

  solveCircular(forward = false): void {
    solveCircular(this, forward);
  }

  // -------------------------------------------------------------------------
  // Spill ownership
  // -------------------------------------------------------------------------
  detachSpillCell(sheet: Worksheet, row: number, col: number, keepValue: boolean): void {
    detachSpillCell(this, sheet, row, col, keepValue);
  }

  // -------------------------------------------------------------------------
  // Public operations
  // -------------------------------------------------------------------------
  /** Clears every array-spill output on a sheet so a structural shift re-spills cleanly. */
  clearSpills(sheet: Worksheet): void {
    for (const cell of this.formulas.values())
      if (cell.sheet === sheet && cell.spill) this.clearSpill(cell);
  }

  /** Re-points references to a moved range and moves formula cells with it. */
  moveRange(
    sheet: Worksheet,
    fromRow: number,
    fromCol: number,
    toRow: number,
    toCol: number,
    rowCount: number,
    colCount: number,
  ): void {
    moveRange(this, sheet, fromRow, fromCol, toRow, toCol, rowCount, colCount);
  }

  recalcAll(type?: number): void {
    this.pending.length = 0;
    this.recalculate(undefined, true, type ?? 0);
  }

  calculate(type = 0, address?: string): void {
    calculate(this, type, address);
  }

  /** Rewrites formulas after a structural change and rebuilds the graph. */
  adjustStructure(
    sheet: Worksheet,
    axis: 'row' | 'col',
    index: number,
    amount: number,
    remove: boolean,
    crossStart?: number,
    crossEnd?: number,
  ): void {
    adjustStructure(this, sheet, axis, index, amount, remove, crossStart, crossEnd);
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
    rebuildFormulas(this, calculate);
  }

  registerStoredFormula(sheet: Worksheet, row: number, col: number, formula: string): void {
    registerStoredFormula(this, sheet, row, col, formula);
  }

  /** Loads cached formula values without recalculating (JSON import). */
  loadFormulas(): void {
    loadFormulas(this);
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
  /**
   * SparklineEx registrations (`Workbook.addSparklineEx`) live in their own
   * table: the trial's `getCustomFunction`/`getRegisteredFunction` never see
   * them, but formula evaluation resolves them after the built-ins.
   */
  addSparklineFunction(fn: SparklineFunctionEntry): void {
    this.sparklineFunctions.set(fn.name.toUpperCase(), fn);
  }
  removeSparklineFunction(name: string): void {
    this.sparklineFunctions.delete(String(name).toUpperCase());
  }
  getSparklineFunction(name: string): CalcFunction | undefined {
    return this.sparklineFunctions.get(String(name).toUpperCase());
  }
  removeFunction(name: string, sheet?: Worksheet): void {
    if (sheet) this.sheetFunctions.get(sheet)?.delete(name.toUpperCase());
    else this.customFunctions.delete(name.toUpperCase());
  }
  /**
   * Drops the custom functions registered on one sheet (the public
   * `Worksheet.clearCustomFunctions`) or on the workbook
   * (`Workbook.clearCustomFunctions`). The other scope keeps its own entries,
   * exactly like the trial.
   */
  clearFunctions(sheet?: Worksheet): void {
    if (sheet) this.sheetFunctions.delete(sheet);
    else this.customFunctions.clear();
  }
  /** The public `Workbook.getCustomFunction`: workbook scope only. */
  getWorkbookFunction(name: string): CalcFunction | undefined {
    return this.customFunctions.get(name.toUpperCase());
  }
  /** The public `Worksheet.getCustomFunction`: this sheet's scope only. */
  getSheetFunction(sheet: Worksheet, name: string): CalcFunction | undefined {
    return this.sheetFunctions.get(sheet)?.get(name.toUpperCase());
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
    return evaluateFormulaValue(this, context, formula, baseRow, baseCol, useR1C1, preserveArrayResult);
  }

  evaluateFormulaAsyncValue(
    context: Worksheet | object,
    formula: string,
    baseRow = 0,
    baseCol = 0,
  ): Promise<unknown> {
    return evaluateFormulaAsyncValue(this, context, formula, baseRow, baseCol);
  }

  resolveContextSheet(context: Worksheet | object): Worksheet | undefined {
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

  // -------------------------------------------------------------------------
  // Formula introspection (Worksheet.getPrecedents / getDependents /
  // getFormulaInformation and Workbook.getCircularReference)
  // -------------------------------------------------------------------------
  /** The formula cell registered at this position, if any. */
  formulaCellAt(sheet: Worksheet, row: number, col: number): FormulaCell | undefined {
    return formulaCellAt(this, sheet, row, col);
  }
  /** Ranges the formula at this cell reads, in the trial's source order. */
  precedentsOf(sheet: Worksheet, row: number, col: number): CellsInfo[] {
    return precedentsOf(this, sheet, row, col);
  }
  /** Formula cells that read this cell, in the trial's registration order. */
  dependentsOfCell(sheet: Worksheet, row: number, col: number): CellsInfo[] {
    return dependentsOfCell(this, sheet, row, col);
  }
  /** Stored formula details of one cell, in the trial's key order. */
  formulaInformationOf(sheet: Worksheet, row: number, col: number, storedFormula?: string | null): FormulaInfo {
    return formulaInformationOf(this, sheet, row, col, storedFormula);
  }
  /** Cells the calculation engine currently considers circular. */
  circularReferences(): CellsInfo[] {
    return circularReferences(this);
  }
  /** Drops a workbook-scoped or sheet-scoped custom function. */
  removeCustomFunction(name: string, sheet?: Worksheet): void {
    this.removeFunction(name, sheet);
  }

  get evaluatorInstance(): Evaluator {
    return this.evaluator;
  }
  get workbookRef(): Workbook {
    return this.workbook;
  }
  formulaFunctionNames(sheet: Worksheet): string[] {
    return [...this.customFunctions.keys(), ...this.globalFunctions.keys(), ...(this.sheetFunctions.get(sheet)?.keys() ?? [])];
  }
  get functionNames(): string[] {
    return builtinNames();
  }
}

