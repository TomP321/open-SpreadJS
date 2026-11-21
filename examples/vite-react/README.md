# example: vite-react — OpenSheets in a React app (official wrapper props)

React application using `<SpreadSheets>`, `<Worksheet>` and `<Column>` from
`@mescius/spread-sheets-react` — the exact props of the official wrapper
(`gc.spread.sheets.react.d.ts` contract). Nothing in the source mentions
OpenSheets; the alias does the switch — see
[docs/MIGRATION.md](../../docs/MIGRATION.md).

## In your own app (registry install)

```json
{
  "dependencies": {
    "@mescius/spread-sheets": "npm:@opensheets/spread-sheets@^0.1.0",
    "@mescius/spread-sheets-react": "npm:@opensheets/spread-sheets-react@^0.1.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  }
}
```

```sh
npm install && npm run build
```

## In this workspace (offline)

```sh
pnpm install                            # repo root
pnpm --filter opensheets-example-vite-react build
```

Both aliased names are `link:` specs onto the workspace packages, so the React
wrapper and your code resolve **one** core instance (`instanceof` /
`findControl` identity holds).

## What it demonstrates

A `dataSource`-bound `<Worksheet>` with `<Column dataField headerText
formatter width>` — the exact official `ColumnProp` — plus
`workbookInitialized` / `cellClick` handlers. Cell edits never re-render React.
Script-tag (`<script>` UMD) usage of the same wrapper is in
`examples/script-tag-umd`.
