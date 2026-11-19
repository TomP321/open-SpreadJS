/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Task 8: contextual "Shape Format" ribbon tab. One paired spec selects a
 * shape with the real mouse on BOTH sides (official trial vs ours), compares
 * the visible tab controls and the shape model after Bring Forward, Rotate
 * and Size changes made through the ribbon UI.
 */
import { expect, test, type Browser, type Page } from '@playwright/test';
import { boot, type Side } from './helpers';

test.setTimeout(180_000);

type Pt = { x: number; y: number };

/** Add two rectangles: S1 first (lower), S2 second (higher). */
async function addShapes(page: Page): Promise<void> {
  await page.evaluate(() => {
    const spread = (window as any).__designerCompare.spread;
    const sheet = spread.getActiveSheet();
    sheet.shapes.clear();
    const T = (window as any).GC.Spread.Sheets.Shapes.AutoShapeType;
    sheet.shapes.add('S1', T.rectangle, 320, 160, 120, 80);
    sheet.shapes.add('S2', T.rectangle, 100, 300, 150, 60);
    spread.refresh();
  });
  await page.waitForTimeout(250);
}

const shapeState = (page: Page): Promise<any> => page.evaluate(() => {
  const sheet = (window as any).__designerCompare.spread.getActiveSheet();
  const s1 = sheet.shapes.all().find((x: any) => x.name() === 'S1');
  return {
    selected: s1?.isSelected() === true,
    rotate: Number(s1?.rotate() ?? 0),
    width: Number(s1?.width() ?? 0),
    height: Number(s1?.height() ?? 0),
    order: sheet.shapes.all().map((x: any) => x.name()),
  };
});

/** Viewport point at the centre of S1: biggest canvas + (rowHeader, colHeader) + model box. */
async function shapePoint(page: Page): Promise<Pt> {
  return page.evaluate(() => {
    const sheet = (window as any).__designerCompare.spread.getActiveSheet();
    const s1 = sheet.shapes.all().find((x: any) => x.name() === 'S1');
    const canvases = [...document.querySelectorAll('#designer-host canvas')];
    const host = canvases.sort((a, b) => {
      const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
      return rb.width * rb.height - ra.width * ra.height;
    })[0].getBoundingClientRect();
    return { x: host.left + 40 + Number(s1.x()) + Number(s1.width()) / 2, y: host.top + 22 + Number(s1.y()) + Number(s1.height()) / 2 };
  });
}

async function clickTitle(page: Page, title: string): Promise<void> {
  const pt = await page.evaluate((t) => {
    const el = [...document.querySelectorAll('[title]')].find((e) => e.getAttribute('title') === t && e.getBoundingClientRect().y < 175 && e.getBoundingClientRect().width > 4);
    if (!el) return null;
    const b = el.getBoundingClientRect();
    return { x: b.x + Math.min(20, b.width / 2), y: b.y + Math.min(24, b.height / 2) };
  }, title);
  if (!pt) {
    const found = await page.evaluate(() => [...document.querySelectorAll('[title]')].filter((e) => e.getBoundingClientRect().y < 175).map((e) => `${e.getAttribute('title')}@${Math.round(e.getBoundingClientRect().width)}x${Math.round(e.getBoundingClientRect().height)}`));
    throw new Error(`Ribbon control "${title}" not found. Visible titles: ${found.join(', ')}`);
  }
  await page.mouse.click(pt.x, pt.y);
  await page.waitForTimeout(350);
}

async function clickMenuItem(page: Page, text: string): Promise<void> {
  const item = page.locator('.gc-designer-ribbon-dropdown').getByText(text, { exact: true }).first();
  await item.waitFor({ state: 'visible', timeout: 5000 });
  await item.click();
  await page.waitForTimeout(350);
}

async function run(browser: Browser, side: Side): Promise<Record<string, unknown>> {
  const page = await browser.newPage();
  try {
    await boot(page, side);
    await addShapes(page);
    const before = await shapeState(page);

    await page.mouse.click((await shapePoint(page)).x, (await shapePoint(page)).y);
    await page.waitForTimeout(400);
    const afterClick = await shapeState(page);
    const tabVisible = await page.getByText('Shape Format', { exact: true }).first().isVisible();

    // Visible controls of the tab (compare between sides).
    await page.getByText('Shape Format', { exact: true }).first().click();
    await page.waitForTimeout(350);
    const ribbon = page.locator('[class*=ribbon]').first();
    const labels = ['Insert Shapes', 'Shape Styles', 'Accessibility', 'Rotate', 'Group', 'Align', 'Arrange', 'Format Pane'];
    const visibleLabels: string[] = [];
    for (const label of labels) if (await ribbon.getByText(label, { exact: true }).first().isVisible().catch(() => false)) visibleLabels.push(label);
    const titledControls: string[] = [];
    for (const t of ['Change Shape', 'Alt Text', 'Rotate', 'Group', 'Align', 'Bring Forward', 'Send Backward', 'Size', 'Display the Selection Pane', 'Display the Format Pane']) {
      if (await page.locator(`[title="${t}"]`).first().isVisible().catch(() => false)) titledControls.push(t);
    }

    // Rotate via the ribbon dropdown.
    await clickTitle(page, 'Rotate');
    await clickMenuItem(page, 'Rotate Right 90°');
    const afterRotate = await shapeState(page);

    // Bring Forward via the Arrange group's direct button (S1 starts below S2, so it must move).
    await page.mouse.click((await shapePoint(page)).x, (await shapePoint(page)).y);
    await page.waitForTimeout(300);
    const zBefore = await shapeState(page);
    await clickTitle(page, 'Bring Forward');
    const afterForward = await shapeState(page);

    // Size: type 200 into the Width input of the inline Size panel and press Enter.
    await page.mouse.click((await shapePoint(page)).x, (await shapePoint(page)).y);
    await page.waitForTimeout(300);
    await clickTitle(page, 'Size');
    const inputs = page.locator('.gc-designer-ribbon-dropdown .gc-designer-text-input');
    await expect(inputs).toHaveCount(2, { timeout: 5000 });
    const widthInput = inputs.nth(1);
    await widthInput.click();
    await page.keyboard.press('Control+A');
    await page.keyboard.type('200');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(400);
    const afterSize = await shapeState(page);
    await page.keyboard.press('Escape');

    return { before, afterClick, tabVisible, visibleLabels, titledControls, afterRotate, zBefore, afterForward, afterSize };
  } finally {
    await page.close();
  }
}

test('Shape Format contextual tab matches the trial end to end', async ({ browser }) => {
  const official = await run(browser, 'official');
  const ours = await run(browser, 'ours');

  expect(official.tabVisible, 'trial shows the tab after selecting a shape').toBe(true);
  expect(ours.tabVisible, 'ours shows the tab after selecting a shape').toBe(true);
  expect(ours.afterClick.selected, 'ours selected S1 with a real mouse click').toBe(true);

  // Same group captions and same titled controls visible on the tab.
  expect(ours.visibleLabels).toEqual(official.visibleLabels);
  expect(ours.titledControls).toEqual(official.titledControls);
  expect((ours.visibleLabels as string[]).length).toBe(8);

  // Model transitions match: rotate +90, z-order change, width 200.
  expect((ours.afterRotate as any).rotate).toBe((official.afterRotate as any).rotate);
  expect((ours.afterRotate as any).rotate).toBe(90);
  expect((ours.afterForward as any).order).toEqual((official.afterForward as any).order);
  expect((ours.afterForward as any).order, 'Bring Forward changed the z-order').not.toEqual((ours.zBefore as any).order);
  expect((ours.afterSize as any).width).toBe((official.afterSize as any).width);
  expect((ours.afterSize as any).width).toBe(200);
  expect((ours.afterSize as any).height).toBe((official.afterSize as any).height);
});
