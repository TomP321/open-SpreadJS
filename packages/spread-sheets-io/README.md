# @opensheets/spread-sheets-io

Optional IO plugin for OpenSheets, with the public SpreadJS 19.2.5 import/export API.
The implementation is partial; see the M7a section in [STATUS.md](../../docs/STATUS.md).

Use the same package names in application code through npm aliases:

```json
{
  "dependencies": {
    "@mescius/spread-sheets": "npm:@opensheets/spread-sheets@^0.1.0",
    "@mescius/spread-sheets-io": "npm:@opensheets/spread-sheets-io@^0.1.0"
  }
}
```

```js
import * as GC from '@mescius/spread-sheets';
import '@mescius/spread-sheets-io';

const spread = new GC.Spread.Sheets.Workbook(document.getElementById('spread'));
spread.import(file, () => {}, console.error, {
  fileType: GC.Spread.Sheets.FileType.excel,
});
spread.export(blob => { /* download or upload the Blob */ }, console.error, {
  fileType: GC.Spread.Sheets.FileType.excel,
});
```

The plugin installs methods on the existing Workbook constructor. It includes ESM,
CommonJS, and a browser wrapper at `dist/gc.spread.sheets.io.umd.js` that uses global
`GC`. Load the core first when using script tags. Core-only workbooks omit the IO
methods.

XLSX, CSV, and SSJSON have bounded import/export coverage. SJS open/save, encrypted
XLSX, macro-enabled export, advanced header/frozen conversions, and several other
options remain unsupported. Unsupported operations report `NotImplemented`; the
package does not provide full behavioral or visual compatibility yet. The XLSX
implementation is independent and uses MIT-licensed `fflate` for ZIP compression.

## Package layout

| Path | Format |
| --- | --- |
| `dist/gc.spread.sheets.io.esm.js` | ESM (side-effect import; patches the core `Workbook.prototype`) |
| `dist/gc.spread.sheets.io.cjs` | CommonJS (`require('@opensheets/spread-sheets-io')`) |
| `dist/gc.spread.sheets.io.umd.js` | browser script tag; uses the global `GC` (AMD/CommonJS aware) |
| `dist/gc.spread.sheets.io.d.ts` / `.d.cts` | type declarations |

The plugin resolves the core through the `@mescius/spread-sheets` name, which the drop-in
alias above provides (peer dependency).

Licence: MIT (see `LICENSE.md`). Third-party notices: `THIRD_PARTY_NOTICES.md`.
