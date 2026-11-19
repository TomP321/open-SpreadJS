import { describe, expect, it } from 'vitest';
import GC from '../src/index.js';

const { Workbook, Worksheet } = GC.Spread.Sheets;

describe('worksheet password protection', () => {
  it('protect() without password leaves no verifier and unprotects freely', () => {
    const sheet = new Worksheet('S');
    sheet.protect();
    expect(sheet.options.isProtected).toBe(true);
    expect(sheet.hasPassword()).toBe(false);
    const json = sheet.toJSON();
    expect(json.isProtected).toBe(true);
    expect((json.protectionOptions as Record<string, unknown> | undefined)?.hashValue).toBeUndefined();
    expect(sheet.unprotect()).toBe(true);
    expect(sheet.options.isProtected).toBe(false);
  });

  it('protect(password) stores a SHA-512 shaped verifier and enforces it', () => {
    const sheet = new Worksheet('S');
    sheet.protect('abc');
    expect(sheet.hasPassword()).toBe(true);
    const options = sheet.toJSON().protectionOptions as Record<string, unknown>;
    expect(options.algorithmName).toBe('SHA-512');
    expect(options.spinCount).toBe(100000);
    expect(Buffer.from(String(options.saltValue), 'base64')).toHaveLength(16);
    expect(Buffer.from(String(options.hashValue), 'base64')).toHaveLength(64);
    expect(sheet.unprotect('wrong')).toBe(false);
    expect(sheet.options.isProtected).toBe(true);
    expect(sheet.unprotect('')).toBe(false);
    expect(sheet.unprotect()).toBe(false);
    expect(sheet.unprotect('abc')).toBe(true);
    expect(sheet.hasPassword()).toBe(false);
  });

  it('unprotect keeps verifier fields in JSON like the interop product', () => {
    const sheet = new Worksheet('S');
    sheet.protect('pw123');
    sheet.unprotect('pw123');
    const json = sheet.toJSON();
    expect(json.isProtected).toBeUndefined();
    expect((json.protectionOptions as Record<string, unknown>).hashValue).toBeTruthy();
    expect(sheet.hasPassword()).toBe(false);
  });

  it('unprotect on an unprotected sheet returns true', () => {
    const sheet = new Worksheet('S');
    expect(sheet.unprotect('whatever')).toBe(true);
  });

  it('round-trips protected password sheets through JSON', async () => {
    const wb = new Workbook();
    await wb.fromJSON({
      sheets: {
        S1: {
          name: 'S1',
          rowCount: 10,
          columnCount: 5,
          isProtected: true,
          protectionOptions: {
            algorithmName: 'SHA-512',
            hashValue: 'abc',
            saltValue: 'xyz',
            spinCount: 100000,
            allowSort: true,
          },
        },
      },
    } as never);
    const sheet = wb.getSheet(0);
    expect(sheet.options.isProtected).toBe(true);
    expect(sheet.hasPassword()).toBe(true);
    // Verifiers from foreign products cannot be recomputed here.
    expect(sheet.unprotect('guess')).toBe(false);
    expect(sheet.options.isProtected).toBe(true);
    // Protection options survive serialization untouched.
    const json = sheet.toJSON();
    expect((json.protectionOptions as Record<string, unknown>).allowSort).toBe(true);
  });

  it('plain isProtected JSON without a verifier unprotects without a password', async () => {
    const wb = new Workbook();
    await wb.fromJSON({ sheets: { S1: { name: 'S1', isProtected: true } } } as never);
    const sheet = wb.getSheet(0);
    expect(sheet.options.isProtected).toBe(true);
    expect(sheet.hasPassword()).toBe(false);
    expect(sheet.unprotect()).toBe(true);
  });

  it('locked cells reject formulas while protected; unlocked cells stay editable', () => {
    const sheet = new Worksheet('S');
    sheet.setValue(1, 1, 5);
    sheet.protect();
    sheet.setFormula(0, 0, '=1+1');
    expect(sheet.getFormula(0, 0)).toBeNull();
    const style = new GC.Spread.Sheets.Style();
    style.locked = false;
    sheet.setStyle(2, 2, style);
    sheet.setFormula(2, 2, '=1+1');
    expect(sheet.getFormula(2, 2)).toBe('1+1');
    expect(sheet._isEditableCell(0, 0)).toBe(false);
    expect(sheet._isEditableCell(2, 2)).toBe(true);
    sheet.unprotect();
    expect(sheet._isEditableCell(0, 0)).toBe(true);
  });

  it('protecting twice with different passwords keeps the last verifier usable', () => {
    const sheet = new Worksheet('S');
    sheet.protect('one');
    sheet.unprotect('one');
    sheet.protect('two');
    expect(sheet.unprotect('one')).toBe(false);
    expect(sheet.unprotect('two')).toBe(true);
  });

  it('empty-password verifier pair verifies instantly for the empty password', async () => {
    const { hashSheetPassword, verifySheetPassword } = await import('../src/protection.js');
    const pair = hashSheetPassword('');
    expect(verifySheetPassword('', pair.saltValue, pair.hashValue)).toBe(true);
    expect(verifySheetPassword('x', pair.saltValue, pair.hashValue)).toBe(false);
    const real = hashSheetPassword('secret');
    expect(verifySheetPassword('secret', real.saltValue, real.hashValue)).toBe(true);
    expect(verifySheetPassword('secret2', real.saltValue, real.hashValue)).toBe(false);
    // Fresh salt per derivation.
    expect(hashSheetPassword('secret').saltValue).not.toBe(real.saltValue);
  });
});
