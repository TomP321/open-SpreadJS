import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  // This app hosts both implementations. Resolve the alias peer in our plugin
  // to our core; normal consumers have only their one aliased core installed.
  plugins: [{ name: 'opensheets-io-peer', enforce: 'pre', resolveId(id, importer) {
    if (id === '@mescius/spread-sheets' && importer?.includes('/packages/spread-sheets-io/dist/'))
      return fileURLToPath(new URL('../../packages/spread-sheets/dist/gc.spread.sheets.esm.js', import.meta.url));
  } }],
  optimizeDeps: { exclude: ['@opensheets/spread-sheets', '@opensheets/spread-sheets-io'] },
  build: { target: 'es2022' }, server: { strictPort: true },
});
