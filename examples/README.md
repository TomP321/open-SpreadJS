# OpenSheets examples

Minimal runnable applications showing the drop-in switch from SpreadJS 19.x —
each imports only the official `@mescius/*` names; OpenSheets is installed
underneath via npm aliases ([docs/MIGRATION.md](../docs/MIGRATION.md)).

| Example | Shape | Shows |
| --- | --- | --- |
| [`vite-core`](vite-core) | plain Vite + TypeScript | `new GC.Spread.Sheets.Workbook(host)`, formulas, formats, styles, events |
| [`vite-react`](vite-react) | React + `@mescius/spread-sheets-react` | `<SpreadSheets><Worksheet dataSource><Column/>` official props |
| [`vite-designer`](vite-designer) | `@mescius/spread-sheets-designer` | the full Designer with seeded workbook + English resources |
| [`script-tag-umd`](script-tag-umd) | `<script>` tags, no bundler | `window.GC`, IO add-in (XLSX import/export), chart |

Inside this workspace the aliased names are `link:` specs onto the workspace
packages (identical keys and import paths to the registry `npm:` recipe). Each
example additionally lists the same packages as `workspace:*` **devDependencies**
under their real `@opensheets/…` names — import paths never use them; they only
tell pnpm to build the packages before the examples.

```sh
pnpm install          # at the repo root, once
pnpm -r build         # builds the packages and these examples
```

Each example README carries the exact registry alias block to copy into a real
application.
