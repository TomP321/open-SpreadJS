/** Additional statistical functions and legacy aliases. */
import { Args, EvalContext, raiseError } from '../evaluate.js';
import {
  CalcArray,
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
import { type DefinedFunction, define, entries } from './common.js';
import {
  betaInv,
  chiSquareCdf,
  chiSquareInv,
  fCdf,
  fInv,
  incompleteBeta,
  lgamma,
  normalCdf,
  normalInv,
} from './special.js';

function collectNumbers(args: Args, ctx: EvalContext, index: number): number[] {
  const values: number[] = [];
  for (const entry of entries(args, ctx, index)) {
    const value = entry.value;
    if (isError(value)) raiseError(value);
    if (typeof value === 'number') values.push(value);
    else if (value instanceof Date) values.push(dateToSerial(value));
    else if (typeof value === 'string') {
      const parsed = parseNumberText(value);
      if (parsed !== undefined) values.push(parsed);
    }
  }
  return values;
}

function alias(name: string, target: string, min: number, max: number): DefinedFunction {
  return {
    name,
    min,
    max,
    evaluate: (args, ctx) => {
      const source = getBuiltin(target);
      if (!source) return error(ErrorCode.name);
      return source.evaluate(args, ctx);
    },
  };
}

import { getBuiltin } from '../evaluate.js';

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function varianceOf(values: number[]): { variance: number; mean: number; ss: number } {
  const average = mean(values);
  let ss = 0;
  for (const value of values) ss += (value - average) ** 2;
  return { variance: ss / Math.max(1, values.length - 1), mean: average, ss };
}

function fisher(x: number): number {
  if (x <= -1 || x >= 1) return NaN;
  return 0.5 * Math.log((1 + x) / (1 - x));
}

function percentRank(values: number[], target: number, exclusive: boolean): number | CalcError {
  const sorted = [...values].sort((a, b) => a - b);
  if (!sorted.length) return error(ErrorCode.na);
  if (target < sorted[0]! || target > sorted[sorted.length - 1]!) return error(ErrorCode.na);
  let below = 0;
  for (const value of sorted) if (value < target) below++;
  const equal = sorted.filter((value) => value === target).length;
  if (exclusive) {
    if (equal > 0) return normalizeNumber((below + 1) / (sorted.length + 1));
    const above = sorted.length - below;
    return normalizeNumber((below + (target - sorted[below - 1]!) / (sorted[above]! - sorted[below - 1]!)) / (sorted.length + 1));
  }
  const fraction =
    equal > 0
      ? below / (sorted.length - 1)
      : below - 1 + (target - sorted[below - 1]!) / (sorted[below]! - sorted[below - 1]!);
  return normalizeNumber(equal > 0 ? below / (sorted.length - 1) : fraction / (sorted.length - 1));
}

interface Regression {
  slope: number;
  intercept: number;
  sse: number;
  ssr: number;
  points: number;
}

function regress(x: number[], y: number[], constant: boolean): Regression | CalcError {
  if (x.length !== y.length || x.length < 2) return error(ErrorCode.na);
  const n = x.length;
  const mx = mean(x);
  const my = mean(y);
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (let index = 0; index < n; index++) {
    sxx += (x[index]! - mx) ** 2;
    sxy += (x[index]! - mx) * (y[index]! - my);
    syy += (y[index]! - my) ** 2;
  }
  let slope: number;
  let intercept: number;
  if (constant) {
    if (sxx === 0) return error(ErrorCode.div0);
    slope = sxy / sxx;
    intercept = my - slope * mx;
  } else {
    let sxx0 = 0;
    let sxy0 = 0;
    for (let index = 0; index < n; index++) {
      sxx0 += x[index]! * x[index]!;
      sxy0 += x[index]! * y[index]!;
    }
    slope = sxx0 === 0 ? 0 : sxy0 / sxx0;
    intercept = 0;
  }
  let sse = 0;
  let ssr = 0;
  for (let index = 0; index < n; index++) {
    const predicted = slope * x[index]! + intercept;
    sse += (y[index]! - predicted) ** 2;
  }
  ssr = syy - sse;
  void constant;
  return { slope, intercept, sse, ssr, points: n };
}

export const STAT_EXTRA_FUNCTIONS: DefinedFunction[] = [
  define('GAUSS', 1, 1, (args) => normalizeNumber(normalCdf(args.number(0)) - 0.5)),
  define('FISHER', 1, 1, (args) => {
    const value = args.number(0);
    if (value <= -1 || value >= 1) return error(ErrorCode.num);
    return normalizeNumber(fisher(value));
  }),
  define('FISHERINV', 1, 1, (args) => normalizeNumber(Math.tanh(args.number(0)))),
  define('PERCENTRANK', 2, 3, (args, ctx) => {
    const values = collectNumbers(args, ctx, 0);
    const target = args.number(1);
    return percentRank(values, target, false);
  }),
  define('PERCENTRANK.INC', 2, 3, (args, ctx) => {
    const values = collectNumbers(args, ctx, 0);
    return percentRank(values, args.number(1), false);
  }),
  define('PERCENTRANK.EXC', 2, 3, (args, ctx) => {
    const values = collectNumbers(args, ctx, 0);
    return percentRank(values, args.number(1), true);
  }),
  define('PROB', 3, 4, (args, ctx) => {
    const values = collectNumbers(args, ctx, 0);
    const probabilities = collectNumbers(args, ctx, 1);
    if (values.length !== probabilities.length) return error(ErrorCode.na);
    const lower = args.number(2);
    const upper = args.isMissing(3) ? lower : args.number(3);
    let sum = 0;
    for (let index = 0; index < values.length; index++)
      if (values[index]! >= lower && values[index]! <= upper) sum += probabilities[index]!;
    return normalizeNumber(sum);
  }),
  define('STEYX', 2, 2, (args, ctx) => {
    const y = collectNumbers(args, ctx, 0);
    const x = collectNumbers(args, ctx, 1);
    const regression = regress(x, y, true);
    if (isError(regression)) return regression;
    if (regression.points < 3) return error(ErrorCode.div0);
    return normalizeNumber(Math.sqrt(regression.sse / (regression.points - 2)));
  }),
  define('LINEST', 1, 4, (args, ctx) => {
    const y = collectNumbers(args, ctx, 0);
    const x = args.isMissing(1) ? y.map((_, index) => index + 1) : collectNumbers(args, ctx, 1);
    const constant = args.isMissing(2) ? true : args.boolean(2);
    const stats = args.isMissing(3) ? false : args.boolean(3);
    const regression = regress(x, y, constant);
    if (isError(regression)) return regression;
    const n = regression.points;
    const rows: ScalarValue[][] = [[normalizeNumber(regression.slope), normalizeNumber(regression.intercept)]];
    if (stats) {
      const sey = n > 2 ? Math.sqrt(regression.sse / (n - 2)) : error(ErrorCode.na);
      const sxx = x.reduce((sum, value) => sum + value * value, 0) - (n * mean(x) ** 2);
      const seSlope = typeof sey === 'number' && sxx > 0 ? sey / Math.sqrt(sxx) : error(ErrorCode.na);
      const seIntercept =
        typeof sey === 'number'
          ? sey * Math.sqrt(1 / n + mean(x) ** 2 / (sxx || 1))
          : error(ErrorCode.na);
      const r2 = regression.ssr + regression.sse !== 0 ? regression.ssr / (regression.ssr + regression.sse) : error(ErrorCode.na);
      rows.push([seSlope, seIntercept]);
      rows.push([r2, sey]);
      rows.push([n - 2, regression.ssr]);
    }
    return new CalcArray(rows);
  }),
  define('LOGEST', 1, 4, (args, ctx) => {
    const yValues = collectNumbers(args, ctx, 0);
    if (yValues.some((value) => value <= 0)) return error(ErrorCode.num);
    const x = args.isMissing(1)
      ? yValues.map((_, index) => index + 1)
      : collectNumbers(args, ctx, 1);
    const constant = args.isMissing(2) ? true : args.boolean(2);
    const y = yValues.map((value) => Math.log(value));
    const regression = regress(x, y, constant);
    if (isError(regression)) return regression;
    const rows: ScalarValue[][] = [
      [normalizeNumber(Math.exp(regression.slope)), normalizeNumber(Math.exp(regression.intercept))],
    ];
    return new CalcArray(rows);
  }),
  define('TREND', 1, 4, (args, ctx) => {
    const y = collectNumbers(args, ctx, 0);
    const x = args.isMissing(1) ? y.map((_, index) => index + 1) : collectNumbers(args, ctx, 1);
    const constant = args.isMissing(3) ? true : args.boolean(3);
    const regression = regress(x, y, constant);
    if (isError(regression)) return regression;
    const newX = args.isMissing(2) ? x : collectNumbers(args, ctx, 2);
    return new CalcArray(newX.map((value) => [normalizeNumber(regression.slope * value + regression.intercept)]));
  }),
  define('GROWTH', 1, 4, (args, ctx) => {
    const yValues = collectNumbers(args, ctx, 0);
    if (yValues.some((value) => value <= 0)) return error(ErrorCode.num);
    const x = args.isMissing(1)
      ? yValues.map((_, index) => index + 1)
      : collectNumbers(args, ctx, 1);
    const constant = args.isMissing(3) ? true : args.boolean(3);
    const regression = regress(x, yValues.map((value) => Math.log(value)), constant);
    if (isError(regression)) return regression;
    const newX = args.isMissing(2) ? x : collectNumbers(args, ctx, 2);
    return new CalcArray(
      newX.map((value) => [normalizeNumber(Math.exp(regression.slope * value + regression.intercept))]),
    );
  }),
  define('T.TEST', 4, 4, (args, ctx) => tTest(args, ctx)),
  define('TTEST', 4, 4, (args, ctx) => tTest(args, ctx)),
  define('F.TEST', 2, 2, (args, ctx) => {
    const left = collectNumbers(args, ctx, 0);
    const right = collectNumbers(args, ctx, 1);
    if (left.length < 2 || right.length < 2) return error(ErrorCode.div0);
    const a = varianceOf(left).variance;
    const b = varianceOf(right).variance;
    if (a === 0 || b === 0) return error(ErrorCode.div0);
    const f = a / b;
    const p = 2 * Math.min(fCdf(f, left.length - 1, right.length - 1), 1 - fCdf(f, left.length - 1, right.length - 1));
    return normalizeNumber(p);
  }),
  define('FTEST', 2, 2, (args, ctx) => {
    const left = collectNumbers(args, ctx, 0);
    const right = collectNumbers(args, ctx, 1);
    if (left.length < 2 || right.length < 2) return error(ErrorCode.div0);
    const a = varianceOf(left).variance;
    const b = varianceOf(right).variance;
    if (a === 0 || b === 0) return error(ErrorCode.div0);
    const f = a / b;
    return normalizeNumber(
      2 * Math.min(fCdf(f, left.length - 1, right.length - 1), 1 - fCdf(f, left.length - 1, right.length - 1)),
    );
  }),
  define('CHISQ.TEST', 2, 2, (args, ctx) => chiTest(args, ctx)),
  define('CHITEST', 2, 2, (args, ctx) => chiTest(args, ctx)),
  define('Z.TEST', 2, 3, (args, ctx) => {
    const values = collectNumbers(args, ctx, 0);
    if (!values.length) return error(ErrorCode.na);
    const target = args.number(1);
    const sigma = args.isMissing(2) ? Math.sqrt(varianceOf(values).variance) : args.number(2);
    if (sigma <= 0) return error(ErrorCode.div0);
    const z = (mean(values) - target) / (sigma / Math.sqrt(values.length));
    return normalizeNumber(1 - normalCdf(z));
  }),
  define('ZTEST', 2, 3, (args, ctx) => {
    const values = collectNumbers(args, ctx, 0);
    if (!values.length) return error(ErrorCode.na);
    const target = args.number(1);
    const sigma = args.isMissing(2) ? Math.sqrt(varianceOf(values).variance) : args.number(2);
    if (sigma <= 0) return error(ErrorCode.div0);
    return normalizeNumber(1 - normalCdf((mean(values) - target) / (sigma / Math.sqrt(values.length))));
  }),
  alias('BETADIST', 'BETA.DIST', 3, 5),
  alias('BETAINV', 'BETA.INV', 3, 5),
  alias('CHIDIST', 'CHISQ.DIST.RT', 2, 2),
  alias('CHIINV', 'CHISQ.INV.RT', 2, 2),
  alias('COVAR', 'COVARIANCE.P', 2, 2),
  alias('FDIST', 'F.DIST.RT', 3, 3),
  alias('FINV', 'F.INV.RT', 3, 3),
  alias('HYPGEOMDIST', 'HYPGEOM.DIST', 4, 4),
  alias('WEIBULL', 'WEIBULL.DIST', 4, 4),
  alias('LOGNORMDIST', 'LOGNORM.DIST', 1, 3),
  define('LOGINV', 3, 3, (args) => {
    const p = args.number(0);
    const meanValue = args.number(1);
    const sd = args.number(2);
    if (p <= 0 || p > 1 || sd <= 0) return error(ErrorCode.num);
    return normalizeNumber(Math.exp(meanValue + sd * normalInv(p)));
  }),
  define('NEGBINOMDIST', 3, 3, (args) => {
    const failures = Math.trunc(args.number(0));
    const successes = Math.trunc(args.number(1));
    const p = args.number(2);
    if (failures < 0 || successes < 1 || p <= 0 || p > 1) return error(ErrorCode.num);
    const combination = combinations(failures + successes - 1, failures);
    return normalizeNumber(combination * Math.pow(p, successes) * Math.pow(1 - p, failures));
  }),
  define('BINOM.DIST.RANGE', 3, 4, (args) => {
    const trials = Math.trunc(args.number(0));
    const p = args.number(1);
    const successes = Math.trunc(args.number(2));
    const upper = args.isMissing(3) ? successes : Math.trunc(args.number(3));
    if (trials < 0 || p < 0 || p > 1 || successes < 0 || upper > trials) return error(ErrorCode.num);
    let sum = 0;
    for (let k = successes; k <= upper; k++)
      sum += combinations(trials, k) * Math.pow(p, k) * Math.pow(1 - p, trials - k);
    return normalizeNumber(sum);
  }),
  define('BETADIST', 3, 5, (args) => {
    const x = args.number(0);
    const alpha = args.number(1);
    const beta = args.number(2);
    const lower = args.isMissing(3) ? 0 : args.number(3);
    const upper = args.isMissing(4) ? 1 : args.number(4);
    if (alpha <= 0 || beta <= 0 || upper <= lower) return error(ErrorCode.num);
    const normalized = (x - lower) / (upper - lower);
    if (normalized < 0 || normalized > 1) return error(ErrorCode.num);
    return normalizeNumber(incompleteBeta(normalized, alpha, beta));
  }),
  define('BETAINV', 3, 5, (args) => {
    const p = args.number(0);
    const alpha = args.number(1);
    const beta = args.number(2);
    const lower = args.isMissing(3) ? 0 : args.number(3);
    const upper = args.isMissing(4) ? 1 : args.number(4);
    if (p <= 0 || p >= 1 || alpha <= 0 || beta <= 0) return error(ErrorCode.num);
    return normalizeNumber(lower + (upper - lower) * betaInv(p, alpha, beta));
  }),
  define('CHIDIST', 2, 2, (args) => {
    const x = args.number(0);
    const df = Math.trunc(args.number(1));
    if (x < 0 || df < 1) return error(ErrorCode.num);
    return normalizeNumber(1 - chiSquareCdf(x, df));
  }),
  define('CHIINV', 2, 2, (args) => {
    const p = args.number(0);
    const df = Math.trunc(args.number(1));
    if (p <= 0 || p > 1 || df < 1) return error(ErrorCode.num);
    return normalizeNumber(chiSquareInv(1 - p, df));
  }),
  define('FDIST', 3, 3, (args) => {
    const x = args.number(0);
    const d1 = Math.trunc(args.number(1));
    const d2 = Math.trunc(args.number(2));
    if (x < 0 || d1 < 1 || d2 < 1) return error(ErrorCode.num);
    return normalizeNumber(1 - fCdf(x, d1, d2));
  }),
  define('FINV', 3, 3, (args) => {
    const p = args.number(0);
    const d1 = Math.trunc(args.number(1));
    const d2 = Math.trunc(args.number(2));
    if (p <= 0 || p > 1 || d1 < 1 || d2 < 1) return error(ErrorCode.num);
    return normalizeNumber(fInv(1 - p, d1, d2));
  }),
  define('HYPGEOMDIST', 4, 4, (args) => {
    const sampleSuccesses = Math.trunc(args.number(0));
    const sampleSize = Math.trunc(args.number(1));
    const populationSuccesses = Math.trunc(args.number(2));
    const populationSize = Math.trunc(args.number(3));
    return normalizeNumber(
      (combinations(populationSuccesses, sampleSuccesses) *
        combinations(populationSize - populationSuccesses, sampleSize - sampleSuccesses)) /
        combinations(populationSize, sampleSize),
    );
  }),
  define('WEIBULL', 4, 4, (args) => {
    const x = args.number(0);
    const shape = args.number(1);
    const scale = args.number(2);
    if (x < 0 || shape <= 0 || scale <= 0) return error(ErrorCode.num);
    if (args.boolean(3)) return normalizeNumber(1 - Math.exp(-Math.pow(x / scale, shape)));
    return normalizeNumber((shape / scale) * Math.pow(x / scale, shape - 1) * Math.exp(-Math.pow(x / scale, shape)));
  }),
  define('LOGNORMDIST', 1, 3, (args) => {
    const x = args.number(0);
    const meanValue = args.isMissing(1) ? 0 : args.number(1);
    const sd = args.isMissing(2) ? 1 : args.number(2);
    if (x <= 0 || sd <= 0) return error(ErrorCode.num);
    return normalizeNumber(normalCdf((Math.log(x) - meanValue) / sd));
  }),
  define('GAMMADIST', 4, 4, (args) => {
    const x = args.number(0);
    const alpha = args.number(1);
    const beta = args.number(2);
    if (x < 0 || alpha <= 0 || beta <= 0) return error(ErrorCode.num);
    if (args.boolean(3)) {
      let sum = 0;
      const a = alpha;
      const value = x / beta;
      // Regularized lower incomplete gamma via series.
      let term = 1 / a;
      let total = term;
      let n = a;
      for (let iteration = 0; iteration < 1000; iteration++) {
        n += 1;
        term *= value / n;
        total += term;
        if (Math.abs(term) < Math.abs(total) * 1e-16) break;
      }
      sum = total * Math.exp(-value + a * Math.log(value) - lgamma(a));
      return normalizeNumber(sum);
    }
    return normalizeNumber(
      Math.exp((alpha - 1) * Math.log(x) - x / beta - lgamma(alpha) - alpha * Math.log(beta)),
    );
  }),
  define('GAMMAINV', 3, 3, (args) => {
    const p = args.number(0);
    const alpha = args.number(1);
    const beta = args.number(2);
    if (p <= 0 || p >= 1 || alpha <= 0 || beta <= 0) return error(ErrorCode.num);
    let low = 0;
    let high = Math.max(1, alpha * beta * 10);
    for (let iteration = 0; iteration < 200; iteration++) {
      const mid = (low + high) / 2;
      if (gammaCdf(mid, alpha, beta) < p) low = mid;
      else high = mid;
    }
    return normalizeNumber((low + high) / 2);
  }),
  define('GAMMALN.PRECISE', 1, 1, (args) => {
    const x = args.number(0);
    if (x <= 0) return error(ErrorCode.num);
    return normalizeNumber(lgamma(x));
  }),
];

function gammaCdf(x: number, alpha: number, beta: number): number {
  if (x <= 0) return 0;
  const value = x / beta;
  let term = 1 / alpha;
  let total = term;
  let n = alpha;
  for (let iteration = 0; iteration < 1000; iteration++) {
    n += 1;
    term *= value / n;
    total += term;
    if (Math.abs(term) < Math.abs(total) * 1e-16) break;
  }
  return total * Math.exp(-value + alpha * Math.log(value) - lgamma(alpha));
}

function combinations(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  const count = Math.min(k, n - k);
  let result = 1;
  for (let index = 1; index <= count; index++) result = (result * (n - count + index)) / index;
  return Math.round(result);
}

function tTest(args: Args, ctx: EvalContext): Value {
  const left = collectNumbers(args, ctx, 0);
  const right = collectNumbers(args, ctx, 1);
  const tails = Math.trunc(args.number(2));
  const type = Math.trunc(args.number(3));
  if (tails !== 1 && tails !== 2) return error(ErrorCode.num);
  if (left.length < 2 || right.length < 2) return error(ErrorCode.div0);
  const n1 = left.length;
  const n2 = right.length;
  let statistic: number;
  let df: number;
  if (type === 1) {
    if (n1 !== n2) return error(ErrorCode.na);
    const differences = left.map((value, index) => value - right[index]!);
    const stats = varianceOf(differences);
    if (stats.variance === 0) return error(ErrorCode.div0);
    statistic = stats.mean / Math.sqrt(stats.variance / n1);
    df = n1 - 1;
  } else if (type === 2) {
    const v1 = varianceOf(left).variance;
    const v2 = varianceOf(right).variance;
    df = n1 + n2 - 2;
    statistic = (mean(left) - mean(right)) / Math.sqrt(((n1 - 1) * v1 + (n2 - 1) * v2) / df) / Math.sqrt(1 / n1 + 1 / n2);
  } else if (type === 3) {
    const v1 = varianceOf(left).variance / n1;
    const v2 = varianceOf(right).variance / n2;
    statistic = (mean(left) - mean(right)) / Math.sqrt(v1 + v2);
    df = (v1 + v2) ** 2 / (v1 ** 2 / (n1 - 1) + v2 ** 2 / (n2 - 1));
  } else return error(ErrorCode.num);
  const probability = tCdfTwoTailed(statistic, df);
  return normalizeNumber(tails === 1 ? probability / 2 : probability);
}

function tCdfTwoTailed(t: number, df: number): number {
  // 2 * P(T > |t|)
  const x = df / (df + t * t);
  return incompleteBeta(x, df / 2, 0.5);
}

function chiTest(args: Args, _ctx: EvalContext): Value {
  const observed = args.array(0);
  const expected = args.array(1);
  if (observed.rowCount !== expected.rowCount || observed.colCount !== expected.colCount)
    return error(ErrorCode.na);
  let statistic = 0;
  for (let row = 0; row < observed.rowCount; row++)
    for (let col = 0; col < observed.colCount; col++) {
      const o = observed.at(row, col);
      const e = expected.at(row, col);
      if (typeof o !== 'number' || typeof e !== 'number' || e === 0) continue;
      statistic += (o - e) ** 2 / e;
    }
  const df = (observed.rowCount - 1) * (observed.colCount - 1);
  if (df < 1) return error(ErrorCode.na);
  return normalizeNumber(1 - chiSquareCdf(statistic, df));
}

export { collectNumbers, regress, percentRank, gammaCdf };
