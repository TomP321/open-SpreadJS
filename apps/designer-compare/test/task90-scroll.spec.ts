/* eslint-disable @typescript-eslint/no-explicit-any */
/* TASK 90 C — paired scroll behaviour on the real page with the real Playwright mouse: the user
 * reported "the freeze panes don't let me scroll ... I have to click the scrollbar at specific
 * spots" and "the bar does not move with the cursor".
 *
 * What this spec pins (measured trial values in `.probe/t90/scroll2-r7.json`, `wheel3-r1.json`,
 * `hbar-r1.json`, `frozen-nav-r1.json`):
 *  - a thumb drag that LEAVES the 15px bar (pointer drifts sideways while the button is held)
 *    keeps following the pointer: the thumb and the viewport move LIVE on every single move step;
 *  - the trial quantizes the drag in whole ITEMS - `round(pointerDelta * lastItem / (track -
 *    thumb))` - so its trails are `22/40/59/77/96` rows (frozen 3, 20px steps), `19/38/57/76/95`
 *    (plain), the same at zoom 1 and 1.5, and `4/6/8/10` / `2/5/7/9` columns for 30px steps;
 *  - the wheel steps 3 rows/3 columns per event whatever the delta (touchpad deltas included),
 *    over the scrollable pane, the frozen block and the row headers alike;
 *  - one arrow click moves exactly one row/column; keyboard navigation walks across the frozen
 *    line without moving the frozen viewport.
 *
 * Known residual gap (documented in STATUS "TASK 90"): horizontal thumb drag at zoom 1.5 WITH
 * frozen columns diverges by one column on the 4th step (trial 4/5/7/8, ours 4/5/7/9) because the
 * trial's horizontal thumb at that layout (93px) is shorter than any extent-ratio fit we measured
 * (ours 100px); the vertical bars and all zoom-1 trails match item-for-item. */
import { expect, test, type Page } from '@playwright/test';
import { boot } from './helpers';

interface Bar { x: number; y: number; w: number; h: number; trackX: number; trackY: number; trackW: number; trackH: number }
interface State { topRow: number; leftCol: number; active: [number, number]; vertical: Bar | null; horizontal: Bar | null }

async function sheetPage(browser: import('@playwright/test').Browser, side: 'official' | 'ours', options: { width?: number; height?: number; dpr?: number } = {}): Promise<Page> {
  const page = await browser.newPage({ viewport: { width: options.width ?? 900, height: options.height ?? 480 }, deviceScaleFactor: options.dpr ?? 1 });
  await boot(page, side);
  return page;
}

async function setupSheet(page: Page, frozenRows: number, frozenCols: number, zoom: number): Promise<void> {
  await page.evaluate(({ frozenRows, frozenCols, zoom }) => {
    const s = (window as any).__designerCompare.spread.getActiveSheet();
    s.frozenRowCount(frozenRows);
    s.frozenColumnCount(frozenCols);
    s.zoom(zoom);
  }, { frozenRows, frozenCols, zoom });
  await page.waitForTimeout(300);
  await resetScroll(page, frozenRows, frozenCols);
}

async function resetScroll(page: Page, frozenRows: number, frozenCols: number): Promise<void> {
  await page.evaluate(({ frozenRows, frozenCols }) => {
    const s = (window as any).__designerCompare.spread.getActiveSheet();
    s.showCell(frozenRows, frozenCols, 0, 0); // pin the scrolling pane back to the frozen line
  }, { frozenRows, frozenCols });
  await page.waitForTimeout(150);
}

async function state(page: Page): Promise<State> {
  return page.evaluate(() => {
    const s = (window as any).__designerCompare.spread.getActiveSheet();
    const bars = [...document.querySelectorAll('.gc-scroll-handle')].map((n) => {
      const r = n.getBoundingClientRect(), t = n.parentElement!.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height, trackX: t.x, trackY: t.y, trackW: t.width, trackH: t.height };
    });
    return {
      topRow: s.getViewportTopRow(1),
      leftCol: s.getViewportLeftColumn(1),
      active: [s.getActiveRowIndex(), s.getActiveColumnIndex()],
      vertical: bars.find((b) => b.trackH > b.trackW) ?? null,
      horizontal: bars.find((b) => b.trackW >= b.trackH) ?? null,
    };
  });
}

/** Drag a thumb with a real mouse, drifting `driftPx` perpendicular to the bar (out of the 15px
 *  band) on every step; record viewport AND thumb after every single move event. */
async function dragTrail(page: Page, bar: Bar, axis: 'v' | 'h', driftPx: number, alongPx: number, steps: number) {
  const cx = bar.x + bar.w / 2, cy = bar.y + bar.h / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  const trail: { along: number; topRow: number; leftCol: number; thumbAlong: number; thumbLen: number }[] = [];
  for (let i = 1; i <= steps; i++) {
    const x = axis === 'v' ? cx + driftPx * i : cx + alongPx * i;
    const y = axis === 'v' ? cy + alongPx * i : cy + driftPx * i;
    await page.mouse.move(x, y, { steps: 3 }); // the pointer LEAVES the bar on every step
    await page.waitForTimeout(60);
    const s = await state(page);
    const b = axis === 'v' ? s.vertical! : s.horizontal!;
    trail.push({ along: axis === 'v' ? y : x, topRow: s.topRow, leftCol: s.leftCol, thumbAlong: axis === 'v' ? b.y : b.x, thumbLen: axis === 'v' ? b.h : b.w });
  }
  await page.mouse.up(); // release wherever the pointer happens to be (outside the bar)
  return trail;
}

const rows = (t: { topRow: number }[]): number[] => t.map((x) => x.topRow);
const cols = (t: { leftCol: number }[]): number[] => t.map((x) => x.leftCol);

test.describe('TASK 90 C paired scrollbar/wheel behaviour', () => {
  test('vertical thumb drag that leaves the bar follows the pointer live and matches the trial trail (frozen)', async ({ browser }) => {
    const frozenTrail: Array<['official' | 'ours', number[]]> = [['official', [22, 40, 59, 77, 96]], ['ours', [22, 40, 59, 77, 96]]];
    for (const [side, expected] of frozenTrail) {
      const page = await sheetPage(browser, side);
      try {
        await setupSheet(page, 3, 0, 1);
        const before = await state(page);
        expect(before.topRow, side).toBe(3);
        const trail = await dragTrail(page, before.vertical!, 'v', 60, 20, 5);
        expect(rows(trail), side).toEqual(expected);
        // live on EVERY step: the viewport AND the thumb advance on every single move event
        for (let i = 0; i < trail.length; i++) {
          expect(trail[i].topRow, `${side} step ${i + 1} viewport`).toBeGreaterThan(i === 0 ? 3 : trail[i - 1].topRow);
          expect(trail[i].thumbAlong, `${side} step ${i + 1} thumb`).toBeGreaterThan(i === 0 ? before.vertical!.y : trail[i - 1].thumbAlong);
        }
        const held = await state(page);
        await page.mouse.move(held.vertical!.x + 300, held.vertical!.y + 40); // pointer keeps moving AFTER release
        await page.waitForTimeout(120);
        expect((await state(page)).topRow, side).toBe(held.topRow); // no scrolling without the button held
      } finally { await page.close(); }
    }
  });

  test('vertical thumb drag on a plain sheet matches the trial trail (19/38/57/76/95)', async ({ browser }) => {
    for (const side of ['official', 'ours'] as const) {
      const page = await sheetPage(browser, side);
      try {
        await setupSheet(page, 0, 0, 1);
        const before = await state(page);
        const trail = await dragTrail(page, before.vertical!, 'v', 60, 20, 5);
        expect(rows(trail), side).toEqual([19, 38, 57, 76, 95]);
      } finally { await page.close(); }
    }
  });

  test('the drag mapping is zoom-invariant (item units): frozen z1.5 lands on the same rows as z1', async ({ browser }) => {
    for (const side of ['official', 'ours'] as const) {
      const page = await sheetPage(browser, side);
      try {
        await setupSheet(page, 3, 2, 1.5);
        const before = await state(page);
        const trail = await dragTrail(page, before.vertical!, 'v', 60, 20, 5);
        expect(rows(trail), side).toEqual([22, 40, 59, 77, 96]);
      } finally { await page.close(); }
    }
  });

  test('horizontal thumb drag drifting off the bar matches the trial at zoom 1 (frozen 4/6/8/10, plain 2/5/7/9)', async ({ browser }) => {
    const cases: Array<{ frozen: number; expected: number[] }> = [{ frozen: 2, expected: [4, 6, 8, 10] }, { frozen: 0, expected: [2, 5, 7, 9] }];
    for (const { frozen, expected } of cases) {
      for (const side of ['official', 'ours'] as const) {
        const page = await sheetPage(browser, side);
        try {
          await setupSheet(page, 0, frozen, 1);
          const before = await state(page);
          const trail = await dragTrail(page, before.horizontal!, 'h', 60, 30, 4);
          expect(cols(trail), side).toEqual(expected);
          for (let i = 0; i < trail.length; i++) {
            expect(trail[i].leftCol, `${side} step ${i + 1}`).toBeGreaterThan(i === 0 ? frozen : trail[i - 1].leftCol);
            expect(trail[i].thumbAlong, `${side} step ${i + 1} thumb`).toBeGreaterThan(i === 0 ? before.horizontal!.x : trail[i - 1].thumbAlong);
          }
        } finally { await page.close(); }
      }
    }
  });

  test('HiDPI (dpr 1.25 / 1.5): the drag still leaves the bar and matches the trial trail', async ({ browser }) => {
    for (const dpr of [1.25, 1.5] as const) {
      for (const side of ['official', 'ours'] as const) {
        const page = await sheetPage(browser, side, { dpr });
        try {
          await setupSheet(page, 3, 2, 1);
          const before = await state(page);
          const trail = await dragTrail(page, before.vertical!, 'v', 60, 20, 5);
          expect(rows(trail), side).toEqual([22, 40, 59, 77, 96]);
        } finally { await page.close(); }
      }
    }
  });

  test('wheel: 3 rows / 3 columns per event whatever the delta, over scrollable, frozen and header alike', async ({ browser }) => {
    const official = await sheetPage(browser, 'official');
    const ours = await sheetPage(browser, 'ours');
    try {
      for (const page of [official, ours]) await setupSheet(page, 3, 2, 1);
      const canvas = await state(official);
      expect(canvas.vertical!.trackW).toBeGreaterThan(0);
      const cellPoint = async (page: Page, row: number, col: number) => page.evaluate(({ row, col }) => {
        const s = (window as any).__designerCompare.spread.getActiveSheet();
        const c = [...document.querySelectorAll('canvas')].map((n) => n.getBoundingClientRect()).sort((a, b) => b.width * b.height - a.width * a.height)[0];
        const r = s.getCellRect(row, col);
        return { x: c.x + r.x + r.width / 2, y: c.y + r.y + r.height / 2 };
      }, { row, col });
      const scrollPoint = await cellPoint(official, 6, 5);
      const frozenPoint = await cellPoint(official, 1, 1);
      const headerPoint = { x: scrollPoint.x - 380, y: scrollPoint.y }; // over the row headers

      const wheelCase = async (label: string, x: number, y: number, deltaX: number, deltaY: number, shift = false) => {
        const read: string[] = [];
        for (const [, page] of [['official', official], ['ours', ours]] as const) {
          await setupSheet(page, 3, 2, 1); // reset every case to the same origin
          await page.mouse.move(x, y);
          if (shift) await page.keyboard.down('Shift');
          await page.mouse.wheel(deltaX, deltaY);
          await page.waitForTimeout(160);
          if (shift) await page.keyboard.up('Shift');
          const s = await state(page);
          read.push(`${s.topRow}/${s.leftCol}`);
        }
        const [officialPos, oursPos] = read;
        expect(oursPos, `${label} (official ${officialPos})`).toBe(officialPos);
        return officialPos;
      };

      expect(await wheelCase('deltaY 40', scrollPoint.x, scrollPoint.y, 0, 40)).toBe('6/2');
      expect(await wheelCase('deltaY 4 (touchpad)', scrollPoint.x, scrollPoint.y, 0, 4)).toBe('6/2');
      expect(await wheelCase('deltaY -12 back', scrollPoint.x, scrollPoint.y, 0, -12)).toBe('3/2');
      expect(await wheelCase('deltaX 60 sideways', scrollPoint.x, scrollPoint.y, 60, 0)).toBe('3/5');
      expect(await wheelCase('shift+wheel sideways', scrollPoint.x, scrollPoint.y, 0, 40, true)).toBe('3/5');
      expect(await wheelCase('wheel over FROZEN block', frozenPoint.x, frozenPoint.y, 0, 40)).toBe('6/2');
      expect(await wheelCase('wheel over ROW HEADERS', headerPoint.x, headerPoint.y, 0, 40)).toBe('6/2');
    } finally { await official.close(); await ours.close(); }
  });

  test('scrollbar arrows move exactly one row/column per click on both bars (frozen)', async ({ browser }) => {
    const official = await sheetPage(browser, 'official');
    const ours = await sheetPage(browser, 'ours');
    try {
      for (const [side, page] of [['official', official], ['ours', ours]] as const) {
        await setupSheet(page, 3, 2, 1);
        const s = await state(page);
        const v = s.vertical!, h = s.horizontal!;
        // human-paced clicks (150 ms): at machine click rates the trial's jQuery buttons swallow
        // repeated events (`.probe/t90/arrow2.mjs` official 3/4/5/5/5/5) — no real user clicks
        // that fast, and both implementations agree on one item per human click.
        for (let i = 0; i < 5; i++) { await page.mouse.click(v.x + v.w / 2, v.trackY + v.trackH + 7); await page.waitForTimeout(150); } // down arrow
        const afterDown = await state(page);
        expect([afterDown.topRow, afterDown.leftCol], side).toEqual([8, 2]);
        for (let i = 0; i < 3; i++) { await page.mouse.click(v.x + v.w / 2, v.trackY - 7); await page.waitForTimeout(150); } // up arrow
        expect((await state(page)).topRow, side).toBe(5);
        for (let i = 0; i < 4; i++) { await page.mouse.click(h.trackX + h.trackW + 7, h.y + h.h / 2); await page.waitForTimeout(150); } // right arrow
        expect((await state(page)).leftCol, side).toBe(6);
        for (let i = 0; i < 2; i++) { await page.mouse.click(h.trackX - 7, h.y + h.h / 2); await page.waitForTimeout(150); } // left arrow
        expect((await state(page)).leftCol, side).toBe(4);
      }
    } finally { await official.close(); await ours.close(); }
  });

  test('a track click pages the sheet the same way in both implementations', async ({ browser }) => {
    const official = await sheetPage(browser, 'official');
    const ours = await sheetPage(browser, 'ours');
    try {
      let first = 0;
      for (const [side, page] of [['official', official], ['ours', ours]] as const) {
        await setupSheet(page, 3, 0, 1);
        const s = await state(page);
        const v = s.vertical!;
        await page.mouse.click(v.x + v.w / 2, v.trackY + v.trackH - 4); // click the track below the thumb
        await page.waitForTimeout(200);
        const after = await state(page);
        expect(after.topRow, side).toBeGreaterThan(s.topRow);
        if (side === 'official') first = after.topRow;
        else expect(after.topRow, `track click pages to the same row as the official (${first})`).toBe(first);
      }
    } finally { await official.close(); await ours.close(); }
  });

  test('keyboard navigation walks across the frozen line without scrolling the frozen block', async ({ browser }) => {
    const official = await sheetPage(browser, 'official');
    const ours = await sheetPage(browser, 'ours');
    try {
      const trail: string[] = [];
      for (const [side, page] of [['official', official], ['ours', ours]] as const) {
        await setupSheet(page, 3, 2, 1);
        // physical click inside the frozen cell (0,0): focus the sheet AND select the cell
        const p = await page.evaluate(() => {
          const s = (window as any).__designerCompare.spread.getActiveSheet();
          const c = [...document.querySelectorAll('canvas')].map((n) => n.getBoundingClientRect()).sort((a, b) => b.width * b.height - a.width * a.height)[0];
          const r = s.getCellRect(0, 0);
          return { x: c.x + r.x + r.width / 2, y: c.y + r.y + r.height / 2 };
        });
        await page.mouse.click(p.x, p.y);
        await page.waitForTimeout(120);
        expect((await state(page)).active, `${side} click selects the frozen cell`).toEqual([0, 0]);
        const steps: string[] = [];
        for (const key of ['ArrowDown', 'ArrowDown', 'ArrowDown', 'ArrowDown', 'ArrowDown', 'ArrowDown', 'ArrowRight', 'ArrowRight', 'ArrowRight']) {
          await page.keyboard.press(key);
          await page.waitForTimeout(70);
          const s = await state(page);
          steps.push(`${s.active[0]}/${s.active[1]}@${s.topRow}/${s.leftCol}`);
        }
        trail.push(steps.join(' '));
      }
      const [officialTrail, oursTrail] = trail;
      expect(oursTrail, `keyboard across the frozen line (official ${officialTrail})`).toBe(officialTrail);
      // and the trial semantics we measured in `.probe/t90/frozen-nav-r1.json`: the viewport does
      // not move while the frozen rows are navigated, then follows the active cell past them
      expect(officialTrail.split(' ')[4]).toContain('@3/2'); // row 4 active, viewport still at 3
    } finally { await official.close(); await ours.close(); }
  });
});
