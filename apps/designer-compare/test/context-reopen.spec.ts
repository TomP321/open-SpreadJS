/*
 * TASK 51 ITEM 0: context-menu reopen at the new position.
 * Paired black-box spec (user report 2026-11-17 "i menu con il tasto destro che
 * appaiono non riesco a spostarli"): with a context menu already open, a new right-click on
 * another cell / row header / column header / corner / sheet tab must CLOSE the old menu and
 * OPEN the right menu type at the NEW position, exactly like the trial. Measured live on the
 * official side (.probe/t51): menus move, Escape closes, left click outside closes, and a
 * right-click that lands ON the open menu leaves it where it is.
 */
import { expect, test, type Browser, type Page } from '@playwright/test';
import { boot } from './helpers';

const VIEWPORT = { width: 1440, height: 800 };
const MENU_SELECTOR = '.gc-ui-contextmenu-container:visible, .gc-designer-context-menu:visible';
const DROPDOWN_SELECTOR = '.gc-designer-ribbon-dropdown:not(.gc-designer-context-menu):visible';

interface MenuInfo { x: number; y: number; width: number; height: number; first: string }

async function visibleMenu(page: Page): Promise<MenuInfo | null> {
  const menus = await page.locator(MENU_SELECTOR).all();
  expect(menus.length, 'at most one visible context menu').toBeLessThanOrEqual(1);
  if (menus.length === 0) return null;
  const box = (await menus[0].boundingBox())!;
  const first = await menus[0].evaluate((el) => {
    for (const child of el.children) {
      const text = (child.textContent ?? '').trim();
      if (text) return text.slice(0, 20);
    }
    return '';
  });
  return { x: box.x, y: box.y, width: box.width, height: box.height, first };
}

async function rightClick(page: Page, x: number, y: number): Promise<MenuInfo | null> {
  await page.mouse.click(x, y, { button: 'right' });
  await page.waitForTimeout(220);
  return visibleMenu(page);
}

async function dismiss(page: Page): Promise<void> {
  await page.keyboard.press('Escape');
  await page.mouse.click(1200, 100);
  await page.waitForTimeout(120);
}

test.describe('context menu reopens at the new pointer (TASK 51 item 0)', () => {
  test.use({ viewport: VIEWPORT });

  test('consecutive right-clicks across grid targets move the menu, same type, official geometry ±2px', async ({ browser }: { browser: Browser }) => {
    test.setTimeout(150_000);
    const official = await browser.newPage({ viewport: VIEWPORT });
    const ours = await browser.newPage({ viewport: VIEWPORT });
    try {
      await boot(official, 'official');
      await boot(ours, 'ours');
      // One sequence, NO Escape between clicks: every click must close the previous menu
      // and open the right menu type at the new pointer (or clamped near it).
      const targets = [
        { name: 'cell', x: 300, y: 300 },
        { name: 'cell-2', x: 700, y: 450 },
        { name: 'row header', x: 30, y: 300 },
        { name: 'col header', x: 300, y: 190 },
        { name: 'corner', x: 30, y: 190 },
        { name: 'sheet tab', x: 120, y: 770 },
        { name: 'cell bottom', x: 700, y: 700 },
      ] as const;
      for (const page of [official, ours]) await dismiss(page);
      for (const target of targets) {
        const expected = await rightClick(official, target.x, target.y);
        const actual = await rightClick(ours, target.x, target.y);
        expect(actual, `ours has no menu at ${target.name}`).not.toBeNull();
        expect(expected, `official has no menu at ${target.name}`).not.toBeNull();
        expect(actual!.first, `${target.name}: same menu type`).toBe(expected!.first);
        for (const key of ['x', 'y', 'width', 'height'] as const) {
          expect(Math.abs(actual![key] - expected![key]), `${target.name} ${key} (official ${expected![key]}, ours ${actual![key]})`).toBeLessThanOrEqual(2);
        }
      }
    } finally {
      await official.close();
      await ours.close();
    }
  });

  test('right-click on a cell while a ribbon dropdown is open: menu at pointer, dropdown closed', async ({ browser }: { browser: Browser }) => {
    test.setTimeout(120_000);
    const official = await browser.newPage({ viewport: VIEWPORT });
    const ours = await browser.newPage({ viewport: VIEWPORT });
    try {
      await boot(official, 'official');
      await boot(ours, 'ours');
      for (const page of [official, ours]) {
        await dismiss(page);
        await page.locator('[data-command="ribbon.mergeCenter"] .dropdown-btn').click();
        await page.waitForTimeout(220);
        expect(await page.locator(DROPDOWN_SELECTOR).count(), 'ribbon dropdown open').toBeGreaterThanOrEqual(1);
        const menu = await rightClick(page, 500, 450);
        expect(menu, 'context menu opened').not.toBeNull();
        expect(menu!.first).toBe('Cut');
        expect(await page.locator(DROPDOWN_SELECTOR).count(), 'ribbon dropdown closed by the right-click').toBe(0);
        expect(Math.abs(menu!.x - 500), 'menu at the new pointer x').toBeLessThanOrEqual(2);
      }
      // Same gesture, side-by-side geometry: official vs ours.
      const expected = await rightClick(official, 1100, 300);
      const actual = await rightClick(ours, 1100, 300);
      expect(Math.abs(actual!.y - expected!.y), `y (official ${expected!.y}, ours ${actual!.y})`).toBeLessThanOrEqual(2);
      expect(Math.abs(actual!.height - expected!.height), 'menu height').toBeLessThanOrEqual(2);
    } finally {
      await official.close();
      await ours.close();
    }
  });

  test('Escape and left-click outside close; a right-click ON the open menu keeps it', async ({ page }) => {
    await page.setViewportSize(VIEWPORT);
    await boot(page, 'ours');
    // Escape closes.
    await rightClick(page, 400, 300);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    expect(await visibleMenu(page)).toBeNull();
    // Left click outside closes.
    await rightClick(page, 400, 300);
    await page.mouse.click(1000, 650);
    await page.waitForTimeout(200);
    expect(await visibleMenu(page)).toBeNull();
    // Official behaviour measured live: right-click landing on the open menu does NOT move it.
    const before = await rightClick(page, 300, 300);
    expect(before).not.toBeNull();
    await page.mouse.click(before!.x + 60, before!.y + 80, { button: 'right' });
    await page.waitForTimeout(220);
    const after = await visibleMenu(page);
    expect(after, 'menu still open').not.toBeNull();
    expect(after!.x).toBeCloseTo(before!.x, 0);
    expect(after!.y).toBeCloseTo(before!.y, 0);
    // It still reopens for a click outside its area afterwards.
    const moved = await rightClick(page, 1100, 300);
    expect(Math.abs(moved!.x - 1100), 'reopens at the new pointer').toBeLessThanOrEqual(2);
  });
});
