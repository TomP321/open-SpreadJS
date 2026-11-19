/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * TASK 65 (paired): the last "not implemented in this milestone" designer stubs
 * must now behave like the trial:
 *  - Format Table > New Table Style... opens `New Table Style` (Name row, the
 *    13-element list, Format/Clear, preview); OK registers the theme in
 *    `workbook.customTableThemes` and both sides list it identically.
 *  - Cell Styles > Manage Cell States opens `Manage Cell States`; its Add
 *    button opens `Create Cell States`; Cancel leaves no states.
 *  - Insert > Charts combos insert a two-plot-group chart: the first two
 *    series in the preset's first type, the rest in the second type with the
 *    preset's axis group (per-series `chartType`/`axisGroup`).
 *  - The Conditional Format footers (More Rules... / New Rule... / Manage
 *    Rules...) open real dialogs instead of the milestone message box.
 */
import { expect, test, type Locator, type Page } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { boot } from './helpers';

const dialog = (page: Page): Locator => page.locator('.gc-designer-dialog').filter({ visible: true }).last();

async function clickInDialog(page: Page, text: string, exact = true): Promise<void> {
  await dialog(page).getByText(text, { exact }).filter({ visible: true }).last().click({ timeout: 4000 });
  await page.waitForTimeout(250);
}

async function dialogTitles(page: Page): Promise<string[]> {
  return page.evaluate(() => [...document.querySelectorAll('.gc-designer-dialog')]
    .map((element) => String(element.querySelector('.gc-designer-dialog-title, .gc-dialog-title')?.textContent ?? (element as HTMLElement).getAttribute('aria-label') ?? '').trim())
    .filter(Boolean));
}

async function runCommand(page: Page, command: string): Promise<void> {
  await page.evaluate((name) => {
    (window as any).GC.Spread.Sheets.Designer.getCommand(name).execute((window as any).__designerCompare.designer);
    return true;
  }, command);
  await page.waitForTimeout(600);
}

async function closeTopDialog(page: Page): Promise<void> {
  try { await clickInDialog(page, 'Cancel'); } catch { /* already closed */ }
  await page.waitForTimeout(200);
}

test('TASK 65 dialogs match the trial', async ({ browser }) => {
  test.setTimeout(420_000);
  const results: Record<string, unknown>[] = [];
  for (const side of ['official', 'ours'] as const) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    page.setDefaultTimeout(6000);
    const snapshot: Record<string, unknown> = {};
    try {
      await boot(page, side);

      // -- New Table Style --------------------------------------------------
      await runCommand(page, 'newTableStyle');
      snapshot.newTableStyleTitle = (await dialogTitles(page)).join('|');
      const tableStyleText = (await dialog(page).innerText()).replace(/\s+/g, ' ');
      snapshot.tableStyleTokens = ['Name:', 'Table Element:', 'Whole Table', 'Total Row', 'Last Footer Cell', 'Format', 'Clear', 'Preview']
        .filter((token) => tableStyleText.includes(token));
      snapshot.tableStyleListCount = await dialog(page).evaluate((element) =>
        [...element.querySelectorAll('div,li')].filter((e) => (e.textContent ?? '').trim() === 'Whole Table').length);
      await closeTopDialog(page);

      // -- Manage Cell States ----------------------------------------------
      await runCommand(page, 'manageCellState');
      snapshot.cellStatesTitle = (await dialogTitles(page)).join('|');
      const managerText = (await dialog(page).innerText()).replace(/\s+/g, ' ');
      snapshot.managerTokens = ['Cell State list:', 'Add Cell States', 'Remove Cell State', 'Range', 'Style', 'State']
        .filter((token) => managerText.includes(token));
      await clickInDialog(page, 'Add Cell States');
      snapshot.createCellStateTitle = (await dialogTitles(page)).join('|');
      const createText = (await dialog(page).innerText()).replace(/\s+/g, ' ');
      snapshot.createTokens = ['Select a cell state type', 'hover', 'Choose Range', 'Set style', 'Format']
        .filter((token) => createText.includes(token));
      await closeTopDialog(page); // Create
      await closeTopDialog(page); // Manager
      snapshot.cellStatesAfter = await page.evaluate(() => {
        const sheet = (window as any).__designerCompare.spread.getActiveSheet();
        return sheet.cellStates.all?.().length ?? 0;
      });

      // -- Combo charts ------------------------------------------------------
      const comboSeries: Record<string, unknown> = {};
      for (const command of ['comboChartColumnAndLine', 'comboChartColumnAndLineAxis', 'comboChartColumnAndArea']) {
        await page.evaluate(() => {
          const sheet = (window as any).__designerCompare.spread.getActiveSheet();
          sheet.setSelection(0, 0, 5, 6);
        });
        await runCommand(page, command);
        comboSeries[command] = await page.evaluate(() => {
          const sheet = (window as any).__designerCompare.spread.getActiveSheet();
          const chart = sheet.charts.all().slice(-1)[0];
          const series = chart.series().get();
          const list = Array.isArray(series) ? series : [series];
          return {
            count: list.length,
            plots: list.map((item: any) => [Number(item.chartType), Number(item.axisGroup ?? 0)]),
          };
        });
        snapshot[`combo_${command}`] = comboSeries[command];
      }
      snapshot.chartCount = await page.evaluate(() => (window as any).__designerCompare.spread.getActiveSheet().charts.all().length);

      // -- Conditional formatting footers ------------------------------------
      const cfTitles: Record<string, string> = {};
      for (const command of ['highlightCellsMoreRules', 'moreDataBarRules', 'conditionFormatNewRule', 'conditionFormatManageRule']) {
        await runCommand(page, command);
        cfTitles[command] = (await dialogTitles(page)).join('|');
        await closeTopDialog(page);
      }
      snapshot.cfTitles = cfTitles;

      // A cell-value rule created through the public API shows in both managers.
      await page.evaluate(() => {
        const sheet = (window as any).__designerCompare.spread.getActiveSheet();
        const style = new (window as any).GC.Spread.Sheets.Style();
        style.backColor = '#ffff00';
        sheet.conditionalFormats.addCellValueRule(4, 100, null, style, [new (window as any).GC.Spread.Sheets.Range(1, 1, 4, 5)]);
        return true;
      });
      await runCommand(page, 'conditionFormatManageRule');
      try {
        const text = (await dialog(page).innerText({ timeout: 3000 })).replace(/\s+/g, ' ');
        snapshot.managerShowsRule = /Cell value < 100/.test(text);
        snapshot.managerShowsRange = text.includes('=$B$2:$F$5');
      } catch {
        snapshot.managerShowsRule = 'no-dialog';
        snapshot.managerShowsRange = 'no-dialog';
      }
      await closeTopDialog(page);
    } finally {
      await page.close();
    }
    results.push(snapshot);
    writeFileSync(`../../.probe/t65-snapshot-${side}.json`, JSON.stringify(snapshot, null, 1));
  }

  const [official, ours] = results as any[];
  // Dialogs that replaced the message boxes must open with the trial's titles.
  expect(ours.newTableStyleTitle).toBe('New Table Style');
  expect(official.newTableStyleTitle).toContain('New Table Style');
  expect(ours.tableStyleTokens).toEqual(official.tableStyleTokens);
  // The trial stacks a hidden 0x0 measuring clone of the dialog, so its item count
  // doubles; ours renders each element exactly once.
  expect(ours.tableStyleListCount).toBe(1);
  expect(Number(official.tableStyleListCount)).toBeGreaterThanOrEqual(1);
  expect(ours.cellStatesTitle).toContain('Manage Cell States');
  expect(official.cellStatesTitle).toContain('Manage Cell States');
  expect(ours.managerTokens).toEqual(official.managerTokens);
  expect(ours.createCellStateTitle).toContain('Create Cell States');
  expect(official.createCellStateTitle).toContain('Create Cell States');
  expect(ours.createTokens).toEqual(official.createTokens);
  expect(ours.cellStatesAfter).toBe(official.cellStatesAfter);
  // The combo presets build the same per-series chart types and axis groups.
  for (const command of ['comboChartColumnAndLine', 'comboChartColumnAndLineAxis', 'comboChartColumnAndArea']) {
    expect(ours[`combo_${command}`]).toEqual(official[`combo_${command}`]);
  }
  expect(ours.chartCount).toBe(official.chartCount);
  // The CF gallery footers open the same dialogs on both sides.
  expect(ours.cfTitles).toEqual(official.cfTitles);
  // Our manager lists a rule created through the public API (the trial build's
  // manager does not populate here — measured, see STATUS TASK 65 gaps).
  expect(ours.managerShowsRule).toBe(true);
  expect(ours.managerShowsRange).toBe(true);
});
