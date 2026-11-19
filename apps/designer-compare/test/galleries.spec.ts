/* eslint-disable @typescript-eslint/no-explicit-any */
import { test, expect } from '@playwright/test';
import { boot, expectBoxClose } from './helpers';

test.describe('Home galleries', () => {
  test('Format Table gallery exposes the same sections and tile grid as the trial', async ({ browser }) => {
    const officialPage = await browser.newPage({ viewport: { width: 1440, height: 800 } });
    const oursPage = await browser.newPage({ viewport: { width: 1440, height: 800 } });
    await boot(officialPage, 'official');
    await boot(oursPage, 'ours');
    await officialPage.locator('[data-command="ribbon.formatTable2"] .dropdown-btn').click();
    await oursPage.locator('[data-command="ribbon.formatTable2"] .dropdown-btn').click();
    await officialPage.waitForTimeout(200);
    await oursPage.waitForTimeout(200);
    const layout = async (page: any) => page.evaluate(() => {
      const menu = document.querySelector('.gc-designer-ribbon-dropdown') as HTMLElement;
      const r = menu.getBoundingClientRect();
      const box = (element: Element) => { const b = element.getBoundingClientRect(); return { x: b.x - r.x, y: b.y - r.y, width: b.width, height: b.height }; };
      return {
        menu: { x: r.x, y: r.y, width: r.width, height: r.height },
        titles: [...menu.querySelectorAll('.gc-list-control-group-text, .gc-designer-gallery-title')].map((element) => ({ text: element.textContent?.trim() ?? '', box: box(element) })),
        tiles: [...menu.querySelectorAll('.gc-list-control-item, .gc-designer-table-tile')].map((element) => box(element)),
        footer: menu.textContent?.includes('New Table Style'),
      };
    });
    const [official, ours] = await Promise.all([layout(officialPage), layout(oursPage)]);
    expectBoxClose(ours.menu, official.menu, 1, 'gallery');
    expect(ours.titles.map((t: any) => t.text)).toEqual(official.titles.map((t: any) => t.text));
    for (let i = 0; i < official.titles.length; i++) expectBoxClose(ours.titles[i].box, official.titles[i].box, 1, official.titles[i].text);
    expect(ours.tiles.length).toBe(official.tiles.length);
    for (const index of [0, 6, 20, 21, 48, 59]) expectBoxClose(ours.tiles[index], official.tiles[index], 1, `tile ${index}`);
    expect(ours.footer).toBe(true);
    await officialPage.close();
    await oursPage.close();
  });

  test('Cell Styles gallery groups and applies a style', async ({ page }) => {
    await boot(page, 'ours');
    await page.locator('[data-command="ribbon.cellStyles"] .dropdown-btn').click();
    const gallery = page.locator('.gc-designer-cell-styles-gallery');
    await expect(gallery).toBeVisible();
    await expect(gallery.getByText('Good, Bad and Neutral')).toBeVisible();
    await expect(gallery.getByText('Titles and Headings')).toBeVisible();
    await gallery.getByText('Bad', { exact: true }).click();
    await page.waitForTimeout(100);
    expect(await page.evaluate(() => (window as any).__designerCompare.spread.getActiveSheet().getActualStyle(1, 1).backColor)).toBe('#ffc7ce');
  });
});
