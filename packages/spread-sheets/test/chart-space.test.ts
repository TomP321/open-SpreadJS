/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import GC from '../src/index.js';
const { Workbook } = GC.Spread.Sheets;
const { ChartType } = GC.Spread.Sheets.Charts;

function chartSpaceOf(chart: any) {
  return chart.toJSON().shapeData.graphicFrame.graphic.graphicData.chart.chartSpace;
}

function addChart(sheet: any, type: number, range = 'A1:D4') {
  return sheet.charts.add('C1', type, 0, 0, 420, 280, range);
}

function fixtureSheet() {
  const wb = new Workbook();
  const sheet = wb.getSheet(0);
  sheet.setArray(0, 0, [
    ['', 'Q1', 'Q2', 'Q3'],
    ['Apples', 5, 8, 3],
    ['Oranges', 4, 6, 7],
    ['Pears', 7, 2, 5],
  ]);
  return sheet;
}

describe('chartSpace templates', () => {
  it('builds the trial column template (group flags, styles, axes)', () => {
    const sheet = fixtureSheet();
    const chart = addChart(sheet, ChartType.columnClustered);
    const space = chartSpaceOf(chart);
    const group = space.chart.plotArea.chartGroups[0];
    expect(group.chartType).toBe(6);
    expect(group.barDir).toBe(1);
    expect(group.grouping).toBe(1);
    expect(group.gapWidth).toBe(150);
    expect(group.overlap).toBe(-27);
    expect(group.varyColors).toBe(false);
    const series = group.ser;
    expect(series.map((s: any) => s.idx)).toEqual([0, 1, 2]);
    expect(series[0].spPr.solidFill.schemeClr.val).toBe(4); // accent 1
    expect(series[1].spPr.solidFill.schemeClr.val).toBe(5); // accent 2
    expect(series.map((s: any) => s.shape)).toEqual([2, 2, 2]);
    expect(series[0].tx.strRef.f).toBe('Sheet1!$A$2');
    expect(series[0].cat.strRef.f).toBe('Sheet1!$B$1:$D$1');
    expect(series[0].val.numRef.f).toBe('Sheet1!$B$2:$D$2');
    // numCache mirrors the sheet values.
    expect(series[0].val.numRef.numCache).toEqual({ formatCode: 'General' });
    expect(space.chart.plotArea.spPr).toEqual({ noFill: true });
    expect(space.chart.plotArea.axes.map((a: any) => Number(a.AxisType))).toEqual([0, 1]);
    expect(space.chart.dispBlanksAs).toBe(1);
  });

  it('stamps plotArea.spPr.ln in a deferred pass shortly after creation', () => {
    vi.useFakeTimers();
    try {
      const sheet = fixtureSheet();
      const chart = addChart(sheet, ChartType.columnClustered);
      expect(chartSpaceOf(chart).chart.plotArea.spPr.ln).toBeUndefined();
      vi.advanceTimersByTime(1500);
      expect(chartSpaceOf(chart).chart.plotArea.spPr.ln).toBeUndefined();
      vi.advanceTimersByTime(700);
      expect(chartSpaceOf(chart).chart.plotArea.spPr.ln).toEqual({ noFill: true });
    } finally {
      vi.useRealTimers();
    }
  });

  it('area charts default dispBlanksAs to 2 and pie writes varyColors/hole', () => {
    const sheet = fixtureSheet();
    const area = addChart(sheet, ChartType.area);
    expect(chartSpaceOf(area).chart.dispBlanksAs).toBe(2);
    sheet.charts.remove('C1');
    const pie = addChart(sheet, ChartType.pie);
    const group = chartSpaceOf(pie).chart.plotArea.chartGroups[0];
    expect(group.chartType).toBe(10);
    expect(group.varyColors).toBe(true);
    expect(group.holeSize).toBeUndefined();
    sheet.charts.remove('C1');
    const doughnut = addChart(sheet, ChartType.doughnut);
    const dg = chartSpaceOf(doughnut).chart.plotArea.chartGroups[0];
    expect(dg.holeSize).toBe(75);
  });

  it('horizontal bars write invertIfNegative=false; columns keep barDir 1', () => {
    const sheet = fixtureSheet();
    const bar = addChart(sheet, ChartType.barClustered);
    const group = chartSpaceOf(bar).chart.plotArea.chartGroups[0];
    expect(group.barDir).toBe(0);
    expect(group.ser[0].invertIfNegative).toBeUndefined();
    sheet.charts.remove('C1');
    const col = addChart(sheet, ChartType.columnClustered);
    expect(chartSpaceOf(col).chart.plotArea.chartGroups[0].ser[0].invertIfNegative).toBe(false);
  });

  it('scatter charts carry value-type x/y axes and xVal/yVal series', () => {
    const sheet = fixtureSheet();
    const scatter = addChart(sheet, ChartType.xyScatter);
    const space = chartSpaceOf(scatter);
    const axes = space.chart.plotArea.axes;
    expect(axes).toHaveLength(2);
    expect(axes.map((a: any) => Number(a.axisType))).toEqual([3, 3]);
    // The x value axis carries no gridlines; the value axis crosses between ticks.
    expect(axes[0].majorGridlines).toBeUndefined();
    expect(axes[1].majorGridlines).toBeDefined();
    expect(axes[1].crossBetween).toBe(1);
    const ser = space.chart.plotArea.chartGroups[0].ser[0];
    expect(ser.seriesType).toBe(5);
    expect(ser.xVal.numRef.f).toBe('Sheet1!$B$1:$D$1');
    expect(ser.yVal.numRef.f).toBe('Sheet1!$B$2:$D$2');
    expect(ser.marker).toEqual({ symbol: 0, size: 7 });
    expect(ser.smooth).toBe(false);
    expect(ser.spPr.ln).toEqual({ noFill: true, w: 2 });
    expect(ser.invertIfNegative).toBeUndefined();
  });
});

describe('chart JSON round-trip', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('preserves the full chartSpace through workbook JSON', () => {
    const wb = new Workbook();
    const sheet = wb.getSheet(0);
    sheet.setArray(0, 0, [['', 'Q1'], ['A', 5], ['B', 4]]);
    const chart = sheet.charts.add('RT', ChartType.columnStacked, 30, 20, 300, 200, 'A1:B3');
    chart.legend({ position: 5 });
    chart.title({ text: 'Hello' });
    const before = JSON.stringify(chartSpaceOf(chart));
    const wb2 = new Workbook();
    wb2.fromJSON(wb.toJSON());
    const restored = wb2.getSheet(0).charts.get('RT');
    expect(restored).not.toBeNull();
    const after = JSON.stringify(chartSpaceOf(restored));
    // Reload stamps the deferred layout marker (`ln`) the fresh copy lacks yet.
    expect(JSON.parse(after).chart.plotArea.spPr.ln).toEqual({ noFill: true });
    expect(JSON.parse(before).chart.plotArea.chartGroups[0].grouping).toBe(3);
    expect(JSON.parse(before).chart.plotArea.chartGroups[0].barDir).toBe(1);
    expect((restored!.legend() as any).position).toBe(5);
    expect((restored!.title() as any).text).toBe('Hello');
    expect(restored!.x()).toBe(30);
    expect(restored!.y()).toBe(20);
  });
});
