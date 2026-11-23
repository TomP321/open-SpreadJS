import { describe, expect, it } from 'vitest';
import { Workbook } from '../src/workbook.js';
import { ReportSheet } from '../src/report/index.js';
import { sheetPrintModels } from '../src/print-doc.js';

async function report() {
  const workbook = new Workbook(undefined, { sheetCount: 0 });
  const table = workbook.dataManager().addTable('T', { data: [
    { region: 'East', city: 'A', amount: 1 }, { region: 'East', city: 'B', amount: 2 },
    { region: 'West', city: 'C', amount: 3 },
  ] });
  await table.fetch();
  return workbook.addSheetTab(0, 'Report', 3) as ReportSheet;
}

async function report6ForAxes() {
  const workbook = new Workbook(undefined, { sheetCount: 0 });
  await workbook.dataManager().addTable('T', { data: [
    { region: 'East', city: 'A', amount: 1 }, { region: 'East', city: 'B', amount: 2 },
    { region: 'East', city: 'C', amount: 3 }, { region: 'West', city: 'A', amount: 4 },
    { region: 'West', city: 'B', amount: 5 }, { region: 'West', city: 'C', amount: 6 },
  ] }).fetch();
  return workbook.addSheetTab(0, 'Report', 3) as ReportSheet;
}

describe('ReportSheet trial comparison fixtures', () => {
  it('expands a child on a later template row within each parent group', async () => {
    const sheet = await report();
    const template = sheet.getTemplate();
    template.setTemplateCell(0, 0, { type: 'Group', binding: 'T[region]' });
    template.setTemplateCell(1, 1, { type: 'List', binding: 'T[city]', context: { vertical: 'A1' } });
    sheet.refresh();
    expect(sheet.getRange().rowCount).toBe(5);
    expect(Array.from({ length: 5 }, (_, row) => [sheet.getValue(row, 0), sheet.getValue(row, 1)]))
      .toEqual([['East', null], [null, 'A'], [null, 'B'], ['West', null], [null, 'C']]);
    expect(sheet.getSpan(0, 0)).toBeNull();
  });
  it('expands a list, preserving duplicates', async () => {
    const sheet = await report();
    sheet.getTemplate().setTemplateCell(0, 0, { type: 'List', binding: 'T[region]' });
    sheet.refresh();
    expect([0, 1, 2].map(row => sheet.getValue(row, 0))).toEqual(['East', 'East', 'West']);
    expect(sheet.getRange().rowCount).toBe(3);
  });
  it('groups and summarizes by the group', async () => {
    const sheet = await report();
    const template = sheet.getTemplate();
    template.setTemplateCell(0, 0, { type: 'Group', binding: 'T[region]' });
    template.setTemplateCell(0, 1, { type: 'Summary', binding: 'T[amount]', aggregate: 'Sum' });
    sheet.refresh();
    expect([0, 1].map(row => [sheet.getValue(row, 0), sheet.getValue(row, 1)])).toEqual([['East', 3], ['West', 3]]);
  });
  it('spans the outer group in the sampled two-level report', async () => {
    const sheet = await report();
    sheet.getTemplate().setTemplateCell(0, 0, { type: 'Group', binding: 'T[region]' });
    sheet.getTemplate().setTemplateCell(0, 1, { type: 'Group', binding: 'T[city]' });
    sheet.refresh();
    expect([0, 1, 2].map(row => [sheet.getValue(row, 0), sheet.getValue(row, 1)]))
      .toEqual([['East', 'A'], [null, 'B'], ['West', 'C']]);
    expect(sheet.getSpan(0, 0)).toMatchObject({ row: 0, col: 0, rowCount: 2, colCount: 1 });
  });
  it('expands list records within each group and honors an independent vertical context', async () => {
    const workbook = new Workbook(undefined, { sheetCount: 0 });
    await workbook.dataManager().addTable('T', { data: [
      { g: 'A', v: 1 }, { g: 'B', v: 3 }, { g: 'A', v: 2 },
    ] }).fetch();
    const sheet = workbook.addSheetTab(0, 'Report', 3) as ReportSheet;
    const template = sheet.getTemplate();
    template.setTemplateCell(0, 0, { type: 'Group', binding: 'T[g]' });
    template.setTemplateCell(0, 1, { type: 'List', binding: 'T[v]', context: { vertical: 'A1' } });
    sheet.refresh();
    expect([0, 1, 2].map(row => [sheet.getValue(row, 0), sheet.getValue(row, 1)]))
      .toEqual([['A', 1], [null, 2], ['B', 3]]);
    expect(sheet.getSpan(0, 0)?.rowCount).toBe(2);
    template.setTemplateCell(0, 1, { type: 'List', binding: 'T[v]', context: { vertical: 'None' } });
    sheet.refresh();
    expect([0, 1, 2].map(row => [sheet.getValue(row, 0), sheet.getValue(row, 1)]))
      .toEqual([['A', 1], ['B', 3], [null, 2]]);
    expect(sheet.getSpan(0, 0)).toBeNull();
  });
  it('groups repeated inner values separately within each outer group', async () => {
    const workbook = new Workbook(undefined, { sheetCount: 0 });
    await workbook.dataManager().addTable('T', { data: [
      { g: 'A', v: 'X' }, { g: 'B', v: 'X' }, { g: 'A', v: 'Y' },
    ] }).fetch();
    const sheet = workbook.addSheetTab(0, 'Report', 3) as ReportSheet;
    sheet.getTemplate().setTemplateCell(0, 0, { type: 'Group', binding: 'T[g]' });
    sheet.getTemplate().setTemplateCell(0, 1, { type: 'Group', binding: 'T[v]', context: { vertical: 'A1' } });
    sheet.refresh();
    expect([0, 1, 2].map(row => [sheet.getValue(row, 0), sheet.getValue(row, 1)]))
      .toEqual([['A', 'X'], [null, 'Y'], ['B', 'X']]);
    expect(sheet.getSpan(0, 0)?.rowCount).toBe(2);
  });
  it('expands horizontally and paginates the sampled list', async () => {
    const sheet = await report();
    const template = sheet.getTemplate();
    template.setTemplateCell(0, 0, { type: 'List', binding: 'T[region]', spillDirection: 'Horizontal' });
    sheet.refresh();
    expect([0, 1, 2].map(col => sheet.getValue(0, col))).toEqual(['East', 'East', 'West']);
    template.setTemplateCell(0, 0, { type: 'List', binding: 'T[region]' });
    template.setPaginationSetting({ rowPagination: { paginationDataCell: 'A1', rowCountPerPage: 2 } });
    sheet.renderMode('PaginatedPreview');
    expect(sheet.getPagesCount()).toBe(2);
    expect([0, 1].map(row => sheet.getValue(row, 0))).toEqual(['East', 'East']);
  });
});

describe('ReportSheet filtering and sorting trial observations', () => {
  it('filters by a value and by a parameter', async () => {
    const sheet = await report();
    const template = sheet.getTemplate();
    template.setTemplateCell(0, 0, { type: 'List', binding: 'T[region]',
      filter: { condition: { column: 'amount', operator: 'GreaterThan', value: 1 } } });
    sheet.refresh();
    expect([0, 1].map(row => sheet.getValue(row, 0))).toEqual(['East', 'West']);
    sheet.parameter({ region: 'West' });
    template.setTemplateCell(0, 0, { type: 'List', binding: 'T[region]',
      filter: { condition: { column: 'region', operator: 'Equal', parameter: 'region' } } });
    sheet.refresh();
    expect(sheet.getRange().rowCount).toBe(1);
    expect(sheet.getValue(0, 0)).toBe('West');
  });
  it('sorts by a different field and supports a non-spilling list', async () => {
    const sheet = await report();
    const template = sheet.getTemplate();
    template.setTemplateCell(0, 0, { type: 'List', binding: 'T[region]', sortOptions: [{ desc: 'amount' }] });
    sheet.refresh();
    expect([0, 1, 2].map(row => sheet.getValue(row, 0))).toEqual(['West', 'East', 'East']);
    template.setTemplateCell(0, 0, { type: 'List', binding: 'T[region]', spillDirection: 'None' });
    sheet.refresh();
    expect(sheet.getValue(0, 0)).toEqual(['East', 'East', 'West']);
  });
});

describe('ReportSheet template formatting trial observation', () => {
  it('copies formatting and dimensions to expanded outer groups', async () => {
    const sheet = await report();
    const template = sheet.getTemplate();
    template.setTemplateCell(0, 0, { type: 'Group', binding: 'T[region]' });
    template.setTemplateCell(0, 1, { type: 'List', binding: 'T[amount]' });
    template.getCell(0, 0).backColor('red');
    template.setRowHeight(0, 35);
    template.setColumnWidth(0, 90);
    sheet.refresh();
    expect([0, 2].map(row => sheet.getStyle(row, 0)?.backColor)).toEqual(['red', 'red']);
    expect([0, 2].map(row => sheet.getRowHeight(row))).toEqual([35, 35]);
    expect(sheet.getColumnWidth(0)).toBe(90);
  });
  it('keeps nested groups unexpanded in design mode', async () => {
    const sheet = await report();
    const template = sheet.getTemplate();
    template.setTemplateCell(0, 0, { type: 'Group', binding: 'T[region]' });
    template.setTemplateCell(0, 1, { type: 'List', binding: 'T[amount]' });
    template.getCell(0, 0).backColor('red');
    template.setRowHeight(0, 35);
    template.setColumnWidth(0, 90);
    sheet.renderMode('Design');
    expect([0, 1, 2].map(row => [sheet.getValue(row, 0), sheet.getValue(row, 1)]))
      .toEqual([[null, null], [null, null], [null, null]]);
    expect([0, 2].map(row => sheet.getStyle(row, 0)?.backColor ?? null)).toEqual(['red', null]);
    expect([0, 2].map(row => sheet.getRowHeight(row))).toEqual([35, 20]);
    expect(sheet.getColumnWidth(0)).toBe(90);
    expect(sheet.getSpan(0, 0)).toBeNull();
  });
  it('extends the sheet for outer groups beyond the initial row count', async () => {
    const workbook = new Workbook(undefined, { sheetCount: 0 });
    await workbook.dataManager().addTable('T', {
      data: Array.from({ length: 250 }, (_, i) => ({ g: `G${i}`, v: i })),
    }).fetch();
    const sheet = workbook.addSheetTab(0, 'Report', 3) as ReportSheet;
    sheet.getTemplate().setTemplateCell(0, 0, { type: 'Group', binding: 'T[g]' });
    sheet.getTemplate().setTemplateCell(0, 1, { type: 'List', binding: 'T[v]' });
    sheet.refresh();
    expect(sheet.getRange().rowCount).toBe(250);
    expect([sheet.getValue(249, 0), sheet.getValue(249, 1)]).toEqual(['G249', 249]);
  });
  it('shifts a footer past repeated vertically merged cells', async () => {
    const sheet = await report();
    const template = sheet.getTemplate();
    template.setTemplateCell(0, 0, { type: 'List', binding: 'T[region]' });
    template.addSpan(0, 0, 2, 1);
    template.setValue(2, 0, 'footer');
    sheet.refresh();
    expect(Array.from({ length: 7 }, (_, row) => sheet.getValue(row, 0)))
      .toEqual(['East', null, 'East', null, 'West', null, 'footer']);
    expect([0, 2, 4].map(row => sheet.getSpan(row, 0)?.rowCount)).toEqual([2, 2, 2]);
    expect(sheet.getRange().rowCount).toBe(7);
  });
  it('copies a horizontal span and dimensions to each expanded list item', async () => {
    const sheet = await report();
    const template = sheet.getTemplate();
    template.setTemplateCell(0, 0, { type: 'List', binding: 'T[region]' });
    template.addSpan(0, 0, 1, 2);
    template.setRowHeight(0, 35);
    template.setColumnWidth(0, 88);
    sheet.refresh();
    expect(sheet.getSpan(1, 0)).toMatchObject({ row: 1, col: 0, rowCount: 1, colCount: 2 });
    expect(sheet.getRowHeight(1)).toBe(35);
    expect(sheet.getColumnWidth(0)).toBe(88);
  });
});

describe('ReportSheet ordinary content trial observations', () => {
  it('repeats adjacent content and shifts content below an expanded list', async () => {
    const sheet = await report();
    const template = sheet.getTemplate();
    template.setValue(0, 0, 'Heading');
    template.setTemplateCell(1, 0, { type: 'List', binding: 'T[amount]' });
    template.setValue(1, 1, 'Label');
    template.setValue(2, 0, 'Footer');
    sheet.refresh();
    expect([0, 1, 2, 3, 4].map(row => [sheet.getValue(row, 0), sheet.getValue(row, 1)]))
      .toEqual([['Heading', null], [1, 'Label'], [2, 'Label'], [3, 'Label'], ['Footer', null]]);
    expect(sheet.getCells(1, 0)).toEqual([
      { value: 1, row: 1, col: 0, rowCount: 1, colCount: 1 },
      { value: 2, row: 2, col: 0, rowCount: 1, colCount: 1 },
      { value: 3, row: 3, col: 0, rowCount: 1, colCount: 1 },
    ]);
  });
  it('translates formulas beside expanded data', async () => {
    const sheet = await report();
    const template = sheet.getTemplate();
    template.setTemplateCell(1, 0, { type: 'List', binding: 'T[amount]' });
    template.setFormula(1, 1, 'A2*2');
    sheet.refresh();
    expect([1, 2, 3].map(row => sheet.getValue(row, 1))).toEqual([2, 4, 6]);
  });
});

describe('ReportSheet JSON trial observations', () => {
  it('round-trips template layout and data entry settings in templateSetting', async () => {
    const sheet = await report();
    const template = sheet.getTemplate();
    const layout = { type: 'RowLayout', dataRange: 'A1:B2', rowCount: 2 };
    const dataEntry = [{ name: 'x', tableName: 'T', fields: [] }];
    template.setLayoutSetting(layout);
    template.setDataEntrySetting(dataEntry);
    const json = template.toJSON();
    expect(json.templateSetting).toMatchObject({ layoutSetting: layout, dataEntrySetting: dataEntry });
    template.fromJSON(json);
    expect(template.getLayoutSetting()).toEqual(layout);
    expect(template.getDataEntrySetting()).toEqual(dataEntry);
  });
  it('stores template bindings and pagination in the trial JSON structure', async () => {
    const sheet = await report();
    sheet.getTemplate().setTemplateCell(0, 0, { type: 'List', binding: 'T[region]' });
    sheet.getTemplate().setPaginationSetting({ rowPagination: { paginationDataCell: 'A1', rowCountPerPage: 2 } });
    const json = sheet.toJSON();
    expect(json).toMatchObject({ name: 'Report', reportName: 'Report', sheetType: 3, renderMode: 'Preview', parameter: {},
      template: { data: { dataTable: { 0: { 0: { bindingPath: { type: 'List', binding: 'T[region]' } } } } },
        templateSetting: { paginationSetting: { rowPagination: { paginationDataCell: 'A1', rowCountPerPage: 2 } } } } });
    sheet.fromJSON(json);
    expect(sheet.getTemplate().getTemplateCell(0, 0)).toEqual({ type: 'List', binding: 'T[region]' });
    expect(sheet.getValue(0, 0)).toBe('East');
  });
});

describe('ReportSheet data entry trial observations', () => {
  it('inserts a blank record after the selected list row and tracks deleting an existing record', async () => {
    const sheet = await report();
    const template = sheet.getTemplate();
    template.setTemplateCell(0, 0, { type: 'List', binding: 'T[amount]' });
    template.setTemplateCell(0, 1, { type: 'List', binding: 'T[city]' });
    const rule = { name: 'rule', tableName: 'T', fields: [
      { dbColumnName: 'amount', formula: 'A1', isPrimary: true }, { dbColumnName: 'city', formula: 'B1' },
    ] };
    template.setDataEntrySetting([rule]);
    sheet.refresh();
    sheet.addRecordAt(1, 0);
    expect([0, 1, 2, 3].map(row => [sheet.getValue(row, 0), sheet.getValue(row, 1)]))
      .toEqual([[1, 'A'], [2, 'B'], [null, null], [3, 'C']]);
    expect(sheet.isDirty()).toBe(false);
    sheet.updateCellValue(2, 0, 4);
    sheet.updateCellValue(2, 1, 'D');
    sheet.deleteRecordAt(1, 0);
    expect([0, 1, 2].map(row => [sheet.getValue(row, 0), sheet.getValue(row, 1)]))
      .toEqual([[1, 'A'], [4, 'D'], [3, 'C']]);
    expect(sheet.getChanges()).toEqual([{ records: [{ entity: { amount: 4, city: 'D' }, info: {
      amount: { state: 'updated', row: 1, col: 0 }, city: { state: 'updated', row: 1, col: 1 },
    } }], deleteRecords: [{ entity: { amount: 2 }, info: { amount: { state: 'normal', row: 1, col: 0 } } }], rule }]);
    sheet.submit();
    expect(sheet.isDirty()).toBe(false);
    sheet.refresh();
    expect([0, 1, 2].map(row => [sheet.getValue(row, 0), sheet.getValue(row, 1)]))
      .toEqual([[1, 'A'], [3, 'C'], [4, 'D']]);
  });
  it('submits a changed record to its data table and clears the change state', async () => {
    const sheet = await report();
    const template = sheet.getTemplate();
    template.setTemplateCell(0, 0, { type: 'List', binding: 'T[amount]' });
    template.setTemplateCell(0, 1, { type: 'List', binding: 'T[city]' });
    const rule = { name: 'rule', tableName: 'T', fields: [
      { dbColumnName: 'amount', formula: 'A1', isPrimary: true }, { dbColumnName: 'city', formula: 'B1' },
    ] };
    template.setDataEntrySetting([rule]);
    sheet.refresh();
    sheet.updateCellValue(1, 1, 'Z');
    sheet.submit();
    expect(sheet.getValue(1, 1)).toBe('Z');
    expect(sheet.getChanges()).toEqual([{ records: [], deleteRecords: [], rule }]);
    expect(sheet.isDirty()).toBe(false);
    sheet.refresh();
    expect(sheet.getValue(1, 1)).toBe('Z');
  });
  it('tracks updates and clears them when the original value is restored', async () => {
    const sheet = await report();
    const template = sheet.getTemplate();
    template.setTemplateCell(0, 0, { type: 'List', binding: 'T[amount]' });
    template.setTemplateCell(0, 1, { type: 'List', binding: 'T[city]' });
    const rule = { name: 'rule', tableName: 'T', fields: [
      { dbColumnName: 'amount', formula: 'A1', isPrimary: true }, { dbColumnName: 'city', formula: 'B1' },
    ] };
    template.setDataEntrySetting([rule]);
    sheet.refresh();
    expect(sheet.getChanges()).toEqual([{ records: [], deleteRecords: [], rule }]);
    expect(sheet.isDirty()).toBe(false);
    sheet.updateCellValue(1, 1, 'Z');
    expect(sheet.getChanges()).toEqual([{ records: [{ entity: { amount: 2, city: 'Z' }, info: {
      amount: { state: 'normal', row: 1, col: 0 }, city: { oldValue: 'B', state: 'updated', row: 1, col: 1 },
    } }], deleteRecords: [], rule }]);
    expect(sheet.isDirty()).toBe(true);
    sheet.resetCellValue(1, 1);
    expect(sheet.getValue(1, 1)).toBe('B');
    expect(sheet.isDirty()).toBe(false);
    sheet.updateCellValue(1, 1, 'Z');
    sheet.updateCellValue(1, 1, 'B');
    expect(sheet.getChanges()).toEqual([{ records: [], deleteRecords: [], rule }]);
  });
});

describe('ReportSheet pagination trial observations', () => {
  // Restored by the supervisor (TASK 48 removed it): re-probed on the trial 2026-11-17 — a Group pagination cell with
  // rowCountPerPage 1 keeps its expanded children on ONE page (pages 1, values East/A, null/B, West/C, span 2x1).
  it('keeps expanded children together when the pagination cell is a group', async () => {
    const sheet = await report();
    const template = sheet.getTemplate();
    template.setTemplateCell(0, 0, { type: 'Group', binding: 'T[region]' });
    template.setTemplateCell(0, 1, { type: 'List', binding: 'T[city]' });
    template.setPaginationSetting({ rowPagination: { paginationDataCell: 'A1', rowCountPerPage: 1 } });
    sheet.renderMode('PaginatedPreview');
    sheet.currentPage(1);
    expect(sheet.getPagesCount()).toBe(1);
    expect([0, 1, 2].map(row => [sheet.getValue(row, 0), sheet.getValue(row, 1)]))
      .toEqual([['East', 'A'], [null, 'B'], ['West', 'C']]);
    expect(sheet.getSpan(0, 0)).toMatchObject({ row: 0, col: 0, rowCount: 2, colCount: 1 });
  });
});

describe('ReportSheet report options trial observations', () => {
  it('exposes the report options with the trial defaults and keeps renderMode in step', async () => {
    const sheet = await report();
    const options = sheet.options as unknown as { printAllPages: boolean; showHiddenRowCol: boolean; joinType: string;
      renderMode: string; dirtyStyle: { toJSON(): unknown }; hiddenRowColStyle: unknown };
    expect(options.printAllPages).toBe(true);
    expect(options.showHiddenRowCol).toBe(false);
    expect(options.joinType).toBe('Left');
    expect(options.renderMode).toBe('Preview');
    expect(options.dirtyStyle.toJSON()).toEqual({
      decoration: { cornerFold: { size: 6, position: 1, color: '#FF3D00' } },
    });
    expect(typeof options.hiddenRowColStyle).toBe('object');
    sheet.renderMode('PaginatedPreview');
    expect((sheet.options as unknown as { renderMode: string }).renderMode).toBe('PaginatedPreview');
  });
});

describe('ReportSheet paginated preview trial observations', () => {
  async function report8() {
    const workbook = new Workbook(undefined, { sheetCount: 0 });
    await workbook.dataManager().addTable('T', { data: [
      { region: 'East', city: 'A', amount: 1 }, { region: 'East', city: 'B', amount: 2 },
      { region: 'East', city: 'C', amount: 3 }, { region: 'East', city: 'D', amount: 4 },
      { region: 'West', city: 'A', amount: 5 }, { region: 'West', city: 'B', amount: 6 },
      { region: 'West', city: 'C', amount: 7 }, { region: 'West', city: 'D', amount: 8 },
    ] }).fetch();
    return workbook.addSheetTab(0, 'Report', 3) as ReportSheet;
  }
  const grid = (sheet: { getRowCount(): number; getColumnCount(): number; getValue(row: number, col: number): unknown }) =>
    Array.from({ length: sheet.getRowCount() }, (_, row) =>
      Array.from({ length: sheet.getColumnCount() }, (_, col) => sheet.getValue(row, col)));
  const preview = (sheet: ReportSheet) => {
    const range = sheet.getRange();
    return Array.from({ length: range.rowCount }, (_, row) =>
      Array.from({ length: range.colCount }, (_, col) => sheet.getValue(row, col)));
  };

  it('cuts the paginated list across pages and repeats the group header on every page', async () => {
    const sheet = await report();
    const template = sheet.getTemplate();
    template.setTemplateCell(0, 0, { type: 'Group', binding: 'T[region]' });
    template.setTemplateCell(0, 1, { type: 'List', binding: 'T[city]' });
    template.setPaginationSetting({ rowPagination: { paginationDataCell: 'B1', rowCountPerPage: 2 } });
    sheet.renderMode('PaginatedPreview');
    expect(sheet.getPagesCount()).toBe(2);
    expect(preview(sheet)).toEqual([['East', 'A'], [null, 'B']]);
    expect(sheet.getSpan(0, 0)).toMatchObject({ row: 0, col: 0, rowCount: 2, colCount: 1 });
    const pages = sheet.generatePageSheets(false);
    expect(pages.map(page => page.name())).toEqual(['Report-1', 'Report-2']);
    expect(pages.map(page => grid(page))).toEqual([[['East', 'A'], [null, 'B']], [['West', 'C']]]);
    expect(pages[0].getSpan(0, 0)).toMatchObject({ rowCount: 2, colCount: 1 });
    expect(pages[1].getSpan(0, 0)).toBeNull();
    expect(sheet.currentPage()).toBe(0);
  });
  it('keeps the preview on the selected page until refresh returns it to the first page', async () => {
    const sheet = await report8();
    const template = sheet.getTemplate();
    template.setTemplateCell(0, 0, { type: 'List', binding: 'T[city]' });
    template.setPaginationSetting({ rowPagination: { paginationDataCell: 'A1', rowCountPerPage: 3 } });
    sheet.renderMode('PaginatedPreview');
    expect(sheet.getPagesCount()).toBe(3);
    sheet.currentPage(1);
    expect(preview(sheet)).toEqual([['D'], ['A'], ['B']]);
    expect(sheet.currentPage()).toBe(1);
    sheet.refresh();
    expect(sheet.currentPage()).toBe(0);
    expect(preview(sheet)).toEqual([['A'], ['B'], ['C']]);
  });
  it('repeats only the configured title rows and keeps the other rows on the first page', async () => {
    const sheet = await report8();
    const template = sheet.getTemplate();
    template.setValue(0, 0, 'TOP');
    template.setValue(1, 0, 'HEAD');
    template.setTemplateCell(2, 0, { type: 'List', binding: 'T[city]' });
    template.setPaginationSetting({ titleRow: { start: 1, end: 1 },
      rowPagination: { paginationDataCell: 'A3', rowCountPerPage: 2 } });
    sheet.renderMode('PaginatedPreview');
    expect(sheet.getPagesCount()).toBe(4);
    const pages = sheet.generatePageSheets(false).map(page => grid(page));
    expect(pages[0]).toEqual([['TOP'], ['HEAD'], ['A'], ['B']]);
    expect(pages[1]).toEqual([['HEAD'], ['C'], ['D']]);
    expect(pages[3]).toEqual([['HEAD'], ['C'], ['D']]);
  });
  it('repeats only the configured end rows and keeps the other rows on the last page', async () => {
    const sheet = await report8();
    const template = sheet.getTemplate();
    template.setTemplateCell(0, 0, { type: 'List', binding: 'T[city]' });
    template.setValue(2, 0, 'MID');
    template.setValue(3, 0, 'END1');
    template.setValue(4, 0, 'END2');
    template.setPaginationSetting({ endRow: { start: 3, end: 4 },
      rowPagination: { paginationDataCell: 'A1', rowCountPerPage: 2 } });
    sheet.renderMode('PaginatedPreview');
    expect(sheet.getPagesCount()).toBe(4);
    const pages = sheet.generatePageSheets(false).map(page => grid(page));
    expect(pages[0]).toEqual([['A'], ['B'], ['END1'], ['END2']]);
    expect(pages[3]).toEqual([['C'], ['D'], [null], ['MID'], ['END1'], ['END2']]);
  });
  it('repeats title and end rows with the remaining rows only on the last page', async () => {
    // TASK 48 trial values (probe report-pgcheck2 `titleEnd`): a single-column report keeps two
    // page layouts (first/last records) and the configured end row repeats on every page; the
    // unconfigured row between anchor and end shows on the last page only.
    const sheet = await report8();
    const template = sheet.getTemplate();
    template.setValue(0, 0, 'HEAD');
    template.setTemplateCell(1, 0, { type: 'List', binding: 'T[city]' });
    template.setValue(2, 0, 'MID');
    template.setValue(3, 0, 'FOOT');
    template.setPaginationSetting({ titleRow: { start: 0, end: 0 }, endRow: { start: 3, end: 3 },
      rowPagination: { paginationDataCell: 'A2', rowCountPerPage: 2 } });
    sheet.renderMode('PaginatedPreview');
    expect(sheet.getPagesCount()).toBe(4);
    const pages = sheet.generatePageSheets(false).map(page => grid(page));
    expect(pages[0]).toEqual([['HEAD'], ['A'], ['B'], ['FOOT']]);
    expect(pages[1]).toEqual([['HEAD'], ['C'], ['D'], ['FOOT']]);
    expect(pages[2]).toEqual([['HEAD'], ['A'], ['B'], ['FOOT']]);
    expect(pages[3]).toEqual([['HEAD'], ['C'], ['D'], ['MID'], ['FOOT']]);
  });
  it('expands the print run over the report pages selected with printPageIndexes', async () => {
    const sheet = await report8();
    const template = sheet.getTemplate();
    template.setTemplateCell(0, 0, { type: 'List', binding: 'T[city]' });
    template.setPaginationSetting({ rowPagination: { paginationDataCell: 'A1', rowCountPerPage: 3 } });
    sheet.renderMode('PaginatedPreview');
    expect(sheet._printPageIndices()).toEqual([0, 1, 2]);
    expect(sheetPrintModels(sheet).length).toBe(3);
    sheet.printPageIndexes([0, 2]);
    expect(sheet._printPageIndices()).toEqual([0, 2]);
    expect(sheetPrintModels(sheet).length).toBe(2);
    expect(sheet.currentPage()).toBe(0);
    (sheet.options as unknown as { printAllPages: boolean }).printAllPages = false;
    expect(sheet._printPageIndices()).toBeUndefined();
    expect(sheetPrintModels(sheet).length).toBe(1);
  });
});

describe('ReportSheet pagination trial observations', () => {  it('keeps expanded children together when the pagination cell is a group', async () => {
    const sheet = await report();
    const template = sheet.getTemplate();
    template.setTemplateCell(0, 0, { type: 'Group', binding: 'T[region]' });
    template.setTemplateCell(0, 1, { type: 'List', binding: 'T[city]' });
    template.setPaginationSetting({ rowPagination: { paginationDataCell: 'A1', rowCountPerPage: 1 } });
    sheet.renderMode('PaginatedPreview');
    sheet.currentPage(1);
    expect(sheet.getPagesCount()).toBe(1);
    expect([0, 1, 2].map(row => [sheet.getValue(row, 0), sheet.getValue(row, 1)]))
      .toEqual([['East', 'A'], [null, 'B'], ['West', 'C']]);
    expect(sheet.getSpan(0, 0)).toMatchObject({ row: 0, col: 0, rowCount: 2, colCount: 1 });
  });
  it.each([
    ['title', { titleRow: { start: 0, end: 0 } }, [['Header', 1, 2], ['Header', 3, 'Footer']]],
    ['end', { endRow: { start: 2, end: 2 } }, [['Header', 1, 2, 'Footer'], [3, 'Footer']]],
  ])('repeats only the configured %s rows', async (_name, repeated, expected) => {
    const sheet = await report();
    const template = sheet.getTemplate();
    template.setValue(0, 0, 'Header');
    template.setTemplateCell(1, 0, { type: 'List', binding: 'T[amount]' });
    template.setValue(2, 0, 'Footer');
    template.setPaginationSetting({ ...repeated, rowPagination: { paginationDataCell: 'A2', rowCountPerPage: 2 } });
    sheet.renderMode('PaginatedPreview');
    for (let page = 0; page < 2; page++) {
      sheet.currentPage(page);
      expect(Array.from({ length: sheet.getRange().rowCount }, (_, row) => sheet.getValue(row, 0))).toEqual(expected[page]);
    }
  });
  it('paginates a list and its per-record summary together', async () => {
    // TASK 48 trial values (probe report-pgcheck2 `listSummary`).
    const sheet = await report();
    const template = sheet.getTemplate();
    template.setTemplateCell(0, 0, { type: 'List', binding: 'T[amount]' });
    template.setTemplateCell(0, 1, { type: 'Summary', binding: 'T[amount]', aggregate: 'Sum' });
    template.setPaginationSetting({ rowPagination: { paginationDataCell: 'A1', rowCountPerPage: 2 } });
    sheet.renderMode('PaginatedPreview');
    expect(sheet.getPagesCount()).toBe(2);
    expect([sheet.getValue(0, 1), sheet.getValue(1, 1)]).toEqual([1, 2]);
    sheet.currentPage(1);
    expect(sheet.getPagesCount()).toBe(2);
    expect([sheet.getValue(0, 0), sheet.getValue(0, 1)]).toEqual([3, 3]);
    expect([sheet.getValue(1, 0), sheet.getValue(1, 1)]).toEqual([null, null]);
  });
  it('repeats a configured header and footer on every page', async () => {
    const sheet = await report();
    const template = sheet.getTemplate();
    template.setValue(0, 0, 'header');
    template.setTemplateCell(1, 0, { type: 'List', binding: 'T[amount]' });
    template.setValue(2, 0, 'footer');
    template.setPaginationSetting({ titleRow: { start: 0, end: 0 }, endRow: { start: 2, end: 2 },
      rowPagination: { paginationDataCell: 'A2', rowCountPerPage: 2 } });
    sheet.renderMode('PaginatedPreview');
    expect(sheet.getPageCount()).toBe(2);
    expect(Array.from({ length: sheet.getRange().rowCount }, (_, row) => sheet.getValue(row, 0)))
      .toEqual(['header', 1, 2, 'footer']);
    sheet.currentPage(1);
    expect(Array.from({ length: sheet.getRange().rowCount }, (_, row) => sheet.getValue(row, 0)))
      .toEqual(['header', 3, 'footer']);
  });
  it('repeats header and footer around multiple paginated columns', async () => {
    const sheet = await report();
    const template = sheet.getTemplate();
    template.setValue(0, 0, 'header');
    template.setTemplateCell(1, 0, { type: 'List', binding: 'T[amount]' });
    template.setTemplateCell(1, 1, { type: 'List', binding: 'T[city]' });
    template.setValue(2, 0, 'footer');
    template.setPaginationSetting({ titleRow: { start: 0, end: 0 }, endRow: { start: 2, end: 2 },
      rowPagination: { paginationDataCell: 'A2', rowCountPerPage: 2 } });
    sheet.renderMode('PaginatedPreview');
    expect(Array.from({ length: sheet.getRange().rowCount }, (_, row) => [sheet.getValue(row, 0), sheet.getValue(row, 1)]))
      .toEqual([['header', null], [1, 'A'], [2, 'B'], ['footer', null]]);
    sheet.currentPage(1);
    expect(sheet.getPageCount()).toBe(2);
    expect(Array.from({ length: sheet.getRange().rowCount }, (_, row) => [sheet.getValue(row, 0), sheet.getValue(row, 1)]))
      .toEqual([['header', null], [3, 'C'], ['footer', null]]);
  });
});

describe('ReportSheet export trial observations', () => {
  it('returns a static worksheet with generated values and dimensions', async () => {
    const sheet = await report();
    sheet.getTemplate().setTemplateCell(0, 0, { type: 'List', binding: 'T[amount]' });
    sheet.getTemplate().setTemplateCell(0, 1, { type: 'List', binding: 'T[city]' });
    sheet.refresh();
    const copy = sheet.toWorksheet();
    expect(copy.name()).toBe('Report');
    expect([copy.getRowCount(), copy.getColumnCount()]).toEqual([3, 2]);
    expect([copy.getValue(0, 0), copy.getValue(1, 1), copy.getFormula(0, 0)]).toEqual([1, 'B', null]);
  });
  it('gets and sets the pages selected for printing', async () => {
    const sheet = await report();
    expect(sheet.printPageIndexes()).toEqual([]);
    expect(sheet.printPageIndexes([0, 4])).toEqual([0, 4]);
    expect(sheet.printPageIndexes()).toEqual([0, 4]);
  });
  it('generates static worksheets for each preview page without changing the current page', async () => {
    const sheet = await report();
    const template = sheet.getTemplate();
    template.setTemplateCell(0, 0, { type: 'List', binding: 'T[amount]' });
    expect(sheet.generatePageSheets(false)).toEqual([]);
    template.setPaginationSetting({ rowPagination: { paginationDataCell: 'A1', rowCountPerPage: 2 } });
    sheet.renderMode('PaginatedPreview');
    const pages = sheet.generatePageSheets(false, index => `Page${index}`);
    expect(pages.map(page => [page.name(), page.getValue(0, 0), page.getRowCount()]))
      .toEqual([['Page0', 1, 2], ['Page1', 3, 1]]);
    expect(sheet.currentPage()).toBe(0);
  });
});

describe('ReportSheet getCells context trial observation', () => {
  it('uses the full context of a group whose children occupy later template rows', async () => {
    const sheet = await report();
    const template = sheet.getTemplate();
    template.setTemplateCell(0, 0, { type: 'Group', binding: 'T[region]' });
    template.setTemplateCell(1, 1, { type: 'List', binding: 'T[city]', context: { vertical: 'A1' } });
    sheet.refresh();
    expect(sheet.getCells(1, 1, 0, 0).map(cell => cell.value)).toEqual(['A', 'B']);
    expect(sheet.getCells(1, 1, 1, 1).map(cell => cell.value)).toEqual(['A']);
    expect(sheet.getCells(1, 1, 3, 0).map(cell => cell.value)).toEqual(['C']);
  });
  it('uses the current list record as context, and returns all cells outside the report', async () => {
    const sheet = await report();
    const template = sheet.getTemplate();
    template.setTemplateCell(0, 0, { type: 'List', binding: 'T[region]' });
    template.setTemplateCell(0, 1, { type: 'List', binding: 'T[amount]' });
    sheet.refresh();
    expect(sheet.getCells(0, 1, 1, 0)).toEqual([{ value: 2, row: 1, col: 1, rowCount: 1, colCount: 1 }]);
    expect(sheet.getCells(0, 0, 10, 10).map(cell => cell.value)).toEqual(['East', 'East', 'West']);
  });
  it('selects cells belonging to the group containing the current cell', async () => {
    const sheet = await report();
    const template = sheet.getTemplate();
    template.setTemplateCell(0, 0, { type: 'Group', binding: 'T[region]' });
    template.setTemplateCell(0, 1, { type: 'List', binding: 'T[amount]' });
    sheet.refresh();
    expect(sheet.getCells(0, 1, 1, 0)).toEqual([
      { value: 1, row: 0, col: 1, rowCount: 1, colCount: 1 },
      { value: 2, row: 1, col: 1, rowCount: 1, colCount: 1 },
    ]);
    expect(sheet.getCells(0, 0, 2, 1)).toEqual([
      { value: 'West', row: 2, col: 0, rowCount: 1, colCount: 1 },
    ]);
  });
});

describe('ReportSheet cross-axis trial observations', () => {
  const grid = (sheet: ReportSheet, rows: number, columns: number) =>
    Array.from({ length: rows }, (_, row) => Array.from({ length: columns }, (_, col) => sheet.getValue(row, col)));

  it('pins a Summary given only a vertical context to the axis instance at its own column', async () => {
    // TASK 48 trial probes `v3-summary-spill` / `v4-summary-vertical-only`: a Summary bound to
    // the row group but standing on the axis columns resolves per axis instance yet only the
    // instance owning its own template column is laid out.
    const sheet = await report();
    const template = sheet.getTemplate();
    template.setTemplateCell(0, 0, { type: 'Group', binding: 'T[region]' });
    template.setTemplateCell(0, 1, { type: 'Group', binding: 'T[city]', spillDirection: 'Horizontal',
      context: { vertical: 'None' } });
    template.setTemplateCell(1, 1, { type: 'Summary', binding: 'T[amount]', aggregate: 'Sum',
      context: { vertical: 'A1' } });
    sheet.refresh();
    expect([sheet.getRange().rowCount, sheet.getRange().colCount]).toEqual([4, 4]);
    expect(grid(sheet, 4, 4)).toEqual([['East', 'A', 'B', 'C'], [null, 1, null, null],
      ['West', null, null, null], [null, 0, null, null]]);
  });
  it('expands a context-free Summary as a free cross-tab row over every axis instance', async () => {
    // TASK 48 trial probes `v5-summary-horizontal-only`, `v6-summary-no-vertical-context`,
    // `v7-summary-no-context`: without a vertical binding the Summary aggregates each axis
    // instance's whole column group on the row at its own template offset.
    const sheet = await report6ForAxes();
    const template = sheet.getTemplate();
    template.setTemplateCell(0, 0, { type: 'Group', binding: 'T[region]' });
    template.setTemplateCell(0, 1, { type: 'Group', binding: 'T[city]', spillDirection: 'Horizontal',
      context: { vertical: 'None' } });
    template.setTemplateCell(1, 1, { type: 'Summary', binding: 'T[amount]', aggregate: 'Sum' });
    sheet.refresh();
    expect([sheet.getRange().rowCount, sheet.getRange().colCount]).toEqual([2, 4]);
    expect(grid(sheet, 2, 4)).toEqual([['East', 'A', 'B', 'C'], ['West', 5, 7, 9]]);
  });

  it('expands a group downward and an independent group rightward, sharing the first column block', async () => {
    const sheet = await report();
    const template = sheet.getTemplate();
    template.setTemplateCell(0, 0, { type: 'Group', binding: 'T[region]' });
    template.setTemplateCell(0, 1, { type: 'Group', binding: 'T[city]', spillDirection: 'Horizontal',
      context: { vertical: 'None' } });
    template.setTemplateCell(1, 1, { type: 'Summary', binding: 'T[amount]', aggregate: 'Sum',
      context: { vertical: 'A1', horizontal: 'B1' } });
    sheet.refresh();
    expect([sheet.getRange().rowCount, sheet.getRange().colCount]).toEqual([4, 4]);
    expect(grid(sheet, 4, 4)).toEqual([['East', 'A', 'B', 'C'], [null, 1, null, null],
      ['West', null, null, null], [null, 0, null, null]]);
    expect([sheet.getSpan(0, 0), sheet.getSpan(0, 1), sheet.getSpan(1, 1)]).toEqual([null, null, null]);
    // The column group instance owns its own block; the row group cell sees the whole axis.
    expect(sheet.getCells(0, 1, 0, 1)).toEqual([{ value: 'A', row: 0, col: 1, rowCount: 1, colCount: 1 }]);
    expect(sheet.getCells(0, 1, 0, 2)).toEqual([{ value: 'B', row: 0, col: 2, rowCount: 1, colCount: 1 }]);
    expect(sheet.getCells(0, 1, 0, 3)).toEqual([{ value: 'C', row: 0, col: 3, rowCount: 1, colCount: 1 }]);
    expect(sheet.getCells(0, 1, 0, 0)).toEqual([
      { value: 'A', row: 0, col: 1, rowCount: 1, colCount: 1 },
      { value: 'B', row: 0, col: 2, rowCount: 1, colCount: 1 },
      { value: 'C', row: 0, col: 3, rowCount: 1, colCount: 1 },
    ]);
    // Only the first context instance fits the block; the others are reported with a zero row count.
    expect(sheet.getCells(1, 1, 0, 0)).toEqual([
      { value: 1, row: 1, col: 1, rowCount: 1, colCount: 1 },
      { value: 2, row: 1, col: 1, rowCount: 0, colCount: 1 },
      { value: 0, row: 1, col: 1, rowCount: 0, colCount: 1 },
    ]);
    expect(sheet.getCells(1, 1, 1, 1)).toEqual([{ value: 1, row: 1, col: 1, rowCount: 1, colCount: 1 }]);
    expect(sheet.getCells(1, 1, 1, 2)).toEqual([
      { value: 1, row: 1, col: 1, rowCount: 1, colCount: 1 },
      { value: 2, row: 1, col: 1, rowCount: 0, colCount: 1 },
      { value: 0, row: 1, col: 1, rowCount: 0, colCount: 1 },
      { value: 0, row: 3, col: 1, rowCount: 1, colCount: 1 },
      { value: 0, row: 3, col: 1, rowCount: 0, colCount: 1 },
      { value: 3, row: 3, col: 1, rowCount: 0, colCount: 1 },
    ]);
  });
  it('repeats the column group inside every row group block when it is nested in it', async () => {
    const sheet = await report();
    const template = sheet.getTemplate();
    template.setTemplateCell(0, 0, { type: 'Group', binding: 'T[region]' });
    template.setTemplateCell(0, 1, { type: 'Group', binding: 'T[city]', spillDirection: 'Horizontal' });
    template.setTemplateCell(1, 1, { type: 'Summary', binding: 'T[amount]', aggregate: 'Sum',
      context: { vertical: 'A1', horizontal: 'B1' } });
    sheet.refresh();
    expect([sheet.getRange().rowCount, sheet.getRange().colCount]).toEqual([4, 3]);
    expect(grid(sheet, 4, 3)).toEqual([['East', 'A', 'B'], [null, 1, 2], ['West', 'C', null], [null, 3, null]]);
  });
  it('selects the whole report when the current cell is outside every expanded cell', async () => {
    const sheet = await report();
    const template = sheet.getTemplate();
    template.setTemplateCell(0, 0, { type: 'Group', binding: 'T[region]' });
    template.setTemplateCell(1, 1, { type: 'List', binding: 'T[city]', context: { vertical: 'A1' } });
    template.setTemplateCell(1, 2, { type: 'List', binding: 'T[amount]', context: { vertical: 'B2' } });
    sheet.refresh();
    expect(grid(sheet, 5, 3)).toEqual([['East', null, null], [null, 'A', 1], [null, 'B', 2],
      ['West', null, null], [null, 'C', 3]]);
    expect(sheet.getCells(1, 1, 1, 0).map(cell => cell.value)).toEqual(['A', 'B', 'C']);
    expect(sheet.getCells(1, 1, 0, 1).map(cell => cell.value)).toEqual(['A', 'B', 'C']);
    expect(sheet.getCells(1, 2, 1, 1)).toEqual([{ value: 1, row: 1, col: 2, rowCount: 1, colCount: 1 }]);
    expect(sheet.getCells(1, 1, 4, 1)).toEqual([{ value: 'C', row: 4, col: 1, rowCount: 1, colCount: 1 }]);
  });
});

describe('ReportSheet horizontal collapse trial observations', () => {
  const keys = [[0, 0], [0, 1], [0, 2], [0, 3], [1, 1], [3, 1]] as [number, number][];
  const states = (sheet: ReportSheet) => keys.map(([row, col]) => sheet.getCollapseState(row, col));
  const widths = (sheet: ReportSheet) => [0, 1, 2, 3].map(col => sheet.getColumnWidth(col));
  const heights = (sheet: ReportSheet) => [0, 1, 2, 3].map(row => sheet.getRowHeight(row));
  const crossTab = async (sheet: ReportSheet, collapsed = false) => {
    const template = sheet.getTemplate();
    template.setTemplateCell(0, 0, { type: 'Group', binding: 'T[region]',
      ...(collapsed ? { initialExpansionState: 'Collapsed' as const } : {}) });
    template.setTemplateCell(0, 1, { type: 'Group', binding: 'T[city]', spillDirection: 'Horizontal',
      context: { vertical: 'None' }, ...(collapsed ? { initialExpansionState: 'Collapsed' as const } : {}) });
    template.setTemplateCell(1, 1, { type: 'Summary', binding: 'T[amount]', aggregate: 'Sum',
      context: { vertical: 'A1', horizontal: 'B1' } });
    sheet.refresh();
  };

  it('hides the expanded columns to the left of a collapsed horizontal group instance', async () => {
    const sheet = await report();
    await crossTab(sheet);
    expect(widths(sheet)).toEqual([62, 62, 62, 62]);
    expect(heights(sheet)).toEqual([20, 20, 20, 20]);
    sheet.toggleCollapseState(0, 2, 'Collapsed');
    expect(states(sheet)).toEqual([false, false, true, false, false, false]);
    expect(widths(sheet)).toEqual([62, 0, 62, 62]);
    expect(heights(sheet)).toEqual([20, 20, 20, 20]);
    sheet.toggleCollapseState(0, 2, 'Expanded');
    expect(states(sheet)).toEqual([false, false, false, false, false, false]);
    expect(widths(sheet)).toEqual([62, 62, 62, 62]);
  });
  it('applies the template initialExpansionState to every instance of the group', async () => {
    const sheet = await report();
    await crossTab(sheet, true);
    expect(states(sheet)).toEqual([true, true, true, true, false, false]);
    expect(heights(sheet)).toEqual([20, 0, 20, 0]);
    expect(widths(sheet)).toEqual([62, 0, 0, 62]);
    sheet.toggleCollapseState(0, 1, 'Expanded');
    sheet.toggleCollapseState(0, 2, 'Expanded');
    expect(states(sheet)).toEqual([true, false, false, true, false, false]);
    expect(heights(sheet)).toEqual([20, 0, 20, 0]);
    expect(widths(sheet)).toEqual([62, 0, 0, 62]);
  });
  it('recursively marks the horizontal groups nested in a collapsed row group without hiding their columns', async () => {
    const sheet = await report();
    const template = sheet.getTemplate();
    template.setTemplateCell(0, 0, { type: 'Group', binding: 'T[region]' });
    template.setTemplateCell(0, 1, { type: 'Group', binding: 'T[city]', spillDirection: 'Horizontal' });
    template.setTemplateCell(1, 1, { type: 'Summary', binding: 'T[amount]', aggregate: 'Sum',
      context: { vertical: 'A1', horizontal: 'B1' } });
    sheet.refresh();
    sheet.toggleCollapseState(0, 0, 'Collapsed', true);
    expect([[0, 0], [0, 1], [0, 2], [1, 1], [1, 2], [2, 0], [2, 1], [3, 1]].map(([row, col]) => sheet.getCollapseState(row, col)))
      .toEqual([true, true, true, false, false, false, false, false]);
    expect([0, 1, 2, 3].map(row => sheet.getRowHeight(row))).toEqual([20, 0, 20, 20]);
    expect([0, 1, 2].map(col => sheet.getColumnWidth(col))).toEqual([62, 62, 62]);
  });
});

describe('ReportSheet group collapse trial observations', () => {
  it('recursively collapses nested groups that contain list records', async () => {
    const workbook = new Workbook(undefined, { sheetCount: 0 });
    const table = workbook.dataManager().addTable('T', { data: [
      { a: 'X', b: 'A', c: 1 }, { a: 'X', b: 'A', c: 2 },
      { a: 'X', b: 'B', c: 3 }, { a: 'Y', b: 'C', c: 4 },
    ] });
    await table.fetch();
    const sheet = workbook.addSheetTab(0, 'Report', 3) as ReportSheet;
    const template = sheet.getTemplate();
    template.setTemplateCell(0, 0, { type: 'Group', binding: 'T[a]' });
    template.setTemplateCell(0, 1, { type: 'Group', binding: 'T[b]' });
    template.setTemplateCell(0, 2, { type: 'List', binding: 'T[c]' });
    sheet.refresh();
    const states = () => [[0, 0], [0, 1], [2, 1], [3, 0], [3, 1]]
      .map(([row, col]) => sheet.getCollapseState(row!, col!));
    sheet.toggleCollapseState(0, 0, 'Collapsed', true);
    expect(states()).toEqual([true, true, true, false, false]);
    expect([0, 1, 2, 3].map(row => sheet.getRowHeight(row))).toEqual([20, 0, 0, 20]);
    sheet.toggleCollapseState(0, 0, 'Expanded', true);
    expect(states()).toEqual([false, false, false, false, false]);
    expect([0, 1, 2, 3].map(row => sheet.getRowHeight(row))).toEqual([20, 20, 20, 20]);
    workbook.destroy();
  });
  it('recursively collapses a group without marking its leaf groups', async () => {
    const sheet = await report();
    const template = sheet.getTemplate();
    template.setTemplateCell(0, 0, { type: 'Group', binding: 'T[region]' });
    template.setTemplateCell(0, 1, { type: 'Group', binding: 'T[city]' });
    sheet.refresh();
    sheet.toggleCollapseState(0, 0, 'Collapsed', true);
    expect([sheet.getCollapseState(0, 0), sheet.getCollapseState(0, 1), sheet.getCollapseState(1, 1)])
      .toEqual([true, false, false]);
    expect([0, 1, 2].map(row => sheet.getRowHeight(row))).toEqual([20, 0, 20]);
    sheet.toggleCollapseState(0, 0, 'Expanded', true);
    expect([0, 1, 2].map(row => sheet.getRowHeight(row))).toEqual([20, 20, 20]);
  });
  it('toggles a group and hides its expanded rows until expanded or refreshed', async () => {
    const sheet = await report();
    const template = sheet.getTemplate();
    template.setTemplateCell(0, 0, { type: 'Group', binding: 'T[region]', showCollapseButton: false });
    template.setTemplateCell(0, 1, { type: 'List', binding: 'T[amount]' });
    sheet.refresh();
    expect([0, 1, 2].map(row => sheet.getCollapseState(row, 0))).toEqual([false, false, false]);
    sheet.toggleCollapseState(1, 0);
    sheet.toggleCollapseState(0, 1);
    expect(sheet.getCollapseState(0, 0)).toBe(false);
    sheet.toggleCollapseState(0, 0);
    expect([sheet.getCollapseState(0, 0), sheet.getRowHeight(1)]).toEqual([true, 0]);
    expect([sheet.getValue(0, 0), sheet.getValue(1, 1)]).toEqual(['East', 2]);
    sheet.toggleCollapseState(0, 0);
    expect([sheet.getCollapseState(0, 0), sheet.getRowHeight(1)]).toEqual([false, 20]);
    sheet.toggleCollapseState(2, 0);
    expect(sheet.getCollapseState(2, 0)).toBe(true);
    sheet.refresh();
    expect(sheet.getCollapseState(2, 0)).toBe(false);
  });
});

describe('ReportSheet multi-row recursive collapse trial observation', () => {
  it('collapses descendant groups on later template rows', async () => {
    const workbook = new Workbook(undefined, { sheetCount: 0 });
    await workbook.dataManager().addTable('T', { data: [
      { a: 'X', b: 'P', c: 1 }, { a: 'X', b: 'P', c: 2 },
      { a: 'X', b: 'Q', c: 3 }, { a: 'Y', b: 'R', c: 4 },
    ] }).fetch();
    const sheet = workbook.addSheetTab(0, 'Report', 3) as ReportSheet;
    const template = sheet.getTemplate();
    template.setTemplateCell(0, 0, { type: 'Group', binding: 'T[a]' });
    template.setTemplateCell(1, 1, { type: 'Group', binding: 'T[b]', context: { vertical: 'A1' } });
    template.setTemplateCell(1, 2, { type: 'List', binding: 'T[c]', context: { vertical: 'B2' } });
    sheet.refresh();
    sheet.toggleCollapseState(0, 0, 'Collapsed', true);
    expect([[0, 0], [1, 1], [3, 1], [4, 0]].map(([row, col]) => sheet.getCollapseState(row!, col!)))
      .toEqual([true, true, true, false]);
    expect([0, 1, 2, 3, 4, 5].map(row => sheet.getRowHeight(row))).toEqual([20, 0, 0, 0, 20, 20]);
  });
});

describe('ReportSheet nested hierarchy trial observations', () => {
  it('uses each list record as the context for a group', async () => {
    const workbook = new Workbook(undefined, { sheetCount: 0 });
    await workbook.dataManager().addTable('T', { data: [
      { region: 'East', city: 'A' }, { region: 'East', city: 'B' }, { region: 'West', city: 'C' },
    ] }).fetch();
    const sheet = workbook.addSheetTab(0, 'Report', 3) as ReportSheet;
    const template = sheet.getTemplate();
    template.setTemplateCell(0, 0, { type: 'List', binding: 'T[region]' });
    template.setTemplateCell(0, 1, { type: 'Group', binding: 'T[city]' });
    sheet.refresh();
    expect(Array.from({ length: 3 }, (_, row) => [0, 1].map(col => sheet.getValue(row, col))))
      .toEqual([['East', 'A'], ['East', 'B'], ['West', 'C']]);
    expect(sheet.getRange()).toMatchObject({ rowCount: 3, colCount: 2 });
  });
  it('aligns independent context trees, including a nested group', async () => {
    const workbook = new Workbook(undefined, { sheetCount: 0 });
    await workbook.dataManager().addTable('T', { data: [
      { region: 'East', city: 'A', amount: 1 }, { region: 'East', city: 'A', amount: 4 },
      { region: 'East', city: 'B', amount: 2 }, { region: 'West', city: 'C', amount: 3 },
    ] }).fetch();
    const sheet = workbook.addSheetTab(0, 'Report', 3) as ReportSheet;
    const template = sheet.getTemplate();
    template.setTemplateCell(0, 0, { type: 'Group', binding: 'T[region]' });
    template.setTemplateCell(0, 1, { type: 'Group', binding: 'T[city]', context: { vertical: 'None' } });
    template.setTemplateCell(0, 2, { type: 'List', binding: 'T[amount]' });
    sheet.refresh();
    expect(Array.from({ length: 4 }, (_, row) => [0, 1, 2].map(col => sheet.getValue(row, col))))
      .toEqual([['East', 'A', 1], ['West', null, 4], [null, 'B', 2], [null, 'C', 3]]);
    expect(sheet.getSpan(0, 1)).toMatchObject({ rowCount: 2, colCount: 1 });
    expect(sheet.getRange()).toMatchObject({ rowCount: 4, colCount: 3 });
  });
  it('summarizes the middle context of a three-level group', async () => {
    const workbook = new Workbook(undefined, { sheetCount: 0 });
    await workbook.dataManager().addTable('T', { data: [
      { region: 'East', city: 'A', amount: 1 }, { region: 'East', city: 'B', amount: 2 },
      { region: 'West', city: 'C', amount: 3 },
    ] }).fetch();
    const sheet = workbook.addSheetTab(0, 'Report', 3) as ReportSheet;
    const template = sheet.getTemplate();
    template.setTemplateCell(0, 0, { type: 'Group', binding: 'T[region]' });
    template.setTemplateCell(0, 1, { type: 'Group', binding: 'T[city]' });
    template.setTemplateCell(0, 2, { type: 'Group', binding: 'T[amount]' });
    template.setTemplateCell(0, 3, { type: 'Summary', binding: 'T[amount]', aggregate: 'Sum', context: { vertical: 'B1' } });
    sheet.refresh();
    expect(Array.from({ length: 3 }, (_, row) => [0, 1, 2, 3].map(col => sheet.getValue(row, col))))
      .toEqual([['East', 'A', 1, 1], [null, 'B', 2, 2], ['West', 'C', 3, 3]]);
    expect(sheet.getSpan(0, 0)).toMatchObject({ rowCount: 2, colCount: 1 });
  });
  it('aligns sibling contexts within each parent group', async () => {
    const workbook = new Workbook(undefined, { sheetCount: 0 });
    await workbook.dataManager().addTable('T', { data: [
      { region: 'East', city: 'A', amount: 1 }, { region: 'East', city: 'A', amount: 4 },
      { region: 'East', city: 'B', amount: 2 }, { region: 'West', city: 'C', amount: 3 },
    ] }).fetch();
    const sheet = workbook.addSheetTab(0, 'Report', 3) as ReportSheet;
    const template = sheet.getTemplate();
    template.setTemplateCell(0, 0, { type: 'Group', binding: 'T[region]' });
    template.setTemplateCell(0, 1, { type: 'Group', binding: 'T[city]' });
    template.setTemplateCell(0, 2, { type: 'List', binding: 'T[amount]', context: { vertical: 'A1' } });
    sheet.refresh();
    expect(Array.from({ length: 4 }, (_, row) => [0, 1, 2].map(col => sheet.getValue(row, col))))
      .toEqual([['East', 'A', 1], [null, 'B', 4], [null, null, 2], ['West', 'C', 3]]);
    expect(sheet.getSpan(0, 0)).toMatchObject({ rowCount: 3, colCount: 1 });
    expect(sheet.getSpan(0, 1)).toBeNull();
  });
  it('summarizes an explicitly selected ancestor across nested groups', async () => {
    const workbook = new Workbook(undefined, { sheetCount: 0 });
    await workbook.dataManager().addTable('T', { data: [
      { region: 'East', city: 'A', amount: 1 }, { region: 'East', city: 'B', amount: 2 },
      { region: 'West', city: 'C', amount: 3 },
    ] }).fetch();
    const sheet = workbook.addSheetTab(0, 'Report', 3) as ReportSheet;
    const template = sheet.getTemplate();
    template.setTemplateCell(0, 0, { type: 'Group', binding: 'T[region]' });
    template.setTemplateCell(0, 1, { type: 'Group', binding: 'T[city]' });
    template.setTemplateCell(0, 2, { type: 'List', binding: 'T[amount]' });
    template.setTemplateCell(0, 3, { type: 'Summary', binding: 'T[amount]', aggregate: 'Sum', context: { vertical: 'A1' } });
    sheet.refresh();
    expect(Array.from({ length: 3 }, (_, row) => [0, 1, 2, 3].map(col => sheet.getValue(row, col))))
      .toEqual([['East', 'A', 1, 3], [null, 'B', 2, null], ['West', 'C', 3, 3]]);
    expect(sheet.getSpan(0, 3)).toMatchObject({ row: 0, col: 3, rowCount: 2, colCount: 1 });
  });
  it.each([undefined, 'B1'])('expands a list within two nested groups with context %s', async context => {
    const workbook = new Workbook(undefined, { sheetCount: 0 });
    await workbook.dataManager().addTable('T', { data: [
      { a: 'X', b: 'P', c: 'i' }, { a: 'X', b: 'P', c: 'j' },
      { a: 'X', b: 'Q', c: 'k' }, { a: 'Y', b: 'P', c: 'l' },
    ] }).fetch();
    const sheet = workbook.addSheetTab(0, 'Report', 3) as ReportSheet;
    const template = sheet.getTemplate();
    template.setTemplateCell(0, 0, { type: 'Group', binding: 'T[a]' });
    template.setTemplateCell(0, 1, { type: 'Group', binding: 'T[b]' });
    template.setTemplateCell(0, 2, { type: 'List', binding: 'T[c]',
      ...(context ? { context: { vertical: context } } : {}) });
    sheet.refresh();
    expect(Array.from({ length: 4 }, (_, row) => [0, 1, 2].map(col => sheet.getValue(row, col))))
      .toEqual([['X', 'P', 'i'], [null, null, 'j'], [null, 'Q', 'k'], ['Y', 'P', 'l']]);
    expect([sheet.getSpan(0, 0)?.rowCount, sheet.getSpan(0, 1)?.rowCount]).toEqual([3, 2]);
    expect(sheet.getRange()).toMatchObject({ rowCount: 4, colCount: 3 });
  });
});

describe('ReportSheet nested filtering and sorting trial observations', () => {
  it.each([
    ['leaf filter', [["E", "z", null], [null, "y", 2], ["W", "x", 3]]],
    ['group filter', [["E", null, null], ["W", "x", 3]]],
    ['group sort', [["E", "y", 2], [null, "z", 1], ["W", "x", 3]]],
  ])('%s keeps the immediate parent context', async (variant, expected) => {
    const workbook = new Workbook(undefined, { sheetCount: 0 });
    await workbook.dataManager().addTable('T', { data: [
      { a: 'E', b: 'z', c: 1 }, { a: 'E', b: 'y', c: 2 }, { a: 'W', b: 'x', c: 3 },
    ] }).fetch();
    const sheet = workbook.addSheetTab(0, 'Report', 3) as ReportSheet;
    const template = sheet.getTemplate();
    template.setTemplateCell(0, 0, { type: 'Group', binding: 'T[a]' });
    template.setTemplateCell(0, 1, { type: 'Group', binding: 'T[b]',
      ...(variant === 'group sort' ? { sortOptions: [{ asc: 'b' }] } : {}),
      ...(variant === 'group filter' ? { filter: { condition: { column: 'b', operator: 'Equal', value: 'x' } } } : {}) });
    template.setTemplateCell(0, 2, { type: 'List', binding: 'T[c]',
      ...(variant === 'leaf filter' ? { filter: { condition: { column: 'c', operator: 'GreaterThan', value: 1 } } } : {}) });
    sheet.refresh();
    expect(Array.from({ length: sheet.getRange().rowCount }, (_, row) => [0, 1, 2].map(col => sheet.getValue(row, col))))
      .toEqual(expected);
    expect(sheet.getSpan(0, 0)?.rowCount ?? 1).toBe(variant === 'group filter' ? 1 : 2);
  });
});

describe('ReportSheet pure horizontal axis trial observations', () => {
  async function report6() {
    const workbook = new Workbook(undefined, { sheetCount: 0 });
    await workbook.dataManager().addTable('T', { data: [
      { region: 'East', city: 'A', amount: 1 }, { region: 'East', city: 'B', amount: 2 },
      { region: 'East', city: 'C', amount: 3 }, { region: 'West', city: 'A', amount: 4 },
      { region: 'West', city: 'B', amount: 5 }, { region: 'West', city: 'C', amount: 6 },
    ] }).fetch();
    return workbook.addSheetTab(0, 'Report', 3) as ReportSheet;
  }
  const grid = (sheet: ReportSheet, rows: number, cols: number) =>
    Array.from({ length: rows }, (_, row) => Array.from({ length: cols }, (_, col) => sheet.getValue(row, col)));

  it('expands a horizontal group as the root with a vertical list under each instance column', async () => {
    // TASK 48 trial probes `report-residuals` hc-horizontal-only / hc-horizontal-recursive.
    const sheet = await report6();
    const template = sheet.getTemplate();
    template.setTemplateCell(0, 0, { type: 'Group', binding: 'T[city]', spillDirection: 'Horizontal' });
    template.setTemplateCell(1, 0, { type: 'List', binding: 'T[amount]', context: { vertical: 'A1' } });
    sheet.refresh();
    expect([sheet.getRange().rowCount, sheet.getRange().colCount]).toEqual([3, 3]);
    expect(grid(sheet, 3, 3)).toEqual([['A', 'B', 'C'], [1, 2, 3], [4, 5, 6]]);
    expect([sheet.getSpan(0, 0), sheet.getSpan(1, 0)]).toEqual([null, null]);
  });
  it('toggles a pure horizontal group instance without hiding its column blocks', async () => {
    // TASK 48 trial probes hc-horizontal-only/recursive: collapsing the first instance records
    // the state but changes no values (the blocks under it belong to their own group cells).
    const sheet = await report6();
    const template = sheet.getTemplate();
    template.setTemplateCell(0, 0, { type: 'Group', binding: 'T[city]', spillDirection: 'Horizontal' });
    template.setTemplateCell(1, 0, { type: 'List', binding: 'T[amount]', context: { vertical: 'A1' } });
    sheet.refresh();
    sheet.toggleCollapseState(0, 0, 'Collapsed', true);
    expect([[0, 0], [0, 1], [0, 2], [1, 0], [2, 0]].map(([row, col]) => sheet.getCollapseState(row, col)))
      .toEqual([true, false, false, false, false]);
    expect(grid(sheet, 3, 3)).toEqual([['A', 'B', 'C'], [1, 2, 3], [4, 5, 6]]);
  });
  it('pairs a second list inside every horizontal group instance block', async () => {
    // TASK 48 trial probe `report-residuals` xt-group-h.
    const sheet = await report6();
    const template = sheet.getTemplate();
    template.setTemplateCell(0, 0, { type: 'Group', binding: 'T[city]', spillDirection: 'Horizontal' });
    template.setTemplateCell(1, 0, { type: 'List', binding: 'T[amount]', context: { vertical: 'A1' } });
    template.setTemplateCell(1, 1, { type: 'List', binding: 'T[region]',
      context: { vertical: 'A1', horizontal: 'A1' } });
    sheet.refresh();
    expect([sheet.getRange().rowCount, sheet.getRange().colCount]).toEqual([3, 6]);
    expect(grid(sheet, 3, 6)).toEqual([['A', null, 'B', null, 'C', null],
      [1, 'East', 2, 'East', 3, 'East'], [4, 'West', 5, 'West', 6, 'West']]);
    expect(sheet.getSpan(0, 0)).toBeNull();
  });
});

describe('ReportSheet horizontal list axis trial observations (TASK 96)', () => {
  const grid = (sheet: ReportSheet, rows: number, columns: number) =>
    Array.from({ length: rows }, (_, row) => Array.from({ length: columns }, (_, col) => sheet.getValue(row, col)));

  it('concatenates a horizontal List axis with its per-record list child inside each parent row (trial `xt-list`)', async () => {
    // TASK 96 probe `xt-list` (.probe/report-residuals.json): a horizontal `List` is the axis;
    // inside every row-group block its records run right, each followed by the child list
    // values of that record.
    const sheet = await report6ForAxes();
    const template = sheet.getTemplate();
    template.setTemplateCell(0, 0, { type: 'Group', binding: 'T[region]' });
    template.setTemplateCell(0, 1, { type: 'List', binding: 'T[city]', spillDirection: 'Horizontal' });
    template.setTemplateCell(0, 2, { type: 'List', binding: 'T[amount]', spillDirection: 'Horizontal',
      context: { horizontal: 'B1' } });
    sheet.refresh();
    expect([sheet.getRange().rowCount, sheet.getRange().colCount]).toEqual([2, 7]);
    expect(grid(sheet, 2, 7)).toEqual([['East', 'A', 1, 'B', 2, 'C', 3], ['West', 'A', 4, 'B', 5, 'C', 6]]);
  });

  it('concatenates the horizontal List axis on a free row below the row group, closed by the Summary (trial `xt-summary-h-list`)', async () => {
    // TASK 96 probe `xt-summary-h-list`: the horizontal `List` axis does not repeat per row
    // block here; all its records concatenate on one row below the stacked groups and the
    // context-free Summary takes the row's last column, aggregating the whole axis.
    const sheet = await report6ForAxes();
    const template = sheet.getTemplate();
    template.setTemplateCell(0, 0, { type: 'Group', binding: 'T[region]' });
    template.setTemplateCell(1, 0, { type: 'List', binding: 'T[city]', spillDirection: 'Horizontal' });
    template.setTemplateCell(1, 1, { type: 'Summary', binding: 'T[amount]', aggregate: 'Sum' });
    sheet.refresh();
    expect([sheet.getRange().rowCount, sheet.getRange().colCount]).toEqual([3, 7]);
    expect(grid(sheet, 3, 7)).toEqual([['East', null, null, null, null, null, null],
      ['West', null, null, null, null, null, null], ['A', 'B', 'C', 'A', 'B', 'C', 21]]);
  });

  it('pins a List bound to both axes to its own column block (trial `d4`)', async () => {
    // TASK 96 probe `d4-list-both-axes`: on an independent axis a `List` carrying both
    // contexts shows only the records shared with the axis instance owning its column.
    const workbook = new Workbook(undefined, { sheetCount: 0 });
    await workbook.dataManager().addTable('T', { data: [
      { region: 'East', city: 'A', amount: 11, product: 'p1' }, { region: 'East', city: 'B', amount: 22, product: 'p2' },
      { region: 'East', city: 'C', amount: 33, product: 'p3' }, { region: 'West', city: 'A', amount: 44, product: 'p4' },
      { region: 'West', city: 'B', amount: 55, product: 'p5' }, { region: 'West', city: 'C', amount: 66, product: 'p6' },
    ] }).fetch();
    const sheet = workbook.addSheetTab(0, 'Report', 3) as ReportSheet;
    const template = sheet.getTemplate();
    template.setTemplateCell(0, 0, { type: 'Group', binding: 'T[region]' });
    template.setTemplateCell(0, 1, { type: 'Group', binding: 'T[city]', spillDirection: 'Horizontal',
      context: { vertical: 'None' } });
    template.setTemplateCell(1, 1, { type: 'List', binding: 'T[amount]',
      context: { vertical: 'A1', horizontal: 'B1' } });
    sheet.refresh();
    expect([sheet.getRange().rowCount, sheet.getRange().colCount]).toEqual([4, 4]);
    expect(grid(sheet, 4, 4)).toEqual([['East', 'A', 'B', 'C'], [null, 11, null, null],
      ['West', null, null, null], [null, 44, null, null]]);
  });

  it('feeds both a vertical list and the axis-bound list under a nested horizontal group (trial `v10`)', async () => {
    // TASK 96 probe `v10-groups-different-tables`: a horizontal group nested in the row
    // group repeats inside every block; a list bound to both axes then pairs with each of
    // the block's own axis instances, spilling across the block's columns.
    const sheet = await report6ForAxes();
    const template = sheet.getTemplate();
    template.setTemplateCell(0, 0, { type: 'Group', binding: 'T[region]' });
    template.setTemplateCell(0, 1, { type: 'Group', binding: 'T[city]', spillDirection: 'Horizontal' });
    template.setTemplateCell(1, 0, { type: 'List', binding: 'T[amount]', context: { vertical: 'A1' } });
    template.setTemplateCell(1, 1, { type: 'List', binding: 'T[amount]',
      context: { vertical: 'A1', horizontal: 'B1' } });
    sheet.refresh();
    expect([sheet.getRange().rowCount, sheet.getRange().colCount]).toEqual([8, 4]);
    expect(grid(sheet, 8, 4)).toEqual([['East', 'A', 'B', 'C'], [1, 1, 2, 3], [2, null, null, null],
      [3, null, null, null], ['West', 'A', 'B', 'C'], [4, 4, 5, 6], [5, null, null, null],
      [6, null, null, null]]);
  });

  it('chains a second horizontal group inside the axis blocks and pins a list to its instance (trial `v9`)', async () => {
    // TASK 96 probe `v9-two-horizontal-groups`: an independent horizontal group bound to the
    // axis expands per axis instance inside the instance's block (widening it), and a list
    // bound to that second group pins to the instance owning its column.
    const sheet = await report6ForAxes();
    const template = sheet.getTemplate();
    template.setTemplateCell(0, 0, { type: 'Group', binding: 'T[region]' });
    template.setTemplateCell(0, 1, { type: 'Group', binding: 'T[city]', spillDirection: 'Horizontal',
      context: { vertical: 'None' } });
    template.setTemplateCell(0, 2, { type: 'Group', binding: 'T[amount]', spillDirection: 'Horizontal',
      context: { vertical: 'None', horizontal: 'B1' } });
    template.setTemplateCell(1, 2, { type: 'List', binding: 'T[city]',
      context: { vertical: 'A1', horizontal: 'C1' } });
    sheet.refresh();
    expect([sheet.getRange().rowCount, sheet.getRange().colCount]).toEqual([4, 10]);
    expect(grid(sheet, 4, 10)).toEqual([['East', 'A', 1, 4, 'B', 2, 5, 'C', 3, 6],
      [null, null, 'A', null, null, null, null, null, null, null],
      ['West', null, null, null, null, null, null, null, null, null],
      [null, null, null, null, null, null, null, null, null, null]]);
  });

  it('interleaves a nested Group/List bound to both axes across the axis columns (trial `d5`)', async () => {
    // TASK 96 probe `d5-group-both-axes`: a Group bound to both axes pins to its own column
    // block while the List bound under it interleaves one row per row-group block across all
    // axis columns, right below the blocks.
    const workbook = new Workbook(undefined, { sheetCount: 0 });
    await workbook.dataManager().addTable('T', { data: [
      { region: 'East', city: 'A', amount: 11, product: 'p1' }, { region: 'East', city: 'B', amount: 22, product: 'p2' },
      { region: 'East', city: 'C', amount: 33, product: 'p3' }, { region: 'West', city: 'A', amount: 44, product: 'p4' },
      { region: 'West', city: 'B', amount: 55, product: 'p5' }, { region: 'West', city: 'C', amount: 66, product: 'p6' },
    ] }).fetch();
    const sheet = workbook.addSheetTab(0, 'Report', 3) as ReportSheet;
    const template = sheet.getTemplate();
    template.setTemplateCell(0, 0, { type: 'Group', binding: 'T[region]' });
    template.setTemplateCell(0, 1, { type: 'Group', binding: 'T[city]', spillDirection: 'Horizontal',
      context: { vertical: 'None' } });
    template.setTemplateCell(1, 1, { type: 'Group', binding: 'T[product]',
      context: { vertical: 'A1', horizontal: 'B1' } });
    template.setTemplateCell(2, 1, { type: 'List', binding: 'T[amount]',
      context: { vertical: 'D1', horizontal: 'B1' } });
    sheet.refresh();
    expect([sheet.getRange().rowCount, sheet.getRange().colCount]).toEqual([4, 4]);
    expect(grid(sheet, 4, 4)).toEqual([['East', 'A', 'B', 'C'], [null, 'p1', null, null],
      ['West', 11, 22, 33], [null, 'p4', 55, 66]]);
  });
});
