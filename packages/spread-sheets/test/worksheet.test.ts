import { describe, expect, it, vi } from 'vitest';
import GC from '../src/index.js';
import { type ICalcEngine } from '../src/calc.js';
import defaults from '../src/worksheet-defaults.json';
const { Worksheet, Workbook, Style, SheetArea, StorageType, CopyToOptions, Events } = GC.Spread.Sheets;
describe('Worksheet', () => {
  for (const key of Object.keys(defaults))
    it(`initializes independent options.${key}`, () => {
      const a = new Worksheet('a'),
        b = new Worksheet('b');
      expect(a.options[key]).toEqual(defaults[key as keyof typeof defaults]);
      if (a.options[key] && typeof a.options[key] === 'object')
        expect(a.options[key]).not.toBe(b.options[key]);
    });
  it('stores arrays, text, formulas and tags in separate areas', () => {
    const s = new Worksheet('Data');
    s.setArray(0, 0, [
      [1, 'two'],
      [false, null],
    ]);
    expect(s.getArray(0, 0, 2, 2)).toEqual([
      [1, 'two'],
      [false, null],
    ]);
    s.setFormatter(2, 0, '0.00%');
    s.setText(2, 0, '12.5%');
    expect(s.getValue(2, 0)).toBe(0.125);
    expect(s.getText(2, 0)).toBe('12.50%');
    s.setText(2, 1, 'hello');
    expect(s.getValue(2, 1)).toBe('hello');
    s.setArray(3, 0, [['=A1+1', null]], true);
    expect(s.getFormula(3, 0)).toBe('A1+1');
    expect(s.getArray(3, 0, 1, 2, true)).toEqual([['A1+1', null]]);
    expect(s.getValue(3, 0)).toBeNull();
    s.options.showFormulas = true;
    expect(s.getText(3, 0)).toBe('=A1+1');
    s.setValue(3, 0, 9);
    expect(s.getFormula(3, 0)).toBe('A1+1');
    s.setFormula(3, 0, '=2');
    s.setFormula(3, 0, null);
    expect(s.getFormula(3, 0)).toBeNull();
    s.setValue(0, 0, 'Header', SheetArea.colHeader);
    expect(s.getValue(0, 0)).toBe(1);
    expect(s.getText(0, 0, SheetArea.colHeader)).toBe('Header');
    s.setTag(0, 0, { id: 1 });
    expect(s.getCell(0, 0).tag()).toEqual({ id: 1 });
    s.setTag(0, 0, undefined);
    expect(s.getTag(0, 0)).toBeUndefined();
    expect(s.tag('sheet')).toBe(s);
    expect(s.tag()).toBe('sheet');
    expect(s.getDataSource()).toBeNull();
    s.options.showZeros = false;
    s.setValue(4, 0, 0);
    expect(s.getText(4, 0)).toBe('');
    s.setValue(4, 1, { richText: [{ text: 'a' }, { text: 'b' }] });
    expect(s.getText(4, 1)).toBe('ab');
  });
  it('resolves cell > row > column > default, with named parent chains and cycles', () => {
    const wb = new Workbook(),
      s = wb.getSheet(0);
    const base = Object.assign(new Style(), { name: 'Base', foreColor: 'navy', font: '12px Arial' });
    wb.addNamedStyle(base);
    expect(wb.getNamedStyle('BASE')).toBe(base);
    expect(wb.getNamedStyles()).toEqual([base]);
    const local = Object.assign(new Style(), { name: 'Local', parentName: 'Base', formatter: '0.00' });
    s.addNamedStyle(local);
    expect(s.getNamedStyles()).toEqual([local]);
    expect(s.getNamedStyle('LOCAL')).toBe(local);
    s.setDefaultStyle(Object.assign(new Style(), { backColor: 'white', wordWrap: true }));
    s.setStyle(-1, 2, Object.assign(new Style(), { backColor: 'blue', locked: false }));
    s.setStyle(1, -1, Object.assign(new Style(), { backColor: 'green' }));
    s.setStyleName(1, 2, 'Local');
    expect(s.getStyleName(1, 2)).toBe('Local');
    expect(s.getActualStyle(1, 2)).toMatchObject({
      backColor: 'green',
      wordWrap: true,
      locked: false,
      foreColor: 'navy',
      font: '12px Arial',
      formatter: '0.00',
    });
    s.getCell(1, 2).backColor('red');
    expect(s.getActualStyle(1, 2).backColor).toBe('red');
    expect(s.getActualStyle(2, 2).backColor).toBe('blue');
    expect(s.getActualStyle(2, 1).backColor).toBe('white');
    expect(s.getDefaultStyle().backColor).toBe('white');
    s.setStyle(1, 2, null);
    expect(s.getStyle(1, 2)).toBeNull();
    expect(s.getStyleName(1, 2)).toBeNull();
    local.parentName = 'Local';
    expect(() => s.getActualStyle(0, 0)).not.toThrow();
    s.removeNamedStyle('Local');
    wb.removeNamedStyle('Base');
    expect(s.getNamedStyle('Local')).toBeUndefined();
    expect(wb.getNamedStyle('Base')).toBeUndefined();
    expect(() => s.addNamedStyle(new Style())).toThrow('name');
    expect(() => wb.addNamedStyle(new Style())).toThrow('name');
  });
  it('supports area-specific counts, dimensions, defaults and hidden sizes', () => {
    const s = new Worksheet('Sizes');
    expect(s.rowCount()).toBe(200);
    expect(s.columnCount()).toBe(20);
    expect(s.rowCount(1_000_000)).toBe(s);
    expect(s.columnCount(16384)).toBe(s);
    s.setRowCount(2, SheetArea.colHeader);
    s.setColumnCount(3, SheetArea.rowHeader);
    expect(s.getRowCount(SheetArea.colHeader)).toBe(2);
    expect(s.getColumnCount(SheetArea.rowHeader)).toBe(3);
    expect(s.getRowCount(SheetArea.rowHeader)).toBe(1_000_000);
    expect(s.getColumnCount(SheetArea.colHeader)).toBe(16384);
    expect(s.getRowHeight(0)).toBe(20);
    expect(s.getColumnWidth(0)).toBe(62);
    expect(s.getColumnWidth(0, SheetArea.rowHeader)).toBe(40);
    s.setRowHeight(1, 31);
    s.setColumnWidth(2, 81);
    s.setRowHeight(0, 25, SheetArea.colHeader);
    s.setColumnWidth(0, 50, SheetArea.rowHeader);
    expect(s.getRowHeight(1)).toBe(31);
    expect(s.getColumnWidth(2)).toBe(81);
    expect(s.getRowHeight(0, SheetArea.colHeader)).toBe(25);
    expect(s.getColumnWidth(0, SheetArea.rowHeader)).toBe(50);
    s.setRowVisible(1, false);
    s.setColumnVisible(2, false);
    expect(s.getRowVisible(1)).toBe(false);
    expect(s.getColumnVisible(2)).toBe(false);
    expect(s.getRowHeight(1)).toBe(0);
    expect(s.getColumnWidth(2)).toBe(0);
    s.setRowVisible(1, true);
    s.setColumnVisible(2, true);
    expect(s.getRowHeight(1)).toBe(31);
    expect(s.getColumnWidth(2)).toBe(81);
    s.defaults.rowHeight = 24;
    s.defaults.colWidth = 70;
    expect(s.getRowHeight(0)).toBe(24);
    expect(s.getColumnWidth(0)).toBe(70);
    expect(s._rowLayout().sum(0, 2)).toBe(55);
    expect(s.getRowHeight(0, SheetArea.viewport, true)).toBeUndefined();
    expect(s.getColumnWidth(0, SheetArea.viewport, true)).toBeUndefined();
    s.setValue(999999, 16383, 'last');
    s.setRowCount(10);
    s.setColumnCount(10);
    expect(s.getValue(999999, 16383)).toBeNull();
    expect(() => s.setRowHeight(0, -1)).toThrow(RangeError);
    expect(() => s.setColumnCount(-1)).toThrow(RangeError);
  });
  it('inserts and deletes sparse values, styles, dimensions, comments, dirty cells and merged spans', () => {
    const s = new Worksheet('Shift');
    s.setValue(255, 2, 'shift');
    s.setStyle(255, -1, Object.assign(new Style(), { backColor: 'red' }));
    s.setStyle(-1, 2, Object.assign(new Style(), { foreColor: 'green' }));
    s.setRowCount(300);
    s.setRowHeight(255, 30);
    s.comments.add(255, 2, 'note');
    s.addSpan(254, 1, 3, 3);
    s.addSpan(260, 6, 2, 2);
    s.setValue(255, 0, 'row header', SheetArea.rowHeader);
    s.addRows(255, 2);
    expect(s.getValue(257, 2)).toBe('shift');
    expect(s.getStyle(257, -1)?.backColor).toBe('red');
    expect(s.getRowHeight(257)).toBe(30);
    expect(s.comments.get(257, 2)?.text()).toBe('note');
    expect(s.getValue(257, 0, SheetArea.rowHeader)).toBe('row header');
    expect(s.getSpan(256, 1)?.rowCount).toBe(5);
    s.addColumns(2, 1);
    expect(s.getValue(257, 3)).toBe('shift');
    expect(s.getStyle(-1, 3)?.foreColor).toBe('green');
    expect(s.getSpan(254, 1)?.colCount).toBe(4);
    s.deleteRows(255, 2);
    s.deleteColumns(2, 1);
    expect(s.getValue(255, 2)).toBe('shift');
    expect(s.comments.get(255, 2)?.rowIndex()).toBe(255);
    expect(s.getSpan(255, 2)?.rowCount).toBe(3);
    s.deleteRows(254, 3);
    expect(s.getValue(255, 2)).toBeNull();
    expect(s.getSpans()).toHaveLength(1);
    s.removeSpan(257, 6);
    expect(s.getSpans()).toHaveLength(0);
    expect(() => s.addRows(9999, 1)).toThrow(RangeError);
    expect(() => s.addSpan(0, 0, -1, 1)).toThrow(RangeError);
  });
  it('stores spans, selections, active cells and pane settings', () => {
    const s = new Worksheet('State');
    s.addSpan(1, 1, 2, 3);
    expect(s.getSpan(2, 3)).toMatchObject({ row: 1, col: 1, rowCount: 2, colCount: 3 });
    expect(s.getSpan(5, 5)).toBeNull();
    expect(() => s.addSpan(2, 2, 2, 2)).toThrow('Overlapping');
    expect(s.getSpans(new GC.Spread.Sheets.Range(0, 0, 1, 1))).toEqual([]);
    s.removeSpan(1, 1);
    expect(s.getSpans()).toEqual([]);
    s.setSelection(2, 3, 4, 5);
    s.addSelection(8, 8, 2, 2);
    expect(s.getSelections()).toHaveLength(2);
    s.clearSelection();
    expect(s.getSelections()).toEqual([]);
    s.setActiveCell(7, 6);
    expect(s.getActiveRowIndex()).toBe(7);
    expect(s.getActiveColumnIndex()).toBe(6);
    expect(s.getSelections()[0]).toMatchObject({ row: 7, col: 6, rowCount: 1, colCount: 1 });
    s.frozenRowCount(2);
    s.frozenColumnCount(3);
    s.frozenTrailingRowCount(1, true);
    s.frozenTrailingColumnCount(2, true);
    expect([
      s.frozenRowCount(),
      s.frozenColumnCount(),
      s.frozenTrailingRowCount(),
      s.frozenTrailingColumnCount(),
    ]).toEqual([2, 3, 1, 2]);
    expect(s.showRowOutline(false)).toBe(s);
    expect(s.showRowOutline()).toBe(false);
    expect(s.showColumnOutline(false)).toBe(s);
    expect(s.showColumnOutline()).toBe(false);
    expect(s.visible(false)).toBe(s);
    expect(s.visible()).toBe(0);
    s.visible(true);
    expect(s.visible()).toBe(1);
    expect(s.tabColor('red')).toBe(s);
    expect(s.tabColor()).toBe('red');
    expect(s.zoom(2)).toBe(s);
    expect(s.zoom()).toBe(2);
    expect(() => s.zoom(0)).toThrow(RangeError);
  });
  it('clears selected storage without affecting other cell fields', () => {
    const s = new Worksheet('Clear');
    s.setValue(1, 1, 3);
    s.setTag(1, 1, 'tag');
    s.getCell(1, 1).backColor('red');
    s.comments.add(1, 1, 'note');
    const events = vi.fn();
    s.bind(Events.RangeChanged, events);
    s.clear(1, 1, 1, 1, SheetArea.viewport, StorageType.data);
    expect(s.getValue(1, 1)).toBeNull();
    expect(s.getTag(1, 1)).toBe('tag');
    expect(s.getStyle(1, 1)?.backColor).toBe('red');
    s.clear(1, 1, 1, 1, SheetArea.viewport, StorageType.style | StorageType.tag | StorageType.comment);
    expect(s.getStyle(1, 1)).toBeNull();
    expect(s.getTag(1, 1)).toBeUndefined();
    expect(s.comments.get(1, 1)).toBeNull();
    expect(events).toHaveBeenCalledTimes(2);
    expect(events.mock.calls[0][1]).toMatchObject({
      row: 1,
      col: 1,
      rowCount: 1,
      colCount: 1,
      action: 2,
      changedCells: [{ row: 1, col: 1, sheetArea: 3 }],
    });
  });
  it('copies and moves overlapping sparse ranges with storage flags', () => {
    const s = new Worksheet('Copy');
    s.setArray(0, 0, [[1, 2, 3]]);
    s.getCell(0, 0).backColor('red');
    s.setTag(0, 0, 'tag');
    s.comments.add(0, 0, 'note');
    s.copyTo(0, 0, 1, 0, 1, 3, CopyToOptions.all);
    expect(s.getArray(1, 0, 1, 3)).toEqual([[1, 2, 3]]);
    expect(s.getStyle(1, 0)?.backColor).toBe('red');
    expect(s.getTag(1, 0)).toBe('tag');
    expect(s.comments.get(1, 0)?.text()).toBe('note');
    s.moveTo(0, 0, 0, 1, 1, 3, CopyToOptions.value);
    expect(s.getArray(0, 0, 1, 4)).toEqual([[null, 1, 2, 3]]);
    expect(s.getStyle(0, 0)?.backColor).toBe('red');
    s.addSpan(3, 0, 2, 2);
    s.copyTo(3, 0, 7, 0, 2, 2, CopyToOptions.span);
    expect(s.getSpan(8, 1)).toMatchObject({ row: 7, col: 0, rowCount: 2, colCount: 2 });
  });
  it('tracks original dirty values, limits ranges, clears and suspends tracking', () => {
    const s = new Worksheet('Dirty');
    s.setValue(1, 1, 1);
    s.setValue(1, 1, 2);
    s.setValue(8, 8, 3);
    expect(s.isDirty()).toBe(true);
    expect(s.hasPendingChanges()).toBe(true);
    expect(s.getDirtyCells(0, 0, 3, 3)).toEqual([{ row: 1, col: 1, oldValue: undefined, newValue: 2 }]);
    s.clearPendingChanges({ row: 0, col: 0, rowCount: 3, colCount: 3 });
    expect(s.getDirtyCells()).toHaveLength(1);
    s.clearPendingChanges();
    expect(s.isDirty()).toBe(false);
    s.suspendDirty();
    s.setValue(0, 0, 7);
    expect(s.isDirtySuspended()).toBe(true);
    expect(s.isDirty()).toBe(false);
    s.resumeDirty();
    expect(s.isDirtySuspended()).toBe(false);
    s.setValue(0, 0, 8);
    expect(s.getDirtyCells()).toEqual([{ row: 0, col: 0, oldValue: 7, newValue: 8 }]);
  });
  it('queues calculator notifications through nested workbook and sheet suspension', () => {
    const wb = new Workbook(),
      s = wb.getSheet(0);
    const engine: ICalcEngine = { formulaChanged: vi.fn(), valueChanged: vi.fn(), recalculate: vi.fn() };
    s._setCalcEngine(engine);
    wb.suspendCalcService();
    wb.suspendCalcService();
    s.suspendCalcService();
    s.setFormula(0, 0, '=A2');
    s.setFormula(0, 0, '=A3');
    s.setValue(1, 0, 42);
    wb.resumeCalcService();
    wb.resumeCalcService();
    expect(engine.recalculate).not.toHaveBeenCalled();
    s.resumeCalcService();
    expect(engine.formulaChanged).toHaveBeenCalledExactlyOnceWith(s, 0, 0, 'A3');
    expect(engine.valueChanged).toHaveBeenCalledExactlyOnceWith(s, 1, 0, 42);
    expect(engine.recalculate).toHaveBeenCalledExactlyOnceWith(s, false);
    const handler = vi.fn();
    s.bind(Events.ValueChanged, handler);
    s._setCalculatedValue(0, 0, 42);
    expect(s.getValue(0, 0)).toBe(42);
    expect(s.getFormula(0, 0)).toBe('A3');
    expect(handler.mock.calls[0][1]).toMatchObject({ row: 0, col: 0, oldValue: null, newValue: 42 });
    s.resumeCalcService(true);
    expect(engine.recalculate).toHaveBeenLastCalledWith(s, true);
  });
  it('emits public cell and dimension event argument shapes', () => {
    const s = new Worksheet('Events'),
      fn = vi.fn();
    s.bind('CellChanged', fn);
    s.setValue(2, 3, 9);
    expect(fn.mock.calls[0][0].type).toBe('CellChanged');
    expect(fn.mock.calls[0][1]).toEqual({
      sheet: s,
      sheetName: 'Events',
      row: 2,
      col: 3,
      sheetArea: 3,
      propertyName: 'value',
      oldValue: null,
      newValue: 9,
      isUndo: false,
    });
    const row = vi.fn();
    s.bind('RowChanged', row);
    s.setRowHeight(4, 30);
    expect(row.mock.calls[0][1]).toEqual({
      sheet: s,
      sheetName: 'Events',
      row: 4,
      sheetArea: 3,
      propertyName: 'height',
      oldValue: null,
      newValue: 30,
      isUndo: false,
    });
  });
});
it('copies whole columns sparsely, adjusts copied formulas, tracks changes and stores validator placeholders', () => {
  const s = new Worksheet('Copy');
  s.setRowCount(1_000_000);
  s.setStyle(-1, 1, Object.assign(new Style(), { backColor: 'red' }));
  s.setValue(999999, 1, 7);
  s.setFormula(0, 1, 'A1+$B$2');
  s.clearPendingChanges();
  s.copyTo(-1, 1, -1, 3, -1, 1, CopyToOptions.all);
  expect(s.getValue(999999, 3)).toBe(7);
  expect(s.getStyle(-1, 3)?.backColor).toBe('red');
  expect(s.getFormula(0, 3)).toBe('C1+$B$2');
  expect(s.getDirtyCells()).toContainEqual({ row: 999999, col: 3, oldValue: undefined, newValue: 7 });
  const validator = { type: 'placeholder' };
  s.getRange(1, 1, 2, 2).validator(validator);
  expect(s.getCell(2, 2).validator()).toBe(validator);
  s.setDataValidator(3, 3, 2, 2, validator);
  expect(s.getDataValidator(4, 4)).toBe(validator);
  s.setRowHeight(999999, 30);
  s.setRowVisible(10, false);
  s.clear(-1, -1, -1, -1, SheetArea.viewport, StorageType.axis);
  expect(s.getRowHeight(999999)).toBe(20);
  expect(s.getRowVisible(10)).toBe(true);
  expect([...s._rowLayout().entries()]).toEqual([]);
});
it('clears destination formulas on value copies and invalidates replaced formula results', () => {
  const s = new Worksheet('Replace');
  s.setValue(0, 0, 5);
  s.setFormula(0, 1, '2');
  s.copyTo(0, 0, 0, 1, 1, 1, CopyToOptions.value);
  expect(s.getFormula(0, 1)).toBeNull();
  expect(s.getValue(0, 1)).toBe(5);
  s.setFormula(1, 0, '3');
  s.setValue(1, 1, 9);
  s.clearPendingChanges();
  s.copyTo(1, 0, 1, 1, 1, 1, CopyToOptions.formula);
  expect(s.getFormula(1, 1)).toBe('3');
  expect(s.getValue(1, 1)).toBeNull();
  expect(s.isDirty()).toBe(true);
});
