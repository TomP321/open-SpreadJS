/* eslint-disable @typescript-eslint/no-explicit-any */
import { expect, test } from '@playwright/test';
import { boot } from './helpers';

test('Remove Duplicates matches trial selection compaction and preserves neighboring cells', async ({ browser }) => {
  const results = [];
  for (const side of ['official', 'ours'] as const) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    try {
      await boot(page, side);
      await page.evaluate(() => {
        const { designer, spread, GC } = (window as any).__designerCompare;
        const sheet = spread.getActiveSheet();
        sheet.setArray(0, 0, [['Name', 'Count'], ['A', 1], ['A', 1], ['B', 2], ['Outside', 3]]);
        sheet.setValue(2, 3, 'Keep'); sheet.setSelection(0, 0, 4, 2);
        GC.Spread.Sheets.Designer.getCommand('removeDuplicates').execute(designer);
      });
      await page.getByRole('button', { name: 'OK', exact: true }).first().click();
      await page.waitForTimeout(200);
      results.push(await page.evaluate(() => {
        const sheet = (window as any).__designerCompare.spread.getActiveSheet();
        return { rows: sheet.getRowCount(), data: sheet.getArray(0, 0, 5, 2), neighbor: sheet.getValue(2, 3) };
      }));
    } finally { await page.close(); }
  }
  expect(results[1]).toEqual(results[0]);
  expect(results[1]).toEqual({ rows: 200, data: [['Name', 'Count'], ['A', 1], ['B', 2], [null, null], ['Outside', 3]], neighbor: 'Keep' });
});

test('chart launchers match the trial with optional add-ons absent', async ({ browser }) => {
  const results = [];
  for (const side of ['official', 'ours'] as const) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    try {
      await page.goto(`/?side=${side}&embed=1&plugins=none`, { waitUntil: 'networkidle' });
      await page.waitForFunction(() => (window as any).__designerCompare?.ready === true);
      await page.evaluate(() => (window as any).__designerCompare.designer.activeRibbonTab('insert'));
      await page.waitForTimeout(200);
      results.push(await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('[data-command^="ribbon."]')]
        .filter((e) => e.dataset.command === 'ribbon.insertChart' || /ChartPreview$/.test(e.dataset.command ?? ''))
        .map((e) => ({ command: e.dataset.command, disabled: e.getAttribute('aria-disabled') === 'true' || e.classList.contains('gc-designer-ribbon-list-disabled') }))));
    } finally { await page.close(); }
  }
  expect(results[0]).toHaveLength(8);
  expect(results[0].every((entry) => entry.disabled)).toBe(true);
  expect(results[1]).toEqual(results[0]);
});
