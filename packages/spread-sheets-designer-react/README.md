# @opensheets/spread-sheets-designer-react

React wrapper for the OpenSheets Designer component: `<Designer config={...} />`.

```tsx
import { Designer } from '@opensheets/spread-sheets-designer-react';
import '@opensheets/spread-sheets/styles/gc.spread.sheets.excel2013white.css';
import '@opensheets/spread-sheets-designer/styles/gc.spread.sheets.designer.min.css';

export default () => <Designer styleInfo={{ width: '100%', height: '100%' }} />;
```

Peer dependencies: `react` and `react-dom` (>= 16.8).
Drop-in alias: `{ "@mescius/spread-sheets-designer-react": "npm:@opensheets/spread-sheets-designer-react@^0.1.0" }`.

## Script tags (no bundler)

Like the official wrapper's `dist/gc.spread.sheets.designer.react.min.js`, this package ships
script-tag builds with the same file names (`.js` and `.min.js`). Load React/ReactDOM, the
SpreadJS core and the Designer bundle as globals first; this bundle installs the component on
`GC.Spread.Sheets.Designer.React`:

```html
<script src="/node_modules/react/umd/react.production.min.js"></script>
<script src="/node_modules/react-dom/umd/react-dom.production.min.js"></script>
<script src="/node_modules/@opensheets/spread-sheets/dist/gc.spread.sheets.all.min.js"></script>
<script src="/node_modules/@opensheets/spread-sheets-designer/dist/gc.spread.sheets.designer.all.min.js"></script>
<script src="/node_modules/@opensheets/spread-sheets-designer-resources-en/dist/gc.spread.sheets.designer.resource.en.min.js"></script>
<script src="/node_modules/@opensheets/spread-sheets-designer-react/dist/gc.spread.sheets.designer.react.min.js"></script>
<script>
  var Designer = GC.Spread.Sheets.Designer.React.Designer;
  ReactDOM.createRoot(document.getElementById('host')).render(React.createElement(Designer, null));
</script>
```

The v19 public docs show only bundler usage for this wrapper and name no script-tag global;
we expose the historical `GC.Spread.Sheets.Designer.React` namespace (docs/STATUS.md, GAP-52-3).

Licence: MIT (see `LICENSE.md`).
