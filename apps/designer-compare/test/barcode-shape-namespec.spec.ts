/* eslint-disable @typescript-eslint/no-explicit-any */
/* Task 10 paired spec: barcode cells fit their (merged) cell, shapes follow row
 * resizes (dynamicMove/dynamicSize defaults) and the name box shows the shape
 * name. Runs the supervisor's exact repro script on BOTH sides and compares:
 *  - the dark-pixel bounding box inside every barcode cell (tolerance 6 px),
 *  - that OURS paints no dark pixel outside the merged barcode cells,
 *  - the shape height after setRowHeight,
 *  - the name box text after a real mouse click on the shape.
 * Canvas pixels are only measured at run time; nothing is stored in the repo. */
import { expect, test, type Page } from '@playwright/test';
import { boot } from './helpers.js';

interface CellMeasure { x: number; y: number; w: number; h: number }
interface SideResult {
  codes: Record<string, CellMeasure | null>;
  outsideDark: number;
  shapeHeight: number;
  nameBox: string;
}

const CELLS: Record<string, [number, number]> = { CODE128: [7, 1], PDF417: [7, 3], DATAMATRIX: [13, 1], CODE39: [13, 3] };

async function run(page: Page, side: 'official' | 'ours'): Promise<SideResult> {
  await boot(page, side);
  await page.evaluate(() => {
    const spread = (window as any).__designerCompare.spread;
    const s = spread.getActiveSheet();
    s.shapes.add('S1', (window as any).GC.Spread.Sheets.Shapes.AutoShapeType.rectangle, 620, 120, 160, 90);
    s.setRowHeight(7, 100); s.setRowHeight(13, 100);
    s.addSpan(7, 1, 1, 2); s.addSpan(7, 3, 1, 2); s.addSpan(13, 1, 1, 2); s.addSpan(13, 3, 1, 2);
    s.setFormula(7, 1, '=BC_CODE128("ABC-1234")'); s.setFormula(7, 3, '=BC_PDF417("Hello 42")');
    s.setFormula(13, 1, '=BC_DataMatrix("Hello 42")'); s.setFormula(13, 3, '=BC_CODE39("ABC123")');
  });
  await page.waitForTimeout(400);
  const measures = await page.evaluate((cells: Record<string, number[]>) => {
    const s = (window as any).__designerCompare.spread.getActiveSheet();
    // The base canvas: the large one with the most dark opaque pixels (both sides
    // stack a selection overlay on top of the painted sheet).
    let canvas: HTMLCanvasElement | null = null;
    let bestDark = -1;
    for (const c of Array.from(document.querySelectorAll('canvas'))) {
      if (c.width < 800 || c.height < 300) continue;
      const ctx = c.getContext('2d');
      if (!ctx) continue;
      const data = ctx.getImageData(0, 0, c.width, c.height).data;
      let dark = 0;
      for (let i = 0; i < data.length; i += 4) if (data[i + 3] > 128 && data[i] < 100 && data[i + 1] < 100 && data[i + 2] < 100) dark++;
      if (dark > bestDark) { bestDark = dark; canvas = c; }
    }
    if (!canvas) throw new Error('no painted canvas found');
    const ctx = canvas.getContext('2d')!;
    const d = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const W = canvas.width;
    const dark = (x: number, y: number): boolean => { const i = (y * W + x) * 4; return d[i + 3] > 128 && d[i] < 100 && d[i + 1] < 100 && d[i + 2] < 100; };
    const rects: Record<string, { x: number; y: number; w: number; h: number }> = {};
    for (const [name, [row, col]] of Object.entries(cells)) {
      const rc = s.getCellRect(row, col);
      rects[name] = { x: Math.round(rc.x), y: Math.round(rc.y), w: Math.round(rc.width), h: Math.round(rc.height) };
    }
    const codes: Record<string, CellMeasure | null> = {};
    for (const [name, r] of Object.entries(rects)) {
      let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9, count = 0;
      for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) if (dark(x, y)) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; count++; }
      codes[name] = count ? { x: minX - r.x, y: minY - r.y, w: maxX - minX + 1, h: maxY - minY + 1 } : null;
    }
    // Dark pixels outside every merged barcode cell, inside the two row bands.
    const inCell = (x: number, y: number): boolean => Object.values(rects).some(r => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
    let outside = 0;
    for (const r of Object.values(rects)) {
      for (let y = r.y; y < r.y + r.h; y++) {
        for (let x = 40; x < r.x; x++) if (!inCell(x, y) && dark(x, y)) outside++;
        for (let x = r.x + r.w; x < canvas.width; x++) if (!inCell(x, y) && dark(x, y)) outside++;
      }
    }
    const shape = s.shapes.get('S1');
    return { codes, outsideDark: outside, shapeHeight: Number(shape.height()) };
  }, CELLS as unknown as Record<string, number[]>);
  // Real mouse click on the shape (sheet point 620+80, 120+85, plus the 40x20 header
  // offset of the canvas frame, plus the canvas position in the page).
  const canvasBox = await page.evaluate(() => {
    let best: DOMRect | null = null;
    let area = 0;
    for (const c of Array.from(document.querySelectorAll('canvas'))) {
      const r = c.getBoundingClientRect();
      if (r.width * r.height > area) { area = r.width * r.height; best = r; }
    }
    return { x: best!.x, y: best!.y };
  });
  await page.mouse.click(canvasBox.x + 40 + 700, canvasBox.y + 20 + 205);
  await page.waitForTimeout(300);
  const nameBox = await page.locator('.gc-name-box-selector').first().inputValue();
  return { ...measures, nameBox };
}

const TOLERANCE = 6;

test('barcode cells fit the cell, shapes follow row resize, name box shows the shape', async ({ page }) => {
  test.setTimeout(180_000);
  const official = await run(page, 'official');
  const ours = await run(page, 'ours');

  for (const name of Object.keys(CELLS)) {
    const a = official.codes[name], b = ours.codes[name];
    expect(b, `${name}: ours painted nothing`).not.toBeNull();
    expect(a, `${name}: official painted nothing`).not.toBeNull();
    for (const key of ['x', 'y', 'w', 'h'] as const)
      expect(Math.abs(a![key] - b![key]), `${name} ${key}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`).toBeLessThanOrEqual(TOLERANCE);
  }
  // Nothing overflows the merged cells on ours (the trial clips the same way;
  // the official count is reported for the record).
  expect(ours.outsideDark, `ours painted ${ours.outsideDark} dark px outside the cells`).toBe(0);
  expect(ours.shapeHeight, `official shape height is ${official.shapeHeight}`).toBe(official.shapeHeight);
  expect(ours.shapeHeight).toBe(170);
  expect(official.nameBox).toBe('S1');
  expect(ours.nameBox).toBe('S1');
});
