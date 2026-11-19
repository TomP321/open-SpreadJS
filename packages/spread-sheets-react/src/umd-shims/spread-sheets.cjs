/**
 * Build-time shim for the script-tag (IIFE/UMD) bundle only: maps
 * `@mescius/spread-sheets` onto the page's `window.GC` global installed by
 * the core's `dist/gc.spread.sheets.all.min.js` script tag. See react.cjs.
 */
var g = typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : {};
if (!g.GC) throw new Error('OpenSheets React UMD: the page must load the SpreadJS core (window.GC) before this script.');
module.exports = g.GC;
