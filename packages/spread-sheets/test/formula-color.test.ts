import { describe, expect, it } from 'vitest';
import { colorFormula, parseReference, referencePalette } from '../src/features/formula-color.js';

describe('formula colouring', () => {
  it('keeps strings, errors, functions, booleans and numeric exponents plain', () => {
    const formula = '=SUM(A1,"B2 ""C3""",#DIV/0!,TRUE,1.5e3)+Named';
    const result = colorFormula(formula);
    expect(result.segments.map(segment => segment.text).join('')).toBe(formula);
    expect(result.references.map(({ text, start }) => ({ text, start }))).toEqual([
      { text: 'A1', start: formula.indexOf('A1') },
      { text: 'Named', start: formula.indexOf('Named') },
    ]);
    expect(result.references[1]).toMatchObject({ row1: -1, col1: -1, row2: -1, col2: -1 });
  });

  it('reuses colours case-insensitively and across absolute markers, then cycles', () => {
    const result = colorFormula('=A1+$a$1+B1+C1+D1+E1+F1+G1+H1');
    expect(result.references.map(reference => reference.color)).toEqual([
      referencePalette[0], referencePalette[0], ...referencePalette.slice(1), referencePalette[0],
    ]);
    expect(result.segments.filter(segment => segment.color).map(segment => segment.text)).toEqual([
      'A1', '$a$1', 'B1', 'C1', 'D1', 'E1', 'F1', 'G1', 'H1',
    ]);
  });

  it('records qualified ranges and their offsets', () => {
    const formula = "='O''Brien'!$AA$2:B3+Sheet_2!C4";
    const { references } = colorFormula(formula);
    expect(references).toEqual([
      { text: "'O''Brien'!$AA$2:B3", color: referencePalette[0], start: 1, sheetName: "O'Brien", row1: 1, col1: 26, row2: 2, col2: 1 },
      { text: 'Sheet_2!C4', color: referencePalette[1], start: formula.indexOf('Sheet_2'), sheetName: 'Sheet_2', row1: 3, col1: 2, row2: 3, col2: 2 },
    ]);
  });
});

describe('parseReference', () => {
  it.each([
    ['A1', undefined, 0, 0, 0, 0],
    ['$z$10', undefined, 9, 25, 9, 25],
    ['Sheet_1!AA2:$BC$12', 'Sheet_1', 1, 26, 11, 54],
    ["'O''Brien Sheet'!C3:A1", "O'Brien Sheet", 2, 2, 0, 0],
  ])('parses %s', (input, sheetName, row1, col1, row2, col2) => {
    expect(parseReference(input as string)).toEqual({ sheetName, row1, col1, row2, col2 });
  });

  it.each(['', 'A0', 'A1:B0', 'AAAA1', '1A', 'A', 'A1:', '!A1', 'bad sheet!A1', 'A1+B2'])('rejects %s', input => {
    expect(parseReference(input)).toBeUndefined();
  });
});
