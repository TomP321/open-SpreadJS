import { describe, expect, it } from 'vitest';
import {
  adjustRefsForStructure,
  astToText,
  collectRefs,
  parseFormula,
  translateRefs,
} from '../../src/calc/parser.js';
import { numberToText, parseNumberText, CalcError } from '../../src/calc/values.js';

describe('formula parser', () => {
  it('applies Excel operator precedence', () => {
    const value = (formula: string) => {
      const root = parseFormula(formula);
      return astToText(root);
    };
    expect(value('-2^2')).toBe('-2^2');
    const minus = parseFormula('-2^2');
    expect(minus.kind).toBe('binary');
    if (minus.kind === 'binary') expect(minus.left.kind).toBe('unary');
    expect(value('2^3^2')).toBe('2^3^2');
    const power = parseFormula('2^3^2');
    expect(power.kind).toBe('binary');
    if (power.kind === 'binary') {
      expect(power.left.kind).toBe('binary');
      expect(power.right.kind).toBe('number');
    }
    expect(value('1+2&3')).toBe('1+2&3');
    expect(value('50%^2')).toBe('50%^2');
    expect(value('A1+B1*C1')).toBe('A1+B1*C1');
  });

  it('normalises references, sheet names, functions and errors', () => {
    expect(astToText(parseFormula('=sum(a1:a3)'))).toBe('SUM(A1:A3)');
    expect(astToText(parseFormula("='My Sheet'!b2+$c$4"))).toBe("'My Sheet'!B2+$C$4");
    expect(astToText(parseFormula('=#REF!'))).toBe('#REF!');
    expect(astToText(parseFormula('={1,2;3,4}'))).toBe('{1,2;3,4}');
    expect(astToText(parseFormula('=A1:B2 B2:C3'))).toBe('A1:B2 B2:C3');
    expect(astToText(parseFormula('=SUM((A1:A2,B1:B2))'))).toBe('SUM((A1:A2,B1:B2))');
    expect(astToText(parseFormula('=A1#'))).toBe('A1#');
  });

  it('parses whole rows and columns plus unions and intersections', () => {
    for (const formula of ['SUM(A:A)', 'SUM(1:1)', 'SUM($A:$C)', 'SUM($1:$3)']) {
      const refs = collectRefs(parseFormula(formula));
      expect(refs).toHaveLength(1);
    }
    const intersection = parseFormula('A1:A3 A2:A5');
    expect(intersection.kind).toBe('intersect');
    const union = parseFormula('SUM((A1:A2,A4:A5))');
    expect(union.kind).toBe('function');
    if (union.kind === 'function') expect(union.args[0]?.kind).toBe('paren');
  });

  it('distinguishes A1 references from names at reference boundaries', () => {
    for (const formula of ['$A$1', 'XFD1048576', 'A1:B2', 'SUM($AA1:A$2)']) {
      expect(collectRefs(parseFormula(formula)).length).toBeGreaterThan(0);
    }
    for (const name of ['XFE1', 'A1048577', 'A1_name', 'A1name']) {
      expect(parseFormula(name).kind).toBe('name');
    }
    expect(parseFormula('A1(2)').kind).toBe('function');
  });

  it('parses R1C1 references relative to the base cell', () => {
    const ast = parseFormula('SUM(R1C1:R2C1)', { r1c1: true });
    expect(astToText(ast, { r1c1: true })).toBe('SUM(R1C1:R2C1)');
    const relative = parseFormula('R[1]C[-1]+RC', { r1c1: true });
    expect(relative.kind).toBe('binary');
    if (relative.kind === 'binary') {
      expect(relative.left.kind).toBe('ref');
      if (relative.left.kind === 'ref') {
        expect(relative.left.r1).toBe(1);
        expect(relative.left.c1).toBe(-1);
        expect(relative.left.r1Rel).toBe(true);
      }
    }
  });

  it('reports the position of syntax errors', () => {
    expect(() => parseFormula('=SUM(')).toThrowError(/position/);
    expect(() => parseFormula('=1 2')).toThrowError(/Unexpected token/);
    expect(() => parseFormula('="unterminated')).toThrowError(/Unterminated/);
  });

  it('translates relative references', () => {
    const ast = parseFormula('A1+$B$2+C$3+$D4');
    expect(astToText(translateRefs(ast, 1, 1))).toBe('B2+$B$2+D$3+$D5');
  });

  it('adjusts references for inserted and deleted rows', () => {
    const inserted = adjustRefsForStructure(parseFormula('SUM(A1:A3)+A2*2'), 'row', 1, 1, false, 'Sheet1');
    expect(astToText(inserted)).toBe('SUM(A1:A4)+A3*2');
    const deleted = adjustRefsForStructure(parseFormula('SUM(A1:A3)+A5'), 'row', 1, 2, true, 'Sheet1');
    expect(astToText(deleted)).toBe('SUM(A1:A1)+A3');
    const invalid = adjustRefsForStructure(parseFormula('A2+1'), 'row', 1, 1, true, 'Sheet1');
    expect(astToText(invalid)).toBe('#REF!+1');
    const columns = adjustRefsForStructure(parseFormula('B1+C1'), 'col', 1, 1, false, 'Sheet1', false);
    expect(astToText(columns)).toBe('B1+C1');
    const qualified = adjustRefsForStructure(parseFormula('Sheet2!B1'), 'col', 0, 1, false, 'Sheet1', true);
    expect(astToText(qualified)).toBe('Sheet2!B1');
  });
});

describe('value helpers', () => {
  it('formats numbers the way SpreadJS string conversion does', () => {
    expect(numberToText(0.1 + 0.2)).toBe('0.3');
    expect(numberToText(1 / 3)).toBe('0.333333333333333');
    expect(numberToText(123456789012345678)).toBe('123456789012346000');
    expect(numberToText(1e20)).toBe('1E+20');
    expect(numberToText(1e-7)).toBe('0.0000001');
    expect(numberToText(1e-19)).toBe('1E-19');
    expect(numberToText(-0)).toBe('0');
    expect(numberToText(Infinity)).toBe('Infinity');
  });

  it('parses numeric text with currency, grouping and percentages', () => {
    expect(parseNumberText(' 1,234.5 ')).toBe(1234.5);
    expect(parseNumberText('$1,234.5')).toBe(1234.5);
    expect(parseNumberText('12%')).toBe(0.12);
    expect(parseNumberText('1e3')).toBe(1000);
    expect(parseNumberText('abc')).toBeUndefined();
    expect(parseNumberText('')).toBeUndefined();
  });

  it('exposes CalcError as a string-compatible error value', () => {
    const error = CalcError.parse('#N/A');
    expect(String(error)).toBe('#N/A');
    expect(error).toBeInstanceOf(CalcError);
  });
});
