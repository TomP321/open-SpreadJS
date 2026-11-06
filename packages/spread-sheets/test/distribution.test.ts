import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { expect, it } from 'vitest';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
it('supports npm alias names through real Node ESM and CommonJS resolution', () => {
  const consumer = fs.mkdtempSync(path.join(os.tmpdir(), 'opensheets-imports-'));
  try {
    const scope = path.join(consumer, 'node_modules/@mescius');
    fs.mkdirSync(scope, { recursive: true });
    fs.symlinkSync(packageRoot, path.join(scope, 'spread-sheets'), 'dir');
    fs.writeFileSync(path.join(consumer, 'consumer.mjs'), `
      import assert from 'node:assert/strict';
      import GC from '@mescius/spread-sheets';
      import * as Namespace from '@mescius/spread-sheets';
      import { createRequire } from 'node:module';
      const cjs = createRequire(import.meta.url)('@mescius/spread-sheets');
      assert.equal(Namespace.Spread, GC.Spread);
      assert.equal(Namespace.Data, GC.Data);
      assert.equal(Namespace.Pivot, GC.Pivot);
      assert.equal(cjs.default, undefined);
      for (const api of [GC, Namespace, cjs]) {
        const workbook = new api.Spread.Sheets.Workbook();
        workbook.getActiveSheet().setValue(0, 0, 7);
        assert.equal(workbook.getSheet(0).getValue(0, 0), 7);
        workbook.destroy();
      }
    `);
    expect(() => execFileSync(process.execPath, [path.join(consumer, 'consumer.mjs')], { stdio: 'pipe' })).not.toThrow();
  } finally { fs.rmSync(consumer, { recursive: true, force: true }); }
});
it('sets window.GC when our standalone IIFE is executed without a module loader', () => {
  const context = vm.createContext({});
  context.window = context;
  // This is our own bundle. Vendor implementation bundles are never inspected.
  vm.runInContext(fs.readFileSync(path.join(packageRoot, 'dist/gc.spread.sheets.all.min.js'), 'utf8'), context);
  const workbook = new context.window.GC.Spread.Sheets.Workbook();
  workbook.getActiveSheet().setValue(0, 0, 'browser');
  expect(workbook.getSheet(0).getValue(0, 0)).toBe('browser');
  expect(context.window.GC.Spread.Sheets.productInfo.version).toBe('0.1.0');
});
