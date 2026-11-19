import path from 'node:path';
import { defineConfig } from '@playwright/test';

// DESIGNER_URL lets a second dev server (e.g. the coder's work tree) be tested while 5175 serves another copy.
const designerUrl = process.env.DESIGNER_URL ?? 'http://127.0.0.1:5175';
process.env.PLAYWRIGHT_BROWSERS_PATH ??= path.resolve('../../.playwright-browsers');
export default defineConfig({
  testDir: './test',
  outputDir: '../../test-results/designer/artifacts',
  fullyParallel: false,
  workers: 1,
  timeout: 45_000,
  use: { baseURL: designerUrl, viewport: { width: 1440, height: 800 }, deviceScaleFactor: 1 },
  webServer: { command: 'pnpm dev', url: designerUrl, reuseExistingServer: !process.env.CI },
});
