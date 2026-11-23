/**
 * TASK 88 item 3: the Italian resources package.
 * Importing it registers the `it-it` culture plus its UI string table on the
 * core it finds (here: the workspace core through the peer alias), the same way
 * the official per-language resources packages do.
 */
import { describe, expect, it } from 'vitest';
import GC from '@mescius/spread-sheets';
import { culture, cultureName, registerItalian, resources } from '../src/register.js';

const { CultureManager } = GC.Spread.Common;

describe('it-it resources package', () => {
  it('exports the culture data and the string table', () => {
    expect(cultureName).toBe('it-it');
    expect(culture.id).toBe(1040);
    expect((culture.DateTimeFormat as Record<string, unknown>).shortDatePattern).toBe('dd/MM/yyyy');
    expect((culture.NumberFormat as Record<string, unknown>).numberDecimalSeparator).toBe(',');
    expect(Object.keys(resources)).toEqual(expect.arrayContaining([
      'contextMenu', 'filter', 'comments', 'pivotPanel', 'pivotMenu', 'tablePanel', 'scenarios', 'controls', 'status', 'sheets', 'slicer', 'dataChart',
    ]));
    expect(resources.contextMenu).toMatchObject({ 'gc.spread.copy': 'Copia', 'gc.spread.pasteOptions': 'Opzioni di incollaggio:' });
    expect(resources.filter).toMatchObject({ checkAll: 'Seleziona tutto', blanks: '(Vuote)' });
  });

  it('registers the culture and its language object on the core', () => {
    CultureManager.culture('en-us');
    expect(registerItalian(GC)).toBe(true);
    const info = CultureManager.getCultureInfo('it-it')!;
    expect(info.name()).toBe('it-IT');
    expect(info.NumberFormat.currencySymbol).toBe('€');
    expect(CultureManager.getResources('it-it')).toMatchObject({ contextMenu: { 'gc.spread.copy': 'Copia' } });
    // English stays the default until the culture is switched.
    expect(CultureManager.culture()).toBe('en-US');
    expect(CultureManager.culture('it-it')).toBe('it-IT');
    CultureManager.culture('en-us');
  });

  it('also activates the Italian calc language package, so formulas come in Italian too (TASK 89)', () => {
    const LP = GC.Spread.CalcEngine.LanguagePackages;
    LP.languagePackages(null);
    expect(registerItalian(GC)).toBe(true);
    expect(LP.languagePackages()).toBe('it');
    const workbook = new GC.Spread.Sheets.Workbook();
    const ws = workbook.getActiveSheet();
    ws.setValue(0, 0, 1);
    ws.setValue(1, 0, 2);
    ws.setFormula(2, 0, '=SOMMA(A1;A2)');
    expect(ws.getValue(2, 0)).toBe(3);
    expect(ws.getFormula(2, 0)).toBe('SOMMA(A1;A2)');
    workbook.destroy();
    LP.languagePackages(null);
  });

  it('is idempotent and keeps the core built-in culture instance', () => {    const before = CultureManager.getCultureInfo('it-it');
    expect(registerItalian(GC)).toBe(true);
    expect(registerItalian(GC)).toBe(true);
    expect(CultureManager.getCultureInfo('it-it')).toBe(before);
    expect(Object.keys(CultureManager.getResources('it-it'))).toEqual(Object.keys(resources));
  });

  it('registers a built culture from scratch when the core does not know it-it', () => {
    // A stand-in for a core without the Italian culture: same public surface.
    class CultureInfoStub {
      id = -1;
      displayName = '';
      paperKind = 1;
      instanceType = 'CultureInfo';
      DateTimeFormat: Record<string, unknown> = { shortDatePattern: 'MM/dd/yyyy' };
      NumberFormat: Record<string, unknown> = { numberDecimalSeparator: '.', currencySymbol: '¤' };
      TextFormat: Record<string, unknown> = { lineBreakingChar: [' '] };
      LocalNumberFormat: Record<string, unknown> = {};
      predefinedFormats: Record<string, unknown> = {};
      private cultureId = '';
      name(): string { return this.cultureId; }
      _setName(name: string): void { this.cultureId = name; }
    }
    const cultures = new Map<string, CultureInfoStub>();
    const languages = new Map<string, object>();
    const host = {
      Spread: {
        Sheets: {},
        Common: {
          CultureInfo: CultureInfoStub,
          CultureManager: {
            addCultureInfo(name: string, cultureInfo: object, language: object = {}): void {
              cultures.set(name.toLowerCase(), cultureInfo as CultureInfoStub);
              languages.set(name.toLowerCase(), language);
            },
            getCultureInfo(name: string): CultureInfoStub | null { return cultures.get(name.toLowerCase()) ?? null; },
            getResources(name: string): object { return languages.get(name.toLowerCase()) ?? {}; },
          },
        },
      },
    };
    expect(registerItalian(host)).toBe(true);
    const info = cultures.get('it-it')!;
    expect(info.name()).toBe('it-IT');
    expect(info.id).toBe(1040);
    expect(info.displayName).toBe('Italian (Italy)');
    expect(info.NumberFormat.numberGroupSeparator).toBe('.');
    expect(info.DateTimeFormat.shortDatePattern).toBe('dd/MM/yyyy');
    expect(Object.keys(info.predefinedFormats).sort()).toEqual(['Accounting', 'Comma', 'Currency', 'Date', 'Special', 'Time', 'shortcut']);
    expect(languages.get('it-it')).toMatchObject({ comments: { title: 'Commenti con thread' } });
  });

  it('warns instead of breaking a host that loaded no core', () => {
    const warnings: string[] = [];
    const original = console.warn;
    console.warn = (message: string) => void warnings.push(message);
    try {
      expect(registerItalian(undefined)).toBe(false);
      expect(registerItalian({ Spread: { Sheets: {} } })).toBe(false);
    } finally {
      console.warn = original;
    }
    expect(warnings.length).toBe(2);
    expect(warnings[0]).toContain('no spreadsheet core found');
  });
});
