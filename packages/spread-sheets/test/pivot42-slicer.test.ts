/* Unit tests for pivot-bound slicers and the timeline (TASK 42 item 4):
 * creation through sheet.slicers.add, connection API, filtering the pivot,
 * cross-slicer no-data greying and JSON round-trips. */
import { describe, expect, it } from 'vitest';
import GC from '../src/index.js';
import type { Worksheet } from '../src/worksheet.js';
import { PivotTableItemSlicer, PivotTableTimelineSlicer } from '../src/features/slicers/pivot-slicer.js';

const { Workbook } = GC.Spread.Sheets;
const { SlicerType, TimelineLevel } = GC.Spread.Sheets.Slicers as unknown as {
  SlicerType: { table: string; pivotTable: string; pivotTimeline: string };
  TimelineLevel: { years: number; quarters: number; months: number; days: number };
};
const Pivot = GC.Spread.Pivot as unknown as { PivotTableLayoutType: { compact: number } };

const SALES = [
  ['Date', 'Buyer', 'Type', 'Amount', 'Region'],
  ['01-Jan', 'Mom', 'Fuel', 74, 'East'],
  ['15-Jan', 'Mom', 'Food', 235, 'East'],
  ['17-Jan', 'Dad', 'Sports', 20, 'West'],
  ['21-Jan', 'Kelly', 'Books', 125, 'West'],
  ['25-Jan', 'Dad', 'Food', 58, 'East'],
  ['30-Jan', 'Mom', 'Sports', 42, 'West'],
  ['04-Feb', 'Kelly', 'Fuel', 96, 'East'],
  ['08-Feb', 'Dad', 'Books', 310, 'West'],
  ['12-Feb', 'Mom', 'Food', 88, 'East'],
];

const DATES = [
  ['Date', 'Buyer', 'Amount'],
  [new Date(2022, 0, 5), 'Mom', 100],
  [new Date(2022, 3, 15), 'Dad', 150],
  [new Date(2022, 10, 20), 'Kelly', 200],
  [new Date(2023, 1, 3), 'Mom', 120],
  [new Date(2023, 5, 18), 'Dad', 180],
  [new Date(2023, 11, 30), 'Kelly', 220],
];

function build(fixture: unknown[][] = SALES, table = 'sourceData') {
  const wb = new Workbook(undefined, { sheetCount: 2 });
  const data = wb.getSheet(0);
  data.name('Data');
  data.setArray(0, 0, fixture);
  data.tables.add(table, 0, 0, fixture.length, fixture[0]!.length);
  const sheet = wb.getSheet(1);
  sheet.name('Pivot');
  return { wb, data, sheet };
}

const add = (sheet: Worksheet, name = 'pivot1', source = 'sourceData') =>
  sheet.pivotTables.add(name, source as never, 1, 1, Pivot.PivotTableLayoutType.compact, 'Medium2');

/** Add a pivot slicer / timeline with the concrete class type. */
const addSlicer = (sheet: Worksheet, name: string, field: string): PivotTableItemSlicer =>
  sheet.slicers.add(name, 'pivot1', field, undefined, SlicerType.pivotTable) as PivotTableItemSlicer;
const addTimeline = (sheet: Worksheet, name: string, field: string): PivotTableTimelineSlicer =>
  sheet.slicers.add(name, 'pivot1', field, undefined, SlicerType.pivotTimeline) as PivotTableTimelineSlicer;

/** Select slicer items by display text (exclusive indexes follow data order). */
function selectTexts(slicer: { slicerData: { getExclusiveData(c: string): string[]; doFilter(c: string, f: { exclusiveRowIndexes: number[] }): void; doUnfilter(c: string): void } | null; columnName(): string }, texts: string[]): void {
  const data = slicer.slicerData!;
  const column = slicer.columnName();
  const all = data.getExclusiveData(column);
  const indexes = texts.map(text => all.indexOf(text)).filter(index => index >= 0);
  if (indexes.length >= all.length) data.doUnfilter(column);
  else data.doFilter(column, { exclusiveRowIndexes: indexes });
}

/** Content rectangle values of the pivot (skips the page area). */
function grid(sheet: Worksheet, name = 'pivot1'): (string | number | null)[][] {
  const pt = sheet.pivotTables.get(name);
  const range = pt.getRange().content as unknown as { row: number; col: number; rowCount: number; colCount: number };
  const out: (string | number | null)[][] = [];
  for (let r = 0; r < range.rowCount; r++) {
    const row: (string | number | null)[] = [];
    for (let c = 0; c < range.colCount; c++) {
      const value = sheet.getValue(range.row + r, range.col + c);
      row.push(value == null ? null : value as string | number);
    }
    out.push(row);
  }
  return out;
}

describe('PivotTableItemSlicer', () => {
  function withPivot() {
    const env = build();
    const pt = add(env.sheet);
    pt.add('Buyer', 'Buyer', 1);
    pt.add('Amount', 'Amount', 3, 8);
    return { ...env, pt };
  }

  it('creates through sheet.slicers.add with the pivot SlicerType', () => {
    const { sheet } = withPivot();
    const slicer = addSlicer(sheet, 'slicer1', 'Buyer');
    expect(slicer).toBeInstanceOf(PivotTableItemSlicer);
    expect(GC.Spread.Pivot.PivotTableItemSlicer).toBe(PivotTableItemSlicer);
    expect(slicer.captionName()).toBe('Buyer');
    expect(slicer.sourceName()).toBe('Buyer');
    expect(slicer.nameInFormula()).toBe('SlicerCache_Buyer');
    expect(slicer.getConnectedPivotTableNameList()).toEqual(['pivot1']);
    expect(slicer.isConnectedPivotTable('pivot1')).toBe(true);
    expect(slicer.getAllPivotTables().length).toBe(1);
  });

  it('lists the field items like the trial (distinct, ascending)', () => {
    const { sheet } = withPivot();
    const slicer = addSlicer(sheet, 'slicer1', 'Buyer');
    expect(slicer.getItems().map(item => item.text)).toEqual(['Dad', 'Kelly', 'Mom']);
    expect(slicer.getItems().every(item => item.selected)).toBe(true);
  });

  it('filters the pivot when items are selected and restores on clear', () => {
    const { sheet, pt } = withPivot();
    const slicer = addSlicer(sheet, 'slicer1', 'Buyer');
    selectTexts(slicer, ['Dad', 'Mom']);
    const rows = grid(sheet).flat().filter(value => value !== null);
    expect(rows).toEqual(expect.arrayContaining(['Dad', 'Mom', 827])); // 388 + 439
    expect(rows).not.toContain('Kelly');
    expect((pt.getRange().content as unknown as { rowCount: number }).rowCount).toBeLessThan(5); // header + two buyers + grand total
    slicer.slicerData!.doUnfilter('Buyer');
    expect(grid(sheet).flat()).toContain('Kelly');
  });

  it('supports the PivotTable connect/disconnect side of the contract', () => {
    const { sheet, pt } = withPivot();
    const slicer = addSlicer(sheet, 'slicer1', 'Buyer');
    expect(pt.isConnectedSlicer('slicer1')).toBe(true);
    expect(pt.getAllSlicers()).toEqual([slicer]);
    selectTexts(slicer, ['Dad']);
    expect(grid(sheet).flat()).not.toContain('Mom');
    pt.disconnectSlicer('slicer1');
    expect(slicer.isConnectedPivotTable('pivot1')).toBe(false);
    expect(grid(sheet).flat()).not.toContain('Mom'); // trial: disconnect keeps the pivot's filter
    pt.connectSlicer('slicer1');
    expect(slicer.isConnectedPivotTable('pivot1')).toBe(true);
  });

  it('mirrors the selection into the pivot label filter (serialize + JSON hidden items)', () => {
    const { wb, sheet } = withPivot();
    const slicer = addSlicer(sheet, 'slicer1', 'Buyer');
    selectTexts(slicer, ['Dad']);
    const ser = sheet.pivotTables.get('pivot1').serialize() as unknown as { fieldsInfo: Record<string, unknown>[][] };
    expect(ser.fieldsInfo[1]![0]!.labelFilter).toEqual({ textItem: { list: ['Dad'], isAll: false } });
    const json = JSON.stringify(wb.toJSON());
    expect(json).toContain('"hidden":true');
    slicer.slicerData!.doUnfilter('Buyer');
    const ser2 = sheet.pivotTables.get('pivot1').serialize() as unknown as { fieldsInfo: Record<string, unknown>[][] };
    expect(ser2.fieldsInfo[1]![0]!.labelFilter).toBeUndefined();
  });

  it('greys out items that have no data under another slicer selection', () => {
    const { sheet } = withPivot();
    const buyer = addSlicer(sheet, 'buyerSlicer', 'Buyer');
    const type = addSlicer(sheet, 'typeSlicer', 'Type');
    // Fuel rows belong to Mom (74) and Kelly (96): Dad/Sports-only rows vanish.
    selectTexts(type, ['Fuel']);
    const items = buyer.getItems();
    const dad = items.find(item => item.text === 'Dad')!;
    const mom = items.find(item => item.text === 'Mom')!;
    expect(dad.noData).toBe(true);
    expect(mom.noData).toBe(false);
  });

  it('serialises in the slicers sheet-JSON section and restores via fromJSON', () => {
    const { wb, sheet } = withPivot();
    const slicer = addSlicer(sheet, 'slicer1', 'Buyer');
    expect(slicer.x(130, false)).toBe(slicer);
    expect(slicer.y(70, false)).toBe(slicer);
    selectTexts(slicer, ['Kelly']);
    const json = wb.toJSON() as unknown as { sheets: Record<string, { slicers?: unknown[] }>; slicerCaches?: Record<string, unknown>[] };
    const entry = json.sheets['Pivot']!.slicers?.[0] as Record<string, unknown>;
    expect(entry.type).toBe('pivot');
    expect([entry.x, entry.y]).toEqual([130, 70]);
    // Trial shape: binding + selection live in the workbook slicerCaches section.
    const cache = json.slicerCaches?.[0];
    expect(cache?.name).toBe('SlicerCache_Buyer');
    expect(cache?.sourceName).toBe('Buyer');
    expect(cache?.pivotCacheId).toBe(100000000);
    expect(cache?.pivotTables).toEqual([{ tabId: 2, name: 'pivot1' }]);
    expect((cache?.items as { s: boolean }[]).filter(i => i.s).length).toBe(1);
    const wb2 = new Workbook();
    wb2.fromJSON(json);
    const sheet2 = wb2.getSheet(1);
    const restored = sheet2.slicers.get('slicer1') as PivotTableItemSlicer | undefined;
    expect(restored).toBeInstanceOf(PivotTableItemSlicer);
    expect(restored!.getConnectedPivotTableNameList()).toEqual(['pivot1']);
    expect(restored!.captionName()).toBe('Buyer');
    expect([restored!.x(), restored!.y()]).toEqual([130, 70]);
    expect(grid(sheet2).flat()).not.toContain('Mom');
  });

  it('follows pivot refreshes: new field items appear in the slicer list', () => {
    const { data, sheet, pt } = withPivot();
    const slicer = addSlicer(sheet, 'slicer1', 'Buyer');
    expect(slicer.getItems().map(item => item.text)).toEqual(['Dad', 'Kelly', 'Mom']);
    data.setValue(4, 1, 'Ann'); // the Kelly row of 21-Jan becomes Ann's
    pt.refresh();
    expect(slicer.getItems().map(item => item.text)).toEqual(['Ann', 'Dad', 'Kelly', 'Mom']);
  });

  it('exposes the pivot-style slot API (store/get)', () => {
    const { sheet } = withPivot();
    const slicer = addSlicer(sheet, 'slicer1', 'Buyer');
    const PivotNs = GC.Spread.Pivot as unknown as { PivotTableStyle: new (o?: object) => object };
    const style = new PivotNs.PivotTableStyle({ foreColor: 'red' });
    expect(slicer.wholeTableStyle()).toBeUndefined();
    expect(slicer.wholeTableStyle(style)).toBe(slicer);
    expect(slicer.wholeTableStyle()).toBe(style);
    expect(slicer.firstRowStripSize()).toBe(1);
    expect(slicer.firstRowStripSize(2)).toBe(slicer);
    expect(slicer.firstRowStripSize()).toBe(2);
  });
});

describe('PivotTableTimelineSlicer', () => {
  function withDates() {
    const env = build(DATES);
    const pt = add(env.sheet);
    pt.add('Buyer', 'Buyer', 1);
    pt.add('Amount', 'Amount', 3, 8);
    return { ...env, pt };
  }

  it('creates through slicers.add with the timeline SlicerType', () => {
    const { sheet } = withDates();
    const slicer = addTimeline(sheet, 'tl1', 'Date');
    expect(slicer).toBeInstanceOf(PivotTableTimelineSlicer);
    expect(GC.Spread.Pivot.PivotTableTimelineSlicer).toBe(PivotTableTimelineSlicer);
    expect(slicer.nameInFormula()).toBe('NativeTimelineCache_Date');
    expect(slicer.level()).toBe(TimelineLevel.months);
    expect(slicer.showTimeLevel()).toBe(true);
    expect(slicer.showSelectionLabel()).toBe(true);
  });

  it('level() accepts only TimelineLevel values', () => {
    const { sheet } = withDates();
    const slicer = addTimeline(sheet, 'tl1', 'Date');
    expect(slicer.level(TimelineLevel.years)).toBe(slicer);
    expect(slicer.level()).toBe(TimelineLevel.years);
    slicer.level(99 as number);
    expect(slicer.level()).toBe(TimelineLevel.years);
  });

  it('filters the pivot to the selected date range and clears via _clearAll', () => {
    const { sheet } = withDates();
    const slicer = addTimeline(sheet, 'tl1', 'Date');
    // Select 2022 only.
    const from = new Date(2022, 0, 1).getTime();
    const to = new Date(2022, 11, 31, 23, 59, 59).getTime();
    slicer._selectRange(from, to);
    let values = grid(sheet).flat();
    expect(values).toContain(450); // 100 + 150 + 200
    expect(values).not.toContain(970);
    slicer._clearAll();
    values = grid(sheet).flat();
    expect(values).toContain(970); // grand total over all rows
  });

  it('scrollPosition round-trips a Date and the JSON keeps level/visibility flags', () => {
    const { wb, sheet } = withDates();
    const slicer = addTimeline(sheet, 'tl1', 'Date');
    const date = new Date(2022, 6, 1);
    slicer.scrollPosition(date);
    expect((slicer.scrollPosition() as Date).getTime()).toBe(date.getTime());
    slicer.level(TimelineLevel.quarters);
    slicer.showSelectionLabel(false);
    const json = wb.toJSON() as unknown as { sheets: Record<string, { slicers?: Record<string, unknown>[] }>; slicerCaches?: Record<string, unknown>[] };
    const entry = json.sheets['Pivot']!.slicers![0]!;
    expect(entry.type).toBe('timeline');
    expect(json.slicerCaches?.[0]!.name).toBe('NativeTimelineCache_Date');
    expect(typeof json.slicerCaches?.[0]!.boundsStartDate).toBe('string');
    expect(entry.columnCount).toBeUndefined();
    expect(entry.multiSelect).toBeUndefined();
    expect(entry.level).toBe(TimelineLevel.quarters);
    expect(entry.showSelectionLabel).toBe(false);
    const wb2 = new Workbook();
    wb2.fromJSON(json);
    const restored = wb2.getSheet(1).slicers.get('tl1') as PivotTableTimelineSlicer;
    expect(restored).toBeInstanceOf(PivotTableTimelineSlicer);
    expect(restored.level()).toBe(TimelineLevel.quarters);
    expect(restored.showSelectionLabel()).toBe(false);
  });
});
