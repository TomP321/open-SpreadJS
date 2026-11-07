import * as SSF from 'ssf';
import { CultureInfo, CultureManager } from './culture.js';

const DAY = 86400000;
/** Excel's 1900 epoch, preserving the fictitious leap day in numeric values. */
export function dateToSerial(date: Date): number {
  const ms = Date.UTC(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    date.getHours(),
    date.getMinutes(),
    date.getSeconds(),
    date.getMilliseconds(),
  );
  const serial = (ms - Date.UTC(1899, 11, 31)) / DAY;
  return serial >= 60 ? serial + 1 : serial;
}
export function serialToDate(serial: number): Date {
  const date = new Date(Date.UTC(1899, 11, 31) + (serial >= 60 ? serial - 1 : serial) * DAY);
  return new Date(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    date.getUTCHours(),
    date.getUTCMinutes(),
    date.getUTCSeconds(),
    date.getUTCMilliseconds(),
  );
}
export function splitSections(format: string): string[] {
  const result: string[] = [];
  let text = '',
    quoted = false,
    escaped = false;
  for (const char of format) {
    if (char === ';' && !quoted && !escaped) {
      result.push(text);
      text = '';
    } else text += char;
    if (char === '"' && !escaped) quoted = !quoted;
    escaped = char === '\\' && !escaped;
  }
  result.push(text);
  return result;
}
function matchesCondition(value: number, op: string, rhs: number): boolean {
  switch (op) {
    case '<':
      return value < rhs;
    case '>':
      return value > rhs;
    case '<=':
      return value <= rhs;
    case '>=':
      return value >= rhs;
    case '=':
      return value === rhs;
    case '<>':
      return value !== rhs;
    default:
      return false;
  }
}
function sectionFor(format: string, value: unknown): string {
  const sections = splitSections(format);
  if (typeof value === 'string') return sections[3] ?? (sections.length === 1 ? sections[0] : '@');
  const num = value instanceof Date ? dateToSerial(value) : Number(value);
  if (sections.slice(0, 2).some((s) => /\[(?:[<>]=?|=|<>)/.test(s))) {
    for (const section of sections.slice(0, 3)) {
      const condition = section.match(/\[(<=|>=|<>|<|>|=)(-?[\d.]+)\]/);
      if (!condition || matchesCondition(num, condition[1], Number(condition[2]))) return section;
    }
    return '';
  }
  return sections[num < 0 ? Math.min(1, sections.length - 1) : num === 0 && sections.length > 2 ? 2 : 0];
}
const colors = /\[(Black|Blue|Cyan|Green|Magenta|Red|White|Yellow|Color\d+)\]/i;
export interface FormattedData {
  conditionalForeColor?: string;
  value?: string;
  content?: { type: string; value: string }[];
  [key: string]: unknown;
}
export class GeneralFormatter {
  private pattern: string;
  constructor(
    format = 'General',
    private cultureName?: string,
  ) {
    this.pattern = format || 'General';
  }
  formatString(): string;
  formatString(value: string): this;
  formatString(value?: string): string | this {
    if (value === undefined) return this.pattern;
    this.pattern = value || 'General';
    return this;
  }
  format(value: unknown, data?: FormattedData): string {
    if (value == null) return '';
    if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
    // SSF accepts primitive text/numbers, whereas the public formatter also
    // accepts calculation errors, arrays and arbitrary application objects.
    if (typeof value === 'object' && !(value instanceof Date)) return String(value);
    if (typeof value === 'number' && !Number.isFinite(value)) return String(value);
    const culture = this.culture();
    const format = this.pattern;
    const section = sectionFor(format, value);
    const color = section.match(colors)?.[1];
    if (color && data) {
      data.value = color;
      data.conditionalForeColor = color;
    }
    const raw = value instanceof Date ? dateToSerial(value) : value;
    let text: string;
    if (format.toLowerCase() === 'general' && value instanceof Date) {
      const date = value as Date;
      const hasTime = date.getHours() || date.getMinutes() || date.getSeconds() || date.getMilliseconds();
      text = SSF.format(hasTime ? 'm/d/yyyy h:mm:ss' : 'm/d/yyyy', raw as number);
    }
    else {
      try {
        if (typeof raw === 'number' && !SSF.is_date(section)) {
          const sections = splitSections(format);
          const conditional = sections.slice(0, 2).some((s) => /\[(?:[<>]=?|=|<>)/.test(s));
          const numericFormat = section.replace(/\[(?:<=|>=|<>|<|>|=)-?[\d.]+\]/g, '');
          text = SSF.format(numericFormat, Math.abs(raw));
          if (raw < 0 && (sections.length === 1 || conditional)) text = '-' + text;
          const exponent = section.match(/[eE][+-](0+)/)?.[1].length;
          if (exponent)
            text = text.replace(
              /([eE][+-]?)(\d+)/,
              (_match, prefix: string, digits: string) => prefix + digits.padStart(exponent, '0'),
            );
        } else text = SSF.format(format, raw as number | string);
      } catch (error) {
        throw new Error(`NotImplemented: GeneralFormatter format ${format}`, { cause: error });
      }
    }
    if (SSF.is_date(section)) text = this.localizeDate(text, culture);
    else text = this.localizeNumber(text, culture, section);
    if (data) data.content = this.content(text, culture);
    return text;
  }
  parse(input: string): unknown {
    const text = input.trim();
    if (!text) return null;
    if (/^(true|false)$/i.test(text)) return text.toLowerCase() === 'true';
    if (this.pattern === '@') return input;
    const culture = this.culture();
    const general = /^general$/i.test(this.pattern);
    if ((general || SSF.is_date(this.pattern)) && /[\d]/.test(text)) {
      const date = this.parseDate(text, culture);
      if (date) return date;
    }
    const num = this.parseNumber(text, culture);
    if (num !== null) return num;
    return general ? input : null;
  }
  private culture(): CultureInfo {
    const locale = this.pattern.match(/\[\$[^\]]*-([0-9a-f]+)\]/i)?.[1];
    return (
      (locale ? CultureManager.getCultureInfo(parseInt(locale, 16)) : undefined) ??
      CultureManager.getCultureInfo(this.cultureName) ??
      CultureManager.getCultureInfo('en-us')
    );
  }
  private localizeNumber(text: string, culture: CultureInfo, section: string): string {
    const nf = culture.NumberFormat;
    const decimal = nf.numberDecimalSeparator ?? '.',
      group = nf.numberGroupSeparator ?? ',';
    // Only unquoted numeric punctuation is localized. Literal prefixes and suffixes retain their spelling.
    if (decimal === '.' && group === ',') return text;
    const first = text.search(/\d/),
      last = Math.max(...[...text.matchAll(/\d/g)].map((m) => m.index ?? 0));
    if (first < 0 || !/[0#?]/.test(section)) return text;
    return (
      text.slice(0, first) +
      text.slice(first, last + 1).replace(/[.,]/g, (c) => (c === '.' ? decimal : group)) +
      text.slice(last + 1)
    );
  }
  private localizeDate(text: string, culture: CultureInfo): string {
    const en = CultureManager.getCultureInfo('en-us').DateTimeFormat,
      local = culture.DateTimeFormat;
    const replacements = new Map<string, string>();
    for (const key of ['monthNames', 'abbreviatedMonthNames', 'dayNames', 'abbreviatedDayNames'] as const) {
      en[key]?.forEach((word, i) => {
        if (word && local[key]?.[i]) replacements.set(word, local[key]![i]);
      });
    }
    if (local.amDesignator) replacements.set('AM', local.amDesignator);
    if (local.pmDesignator) replacements.set('PM', local.pmDesignator);
    return text.replace(/[A-Za-z]+/g, (word) => replacements.get(word) ?? word);
  }
  private content(text: string, culture: CultureInfo): { type: string; value: string }[] {
    const decimal = culture.NumberFormat.numberDecimalSeparator ?? '.',
      group = culture.NumberFormat.numberGroupSeparator ?? ',';
    const tokens: { type: string; value: string }[] = [];
    for (const value of text.match(/\d+|[^\d]/g) ?? []) {
      const type = /^\d/.test(value)
        ? 'number'
        : value === decimal
          ? 'decimalSeparator'
          : value === group
            ? 'groupSeparator'
            : 'text';
      const last = tokens.at(-1);
      if (type === 'text' && last?.type === type) last.value += value;
      else tokens.push({ type, value });
    }
    return tokens;
  }
  private parseNumber(input: string, culture: CultureInfo): number | null {
    const nf = culture.NumberFormat;
    let text = input;
    const literals = [...this.pattern.matchAll(/"([^"]*)"|\\(.)/g)]
      .map((match) => match[1] ?? match[2])
      .filter(Boolean);
    for (const literal of literals) {
      if (text.startsWith(literal)) text = text.slice(literal.length);
      if (text.endsWith(literal)) text = text.slice(0, -literal.length);
    }
    text = text.trim();
    const negative = /^\(.*\)$/.test(text);
    if (negative) text = text.slice(1, -1);
    for (const currency of new Set([nf.currencySymbol, '$', '€', '£', '¥', '¤']))
      if (currency) text = text.split(currency).join('');
    const group = nf.numberGroupSeparator ?? ',',
      decimal = nf.numberDecimalSeparator ?? '.';
    if (group) text = text.split(group).join('');
    if (decimal !== '.') text = text.split(decimal).join('.');
    text = text.trim();
    const percent = /%$/.test(text);
    if (percent) text = text.slice(0, -1).trim();
    const fraction = text.match(/^(-?\d+\s+)?(\d+)\/(\d+)$/);
    if (fraction && /\?\s*\//.test(this.pattern)) {
      const integer = Number(fraction[1] ?? 0),
        denominator = Number(fraction[3]);
      return denominator
        ? (integer < 0 ? -1 : 1) * (Math.abs(integer) + Number(fraction[2]) / denominator)
        : null;
    }
    if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(text)) return null;
    const result = (Number(text) * (negative ? -1 : 1)) / (percent ? 100 : 1);
    return Number.isFinite(result) ? result : null;
  }
  private parseDate(text: string, culture: CultureInfo): Date | null {
    const time = text.match(/^(\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?\s*(AM|PM)?$/i);
    if (time) {
      let hour = Number(time[1]);
      const minute = Number(time[2]),
        second = Number(time[3] ?? 0);
      if (time[5]) {
        if (hour < 1 || hour > 12) return null;
        hour = (hour % 12) + (time[5].toUpperCase() === 'PM' ? 12 : 0);
      }
      if (hour > 23 || minute > 59 || second > 59) return null;
      return new Date(1899, 11, 30, hour, minute, second, Math.round(Number('0.' + (time[4] ?? 0)) * 1000));
    }
    const parts = text.match(
      /^(\d{1,4})[-/.](\d{1,2})[-/.](\d{1,4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*(AM|PM))?)?$/i,
    );
    if (parts) {
      const order = (culture.DateTimeFormat.shortDatePattern ?? 'M/d/yyyy').toLowerCase();
      let y: number, m: number, d: number;
      if (parts[1].length === 4) {
        y = +parts[1];
        m = +parts[2];
        d = +parts[3];
      } else {
        y = +parts[3];
        m = +(order.startsWith('d') ? parts[2] : parts[1]);
        d = +(order.startsWith('d') ? parts[1] : parts[2]);
      }
      if (y < 100) y += y < 30 ? 2000 : 1900;
      let h = +(parts[4] ?? 0);
      if (parts[7]) h = (h % 12) + (parts[7].toUpperCase() === 'PM' ? 12 : 0);
      const result = new Date(y, m - 1, d, h, +(parts[5] ?? 0), +(parts[6] ?? 0));
      return result.getFullYear() === y &&
        result.getMonth() === m - 1 &&
        result.getDate() === d &&
        h < 24 &&
        +(parts[5] ?? 0) < 60 &&
        +(parts[6] ?? 0) < 60
        ? result
        : null;
    }
    const monthText = text.match(/^(?:(\d{1,2})[\s-]+)?([\p{L}]+)[\s-]+(\d{1,4})(?:,?\s+(\d{2,4}))?$/u);
    if (monthText) {
      const months = culture.DateTimeFormat.monthNames ?? [],
        abbr = culture.DateTimeFormat.abbreviatedMonthNames ?? [];
      const m = months.findIndex((x) => x.toLowerCase() === monthText[2].toLowerCase());
      const index = m >= 0 ? m : abbr.findIndex((x) => x.toLowerCase() === monthText[2].toLowerCase());
      if (index >= 0) {
        const d = Number(monthText[1] ?? monthText[3]),
          y = Number(monthText[4] ?? (monthText[1] ? monthText[3] : new Date().getFullYear()));
        const date = new Date(y, index, d);
        if (date.getDate() === d) return date;
      }
    }
    return null;
  }
}
