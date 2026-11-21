import * as GC from '@mescius/spread-sheets';
// Every add-in package the application lists in package.json, loaded after the core.
// Official order matters on the trial (shapes before charts); ours load in any order.
import '@mescius/spread-sheets-shapes';
import '@mescius/spread-sheets-charts';
import '@mescius/spread-sheets-print';
import '@mescius/spread-sheets-pdf';
import '@mescius/spread-sheets-pivot-addon';
import '@mescius/spread-sheets-slicers';
import '@mescius/spread-sheets-tablesheet';
import '@mescius/spread-sheets-ganttsheet';
import '@mescius/spread-sheets-reportsheet-addon';
import '@mescius/spread-sheets-languagepackages';
import '@mescius/spread-sheets-barcode';
import '@mescius/spread-sheets-io';
import '@mescius/spread-sheets/styles/gc.spread.sheets.excel2013white.css';

declare global {
  interface Window {
    __READY__: boolean;
    __RESULT__: Record<string, unknown>;
  }
}

const host = document.getElementById('sheet') as HTMLElement;
const workbook = new GC.Spread.Sheets.Workbook(host, { sheetCount: 1 });
const sheet = workbook.getActiveSheet();

sheet.suspendPaint();
sheet.name('Addons');
sheet.setColumnWidth(0, 160);
sheet.setColumnWidth(1, 120);
sheet.setColumnWidth(2, 120);
// The source table (A1:C3) feeds the pivot table and its slicer; a second small block
// (E1:F3) feeds the chart; a `BC_QRCODE` formula cell exercises the barcode add-in.
sheet.setArray(0, 0, [['Region', 'Buyer', 'Amount'], ['East', 'Mom', 1200], ['West', 'Dad', 900]]);
sheet.tables.add('sourceData', 0, 0, 3, 3);
sheet.setValue(0, 4, 'Region');
sheet.setValue(0, 5, 'Units');
sheet.setValue(1, 4, 'East');
sheet.setValue(1, 5, 1200);
sheet.setValue(2, 4, 'West');
sheet.setValue(2, 5, 900);
sheet.setFormula(3, 5, '=SUM(F2:F3)');
sheet.setValue(10, 0, 'BC_QRCODE');
sheet.setFormula(10, 1, '=BC_QRCODE("Drop In")');
sheet.setRowHeight(10, 120);
sheet.setRowPageBreak(8, true);
sheet.resumePaint();

// Pivot table + pivot slicer (pivot-addon + slicers). The value field keeps the default
// (sum) subtotal so the script never touches `GC.Pivot` (the trial only builds that root
// namespace in its script-tag bundles, not through the bundler-resolved module).
const pivot = sheet.pivotTables.add('pivotTable1', 'sourceData' as never, 5, 0, GC.Spread.Pivot.PivotTableLayoutType.compact, 'Medium2');
pivot.add('Region', 'Region', GC.Spread.Pivot.PivotTableFieldType.rowField);
pivot.add('Amount', 'Sum of Amount', GC.Spread.Pivot.PivotTableFieldType.valueField);
const slicer = sheet.slicers.add('slicer1', 'pivotTable1', 'Region', undefined, GC.Spread.Sheets.Slicers.SlicerType.pivotTable) as { columnName?(): string };

// Chart (charts) and one auto shape (shapes). Shapes are counted by name because the trial
// also lists its charts inside `shapes.all()`.
sheet.charts.add('UnitsChart', GC.Spread.Sheets.Charts.ChartType.columnClustered, 430, 140, 300, 180, 'E1:F3');
sheet.shapes.add('Box', GC.Spread.Sheets.Shapes.AutoShapeType.rectangle, 460, 360, 120, 80);

// Print preview. (1) The public printInfo accessor tree must work: set + read back.
// (2) The page model behind the preview (Print.WorksheetPaginator — trial's public runtime
// surface, not declared in the d.ts) is probed only when present: the official trial bundle
// throws inside paginate() under bundler loading (recorded black-box by TASK 76, like
// GAP-52-4; the script-tag bundles paginate fine), and null is reported then.
const pi = sheet.printInfo();
pi.showGridLine(true);
const printShowGridLine = pi.showGridLine();
type PaginatorLike = { paginate(): void; pageCount(): number };
const printApi = GC.Spread.Sheets.Print as unknown as { WorksheetPaginator?: new (target: GC.Spread.Sheets.Worksheet) => PaginatorLike };
const Paginator = printApi.WorksheetPaginator;
let printPageCount: number | null = null;
if (Paginator) {
  try {
    const paginator = new Paginator(sheet);
    paginator.paginate();
    printPageCount = paginator.pageCount();
  } catch {
    printPageCount = null;
  }
}

// Existence of the remaining add-ins' namespaces (tablesheet/gantt/report/language-packages)
// and of the IO methods the io package patches onto Workbook.
const ns = (path: string): boolean => {
  const parts = path.split('.');
  let at: Record<string, unknown> = GC as unknown as Record<string, unknown>;
  for (const part of parts.slice(0, -1)) at = (at?.[part] ?? {}) as Record<string, unknown>;
  return typeof at?.[parts[parts.length - 1]!] === 'function';
};
const barcode = sheet.getValue(10, 1) as { name?: string; value?: { isBarcode?: unknown } } | null;
window.__RESULT__ = {
  sheetName: sheet.name(),
  formulaValue: sheet.getValue(3, 5),
  chartCount: sheet.charts.all().length,
  chartName: sheet.charts.all()[0]?.name?.() ?? null,
  shapeCount: sheet.shapes.all().filter((s: { name(): string }) => s.name() === 'Box').length,
  shapeName: sheet.shapes.all().filter((s: { name(): string }) => s.name() === 'Box')[0]?.name?.() ?? null,
  pivotCount: sheet.pivotTables.all().length,
  slicerCount: sheet.slicers.all().length,
  slicerField: slicer?.columnName?.() ?? null,
  printApi: typeof workbook.print === 'function',
  printShowGridLine,
  printPageCount,
  pdfApi: typeof workbook.savePDF === 'function',
  barcodeName: barcode?.name ?? null,
  recordIsBarcode: barcode?.value?.isBarcode === true,
  ioMethods: [typeof workbook.import, typeof workbook.export, typeof workbook.open, typeof workbook.save],
  tableSheetApi: ns('Spread.Sheets.TableSheet.TableSheet'),
  ganttApi: ns('Spread.Sheets.GanttSheet.GanttSheet'),
  reportApi: ns('Spread.Report.ReportSheet'),
  languagePackagesApi: ns('Spread.CalcEngine.LanguagePackages.languagePackages'),
  findControlIsWorkbook: GC.Spread.Sheets.findControl(host) === workbook,
};
window.__READY__ = true;
