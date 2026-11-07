import type GC from '@opensheets/spread-sheets';
import type { Scenario } from './index.js';
import { libraryFor } from './m4.js';
export const coreModuleScenarios: Scenario[] = [
  { name: 'm5-named-colors', title: 'CSS named colors and theme tokens', sheetCount: 1, run(wb) {
    const s = wb.getActiveSheet() as GC.Spread.Sheets.Worksheet, G = libraryFor(s), CF = G.Spread.Sheets.ConditionalFormatting;
    s.setArray(0, 0, [[0], [25], [50], [75], [100]]);
    s.conditionalFormats.add3ScaleRule(CF.ScaleValueType.lowestValue, 0, 'red', CF.ScaleValueType.number, 50, 'yellow', CF.ScaleValueType.highestValue, 100, 'green', [new G.Spread.Sheets.Range(0, 0, 5, 1)]);
    for (const [i, color] of ['rebeccapurple', '#f84', 'rgba(0,100,200,.6)', 'hsl(120,100%,25%)', 'Accent 1 40'].entries()) { s.setValue(i, 2, color); s.getCell(i, 2).backColor(color); }
    s.setColumnWidth(2, 180);
  } },
  { name: 'm5-sparklines', title: 'Line, column and winloss sparklines', sheetCount: 1, run(wb) {
    const s = wb.getActiveSheet() as GC.Spread.Sheets.Worksheet, G = libraryFor(s), S = G.Spread.Sheets.Sparklines;
    s.setArray(0, 0, [[1], [3], [-2], [5], [2]]);
    for (let r = 0; r < 3; r++) { s.setRowHeight(r, 60); s.setSparkline(r, 2, new G.Spread.Sheets.Range(0, 0, 5, 1), S.DataOrientation.vertical, r, new S.SparklineSetting({ showMarkers: true, showHigh: true, showLow: true, showNegative: true, displayXAxis: true })); }
    s.setColumnWidth(2, 140); s.setColumnWidth(4, 140);
    s.setFormula(0, 4, 'LINESPARKLINE(A1:A5,0)'); s.setFormula(1, 4, 'COLUMNSPARKLINE(A1:A5,0)'); s.setFormula(2, 4, 'WINLOSSSPARKLINE(A1:A5,0)'); s.setFormula(3, 4, 'PIESPARKLINE(A1:A5)'); s.setRowHeight(3, 60);
  } },
  { name: 'm5-floating', title: 'Floating objects and pictures', sheetCount: 1, run(wb) {
    const s = wb.getActiveSheet() as GC.Spread.Sheets.Worksheet, G = libraryFor(s);
    s.setValue(0, 0, 'Floating objects');
    const object = new G.Spread.Sheets.FloatingObjects.FloatingObject('Card', 30, 40, 180, 80);
    if (typeof document !== 'undefined') { const content = document.createElement('div'); content.textContent = 'Floating content'; content.style.cssText = 'box-sizing:border-box;width:100%;height:100%;padding:12px;border:1px solid #4472c4;background:#d9e2f3;font:14px Arial;color:#17365d'; object.content(content); }
    s.floatingObjects.add(object);
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="80"><rect width="100" height="80" fill="#f8cbad"/><circle cx="50" cy="40" r="24" fill="#ed7d31"/></svg>';
    s.pictures.add('Picture', 'data:image/svg+xml,' + encodeURIComponent(svg), 260, 40, 100, 80);
  } },
  { name: 'm5-controls', title: 'Formula bar, name box and status bar', sheetCount: 1, run(wb) {
    const s = wb.getActiveSheet() as GC.Spread.Sheets.Worksheet, G = libraryFor(s);
    s.setArray(0, 0, [[2], [4], [6]]); s.setSelection(0, 0, 3, 1);
    if (typeof document === 'undefined') return;
    const host = (wb as GC.Spread.Sheets.Workbook).getHost();
    host.style.position = 'relative';
    const control = (x: number, y: number, width: number, height: number) => { const el = document.createElement('div'); el.dataset.m5Control = ''; el.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:${width}px;height:${height}px;z-index:20;box-sizing:border-box;border:1px solid #ccc;background:white`; host.append(el); return el; };
    new G.Spread.Sheets.NameBox.NameBox(control(5, 390, 90, 28), wb as GC.Spread.Sheets.Workbook);
    const formula = new G.Spread.Sheets.FormulaTextBox.FormulaTextBox(control(100, 390, 540, 28)); formula.workbook(wb as GC.Spread.Sheets.Workbook);
    const bar = new G.Spread.Sheets.StatusBar.StatusBar(control(5, 435, 635, 30)); bar.bind(wb as GC.Spread.Sheets.Workbook); bar.update();
  } },
  { name: 'm5-binding', title: 'Nested data binding and input mask metadata', sheetCount: 1, run(wb) {
    const s = wb.getActiveSheet() as GC.Spread.Sheets.Worksheet, G = libraryFor(s);
    s.setBindingPath(1, 1, 'person.name'); s.setBindingPath(2, 1, 'person.age'); s.setDataSource(new G.Spread.Sheets.Bindings.CellBindingSource({ person: { name: 'Alice', age: 30 } }));
    s.getCell(4, 1).mask({ pattern: '000-000' }); s.setValue(4, 1, '123-456'); s.setColumnWidth(1, 140);
  } },
];
