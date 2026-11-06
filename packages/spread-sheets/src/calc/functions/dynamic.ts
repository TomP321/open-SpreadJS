/** Dynamic array functions (available only when allowDynamicArray is enabled). */
import { Args, EvalContext, raise, raiseError} from '../evaluate.js';
import {
  CalcArray,
  CalcError,
  ErrorCode,
  LambdaValue,
  ReferenceValue,
  ScalarValue,
  Value,
  error,
  isArray,
  isError,
  isLambda,
  normalizeNumber,
  parseNumberText,
} from '../values.js';
import { type DefinedFunction, define } from './common.js';
import { lookupCompare } from './lookup.js';

function gate(ctx: EvalContext): Value | undefined {
  return ctx.host.allowDynamicArray() ? undefined : error(ErrorCode.name);
}

function arrayOf(args: Args, ctx: EvalContext, index: number): CalcArray {
  return args.array(index);
}

function toNumbers(array: CalcArray): number[][] {
  const result: number[][] = [];
  for (let row = 0; row < array.rowCount; row++) {
    const line: number[] = [];
    for (let col = 0; col < array.colCount; col++) {
      const value = array.at(row, col);
      if (isError(value)) raiseError(value);
      if (value === null) line.push(0);
      else if (typeof value === 'number') line.push(value);
      else if (typeof value === 'boolean') line.push(value ? 1 : 0);
      else if (typeof value === 'string') {
        const parsed = parseNumberText(value);
        if (parsed === undefined) raise(ErrorCode.value);
        line.push(parsed);
      } else line.push(0);
    }
    result.push(line);
  }
  return result;
}

function sortArray(array: CalcArray, index: number, order: number, byColumn: boolean): CalcArray {
  const rows = array.rowCount;
  const cols = array.colCount;
  if (byColumn) {
    const columns = Array.from({ length: cols }, (_, col) => Array.from({ length: rows }, (_, row) => array.at(row, col)));
    columns.sort((a, b) => {
      const left = a[Math.min(index, rows) - 1] ?? null;
      const right = b[Math.min(index, rows) - 1] ?? null;
      return lookupCompare(left, right) * (order < 0 ? -1 : 1);
    });
    const result: ScalarValue[][] = Array.from({ length: rows }, () => []);
    for (let col = 0; col < cols; col++) for (let row = 0; row < rows; row++) result[row]!.push(columns[col]![row]!);
    return new CalcArray(result);
  }
  const lines: ScalarValue[][] = [];
  for (let row = 0; row < rows; row++) {
    const line: ScalarValue[] = [];
    for (let col = 0; col < cols; col++) line.push(array.at(row, col));
    lines.push(line);
  }
  lines.sort((a, b) => {
    const left = a[Math.min(index, cols) - 1] ?? null;
    const right = b[Math.min(index, cols) - 1] ?? null;
    return lookupCompare(left, right) * (order < 0 ? -1 : 1);
  });
  return new CalcArray(lines);
}

function mapLambda(
  args: Args,
  ctx: EvalContext,
  lambda: LambdaValue,
  values: Value[],
): Value {
  try {
    return args.evaluatorRef().invokeLambdaValues(lambda, values, ctx);
  } catch (thrown) {
    if (thrown instanceof Error) {
      const value = (thrown as { value?: Value }).value;
      if (value !== undefined) return value;
    }
    throw thrown;
  }
}

export const DYNAMIC_FUNCTIONS: DefinedFunction[] = [
  define('SEQUENCE', 1, 4, (args, ctx) => {
    const blocked = gate(ctx);
    if (blocked) return blocked;
    const rows = Math.trunc(args.number(0));
    const cols = args.isMissing(1) ? 1 : Math.trunc(args.number(1));
    const start = args.isMissing(2) ? 1 : args.number(2);
    const step = args.isMissing(3) ? 1 : args.number(3);
    if (rows < 1 || cols < 1) return error(ErrorCode.value);
    if (rows * cols > 1_048_576) return error(ErrorCode.num);
    const result: ScalarValue[][] = [];
    let value = start;
    for (let row = 0; row < rows; row++) {
      const line: ScalarValue[] = [];
      for (let col = 0; col < cols; col++) {
        line.push(normalizeNumber(value));
        value += step;
      }
      result.push(line);
    }
    return new CalcArray(result);
  }),
  define('SORT', 1, 4, (args, ctx) => {
    const blocked = gate(ctx);
    if (blocked) return blocked;
    const array = arrayOf(args, ctx, 0);
    const index = args.isMissing(1) ? 1 : Math.trunc(args.number(1));
    const order = args.isMissing(2) ? 1 : Math.trunc(args.number(2));
    const byColumn = args.isMissing(3) ? false : args.boolean(3);
    return sortArray(array, index, order, byColumn);
  }),
  define('SORTBY', 2, 255, (args, ctx) => {
    const blocked = gate(ctx);
    if (blocked) return blocked;
    const array = arrayOf(args, ctx, 0);
    const lines: ScalarValue[][] = [];
    for (let row = 0; row < array.rowCount; row++) {
      const line: ScalarValue[] = [];
      for (let col = 0; col < array.colCount; col++) line.push(array.at(row, col));
      lines.push(line);
    }
    const keys: { values: ScalarValue[]; order: number }[] = [];
    for (let index = 1; index < args.count; index += 2) {
      const by = arrayOf(args, ctx, index);
      const values: ScalarValue[] = [];
      for (let row = 0; row < by.rowCount; row++) values.push(by.at(row, 0));
      keys.push({ values, order: args.isMissing(index + 1) ? 1 : Math.trunc(args.number(index + 1)) });
    }
    lines.sort((a, b) => {
      const rowA = lines.indexOf(a);
      const rowB = lines.indexOf(b);
      for (const key of keys) {
        const comparison = lookupCompare(key.values[rowA] ?? null, key.values[rowB] ?? null);
        if (comparison) return comparison * (key.order < 0 ? -1 : 1);
      }
      return 0;
    });
    return new CalcArray(lines);
  }),
  define('UNIQUE', 1, 3, (args, ctx) => {
    const blocked = gate(ctx);
    if (blocked) return blocked;
    const array = arrayOf(args, ctx, 0);
    const byColumn = args.isMissing(1) ? false : args.boolean(1);
    const exactlyOnce = args.isMissing(2) ? false : args.boolean(2);
    if (byColumn) {
      const columns: ScalarValue[][] = [];
      for (let col = 0; col < array.colCount; col++)
        columns.push(Array.from({ length: array.rowCount }, (_, row) => array.at(row, col)));
      const counts = new Map<string, number>();
      for (const column of columns) {
        const key = JSON.stringify(column);
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      const selected = columns.filter((column) => {
        const count = counts.get(JSON.stringify(column))!;
        return exactlyOnce ? count === 1 : true;
      });
      const unique: ScalarValue[][] = selected;
      const seen = new Set<string>();
      const result: ScalarValue[][] = [];
      for (const column of unique) {
        const key = JSON.stringify(column);
        if (seen.has(key)) continue;
        seen.add(key);
        result.push(column);
      }
      const rows: ScalarValue[][] = Array.from({ length: array.rowCount }, () => []);
      for (const column of result)
        for (let row = 0; row < array.rowCount; row++) rows[row]!.push(column[row]!);
      return new CalcArray(rows);
    }
    const rows: ScalarValue[][] = [];
    for (let row = 0; row < array.rowCount; row++) {
      const line: ScalarValue[] = [];
      for (let col = 0; col < array.colCount; col++) line.push(array.at(row, col));
      rows.push(line);
    }
    const counts = new Map<string, number>();
    for (const line of rows) {
      const key = JSON.stringify(line);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const seen = new Set<string>();
    const result: ScalarValue[][] = [];
    for (const line of rows) {
      const key = JSON.stringify(line);
      if (seen.has(key)) continue;
      seen.add(key);
      if (exactlyOnce && counts.get(key) !== 1) continue;
      result.push(line);
    }
    return new CalcArray(result);
  }),
  define('FILTER', 2, 3, (args, ctx) => {
    const blocked = gate(ctx);
    if (blocked) return blocked;
    const array = arrayOf(args, ctx, 0);
    const include = arrayOf(args, ctx, 1);
    const empty = () => (args.isMissing(2) ? error(ErrorCode.calc) : args.value(2));
    const rows: ScalarValue[][] = [];
    if (include.colCount === 1) {
      for (let row = 0; row < array.rowCount; row++) {
        const flag = include.at(row, 0);
        if (isError(flag)) return flag;
        if (truthy(flag)) {
          const line: ScalarValue[] = [];
          for (let col = 0; col < array.colCount; col++) line.push(array.at(row, col));
          rows.push(line);
        }
      }
    } else {
      for (let col = 0; col < array.colCount; col++) {
        const flag = include.at(0, col);
        if (isError(flag)) return flag;
        if (!truthy(flag)) continue;
      }
      const selectedColumns: number[] = [];
      for (let col = 0; col < array.colCount; col++) {
        const flag = include.at(0, col);
        if (isError(flag)) return flag;
        if (truthy(flag)) selectedColumns.push(col);
      }
      for (let row = 0; row < array.rowCount; row++) {
        const line: ScalarValue[] = [];
        for (const col of selectedColumns) line.push(array.at(row, col));
        rows.push(line);
      }
    }
    if (!rows.length) return empty();
    return new CalcArray(rows);
  }),
  define('TAKE', 2, 3, (args, ctx) => {
    const blocked = gate(ctx);
    if (blocked) return blocked;
    const array = arrayOf(args, ctx, 0);
    const rows = Math.trunc(args.number(1));
    const cols = args.isMissing(2) ? array.colCount : Math.trunc(args.number(2));
    const takeRows = rows >= 0 ? Math.min(rows, array.rowCount) : Math.min(-rows, array.rowCount);
    const takeCols = cols >= 0 ? Math.min(cols, array.colCount) : Math.min(-cols, array.colCount);
    if (!takeRows || !takeCols) return error(ErrorCode.calc);
    const rowStart = rows >= 0 ? 0 : array.rowCount - takeRows;
    const colStart = cols >= 0 ? 0 : array.colCount - takeCols;
    const result: ScalarValue[][] = [];
    for (let row = 0; row < takeRows; row++) {
      const line: ScalarValue[] = [];
      for (let col = 0; col < takeCols; col++) line.push(array.at(rowStart + row, colStart + col));
      result.push(line);
    }
    void cols;
    return new CalcArray(result);
  }),
  define('DROP', 2, 3, (args, ctx) => {
    const blocked = gate(ctx);
    if (blocked) return blocked;
    const array = arrayOf(args, ctx, 0);
    const rows = Math.trunc(args.number(1));
    const cols = args.isMissing(2) ? 0 : Math.trunc(args.number(2));
    const dropRows = Math.min(Math.abs(rows), array.rowCount);
    const dropCols = Math.min(Math.abs(cols), array.colCount);
    const rowStart = rows >= 0 ? dropRows : 0;
    const rowEnd = rows >= 0 ? array.rowCount : array.rowCount - dropRows;
    const colStart = cols >= 0 ? dropCols : 0;
    const colEnd = cols >= 0 ? array.colCount : array.colCount - dropCols;
    if (rowStart >= rowEnd || colStart >= colEnd) return error(ErrorCode.calc);
    const result: ScalarValue[][] = [];
    for (let row = rowStart; row < rowEnd; row++) {
      const line: ScalarValue[] = [];
      for (let col = colStart; col < colEnd; col++) line.push(array.at(row, col));
      result.push(line);
    }
    return new CalcArray(result);
  }),
  define('VSTACK', 1, 255, (args, ctx) => {
    const blocked = gate(ctx);
    if (blocked) return blocked;
    const rows: ScalarValue[][] = [];
    let width = 0;
    const arrays: CalcArray[] = [];
    for (let index = 0; index < args.count; index++) {
      const array = arrayOf(args, ctx, index);
      arrays.push(array);
      width = Math.max(width, array.colCount);
    }
    for (const array of arrays)
      for (let row = 0; row < array.rowCount; row++) {
        const line: ScalarValue[] = [];
        for (let col = 0; col < width; col++) line.push(col < array.colCount ? array.at(row, col) : error(ErrorCode.na));
        rows.push(line);
      }
    return new CalcArray(rows);
  }),
  define('HSTACK', 1, 255, (args, ctx) => {
    const blocked = gate(ctx);
    if (blocked) return blocked;
    const arrays: CalcArray[] = [];
    let height = 0;
    for (let index = 0; index < args.count; index++) {
      const array = arrayOf(args, ctx, index);
      arrays.push(array);
      height = Math.max(height, array.rowCount);
    }
    const rows: ScalarValue[][] = Array.from({ length: height }, () => []);
    for (const array of arrays)
      for (let row = 0; row < height; row++)
        for (let col = 0; col < array.colCount; col++)
          rows[row]!.push(row < array.rowCount ? array.at(row, col) : error(ErrorCode.na));
    return new CalcArray(rows);
  }),
  define('TOCOL', 1, 3, (args, ctx) => {
    const blocked = gate(ctx);
    if (blocked) return blocked;
    const array = arrayOf(args, ctx, 0);
    const ignore = args.isMissing(1) ? 0 : Math.trunc(args.number(1));
    const byColumn = args.isMissing(2) ? false : args.boolean(2);
    const values: ScalarValue[] = [];
    const push = (value: ScalarValue) => {
      if (ignore === 1 && value === null) return;
      if (ignore === 2 && isError(value)) return;
      if (ignore === 3 && (value === null || isError(value))) return;
      values.push(value);
    };
    if (byColumn) {
      for (let col = 0; col < array.colCount; col++)
        for (let row = 0; row < array.rowCount; row++) push(array.at(row, col));
    } else {
      for (let row = 0; row < array.rowCount; row++)
        for (let col = 0; col < array.colCount; col++) push(array.at(row, col));
    }
    return new CalcArray(values.map((value) => [value]));
  }),
  define('TOROW', 1, 3, (args, ctx) => {
    const blocked = gate(ctx);
    if (blocked) return blocked;
    const array = arrayOf(args, ctx, 0);
    const ignore = args.isMissing(1) ? 0 : Math.trunc(args.number(1));
    const byColumn = args.isMissing(2) ? false : args.boolean(2);
    const values: ScalarValue[] = [];
    const push = (value: ScalarValue) => {
      if (ignore === 1 && value === null) return;
      if (ignore === 2 && isError(value)) return;
      if (ignore === 3 && (value === null || isError(value))) return;
      values.push(value);
    };
    if (byColumn) {
      for (let col = 0; col < array.colCount; col++)
        for (let row = 0; row < array.rowCount; row++) push(array.at(row, col));
    } else {
      for (let row = 0; row < array.rowCount; row++)
        for (let col = 0; col < array.colCount; col++) push(array.at(row, col));
    }
    return new CalcArray([values]);
  }),
  define('WRAPROWS', 2, 3, (args, ctx) => {
    const blocked = gate(ctx);
    if (blocked) return blocked;
    const array = arrayOf(args, ctx, 0);
    const count = Math.trunc(args.number(1));
    if (count < 1) return error(ErrorCode.num);
    const values: ScalarValue[] = [];
    for (let row = 0; row < array.rowCount; row++)
      for (let col = 0; col < array.colCount; col++) values.push(array.at(row, col));
    const pad = args.isMissing(2) ? error(ErrorCode.na) : args.scalar(2);
    const rows: ScalarValue[][] = [];
    for (let index = 0; index < values.length; index += count) {
      const line: ScalarValue[] = [];
      for (let offset = 0; offset < count; offset++) line.push(values[index + offset] ?? pad);
      rows.push(line);
    }
    return new CalcArray(rows);
  }),
  define('WRAPCOLS', 2, 3, (args, ctx) => {
    const blocked = gate(ctx);
    if (blocked) return blocked;
    const array = arrayOf(args, ctx, 0);
    const count = Math.trunc(args.number(1));
    if (count < 1) return error(ErrorCode.num);
    const values: ScalarValue[] = [];
    for (let col = 0; col < array.colCount; col++)
      for (let row = 0; row < array.rowCount; row++) values.push(array.at(row, col));
    const pad = args.isMissing(2) ? error(ErrorCode.na) : args.scalar(2);
    const columns: ScalarValue[][] = [];
    for (let index = 0; index < values.length; index += count) {
      const column: ScalarValue[] = [];
      for (let offset = 0; offset < count; offset++) column.push(values[index + offset] ?? pad);
      columns.push(column);
    }
    const rows: ScalarValue[][] = Array.from({ length: count }, () => []);
    for (const column of columns) for (let row = 0; row < count; row++) rows[row]!.push(column[row]!);
    return new CalcArray(rows);
  }),
  define('EXPAND', 2, 4, (args, ctx) => {
    const blocked = gate(ctx);
    if (blocked) return blocked;
    const array = arrayOf(args, ctx, 0);
    const rows = Math.trunc(args.number(1));
    const cols = args.isMissing(2) ? array.colCount : Math.trunc(args.number(2));
    if (rows < array.rowCount || cols < array.colCount) return error(ErrorCode.value);
    const pad = args.isMissing(3) ? error(ErrorCode.na) : args.scalar(3);
    const result: ScalarValue[][] = [];
    for (let row = 0; row < rows; row++) {
      const line: ScalarValue[] = [];
      for (let col = 0; col < cols; col++)
        line.push(row < array.rowCount && col < array.colCount ? array.at(row, col) : pad);
      result.push(line);
    }
    return new CalcArray(result);
  }),
  define('CHOOSECOLS', 2, 255, (args, ctx) => {
    const blocked = gate(ctx);
    if (blocked) return blocked;
    const array = arrayOf(args, ctx, 0);
    const indices: number[] = [];
    for (let index = 1; index < args.count; index++) {
      const value = Math.trunc(args.number(index));
      if (value === 0) return error(ErrorCode.value);
      indices.push(value > 0 ? value - 1 : array.colCount + value);
    }
    const result: ScalarValue[][] = Array.from({ length: array.rowCount }, () => []);
    for (const col of indices) {
      if (col < 0 || col >= array.colCount) return error(ErrorCode.value);
      for (let row = 0; row < array.rowCount; row++) result[row]!.push(array.at(row, col));
    }
    return new CalcArray(result);
  }),
  define('CHOOSEROWS', 2, 255, (args, ctx) => {
    const blocked = gate(ctx);
    if (blocked) return blocked;
    const array = arrayOf(args, ctx, 0);
    const result: ScalarValue[][] = [];
    for (let index = 1; index < args.count; index++) {
      const value = Math.trunc(args.number(index));
      if (value === 0) return error(ErrorCode.value);
      const row = value > 0 ? value - 1 : array.rowCount + value;
      if (row < 0 || row >= array.rowCount) return error(ErrorCode.value);
      const line: ScalarValue[] = [];
      for (let col = 0; col < array.colCount; col++) line.push(array.at(row, col));
      result.push(line);
    }
    return new CalcArray(result);
  }),
  define('TEXTSPLIT', 2, 6, (args, ctx) => {
    const blocked = gate(ctx);
    if (blocked) return blocked;
    const text = args.text(0);
    const colDelimiter = args.isMissing(1) ? '' : args.text(1);
    const rowDelimiter = args.isMissing(2) ? '' : args.text(2);
    const ignoreEmpty = args.isMissing(3) ? false : args.boolean(3);
    const pad = args.isMissing(5) ? error(ErrorCode.na) : args.scalar(5);
    const rows = rowDelimiter ? text.split(rowDelimiter) : [text];
    const matrix: ScalarValue[][] = [];
    let width = 0;
    for (const line of rows) {
      const cells = colDelimiter ? line.split(colDelimiter) : [line];
      const filtered = ignoreEmpty ? cells.filter((cell) => cell !== '') : cells;
      width = Math.max(width, filtered.length);
      matrix.push(filtered);
    }
    for (const line of matrix) while (line.length < width) line.push(pad);
    return new CalcArray(matrix);
  }),
  define('ISOMITTED', 1, 1, (args) => args.isMissing(0)),
  define(
    'MAP',
    2,
    255,
    (args, ctx) => {
      const blocked = gate(ctx);
      if (blocked) return blocked;
      const lambda = args.value(args.count - 1);
      if (!isLambda(lambda)) return error(ErrorCode.value);
      const arrays: CalcArray[] = [];
      for (let index = 0; index < args.count - 1; index++) arrays.push(arrayOf(args, ctx, index));
      const rows = Math.max(...arrays.map((array) => array.rowCount));
      const cols = Math.max(...arrays.map((array) => array.colCount));
      const result: ScalarValue[][] = [];
      for (let row = 0; row < rows; row++) {
        const line: ScalarValue[] = [];
        for (let col = 0; col < cols; col++) {
          const values: Value[] = arrays.map((array) => array.at(row, col));
          const value = mapLambda(args, ctx, lambda, values);
          line.push(isError(value) ? value : isArray(value) ? value.at(0, 0) : (value as ScalarValue));
        }
        result.push(line);
      }
      return new CalcArray(result);
    },
    { lazy: true },
  ),
  define(
    'REDUCE',
    3,
    3,
    (args, ctx) => {
      const blocked = gate(ctx);
      if (blocked) return blocked;
      const initial = args.value(0);
      const array = arrayOf(args, ctx, 1);
      const lambda = args.value(2);
      if (!isLambda(lambda)) return error(ErrorCode.value);
      let accumulator: Value = initial;
      for (let row = 0; row < array.rowCount; row++)
        for (let col = 0; col < array.colCount; col++)
          accumulator = mapLambda(args, ctx, lambda, [accumulator, array.at(row, col)]);
      return accumulator;
    },
    { lazy: true },
  ),
  define(
    'SCAN',
    3,
    3,
    (args, ctx) => {
      const blocked = gate(ctx);
      if (blocked) return blocked;
      const initial = args.value(0);
      const array = arrayOf(args, ctx, 1);
      const lambda = args.value(2);
      if (!isLambda(lambda)) return error(ErrorCode.value);
      let accumulator: Value = initial;
      const result: ScalarValue[][] = [];
      for (let row = 0; row < array.rowCount; row++) {
        const line: ScalarValue[] = [];
        for (let col = 0; col < array.colCount; col++) {
          accumulator = mapLambda(args, ctx, lambda, [accumulator, array.at(row, col)]);
          line.push(isError(accumulator) ? accumulator : (accumulator as ScalarValue));
        }
        result.push(line);
      }
      return new CalcArray(result);
    },
    { lazy: true },
  ),
  define(
    'BYROW',
    2,
    2,
    (args, ctx) => {
      const blocked = gate(ctx);
      if (blocked) return blocked;
      const array = arrayOf(args, ctx, 0);
      const lambda = args.value(1);
      if (!isLambda(lambda)) return error(ErrorCode.value);
      const result: ScalarValue[][] = [];
      for (let row = 0; row < array.rowCount; row++) {
        const line: ScalarValue[] = [];
        for (let col = 0; col < array.colCount; col++) line.push(array.at(row, col));
        const value = mapLambda(args, ctx, lambda, [new CalcArray([line])]);
        result.push([isError(value) ? value : isArray(value) ? value.at(0, 0) : (value as ScalarValue)]);
      }
      return new CalcArray(result);
    },
    { lazy: true },
  ),
  define(
    'BYCOL',
    2,
    2,
    (args, ctx) => {
      const blocked = gate(ctx);
      if (blocked) return blocked;
      const array = arrayOf(args, ctx, 0);
      const lambda = args.value(1);
      if (!isLambda(lambda)) return error(ErrorCode.value);
      const line: ScalarValue[] = [];
      for (let col = 0; col < array.colCount; col++) {
        const column: ScalarValue[] = [];
        for (let row = 0; row < array.rowCount; row++) column.push(array.at(row, col));
        const value = mapLambda(args, ctx, lambda, [new CalcArray(column.map((item) => [item]))]);
        line.push(isError(value) ? value : isArray(value) ? value.at(0, 0) : (value as ScalarValue));
      }
      return new CalcArray([line]);
    },
    { lazy: true },
  ),
  define(
    'MAKEARRAY',
    3,
    3,
    (args, ctx) => {
      const blocked = gate(ctx);
      if (blocked) return blocked;
      const rows = Math.trunc(args.number(0));
      const cols = Math.trunc(args.number(1));
      const lambda = args.value(2);
      if (!isLambda(lambda)) return error(ErrorCode.value);
      if (rows < 1 || cols < 1) return error(ErrorCode.value);
      const result: ScalarValue[][] = [];
      for (let row = 0; row < rows; row++) {
        const line: ScalarValue[] = [];
        for (let col = 0; col < cols; col++) {
          const value = mapLambda(args, ctx, lambda, [row + 1, col + 1]);
          line.push(isError(value) ? value : isArray(value) ? value.at(0, 0) : (value as ScalarValue));
        }
        result.push(line);
      }
      return new CalcArray(result);
    },
    { lazy: true },
  ),
];

function truthy(value: ScalarValue): boolean {
  if (value === null) return false;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    if (value.toUpperCase() === 'TRUE') return true;
    if (value.toUpperCase() === 'FALSE') return false;
    const parsed = parseNumberText(value);
    return parsed !== undefined && parsed !== 0;
  }
  return false;
}

export { gatedByDynamicArrays, toNumbers };
function gatedByDynamicArrays(ctx: EvalContext): Value | undefined {
  return gate(ctx);
}
export type { ReferenceValue, CalcError, Value, ScalarValue };
