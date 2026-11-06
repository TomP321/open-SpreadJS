import { describe, expect, it, vi } from 'vitest';
import { axisSlots, columnLabel, strongerBorder, wrappedLines } from '../src/rendering.js';
import { AxisLayout } from '../src/structures.js';
import { LineBorder } from '../src/primitives.js';
import { decodeTSV, encodeTSV, seriesValue } from '../src/interaction.js';
import { Workbook } from '../src/model.js';
import { Events } from '../src/events.js';

describe('viewport layout', () => {
  it('visits only visible rows of a million-row axis with hidden and frozen items', () => {
    const axis = new AxisLayout(1_000_000, 20);
    axis.setVisible(10001, false);
    const slots = axisSlots(axis, 20, 500, 200000, 1, 2, 1);
    expect(slots.length).toBeLessThan(30);
    expect(slots.slice(0, 2).map(r => r.index)).toEqual([0, 1]);
    expect(slots.at(-1)?.index).toBe(999999);
    expect(slots.some(r => r.index === 10001)).toBe(false);
    expect(slots.find(r => r.index === axis.indexAtOffset(200040))?.min).toBe(60);
  });
  it('handles all-hidden runs without scanning a million indexes', () => {
    const axis = new AxisLayout(1_000_000, 0);
    axis.setSize(999999, 20);
    expect(axisSlots(axis, 0, 100, 0, 1, 0, 0).map(r => r.index)).toEqual([999999]);
  });
  it('scales coordinates and independently clips leading and trailing panes', () => {
    const axis = new AxisLayout(100, 20);
    const slots = axisSlots(axis, 30, 300, 100, 1.5, 1, 1);
    expect(slots[0]).toEqual({ index: 0, position: 30, size: 30, min: 30, max: 60 });
    expect(slots.at(-1)).toEqual({ index: 99, position: 270, size: 30, min: 270, max: 300 });
  });
  it('generates spreadsheet column headers and gives stronger shared borders precedence', () => {
    expect([0, 25, 26, 701, 16383].map(columnLabel)).toEqual(['A', 'Z', 'AA', 'ZZ', 'XFD']);
    const thin = new LineBorder('red', 1), double = new LineBorder('blue', 6);
    expect(strongerBorder(thin, double)).toBe(double);
    expect(strongerBorder(thin, new LineBorder('blue', 1))).toBe(thin);
    expect(wrappedLines('one two\nlongword', 4, text => text.length)).toEqual(['one', 'two', 'long', 'word']);
  });
});
describe('user input and binding', () => {
  it('round-trips quoted tabs, multiline text, empty cells and HTML-sensitive text as TSV', () => {
    const rows = [['a\tb', 'a\nb', '"quoted"', '', '<img>'], ['42', 'true', '', '', '']];
    expect(decodeTSV(encodeTSV(rows))).toEqual(rows);
    expect(decodeTSV('a\tb\r\n')).toEqual([['a', 'b']]);
  });
  it('extends numeric/date series and repeats text', () => {
    expect(seriesValue([2, 5], 4)).toBe(14);
    expect(seriesValue([new Date('2020-01-01Z')], 2)).toEqual(new Date('2020-01-03Z'));
    expect(seriesValue(['a', 'b'], 3)).toBe('b');
  });
  it('emits ValueChanged for editCell including undo and redo, while API writes remain silent', () => {
    const wb = new Workbook(), s = wb.getActiveSheet(), handler = vi.fn();
    s.bind(Events.ValueChanged, handler);
    s.setValue(0, 0, 1); expect(handler).not.toHaveBeenCalled();
    wb.commandManager().execute({ cmd: 'editCell', row: 0, col: 0, newValue: 2 });
    wb.undoManager().undo(); wb.undoManager().redo();
    expect(handler.mock.calls.map(([, args]) => [args.oldValue, args.newValue])).toEqual([[1, 2], [2, 1], [1, 2]]);
  });
  it('supports incremental array binding, explicit fields and writes back to the source', () => {
    const wb = new Workbook(), s = wb.getActiveSheet(), source = [{ title: 'One', amount: 3 }, { title: 'Two', amount: 4 }];
    s.bindColumns([{ name: 'amount', displayName: 'Amount' }, { name: 'title' }]);
    s.setDataSource(source);
    expect(s.getArray(0, 0, 2, 2)).toEqual([[3, 'One'], [4, 'Two']]);
    expect(s.getValue(0, 0, 1)).toBe('Amount');
    s.setValue(0, 0, 8); expect(source[0].amount).toBe(8);
    expect(s.getDataSource()).toBe(source);
  });
});

it('cancels selection and active-cell movement together', () => {
  const wb = new Workbook(), s = wb.getActiveSheet();
  s.bind(Events.SelectionChanging, (_event, info) => { info.cancel = true; });
  s.setActiveCell(4, 5); s.setSelection(6, 7, 2, 2);
  expect([s.getActiveRowIndex(), s.getActiveColumnIndex()]).toEqual([0, 0]);
  expect(s.getSelections()[0]).toMatchObject({ row: 0, col: 0, rowCount: 1, colCount: 1 });
});
it('keeps user resize events separate from API dimension writes and repaints live options', () => {
  const wb = new Workbook(), s = wb.getActiveSheet(), rows = vi.fn(), cols = vi.fn(), paint = vi.fn();
  wb.bind(Events.RowHeightChanged, rows); wb.bind(Events.ColumnWidthChanged, cols); wb._onInvalidate(paint);
  s.setRowHeight(3, 30); s.setColumnWidth(2, 90);
  expect(rows).not.toHaveBeenCalled();
  expect(cols).not.toHaveBeenCalled();
  paint.mockClear(); wb.suspendPaint();
  s.options.gridline.color = 'red'; s.options.rowHeaderVisible = false; wb.options.tabStripVisible = false;
  expect(paint).not.toHaveBeenCalled(); wb.resumePaint(); expect(paint).toHaveBeenCalledTimes(1);
});

it('undo and redo of an edit restore its sheet, active cell and single-cell selection', () => {
  const wb = new Workbook(undefined, { sheetCount: 2 }), s = wb.getActiveSheet();
  s.setValue(2, 2, 'before');
  wb.commandManager().execute({ cmd: 'editCell', sheetName: s.name(), row: 2, col: 2, newValue: 'after' });
  s.setSelection(8, 5, 2, 3); wb.setActiveSheetIndex(1);
  wb.undoManager().undo();
  expect(wb.getActiveSheet()).toBe(s);
  expect(s.getValue(2, 2)).toBe('before');
  expect([s.getActiveRowIndex(), s.getActiveColumnIndex()]).toEqual([2, 2]);
  expect(s.getSelections()).toEqual([{ row: 2, col: 2, rowCount: 1, colCount: 1 }]);
  s.setSelection(9, 7, 2, 2); wb.undoManager().redo();
  expect(s.getValue(2, 2)).toBe('after');
  expect(s.getSelections()).toEqual([{ row: 2, col: 2, rowCount: 1, colCount: 1 }]);
});
