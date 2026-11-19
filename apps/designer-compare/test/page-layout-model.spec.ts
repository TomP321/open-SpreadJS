/* eslint-disable @typescript-eslint/no-explicit-any */
/*
 * TASK 7 paired model comparison: drive the Page Layout ribbon with the real
 * mouse on BOTH the official trial and our designer, then compare the model
 * state (printInfo JSON, print area names, page breaks, theme) after each
 * action. Only the JSON of the public model is compared — never pixels.
 */
import { expect, test, type Browser, type Page } from '@playwright/test';
import { boot } from './helpers';

/** Canonicalise an object so key insertion order never affects the comparison. */
function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const keys = Object.keys(value as Record<string, unknown>).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(',')}}`;
}

interface Snapshot {
  printInfo: string;
  names: string;
  printLineVisible: boolean;
  rowBreak3: boolean;
  colBreak3: boolean;
  rowBreakFlags: string;
  colBreakFlags: string;
  theme: string;
  active: number[];
}

async function snapshot(page: Page): Promise<Snapshot> {
  const raw = await page.evaluate(() => {
    const sheet = (window as any).__designerCompare.spread.getActiveSheet();
    const p = sheet.printInfo();
    const json = sheet.toJSON();
    const theme = sheet.currentTheme();
    const breakFlags = (axis: 'rows' | 'columns') =>
      (json[axis] ?? []).map((entry: any, index: number) => (entry && entry.pageBreak !== undefined ? `${index}:${!!entry.pageBreak}` : null)).filter(Boolean).join('|');
    return {
      printInfo: p.toJSON ? p.toJSON() : json.printInfo ?? null,
      names: json.names ?? null,
      printLineVisible: !!sheet.isPrintLineVisible(),
      rowBreak3: !!sheet.getRowPageBreak(3),
      colBreak3: !!sheet.getColumnPageBreak(3),
      rowBreakFlags: breakFlags('rows'),
      colBreakFlags: breakFlags('columns'),
      theme: { name: theme.name(), color: theme.colors().name(), font: theme.font().name(), json: json.theme ?? null },
      active: [sheet.getActiveRowIndex(), sheet.getActiveColumnIndex()],
    };
  });
  return {
    ...raw,
    printInfo: canonical(raw.printInfo),
    names: canonical(raw.names),
    theme: canonical(raw.theme),
  };
}

async function clickRibbon(page: Page, label: string): Promise<void> {
  // Trial markup quirk: dropdown wrappers carry an ancestor role=button with
  // aria-disabled="true" (menus open on hover anyway), which blocks
  // Playwright's actionability wait. A forced click still dispatches the real
  // mouse event at the element centre.
  const button = page.locator('.gc-designer-ribbon-list-hover-item, .gc-designer-ribbon-button').filter({ hasText: new RegExp(`^${label}$`) }).first();
  await button.click({ force: true, timeout: 10_000 });
  await page.waitForTimeout(150);
}

async function clickMenuItem(page: Page, text: string): Promise<void> {
  const item = page.locator('.gc-designer-ribbon-list-item-container', { hasText: text }).first();
  await item.click({ timeout: 8000 });
  await page.waitForTimeout(200);
}

/**
 * Margins presets: ours renders normal DOM rows; the trial draws all three
 * presets into one canvas table row, so there fall back to a positional click
 * on the middle of the canvas gallery's stacked rows (still a real mouse click).
 */
async function clickMarginPreset(page: Page, label: 'Normal' | 'Wide' | 'Narrow'): Promise<void> {
  const item = page.locator('.gc-designer-ribbon-list-item-container').filter({ hasText: new RegExp(`^${label}$`) }).first();
  if (await item.count() > 0) {
    await item.click({ timeout: 8000 });
    await page.waitForTimeout(200);
    return;
  }
  const index = { Normal: 0, Wide: 1, Narrow: 2 }[label];
  const point = await page.evaluate((row) => {
    for (const tr of document.querySelectorAll('.gc-designer-component-spread-template-container tr')) {
      const r = tr.getBoundingClientRect();
      if (r.height > 100 && r.width > 100 && tr.querySelector('canvas'))
        return { x: r.x + r.width / 2, y: r.y + r.height * ((row + 0.5) / 3) };
    }
    return null;
  }, index);
  if (!point) throw new Error(`margin preset row ${label} not found`);
  await page.mouse.click(point.x, point.y);
  await page.waitForTimeout(200);
}

/** Clicks a gallery row by its value on both DOMs (trial rows use data-value/role=option). */
async function clickGalleryEntry(page: Page, name: string): Promise<void> {
  await page.locator(`[data-value="${name}"], [title="${name}"], [aria-label="${name}"]`).first().click({ timeout: 8000 });
  await page.waitForTimeout(250);
}

async function clickTab(page: Page, label: string): Promise<void> {
  await page.locator('.gc-designer-ribbon-tab-nav-text', { hasText: label }).first().click();
  await page.waitForTimeout(200);
}

/** Sheet Options checkboxes in trial DOM order: 0 Repeat, 1 Over Content, 2 gridlines View, 3 gridlines Print, 4 headings View, 5 headings Print, 6 PrintLineVisible. */
async function clickCheckBox(page: Page, index: number): Promise<void> {
  await page.locator('.gc-designer-ribbon-check-box-icon').nth(index).click();
  await page.waitForTimeout(200);
}

/**
 * Paper size presets: ours renders list rows; the trial draws the whole size
 * list into one canvas table, so there click the row centre measured from a
 * live probe (A4 sits at 78.25% of the canvas column height).
 */
async function clickPaperPreset(page: Page, label: string, canvasFraction: number): Promise<void> {
  const item = page.locator('.gc-designer-ribbon-list-item-container', { hasText: label }).first();
  if (await item.count() > 0) {
    await item.click({ timeout: 8000 });
    await page.waitForTimeout(200);
    return;
  }
  const point = await page.evaluate((f) => {
    for (const tr of document.querySelectorAll('.gc-designer-component-spread-template-container tr')) {
      const r = tr.getBoundingClientRect();
      if (r.height > 100 && r.width > 100 && tr.querySelector('canvas'))
        return { x: r.x + r.width / 2, y: r.y + r.height * f };
    }
    return null;
  }, canvasFraction);
  if (!point) throw new Error(`paper preset row ${label} not found`);
  await page.mouse.click(point.x, point.y);
  await page.waitForTimeout(200);
}

async function bootBoth(browser: Browser): Promise<{ official: Page; ours: Page }> {
  return { official: await bootSide(browser, 'official'), ours: await bootSide(browser, 'ours') };
}

async function bootSide(browser: Browser, side: 'official' | 'ours'): Promise<Page> {
  const context = await browser.newContext({ viewport: { width: 1440, height: 800 } });
  const page = await context.newPage();
  await boot(page, side);
  return page;
}

async function closeAll(...pages: Page[]): Promise<void> {
  for (const page of pages) await page.context().close();
}

test.describe('Page Layout ribbon drives the model like the trial', () => {
  // TASK 9: on a fresh workbook printInfo headers are inherit (0) — the trial shows
  // Headings > Print CHECKED there; ours must match without waiting for a write.
  test('fresh workbook: Sheet Options > Headings > Print is checked on both sides', async ({ browser }) => {
    const { official, ours } = await bootBoth(browser);
    try {
      const states: (string | null)[] = [];
      for (const page of [official, ours]) {
        await clickTab(page, 'Page Layout');
        states.push(await page.locator('.gc-designer-ribbon-check-box').nth(5).getAttribute('aria-checked'));
      }
      expect(states[0], 'official Headings > Print').toBe('true');
      expect(states[1], 'ours Headings > Print').toBe(states[0]);
    } finally {
      await closeAll(official, ours);
    }
  });

  test('print setup values land in printInfo and persist identically on both sides', async ({ browser }) => {
    const { official, ours } = await bootBoth(browser);
    const sides = [official, ours];
    try {
      for (const page of sides) await clickTab(page, 'Page Layout');

      // The trial seeds headers/firstPageNumber with the first Page Setup command.
      for (const page of sides) {
        await clickRibbon(page, 'Margins');
        await clickMarginPreset(page, 'Wide');
      }
      expect(await snapshot(official)).toEqual(await snapshot(ours));

      for (const page of sides) {
        await clickRibbon(page, 'Orientation');
        await clickMenuItem(page, 'Landscape');
        await clickRibbon(page, 'Size');
        await clickPaperPreset(page, 'A4', 0.7825);
      }
      expect(await snapshot(official)).toEqual(await snapshot(ours));

      // Print area: both sides persist it through the Print_Area defined name.
      for (const page of sides)
        await page.evaluate(() => (window as any).__designerCompare.spread.getActiveSheet().setSelection(3, 3, 2, 2));
      for (const page of sides) {
        await clickRibbon(page, 'Print Area');
        await clickMenuItem(page, 'Set Print Area');
      }
      let snapOfficial = await snapshot(official), snapOurs = await snapshot(ours);
      expect(snapOurs).toEqual(snapOfficial);
      expect(snapOurs.names).toContain('Print_Area');

      // Page breaks at the active cell D4 (row 3, column 3).
      for (const page of sides) {
        await clickRibbon(page, 'Breaks');
        await clickMenuItem(page, 'Insert Page Break');
      }
      snapOfficial = await snapshot(official);
      snapOurs = await snapshot(ours);
      expect(snapOurs).toEqual(snapOfficial);
      expect(snapOurs.rowBreak3).toBe(true);
      expect(snapOurs.colBreak3).toBe(true);
      // The trial does NOT auto-enable the print lines on insert.
      expect(snapOurs.printLineVisible).toBe(false);

      // PrintLineVisible checkbox enables the on-screen lines on both sides.
      for (const page of sides) await clickCheckBox(page, 6);
      snapOfficial = await snapshot(official);
      snapOurs = await snapshot(ours);
      expect(snapOurs).toEqual(snapOfficial);
      expect(snapOurs.printLineVisible).toBe(true);

      for (const page of sides) {
        await clickRibbon(page, 'Breaks');
        await clickMenuItem(page, 'Reset All Page Breaks');
      }
      snapOfficial = await snapshot(official);
      snapOurs = await snapshot(ours);
      expect(snapOurs).toEqual(snapOfficial);
      expect(snapOurs.rowBreak3).toBe(false);
      expect(snapOurs.colBreak3).toBe(false);

      for (const page of sides) {
        await clickRibbon(page, 'Print Area');
        await clickMenuItem(page, 'Clear Print Area');
      }
      snapOfficial = await snapshot(official);
      snapOurs = await snapshot(ours);
      expect(snapOurs).toEqual(snapOfficial);
      expect(snapOurs.names).toBe('null');

      // Sheet Options print checkboxes write printInfo.
      for (const page of sides) await clickCheckBox(page, 3); // Gridlines > Print
      snapOfficial = await snapshot(official);
      snapOurs = await snapshot(ours);
      expect(snapOurs).toEqual(snapOfficial);
      for (const page of sides) await clickCheckBox(page, 5); // Headings > Print
      snapOfficial = await snapshot(official);
      snapOurs = await snapshot(ours);
      expect(snapOurs).toEqual(snapOfficial);
    } finally {
      await closeAll(official, ours);
    }
  });

  test('Print Titles opens Page Setup on the Sheet tab on both sides', async ({ browser }) => {
    const { official, ours } = await bootBoth(browser);
    const sides = [official, ours];
    try {
      for (const page of sides) {
        await clickTab(page, 'Page Layout');
        await clickRibbon(page, 'Print Titles');
      }
      for (const page of sides) {
        const dialog = await page.evaluate(() => {
          const el = document.querySelector('.gc-designer-dialog');
          if (!el) return null;
          const norm = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();
          const tabs = [...el.querySelectorAll('.gc-designer-tabstrip-item, [role=tab]')].map((t) => norm(t.textContent));
          const title = norm(el.querySelector('.gc-dialog-title, .gc-designer-dialog-title')?.textContent);
          const body = norm(el.textContent);
          return { title, tabs, hasRows: body.includes('Rows to repeat at top'), hasColumns: body.includes('Columns to repeat at left') };
        });
        expect(dialog, 'Page Setup dialog opens from Print Titles').not.toBeNull();
        expect(dialog!.tabs).toEqual(['Page', 'Margins', 'Header/Footer', 'Sheet']);
        expect(dialog!.hasRows).toBe(true);
        expect(dialog!.hasColumns).toBe(true);
        await page.keyboard.press('Escape');
      }
    } finally {
      await closeAll(official, ours);
    }
  });

  test('Themes gallery applies the colour scheme like the trial', async ({ browser }) => {
    const { official, ours } = await bootBoth(browser);
    const sides = [official, ours];
    try {
      for (const page of sides) await clickTab(page, 'Page Layout');
      for (const page of sides) {
        await page.locator('.gc-theme-setting-icon').click();
        await page.waitForTimeout(250);
        await clickGalleryEntry(page, 'Civic');
      }
      const snapOfficial = await snapshot(official);
      const snapOurs = await snapshot(ours);
      expect(snapOurs).toEqual(snapOfficial);
      // The trial applies the whole named theme: the sheet stores the plain
      // name, the colour scheme is Civic and the theme's own font scheme
      // (Georgia) comes along — no custom-theme record.
      expect(snapOurs.theme).toContain('"name":"Civic"');
      expect(snapOurs.theme).toContain('"color":"Civic"');
      expect(snapOurs.theme).toContain('"font":"Georgia"');
      expect(snapOurs.theme).toContain('"json":"Civic"');
    } finally {
      await closeAll(official, ours);
    }
  });

  test('Colors and Fonts galleries patch the current theme like the trial', async ({ browser }) => {
    const { official, ours } = await bootBoth(browser);
    const sides = [official, ours];
    try {
      for (const page of sides) await clickTab(page, 'Page Layout');
      for (const page of sides) {
        await page.locator('.gc-theme-color-icon').click();
        await page.waitForTimeout(250);
        await clickGalleryEntry(page, 'Apex');
        await page.locator('.gc-theme-font-icon').click();
        await page.waitForTimeout(250);
        await clickGalleryEntry(page, 'Verdana');
      }
      const snapOfficial = await snapshot(official);
      const snapOurs = await snapshot(ours);
      expect(snapOurs).toEqual(snapOfficial);
      expect(snapOurs.theme).toContain('Apex');
      expect(snapOurs.theme).toContain('Verdana');
    } finally {
      await closeAll(official, ours);
    }
  });
});
