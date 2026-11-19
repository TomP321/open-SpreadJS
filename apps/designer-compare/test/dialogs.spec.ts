/* eslint-disable @typescript-eslint/no-explicit-any */
import { test, expect } from '@playwright/test';
import { boot } from './helpers';

test.describe('dialogs and theme', () => {
  test('Format Cells opens with the required tabs and applies a number format', async ({ page }) => {
    await boot(page, 'ours');
    await page.evaluate(() => (window as any).__designerCompare.GC.Spread.Sheets.Designer.getCommand('formatCells').execute((window as any).__designerCompare.designer));
    await page.waitForTimeout(200);
    const dialog = page.locator('.gc-designer-dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('tab')).toHaveText(['Number', 'Alignment', 'Font', 'Border', 'Fill', 'Cell Button', 'Padding', 'Decoration', 'Protection', 'Mask']);
    await dialog.getByText('Number', { exact: true }).first().click();
    await dialog.getByText('Percentage', { exact: true }).click();
    await dialog.getByRole('button', { name: 'OK' }).click();
    await page.waitForTimeout(150);
    // Task 43 re-ground: the trial's Percentage category writes '0.00%' with its default two
    // decimals (probed .probe/t43/official-formatters.json; pinned by format-cells-tabs.spec.ts).
    expect(await page.evaluate(() => (window as any).__designerCompare.spread.getActiveSheet().getActualStyle(1, 1).formatter)).toBe('0.00%');
  });

  test('Find and Replace finds a cell and replaces text', async ({ page }) => {
    await boot(page, 'ours');
    await page.evaluate(() => (window as any).__designerCompare.designer.openFind('find'));
    await page.waitForTimeout(150);
    const dialog = page.locator('.gc-designer-dialog');
    await dialog.locator('.gc-find-input').first().fill('North');
    await dialog.getByRole('button', { name: 'Find Next' }).click();
    expect(await page.evaluate(() => {
      const sheet = (window as any).__designerCompare.spread.getActiveSheet();
      return [sheet.getActiveRowIndex(), sheet.getActiveColumnIndex()];
    })).toEqual([1, 0]);
    await dialog.getByRole('tab', { name: 'Replace' }).click();
    const inputs = dialog.locator('.gc-find-input');
    await inputs.nth(0).fill('North');
    await inputs.nth(1).fill('Northern');
    await dialog.getByRole('button', { name: 'Replace All' }).click();
    await page.waitForTimeout(150);
    expect(await page.evaluate(() => (window as any).__designerCompare.spread.getActiveSheet().getValue(1, 0))).toBe('Northern');
  });

  test('toolbar mode and theme tokens are applied', async ({ page }) => {
    await boot(page, 'ours');
    await page.evaluate(() => {
      const d = (window as any).__designerCompare;
      d.designer.setConfig(d.GC.Spread.Sheets.Designer.ToolBarModeConfig);
      d.designer.setTheme({ colorBrandBackground: '#123456' });
    });
    await page.waitForTimeout(200);
    const ribbon = await page.locator('.gc-designer-ribbon').boundingBox();
    expect(ribbon?.height).toBe(94);
    expect(await page.locator('.gc-designer-ribbon-toolbar-group').count()).toBe(5);
    expect(await page.evaluate(() => (window as any).__designerCompare.designer.getTheme().colorBrandBackground)).toBe('#123456');
    expect(await page.evaluate(() => getComputedStyle(document.querySelector('.gc-designer-container')!).getPropertyValue('--sjs-color-brand-background').trim())).toBe('#123456');
    await page.evaluate(() => (window as any).__designerCompare.designer.setTheme(null));
    expect(await page.evaluate(() => (window as any).__designerCompare.designer.getTheme().colorBrandBackground)).toBe('#217346');
  });
});


test.describe('Format Cells required tabs', () => {
  test('all six required tabs render their editor fields', async ({ page }) => {
    await boot(page, 'ours');
    await page.evaluate(() => (window as any).__designerCompare.GC.Spread.Sheets.Designer.getCommand('formatCells').execute((window as any).__designerCompare.designer));
    await page.waitForTimeout(150);
    const dialog = page.locator('.gc-designer-dialog');
    const expected: Record<string, string[]> = {
      Number: ['Category:', 'Sample', 'General', 'Percentage'],
      Alignment: ['Horizontal:', 'Vertical:', 'Indent:', 'Wrap text', 'Merge cells'],
      Font: ['Font:', 'Font style:', 'Size:', 'Underline:', 'Color:', 'Strikethrough'],
      // Task 43: the trial's Border tab has no "Style:" combo — it uses the line-style grid
      // under the "Line" group; labels follow the trial DOM.
      Border: ['Line', 'Color:', 'Presets', 'None', 'Outline', 'Inside'],
      Fill: ['Background Color:', 'Pattern Color:', 'Pattern Style:'],
      Protection: ['Protection', 'Locked', 'Hidden'],
    };
    for (const [tab, labels] of Object.entries(expected)) {
      await dialog.getByRole('tab', { name: tab }).click();
      for (const label of labels) await expect(dialog.getByText(label, { exact: false }).first(), `${tab}: ${label}`).toBeVisible();
    }
  });

  test('Alignment and Font changes are applied together', async ({ page }) => {
    await boot(page, 'ours');
    await page.evaluate(() => (window as any).__designerCompare.GC.Spread.Sheets.Designer.getCommand('formatCells').execute((window as any).__designerCompare.designer));
    await page.waitForTimeout(150);
    const dialog = page.locator('.gc-designer-dialog');
    await dialog.getByRole('tab', { name: 'Alignment' }).click();
    await dialog.getByText('Wrap text').click();
    await dialog.getByRole('tab', { name: 'Font' }).click();
    await dialog.locator('.gc-font-family-input').fill('Georgia');
    await dialog.getByRole('button', { name: 'OK' }).click();
    await page.waitForTimeout(150);
    const style = await page.evaluate(() => (window as any).__designerCompare.spread.getActiveSheet().getActualStyle(1, 1));
    expect(style.wordWrap).toBe(true);
    expect(style.fontFamily).toBe('Georgia');
  });
});
