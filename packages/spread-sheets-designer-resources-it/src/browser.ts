/**
 * Browser (script-tag) entry of the Italian resources package.
 *
 * Loaded through `<script src=".../dist/gc.spread.sheets.designer.resource.it.min.js">` after
 * the designer bundle: it publishes the Italian labels onto the GC namespace (the same slot the
 * official resource packages use, `GC.Spread.Sheets.DesignerResources`) and merges them into the
 * designer through its public `setResources` API. Load it BEFORE creating the Designer so every
 * label measured or cached at startup already uses the Italian strings.
 */
import { italianResources } from './resources.js';

/** The slice of the GC namespace this adapter talks to. */
interface DesignerHost {
  Spread?: {
    Sheets?: {
      Designer?: { setResources?: (resources: Record<string, unknown>) => void };
      DesignerResources?: Record<string, unknown>;
    };
  };
}

// `gc` is a declared global in @types/node, so the namespace object is held under another name.
const gcRoot = (globalThis as { GC?: DesignerHost }).GC;
const sheets = gcRoot?.Spread?.Sheets;
if (sheets) {
  sheets.DesignerResources = italianResources;
  if (sheets.Designer?.setResources) sheets.Designer.setResources(italianResources);
}
