/**
 * Formula evaluator: turns an AST into a value, applying SpreadJS coercion
 * rules (numeric text conversion, implicit intersection, array semantics).
 */
import type { Worksheet } from '../model.js';
import {
  AstNode,
  BinaryNode,
  FunctionNode,
  RefNode,
  astToText,
  translateRefs,
} from './parser.js';
import {
  AreaRef,
  CalcArray,
  CalcError,
  ErrorCode,
  ErrorThrown,
  EvalEnvironment,
  LambdaValue,
  MISSING,
  Missing,
  MissingValue,
  ReferenceValue,
  ScalarValue,
  Value,
  compareText,
  dateToSerial,
  error,
  isArray,
  isError,
  isLambda,
  isMissing,
  isReference,
  lookupVar,
  normalizeNumber,
  numberToText,
  parseNumberText,
  raise,
  raiseError,
} from './values.js';

/** Services the evaluator needs from the workbook. */
export interface EvalHost {
  getCellValue(sheet: Worksheet, row: number, col: number): ScalarValue;
  getSpillRange(sheet: Worksheet, row: number, col: number): AreaRef | undefined;
  resolveName(
    name: string,
    sheet: Worksheet,
    row: number,
    col: number,
  ): { ast: AstNode; baseRow: number; baseCol: number } | undefined;
  /** Custom or built-in function lookup. */
  getCustomFunction(name: string, sheet: Worksheet): CustomFunctionLike | undefined;
  sheetFromName(name: string): Worksheet | undefined;
  isR1C1(): boolean;
  allowDynamicArray(): boolean;
  hasFormula(sheet: Worksheet, row: number, col: number): boolean;
  getFormulaText(sheet: Worksheet, row: number, col: number): string | null;
  workbookIndex(sheet: Worksheet): number;
  sheetCount(): number;
}

/** Minimal structural type of the public custom Function class. */
export interface CustomFunctionLike {
  name: string;
  minArgs: number;
  maxArgs: number;
  evaluate(...args: unknown[]): unknown;
  acceptsArray?(index: number): boolean;
  acceptsError?(index: number): boolean;
  acceptsReference?(index: number): boolean;
  acceptsMissingArgument?(index: number): boolean;
  isBranch?(): boolean;
  isContextSensitive?(): boolean;
  isVolatile?(): boolean;
  findTestArgument?(): number;
  findBranchArgument?(result: unknown): number;
}

export interface EvalContext {
  host: EvalHost;
  sheet: Worksheet;
  row: number;
  col: number;
  arrayMode: boolean;
  env?: EvalEnvironment;
  /** Cells currently being evaluated; reads return their cached values. */
  calculating?: Set<string>;
}

export function cellKey(sheet: Worksheet, row: number, col: number): string {
  return `${sheet.name().toLowerCase()}:${row}:${col}`;
}

// ---------------------------------------------------------------------------
// Coercion
// ---------------------------------------------------------------------------

/** Resolves a reference in scalar position using implicit intersection. */
export function implicitIntersect(ctx: EvalContext, value: Value): ScalarValue {
  if (!isReference(value)) return value as ScalarValue;
  const areas = value.areas;
  if (!areas.length) return error(ErrorCode.value);
  if (areas.length > 1) {
    // A union has no single implicit intersection cell unless exactly one
    // multi-cell area matches the formula position.
    const candidates: ScalarValue[] = [];
    for (const area of areas) {
      const resolved = intersectArea(ctx, area);
      if (!isError(resolved)) candidates.push(resolved);
    }
    if (candidates.length === 1) return candidates[0]!;
    return error(ErrorCode.value);
  }
  return intersectArea(ctx, areas[0]!);
}

function intersectArea(ctx: EvalContext, area: AreaRef): ScalarValue {
  if (area.r1 === area.r2 && area.c1 === area.c2) return ctx.host.getCellValue(area.sheet, area.r1, area.c1);
  if (area.r1 === area.r2) {
    if (ctx.col < area.c1 || ctx.col > area.c2) return error(ErrorCode.value);
    return ctx.host.getCellValue(area.sheet, area.r1, ctx.col);
  }
  if (area.c1 === area.c2) {
    if (ctx.row < area.r1 || ctx.row > area.r2) return error(ErrorCode.value);
    return ctx.host.getCellValue(area.sheet, ctx.row, area.c1);
  }
  return error(ErrorCode.value);
}

/** Converts any value to its scalar (non-reference, non-array) form. */
export function scalar(ctx: EvalContext, value: Value | Missing): ScalarValue {
  if (value instanceof MissingValue) return null;
  if (value instanceof ReferenceValue) return implicitIntersect(ctx, value);
  if (value instanceof CalcArray) return value.at(0, 0);
  if (isLambda(value)) return error(ErrorCode.value);
  return value as ScalarValue;
}

export function toNumber(ctx: EvalContext, value: Value | Missing): number {
  const resolved = scalar(ctx, value);
  if (resolved === null) return 0;
  if (typeof resolved === 'number') return resolved;
  if (typeof resolved === 'boolean') return resolved ? 1 : 0;
  if (typeof resolved === 'string') {
    const parsed = parseNumberText(resolved);
    if (parsed === undefined) raise(ErrorCode.value);
    return parsed;
  }
  if (resolved instanceof Date) return dateToSerial(resolved);
  if (isError(resolved)) raiseError(resolved);
  raise(ErrorCode.value);
}

export function toText(ctx: EvalContext, value: Value | Missing): string {
  const resolved = scalar(ctx, value);
  if (resolved === null) return '';
  if (typeof resolved === 'string') return resolved;
  if (typeof resolved === 'boolean') return resolved ? 'TRUE' : 'FALSE';
  if (typeof resolved === 'number') return numberToText(resolved);
  if (resolved instanceof Date) return numberToText(dateToSerial(resolved));
  if (isError(resolved)) raiseError(resolved);
  raise(ErrorCode.value);
}

export function toBoolean(ctx: EvalContext, value: Value | Missing): boolean {
  const resolved = scalar(ctx, value);
  if (resolved === null) return false;
  if (typeof resolved === 'boolean') return resolved;
  if (typeof resolved === 'number') return resolved !== 0;
  if (typeof resolved === 'string') {
    const upper = resolved.toUpperCase();
    if (upper === 'TRUE') return true;
    if (upper === 'FALSE') return false;
    raise(ErrorCode.value);
  }
  if (resolved instanceof Date) return true;
  if (isError(resolved)) raiseError(resolved);
  raise(ErrorCode.value);
}

/** Truncates a number the way Excel integer arguments are truncated. */
export function toInteger(ctx: EvalContext, value: Value | Missing): number {
  return Math.trunc(toNumber(ctx, value));
}

export type CompareResult = -1 | 0 | 1;

function valueRank(value: ScalarValue): number {
  if (typeof value === 'boolean') return 2;
  if (typeof value === 'string') return 1;
  if (value instanceof Date) return 0;
  return 0;
}

/** Excel style comparison with blank handling. */
export function compareValues(left: ScalarValue, right: ScalarValue): CompareResult | CalcError {
  if (left instanceof CalcError) return left;
  if (right instanceof CalcError) return right;
  if (left === null && right === null) return 0;
  if (left === null) {
    if (typeof right === 'string') left = '';
    else if (typeof right === 'boolean') left = 0;
    else left = 0;
  }
  if (right === null) {
    if (typeof left === 'string') right = '';
    else if (typeof left === 'boolean') right = 0;
    else right = 0;
  }
  const leftRank = valueRank(left);
  const rightRank = valueRank(right);
  if (leftRank !== rightRank) return leftRank < rightRank ? -1 : 1;
  if (typeof left === 'number' && typeof right === 'number') return left === right ? 0 : left < right ? -1 : 1;
  if (left instanceof Date || right instanceof Date) {
    const a = left instanceof Date ? dateToSerial(left) : (left as number);
    const b = right instanceof Date ? dateToSerial(right) : (right as number);
    return a === b ? 0 : a < b ? -1 : 1;
  }
  if (typeof left === 'string' && typeof right === 'string') {
    const result = compareText(left, right);
    return result < 0 ? -1 : result > 0 ? 1 : 0;
  }
  if (typeof left === 'boolean' && typeof right === 'boolean') return left === right ? 0 : left ? 1 : -1;
  return 0;
}

// ---------------------------------------------------------------------------
// Array conversion
// ---------------------------------------------------------------------------

export const MAX_ARRAY_CELLS = 1_048_576;

/** Converts a value to a rectangular matrix of scalar values. */
export function toMatrix(ctx: EvalContext, value: Value | Missing): ScalarValue[][] {
  if (value instanceof MissingValue) return [[null]];
  if (value instanceof CalcArray)
    return value.array.map((row) =>
      row.map((item) => (item instanceof ReferenceValue ? implicitIntersect(ctx, item) : (item as ScalarValue))),
    );
  if (value instanceof ReferenceValue) {
    if (value.areas.length !== 1) raise(ErrorCode.value);
    const area = value.areas[0]!;
    if (area.sheet !== ctx.sheet) {
      // Cross-sheet references are fine: read through the host.
    }
    const rowCount = Math.max(0, area.r2 - area.r1 + 1);
    const colCount = Math.max(0, area.c2 - area.c1 + 1);
    if (rowCount * colCount > MAX_ARRAY_CELLS) raise(ErrorCode.value);
    const matrix: ScalarValue[][] = [];
    for (let r = 0; r < rowCount; r++) {
      const row: ScalarValue[] = [];
      for (let c = 0; c < colCount; c++) row.push(ctx.host.getCellValue(area.sheet, area.r1 + r, area.c1 + c));
      matrix.push(row);
    }
    return matrix;
  }
  if (isLambda(value)) raise(ErrorCode.value);
  return [[value as ScalarValue]];
}

/** Number of rows/columns of a matrix. */
export function matrixSize(matrix: ScalarValue[][]): [number, number] {
  let cols = 0;
  for (const row of matrix) cols = Math.max(cols, row.length);
  return [matrix.length, cols];
}

/** Applies a scalar function elementwise with Excel broadcasting. */
export function elementwise(
  left: ScalarValue[][],
  right: ScalarValue[][],
  operation: (a: ScalarValue, b: ScalarValue) => ScalarValue,
): CalcArray {
  const [rows, cols] = matrixSize(left);
  const [rightRows, rightCols] = matrixSize(right);
  const resultRows = Math.max(rows, rightRows);
  const resultCols = Math.max(cols, rightCols);
  if (
    (rows !== resultRows && rows !== 1) ||
    (rightRows !== resultRows && rightRows !== 1) ||
    (cols !== resultCols && cols !== 1) ||
    (rightCols !== resultCols && rightCols !== 1)
  )
    raise(ErrorCode.value);
  const result: ScalarValue[][] = [];
  for (let r = 0; r < resultRows; r++) {
    const row: ScalarValue[] = [];
    for (let c = 0; c < resultCols; c++) {
      const a = left[rows === 1 ? 0 : r]?.[cols === 1 ? 0 : c] ?? null;
      const b = right[rightRows === 1 ? 0 : r]?.[rightCols === 1 ? 0 : c] ?? null;
      row.push(operation(a, b));
    }
    result.push(row);
  }
  return new CalcArray(result);
}

export function mapMatrix(matrix: ScalarValue[][], operation: (value: ScalarValue) => ScalarValue): CalcArray {
  return new CalcArray(matrix.map((row) => row.map(operation)));
}

// ---------------------------------------------------------------------------
// Evaluator
// ---------------------------------------------------------------------------

/** SUM over a single reference value (shared by the evaluator fast path). */
export function sumReferenceValues(ctx: EvalContext, value: ReferenceValue): number | CalcError {
  let total = 0;
  void ctx;
  for (const area of value.areas) {
    const sheet = area.sheet;
    const store = sheet._viewCellStore();
    for (let row = area.r1; row <= area.r2; row++) {
      for (let col = area.c1; col <= area.c2; col++) {
        const raw = store ? store.getValue(row, col) : null;
        const cell = raw === undefined ? null : raw;
        if (typeof cell === 'number') total += cell;
        else if (cell instanceof CalcError) return cell;
        else if (typeof cell === 'boolean') total += cell ? 1 : 0;
        else if (cell instanceof Date) total += dateToSerial(cell);
        else if (typeof cell === 'string') {
          const parsed = parseNumberText(cell);
          if (parsed !== undefined) total += parsed;
        }
      }
    }
  }
  return normalizeNumber(total);
}

export class Evaluator {
  constructor(private readonly host: EvalHost) {}

  evaluate(node: AstNode, ctx: EvalContext): Value {
    switch (node.kind) {
      case 'number':
        return node.value;
      case 'string':
        return node.value;
      case 'boolean':
        return node.value;
      case 'error':
        return error(node.value);
      case 'missing':
        return MISSING;
      case 'ref':
        return this.resolveRef(node, ctx);
      case 'range':
        return this.resolveRange(node.start, node.end, ctx);
      case 'union': {
        const areas: AreaRef[] = [];
        for (const part of node.parts) {
          const value = this.evaluate(part, ctx);
          if (!isReference(value)) return error(ErrorCode.value);
          areas.push(...value.areas);
        }
        return new ReferenceValue(areas);
      }
      case 'intersect': {
        const left = this.evaluate(node.left, ctx);
        const right = this.evaluate(node.right, ctx);
        if (!isReference(left) || !isReference(right)) return error(ErrorCode.null);
        const areas = intersectReferences(left, right);
        return areas.length ? new ReferenceValue(areas) : error(ErrorCode.null);
      }
      case 'paren':
        return this.evaluate(node.inner, ctx);
      case 'unary':
        return this.evaluateUnary(node.op, node.operand, ctx);
      case 'percent': {
        const value = this.evaluate(node.operand, ctx);
        if (ctx.arrayMode && (isReference(value) || isArray(value))) {
          return mapMatrix(toMatrix(ctx, value), (item) => arithmeticNumber(item) / 100);
        }
        const number = toNumber(ctx, value);
        return normalizeNumber(number / 100);
      }
      case 'binary':
        return this.evaluateBinary(node, ctx);
      case 'array': {
        const rows: ScalarValue[][] = node.rows.map((row) =>
          row.map((item) => {
            const value = this.evaluate(item, ctx);
            return scalar(ctx, value);
          }),
        );
        return new CalcArray(rows);
      }
      case 'spill': {
        const ref = this.evaluate(node.ref, ctx);
        if (!isReference(ref) || ref.areas.length !== 1) return error(ErrorCode.ref);
        const area = ref.areas[0]!;
        if (area.r1 !== area.r2 || area.c1 !== area.c2) return error(ErrorCode.ref);
        const spill = this.host.getSpillRange(area.sheet, area.r1, area.c1);
        if (!spill) return error(ErrorCode.ref);
        return new ReferenceValue([spill]);
      }
      case 'name':
        return this.evaluateName(node.name, node.sheet, ctx);
      case 'function':
        return this.callFunction(node, ctx);
      case 'call': {
        const callee = this.evaluate(node.callee, ctx);
        if (!isLambda(callee)) return error(ErrorCode.value);
        return this.invokeLambda(callee, node.args, ctx);
      }
      case 'structured':
        return error(ErrorCode.name);
    }
  }

  /** Evaluates a node and coerces references with implicit intersection. */
  scalar(node: AstNode, ctx: EvalContext): ScalarValue {
    return scalar(ctx, this.evaluate(node, ctx));
  }

  number(node: AstNode, ctx: EvalContext): number {
    return toNumber(ctx, this.evaluate(node, ctx));
  }

  evaluateName(name: string, sheetName: string | undefined, ctx: EvalContext): Value {
    const bound = lookupVar(ctx.env, name);
    if (bound !== undefined) return bound;
    let sheet = ctx.sheet;
    if (sheetName) {
      const found = this.host.sheetFromName(sheetName);
      if (!found) return error(ErrorCode.ref);
      sheet = found;
    }
    const info = this.host.resolveName(name, sheet, ctx.row, ctx.col);
    if (!info) {
      const upper = name.toUpperCase();
      if (upper === 'TRUE') return true;
      if (upper === 'FALSE') return false;
      return error(ErrorCode.name);
    }
    const deltaRow = ctx.row - info.baseRow;
    const deltaCol = ctx.col - info.baseCol;
    const ast = this.host.isR1C1() ? info.ast : translateRefs(info.ast, deltaRow, deltaCol);
    return this.evaluate(ast, ctx);
  }

  resolveRef(node: RefNode, ctx: EvalContext): Value {
    let sheet = ctx.sheet;
    if (node.sheet) {
      const found = this.host.sheetFromName(node.sheet);
      if (!found) return error(ErrorCode.ref);
      sheet = found;
    }
    const cached = node._cache;
    if (cached && cached.sheet === sheet && cached.rows === sheet.getRowCount() && cached.cols === sheet.getColumnCount())
      return cached.value as Value;
    const r1c1 = this.host.isR1C1();
    let r1 = node.r1Rel && r1c1 ? ctx.row + node.r1 : node.r1;
    let r2 = node.r2Rel && r1c1 ? ctx.row + node.r2 : node.r2;
    let c1 = node.c1Rel && r1c1 ? ctx.col + node.c1 : node.c1;
    let c2 = node.c2Rel && r1c1 ? ctx.col + node.c2 : node.c2;
    if (node.rowOnly) {
      const rowCount = sheet.getRowCount();
      const colCount = sheet.getColumnCount();
      return new ReferenceValue([
        {
          sheet,
          r1: Math.max(0, Math.min(r1, r2)),
          c1: 0,
          r2: Math.min(rowCount - 1, Math.max(r1, r2)),
          c2: Math.max(0, colCount - 1),
          wholeRow: true,
        },
      ]);
    }
    if (node.colOnly) {
      const rowCount = sheet.getRowCount();
      const colCount = sheet.getColumnCount();
      return new ReferenceValue([
        {
          sheet,
          r1: 0,
          c1: Math.max(0, Math.min(c1, c2)),
          r2: Math.max(0, rowCount - 1),
          c2: Math.min(colCount - 1, Math.max(c1, c2)),
          wholeCol: true,
        },
      ]);
    }
    if (node.wholeRow) {
      const rowCount = sheet.getRowCount();
      const colCount = sheet.getColumnCount();
      const start = Math.max(0, Math.min(r1, r2));
      const end = Math.min(rowCount - 1, Math.max(r1, r2));
      if (start > end) return error(ErrorCode.ref);
      return this.cacheRef(node, sheet, new ReferenceValue([
        {
          sheet,
          r1: start,
          c1: 0,
          r2: end,
          c2: Math.max(0, colCount - 1),
          wholeRow: true,
          abs: [node.r1Abs, node.c1Abs, node.r2Abs, node.c2Abs],
        },
      ]));
    }
    if (node.wholeCol) {
      const rowCount = sheet.getRowCount();
      const colCount = sheet.getColumnCount();
      const start = Math.max(0, Math.min(c1, c2));
      const end = Math.min(colCount - 1, Math.max(c1, c2));
      if (start > end) return error(ErrorCode.ref);
      return this.cacheRef(node, sheet, new ReferenceValue([
        {
          sheet,
          r1: 0,
          c1: start,
          r2: Math.max(0, rowCount - 1),
          c2: end,
          wholeCol: true,
          abs: [node.r1Abs, node.c1Abs, node.r2Abs, node.c2Abs],
        },
      ]));
    }
    // Normalise reversed references like Excel does.
    if (r1 > r2) [r1, r2] = [r2, r1];
    if (c1 > c2) [c1, c2] = [c2, c1];
    if (r1 < 0 || c1 < 0) return error(ErrorCode.ref);
    return this.cacheRef(node, sheet, new ReferenceValue([
      {
        sheet,
        r1,
        c1,
        r2,
        c2,
        abs: [node.r1Abs, node.c1Abs, node.r2Abs, node.c2Abs],
      },
    ]));
  }

  private cacheRef(node: RefNode, sheet: Worksheet, value: ReferenceValue): ReferenceValue {
    node._cache = { sheet, rows: sheet.getRowCount(), cols: sheet.getColumnCount(), value };
    return value;
  }

  resolveRange(startNode: AstNode, endNode: AstNode, ctx: EvalContext): Value {
    const start = this.evaluate(startNode, ctx);
    const end = this.evaluate(endNode, ctx);
    if (!isReference(start) || !isReference(end)) return error(ErrorCode.value);
    const areas: AreaRef[] = [];
    for (const left of start.areas) {
      for (const right of end.areas) {
        if (left.sheet !== right.sheet) return error(ErrorCode.ref);
        areas.push({
          sheet: left.sheet,
          r1: Math.min(left.r1, right.r1),
          c1: Math.min(left.c1, right.c1),
          r2: Math.max(left.r2, right.r2),
          c2: Math.max(left.c2, right.c2),
          wholeRow: left.wholeRow || right.wholeRow,
          wholeCol: left.wholeCol || right.wholeCol,
        });
      }
    }
    return new ReferenceValue(areas);
  }

  private evaluateUnary(op: '-' | '+' | '@', operand: AstNode, ctx: EvalContext): Value {
    if (op === '@') {
      const value = this.evaluate(operand, ctx);
      return implicitIntersect(ctx, value);
    }
    const value = this.evaluate(operand, ctx);
    if (ctx.arrayMode && (isReference(value) || isArray(value))) {
      return mapMatrix(toMatrix(ctx, value), (item) => (op === '-' ? -arithmeticNumber(item) : unaryPlus(item)));
    }
    if (op === '+') {
      const resolved = scalar(ctx, value);
      if (typeof resolved === 'string') {
        const parsed = parseNumberText(resolved);
        return parsed === undefined ? resolved : normalizeNumber(parsed);
      }
      return resolved;
    }
    const resolved = scalar(ctx, value);
    if (resolved instanceof CalcError) return resolved;
    if (resolved === null) return 0;
    if (typeof resolved === 'boolean') return resolved ? -1 : 0;
    if (typeof resolved === 'string') {
      const parsed = parseNumberText(resolved);
      if (parsed === undefined) return error(ErrorCode.value);
      return normalizeNumber(-parsed);
    }
    if (typeof resolved === 'number') return normalizeNumber(-resolved);
    if (resolved instanceof Date) return normalizeNumber(-dateToSerial(resolved));
    return error(ErrorCode.value);
  }

  private evaluateBinary(node: BinaryNode, ctx: EvalContext): Value {
    const leftValue = this.evaluate(node.left, ctx);
    const rightValue = this.evaluate(node.right, ctx);
    if (isMissing(leftValue) || isMissing(rightValue)) return error(ErrorCode.value);
    if (
      isArray(leftValue) ||
      isArray(rightValue) ||
      (ctx.arrayMode && (isReference(leftValue) || isReference(rightValue)))
    ) {
      const left = toMatrix(ctx, leftValue);
      const right = toMatrix(ctx, rightValue);
      return elementwise(left, right, (a, b) => applyBinaryScalar(node.op, a, b));
    }
    const left = scalar(ctx, leftValue);
    const right = scalar(ctx, rightValue);
    return applyBinaryScalar(node.op, left, right);
  }

  callFunction(node: FunctionNode, ctx: EvalContext): Value {
    const name = node.name.startsWith('_XLFN.') ? node.name.slice(6) : node.name;
    if (name === 'SUM' && node.args.length === 1) {
      const argument = node.args[0]!;
      const ref = argument.kind === 'ref' ? this.resolveRef(argument, ctx) : undefined;
      if (ref instanceof ReferenceValue) return sumReferenceValues(ctx, ref) as Value;
    }
    const cachedArgs = node._args as Args | undefined;
    const args = cachedArgs ? cachedArgs.reset(ctx) : new Args(node.args, ctx, this);
    if (!cachedArgs) node._args = args;
    const custom = this.host.getCustomFunction(name, ctx.sheet);
    if (custom) return this.callCustomFunction(custom, node, ctx);
    const builtin = getBuiltin(name);
    if (!builtin) return error(ErrorCode.name);
    try {
      return builtin.evaluate(args, ctx);
    } catch (thrown) {
      if (thrown instanceof ErrorThrown) return thrown.value;
      throw thrown;
    }
  }

  callCustomFunction(fn: CustomFunctionLike, node: FunctionNode, ctx: EvalContext): Value {
    const args = new Args(node.args, ctx, this);
    try {
      const lazy = fn.isBranch?.() === true;
      if (lazy) {
        const testIndex = fn.findTestArgument?.() ?? 0;
        const testValue = args.value(testIndex);
        const branch = fn.findBranchArgument?.(scalar(ctx, testValue)) ?? -1;
        const values: unknown[] = [];
        for (let i = 0; i < node.args.length; i++) {
          if (i === testIndex || i === branch) values.push(this.customArgument(fn, args, i, ctx));
          else if (args.node(i).kind === 'missing') values.push(MISSING);
          else values.push(undefined);
        }
        const evaluate = fn.evaluate.bind(fn) as (...items: unknown[]) => unknown;
        const result = fn.isContextSensitive?.() ? evaluate(this.contextObject(ctx), ...values) : evaluate(...values);
        return this.fromCustomResult(result);
      }
      const values: unknown[] = [];
      for (let i = 0; i < node.args.length; i++) values.push(this.customArgument(fn, args, i, ctx));
      const evaluate = fn.evaluate.bind(fn) as (...items: unknown[]) => unknown;
      const result = fn.isContextSensitive?.() ? evaluate(this.contextObject(ctx), ...values) : evaluate(...values);
      return this.fromCustomResult(result);
    } catch (thrown) {
      if (thrown instanceof ErrorThrown) return thrown.value;
      throw thrown;
    }
  }

  private customArgument(fn: CustomFunctionLike, args: Args, index: number, ctx: EvalContext): unknown {
    const node = args.node(index);
    if (node.kind === 'missing') return MISSING;
    const value = args.value(index);
    if (isMissing(value)) return MISSING;
    if (fn.acceptsReference?.(index) && isReference(value)) return value;
    if (fn.acceptsArray?.(index) && (isReference(value) || isArray(value))) return toMatrix(ctx, value);
    if (fn.acceptsError?.(index)) return isReference(value) ? implicitIntersect(ctx, value) : value;
    return scalar(ctx, value);
  }

  fromCustomResult(result: unknown): Value {
    if (result === undefined || result === null) return null;
    if (result instanceof CalcError) return result;
    if (result instanceof CalcArray || result instanceof ReferenceValue) return result;
    if (Array.isArray(result)) {
      return new CalcArray(
        result.map((row) => (Array.isArray(row) ? (row as Value[]) : [row as Value])),
      );
    }
    if (typeof result === 'number') return normalizeNumber(result);
    if (typeof result === 'string' || typeof result === 'boolean' || result instanceof Date) return result;
    if (typeof result === 'object' && result && 'error' in result)
      return new CalcError(String((result as { error: unknown }).error));
    return String(result);
  }

  contextObject(ctx: EvalContext): Record<string, unknown> {
    return { sheet: ctx.sheet, sheetName: ctx.sheet.name(), row: ctx.row, column: ctx.col };
  }

  invokeLambdaValues(lambda: LambdaValue, values: Value[], ctx: EvalContext): Value {
    const vars = new Map<string, Value>();
    for (let index = 0; index < lambda.params.length; index++)
      vars.set(lambda.params[index]!.toUpperCase(), values[index] ?? null);
    const env: EvalEnvironment = { vars, parent: lambda.context };
    return this.evaluate(lambda.body as AstNode, { ...ctx, env });
  }

  invokeLambda(lambda: LambdaValue, argNodes: AstNode[], ctx: EvalContext): Value {
    const vars = new Map<string, Value>();
    for (let i = 0; i < lambda.params.length; i++) {
      const node = argNodes[i];
      vars.set(
        lambda.params[i]!.toUpperCase(),
        !node || node.kind === 'missing' ? MISSING : this.evaluate(node, ctx),
      );
    }
    const env: EvalEnvironment = { vars, parent: lambda.context };
    return this.evaluate(lambda.body as AstNode, { ...ctx, env });
  }

  /** Evaluates a node forcing array semantics (SUMPRODUCT and friends). */
  arrayArg(node: AstNode, ctx: EvalContext): CalcArray {
    const value = this.evaluate(node, { ...ctx, arrayMode: true });
    return new CalcArray(toMatrix(ctx, value));
  }
}

/** Lazy argument list handed to built-in functions. */
export class Args {
  private readonly cache: (Value | Missing | undefined)[];
  constructor(
    readonly nodes: AstNode[],
    private ctx: EvalContext,
    private readonly evaluator: Evaluator,
  ) {
    this.cache = new Array<Value | Missing | undefined>(nodes.length).fill(undefined);
  }
  /** Reuses a cached argument list for the same function node. */
  reset(ctx: EvalContext): this {
    this.ctx = ctx;
    this.cache.fill(undefined);
    return this;
  }
  get count(): number {
    return this.nodes.length;
  }
  node(index: number): AstNode {
    return this.nodes[index] ?? { kind: 'missing' };
  }
  value(index: number): Value | Missing {
    if (this.cache[index] === undefined) {
      const node = this.nodes[index];
      if (!node || node.kind === 'missing') this.cache[index] = MISSING;
      else {
        try {
          this.cache[index] = this.evaluator.evaluate(node, this.ctx);
        } catch (thrown) {
          if (thrown instanceof ErrorThrown) this.cache[index] = thrown.value;
          else throw thrown;
        }
      }
    }
    return this.cache[index]!;
  }
  /** Like value() but converts thrown errors to error values. */
  safe(index: number): Value {
    const value = this.value(index);
    return isMissing(value) ? null : value;
  }
  scalar(index: number): ScalarValue {
    return scalar(this.ctx, this.value(index));
  }
  number(index: number): number {
    return toNumber(this.ctx, this.value(index));
  }
  integer(index: number): number {
    return Math.trunc(this.number(index));
  }
  text(index: number): string {
    return toText(this.ctx, this.value(index));
  }
  boolean(index: number): boolean {
    return toBoolean(this.ctx, this.value(index));
  }
  isMissing(index: number): boolean {
    return this.node(index).kind === 'missing';
  }
  matrix(index: number): CalcArray {
    const value = this.value(index);
    return new CalcArray(toMatrix(this.ctx, value));
  }
  /** Evaluates an argument in array mode. */
  array(index: number): CalcArray {
    const node = this.node(index);
    return this.evaluator.arrayArg(node, this.ctx);
  }
  environment(): EvalContext {
    return this.ctx;
  }
  evaluatorRef(): Evaluator {
    return this.evaluator;
  }
}

// ---------------------------------------------------------------------------
// Scalar operations
// ---------------------------------------------------------------------------

function unaryPlus(value: ScalarValue): ScalarValue {
  if (typeof value === 'string') {
    const parsed = parseNumberText(value);
    return parsed === undefined ? value : normalizeNumber(parsed);
  }
  return value;
}

function arithmeticNumber(value: ScalarValue): number {
  if (value === null) return 0;
  if (typeof value === 'number') return value;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'string') {
    const parsed = parseNumberText(value);
    if (parsed === undefined) raise(ErrorCode.value);
    return parsed;
  }
  if (value instanceof Date) return dateToSerial(value);
  if (value instanceof CalcError) raiseError(value);
  raise(ErrorCode.value);
}

export function applyBinaryScalar(op: string, left: ScalarValue, right: ScalarValue): ScalarValue {
  if (left instanceof CalcError) return left;
  if (right instanceof CalcError) return right;
  switch (op) {
    case '&':
      return textOf(left) + textOf(right);
    case '=':
    case '<>':
    case '<':
    case '>':
    case '<=':
    case '>=': {
      const comparison = compareValues(left, right);
      if (comparison instanceof CalcError) return comparison;
      switch (op) {
        case '=':
          return comparison === 0;
        case '<>':
          return comparison !== 0;
        case '<':
          return comparison < 0;
        case '>':
          return comparison > 0;
        case '<=':
          return comparison <= 0;
        default:
          return comparison >= 0;
      }
    }
    default:
      break;
  }
  let a: number;
  let b: number;
  try {
    a = arithmeticNumber(left);
    b = arithmeticNumber(right);
  } catch (thrown) {
    if (thrown instanceof ErrorThrown) return thrown.value;
    throw thrown;
  }
  switch (op) {
    case '+':
      return normalizeNumber(a + b);
    case '-':
      return normalizeNumber(a - b);
    case '*':
      return normalizeNumber(a * b);
    case '/':
      if (b === 0) return error(ErrorCode.div0);
      return normalizeNumber(a / b);
    case '^': {
      const result = excelPower(a, b);
      return typeof result === 'number' ? normalizeNumber(result) : result;
    }
    default:
      return error(ErrorCode.value);
  }
}

function textOf(value: ScalarValue): string {
  if (value === null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (typeof value === 'number') return numberToText(value);
  if (value instanceof Date) return numberToText(dateToSerial(value));
  raiseError(value);
}

export function excelPower(base: number, exponent: number): number | CalcError {
  if (base === 0 && exponent === 0) return error(ErrorCode.num);
  if (base === 0 && exponent < 0) return error(ErrorCode.div0);
  if (base < 0 && !Number.isInteger(exponent)) {
    const inverse = 1 / exponent;
    const rounded = Math.round(inverse);
    if (Math.abs(inverse - rounded) < 1e-9 && Math.abs(rounded % 2) === 1) {
      return -Math.pow(-base, exponent);
    }
    return error(ErrorCode.num);
  }
  return Math.pow(base, exponent);
}

// ---------------------------------------------------------------------------
// Built-in registry bridge
// ---------------------------------------------------------------------------

export interface BuiltinFunction {
  name: string;
  min: number;
  max: number;
  /** Function implements its own lazy argument handling. */
  lazy?: boolean;
  evaluate(args: Args, ctx: EvalContext): Value;
  /** Argument evaluation context override for array-consuming functions. */
  arrayArgs?: boolean;
  volatile?: boolean;
}

const BUILTINS = new Map<string, BuiltinFunction>();

export function registerFunction(fn: BuiltinFunction): void {
  BUILTINS.set(fn.name.toUpperCase(), fn);
}
export function registerFunctions(list: BuiltinFunction[]): void {
  for (const fn of list) registerFunction(fn);
}
export function getBuiltin(name: string): BuiltinFunction | undefined {
  return BUILTINS.get(name.toUpperCase());
}
export function builtinNames(): string[] {
  return [...BUILTINS.keys()].sort();
}
export function isBuiltinVolatile(name: string): boolean {
  const fn = BUILTINS.get(name.toUpperCase());
  return Boolean(fn?.volatile);
}

// Re-export helpers used by function modules.
export { astToText, raise, raiseError, normalizeNumber, numberToText, dateToSerial };
export { MISSING, CalcArray, CalcError, ReferenceValue } from './values.js';
export type { ScalarValue, Value } from './values.js';

/** Intersection of two reference values (used by the space operator). */
function intersectReferences(left: ReferenceValue, right: ReferenceValue): AreaRef[] {
  const result: AreaRef[] = [];
  for (const a of left.areas) {
    for (const b of right.areas) {
      if (a.sheet !== b.sheet) continue;
      const r1 = Math.max(a.r1, b.r1);
      const c1 = Math.max(a.c1, b.c1);
      const r2 = Math.min(a.r2, b.r2);
      const c2 = Math.min(a.c2, b.c2);
      if (r1 > r2 || c1 > c2) continue;
      result.push({ sheet: a.sheet, r1, c1, r2, c2 });
    }
  }
  return result;
}
