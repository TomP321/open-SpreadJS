// Black-box text ink bounds; only measured coordinates leave the screenshots.
import { PNG } from 'pngjs';
import fs from 'node:fs/promises';
import path from 'node:path';

process.env.PLAYWRIGHT_BROWSERS_PATH ??= path.resolve('.playwright-browsers');
const { chromium } = await import('@playwright/test');

const cases = [];
for (const hAlign of [0, 1, 2]) for (const vAlign of [0, 1, 2])
  for (const wordWrap of [false, true]) for (const textIndent of [0, 1, 2, 3])
    for (const size of [8, 11, 14, 20])
      for (const value of [wordWrap ? 'Quantity words wrap across several lines of text' : 'Quantity', 12345])
        cases.push({ hAlign, vAlign, wordWrap, textIndent, font: `${size}pt Calibri`, value });
for (const font of ['bold 11pt Calibri', 'italic 11pt Calibri', 'bold italic 11pt Calibri'])
  for (const value of ['Quantity', 12345]) cases.push({ hAlign: 0, vAlign: 1, wordWrap: false, textIndent: 0, font, value });
const browser = await chromium.launch({ headless: true });
const output = [];
for (const dpr of [1, 2]) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 800 }, deviceScaleFactor: dpr });
  await page.goto('http://127.0.0.1:5174/?scenario=empty');
  await page.waitForFunction(() => window.__compare?.ready);
  for (let start = 0; start < cases.length; start += 15) {
    const batch = cases.slice(start, start + 15);
    const geometry = await page.evaluate(async batch => {
      const result = {};
      for (const pane of ['official', 'ours']) {
        const wb = window.__compare[pane], s = wb.getActiveSheet();
        wb.suspendPaint();
        s.options.allowCellOverflow = false;
        for (let c = 0; c < 3; c++) s.setColumnWidth(c, 150);
        for (let r = 0; r < 5; r++) s.setRowHeight(r, 66);
        for (let i = 0; i < 15; i++) {
          const r = Math.floor(i / 3), c = i % 3, item = batch[i];
          s.setValue(r, c, item?.value ?? null);
          const style = new (pane === 'official' ? window.__referenceGC : window.__implementationGC).Spread.Sheets.Style();
          if (item) Object.assign(style, item);
          s.setStyle(r, c, style);
        }
        s.setActiveCell(10, 5);
        wb.resumePaint(); wb.refresh();
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const root = document.getElementById(`${pane}-pane`).getBoundingClientRect();
        result[pane] = batch.map((_, i) => {
          const rect = s.getCellRect(Math.floor(i / 3), i % 3);
          return { x: rect.x + root.x, y: rect.y + root.y, width: rect.width, height: rect.height };
        });
      }
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return result;
    }, batch);
    const screenshot = PNG.sync.read(await page.screenshot());
    function bounds(rect) {
      const left = Math.round(rect.x * dpr), top = Math.round(rect.y * dpr);
      const width = Math.round(rect.width * dpr), height = Math.round(rect.height * dpr);
      let minX = width, minY = height, maxX = -1, maxY = -1;
      for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) {
        const p = ((top + y) * screenshot.width + left + x) * 4;
        if (screenshot.data[p] < 200 && screenshot.data[p + 1] < 200 && screenshot.data[p + 2] < 200) {
          minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
        }
      }
      return maxX < 0 ? null : { left: minX, top: minY, right: width - 1 - maxX, bottom: height - 1 - maxY };
    }
    for (let i = 0; i < batch.length; i++) output.push({ dpr, ...batch[i], official: bounds(geometry.official[i]), ours: bounds(geometry.ours[i]) });
  }
  await page.close();
}
await browser.close();
await fs.mkdir('test-results/compare', { recursive: true });
await fs.writeFile('test-results/compare/text-insets.json', JSON.stringify(output, null, 2) + '\n');
const failures = output.filter(row => !row.official || !row.ours || Object.keys(row.official).some(side => Math.abs(row.official[side] - row.ours[side]) > (row.dpr === 1 ? 0 : 1)));
console.log(JSON.stringify({ total: output.length, failures: failures.length, sample: failures.slice(0, 12) }, null, 2));
if (process.argv.includes('--assert') && failures.length) process.exitCode = 1;
