/*
 * TASK 9: grid context-menu placement. Paired black-box spec — right-click at four grid
 * corners with the real mouse on BOTH sides and compare the menu rectangle within 4px.
 * The official rule (measured live, .probe/t6): open at the pointer; flip left/up when the
 * menu would overflow; clamp the flipped top to the grid-host top; never scroll-clip.
 */
import { expect, test, type Browser, type Page } from '@playwright/test';
import { boot } from './helpers';

const VIEWPORT = { width: 1280, height: 720 };
const MENU_SELECTOR = '.gc-ui-contextmenu-container:visible, .gc-designer-context-menu:visible';

/** Four positions inside the grid area (avoiding headers/tab strip/scrollbars). */
const POSITIONS = [
  { name: 'top-left', x: 60, y: 240 },
  { name: 'bottom-left', x: 60, y: 640 },
  { name: 'top-right', x: 1150, y: 240 },
  { name: 'bottom-right', x: 1150, y: 640 },
] as const;

async function menuAt(page: Page, x: number, y: number): Promise<{ x: number; y: number; width: number; height: number; lastBottom: number; lastText: string }> {
  await page.mouse.click(x, y, { button: 'right' });
  const menu = page.locator(MENU_SELECTOR);
  await expect(menu).toHaveCount(1);
  const box = (await menu.boundingBox())!;
  const last = await menu.evaluate((el) => {
    const kids = [...el.children].filter((c) => (c as HTMLElement).offsetHeight > 0);
    const kid = kids[kids.length - 1] as HTMLElement | undefined;
    return { bottom: kid ? Math.round(kid.getBoundingClientRect().bottom) : 0, text: kid?.textContent?.trim() ?? '' };
  });
  await page.keyboard.press('Escape');
  await page.mouse.click(640, 90);
  await page.waitForTimeout(120);
  return { x: box.x, y: box.y, width: box.width, height: box.height, lastBottom: last.bottom, lastText: last.text };
}

test('grid context menus open at the same rectangle on both sides at four corners', async ({ browser }: { browser: Browser }) => {
  test.setTimeout(120_000);
  const official = await browser.newPage({ viewport: VIEWPORT });
  const ours = await browser.newPage({ viewport: VIEWPORT });
  try {
    await boot(official, 'official');
    await boot(ours, 'ours');
    for (const position of POSITIONS) {
      const expected = await menuAt(official, position.x, position.y);
      const actual = await menuAt(ours, position.x, position.y);
      for (const key of ['x', 'y', 'width', 'height'] as const) {
        expect(Math.abs(actual[key] - expected[key]), `${position.name} ${key} (official ${expected[key]}, ours ${actual[key]})`).toBeLessThanOrEqual(4);
      }
      // The menu is never clipped: it fits fully in the viewport on both sides.
      expect(expected.lastBottom, `${position.name} official last item`).toBeLessThanOrEqual(VIEWPORT.height);
      expect(actual.lastBottom, `${position.name} ours last item`).toBeLessThanOrEqual(VIEWPORT.height);
    }
  } finally {
    await official.close();
    await ours.close();
  }
});

test('the supervisor case: cell menu at (640,428) shows Create Cell Template fully', async ({ page }) => {
  await page.setViewportSize(VIEWPORT);
  await boot(page, 'ours');
  const box = await menuAt(page, 640, 428);
  // Same rectangle the official shows at this pointer (measured live).
  expect(box.x).toBeCloseTo(640, 0);
  expect(box.y).toBeCloseTo(179, 0);
  expect(box.lastBottom).toBeLessThanOrEqual(VIEWPORT.height);
  expect(box.lastText).toContain('Create Cell Template');
});
