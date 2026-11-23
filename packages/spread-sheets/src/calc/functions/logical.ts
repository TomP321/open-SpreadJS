/** Logical, lookup-ish information and dynamic-array helper functions. */
import type { Worksheet } from '../../worksheet.js';
import { Args, EvalContext, MISSING, toMatrix } from '../evaluate.js';
import {
  CalcArray,
  CalcError,
  ErrorCode,
  ErrorThrown,
  ReferenceValue,
  ScalarValue,
  Value,
  dateToSerial,
  error,
  isArray,
  isError,
  isLambda,
  isMissing,
  isReference,
  numberToText,
} from '../values.js';
import { type DefinedFunction, allEntries, define} from './common.js';

function scalarOf(ctx: EvalContext, value: Value): ScalarValue {
  if (value instanceof ReferenceValue) {
    const area = value.areas[0];
    if (!area) return error(ErrorCode.value);
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
  if (value instanceof CalcArray) return value.at(0, 0);
  if (isMissing(value) || value === MISSING) return null;
  if (isLambda(value)) return error(ErrorCode.value);
  return value as ScalarValue;
}

function truthy(value: ScalarValue): boolean | CalcError {
  if (isError(value)) return value;
  if (value === null) return false;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const upper = value.toUpperCase();
    if (upper === 'TRUE') return true;
    if (upper === 'FALSE') return false;
    return error(ErrorCode.value);
  }
  return true;
}


function arrayCondition(ctx: EvalContext, value: Value): CalcArray | undefined {
  if (value instanceof ReferenceValue) {
    if (value.areas.length !== 1) return undefined;
    const area = value.areas[0]!;
    if (area.r1 === area.r2 && area.c1 === area.c2) return undefined;
    return new CalcArray(toMatrix(ctx, value));
  }
  if (value instanceof CalcArray) return value;
  return undefined;
}

/** Evaluates an array formula branch for each element of the condition. */
function selectArray(
  args: Args,
  ctx: EvalContext,
  condition: CalcArray,
  trueNode: () => Value,
  falseNode: () => Value,
): Value {
  const trueValue = trueNode();
  const falseValue = falseNode();
  const trueMatrix = isReference(trueValue) || isArray(trueValue) ? toMatrix(ctx, trueValue) : [[scalarOf(ctx, trueValue)]];
  const falseMatrix = isReference(falseValue) || isArray(falseValue)
    ? toMatrix(ctx, falseValue)
    : [[scalarOf(ctx, falseValue)]];
  const rows = condition.rowCount;
  const cols = condition.colCount;
  const result: ScalarValue[][] = [];
  for (let r = 0; r < rows; r++) {
    const row: ScalarValue[] = [];
    for (let c = 0; c < cols; c++) {
      const test = truthy(condition.at(r, c));
      if (isError(test)) row.push(test);
      else {
        const matrix = test ? trueMatrix : falseMatrix;
        row.push(matrix[r]?.[c] ?? matrix[0]?.[0] ?? null);
      }
    }
    result.push(row);
  }
  void args;
  return new CalcArray(result);
}

export const LOGICAL_FUNCTIONS: DefinedFunction[] = [
  define(
    'IF',
    1,
    3,
    (args, ctx) => {
      const condition = args.value(0);
      if (isError(condition)) return condition;
      const array = arrayCondition(ctx, condition);
      if (array) {
        return selectArray(args, ctx, array, () => args.value(1), () => args.value(2));
      }
      const test = truthy(scalarOf(ctx, condition));
      if (isError(test)) return test;
      if (test) {
        if (args.isMissing(1)) return 0;
        return safeScalar(args, 1, ctx);
      }
      if (args.isMissing(2)) return false;
      return safeScalar(args, 2, ctx);
    },
    { lazy: true },
  ),
  define(
    'IFS',
    2,
    255,
    (args, ctx) => {
      for (let index = 0; index + 1 < args.count; index += 2) {
        const value = args.value(index);
        if (isError(value)) return value;
        const test = truthy(scalarOf(ctx, value));
        if (isError(test)) return test;
        if (test) return safeScalar(args, index + 1, ctx);
      }
      return error(ErrorCode.na);
    },
    { lazy: true },
  ),
  define(
    'IFERROR',
    2,
    2,
    (args, ctx) => {
      const value = args.value(0);
      if (isError(value)) return safeScalar(args, 1, ctx);
      if (value instanceof ReferenceValue) {
        const scalar = scalarOf(ctx, value);
        if (isError(scalar)) return safeScalar(args, 1, ctx);
        return scalar;
      }
      if (value instanceof CalcArray) return value;
      return value;
    },
    { lazy: true },
  ),
  define(
    'IFNA',
    2,
    2,
    (args, ctx) => {
      const value = args.value(0);
      if (isError(value) && value.error === ErrorCode.na) return safeScalar(args, 1, ctx);
      if (value instanceof ReferenceValue) {
        const scalar = scalarOf(ctx, value);
        if (isError(scalar) && scalar.error === ErrorCode.na) return safeScalar(args, 1, ctx);
        return scalar;
      }
      return value;
    },
    { lazy: true },
  ),
  define(
    'SWITCH',
    3,
    255,
    (args, ctx) => {
      const target = args.value(0);
      const targetScalar = scalarOf(ctx, target);
      if (isError(targetScalar)) return targetScalar;
      let index = 1;
      for (; index + 1 < args.count; index += 2) {
        const candidate = scalarOf(ctx, args.value(index));
        if (isError(candidate)) return candidate;
        const comparison = compareEquality(targetScalar, candidate);
        if (comparison) return safeScalar(args, index + 1, ctx);
      }
      if (index < args.count) return safeScalar(args, index, ctx);
      return error(ErrorCode.na);
    },
    { lazy: true },
  ),
  define(
    'CHOOSE',
    2,
    255,
    (args, ctx) => {
      const index = args.number(0);
      if (index < 1 || index >= args.count) return error(ErrorCode.value);
      return safeScalar(args, Math.trunc(index), ctx);
    },
    { lazy: true },
  ),
  define('AND', 1, 255, (args, ctx) => {
    let result = true;
    for (const entry of allEntries(args, ctx)) {
      if (entry.value === null) continue;
      const converted = truthy(entry.value);
      if (isError(converted)) return converted;
      if (!converted) result = false;
    }
    return result;
  }),
  define('OR', 1, 255, (args, ctx) => {
    let result = false;
    for (const entry of allEntries(args, ctx)) {
      if (entry.value === null) continue;
      const converted = truthy(entry.value);
      if (isError(converted)) return converted;
      if (converted) result = true;
    }
    return result;
  }),
  define('XOR', 1, 255, (args, ctx) => {
    let result = false;
    for (const entry of allEntries(args, ctx)) {
      if (entry.value === null) continue;
      const converted = truthy(entry.value);
      if (isError(converted)) return converted;
      if (converted) result = !result;
    }
    return result;
  }),
  define('NOT', 1, 1, (args, ctx) => {
    const value = truthy(scalarOf(ctx, args.value(0)));
    if (isError(value)) return value;
    return !value;
  }),
  define('TRUE', 0, 0, () => true),
  define('FALSE', 0, 0, () => false),
  define('NA', 0, 0, () => error(ErrorCode.na)),
  define('ISBLANK', 1, 1, (args, _ctx) => args.scalar(0) === null),
  define('ISERR', 1, 1, (args, _ctx) => {
    const value = args.scalar(0);
    return isError(value) && value.error !== ErrorCode.na;
  }),
  define('ISERROR', 1, 1, (args, _ctx) => isError(args.scalar(0))),
  define('ISNA', 1, 1, (args, _ctx) => {
    const value = args.scalar(0);
    return isError(value) && value.error === ErrorCode.na;
  }),
  define('ISNUMBER', 1, 1, (args, ctx) => typeof scalarOf(ctx, args.value(0)) === 'number'),
  define('ISTEXT', 1, 1, (args, ctx) => typeof scalarOf(ctx, args.value(0)) === 'string'),
  define('ISNONTEXT', 1, 1, (args, ctx) => typeof scalarOf(ctx, args.value(0)) !== 'string'),
  define('ISLOGICAL', 1, 1, (args, ctx) => typeof scalarOf(ctx, args.value(0)) === 'boolean'),
  define('ISEVEN', 1, 1, (args) => {
    const value = args.number(0);
    return Math.trunc(value) % 2 === 0;
  }),
  define('ISODD', 1, 1, (args) => {
    const value = args.number(0);
    return Math.abs(Math.trunc(value) % 2) === 1;
  }),
  define('ISREF', 1, 1, (args) => args.value(0) instanceof ReferenceValue),
  define('ISFORMULA', 1, 1, (args, ctx) => {
    const value = args.value(0);
    if (!(value instanceof ReferenceValue) || !value.areas.length) return false;
    const area = value.areas[0]!;
    return ctx.host.hasFormula(area.sheet, area.r1, area.c1);
  }),
  define('N', 1, 1, (args, ctx) => {
    const value = scalarOf(ctx, args.value(0));
    if (isError(value)) return value;
    if (value === null) return 0;
    if (typeof value === 'number') return value;
    if (typeof value === 'boolean') return value ? 1 : 0;
    if (value instanceof Date) return dateSerial(value);
    return 0;
  }),
  define('T', 1, 1, (args, ctx) => {
    const value = scalarOf(ctx, args.value(0));
    if (isError(value)) return value;
    return typeof value === 'string' ? value : '';
  }),
  define('TYPE', 1, 1, (args, ctx) => {
    const raw = args.value(0);
    if (isError(raw)) return 16;
    if (isArray(raw)) return 64;
    if (raw instanceof ReferenceValue) {
      const value = scalarOf(ctx, raw);
      return valueType(value);
    }
    return valueType(raw as ScalarValue);
  }),
  define('ERROR.TYPE', 1, 1, (args) => {
    const value = args.value(0);
    if (!isError(value)) return error(ErrorCode.na);
    const codes: Record<string, number> = {
      '#NULL!': 1,
      '#DIV/0!': 2,
      '#VALUE!': 3,
      '#REF!': 4,
      '#NAME?': 5,
      '#NUM!': 6,
      '#N/A': 7,
      '#SPILL!': 9,
      '#CALC!': 14,
    };
    return codes[value.error] ?? error(ErrorCode.na);
  }),
  define('ROW', 0, 1, (args, ctx) => referenceStart(args, ctx, 'row')),
  define('COLUMN', 0, 1, (args, ctx) => referenceStart(args, ctx, 'col')),
  define('ROWS', 1, 1, (args, ctx) => referenceSize(args, ctx, 'rows')),
  define('COLUMNS', 1, 1, (args, ctx) => referenceSize(args, ctx, 'cols')),
  define('SHEET', 0, 1, (args, ctx) => {
    if (args.isMissing(0)) return ctx.host.workbookIndex(ctx.sheet);
    const value = args.value(0);
    if (isError(value)) return value;
    let sheet = ctx.sheet;
    if (value instanceof ReferenceValue && value.areas.length) sheet = value.areas[0]!.sheet;
    else if (typeof value === 'string') {
      const found = ctx.host.sheetFromName(value);
      if (!found) return error(ErrorCode.na);
      sheet = found;
    }
    return ctx.host.workbookIndex(sheet);
  }),
  define('SHEETS', 0, 1, (args, ctx) => {
    if (args.isMissing(0)) return ctx.host.sheetCount();
    const value = args.value(0);
    if (value instanceof ReferenceValue) return 1;
    return ctx.host.sheetCount();
  }),
  define('AREAS', 1, 1, (args) => {
    const value = args.value(0);
    return value instanceof ReferenceValue ? value.areas.length : error(ErrorCode.value);
  }),
  define('FORMULATEXT', 1, 1, (args, ctx) => {
    const value = args.value(0);
    if (!(value instanceof ReferenceValue) || !value.areas.length) return error(ErrorCode.na);
    const area = value.areas[0]!;
    const formula = ctx.host.getFormulaText(area.sheet, area.r1, area.c1);
    return formula ? `=${formula}` : error(ErrorCode.na);
  }),
  define(
    'LET',
    3,
    255,
    (args, ctx) => {
      const environment = { vars: new Map(ctx.env?.vars), parent: ctx.env };
      let index = 0;
      while (index + 2 < args.count) {
        const nameNode = args.node(index);
        if (nameNode.kind !== 'name') return error(ErrorCode.value);
        const valueNode = args.node(index + 1);
        const value = evaluateWithEnvironment(args, valueNode, ctx, environment);
        environment.vars.set(nameNode.name.toUpperCase(), value);
        index += 2;
      }
      const resultNode = args.node(index);
      return evaluateWithEnvironment(args, resultNode, ctx, environment);
    },
    { lazy: true },
  ),
  define(
    'LAMBDA',
    1,
    255,
    (args, ctx) => {
      const params: string[] = [];
      for (let index = 0; index < args.count - 1; index++) {
        const node = args.node(index);
        if (node.kind !== 'name') return error(ErrorCode.value);
        params.push(node.name);
      }
      const bodyNode = args.node(args.count - 1);
      return { kind: 'lambda', params, body: bodyNode, context: ctx.env };
    },
    { lazy: true },
  ),
];

function evaluateWithEnvironment(
  args: Args,
  node: ReturnType<Args['node']>,
  ctx: EvalContext,
  environment: { vars: Map<string, Value>; parent?: EvalContext['env'] },
): Value {
  const evaluator = args.evaluatorRef();
  try {
    return evaluator.evaluate(node, { ...ctx, env: environment });
  } catch (thrown) {
    if (thrown instanceof ErrorThrown) return thrown.value;
    throw thrown;
  }
}

function safeScalar(args: Args, index: number, ctx: EvalContext): Value {
  const value = args.value(index);
  if (value instanceof ReferenceValue || value instanceof CalcArray) return value;
  if (isMissing(value)) return null;
  void ctx;
  return value as ScalarValue;
}

function compareEquality(a: ScalarValue, b: ScalarValue): boolean {
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;
  if (typeof a === 'number' && typeof b === 'number') return a === b;
  if (typeof a === 'string' && typeof b === 'string') return a.toLowerCase() === b.toLowerCase();
  if (typeof a === 'boolean' && typeof b === 'boolean') return a === b;
  if (typeof a === 'number' && typeof b === 'string') return numberToText(a) === b;
  if (typeof a === 'string' && typeof b === 'number') return a === numberToText(b);
  return false;
}

function dateSerial(value: Date): number {
  return dateToSerial(value);
}

function valueType(value: ScalarValue): number {
  if (isError(value)) return 16;
  if (value === null) return 1;
  if (typeof value === 'number') return 1;
  if (value instanceof Date) return 1;
  if (typeof value === 'string') return 2;
  if (typeof value === 'boolean') return 4;
  return 1;
}

function referenceStart(args: Args, ctx: EvalContext, axis: 'row' | 'col'): Value {
  if (args.isMissing(0)) return axis === 'row' ? ctx.row + 1 : ctx.col + 1;
  const value = args.value(0);
  if (isError(value)) return value;
  if (!(value instanceof ReferenceValue)) return error(ErrorCode.value);
  const area = value.areas[0]!;
  return axis === 'row' ? area.r1 + 1 : area.c1 + 1;
}

function referenceSize(args: Args, ctx: EvalContext, axis: 'rows' | 'cols'): Value {
  const value = args.value(0);
  if (isError(value)) return value;
  if (value instanceof ReferenceValue) {
    const area = value.areas[0]!;
    return axis === 'rows' ? area.r2 - area.r1 + 1 : area.c2 - area.c1 + 1;
  }
  if (value instanceof CalcArray) return axis === 'rows' ? value.rowCount : value.colCount;
  return 1;
}

export { LOGICAL_FUNCTIONS as INFO_FUNCTIONS };
export type { Worksheet };
