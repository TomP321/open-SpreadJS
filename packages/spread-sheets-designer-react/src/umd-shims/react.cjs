/**
 * Build-time shim for the script-tag (IIFE/UMD) bundle only: maps `react`
 * onto the page's `window.React` global. See the react wrapper's umd-shims.
 */
var g = typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : {};
if (!g.React) throw new Error('OpenSheets Designer React UMD: the page must load the React UMD build (window.React) before this script.');
module.exports = g.React;
