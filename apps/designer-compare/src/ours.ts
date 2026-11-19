/* eslint-disable @typescript-eslint/no-explicit-any */
import '@opensheets/spread-sheets/styles/gc.spread.sheets.css';
import '@opensheets/spread-sheets/styles/gc.spread.sheets.excel2013white.css';
import '@opensheets/spread-sheets-designer/styles/gc.spread.sheets.designer.light.min.css';

export async function bootOurs(host: HTMLElement): Promise<any> {
  const core: any = await import('@opensheets/spread-sheets');
  const GC = core.default ?? core;
  (globalThis as any).GC = GC;
  const designerModule: any = await import('@opensheets/spread-sheets-designer');
  await import('@opensheets/spread-sheets-designer-resources-en');
  designerModule.installDesigner(GC);
  const D = GC.Spread.Sheets.Designer;
  const designer = new D.Designer(host);
  return { GC, designer, side: 'ours' };
}
