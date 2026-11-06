#!/usr/bin/env node
// Differential calc oracle runner.
// Usage: pnpm --filter @opensheets/compare oracle [--filter <substring|regex>] [--file <cases-file-substring>] [--show <n>] [--allow-fail]
// Loads every oracle/cases/*.json (array of OracleCase), runs each case on the official trial and on OpenSheets
// in the same Chromium page, and writes ../../test-results/oracle/{report.json,summary.md}.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';


const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, '..');
const repoRoot = path.resolve(appRoot, '../..');
process.env.PLAYWRIGHT_BROWSERS_PATH ??= path.join(repoRoot, '.playwright-browsers');
const { chromium } = await import('@playwright/test');
const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const filter = opt('--filter'); const fileFilter = opt('--file');
const show = Number(opt('--show') ?? 25); const allowFail = args.includes('--allow-fail');

const caseDir = path.join(appRoot, 'oracle/cases');
const files = fs.readdirSync(caseDir).filter(f => f.endsWith('.json') && (!fileFilter || f.includes(fileFilter))).sort();
let cases = [];
const seen = new Set();
for (const f of files) {
  const list = JSON.parse(fs.readFileSync(path.join(caseDir, f), 'utf8'));
  for (const c of list) {
    if (seen.has(c.id)) throw new Error(`duplicate case id ${c.id} in ${f}`);
    seen.add(c.id); cases.push({ ...c, file: f });
  }
}
if (filter) { const re = new RegExp(filter, 'i'); cases = cases.filter(c => re.test(c.id) || re.test(c.formula ?? '')); }
if (!cases.length) { console.error('no cases selected'); process.exit(2); }

const server = await createServer({ root: appRoot, logLevel: 'error', server: { port: 0, strictPort: false } });
await server.listen();
const url = server.resolvedUrls.local[0] + 'oracle.html';
const browser = await chromium.launch();
const page = await browser.newPage();
page.on('pageerror', e => console.error('[page error]', e.message));
await page.goto(url);
await page.waitForFunction(() => window.__oracle?.ready, null, { timeout: 60000 });

const results = [];
const BATCH = 100;
for (let i = 0; i < cases.length; i += BATCH) {
  const batch = cases.slice(i, i + BATCH).map(({ file, ...c }) => c);
  const out = await page.evaluate(b => window.__oracle.run(b), batch);
  out.forEach((r, j) => results.push({ ...r, file: cases[i + j].file, formula: cases[i + j].formula }));
}
await browser.close(); await server.close();

const failed = results.filter(r => !r.pass);
const byFile = {};
for (const r of results) { const s = (byFile[r.file] ??= { total: 0, pass: 0 }); s.total++; if (r.pass) s.pass++; }
const fnOf = f => (/^=?\s*([A-Z][A-Z0-9.]*)\s*\(/i.exec(f ?? '')?.[1] ?? '(expr)').toUpperCase();
const byFn = {};
for (const r of failed) byFn[fnOf(r.formula)] = (byFn[fnOf(r.formula)] ?? 0) + 1;
const sumMs = k => results.reduce((s, r) => s + r.ms[k], 0).toFixed(0);

const outDir = path.join(repoRoot, 'test-results/oracle');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(results, null, 1));
const fmt = v => JSON.stringify(v);
let md = `# Calc oracle\n\n**${results.length - failed.length}/${results.length} pass** (${failed.length} fail). Time official ${sumMs('official')} ms, ours ${sumMs('ours')} ms.\n\n| file | pass |\n|---|---|\n`;
for (const [f, s] of Object.entries(byFile)) md += `| ${f} | ${s.pass}/${s.total} |\n`;
md += `\n## Failures by function\n\n` + Object.entries(byFn).sort((a, b) => b[1] - a[1]).map(([k, v]) => `- ${k}: ${v}`).join('\n') + '\n\n## Failures\n\n';
for (const r of failed) md += `- \`${r.id}\` \`${r.formula ?? ''}\`\n  - official: ${fmt(r.official)}\n  - ours: ${fmt(r.ours)}\n`;
fs.writeFileSync(path.join(outDir, 'summary.md'), md);

console.log(`ORACLE ${results.length - failed.length}/${results.length} pass, ${failed.length} fail  (official ${sumMs('official')} ms, ours ${sumMs('ours')} ms)`);
for (const [f, s] of Object.entries(byFile)) console.log(`  ${f}: ${s.pass}/${s.total}`);
if (failed.length) {
  console.log(`Top failing functions: ${Object.entries(byFn).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([k, v]) => `${k}(${v})`).join(' ')}`);
  for (const r of failed.slice(0, show)) console.log(`FAIL ${r.id}  ${r.formula ?? ''}\n   official=${fmt(r.official)}\n   ours    =${fmt(r.ours)}`);
  if (failed.length > show) console.log(`... ${failed.length - show} more in test-results/oracle/summary.md`);
}
process.exit(failed.length && !allowFail ? 1 : 0);
