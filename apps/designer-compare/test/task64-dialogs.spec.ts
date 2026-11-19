/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * TASK 64 (paired): the dialogs that replaced the "not implemented in this
 * milestone" stubs must behave like the trial:
 *  - Formulas > Insert Function (and the formula-bar fx): selecting ACOS and
 *    OK opens `Function Arguments`; Cancel leaves the cell untouched.
 *  - Go To: clicking a defined name fills `Reference:`; OK selects its range
 *    and the name box shows the name.
 *  - Go To Special: Formulas inside A1:F5 selects F2:F5 (active F2); a
 *    constants-only selection reports `No cells were found.`.
 *  - Series (Home > Fill): Linear step 1 from B2=120 fills 120..126.
 *  - Ctrl+F / Ctrl+H open the `Find and Replace` dialog on its Find/Replace tab.
 *  - Sort with B2 active preselects the active column `Q1` (never `Region`).
 *  - Name Box dropdown lists workbook- and sheet-scope names; picking one
 *    selects its range.
 * The trial's custom widgets are not native controls, so interaction goes
 * through visible texts inside the open dialog, and both sides must end up
 * with the same model state.
 */
import { expect, test, type Locator, type Page } from '@playwright/test';
import { boot } from './helpers';

const dialog = (page: Page): Locator => page.locator('.gc-designer-dialog').last();

async function clickInDialog(page: Page, text: string, exact = true): Promise<void> {
  // The trial stacks the visible dialog over a 0x0 measuring clone of itself, so pick the visible instance.
  await dialog(page).getByText(text, { exact }).filter({ visible: true }).last().click();
  await page.waitForTimeout(400);
}

async function dialogTitles(page: Page): Promise<string[]> {
  return page.evaluate(() => [...document.querySelectorAll('.gc-designer-dialog')]
    .map((element) => String(element.querySelector('.gc-designer-dialog-title, .gc-dialog-title')?.textContent ?? (element as HTMLElement).getAttribute('aria-label') ?? '').trim())
    .filter(Boolean));
}

async function sheetState(page: Page): Promise<{ sel: number[][]; active: number[]; nameBox: string }> {
  return page.evaluate(() => {
    const sheet = (window as any).__designerCompare.spread.getActiveSheet();
    const nameBox = document.querySelector<HTMLInputElement>('.gc-designer-formula-bar-nameBox input')?.value ?? '';
    return {
      sel: sheet.getSelections().map((r: any) => [r.row, r.col, r.rowCount, r.colCount]),
      active: [sheet.getActiveRowIndex(), sheet.getActiveColumnIndex()],
      nameBox,
    };
  });
}

async function runCommand(page: Page, command: string): Promise<void> {
  // `execute` may return a promise that settles only when the dialog closes; do not return it from evaluate.
  await page.evaluate((name) => {
    (window as any).GC.Spread.Sheets.Designer.getCommand(name).execute((window as any).__designerCompare.designer);
    return true;
  }, command);
  await page.waitForTimeout(700);
}

async function pressKey(page: Page, key: string): Promise<void> {
  await page.keyboard.press(key);
  await page.waitForTimeout(700);
}

test('TASK 64 dialogs match the trial', async ({ browser }) => {
  test.setTimeout(420_000);
  const results: Record<string, unknown>[] = [];
  for (const side of ['official', 'ours'] as const) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const snapshot: Record<string, unknown> = {};
    try {
      await boot(page, side);

      // -- Insert Function -> Function Arguments --------------------------
      await runCommand(page, 'insertFunction');
      snapshot.insertFunctionTitle = (await dialogTitles(page)).join('|');
      await clickInDialog(page, 'ACOS');
      await clickInDialog(page, 'OK');
      snapshot.functionArgumentsTitle = (await dialogTitles(page)).join('|');
      await clickInDialog(page, 'Cancel');

      // -- defined names --------------------------------------------------
      await page.evaluate(() => {
        const spread = (window as any).__designerCompare.spread;
        spread.addCustomName('Sales', 'Data!$B$2:$B$5', 0);
        spread.getActiveSheet().addCustomName('NorthCell', 'Data!$B$2', 0);
      });

      // -- Name Box dropdown ----------------------------------------------
      const arrow = await page.evaluate(() => {
        const box = document.querySelector('.gc-designer-formula-bar-nameBox')!.getBoundingClientRect();
        return { x: box.right - 9, y: box.top + box.height / 2 };
      });
      await page.mouse.click(arrow.x, arrow.y);
      await page.waitForTimeout(500);
      snapshot.nameBoxItems = [
        await page.getByText('NorthCell', { exact: true }).first().isVisible().catch(() => false),
        await page.getByText('Sales', { exact: true }).first().isVisible().catch(() => false),
      ];
      await page.getByText('Sales', { exact: true }).filter({ visible: true }).last().click();
      await page.waitForTimeout(500);
      snapshot.afterNameBoxClick = await sheetState(page);

      // -- Go To -----------------------------------------------------------
      await page.evaluate(() => (window as any).__designerCompare.spread.getActiveSheet().setSelection(0, 0, 1, 1));
      await runCommand(page, 'goto');
      await clickInDialog(page, 'Sales');
      await clickInDialog(page, 'OK');
      snapshot.afterGoTo = await sheetState(page);

      // -- Go To Special: Formulas in A1:F5 --------------------------------
      await page.evaluate(() => (window as any).__designerCompare.spread.getActiveSheet().setSelection(0, 0, 5, 6));
      await runCommand(page, 'gotoSpecial');
      await clickInDialog(page, 'Formulas');
      await clickInDialog(page, 'OK');
      snapshot.afterFormulas = await sheetState(page);

      // -- Go To Special with no matches -> report -------------------------
      await page.evaluate(() => (window as any).__designerCompare.spread.getActiveSheet().setSelection(1, 1, 4, 1));
      await runCommand(page, 'gotoSpecial');
      await clickInDialog(page, 'Formulas');
      await clickInDialog(page, 'OK');
      await page.waitForTimeout(400);
      snapshot.noCellsReport = await page.locator('text=No cells were found.').first().isVisible().catch(() => false);
      await page.locator('text=No cells were found.').first().locator('xpath=ancestor::*[.//text()[normalize-space()="OK"]][1]').getByText('OK', { exact: true }).last().click().catch(() => page.keyboard.press('Enter'));
      await page.waitForTimeout(400);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);

      // -- Series: linear step 1 over B2:B8 --------------------------------
      await page.evaluate(() => {
        const sheet = (window as any).__designerCompare.spread.getActiveSheet();
        sheet.setArray(1, 1, [[120], [null], [null], [null], [null], [null], [null]]);
        sheet.setSelection(1, 1, 7, 1);
      });
      await runCommand(page, 'series');
      await clickInDialog(page, 'OK');
      snapshot.seriesColumn = await page.evaluate(() => Array.from({ length: 7 }, (_, i) => (window as any).__designerCompare.spread.getActiveSheet().getValue(1 + i, 1)));

      // -- Series: rows -----------------------------------------------------
      // The trial remembers the previous dialog options (it stayed on `Columns`
      // for this 1x4 range and filled nothing), so drive the `Rows` choice here.
      await page.evaluate(() => {
        const sheet = (window as any).__designerCompare.spread.getActiveSheet();
        sheet.setValue(1, 1, 120);
        for (let c = 2; c <= 4; c++) sheet.setValue(1, c, null);
        sheet.setSelection(1, 1, 1, 4);
      });
      await runCommand(page, 'series');
      await clickInDialog(page, 'Rows');
      await clickInDialog(page, 'OK');
      snapshot.seriesRow = await page.evaluate(() => Array.from({ length: 4 }, (_, i) => (window as any).__designerCompare.spread.getActiveSheet().getValue(1, 1 + i)));

      // -- Ctrl+F / Ctrl+H ---------------------------------------------------
      // The trial listens on the sheet: after a dialog closed via its OK button, focus the grid first.
      await page.mouse.click(300, 400);
      await page.waitForTimeout(300);
      await pressKey(page, 'Control+f');
      snapshot.findTitle = (await dialogTitles(page)).join('|');
      const findText = (await dialog(page).innerText()).replace(/\s+/g, ' ');
      snapshot.findTokens = ['Find what', 'Find All', 'Find Next', 'Close'].filter((token) => findText.includes(token));
      snapshot.findHidesReplace = !findText.includes('Replace All');
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
      await page.mouse.click(300, 400);
      await page.waitForTimeout(300);
      await pressKey(page, 'Control+h');
      // Measured: the trial binds no Ctrl+H chord (nothing opens); ours opens
      // `Find and Replace` on the Replace tab, so guard the read with a timeout.
      let replaceText = '';
      try { replaceText = (await dialog(page).innerText({ timeout: 3000 })).replace(/\s+/g, ' '); } catch { /* no dialog on this side */ }
      snapshot.replaceTitle = (await dialogTitles(page)).join('|');
      snapshot.replaceTabActive = /Replace with/i.test(replaceText);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);

      // -- Sort default level follows the active column ----------------------
      await page.evaluate(() => (window as any).__designerCompare.spread.getActiveSheet().setActiveCell(1, 1));
      await runCommand(page, 'customSortData');
      await page.waitForTimeout(400);
      const sortText = (await dialog(page).innerText()).replace(/\s+/g, ' ');
      snapshot.sortHasQ1 = /\bQ1\b/.test(sortText);
      snapshot.sortHasRegion = /\bRegion\b/.test(sortText);
      await clickInDialog(page, 'Cancel');
    } finally {
      await page.close();
    }
    results.push(snapshot);
  }

  const [official, ours] = results;
  // Structure the trial exposes (our DOM is our own; the observable state is what must match).
  expect(ours.insertFunctionTitle).toBe(official.insertFunctionTitle);
  expect(ours.functionArgumentsTitle).toBe(official.functionArgumentsTitle);
  expect(ours.nameBoxItems).toEqual([true, true]);
  expect(official.nameBoxItems).toEqual([true, true]);
  expect(ours.afterNameBoxClick).toEqual(official.afterNameBoxClick);
  expect(ours.afterNameBoxClick.sel).toEqual([[1, 1, 4, 1]]);
  expect(ours.afterGoTo).toEqual(official.afterGoTo);
  expect(ours.afterGoTo.nameBox).toBe('Sales');
  expect(ours.afterFormulas.sel).toEqual(official.afterFormulas.sel);
  expect(ours.afterFormulas.sel).toEqual([[1, 5, 4, 1]]);
  expect(ours.afterFormulas.active).toEqual(official.afterFormulas.active);
  expect(ours.noCellsReport).toBe(true);
  expect(official.noCellsReport).toBe(true);
  expect(ours.seriesColumn).toEqual(official.seriesColumn);
  expect(ours.seriesColumn).toEqual([120, 121, 122, 123, 124, 125, 126]);
  expect(ours.seriesRow).toEqual(official.seriesRow);
  expect(ours.seriesRow).toEqual([120, 121, 122, 123]);
  expect(ours.findTitle).toBe(official.findTitle);
  expect(ours.findTitle).toContain('Find and Replace');
  expect(ours.findTokens).toEqual(official.findTokens);
  expect(ours.findHidesReplace).toBe(official.findHidesReplace);
  expect(ours.replaceTitle).toBe('Find and Replace');
  expect(ours.replaceTabActive).toBe(true);
  // The trial has no Ctrl+H chord at all (measured twice); ours deliberately adds it.
  expect(official.replaceTitle).toBe('');
  expect(official.replaceTabActive).toBe(false);
  expect(ours.sortHasQ1).toBe(true);
  expect(official.sortHasQ1).toBe(true);
  expect(ours.sortHasRegion).toBe(false);
});
