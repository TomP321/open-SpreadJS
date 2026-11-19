import { describe, expect, it } from 'vitest';
import GC, { Spread } from '../src/index.js';
import type { Worksheet } from '../src/worksheet.js';
import { evaluateCalcFormula, calcFormulaFieldNames, parseCalcFormula } from '../src/pivot/calc.js';
import type { CalcValue } from '../src/pivot/calc.js';

const { Workbook } = Spread.Sheets;
type SheetT = Worksheet;
const Pivot = GC.Spread.Pivot as unknown as typeof import('../src/pivot/types.js');

/* Same fixture as the TASK 41 pivot tests (the trial docs sample). */
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

const add = (sheet: SheetT, name = 'pivot1', source = 'sourceData') =>
  sheet.pivotTables.add(name, source as never, 1, 1, Pivot.PivotTableLayoutType.compact, 'Medium2');

/** Read the pivot content rectangle as plain values. */
function grid(sheet: SheetT, name = 'pivot1'): (string | number | null)[][] {
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

describe('pivot calc formula parser', () => {
  it('parses arithmetic with field names containing spaces', () => {
    expect(parseCalcFormula('=Amount/2')).toBeTruthy();
    const value = evaluateCalcFormula('=Sum of Amount/2', {
      field: (name): CalcValue => (name === 'Sum of Amount' ? 100 : null),
      item: () => null,
    });
    expect(value).toBe(50);
  });

  it('resolves Field[Item] references', () => {
    const names = calcFormulaFieldNames('=Buyer[Mom]+Buyer[Dad]');
    expect(names).toContain('Buyer');
    const value = evaluateCalcFormula('=Buyer[Mom]+Buyer[Dad]', {
      field: () => 0,
      item: (_field, item): CalcValue => (item === 'Mom' ? 7 : 5),
    });
    expect(value).toBe(12);
  });

  it('supports comparisons and functions', () => {
    const value = evaluateCalcFormula('=IF(Amount>10,"big","small")', {
      field: (name): CalcValue => (name === 'Amount' ? 42 : 0),
      item: () => null,
    });
    expect(value).toBe('big');
    expect(evaluateCalcFormula('=ROUND(Amount/4,2)', {
      field: () => 7,
      item: () => null,
    })).toBe(1.75);
  });

  it('returns null for division by zero through ctx.error', () => {
    expect(evaluateCalcFormula('=Amount/0', {
      field: () => 5,
      item: () => null,
      error: () => '#DIV/0!',
    })).toBe('#DIV/0!');
  });
});

describe('pivot calculated fields', () => {
  it('adds a calc field, lists it and evaluates it per node', () => {
    const { sheet } = build();
    const pt = add(sheet);
    pt.add('Buyer', 'Buyer', 1);
    pt.add('Amount', 'Sum of Amount', 3, 8);
    pt.addCalcField('Ratio', '=Amount/2');
    expect(pt.getCalcFields()).toEqual([{ fieldName: 'Ratio', formula: '=Amount/2' }]);
    const ratioField = pt.getSourceFields().find(f => f.name === 'Ratio');
    expect(ratioField?.fieldType).toBe(0 /* isCalcField */);
    pt.add('Ratio', 'Sum of Ratio', 3, 8);
    const rows = grid(sheet);
    expect(rows[0]).toEqual(['Row Labels', 'Sum of Amount', 'Sum of Ratio']);
    expect(rows[1]).toEqual(['Dad', 388, 194]);
    expect(rows[2]).toEqual(['Kelly', 221, 110.5]);
    expect(rows[3]).toEqual(['Mom', 439, 219.5]);
    expect(rows[4]).toEqual(['Grand Total', 1048, 524]);
  });

  it('ignores formulas that reference value-area captions like the trial', () => {
    const { sheet } = build();
    const pt = add(sheet);
    pt.addCalcField('Half', '=Sum of Amount/2');
    expect(pt.getCalcFields()).toEqual([]);
    expect(pt.getSourceFields().some(f => f.name === 'Half')).toBe(false);
  });

  it('removes a calc field and its values', () => {
    const { sheet } = build();
    const pt = add(sheet);
    pt.add('Buyer', 'Buyer', 1);
    pt.add('Amount', 'Amount', 3, 8);
    pt.addCalcField('Ratio', '=Amount/2');
    pt.add('Ratio', 'Ratio', 3, 8);
    expect(grid(sheet)[1]).toEqual(['Dad', 388, 194]);
    pt.removeCalcField('Ratio');
    expect(pt.getCalcFields()).toEqual([]);
    expect(grid(sheet).map(row => row.length)).toEqual([2, 2, 2, 2, 2]);
  });

  it('supports calc fields referencing other calc fields', () => {
    const { sheet } = build();
    const pt = add(sheet);
    pt.add('Buyer', 'Buyer', 1);
    pt.add('Amount', 'Amount', 3, 8);
    pt.addCalcField('Half', '=Amount/2');
    pt.addCalcField('Quarter', '=Half/2');
    pt.add('Quarter', 'Quarter', 3, 8);
    expect(grid(sheet)[0]).toEqual(['Row Labels', 'Amount', 'Quarter']);
    expect(grid(sheet)[1]).toEqual(['Dad', 388, 97]);
  });
});

describe('pivot calculated items', () => {
  it('adds a calc item first in the sorted grid and includes it in totals', () => {
    const { sheet } = build();
    const pt = add(sheet);
    pt.add('Buyer', 'Buyer', 1);
    pt.add('Amount', 'Sum of Amount', 3, 8);
    pt.addCalcItem('Buyer', 'Both', '=Buyer[Mom]+Buyer[Dad]');
    expect(pt.getCalcItems()).toEqual([{
      sourceName: 'Buyer', calcItemName: 'Both', formula: '=Buyer[Mom]+Buyer[Dad]', priority: 1,
    }]);
    expect(pt.getCalcItems('Buyer')).toHaveLength(1);
    expect(pt.getItemsByField('Buyer')).toEqual(['Mom', 'Dad', 'Kelly', 'Both']);
    expect(grid(sheet)).toEqual([
      ['Row Labels', 'Sum of Amount'],
      ['Both', 827],
      ['Dad', 388],
      ['Kelly', 221],
      ['Mom', 439],
      ['Grand Total', 1875],
    ]);
  });

  it('hides calc item values and excludes them from totals when aggregation is exclude', () => {
    const { sheet } = build();
    const pt = add(sheet);
    pt.add('Buyer', 'Buyer', 1);
    pt.add('Amount', 'Sum of Amount', 3, 8);
    pt.addCalcItem('Buyer', 'Both', '=Buyer[Mom]+Buyer[Dad]');
    pt.options.calcItemAggregation = 1; /* exclude */
    pt.refresh();
    expect(grid(sheet)).toEqual([
      ['Row Labels', 'Sum of Amount'],
      ['Both', null],
      ['Dad', 388],
      ['Kelly', 221],
      ['Mom', 439],
      ['Grand Total', 1048],
    ]);
  });

  it('updates and removes calc items', () => {
    const { sheet } = build();
    const pt = add(sheet);
    pt.add('Buyer', 'Buyer', 1);
    pt.add('Amount', 'Sum of Amount', 3, 8);
    pt.addCalcItem('Buyer', 'Both', '=Buyer[Mom]+Buyer[Dad]');
    pt.updateCalcItem('Buyer', 'Both', '=Buyer[Mom]*2', 2);
    expect(pt.getCalcItems('Buyer')[0]).toMatchObject({ formula: '=Buyer[Mom]*2', priority: 1 });
    expect(grid(sheet)).toEqual([
      ['Row Labels', 'Sum of Amount'],
      ['Both', 878],
      ['Dad', 388],
      ['Kelly', 221],
      ['Mom', 439],
      ['Grand Total', 1926],
    ]);
    pt.removeCalcItem('Buyer', 'Both');
    expect(pt.getCalcItems()).toEqual([]);
    expect(grid(sheet).map(row => row[0])).toEqual(['Row Labels', 'Dad', 'Kelly', 'Mom', 'Grand Total']);
  });
});

describe('pivot grouping', () => {
  const dateBuild = () => build(DATES, 'sales');

  it('groups dates by years with boundary groups in the cache only', () => {
    const { sheet } = dateBuild();
    const pt = add(sheet, 'gp', 'sales');
    pt.group({ originFieldName: 'Date', dateGroups: [{ by: 6 /* years */ }] });
    expect(pt.getSourceFields()).toEqual([
      { name: 'Date' }, { name: 'Buyer' }, { name: 'Amount' }, { name: 'Years (Date)', fieldType: 1 },
    ]);
    pt.add('Years (Date)', 'Years (Date)', 1);
    pt.add('Amount', 'Amount', 3, 8);
    expect(pt.getItemsByField('Years (Date)')).toEqual(['<1/5/2022', '2022', '2023', '>12/30/2023']);
    expect(grid(sheet, 'gp')).toEqual([
      ['Row Labels', 'Amount'],
      ['2022', 450],
      ['2023', 520],
      ['Grand Total', 970],
    ]);
    const info = pt.getField('Years (Date)')!;
    expect(info.dataType).toBe(Pivot.PivotDataType.date);
    expect(info.start).toBeInstanceOf(Date);
    expect((info.start as Date).getFullYear()).toBe(2022);
  });

  it('groups dates by quarters and months hiding empty buckets', () => {
    const { sheet } = dateBuild();
    const pt = add(sheet, 'gp', 'sales');
    pt.group({ originFieldName: 'Date', dateGroups: [{ by: 5 /* quarters */ }, { by: 4 /* months */ }] });
    expect(pt.getSourceFields().map(f => f.name)).toEqual(['Date', 'Buyer', 'Amount', 'Months (Date)', 'Quarters (Date)']);
    pt.add('Quarters (Date)', 'Quarters (Date)', 1);
    pt.add('Months (Date)', 'Months (Date)', 1);
    pt.add('Amount', 'Amount', 3, 8);
    expect(grid(sheet, 'gp')).toEqual([
      ['Row Labels', 'Amount'],
      ['Qtr1', null],
      ['Jan', 100],
      ['Feb', 120],
      ['Qtr1 Total', 220],
      ['Qtr2', null],
      ['Apr', 150],
      ['Jun', 180],
      ['Qtr2 Total', 330],
      ['Qtr4', null],
      ['Nov', 200],
      ['Dec', 220],
      ['Qtr4 Total', 420],
      ['Grand Total', 970],
    ]);
  });

  it('stacks years, quarters and months with per-level subtotals (trial multiGrid)', () => {
    const { sheet } = dateBuild();
    const pt = add(sheet, 'ga', 'sales');
    pt.group({ originFieldName: 'Date', dateGroups: [{ by: 6 }, { by: 5 }, { by: 4 }] });
    pt.add('Years (Date)', 'Years (Date)', 1);
    pt.add('Quarters (Date)', 'Quarters (Date)', 1);
    pt.add('Months (Date)', 'Months (Date)', 1);
    pt.add('Amount', 'Amount', 3, 8);
    expect(grid(sheet, 'ga')).toEqual([
      ['Row Labels', 'Amount'],
      ['2022', null],
      ['Qtr1', null],
      ['Jan', 100],
      ['Qtr1 Total', 100],
      ['Qtr2', null],
      ['Apr', 150],
      ['Qtr2 Total', 150],
      ['Qtr4', null],
      ['Nov', 200],
      ['Qtr4 Total', 200],
      ['2022 Total', 450],
      ['2023', null],
      ['Qtr1', null],
      ['Feb', 120],
      ['Qtr1 Total', 120],
      ['Qtr2', null],
      ['Jun', 180],
      ['Qtr2 Total', 180],
      ['Qtr4', null],
      ['Dec', 220],
      ['Qtr4 Total', 220],
      ['2023 Total', 520],
      ['Grand Total', 970],
    ]);
  });

  it('groups dates by days', () => {
    const { sheet } = dateBuild();
    const pt = add(sheet, 'gp', 'sales');
    pt.group({ originFieldName: 'Date', dateGroups: [{ by: 3 /* days */ }] });
    pt.add('Days (Date)', 'Days (Date)', 1);
    pt.add('Amount', 'Amount', 3, 8);
    const rows = grid(sheet, 'gp');
    expect(rows[1]).toEqual(['5-Jan', 100]);
    expect(rows.length).toBe(8); // 6 data days + header + grand total
  });

  it('groups numbers by step with boundary groups', () => {
    const fixture = [['Product', 'Qty'], ['A', 10], ['B', 55], ['C', 120], ['D', 160], ['E', 240], ['F', 400], ['G', 80]];
    const { sheet } = build(fixture, 'nums');
    const pt = add(sheet, 'gn', 'nums');
    pt.group({ originFieldName: 'Qty', numberGroup: { start: 0, end: 499, by: 250 } });
    expect(pt.getSourceFields().find(f => f.name === 'Qty')?.fieldType).toBe(1 /* isGroupField */);
    pt.add('Qty', 'Qty', 1);
    pt.add('Qty', 'Sum of Qty', 3, 8);
    expect(pt.getItemsByField('Qty')).toEqual(['<0', '0-249', '250-499', '>500']);
    expect(grid(sheet, 'gn')).toEqual([
      ['Row Labels', 'Sum of Qty'],
      ['0-249', 665],
      ['250-499', 400],
      ['Grand Total', 1065],
    ]);
    // the cache keeps the raw numeric entities under the fieldGroup
    const cache = (sheet.parent as unknown as { toJSON(): { pivotCaches: Record<string, { fields: { name: string; fieldGroup?: unknown; entities?: { value: unknown }[] }[] }> } }).toJSON().pivotCaches;
    const qtyField = Object.values(cache).flatMap(c => c.fields).find(f => f.name === 'Qty')!;
    expect(qtyField.fieldGroup).toMatchObject({ startNum: 0, endNum: 499, groupInterval: 250, hasRangeGroup: true, base: 1 });
    expect(qtyField.entities).toEqual([]);
  });

  it('text-groups items and gives ungrouped items their own group', () => {
    const fixture = [['Buyer', 'Amount'], ['Mom', 100], ['Dad', 150], ['Kelly', 200], ['Tim', 250]];
    const { sheet } = build(fixture, 'tx');
    const pt = add(sheet, 'gt', 'tx');
    pt.group({ originFieldName: 'Buyer', textGroup: { fieldName: 'Group', groupItems: { parent: ['Mom', 'Dad'], children: ['Kelly'] } } });
    expect(pt.getSourceFields().map(f => f.name)).toEqual(['Buyer', 'Amount', 'Group']);
    pt.add('Group', 'Group', 1);
    pt.add('Buyer', 'Buyer', 1);
    pt.add('Amount', 'Amount', 3, 8);
    expect(grid(sheet, 'gt')).toEqual([
      ['Row Labels', 'Amount'],
      ['parent', null],
      ['Dad', 150],
      ['Mom', 100],
      ['parent Total', 250],
      ['children', null],
      ['Kelly', 200],
      ['children Total', 200],
      ['Tim', null],
      ['Tim', 250],
      ['Tim Total', 250],
      ['Grand Total', 700],
    ]);
  });

  it('ungroups back to the raw items', () => {
    const { sheet } = dateBuild();
    const pt = add(sheet, 'gp', 'sales');
    pt.group({ originFieldName: 'Date', dateGroups: [{ by: 6 }] });
    pt.add('Years (Date)', 'Years (Date)', 1);
    pt.add('Amount', 'Amount', 3, 8);
    pt.ungroup('Date');
    expect(pt.getSourceFields().map(f => f.name)).toEqual(['Date', 'Buyer', 'Amount']);
    expect(pt.getFieldsByArea(1)).toEqual([]);
  });
});

describe('pivot views', () => {
  it('adds, saves, gets, applies and removes views', () => {
    const { sheet } = build();
    const pt = add(sheet);
    pt.add('Buyer', 'Buyer', 1);
    pt.add('Amount', 'Amount', 3, 8);
    const views = pt.views;
    expect(views.add({ name: 'v1', config: pt.serialize() })).toBe(true);
    pt.layoutType(Pivot.PivotTableLayoutType.tabular);
    expect(views.add({ name: 'v2', config: pt.serialize() })).toBe(true);
    expect(views.add({ name: 'v1', config: pt.serialize() })).toBe(false);
    expect(views.all().map(v => v.name)).toEqual(['v1', 'v2']);
    expect(views.get('v1')?.config.layoutType).toBe(Pivot.PivotTableLayoutType.compact);
    expect(views.save('v3')).toBe(true);
    expect(pt.layoutType()).toBe(Pivot.PivotTableLayoutType.tabular);
    views.apply('v1');
    expect(pt.layoutType()).toBe(Pivot.PivotTableLayoutType.compact);
    expect(grid(sheet)).toEqual([
      ['Row Labels', 'Amount'],
      ['Dad', 388],
      ['Kelly', 221],
      ['Mom', 439],
      ['Grand Total', 1048],
    ]);
    views.remove('v1');
    expect(views.all().map(v => v.name)).toEqual(['v2', 'v3']);
    views.apply('nope'); // like the trial: no-op
    views.remove('nope'); // no error
    // views land in the sheet JSON
    const json = (sheet.parent as unknown as { toJSON(): Record<string, unknown> }).toJSON() as unknown as { sheets: Record<string, { pivotTables?: { name: string; views?: { name: string }[] }[] }> };
    const entry = Object.values(json.sheets).flatMap(s => s.pivotTables ?? []).find(t => t.name === 'pivot1')!;
    expect(entry.views!.map(v => v.name)).toEqual(['v2', 'v3']);
  });
});

describe('GETPIVOTDATA (TASK 42 item 3)', () => {
  function buildPivot(rows: [number, number, string][]): SheetT {
    const { sheet } = build();
    const pt = add(sheet);
    pt.add('Buyer', 'Buyer', 1);
    pt.add('Amount', 'Amount', 3, 8);
    for (const [r, c, f] of rows) sheet.setFormula(r, c, f);
    return sheet;
  }
  const at = (sheet: SheetT, r = 5, c = 5) => sheet.getValue(r, c);

  it('reads grand totals and item values; rejects numeric items and wrong case like the trial', () => {
    const sheet = buildPivot([
      [5, 5, '=GETPIVOTDATA("Amount", B2)'],
      [5, 6, '=GETPIVOTDATA("Amount", B2, "Buyer", "Mom")'],
      [5, 7, '=GETPIVOTDATA("Amount", B2, "Buyer", 1)'],
      [5, 8, '=GETPIVOTDATA("amount", B2, "buyer", "mom")'],
    ]);
    expect(at(sheet)).toBe(1048);
    expect(at(sheet, 5, 6)).toBe(439);
    expect(String(at(sheet, 5, 7))).toBe('#REF!'); // the trial rejects numeric item indexes
    expect(String(at(sheet, 5, 8))).toBe('#REF!'); // names and items are case-sensitive
  });

  it('answers #REF! for unknown items, and there is no "Data" pseudo-field', () => {
    const sheet = buildPivot([
      [5, 5, '=GETPIVOTDATA("Amount", B2, "Buyer", "Nobody")'],
      [5, 6, '=GETPIVOTDATA("", B2, "Data", "Amount", "Buyer", "Dad")'],
      [5, 7, '=GETPIVOTDATA("Amount", B2, "Data", "Amount", "Buyer", "Dad")'],
    ]);
    expect(String(at(sheet))).toBe('#REF!');
    expect(String(at(sheet, 5, 6))).toBe('#REF!');
    expect(String(at(sheet, 5, 7))).toBe('#REF!');
  });

  it('honours the Excel aggregation rule: omitted axis fields fall back to their total', () => {
    const { sheet } = build();
    const pt = add(sheet);
    pt.add('Buyer', 'Buyer', 1);
    pt.add('Type', 'Type', 2);
    pt.add('Amount', 'Amount', 3, 8);
    sheet.setFormula(5, 5, '=GETPIVOTDATA("Amount", B2, "Buyer", "Mom", "Type", "Fuel")');
    sheet.setFormula(5, 6, '=GETPIVOTDATA("Amount", B2, "Type", "Fuel", "Buyer", "Mom")');
    sheet.setFormula(5, 7, '=GETPIVOTDATA("Amount", B2, "Buyer", "Mom")');
    sheet.setFormula(5, 8, '=GETPIVOTDATA("Amount", B2, "Type", "Food")');
    sheet.setFormula(5, 9, '=GETPIVOTDATA("Amount", B2, "Buyer", "(all)")');
    expect(sheet.getValue(5, 5)).toBe(74);
    expect(sheet.getValue(5, 6)).toBe(74);
    expect(sheet.getValue(5, 7)).toBe(439); // Mom row grand total across Types
    expect(sheet.getValue(5, 8)).toBe(381); // Food column grand total across Buyers
    expect(String(sheet.getValue(5, 9))).toBe('#REF!'); // the trial has no "(all)" pseudo-item
  });

  it('uses the referenced data cell as the position and follows overwrites', () => {
    const { sheet } = build();
    const pt = add(sheet);
    pt.add('Buyer', 'Buyer', 1);
    pt.add('Amount', 'Amount', 3, 8);
    const content = pt.getRange().content as unknown as { row: number; col: number };
    sheet.setFormula(5, 5, `=GETPIVOTDATA("Amount", ${indexToColumn(content.col + 1)}${content.row + 2}, "Buyer", "Kelly")`);
    expect(sheet.getValue(5, 5)).toBe(221);
    const node = pt.getNodeInfo(content.row + 1, content.col + 1)!; // Dad row
    pt.setNodeValue(node, 400);
    sheet.setFormula(5, 6, `=GETPIVOTDATA("Amount", ${indexToColumn(content.col + 1)}${content.row + 2})`);
    expect(sheet.getValue(5, 6)).toBe(400); // overwrite respected through the implicit cell
  });

  it('errors for a reference outside a pivot table', () => {
    const { sheet } = build();
    add(sheet);
    sheet.setFormula(5, 5, '=GETPIVOTDATA("Amount", Z99)');
    expect(String(sheet.getValue(5, 5))).toBe('#REF!');
  });
});

function indexToColumn(index: number): string {
  let name = '';
  for (let i = index; i >= 0; i = Math.floor(i / 26) - 1) name = String.fromCharCode(65 + (i % 26)) + name;
  return name;
}
