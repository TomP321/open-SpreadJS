import GC from '@mescius/spread-sheets';
import '@mescius/spread-sheets/styles/gc.spread.sheets.css';
import '@mescius/spread-sheets/styles/gc.spread.sheets.excel2013white.css';
import { Designer, findControl } from '@mescius/spread-sheets-designer';
import '@mescius/spread-sheets-designer-resources-en'; // English UI strings (side effect)
import '@mescius/spread-sheets-designer/styles/gc.spread.sheets.designer.min.css';

// Bind the Designer to an existing Workbook — the official pattern (`new
// Designer(host, config, spread)`): the third argument is a Workbook INSTANCE
// created through the same GC namespace (the designer moves its host into the
// sheet area), not an SSJSON object. The workbook keeps its own lifecycle, so
// do not destroy() it here; the Designer owns the UI only.
const sheetHost = document.createElement('div');
sheetHost.style.cssText = 'width:100%;height:100%';
const workbook = new GC.Spread.Sheets.Workbook(sheetHost);
const sheet = workbook.getActiveSheet();
sheet.name('Forecast');
sheet.setValue(0, 0, 'Quarter');
sheet.setValue(0, 1, 'Revenue');
const data: Array<[string, number]> = [['Q1', 12400], ['Q2', 15900], ['Q3', 14350], ['Q4', 18100]];
data.forEach(([q, r], i) => {
  sheet.setValue(i + 1, 0, q);
  sheet.setValue(i + 1, 1, r);
});
sheet.setValue(5, 0, 'Total');
sheet.setFormula(5, 1, '=SUM(B2:B5)');
sheet.setColumnWidth(0, 120);

const host = document.getElementById('designer-host') as HTMLDivElement;
const designer = new Designer(host, undefined, workbook);

// Public designer API for app integration:
console.log('workbook sheets:', designer.getWorkbook().getSheetCount());
designer.activeRibbonTab('Home');
console.log('same instance:', findControl(host) === designer); // GC.Spread.Sheets.Designer.findControl
window.addEventListener('beforeunload', () => designer.destroy());
