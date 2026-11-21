/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * TASK 74 paired contextual-tab spec.
 *
 * One script drives BOTH the official trial and ours (designer-compare page),
 * and compares only DOM observables and the workbook MODEL read through the
 * public API — never pixels. Scenarios mirror the committed trial probes:
 * tab visibility per selection (`.probe/t74/measure9-official.json`), the Table
 * Design tab layout (`.probe/t74/tabledom34` behaviour probes), chart element
 * rows / Quick Layout / Chart Styles / Change Colors model writes
 * (`.probe/t74/measure24-official.json`) and the Sparkline tab
 * (`.probe/t74/behaviour3-official.json`, `spark32`).
 */
import { expect, test, type Page } from '@playwright/test';
import { boot } from './helpers';

test.setTimeout(240_000);

/* ---------------------------------------------------------------- helpers -- */

/** Rail captions, selected tab marked with `*` (license tab filtered out). */
async function rail(page: Page): Promise<string[]> {
  const entries: { text: string; sel: boolean }[] = await page.evaluate(() =>
    [...document.querySelectorAll('.gc-designer-ribbon-tab-nav-text')]
      .filter((e) => e.getBoundingClientRect().width > 0)
      .map((e) => ({ text: ((e.querySelector('.sd-text-content') ?? e).textContent ?? '').trim(), sel: e.className.includes('selected') || e.getAttribute('aria-selected') === 'true' })));
  return entries.filter((e) => e.text && !/License/i.test(e.text)).map((e) => `${e.text}${e.sel ? '*' : ''}`);
}

async function activeTab(page: Page): Promise<string> {
  return page.evaluate(() => {
    try { return String(window.__designerCompare.designer.activeRibbonTab()); } catch { return 'ERR'; }
  });
}

async function groupLabels(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const root = document.querySelector('.gc-designer-ribbon');
    if (!root) return [];
    const out: string[] = [];
    for (const g of root.querySelectorAll(':scope .gc-designer-ribbon-group')) {
      const r = g.getBoundingClientRect();
      if (r.width <= 0 || r.y > 230) continue;
      const label = g.querySelector('.gc-designer-ribbon-group-title, .gc-designer-ribbon-group-label');
      if (label) out.push((label.textContent ?? '').trim());
    }
    return out;
  });
}

async function clickCell(page: Page, row: number, col: number): Promise<void> {
  const pt = await page.evaluate(([row, col]) => {
    const sheet = window.__designerCompare.spread.getActiveSheet();
    const canvas = [...document.querySelectorAll('canvas')].map((c) => c.getBoundingClientRect()).sort((a, b) => b.width * b.height - a.width * a.height)[0];
    const r = sheet.getCellRect(row, col);
    return { x: canvas.left + r.x + r.width / 2, y: canvas.top + r.y + r.height / 2 };
  }, [row, col]);
  await page.mouse.click(pt.x, pt.y);
  await page.waitForTimeout(1100);
}

async function clickObject(page: Page, x: number, y: number, w: number, h: number): Promise<void> {
  const pt = await page.evaluate(([x, y, w, h]) => {
    const canvas = [...document.querySelectorAll('canvas')].map((c) => c.getBoundingClientRect()).sort((a, b) => b.width * b.height - a.width * a.height)[0];
    return { x: canvas.left + 40 + x + w / 2, y: canvas.top + 22 + y + h / 2 };
  }, [x, y, w, h]);
  await page.mouse.click(pt.x, pt.y);
  await page.waitForTimeout(1200);
}

async function clickCommand(page: Page, command: string): Promise<void> {
  const at = await page.evaluate((c) => {
    const el = document.querySelector(`[data-command="ribbon.${c}"]`);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return r.width > 0 ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null;
  }, command);
  expect(at, `ribbon control ribbon.${command}`).not.toBeNull();
  await page.mouse.click(at!.x, at!.y);
  await page.waitForTimeout(900);
}

/** The product's message box: title, text and the footer buttons it offers. */
async function messageBox(page: Page): Promise<{ title: string; text: string; buttons: string[] }> {
  const box = await page.evaluate(() => {
    const root = [...document.querySelectorAll('[role="dialog"]')].find((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
    if (!root) return null;
    const message = root.querySelector('.alert-message, .gc-messagebox-text');
    const footer = root.querySelector('.gc-designer-dialog-footer, .gc-dialog-footer');
    return {
      title: (root.querySelector('.gc-designer-dialog-title, .gc-messagebox-title')?.textContent ?? '').trim(),
      text: (message?.textContent ?? '').trim(),
      buttons: [...(footer?.querySelectorAll('button') ?? [])].map((b) => (b.textContent ?? '').trim()).filter(Boolean),
    };
  });
  expect(box, 'message box').not.toBeNull();
  return box as { title: string; text: string; buttons: string[] };
}

/** Click the message box's first footer button (the trial and ours both lead with OK). */
async function dismissBox(page: Page): Promise<void> {
  const at = await page.evaluate(() => {
    const root = [...document.querySelectorAll('[role="dialog"]')].find((e) => e.getBoundingClientRect().width > 0);
    const button = root?.querySelector('.gc-designer-dialog-footer button, .gc-dialog-footer button') ?? null;
    if (!button) return null;
    const r = button.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  expect(at, 'message box OK button').not.toBeNull();
  await page.mouse.click(at!.x, at!.y);
  await page.waitForTimeout(1200);
}

/** Run a contextual command through each product's own public designer API. */
async function runCommand(page: Page, name: string, value?: unknown): Promise<void> {
  const result = await page.evaluate(({ name, value }) => {
    const GC = (window as any).GC;
    const designer = window.__designerCompare.designer;
    if (typeof designer.executeCommand === 'function') return String(designer.executeCommand(name, name, value));
    const cmd = GC.Spread.Sheets.Designer.getCommand(name);
    if (!cmd || typeof cmd.execute !== 'function') return 'missing';
    const r = cmd.execute(designer, name, value);
    return r && typeof (r as Promise<unknown>).then === 'function' ? 'async' : String(r);
  }, { name, value });
  expect(result, `execute ${name}`).not.toBe('missing');
  await page.waitForTimeout(800);
}

/** Open a gallery dropdown and click the item whose first label line matches. */
async function clickGalleryItem(page: Page, launcher: string, labelPattern: RegExp): Promise<void> {
  await clickCommand(page, launcher);
  const at = await page.evaluate(({ launcher, source }) => {
    const pattern = new RegExp(source, 'i');
    /* Gallery items carry their own `data-value` on BOTH products, and the trial
     * gives them the launcher's `data-command` too, so the launcher node is
     * excluded by identity rather than by command name. */
    const launcherEl = document.querySelector(`[data-command="ribbon.${launcher}"]`);
    const nodes = [...document.querySelectorAll('[data-value]')].filter((e) => {
      if (e === launcherEl) return false;
      const r = e.getBoundingClientRect();
      if (r.width < 6 || r.height < 6) return false;
      const raw = `${e.getAttribute('title') ?? ''}\n${e.getAttribute('aria-label') ?? ''}\n${e.textContent ?? ''}`;
      const first = raw.split('\n').map((s) => s.trim()).filter(Boolean)[0] ?? '';
      return pattern.test(first.replace(/\s+/g, ''));
    });
    if (!nodes.length) return null;
    const r = nodes[0].getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, { launcher, source: labelPattern.source });
  expect(at, `${launcher}: gallery item ${labelPattern}`).not.toBeNull();
  await page.mouse.click(at!.x, at!.y);
  await page.waitForTimeout(1000);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
}

interface AxisSnap { visible: boolean; title: string; major: boolean; minor: boolean }
interface ChartSnap { legend: { visible: boolean; position: number }; axes: { primaryCategory: AxisSnap, primaryValue: AxisSnap }; labels: { show: boolean; position: number }; back: string }

async function chartSnap(page: Page): Promise<ChartSnap> {
  return page.evaluate(() => {
    const sheet = window.__designerCompare.spread.getActiveSheet();
    const chart = sheet.charts.all()[0];
    const ax = chart.axes() as any;
    const one = (a: any): AxisSnap => ({ visible: !!(a && a.visible), title: String(a?.title?.text ?? ''), major: !!(a?.majorGridLine && a.majorGridLine.visible), minor: !!(a?.minorGridLine && a.minorGridLine.visible) });
    const legend = chart.legend() as any;
    const labels = chart.dataLabels() as any;
    const area = chart.chartArea() as any;
    return {
      legend: { visible: !!legend?.visible, position: Number(legend?.position ?? 0) },
      axes: { primaryCategory: one(ax.primaryCategory), primaryValue: one(ax.primaryValue) },
      labels: { show: !!labels?.showValue, position: Number(labels?.position ?? 0) },
      back: String(area?.backColor ?? ''),
    };
  });
}

async function ensureChartSelected(page: Page): Promise<void> {
  const selected = await page.evaluate(() => window.__designerCompare.spread.getActiveSheet().charts.all().some((c: any) => c.isSelected()));
  if (!selected) await clickObject(page, 500, 120, 340, 220);
}

async function seed(page: Page, kind: 'table' | 'chart' | 'spark' | 'formula' | 'mix'): Promise<void> {
  await page.evaluate((kind) => {
    const GC = (window as any).GC;
    const spread = window.__designerCompare.spread;
    const sheet = spread.getActiveSheet();
    for (const t of sheet.tables.all()) { try { sheet.tables.remove((t as any).name()); } catch { /* ignore */ } }
    for (const c of sheet.charts.all()) sheet.charts.remove((c as any).name());
    try { for (const s of sheet.shapes.all()) sheet.shapes.remove((s as any).name()); } catch { /* shapes add-in absent */ }
    for (let r = 0; r < 30; r++) for (let c = 0; c < 12; c++) { try { sheet.removeSparkline(r, c); } catch { /* none */ } }
    /* SpreadArea.macros = 4, StorageType.data = 1 — written as literals because
     * our core namespace does not export the SpreadArea enum. */
    try { sheet.clear(0, 0, 24, 8, 4, 1); } catch { sheet.clear(0, 0, 24, 8); }
    const rows = [['Region', 'Q1', 'Q2', 'Q3', 'Q4', 'Total'], ['North', 120, 135, 150, 165, 570], ['South', 90, 105, 95, 125, 415], ['East', 75, 80, 90, 100, 345], ['West', 110, 115, 105, 130, 460]];
    rows.forEach((row, r) => row.forEach((v, c) => sheet.setValue(r, c, v)));
    if (kind === 'table' || kind === 'mix') sheet.tables.add('Table1', 0, 0, 5, 6, 'Medium Style 2 - Accent 1');
    if (kind === 'chart' || kind === 'mix') {
      sheet.charts.add('Chart1', GC.Spread.Sheets.Charts.ChartType.columnClustered, 500, 120, 340, 220, 'A2:F5');
      if (kind === 'mix') sheet.shapes.add('Shape1', GC.Spread.Sheets.Shapes.AutoShapeType.rectangle, 950, 140, 170, 100);
    }
    if (kind === 'spark') sheet.setSparkline(8, 1, 'B1:F1', GC.Spread.Sheets.Sparklines.DataOrientation.horizontal, GC.Spread.Sheets.Sparklines.SparklineType.line, new GC.Spread.Sheets.Sparklines.SparklineSetting());
    if (kind === 'formula') sheet.setFormula(12, 1, '=LINESPARKLINE(B2:F2,"horizontal")');
    spread.refresh();
  }, kind);
  await page.waitForTimeout(1700);
}

/* ----------------------------------------------------------------- tests --- */

test('Table Design tab: selection visibility, groups, checkbox states and model writes match the trial', async ({ browser }) => {
  const run = async (side: 'official' | 'ours') => {
    const page = await browser.newPage();
    try {
      await boot(page, side);
      await seed(page, 'table');
      await clickCell(page, 2, 1);
      const open = { rail: await rail(page), active: await activeTab(page), groups: await groupLabels(page) };
      const checks = await page.evaluate(() =>
        [...document.querySelectorAll('[data-buttontype="checkbox"]')]
          .filter((e) => e.getBoundingClientRect().width > 0 && e.getBoundingClientRect().y < 230)
          .map((e) => `${e.getAttribute('data-command')}:${e.getAttribute('aria-checked')}`));
      const combo = await page.evaluate(() => {
        const el = document.querySelector('[data-command="ribbon.tableName"]');
        if (!el) return null;
        const input = el.matches('input') ? el : el.querySelector('input');
        return input ? String((input as HTMLInputElement).value) : (el.textContent ?? '').trim();
      });
      // Banded Rows through the ribbon UI (model read back through the public API).
      const bandRead = () => page.evaluate(() => !!(window.__designerCompare.spread.getActiveSheet().tables.findByName('Table1') as any).bandRows());
      const bandBefore = await bandRead();
      await clickCommand(page, 'tableStyleBandedRows');
      const bandOff = await bandRead();
      await clickCommand(page, 'tableStyleBandedRows');
      const bandBack = await bandRead();
      // Binding launchers: regular table shows Convert-To only.
      const launchers = () => page.evaluate(() => {
        const vis = (c: string) => { const el = document.querySelector(`[data-command="ribbon.${c}"]`); return !!el && el.getBoundingClientRect().width > 4; };
        const field = document.querySelector('[data-command="ribbon.tableBindingSource"]');
        const input = field ? (field.matches('input') ? field : field.querySelector('input')) : null;
        return { to: vis('ConvertToDataTable'), from: vis('ConvertFromDataTable'), combo: input ? String(input.value) : (field?.textContent ?? '').trim() };
      });
      const bindingBefore = await launchers();
      // The trial converts a REGULAR table through its command: a confirm box with
      // OK/Cancel, then "Convert from Data Table" + a named Binding Source.
      await clickCommand(page, 'ConvertToDataTable');
      const toDataBox = await messageBox(page);
      await dismissBox(page);
      const converted = await launchers();
      await clickCommand(page, 'ConvertFromDataTable');
      const fromDataBox = await messageBox(page);
      await dismissBox(page);
      const backToRegular = await launchers();
      await page.evaluate(() => {
        const GC = (window as any).GC;
        const sheet = window.__designerCompare.spread.getActiveSheet();
        const t = sheet.tables.findByName('Table1');
        const headers = ['Region', 'Q1', 'Q2', 'Q3', 'Q4', 'Total'];
        const columns = headers.map((h: string, i: number) => new GC.Spread.Sheets.Tables.TableColumn(i + 1, h, h));
        const records = [
          { Region: 'North', Q1: 120, Q2: 135, Q3: 150, Q4: 165, Total: 570 },
          { Region: 'South', Q1: 90, Q2: 105, Q3: 95, Q4: 125, Total: 415 },
          { Region: 'East', Q1: 75, Q2: 80, Q3: 90, Q4: 100, Total: 345 },
          { Region: 'West', Q1: 110, Q2: 115, Q3: 105, Q4: 130, Total: 460 },
        ];
        t.bind(columns, 'SalesData', { SalesData: records });
        window.__designerCompare.spread.refresh();
      });
      await clickCell(page, 2, 1);
      const bindingAfter = await page.evaluate(() => {
        const vis = (c: string) => { const el = document.querySelector(`[data-command="ribbon.${c}"]`); return !!el && el.getBoundingClientRect().width > 4; };
        const t = window.__designerCompare.spread.getActiveSheet().tables.findByName('Table1') as any;
        return { to: vis('ConvertToDataTable'), from: vis('ConvertFromDataTable'), path: String(t.bindingPath()) };
      });
      // An app-bound table is NOT a designer data table: the trial keeps Convert-To
      // visible and its command answers the error box "Can't convert a binding table".
      await clickCommand(page, 'ConvertToDataTable');
      const bindingError = await messageBox(page);
      await dismissBox(page);
      const stillRegular = await launchers();
      await clickCell(page, 12, 1);
      const closed = { rail: await rail(page), active: await activeTab(page) };
      return { open, checks, combo, band: { bandBefore, bandOff, bandBack }, bindingBefore, toDataBox: toDataBox, converted, fromDataBox, backToRegular, bindingAfter, bindingError, stillRegular, closed };
    } finally { await page.close(); }
  };
  const official = await run('official');
  const ours = await run('ours');
  expect(ours.open.rail, 'Table Design shows while the active cell is in a table').toEqual(official.open.rail);
  expect(ours.open.active).toEqual(official.open.active);
  expect(ours.open.groups, 'group captions and order').toEqual(official.open.groups);
  expect(ours.checks, 'checkbox identities and checked states').toEqual(official.checks);
  expect(ours.combo, 'table-name combo carries the table name').toBe(official.combo);
  expect(ours.combo).toBe('Table1');
  expect(ours.band, 'Banded Rows toggles the table flag both ways').toEqual(official.band);
  expect(ours.band.bandBefore).toBe(true);
  expect(ours.band.bandOff).toBe(false);
  expect(ours.bindingBefore, 'regular table: only Convert-To is visible').toEqual(official.bindingBefore);
  expect(ours.bindingBefore.combo, 'a regular table shows no Binding Source (trial)').toBe('');
  expect(ours.toDataBox, 'the convert confirm reads the trial sentence with OK and Cancel').toEqual(official.toDataBox);
  expect(ours.converted, 'the converted table swaps the launcher and names its Binding Source').toEqual(official.converted);
  expect(ours.converted.from, 'Convert from Data Table appears after the designer convert').toBe(true);
  expect(ours.converted.combo, 'the trial combo names the source it created').toBe('Table1');
  expect(ours.fromDataBox, 'the convert-from confirm matches the trial').toEqual(official.fromDataBox);
  expect(ours.backToRegular, 'converting back gives a regular table again').toEqual(official.backToRegular);
  expect(ours.bindingAfter, 'an app-bound table is not a designer data table (trial)').toEqual(official.bindingAfter);
  expect(ours.bindingAfter.from, 'Convert-From stays hidden for a raw Table.bind()').toBe(false);
  expect(ours.bindingError, 'the trial refuses to convert a binding table').toEqual(official.bindingError);
  expect(ours.stillRegular, 'the refused convert changes nothing').toEqual(official.stillRegular);
  expect(ours.closed.rail, 'a cell outside every table closes the tab').toEqual(official.closed.rail);
  expect(ours.closed.active).toEqual(official.closed.active);
});

test('Chart Design tab: rail, groups, element rows and galleries write the trial model', async ({ browser }) => {
  const run = async (side: 'official' | 'ours') => {
    const page = await browser.newPage();
    try {
      await boot(page, side);
      await seed(page, 'chart');
      await clickObject(page, 500, 120, 340, 220);
      const open = { rail: await rail(page), active: await activeTab(page), groups: await groupLabels(page) };
      const base = await chartSnap(page);
      await runCommand(page, 'axesPrimaryVertical');
      const axesOff = (await chartSnap(page)).axes.primaryValue.visible;
      await runCommand(page, 'axesPrimaryVertical');
      const axesBack = (await chartSnap(page)).axes.primaryValue.visible;
      await runCommand(page, 'gridLinesPrimaryMajorHorizontal');
      const gridOff = (await chartSnap(page)).axes.primaryValue.major;
      await runCommand(page, 'gridLinesPrimaryMajorHorizontal');
      const gridBack = (await chartSnap(page)).axes.primaryValue.major;
      await runCommand(page, 'dataLabelsCenter');
      const dlCenter = (await chartSnap(page)).labels;
      await runCommand(page, 'dataLabelsNone');
      const dlNone = (await chartSnap(page)).labels;
      await runCommand(page, 'legendLeft');
      const legendLeft = (await chartSnap(page)).legend;
      await runCommand(page, 'legendNone');
      const legendNone = (await chartSnap(page)).legend;
      await ensureChartSelected(page);
      await clickGalleryItem(page, 'quickLayout', /^Layout4?$/);
      const layout4 = await chartSnap(page);
      await ensureChartSelected(page);
      await clickGalleryItem(page, 'chartStyle', /^style3$/);
      const style3 = await chartSnap(page);
      await ensureChartSelected(page);
      await clickGalleryItem(page, 'chartStyle', /^style4$/);
      const style4 = await chartSnap(page);
      await ensureChartSelected(page);
      await clickGalleryItem(page, 'changeColors', /^MonochromaticPalette2$/);
      const colors = await chartSnap(page);
      const scheme = await page.evaluate(() => { const s = window.__designerCompare.spread.getActiveSheet().charts.all()[0].colorScheme(); return JSON.stringify((s as [number, string[]])[1] ?? []); });
      await clickCell(page, 12, 1);
      const closed = { rail: await rail(page), active: await activeTab(page) };
      return { open, base, axesOff, axesBack, gridOff, gridBack, dlCenter, dlNone, legendLeft, legendNone, layout4, style3, style4, colors, scheme, closed };
    } finally { await page.close(); }
  };
  const official = await run('official');
  const ours = await run('ours');
  expect(ours.open.rail, 'a selected chart opens Chart Design (with Shape Format)').toEqual(official.open.rail);
  expect(ours.open.active, 'Chart Design takes the tab').toEqual(official.open.active);
  expect(ours.open.groups).toEqual(official.open.groups);
  expect(ours.base.axes.primaryValue.major, 'baseline: fresh chart has the major horizontal gridlines (trial)').toBe(true);
  expect(ours.axesOff, 'axes row hides the value axis').toBe(false);
  expect(official.axesOff).toBe(false);
  expect(ours.axesBack).toBe(true);
  expect(ours.gridOff, 'gridline row removes the major horizontal lines').toBe(false);
  expect(official.gridOff).toBe(false);
  expect(ours.gridBack).toBe(true);
  expect(ours.dlCenter, 'dataLabelsCenter writes show+center like the trial').toEqual({ show: true, position: 2 });
  expect(official.dlCenter).toEqual(ours.dlCenter);
  expect(ours.dlNone.show, 'dataLabelsNone clears the show flag').toBe(false);
  expect(ours.dlNone.position, 'dataLabelsNone keeps the current position (trial)').toBe(official.dlNone.position);
  expect(ours.legendLeft, 'legendLeft').toEqual({ visible: true, position: 3 });
  expect(official.legendLeft).toEqual(ours.legendLeft);
  expect(ours.legendNone.visible, 'legendNone hides the legend').toBe(false);
  expect(official.legendNone.visible).toBe(false);
  expect(ours.layout4.axes, 'quick layout 4 writes the trial axis state').toEqual(official.layout4.axes);
  expect(ours.layout4.legend, 'quick layout 4 keeps the bottom legend').toEqual(official.layout4.legend);
  expect(ours.layout4.labels, 'quick layout 4 shows labels outside end').toEqual(official.layout4.labels);
  expect(ours.layout4.back, 'quick layout 4 leaves the default chart-area fill').toEqual(official.layout4.back);
  expect(ours.style3.axes, 'chart style 3 gridlines').toEqual(official.style3.axes);
  expect(ours.style3.legend, 'chart style 3 legend').toEqual(official.style3.legend);
  expect(ours.style3.back, 'chart style 3 dark chart area').toBe('rgb(93,93,93)');
  expect(official.style3.back).toBe(ours.style3.back);
  expect(ours.style4.legend.position, 'chart style 4 moves the legend to the top').toBe(1);
  expect(official.style4.legend.position).toBe(1);
  expect(ours.colors.back, 'chart style 4 clears the chart-area fill (trial token)').toEqual(official.colors.back);
  expect(ours.scheme, 'Change Colors writes the core scheme').toBe('[\"accent 2\"]');
  expect(closedEqual(ours, official), 'clicking a plain cell closes Chart Design').toBe(true);
});

function closedEqual(ours: { closed: { rail: string[]; active: string } }, official: { closed: { rail: string[]; active: string } }): boolean {
  return JSON.stringify(ours.closed) === JSON.stringify(official.closed);
}

test('Sparkline tabs (cell + formula) match the trial visibility and model writes', async ({ browser }) => {
  const runSpark = async (side: 'official' | 'ours') => {
    const page = await browser.newPage();
    try {
      await boot(page, side);
      await seed(page, 'spark');
      await clickCell(page, 8, 1);
      const shown = { rail: await rail(page), active: await activeTab(page) };
      await clickCommandTab(page, 'Sparkline');
      const groups = await groupLabels(page);
      const read = () => page.evaluate(() => {
        const s = window.__designerCompare.spread.getActiveSheet().getSparkline(8, 1) as any;
        const o = s?.setting?.()?.options ?? {};
        return { type: Number(s?.sparklineType?.()), showHigh: !!o.showHigh, weight: String(o.lineWeight) };
      });
      const before = await read();
      await clickCommand(page, 'showHighpoint');
      const high = await read();
      await clickCommand(page, 'columnSparkline');
      const column = await read();
      await clickCommand(page, 'showHighpoint');
      const unhigh = await read();
      await clickCell(page, 12, 1);
      const closed = { rail: await rail(page), active: await activeTab(page) };
      return { shown, groups, before, high, column, unhigh, closed };
    } finally { await page.close(); }
  };
  const official = await runSpark('official');
  const ours = await runSpark('ours');
  expect(ours.shown.rail, 'the Sparkline tab appears without taking the selection').toEqual(official.shown.rail);
  expect(ours.shown.active, 'Home stays the active tab').toEqual(official.shown.active);
  expect(ours.groups).toEqual(official.groups);
  expect(ours.before.showHigh, 'fresh setting: High Point off (trial)').toBe(false);
  expect(official.before.showHigh).toBe(false);
  expect(ours.high.showHigh, 'High Point checkbox turns the marker on').toBe(true);
  expect(official.high.showHigh).toBe(true);
  expect(ours.column.type, 'Column button writes the sparkline type').toBe(1);
  expect(official.column.type).toBe(1);
  expect(ours.unhigh.showHigh, 'High Point checkbox toggles back').toBe(false);
  expect(official.unhigh.showHigh).toBe(false);
  expect(ours.closed.rail, 'a sparkline-free cell closes the tab').toEqual(official.closed.rail);

  const runFormula = async (side: 'official' | 'ours') => {
    const page = await browser.newPage();
    try {
      await boot(page, side);
      await seed(page, 'formula');
      await clickCell(page, 12, 1);
      const shown = { rail: await rail(page), active: await activeTab(page) };
      await clickCommandTab(page, 'Sparkline');
      const groups = await groupLabels(page);
      const command = await page.evaluate(() => {
        const GC = (window as any).GC;
        const designer = window.__designerCompare.designer;
        if (typeof designer.executeCommand === 'function') return designer.getCommand ? typeof designer.getCommand('formulaSparklineSetting') === 'object' : false;
        const cmd = GC.Spread.Sheets.Designer.getCommand('formulaSparklineSetting');
        return !!cmd && typeof cmd.execute === 'function';
      });
      return { shown, groups, command };
    } finally { await page.close(); }
  };
  const fOfficial = await runFormula('official');
  const fOurs = await runFormula('ours');
  expect(fOurs.shown.rail, 'the formula Sparkline tab appears on a *SPARKLINE* formula cell').toEqual(fOfficial.shown.rail);
  expect(fOurs.shown.active, 'it never takes the selection (trial)').toEqual(fOfficial.shown.active);
  expect(fOurs.groups, 'the formula tab keeps the trial single Argument group').toEqual(fOfficial.groups);
  expect(fOurs.groups.length).toBe(1);
  expect(fOurs.command, 'formulaSparklineSetting is a runnable public command').toBe(true);
});

async function clickCommandTab(page: Page, tabText: string): Promise<void> {
  /* Both products duplicate the label (`.sd-text-content` + `.sd-text-placeholer`),
   * so the tab is found by the visible caption, exactly like `rail()` reads it. */
  const at = await page.evaluate((label) => {
    const hit = [...document.querySelectorAll('.gc-designer-ribbon-tab-nav-text')]
      .filter((e) => e.getBoundingClientRect().width > 0)
      .map((e) => ({ e, text: (((e.querySelector('.sd-text-content') ?? e).textContent ?? '') as string).replace(/\s+/g, ' ').trim() }))
      .find((x) => x.text === label);
    if (!hit) return null;
    const r = hit.e.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, tabText);
  expect(at, `ribbon tab "${tabText}"`).not.toBeNull();
  await page.mouse.click(at!.x, at!.y);
  await page.waitForTimeout(900);
}

test('mixed selections: object tabs replace the cell tabs and Home regains them in the trial order', async ({ browser }) => {
  const run = async (side: 'official' | 'ours') => {
    const page = await browser.newPage();
    try {
      await boot(page, side);
      await seed(page, 'mix');
      await clickCell(page, 2, 1);
      const inTable = { rail: await rail(page), active: await activeTab(page) };
      await clickObject(page, 500, 120, 340, 220);
      const onChart = { rail: await rail(page), active: await activeTab(page) };
      await clickObject(page, 950, 140, 170, 100);
      const onShape = { rail: await rail(page), active: await activeTab(page) };
      await clickCell(page, 2, 1);
      const back = { rail: await rail(page), active: await activeTab(page) };
      return { inTable, onChart, onShape, back };
    } finally { await page.close(); }
  };
  const official = await run('official');
  const ours = await run('ours');
  expect(ours.inTable.rail, 'table under the active cell').toEqual(official.inTable.rail);
  expect(ours.inTable.active).toEqual(official.inTable.active);
  expect(ours.onChart.rail, 'a chart closes Table Design and opens Shape Format + Chart Design').toEqual(official.onChart.rail);
  expect(ours.onChart.active, 'Chart Design is the activated tab (trial lands there, not on Shape Format)').toEqual(official.onChart.active);
  expect(ours.onShape.rail, 'a shape lands on Shape Format').toEqual(official.onShape.rail);
  expect(ours.onShape.active).toEqual(official.onShape.active);
  expect(ours.back.rail, 'back inside the table: Table Design returns').toEqual(official.back.rail);
  expect(ours.back.active).toEqual(official.back.active);
});
