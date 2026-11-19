// Black-box probe: run the same snippet against the official trial and our build.
// Only public API calls are made; results are JSON-normalised for comparison.
// Default (mutable) import like the pivot-comparison app: official UMD add-ons attach to window.GC.
import Official from '@mescius/spread-sheets';
import shapesUrl from '../../../node_modules/.pnpm/@mescius+spread-sheets-shapes@19.2.5/node_modules/@mescius/spread-sheets-shapes/dist/gc.spread.sheets.shapes.min.js?url';
import slicersUrl from '../../../node_modules/.pnpm/@mescius+spread-sheets-slicers@19.2.5/node_modules/@mescius/spread-sheets-slicers/dist/gc.spread.sheets.slicers.min.js?url';
import pivotUrl from '@mescius/spread-sheets-pivot-addon/dist/gc.spread.pivot.pivottables.min.js?url';
import printUrl from '@mescius/spread-sheets-print/dist/gc.spread.sheets.print.min.js?url';
import barcodeUrl from '../../../node_modules/.pnpm/@mescius+spread-sheets-barcode@19.2.5/node_modules/@mescius/spread-sheets-barcode/dist/gc.spread.sheets.barcode.min.js?url';
import OpenSheets from '@opensheets/spread-sheets';
// No IO plugin here: /probe.html must show the core WITHOUT the plugin (the m7-core
// drop-in spec probes for absent wb.import/export/open/save); IO scenarios live in
// /io-probe.html and /m7-io.html, which import the plugin themselves.
import '@mescius/spread-sheets/styles/gc.spread.sheets.excel2013white.css';
import '@opensheets/spread-sheets/styles/gc.spread.sheets.css';
import './style.css';

// URLs only (?url imports never execute); probe segments load them on the official side only.
window.__addonUrls = {
  pivot: pivotUrl,
  print: printUrl,
  shapes: shapesUrl,
  slicers: slicersUrl,
  barcode: barcodeUrl,
};

function normalise(value: unknown, depth = 0): unknown {
  if (value === undefined) return null;
  if (value === null || typeof value !== 'object') return typeof value === 'function' ? '[function]' : value;
  if (value instanceof Date) return { date: value.toISOString() };
  if (depth > 8) return '[depth]';
  if (Array.isArray(value)) return value.map(item => normalise(item, depth + 1));
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value as object).sort()) {
    if (key.startsWith('_')) continue;
    const item = (value as Record<string, unknown>)[key];
    if (typeof item === 'function') continue;
    out[key] = normalise(item, depth + 1);
  }
  return out;
}

async function execute(GC: typeof OpenSheets, source: string): Promise<unknown> {
  const host = document.getElementById('hosts')!;
  const el = document.createElement('div');
  el.style.cssText = 'width:400px;height:300px';
  host.append(el);
  const wb = new GC.Spread.Sheets.Workbook(el);
  window.__probeRun = (window.__probeRun || 0) + 1; // 0=official, 1=ours for each segment pair
  try {
    return normalise(await new Function('GC', 'wb', 'sheet', 'run', `return (${source});`)(GC, wb, wb.getActiveSheet(), window.__probeRun - 1));
  } catch (error) {
    return { thrown: String((error as Error)?.message ?? error) };
  } finally {
    try { wb.destroy(); } catch { /* ignore */ }
    el.remove();
  }
}

declare global {
  interface Window {
    __probe: { ready: boolean; run(source: string): Promise<{ official: unknown; ours: unknown }> };
  }
}
window.__probe = {
  ready: true,
  async run(source: string) {
    return { official: await execute(Official as unknown as typeof OpenSheets, source), ours: await execute(OpenSheets, source) };
  },
};
