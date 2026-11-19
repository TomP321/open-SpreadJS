/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Task 61: the Designer context menus must offer the same entries (text, order,
 * disabled state, submenu arrow + submenu contents) as the trial in every context.
 * One spec right-clicks the same spot on both sides and compares normalized dumps.
 */
import { expect, test, type Page } from '@playwright/test';
import { boot } from './helpers';

test.setTimeout(180_000);

interface Entry { text: string; disabled: boolean; submenu: string[] | null; group?: number }

const setup = async (page: Page): Promise<void> => {
  await page.evaluate(() => {
    const spread = (window as any).__designerCompare.spread;
    const sheet = spread.getActiveSheet();
    if (!sheet.tables.findByName('Sales')) sheet.tables.add('Sales', 0, 0, 4, 5);
    if (!sheet.charts.all().some((chart: any) => chart.name() === 'Chart1')) sheet.charts.add('Chart1', (window as any).GC.Spread.Sheets.Charts.ChartType.columnClustered, 700, 250, 300, 180, 'A1:C5');
    if (!sheet.shapes.all().some((shape: any) => shape.name() === 'Rect1')) sheet.shapes.add('Rect1', (window as any).GC.Spread.Sheets.Shapes.AutoShapeType.rectangle, 470, 380, 150, 70);
    spread.refresh();
  });
  await page.waitForTimeout(300);
};

/** Workbook canvas-relative point lookup via the public hitTest API. */
const findPoint = async (page: Page, match: string, row?: number, col?: number): Promise<{ x: number; y: number }> => {
  const point = await page.evaluate(({ match, row, col }) => {
    const s = (window as any).__designerCompare.spread;
    const canvases = [...document.querySelectorAll('#designer-host canvas')];
    const main = canvases.sort((a, b) => b.getBoundingClientRect().width * b.getBoundingClientRect().height - a.getBoundingClientRect().width * a.getBoundingClientRect().height)[0];
    const host = main.getBoundingClientRect();
    const hits: { x: number; y: number }[] = [];
    for (let y = 2; y < 640; y += 4) {
      for (let x = 2; x < 1240; x += 4) {
        const hit = s.hitTest(x, y);
        if (!hit) continue;
        if (match === 'tab') { if (hit.tabStripHitInfo?.sheetTab) { hits.push({ x: host.left + x, y: host.top + y }); break; } else continue; }
        const w = hit.worksheetHitInfo;
        if (!w) continue;
        const ok =
          (match === 'viewport' && w.hitTestType === 3 && w.row === row && w.col === col) ||
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
  if (!point) throw new Error(`No ${match} point found for ${row},${col}`);
  return point;
};

/** Locate a chart/shape by probing right-click points around its model position. */
const findObjectPoint = async (page: Page, side: 'official' | 'ours', kind: 'chart' | 'shape'): Promise<{ x: number; y: number }> => {
  const model = await page.evaluate(({ kind }) => {
    const sheet = (window as any).__designerCompare.spread.getActiveSheet();
    const object = kind === 'chart' ? sheet.charts.all()[0] : sheet.shapes.all().find((item: any) => item.name() === 'Rect1') ?? sheet.shapes.all()[0];
    if (!object) return null;
    try {
      const host = object.getHost()[0];
      if (host) { const rect = host.getBoundingClientRect(); if (rect.width > 10) return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }; }
    } catch { /* new charts plugin has no getHost */ }
    return { x: object.x(), y: object.y(), width: object.width(), height: object.height(), model: true };
  }, { kind });
  if (!model) throw new Error(`no ${kind} on ${side}`);
  if (!model.model) return model as { x: number; y: number };
  const box = model;
  const canvases = await page.$$('#designer-host canvas');
  let host = { left: 0, top: 0 };
  let best = 0;
  for (const canvas of canvases) { const rect = await canvas.boundingBox(); if (rect && rect.width * rect.height > best) { best = rect.width * rect.height; host = { left: rect.x, top: rect.y }; } }
  const probeMenuText = async (): Promise<string> => page.evaluate(({ official }) => {
    if (official) { const root = [...document.querySelectorAll('.gc-ui-contextmenu-container')].find((el) => el.getBoundingClientRect().width > 10); return root ? (root as HTMLElement).innerText : ''; }
    const root = [...document.querySelectorAll('.gc-designer-context-menu')].find((el) => el.getBoundingClientRect().width > 10); return root ? (root as HTMLElement).innerText : '';
  }, { official: side === 'official' });
  const expected = kind === 'chart' ? 'Reset to Match Style' : 'Format Shape';
  const candidates: [number, number][] = kind === 'chart'
    ? [[-box.width / 2 + 25, -box.height / 2 + 20], [0, 0], [-box.width / 2 + 40, 0], [0, -box.height / 2 + 18]]
    : [[0, 0], [-box.width / 4, -box.height / 4], [box.width / 4, box.height / 4]];
  for (const hOff of [60, 40, 80, 0, 120]) {
    for (const vOff of [20, 40, 60, 0]) {
      for (const [px, py] of candidates) {
      const x = host.left + hOff + box.x + box.width / 2 + px;
      const y = host.top + vOff + box.y + box.height / 2 + py;
      await page.mouse.click(x, y, { button: 'right' });
      await page.waitForTimeout(250);
      const text = await probeMenuText();
      if (text.includes(expected)) return { x, y };
      if (text.includes('Paste Options')) await page.mouse.click(x, y - 200);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(120);
      }
    }
  }
  throw new Error(`no ${kind} menu found on ${side}`);
};

const readMenu = async (page: Page, side: 'official' | 'ours'): Promise<Entry[]> => {
  const entries = await page.evaluate(({ official }) => {
    const visible = (element: Element) => { const r = element.getBoundingClientRect(); return r.width > 10 && r.height > 10; };
    if (official) {
      const containers = [...document.querySelectorAll('.gc-ui-contextmenu-container')].filter(visible);
      const root = containers[0];
      if (!root) return [];
      const items: Entry[] = [];
      for (const child of root.children) {
        if ((child.className ?? '').toString().includes('gc-ui-contextmenu-separator')) continue;
        const header = child.querySelector('.gc-ui-contextmenu-group-header');
        if (header) { items.push({ text: (header.textContent ?? '').trim(), disabled: false, submenu: null, group: child.querySelectorAll('.gc-ui-contextmenu-groupitem').length }); continue; }
        const content = child.querySelector('.gc-ui-contextmenu-menuitem-content') ?? child;
        const text = (child.querySelector('.gc-ui-contextmenu-text')?.textContent ?? child.textContent ?? '').trim();
        const disabled = content.getAttribute('aria-disabled') === 'true' || content.className.includes('disabled') || child.className.includes('disabled');
        const hasSub = content.getAttribute('aria-haspopup') === 'true';
        items.push({ text, disabled, submenu: hasSub ? [] : null });
      }
      return items;
    }
    const root = [...document.querySelectorAll('.gc-designer-context-menu')].filter(visible).pop();
    if (!root) return [];
    const items: Entry[] = [];
    for (const child of root.children) {
      if (child.classList.contains('gc-designer-ribbon-separator-horizontal')) continue;
      if (child.classList.contains('gc-designer-paste-options')) { items.push({ text: (child.querySelector('.gc-designer-paste-options-label')?.textContent ?? 'Paste Options:').trim(), disabled: false, submenu: null, group: child.querySelectorAll('.gc-designer-paste-option').length }); continue; }
      const disabled = child.getAttribute('aria-disabled') === 'true' || !!child.querySelector('[aria-disabled="true"]');
      const hasSub = !!child.querySelector(':scope > .gc-designer-context-arrow');
      items.push({ text: (child.querySelector(':scope > [data-label]')?.getAttribute('data-label') ?? child.textContent ?? '').trim(), disabled, submenu: hasSub ? [] : null });
    }
    return items;
  }, { official: side === 'official' });
  return entries;
};

/** Hover every submenu parent and capture its entries (text + disabled). */
const readSubmenus = async (page: Page, side: 'official' | 'ours', entries: Entry[]): Promise<void> => {
  if (side === 'official') await page.evaluate(() => {
    document.querySelectorAll('[data-probe-root]').forEach((el) => el.removeAttribute('data-probe-root'));
    const root = [...document.querySelectorAll('.gc-ui-contextmenu-container')].find((el) => { const r = el.getBoundingClientRect(); return r.width > 10 && r.height > 10; });
    root?.setAttribute('data-probe-root', '1');
  });
  for (const entry of entries) {
    if (!entry.submenu) continue;
    const label = entry.text;
    if (label === 'Tab Color') { entry.submenu = []; continue; }
    const locator = side === 'official'
      ? page.locator('.gc-ui-contextmenu-container[data-probe-root]').getByText(label, { exact: true }).first()
      : page.locator(`.gc-designer-context-menu .gc-designer-context-item:has([data-label="${label}"])`).first();
    try {
      const box = await locator.boundingBox();
      if (!box) throw new Error('no box');
      // Stay on the parent row (x offset 6) so object menus do not lose their selection.
      await page.mouse.move(box.x + 6, box.y + Math.min(box.height / 2, 10));
      await page.waitForTimeout(350);
    } catch { entry.submenu = ['HOVER-FAIL']; continue; }
    await page.waitForTimeout(300);
    entry.submenu = await page.evaluate(({ official }) => {
      const visible = (element: Element) => { const r = element.getBoundingClientRect(); return r.width > 10 && r.height > 10; };
      const texts: string[] = [];
      if (official) {
        const containers = [...document.querySelectorAll('.gc-ui-contextmenu-container')].filter(visible);
        const sub = containers.find((container) => !container.hasAttribute('data-probe-root'));
        if (!sub) return texts;
        for (const child of sub.children) {
          if ((child.className ?? '').toString().includes('separator')) continue;
          const content = child.querySelector('.gc-ui-contextmenu-menuitem-content') ?? child;
          const text = (child.querySelector('.gc-ui-contextmenu-text')?.textContent ?? '').trim();
          if (!text) continue;
          texts.push(content.getAttribute('aria-disabled') === 'true' || content.className.includes('disabled') ? `${text} (off)` : text);
        }
        return texts;
      }
      const menu = document.querySelector('.gc-designer-context-submenu');
      if (!menu || !visible(menu)) return texts;
      for (const item of menu.querySelectorAll('[role=menuitem]')) {
        const text = (item.getAttribute('data-label') ?? item.textContent ?? '').trim();
        if (!text) continue;
        texts.push(item.getAttribute('aria-disabled') === 'true' ? `${text} (off)` : text);
      }
      return texts;
    }, { official: side === 'official' });
  }
};

const dumpFor = async (page: Page, side: 'official' | 'ours'): Promise<Entry[]> => {
  await page.waitForTimeout(300);
  const entries = await readMenu(page, side);
  await readSubmenus(page, side, entries);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  return entries;
};

interface ContextCase { name: string; before?: (page: Page) => Promise<void>; point: (page: Page, side: 'official' | 'ours') => Promise<{ x: number; y: number }> }

const contexts: ContextCase[] = [
  { name: 'plain cell', point: (page) => findPoint(page, 'viewport', 8, 7) },
  { name: 'cell in table', point: (page) => findPoint(page, 'viewport', 2, 2) },
  { name: 'row header', point: (page) => findPoint(page, 'rowHeader', 3) },
  { name: 'column header', point: (page) => findPoint(page, 'colHeader', undefined, 2) },
  { name: 'corner', point: (page) => findPoint(page, 'corner') },
  {
    name: 'cell after copy',
    before: async (page) => {
      const copy = await findPoint(page, 'viewport', 2, 2);
      await page.mouse.click(copy.x, copy.y);
      await page.keyboard.press('Control+C');
      await page.waitForTimeout(200);
    },
    point: (page) => findPoint(page, 'viewport', 12, 15),
  },
  {
    // Trial suppresses "Insert Copied Cells..." (and Transform Cells...) when the target lies
    // inside a table — the menu then equals the plain cell-in-table menu plus the paste row.
    name: 'cell in table after copy',
    before: async (page) => {
      const copy = await findPoint(page, 'viewport', 1, 0);
      await page.mouse.click(copy.x, copy.y);
      await page.keyboard.press('Control+C');
      await page.waitForTimeout(200);
    },
    point: (page) => findPoint(page, 'viewport', 3, 0),
  },
  { name: 'sheet tab', point: (page) => findPoint(page, 'tab') },
  { name: 'chart', point: (page, side) => findObjectPoint(page, side, 'chart') },
  { name: 'shape', point: (page, side) => findObjectPoint(page, side, 'shape') },
];

for (const group of [contexts.slice(0, 3), contexts.slice(3, 6), contexts.slice(6)]) {
  test(`context menus match the trial (${group.map((context) => context.name).join(', ')})`, async ({ browser }) => {
    const official = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const ours = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    try {
      await boot(official, 'official');
      await boot(ours, 'ours');
      await setup(official);
      await setup(ours);
      for (const context of group) {
        const dumps: Entry[][] = [];
        for (const [page, side] of [[official, 'official'], [ours, 'ours']] as const) {
          await page.keyboard.press('Escape');
          if (context.before) await context.before(page);
          const point = await context.point(page, side);
          await page.mouse.click(point.x, point.y, { button: 'right' });
          dumps.push(await dumpFor(page, side));
        }
        expect.soft(dumps[1], context.name).toEqual(dumps[0]);
      }
    } finally {
      await official.close();
      await ours.close();
    }
  });
}

/* Item 3: the z-order submenu entries have to reach the model like the trial. */
test('chart and shape Bring/Send submenu actions match the trial', async ({ browser }) => {
  const results: unknown[] = [];
  for (const side of ['official', 'ours'] as const) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    try {
      await boot(page, side);
      await setup(page);
      // A second chart and shape exactly on top of the first ones, so Send To Back has an observable effect.
      await page.evaluate(() => {
        const spread = (window as any).__designerCompare.spread;
        const sheet = spread.getActiveSheet();
        if (!sheet.charts.all().some((chart: any) => chart.name() === 'Chart2')) sheet.charts.add('Chart2', (window as any).GC.Spread.Sheets.Charts.ChartType.columnClustered, 700, 250, 300, 180, 'A1:C5');
        if (!sheet.shapes.all().some((shape: any) => shape.name() === 'Rect2')) sheet.shapes.add('Rect2', (window as any).GC.Spread.Sheets.Shapes.AutoShapeType.rectangle, 470, 380, 150, 70);
        spread.refresh();
      });
      await page.waitForTimeout(400);
      const per: Record<string, unknown> = {};
      for (const kind of ['chart', 'shape'] as const) {
        const point = await findObjectPoint(page, side, kind);
        await page.mouse.click(point.x, point.y, { button: 'right' });
        await page.waitForTimeout(350);
        await page.getByRole('menuitem', { name: 'Send Backward', exact: true }).first().hover();
        await page.waitForTimeout(350);
        await page.getByRole('menuitem', { name: 'Send To Back', exact: true }).first().click();
        await page.waitForTimeout(350);
        per[kind] = await page.evaluate(() => {
          const sheet = (window as any).__designerCompare.spread.getActiveSheet();
          const chartNames = sheet.charts.all().map((chart: any) => chart.name());
          // Normalization (documented gap in docs/DESIGNER.md): the trial's charts plugin also
          // registers charts into the shapes collection (one merged z-order list), while our core
          // keeps `charts` and `shapes` separate. Chart z-order is still compared through
          // charts.all(); shape z-order through the non-chart entries of shapes.all().
          const shapeNames = sheet.shapes.all().map((shape: any) => shape.name()).filter((name: string) => !chartNames.includes(name));
          return { charts: chartNames, shapes: shapeNames };
        });
      }
      results.push(per);
    } finally { await page.close(); }
  }
  expect.soft(results[1], 'z-order submenu actions').toEqual(results[0]);
});

/* Model-state parity for six entries (task 61 item 6). */
const snapshot = (page: Page): Promise<unknown> => page.evaluate(() => {
  const sheet = (window as any).__designerCompare.spread.getActiveSheet();
  // Both engines surface error cells as engine-internal objects with different private
  // field names; normalize them to the error text so the *behaviour* (which cell errors)
  // is what gets compared.
  const norm = (value: unknown) => {
    if (value && typeof value === 'object') {
      const record = value as Record<string, unknown>;
      const error = typeof record._error === 'string' ? record._error : typeof record.error === 'string' ? record.error : null;
      if (error) return error;
    }
    return value;
  };
  const values: unknown[] = [];
  for (let row = 0; row < 10; row++) for (let col = 0; col < 6; col++) values.push(norm(sheet.getValue(row, col)));
  return { values, formulas: [1, 2, 3].map((row) => sheet.getFormula(row, 5)), rowCount: sheet.getRowCount(), colCount: sheet.getColumnCount(), heights: [1, 2, 3].map((row) => sheet.getRowHeight(row)), widths: [1, 2, 3].map((col) => sheet.getColumnWidth(col)), tableRanges: sheet.tables.all().map((table: any) => ({ name: table.name(), ...table.range() })) };
});

interface ActionCase { name: string; timeout?: number; run: (page: Page, side: 'official' | 'ours') => Promise<void>; setup?: (page: Page) => Promise<void> }

const actionCases: ActionCase[] = [
  {
    name: 'row header Insert',
    run: async (page) => {
      const point = await findPoint(page, 'rowHeader', 2);
      await page.mouse.click(point.x, point.y, { button: 'right' });
      await page.getByRole('menuitem', { name: 'Insert', exact: true }).first().click();
    },
  },
  {
    name: 'column header Delete',
    run: async (page) => {
      const point = await findPoint(page, 'colHeader', undefined, 2);
      await page.mouse.click(point.x, point.y, { button: 'right' });
      await page.getByRole('menuitem', { name: 'Delete', exact: true }).first().click();
    },
  },
  {
    name: 'row header Hide',
    run: async (page) => {
      const point = await findPoint(page, 'rowHeader', 2);
      await page.mouse.click(point.x, point.y, { button: 'right' });
      await page.getByRole('menuitem', { name: 'Hide', exact: true }).first().click();
    },
  },
  {
    name: 'Sort A to Z',
    run: async (page) => {
      const point = await findPoint(page, 'viewport', 2, 2);
      await page.mouse.click(point.x, point.y);
      await page.mouse.click(point.x, point.y, { button: 'right' });
      await page.getByRole('menuitem', { name: 'Sort', exact: true }).first().hover();
      await page.waitForTimeout(250);
      await page.getByRole('menuitem', { name: 'Sort A to Z', exact: true }).first().click();
    },
  },
  {
    name: 'Clear Contents',
    setup: async (page) => {
      await page.evaluate(() => { (window as any).__designerCompare.spread.getActiveSheet().setValue(8, 7, 'clear me'); });
    },
    run: async (page) => {
      const point = await findPoint(page, 'viewport', 8, 7);
      await page.mouse.click(point.x, point.y, { button: 'right' });
      await page.getByRole('menuitem', { name: 'Clear Contents', exact: true }).first().click();
    },
  },
  {
    name: 'Paste values',
    timeout: 60_000,
    setup: async (page) => {
      await page.evaluate(() => {
        const sheet = (window as any).__designerCompare.spread.getActiveSheet();
        sheet.setValue(9, 1, 3);
        sheet.setValue(9, 2, 4);
        sheet.setFormula(9, 3, '=B10+C10');
      });
    },
    run: async (page) => {
      const source = await findPoint(page, 'viewport', 9, 3);
      await page.mouse.click(source.x, source.y);
      await page.keyboard.press('Control+C');
      await page.waitForTimeout(200);
      const target = await findPoint(page, 'viewport', 9, 5);
      await page.mouse.click(target.x, target.y);
      await page.mouse.click(target.x, target.y, { button: 'right' });
      await page.waitForTimeout(300);
      if (page.url().includes('official')) {
        await page.locator('.gc-ui-contextmenu-groupitem:has(.gc-spread-pasteValues)').locator('visible=true').first().click({ timeout: 8000 });
      } else {
        await page.locator('[data-paste="pasteValues"]').first().click({ timeout: 8000 });
      }
    },
  },
  // Submenu entries (task 61 item 3): each one has to reach the model.
  {
    name: 'Table > Totals Row',
    run: async (page) => {
      const point = await findPoint(page, 'viewport', 2, 2);
      await page.mouse.click(point.x, point.y);
      await page.mouse.click(point.x, point.y, { button: 'right' });
      await page.getByRole('menuitem', { name: 'Table', exact: true }).first().hover();
      await page.waitForTimeout(300);
      await page.getByRole('menuitem', { name: 'Totals Row', exact: true }).first().click();
    },
  },
  {
    name: 'Table > Convert to Range',
    run: async (page) => {
      const point = await findPoint(page, 'viewport', 2, 2);
      await page.mouse.click(point.x, point.y);
      await page.mouse.click(point.x, point.y, { button: 'right' });
      await page.getByRole('menuitem', { name: 'Table', exact: true }).first().hover();
      await page.waitForTimeout(300);
      await page.getByRole('menuitem', { name: 'Convert to Range', exact: true }).first().click();
      // The trial (and our confirm dialog after Task 61) ask "Do you want to convert the table
      // to a normal range ?" — the model only changes after OK.
      await page.waitForTimeout(300);
      await page.getByRole('button', { name: 'OK', exact: true }).first().click();
    },
  },
  {
    name: 'Insert > Table Rows Above',
    run: async (page) => {
      const point = await findPoint(page, 'viewport', 2, 2);
      await page.mouse.click(point.x, point.y);
      await page.mouse.click(point.x, point.y, { button: 'right' });
      await page.getByRole('menuitem', { name: 'Insert', exact: true }).first().hover();
      await page.waitForTimeout(300);
      await page.getByRole('menuitem', { name: 'Table Rows Above', exact: true }).first().click();
    },
  },
  {
    name: 'Delete > Table Rows',
    run: async (page) => {
      const point = await findPoint(page, 'viewport', 2, 2);
      await page.mouse.click(point.x, point.y);
      await page.mouse.click(point.x, point.y, { button: 'right' });
      await page.getByRole('menuitem', { name: 'Delete', exact: true }).first().hover();
      await page.waitForTimeout(300);
      await page.getByRole('menuitem', { name: 'Table Rows', exact: true }).first().click();
    },
  },
  {
    name: 'Insert Copied Cells > Shift Cells Down',
    timeout: 90_000,
    run: async (page) => {
      // The trial only offers "Insert Copied Cells..." when the target cell is not inside a
      // table, so the target is the plain cell A10 (source A2 is inside the table — allowed).
      const source = await findPoint(page, 'viewport', 1, 0);
      await page.mouse.click(source.x, source.y);
      await page.keyboard.press('Control+C');
      await page.waitForTimeout(250);
      const target = await findPoint(page, 'viewport', 9, 0);
      await page.mouse.click(target.x, target.y);
      await page.mouse.click(target.x, target.y, { button: 'right' });
      await page.getByRole('menuitem', { name: 'Insert Copied Cells...', exact: true }).first().hover();
      await page.waitForTimeout(300);
      await page.getByRole('menuitem', { name: 'Shift Cells Down', exact: true }).first().click();
    },
  },
  {
    name: 'Sort Z to A',
    run: async (page) => {
      const point = await findPoint(page, 'viewport', 2, 0);
      await page.mouse.click(point.x, point.y);
      await page.mouse.click(point.x, point.y, { button: 'right' });
      await page.getByRole('menuitem', { name: 'Sort', exact: true }).first().hover();
      await page.waitForTimeout(300);
      await page.getByRole('menuitem', { name: 'Sort Z to A', exact: true }).first().click();
    },
  },
];

/* Item 4: the six Paste Options buttons of the context menu. */
const PASTE_MODES = ['pasteAll', 'pasteFormula', 'pasteValues', 'pasteFormatting', 'pasteValuesFormatting', 'pasteFormulaFormatting'] as const;

test('the six Paste Options buttons paste like the trial', async ({ browser }) => {
  const results: Record<string, unknown>[] = [];
  for (const side of ['official', 'ours'] as const) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    try {
      await boot(page, side);
      await setup(page);
      await page.evaluate(() => {
        const sheet = (window as any).__designerCompare.spread.getActiveSheet();
        sheet.setValue(11, 0, 3);
        sheet.setValue(11, 1, 4);
        sheet.setFormula(11, 2, '=A12+B12');
        const bold = new (window as any).GC.Spread.Sheets.Style();
        bold.fontWeight = 'bold';
        bold.backColor = '#ffff00';
        bold.formatter = '0.00';
        sheet.setStyle(11, 0, bold);
        sheet.setStyle(11, 1, bold);
        sheet.setStyle(11, 2, bold);
        // The target cells get a different look so "formats only" is observable.
        const plain = new (window as any).GC.Spread.Sheets.Style();
        plain.fontWeight = 'normal';
        plain.backColor = '#00ff00';
        plain.formatter = '0';
        for (let col = 5; col < 16; col++) sheet.setStyle(11, col, plain);
        (window as any).__designerCompare.spread.refresh();
      });
      await page.waitForTimeout(200);
      const per: Record<string, unknown> = {};
      for (const [index, mode] of PASTE_MODES.entries()) {
        await page.evaluate(() => {
          const spread = (window as any).__designerCompare.spread;
          for (let row = 12; row < 16; row++) for (let col = 0; col < 16; col++) spread.getActiveSheet().clear(row, col, 1, 1, 1, 3);
          spread.refresh();
        });
        const source = await findPoint(page, 'viewport', 11, 0);
        await page.mouse.click(source.x, source.y);
        await page.keyboard.press('Control+C');
        await page.waitForTimeout(200);
        const targetCol = 5 + index * 2;
        const target = await findPoint(page, 'viewport', 11, targetCol);
        await page.mouse.click(target.x, target.y);
        await page.mouse.click(target.x, target.y, { button: 'right' });
        await page.waitForTimeout(350);
        if (side === 'official') {
          const buttonClass = { pasteAll: 'gc-spread-pasteAll', pasteFormula: 'gc-spread-pasteFormula', pasteValues: 'gc-spread-pasteValues', pasteFormatting: 'gc-spread-pasteFormatting', pasteValuesFormatting: 'gc-spread-pasteValuesFormatting', pasteFormulaFormatting: 'gc-spread-pasteFormulaFormatting' }[mode];
          await page.locator(`.${buttonClass}`).locator('visible=true').first().click({ timeout: 8000 });
        } else {
          await page.locator(`[data-paste="${mode}"]`).first().click({ timeout: 8000 });
        }
        await page.waitForTimeout(300);
        per[mode] = await page.evaluate(({ col }) => {
          const sheet = (window as any).__designerCompare.spread.getActiveSheet();
          return [0, 1, 2].map((offset) => {
            const style = sheet.getActualStyle(11, col + offset);
            return { value: sheet.getValue(11, col + offset), formula: sheet.getFormula(11, col + offset), weight: style?.fontWeight ?? null, back: style?.backColor ?? null, formatter: style?.formatter ?? null };
          });
        }, { col: targetCol });
      }
      results.push(per);
    } finally { await page.close(); }
  }
  expect.soft(results[1], 'paste options').toEqual(results[0]);
});

for (const actionCase of actionCases) {
  test(`model change matches the trial: ${actionCase.name}`, async ({ browser }) => {
    test.setTimeout(actionCase.timeout ?? 180_000);
    const results: unknown[] = [];
    for (const side of ['official', 'ours'] as const) {
      const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
      try {
        await boot(page, side);
        await setup(page);
        if (actionCase.setup) await actionCase.setup(page);
        await actionCase.run(page, side);
        await page.waitForTimeout(400);
        results.push(await snapshot(page));
      } finally { await page.close(); }
    }
    expect.soft(results[1], actionCase.name).toEqual(results[0]);
  });
}
