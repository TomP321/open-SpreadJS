import { describe, expect, it, vi } from 'vitest';
import { axisSlots, columnLabel, horizontalTabSlots, selectionBounds, sheetTabLabelWidth, strongerBorder, tabStripGeometry, verticalTabSlots, wrappedLines } from '../src/rendering.js';
import { withAlpha } from '../src/colors.js';
import { AxisLayout } from '../src/structures.js';
import { LineBorder, Range } from '../src/primitives.js';
import { decodeTSV, encodeTSV, seriesValue } from '../src/interaction.js';
import { Workbook } from '../src/model.js';
import { Events } from '../src/events.js';

describe('colours', () => {
  it('applies replacement alpha for focus-cell style overlays', () => {
    expect(withAlpha('#00b050', 0.225)).toBe('rgba(0,176,80,0.225)');
    expect(withAlpha('rgb(255,0,0)', 0.5)).toBe('rgba(255,0,0,0.5)');
    expect(withAlpha('rgba(255,0,0,0.5)', 0.5)).toBe('rgba(255,0,0,0.25)');
    expect(withAlpha('red', 1)).toBe('rgba(255,0,0,1)');
    expect(withAlpha('not-a-color', 0.5)).toBe('not-a-color');
    expect(withAlpha('#00b050', 2)).toBe('rgba(0,176,80,1)');
  });
});

describe('viewport layout', () => {
  it('expands displayed selections across intersecting merged cells without changing the stored range', () => {
    const selection = new Range(0, 0, 1, 1);
    const merged = new Range(0, 0, 1, 3);
    expect(selectionBounds(selection, [merged])).toEqual(merged);
    expect(selection.colCount).toBe(1);
    expect(selectionBounds(new Range(1, 0, 1, 1), [merged])).toEqual(new Range(1, 0, 1, 1));
    expect(selectionBounds(new Range(0, 1, 2, 1), [merged, new Range(1, 0, 2, 1)]))
      .toEqual(new Range(0, 0, 3, 3));
  });
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

describe('tab strip layout', () => {
  it('places the strip and shrinks the viewport for every tabStripPosition', () => {
    const bottom = tabStripGeometry(800, 400, {});
    expect(bottom).toMatchObject({ position: 0, vertical: false, viewportX: 0, viewportY: 0, viewWidth: 800, viewHeight: 372, stripX: 0, stripY: 372, stripWidth: 400, stripHeight: 28, stripLength: 400, hscrollX: 400, hscrollLength: 400, splitter: true });
    const top = tabStripGeometry(800, 400, { tabStripPosition: 1 });
    expect(top).toMatchObject({ position: 1, vertical: false, viewportX: 0, viewportY: 28, viewWidth: 800, viewHeight: 344, stripX: 0, stripY: 0, stripWidth: 800, stripLength: 800, hscrollX: 0, hscrollLength: 800, splitter: false });
    const left = tabStripGeometry(800, 400, { tabStripPosition: 2 });
    expect(left).toMatchObject({ position: 2, vertical: true, viewportX: 80, viewportY: 0, viewWidth: 720, viewHeight: 372, stripX: 0, stripWidth: 80, stripHeight: 400, stripLength: 400, hscrollX: 80, hscrollLength: 720, splitter: false });
    const right = tabStripGeometry(800, 400, { tabStripPosition: 3, tabStripWidth: 120 });
    expect(right).toMatchObject({ position: 3, vertical: true, viewportX: 0, viewWidth: 680, stripX: 680, stripWidth: 120, stripLength: 400 });
    expect(right.stripX + right.stripWidth).toBe(800);
  });
  it('gives TableSheet/GanttSheet tabs the trial 18px band (probe .probe/t54/probe-t54-strip54.json)', () => {
    // Trial geometry (host 800x500): main canvas 782x482 (18px right strip reserved, 18px bottom
    // band), the band canvas spans half of it (391x18) and the hscroll the other half.
    const band = tabStripGeometry(800, 500, { showVerticalScrollbar: true }, true);
    expect(band).toMatchObject({ viewWidth: 782, viewHeight: 482, stripX: 0, stripY: 482,
      stripWidth: 391, stripHeight: 18, stripLength: 391, hscrollX: 391, hscrollLength: 391 });
    // The 900x600 probe host: 882x582 canvas with a 441x18 band canvas (trial DOM dump).
    const wide = tabStripGeometry(900, 600, { showVerticalScrollbar: true }, true);
    expect(wide).toMatchObject({ viewWidth: 882, viewHeight: 582, stripWidth: 441, stripHeight: 18 });
    // A plain worksheet keeps the classic 28px strip / 22px scrollbar reservation.
    const plain = tabStripGeometry(800, 500, { showVerticalScrollbar: true });
    expect(plain).toMatchObject({ viewWidth: 778, viewHeight: 472, stripHeight: 28 });
  });
  it('keeps a zero strip and no splitter when hidden, and reserves the scrollbar rows', () => {
    expect(tabStripGeometry(800, 400, { tabStripVisible: false })).toMatchObject({ stripWidth: 0, stripHeight: 0, splitter: false, hscrollX: 0 });
    expect(tabStripGeometry(800, 400, {}).viewHeight).toBe(400 - 28);
    expect(tabStripGeometry(800, 400, { showHorizontalScrollbar: true, tabStripVisible: false }).viewHeight).toBe(400 - 22);
    expect(tabStripGeometry(800, 400, { showVerticalScrollbar: true }).viewWidth).toBe(800 - 22);
  });
  it('paces horizontal tabs one pixel apart and stops at the visible limit', () => {
    const { slots, end } = horizontalTabSlots(46, [60, 40, 50], 1000);
    expect(slots).toEqual([{ index: 0, x: 47, width: 60 }, { index: 1, x: 108, width: 40 }, { index: 2, x: 149, width: 50 }]);
    expect(end).toBe(199);
    expect(horizontalTabSlots(46, [60, 40], 100).slots.map(s => s.index)).toEqual([0]);
  });
  it('sizes sheet tabs as the trial measures them (TASK 56 probe .probe/t56/tab-data.mjs, tab-pairs.mjs)', () => {
    // Trial tab rectangles read through the public `Spread.hitTest` after renaming the sheet to each
    // name (tab hit span). 'Sheet 11' (71) is the one case the trial does not build additively and
    // is deliberately left out; docs/STATUS.md records it.
    const trial: [string, number][] = [
      ['S', 31], ['Sh', 39], ['She', 45], ['Shee', 51], ['Sheet', 55],
      ['Sheet1', 62], ['Sheet5', 62], ['Sheet9', 62], ['Sheet10', 68], ['Sheet12', 68],
      ['Sheet 1', 65], ['Sheet 9', 65], ['Sheet 10', 72], ['Sheet 12', 72],
      ['O', 34], ['Ove', 47], ['Over', 53], ['Overv', 60], ['Overvi', 63], ['Overvie', 69], ['Overview', 79],
      ['V', 34], ['Va', 39], ['Val', 43], ['Valu', 50], ['Value', 56], ['Values', 61],
      ['D', 34], ['De', 40], ['Det', 44], ['Deta', 51], ['Detai', 54], ['Detail', 58], ['Details', 63],
      ['M', 37], ['Mo', 43], ['Mod', 51], ['Model', 60],
      ['Tot', 43], ['Met', 47], ['War', 49], ['aaaa', 51], ['00000', 57], ['iiii', 39], ['MMMM', 74],
    ];
    for (const [name, width] of trial) expect.soft(sheetTabLabelWidth(name), `tab width for '${name}'`).toBe(width);
  });
  it('stacks vertical tabs on a 22px pitch and reserves the arrow band', () => {
    const slots = verticalTabSlots(400);
    expect(slots.slice(0, 3)).toEqual([{ index: 0, y: 29 }, { index: 1, y: 51 }, { index: 2, y: 73 }]);
    expect(verticalTabSlots(400).length).toBe(15);
    expect(verticalTabSlots(79)).toEqual([]);
    expect(verticalTabSlots(80)).toEqual([{ index: 0, y: 29 }]);
  });
});
