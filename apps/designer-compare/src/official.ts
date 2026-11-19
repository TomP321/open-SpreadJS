/* eslint-disable @typescript-eslint/no-explicit-any */
import '@mescius/spread-sheets/styles/gc.spread.sheets.excel2013white.css';
import '@mescius/spread-sheets-designer/styles/gc.spread.sheets.designer.light.min.css';

export async function bootOfficial(host: HTMLElement): Promise<any> {
  const core: any = await import('@mescius/spread-sheets');
  const GC = (window as any).GC ?? core?.default ?? core;
  (window as any).GC = GC;
  // Explicit black-box reference mode for commands whose backing add-ons are
  // unavailable in OpenSheets. Normal comparisons retain the original imports.
  if (new URLSearchParams(location.search).get('plugins') !== 'none') {
    await import('@mescius/spread-sheets-barcode');
    await import('@mescius/spread-sheets-shapes');
    await import('@mescius/spread-sheets-charts');
    await import('@mescius/spread-sheets-print');
    await import('@mescius/spread-sheets-pdf');
    await import('@mescius/spread-sheets-io');
    await import('@mescius/spread-sheets-pivot-addon');
  }
  await import('@mescius/spread-sheets-designer-resources-en');
  await import('@mescius/spread-sheets-designer');
  const D = GC?.Spread?.Sheets?.Designer;
  if (!D?.Designer) {
    throw new Error('official designer global not found; keys=' + Object.keys(GC?.Spread?.Sheets ?? {}).join(',') + ' window=' + !!(window as any).GC);
  }
  const designer = new D.Designer(host);
  return { GC, designer, side: 'official' };
}
