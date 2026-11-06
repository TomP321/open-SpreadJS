import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { SpreadSheets, Worksheet } from '@opensheets/spread-sheets-react';
import '@opensheets/spread-sheets/styles/gc.spread.sheets.css';
import './style.css';

function App() {
  const [value, setValue] = React.useState('');
  return <main>
    <p className="eyebrow">OPENSHEETS</p>
    <h1>Spreadsheet playground</h1>
    <p>The M0 workbook model is ready. Canvas rendering arrives in M2.</p>
    <SpreadSheets hostStyle={{ height: 360, border: '1px solid #d8dce3', borderRadius: 8 }} workbookInitialized={workbook => {
      const sheet = workbook.getActiveSheet();
      sheet.setValue(0, 0, 'Hello, OpenSheets');
      setValue(String(sheet.getValue(0, 0)));
    }}><Worksheet name="Demo" /></SpreadSheets>
    <p role="status">Demo!A1: <strong>{value}</strong></p>
  </main>;
}
createRoot(document.getElementById('root')!).render(<App />);
