// TableSheetPanel side-by-side comparison (TASK 33).
// Opens the trial (@mescius/spread-sheets-tablesheet) and our implementation in two
// isolated pages (apps/compare/tablesheet-panel-comparison.html?side=official|ours),
// runs the same scenario script in each, records DOM structure + public-API state,
// crops a screenshot of the panel host and reports a pixel diff % per scenario.
//
// Run: node apps/compare/scripts/tablesheet-panel-comparison.mjs
// (expects a Vite server for this tree on 127.0.0.1:5189; starts one if missing)
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

process.chdir(resolve(fileURLToPath(new URL('../../..', import.meta.url))));
mkdirSync('.probe', { recursive: true });
process.env.PLAYWRIGHT_BROWSERS_PATH ??= resolve('.playwright-browsers');
const BASE = process.env.PANEL_COMPARE_URL ?? 'http://127.0.0.1:5189';

// --- ensure a Vite server for THIS tree is answering on BASE -------------------
async function alive() {
  try { const r = await fetch(BASE + '/tablesheet-panel-comparison.html'); return r.ok; } catch { return false; }
}
let server;
if (!(await alive())) {
  server = spawn('npx', ['vite', '--host', '127.0.0.1', '--port', '5189', '--strictPort'], {
    cwd: resolve('apps/compare'), stdio: ['ignore', 'ignore', 'inherit'], detached: true,
  });
  for (let i = 0; i < 60 && !(await alive()); i++) await new Promise(r => setTimeout(r, 500));
  if (!(await alive())) { console.error('vite did not come up on ' + BASE); process.exit(1); }
}
const stopServer = () => { if (server) try { process.kill(-server.pid); } catch { /* already gone */ } };
process.on('exit', stopServer);

const { chromium } = await import('@playwright/test');
const browser = await chromium.launch({ headless: true });
const pages = {};
for (const side of ['official', 'ours']) {
  const page = await browser.newPage({ viewport: { width: 900, height: 560 }, deviceScaleFactor: 1 });
  await page.goto(BASE + '/tablesheet-panel-comparison.html?side=' + side);
  await page.waitForFunction(() => !!window.panelReady, null, { timeout: 60000 });
  pages[side] = page;
}

const scenarios = ['default', 'groups', 'grouped-view', 'toggled', 'drag-group', 'narrow'];

// --- structure matching ---------------------------------------------------------
// Collapse the embedded mini-workbook internals: they are Spread-DOM noise whose
// details (hidden dialogs, scrollbars) are not part of the panel contract.
function normalize(lines) {
  const out = [];
  let skipIndent = null;
  for (const line of lines) {
    const indent = line.match(/^ */)[0].length;
    if (skipIndent !== null) {
      if (indent > skipIndent) continue;
      skipIndent = null;
    }
    out.push(line.trim());
    if (/\bdiv\.gc-table-sheet-field-panel\b|gc-table-sheet-field-panel$|\.gc-table-sheet-field-panel/.test(line.trim())) {
      out.push('  [mini-workbook internals collapsed]');
      skipIndent = indent;
    }
  }
  return out;
}
function parse(lines) {
  return normalize(lines).map(line => {
    const geo = line.match(/(-?\d+),(-?\d+) (-?\d+)x(-?\d+)/);
    const cls = line.match(/^(\s*)(\w+[^ ]*) /);
    return {
      depth: (line.match(/^ */)?.[0].length ?? 0) / 2,
      sel: cls ? cls[2].replace(/ [-\d,].*/, '') : line,
      geo: geo ? geo.slice(1).map(Number) : null,
      text: (line.match(/text=(\[[^\n]*\])/) ?? [])[1] ?? '',
      raw: line,
    };
  });
}
function structureMatch(a, b) {
  const nodesA = parse(a.split('\n'));
  const nodesB = parse(b.split('\n'));
  let matched = 0;
  const used = new Set();
  for (const node of nodesA) {
    const hit = nodesB.findIndex((cand, i) => !used.has(i)
      && cand.depth === node.depth
      && cand.sel === node.sel
      && (!node.geo || !cand.geo || node.geo.every((v, k) => Math.abs(v - cand.geo[k]) <= 4)));
    if (hit >= 0) { used.add(hit); matched++; }
  }
  return nodesA.length ? 100 * matched / nodesA.length : 100;
}

const all = {};
for (const scenario of scenarios) {
  all[scenario] = {};
  for (const side of ['official', 'ours']) {
    const page = pages[side];
    const record = await page.evaluate(name => (async () => {
      await window.panelScenario(name);
      await new Promise(r => setTimeout(r, 600));
      return { structure: window.panelStructure('#panel'), state: window.panelState(), mini: window.panelFieldSheet() };
    })(name), scenario);
    all[scenario][side] = record;
    await page.locator('#panel').screenshot({ path: `.probe/panel-${scenario}-${side}.png` });
  }
  const official = PNG.sync.read(readFileSync(`.probe/panel-${scenario}-official.png`));
  const ours = PNG.sync.read(readFileSync(`.probe/panel-${scenario}-ours.png`));
  const w = Math.max(official.width, ours.width), h = Math.max(official.height, ours.height);
  const fit = img => (img.width === w && img.height === h) ? img : (() => {
    const out = new PNG({ width: w, height: h, fill: 255 });
    PNG.bitblt(img, out, 0, 0, Math.min(img.width, w), Math.min(img.height, h), 0, 0);
    return out;
  })();
  const a = fit(official), b = fit(ours);
  const diff = new PNG({ width: w, height: h });
  const changed = pixelmatch(a.data, b.data, diff.data, w, h, { threshold: 0.1 });
  all[scenario].differencePercent = 100 * changed / (w * h);
  writeFileSync(`.probe/panel-${scenario}-diff.png`, PNG.sync.write(diff));
  all[scenario].domMatchPercent = structureMatch(all[scenario].official.structure, all[scenario].ours.structure);
  console.log(`${scenario}: diff ${all[scenario].differencePercent.toFixed(2)}%  dom ${all[scenario].domMatchPercent.toFixed(1)}%`);
}
writeFileSync('.probe/tablesheet-panel-comparison.json', JSON.stringify(all, null, 2));
await browser.close();
stopServer();
console.log('written .probe/tablesheet-panel-comparison.json');
