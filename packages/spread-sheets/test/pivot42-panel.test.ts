// @vitest-environment jsdom
/* Unit tests for the PivotTable Fields panel (TASK 42 item 5): section
 * structure and texts, checkbox add/remove, search, defer + update, section
 * visibility/layout flags and the views combo. Canvas is stubbed (no 2D
 * backend in jsdom), same trick as the slicer UI tests. */
import { beforeEach, describe, expect, it } from 'vitest';
import GC from '../src/index.js';
import type { Worksheet } from '../src/worksheet.js';

(globalThis as Record<string, unknown>).CanvasRenderingContext2D = class {};

const { Workbook } = GC.Spread.Sheets;
const Pivot = GC.Spread.Pivot as unknown as {
  PivotPanel: { new (name: string, pivot: unknown, host: HTMLElement): PanelT; findControl(host: HTMLElement | string): PanelT };
  PivotPanelSection: { fields: number; area: number; viewList: number };
  PivotTableLayoutType: { compact: number };
};
type PanelT = {
  name(): string;
  panelLayout(value?: number): number | void;
  sectionVisibility(value?: number): number | void;
  attach(pivot: unknown): void;
  detach(): void;
  destroy(): void;
  _element(): HTMLElement | null;
};

const SALES = [
  ['Date', 'Buyer', 'Type', 'Amount', 'Region'],
  ['01-Jan', 'Mom', 'Fuel', 74, 'East'],
  ['15-Jan', 'Mom', 'Food', 235, 'East'],
  ['17-Jan', 'Dad', 'Sports', 20, 'West'],
  ['21-Jan', 'Kelly', 'Books', 125, 'West'],
  ['25-Jan', 'Dad', 'Food', 58, 'East'],
  ['30-Jan', 'Mom', 'Sports', 42, 'West'],
  ['04-Feb', 'Kelly', 'Fuel', 96, 'East'],
  ['08-Feb', 'Dad', 'Books', 310, 'West'],
  ['12-Feb', 'Mom', 'Food', 88, 'East'],
];

function build() {
  const wb = new Workbook(undefined, { sheetCount: 2 });
  const data = wb.getSheet(0);
  data.name('Data');
  data.setArray(0, 0, SALES);
  data.tables.add('sourceData', 0, 0, SALES.length, SALES[0]!.length);
  const sheet = wb.getSheet(1) as Worksheet;
  sheet.name('Pivot');
  const pt = sheet.pivotTables.add('pivot1', 'sourceData' as never, 1, 1,
    Pivot.PivotTableLayoutType.compact, 'Medium2');
  pt.add('Buyer', 'Buyer', 1);
  pt.add('Amount', 'Amount', 3, 8);
  const host = document.createElement('div');
  document.body.append(host);
  const panel = new Pivot.PivotPanel('panel1', pt as never, host as never);
  return { wb, sheet, pt, host, panel, root: host.querySelector('.gc-panel-all') as HTMLElement };
}

/** Live panel root (re-render replaces the DOM, never reuse an old handle). */
function liveRoot(env: { panel: PanelT }): HTMLElement {
  return env.panel._element()!;
}

/** Flat text of the panel (normalized whitespace). */
function panelText(root: HTMLElement): string {
  return (root.textContent ?? '').replace(/\s+/g, ' ');
}

function fieldItem(root: HTMLElement, name: string): HTMLElement {
  return [...root.querySelectorAll<HTMLElement>('.gc-panel-all-field-item')]
    .find(item => item.dataset.sourcename === name)!;
}

describe('PivotPanel (GC.Spread.Pivot.PivotPanel)', () => {
  let env: ReturnType<typeof build>;
  beforeEach(() => { env = build(); });

  it('renders the trial section structure and texts', () => {
    const { root } = env;
    expect(root).toBeTruthy();
    expect(root.querySelector('.gc-panel-header')!.textContent).toBe('PivotTable Fields');
    const text = panelText(root);
    expect(text).toContain('Choose fields to add to report');
    expect(text).toContain('Drag fields between areas below:');
    expect(text).toContain('Defer Layout Update');
    expect(text).toContain('Update');
    expect(text).toContain('Views');
    for (const key of ['Filters', 'Columns', 'Rows', 'Values'])
      expect(root.querySelector(`.gc-panel-area-section-${key}`)).toBeTruthy();
    expect(root.querySelector('.gc-panel-search-input')!.getAttribute('placeholder')).toBe('Search');
    // five source fields with the trial data-* contract
    const items = [...root.querySelectorAll<HTMLElement>('.gc-panel-all-field-item')];
    expect(items.map(item => item.dataset.sourcename)).toEqual(['Date', 'Buyer', 'Type', 'Amount', 'Region']);
    expect(items.map(item => item.querySelector('input')!.checked)).toEqual([false, true, false, true, false]);
  });

  it('area chips carry name/area/index and reflect the pivot state', () => {
    const { root } = env;
    const rows = root.querySelector('.gc-panel-area-section-Rows .gc-panel-area-item-content')!;
    const values = root.querySelector('.gc-panel-area-section-Values .gc-panel-area-item-content')!;
    const buyer = rows.querySelector('.gc-panel-area-item') as HTMLElement;
    const amount = values.querySelector('.gc-panel-area-item') as HTMLElement;
    expect(buyer.textContent).toBe('Buyer');
    expect(buyer.dataset.area).toBe('1'); // rowField
    expect(buyer.dataset.index).toBe('0');
    expect(amount.dataset.area).toBe('3'); // valueField
  });

  it('checkbox toggles add fields to Rows (text) / Values (number) and remove them', () => {
    const { pt, root } = env;
    const type = fieldItem(root, 'Type');
    (type.querySelector('input') as HTMLInputElement).click();
    expect(pt.getField('Type')!.pivotArea).toBe(1); // Rows for a text field
    const buyer = fieldItem(liveRoot(env), 'Buyer');
    (buyer.querySelector('input') as HTMLInputElement).click(); // uncheck Buyer
    expect(pt.getField('Buyer')!.pivotArea).toBe(-1);
    // panel re-rendered with the new check marks
    const items = [...liveRoot(env).querySelectorAll<HTMLElement>('.gc-panel-all-field-item')];
    expect(items.map(item => item.querySelector('input')!.checked)).toEqual([false, false, true, true, false]);
  });

  it('search filters the list and shows the No-matches row', () => {
    const { root } = env;
    const input = root.querySelector('.gc-panel-search-input') as HTMLInputElement;
    input.value = 'am';
    input.dispatchEvent(new Event('input'));
    const visible = [...liveRoot(env).querySelectorAll<HTMLElement>('.gc-panel-all-field-item')]
      .filter(item => item.style.display !== 'none').map(item => item.dataset.sourcename);
    expect(visible).toEqual(['Amount']);
    input.value = 'zzz';
    input.dispatchEvent(new Event('input'));
    expect((liveRoot(env).querySelector('.gc-panel-all-field-no-matches') as HTMLElement).style.display).toBe('');
  });

  it('defer layout update batches changes until Update is pressed', () => {
    const { pt, root } = env;
    (root.querySelector('.gc-panel-defer-layout-input') as HTMLInputElement).click();
    (fieldItem(liveRoot(env), 'Type').querySelector('input') as HTMLInputElement).click();
    // deferred: the model changed but the layout is not repainted yet
    const rangeOf = () => pt.getRange().content as unknown as { row: number; col: number; rowCount: number; colCount: number };
    const hasFuel = (): boolean => {
      const range = rangeOf();
      for (let r = 0; r < range.rowCount; r++)
        for (let c = 0; c < range.colCount; c++)
          if (env.sheet.getValue(range.row + r, range.col + c) === 'Fuel') return true;
      return false;
    };
    expect(hasFuel()).toBe(false);
    const defer = liveRoot(env).querySelector('.gc-panel-defer-layout-input') as HTMLInputElement;
    expect(defer.checked).toBe(true);
    const update = liveRoot(env).querySelector('.gc-panel-defer-layout-right-button') as HTMLButtonElement;
    expect(update.disabled).toBe(false);
    update.click();
    expect((liveRoot(env).querySelector('.gc-panel-defer-layout-right-button') as HTMLButtonElement).disabled).toBe(true);
    expect(pt.getField('Type')!.pivotArea).toBe(1);
    // the laid-out grid contains the Type labels after the deferred apply
    const range = pt.getRange().content as unknown as { row: number; col: number; rowCount: number; colCount: number };
    let found = false;
    for (let r = 0; r < range.rowCount && !found; r++)
      for (let c = 0; c < range.colCount && !found; c++)
        if (env.sheet.getValue(range.row + r, range.col + c) === 'Fuel') found = true;
    expect(found).toBe(true);
  });

  it('sectionVisibility() = 7 by default and hides sections per bitmask', () => {
    const { panel } = env;
    expect(panel.sectionVisibility()).toBe(7);
    panel.sectionVisibility(3); // hide viewList
    expect(panel.sectionVisibility()).toBe(3);
    expect(panel._element()!.querySelector('.gc-panel-views')).toBeNull();
    expect(panel._element()!.querySelector('.gc-panel-fields-section')).toBeTruthy();
    panel.sectionVisibility(7);
    expect(panel._element()!.querySelector('.gc-panel-views')).toBeTruthy();
    expect(panel._element()!.querySelector('.gc-panel-withoutViewList')).toBeTruthy();
  });

  it('panelLayout() switches between stack and flow classes', () => {
    const { panel, root } = env;
    expect(panel.panelLayout()).toBe(0);
    panel.panelLayout(1);
    expect(root.querySelector('.gc-panel.gc-panel-flow')).toBeTruthy();
    panel.panelLayout(0);
    expect(root.querySelector('.gc-panel.gc-panel-stack')).toBeTruthy();
  });

  it('views combo adds a named view through the pivot views manager', () => {
    const { pt, root } = env;
    const input = root.querySelector('.gc-panel-view-input') as HTMLInputElement;
    input.value = 'v1';
    (root.querySelector('.gc-panel-add') as HTMLInputElement).click();
    expect(pt.views.get('v1')).toBeTruthy();
    expect(pt.views.all().map(view => view.name)).toEqual(['v1']);
  });

  it('detach clears the host; attach re-renders; destroy stays empty', () => {
    const { host, panel, pt } = env;
    panel.detach();
    expect(host.childElementCount).toBe(0);
    panel.attach(pt as never);
    expect(host.querySelector('.gc-panel-all')).toBeTruthy();
    expect(Pivot.PivotPanel.findControl(host as never)).toBe(panel);
    expect(Pivot.PivotPanel.findControl('missing-host') ?? null).toBeNull();
    panel.destroy();
    expect(host.childElementCount).toBe(0);
    expect(panel.name()).toBe('panel1');
  });
});
