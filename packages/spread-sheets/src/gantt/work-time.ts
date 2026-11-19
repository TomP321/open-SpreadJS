import type { Calendar, WorkDay } from './calendar.js';

const DAY = 86400000;

/** Intervals for a local calendar date, including date-specific work weeks.
 *
 * Trial range semantics (TASK 54 probe `.probe/t54/probe-t54-holiday.json`, steps
 * `t54-holiday`: 14 boundary cases + 13 range cases, all recorded in docs/STATUS.md):
 * a `CustomWorkWeek(workDays, start, finish)` replaces the week definition for the days whose
 * LOCAL MIDNIGHT sits in the HALF-OPEN interval `start <= dayMidnight < finish` —
 * the `start` date is covered, the `finish` date is not (`start == finish` covers nothing),
 * and a range that starts mid-day does not touch the day it starts in
 * (`Jan 7 12:00 -> Jan 8` leaves Jan 7 fully working).
 */
function intervals(calendar: Calendar, date: Date): [number, number][] {
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const stamp = day.getTime();
  const week = calendar.customWorkWeeks.find(item => {
    const first = item.start instanceof Date ? item.start.getTime() : Number.NaN;
    const last = item.finish instanceof Date ? item.finish.getTime() : Number.NaN;
    return Number.isFinite(first) && Number.isFinite(last) && stamp >= first && stamp < last;
  }) ?? calendar.defaultWorkWeek;
  const times: WorkDay = week.getWorkDay(day.getDay()) ?? [];
  return times.map(({ start, end }) => {
    const from = new Date(day); from.setHours(start.hour, start.minute, 0, 0);
    const to = new Date(day); to.setHours(end.hour, end.minute, 0, 0);
    return [from.getTime(), to.getTime()] as [number, number];
  }).filter(([from, to]) => to > from).sort((a, b) => a[0] - b[0]);
}

function nextDay(date: Date, step: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + step);
}

/**
 * Clock windows of the nearest working day, copied onto `day`. The trial charges a bar that
 * begins (or ends) on a non-working day for that day as well, which is how a summary anchored on
 * a Saturday keeps its duration (`Jan 11 + 3 days = Jan 14 17:00`).
 */
function borrowedIntervals(calendar: Calendar, day: Date): [number, number][] {
  for (let step = 1; step <= 7; step++) {
    for (const offset of [step, -step]) {
      const source = intervals(calendar, nextDay(day, offset));
      if (source.length) return source.map(([from, to]) => {
        const first = new Date(from), last = new Date(to);
        const base = nextDay(day, 0);
        const start = new Date(base); start.setHours(first.getHours(), first.getMinutes(), first.getSeconds(), first.getMilliseconds());
        const finish = new Date(base); finish.setHours(last.getHours(), last.getMinutes(), last.getSeconds(), last.getMilliseconds());
        return [start.getTime(), finish.getTime()] as [number, number];
      }).sort((a, b) => a[0] - b[0]);
    }
  }
  return [];
}

function shift(calendar: Calendar, start: Date, duration: number, borrowAnchorDay: boolean): Date {
  if (!Number.isFinite(duration) || Number.isNaN(start.getTime())) throw new RangeError('Invalid working time');
  if (duration === 0) return new Date(start);
  const direction = duration > 0 ? 1 : -1;
  let remaining = Math.abs(duration);
  let cursor = start.getTime();
  const anchor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  let day = anchor;
  // Guard an entirely non-working calendar instead of looping forever.
  for (let i = 0; i < 366000; i++) {
    const own = intervals(calendar, day);
    const slots = (own.length || !borrowAnchorDay || day.getTime() !== anchor.getTime() ? own : borrowedIntervals(calendar, day)).slice();
    if (direction < 0) slots.reverse();
    for (const [from, to] of slots) {
      const position = direction > 0 ? Math.max(cursor, from) : Math.min(cursor, to);
      const available = direction > 0 ? to - position : position - from;
      if (available <= 0) continue;
      if (remaining <= available) return new Date(position + direction * remaining);
      remaining -= available;
    }
    day = nextDay(day, direction);
    cursor = direction > 0 ? day.getTime() : nextDay(day, 1).getTime();
  }
  throw new RangeError('No working time available');
}

/** Move through working intervals; duration is measured in working milliseconds. */
export function addWorkingTime(calendar: Calendar, start: Date, duration: number): Date {
  return shift(calendar, start, duration, false);
}

/** Same as `addWorkingTime`, but a bar anchored on a non-working day pays for that day too. */
export function addTaskTime(calendar: Calendar, start: Date, duration: number): Date {
  return shift(calendar, start, duration, true);
}

/** First working instant at or after `date`; the date itself when it already is working time. */
export function workingSlot(calendar: Calendar, date: Date): Date {
  if (Number.isNaN(date.getTime())) throw new RangeError('Invalid working time');
  let day = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  for (let i = 0; i < 3660; i++) {
    for (const [from, to] of intervals(calendar, day)) {
      if (from <= date.getTime() && date.getTime() < to) return new Date(date);
      if (from > date.getTime()) return new Date(from);
    }
    day = nextDay(day, 1);
  }
  throw new RangeError('No working time available');
}

/** Measure the working time between two dates. */
export function workingTimeBetween(calendar: Calendar, start: Date, finish: Date): number {
  if (finish < start) return -workingTimeBetween(calendar, finish, start);
  if (Number.isNaN(start.getTime()) || Number.isNaN(finish.getTime())) throw new RangeError('Invalid working time');
  let result = 0;
  let day = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  while (day.getTime() <= finish.getTime()) {
    for (const [from, to] of intervals(calendar, day)) {
      result += Math.max(0, Math.min(to, finish.getTime()) - Math.max(from, start.getTime()));
    }
    const next = nextDay(day, 1);
    if (next.getTime() <= day.getTime() || next.getTime() - day.getTime() > 2 * DAY) throw new RangeError('Invalid calendar date');
    day = next;
  }
  return result;
}

/** Working milliseconds of the nearest working day at or after `around` (480 min for 8-12/13-17). */
export function workDayLength(calendar: Calendar, around: Date): number {
  for (let step = 0; step <= 7; step++) {
    const time = intervals(calendar, nextDay(around, step)).reduce((sum, [from, to]) => sum + (to - from), 0);
    if (time > 0) return time;
  }
  return 8 * 3600000;
}
