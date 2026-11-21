# Performance & package size

Measured 2026-11-18 on this development machine (Linux, headless Chromium via Playwright;
Node build; single task at a time — the paired Designer suite was not running during these
measurements). Our numbers are the production `dist` builds from `pnpm -r build`. The
comparison side is the official SpreadJS 19.2.5 **trial** package, loaded as an opaque
black-box bundle (never inspected).

## Runtime benchmark (ours vs the official trial)

Harness: `.probe/t59/perf.mjs` (the TASK 58 harness, re-run after the TASK 59 recalculation
work) — the same apps/designer-compare page (`?side=ours` vs `?side=official`, `&embed=1`,
no add-ins on either side), same headless Chromium, 1440x800 viewport, DPR 1, two timed
rounds per side; the table shows the better round.
JS heap via CDP `Performance.getMetrics` with `--enable-precise-memory-info`. Full JSON:
`.probe/t59/perf-results.json` (the TASK 58 baseline is kept in `.probe/t58/`).

| Metric | @opensheets | official trial 19.2.5 |
| --- | ---: | ---: |
| Open 1,000,000 x 16,384 virtual sheet (ms) | **0.3** | 1,164.4 |
| Scroll 1000 rows, total (ms) | **1,660** | 2,905 |
| — per step mean / p95 / max (ms) | **16.6 / 19.0 / 20.4** | 29.1 / 34.4 / 88.9 |
| `setValue` 100k cells under `suspendPaint` (ms) | **309** | 6,633 |
| Paint one viewport: `refresh()` sync part (ms) | 0.1 (rAF-scheduled) | 149.9 (paints synchronously) |
| Paint one viewport: rAF settle (ms) | 34.6 | 19.8 |
| Paint one viewport: total (ms) | **34.7** | 169.7 |
| Write 100k formula chain, calc suspended (ms) | **318** | 7,112 |
| `calculate(all)` + settle the 100k chain (ms) | **821** | 923 |
| Formula chain: write + calculate total (ms, per run) | **1,145** | 8,035 |
| Page ready: designer booted with the demo workbook (ms) | **2,026** | 4,101 |
| JS heap at bench start (MiB) | **36.2** | 80.6 |
| JS heap after 100k values (MiB) | **40.4** | 93.1 |
| JS heap after the whole benchmark (MiB, CDP) | **131.1** | 245.9 |

Notes:

- "scroll 1000 rows" = 100 `showRow(+10)` steps, waiting one animation frame per step
  (includes paint); "step p95/max" characterize frame jitter.
- "setValue 100k" writes numbers into 1000 rows x 100 cols inside `suspendPaint`/`resumePaint`;
  the timing covers only the API writes.
- The formula chain is a single 100,000-deep dependency chain (`K1=1`, `K2==K1+1`, ... ,
  `K100000==K99999+1`), written under `suspendPaint` + `suspendCalcService(false)`, then
  calculated with `spread.calculate(CalculationType.all)`; correctness is asserted
  (`K100000 === 100000`).
- Memory is the page's JS heap (designer + core loaded). The official page additionally
  carries the trial watermark/licence machinery.
- Paint semantics differ: the trial's `spread.refresh()` paints the viewport synchronously
  (150–151 ms), ours schedules the paint into the next animation frame (0.1 ms synchronous,
  35–36 ms settle); the "total" row compares like-for-like end-to-end. Our renderer draws
  only the dirty region, so a forced full-viewport repaint is ~4.9x faster than the trial's.
  The rAF-settle row alone is slower for us (35 vs 20 ms) because the settle window includes
  our two-frame scheduling latency; the honest end-to-end comparison is the "total" row.
- The formula chain rows are honest about both directions: our writer parses/registers 100k
  formulas ~22x faster. The pure recalc of the already-written chain was 18% slower than the
  trial in TASK 58 (1,153 vs 947 ms); **TASK 59 closed it** — 821 vs 923 ms now (both rounds
  win: ours 821/830, trial 923/966). The end-to-end (write + calculate) advantage is 7.0x.
- Round-to-round spread on this machine is a few percent (the other worktree's suites were not
  running during these measurements); `setValue 100k` measured 309–332 ms here vs 284 ms in
  TASK 58, `refresh()` settle 34.6–35.7 vs 28.3 ms — the TASK 59 code changes touch only the
  calculation service, not those paths.

## TASK 59: closing the pure-recalc gap (how)

The `calculate(all) + settle` window for the 100k chain covers (in our engine) the deferred
flush of the suspended calculation service: 100k `formulaChanged` registrations, dirty
collection, one full-graph cycle scan, and the evaluation pass. Profiling
(`.probe/t59/recalc.mjs` + Chrome/Node CPU profiles `phase-calc.cpuprofile`, analyzed with
`.probe/t59/prof.mjs`) put the cost in formula installation (~35%), the per-key dirty/eval
bookkeeping (~30%), the Tarjan scan (~10%), the evaluation itself (~15%) and GC (~15%).

Changes (all inside the calc engine; public semantics unchanged):

- The parsed AST from `setFormula`'s validation is handed to the flush (via the per-sheet
  calc queue), so a formula is no longer parsed twice (write + flush) — the flush installs
  the shared AST and skips the canonical re-render when the text is already canonical.
- `formulaChanged` skips the guaranteed-miss graph removal for cells the write path knows
  were formula-free, and strips the leading `=` without a regex.
- `collectDirty` walks each key's reverse edges exactly once per collection (was twice for
  every changed formula cell) and stamps cells with a numeric run token instead of relying
  only on string-key sets.
- The full-graph Tarjan scan (already cached per graph version) now also emits the
  topological order (SCC drain order = precedents first), cached as `topoOrder`.
- `recalculate` evaluates large dirty sets (and every `calculate(all)`) with a single
  topological-order scan using the stamps (cycle members skipped, cells waiting behind a
  cycle evaluated right after `solveCircular`), replacing the per-cell
  `done`/`deferred`/`upstream` walk; small incremental changes keep the old graph walk so
  their cost stays proportional to the change.
- `_setCalculatedValue` reads the old value straight from the store (unbound, no
  data-range case) and only builds the `ValueChanged` event object when a listener exists.
- Formula-position index inserts (`indexFormula`) are inlined; `findCycles` no longer
  copies the dirty set into a second 100k-entry `seeds` Set.

Node-side (`dist` bundle, same sequence as the browser harness, `recalc.mjs`; best-of-rounds
across several runs each): 928–1,030 ms before, 617–800 ms after. Browser harness: the table
above. Correctness: every existing calc test is
unchanged and green, plus 9 new tests in `test/calc/recalc-order.test.ts` (100k chain
`calculate(all)` + mid-chain change, 50k deferred chain, cross-sheet deep chain, cycle with
iterative calc on incl. a cell waiting behind the cycle, cycle with iterative calc off incl.
`getCircularReference`, volatile under `all` vs `minimal`, `rebuild` vs `all` parity,
4k-cell diamond graph, canonical text through the deferred write path).

Earlier per-module benchmarks (same machine, recorded in STATUS.md): 100k formula parse
~265 ms; incremental recalc of a 100k chain ~0.43 s; one input under 10k dependent
`SUM(A1:A100)` ~34-46 ms; 1,000,000-cell XLSX populate 2.4-2.7 s, export ~6.2 s, import
~6.6 s, heap ~192 MiB (docs/STATUS.md, M7a).

## TASK 78: load benchmark — 200k rows, formulas, memory, styles (2026-11-20)

Harness: `.probe/t78/perf.mjs` — same headless Chromium (Playwright, 1440x800, DPR 1),
same `apps/designer-compare` host page (`?side=ours|official&embed=1&plugins=none`, so
both sides run the identical in-page script), `--enable-precise-memory-info
--js-flags=--expose-gc`; two timed rounds per side interleaved, the table shows the
better round; full JSON `.probe/t78/perf-results.json`. Three phases: **data**
(200,000 x 20 values via `setArray` + 50,000 mixed formulas — 1/3 `SUM(A..:Q..)` row
sums, 1/3 `IF(C>$V$1,...)` on a shared input, 1/3 `VLOOKUP(...,$W$1:$X$500,...,FALSE)`
exact-match against a 500-row table — then full recalc, one-input incremental recalc,
scroll, sort, row filter, find-all), **memory** (Workbook create+destroy x50 with live
content, Designer create+destroy x20, heap after `gc()` every 10/5 cycles, WeakRef
survivors, detached DOM from a CDP heap snapshot), **styles** (100k cells with pairwise
distinct `Style` objects + two conditional-formatting rules over 200k cells + viewport
paint).

### Phase 1 — data under load

Best of two rounds per side (recalc/find/filter rounds reproduce within a few
percent; sort is noisier — ours 6,522/8,382, trial 16,441/21,972 — but our worst
round still beats the trial's best). Ratio = trial / ours (> 1 means we are
faster). Correctness flags identical on both sides for every round: data verify,
recalc, incremental flip, sort order check, hidden-row fraction 0.5, 201 finds.

| Metric | @opensheets (ms) | official trial 19.2.5 (ms) | ours vs trial |
| --- | ---: | ---: | ---: |
| Page ready (designer + demo workbook) | **2,438** | 4,083 | 1.67x |
| `setArray` 200,000 x 20 values (calc suspended) | **6,872.6** | 229,996.1 | 33.5x |
| — JS heap after setArray (MiB) | **448.9** | 499.8 | — |
| Write 50k SUM/IF/VLOOKUP formulas (`setFormula`) | **374.5** | 4,860.8 | 13.0x |
| Full recalc: `calculate(all)` + resume flush + settle | **1,092.6** | 1,873.8 | 1.71x |
| — JS heap after recalc (MiB) | **287.7** | 603.1 | — |
| Incremental recalc: 1 input -> 16,667 IF formulas | **162.7** | 348.2 | 2.14x |
| Scroll 2000 rows / 20 x 100-row steps, total | 310.7 | 312.0 | 1.00x (tied, see note) |
| — per-step p50 / p95 / max (ms) | 16.6 / 16.9 / 16.9 | 16.6 / 16.9 / 17.1 | tied |
| `sortRange` 200k rows x 18 cols | **6,522** | 16,440.7 | 2.52x |
| Row filter over 200k rows (`addFilterItem` + `filter`) | **334.2** | 728.3 | 2.18x |
| Find-all "Item 517" over 200k x 17 (`search` loop) | **11,799** | 19,988.4 | 1.69x |
| JS heap at phase end (MiB) | 989.8 | 1,015.8 | — |

Scroll note (honest): one step per animation frame makes this metric **rAF-floored**
at 16.6 ms/step — both sides finish the work inside one frame, so the numbers are
identical by construction, not because both render at the same speed.

### Phase 2 — memory and leaks

Workbook create+destroy x50 (500x20 sheet with 500 values each in every workbook),
Designer create+destroy x20, `gc()` + heap reading every 10 / 5 cycles, WeakRef
survivors after the phase, detached DOM from a CDP heap snapshot. Both rounds of
each side reproduce to 0.1 MiB.

| Metric | @opensheets | official trial 19.2.5 |
| --- | ---: | ---: |
| Heap after GC, every 10 Workbook cycles (MiB) | 62.4, 62.4, 62.4, 62.4, **62.5** (flat) | 82.0, 82.1, 74.6, 74.7, **74.8** (flat/drops) |
| Live WeakRefs after 50 Workbook cycles (wb / host) | **0 / 0** | 0 / 0 |
| Heap after GC, every 5 Designer cycles (MiB) | 62.5, 62.6, 62.6, **62.6** (flat) | 81.1, 82.0, 82.5, **82.9** (+1.8 MiB) |
| Live WeakRefs after 20 Designer cycles (designer / workbook / host) | **0 / 0 / 0** | 0 / **1** / **1** |
| Detached DOM nodes (CDP heap snapshot after GC) | 0 | 0 |
| Document DOM nodes at phase end | 545 | 478 |

Verdict: **no leak either side** in the Workbook path. The official Designer keeps
**one Workbook + one host element alive globally** across 20 create/destroy cycles
(`dgLiveWb: 1`, `dgLiveHosts: 1`, +1.8 MiB, identical in both rounds — a global
registry, not per-instance); ours collects every destroyed Designer completely.

### Phase 3 — styles and conditional formatting

100k cells each with a pairwise-distinct `Style` object + value, then two CF rules
(cell-value > 100000 highlight + 2-color scale) over 200k cells; viewport paint =
`showRow` + two rAFs, averaged over 5 steps; LoAF = long-animation-frame observer
threshold 8 ms during a 12-step styled+CF scroll.

| Metric | @opensheets (ms) | official trial 19.2.5 (ms) | ours vs trial |
| --- | ---: | ---: | ---: |
| 100k distinct `Style` + `setStyle` + `setValue` | **823.3** | 14,660 | 17.8x |
| Paint one viewport, distinct styles (2-rAF settle) | **33.3** | 119.1 | 3.6x |
| — `refresh()` sync / settle (ms) | **0.0 / 31.0** | 18.7 / 210.1 | — |
| Add 2 CF rules over 200k cells | **0.7** | 1.3 | 1.9x |
| Paint one viewport with CF active (2-rAF settle) | 33.3 | 31.7 | 0.95x (see note) |
| LoAF frames > 8 ms during styled+CF scroll | **0** | 0 | — |
| JS heap at phase end (MiB) | 164.6 | **120.2** | — (see note) |

CF-paint note (honest): the trial's 31.7 vs our 33.3 is a **rAF-quantization
tie-break**, not a real paint gap — 33.3 is exactly two frames (our paint
completes within one frame), the LoAF observer records **zero frames above 8 ms
for both sides**, so both render the CF viewport inside one frame and this row
cannot separate sub-frame paints. The "distinct styles" row above (33.3 vs 119.1)
does separate them, because the trial's paint spills across frames there.

Heap note (honest — the one row where the trial uses less): with **100,000
pairwise-distinct** `Style` objects our phase-end heap grows ~127 MiB over the
loaded baseline vs the trial's ~34 MiB. ~~Root cause: `setStyle` stores the user's
`Style` **object by reference** in the cell record … the trial compacts styles
into its own internal representation so the user's objects become garbage.~~
**Correction (TASK 79 black-box probe): the trial also stores the user's `Style`
by reference** — `getStyle(r,c) === st` after `setStyle`, border member identity
preserved, mutation of the passed object re-styles the cell — so reference
retention was not the differentiator; the real gap was per-instance `font`
accessors (dictionary-mode styles) plus sliced font strings, see § "TASK 79" at
the end of this file, which closed the row. Not a leak (flat across both rounds,
released on `clear()`).

### What was slower and what was fixed (top self-time from the CPU profiles)

Clean-room note: only OUR build was ever profiled (`Profiler.setSamplingInterval 150`
over our `dist/gc.spread.sheets.esm.js`); the trial was measured end-to-end only.

1. **Full recalc of the 50k mixed-formula sheet: was 3.0-3.1 s vs the trial's
   1.81-1.89 s (the one losing row).** Profile of the recalc window (top self):
   `_fastValue` 14.2% + sparse-store `get/block` ~13% + `toMatrix`/`lookupValue` ~4% —
   every exact VLOOKUP materialised the whole 500 x 2 table (16.6k x 1000 = 16.6M cell
   reads plus 16.6k discarded matrices, GC 4.7%); `formulasInRange` + its callback
   16.8% — each VLOOKUP's `$W$1:$X$500` range-dependency re-scanned 500 index rows on
   every topological build (8.3M Map lookups). Fixes: `VLOOKUP`/reference tables are
   now scanned column-by-column without materialisation (exact scans stop at the first
   hit and read only the result cell), and `formulasInRange` results are memoised per
   graph version (`engine.rangeDepMemo`), so the 16.6k identical deps compute once.
   Same values, same error codes, same first-match semantics — new contract tests in
   `test/lookup-tables.test.ts`. Result: **recalc window 3302 -> 991 ms** (profile
   after: `(program)`/GC 54.6%, store reads <10%, `formulasInRange` 1.4%).
2. **Sort 200k rows (trial 15.7 s).** Our original `sortRange` moved cells through
   per-cell `getValue`/`setValue` transactions and per-cell change payloads. Rewritten
   as a store-level record move (values, styles, tags, validators, hyperlinks, comments
   move with their cell; formulas travel and their relative references shift by the same
   delta; one batched `RangeChanged` with `action: sort` — the event contract measured
   on the trial in `.probe/t78/dbg-sort-events.mjs`). New ordered traversals
   (`orderedEntries` on `SparseGrid`/`ValueGrid`/`CellStore`, merge-streamed) keep it
   O(live cells). Result: 6.5-8.4 s vs the trial's 16.4-22.0 s — **2.5x faster**
   (best-of-rounds 6,522 vs 16,441 ms).
3. **Find-all: ours 34 s — 1.7x slower than the trial (19.5 s).** The search built a
   materialised, sorted cell list per call and ran `getActualStyle` + the formatter per
   cell. Fixes: streaming scan-order traversal with a dense-rectangle probe mode
   (`src/search.ts` + `orderedEntries`/`has`/`size` in `src/structures.ts`), and a
   sheet-level formatter cache — a cell whose style chain cannot carry a formatter
   (no formatter, no named parent, no table, no CF rules) gets the area default from a
   per-epoch cache instead of a full `getActualStyle` per cell; the epoch is bumped by
   every CF/named-style/default-style mutation (`src/sheet-styles.ts`,
   `src/features/conditional-formatting.ts`, `src/workbook.ts`). Now **1.7x faster**
   than the trial (11.8-12.4 s vs 20.0-23.4 s).
4. **Full recalc flush of a suspended bulk write: ~4.5x (to 3.0-3.1 s), then item 1.**
   The bench writes 4M values + 50k formulas under workbook-level
   `suspendCalcService`; the resume flush then re-walked the reverse-edge range index
   per queued cell (mid-task measurement: ~14 s). Above
   `CALC_QUEUE_BULK_THRESHOLD = 8192` pending value changes the flush performs one
   whole-graph recalculation (a superset of the union of dependents) instead — 3.0-3.1 s,
   the starting point for item 1's profile, which takes it to ~1 s. Trial semantics
   preserved (plain `setValue` leaves the formula registered — measured in
   `.probe/t78/dbg-setvalue-formula.mjs` — and bulk mode must not change that; a
   suspended same-cell `setFormula` + `setValue` pair additionally lost its formula
   registration through the write queue's last-write-wins dedup — fixed in
   `engine.valueChanged`, which now registers a store formula the engine is missing
   (plain formulas only) before applying the value).
5. **setArray 200k x 20: trial 230-268 s, ours 6.9-7.0 s** — not a fix, a 33-39x
   gap worth recording; our chunked column stores ingest ordered writes without
   re-sorting.
6. **Memory: no leak either side in the Workbook path** (WeakRef survivors 0/0, flat
   heap series). The official **Designer** keeps **one Workbook + one host element
   alive globally** across 20 create/destroy cycles (`dgLiveWb: 1`, `dgLiveHosts: 1`,
   +1.8 MiB, identical in both rounds — a global registry, not per-instance); ours
   collects every destroyed Designer completely (0/0/0, flat). Documented in the
   Phase-2 table; nothing to fix in our code.
7. **Known footprint gap (documented, not fixed):** 100k *pairwise-distinct* `Style`
   objects cost ~127 MiB (ours) vs ~34 MiB (trial) — we store the user's `Style` by
   reference to honour the `getStyle()` mutation contract, the trial compacts into
   internal storage. Stable, not a leak; closing it needs a copy-on-write style
   representation with identity-preserving `getStyle` — deliberately out of scope
   with the merge gates pending (recorded in STATUS.md).

Methodology & caveats:

- Machine idle apart from the bench (the paired Designer worktree's suites were not
  running during any timed round); rounds interleaved ours/official; a fresh browser
  context per round. Every round passed the in-page correctness asserts (last row of
  Phase 1, Phase 3 `styleVerify`/`cfRules`), so no number comes from a broken run.
- The final JSON is `.probe/t78/perf-results.json` (`when` 2026-11-20T15:49Z); earlier
  diagnostic runs are kept in the same directory (`perf-results-smoke.json`,
  `perf-results-prefix-round1.json`). The CPU profiles (`prof-*.cpuprofile`) were
  captured **only on our build** (`PHASES`-driven, `Profiler` CDP session); the trial
  is end-to-end timed, never instrumented.
- Two rows are **rAF-quantization ties** rather than real differences (scroll p50/p95,
  CF-active paint settle); both sides finish inside one frame there (LoAF count 0).
  Everything else measures multi-hundred-ms windows where the floors do not matter.
- The official page logged no console errors in any round; ours logged only the React
  dev warning from the bench host page's own JSX (unrelated to the product build).
- Correctness coverage for the restructured paths: `test/lookup-tables.test.ts`
  (lazy VLOOKUP/reference-table scan: values, `#N/A`, error codes, first-match,
  approx-mode binary semantics) and `test/sort-search-perf-contract.test.ts`
  (store-level sort moves values+styles+formulas with shifted relative refs and emits
  the batched `RangeChanged`/`action:'sort'` contract; streaming search order/counts;
  formatter-cache epoch invalidation; suspended same-cell formula+value batches below
  and above the bulk threshold).

## Package size (minified + gzip)

Sizes via `stat`/`gzip` on the installed package files. The official files were never
opened — only their byte sizes. The official trial bundles additionally carry
licence/watermark code; the official CSS files embed raster sprite images, which our
vector-drawn UI does not need.

| File | @opensheets (bytes / gzip) | @mescius trial (bytes / gzip) |
| --- | ---: | ---: |
| Core all-in browser bundle (`*.all.min.js`) | 2,281,282 / 558,512 | 6,184,504 / 1,856,832 |
| Core ESM build (`*.esm.js`, unminified) | 3,915,608 / 740,862 | n/a (per-module files) |
| Core sheet stylesheet (`gc.spread.sheets.css`) | 40,817 / 7,044 | 622,464 / 143,716 |
| Core theme stylesheet (`gc.spread.sheets.excel2013white.css`) | 87 / 137 | 488,227 / 121,862 |
| Designer bundle (`*.designer.all.min.js`) | 3,326,398 / 818,583 | 6,797,942 / 1,958,703 |
| Designer ESM build (unminified) | 2,298,857 / 406,090 | n/a |
| Designer stylesheet (`*.designer.min.css`) | 227,335 / 39,152 | 2,130,200 / 407,369 |
| IO plugin (`*.io.min.js`) | 194,846 / 54,122 | 638,353 / 194,573 |
| React wrapper (`*.react.min.js`) | 8,767 / 2,586 (index.js) | 21,719 / 5,162 |
| Designer React wrapper (`*.designer.react.min.js`) | 1,003 / 492 (esm) | 3,775 / 1,381 |
| Designer resources en (`*.resource.en.min.js`) | 145 / 172 | 252,299 / 74,005 |

Theme CSS file count: 7 per side with the same file names; designer stylesheet count: 3
per side (base + light + dark, same names). Our theme entries are 87-byte
`@import "./gc.spread.sheets.css"` stubs (v0.1 ships one authored theme; the official
themes each inline the whole base sheet plus theme-specific rules and embedded raster
sprite sheets, which our vector-drawn UI does not use).

Notes: our React wrapper ships as unminified `index.js` (8.8 KiB) and our
designer-resources package is a 145-byte side-effect shim because the English strings are
bundled into the designer package itself — the official distribution keeps them as a
separate 246 KiB minified bundle with an embedded icon-font manifest.

## TASK 79: style-heavy sheet memory — 100k pairwise-distinct styles (2026-11-20)

Closes the one known gap recorded under TASK 78 (ours +127 MiB vs the trial's
+34 MiB on the styles phase-end heap). Same host page (`apps/designer-compare`,
`:5186`, `?side=ours|official`), same headless Chromium + `--enable-precise-memory-info
--js-flags=--expose-gc`; harnesses in `.probe/t79/` (`heap.mjs` per-phase forced-gc
heaps + CDP snapshots, `analyze.mjs` dominator-tree retained sizes, `final.mjs` the
TASK 78 styles phase both ways, `perf.mjs` a re-run of the full TASK 78 protocol).

### Step 1 — profile before touching code (top retained-size groups, OURS)

CDP heap snapshot of the styles-only phase (100k distinct `Style` objects in cells,
sheet painted, forced gc; 2.27M nodes; retained = dominator-tree subtree sums).
The `array`/`Map`/`Object` rows nest (one retainer chain through Worksheet ->
CellStore -> SparseGrid), so the per-owner attribution (dominator -> node group)
is what identifies the cost:

| Retained/shallow signal (per 100k styled cells) | Size | What |
| --- | ---: | --- |
| `_Style` objects themselves | 100510 x ~12-40 B | user objects (kept by reference — see probe below) |
| `(object properties)` backing stores | 101107, avg **224 B**, 21.4 MiB | dictionary-mode NameDictionaries: `setFont` installed a **per-instance** `font` accessor via `Object.defineProperty`, pushing every assigned Style into slow mode |
| `closure get` / `closure set` | 101555 + 100382 JSFunctions, 5.4 MiB | the accessor's fresh function pair per `setFont` call |
| `PropertyArray` + `fonts` WeakMap entries | ~4.3 MiB | dictionary overhead + per-object `{value, parts}` bookkeeping |
| sliced font parts (`Calibri`/`bold`/`11px`/…) | ~5.0 MiB | regex results are cons-strings — one copy per cell |
| per-cell `Map` row stores (`Map ==> array` + entries) | ~5.6 MiB | `SparseGrid` used a `Map<col, CellData>` per row: ~1.1 KiB for a 20-column row |
| user strings (`rgb(...)` values) + CellData records | ~9 MiB | the strings are user-owned and kept identically by the trial |

Control facts measured on the **trial** (black-box only): its `getStyle(r, c)`
returns the *very object* passed to `setStyle` (identity true, border member
identity true, mutating the object after `setStyle` re-styles the cell), and its
Style class keeps `font` as a **prototype** accessor that fans out to own data
fields — i.e. reference retention is trial behaviour too; the memory difference
was allocation shape, not representation. The TASK 78 "root cause" note is
corrected accordingly above.

### Step 2 — changes (public contract unchanged)

1. `Style.font` is a prototype accessor only (`src/primitives.ts`): the per-instance
   `Object.defineProperty` accessor is gone, so styles stay in V8 fast mode. The
   `fonts` WeakMap keeps a raw shorthand only when recomposing the parsed parts
   would not reproduce it exactly (canonical order stores no entry at all).
2. Font parts (`'bold'`, `'Calibri'`, `'12px'`, …) are interned through a bounded
   cache — equal parts across styles share one string.
3. A shorthand without italic/bold only materialises `fontStyle`/`fontWeight`
   slots the style already carries (a plain `font = '12px Arial'` sets 2 parts,
   not 4).
4. `SparseGrid` rows are sorted parallel arrays instead of per-row `Map`s
   (`src/structures.ts`); iterators snapshot the row so mutation-during-iteration
   keeps the old Map semantics. `getFormatter`'s hot `peek()` path and the
   find-all/sort streams are untouched contracts.
5. `setStyle` creates the cell record as `{ style }` directly (exact store, no
   empty-record add transition).
6. Copy sites that used to see `font` via the old own accessor carry the exact
   shorthand explicitly: `clone()`, `getActualStyle`'s resolver, named-style
   resolution in `getStyle`, `styleToJSON` (`font` next to the parsed parts, as
   the official `namedStyles` fixture shape shows).

Kept **by design** (trial-identical): `setStyle` stores the user `Style` by
reference; `getStyle(r,c) === st`, repeated calls return the same object, border
sub-objects keep identity, and mutation of a returned/mutated object re-styles
the cell — matching both the trial probe and the pre-existing tests
(`range.test.ts` `toBe(border)` identities; the d.ts documents no copy semantics).

### Step 3 — result (same benchmark, forced-gc usedJSHeapSize, two rounds, stable to 0.1 MiB)

Every number below is transcribed from the raw harness logs in `.probe/t79/`:
`heap-before.log` / `heap-final.log` (phase ladder: values -> +styles -> +CF,
forced-gc phase heaps), `final-before.log` / `final-final.log` (full TASK 78
styles phase incl. values + 2 CF rules + scroll/paint churn, ours + trial,
2 rounds each), `micro-before.log` / `micro-final2.log` and
`micro2-before.log` / `micro2-final.log` (component micro batteries, ours +
trial). `*-before.log` was measured with the fix reverted and the package
rebuilt (same session, same page, base heap 62.7 vs 62.6 MiB), so before/after
compare in-session; the restored fixed build was re-confirmed micro-identical
afterwards (`micro-after-confirm.log` == `micro-final2.log`).

| Benchmark slice (heap deltas over the loaded base) | @opensheets before -> after (MiB) | trial (MiB) |
| --- | ---: | ---: |
| styles-only 100k, heap delta over values-only baseline (gc) — ladder | 56.6 -> **17.7** | 15.9 |
| styles + values + CF + paints, styled-heap delta (gc) — T78 phase | 58.2 -> **20.1** | 19.3 |
| same, phase-end without forced gc (T78's metric) | 65-76 -> **29.4-29.8** | 25.2 |
| 100k user Styles held in an array only (micro) | 40.9 -> **3.4** | 4.3 |
| same styles kept only by cells (micro) | 47.7 -> **6.9** | 8.9 |
| one shared Style in 100k cells — internal record cost (micro) | 5.0 -> **3.6** | 0.8 |

Honest residual (from the post-fix snapshot, `analyze-ours-S.fixed.txt`): the
pairwise-distinct benchmark's **user objects** (100k `Style`s, 3.1 MiB shallow,
plus their 200k distinct `rgb(...)` concatenated strings) are ours to keep on
both products, so what is left on our side is the internal per-cell record:
~32 B fast-mode `CellData` + a ~20 B property-backing spill when `value` is
added after `style` + ~16 B/col of the sorted row arrays — ~7 MiB per 100k
cells vs the trial's ~5 MiB, which is the +1.8 MiB (ladder) / +0.8 MiB (T78
phase) we still carry. Removing the spill needs records pre-declaring unused
fields, which breaks the empty-record `prune()` contract for no more than
~1 MiB — not worth the semantics risk; the 127-vs-34 MiB gap (3.7x) is now a
1.04x difference on the same benchmark.

Speed on the same tables: on the T78-phase harness (`final.mjs`) the 100k
distinct styles + values fill went **813-861 -> 591-603 ms** (~1.4x, TASK 78's
published figure 823 ms; the `perf.mjs` protocol re-run repeats 620-701 ms,
the styles-only ladder fill 1475 -> 790 ms, ~1.9x) and the trial's `setStyle`
stays ~15 s there (15.1-15.6 s). The TASK 78 data-phase rows re-run within
their measured ranges (setArray 200k x 20 6.6-7.2 s vs 6.9-7.0 s; sort 7.9-8.6
vs 6.5-8.4 s; find-all 11.9-13.2 vs 11.8-12.4 s; full recalc 0.94-1.09 vs
~1.0 s; scroll rAF-identical, `paintCfViewportMs` 28.5-29.9 vs the trial's
26.5-28.2) — no regression.

Heap after `clear()` + gc returns to the loaded baseline (63.4 vs 62.6 MiB), so
nothing is retained; the two-round series is flat (styled heap 82.7 both rounds).

### Gates

- `pnpm -r build`, `pnpm coverage:api` (207/207 classes, 1796/1796 methods),
  `pnpm -r typecheck`, `pnpm -r test`, `pnpm lint` — see STATUS.md § TASK 79.
- New tests: `test/task79-style-store.test.ts` (14: font storage/shape/parity,
  reference semantics, actual-style cascade, named resolution incl. non-canonical
  order, serialization round trip, undo/redo through the store-snapshot command,
  used-range with font-only styles), 1 new `structures.test.ts` case (sorted-array
  row semantics incl. mutation-during-iteration), plus the pre-existing font/
  serialization/style suites unchanged.
