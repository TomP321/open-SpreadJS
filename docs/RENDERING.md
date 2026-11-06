# M2 rendering reference and verification

The reference is the installed 19.2.5 trial executed inside `apps/compare`. No vendor JavaScript or stylesheet contents were read. Public declarations, screenshots, canvas geometry returned by public worksheet methods, and computed styles of runtime DOM informed the implementation. Our CSS is scoped to `.opensheets-host` so it cannot restyle the reference pane.

Run `pnpm -r build`, then `pnpm test:compare`. Chromium must already be installed with `pnpm setup:compare`. Each scenario produces original official/ours captures, a pixelmatch difference image, and numeric results under `test-results/compare`. `report.html` presents all three images per scenario, including failures. `runtime-metrics.json` records public reference geometry and computed DOM styles. `performance.json` contains every scrolling sample.

The pixel gate is strictly below 1% of compared pixels. Pixelmatch uses its default antialias exclusion and color threshold 0.1. The only mask is a fixed 350 × 80 rectangle containing the trial's four watermark lines, positioned at `(paneWidth - 370, paneHeight - 115)`. Both panes are masked identically for comparison; original report captures remain unmodified. Tests do not mask headers, tabs, editors or scrollbars. Screenshots use Chromium at 1440 × 800 and DPR 1; interaction also has a DPR 2 test. These are bounded conformance cases, not proof of parity for all workbooks or operating systems.

| Observable metric | Default reference |
| --- | --- |
| Row header width | 40 px |
| Column header height | 20 px |
| Cell size | 62 × 20 px |
| Public body font | 14.6667px Calibri (11pt) |
| Header text | Calibri at the same size; browser fallback when unavailable |
| Gridline | rgb(212, 212, 212) |
| Header background | white; selected #e1e1e1 |
| Header outer edge | #ababab |
| Active border / fill handle | #217346, 2 px active outline, 5 px handle |
| Multi-range fill | #d0d0d0 on white; white inset around each range |
| Tab strip | 28 px; #f6f6f6 background |
| Scroll controls | 15 px, white handles, #ababab borders, #eaeaea track |
| Scrollbar allocation | 22 px vertical; horizontal centered in the tab strip |
| Runtime editor | 2 px #5292f7 border, 1px 2px 5px rgba(0,0,0,.4) shadow |

The trial uses a contenteditable editor. Ours uses the requested textarea, with independently measured width, matching font/zoom, and the observed border and shadow. Calibri is absent in this Linux Chromium environment: both canvases use the browser's serif fallback. Installing another font or changing browser/platform can alter rasterization and should trigger a new reference run.

The scenario suite covers empty, values, styles and every LineStyle, merged, leading/trailing frozen panes, overflow with hidden dimensions, multi-range selection, editing, many tabs with a colored tab, and zoom 150%. Remaining pixel differences are concentrated in tab/navigation geometry, some header subpixel positions, dash patterns/double borders, and font fitting/wrapping. Consult the generated per-scenario numbers rather than assuming exact equality.

Scrolling verification populates 200k cells in a 1,000,000 × 16,384 model, scrolls for 90 frames, and records render duration and rAF intervals. The gate requires p95 and maximum rendering below 16 ms and p95 intervals below 25 ms (60 Hz rAF intervals normally approach 16.7 ms). It also checks visible cell count, paint suspension, and canvas backing dimensions. It is a Chromium workload, not a guarantee for every device.

`pnpm --filter @opensheets/spread-sheets bench` runs the Vitest benchmarks; `bench:cjs` measures the distributed CommonJS entry. The CJS regression test runs in an isolated process with explicit garbage collection and limits retained heap plus ArrayBuffer memory, so moving numeric payloads off the JS heap cannot hide allocations. Timing thresholds in unit tests permit shared CI load; the stricter 80 ms target is assessed by the benchmark.
