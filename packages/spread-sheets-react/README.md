# @opensheets/spread-sheets-react

React wrapper components (`<SpreadSheets>`, `<Worksheet>`, `<Column>`) for
`@opensheets/spread-sheets`, with the same props as the SpreadJS React wrapper.

```sh
npm install @opensheets/spread-sheets @opensheets/spread-sheets-react react react-dom
```

```tsx
import { SpreadSheets, Worksheet, Column } from '@opensheets/spread-sheets-react';
import '@opensheets/spread-sheets/styles/gc.spread.sheets.excel2013white.css';

export default () => (
  <SpreadSheets>
    <Worksheet>
      <Column index={0} width={120} />
    </Worksheet>
  </SpreadSheets>
);
```

Drop-in alias: `{ "@mescius/spread-sheets-react": "npm:@opensheets/spread-sheets-react@^0.1.0" }`.
Peer dependencies: `react` and `react-dom` (>= 16.8) and the spreadsheet core.

## Script tags (no bundler)

Like the official wrapper's `dist/gc.spread.sheets.react.min.js`, this package ships a
`<script>`-tag build with the same file name. Load React, ReactDOM and the SpreadJS core as
globals first; the bundle installs the components on `GC.Spread.Sheets.React`:

```html
<link rel="stylesheet" href="/node_modules/@opensheets/spread-sheets/styles/gc.spread.sheets.excel2013white.css" />
<div id="sheet" style="width: 900px; height: 460px"></div>
<script src="/node_modules/react/umd/react.production.min.js"></script>
<script src="/node_modules/react-dom/umd/react-dom.production.min.js"></script>
<script src="/node_modules/@opensheets/spread-sheets/dist/gc.spread.sheets.all.min.js"></script>
<script src="/node_modules/@opensheets/spread-sheets-react/dist/gc.spread.sheets.react.min.js"></script>
<script>
  var R = GC.Spread.Sheets.React; // { SpreadSheets, Worksheet, Column }
  ReactDOM.createRoot(document.getElementById('sheet')).render(
    React.createElement(R.SpreadSheets, null, React.createElement(R.Worksheet, { name: 'Sheet1' }))
  );
</script>
```

The v19 public docs show only bundler usage for this wrapper and name no script-tag global;
we expose the historical `GC.Spread.Sheets.React` namespace (docs/STATUS.md, GAP-52-3).

Licence: MIT (see `LICENSE.md`).
