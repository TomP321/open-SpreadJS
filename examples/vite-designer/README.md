# example: vite-designer — the SpreadJS Designer in a Vite app

Full Designer component (ribbon, formula bar, status bar, property panels,
dialogs, context menus) installed under the official names through the npm
alias — the application code is the official designer recipe, unchanged. See
[docs/MIGRATION.md](../../docs/MIGRATION.md).

## In your own app (registry install)

```json
{
  "dependencies": {
    "@mescius/spread-sheets": "npm:@opensheets/spread-sheets@^0.1.0",
    "@mescius/spread-sheets-designer": "npm:@opensheets/spread-sheets-designer@^0.1.0",
    "@mescius/spread-sheets-designer-resources-en": "npm:@opensheets/spread-sheets-designer-resources-en@^0.1.0"
  }
}
```

```sh
npm install && npm run build
```

## In this workspace (offline)

```sh
pnpm install                            # repo root
pnpm --filter opensheets-example-vite-designer build
```

All three aliased names are `link:` specs onto the workspace packages. The
Designer imports the core as `@mescius/spread-sheets` — the same name your app
installs — so npm/pnpm resolves **one** core copy and the Designer hosts the
workbooks your `GC` created (no bridge configuration needed; the old
GAP-52-1/GAP-52-2 workarounds are obsolete).

## What it demonstrates

`new Designer(host, config, workbook)` bound to an existing **Workbook instance**
(the official bind pattern — the Designer moves the workbook's host into its
sheet area), the English resources side-effect import, the
designer stylesheet, `designer.getWorkbook()` / `designer.activeRibbonTab()` /
`findControl(host)` and `destroy()` on unload. The React wrapper
(`@mescius/spread-sheets-designer-react` `<Designer config initData
designerInitialized/>`) works the same way.
