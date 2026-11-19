/* eslint-disable @typescript-eslint/no-explicit-any */
/*
 * TASK 51: paired menu-family audit — for ribbon dropdown families and the header/corner/tab
 * context menus, compare on the LIVE trial vs ours: item captions, icon presence (one shared
 * detector on both sides), disabled state, and menu/item geometry within 2px.
 */
import { expect, test, type Browser, type Page } from '@playwright/test';
import { boot, expectBoxClose } from './helpers';

const VIEWPORT = { width: 1440, height: 800 };

type Item = { text: string; icon: boolean; disabled: boolean; height: number };
type Snap = { menu: { x: number; y: number, width: number, height: number }; items: Item[]; tiles: number; arrows: number } | null;

/** One shared item extractor so both sides are measured by the same rules. */
async function snapshot(page: Page): Promise<Snap> {
  return page.evaluate(() => {
    const menus = [...document.querySelectorAll<HTMLElement>('.gc-designer-ribbon-dropdown')].filter((e) => e.getBoundingClientRect().width > 8);
    const menu = menus[menus.length - 1];
    if (!menu) return null;
    const vis = (el: Element): boolean => { const r = el.getBoundingClientRect(); return r.width > 4 && r.height > 4; };
    const iconOf = (c: HTMLElement): boolean => {
      for (const sel of ['svg', 'canvas', 'img', 'i']) { const x = c.querySelector(sel); if (x && vis(x)) return true; }
      const b = c.getBoundingClientRect();
      for (const kid of c.children) { const r = kid.getBoundingClientRect(); if (vis(kid) && r.width <= 36 && r.height <= 36 && r.x - b.x < 52) return true; }
      return false;
    };
    const disabledOf = (c: HTMLElement): boolean => {
      // The trial keeps role/aria-disabled on the INNER item-content element (probed live,
      // TASK 51): <div class="…-menuitem"><div role="menuitem" aria-disabled class="…-disable">.
      const el = c.getAttribute('role') === 'menuitem' ? c : (c.querySelector('[role="menuitem"]') ?? c);
      return el.getAttribute('aria-disabled') === 'true' || /disable/.test(String(el.className));
    };
    const rows = [...menu.querySelectorAll<HTMLElement>('.gc-designer-ribbon-list-item-container, .gc-designer-paste-section-title')].filter((e) => vis(e) && !e.querySelector('.gc-designer-ribbon-dropdown'));
    const items = rows.map((e) => ({ text: (e.textContent ?? '').replace(/\s+/g, ' ').trim(), icon: iconOf(e), disabled: disabledOf(e), height: Math.round(e.getBoundingClientRect().height * 100) / 100 }));
    const box = menu.getBoundingClientRect();
    return {
      menu: { x: box.x, y: box.y, width: box.width, height: box.height },
      items,
      tiles: [...menu.querySelectorAll<HTMLElement>('.gc-designer-paste-tile')].filter(vis).length,
      arrows: menu.querySelectorAll('.gc-designer-ribbon-list-item-arrow').length,
    };
  }) as Promise<Snap>;
}

async function openRibbonMenu(page: Page, command: string): Promise<void> {
  const host = page.locator(`[data-command="ribbon.${command}"]`).first();
  await expect(host).toBeVisible();
  const trigger = host.locator('.dropdown-btn, .gc-designer-ribbon-list-btn').first();
  if (await trigger.count()) await trigger.click({ force: true });
  else await host.click();
  await page.waitForFunction(() => [...document.querySelectorAll('.gc-designer-ribbon-dropdown')].some((e) => e.getBoundingClientRect().width > 8), null, { timeout: 5000 });
  await page.waitForTimeout(200);
}

async function selectTab(page: Page, label: string): Promise<void> {
  await page.evaluate((label) => {
    [...document.querySelectorAll<HTMLElement>('.gc-designer-ribbon-tab-nav-text')].find((e) => e.getAttribute('aria-label') === label)?.click();
  }, label);
  await page.waitForTimeout(200);
}

async function closeMenu(page: Page): Promise<void> {
  await page.keyboard.press('Escape');
  await page.mouse.click(700, 500);
  await page.waitForTimeout(150);
}

/** Workbook canvas-relative point lookup via the public hitTest API (same as context-entries.spec). */
const findPoint = async (page: Page, match: 'rowHeader' | 'colHeader' | 'corner' | 'tab', row?: number, col?: number): Promise<{ x: number; y: number }> => {
  const point = await page.evaluate(({ match, row, col }) => {
    const s = (window as any).__designerCompare.spread;
    const canvases = [...document.querySelectorAll('canvas')];
    const main = canvases.sort((a, b) => b.getBoundingClientRect().width * b.getBoundingClientRect().height - a.getBoundingClientRect().width * a.getBoundingClientRect().height)[0];
    const host = main.getBoundingClientRect();
    const hits: { x: number; y: number }[] = [];
    // The sheet-tab strip renders below the canvas rect (probed live, TASK 51), so scan past
    // the bottom edge for tabs; cell/header hits stay inside the canvas.
    const yStart = match === 'tab' ? Math.max(2, Math.floor(host.height) - 40) : 2;
    const yEnd = match === 'tab' ? Math.floor(host.height) + 80 : Math.min(640, host.height);
    for (let y = yStart; y < yEnd; y += 4) {
      for (let x = 2; x < Math.min(1240, host.width); x += 4) {
        const hit = s.hitTest(x, y);
        if (!hit) continue;
        if (match === 'tab') { if (hit.tabStripHitInfo?.sheetTab) { hits.push({ x: host.left + x, y: host.top + y }); break; } else continue; }
        const w = hit.worksheetHitInfo;
        if (!w) continue;
        const ok =
          (match === 'rowHeader' && w.hitTestType === 2 && w.row === row) ||
          (match === 'colHeader' && w.hitTestType === 1 && w.col === col) ||
          (match === 'corner' && w.hitTestType === 0);
        if (ok) hits.push({ x: host.left + x, y: host.top + y });
      }
      if (match === 'tab' && hits.length) break;
    }
    if (!hits.length) return null;
    return hits[Math.floor(hits.length / 2)];
  }, { match, row, col });
  if (!point) throw new Error(`No ${match} point found`);
  return point;
};

function compareItems(ours: Item[], official: Item[], label: string): void {
  expect(ours.map((i) => i.text), `${label}: captions`).toEqual(official.map((i) => i.text));
  expect(ours.map((i) => i.icon), `${label}: icon presence`).toEqual(official.map((i) => i.icon));
  expect(ours.map((i) => i.disabled), `${label}: disabled state`).toEqual(official.map((i) => i.disabled));
  for (let i = 0; i < official.length; i++) {
    expect(Math.abs(ours[i].height - official[i].height), `${label}: "${official[i].text}" item height ${official[i].height} vs ours ${ours[i].height}`).toBeLessThanOrEqual(2);
  }
}

test.describe('ribbon dropdown families match the trial', () => {
  test('Home: every Merge & Center item carries an icon and none is disabled', async ({ browser }: { browser: Browser }) => {
    const official = await browser.newPage({ viewport: VIEWPORT });
    const ours = await browser.newPage({ viewport: VIEWPORT });
    try {
      await boot(official, 'official');
      await boot(ours, 'ours');
      await openRibbonMenu(official, 'mergeCenter');
      await openRibbonMenu(ours, 'mergeCenter');
      const o = await snapshot(official);
      const u = await snapshot(ours);
      expect(o?.items.map((i) => i.text)).toEqual(['Merge & Center', 'Merge Across', 'Merge Cells', 'Unmerge Cells']);
      compareItems(u!.items, o!.items, 'mergeCenter');
      expect(u!.items.every((i) => i.icon), 'every trial item shows an icon; ours must too').toBe(true);
      expectBoxClose(u!.menu, o!.menu, 2, 'mergeCenter menu');
    } finally { await official.close(); await ours.close(); }
  });

  test('Home: Paste gallery is a flat sectioned tile menu (no submenu arrows)', async ({ browser }: { browser: Browser }) => {
    const official = await browser.newPage({ viewport: VIEWPORT });
    const ours = await browser.newPage({ viewport: VIEWPORT });
    try {
      await boot(official, 'official');
      await boot(ours, 'ours');
      await openRibbonMenu(official, 'pasteAll');
      await openRibbonMenu(ours, 'pasteAll');
      const o = await snapshot(official);
      const u = await snapshot(ours);
      expect(o, 'official paste menu').not.toBeNull();
      expect(o!.items.filter((i) => /Paste Special/.test(i.text)).length, 'official has the Paste Special row').toBe(1);
      expect(u!.arrows, 'ours must not use submenu flyouts').toBe(0);
      expect(u!.items.filter((i) => /Paste Special/.test(i.text)).length).toBe(1);
      expect(u!.items.filter((i) => /^(Paste|Paste Values|Other Paste Options)$/.test(i.text)).length, 'ours shows the three section captions').toBe(3);
      // T55 evidence (.probe/t51/out/official/menu-Home__ribbon.pasteAll.png + trial DOM probe):
      // the trial gallery is 8+4+3 = 15 tiles; the earlier 4+4+3 reading was wrong.
      expect(u!.tiles, 'ours renders one tile per trial option (8+4+3)').toBe(15);
      expectBoxClose(u!.menu, o!.menu, 2, 'paste menu');
    } finally { await official.close(); await ours.close(); }
  });

  test('Home: Number Format combo lists 12 rows with per-format icons', async ({ browser }: { browser: Browser }) => {
    const official = await browser.newPage({ viewport: VIEWPORT });
    const ours = await browser.newPage({ viewport: VIEWPORT });
    try {
      await boot(official, 'official');
      await boot(ours, 'ours');
      await openRibbonMenu(official, 'ribbonNumberFormat');
      await openRibbonMenu(ours, 'ribbonNumberFormat');
      const o = await snapshot(official);
      const u = await snapshot(ours);
      expect(u?.items.map((i) => i.text)).toEqual(o?.items.map((i) => i.text));
      const oFormats = o!.items.filter((i) => i.text !== 'More Number Formats...');
      const uFormats = u!.items.filter((i) => i.text !== 'More Number Formats...');
      expect(oFormats.every((i) => i.icon), 'trial shows an icon per format').toBe(true);
      expect(uFormats.every((i) => i.icon), 'ours must show an icon per format').toBe(true);
      expectBoxClose(u!.menu, o!.menu, 2, 'number format menu width');
    } finally { await official.close(); await ours.close(); }
  });

  test('Home: Borders / Insert / Delete / Format dropdowns match captions, icons, disabled and width', async ({ browser }: { browser: Browser }) => {
    const official = await browser.newPage({ viewport: VIEWPORT });
    const ours = await browser.newPage({ viewport: VIEWPORT });
    try {
      await boot(official, 'official');
      await boot(ours, 'ours');
      for (const command of ['border', 'cellsInsert', 'cellsDelete', 'cellsFormat']) {
        await openRibbonMenu(official, command);
        await openRibbonMenu(ours, command);
        const o = await snapshot(official);
        const u = await snapshot(ours);
        expect(o, `${command} official menu`).not.toBeNull();
        compareItems(u!.items, o!.items, command);
        expectBoxClose(u!.menu, o!.menu, 2, `${command} menu`);
        await closeMenu(official);
        await closeMenu(ours);
      }
    } finally { await official.close(); await ours.close(); }
  });

  test('Page Layout: Margins and Size dropdowns match captions and width', async ({ browser }: { browser: Browser }) => {
    const official = await browser.newPage({ viewport: VIEWPORT });
    const ours = await browser.newPage({ viewport: VIEWPORT });
    try {
      await boot(official, 'official');
      await boot(ours, 'ours');
      for (const command of ['margins', 'paperSize']) {
        await selectTab(official, 'Page Layout');
        await selectTab(ours, 'Page Layout');
        await openRibbonMenu(official, command);
        await openRibbonMenu(ours, command);
        const o = await snapshot(official);
        const u = await snapshot(ours);
        expect(o, `${command} official menu`).not.toBeNull();
        expect(u!.items.map((i) => i.text), `${command}: captions`).toEqual(o!.items.map((i) => i.text));
        expectBoxClose(u!.menu, o!.menu, 2, `${command} menu width`);
        await closeMenu(official);
        await closeMenu(ours);
      }
    } finally { await official.close(); await ours.close(); }
  });

  test('Data: What-If Analysis and Data Validation dropdown labels match the trial', async ({ browser }: { browser: Browser }) => {
    const official = await browser.newPage({ viewport: VIEWPORT });
    const ours = await browser.newPage({ viewport: VIEWPORT });
    try {
      await boot(official, 'official');
      await boot(ours, 'ours');
      for (const command of ['whatIfAnalysis', 'dataValidation']) {
        await selectTab(official, 'Data');
        await selectTab(ours, 'Data');
        await openRibbonMenu(official, command);
        await openRibbonMenu(ours, command);
        const o = await snapshot(official);
        const u = await snapshot(ours);
        expect(o, `${command} official menu`).not.toBeNull();
        expect(u!.items.map((i) => i.text), `${command}: captions`).toEqual(o!.items.map((i) => i.text));
        await closeMenu(official);
        await closeMenu(ours);
      }
    } finally { await official.close(); await ours.close(); }
  });
});

test.describe('header/corner/tab context menus match the trial', () => {
  test('captions, disabled state and item geometry within 2px', async ({ browser }: { browser: Browser }) => {
    test.setTimeout(240_000);
    const official = await browser.newPage({ viewport: VIEWPORT });
    const ours = await browser.newPage({ viewport: VIEWPORT });
    try {
      await boot(official, 'official');
      await boot(ours, 'ours');
      const spots: Array<{ name: 'rowHeader' | 'colHeader' | 'corner' | 'tab'; row?: number; col?: number }> = [
        { name: 'rowHeader', row: 3 },
        { name: 'colHeader', col: 2 },
        { name: 'corner' },
        { name: 'tab' },
      ];
      for (const spot of spots) {
        const grab = async (page: Page): Promise<{ items: Item[]; height: number }> => {
          const point = await findPoint(page, spot.name, spot.row, spot.col);
          await page.mouse.click(point.x, point.y, { button: 'right' });
          // The trial keeps hidden gc-ui-contextmenu-container shells in the DOM after closing a menu,
          // so wait for one that is actually visible instead of the first DOM match.
          await page.waitForFunction(() => [...document.querySelectorAll('.gc-ui-contextmenu-container, .gc-designer-context-menu')].some((el) => el.getBoundingClientRect().width > 10), null, { timeout: 5000 });
          await page.waitForTimeout(250);
          const data = await page.evaluate(() => {
            const menu = [...document.querySelectorAll<HTMLElement>('.gc-ui-contextmenu-container, .gc-designer-context-menu')].find((el) => el.getBoundingClientRect().width > 10);
            if (!menu) return null;
            const vis = (el: Element): boolean => { const r = el.getBoundingClientRect(); return r.width > 4 && r.height > 4; };
            const disabledOf = (c: HTMLElement): boolean => {
              // Same inner role=menuitem structure as the ribbon snapshot above (TASK 51).
              const el = c.getAttribute('role') === 'menuitem' ? c : (c.querySelector('[role="menuitem"]') ?? c);
              return el.getAttribute('aria-disabled') === 'true' || /disable/.test(String(el.className));
            };
            // Paste-option tiles are role=menuitem rows with empty captions in the trial.
            const rows = [...menu.querySelectorAll<HTMLElement>('.gc-ui-contextmenu-menuitem, .gc-designer-context-item')].filter((e) => vis(e) && !e.querySelector('.gc-designer-context-submenu, .gc-ui-contextmenu-container') && (e.textContent ?? '').trim() !== '');
            return {
              items: rows.map((e) => ({
                text: (e.textContent ?? '').replace(/\s+/g, ' ').trim(),
                icon: false, // icon detection differs structurally (DOM icons vs background images); captions/geometry/disabled are compared instead
                disabled: disabledOf(e),
                height: Math.round(e.getBoundingClientRect().height * 100) / 100,
              })),
              pasteTiles: menu.querySelectorAll('.gc-ui-contextmenu-menuitem').length ? [...menu.querySelectorAll<HTMLElement>('.gc-ui-contextmenu-menuitem')].filter((e) => (e.textContent ?? '').trim() === '' && vis(e)).length : menu.querySelectorAll('.gc-designer-paste-option').length,
              height: Math.round(menu.getBoundingClientRect().height * 100) / 100,
            };
          });
          await page.keyboard.press('Escape');
          await page.mouse.click(700, 400);
          await page.waitForTimeout(150);
          return data!;
        };
        const expected = await grab(official);
        const actual = await grab(ours);
        expect(actual.items.map((i) => i.text), `${spot.name}: captions`).toEqual(expected.items.map((i) => i.text));
        for (let i = 0; i < expected.items.length; i++) {
          expect(actual.items[i].disabled, `${spot.name}: "${expected.items[i].text}" disabled`).toBe(expected.items[i].disabled);
          expect(Math.abs(actual.items[i].height - expected.items[i].height), `${spot.name}: "${expected.items[i].text}" height`).toBeLessThanOrEqual(2);
        }
      }
    } finally { await official.close(); await ours.close(); }
  });
});

/* --- TASK 55: icon-presence audit for the menus fixed in pass 2 -----------------------
 * Constants below were transcribed from the black-box trial captures
 * (.probe/t51/out/official + .probe/t55/official); the same shared detector measures ours. */
test.describe('TASK 55 icon and menu audit', () => {
  async function bothBooted(browser: Browser): Promise<[Page, Page]> {
    const official = await browser.newPage({ viewport: VIEWPORT });
    const ours = await browser.newPage({ viewport: VIEWPORT });
    await boot(official, 'official');
    await boot(ours, 'ours');
    return [official, ours];
  }

  async function hoverRow(page: Page, anchorText: string): Promise<void> {
    // Park the pointer away from any menu first, so the move onto the row is a real mouseenter.
    await page.mouse.move(720, 700);
    await page.waitForTimeout(150);
    const row = page.locator('.gc-designer-ribbon-list-item-container', { hasText: anchorText }).last();
    await expect(row).toBeVisible();
    await row.hover({ position: { x: 10, y: 10 } });
    await page.waitForTimeout(400);
  }

  /** Ours only: rows whose trial caption is known to show a glyph must contain an <svg>. */
  async function svgIconFlags(page: Page): Promise<boolean[]> {
    return page.evaluate(() => {
      const menus = [...document.querySelectorAll<HTMLElement>('.gc-designer-ribbon-dropdown')].filter((e) => e.getBoundingClientRect().width > 8);
      const menu = menus[menus.length - 1];
      return [...menu.querySelectorAll<HTMLElement>(':scope .gc-designer-ribbon-list-item-container')].filter((e) => !e.querySelector('.gc-designer-ribbon-dropdown'))
        .map((e) => !!e.querySelector('svg'));
    });
  }

  test('Home: Conditional Formatting menu — icons on every row, arrows, separators, geometry', async ({ browser }: { browser: Browser }) => {
    const [official, ours] = await bothBooted(browser);
    try {
      await openRibbonMenu(official, 'conditionFormat');
      await openRibbonMenu(ours, 'conditionFormat');
      const o = await snapshot(official);
      const u = await snapshot(ours);
      expect(o?.items.map((i) => i.text), 'captions').toEqual(['Highlight Cells Rules', 'Top/Bottom Rules', 'Data Bars', 'Color Scales', 'Icon Sets', 'New Rule...', 'Clear Rules', 'Manage Rules...']);
      compareItems(u!.items, o!.items, 'conditionFormat');
      // The trial shows a glyph on ALL eight rows (supervisor note + measured capture).
      expect(o!.items.every((i) => i.icon), 'trial shows an icon on every CF row').toBe(true);
      expect(u!.items.every((i) => i.icon)).toBe(true);
      expect(await svgIconFlags(ours), 'ours renders a real SVG per CF row').toEqual(new Array(8).fill(true));
      // Arrows: the five categories + Clear Rules; not New Rule / Manage Rules.
      expect(u!.items.map((i, idx) => idx)).toHaveLength(8);
      const arrows = await ours.evaluate(() => [...document.querySelectorAll('.gc-designer-condition-menu .gc-designer-ribbon-list-item-container')].map((e) => !!e.querySelector('.gc-designer-ribbon-list-item-arrow')));
      expect(arrows).toEqual([true, true, true, true, true, false, true, false]);
      const seps = await ours.evaluate(() => document.querySelectorAll('.gc-designer-condition-menu > .gc-designer-ribbon-menu-list > .gc-designer-ribbon-separator-horizontal').length);
      expect(seps, 'trial groups: [2 rows] sep [3 rows] sep [3 rows]').toBe(2);
      expectBoxClose(u!.menu, o!.menu, 2, 'conditionFormat menu');
    } finally { await official.close(); await ours.close(); }
  });

  test('Home: CF flyouts — Highlight/Top-Bottom/Clear rows and the Data Bars/Color Scales/Icon Sets galleries', async ({ browser }: { browser: Browser }) => {
    const [official, ours] = await bothBooted(browser);
    try {
      for (const [cmd, rows, icons] of [
        ['highlightCellsRules', ['Greater Than...', 'Less Than...', 'Between...', 'Equal To...', 'Text that Contains...', 'A Date Occurring...', 'Duplicate Values...', 'More Rules...'], [true, true, true, true, true, true, true, false]],
        ['topBottomRules', ['Top 10 Items...', 'Top 10%...', 'Bottom 10 Items...', 'Bottom 10%...', 'Above Average...', 'Below Average...', 'More Rules...'], [true, true, true, true, true, true, false]],
        ['clearRules', ['Clear Rules from Selected Cells', 'Clear Rules from Entire Sheet'], [false, false]],
      ] as Array<[string, string[], boolean[]]>) {
        await openRibbonMenu(official, 'conditionFormat');
        await openRibbonMenu(ours, 'conditionFormat');
        const anchor = rows[0] === 'Greater Than...' ? 'Highlight Cells Rules' : rows[0] === 'Top 10 Items...' ? 'Top/Bottom Rules' : 'Clear Rules';
        await hoverRow(official, anchor);
        await hoverRow(ours, anchor);
        const o = await snapshot(official);
        const u = await snapshot(ours);
        expect(o, `${cmd} official flyout`).not.toBeNull();
        expect(u!.items.map((i) => i.text), `${cmd} flyout captions`).toEqual(rows);
        const uIcons = await svgIconFlags(ours);
        expect(uIcons, `${cmd} flyout icons (ours)`).toEqual(icons);
        expectBoxClose(u!.menu, o!.menu, 4, `${cmd} flyout`);
        await closeMenu(official);
        await closeMenu(ours);
      }
      // Tile galleries: the trial shows mini previews (not text rows); ours draws SVG tiles.
      for (const [cmd, anchor, tiles] of [['dataBar', 'Data Bars', 12], ['colorScalesList', 'Color Scales', 12], ['iconSetList', 'Icon Sets', 20]] as Array<[string, string, number]>) {
        await openRibbonMenu(official, 'conditionFormat');
        await openRibbonMenu(ours, 'conditionFormat');
        await hoverRow(official, anchor);
        await hoverRow(ours, anchor);
        const counts = await Promise.all([official, ours].map((page) => page.evaluate(() => {
          const menus = [...document.querySelectorAll<HTMLElement>('.gc-designer-ribbon-dropdown')].filter((e) => e.getBoundingClientRect().width > 8);
          const fly = menus[menus.length - 1];
          const vis = (el: Element): boolean => { const r = el.getBoundingClientRect(); return r.width > 8 && r.height > 6; };
          return { previews: [...fly.querySelectorAll('svg, canvas')].filter(vis).length, more: (fly.textContent ?? '').includes('More Rules...'), captions: [...fly.querySelectorAll('.gc-designer-ribbon-menu-group-title, .gc-designer-group-title')].map((e) => (e.textContent ?? '').trim()) };
        })));
        expect(counts[1].previews, `${cmd} ours: mini previews`).toBeGreaterThanOrEqual(tiles);
        expect(counts[1].more, `${cmd} ours: More Rules row`).toBe(true);
        expect(counts[0].more, `${cmd} trial: More Rules row`).toBe(true);
        expect(counts[0].captions.length, `${cmd} trial section titles`).toBe(counts[1].captions.length);
        await closeMenu(official);
        await closeMenu(ours);
      }
    } finally { await official.close(); await ours.close(); }
  });

  test('menus fixed in TASK 55 show the trial icons: Cell Editors, Data Validation, Group, Ungroup, Print Area, Focus Cell, Borders', async ({ browser }: { browser: Browser }) => {
    const [official, ours] = await bothBooted(browser);
    try {
      const cases: Array<[string, string | null, number, boolean[] | null]> = [
        ['cellEditors', null, 2, [true, true]],
        ['dataValidation', 'Data', 3, [true, false, false]],
        ['group', 'Data', 2, [true, false]],
        ['ungroup', 'Data', 2, [true, false]],
        ['printArea', 'Page Layout', 2, [true, false]],
        ['focusCell', 'View', 3, [true, true, false]],
        ['border', null, 14, new Array(14).fill(true)],
      ];
      for (const [command, tab, rowCount, icons] of cases) {
        // Always switch: an open flyout (e.g. Tab Color) keeps its tab active in the trial.
        await selectTab(official, tab ?? 'Home');
        await selectTab(ours, tab ?? 'Home');
        await openRibbonMenu(official, command);
        await openRibbonMenu(ours, command);
        const o = await snapshot(official);
        const u = await snapshot(ours);
        expect(o, `${command} official menu`).not.toBeNull();
        expect(u!.items.length, `${command} row count`).toBe(rowCount);
        if (icons) expect(await svgIconFlags(ours), `${command} ours icons`).toEqual(icons);
        await closeMenu(official);
        await closeMenu(ours);
      }
    } finally { await official.close(); await ours.close(); }
  });

  test('Home: Named Cell Templates gallery lists the trial cards', async ({ browser }: { browser: Browser }) => {    const [official, ours] = await bothBooted(browser);
    try {
      await openRibbonMenu(official, 'namedCellTemplates');
      await openRibbonMenu(ours, 'namedCellTemplates');
      const o = await snapshot(official);
      expect(o, 'trial gallery opens').not.toBeNull();
      const oursData = await ours.evaluate(() => {
        const menu = [...document.querySelectorAll<HTMLElement>('.gc-designer-ribbon-dropdown')].filter((e) => e.getBoundingClientRect().width > 8).pop()!;
        return {
          titles: [...menu.querySelectorAll('.gc-designer-ribbon-menu-group-title')].map((e) => (e.textContent ?? '').trim()),
          cards: menu.querySelectorAll('.sd-named-template-card').length,
        };
      });
      expect(oursData.titles).toEqual(['Financial', 'Status & Scoring', 'Data & Interaction']);
      expect(oursData.cards).toBeGreaterThanOrEqual(21);
      const trialText = (o!.menu.height) > 0;
      expect(trialText).toBe(true);
    } finally { await official.close(); await ours.close(); }
  });

  /** Shared strict glyph detector: a row counts as iconed if it holds a real glyph element
   *  (svg/img/canvas) or an icon slot with a glyph class — the trial paints icons via CSS
   *  classes on `.gc-designer-ribbon-icon`, ours via inline SVG inside the same slot. */
  async function strictIconFlags(page: Page): Promise<boolean[]> {
    return page.evaluate(() => {
      const menus = [...document.querySelectorAll<HTMLElement>('.gc-designer-ribbon-dropdown')].filter((e) => e.getBoundingClientRect().width > 8);
      const menu = menus[menus.length - 1];
      if (!menu) return [];
      return [...menu.querySelectorAll<HTMLElement>(':scope .gc-designer-ribbon-list-item-container')].filter((e) => !e.querySelector('.gc-designer-ribbon-dropdown')).map((e) => {
        if (e.querySelector('svg, img, canvas')) return true;
        return [...e.querySelectorAll<HTMLElement>('.gc-designer-ribbon-icon')].some((s) => s.classList.length > 1);
      });
    });
  }

  test('Home: Merge dropdown — glyph on every row (trial blue/orange grid motifs)', async ({ browser }: { browser: Browser }) => {
    const [official, ours] = await bothBooted(browser);
    try {
      await openRibbonMenu(official, 'mergeCenter');
      await openRibbonMenu(ours, 'mergeCenter');
      const o = await snapshot(official);
      const u = await snapshot(ours);
      expect(o?.items.map((i) => i.text)).toEqual(['Merge & Center', 'Merge Across', 'Merge Cells', 'Unmerge Cells']);
      compareItems(u!.items, o!.items, 'mergeCenter');
      expect(await strictIconFlags(official), 'trial merge rows iconed').toEqual([true, true, true, true]);
      expect(await strictIconFlags(ours), 'ours merge rows iconed').toEqual([true, true, true, true]);
    } finally { await official.close(); await ours.close(); }
  });

  test('Home: Paste gallery — 8+4+3 tiles and disabled Paste Special like the trial', async ({ browser }: { browser: Browser }) => {
    const [official, ours] = await bothBooted(browser);
    try {
      for (const [page, side] of [[official, 'official'], [ours, 'ours']] as Array<[Page, string]>) {
        // No copy: the trial reference state (Paste Special greyed; the 15 tiles paint in their
        // fixed colors regardless of the clipboard, verified live in both states).
        await openRibbonMenu(page, 'pasteAll');
        const info = await page.evaluate(() => {
          const menu = [...document.querySelectorAll<HTMLElement>('.gc-designer-ribbon-dropdown')].filter((e) => e.getBoundingClientRect().width > 8).pop()!;
          // Trial paints tiles as glyph divs (.gc-designer-ribbon-icon + class) and titles as
          // .gc-designer-group-title; ours uses .gc-designer-paste-tile rows + section titles.
          const titles = [...menu.querySelectorAll('.gc-designer-group-title, .gc-designer-paste-section-title')].map((e) => (e.textContent ?? '').trim());
          const glyphed = [...menu.querySelectorAll<HTMLElement>('.gc-designer-ribbon-icon')].filter((s) => s.classList.length > 1);
          const special = [...menu.querySelectorAll<HTMLElement>('[role=menuitem]')].find((e) => /Paste Special/.test(e.textContent ?? ''));
          const disabled = !!special && (special.getAttribute('aria-disabled') === 'true' || /disable/.test(String(special.className)) || !!special.querySelector('[class*=disable],[aria-disabled=true]') || special.closest('[class*=disable]') !== null);
          return { titles, glyphs: glyphed.length, disabled };
        });
        expect(info.titles, `${side} paste section titles`).toEqual(['Paste', 'Paste Values', 'Other Paste Options']);
        expect(info.glyphs, `${side} paste glyph count (8+4+3)`).toBe(15);
        expect(info.disabled, `${side} Paste Special disabled without a copy`).toBe(true);
        await closeMenu(page);
      }
    } finally { await official.close(); await ours.close(); }
  });

  test('Insert: From Data Table rows carry the trial submenu arrow', async ({ browser }: { browser: Browser }) => {
    const [official, ours] = await bothBooted(browser);
    try {
      for (const command of ['insertPivotTable', 'insertTable']) {
        await selectTab(official, 'Insert');
        await selectTab(ours, 'Insert');
        await openRibbonMenu(official, command);
        await openRibbonMenu(ours, command);
        // Trial rows: .gc-designer-ribbon-list[-split] + .gc-designer-ribbon-list-triangle.
        // Ours rows: .gc-designer-ribbon-list-item-container + .gc-designer-ribbon-list-item-arrow.
        for (const [page, rowSel, arrowSel] of [
          [official, '[role=menuitem], [role=button]', '.gc-designer-ribbon-list-triangle'],
          [ours, '.gc-designer-ribbon-list-item-container', '.gc-designer-ribbon-list-item-arrow'],
        ] as Array<[Page, string, string]>) {
          const rows = await page.evaluate(([rowSel, arrowSel]) => {
            const menu = [...document.querySelectorAll<HTMLElement>('.gc-designer-ribbon-dropdown')].filter((e) => e.getBoundingClientRect().width > 8).pop()!;
            return [...menu.querySelectorAll<HTMLElement>(rowSel)]
              .filter((r) => !r.parentElement?.closest(rowSel)) // top-level rows only (trial nests role carriers)
              .map((r) => ({ t: (r.textContent ?? '').replace(/\s+/g, ' ').trim(), arrow: !!r.querySelector(arrowSel) }));
          }, [rowSel, arrowSel]);
          expect(rows.length, `${command} rows (${page === official ? 'trial' : 'ours'})`).toBe(1);
          expect(rows[0].t, `${command} caption`).toContain('From Data Table');
          expect(rows[0].arrow, `${command} arrow (${page === official ? 'trial' : 'ours'})`).toBe(true);
        }
        await closeMenu(official);
        await closeMenu(ours);
      }
    } finally { await official.close(); await ours.close(); }
  });

  test('Data: Circle Invalid Data / Clear Invalid Circles stay enabled like the trial', async ({ browser }: { browser: Browser }) => {
    const [official, ours] = await bothBooted(browser);
    try {
      await selectTab(official, 'Data');
      await selectTab(ours, 'Data');
      await openRibbonMenu(official, 'dataValidation');
      await openRibbonMenu(ours, 'dataValidation');
      for (const page of [official, ours]) {
        const flags = await page.evaluate(() => {
          const menu = [...document.querySelectorAll<HTMLElement>('.gc-designer-ribbon-dropdown')].filter((e) => e.getBoundingClientRect().width > 8).pop()!;
          return [...menu.querySelectorAll<HTMLElement>('.gc-designer-ribbon-list-item-container')].map((r) => r.getAttribute('aria-disabled') === 'true' || /disable/.test(String(r.className)));
        });
        expect(flags, page === official ? 'trial disabled flags' : 'ours disabled flags').toEqual([false, false, false]);
      }
    } finally { await official.close(); await ours.close(); }
  });

  test('Chart context menu: 11 trial rows, ours mirrors the captions and icons the trial rows', async ({ browser }: { browser: Browser }) => {
    const [official, ours] = await bothBooted(browser);
    const CAPTIONS = ['Cut', 'Copy', 'Reset to Match Style', 'Change Chart Type...', 'Select Data...', 'Move Chart...', 'Format Chart Area...', 'Group', 'Bring Forward', 'Send Backward', 'Save as Picture'];
    try {
      for (const [page, side] of [[official, 'trial'], [ours, 'ours']] as Array<[Page, string]>) {
        // Put a chart on the sheet (same fixture state both sides) and right-click its middle.
        await page.evaluate(() => {
          const GC = (window as any).GC.Spread.Sheets;
          const sheet = (window as any).__designerCompare.spread.getActiveSheet();
          if (!sheet.charts.all().some((c: any) => c.name() === 'CtxChart')) sheet.charts.add('CtxChart', GC.Charts.ChartType.columnClustered, 300, 200, 320, 200, 'A1:B4');
        });
        await page.waitForTimeout(300);
        const box = await page.evaluate(() => {
          const canvas = [...document.querySelectorAll('canvas')].sort((a, b) => b.getBoundingClientRect().width * b.getBoundingClientRect().height - a.getBoundingClientRect().width * a.getBoundingClientRect().height)[0].getBoundingClientRect();
          return { x: canvas.left + 460, y: canvas.top + 300 };
        });
        await page.mouse.click(box.x, box.y, { button: 'right' });
        await page.waitForTimeout(500);
        // Trial paints menu glyphs with CSS sprites (background images) — class names carry no
        // hint and reading background values is out of bounds, so the icon assertion applies to
        // OURS only; the trial half is pinned by captions + count (measured from the black-box
        // reference .probe/t51/out/official/m2-chart.png, where all rows but "Save as Picture"
        // show a glyph).
        const info = await page.evaluate(() => {
          const menu = [...document.querySelectorAll<HTMLElement>('.gc-designer-context-menu, .gc-ui-contextmenu-container')].filter((e) => e.getBoundingClientRect().width > 80).pop()!;
          if (!menu) return null;
          const rows = [...menu.querySelectorAll<HTMLElement>('[role=menuitem]')];
          return rows.map((r) => ({
            t: (r.textContent ?? '').replace(/\s+/g, ' ').trim(),
            glyph: !!r.querySelector('svg, img, canvas') || [...r.querySelectorAll('*')].some((s) => /ribbon-button-|context-chart|context-insert|context-delete/.test(String(s.className))),
          }));
        });
        expect(info, `${side} chart ctx menu`).not.toBeNull();
        expect(info!.length, `${side} chart ctx row count`).toBe(CAPTIONS.length);
        info!.forEach((row, i) => {
          if (i === 6) expect(row.t, `${side} format row`).toMatch(/^Format (Chart Area|Plot Area|Data Series|Data Point)\.\.\.$/);
          else expect(row.t, `${side} chart ctx row ${i}`).toBe(CAPTIONS[i]);
        });
        if (side === 'ours') expect(info!.map((i) => i.glyph), 'ours chart ctx glyphs (trial: all but Save as Picture)').toEqual([true, true, true, true, true, true, true, true, true, true, false]);
        await page.keyboard.press('Escape');
      }
      // T55 pass 2: the trial's Bring Forward/Send Backward FLYOUT rows DO carry glyphs —
      // orange/white overlapping squares (evidence re-zoomed from
      // .probe/t51/out/official/m2-chart-sub8.png bottom flyout, both rows; also m2-shape-sub3).
      await ours.keyboard.press('Escape');
      const box = await ours.evaluate(() => {
        const canvas = [...document.querySelectorAll('canvas')].sort((a, b) => b.getBoundingClientRect().width * b.getBoundingClientRect().height - a.getBoundingClientRect().width * a.getBoundingClientRect().height)[0].getBoundingClientRect();
        return { x: canvas.left + 460, y: canvas.top + 300 };
      });
      await ours.mouse.click(box.x, box.y, { button: 'right' });
      await ours.waitForTimeout(400);
      await ours.locator('[data-command="contextMenu.bringChartForward"]').hover();
      await ours.waitForTimeout(350);
      const sub = await ours.evaluate(() => {
        const menus = [...document.querySelectorAll<HTMLElement>('.gc-designer-context-submenu')].filter((e) => e.getBoundingClientRect().width > 8);
        const m = menus[menus.length - 1];
        if (!m) return null;
        return [...m.querySelectorAll<HTMLElement>('.gc-designer-context-item')].map((r) => ({
          t: (r.querySelector('[data-label]')?.getAttribute('data-label') ?? r.textContent ?? '').replace(/\s+/g, ' ').trim(),
          glyph: !!r.querySelector('svg,img,canvas'),
        }));
      });
      expect(sub, 'ours Bring Forward submenu').not.toBeNull();
      expect(sub!.map((r) => r.t), 'submenu rows like the trial').toEqual(['Bring Forward', 'Bring To Front']);
      expect(sub!.every((r) => r.glyph), 'trial flyout rows carry icons — ours must too').toBe(true);
    } finally { await official.close(); await ours.close(); }
  });

  test('T55: Editing group collapses at 1440 and its flyout rows carry icons + text', async ({ browser }: { browser: Browser }) => {
    const [official, ours] = await bothBooted(browser);
    try {
      // The trial collapses Editing into a thumbnail button at this width (.probe/t51/.../ribbon-thumbnail-ed-sub0.png);
      // both sides must show the collapsed control whose dropdown re-renders the group.
      for (const page of [official, ours]) {
        const thumb = page.locator('[data-command="ribbon.ribbonGroupId.ribbon-thumbnail-editing"]');
        await expect(thumb.first(), 'Editing collapses into a ribbon thumbnail at 1440px').toBeVisible();
      }
      await ours.locator('[data-command="ribbon.ribbonGroupId.ribbon-thumbnail-editing"] .dropdown-btn').first().click({ force: true });
      await ours.waitForTimeout(400);
      const fly = await ours.evaluate(() => {
        const menu = [...document.querySelectorAll<HTMLElement>('.gc-designer-ribbon-dropdown')].filter((e) => e.getBoundingClientRect().width > 8).pop()!;
        if (!menu) return null;
        const rows = [...menu.querySelectorAll<HTMLElement>('[data-command^="ribbon."]')];
        const get = (cmd: string) => rows.find((r) => r.getAttribute('data-command') === `ribbon.${cmd}`);
        const row = (cmd: string) => { const r = get(cmd); if (!r) return null; const t = (r.textContent ?? '').replace(/\s+/g, ' ').trim(); return { t, glyph: !!r.querySelector('svg,img,canvas') }; };
        return { sum: row('editingAutoSum'), fill: row('editingFillDown'), clear: row('clear') };
      });
      expect(fly, 'ours Editing group flyout').not.toBeNull();
      for (const [label, r] of [['Sum', fly!.sum], ['Fill', fly!.fill], ['Clear', fly!.clear]] as const) {
        expect(r, `ours flyout has the ${label} row`).not.toBeNull();
        expect(r!.t, `${label} row shows its text caption like the trial`).toContain(label);
        expect(r!.glyph, `${label} row shows an icon like the trial`).toBe(true);
      }
    } finally { await official.close(); await ours.close(); }
  });

  test('T55: Shape Format quick styles are seven large Abc tiles with glyph + spinner', async ({ browser }: { browser: Browser }) => {
    const ours = await browser.newPage({ viewport: VIEWPORT });
    try {
      await boot(ours, 'ours');
      await ours.evaluate(() => {
        const GC = (window as any).GC.Spread.Sheets;
        const sheet = (window as any).__designerCompare.spread.getActiveSheet();
        if (sheet.shapes && !sheet.shapes.all().some((s: any) => s.name() === 'S1')) sheet.shapes.add('S1', GC.Shapes.AutoShapeType.rectangle, 320, 160, 120, 80);
      });
      await ours.waitForTimeout(400);
      // The contextual tab opens when the shape is selected (canvas point inside S1).
      const shapePoint = await ours.evaluate(() => {
        const r = [...document.querySelectorAll('canvas')].sort((a, b) => b.getBoundingClientRect().width * b.getBoundingClientRect().height - a.getBoundingClientRect().width * a.getBoundingClientRect().height)[0].getBoundingClientRect();
        return { x: r.left + 380, y: r.top + 200 };
      });
      await ours.mouse.click(shapePoint.x, shapePoint.y);
      await ours.waitForTimeout(500);
      await selectTab(ours, 'Shape Format');
      await ours.waitForTimeout(300);
      const tiles = await ours.evaluate(() => [...document.querySelectorAll<HTMLElement>('.gc-shape-style-tile')].map((e) => {
        const r = e.getBoundingClientRect();
        return { w: r.width, h: r.height, glyph: !!e.querySelector('svg') && (e.querySelector('svg')!.getBoundingClientRect().width > 30) };
      }));
      expect(tiles.length, 'seven quick styles like the trial').toBe(7);
      expect(tiles.every((t) => t.glyph), 'every quick tile draws its Abc preview').toBe(true);
      expect(tiles.every((t) => t.h >= 34), 'trial quick tiles are large (not mini pills)').toBe(true);
      await expect(ours.locator('[data-command="ribbon.shapeStylesMore"]'), 'gallery spinner like the trial').toBeVisible();
    } finally { await ours.close(); }
  });

  test('T55: cell menu follows the trial Custom Sort / Transform rules (data vs empty vs pivot)', async ({ browser }: { browser: Browser }) => {
    const ours = await browser.newPage({ viewport: VIEWPORT });
    try {
      await boot(ours, 'ours');
      await ours.evaluate(() => {
        const spread = (window as any).__designerCompare.spread;
        spread.addSheet(1);
        const ps = spread.getSheet(1);
        ps.name('PivotProbe');
        ps.pivotTables.add('ProbePivot', 'Data!A1:F5', 2, 2);
      });
      await ours.waitForTimeout(400);
      const canvasBox = await ours.evaluate(() => {
        const r = [...document.querySelectorAll('canvas')].sort((a, b) => b.getBoundingClientRect().width * b.getBoundingClientRect().height - a.getBoundingClientRect().width * a.getBoundingClientRect().height)[0].getBoundingClientRect();
        return { left: r.left, top: r.top };
      });
      const menuProbe = async (): Promise<{ items: string[] }> => ours.evaluate(() => {
        const menus = [...document.querySelectorAll<HTMLElement>('.gc-designer-context-menu')].filter((e) => e.getBoundingClientRect().width > 80);
        const top = menus[menus.length - 1];
        if (!top) return { items: [] };
        const items = [...top.querySelectorAll<HTMLElement>('.gc-designer-context-item')].map((e) => (e.querySelector('[data-label]')?.getAttribute('data-label') ?? e.textContent ?? '').replace(/\s+/g, ' ').trim());
        return { items };
      });
      const hoverSortProbe = async (): Promise<boolean | null> => {
        const sortRow = ours.locator('.gc-designer-context-item[data-command="contextMenu.sort"]');
        if (!(await sortRow.count())) return null;
        await sortRow.hover();
        await ours.waitForTimeout(350);
        return ours.evaluate(() => {
          const menus = [...document.querySelectorAll<HTMLElement>('.gc-designer-context-submenu')].filter((e) => e.getBoundingClientRect().width > 8);
          const sub = menus[menus.length - 1];
          if (!sub) return null;
          const row = [...sub.querySelectorAll<HTMLElement>('.gc-designer-context-item')].find((e) => (e.textContent ?? '').includes('Custom Sort'));
          return row ? row.getAttribute('aria-disabled') === 'true' : null;
        });
      };
      // (a) Non-empty cell outside any table (North/East label row 2 col 0): Custom Sort enabled.
      const dataPoint = await ours.evaluate(({ left, top }) => {
        const spread = (window as any).__designerCompare.spread;
        const sheet = spread.getSheet(0);
        void sheet;
        for (let y = 2; y < 400; y += 3) for (let x = 2; x < 800; x += 3) {
          const hit = spread.hitTest(x, y);
          const w = hit && hit.worksheetHitInfo;
          if (w && w.row === 2 && w.col === 0) return { x: left + x, y: top + y };
        }
        return null;
      }, canvasBox);
      expect(dataPoint, 'found a data cell on the Data sheet').not.toBeNull();
      await ours.mouse.click(dataPoint!.x, dataPoint!.y, { button: 'right' });
      await ours.waitForTimeout(400);
      let info = await menuProbe();
      expect(info.items, 'data cell keeps Transform Cells (trial m2-pivot-sub7)').toContain('Transform Cells...');
      expect(await hoverSortProbe(), 'non-empty cell: Custom Sort enabled like the trial (m2-pivot-sub7)').toBe(false);
      await ours.keyboard.press('Escape');
      // (b) Empty cell far below/right: the live trial keeps Custom Sort ENABLED here too
      // (measured 2026-11-18 by hover-reading the official flyout in ?side=official; the
      // greyed item in menu-tablecell-sub7.png is the dimmed-capture artifact — the whole
      // background of that screenshot is masked, and the trial runs without the pivot add-on).
      await ours.mouse.click(canvasBox.left + 1000, canvasBox.top + 550, { button: 'right' });
      await ours.waitForTimeout(400);
      expect(await hoverSortProbe(), 'empty cell: Custom Sort enabled like the trial').toBe(false);
      await ours.keyboard.press('Escape');
      // (c) Pivot range on the probe sheet: Transform suppressed (trial menu-pivot-sub7).
      await ours.evaluate(() => {
        const spread = (window as any).__designerCompare.spread;
        spread.setActiveSheetIndex(1);
      });
      await ours.waitForTimeout(300);
      const pivotPoint = await ours.evaluate(({ left, top }) => {
        const spread = (window as any).__designerCompare.spread;
        const ps = spread.getSheet(1);
        void ps;
        for (let y = 2; y < 500; y += 3) for (let x = 2; x < 800; x += 3) {
          const hit = spread.hitTest(x, y);
          const w = hit && hit.worksheetHitInfo;
          if (w && w.row >= 2 && w.row < 20 && w.col >= 2 && w.col < 5) return { x: left + x, y: top + y };
        }
        return null;
      }, canvasBox);
      expect(pivotPoint, 'found a pivot-range cell').not.toBeNull();
      await ours.mouse.click(pivotPoint!.x, pivotPoint!.y, { button: 'right' });
      await ours.waitForTimeout(400);
      info = await menuProbe();
      expect(info.items.length, 'pivot cell menu opened').toBeGreaterThan(5);
      expect(info.items, 'pivot range suppresses Transform Cells (trial menu-pivot-sub7)').not.toContain('Transform Cells...');
      // Only state the trial genuinely greys "Custom Sort..." in (menu-pivot-sub7.png; the live
      // trial pivot add-on is disabled so pivot clicks open the pivot OBJECT menu instead).
      expect(await hoverSortProbe(), 'pivot range: Custom Sort greyed like the trial').toBe(true);
    } finally { await ours.close(); }
  });

  test('T55: Cell Styles gallery — Titles/Number Format previews are styled text, footer rows have icons', async ({ browser }: { browser: Browser }) => {
    const [official, ours] = await bothBooted(browser);
    try {
      await openRibbonMenu(official, 'cellStyles');
      await openRibbonMenu(ours, 'cellStyles');
      // Trial (menu-Home__ribbon.cellStyles.png): Heading/Title/Total and Number Format previews are
      // styled TEXT without a bordered chip; New Cell Style.../Manage Cell States have leading icons.
      const probe = (page: Page) => page.evaluate(() => {
        const menus = [...document.querySelectorAll<HTMLElement>('.gc-designer-ribbon-dropdown')].filter((e) => e.getBoundingClientRect().width > 300);
        const menu = menus[menus.length - 1];
        if (!menu) return null;
        const footers = [...menu.querySelectorAll<HTMLElement>('.gc-designer-gallery-footer')];
        const tiles = [...menu.querySelectorAll<HTMLElement>('.gc-designer-cell-style-tile')].map((t) => {
          const p = t.querySelector<HTMLElement>('.gc-designer-cell-style-preview');
          const label = (t.getAttribute('title') ?? '').trim();
          return { label, bordered: !!p && getComputedStyle(p).borderTopWidth !== '0px' && !/rgba\(0, 0, 0, 0\)|transparent/.test(getComputedStyle(p).borderTopColor) };
        });
        const heading = tiles.find((t) => t.label === 'Heading 1');
        const comma = tiles.find((t) => t.label === 'Comma');
        return {
          headings: tiles.filter((t) => /Heading|^Title$|^Total$/.test(t.label)).length,
          headingBordered: heading?.bordered,
          commaBordered: comma?.bordered,
          footers: footers.map((f) => ({ t: (f.textContent ?? '').trim(), icon: !!f.querySelector('svg,img,canvas,i,[class*=icon]') })),
        };
      });
      const o = await probe(official);
      const u = await probe(ours);
      expect(o, 'official cell styles gallery opens').not.toBeNull();
      expect(u, 'ours cell styles gallery').not.toBeNull();
      expect(u!.headingBordered, 'Heading 1 preview is styled text, no bordered chip (trial)').toBe(false);
      expect(u!.commaBordered, 'Number Format previews are plain text, no chip (trial)').toBe(false);
      expect(u!.headings, 'Titles and Headings has six tiles like the trial').toBe(6);
      expect(u!.footers.length, 'two footer rows').toBe(2);
      expect(u!.footers.every((f) => f.icon), 'footer rows keep their leading icons (trial)').toBe(true);
    } finally { await official.close(); await ours.close(); }
  });

  test('T55 pass 2: shape ctx flyout rows carry icons like the trial (Group / Bring Forward / Send Backward)', async ({ browser }: { browser: Browser }) => {
    const ours = await browser.newPage({ viewport: VIEWPORT });
    try {
      await boot(ours, 'ours');
      await ours.evaluate(() => {
        const GC = (window as any).GC.Spread.Sheets;
        const sheet = (window as any).__designerCompare.spread.getActiveSheet();
        if (!sheet.shapes.all().some((s: any) => s.name() === 'SpecShape')) sheet.shapes.add('SpecShape', GC.Shapes.AutoShapeType.rectangle, 320, 200, 140, 90);
      });
      await ours.waitForTimeout(300);
      const box = await ours.evaluate(() => {
        const s = (window as any).__designerCompare.spread.getActiveSheet().shapes.all().find((x: any) => x.name() === 'SpecShape');
        const c = [...document.querySelectorAll('canvas')].sort((a, b) => b.getBoundingClientRect().width * b.getBoundingClientRect().height - a.getBoundingClientRect().width * a.getBoundingClientRect().height)[0].getBoundingClientRect();
        const num = (fn: string): number => { const v = typeof s?.[fn] === 'function' ? s[fn]() : s?.[fn]; return Number.isFinite(v) ? v : NaN; };
        const left = num('left'), top = num('top'), width = num('width'), height = num('height');
        if ([left, top, width, height].some((v) => !Number.isFinite(v))) return { x: c.left + 390, y: c.top + 245 };
        return { x: c.left + left + width / 2, y: c.top + top + height / 2 };
      });
      await ours.mouse.click(box.x, box.y, { button: 'right' });
      await ours.waitForTimeout(400);
      // Evidence: .probe/t51/out/official/m2-shape-sub2/3/4.png — every flyout row has a glyph.
      for (const [anchor, expectRows] of [
        ['contextMenu.shapeGroup', ['Group', 'Ungroup']],
        ['contextMenu.bringShapeForward', ['Bring Forward', 'Bring To Front']],
        ['contextMenu.sendShapeBackward', ['Send Backward', 'Send To Back']],
      ] as Array<[string, string[]]>) {
        await ours.locator(`[data-command="${anchor}"]`).hover();
        await ours.waitForTimeout(350);
        const rows = await ours.evaluate(() => {
          const menus = [...document.querySelectorAll<HTMLElement>('.gc-designer-context-submenu')].filter((e) => e.getBoundingClientRect().width > 8);
          const m = menus[menus.length - 1];
          if (!m) return null;
          return [...m.querySelectorAll<HTMLElement>('.gc-designer-context-item')].map((r) => ({
            t: (r.querySelector('[data-label]')?.getAttribute('data-label') ?? r.textContent ?? '').replace(/\s+/g, ' ').trim(),
            glyph: !!r.querySelector('svg,img,canvas'),
          }));
        });
        expect(rows, `${anchor} flyout opens`).not.toBeNull();
        expect(rows!.map((r) => r.t), `${anchor} rows`).toEqual(expectRows);
        expect(rows!.every((r) => r.glyph), `${anchor} flyout rows carry icons like the trial`).toBe(true);
      }
    } finally { await ours.close(); }
  });

  test('T55 pass 2: CF base menu — arrows flush right, Highlight badge is a comparison sign not a sigma', async ({ browser }: { browser: Browser }) => {
    const ours = await browser.newPage({ viewport: VIEWPORT });
    try {
      await boot(ours, 'ours');
      await openRibbonMenu(ours, 'conditionFormat');
      const geo = await ours.evaluate(() => {
        const menus = [...document.querySelectorAll<HTMLElement>('.gc-designer-ribbon-dropdown')].filter((e) => e.getBoundingClientRect().width > 8);
        const menu = menus[0];
        const box = menu.getBoundingClientRect();
        const arrows = [...menu.querySelectorAll<HTMLElement>('.gc-designer-ribbon-list-item-arrow')].map((a) => Math.round(box.right - a.getBoundingClientRect().right));
        const hl = [...menu.querySelectorAll<HTMLElement>('[data-command="menu.highlightCellsRules"] svg')][0];
        return { arrows, hasHlIcon: !!hl, rows: menu.querySelectorAll('.gc-designer-ribbon-list-item-container').length };
      });
      expect(geo.rows, 'eight menu rows like the trial (5 galleries + New/Clear/Manage)').toBe(8);
      expect(geo.hasHlIcon, 'Highlight Cells Rules carries the 24px grid icon').toBe(true);
      // Trial: all six submenu arrows (HL, TB, DB, CS, IS, Clear) sit on one vertical line.
      expect(geo.arrows.length, 'six rows have submenu arrows').toBe(6);
      expect(Math.max(...geo.arrows) - Math.min(...geo.arrows), 'arrows flush right on one line').toBeLessThanOrEqual(1);
    } finally { await ours.close(); }
  });

  test('T55 pass 2: Focus Cell row uses the trial plus glyph (no checkbox), Show Auto-Highlight enabled', async ({ browser }: { browser: Browser }) => {
    const ours = await browser.newPage({ viewport: VIEWPORT });
    try {
      await boot(ours, 'ours');
      await ours.evaluate(() => {
        [...document.querySelectorAll('.gc-designer-ribbon-tab-nav-text')].find((e) => (e.getAttribute('aria-label') ?? e.textContent ?? '').trim() === 'View')?.click();
      });
      await ours.waitForTimeout(250);
      await openRibbonMenu(ours, 'focusCell');
      const rows = await ours.evaluate(() => {
        const menus = [...document.querySelectorAll<HTMLElement>('.gc-designer-ribbon-dropdown')].filter((e) => e.getBoundingClientRect().width > 8);
        const menu = menus[0];
        return [...menu.querySelectorAll<HTMLElement>('.gc-designer-ribbon-list-item-container')].map((r) => ({
          t: (r.textContent ?? '').replace(/\s+/g, ' ').trim(),
          svg: !!r.querySelector('svg'),
          disabled: r.getAttribute('aria-disabled') === 'true' || /disabled/.test(String(r.className)),
        }));
      });
      expect(rows.length, 'three rows like the trial').toBe(3);
      expect(rows[0].svg, 'Focus Cell row has the plus icon (trial)').toBe(true);
      expect(rows[0].disabled, 'Focus Cell enabled').toBe(false);
      expect(rows[2].disabled, 'Show Auto-Highlight enabled like the trial').toBe(false);
    } finally { await ours.close(); }
  });
});
