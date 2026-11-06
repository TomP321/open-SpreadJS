# Status

M0 foundations and the M1 headless model are implemented. M1 compatibility is tested for the cases below; the remaining limits are explicit. No files have been committed.

## Delivered

- Strict TypeScript pnpm workspace, ESM/default/named and direct CommonJS exports, browser global GC, public declarations, React host, playground and comparison app.
- Independent core build: `packages/spread-sheets` no longer invokes compat generation or requires the official package to build. Public facts and declarations remain source inputs. Regeneration is an explicit root `pnpm generate:enums` command.
- Workbook: all 71 public IWorkbookOptions defaults, independent live option objects, sheet insertion/removal/count/names/activation, active and starting tab indexes, lifecycle, focus and headless invalidation.
- Worksheet: chunked sparse cells separated by sheet area, values/text/formula text and cached imports, arrays, tags, default values, binding-path and alternative-text metadata. No DOM or canvas is needed in Node; host lifecycle also runs in jsdom.
- Style/LineBorder, named styles at workbook and sheet scope, named parent chains with cycle protection, cell > row > column > default style precedence, composite fonts, and all CellRange property accessors. Whole-row/column styles stay sparse, including a million-row worksheet.
- Counts and dimensions for viewport and headers; live default sizes, visibility, resizability, frozen leading/trailing panes, outlines flags, selections and active cells. Sparse Fenwick structures provide prefix sums and offset lookup in O(log n), with no dense row/column allocation.
- Structural changes shift sparse cells, row/column styles, dimensions, dirty entries, spans and note positions. Clearing supports storage masks; copy/move handle overlapping data, styles, tags, formulas, spans, notes and whole-row/column style storage. Basic copied relative formula references are adjusted without evaluating formulas.
- All event constants declared in v19.2.5. Namespaced binding/unbinding and event data use `(event, info)`; model events carry public argument fields and cancellation where supported. Nested event suspension drops notifications without replay.
- Nested paint and calculation suspension; invalidations coalesce across workbook/sheet scopes, and calculator notifications coalesce through a pluggable internal ICalcEngine interface. Paint invalidation is headless; M2 will attach rendering.
- CommandManager registration/execution/shortcut storage, undo/redo stacks and limits, redo invalidation, allowUndo support and undoable built-in editCell commands. Direct model writes do not create undo entries.
- Dirty-cell tracking and selective clearing, custom names/NameInfo, and note text storage through Comment/CommentManager. Cell-type and validator objects are storage placeholders; their rendering/validation modules remain explicit fallbacks.
- GeneralFormatter format/parse/formatString and culture registration/lookup. Excel sections, conditions, colors, dates/times, elapsed time, percentages, scientific notation, fractions, literal text, padding and text substitution are covered by a 64-case table verified against the trial. SSF is the open-source number-format dependency; our adapters handle sign/rounding/exponent compatibility, colors, parsing, culture separators and date names. en-US includes its predefined formats; other cultures can be registered.
- Three official 19.2.5 ssjson fixtures, produced through Playwright public API calls, round-trip with zero differing paths. A shared scenario independently executed on ours also produces identical JSON after loading the same blank metadata seed. Import preserves cached formula results, dates, notes, names, named styles, selections and header data. ignoreStyle/ignoreFormula work in both directions. Unknown advanced JSON sections survive as opaque data.
- Requested convenience aliases rowCount/columnCount, activeSheetIndex, tabColor, isDirty and getSpan are available at runtime and in internal model types. Published declarations retain the exact v19 surface: adding these methods there breaks structural compatibility through callback parameter types and React props. Use the official get/set names in typed package consumers.

## Partial and pending

- Canvas drawing, measurement, viewport DOM, interaction, keyboard execution of shortcuts, clipboard commands, tabs and themes remain M2. autoFitRow/autoFitColumn explicitly throw NotImplemented and are excluded from implemented coverage counts. Dynamic dimension strings also require future layout support and currently throw.
- Formula evaluation, dependency graphs, structural reference rewriting and custom-name expression parsing remain M3. Formula getters store text without a leading equals sign. Cached reference values are retained on import; newly assigned formulas have no result until a calculator supplies one. Basic copy reference adjustment is not a complete formula parser.
- Formatting is verified by the named table, not every possible Excel format. Unsupported SSF syntax throws NotImplemented. Non-Gregorian calendars, DBNum forms, specialized localized formats and arbitrary custom-format parsing need further conformance work. FormatMode is absent from both the v19.2.5 public declarations and core trial export; no guessed legacy enum was added.
- Advanced serialization transformations (header/frozen conversion, saveAsView, R1C1 export, incremental loading) explicitly throw. Binding sources, rich-text ValueType variants, calculation options beyond model batching and advanced copied objects remain outside the tested M1 behavior. Advanced JSON pass-through is not implementation of those modules.
- The event comparison verifies every constant available in the core trial. Nine declared constants belong to absent add-ons: RowOperation and eight TableSheet filter/sort events. Ours exports those declared names too. This is a recorded reference-runtime exception, not a missing API surface.
- Comments support text and position storage. Comment UI, appearance, threaded comments, validation behavior, outlines themselves, tables, charts and other advanced modules remain M4+ fallbacks.
- The React host remains at M0 support: worksheet names, workbookInitialized, cleanup and host styling. Full event binding, declarative column configuration and dynamic worksheet configuration remain M2.
- Public declarations include unsupported members for source compatibility; declarations and numeric API coverage do not establish behavioral parity. Unsupported members throw NotImplemented. See [API_COVERAGE.md](API_COVERAGE.md) for the generated inventory and limits.

## Validation

Verified successfully on 2026-11-06:

- `pnpm -r build` — passed (Vite reports bundle-size warnings).
- `pnpm -r typecheck && pnpm -r test` — passed; 522 unit tests, including 261 in the core.
- `pnpm lint && pnpm coverage:api` — passed; 15/207 constructors, 249/1,796 methods/functions, 252/252 enums and 1,369/1,369 declarations.
- `pnpm test:compare` — all six tests passed: original three scenarios, M1 independent JSON comparison, 64-case Excel formatting table, public defaults and available event constants.

Reference fixtures and their regeneration instructions are in `packages/spread-sheets/test/fixtures/README.md`. Browser screenshots and observations are ignored outputs in `test-results/compare/`. Vendor implementation JavaScript and styles were never inspected or copied; the browser loads them only as opaque reference assets. Only public declarations, documentation and public runtime observations inform implementation.
