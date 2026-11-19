/** Shared helpers for the built-in function library. */
import type { Worksheet } from '../../worksheet.js';
import {
  Args,
  EvalContext,
  MISSING,
  ScalarValue,
  toText,
} from '../evaluate.js';
import {
  CalcArray,
  CalcError,
  ErrorCode,
  ReferenceValue,
  Value,
  compareText,
  dateToSerial,
  error,
  isError,
  normalizeNumber,
  numberToText,
  parseNumberText,
  raise,
  raiseError,
} from '../values.js';

export interface Entry {
  value: ScalarValue;
  fromReference: boolean;
  fromArray?: boolean;
}

/** Iterates an argument expanding references and arrays into scalar values. */
export function* entries(args: Args, ctx: EvalContext, index: number): Iterable<Entry> {
  const value = args.value(index);
  if (value === MISSING) {
    yield { value: null, fromReference: false };
    return;
  }
  if (value instanceof ReferenceValue) {
    for (const area of value.areas)
      for (let row = area.r1; row <= area.r2; row++)
        for (let col = area.c1; col <= area.c2; col++)
          yield { value: area.sheet._fastValue(row, col) as ScalarValue, fromReference: true };
    return;
  }
  if (value instanceof CalcArray) {
    for (const row of value.array)
      for (const item of row) yield { value: item as ScalarValue, fromReference: true, fromArray: true };
    return;
  }
  if (value instanceof ReferenceValue) return;
  yield { value: value as ScalarValue, fromReference: false };
}

/** Iterates every value of every argument. */
export function* allEntries(args: Args, ctx: EvalContext, start = 0): Iterable<Entry> {
  for (let index = start; index < args.count; index++) yield* entries(args, ctx, index);
}

export function* rangeEntries(args: Args, ctx: EvalContext, start: number, end: number): Iterable<Entry> {
  for (let index = start; index < end; index++) yield* entries(args, ctx, index);
}

export type CoercionMode = 'coerce' | 'ignore' | 'error';

export interface NumberOptions {
  refText?: CoercionMode;
  refBool?: CoercionMode;
  arrayText?: CoercionMode;
  arrayBool?: CoercionMode;
  refNull?: 'skip' | 'zero';
  directText?: CoercionMode;
  directBool?: CoercionMode;
  errors?: 'raise' | 'skip';
}

const DEFAULT_NUMBERS: Required<NumberOptions> = {
  refText: 'ignore',
  refBool: 'ignore',
  arrayText: 'ignore',
  arrayBool: 'ignore',
  refNull: 'skip',
  directText: 'error',
  directBool: 'coerce',
  errors: 'raise',
};

/** Collects numeric values from arguments with SpreadJS coercion modes. */
export function numbers(
  args: Args,
  ctx: EvalContext,
  options: NumberOptions = {},
  start = 0,
  end = args.count,
): number[] {
  const config = { ...DEFAULT_NUMBERS, ...options };
  const result: number[] = [];
  const accept = (value: ScalarValue, fromReference: boolean, fromArray: boolean): void => {
    if (value instanceof CalcError) {
      if (config.errors === 'raise') raiseError(value);
      return;
    }
    if (value === null) {
      if (config.refNull === 'zero') result.push(0);
      return;
    }
    if (typeof value === 'number') {
      result.push(value);
      return;
    }
    if (value instanceof Date) {
      result.push(dateToSerial(value));
      return;
    }
    if (typeof value === 'string') {
      const mode = fromArray ? config.arrayText : fromReference ? config.refText : config.directText;
      if (mode === 'ignore') {
        if (fromReference) return;
        const parsed = parseNumberText(value);
        if (parsed !== undefined) result.push(parsed);
        return;
      }
      if (mode === 'error') {
        if (!fromReference) raise(ErrorCode.value);
        return;
      }
      const parsed = parseNumberText(value);
      if (parsed !== undefined) result.push(parsed);
      else if (!fromReference) raise(ErrorCode.value);
      return;
    }
    if (typeof value === 'boolean') {
      const boolMode = fromArray ? config.arrayBool : fromReference ? config.refBool : config.directBool;
      if (boolMode === 'ignore') return;
      if (boolMode === 'error') raise(ErrorCode.value);
      result.push(value ? 1 : 0);
      return;
    }
    raise(ErrorCode.value);
  };
  for (let index = start; index < end; index++) {
    const value = args.value(index);
    if (value === MISSING) accept(null, false, false);
    else if (value instanceof ReferenceValue) {
      for (const area of value.areas)
        for (let row = area.r1; row <= area.r2; row++)
          for (let col = area.c1; col <= area.c2; col++)
            accept(area.sheet._fastValue(row, col) as ScalarValue, true, false);
    } else if (value instanceof CalcArray) {
      for (const row of value.array) for (const item of row) accept(item as ScalarValue, true, true);
    } else accept(value as ScalarValue, false, false);
  }
  return result;
}

export const NUMBER_MODES = {
  sum: {
    refText: 'coerce',
    refBool: 'coerce',
    arrayText: 'ignore',
    arrayBool: 'ignore',
    directText: 'ignore',
    directBool: 'coerce',
  },
  average: {
    refText: 'ignore',
    refBool: 'ignore',
    arrayText: 'ignore',
    arrayBool: 'ignore',
    directText: 'error',
    directBool: 'coerce',
  },
  median: {
    refText: 'coerce',
    refBool: 'coerce',
    arrayText: 'ignore',
    arrayBool: 'ignore',
    directText: 'coerce',
    directBool: 'coerce',
  },
  a: {
    refText: 'coerce',
    refBool: 'coerce',
    arrayText: 'ignore',
    arrayBool: 'ignore',
    directText: 'coerce',
    directBool: 'coerce',
  },
  count: { refText: 'ignore', refBool: 'ignore', directText: 'ignore', directBool: 'ignore' },
  sumsq: {
    refText: 'coerce',
    refBool: 'coerce',
    arrayText: 'ignore',
    arrayBool: 'ignore',
    directText: 'coerce',
    directBool: 'coerce',
  },
} as const satisfies Record<string, NumberOptions>;

/** Numeric result guard: functions turn NaN into #NUM! but keep infinities. */
export function numeric(value: number): number | CalcError {
  if (Number.isNaN(value)) return error(ErrorCode.num);
  return normalizeNumber(value);
}

/**
 * Coerce a helper result that may be an error value into a number for plain
 * arithmetic, exactly like the implicit JS coercion did (CalcError object -> NaN).
 */
export function forMath(value: number | CalcError): number {
  return typeof value === 'number' ? value : Number.NaN;
}

export function integer(value: number): number {
  return Math.trunc(value);
}

/** Text values from arguments, expanding arrays but implicit-intersecting refs. */
export function textValues(args: Args, ctx: EvalContext, start = 0, separator = ''): string {
  const parts: string[] = [];
  for (let index = start; index < args.count; index++) {
    const value = args.value(index);
    if (value === MISSING) continue;
    if (value instanceof ReferenceValue || value instanceof CalcArray) {
      for (const entry of entries(args, ctx, index)) {
        if (isError(entry.value)) raiseError(entry.value);
        if (entry.value === null) continue;
        parts.push(toText(ctx, entry.value));
      }
    } else {
      if (isError(value)) raiseError(value);
      parts.push(toText(ctx, value));
    }
  }
  void separator;
  return parts.join('');
}

/** Compares values using the criteria syntax of COUNTIF/SUMIF. */
export interface Criterion {
  match(value: ScalarValue, ctx: EvalContext): boolean;
}

export function makeCriterion(criteria: ScalarValue): Criterion {
  if (criteria instanceof CalcError) {
    return {
      match(value) {
        return value instanceof CalcError && value.error === criteria.error;
      },
    };
  }
  if (criteria === null) {
    return { match: (value) => value === null || value === '' };
  }
  if (typeof criteria === 'number' || typeof criteria === 'boolean' || criteria instanceof Date) {
    const target = typeof criteria === 'number' ? criteria : criteria instanceof Date ? dateToSerial(criteria) : criteria;
    return { match: (value) => equalsLiteral(value, target) };
  }
  let text = String(criteria);
  let op: '=' | '<>' | '<' | '>' | '<=' | '>=';
  op = '=';
  const operator = /^(<=|>=|<>|=|<|>)/.exec(text);
  if (operator) {
    op = operator[1] as '=' | '<>' | '<' | '>' | '<=' | '>=';
    text = text.slice(operator[1]!.length);
  }
  let target: ScalarValue;
  if (/^(TRUE|FALSE)$/i.test(text)) target = text.toUpperCase() === 'TRUE';
  else if (text === '') target = null;
  else if (/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(text)) target = Number(text);
  else target = text;
  if (op === '=' && typeof target === 'string' && /[*?~]/.test(target)) {
    const pattern = wildcardToRegExp(target);
    return {
      match: (value) => {
        if (value === null) return false;
        if (typeof value === 'string') return pattern.test(value);
        if (typeof value === 'number') return pattern.test(numberToText(value));
        if (typeof value === 'boolean') return pattern.test(value ? 'TRUE' : 'FALSE');
        return value instanceof CalcError && pattern.test(value.error);
      },
    };
  }
  if (op === '<>' && typeof target === 'string' && /[*?~]/.test(target)) {
    const pattern = wildcardToRegExp(target);
    return {
      match: (value) => {
        if (value === null) return true;
        if (typeof value === 'string') return !pattern.test(value);
        if (typeof value === 'number') return !pattern.test(numberToText(value));
        if (typeof value === 'boolean') return !pattern.test(value ? 'TRUE' : 'FALSE');
        return true;
      },
    };
  }
  return {
    match: (value) => {
      const comparison = compareValueToTarget(value, target, op);
      if (comparison === undefined) return false;
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
        case '>=':
          return comparison >= 0;
      }
    },
  };
}

function equalsLiteral(value: ScalarValue, target: number | boolean): boolean {
  if (value === null) return target === 0 || target === false;
  if (typeof value === 'number') return value === target;
  if (typeof value === 'boolean') return value === target;
  if (value instanceof Date) return dateToSerial(value) === target;
  if (typeof value === 'string') {
    const parsed = parseNumberText(value);
    if (parsed !== undefined && typeof target === 'number') return parsed === target;
    if (typeof target === 'boolean') return value.toUpperCase() === (target ? 'TRUE' : 'FALSE');
  }
  return false;
}

function compareValueToTarget(
  value: ScalarValue,
  target: ScalarValue,
  op: string = '=',
): number | undefined {
  if (value instanceof CalcError) return undefined;
  if (target === null) {
    if (value === null) return 0;
    if (typeof value === 'string') return value === '' ? 0 : 1;
    return 1;
  }
  if (value === null) {
    if (typeof target === 'number') return 0 === target ? 0 : 0 < target ? -1 : 1;
    if (typeof target === 'string') return 0;
    if (typeof target === 'boolean') return 0 < (target ? 1 : 0) ? -1 : 1;
    return undefined;
  }
  if (typeof target === 'number') {
    if (typeof value === 'number') return value === target ? 0 : value < target ? -1 : 1;
    if (value instanceof Date) {
      const num = dateToSerial(value);
      return num === target ? 0 : num < target ? -1 : 1;
    }
    if (typeof value === 'boolean') return 1;
    if (typeof value === 'string') {
      if (op === '=' || op === '<>') {
        const parsed = parseNumberText(value);
        if (parsed !== undefined) return parsed === target ? 0 : parsed < target ? -1 : 1;
        return 1;
      }
      return 1;
    }
    return undefined;
  }
  if (typeof target === 'string') {
    if (typeof value === 'string') return compareText(value, target);
    if (typeof value === 'number') return compareText(numberToText(value), target);
    if (typeof value === 'boolean') return compareText(value ? 'TRUE' : 'FALSE', target);
    return undefined;
  }
  if (typeof target === 'boolean') {
    if (typeof value === 'boolean') return value === target ? 0 : value ? 1 : -1;
    if (typeof value === 'number' || value instanceof Date) return -1;
    if (typeof value === 'string') return 1;
    return undefined;
  }
  return undefined;
}

export function wildcardToRegExp(pattern: string): RegExp {
  let source = '^';
  for (let index = 0; index < pattern.length; index++) {
    const char = pattern[index]!;
    if (char === '~') {
      const next = pattern[index + 1];
      if (next !== undefined) {
        source += escapeRegExp(next);
        index++;
      } else source += '~';
    } else if (char === '*') source += '.*';
    else if (char === '?') source += '.';
    else source += escapeRegExp(char);
  }
  source += '$';
  return new RegExp(source, 'i');
}

function escapeRegExp(value: string): string {
  return value.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');
}

/** Criteria that also matches errors literally (COUNTIF). */
export function matchesCriterion(criterion: Criterion, value: ScalarValue, ctx: EvalContext): boolean {
  return criterion.match(value, ctx);
}

// ---------------------------------------------------------------------------
// Function definition helpers
// ---------------------------------------------------------------------------
export interface DefinedFunction {
  name: string;
  min: number;
  max: number;
  evaluate(args: Args, ctx: EvalContext): Value;
  lazy?: boolean;
  volatile?: boolean;
}

export function define(
  name: string,
  min: number,
  max: number,
  evaluate: (args: Args, ctx: EvalContext) => Value,
  extra: { lazy?: boolean; volatile?: boolean } = {},
): DefinedFunction {
  return { name, min, max, evaluate, ...extra };
}

/** Number of a scalar argument, raising on errors. */
export function num(args: Args, index: number): number {
  return args.number(index);
}

export function str(args: Args, index: number): string {
  return args.text(index);
}

export function bool(args: Args, index: number): boolean {
  return args.boolean(index);
}

export function int(args: Args, index: number): number {
  return Math.trunc(args.number(index));
}

export function writeSheet(sheet: Worksheet): Worksheet {
  return sheet;
}
