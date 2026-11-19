/**
 * Bundler builds (ESM + CJS + typings) and the GAP-52-3 script-tag builds
 * (`dist/gc.spread.sheets.designer.react.js` + `.min.js`, the official
 * wrapper's file names). Plain objects (no `defineConfig` import): tsup's
 * shipped `index.d.ts` references './types.cts', which would break
 * `tsc -p` since the tsconfig includes `*.ts`.
 */
import path from 'node:path';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const shims = (name: string) => path.join(HERE, 'src', 'umd-shims', name);

const scriptTag = (entryName: string, minify: boolean) => ({
  // Script-tag build: React and the Designer are page globals
  // (`window.React`, `window.GC.Spread.Sheets.Designer`); the bundle installs
  // the components on `GC.Spread.Sheets.Designer.React` (the v19 docs no
  // longer name a global; see docs/STATUS.md GAP-52-3).
  entry: { [entryName]: 'src/index.tsx' },
  format: ['iife'],
  globalName: '__openSheetsDesignerReactUMD',
  target: 'es2022',
  platform: 'browser',
  minify,
  dts: false,
  outExtension: () => ({ js: '.js' }),
  esbuildOptions(options: { jsx?: string; alias?: Record<string, string> }) {
    options.jsx = 'transform';
    options.alias = {
      ...(options.alias ?? {}),
      react: shims('react.cjs'),
      'react/jsx-runtime': shims('react-jsx-runtime.cjs'),
      'react/jsx-dev-runtime': shims('react-jsx-runtime.cjs'),
      '@mescius/spread-sheets-designer': shims('spread-sheets-designer.cjs'),
    };
  },
  footer: {
    js: "if (window.GC && window.GC.Spread && window.GC.Spread.Sheets && window.GC.Spread.Sheets.Designer) { window.GC.Spread.Sheets.Designer.React = __openSheetsDesignerReactUMD; } else { console.warn('OpenSheets Designer React UMD: GC.Spread.Sheets.Designer is missing; load the Designer bundle before this script.'); }",
  },
});

export default [
  {
    entry: { 'gc.spread.sheets.designer.react': 'src/index.tsx' },
    format: ['esm', 'cjs'],
    outExtension: ({ format }: { format: string }) => ({ js: format === 'esm' ? '.esm.js' : '.cjs' }),
    dts: true,
    target: 'es2022',
    external: ['react', 'react-dom', '@mescius/spread-sheets', '@mescius/spread-sheets-designer'],
  },
  scriptTag('gc.spread.sheets.designer.react', false),
  scriptTag('gc.spread.sheets.designer.react.min', true),
];
