/**
 * Build-time shim for the script-tag (IIFE/UMD) bundle only: maps
 * `@mescius/spread-sheets-designer` onto the page's
 * `window.GC.Spread.Sheets.Designer` namespace installed by the designer's
 * script-tag bundle. Named imports (`Designer`) resolve to its properties.
 */
var g = typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : {};
var designer = g.GC && g.GC.Spread && g.GC.Spread.Sheets && g.GC.Spread.Sheets.Designer;
if (!designer || typeof designer.Designer !== 'function')
  throw new Error('OpenSheets Designer React UMD: the page must load the SpreadJS Designer bundle (GC.Spread.Sheets.Designer) before this script.');
module.exports = designer;
