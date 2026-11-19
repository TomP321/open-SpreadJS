/* eslint-disable @typescript-eslint/no-explicit-any */
import { expect, test } from '@playwright/test';
import { boot } from './helpers';

for (const side of ['official', 'ours'] as const) {
  for (const area of ['cell', 'row', 'column', 'corner', 'tab', 'table'] as const) {
    test(`${side}: one context menu for ${area}`, async ({ page }) => {
      // The tab strip moves with the viewport; these coordinates target it at
      // 720px height rather than a cell above it at the default height.
      await page.setViewportSize({ width: 1280, height: 720 });
      await boot(page, side);
      if (area === 'table') await page.evaluate(() => {
        const sheet = (window as any).__designerCompare.spread.getActiveSheet();
        sheet.tables.add('TestTable', 0, 0, 3, 3);
      });
      const point = { cell: [150, 230], row: [20, 230], column: [150, 190], corner: [20, 190], tab: [125, 683], table: [150, 230] }[area];
      await page.mouse.click(point[0], point[1], { button: 'right' });
      const menus = page.locator('.gc-ui-contextmenu-container:visible, .gc-designer-context-menu:visible');
      await expect(menus).toHaveCount(1);
      if (area === 'tab') await expect(menus).toContainText('Rename');
    });
  }
}

for (const side of ['official', 'ours'] as const) {
  test(`${side}: allowContextMenu disables the Designer menu`, async ({ page }) => {
    await boot(page, side);
    await page.evaluate(() => { (window as any).__designerCompare.spread.options.allowContextMenu = false; });
    await page.mouse.click(150, 230, { button: 'right' });
    await expect(page.locator('.gc-ui-contextmenu-container:visible, .gc-designer-context-menu:visible')).toHaveCount(0);
  });
}

for (const side of ['official', 'ours'] as const) {
  test(`${side}: a left click on a cell dismisses the cell menu without moving the selection`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await boot(page, side);
    const active = (): Promise<[number, number]> => page.evaluate(() => {
      const sheet = (window as any).__designerCompare.spread.getActiveSheet();
      return [sheet.getActiveRowIndex(), sheet.getActiveColumnIndex()] as [number, number];
    });
    await page.mouse.click(150, 230, { button: 'right' });
    const menus = page.locator('.gc-ui-contextmenu-container:visible, .gc-designer-context-menu:visible');
    await expect(menus).toHaveCount(1);
    const before = await active();
    await page.mouse.click(80, 450); // column A, left of the menu (which opens to the right of the cursor)
    await expect(menus).toHaveCount(0);
    expect(await active()).toEqual(before);
  });
}
