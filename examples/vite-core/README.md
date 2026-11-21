# example: vite-core — OpenSheets core in a plain Vite app

Minimal **non-React** SpreadJS application. The code imports only the official
`@mescius/*` names; OpenSheets is installed underneath through the npm alias —
see [docs/MIGRATION.md](../../docs/MIGRATION.md).

## In your own app (registry install)

```json
{
  "dependencies": {
    "@mescius/spread-sheets": "npm:@opensheets/spread-sheets@^0.1.0"
  }
}
```

```sh
npm install
npm run dev      # vite dev server
npm run build    # production bundle in dist/
```

## In this workspace (offline)

This example is a pnpm workspace member whose dependency is a `link:` spec
onto the workspace package — the alias key and every import path are identical
to the registry recipe, the right-hand side is local:

```json
{ "@mescius/spread-sheets": "link:../../packages/spread-sheets" }
```

```sh
pnpm install                         # at the repo root (links node_modules)
pnpm -r build                        # the packages themselves must be built once
pnpm --filter opensheets-example-vite-core build
```

## What it demonstrates

`new GC.Spread.Sheets.Workbook(host)` through the aliased name, the base +
excel2013white theme CSS imports, values/formulas (`SUM`, `SUMPRODUCT`),
number formatter, styles, selection and the `SelectionChanged` event.
