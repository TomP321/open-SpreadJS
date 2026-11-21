/**
 * TASK 78: the sort transaction contract measured on the 19.2.5 trial
 * (`.probe/t78/dbg-sort-events.mjs`): a `sortRange` call moves whole cell
 * records (values, styles, tags, validators, hyperlinks, comments), carries
 * formulas with their cells while shifting relative references by the same
 * delta, re-evaluates external dependents and raises exactly one batched
 * RangeChanged (action `sort`) — no RangeSorting/RangeSorted, no per-cell
 * CellChanged/ValueChanged. Also covers the ordered sparse-grid traversal the
 * store-level move (and the streaming search) rely on.
 */
import { describe, expect, it } from 'vitest';
import GC from '../src/index.js';
import { SparseGrid, CellStore } from '../src/structures.js';

const SS = GC.Spread.Sheets;

type Sheet = ReturnType<InstanceType<typeof SS.Workbook>['getActiveSheet']>;

function sheetWithValues(rows: unknown[][]): Sheet {
  const workbook = new GC.Spread.Sheets.Workbook();
  const sheet = workbook.getActiveSheet();
  rows.forEach((row, r) => row.forEach((value, c) => sheet.setValue(r, c, value)));
  return sheet;
}

describe('sortRange transaction contract (trial-probed, TASK 78)', () => {
  it('moves values, styles, tags and comments with their cells', () => {
    const workbook = new GC.Spread.Sheets.Workbook();
    const sheet = workbook.getActiveSheet();
    [3, 1, 2].forEach((v, r) => sheet.setValue(r, 0, v));
    sheet.setStyle(0, 0, new SS.Style({ backColor: 'red' }));
    sheet.setTag(0, 0, 'zero');
    sheet.comments.add(0, 0, 'note on row 0');
    expect(sheet.sortRange(0, 0, 3, 1, true, [{ index: 0, ascending: true }])).toBe(true);
    expect([0, 1, 2].map((r) => sheet.getValue(r, 0))).toEqual([1, 2, 3]);
    // row 0 (value 3) lands on target 2; style and tag travel with it
    const backColor = (r: number): unknown => {
      const style = sheet.getStyle(r, 0) as { backColor?: unknown } | null;
      const value = style?.backColor;
      return typeof value === 'function' ? (value as () => unknown)() : value;
    };
    expect(backColor(2)).toBe('red');
    expect(backColor(0)).toBeUndefined();
    expect(sheet.getTag(0, 0)).toBeUndefined();
    const note = sheet.comments.all()[0];
    expect(note ? (typeof note.rowIndex === 'function' ? note.rowIndex() : note.rowIndex) : -1).toBe(2);
  });

  it('carries formulas with their cells and shifts relative references by the move delta', () => {
    const workbook = new GC.Spread.Sheets.Workbook();
    const sheet = workbook.getActiveSheet();
    // ids 3,1,2 -> ascending order [1,2,3]: source row 0 (id 3) lands on target 2
    [3, 1, 2].forEach((v, r) => sheet.setValue(r, 0, v));
    sheet.setFormula(0, 1, '=A1+A2'); // references rows 0 and 1
    expect(sheet.sortRange(0, 0, 3, 2, true, [{ index: 0, ascending: true }])).toBe(true);
    expect(sheet.getFormula(0, 1)).toBeNull();
    expect(sheet.getFormula(2, 1)).toBe('A3+A4'); // +2 rows with the cell
  });

  it('re-evaluates formulas outside the sorted range', () => {
    const sheet = sheetWithValues([[3], [1], [2]]);
    sheet.setFormula(0, 5, '=SUM(A1:A3)');
    sheet.sortRange(0, 0, 3, 1, true, [{ index: 0, ascending: true }]);
    expect(sheet.getValue(0, 5)).toBe(6);
    sheet.setValue(1, 0, 10);
    sheet.sortRange(0, 0, 3, 1, true, [{ index: 0, ascending: true }]);
    expect(sheet.getValue(0, 5)).toBe(14);
  });

  it('raises exactly one RangeChanged with action sort and no per-cell events', () => {
    const workbook = new GC.Spread.Sheets.Workbook();
    const sheet = workbook.getActiveSheet();
    [3, 1, 2].forEach((v, r) => sheet.setValue(r, 0, v));
    const fired: { name: string; info: unknown }[] = [];
    for (const name of ['RangeChanged', 'RangeSorting', 'RangeSorted', 'CellChanged', 'ValueChanged'] as const)
      sheet.bind(SS.Events[name], (_e, info) => fired.push({ name, info }));
    sheet.sortRange(0, 0, 3, 1, true, [{ index: 0, ascending: true }]);
    expect(fired.map((f) => f.name)).toEqual(['RangeChanged']);
    const info = fired[0]!.info as unknown as {
      row: number; col: number; rowCount: number; colCount: number; action: number; isUndo: boolean;
      changedCells: { row: number; col: number }[];
    };
    expect([info.row, info.col, info.rowCount, info.colCount]).toEqual([0, 0, 3, 1]);
    expect(info.action).toBe(SS.RangeChangedAction.sort);
    expect(info.isUndo).toBe(false);
    expect(info.changedCells.length).toBe(3); // the whole column changed
    expect(info.changedCells.every((cell) => typeof cell.row === 'number' && typeof cell.col === 'number')).toBe(true);
  });

  it('does not report unchanged cells in changedCells', () => {
    const sheet = sheetWithValues([[1], [3], [2]]);
    let changed = 0;
    sheet.bind(SS.Events.RangeChanged, (_e, info) => {
      changed = ((info as { changedCells?: unknown[] }).changedCells ?? []).length;
    });
    sheet.sortRange(0, 0, 3, 1, true, [{ index: 0, ascending: true }]);
    expect(changed).toBe(2); // row 0 keeps value 1
  });

  it('moves cell records across columns with byRows=false', () => {
    const sheet = sheetWithValues([[3, 1, 2]]);
    sheet.setStyle(0, 0, new SS.Style({ backColor: 'blue' }));
    sheet.setFormula(0, 2, '=D1+2'); // keeps the value 2 (D1 empty); source column 2 lands on target column 1
    sheet.sortRange(0, 0, 1, 3, false, [{ index: 0, ascending: true }]);
    expect(sheet.getFormula(0, 1)).toBe('C1+2'); // -1 column with the cell
    expect(sheet.getValue(0, 2)).toBe(3);
    expect(sheet.getValue(0, 1)).toBe(5); // C1 + 2 = 3 + 2, recalculated in place
    const styleColor = sheet.getStyle(0, 2) as { backColor?: unknown } | null;
    expect(typeof styleColor?.backColor === 'string' ? styleColor.backColor : (styleColor?.backColor as () => string)?.()).toBe('blue');
  });
});

describe('bulk calculation coalescing (TASK 78)', () => {
  it('recomputes every formula after a suspended write batch above the threshold', () => {
    const workbook = new GC.Spread.Sheets.Workbook();
    const sheet = workbook.getActiveSheet();
    sheet.setRowCount(10001);
    sheet.suspendCalcService();
    for (let r = 0; r < 9000; r++) sheet.setValue(r, 0, r);
    sheet.setFormula(9000, 0, '=SUM(A1:A9000)');
    sheet.resumeCalcService();
    expect(sheet.getValue(9000, 0)).toBe((8999 * 9000) / 2);
    // a second suspended batch keeps working (the counter and flag reset)
    sheet.suspendCalcService();
    for (let r = 0; r < 9000; r++) sheet.setValue(r, 0, 1);
    sheet.resumeCalcService();
    expect(sheet.getValue(9000, 0)).toBe(9000);
  });

  it('keeps value-over-formula semantics in a suspended batch below the bulk threshold', () => {
    // Same contract as the bulk test below, small batch: the per-cell write
    // queue keeps one notification per cell, so a setFormula + setValue pair
    // on the same cell arrives at the engine as the value notification only.
    const workbook = new GC.Spread.Sheets.Workbook();
    const sheet = workbook.getActiveSheet();
    sheet.suspendCalcService();
    for (let r = 0; r < 5; r++) sheet.setValue(r, 0, r + 1);
    for (let r = 0; r < 5; r++) sheet.setFormula(r, 1, '=A' + (r + 1) + '*2');
    for (let r = 0; r < 5; r++) sheet.setValue(r, 1, 'plain' + r);
    sheet.resumeCalcService();
    for (let r = 0; r < 5; r++) {
      expect(sheet.getFormula(r, 1)).toBe('A' + (r + 1) + '*2');
      expect(sheet.getValue(r, 1)).toBe((r + 1) * 2);
    }
  });

  it('keeps trial value-over-formula semantics in a suspended bulk batch', () => {
    // Probed on the trial (`.probe/t78/dbg-setvalue-formula.mjs`): a plain
    // setValue over a formula cell leaves the formula in place and the cell
    // keeps showing the recalculated value — bulk mode must not change that,
    // while setFormula(null) under bulk still unregisters (formula-kind
    // notifications are never dropped).
    const workbook = new GC.Spread.Sheets.Workbook();
    const sheet = workbook.getActiveSheet();
    sheet.setRowCount(9001);
    sheet.suspendCalcService();
    for (let r = 0; r < 9000; r++) sheet.setValue(r, 0, r);
    for (let r = 0; r < 20; r++) sheet.setFormula(r, 1, '=A' + (r + 1) + '*2');
    for (let r = 0; r < 10; r++) sheet.setValue(r, 1, 'plain' + r);
    for (let r = 10; r < 20; r++) sheet.setFormula(r, 1, null);
    sheet.resumeCalcService();
    for (let r = 0; r < 10; r++) {
      expect(sheet.getFormula(r, 1)).toBe('A' + (r + 1) + '*2');
      expect(sheet.getValue(r, 1)).toBe(r * 2);
    }
    for (let r = 10; r < 20; r++) {
      expect(sheet.getFormula(r, 1)).toBeNull();
      expect(sheet.getValue(r, 1)).toBeNull();
    }
  });

  it('keeps precise incremental recalculation below the threshold', () => {
    const workbook = new GC.Spread.Sheets.Workbook();
    const sheet = workbook.getActiveSheet();
    sheet.setFormula(0, 5, '=A1*2');
    let valueChanges = 0;
    sheet.bind(SS.Events.ValueChanged, (_e, info) => {
      if ((info as { row?: number }).row === 0 && (info as { col?: number }).col === 5) valueChanges++;
    });
    sheet.suspendCalcService();
    for (let r = 0; r < 500; r++) sheet.setValue(r, 0, r + 1);
    sheet.resumeCalcService();
    expect(sheet.getValue(0, 5)).toBe(2);
    expect(valueChanges).toBeGreaterThan(0);
  });
});

describe('ordered sparse-grid traversal (TASK 78)', () => {
  it('iterates a SparseGrid in (row, col) order whatever the insertion order', () => {
    const grid = new SparseGrid<number>();
    for (const [row, col] of [[5, 300], [300, 1], [5, 2], [5, 1], [0, 9], [256, 0]] as const) grid.set(row, col, row * 10 + col);
    expect([...grid.orderedEntries()].map(([r, c]) => [r, c])).toEqual([[0, 9], [5, 1], [5, 2], [5, 300], [256, 0], [300, 1]]);
    expect([...grid.orderedEntries(true)].map(([r, c]) => [r, c])).toEqual([[300, 1], [256, 0], [5, 300], [5, 2], [5, 1], [0, 9]]);
  });

  it('merges numeric, overflow and metadata stores of a CellStore in row order', () => {
    const cells = new CellStore<{ value?: unknown; tag?: unknown }>();
    cells.setValue(4, 0, 40);
    cells.setValue(4, 3, 43); // overflow column for row 4
    cells.setValue(1, 2, 'one-two');
    cells.setValue(1, 0, 10);
    cells.setValue(7, 1, 70);
    cells.set(2, 2, { value: 'styled', tag: 'x' });
    const seen = [...cells.orderedEntries()].map(([r, c]) => [r, c]);
    expect(seen).toEqual([[1, 0], [1, 2], [2, 2], [4, 0], [4, 3], [7, 1]]);
    expect([...cells.orderedEntries(true)].map(([r, c]) => [r, c])).toEqual([...seen].reverse());
  });

  it('finds interleaved numeric and text matches in scan order after reverse insertion', () => {
    const workbook = new GC.Spread.Sheets.Workbook();
    const sheet = workbook.getActiveSheet();
    // insert bottom-up so the raw storage order is the reverse of the scan order
    for (let r = 199; r >= 0; r--) sheet.setValue(r, r % 7, r % 13 === 0 ? `hit ${r}` : r);
    const cond = new SS.Search.SearchCondition();
    cond.searchString = 'hit';
    const hits: number[] = [];
    let row = 0;
    for (let guard = 0; guard < 100; guard++) {
      cond.rowStart = row;
      cond.columnStart = 0;
      const res = sheet.search(cond);
      if (!res || res.foundRowIndex < 0) break;
      hits.push(res.foundRowIndex);
      row = res.foundRowIndex + 1;
    }
    expect(hits).toEqual([0, 13, 26, 39, 52, 65, 78, 91, 104, 117, 130, 143, 156, 169, 182, 195]);
    // backwards scan of the same window starts at the last row (trial semantics:
    // rowStart/columnStart bound the window; nOrder walks it from its far end)
    cond.searchOrder = SS.Search.SearchOrder.nOrder;
    cond.rowStart = 0;
    cond.columnStart = 0;
    const back = sheet.search(cond)!;
    expect(back.foundRowIndex).toBe(195);
  });
});
