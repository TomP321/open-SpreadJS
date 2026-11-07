import { describe, expect, it } from 'vitest';
import { insertReference, referenceAllowed } from '../src/features/formula-point.js';

describe('formula point selection', () => {
  it('allows references after formula operators, but not inside text or after an operand', () => {
    for (const text of ['=', '=SUM(', '=SUM(A1, ', '=A1+', '=A1*', '=A1>=']) expect(referenceAllowed(text, text.length), text).toBe(true);
    for (const text of ['hello', '=SUM(A1', '=12', '="abc+', '=SUM(A1)']) expect(referenceAllowed(text, text.length), text).toBe(false);
    expect(referenceAllowed('=SUM()+1', 5)).toBe(true);
  });
  it('inserts and replaces only the selected text', () => {
    expect(insertReference('=SUM()', 5, 5, 'B2')).toBe('=SUM(B2)');
    expect(insertReference('=SUM(B2)', 5, 7, 'B2:C4')).toBe('=SUM(B2:C4)');
  });
});
