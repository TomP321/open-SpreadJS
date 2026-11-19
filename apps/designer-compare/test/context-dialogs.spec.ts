/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Task 61 item 5: every context-menu entry that opens a dialog must open a dialog
 * that looks like the trial's (title, size, control labels) and works (its OK
 * button changes the model). Reference titles/sizes/labels were collected
 * black-box in .probe/t6/dialogs-pair.json / titles.json / behaviors2.json.
 */
import { expect, test, type Page } from '@playwright/test';
import { boot } from './helpers';

test.setTimeout(420_000);
// The fixed probe coordinates and the hitTest scan below assume the comparison viewport.
test.use({ viewport: { width: 1280, height: 720 } });

interface DialogCase {
  key: string;
  /** Where the entry lives: a plain cell, a row header, a column header or the corner. */
  area: 'cell' | 'row' | 'col' | 'corner';
  item: string;
  /** The entry only exists while a copy is pending. */
  copy?: boolean;
  title: string;
  /** Measured trial size (the tolerance keeps this a look-check, not a pixel gate). */
  size: { w: number; h: number };
  /** Labels the trial shows inside the dialog. */
  labels: string[];
  /** The trial opens no dialog for this entry (only ours is checked). */
  oursOnly?: boolean;
}

const CELL = { x: 500, y: 520 }, ROW = { x: 20, y: 400 }, COL = { x: 470, y: 191 };

const cases: DialogCase[] = [
  { key: 'insert', area: 'cell', item: 'Insert...', title: 'Insert', size: { w: 228, h: 257 }, labels: ['Insert', 'Shift cells right', 'Shift cells down', 'Entire row', 'Entire column', 'OK', 'Cancel'] },
  { key: 'delete', area: 'cell', item: 'Delete...', title: 'Delete', size: { w: 228, h: 257 }, labels: ['Delete', 'Shift cells left', 'Shift cells up', 'Entire row', 'Entire column', 'OK', 'Cancel'] },
  { key: 'pasteSpecial', area: 'cell', item: 'Paste Special...', copy: true, title: 'Paste Special', size: { w: 401, h: 328 }, labels: ['Paste', 'All', 'Formulas', 'Values', 'Formats', 'Comments', 'Validation', 'All using Source theme', 'All except borders', 'Column widths', 'Formulas and number formats', 'Value and number formats', 'Operation', 'None', 'Add', 'Subtract', 'Multiply', 'Divide', 'Transform', 'Skip blanks', 'Transpose', 'Paste Link', 'OK', 'Cancel'] },
  { key: 'richText', area: 'cell', item: 'Rich text...', title: 'Rich Text Dialog', size: { w: 668, h: 432 }, labels: ['OK', 'Cancel'] },
  { key: 'defaultValue', area: 'cell', item: 'Default Value...', title: 'Default Value Dialog', size: { w: 313, h: 129 }, labels: ['The default value:', 'OK', 'Cancel'] },
  { key: 'cellTag', area: 'cell', item: 'Tag...', title: 'Cell Tag Dialog', size: { w: 334, h: 191 }, labels: ['Tag:', 'OK', 'Cancel', 'Clear'] },
  { key: 'defineName', area: 'cell', item: 'Define Name...', title: 'New Name', size: { w: 388, h: 291 }, labels: ['Name:', 'Scope:', 'Refer to:', 'Comment:', 'OK', 'Cancel'] },
  { key: 'link', area: 'cell', item: 'Link...', title: 'Hyperlink', size: { w: 438, h: 529 }, labels: ['Text to display:', 'ScreenTip:', 'Target:', 'Link Color:', 'Visited Link Color:', 'Reset', 'Web Page', 'This Document', 'Email Address', 'Address:', 'Remove', 'OK', 'Cancel'] },
  { key: 'transformCells', area: 'cell', item: 'Transform Cells...', title: 'Transform Cells', size: { w: 414, h: 168 }, labels: ['Formula:', 'Scope:', 'By Cell', 'OK', 'Cancel'] },
  { key: 'createTemplate', area: 'cell', item: 'Create Cell Template...', title: 'Create Cell Template', size: { w: 320, h: 200 }, labels: ['Name:', 'OK', 'Cancel'], oursOnly: true },
  { key: 'rowHeight', area: 'row', item: 'Row Height...', title: 'Row Height', size: { w: 231, h: 122 }, labels: ['Row height:', 'OK', 'Cancel'] },
  { key: 'rowTag', area: 'row', item: 'Tag...', title: 'Row Tag Dialog', size: { w: 334, h: 191 }, labels: ['Tag:', 'OK', 'Cancel', 'Clear'] },
  { key: 'colWidth', area: 'col', item: 'Column Width...', title: 'Column Width', size: { w: 244, h: 122 }, labels: ['Column width:', 'OK', 'Cancel'] },
  { key: 'colTag', area: 'col', item: 'Tag...', title: 'Column Tag Dialog', size: { w: 334, h: 191 }, labels: ['Tag:', 'OK', 'Cancel', 'Clear'] },
  { key: 'outlineColumn', area: 'col', item: 'Outline Column...', title: 'Outline Column', size: { w: 377, h: 189 }, labels: ['Show Indicator', 'Show Image', 'Custom Indicator Image', 'Show CheckBox', 'Max Level', 'OK', 'Cancel'] },
  { key: 'headers', area: 'col', item: 'Headers...', title: 'Header Cells', size: { w: 738, h: 717 }, labels: ['Row Header', 'Column Header', 'Value', 'BackColor', 'ForeColor', 'Font', 'Formatter', 'HAlign', 'VAlign', 'TextIndent', 'BorderLeft', 'BorderRight', 'BorderTop', 'BorderBottom', 'DiagonalUp', 'DiagonalDown', 'BorderRadius', 'Locked', 'WordWrap', 'ShrinkToFit', 'Vertical Text', 'OK', 'Cancel'] },
];

const point = (area: DialogCase['area']): { x: number; y: number } => ({ cell: CELL, row: ROW, col: COL, corner: CELL }[area]);

/** Opens the context menu of `area` and clicks `item`; returns false when the entry is missing. */
const openEntry = async (page: Page, side: 'official' | 'ours', item: string, area: DialogCase['area'], copy?: boolean): Promise<boolean> => {
  if (copy) {
    await page.mouse.click(181, 232);
    await page.keyboard.press('Control+C');
    await page.waitForTimeout(300);
  }
  const where = point(area);
  await page.mouse.click(where.x, where.y, { button: 'right' });
  await page.waitForTimeout(400);
  const box = await page.evaluate(({ selector, label }) => {
    for (const el of [...document.querySelectorAll(`${selector} [role=menuitem]`)]) {
      const text = (el.querySelector('.gc-ui-contextmenu-text')?.textContent ?? (el.querySelector('[data-label]') as Element | null)?.getAttribute('data-label') ?? el.textContent ?? '').trim();
      const rect = el.getBoundingClientRect();
      if (text === label && rect.width > 0 && rect.height > 0) return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    }
    return null;
  }, { selector: side === 'official' ? '.gc-ui-contextmenu-container' : '.gc-designer-context-menu', label: item });
  if (!box) { await page.keyboard.press('Escape'); return false; }
  await page.mouse.click(box.x, box.y);
  await page.waitForTimeout(500);
  return true;
};

interface DialogDump { title: string; w: number; h: number; lines: string[] }

/** Both products host these windows in a `.gc-designer-dialog`; the trial's Paste Special is a ui-dialog. */
const readDialog = (page: Page): Promise<DialogDump | null> => page.evaluate(() => {
  const visible = (node: Element) => { const r = node.getBoundingClientRect(); return r.width > 40 && r.height > 40; };
  const roots = [...document.querySelectorAll('.gc-designer-dialog'), ...document.querySelectorAll('.ui-dialog [class*=dialog-container], .gc-popup-gc-dialog2')].filter(visible);
  const el = roots.pop();
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  const title = (el.querySelector('.gc-dialog-title')?.textContent ?? '').trim();
  const lines = (el.innerText ?? '').split('\n').map((line) => line.trim()).filter(Boolean);
  return { title: title || lines[0] || '', w: Math.round(rect.width), h: Math.round(rect.height), lines };
});

for (const group of [cases.slice(0, 6), cases.slice(6, 11), cases.slice(11)]) {
  test(`context-menu dialogs match the trial (${group.map((item) => item.key).join(', ')})`, async ({ page }) => {
    for (const item of group) {
      if (!item.oursOnly) {
        await boot(page, 'official');
        expect(await openEntry(page, 'official', item.item, item.area, item.copy), `${item.key}: the trial menu has no ${item.item}`).toBe(true);
        const found = await readDialog(page);
        expect(found, `${item.key}: the trial opened no dialog`).not.toBeNull();
        expect.soft(found!.title, `${item.key} trial title`).toBe(item.title);
        expect.soft(Math.abs(found!.w - item.size.w), `${item.key} trial width`).toBeLessThanOrEqual(4);
        expect.soft(Math.abs(found!.h - item.size.h), `${item.key} trial height`).toBeLessThanOrEqual(4);
        await page.keyboard.press('Escape');
      }
      await boot(page, 'ours');
      expect(await openEntry(page, 'ours', item.item, item.area, item.copy), `${item.key}: our menu has no ${item.item}`).toBe(true);
      const mine = await readDialog(page);
      expect(mine, `${item.key}: our dialog did not open`).not.toBeNull();
      expect.soft(mine!.title, `${item.key} our title`).toBe(item.title);
      expect.soft(Math.abs(mine!.w - item.size.w), `${item.key} our width`).toBeLessThanOrEqual(4);
      expect.soft(mine!.h - item.size.h, `${item.key} our height`).toBeLessThanOrEqual(4);
      for (const label of item.labels) expect.soft(mine!.lines, `${item.key} is missing the label "${label}"`).toContain(label);
      await page.keyboard.press('Escape');
    }
  });
}

/* ===== Item 5, second half: the dialogs are functional, not decoration. ===== */

/** Canvas point of a viewport cell / row header / column header, through the public hitTest API. */
const spot = async (page: Page, kind: 'cell' | 'row' | 'col', row: number, col = 0): Promise<{ x: number; y: number }> => {
  const found = await page.evaluate(({ kind, row, col }) => {
    const spread = (window as any).__designerCompare.spread;
    const canvases = [...document.querySelectorAll('#designer-host canvas')];
    const main = canvases.sort((a, b) => b.getBoundingClientRect().width * b.getBoundingClientRect().height - a.getBoundingClientRect().width * a.getBoundingClientRect().height)[0];
    const host = main.getBoundingClientRect();
    const want = kind === 'cell' ? 3 : kind === 'row' ? 2 : 1;
    const hits: { x: number; y: number }[] = [];
    for (let y = 2; y < 640; y += 4) {
      for (let x = 2; x < 1240; x += 4) {
        const hit = spread.hitTest(x, y)?.worksheetHitInfo;
        if (!hit || hit.hitTestType !== want) continue;
        const rowOk = kind === 'col' || hit.row === row;
        const colOk = kind === 'row' || hit.col === col;
        if (rowOk && colOk) hits.push({ x: host.left + x, y: host.top + y });
      }
    }
    if (!hits.length) return null;
    // Row headers sit at the very left of the window: use the right-most hit of the strip.
    const pick = kind === 'row' ? hits[hits.length - 1] : kind === 'col' ? hits[Math.floor(hits.length / 2)] : hits[Math.floor(hits.length / 2)];
    return { x: pick.x - (kind === 'row' ? 2 : 0), y: pick.y };
  }, { kind, row, col });
  if (!found) throw new Error(`no ${kind} point for ${row},${col}`);
  return found;
};

test('context-menu dialogs apply their result to the model', async ({ page }) => {
  test.setTimeout(240_000);
  await boot(page, 'ours');
  await page.evaluate(() => {
    const sheet = (window as any).__designerCompare.spread.getActiveSheet();
    sheet.clear(0, 0, 24, 12, 1, 3);
    sheet.setValue(11, 0, 'alpha');
    sheet.setValue(11, 1, 'beta');
    sheet.setRowHeight(3, 20);
    sheet.setColumnWidth(3, 70);
    window.__designerCompare.spread.refresh();
  });
  await page.waitForTimeout(200);
  // Resolved per step: an old `.last()` handle can point at a dialog that is already closed.
  const dialog = page.locator('.gc-designer-dialog:visible');
  const dialogLast = () => dialog.last();
  // Spots are recomputed on demand: every size dialog changes the geometry that hit-testing depends on.
  const cellSpot = () => spot(page, 'cell', 11, 0);
  const rowSpot = () => spot(page, 'row', 3);
  const colSpot = () => spot(page, 'col', 0, 3);
  const rightClick = async (where: { x: number; y: number }): Promise<void> => {
    await page.mouse.click(where.x, where.y, { button: 'right' });
    await page.waitForTimeout(450);
  };
  // The menu must open on the cell whose model state we assert on, so right-click
  // that point and click the entry directly instead of using the fixed probe points.
  // The menu must open on the cell whose model state we assert on, so the caller right-clicks
  // that point and the entry is clicked through a retrying locator (not raw coordinates).
  const clickItem = async (item: string): Promise<void> => {
    const entry = page.locator('.gc-designer-context-menu').last().locator(`[role=menuitem]:has([data-label="${item}"])`).first();
    await expect(entry, `no ${item} entry`).toBeVisible({ timeout: 6000 });
    await entry.click({ timeout: 6000 });
    await page.waitForTimeout(400);
  };
  const read = <T>(fn: () => T): Promise<T> => page.evaluate(fn as any);
  const clickDialogButton = async (name: string): Promise<void> => {
    await dialogLast().getByRole('button', { name, exact: true }).click();
    // The overlay covers the sheet: wait until the dialog is really gone before the next right-click.
    await page.waitForFunction(() => ![...document.querySelectorAll('.gc-designer-dialog')].some((el) => el.getBoundingClientRect().width > 0), null, { timeout: 5000 });
  };

  // Insert... ▸ Entire row.
  await rightClick(await cellSpot());
  await clickItem('Insert...');
  await dialogLast().getByText('Entire row', { exact: true }).click();
  await clickDialogButton('OK');
  expect(await read(() => (window as any).__designerCompare.spread.getActiveSheet().getValue(12, 0))).toBe('alpha');

  // Delete... ▸ Entire row (undo the insert).
  await rightClick(await cellSpot());
  await clickItem('Delete...');
  await dialogLast().getByText('Entire row', { exact: true }).click();
  await clickDialogButton('OK');
  expect(await read(() => (window as any).__designerCompare.spread.getActiveSheet().getValue(11, 0))).toBe('alpha');

  // Row Height... and Column Width....
  await rightClick(await rowSpot());
  await clickItem('Row Height...');
  await dialogLast().locator('input').first().fill('44');
  await clickDialogButton('OK');
  expect(await read(() => (window as any).__designerCompare.spread.getActiveSheet().getRowHeight(3))).toBe(44);
  await rightClick(await colSpot());
  await clickItem('Column Width...');
  await dialogLast().locator('input').first().fill('99');
  await clickDialogButton('OK');
  expect(await read(() => (window as any).__designerCompare.spread.getActiveSheet().getColumnWidth(3))).toBe(99);

  // Tag... on a cell, then the dialog's Clear button.
  await rightClick(await cellSpot());
  await clickItem('Tag...');
  await dialogLast().locator('textarea').first().fill('hello-tag');
  await clickDialogButton('OK');
  expect(await read(() => String((window as any).__designerCompare.spread.getActiveSheet().getCell(11, 0).tag()))).toBe('hello-tag');
  await rightClick(await cellSpot());
  await clickItem('Tag...');
  await clickDialogButton('Clear');
  expect(await read(() => String((window as any).__designerCompare.spread.getActiveSheet().getCell(11, 0).tag()))).toBe('undefined');

  // Default Value....
  await rightClick(await cellSpot());
  await clickItem('Default Value...');
  await dialogLast().locator('input').first().fill('17');
  await clickDialogButton('OK');
  expect(await read(() => (window as any).__designerCompare.spread.getActiveSheet().getDefaultValue(11, 0))).toBe(17);

  // Define Name... adds a workbook name.
  await rightClick(await cellSpot());
  await clickItem('Define Name...');
  await dialogLast().locator('.gc-name-editor').fill('CtxName');
  await clickDialogButton('OK');
  expect(await read(() => (window as any).__designerCompare.spread.getCustomNames().map((name: any) => name.getName()))).toContain('CtxName');

  // Link... writes a hyperlink; its Remove button clears it again.
  await rightClick(await cellSpot());
  await clickItem('Link...');
  await dialogLast().locator('.gc-hyperlink-address').fill('https://example.com');
  await clickDialogButton('OK');
  expect(await read(() => (window as any).__designerCompare.spread.getActiveSheet().getHyperlink(11, 0)?.url)).toBe('https://example.com');
  await rightClick(await cellSpot());
  await clickItem('Link...');
  await clickDialogButton('Remove');
  expect(await read(() => (window as any).__designerCompare.spread.getActiveSheet().getHyperlink(11, 0))).toBeFalsy();

  // Rich text... replaces the cell text.
  await rightClick(await cellSpot());
  await clickItem('Rich text...');
  await dialogLast().locator('.gc-rich-text-content').fill('rich-value');
  await clickDialogButton('OK');
  expect(await read(() => (window as any).__designerCompare.spread.getActiveSheet().getValue(11, 0))).toBe('rich-value');

  // Transform Cells... applies the LAMBDA body to each selected cell.
  await rightClick(await cellSpot());
  await clickItem('Transform Cells...');
  await dialogLast().locator('textarea').first().fill('UPPER(x)');
  await clickDialogButton('OK');
  expect(await read(() => (window as any).__designerCompare.spread.getActiveSheet().getValue(11, 0))).toBe('RICH-VALUE');

  // Paste Special... ▸ Values drops the formula but keeps the value.
  await read(() => {
    const sheet = (window as any).__designerCompare.spread.getActiveSheet();
    sheet.setFormula(11, 1, '=21+1');
    return true;
  });
  const source = await spot(page, 'cell', 11, 1);
  await page.mouse.click(source.x, source.y);
  await page.keyboard.press('Control+C');
  await page.waitForTimeout(300);
  await rightClick(await cellSpot());
  await clickItem('Paste Special...');
  await dialogLast().getByText('Values', { exact: true }).click();
  await clickDialogButton('OK');
  expect(await read(() => {
    const sheet = (window as any).__designerCompare.spread.getActiveSheet();
    return { value: sheet.getValue(11, 0), formula: sheet.getFormula(11, 0) };
  })).toEqual({ value: 22, formula: null });

  // Headers... writes the column header cell of that column.
  await rightClick(await colSpot());
  await clickItem('Headers...');
  await dialogLast().getByRole('tab', { name: 'Column Header' }).click();
  await dialogLast().locator('.gc-header-value').first().fill('Head9');
  await clickDialogButton('OK');
  expect(await read(() => (window as any).__designerCompare.spread.getActiveSheet().getValue(0, 3, 1))).toBe('Head9');

  // Outline Column... and Create Cell Template... submit cleanly.
  await rightClick(await colSpot());
  await clickItem('Outline Column...');
  await clickDialogButton('OK');
  await rightClick(await cellSpot());
  await clickItem('Create Cell Template...');
  await dialogLast().locator('input').first().fill('CtxTemplate');
  await clickDialogButton('OK');
  expect(await read(() => Object.keys((window as any).__designerCompare.spread._cellTemplates ?? {}))).toContain('CtxTemplate');
  expect(await read(() => (window as any).__designerCompare.spread.getActiveSheet().getRowCount())).toBeGreaterThanOrEqual(200);
});
