import fs from 'node:fs/promises';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import { comparePanes } from './pixel-report.js';
import { scenarios } from '../src/scenarios/index.js';

for (const scenario of scenarios) {
  test(`${scenario.name}: capture both black-box panes`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`/?scenario=${scenario.name}`);
    await page.waitForFunction(() => window.__compare?.ready);
    expect(errors).toEqual([]);
    const snapshots = await page.evaluate(() => {
      const state = window.__compare!;
      const snapshot = (workbook: typeof state.ours) => workbook.sheets.map(sheet => ({
        name: sheet.name(), values: Array.from({ length: 4 }, (_, r) => Array.from({ length: 3 }, (_, c) => sheet.getValue(r, c))),
      }));
      return { official: snapshot(state.official), ours: snapshot(state.ours) };
    });
    expect(snapshots.ours).toEqual(snapshots.official);
    const nameResults = await page.evaluate(() => {
      const state = window.__compare!;
      const observe = (workbook: typeof state.ours) => {
        const sheet = workbook.getActiveSheet();
        const name = String(sheet.name());
        const result = sheet.name(`${name} renamed`);
        const renamed = sheet.name();
        sheet.name(name);
        return { renamed, returnKind: result === sheet ? 'sheet' : result === undefined ? 'undefined' : typeof result };
      };
      return { official: observe(state.official), ours: observe(state.ours) };
    });
    expect(nameResults.ours).toEqual(nameResults.official);
    const directory = path.resolve('../../test-results/compare');
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(path.join(directory, `${scenario.name}.json`), JSON.stringify(snapshots, null, 2) + '\n');
    const captures: Buffer[] = [];
    for (const pane of ['official', 'ours']) {
      const screenshot = path.join(directory, `${scenario.name}-${pane}.png`);
      captures.push(await page.locator(`#${pane}-pane`).screenshot({ path: screenshot, animations: 'disabled' }));
      await test.info().attach(`${scenario.name}-${pane}`, { path: screenshot, contentType: 'image/png' });
    }
    const ratio = await comparePanes(scenario.name, captures[0], captures[1]);
    expect(ratio, `${scenario.name} pixel difference: ${(ratio * 100).toFixed(3)}%`).toBeLessThan(0.01);
  });
}
