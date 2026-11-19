'use strict';
/** Drop-in check of the CommonJS artifact: `require('@mescius/spread-sheets')` yields the GC namespace. */
const GC = require('@mescius/spread-sheets');

function build(workbook) {
  const sheet = workbook.getActiveSheet();
  if (typeof document !== 'undefined') {
    require('@mescius/spread-sheets/styles/gc.spread.sheets.excel2013white.css');
    sheet.suspendPaint();
  }
  sheet.name('CJS');
  sheet.setColumnWidth(0, 150);
  sheet.setValue(0, 0, 'Region');
  sheet.setValue(0, 1, 'Units');
  sheet.setValue(1, 0, 'North');
  sheet.setValue(1, 1, 1200);
  sheet.setValue(2, 0, 'South');
  sheet.setValue(2, 1, 900);
  sheet.setValue(3, 0, 'Total');
  sheet.setFormula(3, 1, '=SUM(B2:B3)');
  try {
    sheet.charts.add('UnitsChart', GC.Spread.Sheets.Charts.ChartType.columnClustered, 360, 8, 420, 260, 'A1:B3');
  } catch (error) {
    sheet._dropinChartError = String(error && error.message);
  }
  if (typeof document !== 'undefined') sheet.resumePaint();
  return sheet;
}

/** The JSON workbook keeps `sheets` as a keyed object; accept either shape. */
function jsonSheetNames(json) {
  const sheets = json.sheets;
  const entries = Array.isArray(sheets) ? sheets : Object.values(sheets ?? {});
  return entries.map((entry) => (entry && entry.name ? entry.name : '(unnamed)'));
}

function summary(workbook, sheet, runtime) {
  const json = workbook.toJSON();
  const restored = new GC.Spread.Sheets.Workbook();
  restored.fromJSON(json);
  return {
    runtime,
    gcWorkbookType: typeof GC.Spread.Sheets.Workbook,
    sheetName: sheet.name(),
    formulaValue: sheet.getValue(3, 1),
    formulaText: sheet.getFormula(3, 1),
    chartCount: sheet.charts.all().length,
    chartError: sheet._dropinChartError ?? null,
    jsonSheetNames: jsonSheetNames(json),
    restoredFormulaValue: restored.getActiveSheet().getValue(3, 1),
    findControlIsWorkbook: typeof document === 'undefined' ? null : GC.Spread.Sheets.findControl(document.getElementById('sheet')) === workbook,
  };
}

if (typeof window === 'undefined') {
  const workbook = new GC.Spread.Sheets.Workbook();
  const sheet = build(workbook);
  process.stdout.write(JSON.stringify(summary(workbook, sheet, 'node-commonjs')));
} else {
  const workbook = new GC.Spread.Sheets.Workbook(document.getElementById('sheet'));
  const sheet = build(workbook);
  const result = summary(workbook, sheet, 'browser-commonjs-bundled');
  window.__RESULT__ = result;
  window.__READY__ = true;
}
