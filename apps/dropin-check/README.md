# apps/dropin-check — drop-in packaging gate (TASK 52)

Checks that the published `@opensheets/*` packages are a drop-in for the package names an
application imports (`@mescius/*`): it installs them into fresh sample applications, builds those
applications with `tsc --noEmit` against the installed typings, runs them headlessly, and compares
the result with the same application code run against the official trial packages.

```sh
pnpm -r build                                   # every package must have its dist/ built
pnpm dropin:check -- --pack                     # npm pack all public packages, then run the gate
pnpm dropin:check                               # reuse the tarballs already in .probe/t52/tarballs
node apps/dropin-check/scripts/dropin-check.mjs --pack --only a-vite-core,e-umd-script
```

`pnpm dropin:check` is an **optional** gate: it is not part of `pnpm -r test` (the supervisor
decides when it runs). It needs the network the first time it runs, because the sample apps pull
`vite`, `react`, `esbuild` and the third-party dependencies of our packages from the npm registry
(the npm cache is kept in `.probe/t52/npm-cache`). Nothing is published or uploaded: our own
packages always come from the local tarballs in `.probe/t52/tarballs`.

## What runs

| Run | Application shape | Gated |
| --- | --- | --- |
| `a-vite-core` | plain Vite + TypeScript: `import * as GC from '@mescius/spread-sheets'` + a theme CSS import | yes |
| `b-vite-react` | React app: `<SpreadSheets><Worksheet><Column/></Worksheet></SpreadSheets>` | yes |
| `c-vite-designer` | `new GC.Spread.Sheets.Designer.Designer(host)` (side-effect imports of the designer + English resources) | gap GAP-52-1 |
| `c-vite-designer-bridged` | the same app with the alias bridge described under GAP-52-1 | yes |
| `d-cjs-node` | CommonJS: `require('@mescius/spread-sheets')` run under Node, and the same entry bundled for the browser | yes |
| `e-umd-script` | `<script src="./node_modules/@mescius/spread-sheets/dist/gc.spread.sheets.all.min.js">`, `window.GC`, plus the IO plugin | yes |
| `c-umd-ours` | our designer browser bundle through script tags (`window.GC`) | yes |
| `g-vite-barcode` | barcode add-in: aliased core + `@mescius/spread-sheets-barcode`, `=BC_QRCODE("x")` evaluates the barcode record | yes |
| `h-vite-addons` | all add-ins (TASK 76): core + io + barcode + charts + shapes + print + pdf + languagepackages + ganttsheet + pivot + reportsheet + slicers + tablesheet, all aliased to our packages; chart, shape, slicer, pivot and print preview asserted | yes |
| `g-vite-barcode-official`, `h-vite-addons-official` | the same app code against the official trial packages | reference only |
| `e-umd-official`, `b-vite-react-official`, `c-vite-designer-official`, `c-umd-official` | the same page/app code against the official trial packages | reference only (the trial is watermarked and unlicensed) |

Every gated run asserts a sheet with values, a computed formula, a chart, painted canvas pixels, and
that the workbook the app holds is an instance of the core it imported (`GC.Spread.Sheets.findControl`
/ `instanceof`), and records a screenshot plus the exact `node_modules` path each aliased package
resolved to (`.probe/t52/screenshots/`, `.probe/t52/dropin-report.json`).

## Gating thresholds

* Data assertions are exact (`formulaValue`, `chartCount`, `sheetName`, `getText`, `ioMethods`).
* Rendering is asserted through painted pixels: the runner reads every canvas and counts pixels that
  differ from the canvas' own background colour (`canvasPaintedPixels >= 2000`; measured 155 022 …
  167 931 on the working runs, 0 when nothing painted).
* The designer UI is gated structurally, not by element counts, because our DOM and the trial DOM do
  not carry the same number of controls: ≥ 1 `.gc-designer-container`, ≥ 1 canvas, ≥ 8 of the 9
  default ribbon tab labels (`File Home Insert Page Layout Formulas Data Review View Settings`, read
  through `innerText`), ≥ 100 registered commands, and the `Bold` ribbon label returned by
  `Designer.getResources()`. Element counts (ours 55 controls / 4 canvases, trial 66 / 11) and
  command counts (ours 559, trial 972) are recorded as comparison data, not thresholds: visual
  parity of the designer belongs to `apps/compare`, which owns the pixel gates. No existing gate was
  changed or relaxed.
* Reference runs are never gated: a failing official reference is recorded (that is how GAP-52-4 was
  found) but does not fail this check.

## The two install recipes

`AGENTS.md` promises the registry alias:

```json
{ "dependencies": { "@mescius/spread-sheets": "npm:@opensheets/spread-sheets@^0.1.0" } }
```

npm refuses `npm:` aliases for local tarballs - `npm install "@mescius/x@npm:@opensheets/x@file:…tgz"`
fails with *"aliases only work for registry deps"* (measured, `.probe/t52/experiments/inst1`), so the
samples map the tarballs onto the same names with `file:` specs:

```json
{ "dependencies": { "@mescius/spread-sheets": "file:.probe/t52/tarballs/opensheets-spread-sheets-0.1.0.tgz" } }
```

Alias keys, package contents and every import path in the application code are identical in both
recipes. Once `@opensheets/*` is on a registry the alias recipe is the one an application uses; this
gate verifies everything except npm's registry lookup itself.

## Recorded gaps

* **GAP-52-1** - `packages/spread-sheets-designer` imports the core as `@opensheets/spread-sheets`.
  npm does not dedupe an aliased node against a plain-name dependency edge (measured in
  `.probe/t52/experiments/inst2`: two core copies, `Workbook` identity `false`), so a pure
  `@mescius` alias install installs `GC.Spread.Sheets.Designer` onto the *other* core copy and the
  application's own `GC` never gets it. Mitigation proven here: an alias bridge - map
  `@opensheets/spread-sheets` (plus its `dist/gc.spread.sheets.internals.js` subpath) onto
  `node_modules/@mescius/spread-sheets`, which the generated `vite.config.bridged.mjs` +
  `.bridged/core-bridge.js` do for `c-vite-designer-bridged`. Proper fix (in the designer package,
  which is owned by the concurrent designer task): import the core under the name the application
  installs, as `packages/spread-sheets-io`, `-react`, `-designer-react` and
  `-designer-resources-en` now do.
* **GAP-52-2** - the `Designer` constructor reads `globalThis.GC`; a bundler application that only
  imports the core never sets that global, and the constructor then throws
  `GC.Spread.Sheets.Workbook is required before creating a Designer`. The bridge exposes the
  aliased core as `globalThis.GC`, which is why the bridged run works.
* **GAP-52-3** - the official React wrappers ship script-tag UMDs (`dist/gc.spread.sheets.react.min.js`,
  `…​.designer.react.min.js`). Our React wrappers keep React external and publish ESM + CJS only, so
  a script-tags-only application cannot use them (bundler applications are unaffected).
* **GAP-52-4** - the official trial designer could not be booted through standalone `<script>` tags
  in this environment even with all 13 official add-on bundles served (`reading 'DR'`, then
  `GC.Spread.Sheets.Designer.Designer is not a constructor`); the official designer reference runs
  through the bundler instead (`c-vite-designer-official`, green). Our designer boots both ways.

Two trial behaviours were measured while writing the harness and are worth knowing when a sample is
debugged (`.probe/t52/probe-official-umd*.mjs`): the official trial core loaded by `<script>`
creates a workbook with **zero sheets** unless the page has a real localhost origin, and the official
trial base package has no `sheet.charts` (its `-charts` add-on, which itself needs `-shapes` first,
is required) while our core provides charts itself. Because of the first point every page here is
addressed as `http://127.0.0.1:5189/...` and answered through `page.route()` interception - no server
binds that port.

Three more trial behaviours were measured for the (h) all-add-ins reference twin (TASK 76, triage
scripts `.probe/t76/bisect*.mjs`): under **bundler** loading (the identical `main.ts` built with the
official packages via npm aliases) the official trial's `Print.WorksheetPaginator.paginate()` throws
(`…e2 is not a function`), `sheet.slicers.add(...)` registers nothing (`slicers.all()` stays empty),
and `=BC_QRCODE("Drop In")` yields no barcode record (`getValue(...).name` is null) — although the
same formula works with only the barcode add-in loaded ((g) twin, gated green) and even with all
twelve add-ins in a plain esbuild bundle: the trial's calc-function wiring depends on the bundler's
CJS interop details. The root `GC.Pivot` namespace (`SubtotalType`) exists only in the trial's
script-tag bundles, not in the bundler-resolved module, so the sample keeps the default subtotal.
These affect only the reference run (never gated); our aliased packages answer the same script with
a working slicer, paginator (2 pages across the manual row break) and barcode.
