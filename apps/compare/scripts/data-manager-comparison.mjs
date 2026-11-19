#!/usr/bin/env node
// Compares the shared, currently implemented local-data scenario in a browser.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.env.PLAYWRIGHT_BROWSERS_PATH ??= path.resolve(root, '../../.playwright-browsers');
const { chromium } = await import('@playwright/test');
const server = await createServer({ root, logLevel: 'error', server: { port: 0, strictPort: false } });
let browser;
try {
  await server.listen();
  browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(new URL('data-manager-comparison.html', server.resolvedUrls.local[0]).href);
  await page.waitForFunction(() => typeof window.dataManagerScenario === 'function');
  const official = await page.evaluate(() => window.dataManagerScenario('official'));
  const ours = await page.evaluate(() => window.dataManagerScenario('ours'));
  console.log('official:', JSON.stringify(official));
  console.log('ours:', JSON.stringify(ours));
  if (JSON.stringify(official) !== JSON.stringify(ours)) process.exitCode = 1;
  else console.log('MATCH');
} finally {
  await browser?.close();
  await server.close();
}
