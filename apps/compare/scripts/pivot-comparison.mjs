#!/usr/bin/env node
/* Black-box pivot comparison (TASK 41).

   Runs the same pivot scenarios against the official trial runtime
   (@mescius/spread-sheets 19.2.5 + @mescius/spread-sheets-pivot-addon) and
   @opensheets/spread-sheets in ONE page, on the sheet that holds the pivot.
   Per scenario it compares, field by field:
     - pivotTable.serialize() (public API shape),
     - the pivot node grid: getNodeInfo/getNodeValue at every content cell
       (this is how the trial exposes pivot cell values),
     - quick getters (getSource/getFieldsByArea/getRange/getThemeName/...),
     - the full workbook toJSON() (pivotTables + pivotCaches trial JSON),
     - the serialize -> fromJSON round-trip of the built workbook,
   and pixel-diffs a screenshot of the canvas (diff % + cell match %).

   Run: node apps/compare/scripts/pivot-comparison.mjs [--filter re] [--out vN]
   Exit code 0 = ran; the report prints per-scenario match numbers. */
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

const argv = process.argv.slice(2);
const arg = (name, dflt) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : dflt; };
const scenarioFilter = arg('--filter', null) ? new RegExp(arg('--filter', '')) : null;
const outDir = path.join(repo, '.probe', 'pivot-comparison', arg('--out', 'v1'));
fs.mkdirSync(outDir, { recursive: true });

/* ---------- field-by-field diff ---------- */
function diffValues(a, b, prefix, out, budget = 500) {
  if (out.length >= budget) return;
  if (a === b) return;
  if (Number.isNaN(a) && Number.isNaN(b)) return;
  const bothObjects = a && b && typeof a === 'object' && typeof b === 'object';
  if (!bothObjects || Array.isArray(a) !== Array.isArray(b)) {
    const short = v => { const s = JSON.stringify(v ?? null); return s && s.length > 160 ? s.slice(0, 157) + '...' : s; };
    out.push(`${prefix}: official=${short(a)} ours=${short(b)}`);
    return;
  }
  for (const key of [...new Set([...Object.keys(a), ...Object.keys(b)])])
    diffValues(a[key], b[key], `${prefix}.${key}`, out, budget);
}

/** Random ids/positions the trial regenerates per load must not count as diffs. */
function normalize(state) {
  const json = state.sheetJson;
  if (json && typeof json === 'object') {
    for (const key of Object.keys(json)) if (!['version', 'name', 'sheets', 'pivotCaches', 'customList'].includes(key) && json[key] && typeof json[key] === 'object') continue;
  }
  return state;
}

/* ---------- scenarios: ops run through pc.api on 'pivot1' ---------- */
const A = (sourceName, displayName, area, subtotal, index) => ['add', [sourceName, displayName ?? sourceName, area, subtotal, index]];
const SCENARIOS = [
  // ---- TASK 42 item 4: pivot slicers ----
  {
    name: 'slicer-basic', setup: [['layoutType', [0]]],
    fields: [A('Buyer', 'Buyer', 1), A('Amount', 'Amount', 3, 8)],
    slicerOps: [['add', 'sl1', 'pivot1', 'Buyer', 'pivot'], ['all'], ['byPivot', 'pivot1'], ['get', 'sl1']],
  },
  {
    name: 'slicer-click', setup: [['layoutType', [0]]],
    fields: [A('Buyer', 'Buyer', 1), A('Amount', 'Amount', 3, 8)],
    slicerOps: [['add', 'sl1', 'pivot1', 'Buyer', 'pivot']],
    slicerClicks: [['sl1', 0]],
    slicerOpsAfterClicks: [['get', 'sl1']],
  },
  {
    name: 'slicer-disconnect', setup: [['layoutType', [0]]],
    fields: [A('Buyer', 'Buyer', 1), A('Amount', 'Amount', 3, 8)],
    slicerOps: [['add', 'sl1', 'pivot1', 'Buyer', 'pivot']],
    slicerClicks: [['sl1', 1]],
    slicerOpsAfterClicks: [['set', 'sl1', 'disconnectPivotTable', 'pivot1'], ['get', 'sl1']],
  },
  {
    name: 'slicer-two', setup: [['layoutType', [0]]],
    fields: [A('Buyer', 'Buyer', 1), A('Type', 'Type', 2), A('Amount', 'Amount', 3, 8)],
    slicerOps: [['add', 'slBuyer', 'pivot1', 'Buyer', 'pivot'], ['add', 'slType', 'pivot1', 'Type', 'pivot'], ['all']],
    slicerClicks: [['slBuyer', 1], ['slType', 1]],
    slicerOpsAfterClicks: [['get', 'slBuyer'], ['get', 'slType']],
  },
  // ---- TASK 42 item 4: pivot timeline ----
  {
    name: 'timeline-probe', source: 'salesDate', setup: [['layoutType', [0]]],
    fields: [A('Buyer', 'Buyer', 1), A('Amount', 'Amount', 3, 8)],
    enumProbe: [
      ['Spread.Sheets.Slicers', ['SlicerType', 'TimelineLevel'], null],
      ['Spread.Sheets.Slicers.SlicerType', ['table', 'pivotTable', 'pivotTimeline', 'timeline'], null],
      ['Spread.Sheets.Slicers.TimelineLevel', ['years', 'quarters', 'months', 'days'], null],
    ],
    slicerOps: [['add', 'tl1', 'pivot1', 'Date', 'timeline'], ['get', 'tl1']],
  },
  // ---- TASK 42 item 5: PivotPanel ----
  {
    name: 'panel-probe', setup: [['layoutType', [0]]],
    fields: [A('Buyer', 'Buyer', 1), A('Amount', 'Amount', 3, 8)],
    panel: true,
    panelOps: [['sectionVisibility'], ['panelLayout']],
  },
  {
    name: 'panel-edit', setup: [['layoutType', [0]]],
    fields: [A('Buyer', 'Buyer', 1), A('Amount', 'Amount', 3, 8)],
    panel: true,
    panelActions: ['field:Type', 'field:Region'],
    panelOps: [['sectionVisibility']],
  },
  {
    name: 'panel-remove', setup: [['layoutType', [0]]],
    fields: [A('Buyer', 'Buyer', 1), A('Type', 'Type', 2), A('Amount', 'Amount', 3, 8)],
    panel: true,
    panelActions: ['field:Buyer'],
  },
  { name: 'base-compact', setup: [['layoutType', [0]]], fields: [A('Buyer', 'Buyer', 1), A('Amount', 'Amount', 3, 8)] },
  { name: 'base-outline', setup: [['layoutType', [1]]], fields: [A('Buyer', 'Buyer', 1), A('Amount', 'Amount', 3, 8)] },
  { name: 'base-tabular', setup: [['layoutType', [2]]], fields: [A('Buyer', 'Buyer', 1), A('Amount', 'Amount', 3, 8)] },
  { name: 'two-rows-compact', setup: [['layoutType', [0]]], fields: [A('Buyer', 'Buyer', 1), A('Region', 'Region', 1), A('Amount', 'Amount', 3, 8)] },
  { name: 'two-rows-tabular', setup: [['layoutType', [2]]], fields: [A('Buyer', 'Buyer', 1), A('Region', 'Region', 1), A('Amount', 'Amount', 3, 8)] },
  { name: 'rows-and-columns', setup: [['layoutType', [0]]], fields: [A('Buyer', 'Buyer', 1), A('Type', 'Type', 2), A('Amount', 'Amount', 3, 8)] },
  { name: 'cols-only', setup: [['layoutType', [0]]], fields: [A('Type', 'Type', 2), A('Amount', 'Amount', 3, 8)] },
  { name: 'two-col-fields', setup: [['layoutType', [0]]], fields: [A('Buyer', 'Buyer', 1), A('Region', 'Region', 2), A('Type', 'Type', 2), A('Amount', 'Amount', 3, 8)] },
  { name: 'three-rows-compact', setup: [['layoutType', [0]]], fields: [A('Buyer', 'Buyer', 1), A('Type', 'Type', 1), A('Region', 'Region', 1), A('Amount', 'Amount', 3, 8)] },
  { name: 'rows-cols-2val', setup: [['layoutType', [0]]], fields: [A('Buyer', 'Buyer', 1), A('Type', 'Type', 2), A('Amount', 'Sum of Amount', 3, 8), A('Amount', 'Count of Amount', 3, 1)] },
  { name: 'two-values', setup: [['layoutType', [0]]], fields: [A('Buyer', 'Buyer', 1), A('Amount', 'Sum of Amount', 3, 8), A('Amount', 'Count of Amount', 3, 1)] },
  { name: 'subtotal-types', setup: [['layoutType', [0]]], fields: [A('Buyer', 'Buyer', 1), A('Amount', 'Avg', 3, 0), A('Amount', 'Max', 3, 3), A('Amount', 'Min', 3, 4), A('Amount', 'Prod', 3, 5), A('Amount', 'Count', 3, 1), A('Amount', 'CountN', 3, 2), A('Amount', 'Std', 3, 7), A('Amount', 'Var', 3, 10)] },
  { name: 'page-field', setup: [['layoutType', [0]]], fields: [A('Region', 'Region', 0), A('Buyer', 'Buyer', 1), A('Amount', 'Amount', 3, 8)] },
  // ---- TASK 42 item 1: calculated fields / items and grouping ----
  {
    name: 'calc-field', setup: [['layoutType', [0]]],
    fields: [A('Buyer', 'Buyer', 1), A('Amount', 'Sum of Amount', 3, 8)],
    ops: [['addCalcField', ['Ratio', '=Amount/2']], ['add', ['Ratio', 'Sum of Ratio', 3, 8, undefined, undefined]]],
  },
  {
    name: 'calc-item', setup: [['layoutType', [0]]],
    fields: [A('Buyer', 'Buyer', 1), A('Amount', 'Sum of Amount', 3, 8)],
    ops: [['addCalcItem', ['Buyer', 'Both', '=Buyer[Mom]+Buyer[Dad]']]],
  },
  {
    name: 'calc-item-exclude', setup: [['layoutType', [0]]], setupOpts: { calcItemAggregation: 1 },
    fields: [A('Buyer', 'Buyer', 1), A('Amount', 'Sum of Amount', 3, 8)],
    ops: [['addCalcItem', ['Buyer', 'Both', '=Buyer[Mom]+Buyer[Dad]']]],
  },
  {
    name: 'group-years', source: 'salesDate', setup: [['layoutType', [0]]],
    ops: [['group', [{ originFieldName: 'Date', dateGroups: [{ by: 6 }] }]],
      ['add', ['Years (Date)', 'Years (Date)', 1, undefined, undefined]], A('Amount', 'Amount', 3, 8)],
  },
  {
    name: 'group-multi', source: 'salesDate', setup: [['layoutType', [0]]],
    ops: [['group', [{ originFieldName: 'Date', dateGroups: [{ by: 6 }, { by: 5 }, { by: 4 }] }]],
      ['add', ['Years (Date)', 'Years (Date)', 1, undefined, undefined]],
      ['add', ['Quarters (Date)', 'Quarters (Date)', 1, undefined, undefined]],
      ['add', ['Months (Date)', 'Months (Date)', 1, undefined, undefined]], A('Amount', 'Amount', 3, 8)],
  },
  {
    name: 'group-number', setup: [['layoutType', [0]]],
    ops: [['group', [{ originFieldName: 'Amount', numberGroup: { start: 0, end: 499, by: 250 } }]],
      A('Amount', 'Amount', 1), A('Amount', 'Sum of Amount', 3, 8)],
  },
  {
    name: 'group-text', setup: [['layoutType', [0]]],
    ops: [['group', [{ originFieldName: 'Buyer', textGroup: { fieldName: 'FamilyMembers', groupItems: { parent: ['Mom', 'Dad'], children: ['Kelly'] } } }]],
      ['add', ['FamilyMembers', 'FamilyMembers', 1, undefined, undefined]],
      ['add', ['Buyer', 'Buyer', 1, undefined, undefined]], A('Amount', 'Amount', 3, 8)],
  },
  {
    name: 'views', setup: [['layoutType', [0]]],
    fields: [A('Buyer', 'Buyer', 1), A('Amount', 'Amount', 3, 8)],
    viewOps: [['add', ['v1']], ['save', ['v2']], ['all'], ['get', ['v1']]],
  },
  {
    name: 'views-apply', setup: [['layoutType', [0]]],
    fields: [A('Buyer', 'Buyer', 1), A('Amount', 'Amount', 3, 8)],
    viewOps: [['add', ['ascView']], ['sortDesc'], ['apply', ['ascView']]],
  },
  // ---- TASK 42 item 3: GETPIVOTDATA ----
  {
    name: 'gpd-basic', setup: [['layoutType', [0]]],
    fields: [A('Buyer', 'Buyer', 1), A('Amount', 'Amount', 3, 8)],
    formulas: [
      [60, 9, '=GETPIVOTDATA("Amount", B2)'],
      [61, 9, '=GETPIVOTDATA("Amount", B2, "Buyer", "Mom")'],
      [62, 9, '=GETPIVOTDATA("Amount", B2, "Buyer", "Nobody")'],
      [63, 9, '=GETPIVOTDATA("Amount", B2, "Buyer", 1)'],
      [64, 9, '=GETPIVOTDATA("Amount", B2, "Data", "Amount", "Buyer", "Dad")'],
      [65, 9, '=GETPIVOTDATA("Sum of Amount", B2, "Buyer", "Mom")'],
      [66, 9, '=GETPIVOTDATA("amount", b2, "buyer", "mom")'],
      [67, 9, '=GETPIVOTDATA("", B2, "Data", "Amount", "Buyer", "Dad")'],
      [68, 9, '=GETPIVOTDATA("Amount", B2, "Buyer", "mom")'],
      [69, 9, '=GETPIVOTDATA("Amount", B2, "buyer", "Mom")'],
    ],
  },
  {
    name: 'gpd-rows-cols', setup: [['layoutType', [0]]],
    fields: [A('Buyer', 'Buyer', 1), A('Type', 'Type', 2), A('Amount', 'Amount', 3, 8)],
    formulas: [
      [60, 9, '=GETPIVOTDATA("Amount", B2, "Buyer", "Mom", "Type", "Fuel")'],
      [61, 9, '=GETPIVOTDATA("Amount", B2, "Type", "Fuel", "Buyer", "Mom")'],
      [62, 9, '=GETPIVOTDATA("Amount", B2, "Buyer", "Mom")'],
      [63, 9, '=GETPIVOTDATA("Amount", B2, "Buyer", "Mom", "Type", "Books")'],
      [64, 9, '=GETPIVOTDATA("Amount", B2, "Buyer", "(all)")'],
      [65, 9, '=GETPIVOTDATA("Amount", B2, "Type", "Food")'],
    ],
  },
  // ---- TASK 42 item 2: interaction ----
  {
    name: 'interact-collapse', setup: [['layoutType', [0]]],
    fields: [A('Buyer', 'Buyer', 1), A('Type', 'Type', 1), A('Amount', 'Amount', 3, 8)],
    clicks: [{ type: 'label', text: 'Dad' }],
  },
  {
    name: 'interact-expand', setup: [['layoutType', [0]]],
    fields: [A('Buyer', 'Buyer', 1), A('Type', 'Type', 1), A('Amount', 'Amount', 3, 8)],
    ops: [['collapse', ['Buyer', 'Dad', true]]],
    clicks: [{ type: 'label', text: 'Dad' }],
  },
  {
    name: 'interact-dropdown', setup: [['layoutType', [0]]],
    fields: [A('Buyer', 'Buyer', 1), A('Amount', 'Amount', 3, 8)],
    clicks: [{ type: 'corner', text: 'Row Labels' }],
  },
  { name: 'label-filter', setup: [['layoutType', [0]]], fields: [A('Buyer', 'Buyer', 1), A('Amount', 'Amount', 3, 8)], ops: [['labelFilter', ['Buyer', { textItem: { list: ['Mom', 'Dad'], isAll: false } }]]] },
  { name: 'value-filter', setup: [['layoutType', [0]]], fields: [A('Buyer', 'Buyer', 1), A('Amount', 'Amount', 3, 8)], ops: [['valueFilter', ['Buyer', { conditionByName: 'Amount', condition: { conType: 2, val: [300], operator: 2 } }]]] },
  { name: 'top10-filter', setup: [['layoutType', [0]]], fields: [A('Buyer', 'Buyer', 1), A('Amount', 'Amount', 3, 8)], ops: [['valueFilter', ['Buyer', { conditionByName: 'Amount', condition: { conType: 3, val: 2, type: 0, operator: 1 } }]]] },
  { name: 'sort-desc', setup: [['layoutType', [0]]], fields: [A('Buyer', 'Buyer', 1), A('Amount', 'Amount', 3, 8)], ops: [['sort', ['Buyer', { sortType: 1 }]]] },
  { name: 'subtotal-visible-outline', setup: [['layoutType', [1]]], fields: [A('Buyer', 'Buyer', 1), A('Type', 'Type', 1), A('Amount', 'Amount', 3, 8)], ops: [['subtotalVisible', ['Type', true]], ['subtotalPosition', ['Type', 2]]] },
  { name: 'collapse', setup: [['layoutType', [0]]], fields: [A('Buyer', 'Buyer', 1), A('Type', 'Type', 1), A('Amount', 'Amount', 3, 8)], ops: [['collapse', ['Buyer', 'Dad', true]]] },
  { name: 'theme-medium3', setup: [['layoutType', [0]], ['theme', ['Medium3']]], fields: [A('Buyer', 'Buyer', 1), A('Type', 'Type', 2), A('Amount', 'Amount', 3, 8)] },
  { name: 'theme-light16', setup: [['layoutType', [2]], ['theme', ['Light16']]], fields: [A('Buyer', 'Buyer', 1), A('Amount', 'Amount', 3, 8)] },
  { name: 'theme-dark6', setup: [['layoutType', [0]], ['theme', ['Dark6']]], fields: [A('Buyer', 'Buyer', 1), A('Type', 'Type', 2), A('Amount', 'Amount', 3, 8)] },
  { name: 'no-grand-totals', setup: [['layoutType', [0]]], setupOpts: { grandTotalPosition: 0 }, fields: [A('Buyer', 'Buyer', 1), A('Amount', 'Amount', 3, 8)] },
  { name: 'missing-caption', setup: [['layoutType', [0]]], setupOpts: { showMissing: true, missingCaption: 'N/A' }, fields: [A('Type', 'Type', 1), A('Amount', 'Amount', 3, 8)], extraData: [['X', '', 5, '']] },
];

/* ---------- runner ---------- */
const server = await createServer({ root, logLevel: 'error',
  server: { port: Number(process.env.CMP_PORT ?? 5187), strictPort: true, host: '127.0.0.1' },
  optimizeDeps: { exclude: ['@opensheets/spread-sheets'] } });
let browser;
const report = [];
try {
  await server.listen();
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1560, height: 1400 } });
  const consoleErrors = [];
  page.on('pageerror', error => consoleErrors.push(String(error.message)));
  await page.goto(new URL('pivot-comparison.html', server.resolvedUrls.local[0]).href);
  await page.waitForFunction(() => !!window.__pcReady, null, { timeout: 90000 });

  async function state(kind, sc) {
    await page.evaluate(k => window.pc.reset(k), kind);
    if (sc.extraData) await page.evaluate(([k, rows]) => window.pc.appendData(k, rows), [kind, sc.extraData]);
    if (sc.setupOpts) await page.evaluate(([k, o]) => window.pc.setSetupOpts(k, o), [kind, sc.setupOpts]);
    await page.evaluate(([k, opts]) => window.pc.add(k, opts), [kind, { name: 'pivot1', source: sc.source ?? 'sourceData', row: 1, col: 1, layout: 0, theme: 'Medium2', options: sc.setupOpts }]);
    if (sc.setup?.length) await page.evaluate(([k, ops]) => window.pc.api(k, 'pivot1', ops), [kind, sc.setup]);
    if (sc.fields?.length) await page.evaluate(([k, ops]) => window.pc.api(k, 'pivot1', ops), [kind, sc.fields]);
    if (sc.ops?.length) await page.evaluate(([k, ops]) => window.pc.api(k, 'pivot1', ops), [kind, sc.ops]);
    await page.evaluate(k => window.pc.active(k, 1), kind);
    // Let both runtimes finish their asynchronous repaint before capturing.
    await page.waitForTimeout(600);
    const out = {};
    if (sc.clicks?.length) {
      for (const click of sc.clicks) {
        const p = await page.evaluate(([k, n, w]) => window.pc.pivotClickPoint(k, n, w), [kind, 'pivot1', click]);
        if (!p || p.x === undefined) throw new Error(`no click target ${JSON.stringify(click)} on ${kind}: ${JSON.stringify(p)}`);
        await page.mouse.click(p.x, p.y);
        await page.waitForTimeout(250);
      }
      await page.waitForTimeout(400);
      console.log(`  afterClick ${kind}:`, JSON.stringify(await page.evaluate(k => ({
        panel: !!document.getElementById(k).querySelector('.gc-pivot-filter-panel'),
        collapsedSample: (() => { const t = window.pc.sheetRef(k).pivotTables.all()[0]; return t ? String(t.collapse('Buyer', 'Dad')) : 'none'; })(),
      }), kind)));
    }
    if (sc.enumProbe?.length) {
      out.enumProbe = {};
      for (const [ns, names, sample] of sc.enumProbe)
        out.enumProbe[ns] = await page.evaluate(([k, n, m, s]) => window.pc.enumProbe(k, n, m, s), [kind, ns, names, sample ?? null]);
    }
    if (sc.slicerOps?.length) out.slicerOps = await page.evaluate(([k, ops]) => window.pc.slicerOps(k, ops), [kind, sc.slicerOps]);
    if (sc.slicerClicks?.length) {
      for (const click of sc.slicerClicks) {
        const p = await page.evaluate(([k, n, i]) => window.pc.slicerItemPoint(k, n, i), [kind, click[0], click[1]]);
        if (!p || p.x === undefined) throw new Error(`no slicer click target ${JSON.stringify(click)} on ${kind}: ${JSON.stringify(p)}`);
        await page.mouse.click(p.x, p.y);
        await page.waitForTimeout(350);
      }
      // Park the pointer off-widget so neither runtime paints hover state.
      await page.mouse.move(2, 2);
      await page.waitForTimeout(150);
      out.slicerOpsAfterClicks = await page.evaluate(([k, ops]) => ops ? window.pc.slicerOps(k, ops) : null, [kind, sc.slicerOpsAfterClicks ?? null]);
    }
    if (sc.viewOps?.length) out.viewsApi = await page.evaluate(([k, ops]) => window.pc.viewsApi(k, 'pivot1', ops), [kind, sc.viewOps]);
    if (sc.formulas?.length)
      out.formulas = await page.evaluate(([k, fs]) => fs.map(f => window.pc.formula(k, f[0], f[1], f[2])), [kind, sc.formulas]);
    out.serialize = await page.evaluate(([k, n]) => window.pc.serialize(k, n), [kind, 'pivot1']);
    out.cellGrid = await page.evaluate(([k, n]) => window.pc.cellGrid(k, n, 3), [kind, 'pivot1']);
    out.nodeGrid = await page.evaluate(([k, n]) => window.pc.nodeGrid(k, n), [kind, 'pivot1']);
    out.api = await page.evaluate(([k, n]) => window.pc.api(k, n, [
      ['getSource'], ['getSourceFields'], ['getFieldsByArea'], ['getThemeName'], ['layoutType'],
      ['position'], ['dataPosition'], ['getItemsByField', ['Buyer']], ['getRange'],
      ['getCalcFields'], ['getCalcItems'],
    ]), [kind, 'pivot1']);
    out.sheetJson = await page.evaluate(k => JSON.parse(window.pc.wbJson(k)), kind);
    /* Screenshot before the round-trip: `fromJSON` rebuilds the DOM and would
       tear down open overlays (filter dropdowns). */
    if (sc.panel) {
      await page.evaluate(k => window.pc.panelOpen(k), kind);
      await page.waitForTimeout(700);
      if (sc.panelActions?.length) {
        out.panelActions = [];
        for (const action of sc.panelActions) {
          out.panelActions.push(await page.evaluate(([k, w]) => window.pc.panelAction(k, w), [kind, action]));
          await page.waitForTimeout(350);
        }
        await page.waitForTimeout(400);
      }
      out.panelDump = await page.evaluate(k => window.pc.panelDump(k), kind);
      out.panelText = await page.evaluate(k => document.getElementById(k + '-panel').innerText, kind);
      out.panelItems = await page.evaluate(k => document.getElementById(k + '-panel').__itemDump ?? null, kind);
      if (sc.panelOps?.length) out.panelApi = await page.evaluate(([k, ops]) => window.pc.panelApi(k, ops), [kind, sc.panelOps]);
      const pg = await page.evaluate(k => window.pc.panelGeom(k), kind);
      if (pg) await page.screenshot({ clip: pg, path: path.join(outDir, `${sc.name}__panel__${kind}.png`) });
    }
    const g = await page.evaluate(k => window.pc.geom(k), kind);
    const file = path.join(outDir, `${sc.name}__${kind}.png`);
    await page.screenshot({ clip: g.clip, path: file });
    out.roundTrip = await page.evaluate(([k, json]) => window.pc.fromJson(k, json), [kind, JSON.stringify(out.sheetJson)]);
    delete out.sheetJsonFull;
    return out;
  }

  for (const sc of SCENARIOS.filter(s => !scenarioFilter || scenarioFilter.test(s.name))) {
    const official = normalize(await state('official', sc));
    const ours = normalize(await state('ours', sc));
    const diffs = [];
    diffValues(official.cellGrid, ours.cellGrid, 'cellGrid', diffs);
    diffValues(official.viewsApi, ours.viewsApi, 'viewsApi', diffs);
    diffValues(official.slicerOps, ours.slicerOps, 'slicerOps', diffs);
    diffValues(official.slicerOpsAfterClicks, ours.slicerOpsAfterClicks, 'slicerAfter', diffs);
    const slicerJsonOf = j => {
      const s = (j?.sheets?.Pivot ?? {});
      if (!s.slicers) return null;
      return JSON.parse(JSON.stringify(s.slicers,
        (k, v) => (k === 'toImageSrc' && typeof v === 'string' && v.length > 40) ? '<png>' : v));
    };
    diffValues(slicerJsonOf(official.sheetJson), slicerJsonOf(ours.sheetJson), 'slicers', diffs);
    diffValues(official.formulas, ours.formulas, 'formulas', diffs);
    diffValues(official.serialize, ours.serialize, 'serialize', diffs);
    diffValues(official.nodeGrid, ours.nodeGrid, 'nodeGrid', diffs);
    diffValues(official.api, ours.api, 'api', diffs);
    diffValues(official.sheetJson?.pivotCaches ? { pivotCaches: official.sheetJson.pivotCaches } : null, ours.sheetJson?.pivotCaches ? { pivotCaches: ours.sheetJson.pivotCaches } : null, 'pivotCaches', diffs);
    const pivotJson = j => { const s = j?.sheets?.Pivot ?? {}; return { pivotTables: s.pivotTables ?? null }; };
    diffValues(pivotJson(official.sheetJson), pivotJson(ours.sheetJson), 'pivotJson', diffs);
    diffValues(official.roundTrip, ours.roundTrip, 'roundTrip', diffs);
    if (sc.panel) {
      // Panel DOMs are our own markup: compare the visible TEXT content, not tags.
      // innerText trailing spaces are not a contract; compare per-line trimmed text.
      diffValues(official.panelApi ?? null, ours.panelApi ?? null, 'panelApi', diffs);
      const trimLines = t => (t ?? null) === null ? null : String(t).split('\n').map(x => x.trim()).join('\n');
      diffValues(trimLines(official.panelText), trimLines(ours.panelText), 'panelText', diffs);
      // Compare the panel's user-facing item contract (class, text, data-*) —
      // not our internal node structure (the `kids` debug field is report-only).
      const itemsPlain = arr => (arr ?? null) === null ? null : arr.map(i => ({ cls: i.cls, text: i.text, attrs: i.attrs }));
      diffValues(itemsPlain(official.panelItems), itemsPlain(ours.panelItems), 'panelItems', diffs);
      diffValues(official.panelActions ?? null, ours.panelActions ?? null, 'panelActions', diffs);
    }
    /* node-grid match: how many cells agree on their pivot node */
    const key = cell => cell.node ? `${cell.node.fields.map(f => f.join('=')).join('/')};${JSON.stringify(cell.node.value)}` : '.';
    let cells = 0, matched = 0;
    official.nodeGrid.grid.forEach((row, r) => row.forEach((cell, c) => {
      cells++;
      const other = ours.nodeGrid.grid[r]?.[c];
      if (other && key(cell) === key(other)) matched++;
    }));
    /* visible cell-value match over the pivot rectangle (page area included) */
    const blank = v => (v === null || v === undefined || v === '') ? '' : String(v);
    let vcells = 0, vmax = 0;
    const rows = Math.max(official.cellGrid.length, ours.cellGrid.length);
    for (let r = 0; r < rows; r++) {
      const cols = Math.max((official.cellGrid[r] || []).length, (ours.cellGrid[r] || []).length);
      vmax += cols;
      for (let c = 0; c < cols; c++)
        if (blank(official.cellGrid[r]?.[c]) === blank(ours.cellGrid[r]?.[c])) vcells++;
    }
    /* screenshot diff (crop both to the common rectangle) */
    const a0 = PNG.sync.read(fs.readFileSync(path.join(outDir, `${sc.name}__official.png`)));
    const b0 = PNG.sync.read(fs.readFileSync(path.join(outDir, `${sc.name}__ours.png`)));
    const w = Math.min(a0.width, b0.width), h = Math.min(a0.height, b0.height);
    const crop = src => {
      const dst = new PNG({ width: w, height: h });
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const si = ((y * src.width) + x) << 2;
          const di = ((y * w) + x) << 2;
          for (let ch = 0; ch < 4; ch++) dst.data[di + ch] = src.data[si + ch];
        }
      return dst;
    };
    const a = crop(a0), b = crop(b0);
    const out = new PNG({ width: w, height: h });
    const bad = pixelmatch(a.data, b.data, out.data, w, h, { threshold: 0.1 });
    fs.writeFileSync(path.join(outDir, `${sc.name}__diff.png`), PNG.sync.write(out));
    fs.writeFileSync(path.join(outDir, `${sc.name}.json`), JSON.stringify({ official, ours }, null, 1));
    const entry = {
      name: sc.name,
      apiDiffs: diffs.length,
      valueMatchPct: Number((100 * vcells / Math.max(1, vmax)).toFixed(1)),
      cellMatchPct: Number((100 * matched / Math.max(1, cells)).toFixed(1)),
      pixelDiffPct: Number((100 * bad / (w * h)).toFixed(2)),
    };
    if (diffs.length) entry.sample = diffs.slice(0, 10);
    report.push(entry);
    console.log(`${sc.name}: apiDiffs=${entry.apiDiffs} values=${entry.valueMatchPct}% nodes=${entry.cellMatchPct}% pixels=${entry.pixelDiffPct}%`);
  }
  fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 1));
  if (consoleErrors.length) console.log('page errors:', consoleErrors.slice(0, 6));
  console.log('comparison done');
} finally {
  await browser?.close();
  await server.close();
}
