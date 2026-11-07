// Black-box probe for the official io plugin. Public API only.
import * as Official from '@mescius/spread-sheets';
import '@mescius/spread-sheets-io';
import OpenSheets from '@opensheets/spread-sheets';
import '@opensheets/spread-sheets-io';

function normalise(value: unknown, depth = 0): unknown {
  if (value === undefined) return '[undefined]';
  if (value === null || typeof value !== 'object') return typeof value === 'function' ? '[function]' : value;
  if (value instanceof Date) return { date: value.toISOString() };
  if (value instanceof Blob) return { blob: value.size, type: value.type };
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
  const helpers = {
    GC,
    wb,
    sheet: wb.getActiveSheet(),
    async importFile(blob: Blob, options: unknown) {
      return await new Promise(resolve => {
        const timer = setTimeout(() => resolve({ timeout: true }), 10000);
        (wb as unknown as { import(file: Blob, ok: (value: unknown) => void, err: (value: unknown) => void, o: unknown): void })
          .import(blob, (result: unknown) => { clearTimeout(timer); resolve({ ok: true, result: normalise(result) }); },
            (error: unknown) => { clearTimeout(timer); resolve({ ok: false, error: normalise(error) }); }, options);
      });
    },
    async exportFile(options: unknown) {
      return await new Promise(resolve => {
        (wb as unknown as { export(ok: (value: Blob) => void, err: (value: unknown) => void, o: unknown): void })
          .export((result: Blob) => { void result.text().then(text => resolve({ ok: true, kind: 'blob', type: result.type, size: result.size, text })); },
            (error: unknown) => resolve({ ok: false, error: normalise(error) }), options);
      });
    },
  };
  const blobToBase64 = (blob: Blob) => new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
  (helpers as Record<string, unknown>).blobToBase64 = blobToBase64;
  (helpers as Record<string, unknown>).exportBase64 = (options: unknown) => new Promise((resolve, reject) => {
    (wb as unknown as { export(ok: (value: Blob) => void, err: (value: unknown) => void, o: unknown): void }).export(
      (blob: Blob) => { void blobToBase64(blob).then(resolve, reject); },
      (error: unknown) => reject(error), options);
  });
  try {
    return normalise(await new Function('GC', 'wb', 'sheet', 'helpers', `return (${source});`)(GC, wb, wb.getActiveSheet(), helpers));
  } catch (error) {
    return { thrown: String((error as Error)?.message ?? error), name: (error as Error)?.name };
  } finally {
    try { wb.destroy(); } catch { /* ignore */ }
    el.remove();
  }
}

declare global {
  interface Window {
    __ioProbe: { ready: boolean; run(source: string): Promise<{ official: unknown; ours: unknown }> };
  }
}
window.__ioProbe = {
  ready: true,
  async run(source: string) {
    return { official: await execute(Official as unknown as typeof OpenSheets, source), ours: await execute(OpenSheets, source) };
  },
};
