/**
 * TASK 49 item 2 — TableSheet workbook JSON interchange with the trial product.
 *
 * Every expectation here is a trial observation recorded under .probe/:
 * - api-sweep-item2.json     four-way trial<->ours interchange states (all equal),
 * - api-sweep-item2b.json    built-in names [ '@', 'AutoId' ], always-present rowFilter,
 *                            addition keys, getTableTheme().toJSON() name 'Light2',
 * - api-sweep-item2d.json    default composed row action, addition.defaults/grouping,
 *                            view styleRules, standalone view serialization,
 * - api-sweep-item2e/f.json  lastGroupCount = group fields + summaryFields entries,
 *                            pinnedRows/pinnedColumns as natural indexes,
 * - api-sweep-item2g.json    trial tolerance (missing grouping/tree, unknown keys),
 *                            condition filters serialized into filterItemMap,
 * - api-sweep-item2i.json    columnIndexMap must be omitted ([] in JSON) when identity:
 *                            a non-empty identity map makes the trial drop filters.
 */
import { describe, expect, it } from 'vitest';
import GC from '../src/index.js';

type TableSheetInstance = InstanceType<typeof GC.Spread.Sheets.TableSheet.TableSheet>;

async function richFixture() {
  const workbook = new GC.Spread.Sheets.Workbook(undefined, { sheetCount: 0 });
  const data = Array.from({ length: 8 }, (_, i) => ({
    id: i + 1, name: `Name ${i + 1}`, city: i % 2 ? 'Paris' : 'Rome', score: (i + 1) * 3,
  }));
  const table = workbook.dataManager().addTable('rich', { data });
  const viewA = table.addView('peopleA', [
    { value: 'id', caption: 'ID', width: 80 }, { value: 'name', caption: 'Name', width: 130 },
    { value: 'city', caption: 'City', width: 100 }, { value: 'score', caption: 'Score', width: 90 }]);
  const viewB = table.addView('peopleB', ['name', 'city']);
  await viewA.fetch();
  await viewB.fetch();
  const sheetA = workbook.addSheetTab(0, 'SheetA', GC.Spread.Sheets.SheetType.tableSheet) as TableSheetInstance;
  sheetA.setDataView(viewA);
  const sheetB = workbook.addSheetTab(1, 'SheetB', GC.Spread.Sheets.SheetType.tableSheet) as TableSheetInstance;
  sheetB.setDataView(viewB);
  return { workbook, table, viewA, viewB, sheetA, sheetB };
}

async function reload(json: Record<string, unknown>) {
  const restored = new GC.Spread.Sheets.Workbook(undefined, { sheetCount: 0 });
  await restored.fromJSON(JSON.parse(JSON.stringify(json)));
  const tab = (name: string) => (restored.getSheetTab?.(name) ?? restored.getSheetFromName(name)) as TableSheetInstance;
  return { restored, tab };
}

describe('TableSheet JSON trial shape', () => {
  it('serializes the trial addition keys (grouping/rowFilter/options/rowActionOptions/currentTheme/defaults)', async () => {
    const { workbook } = await richFixture();
    const json = JSON.parse(JSON.stringify(workbook.toJSON({ includeBindingSource: true })));
    const addition = json.sheetTabs.SheetA.addition;
    expect(Object.keys(addition).sort()).toEqual(
      ['currentTheme', 'dataView', 'defaults', 'grouping', 'options', 'rowActionOptions', 'rowFilter'].sort());
    expect(addition.grouping).toEqual({ outlinePosition: 1 });
    expect(addition.defaults).toEqual({ rowHeight: 30, colHeaderRowHeight: 30 });
    expect(addition.currentTheme.name).toBe('Light2');
    expect(addition.options.allowAddNew).toBe(true);
    expect(addition.options.columnTypeItems.length).toBe(16);
    expect(addition.options.menuItemVisibility.expandToLevelMenuItemVisible).toBe(false);
    expect(addition.options.groupLayout).toEqual({ mode: 0 });
    expect(addition.options.allowSorts).toBe(true);
    expect(addition.options.submitDefineColumnCommand).toBe('gc.spread.defineColumn.submit');
    workbook.destroy();
  });
  it('serializes the built-in names "@" and "AutoId" with trial formulas on every table-sheet tab', async () => {
    const { workbook } = await richFixture();
    const json = JSON.parse(JSON.stringify(workbook.toJSON({ includeBindingSource: true })));
    expect(json.sheetTabs.SheetA.names).toEqual([
      { name: '@', formula: 'SheetA!A1', row: 0, col: 0, isReadOnly: false },
      { name: 'AutoId', formula: 'MAX(OFFSET(SheetA!$A$1,0,COLUMN()-1,ROW()-1,1))+1', row: 0, col: 0, isReadOnly: false },
    ]);
    workbook.destroy();
  });
  it('ignores the built-in custom names on load and keeps user names', async () => {
    const { workbook, sheetA } = await richFixture();
    const json = workbook.toJSON({ includeBindingSource: true });
    const { restored, tab } = await reload(json);
    expect(tab('SheetA').getCustomNames()).toEqual([]);
    // Trial TableSheet tabs never expose these as user names; direct calls are ignored too.
    tab('SheetA').addCustomName('@', '1+1', 0, 0);
    tab('SheetA').addCustomName('AutoId', '2+2', 0, 0);
    expect(tab('SheetA').getCustomNames().length).toBe(0);
    restored.destroy();
    workbook.destroy();
    void sheetA;
  });
  it('always serializes a trial-shaped rowFilter and counts lastGroupCount like the trial', async () => {
    const { workbook, sheetB } = await richFixture();
    const json = JSON.parse(JSON.stringify(workbook.toJSON()));
    const rowFilter = json.sheetTabs.SheetB.rowFilter;
    expect(rowFilter.typeName).toBe('HideRowFilter');
    expect(rowFilter.range).toEqual({ row: -1, col: 0, rowCount: -1, colCount: 2 });
    expect(rowFilter.lastGroupCount).toBe(0);
    sheetB.groupBy([{ field: 'city' }]);
    expect(JSON.parse(JSON.stringify(workbook.toJSON())).sheetTabs.SheetB.rowFilter.lastGroupCount).toBe(1);
    sheetB.groupBy([{ field: 'city', summaryFields: [{ formula: '=SUM([score])', relateTo: 'score' }] }]);
    expect(JSON.parse(JSON.stringify(workbook.toJSON())).sheetTabs.SheetB.rowFilter.lastGroupCount).toBe(2);
    sheetB.groupBy([{ field: 'city' }, { field: 'name' }]);
    expect(JSON.parse(JSON.stringify(workbook.toJSON())).sheetTabs.SheetB.rowFilter.lastGroupCount).toBe(2);
    workbook.destroy();
  });
  it('omits an identity columnIndexMap and serializes pinned rows/columns as natural indexes', async () => {
    const { workbook, viewA, sheetA } = await richFixture();
    let json = JSON.parse(JSON.stringify(workbook.toJSON({ includeBindingSource: true })));
    expect(json.dataManager.tables[0].views[0].columnIndexMap).toEqual([]); // identity must be [] (probe item2i)
    expect(json.dataManager.tables[0].views[0].pinnedRows).toEqual([]);
    expect(json.dataManager.tables[0].views[0].pinnedColumns).toEqual([]);
    sheetA.togglePinnedRows([1]);
    sheetA.togglePinnedColumns([1]);
    json = JSON.parse(JSON.stringify(workbook.toJSON({ includeBindingSource: true })));
    expect(json.dataManager.tables[0].views[0].pinnedRows).toEqual([1]);
    expect(json.dataManager.tables[0].views[0].pinnedColumns).toEqual([1]);
    expect(json.dataManager.tables[0].views[0].columnIndexMap).toEqual([1, 0, 2, 3]);
    const { restored } = await reload(json);
    const viewCopy = (restored.getSheetTab('SheetA') as TableSheetInstance).getDataView();
    expect((viewCopy.getColumn() as unknown as { value?: string }[]).map(column => String(column.value))).toEqual(['name', 'id', 'city', 'score']);
    const again = JSON.parse(JSON.stringify(restored.toJSON({ includeBindingSource: true })));
    expect(again.dataManager.tables[0].views[0].pinnedRows).toEqual([1]);
    expect(again.dataManager.tables[0].views[0].pinnedColumns).toEqual([1]);
    restored.destroy();
    workbook.destroy();
    void viewA;
  });
  it('restores grouping and filters from trial view groupInfo/filterInfo', async () => {
    const { workbook, sheetB } = await richFixture();
    sheetB.groupBy([{ field: 'city', caption: 'City', summaryFields: [{ formula: '=SUM([score])', relateTo: 'score' }] }]);
    sheetB.filter([{ field: 'city', values: [{ value: 'Rome' }] }]);
    const json = workbook.toJSON({ includeBindingSource: true });
    const { restored, tab } = await reload(json);
    const sheetCopy = tab('SheetB');
    expect(sheetCopy.groupBy()).toEqual(
      [{ field: 'city', caption: 'City', summaryFields: [{ formula: '=SUM([score])', relateTo: 'score' }] }]);
    expect(sheetCopy.filter()).toEqual([{ field: 'city', values: [{ value: 'Rome', type: 'value' }] }]);
    restored.destroy();
    workbook.destroy();
  });
  it('reads back the trial default composed row action and round-trips user row actions', async () => {
    const { workbook, sheetA } = await richFixture();
    expect(sheetA.rowActionOptions().map(action => action.name)).toEqual(['composedPinDirtyNewWarningRow']);
    let json = JSON.parse(JSON.stringify(workbook.toJSON()));
    expect(json.sheetTabs.SheetA.addition.rowActionOptions).toEqual([
      { name: 'composedPinDirtyNewWarningRow',
        icons: ['ROW_ACTION_PIN_ROW', 'ROW_ACTION_NEW_ROW', 'ROW_ACTION_INSERTED_ROW', 'ROW_ACTION_UPDATED_ROW', 'ROW_ACTION_WARNING_INFO'] }]);
    sheetA.rowActionOptions([{ name: 'mark', icons: ['data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg"/%3E'], iconSelector: () => true }]);
    json = JSON.parse(JSON.stringify(workbook.toJSON()));
    expect(json.sheetTabs.SheetA.addition.rowActionOptions.map((action: { name?: string }) => action.name)).toEqual(['mark']);
    const { restored, tab } = await reload(json);
    expect(tab('SheetA').rowActionOptions().map(action => action.name)).toEqual(['mark']);
    restored.destroy();
    // trial: rowActionOptions([]) clears (probe item2f rowActionsClear)
    sheetA.rowActionOptions([]);
    expect(sheetA.rowActionOptions()).toEqual([]);
    workbook.destroy();
  });
  it('round-trips an applied table theme through addition.currentTheme', async () => {
    const { workbook, sheetA } = await richFixture();
    sheetA.applyTableTheme(GC.Spread.Sheets.Tables.TableThemes.dark1 as InstanceType<typeof GC.Spread.Sheets.Tables.TableTheme>);
    const json = workbook.toJSON({ includeBindingSource: true });
    expect(JSON.parse(JSON.stringify(json)).sheetTabs.SheetA.addition.currentTheme.name).toBe('Dark1');
    const { restored, tab } = await reload(json);
    expect(tab('SheetA').getTableTheme().name()).toBe('Dark1');
    restored.destroy();
    workbook.destroy();
  });
  it('serializes a condition filter into filterItemMap like the trial and restores it', async () => {
    const { workbook, sheetB } = await richFixture();
    sheetB.filter([{ field: 'city', condition: { relation: 'equals', operator: 'equals', value1: 'Rome' } }]);
    const json = JSON.parse(JSON.stringify(workbook.toJSON({ includeBindingSource: true })));
    const filterItemMap = json.sheetTabs.SheetB.rowFilter.filterItemMap;
    expect(filterItemMap[0].conditions[0]).toMatchObject({ relation: 'equals', operator: 'equals', value1: 'Rome', isCondition: false });
    expect(json.dataManager.tables[0].views[1].filterInfo).toEqual([{ field: 'city' }]); // probe item2g conditionFilter
    const { restored, tab } = await reload(json);
    expect(tab('SheetB').filter()).toEqual([{ field: 'city', condition: { relation: 'equals', operator: 'equals', value1: 'Rome' } }]);
    restored.destroy();
    workbook.destroy();
  });
  it('hides table-sheet columns whose bound view column is visible:false in the JSON', async () => {
    const { workbook, viewA, sheetA } = await richFixture();
    (viewA.getColumn() as unknown as { visible?: boolean }[])[2].visible = false;
    sheetA.setColumnVisible(2, false);
    const json = workbook.toJSON({ includeBindingSource: true });
    const { restored, tab } = await reload(json);
    const sheetCopy = tab('SheetA');
    expect(sheetCopy.getColumnVisible(2)).toBe(false);
    expect(((sheetCopy.getDataView().getColumn() as unknown as { visible?: boolean }[])[2] as { visible?: boolean }).visible).toBe(false);
    restored.destroy();
    workbook.destroy();
  });
  it('loads a hand-written trial-shaped workbook JSON (fixture from the recorded trial output)', async () => {
    const trialJson = {
      name: 'TrialBook', sheetCount: 0, sheetTabCount: 1,
      sheetTabs: {
        S: {
          name: 'S', rowCount: 5, columnCount: 3, sheetType: 0, theme: 'Office2007',
          names: [
            { name: '@', formula: 'S!A1', row: 0, col: 0, isReadOnly: false },
            { name: 'AutoId', formula: 'MAX(OFFSET(S!$A$1,0,COLUMN()-1,ROW()-1,1))+1', row: 0, col: 0, isReadOnly: false },
          ],
          rowFilter: { range: { row: -1, col: 0, rowCount: -1, colCount: 4 }, typeName: 'HideRowFilter',
            dialogVisibleInfo: { sortByColor: false, filterByColor: false },
            filterItemMap: [{ index: 3, conditions: [{ text: 'Rome', value: 'Rome', type: 'value', isCondition: false }] }],
            filteredColumns: [3], filterButtonVisibleInfo: { 0: true, 1: true, 2: true, 3: true },
            showFilterButton: true, filteredOutRows: [], sortMap: {}, relatedColFilters: {},
            lastGroup: false, lastGroupCount: 2, multiSortOrder: [] },
          addition: {
            dataView: { name: 'v', tableName: 't' },
            grouping: { outlinePosition: 1 },
            rowFilter: { range: { row: -1, col: 0, rowCount: -1, colCount: 4 }, typeName: 'HideRowFilter',
              filterButtonVisibleInfo: { 0: true, 1: true, 2: true, 3: true }, showFilterButton: true,
              filteredOutRows: [], sortMap: {}, relatedColFilters: {}, lastGroup: false, lastGroupCount: 2, multiSortOrder: [] },
            options: { allowAddNew: true, groupLayout: { mode: 0 }, allowSorts: true },
            rowActionOptions: [{ name: 'composedPinDirtyNewWarningRow', icons: ['ROW_ACTION_PIN_ROW'] }],
            currentTheme: { name: 'Light2' },
            defaults: { rowHeight: 30, colHeaderRowHeight: 30 },
          },
        },
      },
      dataManager: {
        tables: [{
          name: 't', primaryKey: '', columns: {},
          dataSourceOption: { batch: false, data: [{ id: 1, city: 'Rome' }, { id: 2, city: 'Paris' }, { id: 3, city: 'Rome' }] },
          views: [{
            name: 'v',
            columns: [{ name: 'id', value: 'id', width: 80 }, { name: 'city', value: 'city', width: 100 }],
            options: {}, indexMap: [0, 1, 2], columnIndexMap: [1, 0], pinnedRows: [2], pinnedColumns: [1],
            disableAuto: false, autoSort: true, autoFilter: false, autoGroup: true, detailColumnsVisible: true,
            groupInfo: [{ field: 'city', caption: 'City', summaryFields: [{ formula: '=SUM([id])', relateTo: 'id' }] }],
            filterInfo: [{ field: 'city', value: 'Rome' }],
          }],
        }],
        relationships: [],
      },
    };
    const { restored, tab } = await reload(trialJson);
    const sheet = tab('S');
    expect(sheet.groupBy()).toEqual(
      [{ field: 'city', caption: 'City', summaryFields: [{ formula: '=SUM([id])', relateTo: 'id' }] }]);
    expect(sheet.filter()).toEqual([{ field: 'city', values: [{ value: 'Rome', type: 'value' }] }]);
    expect((sheet.getDataView().getColumn() as unknown as { value?: string }[]).map(column => String(column.value))).toEqual(['city', 'id']); // pinned column first
    expect(sheet.rowActionOptions().map(action => action.name)).toEqual(['composedPinDirtyNewWarningRow']);
    expect(sheet.getCustomNames()).toEqual([]);
    // pinnedRows [2] (trial natural index): table row 2 (Rome, id 3) leads the display rows.
    expect(sheet.getDataView().getRowData(0).id).toBe(3);
    restored.destroy();
  });
});

/**
 * TASK 97 TS-1 — hierarchy + filter + sort combined interchange. All trial
 * observations recorded under .probe/hier-probe.json, hier-probe2.json and
 * hier-probe3.json (black-box runs of the same script against both products):
 * - live sort/filter over a hierarchy view orders siblings by the sort with
 *   children following their parent — ours already matched (cases A-D);
 * - pinned rows are INERT on hierarchy views: togglePinnedRows changes nothing,
 *   answers undefined and serializes pinnedRows [] (case F), while flat views
 *   pin and answer the count (case G);
 * - a hierarchy view with an active filter reloads in NATURAL hierarchy order:
 *   the trial keeps the sort spec (sort() read-back, rowFilter.sortMap, view
 *   sortInfo) but does not reapply it when a filter is restored (cases I/J/M);
 *   without a filter the sort is reapplied (case H), and flat views keep
 *   sort+filter+pin intact (case K);
 * - pinnedRows carried in JSON on a hierarchy view stay in the raw list but
 *   never move rows (richJSONHierarchyImportsOurWorkbook).
 */
describe('TableSheet hierarchy JSON interchange', () => {
  async function hierFixture() {
    const workbook = new GC.Spread.Sheets.Workbook(undefined, { sheetCount: 0 });
    const data = Array.from({ length: 12 }, (_, i) => ({
      id: i + 1, parentId: i >= 4 && i < 8 ? i - 3 : null, level: i >= 4 && i < 8 ? 1 : 0,
      name: `N${i + 1}`, city: i % 3 === 0 ? 'Paris' : 'Rome', score: (i + 1) * 5, order: i,
    }));
    const table = workbook.dataManager().addTable('hier', { data, schema: {
      hierarchy: { type: 'Parent', column: 'parentId' },
      columns: { id: { isPrimaryKey: true }, parentId: {}, level: {}, name: {}, city: {}, score: {},
        order: { dataType: 'rowOrder' } },
    } });
    const view = table.addView('hierV', [
      { value: 'id', caption: 'ID', width: 80 }, { value: 'name', caption: 'Name', width: 130, outlineColumn: true },
      { value: 'city', caption: 'City', width: 100 }, { value: 'score', caption: 'Score', width: 90 },
      { value: 'order', caption: 'Order', width: 70 }]);
    await view.fetch();
    const sheet = workbook.addSheetTab(0, 'Hier', GC.Spread.Sheets.SheetType.tableSheet) as TableSheetInstance;
    sheet.setDataView(view);
    return { workbook, view, sheet };
  }
  const ids = (view: { visibleLength(): number; getRowData(index: number): Record<string, unknown> }) =>
    Array.from({ length: view.visibleLength() }, (_, index) => view.getRowData(index).id);

  it('keeps live sort+filter over a hierarchy in trial order (siblings sorted, children follow parents)', async () => {
    const { workbook, view, sheet } = await hierFixture();
    sheet.sort([{ field: 'score', ascending: false }]);
    expect(ids(view)).toEqual([12, 11, 10, 9, 4, 8, 3, 7, 2, 6, 1, 5]);
    sheet.filter([{ field: 'city', values: [{ value: 'Rome' }] }]);
    expect(ids(view)).toEqual([12, 11, 9, 4, 8, 3, 7, 2, 6, 1, 5]);
    workbook.destroy();
  });

  it('makes pinned rows inert on hierarchy views (toggle undefined, no move, empty pinnedRows)', async () => {
    const { workbook, view, sheet } = await hierFixture();
    expect(sheet.togglePinnedRows([1])).toBeUndefined();
    expect(ids(view)).toEqual([1, 5, 2, 6, 3, 7, 4, 8, 9, 10, 11, 12]);
    const json = JSON.parse(JSON.stringify(workbook.toJSON({ includeBindingSource: true })));
    expect(json.dataManager.tables[0].views[0].pinnedRows).toEqual([]);
    workbook.destroy();
  });

  it('reloads a filtered hierarchy view in natural order with the sort spec kept for read-back', async () => {
    const { workbook, sheet } = await hierFixture();
    sheet.sort([{ field: 'score', ascending: false }]);
    sheet.filter([{ field: 'city', values: [{ value: 'Rome' }] }]);
    const json = JSON.parse(JSON.stringify(workbook.toJSON({ includeBindingSource: true })));
    workbook.destroy();
    const { restored, tab } = await reload(json);
    const sheet2 = tab('Hier');
    expect(ids((sheet2.getDataView()) as never)).toEqual([1, 5, 2, 6, 3, 7, 4, 8, 9, 11, 12]);
    expect(sheet2.sort()).toEqual([{ field: 'score', ascending: false }]);
    expect(sheet2.filter()).toEqual([{ field: 'city', values: [{ value: 'Rome', type: 'value' }] }]);
    const again = JSON.parse(JSON.stringify(restored.toJSON({ includeBindingSource: true })));
    expect(again.sheetTabs.Hier.rowFilter.sortMap['-1']).toEqual({ '3': { index: 3, ascending: false } });
    expect(again.sheetTabs.Hier.addition.rowFilter.sortMap['-1']).toEqual({ '3': { index: 3, ascending: false } });
    restored.destroy();
  });

  it('reloads a sorted hierarchy view (no filter) still sorted', async () => {
    const { workbook, sheet } = await hierFixture();
    sheet.sort([{ field: 'score', ascending: false }]);
    const json = JSON.parse(JSON.stringify(workbook.toJSON({ includeBindingSource: true })));
    workbook.destroy();
    const { restored, tab } = await reload(json);
    expect(ids((tab('Hier').getDataView()) as never)).toEqual([12, 11, 10, 9, 4, 8, 3, 7, 2, 6, 1, 5]);
    restored.destroy();
  });

  it('keeps JSON-carried pinned rows on a hierarchy view raw but inert on reload', async () => {
    const { workbook, sheet } = await hierFixture();
    sheet.sort([{ field: 'score', ascending: false }]);
    sheet.filter([{ field: 'city', values: [{ value: 'Rome' }] }]);
    const json = JSON.parse(JSON.stringify(workbook.toJSON({ includeBindingSource: true })));
    json.dataManager.tables[0].views[0].pinnedRows = [10]; // as our workbook answered the trial before the fix
    workbook.destroy();
    const { restored, tab } = await reload(json);
    expect(ids((tab('Hier').getDataView()) as never)).toEqual([1, 5, 2, 6, 3, 7, 4, 8, 9, 11, 12]);
    const again = JSON.parse(JSON.stringify(restored.toJSON({ includeBindingSource: true })));
    expect(again.dataManager.tables[0].views[0].pinnedRows).toEqual([10]);
    restored.destroy();
  });
});
