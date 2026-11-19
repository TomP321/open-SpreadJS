import { describe, expect, it } from 'vitest';
import GC, { Spread } from '../src/index.js';
import type { Worksheet } from '../src/worksheet.js';

const { Workbook } = Spread.Sheets;
type SheetT = Worksheet;
type ThemesT = Record<string, import('../src/pivot/theme.js').PivotTableTheme>;
const Pivot = GC.Spread.Pivot as unknown as
  typeof import('../src/pivot/types.js')
  & typeof import('../src/pivot/theme.js')
  & { PivotTableThemes: typeof import('../src/pivot/theme-statics.js').PivotTableThemes };

/* Fixture shaped like the trial docs (Buyer/Type/Amount/Region). */
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
  data.tables.add('sourceData', 0, 0, SALES.length, 5);
  const sheet = wb.getSheet(1);
  sheet.name('Pivot');
  return { wb, data, sheet };
}

const add = (sheet: SheetT, name = 'pivot1', source: unknown = 'sourceData', row = 1, col = 1) =>
  sheet.pivotTables.add(name, source as never, row, col, Pivot.PivotTableLayoutType.compact, 'Medium2');

describe('pivot manager', () => {
  it('adds, gets, lists and removes pivot tables', () => {
    const { sheet } = build();
    const table = add(sheet);
    expect(sheet.pivotTables.all()).toHaveLength(1);
    expect(sheet.pivotTables.get('pivot1')).toBe(table);
    expect(sheet.pivotTables.findPivotTable(1, 1)).toBe(table);
    expect(sheet.pivotTables.findPivotTable(100, 100)).toBeFalsy();
    sheet.pivotTables.remove('pivot1');
    expect(sheet.pivotTables.all()).toHaveLength(0);
    expect(sheet.getValue(2, 1)).toBeFalsy();
  });

  it('reads the source from a table name and from a Sheet!A1:B2 range', () => {
    const { sheet } = build();
    const byTable = add(sheet, 'a');
    expect(byTable.getSource()).toBe('=sourceData');
    const byRange = add(sheet, 'b', 'Data!A1:E10');
    expect(byRange.getSource()).toBe('Data!A1:E10');
    expect(byRange.getSourceFields().map(f => f.name))
      .toEqual(['Date', 'Buyer', 'Type', 'Amount', 'Region']);
  });

  it('keeps a workbook-scoped custom sort list', () => {
    const { sheet } = build();
    expect(sheet.pivotTables.customList()).toEqual([]);
    sheet.pivotTables.customList(['S', 'M', 'L']);
    expect(sheet.pivotTables.customList()).toEqual(['S', 'M', 'L']);
  });

  it('rejects duplicate pivot names', () => {
    const { sheet } = build();
    add(sheet, 'pivot1');
    expect(() => add(sheet, 'pivot1')).toThrow();
  });
});

describe('pivot fields', () => {
  it('starts with no fields in any area', () => {
    const { sheet } = build();
    const table = add(sheet);
    expect(table.getFieldsByArea()).toEqual([]);
  });

  it('adds row/column/value/filter fields and reports them per area', () => {
    const { sheet } = build();
    const table = add(sheet);
    table.add('Buyer', 'Buyer', Pivot.PivotTableFieldType.rowField);
    table.add('Type', 'Type', Pivot.PivotTableFieldType.columnField);
    table.add('Amount', 'Amount', Pivot.PivotTableFieldType.valueField, Pivot.SubtotalType.sum);
    table.add('Region', 'Region', Pivot.PivotTableFieldType.filterField);
    const fields = table.getFieldsByArea();
    expect(fields.map(f => f.fieldName).sort()).toEqual(['Amount', 'Buyer', 'Region', 'Type']);
    expect(fields.find(f => f.fieldName === 'Buyer')!.pivotArea).toBe(Pivot.PivotTableFieldType.rowField);
    expect(fields.find(f => f.fieldName === 'Amount')!.pivotArea).toBe(Pivot.PivotTableFieldType.valueField);
    expect(fields.find(f => f.fieldName === 'Amount')!.start).toBe(20);
    expect(fields.find(f => f.fieldName === 'Amount')!.end).toBe(310);
    expect(table.getField('Date')!.dataType).toBe(Pivot.PivotDataType.string);
    expect(fields.find(f => f.fieldName === 'Amount')!.dataType).toBe(Pivot.PivotDataType.number);
  });

  it('removes a field and moves fields with updateField', () => {
    const { sheet } = build();
    const table = add(sheet);
    table.add('Buyer', 'Buyer', Pivot.PivotTableFieldType.rowField);
    table.add('Amount', 'Amount', Pivot.PivotTableFieldType.valueField, Pivot.SubtotalType.sum);
    table.remove('Buyer');
    expect(table.getFieldsByArea(Pivot.PivotTableFieldType.rowField)).toEqual([]);
    table.updateField('Buyer', Pivot.PivotTableFieldType.rowField);
    expect(table.getFieldsByArea(Pivot.PivotTableFieldType.rowField).map(f => f.fieldName)).toEqual(['Buyer']);
  });

  it('renames a field with updateFieldName', () => {
    const { sheet } = build();
    const table = add(sheet);
    table.add('Buyer', 'Buyer', Pivot.PivotTableFieldType.rowField);
    table.add('Amount', 'Amount', Pivot.PivotTableFieldType.valueField, Pivot.SubtotalType.sum);
    table.updateFieldName('Buyer', 'Customer');
    expect(table.getField('Customer')!.fieldName).toBe('Customer');
    const grid = cellTexts(table);
    expect(grid.flat()).toContain('Dad');
  });

  it('exposes items in source order and sorted', () => {
    const { sheet } = build();
    const table = add(sheet);
    // The trial only answers for fields that sit in an area.
    expect(table.getItemsByField('Buyer')).toBeUndefined();
    table.add('Buyer', 'Buyer', Pivot.PivotTableFieldType.rowField);
    table.add('Amount', 'Amount', Pivot.PivotTableFieldType.valueField, Pivot.SubtotalType.sum);
    expect(table.getItemsByField('Buyer')).toEqual(['Mom', 'Dad', 'Kelly']);
    expect(table.getItemsByField('Buyer', true)).toEqual(['Dad', 'Kelly', 'Mom']);
  });
});

/** Label/value grid read from the written cells over the pivot content range. */
function cellTexts(table: ReturnType<typeof add>): (string | number | null)[][] {
  const sheet = (table as unknown as { sheet: SheetT }).sheet;
  const range = table.getRange().content!;
  const out: (string | number | null)[][] = [];
  for (let r = 0; r < range.rowCount; r++) {
    const row: (string | number | null)[] = [];
    for (let c = 0; c < range.colCount; c++) row.push(sheet.getValue(range.row + r, range.col + c) as string | number | null);
    out.push(row);
  }
  return out;
}

describe('pivot compact layout', () => {
  it('writes headers, sorted labels, values and the grand total like the trial', () => {
    const { sheet } = build();
    const table = add(sheet);
    table.add('Buyer', 'Buyer', Pivot.PivotTableFieldType.rowField);
    table.add('Amount', 'Amount', Pivot.PivotTableFieldType.valueField, Pivot.SubtotalType.sum);
    const range = table.getRange();
    expect(range.page).toBeNull();
    expect({ ...range.content }).toEqual({ row: 1, col: 1, rowCount: 5, colCount: 2 });
    expect(cellTexts(table)).toEqual([
      ['Row Labels', 'Amount'],
      ['Dad', 388],
      ['Kelly', 221],
      ['Mom', 439],
      ['Grand Total', 1048],
    ]);
  });

  it('keeps an 18x3 placeholder grid without fields (trial shape)', () => {
    const { sheet } = build();
    const table = add(sheet);
    expect({ ...table.getRange().content }).toEqual({ row: 1, col: 1, rowCount: 18, colCount: 3 });
  });

  it('maps value cells with getNodeInfo; label and header cells have no node', () => {
    const { sheet } = build();
    const table = add(sheet);
    table.add('Buyer', 'Buyer', Pivot.PivotTableFieldType.rowField);
    table.add('Amount', 'Amount', Pivot.PivotTableFieldType.valueField, Pivot.SubtotalType.sum);
    expect(table.getNodeInfo(1, 1)).toBeUndefined();
    expect(table.getNodeInfo(2, 1)).toBeUndefined();
    const info = table.getNodeInfo(2, 2)!;
    expect(info.fieldInfos).toEqual([{ fieldName: 'Buyer', fieldItem: 'Dad' }]);
    expect(info.valueInfo).toEqual({ sourceName: 'Amount', subtotalType: Pivot.SubtotalType.sum });
    const grand = table.getNodeInfo(5, 2)!;
    expect(grand.fieldInfos).toEqual([]);
  });

  it('getNodeValue only reports overwritten values, like the trial', () => {
    const { sheet } = build();
    const table = add(sheet);
    table.add('Buyer', 'Buyer', Pivot.PivotTableFieldType.rowField);
    table.add('Amount', 'Amount', Pivot.PivotTableFieldType.valueField, Pivot.SubtotalType.sum);
    expect(table.getNodeValue(table.getNodeInfo(2, 2)!)).toBeUndefined();
    table.setNodeValue(table.getNodeInfo(2, 2)!, 999);
    expect(table.getNodeValue(table.getNodeInfo(2, 2)!)).toBe(999);
    expect(sheet.getValue(2, 2)).toBe(999);
    expect(table.getOverwriteList()).toEqual([{
      fieldInfos: [{ fieldName: 'Buyer', fieldItem: 'Dad' }],
      valueInfo: { sourceName: 'Amount', subtotalType: Pivot.SubtotalType.sum },
      value: 999,
    }]);
    table.clearOverwriteList();
    expect(table.getNodeValue(table.getNodeInfo(2, 2)!)).toBeUndefined();
    expect(sheet.getValue(2, 2)).toBe(388);
  });

  it('returns the detail rows of an item with getPivotDetails', () => {
    const { sheet } = build();
    const table = add(sheet);
    table.add('Buyer', 'Buyer', Pivot.PivotTableFieldType.rowField);
    table.add('Amount', 'Amount', Pivot.PivotTableFieldType.valueField, Pivot.SubtotalType.sum);
    const details = table.getPivotDetails([{ fieldName: 'Buyer', fieldItem: 'Dad' }]) as unknown[][];
    expect(details[0]).toEqual(['Date', 'Buyer', 'Type', 'Amount', 'Region']);
    expect(details.slice(1).map(r => r[1])).toEqual(['Dad', 'Dad', 'Dad']);
  });

  it('shows subtotal rows for the outer row field in every layout (trial)', () => {
    const { sheet } = build();
    const table = add(sheet);
    table.add('Buyer', 'Buyer', Pivot.PivotTableFieldType.rowField);
    table.add('Type', 'Type', Pivot.PivotTableFieldType.rowField);
    table.add('Amount', 'Amount', Pivot.PivotTableFieldType.valueField, Pivot.SubtotalType.sum);
    expect(cellTexts(table).flat()).toContain('Dad Total');
    table.layoutType(Pivot.PivotTableLayoutType.outline);
    expect(cellTexts(table).flat()).toContain('Dad Total');
    table.layoutType(Pivot.PivotTableLayoutType.tabular);
    expect(cellTexts(table).flat()).toContain('Dad Total');
    // The innermost row field never gets its own subtotal rows.
    expect(cellTexts(table).flat()).not.toContain('Books Total');
    table.subtotalVisible('Buyer', false);
    expect(cellTexts(table).flat()).not.toContain('Dad Total');
    table.subtotalVisible('Buyer', true);
    expect(cellTexts(table).flat()).toContain('Dad Total');
  });

  it('writes the trial grid for two row fields in compact layout', () => {
    const { sheet } = build();
    const table = add(sheet);
    table.add('Buyer', 'Buyer', Pivot.PivotTableFieldType.rowField);
    table.add('Type', 'Type', Pivot.PivotTableFieldType.rowField);
    table.add('Amount', 'Amount', Pivot.PivotTableFieldType.valueField, Pivot.SubtotalType.sum);
    // One label column, indented child items, no empty combinations.
    expect({ ...table.getRange().content! }).toEqual({ row: 1, col: 1, rowCount: 16, colCount: 2 });
    expect(cellTexts(table)).toEqual([
      ['Row Labels', 'Amount'],
      ['Dad', null],
      ['Books', 310],
      ['Food', 58],
      ['Sports', 20],
      ['Dad Total', 388],
      ['Kelly', null],
      ['Books', 125],
      ['Fuel', 96],
      ['Kelly Total', 221],
      ['Mom', null],
      ['Food', 323],
      ['Fuel', 74],
      ['Sports', 42],
      ['Mom Total', 439],
      ['Grand Total', 1048],
    ]);
  });

  it('writes the trial grid for two row fields in outline layout', () => {
    const { sheet } = build();
    const table = add(sheet);
    table.add('Buyer', 'Buyer', Pivot.PivotTableFieldType.rowField);
    table.add('Type', 'Type', Pivot.PivotTableFieldType.rowField);
    table.add('Amount', 'Amount', Pivot.PivotTableFieldType.valueField, Pivot.SubtotalType.sum);
    table.layoutType(Pivot.PivotTableLayoutType.outline);
    expect({ ...table.getRange().content! }).toEqual({ row: 1, col: 1, rowCount: 16, colCount: 3 });
    expect(cellTexts(table)).toEqual([
      ['Buyer', 'Type', 'Amount'],
      ['Dad', null, null],
      [null, 'Books', 310],
      [null, 'Food', 58],
      [null, 'Sports', 20],
      ['Dad Total', null, 388],
      ['Kelly', null, null],
      [null, 'Books', 125],
      [null, 'Fuel', 96],
      ['Kelly Total', null, 221],
      ['Mom', null, null],
      [null, 'Food', 323],
      [null, 'Fuel', 74],
      [null, 'Sports', 42],
      ['Mom Total', null, 439],
      ['Grand Total', null, 1048],
    ]);
  });

  it('repeats labels in tabular layout without group rows', () => {
    const { sheet } = build();
    const table = add(sheet);
    table.add('Buyer', 'Buyer', Pivot.PivotTableFieldType.rowField);
    table.add('Type', 'Type', Pivot.PivotTableFieldType.rowField);
    table.add('Amount', 'Amount', Pivot.PivotTableFieldType.valueField, Pivot.SubtotalType.sum);
    table.layoutType(Pivot.PivotTableLayoutType.tabular);
    const grid = cellTexts(table);
    expect({ ...table.getRange().content! }).toEqual({ row: 1, col: 1, rowCount: 13, colCount: 3 });
    // The parent label is written once per group, subtotals keep their row.
    expect(grid.slice(0, 6)).toEqual([
      ['Buyer', 'Type', 'Amount'],
      ['Dad', 'Books', 310],
      [null, 'Food', 58],
      [null, 'Sports', 20],
      ['Dad Total', null, 388],
      ['Kelly', 'Books', 125],
    ]);
  });

  it('filters rows with a label filter', () => {
    const { sheet } = build();
    const table = add(sheet);
    table.add('Buyer', 'Buyer', Pivot.PivotTableFieldType.rowField);
    table.add('Amount', 'Amount', Pivot.PivotTableFieldType.valueField, Pivot.SubtotalType.sum);
    table.labelFilter('Buyer', { textItem: { list: ['Mom', 'Dad'], isAll: false } });
    const flat = cellTexts(table).flat();
    expect(flat).toContain('Dad');
    expect(flat).toContain('Mom');
    expect(flat).not.toContain('Kelly');
    expect(table.getRange().content!.rowCount).toBe(4);
    table.labelFilter('Buyer', null);
    expect(table.getRange().content!.rowCount).toBe(5);
  });

  it('sorts items by sortType', () => {
    const { sheet } = build();
    const table = add(sheet);
    table.add('Buyer', 'Buyer', Pivot.PivotTableFieldType.rowField);
    table.add('Amount', 'Amount', Pivot.PivotTableFieldType.valueField, Pivot.SubtotalType.sum);
    table.sort('Buyer', { sortType: Pivot.SortType.desc });
    expect(cellTexts(table).slice(1, 4).map(r => r[0])).toEqual(['Mom', 'Kelly', 'Dad']);
  });

  it('excludes filtered items from every aggregate, grand total included', () => {
    const { sheet } = build();
    const table = add(sheet);
    table.add('Buyer', 'Buyer', Pivot.PivotTableFieldType.rowField);
    table.add('Amount', 'Amount', Pivot.PivotTableFieldType.valueField, Pivot.SubtotalType.sum);
    table.labelFilter('Buyer', { textItem: { list: ['Mom', 'Dad'], isAll: false } });
    const grid = cellTexts(table);
    expect(grid[grid.length - 1]).toEqual(['Grand Total', 827]);
  });

  it('keeps aggregated values at 14 significant digits (trial)', () => {
    const { sheet } = build();
    const table = add(sheet);
    table.add('Buyer', 'Buyer', Pivot.PivotTableFieldType.rowField);
    table.add('Amount', 'Amount', Pivot.PivotTableFieldType.valueField, Pivot.SubtotalType.average);
    const grid = cellTexts(table);
    expect(grid[1][1]).toBe(129.33333333333);
    expect(grid[grid.length - 1][1]).toBe(116.44444444444);
  });

  it('writes missingCaption into empty data cells when showMissing is on', () => {
    const { data, sheet } = build();
    data.setArray(10, 0, [['15-Mar', 'X', 'Toys', null, 'East']]);
    const table = add(sheet, 'm', 'Data!A1:E11');
    table.options.showMissing = true;
    table.options.missingCaption = 'N/A';
    table.add('Type', 'Type', Pivot.PivotTableFieldType.rowField);
    table.add('Amount', 'Amount', Pivot.PivotTableFieldType.valueField, Pivot.SubtotalType.sum);
    const grid = cellTexts(table);
    expect(grid.map(r => r[0])).toContain('Toys');
    expect(grid.find(r => r[0] === 'Toys')![1]).toBe('N/A');
    table.options.missingCaption = undefined;
    table.refresh();
    expect(cellTexts(table).find(r => r[0] === 'Toys')![1]).toBeNull();
  });
});

describe('pivot column axis and page fields (trial grids)', () => {
  it('writes the two-row header block with "Column Labels" and per-row totals', () => {
    const { sheet } = build();
    const table = add(sheet);
    table.add('Buyer', 'Buyer', Pivot.PivotTableFieldType.rowField);
    table.add('Type', 'Type', Pivot.PivotTableFieldType.columnField);
    table.add('Amount', 'Amount', Pivot.PivotTableFieldType.valueField, Pivot.SubtotalType.sum);
    expect({ ...table.getRange().content! }).toEqual({ row: 1, col: 1, rowCount: 6, colCount: 6 });
    expect(cellTexts(table)).toEqual([
      ['Amount', 'Column Labels', null, null, null, null],
      ['Row Labels', 'Books', 'Food', 'Fuel', 'Sports', 'Grand Total'],
      ['Dad', 310, 58, null, 20, 388],
      ['Kelly', 125, null, 96, null, 221],
      ['Mom', null, 323, 74, 42, 439],
      ['Grand Total', 435, 381, 170, 62, 1048],
    ]);
  });

  it('writes one data column per data field, named in the header', () => {
    const { sheet } = build();
    const table = add(sheet);
    table.add('Buyer', 'Buyer', Pivot.PivotTableFieldType.rowField);
    table.add('Amount', 'Sum of Amount', Pivot.PivotTableFieldType.valueField, Pivot.SubtotalType.sum);
    table.add('Amount', 'Count of Amount', Pivot.PivotTableFieldType.valueField, Pivot.SubtotalType.count);
    expect({ ...table.getRange().content! }).toEqual({ row: 1, col: 1, rowCount: 5, colCount: 3 });
    expect(cellTexts(table)).toEqual([
      ['Row Labels', 'Sum of Amount', 'Count of Amount'],
      ['Dad', 388, 3],
      ['Kelly', 221, 2],
      ['Mom', 439, 4],
      ['Grand Total', 1048, 9],
    ]);
    expect(table.getFieldsByArea(Pivot.PivotTableFieldType.valueField).map(f => f.fieldName))
      .toEqual(['Sum of Amount', 'Count of Amount']);
  });

  it('groups several data fields by column and adds " Total" columns', () => {
    const { sheet } = build();
    const table = add(sheet);
    table.add('Buyer', 'Buyer', Pivot.PivotTableFieldType.rowField);
    table.add('Type', 'Type', Pivot.PivotTableFieldType.columnField);
    table.add('Amount', 'Sum of Amount', Pivot.PivotTableFieldType.valueField, Pivot.SubtotalType.sum);
    table.add('Amount', 'Count of Amount', Pivot.PivotTableFieldType.valueField, Pivot.SubtotalType.count);
    expect({ ...table.getRange().content! }).toEqual({ row: 1, col: 1, rowCount: 7, colCount: 11 });
    expect(cellTexts(table)).toEqual([
      [null, 'Column Labels', null, null, null, null, null, null, null, null, null],
      [null, 'Sum of Amount', null, null, null, 'Count of Amount', null, null, null, ' Total Sum of Amount', ' Total Count of Amount'],
      ['Row Labels', 'Books', 'Food', 'Fuel', 'Sports', 'Books', 'Food', 'Fuel', 'Sports', null, null],
      ['Dad', 310, 58, null, 20, 1, 1, null, 1, 388, 3],
      ['Kelly', 125, null, 96, null, 1, null, 1, null, 221, 2],
      ['Mom', null, 323, 74, 42, null, 2, 1, 1, 439, 4],
      ['Grand Total', 435, 381, 170, 62, 2, 3, 2, 2, 1048, 9],
    ]);
  });

  it('adds subtotal columns for the outer column field', () => {
    const { sheet } = build();
    const table = add(sheet);
    table.add('Buyer', 'Buyer', Pivot.PivotTableFieldType.rowField);
    table.add('Region', 'Region', Pivot.PivotTableFieldType.columnField);
    table.add('Type', 'Type', Pivot.PivotTableFieldType.columnField);
    table.add('Amount', 'Amount', Pivot.PivotTableFieldType.valueField, Pivot.SubtotalType.sum);
    expect({ ...table.getRange().content! }).toEqual({ row: 1, col: 1, rowCount: 7, colCount: 8 });
    expect(cellTexts(table)).toEqual([
      ['Amount', 'Column Labels', null, null, null, null, null, null],
      [null, 'East', null, 'East Total', 'West', null, 'West Total', 'Grand Total'],
      ['Row Labels', 'Food', 'Fuel', null, 'Books', 'Sports', null, null],
      ['Dad', 58, null, 58, 310, 20, 330, 388],
      ['Kelly', null, 96, 96, 125, null, 125, 221],
      ['Mom', 323, 74, 397, null, 42, 42, 439],
      ['Grand Total', 381, 170, 551, 435, 62, 497, 1048],
    ]);
  });

  it('moves the data caption into the first data row without row fields', () => {
    const { sheet } = build();
    const table = add(sheet);
    table.add('Type', 'Type', Pivot.PivotTableFieldType.columnField);
    table.add('Amount', 'Amount', Pivot.PivotTableFieldType.valueField, Pivot.SubtotalType.sum);
    expect({ ...table.getRange().content! }).toEqual({ row: 1, col: 1, rowCount: 3, colCount: 6 });
    expect(cellTexts(table)).toEqual([
      [null, 'Column Labels', null, null, null, null],
      [null, 'Books', 'Food', 'Fuel', 'Sports', 'Grand Total'],
      ['Amount', 435, 381, 170, 62, 1048],
    ]);
  });

  it('writes the report filter above the anchor like the trial', () => {
    const { sheet } = build();
    const table = add(sheet, 'p', 'sourceData', 3, 1);
    table.add('Region', 'Region', Pivot.PivotTableFieldType.filterField);
    table.add('Buyer', 'Buyer', Pivot.PivotTableFieldType.rowField);
    table.add('Amount', 'Amount', Pivot.PivotTableFieldType.valueField, Pivot.SubtotalType.sum);
    const range = table.getRange();
    expect({ ...range.page! }).toEqual({ row: 1, col: 1, rowCount: 1, colCount: 2 });
    expect({ ...range.content! }).toEqual({ row: 3, col: 1, rowCount: 5, colCount: 2 });
    expect(sheet.getValue(1, 1)).toBe('Region');
    expect(sheet.getValue(1, 2)).toBe('All');
    expect(sheet.getValue(2, 1)).toBeFalsy();
    expect(cellTexts(table)).toEqual([
      ['Row Labels', 'Amount'],
      ['Dad', 388],
      ['Kelly', 221],
      ['Mom', 439],
      ['Grand Total', 1048],
    ]);
    // Selecting one item filters the table and shows the item in the page cell.
    table.labelFilter('Region', { textItem: { list: ['West'], isAll: false } });
    expect(sheet.getValue(1, 2)).toBe('West');
    expect(cellTexts(table)).toEqual([
      ['Row Labels', 'Amount'],
      ['Dad', 330],
      ['Kelly', 125],
      ['Mom', 42],
      ['Grand Total', 497],
    ]);
  });

  it('aggregates a collapsed group row and hides its children', () => {
    const { sheet } = build();
    const table = add(sheet);
    table.add('Buyer', 'Buyer', Pivot.PivotTableFieldType.rowField);
    table.add('Type', 'Type', Pivot.PivotTableFieldType.rowField);
    table.add('Amount', 'Amount', Pivot.PivotTableFieldType.valueField, Pivot.SubtotalType.sum);
    table.collapse('Buyer', 'Dad', true);
    expect({ ...table.getRange().content! }).toEqual({ row: 1, col: 1, rowCount: 12, colCount: 2 });
    expect(cellTexts(table)).toEqual([
      ['Row Labels', 'Amount'],
      ['Dad', 388],
      ['Kelly', null],
      ['Books', 125],
      ['Fuel', 96],
      ['Kelly Total', 221],
      ['Mom', null],
      ['Food', 323],
      ['Fuel', 74],
      ['Sports', 42],
      ['Mom Total', 439],
      ['Grand Total', 1048],
    ]);
    expect(table.collapse('Buyer', 'Dad')).toBe(true);
    table.collapse('Buyer', 'Dad', false);
    expect(table.getRange().content!.rowCount).toBe(16);
  });
});

describe('pivot aggregation', () => {
  const valuesFor = (subtotal: number): unknown => {
    const { sheet } = build();
    const table = add(sheet);
    table.add('Buyer', 'Buyer', Pivot.PivotTableFieldType.rowField);
    table.add('Amount', subtotal === Pivot.SubtotalType.sum ? 'Amount' : 'Sub', Pivot.PivotTableFieldType.valueField, subtotal);
    const grid = cellTexts(table);
    return grid.map(r => r[1]);
  };

  it('supports sum, count, average, max, min on the value area', () => {
    expect(valuesFor(Pivot.SubtotalType.sum)).toEqual(['Amount', 388, 221, 439, 1048]);
    expect(valuesFor(Pivot.SubtotalType.count)).toEqual(['Sub', 3, 2, 4, 9]);
    expect(valuesFor(Pivot.SubtotalType.max)).toEqual(['Sub', 310, 125, 235, 310]);
    expect(valuesFor(Pivot.SubtotalType.min)).toEqual(['Sub', 20, 96, 42, 20]);
    const average = valuesFor(Pivot.SubtotalType.average) as number[];
    expect(average[1]).toBeCloseTo(388 / 3, 6);
    expect(average[4]).toBeCloseTo(1048 / 9, 6);
  });

  it('supports product, countNums, stdev/var (sample and population)', () => {
    const product = valuesFor(Pivot.SubtotalType.product) as number[];
    expect(product[1]).toBe(20 * 58 * 310);
    expect(valuesFor(Pivot.SubtotalType.countNums)).toEqual(['Sub', 3, 2, 4, 9]);
    const amounts = [74, 235, 20, 125, 58, 42, 96, 310, 88];
    const mean = amounts.reduce((s, v) => s + v, 0) / amounts.length;
    const variance = amounts.reduce((s, v) => s + (v - mean) ** 2, 0) / amounts.length;
    const std = valuesFor(Pivot.SubtotalType.stdDevp) as number[];
    expect(std[4]).toBeCloseTo(Math.sqrt(variance), 6);
    const varSample = valuesFor(Pivot.SubtotalType.varr) as number[];
    const sample = amounts.reduce((s, v) => s + (v - mean) ** 2, 0) / (amounts.length - 1);
    expect(varSample[4]).toBeCloseTo(sample, 6);
  });

  it('changes the value field subtotal through subtotalType', () => {
    const { sheet } = build();
    const table = add(sheet);
    table.add('Buyer', 'Buyer', Pivot.PivotTableFieldType.rowField);
    table.add('Amount', 'Amount', Pivot.PivotTableFieldType.valueField, Pivot.SubtotalType.sum);
    expect(table.subtotalType('Amount')).toBe(Pivot.SubtotalType.sum);
    table.subtotalType('Amount', Pivot.SubtotalType.count);
    expect(cellTexts(table)[1][1]).toBe(3);
  });
});

describe('pivot serialization', () => {
  it('serializes with the trial option defaults', () => {
    const { sheet } = build();
    const table = add(sheet);
    const info = table.serialize();
    expect(info.options).toMatchObject({
      allowMultipleFiltersPerField: false,
      grandTotalPosition: Pivot.GrandTotalPosition.both,
      subtotalsPosition: Pivot.SubtotalsPosition.bottom,
      subTotalsPosition: Pivot.SubtotalsPosition.bottom,
      showRowHeader: true,
      showColumnHeader: true,
      showDrill: true,
      showMissing: true,
      rowLabelIndent: 1,
      showFilter: true,
      showToolTip: true,
      mergeItem: false,
      hideValuesRow: true,
    });
    expect(info.layoutType).toBe(Pivot.PivotTableLayoutType.compact);
    expect(info.pivotTablePosition).toEqual([1, 1]);
    expect(info.theme).toBe('medium2');
    expect(info.valuePosition).toEqual({ positionType: Pivot.DataPosition.col, positionIndex: 0, display: false });
    expect(info.fieldsInfo).toEqual([[], [], [], []]);
    expect(info.fieldSortMap).toEqual({ sortMaps: {}, sortTypes: {} });
  });

  it('round-trips the model through serialize/deserialize', () => {
    const { sheet } = build();
    const table = add(sheet);
    table.add('Buyer', 'Buyer', Pivot.PivotTableFieldType.rowField);
    table.add('Amount', 'Amount', Pivot.PivotTableFieldType.valueField, Pivot.SubtotalType.count);
    table.labelFilter('Buyer', { textItem: { list: ['Dad'], isAll: false } });
    const info = JSON.parse(JSON.stringify(table.serialize()));
    table.labelFilter('Buyer', null);
    expect(table.getRange().content!.rowCount).toBe(5);
    table.deserialize(info);
    expect(table.getRange().content!.rowCount).toBe(3);
    expect(cellTexts(table)[1]).toEqual(['Dad', 3]);
  });

  it('writes the trial sheet-JSON pivotTables and pivotCaches shapes', () => {
    const { wb, sheet } = build();
    const table = add(sheet);
    table.add('Buyer', 'Buyer', Pivot.PivotTableFieldType.rowField);
    table.add('Amount', 'Amount', Pivot.PivotTableFieldType.valueField, Pivot.SubtotalType.sum);
    const json = wb.toJSON() as Record<string, unknown>;
    const pivotSheet = (json.sheets as Record<string, Record<string, unknown>>)['Pivot'];
    const entry = (pivotSheet.pivotTables as Record<string, unknown>[])[0];
    expect(entry.name).toBe('pivot1');
    expect(entry.styleName).toBe('PivotStyleMedium2');
    expect(entry.cacheId).toBe('1');
    expect(entry.ref).toBe('B2:C6');
    expect(entry.rowFields).toEqual([1]);
    expect((entry.dataFields as Record<string, unknown>[]).length).toBe(1);
    const caches = json.pivotCaches as Record<string, Record<string, unknown>>;
    expect(Object.keys(caches)).toEqual(['1']);
    const cache = caches['1'];
    expect(cache.name).toBe('pivot1');
    expect(cache.sourceType).toBe('worksheet');
    expect(cache.sourceName).toBe('sourceData');
    expect((cache.fields as Record<string, unknown>[]).map(f => f.name)).toEqual(['Date', 'Buyer', 'Type', 'Amount', 'Region']);
    expect((cache.headerList as Record<string, unknown>[])[3]).toEqual({ name: 'Amount', dataType: Pivot.PivotDataType.number, index: 3 });
    const records = cache.pivotCacheRecords as Record<string, unknown>[][];
    expect(records[0][0]).toEqual({ type: 'x', value: 0 });
    expect(records[8][1]).toEqual({ type: 'x', value: 0 });
  });

  it('round-trips value filters and grand-total options through the sheet JSON', async () => {
    const { wb, sheet } = build();
    const table = add(sheet);
    table.add('Buyer', 'Buyer', Pivot.PivotTableFieldType.rowField);
    table.add('Amount', 'Amount', Pivot.PivotTableFieldType.valueField, Pivot.SubtotalType.sum);
    table.valueFilter('Buyer', { conditionByName: 'Amount', condition: { conType: 2, val: [300], operator: 2 } });
    expect(table.getRange().content!.rowCount).toBe(4);
    const entry = (wb.toJSON().sheets as Record<string, Record<string, unknown>>)['Pivot']
      .pivotTables as Record<string, unknown>[];
    expect((entry[0]!.pivotFilters as Record<string, unknown>[])[0]).toMatchObject({
      fld: 1, conType: 2, operator: 2, iMeasureFld: 0, evalOrder: -1,
      autoFilter: { filterItemMap: [{ conditions: [{ compareType: 2, conType: 2, item1: { expected: 300 }, item2: {} }] }] },
    });
    const json = JSON.parse(JSON.stringify(wb.toJSON()));
    const wb2 = new Workbook();
    await wb2.fromJSON(json);
    const restored = wb2.getSheetFromName('Pivot').pivotTables.get('pivot1');
    expect(restored.getRange().content!.rowCount).toBe(4);
    expect(restored.valueFilter('Buyer')).toMatchObject({ conditionByName: 'Amount' });

    // Grand totals switched off survive the JSON round-trip as well.
    const other = add(sheet, 'noTotals', 'sourceData', 1, 6);
    other.add('Buyer', 'Buyer', Pivot.PivotTableFieldType.rowField);
    other.add('Amount', 'Amount', Pivot.PivotTableFieldType.valueField, Pivot.SubtotalType.sum);
    other.options.grandTotalPosition = 0;
    other.refresh();
    expect(other.getRange().content!.rowCount).toBe(4);
    const json2 = JSON.parse(JSON.stringify(wb.toJSON()));
    const wb3 = new Workbook();
    await wb3.fromJSON(json2);
    const back = wb3.getSheetFromName('Pivot').pivotTables.get('noTotals');
    expect(back.getRange().content!.rowCount).toBe(4);
    expect(back.options.grandTotalPosition).toBe(0);
  });

  it('restores a pivot from workbook JSON (trial fromJSON behaviour)', async () => {
    const { wb, sheet } = build();
    const table = add(sheet);
    table.add('Buyer', 'Buyer', Pivot.PivotTableFieldType.rowField);
    table.add('Amount', 'Amount', Pivot.PivotTableFieldType.valueField, Pivot.SubtotalType.sum);
    const json = JSON.parse(JSON.stringify(wb.toJSON()));
    const wb2 = new Workbook();
    await wb2.fromJSON(json);
    const restored = wb2.getSheetFromName('Pivot').pivotTables.get('pivot1');
    expect(restored).toBeTruthy();
    expect(restored.getSource()).toBe('=sourceData');
    expect(restored.getThemeName()).toBe('Medium2');
    expect({ ...restored.getRange().content! }).toEqual({ row: 1, col: 1, rowCount: 5, colCount: 2 });
    const texts: unknown[] = [];
    const range = restored.getRange().content!;
    for (let r = 0; r < range.rowCount; r++) for (let c = 0; c < range.colCount; c++) texts.push(wb2.getSheetFromName('Pivot').getValue(range.row + r, range.col + c));
    expect(texts).toContain('Grand Total');
    expect(texts).toContain(1048);
    void sheet;
  });
});

describe('pivot themes', () => {
  it('exposes the 85 built-in themes with trial names and key order', () => {
    const keys = Object.keys(Pivot.PivotTableThemes as object).filter(k => !['length', 'name', 'prototype'].includes(k));
    expect(keys).toHaveLength(85);
    expect(keys[0]).toBe('light0');
    expect(keys.slice(1, 4)).toEqual(['light1', 'medium1', 'dark1']);
    expect((Pivot.PivotTableThemes as unknown as ThemesT)['medium2'].name()).toBe('Medium2');
    expect((Pivot.PivotTableThemes as unknown as ThemesT)['light0'].toJSON()).toEqual({ name: 'Light0' });
  });

  it('carries the trial medium2 style slots', () => {
    const json = (Pivot.PivotTableThemes as unknown as ThemesT)['medium2'].toJSON() as Record<string, Record<string, unknown>>;
    expect(json.headerRowStyle!.backColor).toBe('Accent 1 -25');
    expect(json.headerRowStyle!.foreColor).toBe('rgb(255,255,255)');
    expect(json.grandTotalRowStyle!.borderTop).toEqual({ color: 'Accent 1 -25', style: 6 });
    expect((Pivot.PivotTableThemes as unknown as ThemesT)['medium2'].headerRowStyle()!.backColor).toBe('Accent 1 -25');
  });

  it('applies theme styles to the written pivot cells', () => {
    const { sheet } = build();
    const table = add(sheet);
    table.add('Buyer', 'Buyer', Pivot.PivotTableFieldType.rowField);
    table.add('Amount', 'Amount', Pivot.PivotTableFieldType.valueField, Pivot.SubtotalType.sum);
    const area = Spread.Sheets.SheetArea.viewport;
    const header = sheet.getStyle(1, 2, area);
    // The trial paints the Medium2 header as #2f77b7 with white bold text; our
    // HSL shading lands within two units per channel.
    const channels = (hex: string): number[] => [1, 3, 5].map(i => Number.parseInt(hex.slice(i, i + 2), 16));
    const got = channels(String(header!.backColor).toLowerCase());
    const want = channels('#2f77b7');
    got.forEach((value, index) => expect(Math.abs(value - want[index]!)).toBeLessThanOrEqual(2));
    expect(String(header!.foreColor).toLowerCase()).toBe('#ffffff');
    expect(String(header!.font ?? header!.fontWeight)).toMatch(/bold/);
    expect(table.getThemeName()).toBe('Medium2');
    table.theme('light0');
    expect(table.getThemeName()).toBe('Light0');
    expect(sheet.getStyle(1, 2, area)?.backColor).toBeFalsy();
  });

  it('parses and composes the style font shorthand like the trial', () => {
    const style = new Pivot.PivotTableStyle('#111111', '#222222', 'bold italic 12px Calibri');
    expect(style.fontWeight).toBe('bold');
    expect(style.fontStyle).toBe('italic');
    expect(style.fontSize).toBe('12px');
    expect(style.fontFamily).toBe('Calibri');
    // The parts compose back in the trial order: style, weight, size, family.
    expect(style.font).toBe('italic bold 12px Calibri');
    expect(style.toJSON()).toEqual({
      backColor: '#111111', foreColor: '#222222',
      fontStyle: 'italic', fontWeight: 'bold', fontSize: '12px', fontFamily: 'Calibri',
      font: 'italic bold 12px Calibri',
    });
    const restored = new Pivot.PivotTableStyle();
    restored.fromJSON({ backColor: '#555555', font: 'italic 10px Arial' });
    expect(restored.backColor).toBe('#555555');
    expect(restored.fontFamily).toBe('Arial');
    expect(restored.fontSize).toBe('10px');
  });

  it('stores custom themes on the workbook', () => {
    const { wb } = build();
    const theme = wb.customPivotTableThemes.add('custom0');
    expect(theme).toBeTruthy();
    expect(wb.customPivotTableThemes.all().map(t => t.name())).toEqual(['custom0']);
    expect(wb.customPivotTableThemes.get('Custom0')).toBe(theme);
    wb.customPivotTableThemes.remove('custom0');
    expect(wb.customPivotTableThemes.all()).toEqual([]);
  });
});

describe('pivot events', () => {
  it('fires PivotTableChanged after add and remove', () => {
    const { wb, sheet } = build();
    const fired: string[] = [];
    const onPivot = (_s: unknown, e: unknown) => { fired.push((e as { name: string }).name); };
    wb.bind(GC.Spread.Sheets.Events.PivotTableChanged, onPivot as never);
    const table = add(sheet, 'watched');
    expect(fired).toContain('watched');
    table.add('Buyer', 'Buyer', Pivot.PivotTableFieldType.rowField);
    expect(fired.filter(n => n === 'watched').length).toBeGreaterThanOrEqual(2);
    sheet.pivotTables.remove('watched');
  });
});
