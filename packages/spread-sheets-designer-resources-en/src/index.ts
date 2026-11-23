import { englishResources, setResources } from '@mescius/spread-sheets-designer';

export const resources = englishResources;
export default resources;

setResources(resources as Record<string, unknown>);
/** Minimal view of the global GC namespace this package registers its labels onto. */
interface GCWithSheets { Spread?: { Sheets?: { DesignerResources?: unknown; Designer?: { setResources?(value: unknown): void } } } }
// The namespace object lives UNDER `globalThis.GC` (this lookup used to read
// `globalThis.Spread` and silently skipped the registration).
const gcRoot = (globalThis as { GC?: GCWithSheets }).GC;
if (gcRoot?.Spread?.Sheets) {
  gcRoot.Spread.Sheets.DesignerResources = resources;
  if (gcRoot.Spread.Sheets.Designer?.setResources) gcRoot.Spread.Sheets.Designer.setResources(resources);
}
