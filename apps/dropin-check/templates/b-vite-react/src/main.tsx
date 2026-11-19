import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { Column, SpreadSheets, Worksheet } from '@mescius/spread-sheets-react';
import GC from '@mescius/spread-sheets';
import '@mescius/spread-sheets/styles/gc.spread.sheets.excel2013white.css';

declare global {
  interface Window {
    __READY__: boolean;
    __RESULT__: Record<string, unknown>;
  }
}

function paint(workbook: GC.Spread.Sheets.Workbook): void {
  const sheet = workbook.getActiveSheet();
  sheet.suspendPaint();
  sheet.name('Reactive');
  sheet.setColumnWidth(0, 150);
  sheet.setColumnWidth(1, 110);
  sheet.setValue(0, 0, 'Region');
  sheet.setValue(0, 1, 'Units');
  sheet.setValue(1, 0, 'East');
  sheet.setValue(1, 1, 700);
  sheet.setValue(2, 0, 'West');
  sheet.setValue(2, 1, 430);
  sheet.setValue(3, 0, 'Total');
  sheet.setFormula(3, 1, '=B2+B3');
  sheet.charts.add('UnitsChart', GC.Spread.Sheets.Charts.ChartType.columnClustered, 360, 8, 420, 260, 'A1:B3');
  sheet.resumePaint();

  const hostElement = document.querySelector('.opensheets-host') as HTMLElement | null;
  const hostRect = hostElement?.getBoundingClientRect();
  window.__RESULT__ = {
    layout: {
      hostRect: hostRect ? `${Math.round(hostRect.width)}x${Math.round(hostRect.height)}` : 'n/a',
      canvases: Array.from(document.querySelectorAll('canvas')).map((canvas) => `${canvas.width}x${canvas.height}`),
      bodyHeight: document.body.scrollHeight,
    },
    sheetName: sheet.name(),
    columnWidth: sheet.getColumnWidth(0),
    formulaValue: sheet.getValue(3, 1),
    chartCount: sheet.charts.all().length,
    workbookInitialized: true,
  };
  window.__READY__ = true;
}

function App(): React.ReactElement {
  return (
    <SpreadSheets
      workbookInitialized={(workbook) => {
        requestAnimationFrame(() => requestAnimationFrame(() => paint(workbook)));
      }}
    >
      <Worksheet name="Reactive">
        <Column width={150} />
        <Column width={110} />
      </Worksheet>
    </SpreadSheets>
  );
}

createRoot(document.getElementById('root') as HTMLElement).render(<App />);
