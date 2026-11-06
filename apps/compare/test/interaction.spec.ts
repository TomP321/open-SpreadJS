import fs from 'node:fs/promises';
import path from 'node:path';
import { test, expect, type Page } from '@playwright/test';

async function open(page: Page) { await page.goto('/?scenario=empty'); await page.waitForFunction(() => window.__compare?.ready); }
async function cell(page: Page, row: number, col: number) {
  const pane = await page.locator('#ours-pane').boundingBox();
  return { x: pane!.x + 40 + col * 62 + 15, y: pane!.y + 20 + row * 20 + 10 };
}
async function clickCell(page: Page, row: number, col: number) { const { x, y } = await cell(page, row, col); await page.mouse.click(x, y); }

test('user edit lifecycle, cancel, multiline, navigation and undo/redo', async ({ page }) => {
  await open(page);
  await page.evaluate(() => {
    const wb = window.__compare!.ours;
    (window as unknown as { editEvents: string[] }).editEvents = [];
    for (const event of ['EditStarting', 'EditStarted', 'EditEnding', 'ValueChanged', 'EditEnded']) wb.bind(event, () => (window as unknown as { editEvents: string[] }).editEvents.push(event));
  });
  await clickCell(page, 2, 2);
  await page.keyboard.type('42'); await page.keyboard.press('Enter');
  expect(await page.evaluate(() => {
    const s = window.__compare!.ours.getActiveSheet();
    return { value: s.getValue(2, 2), active: [s.getActiveRowIndex(), s.getActiveColumnIndex()], events: (window as unknown as { editEvents: string[] }).editEvents };
  })).toEqual({ value: 42, active: [3, 2], events: ['EditStarting', 'EditStarted', 'EditEnding', 'ValueChanged', 'EditEnded'] });
  await page.keyboard.press('ArrowUp'); await page.keyboard.press('F2'); await page.keyboard.press('Control+A'); await page.keyboard.type('cancelled'); await page.keyboard.press('Escape');
  expect(await page.evaluate(() => window.__compare!.ours.getActiveSheet().getValue(2, 2))).toBe(42);
  await page.keyboard.press('Control+z'); expect(await page.evaluate(() => window.__compare!.ours.getActiveSheet().getValue(2, 2))).toBeNull();
  await page.keyboard.press('Control+y'); expect(await page.evaluate(() => window.__compare!.ours.getActiveSheet().getValue(2, 2))).toBe(42);
  await clickCell(page, 4, 1); await page.keyboard.type('line 1'); await page.keyboard.press('Alt+Enter'); await page.keyboard.type('line 2'); await page.keyboard.press('Tab');
  expect(await page.evaluate(() => window.__compare!.ours.getActiveSheet().getValue(4, 1))).toBe('line 1\nline 2');
});

test('mouse, keyboard, multiple ranges, headers, hidden rows and selection policy', async ({ page }) => {
  await open(page); await clickCell(page, 2, 2);
  await page.keyboard.press('Shift+ArrowRight'); await page.keyboard.press('Shift+ArrowDown');
  expect(await page.evaluate(() => window.__compare!.ours.getActiveSheet().getSelections())).toEqual([{ row: 2, col: 2, rowCount: 2, colCount: 2 }]);
  await page.keyboard.down('Control'); await clickCell(page, 6, 4); await page.keyboard.up('Control');
  expect(await page.evaluate(() => window.__compare!.ours.getActiveSheet().getSelections().length)).toBe(2);
  const box = (await page.locator('#ours-pane').boundingBox())!;
  await page.mouse.click(box.x + 15, box.y + 90);
  expect(await page.evaluate(() => window.__compare!.ours.getActiveSheet().getSelections()[0].col)).toBe(-1);
  await page.mouse.click(box.x + 15, box.y + 10);
  expect(await page.evaluate(() => window.__compare!.ours.getActiveSheet().getSelections()[0])).toEqual({ row: -1, col: -1, rowCount: -1, colCount: -1 });
  await page.evaluate(() => { const s = window.__compare!.ours.getActiveSheet(); s.setRowVisible(3, false); s.setActiveCell(2, 2); });
  await page.keyboard.press('ArrowDown'); expect(await page.evaluate(() => window.__compare!.ours.getActiveSheet().getActiveRowIndex())).toBe(4);
});

test('clipboard includes TSV and HTML, paste events, cut indicator and undo', async ({ page }) => {
  await open(page);
  const copy = await page.evaluate(() => {
    const s = window.__compare!.ours.getActiveSheet();
    s.setArray(0, 0, [['<tag>', 'multi\nline'], [2, 3]]); s.setSelection(0, 0, 2, 2);
    const data = new DataTransfer(); document.querySelector('#ours-pane .opensheets-viewport')!.dispatchEvent(new ClipboardEvent('copy', { clipboardData: data, bubbles: true, cancelable: true }));
    return { text: data.getData('text/plain'), html: data.getData('text/html') };
  });
  expect(copy.text).toBe('<tag>\t"multi\nline"\r\n2\t3'); expect(copy.html).toContain('&lt;tag&gt;');
  await page.evaluate(() => {
    const s = window.__compare!.ours.getActiveSheet(); s.setActiveCell(5, 2);
    const data = new DataTransfer(); data.setData('text/plain', '5\t6\n7\t8');
    document.querySelector('#ours-pane .opensheets-viewport')!.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
  });
  expect(await page.evaluate(() => window.__compare!.ours.getActiveSheet().getArray(5, 2, 2, 2))).toEqual([[5, 6], [7, 8]]);
  await page.evaluate(() => window.__compare!.ours.undoManager().undo());
  expect(await page.evaluate(() => window.__compare!.ours.getActiveSheet().getValue(5, 2))).toBeNull();
});

test('header resize, measured auto-fit, fill series, tab activation and creation', async ({ page }) => {
  await open(page); const box = (await page.locator('#ours-pane').boundingBox())!;
  await page.evaluate(() => { (window as unknown as { resizeEvents: unknown[] }).resizeEvents = []; window.__compare!.ours.bind('ColumnWidthChanged', (_event: unknown, info: { colList: number[]; header: boolean }) => (window as unknown as { resizeEvents: unknown[] }).resizeEvents.push({ colList: info.colList, header: info.header })); });
  await page.mouse.move(box.x + 101, box.y + 10); await page.mouse.down(); await page.mouse.move(box.x + 131, box.y + 10, { steps: 4 }); await page.mouse.up();
  expect(await page.evaluate(() => window.__compare!.ours.getActiveSheet().getColumnWidth(0))).toBe(92);
  expect(await page.evaluate(() => (window as unknown as { resizeEvents: unknown[] }).resizeEvents)).toEqual([{ colList: [0], header: false }]);
  await page.evaluate(() => { const s = window.__compare!.ours.getActiveSheet(); s.setValue(0, 0, 'A much wider label to fit'); s.autoFitColumn(0); });
  expect(await page.evaluate(() => window.__compare!.ours.getActiveSheet().getColumnWidth(0))).toBeGreaterThan(120);
  await page.evaluate(() => { const s = window.__compare!.ours.getActiveSheet(); s.setColumnWidth(0, 62); s.setArray(0, 0, [[1], [2]]); s.setSelection(0, 0, 2, 1); });
  await page.waitForTimeout(50);
  await page.mouse.move(box.x + 101, box.y + 59); await page.mouse.down(); await page.mouse.move(box.x + 80, box.y + 110, { steps: 5 }); await page.mouse.up();
  expect(await page.evaluate(() => window.__compare!.ours.getActiveSheet().getArray(0, 0, 5, 1))).toEqual([[1], [2], [3], [4], [5]]);
  await page.mouse.click(box.x + 203, box.y + 506);
  expect(await page.evaluate(() => window.__compare!.ours.getSheetCount())).toBe(2);
  expect(await page.evaluate(() => window.__compare!.ours.getActiveSheetIndex())).toBe(1);
});

test('paint suspension, HiDPI and scrolling a populated million-row sheet', async ({ page }) => {
  await open(page);
  const result = await page.evaluate(async () => {
    const wb = window.__compare!.ours, s = wb.getActiveSheet();
    const view = (wb as unknown as { _renderer(): { metrics: { frames: number; lastFrameMs: number; paintedCells: number }; canvas: HTMLCanvasElement } })._renderer();
    wb.suspendPaint(); s.setRowCount(1_000_000); s.setColumnCount(16384);
    for (let row = 0; row < 200_000; row++) s.setValue(row, 0, row);
    const before = view.metrics.frames;
    await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame);
    const during = view.metrics.frames;
    wb.resumePaint(); await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame);
    const renderTimes: number[] = [], frameIntervals: number[] = [];
    let previous = performance.now();
    for (let i = 0; i < 90; i++) {
      s.scroll(60, i % 10 === 0 ? 62 : 0);
      await new Promise(requestAnimationFrame);
      const now = performance.now(); frameIntervals.push(now - previous); previous = now;
      renderTimes.push(view.metrics.lastFrameMs);
    }
    const percentile = (values: number[], p: number) => [...values].sort((a, b) => a - b)[Math.floor(values.length * p)];
    return { before, during, frames: view.metrics.frames, paintedCells: view.metrics.paintedCells, p95RenderMs: percentile(renderTimes, 0.95), maxRenderMs: Math.max(...renderTimes), p95IntervalMs: percentile(frameIntervals, 0.95), renderTimes, frameIntervals, dpr: devicePixelRatio, canvasWidth: view.canvas.width, cssWidth: parseFloat(view.canvas.style.width) };
  });
  await fs.mkdir(path.resolve('../../test-results/compare'), { recursive: true });
  await fs.writeFile(path.resolve('../../test-results/compare/performance.json'), JSON.stringify(result, null, 2));
  expect(result.during).toBe(result.before);
  expect(result.paintedCells).toBeLessThan(2000);
  expect(result.canvasWidth).toBe(Math.round(result.cssWidth * result.dpr));
  expect(result.p95RenderMs).toBeLessThan(16);
  expect(result.maxRenderMs).toBeLessThan(16);
  expect(result.p95IntervalMs).toBeLessThan(25);
});

test('cut/paste and drag-drop preserve cells and support undo, while clear-all stays sparse', async ({ page }) => {
  await open(page);
  await page.evaluate(() => {
    const wb = window.__compare!.ours, s = wb.getActiveSheet();
    s.setValue(0, 0, 'source'); s.setValue(4, 2, 'destination'); s.setSelection(0, 0, 1, 1);
    const root = document.querySelector('#ours-pane .opensheets-viewport')!;
    const clipboard = new DataTransfer(); root.dispatchEvent(new ClipboardEvent('cut', { clipboardData: clipboard, bubbles: true, cancelable: true }));
    s.setActiveCell(4, 2); root.dispatchEvent(new ClipboardEvent('paste', { clipboardData: clipboard, bubbles: true, cancelable: true }));
  });
  expect(await page.evaluate(() => window.__compare!.ours.getActiveSheet().getValue(4, 2))).toBe('source');
  await page.evaluate(() => window.__compare!.ours.undoManager().undo());
  expect(await page.evaluate(() => { const s = window.__compare!.ours.getActiveSheet(); return [s.getValue(0, 0), s.getValue(4, 2)]; })).toEqual(['source', 'destination']);
  await page.evaluate(() => window.__compare!.ours.getActiveSheet().setSelection(0, 0, 1, 1));
  await page.waitForTimeout(30);
  const box = (await page.locator('#ours-pane').boundingBox())!;
  await page.mouse.move(box.x + 70, box.y + 20); await page.mouse.down(); await page.mouse.move(box.x + 194, box.y + 80, { steps: 6 }); await page.mouse.up();
  expect(await page.evaluate(() => window.__compare!.ours.getActiveSheet().getValue(3, 2))).toBe('source');
  await page.keyboard.press('Control+z');
  await page.evaluate(() => { const s = window.__compare!.ours.getActiveSheet(); s.setRowCount(1_000_000); s.setColumnCount(16384); s.setSelection(-1, -1, -1, -1); window.__compare!.ours.focus(); });
  await page.keyboard.press('Delete');
  expect(await page.evaluate(() => window.__compare!.ours.getActiveSheet().getValue(0, 0))).toBeNull();
  await page.keyboard.press('Control+z');
  expect(await page.evaluate(() => window.__compare!.ours.getActiveSheet().getValue(0, 0))).toBe('source');
});

test('cancellable edit, custom shortcuts, public resize events and zoom gestures', async ({ page }) => {
  await open(page);
  await page.evaluate(() => {
    const wb = window.__compare!.ours, s = wb.getActiveSheet();
    s.bind('EditStarting.block', (_event: unknown, info: { cancel: boolean }) => { info.cancel = true; });
    wb.focus(); s.startEdit();
  });
  expect(await page.evaluate(() => window.__compare!.ours.getActiveSheet().isEditing())).toBe(false);
  await page.evaluate(() => {
    const wb = window.__compare!.ours; wb.getActiveSheet().unbind('EditStarting.block');
    wb.commandManager().register('custom', { execute: () => { wb.getActiveSheet().setValue(8, 8, 'shortcut'); return true; } }, 75, true);
  });
  await page.keyboard.press('Control+k');
  expect(await page.evaluate(() => window.__compare!.ours.getActiveSheet().getValue(8, 8))).toBe('shortcut');
  await page.evaluate(() => document.querySelector('#ours-pane .opensheets-viewport')!.dispatchEvent(new WheelEvent('wheel', { ctrlKey: true, deltaY: -100, cancelable: true, bubbles: true })));
  expect(await page.evaluate(() => window.__compare!.ours.getActiveSheet().zoom())).toBe(1.1);
});

test.describe('HiDPI backing canvas', () => {
  test.use({ deviceScaleFactor: 2 });
  test('keeps CSS geometry and doubles backing pixels', async ({ page }) => {
    await open(page);
    const size = await page.locator('#ours-pane .gc-sheet-canvas').evaluate((canvas: HTMLCanvasElement) => ({ actual: canvas.width, css: parseFloat(canvas.style.width), dpr: devicePixelRatio }));
    expect(size.dpr).toBe(2); expect(size.actual).toBe(size.css * 2);
    await clickCell(page, 2, 2); await page.keyboard.type('HiDPI'); await page.keyboard.press('Enter');
    expect(await page.evaluate(() => window.__compare!.ours.getActiveSheet().getValue(2, 2))).toBe('HiDPI');
  });
});
