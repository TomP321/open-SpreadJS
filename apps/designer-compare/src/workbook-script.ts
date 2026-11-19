/* eslint-disable @typescript-eslint/no-explicit-any */
export function applyWorkbookContract(spread: any): void {
  const sheet = spread.getSheet(0);
  sheet.name('Data');
  const rows = [
    ['Region', 'Q1', 'Q2', 'Q3', 'Q4', 'Total'],
    ['North', 120, 135, 150, 165, null],
    ['South', 90, 105, 95, 125, null],
    ['East', 75, 80, 90, 100, null],
    ['West', 110, 115, 105, 130, null],
  ];
  sheet.setArray(0, 0, rows);
  for (let r = 1; r < rows.length; r++) sheet.setFormula(r, 5, `=SUM(B${r + 1}:E${r + 1})`);
  sheet.setColumnWidth(0, 110);
  sheet.setColumnWidth(5, 90);
  sheet.getCell(0, 0).font('bold 12px Calibri');
  sheet.getCell(0, 0).backColor('#dce6f1');
  sheet.getRange(0, 0, 1, 6).backColor('#dce6f1');
  sheet.setActiveCell(1, 1);
}
