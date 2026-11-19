/* eslint-disable @typescript-eslint/no-explicit-any */
import { expect, test } from '@playwright/test';
import { boot } from './helpers';

for (const axis of ['row', 'column'] as const) {
  test(`header context menu changes ${axis} size like the trial`, async ({ browser }) => {
    const results = [];
    for (const side of ['official', 'ours'] as const) {
      const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
      try {
        await boot(page, side);
        await page.mouse.click(axis === 'row' ? 20 : 150, axis === 'row' ? 230 : 190, { button: 'right' });
        const label = axis === 'row' ? 'Row Height...' : 'Column Width...';
        const menu = side === 'official' ? page.locator('.gc-ui-contextmenu-container') : page.locator('.gc-designer-context-menu');
        await menu.getByRole('menuitem', { name: label, exact: true }).click();
        const dialog = page.getByRole('dialog', { name: axis === 'row' ? 'Row Height' : 'Column Width' });
        await dialog.locator('input').fill('42');
        await dialog.getByRole('button', { name: 'OK', exact: true }).click();
        results.push(await page.evaluate((which) => {
          const sheet = (window as any).__designerCompare.spread.getActiveSheet();
          const index = which === 'row' ? sheet.getActiveRowIndex() : sheet.getActiveColumnIndex();
          const getSize = which === 'row' ? (i: number) => sheet.getRowHeight(i) : (i: number) => sheet.getColumnWidth(i);
          return { index, size: getSize(index), previous: getSize(index - 1), next: getSize(index + 1) };
        }, axis));
      } finally { await page.close(); }
    }
    expect(results[1]).toEqual(results[0]);
    expect(results[0].size).toBe(42);
  });
}

test('sheet tab Unhide availability follows hidden sheets', async ({ browser }) => {
  const results = [];
  for (const side of ['official', 'ours'] as const) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    try {
      await boot(page, side);
      const states = [];
      for (const hide of [false, true]) {
        if (hide) await page.evaluate(() => {
          const spread = (window as any).__designerCompare.spread;
          spread.addSheet(spread.getSheetCount());
          spread.getSheet(spread.getSheetCount() - 1).visible(false);
        });
        await page.waitForTimeout(200);
        await page.mouse.click(100, 685, { button: 'right' });
        const menu = side === 'official' ? page.locator('.gc-ui-contextmenu-container') : page.locator('.gc-designer-context-menu');
        states.push(await menu.getByRole('menuitem', { name: 'Unhide', exact: true }).getAttribute('aria-disabled'));
        await page.keyboard.press('Escape');
        await expect(menu).toHaveCount(0);
      }
      results.push(states.map((state) => state === 'true'));
    } finally { await page.close(); }
  }
  expect(results[1]).toEqual(results[0]);
  expect(results[0]).toEqual([true, false]);
});

test('sheet tab Unhide selects which hidden sheet to reveal', async ({ browser }) => {
  const results = [];
  for (const side of ['official', 'ours'] as const) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    try {
      await boot(page, side);
      await page.evaluate(() => {
        const spread = (window as any).__designerCompare.spread;
        for (const name of ['Hidden A', 'Hidden B']) {
          spread.addSheet(spread.getSheetCount());
          const sheet = spread.getSheet(spread.getSheetCount() - 1);
          sheet.name(name);
          sheet.visible(false);
        }
      });
      await page.mouse.click(100, 685, { button: 'right' });
      const menu = side === 'official' ? page.locator('.gc-ui-contextmenu-container') : page.locator('.gc-designer-context-menu');
      await menu.getByRole('menuitem', { name: 'Unhide', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'Unhide', exact: true });
      await expect(dialog.getByRole('option')).toHaveText(['Hidden A', 'Hidden B']);
      await dialog.getByRole('option', { name: 'Hidden B' }).click();
      await dialog.getByRole('button', { name: 'OK', exact: true }).click();
      results.push(await page.evaluate(() => {
        const spread = (window as any).__designerCompare.spread;
        return ['Hidden A', 'Hidden B'].map((name) => !!spread.getSheetFromName(name).visible());
      }));
    } finally { await page.close(); }
  }
  expect(results[1]).toEqual(results[0]);
  expect(results[0]).toEqual([false, true]);
});

test('sheet tab Unhide supports multiple selection and cancellation', async ({ browser }) => {
  const results = [];
  for (const side of ['official', 'ours'] as const) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    try {
      await boot(page, side);
      await page.evaluate(() => {
        const spread = (window as any).__designerCompare.spread;
        for (const name of ['Hidden A', 'Hidden B']) {
          spread.addSheet(spread.getSheetCount());
          const sheet = spread.getSheet(spread.getSheetCount() - 1);
          sheet.name(name);
          sheet.visible(false);
        }
      });
      const menu = side === 'official' ? page.locator('.gc-ui-contextmenu-container') : page.locator('.gc-designer-context-menu');
      const open = async (): Promise<void> => {
        await page.mouse.click(100, 685, { button: 'right' });
        await menu.getByRole('menuitem', { name: 'Unhide', exact: true }).click();
      };
      const visibility = async (): Promise<boolean[]> => page.evaluate(() => {
        const spread = (window as any).__designerCompare.spread;
        return ['Hidden A', 'Hidden B'].map((name) => !!spread.getSheetFromName(name).visible());
      });
      await open();
      let dialog = page.getByRole('dialog', { name: 'Unhide', exact: true });
      await dialog.getByRole('option', { name: 'Hidden B' }).click();
      await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
      await expect(dialog).toHaveCount(0);
      const cancelled = await visibility();
      await open();
      dialog = page.getByRole('dialog', { name: 'Unhide', exact: true });
      await dialog.getByRole('option', { name: 'Hidden B' }).click({ modifiers: ['Control'] });
      await dialog.getByRole('button', { name: 'OK', exact: true }).click();
      results.push({ cancelled, submitted: await visibility() });
    } finally { await page.close(); }
  }
  expect(results[1]).toEqual(results[0]);
  expect(results[0]).toEqual({ cancelled: [false, false], submitted: [true, true] });
});
