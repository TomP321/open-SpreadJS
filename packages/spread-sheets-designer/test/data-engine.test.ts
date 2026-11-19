/* eslint-disable @typescript-eslint/no-explicit-any */
/* Unit coverage for the Data tab engine. Expectations encode the behaviour
 * observed against the trial through its public API (paired browser tests
 * cover the UI paths). */
import { beforeEach, describe, expect, it } from 'vitest';
import GC from '@mescius/spread-sheets';
import { applyBuiltin, commandEnabled } from '../src/commands/actions.js';
import { Designer } from '../src/designer.js';
import {
  applyAutoOutline, applySortToSheet, applySubtotalToSheet, columnLabels, currentRegion, lineLooksLikeHeader,
  parseDelimited, parseDestinationAddress, parseFixedWidth, removeSubtotalRows, sheetHasOutlines, splitRows,
  subtotalWord, writeSplitColumns,
} from '../src/data-engine.js';

describe('data engine', () => {
  let sheet: any, d: any;
  beforeEach(() => {
    const workbook = new GC.Spread.Sheets.Workbook();
    sheet = workbook.getActiveSheet();
    d = Object.assign(Object.create(Designer.prototype), { gc: GC, getWorkbook: () => workbook, invalidate: () => undefined });
  });

  const seed = () => {
    sheet.setArray(0, 0, [
      ['Region', 'Q1', 'Q2'],
      ['North', 120, 135],
      ['South', 90, 105],
      ['East', 75, 80],
    ]);
  };

  it('expands a single cell to its current region and keeps headers detected', () => {
    seed();
    const region = currentRegion(sheet, { row: 1, col: 1, rowCount: 1, colCount: 1 });
    expect(region).toEqual({ row: 0, col: 0, rowCount: 4, colCount: 3 });
    expect(lineLooksLikeHeader(sheet, region.row, region.col, region.colCount)).toBe(true);
    expect(lineLooksLikeHeader(sheet, region.row + 1, region.col, region.colCount)).toBe(false);
    expect(columnLabels(sheet, region, true)).toEqual(['Region', 'Q1', 'Q2']);
    expect(columnLabels(sheet, region, false)).toEqual(['ColumnA', 'ColumnB', 'ColumnC']);
  });

  it('sorts with several levels, honoring the header flag and per-level order', () => {
    sheet.setArray(0, 0, [
      ['Region', 'Value'],
      ['East', 2], ['West', 1], ['East', 1], ['West', 2],
    ]);
    applySortToSheet(sheet, {
      region: { row: 0, col: 0, rowCount: 5, colCount: 2 }, hasHeaders: true, byRows: true,
      levels: [
        { column: 0, sortOn: 'Values', order: 'A to Z', color: '' },
        { column: 1, sortOn: 'Values', order: 'Z to A', color: '' },
      ],
    });
    expect(sheet.getArray(0, 0, 5, 2)).toEqual([['Region', 'Value'], ['East', 2], ['East', 1], ['West', 2], ['West', 1]]);
  });

  it('sorts by cell color and keeps the header row', () => {
    sheet.setArray(0, 0, [['N', 'C'], ['a', 1], ['b', 2], ['c', 3]]);
    sheet.setStyle(2, 1, { backColor: '#ff0000' });
    applySortToSheet(sheet, {
      region: { row: 0, col: 0, rowCount: 4, colCount: 2 }, hasHeaders: true, byRows: true,
      levels: [{ column: 1, sortOn: 'Cell Color', order: 'On Top', color: '#ff0000' }],
    });
    expect([0, 1, 2].map((r) => sheet.getValue(r + 1, 0))).toEqual(['b', 'a', 'c']);
    expect(sheet.getValue(0, 0)).toBe('N'); // header preserved
  });

  it('sorts left to right with the orientation option', () => {
    sheet.setArray(0, 0, [[3, 1, 2]]);
    applySortToSheet(sheet, {
      region: { row: 0, col: 0, rowCount: 1, colCount: 3 }, hasHeaders: false, byRows: false,
      levels: [{ column: 0, sortOn: 'Values', order: 'A to Z', color: '' }],
    });
    // byRows=false reorders the columns using the values of the first row.
    expect(sheet.getArray(0, 0, 1, 3)).toEqual([[1, 2, 3]]);
  });

  /* Every expectation below is a value the trial itself wrote into the sheet
   * through its wizard (Comma + Tab delimiters, `"` text qualifier). The trial
   * treats the qualifier as a state toggle rather than a CSV escape: a quote
   * that opens after text ends that field, text after a closing quote joins it,
   * and once two quotes touch, the remaining delimiters become field text. */
  it('parses delimited fields with the trial\'s text qualifier rules', () => {
    const split = (text: string): string[] => parseDelimited(text, [',', '\t'], '"', false);
    expect(split('John,Adams,"New York, NY",35')).toEqual(['John', 'Adams', 'New York, NY', '35']);
    expect(split('"a"')).toEqual(['a']);
    expect(split('"a"x')).toEqual(['ax']);
    expect(split('x"a"')).toEqual(['x', 'a']);
    expect(split('a"b"c')).toEqual(['a', 'bc']);
    expect(split('a""b,c')).toEqual(['a', 'b', 'c']);
    expect(split('"a""b"')).toEqual(['a', 'b']);
    expect(split('"a""b",c')).toEqual(['a', 'b', ',c']);
    expect(split('"a""b",c,d')).toEqual(['a', 'b', ',c,d']);
    expect(split('Paul,McCartney,"a""b",40')).toEqual(['Paul', 'McCartney', 'a', 'b', ',40']);
    expect(split('1,2,"3""4",5')).toEqual(['1', '2', '3', '4', ',5']);
    expect(split('x,"a""b"')).toEqual(['x', 'a', 'b']);
    expect(split('1,2,')).toEqual(['1', '2', '']);
    expect(split('Ringo , Starr ,,45')).toEqual(['Ringo ', ' Starr ', '', '45']);
    expect(parseDelimited('a,,b', [','], '', false)).toEqual(['a', '', 'b']);
    expect(parseDelimited('a,,b', [','], '', true)).toEqual(['a', 'b']);
    expect(parseDelimited('x\'y,y', [','], "'", false)).toEqual(['x', 'y,y']);
  });

  it('splits fixed width text at the break offsets', () => {
    expect(parseFixedWidth('AB1234CD', [2, 6])).toEqual(['AB', '1234', 'CD']);
    expect(parseFixedWidth('AB1234CD', [])).toEqual(['AB1234CD']);
  });

  it('writes the split result converting General fields and honoring skip', () => {
    seed();
    sheet.clear(9, 0, 3, 4, 3, 15);
    sheet.setArray(9, 0, [['Tom,95,hello,9'], ['Ann,80,"x,y",8']]);
    const data: any = {
      mode: 'Delimited', region: { row: 9, col: 0, rowCount: 2, colCount: 1 },
      delimiters: { tab: false, semicolon: false, comma: true, space: false, other: '' },
      consecutive: false, qualifier: '"', breaks: [], destination: '=A10',
      formats: [
        { format: 'General', dateType: 'MDY' },
        { format: 'Skip', dateType: 'MDY' },
        { format: 'Text', dateType: 'MDY' },
        { format: 'Text', dateType: 'MDY' },
      ],
    };
    const rows = splitRows(data, ['Tom,95,hello,9', 'Ann,80,"x,y",8']);
    expect(writeSplitColumns(sheet, GC, data, { row: 9, col: 0 }, rows).replaced).toBe(false);
    expect(sheet.getValue(9, 0)).toBe('Tom');
    expect(sheet.getValue(9, 1)).toBe(null); // the skipped column is never written
    expect(sheet.getValue(9, 2)).toBe('hello');
    expect(sheet.getValue(9, 3)).toBe('9'); // Text keeps the digits as text
    expect(sheet.getValue(10, 1)).toBe(null);
    expect(sheet.getValue(10, 2)).toBe('x,y'); // the qualifier is stripped, the comma survives
    expect(sheet.getValue(10, 3)).toBe('8');
  });

  it('promises replacement when the destination overlaps foreign cells', () => {
    seed();
    const data: any = { mode: 'Delimited', region: { row: 1, col: 0, rowCount: 1, colCount: 1 }, delimiters: { comma: true }, qualifier: '', consecutive: false, breaks: [], formats: [] };
    const out = writeSplitColumns(sheet, GC, data, { row: 1, col: 1 }, [['x', 'y']]);
    expect(out.replaced).toBe(true);
    expect(sheet.getValue(1, 1)).toBe(120); // nothing written
  });

  it('builds subtotal rows, grand totals and outlines like the trial', () => {
    sheet.setArray(0, 0, [
      ['Region', 'Amount'],
      ['East', 10], ['East', 20], ['West', 30], ['West', 40], ['West', 50],
    ]);
    applySubtotalToSheet(sheet, {
      region: { row: 0, col: 0, rowCount: 6, colCount: 2 }, groupColumn: 0, fn: 'Sum',
      columns: [1], replace: true, pageBreak: false, summaryBelow: true,
    });
    expect(sheet.getArray(0, 0, 9, 2)).toEqual([
      ['Region', 'Amount'],
      ['East', 10], ['East', 20], ['East Total', 30],
      ['West', 30], ['West', 40], ['West', 50], ['West Total', 120],
      ['Grand Total', 150],
    ]);
    expect(sheet.getFormula(3, 1)).toBe('SUBTOTAL(9,B2:B3)');
    expect(sheet.getFormula(7, 1)).toBe('SUBTOTAL(9,B5:B7)');
    expect(sheet.getFormula(8, 1)).toBe('SUBTOTAL(9,B2:B7)');
    expect([0, 1, 2, 3, 4, 5, 6, 7, 8].map((r) => sheet.rowOutlines.getLevel(r))).toEqual([-1, 1, 1, 0, 1, 1, 1, 0, -1]);
    expect(sheet.getStyle(3, 0).font).toContain('bold');
  });

  /* The trial's grand total always spans every detail row of the region (final
   * coordinates), and SUBTOTAL leaves the nested summary cells out: East 10 +
   * 20 and West 30 + 40 + 50 = 150 for the range that also covers the group
   * summaries. Count is COUNTA (code 3). */
  it('supports summary-above groups and the Product function labels', () => {
    sheet.setArray(0, 0, [
      ['Region', 'Amount'],
      ['East', 10], ['East', 20], ['West', 30],
    ]);
    applySubtotalToSheet(sheet, {
      region: { row: 0, col: 0, rowCount: 4, colCount: 2 }, groupColumn: 0, fn: 'Product',
      columns: [1], replace: true, pageBreak: false, summaryBelow: false,
    });
    expect([0, 1, 2, 3, 4, 5, 6].map((r) => sheet.getValue(r, 0))).toEqual(['Region', 'Grand Product', 'East Product', 'East', 'East', 'West Product', 'West']);
    expect(sheet.getFormula(2, 1)).toBe('SUBTOTAL(6,B4:B5)');
    expect(sheet.getFormula(5, 1)).toBe('SUBTOTAL(6,B7:B7)');
    expect(sheet.getFormula(1, 1)).toBe('SUBTOTAL(6,B4:B7)');
    expect([0, 1, 2, 3, 4, 5, 6].map((r) => sheet.rowOutlines.getLevel(r))).toEqual([-1, -1, 0, 1, 1, 0, 1]);
    expect(sheet.getValue(1, 1)).toBe(6000); // 10 * 20 * 30
  });

  it('counts with COUNTA and breaks pages like the trial', () => {
    sheet.setArray(0, 0, [
      ['Region', 'Amount'],
      ['East', 10], ['East', 20], ['West', 30], ['West', 40], ['North', 50], ['North', 60],
    ]);
    applySubtotalToSheet(sheet, {
      region: { row: 0, col: 0, rowCount: 7, colCount: 2 }, groupColumn: 0, fn: 'Count',
      columns: [1], replace: true, pageBreak: true, summaryBelow: true,
    });
    expect(sheet.getFormula(3, 1)).toBe('SUBTOTAL(3,B2:B3)');
    expect([4, 7, 11].map((r) => sheet.getRowPageBreak(r))).toEqual([true, true, true]);
    expect([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].filter((r) => sheet.getRowPageBreak(r))).toEqual([4, 7, 11]);
    expect(sheet.getValue(10, 0)).toBe('Grand Count');
    expect(sheet.getValue(10, 1)).toBe(6);
  });

  it('puts the page break on the summary row when summaries sit above', () => {
    sheet.setArray(0, 0, [
      ['Region', 'Amount'],
      ['East', 10], ['East', 20], ['West', 30], ['West', 40], ['North', 50],
    ]);
    applySubtotalToSheet(sheet, {
      region: { row: 0, col: 0, rowCount: 6, colCount: 2 }, groupColumn: 0, fn: 'Sum',
      columns: [1], replace: true, pageBreak: true, summaryBelow: false,
    });
    expect([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((r) => sheet.getValue(r, 0)))
      .toEqual(['Region', 'Grand Total', 'East Total', 'East', 'East', 'West Total', 'West', 'West', 'North Total', 'North']);
    expect([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].filter((r) => sheet.getRowPageBreak(r))).toEqual([5, 8]);
  });

  it('replaces previous subtotals and removes them on request', () => {
    sheet.setArray(0, 0, [['Region', 'Amount'], ['East', 10], ['West', 30]]);
    const payload = { region: { row: 0, col: 0, rowCount: 3, colCount: 2 }, groupColumn: 0, fn: 'Sum', columns: [1], replace: true, pageBreak: false, summaryBelow: true };
    applySubtotalToSheet(sheet, payload as any);
    expect(sheet.getValue(2, 0)).toBe('East Total');
    applySubtotalToSheet(sheet, payload as any); // replace: same shape, no doubling
    expect(sheet.getValue(2, 0)).toBe('East Total');
    expect(sheet.getValue(4, 0)).toBe('West Total');
    expect(removeSubtotalRows(sheet)).toBe(3);
    expect(sheetHasOutlines(sheet)).toBe(false);
    expect([0, 1, 2].map((r) => sheet.getValue(r, 0))).toEqual(['Region', 'East', 'West']);
  });

  it('groups detail columns feeding same-row formulas with Auto Outline', () => {
    seed();
    sheet.setValue(0, 3, 'Total');
    for (let r = 1; r < 4; r++) sheet.setFormula(r, 3, `=SUM(B${r + 1}:C${r + 1})`);
    applyAutoOutline(sheet, { row: 0, col: 0, rowCount: 4, colCount: 4 });
    expect([0, 1, 2, 3, 4].map((c) => sheet.columnOutlines.getLevel(c))).toEqual([-1, 0, 0, -1, -1]);
    expect([0, 1, 2, 3].map((r) => sheet.rowOutlines.getLevel(r))).toEqual([-1, -1, -1, -1]);
  });

  it('groups detail rows feeding same-column formulas with Auto Outline', () => {
    sheet.setArray(0, 0, [
      ['Region', 'Q1'],
      ['East', 10], ['West', 30], ['North', 50],
      ['Total', null],
    ]);
    sheet.setFormula(4, 1, '=SUM(B2:B4)');
    applyAutoOutline(sheet, { row: 0, col: 0, rowCount: 5, colCount: 2 });
    expect([0, 1, 2, 3, 4].map((r) => sheet.rowOutlines.getLevel(r))).toEqual([-1, 0, 0, 0, -1]);
    expect(sheet.columnOutlines.getLevel(1)).toBe(-1);
  });

  it('sets circle highlight on validated cells and toggles the workbook option', () => {
    sheet.setSelection(0, 0, 2, 1);
    applyBuiltin(d, 'applyDataValidation', { data: { validationType: 'Whole number', operator: 6, source: 1, formula2: 100 } });
    expect(commandEnabled(d, 'circleInvalidDataCommand')).toBe(true);
    expect(commandEnabled(d, 'clearInvalidCircles')).toBe(true);
    applyBuiltin(d, 'circleInvalidData', {});
    expect(sheet.getDataValidator(0, 0).highlightStyle()).toEqual({ type: 0, color: 'red' });
    expect(d.getWorkbook().options.highlightInvalidData).toBe(true);
    applyBuiltin(d, 'clearInvalidCircles', {});
    expect(d.getWorkbook().options.highlightInvalidData).toBe(false);
    // still enabled: the validators remain on the cells
    expect(commandEnabled(d, 'circleInvalidDataCommand')).toBe(true);
  });

  it('keeps the circle commands enabled even when the selection has no validators', () => {
    // T55 pass 2 (paired gate): the trial keeps Circle Invalid Data / Clear Invalid Circles
    // enabled on a selection without validators (icon-menus.spec.ts "Data: Circle Invalid Data /
    // Clear Invalid Circles stay enabled like the trial", official DOM read on ?side=official).
    seed();
    sheet.setSelection(1, 1, 1, 1);
    expect(commandEnabled(d, 'circleInvalidDataCommand')).toBe(true);
    expect(commandEnabled(d, 'clearInvalidCircles')).toBe(true);
  });

  it('parses destination addresses with optional $ and ranges', () => {
    expect(parseDestinationAddress('=A1')).toEqual({ row: 0, col: 0 });
    expect(parseDestinationAddress('$C$12')).toEqual({ row: 11, col: 2 });
    expect(parseDestinationAddress('=B2:D9')).toEqual({ row: 1, col: 1 });
    expect(parseDestinationAddress('nope')).toBeNull();
  });

  it('uses Total only for the Sum function word', () => {
    expect(subtotalWord('Sum')).toBe('Total');
    expect(subtotalWord('Count')).toBe('Count');
    expect(subtotalWord('Product')).toBe('Product');
  });
});
