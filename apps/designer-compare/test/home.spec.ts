/* eslint-disable @typescript-eslint/no-explicit-any */
import { test, expect } from '@playwright/test';
import { boot } from './helpers';

test.describe('Home tab commands', () => {
  test('bold toggles state and integrates with the workbook undo manager', async ({ page }) => {
    await boot(page, 'ours');
    const state = async () => page.evaluate(() => {
      const d = (window as any).__designerCompare;
      const style = d.spread.getActiveSheet().getActualStyle(1, 1);
      return { weight: style.fontWeight ?? null, undo: d.spread.undoManager().canUndo(), checked: d.designer.getCommandState('fontWeight').checked };
    });
    expect((await state()).weight).toBeNull();
    await page.locator('[data-command="ribbon.fontWeight"]').click();
    await page.waitForTimeout(120);
    expect(await state()).toMatchObject({ weight: 'bold', undo: true, checked: true });
    await page.locator('[data-command="ribbon.undo"]').click();
    await page.waitForTimeout(120);
    expect(await state()).toMatchObject({ weight: null, undo: false, checked: false });
  });

  test('font family, size, alignment and colour commands update the workbook', async ({ page }) => {
    await boot(page, 'ours');
    const style = () => page.evaluate(() => (window as any).__designerCompare.spread.getActiveSheet().getActualStyle(1, 1));
    await page.locator('[data-command="ribbon.fontFamily"] .gc-designer-ribbon-list-btn').click();
    await page.getByRole('option', { name: 'Georgia' }).click();
    expect((await style()).fontFamily).toBe('Georgia');
    await page.locator('[data-command="ribbon.fontSize"] input').fill('16');
    await page.locator('[data-command="ribbon.fontSize"] input').press('Enter');
    expect(String((await style()).fontSize)).toContain('16');
    await page.locator('[data-command="ribbon.centerAlign"]').click();
    expect((await style()).hAlign).toBe(1);
    await page.locator('[data-command="ribbon.middleAlign"]').click();
    expect((await style()).vAlign).toBe(1);
    await page.locator('[data-command="ribbon.foreColor"] .gc-designer-color-picker-button').click();
    await page.locator('.gc-designer-color-cell').first().click();
    expect((await style()).foreColor?.toLowerCase()).toBe('#ffffff');
  });

  test('number formats, merge, insert and table commands work on the selection', async ({ page }) => {
    await boot(page, 'ours');
    await page.locator('[data-command="ribbon.ribbonNumberFormat"] .gc-designer-ribbon-list-btn').click();
    await page.getByRole('menuitem', { name: 'Percentage' }).click();
    await page.waitForTimeout(100);
    expect(await page.evaluate(() => (window as any).__designerCompare.spread.getActiveSheet().getActualStyle(1, 1).formatter)).toBe('0%');
    await page.locator('[data-command="ribbon.mergeCenter"] .dropdown-btn').click();
    await page.getByRole('menuitem', { name: 'Merge Cells', exact: true }).click();
    expect(await page.evaluate(() => !!(window as any).__designerCompare.spread.getActiveSheet().getSpan(1, 1))).toBe(true);
    await page.locator('[data-command="ribbon.cellsInsert"] .dropdown-btn').click();
    await page.getByRole('menuitem', { name: 'Insert Sheet Rows' }).click();
    expect(await page.evaluate(() => (window as any).__designerCompare.spread.getActiveSheet().getValue(2, 0))).toBe('North');
    // Undo insertion, then apply a table through the gallery.
    await page.evaluate(() => (window as any).__designerCompare.spread.undoManager().undo());
    await page.evaluate(() => (window as any).__designerCompare.spread.getActiveSheet().setSelection(0, 0, 3, 2));
    await page.locator('[data-command="ribbon.formatTable2"] .dropdown-btn').click();
    await page.locator('.gc-designer-table-tile').first().click();
    expect(await page.evaluate(() => (window as any).__designerCompare.spread.getActiveSheet().tables.all().length)).toBe(1);
  });

  test('conditional formatting menu applies real rules', async ({ page }) => {
    await boot(page, 'ours');
    await page.locator('[data-command="ribbon.conditionFormat"] .dropdown-btn').click();
    await page.getByRole('menuitem', { name: 'Highlight Cells Rules' }).hover();
    await page.getByRole('menuitem', { name: 'Greater Than...' }).click();
    await page.waitForTimeout(100);
    expect(await page.evaluate(() => (window as any).__designerCompare.spread.getActiveSheet().conditionalFormats.getRules().length)).toBeGreaterThan(0);
  });
});
