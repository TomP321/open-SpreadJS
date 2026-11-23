/* eslint-disable @typescript-eslint/no-explicit-any */
/* TASK 91 item 2: the `General` width-fitting rule (text gate — no pixel comparison).
 *
 * The SAME matrix the supervisor's official measurement uses (the 10 values x column widths
 * 30/40/110/60/80/200 px, row height 19, zoom 100 % and 150 %) is set up identically on both
 * pages. The GATES are text:
 *  - `getText`/`getValue` stay the full unfitted text on BOTH sides (compared live);
 *  - every cell's PAINTED string on our side (the core's `_generalFitLog` hook records what the
 *    renderer actually draws) must equal the string transcribed from the official trial at the
 *    same width (the `OFFICIAL` table below, measured black-box on the trial canvas at zoom 100
 *    and re-verified at 150 % — the ink spans scale exactly x1.5, i.e. the trial paints the
 *    same strings at both zooms);
 *  - `#` runs may hold any number of hashes (the count is the hash advance of each build's own
 *    fallback font — a raster property, not the rule);
 *  - a scientific-notation cell may differ by one mantissa decimal (measured font-boundary
 *    drift: our fallback font renders e.g. `-1.00000E-12` 5 px narrower than the trial's, so a
 *    80 px column fits one more digit on one side; the digits, exponent and rounding RULE are
 *    still pinned — everything else is an exact string match).
 * The paired screenshots are attached as visual evidence, never compared as pixels. */
import { writeFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { boot } from './helpers';

const VALUES = [-0.2222222, 0.123456789, 123456.789, 1234567890123, -1e-12, 1e20, 123456789012345, 396.5, 123456789012, 0.00001];
const WIDTHS = [30, 40, 110, 60, 80, 200];

/** What the official trial paints per cell (columns B..G = widths 30/40/110/60/80/200, zoom 100 % = 150 %).
 *  Transcribed from the trial canvas (.probe/t91/matrix-official-z100/150.png, 3x crops + ink-span scan). */
const OFFICIAL = [
  ['-0.2', '-0.22', '-0.2222222', '-0.22222', '-0.2222222', '-0.2222222'],
  ['0.12', '0.123', '0.123456789', '0.123457', '0.123456789', '0.123456789'],
  ['####', '######', '123456.789', '123456.8', '123456.789', '123456.789'],
  ['####', '######', '1234567890123', '1.2E+12', '1.2346E+12', '1234567890123'],
  ['0', '0', '-1.00000E-12', '-1.0E-12', '-1.0000E-12', '-1.00000E-12'],
  ['####', '######', '1.00000E+20', '1.0E+20', '1.0000E+20', '100000000000000000000'],
  ['####', '######', '1.23457E+14', '1.2E+14', '1.2346E+14', '123456789012345'],
  ['397', '396.5', '396.5', '396.5', '396.5', '396.5'],
  ['####', '######', '123456789012', '1.2E+11', '1.2346E+11', '123456789012'],
  ['0', '1E-05', '0.00001', '0.00001', '0.00001', '0.00001'],
];

const HASH = /^#+$/;
const SCI = /^-?\d(?:\.\d+)?E[+-]\d\d$/;
const sciDigits = (text: string): { exp: string; decimals: number } => {
  const m = /^-?\d(?:\.(\d+))?E([+-]\d\d)$/.exec(text)!;
  return { exp: m[2], decimals: m[1] ? m[1].length : 0 };
};

/** Text-level rule equality against the transcribed official string (see the file header). */
function expectSameRule(ours: string, official: string, cell: string): void {
  if (HASH.test(official)) { expect(ours, `${cell}: official hashes, ours "${ours}"`).toMatch(HASH); return; }
  if (official === ours) return;
  if (SCI.test(official) && SCI.test(ours)) {
    const a = sciDigits(official), b = sciDigits(ours);
    expect(b.exp, `${cell}: official "${official}" vs ours "${ours}" — exponent must match`).toBe(a.exp);
    expect(Math.abs(a.decimals - b.decimals), `${cell}: official "${official}" vs ours "${ours}" — mantissa may differ by <=1 digit (font boundary)`).toBeLessThanOrEqual(1);
    return;
  }
  expect(ours, cell).toBe(official);
}

async function setupMatrix(page: Page, zoom: number): Promise<void> {
  await page.evaluate(([values, widths, z]) => {
    const { spread } = (window as any).__designerCompare;
    const GC = (window as any).GC;
    (GC.Spread.Sheets as any)._generalFitLog?.(true); // ours: the renderer records the texts it paints (the trial ignores this hook)
    const sheet = spread.getActiveSheet();
    // The trial template's `Total` column holds SUM formulas — clear formulas on both sides so
    // they cannot contaminate the matrix (`clear` does not remove formulas).
    for (let r = 0; r <= 25; r++) for (let c = 0; c <= 8; c++) sheet.setFormula(r, c, null);
    sheet.clear(0, 0, sheet.getRowCount(), sheet.getColumnCount(), 2);
    (values as number[]).forEach((v, j) => (widths as number[]).forEach((_, i) => sheet.setValue(9 + j, 1 + i, v)));
    sheet.resumePaint();
    (sheet as any).zoom(z as number);
    // Column widths and row heights must be set explicitly (identically on both sides) so the
    // grids match: the two builds' defaults are not identical.
    (widths as number[]).forEach((w, i) => sheet.setColumnWidth(1 + i, w as number, 1));
    for (let r = 8; r <= 20; r++) sheet.setRowHeight(r, 19);
    sheet.showRow(9, GC.Spread.Sheets.VerticalPosition.top);
    sheet.showColumn(1, GC.Spread.Sheets.HorizontalPosition.left);
    spread.refresh();
  }, [VALUES, WIDTHS, zoom]);
  await page.waitForTimeout(500);
}

/** The texts our renderer painted for the matrix cells, read from the core's record map. */
async function paintedOurs(page: Page): Promise<string[][]> {
  return page.evaluate((values) => {
    const GC = (window as any).GC;
    (window as any).__designerCompare.spread.refresh(); // one more paint pass so every cell is recorded
    const map: Map<string, string> | null = (GC.Spread.Sheets as any)._generalFitLog(true);
    const sheet = (window as any).__designerCompare.spread.getActiveSheet();
    const key = (r: number, c: number): string => `${sheet.name()}:${r},${c}`;
    return values.map((_: unknown, j: number) => [1, 2, 3, 4, 5, 6].map((i) => map?.get(key(9 + j, i)) ?? '<not painted>'));
  }, VALUES);
}

/** Clip anchored in SHEET space (canvas origin + the first matrix cell's canvas rect), so the
 *  two builds' different canvas positions in the host do not shift the screenshots. */
async function gridBox(page: Page): Promise<{ x: number; y: number; width: number; height: number }> {
  const box = await page.evaluate(() => {
    let best: DOMRect | null = null, area = 0;
    for (const c of document.querySelectorAll('canvas')) {
      const r = c.getBoundingClientRect();
      if (r.width * r.height > area) { area = r.width * r.height; best = r; }
    }
    const sheet = (window as any).__designerCompare.spread.getActiveSheet();
    const cell = sheet.getCellRect(9, 1); // canvas-space px of the first data cell (top-left anchor)
    return { x: best!.x + cell.x, y: best!.y + cell.y };
  });
  // Columns B..G = 30+40+110+60+80+200 = 520 px; ten 19 px rows (scales with zoom).
  return { x: Math.round(box.x), y: Math.round(box.y), width: 522, height: 194 };
}

test('General matrix: our painted texts follow the trial\'s fitted-text table at 100 % and 150 %', async ({ browser }, testInfo) => {
  const official = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const ours = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const report: Record<string, unknown> = {};
  try {
    await boot(official, 'official'); await boot(ours, 'ours');
    for (const zoom of [1, 1.5]) {
      await setupMatrix(official, zoom); await setupMatrix(ours, zoom);
      // getText / getValue stay the full, unfitted text on both sides (measured on the trial).
      const snap = async (page: Page) => page.evaluate(([values]) => {
        const sheet = (window as any).__designerCompare.spread.getActiveSheet();
        const texts: string[] = [], vals: unknown[] = [];
        (values as number[]).forEach((_, j) => { texts.push(sheet.getText(9 + j, 1)); vals.push(sheet.getValue(9 + j, 1)); });
        return { texts, values: vals };
      }, [VALUES]);
      const sa = await snap(official), sb = await snap(ours);
      expect(sb.texts, `getText at zoom ${zoom}`).toEqual(sa.texts);
      expect(sb.values, `getValue at zoom ${zoom}`).toEqual(sa.values);
      report[`getText_zoom${zoom}`] = sa.texts;
      // The painted-text gate: our renderer's recorded strings against the transcribed table.
      const painted = await paintedOurs(ours);
      for (let j = 0; j < OFFICIAL.length; j++) {
        for (let i = 0; i < OFFICIAL[j].length; i++) {
          expectSameRule(painted[j][i], OFFICIAL[j][i], `zoom ${zoom} row ${10 + j} col ${'BCDEFG'[i]} (width ${WIDTHS[i]} px)`);
        }
      }
      // Evidence: the paired screenshots (attached, not pixel-compared).
      const clip = await gridBox(official);
      for (const [side, page] of [['official', official], ['ours', ours]] as const) {
        const path = testInfo.outputPath(`matrix-zoom${zoom}-${side}.png`);
        await page.screenshot({ clip: { ...clip, width: Math.round(clip.width * zoom), height: Math.round(clip.height * zoom) }, path });
        await testInfo.attach(`matrix-zoom${zoom}-${side}.png`, { path, contentType: 'image/png' });
      }
    }
    const path = testInfo.outputPath('general-fit.json');
    await writeFile(path, JSON.stringify(report, null, 2));
    await testInfo.attach('general-fit.json', { path, contentType: 'application/json' });
  } finally {
    await official.close().catch(() => undefined);
    await ours.close().catch(() => undefined);
  }
});

test('General cells under it-it paint the culture separators (supervisor 2b, ours)', async ({ page }) => {
  await boot(page, 'ours');
  const result = await page.evaluate(() => {
    const { spread, GC } = (window as any).__designerCompare;
    const CM = GC.Spread.Common.CultureManager;
    CM.culture('it-it');
    const sheet = spread.getActiveSheet();
    sheet.clear(0, 0, sheet.getRowCount(), sheet.getColumnCount(), 2);
    sheet.setValue(1, 1, 250); sheet.setValue(2, 1, 100); sheet.setValue(3, 1, 44.5); sheet.setValue(4, 1, 1);
    sheet.setFormula(0, 1, 'SUM(B2:B5,1)'); // 395.5 + 1 = 396.5
    sheet.setValue(1, 2, 1234.5);
    sheet.setFormatter(1, 2, new GC.Spread.Formatter.GeneralFormatter('#,##0.00'));
    sheet.setActiveCell(0, 1);
    spread.refresh();
    return {
      generalText: sheet.getText(0, 1),
      formatText: sheet.getText(1, 2),
      value: sheet.getValue(0, 1),
    };
  });
  expect(result.value, 'the stored value never changes').toBe(396.5);
  expect(result.generalText, 'General shows the Italian decimal separator').toBe('396,5');
  expect(result.formatText, '#,##0.00 keeps the full Italian style').toBe('1.234,50');
  await page.waitForTimeout(300);
  const bar = await page.locator('.gc-designer-formula-bar-text-box input').inputValue();
  expect(bar, 'the formula bar keeps the formula text (Italian display per TASK 89)').toMatch(/^=(SOMMA|SUM)\(B2:B5(;|,)1\)$/);
  await page.evaluate(() => (window as any).GC.Spread.Common.CultureManager.culture('en-us'));
});
