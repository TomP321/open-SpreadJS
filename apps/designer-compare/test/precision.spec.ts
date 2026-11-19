/* eslint-disable @typescript-eslint/no-explicit-any */
import { writeFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { boot, captureWithMask, comparePngs, comboText, expectBoxClose, expectMaskedBelow, pickCombo } from './helpers';

for (const feature of ['conditional-formatting', 'Format Cells'] as const) {
  test(`${feature} DOM and 0.5% pixel gate`, async ({ browser }, testInfo) => {
    const official = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const ours = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const selector = feature === 'Format Cells' ? '.gc-designer-dialog' : '.gc-designer-ribbon-dropdown[role="menu"]';
    try {
      await boot(official, 'official'); await boot(ours, 'ours');
      for (const page of [official, ours]) {
        if (feature === 'Format Cells') {
          await page.locator('[data-command="ribbon.ribbonNumberFormat"] .gc-designer-ribbon-list-btn').click();
          await page.getByText('More Number Formats...', { exact: true }).click();
        } else {
          // The trial marks this split control aria-disabled even though its
          // group dropdown opens from a pointer click on the caption.
          const group = (await page.locator('[data-command="ribbon.ribbonGroupId.ribbon-thumbnail-styles"]').boundingBox())!;
          await page.mouse.click(group.x + group.width / 2, group.y + 43);
          await page.locator('[data-command="ribbon.conditionFormat"] .dropdown-btn').click();
        }
        await expect(page.locator(selector)).toBeVisible();
        await page.waitForTimeout(250);
      }
      const aBox = (await official.locator(selector).boundingBox())!;
      const bBox = (await ours.locator(selector).boundingBox())!;
      const clip = { x: Math.floor(aBox.x), y: Math.floor(aBox.y), width: Math.ceil(aBox.width), height: Math.ceil(aBox.height) };
      // Scope icon exclusions to the captured surface. Ribbon icons behind a
      // modal must not mask pixels in its header or tab strip.
      const masks = `${selector} .gc-designer-ribbon-icon, ${selector} .gc-designer-ribbon-list-item-arrow`;
      const [a, b] = await Promise.all([captureWithMask(official, clip, masks.split(', ')), captureWithMask(ours, clip, masks.split(', '))]);
      const pixels = comparePngs(a.png, b.png, a.mask, b.mask);
      const report = testInfo.outputPath('pixels.json');
      await writeFile(report, JSON.stringify({ feature, aBox, bBox, pixels, percentage: pixels.masked / pixels.denom * 100 }, null, 2));
      await testInfo.attach('pixels.json', { path: report, contentType: 'application/json' });
      for (const [side, page] of [['official', official], ['ours', ours]] as const) {
        const path = testInfo.outputPath(`${side}.png`); await page.screenshot({ clip, path });
        await testInfo.attach(`${side}.png`, { path, contentType: 'image/png' });
      }
      console.log(`${feature}: ${(pixels.masked / pixels.denom * 100).toFixed(3)}%`);
      expectBoxClose(bBox, aBox, 1, feature);
      expectMaskedBelow(pixels, 0.5);
    } finally { await official.close(); await ours.close(); }
  });
}

test('Format Cells OK preserves untouched styles and creates no empty buttons or masks', async ({ page }) => {
  await boot(page, 'ours');
  const before = await page.evaluate(() => {
    const { designer, spread } = (window as any).__designerCompare;
    const sheet = spread.getActiveSheet();
    sheet.getCell(1, 1).fontWeight('bold').formatter('0.00');
    const before = sheet.toJSON(); designer.showFormatCells(); return before;
  });
  await page.getByRole('dialog').getByRole('button', { name: 'OK', exact: true }).click();
  expect(await page.evaluate(() => (window as any).__designerCompare.spread.getActiveSheet().toJSON())).toEqual(before);
});

test('dialog launchers select Font, Alignment and Number and Cancel dismisses cleanly', async ({ page }) => {
  await boot(page, 'ours');
  for (const [indicator, tab] of [['indicatorFonts', 'Font'], ['indicatorAlignment', 'Alignment'], ['indicatorNumbers', 'Number']]) {
    await page.getByRole('button', { name: indicator, exact: true }).click();
    await expect(page.getByRole('dialog').getByRole('tab', { name: tab, exact: true })).toHaveAttribute('aria-selected', 'true');
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  }
});

test('undo and redo keep their originating sheet after changing active sheet and selection', async ({ page }) => {
  await boot(page, 'ours');
  const state = await page.evaluate(() => {
    const { designer, spread } = (window as any).__designerCompare;
    const first = spread.getActiveSheet();
    first.setSelection(1, 1, 1, 1); designer.executeCommand('fontWeight');
    spread.setSheetCount(2); spread.setActiveSheetIndex(1);
    const undid = spread.undoManager().undo();
    const weightAfterUndo = first.getActualStyle(1, 1).fontWeight ?? null;
    const second = spread.getActiveSheet();
    const secondJSON = second.toJSON();
    const redid = spread.undoManager().redo();
    return { undid, redid, weightAfterUndo, weight: first.getActualStyle(1, 1).fontWeight, second: second.toJSON(), secondJSON };
  });
  expect(state.undid).toBe(true); expect(state.redid).toBe(true); expect(state.weightAfterUndo).toBeNull();
  expect(state.weight).toBe('bold'); expect(state.second).toEqual(state.secondJSON);
});

test('Name Manager lists defined names and New opens with fresh dialog state', async ({ page }) => {
  await boot(page, 'ours');
  await page.evaluate(() => {
    const { designer, spread } = (window as any).__designerCompare;
    spread.addCustomName('Revenue', 'Data!$F$2', 0, 0, 'Quarter total'); designer.showNameManager();
  });
  await expect(page.locator('.gc-name-list')).toContainText('Revenue');
  await page.getByRole('button', { name: 'New...', exact: true }).click();
  await expect(page.locator('.gc-name-editor')).toHaveValue('');
  await page.locator('.gc-name-editor').fill('Costs');
  await page.locator('.gc-name-refers').fill('Data!$B$2');
  await page.getByRole('button', { name: 'OK', exact: true }).click();
  expect(await page.evaluate(() => (window as any).__designerCompare.spread.getCustomNames().map((n: any) => n.getName()))).toEqual(['Revenue', 'Costs']);
});

test('Name Manager edits worksheet names, filters scopes and returns after Cancel', async ({ page }) => {
  await boot(page, 'ours');
  await page.evaluate(() => {
    const { designer, spread } = (window as any).__designerCompare;
    spread.addCustomName('Total', '1', 0, 0, 'Workbook');
    spread.getActiveSheet().addCustomName('Local', 'B2', 0, 0, 'Sheet');
    designer.showNameManager();
  });
  await page.locator('.gc-name-list tr[role="option"]').filter({ hasText: 'Local' }).click();
  await page.getByRole('button', { name: 'Edit...', exact: true }).click();
  await expect(page.locator('.gc-name-editor')).toHaveValue('Local');
  await page.locator('.gc-name-editor').fill('LocalTotal');
  await page.locator('.gc-name-refers').fill('=SUM(B2:E2)');
  await page.getByRole('button', { name: 'OK', exact: true }).click();
  expect(await page.evaluate(() => (window as any).__designerCompare.spread.getActiveSheet().getCustomName('LocalTotal').getExpression())).toBe('SUM(B2:E2)');
  await page.getByRole('combobox', { name: 'Filter with:' }).click();
  await page.locator('.gc-name-filter-list [role="option"]').filter({ hasText: 'Scoped to Worksheet' }).click();
  await expect(page.locator('.gc-name-list tr[role="option"]')).toHaveCount(1);
  await page.getByRole('button', { name: 'New...', exact: true }).click();
  const nameDialog = page.getByRole('dialog', { name: 'New Name', exact: true });
  await expect(nameDialog).toBeVisible();
  await nameDialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Name Manager', exact: true })).toBeVisible();
});

test('Data Validation switches tabs, applies messages and restores criteria on reopen', async ({ page }) => {
  await boot(page, 'ours');
  await page.evaluate(() => (window as any).__designerCompare.designer.showDataValidation());
  const dialog = page.getByRole('dialog', { name: 'Data Validation', exact: true });
  await expect(dialog.getByRole('tab')).toHaveText(['Settings', 'Input Message', 'Error Alert', 'Highlight Style']);
  await pickCombo(dialog, dialog.getByLabel('Allow:', { exact: true }), 'Whole number');
  await dialog.getByLabel('Minimum:', { exact: true }).fill('2');
  await dialog.getByLabel('Maximum:', { exact: true }).fill('5');
  await dialog.getByRole('tab', { name: 'Input Message', exact: true }).click();
  await dialog.locator('.gc-dv-input-title').fill('Amount');
  await dialog.locator('.gc-dv-input-message').fill('Enter 2 to 5');
  await dialog.getByRole('tab', { name: 'Error Alert', exact: true }).click();
  await pickCombo(dialog, dialog.locator('.gc-dv-error-style'), 'Warning');
  await dialog.locator('.gc-dv-error-title').fill('Check amount');
  await dialog.getByRole('button', { name: 'OK', exact: true }).click();
  const validator = await page.evaluate(() => {
    const v = (window as any).__designerCompare.spread.getActiveSheet().getDataValidator(1, 1);
    return { title: v.inputTitle(), message: v.inputMessage(), error: v.errorTitle(), style: v.errorStyle() };
  });
  expect(validator).toEqual({ title: 'Amount', message: 'Enter 2 to 5', error: 'Check amount', style: 1 });
  await page.evaluate(() => (window as any).__designerCompare.designer.showDataValidation());
  await expect(comboText(dialog.getByLabel('Allow:', { exact: true }))).toHaveText('Whole number');
  await expect(dialog.getByLabel('Minimum:', { exact: true })).toHaveValue('2');
  await dialog.getByRole('button', { name: 'Clear All', exact: true }).click();
  await expect(comboText(dialog.getByLabel('Allow:', { exact: true }))).toHaveText('Any value');
  await dialog.getByRole('button', { name: 'OK', exact: true }).click();
  expect(await page.evaluate(() => (window as any).__designerCompare.spread.getActiveSheet().getDataValidator(1, 1))).toBeNull();
  await page.evaluate(() => (window as any).__designerCompare.designer.showDataValidation());
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('Page Layout scale accepts percentages and spinner changes without storing invalid values', async ({ page }) => {
  await boot(page, 'ours');
  await page.getByRole('tab', { name: 'Page Layout', exact: true }).click();
  const scale = page.locator('[data-command="ribbon.fitPageScale"] input');
  await expect(scale).toHaveValue('100%');
  await scale.fill('125%'); await scale.press('Enter');
  await page.getByRole('button', { name: 'Increase Scale', exact: true }).click();
  await expect(scale).toHaveValue('126%');
  await scale.fill('invalid'); await scale.press('Enter');
  await expect(scale).toHaveValue('126%');
});

test('narrow tab arrows expose Settings and can scroll back to Home', async ({ page }) => {
  await page.setViewportSize({ width: 640, height: 720 });
  await boot(page, 'ours');
  await page.getByRole('button', { name: 'Scroll tabs right', exact: true }).click();
  const settings = page.getByRole('tab', { name: 'Settings', exact: true });
  await settings.click();
  await expect(settings).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('button', { name: 'Scroll tabs left', exact: true }).click();
  await page.getByRole('tab', { name: 'Home', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Home', exact: true })).toHaveAttribute('aria-selected', 'true');
});
