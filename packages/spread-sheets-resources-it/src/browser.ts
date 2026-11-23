/**
 * Script-tag entry, built as `dist/gc.spread.sheets.resources.it.min.js` (the
 * official resources-package file name). Load recipe: `<script>` the core, then
 * this file — it registers `it-it` (culture + UI strings) on the `window.GC` the
 * core set. CommonJS/AMD consumers of the same file go through the core peer,
 * and bundlers should import the package entry instead.
 */
import { registerItalian, resources } from './register.js';

declare const module: { exports: unknown } | undefined;
declare const require: ((id: string) => unknown) | undefined;
declare const define: (((deps: string[], factory: (core: unknown) => void) => void) & { amd?: unknown }) | undefined;

if (typeof module === 'object' && module && typeof require === 'function') {
  registerItalian(require('@mescius/spread-sheets'));
  module.exports = resources;
}
else if (typeof define === 'function' && define.amd) define(['@mescius/spread-sheets'], core => { registerItalian(core); return resources; });
else {
  const GC = (globalThis as typeof globalThis & { GC?: unknown }).GC;
  if (!GC) throw new Error('Load the spreadsheet core before the it-it resources plugin');
  registerItalian(GC);
}
