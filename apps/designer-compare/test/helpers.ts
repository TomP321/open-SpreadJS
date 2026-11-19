/* eslint-disable @typescript-eslint/no-explicit-any */
import { expect, type Locator, type Page } from '@playwright/test';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

export type Side = 'official' | 'ours';

export async function boot(page: Page, side: Side): Promise<void> {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`/?side=${side}&embed=1`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => (window as any).__designerCompare?.ready === true, null, { timeout: 30_000 });
  await page.waitForTimeout(250);
  if (errors.length) throw new Error(`${side} page errors: ${errors.join('\n')}`);
}

export interface Box { x: number; y: number; width: number; height: number }
export function roundBox(box: Box): Box {
  return { x: +box.x.toFixed(2), y: +box.y.toFixed(2), width: +box.width.toFixed(2), height: +box.height.toFixed(2) };
}
export function expectBoxClose(actual: Box, expected: Box, tolerance = 1, label = ''): void {
  const a = roundBox(actual), e = roundBox(expected);
  expect(a.x, `${label} x`).toBeGreaterThanOrEqual(e.x - tolerance);
  expect(a.x, `${label} x`).toBeLessThanOrEqual(e.x + tolerance);
  expect(a.y, `${label} y`).toBeGreaterThanOrEqual(e.y - tolerance);
  expect(a.y, `${label} y`).toBeLessThanOrEqual(e.y + tolerance);
  expect(a.width, `${label} width`).toBeGreaterThanOrEqual(e.width - tolerance);
  expect(a.width, `${label} width`).toBeLessThanOrEqual(e.width + tolerance);
  expect(a.height, `${label} height`).toBeGreaterThanOrEqual(e.height - tolerance);
  expect(a.height, `${label} height`).toBeLessThanOrEqual(e.height + tolerance);
}

export async function captureWithMask(page: Page, clip: { x: number; y: number; width: number; height: number }, maskSelectors: string[], extraMask: { x: number; y: number; width: number; height: number }[] = []): Promise<{ png: PNG; mask: Uint8Array }> {
  const buffer = await page.screenshot({ clip });
  const png = PNG.sync.read(buffer);
  const boxes = await page.evaluate(({ selectors, clip }) => {
    const found: { x: number; y: number; width: number; height: number }[] = [];
    for (const selector of selectors) {
      for (const element of document.querySelectorAll(selector)) {
        const r = element.getBoundingClientRect();
        if (r.width <= 0 || r.height <= 0) continue;
        found.push({ x: r.x - clip.x, y: r.y - clip.y, width: r.width, height: r.height });
      }
    }
    return found;
  }, { selectors: maskSelectors, clip });
  const mask = new Uint8Array(png.width * png.height).fill(1);
  const scaleX = png.width / clip.width, scaleY = png.height / clip.height;
  const maskBox = (box: { x: number; y: number; width: number; height: number }): void => {
    const x0 = Math.max(0, Math.floor((box.x - 1) * scaleX));
    const y0 = Math.max(0, Math.floor((box.y - 1) * scaleY));
    const x1 = Math.min(png.width, Math.ceil((box.x + box.width + 1) * scaleX));
    const y1 = Math.min(png.height, Math.ceil((box.y + box.height + 1) * scaleY));
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) mask[y * png.width + x] = 0;
  };
  for (const box of [...boxes, ...extraMask]) maskBox(box);
  return { png, mask };
}

export function comparePngs(a: PNG, b: PNG, maskA?: Uint8Array, maskB?: Uint8Array): { raw: number; masked: number; denom: number; total: number } {
  const width = Math.min(a.width, b.width), height = Math.min(a.height, b.height);
  const diff = new PNG({ width, height });
  const total = pixelmatch(a.data, b.data, diff.data, width, height, { threshold: 0.1, includeAA: false });
  let masked = 0, denom = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = y * width + x;
      const inMaskA = maskA ? maskA[y * a.width + x] !== 0 : true;
      const inMaskB = maskB ? maskB[y * b.width + x] !== 0 : true;
      if (!inMaskA || !inMaskB) continue;
      denom++;
      const j = index * 4;
      if (a.data[j] !== b.data[j] || a.data[j + 1] !== b.data[j + 1] || a.data[j + 2] !== b.data[j + 2]) masked++;
    }
  }
  return { raw: total, masked, denom, total: width * height };
}

export function expectMaskedBelow(result: { masked: number; denom: number }, threshold = 0.5): void {
  const percentage = result.denom ? (result.masked / result.denom) * 100 : 0;
  expect(percentage, `masked pixel difference ${percentage.toFixed(3)}%`).toBeLessThan(threshold);
}

export async function dock(page: Page): Promise<number> {
  return page.evaluate(() => document.body.dataset.ready === 'true' ? 1 : 0);
}

/**
 * TASK 68 replaced the dialogs' native `<select>` controls with the trial's own combo box
 * (`CustomSelect`: a `role=combobox` field plus a `role=listbox` popup of
 * `.gc-dialog-list-item` rows), so Playwright's `selectOption` no longer applies to them.
 * `pickCombo` drives such a control through the real UI exactly the way the paired specs
 * already drive the trial's combo (`officialComboSelect` in format-cells-tabs.spec.ts), and
 * `comboText` reads what it shows. Options are matched by their visible label.
 */
const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export async function pickCombo(scope: Page | Locator, field: Locator, optionLabel: string): Promise<void> {
  const inner = field.locator('.gc-custom-select-field').first();
  const clickable = (await inner.count()) > 0 ? inner : field;
  await clickable.click();
  const open = scope.locator('.gc-custom-select.open');
  await expect(open).toHaveCount(1);
  const option = open.locator('.gc-dialog-list-item', { hasText: new RegExp(`^${escapeRegExp(optionLabel)}$`) });
  await expect(option).toHaveCount(1);
  await option.click();
  await expect(scope.locator('.gc-custom-select.open')).toHaveCount(0);
}

export function comboText(field: Locator): Locator {
  return field.locator('.gc-custom-select-text');
}
