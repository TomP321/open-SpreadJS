# OpenSheets — clean-room, drop-in compatible reimplementation of SpreadJS

Goal: a spreadsheet component that is a **drop-in replacement** for
`@mescius/spread-sheets` (+ `@mescius/spread-sheets-react`) v19.x:
same public API (`GC.Spread.Sheets.*`), same install/usage, same runtime behaviour
and same look & feel — but our own code, written in TypeScript, very fast.

Apps switch to us without code changes via npm aliases:
```json
"@mescius/spread-sheets": "npm:@opensheets/spread-sheets@^0.1.0",
"@mescius/spread-sheets-react": "npm:@opensheets/spread-sheets-react@^0.1.0"
```

## Clean-room rules (MANDATORY)
- The API contract is the **public type definitions** of `@mescius/spread-sheets@19.2.5`
  (installed as devDependency in `packages/compat`, file
  `node_modules/@mescius/spread-sheets/dist/gc.spread.sheets.d.ts`) and the public online
  documentation (https://developer.mescius.com/spreadjs/api/ and /docs/).
- **NEVER open, read, grep, deobfuscate or copy** `*.min.js` files or the `styles/*.css`
  files of the official packages. Never copy their JSDoc comments verbatim. Write your own.
- Visual/behavioural reference = running the official trial package in the `apps/compare`
  page and comparing screenshots/behaviour (black-box only).
- Never commit any file from the official packages.
- **Never embed pixels/bitmaps captured from the official rendering** (screenshots, canvas readbacks,
  sprites, base64 images, RGB arrays) in our source. Every glyph/icon/arrow is drawn by our own
  code (paths, shapes, gradients). Observing screenshots to measure positions, sizes and colours is fine;
  copying the raster is not.
- Data obtained through the public API (e.g. theme colours read from `toJSON()`) is fine.

## Test integrity (MANDATORY)
- Never make a gate pass by changing what it measures: no filler content added to scenarios to dilute
  pixel ratios, no masking of regions that differ, no loosening thresholds, no deleting/weakening tests.
  Scenario content must exist only to exercise the feature under test.
- Gate or threshold changes are made only by the supervisor. If a gate cannot be met honestly,
  stop and report the remaining diff with evidence instead.

## Architecture
- `packages/spread-sheets` — core, framework-agnostic TypeScript. Canvas rendering.
  Exposes `GC` namespace: ESM default/named, CommonJS `module.exports = GC`, and UMD
  global `window.GC`. Also `styles/gc.spread.sheets.css` + theme CSS files with the same
  file names as the official ones (our own CSS).
- `packages/spread-sheets-react` — `<SpreadSheets>`, `<Worksheet>`, `<Column>` with the
  exact props of the official wrapper (`gc.spread.sheets.react.d.ts`).
- `packages/compat` — type-level conformance tests (our types vs official .d.ts) and the
  API coverage report.
- `apps/playground` — Vite + React dev app.
- `apps/compare` — side-by-side: official trial vs ours, same script, for visual diffing.

## Performance requirements
- Canvas renderer, only visible viewport drawn; dirty-region repaint batched in rAF.
- Sparse storage (row-major Map/chunked arrays), never O(rows*cols) allocation.
  Default sheet is 200 rows x 20 cols but must handle 1,000,000 x 16,384 virtually.
- Prefix-sum / Fenwick structures for row heights / column widths (O(log n) hit-testing).
- `suspendPaint/resumePaint`, `suspendEvent/resumeEvent`, `suspendCalcService/resumeCalcService`
  must actually batch work.
- Formula engine: parse once to AST, dependency graph, incremental recalculation.
- No React re-renders on cell changes: React only hosts the canvas and DOM overlays.

## Engineering rules
- TypeScript strict. pnpm workspace. Vitest for unit tests, Playwright for e2e/visual.
- Every public behaviour gets a unit test. Run `pnpm -r typecheck && pnpm -r test` before
  finishing a task; all must pass.
- Keep `docs/STATUS.md` updated: what's done, what's partial, known gaps.
- Do not stub silently: unimplemented API members must exist (for type compatibility)
  and throw/warn `NotImplemented` in dev, recorded in the coverage report.

## Designer-specific clean-room rules
- Contract: the public d.ts of `@mescius/spread-sheets-designer@19.2.5` and `-designer-react` (devDependencies of apps/designer-compare)
  plus the public docs (https://developer.mescius.com/spreadjs/docs/spreadjs-designer-component/ and the API reference).
- Reading runtime STRUCTURE through the public API is allowed and required for compatibility: config/ribbon ids, nesting, command names,
  template names (users customise the designer through these). Do NOT serialise official dialog templates or the default config wholesale
  into our source: write our own templates/config that reproduce the same structure, ids and visible result.
- Icons: never copy official icon images/SVG/CSS sprites (no screenshots crops either). Use an open-source MIT icon set (e.g. @fluentui/svg-icons)
  or draw our own SVGs, matching size and meaning.
- UI strings: `@mescius/spread-sheets-designer-resources-*` are minified files you must NOT read. Transcribe visible labels from the running UI.
- Runtime DOM of the official designer may be inspected (class names, geometry, computed styles) as black-box observation.
