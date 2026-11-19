/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Task 63: the Cell Styles gallery's "Color, DateTime and Other Cell Type Style" tiles must
 * produce the same model as the trial: the same sections/tiles (labels, order), a workbook named
 * style registered with the same template JSON, the cell's style pointing at it via `parentName`,
 * the cell type untouched, and the same resolved `cellButtons` / `dropDowns` / `formatter`.
 * Tiles are clicked with real mouse events in the ribbon gallery on BOTH sides (H2..H11, one tile
 * per cell so each tile is applied to a pristine cell). The second spec walks the official
 * "New Cell Style..." dialog: creating a named style must add a Custom tile that applies the style.
 */
import { expect, test, type Page } from '@playwright/test';
import { boot, type Side } from './helpers';

test.setTimeout(180_000);

const TILES = [
  'colorPicker-cellbutton', 'datetimepicker-cellbutton', 'dateRangePicker-cellbutton', 'timepicker-cellbutton', 'calculator-cellbutton',
  'monthpicker-cellbutton', 'slider-cellbutton', 'sliderRange-cellbutton', 'okcancel-cellbutton', 'clear-cellbutton',
];

/** Click the centre of an element with real mouse events (the trial's ribbon arrows are hover-only). */
async function clickCenter(page: Page, selector: string): Promise<void> {
  const point = await page.evaluate((css) => {
    const el = [...document.querySelectorAll(css)].find((e) => e.getBoundingClientRect().width > 0);
    if (!el) throw new Error(`no element for ${css}`);
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, selector);
  await page.mouse.click(point.x, point.y);
  await page.waitForTimeout(150);
}

/** Click the deepest visible element inside the given subtree whose trimmed text equals `text`. */
async function clickByText(page: Page, rootSelector: string, text: string): Promise<void> {
  const point = await page.evaluate(({ rootSelector, text }) => {
    const nodes = [...document.querySelectorAll(rootSelector)];
    for (const root of nodes) {
      const match = [...root.querySelectorAll('*')]
        .filter((e) => (e.textContent || '').trim() === text)
        .sort((a, b) => b.getBoundingClientRect().width * b.getBoundingClientRect().height - a.getBoundingClientRect().width * a.getBoundingClientRect().height)[0];
      if (!match) continue;
      const r = match.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }
    throw new Error(`no "${text}" under ${rootSelector}`);
  }, { rootSelector, text });
  await page.mouse.click(point.x, point.y);
  await page.waitForTimeout(150);
}

const gallerySelector = (side: Side): string =>
  side === 'ours' ? '.gc-designer-cell-styles-gallery' : '.gc-designer-ribbon-dropdown .gc-list-control-container';

/** Open Home > Cell Styles. At the 1440px test viewport both ribbons expose the button directly. */
async function openCellStyles(page: Page, side: Side): Promise<void> {
  await clickCenter(page, '[data-command="ribbon.cellStyles"] .dropdown-btn');
  await page.waitForSelector(gallerySelector(side), { timeout: 5_000 });
}

/** Section titles + tile labels (title attributes) of the open gallery, in DOM order. */
const galleryStructure = (side: Side) => (page: Page) => page.evaluate(({ side }) => {
  const roots = [...document.querySelectorAll(side === 'official' ? '.gc-designer-ribbon-dropdown' : '.gc-designer-cell-styles-gallery')]
    .filter((e) => e.getBoundingClientRect().width > 10);
  const root = roots.sort((a, b) => b.getBoundingClientRect().height - a.getBoundingClientRect().height)[0];
  if (!root) return null;
  const sections = side === 'official'
    ? [...root.querySelectorAll('.gc-list-control-group')]
    : [...root.querySelectorAll('.gc-designer-gallery-section')];
  return {
    titles: sections.map((g) => (g.querySelector(side === 'official' ? '.gc-list-control-group-text' : '.gc-designer-gallery-title')?.textContent ?? '').trim()),
    items: sections.map((g) => [...g.querySelectorAll(side === 'official' ? '.gc-list-control-item' : '.gc-designer-cell-style-tile')].map((t) => t.getAttribute('title') ?? '')),
    footer: [...root.querySelectorAll('*')].some((e) => e.children.length === 0 && (e.textContent || '').trim() === 'New Cell Style...'),
  };
}, { side });

interface TileSnapshot {
  parentName: string | null;
  cellType: Record<string, unknown>;
  named: Record<string, unknown> | null;
  actual: { formatter?: string; cellButtons?: unknown[]; dropDowns?: unknown[] };
}

/** Read the model after applying the tile in `value` on cell (row, 7). */
const tileSnapshot = (row: number, value: string) => (page: Page): Promise<TileSnapshot> => page.evaluate(({ row, value }) => {
  const wb = (window as any).__designerCompare.spread;
  const sheet = wb.getActiveSheet();
  const style = sheet.getStyle(row, 7);
  const cellType = sheet.getCellType(row, 7);
  const named = wb.getNamedStyle(value);
  const actual = sheet.getActualStyle(row, 7);
  return {
    parentName: style ? (style.parentName ?? null) : null,
    cellType: cellType && cellType.toJSON ? cellType.toJSON() : { typeName: String(cellType) },
    named: named ? named.toJSON() : null,
    actual: { formatter: actual.formatter, cellButtons: actual.cellButtons, dropDowns: actual.dropDowns },
  };
}, { row, value });

/** Neutralise the date-dependent monthpicker years and drop undefined-valued keys for comparison. */
function normalize(snapshot: TileSnapshot): TileSnapshot {
  const year = new Date().getFullYear();
  const clean = (node: any): any => {
    if (Array.isArray(node)) return node.map(clean);
    if (node && typeof node === 'object') {
      const out: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(node)) {
        if (value === undefined) continue;
        if ((key === 'startYear' && value === year - 10) || (key === 'stopYear' && value === year)) out[key] = `<relative:${key}>`;
        else out[key] = clean(value);
      }
      return out;
    }
    return node;
  };
  return clean(snapshot) as TileSnapshot;
}

test.describe('Cell Styles gallery: cell-type tiles (paired with the trial)', () => {
  test('gallery exposes the same sections and tile labels on both sides', async ({ browser }) => {
    const pages = { official: await browser.newPage({ viewport: { width: 1440, height: 800 } }), ours: await browser.newPage({ viewport: { width: 1440, height: 800 } }) };
    try {
      await boot(pages.official, 'official');
      await boot(pages.ours, 'ours');
      await openCellStyles(pages.official, 'official');
      await openCellStyles(pages.ours, 'ours');
      const [official, ours] = await Promise.all([galleryStructure('official')(pages.official), galleryStructure('ours')(pages.ours)]);
      expect(official).not.toBeNull();
      expect(ours).not.toBeNull();
      expect(ours!.titles).toEqual(official!.titles);
      expect(ours!.items).toEqual(official!.items);
      expect(ours!.footer).toBe(official!.footer);
    } finally { await pages.official.close(); await pages.ours.close(); }
  });

  test('every cell-type tile produces the same model as the trial', async ({ browser }) => {
    const pages = { official: await browser.newPage({ viewport: { width: 1440, height: 800 } }), ours: await browser.newPage({ viewport: { width: 1440, height: 800 } }) };
    try {
      await boot(pages.official, 'official');
      await boot(pages.ours, 'ours');
      for (let i = 0; i < TILES.length; i++) {
        const value = TILES[i], row = i + 1;
        for (const side of ['official', 'ours'] as const) {
          await pages[side].evaluate(({ row }) => (window as any).__designerCompare.spread.getActiveSheet().setSelection(row, 7, 1, 1), { row });
          await openCellStyles(pages[side], side);
          await clickCenter(pages[side], `${gallerySelector(side).split(' ')[0]} [data-value="${value}"]`);
        }
        const [official, ours] = await Promise.all([tileSnapshot(row, value)(pages.official), tileSnapshot(row, value)(pages.ours)]);
        expect(normalize(ours), `tile ${value} on ${row} H`).toEqual(normalize(official));
        expect(ours.parentName, `parentName ${value}`).toBe(value);
        expect((ours.cellType as any).typeName, `cellType untouched ${value}`).toBe((official.cellType as any).typeName);
        expect((ours.named as any).cellButtons, `named cellButtons ${value}`).toEqual((official.named as any).cellButtons);
      }
    } finally { await pages.official.close(); await pages.ours.close(); }
  });

  test('New Cell Style... creates a named style that gets a Custom tile and applies like the trial', async ({ browser }) => {
    const pages = { official: await browser.newPage({ viewport: { width: 1440, height: 800 } }), ours: await browser.newPage({ viewport: { width: 1440, height: 800 } }) };
    try {
      await boot(pages.official, 'official');
      await boot(pages.ours, 'ours');
      const autoNames: Record<Side, string> = {} as any;
      for (const side of ['official', 'ours'] as const) {
        const page = pages[side];
        // Give the active cell a distinctive format so the created style should carry it.
        await page.evaluate(() => {
          const sheet = (window as any).__designerCompare.spread.getActiveSheet();
          sheet.setSelection(12, 7, 1, 1);
          sheet.setFormatter(12, 7, '$#,##0.00');
        });
        await openCellStyles(page, side);
        await clickByText(page, side === 'official' ? '.gc-designer-ribbon-dropdown' : '.gc-designer-cell-styles-gallery', 'New Cell Style...');
        // The dialog: title "Style", one text input prefilled with the auto name.
        const input = page.locator('.gc-dialog input:visible, [role="dialog"] input:visible').first();
        await expect(input, `${side}: Style dialog input`).toBeVisible({ timeout: 5_000 });
        autoNames[side] = await input.inputValue();
        await input.click({ clickCount: 3 });
        await input.press('Control+a');
        await input.type('Trial');
        await clickByText(page, side === 'official' ? '.gc-dialog, [role="dialog"]' : '.gc-dialog', 'OK');
        await page.waitForTimeout(300);
      }
      expect(autoNames.ours).toBe(autoNames.official);
      // Reopen the galleries: the custom style must now have a tile.
      await openCellStyles(pages.official, 'official');
      await openCellStyles(pages.ours, 'ours');
      const [official, ours] = await Promise.all([galleryStructure('official')(pages.official), galleryStructure('ours')(pages.ours)]);
      expect(ours!.titles).toEqual(official!.titles);
      expect(ours!.items).toEqual(official!.items);
      // Applying the Custom tile on cell (13, 7) points the style at the named style on both sides.
      for (const side of ['official', 'ours'] as const) {
        await pages[side].evaluate(() => (window as any).__designerCompare.spread.getActiveSheet().setSelection(13, 7, 1, 1));
        await clickCenter(pages[side], `${side === 'official' ? '.gc-list-control-item' : '.gc-designer-cell-style-tile'}[data-value="Trial"]`);
      }
      const snap = async (side: Side) => pages[side].evaluate(() => {
        const wb = (window as any).__designerCompare.spread;
        const sheet = wb.getActiveSheet();
        const style = sheet.getStyle(13, 7);
        const actual = sheet.getActualStyle(13, 7);
        const named = wb.getNamedStyle('Trial');
        return {
          parentName: style ? style.parentName : null,
          formatter: actual ? actual.formatter : undefined,
          named: named ? { formatter: named.formatter } : null,
        };
      });
      const [modelOfficial, modelOurs] = await Promise.all([snap('official'), snap('ours')]);
      expect(modelOurs.parentName, 'Custom tile sets parentName').toBe('Trial');
      expect(modelOurs).toEqual(modelOfficial);
    } finally { await pages.official.close(); await pages.ours.close(); }
  });
});
