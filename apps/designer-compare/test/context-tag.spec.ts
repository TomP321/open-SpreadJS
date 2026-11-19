/* eslint-disable @typescript-eslint/no-explicit-any */
import { expect, test } from '@playwright/test';
import { boot } from './helpers';

for (const side of ['official', 'ours'] as const) {
  test(`${side}: sheet tag dialog saves, cancels, and clears`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await boot(page, side);
    const open = async () => {
      await page.mouse.click(125, 683, { button: 'right' });
      await page.getByRole('menuitem', { name: 'Tag...', exact: true }).click();
    };
    const value = () => page.evaluate(() => (window as any).__designerCompare.spread.getActiveSheet().tag());
    await open();
    await page.getByLabel('Tag:', { exact: true }).fill('sheet metadata');
    await page.getByRole('button', { name: 'OK', exact: true }).click();
    await expect(page.getByLabel('Tag:', { exact: true })).toHaveCount(0);
    expect(await value()).toBe('sheet metadata');
    await open();
    await expect(page.getByLabel('Tag:', { exact: true })).toHaveValue('sheet metadata');
    await page.getByLabel('Tag:', { exact: true }).fill('cancelled');
    await page.getByRole('button', { name: 'Cancel', exact: true }).last().click();
    await expect(page.getByLabel('Tag:', { exact: true })).toHaveCount(0);
    expect(await value()).toBe('sheet metadata');
    await open();
    await page.getByRole('button', { name: 'Clear', exact: true }).click();
    expect(await value()).toBeNull();
  });
}
