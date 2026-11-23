/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * TASK 98 item 3 — classic-comment box anchor, ours vs the trial on the same scenario page.
 * Black-box measurement (2026-11-23): the trial's shown comment box sits 17 px right of the
 * host cell's right edge and 16 px above the cell's top edge. Its corner geometry is read
 * from the trial's own DOM: the box `.gc-spread-host-container` rect and the 30x31
 * `.gc-spread-lineCanvas` whose ink corners are the cell top-right corner (leftmost bottom
 * arrow ink) — the connector endpoints are pure geometry, not copied pixels. Ours is read
 * from the box host's style offsets against the public `sheet.getCellRect` (same viewport
 * coordinate system). Both sides must agree. Before this fix ours used +9/-19 (box 8 px too
 * far left, 3 px too high).
 */
import { expect, test, type Page } from '@playwright/test';

async function openScenario(page: Page): Promise<void> {
  await page.goto('/?scenario=t56-comments-box');
  await page.waitForFunction(() => (window as any).__compare?.ready);
  await page.waitForTimeout(400);
}

interface Anchor { dx: number; dy: number }

async function trialAnchor(page: Page): Promise<Anchor> {
  return page.evaluate(() => {
    const pane = document.getElementById('official-pane')!;
    const canvas = pane.querySelector<HTMLCanvasElement>('.gc-spread-lineCanvas')!;
    const box = [...pane.querySelectorAll<HTMLElement>('.gc-spread-host-container')]
      .find((e) => /always visible/.test(e.textContent ?? ''))!;
    const cb = canvas.getBoundingClientRect();
    const ctx = canvas.getContext('2d')!;
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    // The arrowhead is the leftmost ink cluster; its bottom edge is the cell corner.
    let minX = 1e9, maxYatMinX = -1;
    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width; x++) {
        const k = (y * canvas.width + x) * 4;
        if (data[k + 3] > 0 && data[k] < 150) {
          if (x < minX) { minX = x; maxYatMinX = y; }
          else if (x <= minX + 1 && y > maxYatMinX) maxYatMinX = y;
        }
      }
    }
    const cellCorner = { x: cb.x + minX, y: cb.y + maxYatMinX };
    const bb = box.getBoundingClientRect();
    return { dx: Math.round(bb.x - cellCorner.x), dy: Math.round(bb.y - cellCorner.y) };
  });
}

async function oursAnchor(page: Page): Promise<Anchor> {
  return page.evaluate(() => {
    const pane = document.getElementById('ours-pane')!;
    const box = [...pane.querySelectorAll<HTMLElement>('.gc-spread-host-container')]
      .find((e) => /always visible/.test(e.textContent ?? ''))!;
    const sheet = (window as any).__compare.ours.getActiveSheet();
    const rect = sheet.getCellRect(3, 1); // same viewport system the host style offsets use
    return { dx: parseFloat(box.style.left) - (rect.x + rect.width), dy: parseFloat(box.style.top) - rect.y };
  });
}

test('classic comment box anchor matches the trial (17 px right, 16 px above the cell)', async ({ page }) => {
  await openScenario(page);
  const trial = await trialAnchor(page);
  const ours = await oursAnchor(page);
  expect(ours.dx - trial.dx, `horizontal gap ours=${ours.dx} trial=${trial.dx}`).toBe(0);
  expect(ours.dy - trial.dy, `vertical offset ours=${ours.dy} trial=${trial.dy}`).toBe(0);
  expect(trial.dx).toBe(17);
  expect(trial.dy).toBe(-16);
});
