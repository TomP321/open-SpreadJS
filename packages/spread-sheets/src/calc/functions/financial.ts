/** Financial functions. */
import { Args, EvalContext, raiseError } from '../evaluate.js';
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
import { type DefinedFunction, define, entries } from './common.js';

function collectValues(args: Args, ctx: EvalContext, index: number): number[] {
  const values: number[] = [];
  for (const entry of entries(args, ctx, index)) {
    const value = entry.value;
    if (isError(value)) raiseError(value);
    if (value === null) values.push(0);
    else if (typeof value === 'number') values.push(value);
    else if (value instanceof Date) values.push(dateToSerial(value));
    else if (typeof value === 'boolean') values.push(value ? 1 : 0);
    else if (typeof value === 'string') {
      const parsed = parseNumberText(value);
      if (parsed !== undefined) values.push(parsed);
    }
  }
  return values;
}

function optional(args: Args, index: number, fallback: number): number {
  return args.isMissing(index) ? fallback : args.number(index);
}

function pow(base: number, exponent: number): number {
  return Math.pow(base, exponent);
}

function pmt(rate: number, nper: number, pv: number, fv: number, type: number): number {
  if (nper === 0) return error(ErrorCode.num) as unknown as number;
  if (rate === 0) return -(pv + fv) / nper;
  const factor = pow(1 + rate, nper);
  return (-(pv * factor + fv) * rate) / ((1 + rate * type) * (factor - 1));
}

function fv(rate: number, nper: number, payment: number, pv: number, type: number): number {
  if (rate === 0) return -(pv + payment * nper);
  const factor = pow(1 + rate, nper);
  return -(pv * factor + payment * (1 + rate * type) * ((factor - 1) / rate));
}

function pv(rate: number, nper: number, payment: number, fvValue: number, type: number): number {
  if (rate === 0) return -payment * nper - fvValue;
  const factor = pow(1 + rate, nper);
  return -(fvValue + payment * (1 + rate * type) * ((factor - 1) / rate)) / factor;
}

function nper(rate: number, payment: number, pvValue: number, fvValue: number, type: number): number {
  if (rate === 0) return -(pvValue + fvValue) / payment;
  const numerator = payment * (1 + rate * type) - fvValue * rate;
  const denominator = pvValue * rate + payment * (1 + rate * type);
  return Math.log(numerator / denominator) / Math.log(1 + rate);
}

function solveRate(
  nperValue: number,
  payment: number,
  pvValue: number,
  fvValue: number,
  type: number,
  guess: number,
): number {
  let rate = guess;
  for (let iteration = 0; iteration < 100; iteration++) {
    const factor = pow(1 + rate, nperValue);
    const f = pvValue * factor + payment * (1 + rate * type) * ((factor - 1) / rate) + fvValue;
    const derivative =
      nperValue * pvValue * pow(1 + rate, nperValue - 1) +
      payment * (type * ((factor - 1) / rate) + (1 + rate * type) * ((nperValue * pow(1 + rate, nperValue - 1) * rate - (factor - 1)) / (rate * rate)));
    if (derivative === 0 || !Number.isFinite(f) || !Number.isFinite(derivative)) break;
    const next = rate - f / derivative;
    if (!Number.isFinite(next)) break;
    if (Math.abs(next - rate) < 1e-15) {
      rate = next;
      break;
    }
    rate = next;
  }
  return rate;
}

function irr(values: number[], guess: number): number {
  let rate = guess;
  for (let iteration = 0; iteration < 200; iteration++) {
    let f = 0;
    let derivative = 0;
    for (let index = 0; index < values.length; index++) {
      const factor = Math.pow(1 + rate, index);
      f += values[index]! / factor;
      if (index > 0) derivative -= (index * values[index]!) / Math.pow(1 + rate, index + 1);
    }
    if (Math.abs(f) < 1e-14) break;
    if (derivative === 0 || !Number.isFinite(f) || !Number.isFinite(derivative)) break;
    const next = rate - f / derivative;
    if (!Number.isFinite(next) || next <= -1) break;
    if (Math.abs(next - rate) < 1e-15) {
      rate = next;
      break;
    }
    rate = next;
  }
  return rate;
}

function xnpv(rate: number, values: number[], dates: number[]): number {
  let sum = 0;
  const first = dates[0]!;
  for (let index = 0; index < values.length; index++) {
    sum += values[index]! / Math.pow(1 + rate, (dates[index]! - first) / 365);
  }
  return sum;
}

function xirr(values: number[], dates: number[]): number {
  let rate = 0.1;
  for (let iteration = 0; iteration < 200; iteration++) {
    const f = xnpv(rate, values, dates);
    if (Math.abs(f) < 1e-12) break;
    const delta = 1e-6;
    const slope = (xnpv(rate + delta, values, dates) - xnpv(rate - delta, values, dates)) / (2 * delta);
    if (!Number.isFinite(slope) || slope === 0) break;
    const next = rate - f / slope;
    if (!Number.isFinite(next) || next <= -1) break;
    if (Math.abs(next - rate) < 1e-14) {
      rate = next;
      break;
    }
    rate = next;
  }
  return rate;
}

function ipmtValue(rate: number, period: number, nperValue: number, pvValue: number, fvValue: number, type: number): number {
  const payment = pmt(rate, nperValue, pvValue, fvValue, type);
  if (type !== 0 && period === 1) return 0;
  const offset = type !== 0 ? period - 1 : period - 1;
  const balance = pvValue * pow(1 + rate, offset) + payment * ((pow(1 + rate, offset) - 1) / rate);
  if (type !== 0) return -balance * rate;
  return -(balance + payment) * rate * 0 - balance * rate;
}

function dbDepreciation(cost: number, salvage: number, life: number, period: number): number {
  const rate = Math.round((1 - Math.pow(salvage / cost, 1 / life)) * 1000) / 1000;
  let total = 0;
  let depreciation = 0;
  for (let current = 1; current <= period; current++) {
    depreciation = current === 1 ? cost * rate : (cost - total) * rate;
    total += depreciation;
  }
  return depreciation;
}

function ddbDepreciation(cost: number, salvage: number, life: number, period: number, factor: number): number {
  let value = cost;
  let depreciation = 0;
  for (let current = 1; current <= period; current++) {
    depreciation = Math.min(value * (factor / life), Math.max(0, value - salvage));
    value -= depreciation;
  }
  return depreciation;
}

function vdbDepreciation(
  cost: number,
  salvage: number,
  life: number,
  start: number,
  end: number,
  factor: number,
  noSwitch: boolean,
): number {
  const totalPeriods = Math.ceil(end) - Math.floor(start);
  let value = cost;
  let total = 0;
  const startPeriod = Math.floor(start);
  const endPeriod = Math.ceil(end);
  let switched = noSwitch;
  for (let period = 0; period < endPeriod; period++) {
    let depreciation = Math.min(value * (factor / life), Math.max(0, value - salvage));
    if (!switched) {
      const straight = (value - salvage) / (life - period);
      if (straight > depreciation) {
        depreciation = straight;
        switched = true;
      }
    }
    if (period >= startPeriod) total += depreciation;
    value -= depreciation;
  }
  void totalPeriods;
  return total;
}

export const FINANCIAL_FUNCTIONS: DefinedFunction[] = [
  define('PMT', 3, 5, (args) => numericOrError(pmt(args.number(0), args.number(1), args.number(2), optional(args, 3, 0), optional(args, 4, 0)))),
  define('FV', 3, 5, (args) => numericOrError(fv(args.number(0), args.number(1), args.number(2), optional(args, 3, 0), optional(args, 4, 0)))),
  define('PV', 3, 5, (args) => numericOrError(pv(args.number(0), args.number(1), args.number(2), optional(args, 3, 0), optional(args, 4, 0)))),
  define('NPER', 3, 5, (args) => numericOrError(nper(args.number(0), args.number(1), args.number(2), optional(args, 3, 0), optional(args, 4, 0)))),
  define('RATE', 3, 6, (args) => {
    const result = solveRate(args.number(0), args.number(1), args.number(2), optional(args, 3, 0), optional(args, 4, 0), optional(args, 5, 0.1));
    return numericOrError(result);
  }),
  define('NPV', 2, 255, (args, ctx) => {
    const rate = args.number(0);
    const values: number[] = [];
    for (let index = 1; index < args.count; index++) values.push(...collectValues(args, ctx, index));
    let sum = 0;
    for (let index = 0; index < values.length; index++) sum += values[index]! / Math.pow(1 + rate, index + 1);
    return numericOrError(sum);
  }),
  define('IRR', 1, 2, (args, ctx) => {
    const values = collectValues(args, ctx, 0);
    if (!values.some((value) => value > 0) || !values.some((value) => value < 0)) return error(ErrorCode.num);
    return numericOrError(irr(values, optional(args, 1, 0.1)));
  }),
  define('XNPV', 3, 3, (args, ctx) => {
    const rate = args.number(0);
    const values = collectValues(args, ctx, 1);
    const dates = collectValues(args, ctx, 2).map((value) => Math.floor(value));
    if (values.length !== dates.length) return error(ErrorCode.num);
    return numericOrError(xnpv(rate, values, dates));
  }),
  define('XIRR', 2, 3, (args, ctx) => {
    const values = collectValues(args, ctx, 0);
    const dates = collectValues(args, ctx, 1).map((value) => Math.floor(value));
    if (values.length !== dates.length) return error(ErrorCode.num);
    return numericOrError(xirr(values, dates));
  }),
  define('IPMT', 4, 6, (args) => {
    const rate = args.number(0);
    const period = args.number(1);
    const nperValue = args.number(2);
    const present = args.number(3);
    if (period < 1 || period > nperValue) return error(ErrorCode.num);
    return numericOrError(ipmtValue(rate, period, nperValue, present, optional(args, 4, 0), optional(args, 5, 0)));
  }),
  define('PPMT', 4, 6, (args) => {
    const rate = args.number(0);
    const period = args.number(1);
    const nperValue = args.number(2);
    const present = args.number(3);
    if (period < 1 || period > nperValue) return error(ErrorCode.num);
    const interest = ipmtValue(rate, period, nperValue, present, optional(args, 4, 0), optional(args, 5, 0));
    return numericOrError(pmt(rate, nperValue, present, optional(args, 4, 0), optional(args, 5, 0)) - interest);
  }),
  define('CUMIPMT', 6, 6, (args) => {
    const rate = args.number(0);
    const nperValue = args.number(1);
    const present = args.number(2);
    const start = Math.trunc(args.number(3));
    const end = Math.trunc(args.number(4));
    const type = Math.trunc(args.number(5));
    if (start < 1 || end > nperValue || start > end) return error(ErrorCode.num);
    let sum = 0;
    for (let period = start; period <= end; period++)
      sum += ipmtValue(rate, period, nperValue, present, 0, type);
    return numericOrError(sum);
  }),
  define('CUMPRINC', 6, 6, (args) => {
    const rate = args.number(0);
    const nperValue = args.number(1);
    const present = args.number(2);
    const start = Math.trunc(args.number(3));
    const end = Math.trunc(args.number(4));
    const type = Math.trunc(args.number(5));
    if (start < 1 || end > nperValue || start > end) return error(ErrorCode.num);
    let sum = 0;
    for (let period = start; period <= end; period++)
      sum += pmt(rate, nperValue, present, 0, type) - ipmtValue(rate, period, nperValue, present, 0, type);
    return numericOrError(sum);
  }),
  define('SLN', 3, 3, (args) => {
    const life = args.number(2);
    if (life === 0) return error(ErrorCode.div0);
    return numericOrError((args.number(0) - args.number(1)) / life);
  }),
  define('SYD', 4, 4, (args) => {
    const cost = args.number(0);
    const salvage = args.number(1);
    const life = args.number(2);
    const period = args.number(3);
    if (life <= 0) return error(ErrorCode.num);
    return numericOrError(((cost - salvage) * (life - period + 1) * 2) / (life * (life + 1)));
  }),
  define('DDB', 4, 5, (args) => {
    const cost = args.number(0);
    const salvage = args.number(1);
    const life = args.number(2);
    const period = args.number(3);
    if (life <= 0) return error(ErrorCode.num);
    return numericOrError(ddbDepreciation(cost, salvage, life, period, optional(args, 4, 2)));
  }),
  define('DB', 4, 5, (args) => {
    const cost = args.number(0);
    const salvage = args.number(1);
    const life = args.number(2);
    const period = Math.trunc(args.number(3));
    if (life <= 0) return error(ErrorCode.num);
    return numericOrError(dbDepreciation(cost, salvage, life, period));
  }),
  define('VDB', 5, 7, (args) => {
    const cost = args.number(0);
    const salvage = args.number(1);
    const life = args.number(2);
    const start = args.number(3);
    const end = args.number(4);
    return numericOrError(
      vdbDepreciation(cost, salvage, life, start, end, optional(args, 5, 2), args.isMissing(6) ? false : args.boolean(6)),
    );
  }),
  define('EFFECT', 2, 2, (args) => {
    const nominal = args.number(0);
    const periods = Math.trunc(args.number(1));
    if (nominal <= 0 || periods < 1) return error(ErrorCode.num);
    return numericOrError(Math.pow(1 + nominal / periods, periods) - 1);
  }),
  define('NOMINAL', 2, 2, (args) => {
    const effect = args.number(0);
    const periods = Math.trunc(args.number(1));
    if (effect <= 0 || periods < 1) return error(ErrorCode.num);
    return numericOrError(periods * (Math.pow(1 + effect, 1 / periods) - 1));
  }),
  define('MIRR', 3, 3, (args, ctx) => {
    const values = collectValues(args, ctx, 0);
    const financeRate = args.number(1);
    const reinvestRate = args.number(2);
    if (!values.some((value) => value > 0) || !values.some((value) => value < 0)) return error(ErrorCode.div0);
    const n = values.length;
    let positive = 0;
    let negative = 0;
    for (let index = 0; index < n; index++) {
      if (values[index]! > 0) positive += values[index]! * Math.pow(1 + reinvestRate, n - 1 - index);
      else negative += values[index]! / Math.pow(1 + financeRate, index);
    }
    if (negative === 0) return error(ErrorCode.div0);
    return numericOrError(Math.pow(positive / -negative, 1 / (n - 1)) - 1);
  }),
  define('DOLLARDE', 2, 2, (args) => {
    const dollar = args.number(0);
    const fraction = Math.trunc(args.number(1));
    if (fraction < 1) return error(ErrorCode.num);
    if (fraction === 1) return dollar;
    const sign = dollar < 0 ? -1 : 1;
    const absolute = Math.abs(dollar);
    const integer = Math.floor(absolute);
    const digits = Math.round((absolute - integer) * Math.pow(10, Math.ceil(Math.log10(fraction))));
    return numericOrError(sign * (integer + digits / fraction));
  }),
  define('DOLLARFR', 2, 2, (args) => {
    const dollar = args.number(0);
    const fraction = Math.trunc(args.number(1));
    if (fraction < 1) return error(ErrorCode.num);
    if (fraction === 1) return dollar;
    const sign = dollar < 0 ? -1 : 1;
    const absolute = Math.abs(dollar);
    const integer = Math.floor(absolute);
    const decimals = absolute - integer;
    return numericOrError(sign * (integer + (decimals * fraction) / Math.pow(10, Math.ceil(Math.log10(fraction)))));
  }),
  define('PDURATION', 3, 3, (args) => {
    const rate = args.number(0);
    const present = args.number(1);
    const future = args.number(2);
    if (rate <= 0 || present <= 0 || future <= 0) return error(ErrorCode.num);
    return numericOrError((Math.log(future) - Math.log(present)) / Math.log(1 + rate));
  }),
  define('RRI', 3, 3, (args) => {
    const periods = args.number(0);
    const present = args.number(1);
    const future = args.number(2);
    if (periods <= 0 || present <= 0 || future <= 0) return error(ErrorCode.num);
    return numericOrError(Math.pow(future / present, 1 / periods) - 1);
  }),
  define('ISPMT', 4, 4, (args) => {
    const rate = args.number(0);
    const period = args.number(1);
    const nperValue = args.number(2);
    const present = args.number(3);
    return numericOrError((present * rate * (period - nperValue)) / nperValue);
  }),
  define('FVSCHEDULE', 2, 2, (args, ctx) => {
    const principal = args.number(0);
    const rates = collectValues(args, ctx, 1);
    let value = principal;
    for (const rate of rates) value *= 1 + rate;
    return numericOrError(value);
  }),
];

function numericOrError(value: number): number | CalcError {
  if (!Number.isFinite(value) || Number.isNaN(value)) return error(ErrorCode.num);
  return normalizeNumber(value);
}

export { numericOrError, collectValues, pmt, fv, pv, nper, irr, xirr };
export type { ReferenceValue, ScalarValue, Value, CalcArray };
