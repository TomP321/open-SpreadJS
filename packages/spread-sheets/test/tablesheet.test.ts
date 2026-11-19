import { describe, expect, it } from 'vitest';
import GC from '../src/index.js';
import { drawTableSheetHeaders } from '../src/tablesheet/rendering.js';
import { WorkbookRenderer } from '../src/rendering.js';

async function fixture() {
  const workbook = new GC.Spread.Sheets.Workbook(undefined, { sheetCount: 0 });
  const table = workbook.dataManager().addTable('people', {
    data: [{ id: '1', name: 'Ada' }, { id: '2', name: 'Ben' }],
    schema: { columns: { id: { dataType: 'number' }, name: { dataType: 'string' } } },
  });
  const view = table.addView('v', [{ value: 'id', caption: 'Identifier', width: 90 }, 'name']);
  const sheet = workbook.addSheetTab(0, 'Data', GC.Spread.Sheets.SheetType.tableSheet) as InstanceType<
    typeof GC.Spread.Sheets.TableSheet.TableSheet>;
  sheet.setDataView(view);
  await view.fetch();
  return { workbook, sheet, view };
}

describe('TableSheet', () => {
  it('allocates an insertion between filtered root siblings using their source order', async () => {
    const workbook = new GC.Spread.Sheets.Workbook(undefined, { sheetCount: 0 });
    const data = [
      { id: 1, parent: null, order: 0, city: 'Rome' },
      { id: 2, parent: null, order: 1, city: 'Paris' },
      { id: 3, parent: null, order: 2, city: 'Rome' },
    ];
    const table = workbook.dataManager().addTable('tree', { data, schema: {
      hierarchy: { type: 'Parent', column: 'parent' },
      columns: { id: { isPrimaryKey: true }, order: { dataType: 'rowOrder' } },
    } });
    const view = table.addView('tree', ['id', 'city']);
    await view.fetch();
    const sheet = workbook.addSheetTab(0, 'Tree', GC.Spread.Sheets.SheetType.tableSheet) as InstanceType<
      typeof GC.Spread.Sheets.TableSheet.TableSheet>;
    sheet.setDataView(view);
    const filters = [{ field: 'city', values: [{ value: 'Rome' }] }];
    sheet.filter(filters);
    sheet.addHierarchyItemAfter(0, { id: 4, city: 'Rome' });
    expect(data.map(row => row.id)).toEqual([1, 2, 4, 3]);
    expect(data.find(row => row.id === 4)).toMatchObject({ parent: null, order: 0.5 });
    expect(Array.from({ length: view.visibleLength() }, (_, i) => view.getRowData(i))).toEqual([
      { id: 1, city: 'Rome' }, {}, { id: 3, city: 'Rome' },
    ]);
    sheet.filter(filters);
    expect(Array.from({ length: view.visibleLength() }, (_, i) => view.getRowData(i).id)).toEqual([1, 4, 3]);
    workbook.destroy();
  });
  it('restores value filters from trial row-filter metadata', async () => {
    const { workbook, sheet } = await fixture();
    sheet.filter([{ field: 'name', values: [{ value: 'Ada' }] }]);
    const json = JSON.parse(JSON.stringify(workbook.toJSON({ includeBindingSource: true })));
    delete json.sheetTabs.Data.addition.filters;
    const restored = new GC.Spread.Sheets.Workbook(undefined, { sheetCount: 0 });
    await restored.fromJSON(json);
    const imported = restored.getSheetTab('Data') as typeof sheet;
    expect(imported.filter()).toEqual([{ field: 'name', values: [{ value: 'Ada', type: 'value' }] }]);
    expect(imported.getDataView().visibleLength()).toBe(1);
    expect(imported.getDataView().getRowData(0).name).toBe('Ada');
    restored.destroy();
    workbook.destroy();
  });
  it('maps trial filter columns past group columns on import', async () => {
    const { workbook, sheet } = await fixture();
    sheet.groupBy([{ field: 'id' }]);
    sheet.filter([{ field: 'name', values: [{ value: 'Ada' }] }]);
    const json = JSON.parse(JSON.stringify(workbook.toJSON({ includeBindingSource: true })));
    delete json.sheetTabs.Data.addition.filters;
    const restored = new GC.Spread.Sheets.Workbook(undefined, { sheetCount: 0 });
    await restored.fromJSON(json);
    const imported = restored.getSheetTab('Data') as typeof sheet;
    expect(imported.filter()).toEqual([{ field: 'name', values: [{ value: 'Ada', type: 'value' }] }]);
    expect(imported.getDataView().visibleLength()).toBe(1);
    restored.destroy();
    workbook.destroy();
  });
  it('applies template cell states to current and subsequently added rows', async () => {
    const { workbook, sheet } = await fixture();
    workbook.namedCellTemplates.add('state', {
      cellStates: [{ state: GC.Spread.Sheets.CellStatesType.hover, style: { backColor: 'red' } }],
    });
    sheet.applyNamedCellTemplate('state', ['name']);
    expect(sheet.cellStates._at(0, 1)).toEqual([{ state: 1, style: { backColor: 'red' } }]);
    const renderer = { sheet, styleCache: new Map(), hoverCell: { row: 0, col: 1 } };
    const style = WorkbookRenderer.prototype.style.call(renderer as unknown as WorkbookRenderer, 0, 1);
    expect(style.backColor).toBe('red');
    await sheet.addRow({ id: 3, name: 'Cara' });
    expect(sheet.cellStates._at(2, 1)).toEqual([{ state: 1, style: { backColor: 'red' } }]);
    workbook.namedCellTemplates.add('plain', {});
    sheet.applyNamedCellTemplate('plain', ['name']);
    expect(sheet.cellStates._at(0, 1)).toEqual([]);
    workbook.destroy();
  });
  it('captures cell states when creating a named template', async () => {
    const { workbook } = await fixture();
    const sheet = new GC.Spread.Sheets.Worksheet();
    const range = new GC.Spread.Sheets.Range(1, 2, 2, 2);
    sheet.cellStates.add(range, GC.Spread.Sheets.CellStatesType.hover, { backColor: 'red' });
    const json = sheet.toJSON();
    expect(json.cellStates).toEqual({ 1: { 3: [{ range: { row: 1, col: 2, rowCount: 2, colCount: 2 },
      style: { backColor: 'red' } }] } });
    const restored = new GC.Spread.Sheets.Worksheet();
    restored.fromJSON(json);
    expect(restored.cellStates._at(1, 2)).toEqual([{ state: 1, style: { backColor: 'red' } }]);
    workbook.namedCellTemplates.createFromCell('state', sheet, 1, 2);
    expect(workbook.namedCellTemplates.get('state')).toEqual({
      name: 'state', cellStates: [{ state: GC.Spread.Sheets.CellStatesType.hover, style: { backColor: 'red' } }],
    });
    sheet.cellStates.clear(new GC.Spread.Sheets.Range(1, 2, 1, 1));
    workbook.namedCellTemplates.createFromCell('cleared', sheet, 1, 2);
    expect(workbook.namedCellTemplates.get('cleared')).toEqual({ name: 'cleared' });
    workbook.namedCellTemplates.createFromCell('remaining', sheet, 2, 2, { cellState: false });
    expect(workbook.namedCellTemplates.get('remaining')).toEqual({ name: 'remaining' });
    workbook.destroy();
  });
  it('orders a new child after filtered-out siblings', async () => {
    const workbook = new GC.Spread.Sheets.Workbook(undefined, { sheetCount: 0 });
    const data = [
      { id: 1, parent: null as number | null, order: 0, city: 'Rome' },
      { id: 2, parent: 1, order: 1, city: 'Rome' },
      { id: 3, parent: 1, order: 2, city: 'Paris' },
      { id: 4, parent: null, order: 3, city: 'Rome' },
    ];
    const table = workbook.dataManager().addTable('tree', { data, schema: {
      hierarchy: { type: 'Parent', column: 'parent' },
      columns: { id: { isPrimaryKey: true }, order: { dataType: 'rowOrder' } },
    } });
    const view = table.addView('tree', ['id', 'city']);
    await view.fetch();
    const sheet = workbook.addSheetTab(0, 'Tree', GC.Spread.Sheets.SheetType.tableSheet) as InstanceType<
      typeof GC.Spread.Sheets.TableSheet.TableSheet>;
    sheet.setDataView(view);
    sheet.filter([{ field: 'city', values: [{ value: 'Rome' }] }]);
    expect(Array.from({ length: view.visibleLength() }, (_, i) => view.getRowData(i).id)).toEqual([1, 2, 3, 4]);
    sheet.addHierarchyItemBelow(0, { id: 5, city: 'Rome' });
    expect(data.find(row => row.id === 5)).toMatchObject({ parent: 1, order: 2.5 });
    expect(Array.from({ length: view.visibleLength() }, (_, i) => view.getRowData(i).id)).toEqual([1, 2, 3, undefined, 4]);
    sheet.filter([{ field: 'city', values: [{ value: 'Rome' }] }]);
    expect(Array.from({ length: view.visibleLength() }, (_, i) => view.getRowData(i).id)).toEqual([1, 2, 3, 5, 4]);
    sheet.filter([{ field: 'city', values: [{ value: 'Paris' }] }]);
    expect(Array.from({ length: view.visibleLength() }, (_, i) => view.getRowData(i).id)).toEqual([1, 3]);
    workbook.destroy();
  });
  it('retains visible hierarchy rows after promotion until the filter is reapplied', async () => {
    const workbook = new GC.Spread.Sheets.Workbook(undefined, { sheetCount: 0 });
    const data = [
      { id: 1, parent: null as number | null, order: 0, city: 'Rome' },
      { id: 2, parent: 1, order: 1, city: 'Paris' },
      { id: 3, parent: 1, order: 2, city: 'Rome' },
      { id: 4, parent: 1, order: 3, city: 'Paris' },
    ];
    const table = workbook.dataManager().addTable('tree', { data, schema: {
      hierarchy: { type: 'Parent', column: 'parent' },
      columns: { id: { isPrimaryKey: true }, order: { dataType: 'rowOrder' } },
    } });
    const view = table.addView('tree', [{ value: 'id', outlineColumn: true }, 'city']);
    await view.fetch();
    const sheet = workbook.addSheetTab(0, 'Tree', GC.Spread.Sheets.SheetType.tableSheet) as InstanceType<
      typeof GC.Spread.Sheets.TableSheet.TableSheet>;
    sheet.setDataView(view);
    const filter = [{ field: 'city', values: [{ value: 'Rome' }] }];
    sheet.filter(filter);
    sheet.promoteHierarchyLevel(1);
    expect(Array.from({ length: view.visibleLength() }, (_, row) => view.getRowData(row).id)).toEqual([1, 2, 3, 4]);
    sheet.filter(filter);
    expect(Array.from({ length: view.visibleLength() }, (_, row) => view.getRowData(row).id)).toEqual([1, 2, 3]);
    workbook.destroy();
  });
  it('leaves a custom hierarchy unchanged when it has no unparse callback', async () => {
    const workbook = new GC.Spread.Sheets.Workbook(undefined, { sheetCount: 0 });
    const data = [{ id: 1, parent: null, order: 0 }, { id: 2, parent: 1, order: 1 }];
    const table = workbook.dataManager().addTable('tree', { data, schema: {
      hierarchy: { type: 'Custom', column: 'parent', parse: ({ data: row }) => row.parent },
      columns: { id: { isPrimaryKey: true }, parent: {}, order: { dataType: 'rowOrder' } },
    } });
    const view = table.addView('tree', ['id']);
    await view.fetch();
    const sheet = workbook.addSheetTab(0, 'Tree', GC.Spread.Sheets.SheetType.tableSheet) as InstanceType<
      typeof GC.Spread.Sheets.TableSheet.TableSheet>;
    sheet.setDataView(view);
    for (const method of ['addHierarchyItemBefore', 'addHierarchyItemAfter', 'addHierarchyItemAbove',
      'addHierarchyItemBelow'] as const) sheet[method](1, { id: 3 });
    for (const method of ['promoteHierarchyLevel', 'demoteHierarchyLevel', 'moveUp', 'moveDown'] as const) sheet[method](1);
    expect(data).toEqual([{ id: 1, parent: null, order: 0 }, { id: 2, parent: 1, order: 1 }]);
    expect(view.visibleLength()).toBe(2);
    workbook.destroy();
  });
  it('restores a bound TableSheet, its free header, and view settings from workbook JSON', async () => {
    const { workbook, sheet } = await fixture();
    const header = new GC.Spread.Sheets.Worksheet();
    header.setRowCount(1);
    header.setValue(0, 0, 'People');
    sheet.applyFreeHeaderArea(header.toJSON());
    sheet.sort([{ field: 'id', ascending: false }]);
    const json = workbook.toJSON({ includeBindingSource: true });
    expect(json.sheetTabs).toHaveProperty('Data');
    expect(json.dataManager).toMatchObject({ tables: [{ name: 'people', views: [{ name: 'v', indexMap: [1, 0] }] }] });
    expect(json.sheetTabs).toMatchObject({ Data: {
      data: { dataTable: { 0: { 1: { value: 'Ben' } }, 1: { 1: { value: 'Ada' } } } },
      colHeaderData: { dataTable: { 0: { 0: { value: 'People' } } } },
      columns: [{ name: 'id' }, { name: 'name' }],
      rowFilter: { sortMap: { '-1': { 0: { index: 0, ascending: false } } }, multiSortOrder: [0] },
    } });
    const restored = new GC.Spread.Sheets.Workbook(undefined, { sheetCount: 0 });
    await restored.fromJSON(JSON.parse(JSON.stringify(json)));
    const tab = restored.getSheetFromName('Data') as typeof sheet;
    expect(tab).toBeInstanceOf(GC.Spread.Sheets.TableSheet.TableSheet);
    expect(tab.getDataView().visibleLength()).toBe(2);
    expect(tab.getValue(0, 1)).toBe('Ben');
    expect(tab.getValue(0, 0, 1)).toBe('People');
    expect(tab.sort()).toEqual([{ field: 'id', ascending: false }]);
    workbook.destroy();
    restored.destroy();
  });
  it('accepts trial dimension metadata when loading a workbook', async () => {
    const { workbook } = await fixture();
    const json = workbook.toJSON({ includeBindingSource: true }) as {
      sheetTabs: Record<string, { defaults: Record<string, unknown> }>;
    };
    json.sheetTabs.Data.defaults = { rowHeight: 30, colWidth: 62, colHeaderRowHeight: 30,
      rowHeaderColWidth: 40, _isExcelDefaultColumnWidth: false };
    const restored = new GC.Spread.Sheets.Workbook(undefined, { sheetCount: 0 });
    await restored.fromJSON(json);
    const sheet = restored.getSheetTab('Data') as InstanceType<typeof GC.Spread.Sheets.TableSheet.TableSheet>;
    expect(sheet.getDataView().getRowData(0).name).toBe('Ada');
    restored.destroy();
    workbook.destroy();
  });
  it('restores sorting from trial view metadata', async () => {
    const { workbook, sheet } = await fixture();
    sheet.sort([{ field: 'id', ascending: false }]);
    const json = workbook.toJSON({ includeBindingSource: true }) as {
      sheetTabs: Record<string, { addition: { sorts?: unknown } }>;
      dataManager: { tables: { views: { sortInfo?: unknown }[] }[] };
    };
    delete json.sheetTabs.Data.addition.sorts;
    expect(json.dataManager.tables[0]!.views[0]!.sortInfo).toEqual([{ field: 'id', ascending: false }]);
    const restored = new GC.Spread.Sheets.Workbook(undefined, { sheetCount: 0 });
    await restored.fromJSON(json);
    const tab = restored.getSheetTab('Data') as typeof sheet;
    expect(tab.sort()).toEqual([{ field: 'id', ascending: false }]);
    expect(tab.getValue(0, 1)).toBe('Ben');
    restored.destroy();
    workbook.destroy();
  });
  it('applies a named style template to matching bound fields', async () => {
    const { workbook, sheet } = await fixture();
    const template = { style: { backColor: '#ffe080', foreColor: '#202020' } };
    workbook.namedCellTemplates.add('highlight', template);
    sheet.applyNamedCellTemplate('highlight', ['name', 'missing']);
    template.style.backColor = 'red';
    expect(sheet.getActualStyle(0, 1).backColor).toBe('#ffe080');
    expect(sheet.getActualStyle(0, 1).foreColor).toBe('#202020');
    expect(sheet.getActualStyle(0, 0).backColor).not.toBe('#ffe080');
    workbook.destroy();
  });
  it('applies named validation and conditional formatting to bound columns', async () => {
    const { workbook, sheet } = await fixture();
    workbook.namedCellTemplates.add('rules', {
      conditionalFormats: [{ ruleType: 1, operator: 0, value1: 2, style: { backColor: 'red' } }],
      dataValidations: [{ type: 1, errorTitle: 'Invalid' }],
    });
    sheet.applyNamedCellTemplate('rules', ['id']);
    expect(sheet.conditionalFormats.getRules(0, 0)).toHaveLength(1);
    expect(sheet.conditionalFormats.getRules(0, 1)).toHaveLength(0);
    expect(sheet.getDataValidator(0, 0)).not.toBeNull();
    expect(sheet.getDataValidator(0, 1)).toBeNull();
    workbook.destroy();
  });
  it('extends template rules and validation to rows added after application', async () => {
    const { workbook, sheet } = await fixture();
    workbook.namedCellTemplates.add('rules', {
      conditionalFormats: [{ ruleType: 1, operator: 0, value1: 2, style: { backColor: 'red' } }],
      dataValidations: [{ type: 1, errorTitle: 'Invalid' }],
    });
    sheet.applyNamedCellTemplate('rules', ['id']);
    await sheet.addRow({ id: 3, name: 'Cleo' });
    expect(sheet.conditionalFormats.getRules(2, 0)).toHaveLength(1);
    expect(sheet.getDataValidator(2, 0)).not.toBeNull();
    sheet.applyNamedCellTemplate('rules', ['id']);
    expect(sheet.conditionalFormats.getRules(2, 0)).toHaveLength(1);
    workbook.destroy();
  });
  it('preserves the named template registry in workbook JSON', async () => {
    const { workbook } = await fixture();
    workbook.namedCellTemplates.add('highlight', { style: { backColor: 'red' } });
    const json = workbook.toJSON();
    expect(json.namedCellTemplates).toEqual({ highlight: { name: 'highlight', style: { backColor: 'red' } } });
    const restored = new GC.Spread.Sheets.Workbook();
    await restored.fromJSON(json);
    expect(restored.namedCellTemplates.get('highlight')).toEqual({ name: 'highlight', style: { backColor: 'red' } });
    workbook.destroy();
    restored.destroy();
  });
  it('restores named templates applied to bound fields after a workbook round trip', async () => {
    const { workbook, sheet } = await fixture();
    workbook.namedCellTemplates.add('highlight', { style: { backColor: '#ffe080' } });
    sheet.applyNamedCellTemplate('highlight', ['name']);
    const json = JSON.parse(JSON.stringify(workbook.toJSON({ includeBindingSource: true })));
    const restored = new GC.Spread.Sheets.Workbook(undefined, { sheetCount: 0 });
    await restored.fromJSON(json);
    const tab = restored.getSheetFromName('Data') as typeof sheet;
    expect(tab.getActualStyle(0, 1).backColor).toBe('#ffe080');
    await tab.addRow({ id: 3, name: 'Cleo' });
    expect(tab.getActualStyle(2, 1).backColor).toBe('#ffe080');
    workbook.destroy();
    restored.destroy();
  });
  it('applies a worksheet as the free header above the field captions', async () => {
    const { sheet } = await fixture();
    const header = new GC.Spread.Sheets.Worksheet();
    header.setRowCount(2);
    header.setValue(0, 0, 'Summary');
    header.setValue(1, 1, 'Details');
    header.setRowHeight(0, 45);
    header.addSpan(0, 0, 1, 2);
    sheet.applyFreeHeaderArea(header.toJSON());
    expect(sheet.getRowCount(1)).toBe(3);
    expect(sheet.getValue(0, 0, 1)).toBe('Summary');
    expect(sheet.getValue(1, 1, 1)).toBe('Details');
    expect(sheet.getValue(2, 0, 1)).toBe('Identifier');
    expect(sheet.getRowHeight(0, 1)).toBe(45);
    expect(sheet.getSpan(0, 0, 1)?.colCount).toBe(2);
    expect(sheet.applyFreeHeaderArea()).toMatchObject({ rowCount: 2, columnCount: 2 });
  });
  it('paints a merged free header using the anchor and full span dimensions', async () => {
    const { sheet } = await fixture();
    const header = new GC.Spread.Sheets.Worksheet();
    header.setRowCount(2);
    header.setValue(0, 0, 'Merged');
    header.addSpan(0, 0, 2, 2);
    sheet.applyFreeHeaderArea(header.toJSON());
    sheet.setColumnWidth(1, 64);
    const text: unknown[][] = [];
    const context = new Proxy({} as CanvasRenderingContext2D, {
      get(_target, key) {
        if (key === 'fillText') return (...args: unknown[]) => text.push(args);
        return () => undefined;
      },
      set: () => true,
    });
    const renderer = { sheet, zoom: 1, headerHeight: 90, headerWidth: 40, rows: [], cols: [
      { index: 0, position: 40, size: 90, min: 40, max: 130 },
      { index: 1, position: 130, size: 64, min: 130, max: 194 },
    ] } as unknown as WorkbookRenderer;
    drawTableSheetHeaders(renderer, context);
    const labels = text.filter(args => args[0] === 'Merged');
    expect(labels).toEqual([['Merged', 117, 30], ['Merged', 117, 30]]);
  });
  it.each([
    ['addHierarchyItemAbove', ['1', '1.1', '1.2', '1.2.1', '1.2.1.1', '2']],
    ['promoteHierarchyLevel', ['1', '1.1', '2', '2.1', '3']],
    ['demoteHierarchyLevel', ['1', '1.1', '1.1.1', '1.1.1.1', '2']],
    ['moveUp', ['1', '1.1', '1.1.1', '1.2', '2']],
    ['moveDown', ['1', '1.1', '1.2', '1.2.1', '2']],
  ] as const)('edits and regenerates custom hierarchy keys with %s', async (method, expected) => {
    const workbook = new GC.Spread.Sheets.Workbook(undefined, { sheetCount: 0 });
    const data = [{ id: '1', order: 0 }, { id: '1.1', order: 1 }, { id: '1.2', order: 2 },
      { id: '1.2.1', order: 3 }, { id: '2', order: 4 }];
    const table = workbook.dataManager().addTable('tree', { data, schema: {
      hierarchy: { type: 'Custom', column: 'id', parse: ({ data: row }) => String(row.id).split('.').slice(0, -1).join('.'),
        unparse: ({ index, parentData }) => `${parentData ? `${parentData.id}.` : ''}${index + 1}` },
      columns: { id: { isPrimaryKey: true }, order: { dataType: 'rowOrder' } },
    } });
    const view = table.addView('tree', [{ value: 'id', outlineColumn: true }]);
    await view.fetch();
    const sheet = workbook.addSheetTab(0, 'Tree', GC.Spread.Sheets.SheetType.tableSheet) as InstanceType<
      typeof GC.Spread.Sheets.TableSheet.TableSheet>;
    sheet.setDataView(view);
    if (method === 'addHierarchyItemAbove') sheet[method](2, {}); else sheet[method](2);
    expect(Array.from({ length: view.visibleLength() }, (_, row) => view.getRowData(row).id)).toEqual(expected);
    if (method === 'addHierarchyItemAbove') expect(data.map(row => row.order)).toEqual([0, 1, 1.5, 2, 3, 4]);
    if (method === 'moveUp') expect(data.map(row => row.order)).toEqual([0, 1, 0.5, 3, 4]);
  });
  it.each([
    ['addHierarchyItemBefore', ['1', '1.1', '1.2', '1.3', '1.3.1', '2'], [0, 1, 1.5, 2, 3, 4]],
    ['addHierarchyItemAfter', ['1', '1.1', '1.2', '1.2.1', '1.3', '2'], [0, 1, 2, 3, 2.5, 4]],
    ['addHierarchyItemBelow', ['1', '1.1', '1.2', '1.2.1', '1.2.2', '2'], [0, 1, 2, 3, 3.5, 4]],
  ] as const)('regenerates custom hierarchy keys with %s', async (method, ids, orders) => {
    const workbook = new GC.Spread.Sheets.Workbook(undefined, { sheetCount: 0 });
    const data = [{ id: '1', order: 0 }, { id: '1.1', order: 1 }, { id: '1.2', order: 2 },
      { id: '1.2.1', order: 3 }, { id: '2', order: 4 }];
    const table = workbook.dataManager().addTable('tree', { data, schema: {
      hierarchy: { type: 'Custom', column: 'id', parse: ({ data: row }) => String(row.id).split('.').slice(0, -1).join('.'),
        unparse: ({ index, parentData }) => `${parentData ? `${parentData.id}.` : ''}${index + 1}` },
      columns: { id: { isPrimaryKey: true }, order: { dataType: 'rowOrder' } },
    } });
    const view = table.addView('tree', ['id', 'order']);
    await view.fetch();
    const sheet = workbook.addSheetTab(0, 'Tree', GC.Spread.Sheets.SheetType.tableSheet) as InstanceType<
      typeof GC.Spread.Sheets.TableSheet.TableSheet>;
    sheet.setDataView(view);
    sheet[method](2, {});
    expect(data.map(row => row.id)).toEqual(ids);
    expect(data.map(row => row.order)).toEqual(orders);
  });
  it('sorts hierarchy siblings while keeping each subtree together', async () => {
    const workbook = new GC.Spread.Sheets.Workbook(undefined, { sheetCount: 0 });
    const table = workbook.dataManager().addTable('tree', { data: [
      { id: 1, parent: null, name: 'Z', order: 0 }, { id: 2, parent: 1, name: 'A', order: 1 },
      { id: 3, parent: null, name: 'B', order: 2 }, { id: 4, parent: 3, name: 'Y', order: 3 },
    ], schema: { hierarchy: { type: 'Parent', column: 'parent' },
      columns: { id: { isPrimaryKey: true }, order: { dataType: 'rowOrder' } } } });
    const view = table.addView('tree', ['id', { value: 'name', outlineColumn: true }]);
    await view.fetch();
    const sheet = workbook.addSheetTab(0, 'Tree', GC.Spread.Sheets.SheetType.tableSheet) as InstanceType<
      typeof GC.Spread.Sheets.TableSheet.TableSheet>;
    sheet.setDataView(view);
    sheet.sort([{ field: 'name', ascending: true }]);
    expect(Array.from({ length: view.visibleLength() }, (_, row) => view.getRowData(row).id)).toEqual([3, 4, 1, 2]);
    sheet.collapseAllHierarchyLevels();
    expect([0, 1, 2, 3].map(row => sheet.getRowVisible(row))).toEqual([true, false, true, false]);
  });
  it.each(['addHierarchyItemAbove', 'addHierarchyItemBelow', 'promoteHierarchyLevel', 'demoteHierarchyLevel'] as const)(
    'updates nested ChildrenPath source arrays with %s', async method => {
      const workbook = new GC.Spread.Sheets.Workbook(undefined, { sheetCount: 0 });
      const data: Record<string, unknown>[] = [{ id: 0, order: 0, children: [
        { id: 1, order: 1 }, { id: 2, order: 2, children: [{ id: 3, order: 3 }] },
      ] }, { id: 4, order: 4 }];
      const table = workbook.dataManager().addTable('tree', { data, schema: {
        hierarchy: { type: 'ChildrenPath', column: 'children' },
        columns: { id: {}, children: {}, order: { dataType: 'rowOrder' } },
      } });
      const view = table.addView('tree', [{ value: 'id', outlineColumn: true }]);
      await view.fetch();
      const sheet = workbook.addSheetTab(0, 'Tree', GC.Spread.Sheets.SheetType.tableSheet) as InstanceType<
        typeof GC.Spread.Sheets.TableSheet.TableSheet>;
      sheet.setDataView(view);
      if (method === 'addHierarchyItemAbove' || method === 'addHierarchyItemBelow') sheet[method](2, { id: 9 });
      else sheet[method](2);
      const rootChildren = data[0]!.children as Record<string, unknown>[];
      if (method === 'addHierarchyItemAbove') expect((rootChildren[1]!.children as Record<string, unknown>[])[0]!.id).toBe(2);
      if (method === 'addHierarchyItemBelow') expect((rootChildren[1]!.children as Record<string, unknown>[])[1]!.id).toBe(9);
      if (method === 'promoteHierarchyLevel') expect(data.map(row => row.id)).toEqual([0, 2, 4]);
      if (method === 'demoteHierarchyLevel') expect((rootChildren[0]!.children as Record<string, unknown>[])[0]!.id).toBe(2);
    },
  );
  it.each([
    ['addHierarchyItemBefore', [0, 1, 9, 2, 3, 4], [0, 1, 1, 1, 2, 0]],
    ['addHierarchyItemAfter', [0, 1, 2, 3, 9, 4], [0, 1, 1, 2, 1, 0]],
    ['addHierarchyItemAbove', [0, 1, 9, 2, 3, 4], [0, 1, 1, 2, 3, 0]],
    ['addHierarchyItemBelow', [0, 1, 2, 3, 9, 4], [0, 1, 1, 2, 2, 0]],
    ['promoteHierarchyLevel', [0, 1, 2, 3, 4], [0, 1, 0, 1, 0]],
    ['demoteHierarchyLevel', [0, 1, 2, 3, 4], [0, 1, 2, 3, 0]],
    ['moveUp', [0, 2, 3, 1, 4], [0, 1, 2, 1, 0]],
  ] as const)('edits Level hierarchy with %s', async (method, ids, levels) => {
    const workbook = new GC.Spread.Sheets.Workbook(undefined, { sheetCount: 0 });
    const data = [
      { id: 0, level: 0, order: 0 }, { id: 1, level: 1, order: 1 }, { id: 2, level: 1, order: 2 },
      { id: 3, level: 2, order: 3 }, { id: 4, level: 0, order: 4 },
    ];
    const table = workbook.dataManager().addTable('tree', { data, schema: {
      hierarchy: { type: 'Level', column: 'level' }, columns: { id: {}, level: {}, order: { dataType: 'rowOrder' } },
    } });
    const view = table.addView('tree', [{ value: 'id', outlineColumn: true }, 'level']);
    await view.fetch();
    const sheet = workbook.addSheetTab(0, 'Tree', GC.Spread.Sheets.SheetType.tableSheet) as InstanceType<
      typeof GC.Spread.Sheets.TableSheet.TableSheet>;
    sheet.setDataView(view);
    if (method.startsWith('add')) {
      (sheet[method as 'addHierarchyItemBefore'])(2, { id: 9 });
    } else (sheet[method as 'moveUp'])(2);
    const rows = Array.from({ length: view.visibleLength() }, (_, index) => view.getRowData(index));
    expect(rows.map(row => row.id)).toEqual(ids);
    expect(rows.map(row => row.level)).toEqual(levels);
  });
  it('edits parent hierarchies while preserving descendant order', async () => {
    const workbook = new GC.Spread.Sheets.Workbook(undefined, { sheetCount: 0 });
    const data = [
      { id: 0, parent: null as number | null, order: 0 }, { id: 1, parent: 0, order: 1 },
      { id: 2, parent: 0, order: 2 }, { id: 3, parent: 2, order: 3 }, { id: 4, parent: null, order: 4 },
    ];
    const table = workbook.dataManager().addTable('tree', { data, schema: {
      hierarchy: { type: 'Parent', column: 'parent' },
      columns: { id: { isPrimaryKey: true }, parent: {}, order: { dataType: 'rowOrder' } },
    } });
    const view = table.addView('tree', [{ value: 'id', outlineColumn: true }, 'parent', 'order']);
    await view.fetch();
    const sheet = workbook.addSheetTab(0, 'Tree', GC.Spread.Sheets.SheetType.tableSheet) as InstanceType<
      typeof GC.Spread.Sheets.TableSheet.TableSheet>;
    sheet.setDataView(view);
    sheet.moveUp(2);
    expect(Array.from({ length: view.visibleLength() }, (_, row) => view.getRowData(row).id)).toEqual([0, 2, 3, 1, 4]);
    sheet.demoteHierarchyLevel(3);
    expect(data.find(row => row.id === 1)?.parent).toBe(2);
    sheet.promoteHierarchyLevel(2);
    expect(data.find(row => row.id === 1)?.parent).toBe(0);
    sheet.addHierarchyItemAbove(1, { id: 9 });
    expect(data.find(row => row.id === 2)?.parent).toBe(9);
    expect(data.find(row => row.id === 9)?.parent).toBe(0);
  });
  it('demotes a sorted hierarchy row under its preceding row in source order', async () => {
    const workbook = new GC.Spread.Sheets.Workbook(undefined, { sheetCount: 0 });
    const data = [
      { id: 1, parent: null as number | null, name: 'A', order: 1 },
      { id: 2, parent: null as number | null, name: 'B', order: 2 },
      { id: 3, parent: null as number | null, name: 'C', order: 3 },
    ];
    const table = workbook.dataManager().addTable('tree', { data, schema: {
      hierarchy: { type: 'Parent', column: 'parent' },
      columns: { id: { isPrimaryKey: true }, parent: {}, order: { dataType: 'rowOrder' } },
    } });
    const view = table.addView('tree', [{ value: 'id', outlineColumn: true }, 'name']);
    await view.fetch();
    const sheet = workbook.addSheetTab(0, 'Tree', GC.Spread.Sheets.SheetType.tableSheet) as InstanceType<
      typeof GC.Spread.Sheets.TableSheet.TableSheet>;
    sheet.setDataView(view);
    sheet.sort([{ field: 'name', ascending: false }]);
    sheet.demoteHierarchyLevel(1);
    expect(data[1]!.parent).toBe(1);
    expect(Array.from({ length: view.visibleLength() }, (_, row) => view.getRowData(row).id)).toEqual([3, 2, 1]);
  });
  it('moves a sorted hierarchy row and retains the new display order', async () => {
    const workbook = new GC.Spread.Sheets.Workbook(undefined, { sheetCount: 0 });
    const data = [
      { id: 1, parent: null, name: 'A', order: 1 },
      { id: 2, parent: null, name: 'B', order: 2 },
      { id: 3, parent: null, name: 'C', order: 3 },
      { id: 4, parent: null, name: 'D', order: 4 },
    ];
    const table = workbook.dataManager().addTable('tree', { data, schema: {
      hierarchy: { type: 'Parent', column: 'parent' },
      columns: { id: { isPrimaryKey: true }, parent: {}, order: { dataType: 'rowOrder' } },
    } });
    const view = table.addView('tree', ['id', 'name']);
    await view.fetch();
    const sheet = workbook.addSheetTab(0, 'Tree', GC.Spread.Sheets.SheetType.tableSheet) as InstanceType<
      typeof GC.Spread.Sheets.TableSheet.TableSheet>;
    sheet.setDataView(view);
    sheet.sort([{ field: 'name', ascending: false }]);
    sheet.moveUp(1);
    expect(data[2]!.order).toBe(5);
    expect(Array.from({ length: view.visibleLength() }, (_, row) => view.getRowData(row).id)).toEqual([3, 4, 2, 1]);
    sheet.moveDown(0);
    expect(Array.from({ length: view.visibleLength() }, (_, row) => view.getRowData(row).id)).toEqual([4, 3, 2, 1]);
  });
  it.each([
    ['addHierarchyItemBefore', 1.5, [1, 9, 2, 3]],
    ['addHierarchyItemAfter', 2.5, [9, 1, 2, 3]],
    ['addHierarchyItemBelow', 2.5, [9, 1, 2, 3]],
  ] as const)('allocates source order for %s in a sorted hierarchy', async (method, order, ids) => {
    const workbook = new GC.Spread.Sheets.Workbook(undefined, { sheetCount: 0 });
    const data: Record<string, unknown>[] = [
      { id: 1, parent: null, name: 'A', order: 1 }, { id: 2, parent: null, name: 'B', order: 2 },
      { id: 3, parent: null, name: 'C', order: 3 },
    ];
    const table = workbook.dataManager().addTable('tree', { data, schema: {
      hierarchy: { type: 'Parent', column: 'parent' },
      columns: { id: { isPrimaryKey: true }, parent: {}, order: { dataType: 'rowOrder' } },
    } });
    const view = table.addView('tree', ['id', 'name']);
    await view.fetch();
    const sheet = workbook.addSheetTab(0, 'Tree', GC.Spread.Sheets.SheetType.tableSheet) as InstanceType<
      typeof GC.Spread.Sheets.TableSheet.TableSheet>;
    sheet.setDataView(view);
    sheet.sort([{ field: 'name', ascending: false }]);
    sheet[method](1, { id: 9, name: 'Added' });
    expect(data.map(row => row.id)).toEqual(ids);
    expect(data.find(row => row.id === 9)?.order).toBe(order);
  });
  it('promotes a record and reparents its following siblings as observed in the trial', async () => {
    const workbook = new GC.Spread.Sheets.Workbook(undefined, { sheetCount: 0 });
    const data = [
      { id: 0, parent: null as number | null, order: 0 }, { id: 1, parent: 0, order: 1 },
      { id: 2, parent: 0, order: 2 }, { id: 3, parent: 0, order: 3 },
    ];
    const table = workbook.dataManager().addTable('tree', { data, schema: {
      hierarchy: { type: 'Parent', column: 'parent' },
      columns: { id: { isPrimaryKey: true }, parent: {}, order: { dataType: 'rowOrder' } },
    } });
    const view = table.addView('tree', [{ value: 'id', outlineColumn: true }]);
    await view.fetch();
    const sheet = workbook.addSheetTab(0, 'Tree', GC.Spread.Sheets.SheetType.tableSheet) as InstanceType<
      typeof GC.Spread.Sheets.TableSheet.TableSheet>;
    sheet.setDataView(view);
    sheet.promoteHierarchyLevel(1);
    expect(data.map(row => row.parent)).toEqual([null, null, 1, 1]);
    expect(Array.from({ length: view.visibleLength() }, (_, row) => view.getRowData(row).id)).toEqual([0, 1, 2, 3]);
  });
  it('ignores promote and demote when the bound view has no outline column', async () => {
    // Trial .probe/api-sweep-item4c/4d/4e.json: with no view column carrying outlineColumn,
    // promoteHierarchyLevel/demoteHierarchyLevel leave the table and the display untouched
    // (custom, parent and level variants probed); add/move operations still run.
    const workbook = new GC.Spread.Sheets.Workbook(undefined, { sheetCount: 0 });
    const data = [
      { id: 0, parent: null as number | null, order: 0 }, { id: 1, parent: 0, order: 1 },
      { id: 2, parent: 0, order: 2 }, { id: 3, parent: 0, order: 3 },
    ];
    const table = workbook.dataManager().addTable('tree', { data, schema: {
      hierarchy: { type: 'Parent', column: 'parent' },
      columns: { id: { isPrimaryKey: true }, parent: {}, order: { dataType: 'rowOrder' } },
    } });
    const view = table.addView('tree', ['id']);
    await view.fetch();
    const sheet = workbook.addSheetTab(0, 'Tree', GC.Spread.Sheets.SheetType.tableSheet) as InstanceType<
      typeof GC.Spread.Sheets.TableSheet.TableSheet>;
    sheet.setDataView(view);
    sheet.promoteHierarchyLevel(1);
    sheet.demoteHierarchyLevel(2);
    expect(data.map(row => row.parent)).toEqual([null, 0, 0, 0]);
    expect(Array.from({ length: view.visibleLength() }, (_, row) => view.getRowData(row).id)).toEqual([0, 1, 2, 3]);
    sheet.moveUp(2);
    expect(data.map(row => row.parent)).toEqual([null, 0, 0, 0]);
    workbook.destroy();
  });
  it('serializes inserted hierarchy rows with the trial key order (hierarchy column before rowOrder)', async () => {
    // Trial .probe/tablesheet-comparison-chunkA.json hierarchyFilteredEdit_addHierarchyItemBelow:
    // the inserted binding-source row gets {...item, parentId, order} in that key order.
    const workbook = new GC.Spread.Sheets.Workbook(undefined, { sheetCount: 0 });
    const data: Record<string, unknown>[] = [{ id: 1, parent: null, order: 0 }, { id: 2, parent: 1, order: 1 }];
    const table = workbook.dataManager().addTable('tree', { data, schema: {
      hierarchy: { type: 'Parent', column: 'parent' },
      columns: { id: { isPrimaryKey: true }, parent: {}, order: { dataType: 'rowOrder' } },
    } });
    const view = table.addView('tree', ['id', 'parent']);
    await view.fetch();
    const sheet = workbook.addSheetTab(0, 'Tree', GC.Spread.Sheets.SheetType.tableSheet) as InstanceType<
      typeof GC.Spread.Sheets.TableSheet.TableSheet>;
    sheet.setDataView(view);
    sheet.addHierarchyItemBelow(0, { id: 9, name: 'Added' });
    expect(Object.keys(data.find(row => row.id === 9)!)).toEqual(['id', 'name', 'parent', 'order']);
    workbook.destroy();
  });
  it('anchors a root-group moveUp at the previous row order when no earlier sibling exists', async () => {
    // Trial .probe/api-sweep-item4d/f.json parent:moveUp(4): the moved root takes the
    // previous root's order value (0) and the display puts the moved row first.
    const workbook = new GC.Spread.Sheets.Workbook(undefined, { sheetCount: 0 });
    const data: Record<string, unknown>[] = [
      { id: 1, parent: null, order: 0 }, { id: 2, parent: 1, order: 1 }, { id: 3, parent: 2, order: 2 },
      { id: 4, parent: 1, order: 3 }, { id: 5, parent: null, order: 4 },
    ];
    const table = workbook.dataManager().addTable('tree', { data, schema: {
      hierarchy: { type: 'Parent', column: 'parent' },
      columns: { id: { isPrimaryKey: true }, parent: {}, order: { dataType: 'rowOrder' } },
    } });
    const view = table.addView('tree', ['id', 'parent', 'order']);
    await view.fetch();
    const sheet = workbook.addSheetTab(0, 'Tree', GC.Spread.Sheets.SheetType.tableSheet) as InstanceType<
      typeof GC.Spread.Sheets.TableSheet.TableSheet>;
    sheet.setDataView(view);
    sheet.moveUp(4);
    expect(data[4]!.order).toBe(0);
    expect(Array.from({ length: view.visibleLength() }, (_, row) => view.getRowData(row).id)).toEqual([5, 1, 2, 3, 4]);
    workbook.destroy();
  });
  it('reorders ChildrenPath children without rowOrder values on moveUp', async () => {
    // Trial .probe/api-sweep-item4g.json childrenPath:moveUp(2): children rows without a
    // rowOrder value take their sequence rank in the sibling group, so the move reorders
    // them in the display ([1,2,3,...] -> [1,3,2,...]) while the source arrays stay as-is.
    const workbook = new GC.Spread.Sheets.Workbook(undefined, { sheetCount: 0 });
    const data: Record<string, unknown>[] = [
      { id: 1, city: 'Rome', score: 10, children: [{ id: 2, city: 'Paris', score: 20 }, { id: 3, city: 'Rome', score: 30 }] },
      { id: 4, city: 'Rome', score: 40, order: 1, children: [{ id: 5, city: 'Rome', score: 50 }] },
      { id: 6, city: 'Paris', score: 60, order: 2, children: [] },
    ];
    data[0]!.order = 0;
    const table = workbook.dataManager().addTable('tree', { data, schema: {
      hierarchy: { type: 'ChildrenPath', column: 'children' },
      columns: { id: { isPrimaryKey: true }, children: {}, city: {}, score: {}, order: { dataType: 'rowOrder' } },
    } });
    const view = table.addView('tree', ['id', 'city', 'score']);
    await view.fetch();
    const sheet = workbook.addSheetTab(0, 'Tree', GC.Spread.Sheets.SheetType.tableSheet) as InstanceType<
      typeof GC.Spread.Sheets.TableSheet.TableSheet>;
    sheet.setDataView(view);
    sheet.moveUp(2);
    expect(Array.from({ length: view.visibleLength() }, (_, row) => view.getRowData(row).id)).toEqual([1, 3, 2, 4, 5, 6]);
    workbook.destroy();
  });
  it('assigns the group midpoint when a promoted ChildrenPath row lacks a rowOrder value', async () => {
    // Trial .probe/api-sweep-item4g.json childrenPathOutline:promote(1): the promoted row is
    // inserted into the grandparent group with the midpoint order between old parent and
    // the group's next row (0.5 between 1@0 and 4@1); the following child follows it.
    const workbook = new GC.Spread.Sheets.Workbook(undefined, { sheetCount: 0 });
    const data: Record<string, unknown>[] = [
      { id: 1, city: 'Rome', order: 0, children: [{ id: 2, city: 'Paris' }, { id: 3, city: 'Rome' }] },
      { id: 4, city: 'Rome', order: 1, children: [{ id: 5, city: 'Rome' }] },
      { id: 6, city: 'Paris', order: 2, children: [] },
    ];
    const table = workbook.dataManager().addTable('tree', { data, schema: {
      hierarchy: { type: 'ChildrenPath', column: 'children' },
      columns: { id: { isPrimaryKey: true }, children: {}, city: {}, order: { dataType: 'rowOrder' } },
    } });
    const view = table.addView('tree', [{ value: 'id', outlineColumn: true }, 'city']);
    await view.fetch();
    const sheet = workbook.addSheetTab(0, 'Tree', GC.Spread.Sheets.SheetType.tableSheet) as InstanceType<
      typeof GC.Spread.Sheets.TableSheet.TableSheet>;
    sheet.setDataView(view);
    sheet.promoteHierarchyLevel(1);
    expect(data.map(row => row.id)).toEqual([1, 2, 4, 6]);
    expect(data[1]!.order).toBe(0.5);
    expect(((data[1]!.children) as Record<string, unknown>[]).map(r => r.id)).toEqual([3]);
    expect(Array.from({ length: view.visibleLength() }, (_, row) => view.getRowData(row).id)).toEqual([1, 2, 3, 4, 5, 6]);
    workbook.destroy();
  });
  it.each([
    ['addHierarchyItemBefore', [0, 1, 9, 2, 3, 4], 0],
    ['addHierarchyItemAfter', [0, 1, 2, 3, 9, 4], 0],
    ['addHierarchyItemBelow', [0, 1, 2, 3, 9, 4], 2],
  ] as const)('%s inserts at the expected hierarchy position', async (method, expected, parent) => {
    const workbook = new GC.Spread.Sheets.Workbook(undefined, { sheetCount: 0 });
    const data = [
      { id: 0, parent: null as number | null, order: 0 }, { id: 1, parent: 0, order: 1 },
      { id: 2, parent: 0, order: 2 }, { id: 3, parent: 2, order: 3 }, { id: 4, parent: null, order: 4 },
    ];
    const table = workbook.dataManager().addTable('tree', { data, schema: {
      hierarchy: { type: 'Parent', column: 'parent' },
      columns: { id: { isPrimaryKey: true }, parent: {}, order: { dataType: 'rowOrder' } },
    } });
    const view = table.addView('tree', ['id', 'parent', 'order']);
    await view.fetch();
    const sheet = workbook.addSheetTab(0, 'Tree', GC.Spread.Sheets.SheetType.tableSheet) as InstanceType<
      typeof GC.Spread.Sheets.TableSheet.TableSheet>;
    sheet.setDataView(view);
    sheet[method](2, { id: 9 });
    expect(Array.from({ length: view.visibleLength() }, (_, row) => view.getRowData(row).id)).toEqual(expected);
    expect(data.find(row => row.id === 9)?.parent).toBe(parent);
  });
  it('collapses and expands hierarchy levels without removing view records', async () => {
    const workbook = new GC.Spread.Sheets.Workbook(undefined, { sheetCount: 0 });
    const table = workbook.dataManager().addTable('tree', {
      data: [{ id: 1, parent: null }, { id: 2, parent: 1 }, { id: 3, parent: 2 }, { id: 4, parent: null }],
      schema: { hierarchy: { type: 'Parent', column: 'parent' }, columns: { id: { isPrimaryKey: true } } },
    });
    const view = table.addView('tree', ['id']);
    await view.fetch();
    const sheet = workbook.addSheetTab(0, 'Tree', GC.Spread.Sheets.SheetType.tableSheet) as InstanceType<
      typeof GC.Spread.Sheets.TableSheet.TableSheet>;
    sheet.setDataView(view);
    sheet.collapseAllHierarchyLevels();
    expect([0, 1, 2, 3].map(row => sheet.getRowVisible(row))).toEqual([true, false, false, true]);
    expect(view.visibleLength()).toBe(4);
    sheet.expandHierarchyLevel(1);
    expect([0, 1, 2, 3].map(row => sheet.getRowVisible(row))).toEqual([true, true, false, true]);
    sheet.expandAllHierarchyLevels();
    expect([0, 1, 2, 3].map(row => sheet.getRowVisible(row))).toEqual([true, true, true, true]);
  });
  it('toggles an individual hierarchy branch independently of its siblings', async () => {
    const workbook = new GC.Spread.Sheets.Workbook(undefined, { sheetCount: 0 });
    const table = workbook.dataManager().addTable('tree', {
      data: [{ id: 1, parent: null }, { id: 2, parent: 1 }, { id: 3, parent: null }, { id: 4, parent: 3 }],
      schema: { hierarchy: { type: 'Parent', column: 'parent' }, columns: { id: { isPrimaryKey: true } } },
    });
    const view = table.addView('tree', [{ value: 'id', outlineColumn: true }]);
    await view.fetch();
    const sheet = workbook.addSheetTab(0, 'Tree', GC.Spread.Sheets.SheetType.tableSheet) as InstanceType<
      typeof GC.Spread.Sheets.TableSheet.TableSheet>;
    sheet.setDataView(view);
    expect(sheet._hierarchyOutline(0, 0)?.hasChildren).toBe(true);
    expect(sheet._hierarchyOutline(1, 0)?.hasChildren).toBe(false);
    sheet._toggleHierarchyOutline(0);
    expect([0, 1, 2, 3].map(row => sheet.getRowVisible(row))).toEqual([true, false, true, true]);
    sheet._toggleHierarchyOutline(0);
    expect([0, 1, 2, 3].map(row => sheet.getRowVisible(row))).toEqual([true, true, true, true]);
    sheet.collapseAllHierarchyLevels();
    sheet._toggleHierarchyOutline(0);
    expect([0, 1, 2, 3].map(row => sheet.getRowVisible(row))).toEqual([true, true, true, false]);
  });
  it.each(['name', { value: 'name' }])('uses the hierarchy schema outline column %s', async outlineColumn => {
    const workbook = new GC.Spread.Sheets.Workbook(undefined, { sheetCount: 0 });
    const table = workbook.dataManager().addTable('tree', {
      data: [{ id: 1, parent: null, name: 'root' }, { id: 2, parent: 1, name: 'child' }],
      schema: { hierarchy: { type: 'Parent', column: 'parent', outlineColumn }, columns: { id: { isPrimaryKey: true } } },
    });
    const view = table.addView('tree', ['id', 'name']);
    await view.fetch();
    const sheet = workbook.addSheetTab(0, 'Tree', GC.Spread.Sheets.SheetType.tableSheet) as InstanceType<
      typeof GC.Spread.Sheets.TableSheet.TableSheet>;
    sheet.setDataView(view);
    expect(sheet._hierarchyOutline(0, 0)).toBeUndefined();
    expect(sheet._hierarchyOutline(0, 1)?.hasChildren).toBe(true);
    sheet._toggleHierarchyOutline(0);
    expect(sheet.getRowVisible(1)).toBe(false);
  });
  it('lets a view outline column override the schema outline column', async () => {
    const workbook = new GC.Spread.Sheets.Workbook(undefined, { sheetCount: 0 });
    const table = workbook.dataManager().addTable('tree', {
      data: [{ id: 1, parent: null, name: 'root' }, { id: 2, parent: 1, name: 'child' }],
      schema: { hierarchy: { type: 'Parent', column: 'parent', outlineColumn: 'name' }, columns: { id: { isPrimaryKey: true } } },
    });
    const view = table.addView('tree', [{ value: 'id', outlineColumn: true }, 'name']);
    await view.fetch();
    const sheet = workbook.addSheetTab(0, 'Tree', GC.Spread.Sheets.SheetType.tableSheet) as InstanceType<
      typeof GC.Spread.Sheets.TableSheet.TableSheet>;
    sheet.setDataView(view);
    expect(sheet._hierarchyOutline(0, 0)?.hasChildren).toBe(true);
    expect(sheet._hierarchyOutline(0, 1)).toBeUndefined();
  });
  it('removes an entire nested subtree and keeps siblings in the source', async () => {
    const workbook = new GC.Spread.Sheets.Workbook(undefined, { sheetCount: 0 });
    const data = [{ name: 'root', children: [
      { name: 'branch', children: [{ name: 'leaf' }] }, { name: 'sibling', children: [] },
    ] }];
    const table = workbook.dataManager().addTable('tree', {
      data, schema: { hierarchy: { type: 'ChildrenPath', column: 'children' }, columns: { name: {} } },
    });
    const view = table.addView('tree', ['name']);
    await view.fetch();
    const sheet = workbook.addSheetTab(0, 'Tree', GC.Spread.Sheets.SheetType.tableSheet) as InstanceType<
      typeof GC.Spread.Sheets.TableSheet.TableSheet>;
    sheet.setDataView(view);
    await sheet.removeRow(1);
    expect(Array.from({ length: view.visibleLength() }, (_, row) => view.getRowData(row).name)).toEqual(['root', 'sibling']);
    expect(data[0]!.children.map(child => child.name)).toEqual(['sibling']);
  });
  it('removes descendants in a parent hierarchy even when a child precedes its parent', async () => {
    const workbook = new GC.Spread.Sheets.Workbook(undefined, { sheetCount: 0 });
    const data = [
      { id: 3, parent: 2 }, { id: 1, parent: null }, { id: 2, parent: 1 }, { id: 4, parent: null },
    ];
    const table = workbook.dataManager().addTable('tree', {
      data, schema: { hierarchy: { type: 'Parent', column: 'parent' }, columns: { id: { isPrimaryKey: true } } },
    });
    const view = table.addView('tree', ['id']);
    await view.fetch();
    const sheet = workbook.addSheetTab(0, 'Tree', GC.Spread.Sheets.SheetType.tableSheet) as InstanceType<
      typeof GC.Spread.Sheets.TableSheet.TableSheet>;
    sheet.setDataView(view);
    await sheet.removeRow(1);
    expect(data.map(row => row.id)).toEqual([4]);
    expect(view.getRowData(0).id).toBe(4);
  });
  it('reads nested ChildrenPath records in depth-first order and filters their paths', async () => {
    const workbook = new GC.Spread.Sheets.Workbook(undefined, { sheetCount: 0 });
    const data = [{ name: 'World', children: [{ name: 'Europe', children: [{ name: 'France' }] }, { name: 'Asia' }] }];
    const table = workbook.dataManager().addTable('tree', {
      data, schema: { hierarchy: { type: 'ChildrenPath', column: 'children' }, columns: { name: {} } },
    });
    const view = table.addView('tree', ['name']);
    await view.fetch();
    const sheet = workbook.addSheetTab(0, 'Tree', GC.Spread.Sheets.SheetType.tableSheet) as InstanceType<
      typeof GC.Spread.Sheets.TableSheet.TableSheet>;
    sheet.setDataView(view);
    expect(Array.from({ length: view.visibleLength() }, (_, row) => view.getRowData(row).name))
      .toEqual(['World', 'Europe', 'France', 'Asia']);
    sheet.filter([{ field: 'name', paths: [{ path: ['World', 'Europe', 'France'] }] }]);
    expect(sheet.filter()[0]?.paths?.[0]?.type).toBe('value');
    expect(Array.from({ length: view.visibleLength() }, (_, row) => view.getRowData(row).name))
      .toEqual(['World', 'Europe', 'France']);
    sheet.removeFilter();
    await sheet.removeRow(3);
    expect(data[0]!.children.map(child => child.name)).toEqual(['Europe']);
    expect(view.visibleLength()).toBe(3);
  });
  it('filters hierarchy paths while retaining their ancestors', async () => {
    const workbook = new GC.Spread.Sheets.Workbook(undefined, { sheetCount: 0 });
    const table = workbook.dataManager().addTable('tree', {
      data: [
        { id: 1, parent: null, name: 'World' }, { id: 2, parent: 1, name: 'Europe' },
        { id: 3, parent: 2, name: 'France' }, { id: 4, parent: 1, name: 'Asia' },
      ],
      schema: { hierarchy: { type: 'Parent', column: 'parent' }, columns: { id: { isPrimaryKey: true } } },
    });
    const view = table.addView('tree', ['name']);
    await view.fetch();
    const sheet = workbook.addSheetTab(0, 'Tree', GC.Spread.Sheets.SheetType.tableSheet) as InstanceType<
      typeof GC.Spread.Sheets.TableSheet.TableSheet>;
    sheet.setDataView(view);
    sheet.filter([{ field: 'name', paths: [{ path: ['World', 'Europe', 'France'] }] }]);
    expect(Array.from({ length: view.visibleLength() }, (_, row) => view.getRowData(row).name))
      .toEqual(['World', 'Europe', 'France']);
    sheet.filter([{ field: 'name', paths: [{ path: ['World'] }] }]);
    expect(view.visibleLength()).toBe(0);
    sheet.filter([{ field: 'name', paths: [{ path: [] }] }]);
    expect(view.visibleLength()).toBe(4);
    sheet.removeFilter();
    expect(view.visibleLength()).toBe(4);
  });
  it('binds after fetch, displays columns and uses the workbook tab API', async () => {
    const { workbook, sheet, view } = await fixture();
    expect(sheet).toBeInstanceOf(GC.Spread.Sheets.TableSheet.TableSheet);
    expect(workbook.getSheetTab('Data')).toBe(sheet);
    expect(workbook.getSheetTabCount()).toBe(1);
    expect(sheet.getDataView()).toBe(view);
    expect([sheet.getRowCount(), sheet.getColumnCount(), sheet.getValue(0, 0, 1)]).toEqual([3, 2, 'Identifier']);
    expect(sheet.getColumnWidth(0)).toBe(90);
    sheet.setDefaultRowHeight(42);
    expect(sheet.getRowHeight(0)).toBe(42);
    workbook.removeSheetTab('Data');
    expect(workbook.getSheetTabCount()).toBe(0);
  });

  it('centers cells vertically by default while allowing an explicit alignment', async () => {
    const { sheet } = await fixture();
    expect(sheet.getActualStyle(0, 0).vAlign).toBe(1);
    const style = new GC.Spread.Sheets.Style();
    style.vAlign = 0;
    sheet.setStyle(0, 0, style);
    expect(sheet.getActualStyle(0, 0).vAlign).toBe(0);
  });

  it('validates default row heights and updates the column header independently', async () => {
    const { sheet } = await fixture();
    sheet.setDefaultRowHeight(45, GC.Spread.Sheets.SheetArea.colHeader);
    expect(sheet.getRowHeight(0, GC.Spread.Sheets.SheetArea.colHeader)).toBe(45);
    expect(sheet.getRowHeight(0)).toBe(30);
    expect(() => sheet.setDefaultRowHeight(-1)).toThrow(RangeError);
    expect(() => sheet.setDefaultRowHeight(Number.NaN)).toThrow(RangeError);
  });

  it('answers getDefaultRowHeight like the trial runtime (probe .probe/t54/probe-t54-gantt-grid.json)', async () => {
    // The trial exposes `getDefaultRowHeight` on its TableSheet objects (it returned 30 there,
    // the TableSheet default); plain worksheets answer their own 20 default.
    const { sheet } = await fixture();
    expect(sheet.getDefaultRowHeight()).toBe(30);
    sheet.setDefaultRowHeight(42);
    expect(sheet.getDefaultRowHeight()).toBe(42);
    const plain = new GC.Spread.Sheets.Worksheet('P');
    expect(plain.getDefaultRowHeight()).toBe(20);
  });

  it('applies and returns a table theme', async () => {
    const { sheet } = await fixture();
    expect(sheet.getTableTheme()).toBe(GC.Spread.Sheets.Tables.TableThemes.light2);
    const theme = GC.Spread.Sheets.Tables.TableThemes.dark1 as InstanceType<typeof GC.Spread.Sheets.Tables.TableTheme>;
    sheet.applyTableTheme(theme);
    expect(sheet.getTableTheme()).toBe(theme);
    expect(sheet.getActualStyle(0, 0).backColor).toBeTruthy();
    expect(sheet.getActualStyle(0, 0, GC.Spread.Sheets.SheetArea.colHeader).backColor).toBe('black');
    expect(sheet.getActualStyle(0, 0, GC.Spread.Sheets.SheetArea.colHeader).foreColor).toBe('white');
  });

  it('edits, resets, saves, adds and removes rows through the view', async () => {
    const { sheet, view } = await fixture();
    sheet.setValue(0, 0, '7');
    expect(view.getRowData(0).id).toBe(7);
    expect(sheet.hasRowState(GC.Data.RowColumnStates.updated, 0)).toBe(true);
    expect(sheet.hasRowState(GC.Data.RowColumnStates.dirty, 0)).toBe(true);
    expect(sheet.getChanges()).toHaveLength(1);
    sheet.resetRow(0);
    expect(view.getRowData(0).id).toBe(1);
    sheet.setValue(0, 1, 'Edited');
    await sheet.saveRow(0);
    expect(sheet.getChanges()).toEqual([]);
    await sheet.addRow({ id: 3, name: 'Cleo' });
    expect(view.visibleLength()).toBe(3);
    expect(sheet.getChanges()).toEqual([]);
    await sheet.removeRow(1);
    expect(view.visibleLength()).toBe(2);
    await sheet.submitChanges();
    await sheet.cancelChanges();
    expect(sheet.rowActionOptions([{ icon: 'x' }])).toEqual([{ icon: 'x' }]);
  });

  it('selects row action icons and executes their registered command', async () => {
    const { workbook, sheet } = await fixture();
    const calls: number[] = [];
    workbook.commandManager().register('markRow', {
      execute: (_context, options) => { calls.push(Number(options.row)); return true; },
    });
    sheet.rowActionOptions([{ icons: ['a', 'b'], iconSelector: (_item, index) => index, command: 'markRow' }]);
    expect(sheet._rowAction(1, 0)?.icon).toBe('b');
    expect(sheet._executeRowAction(1, 0)).toBe(true);
    expect(calls).toEqual([1]);
    expect(sheet._executeRowAction(2, 0)).toBe(false);
  });

  it('sorts and filters and undoes column commands', async () => {
    const { workbook, sheet, view } = await fixture();
    sheet.sort([{ field: 'id', ascending: false }]);
    expect(view.getRowData(0).id).toBe(2);
    sheet.removeSort();
    expect(view.getRowData(0).id).toBe(1);
    sheet.filter([{ field: 'name', values: [{ value: 'Ben' }] }]);
    expect(view.visibleLength()).toBe(1);
    expect(sheet.filter()[0]?.values?.[0]?.type).toBe('value');
    sheet.removeFilter();
    expect(view.visibleLength()).toBe(2);
    expect(workbook.commandManager().execute({ cmd: 'TableSheetSortColumn', sheetName: 'Data', col: 0, ascending: false })).toBe(true);
    expect(view.getRowData(0).id).toBe(2);
    expect(workbook.undoManager().undo()).toBe(true);
    expect(view.getRowData(0).id).toBe(1);
    expect(workbook.undoManager().redo()).toBe(true);
    expect(view.getRowData(0).id).toBe(2);
  });

  it('groups a bound view by multiple fields and restores its order', async () => {
    const workbook = new GC.Spread.Sheets.Workbook(undefined, { sheetCount: 0 });
    const view = workbook.dataManager().addTable('groups', { data: [
      { id: 1, region: 'West', team: 'A' }, { id: 2, region: 'East', team: 'B' },
      { id: 3, region: 'West', team: 'B' },
    ] }).addView('v');
    await view.fetch();
    const sheet = workbook.addSheetTab(0, 'Data', GC.Spread.Sheets.SheetType.tableSheet) as InstanceType<
      typeof GC.Spread.Sheets.TableSheet.TableSheet>;
    sheet.setDataView(view);
    const groups = [{ field: 'region' }, { field: 'team' }];
    expect(sheet.groupBy(groups)).toBeUndefined();
    expect(sheet.groupBy()).toEqual(groups);
    expect([0, 1, 2].map(row => view.getRowData(row).id)).toEqual([1, 3, 2]);
    expect(sheet.getColumnCount()).toBe(5);
    expect([sheet.getValue(0, 0), sheet.getValue(1, 0), sheet.getValue(2, 0)]).toEqual(['West', undefined, 'East']);
    sheet.expandGroupItem(0, 0, false);
    expect([0, 1, 2].map(row => sheet.getRowVisible(row))).toEqual([true, false, true]);
    expect(sheet.getValue(0, 1)).toBeUndefined();
    expect(sheet.getValue(0, 2)).toBeUndefined();
    expect(sheet._groupRowHasOutline(0, 1)).toBe(false);
    expect(sheet._groupRowHasOutline(3, 0)).toBe(false);
    sheet.expandGroup('region', true);
    expect(sheet.getRowVisible(1)).toBe(true);
    expect(sheet._groupRowHasOutline(0, 0)).toBe(true);
    sheet._toggleGroupOutline(0, 0);
    expect(sheet._groupOutlineCollapsed(0, 0)).toBe(true);
    expect(sheet.getRowVisible(1)).toBe(false);
    sheet._toggleGroupOutline(0, 0);
    expect(sheet.getRowVisible(1)).toBe(true);
    sheet._toggleGroupOutline(-1, 0);
    expect(sheet.getRowVisible(1)).toBe(false);
    sheet._toggleGroupOutline(-1, 0);
    expect(sheet.getRowVisible(1)).toBe(true);
    expect(sheet.detailColumnsVisible(false)).toBeUndefined();
    expect(sheet.getColumnVisible(2)).toBe(false);
    sheet.detailColumnsVisible(true);
    expect(sheet.groupOutlinePosition(2)).toBeUndefined();
    expect(sheet.groupOutlinePosition()).toBe(2);
    expect(sheet.getColumnWidth(0, 2)).toBe(120);
    expect(sheet._groupColumnHasOutline(0)).toBe(false);
    expect(sheet._groupHeaderOutlineLevels(0)).toEqual([0, 1]);
    sheet._toggleGroupHeaderOutline(0, 0);
    expect(sheet._groupHeaderOutlineCollapsed(0, 0)).toBe(true);
    expect(sheet.getRowVisible(1)).toBe(false);
    sheet._toggleGroupHeaderOutline(0, 0);
    expect(sheet.getRowVisible(1)).toBe(true);
    sheet.groupBy([{ field: 'region', summaryFields: [{ formula: '=SUM([id])' }] }]);
    expect(view.getRowData(0)['=SUM([id])__0__region__0']).toBe(4);
    expect(view.getRowData(1)['=SUM([id])__0__region__0']).toBe(4);
    view.updateItem(1, { id: 5 });
    expect(view.getRowData(0)['=SUM([id])__0__region__0']).toBe(6);
    view.updateItem(1, { id: 3 });
    sheet.groupBy([{ field: 'region', summaryFields: [{ formula: '=SUM([id])*2+COUNT([id])' }] }]);
    expect(view.getRowData(0)['=SUM([id])*2+COUNT([id])__0__region__0']).toBe(10);
    sheet.removeGroupBy();
    expect(sheet.groupBy()).toEqual([]);
    expect(sheet.getColumnWidth(0, 2)).toBe(40);
    expect(sheet.getColumnCount()).toBe(3);
    expect([0, 1, 2].map(row => view.getRowData(row).id)).toEqual([1, 2, 3]);
  });
  it('applies and undoes each column sort and filter command', async () => {
    const { workbook, sheet, view } = await fixture();
    const execute = (cmd: string, col: number, extra: Record<string, unknown> = {}) =>
      workbook.commandManager().execute({ cmd, sheetName: 'Data', col, ...extra });
    expect(execute('TableSheetAddSortColumn', 0, { ascending: false })).toBe(true);
    expect(execute('TableSheetAddSortColumn', 1, { ascending: true })).toBe(true);
    expect(sheet.sort()).toHaveLength(2);
    expect(execute('TableSheetRemoveSortColumn', 0)).toBe(true);
    expect(sheet.sort()).toHaveLength(1);
    workbook.undoManager().undo();
    expect(sheet.sort()).toHaveLength(2);
    expect(execute('TableSheetFilterColumn', 1, { values: [{ value: 'Ada' }] })).toBe(true);
    expect(view.visibleLength()).toBe(1);
    expect(execute('TableSheetRemoveFilterColumn', 1)).toBe(true);
    expect(view.visibleLength()).toBe(2);
    workbook.undoManager().undo();
    expect(view.visibleLength()).toBe(1);
    sheet.removeFilter();
    expect(execute('TableSheetFilterColumn', 0, {
      condition: { evaluate: (_sheet: unknown, _row: number, _col: number, value: unknown) => value === 2 },
    })).toBe(true);
    expect(view.getRowData(0).name).toBe('Ben');
  });

  it('reports part two features as unimplemented', async () => {
    const { sheet } = await fixture();
    sheet.printInfo().fitPagesWide(2);
    expect(sheet.printInfo().fitPagesWide()).toBe(2);
    sheet.currentTheme('Civic');
    expect(sheet.currentTheme().name()).toBe('Civic');
  });

  it('supports condition filters and function comparers', async () => {
    const { sheet, view } = await fixture();
    sheet.sort([{ field: 'id', ascending: true, compare: (a, b) => Number(b) - Number(a) }]);
    expect(view.getRowData(0).id).toBe(2);
    sheet.filter([{ field: 'id', condition: { evaluate: (_sheet: unknown, _row: number, _col: number, value: unknown) => value === 1 } }]);
    expect(view.visibleLength()).toBe(1);
    expect(view.getRowData(0).name).toBe('Ada');
  });

  it('pins selected rows and restores their order when unpinned', async () => {
    const { sheet, view } = await fixture();
    expect(sheet.togglePinnedRows([1])).toBe(1);
    expect(view.getRowData(0).name).toBe('Ben');
    expect(sheet.frozenRowCount()).toBe(1);
    expect(sheet.togglePinnedRows([0])).toBe(0);
    expect(view.getRowData(0).name).toBe('Ada');
    expect(sheet.frozenRowCount()).toBe(0);
  });

  it('pins columns while retaining their values and restores their original order', async () => {
    const { sheet } = await fixture();
    expect(sheet.togglePinnedColumns([1])).toBe(1);
    expect(sheet.getValue(0, 0)).toBe('Ada');
    expect(sheet.frozenColumnCount()).toBe(1);
    expect(sheet.togglePinnedColumns([0])).toBe(0);
    expect(sheet.getValue(0, 0)).toBe(1);
  });

  it('uses registered custom functions as named comparers', async () => {
    const { workbook, sheet, view } = await fixture();
    class Compare extends GC.Spread.CalcEngine.Functions.Function {
      constructor() { super('ComparePeople', 3, 3); }
      override evaluate(a: unknown, b: unknown): number {
        return Number(b) - Number(a);
      }
    }
    workbook.addCustomFunction(new Compare());
    sheet.sort([{ field: 'id', compare: 'ComparePeople', ascending: true }]);
    expect(view.getRowData(0).id).toBe(2);
    expect(sheet.sort()[0]?.compare).toBe('ComparePeople');
    sheet.removeSort();
    expect(view.getRowData(0).id).toBe(1);
  });

  it('keeps large bound views sparse and reads records near the end', async () => {
    const workbook = new GC.Spread.Sheets.Workbook(undefined, { sheetCount: 0 });
    const records = Array.from({ length: 100_000 }, (_, id) => ({ id, label: `Record ${id}` }));
    const view = workbook.dataManager().addTable('large', { data: records }).addView('v');
    await view.fetch();
    const sheet = workbook.addSheetTab(0, 'Large', GC.Spread.Sheets.SheetType.tableSheet) as InstanceType<
      typeof GC.Spread.Sheets.TableSheet.TableSheet>;
    sheet.setDataView(view);
    expect(sheet.getRowCount()).toBe(100_001);
    expect(sheet.getValue(99_999, 1)).toBe('Record 99999');
    expect(sheet.viewCellStore).toBeUndefined();
  });

});
