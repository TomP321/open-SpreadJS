import { describe, expect, it } from 'vitest';
import GC from '../src/index.js';
import { parseColor, mixColor, resolveColor } from '../src/colors.js';

describe('M5 value formatting', () => {
  it('formats every supported cell value without passing objects into SSF', () => {
    const sheet = new GC.Spread.Sheets.Worksheet();
    const values: [unknown, string][] = [
      [null, ''], [undefined, ''], [true, 'TRUE'], [false, 'FALSE'], [42, '42'], ['abc', 'abc'],
      [GC.Spread.CalcEngine.CalcError.parse('#NAME?'), '#NAME?'],
      [[1, 2], '1,2'], [[[1, 2], [3, 4]], '1,2,3,4'], [{ text: 'hello' }, '[object Object]'],
      [{ richText: [{ text: 'Hello' }, { text: ' world' }] }, 'Hello world'], [{ a: 1 }, '[object Object]'],
      [new Date('2020-01-02Z'), '1/2/2020'], [NaN, 'NaN'], [Infinity, 'Infinity'], [-Infinity, '-Infinity'],
    ];
    for (const [value, text] of values) {
      sheet.setValue(0, 0, value);
      expect(sheet.getText(0, 0), String(value)).toBe(text);
    }
  });
  it('renders an absent barcode plugin as a calculation error', () => {
    const sheet = new GC.Spread.Sheets.Workbook().getActiveSheet();
    sheet.setFormula(0, 0, 'BC_QRCODE("hello")');
    expect(sheet.getText(0, 0)).toBe('#NAME?');
    sheet.setFormula(1, 0, 'LINESPARKLINE(A1:A4,0)');
    expect(() => sheet.getText(1, 0)).not.toThrow();
  });
});
describe('M5 colour syntax', () => {
  it.each([
    ['red', [255, 0, 0, 1]], ['yellow', [255, 255, 0, 1]], ['green', [0, 128, 0, 1]],
    ['RebeccaPurple', [102, 51, 153, 1]], ['lightgoldenrodyellow', [250, 250, 210, 1]],
    ['#123', [17, 34, 51, 1]], ['#1234', [17, 34, 51, 68 / 255]],
    ['#12345678', [18, 52, 86, 120 / 255]], ['#ABCDEF', [171, 205, 239, 1]],
    ['rgb(100%,0%,50%)', [255, 0, 128, 1]], ['rgba(1,2,3,.5)', [1, 2, 3, .5]],
    ['rgb(1 2 3 / 50%)', [1, 2, 3, .5]], ['hsl(120,100%,25%)', [0, 128, 0, 1]],
    ['hsl(.5turn 100% 50% / .2)', [0, 255, 255, .2]], ['transparent', [0, 0, 0, 0]],
    ['Accent 1 40', [149, 181, 215, 1]], ['Accent 1 -25', [55, 99, 147, 1]],
  ])('parses %s without a DOM', (color, expected) => expect(parseColor(color as string)).toEqual(expected));
  it('interpolates named and functional colours in scale rules', () => {
    expect(mixColor('red', 'yellow', .5)).toBe('rgba(255,128,0,1)');
    expect(mixColor('transparent', 'rgba(0,0,255,.8)', .5)).toBe('rgba(0,0,128,0.4)');
    expect(resolveColor('Accent 1 40')).toBe('rgba(149,181,215,1)');
    expect(parseColor('invalid')).toBeNull();
    expect(parseColor('rgb(1, 2, x)')).toBeNull();
    const sheet = new GC.Spread.Sheets.Worksheet();
    sheet.setArray(0, 0, [[0], [50], [100]]);
    sheet.conditionalFormats.add3ScaleRule(1, 0, 'red', 0, 50, 'yellow', 2, 100, 'green', [new GC.Spread.Sheets.Range(0, 0, 3, 1)]);
    expect(sheet.conditionalFormats._visualFor(0, 0, 0)?.backColor).toBe('rgba(255,0,0,1)');
    expect(sheet.conditionalFormats._visualFor(2, 0, 100)?.backColor).toBe('rgba(0,128,0,1)');
  });
});

describe('M5 sparkline model', () => {
  it('groups, clones, ungroups and removes charts without sharing settings', () => {
    const wb = new GC.Spread.Sheets.Workbook(), s = wb.getActiveSheet(), S = GC.Spread.Sheets.Sparklines;
    s.setArray(0, 0, [[1], [3], [-2], [5]]);
    const a = s.setSparkline(0, 2, 'A1:A4', 0, 0, new S.SparklineSetting({ showMarkers: true }));
    const b = s.setSparkline(1, 2, new GC.Spread.Sheets.Range(0, 0, 4, 1), 0, 1, new S.SparklineSetting());
    const group = s.groupSparkline([a, b]);
    expect(group.count()).toBe(2); expect(b.sparklineType()).toBe(0);
    expect(group.clone().count()).toBe(2);
    const setting = a.setting() as InstanceType<typeof S.SparklineSetting>;
    const copy = setting.clone(); copy.options.seriesColor = 'red'; expect(setting.options.seriesColor).toBe('#244062');
    const json = s.toJSON(); const restored = new GC.Spread.Sheets.Worksheet(); restored.fromJSON(json);
    expect(restored.toJSON().sparklineGroups).toEqual(json.sparklineGroups);
    s.ungroupSparkline(group); expect((a.group() as InstanceType<typeof S.SparklineGroup>).count()).toBe(1);
    s.removeSparkline(0, 2); expect(s.getSparkline(0, 2)).toBeNull();
    s.removeSparkline(1, 2); expect(s.toJSON().sparklineGroups).toBeUndefined();
  });
  it('recalculates formula charts when their data changes and keeps their text empty', () => {
    const s = new GC.Spread.Sheets.Workbook().getActiveSheet(); s.setArray(0, 0, [[1], [3], [2]]);
    s.setFormula(0, 2, 'LINESPARKLINE(A1:A3,0)');
    expect(s.getText(0, 2)).toBe('');
    expect((s.getValue(0, 2) as { value: { values: number[][] } }).value.values).toEqual([[1], [3], [2]]);
    s.setValue(1, 0, 9);
    expect((s.getValue(0, 2) as { value: { values: number[][] } }).value.values).toEqual([[1], [9], [2]]);
    s.setFormula(1, 2, 'PIESPARKLINE(A1:A3)'); expect(s.getText(1, 2)).toBe('');
  });
});
describe('M5 floating model', () => {
  it('round-trips object geometry, flags, stacking and pictures through sheet JSON', () => {
    const s = new GC.Spread.Sheets.Worksheet(), F = GC.Spread.Sheets.FloatingObjects;
    const a = new F.FloatingObject('A', 12, 20, 100, 80); s.floatingObjects.add(a);
    expect([a.startRow(), a.startColumn(), a.endColumn(), a.endColumnOffset()]).toEqual([1, 0, 1, 50]);
    a.dynamicMove(false); expect(a.dynamicSize()).toBe(false);
    a.dynamicSize(true); expect(a.dynamicMove()).toBe(true);
    const b = new F.FloatingObject('B', 0, 0, 20, 20); s.floatingObjects.add(b);
    expect(() => s.floatingObjects.add(new F.FloatingObject('B', 0, 0, 20, 20))).toThrow();
    s.floatingObjects.zIndex('A', 1); expect(s.floatingObjects.all().map(o => o.name())).toEqual(['B', 'A']);
    const picture = s.pictures.add('P', 'https://example.com/photo.png', 10, 20, 100, 80) as InstanceType<typeof F.Picture>;
    picture.borderColor('red'); const json = s.toJSON();
    const restored = new GC.Spread.Sheets.Worksheet(); restored.fromJSON(json);
    expect(restored.toJSON().floatingObjects).toEqual(json.floatingObjects);
    restored.pictures.clear(); restored.floatingObjects.clear(); expect(restored.toJSON().floatingObjects).toBeUndefined();
  });
});
describe('M5 nested binding', () => {
  it('reads live nested cell sources and writes edits back through binding paths', () => {
    const s = new GC.Spread.Sheets.Worksheet(), record = { person: { name: 'Alice' } };
    const source = new GC.Spread.Sheets.Bindings.CellBindingSource(record);
    s.setBindingPath(1, 1, 'person.name'); s.setDataSource(source); expect(s.getValue(1, 1)).toBe('Alice');
    record.person.name = 'Bob'; expect(s.getValue(1, 1)).toBe('Bob');
    s.setValue(1, 1, 'Carol'); expect(record.person.name).toBe('Carol');
    expect(() => source.setValue('__proto__.polluted', true)).toThrow('Invalid binding path');
    s.setDataSource(null); expect(s.getDataSource()).toBeNull();
  });
  it('handles nested column fields and preserves the original source identity', () => {
    const s = new GC.Spread.Sheets.Worksheet(), records = [{ person: { name: 'Alice' } }];
    s.bindColumns([{ name: 'person.name' }]); s.setDataSource(records); expect(s.getValue(0, 0)).toBe('Alice');
    s.setValue(0, 0, 'Bob'); expect(records[0].person.name).toBe('Bob'); expect(s.getDataSource()).toBe(records);
  });
});

it('binds tables to nested record collections and writes through column fields', () => {
  const s = new GC.Spread.Sheets.Worksheet(), source = { rows: [{ name: 'A', age: 30 }, { name: 'B', age: 40 }] };
  const table = s.tables.add('People', 0, 0, 2, 2); table.bindingPath('rows');
  s.setDataSource(new GC.Spread.Sheets.Bindings.CellBindingSource(source));
  expect(table.range()).toMatchObject({ row: 0, col: 0, rowCount: 3, colCount: 2 });
  expect(s.getArray(0, 0, 3, 2)).toEqual([['name', 'age'], ['A', 30], ['B', 40]]);
  s.setValue(1, 1, 35); expect(source.rows[0].age).toBe(35);
});

it('restores cached formula-chart values and calculation errors as displayable values', () => {
  const s = new GC.Spread.Sheets.Workbook().getActiveSheet(); s.setArray(0, 0, [[1], [3], [2]]);
  s.setFormula(0, 2, 'COLUMNSPARKLINE(A1:A3,0)'); s.setFormula(1, 2, 'BC_QRCODE("hello")');
  const json = JSON.parse(JSON.stringify(s.toJSON())); const restored = new GC.Spread.Sheets.Worksheet(); restored.fromJSON(json);
  expect(restored.getText(0, 2)).toBe(''); expect(restored.getText(1, 2)).toBe('#NAME?');
  expect((restored.getValue(0, 2) as { value: { values: number[][] } }).value.values).toEqual([[1], [3], [2]]);
});

it('recalculates formulas from a live table binding after external record changes', () => {
  const wb = new GC.Spread.Sheets.Workbook(), s = wb.getActiveSheet(), records = [{ amount: 2 }, { amount: 4 }];
  const table = s.tables.add('BoundValues', 0, 0, 3, 1);
  table.bind([new GC.Spread.Sheets.Tables.TableColumn(1, 'amount', 'Amount')], undefined, records);
  s.setFormula(4, 0, 'SUM(A2:A3)'); expect(s.getValue(4, 0)).toBe(6);
  records[0].amount = 8; wb.calculate(); expect(s.getValue(4, 0)).toBe(12);
});
