/* eslint-disable @typescript-eslint/no-explicit-any */
import { expect, test } from '@playwright/test';
import { PNG } from 'pngjs';
import { boot, comparePngs, expectMaskedBelow } from './helpers';

async function openColorSubmenu(page: import('@playwright/test').Page): Promise<void> {
  await page.mouse.click(125, 682, { button: 'right' });
  await page.getByRole('menuitem', { name: 'Tab Color', exact: true }).hover();
  await page.waitForTimeout(350);
}

test('Tab Color submenu pixels match the trial', async ({ browser }) => {
  // Official submenu box x315..543, y438..698 (+4px margin so the drop shadow is compared too).
  const clip = { x: 311, y: 434, width: 236, height: 270 };
  const shots: PNG[] = [];
  for (const side of ['official', 'ours'] as const) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await boot(page, side);
    await openColorSubmenu(page);
    shots.push(PNG.sync.read(await page.screenshot({ clip })));
    await page.close();
  }
  expectMaskedBelow(comparePngs(shots[0], shots[1]));
});

test('SheetTab Position submenu pixels match the trial', async ({ browser }) => {
  // Official submenu box x315..505, y524..630 (+4px margin for the drop shadow).
  const clip = { x: 311, y: 520, width: 198, height: 114 };
  const shots: PNG[] = [];
  for (const side of ['official', 'ours'] as const) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await boot(page, side);
    await page.mouse.click(125, 682, { button: 'right' });
    await page.getByRole('menuitem', { name: 'SheetTab Position', exact: true }).hover();
    await page.waitForTimeout(350);
    shots.push(PNG.sync.read(await page.screenshot({ clip })));
    await page.close();
  }
  expectMaskedBelow(comparePngs(shots[0], shots[1]));
});

test('standard tab color and No Color match the trial', async ({ browser }) => {
  const results = [];
  for (const side of ['official', 'ours'] as const) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await boot(page, side);
    const colors = [];
    for (const choice of ['color', 'none', 'theme']) {
      await page.mouse.click(125, 683, { button: 'right' });
      await page.getByRole('menuitem', { name: 'Tab Color', exact: true }).hover();
      if (choice === 'color') {
        await page.locator(side === 'official' ? '[color="#C00000"]' : '[role="radio"][aria-label="#C00000"]').last().click();
      } else if (choice === 'theme') await page.getByRole('radio', { name: 'Accent 1 80', exact: true }).click();
      else await page.getByRole('menuitem', { name: 'No Color', exact: true }).click();
      colors.push(await page.evaluate(() => (window as any).__designerCompare.spread.getActiveSheet().options.sheetTabColor));
    }
    results.push(colors);
    await page.close();
  }
  expect(results[1]).toEqual(results[0]);
});

test('More Colors accepts RGB values and Cancel leaves the tab color unchanged', async ({ browser }) => {
  const results = [];
  for (const side of ['official', 'ours'] as const) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await boot(page, side);
    for (const cancel of [false, true]) {
      await page.mouse.click(125, 683, { button: 'right' });
      await page.getByRole('menuitem', { name: 'Tab Color', exact: true }).hover();
      await page.getByRole('menuitem', { name: 'More Colors...', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'Color', exact: true });
      for (const [name, value] of [['Red:', '18'], ['Green:', '52'], ['Blue:', cancel ? '100' : '86']]) {
        await dialog.getByRole('spinbutton', { name }).or(dialog.getByRole('textbox', { name })).fill(value);
      }
      await dialog.getByRole('button', { name: cancel ? 'Cancel' : 'OK', exact: true }).click();
      await expect(dialog).toBeHidden();
      await page.waitForTimeout(500);
    }
    results.push(await page.evaluate(() => (window as any).__designerCompare.spread.getActiveSheet().options.sheetTabColor));
    await page.close();
  }
  expect(results).toEqual(['#123456', '#123456']);
});

test('untouched More Colors fields and OK match the trial', async ({ browser }) => {
  const results = [];
  for (const side of ['official', 'ours'] as const) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await boot(page, side);
    await page.evaluate(() => { (window as any).__designerCompare.spread.getActiveSheet().options.sheetTabColor = '#123456'; });
    await page.mouse.click(125, 683, { button: 'right' });
    await page.getByRole('menuitem', { name: 'Tab Color', exact: true }).hover();
    await page.getByRole('menuitem', { name: 'More Colors...', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Color', exact: true });
    const values = await Promise.all(['Red:', 'Green:', 'Blue:'].map((name) => dialog.getByRole('spinbutton', { name }).or(dialog.getByRole('textbox', { name })).inputValue()));
    await dialog.getByRole('button', { name: 'OK', exact: true }).click();
    results.push({ values, color: await page.evaluate(() => (window as any).__designerCompare.spread.getActiveSheet().options.sheetTabColor) });
    await page.close();
  }
  expect(results[1]).toEqual(results[0]);
  expect(results[0]).toEqual({ values: ['', '', ''], color: '' });
});

test('More Colors spectrum and lightness select the same red as the trial', async ({ browser }) => {
  const results = [];
  for (const side of ['official', 'ours'] as const) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await boot(page, side);
    await page.mouse.click(125, 683, { button: 'right' });
    await page.getByRole('menuitem', { name: 'Tab Color', exact: true }).hover();
    await page.getByRole('menuitem', { name: 'More Colors...', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Color', exact: true });
    await page.waitForTimeout(700);
    const lightness = dialog.locator(side === 'official' ? '.gc-canvas-l' : '.gc-tab-color-lightness');
    const spectrum = dialog.locator(side === 'official' ? '.gc-canvas-hs' : '.gc-tab-color-spectrum');
    await lightness.click({ position: { x: 5, y: 80 } });
    await spectrum.click({ position: { x: 0, y: 0 } });
    const values = await Promise.all(['Red:', 'Green:', 'Blue:'].map((name) => dialog.getByRole('spinbutton', { name }).or(dialog.getByRole('textbox', { name })).inputValue()));
    await dialog.getByRole('button', { name: 'OK', exact: true }).click();
    results.push({ values, color: await page.evaluate(() => (window as any).__designerCompare.spread.getActiveSheet().options.sheetTabColor) });
    await page.close();
  }
  expect(results[1]).toEqual(results[0]);
  expect(results[0]).toEqual({ values: ['255', '0', '0'], color: '#ff0000' });
});

test('More Colors updates while dragging its spectrum and lightness controls', async ({ browser }) => {
  const results = [];
  for (const side of ['official', 'ours'] as const) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await boot(page, side);
    await page.mouse.click(125, 683, { button: 'right' });
    await page.getByRole('menuitem', { name: 'Tab Color', exact: true }).hover();
    await page.getByRole('menuitem', { name: 'More Colors...', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Color', exact: true });
    await page.waitForTimeout(700);
    const lightness = await dialog.locator(side === 'official' ? '.gc-canvas-l' : '.gc-tab-color-lightness').boundingBox();
    const spectrum = await dialog.locator(side === 'official' ? '.gc-canvas-hs' : '.gc-tab-color-spectrum').boundingBox();
    await page.mouse.move(lightness!.x + 5, lightness!.y + 5);
    await page.mouse.down();
    await page.mouse.move(lightness!.x + 5, lightness!.y + lightness!.height / 2, { steps: 5 });
    await page.mouse.up();
    await page.mouse.move(spectrum!.x + spectrum!.width / 2, spectrum!.y + 5);
    await page.mouse.down();
    await page.mouse.move(spectrum!.x, spectrum!.y, { steps: 5 });
    const values = await Promise.all(['Red:', 'Green:', 'Blue:'].map((name) => dialog.getByRole('spinbutton', { name }).or(dialog.getByRole('textbox', { name })).inputValue()));
    await page.mouse.up();
    results.push(values);
    await page.close();
  }
  expect(results[1]).toEqual(results[0]);
  expect(results[0]).toEqual(['255', '0', '0']);
});
