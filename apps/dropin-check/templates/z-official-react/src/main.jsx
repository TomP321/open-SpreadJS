// Black-box reference: the same React app written against the official wrapper package.
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { Column, SpreadSheets, Worksheet } from '@mescius/spread-sheets-react';
import GCModule from '@mescius/spread-sheets';
import '@mescius/spread-sheets-charts';
import '@mescius/spread-sheets/styles/gc.spread.sheets.excel2013white.css';

const GC = GCModule?.Spread ? GCModule : GCModule.default;

function paint(workbook) {
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
  const layout = {
    hostRect: (() => { const host = workbook.getContainer ? workbook.getContainer() : null; const r = host ? host.getBoundingClientRect() : null; return r ? `${Math.round(r.width)}x${Math.round(r.height)}` : 'n/a'; })(),
    canvases: Array.from(document.querySelectorAll('canvas')).map((c) => `${c.width}x${c.height}`),
    bodyHeight: document.body.scrollHeight,
  };
  window.__RESULT__ = {
    layout,
    sheetName: sheet.name(),
    columnWidth: sheet.getColumnWidth(0),
    formulaValue: sheet.getValue(3, 1),
    chartCount: sheet.charts.all().length,
    workbookInitialized: true,
  };
  window.__READY__ = true;
}

function App() {
  return (
    <SpreadSheets workbookInitialized={(workbook) => requestAnimationFrame(() => requestAnimationFrame(() => paint(workbook)))}>
      <Worksheet name="Reactive">
        <Column width={150} />
        <Column width={110} />
      </Worksheet>
    </SpreadSheets>
  );
}

createRoot(document.getElementById('root')).render(<App />);
