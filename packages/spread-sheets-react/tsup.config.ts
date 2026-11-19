/**
 * Bundler builds (ESM + CJS + typings) and the GAP-52-3 script-tag build
 * (`dist/gc.spread.sheets.react.min.js`, the official wrapper's file name).
 * Typed as `unknown[]` on purpose: importing tsup's `defineConfig` would drag
 * `tsup/dist/index.d.ts` into `tsc -p` (it references './types.cts', which the
 * installed tsup build does not ship), and `@ts-nocheck` keeps the config out
 * of the typecheck without losing editor help in editors that resolve tsup.
 */
import path from 'node:path';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const shims = (name: string) => path.join(HERE, 'src', 'umd-shims', name);

export default [
  {
    entry: ['src/index.tsx'],
    format: ['esm', 'cjs'],
    dts: true,
    clean: true,
    external: ['react', 'react-dom', '@mescius/spread-sheets'],
  },
  {
    // Script-tag build: React and the SpreadJS core are page globals
    // (`window.React`, `window.GC`); the bundle installs the components on
    // `GC.Spread.Sheets.React`, the namespace the official script-tag samples
    // use (the v19 docs no longer name a global; see docs/STATUS.md GAP-52-3).
    entry: { 'gc.spread.sheets.react.min': 'src/index.tsx' },
    format: ['iife'],
    globalName: '__openSheetsReactUMD',
    target: 'es2022',
    platform: 'browser',
    minify: true,
    dts: false,
    outExtension: () => ({ js: '.js' }),
    esbuildOptions(options: { jsx?: string; alias?: Record<string, string> }) {
      // Classic JSX transform: React comes from the page global, so the build
      // must not import `react/jsx-runtime`.
      options.jsx = 'transform';
      options.alias = {
        ...(options.alias ?? {}),
        react: shims('react.cjs'),
        'react/jsx-runtime': shims('react-jsx-runtime.cjs'),
        'react/jsx-dev-runtime': shims('react-jsx-runtime.cjs'),
        'react-dom': shims('react-dom.cjs'),
        '@mescius/spread-sheets': shims('spread-sheets.cjs'),
      };
    },
    footer: {
      js: "if (window.GC && window.GC.Spread && window.GC.Spread.Sheets) { window.GC.Spread.Sheets.React = __openSheetsReactUMD; } else { console.warn('OpenSheets React UMD: window.GC is missing; load the SpreadJS core before this script.'); }",
    },
  },
];
