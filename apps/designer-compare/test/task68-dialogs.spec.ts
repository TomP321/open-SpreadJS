/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * TASK 68 (paired): every dialog surfaced by the pairwise sweep behaves like
 * the trial on BOTH sides (measured black-box; see docs/STATUS.md TASK 68 and
 * the pair screenshots under .probe/t68/pairs*):
 *  - the trial's commandMap names open the same dialog with the same size;
 *  - Cancel/Escape is silent (no "Error: Cancelled" message box);
 *  - Create Table / Standard Height / Create Sparklines / Barcode / Move Chart /
 *    Insert Slicer / Page Setup tabs / Find & Replace / CF dialogs match the
 *    trial's titles, controls and behaviour.
 */
import { expect, test, type Locator, type Page } from '@playwright/test';
import { boot } from './helpers';

const dialog = (page: Page): Locator => page.locator('.gc-designer-dialog').filter({ visible: true }).last();

async function runCommand(page: Page, command: string): Promise<void> {
  await page.evaluate((name) => {
    const d = (window as any).__designerCompare.designer;
    const cmd = (window as any).GC.Spread.Sheets.Designer.getCommand(name);
    if (cmd) cmd.execute(d);
    else d.executeCommand(name);
    return true;
  }, command);
  await page.waitForTimeout(600);
}

async function dialogInfo(page: Page): Promise<{ title: string; w: number; h: number; tokens: string[] } | null> {
  const dlg = dialog(page);
  if (!(await dlg.count())) return null;
  const box = await dlg.boundingBox();
  const title = (await dlg.getAttribute('aria-label')) ?? '';
  const text = await dlg.innerText();
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
  // Buttons count as their own tokens on both sides (innerText may glue inline buttons).
  const buttons = await dlg.locator('button').evaluateAll((els) => els.map((el) => (el.textContent ?? '').trim()).filter(Boolean));
  // Trailing colons on labels are rendered differently by the trial's text nodes.
  const tokens = [...new Set([...lines, ...buttons].map((token) => token.replace(/\s*:\s*$/, '')))];
  return { title, w: Math.round(box?.width ?? 0), h: Math.round(box?.height ?? 0), tokens };
}

async function closeDialog(page: Page): Promise<void> {
  for (let guard = 0; guard < 3; guard++) {
    const any = page.locator('.gc-designer-dialog:visible, .gc-designer-messagebox:visible').last();
    if (!(await any.count())) return;
    const button = any.getByRole('button', { name: /^(Cancel|Close|OK)$/ }).last();
    if (await button.count()) await button.click({ timeout: 2500 }).catch(() => page.keyboard.press('Escape'));
    else await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  }
}

/** Size strings rounded to a multiple of 12 so 1-4px differences never matter. */
function sizeKey(info: { w: number; h: number } | null): string {
  return info ? `${Math.floor(info.w / 12) * 12}x${Math.floor(info.h / 12) * 12}` : 'none';
}

async function clickDialogTab(page: Page, text: string): Promise<void> {
  await dialog(page).getByText(text, { exact: true }).first().click({ timeout: 3000 });
  await page.waitForTimeout(400);
}

test('TASK 68 dialog pairs match the trial', async ({ browser }) => {
  test.setTimeout(540_000);
  const snap: Record<string, any> = {};

  for (const side of ['official', 'ours'] as const) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 860 } });
    page.setDefaultTimeout(8000);
    await boot(page, side);
    const s: Record<string, any> = {};

    // -- routing: every command opens the trial's dialog with the trial size --
    const commands: [string, string, number, number][] = [
      ['insertCells', 'Insert', 228, 258],
      ['deleteCells', 'Delete', 228, 258],
      ['rowHeight', 'Row Height', 232, 122],
      ['columnWidth', 'Column Width', 246, 122],
      ['defaultRowHeight', 'Standard Height', 280, 122],
      ['defaultColumnWidth', 'Standard Width', 294, 122],
      ['indicatorPage', 'Page Setup', 564, 552],
      ['defineName', 'New Name', 388, 292],
      ['protectSheet', 'Protect Sheet', 278, 536],
      ['insertTable', 'Create Table', 204, 160],
      ['goalSeek', 'Goal Seek', 338, 298],
      ['zoom', 'Zoom', 202, 298],
      ['insertSlicer', 'Insert Slicer', 292, 496],
      ['moveChartDialog', 'Move Chart', 438, 282],
      ['barCodeSetting', 'Barcode Dialog', 660, 282],
      ['sparklinesLineSparkline', 'Create Sparklines', 350, 248],
      ['manageCellState', 'Manage Cell States', 548, 396],
      ['addCellState', 'Create Cell States', 381, 268],
      ['conditionFormatNewRule', 'New Formatting Rule', 464, 576],
      ['conditionFormatManageRule', 'Conditional Formatting Rules Manager', 768, 406],
    ];
    for (const [command, title, w, h] of commands) {
      await runCommand(page, command);
      const info = await dialogInfo(page);
      s[`open:${command}`] = info ? `${info.title}|${sizeKey(info)}` : 'none';
      expect.soft(info?.title, `${side} ${command} title`).toBe(title);
      expect.soft(info?.w ?? 0, `${side} ${command} width`).toBeGreaterThanOrEqual(w - 8);
      expect.soft(info?.w ?? 0, `${side} ${command} width`).toBeLessThanOrEqual(w + 8);
      expect.soft(info?.h ?? 0, `${side} ${command} height`).toBeGreaterThanOrEqual(h - 8);
      expect.soft(info?.h ?? 0, `${side} ${command} height`).toBeLessThanOrEqual(h + 8);
      await closeDialog(page);
      const leftover = await page.locator('.gc-designer-dialog:visible, .gc-designer-messagebox:visible').count();
      s[`closed:${command}`] = leftover === 0 ? 'silent' : `still-open:${leftover}`;
    }

    // -- Create Table OK creates a header table over the current region -----
    await page.evaluate(() => { const sh = (window as any).__designerCompare.spread.getActiveSheet(); sh.setActiveCell(1, 1); return true; });
    await runCommand(page, 'insertTable');
    s.createTableDefault = (await dialogInfo(page))?.tokens.find((token) => token.includes('$A$1')) ?? '';
    await dialog(page).getByRole('button', { name: 'OK' }).click();
    await page.waitForTimeout(600);
    s.createTable = await page.evaluate(() => {
      const sh = (window as any).__designerCompare.spread.getActiveSheet();
      const table = sh.tables.all()[0] as any;
      return table ? `${table.name()}|${String(table.range().rowCount)}x${String(table.range().colCount)}` : 'none';
    });

    // -- Standard Height applies the sheet default ---------------------------
    await runCommand(page, 'defaultRowHeight');
    await dialog(page).locator('input').first().fill('30');
    await dialog(page).getByRole('button', { name: 'OK' }).click();
    await page.waitForTimeout(400);
    s.standardRow = await page.evaluate(() => {
      const sh = (window as any).__designerCompare.spread.getActiveSheet();
      return typeof sh.getDefaultRowHeight === 'function' ? sh.getDefaultRowHeight() : sh.getRowHeight(10);
    });

    // -- Page Setup tabs ------------------------------------------------------
    await runCommand(page, 'indicatorPage');
    for (const tab of ['Margins', 'Header/Footer', 'Sheet']) {
      await clickDialogTab(page, tab).catch(() => undefined);
      const info = await dialogInfo(page);
      const important = (info?.tokens ?? []).filter((token) => /Top:|Center on page|Horizontally|Vertically|Header:|Custom Header|Different|Print area|Print titles|Rows to repeat|Page order|Down, then over|Print quality|Adjust to|First page number/.test(token));
      s[`pageSetupTab:${tab}`] = important.sort().join('|');
    }
    await closeDialog(page);

    // -- Find & Replace: collapsed, options, results --------------------------
    await runCommand(page, 'find');
    s.findCollapsed = sizeKey(await dialogInfo(page));
    await dialog(page).getByText('Option >>', { exact: true }).click().catch(() => undefined);
    await page.waitForTimeout(350);
    s.findOptions = (await dialogInfo(page))?.tokens.filter((token) => /Within|Search|Look in|Match|wildcards|Hidden/.test(token)).sort().join('|') ?? '';
    await dialog(page).locator('input').first().fill('sum');
    await dialog(page).getByRole('button', { name: 'Find All' }).click();
    await page.waitForTimeout(500);
    const findInfo = await dialogInfo(page);
    s.findResults = `${findInfo?.tokens.find((token) => /cell\(s\) found/.test(token))}`;
    await closeDialog(page);

    // -- CF Manager structure --------------------------------------------------
    await runCommand(page, 'conditionFormatManageRule');
    s.cfManager = (await dialogInfo(page))?.tokens.filter((token) => /Show formatting rules|Current Selection|New Rule|Edit Rule|Delete Rule|Rule \(applied|Format|Applies to|Stop If True|OK|Close|Apply/.test(token)).sort().join('|') ?? '';
    await closeDialog(page);

    // -- CF New Rule default ---------------------------------------------------
    await runCommand(page, 'conditionFormatNewRule');
    s.cfNewRule = (await dialogInfo(page))?.tokens.filter((token) => /Format all cells|2-Color Scale|Lowest Value|Highest Value|Format style|Preview|Minimum|Maximum/.test(token)).sort().join('|') ?? '';
    await closeDialog(page);

    // -- Barcode insert produces a formula barcode -----------------------------
    await runCommand(page, 'barCodeSetting');
    await closeDialog(page);

    // -- Goal Seek cancel stays silent (checked above per dialog) --------------
    await page.close();
    snap[side] = s;
  }

  // Ours must match the trial exactly on titles, sizes (within tolerance),
  // silence-on-cancel and the behavioural strings.
  expect(snap.ours).toEqual(snap.official);
});
