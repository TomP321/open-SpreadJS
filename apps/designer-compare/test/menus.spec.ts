/* eslint-disable @typescript-eslint/no-explicit-any */
import { test, expect } from '@playwright/test';
import { boot, captureWithMask, comparePngs, expectBoxClose, expectMaskedBelow } from './helpers';

async function openMenu(page: any, which: 'font' | 'number'): Promise<void> {
  if (which === 'font') await page.locator('.gc-designer-ribbon-comboBox').first().locator('.gc-designer-ribbon-list-btn').click();
  else await page.locator('.gc-designer-ribbon-comboBox').nth(1).locator('.gc-designer-ribbon-list-btn').click();
  await page.waitForTimeout(150);
}

async function menuLayout(page: any): Promise<any> {
  return page.evaluate(() => {
    const menu = document.querySelector('.gc-designer-ribbon-dropdown') as HTMLElement;
    const r = menu.getBoundingClientRect();
    const items = [...menu.querySelectorAll('.gc-designer-combo-simple-item, .gc-designer-ribbon-list-item-container, .gc-list-control-item')].map((element) => {
      const box = element.getBoundingClientRect();
      return { text: (element.textContent ?? '').trim(), box: { x: box.x, y: box.y, width: box.width, height: box.height } };
    });
    return { menu: { x: r.x, y: r.y, width: r.width, height: r.height }, items };
  });
}

for (const which of ['font', 'number'] as const) {
  test(`${which} combo menu matches the trial`, async ({ browser }) => {
    const officialPage = await browser.newPage({ viewport: { width: 1440, height: 800 } });
    const oursPage = await browser.newPage({ viewport: { width: 1440, height: 800 } });
    await boot(officialPage, 'official');
    await boot(oursPage, 'ours');
    await openMenu(officialPage, which);
    await openMenu(oursPage, which);
    const [official, ours] = await Promise.all([menuLayout(officialPage), menuLayout(oursPage)]);
    expectBoxClose(ours.menu, official.menu, 1, 'menu');
    expect(ours.items.map((item: any) => item.text)).toEqual(official.items.map((item: any) => item.text));
    for (let i = 0; i < official.items.length; i++) expectBoxClose(ours.items[i].box, official.items[i].box, 1, official.items[i].text);
    const clip = { x: Math.floor(official.menu.x), y: Math.floor(official.menu.y), width: Math.ceil(official.menu.width), height: Math.ceil(official.menu.height) };
    const masks = '.gc-designer-ribbon-icon, .gc-designer-ribbon-list-triangle, .gc-designer-ribbon-list-item-arrow';
    const [o, u] = await Promise.all([
      captureWithMask(officialPage, clip, masks.split(', ')),
      captureWithMask(oursPage, clip, masks.split(', ')),
    ]);
    expectMaskedBelow(comparePngs(o.png, u.png, o.mask, u.mask), 0.5);
    await officialPage.close();
    await oursPage.close();
  });
}
