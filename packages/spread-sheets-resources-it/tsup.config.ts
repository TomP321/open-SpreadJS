export default [
  {
    entry: { index: 'src/index.ts' },
    format: ['esm', 'cjs'],
    external: ['@mescius/spread-sheets'],
    target: 'es2022',
    clean: false,
  },
  {
    // Script-tag bundle under the official resources-package file name.
    entry: { 'gc.spread.sheets.resources.it': 'src/browser.ts' },
    format: ['iife'],
    esbuildOptions(options: { external?: string[] }) { options.external = ['@mescius/spread-sheets']; },
    outExtension: () => ({ js: '.min.js' }),
    minify: true,
    target: 'es2022',
    platform: 'browser',
  },
];
