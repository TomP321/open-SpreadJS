import { describe, expect, it, vi } from 'vitest';
import GC from '../src/index.js';
import defaults from '../src/workbook-defaults.json';
const { Workbook, Worksheet, Events } = GC.Spread.Sheets;
describe('Workbook', () => {
  for (const key of Object.keys(defaults))
    it(`initializes live options.${key}`, () => {
      const first = new Workbook(),
        second = new Workbook();
      expect(first.options[key]).toEqual(defaults[key as keyof typeof defaults]);
      if (first.options[key] && typeof first.options[key] === 'object')
        expect(first.options[key]).not.toBe(second.options[key]);
    });
  it('manages sheets, names, active and starting tabs', () => {
    const wb = new Workbook(undefined, { sheetCount: 2, allowUndo: false });
    const initial = wb.getSheet(0);
    expect(wb.options.allowUndo).toBe(false);
    wb.options.allowUndo = true;
    expect(wb.options.allowUndo).toBe(true);
    const sheet = new Worksheet('Inserted');
    wb.addSheet(0, sheet);
    expect(wb.getSheetCount()).toBe(3);
    expect(wb.getActiveSheet()).toBe(initial);
    expect(sheet.getParent()).toBe(wb);
    expect(wb.getSheetFromName('inserted')).toBe(sheet);
    expect(wb.getSheetIndex('Inserted')).toBe(0);
    expect(wb.getSheetIndex('absent')).toBe(-1);
    wb.setActiveSheet('Inserted');
    expect(wb.getActiveSheetIndex()).toBe(0);
    expect(wb.activeSheetIndex(2)).toBe(wb);
    expect(wb.activeSheetIndex()).toBe(2);
    expect(wb.startSheetIndex(1)).toBe(wb);
    expect(wb.startSheetIndex()).toBe(1);
    expect(wb.startSheetIndex(99)).toBe(wb);
    expect(wb.startSheetIndex()).toBe(0);
    expect(wb.startSheetIndex(-1)).toBe(wb);
    expect(wb.startSheetIndex()).toBe(0);
    expect(wb.changeSheetIndex('Inserted', 2)).toBe(true);
    expect(wb.changeSheetIndex('absent', 0)).toBe(false);
    wb.removeSheet(0);
    expect(wb.getSheetCount()).toBe(2);
    wb.setSheetCount(4);
    expect(wb.getSheetCount()).toBe(4);
    wb.setSheetCount(1);
    expect(wb.getSheetCount()).toBe(1);
    wb.clearSheets();
    expect(wb.getActiveSheet()).toBeUndefined();
    expect(() => wb.addSheet(-1)).toThrow(RangeError);
    expect(() => wb.setSheetCount(-1)).toThrow(RangeError);
    expect(() => new Workbook(undefined, { sheetCount: 0.5 })).toThrow(RangeError);
  });
  it('activates by Worksheet object or index and keeps Sheet<N> naming on a growing counter', () => {
    const wb = new Workbook(undefined, { sheetCount: 1 });
    expect(wb.getSheet(0).name()).toBe('Sheet1');
    wb.setActiveSheet(0);
    expect(wb.getActiveSheetIndex()).toBe(0);
    wb.setSheetCount(2);
    wb.setActiveSheet(wb.getSheet(1));
    expect(wb.getActiveSheetIndex()).toBe(1);
    wb.setActiveSheetIndex(0);
    wb.setActiveSheet(wb.getSheet(1));
    expect(wb.getActiveSheetIndex()).toBe(1);
    // Auto names keep counting past existing and removed sheets, like the trial's Sheet6 after five sheets.
    wb.addSheet(wb.getSheetCount());
    expect(wb.getSheet(wb.getSheetCount() - 1).name()).toBe('Sheet3');
    wb.addSheet(0);
    expect(wb.getSheet(0).name()).toBe('Sheet4');
    wb.removeSheet(3);
    wb.removeSheet(3);
    wb.addSheet(wb.getSheetCount());
    expect(wb.getSheet(wb.getSheetCount() - 1).name()).toBe('Sheet5');
  });
  it('supports cancellation and exact active sheet event arguments', () => {
    const wb = new Workbook(undefined, { sheetCount: 2 });
    const info: unknown[] = [];
    wb.bind(Events.ActiveSheetChanged, (e, a) => info.push([e.type, a]));
    const cancel = (_e: unknown, a: Record<string, unknown>) => {
      a.cancel = true;
    };
    wb.bind(`${Events.ActiveSheetChanging}.guard`, cancel);
    wb.setActiveSheetIndex(1);
    expect(wb.getActiveSheetIndex()).toBe(0);
    wb.unbind('.guard');
    wb.setActiveSheetIndex(1);
    expect(info).toEqual([['ActiveSheetChanged', { oldSheet: wb.getSheet(0), newSheet: wb.getSheet(1) }]]);
    wb.bind('SheetChanging.guard', cancel);
    wb.setSheetCount(0);
    expect(wb.getSheetCount()).toBe(2);
  });
  it('binds namespaces, handler data, several types, precise unbind and unbindAll', () => {
    const wb = new Workbook(),
      sheet = wb.getSheet(0);
    const calls: unknown[] = [];
    const fn = vi.fn((e, a) => calls.push([e.type, e.data, a.row, a.col, a.newValue]));
    wb.bind('CellChanged.alpha.beta RowChanged.alpha', { context: 1 }, fn);
    sheet.setValue(2, 3, 8);
    expect(calls).toEqual([['CellChanged', { context: 1 }, 2, 3, 8]]);
    wb.unbind('.beta', fn);
    sheet.setValue(2, 3, 9);
    expect(fn).toHaveBeenCalledTimes(1);
    sheet.setRowHeight(4, 30);
    expect(fn).toHaveBeenCalledTimes(2);
    wb.unbindAll();
    sheet.setRowHeight(4, 31);
    expect(fn).toHaveBeenCalledTimes(2);
  });
  it('suppresses nested events until matching resumes, without replay', () => {
    const wb = new Workbook(),
      s = wb.getSheet(0),
      fn = vi.fn();
    wb.bind('CellChanged', fn);
    s.bind('CellChanged', fn);
    wb.suspendEvent();
    wb.suspendEvent();
    s.setValue(0, 0, 1);
    wb.resumeEvent();
    s.setValue(0, 0, 2);
    expect(fn).not.toHaveBeenCalled();
    wb.resumeEvent();
    s.setValue(0, 0, 3);
    expect(fn).toHaveBeenCalledTimes(2);
    wb.resumeEvent();
    s.suspendEvent();
    s.setValue(0, 0, 4);
    s.resumeEvent();
    s.setValue(0, 0, 5);
    expect(fn).toHaveBeenCalledTimes(4);
    s.unbindAll();
    s.unbind('CellChanged');
  });
  it('batches layout and paint invalidation, including worksheet notifications', () => {
    const wb = new Workbook(),
      s = wb.getSheet(0),
      parent = vi.fn(),
      child = vi.fn();
    wb._onInvalidate(parent);
    s._onInvalidate(child);
    wb.suspendPaint();
    wb.suspendPaint();
    s.setValue(0, 0, 1);
    wb.repaint();
    wb.refresh();
    wb.invalidateLayout();
    s.repaint();
    expect(wb.isPaintSuspended()).toBe(true);
    expect(s.isPaintSuspended()).toBe(true);
    expect(parent).not.toHaveBeenCalled();
    expect(child).not.toHaveBeenCalled();
    wb.resumePaint();
    expect(parent).not.toHaveBeenCalled();
    wb.resumePaint();
    expect(parent).toHaveBeenCalledExactlyOnceWith(true);
    expect(child).toHaveBeenCalledTimes(1);
    expect(wb.isPaintSuspended()).toBe(false);
    s.suspendPaint();
    s.setValue(0, 0, 2);
    expect(s.isPaintSuspended()).toBe(true);
    s.resumePaint();
    expect(child).toHaveBeenCalledTimes(2);
    wb.resumePaint();
  });
  it('provides stable managers and releases handlers and sheets on destroy', () => {
    const wb = new Workbook(),
      s = wb.getSheet(0),
      fn = vi.fn();
    expect(wb.commandManager()).toBe(wb.commandManager());
    expect(wb.undoManager()).toBe(wb.undoManager());
    wb.bind('CellChanged', fn);
    wb.destroy();
    wb.destroy();
    s.setValue(0, 0, 1);
    expect(fn).not.toHaveBeenCalled();
    expect(s.getParent()).toBeUndefined();
    wb.focus();
    wb.refresh();
    wb.repaint();
    expect(() => wb.getSheet(0)).toThrow('destroyed');
  });
});
