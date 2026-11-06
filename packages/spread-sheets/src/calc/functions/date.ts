/** Date and time functions (SpreadJS 1899-12-30 serial epoch). */
import { Args, EvalContext, raiseError } from '../evaluate.js';
import {
  CalcError,
  ErrorCode,
  ScalarValue,
  dateToSerial,
  error,
  isError,
  normalizeNumber,
  serialToDate,
} from '../values.js';
import { type DefinedFunction, define, entries } from './common.js';
import { parseDateText } from './text.js';

const DAY = 86400000;

function daySerial(date: Date): number {
  return Math.floor((date.getTime() - Date.UTC(1899, 11, 30)) / DAY);
}

function toDateValue(value: ScalarValue): Date | CalcError {
  if (isError(value)) return value;
  if (value instanceof Date) return value;
  if (value === null) return error(ErrorCode.value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return error(ErrorCode.num);
    return serialToDate(value);
  }
  if (typeof value === 'string') {
    const serial = parseDateText(value);
    return serial === undefined ? error(ErrorCode.value) : serialToDate(serial);
  }
  return error(ErrorCode.value);
}

function dateArg(args: Args, index: number): Date | CalcError {
  return toDateValue(args.scalar(index));
}

function serialArg(args: Args, index: number): number | CalcError {
  const value = args.scalar(index);
  if (isError(value)) return value;
  if (value instanceof Date) return dateToSerial(value);
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = parseDateText(value);
    if (parsed !== undefined) return parsed;
  }
  return error(ErrorCode.value);
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}
function daysInYear(year: number): number {
  return isLeapYear(year) ? 366 : 365;
}
function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}


function lastDayOfMonth(year: number, month: number): number {
  return daysInMonth(year, month);
}

function addMonths(date: Date, months: number): Date {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  const targetMonth = month + months;
  const targetYear = year + Math.floor(targetMonth / 12);
  const normalizedMonth = ((targetMonth % 12) + 12) % 12;
  const last = lastDayOfMonth(targetYear, normalizedMonth + 1);
  return new Date(Date.UTC(targetYear, normalizedMonth, Math.min(day, last)));
}

function weekdayNumber(date: Date, type: number): number {
  const day = date.getUTCDay(); // 0 = Sunday
  switch (type) {
    case 1:
      return day + 1;
    case 2:
      return ((day + 6) % 7) + 1;
    case 3:
      return (day + 6) % 7;
    case 11:
      return ((day + 6) % 7) + 1;
    case 12:
      return ((day + 5) % 7) + 1;
    case 13:
      return ((day + 4) % 7) + 1;
    case 14:
      return ((day + 3) % 7) + 1;
    case 15:
      return ((day + 2) % 7) + 1;
    case 16:
      return ((day + 1) % 7) + 1;
    case 17:
      return (day + 6) % 7 + 1;
    default:
      return day + 1;
  }
}

function weekendMask(code: number | string): boolean[] {
  // Mask indexed by UTC day (0 = Sunday).
  const masks: Record<number, boolean[]> = {
    1: [true, false, false, false, false, false, true],
    2: [true, true, false, false, false, false, false],
    3: [false, true, true, false, false, false, false],
    4: [false, false, true, true, false, false, false],
    5: [false, false, false, true, true, false, false],
    6: [false, false, false, false, true, true, false],
    7: [false, false, false, false, false, true, true],
    11: [true, false, false, false, false, false, false],
    12: [false, true, false, false, false, false, false],
    13: [false, false, true, false, false, false, false],
    14: [false, false, false, true, false, false, false],
    15: [false, false, false, false, true, false, false],
    16: [false, false, false, false, false, true, false],
    17: [false, false, false, false, false, false, true],
  };
  if (typeof code === 'string') {
    const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
    const mask = [false, false, false, false, false, false, false];
    const normalized = code.toLowerCase();
    if (normalized.length !== 7 || !/^[01]{7}$/.test(normalized))
      throw new RangeError('Invalid weekend string');
    for (let index = 0; index < 7; index++) {
      if (normalized[index] === '1') {
        // String order is Monday..Sunday.
        const day = (index + 1) % 7;
        void days;
        mask[day] = true;
      }
    }
    return mask;
  }
  return masks[code] ?? masks[1]!;
}

function isWeekend(date: Date, mask: boolean[]): boolean {
  return mask[date.getUTCDay()]!;
}

function holidaySet(args: Args, ctx: EvalContext, index: number): Set<number> {
  const set = new Set<number>();
  if (args.isMissing(index)) return set;
  for (const entry of entries(args, ctx, index)) {
    const value = entry.value;
    if (isError(value)) raiseError(value);
    if (value instanceof Date) set.add(daySerial(value));
    else if (typeof value === 'number') set.add(Math.floor(value));
    else if (typeof value === 'string') {
      const serial = parseDateText(value);
      if (serial !== undefined) set.add(Math.floor(serial));
    }
  }
  return set;
}

function networkDays(start: Date, end: Date, mask: boolean[], holidays: Set<number>): number {
  let sign = 1;
  let from = start;
  let to = end;
  if (from > to) {
    [from, to] = [to, from];
    sign = -1;
  }
  let count = 0;
  const cursor = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  while (cursor <= to) {
    const serial = daySerial(cursor);
    if (!isWeekend(cursor, mask) && !holidays.has(serial)) count++;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return sign * count;
}

function workday(start: Date, days: number, mask: boolean[], holidays: Set<number>): Date {
  const direction = days >= 0 ? 1 : -1;
  let remaining = Math.abs(Math.trunc(days));
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  while (remaining > 0) {
    cursor.setUTCDate(cursor.getUTCDate() + direction);
    if (!isWeekend(cursor, mask) && !holidays.has(daySerial(cursor))) remaining--;
  }
  return cursor;
}

function days360(start: Date, end: Date, european: boolean): number {
  let d1 = start.getUTCDate();
  let d2 = end.getUTCDate();
  if (european) {
    if (d1 === 31) d1 = 30;
    if (d2 === 31) d2 = 30;
  } else {
    if (d1 === 31 || (d1 === lastDayOfMonth(start.getUTCFullYear(), start.getUTCMonth() + 1) && d1 >= 30)) d1 = 30;
    if (d2 === 31 && d1 >= 30) d2 = 30;
  }
  return (
    (end.getUTCFullYear() - start.getUTCFullYear()) * 360 +
    (end.getUTCMonth() - start.getUTCMonth()) * 30 +
    (d2 - d1)
  );
}

function yearFrac(start: Date, end: Date, basis: number): number | CalcError {
  if (start > end) [start, end] = [end, start];
  if (basis === 0) return days360(start, end, false) / 360;
  if (basis === 1) {
    const days = (end.getTime() - start.getTime()) / DAY;
    const y1 = start.getUTCFullYear();
    const y2 = end.getUTCFullYear();
    if (y1 === y2) return days / daysInYear(y1);
    let total = 0;
    for (let year = y1; year <= y2; year++) total += daysInYear(year);
    const average = total / (y2 - y1 + 1);
    return days / average;
  }
  if (basis === 2) return (end.getTime() - start.getTime()) / DAY / 360;
  if (basis === 3) return (end.getTime() - start.getTime()) / DAY / 365;
  if (basis === 4) return days360(start, end, true) / 360;
  return error(ErrorCode.num);
}

function datedif(start: Date, end: Date, unit: string): number | CalcError {
  if (start > end) return error(ErrorCode.num);
  const upper = unit.toUpperCase();
  const years = end.getUTCFullYear() - start.getUTCFullYear();
  const months =
    years * 12 + (end.getUTCMonth() - start.getUTCMonth()) + (end.getUTCDate() >= start.getUTCDate() ? 0 : -1);
  const anchor = addMonths(start, months);
  switch (upper) {
    case 'Y':
      return Math.floor(months / 12);
    case 'M':
      return months;
    case 'D':
      return Math.round((end.getTime() - start.getTime()) / DAY);
    case 'YM':
      return months % 12;
    case 'MD':
      return Math.round((end.getTime() - anchor.getTime()) / DAY);
    case 'YD': {
      const anchorYear = addMonths(start, Math.floor(months / 12) * 12);
      return Math.round((end.getTime() - anchorYear.getTime()) / DAY);
    }
    default:
      return error(ErrorCode.num);
  }
  void years;
}

function isoWeekNumber(date: Date): number {
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  return Math.ceil(((target.getTime() - yearStart.getTime()) / DAY + 1) / 7);
}

function weekNumber(date: Date, type: number): number {
  // Week 1 contains January 1. type 1 = week starts Sunday, type 2 = Monday.
  const startOfYear = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekStart = type === 2 ? 1 : 0;
  const offset = (startOfYear.getUTCDay() - weekStart + 7) % 7;
  const dayOfYear = Math.floor((date.getTime() - startOfYear.getTime()) / DAY);
  return Math.floor((dayOfYear + offset) / 7) + 1;
}

function dateFromParts(args: Args): Date | CalcError {
  let year = Math.trunc(args.number(0));
  const month = Math.trunc(args.number(1));
  const day = Math.trunc(args.number(2));
  if (year < 1900) year += 1900;
  const value = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(value.getTime())) return error(ErrorCode.num);
  return value;
}

export const DATE_FUNCTIONS: DefinedFunction[] = [
  define('DATE', 3, 3, (args) => dateFromParts(args)),
  define('YEAR', 1, 1, (args) => {
    const date = dateArg(args, 0);
    return isError(date) ? date : date.getUTCFullYear();
  }),
  define('MONTH', 1, 1, (args) => {
    const date = dateArg(args, 0);
    return isError(date) ? date : date.getUTCMonth() + 1;
  }),
  define('DAY', 1, 1, (args) => {
    const date = dateArg(args, 0);
    return isError(date) ? date : date.getUTCDate();
  }),
  define('HOUR', 1, 1, (args) => {
    const serial = serialArg(args, 0);
    if (isError(serial)) return serial;
    const fraction = serial - Math.floor(serial);
    return Math.floor(fraction * 24 + 1e-9);
  }),
  define('MINUTE', 1, 1, (args) => {
    const serial = serialArg(args, 0);
    if (isError(serial)) return serial;
    const total = Math.round((serial - Math.floor(serial)) * 86400 * 1e6) / 1e6;
    return Math.floor((total % 3600) / 60);
  }),
  define('SECOND', 1, 1, (args) => {
    const serial = serialArg(args, 0);
    if (isError(serial)) return serial;
    const total = (serial - Math.floor(serial)) * 86400;
    return Math.floor(total % 60);
  }),
  define('WEEKDAY', 1, 2, (args) => {
    const date = dateArg(args, 0);
    if (isError(date)) return date;
    const type = args.isMissing(1) ? 1 : Math.trunc(args.number(1));
    return weekdayNumber(date, type);
  }),
  define('WEEKNUM', 1, 2, (args) => {
    const date = dateArg(args, 0);
    if (isError(date)) return date;
    const type = args.isMissing(1) ? 1 : Math.trunc(args.number(1));
    return weekNumber(date, type === 2 ? 2 : type === 1 ? 1 : 1);
  }),
  define('ISOWEEKNUM', 1, 1, (args) => {
    const date = dateArg(args, 0);
    return isError(date) ? date : isoWeekNumber(date);
  }),
  define('EDATE', 2, 2, (args) => {
    const date = dateArg(args, 0);
    if (isError(date)) return date;
    return addMonths(date, Math.trunc(args.number(1)));
  }),
  define('EOMONTH', 2, 2, (args) => {
    const date = dateArg(args, 0);
    if (isError(date)) return date;
    const shifted = addMonths(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)), Math.trunc(args.number(1)));
    return new Date(
      Date.UTC(
        shifted.getUTCFullYear(),
        shifted.getUTCMonth(),
        lastDayOfMonth(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1),
      ),
    );
  }),
  define('DATEVALUE', 1, 1, (args) => {
    const text = args.text(0);
    const serial = parseDateText(text);
    return serial === undefined ? error(ErrorCode.value) : Math.floor(serial);
  }),
  define('TIMEVALUE', 1, 1, (args) => {
    const text = args.text(0);
    const serial = parseDateText(text);
    return serial === undefined ? error(ErrorCode.value) : serial;
  }),
  define('TIME', 3, 3, (args) => {
    const hours = Math.trunc(args.number(0));
    const minutes = Math.trunc(args.number(1));
    const seconds = Math.trunc(args.number(2));
    const total = hours * 3600 + minutes * 60 + seconds;
    return new Date(Date.UTC(1899, 11, 30) + total * 1000);
  }),
  define('DAYS', 2, 2, (args) => {
    const end = serialArg(args, 0);
    if (isError(end)) return end;
    const start = serialArg(args, 1);
    if (isError(start)) return start;
    return Math.trunc(end) - Math.trunc(start);
  }),
  define('DAYS360', 2, 3, (args) => {
    const start = dateArg(args, 0);
    if (isError(start)) return start;
    const end = dateArg(args, 1);
    if (isError(end)) return end;
    const european = args.isMissing(2) ? false : args.boolean(2);
    return days360(start, end, european);
  }),
  define('DATEDIF', 3, 3, (args) => {
    const start = dateArg(args, 0);
    if (isError(start)) return start;
    const end = dateArg(args, 1);
    if (isError(end)) return end;
    return datedif(start, end, args.text(2));
  }),
  define('YEARFRAC', 2, 3, (args) => {
    const start = dateArg(args, 0);
    if (isError(start)) return start;
    const end = dateArg(args, 1);
    if (isError(end)) return end;
    const basis = args.isMissing(2) ? 0 : Math.trunc(args.number(2));
    const result = yearFrac(start, end, basis);
    return isError(result) ? result : normalizeNumber(result);
  }),
  define('NETWORKDAYS', 2, 3, (args, ctx) => {
    const start = dateArg(args, 0);
    if (isError(start)) return start;
    const end = dateArg(args, 1);
    if (isError(end)) return end;
    const mask = weekendMask(1);
    return networkDays(start, end, mask, holidaySet(args, ctx, 2));
  }),
  define('NETWORKDAYS.INTL', 2, 4, (args, ctx) => {
    const start = dateArg(args, 0);
    if (isError(start)) return start;
    const end = dateArg(args, 1);
    if (isError(end)) return end;
    const weekend = args.isMissing(2) ? 1 : (args.value(2) as number | string);
    let mask: boolean[];
    try {
      mask = weekendMask(typeof weekend === 'string' ? weekend : Math.trunc(args.number(2)));
    } catch {
      return error(ErrorCode.num);
    }
    return networkDays(start, end, mask, holidaySet(args, ctx, 3));
  }),
  define('WORKDAY', 2, 3, (args, ctx) => {
    const start = dateArg(args, 0);
    if (isError(start)) return start;
    return daySerial(workday(start, args.number(1), weekendMask(1), holidaySet(args, ctx, 2)));
  }),
  define('WORKDAY.INTL', 2, 4, (args, ctx) => {
    const start = dateArg(args, 0);
    if (isError(start)) return start;
    const weekend = args.isMissing(2) ? 1 : (args.value(2) as number | string);
    let mask: boolean[];
    try {
      mask = weekendMask(typeof weekend === 'string' ? weekend : Math.trunc(args.number(2)));
    } catch {
      return error(ErrorCode.num);
    }
    return daySerial(workday(start, args.number(1), mask, holidaySet(args, ctx, 3)));
  }),
  define('TODAY', 0, 0, () => {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  }, { volatile: true }),
  define('NOW', 0, 0, () => new Date(), { volatile: true }),
  define('DATESTRING', 1, 1, (args) => {
    const date = dateArg(args, 0);
    return isError(date) ? date : `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
  }),
];

export { toDateValue, dateFromParts, days360, yearFrac, addMonths, daySerial, DAY };
export type { CalcError };
