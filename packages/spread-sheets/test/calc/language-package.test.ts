/**
 * TASK 89 — Italian calc-engine language package: registry API, localized parsing
 * (`=SOMMA(A1;1,5)`), localized display (`getFormula`, editor/formula-bar text) and the
 * invariant-English storage contract (`toJSON`, internal machinery).
 */
import { afterEach, describe, expect, it } from 'vitest';
import GC from '../../src/index.js';
import { Workbook } from '../../src/model.js';
import { functionCatalog } from '../../src/calc/function-catalog.js';
import { astToText, localizeFormulaText, parseFormula } from '../../src/calc/parser.js';
import { addCalcLanguagePackageDescriptions, getActiveCalcLanguagePackage, getCalcLanguagePackage, registerCalcLanguagePackage, registeredCalcLanguagePackageNames } from '../../src/calc/language-packages.js';
import { italianLanguagePackage } from '../../src/calc/italian-language-package.js';

const LP = GC.Spread.CalcEngine.LanguagePackages;

function sheetWith(cells: Record<string, unknown>, extraSheets = 0): Workbook {
  const wb = new Workbook();
  const ws = wb.getSheet(0);
  ws.setRowCount(100);
  ws.setColumnCount(20);
  for (let i = 0; i < extraSheets; i++) {
    wb.addSheet(i + 1);
    wb.getSheet(i + 1).name('Foglio' + (i + 2));
  }
  for (const [address, value] of Object.entries(cells)) {
    const m = /^([A-Z]+)(\d+)$/.exec(address)!;
    let col = 0;
    for (const ch of m[1]!) col = col * 26 + ch.charCodeAt(0) - 64;
    ws.setValue(Number(m[2]) - 1, col - 1, value);
  }
  return wb;
}

function useItalian(): void {
  LP.languagePackages('it');
}

afterEach(() => {
  LP.languagePackages(null);
});

describe('LanguagePackages.languagePackages API', () => {
  it('answers undefined while no package is activated and reports the active name after activation', () => {
    expect(LP.languagePackages()).toBeUndefined();
    expect(getActiveCalcLanguagePackage()).toBeUndefined();
    expect(registeredCalcLanguagePackageNames()).toContain('it');
    expect(LP.languagePackages('it')).toBe('it');
    expect(LP.languagePackages()).toBe('it');
    expect(getActiveCalcLanguagePackage()?.languageName).toBe('it'); // the lexer's live view
    expect(LP.languagePackages('de')).toBeUndefined(); // not registered: active package unchanged
    expect(LP.languagePackages()).toBe('it');
    LP.languagePackages(null);
    expect(LP.languagePackages()).toBeUndefined();
    expect(getActiveCalcLanguagePackage()).toBeUndefined();
  });
  it('the Italian package carries the culture separators of it-it', () => {
    expect(italianLanguagePackage.listSeparator).toBe(';');
    expect(italianLanguagePackage.arrayListSeparator).toBe(';');
    expect(italianLanguagePackage.arrayGroupSeparator).toBe('\\');
    expect(italianLanguagePackage.numberDecimalSeparator).toBe(',');
    expect(italianLanguagePackage.trueValue).toBe('VERO');
    expect(italianLanguagePackage.falseValue).toBe('FALSO');
  });
  it('descriptions answer from registration data and from the late mutator', () => {
    registerCalcLanguagePackage({ languageName: 'xx', descriptions: { SUM: 'Dati summa.' } });
    LP.languagePackages('xx');
    const pkg = getActiveCalcLanguagePackage();
    expect(pkg?.description('SUM')).toBe('Dati summa.');
    expect(pkg?.description('sum')).toBe('Dati summa.'); // case-insensitive lookup
    expect(pkg?.description('STDEV.P')).toBeUndefined(); // none given: English catalog fallback
    expect(addCalcLanguagePackageDescriptions('xx', { 'STDEV.P': 'Deviazione.' })).toBe(true);
    expect(pkg?.description('STDEV.P')).toBe('Deviazione.'); // merged into the LIVE package object
    expect(addCalcLanguagePackageDescriptions('zz', { SUM: 'x' })).toBe(false); // unregistered
    expect(getCalcLanguagePackage('it')?.description('SUM')).toBeUndefined(); // other languages untouched
    LP.languagePackages(null);
  });
});

describe('Italian function-name table', () => {
  const table = italianLanguagePackage.functions!;
  it('every catalog function has an Italian name (identity where Excel-IT keeps English)', () => {
    for (const english of Object.keys(functionCatalog)) {
      const localized = table[english] ?? english;
      expect(typeof localized).toBe('string');
      expect(localized.length).toBeGreaterThan(0);
    }
  });
  it('the table is unique on both sides', () => {
    const toIt = new Map<string, string>();
    const toEn = new Map<string, string>();
    for (const [english, localized] of Object.entries(table)) {
      expect(toIt.set(english, localized).size).toBe(toIt.size); // one display per English name
      expect(toEn.set(localized, english).size).toBe(toEn.size); // one English name per display
    }
  });
  it('localized names never shadow a different English function name', () => {
    const catalog = new Set(Object.keys(functionCatalog));
    for (const [english, localized] of Object.entries(table)) {
      if (catalog.has(localized) && localized !== english)
        throw new Error(`Italian name ${localized} shadows the English function name of another function`);
    }
  });
  it('localizes the names the user asked for', () => {
    const expectIt = (english: string, italian: string) => expect(table[english]).toBe(italian);
    expectIt('SUM', 'SOMMA');
    expectIt('AVERAGE', 'MEDIA');
    expectIt('IF', 'SE');
    expectIt('VLOOKUP', 'CERCA.VERT');
    expectIt('HLOOKUP', 'CERCA.ORIZZ');
    expectIt('COUNTIF', 'CONTA.SE');
    expectIt('SUMIF', 'SOMMA.SE');
    expectIt('CONCATENATE', 'CONCATENA');
    expectIt('TODAY', 'OGGI');
    expectIt('NOW', 'ADESSO');
    expectIt('ROUND', 'ARROTONDA');
    expectIt('INDEX', 'INDICE');
    expectIt('MATCH', 'CONFRONTA');
    expectIt('IFERROR', 'SE.ERRORE');
    expectIt('LEFT', 'SINISTRA');
    expectIt('RIGHT', 'DESTRA');
    expectIt('MID', 'STRINGA.ESTRAI');
    expectIt('LEN', 'LUNGHEZZA');
    expectIt('TRIM', 'ANNULLA.SPAZI');
    expectIt('UPPER', 'MAIUSC');
    expectIt('LOWER', 'MINUSC');
    expectIt('ISNA', 'VAL.NON.DISP');
    expectIt('AND', 'E');
    expectIt('OR', 'O');
    expectIt('NOT', 'NON');
    expectIt('TRUE', 'VERO');
    expectIt('FALSE', 'FALSO');
  });
});

describe('parsing and display with the Italian package', () => {
  it('parses =SOMMA(A1;A2) and evaluates it', () => {
    useItalian();
    const wb = sheetWith({ A1: 1, A2: 2 });
    const ws = wb.getSheet(0);
    ws.setFormula(2, 0, '=SOMMA(A1;A2)');
    expect(ws.getValue(2, 0)).toBe(3);
    expect(ws.getFormula(2, 0)).toBe('SOMMA(A1;A2)');
  });
  it('parses the decimal comma and stores the English literal', () => {
    useItalian();
    const wb = sheetWith({});
    const ws = wb.getSheet(0);
    ws.setFormula(0, 0, '=1,5*2');
    expect(ws.getValue(0, 0)).toBe(3);
    expect(ws.getFormula(0, 0)).toBe('1,5*2');
    const json = wb.toJSON() as unknown as { sheets: { Sheet1: { data: { dataTable: Record<string, Record<string, { formula?: string }>> } } } };
    expect(json.sheets.Sheet1.data.dataTable['0']['0'].formula).toBe('1.5*2');
  });
  it('parses =SE(A1>0;"sì";"no")', () => {
    useItalian();
    const wb = sheetWith({ A1: 5 });
    const ws = wb.getSheet(0);
    ws.setFormula(1, 0, '=SE(A1>0;"sì";"no")');
    expect(ws.getValue(1, 0)).toBe('sì');
    expect(ws.getFormula(1, 0)).toBe('SE(A1>0;"sì";"no")');
  });
  it('keeps English function names working and displays them in Italian', () => {
    useItalian();
    const wb = sheetWith({ A1: 1, A2: 2 });
    const ws = wb.getSheet(0);
    ws.setFormula(2, 0, '=SUM(A1;A2)');
    expect(ws.getValue(2, 0)).toBe(3);
    expect(ws.getFormula(2, 0)).toBe('SOMMA(A1;A2)');
  });
  it('accepts a mixed grammar: comma-separated references still parse as arguments', () => {
    useItalian();
    const wb = sheetWith({ A1: 1, A2: 2, B1: 4 });
    const ws = wb.getSheet(0);
    ws.setFormula(3, 0, '=SOMMA(A1,A2,B1)');
    expect(ws.getValue(3, 0)).toBe(7);
  });
  it('handles nested localized functions with sheet references', () => {
    useItalian();
    const wb = sheetWith({}, 1);
    const ws = wb.getSheet(0);
    const other = wb.getSheet(1);
    other.setValue(0, 0, 1);
    other.setValue(1, 0, 2);
    other.setValue(0, 1, 3);
    other.setValue(1, 1, 4);
    ws.setFormula(5, 0, '=SOMMA(Foglio2!A1:B2;3)');
    expect(ws.getValue(5, 0)).toBe(13);
    expect(ws.getFormula(5, 0)).toBe('SOMMA(Foglio2!A1:B2;3)');
  });
  it('reads and writes the culture array grammar {1;2\\3;4}', () => {
    useItalian();
    const wb = sheetWith({});
    const ws = wb.getSheet(0);
    ws.setFormula(0, 0, '=SOMMA({1;2\\3;4})');
    expect(ws.getValue(0, 0)).toBe(10);
    expect(ws.getFormula(0, 0)).toBe('SOMMA({1;2\\3;4})');
    // The canonical English array of the same 2x2 renders with the culture separators.
    ws._setFormula(1, 0, 'SUM({1,2;3,4})');
    expect(ws.getFormula(1, 0)).toBe('SOMMA({1;2\\3;4})');
    expect(ws.getValue(1, 0)).toBe(10);
  });
  it('supports VERO/FALSO literals and functions', () => {
    useItalian();
    const wb = sheetWith({});
    const ws = wb.getSheet(0);
    ws.setFormula(0, 0, '=VERO()');
    expect(ws.getValue(0, 0)).toBe(true);
    ws.setFormula(1, 0, '=FALSO');
    expect(ws.getValue(1, 0)).toBe(false);
    ws.setFormula(2, 0, '=NON(VERO)');
    expect(ws.getValue(2, 0)).toBe(false);
    expect(ws.getFormula(1, 0)).toBe('FALSO');
    expect(ws._getFormula(0, 0)).toBe('TRUE()');
  });
  it('localizes CERCA.VERT with dotted names and mixed separators', () => {
    useItalian();
    const wb = sheetWith({ A1: 'x', B1: 10, A2: 'y', B2: 20 });
    const ws = wb.getSheet(0);
    ws.setFormula(3, 0, '=CERCA.VERT("y";A1:B2;2;FALSO)');
    expect(ws.getValue(3, 0)).toBe(20);
    expect(ws.getFormula(3, 0)).toBe('CERCA.VERT("y";A1:B2;2;FALSO)');
  });
  it('keeps error literals English, like the official engine', () => {
    useItalian();
    const wb = sheetWith({});
    const ws = wb.getSheet(0);
    ws.setFormula(0, 0, '=1/0');
    expect(ws.getText(0, 0)).toBe('#DIV/0!');
    ws.setFormula(1, 0, '=INDIRETTO("x")');
    expect(ws.getText(1, 0)).toBe('#REF!');
  });
  it('treats `1,5` as ONE numeric argument (Excel in Italy semantics)', () => {
    useItalian();
    const wb = sheetWith({});
    const ws = wb.getSheet(0);
    ws.setFormula(0, 0, '=SOMMA(1,5)');
    expect(ws.getValue(0, 0)).toBe(1.5);
  });
  it('round-trips display -> parse -> canonical for both grammars', () => {
    useItalian();
    const wb = sheetWith({ A1: 1, A2: 2 });
    const ws = wb.getSheet(0);
    const formulas = [
      '=SOMMA(A1;A2)',
      '=SE(A1>0;1,5;2,5)',
      '=CONTA.SE(A1:A2;">0")',
      '=CONFRONTA("a";{"b";"c"};0)',
      '=SINISTRA(STRINGA.ESTRAI("spread";2;4);2)',
      '=SE.NON.DISP.(CERCA.VERT(1;A1:B2;2;FALSO);0)',
    ];
    formulas.forEach((text, row) => {
      ws.setFormula(row, 4, text);
      const stored = ws._getFormula(row, 4)!;
      expect(stored).not.toContain(';'); // canonical English grammar only
      expect(stored).not.toContain('\\');
      // The canonical text re-parses with the ENGLISH grammar unchanged.
      expect(astToText(parseFormula(stored))).toBe(stored);
      // Re-entering the DISPLAY text reproduces the same canonical form and value.
      ws.setFormula(row, 5, '=' + ws.getFormula(row, 4));
      expect(ws._getFormula(row, 5)).toBe(stored);
      expect(ws.getValue(row, 5)).toEqual(ws.getValue(row, 4));
    });
    expect(ws.getValue(4, 5)).toBe('pr');
  });
  it('shows formulas (sheet showFormulas) in the localized form', () => {
    useItalian();
    const wb = sheetWith({ A1: 1 });
    const ws = wb.getSheet(0);
    ws.setFormula(1, 0, '=SOMMA(A1;2)');
    ws.options.showFormulas = true;
    expect(ws.getText(1, 0)).toBe('=SOMMA(A1;2)');
    ws.options.showFormulas = false;
    expect(ws.getText(1, 0)).toBe('3');
  });
  it('getFormulaInformation keeps formula canonical and formulaWithCulture localized', () => {
    useItalian();
    const wb = sheetWith({ A1: 1, A2: 2 });
    const ws = wb.getSheet(0);
    ws.setFormula(2, 0, '=SOMMA(A1;A2;1,5)');
    const info = ws.getFormulaInformation(2, 0) as { formula?: string; formulaWithCulture?: string };
    expect(info.formula).toBe('SUM(A1,A2,1.5)');
    expect(info.formulaWithCulture).toBe('SOMMA(A1;A2;1,5)');
  });
  it('survives toJSON/fromJSON with the package active and while English', async () => {
    useItalian();
    const wb = sheetWith({ A1: 1, A2: 2 });
    wb.getSheet(0).setFormula(2, 0, '=SOMMA(A1;A2)');
    const json = JSON.parse(JSON.stringify(wb.toJSON()));
    const tables = Object.values(json.sheets)[0] as { data: { dataTable: Record<string, Record<string, { formula?: string }>> } };
    expect(Object.values(tables.data.dataTable['2'])[0].formula).toBe('SUM(A1,A2)'); // invariant storage
    LP.languagePackages(null);
    const restored = new Workbook();
    await restored.fromJSON(json);
    expect(restored.getSheet(0).getValue(2, 0)).toBe(3);
    expect(restored.getSheet(0).getFormula(2, 0)).toBe('SUM(A1,A2)');
  });
  it('works with the R1C1 reference style', () => {
    useItalian();
    const wb = sheetWith({ A1: 1, A2: 2 });
    wb.options.referenceStyle = 1;
    const ws = wb.getSheet(0);
    ws.setFormula(2, 0, '=SOMMA(R[-2]C;R[-1]C)');
    expect(ws.getValue(2, 0)).toBe(3);
    expect(ws.getFormula(2, 0)).toBe('SOMMA(R[-2]C;R[-1]C)');
    wb.options.referenceStyle = 0;
  });
  it('copy/fill translation keeps working through the localized display text', () => {
    useItalian();
    const wb = sheetWith({ A1: 1, A2: 2 });
    const ws = wb.getSheet(0);
    ws.setFormula(0, 1, '=SOMMA(A1;1,5)');
    const translated = ws._translateFormula(ws.getFormula(0, 1)!, 1, 0);
    expect(translated).toBe('SUM(A2,1.5)');
    ws._setFormula(1, 1, translated);
    expect(ws.getValue(1, 1)).toBe(3.5); // A2 = 2 -> 2 + 1.5
    expect(ws.getFormula(1, 1)).toBe('SOMMA(A2;1,5)');
  });
  it('defined names typed in Italian store the canonical text and evaluate', () => {
    useItalian();
    const wb = sheetWith({ A1: 1, A2: 2 });
    wb.addCustomName('mieitotali', '=SOMMA($A$1;$A$2)', 0, 0);
    const ws = wb.getSheet(0);
    ws.setFormula(4, 0, '=MIEITOTALI*2');
    expect(ws.getValue(4, 0)).toBe(6);
    expect(wb.getCustomNames()[0].getExpression()).toBe('SUM($A$1,$A$2)');
  });
  it('conditional-formatting rule formulas typed in Italian store the canonical text', async () => {
    useItalian();
    const { Condition } = await import('../../src/features/conditions.js');
    const condition = Condition.fromFormula('=SOMMA(A1;A2)>1');
    expect((condition as unknown as { formula(): string }).formula()).toBe('SUM(A1,A2)>1');
  });
});

describe('English mode stays exactly as before', () => {
  it('rejects the localized separator and resolves localized names as unknown', () => {
    const wb = sheetWith({ A1: 1, A2: 2 });
    const ws = wb.getSheet(0);
    expect(() => ws.setFormula(2, 0, '=SOMMA(A1;A2)')).toThrow();
    ws.setFormula(2, 0, '=SOMMA(A1,A2)');
    expect(ws.getText(2, 0)).toBe('#NAME?');
    expect(ws.getFormula(2, 0)).toBe('SOMMA(A1,A2)');
    expect(ws.getFormula(2, 0)).toBe(localizeFormulaText('SOMMA(A1,A2)', undefined));
  });
  it('renders canonical text for a canonical parse (no package)', () => {
    expect(astToText(parseFormula('SUM(A1,A2,1.5)'))).toBe('SUM(A1,A2,1.5)');
    expect(astToText(parseFormula('{1,2;3,4}'))).toBe('{1,2;3,4}');
    expect(astToText(parseFormula('TRUE'))).toBe('TRUE');
  });
});
