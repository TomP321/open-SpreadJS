/* eslint-disable @typescript-eslint/no-explicit-any */
import { expect, test } from '@playwright/test';
import { boot } from './helpers';

for (const [label, value] of [['Left', 2], ['Right', 3], ['Bottom', 0], ['Top', 1]] as const) {
  test(`sheet tab position ${label} matches the trial`, async ({ browser }) => {
    const results: number[] = [];
    for (const side of ['official', 'ours'] as const) {
      const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
      await boot(page, side);
      await page.mouse.click(125, 683, { button: 'right' });
      await page.getByRole('menuitem', { name: 'SheetTab Position' }).hover();
      await page.getByRole('menuitem', { name: label, exact: true }).click();
      results.push(await page.evaluate(() => (window as any).__designerCompare.spread.options.tabStripPosition));
      await page.close();
    }
    expect(results).toEqual([value, value]);
  });
}
