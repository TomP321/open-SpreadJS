import { englishResources, setResources } from '@mescius/spread-sheets-designer';

export const resources = englishResources;
export default resources;

setResources(resources as Record<string, unknown>);
/** Minimal view of the global GC namespace this package registers its labels onto. */
interface GCWithSheets { Spread?: { Sheets?: { DesignerResources?: unknown; Designer?: { setResources?(value: unknown): void } } } }
const GC = globalThis as GCWithSheets;
if (GC?.Spread?.Sheets) {
  GC.Spread.Sheets.DesignerResources = resources;
  if (GC.Spread.Sheets.Designer?.setResources) GC.Spread.Sheets.Designer.setResources(resources);
}
