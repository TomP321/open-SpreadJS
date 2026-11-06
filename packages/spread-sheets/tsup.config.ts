export default [
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
  },
];
