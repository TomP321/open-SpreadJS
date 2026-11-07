import { test, expect } from '@playwright/test';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

for (const dpr of [1, 2]) {
  test.describe(`formula editor DPR ${dpr}`, () => {
  test.use({ deviceScaleFactor: dpr });
  test('formula editor pixels', async ({ page }) => {
    const images: PNG[] = [];
    for (const side of ['official', 'ours'] as const) {
      await page.goto('/?scenario=empty'); await page.waitForFunction(() => window.__compare?.ready);
      const pane = (await page.locator(`#${side}-pane`).boundingBox())!;
      await page.mouse.click(pane.x + 55, pane.y + 30); await page.keyboard.type('=SU');
      const editor = page.locator(side === 'official' ? '[gcuielement=gcEditingInput]' : '#ours-pane .gc-cell-editor');
      await expect(editor).toBeVisible();
      const box = (await editor.boundingBox())!;
      images.push(PNG.sync.read(await page.screenshot({ clip: { x: box.x, y: box.y, width: 60, height: 19 }, scale: 'device' })));
    }
    const [reference, actual] = images;
    const pixels = pixelmatch(reference.data, actual.data, null, reference.width, reference.height, { threshold: 0.1 });
    console.log(`editor DPR ${dpr}: ${pixels}/${reference.width * reference.height}`);
    expect(pixels / (reference.width * reference.height)).toBeLessThan(0.005);
  });
  });
}
