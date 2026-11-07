# M2 rendering reference and verification

The reference is the installed 19.2.5 trial executed inside `apps/compare`. No vendor JavaScript or stylesheet contents were read. Public declarations, screenshots, canvas geometry returned by public worksheet methods, and computed styles of runtime DOM informed the implementation. Our CSS is scoped to `.opensheets-host` so it cannot restyle the reference pane.

Run `pnpm -r build`, then `pnpm test:compare`. Chromium must already be installed with `pnpm setup:compare`. Each scenario produces original official/ours captures, a pixelmatch difference image, and numeric results under `test-results/compare`. `report.html` presents all three images per scenario, including failures. `runtime-metrics.json` records public reference geometry and computed DOM styles. `performance.json` contains every scrolling sample.

The pixel gate measures four regions independently: the bounding box of the union of visible cells with values or explicit cell/row/column styles, spans, text overflow, selections, selected headers and visible editors (**<0.5%**); both full header strips (**<0.5%**); the full tab strip including its horizontal scrollbar (**<1%**); and declared glyph rectangles (**<12%**). A scenario's optional `glyphCells` entries identify only a pictogram box as `{row,col,x,y,width,height}` in CSS pixels relative to its public cell rectangle. Negative x/y offsets anchor to the right/bottom edge. Whole cells/ranges are no longer accepted; text and captions remain in the strict content gate. Header-strip filter buttons are added as explicit glyph rectangles from the public row-filter range and button visibility. Glyph rectangles are removed from the content and header numerators and denominators, then measured together in the separate `glyphs` region; they do not affect the tab region. Bounds come from both implementations' public worksheet geometry and DOM editor rectangles. Scanning visits visible/frozen axis indexes only. Invalid or nonfinite regions fail instead of silently yielding zero. Pixelmatch uses antialias exclusion and color threshold 0.1. The sole mask remains the trial watermark rectangle, `(paneWidth - 370, paneHeight - 115, 350, 80)` in CSS pixels, scaled at DPR 2. Masked pixels are removed from every region's numerator and denominator.

Every scenario runs at DPR 1 and 2 with viewport 1440 × 800. In addition to the percentage gates, the LineStyle scenarios require exact colored-border coordinates and exact RGB equality across their full horizontal/vertical border regions, including gaps. Header-selection scenarios require exact green accent coordinates on the bottom/right header edges. These checks cannot be diluted by blank cells. The region-metric unit tests cover a small-content failure, invalid bounds and glyph exclusion from content/header denominators. Original report images remain unmodified.

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

M4 adds eleven data-feature scenarios: tables and table themes, filter buttons, conditional-format rules, data bars, an all-icon-set gallery, data validation, cell types, comments, hyperlinks and outlines. M4 brings the suite to 44 scenarios × DPR 1/2 (88 paired comparisons), plus interaction, HiDPI, metrics, fixture and undo-reference tests.

Every data-feature pictogram is drawn by our renderer with vector paths, arcs and gradients: all 20 conditional-format icon sets, the filter dropdown/funnel/sort states, checkbox and radio glyphs, outline level and +/− buttons, comment indicators and validation list arrows. The icon geometry and colour families were measured from black-box captures, but no screenshot pixels, sprites, base64 blobs or RGB raster arrays are embedded in the source. Table theme tokens come from the public theme API. The raster audit `grep -rnE "base64|atob\(|ImageData|putImageData|\[\[[0-9]{1,3},[0-9]{1,3},[0-9]{1,3}\]" packages/spread-sheets/src` prints nothing.

Font line height comes from normal browser text layout. Ascent is measured at a larger size and normalized to avoid device-scale-dependent hinting; cached metrics drive the same baseline and vertical-alignment rules at both DPRs. Padding remains in CSS pixels while fonts/dimensions scale with zoom. Public browser canvas drawing calls were observed as black-box output to verify baseline, alignment, font and tab-label placement; no vendor implementation or stylesheet content was inspected.

`test-results/compare/m2b-before-after.md` and `.json` record every scenario's content/header/tab difference before and after using identical region bounds and settings. Before captures run our original HEAD renderer on the expanded scenario set. The empty LineStyle uses an equivalent empty baseline. These results describe Chromium on this machine and its installed fonts, not universal font or platform parity.

Scrolling verification populates 200k cells in a 1,000,000 × 16,384 model, scrolls for 90 frames, and records render duration and rAF intervals. The gate requires p95 and maximum rendering below 16 ms and p95 intervals below 25 ms (60 Hz rAF intervals normally approach 16.7 ms). It also checks visible cell count, paint suspension, and canvas backing dimensions. It is a Chromium workload, not a guarantee for every device.

`pnpm --filter @opensheets/spread-sheets bench` runs the Vitest benchmarks; `bench:cjs` measures the distributed CommonJS entry. The CJS benchmark includes the scattered pattern `setValue(r, r % 50, r)` on a 1,000,000 × 16,384 sheet. Row pages pack one primary coordinate per touched row; additional columns use column blocks. This avoids allocating 50 mostly empty column buffers per row block for scattered writes. The CJS regression tests run in isolated processes with explicit garbage collection and limits retained heap plus ArrayBuffer memory, so moving numeric payloads off the JS heap cannot hide allocations. Timing thresholds in unit tests permit shared CI load; the stricter 80 ms target is assessed by the benchmark.

## M5 verification changes

The M4 pass numbers above are historical. M5 replaces whole-cell glyph exemptions with explicit filter, icon, checkbox, radio and note-indicator rectangles. The unchanged 0.5% content/header, 1% tab and 12% glyph gates expose existing rendering differences; failures remain visible in the report. No scenario filler or new masks were added.

M5 brings the scenario suite to 49 scenarios × DPR 1/2 (98 paired comparisons). Five additional scenarios exercise named CSS colours, chart sparklines/formula charts, floating content/pictures, the external formula/name/status controls and nested binding/mask metadata. Floating-object bounds and explicit external-control hosts now contribute to the content region so those features are actually measured. The controls' shared scenario host is positioned relative to its workbook in both panes.

`m5-interaction.spec.ts` opens table/sheet filter popups, filter submenus and custom dialogs, cell/header/corner/table/tab menus and the all-sheets list in both implementations. Their unmodified captures, popup union bounds, differences and numeric results are added to the same report as `m5-ui-*`. Popup comparisons use the existing strict content limit and **no watermark mask**; pictograms are declared as tight 12/16/18/24 CSS-pixel rectangles and are measured by the existing 12% glyph gate, leaving text, swatches and chrome under the content gate. M5b corrected the submenu viewport placement, menu metrics, complete date/colour submenu content, scrollbar/checkbox list rendering, custom-dialog geometry and all-sheets list. Text/value/colour submenus, the tab menu, custom dialog and all-sheets list now match at both DPRs; the five context menus at both DPRs and the table/sheet filter tests remain red, principally on redrawn icon glyphs and DPR2 list antialiasing. Functional checks also cover cancellation/application and filter events, custom menu commands/cancellation, Escape and an error-throwing custom cell painter.

Only runtime public API, DOM/computed geometry and public canvas drawing output were observed. Menu icons, chart marks and all other pictograms are independently authored vector drawings. Vite excludes our implementation package from dependency prebundling so rebuilding our distribution is reflected in subsequent captures; the official dependency cache remains opaque.

The bounded M5 sparkline scenario now meets the content gate at both DPRs after correcting chart insets, marker dimensions, bar widths and pie geometry/palette. This covers the three chart types, their formula counterparts and a pie chart with one mixed-sign data series; it does not establish full sparkline settings, date-axis or extension-formula parity.
