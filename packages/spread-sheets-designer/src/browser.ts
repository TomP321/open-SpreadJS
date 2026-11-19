import { installDesigner } from './install.js';
import { sheetsNamespace, designerCore, type GCRoot } from './core-internals.js';
import { englishResources } from './resources.js';

/**
 * The browser bundle entry (`dist/gc.spread.sheets.designer.all.min.js`, the official file name).
 *
 * It installs the Designer onto the core the page uses: `window.GC` when a core was loaded through
 * `<script>` tags, and otherwise the core bundled into this file - which is then published as
 * `window.GC`, so the bundle works standalone the way the official browser bundle does.
 */
const root = globalThis as { GC?: GCRoot };

if (!root.GC?.Spread?.Sheets) {
  const bundled = designerCore();
  if (bundled?.Spread?.Sheets) root.GC = bundled;
}
const gc = designerCore();
if (gc?.Spread?.Sheets) {
  const sheets = sheetsNamespace(gc);
  if (!sheets.DesignerResources) sheets.DesignerResources = englishResources;
  installDesigner(gc);
}
