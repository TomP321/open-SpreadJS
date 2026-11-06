import path from 'node:path';
import { defineConfig } from '@playwright/test';
process.env.PLAYWRIGHT_BROWSERS_PATH ??= path.resolve('../../.playwright-browsers');
export default defineConfig({
  testDir: './test',
  outputDir: '../../test-results/compare/artifacts',
  fullyParallel: false,
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:5174', viewport: { width: 1440, height: 800 }, deviceScaleFactor: 1 },
  webServer: { command: 'pnpm dev', url: 'http://127.0.0.1:5174', reuseExistingServer: !process.env.CI },
});
