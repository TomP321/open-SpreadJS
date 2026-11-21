# @opensheets/spread-sheets-barcode

Barcode (`BC_*`) formula add-in for [OpenSheets](../spread-sheets/README.md) — a clean-room,
drop-in replacement for the SpreadJS barcode plugin `@mescius/spread-sheets-barcode`.

The core keeps the `BC_*` formula layer dormant (a core-only install evaluates `=BC_QRCODE("x")`
as `#NAME?`, exactly like the official trial without its barcode add-on). Installing this
package registers the layer — `BC_QRCODE`, `BC_EAN13`, `BC_EAN8`, `BC_CODABAR`, `BC_CODE39`,
`BC_CODE93`, `BC_CODE128`, `BC_GS1_128`, `BC_CODE49`, `BC_PDF417`, `BC_DATAMATRIX` — on the
core it finds, once and idempotently.

## Install (drop-in recipe)

```json
{
  "dependencies": {
    "@mescius/spread-sheets": "npm:@opensheets/spread-sheets@^0.1.0",
    "@mescius/spread-sheets-barcode": "npm:@opensheets/spread-sheets-barcode@^0.1.0"
  }
}
```

## Use

Bundler (ESM or CommonJS) — importing the package is the registration:

```ts
import * as GC from '@mescius/spread-sheets';
import '@mescius/spread-sheets-barcode';

const sheet = new GC.Spread.Sheets.Workbook(host).getActiveSheet();
sheet.setFormula(0, 0, '=BC_QRCODE("https://opensheets.dev")');
```

Script tags — official file names, official order (core first, this add-in after it):

```html
<script src="./node_modules/@mescius/spread-sheets/dist/gc.spread.sheets.all.min.js"></script>
<script src="./node_modules/@mescius/spread-sheets-barcode/dist/gc.spread.sheets.barcode.min.js"></script>
```

## Files

- `dist/gc.spread.sheets.barcode.esm.js` — ESM entry (imports the core peer).
- `dist/gc.spread.sheets.barcode.cjs` — CommonJS entry (requires the core peer).
- `dist/gc.spread.sheets.barcode.min.js` — script-tag build, registers onto `window.GC`
  (the official package's file name).
- `dist/gc.spread.sheets.barcode.d.ts` / `.d.cts` — side-effect typings.

The registration hook this package calls (`GC.Spread.Sheets._registerBarcodeFunctions`) is an
internal handshake between OpenSheets packages, deliberately non-enumerable and undeclared in
the core's public typings, so the core's public surface stays identical to the SpreadJS API
contract.

## License

MIT
