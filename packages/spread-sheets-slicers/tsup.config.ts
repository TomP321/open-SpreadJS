// Two builds, no `clean`: tsup runs the configs concurrently and `clean: true` here once
// deleted the sibling's just-written `.umd.js` (ENOENT in `scripts/finalize.ts`); the fixed
// output file set is rewritten in place on every build anyway.
export default [
  { entry: { 'gc.spread.sheets.slicers': 'src/index.ts' }, format: ['esm', 'cjs'], external: ['@mescius/spread-sheets'], outExtension: ({ format }: { format: string }) => ({ js: format === 'esm' ? '.esm.js' : '.cjs' }), target: 'es2022' },
  { entry: { 'gc.spread.sheets.slicers.umd': 'src/browser.ts' }, format: ['iife'], esbuildOptions(options: { external?: string[] }) { options.external = ['@mescius/spread-sheets']; }, outExtension: () => ({ js: '.js' }), target: 'es2022', platform: 'browser' },
];
