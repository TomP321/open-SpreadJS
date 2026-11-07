import fs from 'node:fs/promises';
import path from 'node:path';
import { test, expect, type Page } from '@playwright/test';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { limits } from './pixel-report.js';
const directory = path.resolve('../../test-results/compare');
type Box = { x: number; y: number; width: number; height: number };
/** UI region comparison uses unmodified pane captures and no watermark mask. */
async function popupReport(page: Page, name: string, open: (pane: 'official' | 'ours') => Promise<void>, selector: string, fullPage = false) {
  const captures: Buffer[] = [], boxes: Box[] = [], glyphs: Box[] = [];
  for (const pane of ['official', 'ours'] as const) {
    await open(pane);
    const host = page.locator(`#${pane}-pane`), root = fullPage ? { x: 0, y: 0, width: page.viewportSize()!.width, height: page.viewportSize()!.height } : await host.boundingBox(); expect(root).toBeTruthy();
    const popup = host.locator(selector).filter({ visible: true }).first(); await expect(popup).toBeVisible();
    const box = await popup.boundingBox(); expect(box).toBeTruthy(); boxes.push({ x: box!.x - root!.x, y: box!.y - root!.y, width: box!.width, height: box!.height });
    // Declare pictograms only. Text, swatches, row backgrounds and popup chrome
    // remain in the same strict content gate as workbook content.
    const valueCount = await page.evaluate(pane => {
      const sheet = window.__compare![pane].getActiveSheet(), filter = sheet.rowFilter() ?? sheet.tables.all()[0]?.rowFilter();
      const range = filter?.range; if (!range) return 0;
      const values = new Set<string>(); for (let row = range.row; row < range.row + range.rowCount; row++) values.add(String(sheet.getValue(row, range.col)));
      return values.size;
    }, pane);
    await host.evaluate((element, count) => element.setAttribute('data-filter-value-count', String(count)), valueCount);
    const pictograms = await host.evaluate((element, origin) => {
      const result: Box[] = [];
      const add = (r: { x: number; y: number; width: number; height: number }) => { if (r.width > 0 && r.height > 0) result.push({ x: r.x - origin.x, y: r.y - origin.y, width: r.width, height: r.height }); };
      for (const icon of element.querySelectorAll<HTMLElement>('.gc-ui-contextmenu-icon[class*=gc-spread-], .gc-filter-function-tr .gc-layout-table-first-column img, .gc-check-uncheck-all, .opensheets-filter-command > canvas, .opensheets-filter-check-actions canvas')) add(icon.getBoundingClientRect());
      for (const list of element.querySelectorAll<HTMLElement>('.gc-filter-item-container, .opensheets-filter-values')) {
        const r = list.getBoundingClientRect(); if (!r.width || !r.height) continue;
        // The list paints one 12px checkbox inset 12px from the list edge on
        // each visible 20px value row. The row count comes from public filter data.
        const count = Number(element.getAttribute('data-filter-value-count') ?? 0);
        for (let i = 0; i < Math.min(count, Math.floor(r.height / 20)); i++) add({ x: r.x + 12, y: r.y + i * 20 + 5, width: 12, height: 12 });
      }
      return result;
    }, root!);
    glyphs.push(...pictograms);
    captures.push(fullPage ? await page.screenshot({ animations: 'disabled' }) : await host.screenshot({ animations: 'disabled' }));
    await page.keyboard.press('Escape'); await expect(popup).toBeHidden();
  }
  const original = PNG.sync.read(captures[0]), actual = PNG.sync.read(captures[1]);
  expect(actual.width).toBe(original.width); expect(actual.height).toBe(original.height);
  const diff = new PNG({ width: original.width, height: original.height }); pixelmatch(original.data, actual.data, diff.data, original.width, original.height, { threshold: .1 });
  const scale = original.width / (fullPage ? page.viewportSize()!.width : (await page.locator('#official-pane').boundingBox())!.width);
  let pixels = 0, area = 0, glyphPixels = 0, glyphArea = 0;
  for (let y = 0; y < original.height; y++) for (let x = 0; x < original.width; x++) {
    if (!boxes.some(b => x >= Math.floor(b.x * scale) && x < Math.ceil((b.x + b.width) * scale) && y >= Math.floor(b.y * scale) && y < Math.ceil((b.y + b.height) * scale))) continue;
    const glyph = glyphs.some(b => x >= Math.floor(b.x * scale) && x < Math.ceil((b.x + b.width) * scale) && y >= Math.floor(b.y * scale) && y < Math.ceil((b.y + b.height) * scale));
    const i = (y * original.width + x) * 4, different = diff.data[i] === 255 && diff.data[i + 1] === 0 && diff.data[i + 2] === 0;
    if (glyph) { glyphArea++; if (different) glyphPixels++; } else { area++; if (different) pixels++; }
  }
  expect(area).toBeGreaterThan(0); const ratio = pixels / area;
  await fs.mkdir(directory, { recursive: true });
  await Promise.all(['official', 'ours'].map((pane, i) => fs.writeFile(path.join(directory, `${name}-${pane}.png`), captures[i])));
  await fs.writeFile(path.join(directory, `${name}-diff.png`), PNG.sync.write(diff));
  await fs.writeFile(path.join(directory, `${name}-diff.json`), JSON.stringify({ scenario: name, regions: { popup: boxes, glyphs }, metrics: { popup: { pixels, area, ratio, threshold: limits.content }, glyphs: { pixels: glyphPixels, area: glyphArea, ratio: glyphArea ? glyphPixels / glyphArea : 0, threshold: limits.glyphs } } }, null, 2));
  if (glyphArea) expect.soft(glyphPixels / glyphArea, `${name} glyphs ${(glyphPixels / glyphArea * 100).toFixed(3)}%`).toBeLessThan(limits.glyphs);
  expect.soft(ratio, `${name} popup ${(ratio * 100).toFixed(3)}%`).toBeLessThan(limits.content);
}
async function click(page: Page, pane: string, x: number, y: number, right = false) { const box = (await page.locator(`#${pane}-pane`).boundingBox())!; await page.mouse.click(box.x + x, box.y + y, { button: right ? 'right' : 'left' }); }
for (const dpr of [1, 2]) test.describe(`M5 UI DPR ${dpr}`, () => {
  test.use({ deviceScaleFactor: dpr });
  test('table and sheet filter popups open from their buttons', async ({ page }) => {
    await page.goto('/?scenario=m4-tables-basic'); await page.waitForFunction(() => window.__compare?.ready);
    await popupReport(page, `m5-ui-table-filter-${dpr}x`, pane => click(page, pane, 120, 31), '[role=dialog]');
    await page.goto('/?scenario=m4-filter-buttons'); await page.waitForFunction(() => window.__compare?.ready);
    await popupReport(page, `m5-ui-sheet-filter-${dpr}x`, pane => click(page, pane, 93, 10), '[role=dialog]');
  });
  for (const [name, x, y] of [['cell', 220, 150], ['row-header', 20, 70], ['column-header', 110, 10], ['corner', 20, 10], ['table', 200, 70], ['tab', 130, 505]] as const) {
    test(`${name} context menu and Escape`, async ({ page }) => {
      await page.goto('/?scenario=m4-tables-basic'); await page.waitForFunction(() => window.__compare?.ready);
      await popupReport(page, `m5-ui-context-${name}-${dpr}x`, pane => click(page, pane, x, y, true), '.gc-ui-contextmenu-container[role=menu]');
    });
  }
  for (const kind of ['Text', 'Number', 'Date', 'Sort By Color', 'Filter By Color']) {
    test(`${kind} filter submenu`, async ({ page }) => {
      await page.goto('/?scenario=m4-tables-basic'); await page.waitForFunction(() => window.__compare?.ready);
      if (kind === 'Date') await page.evaluate(() => { for (const wb of [window.__compare!.official, window.__compare!.ours]) { const s = wb.getActiveSheet(); for (let r = 1; r < 4; r++) s.setValue(r, 0, new Date(2020, 0, r)); } });
      if (kind.endsWith('Color')) await page.evaluate(() => { for (const wb of [window.__compare!.official, window.__compare!.ours]) wb.getActiveSheet().getCell(1, 0).backColor('red'); });
      await popupReport(page, `m5-ui-filter-${kind.replaceAll(' ', '-').toLowerCase()}-${dpr}x`, async pane => {
        await click(page, pane, kind === 'Number' ? 190 : 120, 31);
        await page.locator(`#${pane}-pane`).getByText(kind.endsWith('Color') ? kind : `${kind} Filters`, { exact: true }).hover();
      }, '.gc-filter-subMenu-wrap:visible,.opensheets-filter-submenu:visible');
    });
  }
  test('custom filter dialog', async ({ page }) => {
    await page.goto('/?scenario=m4-tables-basic'); await page.waitForFunction(() => window.__compare?.ready);
    await popupReport(page, `m5-ui-custom-filter-${dpr}x`, async pane => {
      await click(page, pane, 120, 31);
      await page.locator(`#${pane}-pane`).getByText('Text Filters', { exact: true }).hover();
      await page.locator(`#${pane}-pane`).getByText('Custom Filter...', { exact: true }).click();
    }, '[role=dialog]:visible', true);
  });
  test('all sheets list popup', async ({ page }) => {
    await page.goto('/?scenario=many-tabs'); await page.waitForFunction(() => window.__compare?.ready);
    await popupReport(page, `m5-ui-sheet-list-${dpr}x`, pane => click(page, pane, 78, 507), '.gc-ui-contextmenu-container');
  });
});
test('a bad custom painter cannot remove the next cells, headers or tabs', async ({ page }) => {
  await page.goto('/?scenario=empty'); await page.waitForFunction(() => window.__compare?.ready);
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.evaluate(() => {
    const G = window.__implementationGC, sheet = window.__compare!.ours.getActiveSheet();
    class BadPainter extends G.Spread.Sheets.CellTypes.Base { paint(ctx: CanvasRenderingContext2D) { ctx.save(); ctx.beginPath(); ctx.rect(0, 0, 1, 1); ctx.clip(); throw new Error('M5 painter failure'); } }
    sheet.setCellType(1, 1, new BadPainter()); sheet.setValue(0, 0, 'Good'); sheet.setFormula(2, 1, 'BC_QRCODE("hello")'); sheet.setValue(3, 1, { richText: [{ text: 'Rich text' }] });
    window.__compare!.ours.refresh();
  });
  await page.waitForTimeout(50); expect(errors).toEqual([]);
  const observation = await page.evaluate(() => { const wb = window.__compare!.ours; const view = (wb as unknown as { _renderer(): { metrics: { frames: number; paintedCells: number }; context: CanvasRenderingContext2D } })._renderer(); const header = view.context.getImageData(103, 0, 60, 19).data; let darkHeaderPixels = 0; for (let i = 0; i < header.length; i += 4) if (header[i] < 160 && header[i + 1] < 160 && header[i + 2] < 160) darkHeaderPixels++; return { error: wb.getActiveSheet().getText(2, 1), rich: wb.getActiveSheet().getText(3, 1), frames: view.metrics, darkHeaderPixels }; });
  expect(observation.error).toBe('#NAME?'); expect(observation.rich).toBe('Rich text'); expect(observation.frames.frames).toBeGreaterThan(1); expect(observation.frames.paintedCells).toBeGreaterThan(100); expect(observation.darkHeaderPixels).toBeGreaterThan(10);
});

test('table filtering stages choices until OK and notifies both event streams', async ({ page }) => {
  await page.goto('/?scenario=m4-tables-basic'); await page.waitForFunction(() => window.__compare?.ready);
  await page.evaluate(() => {
    for (const [wb, G] of [[window.__compare!.official, window.__referenceGC], [window.__compare!.ours, window.__implementationGC]] as const) {
      const events: string[] = []; (wb as unknown as { m5Events: string[] }).m5Events = events;
      for (const name of [G.Spread.Sheets.Events.RangeFiltering, G.Spread.Sheets.Events.RangeFiltered, G.Spread.Sheets.Events.TableFiltering, G.Spread.Sheets.Events.TableFiltered]) wb.bind(name, () => events.push(name));
    }
  });
  for (const pane of ['official', 'ours'] as const) {
    await click(page, pane, 120, 31);
    const dialog = page.locator(`#${pane}-pane [role=dialog]:visible`).first(), box = (await dialog.boundingBox())!;
    await page.mouse.click(box.x + 44, box.y + 233); await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    expect(await page.evaluate(pane => window.__compare![pane].getActiveSheet().getRowVisible(3), pane)).toBe(true);
    await click(page, pane, 120, 31); const box2 = (await dialog.boundingBox())!;
    await page.mouse.click(box2.x + 44, box2.y + 233); await dialog.getByRole('button', { name: 'OK', exact: true }).click();
    expect(await page.evaluate(pane => window.__compare![pane].getActiveSheet().getRowVisible(3), pane)).toBe(false);
  }
  const events = await page.evaluate(() => [window.__compare!.official, window.__compare!.ours].map(wb => (wb as unknown as { m5Events: string[] }).m5Events));
  expect(events[1]).toEqual(events[0]);
});

test('context menu custom items execute registered commands and onOpenMenu can cancel', async ({ page }) => {
  await page.goto('/?scenario=empty'); await page.waitForFunction(() => window.__compare?.ready);
  await page.evaluate(() => {
    for (const wb of [window.__compare!.official, window.__compare!.ours]) {
      wb.contextMenu.menuData.push({ name: 'm5Custom', text: 'M5 custom action', command: 'm5Custom', workArea: 'viewport' });
      wb.commandManager().register('m5Custom', { execute() { wb.getActiveSheet().setValue(1, 1, 'Executed'); return true; } });
    }
  });
  for (const pane of ['official', 'ours'] as const) { await click(page, pane, 200, 100, true); await page.locator(`#${pane}-pane`).getByText('M5 custom action', { exact: true }).click(); expect(await page.evaluate(pane => window.__compare![pane].getActiveSheet().getValue(1, 1), pane)).toBe('Executed'); }
  await page.evaluate(() => { for (const wb of [window.__compare!.official, window.__compare!.ours]) wb.contextMenu.onOpenMenu = () => true; });
  for (const pane of ['official', 'ours'] as const) { await click(page, pane, 200, 100, true); await expect(page.locator(`#${pane}-pane .gc-ui-contextmenu-container:visible`)).toHaveCount(0); }
});

test('menu keyboard navigation keeps the worksheet active cell stationary', async ({ page }) => {
  await page.goto('/?scenario=empty'); await page.waitForFunction(() => window.__compare?.ready);
  for (const pane of ['official', 'ours'] as const) {
    await click(page, pane, 200, 100, true);
    const before = await page.evaluate(pane => { const s = window.__compare![pane].getActiveSheet(); return [s.getActiveRowIndex(), s.getActiveColumnIndex()]; }, pane);
    await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown');
    expect(await page.evaluate(pane => { const s = window.__compare![pane].getActiveSheet(); return [s.getActiveRowIndex(), s.getActiveColumnIndex()]; }, pane)).toEqual(before);
    await page.keyboard.press('Escape');
  }
});
