/**
 * Browser (script-tag) entry of the English resources package.
 *
 * Our designer browser bundle (`dist/gc.spread.sheets.designer.all.min.js`) already carries the
 * English labels; this file exists so an application that copied the official <script> list
 * (`.../dist/gc.spread.sheets.designer.resource.en.min.js`) resolves the same URL: it registers
 * the resources that are loaded in the page through the designer's public resource API.
 */

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
const resources = sheets?.DesignerResources;
if (resources && sheets?.Designer?.setResources) sheets.Designer.setResources(resources);
