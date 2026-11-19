import { describe, expect, it } from 'vitest';
import { Timescale } from '../src/gantt/appearance.js';
import {
  defaultTierLabel, formatTierDate, isTierTick, tierTickIndexes, tierTickLabel,
} from '../src/gantt/view/tiers.js';

const day = (month: number, date: number, hour = 0) => new Date(2026, month - 1, date, hour);

describe('timescale tier labels (TASK 37 item 3)', () => {
  it('formats the date tokens and keeps mm as the month (minutes via {!MINUTE})', () => {
    const date = day(11, 5, 9);
    date.setMinutes(7, 3);
    expect(formatTierDate(date, 'yyyy-MM-dd')).toBe('2026-11-05');
    expect(formatTierDate(date, 'yy MMM dd')).toBe('26 Nov 05');
    expect(formatTierDate(date, 'd MMMM yyyy')).toBe('5 November 2026');
    expect(formatTierDate(date, 'hh:mm {!MINUTE} ss')).toBe('09:11 07 03');
    expect(formatTierDate(date, 'week {!WEEK_OF_YEAR}')).toMatch(/^week \d\d?$/);
  });

  it('substitutes the documented {!KEYWORD} extensions', () => {
    const ctx = { projectStart: day(11, 16), projectFinish: day(11, 27) };
    expect(formatTierDate(day(11, 22), '{!DAY_OF_WEEK("S","M","T","W","T","F","S")}', ctx)).toBe('S');
    expect(formatTierDate(day(11, 22), '{!DAY_FROM_START}', ctx)).toBe('6');
    expect(formatTierDate(day(11, 22), '{!DAY_FROM_END}', ctx)).toBe('-5');
    expect(formatTierDate(day(11, 22), '{!WEEK_FROM_START}', ctx)).toBe('1');
    expect(formatTierDate(day(2, 10), '{!MONTH_FROM_START}', ctx)).toBe('-9');
    expect(formatTierDate(day(11, 22), '{!QUARTER("Q1","Q2","Q3","Q4")}', ctx)).toBe('Q4');
    expect(formatTierDate(day(11, 22), '{!HALF_YEAR("H1","H2")}', ctx)).toBe('H2');
    expect(formatTierDate(day(11, 22), '{!THIRDS_OF_MONTH("B","M","E")}', ctx)).toBe('E');
    expect(formatTierDate(day(11, 22), '{!DAY_OF_YEAR}', ctx)).toBe('326');
    // Unknown keywords stay verbatim; literal text is preserved.
    expect(formatTierDate(day(11, 22), '{!NOPE} ok', ctx)).toBe('{!NOPE} ok');
  });

  it('switches the day/week defaults at the zoomed tier width (trial 46px → "Mon"/"11/22", 80px → "M"/"26 Nov 15")', () => {
    expect(defaultTierLabel(day(11, 22), 7, 46.4)).toBe('Sun');
    expect(defaultTierLabel(day(11, 23), 7, 46.4)).toBe('Mon');
    expect(defaultTierLabel(day(11, 22), 7, 80)).toBe('S');
    expect(defaultTierLabel(day(11, 15), 6, 46.4)).toBe('11/15');
    expect(defaultTierLabel(day(11, 15), 6, 80)).toBe('26 Nov 15');
  });

  it('prefers the tier formatter: string formats and label callbacks', () => {
    const scale = new Timescale();
    scale.bottomTier.formatter = 'd.M';
    expect(tierTickLabel(day(11, 5), scale.bottomTier, 46.4)).toBe('5.11');
    scale.middleTier.formatter = (date: Date) => `#${date.getDate()}`;
    expect(tierTickLabel(day(11, 22), scale.middleTier, 80)).toBe('#22');
  });

  it('places ticks at the unit boundaries (every day, Sundays, month starts) with tierTickIndexes', () => {
    const scale = new Timescale();
    const dayAt = (i: number): Date => new Date(2026, 10, 15 + i);
    expect(tierTickIndexes(dayAt, 0, 6, scale.bottomTier)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(tierTickIndexes(dayAt, 0, 13, scale.middleTier)).toEqual([0, 7]);
    scale.topTier.unit = 4;
    expect(tierTickIndexes(dayAt, 0, 60, scale.topTier)).toEqual([16, 47]); // Dec 1 and Jan 1
    expect(isTierTick(day(11, 22), 6)).toBe(true);
    expect(isTierTick(day(11, 21), 5)).toBe(true); // the 21st starts the month's last third
    expect(isTierTick(day(11, 22), 5)).toBe(false);
    expect(isTierTick(day(11, 23), 4)).toBe(false);
    expect(isTierTick(day(1, 1), 1)).toBe(true);
    // count=2 keeps every second Sunday.
    scale.middleTier.count = 2;
    expect(tierTickIndexes(dayAt, 0, 28, scale.middleTier)).toEqual([0, 14, 28]);
  });

  it('drives the trial zoom labels from the sheet timescale (zoom 1 default, zoom 2.5 zoomed)', () => {
    const scale = new Timescale();
    expect(tierTickLabel(day(11, 15), scale.middleTier, 46.4)).toBe('11/15');
    expect(tierTickLabel(day(11, 15), scale.bottomTier, 46.4)).toBe('Sun');
    scale.zoomTo(2.5);
    expect(scale.zoomFactor).toBe(2.5);
    expect(tierTickLabel(day(11, 15), scale.middleTier, 80)).toBe('26 Nov 15');
    expect(tierTickLabel(day(11, 15), scale.bottomTier, 80)).toBe('S');
  });
});
