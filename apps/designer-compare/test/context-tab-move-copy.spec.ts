/* eslint-disable @typescript-eslint/no-explicit-any */
import { expect, test } from '@playwright/test';
import { boot } from './helpers';

for (const copy of [false, true]) {
  test(`sheet tab ${copy ? 'copy' : 'move'} to end matches the trial`, async ({ browser }) => {
    const results = [];
    for (const side of ['official', 'ours'] as const) {
      const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
      await boot(page, side);
      await page.evaluate(() => { const w = (window as any).__designerCompare.spread; w.addSheet(1); w.getSheet(1).name("Second"); w.addSheet(2); w.getSheet(2).name("Third"); });
      await page.mouse.click(125, 683, { button: 'right' });
      await page.getByRole('menuitem', { name: 'Move or Copy...' }).click();
      const dialog = page.getByRole('dialog', { name: 'Move or Copy' });
      await dialog.getByRole('option', { name: '(move to end)' }).click();
      if (copy) await dialog.getByRole('checkbox', { name: 'Create a copy' }).click();
      await dialog.getByRole('button', { name: 'OK', exact: true }).click();
      results.push(await page.evaluate(() => { const w = (window as any).__designerCompare.spread; return { names: Array.from({ length: w.getSheetCount() }, (_, i) => w.getSheet(i).name()), active: w.getActiveSheet().name() }; }));
      await page.close();
    }
    expect(results[1]).toEqual(results[0]);
  });
}

for (const copy of [false, true]) {
  test(`sheet tab ${copy ? 'copy' : 'move'} before another sheet matches the trial`, async ({ browser }) => {
    const results = [];
    for (const side of ['official', 'ours'] as const) {
      const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
      await boot(page, side);
      await page.evaluate(() => { const w = (window as any).__designerCompare.spread; w.addSheet(1); w.getSheet(1).name('Second'); w.addSheet(2); w.getSheet(2).name('Third'); });
      await page.mouse.click(125, 683, { button: 'right' });
      await page.getByRole('menuitem', { name: 'Move or Copy...' }).click();
      const dialog = page.getByRole('dialog', { name: 'Move or Copy' });
      await dialog.getByRole('option', { name: 'Third', exact: true }).click();
      if (copy) await dialog.getByRole('checkbox', { name: 'Create a copy' }).click();
      await dialog.getByRole('button', { name: 'OK', exact: true }).click();
      results.push(await page.evaluate(() => { const w = (window as any).__designerCompare.spread; return { names: Array.from({ length: w.getSheetCount() }, (_, i) => w.getSheet(i).name()), active: w.getActiveSheet().name() }; }));
      await page.close();
    }
    expect(results[1]).toEqual(results[0]);
  });
}

test('Move or Copy dialog has the trial layout', async ({ browser }) => {
  const layouts = [];
  for (const side of ['official', 'ours'] as const) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await boot(page, side);
    await page.mouse.click(125, 683, { button: 'right' });
    await page.getByRole('menuitem', { name: 'Move or Copy...' }).click();
    const dialog = page.getByRole('dialog', { name: 'Move or Copy' });
    await page.waitForTimeout(700);
    layouts.push(await Promise.all([dialog.boundingBox(), dialog.getByRole('listbox').boundingBox(), dialog.getByRole('checkbox').boundingBox(), dialog.getByRole('button', { name: 'OK', exact: true }).boundingBox()]));
    await page.close();
  }
  for (let i = 0; i < layouts[0].length; i++) {
    for (const key of ['x', 'y', 'width', 'height'] as const) {
      expect.soft(Math.abs(layouts[1][i]![key] - layouts[0][i]![key]), `${i} ${key}`).toBeLessThanOrEqual(3);
    }
  }
});
