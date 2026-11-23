/**
 * Evaluation and circular-reference handling of the calculation engine:
 * single-cell evaluation (sync/async), dynamic-array spill placement and
 * cycle finding/solving for iterative calculation.
 * Bodies moved out of `calc/engine.ts` unchanged (`this` renamed to the
 * `engine` parameter); the class keeps thin delegating methods.
 */

import type { Worksheet } from '../worksheet.js';
import { AreaRef, CalcError, CalcArray, ErrorCode, ErrorThrown, ScalarValue, Value, error, isArray, isLambda, isReference, normalizeNumber } from './values.js';

import { parseFormula } from './parser.js';
import { getActiveCalcLanguagePackage } from './language-packages.js';
import { columnNumber } from './engine-ast.js';
import { EvalContext, ExternalRangeArray, implicitIntersect, scalar, toMatrix } from './evaluate.js';
import type { CalcEngine, FormulaCell } from './engine.js';

export function evaluateFormula(engine: CalcEngine, key: string, done: Set<string>, deferred: Set<string>): void {
    if (done.has(key)) return;
    const target = engine.formulas.get(key);
    if (!target) return;
    if (!engine.cycleCells.has(key) && !deferred.has(key)) {
      const upstream = engine.upstreamFormulas(target);
      if (upstream.length === 0) {
        engine.computeFormula(target);
        done.add(key);
        return;
      }
      // Dirty keys arrive in registration order, so the usual case for a long
      // dependency chain is that every upstream formula is already computed.
      // Computing directly saves a frame stack plus a `visiting` set per cell.
      let ready = true;
      for (const dependency of upstream)
        if (dependency.key === key || engine.cycleCells.has(dependency.key) || deferred.has(dependency.key) || !done.has(dependency.key)) {
          ready = false;
          break;
        }
      if (ready) {
        engine.computeFormula(target);
        done.add(key);
        return;
      }
    }
    type Frame = { cell: FormulaCell; deps: FormulaCell[]; index: number; defer: boolean };
    const stack: Frame[] = [];
    const visiting = new Set<string>();
    const push = (cell: FormulaCell) => {
      stack.push({ cell, deps: engine.upstreamFormulas(cell), index: 0, defer: deferred.has(cell.key) });
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
        if (dependency.key === frame.cell.key || engine.cycleCells.has(dependency.key) || deferred.has(dependency.key)) {
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
      engine.computeFormula(frame.cell);
      done.add(frame.cell.key);
      visiting.delete(frame.cell.key);
      stack.pop();
    }
}

export function computeFormula(engine: CalcEngine, cell: FormulaCell): void {
    if (cell.row >= cell.sheet.getRowCount() || cell.col >= cell.sheet.getColumnCount()) {
      cell.value = null;
      return;
    }
    const arrayRange = cell.sheet._arrayFormula(cell.row, cell.col);
    const ctx = cell.context ?? (cell.context = engine.contextFor(cell.sheet, cell.row, cell.col, engine.allowDynamicArray()));
    ctx.arrayMode = engine.allowDynamicArray() || Boolean(arrayRange);
    let result: Value;
    try {
      result = engine.evaluator.evaluate(cell.ast, ctx);
    } catch (thrown) {
      if (thrown instanceof ErrorThrown) result = thrown.value;
      else if (thrown instanceof CalcError) result = thrown;
      else throw thrown;
    }
    if (isReference(result)) {
      const scalarResult = implicitIntersect(ctx, result);
      result = scalarResult === null ? 0 : scalarResult;
    }
    // Legacy scalar coercion of a loaded external range follows the same
    // implicit-intersection rules as internal references (trial probe
    // `io2:update-after`: 2x2 range in scalar position answers #VALUE!).
    if (result instanceof ExternalRangeArray && !ctx.arrayMode) result = scalar(ctx, result);
    // A lambda that reaches a cell has no scalar value to show: the trial (and
    // Excel) answers `#CALC!` for it.
    if (isLambda(result)) result = error(ErrorCode.calc);
    if (arrayRange) {
      engine.applyArrayFormula(cell, result, arrayRange);
      return;
    }
    if (isArray(result) && engine.allowDynamicArray()) engine.applySpill(cell, result);
    else {
      if (isArray(result)) result = result.at(0, 0);
      engine.clearSpill(cell);
      let value: ScalarValue = result === undefined ? null : (result as ScalarValue);
      if (typeof value === 'number') value = normalizeNumber(value);
      cell.value = value;
      cell.sheet._setCalculatedValue(cell.row, cell.col, value);
    }
}

export function evaluateFormulaValue(engine: CalcEngine,
    context: Worksheet | object,
    formula: string,
    baseRow = 0,
    baseCol = 0,
    useR1C1 = false,
    preserveArrayResult = false,
  ): unknown {
    const sheet = engine.resolveContextSheet(context);
    if (!sheet) return error(ErrorCode.value);
    // Public CalcEngine.evaluateFormula: user input, so the active language package applies.
    const ast = parseFormula(formula, { r1c1: useR1C1, language: getActiveCalcLanguagePackage() });
    const ctx: EvalContext = {
      host: engine,
      sheet,
      row: baseRow,
      col: baseCol,
      arrayMode: preserveArrayResult,
    };
    try {
      const result = engine.evaluator.evaluate(ast, ctx);
      if (isReference(result)) {
        if (preserveArrayResult) return toMatrix(ctx, result);
        const scalarResult = implicitIntersect(ctx, result);
        return scalarResult === null ? 0 : scalarResult;
      }
      if (isArray(result)) return preserveArrayResult ? result.array : (result instanceof ExternalRangeArray ? scalar(ctx, result) : result.at(0, 0));
      if (isLambda(result)) return error(ErrorCode.value);
      return result === undefined ? null : result;
    } catch (thrown) {
      if (thrown instanceof ErrorThrown) return thrown.value;
      throw thrown;
    }
}

export function evaluateFormulaAsyncValue(engine: CalcEngine,
    context: Worksheet | object,
    formula: string,
    baseRow = 0,
    baseCol = 0,
  ): Promise<unknown> {
    try {
      return Promise.resolve(engine.evaluateFormulaValue(context, formula, baseRow, baseCol));
    } catch (thrown) {
      return Promise.reject(thrown);
    }
}

export function applySpill(engine: CalcEngine, cell: FormulaCell, array: CalcArray): void {
    const rowCount = array.rowCount;
    const colCount = array.colCount;
    if (rowCount <= 1 && colCount <= 1) {
      engine.clearSpill(cell);
      cell.spill = { rowCount: 1, colCount: 1, cells: [] };
      cell.value = array.at(0, 0);
      cell.sheet._setCalculatedValue(cell.row, cell.col, cell.value);
      return;
    }
    if (engine.spillBlocked(cell, rowCount, colCount)) {
      engine.clearSpill(cell);
      cell.value = error(ErrorCode.spill);
      cell.sheet._setCalculatedValue(cell.row, cell.col, cell.value);
      return;
    }
    engine.clearSpill(cell);
    const cells: { sheet: Worksheet; row: number; col: number }[] = [];
    for (let r = 0; r < rowCount; r++)
      for (let c = 0; c < colCount; c++) {
        if (!r && !c) continue;
        const row = cell.row + r,
          col = cell.col + c;
        const value = array.at(r, c);
        cell.sheet._setCalculatedValue(row, col, value);
        engine.spillOwners.set(engine.key(cell.sheet, row, col), cell.key);
        engine.spillTouched.add(engine.key(cell.sheet, row, col));
        cells.push({ sheet: cell.sheet, row, col });
      }
    cell.spill = { rowCount, colCount, cells };
    cell.value = array.at(0, 0);
    cell.sheet._setCalculatedValue(cell.row, cell.col, cell.value);
}

export function clearSpill(engine: CalcEngine, cell: FormulaCell): void {
    if (!cell.spill) return;
    for (const target of cell.spill.cells) {
      const targetKey = engine.key(target.sheet, target.row, target.col);
      if (engine.spillOwners.get(targetKey) === cell.key) {
        engine.spillOwners.delete(targetKey);
        target.sheet._setCalculatedValue(target.row, target.col, null);
      }
    }
    cell.spill = undefined;
}

export function spillBlocked(engine: CalcEngine, cell: FormulaCell, rowCount: number, colCount: number): boolean {
    if (cell.row + rowCount - 1 >= cell.sheet.getRowCount()) return true;
    if (cell.col + colCount - 1 >= cell.sheet.getColumnCount()) return true;
    for (let r = 0; r < rowCount; r++)
      for (let c = 0; c < colCount; c++) {
        if (!r && !c) continue;
        const row = cell.row + r,
          col = cell.col + c;
        const formula = engine.formulas.get(engine.key(cell.sheet, row, col));
        if (formula && formula !== cell) return true;
        const owner = engine.spillOwners.get(engine.key(cell.sheet, row, col));
        const value = cell.sheet.getValue(row, col);
        if (owner === cell.key) continue;
        if (value !== null && value !== undefined) return true;
      }
    return false;
}

export function applyArrayFormula(engine: CalcEngine,
    cell: FormulaCell,
    result: Value,
    range: { rowCount: number; colCount: number },
  ): void {
    const matrix: ScalarValue[][] = isArray(result)
      ? result.array.map((row) => row.map((item) => (item as ScalarValue)))
      : isReference(result)
        ? toMatrix(engine.contextFor(cell.sheet, cell.row, cell.col, true), result)
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

export function detachSpillCell(engine: CalcEngine, sheet: Worksheet, row: number, col: number, keepValue: boolean): void {
    if (!engine.spillOwners.size) return;
    const key = engine.key(sheet, row, col);
    const owner = engine.spillOwners.get(key);
    if (!owner) return;
    engine.spillOwners.delete(key);
    const cell = engine.formulas.get(owner);
    if (cell?.spill) {
      const oldValue = engine.getCellValue(sheet, row, col);
      cell.spill = { ...cell.spill, cells: cell.spill.cells.filter((item) => item.row !== row || item.col !== col) };
      if (!keepValue && oldValue !== null) engine.pending.push({ sheet, row, col });
      if (oldValue !== null) engine.spillTouched.add(key);
    }
    engine.pending.push({ sheet, row, col });
}

export function findCycles(engine: CalcEngine, dirty: Set<string>): void {
    // Cycle membership is derived from the formula graph, not from a per-run
    // traversal: a cell that stops being part of a cycle - because its own
    // formula or the formula that closed the loop was removed - leaves
    // `Workbook.getCircularReference`, while a cycle that is still intact stays
    // a member and keeps the values its iterations have accumulated.
    //
    // Tarjan runs once over the full graph and its result is cached until the
    // graph changes (`graphVersion`); repeated value-only recalculations reuse
    // the cache instead of re-traversing, and the scratch state of a scan lives
    // on the FormulaCells (`cyc*` fields, valid while `cycScan` equals the
    // current `cycleScanToken`).
    // Seeds are only tested for membership in the cycle set, never mutated, so
    // they are streamed from `dirty` (which already exists) instead of being
    // copied into a second Set: for an `all` recalculation of 100k formulas
    // without any cycle the copy was a full 100k-entry allocation for nothing.
    let hasSeed = false;
    for (const key of dirty) {
      if (engine.formulas.has(key)) {
        hasSeed = true;
        break;
      }
    }
    const survivors: string[] = [];
    for (const key of engine.cycleCells) {
      if (engine.formulas.has(key)) survivors.push(key);
      else engine.cycleCells.delete(key);
    }
    if (!hasSeed && !survivors.length) {
      engine.cycleCells.clear();
      return;
    }
    let cycles = engine.cachedCycles;
    if (engine.cycleScanVersion !== engine.graphVersion) {
      engine.cycleScanVersion = engine.graphVersion;
      const token = ++engine.cycleScanToken;
      cycles = new Set<string>();
      // Tarjan, iterative: `active` is the DFS frame stack (the resume cursor
      // lives on the FormulaCell as `cycIt`), `stack` is the Tarjan component
      // stack - members stay there until their component is drained at the
      // root, which is what the `onStack` test and the drain loop rely on.
      // Draining components in root order also yields a topological order of
      // the graph (every component drains after the components it depends on),
      // collected here as `order` for `evaluateTopologicalRun`.
      const active: FormulaCell[] = [];
      const stack: FormulaCell[] = [];
      const order: FormulaCell[] = [];
      let counter = 0;
      for (const start of engine.formulas.values()) {
        if (start.cycScan === token) continue;
        start.cycScan = token;
        start.cycIndex = counter;
        start.cycLow = counter++;
        start.cycIt = 0;
        start.cycOnStack = true;
        start.upstream = engine.upstreamFormulas(start);
        active.push(start);
        stack.push(start);
        while (active.length) {
          const cell = active[active.length - 1]!;
          const cellUpstream = cell.upstream!;
          if (cell.cycIt! < cellUpstream.length) {
            const dep = cellUpstream[cell.cycIt!++]!;
            if (dep.cycScan !== token) {
              dep.cycScan = token;
              dep.cycIndex = counter;
              dep.cycLow = counter++;
              dep.cycIt = 0;
              dep.cycOnStack = true;
              dep.upstream = engine.upstreamFormulas(dep);
              active.push(dep);
              stack.push(dep);
            } else if (dep.cycOnStack && dep.cycIndex! < cell.cycLow!) {
              cell.cycLow = dep.cycIndex;
            }
            continue;
          }
          active.pop();
          const finished = cell.upstream!;
          if (finished.length === 1 && finished[0] === cell) {
            // Self-loop: Tarjan sees it as a single-node component, which the
            // membership test below would drop; keep it explicitly.
            cell.cycLow = cell.cycIndex;
          }
          if (cell.cycLow === cell.cycIndex) {
            let members = 0;
            let member: FormulaCell;
            do {
              member = stack.pop()!;
              member.cycOnStack = false;
              order.push(member);
              cycles.add(member.key);
              members++;
            } while (member !== cell);
            if (members === 1 && !finished.some((item) => item === cell))
              cycles.delete(cell.key);
          }
        }
      }
      engine.cachedCycles = cycles;
      engine.topoOrder = order;
      engine.topoVersion = engine.graphVersion;
    }
    engine.cycleCells.clear();
    if (!cycles.size) return;
    const cycleToken = ++engine.cycleToken;
    for (const key of dirty) {
      if (!cycles.has(key)) continue;
      engine.cycleCells.add(key);
      const cell = engine.formulas.get(key);
      if (cell) cell.cycleAt = cycleToken;
    }
    for (const key of survivors) {
      if (!cycles.has(key)) continue;
      engine.cycleCells.add(key);
      const cell = engine.formulas.get(key);
      if (cell) cell.cycleAt = cycleToken;
    }
}

export function solveCircular(engine: CalcEngine, forward = false): void {
    const cells = [...engine.cycleCells]
      .map((key) => engine.formulas.get(key))
      .filter((cell): cell is FormulaCell => Boolean(cell));
    if (!cells.length) return;
    // The trial walks a cycle in the two directions that the trigger implies,
    // and both are visible through the public API (probe items in
    // `.probe/report-item4k.json`):
    // - an automatic recalculation walks the cell registered last: `=B1+1` and
    //   `=A1+1` with the default 1000 iterations read back 2001 and 2000
    //   (`iter-model.pairLazy`).
    // - `Workbook.calculate()` walks them in registration order: the same pair
    //   calculated that way reads back 3999 and 4000 (`iter-2x.doubleCycle`).
    // A self-referencing cycle has one cell, so both directions agree there and
    // `iter-2x` (6, 2, 16, 1000) and `iter-model.lazySelf` (3) match either way.
    cells.sort((a, b) => (forward ? a.order - b.order : b.order - a.order));
    const maxIterations = Math.max(
      1,
      Number(engine.workbook.options.iterativeCalculationMaximumIterations) || 1000,
    );
    const maxChange = Math.max(0, Number(engine.workbook.options.iterativeCalculationMaximumChange) ?? 0.01);
    if (engine.workbook.options.iterativeCalculation === false) {
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
        const previous = engine.getCellValue(cell.sheet, cell.row, cell.col);
        engine.computeFormula(cell);
        const next = cell.value;
        const previousNumber = previous === null ? 0 : previous;
        if (typeof previousNumber === 'number' && typeof next === 'number')
          maxDelta = Math.max(maxDelta, Math.abs(next - previousNumber));
        else if (!Object.is(previous, next)) maxDelta = Math.max(maxDelta, 1);
      }
      if (maxDelta < maxChange) break;
    }
}

export function calculate(engine: CalcEngine, type = 0, address?: string): void {
    engine.pending.length = 0;
    // `CalculationType.rebuild` (1) re-parses every stored formula first, which
    // is what drops the function bindings a formula took when it was parsed.
    if (type === 1) {
      engine.rebuildFormulas(false);
      engine.recalculate(undefined, true, type);
      return;
    }
    if (address) {
      const match = /(?:([^!]+)!)?([A-Za-z]+)(\d+)(?::([A-Za-z]+)(\d+))?/.exec(address.replace(/\$/g, ''));
      if (match) {
        const sheet = match[1] ? engine.sheetFromName(match[1]) : engine.workbook.getActiveSheet();
        if (sheet) {
          engine.pending.push({ sheet, row: Number(match[3]) - 1, col: columnNumber(match[2]!) });
          engine.recalculate(sheet, false, type);
          return;
        }
      }
    }
    if (type === 0 || type === 1) engine.recalculate(undefined, true, type);
    else engine.recalculate(undefined, false, type);
}

export function getSpillRange(engine: CalcEngine, sheet: Worksheet, row: number, col: number): AreaRef | undefined {
    const cell = engine.formulas.get(engine.key(sheet, row, col));
    if (!cell?.spill) return undefined;
    return {
      sheet,
      r1: cell.row,
      c1: cell.col,
      r2: cell.row + cell.spill.rowCount - 1,
      c2: cell.col + cell.spill.colCount - 1,
    };
}
