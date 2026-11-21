// Plain (non-React) SpreadJS application — unchanged official import names.
import GC from '@mescius/spread-sheets';
import '@mescius/spread-sheets/styles/gc.spread.sheets.css';
import '@mescius/spread-sheets/styles/gc.spread.sheets.excel2013white.css';

// A license key call is accepted and ignored by OpenSheets (docs/MIGRATION.md § 3).
GC.Spread.Sheets.LicenseKey = 'your-key-here';

const workbook = new GC.Spread.Sheets.Workbook(document.getElementById('sheet') as HTMLDivElement);
const sheet = workbook.getActiveSheet();
sheet.name('Sales');

// Column widths, header row, data.
sheet.setRowCount(12);
sheet.setColumnWidth(0, 140);
sheet.setColumnWidth(1, 100);
sheet.setColumnWidth(2, 120);
sheet.setValue(0, 0, 'Item');
sheet.setValue(0, 1, 'Qty');
sheet.setValue(0, 2, 'Price');
const items: Array<[string, number, number]> = [
  ['Widget', 12, 9.99],
  ['Gadget', 7, 24.5],
  ['Doohickey', 31, 1.25],
  ['Thingamajig', 4, 99.0],
];
items.forEach(([name, qty, price], i) => {
  sheet.setValue(i + 1, 0, name);
  sheet.setValue(i + 1, 1, qty);
  sheet.setValue(i + 1, 2, price);
});

// Formulas + formats + styles through the GC.Spread.Sheets namespace — same API.
const style = new GC.Spread.Sheets.Style();
style.font = 'bold 12px sans-serif';
sheet.setStyle(0, -1, style, GC.Spread.Sheets.SheetArea.rowHeader);
sheet.setStyle(0, 0, style, GC.Spread.Sheets.SheetArea.colHeader);
sheet.setStyle(5, 2, style);
sheet.setValue(5, 1, '=SUM(B2:B5)');
sheet.setFormula(5, 2, '=SUMPRODUCT(B2:B5,C2:C5)');
sheet.setFormatter(5, 2, '$#,##0.00');

// Events, selection, undo all behave like the official package.
workbook.bind(GC.Spread.Sheets.Events.SelectionChanged, (_s: unknown, e: GC.Spread.Sheets.ISelectionChangedEventArgs) => {
  if (e.newSelections.length) {
    const sel = e.newSelections[0]!;
    console.log(`selection row=${sel.row} col=${sel.col}`);
  }
});
sheet.setSelection(1, 0, 1, 3);
