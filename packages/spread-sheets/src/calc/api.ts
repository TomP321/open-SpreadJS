/**
 * Public calculation API (GC.Spread.Sheets.CalcEngine and
 * GC.Spread.CalcEngine). These mirror the declared v19 surface.
 */
import type { Workbook, Worksheet } from '../model.js';
import type { CalcEngine } from './engine.js';
import { Range } from '../primitives.js';
import { columnLabel, parseFormula, astToText, translateRefs } from './parser.js';
import { CalcArray, CalcError, ErrorCode, error, isError } from './values.js';
import {
  AsyncEvaluateContext,
  AsyncFunction,
  AsyncFunctionEvaluateMode,
  Function,
  defineGlobalCustomFunction,
  findGlobalFunction,
  removeGlobalFunction,
} from './functions-api.js';

export { CalcArray, CalcError };
export { AsyncEvaluateContext, AsyncFunction, AsyncFunctionEvaluateMode, Function };
export { defineGlobalCustomFunction, findGlobalFunction, removeGlobalFunction };

/** Expression tree node types from the public enum. */
export const ExpressionType = {
  unknow: 0,
  reference: 1,
  number: 2,
  string: 3,
  boolean: 4,
  error: 5,
  array: 6,
  function: 7,
  name: 8,
  operator: 9,
  parentheses: 10,
  missingArgument: 11,
  expand: 12,
  structReference: 13,
  LocalName: 100,
} as const;

export class Expression {
  type: number;
  [key: string]: unknown;
  constructor(type: number) {
    this.type = type;
  }
}

export const RangeReferenceRelative = {
  allAbsolute: 0,
  startRowRelative: 1,
  startColRelative: 2,
  endRowRelative: 4,
  endColRelative: 8,
  rowRelative: 5,
  colRelative: 10,
  allRelative: 15,
} as const;

function engineOf(context: unknown): CalcEngine | undefined {
  if (!context || typeof context !== 'object') return undefined;
  const record = context as { getParent?: () => Workbook };
  const parent = record.getParent?.();
  if (parent && typeof (parent as Workbook)._calcEngine === 'function') return parent._calcEngine();
  const workbook = context as Workbook;
  if (typeof workbook._calcEngine === 'function') return workbook._calcEngine();
  return undefined;
}


export function evaluateFormula(
  context: object,
  formula: string,
  baseRow?: number,
  baseColumn?: number,
  useR1C1?: boolean,
  preserveArrayResult?: boolean,
): unknown {
  const engine = engineOf(context);
  if (!engine) return error(ErrorCode.value);
  return engine.evaluateFormulaValue(context, formula, baseRow ?? 0, baseColumn ?? 0, useR1C1, preserveArrayResult);
}

export function evaluateFormulaAsync(
  context: object,
  formula: string,
  baseRow?: number,
  baseColumn?: number,
): Promise<unknown> {
  const engine = engineOf(context);
  if (!engine) return Promise.resolve(error(ErrorCode.value));
  return engine.evaluateFormulaAsyncValue(context, formula, baseRow ?? 0, baseColumn ?? 0);
}

/** Builds a public Expression tree from a formula. */
export function formulaToExpression(
  context: object,
  formula: string,
  baseRow = 0,
  baseColumn = 0,
  useR1C1 = false,
): Expression {
  void baseRow;
  void baseColumn;
  const ast = parseFormula(formula, { r1c1: useR1C1 });
  const engine = engineOf(context);
  const raw = engine?.astToExpression(ast) ?? plainExpression(ast);
  return materialize(raw);
}

function plainExpression(ast: ReturnType<typeof parseFormula>): unknown {
  switch (ast.kind) {
    case 'number':
      return { type: 2, value: ast.value };
    case 'string':
      return { type: 3, value: ast.value };
    case 'boolean':
      return { type: 4, value: ast.value };
    case 'error':
      return { type: 5, value: ast.value };
    case 'missing':
      return { type: 11 };
    case 'name':
      return { type: 8, name: ast.name, sheet: ast.sheet };
    case 'ref':
      return {
        type: 1,
        row: ast.r1,
        column: ast.c1,
        rowCount: ast.r2 - ast.r1 + 1,
        columnCount: ast.c2 - ast.c1 + 1,
        sheet: ast.sheet,
        _node: ast,
      };
    case 'function':
      return { type: 7, functionName: ast.name, arguments: ast.args.map(plainExpression), _args: ast.args, _name: ast.name };
    case 'array':
      return { type: 6, value: ast.rows.map((row) => row.map((item) => (item.kind === 'number' ? item.value : item.kind === 'string' ? item.value : item.kind === 'boolean' ? item.value : null))) };
    case 'range':
      return { type: 9, operator: ':', left: plainExpression(ast.start), right: plainExpression(ast.end) };
    case 'union':
      return { type: 9, operator: ',', arguments: ast.parts.map(plainExpression) };
    case 'intersect':
      return { type: 9, operator: ' ', left: plainExpression(ast.left), right: plainExpression(ast.right) };
    case 'binary':
      return { type: 9, operator: ast.op, left: plainExpression(ast.left), right: plainExpression(ast.right) };
    case 'unary':
      return { type: 9, operator: ast.op, argument: plainExpression(ast.operand) };
    case 'percent':
      return { type: 9, operator: '%', argument: plainExpression(ast.operand) };
    case 'paren':
      return { type: 10, argument: plainExpression(ast.inner) };
    case 'spill':
      return { type: 12, argument: plainExpression(ast.ref) };
    case 'structured':
      return { type: 13, table: ast.table, spec: ast.spec };
    case 'call':
      return { type: 7, functionName: '(call)', callee: plainExpression(ast.callee), arguments: ast.args.map(plainExpression) };
  }
}

function materialize(raw: unknown): Expression {
  const record = raw as Record<string, unknown>;
  const expression = new Expression(Number(record.type ?? 0));
  for (const [key, value] of Object.entries(record)) {
    if (key === 'arguments' && Array.isArray(value)) expression[key] = value.map(materialize);
    else if (key === 'left' || key === 'right' || key === 'argument' || key === 'callee')
      expression[key] = value ? materialize(value) : value;
    else expression[key] = value;
  }
  // Expose operator leaves as their concrete expression types for compatibility.
  if (expression.type === 9) {
    const operator = String(expression.operator ?? '');
    if (operator === ':' || operator === ' ' || operator === ',') {
      // reference operators keep their operator expression shape
    }
  }
  return expression;
}

/** Renders an Expression tree back to formula text. */
export function expressionToFormula(
  context: object,
  expression: Expression,
  baseRow = 0,
  baseColumn = 0,
  useR1C1 = false,
): string {
  void baseRow;
  void baseColumn;
  const engine = engineOf(context);
  if (engine) return engine.expressionToText(expression, useR1C1);
  const ast = expressionToAst(expression);
  return ast ? astToText(ast as never, { r1c1: useR1C1 }) : '';
}

function expressionToAst(expression: Expression): unknown {
  const record = expression as unknown as Record<string, unknown>;
  if (record._node) return record._node;
  const type = Number(record.type);
  const args = (record.arguments as Expression[] | undefined)?.map(expressionToAst);
  switch (type) {
    case 2:
      return { kind: 'number', value: Number(record.value), raw: String(record.value) };
    case 3:
      return { kind: 'string', value: String(record.value) };
    case 4:
      return { kind: 'boolean', value: Boolean(record.value) };
    case 5:
      return { kind: 'error', value: String(record.value) };
    case 11:
      return { kind: 'missing' };
    case 8:
      return { kind: 'name', name: String(record.name), sheet: record.sheet as string | undefined };
    case 1: {
      const row = Number(record.row ?? 0),
        col = Number(record.column ?? 0),
        rowCount = Number(record.rowCount ?? 1),
        colCount = Number(record.columnCount ?? 1);
      return {
        kind: 'ref',
        sheet: record.sheet as string | undefined,
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
      };
    }
    case 7: {
      if (record.callee) {
        const callee = expressionToAst(record.callee as Expression);
        return callee ? { kind: 'call', callee, args } : undefined;
      }
      return { kind: 'function', name: String(record.functionName ?? ''), args: args ?? [] };
    }
    case 9: {
      const operator = String(record.operator ?? '');
      const argument = record.argument ? expressionToAst(record.argument as Expression) : undefined;
      if (argument && (operator === '-' || operator === '+' || operator === '@'))
        return { kind: 'unary', op: operator, operand: argument };
      if (argument && operator === '%') return { kind: 'percent', operand: argument };
      if (operator === ',') return { kind: 'union', parts: args ?? [] };
      const left = record.left ? expressionToAst(record.left as Expression) : undefined;
      const right = record.right ? expressionToAst(record.right as Expression) : undefined;
      if (!left || !right) return undefined;
      if (operator === ':') return { kind: 'range', start: left, end: right };
      if (operator === ' ') return { kind: 'intersect', left, right };
      return { kind: 'binary', op: operator, left, right };
    }
    case 10: {
      const inner = record.argument ? expressionToAst(record.argument as Expression) : undefined;
      return inner ? { kind: 'paren', inner } : undefined;
    }
    default:
      return undefined;
  }
}

/** Returns the ranges referenced by a formula. */
export function formulaToRanges(
  sheet: Worksheet,
  formula: string,
  baseRow = 0,
  baseCol = 0,
): Range[] {
  const engine = engineOf(sheet);
  if (!engine) return [];
  return engine.formulaRanges(formula, sheet, baseRow, baseCol).map((area) => {
    const range = new Range(area.r1, area.c1, area.r2 - area.r1 + 1, area.c2 - area.c1 + 1);
    (range as unknown as { sheetName?: string }).sheetName = area.sheet.name();
    return range;
  });
}

function formatRange(
  range: Range,
  baseRow: number,
  baseCol: number,
  relative: number,
  useR1C1: boolean,
): string {
  const startRowRelative = Boolean(relative & RangeReferenceRelative.startRowRelative);
  const startColRelative = Boolean(relative & RangeReferenceRelative.startColRelative);
  const endRowRelative = Boolean(relative & RangeReferenceRelative.endRowRelative);
  const endColRelative = Boolean(relative & RangeReferenceRelative.endColRelative);
  if (useR1C1) {
    const part = (row: number, col: number, rowRel: boolean, colRel: boolean) => {
      const rowText = rowRel ? (row === 0 ? '' : `[${row}]`) : String(row + 1);
      const colText = colRel ? (col === 0 ? '' : `[${col}]`) : String(col + 1);
      return `R${rowText}C${colText}`;
    };
    const start = part(range.row - baseRow, range.col - baseCol, startRowRelative, startColRelative);
    if (range.rowCount === 1 && range.colCount === 1) return start;
    const end = part(
      range.row + range.rowCount - 1 - baseRow,
      range.col + range.colCount - 1 - baseCol,
      endRowRelative,
      endColRelative,
    );
    return `${start}:${end}`;
  }
  const cell = (row: number, col: number, rowRel: boolean, colRel: boolean) =>
    `${colRel ? '' : '$'}${columnLabel(col)}${rowRel ? '' : '$'}${row + 1}`;
  const start = cell(range.row, range.col, startRowRelative, startColRelative);
  if (range.rowCount === 1 && range.colCount === 1) return start;
  const end = cell(
    range.row + range.rowCount - 1,
    range.col + range.colCount - 1,
    endRowRelative,
    endColRelative,
  );
  return `${start}:${end}`;
}

export function rangeToFormula(
  range: Range,
  baseRow = 0,
  baseCol = 0,
  rangeReferenceRelative: number = RangeReferenceRelative.allAbsolute,
  useR1C1 = false,
): string {
  return formatRange(range, baseRow, baseCol, rangeReferenceRelative, useR1C1);
}

export function rangesToFormula(
  ranges: Range[],
  baseRow = 0,
  baseCol = 0,
  rangeReferenceRelative: number = RangeReferenceRelative.allAbsolute,
  useR1C1 = false,
): string {
  return ranges
    .map((range) => formatRange(range, baseRow, baseCol, rangeReferenceRelative, useR1C1))
    .join(',');
}

/** Goal seek: adjusts a cell until a formula reaches the desired result. */
export function goalSeek(
  changingSheet: Worksheet,
  changingRow: number,
  changingColumn: number,
  formulaSheet: Worksheet,
  formulaRow: number,
  formulaColumn: number,
  desiredResult: number,
  options: { maximumIterations?: number; tolerance?: number; callback?: (info: unknown) => boolean | void | Promise<boolean | void> } = {},
): boolean | Promise<boolean> {
  const maximumIterations = options.maximumIterations ?? 200;
  const tolerance = options.tolerance ?? 0.001;
  let guess = Number(changingSheet.getValue(changingRow, changingColumn)) || 0;
  let previousResult = Number(formulaSheet.getValue(formulaRow, formulaColumn));
  for (let iteration = 1; iteration <= maximumIterations; iteration++) {
    if (Math.abs(previousResult - desiredResult) <= tolerance) return true;
    const delta = Math.abs(previousResult - desiredResult) * 0.01 + tolerance * 0.01;
    const next = guess + (desiredResult > previousResult ? delta : -delta);
    changingSheet.setValue(changingRow, changingColumn, next);
    const result = Number(formulaSheet.getValue(formulaRow, formulaColumn));
    if (!Number.isFinite(result)) return false;
    const info = { currentIteration: iteration, currentValue: next, currentFormulaResult: result, succeeded: false };
    const callbackResult = options.callback?.(info);
    if (callbackResult === true) return true;
    guess = next;
    previousResult = result;
  }
  return Math.abs(previousResult - desiredResult) <= tolerance;
}

/** The GC.Spread.Sheets.CalcEngine namespace object. */
export const CalcEngineApi = {
  ExpressionType,
  Expression,
  CalcError,
  CalcArray,
  evaluateFormula,
  evaluateFormulaAsync,
  formulaToExpression,
  expressionToFormula,
  formulaToRanges,
  rangeToFormula,
  rangesToFormula,
  goalSeek,
  RangeReferenceRelative,
};

/** The GC.Spread.CalcEngine namespace object. */
export const GlobalCalcEngineApi = {
  ExpressionType,
  Expression,
  CalcError,
  CalcArray,
  AsyncEvaluateContext,
  AsyncFunction,
  AsyncFunctionEvaluateMode,
  Function,
  Functions: {
    defineGlobalCustomFunction,
    findGlobalFunction,
    removeGlobalFunction,
    Function,
    AsyncFunction,
    AsyncEvaluateContext,
    AsyncFunctionEvaluateMode,
  },
  ExcelCompatibleCalcMode: false,
  LanguagePackages: { languagePackages: () => undefined },
};

export { translateRefs, isError };
