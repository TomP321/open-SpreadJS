import { createServer } from 'vite';
import { chromium } from '@playwright/test';
import { isDeepStrictEqual } from 'node:util';

const server = await createServer({ root: new URL('..', import.meta.url).pathname, logLevel: 'error', server: { port: 0 } });
await server.listen();
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.goto(new URL('data-manager-comparison.html', server.resolvedUrls.local[0]).href);
  const [official, ours] = await page.evaluate(async () => Promise.all(['official', 'ours'].map(window.dataManagerScenario)));
  if (!isDeepStrictEqual(official, ours)) {
    console.error(JSON.stringify({ official, ours }, null, 2));
    process.exitCode = 1;
  } else {
    console.log('GC.Data comparison matches');
  }
} finally {
  await browser.close();
  await server.close();
}
