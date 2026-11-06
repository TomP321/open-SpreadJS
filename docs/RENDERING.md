# M2 rendering reference and verification

The reference is the installed 19.2.5 trial executed inside `apps/compare`. No vendor JavaScript or stylesheet contents were read. Public declarations, screenshots, canvas geometry returned by public worksheet methods, and computed styles of runtime DOM informed the implementation. Our CSS is scoped to `.opensheets-host` so it cannot restyle the reference pane.

Run `pnpm -r build`, then `pnpm test:compare`. Chromium must already be installed with `pnpm setup:compare`. Each scenario produces original official/ours captures, a pixelmatch difference image, and numeric results under `test-results/compare`. `report.html` presents all three images per scenario, including failures. `runtime-metrics.json` records public reference geometry and computed DOM styles. `performance.json` contains every scrolling sample.

The pixel gate measures three regions independently: the bounding box of the union of visible cells with values or explicit cell/row/column styles, spans, text overflow, selections, selected headers and visible editors (**<0.5%**); both full header strips (**<0.5%**); and the full tab strip including its horizontal scrollbar (**<1%**). Bounds come from both implementations' public worksheet geometry and DOM editor rectangles. Scanning visits visible/frozen axis indexes only. Invalid or nonfinite regions fail instead of silently yielding zero. Pixelmatch uses antialias exclusion and color threshold 0.1. The sole mask remains the trial watermark rectangle, `(paneWidth - 370, paneHeight - 115, 350, 80)` in CSS pixels, scaled at DPR 2. Masked pixels are removed from each region's numerator and denominator.

Every scenario runs at DPR 1 and 2 with viewport 1440 × 800. In addition to the percentage gates, the LineStyle scenarios require exact colored-border coordinates and exact RGB equality across their full horizontal/vertical border regions, including gaps. Header-selection scenarios require exact green accent coordinates on the bottom/right header edges. These checks cannot be diluted by blank cells. The region-metric unit tests cover a small-content failure and invalid bounds. Original report images remain unmodified.

| Observable metric | Default reference |
| --- | --- |
| Row header width | 40 px |
| Column header height | 20 px |
| Cell size | 62 × 20 px |
| Public body font | 14.6667px Calibri (11pt) |
| Header text | Calibri at the same size; browser fallback when unavailable |
| Gridline | rgb(212, 212, 212) |
| Header background | white; selected #e1e1e1 |
| Header outer edge | #ababab; selected bottom/right edge #217346, 2 CSS px |
| Active border / fill handle | #217346, 2 px active outline, 5 px handle |
| Multi-range fill | #d0d0d0 on white; white inset around each range |
| Tab strip | 28 px; #f6f6f6 background |
| Scroll controls | 15 px, white handles, #ababab borders, #eaeaea track |
| Scrollbar allocation | 22 px vertical; horizontal centered in the tab strip |
| Runtime editor | 2 px #5292f7 border, 1px 2px 5px rgba(0,0,0,.4) shadow |

The trial uses a contenteditable editor. Ours uses the requested textarea, with independently measured width, matching font/zoom, and the observed border and shadow. Calibri is absent in this Linux Chromium environment: both canvases use the browser's serif fallback. Installing another font or changing browser/platform can alter rasterization and should trigger a new reference run.

The 33 scenarios cover the original eleven workbooks, LineStyle 0–13 separately (horizontal and contiguous vertical edges), wrapping in Calibri, two Arial sizes, bold serif and monospace with all vertical alignments, selected whole rows/columns, and multi-range header accents. At zoom 1, all tested line-style pixels and selected-header accents match exactly at both DPRs. Arbitrary fractional zoom border rasterization and complex border intersections still need broader coverage.

Font line height comes from normal browser text layout. Ascent is measured at a larger size and normalized to avoid device-scale-dependent hinting; cached metrics drive the same baseline and vertical-alignment rules at both DPRs. Padding remains in CSS pixels while fonts/dimensions scale with zoom. Public browser canvas drawing calls were observed as black-box output to verify baseline, alignment, font and tab-label placement; no vendor implementation or stylesheet content was inspected.

`test-results/compare/m2b-before-after.md` and `.json` record every scenario's content/header/tab difference before and after using identical region bounds and settings. Before captures run our original HEAD renderer on the expanded scenario set. The empty LineStyle uses an equivalent empty baseline. These results describe Chromium on this machine and its installed fonts, not universal font or platform parity.

Scrolling verification populates 200k cells in a 1,000,000 × 16,384 model, scrolls for 90 frames, and records render duration and rAF intervals. The gate requires p95 and maximum rendering below 16 ms and p95 intervals below 25 ms (60 Hz rAF intervals normally approach 16.7 ms). It also checks visible cell count, paint suspension, and canvas backing dimensions. It is a Chromium workload, not a guarantee for every device.

`pnpm --filter @opensheets/spread-sheets bench` runs the Vitest benchmarks; `bench:cjs` measures the distributed CommonJS entry. The CJS benchmark includes the scattered pattern `setValue(r, r % 50, r)` on a 1,000,000 × 16,384 sheet. Row pages pack one primary coordinate per touched row; additional columns use column blocks. This avoids allocating 50 mostly empty column buffers per row block for scattered writes. The CJS regression tests run in isolated processes with explicit garbage collection and limits retained heap plus ArrayBuffer memory, so moving numeric payloads off the JS heap cannot hide allocations. Timing thresholds in unit tests permit shared CI load; the stricter 80 ms target is assessed by the benchmark.
