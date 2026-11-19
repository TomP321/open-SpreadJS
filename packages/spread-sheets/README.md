# @opensheets/spread-sheets

A canvas-rendered JavaScript spreadsheet for web applications that follows the public API
shape of SpreadJS 19 (`GC.Spread.Sheets.*`). Written in TypeScript from public type
declarations and public documentation.

## Install

```sh
npm install @opensheets/spread-sheets
```

Drop-in for an application written against the official package (npm alias, no code changes):

```json
{ "dependencies": { "@mescius/spread-sheets": "npm:@opensheets/spread-sheets@^0.1.0" } }
```

## Use

```ts
import GC from '@opensheets/spread-sheets';
import '@opensheets/spread-sheets/styles/gc.spread.sheets.excel2013white.css';

const workbook = new GC.Spread.Sheets.Workbook(document.getElementById('sheet')!);
const sheet = workbook.getActiveSheet();
sheet.setValue(0, 0, 'Total');
sheet.setValue(0, 1, '=1+2');
```

## Package layout

| Path | Format |
| --- | --- |
| `dist/gc.spread.sheets.esm.js` | ESM (`export default GC`, plus `Spread`/`Data`/`Pivot` named exports) |
| `dist/gc.spread.sheets.cjs` | CommonJS (`module.exports = GC`) |
| `dist/gc.spread.sheets.all.min.js` | browser IIFE, sets `window.GC` (script tag) |
| `dist/gc.spread.sheets.d.ts` / `.d.cts` | type declarations (ESM default / `export = GC`) |
| `dist/gc.spread.sheets.internals.*` | internal helpers for the OpenSheets designer (not part of the public API) |
| `styles/gc.spread.sheets.css` and the `excel2013*`/`excel2016*` theme files | sheet themes |

Licence: MIT (see `LICENSE.md`). Third-party notices: `THIRD_PARTY_NOTICES.md`.
