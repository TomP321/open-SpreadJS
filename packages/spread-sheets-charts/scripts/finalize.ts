import fs from 'node:fs';
// The entry is a pure side-effect module; keep the published typings to the core peer import
// (same shape the barcode/IO add-ons publish — no extra public API).
for (const ext of ['d.ts', 'd.cts']) fs.writeFileSync(`dist/gc.spread.sheets.charts.${ext}`, "import '@mescius/spread-sheets';\nexport {};\n");
// The browser (script-tag) bundle is also published under the official file name so an
// application that copied the official <script> paths resolves the same URL.
fs.copyFileSync('dist/gc.spread.sheets.charts.umd.js', 'dist/gc.spread.sheets.charts.min.js');
