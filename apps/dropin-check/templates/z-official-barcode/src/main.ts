import * as GC from '@mescius/spread-sheets';
import '@mescius/spread-sheets-barcode';
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
sheet.name('Barcode');
sheet.setColumnWidth(0, 180);
sheet.setColumnWidth(1, 220);
sheet.setValue(0, 0, 'Payload');
sheet.setValue(0, 1, 'BC_QRCODE');
sheet.setValue(1, 0, 'Drop In');
sheet.setFormula(1, 1, '=BC_QRCODE("Drop In")');
sheet.setRowHeight(1, 180);
sheet.resumePaint();

// The trial stores the `BC_*` result as a `SparklineExValue`-shaped record flagged `isBarcode`
// (TASK 46 probe bc46p); report the pieces so the official twin can be compared key by key.
const value = sheet.getValue(1, 1) as { name?: string; typeName?: string; value?: Record<string, unknown> } | null;
window.__RESULT__ = {
  sheetName: sheet.name(),
  formulaText: sheet.getFormula(1, 1),
  displayText: sheet.getText(1, 1),
  barcodeName: value?.name ?? null,
  barcodeTypeName: value?.typeName ?? null,
  recordText: value?.value?.text ?? null,
  recordType: value?.value?.type ?? null,
  recordIsBarcode: value?.value?.isBarcode ?? null,
  findControlIsWorkbook: GC.Spread.Sheets.findControl(host) === workbook,
};
window.__READY__ = true;
