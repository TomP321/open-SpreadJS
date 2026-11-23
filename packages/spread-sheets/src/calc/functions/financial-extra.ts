/** Additional financial functions: coupons, bonds, discount instruments. */
import { Args} from '../evaluate.js';
import {
  CalcError,
  ErrorCode,
  ScalarValue,
  Value,
  dateToSerial,
  error,
  normalizeNumber,
  serialToDate,
} from '../values.js';
import { type DefinedFunction, define } from './common.js';
import { days360 } from './date.js';

const DAY = 86400000;

function serialOf(value: ScalarValue): number {
  if (typeof value === 'number') return value;
  if (value instanceof Date) return dateToSerial(value);
  return NaN;
}

function roundDate(serial: number): Date {
  return serialToDate(Math.round(serial));
}

function addMonths(date: Date, months: number): Date {
  const targetMonth = date.getMonth() + months;
  const year = date.getFullYear() + Math.floor(targetMonth / 12);
  const month = ((targetMonth % 12) + 12) % 12;
  const day = Math.min(date.getDate(), new Date(Date.UTC(year, month + 1, 0)).getUTCDate());
  return new Date(year, month, day);
}


function basisDays(start: Date, end: Date, basis: number): number {
  if (basis === 0) return days360(start, end, false);
  if (basis === 4) return days360(start, end, true);
  return Math.round(dateToSerial(end) - dateToSerial(start));
}

function yearBasis(basis: number, start: Date, end: Date): number {
  if (basis === 2) return 360;
  if (basis === 3) return 365;
  if (basis === 1) {
    const years = end.getFullYear() - start.getFullYear();
    if (years <= 0) return (end.getFullYear() % 4 === 0 ? 366 : 365);
    let total = 0;
    for (let year = start.getFullYear(); year <= end.getFullYear(); year++)
      total += (year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)) ? 366 : 365;
    return total / (years + 1);
  }
  return 360;
}

interface CouponSchedule {
  previous: Date;
  next: Date;
  periods: number;
  daysInPeriod: number;
  daysFromPrevious: number;
  daysToNext: number;
}

function couponSchedule(
  settlementSerial: number,
  maturitySerial: number,
  frequency: number,
  basis = 0,
): CouponSchedule | CalcError {
  if (frequency !== 1 && frequency !== 2 && frequency !== 4) return error(ErrorCode.num);
  const settlement = roundDate(settlementSerial);
  const maturity = roundDate(maturitySerial);
  if (settlement >= maturity) return error(ErrorCode.num);
  const months = 12 / frequency;
  let next = new Date(maturity);
  let periods = 0;
  let previous = new Date(addMonths(next, -months));
  while (previous > settlement) {
    next = previous;
    periods++;
    previous = addMonths(next, -months);
  }
  periods++;
  const thirty360 = basis === 0 || basis === 4;
  const daysInPeriod = thirty360 ? 360 / frequency : dateToSerial(next) - dateToSerial(previous);
  const daysFromPrevious = thirty360
    ? days360(previous, settlement, basis === 4)
    : dateToSerial(settlement) - dateToSerial(previous);
  const daysToNext = daysInPeriod - daysFromPrevious;
  return { previous, next, periods, daysInPeriod, daysFromPrevious, daysToNext };
}

function priceValue(
  settlementSerial: number,
  maturitySerial: number,
  rate: number,
  yieldRate: number,
  redemption: number,
  frequency: number,
  basis: number,
): number | CalcError {
  const schedule = couponSchedule(settlementSerial, maturitySerial, frequency, basis);
  if (isErr(schedule)) return schedule;
  const { periods, daysFromPrevious, daysInPeriod, daysToNext } = schedule;
  const basisDaysInPeriod = daysInPeriod;
  const accruedDays = daysFromPrevious;
  const periodsToNext = daysToNext / basisDaysInPeriod;
  const coupon = (100 * rate) / frequency;
  const discount = 1 + yieldRate / frequency;
  let price = redemption / Math.pow(discount, periods - 1 + periodsToNext);
  for (let period = 1; period <= periods; period++)
    price += coupon / Math.pow(discount, period - 1 + periodsToNext);
  price -= (coupon * accruedDays) / basisDaysInPeriod;
  return price;
}

function isErr(value: unknown): value is CalcError {
  return typeof value === 'object' && value !== null && 'error' in (value as object);
}
function yieldValue(
  settlementSerial: number,
  maturitySerial: number,
  rate: number,
  price: number,
  redemption: number,
  frequency: number,
  basis: number,
): number {
  let low = -0.99;
  let high = 4;
  for (let iteration = 0; iteration < 200; iteration++) {
    const mid = (low + high) / 2;
    const computed = priceValue(settlementSerial, maturitySerial, rate, mid, redemption, frequency, basis);
    if (isErr(computed)) return NaN;
    if (computed > price) low = mid;
    else high = mid;
  }
  return (low + high) / 2;
}

function durationValue(
  settlementSerial: number,
  maturitySerial: number,
  couponRate: number,
  yieldRate: number,
  frequency: number,
  basis: number,
): number | CalcError {
  const schedule = couponSchedule(settlementSerial, maturitySerial, frequency, basis);
  if (isErr(schedule)) return schedule;
  const { periods, daysToNext, daysInPeriod } = schedule;
  const periodsToNext = daysToNext / daysInPeriod;
  const coupon = (100 * couponRate) / frequency;
  const discount = 1 + yieldRate / frequency;
  let weighted = 0;
  let total = 0;
  for (let period = 1; period <= periods; period++) {
    const cashFlow = coupon + (period === periods ? 100 : 0);
    const pv = cashFlow / Math.pow(discount, period - 1 + periodsToNext);
    weighted += (period - 1 + periodsToNext) * pv;
    total += pv;
  }
  if (total === 0) return error(ErrorCode.num);
  return weighted / total / frequency;
}

function odds(
  args: Args,
  mode: 'price' | 'yield',
): Value {
  const settlement = serialOf(args.scalar(0));
  const maturity = serialOf(args.scalar(1));
  const issue = serialOf(args.scalar(2));
  const firstCoupon = serialOf(args.scalar(3));
  const rate = args.number(4);
  if (mode === 'price') {
    const yieldRate = args.number(5);
    const redemption = args.number(6);
    const frequency = Math.trunc(args.number(7));
    const basis = args.isMissing(8) ? 0 : Math.trunc(args.number(8));
    const value = priceValue(settlement, maturity, rate, yieldRate, redemption, frequency, basis);
    return isErr(value) ? value : numericResult(value);
  }
  const price = args.number(5);
  const redemption = args.number(6);
  const frequency = Math.trunc(args.number(7));
  const basis = args.isMissing(8) ? 0 : Math.trunc(args.number(8));
  const value = yieldValue(settlement, maturity, rate, price, redemption, frequency, basis);
  void issue;
  void firstCoupon;
  return numericResult(value);
}

function numericResult(value: number): number | CalcError {
  if (!Number.isFinite(value) || Number.isNaN(value)) return error(ErrorCode.num);
  return normalizeNumber(value);
}

export const FINANCIAL_EXTRA_FUNCTIONS: DefinedFunction[] = [
  define('COUPPCD', 3, 4, (args) => {
    const schedule = couponSchedule(serialOf(args.scalar(0)), serialOf(args.scalar(1)), Math.trunc(args.number(2)));
    return isErr(schedule) ? schedule : Math.round(dateToSerial(schedule.previous));
  }),
  define('COUPNCD', 3, 4, (args) => {
    const schedule = couponSchedule(serialOf(args.scalar(0)), serialOf(args.scalar(1)), Math.trunc(args.number(2)));
    return isErr(schedule) ? schedule : Math.round(dateToSerial(schedule.next));
  }),
  define('COUPNUM', 3, 4, (args) => {
    const schedule = couponSchedule(serialOf(args.scalar(0)), serialOf(args.scalar(1)), Math.trunc(args.number(2)));
    return isErr(schedule) ? schedule : schedule.periods;
  }),
  define('COUPDAYS', 3, 4, (args) => {
    const schedule = couponSchedule(serialOf(args.scalar(0)), serialOf(args.scalar(1)), Math.trunc(args.number(2)));
    return isErr(schedule) ? schedule : Math.round(schedule.daysInPeriod);
  }),
  define('COUPDAYBS', 3, 4, (args) => {
    const schedule = couponSchedule(serialOf(args.scalar(0)), serialOf(args.scalar(1)), Math.trunc(args.number(2)));
    return isErr(schedule) ? schedule : Math.round(schedule.daysFromPrevious);
  }),
  define('COUPDAYSNC', 3, 4, (args) => {
    const schedule = couponSchedule(serialOf(args.scalar(0)), serialOf(args.scalar(1)), Math.trunc(args.number(2)));
    return isErr(schedule) ? schedule : Math.round(schedule.daysToNext);
  }),
  define('PRICE', 6, 7, (args) => {
    const value = priceValue(
      serialOf(args.scalar(0)),
      serialOf(args.scalar(1)),
      args.number(2),
      args.number(3),
      args.number(4),
      Math.trunc(args.number(5)),
      args.isMissing(6) ? 0 : Math.trunc(args.number(6)),
    );
    return isErr(value) ? value : numericResult(value);
  }),
  define('YIELD', 6, 7, (args) => {
    const value = yieldValue(
      serialOf(args.scalar(0)),
      serialOf(args.scalar(1)),
      args.number(2),
      args.number(3),
      args.number(4),
      Math.trunc(args.number(5)),
      args.isMissing(6) ? 0 : Math.trunc(args.number(6)),
    );
    return numericResult(value);
  }),
  define('DURATION', 5, 6, (args) => {
    const value = durationValue(
      serialOf(args.scalar(0)),
      serialOf(args.scalar(1)),
      args.number(2),
      args.number(3),
      Math.trunc(args.number(4)),
      args.isMissing(5) ? 0 : Math.trunc(args.number(5)),
    );
    return isErr(value) ? value : numericResult(value);
  }),
  define('MDURATION', 5, 6, (args) => {
    const value = durationValue(
      serialOf(args.scalar(0)),
      serialOf(args.scalar(1)),
      args.number(2),
      args.number(3),
      Math.trunc(args.number(4)),
      args.isMissing(5) ? 0 : Math.trunc(args.number(5)),
    );
    if (isErr(value)) return value;
    return numericResult(value / (1 + args.number(3) / args.number(4)));
  }),
  define('DISC', 4, 5, (args) => {
    const settlement = roundDate(serialOf(args.scalar(0)));
    const maturity = roundDate(serialOf(args.scalar(1)));
    const price = args.number(2);
    const redemption = args.number(3);
    const basis = args.isMissing(4) ? 0 : Math.trunc(args.number(4));
    const days = basisDays(settlement, maturity, basis);
    if (days <= 0 || price <= 0 || redemption <= 0) return error(ErrorCode.num);
    return numericResult(((redemption - price) / redemption) * (yearBasis(basis, settlement, maturity) / days));
  }),
  define('INTRATE', 4, 5, (args) => {
    const settlement = roundDate(serialOf(args.scalar(0)));
    const maturity = roundDate(serialOf(args.scalar(1)));
    const investment = args.number(2);
    const redemption = args.number(3);
    const basis = args.isMissing(4) ? 0 : Math.trunc(args.number(4));
    const days = basisDays(settlement, maturity, basis);
    if (days <= 0) return error(ErrorCode.num);
    return numericResult(((redemption - investment) / investment) * (yearBasis(basis, settlement, maturity) / days));
  }),
  define('RECEIVED', 4, 5, (args) => {
    const settlement = roundDate(serialOf(args.scalar(0)));
    const maturity = roundDate(serialOf(args.scalar(1)));
    const investment = args.number(2);
    const discount = args.number(3);
    const basis = args.isMissing(4) ? 0 : Math.trunc(args.number(4));
    const days = basisDays(settlement, maturity, basis);
    const denominator = 1 - (discount * days) / yearBasis(basis, settlement, maturity);
    if (denominator === 0) return error(ErrorCode.num);
    return numericResult(investment / denominator);
  }),
  define('PRICEDISC', 4, 5, (args) => {
    const settlement = roundDate(serialOf(args.scalar(0)));
    const maturity = roundDate(serialOf(args.scalar(1)));
    const discount = args.number(2);
    const redemption = args.number(3);
    const basis = args.isMissing(4) ? 0 : Math.trunc(args.number(4));
    const days = basisDays(settlement, maturity, basis);
    return numericResult(redemption - (discount * redemption * days) / yearBasis(basis, settlement, maturity));
  }),
  define('YIELDDISC', 4, 5, (args) => {
    const settlement = roundDate(serialOf(args.scalar(0)));
    const maturity = roundDate(serialOf(args.scalar(1)));
    const price = args.number(2);
    const redemption = args.number(3);
    const basis = args.isMissing(4) ? 0 : Math.trunc(args.number(4));
    const days = basisDays(settlement, maturity, basis);
    if (days <= 0 || price <= 0) return error(ErrorCode.num);
    return numericResult(((redemption - price) / price) * (yearBasis(basis, settlement, maturity) / days));
  }),
  define('PRICEMAT', 5, 6, (args) => {
    const settlement = roundDate(serialOf(args.scalar(0)));
    const maturity = roundDate(serialOf(args.scalar(1)));
    const issue = roundDate(serialOf(args.scalar(2)));
    const rate = args.number(3);
    const yieldRate = args.number(4);
    const basis = args.isMissing(5) ? 0 : Math.trunc(args.number(5));
    const daysIssueToSettlement = basisDays(issue, settlement, basis);
    const daysIssueToMaturity = basisDays(issue, maturity, basis);
    const daysSettlementToMaturity = basisDays(settlement, maturity, basis);
    const b = yearBasis(basis, issue, maturity);
    const value =
      (100 + (rate * 100 * daysIssueToMaturity) / b) /
        (1 + (yieldRate * daysSettlementToMaturity) / b) -
      (rate * 100 * daysIssueToSettlement) / b;
    return numericResult(value);
  }),
  define('YIELDMAT', 5, 6, (args) => {
    const settlement = roundDate(serialOf(args.scalar(0)));
    const maturity = roundDate(serialOf(args.scalar(1)));
    const issue = roundDate(serialOf(args.scalar(2)));
    const rate = args.number(3);
    const price = args.number(4);
    const basis = args.isMissing(5) ? 0 : Math.trunc(args.number(5));
    const b = yearBasis(basis, issue, maturity);
    const dim = basisDays(issue, maturity, basis);
    const a = basisDays(issue, settlement, basis);
    const dsm = basisDays(settlement, maturity, basis);
    if (dsm <= 0) return error(ErrorCode.num);
    const value =
      ((100 + (rate * 100 * dim) / b) / (price + (rate * 100 * a) / b) - 1) * (b / dsm);
    return numericResult(value);
  }),
  define('TBILLPRICE', 3, 3, (args) => {
    const settlement = roundDate(serialOf(args.scalar(0)));
    const maturity = roundDate(serialOf(args.scalar(1)));
    const discount = args.number(2);
    const days = Math.round((maturity.getTime() - settlement.getTime()) / DAY);
    if (days <= 0 || days > 365) return error(ErrorCode.num);
    return numericResult(100 * (1 - (discount * days) / 360));
  }),
  define('TBILLYIELD', 3, 3, (args) => {
    const settlement = roundDate(serialOf(args.scalar(0)));
    const maturity = roundDate(serialOf(args.scalar(1)));
    const price = args.number(2);
    const days = Math.round((maturity.getTime() - settlement.getTime()) / DAY);
    if (days <= 0 || days > 365 || price <= 0) return error(ErrorCode.num);
    return numericResult(((100 - price) / price) * (360 / days));
  }),
  define('TBILLEQ', 3, 3, (args) => {
    const settlement = roundDate(serialOf(args.scalar(0)));
    const maturity = roundDate(serialOf(args.scalar(1)));
    const discount = args.number(2);
    const days = Math.round((maturity.getTime() - settlement.getTime()) / DAY);
    if (days <= 0 || days > 365) return error(ErrorCode.num);
    return numericResult((365 * discount) / (360 - discount * days));
  }),
  define('ACCRINTM', 3, 5, (args) => {
    const issue = roundDate(serialOf(args.scalar(0)));
    const settlement = roundDate(serialOf(args.scalar(1)));
    const rate = args.number(2);
    const par = args.isMissing(3) ? 1000 : args.number(3);
    const basis = args.isMissing(4) ? 0 : Math.trunc(args.number(4));
    const b = yearBasis(basis, issue, settlement);
    const days = basisDays(issue, settlement, basis);
    return numericResult((par * rate * days) / b);
  }),
  define('ACCRINT', 6, 8, (args) => {
    const issue = roundDate(serialOf(args.scalar(0)));
    const firstCoupon = roundDate(serialOf(args.scalar(1)));
    const settlement = roundDate(serialOf(args.scalar(2)));
    const rate = args.number(3);
    const par = args.isMissing(4) ? 1000 : args.number(4);
    const frequency = Math.trunc(args.number(5));
    const basis = args.isMissing(6) ? 0 : Math.trunc(args.number(6));
    const b = yearBasis(basis, issue, settlement);
    const months = 12 / frequency;
    let accrued = 0;
    let periodStart = new Date(issue);
    let periodEnd = new Date(firstCoupon);
    if (settlement <= firstCoupon) {
      const days = basisDays(issue, settlement, basis);
      return numericResult((par * rate * days) / b);
    }
    const coupon = (par * rate) / frequency;
    while (periodEnd <= settlement) {
      accrued += coupon;
      periodStart = periodEnd;
      periodEnd = addMonths(periodEnd, months);
    }
    accrued += (coupon * basisDays(periodStart, settlement, basis)) / basisDays(periodStart, periodEnd, basis);
    return numericResult(accrued);
  }),
  define('AMORLINC', 6, 7, (args) => {
    const cost = args.number(0);
    const purchased = roundDate(serialOf(args.scalar(1)));
    const firstPeriod = roundDate(serialOf(args.scalar(2)));
    const salvage = args.number(3);
    const period = Math.trunc(args.number(4));
    const rate = args.number(5);
    if (rate <= 0 || cost <= 0) return error(ErrorCode.num);
    const fullPeriodDays = basisDays(purchased, firstPeriod, args.isMissing(6) ? 0 : Math.trunc(args.number(6)));
    const firstDepreciation = cost * rate * (fullPeriodDays / yearBasis(args.isMissing(6) ? 0 : Math.trunc(args.number(6)), purchased, firstPeriod));
    let depreciation: number;
    if (period === 0) depreciation = firstDepreciation;
    else {
      depreciation = cost * rate;
      const totalSoFar = firstDepreciation + (period - 1) * cost * rate;
      const remaining = cost - salvage - totalSoFar;
      if (remaining < depreciation) depreciation = Math.max(0, remaining);
    }
    return numericResult(depreciation);
  }),
  define('AMORDEGRC', 6, 7, (args) => {
    const cost = args.number(0);
    const purchased = roundDate(serialOf(args.scalar(1)));
    const firstPeriod = roundDate(serialOf(args.scalar(2)));
    const salvage = args.number(3);
    const period = Math.trunc(args.number(4));
    const rate = args.number(5);
    if (rate <= 0 || cost <= 0) return error(ErrorCode.num);
    const life = 1 / rate;
    const coefficient = life < 3 ? 1 : life < 5 ? 1.5 : life < 7 ? 2 : 2.5;
    const rateApplied = rate * coefficient;
    const amortBasis = args.isMissing(6) ? 0 : Math.trunc(args.number(6));
    const fullPeriodDays = basisDays(purchased, firstPeriod, amortBasis);
    let value = cost;
    let depreciation = value * rateApplied * (fullPeriodDays / yearBasis(amortBasis, purchased, firstPeriod));
    if (period === 0) return numericResult(depreciation);
    value -= depreciation;
    for (let current = 1; current <= period; current++) {
      depreciation = Math.min(value * rateApplied, value - salvage);
      if (depreciation < 0) depreciation = 0;
      value -= depreciation;
    }
    return numericResult(depreciation);
  }),
  define('ODDFPRICE', 8, 9, (args) => odds(args, 'price')),
  define('ODDFYIELD', 8, 9, (args) => odds(args, 'yield')),
  define('ODDLPRICE', 7, 8, (args) => odds(args, 'price')),
  define('ODDLYIELD', 7, 8, (args) => odds(args, 'yield')),
];

export { priceValue, yieldValue, couponSchedule, numericResult };
