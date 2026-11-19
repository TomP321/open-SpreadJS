# Changelog

All notable changes to the OpenSheets packages. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); this project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## 0.1.0 — 2026-11-18

First release. Each package is a drop-in replacement for its `@mescius/spread-sheets*`
19.2.5 counterpart through npm aliases (see README), with the same public `GC` API,
export shapes and stylesheet file names.

### Added

- `@opensheets/spread-sheets` — framework-agnostic core: Workbook/Worksheet model with
  chunked sparse cell storage and Fenwick row/column prefix sums (1,000,000 x 16,384
  virtual sheets), canvas viewport renderer with rAF-coalesced dirty-region repaint,
  full interaction suite (selection, editing, autofill, drag, tabs, resize),
  Undo/redo command manager, named styles and the complete CellRange API,
  the SSF-backed number-format engine, a formula engine with an interval-indexed
  dependency graph and 494 built-in functions (incremental recalculation, dynamic
  arrays, iterative calculation), tables with the 60 built-in themes, sorting and
  filtering, conditional formatting (all 20 icon sets, data bars, colour scales),
  data validation, 17 cell types, comments (legacy + threaded API), hyperlinks,
  outlines, shapes, 24 sparkline types, barcodes (scanner-verified EAN/UPC/Data
  Matrix/QR/…), charts (12 standard families + DataCharts, trial-exact chartSpace
  serialization), pivot tables with panel/slicer/timeline integration, GC.Data
  TableView (partial), print/PDF (`Workbook.savePDF` with embedded TrueType subsets,
  partial), and ESM/CJS/UMD builds plus `styles/gc.spread.sheets.css` and the seven
  official theme file names (our own CSS).
- `@opensheets/spread-sheets-react` — `<SpreadSheets>`, `<Worksheet>`, `<Column>` with
  the official wrapper props; React hosts the canvas only.
- `@opensheets/spread-sheets-io` — optional IO plugin: XLSX/CSV/SSJSON client-side
  import/export (independent OOXML reader/writer, cross-verified against the trial),
  password-protected XLSX basics. SJS `open`/`save` and encrypted OOXML report an
  explicit unsupported callback.
- `@opensheets/spread-sheets-designer` — the Designer component: ribbon (Home/Insert/
  Page Layout/Formulas/Data/Review/View/File + contextual tabs), formula bar, status
  bar, property/outline/format panels, galleries, dialogs (Format Cells, Data
  Validation, Sort, Find & Replace, comments…), context menus, clipboard paste modes,
  config/command/template customization (`DefaultConfig`, `CommandNames`,
  `TemplateNames`, `findControl`), three theme CSS files.
- `@opensheets/spread-sheets-designer-react` — `<Designer>` React wrapper with the
  official props.
- `@opensheets/spread-sheets-designer-resources-en` — English UI resources.
- Tooling: `pnpm coverage:api` (API-surface report against the official declarations:
  207/207 classes, 1796/1796 methods, 252/252 enums, 1369/1369 declarations),
  `pnpm dropin:check` (installs packed tarballs under the `@mescius` aliases and runs
  five sample apps), `apps/compare` + `apps/designer-compare` black-box pixel/behaviour
  gates against the official trial, the 1373-case formula oracle.

### Known gaps in 0.1.0

- Unimplemented declared members throw/warn `NotImplemented` instead of pretending to work;
  they are listed in `docs/API_COVERAGE.md`.
- IO: no SJS protocol, no encrypted-OOXML interoperability, partial theme/advanced-feature
  mapping (docs/STATUS.md, M7a).
- Designer paired visual gates are green at DPR-1; 21 adaptive DPR-2 ribbon variants keep a
  documented sub-2% glyph-coverage-WEIGHT residual that A/B evidence shows is not reachable
  from our code (docs/STATUS.md, TASK 57, `.probe/t57/dpr2-evidence.md`).
- Print preview UI, GC.Data advanced filters/window formulas, TableSheet/Gantt/ReportSheet
  remain partial; see docs/STATUS.md per module.

### Clean-room

Implemented from the official public type declarations and public documentation only; the
official trial was used exclusively as a black-box reference. No official implementation or
stylesheet content was read or copied, and all icons/glyphs are original vector drawings.
