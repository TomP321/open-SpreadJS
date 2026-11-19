// @vitest-environment jsdom
/* Unit tests for TableSheetPanel. DOM structure, texts and behaviours mirror the
 * reference panel as recorded by apps/compare/scripts/tablesheet-panel-comparison.mjs
 * (see .probe/tablesheet-panel-comparison.json):
 *  - field list = embedded mini-workbook (row 0 = view name, then checkbox + caption),
 *    row height 20, checkbox column 28 px, frozen first row, headers/gridlines off;
 *  - checkbox toggles the view column (IColumn.visible) and hides the sheet column;
 *  - row 0 checkbox toggles all fields;
 *  - group list role=listbox with selected item, remove buttons, rename editor,
 *    summary editor (Formula/Caption/Slice) for the selected group. */
import { afterEach, describe, expect, it } from 'vitest';
import GC from '../src/index.js';

const { Workbook, Events } = GC.Spread.Sheets;
const { TableSheetPanel } = GC.Spread.Sheets.TableSheet;

type MiniSheet = ReturnType<InstanceType<typeof Workbook>['getActiveSheet']>;

/** Simulate a checkbox click on a mini-sheet row: the core sets the value and emits
 *  ValueChanged (see src/interaction.ts); jsdom cannot route a canvas click there. */
function toggleCheckbox(miniSheet: MiniSheet, row: number, checked: boolean): void {
  const oldValue = miniSheet.getValue(row, 0);
  miniSheet.setValue(row, 0, checked);
  (miniSheet as unknown as { _emit(type: string, info: unknown): void })._emit(Events.ValueChanged,
    { sheet: miniSheet, sheetName: miniSheet.name(), row, col: 0, oldValue, newValue: checked });
}

function stubCanvas2d(): void {
  (globalThis as Record<string, unknown>).CanvasRenderingContext2D = class {};
  HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement) {
    return new Proxy({}, {
      get: (_t, key: string) => {
        if (key === 'canvas') return this;
        if (key === 'measureText') return () => ({ width: 8 });
        if (key === 'createLinearGradient') return () => ({ addColorStop: () => undefined });
        if (key === 'createPattern') return () => ({});
        if (key === 'getTransform') return () => ({ a: 1, d: 1 });
        if (key === 'getImageData') return (_x: number, _y: number, w: number, h: number) =>
          ({ data: new Uint8ClampedArray(Math.max(1, w) * Math.max(1, h) * 4), width: w, height: h });
        return () => undefined;
      },
      set: () => true,
    }) as unknown as CanvasRenderingContext2D;
  } as unknown as HTMLCanvasElement['getContext'];
}
stubCanvas2d();

async function makePanel(options?: { showSource?: number; fieldAreaVisible?: boolean; groupAreaVisible?: boolean }) {
  const workbook = new Workbook(undefined, { sheetCount: 0 });
  const table = workbook.dataManager().addTable('people', {
    data: [
      { name: 'Ada', city: 'Rome', score: 1 },
      { name: 'Ben', city: 'Paris', score: 2 },
    ],
  });
  const view = table.addView('People', [
    { value: 'name', caption: 'Person' },
    { value: 'city', caption: 'City' },
    { value: 'score', caption: 'Score' },
    { value: '=SUM([@score])', caption: 'Total' },
  ]);
  await view.fetch();
  const sheet = workbook.addSheetTab(0, 'Data', GC.Spread.Sheets.SheetType.tableSheet) as InstanceType<
    typeof GC.Spread.Sheets.TableSheet.TableSheet>;
  sheet.setDataView(view);
  const host = document.createElement('div');
  document.body.append(host);
  const panel = new TableSheetPanel('fields', sheet, host, options);
  const mini = (panel as unknown as { _miniWorkbook(): InstanceType<typeof Workbook> })._miniWorkbook();
  const miniSheet: MiniSheet = mini.getActiveSheet();
  return { workbook, sheet, view, host, panel, mini, miniSheet };
}

afterEach(() => { document.body.innerHTML = ''; });

describe('TableSheetPanel structure', () => {
  it('builds the panel areas with the reference classes, texts and roles', async () => {
    const { host, panel } = await makePanel();
    const root = host.querySelector('.gc-table-sheet-panel')!;
    expect(root).toBeTruthy();
    expect(root.querySelector('.gc-table-sheet-field-header')!.textContent).toBe('Fields');
    expect(root.querySelector('.gc-table-sheet-add-calculate-column')).toBeTruthy();
    expect(root.querySelector('.gc-table-sheet-field-panel')).toBeTruthy();
    expect(root.querySelector('.gc-table-sheet-group-header')!.textContent).toBe('Groups');
    const list = root.querySelector('.gc-table-sheet-group-list')!;
    expect(list.getAttribute('role')).toBe('listbox');
    expect(list.getAttribute('aria-label')).toBe('Groups');
    expect(list.querySelector('.gc-table-sheet-group-tip')!.textContent).toBe('Drag here to set row groups');
    const cross = root.querySelector('.gc-table-sheet-cross-panel')!;
    expect(cross.classList.contains('gc-table-sheet-hidden')).toBe(true);
    expect(cross.querySelector('.gc-table-sheet-group-header')!.textContent).toBe('Cross');
    expect(root.querySelector('.gc-table-sheet-summary-container')).toBeTruthy();
    panel.destroy();
  });
  it('hosts the field list in an embedded mini-workbook sized by the reference', async () => {
    const { miniSheet, mini } = await makePanel();
    expect(mini).toBeTruthy();
    expect(miniSheet.getRowCount()).toBe(5); // view name row + 4 fields
    expect(miniSheet.getColumnCount()).toBe(2);
    expect(miniSheet.getColumnWidth(0)).toBe(28);
    expect(miniSheet.getColumnWidth(1)).toBe(252); // default 280 px mini viewport
    for (let row = 0; row < 5; row++) expect(miniSheet.getRowHeight(row)).toBe(20);
    expect(miniSheet.frozenRowCount()).toBe(1);
    expect(miniSheet.options.rowHeaderVisible).toBe(false);
    expect(miniSheet.options.colHeaderVisible).toBe(false);
    expect(miniSheet.options.gridline.showHorizontalGridline).toBe(false);
    expect(mini.options.tabStripVisible).toBe(false);
    expect(mini.options.showVerticalScrollbar).toBe(false);
    expect(mini.options.grayAreaBackColor).toBe('white');
  });
  it('lists the view name, a checkbox per field and captions as rich text', async () => {
    const { miniSheet } = await makePanel();
    expect(miniSheet.getValue(0, 0)).toBe(true);
    expect(miniSheet.getValue(0, 1)).toBe('People');
    for (let row = 1; row <= 4; row++) expect(miniSheet.getValue(row, 0)).toBe(true);
    expect(miniSheet.getValue(1, 1)).toEqual({ richText: [{ text: 'Person' }], text: 'Person' });
    expect(miniSheet.getValue(2, 1)).toEqual({ richText: [{ text: 'City' }], text: 'City' });
  });
  it('shows source names when showSource is set and the formula of calculated fields', async () => {
    const { miniSheet } = await makePanel({ showSource: 3 });
    expect(miniSheet.getValue(1, 1)).toBe('Person (name)');
    expect(miniSheet.getText(4, 1)).toBe('=SUM([@score])'); // formula column shows its formula
  });
});

describe('TableSheetPanel field visibility', () => {
  it('toggles the view column and hides the sheet column when a field checkbox changes', async () => {
    const { sheet, view, miniSheet } = await makePanel();
    toggleCheckbox(miniSheet, 1, false);
    expect(sheet.getColumnVisible(0)).toBe(false);
    expect((view.getColumn(0) as { visible?: boolean }).visible).toBe(false);
    toggleCheckbox(miniSheet, 1, true);
    expect(sheet.getColumnVisible(0)).toBe(true);
    expect((view.getColumn(0) as { visible?: boolean }).visible).toBe(true);
  });
  it('hides and shows every field through the view-name row checkbox', async () => {
    const { sheet, miniSheet } = await makePanel();
    toggleCheckbox(miniSheet, 0, false);
    expect([0, 1, 2, 3].every(col => !sheet.getColumnVisible(col))).toBe(true);
    expect(miniSheet.getValue(0, 0)).toBe(false);
    toggleCheckbox(miniSheet, 0, true);
    expect([0, 1, 2, 3].every(col => sheet.getColumnVisible(col))).toBe(true);
  });
  it('offsets sheet columns by the group column count', async () => {
    const { sheet, miniSheet } = await makePanel();
    sheet.groupBy([{ field: 'city' }]);
    // after grouping: [city group col, name, city, score, total]; mini row 2 is "City"
    expect(miniSheet.getRowCount()).toBe(5);
    toggleCheckbox(miniSheet, 2, false);
    expect(sheet.getColumnVisible(1 + 1)).toBe(false);
    expect(sheet.getColumnVisible(0)).toBe(true);
  });
  it('retains a hidden field through sorting, grouping, and field reordering', async () => {
    const { sheet, view, miniSheet } = await makePanel();
    const baseColumns = (): { value?: string }[] => view.getColumn() as unknown as { value?: string }[];
    const indexOf = (field: string): number => baseColumns().findIndex(column => column.value === field);
    toggleCheckbox(miniSheet, 1, false); // hide "name"
    expect(sheet.getColumnVisible(indexOf('name'))).toBe(false);
    sheet.sort([{ field: 'name', ascending: true }]);
    expect(sheet.getColumnVisible(indexOf('name'))).toBe(false);
    sheet.groupBy([{ field: 'city' }]);
    const groupOffset = (sheet as unknown as { _groupColumnCount(): number })._groupColumnCount();
    expect(sheet.getColumnVisible(groupOffset + indexOf('name'))).toBe(false);
    view._moveColumn(1, 3); // move "city" to the end; "name" shifts to base index 0
    expect(sheet.getColumnVisible(groupOffset + indexOf('name'))).toBe(false);
    expect(sheet.getColumnVisible(groupOffset + indexOf('score'))).toBe(true);
  });
});

describe('TableSheetPanel control discoverability and select-all semantics (TASK 49 item 1)', () => {
  // Trial evidence: .probe/api-sweep-item1.json, .probe/api-sweep-item1b.json.
  it('exposes the mini-workbook through GC.Spread.Sheets.findControl on the field panel', async () => {
    const { host, panel, mini } = await makePanel();
    const fieldPanel = host.querySelector<HTMLDivElement>('.gc-table-sheet-field-panel')!;
    expect(GC.Spread.Sheets.findControl(fieldPanel)).toBe(mini);
    // The panel's outer host is not a workbook host (trial: findControl(host) -> undefined).
    expect(GC.Spread.Sheets.findControl(host)).toBeUndefined();
    panel.destroy();
    // After destroy the field panel answers undefined again (trial afterDestroy: undefined).
    expect(GC.Spread.Sheets.findControl(fieldPanel)).toBeUndefined();
  });
  it('keeps the view-name checkbox checked while any field remains visible (trial select-all semantics)', async () => {
    const { sheet, miniSheet } = await makePanel();
    toggleCheckbox(miniSheet, 1, false);
    expect(miniSheet.getValue(0, 0)).toBe(true); // hiding one field keeps the header checkbox checked
    toggleCheckbox(miniSheet, 2, false);
    toggleCheckbox(miniSheet, 3, false);
    toggleCheckbox(miniSheet, 4, false);
    expect(miniSheet.getValue(0, 0)).toBe(false); // every field hidden -> unchecked
    toggleCheckbox(miniSheet, 0, true);
    expect([0, 1, 2, 3].map(col => sheet.getColumnVisible(col)).every(Boolean)).toBe(true);
  });
  it('starts a field drag only on the caption column, never on the checkbox column', async () => {
    const { sheet, host } = await makePanel();
    const canvas = host.querySelector<HTMLCanvasElement>('.gc-table-sheet-field-panel canvas')!;
    canvas.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, width: 280, height: 100, right: 280, bottom: 100 } as DOMRect);
    const list = host.querySelector('.gc-table-sheet-group-list')!;
    const fire = (el: EventTarget, type: string, x: number, y: number, buttons: number) =>
      el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, buttons }));
    // Mousedown inside the 28 px checkbox column: reference toggles the checkbox there,
    // it never drags the field.
    fire(canvas, 'mousedown', 14, 2 * 20 + 10, 1);
    fire(document, 'mousemove', 14, 2 * 20 + 30, 1);
    fire(list, 'mouseup', 100, 40, 0);
    fire(document, 'mouseup', 100, 40, 0);
    expect(sheet.groupBy().length).toBe(0);
  });
});

describe('TableSheetPanel groups', () => {
  it('adds a group when a field row is dragged onto the group list (mouse-driven)', async () => {
    const { sheet, host, miniSheet } = await makePanel();
    // Give the mini canvas non-zero geometry, then drag row 2 ("City").
    const canvas = host.querySelector<HTMLCanvasElement>('.gc-table-sheet-field-panel canvas')!;
    canvas.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, width: 280, height: 100, right: 280, bottom: 100 } as DOMRect);
    const list = host.querySelector('.gc-table-sheet-group-list')!;
    const fire = (el: EventTarget, type: string, x: number, y: number, buttons: number) =>
      el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, buttons }));
    fire(canvas, 'mousedown', 40, 2 * 20 + 10, 1);
    fire(document, 'mousemove', 40, 2 * 20 + 30, 1);
    fire(list, 'mouseup', 100, 40, 0);
    fire(document, 'mouseup', 100, 40, 0);
    expect(sheet.groupBy().map(group => group.field)).toEqual(['city']);
    void miniSheet;
  });
  it('renders group items with labels, selection and remove buttons', async () => {
    const { sheet, host } = await makePanel();
    sheet.groupBy([{ field: 'city', caption: 'City' }, { field: 'name' }]);
    const items = host.querySelectorAll('.gc-table-sheet-group-item');
    expect(items.length).toBe(2);
    expect(items[0]!.className).toContain('selected');
    expect(items[0]!.getAttribute('role')).toBe('option');
    expect(items[0]!.getAttribute('aria-label')).toBe('City');
    expect(items[0]!.querySelector('.gc-table-sheet-group-item-label')!.textContent).toBe('City');
    expect(items[1]!.querySelector('.gc-table-sheet-group-item-label')!.textContent).toBe('name');
    expect(host.querySelector('.gc-table-sheet-group-tip')).toBeNull();
    const remove = items[1]!.querySelector('.gc-table-sheet-group-item-remove')! as HTMLElement;
    expect(remove.getAttribute('aria-label')).toBe('Remove');
    remove.click();
    expect(sheet.groupBy().map(group => group.field)).toEqual(['city']);
  });
  it('selects the clicked group and moves keyboard selection with the arrows', async () => {
    const { sheet, host } = await makePanel();
    sheet.groupBy([{ field: 'city' }, { field: 'name' }]);
    const items = host.querySelectorAll<HTMLElement>('.gc-table-sheet-group-item');
    items[1]!.click();
    expect(host.querySelectorAll('.gc-table-sheet-group-item')[1]!.className).toContain('selected');
    expect(host.querySelector('.gc-table-sheet-summary-label')!.textContent).toBe('name');
    items[1]!.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowUp' }));
    expect(host.querySelectorAll('.gc-table-sheet-group-item')[0]!.className).toContain('selected');
  });
  it('removes a group dragged onto the panel background', async () => {
    const { sheet, host } = await makePanel();
    sheet.groupBy([{ field: 'city' }]);
    const canvas = host.querySelector('.gc-table-sheet-field-panel canvas')!;
    canvas.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, width: 280, height: 100, right: 280, bottom: 100 } as DOMRect);
    const item = host.querySelector<HTMLElement>('.gc-table-sheet-group-item')!;
    const fire = (el: EventTarget, type: string, x: number, y: number, buttons: number) =>
      el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, buttons }));
    fire(item, 'mousedown', 40, 5, 1);
    fire(document, 'mousemove', 40, 60, 1);
    fire(host, 'mouseup', 40, 100, 0);
    fire(document, 'mouseup', 40, 100, 0);
    expect(sheet.groupBy()).toEqual([]);
  });
  it('does not apply a cancelled drag to a later drop', async () => {
    const { sheet, host } = await makePanel();
    sheet.groupBy([{ field: 'city' }]);
    const item = host.querySelector('.gc-table-sheet-group-item')!;
    item.dispatchEvent(new Event('dragstart'));
    item.dispatchEvent(new Event('dragend'));
    host.dispatchEvent(new Event('drop', { bubbles: true, cancelable: true }));
    expect(sheet.groupBy().map(group => group.field)).toEqual(['city']);
  });
  it('refreshes group items when the sheet API changes groups', async () => {
    const { sheet, host } = await makePanel();
    sheet.groupBy([{ field: 'city', caption: 'Location' }]);
    expect(host.querySelector('.gc-table-sheet-group-item-label')!.textContent).toBe('Location');
    sheet.removeGroupBy();
    expect(host.querySelectorAll('.gc-table-sheet-group-item').length).toBe(0);
    expect(host.querySelector('.gc-table-sheet-group-tip')!.textContent).toBe('Drag here to set row groups');
  });
  it('renames a group through the hidden editor and commits on blur', async () => {
    const { sheet, host } = await makePanel();
    sheet.groupBy([{ field: 'city' }]);
    const item = host.querySelector('.gc-table-sheet-group-item')!;
    item.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    const input = host.querySelector<HTMLInputElement>('.gc-table-sheet-group-input')!;
    expect(input.getAttribute('aria-label')).toBe('Group Name');
    expect(input.value).toBe('city');
    input.value = 'Location';
    input.dispatchEvent(new FocusEvent('blur'));
    expect(sheet.groupBy()).toEqual([{ field: 'city', caption: 'Location' }]);
  });
});

describe('TableSheetPanel summary editor', () => {
  it('shows the selected group field and its summary rows with caption fallback', async () => {
    const { sheet, host } = await makePanel();
    sheet.groupBy([{ field: 'city', summaryFields: [{ formula: '=SUM([score])', relateTo: 'score' }] }]);
    expect(host.querySelector('.gc-table-sheet-summary-label')!.textContent).toBe('city');
    expect(host.querySelectorAll('.gc-table-sheet-summary-item').length).toBe(1);
    const item = host.querySelector('.gc-table-sheet-summary-item')!;
    expect([...item.querySelectorAll('span.gc-table-sheet-summary-item-label')].map(s => s.textContent)).toEqual(['Formula', 'Caption', 'Slice']);
    const inputs = item.querySelectorAll<HTMLInputElement>('input');
    expect(inputs[0]!.value).toBe('=SUM([score])');
    expect(inputs[1]!.value).toBe('=SUM([score])'); // caption falls back to the formula
    expect(inputs[2]!.value).toBe('');
    expect(item.querySelector('.gc-table-sheet-summary-item-remove-icon')!.getAttribute('title')).toBe('Remove');
  });
  it('adds a summary through the header button and commits it on change', async () => {
    const { sheet, host } = await makePanel();
    sheet.groupBy([{ field: 'city' }]);
    (host.querySelector('.gc-table-sheet-summary-function')! as HTMLElement).click();
    expect(host.querySelectorAll('.gc-table-sheet-summary-item').length).toBe(1);
    expect(sheet.groupBy()[0]!.summaryFields).toBeUndefined(); // empty drafts stay out of the model
    const formula = host.querySelectorAll<HTMLInputElement>('.gc-table-sheet-summary-item-input-formula')[0]!;
    formula.value = '=COUNT([name])';
    formula.dispatchEvent(new Event('change'));
    expect(sheet.groupBy()[0]!.summaryFields).toEqual([{ formula: '=COUNT([name])', caption: '=COUNT([name])' }]);
  });
  it('updates caption and slice of an existing summary', async () => {
    const { sheet, host } = await makePanel();
    sheet.groupBy([{ field: 'city', summaryFields: [{ formula: '=SUM([score])' }] }]);
    const read = (n: number): HTMLInputElement =>
      host.querySelectorAll<HTMLInputElement>('.gc-table-sheet-summary-item input')[n]!;
    read(1).value = 'Total score';
    read(1).dispatchEvent(new Event('change'));
    read(2).value = 'score';
    read(2).dispatchEvent(new Event('change'));
    expect(sheet.groupBy()[0]!.summaryFields).toEqual([{ formula: '=SUM([score])', caption: 'Total score', slice: 'score' }]);
  });
  it('removes a single summary item and all summaries', async () => {
    const { sheet, host } = await makePanel();
    sheet.groupBy([{ field: 'city', summaryFields: [{ formula: '=SUM([score])' }, { formula: '=COUNT([name])' }] }]);
    (host.querySelector('.gc-table-sheet-summary-item-remove-icon')! as HTMLElement).click();
    expect(sheet.groupBy()[0]!.summaryFields).toEqual([{ formula: '=COUNT([name])' }]);
    (host.querySelector('.gc-table-sheet-summary-remove')! as HTMLElement).click();
    expect(sheet.groupBy()[0]!.summaryFields).toEqual([]);
  });
  it('switches the summary editor with the selected group', async () => {
    const { sheet, host } = await makePanel();
    sheet.groupBy([{ field: 'city', summaryFields: [{ formula: '=SUM([score])' }] }, { field: 'name' }]);
    expect(host.querySelectorAll('.gc-table-sheet-summary-item').length).toBe(1);
    host.querySelectorAll<HTMLElement>('.gc-table-sheet-group-item')[1]!.click();
    expect(host.querySelector('.gc-table-sheet-summary-label')!.textContent).toBe('name');
    expect(host.querySelectorAll('.gc-table-sheet-summary-item').length).toBe(0);
  });
  it('is empty when no group exists', async () => {
    const { host } = await makePanel();
    expect(host.querySelector('.gc-table-sheet-summary-header')).toBeNull();
  });
});

describe('TableSheetPanel lifecycle', () => {
  it('registers the panel so findControl resolves it by host element and by host id', async () => {
    const { host, panel } = await makePanel();
    host.id = 'panel-lookup';
    expect(TableSheetPanel.findControl(host)).toBe(panel);
    expect(TableSheetPanel.findControl('panel-lookup')).toBe(panel);
    panel.destroy();
    // Trial: after destroy the class-level findControl returns null (probe findControlHosts
    // scenario, .probe/tablesheet-comparison.json; the namespace GC.Spread.Sheets.findControl
    // for the panel host stays undefined, item1b).
    expect(TableSheetPanel.findControl('panel-lookup')).toBeNull();
  });
  it('tracks a replacement data view and stops observing the previous view', async () => {
    const { workbook, sheet, view, host, panel, miniSheet } = await makePanel();
    expect(miniSheet.getValue(0, 1)).toBe('People');
    const other = workbook.dataManager().addTable('other', { data: [{ qty: 1 }] }).addView('Stock', ['qty']);
    await other.fetch();
    sheet.setDataView(other);
    const mini2 = (panel as unknown as { _miniWorkbook(): InstanceType<typeof Workbook> })._miniWorkbook();
    expect(mini2).toBeTruthy();
    expect(mini2.getActiveSheet().getValue(0, 1)).toBe('Stock');
    expect(mini2.getActiveSheet().getValue(1, 1)).toMatchObject({ text: 'qty' });
    panel.detach();
    sheet.setDataView(view);
    expect(host.childElementCount).toBe(0);
    panel.destroy();
    expect(TableSheetPanel.findControl(host)).toBeNull();
  });
  it('sizes the three regions at 40% / 30% / 30%-10 of the panel height', async () => {
    const { host, panel } = await makePanel();
    const root = host.querySelector('.gc-table-sheet-panel')!;
    // jsdom reports no layout, so the panel falls back to the reference 500 px height.
    expect(root.querySelector('.gc-table-sheet-field-container')!.getAttribute('style')).toContain('height: 200px');
    expect(root.querySelector('.gc-table-sheet-group-panel')!.getAttribute('style')).toContain('height: 150px');
    expect(root.querySelector('.gc-table-sheet-summary-container')!.getAttribute('style')).toContain('height: 140px');
    panel.destroy();
  });
  it('hides regions according to fieldAreaVisible and groupAreaVisible', async () => {
    const a = await makePanel({ fieldAreaVisible: false });
    const fieldHidden = a.host.querySelector<HTMLElement>('.gc-table-sheet-field-container')!;
    expect(fieldHidden.style.display).toBe('none');
    expect(a.host.querySelector('.gc-table-sheet-group-panel')!.getAttribute('style')).toContain('height: 250px');
    a.panel.destroy();
    const b = await makePanel({ groupAreaVisible: false });
    expect(b.host.querySelector<HTMLElement>('.gc-table-sheet-group-panel')!.style.display).toBe('none');
    expect(b.host.querySelector('.gc-table-sheet-field-container')!.getAttribute('style')).toContain('height: 500px');
    b.panel.destroy();
  });
});

describe('TableSheetPanel calculated field creation', () => {
  it('adds a calculated view column when a formula is typed into the new "+" row', async () => {
    const { sheet, view, host, miniSheet } = await makePanel();
    (host.querySelector('.gc-table-sheet-add-calculate-column')! as HTMLElement).click();
    expect(miniSheet.getRowCount()).toBe(6);
    miniSheet.setValue(5, 1, '=MAX([@score])');
    (miniSheet as unknown as { _emit(type: string, info: unknown): void })._emit(Events.ValueChanged,
      { sheet: miniSheet, sheetName: miniSheet.name(), row: 5, col: 1, oldValue: null, newValue: '=MAX([@score])' });
    expect((view.getColumn() as unknown as { value?: string }[]).map(column => String(column.value)).includes('=MAX([@score])')).toBe(true);
    expect(miniSheet.getRowCount()).toBe(6); // 1 view row + 5 fields again
    void sheet;
  });
});
