// @vitest-environment jsdom
/**
 * TASK 88 item 1: the built-in it-IT culture.
 * Format/parse round trips through the public `GeneralFormatter` and a real
 * cell edit (startEdit/endEdit), i.e. what typing `1.234,5` into a cell does
 * while `it-it` is the current culture.
 */
import { afterEach, describe, expect, it } from 'vitest';
import GC from '../src/index.js';

const { GeneralFormatter } = GC.Spread.Formatter;
const { CultureInfo, CultureManager } = GC.Spread.Common;

// jsdom has no 2D backend: stub it the way the DOM feature tests do, so a host
// workbook gets its renderer and the real editing path runs.
(globalThis as Record<string, unknown>).CanvasRenderingContext2D ??= class {};
Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
  value() {
    return new Proxy({}, {
      get: (t, k: string) => {
        if (k in t) return (t as Record<string, unknown>)[k];
        if (k === 'measureText') return (s: unknown) => ({ width: String(s).length * 6 });
        if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop: () => undefined });
        return (...a: unknown[]) => void a;
      },
      set: (t, k: string, v) => { (t as Record<string, unknown>)[k] = v; return true; },
    });
  },
  configurable: true,
});

afterEach(() => {
  CultureManager.culture('en-us');
});

describe('it-IT culture registration', () => {
  it('is a built-in culture with the Italian regional data', () => {
    const it = CultureManager.getCultureInfo('it-it')!;
    expect(it).not.toBeNull();
    expect(it.name()).toBe('it-IT');
    expect(CultureManager.getCultureInfo('IT-IT')).toBe(it);
    expect(CultureManager.culture('it-it')).toBe('it-IT');
    expect(it.id).toBe(1040);
    expect(it.displayName).toBe('Italian (Italy)');
    expect(it.paperKind).toBe(1);
    // The trial core ships no Italian culture (measured black-box), so the
    // instance keeps the generic tag instead of an invented per-culture one.
    expect(it.instanceType).toBe('CultureInfo');
    expect(it.equalCharacters).toBeUndefined();
    expect(it.NumberFormat.numberDecimalSeparator).toBe(',');
    expect(it.NumberFormat.numberGroupSeparator).toBe('.');
    expect(it.NumberFormat.currencyDecimalSeparator).toBe(',');
    expect(it.NumberFormat.currencyGroupSeparator).toBe('.');
    expect(it.NumberFormat.currencySymbol).toBe('€');
    // d.ts contract: listSeparator is the separator of formula arguments.
    expect(it.NumberFormat.listSeparator).toBe(';');
    expect(it.DateTimeFormat.shortDatePattern).toBe('dd/MM/yyyy');
    expect(it.DateTimeFormat.longTimePattern).toBe('HH:mm:ss');
    expect(it.DateTimeFormat.amDesignator).toBe('');
    expect(it.DateTimeFormat.pmDesignator).toBe('');
    expect(it.DateTimeFormat.monthNames![0]).toBe('gennaio');
    expect(it.DateTimeFormat.monthNames![10]).toBe('novembre');
    expect(it.DateTimeFormat.abbreviatedMonthNames![10]).toBe('nov');
    expect(it.DateTimeFormat.dayNames![0]).toBe('domenica');
    expect(it.DateTimeFormat.abbreviatedDayNames![3]).toBe('mer');
    expect(Object.keys(it.predefinedFormats).sort()).toEqual(
      Object.keys(CultureManager.getCultureInfo('en-us')!.predefinedFormats).sort(),
    );
    expect(CultureManager.getCultureInfo(1040)).toBe(it);
  });

  it('keeps en-US and ja-JP untouched (English is the default culture)', () => {
    expect(CultureManager.culture()).toBe('en-US');
    expect(CultureManager.getCultureInfo('en-us')!.NumberFormat.numberDecimalSeparator).toBe('.');
    expect(CultureManager.getCultureInfo('ja-jp')!.NumberFormat.currencySymbol).toBe('¥');
  });

  it('formats numbers, percentages, currencies and dates in the Italian style', () => {
    CultureManager.culture('it-it');
    expect(new GeneralFormatter('#,##0.00').format(1234.5)).toBe('1.234,50');
    expect(new GeneralFormatter('#,##0').format(-1234)).toBe('-1.234');
    expect(new GeneralFormatter('0.00%').format(0.1234)).toBe('12,34%');
    expect(new GeneralFormatter('[$€-410] #,##0.00').format(1234.5)).toBe('€ 1.234,50');
    expect(new GeneralFormatter('dd/mm/yyyy').format(new Date(2026, 10, 22))).toBe('22/11/2026');
    expect(new GeneralFormatter('dd/mm/yyyy hh:mm:ss').format(new Date(2026, 10, 22, 14, 5, 9))).toBe('22/11/2026 14:05:09');
    expect(new GeneralFormatter('dddd d mmmm yyyy').format(new Date(2026, 10, 22))).toBe('domenica 22 novembre 2026');
    expect(new GeneralFormatter('yyyy MMMM').format(new Date(2026, 10, 22))).toBe('2026 novembre');
  });

  it('parses the Italian style back to the same values (round trips)', () => {
    CultureManager.culture('it-it');
    const cases: [string, unknown][] = [
      ['1.234,5', 1234.5],
      ['1.234', 1234],
      ['1234,5', 1234.5],
      ['-1.234,5', -1234.5],
      ['(1.234,5)', -1234.5],
      ['€ 1.234,56', 1234.56],
      ['12,34%', 0.1234],
      ['1.234,5e3', 1234500],
    ];
    for (const [input, value] of cases) expect(new GeneralFormatter('General').parse(input)).toBe(value);
    expect(new GeneralFormatter('#,##0.00').parse('1.234,50')).toBe(1234.5);
    expect(new GeneralFormatter('[$€-410] #,##0.00').parse('€ 1.234,50')).toBe(1234.5);
    // A pattern whose separators differ from the culture keeps its own meaning.
    expect(new GeneralFormatter('#,##0.00', 'en-us').parse('1,234.50')).toBe(1234.5);
  });

  it('reads dates in the Italian day/month/year order', () => {
    CultureManager.culture('it-it');
    expect(new GeneralFormatter('General').parse('22/11/2026')).toEqual(new Date(2026, 10, 22));
    // Day first: 5/11 is 5 November, not 11 May (en-US reads the same text as May 11).
    expect(new GeneralFormatter('General').parse('5/11/2026')).toEqual(new Date(2026, 10, 5));
    expect(new GeneralFormatter('General').parse('22/11/2026 14:05:09')).toEqual(new Date(2026, 10, 22, 14, 5, 9));
    expect(new GeneralFormatter('General').parse('22 novembre 2026')).toEqual(new Date(2026, 10, 22));
    // 22 is never a month: an impossible day/month pair stays text, as in en-US.
    expect(new GeneralFormatter('General').parse('22/22/2026')).toBe('22/22/2026');
    expect(new GeneralFormatter('dd/mm/yyyy').parse('22/11/2026')).toEqual(new Date(2026, 10, 22));
    expect(new GeneralFormatter('dd/mm/yyyy', 'en-us').parse('22/11/2026')).toBeNull();
    CultureManager.culture('en-us');
    expect(new GeneralFormatter('General').parse('5/11/2026')).toEqual(new Date(2026, 4, 11));
  });

  it('types 1.234,5 into a cell with it-it current and stores 1234.5', () => {
    const host = document.createElement('div');
    host.style.width = '640px';
    host.style.height = '480px';
    document.body.append(host);
    const wb = new GC.Spread.Sheets.Workbook(host, { sheetCount: 1 });
    const sheet = wb.getActiveSheet();
    CultureManager.culture('it-it');
    sheet.startEdit(true, '1.234,5');
    sheet.endEdit();
    expect(sheet.getValue(0, 0)).toBe(1234.5);
    // TASK 91 (supervisor 2b): `General` follows the current culture's decimal separator — the
    // trial with the Italian culture shows `396,5` (the trial build in this repo has no comma
    // culture at all — `addCultureInfo` is a no-op there — which is what the earlier
    // "culture-independent General" note was measured against). The GROUP separator belongs to
    // real formats (`#,##0.00` -> `1.234,50`); General itself never groups digits.
    expect(sheet.getText(0, 0)).toBe('1234,5');
    sheet.setFormatter(0, 0, new GeneralFormatter('#,##0.00'));
    expect(sheet.getText(0, 0)).toBe('1.234,50');
    sheet.setActiveCell(0, 1);
    sheet.startEdit(true, '22/11/2026');
    sheet.endEdit();
    expect(sheet.getValue(0, 1)).toEqual(new Date(2026, 10, 22));
    // Under en-US the same typed text is a different number: '.' is the decimal
    // separator there, so 1.234,5 reads as 1.2345 (the trailing ,5 group).
    CultureManager.culture('en-us');
    sheet.setActiveCell(0, 2);
    sheet.startEdit(true, '1.234,5');
    sheet.endEdit();
    expect(sheet.getValue(0, 2)).toBe(1.2345);
    wb.destroy();
  });

  it('switches back and keeps both cultures registered', () => {
    CultureManager.culture('it-it');
    expect(CultureManager.culture()).toBe('it-IT');
    expect(CultureManager.culture('en-us')).toBe('en-US');
    expect(new GeneralFormatter('#,##0.00').format(1234.5)).toBe('1,234.50');
    expect(CultureManager.getCultureInfo('it-it')!.name()).toBe('it-IT');
    expect(() => CultureManager.culture('it-it-foo')).toThrow('Unknown culture');
  });

  it('accepts a user re-registration of it-it (the resources package path)', () => {
    const built = CultureManager.getCultureInfo('it-it')!;
    const mine = new CultureInfo();
    Object.assign(mine.NumberFormat, { numberDecimalSeparator: ',', numberGroupSeparator: '.', currencySymbol: '€' });
    mine._setName('it-IT');
    CultureManager.addCultureInfo('it-it', mine, { filter: { search: 'Cerca' } });
    CultureManager.culture('it-it');
    expect(CultureManager.getCultureInfo('it-it')).toBe(mine);
    expect(CultureManager.getResources('it-it')).toEqual({ filter: { search: 'Cerca' } });
    expect(CultureManager.culture('en-us')).toBe('en-US');
    expect(CultureManager.getCultureInfo('it-it')).toBe(mine);
    expect(built.name()).toBe('it-IT');
  });
});
