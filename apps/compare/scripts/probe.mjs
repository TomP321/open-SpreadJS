#!/usr/bin/env node
// Usage: pnpm --filter @opensheets/compare probe -- "<expression using GC, wb, sheet>"
// Runs the expression against the official trial and OpenSheets, printing both results.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, '..');
const repoRoot = path.resolve(appRoot, '../..');
process.env.PLAYWRIGHT_BROWSERS_PATH ??= path.join(repoRoot, '.playwright-browsers');
const { chromium } = await import('@playwright/test');
const source = process.argv.slice(2).filter(a => a !== '--').join(' ');
if (!source) { console.error('usage: probe -- "expression"'); process.exit(2); }
const server = await createServer({ root: appRoot, logLevel: 'error', server: { port: 0, strictPort: false } });
await server.listen();
const browser = await chromium.launch();
const page = await browser.newPage();
page.on('pageerror', e => console.error('[page error]', e.message));
await page.goto(server.resolvedUrls.local[0] + 'probe.html');
await page.waitForFunction(() => window.__probe?.ready, null, { timeout: 60000 });
const result = await page.evaluate(s => window.__probe.run(s), source);
await browser.close();
await server.close();
console.log('official:', JSON.stringify(result.official, null, 1));
console.log('ours    :', JSON.stringify(result.ours, null, 1));
const equal = JSON.stringify(result.official) === JSON.stringify(result.ours);
console.log(equal ? 'MATCH' : 'DIFF');
process.exit(equal ? 0 : 1);
