import { describe, expect, it } from 'vitest';
import GC from '@mescius/spread-sheets';
import { setResources } from '../src/resolve.js';
import {
  activeCalcLanguage, allCategory, allFunctions, categoryFunctions, categoryList, categoryOf, formulaFromArguments,
  functionCategories, functionArgumentRows, functionDescription, functionDescriptionLocalized, functionDisplayName,
  functionListSeparator, functionParameters, functionSignature, dialogCategories,
  moreFunctionCategories, recommendedCategory, ribbonCategories, ribbonFunctions, ribbonHiddenFunctions, searchFunctions,
} from '../src/function-library.js';

describe('Designer function library', () => {
  it('lists every function of the trial galleries, per category', () => {
    expect(ribbonFunctions('Financial')).toHaveLength(57);
    expect(ribbonFunctions('Logical')).toEqual(['AND', 'FALSE', 'IF', 'IFERROR', 'IFNA', 'IFS', 'LAMBDA', 'NOT', 'OR', 'SWITCH', 'TRUE', 'XOR']);
    expect(ribbonFunctions('Text')).toHaveLength(45);
    expect(ribbonFunctions('Date and Time')).toHaveLength(26);
    expect(ribbonFunctions('Lookup and Reference')).toHaveLength(21);
    expect(ribbonFunctions('Math and Trigonometry')).toHaveLength(78);
    expect(ribbonFunctions('Statistical')).toHaveLength(144);
    expect(ribbonFunctions('Engineering')).toHaveLength(54);
    expect(ribbonFunctions('Information')).toHaveLength(19);
    expect(ribbonFunctions('Database')).toHaveLength(12);
    expect(ribbonFunctions('Web')).toHaveLength(4);
  });

  it('orders each gallery the way the trial does', () => {
    expect(ribbonFunctions('Financial').slice(0, 6)).toEqual(['ACCRINT', 'ACCRINTM', 'AMORDEGRC', 'AMORLINC', 'COUPDAYBS', 'COUPDAYS']);
    // The trial sorts the gallery by the display name, ignoring the SJS. prefix.
    expect(ribbonFunctions('Text').slice(8, 12)).toEqual(['DBCS', 'DOLLAR', 'SJS.ENDWITH', 'EXACT']);
    expect(ribbonFunctions('Lookup and Reference')).toContain('SJS.TABLE');
  });

  it('keeps the More Functions categories ahead of their galleries', () => {
    expect(moreFunctionCategories.map((entry) => entry.category)).toEqual(['Statistical', 'Engineering', 'Information', 'Database', 'Web']);
    expect(ribbonCategories.map((entry) => entry.command)).toEqual(['formulaFinancial', 'logicalFormula', 'formulaText', 'formulaDateTime', 'formulaLookupReference', 'formulaMathTrig']);
  });

  it('matches the dialog galleries with the ribbon galleries', () => {
    for (const entry of [...ribbonCategories, ...moreFunctionCategories]) {
      const dialog = categoryFunctions[entry.category];
      const gallery = ribbonFunctions(entry.category);
      expect(gallery.length).toBeLessThanOrEqual(dialog.length);
      expect(dialog.filter((name) => !gallery.includes(name))).toEqual(dialog.filter((name) => ribbonHiddenFunctions.includes(name)));
    }
    expect(allFunctions).toHaveLength(498);
    expect(new Set(allFunctions).size).toBe(allFunctions.length);
  });

  it('filters by category and by search text', () => {
    expect(categoryList(allCategory)).toEqual(allFunctions);
    expect(searchFunctions('vlook')).toEqual(['VLOOKUP']);
    // Verified in the trial: typing `SUM` lists the names that start with it, then
    // the names merely containing it, then the functions whose description mentions
    // it. Every group is alphabetical.
    const described = allFunctions.filter((name) => !name.toLowerCase().includes('sum') && functionDescription(name).toLowerCase().includes('sum'));
    expect(searchFunctions('SUM')).toEqual([
      'SUM', 'SUMIF', 'SUMIFS', 'SUMPRODUCT', 'SUMSQ', 'SUMX2MY2', 'SUMX2PY2', 'SUMXMY2',
      'DSUM', 'IMSUM', 'SERIESSUM', ...described,
    ]);
    expect(described.length).toBeGreaterThan(0);
    expect(categoryList('Logical', 'if')).toEqual(categoryFunctions['Logical']);
    expect(categoryList(recommendedCategory, 'xlookup')).toEqual(['XLOOKUP']);
    expect(categoryOf('VLOOKUP')).toBe('Lookup and Reference');
    expect(categoryOf('NOT-A-FUNCTION')).toBe(allCategory);
  });

  it('adds the Recommended gallery only while searching', () => {
    expect(dialogCategories('')).toEqual([allCategory, ...functionCategories]);
    expect(dialogCategories('sum')).toEqual([recommendedCategory, allCategory, ...functionCategories]);
    // A real category keeps its whole list while the search box holds text.
    expect(categoryList('Math and Trigonometry', 'sum')).toEqual(categoryFunctions['Math and Trigonometry']);
    expect(categoryList('Math and Trigonometry')).toHaveLength(80);
    expect(categoryList(allCategory)).toHaveLength(498);
  });

  it('draws one Function Arguments row per parameter', () => {
    expect(functionArgumentRows('VLOOKUP')).toEqual(['lookup_value', 'table_array', 'col_index_num', 'range_lookup']);
    expect(functionArgumentRows('SUM')).toEqual(['number1', 'number2']);
    expect(functionArgumentRows('PI')).toEqual([]);
  });

  it('describes functions for both dialogs', () => {
    expect(functionSignature('ABS')).toBe('ABS(number)');
    expect(functionSignature('VLOOKUP')).toBe('VLOOKUP(lookup_value,table_array,col_index_num,range_lookup)');
    expect(functionParameters('VLOOKUP')).toContain('[range_lookup]');
    expect(functionDescription('ABS').toLowerCase()).toContain('number from zero');
    expect(functionDescription('NOPE')).toBe('');
    expect(formulaFromArguments('ROUND', ['=1.2345', '', '2'])).toBe('ROUND(1.2345,2)');
    expect(formulaFromArguments('SUM', ['', ''])).toBe('SUM()');
  });

  it('knows every listed function beyond the argument names', () => {
    const unknown = allFunctions.filter((name) => functionDescription(name) === '');
    expect(unknown).toEqual([]);
    expect(functionCategories).toContain('Math and Trigonometry');
  });
});

describe('TASK 89: localized function UI with the Italian calc language package', () => {
  const LP = GC.Spread.CalcEngine.LanguagePackages;
  it('displays and inserts Italian names with the culture separator, then restores English', () => {
    expect(LP.languagePackages('it')).toBe('it');
    try {
      expect(functionDisplayName('SUM')).toBe('SOMMA');
      expect(functionDisplayName('VLOOKUP')).toBe('CERCA.VERT');
      expect(functionDisplayName('MAX')).toBe('MAX'); // Excel-IT keeps the name
      expect(functionListSeparator()).toBe(';');
      expect(functionSignature('ABS')).toBe('ASS(number)');
      expect(formulaFromArguments('ROUND', ['=1,5', '', '0'])).toBe('ARROTONDA(1,5;0)');
      // The dialog data stays canonical English; only display is localized.
      expect(categoryList('Math and Trigonometry')).toContain('SUM');
      expect(searchFunctions('somma')).toContain('SUM');
      expect(searchFunctions('CERCA.VERT')).toContain('VLOOKUP');
    } finally {
      // The public d.ts types the parameter as `string`, so reset with the empty-name
      // form (deactivates; `null` does too but is untyped — covered in the core tests).
      LP.languagePackages('');
    }
    expect(functionDisplayName('SUM')).toBe('SUM');
    expect(functionListSeparator()).toBe(',');
  });
  it('prefers the loaded resource language descriptions and falls back to the English catalog', () => {
    expect(functionDescriptionLocalized({ functionDescriptions: { SUM: 'Somma i valori specificati.' } }, 'SUM'))
      .toBe('Somma i valori specificati.');
    expect(functionDescriptionLocalized({ functionDescriptions: { STDEV_P: 'x' } }, 'STDEV.P')).toBe('x');
    expect(functionDescriptionLocalized({}, 'SUM').toLowerCase()).toContain('number');
  });
  it('merges the loaded resource descriptions into the active package for the core autocomplete', () => {
    setResources({ functionDescriptions: { TESTONLY_FUNCTION: 'Solo test.' } });
    expect(LP.languagePackages('it')).toBe('it');
    try {
      const pkg = activeCalcLanguage();
      expect(pkg?.languageName).toBe('it');
      expect(pkg?.description('TESTONLY_FUNCTION')).toBe('Solo test.');
      // Dotted catalog names are addressed by underscore keys in the resources and must reverse-map.
      expect((pkg?.description('STDEV.P') ?? '').toLowerCase()).toContain('standard deviation');
      // Genuine underscore catalog names (`BC_CODABAR`) are NOT rewritten to dots.
      expect(pkg?.description('BC.CODABAR')).toBeUndefined();
    } finally {
      LP.languagePackages('');
    }
  });
});
