import { GeneralFormatter } from '../formatter.js';
import { CalendarSettings, type DurationUnit } from './calendar.js';

export type Duration = { value: number; unit: DurationUnit; time: number };

/** Converts common values used by Gantt data bindings. */
export class GanttMapping {
  constructor(private settings = new CalendarSettings()) {}
  formatBoolean(value: boolean): string { return value ? 'true' : 'false'; }
  parseBoolean(value: unknown): boolean | null | undefined {
    if (value == null) return value;
    if (typeof value === 'string') {
      const lower = value.toLowerCase();
      return lower === 'true' ? true : lower === 'false' ? false : undefined;
    }
    return Boolean(value);
  }
  formatInt(value: number): string | undefined {
    return typeof value === 'number' && !Number.isNaN(value) ? String(value) : undefined;
  }
  parseInt(value: unknown): number | undefined {
    const result = typeof value === 'number' ? value : Number.parseInt(String(value), 10);
    return Number.isNaN(result) ? undefined : result;
  }
  formatMode(value: string): 'Auto' | 'Manual' | undefined { return this.parseMode(value); }
  parseMode(value: unknown): 'Auto' | 'Manual' | undefined {
    if (typeof value !== 'string') return undefined;
    const lower = value.toLowerCase();
    return lower === 'auto' ? 'Auto' : lower === 'manual' ? 'Manual' : undefined;
  }
  formatDuration(value: unknown): string {
    if (typeof value === 'string') return value;
    if (!value || typeof value !== 'object') return '';
    const duration = value as Partial<Duration>;
    const units: DurationUnit[] = ['Minute', 'Hour', 'Day', 'Week', 'Month'];
    const index = Math.max(0, units.indexOf(duration.unit ?? this.settings.defaultDurationUnit));
    const digits = Math.max(0, Math.round(this.settings.defaultDurationDecimalDigits));
    const number = Math.round(Number(duration.value) * 10 ** digits) / 10 ** digits;
    const labels = number === 1 ? this.settings.unitLabels : this.settings.unitLabelsPlurals;
    return `${number} ${labels[index]}`;
  }
  /**
   * Parses a trial-observed duration string: a leading number, an optional unit word, and any
   * trailing text that is ignored. Unknown or missing unit words fall back to the default unit.
   */
  parseDuration(input: unknown): Duration | null {
    if (input == null) return null;
    let value: number | undefined;
    let unit = this.settings.defaultDurationUnit;
    let time: number | undefined;
    if (typeof input === 'string') {
      const match = /^\s*(\d+(?:\.\d+)?|\.\d+)\s*([a-z]*)/i.exec(input);
      if (!match) return null;
      value = Number(match[1]);
      const suffix = match[2]!.toLowerCase();
      if (/^(m|min|mins|minute|minutes)$/.test(suffix)) unit = 'Minute';
      else if (/^(h|hr|hrs|hour|hours)$/.test(suffix)) unit = 'Hour';
      else if (/^(w|wk|wks|week|weeks)$/.test(suffix)) unit = 'Week';
      else if (/^(mo|mon|mons|month|months)$/.test(suffix)) unit = 'Month';
    } else if (typeof input === 'number') value = input;
    else if (typeof input === 'object') {
      const duration = input as Partial<Duration>;
      unit = duration.unit ?? unit;
      value = duration.value;
      time = duration.time;
    } else return null;
    const factors: Record<DurationUnit, number> = { Minute: 60000, Hour: 3600000,
      Day: this.settings.hoursPerDay * 3600000, Week: this.settings.hoursPerWeek * 3600000,
      Month: this.settings.daysPerMonth * this.settings.hoursPerDay * 3600000 };
    const factor = factors[unit];
    if (!factor) return null;
    value = Math.max(0, value ?? (time === undefined ? 0 : time / factor));
    return { value, unit, time: value * factor };
  }
  formatDate(value: unknown, format = 'yyyy/mm/dd hh:mm', culture?: string): string | null {
    if (value == null || value === '' || value === 0) return null;
    let date: Date;
    if (value instanceof Date) date = value;
    else if ((typeof value === 'number' || typeof value === 'string') && Number.isFinite(Number(value))) {
      if (Number(value) === 0) return null;
      date = dateFromSerial(Number(value));
    } else return null;
    if (Number.isNaN(date.getTime())) return null;
    if (date.getFullYear() < 1900) {
      const surrogate = new Date(date);
      surrogate.setFullYear(2000);
      return new GeneralFormatter(format, culture).format(surrogate).replace(/2000/g, String(date.getFullYear()));
    }
    return new GeneralFormatter(format, culture).format(date);
  }
  parseDate(value: unknown, format = 'yyyy/mm/dd hh:mm', culture?: string): Date | undefined {
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? undefined : value;
    if (typeof value !== 'string' || !value.trim()) return undefined;
    const text = value.trim();
    if (/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(text)) return dateFromSerial(Number(text));
    let input = text;
    if (/^d{1,2}[^a-z]*m/i.test(format)) {
      input = text.replace(/^(\d{1,2})([-/.])(\d{1,2})([-/.])(\d{2,4})/, '$3$2$1$4$5');
    }
    const parsed = new GeneralFormatter(format, culture).parse(input);
    return parsed instanceof Date ? parsed : undefined;
  }
}

function dateFromSerial(serial: number): Date {
  const date = new Date(Date.UTC(1899, 11, 30) + serial * 86400000);
  return new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), date.getUTCHours(),
    date.getUTCMinutes(), date.getUTCSeconds(), date.getUTCMilliseconds());
}
