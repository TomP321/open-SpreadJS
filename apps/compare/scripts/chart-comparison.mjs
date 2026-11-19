#!/usr/bin/env node
/* Black-box chart comparison (TASK 34 — report only, no thresholds).

   Runs the same chart scenarios against the official trial runtime
   (@mescius/spread-sheets 19.2.5 + @mescius/spread-sheets-charts plugin) and
   @opensheets/spread-sheets in ONE page. Every step compares, field by field:
     - chart.toJSON() (full shapeData/graphicFrame/chartSpace tree),
     - the sheet-JSON `shapes` section (trial stores charts there),
     - chart.series() results and every public getter (title/legend/axes/
       chartArea/plotArea/dataLabels/colorScheme/ignoreHidden/...),
     - the geometry/anchor accessors,
   and pixel-diffs a screenshot crop of the chart (diff %, numbers only).
   Mouse interaction (select, move, resize) is driven with real CDP events at
   coordinates computed from each chart's own geometry.

   Run: node apps/compare/scripts/chart-comparison.mjs   (exit 0 = ran) */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repo = path.resolve(root, '../..');
process.env.PLAYWRIGHT_BROWSERS_PATH ??= path.join(repo, '.playwright-browsers');
const { chromium } = await import('@playwright/test');
const { PNG } = await import('pngjs');
const pixelmatch = (await import('pixelmatch')).default;

/* CLI: --filter <regex on scenario name> --out <dir name> (defaults: all, v1). */
const argv = process.argv.slice(2);
const arg = (flag, dflt) => { const i = argv.indexOf(flag); return i >= 0 ? argv[i + 1] : dflt; };
const scenarioFilter = arg('--filter', null) ? new RegExp(arg('--filter', '')) : null;
const outDir = path.join(repo, '.probe', 'chart-comparison', arg('--out', 'v1'));
fs.mkdirSync(outDir, { recursive: true });

/* ---------- diff helper ---------- */
function diffValues(a, b, prefix, out, budget = 200) {
  if (out.length >= budget) return;
  if (a === b) return;
  const bothObjects = a && b && typeof a === 'object' && typeof b === 'object';
  if (!bothObjects || Array.isArray(a) !== Array.isArray(b)) {
    const short = v => { const s = JSON.stringify(v ?? null); return s && s.length > 120 ? s.slice(0, 117) + '...' : s; };
    out.push(`${prefix}: official=${short(a)} ours=${short(b)}`);
    return;
  }
  for (const key of [...new Set([...Object.keys(a), ...Object.keys(b)])])
    diffValues(a[key], b[key], `${prefix}.${key}`, out, budget);
}

/** Inside chart JSON trees `null` and a missing key serialise the same way. */
function dropNulls(json) {
  if (!json || typeof json !== 'object') return json;
  if (Array.isArray(json)) { json.forEach(dropNulls); return json; }
  for (const [key, value] of Object.entries(json)) {
    if (value === null) delete json[key];
    else dropNulls(value);
  }
  return json;
}

/* Normalise ids/axIds that the trial generates randomly per workbook. */
function normalize(state) {
  const AX = '<axId>';
  const ID = '<id>';
  const walk = json => {
    if (!json || typeof json !== 'object') return;
    if (Array.isArray(json)) { json.forEach(walk); return; }
    for (const [key, value] of Object.entries(json)) {
      if ((key === 'axId' || key === 'crossAx') && typeof value === 'number') json[key] = AX;
      if (key === 'axId' && Array.isArray(value)) json[key] = [AX, AX];
      if (key === 'id' && typeof value === 'number') json[key] = ID;
      else if (key !== 'id') walk(value);
    }
  };
  for (const json of [state.chartJson, ...(Array.isArray(state.sheetShapes) ? state.sheetShapes : [])]) { walk(json); dropNulls(json); }
  // The trial reuses the sheet's `shapes` section; the KEY ORDER inside a
  // shape entry is not behavioural.
  if (Array.isArray(state.sheetTopKeys)) state.sheetTopKeys = state.sheetTopKeys.slice().sort().join(',');
  return state;
}

const scenarios = [
  ...['columnClustered', 'columnStacked', 'barClustered', 'line', 'lineMarkers', 'pie', 'doughnut', 'area', 'xyScatter',
    // TASK 39 family 1: stacked / 100%-stacked variants.
    'columnStacked100', 'barStacked', 'barStacked100', 'lineStacked', 'lineStacked100',
    'lineMarkersStacked', 'lineMarkersStacked100', 'areaStacked', 'areaStacked100',
    // TASK 39 family 2: scatter variants, bubble, radar.
    'xyScatterSmooth', 'xyScatterSmoothNoMarkers', 'xyScatterLines', 'xyScatterLinesNoMarkers',
    'bubble', 'radar', 'radarMarkers', 'radarFilled',
  ]
    .map(name => ({
      name: `type-${name}`,
      dump: true,
      chart: { chartType: name },
      steps: [{ label: 'initial' }, { label: 'second-setup', rechart: { chartType: name } }],
    })),
  // TASK 39 families 3+4: combo, stock (OHLC fixture) and statistical types.
  ...([
    ['combo', {}],
    ['stockHLC', { fixture: 'stock', range: 'A1:D4' }],
    ['stockOHLC', { fixture: 'stock', range: 'A1:E4', orientation: 1 }],
    ['stockVHLC', { fixture: 'stock', range: 'A1:E4', orientation: 1 }],
    ['stockVOHLC', { fixture: 'stock', range: 'A1:F4', orientation: 1 }],
    ['boxWhisker', {}],
    ['funnel', {}],
    ['paretoLine', {}],
    ['sunburst', {}],
    ['treemap', {}],
    ['waterfall', {}],
    ['regionMap', {}],
  ]).map(([name, extra]) => ({
    name: `type-${name}`,
    dump: true,
    chart: { chartType: name, ...extra },
    steps: [{ label: 'initial' }, { label: 'second-setup', rechart: { chartType: name, ...extra } }],
  })),
  {
    name: 'title-legend',
    chart: { chartType: 'columnClustered' },
    steps: [
      { label: 'title-text', ops: [['chart.title', [{ text: 'Sales Report' }]]] },
      { label: 'title-font', ops: [['chart.title', [{ fontSize: 24, bold: true }]]] },
      { label: 'legend-top', ops: [['chart.legend', [{ position: 1 }]]] },
      { label: 'legend-left', ops: [['chart.legend', [{ position: 3 }]]] },
      { label: 'legend-right', ops: [['chart.legend', [{ position: 2 }]]] },
      { label: 'legend-hidden', ops: [['chart.legend', [{ visible: false }]]] },
      { label: 'legend-shown', ops: [['chart.legend', [{ visible: true, position: 4 }]]] },
    ],
  },
  {
    name: 'axis-scale',
    chart: { chartType: 'columnClustered' },
    steps: [
      { label: 'value-min-max-unit', ops: [['chart.axes', [{ primaryValue: { min: 0, max: 20, majorUnit: 5 } }]]] },
      { label: 'gridline-off', ops: [['chart.axes', [{ primaryValue: { majorGridLine: { visible: false } } }]]] },
      { label: 'category-hidden', ops: [['chart.axes', [{ primaryCategory: { visible: false } }]]] },
      { label: 'category-shown', ops: [['chart.axes', [{ primaryCategory: { visible: true } }]]] },
      { label: 'orientation-switch', ops: [['chart.switchDataOrientation', []]] },
      { label: 'orientation-switch-back', ops: [['chart.switchDataOrientation', []]] },
    ],
  },
  {
    name: 'data-labels',
    chart: { chartType: 'columnClustered' },
    steps: [
      { label: 'show-value', ops: [['chart.dataLabels', [{ showValue: true }]]] },
      { label: 'format', ops: [['chart.dataLabels', [{ showValue: true, format: '0.0' }]]] },
    ],
  },
  // TASK 39 family 5: chart elements through the public API.
  {
    name: 'elements-axis-title',
    chart: { chartType: 'columnClustered' },
    steps: [
      { label: 'value-title', ops: [['chart.axes', [{ primaryValue: { title: { text: 'Sales' } } }]]] },
      { label: 'cat-title', ops: [['chart.axes', [{ primaryCategory: { title: { text: 'Quarter' } } }]]] },
      { label: 'title-style', ops: [['chart.axes', [{ primaryValue: { title: { text: 'Sales', fontSize: 16, bold: true, color: 'red' } } }]]] },
    ],
  },
  {
    name: 'elements-gridlines',
    chart: { chartType: 'columnClustered' },
    steps: [
      { label: 'major-style', ops: [['chart.axes', [{ primaryValue: { majorGridLine: { visible: true, width: 2, color: 'rgb(255,0,0)', dashStyle: 1 } } }]]] },
      { label: 'minor-on', ops: [['chart.axes', [{ primaryValue: { minorGridLine: { visible: true } } }]]] },
      { label: 'ticks', ops: [['chart.axes', [{ primaryValue: { majorTickPosition: 1, minorTickPosition: 1 } }]]] },
      { label: 'line-style', ops: [['chart.axes', [{ primaryValue: { lineStyle: { color: 'blue', width: 2 } } }]]] },
    ],
  },
  {
    name: 'elements-axis-format',
    chart: { chartType: 'columnClustered' },
    steps: [
      { label: 'fmt-000', ops: [['chart.axes', [{ primaryValue: { format: '0.00' } }]]] },
      { label: 'fmt-currency', ops: [['chart.axes', [{ primaryValue: { format: '$#,##0' } }]]] },
      { label: 'axis-style', ops: [['chart.axes', [{ primaryCategory: { style: { fontSize: 16, color: 'red' } } }]]] },
    ],
  },
  {
    name: 'elements-dlabels-column',
    chart: { chartType: 'columnClustered' },
    steps: [
      { label: 'pos-0', ops: [['chart.dataLabels', [{ showValue: true, position: 0 }]]] },
      { label: 'pos-1', ops: [['chart.dataLabels', [{ showValue: true, position: 1 }]]] },
      { label: 'pos-2', ops: [['chart.dataLabels', [{ showValue: true, position: 2 }]]] },
      { label: 'pos-3', ops: [['chart.dataLabels', [{ showValue: true, position: 3 }]]] },
      { label: 'pos-4', ops: [['chart.dataLabels', [{ showValue: true, position: 4 }]]] },
      { label: 'pos-5', ops: [['chart.dataLabels', [{ showValue: true, position: 5 }]]] },
      { label: 'pos-6', ops: [['chart.dataLabels', [{ showValue: true, position: 6 }]]] },
      { label: 'pos-7', ops: [['chart.dataLabels', [{ showValue: true, position: 7 }]]] },
      { label: 'pos-8', ops: [['chart.dataLabels', [{ showValue: true, position: 8 }]]] },
      { label: 'style', ops: [['chart.dataLabels', [{ showValue: true, position: 3, fontSize: 16, color: 'red', fontBold: true }]]] },
      { label: 'cat-name', ops: [['chart.dataLabels', [{ showCategoryName: true }]]] },
    ],
  },
  {
    name: 'elements-dlabels-line',
    chart: { chartType: 'line' },
    steps: [
      { label: 'pos-0', ops: [['chart.dataLabels', [{ showValue: true, position: 0 }]]] },
      { label: 'pos-1', ops: [['chart.dataLabels', [{ showValue: true, position: 1 }]]] },
      { label: 'pos-2', ops: [['chart.dataLabels', [{ showValue: true, position: 2 }]]] },
      { label: 'pos-4', ops: [['chart.dataLabels', [{ showValue: true, position: 4 }]]] },
      { label: 'pos-6', ops: [['chart.dataLabels', [{ showValue: true, position: 6 }]]] },
      { label: 'pos-8', ops: [['chart.dataLabels', [{ showValue: true, position: 8 }]]] },
    ],
  },
  {
    name: 'elements-dlabels-bar',
    chart: { chartType: 'barClustered' },
    steps: [
      { label: 'pos-0', ops: [['chart.dataLabels', [{ showValue: true, position: 0 }]]] },
      { label: 'pos-1', ops: [['chart.dataLabels', [{ showValue: true, position: 1 }]]] },
      { label: 'pos-2', ops: [['chart.dataLabels', [{ showValue: true, position: 2 }]]] },
      { label: 'pos-3', ops: [['chart.dataLabels', [{ showValue: true, position: 3 }]]] },
      { label: 'pos-4', ops: [['chart.dataLabels', [{ showValue: true, position: 4 }]]] },
      { label: 'pos-5', ops: [['chart.dataLabels', [{ showValue: true, position: 5 }]]] },
      { label: 'pos-7', ops: [['chart.dataLabels', [{ showValue: true, position: 7 }]]] },
      { label: 'pos-8', ops: [['chart.dataLabels', [{ showValue: true, position: 8 }]]] },
    ],
  },
  {
    name: 'elements-dlabels-pie',
    chart: { chartType: 'pie' },
    steps: [
      { label: 'pos-1', ops: [['chart.dataLabels', [{ showValue: true, position: 1 }]]] },
      { label: 'pos-3', ops: [['chart.dataLabels', [{ showValue: true, position: 3 }]]] },
      { label: 'pos-4', ops: [['chart.dataLabels', [{ showValue: true, position: 4 }]]] },
      { label: 'pos-6', ops: [['chart.dataLabels', [{ showValue: true, position: 6 }]]] },
      { label: 'pos-8', ops: [['chart.dataLabels', [{ showValue: true, position: 8 }]]] },
    ],
  },
  {
    name: 'elements-dlabels-area',
    chart: { chartType: 'area' },
    steps: [
      { label: 'pos-0', ops: [['chart.dataLabels', [{ showValue: true, position: 0 }]]] },
      { label: 'pos-2', ops: [['chart.dataLabels', [{ showValue: true, position: 2 }]]] },
      { label: 'pos-6', ops: [['chart.dataLabels', [{ showValue: true, position: 6 }]]] },
    ],
  },
  {
    name: 'elements-dlabels-scatter',
    chart: { chartType: 'xyScatter' },
    steps: [
      { label: 'pos-0', ops: [['chart.dataLabels', [{ showValue: true, position: 0 }]]] },
      { label: 'pos-1', ops: [['chart.dataLabels', [{ showValue: true, position: 1 }]]] },
      { label: 'pos-2', ops: [['chart.dataLabels', [{ showValue: true, position: 2 }]]] },
      { label: 'pos-6', ops: [['chart.dataLabels', [{ showValue: true, position: 6 }]]] },
      { label: 'pos-8', ops: [['chart.dataLabels', [{ showValue: true, position: 8 }]]] },
    ],
  },
  {
    name: 'elements-legend-style',
    chart: { chartType: 'columnClustered' },
    steps: [
      { label: 'size', ops: [['chart.legend', [{ fontSize: 16 }]]] },
      { label: 'backcolor', ops: [['chart.legend', [{ fontSize: 16, backColor: 'rgb(255,255,0)' }]]] },
    ],
  },
  {
    name: 'elements-errorbars',
    chart: { chartType: 'columnClustered' },
    steps: [
      { label: 'vertical-fixed', ops: [['series.set', [0, { errorBars: { vertical: { type: 0, valueType: 1, value: 1 } } }]]] },
      { label: 'plus-pct', ops: [['series.set', [0, { errorBars: { vertical: { type: 2, valueType: 2, value: 20, noEndCap: true, style: { color: 'red', width: 2 } } } }]]] },
    ],
  },
  {
    name: 'elements-trendline',
    chart: { chartType: 'line' },
    steps: [
      { label: 'linear', ops: [['series.set', [0, { trendlines: [{ type: 1 }] }]]] },
      { label: 'style', ops: [['series.set', [0, { trendlines: [{ type: 1, intercept: 1, style: { color: 'red', width: 2, dashStyle: 1 } }] }]]] },
    ],
  },
  {
    name: 'data-labels-pie',
    chart: { chartType: 'pie' },
    steps: [
      { label: 'show-percentage', ops: [['chart.dataLabels', [{ showPercentage: true }]]] },
      { label: 'show-value-center', ops: [['chart.dataLabels', [{ showValue: true, position: 2 }]]] },
    ],
  },
  {
    name: 'series-ops',
    chart: { chartType: 'columnClustered' },
    steps: [
      { label: 'add-same-type', ops: [['series.add', [{ name: 'Sheet1!$B$1', xValues: 'Sheet1!$A$2:$A$4', yValues: 'Sheet1!$B$2:$B$4' }]]] },
      { label: 'add-line', ops: [['series.add', [{ chartType: 9, name: 'Sheet1!$C$1', xValues: 'Sheet1!$A$2:$A$4', yValues: 'Sheet1!$C$2:$C$4' }]]] },
      { label: 'set-0', ops: [['series.set', [0, { name: 'Sheet1!$D$1', xValues: 'Sheet1!$A$2:$A$4', yValues: 'Sheet1!$D$2:$D$4' }]]] },
      { label: 'remove-1', ops: [['series.remove', [1]]] },
      { label: 'remove-0', ops: [['series.remove', [0]]] },
    ],
  },
  {
    name: 'series-secondary',
    chart: { chartType: 'columnClustered' },
    steps: [
      { label: 'add-secondary-line', ops: [['series.add', [{ chartType: 9, axisGroup: 1, name: 'Sheet1!$C$1', xValues: 'Sheet1!$A$2:$A$4', yValues: 'Sheet1!$C$2:$C$4' }]]] },
    ],
  },
  {
    name: 'edit-cells',
    chart: { chartType: 'columnClustered' },
    steps: [
      { label: 'edit-value', ops: [['sheet.setValue', [2, 1, 42]]] },
      { label: 'edit-name', ops: [['sheet.setValue', [3, 0, 'Pineapple']] ] },
      { label: 'clear-value', ops: [['sheet.setValue', [1, 3, null]] ] },
    ],
  },
  {
    name: 'row-ops',
    chart: { chartType: 'columnClustered' },
    steps: [
      { label: 'insert-row-inside', ops: [['sheet.insertRows', [2, 1]]] },
      { label: 'remove-row-inside', ops: [['sheet.removeRows', [2, 1]]] },
      { label: 'insert-row-before', ops: [['sheet.insertRows', [0, 1]]] },
      { label: 'remove-row-before', ops: [['sheet.removeRows', [0, 1]]] },
    ],
  },
  {
    name: 'column-ops',
    chart: { chartType: 'columnClustered' },
    steps: [
      { label: 'insert-col-inside', ops: [['sheet.insertColumns', [2, 1]]] },
      { label: 'remove-col-inside', ops: [['sheet.removeColumns', [2, 1]]] },
    ],
  },
  {
    name: 'geometry',
    chart: { chartType: 'line' },
    steps: [
      { label: 'set-xy-wh', ops: [['chart.x', [120]], ['chart.y', [200]], ['chart.width', [380]], ['chart.height', [160]]] },
      { label: 'click-chart', click: [0.5, 0.5] },
      { label: 'drag-move', drag: { from: [0.5, 0.5], dx: 40, dy: 24 } },
      { label: 'drag-resize', drag: { from: [1, 1], dx: 60, dy: 40 } },
    ],
  },
  {
    name: 'data-range',
    chart: { chartType: 'columnClustered' },
    steps: [
      { label: 'range-shrink', ops: [['chart.dataRange', ['A1:D3']]] },
      { label: 'range-grow', ops: [['chart.dataRange', ['A1:E5']]] },
      { label: 'range-orientation-keep', ops: [['chart.dataRange', ['A1:D4']]] },
    ],
  },
  {
    name: 'roundtrip',
    dump: true,
    chart: { chartType: 'lineMarkers' },
    steps: [
      { label: 'configure', ops: [['chart.title', [{ text: 'T' }]], ['chart.legend', [{ position: 3 }]], ['chart.dataLabels', [{ showValue: true }]]] },
      { label: 'after-roundtrip', roundTrip: true },
    ],
  },
  {
    name: 'style-ops',
    chart: { chartType: 'columnClustered' },
    steps: [
      { label: 'chart-area', ops: [['chart.chartArea', [{ backColor: 'yellow', border: { color: 'blue', width: 2 } }]]] },
      { label: 'plot-area', ops: [['chart.plotArea', [{ backColor: 'rgb(240,240,240)' }]]] },
      { label: 'color-scheme', ops: [['chart.colorScheme', [[0, ['red', 'green', 'blue']]]]] },
      { label: 'gap-overlap', ops: [['series.set', [0, { gapWidth: 0.5, overlap: 0.2 }]]] },
      { label: 'ignore-hidden', ops: [['chart.ignoreHidden', [false]]] },
      { label: 'blanks', ops: [['chart.displayBlanksAs', [2]]] },
      { label: 'animation', ops: [['chart.useAnimation', [true]]] },
      { label: 'na-blank', ops: [['chart.displayNaAsBlank', [true]]] },
      { label: 'hide-row', ops: [['sheet.hideRows', [2, 1]]] },
    ],
  },
  {
    name: 'remove-chart',
    chart: { chartType: 'area' },
    steps: [
      { label: 'before' },
      { label: 'removed', ops: [['charts.remove', ['Chart1']]] },
    ],
  },
];

/* ---------- driver ---------- */
const server = await createServer({ root, logLevel: 'error', server: { port: Number(process.env.CMP_PORT ?? 5187), strictPort: true },
  // Serve our workspace build directly; pre-bundling caches stale dist copies.
  optimizeDeps: { exclude: ['@opensheets/spread-sheets'] } });
let browser;
let totalDiffs = 0;
const report = [];
try {
  await server.listen();
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1560, height: 600 } });
  const consoleErrors = [];
  page.on('pageerror', error => consoleErrors.push(String(error.message)));
  await page.goto(new URL('chart-comparison.html', server.resolvedUrls.local[0]).href);
  await page.waitForFunction(() => !!window.__csReady, null, { timeout: 60000 });

  const snap = async kind => normalize(await page.evaluate(k => window.cs.state(k), kind));
  const settle = ms => page.waitForTimeout(ms);
  const park = async () => { await page.mouse.move(5, 5); await settle(200); };
  const geom = async kind => page.evaluate(k => window.cs.geom(k), kind);

  async function takeShot(scenario, label, kind) {
    const file = path.join(outDir, `${scenario}__${label}__${kind}.png`);
    const g = await geom(kind);
    await page.screenshot({ clip: g.clip, path: file });
    return file;
  }
  async function shotDiff(scenario, label) {
    const a = PNG.sync.read(fs.readFileSync(path.join(outDir, `${scenario}__${label}__official.png`)));
    const b = PNG.sync.read(fs.readFileSync(path.join(outDir, `${scenario}__${label}__ours.png`)));
    const cx = Math.min(a.width, b.width);
    const cy = Math.min(a.height, b.height);
    const crop = src => {
      const out = new PNG({ width: cx, height: cy });
      for (let y = 0; y < cy; y++)
        for (let x = 0; x < cx; x++) {
          const si = ((y * src.width) + x) << 2;
          const di = ((y * cx) + x) << 2;
          for (let c = 0; c < 4; c++) out.data[di + c] = src.data[si + c];
        }
      return out;
    };
    const ca = crop(a);
    const cb = crop(b);
    const diff = new PNG({ width: cx, height: cy });
    const changed = pixelmatch(ca.data, cb.data, diff.data, cx, cy, { threshold: 0.1 });
    fs.writeFileSync(path.join(outDir, `${scenario}__${label}__diff.png`), PNG.sync.write(diff));
    return (changed / (cx * cy) * 100).toFixed(2);
  }

  for (const scenario of scenarios.filter(s => !scenarioFilter || scenarioFilter.test(s.name))) {
    console.log(`\n== scenario ${scenario.name} ==`);
    const chartOpts = scenario.chart ?? {};
    await page.evaluate(([k, o]) => window.cs.setup(k, o), ['official', chartOpts]);
    await page.evaluate(([k, o]) => window.cs.setup(k, o), ['ours', chartOpts]);
    await settle(700);
    for (const step of scenario.steps) {
      if (step.rechart) {
        const opts = { ...chartOpts, ...step.rechart };
        await page.evaluate(([k, o]) => window.cs.setup(k, o), ['official', opts]);
        await page.evaluate(([k, o]) => window.cs.setup(k, o), ['ours', opts]);
        await settle(700);
      }
      if (step.ops) {
        for (const kind of ['official', 'ours']) {
          const resolved = step.ops.map(([p, a]) => [p, resolveMarkers(a)]);
          await page.evaluate(([k, o]) => window.cs.apply(k, o), [kind, resolved]);
        }
      }
      if (step.roundTrip) {
        await page.evaluate(() => window.cs.roundTrip('official'));
        await page.evaluate(() => window.cs.roundTrip('ours'));
      }
      const gesture = async kind => {
        const g = await geom(kind);
        if (step.click) {
          await page.mouse.click(g.left + g.width * step.click[0], g.top + g.height * step.click[1]);
        } else if (step.drag) {
          const fx = g.left + g.width * step.drag.from[0];
          const fy = g.top + g.height * step.drag.from[1];
          await page.mouse.move(fx, fy);
          await page.mouse.down();
          await page.mouse.move(fx + step.drag.dx, fy + step.drag.dy, { steps: 8 });
          await page.mouse.up();
        }
      };
      if (step.click || step.drag) {
        await gesture('official');
        await settle(250);
        await gesture('ours');
        await settle(250);
      }
      await settle(400);
      await park();
      // A runtime that cannot create the chart type at all has nothing to shoot.
      const bothLive = await page.evaluate(ks => ks.every(k => !!window.cs.geom && window.cs.hasChart(k)), ['official', 'ours']);
      let diffPct = 'n/a';
      if (bothLive) {
        await takeShot(scenario.name, step.label, 'official');
        await takeShot(scenario.name, step.label, 'ours');
        diffPct = await shotDiff(scenario.name, step.label);
      }
      const official = await snap('official');
      const ours = await snap('ours');
      const diffs = [];
      diffValues(official, ours, step.label, diffs);
      totalDiffs += diffs.length;
      console.log(`step ${step.label}: ${diffs.length === 0 ? 'JSON/STATE MATCH' : `DIFFS=${diffs.length}`} shot diff ${diffPct}%`);
      for (const line of diffs.slice(0, 24)) console.log(`   ${line}`);
      if (scenario.dump) {
        fs.writeFileSync(path.join(outDir, `${scenario.name}-official.json`), JSON.stringify(official, null, 2));
        fs.writeFileSync(path.join(outDir, `${scenario.name}-ours.json`), JSON.stringify(ours, null, 2));
      }
      report.push({ scenario: scenario.name, step: step.label, diffs: diffs.length, diffPct });
    }
    await page.evaluate(() => { window.cs.dispose('official'); window.cs.dispose('ours'); });
  }

  if (consoleErrors.length) console.log('page errors:', consoleErrors.slice(0, 5).join(' | '));
  console.log(`\nSUMMARY: total state-field diffs (no threshold): ${totalDiffs}`);
  for (const row of report) console.log(`  ${row.scenario}/${row.step}: diffs=${row.diffs} shot=${row.diffPct}%`);
  console.log(`artifacts: ${outDir}`);
} finally {
  await browser?.close();
  await server.close();
}

/** `{__e:'ChartType.pie'}` stays a marker; the page resolves it against its GC. */
function resolveMarkers(args) { return args ?? []; }
