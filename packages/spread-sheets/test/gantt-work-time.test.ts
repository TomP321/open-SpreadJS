import { describe, expect, it } from 'vitest';
import { Calendar, CustomWorkWeek } from '../src/gantt/calendar';
import { addWorkingTime, workingTimeBetween } from '../src/gantt/work-time';

describe('Gantt working time', () => {
  it('charges a day whose custom week range is empty (trial probe t54-holiday)', () => {
    // Trial probe `.probe/t54/probe-t54-holiday.json` (step `t54-holiday`, cases
    // `sweep`/`r09_09`): `CustomWorkWeek(7 empty days, Jan 10, Jan 10)` does NOT make Jan 10 a
    // non-working day — a custom week applies only to the days whose local midnight lies in the
    // HALF-OPEN interval `start <= day < finish`, so `start == finish` applies to nothing.
    // The trial's own 3-day task on that calendar runs Jan 9 08:00 -> Jan 13 17:00 (sweep
    // `Task 4`), and the r09_09 range matrix reproduces the plain Standard schedule.
    // Re-derived from the trial on 2026-11-17; the previous expectation (Jan 10 skipped,
    // finish Jan 14 17:00) was our own invention and contradicted the trial. Recorded in
    // docs/STATUS.md (TASK 54, item 2).
    const calendar = Calendar.standard.copyTo('Project calendar');
    calendar.customWorkWeeks.push(new CustomWorkWeek(
      Array.from({ length: 7 }, () => []), new Date(2025, 0, 10), new Date(2025, 0, 10)));
    const start = new Date(2025, 0, 9, 8);
    const finish = new Date(2025, 0, 13, 17);
    expect(addWorkingTime(calendar, start, 3 * 8 * 3600000)).toEqual(finish);
    expect(addWorkingTime(calendar, finish, -3 * 8 * 3600000)).toEqual(start);
    expect(workingTimeBetween(calendar, start, finish)).toBe(3 * 8 * 3600000);
  });
  it('skips the days a real custom week range covers (trial probe t54-holiday)', () => {
    // Same probe, case `r07_08`: `CustomWorkWeek(7 empty days, Jan 7, Jan 8)` covers Jan 7 only
    // (Jan 8 is the open end) — the trial's 5-day task then runs Jan 6..10 with Jan 7 out and
    // finishes Jan 13 17:00; case `saturdayAsFinish` (Jan 10 -> Jan 11) leaves the Saturday
    // non-working, case `saturdayAsStart` (Jan 11 -> Jan 12) makes it work.
    const calendar = Calendar.standard.copyTo('range');
    calendar.customWorkWeeks.push(new CustomWorkWeek(
      Array.from({ length: 7 }, () => []), new Date(2025, 0, 7), new Date(2025, 0, 8)));
    const start = new Date(2025, 0, 6, 8);
    const finish = new Date(2025, 0, 13, 17);
    expect(addWorkingTime(calendar, start, 5 * 8 * 3600000)).toEqual(finish);
    expect(workingTimeBetween(calendar, start, finish)).toBe(5 * 8 * 3600000);

    const saturday = Calendar.standard.copyTo('Sat');
    const slot = (from: number, to: number) => ({ start: { hour: from, minute: 0 }, end: { hour: to, minute: 0 } });
    saturday.customWorkWeeks.push(new CustomWorkWeek(
      Array.from({ length: 7 }, (_, day) => day === 0 ? [] : day === 6 ? [slot(8, 12), slot(13, 17)] : [slot(8, 12), slot(13, 17)]),
      new Date(2025, 0, 11), new Date(2025, 0, 12)));
    expect(addWorkingTime(saturday, new Date(2025, 0, 6, 8), 6 * 8 * 3600000)).toEqual(new Date(2025, 0, 11, 17));

    const openEnd = Calendar.standard.copyTo('SatOpen');
    openEnd.customWorkWeeks.push(new CustomWorkWeek(
      Array.from({ length: 7 }, (_, day) => day === 0 ? [] : day === 6 ? [slot(8, 12), slot(13, 17)] : [slot(8, 12), slot(13, 17)]),
      new Date(2025, 0, 10), new Date(2025, 0, 11)));
    expect(addWorkingTime(openEnd, new Date(2025, 0, 6, 8), 6 * 8 * 3600000)).toEqual(new Date(2025, 0, 13, 17));
  });
  it('matches trial task dates for a standard two-day task', () => {
    const start = new Date(2025, 0, 6, 8);
    const finish = new Date(2025, 0, 7, 17);
    expect(addWorkingTime(Calendar.standard, start, 16 * 3600000)).toEqual(finish);
    expect(workingTimeBetween(Calendar.standard, start, finish)).toBe(16 * 3600000);
  });
});
