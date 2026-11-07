import { test, expect, type Page } from '@playwright/test';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

type Side = 'official' | 'ours';
async function setup(page: Page, side: Side) {
  await page.goto('/?scenario=empty'); await page.waitForFunction(() => window.__compare?.ready);
  const pane = (await page.locator(`#${side}-pane`).boundingBox())!;
  await page.mouse.click(pane.x + 55, pane.y + 30);
  return pane;
}
async function editingText(page: Page, side: Side) {
  if (side === 'ours') return page.locator('#ours-pane .gc-cell-editor').inputValue();
  return page.locator('#official-pane [contenteditable=true]').evaluateAll(elements => elements.find(e => e.textContent?.startsWith('='))?.textContent ?? '');
}

test('point selection replaces, appends, and extends references', async ({ page }) => {
  const results: unknown[] = [];
  for (const side of ['official', 'ours'] as const) {
    const pane = await setup(page, side); await page.keyboard.type('=');
    await page.mouse.click(pane.x + 130, pane.y + 50);
    const first = await editingText(page, side);
    await page.mouse.click(pane.x + 195, pane.y + 70);
    const replacement = await editingText(page, side);
    await page.keyboard.down('Control'); await page.mouse.click(pane.x + 130, pane.y + 90); await page.keyboard.up('Control');
    const appended = await editingText(page, side);
    await page.keyboard.press('Enter');
    const committed = await page.evaluate(side => { const wb = window.__compare![side], sheet = wb.getActiveSheet(); const value = sheet.getValue(0, 0); return { formula: sheet.getFormula(0, 0), value: value && typeof value === 'object' ? (value as { error?: string; _error?: string }).error ?? (value as { _error?: string })._error : value, sheet: sheet.name() }; }, side);
    results.push({ first, replacement, appended, committed });
  }
  expect(results[1]).toEqual(results[0]);
});

test('reference range border pixels match', async ({ page }) => {
  const captures: Buffer[] = [];
  for (const side of ['official', 'ours'] as const) {
    const pane = await setup(page, side); await page.keyboard.type('=');
    await page.mouse.move(pane.x + 130, pane.y + 50); await page.mouse.down();
    await page.mouse.move(pane.x + 195, pane.y + 90, { steps: 5 }); await page.mouse.up();
    expect(await editingText(page, side)).toBe('=B2:C4');
    captures.push(await page.screenshot({ clip: { x: pane.x + 98, y: pane.y + 39, width: 128, height: 61 } }));
  }
  const reference = PNG.sync.read(captures[0]), actual = PNG.sync.read(captures[1]);
  const pixels = pixelmatch(reference.data, actual.data, null, reference.width, reference.height, { threshold: 0.1 });
  console.log(`reference border: ${pixels}/${reference.width * reference.height} pixels (${(pixels / (reference.width * reference.height) * 100).toFixed(3)}%)`);
  expect(pixels / (reference.width * reference.height)).toBeLessThan(0.005);
});
