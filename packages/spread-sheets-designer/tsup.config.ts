export default [
  {
    entry: { 'gc.spread.sheets.designer': 'src/index.ts' },
    format: ['esm', 'cjs'],
    outExtension: ({ format }: { format: string }) => ({ js: format === 'esm' ? '.esm.js' : '.cjs' }),
    clean: false,
    target: 'es2022',
    dts: true,
    // The core stays external, referenced through the name a drop-in application installs
    // (peerDependency `@mescius/spread-sheets`), so an aliased install ends up with ONE core
    // instance shared by the app, the designer and the core's own peer packages (GAP-52-1).
    external: ['@mescius/spread-sheets'],
    noExternal: ['react', 'react-dom', 'scheduler'],
  },
  {
    entry: { 'gc.spread.sheets.designer.all': 'src/browser.ts' },
    format: ['iife'],
    outExtension: () => ({ js: '.min.js' }),
    minify: true,
    target: 'es2022',
    // Browser resolution (the same reason the core's own browser bundle states it): with the `node`
    // export condition the bundled core resolves its CJS output, whose `@noble/hashes` dependency
    // reaches for `require("crypto")` - an IIFE cannot do that, and the page dies with
    // `Dynamic require of "crypto" is not supported` (measured in .probe/t52/dropin-run.log).
    platform: 'browser',
    // The published browser bundle (official file name `dist/gc.spread.sheets.designer.all.min.js`)
    // is self-contained for `<script>`-tag use: the core it imports is bundled into it.
    noExternal: ['react', 'react-dom', 'scheduler', '@mescius/spread-sheets'],
    globalName: 'GCDesigner',
  },
];
