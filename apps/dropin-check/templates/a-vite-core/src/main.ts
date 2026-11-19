import * as GC from '@mescius/spread-sheets';
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
sheet.name('Sales');
sheet.setColumnWidth(0, 150);
sheet.setColumnWidth(1, 110);
sheet.setValue(0, 0, 'Region');
sheet.setValue(0, 1, 'Units');
const boldHeader = new GC.Spread.Sheets.Style();
boldHeader.font = 'bold 12pt Calibri';
sheet.setStyle(0, 0, boldHeader);
sheet.setStyle(0, 1, boldHeader);
sheet.setValue(1, 0, 'North');
sheet.setValue(1, 1, 1200);
sheet.setValue(2, 0, 'South');
sheet.setValue(2, 1, 900);
sheet.setValue(3, 0, 'Total');
sheet.setFormula(3, 1, '=SUM(B2:B3)');
sheet.setFormatter(1, 1, '#,##0');
sheet.setFormatter(3, 1, '#,##0');
sheet.charts.add('UnitsChart', GC.Spread.Sheets.Charts.ChartType.columnClustered, 360, 8, 420, 260, 'A1:B3');
sheet.resumePaint();

const hostView = document.querySelector('.opensheets-host, .gc-spread-sheets-host') as HTMLElement;
window.__RESULT__ = {
  sheetName: sheet.name(),
  formulaValue: sheet.getValue(3, 1),
  formulaText: sheet.getFormula(3, 1),
  chartCount: sheet.charts.all().length,
  chartNames: sheet.charts.all().map((chart: { name(): string }) => chart.name()),
  hostClasses: Array.from(host.classList),
  hostBackColor: getComputedStyle(hostView ?? host).backgroundColor,
  cellBackColor: getComputedStyle(host).backgroundColor,
  findControlIsWorkbook: GC.Spread.Sheets.findControl(host) === workbook,
  enumCenter: GC.Spread.Sheets.HorizontalAlign.center,
};
window.__READY__ = true;
