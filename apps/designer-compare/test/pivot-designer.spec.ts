/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * TASK 47 — Designer PivotTable UI, paired against the official trial
 * (ours vs ?side=official): one test per task item. Geometry is compared with
 * a 2px tolerance on labels/inputs; created-state parity goes through the
 * public pivot API.
 */
import { expect, test, type Browser, type Page } from '@playwright/test';
import { boot } from './helpers';

test.setTimeout(180_000);

/** Click a ribbon/tab caption by its visible text (smallest matching leaf). */
async function clickText(page: Page, text: string, area?: { y0: number; y1: number }): Promise<boolean> {
  const box = await page.evaluate(({ label, area }) => {
    const n = (s: string) => s.replace(/\s+/g, ' ').trim();
    const cands = [...document.querySelectorAll('*')]
      .filter((e) => n(e.textContent ?? '') === label)
      .map((e) => { const r = e.getBoundingClientRect(); return { r, area: r.width * r.height }; })
      .filter((c) => c.r.width > 0 && c.r.height > 0 && (!area || (c.r.y >= area.y0 && c.r.y <= area.y1)));
    if (!cands.length) return null;
    cands.sort((a, b) => a.area - b.area || a.r.y - b.r.y);
    const r = cands[0].r;
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, { label: text, area: area ?? null });
  if (!box) return false;
  await page.mouse.click(box.x, box.y);
  await page.waitForTimeout(300);
  return true;
}

const pivotState = (page: Page): Promise<any> => page.evaluate(() => {  const wb = (window as any).__designerCompare.spread;
  const sheets: string[] = [];
  for (let i = 0; i < wb.getSheetCount(); i++) sheets.push(wb.getSheet(i).name());
  const tables: any[] = [];
  for (let i = 0; i < wb.getSheetCount(); i++) {
    const sheet = wb.getSheet(i);
    for (const t of sheet.pivotTables.all()) {
      const pos = t.position() as { row: number; col: number; sheetName: string };
      tables.push({
        name: String(t.name()),
        sheet: pos?.sheetName ?? sheet.name(),
        row: pos?.row, col: pos?.col,
        source: typeof t.getSource() === 'string' ? t.getSource() : JSON.stringify((t.getSource() as any).source),
        layout: t.layoutType(),
        theme: t.getThemeName() ?? null,
        fields: t.getFieldsByArea().map((f: any) => ({ name: f.fieldName, area: f.pivotArea, index: f.pivotIndex })),
      });
    }
  }
  return { sheets, active: wb.getActiveSheet().name(), tables };
});

/** Is the docked field-list panel shown? The trial keeps the element in the DOM
 *  (collapsed inside a display:none ancestor) after closing, so we measure the
 *  visible box on both sides. */
const panelShown = (page: Page): Promise<boolean> => page.evaluate(() => {
  const el = document.querySelector('.gc-designer-pivot-table-fields');
  return !!el && el.getBoundingClientRect().width > 0;
});

/** Ribbon tab captions currently visible, in order (the trial-side License banner excluded). */
const tabTexts = (page: Page): Promise<string[]> => page.evaluate(() => {
  const n = (s: string) => s.replace(/\s+/g, ' ').trim();
  return [...document.querySelectorAll('.gc-designer-ribbon-tab-nav-text .sd-text-content')].map((e) => n(e.textContent ?? '')).filter((t) => t && !/License/i.test(t));
});

/** Open the Create PivotTable dialog via Insert > PivotTable (main button area). */
async function openInsertDialog(page: Page): Promise<void> {
  expect(await clickText(page, 'Insert', { y0: 0, y1: 40 }), 'Insert tab').toBe(true);
  const pt = await page.evaluate(() => {
    const n = (s: string) => s.replace(/\s+/g, ' ').trim();
    // The trial exposes data-sd-id, ours data-command; both key on the command name.
    const button = document.querySelector('[data-sd-id="ribbon.insertPivotTable"], [data-command="ribbon.insertPivotTable"]');
    if (button) { const r = button.getBoundingClientRect(); return { x: r.x + Math.min(20, r.width / 2), y: r.y + 12 }; }
    const el = [...document.querySelectorAll('*')].filter((e) => e.children.length === 0 && n(e.textContent ?? '') === 'PivotTable')[0];
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y - 20 };
  });
  expect(pt, 'Insert > PivotTable button').not.toBeNull();
  await page.mouse.click(pt!.x, pt!.y);
  await page.waitForSelector('.gc-insert-pivot-dialog', { timeout: 5000 });
  await page.waitForTimeout(400);
}

const dialogSnapshot = (page: Page): Promise<any> => page.evaluate(() => {
  const n = (s: string) => s.replace(/\s+/g, ' ').trim();
  const box = document.querySelector('.gc-insert-pivot-dialog')!.closest('.gc-designer-dialog')!;
  const rect = box.getBoundingClientRect();
  const rel = (el: Element): { x: number; y: number; w: number; h: number } => { const r = el.getBoundingClientRect(); return { x: Math.round(r.x - rect.x), y: Math.round(r.y - rect.y), w: Math.round(r.width), h: Math.round(r.height) }; };
  const labels = [...box.querySelectorAll('*')].filter((e) => e.children.length === 0 && n(e.textContent ?? '').length > 2 && !['OK', 'Cancel'].includes(n(e.textContent ?? '')))
    .map((e) => ({ t: n(e.textContent ?? ''), ...rel(e) }));
  const inputs = [...box.querySelectorAll('input')].map((e) => ({ type: (e as HTMLInputElement).type, value: (e as HTMLInputElement).value, checked: (e as HTMLInputElement).checked, disabled: (e as HTMLInputElement).disabled, ...rel(e) }));
  const buttons = [...box.querySelectorAll('button')].map((e) => ({ t: n(e.textContent ?? ''), ...rel(e) }));
  return { box: { w: Math.round(rect.width), h: Math.round(rect.height) }, title: n(box.querySelector('.gc-dialog-title, .gc-designer-dialog-title')?.textContent ?? ''), labels, inputs, buttons };
});

async function createPivotViaDialog(page: Page, source: string): Promise<void> {
  await openInsertDialog(page);
  const input = page.locator('.gc-insert-pivot-dialog input').first();
  await input.click({ clickCount: 3 });
  await page.keyboard.press('Control+A');
  await page.keyboard.type(source);
  await page.waitForTimeout(150);
  const ok = await page.evaluate(() => {
    const box = document.querySelector('.gc-insert-pivot-dialog')!.closest('.gc-designer-dialog')!;
    const b = [...box.querySelectorAll('button')].filter((e) => e.textContent?.trim() === 'OK')[0];
    const r = b.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await page.mouse.click(ok.x, ok.y);
  await page.waitForTimeout(900);
}

/** Leaf-text positions inside the panel measured on the TEXT node range
 *  (immune to wrapper/h2/margin differences; matches ink position ±1px). */
const panelSnapshot = (page: Page): Promise<any> => page.evaluate(() => {
  const n = (s: string) => s.replace(/\s+/g, ' ').trim();
  const panel = document.querySelector('.gc-designer-pivot-table-fields')!;
  const pr = panel.getBoundingClientRect();
  const rel = (r: DOMRect): any => ({ x: Math.round(r.x - pr.x), y: Math.round(r.y - pr.y), w: Math.round(r.width), h: Math.round(r.height) });
  const text = (want: string): any => {
    const walker = document.createTreeWalker(panel, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (n(node.textContent ?? '') !== want) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      return rel(range.getBoundingClientRect());
    }
    return null;
  };
  const q = (sel: string): any => { const el = panel.querySelector(sel); return el ? rel(el.getBoundingClientRect()) : null; };
  const qDoc = (sel: string): any => { const el = document.querySelector(sel); return el ? rel(el.getBoundingClientRect()) : null; };
  const fieldRows = [...panel.querySelectorAll('.gc-panel-all-field-item')].map((row) => {
    const leaf = [...row.querySelectorAll('*')].find((e) => e.children.length === 0 && n(e.textContent ?? '').length > 0);
    const r = leaf.getBoundingClientRect();
    const range = document.createRange();
    range.selectNodeContents(leaf!.firstChild!);
    return {
      name: n(r ? leaf!.textContent ?? '' : ''),
      label: rel(range.getBoundingClientRect()),
      checkbox: rel(row.querySelector('input[type=checkbox]')!.getBoundingClientRect()),
      chevron: rel(row.querySelector('.gc-panel-field-dropdown, .gc-panel-area-item-icon')!.getBoundingClientRect()),
    };
  });
  return {
    box: { w: Math.round(pr.width), h: Math.round(pr.height) },
    close: qDoc('.gc-designer-panel-dialog-close-button-container'),
    search: q('.gc-panel-search-input'),
    texts: ['PivotTable Fields', 'Choose fields to add to report', 'Drag fields between areas below:', 'Filters', 'Columns', 'Rows', 'Values', 'Defer Layout Update', 'Update', 'Views'].map((t) => ({ t, r: text(t) })),
    fieldRows,
    areas: ['Filters', 'Columns', 'Rows', 'Values'].map((key) => ({ key, box: q(`.gc-panel-area-section-${key}`), title: q(`.gc-panel-area-section-${key} .gc-panel-area-item-title`), content: q(`.gc-panel-area-section-${key} .gc-panel-area-item-content`) })),
    defer: q('.gc-panel-defer-layout-update'),
    deferCheck: q('.gc-panel-defer-layout-input'),
    update: q('.gc-panel-defer-layout-right-button'),
    views: q('.gc-panel-views'),
    viewInput: (() => { const el = [...(panel.querySelector('.gc-panel-views')?.querySelectorAll('input') ?? [])].find((i) => i.type !== 'button'); return el ? rel(el.getBoundingClientRect()) : null; })(),
    addBtn: q('.gc-panel-add'),
    applyBtn: q('.gc-panel-apply'),
  };
});

/** Field names currently listed in the panel's Choose-fields list. */
const panelFieldNames = (page: Page): Promise<string[]> => page.evaluate(() =>
  [...document.querySelectorAll('.gc-designer-pivot-table-fields .gc-panel-all-field-item')].map((e) => (e.textContent ?? '').replace(/\s+/g, ' ').trim()));

/** Toggle a field via its checkbox in the field list. */
async function toggleField(page: Page, name: string): Promise<void> {
  const at = await page.evaluate((want) => {
    const n = (s: string) => s.replace(/\s+/g, ' ').trim();
    const row = [...document.querySelectorAll('.gc-designer-pivot-table-fields .gc-panel-all-field-item')].find((e) => n(e.textContent ?? '') === want);
    const cb = row!.querySelector('input[type=checkbox]')!.getBoundingClientRect();
    return { x: cb.x + cb.width / 2, y: cb.y + cb.height / 2 };
  }, name);
  await page.mouse.click(at.x, at.y);
  await page.waitForTimeout(400);
}

/** Geometry of the items rendered inside an area (class .gc-panel-area-item). */
const areaItems = (page: Page, key: 'Filters' | 'Columns' | 'Rows' | 'Values'): Promise<any[]> => page.evaluate((k) => {
  const n = (s: string) => s.replace(/\s+/g, ' ').trim();
  const panel = document.querySelector('.gc-designer-pivot-table-fields')!;
  const pr = panel.getBoundingClientRect();
  return [...panel.querySelectorAll(`.gc-panel-area-section-${k} .gc-panel-area-item`)].map((e) => {
    const r = e.getBoundingClientRect();
    return { t: n(e.textContent ?? ''), x: Math.round(r.x - pr.x), y: Math.round(r.y - pr.y), w: Math.round(r.width), h: Math.round(r.height) };
  });
}, key);

/** Open the chevron menu of an area item and snapshot the popup entries. */
async function openItemMenu(page: Page, key: 'Filters' | 'Columns' | 'Rows' | 'Values'): Promise<any> {
  const at = await page.evaluate((k) => {
    const item = document.querySelector(`.gc-designer-pivot-table-fields .gc-panel-area-section-${k} .gc-panel-area-item`)!;
    const chev = item.querySelector('.gc-panel-field-area-list-item-dropdown, .gc-panel-area-item-dropdown') ?? item;
    const r = chev.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, key);
  await page.mouse.click(at.x, at.y);
  await page.waitForTimeout(350);
  return page.evaluate(() => {
    const n = (s: string) => s.replace(/\s+/g, ' ').trim();
    // Ours is .gc-designer-pivot-item-menu; the trial is a generic drop-down list popup.
    const own = document.querySelector('.gc-designer-pivot-item-menu');
    if (own) {
      const r = own.getBoundingClientRect();
      const entries = [...own.querySelectorAll('[role=menuitem]')].map((e) => {
        const b = e.getBoundingClientRect();
        return { t: n(e.textContent ?? ''), y: Math.round(b.y - r.y), h: Math.round(b.height), color: getComputedStyle(e).color };
      });
      return { width: Math.round(r.width), entries };
    }
    const lists = [...document.querySelectorAll('div')].filter((e) => {
      const r = e.getBoundingClientRect();
      const t = n(e.textContent ?? '');
      return r.width >= 150 && r.width <= 260 && r.height > 150 && t.startsWith('Move Up') && t.includes('Remove Field');
    });
    if (!lists.length) return null;
    lists.sort((a, b) => a.querySelectorAll('*').length - b.querySelectorAll('*').length);
    const box = lists[0]!;
    const r = box.getBoundingClientRect();
    const leaves = [...box.querySelectorAll('*')].filter((e) => e.children.length === 0 && n(e.textContent ?? '').length > 1);
    const entries = leaves.map((e) => {
      const b = e.getBoundingClientRect();
      return { t: n(e.textContent ?? ''), y: Math.round(b.y - r.y), h: Math.round(b.height), color: getComputedStyle(e).color };
    });
    return { width: Math.round(r.width), entries };
  });
}

/** HTML5 drag of a field row onto an area (synthetic events: the same handlers a real drag fires). */
async function dragFieldToArea(page: Page, name: string, areaKey: 'Filters' | 'Columns' | 'Rows' | 'Values'): Promise<boolean> {
  return page.evaluate(({ want, areaKey }) => {
    const n = (s: string) => s.replace(/\s+/g, ' ').trim();
    const row = [...document.querySelectorAll('.gc-designer-pivot-table-fields .gc-panel-all-field-item')].find((e) => n(e.textContent ?? '') === want);
    const target = document.querySelector(`.gc-designer-pivot-table-fields .gc-panel-area-section-${areaKey} .gc-panel-area-item-content`);
    if (!row || !target) return false;
    const dt = new DataTransfer();
    const fire = (el: Element, type: string) => el.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt }));
    fire(row, 'dragstart');
    fire(target, 'dragenter');
    fire(target, 'dragover');
    fire(target, 'drop');
    fire(row, 'dragend');
    return true;
  }, { want: name, areaKey });
}

test.describe('PivotTable designer UI (task 47)', () => {
  test('item 1: Insert > PivotTable dialog creates the trial pivot on a new sheet', async ({ browser }: { browser: Browser }) => {
    const results: Record<string, any> = {};
    for (const side of ['official', 'ours'] as const) {
      const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
      try {
        await boot(page, side);
        await openInsertDialog(page);
        results[side] = { dialog: await dialogSnapshot(page) };
        // Existing-worksheet mode enables the Location editor.
        await clickText(page, 'Existing Worksheet');
        results[side].existing = await page.evaluate(() => {
          const box = document.querySelector('.gc-insert-pivot-dialog')!.closest('.gc-designer-dialog')!;
          const inputs = [...box.querySelectorAll('input')];
          const location = inputs[inputs.length - 1] as HTMLInputElement;
          return { disabled: location.disabled };
        });
        await clickText(page, 'New Worksheet');
        // Create with a typed range.
        const input = page.locator('.gc-insert-pivot-dialog input').first();
        await input.click({ clickCount: 3 });
        await page.keyboard.press('Control+A');
        await page.keyboard.type('Data!A1:F5');
        const ok = await page.evaluate(() => {
          const box = document.querySelector('.gc-insert-pivot-dialog')!.closest('.gc-designer-dialog')!;
          const b = [...box.querySelectorAll('button')].filter((e) => e.textContent?.trim() === 'OK')[0];
          const r = b.getBoundingClientRect();
          return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
        });
        await page.mouse.click(ok.x, ok.y);
        await page.waitForTimeout(900);
        results[side].state = await pivotState(page);
        results[side].tabs = await tabTexts(page);
        results[side].panelOpen = await panelShown(page);
      } finally { await page.close(); }
    }
    const official = results.official, ours = results.ours;

    // --- Dialog captions and controls (trial wording, our replica within 2px).
    expect(ours.dialog.title).toBe(official.dialog.title);
    expect(ours.dialog.title).toBe('Create PivotTable');
    const officialLabels = official.dialog.labels.map((l: any) => l.t);
    const oursLabels = ours.dialog.labels.map((l: any) => l.t);
    for (const label of ['Choose the data that you want to analyze', 'Choose where you want the PivotTable report to be placed', 'New Worksheet', 'Existing Worksheet'])
      expect(oursLabels, `dialog label "${label}"`).toContain(label);
    expect(ours.dialog.buttons.map((b: any) => b.t), 'dialog buttons').toContain('OK');
    expect(ours.dialog.buttons.map((b: any) => b.t), 'dialog buttons').toContain('Cancel');
    expect(officialLabels).toContain('Choose the data that you want to analyze');
    // Dialog box: same size within a few pixels.
    expect(Math.abs(ours.dialog.box.w - official.dialog.box.w), 'dialog width').toBeLessThanOrEqual(4);
    expect(Math.abs(ours.dialog.box.h - official.dialog.box.h), 'dialog height').toBeLessThanOrEqual(4);
    // The two section labels and both radios sit at the same offsets (±2px).
    for (const label of ['Choose the data that you want to analyze', 'Choose where you want the PivotTable report to be placed', 'New Worksheet', 'Existing Worksheet']) {
      const o = official.dialog.labels.find((l: any) => l.t === label);
      const m = ours.dialog.labels.find((l: any) => l.t === label);
      expect(m, `ours has "${label}"`).toBeTruthy();
      expect(Math.abs(m.x - o.x), `"${label}" x`).toBeLessThanOrEqual(2);
      expect(Math.abs(m.y - o.y), `"${label}" y`).toBeLessThanOrEqual(2);
    }
    // Default source text = active cell absolute reference (B2 on the Data sheet).
    expect(ours.dialog.inputs[0]!.value).toBe(official.dialog.inputs[0]!.value);
    expect(official.dialog.inputs[0]!.value).toBe('=Data!$B$2');
    // Existing Worksheet toggles the Location editor.
    expect(ours.existing.disabled).toBe(official.existing.disabled);

    // --- Created pivot through the API: same name, sheet, position, theme.
    expect(ours.state).toEqual(official.state);
    expect(official.state.tables[0]!.name).toBe('PivotTable1');
    expect(official.state.tables[0]!.row).toBe(2);
    expect(official.state.tables[0]!.col).toBe(0);
    expect(official.state.tables[0]!.source).toBe('=Data!$A$1:$F$5');
    // Contextual tabs appear, and the trial opens the field list for the new pivot.
    expect(ours.tabs).toEqual(official.tabs);
    expect(official.tabs).toContain('PivotTable Analyze');
    expect(official.tabs).toContain('Design');
    expect(ours.panelOpen).toBe(official.panelOpen);
    expect(official.panelOpen).toBe(true);
  });

  test('item 2: PivotTable field list panel, areas, drag and settings menu', async ({ browser }: { browser: Browser }) => {
    const results: Record<string, any> = {};
    for (const side of ['official', 'ours'] as const) {
      const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
      try {
        await boot(page, side);
        await createPivotViaDialog(page, 'Data!A1:F5');
        await page.waitForSelector('.gc-designer-pivot-table-fields:visible', { timeout: 5000 });
        await page.waitForTimeout(300);
        const snap: Record<string, any> = { panel: await panelSnapshot(page) };
        snap.fieldNames = await panelFieldNames(page);
        // Checkbox add: Region -> Rows, Q1 -> Values (Sum of Q1).
        await toggleField(page, 'Region');
        await toggleField(page, 'Q1');
        snap.rows = await areaItems(page, 'Rows');
        snap.values = await areaItems(page, 'Values');
        snap.state = await pivotState(page);
        // Chevron menu of the Rows item.
        snap.menu = await openItemMenu(page, 'Rows');
        snap.menuOpen = snap.menu !== null;
        await page.keyboard.press('Escape');
        await page.mouse.click(640, 300); // dismiss any popup
        await page.waitForTimeout(200);
        // Drag Q2 (from the list) into the Columns area.
        snap.dragFired = await dragFieldToArea(page, 'Q2', 'Columns');
        await page.waitForTimeout(500);
        snap.columns = await areaItems(page, 'Columns');
        snap.stateAfterDrag = await pivotState(page);
        results[side] = snap;
      } finally { await page.close(); }
    }
    const official = results.official, ours = results.ours;
    const near = (a: any, e: any, label: string, tol = 2): void => {
      expect(a, `${label} (ours=${JSON.stringify(a)} official=${JSON.stringify(e)})`).not.toBeNull();
      expect(e, `${label} (ours=${JSON.stringify(a)} official=${JSON.stringify(e)})`).not.toBeNull();
      expect(Math.abs(a.x - e.x), `${label} x ours=${JSON.stringify(a)} off=${JSON.stringify(e)}`).toBeLessThanOrEqual(tol);
      expect(Math.abs(a.y - e.y), `${label} y ours=${JSON.stringify(a)} off=${JSON.stringify(e)}`).toBeLessThanOrEqual(tol);
      expect(Math.abs(a.w - e.w), `${label} w ours=${JSON.stringify(a)} off=${JSON.stringify(e)}`).toBeLessThanOrEqual(tol);
      expect(Math.abs(a.h - e.h), `${label} h ours=${JSON.stringify(a)} off=${JSON.stringify(e)}`).toBeLessThanOrEqual(tol);
    };

    // Panel docked on the right, same size.
    expect(Math.abs(ours.panel.box.w - official.panel.box.w), 'panel width').toBeLessThanOrEqual(2);
    expect(Math.abs(ours.panel.box.h - official.panel.box.h), 'panel height').toBeLessThanOrEqual(2);
    expect(official.panel.box.w).toBe(314);
    near(ours.panel.close, official.panel.close, 'close button');
    near(ours.panel.search, official.panel.search, 'search input');
    for (const t of official.panel.texts) {
      const m = ours.panel.texts.find((x: any) => x.t === t.t);
      near(m?.r, t.r, `text "${t.t}"`, 2);
    }
    // Field list rows: same fields, same checkbox/label/chevron geometry.
    expect(ours.fieldNames).toEqual(official.fieldNames);
    expect(official.fieldNames).toEqual(['Region', 'Q1', 'Q2', 'Q3', 'Q4', 'Total']);
    ours.panel.fieldRows.forEach((row: any, i: number) => {
      const o = official.panel.fieldRows[i];
      expect(row.name, 'field row name').toBe(o.name);
      near(row.checkbox, o.checkbox, `${row.name} checkbox`);
      near(row.label, o.label, `${row.name} label`);
      near(row.chevron, o.chevron, `${row.name} chevron`);
    });
    // The four areas sit in the same 2x2 grid.
    ours.panel.areas.forEach((a: any, i: number) => {
      const o = official.panel.areas[i];
      expect(a.key, 'area key').toBe(o.key);
      near(a.box, o.box, `${a.key} area`);
      near(a.content, o.content, `${a.key} content`);
    });
    // Defer row and Views row.
    near(ours.panel.defer, official.panel.defer, 'defer row');
    near(ours.panel.deferCheck, official.panel.deferCheck, 'defer checkbox');
    near(ours.panel.update, official.panel.update, 'update button');
    near(ours.panel.views, official.panel.views, 'views row');
    near(ours.panel.viewInput, official.panel.viewInput, 'views combo');
    near(ours.panel.applyBtn, official.panel.applyBtn, 'views apply');
    near(ours.panel.addBtn, official.panel.addBtn, 'views add');

    // Checkbox behaviour: same resulting state and area items.
    expect(ours.state).toEqual(official.state);
    expect(official.state.tables[0].fields).toEqual(expect.arrayContaining([
      { name: 'Region', area: 1, index: 0 },
      { name: 'Sum of Q1', area: 3, index: 0 },
    ]));
    ours.rows.forEach((item: any, i: number) => near(item, official.rows[i], `Rows item ${i}`));
    ours.values.forEach((item: any, i: number) => near(item, official.values[i], `Values item ${i}`));
    expect(ours.values.map((v: any) => v.t)).toEqual(official.values.map((v: any) => v.t));

    // Chevron menu: same captions, order, widths and enabled/disabled colours.
    expect(ours.menuOpen, 'menu opens').toBe(true);
    expect(official.menuOpen, 'trial menu opens').toBe(true);
    expect(ours.menu.entries.map((e: any) => e.t)).toEqual(official.menu.entries.map((e: any) => e.t));
    expect(ours.menu.width, 'menu width').toBe(official.menu.width);
    ours.menu.entries.forEach((e: any, i: number) => {
      const o = official.menu.entries[i];
      expect(Math.abs(e.y - o.y), `menu entry ${e.t} y`).toBeLessThanOrEqual(2);
      expect(Math.abs(e.h - o.h), `menu entry ${e.t} h`).toBeLessThanOrEqual(2);
    });

    // Drag a field into an area: both accept the drop and move the field.
    expect(ours.dragFired).toBe(true);
    const q2ToColumns = (state: any): boolean => state.tables[0].fields.some((f: any) => f.name === 'Q2' && f.area === 2);
    expect(q2ToColumns(official.stateAfterDrag), 'trial drag moved Q2 to Columns').toBe(true);
    expect(q2ToColumns(ours.stateAfterDrag), 'our drag moved Q2 to Columns').toBe(true);
    ours.columns.forEach((item: any, i: number) => near(item, official.columns[i], `Columns item ${i}`));
  });

  test('item 3: PivotTable Analyze / Design contextual tabs, captions, commands', async ({ browser }: { browser: Browser }) => {
    /** Groups of the active ribbon tab: geometry + text-node INK rects (trial DOM classes). */
    const ribbonSnapshot = (page: Page): Promise<any> => page.evaluate(() => {
      const n = (s: string) => s.replace(/\s+/g, ' ').trim();
      const groups = [...document.querySelectorAll('.gc-designer-ribbon-group')]
        .filter((g) => g.getBoundingClientRect().width > 0)
        .map((g) => {
          const r = g.getBoundingClientRect();
          const walker = document.createTreeWalker(g, NodeFilter.SHOW_TEXT);
          const texts: { t: string; x: number; y: number }[] = [];
          for (let node = walker.nextNode(); node; node = walker.nextNode()) {
            const t = n(node.textContent ?? '');
            if (!t) continue;
            const range = document.createRange();
            range.selectNodeContents(node);
            const b = range.getBoundingClientRect();
            if (b.width <= 0) continue;
            texts.push({ t, x: Math.round(b.x - r.x), y: Math.round(b.y - r.y) });
          }
          texts.sort((a, b) => (Math.abs(a.y - b.y) > 8 ? a.y - b.y : a.x - b.x));
          return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), texts };
        })
        .sort((a, b) => a.x - b.x);
      const active = n(document.querySelector('.gc-designer-ribbon-tab-nav-text.selected .sd-text-content')?.textContent ?? '');
      return { groups, active };
    });
    const openDropdown = async (page: Page, caption: string): Promise<boolean> => {
      const at = await page.evaluate((want) => {
        const n = (s: string) => s.replace(/\s+/g, ' ').trim();
        // The group *title* can share the button caption (trial + ours): skip title nodes.
        const leaf = [...document.querySelectorAll('.gc-designer-ribbon-group *')].filter((e) =>
          e.children.length === 0 && n(e.textContent ?? '') === want && !e.closest('.gc-designer-ribbon-group-title') && !e.classList.contains('gc-designer-ribbon-group-title'))[0];
        if (!leaf) return null;
        const r = leaf.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height };
      }, caption);
      if (!at) return false;
      await page.mouse.click(at.x, at.y);
      await page.waitForTimeout(350);
      return true;
    };
    const menuCaptions = (page: Page): Promise<string[]> => page.evaluate(() => {
      const n = (s: string) => s.replace(/\s+/g, ' ').trim();
      const menus = [...document.querySelectorAll('.gc-designer-ribbon-dropdown, .gc-designer-menu, [role=menu]')]
        .filter((e) => { const r = e.getBoundingClientRect(); return r.width > 50 && r.height > 30 && r.top > 100; });
      if (!menus.length) return [];
      menus.sort((a, b) => a.querySelectorAll('*').length - b.querySelectorAll('*').length);
      const leaves = [...menus[0]!.querySelectorAll('*')].filter((e) => e.children.length === 0 && n(e.textContent ?? '').length > 1);
      return [...new Set(leaves.map((e) => n(e.textContent ?? '')))];
    });
    const clickCaption = async (page: Page, caption: string): Promise<boolean> => {
      const box = await page.evaluate(({ label }) => {
        const n = (s: string) => s.replace(/\s+/g, ' ').trim();
        const match = (root: ParentNode) => [...root.querySelectorAll('*')].filter((e) => e.children.length === 0 && n(e.textContent ?? '') === label && e.getBoundingClientRect().width > 0);
        const leaf = match(document.querySelector('.gc-designer-ribbon-group-container-inner') ?? document)[0] ?? match(document)[0];
        if (!leaf) return null;
        const r = leaf.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      }, { label: caption });
      if (!box) return false;
      await page.mouse.click(box.x, box.y);
      await page.waitForTimeout(350);
      return true;
    };
    const pivotApi = (page: Page): Promise<any> => page.evaluate(() => {
      const wb = (window as any).__designerCompare.spread;
      const pivot = wb.getActiveSheet().pivotTables.all()[0];
      if (!pivot) return null;
      return {
        layout: pivot.layoutType(),
        theme: pivot.getThemeName() ?? null,
        fieldCount: pivot.getFieldsByArea().length,
        banded: (pivot.options as any)?.bandRows ?? null,
      };
    });

    const results: Record<string, any> = {};
    for (const side of ['official', 'ours'] as const) {
      const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
      try {
        await boot(page, side);
        await createPivotViaDialog(page, 'Data!A1:F5');
        const snap: Record<string, any> = {};
        snap.tabs = await tabTexts(page);
        snap.analyze = await ribbonSnapshot(page);
        // Field List toggles the docked panel (do this on a clean ribbon, then re-open).
        snap.panelBefore = await panelShown(page);
        snap.flCheckedBefore = await page.evaluate(() => document.querySelector('[data-command="ribbon.pivotTableFieldList"]')?.getAttribute('aria-checked'));
        expect(await clickCaption(page, 'Field List'), 'Field List click').toBe(true);
        await page.waitForTimeout(700); // the trial closes the panel asynchronously
        snap.panelAfter = await panelShown(page);
        snap.flCheckedAfter = await page.evaluate(() => document.querySelector('[data-command="ribbon.pivotTableFieldList"]')?.getAttribute('aria-checked'));
        expect(await clickCaption(page, 'Field List'), 'Field List re-open click').toBe(true);
        await page.waitForTimeout(700);
        snap.panelReopened = await page.evaluate(() => !!document.querySelector('.gc-designer-pivot-table-fields'));
        // Design tab.
        expect(await clickText(page, 'Design', { y0: 0, y1: 40 }), 'Design tab click').toBe(true);
        snap.design = await ribbonSnapshot(page);
        // Report Layout dropdown.
        expect(await openDropdown(page, 'Report Layout'), 'report layout dropdown').toBe(true);
        snap.reportLayoutMenu = await menuCaptions(page);
        const layoutLeaf = await page.evaluate(() => {
          const n = (s: string) => s.replace(/\s+/g, ' ').trim();
          const item = [...document.querySelectorAll('*')].filter((e) => e.children.length === 0 && n(e.textContent ?? '') === 'Show in Tabular Form')[0];
          if (!item) return null;
          const r = item.getBoundingClientRect();
          return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
        });
        snap.hasTabularItem = layoutLeaf !== null;
        if (layoutLeaf) { await page.mouse.click(layoutLeaf.x, layoutLeaf.y); await page.waitForTimeout(600); }
        // Styles gallery on the Design tab.
        expect(await openDropdown(page, 'PivotTable Styles'), 'styles dropdown').toBe(true);
        snap.gallery = await page.evaluate(() => {
          const n = (s: string) => s.replace(/\s+/g, ' ').trim();
          const titles = [...document.querySelectorAll('[title]')].map((e) => e.getAttribute('title') ?? '').filter((t) => /^(None|Light\d+|Medium\d+|Dark\d+)$/.test(t));
          const heads = [...document.querySelectorAll('*')].filter((e) => e.children.length === 0 && ['Light', 'Medium', 'Dark'].includes(n(e.textContent ?? '')) && (e.closest('[class*=gallery], [class*=list-control], [class*=dropdown]'))).length;
          const tile = document.querySelector('[title=Medium16]');
          const r = tile?.getBoundingClientRect();
          const dd = tile?.closest('.gc-designer-ribbon-dropdown')?.getBoundingClientRect();
          const tileRel = r && dd ? { x: Math.round(r.x - dd.x), y: Math.round(r.y - dd.y), w: Math.round(r.width), h: Math.round(r.height) } : (r ? { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } : null);
          const footer = [...document.querySelectorAll('*')].filter((e) => e.children.length === 0 && !['STYLE', 'SCRIPT'].includes(e.tagName) && e.getBoundingClientRect().width > 0 && /New Pivot Table Style|Clear/.test(n(e.textContent ?? ''))).map((e) => n(e.textContent ?? ''));
          return { titles, heads, tile: tileRel, footer: [...new Set(footer)] };
        });
        const tile = await page.evaluate(() => {
          const el = document.querySelector('[title=Medium16]');
          if (!el) return null;
          const r = el.getBoundingClientRect();
          return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
        });
        snap.hasMedium16 = tile !== null;
        if (tile) { await page.mouse.click(tile.x, tile.y); await page.waitForTimeout(500); }
        snap.api = await pivotApi(page);
        // Banded Rows checkbox on the Design tab.
        snap.bandedMenu = await menuCaptions(page); // (gallery should be closed now)
        await page.screenshot({ path: `../../.probe/item3-${side}-banded.png` });
        snap.bandedDebug = await page.evaluate(() => {
          const n = (s: string) => s.replace(/\s+/g, ' ').trim();
          const tab = n(document.querySelector('.gc-designer-ribbon-tab-nav-text.selected .sd-text-content')?.textContent ?? '?');
          const any = [...document.querySelectorAll('*')].filter((e) => n(e.textContent ?? '').includes('Banded')).map((e) => ({ t: n(e.textContent).slice(0, 30), kids: e.children.length, w: Math.round(e.getBoundingClientRect().width) }));
          return { tab, any: any.slice(0, 12), groups: document.querySelectorAll('.gc-designer-ribbon-group').length };
        });
        expect(await clickCaption(page, 'Banded Rows'), `Banded Rows click ${side} ${JSON.stringify(snap.bandedDebug)}`).toBe(true);
        snap.apiBanded = await pivotApi(page);
        // Clear All (Analyze > Clear > Clear All).
        expect(await clickText(page, 'PivotTable Analyze', { y0: 0, y1: 40 }), 'Analyze tab click 2').toBe(true);
        expect(await openDropdown(page, 'Clear'), 'Clear dropdown').toBe(true);
        snap.clearMenu = await menuCaptions(page);
        const clearAll = await page.evaluate(() => {
          const n = (s: string) => s.replace(/\s+/g, ' ').trim();
          const item = [...document.querySelectorAll('*')].filter((e) => e.children.length === 0 && n(e.textContent ?? '') === 'Clear All')[0];
          if (!item) return null;
          const r = item.getBoundingClientRect();
          return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
        });
        if (clearAll) { await page.mouse.click(clearAll.x, clearAll.y); await page.waitForTimeout(500); }
        snap.apiCleared = await pivotApi(page);
        results[side] = snap;
      } finally { await page.close(); }
    }
    const official = results.official, ours = results.ours;
    const near = (a: any, e: any, label: string, tol = 2): void => {
      expect(a !== undefined && a !== null, `${label} ours=${JSON.stringify(a)}`).toBe(true);
      expect(e !== undefined && e !== null, `${label} official=${JSON.stringify(e)}`).toBe(true);
      expect(Math.abs(a.x - e.x), `${label} x`).toBeLessThanOrEqual(tol);
      expect(Math.abs(a.y - e.y), `${label} y`).toBeLessThanOrEqual(tol);
      expect(Math.abs(a.w - e.w), `${label} w`).toBeLessThanOrEqual(tol);
      expect(Math.abs(a.h - e.h), `${label} h`).toBeLessThanOrEqual(tol);
    };

    // Tab list and order, both contextual tabs present, Analyze active after create.
    expect(ours.tabs).toEqual(official.tabs);
    expect(official.tabs).toEqual(expect.arrayContaining(['PivotTable Analyze', 'Design']));
    expect(ours.analyze.active).toBe(official.analyze.active);
    expect(official.analyze.active).toBe('PivotTable Analyze');

    // Analyze tab: same groups in the same order with the same captions.
    expect(ours.analyze.groups.length, 'analyze group count').toBe(official.analyze.groups.length);
    ours.analyze.groups.forEach((g: any, i: number) => {
      const o = official.analyze.groups[i];
      near({ x: g.x, y: g.y, w: g.w, h: g.h }, { x: o.x, y: o.y, w: o.w, h: o.h }, `analyze group ${i}`);
      expect(g.texts.map((t: any) => t.t), `analyze group ${i} captions`).toEqual(o.texts.map((t: any) => t.t));
      g.texts.forEach((t: any, j: number) => {
        expect(Math.abs(t.x - o.texts[j].x), `analyze g${i} "${t.t}" x`).toBeLessThanOrEqual(2);
        expect(Math.abs(t.y - o.texts[j].y), `analyze g${i} "${t.t}" y`).toBeLessThanOrEqual(2);
      });
    });
    // Design tab: same.
    expect(ours.design.groups.map((g: any) => g.texts.map((t: any) => t.t).join('|')), 'design captions').toEqual(official.design.groups.map((g: any) => g.texts.map((t: any) => t.t).join('|')));
    ours.design.groups.forEach((g: any, i: number) => near({ x: g.x, y: g.y, w: g.w, h: g.h }, { x: official.design.groups[i].x, y: official.design.groups[i].y, w: official.design.groups[i].w, h: official.design.groups[i].h }, `design group ${i}`));

    // Report Layout menu items + resulting layout through the API.
    expect(ours.reportLayoutMenu, 'report layout menu').toEqual(official.reportLayoutMenu);
    expect(official.hasTabularItem, 'trial tabular item').toBe(true);
    expect(ours.hasTabularItem, 'our tabular item').toBe(true);
    expect(ours.api.layout, 'layout after tabular').toBe(official.api.layout);
    expect(official.api.layout).toBe(2);

    // Field List toggles the docked panel.
    expect(ours.panelBefore, 'panel before toggle').toBe(official.panelBefore);
    expect(ours.panelAfter, `panel after toggle ours=${JSON.stringify({ b: ours.panelBefore, a: ours.panelAfter, c0: ours.flCheckedBefore, c1: ours.flCheckedAfter })} off=${JSON.stringify({ b: official.panelBefore, a: official.panelAfter, c0: official.flCheckedBefore, c1: official.flCheckedAfter })}`).toBe(official.panelAfter);
    expect(ours.panelReopened, 'panel after re-open').toBe(official.panelReopened);
    expect(official.panelAfter).toBe(false);
    expect(official.panelReopened).toBe(true);

    // Styles gallery: identical structure (None first, Light1..28, Medium, Dark) and behaviour.
    expect(ours.gallery.titles.slice(0, 3), 'gallery first titles').toEqual(official.gallery.titles.slice(0, 3));
    expect(ours.gallery.titles[0]).toBe('None');
    expect(ours.gallery.titles.length, 'gallery tile count').toBe(official.gallery.titles.length);
    expect(ours.gallery.heads, 'gallery section headers').toBe(official.gallery.heads);
    expect(ours.gallery.footer.sort(), 'gallery footer').toEqual(official.gallery.footer.sort());
    near(ours.gallery.tile, official.gallery.tile, 'Medium16 tile');
    expect(ours.hasMedium16).toBe(true);
    expect(ours.api.theme, 'theme after Medium16').toBe(official.api.theme);
    expect(official.api.theme).toBe('Medium16');

    // Banded Rows checkbox changes the pivot options the same way.
    expect(ours.bandedMenu.length, 'no menu open before banded').toBe(0);
    expect(ours.apiBanded.banded, 'bandRows option').toBe(official.apiBanded.banded);

    // Clear dropdown + Clear All empties every area.
    expect(ours.clearMenu, 'clear menu captions').toEqual(official.clearMenu);
    expect(ours.apiCleared.fieldCount, 'fields after Clear All').toBe(official.apiCleared.fieldCount);
    expect(official.apiCleared.fieldCount).toBe(0);
  });

  test('item 4: Field Settings / Value Field Settings dialogs like the trial', async ({ browser }: { browser: Browser }) => {
    test.setTimeout(300_000);
    /** Is the trial's/our pivot dialog open? (both use *dialog* class names). */
    const dialogRoot = (page: Page, needle: string): Promise<boolean> => page.evaluate((want) => {
      const n = (s: string) => s.replace(/\s+/g, ' ').trim();
      return [...document.querySelectorAll('[class*=dialog]')].some((e) => { const r = e.getBoundingClientRect(); return r.width > 300 && r.width < 800 && r.height > 200 && n(e.textContent ?? '').includes(want); });
    }, needle);
    /** Leaf positions (element rects of the smallest matching node) inside the dialog.
     *  The scope box must contain both the title and the body marker (both dialogs' roots do). */
    const dialogSnapshot = (page: Page, needle: string, title: string): Promise<any> => page.evaluate(({ want, title }) => {
      const n = (s: string) => s.replace(/\s+/g, ' ').trim();
      const boxes = [...document.querySelectorAll('[class*=dialog]')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 300 && r.width < 800 && r.height > 200 && n(e.textContent ?? '').includes(want) && n(e.textContent ?? '').includes(title); });
      boxes.sort((a, b) => (a.getBoundingClientRect().width * a.getBoundingClientRect().height) - (b.getBoundingClientRect().width * b.getBoundingClientRect().height));
      const box = boxes[0];
      if (!box) return null;
      const r = box.getBoundingClientRect();
      const rel = (el: Element): any => { const b = el.getBoundingClientRect(); return { x: Math.round(b.x - r.x), y: Math.round(b.y - r.y), w: Math.round(b.width), h: Math.round(b.height) }; };
      const texts = [...box.querySelectorAll('*')].filter((e) => e.children.length === 0 && n(e.textContent ?? '').length > 0 && e.getBoundingClientRect().width > 0)
        .map((e) => ({ t: n(e.textContent ?? ''), ...rel(e) }));
      const inputs = [...box.querySelectorAll('input')].filter((e) => ['button', 'radio', 'checkbox'].includes((e as HTMLInputElement).type) && e.getBoundingClientRect().width > 0)
        .map((e) => ({ t: (e as HTMLInputElement).value || (e as HTMLInputElement).type, type: (e as HTMLInputElement).type, checked: (e as HTMLInputElement).checked, ...rel(e) }));
      const selects = [...box.querySelectorAll('select')].filter((e) => e.getBoundingClientRect().width > 0).map((e) => ({ value: e.value, options: [...e.options].map((o) => o.textContent ?? ''), ...rel(e) }));
      return { box: { w: Math.round(r.width), h: Math.round(r.height) }, texts, inputs, selects };
    }, { want: needle, title });
    const clickDialogText = async (page: Page, caption: string, root?: string): Promise<boolean> => {
      const at = await page.evaluate(({ want, root }) => {
        const n = (s: string) => s.replace(/\s+/g, ' ').trim();
        const leafIn = (scope: ParentNode): Element | undefined =>
          [...scope.querySelectorAll('*')].find((e) => e.children.length === 0 && n(e.textContent ?? '') === want && e.getBoundingClientRect().width > 0)
          ?? [...scope.querySelectorAll('input')].find((e) => n((e as HTMLInputElement).value ?? '') === want && e.getBoundingClientRect().width > 0);
        if (root) {
          // Smallest dialog-class box that contains BOTH the root text and the target leaf (the
          // title bar alone also "contains" the title, so check the leaf per candidate box).
          const boxes = [...document.querySelectorAll('[class*=dialog]')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 300 && r.width < 900 && n(e.textContent ?? '').includes(root); });
          boxes.sort((a, b) => a.getBoundingClientRect().width * a.getBoundingClientRect().height - b.getBoundingClientRect().width * b.getBoundingClientRect().height);
          for (const box of boxes) { const hit = leafIn(box); if (hit) return hit.getBoundingClientRect(); }
          return null;
        }
        const hit = leafIn(document);
        return hit ? hit.getBoundingClientRect() : null;
      }, { want: caption, root: root ?? null });
      if (!at) return false;
      await page.mouse.click(at.x + at.width / 2, at.y + at.height / 2);
      await page.waitForTimeout(250);
      return true;
    };
    /** Open the chevron menu of an area item and click one entry. */
    const menuEntryClick = async (page: Page, key: 'Rows' | 'Values', entry: string): Promise<boolean> => {
      const at = await page.evaluate((k) => {
        const item = document.querySelector(`.gc-designer-pivot-table-fields .gc-panel-area-section-${k} .gc-panel-area-item`);
        if (!item) return null;
        const chev = item.querySelector('.gc-panel-field-area-list-item-dropdown, .gc-panel-area-item-icon') ?? item;
        const r = chev.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      }, key);
      if (!at) return false;
      await page.mouse.click(at.x, at.y);
      await page.waitForTimeout(350);
      const ok = await clickDialogText(page, entry);
      await page.waitForTimeout(600);
      return ok;
    };
    const pivotFields = (page: Page): Promise<any[]> => page.evaluate(() => {
      const wb = (window as any).__designerCompare.spread;
      const pivot = wb.getActiveSheet().pivotTables.all()[0];
      if (!pivot) return [];
      return pivot.getFieldsByArea().map((f: any) => ({ name: f.fieldName, area: f.pivotArea }));
    });
    const valueFormatters = (page: Page): Promise<string[]> => page.evaluate(() => {
      const wb = (window as any).__designerCompare.spread;
      const sheet = wb.getActiveSheet();
      const pivot = sheet.pivotTables.all()[0];
      const pos = pivot.position() as { row: number; col: number };
      const cells: string[] = [];
      for (let r = 0; r <= 6; r++) for (let c = 0; c <= 2; c++) {
        const f = sheet.getCell(pos.row + r, pos.col + c).formatter();
        if (f && f !== 'General') cells.push(`${r},${c}=${f}`);
      }
      return cells;
    });

    const results: Record<string, any> = {};
    for (const side of ['official', 'ours'] as const) {
      const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
      try {
        await boot(page, side);
        await createPivotViaDialog(page, 'Data!A1:F5');
        await page.waitForSelector('.gc-designer-pivot-table-fields:visible', { timeout: 5000 });
        await page.waitForTimeout(300);
        const snap: Record<string, any> = {};
        await toggleField(page, 'Region');
        await toggleField(page, 'Q1');

        // --- Field Settings from the Rows area: layout + rename.
        snap.fieldOpened = await menuEntryClick(page, 'Rows', 'Field Settings...');
        snap.fieldPresent = await dialogRoot(page, 'Custom Name');
        snap.field = await dialogSnapshot(page, 'Custom Name', 'Field Settings');
        await page.screenshot({ path: `../../.probe/item4-${side}-field.png` });
        const focused = await page.evaluate((want) => {
          const n = (s: string) => s.replace(/\s+/g, ' ').trim();
          const boxes = [...document.querySelectorAll('[class*=dialog]')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 300 && r.width < 800 && r.height > 200 && n(e.textContent ?? '').includes(want); });
          boxes.sort((a, b) => (a.getBoundingClientRect().width * a.getBoundingClientRect().height) - (b.getBoundingClientRect().width * b.getBoundingClientRect().height));
          const box = boxes[0];
          if (!box) return false;
          const input = [...box.querySelectorAll('input[type=text],input:not([type])')].find((e) => e.getBoundingClientRect().width > 0) as HTMLInputElement | undefined;
          if (!input) return false;
          input.focus();
          input.select();
          return true;
        }, 'Custom Name');
        expect(focused, `${side}: Custom Name focusable`).toBe(true);
        await page.keyboard.press('Control+A');
        await page.keyboard.type('Area');
        snap.fieldOk = await clickDialogText(page, 'OK', 'Field Settings');
        await page.waitForTimeout(800);
        snap.fieldsAfterRename = await pivotFields(page);

        // --- Value Field Settings: layout + summarize by Count.
        snap.vfsOpened = await menuEntryClick(page, 'Values', 'Value Field Settings...');
        snap.vfsPresent = await dialogRoot(page, 'Summarize Values By');
        snap.vfs = await dialogSnapshot(page, 'Custom Name', 'Value Field Settings');
        await page.screenshot({ path: `../../.probe/item4-${side}-vfs.png` });
        snap.pickCount = await clickDialogText(page, 'Count', 'Value Field Settings');
        snap.vfsOk = await clickDialogText(page, 'OK', 'Value Field Settings');
        await page.waitForTimeout(800);
        snap.fieldsAfterCount = await pivotFields(page);

        // --- Show Value As tab: % of Grand Total.
        snap.vfs2Opened = await menuEntryClick(page, 'Values', 'Value Field Settings...');
        snap.svaTab = await clickDialogText(page, 'Show Value As', 'Value Field Settings');
        await page.waitForTimeout(400);
        snap.sva = await dialogSnapshot(page, 'Base field:', 'Value Field Settings');
        await page.screenshot({ path: `../../.probe/item4-${side}-sva.png` });
        expect(snap.sva?.selects?.length, `${side}: SVA combo present (${JSON.stringify(snap.sva?.selects?.map((s: any) => [s.w, s.h]))})`).toBe(1);
        const sel = page.locator('[class*=dialog] select:visible').first();
        await sel.waitFor({ state: 'visible', timeout: 8000 });
        await sel.selectOption({ label: '% of Grand Total' });
        await page.waitForTimeout(300);
        snap.svaOk = await clickDialogText(page, 'OK', 'Value Field Settings');
        await page.waitForTimeout(800);
        snap.showDataAs = await page.evaluate(() => {
          const wb = (window as any).__designerCompare.spread;
          const pivot = wb.getActiveSheet().pivotTables.all()[0];
          const vf = pivot.getFieldsByArea().find((f: any) => f.pivotArea === 3);
          const info = pivot.showDataAs(vf.fieldName) as any;
          return { name: vf.fieldName, showDataAs: info?.showDataAs ?? null };
        });

        // --- Number Format: Currency through the stacked Format Cells dialog.
        snap.vfs3Opened = await menuEntryClick(page, 'Values', 'Value Field Settings...');
        snap.nfBtn = await clickDialogText(page, 'Number Format', 'Value Field Settings');
        await page.waitForTimeout(700);
        snap.nfOpen = await dialogRoot(page, 'Category:');
        snap.pickCurrency = await clickDialogText(page, 'Currency', 'Format Cells');
        snap.nfOk = await clickDialogText(page, 'OK', 'Format Cells');
        await page.waitForTimeout(500);
        snap.vfsOk2 = await clickDialogText(page, 'OK', 'Value Field Settings');
        await page.waitForTimeout(900);
        snap.formatters = await valueFormatters(page);
        await page.screenshot({ path: `../../.probe/item4-${side}-applied.png` });
        results[side] = snap;
      } finally { await page.close(); }
    }
    const official = results.official, ours = results.ours;
    const near = (a: any, e: any, label: string, tol = 2): void => {
      expect(a !== undefined && a !== null, `${label} ours=${JSON.stringify(a)}`).toBe(true);
      expect(e !== undefined && e !== null, `${label} official=${JSON.stringify(e)}`).toBe(true);
      expect(Math.abs(a.x - e.x), `${label} x ours=${JSON.stringify([a.x, a.y, a.w, a.h])} off=${JSON.stringify([e.x, e.y, e.w, e.h])}`).toBeLessThanOrEqual(tol);
      expect(Math.abs(a.y - e.y), `${label} y ours=${JSON.stringify([a.x, a.y, a.w, a.h])} off=${JSON.stringify([e.x, e.y, e.w, e.h])}`).toBeLessThanOrEqual(tol);
      expect(Math.abs(a.w - e.w), `${label} w ours=${JSON.stringify([a.x, a.y, a.w, a.h])} off=${JSON.stringify([e.x, e.y, e.w, e.h])}`).toBeLessThanOrEqual(tol);
      expect(Math.abs(a.h - e.h), `${label} h ours=${JSON.stringify([a.x, a.y, a.w, a.h])} off=${JSON.stringify([e.x, e.y, e.w, e.h])}`).toBeLessThanOrEqual(tol);
    };
    const leaf = (snap: any, caption: string): any => snap?.texts?.find((t: any) => t.t === caption);
    const btn = (snap: any, caption: string): any => snap?.inputs?.find((i: any) => i.t === caption);

    for (const flag of ['fieldOpened', 'fieldPresent', 'fieldOk', 'vfsOpened', 'vfsPresent', 'pickCount', 'vfsOk', 'vfs2Opened', 'svaTab', 'svaOk', 'vfs3Opened', 'nfBtn', 'nfOpen', 'pickCurrency', 'nfOk', 'vfsOk2'] as const) {
      expect(ours[flag], `ours ${flag}`).toBe(true);
      expect(official[flag], `official ${flag}`).toBe(true);
    }

    // Field Settings: same dialog width, captions and buttons (trial positions ±2px).
    // (The trial's popup element reports an inner box smaller than the visual dialog, so height is not compared.)
    expect(Math.abs(ours.field.box.w - official.field.box.w), 'field dialog w').toBeLessThanOrEqual(4);
    expect(official.field.box.w).toBe(374);
    for (const caption of ['Field Settings', 'Source Name:', 'Region', 'Custom Name:', 'Subtotals', 'Layout & Print', 'Automatic', 'None', 'Custom', 'Select one or more functions:', 'Sum', 'Count', 'Average']) {
      near(leaf(ours.field, caption), leaf(official.field, caption), `field "${caption}"`);
    }
    for (const caption of ['Label Format', 'OK', 'Cancel']) near(btn(ours.field, caption), btn(official.field, caption), `field button "${caption}"`);
    // Rename through the dialog behaves the same (API state).
    expect(ours.fieldsAfterRename, 'fields after rename').toEqual(official.fieldsAfterRename);
    expect(official.fieldsAfterRename.some((f: any) => f.name === 'Area' && f.area === 1), 'trial renamed Region -> Area').toBe(true);

    // Value Field Settings: layout, the trial's summarize list, Count behaviour.
    expect(Math.abs(ours.vfs.box.w - official.vfs.box.w), 'vfs dialog w').toBeLessThanOrEqual(4);
    for (const caption of ['Value Field Settings', 'Source Name:', 'Q1', 'Custom Name:', 'Summarize Values By', 'Show Value As', 'Summarize values field by', 'Choose the type of calculation that you want to use to summarize data from the selected field', 'Sum', 'Count', 'Average', 'Max', 'Count Numbers', 'StdDevp', 'Varp']) {
      near(leaf(ours.vfs, caption), leaf(official.vfs, caption), `vfs "${caption}"`, 3);
    }
    for (const caption of ['Number Format', 'OK', 'Cancel']) near(btn(ours.vfs, caption), btn(official.vfs, caption), `vfs button "${caption}"`);
    expect(ours.fieldsAfterCount, 'fields after Count').toEqual(official.fieldsAfterCount);
    expect(official.fieldsAfterCount.some((f: any) => f.name === 'Count of Q1' && f.area === 3), 'trial became Count of Q1').toBe(true);
    // Show Value As tab: labels, the combo and the trial's full option list.
    near(leaf(ours.sva, 'Base field:'), leaf(official.sva, 'Base field:'), 'sva "Base field:"');
    near(leaf(ours.sva, 'Base item:'), leaf(official.sva, 'Base item:'), 'sva "Base item:"');
    near(ours.sva.selects?.[0], official.sva.selects?.[0], 'sva combo', 4);
    expect(ours.sva.selects?.[0]?.options, 'show-value-as options').toEqual(official.sva.selects?.[0]?.options);
    expect(ours.showDataAs, 'showDataAs state').toEqual(official.showDataAs);
    expect(official.showDataAs.showDataAs, 'trial % of Grand Total').toBe(1);

    // Number Format: the trial stacks its Format Cells dialog; the value cells carry the formatter.
    expect(ours.nfOpen, 'our Format Cells opens').toBe(true);
    expect(ours.formatters.length, 'our value cells formatted').toBeGreaterThan(0);
    expect(ours.formatters, 'value formatters').toEqual(official.formatters);
    expect(official.formatters.length, 'trial value cells formatted').toBeGreaterThan(0);
  });
});
