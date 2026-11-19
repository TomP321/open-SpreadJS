#!/usr/bin/env node
/* Black-box slicer comparison (TASK 31 — report only, no thresholds).

   Runs the same in-sheet scenarios against the official trial runtime
   (@mescius/spread-sheets 19.2.5 + @mescius/spread-sheets-slicers plugin) and
   @opensheets/spread-sheets in ONE page. Every step compares, field by field:
     - the SlicerChanged event stream,
     - slicer.toJSON() and the sheet-JSON `slicers` section,
     - the table rowFilter JSON + workbook tableSlicerCaches,
     - table row visibility and slicer items (selection / noData flags),
   and pixel-diffs a screenshot crop of the slicer (diff %, numbers only).
   Mouse interaction (click, ctrl-click, drag select, move, resize, wheel) is
   driven with real CDP events at coordinates computed from each slicer's own
   geometry, so both libraries get the identical gesture.

   Run: node apps/compare/scripts/slicer-comparison.mjs   (exit 0 = comparison ran) */
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

const outDir = path.join(repo, '.probe', 'slicer-comparison', 'v15');
fs.mkdirSync(outDir, { recursive: true });

/* ---------- layout helpers (same geometry the painter uses) ---------- */
const L = { listTop: 29, listTopNoHeader: 4, itemLeft: 9, itemRight: 15, colGap: 3, gap: 7 };
function layout(geom) {
  const pitch = geom.itemHeight + L.gap;
  const boxH = geom.itemHeight + 5;
  const listTop = geom.showHeader ? L.listTop : L.listTopNoHeader;
  const rowTop = n => (n === 0 ? listTop : listTop - 1 + n * pitch);
  let rows = 0;
  while (rows < 4096 && rowTop(rows) + (rows === 0 ? boxH - 1 : boxH) - 1 <= geom.height - 1) rows++;
  const columns = Math.max(1, geom.columnCount);
  const usable = geom.width - L.itemLeft - L.itemRight - (columns - 1) * L.colGap;
  return { pitch, boxH, rows: Math.max(1, rows), columns, colW: usable / columns, rowTop };
}
function itemCenter(geom, index) {
  const { boxH, columns, colW, rowTop } = layout(geom);
  const col = index % columns;
  const row = Math.floor(index / columns);
  return {
    x: geom.left + (L.itemLeft + col * (colW + L.colGap) + colW / 2) * geom.zoom,
    y: geom.top + (rowTop(row) + boxH / 2) * geom.zoom,
  };
}
const funnelCenter = geom => ({ x: geom.left + (geom.width - 21) * geom.zoom, y: geom.top + 12 * geom.zoom });
const sortCenter = geom => ({ x: geom.left + (geom.width - 46) * geom.zoom, y: geom.top + 12 * geom.zoom });
const headerCenter = geom => ({ x: geom.left + 40 * geom.zoom, y: geom.top + 12 * geom.zoom });
const seCorner = geom => ({ x: geom.left + geom.width * geom.zoom, y: geom.top + geom.height * geom.zoom });
const listBody = geom => ({ x: geom.left + (geom.width / 2) * geom.zoom, y: geom.top + (geom.height - 24) * geom.zoom });

/* ---------- diff helper ---------- */
function diffValues(a, b, prefix, out, budget = 120) {
  if (out.length >= budget) return;
  if (a === b) return;
  if (typeof a === 'string' && typeof b === 'string' && /^<png:/.test(a) && /^<png:/.test(b)) return;
  const bothObjects = a && b && typeof a === 'object' && typeof b === 'object';
  if (!bothObjects || Array.isArray(a) !== Array.isArray(b)) {
    const short = v => { const s = JSON.stringify(v ?? null); return s && s.length > 120 ? s.slice(0, 117) + '...' : s; };
    out.push(`${prefix}: official=${short(a)} ours=${short(b)}`);
    return;
  }
  for (const key of [...new Set([...Object.keys(a), ...Object.keys(b)])])
    diffValues(a[key], b[key], `${prefix}.${key}`, out, budget);
}
const ANCHOR_KEYS = ['startRow', 'startColumn', 'startRowOffset', 'startColumnOffset',
  'endRow', 'endColumn', 'endRowOffset', 'endColumnOffset'];
function normalize(state) {
  const ANCHOR = '<anchor>';
  for (const json of [state.slicerJson, ...(Array.isArray(state.sheetSlicers) ? state.sheetSlicers : [])]) {
    if (!json) continue;
    for (const key of ANCHOR_KEYS) if (key in json) json[key] = ANCHOR;
  }
  // The trial re-derives shape anchors from the viewport (auto-scroll on filter); compare values only.
  for (const shape of Array.isArray(state.sheetShapes) ? state.sheetShapes : []) {
    if (shape?.shapeData?.startPoint !== undefined) shape.shapeData.startPoint = ANCHOR;
    if (shape?.shapeData?.endPoint !== undefined) shape.shapeData.endPoint = ANCHOR;
  }
  if (Array.isArray(state.tableFilter?.filteredOutRows))
    state.tableFilter.filteredOutRows = state.tableFilter.filteredOutRows.slice().sort((x, y) => x - y);
  if (Array.isArray(state.tableFilter?.filteredColumns))
    state.tableFilter.filteredColumns = state.tableFilter.filteredColumns.slice().sort((x, y) => x - y);
  if (state.wbCaches) for (const cache of state.wbCaches) if (cache.tableId) cache.tableId = '<id>';
  if (state.tableFilter?.tableId) state.tableFilter.tableId = '<id>';
  // Condition flags: the trial serialises useWildCards/ignoreCase only on some
  // code paths (dialog vs programmatic); their EFFECT is covered by visibleRows.
  for (const item of state.tableFilter?.filterItemMap ?? [])
    for (const cond of item.conditions ?? []) { delete cond.useWildCards; delete cond.ignoreCase; }
  // Key ORDER inside the sheet JSON is not behavioural; compare the sorted key sets as one line.
  if (Array.isArray(state.sheetTopKeys)) state.sheetTopKeys = state.sheetTopKeys.slice().sort().join(',');
  // The trial's getItems() always returns text-ascending order; compare as a key map.
  if (Array.isArray(state.items)) state.items = state.items.slice().sort((x, y) => String(x.text).localeCompare(String(y.text)));
  return state;
}

/* ---------- scenarios ---------- */
const steps = list => list;
const scenarios = [
  { name: 'gsd-matrix', gsd: true },
  { name: 'default', steps: steps([{ label: 'initial' }]) },
  { name: 'itemClick', steps: steps([
    { label: 'click-item0', click: 0 },
    { label: 'click-item0-again', click: 0 },
    { label: 'click-item1', click: 1 },
  ]) },
  { name: 'multiSelect', steps: steps([
    { label: 'multiSelect-on', ops: [['slicer.multiSelect', [true]]] },
    { label: 'click-item0', click: 0 },
    { label: 'click-item1', click: 1 },
    { label: 'click-item0-off', click: 0 },
  ]) },
  { name: 'ctrlClick', steps: steps([
    { label: 'click-item0', click: 0 },
    { label: 'ctrl-click-item1', click: 1, ctrl: true },
    { label: 'ctrl-click-item1-again', click: 1, ctrl: true },
  ]) },
  { name: 'clearFilter', steps: steps([
    { label: 'click-item0', click: 0 },
    { label: 'click-funnel', funnel: true },
  ]) },
  { name: 'showHeaderFalse', steps: steps([
    { label: 'showHeader-false', ops: [['slicer.showHeader', [false]]] },
    { label: 'click-item0', click: 0 },
  ]) },
  { name: 'columnCount2', steps: steps([
    { label: 'columnCount-2', ops: [['slicer.columnCount', [2]]] },
    { label: 'click-item2', click: 2 },
    { label: 'click-item3', click: 3 },
  ]) },
  { name: 'itemHeight', steps: steps([
    { label: 'itemHeight-32', ops: [['slicer.itemHeight', [32]]] },
    { label: 'click-item0', click: 0 },
  ]) },
  { name: 'sortDesc', steps: steps([
    { label: 'sort-desc', ops: [['slicer.sortState', [2]]] },
    { label: 'click-item0', click: 0 },
    { label: 'click-sort-icon', sortIcon: true },
  ]) },
  { name: 'noData', steps: steps([
    { label: 'filter-menu', filterMenu: { col: 0, expected: 'Betty' } },
    { label: 'showNoDataItems-false', ops: [['slicer.showNoDataItems', [false]]] },
    { label: 'showNoDataItems-true-visual-false', ops: [['slicer.showNoDataItems', [true]], ['slicer.visuallyNoDataItems', [false]]] },
    { label: 'showNoDataInLast-false', ops: [['slicer.visuallyNoDataItems', [true]], ['slicer.showNoDataItemsInLast', [false]]] },
    { label: 'unfilter-menu', filterMenu: null },
  ]) },
  { name: 'styles', steps: steps([
    { label: 'light2', ops: [['slicer.style', ['SlicerStyleLight2']]] },
    { label: 'dark3', ops: [['slicer.style', ['SlicerStyleDark3']]] },
    { label: 'other1', ops: [['slicer.style', ['SlicerStyleOther1']]] },
    { label: 'light4-object', ops: [['slicer.style', [{ __style: 'light4' }]]] },
  ]) },
  { name: 'toJSON', dump: true, steps: steps([
    { label: 'all-props', ops: [
      ['slicer.captionName', ['Towns']],
      ['slicer.columnCount', [2]],
      ['slicer.itemHeight', [30]],
      ['slicer.multiSelect', [true]],
      ['slicer.sortState', [2]],
      ['slicer.showNoDataItems', [false]],
      ['slicer.visuallyNoDataItems', [false]],
      ['slicer.showHeader', [false]],
      ['slicer.alt', ['Alt text']],
      ['slicer.canPrint', [false]],
      ['slicer.dynamicMove', [true]],
      ['slicer.dynamicSize', [true]],
      ['slicer.position', [{ __point: true, x: 120, y: 60 }]],
    ] },
    { label: 'click-item0', click: 0 },
  ]) },
  { name: 'move', steps: steps([
    { label: 'click-header', headerClick: true },
    { label: 'drag-header', drag: { from: 'header', dx: 30, dy: 20 } },
    { label: 'drag-back', drag: { from: 'header', dx: -30, dy: -20 } },
  ]) },
  { name: 'resize', steps: steps([
    { label: 'click-header', headerClick: true },
    { label: 'drag-se', drag: { from: 'se', dx: 40, dy: 60 } },
  ]) },
  { name: 'dragSelect', steps: steps([
    { label: 'multiSelect-on', ops: [['slicer.multiSelect', [true]]] },
    { label: 'drag-items-0-2', dragItems: [0, 2] },
  ]) },
  { name: 'hover', steps: steps([
    { label: 'hover-item0', hover: { item: 0 } },
    { label: 'filter-click-item0', click: 0 },
    { label: 'hover-item1', hover: { item: 1 } },
    { label: 'hover-multi-icon', hover: { icon: 'multi' } },
    { label: 'hover-clear-icon', hover: { icon: 'clear' } },
  ]) },
  { name: 'scroll', rows: 'many', steps: steps([
    { label: 'initial-18-items' },
    { label: 'wheel-down', wheel: 240 },
  ]) },
];

/* ---------- driver ---------- */
const server = await createServer({ root, logLevel: 'error', server: { port: 0, strictPort: false } });
let browser;
let totalDiffs = 0;
const report = [];
try {
  await server.listen();
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1180, height: 760 } });
  const consoleErrors = [];
  page.on('pageerror', error => consoleErrors.push(String(error.message)));
  await page.goto(new URL('slicer-comparison.html', server.resolvedUrls.local[0]).href);
  await page.waitForFunction(() => !!window.__hsReady, null, { timeout: 60000 });

  const snap = async kind => normalize(await page.evaluate(k => window.hs.state(k), kind));
  const settle = ms => page.waitForTimeout(ms);
  const park = async () => { await page.mouse.move(5, 5); await settle(150); };
  const geom = async kind => page.evaluate(k => window.hs.geom(k), kind);

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
    const crop = (src) => {
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

  for (const scenario of scenarios) {
    console.log(`\n== scenario ${scenario.name} ==`);
    if (scenario.gsd) {
      const left = await page.evaluate(() => window.hs.gsd('official').steps);
      const right = await page.evaluate(() => window.hs.gsd('ours').steps);
      const diffs = [];
      diffValues(left, right, 'gsd', diffs);
      totalDiffs += diffs.length;
      console.log(`gsd steps: official=${Object.keys(left).length} ours=${Object.keys(right).length} diffs=${diffs.length}`);
      for (const line of diffs.slice(0, 20)) console.log(`   ${line}`);
      continue;
    }
    const setupOpts = scenario.rows ? { rows: scenario.rows } : {};
    await page.evaluate(o => window.hs.setup('official', o), setupOpts);
    await page.evaluate(o => window.hs.setup('ours', o), setupOpts);
    await settle(450);
    for (const step of scenario.steps) {
      const label = step.label;
      if (step.ops) {
        await page.evaluate(([k, ops]) => window.hs.apply(k, ops), ['official', step.ops]);
        await page.evaluate(([k, ops]) => window.hs.apply(k, ops), ['ours', step.ops]);
      }
      if (step.filterMenu) {
        await page.evaluate(([k, cfg]) => window.hs.makeTable(k, cfg), ['official', step.filterMenu]);
        await page.evaluate(([k, cfg]) => window.hs.makeTable(k, cfg), ['ours', step.filterMenu]);
      }
      else if (step.filterMenu === null) {
        const ops = [['filter.removeFilterItems', [0]], ['filter.filter', []]];
        await page.evaluate(([k, o]) => window.hs.apply(k, o), ['official', ops]);
        await page.evaluate(([k, o]) => window.hs.apply(k, o), ['ours', ops]);
      }
      // real mouse gestures, identical geometry on both libraries
      const gesture = async kind => {
        if (typeof step.click === 'number') {
          const g = await geom(kind);
          const p = itemCenter(g, step.click);
          if (step.ctrl) await page.keyboard.down('Control');
          await page.mouse.click(p.x, p.y);
          if (step.ctrl) await page.keyboard.up('Control');
        } else if (step.funnel) {
          const g = await geom(kind);
          const p = funnelCenter(g);
          await page.mouse.click(p.x, p.y);
        } else if (step.sortIcon) {
          const g = await geom(kind);
          const p = sortCenter(g);
          await page.mouse.click(p.x, p.y);
        } else if (step.headerClick) {
          const g = await geom(kind);
          const p = headerCenter(g);
          await page.mouse.click(p.x, p.y);
        } else if (step.drag) {
          const g = await geom(kind);
          const from = step.drag.from === 'header' ? headerCenter(g) : seCorner(g);
          await page.mouse.move(from.x, from.y);
          await page.mouse.down();
          await page.mouse.move(from.x + step.drag.dx, from.y + step.drag.dy, { steps: 8 });
          await page.mouse.up();
        } else if (step.dragItems) {
          const g = await geom(kind);
          const a = itemCenter(g, step.dragItems[0]);
          const b = itemCenter(g, step.dragItems[1]);
          await page.mouse.move(a.x, a.y);
          await page.mouse.down();
          await page.mouse.move(b.x, b.y, { steps: 10 });
          await page.mouse.up();
        } else if (step.wheel) {
          const g = await geom(kind);
          const p = listBody(g);
          await page.mouse.move(p.x, p.y);
          await page.mouse.wheel(0, step.wheel);
        } else if (step.hover) {
          const g = await geom(kind);
          const p = step.hover.icon === 'multi' ? sortCenter(g)
            : step.hover.icon === 'clear' ? funnelCenter(g) : itemCenter(g, step.hover.item);
          await page.mouse.move(p.x, p.y);
        }
      };
      await gesture('official');
      await gesture('ours');
      await settle(350);
      if (step.hover) {
        // Hover must be active for each library's own screenshot: interleave gesture+shot.
        await gesture('official');
        await takeShot(scenario.name, label, 'official');
        await gesture('ours');
        await takeShot(scenario.name, label, 'ours');
      } else {
        await park();
        await takeShot(scenario.name, label, 'official');
        await takeShot(scenario.name, label, 'ours');
      }
      const official = await snap('official');
      const ours = await snap('ours');
      const diffPct = await shotDiff(scenario.name, label);
      const diffs = [];
      diffValues(official, ours, label, diffs);
      totalDiffs += diffs.length;
      console.log(`step ${label}: ${diffs.length === 0 ? 'JSON/STATE MATCH' : `DIFFS=${diffs.length}`} shot diff ${diffPct}%`);
      for (const line of diffs.slice(0, 18)) console.log(`   ${line}`);
      if (scenario.dump && label === 'all-props') {
        fs.writeFileSync(path.join(outDir, `${scenario.name}-official.json`), JSON.stringify(official, null, 2));
        fs.writeFileSync(path.join(outDir, `${scenario.name}-ours.json`), JSON.stringify(ours, null, 2));
        fs.writeFileSync(path.join(outDir, `${scenario.name}-official-anchors.json`),
          JSON.stringify(await page.evaluate(() => window.hs.state('official').slicerJson).then(j => {
            const o = {}; for (const k of ANCHOR_KEYS) o[k] = j[k]; return o;
          }), null, 2));
      }
      report.push({ scenario: scenario.name, step: label, diffs: diffs.length, diffPct });
    }
    await page.evaluate(() => { window.hs.dispose('official'); window.hs.dispose('ours'); });
  }

  if (consoleErrors.length) console.log('page errors:', consoleErrors.slice(0, 5).join(' | '));
  console.log(`\nSUMMARY: total state-field diffs (no threshold): ${totalDiffs}`);
  for (const row of report) console.log(`  ${row.scenario}/${row.step}: diffs=${row.diffs} shot=${row.diffPct}%`);
  console.log(`artifacts: ${outDir}`);
} finally {
  await browser?.close();
  await server.close();
}
