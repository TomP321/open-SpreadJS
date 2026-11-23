# Migrating a SpreadJS 19.x application to OpenSheets

This guide switches an existing application written against
`@mescius/spread-sheets` (+ add-ons, + Designer) **19.2.5** to OpenSheets with
**no application-code changes** — only the install lines change. The contract we
target is the official public type declarations (`gc.spread.sheets.d.ts`,
`gc.spread.sheets.react.d.ts`, the designer d.ts files) and the public
documentation at <https://developer.mescius.com/spreadjs/api/> and `/docs/`.

Runnable start points: [`examples/`](../examples) (each README shows the exact
alias block and builds offline against this workspace). The same recipe is
verified end-to-end from packed tarballs by `pnpm dropin:check -- --pack`
([apps/dropin-check](../apps/dropin-check/README.md)).

---

## 1. The npm alias block

Replace every official package with the OpenSheets package of the same name
through npm's `npm:` alias. All 17 published packages alias one-to-one:

```json
{
  "dependencies": {
    "@mescius/spread-sheets": "npm:@opensheets/spread-sheets@^0.1.0",
    "@mescius/spread-sheets-react": "npm:@opensheets/spread-sheets-react@^0.1.0",
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
    "@mescius/spread-sheets-tablesheet": "npm:@opensheets/spread-sheets-tablesheet@^0.1.0",
    "@mescius/spread-sheets-designer": "npm:@opensheets/spread-sheets-designer@^0.1.0",
    "@mescius/spread-sheets-designer-react": "npm:@opensheets/spread-sheets-designer-react@^0.1.0",
    "@mescius/spread-sheets-designer-resources-en": "npm:@opensheets/spread-sheets-designer-resources-en@^0.1.0"
  }
}
```

You only need the entries for the packages your application actually imports —
copy the lines you use, keep the official names on the left, and reinstall
(`npm install` / `pnpm install` / `yarn`). Nothing else changes:

- every package exports the same `GC` namespace (ESM default + named exports,
  CommonJS `module.exports = GC`, UMD global `window.GC`);
- import paths inside your code (`'@mescius/spread-sheets/...'` subpaths,
  `styles/...` files, `dist/...` bundles) keep working — the packages ship the
  same file names behind an equivalent `exports` map;
- **one core copy rule:** every add-on (react, io, barcode, charts, …, designer)
  imports the core under the name **your application installs**
  (`@mescius/spread-sheets`), so with the aliases above the add-ons attach to the
  very `GC` your code holds — `GC.Spread.Sheets.findControl`, `instanceof
  GC.Spread.Sheets.Workbook` and `Designer` all see the same classes. Never mix
  an aliased core with a plain `@opensheets/...` (or real `@mescius/...`)
  dependency in one app: two core copies break `instanceof` identity. The
  `pnpm dropin:check` gate fails the build if a second core copy appears.

pnpm users writing `workspace:`/`link:` specs locally (or our own CI) map the
same names with `"@mescius/spread-sheets": "link:../packages/spread-sheets"`;
keys, package contents and every import path are identical to the registry
recipe (npm refuses `npm:` aliases for `file:` tarballs, so `file:`/`link:`
specs replace the `npm:` right-hand side only).

## 2. Bundler / module-format notes

**Vite (and esbuild/Rollup/webpack 5 with ESM):** nothing to do. The packages
ship `"type": "module"` with an `exports` map (`import` →
`dist/gc.spread.sheets.esm.js`, `require` → `dist/gc.spread.sheets.cjs`, types
next to each). Import CSS by file name like before:

```ts
import GC from '@mescius/spread-sheets';
import '@mescius/spread-sheets/styles/gc.spread.sheets.css';
import '@mescius/spread-sheets/styles/gc.spread.sheets.excel2013white.css';
```

**webpack:** same `exports` map; webpack 5 resolves the browser/ESM conditions
without configuration. No `sideEffects` tricks are needed — importing the core
has no global side effects (see script tags below for the one bundle that
deliberately does).

**CommonJS / Node (headless data work, import/export jobs):**
`require('@mescius/spread-sheets')` returns the `GC` namespace; the workbook
runs headless (no DOM needed for model/formula/JSON work — attach a host element
only to paint). Verified by the `d-cjs-node` drop-in run. `GC.Spread.Sheets`
workbooks are usable in SSR as long as you do not construct the interactive
layer without a DOM.

**Script tags (`<script>`, no bundler):** the same file names as the official
UMD/IIFE bundles:

```html
<link rel="stylesheet" href="./node_modules/@mescius/spread-sheets/styles/gc.spread.sheets.css" />
<script src="./node_modules/@mescius/spread-sheets/dist/gc.spread.sheets.all.min.js"></script>
<script src="./node_modules/@mescius/spread-sheets-io/dist/gc.spread.sheets.io.min.js"></script>
<script>
  const wb = new GC.Spread.Sheets.Workbook(document.getElementById('ss'));
</script>
```

- the core `all.min.js` sets `window.GC`; add-on bundles attach to the `GC`
  already on the page (IO patches `Workbook.prototype.import/export/open/save`,
  which exist as `undefined` placeholders until then);
- the Designer browser bundle (`gc.spread.sheets.designer.all.min.js`) also
  publishes `window.GC` when the page loaded none, so it is usable alone;
- React wrappers ship script-tag builds under the official file names
  (`dist/gc.spread.sheets.react.min.js`,
  `dist/gc.spread.sheets.designer.react.min.js`/`.js`); they read the page
  globals `React`, `ReactDOM`, `GC` (load them first) and install the components
  at `GC.Spread.Sheets.React` / `GC.Spread.Sheets.Designer.React`. Note the
  official 19.2.5 react UMD itself throws on its global branch (measured
  black-box); ours work, so a script-tag React app that only rendered through a
  bundler before now renders directly. See `examples/script-tag-umd`.

## 3. License-key calls

OpenSheets is MIT-licensed and has **no license enforcement**. What your app
usually calls:

- `GC.Spread.Sheets.LicenseKey = '<key>';` — the member is declared in the v19
  public d.ts (`var LicenseKey: string`); ours is a plain writable string that is
  **never read**: the assignment is accepted and ignored (no-op). No validation,
  no expiry, no watermark, no trial banner. TypeScript keeps compiling.
- `GC.Spread.Sheets.SetLicenseKey('<key>');` — the v19 **public d.ts does not
  declare this function** (it is only in the prose docs), so against our typed
  package a call to it is a TS error and at runtime `undefined`. If your code
  calls it, either delete the line or guard it while migrating:

  ```ts
  const sheets = GC.Spread.Sheets as unknown as { SetLicenseKey?: (key: string) => void };
  sheets.SetLicenseKey?.('…'); // no-op on OpenSheets; keeps running during cleanup
  ```

  Once the calls are removed the types line up exactly with the d.ts contract.
- The old per-workbook `{ licenseKey }`-style boot-time key checks and the trial
  watermark machinery simply do not exist on our side; nothing else in the
  Workbook options changed.

## 4. Stylesheets (same file names)

Core package, `styles/` — 7 files, same names as the official package:

```
gc.spread.sheets.css                      (base)
gc.spread.sheets.excel2013white.css       (themes)
gc.spread.sheets.excel2013lightGray.css
gc.spread.sheets.excel2013darkGray.css
gc.spread.sheets.excel2016colorful.css
gc.spread.sheets.excel2016darkGray.css
gc.spread.sheets.excel2016black.css
```

Designer package, `styles/` — 3 files, same names:

```
gc.spread.sheets.designer.min.css         (base)
gc.spread.sheets.designer.light.min.css
gc.spread.sheets.designer.dark.min.css
```

Keep your existing `<link>`/`import` order (base before theme). Two honest
differences behind the identical names: our theme files are thin `@import`
layers onto one authored base sheet (the official themes each inline the whole
base plus rasters), and every pixel of our UI — including all icons and glyphs —
is vector-drawn in code, so there are no sprite images to fetch. Computed
colours/geometry match the paired gates in `apps/compare` /
`apps/designer-compare`; if you override internal `.gc-*` classes, diff against
the running pages before shipping.

## 5. Lingua italiana (Designer UI in Italian)

The official product ships per-language Designer resource packages
(`@mescius/spread-sheets-designer-resources-en`, `-ja`, `-zh`, `-de`, `-es`,
`-fr`, `-ko`, `-pt-br`) but no Italian one. OpenSheets provides its own
translation as `@opensheets/spread-sheets-designer-resources-it`; since there is
no official twin, use it directly — no npm alias is needed:

```bash
npm install @opensheets/spread-sheets-designer-resources-it
```

Import the package **after** the Designer and **before** creating the
`Designer`, exactly like the official language packages: the Designer reads the
resources once at construction, and labels measured at startup (ribbon widths,
adaptive layout) then use the Italian strings.

```ts
import '@opensheets/spread-sheets-designer';
import '@opensheets/spread-sheets-designer-resources-it'; // after the designer, before construction

const designer = new GC.Spread.Sheets.Designer.Designer(host); // UI in Italian
```

CommonJS / script tag work the same way:

```js
require('@opensheets/spread-sheets-designer');
require('@opensheets/spread-sheets-designer-resources-it');
```

```html
<script src="node_modules/@opensheets/spread-sheets-designer/dist/gc.spread.sheets.designer.all.min.js"></script>
<script src="node_modules/@opensheets/spread-sheets-designer-resources-it/dist/gc.spread.sheets.designer.resource.it.min.js"></script>
```

The package exports `italianResources` with exactly the key tree of
`englishResources` and merges it through the public
`GC.Spread.Sheets.Designer.setResources`, so partial overrides
(`setResources({ ... })`) keep working; terminology follows the Italian
Microsoft Excel UI (Home, Inserisci, Layout di pagina, Formule, Dati, Revisione,
Visualizza, Impostazioni; Incolla/Taglia/Copia/Copia formato; Grassetto,
Corsivo, Sottolineato; Formattazione condizionale, Formatta come tabella, Stili
cella; Inserisci funzione, Gestione nomi; Ordina e filtra, Convalida dati,
Rimuovi duplicati, Testo in colonne; Blocca riquadri; Proteggi foglio; ...).
English stays the default: nothing changes unless the Italian package (or an
equivalent `setResources` call) is loaded.

## 6. Known deviations (v0.1)

Behavioural parity is verified black-box against the official trial
(API-coverage report: classes 207/207, methods/functions 1796/1796, enums
252/252, declarations 1369/1369 — declaration presence is not parity; the
table in the [root README](../README.md#status) and `docs/STATUS.md` state what
is behaviourally verified). Deviations you can actually hit:

**Rendering / Designer**

- **DPR-2 pixel residual (open, measured):** all DOM assertions pass at device
  pixel ratio 2, but 21 adaptive masked-pixel gate variants in
  `apps/designer-compare` sit at 0.587–1.924 % diff over ribbon text (limit
  0.5 %). Root cause re-verified in `docs/STATUS.md` § TASK 57: our text paints
  ~1.3 % more full-ink coverage at 12 px; not reachable via public-API-legal
  CSS/DOM/SVG. Geometry, fonts, colours and layout are identical.
- Chart **selection frame/handles are not painted** (the trial shows them
  in-place on click); `trendlines`/`errorBars` round-trip through JSON but do
  not render; `chart.toImageSrc()` renders the live canvas only.
- Print preview UI is **partial** (pagination/print model is; the preview
  chrome is not finished). `savePDF` embeds TrueType subsets.

**API-level gaps (recorded in docs/STATUS.md § TASK 77)**

- `shapeGroup`: grouping works and the members keep their own objects on both
  access paths we expose, but our `shapes.all()` does not answer with one nested
  `GroupShape` entry the way the trial's `grpSp` serialization does (core
  follow-up).
- `pasteLinkedPicture` / `PictureShape`: our core classes give linked pictures
  the inherited `text()` accessor; the trial's published class chain does not
  declare it. Position/size/resize-semantics/JSON match.
- Report-sheet naming: the trial rebases its `SheetN` counter when loading JSON
  (`fromJSON` of a `[Data]` workbook continues at `Sheet2`); our core keeps the
  session counter. Only affects the default name of the sheet `pivotTableListFormulas`
  (and friends) create after a load — content is byte-identical.
- Viewport metrics on edges: frozen-pane rows do not shrink
  `getViewportWidth/Height(1)` (we report the full viewport, the trial splits
  it); hiding the sheet-tab strip gains 6 px of grid height only on our side;
  post-zoom gutters can be fractional (199.61 vs 199).

**Modules that are bounded, not full**

- **IO:** XLSX/CSV/SSJSON read+write verified against the trial within bounded
  feature sets (see STATUS.md per milestone); password-protected XLSX passes a
  four-way comparison, **other encryption variants and error semantics are
  unverified**; SJS cross-import is basic (default theme, strings/numbers/one
  formula/one fill verified both directions); complex features remain open.
- `GC.Data` `TableView`, TableSheet, Gantt, ReportSheet: partial — check the
  STATUS.md section before relying on a sub-feature.
- Threaded comments: partial (legacy comments are complete).

**Trial quirks we reproduce on purpose** (so behaviour does not shift when you
switch — these are *matching* the trial, not bugs to file against the trial):

- Charts: the deferred layout pass ~2 s after creation that stamps
  `plotArea.spPr.ln = {noFill:true}`; after series mutations `dataRange()`
  throws `"undefined" is not valid JSON` and `chartType()` returns the stale
  internal value; hidden legends drop the whole `legend` JSON node;
  `chart.legend({position:2})` is a no-op; `chart.getHost()` throws.
- Sorting **includes the header row** of the sorted range and moves
  values/styles/comments while formulas stay in place (trial semantics).
- Conditional-formatting collections: `remove` of a member that is not in the
  collection drops the **last** rule.
- Dates: a number under a date format becomes the Excel serial date including
  the 1900-leap-year quirk (`123` → 1900-05-02).
- Hyperlink copy/move quirks, theme-aware hyperlink colours (`#0563C1` with the
  Excel 2013 theme, `#0000FF` without a stylesheet), slicer `nameInFormula()`
  behaviour, `PivotTableStyle` property-probe behaviour.
- Trial-side facts we do **not** inherit: the trial core loaded by `<script>`
  creates zero-sheet workbooks off `localhost`; the trial base package has no
  `sheet.charts` without the `-charts`(+`-shapes`) add-on; under bundler loading
  the trial's paginator throws, `slicers.add` registers nothing and
  `BC_QRCODE` yields no record; the trial keeps one Workbook + host alive per
  destroyed Designer. Ours behave correctly in all of these.

**Unsupported declared members** exist for type compatibility and throw/warn
`NotImplemented` in dev builds (recorded in `docs/API_COVERAGE.md`) — nothing is
silently stubbed, so a `NotImplemented:` error in the console means an unported
API, not a broken one.

## 7. Switch checklist

1. Replace the dependency lines with the alias block (§ 1) for exactly the
   packages you import; reinstall.
2. Remove/guard `SetLicenseKey` calls; keep `LicenseKey` assignments or delete
   them (§ 3).
3. Rebuild and run your test suite. Expect zero source edits; the only
   type-level fallout possible is `SetLicenseKey` (not in the v19 d.ts).
4. Smoke-check your CSS imports (§ 4) and any `.gc-*` overrides.
5. If you use the Designer through `globalThis.GC` hacks or an alias bridge
   added for the official packages, remove them — the plain alias install now
   resolves one core (§ 1, GAP-52-1/2 closed).
6. Check § 6 against your feature list before shipping.

Performance after switching is normally a large win in one direction only — see
[docs/PERFORMANCE.md](PERFORMANCE.md) (1M-row open 0.3 ms vs 1164 ms, `setArray`
200k×20 33x faster, half the heap, smaller bundles).

## 7. Lingua italiana (core)

Official SpreadJS localises its spreadsheet UI through per-language resource packages
(`@mescius/spread-sheets-resources-ja|ko|zh`). There is **no official Italian one**, so an
Italian application has nothing to alias there — this is the OpenSheets side of the feature
(core part; the Designer strings live in `@opensheets/spread-sheets-designer-resources-it`).

Add the alias only if you want the official-style package name (it is optional: the culture and
the strings are already built into `@opensheets/spread-sheets`):

```json
"@mescius/spread-sheets-resources-it": "npm:@opensheets/spread-sheets-resources-it@^0.1.0"
```

Then load it after the core and switch the culture before creating workbooks/controls:

```ts
import GC from '@mescius/spread-sheets';
import '@mescius/spread-sheets-resources-it';         // side effect: registers it-it

GC.Spread.Common.CultureManager.culture('it-it');
const wb = new GC.Spread.Sheets.Workbook(host);
```

```html
<script src="@mescius/spread-sheets/dist/gc.spread.sheets.all.min.js"></script>
<script src="@mescius/spread-sheets-resources-it/dist/gc.spread.sheets.resources.it.min.js"></script>
<script>GC.Spread.Common.CultureManager.culture('it-it');</script>
```

What switching to `it-it` changes:

- **Number/date model** — decimal `,`, thousands `.` (numbers, currency and percentages),
  `€` currency symbol, `dd/MM/yyyy` short date, `HH:mm`/`HH:mm:ss` times, Italian month and day
  names, empty AM/PM designators, Italian `predefinedFormats`. Typing `1.234,5` into a cell
  stores `1234.5` and a `#,##0.00` cell paints `1.234,50`; `5/11/2026` reads as 5 November.
  `General` rendering keeps the trial's behaviour (culture-independent) on both engines.
- **Core UI strings** — context menus (cells, rows, columns, corner, sheet tabs, tables,
  pivot, slicer), the filter/sort menus and the Custom AutoFilter dialog (`Seleziona tutto`,
  `Deseleziona tutto`, `(Vuote)`, `Cancella filtro da "…"`), the comment and threaded-comment
  UI, the pivot field panel and pivot filter dropdown, the TableSheet panel, the scenario panel,
  the DataChart config panel, the status bar (`Pronto`, `Somma: 6`, `Conteggio: 3`), the sheet
  list popups, the slicer blank label and the timeline captions/month labels.
- **Formulas in Italian** (calc language package, TASK 89) — activating `it` makes the grammar
  Excel-in-Italy: `=SOMMA(A1;A2)`, `=SE(A1>0;"sì";"no")`, `=1,5*2` (decimal comma), array
  constants `{1;2\3;4}`. Function names, `VERO`/`FALSO` and errors (`#N/D`, `#VALORE!`, …) are
  accepted in Italian **and** still in English; the cell editor, the formula bar and
  `getFormula()` show the Italian form. Storage stays invariant English: `toJSON()`, XLSX and
  `getFormulaInformation().formula` keep `=SUM(A1,A2)` (the localized text is also available as
  `formulaWithCulture`), so files open in Excel in any language.

Notes when you switch:

- Default behaviour is untouched: without the import (or with `culture('en-us')`) every string
  and format is what it was, byte for byte. `en-US` and `ja-JP` keep their built-in cultures.
- Public API values do not shift: `StatusItem.value`, `contextMenu.menuData[].text` and the
  internal slicer blank marker stay English data; only the painted/DOM captions localise.
- Controls that build their DOM once (threaded-comment panel, TableSheet panel, scenario panel,
  DataChart config panel) take the culture active **at build time**; build them after switching.
  Menus, filter dialogs, status bar and slicer/timeline painting follow the culture live.
- `CultureManager.getResources('it-it')` answers the string table on our core; the trial core
  answers `{}`/`null` for every culture (its UI text is compiled in), so a migration helper that
  probes `getResources` must tolerate `null` when it runs against the official package.
- `it-it` reports `NumberFormat.listSeparator = ';'` (the d.ts contract for formula arguments).
  Formula parsing/display follows the **calc language package**, not the culture: `culture('it-it')`
  alone keeps English `,` formulas; loading `@opensheets/spread-sheets-resources-it` (or calling
  `GC.Spread.CalcEngine.LanguagePackages.languagePackages('it')`) activates the Italian grammar —
  the gap recorded in docs/STATUS.md § TASK 88 is closed by § TASK 89.
