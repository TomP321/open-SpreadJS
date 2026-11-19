# OpenSheets

A clean-room, drop-in compatible reimplementation of the
[SpreadJS](https://developer.mescius.com/spreadjs) 19.2.5 public API
(`GC.Spread.Sheets.*`) — our own TypeScript code, canvas rendering, MIT-licensed.

An application written against `@mescius/spread-sheets` switches to OpenSheets by
changing **only its install aliases** — no code changes:

```json
{
  "dependencies": {
    "@mescius/spread-sheets": "npm:@opensheets/spread-sheets@^0.1.0",
    "@mescius/spread-sheets-react": "npm:@opensheets/spread-sheets-react@^0.1.0",
    "@mescius/spread-sheets-io": "npm:@opensheets/spread-sheets-io@^0.1.0",
    "@mescius/spread-sheets-designer": "npm:@opensheets/spread-sheets-designer@^0.1.0",
    "@mescius/spread-sheets-designer-react": "npm:@opensheets/spread-sheets-designer-react@^0.1.0",
    "@mescius/spread-sheets-designer-resources-en": "npm:@opensheets/spread-sheets-designer-resources-en@^0.1.0"
  }
}
```

Every package installs under the official name through the `npm:` alias, keeps the same
`GC` namespace (ESM default/named exports, CommonJS `module.exports = GC`, UMD global
`window.GC`), the same stylesheet file names, and the same runtime behaviour wherever it is
implemented (see the status table below). This recipe is verified end-to-end from packed
tarballs by `pnpm dropin:check` (apps/dropin-check).

Requires Node.js 20.19+ and pnpm 10.

## Using the core

```ts
import GC from '@opensheets/spread-sheets';
import '@opensheets/spread-sheets/styles/gc.spread.sheets.excel2013white.css';

const workbook = new GC.Spread.Sheets.Workbook(document.getElementById('sheet')!);
const sheet = workbook.getActiveSheet();
sheet.setValue(0, 0, 'Total');
sheet.setValue(0, 1, '=1+2');
```

The core is framework-agnostic (pure canvas rendering; it also runs headless in Node for
data work). Sparse row/column storage with Fenwick prefix sums keeps a 1,000,000 x 16,384
virtual sheet cheap to open, scroll and edit — see [docs/PERFORMANCE.md](docs/PERFORMANCE.md).

## React

```tsx
import { SpreadSheets, Worksheet, Column } from '@opensheets/spread-sheets-react';
import '@opensheets/spread-sheets/styles/gc.spread.sheets.excel2013white.css';

export default () => (
  <SpreadSheets>
    <Worksheet name="Data">
      <Column index={0} width={120} />
    </Worksheet>
  </SpreadSheets>
);
```

`<SpreadSheets>`, `<Worksheet>` and `<Column>` accept the same props as the official
wrapper (`gc.spread.sheets.react.d.ts` contract). React only hosts the canvas and DOM
overlays; cell edits never re-render React.

## Designer

With the aliases above, application code keeps importing the `@mescius/...` names:

```ts
import GC from '@mescius/spread-sheets';
import '@mescius/spread-sheets/styles/gc.spread.sheets.css';
import '@mescius/spread-sheets/styles/gc.spread.sheets.excel2013white.css';
import { Designer } from '@mescius/spread-sheets-designer';
import '@mescius/spread-sheets-designer-resources-en';
import '@mescius/spread-sheets-designer/styles/gc.spread.sheets.designer.min.css';

new Designer(document.getElementById('designer-host')!, undefined, { /* custom config */ });
```

The Designer component (ribbon, formula bar, status bar, property panels, dialogs, context
menus, contextual tabs) follows the public designer API and the same config/command/customization
structure. React usage: `@opensheets/spread-sheets-designer-react` provides the `<Designer>` React
component with the official wrapper props (`config`, `initData`, `styleInfo`,
`designerInitialized`, ...). UI strings come from
`@opensheets/spread-sheets-designer-resources-en`. See [docs/DESIGNER.md](docs/DESIGNER.md).

## Status

API surface (generated from the official public declarations, `pnpm coverage:api`):
**classes 207/207, methods/functions 1796/1796, enums 252/252, declarations 1369/1369 (100%)**.
Declaration presence is not behavioral parity — the table below states what is *behaviourally*
verified. Details and evidence: [docs/STATUS.md](docs/STATUS.md),
[docs/API_COVERAGE.md](docs/API_COVERAGE.md), [docs/DESIGNER.md](docs/DESIGNER.md),
[docs/PERFORMANCE.md](docs/PERFORMANCE.md).

| Module | Status | Notes |
| --- | --- | --- |
| Workbook/Worksheet model, sparse storage | done | chunked sparse cells, Fenwick sizes, events, undo |
| Canvas rendering + interaction | done | viewport-only paint, rAF batching, edit, drag/fill, tabs |
| Formula engine (494 built-ins) | done | dependency graph, incremental recalc; 1373/1373 differential oracle cases |
| Styles & number formats | done | named styles, all CellRange accessors; 64-case format table verified vs trial |
| Tables, sort/filter, conditional formatting | done | 60 built-in table styles, all 20 icon sets vector-drawn |
| Data validation, cell types, comments, hyperlinks, outlines | done | legacy + threaded comments partial |
| Charts (12 families + DataCharts) | done | trial-byte-exact chartSpace JSON, canvas painter |
| Pivot tables (+panel, slicers, timeline) | done | engine + panel; GETPIVOTDATA, grouping, views |
| Sparklines (24 types), shapes, barcodes | done | EAN/UPC payloads decode with standard readers |
| Print / PDF | partial | `savePDF` with embedded TrueType subsets; print preview UI partial |
| IO plugin (XLSX/CSV/SSJSON) | partial | bounded XLSX read/write both directions vs trial; SJS + encryption unsupported |
| GC.Data (`TableView`), TableSheet, Gantt, ReportSheet | partial | see STATUS.md sections per module |
| Designer component | done (known deviations) | paired pixel gates vs the official Designer green except the documented DPR-2 text-coverage residuals (STATUS.md, TASK 57) |
| React / Designer React wrappers | done | same props as the official wrappers |

Unsupported declared API members exist for type compatibility and throw/warn
`NotImplemented` in dev builds; they are listed in the coverage report — nothing is silently stubbed.

## Development

```sh
pnpm install
pnpm -r build && pnpm -r typecheck && pnpm -r test && pnpm lint
pnpm coverage:api      # API surface report
pnpm dropin:check -- --pack   # install-from-tarball drop-in verification
pnpm compare           # playground/compare apps (see apps/*/README)
```

`apps/compare` and `apps/designer-compare` render the official trial package side by side
with ours in the same browser for black-box pixel/behaviour diffing; the Playwright specs in
those apps are the visual parity gates.

## Clean-room

The implementation was written from the official public **type declarations** and public
documentation only. Official implementation bundles and stylesheets were never read; the
official trial was used purely as a black-box reference (screenshots and public API output).
All icons and glyphs are our own vector drawings. See [AGENTS.md](AGENTS.md).

## License

[MIT](LICENSE) — see the `LICENSE.md` shipped with each package. SpreadJS is a trademark of
GrapeCity International dba MESCIUS; OpenSheets is an independent implementation and is not
affiliated with or endorsed by MESCIUS.
