/**
 * `Table.insertColumns` / `deleteColumns` / `insertRows` / `deleteRows` and the
 * `TableStyle` value record. Every expectation below is the official 19.2.5
 * trial's answer, observed through the public API by the black-box probe
 * (.probe/api-sweep-probe.mjs; probes f40ba-name-a1, f40c-*, f40d-*, f40e-*,
 * f40g-footer, f40h-name-decide2, f40af-*, f40yd-*, f40-tablestyle-shape).
 */
import { describe, expect, it } from 'vitest';
import GC from '../src/index.js';
import { Worksheet } from '../src/worksheet.js';
import { TableStyle, TableThemes } from '../src/features/tables.js';

function sheetWith(values: (string | number | boolean | null)[][]): Worksheet {
  const sheet = new Worksheet('Tables');
  for (let r = 0; r < values.length; r++) for (let c = 0; c < values[r].length; c++) if (values[r][c] !== null) sheet.setValue(r, c, values[r][c] as never);
  return sheet;
}
type TableJSON = { columns?: { id: number; name: string }[] };
const columnNames = (table: ReturnType<Worksheet['tables']['add']>): (string | undefined)[] | undefined =>
  (table.toJSON() as TableJSON).columns?.map((c) => c.name);
const columnsOf = (table: ReturnType<Worksheet['tables']['add']>): [number, string][] =>
  ((table.toJSON() as TableJSON).columns ?? []).map((column) => [column.id as number, String(column.name)]);
const cells = (sheet: Worksheet, rows: number[], cols: number[]): unknown[][] =>
  rows.map((r) => cols.map((c) => sheet.getValue(r, c)));
const rangeOf = (table: ReturnType<Worksheet['tables']['add']>): [number, number, number, number] => {
  const range = table.range();
  return [range.row, range.col, range.rowCount, range.colCount];
};
const COLS_0_5 = [0, 1, 2, 3, 4, 5];
const ROWS_0_5 = [0, 1, 2, 3, 4, 5];

describe('Table.insertColumns', () => {
  it('inserts a column inside the table band, shifting the band cells right', () => {
    const sheet = sheetWith([
      [0, 1, 2],
      [10, 11, 12],
      [20, 21, 22],
      [30, 31, 32],
    ]);
    const table = sheet.tables.add('T', 0, 0, 4, 3);
    table.insertColumns(1, 2);
    expect(rangeOf(table)).toEqual([0, 0, 4, 5]);
    expect(cells(sheet, [0, 1, 2, 3], COLS_0_5)).toEqual([
      ['0', '02', '3', '1', '2', null],
      [10, null, null, 11, 12, null],
      [20, null, null, 21, 22, null],
      [30, null, null, 31, 32, null],
    ]);
  });

  it('auto-names the inserted blank columns like the trial (numeric headers)', () => {
    const sheet = sheetWith([
      [0, 1, 2],
      [10, 11, 12],
      [20, 21, 22],
      [30, 31, 32],
    ]);
    const table = sheet.tables.add('T', 0, 0, 4, 3);
    table.insertColumns(1, 1);
    expect(columnsOf(table)).toEqual([[1, '0'], [4, '02'], [2, '1'], [3, '2']]);
    // A second operation continues the trial's chain from the blank `02`.
    table.insertColumns(1, 2);
    expect(columnsOf(table)).toEqual([[1, '0'], [5, '03'], [6, '4'], [4, '02'], [2, '1'], [3, '2']]);
    expect(cells(sheet, [0], COLS_0_5)).toEqual([['0', '03', '4', '02', '1', '2']]);
  });

  it('continues a blank chain from the left neighbour (probe f40h)', () => {
    const sheet = sheetWith([
      [1, 2, 3],
      [4, 5, 6],
      [7, 8, 9],
      [10, 11, 12],
    ]);
    const table = sheet.tables.add('T', 0, 0, 4, 3);
    table.insertColumns(1, 1);
    expect(columnNames(table)).toEqual(['1', '12', '2', '3']);
    table.insertColumns(2, 2);
    expect(columnNames(table)).toEqual(['1', '12', '13', '14', '2', '3']);
  });

  it('appends the left column number on a tail insert (probe f40c cells2)', () => {
    const sheet = sheetWith([
      [0, 1, 2],
      [10, 11, 12],
      [20, 21, 22],
      [30, 31, 32],
    ]);
    const table = sheet.tables.add('T', 0, 0, 4, 3);
    table.insertColumns(1, 2);
    table.insertColumns(4, 1, true);
    expect(columnNames(table)).toEqual(['0', '02', '3', '1', '2', '22']);
  });

  it('uses the `Column…` counter for text and blank headers (probes f40d/f40e)', () => {
    const sheet = sheetWith([
      ['A', 'B', 'C'],
      [1, 2, 3],
      [4, 5, 6],
      [7, 8, 9],
    ]);
    const table = sheet.tables.add('T', 0, 0, 4, 3);
    table.insertColumns(1, 2);
    expect(columnsOf(table)).toEqual([[1, 'A'], [4, 'Column1'], [5, 'Column2'], [2, 'B'], [3, 'C']]);
    expect(cells(sheet, [0, 1], COLS_0_5)).toEqual([
      ['A', 'Column1', 'Column2', 'B', 'C', null],
      [1, null, null, 2, 3, null],
    ]);
  });

  it('continues an existing `Column<n>` counter (probe f40w-blank-num2 fresh table)', () => {
    const sheet = new Worksheet('Empty headers');
    const table = sheet.tables.add('T', 0, 0, 4, 3);
    expect(columnNames(table)).toEqual(['Column1', 'Column2', 'Column3']);
    table.insertColumns(1, 2);
    expect(columnNames(table)).toEqual(['Column1', 'Column12', 'Column13', 'Column2', 'Column3']);
  });

  it('shortens the base on a name collision (probe f40ba D/E)', () => {
    const sheet = new Worksheet('Dup headers');
    const table = sheet.tables.add('T', 12, 0, 4, 3);
    for (let r = 12; r < 16; r++) for (let c = 0; c < 3; c++) sheet.setValue(r, c, (r - 11) * 10);
    table.insertColumns(1, 1);
    expect(columnNames(table)).toEqual(['10', '11', '102', '103']);
    expect(cells(sheet, [12], [0, 1, 2, 3])).toEqual([['10', '11', '102', '103']]);
  });

  it('writes the new names into the header row', () => {
    const sheet = sheetWith([
      ['A', 'B', 'C'],
      [1, 2, 3],
      [4, 5, 6],
      [7, 8, 9],
    ]);
    const table = sheet.tables.add('T', 0, 0, 4, 3);
    table.insertColumns(1, 1);
    expect(cells(sheet, [0], [0, 1, 2, 3])).toEqual([['A', 'Column1', 'B', 'C']]);
  });

  it('rejects bounds like the trial', () => {
    const sheet = sheetWith([
      [0, 1, 2],
      [10, 11, 12],
      [20, 21, 22],
      [30, 31, 32],
    ]);
    const table = sheet.tables.add('T', 0, 0, 4, 3);
    expect(() => table.insertColumns(3, 1)).toThrow('The param col out of data range of table.');
    expect(() => table.insertColumns(-1, 1)).toThrow('The param col out of data range of table.');
    expect(() => table.insertColumns(9, 1)).toThrow('The param col out of data range of table.');
    // A non-numeric string reads as 0 (trial coercion), and a zero count is a no-op.
    table.insertColumns('a' as unknown as number, 0);
    expect(rangeOf(table)).toEqual([0, 0, 4, 3]);
  });

  it('refuses an insert that would move cells of a neighbouring table band', () => {
    const sheet = sheetWith([
      ['A', 'B', 'C'],
      [1, 2, 3],
      [4, 5, 6],
      [7, 8, 9],
    ]);
    const table = sheet.tables.add('T', 0, 0, 4, 3);
    // A second table directly right of the first band blocks the shift.
    sheet.tables.add('U', 0, 3, 4, 3);
    expect(() => table.insertColumns(1, 1)).toThrow("This won't work because it would move cells in a table on your worksheet.");
  });
});

describe('Table.deleteColumns', () => {
  it('removes the columns and shifts the band cells left', () => {
    const sheet = sheetWith([
      [0, 1, 2],
      [10, 11, 12],
      [20, 21, 22],
      [30, 31, 32],
    ]);
    const table = sheet.tables.add('T', 0, 0, 4, 3);
    table.deleteColumns(1, 1);
    expect(rangeOf(table)).toEqual([0, 0, 4, 2]);
    expect(columnsOf(table)).toEqual([[1, '0'], [3, '2']]);
    expect(cells(sheet, [0, 1, 2, 3], [0, 1, 2, 3])).toEqual([
      ['0', '2', null, null],
      [10, 12, null, null],
      [20, 22, null, null],
      [30, 32, null, null],
    ]);
  });

  it('clamps an overshooting count to the remaining columns (probe f40w-del-cols A)', () => {
    const sheet = sheetWith([
      [0, 1, 2],
      [10, 11, 12],
      [20, 21, 22],
      [30, 31, 32],
    ]);
    const table = sheet.tables.add('T', 0, 0, 4, 3);
    table.deleteColumns(1, 9);
    expect(rangeOf(table)).toEqual([0, 0, 4, 1]);
    expect(cells(sheet, [0, 1, 2, 3], [0, 1, 2, 3])).toEqual([
      ['0', null, null, null],
      [10, null, null, null],
      [20, null, null, null],
      [30, null, null, null],
    ]);
  });

  it('throws the trial errors for the emptying and out-of-range cases', () => {
    const sheet = sheetWith([
      [0, 1, 2],
      [10, 11, 12],
      [20, 21, 22],
      [30, 31, 32],
    ]);
    const table = sheet.tables.add('T', 0, 0, 4, 3);
    expect(() => table.deleteColumns(0, 3)).toThrow('The param count to delete will cause empty table.');
    expect(() => table.deleteColumns(4, 1)).toThrow('The param col out of data range of table.');
    expect(() => table.deleteColumns(-1, 1)).toThrow('The param col out of data range of table.');
    expect(rangeOf(table)).toEqual([0, 0, 4, 3]);
  });
});

describe('Table.insertRows / Table.deleteRows', () => {
  it('inserts rows inside the band, shifting the band cells down', () => {
    const sheet = sheetWith([
      [0, 1, 2],
      [10, 11, 12],
      [20, 21, 22],
      [30, 31, 32],
    ]);
    const table = sheet.tables.add('T', 0, 0, 4, 3);
    table.insertRows(1, 2);
    expect(rangeOf(table)).toEqual([0, 0, 6, 3]);
    expect(cells(sheet, [0, 1, 2, 3, 4, 5], [0, 1, 2])).toEqual([
      ['0', '1', '2'],
      [10, 11, 12],
      [null, null, null],
      [null, null, null],
      [20, 21, 22],
      [30, 31, 32],
    ]);
  });

  it('deletes band rows and shifts the remaining cells up (probes f40af)', () => {
    const sheet = sheetWith([
      [0, 1, 2],
      [10, 11, 12],
      [20, 21, 22],
      [30, 31, 32],
    ]);
    const table = sheet.tables.add('T', 0, 0, 4, 3);
    table.deleteRows(1, 1);
    expect(rangeOf(table)).toEqual([0, 0, 3, 3]);
    expect(cells(sheet, [0, 1, 2, 3, 4], [0, 1, 2])).toEqual([
      ['0', '1', '2'],
      [10, 11, 12],
      [30, 31, 32],
      [null, null, null],
      [null, null, null],
    ]);
    table.deleteRows(0, 1);
    expect(cells(sheet, [0, 1, 2, 3, 4], [0, 1, 2])).toEqual([
      ['0', '1', '2'],
      [30, 31, 32],
      [null, null, null],
      [null, null, null],
      [null, null, null],
    ]);
  });

  it('clamps deleteRows to the data rows that exist (probes f40af-pos6-r1c3 / r2c2)', () => {
    const sheet = new Worksheet('Deep');
    for (let r = 6; r < 10; r++) for (let c = 0; c < 3; c++) sheet.setValue(r, c, r * 10 + c);
    const table = sheet.tables.add('T', 6, 0, 4, 3);
    table.deleteRows(1, 3);
    expect(cells(sheet, [6, 7, 8, 9, 10], [0, 1, 2])).toEqual([
      ['60', '61', '62'],
      [70, 71, 72],
      [null, null, null],
      [null, null, null],
      [null, null, null],
    ]);
    const sheet2 = new Worksheet('Deep2');
    for (let r = 6; r < 10; r++) for (let c = 0; c < 3; c++) sheet2.setValue(r, c, r * 10 + c);
    const table2 = sheet2.tables.add('U', 6, 0, 4, 3);
    table2.deleteRows(2, 2);
    expect(cells(sheet2, [6, 7, 8, 9, 10], [0, 1, 2])).toEqual([
      ['60', '61', '62'],
      [70, 71, 72],
      [80, 81, 82],
      [null, null, null],
      [null, null, null],
    ]);
  });

  it('rejects row arguments outside the table like the trial', () => {
    const sheet = sheetWith([
      [0, 1, 2],
      [10, 11, 12],
      [20, 21, 22],
      [30, 31, 32],
    ]);
    const table = sheet.tables.add('T', 0, 0, 4, 3);
    expect(() => table.insertRows(4, 1)).toThrow('The param row out of data range of table.');
    expect(() => table.insertRows(-2, 1)).toThrow('The param row out of data range of table.');
    expect(() => table.deleteRows(3, 1)).toThrow('The param row out of data range of table.');
    table.deleteRows(1, 9);
    expect(rangeOf(table)).toEqual([0, 0, 2, 3]);
  });

  it('keeps the footer row correct when a footer table gains rows (probe f40g-footer)', () => {
    const sheet = sheetWith([
      ['A', 'B', 'C'],
      [1, 2, 3],
      [4, 5, 6],
      [7, 8, 9],
    ]);
    const table = sheet.tables.add('T', 0, 0, 4, 3);
    table.showFooter(true);
    expect(rangeOf(table)).toEqual([0, 0, 5, 3]);
    table.insertRows(1, 2);
    expect(rangeOf(table)).toEqual([0, 0, 7, 3]);
    expect(table.footerIndex()).toBe(6);
    expect(cells(sheet, ROWS_0_5.concat([6, 7]), [0, 1])).toEqual([
      ['A', 'B'],
      [1, 2],
      [null, null],
      [null, null],
      [4, 5],
      [7, 8],
      [null, null],
      [null, null],
    ]);
  });

  it('serialises the mutated table through toJSON', () => {
    const sheet = sheetWith([
      [0, 1, 2],
      [10, 11, 12],
      [20, 21, 22],
      [30, 31, 32],
    ]);
    const table = sheet.tables.add('T', 0, 0, 4, 3, TableThemes.medium2 as never);
    table.showFooter(true);
    table.insertColumns(1, 1);
    table.insertRows(2, 1);
    table.deleteColumns(2, 1);
    table.deleteRows(1, 1);
    const sheetJson = sheet.toJSON() as { objects?: { tables?: { columns: { id: number; name: string }[]; rowCount: number }[] }, tables?: { columns: { id: number; name: string }[]; rowCount: number }[] };
    const json = (sheetJson.objects?.tables ?? sheetJson.tables ?? []) as { columns: { id: number; name: string }[]; rowCount: number }[];
    // Trial value (probe f40c-json-roundtrip): the surviving columns keep their
    // ids and the auto-name `02`; the table keeps header + 3 data rows + footer.
    expect(json[0].columns.map((c) => [c.id, c.name])).toEqual([[1, '0'], [4, '02'], [3, '2']]);
    expect(json[0].rowCount).toBe(5);
  });
});

describe('TableStyle value record (trial shape)', () => {
  const border = new GC.Spread.Sheets.LineBorder('green', 1);
  it('keeps the nine color/border/decoration slots as own fields, null when unset', () => {
    const style = new TableStyle();
    expect(Object.keys(style)).toEqual([
      'backColor',
      'foreColor',
      'borderLeft',
      'borderTop',
      'borderRight',
      'borderBottom',
      'borderHorizontal',
      'borderVertical',
      'textDecoration',
    ]);
    expect(style.backColor).toBeNull();
    expect(style.foreColor).toBeNull();
    expect(style.borderLeft).toBeNull();
    expect(style.textDecoration).toBeNull();
    expect(style.toJSON()).toEqual({});
  });

  it('exposes the font members through the prototype, never as own keys', () => {
    const style = new TableStyle('aliceblue', 'green', 'bold 10pt arial', border, border, border, border, border, border, 3);
    for (const key of ['font', 'fontStyle', 'fontWeight', 'fontSize', 'fontFamily'])
      expect(Object.hasOwn(TableStyle.prototype, key)).toBe(true);
    expect(style.font).toBe('bold 10pt arial');
    expect(style.fontWeight).toBe('bold');
    expect(style.fontSize).toBe('10pt');
    expect(style.fontFamily).toBe('arial');
    expect(Object.hasOwn(style, 'font')).toBe(false);
    expect(style.fontStyle).toBeNull();
  });

  it('lets the font shorthand win over explicit font arguments and drops fontStyle', () => {
    const style = new TableStyle(
      'aliceblue',
      'green',
      'bold 10pt arial',
      border,
      border,
      border,
      border,
      border,
      border,
      3,
      'italic',
      'bold',
      '10pt',
      'Arial',
    );
    expect(style.fontFamily).toBe('arial');
    expect(style.fontStyle).toBeNull();
  });

  it('serialises the trial key order with font last', () => {
    const style = new TableStyle('aliceblue', 'green', 'bold 10pt arial', border, border, border, border, border, border, 3);
    expect(Object.keys(style.toJSON() as object)).toEqual([
      'backColor',
      'foreColor',
      'borderLeft',
      'borderTop',
      'borderRight',
      'borderBottom',
      'borderHorizontal',
      'borderVertical',
      'textDecoration',
      'fontWeight',
      'fontSize',
      'fontFamily',
      'font',
    ]);
    const round = new TableStyle();
    round.fromJSON(style.toJSON());
    expect(round.backColor).toBe('aliceblue');
    expect(round.font).toBe('bold 10pt arial');
    expect(round.borderLeft).toMatchObject({ color: 'green', style: 1 });
  });
});
