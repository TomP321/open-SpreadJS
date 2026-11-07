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

test('dragged function reference commits and Escape cancels', async ({ page }) => {
  const results: unknown[] = [];
  for (const side of ['official', 'ours'] as const) {
    const pane = await setup(page, side);
    await page.mouse.click(pane.x + 311, pane.y + 110);
    await page.keyboard.type('=SUM');
    const states: unknown[] = [];
    const state = async () => ({ text: await editingText(page, side), ...(await page.evaluate(side => {
      const sheet = window.__compare![side].getActiveSheet();
      return { editing: sheet.isEditing(), formula: sheet.getFormula(4, 4) ?? null, value: sheet.getValue(4, 4) ?? null, row: sheet.getActiveRowIndex(), col: sheet.getActiveColumnIndex() };
    }, side)) });
    states.push(await state());
    await page.keyboard.press('Tab'); states.push(await state());
    await page.mouse.move(pane.x + 311, pane.y + 250); await page.mouse.down();
    await page.mouse.move(pane.x + 311, pane.y + 290, { steps: 5 }); await page.mouse.up(); states.push(await state());
    await page.keyboard.press('Enter');
    states.push(await page.evaluate(side => { const s = window.__compare![side].getActiveSheet(); return { editing: s.isEditing(), formula: s.getFormula(4, 4) ?? null, value: s.getValue(4, 4) ?? null, row: s.getActiveRowIndex(), col: s.getActiveColumnIndex() }; }, side));
    await page.keyboard.type('=SUM'); await page.keyboard.press('Escape');
    states.push(await page.evaluate(side => { const s = window.__compare![side].getActiveSheet(); return { editing: s.isEditing(), formula: s.getFormula(5, 4) ?? null, value: s.getValue(5, 4) ?? null, row: s.getActiveRowIndex(), col: s.getActiveColumnIndex() }; }, side));
    results.push(states);
  }
  expect(results[1]).toEqual(results[0]);
});

test('formula bar points at a range', async ({ page }) => {
  const results: unknown[] = [];
  for (const side of ['official', 'ours'] as const) {
    await page.goto('/?scenario=m5-controls'); await page.waitForFunction(() => window.__compare?.ready);
    const pane = (await page.locator(`#${side}-pane`).boundingBox())!;
    await page.mouse.click(pane.x + 311, pane.y + 110);
    await page.mouse.click(pane.x + 150, pane.y + 402); await page.keyboard.press('Control+A'); await page.keyboard.type('=SUM(');
    await page.mouse.move(pane.x + 311, pane.y + 250); await page.mouse.down(); await page.mouse.move(pane.x + 311, pane.y + 290, { steps: 5 }); await page.mouse.up();
    const text = await page.evaluate(side => { const lib = side === 'official' ? window.__referenceGC : window.__implementationGC; const host = document.querySelectorAll<HTMLElement>(`#${side}-pane [data-m5-control]`)[1]; return lib.Spread.Sheets.FormulaTextBox.findControl(host).text(); }, side);
    await page.keyboard.press('Enter');
    const state = await page.evaluate(side => { const s = window.__compare![side].getActiveSheet(); return { editing: s.isEditing(), formula: s.getFormula(4, 4) ?? null, value: s.getValue(4, 4) ?? null, row: s.getActiveRowIndex(), col: s.getActiveColumnIndex() }; }, side);
    results.push({ text, state });
  }
  expect(results[1]).toEqual(results[0]);
});

test('pointing on another sheet commits a qualified reference', async ({ page }) => {
  const results: unknown[] = [];
  for (const side of ['official', 'ours'] as const) {
    await page.goto('/?scenario=multiple-sheets'); await page.waitForFunction(() => window.__compare?.ready);
    const pane = (await page.locator(`#${side}-pane`).boundingBox())!;
    await page.mouse.click(pane.x + 311, pane.y + 110); await page.keyboard.type('=SUM(');
    await page.mouse.click(pane.x + 200, pane.y + 505);
    const sheet = await page.evaluate(side => window.__compare![side].getActiveSheet().name(), side);
    await page.mouse.click(pane.x + 130, pane.y + 50); const text = await editingText(page, side);
    await page.keyboard.press('Enter');
    const state = await page.evaluate(side => { const w = window.__compare![side], s = w.getSheet(0); return { active: w.getActiveSheet().name(), editing: s.isEditing(), formula: s.getFormula(4, 4) ?? null, value: s.getValue(4, 4) ?? null, row: s.getActiveRowIndex(), col: s.getActiveColumnIndex() }; }, side);
    results.push({ sheet, text, state });
  }
  expect(results[1]).toEqual(results[0]);
});

test('Escape cancels a pointed formula and restores the original value', async ({ page }) => {
  const results: unknown[] = [];
  for (const side of ['official', 'ours'] as const) {
    const pane = await setup(page, side);
    await page.mouse.click(pane.x + 311, pane.y + 110); await page.keyboard.type('42'); await page.keyboard.press('Enter');
    await page.mouse.click(pane.x + 311, pane.y + 110); await page.keyboard.type('=SUM'); await page.keyboard.press('Tab');
    await page.mouse.move(pane.x + 311, pane.y + 250); await page.mouse.down(); await page.mouse.move(pane.x + 311, pane.y + 290, { steps: 5 }); await page.mouse.up();
    const text = await editingText(page, side); await page.keyboard.press('Escape');
    const state = await page.evaluate(side => { const s = window.__compare![side].getActiveSheet(); return { editing: s.isEditing(), formula: s.getFormula(4, 4) ?? null, value: s.getValue(4, 4) ?? null, row: s.getActiveRowIndex(), col: s.getActiveColumnIndex() }; }, side);
    results.push({ text, state });
  }
  expect(results[1]).toEqual(results[0]);
});

test('popup Escape and typing after a pointed reference match the trial', async ({ page }) => {
  const results: unknown[] = [];
  for (const side of ['official', 'ours'] as const) {
    const pane = await setup(page, side);
    const state = async () => {
      const data = await page.evaluate(side => {
        const s = window.__compare![side].getActiveSheet();
        return { editing: s.isEditing(), formula: s.getFormula(4, 4) ?? null, value: s.getValue(4, 4) ?? null, row: s.getActiveRowIndex(), col: s.getActiveColumnIndex(), selections: s.getSelections().map(r => [r.row, r.col, r.rowCount, r.colCount]) };
      }, side);
      return { ...data, text: data.editing ? await editingText(page, side) : null };
    };
    const steps: unknown[] = [];
    await page.mouse.click(pane.x + 311, pane.y + 110); steps.push(await state());
    await page.keyboard.type('=SUM'); steps.push(await state());
    await page.keyboard.press('Escape'); steps.push(await state());
    await page.keyboard.type('=SUM'); await page.keyboard.press('Tab'); steps.push(await state());
    await page.mouse.move(pane.x + 311, pane.y + 250); await page.mouse.down(); await page.mouse.move(pane.x + 311, pane.y + 290, { steps: 5 }); await page.mouse.up(); steps.push(await state());
    await page.keyboard.type(')+1'); steps.push(await state());
    await page.keyboard.press('Enter'); steps.push(await state());
    results.push(steps);
  }
  expect(results[1]).toEqual(results[0]);
});
