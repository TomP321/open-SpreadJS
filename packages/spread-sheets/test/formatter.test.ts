import { afterEach, describe, expect, it } from 'vitest';
import GC from '../src/index.js';
import cases from './format-cases.json';
import { dateToSerial, serialToDate, splitSections } from '../src/formatter.js';
const { GeneralFormatter } = GC.Spread.Formatter;
const { CultureInfo, CultureManager } = GC.Spread.Common;
afterEach(() => {
  CultureManager.culture('en-us');
});
describe('Excel formatter', () => {
  for (const [format, value, expected] of cases)
    it(`${format} formats ${String(value)}`, () => {
      expect(new GeneralFormatter(String(format)).format(value)).toBe(expected);
    });
  it('supports the default General format, null values and chainable formatString', () => {
    const f = new GeneralFormatter();
    expect(f.formatString()).toBe('General');
    expect(f.format(null)).toBe('');
    expect(f.format(undefined)).toBe('');
    expect(f.formatString('0.00')).toBe(f);
    expect(f.formatString()).toBe('0.00');
    expect(f.format(3)).toBe('3.00');
  });
  it('selects conditional colors and returns numeric content tokens', () => {
    const data: Record<string, unknown> = {};
    expect(new GeneralFormatter('0.0;[Red](0.0)').format(-12.3, data)).toBe('(12.3)');
    expect(data).toMatchObject({
      value: 'Red',
      conditionalForeColor: 'Red',
      content: [
        { type: 'text', value: '(' },
        { type: 'number', value: '12' },
        { type: 'decimalSeparator', value: '.' },
        { type: 'number', value: '3' },
        { type: 'text', value: ')' },
      ],
    });
    expect(splitSections('0;"a;b";\\;;@')).toEqual(['0', '"a;b"', '\\;', '@']);
  });
  it('parses locale numbers, percentages, exponents, currency, booleans, parentheses, fractions and text', () => {
    const f = new GeneralFormatter();
    for (const [input, value] of [
      ['1,234.5', 1234.5],
      ['$1,234.50', 1234.5],
      ['(12.5)', -12.5],
      ['10%', 0.1],
      ['1.23e3', 1230],
      ['TRUE', true],
      ['False', false],
      ['', null],
      ['hello', 'hello'],
    ] as const)
      expect(f.parse(input)).toBe(value);
    expect(new GeneralFormatter('0.00').parse('hello')).toBeNull();
    expect(new GeneralFormatter('@').parse('00123')).toBe('00123');
    expect(new GeneralFormatter('# ?/?').parse('2 1/2')).toBe(2.5);
  });
  it('parses dates and times with validation and uses local civil time', () => {
    const f = new GeneralFormatter();
    expect(f.parse('2024-02-29')).toEqual(new Date(2024, 1, 29));
    expect(f.parse('1/2/2024')).toEqual(new Date(2024, 0, 2));
    expect(f.parse('12:30 PM')).toEqual(new Date(1899, 11, 30, 12, 30));
    expect(f.parse('2023-02-29')).toBe('2023-02-29');
    expect(new GeneralFormatter('m/d/yyyy').parse('2023-02-29')).toBeNull();
    expect(dateToSerial(new Date(2024, 1, 29))).toBe(45351);
    expect(serialToDate(45351.5)).toEqual(new Date(2024, 1, 29, 12));
    expect(dateToSerial(new Date(1900, 0, 1))).toBe(1);
    expect(dateToSerial(new Date(1900, 2, 1))).toBe(61);
    expect(new GeneralFormatter('yyyy-mm-dd').format(new Date(2024, 1, 29))).toBe('2024-02-29');
  });
});
describe('culture registration', () => {
  it('exposes independent CultureInfo fields and all CultureManager lookup methods', () => {
    const a = new CultureInfo(),
      b = new CultureInfo();
    expect(a.id).toBe(-1);
    expect(a.NumberFormat.currencySymbol).toBe('¤');
    a.NumberFormat.numberDecimalSeparator = ',';
    expect(b.NumberFormat.numberDecimalSeparator).toBe('.');
    a.id = 999;
    a.displayName = 'Test culture';
    a.LocalNumberFormat[14] = 'dd/mm/yyyy';
    a.predefinedFormats.Date = ['dd/mm/yyyy'];
    a.equalCharacters = ['a'];
    a.fontScriptCode = 'Latn';
    const resources = { hello: 'world' };
    CultureManager.addCultureInfo('xx-YY', a, resources);
    // Trial probe `culture:assign`/`culture:builtin-names`: a registered culture
    // keeps its own name (empty for a hand-made one) and `culture()` reports the
    // spelling it was called with.
    expect(a.name()).toBe('');
    expect(CultureManager.getCultureInfo('XX-YY')).toBe(a);
    expect(CultureManager.getCultureInfo(999)).toBe(a);
    expect(CultureManager.getLanguage('xx-yy')).toBe(resources);
    expect(CultureManager.getResources('xx-yy')).toBe(resources);
    expect(CultureManager.culture('xx-YY', true)).toBe('xx-YY');
    expect(CultureManager.culture()).toBe('xx-YY');
    expect(CultureManager.getCultureInfo()).toBe(a);
    expect(() => CultureManager.culture('missing')).toThrow('Unknown culture');
  });
  it('ships the trial-core ja-JP culture with its ten equalCharacters pairs (trial probes `culture:names`, `culture9`)', () => {
    const ja = CultureManager.getCultureInfo('ja-jp')!;
    expect(ja).not.toBeNull();
    expect(ja.name()).toBe('ja-JP');
    expect(CultureManager.getCultureInfo('EN-us')!.name()).toBe('en-US');
    expect(CultureManager.culture('ja-jp')).toBe('ja-JP');
    expect(ja.id).toBe(1041);
    expect(ja.displayName).toBe('Japanese (Japan)');
    expect(ja.paperKind).toBe(1);
    expect(ja.fontScriptCode).toBeUndefined();
    // The ten Japanese equivalence pairs transcribed through the public API.
    expect(ja.equalCharacters).toEqual([
      '―ゝゞ゠ヽヾー', '㆐㆑㇤㇥', '‸⁊', '.․', '&⁋', '%⁏', '$⁒', '#⁗', '"⁍', '‹⁓',
    ]);
    expect(ja.DateTimeFormat.amDesignator).toBe('午前');
    expect(ja.DateTimeFormat.pmDesignator).toBe('午後');
    expect(ja.DateTimeFormat.shortDatePattern).toBe('yyyy/MM/dd');
    expect(ja.DateTimeFormat.monthNames![1]).toBe('2月');
    expect(ja.NumberFormat.currencySymbol).toBe('¥');
    // Current culture feeds an unnamed formatter (trial `culture:current-effect`).
    CultureManager.culture('ja-jp');
    expect(new GC.Spread.Formatter.GeneralFormatter('0.00').format(1.5)).toBe('1.50');
    expect(new GC.Spread.Formatter.GeneralFormatter('mmmm d, yyyy').format(45351)).toBe('2月 29, 2024');
  });
  it('formats and parses registered separators and translated date names', () => {
    const c = new CultureInfo();
    c.NumberFormat.numberDecimalSeparator = ',';
    c.NumberFormat.numberGroupSeparator = '.';
    c.NumberFormat.currencySymbol = '€';
    c.DateTimeFormat.shortDatePattern = 'dd/MM/yyyy';
    c.DateTimeFormat.monthNames![1] = 'Februar';
    c.DateTimeFormat.abbreviatedMonthNames![1] = 'Feb';
    CultureManager.addCultureInfo('test-DE', c);
    const f = new GeneralFormatter('#,##0.00', 'test-de');
    expect(f.format(1234.5)).toBe('1.234,50');
    expect(f.parse('€1.234,50')).toBe(1234.5);
    expect(new GeneralFormatter('mmmm d, yyyy', 'test-de').format(45351)).toBe('Februar 29, 2024');
    expect(new GeneralFormatter('General', 'test-de').parse('29/02/2024')).toEqual(new Date(2024, 1, 29));
    expect(CultureManager.culture('test-de')).toBe('test-de');
    expect(new GeneralFormatter('0.00').format(1.5)).toBe('1,50');
  });
});
