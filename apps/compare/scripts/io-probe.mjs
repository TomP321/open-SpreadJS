#!/usr/bin/env node
// Usage: pnpm --filter @opensheets/compare io-probe -- "<async expression using helpers>"
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, '..');
const repoRoot = path.resolve(appRoot, '../..');
process.env.PLAYWRIGHT_BROWSERS_PATH ??= path.join(repoRoot, '.playwright-browsers');
const { chromium } = await import('@playwright/test');
const source = process.argv.slice(2).filter(a => a !== '--').join(' ');
if (!source) { console.error('usage: io-probe -- "expression"'); process.exit(2); }
const server = await createServer({ root: appRoot, logLevel: 'error', server: { port: 0, strictPort: false } });
await server.listen();
const browser = await chromium.launch();
const page = await browser.newPage();
page.on('pageerror', e => console.error('[page error]', e.message));
await page.goto(server.resolvedUrls.local[0] + 'io-probe.html');
await page.waitForFunction(() => window.__ioProbe?.ready, null, { timeout: 60000 });
const result = await page.evaluate(s => window.__ioProbe.run(s), source);
await browser.close();
await server.close();
const sanitise = value => JSON.stringify(value, (k, v) => k === 'text' && typeof v === 'string' && v.length > 2000 ? `[${v.length} chars] ${v.slice(0, 200)}` : v, 1);
console.log('official:', sanitise(result.official));
console.log('ours    :', sanitise(result.ours));
process.exit(0);
