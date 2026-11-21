/**
 * TASK 73 (unit): loading `@opensheets/spread-sheets-barcode` registers the `BC_*` formula
 * layer on the core it finds — through every published distribution (CJS require, ESM import,
 * script-tag UMD onto `window.GC`) — and doing it again stays a no-op (exactly once,
 * idempotent), matching the trial add-in's load behaviour.
 */
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const core = require('../../spread-sheets/dist/gc.spread.sheets.cjs');

interface SheetView { setFormula(row: number, col: number, formula: string): void; getText(row: number, col: number): string; getValue(row: number, col: number): { name?: string; value?: { text?: unknown; type?: unknown; isBarcode?: unknown } } | null }

/** `{ text, name, record }` of a `BC_*` formula cell, ready for exact comparison. */
function readBarcode(sheet: SheetView, col: number, formula: string) {
  sheet.setFormula(0, col, formula);
  const value = sheet.getValue(0, col);
  return {
    text: sheet.getText(0, col),
    name: value?.name ?? null,
    record: value?.value ? { text: value.value.text, type: value.value.type, isBarcode: value.value.isBarcode } : null,
  };
}

it('a CJS require of the add-in registers BC_* on the same core, exactly once and idempotently', () => {
  const sheet = new core.Spread.Sheets.Workbook().getActiveSheet();
  expect(readBarcode(sheet, 0, 'BC_QRCODE("x")').text, 'before the add-in').toBe('#NAME?');
  require('../dist/gc.spread.sheets.barcode.cjs');
  const registered = readBarcode(sheet, 1, 'BC_QRCODE("x")');
  expect(registered).toEqual({ text: '', name: 'BC_QRCODE', record: { text: 'x', type: 'QRCode', isBarcode: true } });
  // A second load path (cached require + a direct hook call, our stand-in for a second
  // bundle copy) must not double-register or change the result.
  core.Spread.Sheets._registerBarcodeFunctions();
  require('../dist/gc.spread.sheets.barcode.cjs');
  expect(readBarcode(sheet, 2, 'BC_QRCODE("x")')).toEqual(registered);
  expect(readBarcode(sheet, 3, 'BC_CODE128("12345678")')).toEqual({ text: '', name: 'BC_CODE128', record: { text: '12345678', type: 'Code128', isBarcode: true } });
  expect(readBarcode(sheet, 4, 'BC_CODABAR("HELLO")').text, 'trial rejects unencodable payloads').toBe('#VALUE!');
});

it('an ESM import of the add-in registers BC_* on the core the app itself imported', async () => {
  const { default: gc } = await import('@mescius/spread-sheets');
  const sheet = gc.Spread.Sheets.Workbook ? new gc.Spread.Sheets.Workbook().getActiveSheet() : null;
  if (!sheet) throw new Error('the core ESM entry did not expose the GC namespace');
  expect(readBarcode(sheet, 0, 'BC_QRCODE("x")').text, 'before the add-in').toBe('#NAME?');
  // Dynamic import of our side-effect dist file (no typings by design; the variable
  // specifier keeps tsc from demanding a declaration for the built artifact).
  const addonEntry = '../dist/gc.spread.sheets.barcode.esm.js';
  await import(addonEntry);
  // The add-in found THIS module instance (same specifier => same registry entry), so the
  // core the application imported now evaluates the barcode layer.
  const registered = readBarcode(sheet, 1, 'BC_QRCODE("x")');
  expect(registered).toEqual({ text: '', name: 'BC_QRCODE', record: { text: 'x', type: 'QRCode', isBarcode: true } });
  // Re-importing is a module-cache hit: still registered exactly once, same result.
  await import(addonEntry);
  expect(readBarcode(sheet, 2, 'BC_QRCODE("x")')).toEqual(registered);
}, 30_000); // the first ESM import transforms the full core bundle (~4 MB): allow cold-start time under parallel runs

it('the script-tag build registers BC_* on window.GC, even when the page loads it twice', () => {
  // This is our own browser build, never the vendor's opaque bundle.
  const coreScript = readFileSync(new URL('../../spread-sheets/dist/gc.spread.sheets.all.min.js', import.meta.url), 'utf8');
  const plugin = readFileSync(new URL('../dist/gc.spread.sheets.barcode.min.js', import.meta.url), 'utf8');
  // Node's injected TextEncoder returns host typed arrays; keep the VM's binary constructors
  // in that same realm, as they would be in an actual browser.
  const context = { Blob, TextEncoder, TextDecoder, Uint8Array, Uint16Array, Uint32Array, Int32Array, ArrayBuffer, queueMicrotask, console, setTimeout, clearTimeout, performance, JSON };
  const out = runInNewContext(`
    ${coreScript}
    const before = (() => { const s = new GC.Spread.Sheets.Workbook().getActiveSheet(); s.setFormula(0, 0, 'BC_QRCODE("x")'); const t = s.getText(0, 0); return t; })();
    ${plugin}
    ${plugin}
    const wb = new GC.Spread.Sheets.Workbook();
    const sheet = wb.getActiveSheet();
    sheet.setFormula(0, 0, 'BC_QRCODE("x")');
    const value = sheet.getValue(0, 0);
    const result = {
      before,
      hookEnumerable: Object.keys(GC.Spread.Sheets).includes('_registerBarcodeFunctions'),
      text: sheet.getText(0, 0),
      name: value.name,
      record: { text: value.value.text, type: value.value.type, isBarcode: value.value.isBarcode },
    };
    wb.destroy();
    JSON.stringify(result);
  `, context);
  expect(JSON.parse(out)).toEqual({
    before: '#NAME?',
    hookEnumerable: false,
    text: '',
    name: 'BC_QRCODE',
    record: { text: 'x', type: 'QRCode', isBarcode: true },
  });
}, 30_000); // evaluates the full core browser bundle in the VM: allow cold-start time under parallel runs

it('warns instead of breaking when the host core is not an OpenSheets core', () => {
  const warnings: unknown[] = [];
  const original = console.warn;
  console.warn = (...args: unknown[]) => void warnings.push(args[0]);
  try {
    // Re-evaluate the entry against a foreign GC (the trial core has no hook): no throw, a warning.
    const module = { exports: {} as Record<string, unknown> };
    const factory = new Function('module', 'exports', 'require', 'console', readFileSync(new URL('../dist/gc.spread.sheets.barcode.cjs', import.meta.url), 'utf8'));
    factory(module, module.exports, () => ({ Spread: { Sheets: {} } }), { warn: (...args: unknown[]) => void warnings.push(args[0]) });
  }
  finally {
    console.warn = original;
  }
  expect(warnings.length).toBe(1);
  expect(String(warnings[0])).toContain('_registerBarcodeFunctions');
});
