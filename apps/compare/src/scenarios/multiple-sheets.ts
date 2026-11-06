import type { Scenario } from './index.js';
export const multipleSheets: Scenario = {
  name: 'multiple-sheets', title: 'Multiple worksheets', sheetCount: 2,
  run(workbook) {
    workbook.getSheet(0).name('Overview');
    workbook.getSheet(0).setValue(0, 0, 'First sheet');
    workbook.getSheet(1).name('Details');
    workbook.getSheet(1).setValue(0, 0, 'Second sheet');
  },
};
