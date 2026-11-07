import { describe, expect, it } from 'vitest';
import { insertReference, referenceAllowed, closeFormulaParentheses } from '../src/features/formula-point.js';

describe('formula point selection', () => {
  it('allows references after formula operators, but not inside text or after an operand', () => {
    for (const text of ['=', '=SUM(', '=SUM(A1, ', '=A1+', '=A1*', '=A1>=']) expect(referenceAllowed(text, text.length), text).toBe(true);
    for (const text of ['hello', '=SUM(A1', '=12', '="abc+', '=SUM(A1)']) expect(referenceAllowed(text, text.length), text).toBe(false);
    expect(referenceAllowed('=SUM()+1', 5)).toBe(true);
  });
  it('closes unmatched parentheses without counting quoted text', () => {
    expect(closeFormulaParentheses('=SUM(A1')).toBe('=SUM(A1)');
    expect(closeFormulaParentheses('=IF(A1="(",SUM(B1:B2')).toBe('=IF(A1="(",SUM(B1:B2))');
    expect(closeFormulaParentheses("='Sheet(1)'!A1")).toBe("='Sheet(1)'!A1");
  });
  it('inserts and replaces only the selected text', () => {
    expect(insertReference('=SUM()', 5, 5, 'B2')).toBe('=SUM(B2)');
    expect(insertReference('=SUM(B2)', 5, 7, 'B2:C4')).toBe('=SUM(B2:C4)');
  });
});
