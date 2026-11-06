/** Database functions (DSUM, DAVERAGE, ...). */
import { Args, EvalContext, raise, raiseError } from '../evaluate.js';
import {
  CalcError,
  ErrorCode,
  ScalarValue,
  Value,
  dateToSerial,
  error,
  isError,
  normalizeNumber,
  parseNumberText,
} from '../values.js';
import { type DefinedFunction, define, makeCriterion, matchesCriterion } from './common.js';

type Mode = 'sum' | 'average' | 'count' | 'counta' | 'max' | 'min' | 'product' | 'stdev' | 'stdevp' | 'var' | 'varp' | 'get';

function fieldIndex(database: ScalarValue[][], field: ScalarValue): number | CalcError {
  if (typeof field === 'number') {
    const index = Math.trunc(field);
    if (index < 1 || index > (database[0]?.length ?? 0)) return error(ErrorCode.value);
    return index - 1;
  }
  const name = String(field ?? '').toLowerCase();
  const headers = database[0] ?? [];
  for (let index = 0; index < headers.length; index++)
    if (String(headers[index] ?? '').toLowerCase() === name) return index;
  return error(ErrorCode.value);
}

function matchingRows(
  database: ScalarValue[][],
  criteria: ScalarValue[][],
  ctx: EvalContext,
): ScalarValue[][] {
  const headers = database[0] ?? [];
  const criteriaHeaders = criteria[0] ?? [];
  const columns: { index: number; criterion: ReturnType<typeof makeCriterion> }[][] = [];
  for (let row = 1; row < criteria.length; row++) {
    const conditions: { index: number; criterion: ReturnType<typeof makeCriterion> }[] = [];
    for (let col = 0; col < criteriaHeaders.length; col++) {
      const value = criteria[row]?.[col] ?? null;
      if (value === null || value === '') continue;
      const header = String(criteriaHeaders[col] ?? '').toLowerCase();
      const index = headers.findIndex((item) => String(item ?? '').toLowerCase() === header);
      if (index < 0) return [];
      conditions.push({ index, criterion: makeCriterion(value) });
    }
    columns.push(conditions);
  }
  const result: ScalarValue[][] = [];
  for (let row = 1; row < database.length; row++) {
    const data = database[row]!;
    let matched = false;
    for (const conditions of columns) {
      let all = true;
      for (const { index, criterion } of conditions)
        if (!matchesCriterion(criterion, data[index] ?? null, ctx)) {
          all = false;
          break;
        }
      if (all) {
        matched = true;
        break;
      }
    }
    if (matched) result.push(data);
  }
  return result;
}

function numberValue(value: ScalarValue): number | undefined {
  if (value === null) return undefined;
  if (typeof value === 'number') return value;
  if (value instanceof Date) return dateToSerial(value);
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'string') return parseNumberText(value);
  if (isError(value)) raiseError(value);
  return undefined;
}

function aggregate(args: Args, ctx: EvalContext, mode: Mode): Value {
  const database = args.array(0);
  const field = args.scalar(1);
  const criteria = args.array(2);
  const table: ScalarValue[][] = [];
  for (let row = 0; row < database.rowCount; row++) {
    const line: ScalarValue[] = [];
    for (let col = 0; col < database.colCount; col++) line.push(database.at(row, col));
    table.push(line);
  }
  const criteriaTable: ScalarValue[][] = [];
  for (let row = 0; row < criteria.rowCount; row++) {
    const line: ScalarValue[] = [];
    for (let col = 0; col < criteria.colCount; col++) line.push(criteria.at(row, col));
    criteriaTable.push(line);
  }
  const rows = matchingRows(table, criteriaTable, ctx);
  if (mode === 'count') {
    const index = fieldIndex(table, field);
    if (isError(index)) return index;
    let count = 0;
    for (const row of rows) if (typeof row[index] === 'number' || row[index] instanceof Date) count++;
    return count;
  }
  if (mode === 'counta') {
    const index = fieldIndex(table, field);
    if (isError(index)) return index;
    return rows.filter((row) => row[index] !== null && row[index] !== undefined && row[index] !== '').length;
  }
  if (mode === 'get') {
    if (!rows.length) return error(ErrorCode.value);
    if (rows.length > 1) return error(ErrorCode.num);
    const index = fieldIndex(table, field);
    if (isError(index)) return index;
    const value = rows[0]![index] ?? null;
    return value;
  }
  const index = fieldIndex(table, field);
  if (isError(index)) return index;
  const values: number[] = [];
  for (const row of rows) {
    const value = numberValue(row[index] ?? null);
    if (value !== undefined) values.push(value);
  }
  switch (mode) {
    case 'sum':
      return normalizeNumber(values.reduce((sum, value) => sum + value, 0));
    case 'average':
      if (!values.length) return error(ErrorCode.div0);
      return normalizeNumber(values.reduce((sum, value) => sum + value, 0) / values.length);
    case 'max':
      return values.length ? Math.max(...values) : 0;
    case 'min':
      return values.length ? Math.min(...values) : 0;
    case 'product':
      return values.length ? normalizeNumber(values.reduce((product, value) => product * value, 1)) : 0;
    case 'stdev':
    case 'stdevp':
    case 'var':
    case 'varp': {
      if (!values.length) return error(ErrorCode.div0);
      if (values.length < 2 && (mode === 'stdev' || mode === 'var')) return error(ErrorCode.div0);
      const average = values.reduce((sum, value) => sum + value, 0) / values.length;
      let ss = 0;
      for (const value of values) ss += (value - average) ** 2;
      const divisor = mode === 'stdevp' || mode === 'varp' ? values.length : values.length - 1;
      const variance = ss / divisor;
      return normalizeNumber(mode === 'stdev' || mode === 'stdevp' ? Math.sqrt(variance) : variance);
    }
  }
}

export const DATABASE_FUNCTIONS: DefinedFunction[] = [
  define('DSUM', 3, 3, (args, ctx) => aggregate(args, ctx, 'sum')),
  define('DAVERAGE', 3, 3, (args, ctx) => aggregate(args, ctx, 'average')),
  define('DCOUNT', 3, 3, (args, ctx) => aggregate(args, ctx, 'count')),
  define('DCOUNTA', 3, 3, (args, ctx) => aggregate(args, ctx, 'counta')),
  define('DGET', 3, 3, (args, ctx) => aggregate(args, ctx, 'get')),
  define('DMAX', 3, 3, (args, ctx) => aggregate(args, ctx, 'max')),
  define('DMIN', 3, 3, (args, ctx) => aggregate(args, ctx, 'min')),
  define('DPRODUCT', 3, 3, (args, ctx) => aggregate(args, ctx, 'product')),
  define('DSTDEV', 3, 3, (args, ctx) => aggregate(args, ctx, 'stdev')),
  define('DSTDEVP', 3, 3, (args, ctx) => aggregate(args, ctx, 'stdevp')),
  define('DVAR', 3, 3, (args, ctx) => aggregate(args, ctx, 'var')),
  define('DVARP', 3, 3, (args, ctx) => aggregate(args, ctx, 'varp')),
];

export { raise };
