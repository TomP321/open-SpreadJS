import '@mescius/spread-sheets/styles/gc.spread.sheets.css';
import '@mescius/spread-sheets/styles/gc.spread.sheets.excel2013white.css';
import { SpreadSheets, Worksheet, Column } from '@mescius/spread-sheets-react';
import type { IEventTypeObj } from '@mescius/spread-sheets-react';

const rows = [
  { item: 'Widget', qty: 12, price: 9.99 },
  { item: 'Gadget', qty: 7, price: 24.5 },
  { item: 'Doohickey', qty: 31, price: 1.25 },
];

export default function App() {
  // Fully declarative, exactly like the official wrapper docs: the wrapper
  // creates the core Workbook; `workbookInitialized` hands it to the app
  // (cell edits never re-render React — the wrapper hosts the canvas).
  return (
    <div style={{ height: '100vh' }}>
      <SpreadSheets
        hostStyle={{ width: '100%', height: '100%' }}
        allowUndo
        workbookInitialized={(spread) => {
          spread.getActiveSheet().name('Inventory');
        }}
        cellClick={(_t: IEventTypeObj, e: { row: number; col: number }) => {
          console.log(`cell ${e.row},${e.col}`);
        }}
      >
        <Worksheet name="Inventory" dataSource={rows}>
          <Column dataField="item" headerText="Item" width={160} />
          <Column dataField="qty" headerText="Qty" width={90} />
          <Column dataField="price" headerText="Price" width={110} formatter="$#,##0.00" />
        </Worksheet>
      </SpreadSheets>
    </div>
  );
}
