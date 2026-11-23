/** Text functions. */
import { GeneralFormatter } from '../../formatter.js';
import { Args, EvalContext, raise, raiseError } from '../evaluate.js';
import {
  CalcArray,
  CalcError,
  ErrorCode,
  ReferenceValue,
  ScalarValue,
  Value,
  dateToSerial,
  error,
  isError,
  numberToText,
  parseNumberText,
} from '../values.js';
import { type DefinedFunction, allEntries, define, entries } from './common.js';

function scalarText(value: ScalarValue): string {
  if (value === null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (typeof value === 'number') return numberToText(value);
  if (value instanceof Date) return numberToText(dateToSerial(value));
  if (isError(value)) raiseError(value);
  return '';
}

function textArg(args: Args, index: number): string {
  const value = args.scalar(index);
  if (isError(value)) raiseError(value);
  return scalarText(value);
}

function integerArg(args: Args, index: number, fallback: number): number {
  if (args.isMissing(index)) return fallback;
  return Math.trunc(args.number(index));
}

function flattenText(args: Args, ctx: EvalContext, start: number): string[] {
  const result: string[] = [];
  for (let index = start; index < args.count; index++) {
    const value = args.value(index);
    if (value instanceof ReferenceValue || value instanceof CalcArray) {
      for (const entry of entries(args, ctx, index)) {
        if (isError(entry.value)) raiseError(entry.value);
        result.push(scalarText(entry.value));
      }
    } else {
      if (isError(value)) raiseError(value);
      result.push(scalarText(value as ScalarValue));
    }
  }
  return result;
}

function substitute(text: string, oldText: string, newText: string, instance?: number): string {
  if (oldText === '') return text;
  if (instance === undefined) return text.split(oldText).join(newText);
  if (instance < 1) raise(ErrorCode.value);
  let count = 0;
  let index = 0;
  let result = '';
  while (index < text.length) {
    const found = text.indexOf(oldText, index);
    if (found < 0) break;
    count++;
    if (count === instance) return result + text.slice(index, found) + newText + text.slice(found + oldText.length);
    result += text.slice(index, found) + oldText;
    index = found + oldText.length;
  }
  return text;
}

function wildcardRegExp(pattern: string): RegExp {
  let source = '';
  for (let index = 0; index < pattern.length; index++) {
    const char = pattern[index]!;
    if (char === '~' && index + 1 < pattern.length) {
      source += escape(pattern[++index]!);
    } else if (char === '*') source += '[\\s\\S]*';
    else if (char === '?') source += '[\\s\\S]';
    else source += escape(char);
  }
  return new RegExp(source, 'i');
}
function escape(value: string): string {
  return value.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');
}

function searchText(haystack: string, needle: string, start: number, wildcard: boolean): number {
  if (start < 1 || start > haystack.length + 1) return -1;
  if (!wildcard) {
    const found = haystack.indexOf(needle, start - 1);
    return found < 0 ? -1 : found + 1;
  }
  const regexp = new RegExp(`(?:${wildcardRegExp(needle).source})`, 'gi');
  regexp.lastIndex = start - 1;
  const match = regexp.exec(haystack);
  return match ? match.index + 1 : -1;
}

function textBeforeAfter(
  args: Args,
  ctx: EvalContext,
  after: boolean,
): Value {
  const text = textArg(args, 0);
  const delimiter = textArg(args, 1);
  const instance = args.isMissing(2) ? 1 : Math.trunc(args.number(2));
  if (instance === 0) return error(ErrorCode.value);
  const matchMode = args.isMissing(3) ? 0 : Math.trunc(args.number(3));
  const matchEnd = args.isMissing(4) ? 0 : Math.trunc(args.number(4));
  const notFound = () => (args.isMissing(5) ? error(ErrorCode.na) : args.value(5));
  if (delimiter === '') return notFound();
  const haystack = matchMode === 1 ? text.toLowerCase() : text;
  const needle = matchMode === 1 ? delimiter.toLowerCase() : delimiter;
  const positions: { start: number; end: number }[] = [];
  let from = 0;
  while (from <= haystack.length) {
    const found = haystack.indexOf(needle, from);
    if (found < 0) break;
    positions.push({ start: found, end: found + delimiter.length });
    from = found + Math.max(1, delimiter.length);
  }
  if (!positions.length) return notFound();
  const selected =
    instance > 0 ? positions[instance - 1] : positions[positions.length + instance];
  if (!selected) return notFound();
  void ctx;
  if (after) {
    const start = selected.end;
    if (matchEnd === 1 && start === text.length) return '';
    return text.slice(start);
  }
  void matchEnd;
  return text.slice(0, selected.start);
}

export const TEXT_FUNCTIONS: DefinedFunction[] = [
  define('CONCATENATE', 1, 255, (args) => {
    const parts: string[] = [];
    for (let index = 0; index < args.count; index++) parts.push(textArg(args, index));
    return parts.join('');
  }),
  define('CONCAT', 1, 255, (args, ctx) => flattenText(args, ctx, 0).join('')),
  define('TEXTJOIN', 2, 255, (args, ctx) => {
    const delimiter = textArg(args, 0);
    const ignoreEmpty = args.boolean(1);
    const parts = flattenText(args, ctx, 2).filter((part) => !ignoreEmpty || part !== '');
    return parts.join(delimiter);
  }),
  define('LEFT', 1, 2, (args) => {
    const text = textArg(args, 0);
    const count = integerArg(args, 1, 1);
    if (count < 0) return error(ErrorCode.value);
    return [...text].slice(0, count).join('');
  }),
  define('RIGHT', 1, 2, (args) => {
    const text = textArg(args, 0);
    const count = integerArg(args, 1, 1);
    if (count < 0) return error(ErrorCode.value);
    if (count === 0) return '';
    return [...text].slice(-count).join('');
  }),
  define('MID', 3, 3, (args) => {
    const text = textArg(args, 0);
    const start = Math.trunc(args.number(1));
    const count = Math.trunc(args.number(2));
    if (start < 1 || count < 0) return error(ErrorCode.value);
    return [...text].slice(start - 1, start - 1 + count).join('');
  }),
  define('LEN', 1, 1, (args) => [...textArg(args, 0)].length),
  define('TRIM', 1, 1, (args) => textArg(args, 0).replace(/\s+/g, ' ').trim()),
  define('UPPER', 1, 1, (args) => textArg(args, 0).toUpperCase()),
  define('LOWER', 1, 1, (args) => textArg(args, 0).toLowerCase()),
  define('PROPER', 1, 1, (args) => {
    const text = textArg(args, 0).toLowerCase();
    let result = '';
    let capitalize = true;
    for (const char of text) {
      if (/[a-z\u00c0-\u024f]/.test(char)) {
        result += capitalize ? char.toUpperCase() : char;
        capitalize = false;
      } else {
        result += char;
        capitalize = !/[0-9']/.test(char);
      }
    }
    return result;
  }),
  define('FIND', 2, 3, (args) => {
    const needle = textArg(args, 0);
    const haystack = textArg(args, 1);
    const start = integerArg(args, 2, 1);
    const found = searchText(haystack, needle, start, false);
    return found < 0 ? error(ErrorCode.value) : found;
  }),
  define('SEARCH', 2, 3, (args) => {
    const needle = textArg(args, 0);
    const haystack = textArg(args, 1);
    const start = integerArg(args, 2, 1);
    const found = searchText(haystack, needle, start, true);
    return found < 0 ? error(ErrorCode.value) : found;
  }),
  define('SUBSTITUTE', 3, 4, (args) => {
    const text = textArg(args, 0);
    const oldText = textArg(args, 1);
    const newText = textArg(args, 2);
    const instance = args.isMissing(3) ? undefined : Math.trunc(args.number(3));
    return substitute(text, oldText, newText, instance);
  }),
  define('REPLACE', 4, 4, (args) => {
    const text = textArg(args, 0);
    const start = Math.trunc(args.number(1));
    const count = Math.trunc(args.number(2));
    const newText = textArg(args, 3);
    if (start < 1 || count < 0) return error(ErrorCode.value);
    const chars = [...text];
    return chars.slice(0, start - 1).join('') + newText + chars.slice(start - 1 + count).join('');
  }),
  define('REPT', 2, 2, (args) => {
    const text = textArg(args, 0);
    const count = Math.trunc(args.number(1));
    if (count < 0) return error(ErrorCode.value);
    return text.repeat(count);
  }),
  define('EXACT', 2, 2, (args) =>
    textArg(args, 0) === textArg(args, 1),
  ),
  define('VALUE', 1, 1, (args) => {
    const value = args.value(0);
    if (isError(value)) return value;
    if (typeof value === 'number') return value;
    if (value instanceof Date) return dateToSerial(value);
    if (typeof value === 'boolean') return error(ErrorCode.value);
    const text = textArg(args, 0).trim();
    if (!text) return error(ErrorCode.value);
    const percent = text.endsWith('%');
    const numeric = parseNumberText(text);
    if (numeric !== undefined) return percent ? numeric : numeric;
    const serial = parseDateText(text);
    if (serial !== undefined) return serial;
    return error(ErrorCode.value);
  }),
  define('TEXT', 2, 2, (args) => {
    const value = args.value(0);
    if (isError(value)) return value;
    if (typeof value === 'string') {
      const parsed = parseNumberText(value);
      if (parsed === undefined) return value;
    }
    const format = textArg(args, 1);
    const numeric = value instanceof Date ? dateToSerial(value) : args.number(0);
    if (/^general$/i.test(format)) return numberToText(numeric);
    if (!format) return '';
    try {
      return new GeneralFormatter(format).format(numeric);
    } catch {
      return error(ErrorCode.value);
    }
  }),
  define('FIXED', 1, 3, (args) => {
    const value = args.number(0);
    const decimals = integerArg(args, 1, 2);
    const noCommas = args.isMissing(2) ? false : args.boolean(2);
    if (decimals < 0) return error(ErrorCode.value);
    const format = `${noCommas ? '' : '#,##'}0${decimals ? '.' + '0'.repeat(decimals) : ''}`;
    return new GeneralFormatter(format).format(value);
  }),
  define('DOLLAR', 1, 2, (args) => {
    const value = args.number(0);
    const decimals = integerArg(args, 1, 2);
    if (decimals < 0) return error(ErrorCode.value);
    const format = `$#,##0${decimals ? '.' + '0'.repeat(decimals) : ''}`;
    try {
      return new GeneralFormatter(format).format(value);
    } catch {
      return error(ErrorCode.value);
    }
  }),
  define('CHAR', 1, 1, (args) => {
    const value = Math.trunc(args.number(0));
    if (value < 1 || value > 255) return error(ErrorCode.value);
    return String.fromCharCode(value);
  }),
  define('CODE', 1, 1, (args) => {
    const text = textArg(args, 0);
    if (!text) return error(ErrorCode.value);
    return text.charCodeAt(0);
  }),
  define('UNICHAR', 1, 1, (args) => {
    const value = Math.trunc(args.number(0));
    if (value < 1 || value > 0x10ffff) return error(ErrorCode.value);
    try {
      return String.fromCodePoint(value);
    } catch {
      return error(ErrorCode.value);
    }
  }),
  define('UNICODE', 1, 1, (args) => {
    const text = textArg(args, 0);
    if (!text) return error(ErrorCode.value);
    return text.codePointAt(0)!;
  }),
  define('CLEAN', 1, 1, (args) => textArg(args, 0).replace(/[\u0000-\u001f]/g, '')),
  define('TEXTBEFORE', 2, 6, (args, ctx) => textBeforeAfter(args, ctx, false)),
  define('TEXTAFTER', 2, 6, (args, ctx) => textBeforeAfter(args, ctx, true)),
  define('VALUETOTEXT', 1, 2, (args, ctx) => {
    const value = args.value(0);
    if (value instanceof ReferenceValue || value instanceof CalcArray) {
      const matrix = args.matrix(0);
      return scalarText(matrix.at(0, 0));
    }
    void ctx;
    return scalarText(value as ScalarValue);
  }),
  define('ARRAYTOTEXT', 1, 2, (args) => {
    const matrix = args.matrix(0);
    const values: string[] = [];
    for (let row = 0; row < matrix.rowCount; row++)
      for (let col = 0; col < matrix.colCount; col++) {
        const value = matrix.at(row, col);
        if (isError(value)) values.push(value.error);
        else values.push(scalarText(value));
      }
    return values.join(', ');
  }),
];

/** Parses common date/time text into a SpreadJS serial number. */
export function parseDateText(input: string): number | undefined {
  const text = input.trim();
  if (!text) return undefined;
  const timeMatch = /^(\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?\s*(am|pm)?$/i.exec(text);
  if (timeMatch) {
    let hours = Number(timeMatch[1]);
    const minutes = Number(timeMatch[2]);
    const seconds = Number(timeMatch[3] ?? 0);
    const fraction = timeMatch[4] ? Number('0.' + timeMatch[4]) : 0;
    const meridiem = timeMatch[5]?.toLowerCase();
    if (meridiem === 'pm' && hours < 12) hours += 12;
    if (meridiem === 'am' && hours === 12) hours = 0;
    if (minutes > 59 || seconds > 59 || hours > 23) return undefined;
    return (hours * 3600 + minutes * 60 + seconds + fraction) / 86400;
  }
  const patterns: { regexp: RegExp; map: (match: RegExpExecArray) => [number, number, number] }[] = [
    { regexp: /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/, map: (m) => [Number(m[1]), Number(m[2]), Number(m[3])] },
    { regexp: /^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/, map: (m) => [normalizeYear(Number(m[3])), Number(m[1]), Number(m[2])] },
    { regexp: /^(\d{1,2})[-/](\d{1,2})$/, map: (m) => [new Date().getFullYear(), Number(m[1]), Number(m[2])] },
  ];
  for (const pattern of patterns) {
    const match = pattern.regexp.exec(text);
    if (!match) continue;
    const [year, month, day] = pattern.map(match);
    if (month < 1 || month > 12 || day < 1 || day > 31) return undefined;
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCMonth() !== month - 1) return undefined;
    return (date.getTime() - Date.UTC(1899, 11, 30)) / 86400000;
  }
  return undefined;
}

function normalizeYear(year: number): number {
  if (year < 100) return year < 30 ? 2000 + year : 1900 + year;
  return year;
}

export { textArg, scalarText, flattenText };
export { allEntries };
export type { CalcError };
