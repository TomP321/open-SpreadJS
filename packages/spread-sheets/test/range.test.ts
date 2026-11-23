import { describe, expect, it } from 'vitest';
import GC from '../src/index.js';
import { styleProperties } from '../src/primitives.js';
const { Worksheet, Style, LineBorder, Range, CellRange, StorageType } = GC.Spread.Sheets;
describe('Style and CellRange', () => {
  for (const key of styleProperties)
    it(`supports Style.${key}${key.startsWith('apply') ? ' (the trial CellRange exposes no apply* accessor)' : ` and applies CellRange.${key} across cells`}`, () => {
      const s = new Worksheet('Style'),
        range = s.getRange(1, 2, 2, 3),
        value = { property: key };
      const st = new Style();
      expect(st[key]).toBeUndefined();
      st[key] = value;
      expect(st[key]).toBe(value);
      if (key.startsWith('apply')) {
        // TASK 46 trial probe: GC.Spread.Sheets.CellRange has no apply* style accessors and the
        // d.ts contract does not declare them; the members only exist on Style itself.
        expect((range as unknown as Record<string, unknown>)[key]).toBeUndefined();
        s.setStyle(1, 2, st);
        expect(s.getStyle(1, 2)?.[key]).toBe(value);
        return;
      }
      const accessor = (range as unknown as Record<string, (v?: unknown) => unknown>)[key];
      expect(accessor.call(range, value)).toBe(range);
      for (let r = 1; r < 3; r++) for (let c = 2; c < 5; c++) expect(s.getStyle(r, c)?.[key]).toBe(value);
      expect((range as unknown as Record<string, () => unknown>)[key]()).toBe(value);
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
  // TASK 90 round 2 probe (.probe/t90/rangefont-r1.json / rangefont2-r1.json, measured on the
  // trial): the workbook CONSTRUCTOR option `font` is stored but does not participate in style
  // resolution - the trial's getActualStyle(0,0).font is `14.6667px Calibri` even with
  // {font:'bold 16px Arial'} (the built-in default style carries themeFont 'Body').
  const wb = new GC.Spread.Sheets.Workbook(undefined, { font: 'bold 16px Arial' }),
    s = wb.getSheet(0);
  expect(wb.options.font).toBe('bold 16px Arial');
  expect(s.getActualStyle(0, 0).font).toBe('14.6667px Calibri');
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

it('themeFont accessor getter walks the cascade raw, like the trial (TASK 90)', () => {
  // .probe/t90/rangefont2-r1.json (measured on the trial): CellRange.themeFont() returns the RAW
  // member of the most specific level that DEFINES one - the area default's built-in 'Body' is
  // reported even when the resolved actual style drops it - not the resolved cascade value.
  const s = new Worksheet('ThemeWalk');
  expect(s.getRange(0, 0, 1, 1).themeFont()).toBe('Body'); // plain cell: the default style's token
  const rowStyle = new Style();
  rowStyle.font = '16pt Verdana';
  s.setStyle(-1, 1, rowStyle);
  expect(s.getRange(2, 1, 1, 1).font()).toBe('16pt Verdana'); // the family resolves through the row style
  expect(s.getRange(2, 1, 1, 1).themeFont()).toBe('Body'); // ...yet the getter still reports 'Body'
  const own = new Style();
  own.font = 'bold italic 22pt "Segoe UI"';
  s.setStyle(4, 4, own);
  expect(s.getActualStyle(4, 4).themeFont).toBeUndefined(); // the RESOLVED style carries none (explicit family wins)
  expect(s.getRange(4, 4, 1, 1).themeFont()).toBe('Body'); // the getter keeps walking down to the default
  s.getRange(6, 6, 1, 1).themeFont('Whatever'); // a string token on the cell is the most specific level
  expect(s.getRange(6, 6, 1, 1).themeFont()).toBe('Whatever');
  expect(s.getActualStyle(6, 6).font).toBe('14.6667px Whatever'); // unknown tokens pass through verbatim
});

describe('Rect and Point', () => {
  const { Rect, Point } = GC.Spread.Sheets;
  it('Rect owns x, y, width and height in the trial order', () => {
    const rect = new Rect(1, 2, 10, 5);
    expect([rect.x, rect.y, rect.width, rect.height]).toEqual([1, 2, 10, 5]);
    expect(Object.keys(rect)).toEqual(['x', 'y', 'width', 'height']);
    expect(Object.getOwnPropertyNames(Rect.prototype).sort()).toEqual(
      // The trial keeps only the methods on the prototype and stores the values as
      // own instance fields. Our fallback gate additionally requires a descriptor
      // for every declared data property on the prototype, so those four lazy
      // accessors are present there too; every instance shadows them with its own
      // field, which is what reads and writes reach.
      ['constructor', 'contains', 'getIntersectRect', 'intersect', 'intersectRect', 'height', 'width', 'x', 'y'].sort(),
    );
    // The trial tolerates missing constructor arguments and leaves the fields undefined.
    const NoArgumentRect = Rect as unknown as new () => InstanceType<typeof Rect>;
    const empty = new NoArgumentRect();
    expect(Object.keys(empty)).toEqual(['x', 'y', 'width', 'height']);
    expect([empty.x, empty.y, empty.width, empty.height]).toEqual([undefined, undefined, undefined, undefined]);
  });
  it('Rect.contains(x, y) is true only strictly inside the rectangle', () => {
    const rect = new Rect(1, 2, 10, 5);
    const points: [number, number][] = [
      [1, 2], [11, 2], [1, 7], [11, 7], [10.99, 6.99], [2, 2], [1, 3], [6, 2], [11, 4], [4, 7], [2, 6.9], [2, 7.1],
    ];
    expect(points.map(([x, y]) => rect.contains(x, y))).toEqual([
      false, false, false, false, true, false, false, false, false, false, true, false,
    ]);
    expect([rect.contains(1, 2), rect.contains(10, 6), rect.contains(11, 2), rect.contains(1, 7), rect.contains(0, 2), rect.contains(10.5, 6.5)]).toEqual([
      false, true, false, false, false, true,
    ]);
  });
  it('Rect.intersect(x, y, width, height) and intersectRect(rect) report shared area', () => {
    const rect = new Rect(1, 2, 10, 5);
    expect([
      rect.intersect(5, 3, 4, 4), rect.intersect(11, 2, 4, 4), rect.intersect(10, 2, 4, 4), rect.intersect(-5, 2, 6, 5),
      rect.intersect(1, 7, 1, 1), rect.intersectRect(new Rect(9, 6, 5, 5)), rect.intersectRect(new Rect(11, 2, 5, 5)),
    ]).toEqual([true, false, true, false, false, true, false]);
  });
  it('Rect.getIntersectRect(rect) returns the shared rectangle or null', () => {
    const rect = new Rect(1, 2, 10, 5);
    const size = (value: { x: number; y: number; width: number; height: number } | null) =>
      value ? [value.x, value.y, value.width, value.height] : null;
    expect(size(rect.getIntersectRect(new Rect(5, 3, 20, 20)))).toEqual([5, 3, 6, 4]);
    expect(size(rect.getIntersectRect(new Rect(11, 2, 5, 5)))).toBeNull();
    expect(size(rect.getIntersectRect(new Rect(9, 6, 5, 5)))).toEqual([9, 6, 2, 1]);
    expect(size(rect.getIntersectRect(new Rect(-5, -5, 10, 10)))).toEqual([1, 2, 4, 3]);
    expect(rect.getIntersectRect(new Rect(20, 20, 2, 2)) instanceof Rect).toBe(false);
  });
  it('Point.clone() returns a new Point with the same coordinates', () => {
    const point = new Point(3, 4),
      copy = point.clone();
    expect([copy.x, copy.y]).toEqual([3, 4]);
    expect(copy).toBeInstanceOf(Point);
    expect(copy).not.toBe(point);
    copy.x = 9;
    expect(point.x).toBe(3);
  });
});

describe('CellRange geometry and toHtml', () => {
  const { SheetArea, HeaderOptions, TextDecorationType } = GC.Spread.Sheets;
  it('row, col, rowCount, colCount, sheetArea and sheet are own properties of the range', () => {
    const sheet = new Worksheet('Geometry'),
      range = sheet.getRange(1, 2, 3, 4);
    expect([range.row, range.col, range.rowCount, range.colCount, range.sheetArea]).toEqual([1, 2, 3, 4, SheetArea.viewport]);
    expect(range.sheet).toBe(sheet);
    expect(Object.keys(range)).toEqual(['sheet', 'row', 'col', 'rowCount', 'colCount', 'sheetArea']);
    expect(sheet.getRange(0, 0, 1, 1, SheetArea.rowHeader).sheetArea).toBe(SheetArea.rowHeader);
  });
  it('toHtml() serialises the visible cells as the trial table', () => {
    const sheet = new Worksheet('Html');
    sheet.setValue(0, 0, 5);
    sheet.setValue(0, 1, 'abc');
    sheet.setValue(1, 0, true);
    sheet.getRange(0, 0, 2, 2).backColor('rgb(255,0,0)');
    const cell = (text: string, align: string) =>
      `<td style="padding: 0; background-color: rgb(255,0,0); font: 11.00pt Calibri, 'Helvetica Neue', Arial, sans-serif; ` +
      `white-space: nowrap; vertical-align: top; text-align: ${align}; overflow: hidden;height: 19px;line-height: 16px; ` +
      `width: 61px;max-width: 61px;min-width: 61px;">${text}</td>`;
    expect(sheet.getRange(0, 0, 2, 2).toHtml()).toBe(
      `<table style="border-collapse: collapse"><tr>${cell('5', 'right')}${cell('abc', 'left')}</tr>` +
      `<tr>${cell('TRUE', 'center')}${cell('', 'left')}</tr></table>`,
    );
  });
  it('toHtml() uses gridline borders and plain cells when styles are switched off', () => {
    const sheet = new Worksheet('Plain');
    sheet.getRange(0, 0).value('5');
    const gridline = 'border-top: 1px solid rgb(212, 212, 212); border-bottom: 1px solid rgb(212, 212, 212); ' +
      'border-left: 1px solid rgb(212, 212, 212); border-right: 1px solid rgb(212, 212, 212); ';
    expect(sheet.getRange(0, 0, 1, 1).toHtml()).toBe(
      `<table style="border-collapse: collapse"><tr><td style="padding: 0; ` +
      `font: 11.00pt Calibri, 'Helvetica Neue', Arial, sans-serif; white-space: nowrap; vertical-align: top; ` +
      `text-align: left; ${gridline}overflow: hidden;height: 19px;line-height: 16px; ` +
      `width: 61px;max-width: 61px;min-width: 61px;">5</td></tr></table>`,
    );
    expect(sheet.getRange(0, 0, 1, 1).toHtml(HeaderOptions.noHeaders, false)).toBe(
      '<table style="border-collapse: collapse"><tr><td>5</td></tr></table>',
    );
    // An explicit background removes the gridline borders, an explicit border replaces only that edge.
    sheet.getRange(0, 0).backColor('yellow');
    const backed = sheet.getRange(0, 0, 1, 1).toHtml();
    expect(backed).toContain('background-color: yellow; ');
    for (const edge of ['top', 'bottom', 'left', 'right']) expect(backed).not.toContain(`border-${edge}`);
    sheet.getRange(0, 0).backColor(null);
    expect(sheet.getRange(0, 0, 1, 1).toHtml()).toContain(gridline);
    sheet.getRange(0, 0).borderTop(new LineBorder('blue', 3));
    const styled = sheet.getRange(0, 0, 1, 1).toHtml();
    expect(styled).toContain('border-top: 0.5pt dashed blue; ');
    expect(styled).not.toContain('border-bottom');
    expect(styled).toContain('border-left: 1px solid rgb(212, 212, 212); ');
    expect(styled).toContain('border-right: 1px solid rgb(212, 212, 212); ');
  });
  it('toHtml() skips hidden rows and columns and spans merged cells', () => {
    const sheet = new Worksheet('Hidden');
    sheet.setValue(0, 0, 'a');
    sheet.setValue(1, 0, 'b');
    sheet.setValue(0, 1, 'c');
    sheet.setRowVisible(1, false);
    sheet.setColumnVisible(1, false);
    expect(sheet.getRange(0, 0, 2, 2).toHtml()).toContain('<tr><td style="padding: 0; ');
    expect(sheet.getRange(0, 0, 2, 2).toHtml().split('<td').length - 1).toBe(1);
    const merged = new Worksheet('Merged');
    merged.setValue(0, 0, 'm');
    merged.addSpan(0, 0, 2, 2);
    const cells = merged.getRange(0, 0, 3, 3).toHtml().split('<td').slice(1);
    expect(cells[0]).toContain(' rowSpan=2 colSpan=2 ');
    expect(cells[0]).toContain('height: 39px;');
    expect(cells[0]).toContain('width: 123px;');
    expect(cells.filter((cell) => cell.includes('rowSpan')).length).toBe(1);
    expect(cells.length).toBe(6);
    // The covered cells are not emitted: the merged rows hold two cells each.
    expect(
      merged.getRange(0, 0, 3, 3).toHtml().split('<tr>').slice(1).map((line) => line.split('<td').length - 1),
    ).toEqual([2, 1, 3]);
  });
  it('toHtml() renders the row and column header areas like the trial labels', () => {
    const sheet = new Worksheet('Headers');
    const rowHeader = sheet.getRange(0, 0, 2, 1, SheetArea.rowHeader).toHtml(),
      colHeader = sheet.getRange(0, 0, 1, 2, SheetArea.colHeader).toHtml();
    expect([...rowHeader.matchAll(/>(\d)<\/td>/g)].map((match) => match[1])).toEqual(['1', '2']);
    expect([...colHeader.matchAll(/>([A-Z])<\/td>/g)].map((match) => match[1])).toEqual(['A', 'B']);
    expect(rowHeader).toContain('vertical-align: middle; text-align: center;');
    expect(rowHeader).toContain('border-top: 1px solid #d4d4d4;');
    expect(rowHeader).toContain('width: 39px;');
    expect(colHeader).toContain('width: 61px;');
    expect(sheet.getRange(0, 0, 1, 1, SheetArea.corner).toHtml()).toBe('');
  });
  it('toHtml() escapes text, applies underline decoration and honours the formatter', () => {
    const sheet = new Worksheet('Text');
    sheet.setValue(0, 0, 'a<b>&"c\u00e9');
    expect(sheet.getRange(0, 0, 1, 1).toHtml()).toContain('a&lt;b&gt;&amp;&quot;c\u00e9');
    sheet.getRange(0, 0).clear(7);
    sheet.setValue(0, 0, 1234.5);
    sheet.getRange(0, 0).formatter('#,##0.00');
    expect(sheet.getRange(0, 0, 1, 1).toHtml()).toContain('>1,234.50<');
    sheet.getRange(0, 0).formatter('@');
    expect(sheet.getRange(0, 0, 1, 1).toHtml()).toContain('>1234.5<');
    sheet.getRange(0, 0).clear(7);
    sheet.setValue(0, 0, 't');
    sheet.getRange(0, 0).textDecoration(TextDecorationType.underline);
    expect(sheet.getRange(0, 0, 1, 1).toHtml()).toContain('<u>t</u>');
  });
  it('applyNamedCellTemplate(name) applies the template style like the trial', () => {
    const workbook = new GC.Spread.Sheets.Workbook(undefined, { sheetCount: 1 }),
      sheet = workbook.getSheet(0);
    workbook.namedCellTemplates.add('money', { style: { formatter: '0.00$', backColor: '#eeeeee' } });
    sheet.setValue(0, 0, 12.5);
    sheet.getRange(0, 0, 2, 2).applyNamedCellTemplate('money');
    expect([sheet.getFormatter(0, 0), sheet.getFormatter(1, 1), sheet.getRange(0, 0).backColor(), sheet.getFormatter(0, 3)]).toEqual([
      '0.00$', '0.00$', '#eeeeee', undefined,
    ]);
    expect(sheet.getValue(0, 0)).toBe(12.5);
    // Unknown template names are ignored (the trial does not throw).
    expect(sheet.getRange(0, 0, 1, 1).applyNamedCellTemplate('nope')).toBeUndefined();
    // Whole rows and whole columns are addressed like the trial's 'A:A' and '5:6' forms.
    sheet.applyNamedCellTemplate('money', 'B:B');
    expect([sheet.getFormatter(0, 1), sheet.getFormatter(199, 1)]).toEqual(['0.00$', '0.00$']);
    sheet.applyNamedCellTemplate('money', '9:10');
    expect([sheet.getFormatter(8, 10), sheet.getFormatter(10, 10)]).toEqual(['0.00$', undefined]);
    expect(sheet.applyNamedCellTemplate('money', 'not a range')).toBeUndefined();
    expect(sheet.applyNamedCellTemplate('nope', 'A1')).toBeUndefined();
    // The trial stores whole-row/whole-column applications as row/column styles.
    const data = sheet.toJSON().data as { rowDataArray?: unknown[]; columnDataArray?: unknown[] };
    expect((data.rowDataArray as { style: { formatter: string } }[])[8].style.formatter).toBe('0.00$');
    expect(((data.columnDataArray as { style: { formatter: string } }[])[1]).style.formatter).toBe('0.00$');
  });
});
