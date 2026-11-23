/**
 * TASK 91: the `General` width-fitting rule and the culture-aware `General` text.
 * `generalFitText` is measured through an injected `measure`, so the candidate ORDER and the
 * rounding rules are pinned independently of platform font metrics (the pixel values themselves
 * are compared with the trial in `apps/designer-compare/test/general-fit-t91.spec.ts`).
 */
import { afterEach, describe, expect, it } from 'vitest';
import GC from '../src/index.js';
import { generalFitText, generalNumberText } from '../src/general-fit.js';

const { CultureManager } = GC.Spread.Common;
const { GeneralFormatter } = GC.Spread.Formatter;

/** Fixed 10 px per character: the candidate strings themselves carry the algorithm. */
const measure = (text: string): number => text.length * 10;
const fit = (value: number, base: string, chars: number): string | null => generalFitText(value, base, chars * 10, measure);

afterEach(() => {
  CultureManager.culture('en-us');
});

describe('General text (trial `getText` semantics, measured on the official trial)', () => {
  it('is the String() form of the number, not the 11-digit scientific form', () => {
    const f = new GeneralFormatter('General');
    expect(f.format(1234567890123)).toBe('1234567890123');
    expect(f.format(-0.2222222)).toBe('-0.2222222');
    expect(f.format(-1e-12)).toBe('-1e-12');
    expect(f.format(1e20)).toBe('100000000000000000000');
    expect(f.format(1e21)).toBe('1e+21');
    expect(f.format(1e-7)).toBe('1e-7');
    expect(f.format(396.5)).toBe('396.5');
    expect(f.format(true)).toBe('TRUE');
    expect(f.format(null)).toBe('');
    expect(generalNumberText(-1.5)).toBe('-1.5');
  });
});

describe('General fit (matrix measured on the trial, zoom 100 %)', () => {
  it('keeps the full text when it fits', () => {
    expect(fit(396.5, '396.5', 5)).toBe('396.5');
    expect(fit(1e-7, '1e-7', 12)).toBe('1e-7'); // trial: 110 px column shows the base — it must clear the `w(base)+w(d0)+3` gate
  });
  it('reduces decimals to fit, rounded half away from zero', () => {
    expect(fit(-0.2222222, '-0.2222222', 5)).toBe('-0.22'); // trial: column 40 px
    expect(fit(0.123456789, '0.123456789', 8)).toBe('0.123457'); // trial: column 60 px (rounds up)
    expect(fit(123456.789, '123456.789', 8)).toBe('123456.8'); // trial: column 60 px
    expect(fit(1.005, '1.005', 4)).toBe('1.01'); // trial: 1.005 -> 1.01, not 1.00
    expect(fit(12.0004, '12.0004', 4)).toBe('12.0'); // trial: 40 px column keeps the decimal point
    expect(fit(0.9999999, '0.9999999', 4)).toBe('1.00'); // trial: rounds to 1.00, dot kept
  });
  it('prefers the 0-decimal integer over scientific when it is the shorter fit', () => {
    expect(fit(396.5, '396.5', 3)).toBe('397'); // trial: column 30 px
    expect(fit(-1.5, '-1.5', 2)).toBe('-2'); // trial: rounds away from zero
    expect(fit(-2.5, '-2.5', 2)).toBe('-3');
    expect(fit(123456.789, '123456.789', 6)).toBe('123457'); // trial: column 48 px
  });
  it('uses scientific with reduced mantissa, exponent zero-padded to two digits', () => {
    expect(fit(1234567890123, '1234567890123', 7)).toBe('1.2E+12'); // trial: column 60 px
    expect(fit(1234567890123, '1234567890123', 5)).toBe('1E+12'); // trial: column 44 px
    expect(fit(1e20, '100000000000000000000', 9)).toBe('1.000E+20'); // trial: column 110 px shows 1.00000E+20
    expect(fit(123456.789, '123456.789', 5)).toBe('1E+05'); // trial: column 44 px
  });
  it('answers null (the caller hashes) when nothing fits', () => {
    expect(fit(1e20, '100000000000000000000', 4)).toBeNull(); // trial: column 30 px -> ####
    expect(fit(123456.789, '123456.789', 4)).toBeNull();
  });
  it('paints `0` (never `-0`) for tiny values once even scientific does not fit', () => {
    expect(fit(-1e-12, '-1e-12', 6)).toBe('-1E-12'); // trial: column 44 px
    expect(fit(-1e-12, '-1e-12', 4)).toBe('0'); // trial: column 30 px -> 0, not a hash run
    expect(fit(-0.4, '-0.4', 2)).toBe('0'); // trial: 24 px column
    expect(fit(0.00001, '0.00001', 5)).toBe('1E-05'); // trial: 40 px column (skips `0.0000`)
    expect(fit(0.00001, '0.00001', 3)).toBe('0'); // trial: 28 px column
  });
  it('shows the canonical `d.dddddE±dd` for e-notation bases with a 10-or-more-digit exponent', () => {
    expect(fit(1e21, '1e+21', 11)).toBe('1.00000E+21'); // trial: column 200 px
    expect(fit(1e-10, '1e-10', 11)).toBe('1.00000E-10');
    expect(fit(1.2345e-12, '1.2345e-12', 11)).toBe('1.23450E-12'); // padded to five decimals
    expect(fit(1.23456789e-7, '1.23456789e-7', 11)).toBe('1.23457E-07'); // trial: 64 px column
  });
  it('paints the scientific chain (never the lowercase base) below the wide-column gate', () => {
    // Trial sweep (zoom 100 %): `1e-7` -> 0 (<=36 px) | 1E-07 (44-48) | 1.0E-07 (52-56) |
    // 1.00E-07 (60-64) | 1e-7 (>=68). In the 10 px model the gate `w(base)+w(d0)+3` = 93 px.
    expect(fit(1e-7, '1e-7', 4)).toBe('0'); // nothing of the chain fits either -> zero
    expect(fit(1e-7, '1e-7', 5)).toBe('1E-07'); // trial: 44 px column, two-digit exponent
    expect(fit(1e-7, '1e-7', 7)).toBe('1.0E-07');
    expect(fit(1e-7, '1e-7', 9)).toBe('1.000E-07'); // 90 px avail: gate (93) not reached, d3 is the widest fit
    expect(fit(1e-7, '1e-7', 10)).toBe('1e-7'); // 100 px avail >= gate 93 px -> the base wins the whole chain
    expect(fit(1.5e-7, '1.5e-7', 6)).toBe('1E-07'); // d0 of the double, as the trial paints at 44-48 px
    expect(fit(1.5e-7, '1.5e-7', 8)).toBe('1.50E-07');
    expect(fit(1.5e-7, '1.5e-7', 11)).toBe('1.50000E-07'); // 110 px < gate 113 px
    expect(fit(1.5e-7, '1.5e-7', 12)).toBe('1.5e-7'); // trial: 76 px column shows the base
    expect(fit(1e-8, '1e-8', 5)).toBe('1E-08'); // trial: 44-48 px columns
  });
});

describe('General uses the culture separators (supervisor 2b)', () => {
  it('formats General with `,` decimals under it-it and `.` under en-us', () => {
    expect(CultureManager.culture('it-it')).toBe('it-IT');
    expect(new GeneralFormatter('General').format(396.5)).toBe('396,5');
    expect(new GeneralFormatter('General').format(-0.2222222)).toBe('-0,2222222');
    expect(new GeneralFormatter('General').format(1.2345e-12)).toBe('1,2345e-12');
    expect(generalNumberText(396.5)).toBe('396,5');
    expect(new GeneralFormatter('#,##0.00').format(1234.5)).toBe('1.234,50');
    CultureManager.culture('en-us');
    expect(new GeneralFormatter('General').format(396.5)).toBe('396.5');
    expect(generalNumberText(396.5)).toBe('396.5');
  });
  it('keeps the culture separators in the fitted texts', () => {
    CultureManager.culture('it-it');
    expect(fit(396.5, '396,5', 3)).toBe('397');
    expect(fit(1.2345e-12, '1,2345e-12', 11)).toBe('1,23450E-12');
    expect(fit(-0.2222222, '-0,2222222', 5)).toBe('-0,22');
  });
});
