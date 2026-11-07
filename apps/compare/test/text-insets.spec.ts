import { expect, test } from '@playwright/test';
import { PNG } from 'pngjs';

// Measure dark text ink within B1, keeping the cell background and grid intact.
for (const dpr of [1, 2]) {
  test.describe(`basic text insets at DPR ${dpr}`, () => {
    test.use({ deviceScaleFactor: dpr });
    test('Quantity has the same ink bounds on both panes', async ({ page }) => {
      await page.goto('/?scenario=values');
      await page.waitForFunction(() => window.__compare?.ready);
      const rects = await page.evaluate(() => {
        return (['official', 'ours'] as const).map(pane => {
          const root = document.getElementById(`${pane}-pane`)!.getBoundingClientRect();
          const cell = window.__compare![pane].getActiveSheet().getCellRect(0, 1);
          return { x: root.x + cell.x, y: root.y + cell.y, width: cell.width, height: cell.height };
        });
      });
      const image = PNG.sync.read(await page.screenshot());
      const insets = rects.map(rect => {
        const x0 = Math.round(rect.x * dpr), y0 = Math.round(rect.y * dpr);
        const width = Math.round(rect.width * dpr), height = Math.round(rect.height * dpr);
        let left = width, top = height, right = -1, bottom = -1;
        for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) {
          const offset = ((y0 + y) * image.width + x0 + x) * 4;
          if (image.data[offset] < 200 && image.data[offset + 1] < 200 && image.data[offset + 2] < 200) {
            left = Math.min(left, x); right = Math.max(right, x);
            top = Math.min(top, y); bottom = Math.max(bottom, y);
          }
        }
        expect(right).toBeGreaterThanOrEqual(0);
        return { left, top, right: width - 1 - right, bottom: height - 1 - bottom };
      });
      for (const side of ['left', 'top', 'right', 'bottom'] as const) {
        expect(Math.abs(insets[0][side] - insets[1][side]), side).toBeLessThanOrEqual(dpr === 1 ? 0 : 1);
      }
    });
  });
}
