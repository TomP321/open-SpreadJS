import type * as Reference from '@mescius/spread-sheets';

/** Public API calls only; shared by fixture capture and independent model comparisons. */
export function configureM1(GC: typeof Reference, workbook: Reference.Spread.Sheets.Workbook): void {
  const { Style, LineBorder, LineStyle, SheetArea } = GC.Spread.Sheets;
  const sheet = workbook.getSheet(0);
  workbook.options.customList = [['small', 'medium', 'large']];
  sheet.name('Model');
  sheet.setRowCount(42);
  sheet.setColumnCount(17);
  sheet.setRowCount(2, SheetArea.colHeader);
  sheet.setColumnCount(2, SheetArea.rowHeader);
  sheet.setArray(0, 0, [
    ['Item', 'Count', 'Amount'],
    ['Notebook', 12, 4.5],
    ['Pencil', 0, false],
  ]);
  sheet.setValue(1, 1, 'Header', SheetArea.colHeader);
  sheet.setValue(1, 1, 'Row label', SheetArea.rowHeader);
  sheet.setValue(5, 3, new Date(2024, 1, 29, 12, 30));
  sheet.setTag(1, 0, { id: 9 });
  sheet.tag('model-tag');
  const base = new Style();
  base.name = 'Base';
  base.foreColor = '#123456';
  base.font = 'bold 12px Arial';
  workbook.addNamedStyle(base);
  const named = new Style();
  named.name = 'Amount';
  named.parentName = 'Base';
  named.formatter = '#,##0.00';
  sheet.addNamedStyle(named);
  sheet.setStyleName(1, 2, 'Amount');
  const row = new Style();
  row.backColor = '#eeeeee';
  sheet.setStyle(1, -1, row);
  const column = new Style();
  column.wordWrap = true;
  sheet.setStyle(-1, 2, column);
  const cell = new Style();
  cell.backColor = '#fedcba';
  cell.hAlign = 1;
  cell.borderBottom = new LineBorder('blue', LineStyle.thin);
  sheet.setStyle(3, 3, cell);
  sheet.getRange(7, 1, 2, 2).foreColor('red').locked(false).formatter('0.0%');
  sheet.setRowHeight(1, 28);
  sheet.setColumnWidth(2, 94);
  sheet.setRowVisible(4, false);
  sheet.setColumnVisible(5, false);
  sheet.setRowHeight(0, 32, SheetArea.colHeader);
  sheet.setColumnWidth(0, 48, SheetArea.rowHeader);
  sheet.addSpan(10, 1, 2, 3);
  sheet.addSpan(0, 0, 1, 2, SheetArea.colHeader);
  sheet.frozenRowCount(1);
  sheet.frozenColumnCount(2);
  sheet.frozenTrailingRowCount(1);
  sheet.frozenTrailingColumnCount(1);
  sheet.showRowOutline(false);
  sheet.showColumnOutline(false);
  sheet.zoom(1.25);
  sheet.options.sheetTabColor = '#ff0000';
  sheet.options.gridline.showHorizontalGridline = false;
  sheet.setSelection(1, 1, 2, 3);
  sheet.setActiveCell(1, 1);
  workbook.addCustomName('Tax', '0.2', 0, 0, 'Tax rate');
  sheet.addCustomName('Local', '42', 0, 0);
  workbook.addSheet(1, new GC.Spread.Sheets.Worksheet('Other'));
  workbook.setActiveSheetIndex(1);
  workbook.startSheetIndex(1);
}
