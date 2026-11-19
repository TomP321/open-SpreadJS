// @vitest-environment jsdom
/* Unit tests for the pivot area interaction (TASK 42 item 2): drill hit
 * testing + collapse, the "Select field" dropdown DOM and its label filter,
 * `getRangePivotAreas` shapes and double-click drill-down sheets. */
import { describe, expect, it } from 'vitest';
import GC from '../src/index.js';
import { pivotHit, openPivotFilterDropdown } from '../src/pivot/interaction.js';
import { Range } from '../src/primitives.js';
import type { Worksheet } from '../src/worksheet.js';

const { Workbook } = GC.Spread.Sheets;
type SheetT = Worksheet;

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

function build() {
  const wb = new Workbook(undefined, { sheetCount: 2 });
  const data = wb.getSheet(0);
  data.name('Data');
  data.setArray(0, 0, SALES);
  data.tables.add('sourceData', 0, 0, SALES.length, 5);
  const sheet = wb.getSheet(1);
  sheet.name('Pivot');
  return { wb, data, sheet };
}

/** Cell rectangle grid: every cell 64x20 starting after 40/20 headers. */
function fakeView(sheet: SheetT) {
  return {
    sheet,
    cellRect: (row: number, col: number) => ({ x: 40 + col * 64, y: 20 + row * 20, width: 64, height: 20 }),
    root: document.createElement('div'),
    zoom: 1,
    width: 1000,
    height: 600,
    clientWidth: 1000,
  };
}

describe('pivot drill hit-testing', () => {
  it('toggles collapse through the drill button hit data', () => {
    const { sheet } = build();
    const pt = sheet.pivotTables.add('p1', 'sourceData', 1, 1, 0, 'Medium2');
    pt.add('Buyer', 'Buyer', 1);
    pt.add('Type', 'Type', 1);
    pt.add('Amount', 'Amount', 3, 8);
    const cells = pt._layoutCells().filter(c => c.expand !== undefined);
    expect(cells.length).toBeGreaterThan(0);
    const dad = cells.find(c => c.drillItem === 'Dad' && c.drillField === 'Buyer');
    expect(dad).toBeTruthy();
    const view = fakeView(sheet);
    const anchor = pt._position();
    const rect = view.cellRect(anchor.row + dad!.row, anchor.col + dad!.col);
    const x = rect.x + (dad!.drillOffset ?? 11) + 4;
    const y = rect.y + rect.height / 2;
    const self = { view } as never;
    const hit = pivotHit(self, x, y);
    expect(hit?.kind).toBe('drill');
    expect(hit?.cell.drillItem).toBe('Dad');
    // apply like the interaction wrapper does
    pt.collapse(dad!.drillField!, dad!.drillItem!, !(dad!.collapsed ?? false));
    expect(pt.collapse('Buyer', 'Dad')).toBe(true);
    const expanded = pt._layoutCells().find(c => c.drillItem === 'Dad' && c.expand !== undefined);
    expect(expanded?.collapsed).toBe(true);
    void pt.getRange();
  });

  it('hits the filter button on the Row Labels header', () => {
    const { sheet } = build();
    const pt = sheet.pivotTables.add('p1', 'sourceData', 1, 1, 0, 'Medium2');
    pt.add('Buyer', 'Buyer', 1);
    pt.add('Amount', 'Amount', 3, 8);
    const cell = pt._layoutCells().find(c => c.kind === 'corner' && c.filterButton);
    expect(cell).toBeTruthy();
    const view = fakeView(sheet);
    const anchor = pt._position();
    const rect = view.cellRect(anchor.row + cell!.row, anchor.col + cell!.col);
    // the trial draws the button right behind the header caption, clamped
    // inside the cell: box x = rect.x + min(max(textW+7, ...), w-17)
    const x = rect.x + Math.min(10 * 7 + 7, 64 - 17) + 7;
    const y = rect.y + rect.height / 2;
    const hit = pivotHit({ view } as never, x, y);
    expect(hit?.kind).toBe('filter');
  });
});

describe('pivot filter dropdown', () => {
  it('builds the Select field panel and applies the checkbox filter on OK', () => {
    const { sheet } = build();
    const pt = sheet.pivotTables.add('p1', 'sourceData', 1, 1, 0, 'Medium2');
    pt.add('Buyer', 'Buyer', 1);
    pt.add('Amount', 'Amount', 3, 8);
    const host = document.createElement('div');
    document.body.append(host);
    openPivotFilterDropdown(pt, 'Buyer', host, 10, 40);
    const panel = host.querySelector('.gc-pivot-filter-panel') as HTMLElement;
    expect(panel).toBeTruthy();
    expect(panel.textContent).toContain('Select field');
    expect(panel.textContent).toContain('Sort A to Z');
    expect(panel.textContent).toContain('Sort Z to A');
    expect(panel.textContent).toContain('More Sort Options...');
    expect(panel.textContent).toContain('Clear Filter From "Buyer"');
    expect(panel.textContent).toContain('Label Filters');
    expect(panel.textContent).toContain('Value Filters');
    expect(panel.textContent).toContain('Check All');
    expect(panel.textContent).toContain('Uncheck All');
    const boxes = [...panel.querySelectorAll('input[type=checkbox]')] as HTMLInputElement[];
    expect(boxes.map(b => b.value)).toEqual(['Dad', 'Kelly', 'Mom']);
    expect(boxes.every(b => b.checked)).toBe(true);
    // uncheck Kelly and press OK -> label filter set
    boxes[1]!.checked = false;
    (panel.querySelector('button') as HTMLButtonElement).click(); // OK is the first button
    expect(pt.labelFilter('Buyer')).toEqual({ textItem: { list: ['Dad', 'Mom'], isAll: false } });
    const gridRows: unknown[] = [];
    const range = pt.getRange().content as unknown as { row: number; col: number; rowCount: number };
    for (let r = 0; r < range.rowCount; r++) gridRows.push(sheet.getValue(range.row + r, 1));
    expect(gridRows).not.toContain('Kelly');
  });

  it('Sort Z to A applies the descending sort', () => {
    const { sheet } = build();
    const pt = sheet.pivotTables.add('p1', 'sourceData', 1, 1, 0, 'Medium2');
    pt.add('Buyer', 'Buyer', 1);
    pt.add('Amount', 'Amount', 3, 8);
    const host = document.createElement('div');
    document.body.append(host);
    openPivotFilterDropdown(pt, 'Buyer', host, 10, 40);
    const panel = host.querySelector('.gc-pivot-filter-panel') as HTMLElement;
    const rows = [...panel.querySelectorAll('div')]
      .filter(d => !d.querySelector('div') && Array.from(d.children).some(sp => (sp as HTMLElement).textContent === 'Sort Z to A'));
    expect(rows.length).toBeGreaterThan(0);
    (rows[0] as HTMLElement).click();
    expect(pt.sort('Buyer', undefined as never)).toEqual({ sortType: 1 });
  });
});

describe('getRangePivotAreas (trial shapes)', () => {
  const withPivot = () => {
    const { sheet } = build();
    const pt = sheet.pivotTables.add('ap', 'sourceData', 1, 1, 0, 'Medium2');
    pt.add('Buyer', 'Buyer', 1);
    pt.add('Type', 'Type', 2);
    pt.add('Amount', 'Amount', 3, 8);
    return { sheet, pt };
  };

  it('lists corner, buttons, column-labels, item labels, grand and data areas', () => {
    const { sheet, pt } = withPivot();
    const c = pt.getRange().content as unknown as { row: number; col: number; rowCount: number; colCount: number };
    const areas = sheet.pivotTables.getRangePivotAreas(new Range(c.row, c.col, c.rowCount, c.colCount));
    const list = areas[String(pt.name())];
    expect(list[0]).toEqual({ type: 5, labelOnly: true });
    expect(list[1]).toEqual({ type: 1, labelOnly: true, fieldName: 'Buyer' });
    expect(list[2]).toEqual({ type: 1, labelOnly: true, fieldName: 'Type' });
    expect(list).toContainEqual({ type: 7 });
    expect(list).toContainEqual({ labelOnly: true, references: [{ fieldName: 'Type', items: ['Books', 'Food', 'Fuel', 'Sports'] }] });
    expect(list).toContainEqual({ labelOnly: true, grandCol: true });
    expect(list).toContainEqual({ labelOnly: true, references: [{ fieldName: 'Buyer', items: ['Dad', 'Kelly', 'Mom'] }] });
    expect(list).toContainEqual({ labelOnly: true, grandRow: true });
    expect(list[list.length - 1]).toEqual({});
  });

  it('returns {} outside every pivot', () => {
    const { sheet } = withPivot();
    expect(sheet.pivotTables.getRangePivotAreas(new Range(50, 5, 2, 2))).toEqual({});
  });
});

describe('pivot drill-down details', () => {
  it('_showDetails writes a details sheet named after the item', () => {
    const { wb, sheet } = build();
    const pt = sheet.pivotTables.add('p1', 'sourceData', 1, 1, 0, 'Medium2');
    pt.add('Buyer', 'Buyer', 1);
    pt.add('Amount', 'Amount', 3, 8);
    const c = pt.getRange().content as unknown as { row: number; col: number };
    expect(pt._showDetails(c.row + 1, c.col + 1)).toBe(true);
    expect(wb.getSheetCount()).toBe(3);
    const detail = wb.getSheet(2);
    expect(detail.name()).toBe('Dad Details');
    expect(detail.getValue(0, 0)).toBe('Date');
    expect(detail.getValue(1, 1)).toBe('Dad');
    // a second drill on the same item gets a numbered sheet
    expect(pt._showDetails(c.row + 1, c.col + 1)).toBe(true);
    expect(wb.getSheet(2).name()).toBe('Dad Details 2');
    // label cells have no node -> nothing happens
    expect(pt._showDetails(c.row + 1, c.col)).toBe(false);
  });
});
