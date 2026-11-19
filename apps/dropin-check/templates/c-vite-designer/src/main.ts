import GC from '@mescius/spread-sheets';
import '@mescius/spread-sheets/styles/gc.spread.sheets.excel2013white.css';
import '@mescius/spread-sheets-designer';
import '@mescius/spread-sheets-designer-resources-en';
import '@mescius/spread-sheets-designer/styles/gc.spread.sheets.designer.min.css';

declare global {
  interface Window {
    __READY__: boolean;
    __RESULT__: Record<string, unknown>;
  }
}

// The official designer typings declare GC.Spread.Sheets.Designer in their own module
// (`dist/gc.spread.sheets.designer.d.ts`, `export = GC`), not on the core's GC import, so a
// TypeScript app declares the shape of the namespace it calls (same approach as apps/designer-compare).
type DesignerInstance = {
  getWorkbook(): GC.Spread.Sheets.Workbook;
  getCommand(name?: string): Record<string, unknown> | unknown;
};
type DesignerApi = {
  Designer: new (host: string | HTMLElement, config?: unknown) => DesignerInstance;
  getResources?: () => { ribbon?: { home?: { bold?: string } } };
};

const designerApi = (GC.Spread.Sheets as unknown as { Designer?: DesignerApi }).Designer;
const host = document.getElementById('designer-host') as HTMLElement;

if (!designerApi) {
  window.__RESULT__ = { designerInstalledOnAppGC: false };
  window.__READY__ = true;
  throw new Error('GC.Spread.Sheets.Designer was not installed on the GC namespace this app imported');
}

const designer = new designerApi.Designer(host);
const workbook = designer.getWorkbook();
const sheet = workbook.getActiveSheet();

sheet.suspendPaint();
sheet.name('Design');
sheet.setColumnWidth(0, 150);
sheet.setColumnWidth(1, 110);
sheet.setValue(0, 0, 'Region');
sheet.setValue(0, 1, 'Units');
sheet.setValue(1, 0, 'North');
sheet.setValue(1, 1, 1200);
sheet.setValue(2, 0, 'South');
sheet.setValue(2, 1, 900);
sheet.setValue(3, 0, 'Total');
sheet.setFormula(3, 1, '=SUM(B2:B3)');
const chartType = (GC.Spread.Sheets as unknown as { Charts?: { ChartType: Record<string, number> } }).Charts?.ChartType;
if (chartType) sheet.charts.add('UnitsChart', chartType.columnClustered, 420, 60, 420, 260, 'A1:B3');
sheet.resumePaint();

const commands = designer.getCommand();
window.__RESULT__ = {
  designerInstalledOnAppGC: true,
  commandCount: commands && typeof commands === 'object' ? Object.keys(commands).length : 0,
  // Single-instance proof: the workbook the designer hosts must be a Workbook of the core the app imported.
  hostedWorkbookIsCoreWorkbook: workbook instanceof GC.Spread.Sheets.Workbook,
  sheetName: sheet.name(),
  formulaValue: sheet.getValue(3, 1),
  chartCount: sheet.charts.all().length,
  resourceBoldLabel: designerApi.getResources?.()?.ribbon?.home?.bold ?? null,
};
window.__READY__ = true;
