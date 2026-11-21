/**
 * Script-tag entry, built as `dist/gc.spread.sheets.barcode.min.js` (the official file name).
 * Mirrors the trial's load recipe: `<script>` the core, then this file; the add-in registers
 * `BC_*` on the `window.GC` it finds. CommonJS/AMD consumers of this same file are handled
 * like the IO add-on does it, and bundlers should import the package entry instead.
 */
import { install } from './install.js';

declare const module: { exports: unknown } | undefined;
declare const require: ((id: string) => unknown) | undefined;
declare const define: (((deps: string[], factory: (core: unknown) => void) => void) & { amd?: unknown }) | undefined;

if (typeof module === 'object' && module && typeof require === 'function') {
  install(require('@mescius/spread-sheets'));
  module.exports = {};
}
else if (typeof define === 'function' && define.amd) define(['@mescius/spread-sheets'], install);
else {
  const GC = (globalThis as typeof globalThis & { GC?: unknown }).GC;
  if (!GC) throw new Error('Load the spreadsheet core before the barcode plugin');
  install(GC);
}
