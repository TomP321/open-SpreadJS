/**
 * TASK 93 item 1: the PivotTable Analyze ▸ Group dialog. Expectations come from
 * black-box measurements on the running trial (apps/designer-compare, server
 * 5186, `?side=official`): dialog title "Grouping"; date fields get Auto +
 * Starting at / Ending at (checked, pre-filled with the field min/max as
 * m/d/yyyy) + a multi-select Seconds..Years list (Months/Quarters/Years
 * pre-selected on date-only data) + Number of days; number fields get the
 * header rows with a single By input (50/200/10 measured). OK replaces the
 * origin row field with `<Unit> (<Origin>)` fields newest-unit-first
 * (Years, Quarters, Months — measured) and keeps the other fields' order.
 */
// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from 'vitest';
import GC from '@mescius/spread-sheets';
import { executeDesignerSpecial } from '../src/designer-commands.js';
import { applyPivotGrouping, showPivotGrouping } from '../src/pivot-designer.js';
import { stubCanvas2d } from './canvas-stub.js';

stubCanvas2d();

const P = (GC as any).Spread.Pivot;

/** Source: 12 date rows (2022-01-03 .. 2023-06-05), Amount 50..200, Region. */
const SOURCE = (() => {
  const rows: (string | number | Date)[][] = [['SaleDate', 'Amount', 'Region']];
  for (let y = 0; y < 2; y++) for (let m = 0; m < 6; m++) rows.push([new Date(2022 + y, m, 3 + (m % 3)), 50 + m * 25 + y * 50, m % 2 ? 'N' : 'S']);
  return rows;
})();

interface Recorded { name: string; data: any; ok: (data: any) => void }

function setup(): { workbook: any; sheet: any; pivot: any; designer: any; opened: Recorded[]; boxes: string[] } {
  const workbook = new (GC as any).Spread.Sheets.Workbook();
  const sheet: any = workbook.getActiveSheet();
  sheet.name('Data');
  SOURCE.forEach((row, r) => row.forEach((value, c) => sheet.setValue(r, c, value)));
  sheet.tables.add('Source1', 0, 0, SOURCE.length, 3, undefined, { showHeader: true });
  sheet.pivotTables.add('PivotTable1', 'Source1', 14, 1, P.PivotTableLayoutType.tabular, P.PivotTableThemes.medium2, { showRowHeader: true, showColumnHeader: true });
  const pivot = sheet.pivotTables.get('PivotTable1');
  pivot.add('SaleDate', 'SaleDate', P.PivotTableFieldType.rowField);
  pivot.add('Amount', 'Amount', P.PivotTableFieldType.rowField);
  pivot.add('Amount', 'Sum of Amount', P.PivotTableFieldType.valueField, 8);
  // The active cell sits on the first label column (the SaleDate items).
  sheet.setActiveCell(15, 1);
  sheet.setSelection(15, 1, 1, 1);

  const opened: Recorded[] = [];
  const boxes: string[] = [];
  const designer: any = {
    gc: GC,
    spreadsheet: workbook,
    getWorkbook: () => workbook,
    invalidate: () => undefined,
    opened,
    showDialog: (name: string, data: any, success: (data: any) => void) => { const record = { name, data, ok: success }; opened.push(record); return record; },
    closeDialog: () => undefined,
    showMessageBox: (text: string) => { boxes.push(String(text)); },
  };
  return { workbook, sheet, pivot, designer, opened, boxes };
}

const fieldNames = (pivot: any): string[] => pivot.getFieldsByArea().map((f: any) => f.fieldName);

describe('TASK 93 pivot Grouping dialog', () => {
  it('routes pivotTableGroupSelection and pivotTableGroupField to the trial-shaped date dialog', () => {
    const { designer, opened, pivot } = setup();
    expect(executeDesignerSpecial(designer, 'pivotTableGroupSelection', undefined)).toBe(true);
    expect(executeDesignerSpecial(designer, 'pivotTableGroupField', undefined)).toBe(true);
    expect(opened.map((d) => d.name)).toEqual(['pivotGroupingDialogTemplate', 'pivotGroupingDialogTemplate']);
    const data = opened[0].data;
    expect(data.kind).toBe('date');
    expect(data.fieldName).toBe('SaleDate');
    expect(data.startEnabled).toBe(true);
    expect(data.start).toBe('1/3/2022');
    expect(data.end).toBe('6/5/2023');
    expect(data.bys).toEqual([false, false, false, false, true, true, true]);
    // Nothing changed until OK.
    expect(fieldNames(pivot)).toEqual(['SaleDate', 'Amount', 'Sum of Amount']);
    designer.getWorkbook().destroy();
  });

  it('OK with Months+Quarters+Years replaces the origin field newest-unit-first (trial order)', () => {
    const { designer, opened, pivot, sheet } = setup();
    showPivotGrouping(designer);
    opened[0].ok({ ...opened[0].data });
    expect(fieldNames(pivot)).toEqual(['Amount', 'Years (SaleDate)', 'Quarters (SaleDate)', 'Months (SaleDate)', 'Sum of Amount']);
    // The tabular report shows the trial's item labels: Years, then nested Quarters and Months.
    expect(sheet.getValue(15, 2)).toBe('2022');
    expect(sheet.getValue(15, 3)).toBe('Qtr1');
    expect(sheet.getValue(15, 4)).toBe('Jan');
    designer.getWorkbook().destroy();
  });

  it('Days grouping honours the date range and Number of days', () => {
    const { designer, opened, pivot, sheet } = setup();
    showPivotGrouping(designer);
    const data = { ...opened[0].data, bys: [false, false, false, true, false, false, false], start: '1/1/2022', end: '12/31/2023', interval: '2' };
    applyPivotGrouping(designer, data);
    expect(fieldNames(pivot)).toEqual(['Amount', 'Days (SaleDate)', 'Sum of Amount']);
    const label = String(sheet.getValue(15, 2));
    expect(label).toMatch(/1\/3\/2022|1\/1\/2022/);
    designer.getWorkbook().destroy();
  });

  it('number fields get the single By input pre-filled with min/max and a rounded step', () => {
    const { designer, opened, pivot, sheet } = setup();
    // Move the active cell to the Amount label column (second label column).
    sheet.setActiveCell(15, 2);
    sheet.setSelection(15, 2, 1, 1);
    showPivotGrouping(designer);
    const data = opened[0].data;
    expect(data.kind).toBe('number');
    expect(data.fieldName).toBe('Amount');
    expect(data.start).toBe('50');
    expect(data.end).toBe('225');
    expect(Number(data.by)).toBeGreaterThan(0);
    opened[0].ok({ ...data, by: '50' });
    expect(fieldNames(pivot)).toEqual(['SaleDate', 'Amount', 'Sum of Amount']);
    // The trial keeps the field name and shows buckets; verify a bucket label.
    const labels: string[] = [];
    for (let r = 15; r < 40; r++) { const v = sheet.getValue(r, 2); if (typeof v === 'string' && /-/.test(v)) labels.push(v); }
    expect(labels.join('|')).toContain('50-99');
    designer.getWorkbook().destroy();
  });

  it('text fields answer the trial message instead of opening a dialog', () => {
    const { designer, opened, boxes, pivot, sheet } = setup();
    pivot.add('Region', 'Region', P.PivotTableFieldType.rowField);
    sheet.setActiveCell(15, 3);
    sheet.setSelection(15, 3, 1, 1);
    showPivotGrouping(designer);
    expect(opened.length).toBe(0);
    expect(boxes.join('\n')).toContain('Grouping is available for date and number fields.');
    designer.getWorkbook().destroy();
  });

  it('ungroup removes the whole grouping (trial: ungrouping any unit drops them all, nothing is restored)', () => {
    const { designer, opened, pivot } = setup();
    showPivotGrouping(designer);
    opened[0].ok({ ...opened[0].data });
    expect(fieldNames(pivot)).toContain('Years (SaleDate)');
    pivot.ungroup('Months (SaleDate)');
    expect(fieldNames(pivot)).toEqual(['Amount', 'Sum of Amount']);
    designer.getWorkbook().destroy();
  });
});
