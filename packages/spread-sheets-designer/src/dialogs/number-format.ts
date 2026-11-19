/* Format Cells > Number tab state model: the trial's category list, per-category option
 * tables (labels transcribed from the running trial UI) and the formatter the trial writes
 * for each combination. Shared by the dialog UI, the dialog loader (buildFormatData) and
 * the applyFormatCells command so all three agree on one mapping. */

export const NUMBER_CATEGORIES = [
  'General', 'Number', 'Currency', 'Accounting', 'Date', 'Time', 'Percentage', 'Fraction', 'Scientific', 'Text', 'Special', 'Custom',
] as const;

export const SYMBOL_ITEMS = [
  'None', '$ English (United States)', '¥ Japanese (Japan)', '¥ Chinese (China)', '₩ Korean (Korea)',
];
export const LOCALE_ITEMS = ['English (United States)', 'Japanese (Japan)', 'Chinese (China)', 'Korean (Korea)'];
export const DATE_TYPES = [
  '3/14/2001', 'Wednesday, March 14, 2001', '3/14', '3/14/01', '03/14/01', '14-Mar', '14-Mar-01', 'Mar-01',
  'March-01', 'March 14, 2001', '3/14/01 1:30 PM', '3/14/01 13:30', 'M', 'M-01', '3/14/2001', '14-Mar-2001',
];
export const TIME_TYPES = ['1:30:00 PM', '13:30', '1:30 PM', '13:30:00', '1:30:00 PM', '30:00.0', '887149:30:00', '3/14/01 1:30 PM', '3/14/01 13:30'];
export const FRACTION_TYPES = [
  'Up to one digit (1/4)', 'Up to two digits (21/25)', 'Up to three digits (312/943)', 'As halves (1/2)',
  'As quarters (2/4)', 'As eighths (4/8)', 'As sixteenths (8/16)', 'As tenths (3/10)', 'As hundredths (30/100)',
];
export const SPECIAL_TYPES = ['Zip Code', 'Zip Code + 4', 'Phone Number', 'Social Security Number'];
/** The Custom category "Type:" list, in the order the trial shows it. */
export const CUSTOM_CODES = [
  'General', '0', '0.00', '#,##0', '#,##0.00', '#,##0;(#,##0)', '#,##0;[Red](#,##0)', '#,##0.00;(#,##0.00)',
  '#,##0.00;[Red](#,##0.00)', '[>=1000000]0,,"M";[>=1000]0,"K";0', '$#,##0;($#,##0)', '$#,##0;[Red]($#,##0)',
  '$#,##0.00;($#,##0.00)', '$#,##0.00;[Red]($#,##0.00)', '0%', '0.00%', '0.00E+00', '##0.0E+0', '# ?/?',
  '# ??/??', 'm/d/yyyy', 'd-mmm-yy', 'd-mmm', 'mmm-yy', 'h:mm AM/PM', 'h:mm:ss AM/PM', 'hh:mm', 'hh:mm:ss',
  'm/d/yyyy hh:mm', 'mm:ss', 'mm:ss.0', '@', '[h]:mm:ss', '$ #,##0;$ (#,##0);$ "-";@', '#,##0; (#,##0); "-";@',
  '$ #,##0.00;$ (#,##0.00);$ "-"??;@', '#,##0.00; (#,##0.00); "-"??;@', 'hh:mm:ss', '00000', '# ???/???',
  '000-00-0000', 'dddd, mmmm dd, yyyy', 'm/d;@', '[<=9999999]###-####;(###) ###-####', '# ?/8',
];

/* Built-in codes behind each Type list, by option index (standard Excel codes; the trial's
 * Sample box renders these codes over the cell value). */
export const DATE_TYPE_FORMATS = [
  'm/d/yyyy', 'dddd, mmmm d, yyyy', 'm/d', 'm/d/yy', 'mm/dd/yy', 'd-mmm', 'd-mmm-yy', 'mmm-yy',
  'mmmm-yy', 'mmmm d, yyyy', 'm/d/yy h:mm AM/PM', 'm/d/yy hh:mm', 'm', 'm-yy', 'm/d/yyyy', 'd-mmm-yyyy',
];
export const TIME_TYPE_FORMATS = ['h:mm:ss AM/PM', 'hh:mm', 'h:mm AM/PM', 'hh:mm:ss', 'h:mm:ss AM/PM', 'mm:ss.0', '[h]:mm:ss', 'm/d/yy h:mm AM/PM', 'm/d/yy hh:mm'];
export const FRACTION_TYPE_FORMATS = ['# ?/?', '# ??/??', '# ???/???', '# ?/2', '# ?/4', '# ?/8', '# ?/16', '# ?/10', '# ?/100'];
export const SPECIAL_TYPE_FORMATS = ['00000', '00000-0000', '[<=9999999]###-####;(###) ###-####', '000-00-0000'];

/** TextDecorationType bits behind the Font tab's Underline combo items (None/Single/Double/
 * Single Accounting/Double Accounting), shared by dialog and writer. */
export const UNDERLINE_DECORATION = [0, 1, 8, 16, 32] as const;

/** Symbol token written into Currency/Accounting formats, by Symbol combo index ('' = None).
 * These are the locale-tagged tokens the trial writes (probed .probe/t43/official-formatters.json:
 * $ English (United States) -> "[$$-409]"). */
const CURRENCY_TOKEN: Record<number, string> = { 0: '', 1: '[$$-409]', 2: '[$¥-411]', 3: '[¥-804]', 4: '[$₩-412]' };
/** BCP-ish locale ids behind the locale (location) combo, index-aligned with LOCALE_ITEMS. */
const LOCALE_ID = ['409', '411', '804', '412'];

export interface NumberOptions {
  decimals?: number; separator?: boolean; negative?: number; symbol?: number; type?: number; locale?: number;
}

/** The formatter the trial writes for the current Number-tab state (undefined = General). */
export function numberFormatterFor(category: string, o: NumberOptions): string | undefined {
  const d = Math.min(30, Math.max(0, Math.round(Number(o.decimals ?? 2))));
  const dp = d > 0 ? `.${'0'.repeat(d)}` : '';
  const neg = Math.min(3, Math.max(0, Number(o.negative ?? 0)));
  const locale = LOCALE_ID[Number(o.locale ?? 0)] ?? '409';
  // Section for the Negative numbers list; index 0 (the default) writes no section at all.
  const negativeSection = (pos: string): string => (neg === 0 ? '' : `;${['', '[Red]', '', '[Red]'][neg]}${neg >= 2 ? `(${pos})` : `-${pos}`}`);
  switch (category) {
    case 'General': return undefined;
    case 'Text': return '@';
    case 'Number': return `${o.separator ? '#,##0' : '0'}${dp}` + negativeSection(`${o.separator ? '#,##0' : '0'}${dp}`);
    case 'Percentage': return d > 0 ? `0${dp}%` : '0%';
    case 'Scientific': return `0${dp}E+00`;
    case 'Currency': {
      const sym = CURRENCY_TOKEN[o.symbol ?? 1] ?? '[$$-409]';
      const pos = `${sym}#,##0${dp}`;
      return pos + negativeSection(pos);
    }
    case 'Accounting': {
      const sym = CURRENCY_TOKEN[o.symbol ?? 1] ?? '[$$-409]';
      if (!sym) return `_(* #,##0${dp}_);_(* (#,##0${dp});_(* "-"??_);_(@_)`;
      return `_(${sym}* #,##0${dp}_);_(${sym}* (#,##0${dp});_(${sym}* "-"??_);_(@_)`;
    }
    case 'Date': return DATE_TYPE_FORMATS[Math.min(DATE_TYPE_FORMATS.length - 1, Math.max(0, Number(o.type ?? 0)))];
    case 'Time': return `[$-${locale}]${TIME_TYPE_FORMATS[Math.min(TIME_TYPE_FORMATS.length - 1, Math.max(0, Number(o.type ?? 0)))]}`;
    case 'Fraction': return FRACTION_TYPE_FORMATS[Math.min(FRACTION_TYPE_FORMATS.length - 1, Math.max(0, Number(o.type ?? 0)))];
    case 'Special': return SPECIAL_TYPE_FORMATS[Math.min(SPECIAL_TYPE_FORMATS.length - 1, Math.max(0, Number(o.type ?? 0)))];
    default: return undefined;
  }
}

/** Locale tags the trial prefixes codes with: `[$$-409]`, `[$-409]`, `[¥-804]`, ... */
const LOCALE_TAG = /^\[(?:\$\$?|[¥₩])+-[0-9a-fA-F]+\]/;

/** Category the trial shows when opening the dialog on a cell with this formatter. */
export function numberCategoryForFormat(input: string): string {
  const code = String(input ?? '').replace(LOCALE_TAG, '');
  if (!code || code === 'General') return 'General';
  const typeOf = (list: string[]): number => list.indexOf(code);
  let idx = typeOf(DATE_TYPE_FORMATS); if (idx >= 0 && !TIME_TYPE_FORMATS.includes(code)) return 'Date';
  idx = typeOf(TIME_TYPE_FORMATS); if (idx >= 0 && typeOf(DATE_TYPE_FORMATS) < 0) return 'Time';
  idx = typeOf(FRACTION_TYPE_FORMATS); if (idx >= 0) return 'Fraction';
  idx = typeOf(SPECIAL_TYPE_FORMATS); if (idx >= 0) return 'Special';
  if (code === '@') return 'Text';
  if (code.startsWith('_(')) return 'Accounting';
  if (/[$¥₩]/.test(input)) return 'Currency';
  if (code.includes('%')) return 'Percentage';
  if (/[eE][+-]0/.test(code)) return 'Scientific';
  if (/\//.test(code) && /[?]/.test(code)) return 'Fraction';
  if (/[ymdhs]/i.test(code)) return /[hs]/.test(code) && !/[ym]/i.test(code) ? 'Time' : 'Date';
  return 'Number';
}

/** Inverse of numberFormatterFor: the option values implied by a formatter (dialog loading). */
export function numberOptionsForFormat(input: string): NumberOptions {
  const code = String(input ?? '').replace(LOCALE_TAG, '');
  const out: NumberOptions = {};
  const decimals = code.match(/0\.(0+)/)?.[1].length;
  out.decimals = decimals === undefined ? 2 : Math.min(30, decimals);
  out.separator = code.includes(',##0');
  out.negative = 0;
  const second = code.split(';')[1];
  if (second) {
    const red = second.startsWith('[Red]');
    const rest = red ? second.slice(5) : second;
    out.negative = (rest.startsWith('(') ? 2 : 0) + (red ? 1 : 0);
  }
  if (input.includes('₩')) out.symbol = 4;
  else if (input.includes('¥')) out.symbol = input.startsWith('[¥') ? 3 : 2;
  else if (/^\[\$\$-/.test(input)) out.symbol = 1;
  else if (/^\[\$?-/.test(input)) out.symbol = 0;
  else if (code.includes('$')) out.symbol = 1;
  else if (/^[#0_]/.test(code)) out.symbol = 0;
  else out.symbol = 1;
  const localeMatch = input.match(/-(\w+)\]/);
  out.locale = Math.max(0, LOCALE_ID.indexOf(localeMatch?.[1] ?? '409'));
  const dateIdx = DATE_TYPE_FORMATS.indexOf(code);
  const timeIdx = TIME_TYPE_FORMATS.indexOf(code);
  const fracIdx = FRACTION_TYPE_FORMATS.indexOf(code);
  const specialIdx = SPECIAL_TYPE_FORMATS.indexOf(code);
  if (specialIdx >= 0) out.type = specialIdx;
  else if (fracIdx >= 0) out.type = fracIdx;
  else if (timeIdx >= 0 && dateIdx < 0) out.type = timeIdx;
  else if (dateIdx >= 0) out.type = dateIdx;
  else out.type = 0;
  out.locale = 0;
  return out;
}
