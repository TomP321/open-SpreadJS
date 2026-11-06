import * as React from 'react';
import { createRoot } from 'react-dom/client';
import GC from '@opensheets/spread-sheets';
import { SpreadSheets, Worksheet } from '@opensheets/spread-sheets-react';
import '@opensheets/spread-sheets/styles/gc.spread.sheets.css';
import './style.css';

function App() {
  return <main>
    <p className="eyebrow">OPENSHEETS</p>
    <h1>Spreadsheet playground</h1>
    <p>Edit cells, select ranges, drag headers to resize, and explore the sheet tabs. Try Ctrl+Z to undo an edit.</p>
    <SpreadSheets hostStyle={{ height: 560, border: '1px solid #d8dce3' }} workbookInitialized={workbook => {
      workbook.suspendPaint();
      try {
        const overview = workbook.getSheet(0), styles = workbook.getSheet(1), large = workbook.getSheet(2);
        overview.setColumnWidth(0, 190); overview.setColumnWidth(1, 160); overview.setColumnWidth(2, 140);
        overview.setArray(0, 0, [['Quarterly revenue', 'Revenue', 'Growth'], ['North', 128450, 0.12], ['South', 98500, 0.08], ['West', 156200, 0.19], ['East', 112750, 0.11]]);
        overview.getRange(0, 0, 1, 3).backColor('#217346').foreColor('white').font('bold 11pt Arial');
        overview.getRange(1, 1, 4, 1).formatter('$#,##0'); overview.getRange(1, 2, 4, 1).formatter('0%');
        overview.getRange(1, 0, 4, 3).font('11pt Arial');
        overview.getRange(2, 0, 1, 3).backColor('#eaf3ed'); overview.getRange(4, 0, 1, 3).backColor('#eaf3ed');
        overview.setValue(7, 0, 'Freeze the heading'); overview.setValue(8, 0, 'Scroll to keep row 1 visible.');
        overview.frozenRowCount(1); overview.frozenColumnCount(1);
        styles.setColumnWidth(1, 240); styles.setValue(1, 1, 'Make this sheet your own');
        styles.getCell(1, 1).font('bold 16pt Arial').foreColor('#217346'); styles.setRowHeight(1, 36);
        styles.setValue(3, 1, 'Wrapped text fits inside a cell. Resize this column to explore how the lines change.');
        styles.getCell(3, 1).font('12pt Arial').wordWrap(true).backColor('#fff2cc'); styles.setRowHeight(3, 76);
        styles.setValue(5, 1, 'A border and a selection'); styles.getCell(5, 1).borderBottom(new GC.Spread.Sheets.LineBorder('#217346', GC.Spread.Sheets.LineStyle.dashDot));
        large.setRowCount(100_000); large.setColumnCount(50); large.setColumnWidth(0, 120); large.setColumnWidth(1, 180);
        large.setArray(0, 0, [['Record', 'Amount', 'Group']]);
        large.getRange(0, 0, 1, 3).backColor('#217346').foreColor('white').font('bold 11pt Arial');
        for (let row = 1; row < 100_000; row++) { large.setValue(row, 0, row); large.setValue(row, 1, row * 1.25); large.setValue(row, 2, row % 50); }
        large.getRange(-1, 1, -1, 1).formatter('#,##0.00'); large.frozenRowCount(1);
      } finally { workbook.resumePaint(); }
    }}><Worksheet name="Overview" /><Worksheet name="Styles" /><Worksheet name="100k rows" /></SpreadSheets>
    <p className="hint">Overview: styled data and frozen headings · Styles: fonts, wrap and borders · 100k rows: virtual scrolling</p>
  </main>;
}
createRoot(document.getElementById('root')!).render(<App />);
