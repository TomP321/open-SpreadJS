import path from 'node:path';
import { defineConfig } from '@playwright/test';
process.env.PLAYWRIGHT_BROWSERS_PATH ??= path.resolve('../../.playwright-browsers');
// TASK 72 item 6: the unit suites run with TZ=UTC (`TZ=UTC vitest run`); the XLSX four-way
// round-trip (m7-io) compares date cells across engines and file codecs, so the browser
// pages need the same deterministic timezone. The launched browsers inherit this environment.
process.env.TZ = 'UTC';
export default defineConfig({
  testDir: './test',
  globalTeardown: './test/pixel-report.ts',
  outputDir: '../../test-results/compare/artifacts',
  fullyParallel: false,
  workers: 1,
  // CMP_BASE_URL lets a local run target a dev server on another port (e.g. when 5174 is taken by a stale checkout).
  use: { baseURL: process.env.CMP_BASE_URL ?? 'http://127.0.0.1:5174', viewport: { width: 1440, height: 800 }, deviceScaleFactor: 1 },
  webServer: { command: 'pnpm dev', url: process.env.CMP_BASE_URL ?? 'http://127.0.0.1:5174', reuseExistingServer: !process.env.CI },
});
