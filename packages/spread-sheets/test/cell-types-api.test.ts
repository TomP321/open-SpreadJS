// @vitest-environment jsdom
/*
 * Item 4 of the core API sweep: `CellTypes.Base.parse`, `CellTypes.CheckBoxList.mode` /
 * `toggleOptions`, the `CellTypes.FileUpload` accessors, `ConditionalFormatting.ScaleValue` and
 * `Comments.Padding`. Every expectation is the official 19.2.5 trial's answer, observed through the
 * public API by the black-box probe (.probe/api-sweep-probe.mjs; probes f40ct-*, f40ct2-*,
 * f40ct3-*, f40ct4-*, f40ct6-registry).
 */
import { describe, expect, it } from 'vitest';
import GC from '../src/index.js';
import { Padding } from '../src/comments.js';
import { ScaleValue } from '../src/features/conditional-formatting.js';
import { Base, Button, CheckBoxList, ComboBox, HyperLink, RadioButtonList, RangeTemplate, cellTypeFromJSON } from '../src/features/cell-types.js';

const CellTypes = GC.Spread.Sheets.CellTypes;
const ConditionalFormatting = GC.Spread.Sheets.ConditionalFormatting;
const Comments = GC.Spread.Sheets.Comments;

describe('CellTypes.Base.parse', () => {
  const base = new CellTypes.Base();

  it('reads numbers back as numbers, with groups, percent, currency and exponents', () => {
    expect(base.parse('123', '')).toBe(123);
    expect(base.parse('123,456.78', '')).toBe(123456.78);
    expect(base.parse('1,234,567', '')).toBe(1234567);
    expect(base.parse('$1,234.56', '')).toBe(1234.56);
    expect(base.parse('$1,234', 'General')).toBe(1234);
    expect(base.parse('12%', '')).toBe(0.12);
    expect(base.parse('5%', '')).toBe(0.05);
    expect(base.parse('10%', '0.0%')).toBe(0.1);
    expect(base.parse('10%', '0%')).toBe(0.1);
    expect(base.parse('1e3', '')).toBe(1000);
    expect(base.parse('-42', '')).toBe(-42);
    expect(base.parse('+7', '')).toBe(7);
    expect(base.parse('.5', '')).toBe(0.5);
    expect(base.parse(' 123 ', '')).toBe(123);
    expect(base.parse('12 ', '')).toBe(12);
    expect(base.parse('0', '')).toBe(0);
    expect(base.parse('1.5', '')).toBe(1.5);
    expect(base.parse('123', '0.00')).toBe(123);
    expect(base.parse('123', '#,##0')).toBe(123);
    expect(base.parse('1,234.56', '#,##0.00')).toBe(1234.56);
  });

  it('leaves text the number rules cannot read as text', () => {
    expect(base.parse('abc', '')).toBe('abc');
    expect(base.parse('1a2', '@')).toBe('1a2');
    expect(base.parse('1,23', '')).toBe('1,23');
    expect(base.parse('1 234', '')).toBe('1 234');
    expect(base.parse('1.234,56', '')).toBe('1.234,56');
    expect(base.parse('12%%', '')).toBe('12%%');
    expect(base.parse('NaN', '')).toBe('NaN');
    expect(base.parse('null', '')).toBe('null');
    expect(base.parse('yes', '')).toBe('yes');
    expect(base.parse('on', '')).toBe('on');
    expect(base.parse('#N/A', '')).toBe('#N/A');
    expect(base.parse('<script>', '')).toBe('<script>');
    expect(base.parse('"quoted"', '')).toBe('"quoted"');
    expect(base.parse('123', '@')).toBe('123');
    expect(base.parse('TRUE', '@')).toBe('TRUE');
  });

  it('reads the logical values as booleans', () => {
    expect(base.parse('true', '')).toBe(true);
    expect(base.parse('TRUE', '')).toBe(true);
    expect(base.parse('true', 'General')).toBe(true);
    expect(base.parse('true', '0.00')).toBe(true);
  });

  it('reads date-shaped text as a local Date and empty text as null', () => {
    expect(base.parse('2024-01-01', '')).toEqual(new Date(2024, 0, 1));
    expect(base.parse('2024-01-01', 'yyyy-mm-dd')).toEqual(new Date(2024, 0, 1));
    expect(base.parse('2024-1-2', '')).toEqual(new Date(2024, 0, 2));
    expect(base.parse('1/2/2024', 'm/d/yyyy')).toEqual(new Date(2024, 0, 2));
    expect(base.parse('2/29/2024', 'm/d/yyyy')).toEqual(new Date(2024, 1, 29));
    expect(base.parse('2024-01-01T12:30:00', '')).toEqual(new Date(2024, 0, 1, 12, 30, 0));
    // Trial value (probe f40ct3-parse2): a bare time lands on the Excel epoch day 1899-12-30.
    expect(base.parse('12:30', '')).toEqual(new Date(1899, 11, 30, 12, 30, 0));
    expect(base.parse('13/13/2024', 'm/d/yyyy')).toBe('13/13/2024');
    expect(base.parse('abc', 'yyyy-mm-dd')).toBe('abc');
    expect(base.parse('', '')).toBeNull();
    expect(base.parse('   ', '')).toBeNull();
  });

  it('reads a number as the Excel serial date under a date format', () => {
    expect(base.parse('123', 'yyyy-mm-dd')).toEqual(new Date(1900, 4, 2));
  });

  it('answers null for text a numeric format cannot read', () => {
    expect(base.parse('abc', '0.00')).toBeNull();
    expect(base.parse('2024-01-01', '0.00')).toBeNull();
    expect(base.parse(' ', '0.00')).toBeNull();
  });

  it('is inherited by the other cell types', () => {
    expect(new CellTypes.CheckBox().parse('123', '')).toBe(123);
    expect(new CellTypes.CheckBox().parse('true', '')).toBe(true);
    expect(new CellTypes.Button().parse('42', '')).toBe(42);
    expect(new CellTypes.Text().parse('123', '')).toBe(123);
    expect(new CellTypes.ComboBox().parse('123', '')).toBe(123);
    expect(new CellTypes.FileUpload().parse('abc', '')).toBe('abc');
    const list = new CellTypes.CheckBoxList();
    list.items(['a', 'b']);
    expect(list.parse('a,b', '')).toBe('a,b');
    expect(list.parse('a', '')).toBe('a');
  });
});

describe('CellTypes.CheckBoxList mode and toggleOptions', () => {
  it('defaults to the checkbox mode with the trial toggle artwork available', () => {
    const list = new CellTypes.CheckBoxList();
    list.items(['a', 'b', 'c']);
    expect(list.mode()).toBe('checkbox');
    expect(list.toggleOptions()).toEqual({
      width: 30, height: 15, trackColorOn: '#4CAF50', trackColorOff: '#bfbfbf',
      sliderColorOn: '#ffffff', sliderColorOff: '#ffffff', sliderMargin: 2, animationDuration: 100, autoSize: false,
    });
    expect(new CellTypes.CheckBox().toggleOptions()).toEqual(list.toggleOptions());
  });

  it('chains the mode setter and ignores a mode the trial does not know', () => {
    const list = new CellTypes.CheckBoxList();
    for (const mode of ['checkbox', 'toggle', 'modern']) {
      expect(list.mode(mode)).toBe(list);
      expect(list.mode()).toBe(mode);
    }
    list.mode('bogus');
    expect(list.mode()).toBe('modern');
  });

  it('merges a partial artwork over the defaults and serialises the merged object', () => {
    const list = new CellTypes.CheckBoxList();
    list.items(['a', 'b']);
    expect(list.toggleOptions({ width: 20, height: 10 })).toBe(list);
    expect(list.toggleOptions()).toMatchObject({ width: 20, height: 10, trackColorOn: '#4CAF50' });
    list.mode('toggle');
    expect(list.toJSON()).toEqual({
      typeName: '12',
      items: [{ text: 'a', value: 'a' }, { text: 'b', value: 'b' }],
      mode: 'toggle',
      toggleOptions: {
        width: 20, height: 10, trackColorOn: '#4CAF50', trackColorOff: '#bfbfbf',
        sliderColorOn: '#ffffff', sliderColorOff: '#ffffff', sliderMargin: 2, animationDuration: 100, autoSize: false,
      },
    });
    expect(JSON.stringify(list.toJSON())).toBe(JSON.stringify({
      typeName: '12',
      items: [{ text: 'a', value: 'a' }, { text: 'b', value: 'b' }],
      mode: 'toggle',
      toggleOptions: {
        width: 20, height: 10, trackColorOn: '#4CAF50', trackColorOff: '#bfbfbf',
        sliderColorOn: '#ffffff', sliderColorOff: '#ffffff', sliderMargin: 2, animationDuration: 100, autoSize: false,
      },
    }));
  });

  it('rejects a null artwork, like the trial', () => {
    const list = new CellTypes.CheckBoxList();
    expect(() => list.toggleOptions(null as unknown as Record<string, unknown>)).toThrow(/null/);
  });

  it('round-trips mode and toggleOptions through the cell type JSON', () => {
    const list = new CellTypes.CheckBoxList();
    list.items(['a', 'b']);
    list.mode('modern');
    list.toggleOptions({ width: 20 });
    const restored = cellTypeFromJSON(list.toJSON()) as CheckBoxList;
    expect(restored.mode()).toBe('modern');
    expect(restored.toggleOptions()).toMatchObject({ width: 20, height: 15 });
    expect(restored.items()).toEqual([{ text: 'a', value: 'a' }, { text: 'b', value: 'b' }]);
  });

  it('does not serialise untouched defaults', () => {
    expect(new CellTypes.CheckBoxList().toJSON()).toEqual({ typeName: '12' });
    expect(new CellTypes.CheckBox().toJSON()).toEqual({ typeName: '5' });
    expect(new CellTypes.RadioButtonList().toJSON()).toEqual({ typeName: '11' });
    expect(new CellTypes.Button().toJSON()).toEqual({ typeName: '6' });
    expect(new CellTypes.ComboBox().toJSON()).toEqual({ typeName: '7' });
    expect(new CellTypes.HyperLink().toJSON()).toEqual({ typeName: '8' });
  });
});

describe('CellTypes.FileUpload', () => {
  it('carries the trial defaults', () => {
    const upload = new CellTypes.FileUpload();
    expect(upload.accept()).toBe('');
    expect([upload.isClearEnabled(), upload.isDownloadEnabled(), upload.isPreviewEnabled()]).toEqual([true, true, true]);
    expect([upload.marginTop(), upload.marginRight(), upload.marginBottom(), upload.marginLeft()]).toEqual([2, 2, 2, 2]);
    expect(upload.maxSize()).toBe(2048);
    expect(upload.valuePath()).toBe('dataUrl');
    expect(upload.previewCommand).toBeUndefined();
  });

  it('chains every accessor and reads the stored value back', () => {
    const upload = new CellTypes.FileUpload();
    const calls: [string, unknown][] = [
      ['accept', 'image/*'], ['isClearEnabled', false], ['isDownloadEnabled', false], ['isPreviewEnabled', false],
      ['marginBottom', 1], ['marginLeft', 2], ['marginRight', 3], ['marginTop', 4], ['maxSize', 1024], ['valuePath', 'blob'],
    ];
    for (const [key, value] of calls)
      expect((upload as unknown as Record<string, (v: unknown) => unknown>)[key](value), key).toBe(upload);
    expect(upload.accept()).toBe('image/*');
    expect([upload.isClearEnabled(), upload.isDownloadEnabled(), upload.isPreviewEnabled()]).toEqual([false, false, false]);
    expect([upload.marginTop(), upload.marginRight(), upload.marginBottom(), upload.marginLeft()]).toEqual([4, 3, 1, 2]);
    expect(upload.maxSize()).toBe(1024);
    expect(upload.valuePath()).toBe('blob');
  });

  it('accepts a negative margin and a zero size limit', () => {
    const upload = new CellTypes.FileUpload();
    upload.marginTop(-5);
    expect(upload.marginTop()).toBe(-5);
    upload.maxSize(0);
    expect(upload.maxSize()).toBe(0);
  });

  it('clears the value path to null when it is set to undefined', () => {
    const upload = new CellTypes.FileUpload();
    expect(upload.valuePath(undefined)).toBe(upload);
    expect(upload.valuePath()).toBeNull();
  });

  it('stores previewCommand as a plain property', () => {
    const upload = new CellTypes.FileUpload();
    upload.previewCommand = 'openPreviewDialog';
    expect(upload.previewCommand).toBe('openPreviewDialog');
    const callback = (): void => {};
    upload.previewCommand = callback;
    expect(upload.previewCommand).toBe(callback);
  });

  it('serialises only what differs from the defaults, in the trial key order', () => {
    const upload = new CellTypes.FileUpload();
    upload.marginTop(-5);
    upload.marginRight(3);
    upload.marginBottom(1);
    upload.marginLeft(2);
    upload.maxSize(0);
    upload.accept('image/*');
    upload.isPreviewEnabled(false);
    upload.isDownloadEnabled(false);
    upload.isClearEnabled(false);
    upload.valuePath(undefined);
    upload.previewCommand = 'openPreviewDialog';
    expect(JSON.stringify(upload.toJSON())).toBe(JSON.stringify({
      typeName: '19',
      marginTop: -5,
      marginRight: 3,
      marginBottom: 1,
      maxSize: 0,
      accept: 'image/*',
      isPreviewEnabled: false,
      isDownloadEnabled: false,
      isClearEnabled: false,
      valuePath: null,
      previewCommand: 'openPreviewDialog',
    }));
    expect(JSON.stringify(new CellTypes.FileUpload().toJSON())).toBe('{"typeName":"19"}');
  });

  it('reads its settings back from JSON', () => {
    const upload = new CellTypes.FileUpload();
    upload.fromJSON({ typeName: '19', accept: 'image/*', maxSize: 4096, isClearEnabled: false });
    expect(upload.accept()).toBe('image/*');
    expect(upload.maxSize()).toBe(4096);
    expect(upload.isClearEnabled()).toBe(false);
    expect(upload.marginTop()).toBe(2);
  });
});

describe('ConditionalFormatting.ScaleValue', () => {
  it('stores the type and value as own fields', () => {
    const ScaleValueType = ConditionalFormatting.ScaleValueType;
    const value = new ScaleValue(ScaleValueType.number, 10);
    expect(Object.keys(value).sort()).toEqual(['type', 'value']);
    expect(value.type).toBe(0);
    expect(value.value).toBe(10);
    value.type = ScaleValueType.percent;
    value.value = 'abc';
    expect(value.type).toBe(3);
    expect(value.value).toBe('abc');
  });

  it('leaves both fields undefined when built without arguments', () => {
    const bare = new ScaleValue();
    expect(bare.type).toBeUndefined();
    expect(bare.value).toBeUndefined();
  });

  it('is exposed on the public namespace and keeps the formula value verbatim', () => {
    expect(ConditionalFormatting.ScaleValue).toBe(ScaleValue);
    const formula = new ConditionalFormatting.ScaleValue(ConditionalFormatting.ScaleValueType.formula, '=A1');
    expect(formula.type).toBe(6);
    expect(formula.value).toBe('=A1');
  });
});

describe('Comments.Padding', () => {
  it('stores the four sides, defaulting to zero', () => {
    const padding = new Comments.Padding(1, 2, 3, 4);
    expect([padding.top, padding.right, padding.bottom, padding.left]).toEqual([1, 2, 3, 4]);
    expect(Object.keys(padding).sort()).toEqual(['bottom', 'left', 'right', 'top']);
    const bare = new Comments.Padding();
    expect([bare.top, bare.right, bare.bottom, bare.left]).toEqual([0, 0, 0, 0]);
  });

  it('clones into a distinct Padding and prints the CSS shorthand', () => {
    const padding = new Padding(1, 2, 3, 4);
    const copy = padding.clone();
    expect(copy).not.toBe(padding);
    expect(copy).toBeInstanceOf(Padding);
    expect([copy.top, copy.right, copy.bottom, copy.left]).toEqual([1, 2, 3, 4]);
    expect(String(padding)).toBe('1px 2px 3px 4px');
  });

  it('flows through the comment padding accessor unchanged', () => {
    const workbook = new GC.Spread.Sheets.Workbook();
    workbook.setSheetCount(1);
    const sheet = workbook.getActiveSheet();
    const comment = sheet.comments.add(0, 0, 'hello');
    expect(comment.padding()).toBeUndefined();
    expect(comment.padding(new Padding(1, 2, 3, 4))).toBe(comment);
    expect(comment.padding()).toBeInstanceOf(Padding);
    const box = comment.padding() as Padding;
    expect([box.top, box.right, box.bottom, box.left]).toEqual([1, 2, 3, 4]);
    comment.padding({ top: 5, right: 6, bottom: 7, left: 8 });
    expect(comment.padding()).toEqual({ top: 5, right: 6, bottom: 7, left: 8 });
    const json = comment.toJSON() as Record<string, unknown>;
    expect(JSON.stringify(json)).toBe(JSON.stringify({
      rowIndex: 0, colIndex: 0, text: 'hello',
      padding: { top: 5, right: 6, bottom: 7, left: 8 },
      commentState: 3, zIndex: 898,
    }));
    comment.padding(null);
    expect(comment.padding()).toBeNull();
    workbook.destroy?.();
  });
});

describe('cell type ids (trial probe f40ct6-registry)', () => {
  it('uses the reference type ids for the serialised cell types', () => {
    expect(new CellTypes.Base().typeName).toBe('0');
    expect(new CellTypes.Text().typeName).toBe('1');
    expect(new CellTypes.ColumnHeader().typeName).toBe('2');
    expect(new CellTypes.RowHeader().typeName).toBe('3');
    expect(new CellTypes.Corner().typeName).toBe('4');
    expect(new CellTypes.CheckBox().typeName).toBe('5');
    expect(new CellTypes.Button().typeName).toBe('6');
    expect(new CellTypes.ComboBox().typeName).toBe('7');
    expect(new CellTypes.HyperLink().typeName).toBe('8');
    expect(new CellTypes.RadioButtonList().typeName).toBe('11');
    expect(new CellTypes.CheckBoxList().typeName).toBe('12');
    expect(new CellTypes.ButtonList().typeName).toBe('13');
    expect(new CellTypes.RangeTemplate().typeName).toBe('16');
    expect(new CellTypes.DataObject('').typeName).toBe('18');
    expect(new CellTypes.FileUpload().typeName).toBe('19');
    expect(new CellTypes.Diagonal().typeName).toBe('20');
  });

  it('reads a serialised cell type back by its reference id', () => {
    expect(cellTypeFromJSON({ typeName: '19' })).toBeInstanceOf(CellTypes.FileUpload);
    expect(cellTypeFromJSON({ typeName: '16' })).toBeInstanceOf(CellTypes.RangeTemplate);
    expect(cellTypeFromJSON({ typeName: '20' })).toBeInstanceOf(CellTypes.Diagonal);
    expect(cellTypeFromJSON({ typeName: '18' })).toBeInstanceOf(CellTypes.DataObject);
    expect(cellTypeFromJSON({ typeName: '12' })).toBeInstanceOf(CellTypes.CheckBoxList);
  });

  it('keeps the trial key order for the header and text cell types', () => {
    expect(JSON.stringify(new CellTypes.Text().toJSON())).toBe(JSON.stringify({ allowOverflow: true, typeName: '1', editorType: 1 }));
    expect(JSON.stringify(new CellTypes.ColumnHeader().toJSON())).toBe(JSON.stringify({ allowOverflow: false, typeName: '2' }));
    expect(JSON.stringify(new CellTypes.RowHeader().toJSON())).toBe(JSON.stringify({ allowOverflow: false, typeName: '3' }));
    expect(JSON.stringify(new CellTypes.Corner().toJSON())).toBe(JSON.stringify({ allowOverflow: false, typeName: '4' }));
  });

  it('keeps the constructor types working for the classes the sweep touched', () => {
    expect(new CheckBoxList()).toBeInstanceOf(Base);
    expect(new RadioButtonList()).toBeInstanceOf(Base);
    expect(new Button()).toBeInstanceOf(Base);
    expect(new ComboBox()).toBeInstanceOf(Base);
    expect(new HyperLink()).toBeInstanceOf(Base);
    expect(new RangeTemplate()).toBeInstanceOf(Base);
    expect(new CellTypes.FileUpload()).toBeInstanceOf(Base);
  });
});
