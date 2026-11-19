/**
 * Build-time shim for the script-tag (IIFE/UMD) bundle only: the bundler
 * resolves the `react` specifier here instead of the npm package, and this
 * file hands out the page's `window.React` global that the React UMD build
 * installed. Plain CommonJS on purpose - esbuild inlines it and its interop
 * copies every enumerable property of the global into the namespace the
 * wrapper source sees. Never imported by the TS sources, never typechecked.
 */
var g = typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : {};
if (!g.React) throw new Error('OpenSheets React UMD: the page must load the React UMD build (window.React) before this script.');
module.exports = g.React;
