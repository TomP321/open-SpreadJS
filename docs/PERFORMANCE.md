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
