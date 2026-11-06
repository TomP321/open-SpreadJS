import type { Scenario } from './index.js';
export const values: Scenario = {
  name: 'values', title: 'Basic cell values', sheetCount: 1,
  run(workbook) {
    const sheet = workbook.getActiveSheet();
    sheet.name('Values');
    const rows = [['Item', 'Quantity', 'Price'], ['Notebook', 12, 4.5], ['Pencil', 30, 0.8], ['Eraser', 8, 1.25]];
    rows.forEach((row, r) => row.forEach((value, c) => sheet.setValue(r, c, value)));
  },
};
