# @opensheets/spread-sheets-resources-it

Italian (it-IT) localisation for the OpenSheets spreadsheet core: the `it-it`
culture (decimal `,`, thousands `.`, `dd/MM/yyyy`, Italian month and day names,
€ currency formats) and the Italian UI string table the core paints — context
menus (cells, rows, columns, sheet tabs, tables, slicers, pivot), the filter and
sort menus, the comment/threaded-comment UI, the pivot/TableSheet/scenario/DataChart
panels, the status bar and sheet-list labels.

Drop-in alias for `@mescius/spread-sheets-resources-it` (the official product has
no Italian resources package; this package follows the same load model as its
`-ja`/`-ko`/`-zh` packages):

```json
"@mescius/spread-sheets-resources-it": "npm:@opensheets/spread-sheets-resources-it@^0.1.0"
```

## Use

Import it after the core and before creating the workbook (ESM/CJS), or load the
script-tag file after the core script:

```ts
import GC from '@mescius/spread-sheets';
import '@mescius/spread-sheets-resources-it';

GC.Spread.Common.CultureManager.culture('it-it');
const wb = new GC.Spread.Sheets.Workbook(document.getElementById('sheet-host')!);
```

```html
<script src="@mescius/spread-sheets/dist/gc.spread.sheets.all.min.js"></script>
<script src="@mescius/spread-sheets-resources-it/dist/gc.spread.sheets.resources.it.min.js"></script>
<script>GC.Spread.Common.CultureManager.culture('it-it');</script>
```

`CultureManager.culture('it-it')` also switches at runtime: menus, filter dialogs,
status bar and panel captions are re-read from the current culture on every
render (panels built once keep the captions of the culture they were built under,
so build controls after switching). English is the default and is unchanged when
the package is not loaded.

Registered entries (public `CultureManager` model, like `addCultureInfo` documents):

- `getCultureInfo('it-it')` — id `1040`, name `it-IT`, `NumberFormat`/`DateTimeFormat`
  with the Italian separators, patterns and names, plus `predefinedFormats`.
- `getResources('it-it')` — the string table (`contextMenu`, `filter`, `comments`,
  `pivotPanel`, `pivotMenu`, `tablePanel`, `scenarios`, `controls`, `status`,
  `sheets`, `slicer`, `dataChart`).

Loading this package also activates the **Italian calc language package** (TASK 89): formulas
are accepted and displayed in Italian Excel grammar — `=SOMMA(A1;A2)`, `=SE(A1>0;"sì";"no")`,
`=1,5*2` — while `getFormula()` (default), `toJSON()` and XLSX keep the invariant English form,
so files stay exchangeable with Excel in any language. Without this package (or after
`GC.Spread.CalcEngine.LanguagePackages.languagePackages('')`) formulas are exactly as before:
English names, comma separators. See docs/STATUS.md § TASK 89 for the full contract.

Exports: `culture`, `cultureName`, `cultureDisplayName`, `resources`,
`registerItalian(gc)` (idempotent; `false` with a warning when no core was found).

Licence: MIT (see `LICENSE.md`).
