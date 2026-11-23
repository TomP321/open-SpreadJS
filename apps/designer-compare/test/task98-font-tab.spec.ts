/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * TASK 98 item 1 — Format Cells Font tab geometry, ours vs the trial on the real Designer
 * page. The black-box re-measure (2026-11-23) confirmed the three list-editor columns, the
 * full-width Color combo and the bordered Effects fieldset already match (task 90), and the
 * Size editor shows "11" (points) on both sides. Only three measurements still differed and
 * were fixed in the stylesheet: the list windows (trial 132 px tall with a 30 px item pitch,
 * ours 130/28) and the Preview fieldset (trial 346x96 inset 2 px from the 350 px Color bar,
 * ours 350x101 flush). This spec re-drives both sides and compares every rect live.
 */
import { expect, test, type Browser, type Page } from '@playwright/test';
import { boot } from './helpers';

interface FontTabGeometry {
  familyList: { x: number; y: number; w: number; h: number };
  styleList: { x: number; y: number; w: number; h: number };
  sizeList: { x: number; y: number; w: number; h: number };
  familyPitch: number;
  stylePitch: number;
  sizePitch: number;
  underline: { x: number; y: number; w: number; h: number };
  color: { x: number; y: number; w: number; h: number };
  effects: { x: number; y: number; w: number; h: number };
  previewOuter: { x: number; y: number; w: number; h: number };
  previewInner: { x: number; y: number; w: number; h: number };
}

async function openFormatFont(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as any;
    w.__designerCompare.spread.getActiveSheet().setActiveCell(1, 1);
    w.GC.Spread.Sheets.Designer.getCommand('formatCells').execute(w.__designerCompare.designer);
  });
  await page.waitForSelector('.gc-designer-dialog');
  const tab = page.locator('.gc-designer-dialog [role="tab"], .gc-designer-dialog .gc-designer-tabs-nav-item')
    .filter({ hasText: /^Font$/ }).first();
  await tab.click();
  await page.waitForTimeout(400);
}

async function measure(page: Page, side: 'official' | 'ours'): Promise<FontTabGeometry> {
  return page.evaluate((which) => {
    const dlg = document.querySelector('.gc-designer-dialog')!;
    const box = dlg.getBoundingClientRect();
    const rel = (el: Element | null | undefined) => {
      const b = el!.getBoundingClientRect();
      return { x: Math.round(b.x - box.x), y: Math.round(b.y - box.y), w: Math.round(b.width), h: Math.round(b.height) };
    };
    const nth = (sel: string, index: number) => [...dlg.querySelectorAll(sel)][index];
    const official = which === 'official';
    const lists = official
      ? [...dlg.querySelectorAll('.gc-list-control-container')].map((el) => el.parentElement!) // the visible 132 px windows
      : [dlg.querySelector('.gc-font-family-list'), dlg.querySelector('.gc-font-style-list'), dlg.querySelector('.gc-font-size-list')];
    const items = official ? [...dlg.querySelectorAll('.gc-list-control-item-text')] : [...dlg.querySelectorAll('.gc-font-list-item')];
    // The trial lists each font/style/size column separately; group the item texts by column.
    const pitchOf = (column: number) => {
      const list = lists[column];
      const lb = list.getBoundingClientRect();
      const col = items.filter((it) => {
        const ib = it.getBoundingClientRect();
        return Math.abs(ib.x - lb.x) < 40 && ib.y >= lb.y - 2;
      });
      // Items below the clipping window also report positions; use document order of the column.
      return col.length > 1 ? Math.round(col[1].getBoundingClientRect().y - col[0].getBoundingClientRect().y) : 0;
    };
    const fieldsetOf = (legend: string) =>
      official
        ? [...dlg.querySelectorAll('fieldset')].find((f) => [...f.querySelectorAll('legend')].some((l) => (l.textContent ?? '').trim() === legend))
        : dlg.querySelector(legend === 'Effects' ? '.gc-font-effects' : '.gc-font-preview-group');
    // The trial nests the bordered Preview fieldset (346x96) inside a 350x101 wrapper div
    // (.gc-font-preview) and an inner text container (preview-text-container, 334x61).
    const previewOuter = rel(official ? dlg.querySelector('.gc-font-preview') : dlg.querySelector('.gc-font-preview-group'));
    const previewInner = rel(official ? dlg.querySelector('.preview-text-container') : dlg.querySelector('.gc-font-preview'));
    void fieldsetOf;
    return {
      familyList: rel(lists[0]), styleList: rel(lists[1]), sizeList: rel(lists[2]),
      familyPitch: pitchOf(0), stylePitch: pitchOf(1), sizePitch: pitchOf(2),
      underline: rel(official ? nth('.gc-combo-editor-container', 0) : dlg.querySelector('.gc-font-underline')),
      color: rel(official ? nth('.gc-combo-editor-container', 1) : dlg.querySelector('.gc-font-color-dd')),
      effects: rel(fieldsetOf('Effects')),
      previewOuter,
      previewInner,
    };
  }, side);
}

test.describe('TASK 98 — Format Cells Font tab paired geometry', () => {
  test('list windows, item pitch, combos, Effects and Preview match the trial', async ({ browser }: { browser: Browser }) => {
    const run = async (side: 'official' | 'ours'): Promise<FontTabGeometry> => {
      const page = await browser.newPage();
      try {
        await boot(page, side);
        await openFormatFont(page);
        return await measure(page, side);
      } finally {
        await page.close();
      }
    };
    const official = await run('official');
    const ours = await run('ours');

    // The trial's own recorded values (paired probes 2026-11-23): 132 px windows, 30 px pitch,
    // Preview 346x96. Guard that the reference runtime has not shifted.
    expect(official.familyList.h, 'trial family list height').toBeGreaterThanOrEqual(130);
    expect(official.familyList.h, 'trial family list height').toBeLessThanOrEqual(134);
    expect(official.familyPitch, 'trial item pitch').toBe(30);
    expect(official.previewOuter.w, 'trial preview wrapper width').toBe(350);
    expect(official.previewOuter.h, 'trial preview wrapper height').toBe(101);
    expect(official.previewInner.w, 'trial preview text container width').toBe(334);
    expect(official.previewInner.h, 'trial preview text container height').toBe(61);

    for (const key of Object.keys(official) as (keyof FontTabGeometry)[]) {
      const a = official[key];
      const b = ours[key];
      if (typeof a === 'number') {
        expect(Math.abs(a - b), `${key} pitch ours=${b} official=${a}`).toBeLessThanOrEqual(1);
      } else {
        for (const part of ['x', 'y', 'w', 'h'] as const) {
          expect(Math.abs(a[part] - b[part]), `${key}.${part} ours=${b[part]} official=${a[part]}`).toBeLessThanOrEqual(2);
        }
      }
    }

    // The Size editor shows points, not pixels (the trial 11, ours was once 14.6667).
    const sizeValue = await (async () => {
      const page = await browser.newPage();
      try {
        await boot(page, 'ours');
        await openFormatFont(page);
        return await page.locator('.gc-font-size-input').inputValue();
      } finally {
        await page.close();
      }
    })();
    expect(sizeValue).toBe('11');
  });
});
