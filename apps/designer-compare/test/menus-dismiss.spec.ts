/* eslint-disable @typescript-eslint/no-explicit-any */
/*
 * TASK 60 item 1 — collapsed-ribbon-group popups must close on an outside pointer press,
 * exactly like the trial: press the grid -> popup gone; press another ribbon control ->
 * only that control's popup is open; press the owning group button twice -> toggles closed.
 * Runs against both sides in the same browser at 1280x720 (the width where Styles / Cells /
 * Editing collapse into popup buttons).
 *
 * The presses go through the real pointer (mouse.click at measured coordinates), not locator
 * clicks: the collapsed-group container carries the trial's aria-disabled bookkeeping, which a
 * locator would treat as "not enabled".
 */
import { test, expect } from '@playwright/test';
import { boot } from './helpers';

const VIEWPORT = { width: 1280, height: 720 };

const menus = (page: any) => page.evaluate(() => Array.from(document.querySelectorAll('.gc-designer-ribbon-dropdown')).map((element) => {
  const r = element.getBoundingClientRect();
  return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) };
}));
const activeCell = (page: any) => page.evaluate(() => {
  const input = document.querySelector('input.gc-name-box-selector, [aria-label="Name Box"]') as HTMLInputElement | null;
  return input ? input.value : null;
});

async function center(page: any, selector: string): Promise<{ x: number; y: number }> {
  const box = await page.locator(selector).first().boundingBox();
  expect(box, `found ${selector}`).not.toBeNull();
  return { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 };
}

for (const side of ['official', 'ours'] as const) {
  test(`${side}: collapsed-group popup closes when the grid is pressed`, async ({ browser }) => {
    const page = await browser.newPage({ viewport: VIEWPORT });
    await boot(page, side);
    const cells = await center(page, '[data-command="ribbon.ribbonGroupId.ribbon-thumbnail-cells"]');
    await page.mouse.click(cells.x, cells.y);
    await page.waitForTimeout(400);
    expect((await menus(page)).length, 'the Cells popup opened').toBe(1);

    // Press an empty cell while the popup is open.
    await page.mouse.click(450, 380);
    await page.waitForTimeout(400);
    expect(await menus(page), 'the popup is gone after a press on the grid').toEqual([]);
    // The press was not swallowed: the active cell moved on both sides.
    expect(await activeCell(page), 'the grid press still selected the cell').toMatch(/^[A-Z]+\d+$/);

    // Pressing the owning group button while its popup is open toggles the popup closed.
    await page.mouse.click(cells.x, cells.y);
    await page.waitForTimeout(400);
    expect((await menus(page)).length).toBe(1);
    await page.mouse.click(cells.x, cells.y);
    await page.waitForTimeout(400);
    expect(await menus(page), 'pressing the owning control toggles the popup closed').toEqual([]);
    await page.close();
  });

  test(`${side}: pressing another ribbon control leaves only that control's popup open`, async ({ browser }) => {
    const page = await browser.newPage({ viewport: VIEWPORT });
    await boot(page, side);
    const cells = await center(page, '[data-command="ribbon.ribbonGroupId.ribbon-thumbnail-cells"]');
    await page.mouse.click(cells.x, cells.y);
    await page.waitForTimeout(400);
    expect((await menus(page)).length).toBe(1);

    // The number-format combo (same data-command on both sides): press its dropdown arrow.
    const combo = await center(page, '[data-command="ribbon.ribbonNumberFormat"]');
    const comboBox = await page.locator('[data-command="ribbon.ribbonNumberFormat"]').first().boundingBox();
    await page.mouse.click(comboBox!.x + comboBox!.width - 8, combo.y);
    await page.waitForTimeout(400);
    const open = await menus(page);
    expect(open.length, 'exactly one popup is open').toBe(1);
    expect(open[0].x, 'it is the number-format dropdown, opened at its combo').toBe(Math.round(comboBox!.x));
    await page.close();
  });
}
