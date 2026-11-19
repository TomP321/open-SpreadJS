import type { TimescaleTier } from '../appearance.js';

/**
 * Timescale tier label formatting. Tier ticks are the calendar boundaries of the tier's unit; the
 * label text comes from `TimescaleTier.formatter` when set (a SpreadJS date-format string with the
 * documented `{!KEYWORD}` extensions, or a callback), otherwise from the built-in default of the
 * unit. The trial switches the day/week defaults to a wider style once the day column is wide
 * (zoomed): three-letter weekdays + `MM/dd` at the default zoom (46.4px/day), one-letter weekdays
 * + `yy MMM dd` at zoom 2.5 (80px/day) — both observed from the trial's rendering.
 */

export type TierFormatContext = { projectStart?: Date; projectFinish?: Date; project?: unknown };

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
  'September', 'October', 'November', 'December'];
const MONTH_NAMES_SHORT = MONTH_NAMES.map(name => name.slice(0, 3));

export const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const WEEKDAY_ONE_LETTER = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/** Day width (px) from which the trial paints the zoomed tier label defaults. */
export const GANTT_ZOOMED_TIER_DAY_WIDTH = 60;

const startOfDay = (date: Date): Date => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const addDays = (date: Date, days: number): Date =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
const pad = (n: number, width = 2): string => String(Math.abs(n)).padStart(width, '0');
const wholeDays = (from: Date, to: Date): number =>
  Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / 86400000);
const sundayOf = (date: Date): Date => addDays(startOfDay(date), -date.getDay());
const monthIndex = (date: Date): number => date.getFullYear() * 12 + date.getMonth();
const dayOfYear = (date: Date): number =>
  Math.floor((startOfDay(date).getTime() - new Date(date.getFullYear(), 0, 1).getTime()) / 86400000) + 1;
/** Week index in the year, weeks starting Sunday (Jan 1's week is week 1). */
const weekOfYear = (date: Date): number =>
  Math.floor((dayOfYear(date) - 1 + new Date(date.getFullYear(), 0, 1).getDay()) / 7) + 1;
const thirdsOfMonth = (date: Date): number => date.getDate() <= 10 ? 0 : date.getDate() <= 20 ? 1 : 2;

/** Count of `kind` boundaries crossed from `anchor`'s period to `date`'s. */
const unitCount = (kind: number, date: Date, anchor: Date): number => {
  const y = date.getFullYear();
  const a = anchor.getFullYear();
  switch (kind) {
    case 1: return y - a;
    case 2: return y * 2 + (date.getMonth() >= 6 ? 1 : 0) - (a * 2 + (anchor.getMonth() >= 6 ? 1 : 0));
    case 3: return Math.floor(y * 4 + date.getMonth() / 3) - Math.floor(a * 4 + anchor.getMonth() / 3);
    case 4: return monthIndex(date) - monthIndex(anchor);
    case 5: return monthIndex(date) - monthIndex(anchor) + thirdsOfMonth(date) - thirdsOfMonth(anchor);
    case 6: return Math.round((sundayOf(date).getTime() - sundayOf(anchor).getTime()) / (7 * 86400000));
    case 7: return wholeDays(anchor, date);
    case 8: return Math.floor((date.getTime() - startOfDay(anchor).getTime()) / 3600000);
    default: return Math.floor((date.getTime() - startOfDay(anchor).getTime()) / 60000);
  }
};

const keywordArgs = (raw: string): string[] => raw.split(',').map(arg => arg.trim().replace(/^["']|["']$/g, ''));

/** One `{!KEYWORD}` or `{!KEYWORD("a","b")}` substitution; `undefined` when the name is unknown. */
const keyword = (name: string, rawArgs: string, date: Date, ctx: TierFormatContext): string | undefined => {
  const args = keywordArgs(rawArgs);
  const start = ctx.projectStart ?? ctx.projectFinish;
  const finish = ctx.projectFinish ?? ctx.projectStart;
  switch (name) {
    case 'YEAR_FROM_START': return start ? String(unitCount(1, date, start)) : undefined;
    case 'YEAR_FROM_END': return finish ? String(unitCount(1, date, finish)) : undefined;
    case 'HALF_YEAR': return args[date.getMonth() >= 6 ? 1 : 0];
    case 'HALF_YEAR_FROM_START': return start ? String(unitCount(2, date, start)) : undefined;
    case 'HALF_YEAR_FROM_END': return finish ? String(unitCount(2, date, finish)) : undefined;
    case 'QUARTER': return args[Math.floor(date.getMonth() / 3)];
    case 'QUARTER_FROM_START': return start ? String(unitCount(3, date, start)) : undefined;
    case 'QUARTER_FROM_END': return finish ? String(unitCount(3, date, finish)) : undefined;
    case 'MONTH_FROM_START': return start ? String(unitCount(4, date, start)) : undefined;
    case 'MONTH_FROM_END': return finish ? String(unitCount(4, date, finish)) : undefined;
    case 'THIRDS_OF_MONTH': return args[thirdsOfMonth(date)];
    case 'WEEK_OF_YEAR': return String(weekOfYear(date));
    case 'DAY_OF_WEEK': return args[date.getDay()];
    case 'WEEK_FROM_START': return start ? String(unitCount(6, date, start)) : undefined;
    case 'WEEK_FROM_END': return finish ? String(unitCount(6, date, finish)) : undefined;
    case 'DAY_OF_YEAR': return String(dayOfYear(date));
    case 'DAY_FROM_START': return start ? String(unitCount(7, date, start)) : undefined;
    case 'DAY_FROM_END': return finish ? String(unitCount(7, date, finish)) : undefined;
    case 'HOUR_FROM_START': return start ? String(unitCount(8, date, start)) : undefined;
    case 'HOUR_FROM_END': return finish ? String(unitCount(8, date, finish)) : undefined;
    case 'MINUTE': return pad(date.getMinutes());
    case 'MINUTE_FROM_START': return start ? String(unitCount(9, date, start)) : undefined;
    case 'MINUTE_FROM_END': return finish ? String(unitCount(9, date, finish)) : undefined;
    default: return undefined;
  }
};

/**
 * Formats a tier tick date with a SpreadJS date-format string: the date tokens `yyyy yy MMMM MMM
 * MM dd d HH H hh h ss` (`mm` stays the month, per the contract: minutes use `{!MINUTE}`), plus
 * every documented `{!...}` keyword; everything else is literal text.
 */
export function formatTierDate(date: Date, format: string, ctx: TierFormatContext = {}): string {
  const h24 = date.getHours();
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const dateToken = (token: string): string => {
    switch (token) {
      case 'yyyy': return String(date.getFullYear());
      case 'yy': return pad(date.getFullYear() % 100);
      case 'MMMM': return MONTH_NAMES[date.getMonth()];
      case 'MMM': return MONTH_NAMES_SHORT[date.getMonth()];
      case 'MM': case 'mm': return pad(date.getMonth() + 1);
      case 'M': return String(date.getMonth() + 1);
      case 'dd': return pad(date.getDate());
      case 'd': return String(date.getDate());
      case 'HH': return pad(h24);
      case 'H': return String(h24);
      case 'hh': return pad(h12);
      case 'h': return String(h12);
      default: return pad(date.getSeconds());
    }
  };
  // One pass: a `{!KEYWORD(...)}` match is consumed whole so its substituted text (which may
  // contain letters like `H2`) is never re-read as a date token.
  return format.replace(/\{!([A-Z][A-Z0-9_]*)(?:\(([^)]*)\))?\}|yyyy|yy|MMMM|MMM|MM|dd|d|HH|H|hh|h|ss|mm|M|s/g,
    (whole: string, name?: string, args?: string) =>
      (name === undefined ? dateToken(whole) : keyword(name, args ?? '', date, ctx) ?? whole));
}

/** The unit's built-in label when `TimescaleTier.formatter` is not set. */
export function defaultTierLabel(date: Date, unit: number | undefined, dayWidth: number): string {
  const zoomed = dayWidth >= GANTT_ZOOMED_TIER_DAY_WIDTH;
  switch (unit) {
    case 1: return String(date.getFullYear());
    case 2: return `${date.getMonth() >= 6 ? 'H2' : 'H1'} ${String(date.getFullYear())}`;
    case 3: return `Q${Math.floor(date.getMonth() / 3) + 1} ${String(date.getFullYear())}`;
    case 4: return `${MONTH_NAMES_SHORT[date.getMonth()]} ${pad(date.getFullYear() % 100)}`;
    case 5: return `${MONTH_NAMES_SHORT[date.getMonth()]} ${pad(date.getDate())}`;
    case 6: return zoomed
      ? `${pad(date.getFullYear() % 100)} ${MONTH_NAMES_SHORT[date.getMonth()]} ${pad(date.getDate())}`
      : `${pad(date.getMonth() + 1)}/${pad(date.getDate())}`;
    case 7: return zoomed ? WEEKDAY_ONE_LETTER[date.getDay()] : WEEKDAY_LABELS[date.getDay()];
    case 8: return `${pad(date.getHours())}:00`;
    default: return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }
}

/** A tier tick's label: the tier's formatter (string or callback) when set, else the unit default. */
export function tierTickLabel(
  date: Date,
  tier: TimescaleTier,
  dayWidth: number,
  ctx: TierFormatContext = {},
): string {
  if (typeof tier.formatter === 'function') return String(tier.formatter(date, ctx.project ?? null) ?? '');
  if (typeof tier.formatter === 'string' && tier.formatter.length > 0) return formatTierDate(date, tier.formatter, ctx);
  return defaultTierLabel(date, tier.unit, dayWidth);
}

/** `true` when `day` (a 00:00 date) starts a tick of the tier's unit, at `count` units each. */
export function isTierTick(day: Date, unit: number | undefined, count = 1): boolean {
  if (count > 1) return false; // handled by tierTickIndexes; a single day is never skipped here
  if (unit === undefined) return false;
  if (unit >= 7) return true;
  const dom = day.getDate();
  const month = day.getMonth();
  switch (unit) {
    case 6: return day.getDay() === 0;
    case 5: return dom === 1 || dom === 11 || dom === 21;
    case 4: return dom === 1;
    case 3: return dom === 1 && month % 3 === 0;
    case 2: return dom === 1 && month % 6 === 0;
    default: return dom === 1 && month === 0;
  }
}

/**
 * Column indexes of the tier's tick boundaries in `[fromIndex, toIndex]` (day columns relative to
 * the chart origin). With `count > 1` every count-th boundary is kept, counting from the origin.
 */
export function tierTickIndexes(
  dayAt: (i: number) => Date,
  fromIndex: number,
  toIndex: number,
  tier: TimescaleTier,
): number[] {
  const unit = tier.unit;
  if (unit === undefined || unit >= 7) {
    // Every day column is a boundary; only `count` grouping needs filtering.
    const out: number[] = [];
    for (let i = fromIndex; i <= toIndex; i++) if (((i - fromIndex) % Math.max(1, tier.count)) === 0) out.push(i);
    return out;
  }
  const out: number[] = [];
  let seen = 0;
  for (let i = fromIndex; i <= toIndex; i++) {
    if (!isTierTick(dayAt(i), unit, 1)) continue;
    if (seen % Math.max(1, tier.count) === 0) out.push(i);
    seen++;
  }
  if (tier.count > 1 && out.length === 0) {
    // No boundary in the window (a period longer than the viewport): label the origin day.
    out.push(fromIndex);
  }
  return out;
}
