import { describe, expect, it } from 'vitest';
import GC, { Spread } from '../src/index.js';

const { Workbook, Worksheet, SheetArea, ValueType } = Spread.Sheets;
describe('M0 model', () => {
  it('exposes the same namespace through named and default imports', () => {
    expect(GC.Spread).toBe(Spread);
    expect(Spread.Sheets.productInfo).toEqual({ name: 'OpenSheets', version: '0.1.0' });
    Spread.Sheets.LicenseKey = 'test';
    expect(GC.Spread.Sheets.LicenseKey).toBe('test');
    Spread.Sheets.LicenseKey = '';
  });
  it('creates independent default sheets and supports a configurable count', () => {
    const first = new Workbook();
    const second = new Workbook(undefined, { sheetCount: 2 });
    expect(first.sheets).toHaveLength(1);
    expect(second.sheets.map((s) => s.name())).toEqual(['Sheet1', 'Sheet2']);
    expect(first.getActiveSheet()).toBe(first.getSheet(0));
    expect(first.getSheet(12)).toBeUndefined();
    first.getActiveSheet().setValue(0, 0, 42);
    expect(second.getActiveSheet().getValue(0, 0)).toBeNull();
    expect(new Workbook(undefined, { sheetCount: 0 }).getActiveSheet()).toBeUndefined();
    expect(() => new Workbook(undefined, { sheetCount: -1 })).toThrow(RangeError);
    expect(() => new Workbook(undefined, { sheetCount: 0.5 })).toThrow(RangeError);
  });
  it('gets and sets worksheet names', () => {
    const sheet = new Worksheet('Initial');
    expect(sheet.name()).toBe('Initial');
    expect(sheet.name('Renamed')).toBe(sheet);
    expect(sheet.name()).toBe('Renamed');
  });
  it('stores arbitrary values sparsely and isolates areas', () => {
    const sheet = new Worksheet('Sparse');
    const object = { value: 'reference' };
    for (const value of [0, false, '', 123, 'text', object]) {
      sheet.setValue(999_999, 16_383, value);
      expect(sheet.getValue(999_999, 16_383)).toBe(value);
    }
    expect(sheet.getValue(0, 0)).toBeNull();
    sheet.setValue(0, 0, 'header', SheetArea.colHeader);
    expect(sheet.getValue(0, 0, SheetArea.colHeader)).toBe('header');
    expect(sheet.getValue(0, 0)).toBeNull();
    sheet.setValue(999_999, 16_383, null);
    expect(sheet.getValue(999_999, 16_383)).toBeNull();
    sheet.setValue(0, 0, undefined, SheetArea.colHeader);
    expect(sheet.getValue(0, 0, SheetArea.colHeader)).toBeNull();
  });
  it('rejects invalid coordinates and unsupported value formats', () => {
    const sheet = new Worksheet('Errors');
    for (const value of [-1, 0.2, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => sheet.setValue(value, 0, 'bad')).toThrow(RangeError);
      expect(() => sheet.getValue(0, value)).toThrow(RangeError);
    }
    expect(() => sheet.getValue(0, 0, SheetArea.viewport, ValueType.richText)).toThrow('NotImplemented');
  });
  it('destroys idempotently and rejects subsequent reads', () => {
    const workbook = new Workbook();
    workbook.destroy();
    workbook.destroy();
    expect(workbook.sheets).toEqual([]);
    expect(() => workbook.getActiveSheet()).toThrow('destroyed');
  });
  it('renderer-dependent members fail explicitly', () => {
    const sheet = new Worksheet('Unsupported');
    expect(() => sheet.autoFitRow(0)).toThrow('NotImplemented');
    expect(() => sheet.autoFitColumn(0)).toThrow('NotImplemented');
    expect(new GC.Spread.Sheets.Style()).toBeInstanceOf(GC.Spread.Sheets.Style);
    expect(new Workbook(undefined, { allowUndo: true }).options.allowUndo).toBe(true);
  });
});
