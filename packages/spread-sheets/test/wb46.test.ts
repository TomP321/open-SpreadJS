/**
 * TASK 46 item 2 + item 5 tests: Workbook.defaultPivotTableTheme/defaultSlicerTheme/
 * defaultTimelineTheme/pageInfo, Worksheet.autoMerge/fillAuto and Workbook.injectAI,
 * plus PivotTable add/get/removeConditionalRule and the PivotTableStyle data members.
 *
 * The fillAuto/autoMerge/pageInfo/theme expectations were captured from the official
 * trial through its public API (.probe/api-sweep-probe.mjs segments am46c/fa46c/fa46d/
 * fa46e/print46d + pv:themes) with matching black-box results on both sides. The trial
 * core only exposes the theme accessors and pageInfo after its pivot/print add-ons
 * attach, and has no injectAI at all; the pivot conditional-rule members run inside
 * the official pivot add-on, whose UMD init fails in the probe harness. Those members
 * are implemented from the public d.ts contract and the trial observations recorded in
 * docs/STATUS.md (TASK 46 item 2/5 sections).
 */
import { describe, expect, it } from 'vitest';
import GC, { Spread } from '../src/index.js';
import type { Worksheet } from '../src/worksheet.js';
import { PivotTableStyle, PivotTableTheme } from '../src/pivot/theme.js';

const { Workbook, Worksheet: WorksheetCtor, Range, Style, LineBorder } = Spread.Sheets;
const AutoMerge = Spread.Sheets.AutoMerge as unknown as {
  AutoMergeDirection: Record<string, number>;
  AutoMergeMode: Record<string, number>;
  SelectionMode: Record<string, number>;
};
const Pivot = GC.Spread.Pivot;
const ConditionalFormatting = Spread.Sheets.ConditionalFormatting;

/* ---------------------------------------------------------------- fillAuto */

describe('Worksheet.fillAuto (trial-matched rules)', () => {
  interface Case {
    name: string;
    start: [number, number, number, number];
    whole: [number, number, number, number];
    opts: { fillType?: number; series?: number; direction?: number };
    setup: (s: Worksheet) => void;
    values: unknown[][];
    formulas?: string[];
  }
  const date = (day: number) => new Date(2020, 0, day);
  const cases: Case[] = [
    { name: 'num12', start: [0, 0, 2, 1], whole: [0, 0, 6, 1], opts: { fillType: 4, series: 0, direction: 3 }, setup: s => { s.setValue(0, 0, 1); s.setValue(1, 0, 2); }, values: [[1], [2], [3], [4], [5], [6]] },
    { name: 'num13', start: [0, 0, 2, 1], whole: [0, 0, 5, 1], opts: { fillType: 4, series: 0, direction: 3 }, setup: s => { s.setValue(0, 0, 1); s.setValue(1, 0, 3); }, values: [[1], [3], [5], [7], [9]] },
    { name: 'num3', start: [0, 0, 3, 1], whole: [0, 0, 6, 1], opts: { fillType: 4, series: 0, direction: 3 }, setup: s => { s.setValue(0, 0, 1); s.setValue(1, 0, 2); s.setValue(2, 0, 3); }, values: [[1], [2], [3], [4], [5], [6]] },
    { name: 'num9', start: [0, 0, 2, 1], whole: [0, 0, 4, 1], opts: { fillType: 4, series: 0, direction: 3 }, setup: s => { s.setValue(0, 0, 9); s.setValue(1, 0, 10); }, values: [[9], [10], [11], [12]] },
    { name: 'single7', start: [0, 0, 1, 1], whole: [0, 0, 4, 1], opts: { fillType: 4, series: 0, direction: 3 }, setup: s => s.setValue(0, 0, 7), values: [[7], [8], [9], [10]] },
    { name: 'zeroStep', start: [0, 0, 2, 1], whole: [0, 0, 5, 1], opts: { fillType: 4, series: 0, direction: 3 }, setup: s => { s.setValue(0, 0, 3); s.setValue(1, 0, 3); }, values: [[3], [3], [3], [3], [3]] },
    { name: 'linear', start: [0, 0, 2, 1], whole: [0, 0, 5, 1], opts: { fillType: 1, series: 0, direction: 3 }, setup: s => { s.setValue(0, 0, 1); s.setValue(1, 0, 2); }, values: [[1], [2], [3], [4], [5]] },
    { name: 'growth', start: [0, 0, 2, 1], whole: [0, 0, 4, 1], opts: { fillType: 2, series: 0, direction: 3 }, setup: s => { s.setValue(0, 0, 1); s.setValue(1, 0, 2); }, values: [[1], [2], [4], [8]] },
    { name: 'growth3', start: [0, 0, 3, 1], whole: [0, 0, 5, 1], opts: { fillType: 2, series: 0, direction: 3 }, setup: s => { s.setValue(0, 0, 2); s.setValue(1, 0, 4); s.setValue(2, 0, 8); }, values: [[2], [4], [8], [16], [32]] },
    { name: 'date12', start: [0, 0, 2, 1], whole: [0, 0, 5, 1], opts: { fillType: 4, series: 0, direction: 3 }, setup: s => { s.setValue(0, 0, date(2)); s.setValue(1, 0, date(3)); }, values: [[date(2)], [date(3)], [date(4)], [date(5)], [date(6)]] },
    { name: 'dateW', start: [0, 0, 2, 1], whole: [0, 0, 4, 1], opts: { fillType: 4, series: 0, direction: 3 }, setup: s => { s.setValue(0, 0, date(2)); s.setValue(1, 0, date(9)); }, values: [[date(2)], [date(9)], [date(16)], [date(23)]] },
    { name: 'dates3', start: [0, 0, 3, 1], whole: [0, 0, 6, 1], opts: { fillType: 4, series: 0, direction: 3 }, setup: s => { s.setValue(0, 0, date(2)); s.setValue(1, 0, date(4)); s.setValue(2, 0, date(6)); }, values: [[date(2)], [date(4)], [date(6)], [date(8)], [date(10)], [date(12)]] },
    { name: 'singleDate', start: [0, 0, 1, 1], whole: [0, 0, 4, 1], opts: { fillType: 4, series: 0, direction: 3 }, setup: s => s.setValue(0, 0, date(2)), values: [[date(2)], [date(3)], [date(4)], [date(5)]] },
    { name: 'dateFillCopiesFirst', start: [0, 0, 2, 1], whole: [0, 0, 4, 1], opts: { fillType: 3, series: 0, direction: 3 }, setup: s => { s.setValue(0, 0, date(2)); s.setValue(1, 0, date(3)); }, values: [[date(2)], [date(2)], [date(2)], [date(2)]] },
    { name: 'dirDownCopiesFirst', start: [0, 0, 2, 1], whole: [0, 0, 5, 1], opts: { fillType: 0, series: 0, direction: 3 }, setup: s => { s.setValue(0, 0, 1); s.setValue(1, 0, 2); }, values: [[1], [1], [1], [1], [1]] },
    { name: 'item12', start: [0, 0, 2, 1], whole: [0, 0, 4, 1], opts: { fillType: 4, series: 0, direction: 3 }, setup: s => { s.setValue(0, 0, 'Item 1'); s.setValue(1, 0, 'Item 2'); }, values: [['Item 1'], ['Item 2'], ['Item 3'], ['Item 4']] },
    { name: 'item001', start: [0, 0, 2, 1], whole: [0, 0, 4, 1], opts: { fillType: 4, series: 0, direction: 3 }, setup: s => { s.setValue(0, 0, 'Item 001'); s.setValue(1, 0, 'Item 002'); }, values: [['Item 001'], ['Item 002'], ['Item 003'], ['Item 004']] },
    { name: 'singleItem', start: [0, 0, 1, 1], whole: [0, 0, 4, 1], opts: { fillType: 4, series: 0, direction: 3 }, setup: s => s.setValue(0, 0, 'Item 1'), values: [['Item 1'], ['Item 2'], ['Item 3'], ['Item 4']] },
    { name: 'textDelta', start: [0, 0, 2, 1], whole: [0, 0, 4, 1], opts: { fillType: 4, series: 0, direction: 3 }, setup: s => { s.setValue(0, 0, 'a1'); s.setValue(1, 0, 'a2'); }, values: [['a1'], ['a2'], ['a3'], ['a4']] },
    { name: 'mixCopy', start: [0, 0, 2, 1], whole: [0, 0, 4, 1], opts: { fillType: 4, series: 0, direction: 3 }, setup: s => { s.setValue(0, 0, 'a1'); s.setValue(1, 0, 'a1'); }, values: [['a1'], ['a1'], ['a1'], ['a1']] },
    { name: 'txtCopy', start: [0, 0, 2, 1], whole: [0, 0, 3, 1], opts: { fillType: 4, series: 0, direction: 3 }, setup: s => { s.setValue(0, 0, 'same'); s.setValue(1, 0, 'same'); }, values: [['same'], ['same'], ['same']] },
    { name: 'fooBarRepeats', start: [0, 0, 2, 1], whole: [0, 0, 4, 1], opts: { fillType: 4, series: 0, direction: 3 }, setup: s => { s.setValue(0, 0, 'foo'); s.setValue(1, 0, 'bar'); }, values: [['foo'], ['bar'], ['foo'], ['bar']] },
    { name: 'months', start: [0, 0, 2, 1], whole: [0, 0, 5, 1], opts: { fillType: 4, series: 0, direction: 3 }, setup: s => { s.setValue(0, 0, 'Jan'); s.setValue(1, 0, 'Feb'); }, values: [['Jan'], ['Feb'], ['Mar'], ['Apr'], ['May']] },
    { name: 'singleMonth', start: [0, 0, 1, 1], whole: [0, 0, 4, 1], opts: { fillType: 4, series: 0, direction: 3 }, setup: s => s.setValue(0, 0, 'Jan'), values: [['Jan'], ['Feb'], ['Mar'], ['Apr']] },
    { name: 'monthWrap', start: [0, 0, 2, 1], whole: [0, 0, 5, 1], opts: { fillType: 4, series: 0, direction: 3 }, setup: s => { s.setValue(0, 0, 'Nov'); s.setValue(1, 0, 'Dec'); }, values: [['Nov'], ['Dec'], ['Jan'], ['Feb'], ['Mar']] },
    { name: 'dayWrap', start: [0, 0, 2, 1], whole: [0, 0, 4, 1], opts: { fillType: 4, series: 0, direction: 3 }, setup: s => { s.setValue(0, 0, 'Friday'); s.setValue(1, 0, 'Saturday'); }, values: [['Friday'], ['Saturday'], ['Sunday'], ['Monday']] },
    { name: 'quarter', start: [0, 0, 2, 1], whole: [0, 0, 4, 1], opts: { fillType: 4, series: 0, direction: 3 }, setup: s => { s.setValue(0, 0, 'Q1'); s.setValue(1, 0, 'Q2'); }, values: [['Q1'], ['Q2'], ['Q3'], ['Q4']] },
    { name: 'across', start: [0, 0, 1, 2], whole: [0, 0, 1, 4], opts: { fillType: 4, series: 1, direction: 1 }, setup: s => { s.setValue(0, 0, 1); s.setValue(0, 1, 2); }, values: [[1, 2, 3, 4]] },
    { name: 'up', start: [2, 0, 2, 1], whole: [0, 0, 4, 1], opts: { fillType: 4, series: 0, direction: 2 }, setup: s => { s.setValue(2, 0, 3); s.setValue(3, 0, 4); }, values: [[1], [2], [3], [4]] },
    { name: 'left', start: [0, 2, 1, 2], whole: [0, 0, 1, 4], opts: { fillType: 4, series: 1, direction: 0 }, setup: s => { s.setValue(0, 2, 3); s.setValue(0, 3, 4); }, values: [[1, 2, 3, 4]] },
    { name: 'multiCol', start: [0, 0, 2, 2], whole: [0, 0, 4, 2], opts: { fillType: 4, series: 0, direction: 3 }, setup: s => { s.setValue(0, 0, 1); s.setValue(1, 0, 2); s.setValue(0, 1, 10); s.setValue(1, 1, 20); }, values: [[1, 10], [2, 20], [3, 30], [4, 40]] },
    { name: 'bothInvalidSeries', start: [0, 0, 2, 2], whole: [0, 0, 4, 2], opts: { fillType: 4, series: undefined as never, direction: 3 }, setup: s => { s.setValue(0, 0, 1); s.setValue(1, 0, 2); s.setValue(0, 1, 3); s.setValue(1, 1, 4); }, values: [[1, 3], [2, 4], [3, 5], [4, 6]] },
    { name: 'mixedTypesNoFill', start: [0, 0, 2, 1], whole: [2, 0, 2, 1], opts: { fillType: 4, series: 0, direction: 3 }, setup: s => { s.setValue(0, 0, 5); s.setValue(1, 0, 'x'); }, values: [[null], [null]] },
    { name: 'invalidFillType', start: [0, 0, 2, 1], whole: [0, 0, 5, 1], opts: { fillType: 9, series: 0, direction: 3 }, setup: s => { s.setValue(0, 0, 1); s.setValue(1, 0, 2); }, values: [[1], [2], [null], [null], [null]] },
    { name: 'invalidSeriesFillsAsColumn', start: [0, 0, 2, 1], whole: [0, 0, 5, 1], opts: { fillType: 4, series: 99, direction: 3 }, setup: s => { s.setValue(0, 0, 1); s.setValue(1, 0, 2); }, values: [[1], [2], [3], [4], [5]] },
    { name: 'invalidDirection', start: [0, 0, 2, 1], whole: [0, 0, 5, 1], opts: { fillType: 4, series: 0, direction: 99 }, setup: s => { s.setValue(0, 0, 1); s.setValue(1, 0, 2); }, values: [[1], [2], [null], [null], [null]] },
    { name: 'disjointWhole', start: [0, 0, 2, 1], whole: [2, 0, 3, 1], opts: { fillType: 4, series: 0, direction: 3 }, setup: s => { s.setValue(0, 0, 1); s.setValue(1, 0, 2); }, values: [[null], [null], [null]] },
    { name: 'wholeInsideStart', start: [0, 0, 3, 1], whole: [1, 0, 1, 1], opts: { fillType: 4, series: 0, direction: 3 }, setup: s => { s.setValue(0, 0, 1); s.setValue(1, 0, 2); s.setValue(2, 0, 3); }, values: [[2]] }, // trial: nothing changes inside the start range
    {
      name: 'formulaClean',
      start: [0, 0, 2, 1], whole: [0, 0, 6, 1], opts: { fillType: 4, series: 0, direction: 3 },
      setup: s => { s.setValue(0, 0, 1); s.setFormula(1, 0, '=A1+1'); },
      values: [[1], [2], [2], [3], [3], [4]],
      formulas: [null, 'A1+1', null, 'A3+1', null, 'A5+1'] as never,
    },
    {
      name: 'formula3',
      start: [0, 0, 3, 1], whole: [0, 0, 6, 1], opts: { fillType: 4, series: 0, direction: 3 },
      setup: s => { s.setValue(0, 0, 1); s.setValue(1, 0, 2); s.setFormula(2, 0, '=A1+A2'); },
      values: [[1], [2], [3], [3], [4], [7]],
      formulas: [null, null, 'A1+A2', null, null, 'A4+A5'] as never,
    },
  ];

  for (const c of cases)
    it(`${c.name}: fills exactly like the trial`, () => {
      const wb = new Workbook();
      const s = wb.getSheet(0);
      c.setup(s);
      s.fillAuto(new Range(c.start[0], c.start[1], c.start[2], c.start[3]),
        new Range(c.whole[0], c.whole[1], c.whole[2], c.whole[3]), c.opts);
      const row0 = c.whole[0], col0 = c.whole[1];
      const got = c.values.map((row, r) => row.map((_, col) => s.getValue(row0 + r, col0 + col)));
      expect(got).toEqual(c.values);
      if (c.formulas)
        expect(c.values.map((row, r) => s.getFormula(row0 + r, col0))).toEqual(c.formulas);
    });

  it('formats filled dates like the trial (getText "1/4/2020")', () => {
    const s = new WorksheetCtor('FillDates');
    s.setValue(0, 0, new Date(2020, 0, 2));
    s.setValue(1, 0, new Date(2020, 0, 3));
    s.fillAuto(new Range(0, 0, 2, 1), new Range(0, 0, 5, 1), { fillType: 4, series: 0, direction: 3 });
    expect(s.getText(2, 0)).toBe('1/4/2020');
    expect(s.getText(3, 0)).toBe('1/5/2020');
    expect(s.getText(4, 0)).toBe('1/6/2020');
  });
});

/* ---------------------------------------------------------------- autoMerge */

describe('Worksheet.autoMerge (trial-matched semantics)', () => {
  const fill4 = (s: Worksheet) => {
    for (let r = 0; r < 4; r++) {
      s.setValue(r, 0, r < 2 ? 'X' : 'Y');
      s.setValue(r, 1, r < 2 ? 'P' : 'Q');
    }
  };
  it('records the request with the trial defaults and returns undefined', () => {
    const s = new WorksheetCtor('AM');
    fill4(s);
    expect(s.autoMerge(new Range(0, 0, 4, 2))).toBeUndefined();
    expect(s.getSpans()).toEqual([]); // trial: no real spans are created
    expect(s.toJSON().autoMergeRangeInfos).toEqual([
      { range: { row: 0, col: 0, rowCount: 4, colCount: 2 }, direction: 1, mode: 0, sheetArea: 3, selectionMode: 0 },
    ]);
  });
  it('stores explicit direction/mode/sheetArea/selectionMode like the trial', () => {
    const variants: [string, number, number, number, number][] = [
      ['column', AutoMerge.AutoMergeDirection.column, AutoMerge.AutoMergeMode.free, 3, 0],
      ['row', AutoMerge.AutoMergeDirection.row, AutoMerge.AutoMergeMode.free, 3, 0],
      ['columnRow', AutoMerge.AutoMergeDirection.columnRow, AutoMerge.AutoMergeMode.free, 3, 0],
      ['rowColumn', AutoMerge.AutoMergeDirection.rowColumn, AutoMerge.AutoMergeMode.free, 3, 0],
      ['restricted', AutoMerge.AutoMergeDirection.column, AutoMerge.AutoMergeMode.restricted, 3, 0],
    ];
    for (const [name, direction, mode, area, selection] of variants) {
      const s = new WorksheetCtor('AM');
      fill4(s);
      s.autoMerge(new Range(0, 0, 4, 2), direction, mode, area, selection);
      expect(s.toJSON().autoMergeRangeInfos, name).toEqual([
        { range: { row: 0, col: 0, rowCount: 4, colCount: 2 }, direction, mode, sheetArea: area, selectionMode: selection },
      ]);
    }
    const header = new WorksheetCtor('AMHeader');
    header.autoMerge(new Range(0, 0, 4, 2), AutoMerge.AutoMergeDirection.column, AutoMerge.AutoMergeMode.free, 1);
    expect((header.toJSON().autoMergeRangeInfos as Record<string, unknown>[])[0]).toMatchObject({ sheetArea: 1, selectionMode: 0 });
    const selMerged = new WorksheetCtor('AMSel');
    selMerged.autoMerge(new Range(0, 0, 4, 2), AutoMerge.AutoMergeDirection.column, AutoMerge.AutoMergeMode.free, 2, AutoMerge.SelectionMode.merged);
    expect((selMerged.toJSON().autoMergeRangeInfos as Record<string, unknown>[])[0]).toMatchObject({ sheetArea: 2, selectionMode: 1 });
  });
  it('throws the trial message when re-registering an overlapping range', () => {
    const s = new WorksheetCtor('AM');
    fill4(s);
    s.autoMerge(new Range(0, 0, 4, 2));
    expect(() => s.autoMerge(new Range(0, 0, 4, 2))).toThrow('The range should not intersect with exsit ranges.');
  });
  it('cancels intersecting entries with AutoMergeDirection.none', () => {
    const s = new WorksheetCtor('AM');
    fill4(s);
    s.autoMerge(new Range(0, 0, 4, 2));
    s.autoMerge(new Range(0, 0, 4, 2), AutoMerge.AutoMergeDirection.none);
    expect(s.toJSON().autoMergeRangeInfos).toEqual([]);
    // Cancelling without a registration does nothing (trial `none2` case).
    s.autoMerge(new Range(0, 0, 4, 2), AutoMerge.AutoMergeDirection.none);
    expect(s.toJSON().autoMergeRangeInfos).toEqual([]);
  });
  it('round-trips through fromJSON', () => {
    const wb = new Workbook();
    const s = wb.getSheet(0);
    fill4(s);
    s.autoMerge(new Range(0, 0, 4, 2), AutoMerge.AutoMergeDirection.rowColumn, AutoMerge.AutoMergeMode.restricted, 3, AutoMerge.SelectionMode.merged);
    const json = JSON.parse(JSON.stringify(wb.toJSON()));
    const wb2 = new Workbook();
    wb2.fromJSON(json);
    const s2 = wb2.getSheet(0);
    expect(s2.toJSON().autoMergeRangeInfos).toEqual(s.toJSON().autoMergeRangeInfos);
    expect(() => s2.autoMerge(new Range(1, 0, 2, 2))).toThrow('intersect');
  });
  it('requires a Range instance', () => {
    const s = new WorksheetCtor('AM');
    expect(() => s.autoMerge(undefined as never)).toThrow(TypeError);
  });
});

/* ---------------------------------------------------------------- pageInfo */

describe('Workbook.pageInfo (trial add-on values)', () => {
  it('returns { pages: [] } for an empty sheet', () => {
    const wb = new Workbook();
    expect(wb.pageInfo(0)).toEqual({ pages: [] });
    const all = wb.pageInfo() as { pages: unknown[] }[];
    expect(Array.isArray(all)).toBe(true);
    expect(all).toEqual([{ pages: [] }]);
  });
  it('paginates the used range of the given sheet', () => {
    const wb = new Workbook();
    const s = wb.getSheet(0);
    for (let r = 0; r < 40; r++) s.setValue(r, 0, r);
    expect(wb.pageInfo(0)).toEqual({ pages: [{ row: 0, column: 0, rowCount: 40, columnCount: 1 }] });
  });
  it('without an argument answers per sheet (trial active0NoArg/active1NoArg)', () => {
    const wb = new Workbook(undefined, { sheetCount: 2 });
    const s0 = wb.getSheet(0);
    for (let r = 0; r < 40; r++) s0.setValue(r, 0, r);
    const s1 = wb.getSheet(1);
    for (let r = 0; r < 5; r++) s1.setValue(r, 0, 'x' + r);
    expect(wb.pageInfo()).toEqual([
      { pages: [{ row: 0, column: 0, rowCount: 40, columnCount: 1 }] },
      { pages: [{ row: 0, column: 0, rowCount: 5, columnCount: 1 }] },
    ]);
    expect(wb.pageInfo(1)).toEqual({ pages: [{ row: 0, column: 0, rowCount: 5, columnCount: 1 }] });
  });
  it('rejects invalid sheet indexes with the trial message', () => {
    const wb = new Workbook();
    expect(() => wb.pageInfo(-1)).toThrow('Invalid  sheet index.');
    expect(() => wb.pageInfo(9)).toThrow('Invalid  sheet index.');
  });
});

/* ---------------------------------------------------- default theme accessors */

describe('Workbook default pivot/slicer/timeline themes (trial values)', () => {
  it('reads undefined before any theme is registered', () => {
    const wb = new Workbook();
    expect(wb.defaultPivotTableTheme()).toBeUndefined();
    expect(wb.defaultSlicerTheme()).toBeUndefined();
    expect(wb.defaultTimelineTheme()).toBeUndefined();
    const coreKeys = Object.keys(wb.toJSON());
    expect(coreKeys).not.toContain('defaultPivotTableStyle');
    expect(coreKeys).not.toContain('defaultSlicerStyle');
    expect(coreKeys).not.toContain('defaultTimelineStyle');
  });
  it('resolves built-in slicer style names like the trial (SlicerStyleLight2)', () => {
    const wb = new Workbook();
    wb.defaultSlicerTheme('SlicerStyleLight2');
    const style = wb.defaultSlicerTheme();
    expect(style).toBeDefined();
    expect(style!.name()).toBe('SlicerStyleLight2');
    expect((wb.toJSON() as Record<string, unknown>).defaultSlicerStyle).toBeTruthy();
  });
  it('does not resolve unregistered pivot theme names (trial PivotStyleMedium2 -> undefined)', () => {
    const wb = new Workbook();
    wb.defaultPivotTableTheme('PivotStyleMedium2');
    expect(wb.defaultPivotTableTheme()).toBeUndefined();
    wb.defaultTimelineTheme('timeline46');
    expect(wb.defaultTimelineTheme()).toBeUndefined();
  });
  it('resolves registered custom pivot theme names (d.ts custom0 flow)', () => {
    const wb = new Workbook();
    wb.customPivotTableThemes.add('custom0');
    wb.defaultPivotTableTheme('custom0');
    expect(String(wb.defaultPivotTableTheme()?.name())).toBe('custom0');
  });
  it('stores theme objects directly and round-trips them through JSON', () => {
    const wb = new Workbook();
    const theme = new PivotTableTheme();
    theme.name('objectTheme');
    wb.defaultPivotTableTheme(theme);
    expect(wb.defaultPivotTableTheme()).toBe(theme);
    wb.defaultSlicerTheme('SlicerStyleLight2');
    const json = JSON.parse(JSON.stringify(wb.toJSON()));
    expect((json.defaultPivotTableStyle as Record<string, unknown>).name).toBe('objectTheme');
    const wb2 = new Workbook();
    wb2.fromJSON(json);
    expect(String(wb2.defaultPivotTableTheme()?.name())).toBe('objectTheme');
    expect(String(wb2.defaultSlicerTheme()?.name())).toBe('SlicerStyleLight2');
  });
});

/* ------------------------------------------------ PivotTableStyle data members */

describe('PivotTableStyle data members (d.ts contract; trial runtime needs the pivot add-on)', () => {
  const members = ['backColor', 'foreColor', 'borderLeft', 'borderTop', 'borderRight', 'borderBottom', 'borderHorizontal', 'borderVertical', 'textDecoration'];
  it('reads undefined before assignment and stores own data properties after', () => {
    const style = new PivotTableStyle();
    const styleRecord = style as unknown as Record<string, unknown>;
    for (const key of members) {
      expect(styleRecord[key], key).toBeUndefined();
      expect(Object.hasOwn(style, key), key).toBe(false);
      styleRecord[key] = key === 'textDecoration' ? 2 : key;
      const descriptor = Object.getOwnPropertyDescriptor(style, key)!;
      expect(descriptor.writable, key).toBe(true);
      expect(descriptor.value, key).toBe(key === 'textDecoration' ? 2 : key);
    }
    const json = style.toJSON() as Record<string, unknown>;
    expect(json.backColor).toBe('backColor');
    expect(json.textDecoration).toBe(2);
  });
  it('round-trips through a pivot theme slot', () => {
    const theme = new PivotTableTheme();
    const style = new PivotTableStyle();
    style.backColor = '#ffff00';
    style.borderHorizontal = new LineBorder('blue', 1);
    theme.wholeTableStyle(style);
    const json = theme.toJSON() as Record<string, Record<string, unknown>>;
    expect(json.wholeTableStyle.backColor).toBe('#ffff00');
    expect((json.wholeTableStyle.borderHorizontal as Record<string, unknown>).color).toBe('blue');
    const round = new PivotTableTheme();
    round.fromJSON(json);
    expect((round.wholeTableStyle() as Record<string, unknown> | undefined)?.backColor).toBe('#ffff00');
  });
});

/* ------------------------------------------------ PivotTable conditional rules */

describe('PivotTable add/get/removeConditionalRule (d.ts contract)', () => {
  const SALES = [
    ['Buyer', 'Type', 'Amount'],
    ['Mom', 'Fuel', 74],
    ['Dad', 'Food', 58],
    ['Kelly', 'Books', 125],
  ];
  const buildPivot = () => {
    const wb = new Workbook(undefined, { sheetCount: 2 });
    const data = wb.getSheet(0);
    data.setArray(0, 0, SALES);
    data.tables.add('sourceData', 0, 0, SALES.length, 3);
    const sheet = wb.getSheet(1);
    const table = sheet.pivotTables.add('PVCF', 'sourceData', 0, 0);
    // Fields are only laid out after they are placed in an area (trial contract:
    // `pivotTable.add(sourceName, displayName, fieldType[, subtotalType])`).
    const FieldType = Pivot.PivotTableFieldType as unknown as Record<string, number>;
    const SubtotalType = Pivot.SubtotalType as unknown as Record<string, number>;
    table.add('Buyer', 'Buyer', FieldType.rowField!);
    table.add('Amount', 'Sum of Amount', FieldType.valueField!, SubtotalType.sum!);
    return { wb, sheet, table };
  };
  const makeRule = () => {
    const rule = new ConditionalFormatting.NormalConditionRule(ConditionalFormatting.RuleType.cellValueRule);
    rule.ruleType(ConditionalFormatting.RuleType.cellValueRule);
    rule.operator(ConditionalFormatting.ComparisonOperators.greaterThan);
    rule.value1(70);
    const style = new Style();
    style.backColor = 'orange';
    rule.style(style);
    return rule;
  };
  it('registers, lists and removes rules by pivot area', () => {
    const { table } = buildPivot();
    const area = { fieldName: 'Amount' };
    const rule = makeRule();
    expect(table.addConditionalRule([area], rule)).toBeUndefined();
    expect(table.getConditionalRules(area)).toEqual([rule]);
    expect(table.getConditionalRules({ fieldName: 'Buyer' })).toEqual([]);
    expect(table.removeConditionalRule(rule)).toBeUndefined();
    expect(table.getConditionalRules(area)).toEqual([]);
    table.removeConditionalRule(makeRule()); // unknown rule: no throw (trial void semantics)
    expect(table.getConditionalRules(area)).toHaveLength(0);
  });
  it('paints the rule style over matching pivot cells', () => {
    const { sheet, table } = buildPivot();
    const rule = makeRule();
    table.addConditionalRule([{ fieldName: 'Amount' }], rule);
    // Find a rendered data cell of the Amount column and confirm the rule style reached it.
    let painted = false;
    for (let r = 0; r < 12 && !painted; r++)
      for (let c = 0; c < 6 && !painted; c++) {
        const value = sheet.getValue(r, c);
        if (typeof value === 'number' && value > 70) {
          const cellStyle = sheet.getStyle(r, c);
          if (cellStyle && String(cellStyle.backColor).toLowerCase() === 'orange') painted = true;
        }
      }
    expect(painted).toBe(true);
  });
});

/* ---------------------------------------------------------------- injectAI */

describe('Workbook.injectAI (trial core has no runtime member; offline record)', () => {
  it('stores a callback or environment configuration without issuing a request', () => {
    const wb = new Workbook();
    expect(wb.injectAI(() => Promise.resolve({}))).toBeUndefined();
    expect(wb.injectAI({ http: { location: 'https://ai.invalid/ai' } })).toBeUndefined();
    // Nothing observable is added to the workbook JSON (the trial keys match ours here).
    const keys = Object.keys(wb.toJSON());
    expect(keys).not.toContain('ai');
  });
  it('rejects non-callback non-object arguments', () => {
    const wb = new Workbook();
    expect(() => wb.injectAI(null as never)).toThrow(TypeError);
    expect(() => wb.injectAI('https://ai.invalid' as never)).toThrow(TypeError);
    expect(() => wb.injectAI(7 as never)).toThrow(TypeError);
  });
});
