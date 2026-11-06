// Black-box probe: run the same snippet against the official trial and our build.
// Only public API calls are made; results are JSON-normalised for comparison.
import * as Official from '@mescius/spread-sheets';
import OpenSheets from '@opensheets/spread-sheets';

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

function execute(GC: typeof OpenSheets, source: string): unknown {
  const host = document.getElementById('hosts')!;
  const el = document.createElement('div');
  el.style.cssText = 'width:400px;height:300px';
  host.append(el);
  const wb = new GC.Spread.Sheets.Workbook(el);
  try {
    return normalise(new Function('GC', 'wb', 'sheet', `return (${source});`)(GC, wb, wb.getActiveSheet()));
  } catch (error) {
    return { thrown: String((error as Error)?.message ?? error) };
  } finally {
    try { wb.destroy(); } catch { /* ignore */ }
    el.remove();
  }
}

declare global {
  interface Window {
    __probe: { ready: boolean; run(source: string): { official: unknown; ours: unknown } };
  }
}
window.__probe = {
  ready: true,
  run(source: string) {
    return { official: execute(Official as unknown as typeof OpenSheets, source), ours: execute(OpenSheets, source) };
  },
};
