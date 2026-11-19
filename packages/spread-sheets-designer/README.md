# @opensheets/spread-sheets-designer

The OpenSheets Designer component: a ribbon, property panels and a hosted workbook, created
through `GC.Spread.Sheets.Designer.Designer`.

```ts
import GC from '@mescius/spread-sheets';
import '@mescius/spread-sheets/styles/gc.spread.sheets.excel2013white.css';
import '@mescius/spread-sheets-designer';
import '@mescius/spread-sheets-designer-resources-en';
import '@mescius/spread-sheets-designer/styles/gc.spread.sheets.designer.min.css';

const designer = new GC.Spread.Sheets.Designer.Designer('designer-host');
designer.getWorkbook().getActiveSheet().setValue(0, 0, 'Hello');
```

The package references the core through the name an application installs (its `peerDependency` is
`@mescius/spread-sheets`), so an aliased install resolves ONE core copy shared with the Designer -
no bundler alias or bridge is needed.

| Path | Format |
| --- | --- |
| `dist/gc.spread.sheets.designer.esm.js` | ESM |
| `dist/gc.spread.sheets.designer.cjs` | CommonJS |
| `dist/gc.spread.sheets.designer.all.min.js` | browser IIFE, installs onto an existing `window.GC` |
| `dist/gc.spread.sheets.designer.d.ts` / `.d.cts` | type declarations |
| `styles/gc.spread.sheets.designer.min.css`, `...light.min.css`, `...dark.min.css` | designer themes |

Drop-in alias: `{ "@mescius/spread-sheets-designer": "npm:@opensheets/spread-sheets-designer@^0.1.0" }`.
Licence: MIT (see `LICENSE.md`). Icons and open-source notices: `ICONS.md`.
