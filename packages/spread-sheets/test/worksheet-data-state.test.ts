// @vitest-environment jsdom
/**
 * Task 38 item 3: `Worksheet` data/state API. Every expected value below is the
 * value the official 19.2.5 trial produces for the same public call (see
 * `.probe/report-item3*.json`, which runs the same snippet against both
 * libraries). Where the trial contradicted an earlier self-derived expectation,
 * the trial value is used and the difference is recorded in docs/STATUS.md.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import GC from '../src/index.js';

const { Worksheet, Workbook, Range, Style, UsedRangeType, SheetArea, EditorStatus, StorageType } = GC.Spread.Sheets;
type Sheet = InstanceType<typeof Worksheet>;
type Book = InstanceType<typeof Workbook>;
type SheetRange = InstanceType<typeof Range>;

describe('Worksheet.getUsedRange', () => {
  let sheet: Sheet;
  beforeEach(() => {
    sheet = new Worksheet('Used');
  });
  const box = (value: SheetRange | null) => (value ? [value.row, value.col, value.rowCount, value.colCount] : null);

  it('answers null for every kind of an empty sheet and without a type', () => {
    for (const [name, value] of Object.entries(UsedRangeType) as [string, number][])
      if (!/^\d+$/.test(name)) expect(box(sheet.getUsedRange(value)), name).toBeNull();
    expect(sheet.getUsedRange()).toBeNull();
    expect(box(sheet.getUsedRange(0))).toBeNull();
    expect(box(sheet.getUsedRange(UsedRangeType.data | UsedRangeType.comment))).toBeNull();
  });

  it('counts formulas as data but not styles, spans or tags', () => {
    sheet.setFormula(1, 1, '=2+2');
    expect(box(sheet.getUsedRange(UsedRangeType.formula))).toEqual([1, 1, 1, 1]);
    expect(box(sheet.getUsedRange(UsedRangeType.data))).toEqual([1, 1, 1, 1]);
    sheet.getRange(4, 3, 1, 1).backColor('#0000ff');
    expect(box(sheet.getUsedRange(UsedRangeType.style))).toEqual([4, 3, 1, 1]);
    expect(box(sheet.getUsedRange(UsedRangeType.data))).toEqual([1, 1, 1, 1]);
    expect(box(sheet.getUsedRange(UsedRangeType.all))).toEqual([1, 1, 4, 3]);
    sheet.setValue(6, 6, 'x');
    expect(box(sheet.getUsedRange(UsedRangeType.data))).toEqual([1, 1, 6, 6]);
    sheet.addSpan(8, 8, 2, 2);
    expect(box(sheet.getUsedRange(UsedRangeType.span))).toEqual([8, 8, 2, 2]);
    expect(box(sheet.getUsedRange(UsedRangeType.data))).toEqual([1, 1, 6, 6]);
    expect(box(sheet.getUsedRange(UsedRangeType.all))).toEqual([1, 1, 9, 9]);
  });

  it('reports comments, tags and outline groups, keeping the -1 axis extent', () => {
    sheet.setValue(1, 1, 'd');
    sheet.comments.add(2, 2, 'c');
    sheet.rowOutlines.group(4, 2);
    expect(box(sheet.getUsedRange(UsedRangeType.data))).toEqual([1, 1, 1, 1]);
    expect(box(sheet.getUsedRange(UsedRangeType.comment))).toEqual([2, 2, 1, 1]);
    expect(box(sheet.getUsedRange(UsedRangeType.axis))).toEqual([4, 0, 2, -1]);
    expect(box(sheet.getUsedRange(UsedRangeType.style))).toBeNull();
    expect(box(sheet.getUsedRange(UsedRangeType.rowStyle))).toBeNull();
    expect(box(sheet.getUsedRange(UsedRangeType.colStyle))).toBeNull();
    expect(box(sheet.getUsedRange(UsedRangeType.span))).toBeNull();
    expect(box(sheet.getUsedRange(UsedRangeType.dataValidation))).toBeNull();
    expect(box(sheet.getUsedRange(UsedRangeType.tag))).toBeNull();
    expect(box(sheet.getUsedRange(UsedRangeType.all))).toEqual([1, 0, 5, -1]);
    sheet.setTag(6, 7, 't');
    expect(box(sheet.getUsedRange(UsedRangeType.tag))).toEqual([6, 7, 1, 1]);
    expect(box(sheet.getUsedRange(UsedRangeType.data))).toEqual([1, 1, 1, 1]);
    expect(box(sheet.getUsedRange(UsedRangeType.all))).toEqual([1, 0, 6, -1]);
  });

  it('keeps whole-row and whole-column styles on their own kind and widens the union', () => {
    const style = new Style();
    style.backColor = '#00ff00';
    sheet.setStyle(3, -1, style, SheetArea.viewport);
    expect(box(sheet.getUsedRange(UsedRangeType.rowStyle))).toEqual([3, 0, 1, -1]);
    expect(box(sheet.getUsedRange(UsedRangeType.style))).toBeNull();
    expect(box(sheet.getUsedRange(UsedRangeType.all))).toEqual([3, 0, 1, -1]);
    sheet.setStyle(-1, 4, style, SheetArea.viewport);
    expect(box(sheet.getUsedRange(UsedRangeType.colStyle))).toEqual([0, 4, -1, 1]);
    expect(box(sheet.getUsedRange(UsedRangeType.all))).toEqual([0, 0, -1, -1]);
  });

  it('returns a GC.Spread.Sheets.Range instance', () => {
    sheet.setValue(2, 3, 'x');
    const range = sheet.getUsedRange(UsedRangeType.data)!;
    expect(range).toBeInstanceOf(Range);
    expect(JSON.stringify(range)).toBe('{"row":2,"col":3,"rowCount":1,"colCount":1}');
    expect(new Worksheet('Empty').getUsedRange(UsedRangeType.data)).toBeNull();
  });
});

describe('Worksheet.getCsv (sheet inside a workbook)', () => {
  let sheet: Sheet;
  beforeEach(() => {
    // The trial only writes header labels for a sheet that belongs to a
    // workbook, so the label scenarios use an attached sheet (`csv-rules`).
    const workbook = new Workbook();
    workbook.addSheet(1, new Worksheet('Extra'));
    sheet = workbook.getActiveSheet();
    sheet.name('Csv');
    sheet.setArray(0, 0, [[1, 'a,b', 'c\nd'], [true, null, 'x']]);
  });

  it('quotes every cell, doubles quotes and uses the formatted text', () => {
    expect(sheet.getCsv(0, 0, 2, 3, '\r\n', ',')).toBe('"1","a,b","c\nd"\r\n"TRUE","","x"\r\n');
    expect(sheet.getCsv(0, 0, 2, 3, '\n', ';')).toBe('"1";"a,b";"c\nd"\n"TRUE";"";"x"\n');
    // Defaults: \r\n row delimiter, tab column delimiter.
    expect(sheet.getCsv(0, 0, 2, 3)).toBe('"1"\t"a,b"\t"c\nd"\r\n"TRUE"\t""\t"x"\r\n');
    expect(sheet.getCsv(0, 0, 1, 1, '\r\n', ',')).toBe('"1"\r\n');
    expect(sheet.getCsv(1, 1, 2, 1, '\r\n', ',')).toBe('""\r\n""\r\n');
    expect(sheet.getCsv(0, 0, 5, 5, '\r\n', ',')).toBe(
      '"1","a,b","c\nd","",""\r\n"TRUE","","x","",""\r\n"","","","",""\r\n"","","","",""\r\n"","","","",""\r\n',
    );
  });

  it('formats booleans, dates and number formats like the trial', () => {
    const other = new Worksheet('CsvMore');
    other.setValue(0, 0, 'say "hi"');
    other.setValue(0, 1, 'tab\there');
    other.setValue(1, 0, new Date(2020, 0, 2));
    other.setValue(1, 1, -1234.5);
    other.setValue(1, 2, true);
    other.setValue(1, 3, '');
    other.getRange(2, 0).formatter('0.00%');
    other.setValue(2, 0, 0.5);
    expect(other.getCsv(0, 0, 3, 4, '\r\n', ',')).toBe(
      '"say ""hi""","tab\there","",""\r\n"1/2/2020","-1234.5","TRUE",""\r\n"50.00%","","",""\r\n',
    );
    expect(other.getCsv(0, 0, 2, 2, '|', '~')).toBe('"say ""hi"""~"tab\there"|"1/2/2020"~"-1234.5"|');
  });

  it('adds the header labels a negative start implies', () => {
    const empties = (count: number) => Array.from({ length: count }, () => '""').join(',');
    expect(sheet.getCsv(-1, 0, 2, 2, '\r\n', ',')).toBe('"A","B"\r\n"1","a,b"\r\n"TRUE",""\r\n');
    expect(sheet.getCsv(0, -1, 2, 2, '\r\n', ',')).toBe('"1","1","a,b"\r\n"2","TRUE",""\r\n');
    expect(sheet.getCsv(0, -1, 1, -1, '\r\n', ',')).toBe(`"1","1","a,b","c\nd",${empties(17)}\r\n`);
    expect(sheet.getCsv(5, -1, 1, -1, '\r\n', ',')).toBe(`"6",${empties(20)}\r\n`);
    // The corner field of a doubly-negative window stays unquoted (trial value).
    expect(sheet.getCsv(-1, -1, 2, 2, '\r\n', ',')).toBe(',"A","B"\r\n"1","1","a,b"\r\n"2","TRUE",""\r\n');
    // Both sizes -1 (the whole sheet) writes no labels at all.
    const whole = sheet.getCsv(-1, -1, -1, -1, '\r\n', ',');
    expect(whole.split('\r\n').length).toBe(201);
    expect(whole.startsWith(`"1","a,b","c\nd",${empties(17)}\r\n`)).toBe(true);
    // A negative start with a zero count writes the header line only.
    expect(sheet.getCsv(-1, 0, 0, 2, '\r\n', ',')).toBe('"A","B"\r\n');
    expect(sheet.getCsv(0, -1, 2, 0, '\r\n', ',')).toBe('"1"\r\n"2"\r\n');
  });

  it('writes zero sizes as the trial does', () => {
    expect(sheet.getCsv(0, 0, 1, 0, '\r\n', ',')).toBe('\r\n');
    expect(sheet.getCsv(0, 0, 3, 0, '\r\n', ',')).toBe('\r\n\r\n\r\n');
    expect(sheet.getCsv(0, 0, 0, 1, '\r\n', ',')).toBe('');
    expect(sheet.getCsv(0, 0, 0, 0, '\r\n', ',')).toBe('');
    expect(sheet.getCsv(0, 0, -1, 0, '\r\n', ',').split('\r\n').length).toBe(201);
  });

  it('validates the sizes against the sheet, like the trial', () => {
    expect(() => sheet.getCsv(0, 0, 1, 25, '\r\n', ',')).toThrow('Invalid columnCount: 25 (must be between -1 and 20).');
    expect(() => sheet.getCsv(0, 0, 205, 1, '\r\n', ',')).toThrow('Invalid rowCount: 205 (must be between -1 and 200).');
    expect(() => sheet.getCsv(198, 19, 4, 3, '\r\n', ',')).toThrow('Invalid rowCount: 4 (must be between -1 and 2).');
    expect(sheet.getCsv(199, 19, 1, 1, '\r\n', ',')).toBe('""\r\n');
  });
});

describe('Worksheet.getCsv (detached sheet: no header labels)', () => {
  let sheet: Sheet;
  beforeEach(() => {
    sheet = new Worksheet('Alone');
    sheet.setArray(0, 0, [[1, 'a,b', 'c\nd'], [true, null, 'x']]);
  });

  it('treats a negative start as the first row and writes no labels', () => {
    const empties = (count: number) => Array.from({ length: count }, () => '""').join(',');
    expect(sheet.getCsv(-1, 0, 2, 2, '\r\n', ',')).toBe('"1","a,b"\r\n"TRUE",""\r\n');
    expect(sheet.getCsv(0, -1, 2, 2, '\r\n', ',')).toBe('"1","a,b"\r\n"TRUE",""\r\n');
    expect(sheet.getCsv(-1, -1, 2, 2, '\r\n', ',')).toBe('"1","a,b"\r\n"TRUE",""\r\n');
    expect(sheet.getCsv(0, -1, 1, -1, '\r\n', ',')).toBe(`"1","a,b","c\nd",${empties(17)}\r\n`);
    expect(sheet.getCsv(5, -1, 1, -1, '\r\n', ',')).toBe(`${empties(20)}\r\n`);
    expect(sheet.getCsv(-1, 0, 0, 2, '\r\n', ',')).toBe('');
    expect(sheet.getCsv(0, -1, 2, 0, '\r\n', ',')).toBe('\r\n\r\n');
    expect(sheet.getCsv(-1, -1, -1, -1, '\r\n', ',').split('\r\n').length).toBe(201);
  });
});

describe('Worksheet.setCsv', () => {
  let sheet: Sheet;
  beforeEach(() => {
    sheet = new Worksheet('Set');
  });

  it('converts values with the format engine, like the trial', () => {
    sheet.setCsv(0, 0, '2020-01-02,1/2/2020,-15%,1e3,0x10,2,3.5,TRUE,false,null,NaN,1e999,1.5e-3," 7 ","+8",.5', '\r\n', ',');
    const values = Array.from({ length: 16 }, (_, col) => sheet.getValue(0, col));
    expect(values.map((value) => (value instanceof Date ? 'date' : typeof value))).toEqual([
      'date', 'date', 'number', 'number', 'string', 'number', 'number', 'boolean', 'boolean', 'string', 'string', 'string',
      'number', 'number', 'number', 'number',
    ]);
    expect((values[0] as Date).getFullYear()).toBe(2020);
    expect((values[1] as Date).getMonth()).toBe(0);
    expect(values.slice(2)).toEqual([-0.15, 1000, '0x10', 2, 3.5, true, false, 'null', 'NaN', '1e999', 0.0015, 7, 8, 0.5]);
    // The trial keeps the number format the field text implies.
    expect(sheet.getText(0, 2)).toBe('-15%');
    expect(sheet.getText(0, 3)).toBe('1.00E+03');
    expect(sheet.getText(0, 12)).toBe('1.50E-03');
    expect(sheet.getText(0, 13)).toBe('7');
  });

  it('keeps quoted delimiters and doubled quotes, empty fields become null', () => {
    sheet.setCsv(0, 0, '1,"4,x",2\r\n3,4,5', '\r\n', ',');
    expect(sheet.getValue(0, 1)).toBe('4,x');
    expect(sheet.getValue(1, 2)).toBe(5);
    sheet.setCsv(2, 0, '1,"a\r\nb",2\r\n3,4,5', '\r\n', ',');
    expect(sheet.getValue(2, 1)).toBe('a\r\nb');
    expect(sheet.getValue(3, 1)).toBe(4);
    sheet.setCsv(5, 0, '1,"a""b"\r\n2,c', '\r\n', ',');
    expect(sheet.getValue(5, 1)).toBe('a"b');
    sheet.setValue(7, 0, 'keep');
    sheet.setCsv(7, 0, '', '\r\n', ',');
    expect(sheet.getValue(7, 0)).toBe('keep');
    sheet.setCsv(9, 1, '7,8\r\n9,10', '\r\n', ',');
    expect([sheet.getValue(9, 1), sheet.getValue(9, 2), sheet.getValue(10, 1), sheet.getValue(10, 2)]).toEqual([7, 8, 9, 10]);
    sheet.setCsv(11, 0, '1;2\r\n3;4', '\r\n', ';');
    expect([sheet.getValue(11, 0), sheet.getValue(11, 1)]).toEqual([1, 2]);
  });
});

describe('Worksheet.getDirtyRows / getInsertRows / getDeletedRows', () => {
  let sheet: Sheet;
  let workbook: Book;
  beforeEach(() => {
    sheet = new Worksheet('Dirty');
    workbook = new Workbook();
    workbook.addSheet(0, sheet);
  });

  it('reports changed rows as { row, item } and shifted inserts/deletes', () => {
    sheet.setValue(1, 1, 'a');
    sheet.setValue(5, 0, 'b');
    expect(sheet.getDirtyRows()).toEqual([{ row: 1, item: null }, { row: 5, item: null }]);
    expect(sheet.getInsertRows()).toEqual([]);
    expect(sheet.getDeletedRows()).toEqual([]);
    workbook.calculate();
    expect(sheet.getDirtyRows()).toEqual([{ row: 1, item: null }, { row: 5, item: null }]);
    sheet.addRows(10, 2);
    expect(sheet.getInsertRows()).toEqual([{ row: 10, item: null }, { row: 11, item: null }]);
    sheet.deleteRows(0, 1);
    expect(sheet.getDirtyRows()).toEqual([{ row: 0, item: null }, { row: 4, item: null }]);
    expect(sheet.getInsertRows()).toEqual([{ row: 9, item: null }, { row: 10, item: null }]);
    expect(sheet.getDeletedRows()).toEqual([{ row: 0, originalItem: null }]);
  });

  it('tracks suspendDirty, clear and clearPendingChanges like the trial', () => {
    sheet.setValue(1, 1, 'a');
    expect(sheet.getDirtyRows()).toEqual([{ row: 1, item: null }]);
    sheet.suspendDirty();
    sheet.setValue(2, 2, 'b');
    sheet.resumeDirty();
    expect(sheet.getDirtyRows()).toEqual([{ row: 1, item: null }]);
    // `clear` over cells that hold content is a value change, so row 2 (written
    // while dirty was suspended) joins the dirty rows here (trial `dirty7`).
    sheet.clear(0, 0, 3, 3, SheetArea.viewport, StorageType.data);
    expect(sheet.getDirtyRows()).toEqual([{ row: 1, item: null }, { row: 2, item: null }]);
    sheet.addRows(0, 2);
    expect(sheet.getDirtyRows()).toEqual([{ row: 3, item: null }, { row: 4, item: null }]);
    expect(sheet.getInsertRows()).toEqual([{ row: 0, item: null }, { row: 1, item: null }]);
    sheet.setValue(9, 9, 'z');
    expect(sheet.getDirtyRows()).toEqual([{ row: 3, item: null }, { row: 4, item: null }, { row: 9, item: null }]);
    sheet.deleteRows(0, 1);
    expect(sheet.getDirtyRows()).toEqual([{ row: 2, item: null }, { row: 3, item: null }, { row: 8, item: null }]);
    expect(sheet.getInsertRows()).toEqual([{ row: 0, item: null }]);
    expect(sheet.getDeletedRows()).toEqual([{ row: 0, originalItem: null }]);
    const style = new Style();
    style.backColor = 'red';
    sheet.setStyle(3, 3, style, SheetArea.viewport);
    expect(sheet.getDirtyRows()).toEqual([{ row: 2, item: null }, { row: 3, item: null }, { row: 8, item: null }]);
    sheet.clearPendingChanges();
    expect(sheet.getDirtyRows()).toEqual([]);
    expect(sheet.getInsertRows()).toEqual([]);
    expect(sheet.getDeletedRows()).toEqual([]);
  });

  it('reports each dirty cell as { row, col, newValue, oldValue } like the trial', () => {
    sheet.setValue(1, 1, 'a');
    expect(sheet.getDirtyCells()).toEqual([{ row: 1, col: 1, newValue: 'a' }]);
    sheet.setValue(1, 1, 'b');
    expect(sheet.getDirtyCells()).toEqual([{ row: 1, col: 1, newValue: 'b', oldValue: 'a' }]);
    sheet.setValue(1, 1, 'c');
    expect(sheet.getDirtyCells()).toEqual([{ row: 1, col: 1, newValue: 'c', oldValue: 'b' }]);
    sheet.clear(1, 1, 1, 1, SheetArea.viewport, StorageType.data);
    expect(sheet.getDirtyCells()).toEqual([{ row: 1, col: 1, newValue: null, oldValue: 'c' }]);
    // The trial's key order is newValue before oldValue.
    expect(JSON.stringify(sheet.getDirtyCells())).toBe('[{"row":1,"col":1,"newValue":null,"oldValue":"c"}]');
  });

  it('drops the pending changes when a resize changes the count, like the trial', () => {
    sheet.setValue(1, 1, 'a');
    sheet.addRows(0, 2);
    sheet.deleteRows(5, 1);
    expect(sheet.getDirtyRows().length).toBe(1);
    expect(sheet.getInsertRows().length).toBe(2);
    expect(sheet.getDeletedRows().length).toBe(1);
    // A resize whose count changes rebuilds the row collection: the trial keeps
    // no dirty/insert/delete records afterwards, whatever the axis or area.
    sheet.setRowCount(1_000_000);
    expect([sheet.getDirtyRows(), sheet.getInsertRows(), sheet.getDeletedRows()]).toEqual([[], [], []]);
    sheet.setValue(1, 1, 'b');
    expect(sheet.getDirtyRows().length).toBe(1);
    sheet.setRowCount(10);
    expect(sheet.getDirtyRows()).toEqual([]);
    expect(sheet.getDeletedRows()).toEqual([]);
    sheet.setValue(1, 1, 'c');
    sheet.setColumnCount(5);
    expect([sheet.getDirtyRows(), sheet.getInsertRows(), sheet.getDeletedRows()]).toEqual([[], [], []]);
    // The same count writes nothing, so the records survive.
    sheet.setValue(1, 1, 'd');
    sheet.setRowCount(10);
    sheet.setColumnCount(5);
    expect(sheet.getDirtyRows().length).toBe(1);
  });
});

describe('Worksheet.getDataItem / getDataColumnName', () => {
  let sheet: Sheet;
  beforeEach(() => {
    sheet = new Worksheet('Data');
  });

  it('binds the data through the auto-generated columns', () => {
    expect(sheet.getDataItem(0)).toBeNull();
    expect(sheet.getDataColumnName(0)).toBeNull();
    expect(sheet.getDataColumnName(26)).toBeNull();
    sheet.setDataSource([{ a: 1, b: 'x' }, { a: 2, b: 'y' }]);
    expect([sheet.getRowCount(), sheet.getColumnCount()]).toEqual([2, 2]);
    expect(sheet.getDataItem(0)).toEqual({ a: 1, b: 'x' });
    expect(sheet.getDataItem(1)).toEqual({ a: 2, b: 'y' });
    // A row outside the records answers an object of null data columns.
    expect(sheet.getDataItem(9)).toEqual({ a: null, b: null });
    expect([sheet.getDataColumnName(0), sheet.getDataColumnName(1), sheet.getDataColumnName(2)]).toEqual(['a', 'b', null]);
    expect([0, 1].map((row) => [0, 1].map((col) => sheet.getValue(row, col)))).toEqual([[1, 'x'], [2, 'y']]);
    // Editing the grid writes back into the record, like the trial.
    sheet.setValue(0, 0, 42);
    expect(sheet.getDataItem(0)).toEqual({ a: 42, b: 'x' });
    sheet.setDataSource(null);
    expect(sheet.getDataItem(0)).toBeNull();
    expect(sheet.getDataColumnName(0)).toBeNull();
    expect(sheet.getValue(0, 0)).toBeNull();
  });

  it('keeps the sheet size and answers undefined without auto-generated columns', () => {
    sheet.autoGenerateColumns = false;
    sheet.setDataSource([{ a: 1, b: 'x' }, { a: 2, b: 'y' }]);
    expect([sheet.getRowCount(), sheet.getColumnCount()]).toEqual([2, 20]);
    expect([sheet.getDataColumnName(0), sheet.getDataColumnName(1), sheet.getDataColumnName(2)]).toEqual([undefined, undefined, undefined]);
    expect([0, 1, 2].map((row) => [0, 1, 2].map((col) => sheet.getValue(row, col)))).toEqual([
      [null, null, null],
      [null, null, null],
      [null, null, null],
    ]);
    expect(sheet.getDataItem(0)).toEqual({ a: 1, b: 'x' });
    expect(sheet.getDataItem(3)).toEqual({});
    sheet.bindColumn(0, { name: 'a' });
    sheet.bindColumn(1, 'b');
    expect([sheet.getDataColumnName(0), sheet.getDataColumnName(1), sheet.getDataColumnName(2)]).toEqual(['a', 'b', undefined]);
    expect(sheet.getDataItem(0)).toEqual({ a: 1, b: 'x' });
  });
});

describe('Worksheet.getSortState', () => {
  let sheet: Sheet;
  beforeEach(() => {
    sheet = new Worksheet('Sort');
  });

  it('is undefined before the first sort and mirrors the last sortRange call', () => {
    expect(sheet.getSortState()).toBeUndefined();
    sheet.setArray(0, 0, [[3, 'c'], [1, 'a'], [2, 'b']]);
    expect(sheet.sortRange(0, 0, 3, 2, true, [{ sortBy: [{ index: 0, ascending: true }], rowTop: true }])).toBe(true);
    expect(sheet.getSortState()).toEqual({
      row: 0,
      col: 0,
      rowCount: 3,
      colCount: 2,
      byRow: true,
      sortConditions: [{ sortBy: [{ index: 0, ascending: true }], rowTop: true }],
    });
    expect([0, 1, 2].map((row) => [0, 1].map((col) => sheet.getValue(row, col)))).toEqual([[1, 'a'], [2, 'b'], [3, 'c']]);
    expect(sheet.sortRange(0, 0, 3, 2, true, [{ index: 0, ascending: true }])).toBe(true);
    expect(sheet.getSortState()).toEqual({
      row: 0,
      col: 0,
      rowCount: 3,
      colCount: 2,
      byRow: true,
      sortConditions: [{ index: 0, ascending: true }],
    });
  });

  it('keeps the state across reset', () => {
    sheet.setArray(0, 0, [[3], [1]]);
    sheet.sortRange(0, 0, 2, 1, true, [{ index: 0, ascending: false }]);
    sheet.sortRange(0, 0, 2, 1, false, [{ index: 0, ascending: true }]);
    sheet.reset();
    expect(sheet.getSortState()).toEqual({
      row: 0,
      col: 0,
      rowCount: 2,
      colCount: 1,
      byRow: false,
      sortConditions: [{ index: 0, ascending: true }],
    });
  });
});

describe('Worksheet.getId', () => {
  it('answers a stable per-sheet id and keeps the trial internal identifiers', () => {
    const workbook = new Workbook();
    const sheet = workbook.getActiveSheet();
    workbook.addSheet(1, new Worksheet('Other'));
    const other = workbook.getSheet(1)!;
    expect(typeof sheet.getId()).toBe('string');
    expect(sheet.getId().length).toBe(8);
    expect(sheet.getId()).toBe(sheet.getId());
    expect(sheet.getId()).toBe(sheet.__ID__);
    expect(sheet.getId()).not.toBe(other.getId());
    expect(other.getId()).toBe(other.__ID__);
    expect(Number.isInteger(sheet._id)).toBe(true);
    expect(sheet._id).not.toBe(other._id);
    // A detached sheet has an id too (`new Worksheet(...)` carries `__ID__`).
    const alone = new Worksheet('Alone');
    expect(alone.getId()).toBe(alone.__ID__);
    expect(alone.getId().length).toBe(8);
  });
});

describe('Worksheet.isSelected', () => {
  it('follows the workbook selection and keeps the raw value', () => {
    const workbook = new Workbook();
    const sheet = workbook.getActiveSheet();
    expect(sheet.isSelected()).toBe(true);
    expect(sheet.toJSON().isSelected).toBe(true);
    expect(sheet.isSelected(1)).toBe(sheet);
    expect(sheet.isSelected()).toBe(1);
    expect(sheet.toJSON().isSelected).toBe(1);
    expect(sheet.isSelected(false)).toBe(sheet);
    expect(sheet.isSelected()).toBe(false);
    expect(sheet.toJSON().isSelected).toBe(false);
    workbook.addSheet(1, new Worksheet('B'));
    expect(workbook.getSheet(1)!.isSelected()).toBe(false);
    expect(workbook.getSheet(1)!.toJSON().isSelected).toBe(false);
    // A switch rewrites the stored value of every sheet, like the trial.
    sheet.isSelected(1);
    workbook.setActiveSheetIndex(1);
    expect(sheet.isSelected()).toBe(false);
    expect(sheet.toJSON().isSelected).toBe(false);
    expect(workbook.getSheet(1)!.isSelected()).toBe(true);
  });

  it('is never selected outside a workbook', () => {
    const alone = new Worksheet('Alone');
    expect(alone.isSelected()).toBe(false);
    expect(alone.toJSON().isSelected).toBe(false);
    alone.reset();
    expect(alone.isSelected()).toBe(false);
    const workbook = new Workbook();
    const extra = new Worksheet('Extra');
    workbook.addSheet(1, extra);
    workbook.removeSheet(1);
    expect(extra.isSelected()).toBe(false);
    expect(extra.toJSON().isSelected).toBe(false);
  });
});

describe('Worksheet.reset', () => {
  it('returns the sheet to a freshly created state and keeps name and position', () => {
    const workbook = new Workbook();
    const sheet = workbook.getActiveSheet();
    sheet.setValue(1, 1, 'a');
    sheet.setFormula(2, 2, '=1+1');
    sheet.addSpan(3, 3, 2, 2);
    sheet.comments.add(4, 4, 'note');
    sheet.setTag(0, 0, 'tag');
    sheet.setFormatter(3, 3, '0.00%');
    sheet.getRange(5, 5, 1, 1).backColor('#ff0000');
    sheet.rowOutlines.group(6, 2);
    sheet.columnOutlines.group(1, 2);
    sheet.setColumnWidth(1, 99);
    sheet.setRowHeight(1, 55);
    sheet.setRowCount(300);
    sheet.setColumnCount(40);
    sheet.frozenRowCount(2);
    sheet.frozenColumnCount(1);
    sheet.options.rowHeaderVisible = false;
    sheet.options.gridline.showVerticalGridline = false;
    sheet.setValue(1, 1, 'a');
    sheet.reset();
    expect(sheet.name()).toBe('Sheet1');
    expect(workbook.getActiveSheet()).toBe(sheet);
    expect([sheet.getRowCount(), sheet.getColumnCount()]).toEqual([200, 20]);
    expect(sheet.getValue(1, 1)).toBeNull();
    expect(sheet.getFormula(2, 2)).toBeNull();
    expect(sheet.getSpans()).toEqual([]);
    expect(sheet.comments.all()).toEqual([]);
    // The trial answers `undefined` for a cell that never had a tag/formatter/style.
    expect(sheet.getTag(0, 0)).toBeUndefined();
    expect(sheet.getFormatter(3, 3)).toBeUndefined();
    expect(sheet.getRange(5, 5).backColor()).toBeUndefined();
    expect(sheet.rowOutlines.toJSON()).toEqual({ items: [] });
    expect(sheet.columnOutlines.toJSON()).toEqual({ items: [] });
    expect(sheet.getColumnWidth(1)).toBe(62);
    expect(sheet.getRowHeight(1)).toBe(20);
    expect([sheet.frozenRowCount(), sheet.frozenColumnCount()]).toEqual([0, 0]);
    expect(sheet.options.rowHeaderVisible).toBe(true);
    expect(sheet.options.gridline.showVerticalGridline).toBe(true);
    expect(sheet.getSelections()).toEqual([new Range(0, 0, 1, 1)]);
    expect(sheet.getDirtyRows()).toEqual([]);
    expect(sheet.zoom()).toBe(1);
    expect(sheet.selectionPolicy()).toBe(2);
    expect(sheet.getDefaultStyle().backColor).toBeUndefined();
    expect(sheet.isSelected()).toBe(true);
    workbook.addSheet(1, new Worksheet('Second'));
    workbook.getSheet(1)!.reset();
    expect(workbook.getSheet(1)!.isSelected()).toBe(false);
  });

  it('clears comments, hyperlinks, filters and frozen panes like the trial', () => {
    const workbook = new Workbook();
    const sheet = workbook.getActiveSheet();
    sheet.setHyperlink(3, 3, { text: 'x', link: 'http://a' });
    sheet.rowFilter(sheet.rowFilter() ?? null);
    sheet.frozenRowCount(2);
    sheet.reset();
    expect(sheet.getHyperlink(3, 3)).toBeNull();
    expect(sheet.frozenRowCount()).toBe(0);
    expect(sheet.rowFilter()).toBeNull();
  });
});

describe('Worksheet.editorStatus', () => {
  it('follows the trial status values ready/enter/edit', () => {
    const sheet = new Worksheet('Editor');
    expect(sheet.editorStatus()).toBe(EditorStatus.ready);
    expect(sheet.editorStatus()).toBe(0);
    expect(sheet.isEditing()).toBe(false);
    expect(sheet.endEdit()).toBe(true);
    expect(sheet.editorStatus()).toBe(0);
    sheet.startEdit();
    expect(sheet.editorStatus()).toBe(1);
    expect(sheet.isEditing()).toBe(true);
    sheet.setEditorStatus(2);
    expect(sheet.editorStatus()).toBe(2);
    expect(sheet.isEditing()).toBe(true);
    expect(sheet.endEdit(true)).toBe(true);
    expect(sheet.editorStatus()).toBe(0);
    expect(sheet.isEditing()).toBe(false);
    sheet.setValue(1, 1, 'q');
    expect(sheet.editorStatus()).toBe(0);
    expect(Object.entries(GC.Spread.Sheets.EditorStatus).filter(([key]) => Number.isNaN(Number(key)))).toEqual([
      ['ready', 0],
      ['enter', 1],
      ['edit', 2],
    ]);
  });
});

describe('Worksheet.hitTest', () => {
  it('reports the trial header/corner fields on a sheet the workbook does not display', () => {
    const workbook = new Workbook();
    workbook.addSheet(0, new Worksheet('Shown'));
    const hidden = new Worksheet('Hidden');
    workbook.addSheet(1, hidden);
    workbook.setActiveSheetIndex(0);
    for (const sheet of [workbook.getSheet(1)!, hidden]) {
      expect(sheet.hitTest(1, 1)).toEqual({ x: 1, y: 1, rowViewportIndex: -1, colViewportIndex: -1, row: 0, col: 0, hitTestType: SheetArea.corner });
      expect(sheet.hitTest(10, 10)).toEqual({ x: 10, y: 10, rowViewportIndex: -1, colViewportIndex: -1, row: 0, col: 0, hitTestType: SheetArea.corner });
      expect(sheet.hitTest(39, 19)).toEqual({ x: 39, y: 19, rowViewportIndex: -1, colViewportIndex: -1, row: 0, col: 0, hitTestType: SheetArea.corner });
      expect(sheet.hitTest(40, 19)).toMatchObject({ x: 40, y: 19, rowViewportIndex: -1, colViewportIndex: null, row: 0, hitTestType: SheetArea.colHeader });
      expect(sheet.hitTest(300, 15)).toMatchObject({ x: 300, y: 15, rowViewportIndex: -1, colViewportIndex: null, row: 0, hitTestType: SheetArea.colHeader });
      expect(sheet.hitTest(20, 30)).toMatchObject({ x: 20, y: 30, rowViewportIndex: null, colViewportIndex: -1, col: 0, hitTestType: SheetArea.rowHeader });
      expect(sheet.hitTest(41, 31)).toMatchObject({ x: 41, y: 31, rowViewportIndex: null, colViewportIndex: null, hitTestType: SheetArea.viewport });
      // The trial keeps `row`/`col` as own properties even when not filled in.
      expect(Object.keys(sheet.hitTest(0, 0))).toEqual(['x', 'y', 'rowViewportIndex', 'colViewportIndex', 'row', 'col', 'hitTestType']);
    }
  });

  it('hit-tests the displayed sheet through the renderer geometry', () => {
    // jsdom has no 2D canvas backend: stub a context so the workbook builds its
    // renderer (the same trick slicer-ui.test.ts uses).
    (globalThis as Record<string, unknown>).CanvasRenderingContext2D = class {};
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement) {
      return new Proxy({}, {
        get: (_target, key: string) => {
          if (key === 'canvas') return this;
          if (key === 'measureText') return () => ({ width: 8 });
          if (key === 'createLinearGradient') return () => ({ addColorStop: () => undefined });
          if (key === 'createPattern') return () => ({});
          if (key === 'getTransform') return () => ({ a: 1, d: 1 });
          return () => undefined;
        },
        set: () => true,
      }) as unknown as CanvasRenderingContext2D;
    } as unknown as HTMLCanvasElement['getContext'];
    document.body.innerHTML = '<div id="sheet"></div>';
    const element = document.getElementById('sheet')!;
    const workbook = new Workbook(element);
    const view = workbook._renderer()!;
    // jsdom has no layout: give the renderer the 400x300 host the trial probe used.
    for (const [name, size] of [['clientWidth', 400], ['clientHeight', 300]] as const)
      Object.defineProperty(view.root, name, { configurable: true, value: size });
    view.layout();
    const sheet = workbook.getActiveSheet();
    expect([view.width, view.height, view.headerWidth, view.headerHeight]).toEqual([400, 300, 40, 20]);
    expect(sheet.hitTest(1, 1)).toMatchObject({ rowViewportIndex: -1, colViewportIndex: -1, row: 0, col: 0, hitTestType: SheetArea.corner });
    expect(sheet.hitTest(20, 20)).toMatchObject({ rowViewportIndex: null, colViewportIndex: -1, col: 0, hitTestType: SheetArea.rowHeader });
    expect(sheet.hitTest(40, 20)).toMatchObject({ rowViewportIndex: null, colViewportIndex: null, hitTestType: SheetArea.viewport });
    expect(sheet.hitTest(41, 31)).toMatchObject({ rowViewportIndex: 1, colViewportIndex: 1, row: 0, col: 0, hitTestType: SheetArea.viewport });
    expect(sheet.hitTest(100, 100)).toMatchObject({ rowViewportIndex: 1, colViewportIndex: 1, row: 4, col: 0, hitTestType: SheetArea.viewport });
    expect(sheet.hitTest(200, 200)).toMatchObject({ rowViewportIndex: 1, colViewportIndex: 1, row: 9, col: 2, hitTestType: SheetArea.viewport });
    expect(sheet.hitTest(300, 15)).toMatchObject({ rowViewportIndex: -1, colViewportIndex: 1, row: 0, col: 4, hitTestType: SheetArea.colHeader });
    expect(sheet.hitTest(5, 60)).toMatchObject({ rowViewportIndex: 1, colViewportIndex: -1, row: 2, col: 0, hitTestType: SheetArea.rowHeader });
    expect(sheet.hitTest(41, 301)).toMatchObject({ rowViewportIndex: null, colViewportIndex: 1, col: 0, hitTestType: SheetArea.viewport });
    sheet.frozenRowCount(2);
    sheet.frozenColumnCount(1);
    expect(sheet.hitTest(41, 25)).toMatchObject({ rowViewportIndex: 0, colViewportIndex: 0, row: 0, col: 0, hitTestType: SheetArea.viewport });
    expect(sheet.hitTest(103, 31)).toMatchObject({ rowViewportIndex: 0, colViewportIndex: 1, row: 0, col: 1, hitTestType: SheetArea.viewport });
    expect(sheet.hitTest(41, 71)).toMatchObject({ rowViewportIndex: 1, colViewportIndex: 0, row: 2, col: 0, hitTestType: SheetArea.viewport });
    expect(sheet.hitTest(103, 71)).toMatchObject({ rowViewportIndex: 1, colViewportIndex: 1, row: 2, col: 1, hitTestType: SheetArea.viewport });
    expect(sheet.hitTest(20, 31)).toMatchObject({ rowViewportIndex: 0, colViewportIndex: -1, row: 0, col: 0, hitTestType: SheetArea.rowHeader });
    workbook.destroy();
  });
});
