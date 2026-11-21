# @opensheets/spread-sheets-charts

Charts add-in for [OpenSheets](../spread-sheets/README.md) — a clean-room, drop-in
replacement for the SpreadJS add-in `@mescius/spread-sheets-charts` (script file
`gc.spread.sheets.charts.min.js`).

OpenSheets' core implements the chart layer (`worksheet.charts`) itself, so — exactly like the
official add-in after it is loaded — importing or script-tagging this package makes
`worksheet.charts` work in the application; the difference is that ours finds the feature already
inside the core. Loading is harmless and idempotent (twice, or from two bundles, is fine),
and the package adds no public API of its own: everything lives under the documented
`GC.Spread.Sheets.*` namespace of the core.

## Install (drop-in recipe, every add-in)

An application that used the official add-ins switches all of them at once:

```json
{
  "dependencies": {
    "@mescius/spread-sheets": "npm:@opensheets/spread-sheets@^0.1.0",
    "@mescius/spread-sheets-io": "npm:@opensheets/spread-sheets-io@^0.1.0",
    "@mescius/spread-sheets-barcode": "npm:@opensheets/spread-sheets-barcode@^0.1.0",
    "@mescius/spread-sheets-charts": "npm:@opensheets/spread-sheets-charts@^0.1.0",
    "@mescius/spread-sheets-shapes": "npm:@opensheets/spread-sheets-shapes@^0.1.0",
    "@mescius/spread-sheets-print": "npm:@opensheets/spread-sheets-print@^0.1.0",
    "@mescius/spread-sheets-pdf": "npm:@opensheets/spread-sheets-pdf@^0.1.0",
    "@mescius/spread-sheets-languagepackages": "npm:@opensheets/spread-sheets-languagepackages@^0.1.0",
    "@mescius/spread-sheets-ganttsheet": "npm:@opensheets/spread-sheets-ganttsheet@^0.1.0",
    "@mescius/spread-sheets-pivot-addon": "npm:@opensheets/spread-sheets-pivot-addon@^0.1.0",
    "@mescius/spread-sheets-reportsheet-addon": "npm:@opensheets/spread-sheets-reportsheet-addon@^0.1.0",
    "@mescius/spread-sheets-slicers": "npm:@opensheets/spread-sheets-slicers@^0.1.0",
    "@mescius/spread-sheets-tablesheet": "npm:@opensheets/spread-sheets-tablesheet@^0.1.0"
  }
}
```

## Use

Bundler (ESM or CommonJS) — importing the package is all it takes (any order after the core):

```ts
import * as GC from '@mescius/spread-sheets';
import '@mescius/spread-sheets-charts';

const sheet = new GC.Spread.Sheets.Workbook(host).getActiveSheet();
sheet.charts.add('C1', GC.Spread.Sheets.Charts.ChartType.columnClustered, 140, 10, 260, 140, 'A1:B3');
```

Script tags — official file names, official order (core first, this add-in after it):

```html
<script src="./node_modules/@mescius/spread-sheets/dist/gc.spread.sheets.all.min.js"></script>
<script src="./node_modules/@mescius/spread-sheets-charts/dist/gc.spread.sheets.charts.min.js"></script>
```

## Files

- `dist/gc.spread.sheets.charts.esm.js` — ESM entry (imports the core peer).
- `dist/gc.spread.sheets.charts.cjs` — CommonJS entry (requires the core peer).
- `dist/gc.spread.sheets.charts.min.js` — script-tag build, attaches to `window.GC`
  (the official package's file name).
- `dist/gc.spread.sheets.charts.d.ts` / `.d.cts` — side-effect typings (no extra public API).

## License

MIT
