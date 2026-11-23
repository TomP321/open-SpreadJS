/**
 * TASK 76 (unit): loading `@opensheets/spread-sheets-languagepackages` is harmless and idempotent
 * through every published distribution (CJS require, ESM import, script-tag UMD onto
 * `window.GC`): the core keeps working (formula evaluation + the calc-engine language-package layer under test), a
 * second load changes nothing, and no console warnings appear against a real core.
 */
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const core = require('../../spread-sheets/dist/gc.spread.sheets.cjs');

/** Feature probe: exercises the calc-engine language-package layer end to end against a given GC namespace. */
const PROBE = new Function('GC', `return (({ callable: typeof GC.Spread.CalcEngine.LanguagePackages.languagePackages === 'function' }));`) as (gc: unknown) => Record<string, unknown>;
const EXPECTED = { callable: true } as Record<string, unknown>;

/** TASK 89: full round trip of the built-in Italian package on a given GC namespace. */
const IT_PROBE = new Function('GC', `
  const LP = GC.Spread.CalcEngine.LanguagePackages;
  const workbook = new GC.Spread.Sheets.Workbook();
  const sheet = workbook.getActiveSheet();
  sheet.setValue(0, 0, 1);
  sheet.setValue(1, 0, 2);
  const before = LP.languagePackages();
  LP.languagePackages('it');
  sheet.setFormula(2, 0, '=SOMMA(A1;A2)');
  const result = { active: LP.languagePackages(), value: sheet.getValue(2, 0), display: sheet.getFormula(2, 0) };
  LP.languagePackages(null);
  result.restored = LP.languagePackages() === before;
  workbook.destroy();
  return result;
`) as (gc: unknown) => Record<string, unknown>;
const EXPECTED_IT = { active: 'it', value: 3, display: 'SOMMA(A1;A2)', restored: true } as Record<string, unknown>;

it('a CJS require of the add-in loads twice without touching a healthy core', () => {
  const warnings: unknown[] = [];
  const original = console.warn;
  console.warn = (...args: unknown[]) => void warnings.push(args[0]);
  try {
    require('../dist/gc.spread.calcengine.languagepackages.cjs');
    require('../dist/gc.spread.calcengine.languagepackages.cjs'); // second load: module cache hit, still no error
  }
  finally {
    console.warn = original;
  }
  expect(warnings, 'a real core must not produce warnings').toEqual([]);
  const workbook = new core.Spread.Sheets.Workbook();
  const sheet = workbook.getActiveSheet();
  sheet.setFormula(0, 0, '=1+2');
  expect(sheet.getValue(0, 0), 'the core still evaluates formulas').toBe(3);
  workbook.destroy();
  expect(PROBE(core)).toEqual(EXPECTED);
  expect(IT_PROBE(core)).toEqual(EXPECTED_IT);
});

it('an ESM import of the add-in loads twice on the core the app itself imported', async () => {
  const { default: gc } = await import('@mescius/spread-sheets');
  // Dynamic import of our side-effect dist file (no typings by design; the variable
  // specifier keeps tsc from demanding a declaration for the built artifact).
  const addonEntry = '../dist/gc.spread.calcengine.languagepackages.esm.js';
  await import(addonEntry);
  await import(addonEntry); // module-cache hit: still registered exactly zero times more
  const workbook = new gc.Spread.Sheets.Workbook();
  const sheet = workbook.getActiveSheet();
  sheet.setFormula(0, 0, '=1+2');
  expect(sheet.getValue(0, 0), 'the core still evaluates formulas').toBe(3);
  workbook.destroy();
  expect(PROBE(gc)).toEqual(EXPECTED);
  expect(IT_PROBE(gc)).toEqual(EXPECTED_IT);
}, 30_000); // the first ESM import transforms the full core bundle (~4 MB): allow cold-start time under parallel runs

it('the script-tag build loads twice onto window.GC without breaking the core', () => {
  // This is our own browser build, never the vendor's opaque bundle.
  const coreScript = readFileSync(new URL('../../spread-sheets/dist/gc.spread.sheets.all.min.js', import.meta.url), 'utf8');
  const plugin = readFileSync(new URL('../dist/gc.spread.calcengine.languagepackages.min.js', import.meta.url), 'utf8');
  // Node's injected TextEncoder returns host typed arrays; keep the VM's binary constructors
  // in that same realm, as they would be in an actual browser.
  const context = { Blob, TextEncoder, TextDecoder, Uint8Array, Uint16Array, Uint32Array, Int32Array, ArrayBuffer, queueMicrotask, console, setTimeout, clearTimeout, performance, JSON };
  const out = runInNewContext(`
    ${coreScript}
    const keysBefore = Object.keys(GC.Spread.Sheets).length;
    ${plugin}
    ${plugin}
    const wb = new GC.Spread.Sheets.Workbook();
    const sheet = wb.getActiveSheet();
    sheet.setFormula(0, 0, '=1+2');
    const result0 = sheet.getValue(0, 0);
    const LP = GC.Spread.CalcEngine.LanguagePackages;
    let italian = null;
    if (LP.languagePackages('it') === 'it') {
      const sheetIt = wb.getSheet(0);
      sheetIt.setValue(5, 5, 1);
      sheetIt.setValue(6, 5, 2);
      sheetIt.setFormula(7, 5, '=SOMMA(F6;F7)');
      italian = { value: sheetIt.getValue(7, 5), display: sheetIt.getFormula(7, 5) };
      LP.languagePackages(null);
    }
    const result = {
      formula: result0,
      keysStable: Object.keys(GC.Spread.Sheets).length === keysBefore,
      probe: (({ callable: typeof GC.Spread.CalcEngine.LanguagePackages.languagePackages === 'function' })),
      italian,
    };
    wb.destroy();
    JSON.stringify(result);
  `, context);
  expect(JSON.parse(out)).toEqual({
    formula: 3,
    keysStable: true,
    probe: EXPECTED,
    italian: { value: 3, display: 'SOMMA(F6;F7)' },
  });
}, 30_000); // evaluates the full core browser bundle in the VM twice over: allow cold-start time

it('warns instead of breaking when the host core is missing', () => {
  const warnings: unknown[] = [];
  const original = console.warn;
  console.warn = (...args: unknown[]) => void warnings.push(args[0]);
  try {
    // Re-evaluate the entry without any core behind the require (a page that forgot the
    // core script or the alias): no throw, one actionable warning.
    const module = { exports: {} as Record<string, unknown> };
    const factory = new Function('module', 'exports', 'require', 'console', readFileSync(new URL('../dist/gc.spread.calcengine.languagepackages.cjs', import.meta.url), 'utf8'));
    factory(module, module.exports, () => undefined, { warn: (...args: unknown[]) => void warnings.push(args[0]) });
  }
  finally {
    console.warn = original;
  }
  expect(warnings.length).toBe(1);
  expect(String(warnings[0])).toContain('spread-sheets-languagepackages');
});
