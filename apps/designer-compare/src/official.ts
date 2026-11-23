/* eslint-disable @typescript-eslint/no-explicit-any */

export async function bootOfficial(host: HTMLElement): Promise<any> {
  // TASK 86: ?theme=dark swaps the official designer stylesheet for the official dark one
  // (harness switch only; the product itself is untouched).
  const dark = new URLSearchParams(location.search).get('theme') === 'dark';
  await import('@mescius/spread-sheets/styles/gc.spread.sheets.excel2013white.css');
  await import(dark
    ? '@mescius/spread-sheets-designer/styles/gc.spread.sheets.designer.dark.min.css'
    : '@mescius/spread-sheets-designer/styles/gc.spread.sheets.designer.light.min.css');
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
  // TASK 89 black-box reference: with `?lang=it` the official calc-engine language
  // packages add-in is loaded and 'it' activated BEFORE the Designer (and its
  // workbook) is created, as the official recipe requires.
  const langIt = new URLSearchParams(location.search).get('lang') === 'it';
  if (langIt) {
    await import('@mescius/spread-sheets-languagepackages');
    GC.Spread.CalcEngine.LanguagePackages.languagePackages('it');
  }
  const D = GC?.Spread?.Sheets?.Designer;
  if (!D?.Designer) {
    throw new Error('official designer global not found; keys=' + Object.keys(GC?.Spread?.Sheets ?? {}).join(',') + ' window=' + !!(window as any).GC);
  }
  const designer = new D.Designer(host);
  return { GC, designer, side: 'official' };
}
