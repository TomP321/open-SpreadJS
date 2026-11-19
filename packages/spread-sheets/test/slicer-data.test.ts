/* Unit tests for the slicer data models (TASK 29 part 1): GC.Spread.Slicers.GeneralSlicerData
 * and GC.Spread.Sheets.Slicers.TableSlicerData (table-bound filtering). */
import { describe, expect, it, vi } from 'vitest';
import GC from '../src/index.js';
import { GeneralSlicerData, TableSlicerData } from '../src/features/slicers/index.js';

const GSD = GeneralSlicerData;
const FilteredOut = GC.Spread.Slicers.FilteredOutDataType;
const Agg = GC.Spread.Slicers.SlicerAggregateType;
const { Workbook } = GC.Spread.Sheets;
const themes = GC.Spread.Sheets.Tables.TableThemes as unknown as Record<string, string>;

type Gsd = InstanceType<typeof GSD>;

/** Rows: East/10, West/20, East/30, (blank)/null — raw and {value,text} cell flavours mixed. */
function makeData(): Gsd {
  return new GSD(
    [
      [{ value: 'East', text: 'East' }, 10],
      [{ value: 'West', text: 'West' }, 20],
      [{ value: 'East', text: 'East' }, 30],
      ['', null],
    ],
    ['Region', 'Amount'],
  ) as Gsd;
}

function listenerSpy() {
  return {
    onFiltered: vi.fn(),
    onDataChanged: vi.fn(),
    onRowsChanged: vi.fn(),
    onColumnNameChanged: vi.fn(),
    onColumnRemoved: vi.fn(),
  };
}

describe('GC.Spread.Slicers.GeneralSlicerData', () => {
  it('exposes the columnNames and data members from the constructor', () => {
    const g = makeData();
    expect(g.columnNames).toEqual(['Region', 'Amount']);
    expect(g.data.length).toBe(4);
    expect(g.data[0][0]).toEqual({ value: 'East', text: 'East' });
    const bad = new GSD(null as never, undefined as never) as Gsd;
    expect(bad.columnNames).toEqual([]);
    expect(bad.data).toEqual([]);
  });

  it('getColumnIndex maps names to indexes', () => {
    const g = makeData();
    expect(g.getColumnIndex('Region')).toBe(0);
    expect(g.getColumnIndex('Amount')).toBe(1);
    expect(g.getColumnIndex('Nope')).toBe(-1);
  });

  it('getData returns row texts and honours a range conditional', () => {
    const g = makeData();
    expect(g.getData('Region')).toEqual(['East', 'West', 'East', '']);
    expect(g.getData('Amount')).toEqual(['10', '20', '30', '']);
    expect(g.getData('Amount', { min: 15, max: 100 })).toEqual(['20', '30']);
    expect(g.getData('Nope')).toEqual([]);
  });

  it('getExclusiveData keeps first-appearance distinct values', () => {
    expect(makeData().getExclusiveData('Region')).toEqual(['East', 'West', '']);
    expect(makeData().getExclusiveData('Amount')).toEqual(['10', '20', '30', '']);
  });

  it('getRowIndexes / getExclusiveRowIndex translate between row and exclusive space', () => {
    const g = makeData();
    expect(g.getRowIndexes('Region', 0)).toEqual([0, 2]);
    expect(g.getRowIndexes('Region', 2)).toEqual([3]);
    expect(g.getRowIndexes('Region', 9)).toEqual([]);
    expect(g.getExclusiveRowIndex('Region', 2)).toBe(0);
    expect(g.getExclusiveRowIndex('Amount', 1)).toBe(1);
  });

  it('doFilter/getFilteredRowIndexes/getFilteredOutRowIndexes/getFilteredIndexes work together', () => {
    const g = makeData();
    g.doFilter('Region', { exclusiveRowIndexes: [0] });
    expect(g.getFilteredRowIndexes()).toEqual([0, 2]);
    expect(g.getFilteredOutRowIndexes()).toEqual([1, 3]);
    expect(g.getFilteredIndexes('Region')).toEqual([0]);
    expect(g.getFilteredIndexes('Amount')).toEqual([0, 2]);
    g.doUnfilter('Region');
    expect(g.getFilteredRowIndexes()).toEqual([0, 1, 2, 3]);
    expect(g.getFilteredOutRowIndexes()).toEqual([]);
  });

  it('doFilter supports range conditionals and stacks across columns', () => {
    const g = makeData();
    g.doFilter('Amount', { ranges: [{ min: 15, max: 100 }] });
    expect(g.getFilteredRowIndexes()).toEqual([1, 2]);
    expect(g.getFilteredRanges('Amount')).toEqual([{ min: 15, max: 100 }]);
    g.doFilter('Region', { exclusiveRowIndexes: [0, 2] });
    expect(g.getFilteredRowIndexes()).toEqual([2]);
    g.doUnfilter('Amount');
    g.doUnfilter('Region');
    expect(g.getFilteredRanges('Region')).toEqual([]);
    expect(g.getFilteredOutRanges('Region')).toEqual([]);
  });

  it('doFilter ignores unknown columns', () => {
    const g = makeData();
    g.doFilter('Nope', { exclusiveRowIndexes: [0] });
    expect(g.getFilteredRowIndexes()).toEqual([0, 1, 2, 3]);
  });

  it('getFilteredOutIndexes honours the three FilteredOutDataType flavours', () => {
    const g = makeData();
    g.doFilter('Region', { exclusiveRowIndexes: [0] }); // East rows only
    // Amount items '20' and '' lose all their rows through the other column's filter.
    expect(g.getFilteredOutIndexes('Amount', FilteredOut.byOtherColumns)).toEqual([1, 3]);
    expect(g.getFilteredOutIndexes('Amount', FilteredOut.byCurrentColumn)).toEqual([]);
    expect(g.getFilteredOutIndexes('Amount', FilteredOut.all)).toEqual([1, 3]);
    // Region: item indexes 1 (West) and 2 (blank) fail the column's own filter.
    expect(g.getFilteredOutIndexes('Region', FilteredOut.byCurrentColumn)).toEqual([1, 2]);
    expect(g.getFilteredOutIndexes('Region', FilteredOut.byOtherColumns)).toEqual([]);
  });

  it('preview filters are reported by inPreview and dropped by clearPreview', () => {
    const g = makeData();
    g.doFilter('Region', { exclusiveRowIndexes: [0] }, true);
    expect(g.inPreview()).toBe(true);
    expect(g.getFilteredRowIndexes()).toEqual([0, 2]);
    g.clearPreview();
    expect(g.inPreview()).toBe(false);
    expect(g.getFilteredRowIndexes()).toEqual([0, 1, 2, 3]);
  });

  it('attachListener/detachListener drive onFiltered with { isPreview, rowIndexes }', () => {
    const g = makeData();
    const spy = listenerSpy();
    g.attachListener(spy);
    g.attachListener(spy); // duplicates ignored
    g.doFilter('Region', { exclusiveRowIndexes: [0] });
    expect(spy.onFiltered).toHaveBeenCalledTimes(1);
    expect(spy.onFiltered.mock.calls[0][0]).toEqual({ isPreview: false, rowIndexes: [0, 2] });
    g.doFilter('Amount', { ranges: [{ min: 15, max: 30 }] }, true);
    expect(spy.onFiltered.mock.calls[1][0].isPreview).toBe(true);
    g.detachListener(spy);
    g.doUnfilter('Region');
    expect(spy.onFiltered).toHaveBeenCalledTimes(2);
  });

  it('suspendFilteredEvents batches and resumeFilteredEvents flushes once', () => {
    const g = makeData();
    const spy = listenerSpy();
    g.attachListener(spy);
    g.suspendFilteredEvents();
    g.doFilter('Region', { exclusiveRowIndexes: [0] });
    g.doFilter('Amount', { ranges: [{ min: 15, max: 30 }] });
    expect(spy.onFiltered).not.toHaveBeenCalled();
    g.resumeFilteredEvents();
    expect(spy.onFiltered).toHaveBeenCalledTimes(1);
    g.doUnfilter('Region'); // resumed: fires again directly
    expect(spy.onFiltered).toHaveBeenCalledTimes(2);
    g.suspendFilteredEvents(); // suspend without changes: resume does nothing
    g.resumeFilteredEvents();
    expect(spy.onFiltered).toHaveBeenCalledTimes(2);
  });

  it('onFiltered re-notifies listeners with the current state', () => {
    const g = makeData();
    const spy = listenerSpy();
    g.attachListener(spy);
    g.doFilter('Region', { exclusiveRowIndexes: [1] });
    g.onFiltered();
    const last = spy.onFiltered.mock.calls.at(-1)?.[0];
    expect(last).toEqual({ isPreview: false, rowIndexes: [1] });
  });

  it('onColumnNameChanged renames the column and moves its filter', () => {
    const g = makeData();
    const spy = listenerSpy();
    g.attachListener(spy);
    g.doFilter('Region', { exclusiveRowIndexes: [0] });
    g.onColumnNameChanged('Region', 'Area');
    expect(g.columnNames).toEqual(['Area', 'Amount']);
    expect(g.getExclusiveData('Area')).toEqual(['East', 'West', '']);
    expect(g.getFilteredRowIndexes()).toEqual([0, 2]); // filter followed the rename
    expect(spy.onColumnNameChanged).toHaveBeenCalledWith('Region', 'Area');
    g.onColumnNameChanged('Nope', 'X'); // unknown: ignored
    expect(g.columnNames).toEqual(['Area', 'Amount']);
  });

  it('onColumnsRemoved drops columns, rows cells, filters and notifies', () => {
    const g = makeData();
    const spy = listenerSpy();
    g.attachListener(spy);
    g.doFilter('Region', { exclusiveRowIndexes: [0] });
    g.onColumnsRemoved(0, 1);
    expect(g.columnNames).toEqual(['Amount']);
    expect(g.data[0].length).toBe(1);
    expect(g.getFilteredRowIndexes()).toEqual([0, 1, 2, 3]); // filter dropped with the column
    expect(spy.onColumnRemoved).toHaveBeenCalledWith('Region');
  });

  it('onDataChanged writes only the array form (trial probe 2026-11-14)', () => {
    const g = makeData();
    const spy = listenerSpy();
    g.attachListener(spy);
    // Single object: event fires but the trial does NOT touch the data.
    g.onDataChanged({ columnName: 'Region', rowIndex: 1, row: 1, data: { value: 'North', text: 'North' } });
    expect(g.getExclusiveData('Region')).toEqual(['East', 'West', '']);
    expect(spy.onDataChanged).toHaveBeenCalledTimes(1);
    // Array form: the trial applies the updates.
    g.onDataChanged([
      { columnName: 'Amount', row: 0, rowIndex: 0, data: 5 },
      { columnName: 'Amount', row: 1, rowIndex: 1, data: 6 },
    ]);
    expect(g.getData('Amount')).toEqual(['5', '6', '30', '']);
    expect(spy.onDataChanged).toHaveBeenCalledTimes(2);
    // Neither form re-notifies onFiltered (trial fires onDataChanged only).
    expect(spy.onFiltered).not.toHaveBeenCalled();
  });

  it('onRowsAdded throws over a range-filter table like the trial (distinct-count index)', () => {
    const g = new GSD(
      [
        [{ value: 'East', text: 'East' }, { value: 10, text: '10' }],
        [{ value: 'West', text: 'West' }, { value: 20, text: '20' }],
        [{ value: 'East', text: 'East' }, { value: 30, text: '30' }],
      ],
      ['Region', 'Amount'],
    ) as Gsd;
    const spy = listenerSpy();
    g.attachListener(spy);
    g.doFilter('Amount', { ranges: [{ min: 5, max: 25 }] });
    // Trial: the null rows are spliced in, then the cache walk throws before
    // onRowsChanged fires; the message carries the distinct-value count (3).
    expect(() => g.onRowsAdded(1, 1)).toThrow("Cannot read properties of undefined (reading '3')");
    expect(g.data.length).toBe(4);
    expect(g.data[1]).toEqual([null, null]);
    expect(spy.onRowsChanged).not.toHaveBeenCalled();
    // doUnfilter drops the table, so the next insert succeeds and notifies.
    g.doUnfilter('Amount');
    g.onRowsAdded(0, 1);
    expect(spy.onRowsChanged).toHaveBeenCalledWith(0, 1, true);
  });

  it('range tables survive clearPreview but not column changes (trial)', () => {
    const g = new GSD(
      [
        [{ value: 'East', text: 'East' }, { value: 10, text: '10' }],
        [{ value: 'West', text: 'West' }, { value: 20, text: '20' }],
      ],
      ['Region', 'Amount'],
    ) as Gsd;
    // Preview filter + clearPreview: trial keeps the stale table → throws from 2.
    g.doFilter('Amount', { ranges: [{ min: 5, max: 15 }] }, true);
    g.clearPreview();
    expect(() => g.onRowsAdded(0, 1)).toThrow("Cannot read properties of undefined (reading '2')");
    // Removing another column shifts the index-keyed table: the walk starts at 0.
    const h = new GSD(
      [
        [{ value: 'A', text: 'A' }, { value: 'B', text: 'B' }, { value: 10, text: '10' }],
        [{ value: 'C', text: 'C' }, { value: 'D', text: 'D' }, { value: 20, text: '20' }],
      ],
      ['X', 'Y', 'N'],
    ) as Gsd;
    h.doFilter('N', { ranges: [{ min: 5, max: 15 }] });
    h.onColumnsRemoved(0, 1);
    expect(() => h.onRowsAdded(0, 1)).toThrow("Cannot read properties of undefined (reading '0')");
    // Removing the filtered column itself drops its filter and table: no throw.
    const k = new GSD(
      [
        [{ value: 'A', text: 'A' }, { value: 10, text: '10' }],
        [{ value: 'C', text: 'C' }, { value: 20, text: '20' }],
      ],
      ['X', 'N'],
    ) as Gsd;
    k.doFilter('N', { ranges: [{ min: 5, max: 15 }] });
    k.onColumnsRemoved(1, 1);
    k.onRowsAdded(0, 1);
    expect(k.data.length).toBe(3);
  });

  it('range tables on columns holding null cells start the trial walk at 0', () => {
    const g = makeData(); // Amount column has a null cell in the last row
    g.doFilter('Amount', { ranges: [{ min: 5, max: 35 }] });
    expect(() => g.onRowsAdded(0, 1)).toThrow("Cannot read properties of undefined (reading '0')");
  });

  it('onRowsAdded/onRowsRemoved reshape the matrix and notify onRowsChanged', () => {
    const g = makeData();
    const spy = listenerSpy();
    g.attachListener(spy);
    g.onRowsAdded(2, 1);
    expect(g.data.length).toBe(5);
    expect(g.data[2]).toEqual([null, null]);
    expect(spy.onRowsChanged).toHaveBeenCalledWith(2, 1, true);
    g.onRowsRemoved(0, 2);
    expect(g.data.length).toBe(3);
    expect(spy.onRowsChanged).toHaveBeenCalledWith(0, 2, false);
  });

  it('aggregateData computes every SlicerAggregateType', () => {
    const g = new GSD([[10], [20], [30], [null], ['']], ['n']) as Gsd;
    expect(g.aggregateData('n', Agg.count)).toBe(3);
    expect(g.aggregateData('n', Agg.counta)).toBe(3);
    expect(g.aggregateData('n', Agg.sum)).toBe(60);
    expect(g.aggregateData('n', Agg.average)).toBe(20);
    expect(g.aggregateData('n', Agg.max)).toBe(30);
    expect(g.aggregateData('n', Agg.min)).toBe(10);
    expect(g.aggregateData('n', Agg.product)).toBe(6000);
    expect(g.aggregateData('n', Agg.varp)).toBeCloseTo(200 / 3);
    expect(g.aggregateData('n', Agg.vars)).toBeCloseTo(100);
    expect(g.aggregateData('n', Agg.stdevp)).toBeCloseTo(Math.sqrt(200 / 3));
    expect(g.aggregateData('n', Agg.stdev)).toBeCloseTo(10);
    expect(g.aggregateData('n', Agg.sum, { min: 15, max: 25 })).toBe(20);
    expect(g.aggregateData('Nope', Agg.sum)).toBe(0);
    const empty = new GSD([[null]], ['n']) as Gsd;
    expect(empty.aggregateData('n', Agg.stdev)).toBe(0);
    expect(empty.aggregateData('n', Agg.varp)).toBe(0);
    expect(empty.aggregateData('n', Agg.max)).toBe(0);
  });

  it('getSelectedIndexes reports the per-column selection state (null = unfiltered)', () => {
    const g = makeData();
    expect(g.getSelectedIndexes('Region')).toBeNull();
    g.doFilter('Region', { exclusiveRowIndexes: [0, 1] });
    expect(g.getSelectedIndexes('Region')).toEqual([0, 1]);
    g.doFilter('Amount', { ranges: [{ min: 15, max: 30 }] });
    expect(g.getSelectedIndexes('Amount')).toEqual([1, 2]);
  });
});

describe('GC.Spread.Sheets.Slicers.TableSlicerData', () => {
  const SOURCE = [['Region', 'Amount'], ['East', 10], ['West', 20], ['East', 30], ['South', 40]];

  function makeTable() {
    const wb = new Workbook();
    const sheet = wb.getActiveSheet();
    sheet.setArray(0, 0, SOURCE.map(row => row.slice()));
    const table = sheet.tables.add('Sales', 0, 0, 5, 2, themes.light1);
    return { wb, sheet, table };
  }

  it('constructs from a table and exposes getTable/sheet/refresh', () => {
    const { sheet, table } = makeTable();
    const data = new TableSlicerData(table);
    expect((GC.Spread.Sheets.Slicers as unknown as Record<string, unknown>).TableSlicerData).toBe(TableSlicerData);
    expect(data.getTable()).toBe(table);
    expect(data.sheet).toBe(sheet);
    expect(data.columnNames).toEqual(['Region', 'Amount']);
    expect(data.getExclusiveData('Region')).toEqual(['East', 'West', 'South']);
    expect(data.getData('Amount')).toEqual(['10', '20', '30', '40']);
    sheet.setValue(4, 0, 'North');
    expect(data.getExclusiveData('Region')).toEqual(['East', 'West', 'South']);
    data.refresh();
    expect(data.getExclusiveData('Region')).toEqual(['East', 'West', 'North']);
  });

  it('shares one instance through table.getSlicerData()', () => {
    const { table } = makeTable();
    expect(table.getSlicerData()).toBe(table.getSlicerData());
    expect(table.getSlicerData()).toBeInstanceOf(GeneralSlicerData);
  });

  it('doFilter hides the table rows that fail the selection', () => {
    const { sheet, table } = makeTable();
    const data = new TableSlicerData(table);
    data.doFilter('Region', { exclusiveRowIndexes: [0] });
    expect([0, 1, 2, 3, 4].map(r => sheet.getRowVisible(r))).toEqual([true, true, false, true, false]);
    expect(data.getSelectedIndexes('Region')).toEqual([0]);
    expect(data.getFilteredRowIndexes()).toEqual([0, 2]);
    expect(data.getFilteredOutIndexes('Amount', FilteredOut.byOtherColumns)).toEqual([1, 3]);
    data.doUnfilter('Region');
    expect([0, 1, 2, 3, 4].map(r => sheet.getRowVisible(r))).toEqual([true, true, true, true, true]);
    expect(data.getSelectedIndexes('Region')).toBeNull();
  });

  it('doFilter with a range conditional filters the numeric column', () => {
    const { sheet, table } = makeTable();
    const data = new TableSlicerData(table);
    data.doFilter('Amount', { ranges: [{ min: 25, max: 45 }] });
    expect([0, 1, 2, 3, 4].map(r => sheet.getRowVisible(r))).toEqual([true, false, false, true, true]);
    data.doUnfilter('Amount');
    expect([0, 1, 2, 3, 4].map(r => sheet.getRowVisible(r))).toEqual([true, true, true, true, true]);
  });

  it('hasRowForOtherColumns flags items whose rows are hidden by other filters', () => {
    const { table } = makeTable();
    const data = new TableSlicerData(table);
    expect(data.hasRowForOtherColumns('Amount', 1)).toBe(true);
    data.doFilter('Region', { exclusiveRowIndexes: [0] }); // keep East rows (Amount 10 and 30)
    expect(data.hasRowForOtherColumns('Amount', 0)).toBe(true); // 10
    expect(data.hasRowForOtherColumns('Amount', 1)).toBe(false); // 20 (West row hidden)
    expect(data.hasRowForOtherColumns('Amount', 2)).toBe(true); // 30
    expect(data.hasRowForOtherColumns('Amount', 3)).toBe(false); // 40 (South row hidden)
  });

  it('tableColumnIndex / rowFilter / toDataRow map between table and slicer space', () => {
    const { table } = makeTable();
    const data = new TableSlicerData(table);
    expect(data.tableColumnIndex('Region')).toBe(0);
    expect(data.tableColumnIndex('Nope')).toBe(-1);
    expect(data.rowFilter()).toBe(table.rowFilter());
    expect(data.toDataRow(1)).toBe(0);
    expect(data.toDataRow(4)).toBe(3);
  });

  it('_onCellChanged refreshes only for edits inside the table data range', () => {
    const { sheet, table } = makeTable();
    const data = new TableSlicerData(table);
    data._onCellChanged(8, 0);
    expect(data.getExclusiveData('Region')).toEqual(['East', 'West', 'South']);
    sheet.setValue(4, 0, 'North');
    data._onCellChanged(4, 0);
    expect(data.getExclusiveData('Region')).toContain('North');
  });
});
