import { describe, expect, it } from 'vitest';
import { Spread } from '../src/index.js';

// Expected values were observed through the public API of the 19.2.5 trial.
describe('Gantt calendar defaults', () => {
  it('uses the trial calendar settings', () => {
    const settings = new Spread.Sheets.GanttSheet.CalendarSettings();
    expect(settings).toMatchObject({
      daysPerMonth: 20, defaultDurationDecimalDigits: 3, defaultDurationUnit: 'Day',
      defaultFinishTime: { hour: 17, minute: 0 }, defaultStartTime: { hour: 8, minute: 0 },
      hoursPerDay: 8, hoursPerWeek: 40, weekStartOn: 0,
      unitLabels: ['min', 'hr', 'day', 'wk', 'mon', 'yr'],
      unitLabelsPlurals: ['mins', 'hrs', 'days', 'wks', 'mons', 'yrs'],
    });
  });
  it('exposes the trial standard, 24-hour, and night-shift work weeks', () => {
    const { Calendar } = Spread.Sheets.GanttSheet;
    const interval = (start: number, end: number) => ({ start: { hour: start, minute: 0 }, end: { hour: end, minute: 0 } });
    expect(Calendar.standard.name).toBe('Standard');
    expect(Calendar.standard.defaultWorkWeek.getWorkDay(0)).toEqual([]);
    expect(Calendar.standard.defaultWorkWeek.getWorkDay(1)).toEqual([interval(8, 12), interval(13, 17)]);
    expect(Calendar.standard.defaultWorkWeek.getWorkDay(6)).toEqual([]);
    expect(Calendar.hours24.defaultWorkWeek.getWorkDay(0)).toEqual([interval(0, 24)]);
    expect(Calendar.nightShift.defaultWorkWeek.getWorkDay(1)).toEqual([interval(23, 24)]);
    expect(Calendar.nightShift.defaultWorkWeek.getWorkDay(2)).toEqual([interval(0, 3), interval(4, 8), interval(23, 24)]);
    expect(Calendar.nightShift.defaultWorkWeek.getWorkDay(6)).toEqual([interval(0, 3), interval(4, 8)]);
  });
  it('copies calendar work weeks and rejects a week without seven days', () => {
    const { Calendar, WorkWeek } = Spread.Sheets.GanttSheet;
    const copy = Calendar.standard.copyTo('Copy');
    expect(copy.name).toBe('Copy');
    expect(copy.defaultWorkWeek).not.toBe(Calendar.standard.defaultWorkWeek);
    expect(copy.defaultWorkWeek.getWorkDay(1)).toEqual(Calendar.standard.defaultWorkWeek.getWorkDay(1));
    expect(() => new WorkWeek([])).toThrow('invalidWorkDays');
  });
  it('uses the trial appearance defaults', () => {
    const g = Spread.Sheets.GanttSheet;
    expect(new g.NonWorkingTimeStyle()).toMatchObject({ color: '#F7F7F7', drawMode: 'Behind', pattern: 'solidFill' });
    expect(new g.TaskbarLayout()).toMatchObject({ barHeight: 12, barTextDateFormat: 'yyyy/mm/dd hh:mm',
      linkLineMode: 'toTop', roundBarsToWholeDays: true, tipDateFormat: 'yyyy/mm/dd hh:mm' });
    expect(new g.TimescaleTier()).toMatchObject({ count: 1, labelAlign: 'Left', showTickLines: true });
    expect(new g.GanttGridlines()).toMatchObject({ currentDate: { lineColor: '#8BBF8A', lineType: 1 },
      ganttRows: { lineColor: 'transparent', lineType: 1 }, projectStart: { lineColor: '#808080', lineType: 4 } });
  });
});
