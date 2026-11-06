/** Additional text and locale functions. */
import {} from '../evaluate.js';
import { ErrorCode, error, normalizeNumber } from '../values.js';
import { type DefinedFunction, define } from './common.js';
import { textArg} from './text.js';

function isDoubleByte(codePoint: number): boolean {
  return codePoint > 0xff;
}
function byteLength(text: string): number {
  let length = 0;
  for (const char of text) length += isDoubleByte(char.codePointAt(0)!) ? 2 : 1;
  return length;
}

function byteSliceLeft(text: string, count: number): string {
  if (count <= 0) return '';
  let result = '';
  let bytes = 0;
  for (const char of text) {
    const size = isDoubleByte(char.codePointAt(0)!) ? 2 : 1;
    if (bytes + size > count) break;
    bytes += size;
    result += char;
  }
  return result;
}
function byteSliceRight(text: string, count: number): string {
  if (count <= 0) return '';
  let result = '';
  let bytes = 0;
  const chars = [...text];
  for (let index = chars.length - 1; index >= 0; index--) {
    const char = chars[index]!;
    const size = isDoubleByte(char.codePointAt(0)!) ? 2 : 1;
    if (bytes + size > count) break;
    bytes += size;
    result = char + result;
  }
  return result;
}
function byteSliceMid(text: string, start: number, count: number): string {
  const chars = [...text];
  let bytes = 0;
  let result = '';
  let taken = 0;
  for (let index = 0; index < chars.length; index++) {
    const char = chars[index]!;
    const size = isDoubleByte(char.codePointAt(0)!) ? 2 : 1;
    const position = bytes + 1;
    const end = bytes + size;
    if (position >= start && end <= start + count - 1 && taken < count) {
      // Only include whole characters that fit entirely in the window.
    }
    if (position >= start && end < start + count) {
      result += char;
      taken += size;
    }
    bytes = end;
  }
  return result;
}

function toHalfWidth(text: string): string {
  let result = '';
  for (const char of text) {
    const code = char.codePointAt(0)!;
    if (code >= 0xff01 && code <= 0xff5e) result += String.fromCharCode(code - 0xfee0);
    else if (code === 0x3000) result += ' ';
    else result += char;
  }
  return result;
}

const THAI_DIGITS = ['ศูนย์', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า'];
const THAI_PLACES = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน'];

function thaiInteger(value: number): string {
  if (value === 0) return 'ศูนย์';
  const groups: number[] = [];
  let remaining = Math.floor(value);
  while (remaining > 0) {
    groups.push(remaining % 1_000_000);
    remaining = Math.floor(remaining / 1_000_000);
  }
  const readGroup = (group: number): string => {
    let text = '';
    const digits = String(group).split('').reverse();
    for (let index = digits.length - 1; index >= 0; index--) {
      const digit = Number(digits[index]!);
      if (!digit) continue;
      if (index === 0 && digit === 1 && digits.length > 1) text += 'เอ็ด';
      else if (index === 1 && digit === 1) text += '';
      else if (index === 1 && digit === 2) text += 'ยี่';
      else text += THAI_DIGITS[digit]!;
      text += THAI_PLACES[index] ?? '';
    }
    return text;
  };
  let text = '';
  for (let index = groups.length - 1; index >= 0; index--) {
    const group = groups[index]!;
    if (!group) continue;
    text += readGroup(group);
    if (index > 0) text += 'ล้าน'.repeat(index);
  }
  return text;
}

function bahtText(value: number): string {
  const sign = value < 0 ? 'ลบ' : '';
  const absolute = Math.abs(value);
  const baht = Math.floor(absolute);
  const satang = Math.round((absolute - baht) * 100);
  return `${sign}${thaiInteger(baht)}บาท${satang ? `${thaiInteger(satang)}สตางค์` : 'ถ้วน'}`;
}

const EURO_RATES: Record<string, number> = {
  EUR: 1,
  DEM: 1.95583,
  FRF: 6.55957,
  ITL: 1936.27,
  ESP: 166.386,
  BEF: 40.3399,
  LUF: 40.3399,
  NLG: 2.20371,
  ATS: 13.7603,
  PTE: 200.482,
  IEP: 0.787564,
  FIM: 5.94573,
  GRD: 340.75,
  SIT: 239.64,
  CYP: 0.585274,
  MTL: 0.4293,
  SKK: 30.126,
  EEK: 15.6466,
  LVL: 0.702804,
  LTL: 3.4528,
  TRL: 1906032.5,
};

export const TEXT_EXTRA_FUNCTIONS: DefinedFunction[] = [
  define('ASC', 1, 1, (args) => toHalfWidth(textArg(args, 0))),
  define('BAHTTEXT', 1, 1, (args) => bahtText(args.number(0))),
  define('ENCODEURL', 1, 1, (args) => encodeURIComponent(textArg(args, 0)).replace(/'/g, '%27')),
  define('WEBSERVICE', 1, 1, () => ''),
  define('FILTERXML', 2, 2, () => error(ErrorCode.value)),
  define('GETPIVOTDATA', 2, 255, () => error(ErrorCode.ref)),
  define('EUROCONVERT', 3, 5, (args) => {
    const value = args.number(0);
    const source = args.text(1).toUpperCase();
    const target = args.text(2).toUpperCase();
    const from = EURO_RATES[source];
    const to = EURO_RATES[target];
    if (from === undefined || to === undefined) return error(ErrorCode.value);
    const fullPrecision = args.isMissing(3) ? false : args.boolean(3);
    const result = (value / from) * to;
    void fullPrecision;
    const decimals = target === 'EUR' ? 2 : 0;
    const scale = Math.pow(10, decimals);
    return normalizeNumber(Math.round(result * scale) / scale);
  }),
  define('LEFTB', 1, 2, (args) => {
    const text = textArg(args, 0);
    const count = args.isMissing(1) ? 1 : Math.trunc(args.number(1));
    if (count < 0) return error(ErrorCode.value);
    return byteSliceLeft(text, count);
  }),
  define('RIGHTB', 1, 2, (args) => {
    const text = textArg(args, 0);
    const count = args.isMissing(1) ? 1 : Math.trunc(args.number(1));
    if (count < 0) return error(ErrorCode.value);
    return byteSliceRight(text, count);
  }),
  define('MIDB', 2, 3, (args) => {
    const text = textArg(args, 0);
    const start = Math.trunc(args.number(1));
    const count = args.isMissing(2) ? 1 : Math.trunc(args.number(2));
    if (start < 1 || count < 0) return error(ErrorCode.value);
    return byteSliceMid(text, start, count);
  }),
  define('LENB', 1, 1, (args) => byteLength(textArg(args, 0))),
  define('FINDB', 2, 3, (args) => {
    const needle = textArg(args, 0);
    const haystack = textArg(args, 1);
    const start = args.isMissing(2) ? 1 : Math.trunc(args.number(2));
    const found = haystack.indexOf(needle, start - 1);
    if (found < 0) return error(ErrorCode.value);
    return byteLength(haystack.slice(0, found)) + 1;
  }),
  define('SEARCHB', 2, 3, (args) => {
    const needle = textArg(args, 0);
    const haystack = textArg(args, 1);
    const start = args.isMissing(2) ? 1 : Math.trunc(args.number(2));
    const found = haystack.toLowerCase().indexOf(needle.toLowerCase(), start - 1);
    if (found < 0) return error(ErrorCode.value);
    return byteLength(haystack.slice(0, found)) + 1;
  }),
  define('REPLACEB', 4, 4, (args) => {
    const text = textArg(args, 0);
    const start = Math.trunc(args.number(1));
    const count = Math.trunc(args.number(2));
    const replacement = textArg(args, 3);
    if (start < 1 || count < 0) return error(ErrorCode.value);
    const before = byteSliceLeft(text, start - 1);
    const after = byteSliceRight(text, byteLength(text) - (start - 1) - count);
    return before + replacement + after;
  }),
  define('PHONETIC', 1, 1, () => error(ErrorCode.name)),
  define('JIS', 1, 1, () => error(ErrorCode.name)),
  define('INFO', 1, 1, () => error(ErrorCode.name)),
];

export { byteLength, byteSliceLeft, byteSliceRight, bahtText };
