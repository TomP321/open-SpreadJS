import { test, expect } from '@playwright/test';

test('trial edit undo and redo restore the edited cell and selection', async ({ page }) => {
  const observations = [];
  for (const pane of ['official', 'ours'] as const) {
    // Isolate the two editors: the trial refocuses its editor asynchronously after redo.
    await page.goto('/?scenario=empty'); await page.waitForFunction(() => window.__compare?.ready);
    const box = (await page.locator(`#${pane}-pane`).boundingBox())!;
    await page.mouse.click(box.x + 180, box.y + 70);
    await page.keyboard.type('42'); await page.keyboard.press('Enter');
    expect(await page.evaluate(pane => window.__compare![pane].getActiveSheet().getValue(2, 2), pane)).toBe(42);
    observations.push(await page.evaluate(pane => {
      const wb = window.__compare![pane], s = wb.getActiveSheet();
      const snapshot = () => ({ active: [s.getActiveRowIndex(), s.getActiveColumnIndex()], selection: s.getSelections(), value: s.getValue(2, 2) });
      s.setSelection(8, 5, 2, 3); wb.undoManager().undo(); const undo = snapshot();
      s.setSelection(9, 6, 3, 2); wb.undoManager().redo(); return { undo, redo: snapshot() };
    }, pane));
  }
  expect(observations[1]).toEqual(observations[0]);
  expect(observations[0]).toEqual({ undo: { active: [2, 2], selection: [{ row: 2, col: 2, rowCount: 1, colCount: 1 }], value: null }, redo: { active: [2, 2], selection: [{ row: 2, col: 2, rowCount: 1, colCount: 1 }], value: 42 } });
});
