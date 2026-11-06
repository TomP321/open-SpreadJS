# Roadmap

## M0 — Foundations
- pnpm monorepo, build (tsup/vite lib: ESM + CJS + UMD + .d.ts), lint, vitest, playwright
- `packages/compat`: official 19.2.5 as devDependency; API inventory script that extracts
  every namespace/class/member from the official .d.ts into `api-inventory.json`;
  coverage report comparing against our exports
- `apps/compare` page rendering official trial and ours side by side

## M1 — Core model (no UI)
- GC.Spread.Sheets.Workbook (options, sheets, events, suspendPaint, commandManager, undoManager)
- Worksheet: values, formulas, text, tags, styles, spans, row/col count/size/visibility,
  frozen rows/cols, defaults, names, comments stub
- CellRange, Style, NamedStyle, LineBorder, SheetArea, events (GC.Spread.Sheets.Events)
- Formatter (GC.Spread.Formatter.GeneralFormatter) — Excel number formats
- toJSON / fromJSON compatible with official ssjson schema

## M2 — Rendering & interaction
- Canvas viewport: headers, gridlines, cell text/format/alignment/wrap/borders/backgrounds,
  merged cells, frozen panes, scrollbars, tab strip, zoom, HiDPI
- Selection (mouse/keyboard, multi-range), active cell, editing (CellTypes.Text editor),
  keyboard map identical to SpreadJS defaults, resize rows/cols, clipboard, drag-fill, undo/redo
- React wrapper with full prop/event parity

## M3 — Calc engine
- Parser, dependency graph, incremental recalc, A1/R1C1, names, ~500 Excel functions,
  dynamic arrays, CalcEngine/Functions custom function API

## M4+ — Advanced modules
Cell types, conditional formatting, data validation, tables, filter/sort, outlines,
comments, sparklines, shapes/floating objects, charts, Excel IO (xlsx), print/PDF,
pivot tables, slicers, TableSheet, Designer.
