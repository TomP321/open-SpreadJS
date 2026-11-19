import fs from 'node:fs/promises';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import { comparePanes, limits } from './pixel-report.js';

// The tab strip in all four tabStripPosition values (bottom/top/left/right) must render
// like the trial: same clip width, ellipsis, plus button and separators in every band.
for (const dpr of [1, 2]) {
  test.describe(`DPR ${dpr}`, () => {
    test.use({ deviceScaleFactor: dpr });
    for (const position of [0, 1, 2, 3]) {
      test(`tabStripPosition ${position}: strip, headers and content pixels match`, async ({ page }) => {
        const errors: string[] = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.goto('/?scenario=multiple-sheets');
        await page.waitForFunction(() => window.__compare?.ready);
        await page.evaluate(position => {
          for (const workbook of [window.__compare!.official, window.__compare!.ours]) {
            workbook.options.tabStripPosition = position;
            workbook.setActiveSheet('Details');
          }
        }, position);
        await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
        expect(errors).toEqual([]);
        const regions = await page.evaluate(position => {
          const pane = document.getElementById('official-pane')!;
          const width = pane.clientWidth, height = pane.clientHeight;
          const strip = position === 0 ? { x: 0, y: height - 28, width, height: 28 } : position === 1 ? { x: 0, y: 0, width, height: 28 }
            : position === 2 ? { x: 0, y: 0, width: 80, height } : { x: width - 80, y: 0, width: 80, height };
          const first = window.__compare!.official.getActiveSheet().getCellRect(0, 0);
          const x0 = position === 2 ? 80 : 0, y0 = position === 1 ? 28 : 0;
          const body = { x: x0, y: y0, width: width - x0, height: height - y0 };
          const headerHeight = first.y, headerWidth = first.x;
          return {
            content: [body],
            headers: [{ x: x0, y: y0, width: body.width, height: headerHeight }, { x: x0, y: y0 + headerHeight, width: headerWidth, height: body.height - headerHeight }],
            tabs: [strip],
            glyphs: [],
          };
        }, position);
        const directory = path.resolve('../../test-results/compare');
        await fs.mkdir(directory, { recursive: true });
        const name = `tab-strip-position-${position}${dpr === 2 ? '-2x' : ''}`;
        await fs.writeFile(path.join(directory, `${name}-regions.json`), JSON.stringify(regions));
        const captures: Buffer[] = [];
        for (const pane of ['official', 'ours']) {
          const screenshot = path.join(directory, `${name}-${pane}.png`);
          captures.push(await page.locator(`#${pane}-pane`).screenshot({ path: screenshot, animations: 'disabled' }));
          await test.info().attach(`${name}-${pane}`, { path: screenshot, contentType: 'image/png' });
        }
        const metrics = await comparePanes(name, captures[0], captures[1], regions, dpr);
        for (const key of ['tabs', 'headers', 'content'] as const)
          expect(metrics[key].ratio, `${name} ${key} ${(metrics[key].pixels / Math.max(1, metrics[key].area) * 100).toFixed(3)}% of ${metrics[key].area}px over ${key} regions`).toBeLessThan(limits[key]);
      });
    }
  });
}
