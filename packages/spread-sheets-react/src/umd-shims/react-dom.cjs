/**
 * Build-time shim for the script-tag (IIFE/UMD) bundle only: maps
 * `react-dom` onto the page's `window.ReactDOM` global (the wrapper source
 * does not import react-dom today; the alias keeps the script-tag contract
 * complete so a future import resolves to the same page global).
 */
var g = typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : {};
if (!g.ReactDOM) throw new Error('OpenSheets React UMD: the page must load the ReactDOM UMD build (window.ReactDOM) before this script.');
module.exports = g.ReactDOM;
