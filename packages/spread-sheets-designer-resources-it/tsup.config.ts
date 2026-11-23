export default [
  {
    entry: { index: 'src/index.ts' },
    format: ['esm', 'cjs'],
    dts: true,
    target: 'es2022',
    clean: false,
  },
  {
    // Script-tag bundle under the Italian file name (see src/browser.ts).
    entry: { 'gc.spread.sheets.designer.resource.it': 'src/browser.ts' },
    format: ['iife'],
    outExtension: () => ({ js: '.min.js' }),
    minify: true,
    target: 'es2022',
    platform: 'browser',
  },
];
