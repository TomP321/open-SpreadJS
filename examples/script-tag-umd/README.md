# example: script-tag-umd — no bundler, just `<script>` tags

SpreadJS usage exactly as the official script-tag docs: the `*.all.min.js`
bundles read the `window.GC` global, no `import` statements anywhere. OpenSheets
drops in under the same package names and the same bundle file names — see
[docs/MIGRATION.md](../../docs/MIGRATION.md).

## In your own app (registry install)

```json
{
  "dependencies": {
    "@mescius/spread-sheets": "npm:@opensheets/spread-sheets@^0.1.0",
    "@mescius/spread-sheets-io": "npm:@opensheets/spread-sheets-io@^0.1.0"
  }
}
```

```html
<link rel="stylesheet" href="./node_modules/@mescius/spread-sheets/styles/gc.spread.sheets.css" />
<link rel="stylesheet" href="./node_modules/@mescius/spread-sheets/styles/gc.spread.sheets.excel2013white.css" />
<script src="./node_modules/@mescius/spread-sheets/dist/gc.spread.sheets.all.min.js"></script>
<script src="./node_modules/@mescius/spread-sheets-io/dist/gc.spread.sheets.io.min.js"></script>
<script>/* your code against window.GC */</script>
```

## In this workspace (offline)

```sh
pnpm install                    # repo root (links node_modules)
npm run build                   # assembles dist/: index.html + app.js + vendored bundles
# then open dist/index.html (serve it, e.g. `npx serve dist`)
```

`npm run build` (`build.mjs`) copies the exact bundles/stylesheets referenced
from `index.html` into `dist/` so the result is self-contained — no bundler,
no network. `npm run typecheck` only checks that every referenced file exists.

## What it demonstrates

`window.GC` from `gc.spread.sheets.all.min.js`; the IO add-on (`…io.min.js`)
patching `Workbook.prototype.import/export` afterwards; a chart from the core;
`workbook.export(cb, cb, { fileType: GC.Spread.Sheets.FileType.excel })`
downloading an .xlsx and an import `<input type=file>` reading it back.

Script-tag React is also supported (same official file names):
`dist/gc.spread.sheets.react.min.js` (React/ReactDOM/GC globals →
`GC.Spread.Sheets.React`). The official 19.2.5 wrapper's global branch throws,
so this path works **only** on OpenSheets (docs/STATUS.md, GAP-52-3).
