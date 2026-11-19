export type Time = { hour: number; minute: number };
export type WorkDay = { start: Time; end: Time }[];
export type DurationUnit = 'Month' | 'Week' | 'Day' | 'Hour' | 'Minute';

export class CalendarSettings {
  daysPerMonth = 20;
  defaultDurationDecimalDigits = 3;
  defaultDurationUnit: DurationUnit = 'Day';
  defaultFinishTime = { hour: 17, minute: 0 };
  defaultStartTime = { hour: 8, minute: 0 };
  hoursPerDay = 8;
  hoursPerWeek = 40;
  unitLabels = ['min', 'hr', 'day', 'wk', 'mon', 'yr'];
  unitLabelsPlurals = ['mins', 'hrs', 'days', 'wks', 'mons', 'yrs'];
  weekStartOn = 0;
}

export class WorkWeek {
  constructor(private workDays: WorkDay[]) {
    if (workDays.length !== 7) throw new Error('invalidWorkDays');
  }
  getWorkDay(index: number): WorkDay { return this.workDays[index]; }
}
export class CustomWorkWeek extends WorkWeek {
  start: Date;
  finish: Date;
  constructor(workDays: WorkDay[], start: Date, finish: Date) {
    super(workDays);
    Object.defineProperties(this, { start: { value: start, writable: true, enumerable: true },
      finish: { value: finish, writable: true, enumerable: true } });
    this.start = start;
    this.finish = finish;
  }
}
const interval = (start: number, end: number) => ({ start: { hour: start, minute: 0 }, end: { hour: end, minute: 0 } });
const standardDays = (): WorkDay[] => Array.from({ length: 7 }, (_, day) =>
  day === 0 || day === 6 ? [] : [interval(8, 12), interval(13, 17)]);
const nightDays = (): WorkDay[] => [[], [interval(23, 24)],
  ...Array.from({ length: 4 }, () => [interval(0, 3), interval(4, 8), interval(23, 24)]),
  [interval(0, 3), interval(4, 8)]];
export class Calendar {
  static standard = new Calendar('Standard', new WorkWeek(standardDays()));
  static hours24 = new Calendar('24 Hours', new WorkWeek(Array.from({ length: 7 }, () => [interval(0, 24)])));
  static nightShift = new Calendar('Night Shift', new WorkWeek(nightDays()));
  name: string;
  defaultWorkWeek: WorkWeek;
  customWorkWeeks: CustomWorkWeek[];
  constructor(name: string, defaultWorkWeek = new WorkWeek(standardDays()), customWorkWeeks: CustomWorkWeek[] = []) {
    Object.defineProperties(this, { name: { value: name, writable: true, enumerable: true },
      defaultWorkWeek: { value: defaultWorkWeek, writable: true, enumerable: true },
      customWorkWeeks: { value: customWorkWeeks, writable: true, enumerable: true } });
    this.name = name;
    this.defaultWorkWeek = defaultWorkWeek;
    this.customWorkWeeks = customWorkWeeks;
  }
  copyTo(newName: string): Calendar {
    const copyDays = (week: WorkWeek) => Array.from({ length: 7 }, (_, i) =>
      week.getWorkDay(i).map(time => ({ start: { ...time.start }, end: { ...time.end } })));
    return new Calendar(newName, new WorkWeek(copyDays(this.defaultWorkWeek)), this.customWorkWeeks.map(week =>
      new CustomWorkWeek(copyDays(week), new Date(week.start), new Date(week.finish))));
  }
}
