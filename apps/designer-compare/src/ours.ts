/* eslint-disable @typescript-eslint/no-explicit-any */

export async function bootOurs(host: HTMLElement): Promise<any> {
  // TASK 86: ?theme=dark loads our dark designer stylesheet and activates the dark block
  // (harness switch only). No JS theme is applied so the stylesheet drives the colors.
  const dark = new URLSearchParams(location.search).get('theme') === 'dark';
  await import('@opensheets/spread-sheets/styles/gc.spread.sheets.css');
  await import('@opensheets/spread-sheets/styles/gc.spread.sheets.excel2013white.css');
  await import(dark
    ? '@opensheets/spread-sheets-designer/styles/gc.spread.sheets.designer.dark.min.css'
    : '@opensheets/spread-sheets-designer/styles/gc.spread.sheets.designer.light.min.css');
  const core: any = await import('@opensheets/spread-sheets');
  const GC = core.default ?? core;
  (globalThis as any).GC = GC;
  const designerModule: any = await import('@opensheets/spread-sheets-designer');
  // TASK 87: `?lang=it` loads the Italian resource package before the Designer is
  // created (the official order: load the resource package, then construct), so
  // every label cached or measured at startup already uses the Italian strings.
  const lang = new URLSearchParams(location.search).get('lang');
  await import(lang === 'it' ? '@opensheets/spread-sheets-designer-resources-it' : '@opensheets/spread-sheets-designer-resources-en');
  // TASK 89: `?lang=it` also activates the Italian calc language package (and culture) on
  // the core before the Designer creates its workbook, so formulas accept/display
  // `=SOMMA(A1;A2)` — the same activation `@opensheets/spread-sheets-resources-it` performs.
  if (lang === 'it') {
    GC.Spread.Common.CultureManager.culture('it-it');
    GC.Spread.CalcEngine.LanguagePackages.languagePackages('it');
  }
  designerModule.installDesigner(GC);
  const D = GC.Spread.Sheets.Designer;
  const designer = new D.Designer(host);
  if (dark) host.dataset.theme = 'dark';
  return { GC, designer, side: 'ours' };
}
