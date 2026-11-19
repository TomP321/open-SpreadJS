/* eslint-disable @typescript-eslint/no-explicit-any */
import { expect, test } from '@playwright/test';
import { boot } from './helpers';

for (const side of ['official', 'ours'] as const) {
  test(`${side}: tab context menu flips above the real mouse click`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await boot(page, side);
    await page.mouse.click(125, 683, { button: 'right' });
    const menu = page.locator('.gc-ui-contextmenu-container:visible, .gc-designer-context-menu:visible');
    await expect(menu).toHaveCount(1);
    const box = await menu.boundingBox();
    expect(box).not.toBeNull();
    expect(Math.abs(box!.x - 125)).toBeLessThanOrEqual(1);
    expect(Math.abs(box!.y + box!.height - 683)).toBeLessThanOrEqual(1);
  });
}

test('synthetic tab pointerdown does not throw', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await boot(page, 'ours');
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.evaluate(() => {
    const target = document.elementFromPoint(125, 683);
    target?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 125, clientY: 683, button: 0, pointerId: 999 }));
  });
  expect(errors).toEqual([]);
});

test('tab menu matches the trial entries and bounding box', async ({ browser }) => {
  const results = [];
  for (const side of ['official', 'ours'] as const) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await boot(page, side);
    await page.mouse.click(125, 683, { button: 'right' });
    const menu = page.locator('.gc-ui-contextmenu-container:visible, .gc-designer-context-menu:visible');
    results.push({ box: await menu.boundingBox(), entries: await menu.getByRole('menuitem').allTextContents() });
    await page.close();
  }
  expect.soft(results[1].entries).toEqual(results[0].entries);
  for (const key of ['x', 'y', 'width', 'height'] as const) {
    expect.soft(Math.abs(results[1].box![key] - results[0].box![key]), key).toBeLessThanOrEqual(1);
  }
});

test('tab menu pixels match the trial within 0.5%', async ({ browser }) => {
  const { PNG } = await import('pngjs');
  const { default: pixelmatch } = await import('pixelmatch');
  const images = [];
  for (const side of ['official', 'ours'] as const) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await boot(page, side);
    await page.mouse.click(125, 683, { button: 'right' });
    await expect(page.locator('.gc-ui-contextmenu-container:visible, .gc-designer-context-menu:visible')).toHaveCount(1);
    images.push(PNG.sync.read(await page.screenshot({ clip: { x: 125, y: 421, width: 190, height: 262 } })));
    await page.close();
  }
  const diff = pixelmatch(images[0].data, images[1].data, null, 190, 262, { threshold: 0.1, includeAA: false });
  expect(100 * diff / (190 * 262), 'menu pixel difference %').toBeLessThan(0.5);
});

test('single-sheet Delete remains enabled and leaves the sheet intact', async ({ browser }) => {
  const results = [];
  for (const side of ['official', 'ours'] as const) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await boot(page, side);
    await page.mouse.click(125, 683, { button: 'right' });
    const item = page.getByRole('menuitem', { name: 'Delete', exact: true });
    const disabled = await item.getAttribute('aria-disabled');
    await item.click();
    results.push({ disabled: disabled === 'true', count: await page.evaluate(() => (window as any).__designerCompare.spread.getSheetCount()) });
    await page.close();
  }
  expect(results[1]).toEqual(results[0]);
});
