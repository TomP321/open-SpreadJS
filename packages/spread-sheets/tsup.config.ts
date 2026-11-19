export default [
  {
    // Standalone paint helpers for our designer galleries (see src/internals.ts).
    entry: { 'gc.spread.sheets.internals': 'src/internals.ts' },
    format: ['esm', 'cjs'],
    outExtension: ({ format }: { format: string }) => ({ js: format === 'cjs' ? '.cjs' : '.js' }),
    clean: false,
    target: 'es2022',
    dts: true,
    platform: 'browser',
  },
  {
    entry: { 'gc.spread.sheets': 'src/index.ts' },
    format: ['esm', 'cjs'],
    outExtension: ({ format }: { format: string }) => ({ js: format === 'esm' ? '.esm.js' : '.cjs' }),
    clean: false,
    target: 'es2022',
  },
  {
    entry: { 'gc.spread.sheets.all': 'src/browser.ts' },
    format: ['iife'],
    outExtension: () => ({ js: '.min.js' }),
    minify: true,
    target: 'es2022',
    // Browser resolution: dependencies must not resolve the `node` export condition, otherwise
    // @noble/hashes pulls in `node:crypto` which cannot be inlined into an IIFE bundle.
    platform: 'browser',
  },
];
