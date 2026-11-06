# Status

M0/M1 and the Part A storage fix are implemented. M2 now has a working canvas viewport and interaction layer, with the bounded visual and behavioral coverage described below. Full v19 behavioral parity remains incomplete. No files have been committed.

## Delivered

- Strict TypeScript pnpm workspace, ESM/default/named and direct CommonJS exports, browser global GC, public declarations, React host, playground and comparison app.
- Independent core build: `packages/spread-sheets` no longer invokes compat generation or requires the official package to build. Public facts and declarations remain source inputs. Regeneration is an explicit root `pnpm generate:enums` command.
- Workbook: all 71 public IWorkbookOptions defaults, independent live option objects, sheet insertion/removal/count/names/activation, active and starting tab indexes, lifecycle, focus and headless invalidation.
- Worksheet: chunked sparse cells separated by sheet area, values/text/formula text and cached imports, arrays, tags, default values, binding-path and alternative-text metadata. No DOM or canvas is needed in Node; host lifecycle also runs in jsdom.
- Style/LineBorder, named styles at workbook and sheet scope, named parent chains with cycle protection, cell > row > column > default style precedence, composite fonts, and all CellRange property accessors. Whole-row/column styles stay sparse, including a million-row worksheet.
- Counts and dimensions for viewport and headers; live default sizes, visibility, resizability, frozen leading/trailing panes, outlines flags, selections and active cells. Sparse Fenwick structures provide prefix sums and offset lookup in O(log n), with no dense row/column allocation.
- Structural changes shift sparse cells, row/column styles, dimensions, dirty entries, spans and note positions. Clearing supports storage masks; copy/move handle overlapping data, styles, tags, formulas, spans, notes and whole-row/column style storage. Basic copied relative formula references are adjusted without evaluating formulas.
- All event constants declared in v19.2.5. Namespaced binding/unbinding and event data use `(event, info)`; model events carry public argument fields and cancellation where supported. Nested event suspension drops notifications without replay.
- Nested paint and calculation suspension; invalidations coalesce across workbook/sheet scopes, and calculator notifications coalesce through a pluggable internal ICalcEngine interface. Headless use remains supported; a browser host attaches the rAF renderer.
- CommandManager registration/execution/shortcut storage, undo/redo stacks and limits, redo invalidation, allowUndo support and undoable built-in editCell commands. Direct model writes do not create undo entries.
- Dirty-cell tracking and selective clearing, custom names/NameInfo, and note text storage through Comment/CommentManager. Cell-type and validator objects are storage placeholders; their rendering/validation modules remain explicit fallbacks.
- GeneralFormatter format/parse/formatString and culture registration/lookup. Excel sections, conditions, colors, dates/times, elapsed time, percentages, scientific notation, fractions, literal text, padding and text substitution are covered by a 64-case table verified against the trial. SSF is the open-source number-format dependency; our adapters handle sign/rounding/exponent compatibility, colors, parsing, culture separators and date names. en-US includes its predefined formats; other cultures can be registered.
- Three official 19.2.5 ssjson fixtures, produced through Playwright public API calls, round-trip with zero differing paths. A shared scenario independently executed on ours also produces identical JSON after loading the same blank metadata seed. Import preserves cached formula results, dates, notes, names, named styles, selections and header data. ignoreStyle/ignoreFormula work in both directions. Unknown advanced JSON sections survive as opaque data.
- Requested convenience aliases rowCount/columnCount, activeSheetIndex, tabColor, isDirty and getSpan are available at runtime and in internal model types. Published declarations retain the exact v19 surface: adding these methods there breaks structural compatibility through callback parameter types and React props. Use the official get/set names in typed package consumers.
- Part A: numeric values and dirty before/after values use lazily allocated column chunks containing Float64Array payloads and byte tags. Non-number values and cell metadata remain sparse. No object is retained for each plain numeric cell; serialization materializes records only while exporting. NaN, infinities, negative zero, empty values, metadata, shifts, clearing and fixtures are tested. Calculator notifications are skipped when no engine is attached. Vitest benchmarks cover 200k writes/reads, sparse height changes and offset lookup, and 100k-cell JSON export; isolated CJS tests guard retained heap plus buffers.
- M2 viewport: HiDPI cell/selection canvases, visible-axis iteration, dirty-row clipping (including old/new text overflow), rAF coalescing, resize observation, paint suspension and disposal. Headers, gridlines, values/formatters, fonts, alignment/General, backgrounds, word wrap, measured shrink, indent, overflow, borders, spans, hidden dimensions, leading/trailing frozen panes and zoom are drawn. Live workbook/sheet option changes invalidate layout.
- Scroll controls, pixel wheel/trackpad movement, basic touch panning, scrollbarShowMax/MaxAlign, Ctrl+wheel zoom, visible viewport queries and showCell/showRow/showColumn. Tabs support activation, navigation, new sheets, overflow list, tab colors, double-click rename, pointer reorder and ratio splitter.
- Interaction: pointer selection/drag, shift extension, Ctrl multi-range, row/column/corner selection, selection policies/units, arrows, Tab/Enter, Home/End, Ctrl navigation/data edges, PageUp/Down, Ctrl+PageUp/Down sheet navigation and command-manager shortcut overrides. Default browser commands use public navigation/selection command names.
- Editing: type/F2/double-click textarea with matching font/zoom and measured expansion, Enter/Tab commit, Escape cancel, Alt+Enter newline, lifecycle notifications and undoable editCell. User edits, undo and redo emit ValueChanged; API setValue does not. EditStarted is an additional string notification requested for this milestone; v19's declared Events class has no such constant.
- Row/column header resize, dimension events and measured browser auto-fit. TSV quoting/multiline fields and HTML clipboard data, paste notifications, marching copy indicator, same-sheet copy/cut with formulas/styles, numeric/date series and copy fill, selection drag-drop, and sparse undo snapshots. Whole-sheet Delete visits stored cells rather than allocating a dense array. Basic context menus expose reference labels; unsupported advanced menu actions throw explicitly.
- React: workbook option/event props, incremental worksheet/column configuration, keyed sheet reorder, source fields and array data binding, prop removal resets, initializer/cleanup and host styling. Cell mutations remain outside React rendering. Unsupported underlying theme/outline modules remain explicit errors.

## Partial and pending

- M2 is bounded by the checked scenarios. Border dash/double rasterization, font fitting/wrapping, some header subpixels, and tab/navigation geometry still differ slightly. Alternate theme filenames are supplied as aliases to the independently authored white theme; distinct dark/colorful palettes are pending. Background images remain deferred as requested. Multi-header styling, right-to-left layout, complex frozen/merged intersections, full touch gestures and accessibility need broader conformance work.
- Context-menu labels and basic commands are present, but the trial's paste icon group, advanced submenus, dialogs and full menu customization are incomplete. Filter/sort/comment UI actions throw NotImplemented because their modules remain outside this milestone. Native clipboard permission flows, HTML formatting from other applications, cross-sheet rich clipboard data, complete tab/selection traversal edge cases and all SpreadJS shortcut/action exports require more work. Resize tips and scroll tips currently use browser tooltips. Drag previews, smart tags, data validation and protected-cell exceptions are incomplete.
- React routes declared event callbacks and supported option props, but cannot implement absent theme or outline modules: currentTheme and rowOutlineInfo/columnOutlineInfo still throw explicitly. Array records are supported as dataSource; CellBindingSource/DataView sources and nested binding paths remain unsupported. Declared cell-type props can store metadata, while custom editor/rendering modules remain M4+ fallbacks.
- Formula evaluation, dependency graphs, structural reference rewriting and custom-name expression parsing remain M3. Formula getters store text without a leading equals sign. Cached reference values are retained on import; newly assigned formulas have no result until a calculator supplies one. Basic copy reference adjustment is not a complete formula parser.
- Formatting is verified by the named table, not every possible Excel format. Unsupported SSF syntax throws NotImplemented. Non-Gregorian calendars, DBNum forms, specialized localized formats and arbitrary custom-format parsing need further conformance work. FormatMode is absent from both the v19.2.5 public declarations and core trial export; no guessed legacy enum was added.
- Advanced serialization transformations (header/frozen conversion, saveAsView, R1C1 export, incremental loading) explicitly throw. Binding sources beyond array records, rich-text ValueType variants, calculation options beyond model batching and advanced copied objects remain outside the tested M1 behavior. Advanced JSON pass-through is not implementation of those modules.
- The event comparison verifies every constant available in the core trial. Nine declared constants belong to absent add-ons: RowOperation and eight TableSheet filter/sort events. Ours exports those declared names too. This is a recorded reference-runtime exception, not a missing API surface.
- Comments support text and position storage. Comment UI, appearance, threaded comments, validation behavior, outlines themselves, tables, charts and other advanced modules remain M4+ fallbacks.
- Public declarations include unsupported members for source compatibility; declarations and numeric API coverage do not establish behavioral parity. Unsupported members throw NotImplemented. See [API_COVERAGE.md](API_COVERAGE.md) for the generated inventory and limits.

## Validation

Verified on 2026-11-06:

- `pnpm -r build` — passed; Vite reports bundle-size warnings.
- `pnpm -r typecheck && pnpm -r test` — passed, 537 unit tests (274 core, 7 React, 255 compat, 1 scenario registry).
- `pnpm lint && pnpm coverage:api` — passed; 15/207 constructors, 270/1,796 methods/functions, 252/252 enums and 1,369/1,369 declarations.
- `pnpm test:compare` — 23 browser tests passed, including 11 screenshot/diff scenarios, interactions, HiDPI, runtime metrics and M1 conformance. The stricter maximum-frame gate was also rerun through the interaction suite.
- Cold built-CJS benchmark: 200k writes in one column **51.2 ms**, across 20 columns **62.2 ms**; retained heap plus typed-array buffers **5.68 / 5.74 MB**. Both layouts meet the 80 ms / 25 MB targets. Heap alone is 0.51 / 0.46 MB. Each layout runs in a separate process with explicit GC.
- Vitest benchmark: 200k writes mean 38.1 ms, 200k reads 3.0 ms, 10k row-height changes plus offset lookups 11.7 ms, and 100k-cell toJSON 341.9 ms. These measurements describe this machine, not portable guarantees.
- Scrolling a populated 1M × 16k model: p95 render **4.1 ms**, maximum **6.4 ms**, p95 rAF interval **17.9 ms**, 264 visible cells painted. Both p95 and maximum render duration are gated below 16 ms.

| Scenario | Pixel difference |
| --- | ---: |
| editing | 0.415% |
| empty | 0.331% |
| frozen | 0.364% |
| many-tabs | 0.401% |
| merged | 0.520% |
| multiple-sheets | 0.471% |
| overflow | 0.613% |
| selection | 0.578% |
| styles-borders | 0.934% |
| values | 0.439% |
| zoom | 0.618% |

All screenshot scenarios pass the <1% gate. Remaining differences are described above and in [RENDERING.md](RENDERING.md). The generated `test-results/compare/report.html` contains every per-scenario screenshot and pixel diff; `runtime-metrics.json` and `performance.json` retain runtime measurements.

Reference fixtures and their regeneration instructions are in `packages/spread-sheets/test/fixtures/README.md`. Browser artifacts are ignored outputs under `test-results/compare/`. Vendor implementation JavaScript and stylesheet contents were never inspected or copied; the browser loads them only as opaque reference assets. Only public declarations and public runtime observations informed this work.
