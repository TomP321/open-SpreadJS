export default [
  { entry: { 'gc.spread.sheets.io': 'src/index.ts' }, format: ['esm', 'cjs'], external: ['@mescius/spread-sheets'], outExtension: ({format}: {format:string}) => ({js: format === 'esm' ? '.esm.js' : '.cjs'}), target: 'es2022', clean: true },
  { entry: { 'gc.spread.sheets.io.umd': 'src/browser.ts' }, format: ['iife'], esbuildOptions(options: {external?: string[]}) { options.external = ['@mescius/spread-sheets']; }, outExtension: () => ({js: '.js'}), target: 'es2022', platform: 'browser' },
];
