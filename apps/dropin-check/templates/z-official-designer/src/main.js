// Black-box reference app: the same Designer scenario written against the official package
// names, built and run exactly like the OpenSheets sample (import order mirrors the working
// official boot sequence: core, the add-ons the official Designer needs, resources, designer).
import GCModule from '@mescius/spread-sheets';

const GC = GCModule?.Spread ? GCModule : GCModule.default;

async function boot() {
  await import('@mescius/spread-sheets/styles/gc.spread.sheets.excel2013white.css');
  await import('@mescius/spread-sheets-designer/styles/gc.spread.sheets.designer.min.css');
  await import('@mescius/spread-sheets-barcode');
  await import('@mescius/spread-sheets-shapes');
  await import('@mescius/spread-sheets-charts');
  await import('@mescius/spread-sheets-print');
  await import('@mescius/spread-sheets-pdf');
  await import('@mescius/spread-sheets-io');
  await import('@mescius/spread-sheets-pivot-addon');
  await import('@mescius/spread-sheets-designer-resources-en');
  await import('@mescius/spread-sheets-designer');

  const host = document.getElementById('designer-host');
  const designer = new GC.Spread.Sheets.Designer.Designer(host);
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
  sheet.charts.add('UnitsChart', GC.Spread.Sheets.Charts.ChartType.columnClustered, 420, 60, 420, 260, 'A1:B3');
  sheet.resumePaint();

  const commands = GC.Spread.Sheets.Designer.getCommand();
  const resources = GC.Spread.Sheets.DesignerResources ?? (GC.Spread.Sheets.Designer.getResources ? GC.Spread.Sheets.Designer.getResources() : null);
  window.__RESULT__ = {
    designerInstalledOnAppGC: typeof GC.Spread.Sheets.Designer === 'object' && typeof GC.Spread.Sheets.Designer.Designer === 'function',
    hostedWorkbookIsCoreWorkbook: workbook instanceof GC.Spread.Sheets.Workbook,
    commandCount: commands && typeof commands === 'object' ? Object.keys(commands).length : 0,
    sheetName: sheet.name(),
    formulaValue: sheet.getValue(3, 1),
    chartCount: sheet.charts.all().length,
    resourceBoldLabel: resources?.ribbon?.home?.bold ?? null,
    workbookCtorType: typeof GC.Spread.Sheets.Workbook,
  };
  window.__READY__ = true;
}

boot().catch((error) => {
  window.__RESULT__ = { bootError: String(error && error.message) };
  window.__READY__ = true;
});
