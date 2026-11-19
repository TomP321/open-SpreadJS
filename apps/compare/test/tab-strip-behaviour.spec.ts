import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

// Black-box interaction parity for the sheet tab strip in every tabStripPosition:
// slot hit-testing boundaries, drag reorder drops, double-click rename and the context menu.
// Each side runs in its own page (identical viewport and scenario) so DOM queries can never
// pick up an element from the other pane — only the recorded measurements are compared.
const POSITIONS = [0, 1, 2, 3];
const vertical = (position: number) => position >= 2;

async function open(page: Page, key: 'official' | 'ours', position: number, count = 3) {
  await page.goto('/?scenario=multiple-sheets');
  await page.waitForFunction(() => window.__compare?.ready);
  await page.evaluate(({ key, position, count }) => {
    const workbook = window.__compare![key];
    const context = key === 'official' ? window.__referenceGC : window.__implementationGC;
    for (let i = 0; i < count; i++) workbook.addSheet(workbook.getSheetCount(), new context.Spread.Sheets.Worksheet(['Alpha', 'Beta', 'Gamma'][i]));
    workbook.options.tabStripPosition = position;
    workbook.setActiveSheet('Details');
  }, { key, position, count });
  await page.waitForTimeout(350);
}

async function paneRect(page: Page, key: 'official' | 'ours') {
  return page.evaluate(key => {
    const rect = document.getElementById(key === 'official' ? 'official-pane' : 'ours-pane')!.getBoundingClientRect();
    return { x: rect.x, y: rect.y, w: rect.width, h: rect.height };
  }, key);
}

const point = (rect: { x: number, y: number, w: number, h: number }, position: number, along: number) =>
  vertical(position)
    ? { x: Math.round(rect.x + (position === 2 ? 40 : rect.w - 40)), y: Math.round(rect.y + along) }
    : { x: Math.round(rect.x + along), y: Math.round(rect.y + (position === 0 ? rect.h - 14 : 14)) };

// Anchor x to the nearer pane edge so the two panes' few-px width difference cannot skew it.
type Box = { x: number, y: number, width: number, height: number };
const anchored = (rect: Box, pane: { x: number, width: number }) => {
  const d = rect.x - pane.x;
  return Math.round(d < pane.width - d ? d : d - pane.width);
};

test.describe('sheet tab strip behaviour', () => {
  test.use({ viewport: { width: 2400, height: 900 } });
  test.setTimeout(240_000);

  for (const position of POSITIONS) {
    test(`position ${position}: slot boundaries, drag drops, rename and context menu match the trial`, async ({ browser }) => {
      const context = await browser.newContext({ viewport: { width: 2400, height: 900 } });
      const pages: Record<'official' | 'ours', Page> = { official: await context.newPage(), ours: await context.newPage() };
      const errors: string[] = [];
      for (const page of Object.values(pages)) page.on('pageerror', error => errors.push(error.message));

      // 1. Slot boundaries via click-to-activate sampling.
      const scan = async (key: 'official' | 'ours') => {
        const page = pages[key];
        await open(page, key, position);
        const rect = await paneRect(page, key);
        const boundaries: number[] = [];
        let previous = await page.evaluate(key => window.__compare![key].getActiveSheet().name(), key);
        const from = vertical(position) ? 32 : 150, to = vertical(position) ? 150 : 430;
        for (let along = from; along <= to; along += 4) {
          const spot = point(rect, position, along);
          await page.mouse.click(spot.x, spot.y);
          const active = await page.evaluate(key => window.__compare![key].getActiveSheet().name(), key);
          if (active !== previous) { boundaries.push(along); previous = active; }
          if (active.startsWith('Sheet')) break;
        }
        return boundaries;
      };
      const officialEdges = await scan('official');
      const oursEdges = await scan('ours');
      expect.soft(oursEdges, `position ${position} slot boundaries`).toEqual(jointlyClose(officialEdges, oursEdges));

      // 2. Drag reorder: drop before the tab under the cursor, clamps at both ends.
      const dragTab = async (key: 'official' | 'ours', fromName: string, delta: number) => {
        const page = pages[key];
        await open(page, key, position);
        const rect = await paneRect(page, key);
        const sample = async (along: number) => {
          const spot = point(rect, position, along);
          await page.mouse.click(spot.x, spot.y);
          return page.evaluate(key => window.__compare![key].getActiveSheet().name(), key);
        };
        let centre = 0;
        const range = vertical(position) ? [32, 150] : [150, 430];
        for (let along = range[0]; along <= range[1]; along += 4) { if (await sample(along) === fromName) { centre = along; break; } }
        expect(centre, `found ${fromName} in ${key}`).toBeGreaterThan(0);
        const start = point(rect, position, centre);
        await page.mouse.move(start.x, start.y);
        await page.mouse.down();
        await page.waitForTimeout(110);
        for (let step = 1; step <= 10; step++) {
          const spot = point(rect, position, centre + delta * step / 10);
          await page.mouse.move(spot.x, spot.y);
          await page.waitForTimeout(25);
        }
        await page.waitForTimeout(140);
        await page.mouse.up();
        await page.waitForTimeout(300);
        return page.evaluate(key => window.__compare![key].sheets.map(sheet => sheet.name()).join(',') + ':' + window.__compare![key].getActiveSheet().name(), key);
      };
      for (const [from, delta] of [['Beta', 4] as const, ['Beta', -160] as const, ['Alpha', 120] as const]) {
        const officialOrder = await dragTab('official', from, delta);
        const oursOrder = await dragTab('ours', from, delta);
        expect.soft(oursOrder, `position ${position} drag ${from} ${delta}`).toBe(officialOrder);
      }

      // 3. Double-click rename: the editor box sits over the tab, Enter commits, blur commits once (no page errors).
      const renameAlong = vertical(position) ? 62 : 210;
      const rename = async (key: 'official' | 'ours'): Promise<{ x?: number, y?: number, width?: number, height?: number, value?: string, after: string }> => {
        const page = pages[key];
        await open(page, key, position);
        const rect = await paneRect(page, key);
        const spot = point(rect, position, renameAlong);
        await page.mouse.dblclick(spot.x, spot.y);
        await page.waitForTimeout(250);
        const box = await page.evaluate(key => {
          const pane = document.getElementById(key === 'official' ? 'official-pane' : 'ours-pane')!;
          const editor = pane.querySelector('input[class*="sheetTabEditor"], input[class*="tab-editor"]');
          if (!editor) return null;
          const rect = editor.getBoundingClientRect(), origin = pane.getBoundingClientRect();
          return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, pane: { x: origin.x, y: origin.y, width: origin.width }, value: (editor as HTMLInputElement).value };
        }, key);
        if (box) {
          await page.keyboard.press('Control+a');
          await page.keyboard.type('Renamed');
          await page.keyboard.press('Enter');
          await page.waitForTimeout(200);
          await page.keyboard.press('Escape'); // close anything the commit left behind
          await page.waitForTimeout(150);
        }
        const after = await page.evaluate(key => window.__compare![key].sheets.map(sheet => sheet.name()).join(',') + ':' + window.__compare![key].getActiveSheet().name(), key);
        return box ? { x: anchored(box, box.pane), y: Math.round(box.y - box.pane.y), width: Math.round(box.width), height: Math.round(box.height), value: box.value, after } : { after };
      };
      const officialRename = await rename('official');
      const oursRename = await rename('ours');
      expect.soft(oursRename.after, `position ${position} rename result`).toBe(officialRename.after);
      for (const axis of ['x', 'y', 'width', 'height'] as const) {
        const pair = [oursRename[axis], officialRename[axis]];
        expect(pair[0], `position ${position} editor ${axis} measured on both sides`).not.toBeUndefined();
        expect.soft(Math.abs((pair[0] as number) - (pair[1] as number)), `position ${position} editor ${axis} within 2px`).toBeLessThanOrEqual(2);
      }

      // 4. Right-click tab context menu: same items, anchored at the cursor (flipped when it would overflow).
      const openMenu = async (key: 'official' | 'ours') => {
        const page = pages[key];
        await open(page, key, position);
        const rect = await paneRect(page, key);
        const spot = point(rect, position, renameAlong);
        await page.mouse.click(spot.x, spot.y, { button: 'right' });
        await page.waitForTimeout(250);
        const box = await page.evaluate(() => {
          const menus = [...document.querySelectorAll('.gc-menu, [class*="contextmenu-container"], [class*="context-menu"]')]
            .filter(menu => { const r = menu.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
          if (menus.length !== 1) return null;
          const rect = menus[0].getBoundingClientRect();
          return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
        });
        await page.keyboard.press('Escape');
        await page.waitForTimeout(150);
        if (!box) return null;
        const pane = await paneRect(page, key);
        return { x: anchored(box, { x: pane.x, width: pane.w }), y: Math.round(box.y - pane.y), width: Math.round(box.width), height: Math.round(box.height) };
      };
      const officialMenu = await openMenu('official');
      const oursMenu = await openMenu('ours');
      expect(officialMenu, 'official context menu open').not.toBeNull();
      expect(oursMenu, 'ours context menu open').not.toBeNull();
      expect.soft(oursMenu!.height, `position ${position} menu height`).toBe(officialMenu!.height);
      expect.soft(Math.abs(oursMenu!.x - officialMenu!.x), `position ${position} menu x within 4px`).toBeLessThanOrEqual(4);
      expect.soft(Math.abs(oursMenu!.y - officialMenu!.y), `position ${position} menu y within 4px`).toBeLessThanOrEqual(4);
      expect(errors, `position ${position} page errors`).toEqual([]);
      await context.close();
    });
  }
});

// Tolerant equality helper: Playwright matchers cannot express "each number within a px budget",
// so the expected value is the official list snapped to the nearest ours sample when close.
function jointlyClose(official: number[], ours: number[]) {
  return official.map(edge => ours.find(sample => Math.abs(sample - edge) <= 6) ?? edge);
}
