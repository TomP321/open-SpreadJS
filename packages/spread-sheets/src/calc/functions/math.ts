/** Mathematical and trig functions. */
import {
  Args,
  EvalContext,
  MISSING,
  excelPower,
  raise,
  raiseError,
  sumReferenceValues,
} from '../evaluate.js';
import {
  CalcArray,
  CalcError,
  ErrorCode,
  ReferenceValue,
  ScalarValue,
  Value,
  dateToSerial,
  error,
  isError,
  normalizeNumber,
  numberToText,
  parseNumberText,
} from '../values.js';
import {
  type DefinedFunction,
  NUMBER_MODES,
  define,
  entries,
  forMath,
  integer,
  makeCriterion,
  matchesCriterion,
  numbers,
  numeric,
} from './common.js';

const PI = Math.PI;

function roundValue(value: number, digits: number, mode: 'half' | 'up' | 'down'): number {
  if (!Number.isFinite(value)) return value;
  const shift = Math.pow(10, digits);
  const scaled = Number((Math.abs(value) * shift).toPrecision(15));
  let rounded: number;
  if (mode === 'half') rounded = Math.floor(scaled + 0.5);
  else if (mode === 'up') rounded = Math.ceil(scaled);
  else rounded = Math.floor(scaled);
  const sign = value < 0 ? -1 : 1;
  return normalizeNumber((sign * rounded) / shift);
}

function matMul(a: number[][], b: number[][]): number[][] {
  const rows = a.length;
  const cols = b[0]?.length ?? 0;
  const inner = b.length;
  const result: number[][] = [];
  for (let r = 0; r < rows; r++) {
    const row: number[] = [];
    for (let c = 0; c < cols; c++) {
      let sum = 0;
      for (let k = 0; k < inner; k++) sum += a[r]![k]! * b[k]![c]!;
      row.push(normalizeNumber(sum));
    }
    result.push(row);
  }
  return result;
}

function determinant(matrix: number[][]): number {
  const n = matrix.length;
  const values = matrix.map((row) => row.slice());
  let det = 1;
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let row = col + 1; row < n; row++) if (Math.abs(values[row]![col]!) > Math.abs(values[pivot]![col]!)) pivot = row;
    if (values[pivot]![col] === 0) return 0;
    if (pivot !== col) {
      [values[pivot], values[col]] = [values[col]!, values[pivot]!];
      det = -det;
    }
    det *= values[col]![col]!;
    const pivotValue = values[col]![col]!;
    for (let row = col + 1; row < n; row++) {
      const factor = values[row]![col]! / pivotValue;
      for (let c = col; c < n; c++) values[row]![c] = values[row]![c]! - factor * values[col]![c]!;
    }
  }
  return normalizeNumber(det);
}

function invert(matrix: number[][]): number[][] | undefined {
  const n = matrix.length;
  const values = matrix.map((row, index) => [...row, ...Array.from({ length: n }, (_, col) => (col === index ? 1 : 0))]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let row = col + 1; row < n; row++) if (Math.abs(values[row]![col]!) > Math.abs(values[pivot]![col]!)) pivot = row;
    if (Math.abs(values[pivot]![col]!) < 1e-15) return undefined;
    [values[pivot], values[col]] = [values[col]!, values[pivot]!];
    const pivotValue = values[col]![col]!;
    for (let c = 0; c < 2 * n; c++) values[col]![c] = values[col]![c]! / pivotValue;
    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = values[row]![col]!;
      if (!factor) continue;
      for (let c = 0; c < 2 * n; c++) values[row]![c] = values[row]![c]! - factor * values[col]![c]!;
    }
  }
  return values.map((row) => row.slice(n).map((value) => normalizeNumber(value)));
}

function toNumberMatrix(args: Args, ctx: EvalContext, index: number): number[][] {
  const array = args.array(index);
  return array.array.map((row) =>
    row.map((value) => {
      if (isError(value)) raiseError(value);
      if (value === null) return 0;
      if (typeof value === 'number') return value;
      if (typeof value === 'boolean') return value ? 1 : 0;
      if (typeof value === 'string') {
        const parsed = parseNumberText(value);
        if (parsed === undefined) raise(ErrorCode.value);
        return parsed;
      }
      if (value instanceof Date) return dateToSerial(value);
      raise(ErrorCode.value);
    }),
  );
}

const ROMAN_VALUES: [number, string][] = [
  [1000, 'M'],
  [900, 'CM'],
  [500, 'D'],
  [400, 'CD'],
  [100, 'C'],
  [90, 'XC'],
  [50, 'L'],
  [40, 'XL'],
  [10, 'X'],
  [9, 'IX'],
  [5, 'V'],
  [4, 'IV'],
  [1, 'I'],
];

function toRoman(value: number): string {
  let remaining = Math.trunc(value);
  let result = '';
  for (const [amount, symbol] of ROMAN_VALUES) {
    while (remaining >= amount) {
      result += symbol;
      remaining -= amount;
    }
  }
  return result;
}

const ROMAN_REVERSE: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };

function fromRoman(text: string): number {
  const upper = text.toUpperCase();
  if (!/^[IVXLCDM]+$/.test(upper)) raise(ErrorCode.value);
  let result = 0;
  for (let index = 0; index < upper.length; index++) {
    const current = ROMAN_REVERSE[upper[index]!]!;
    const next = ROMAN_REVERSE[upper[index + 1] ?? ''] ?? 0;
    result += current < next ? -current : current;
  }
  return result;
}

function criteriaSum(
  args: Args,
  ctx: EvalContext,
  mode: 'sum' | 'average' | 'count' | 'max' | 'min',
): Value {
  const rangeEntries = [...entries(args, ctx, 0)];
  const criterion = makeCriterion(args.scalar(1));
  const sumArg = args.count > 2 ? args.value(2) : undefined;
  const sumEntries = sumArg !== undefined && sumArg !== MISSING ? [...entries(args, ctx, 2)] : rangeEntries;
  const values: number[] = [];
  for (let index = 0; index < rangeEntries.length; index++) {
    const entry = rangeEntries[index]!;
    if (!matchesCriterion(criterion, entry.value, ctx)) continue;
    const target = sumEntries[index]?.value ?? null;
    if (mode === 'count') {
      values.push(1);
      continue;
    }
    const numeric = sumValue(target);
    if (numeric !== undefined) values.push(numeric);
  }
  if (mode === 'count') return values.length;
  if (!values.length) return mode === 'sum' || mode === 'max' || mode === 'min' ? 0 : error(ErrorCode.div0);
  if (mode === 'sum') return normalizeNumber(values.reduce((sum, value) => sum + value, 0));
  if (mode === 'average') return normalizeNumber(values.reduce((sum, value) => sum + value, 0) / values.length);
  if (mode === 'max') return Math.max(...values);
  return Math.min(...values);
}

function sumValue(value: ScalarValue): number | undefined {
  if (value === null) return undefined;
  if (typeof value === 'number') return value;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'string') return parseNumberText(value);
  if (value instanceof Date) return dateToSerial(value);
  if (value instanceof CalcError) raiseError(value);
  return undefined;
}

function multiCriteria(
  args: Args,
  ctx: EvalContext,
  mode: 'sum' | 'average' | 'max' | 'min' | 'count',
): Value {
  const first = [...entries(args, ctx, 0)];
  const criteriaPairs = Math.floor((args.count - 1) / 2);
  const criteria: ReturnType<typeof makeCriterion>[] = [];
  for (let pair = 0; pair < criteriaPairs; pair++) {
    criteria.push(makeCriterion(args.scalar(pair * 2 + 2)));
  }
  void first;
  let sumEntries: ScalarValue[] | undefined;
  if (mode === 'sum' || mode === 'average' || mode === 'max' || mode === 'min') {
    sumEntries = [...entries(args, ctx, 0)].map((entry) => entry.value);
  }
  const reference = [...entries(args, ctx, 1)].map((entry) => entry.value);
  const selected: number[] = [];
  for (let index = 0; index < reference.length; index++) {
    let ok = true;
    for (let pair = 0; pair < criteriaPairs; pair++) {
      const values = [...entries(args, ctx, pair * 2 + 1)];
      const candidate = values[index]?.value ?? null;
      if (!criteria[pair]!.match(candidate, ctx)) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;
    if (mode === 'count') {
      selected.push(1);
      continue;
    }
    const value = sumEntries?.[index] ?? null;
    const numeric = sumValue(value);
    if (numeric !== undefined) selected.push(numeric);
  }
  if (mode === 'count') return selected.length;
  if (!selected.length)
    return mode === 'sum' || mode === 'max' || mode === 'min' ? 0 : error(ErrorCode.div0);
  if (mode === 'sum') return normalizeNumber(selected.reduce((sum, value) => sum + value, 0));
  if (mode === 'average') return normalizeNumber(selected.reduce((sum, value) => sum + value, 0) / selected.length);
  if (mode === 'max') return Math.max(...selected);
  return Math.min(...selected);
}

export const MATH_FUNCTIONS: DefinedFunction[] = [
  define('SUM', 1, 255, (args, ctx) => {
    if (args.count === 1) {
      const single = args.value(0);
      if (single instanceof ReferenceValue) return sumReferenceValues(ctx, single) as Value;
    }
    let total = 0;
    for (let index = 0; index < args.count; index++) {
      const value = args.value(index);
      if (value instanceof ReferenceValue) {
        for (const area of value.areas) {
          const sheet = area.sheet;
          for (let row = area.r1; row <= area.r2; row++) {
            for (let col = area.c1; col <= area.c2; col++) {
              const cell = sheet._fastValue(row, col);
              if (typeof cell === 'number') total += cell;
              else if (cell instanceof CalcError) raiseError(cell);
              else if (typeof cell === 'boolean') total += cell ? 1 : 0;
              else if (cell instanceof Date) total += dateToSerial(cell);
              else if (typeof cell === 'string') {
                const parsed = parseNumberText(cell);
                if (parsed !== undefined) total += parsed;
              }
            }
          }
        }
      } else if (value instanceof CalcArray) {
        for (const line of value.array)
          for (const item of line) {
            if (typeof item === 'number') total += item;
            else if (isError(item)) raiseError(item);
          }
      } else if (value !== MISSING) {
        if (isError(value)) raiseError(value);
        if (typeof value === 'number') total += value;
        else if (typeof value === 'boolean') total += value ? 1 : 0;
        else if (value instanceof Date) total += dateToSerial(value);
        else if (typeof value === 'string') {
          const parsed = parseNumberText(value);
          if (parsed !== undefined) total += parsed;
        }
      }
    }
    return normalizeNumber(total);
  }),
  define('PRODUCT', 1, 255, (args, ctx) => {
    const values = numbers(args, ctx, NUMBER_MODES.average);
    if (!values.length) return 0;
    let product = 1;
    for (const value of values) product *= value;
    return numeric(product);
  }),
  define('SUMSQ', 1, 255, (args, ctx) => {
    const values = numbers(args, ctx, NUMBER_MODES.sumsq);
    return normalizeNumber(values.reduce((sum, value) => sum + value * value, 0));
  }),
  define('SUMPRODUCT', 1, 255, (args, _ctx) => {
    let result: CalcArray | undefined;
    for (let index = 0; index < args.count; index++) {
      const array = args.array(index);
      if (!result) {
        result = array;
        continue;
      }
      const rows = result.rowCount;
      const cols = result.colCount;
      if (array.rowCount !== rows || array.colCount !== cols) return error(ErrorCode.value);
      const product: ScalarValue[][] = [];
      for (let r = 0; r < rows; r++) {
        const row: ScalarValue[] = [];
        for (let c = 0; c < cols; c++)
          row.push(applyProduct(result.at(r, c), array.at(r, c)));
        product.push(row);
      }
      result = new CalcArray(product);
    }
    let total = 0;
    for (let r = 0; r < (result?.rowCount ?? 0); r++)
      for (let c = 0; c < (result?.colCount ?? 0); c++) {
        const value = result!.at(r, c);
        if (isError(value)) raiseError(value);
        if (typeof value === 'number') total += value;
        else if (typeof value === 'boolean') total += value ? 1 : 0;
        else if (typeof value === 'string') {
          const parsed = parseNumberText(value);
          if (parsed !== undefined) total += parsed;
        }
      }
    return normalizeNumber(total);
  }),
  define('SUMIF', 2, 3, (args, ctx) => criteriaSum(args, ctx, 'sum')),
  define('SUMIFS', 3, 255, (args, ctx) => multiCriteria(args, ctx, 'sum')),
  define('SUMX2MY2', 2, 2, (args, ctx) => pairAggregate(args, ctx, (a, b) => a * a - b * b)),
  define('SUMX2PY2', 2, 2, (args, ctx) => pairAggregate(args, ctx, (a, b) => a * a + b * b)),
  define('SUMXMY2', 2, 2, (args, ctx) => pairAggregate(args, ctx, (a, b) => (a - b) * (a - b))),
  define('SUBTOTAL', 2, 255, (args, ctx) => subtotal(args, ctx)),
  define('AGGREGATE', 3, 255, (args, ctx) => aggregate(args, ctx)),
  define('ROUND', 2, 2, (args, _ctx) => roundValue(args.number(0), integer(args.number(1)), 'half')),
  define('ROUNDUP', 2, 2, (args, _ctx) => roundValue(args.number(0), integer(args.number(1)), 'up')),
  define('ROUNDDOWN', 2, 2, (args, _ctx) => roundValue(args.number(0), integer(args.number(1)), 'down')),
  define('MROUND', 2, 2, (args) => {
    const value = args.number(0);
    const multiple = args.number(1);
    if (multiple === 0) return 0;
    if (value * multiple < 0) return error(ErrorCode.num);
    return normalizeNumber(Math.sign(value) * Math.round(Math.abs(value) / Math.abs(multiple)) * Math.abs(multiple));
  }),
  define('CEILING', 1, 2, (args) => {
    const value = args.number(0);
    const significance = args.isMissing(1) ? 1 : args.number(1);
    if (significance === 0) return 0;
    if (value * significance < 0) return error(ErrorCode.num);
    const factor = Math.abs(significance);
    return normalizeNumber(Math.ceil(Math.abs(value) / factor - 1e-14) * factor * Math.sign(value || 1));
  }),
  define('CEILING.MATH', 1, 3, (args) => {
    const value = args.number(0);
    const significance = args.isMissing(1) ? 1 : Math.abs(args.number(1));
    const mode = args.isMissing(2) ? 0 : args.number(2);
    if (significance === 0) return 0;
    if (value >= 0) return normalizeNumber(Math.ceil(value / significance - 1e-14) * significance);
    if (mode !== 0) return normalizeNumber(-Math.ceil(-value / significance - 1e-14) * significance);
    return normalizeNumber(-Math.floor(-value / significance + 1e-14) * significance);
  }),
  define('CEILING.PRECISE', 1, 2, (args) => {
    const value = args.number(0);
    const significance = args.isMissing(1) ? 1 : Math.abs(args.number(1));
    if (significance === 0) return 0;
    return normalizeNumber(Math.ceil(value / significance - 1e-14) * significance);
  }),
  define('ISO.CEILING', 1, 2, (args) => {
    const value = args.number(0);
    const significance = args.isMissing(1) ? 1 : Math.abs(args.number(1));
    if (significance === 0) return 0;
    return normalizeNumber(Math.ceil(value / significance - 1e-14) * significance);
  }),
  define('FLOOR', 1, 2, (args) => {
    const value = args.number(0);
    const significance = args.isMissing(1) ? 1 : args.number(1);
    if (significance === 0) return 0;
    if (value * significance < 0) return error(ErrorCode.num);
    const factor = Math.abs(significance);
    return normalizeNumber(Math.floor(Math.abs(value) / factor + 1e-14) * factor * Math.sign(value || 1));
  }),
  define('FLOOR.MATH', 1, 3, (args) => {
    const value = args.number(0);
    const significance = args.isMissing(1) ? 1 : Math.abs(args.number(1));
    const mode = args.isMissing(2) ? 0 : args.number(2);
    if (significance === 0) return 0;
    if (value >= 0) return normalizeNumber(Math.floor(value / significance + 1e-14) * significance);
    if (mode !== 0) return normalizeNumber(-Math.floor(-value / significance + 1e-14) * significance);
    return normalizeNumber(-Math.ceil(-value / significance - 1e-14) * significance);
  }),
  define('FLOOR.PRECISE', 1, 2, (args) => {
    const value = args.number(0);
    const significance = args.isMissing(1) ? 1 : Math.abs(args.number(1));
    if (significance === 0) return 0;
    return normalizeNumber(Math.floor(value / significance + 1e-14) * significance);
  }),
  define('INT', 1, 1, (args) => Math.floor(args.number(0))),
  define('TRUNC', 1, 2, (args) => roundValue(args.number(0), args.isMissing(1) ? 0 : integer(args.number(1)), 'down')),
  define('MOD', 2, 2, (args) => {
    const value = args.number(0);
    const divisor = args.number(1);
    if (divisor === 0) return error(ErrorCode.div0);
    return normalizeNumber(value - divisor * Math.floor(value / divisor));
  }),
  define('ABS', 1, 1, (args) => Math.abs(args.number(0))),
  define('SIGN', 1, 1, (args) => Math.sign(args.number(0))),
  define('SQRT', 1, 1, (args) => {
    const value = args.number(0);
    if (value < 0) return error(ErrorCode.num);
    return numeric(Math.sqrt(value));
  }),
  define('SQRTPI', 1, 1, (args) => {
    const value = args.number(0);
    if (value < 0) return error(ErrorCode.num);
    return numeric(Math.sqrt(value * PI));
  }),
  define('POWER', 2, 2, (args) => {
    const result = excelPower(args.number(0), args.number(1));
    return isError(result) ? result : numeric(result);
  }),
  define('EXP', 1, 1, (args) => numeric(Math.exp(args.number(0)))),
  define('LN', 1, 1, (args) => {
    const value = args.number(0);
    if (value <= 0) return error(ErrorCode.num);
    return numeric(Math.log(value));
  }),
  define('LOG', 1, 2, (args) => {
    const value = args.number(0);
    const base = args.isMissing(1) ? 10 : args.number(1);
    if (value <= 0 || base <= 0) return error(ErrorCode.num);
    if (base === 1) return error(ErrorCode.div0);
    return numeric(Math.log(value) / Math.log(base));
  }),
  define('LOG10', 1, 1, (args) => {
    const value = args.number(0);
    if (value <= 0) return error(ErrorCode.num);
    return numeric(Math.log10(value));
  }),
  define('PI', 0, 0, () => PI),
  define('SIN', 1, 1, (args) => numeric(Math.sin(args.number(0)))),
  define('COS', 1, 1, (args) => numeric(Math.cos(args.number(0)))),
  define('TAN', 1, 1, (args) => numeric(Math.tan(args.number(0)))),
  define('ASIN', 1, 1, (args) => {
    const value = args.number(0);
    if (value < -1 || value > 1) return error(ErrorCode.num);
    return numeric(Math.asin(value));
  }),
  define('ACOS', 1, 1, (args) => {
    const value = args.number(0);
    if (value < -1 || value > 1) return error(ErrorCode.num);
    return numeric(Math.acos(value));
  }),
  define('ATAN', 1, 1, (args) => numeric(Math.atan(args.number(0)))),
  define('ATAN2', 2, 2, (args) => {
    const x = args.number(0);
    const y = args.number(1);
    if (x === 0 && y === 0) return error(ErrorCode.div0);
    return numeric(Math.atan2(y, x));
  }),
  define('SINH', 1, 1, (args) => numeric(Math.sinh(args.number(0)))),
  define('COSH', 1, 1, (args) => numeric(Math.cosh(args.number(0)))),
  define('TANH', 1, 1, (args) => numeric(Math.tanh(args.number(0)))),
  define('ASINH', 1, 1, (args) => numeric(Math.asinh(args.number(0)))),
  define('ACOSH', 1, 1, (args) => {
    const value = args.number(0);
    if (value < 1) return error(ErrorCode.num);
    return numeric(Math.acosh(value));
  }),
  define('ATANH', 1, 1, (args) => {
    const value = args.number(0);
    if (value <= -1 || value >= 1) return error(ErrorCode.num);
    return numeric(Math.atanh(value));
  }),
  define('COT', 1, 1, (args) => {
    const value = args.number(0);
    if (value === 0) return error(ErrorCode.div0);
    return numeric(1 / Math.tan(value));
  }),
  define('COTH', 1, 1, (args) => {
    const value = args.number(0);
    if (value === 0) return error(ErrorCode.div0);
    return numeric(1 / Math.tanh(value));
  }),
  define('SEC', 1, 1, (args) => numeric(1 / Math.cos(args.number(0)))),
  define('SECH', 1, 1, (args) => numeric(1 / Math.cosh(args.number(0)))),
  define('CSC', 1, 1, (args) => {
    const value = args.number(0);
    if (value === 0) return error(ErrorCode.div0);
    return numeric(1 / Math.sin(value));
  }),
  define('CSCH', 1, 1, (args) => {
    const value = args.number(0);
    if (value === 0) return error(ErrorCode.div0);
    return numeric(1 / Math.sinh(value));
  }),
  define('DEGREES', 1, 1, (args) => numeric((args.number(0) * 180) / PI)),
  define('RADIANS', 1, 1, (args) => numeric((args.number(0) * PI) / 180)),
  define('FACT', 1, 1, (args) => factorial(args.number(0))),
  define('FACTDOUBLE', 1, 1, (args) => {
    let value = Math.trunc(args.number(0));
    if (value < -1) return error(ErrorCode.num);
    let result = 1;
    for (; value > 1; value -= 2) result *= value;
    return numeric(result);
  }),
  define('COMBIN', 2, 2, (args) => {
    const n = Math.trunc(args.number(0));
    const k = Math.trunc(args.number(1));
    if (n < 0 || k < 0 || k > n) return error(ErrorCode.num);
    return numeric(combinations(n, k));
  }),
  define('COMBINA', 2, 2, (args) => {
    const n = Math.trunc(args.number(0));
    const k = Math.trunc(args.number(1));
    if (n < 0 || k < 0) return error(ErrorCode.num);
    if (n === 0 && k === 0) return 1;
    return numeric(combinations(n + k - 1, k));
  }),
  define('PERMUT', 2, 2, (args) => {
    const n = Math.trunc(args.number(0));
    const k = Math.trunc(args.number(1));
    if (n < 0 || k < 0 || k > n) return error(ErrorCode.num);
    let result = 1;
    for (let index = 0; index < k; index++) result *= n - index;
    return numeric(result);
  }),
  define('PERMUTATIONA', 2, 2, (args) => {
    const n = Math.trunc(args.number(0));
    const k = Math.trunc(args.number(1));
    if (n < 0 || k < 0) return error(ErrorCode.num);
    return numeric(Math.pow(n, k));
  }),
  define('GCD', 1, 255, (args, ctx) => {
    const values = numbers(args, ctx, { refText: 'coerce', refBool: 'ignore', directText: 'coerce', directBool: 'ignore' });
    if (values.some((value) => value < 0)) return error(ErrorCode.num);
    let result = 0;
    for (const value of values) result = gcd(result, Math.trunc(value));
    return result;
  }),
  define('LCM', 1, 255, (args, ctx) => {
    const values = numbers(args, ctx, { refText: 'coerce', refBool: 'ignore', directText: 'coerce', directBool: 'ignore' });
    if (values.some((value) => value < 0)) return error(ErrorCode.num);
    let result = 1;
    for (const value of values) {
      const next = Math.trunc(value);
      if (!next) return 0;
      result = Math.abs((result * next) / gcd(result, next));
    }
    return numeric(result);
  }),
  define('QUOTIENT', 2, 2, (args) => Math.trunc(args.number(0) / args.number(1))),
  define('EVEN', 1, 1, (args) => roundParity(args.number(0), true)),
  define('ODD', 1, 1, (args) => roundParity(args.number(0), false)),
  define('ROMAN', 1, 2, (args) => {
    const value = Math.trunc(args.number(0));
    if (value < 0 || value > 3999) return error(ErrorCode.value);
    void args;
    return toRoman(value);
  }),
  define('ARABIC', 1, 1, (args) => {
    const text = args.text(0).trim();
    if (!text) return 0;
    return fromRoman(text);
  }),
  define('BASE', 2, 3, (args) => {
    const value = Math.trunc(args.number(0));
    const radix = Math.trunc(args.number(1));
    const minLength = args.isMissing(2) ? 0 : Math.trunc(args.number(2));
    if (value < 0 || radix < 2 || radix > 36) return error(ErrorCode.num);
    if (minLength < 0 || minLength > 255) return error(ErrorCode.num);
    let text = value.toString(radix);
    while (text.length < minLength) text = '0' + text;
    return text;
  }),
  define('DECIMAL', 2, 2, (args) => {
    const text = args.text(0).trim();
    const radix = Math.trunc(args.number(1));
    if (radix < 2 || radix > 36 || !text) return error(ErrorCode.num);
    if (!/^[0-9a-zA-Z]+$/.test(text)) return error(ErrorCode.num);
    const value = parseInt(text, radix);
    if (Number.isNaN(value)) return error(ErrorCode.num);
    return value;
  }),
  define('MDETERM', 1, 1, (args, ctx) => {
    const matrix = toNumberMatrix(args, ctx, 0);
    if (!matrix.length || matrix.length !== matrix[0]?.length) return error(ErrorCode.value);
    return numeric(determinant(matrix));
  }),
  define('MINVERSE', 1, 1, (args, ctx) => {
    const matrix = toNumberMatrix(args, ctx, 0);
    if (!matrix.length || matrix.length !== matrix[0]?.length) return error(ErrorCode.value);
    const inverse = invert(matrix);
    return inverse ? new CalcArray(inverse) : error(ErrorCode.num);
  }),
  define('MMULT', 2, 2, (args, ctx) => {
    const a = toNumberMatrix(args, ctx, 0);
    const b = toNumberMatrix(args, ctx, 1);
    if (!a.length || !b.length || a[0]?.length !== b.length) return error(ErrorCode.value);
    return new CalcArray(matMul(a, b));
  }),
  define('MUNIT', 1, 1, (args) => {
    const size = Math.trunc(args.number(0));
    if (size < 1) return error(ErrorCode.value);
    return new CalcArray(Array.from({ length: size }, (_, row) => Array.from({ length: size }, (_, col) => (row === col ? 1 : 0))));
  }),
  define('SERIESSUM', 4, 4, (args, _ctx) => {
    const x = args.number(0);
    const n = args.number(1);
    const m = args.number(2);
    const coefficients = args.array(3).array.flat().map((value) => {
      if (isError(value)) raiseError(value);
      if (value === null) return 0;
      if (typeof value === 'number') return value;
      if (typeof value === 'boolean') return value ? 1 : 0;
      const parsed = typeof value === 'string' ? parseNumberText(value) : undefined;
      if (parsed === undefined) raise(ErrorCode.value);
      return parsed;
    });
    let sum = 0;
    for (let index = 0; index < coefficients.length; index++)
      sum += coefficients[index]! * Math.pow(x, n + index * m);
    return numeric(sum);
  }),
  define('MULTINOMIAL', 1, 255, (args, ctx) => {
    const values = numbers(args, ctx, NUMBER_MODES.sumsq);
    if (values.some((value) => value < 0)) return error(ErrorCode.num);
    const total = values.reduce((sum, value) => sum + Math.trunc(value), 0);
    let denominator = 1;
    for (const value of values) denominator *= forMath(factorial(Math.trunc(value)));
    return numeric(forMath(factorial(total)) / denominator);
  }),
  define('RAND', 0, 0, () => Math.random(), { volatile: true }),
  define('RANDBETWEEN', 2, 2, (args) => {
    const low = Math.ceil(args.number(0));
    const high = Math.floor(args.number(1));
    if (low > high) return error(ErrorCode.num);
    return Math.floor(Math.random() * (high - low + 1)) + low;
  }, { volatile: true }),
  define('RANDARRAY', 0, 5, (args) => {
    const rows = args.isMissing(0) ? 1 : Math.trunc(args.number(0));
    const cols = args.isMissing(1) ? 1 : Math.trunc(args.number(1));
    const min = args.isMissing(2) ? 0 : args.number(2);
    const max = args.isMissing(3) ? 1 : args.number(3);
    const whole = args.isMissing(4) ? false : args.boolean(4);
    if (rows < 1 || cols < 1) return error(ErrorCode.value);
    if (min > max) return error(ErrorCode.value);
    const matrix: ScalarValue[][] = [];
    for (let r = 0; r < rows; r++) {
      const row: ScalarValue[] = [];
      for (let c = 0; c < cols; c++) {
        const value = min + Math.random() * (max - min);
        row.push(whole ? Math.floor(value) : value);
      }
      matrix.push(row);
    }
    return new CalcArray(matrix);
  }, { volatile: true }),
];

function applyProduct(a: ScalarValue, b: ScalarValue): ScalarValue {
  if (isError(a)) return a;
  if (isError(b)) return b;
  const toNumberValue = (value: ScalarValue): number | CalcError => {
    if (value === null) return 0;
    if (typeof value === 'number') return value;
    if (typeof value === 'boolean') return value ? 1 : 0;
    if (typeof value === 'string') {
      const parsed = parseNumberText(value);
      return parsed === undefined ? error(ErrorCode.value) : parsed;
    }
    if (value instanceof Date) return dateToSerial(value);
    return error(ErrorCode.value);
  };
  const left = toNumberValue(a);
  const right = toNumberValue(b);
  if (isError(left)) return left;
  if (isError(right)) return right;
  return normalizeNumber(left * right);
}

function pairAggregate(args: Args, ctx: EvalContext, combine: (a: number, b: number) => number): Value {
  const left = args.array(0);
  const right = args.array(1);
  if (left.rowCount !== right.rowCount || left.colCount !== right.colCount) return error(ErrorCode.na);
  let sum = 0;
  for (let r = 0; r < left.rowCount; r++)
    for (let c = 0; c < left.colCount; c++) {
      const a = sumValue(left.at(r, c));
      const b = sumValue(right.at(r, c));
      if (a !== undefined && b !== undefined) sum += combine(a, b);
    }
  void ctx;
  return numeric(sum);
}

/**
 * Cells SUBTOTAL leaves out: every referenced cell whose own formula calls
 * SUBTOTAL or AGGREGATE. Like the trial, a nested subtotal is never counted
 * twice by the summary above it (hidden rows, in contrast, are still counted).
 */
function nestedSubtotalCell(ctx: EvalContext): OmitCell {
  return (sheet, row, col) => {
    const text = ctx.host.getFormulaText(sheet, row, col);
    return !!text && /(?:^|[^A-Za-z0-9_.])@?(?:SUBTOTAL|AGGREGATE)\s*\(/i.test(text);
  };
}

function subtotal(args: Args, ctx: EvalContext): Value {
  const code = Math.trunc(args.number(0));
  const mode = code >= 100 ? code - 100 : code;
  const valuesArgs = new Array(args.count - 1);
  for (let index = 1; index < args.count; index++) valuesArgs[index - 1] = args.value(index);
  const nested = new NestedArgs(valuesArgs, nestedSubtotalCell(ctx));
  switch (mode) {
    case 1:
      return averageValues(nested, ctx);
    case 2:
      return countValues(nested, ctx, false);
    case 3:
      return countValues(nested, ctx, true);
    case 4:
      return aggregateValues(nested, ctx, 'max');
    case 5:
      return aggregateValues(nested, ctx, 'min');
    case 6:
      return aggregateValues(nested, ctx, 'product');
    case 7:
      return varianceValues(nested, ctx, true, true);
    case 8:
      return varianceValues(nested, ctx, true, false);
    case 9:
      return aggregateValues(nested, ctx, 'sum');
    case 10:
      return varianceValues(nested, ctx, false, true);
    case 11:
      return varianceValues(nested, ctx, false, false);
    default:
      return error(ErrorCode.value);
  }
}

function aggregate(args: Args, ctx: EvalContext): Value {
  const code = Math.trunc(args.number(0));
  const options = Math.trunc(args.number(1));
  const values: Value[] = [];
  for (let index = 2; index < args.count; index++) values.push(args.value(index));
  const nested = new NestedArgs(values);
  const ignoreErrors = Boolean(options & 2);
  const aggregateArg = new IgnoreErrorArgs(values, ignoreErrors);
  void nested;
  switch (code) {
    case 1:
      return averageValues(aggregateArg, ctx);
    case 2:
      return countValues(aggregateArg, ctx, false);
    case 3:
      return countValues(aggregateArg, ctx, true);
    case 4:
      return aggregateValues(aggregateArg, ctx, 'max');
    case 5:
      return aggregateValues(aggregateArg, ctx, 'min');
    case 6:
      return aggregateValues(aggregateArg, ctx, 'product');
    case 7:
      return varianceValues(aggregateArg, ctx, true, true);
    case 8:
      return varianceValues(aggregateArg, ctx, true, false);
    case 9:
      return aggregateValues(aggregateArg, ctx, 'sum');
    case 10:
      return varianceValues(aggregateArg, ctx, false, true);
    case 11:
      return varianceValues(aggregateArg, ctx, false, false);
    case 12:
      return medianValues(aggregateArg, ctx);
    case 13:
      return aggregateValues(aggregateArg, ctx, 'mode');
    case 14:
      return aggregateValues(aggregateArg, ctx, 'large', integer(args.number(3)));
    case 15:
      return aggregateValues(aggregateArg, ctx, 'small', integer(args.number(3)));
    case 16:
      return percentileValues(aggregateArg, ctx, args.number(3));
    case 17:
      return percentileValues(aggregateArg, ctx, args.number(3), true);
    case 18:
      return percentileValues(aggregateArg, ctx, args.number(3));
    case 19:
      return percentileValues(aggregateArg, ctx, args.number(3), true);
    default:
      return error(ErrorCode.value);
  }
}

/**
 * Cells an aggregate must leave out, asked per referenced cell.
 * Used by SUBTOTAL to skip nested subtotals, like the trial does.
 */
type OmitCell = (sheet: Parameters<EvalContext['host']['getFormulaText']>[0], row: number, col: number) => boolean;

/** Minimal Args-compatible wrapper used by SUBTOTAL/AGGREGATE. */
class NestedArgs {
  constructor(
    readonly values: Value[],
    readonly omit?: OmitCell,
  ) {}
  get count(): number {
    return this.values.length;
  }
  isMissing(index: number): boolean {
    return this.values[index] === undefined || this.values[index] === MISSING;
  }
  value(index: number): Value {
    return this.values[index] ?? MISSING;
  }
  scalar(index: number): ScalarValue {
    const value = this.values[index];
    if (value === undefined || value === MISSING) return null;
    if (value instanceof ReferenceValue) return value.areas[0] ? null : null;
    if (value instanceof CalcArray) return value.at(0, 0);
    return value as ScalarValue;
  }
  number(index: number): number {
    const value = this.scalar(index);
    if (typeof value === 'number') return value;
    if (typeof value === 'boolean') return value ? 1 : 0;
    if (value === null) return 0;
    if (typeof value === 'string') {
      const parsed = parseNumberText(value);
      if (parsed !== undefined) return parsed;
    }
    raise(ErrorCode.value);
  }
}

class IgnoreErrorArgs extends NestedArgs {
  constructor(values: Value[], private readonly ignoreErrors: boolean) {
    super(values);
  }
  override value(index: number): Value {
    return super.value(index);
  }
}

function iterateWrapped(args: NestedArgs, ctx: EvalContext): Iterable<ScalarValue> {
  function* iterate(values: Value[]): Iterable<ScalarValue> {
    for (const value of values) {
      if (value instanceof ReferenceValue) {
        for (const area of value.areas)
          for (let row = area.r1; row <= area.r2; row++)
            for (let col = area.c1; col <= area.c2; col++) {
              // SUBTOTAL/AGGREGATE never count a nested subtotal cell.
              if (args.omit && args.omit(area.sheet, row, col)) continue;
              yield ctx.host.getCellValue(area.sheet, row, col);
            }
      } else if (value instanceof CalcArray) {
        for (const row of value.array) for (const item of row) yield item as ScalarValue;
      } else if (value !== MISSING) yield value as ScalarValue;
    }
  }
  return iterate(args.values);
}

function numericList(args: NestedArgs, ctx: EvalContext, ignoreErrors = false): number[] {
  const values: number[] = [];
  for (const value of iterateWrapped(args, ctx)) {
    if (isError(value)) {
      if (ignoreErrors) continue;
      raiseError(value);
    }
    if (value === null) continue;
    if (typeof value === 'number') values.push(value);
    else if (value instanceof Date) values.push(dateToSerial(value));
  }
  return values;
}

function averageValues(args: NestedArgs, ctx: EvalContext): Value {
  const values = numericList(args, ctx, args instanceof IgnoreErrorArgs);
  if (!values.length) return error(ErrorCode.div0);
  return normalizeNumber(values.reduce((sum, value) => sum + value, 0) / values.length);
}
function countValues(args: NestedArgs, ctx: EvalContext, countAll: boolean): Value {
  let count = 0;
  for (const value of iterateWrapped(args, ctx)) {
    if (countAll) {
      if (value !== null) count++;
    } else if (typeof value === 'number' || value instanceof Date) count++;
  }
  return count;
}
function aggregateValues(
  args: NestedArgs,
  ctx: EvalContext,
  mode: 'sum' | 'max' | 'min' | 'product' | 'mode' | 'large' | 'small',
  parameter = 0,
): Value {
  const values = numericList(args, ctx, args instanceof IgnoreErrorArgs);
  if (mode === 'sum') return normalizeNumber(values.reduce((sum, value) => sum + value, 0));
  if (mode === 'product') return values.length ? numeric(values.reduce((product, value) => product * value, 1)) : 0;
  if (mode === 'max') return values.length ? Math.max(...values) : 0;
  if (mode === 'min') return values.length ? Math.min(...values) : 0;
  if (mode === 'mode') return modeValue(values);
  const sorted = [...values].sort((a, b) => b - a);
  if (mode === 'large') return sorted[parameter - 1] ?? error(ErrorCode.num);
  return sorted[sorted.length - parameter] ?? error(ErrorCode.num);
}
function varianceValues(args: NestedArgs, ctx: EvalContext, sample: boolean, squareRoot: boolean): Value {
  const values = numericList(args, ctx, args instanceof IgnoreErrorArgs);
  if (sample && values.length < 2) return error(ErrorCode.div0);
  if (squareRoot && values.length < 1) return error(ErrorCode.div0);
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  let sum = 0;
  for (const value of values) sum += (value - mean) ** 2;
  const variance = sample ? sum / (values.length - 1) : sum / values.length;
  return numeric(squareRoot ? Math.sqrt(variance) : variance);
}
function medianValues(args: NestedArgs, ctx: EvalContext): Value {
  const values = numericList(args, ctx, args instanceof IgnoreErrorArgs).sort((a, b) => a - b);
  if (!values.length) return error(ErrorCode.num);
  const middle = Math.floor(values.length / 2);
  return values.length % 2 ? values[middle]! : normalizeNumber((values[middle - 1]! + values[middle]!) / 2);
}
function percentileValues(
  args: NestedArgs,
  ctx: EvalContext,
  p: number,
  exclude = false,
): Value {
  const values = numericList(args, ctx, args instanceof IgnoreErrorArgs).sort((a, b) => a - b);
  if (!values.length) return error(ErrorCode.num);
  if (p < 0 || p > 1) return error(ErrorCode.num);
  if (exclude) {
    const rank = p * (values.length + 1);
    if (rank < 1 || rank > values.length) return error(ErrorCode.num);
    const lower = Math.floor(rank);
    const upper = Math.ceil(rank);
    if (lower === upper) return values[lower - 1]!;
    return normalizeNumber(values[lower - 1]! + (rank - lower) * (values[upper - 1]! - values[lower - 1]!));
  }
  const rank = p * (values.length - 1);
  const lower = Math.floor(rank);
  const upper = Math.ceil(rank);
  if (lower === upper) return values[lower]!;
  return normalizeNumber(values[lower]! + (rank - lower) * (values[upper]! - values[lower]!));
}
function modeValue(values: number[]): Value {
  const counts = new Map<number, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  let best: number | undefined;
  let bestCount = 1;
  for (const value of values) {
    const count = counts.get(value)!;
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  }
  return best === undefined ? error(ErrorCode.na) : best;
}

function factorial(value: number): number | CalcError {
  let result = Math.trunc(value);
  if (result < 0) return error(ErrorCode.num);
  let product = 1;
  for (let index = 2; index <= result; index++) product *= index;
  if (!Number.isFinite(product)) return error(ErrorCode.num);
  result = product;
  return result;
}

function combinations(n: number, k: number): number {
  const count = Math.min(k, n - k);
  let result = 1;
  for (let index = 1; index <= count; index++) result = (result * (n - count + index)) / index;
  return Math.round(result);
}

function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y) [x, y] = [y, x % y];
  return x;
}

function roundParity(value: number, even: boolean): number {
  const sign = value < 0 ? -1 : 1;
  const absolute = Math.abs(value);
  let result = Math.ceil(absolute);
  if (even) {
    if (result % 2 !== 0) result += 1;
  } else if (result % 2 === 0) result += 1;
  return sign * result;
}

export { roundValue, toRoman, fromRoman, sumValue, multiCriteria, criteriaSum };
export { numberToText };
