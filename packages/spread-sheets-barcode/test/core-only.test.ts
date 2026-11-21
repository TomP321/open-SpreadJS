/**
 * TASK 73 (unit): the core WITHOUT the barcode add-in keeps `BC_*` dormant, and the add-in's
 * handshake exists on the core namespace only as a hidden (non-enumerable, undeclared) hook,
 * so the core's public surface stays identical to the SpreadJS d.ts contract.
 */
import { createRequire } from 'node:module';
import { expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const core = require('../../spread-sheets/dist/gc.spread.sheets.cjs');
const { Sheets } = core.Spread;

/** Evaluate a formula core-only (this file never loads the add-in). */
function evaluate(formula: string): { text: string; value: unknown } {
  const workbook = new core.Spread.Sheets.Workbook();
  const sheet = workbook.getActiveSheet();
  sheet.setFormula(0, 0, formula);
  const result = { text: sheet.getText(0, 0), value: sheet.getValue(0, 0) };
  workbook.destroy();
  return result;
}

it('answers #NAME? for every BC_* symbology until the add-in package loads', () => {
  for (const name of ['BC_QRCODE', 'BC_EAN13', 'BC_EAN8', 'BC_CODABAR', 'BC_CODE39', 'BC_CODE93', 'BC_CODE128', 'BC_GS1_128', 'BC_CODE49', 'BC_PDF417', 'BC_DATAMATRIX'])
    expect(evaluate(`${name}("x")`).text, name).toBe('#NAME?');
  // The engine itself is alive: an ordinary formula still evaluates.
  expect(evaluate('=1+2').value).toBe(3);
});

it('exposes the barcode registration only through the hidden hook (public surface = d.ts)', () => {
  const keys = Object.keys(Sheets);
  expect(keys).not.toContain('registerBarcodeFunctions');
  expect(keys).not.toContain('_registerBarcodeFunctions');
  expect('registerBarcodeFunctions' in Sheets).toBe(false);
  expect(Sheets.registerBarcodeFunctions).toBeUndefined();
  const descriptor = Object.getOwnPropertyDescriptor(Sheets, '_registerBarcodeFunctions');
  expect(typeof descriptor?.value).toBe('function');
  expect(descriptor?.enumerable).toBe(false);
});
