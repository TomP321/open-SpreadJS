import { describe, expect, it } from 'vitest';
import { GanttMapping } from '../src/gantt/mapping';

describe('GanttMapping trial duration conversions', () => {
  const mapping = new GanttMapping();
  it('parses work durations using the default calendar settings', () => {
    expect(mapping.parseDuration('1d')).toEqual({ value: 1, unit: 'Day', time: 28800000 });
    expect(mapping.parseDuration('1.5h')).toEqual({ value: 1.5, unit: 'Hour', time: 5400000 });
    expect(mapping.parseDuration('30m')).toEqual({ value: 30, unit: 'Minute', time: 1800000 });
    expect(mapping.parseDuration('2w')).toEqual({ value: 2, unit: 'Week', time: 288000000 });
    expect(mapping.parseDuration('1mo')).toEqual({ value: 1, unit: 'Month', time: 576000000 });
    expect(mapping.parseDuration('-2d')).toBeNull();
    expect(mapping.parseDuration(-2)).toEqual({ value: 0, unit: 'Day', time: 0 });
    expect(mapping.parseDuration({ time: 3600000 })).toEqual({ value: 0.125, unit: 'Day', time: 3600000 });
  });
  it('formats durations and preserves strings', () => {
    expect(mapping.formatDuration({ value: 1, unit: 'Hour' })).toBe('1 hr');
    expect(mapping.formatDuration({ value: 2, unit: 'Day' })).toBe('2 days');
    expect(mapping.formatDuration('1.5h')).toBe('1.5h');
    expect(mapping.formatDuration(1)).toBe('');
  });
});

describe('GanttMapping trial conversions', () => {
  const mapping = new GanttMapping();
  it('converts booleans using the trial string and numeric rules', () => {
    expect([true, false, 1, 0, 'TRUE', 'False', 'yes', null].map(v => mapping.parseBoolean(v)))
      .toEqual([true, false, true, false, true, false, undefined, null]);
    expect(mapping.formatBoolean(true)).toBe('true');
    expect(mapping.formatBoolean(false)).toBe('false');
  });
  it('parses integer strings and normalizes task modes', () => {
    expect(['12x', '-1.8', 'bad', 2.9].map(v => mapping.parseInt(v))).toEqual([12, -1, undefined, 2.9]);
    expect(mapping.formatInt(2.9)).toBe('2.9');
    expect(['auto', 'Manual', 'other', 1].map(v => mapping.parseMode(v))).toEqual(['Auto', 'Manual', undefined, undefined]);
    expect(mapping.formatMode('manual')).toBe('Manual');
  });
});

describe('GanttMapping trial date conversions', () => {
  const mapping = new GanttMapping();
  it('parses date text, serial text, and time text while rejecting numeric inputs', () => {
    expect(mapping.parseDate('2025/01/06 08:30')).toEqual(new Date(2025, 0, 6, 8, 30));
    expect(mapping.parseDate('1.5')).toEqual(new Date(1899, 11, 31, 12));
    expect(mapping.parseDate('12:30')).toEqual(new Date(1899, 11, 30, 12, 30));
    expect(mapping.parseDate('1/6/2025', 'dd/mm/yyyy')).toEqual(new Date(2025, 5, 1));
    expect(mapping.parseDate(1)).toBeUndefined();
    expect(mapping.parseDate('invalid')).toBeUndefined();
  });
  it('formats dates and serials using the supplied pattern', () => {
    expect(mapping.formatDate(new Date(2025, 0, 6, 8, 30))).toBe('2025/01/06 08:30');
    expect(mapping.formatDate('1.5')).toBe('1899/12/31 12:00');
    expect(mapping.formatDate(new Date(2025, 0, 6), 'dd/mm/yyyy')).toBe('06/01/2025');
    expect(mapping.formatDate('2025-01-06')).toBeNull();
    expect(mapping.formatDate(0)).toBeNull();
    expect(mapping.formatDate('0')).toBeNull();
  });
});
