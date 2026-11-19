import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

// This app hosts both implementations. Our linked packages import the peer names
// (@mescius/...) they would be npm-aliased to in a consumer app; Vite's optimizer
// would otherwise short-circuit those bare ids to the OFFICIAL packages installed
// here for the official side. Resolve the alias peers to our own dists when the
// importer is one of our packages (same pattern as apps/compare).
const ours = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));
const PEERS: Record<string, string> = {
  '@mescius/spread-sheets': ours('../../packages/spread-sheets/dist/gc.spread.sheets.esm.js'),
  '@mescius/spread-sheets-designer': ours('../../packages/spread-sheets-designer/dist/gc.spread.sheets.designer.esm.js'),
};

export default defineConfig({
  server: { port: 5175 },
  plugins: [
    {
      name: 'opensheets-designer-peers',
      enforce: 'pre',
      resolveId(id, importer) {
        if (!id.startsWith('@mescius/') || !importer) return null;
        if (!/[\\/]packages[\\/]spread-sheets[^\\/]*[\\/]/.test(importer)) return null;
        return PEERS[id] ?? null;
      },
    },
  ],
  optimizeDeps: {
    include: [
      '@mescius/spread-sheets',
      '@mescius/spread-sheets-barcode',
      '@mescius/spread-sheets-shapes',
      '@mescius/spread-sheets-charts',
      '@mescius/spread-sheets-print',
      '@mescius/spread-sheets-pdf',
      '@mescius/spread-sheets-io',
      '@mescius/spread-sheets-pivot-addon',
      '@mescius/spread-sheets-designer',
      '@mescius/spread-sheets-designer-resources-en',
    ],
  },
});
