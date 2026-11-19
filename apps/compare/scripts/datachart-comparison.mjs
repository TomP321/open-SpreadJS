#!/usr/bin/env node
/* Black-box DataCharts comparison (TASK 45 — report only, no thresholds).

   Runs the same data-chart scenarios against the official trial runtime
   (@mescius/spread-sheets 19.2.5 + @mescius/spread-sheets-datacharts-addon)
   and @opensheets/spread-sheets in ONE page. Every step compares, field by
   field:
     - dataChart.getChartConfig(),
     - the sheet-JSON `shapes` section (trial stores data charts there,
       shapeType 9),
     - geometry/anchor/flag accessors and the manager state,
   and pixel-diffs a screenshot crop of the data chart (diff %, numbers
   only). Table edits (live refresh) and row ops (anchoring) are covered.

   Run: node apps/compare/scripts/datachart-comparison.mjs  (exit 0 = ran) */
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
const outDir = path.join(repo, '.probe', 'datachart-comparison', arg('--out', 'v1'));
fs.mkdirSync(outDir, { recursive: true });

/* ---------- diff helpers ---------- */
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

/** Inside JSON trees `null` and a missing key serialise the same way. */
function dropNulls(json) {
  if (!json || typeof json !== 'object') return json;
  if (Array.isArray(json)) { json.forEach(dropNulls); return json; }
  for (const [key, value] of Object.entries(json)) {
    if (value === null) delete json[key];
    else dropNulls(value);
  }
  return json;
}

/** The trial stamps random cNvPr ids per workbook; normalise them away. */
function normalize(state) {
  const walk = json => {
    if (!json || typeof json !== 'object') return;
    if (Array.isArray(json)) { json.forEach(walk); return; }
    for (const [key, value] of Object.entries(json)) {
      if (key === 'id' && typeof value === 'number') json[key] = '<id>';
      else walk(value);
    }
  };
  for (const json of [state.sheetShapes]) walk(json);
  dropNulls(state.sheetShapes ?? {});
  if (Array.isArray(state.sheetTopKeys)) state.sheetTopKeys = state.sheetTopKeys.slice().sort().join(',');
  return state;
}

/* ---------- scenario table ---------- */
const E = name => ({ __e: name });
const COL = E('DataChartType.column');
const ENC_BASIC = { values: [{ field: 'Sales', aggregate: E('Aggregate.sum') }], category: { field: 'Product' } };
const ENC_COLOR = { values: [{ field: 'Sales', aggregate: E('Aggregate.sum') }], category: { field: 'Product' }, color: { field: 'Region' } };
const ENC_SCATTER = { values: [{ field: 'Y', aggregate: E('Aggregate.sum') }, { field: 'X', aggregate: E('Aggregate.sum') }] };
const ENC_BUBBLE = { ...ENC_SCATTER, size: { field: 'Size', aggregate: E('Aggregate.sum') } };
const ENC_HIER = { values: [{ field: 'Sales', aggregate: E('Aggregate.sum') }], category: { field: 'Category', child: { field: 'Product' } } };
const ENC_RANGE = { values: [{ vectors: { lower: { field: 'Qty', aggregate: E('Aggregate.min') }, upper: { field: 'Sales', aggregate: E('Aggregate.max') } } }], category: { field: 'Product' } };
const ENC_STOCK = { values: [{ vectors: { open: { field: 'Open', aggregate: E('Aggregate.sum') }, high: { field: 'High', aggregate: E('Aggregate.sum') }, low: { field: 'Low', aggregate: E('Aggregate.sum') }, close: { field: 'Close', aggregate: E('Aggregate.sum') } } }], category: { field: 'Product' } };
const ENC_PIE = { values: [{ field: 'Sales', aggregate: E('Aggregate.sum') }], category: { field: 'Product' }, color: { field: 'Product' } };

const cfg = (type, encodings, extra = {}) => ({
  setup: { type: E(`DataChartType.${type}`), config: { tableName: 'Sales', plots: [{ type: E(`DataChartType.${type}`), encodings, ...extra }] } },
});

const cartesianTypes = ['column', 'stackedColumn', 'percentStackedColumn', 'bar', 'stackedBar', 'percentStackedBar',
  'line', 'area', 'stackedArea', 'percentStackedArea'];
const scenarios = [];
for (const type of [...cartesianTypes, 'rangeColumn', 'rangeBar', 'rangeArea',
  'pie', 'donut', 'rose', 'sunburst', 'radialStackedBar', 'polarCoordinatesBar', 'polarCoordinatesStackedBar',
  'radar', 'filledRadar', 'scatter', 'bubble', 'treemap', 'funnel', 'waterfall', 'candlestick', 'ohlc']) {
  const enc = /scatter/i.test(type) ? ENC_SCATTER : /bubble/i.test(type) ? ENC_BUBBLE
    : /sunburst|treemap/i.test(type) ? ENC_HIER : /range/i.test(type) ? ENC_RANGE
      : /candlestick|ohlc/i.test(type) ? ENC_STOCK : /pie|donut|rose/i.test(type) ? ENC_PIE : ENC_BASIC;
  scenarios.push({ name: `type-${type}`, dump: true, ...cfg(type, enc), steps: [{ label: 'initial' }] });
}
scenarios.push(
  { name: 'bare-default', dump: true, setup: { type: 'column', withTable: false }, steps: [{ label: 'initial' }] },
  { name: 'blank-pie', dump: true, setup: { type: 'pie', withTable: false }, steps: [{ label: 'initial' }] },
  { name: 'blank-line', dump: true, setup: { type: 'line', withTable: false }, steps: [{ label: 'initial' }] },
  { name: 'header-title', ...cfg('column', ENC_COLOR), steps: [
    { label: 'title', ops: [['dc.setChartConfig', [{ tableName: 'Sales', config: { header: { title: 'Sales by Product' } } }, '@PLOTS_COLOR']]] },
    { label: 'title-hidden', ops: [['dc.setChartConfig', [{ tableName: 'Sales' }, '@PLOTS_COLOR']]] },
  ] },
  { name: 'color-category', dump: true, ...cfg('column', { ...ENC_BASIC, color: { field: 'Category' } }), steps: [{ label: 'initial' }] },
  { name: 'stacked-color', dump: true, ...cfg('stackedColumn', ENC_COLOR), steps: [{ label: 'initial' }] },
  { name: 'percent-stacked-color', dump: true, ...cfg('percentStackedColumn', ENC_COLOR), steps: [{ label: 'initial' }] },
  { name: 'aggregates', dump: true, ...cfg('column', { values: [{ field: 'Sales', aggregate: E('Aggregate.average') }], category: { field: 'Region' } }), steps: [
    { label: 'avg', ops: [] },
    { label: 'max', ops: [['dc.setChartConfig', [{ tableName: 'Sales' }, [{ type: COL, encodings: { values: [{ field: 'Sales', aggregate: E('Aggregate.max') }], category: { field: 'Region' } } } ]]]] },
    { label: 'count', ops: [['dc.setChartConfig', [{ tableName: 'Sales' }, [{ type: COL, encodings: { values: [{ field: 'Sales', aggregate: E('Aggregate.count') }], category: { field: 'Region' } } } ]]]] },
  ] },
  { name: 'filter', dump: true, ...cfg('column', { ...ENC_BASIC, filter: { field: 'Region', operate: E('ComparisonOperator.equalsTo'), value: 'North' } }), steps: [{ label: 'initial' }] },
  { name: 'sort', dump: true, ...cfg('column', { values: [{ field: 'Sales', aggregate: E('Aggregate.sum') }], category: { field: 'Product', sort: { field: 'Sales', aggregate: E('Aggregate.sum'), order: E('OrderType.descending') } } }), steps: [{ label: 'initial' }] },
  { name: 'infer-encodings', dump: true, setup: { type: 'column', config: { tableName: 'Sales', plots: [{ type: COL, encodings: ENC_BASIC }] }, infer: true }, steps: [{ label: 'initial' }] },
  { name: 'value-names', dump: true, ...cfg('column', { values: [{ field: 'Sales', aggregate: E('Aggregate.sum') }, { field: 'Qty', aggregate: E('Aggregate.sum') }], category: { field: 'Product' }, color: { field: 'VALUE_NAMES' } }), steps: [{ label: 'initial' }] },
  { name: 'data-labels', dump: true, setup: { type: 'column', config: { tableName: 'Sales', plots: [{ type: COL, encodings: ENC_BASIC, config: { text: [{ position: E('TextPosition.outside') }] } }] } }, steps: [{ label: 'initial' }] },
  { name: 'tooltip-details', dump: true, ...cfg('column', { ...ENC_BASIC, details: [{ field: 'Region' }] }), steps: [
    { label: 'plain' },
    { label: 'hover-juice', hover: [0.18, 0.70] },
    { label: 'hover-milk', hover: [0.40, 0.35] },
  ] },
  { name: 'tooltip-enc', dump: true, setup: { type: 'column', config: { tableName: 'Sales', plots: [{ type: COL, encodings: { values: [{ field: 'Sales', aggregate: E('Aggregate.sum') }], category: { field: 'Product' }, details: [{ field: 'Region' }], tooltip: [{ field: 'Sales' }, { field: 'Region' }] } }] } }, steps: [
    { label: 'hover-juice', hover: [0.18, 0.70] },
  ] },
  { name: 'axis-format', dump: true, setup: { type: 'column', config: { tableName: 'Sales', config: { plotAreas: [{ axes: [{ type: E('AxisType.y'), format: { value: ',.0f' } }] }] }, plots: [{ type: COL, encodings: ENC_BASIC }] } }, steps: [{ label: 'initial' }] },
  { name: 'palette-config', dump: true, setup: { type: 'column', config: { tableName: 'Sales', config: { palette: [{ color: { type: 'CssColor', color: 'red' } }, { color: { type: 'CssColor', color: 'blue' } }] }, plots: [{ type: COL, encodings: ENC_COLOR }] } }, steps: [{ label: 'initial' }] },
  { name: 'line-symbols', dump: true, setup: { type: 'line', config: { tableName: 'Sales', plots: [{ type: E('DataChartType.line'), encodings: ENC_COLOR, config: { symbols: true } }] } }, steps: [{ label: 'initial' }] },
  { name: 'geometry', setup: { type: 'column', config: { tableName: 'Sales', plots: [{ type: COL, encodings: ENC_BASIC }] } }, steps: [
    { label: 'set-xy-wh', ops: [['dc.x', [80]], ['dc.y', [60]], ['dc.width', [400]], ['dc.height', [260]]] },
    { label: 'anchor-set', ops: [['dc.startRow', [5]], ['dc.endColumn', [12]]] },
  ] },
  { name: 'row-ops', setup: { type: 'column', config: { tableName: 'Sales', plots: [{ type: COL, encodings: ENC_BASIC }] } }, steps: [
    { label: 'add-rows', ops: [['sheet.addRows', [0, 2]]] },
    { label: 'remove-rows', ops: [['sheet.deleteRows', [0, 2]]] },
  ] },
  { name: 'refresh-table', dump: true, ...cfg('column', ENC_BASIC), steps: [
    { label: 'initial' },
    { label: 'inserted', tableOp: ['insertItem', 0, { Product: 'New', Sales: 900, Region: 'East', Category: 'Food', Child: 'A', Year: 2022, X: 1, Y: 1, Size: 5, Open: 1, High: 2, Low: 1, Close: 2, Qty: 1, Date: '2022-05-01' }] },
    { label: 'updated', tableOp: ['updateItem', 0, { Sales: 50 }] },
    { label: 'removed', tableOp: ['removeItems', [0]] },
  ] },
  { name: 'roundtrip', dump: true, setup: { type: 'column', config: { tableName: 'Sales', config: { header: { title: 'RT' } }, plots: [{ type: COL, encodings: ENC_COLOR }] } }, steps: [
    { label: 'configured' },
    { label: 'after-roundtrip', roundTrip: true },
  ] },
  { name: 'collection-ops', setup: { type: 'column', withTable: false }, steps: [
    { label: 'second-added', ops: [['dcs.add', ['Second', 60, 60, 200, 150, E('DataChartType.pie')]]] },
    { label: 'zindex', ops: [['dcs.zIndex', ['DataChart1', 1]]] },
    { label: 'removed', ops: [['dcs.remove', ['DataChart1']]] },
    { label: 'cleared', ops: [['dcs.clear', []]] },
  ] },
  { name: 'flags', setup: { type: 'column', config: { tableName: 'Sales', plots: [{ type: COL, encodings: ENC_BASIC }] } }, steps: [
    { label: 'hidden', ops: [['dc.isVisible', [false]]] },
    { label: 'shown', ops: [['dc.isVisible', [true]]] },
    { label: 'flags-set', ops: [['dc.allowMove', [false]], ['dc.allowResize', [false]], ['dc.canPrint', [false]], ['dc.alt', ['hello']]] },
  ] },
);

/* Placeholder marker for plot lists reused across steps. */
const PLOTS_COLOR = [{ type: COL, encodings: ENC_COLOR }];

/* ---------- driver ---------- */
const server = await createServer({ root, logLevel: 'error', server: { port: Number(process.env.CMP_PORT ?? 5187), strictPort: true },
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
  await page.goto(new URL('datachart-comparison.html', server.resolvedUrls.local[0]).href);
  await page.waitForFunction(() => !!window.__dcReady, null, { timeout: 60000 });

  const snap = async kind => normalize(await page.evaluate(k => window.dc.state(k), kind));
  const settle = ms => page.waitForTimeout(ms);
  const park = async () => { await page.mouse.move(5, 5); await settle(150); };
  const geom = async kind => page.evaluate(k => window.dc.geom(k), kind);

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
    const changed = pixelmatch(crop(a).data, crop(b).data, new PNG({ width: cx, height: cy }).data, cx, cy, { threshold: 0.1 });
    return (changed / (cx * cy) * 100).toFixed(2);
  }

  for (const scenario of scenarios.filter(s => !scenarioFilter || scenarioFilter.test(s.name))) {
    console.log(`\n== scenario ${scenario.name} ==`);
    const setupOpts = scenario.setup ?? {};
    const setupResolved = kind => page.evaluate(([k, o]) => window.dc.setup(k, o), [kind, JSON.parse(JSON.stringify(setupOpts))]);
    await page.evaluate(() => { /* reset marker cache */ window.__PLOTS_COLOR__ = null; });
    const resOfficial = await setupResolved('official');
    const resOurs = await setupResolved('ours');
    await settle(650);
    for (const step of scenario.steps) {
      if (step.ops) {
        for (const kind of ['official', 'ours']) {
          const resolved = step.ops.map(([p, a]) => [p, (a ?? []).map(v => v === '@PLOTS_COLOR' ? PLOTS_COLOR : v)]);
          await page.evaluate(([k, o]) => window.dc.apply(k, o), [kind, resolved]);
        }
      }
      if (step.tableOp) {
        for (const kind of ['official', 'ours']) await page.evaluate(([k, o]) => window.dc.tableOp(k, o), [kind, step.tableOp]);
      }
      if (step.roundTrip) {
        for (const kind of ['official', 'ours']) await page.evaluate(k => window.dc.roundTrip(k), kind);
      }
      await settle(400);
      let tooltipDiffs = [];
      if (step.hover) {
        // Hover the same relative point of each chart and compare the tooltip
        // texts (positions rounded to 16 px).
        const tips = {};
        for (const kind of ['official', 'ours']) {
          const g = await geom(kind);
          await page.mouse.move(g.clip.x + g.clip.width * step.hover[0], g.clip.y + g.clip.height * step.hover[1]);
          await settle(450);
          tips[kind] = await page.evaluate(k => window.dc.tooltipProbe(k), kind);
          await page.mouse.move(5, 5);
          await settle(150);
        }
        diffValues(tips.official, tips.ours, `${step.label}.tooltip`, tooltipDiffs);
        // The trial's tooltip does not open under synthetic (CDP) mouse moves
        // in headless Chromium, so its text cannot be diffed black-box here.
        // Rows stay informational (not counted in totalDiffs).
        if (tooltipDiffs.length && Array.isArray(tips.official) && tips.official.length)
            console.log(`   tooltip diffs: ${tooltipDiffs.join(' | ')}`);
        else if (tooltipDiffs.length)
            console.log(`   tooltip ours=${JSON.stringify(tips.ours)} (trial tooltip not triggerable headless)`);
      }
      await park();
      const bothLive = await page.evaluate(ks => ks.every(k => window.dc.hasChart(k)), ['official', 'ours']);
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
      for (const line of diffs.slice(0, 20)) console.log(`   ${line}`);
      if (scenario.dump) {
        fs.writeFileSync(path.join(outDir, `${scenario.name}-official.json`), JSON.stringify(official, null, 2));
        fs.writeFileSync(path.join(outDir, `${scenario.name}-ours.json`), JSON.stringify(ours, null, 2));
      }
      report.push({ scenario: scenario.name, step: step.label, diffs: diffs.length, diffPct });
    }
    await page.evaluate(() => { window.dc.dispose('official'); window.dc.dispose('ours'); });
    void resOfficial; void resOurs;
  }

  if (consoleErrors.length) console.log('page errors:', consoleErrors.slice(0, 5).join(' | '));
  console.log(`\nSUMMARY: total state-field diffs (no threshold): ${totalDiffs}`);
  for (const row of report) console.log(`  ${row.scenario}/${row.step}: diffs=${row.diffs} shot=${row.diffPct}%`);
  console.log(`artifacts: ${outDir}`);
} finally {
  await browser?.close();
  await server.close();
}
