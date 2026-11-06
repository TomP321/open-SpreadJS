import { describe, expect, it } from 'vitest';
import GC from '../src/index.js';
import { styleProperties } from '../src/primitives.js';
const { Worksheet, Style, LineBorder, Range, CellRange, StorageType } = GC.Spread.Sheets;
describe('Style and CellRange', () => {
  for (const key of styleProperties)
    it(`supports Style.${key} and applies CellRange.${key} across cells`, () => {
      const s = new Worksheet('Style'),
        range = s.getRange(1, 2, 2, 3),
        value = { property: key };
      const st = new Style();
      expect(st[key]).toBeUndefined();
      st[key] = value;
      expect(st[key]).toBe(value);
      const accessor = range[key];
      expect(accessor.call(range, value)).toBe(range);
      for (let r = 1; r < 3; r++) for (let c = 2; c < 5; c++) expect(s.getStyle(r, c)?.[key]).toBe(value);
      expect(range[key]()).toBe(value);
      expect(s.getStyle(0, 0)).toBeNull();
    });
  it('supports constructor arguments and deep clones borders and nested style values', () => {
    const border = new LineBorder('red', 1),
      style = new Style('white', 'black', 1, 2, '12px Arial', 'Body', '0.00', border);
    expect(style).toMatchObject({
      backColor: 'white',
      foreColor: 'black',
      hAlign: 1,
      vAlign: 2,
      font: '12px Arial',
      borderLeft: border,
    });
    const copy = style.clone();
    expect(copy).toBeInstanceOf(Style);
    expect(copy).toEqual(style);
    expect(copy.borderLeft).toBeInstanceOf(LineBorder);
    expect(copy.borderLeft).not.toBe(border);
    expect(new LineBorder()).toMatchObject({ color: 'black', style: 0 });
  });
  it('uses row/column/default styles without filling cells', () => {
    const s = new Worksheet('Virtual');
    s.setRowCount(1_000_000);
    s.setColumnCount(16384);
    s.getRange(-1, 3, -1, 1).backColor('red');
    s.getRange(999999, -1, 1, -1).foreColor('blue');
    s.getRange(-1, -1, -1, -1).wordWrap(true);
    expect(s.getActualStyle(999999, 3)).toMatchObject({
      backColor: 'red',
      foreColor: 'blue',
      wordWrap: true,
    });
    expect(s.getStyle(999999, 3)).toBeNull();
    expect(JSON.stringify(s.toJSON())).not.toContain('dataTable');
  });
  it('addresses A1, absolute references, sheet-qualified ranges and full rows/columns', () => {
    const s = new Worksheet('Range');
    expect(s.getRange('B2:D4')).toMatchObject({ row: 1, col: 1, rowCount: 3, colCount: 3 });
    expect(s.getRange("'Range'!$AA$2:$AB$3")).toMatchObject({ row: 1, col: 26, rowCount: 2, colCount: 2 });
    expect(s.getRange('C:E')).toMatchObject({ row: -1, col: 2, rowCount: -1, colCount: 3 });
    expect(s.getRange('3:5')).toMatchObject({ row: 2, col: -1, rowCount: 3, colCount: -1 });
    const range = new CellRange(s, 1, 1, 2, 2);
    expect(range.value(5)).toBe(range);
    expect(range.value()).toBe(5);
    expect(s.getArray(1, 1, 2, 2)).toEqual([
      [5, 5],
      [5, 5],
    ]);
    expect(range.text('7')).toBe(range);
    expect(range.text()).toBe('7');
    expect(range.tag('id')).toBe(range);
    expect(s.getTag(2, 2)).toBe('id');
    range.formula('=A1+$B$2', true);
    expect(range.formula()).toBe('A1+$B$2');
    expect(s.getFormula(2, 2)).toBe('B2+$B$2');
    range.clear(StorageType.data);
    expect(range.value()).toBeNull();
  });
  it('applies dimensions, visibility, resizeability, styles and border placement', () => {
    const s = new Worksheet('Range'),
      r = s.getRange(1, 1, 2, 2);
    expect(r.height(30)).toBe(r);
    expect(r.height()).toBe(30);
    expect(s.getRowHeight(2)).toBe(30);
    expect(r.width(90)).toBe(r);
    expect(r.width()).toBe(90);
    expect(s.getColumnWidth(2)).toBe(90);
    const column = s.getRange(-1, 1, -1, 2);
    column.visible(false);
    expect(column.visible()).toBe(false);
    column.visible(true);
    column.resizable(false);
    expect(column.resizable()).toBe(false);
    expect(s.getColumnResizable(2)).toBe(false);
    r.visible(false);
    expect(r.visible()).toBe(false);
    r.visible(true);
    r.resizable(false);
    expect(r.resizable()).toBe(false);
    expect(s.getRowResizable(2)).toBe(false);
    r.setStyle(Object.assign(new Style(), { font: '20px Arial' }));
    expect(s.getStyle(2, 2)?.font).toBe('20px Arial');
    r.setStyleName('Unknown');
    expect(s.getStyleName(2, 2)).toBe('Unknown');
    const border = new LineBorder('red', 1);
    r.setBorder(border, { outline: true });
    expect(s.getStyle(1, 1)?.borderTop).toBe(border);
    expect(s.getStyle(1, 1)?.borderRight).toBeUndefined();
    expect(s.getStyle(2, 2)?.borderBottom).toBe(border);
    r.setBorder(border, { inside: true });
    expect(s.getStyle(1, 1)?.borderRight).toBe(border);
    r.setBorderRadius('5px', {});
    expect(s.getStyle(2, 2)?.borderRadius).toBe('5px');
  });
  it('stores per-cell comments, default values, binding paths, cell types and alternative text', () => {
    const s = new Worksheet('Metadata'),
      r = s.getRange(1, 1, 2, 2),
      comment = new GC.Spread.Sheets.Comments.Comment('note');
    expect(r.comment(comment)).toBe(r);
    expect(r.comment()?.text()).toBe('note');
    expect(s.comments.all()).toHaveLength(4);
    r.defaultValue('default');
    expect(r.defaultValue()).toBe('default');
    r.bindingPath('field');
    expect(r.bindingPath()).toBe('field');
    r.altText('alternative');
    expect(r.altText()).toBe('alternative');
    const type = { name: 'placeholder' };
    s.setCellType(1, 1, type);
    expect(s.getCellType(1, 1)).toBe(type);
    expect(s.getCell(1, 1).cellType()).toBe(type);
    s.comments.remove(1, 1);
    expect(s.comments.get(1, 1)).toBeNull();
    s.comments.clear();
    expect(s.comments.all()).toEqual([]);
  });
});
describe('Range geometry', () => {
  it('implements contains, containsRange, equals, intersection, offsets and union', () => {
    const a = new Range(2, 3, 4, 5);
    expect(a.contains(2, 3)).toBe(true);
    expect(a.contains(6, 3)).toBe(false);
    expect(a.containsRange(new Range(3, 4, 1, 2))).toBe(true);
    expect(a.equals(new Range(2, 3, 4, 5))).toBe(true);
    expect(a.equals(new Range(2, 3, 4, 6))).toBe(false);
    expect(a.getIntersect(new Range(4, 5, 4, 5), 100, 100)).toEqual(new Range(4, 5, 2, 3));
    expect(a.getIntersect(new Range(20, 20, 1, 1), 100, 100)).toBeNull();
    expect(a.intersect(4, 5, 4, 5)).toBe(true);
    expect(a.intersect(20, 20, 1, 1)).toBe(false);
    expect(a.offset(1, 2)).toEqual(new Range(4, 4, 4, 5));
    expect(a.union(new Range(1, 2, 2, 2))).toEqual(new Range(1, 2, 5, 6));
    const columns = new Range(-1, 2, -1, 2);
    expect(columns.contains(999999, 2)).toBe(true);
    expect(columns.getIntersect(a, 100, 100)).toEqual(new Range(2, 3, 4, 1));
  });
});
it('resolves live default styles and composite font fields', () => {
  const wb = new GC.Spread.Sheets.Workbook(undefined, { font: 'bold 16px Arial' }),
    s = wb.getSheet(0);
  expect(s.getActualStyle(0, 0).font).toBe('bold 16px Arial');
  const style = s.getDefaultStyle();
  expect(style.hAlign).toBe(3);
  expect(s.getStyle(-1, -1)).toBe(style);
  style.hAlign = 1;
  style.backColor = 'beige';
  expect(s.getActualStyle(0, 0)).toMatchObject({ hAlign: 1, backColor: 'beige' });
  const font = new Style();
  font.font = 'italic bold 12px Arial';
  expect(font.fontFamily).toBe('Arial');
  expect(font.fontSize).toBe('12px');
  font.fontSize = '20px';
  expect(font.font).toBe('italic bold 20px Arial');
});
