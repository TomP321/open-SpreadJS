/*
 * TASK 60 item 4 — collapsed-group flyouts vs the trial, measured side by side.
 *
 * Everything here is compared with the trial's own live values (never hardcoded from our side):
 *  - the flyout box and every item box (the trial sizes the flyout to its content: Cells
 *    176x101 with 52px items while ours used to be 176/236 with 72px items);
 *  - the caption block: the trial centres the group name under the flyout ("Cell Editors" stays
 *    on ONE line while "Conditional Format" wraps);
 *  - the collapse arrow under a collapsed group button: the trial paints a small FILLED ▼
 *    (measured 9x6 px of #666666 in the 36x14 marker box), not a thin chevron;
 *  - the pressed state: the trial keeps a flat #ebebeb fill on the group button while its flyout
 *    is open even when the pointer is parked away from it.
 * Run at 1280x720, the width where Home's Styles / Cells / Editing groups collapse.
 */
import { expect, test, type Page } from '@playwright/test';
import { PNG } from 'pngjs';
import { boot } from './helpers';

const VIEWPORT = { width: 1280, height: 720 };
const GROUPS = ['Styles', 'Cells', 'Editing'] as const;

interface ItemBox { x: number; y: number; width: number; height: number; label: string; labelWidth: number; labelHeight: number }

async function openGroup(page: Page, label: string): Promise<void> {
  const at = await page.evaluate((name) => {
    const cands = [...document.querySelectorAll('[data-buttontype="dropdown"]')].filter((e) => (e.getAttribute('aria-label') || '').trim() === name);
    if (!cands.length) throw new Error(`collapsed group ${name} not found`);
    const r = cands[0].getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, label);
  await page.mouse.click(at.x, at.y);
  await page.waitForTimeout(500);
  expect(await page.locator('.gc-designer-ribbon-dropdown').count(), `${label}: the flyout opened`).toBe(1);
}

async function flyoutBoxes(page: Page, label: string): Promise<{ box: ItemBox; items: ItemBox[]; captionInk: { x0: number; x1: number; y0: number; y1: number } }> {
  const boxes = await page.evaluate((name) => {
    const drop = document.querySelector('.gc-designer-ribbon-dropdown')!;
    const r = drop.getBoundingClientRect();
    const items = [...drop.querySelectorAll('[data-command]')]
      .map((e) => {
        const q = e.getBoundingClientRect();
        const lbl = e.querySelector('.gc-designer-ribbon-text');
        const l = lbl?.getBoundingClientRect();
        return { x: Math.round(q.x - r.x), y: Math.round(q.y - r.y), width: Math.round(q.width), height: Math.round(q.height), label: (lbl?.textContent ?? e.textContent ?? '').trim(), labelWidth: l ? Math.round(l.width) : 0, labelHeight: l ? Math.round(l.height) : 0 };
      })
      .filter((it) => it.width > 12 && it.height > 12);
    const title = drop.querySelector('.gc-designer-group-dropdown-title, .gc-designer-ribbon-group-title')!;
    const t = title.getBoundingClientRect();
    return { box: { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height), label: name, labelWidth: 0, labelHeight: 0 }, items, title: { x: Math.round(t.x), y: Math.round(t.y), width: Math.round(t.width), height: Math.round(t.height) } };
  }, label);
  // The caption INK is what has to be centred: our title element spans the flyout, the trial's
  // hugs the text, so compare the painted extent instead of the element box.
  const clip = { x: boxes.title.x - 2, y: boxes.title.y - 2, width: boxes.title.width + 4, height: boxes.title.height + 4 };
  const png = PNG.sync.read(await page.screenshot({ clip }));
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (let y = 0; y < png.height; y++) for (let x = 0; x < png.width; x++) {
    const i = (png.width * y + x) << 2;
    if (png.data[i] < 170 && png.data[i + 1] < 170 && png.data[i + 2] < 170) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  }
  expect(x1 > x0, `${label}: the flyout caption is painted`).toBe(true);
  return { box: boxes.box, items: boxes.items, captionInk: { x0: clip.x + x0, x1: clip.x + x1, y0: clip.y + y0, y1: clip.y + y1 } };
}

const center = (ink: { x0: number; x1: number }): number => (ink.x0 + ink.x1) / 2;

for (const label of GROUPS) {
  test(`${label}: flyout hugs its content like the trial (box, item widths, caption)`, async ({ browser }) => {
    const official = await browser.newPage({ viewport: VIEWPORT });
    const ours = await browser.newPage({ viewport: VIEWPORT });
    try {
      await boot(official, 'official'); await boot(ours, 'ours');
      await openGroup(official, label); await openGroup(ours, label);
      const a = await flyoutBoxes(official, label);
      const b = await flyoutBoxes(ours, label);

      expect(Math.abs(b.box.width - a.box.width), `${label}: flyout width vs trial ${a.box.width}x${a.box.height}`).toBeLessThanOrEqual(2);
      expect(Math.abs(b.box.height - a.box.height), `${label}: flyout height vs trial`).toBeLessThanOrEqual(2);
      expect(b.box.x, `${label}: flyout left edge`).toBe(a.box.x);
      expect(b.box.y, `${label}: flyout top edge`).toBe(a.box.y);

      expect(b.items.length, `${label}: item count`).toBe(a.items.length);
      a.items.forEach((item, index) => {
        const mine = b.items[index];
        expect(mine.label, `${label}: item ${index} label`).toBe(item.label);
        expect(Math.abs(mine.width - item.width), `${label}: ${item.label} item width (trial ${item.width})`).toBeLessThanOrEqual(1);
        expect(mine.height, `${label}: ${item.label} item height`).toBe(item.height);
        expect(Math.abs(mine.x - item.x), `${label}: ${item.label} item x`).toBeLessThanOrEqual(2);
        expect(Math.abs(mine.y - item.y), `${label}: ${item.label} item y`).toBeLessThanOrEqual(1);
        // one line vs two lines must agree with the trial (e.g. "Cell Editors" stays single-line)
        expect(mine.labelHeight, `${label}: ${item.label} label block height (trial ${item.labelHeight} = ${item.labelHeight > 20 ? 'two' : 'one'} lines)`).toBe(item.labelHeight);
        expect(Math.abs(mine.labelWidth - item.labelWidth), `${label}: ${item.label} label width (trial ${item.labelWidth})`).toBeLessThanOrEqual(1);
      });

      // The caption ink is centred on the flyout, like the trial.
      expect(Math.abs(center(b.captionInk) - (b.box.x + b.box.width / 2)), `${label}: caption centred in the flyout (trial centre ${center(a.captionInk) - (a.box.x + a.box.width / 2)})`).toBeLessThanOrEqual(2);
      expect(Math.abs((b.captionInk.x1 - b.captionInk.x0) - (a.captionInk.x1 - a.captionInk.x0)), `${label}: caption ink width (trial ${a.captionInk.x1 - a.captionInk.x0})`).toBeLessThanOrEqual(3);
      expect(Math.abs((b.captionInk.y1 - b.captionInk.y0) - (a.captionInk.y1 - a.captionInk.y0)), `${label}: caption ink height (trial ${a.captionInk.y1 - a.captionInk.y0})`).toBeLessThanOrEqual(2);
    } finally { await official.close(); await ours.close(); }
  });
}

for (const side of ['official', 'ours'] as const) {
  test(`${side}: collapse arrow is a small filled triangle and the open group stays shaded`, async ({ browser }) => {
    const page = await browser.newPage({ viewport: VIEWPORT });
    await boot(page, side);
    const at = await page.evaluate(() => {
      const cands = [...document.querySelectorAll('[data-buttontype="dropdown"]')].filter((e) => (e.getAttribute('aria-label') || '').trim() === 'Cells');
      const host = cands[0];
      const r = host.getBoundingClientRect();
      const tri = host.querySelector('.ribbon-button-thumbnail-group-icon')!.getBoundingClientRect();
      return { host: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }, tri: { x: Math.round(tri.x), y: Math.round(tri.y), w: Math.round(tri.width), h: Math.round(tri.height) } };
    });
    const arrow = async (): Promise<{ n: number; w: number; h: number }> => {
      const png = PNG.sync.read(await page.screenshot({ clip: { x: at.tri.x, y: at.tri.y, width: at.tri.w, height: at.tri.h } }));
      let n = 0, x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
      for (let y = 0; y < png.height; y++) for (let x = 0; x < png.width; x++) {
        const i = (png.width * y + x) << 2;
        if (png.data[i] < 200 && png.data[i + 1] < 200 && png.data[i + 2] < 200) { n++; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
      }
      return { n, w: x1 - x0 + 1, h: y1 - y0 + 1 };
    };
    const ink = await arrow();
    // The trial paints a 9x6 filled ▼ (~30 dark pixels); a thin chevron of the same size has far
    // fewer dark pixels for its box, so the ink count is what separates the two drawings.
    expect(ink.w, 'arrow ink width').toBeGreaterThanOrEqual(7);
    expect(ink.w, 'arrow ink width').toBeLessThanOrEqual(12);
    expect(ink.h, 'arrow ink height').toBeGreaterThanOrEqual(5);
    expect(ink.h, 'arrow ink height').toBeLessThanOrEqual(8);
    expect(ink.n / (ink.w * ink.h), 'arrow is filled (>= half of its box is ink)').toBeGreaterThanOrEqual(0.45);

    // Pressed state: grey fill on the whole button while the flyout is open, pointer parked away.
    await page.mouse.click(at.host.x + at.host.w / 2, at.host.y + at.host.h / 2);
    await page.waitForTimeout(400);
    await page.mouse.move(at.host.x + at.host.w / 2, 420);
    await page.waitForTimeout(400);
    const bg = PNG.sync.read(await page.screenshot({ clip: { x: at.host.x + at.host.w - 10, y: at.host.y + 6, width: 4, height: 4 } }));
    const sample = { r: bg.data[0], g: bg.data[1], b: bg.data[2] };
    expect(Math.abs(sample.r - 235), `${side}: open group button background stays shaded (${sample.r},${sample.g},${sample.b})`).toBeLessThanOrEqual(8);
    expect(sample.r, 'shading is neutral grey').toBe(sample.g);
    await page.close();
  });
}
