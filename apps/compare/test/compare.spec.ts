import fs from 'node:fs/promises';
import path from 'node:path';
import { PNG } from 'pngjs';
import { test, expect } from '@playwright/test';
import { comparePanes, limits } from './pixel-report.js';
import { scenarios } from '../src/scenarios/index.js';

for (const dpr of [1, 2]) {
  test.describe(`DPR ${dpr}`, () => {
  test.use({ deviceScaleFactor: dpr });
  for (const scenario of scenarios) {
    test(`${scenario.name}: capture both black-box panes`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(`/?scenario=${scenario.name}`);
      await page.waitForFunction(() => window.__compare?.ready);
      expect(errors).toEqual([]);
      const snapshots = await page.evaluate(() => {
        const state = window.__compare!;
        const snapshot = (workbook: typeof state.ours) => workbook.sheets.map(sheet => ({
          name: sheet.name(), values: Array.from({ length: 4 }, (_, r) => Array.from({ length: 3 }, (_, c) => sheet.getValue(r, c))),
        }));
        return { official: snapshot(state.official), ours: snapshot(state.ours) };
      });
      expect(snapshots.ours).toEqual(snapshots.official);
      const nameResults = await page.evaluate(() => {
        const state = window.__compare!;
        const observe = (workbook: typeof state.ours) => {
          const sheet = workbook.getActiveSheet();
          const name = String(sheet.name());
          const result = sheet.name(`${name} renamed`);
          const renamed = sheet.name();
          sheet.name(name);
          return { renamed, returnKind: result === sheet ? 'sheet' : result === undefined ? 'undefined' : typeof result };
        };
        return { official: observe(state.official), ours: observe(state.ours) };
      });
      expect(nameResults.ours).toEqual(nameResults.official);
      const directory = path.resolve('../../test-results/compare');
      await fs.mkdir(directory, { recursive: true });
      await fs.writeFile(path.join(directory, `${scenario.name}.json`), JSON.stringify(snapshots, null, 2) + '\n');
      const glyphCells = scenario.glyphCells ?? [];
      const regions = await page.evaluate((glyphCells) => {
        const boxes: { x: number; y: number; width: number; height: number }[] = [];
        const glyphBoxes: { x: number; y: number; width: number; height: number }[] = [];
        const host = document.getElementById('official-pane')!;
        const width = host.clientWidth - 22, height = host.clientHeight - 28;
        const clip = (rect: { x: number; y: number; width: number; height: number }) => {
          const left = Math.max(0, rect.x), top = Math.max(0, rect.y);
          const right = Math.min(width, rect.x + rect.width), bottom = Math.min(height, rect.y + rect.height);
          return { x: left, y: top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
        };
        type GlyphSheet = { getCellRect(row: number, col: number): { x: number; y: number; width: number; height: number } };
        const addGlyphCell = (s: GlyphSheet, cell: [number, number, number, number]) => {
          const [row, col, rowCount, colCount] = cell;
          if (rowCount <= 0 || colCount <= 0) return;
          const first = s.getCellRect(row, col), last = s.getCellRect(row + rowCount - 1, col + colCount - 1);
          if (!first || !last) return;
          const rect = clip({ x: first.x, y: first.y, width: last.x + last.width - first.x, height: last.y + last.height - first.y });
          if (rect.width && rect.height) glyphBoxes.push(rect);
        };
        let headerWidth = 0, headerHeight = 0;
        for (const wb of [window.__compare!.official, window.__compare!.ours]) {
          const s = wb.getActiveSheet(), first = s.getCellRect(0, 0);
          headerWidth = Math.max(headerWidth, first.x); headerHeight = Math.max(headerHeight, first.y);
          // Inspect visible public cells only. Explicit styles include borders and fills.
          const indexes = (start: number, end: number, leading: number, trailing: number, count: number) => [...new Set([
            ...Array.from({ length: leading }, (_, i) => i),
            ...Array.from({ length: Math.max(0, end - start + 1) }, (_, i) => start + i),
            ...Array.from({ length: trailing }, (_, i) => count - trailing + i),
          ])];
          const rows = indexes(s.getViewportTopRow(1), s.getViewportBottomRow(1), s.frozenRowCount(), s.frozenTrailingRowCount(), s.getRowCount());
          const cols = indexes(s.getViewportLeftColumn(1), s.getViewportRightColumn(1), s.frozenColumnCount(), s.frozenTrailingColumnCount(), s.getColumnCount());
          const spans = s.getSpans(), measure = document.createElement('canvas').getContext('2d')!;
          for (const r of rows) for (const c of cols) {
            const rect = s.getCellRect(r, c);
            if (!rect || ![rect.x, rect.y, rect.width, rect.height].every(Number.isFinite) || rect.width <= 0 || rect.height <= 0 || rect.x >= width || rect.y >= height) continue;
            const value = s.getValue(r, c), style = s.getActualStyle(r, c);
            if (value != null || s.getStyle(r, c) || s.getStyle(r, -1) || s.getStyle(-1, c) || spans.some(span => r >= span.row && r < span.row + span.rowCount && c >= span.col && c < span.col + span.colCount)) boxes.push(rect);
            if (typeof value === 'string' && !style.wordWrap && !style.shrinkToFit && s.options.allowCellOverflow) {
              measure.font = style.font ?? '11pt Calibri';
              const textWidth = measure.measureText(s.getText(r, c)).width * s.zoom() + 2;
              if (textWidth > rect.width) {
                const rightAligned = Number(style.hAlign) === 2, centered = Number(style.hAlign) === 1;
                const left = rightAligned || centered ? Math.max(0, rect.x - textWidth + rect.width) : rect.x;
                const right = rightAligned ? rect.x + rect.width : rect.x + Math.min(textWidth, width - rect.x);
                boxes.push({ x: left, y: rect.y, width: right - left, height: rect.height });
              }
            }
          }
          for (const range of s.getSelections()) {
            const start = s.getCellRect(Math.max(0, range.row), Math.max(0, range.col));
            const end = range.row < 0 || range.col < 0 ? { x: range.col < 0 ? width : start.x + s.getColumnWidth(range.col) * s.zoom() * range.colCount, y: range.row < 0 ? height : start.y + s.getRowHeight(range.row) * s.zoom() * range.rowCount, width: 0, height: 0 } : s.getCellRect(range.row + range.rowCount - 1, range.col + range.colCount - 1);
            boxes.push({ x: range.col < 0 ? 0 : start.x - 2, y: range.row < 0 ? 0 : start.y - 2,
              width: (range.col < 0 ? width : end.x + end.width + 2) - (range.col < 0 ? 0 : start.x - 2),
              height: (range.row < 0 ? height : end.y + end.height + 2) - (range.row < 0 ? 0 : start.y - 2) });
            boxes.push({ x: start.x - 1, y: 0, width: end.x + end.width - start.x + 1, height: first.y });
            boxes.push({ x: 0, y: start.y - 1, width: first.x, height: end.y + end.height - start.y + 1 });
          }
          for (const cell of glyphCells) addGlyphCell(s, cell);
          // Sheet-level filter buttons live in the column-header strip, not in a cell.
          const filter = s.rowFilter();
          const filterRange = filter && filter.range;
          if (filterRange) {
            for (let index = 0; index < filterRange.colCount; index++) {
              if (filter.filterButtonVisible(index) === false) continue;
              const cell = s.getCellRect(filterRange.row, filterRange.col + index);
              if (!cell || !first.y) continue;
              const w = Math.min(18, cell.width - 4), h = Math.min(17, Math.max(6, first.y - 3));
              if (w < 6 || h < 6) continue;
              const rect = clip({ x: cell.x + cell.width - w - 2, y: first.y - 2 - h, width: w, height: h });
              if (rect.width && rect.height) glyphBoxes.push(rect);
            }
          }
        }
        for (const pane of ['official', 'ours']) {
          const element = document.getElementById(`${pane}-pane`)!, hostRect = element.getBoundingClientRect();
          for (const editor of element.querySelectorAll<HTMLElement>('[contenteditable=true],textarea')) {
            const rect = editor.getBoundingClientRect();
            if (rect.width && rect.height) boxes.push({ x: rect.x - hostRect.x - 6, y: rect.y - hostRect.y - 6, width: rect.width + 12, height: rect.height + 12 });
          }
        }
        const x = Math.max(0, Math.min(...boxes.map(r => r.x)) - 2), y = Math.max(0, Math.min(...boxes.map(r => r.y)) - 2);
        const right = Math.min(width, Math.max(...boxes.map(r => r.x + r.width)) + 2), bottom = Math.min(height, Math.max(...boxes.map(r => r.y + r.height)) + 2);
        return { content: [{ x, y, width: right - x, height: bottom - y }], headers: [{ x: 0, y: 0, width, height: headerHeight }, { x: 0, y: headerHeight, width: headerWidth, height: height - headerHeight }], tabs: [{ x: 0, y: height, width: host.clientWidth, height: 28 }], glyphs: glyphBoxes };
      }, glyphCells);
      const name = scenario.name + (dpr === 2 ? '-2x' : '');
      await fs.writeFile(path.join(directory, `${name}-regions.json`), JSON.stringify(regions));
      const captures: Buffer[] = [];
      for (const pane of ['official', 'ours']) {
        const screenshot = path.join(directory, `${name}-${pane}.png`);
        captures.push(await page.locator(`#${pane}-pane`).screenshot({ path: screenshot, animations: 'disabled' }));
        await test.info().attach(`${scenario.name}-${pane}`, { path: screenshot, contentType: 'image/png' });
      }
      if (['selection', 'header-highlight', 'selected-rows', 'selected-columns'].includes(scenario.name)) {
        const masks = captures.map(buffer => {
          const png = PNG.sync.read(buffer), pixels: number[] = [];
          for (let y = 0; y < 492 * dpr; y++) for (let x = 0; x < 662 * dpr; x++) {
            if (!((y >= 18 * dpr && y < 20 * dpr && x >= 40 * dpr) || (x >= 38 * dpr && x < 40 * dpr && y >= 20 * dpr))) continue;
            const i = (y * png.width + x) * 4;
            if (png.data[i] === 33 && png.data[i + 1] === 115 && png.data[i + 2] === 70) pixels.push(i / 4);
          }
          return pixels;
        });
        expect.soft(masks[1], `${name} exact header accents`).toEqual(masks[0]);
      }
      if (scenario.name.startsWith('line-style-')) {
        const masks = captures.map(buffer => {
          const png = PNG.sync.read(buffer), pixels: number[] = [];
          for (let i = 0; i < png.data.length; i += 4) if (png.data[i] === 51 && png.data[i + 1] === 102 && png.data[i + 2] === 153) pixels.push(i / 4);
          return pixels;
        });
        expect.soft(masks[1], `${name} exact border raster`).toEqual(masks[0]);
        const images = captures.map(buffer => PNG.sync.read(buffer));
        let different = 0;
        for (const rect of [{ x: 163, y: 78, width: 63, height: 63 }, { x: 348, y: 59, width: 3, height: 81 }]) {
          for (let y = rect.y * dpr; y < (rect.y + rect.height) * dpr; y++) for (let x = rect.x * dpr; x < (rect.x + rect.width) * dpr; x++) {
            const i = (y * images[0].width + x) * 4;
            if (images[0].data[i] !== images[1].data[i] || images[0].data[i + 1] !== images[1].data[i + 1] || images[0].data[i + 2] !== images[1].data[i + 2]) different++;
          }
        }
        expect.soft(different, `${name} complete border regions including gaps`).toBe(0);
      }
      const metrics = await comparePanes(name, captures[0], captures[1], regions, dpr);
      for (const region of ['content', 'headers', 'tabs', 'glyphs'] as const) expect.soft(metrics[region].ratio, `${name} ${region}: ${(metrics[region].ratio * 100).toFixed(3)}%`).toBeLessThan(limits[region]);
    });
  }

  });
}
