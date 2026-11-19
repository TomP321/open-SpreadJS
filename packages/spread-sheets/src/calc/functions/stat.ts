/** Statistical functions. */
import type { Worksheet } from '../../worksheet.js';
import { Args, EvalContext, raise, raiseError } from '../evaluate.js';
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
  parseNumberText,
} from '../values.js';
import {
  type DefinedFunction,
  NUMBER_MODES,
  allEntries,
  define,
  entries,
  makeCriterion,
  matchesCriterion,
  numbers,
  numeric,
} from './common.js';
import {
  betaInv,
  betaPdf,
  chiSquareCdf,
  chiSquareInv,
  chiSquarePdf,
  fCdf,
  fInv,
  gammaFunction,
  gammaP,
  incompleteBeta,
  lgamma,
  normalCdf,
  normalInv,
  normalPdf,
  tCdf,
  tInv,
  tPdf,
} from './special.js';

type Mode = 'all' | 'numbers' | 'a';

/** Collects values for descriptive statistics. */
function collect(args: Args, ctx: EvalContext, mode: Mode): number[] {
  const result: number[] = [];
  for (const entry of allEntries(args, ctx)) {
    const value = entry.value;
    if (isError(value)) raiseError(value);
    if (value === null) continue;
    if (typeof value === 'number') result.push(value);
    else if (value instanceof Date) result.push(dateToSerial(value));
    else if (typeof value === 'boolean') {
      if (mode === 'all' || mode === 'a') result.push(value ? 1 : 0);
    } else if (typeof value === 'string') {
      if (mode === 'all') {
        const parsed = parseNumberText(value);
        if (parsed !== undefined) result.push(parsed);
      } else if (mode === 'a') result.push(0);
      else if (!entry.fromReference) raise(ErrorCode.value);
    }
  }
  return result;
}

function flattenValues(args: Args, ctx: EvalContext, index: number): number[] {
  const array = args.array(index);
  const values: number[] = [];
  for (let row = 0; row < array.rowCount; row++)
    for (let col = 0; col < array.colCount; col++) {
      const value = numericOrUndefined(array.at(row, col));
      if (value !== undefined) values.push(value);
    }
  void ctx;
  return values;
}

function collectPairs(args: Args, ctx: EvalContext): { x: number[]; y: number[] } {
  const left = flattenValues(args, ctx, 0);
  const right = flattenValues(args, ctx, 1);
  const size = Math.min(left.length, right.length);
  return { x: left.slice(0, size), y: right.slice(0, size) };
}

function numericOrUndefined(value: ScalarValue): number | undefined {
  if (value === null) return undefined;
  if (typeof value === 'number') return value;
  if (value instanceof Date) return dateToSerial(value);
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'string') return parseNumberText(value);
  if (isError(value)) raiseError(value);
  return undefined;
}

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function variance(values: number[], sample: boolean): number {
  const average = mean(values);
  let sum = 0;
  for (const value of values) sum += (value - average) ** 2;
  return sum / (sample ? values.length - 1 : values.length);
}

function criteriaRanges(args: Args, ctx: EvalContext): { source: ScalarValue[]; sum: ScalarValue[] } {
  const source = [...entries(args, ctx, 0)].map((entry) => entry.value);
  let sum: ScalarValue[];
  if (args.count >= 3) sum = [...entries(args, ctx, 2)].map((entry) => entry.value);
  else sum = source;
  return { source, sum };
}

function aggregateIf(args: Args, ctx: EvalContext, mode: 'average' | 'sum' | 'max' | 'min'): Value {
  const { source, sum } = criteriaRanges(args, ctx);
  const criterion = makeCriterion(args.scalar(1));
  const selected: number[] = [];
  for (let index = 0; index < source.length; index++) {
    const candidate = source[index]!;
    if (mode === 'average') {
      // SpreadJS only considers genuinely numeric cells for AVERAGEIF.
      if (typeof candidate !== 'number' && !(candidate instanceof Date)) continue;
    }
    if (!matchesCriterion(criterion, candidate, ctx)) continue;
    const value = sum[index];
    if (value === undefined || value === null) continue;
    if (typeof value === 'number') selected.push(value);
    else if (value instanceof Date) selected.push(dateToSerial(value));
    else if (typeof value === 'boolean') {
      if (mode === 'sum') selected.push(value ? 1 : 0);
    } else if (typeof value === 'string') {
      if (mode === 'sum') {
        const parsed = parseNumberText(value);
        if (parsed !== undefined) selected.push(parsed);
      }
    }
  }
  if (!selected.length)
    return mode === 'average' ? error(ErrorCode.div0) : mode === 'max' || mode === 'min' ? 0 : 0;
  if (mode === 'average') return normalizeNumber(mean(selected));
  if (mode === 'sum') return normalizeNumber(selected.reduce((a, b) => a + b, 0));
  if (mode === 'max') return Math.max(...selected);
  return Math.min(...selected);
}

function aggregateIfs(args: Args, ctx: EvalContext, mode: 'average' | 'sum' | 'max' | 'min'): Value {
  const values = [...entries(args, ctx, 0)].map((entry) => entry.value);
  const pairs = Math.floor((args.count - 1) / 2);
  const criteria = Array.from({ length: pairs }, (_, index) => makeCriterion(args.scalar(index * 2 + 2)));
  const ranges = Array.from({ length: pairs }, (_, index) =>
    [...entries(args, ctx, index * 2 + 1)].map((entry) => entry.value),
  );
  const selected: number[] = [];
  for (let index = 0; index < values.length; index++) {
    let ok = true;
    for (let pair = 0; pair < pairs; pair++) {
      if (!criteria[pair]!.match(ranges[pair]![index] ?? null, ctx)) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;
    const value = values[index];
    if (typeof value === 'number') selected.push(value);
    else if (value instanceof Date) selected.push(dateToSerial(value));
    else if (typeof value === 'string') {
      const parsed = parseNumberText(value);
      if (parsed !== undefined) selected.push(parsed);
    }
  }
  if (!selected.length) return mode === 'average' ? error(ErrorCode.div0) : 0;
  if (mode === 'average') return normalizeNumber(mean(selected));
  if (mode === 'sum') return normalizeNumber(selected.reduce((a, b) => a + b, 0));
  if (mode === 'max') return Math.max(...selected);
  return Math.min(...selected);
}

function countIfs(args: Args, ctx: EvalContext): Value {
  const pairs = Math.floor(args.count / 2);
  const ranges: ScalarValue[][] = [];
  const criteria = [];
  for (let index = 0; index < pairs; index++) {
    ranges.push([...entries(args, ctx, index * 2)].map((entry) => entry.value));
    criteria.push(makeCriterion(args.scalar(index * 2 + 1)));
  }
  const size = ranges[0]?.length ?? 0;
  let count = 0;
  for (let index = 0; index < size; index++) {
    let ok = true;
    for (let pair = 0; pair < pairs; pair++)
      if (!criteria[pair]!.match(ranges[pair]![index] ?? null, ctx)) {
        ok = false;
        break;
      }
    if (ok) count++;
  }
  return count;
}

function percentile(values: number[], p: number, exclusive: boolean): number | CalcError {
  const sorted = [...values].sort((a, b) => a - b);
  if (!sorted.length) return error(ErrorCode.num);
  if (p < 0 || p > 1) return error(ErrorCode.num);
  if (exclusive) {
    const rank = p * (sorted.length + 1);
    if (rank < 1 || rank > sorted.length) return error(ErrorCode.num);
    const lower = Math.floor(rank);
    const upper = Math.ceil(rank);
    if (lower === upper) return sorted[lower - 1]!;
    return normalizeNumber(sorted[lower - 1]! + (rank - lower) * (sorted[upper - 1]! - sorted[lower - 1]!));
  }
  const rank = p * (sorted.length - 1);
  const lower = Math.floor(rank);
  const upper = Math.ceil(rank);
  if (lower === upper) return sorted[lower]!;
  return normalizeNumber(sorted[lower]! + (rank - lower) * (sorted[upper]! - sorted[lower]!));
}

function rankOf(values: number[], target: number, ascending: boolean, average: boolean): number | CalcError {
  const sorted = [...values].sort((a, b) => (ascending ? a - b : b - a));
  const first = sorted.indexOf(target);
  if (first < 0) return error(ErrorCode.na);
  if (!average) return first + 1;
  let last = first;
  while (last + 1 < sorted.length && sorted[last + 1] === target) last++;
  return normalizeNumber((first + 1 + last + 1) / 2);
}

function modeNumbers(values: number[], multiple: boolean): Value {
  const counts = new Map<number, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  let best = 1;
  for (const count of counts.values()) best = Math.max(best, count);
  if (best < 2) return error(ErrorCode.na);
  const modes: number[] = [];
  for (const value of values) {
    if (counts.get(value) === best && !modes.includes(value)) modes.push(value);
  }
  modes.sort((a, b) => a - b);
  if (multiple) return new CalcArray(modes.map((value) => [value]));
  return modes[0]!;
}

function distributionBool(args: Args, index: number): boolean {
  return args.boolean(index);
}

function checkProb(value: number): number | CalcError {
  if (value <= 0 || value > 1) return error(ErrorCode.num);
  return value;
}

export const STAT_FUNCTIONS: DefinedFunction[] = [
  define('AVERAGE', 1, 255, (args, ctx) => {
    const values = numbers(args, ctx, NUMBER_MODES.average);
    if (!values.length) return error(ErrorCode.div0);
    return numeric(mean(values));
  }),
  define('AVERAGEA', 1, 255, (args, ctx) => {
    const values = collect(args, ctx, 'a');
    if (!values.length) return error(ErrorCode.div0);
    return numeric(mean(values));
  }),
  define('AVERAGEIF', 2, 3, (args, ctx) => aggregateIf(args, ctx, 'average')),
  define('AVERAGEIFS', 3, 255, (args, ctx) => aggregateIfs(args, ctx, 'average')),
  define('COUNT', 0, 255, (args, ctx) => {
    let count = 0;
    for (const entry of allEntries(args, ctx)) {
      if (typeof entry.value === 'number' || entry.value instanceof Date) count++;
    }
    return count;
  }),
  define('COUNTA', 0, 255, (args, ctx) => {
    let count = 0;
    for (const entry of allEntries(args, ctx)) if (entry.value !== null && entry.value !== undefined) count++;
    return count;
  }),
  define('COUNTBLANK', 1, 1, (args, ctx) => {
    let count = 0;
    for (const entry of entries(args, ctx, 0)) if (entry.value === null || entry.value === '') count++;
    return count;
  }),
  define('COUNTIF', 2, 2, (args, ctx) => {
    const criterion = makeCriterion(args.scalar(1));
    let count = 0;
    for (const entry of entries(args, ctx, 0)) if (matchesCriterion(criterion, entry.value, ctx)) count++;
    return count;
  }),
  define('COUNTIFS', 2, 255, (args, ctx) => countIfs(args, ctx)),
  define('MAX', 1, 255, (args, ctx) => {
    const values = numbers(args, ctx, NUMBER_MODES.average);
    return values.length ? Math.max(...values) : 0;
  }),
  define('MIN', 1, 255, (args, ctx) => {
    const values = numbers(args, ctx, NUMBER_MODES.average);
    return values.length ? Math.min(...values) : 0;
  }),
  define('MAXA', 1, 255, (args, ctx) => {
    const values = collect(args, ctx, 'a');
    return values.length ? Math.max(...values) : 0;
  }),
  define('MINA', 1, 255, (args, ctx) => {
    const values = collect(args, ctx, 'a');
    return values.length ? Math.min(...values) : 0;
  }),
  define('MAXIFS', 2, 255, (args, ctx) => aggregateIfs(args, ctx, 'max')),
  define('MINIFS', 2, 255, (args, ctx) => aggregateIfs(args, ctx, 'min')),
  define('MEDIAN', 1, 255, (args, ctx) => {
    const values = numbers(args, ctx, NUMBER_MODES.median).sort((a, b) => a - b);
    if (!values.length) return error(ErrorCode.num);
    const middle = Math.floor(values.length / 2);
    return values.length % 2 ? values[middle]! : normalizeNumber((values[middle - 1]! + values[middle]!) / 2);
  }),
  define('MODE', 1, 255, (args, ctx) => modeNumbers(numbers(args, ctx, NUMBER_MODES.median), false)),
  define('MODE.SNGL', 1, 255, (args, ctx) => modeNumbers(numbers(args, ctx, NUMBER_MODES.median), false)),
  define('MODE.MULT', 1, 255, (args, ctx) => modeNumbers(numbers(args, ctx, NUMBER_MODES.median), true)),
  define('LARGE', 2, 2, (args, ctx) => {
    const values = numbers(args, ctx, NUMBER_MODES.median, 0, 1).sort((a, b) => b - a);
    const k = Math.trunc(args.number(1));
    if (k < 1 || k > values.length) return error(ErrorCode.num);
    return values[k - 1]!;
  }),
  define('SMALL', 2, 2, (args, ctx) => {
    const values = numbers(args, ctx, NUMBER_MODES.median, 0, 1).sort((a, b) => a - b);
    const k = Math.trunc(args.number(1));
    if (k < 1 || k > values.length) return error(ErrorCode.num);
    return values[k - 1]!;
  }),
  define('RANK', 2, 3, (args, ctx) => rankArgs(args, ctx, false)),
  define('RANK.EQ', 2, 3, (args, ctx) => rankArgs(args, ctx, false)),
  define('RANK.AVG', 2, 3, (args, ctx) => rankArgs(args, ctx, true)),
  define('PERCENTILE', 2, 2, (args, ctx) => percentile(numbers(args, ctx, NUMBER_MODES.median, 0, 1), args.number(1), false)),
  define('PERCENTILE.INC', 2, 2, (args, ctx) => percentile(numbers(args, ctx, NUMBER_MODES.median, 0, 1), args.number(1), false)),
  define('PERCENTILE.EXC', 2, 2, (args, ctx) => percentile(numbers(args, ctx, NUMBER_MODES.median, 0, 1), args.number(1), true)),
  define('QUARTILE', 2, 2, (args, ctx) => percentile(numbers(args, ctx, NUMBER_MODES.median, 0, 1), args.number(1) / 4, false)),
  define('QUARTILE.INC', 2, 2, (args, ctx) => percentile(numbers(args, ctx, NUMBER_MODES.median, 0, 1), args.number(1) / 4, false)),
  define('QUARTILE.EXC', 2, 2, (args, ctx) => percentile(numbers(args, ctx, NUMBER_MODES.median, 0, 1), args.number(1) / 4, true)),
  define('STDEV', 1, 255, (args, ctx) => stdev(args, ctx, true, false, false)),
  define('STDEV.S', 1, 255, (args, ctx) => stdev(args, ctx, true, false, false)),
  define('STDEVP', 1, 255, (args, ctx) => stdev(args, ctx, false, false, false)),
  define('STDEV.P', 1, 255, (args, ctx) => stdev(args, ctx, false, false, false)),
  define('STDEVA', 1, 255, (args, ctx) => stdev(args, ctx, true, true, false)),
  define('STDEVPA', 1, 255, (args, ctx) => stdev(args, ctx, false, true, false)),
  define('VAR', 1, 255, (args, ctx) => stdev(args, ctx, true, false, true)),
  define('VAR.S', 1, 255, (args, ctx) => stdev(args, ctx, true, false, true)),
  define('VARP', 1, 255, (args, ctx) => stdev(args, ctx, false, false, true)),
  define('VAR.P', 1, 255, (args, ctx) => stdev(args, ctx, false, false, true)),
  define('VARA', 1, 255, (args, ctx) => stdev(args, ctx, true, true, true)),
  define('VARPA', 1, 255, (args, ctx) => stdev(args, ctx, false, true, true)),
  define('CORREL', 2, 2, (args, ctx) => correlation(args, ctx)),
  define('PEARSON', 2, 2, (args, ctx) => correlation(args, ctx)),
  define('RSQ', 2, 2, (args, ctx) => {
    const result = correlation(args, ctx);
    return typeof result === 'number' ? normalizeNumber(result * result) : result;
  }),
  define('COVARIANCE.P', 2, 2, (args, ctx) => covariance(args, ctx, false)),
  define('COVARIANCE.S', 2, 2, (args, ctx) => covariance(args, ctx, true)),
  define('SLOPE', 2, 2, (args, ctx) => regression(args, ctx, 'slope')),
  define('INTERCEPT', 2, 2, (args, ctx) => regression(args, ctx, 'intercept')),
  define('FORECAST', 3, 3, (args, ctx) => {
    const x = args.number(0);
    const slope = regressionWithArgs(args, ctx, 1, 2, 'slope');
    const intercept = regressionWithArgs(args, ctx, 1, 2, 'intercept');
    if (isError(slope)) return slope;
    if (isError(intercept)) return intercept;
    return numeric(slope * x + intercept);
  }),
  define('FORECAST.LINEAR', 3, 3, (args, ctx) => {
    const x = args.number(0);
    const slope = regressionWithArgs(args, ctx, 1, 2, 'slope');
    const intercept = regressionWithArgs(args, ctx, 1, 2, 'intercept');
    if (isError(slope)) return slope;
    if (isError(intercept)) return intercept;
    return numeric(slope * x + intercept);
  }),
  define('GEOMEAN', 1, 255, (args, ctx) => {
    const values = numbers(args, ctx, NUMBER_MODES.a);
    if (!values.length) return error(ErrorCode.num);
    if (values.some((value) => value <= 0)) return error(ErrorCode.num);
    return numeric(Math.exp(values.reduce((sum, value) => sum + Math.log(value), 0) / values.length));
  }),
  define('HARMEAN', 1, 255, (args, ctx) => {
    const values = numbers(args, ctx, NUMBER_MODES.a);
    if (!values.length) return error(ErrorCode.num);
    if (values.some((value) => value <= 0)) return error(ErrorCode.num);
    return numeric(values.length / values.reduce((sum, value) => sum + 1 / value, 0));
  }),
  define('AVEDEV', 1, 255, (args, ctx) => {
    const values = numbers(args, ctx, NUMBER_MODES.a);
    if (!values.length) return error(ErrorCode.num);
    const average = mean(values);
    return numeric(values.reduce((sum, value) => sum + Math.abs(value - average), 0) / values.length);
  }),
  define('DEVSQ', 1, 255, (args, ctx) => {
    const values = numbers(args, ctx, NUMBER_MODES.a);
    if (!values.length) return error(ErrorCode.num);
    const average = mean(values);
    return numeric(values.reduce((sum, value) => sum + (value - average) ** 2, 0));
  }),
  define('KURT', 1, 255, (args, ctx) => {
    const values = numbers(args, ctx, NUMBER_MODES.a);
    const n = values.length;
    if (n < 4) return error(ErrorCode.div0);
    const average = mean(values);
    let m2 = 0,
      m4 = 0;
    for (const value of values) {
      const delta = value - average;
      m2 += delta * delta;
      m4 += delta ** 4;
    }
    const sampleVariance = m2 / (n - 1);
    return numeric((n * (n + 1) * m4) / ((n - 1) * (n - 2) * (n - 3) * sampleVariance * sampleVariance) - (3 * (n - 1) * (n - 1)) / ((n - 2) * (n - 3)));
  }),
  define('SKEW', 1, 255, (args, ctx) => {
    const values = numbers(args, ctx, NUMBER_MODES.a);
    const n = values.length;
    if (n < 3) return error(ErrorCode.div0);
    const average = mean(values);
    let m2 = 0,
      m3 = 0;
    for (const value of values) {
      const delta = value - average;
      m2 += delta * delta;
      m3 += delta ** 3;
    }
    const sampleStdev = Math.sqrt(m2 / (n - 1));
    return numeric((n / ((n - 1) * (n - 2))) * (m3 / (sampleStdev ** 3)));
  }),
  define('SKEW.P', 1, 255, (args, ctx) => {
    const values = numbers(args, ctx, NUMBER_MODES.a);
    const n = values.length;
    if (n < 3) return error(ErrorCode.div0);
    const average = mean(values);
    let m2 = 0,
      m3 = 0;
    for (const value of values) {
      const delta = value - average;
      m2 += delta * delta;
      m3 += delta ** 3;
    }
    const populationStdev = Math.sqrt(m2 / n);
    return numeric((m3 / n) / populationStdev ** 3);
  }),
  define('TRIMMEAN', 2, 2, (args, ctx) => {
    const values = numbers(args, ctx, NUMBER_MODES.a, 0, 1).sort((a, b) => a - b);
    const percent = args.number(1);
    if (percent < 0 || percent >= 1) return error(ErrorCode.num);
    if (!values.length) return error(ErrorCode.num);
    const trim = Math.floor((values.length * percent) / 2);
    const kept = values.slice(trim, values.length - trim);
    void trim;
    return numeric(mean(kept));
  }),
  define('FREQUENCY', 2, 2, (args, ctx) => {
    const data: number[] = [];
    for (const entry of entries(args, ctx, 0)) {
      if (typeof entry.value === 'number') data.push(entry.value);
      else if (entry.value instanceof Date) data.push(dateToSerial(entry.value));
    }
    const bins: number[] = [];
    for (const entry of entries(args, ctx, 1)) {
      if (typeof entry.value === 'number') bins.push(entry.value);
      else if (entry.value instanceof Date) bins.push(dateToSerial(entry.value));
    }
    bins.sort((a, b) => a - b);
    const counts = new Array(bins.length + 1).fill(0) as number[];
    for (const value of data) {
      let index = 0;
      while (index < bins.length && value > bins[index]!) index++;
      counts[index]!++;
    }
    return new CalcArray(counts.map((count) => [count]));
  }),
  define('STANDARDIZE', 3, 3, (args) => {
    const x = args.number(0),
      meanValue = args.number(1),
      sd = args.number(2);
    if (sd <= 0) return error(ErrorCode.num);
    return numeric((x - meanValue) / sd);
  }),
  define('NORM.DIST', 4, 4, (args) => {
    const x = args.number(0),
      meanValue = args.number(1),
      sd = args.number(2);
    if (sd <= 0) return error(ErrorCode.num);
    const z = (x - meanValue) / sd;
    return numeric(distributionBool(args, 3) ? normalCdf(z) : normalPdf(z) / sd);
  }),
  define('NORMDIST', 4, 4, (args) => {
    const x = args.number(0),
      meanValue = args.number(1),
      sd = args.number(2);
    if (sd <= 0) return error(ErrorCode.num);
    const z = (x - meanValue) / sd;
    return numeric(distributionBool(args, 3) ? normalCdf(z) : normalPdf(z) / sd);
  }),
  define('NORM.S.DIST', 2, 2, (args) => numeric(distributionBool(args, 1) ? normalCdf(args.number(0)) : normalPdf(args.number(0)))),
  define('NORMSDIST', 1, 1, (args) => numeric(normalCdf(args.number(0)))),
  define('NORM.INV', 3, 3, (args) => {
    const p = checkProb(args.number(0));
    if (isError(p)) return p;
    const sd = args.number(2);
    if (sd <= 0) return error(ErrorCode.num);
    return numeric(args.number(1) + sd * normalInv(p));
  }),
  define('NORMINV', 3, 3, (args) => {
    const p = checkProb(args.number(0));
    if (isError(p)) return p;
    const sd = args.number(2);
    if (sd <= 0) return error(ErrorCode.num);
    return numeric(args.number(1) + sd * normalInv(p));
  }),
  define('NORM.S.INV', 1, 1, (args) => {
    const p = checkProb(args.number(0));
    if (isError(p)) return p;
    return numeric(normalInv(p));
  }),
  define('NORMSINV', 1, 1, (args) => {
    const p = checkProb(args.number(0));
    if (isError(p)) return p;
    return numeric(normalInv(p));
  }),
  define('BINOM.DIST', 4, 4, (args) => {
    const successes = Math.trunc(args.number(0));
    const trials = Math.trunc(args.number(1));
    const p = args.number(2);
    if (successes < 0 || successes > trials || trials < 0 || p < 0 || p > 1) return error(ErrorCode.num);
    if (distributionBool(args, 3)) {
      let sum = 0;
      for (let k = 0; k <= successes; k++) sum += binomialPmf(k, trials, p);
      return numeric(sum);
    }
    return numeric(binomialPmf(successes, trials, p));
  }),
  define('BINOMDIST', 4, 4, (args) => {
    const successes = Math.trunc(args.number(0));
    const trials = Math.trunc(args.number(1));
    const p = args.number(2);
    if (successes < 0 || successes > trials || p < 0 || p > 1) return error(ErrorCode.num);
    if (distributionBool(args, 3)) {
      let sum = 0;
      for (let k = 0; k <= successes; k++) sum += binomialPmf(k, trials, p);
      return numeric(sum);
    }
    return numeric(binomialPmf(successes, trials, p));
  }),
  define('BINOM.INV', 3, 3, (args) => {
    const trials = Math.trunc(args.number(0));
    const p = args.number(1);
    const alpha = args.number(2);
    if (trials < 0 || p < 0 || p > 1 || alpha < 0 || alpha > 1) return error(ErrorCode.num);
    let cumulative = 0;
    for (let k = 0; k <= trials; k++) {
      cumulative += binomialPmf(k, trials, p);
      if (cumulative >= alpha) return k;
    }
    return trials;
  }),
  define('CRITBINOM', 3, 3, (args) => {
    const trials = Math.trunc(args.number(0));
    const p = args.number(1);
    const alpha = args.number(2);
    let cumulative = 0;
    for (let k = 0; k <= trials; k++) {
      cumulative += binomialPmf(k, trials, p);
      if (cumulative >= alpha) return k;
    }
    return trials;
  }),
  define('POISSON.DIST', 3, 3, (args) => {
    const x = Math.trunc(args.number(0));
    const meanValue = args.number(1);
    if (x < 0 || meanValue < 0) return error(ErrorCode.num);
    if (distributionBool(args, 2)) return numeric(1 - gammaP(x + 1, meanValue));
    return numeric((Math.exp(-meanValue) * Math.pow(meanValue, x)) / gammaFunction(x + 1));
  }),
  define('POISSON', 3, 3, (args) => {
    const x = Math.trunc(args.number(0));
    const meanValue = args.number(1);
    if (x < 0 || meanValue < 0) return error(ErrorCode.num);
    if (distributionBool(args, 2)) return numeric(1 - gammaP(x + 1, meanValue));
    return numeric((Math.exp(-meanValue) * Math.pow(meanValue, x)) / gammaFunction(x + 1));
  }),
  define('EXPON.DIST', 3, 3, (args) => {
    const x = args.number(0);
    const lambda = args.number(1);
    if (x < 0 || lambda <= 0) return error(ErrorCode.num);
    return numeric(distributionBool(args, 2) ? 1 - Math.exp(-lambda * x) : lambda * Math.exp(-lambda * x));
  }),
  define('EXPONDIST', 3, 3, (args) => {
    const x = args.number(0);
    const lambda = args.number(1);
    if (x < 0 || lambda <= 0) return error(ErrorCode.num);
    return numeric(distributionBool(args, 2) ? 1 - Math.exp(-lambda * x) : lambda * Math.exp(-lambda * x));
  }),
  define('T.DIST', 3, 3, (args) => {
    const x = args.number(0);
    const df = Math.trunc(args.number(1));
    if (df < 1) return error(ErrorCode.num);
    return numeric(distributionBool(args, 2) ? tCdf(x, df) : tPdf(x, df));
  }),
  define('T.DIST.2T', 2, 2, (args) => {
    const x = args.number(0);
    const df = Math.trunc(args.number(1));
    if (x < 0 || df < 1) return error(ErrorCode.num);
    return numeric(2 * (1 - tCdf(x, df)));
  }),
  define('T.DIST.RT', 2, 2, (args) => {
    const x = args.number(0);
    const df = Math.trunc(args.number(1));
    if (df < 1) return error(ErrorCode.num);
    return numeric(1 - tCdf(x, df));
  }),
  define('T.INV', 2, 2, (args) => {
    const p = checkProb(args.number(0));
    if (isError(p)) return p;
    const df = Math.trunc(args.number(1));
    if (df < 1) return error(ErrorCode.num);
    return numeric(tInv(p, df));
  }),
  define('T.INV.2T', 2, 2, (args) => {
    const p = args.number(0);
    const df = Math.trunc(args.number(1));
    if (p <= 0 || p > 1 || df < 1) return error(ErrorCode.num);
    return numeric(tInv(1 - p / 2, df));
  }),
  define('TDIST', 3, 3, (args) => {
    const x = args.number(0);
    const df = Math.trunc(args.number(1));
    const tails = Math.trunc(args.number(2));
    if (x < 0 || df < 1 || (tails !== 1 && tails !== 2)) return error(ErrorCode.num);
    return numeric(tails === 1 ? 1 - tCdf(x, df) : 2 * (1 - tCdf(x, df)));
  }),
  define('TINV', 2, 2, (args) => {
    const p = args.number(0);
    const df = Math.trunc(args.number(1));
    if (p <= 0 || p > 1 || df < 1) return error(ErrorCode.num);
    return numeric(tInv(1 - p / 2, df));
  }),
  define('CHISQ.DIST', 3, 3, (args) => {
    const x = args.number(0);
    const df = Math.trunc(args.number(1));
    if (x < 0 || df < 1) return error(ErrorCode.num);
    return numeric(distributionBool(args, 2) ? chiSquareCdf(x, df) : chiSquarePdf(x, df));
  }),
  define('CHISQ.DIST.RT', 2, 2, (args) => {
    const x = args.number(0);
    const df = Math.trunc(args.number(1));
    if (x < 0 || df < 1) return error(ErrorCode.num);
    return numeric(1 - chiSquareCdf(x, df));
  }),
  define('CHISQ.INV', 2, 2, (args) => {
    const p = checkProb(args.number(0));
    if (isError(p)) return p;
    const df = Math.trunc(args.number(1));
    if (df < 1) return error(ErrorCode.num);
    return numeric(chiSquareInv(p, df));
  }),
  define('CHISQ.INV.RT', 2, 2, (args) => {
    const p = checkProb(args.number(0));
    if (isError(p)) return p;
    const df = Math.trunc(args.number(1));
    if (df < 1) return error(ErrorCode.num);
    return numeric(chiSquareInv(1 - p, df));
  }),
  define('F.DIST', 4, 4, (args) => {
    const x = args.number(0);
    const d1 = Math.trunc(args.number(1));
    const d2 = Math.trunc(args.number(2));
    if (x < 0 || d1 < 1 || d2 < 1) return error(ErrorCode.num);
    return numeric(distributionBool(args, 3) ? fCdf(x, d1, d2) : fPdfApprox(x, d1, d2));
  }),
  define('F.DIST.RT', 3, 3, (args) => {
    const x = args.number(0);
    const d1 = Math.trunc(args.number(1));
    const d2 = Math.trunc(args.number(2));
    if (x < 0 || d1 < 1 || d2 < 1) return error(ErrorCode.num);
    return numeric(1 - fCdf(x, d1, d2));
  }),
  define('F.INV', 3, 3, (args) => {
    const p = checkProb(args.number(0));
    if (isError(p)) return p;
    const d1 = Math.trunc(args.number(1));
    const d2 = Math.trunc(args.number(2));
    if (d1 < 1 || d2 < 1) return error(ErrorCode.num);
    return numeric(fInv(p, d1, d2));
  }),
  define('F.INV.RT', 3, 3, (args) => {
    const p = checkProb(args.number(0));
    if (isError(p)) return p;
    const d1 = Math.trunc(args.number(1));
    const d2 = Math.trunc(args.number(2));
    if (d1 < 1 || d2 < 1) return error(ErrorCode.num);
    return numeric(fInv(1 - p, d1, d2));
  }),
  define('GAMMA', 1, 1, (args) => numeric(gammaFunction(args.number(0)))),
  define('GAMMALN', 1, 1, (args) => {
    const x = args.number(0);
    if (x <= 0) return error(ErrorCode.num);
    return numeric(lgamma(x));
  }),
  define('GAMMALN.PRECISE', 1, 1, (args) => {
    const x = args.number(0);
    if (x <= 0) return error(ErrorCode.num);
    return numeric(lgamma(x));
  }),
  define('GAMMA.DIST', 4, 4, (args) => {
    const x = args.number(0);
    const alpha = args.number(1);
    const beta = args.number(2);
    if (x < 0 || alpha <= 0 || beta <= 0) return error(ErrorCode.num);
    if (distributionBool(args, 3)) return numeric(gammaP(alpha, x / beta));
    return numeric(
      Math.exp((alpha - 1) * Math.log(x) - x / beta - lgamma(alpha) - alpha * Math.log(beta)),
    );
  }),
  define('GAMMA.INV', 3, 3, (args) => {
    const p = checkProb(args.number(0));
    if (isError(p)) return p;
    const alpha = args.number(1);
    const beta = args.number(2);
    if (alpha <= 0 || beta <= 0) return error(ErrorCode.num);
    let low = 0;
    let high = Math.max(1, alpha * beta * 10);
    while (gammaP(alpha, high / beta) < p) high *= 2;
    for (let iteration = 0; iteration < 200; iteration++) {
      const mid = (low + high) / 2;
      if (gammaP(alpha, mid / beta) < p) low = mid;
      else high = mid;
    }
    return numeric((low + high) / 2);
  }),
  define('BETA.DIST', 4, 6, (args) => {
    const x = args.number(0);
    const alpha = args.number(1);
    const beta = args.number(2);
    if (x < 0 || x > 1 || alpha <= 0 || beta <= 0) return error(ErrorCode.num);
    if (args.count > 3 && args.boolean(3)) return numeric(incompleteBeta(x, alpha, beta));
    return numeric(betaPdf(x, alpha, beta));
  }),
  define('BETA.INV', 3, 5, (args) => {
    const p = checkProb(args.number(0));
    if (isError(p)) return p;
    const alpha = args.number(1);
    const beta = args.number(2);
    if (alpha <= 0 || beta <= 0) return error(ErrorCode.num);
    return numeric(betaInv(p, alpha, beta));
  }),
  define('WEIBULL.DIST', 4, 4, (args) => {
    const x = args.number(0);
    const shape = args.number(1);
    const scale = args.number(2);
    if (x < 0 || shape <= 0 || scale <= 0) return error(ErrorCode.num);
    if (distributionBool(args, 3)) return numeric(1 - Math.exp(-Math.pow(x / scale, shape)));
    return numeric(
      (shape / scale) * Math.pow(x / scale, shape - 1) * Math.exp(-Math.pow(x / scale, shape)),
    );
  }),
  define('LOGNORM.DIST', 4, 4, (args) => {
    const x = args.number(0);
    const meanValue = args.number(1);
    const sd = args.number(2);
    if (x <= 0 || sd <= 0) return error(ErrorCode.num);
    const z = (Math.log(x) - meanValue) / sd;
    if (distributionBool(args, 3)) return numeric(normalCdf(z));
    return numeric(normalPdf(z) / (x * sd));
  }),
  define('LOGNORM.INV', 3, 3, (args) => {
    const p = checkProb(args.number(0));
    if (isError(p)) return p;
    const sd = args.number(2);
    if (sd <= 0) return error(ErrorCode.num);
    return numeric(Math.exp(args.number(1) + sd * normalInv(p)));
  }),
  define('CONFIDENCE.NORM', 3, 3, (args) => {
    const alpha = args.number(0);
    const sd = args.number(1);
    const size = Math.trunc(args.number(2));
    if (alpha <= 0 || alpha >= 1 || sd <= 0 || size < 1) return error(ErrorCode.num);
    return numeric(normalInv(1 - alpha / 2) * (sd / Math.sqrt(size)));
  }),
  define('CONFIDENCE', 3, 3, (args) => {
    const alpha = args.number(0);
    const sd = args.number(1);
    const size = Math.trunc(args.number(2));
    if (alpha <= 0 || alpha >= 1 || sd <= 0 || size < 1) return error(ErrorCode.num);
    return numeric(normalInv(1 - alpha / 2) * (sd / Math.sqrt(size)));
  }),
  define('CONFIDENCE.T', 3, 3, (args) => {
    const alpha = args.number(0);
    const sd = args.number(1);
    const size = Math.trunc(args.number(2));
    if (alpha <= 0 || alpha >= 1 || sd <= 0 || size < 2) return error(ErrorCode.num);
    return numeric(tInv(1 - alpha / 2, size - 1) * (sd / Math.sqrt(size)));
  }),
  define('HYPGEOM.DIST', 5, 5, (args) => {
    const sampleSuccesses = Math.trunc(args.number(0));
    const sampleSize = Math.trunc(args.number(1));
    const populationSuccesses = Math.trunc(args.number(2));
    const populationSize = Math.trunc(args.number(3));
    if (sampleSize < 0 || populationSize < 0) return error(ErrorCode.num);
    const pmf = (k: number) =>
      (combinations(populationSuccesses, k) * combinations(populationSize - populationSuccesses, sampleSize - k)) /
      combinations(populationSize, sampleSize);
    if (args.boolean(4)) {
      let sum = 0;
      for (let k = Math.max(0, sampleSize - (populationSize - populationSuccesses)); k <= sampleSuccesses; k++)
        sum += pmf(k);
      return numeric(sum);
    }
    return numeric(pmf(sampleSuccesses));
  }),
  define('NEGBINOM.DIST', 4, 4, (args) => {
    const failures = Math.trunc(args.number(0));
    const successes = Math.trunc(args.number(1));
    const p = args.number(2);
    if (failures < 0 || successes < 1 || p <= 0 || p > 1) return error(ErrorCode.num);
    const pmf = (k: number) => combinations(k + successes - 1, k) * Math.pow(p, successes) * Math.pow(1 - p, k);
    if (args.boolean(3)) {
      let sum = 0;
      for (let k = 0; k <= failures; k++) sum += pmf(k);
      return numeric(sum);
    }
    return numeric(pmf(failures));
  }),
];

function binomialPmf(k: number, n: number, p: number): number {
  if (p === 0) return k === 0 ? 1 : 0;
  if (p === 1) return k === n ? 1 : 0;
  return combinations(n, k) * Math.pow(p, k) * Math.pow(1 - p, n - k);
}

function combinations(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  const count = Math.min(k, n - k);
  let result = 1;
  for (let index = 1; index <= count; index++) result = (result * (n - count + index)) / index;
  return Math.round(result);
}

function fPdfApprox(x: number, d1: number, d2: number): number {
  if (x <= 0) return 0;
  const numerator = Math.pow(d1 * x, d1) * Math.pow(d2, d2);
  const denominator = Math.pow(d1 * x + d2, d1 + d2);
  return Math.sqrt(numerator / denominator) / (x * Math.exp(lgamma(d1 / 2) + lgamma(d2 / 2) - lgamma((d1 + d2) / 2)));
}

function stdev(
  args: Args,
  ctx: EvalContext,
  sample: boolean,
  aMode: boolean,
  squared: boolean,
): Value {
  const values = collect(args, ctx, aMode ? 'a' : 'numbers');
  if (sample && values.length < 2) return error(ErrorCode.div0);
  if (!values.length) return error(ErrorCode.div0);
  const result = variance(values, sample);
  return numeric(squared ? result : Math.sqrt(result));
}

function rankArgs(args: Args, ctx: EvalContext, average: boolean): Value {
  const target = args.number(0);
  const values = numbers(args, ctx, NUMBER_MODES.average, 1, 2);
  const order = args.isMissing(2) ? 0 : Math.trunc(args.number(2));
  const result = rankOf(values, target, order !== 0, average);
  return isError(result) ? result : result;
}

function correlation(args: Args, ctx: EvalContext): Value {
  const { x, y } = collectPairs(args, ctx);
  if (x.length !== y.length || x.length < 2) return error(ErrorCode.div0);
  const mx = mean(x),
    my = mean(y);
  let numerator = 0,
    sx = 0,
    sy = 0;
  for (let index = 0; index < x.length; index++) {
    numerator += (x[index]! - mx) * (y[index]! - my);
    sx += (x[index]! - mx) ** 2;
    sy += (y[index]! - my) ** 2;
  }
  if (sx === 0 || sy === 0) return error(ErrorCode.div0);
  return numeric(numerator / Math.sqrt(sx * sy));
}

function covariance(args: Args, ctx: EvalContext, sample: boolean): Value {
  const { x, y } = collectPairs(args, ctx);
  if (x.length !== y.length || x.length < (sample ? 2 : 1)) return error(ErrorCode.div0);
  const mx = mean(x),
    my = mean(y);
  let sum = 0;
  for (let index = 0; index < x.length; index++) sum += (x[index]! - mx) * (y[index]! - my);
  return numeric(sum / (sample ? x.length - 1 : x.length));
}

function regressionWithArgs(
  args: Args,
  ctx: EvalContext,
  yIndex: number,
  xIndex: number,
  mode: 'slope' | 'intercept',
): number | CalcError {
  const xs = flattenValues(args, ctx, xIndex);
  const ys = flattenValues(args, ctx, yIndex);
  const size = Math.min(xs.length, ys.length);
  xs.length = size;
  ys.length = size;
  if (xs.length < 2) return error(ErrorCode.div0);
  const mx = mean(xs),
    my = mean(ys);
  let numerator = 0,
    denominator = 0;
  for (let index = 0; index < xs.length; index++) {
    numerator += (xs[index]! - mx) * (ys[index]! - my);
    denominator += (xs[index]! - mx) ** 2;
  }
  if (denominator === 0) return error(ErrorCode.div0);
  const slope = numerator / denominator;
  if (mode === 'slope') return slope;
  return my - slope * mx;
}

function regression(args: Args, ctx: EvalContext, mode: 'slope' | 'intercept'): Value {
  const result = regressionWithArgs(args, ctx, 0, 1, mode);
  return isError(result) ? result : numeric(result);
}

export { collect, mean, variance, percentile, binomialPmf };
export type { Worksheet, Value, ReferenceValue };
