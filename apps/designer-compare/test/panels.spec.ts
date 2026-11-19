/* eslint-disable @typescript-eslint/no-explicit-any */
import { expect, test, type Page } from '@playwright/test';
import { boot } from './helpers';

async function clickByText(page: Page, text: string): Promise<void> {
  const box = await page.evaluate((label) => {
    const norm = (s: string): string => s.replace(/\s+/g, ' ').trim();
    const candidates = [...document.querySelectorAll('*')]
      .filter((e) => norm(e.textContent ?? '') === label)
      .map((e) => { const r = e.getBoundingClientRect(); return { r, area: r.width * r.height }; })
      .filter((c) => c.r.width > 0 && c.r.height > 0);
    if (!candidates.length) return null;
    // Smallest matching box wins (the caption leaf over its container), preferring the
    // top-most when a button label and a group caption share the same text.
    candidates.sort((a, b) => a.area - b.area || a.r.y - b.r.y);
    const r = candidates[0].r;
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, text);
  expect(box, `element "${text}" visible`).not.toBeNull();
  await page.mouse.click(box!.x, box!.y);
  await page.waitForTimeout(250);
}

test('Selection Pane docks on the right and closes like the trial', async ({ browser }) => {
  const results = [];
  for (const side of ['official', 'ours'] as const) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    try {
      await boot(page, side);
      const canvasWidth = () => page.evaluate(() => {
        const canvas = [...document.querySelectorAll('canvas')].find((c) => c.getBoundingClientRect().width > 500);
        return canvas ? Math.round(canvas.getBoundingClientRect().width) : 0;
      });
      const before = await canvasWidth();
      await clickByText(page, 'View');
      await clickByText(page, 'Selection Pane');
      const pane = page.locator('.gc-designer-selection-pane');
      await expect(pane).toBeVisible();
      const box = await pane.boundingBox();
      const title = await pane.locator('.gc-designer-panel-title').innerText();
      const buttons = await pane.locator('.gc-tab-selection-pane-show, .gc-tab-selection-pane-hide').count();
      const shrunk = await canvasWidth();
      await pane.locator('.gc-designer-panel-dialog-close-button-container').click();
      await page.waitForTimeout(250);
      const restored = await canvasWidth();
      results.push({ width: box?.width, title: title.trim(), buttons, shrunk, restored, before });
    } finally { await page.close(); }
  }
  const [official, ours] = results;
  expect(ours.width).toBe(official.width);
  expect(ours.title).toBe(official.title);
  expect(ours.buttons).toBe(2);
  expect(official.shrunk).toBeLessThan(official.before);
  // The canvas shrinks by exactly the pane width on both sides.
  expect(ours.before - ours.shrunk).toBe(official.before - official.shrunk);
  expect(ours.restored).toBe(ours.before);
  expect(official.restored).toBe(official.before);
});

test('Command Palette searches and runs actions like the trial', async ({ browser }) => {
  const results = [];
  for (const side of ['official', 'ours'] as const) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    try {
      await boot(page, side);
      await clickByText(page, 'View');
      await page.locator('.gc-command-palette-trigger-button').first().click(); // supervisor 2026-11-12: the text 'Command Palette' also matches the group caption (no-op click on both sides)
      const palette = page.locator('.gc-designer-command-palette');
      await expect(palette).toBeVisible();
      const placeholder = await palette.locator('input').getAttribute('placeholder');
      const box = await palette.boundingBox();
      await palette.locator('input').fill('protect');
      await page.waitForTimeout(200);
      const groups = await palette.locator('.gc-command-palette-group-label').allInnerTexts();
      const items = await palette.locator('.gc-command-palette-list-item').allInnerTexts();
      // Enter runs the highlighted best match: the Protect Sheet dialog opens and the palette closes.
      await palette.locator('input').press('Enter');
      await expect(palette).toHaveCount(0);
      await expect(page.getByText('Password to unprotect sheet (optional)')).toBeVisible();
      await page.keyboard.press('Escape');
      results.push({ placeholder, width: box?.width, groups: groups.map((t) => t.trim()), top: items[0]?.trim() });
    } finally { await page.close(); }
  }
  const [official, ours] = results;
  expect(ours.placeholder).toBe(official.placeholder);
  expect(ours.width).toBe(official.width);
  expect(ours.groups).toEqual(official.groups);
  expect(ours.top).toBe(official.top);
  expect(ours.top).toBe('Protect Sheet...');
});

test('Command Palette closes on Escape like the trial', async ({ browser }) => {
  const results = [];
  for (const side of ['official', 'ours'] as const) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    try {
      await boot(page, side);
      await clickByText(page, 'View');
      await page.locator('.gc-command-palette-trigger-button').first().click(); // supervisor 2026-11-12: the text 'Command Palette' also matches the group caption (no-op click on both sides)
      await expect(page.locator('.gc-designer-command-palette')).toBeVisible();
      await page.keyboard.press('Escape');
      await page.waitForTimeout(200);
      results.push(await page.locator('.gc-designer-command-palette').count());
    } finally { await page.close(); }
  }
  expect(results[1]).toEqual(results[0]);
  expect(results[0]).toBe(0);
});

// supervisor 2026-11-12: the trial 19.2.5 never creates .gc-designer-formula-editor-panel (stub command, no execute;
// evidence .probe/t18/formula-*.png). Kept as fixme until a reference that docks the panel exists.
test.fixme('Show Formula Editor docks a formula panel like the trial', async ({ browser }) => {
  const results = [];
  for (const side of ['official', 'ours'] as const) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    try {
      await boot(page, side);
      const canvasHeight = () => page.evaluate(() => {
        const canvas = [...document.querySelectorAll('canvas')].find((c) => c.getBoundingClientRect().width > 500);
        return canvas ? Math.round(canvas.getBoundingClientRect().height) : 0;
      });
      const before = await canvasHeight();
      await clickByText(page, 'Formulas');
      await clickByText(page, 'Show Formula Editor');
      const panel = page.locator('.gc-designer-formula-editor-panel');
      await expect(panel).toBeVisible();
      const box = await panel.boundingBox();
      const title = (await panel.locator('.gc-designer-formula-editor-panel-title').innerText()).trim();
      await page.mouse.click(459, 229); // F2: =SUM(B2:E2)
      await page.waitForTimeout(200);
      const input = panel.locator('textarea');
      const shown = await input.inputValue();
      const cell = (await panel.locator('.gc-designer-formula-editor-panel-cell').innerText()).trim();
      const shrunk = await canvasHeight();
      await input.fill('=SUM(B2:E2)*2');
      await input.press('Enter');
      await page.waitForTimeout(250);
      const value = await page.evaluate(() => (window as any).__designerCompare.spread.getActiveSheet().getValue(1, 5));
      await clickByText(page, 'Show Formula Editor');
      await page.waitForTimeout(250);
      const restored = await canvasHeight();
      results.push({ height: box?.height, title, cell, shown, shrunk, value, restored, before });
    } finally { await page.close(); }
  }
  const [official, ours] = results;
  expect(ours.height).toBe(official.height);
  expect(ours.title).toBe(official.title);
  expect(ours.cell).toBe(official.cell);
  expect(ours.shown).toBe(official.shown);
  expect(ours.shown).toBe('=SUM(B2:E2)');
  expect(ours.shrunk).toBe(official.shrunk);
  expect(ours.value).toBe(official.value);
  expect(ours.value).toBe(1140);
  expect(ours.restored).toBe(official.restored);
});

test('Focus Cell toggle flips the workbook option like the trial', async ({ browser }) => {
  const results = [];
  for (const side of ['official', 'ours'] as const) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    try {
      await boot(page, side);
      await clickByText(page, 'View');
      const state = () => page.evaluate(() => {
        const options = (window as any).__designerCompare.spread.options.focusCell;
        return options ? { enabled: !!options.enabled, color: String(options.color ?? '') } : null;
      });
      const before = await state();
      // Click the Focus Cell main button (left icon area, away from the dropdown caret).
      const box = await page.evaluate(() => {
        const el = [...document.querySelectorAll('*')].filter((e) => e.children.length === 0 && e.textContent.trim() === 'Focus Cell')[0];
        for (let node: HTMLElement | null = el as HTMLElement; node; node = node.parentElement) {
          const r = node.getBoundingClientRect();
          if (r.height >= 50) return { x: r.x + 10, y: r.y + 14 };
        }
        return null;
      });
      await page.mouse.click(box!.x, box!.y);
      await page.waitForTimeout(250);
      const after = await state();
      await page.mouse.click(box!.x, box!.y);
      await page.waitForTimeout(250);
      const toggled = await state();
      results.push({ before, after, toggled });
    } finally { await page.close(); }
  }
  const [official, ours] = results;
  expect(ours.before?.enabled).toBe(official.before?.enabled);
  expect(ours.after?.enabled).toBe(true);
  expect(official.after?.enabled).toBe(true);
  expect(ours.after?.color).toBe(official.after?.color);
  expect(ours.toggled?.enabled).toBe(official.toggled?.enabled);
});

test('Zoom to Selection produces the trial zoom', async ({ browser }) => {
  const results = [];
  for (const side of ['official', 'ours'] as const) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    try {
      await boot(page, side);
      await page.evaluate(() => (window as any).__designerCompare.spread.getActiveSheet().setSelection(1, 1, 4, 4));
      await clickByText(page, 'View');
      await clickByText(page, 'Zoom to Selection');
      await page.waitForTimeout(300);
      results.push(await page.evaluate(() => (window as any).__designerCompare.spread.getActiveSheet().zoom()));
    } finally { await page.close(); }
  }
  expect(results[1]).toBeCloseTo(results[0], 10);
  expect(results[0]).toBeGreaterThan(1);
});

test('password sheet protection round-trips like the trial', async ({ browser }) => {
  const results = [];
  for (const side of ['official', 'ours'] as const) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    try {
      await boot(page, side);
      await clickByText(page, 'View');
      await page.locator('.gc-command-palette-trigger-button').first().click(); // supervisor 2026-11-12: the text 'Command Palette' also matches the group caption (no-op click on both sides)
      const palette = page.locator('.gc-designer-command-palette');
      await palette.locator('input').fill('protect sheet');
      await page.waitForTimeout(200);
      await palette.locator('input').press('Enter');
      const dialog = page.locator('.gc-designer-dialog').last();
      await dialog.locator('input[type="password"], input[type="text"], input').first().fill('abc');
      await dialog.getByRole('button', { name: 'OK', exact: true }).click();
      // Confirm Password companion.
      const confirm = page.locator('.gc-designer-dialog').last();
      await confirm.locator('input').first().fill('abc');
      await confirm.getByRole('button', { name: 'OK', exact: true }).click();
      await page.waitForTimeout(300);
      const protectedState = await page.evaluate(() => {
        const sheet = (window as any).__designerCompare.spread.getActiveSheet();
        const json = JSON.stringify(sheet.toJSON());
        let formulaBlocked = false;
        try { sheet.setFormula(0, 0, '=1+1'); } catch { formulaBlocked = true; }
        return { isProtected: !!sheet.options.isProtected, hasHash: json.includes('hashValue'), algorithm: json.includes('SHA-512'), formulaBlocked };
      });
      // Unprotect with the wrong password reports the trial message (the dialog closes first).
      await page.locator('.gc-command-palette-trigger-button').first().click(); // supervisor 2026-11-12: the text 'Command Palette' also matches the group caption (no-op click on both sides)
      await palette.locator('input').fill('unprotect sheet');
      await page.waitForTimeout(200);
      await palette.locator('input').press('Enter');
      const prompt = page.locator('.gc-designer-dialog').last();
      await prompt.locator('input').first().fill('wrong');
      await prompt.getByRole('button', { name: 'OK', exact: true }).click();
      const wrongMessage = await page.getByText('The password you supplied is not correct. Verify that the CAPS LOCK key is off and be sure to use the correct capitalization.').first().isVisible().catch(() => false);
      await page.getByRole('button', { name: 'OK', exact: true }).last().click().catch(() => undefined);
      await page.waitForTimeout(200);
      const stillProtected = await page.evaluate(() => !!(window as any).__designerCompare.spread.getActiveSheet().options.isProtected);
      // And the right password releases it.
      await page.locator('.gc-command-palette-trigger-button').first().click(); // supervisor 2026-11-12: the text 'Command Palette' also matches the group caption (no-op click on both sides)
      await palette.locator('input').fill('unprotect sheet');
      await page.waitForTimeout(200);
      await palette.locator('input').press('Enter');
      const again = page.locator('.gc-designer-dialog').last();
      await again.locator('input').first().fill('abc');
      await again.getByRole('button', { name: 'OK', exact: true }).click();
      await page.waitForTimeout(300);
      const released = await page.evaluate(() => ({
        isProtected: !!(window as any).__designerCompare.spread.getActiveSheet().options.isProtected,
        formula: (() => { const sheet = (window as any).__designerCompare.spread.getActiveSheet(); sheet.setFormula(0, 0, '=1+1'); return sheet.getValue(0, 0); })(),
      }));
      results.push({ protectedState, wrongMessage, stillProtected, released });
    } finally { await page.close(); }
  }
  const [official, ours] = results;
  expect(ours.protectedState).toEqual(official.protectedState);
  expect(ours.protectedState.isProtected).toBe(true);
  expect(ours.protectedState.hasHash).toBe(true);
  expect(ours.protectedState.algorithm).toBe(true);
  // supervisor 2026-11-12: the trial does not throw on setFormula for a protected sheet; parity is checked by the toEqual above.
  expect(ours.wrongMessage).toBe(true);
  expect(ours.stillProtected).toBe(true);
  expect(ours.released.isProtected).toBe(false);
  expect(ours.released.formula).toBe(official.released.formula);
});
