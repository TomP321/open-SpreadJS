/* eslint-disable @typescript-eslint/no-explicit-any */
import { test, expect } from '@playwright/test';
import { boot, captureWithMask, comparePngs, expectBoxClose, expectMaskedBelow } from './helpers';
function expectMath(actual: number, expected: number, tolerance: number, label: string): void { expect(actual, label).toBeGreaterThanOrEqual(expected - tolerance); expect(actual, label).toBeLessThanOrEqual(expected + tolerance); }

test.describe('File backstage', () => {
  test('backstage menu layout and pixels match excluding generated preview and icons', async ({ browser }) => {
    const officialPage = await browser.newPage({ viewport: { width: 1440, height: 800 } });
    const oursPage = await browser.newPage({ viewport: { width: 1440, height: 800 } });
    await boot(officialPage, 'official');
    await boot(oursPage, 'ours');
    await officialPage.locator('.gc-designer-fileMenuButton').click();
    await oursPage.locator('.gc-designer-fileMenuButton').click();
    await officialPage.waitForTimeout(250);
    await oursPage.waitForTimeout(250);
    const layout = async (page: any) => page.evaluate(() => {
      const rect = (element: Element) => { const r = element.getBoundingClientRect(); return { x: +r.x.toFixed(2), y: +r.y.toFixed(2), width: +r.width.toFixed(2), height: +r.height.toFixed(2) }; };
      const items = [...document.querySelectorAll('.gc-list-control-item, .gc-designer-list-control-item, .gc-designer-backstage-item')].map((element) => ({
        text: (element as HTMLElement).dataset.text || element.textContent?.trim() || '',
        box: rect(element),
        selected: element.classList.contains('selected') || element.classList.contains('gc-list-control-selected-item'),
      })).filter((item) => item.text);
      const menu = document.querySelector('.gc-designer-backstage-menu, .gc-file-menu-category');
      const content = document.querySelector('.gc-designer-backstage-content, .category-content-container');
      const title = document.querySelector('.gc-designer-backstage-title, .gc-designer-file-menu-new-title');
      const preview = document.querySelector('.gc-designer-new-template, .gc-designer-new-sheet-temmplate-container');
      const back = document.querySelector('.gc-designer-backstage-back, .back-button-container');
      return { items, menu: menu ? rect(menu) : null, content: content ? rect(content) : null, title: title ? rect(title) : null, preview: preview ? rect(preview) : null, back: back ? rect(back) : null };
    });
    const [official, ours] = await Promise.all([layout(officialPage), layout(oursPage)]);
    expect(ours.items.map((item) => item.text)).toEqual(official.items.map((item) => item.text));
    for (let i = 0; i < official.items.length; i++) {
      expectBoxClose(ours.items[i].box, official.items[i].box, 6, official.items[i].text);
      expect(ours.items[i].selected).toBe(official.items[i].selected);
    }
    if (official.menu && ours.menu) expectBoxClose(ours.menu, official.menu, 1, 'menu');
    if (official.title && ours.title) { expectMath(ours.title.x, official.title.x, 1, 'title x'); expectMath(ours.title.y, official.title.y, 1, 'title y'); }
    if (official.back && ours.back) expectBoxClose(ours.back, official.back, 1, 'back');
    // Pixel gate: icons and the generated blank-workbook preview are excluded, as recorded icon/content assets.
    const clip = { x: 0, y: 0, width: 1440, height: 800 };
    const masks = '.gc-designer-backstage-back-icon, .gc-designer-new-thumb, .gc-designer-mini-sheet, .gc-designer-new-sheet-temmplate-container, .gc-designer-template-thumb-icon';
    const extra = [official.preview, ours.preview, official.back, ours.back].filter(Boolean).map((box: any) => box);
    const [o, u] = await Promise.all([
      captureWithMask(officialPage, clip, masks.split(', '), extra),
      captureWithMask(oursPage, clip, masks.split(', '), extra),
    ]);
    const result = comparePngs(o.png, u.png, o.mask, u.mask);
    expectMaskedBelow(result, 0.5);
    await officialPage.close();
    await oursPage.close();
  });

  test('New resets the workbook', async ({ page }) => {
    await boot(page, 'ours');
    await page.evaluate(() => (window as any).__designerCompare.spread.getActiveSheet().setValue(0, 0, 'dirty'));
    await page.locator('.gc-designer-fileMenuButton').click();
    await page.getByRole('menuitemradio', { name: 'New' }).click();
    await page.locator('.gc-designer-new-template').click();
    await page.waitForTimeout(150);
    expect(await page.evaluate(() => (window as any).__designerCompare.spread.getActiveSheet().getValue(0, 0))).toBeNull();
  });

  test('Save downloads the workbook as ssjson', async ({ page }) => {
    await boot(page, 'ours');
    await page.locator('.gc-designer-fileMenuButton').click();
    await page.getByRole('menuitemradio', { name: 'Save' }).click();
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: /Save this workbook/ }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.ssjson$/);
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    const json = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    expect(json.sheets).toBeTruthy();
    expect(Object.keys(json.sheets)).toContain('Data');
  });

  test('Open loads a saved ssjson', async ({ page }) => {
    await boot(page, 'ours');
    const payload = JSON.stringify({ sheetCount: 1, sheets: { Data: { name: 'Data', rowCount: 10, columnCount: 5, data: { dataTable: { 0: { 0: { value: 42 } } } } } } });
    await page.locator('.gc-designer-fileMenuButton').click();
    const chooserPromise = page.waitForEvent('filechooser');
    await page.getByRole('menuitemradio', { name: 'Open' }).click();
    await page.getByRole('button', { name: /Open a SpreadJS file/ }).click();
    const chooser = await chooserPromise;
    await chooser.setFiles({ name: 'test.ssjson', mimeType: 'application/json', buffer: Buffer.from(payload) });
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => (window as any).__designerCompare.spread.getActiveSheet().getValue(0, 0))).toBe(42);
  });
});
