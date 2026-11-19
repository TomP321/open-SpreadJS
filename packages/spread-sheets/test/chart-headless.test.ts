/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * TASK 54 item 1: header-less (all-numeric) data ranges and the remove-chart plotArea stamp.
 * Every expectation is a trial value measured black-box with the identical setup in
 * `.probe/t54/tmp-check.mjs` / `.probe/t54/probe-t54-chart.json` (case `remove`).
 */
import { describe, expect, it } from 'vitest';
import GC from '../src/index.js';
const { Workbook } = GC.Spread.Sheets;
const { ChartType } = GC.Spread.Sheets.Charts;

function chartSpaceOf(chart: any) {
  return chart.toJSON().shapeData.graphicFrame.graphic.graphicData.chart.chartSpace;
}

/** The trial grid used by the probe: A1:F6 filled with 101..606 (all numbers). */
function numericSheet() {
  const wb = new Workbook();
  const sheet = wb.getSheet(0);
  sheet.setArray(0, 0, Array.from({ length: 6 }, (_, r) => Array.from({ length: 6 }, (_, c) => (r + 1) * 100 + c + 1)));
  return sheet;
}

const refsOf = (chart: any) => {
  const group = (chartSpaceOf(chart).chart.plotArea.chartGroups ?? [])[0] ?? {};
  return (group.ser ?? []).map((ser: any) => ({
    tx: ser.tx?.strRef?.f ?? null,
    cat: ser.cat?.strRef?.f ?? null,
    val: ser.val?.numRef?.f ?? null,
  }));
};

describe('headless (all-numeric) data ranges (trial probe t54)', () => {
  it('makes every COLUMN a full-column series when the numeric grid is taller than wide', () => {
    const sheet = numericSheet();
    expect(refsOf(sheet.charts.add('H1', ChartType.columnClustered, 0, 0, 420, 280, 'A1:B4')))
      .toEqual([
        { tx: null, cat: null, val: 'Sheet1!$A$1:$A$4' },
        { tx: null, cat: null, val: 'Sheet1!$B$1:$B$4' },
      ]);
    expect(refsOf(sheet.charts.add('H2', ChartType.columnClustered, 0, 0, 420, 280, 'A1:C4')))
      .toHaveLength(3);
    expect(refsOf(sheet.charts.add('H3', ChartType.columnClustered, 0, 0, 420, 280, 'A1:B3')))
      .toEqual([
        { tx: null, cat: null, val: 'Sheet1!$A$1:$A$3' },
        { tx: null, cat: null, val: 'Sheet1!$B$1:$B$3' },
      ]);
    expect(refsOf(sheet.charts.add('H4', ChartType.columnClustered, 0, 0, 420, 280, 'A1:B5')))
      .toHaveLength(2);
  });

  it('makes every ROW a full-row series when the numeric grid is square or wide', () => {
    const sheet = numericSheet();
    expect(refsOf(sheet.charts.add('S1', ChartType.columnClustered, 0, 0, 420, 280, 'A1:C3')))
      .toEqual([
        { tx: null, cat: null, val: 'Sheet1!$A$1:$C$1' },
        { tx: null, cat: null, val: 'Sheet1!$A$2:$C$2' },
        { tx: null, cat: null, val: 'Sheet1!$A$3:$C$3' },
      ]);
    expect(refsOf(sheet.charts.add('S2', ChartType.columnClustered, 0, 0, 420, 280, 'A1:D4')))
      .toHaveLength(4);
    // The sweep-remaining case: A2:D4 (3x3 whose first row is data) -> 3 series (trial),
    // previously 2 for us because the first row was always eaten as a header.
    expect(refsOf(sheet.charts.add('S3', ChartType.columnClustered, 0, 0, 420, 280, 'A2:D4')))
      .toEqual([
        { tx: null, cat: null, val: 'Sheet1!$A$2:$D$2' },
        { tx: null, cat: null, val: 'Sheet1!$A$3:$D$3' },
        { tx: null, cat: null, val: 'Sheet1!$A$4:$D$4' },
      ]);
    expect(refsOf(sheet.charts.add('S4', ChartType.columnClustered, 0, 0, 420, 280, 'A1:D2')))
      .toHaveLength(2);
    expect(refsOf(sheet.charts.add('S5', ChartType.columnClustered, 0, 0, 420, 280, 'B2:D4')))
      .toEqual([
        { tx: null, cat: null, val: 'Sheet1!$B$2:$D$2' },
        { tx: null, cat: null, val: 'Sheet1!$B$3:$D$3' },
        { tx: null, cat: null, val: 'Sheet1!$B$4:$D$4' },
      ]);
  });

  it('keeps header references when the header lines are text', () => {
    const wb = new Workbook();
    const sheet = wb.getSheet(0);
    sheet.setArray(0, 0, [
      ['', 'Q1', 'Q2', 'Q3'],
      ['Apples', 5, 8, 3],
      ['Oranges', 4, 6, 7],
      ['Pears', 7, 2, 5],
    ]);
    expect(refsOf(sheet.charts.add('T1', ChartType.columnClustered, 0, 0, 420, 280, 'A1:D4')))
      .toEqual([
        { tx: 'Sheet1!$A$2', cat: 'Sheet1!$B$1:$D$1', val: 'Sheet1!$B$2:$D$2' },
        { tx: 'Sheet1!$A$3', cat: 'Sheet1!$B$1:$D$1', val: 'Sheet1!$B$3:$D$3' },
        { tx: 'Sheet1!$A$4', cat: 'Sheet1!$B$1:$D$1', val: 'Sheet1!$B$4:$D$4' },
      ]);
  });

  it('honours an explicit dataOrientation even over a numeric grid (headless keeps full spans)', () => {
    const sheet = numericSheet();
    expect(refsOf(sheet.charts.add('E1', ChartType.columnClustered, 0, 0, 420, 280, 'A1:B4', 0)))
      .toEqual([
        { tx: null, cat: null, val: 'Sheet1!$A$1:$B$1' },
        { tx: null, cat: null, val: 'Sheet1!$A$2:$B$2' },
        { tx: null, cat: null, val: 'Sheet1!$A$3:$B$3' },
        { tx: null, cat: null, val: 'Sheet1!$A$4:$B$4' },
      ]);
    expect(refsOf(sheet.charts.add('E2', ChartType.columnClustered, 0, 0, 420, 280, 'A1:B4', 1)))
      .toEqual([
        { tx: null, cat: null, val: 'Sheet1!$A$1:$A$4' },
        { tx: null, cat: null, val: 'Sheet1!$B$1:$B$4' },
      ]);
    expect(refsOf(sheet.charts.add('E3', ChartType.columnClustered, 0, 0, 420, 280, 'A2:D4', 1)))
      .toEqual([
        { tx: null, cat: null, val: 'Sheet1!$A$2:$A$4' },
        { tx: null, cat: null, val: 'Sheet1!$B$2:$B$4' },
        { tx: null, cat: null, val: 'Sheet1!$C$2:$C$4' },
        { tx: null, cat: null, val: 'Sheet1!$D$2:$D$4' },
      ]);
  });
});

describe('remove-chart plotArea stamp (trial probe t54 `remove`)', () => {
  it('stamps plotArea.spPr.ln = {noFill:true} when a chart is removed', () => {
    const wb = new Workbook();
    const sheet = wb.getSheet(0);
    sheet.setArray(0, 0, [
      ['', 'Q1', 'Q2', 'Q3'],
      ['Apples', 5, 8, 3],
      ['Oranges', 4, 6, 7],
      ['Pears', 7, 2, 5],
    ]);
    const chart = sheet.charts.add('R1', ChartType.area, 0, 0, 420, 280, 'A1:D4');
    const space = chartSpaceOf(chart);
    expect(space.chart.plotArea.spPr).toEqual({ noFill: true });
    sheet.charts.remove('R1');
    expect(space.chart.plotArea.spPr).toEqual({ noFill: true, ln: { noFill: true } });
  });
});
