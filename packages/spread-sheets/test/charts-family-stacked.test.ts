/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * TASK 39 family 1 — stacked / 100%-stacked chart types.
 * Every expected value below was measured black-box from the official trial
 * runtime (@mescius/spread-sheets-charts 19.2.5) via `chart.toJSON()` and the
 * public getters in the apps/compare dual-runtime harness.
 */
import { describe, expect, it } from 'vitest';
import GC from '../src/index.js';
import { groupStacking } from '../src/features/charts/types.js';
import { buildPaintModel } from '../src/features/charts/paint-model.js';
import { valueLabelStrings } from '../src/features/charts/paint.js';
const { Workbook } = GC.Spread.Sheets;
const { ChartType } = GC.Spread.Sheets.Charts;

function sheetWithFixture() {
  const wb = new Workbook();
  const sheet = wb.getSheet(0);
  sheet.setArray(0, 0, [
    ['', 'Q1', 'Q2', 'Q3'],
    ['Apples', 5, 8, 3],
    ['Oranges', 4, 6, 7],
    ['Pears', 7, 2, 5],
  ]);
  return { wb, sheet };
}

function spaceOf(chart: any): any {
  return chart.toJSON().shapeData.graphicFrame.graphic.graphicData.chart.chartSpace;
}

function add(type: keyof typeof ChartType) {
  const { wb, sheet } = sheetWithFixture();
  const chart = sheet.charts.add('C', (ChartType as any)[type], 200, 10, 420, 280, 'A1:D4');
  return { wb, sheet, chart, space: spaceOf(chart), group: spaceOf(chart).chart.plotArea.chartGroups[0] };
}

describe('trial grouping codes of the stacked families', () => {
  it('bar family: clustered=1, stacked=3, stacked100=0+overlap100, gapWidth 150 when stacked', () => {
    expect(add('columnStacked').group).toMatchObject({ chartType: 6, barDir: 1, grouping: 3, gapWidth: 150, overlap: 100 });
    expect(add('columnStacked100').group).toMatchObject({ chartType: 6, barDir: 1, grouping: 0, gapWidth: 150, overlap: 100 });
    expect(add('barStacked').group).toMatchObject({ chartType: 6, barDir: 0, grouping: 3, gapWidth: 150, overlap: 100 });
    expect(add('barStacked100').group).toMatchObject({ chartType: 6, barDir: 0, grouping: 0, gapWidth: 150, overlap: 100 });
  });

  it('line/area family: standard=1, stacked=2, stacked100=0', () => {
    expect(add('lineStacked').group).toMatchObject({ chartType: 8, grouping: 2, marker: false, smooth: false });
    expect(add('lineStacked100').group).toMatchObject({ chartType: 8, grouping: 0, marker: false });
    expect(add('lineMarkersStacked').group).toMatchObject({ chartType: 8, grouping: 2, marker: true });
    expect(add('lineMarkersStacked100').group).toMatchObject({ chartType: 8, grouping: 0, marker: true });
    expect(add('areaStacked').group).toMatchObject({ chartType: 4, grouping: 2 });
    expect(add('areaStacked100').group).toMatchObject({ chartType: 4, grouping: 0 });
  });

  it('markers of the marker-bearing stacked lines are {symbol:0,size:7} per series', () => {
    expect(add('lineStacked').group.ser[0].marker).toEqual({ symbol: 4 });
    expect(add('lineMarkersStacked').group.ser[0].marker).toEqual({ symbol: 0, size: 7 });
    expect(add('lineMarkersStacked100').group.ser[0].marker).toEqual({ symbol: 0, size: 7 });
  });

  it('stacked line charts serialise dispBlanksAs 2 (like areas), plain line stays 1', () => {
    expect(add('line').space.chart.dispBlanksAs).toBe(1);
    for (const type of ['lineStacked', 'lineStacked100', 'lineMarkersStacked', 'lineMarkersStacked100'] as const)
      expect(add(type).space.chart.dispBlanksAs).toBe(2);
  });

  it('the value axis of a 100%-stacked chart keeps numFmt General in the JSON', () => {
    for (const type of ['columnStacked100', 'barStacked100', 'lineStacked100', 'lineMarkersStacked100', 'areaStacked100'] as const) {
      const axes = add(type).space.chart.plotArea.axes;
      expect(axes.find((a: any) => a.axisType === 3).numFmt.formatCode).toBe('General');
    }
  });

  it('groupStacking maps the trial codes per family', () => {
    expect(groupStacking(6, 1, -27)).toEqual({ stacked: false, percent: false });
    expect(groupStacking(6, 3, 100)).toEqual({ stacked: true, percent: false });
    expect(groupStacking(6, 0, 100)).toEqual({ stacked: true, percent: true });
    expect(groupStacking(8, 2, 0)).toEqual({ stacked: true, percent: false });
    expect(groupStacking(8, 0, 0)).toEqual({ stacked: true, percent: true });
    expect(groupStacking(4, 2, 0)).toEqual({ stacked: true, percent: false });
    expect(groupStacking(1, 0, 0)).toEqual({ stacked: false, percent: false });
  });
});

describe('public getters of the stacked families', () => {
  it('series() reports the public chartType of each stacked variant', () => {
    const cases: [keyof typeof ChartType, number][] = [
      ['columnStacked100', 14], ['barStacked', 19], ['barStacked100', 20],
      ['lineStacked', 24], ['lineStacked100', 25], ['lineMarkersStacked', 27],
      ['lineMarkersStacked100', 28], ['areaStacked', 37], ['areaStacked100', 38],
    ];
    for (const [type, expected] of cases)
      expect((add(type).chart.series().get(0) as any).chartType).toBe(expected);
  });

  it('axes() reports the "0%" value format for every 100%-stacked chart only', () => {
    for (const type of ['columnStacked100', 'barStacked100', 'lineStacked100', 'lineMarkersStacked100', 'areaStacked100'] as const)
      expect((add(type).chart.axes() as any).primaryValue.format).toBe('0%');
    expect((add('columnStacked').chart.axes() as any).primaryValue.format).toBe('General');
    expect((add('areaStacked').chart.axes() as any).primaryValue.format).toBe('General');
  });

  it('round-trips the stacked variants through workbook JSON', () => {
    for (const type of ['columnStacked100', 'barStacked', 'barStacked100', 'lineStacked',
      'lineStacked100', 'lineMarkersStacked', 'lineMarkersStacked100', 'areaStacked', 'areaStacked100'] as const) {
      const { wb, chart } = add(type);
      const wb2 = new Workbook();
      wb2.fromJSON(wb.toJSON());
      const restored = wb2.getSheet(0).charts.get('C')!;
      expect(restored.chartType()).toBe((ChartType as any)[type]);
      expect(spaceOf(restored).chart.plotArea.chartGroups[0].grouping).toBe(chart.toJSON()
        .shapeData.graphicFrame.graphic.graphicData.chart.chartSpace.chart.plotArea.chartGroups[0].grouping);
    }
  });
});

describe('value-axis scales of the stacked families (trial-measured)', () => {
  it('100%-stacked charts pin the scale to 0..100 with "%" tick labels', () => {
    for (const type of ['columnStacked100', 'barStacked100', 'lineStacked100', 'lineMarkersStacked100', 'areaStacked100'] as const) {
      const { sheet, chart } = add(type);
      const model = buildPaintModel(chart as any, sheet as any);
      expect(model.scale.min, type).toBe(0);
      expect(model.scale.max, type).toBe(100);
      expect(valueLabelStrings(model, false), type).toEqual(
        // Horizontal bar percent axes show deciles, vertical axes fifthiles (trial screenshots).
        type === 'barStacked100'
          ? ['0%', '10%', '20%', '30%', '40%', '50%', '60%', '70%', '80%', '90%', '100%']
          : ['0%', '20%', '40%', '60%', '80%', '100%']);
    }
  });

  it('stacked bars/lines ceil the axis to the next gridline above the biggest total', () => {
    // Category totals are 16/16/15 -> unit 5, top gridline 20 (trial screenshot).
    for (const type of ['columnStacked', 'lineStacked', 'lineMarkersStacked'] as const) {
      const { sheet, chart } = add(type);
      const model = buildPaintModel(chart as any, sheet as any);
      expect(model.scale.max, type).toBe(20);
      expect(model.scale.unit, type).toBe(5);
    }
  });

  it('stacked areas put the plot top exactly at the data max, ticks stop at 15', () => {
    const { sheet, chart } = add('areaStacked');
    const model = buildPaintModel(chart as any, sheet as any);
    expect(model.scale.min).toBe(0);
    expect(model.scale.max).toBe(16);
    expect(model.scale.unit).toBe(5);
    expect(model.scale.ticks).toEqual([0, 5, 10, 15]);
  });

  it('paint groups carry stacked/percent flags from the trial codes', () => {
    for (const [type, stacked, percent] of [
      ['columnStacked', true, false], ['columnStacked100', true, true],
      ['barStacked', true, false], ['barStacked100', true, true],
      ['lineStacked', true, false], ['lineStacked100', true, true],
      ['lineMarkersStacked', true, false], ['lineMarkersStacked100', true, true],
      ['areaStacked', true, false], ['areaStacked100', true, true],
      ['columnClustered', false, false], ['area', false, false],
    ] as const) {
      const { sheet, chart } = add(type as keyof typeof ChartType);
      const group = buildPaintModel(chart as any, sheet as any).groups[0];
      expect([group.stacked, group.percent], type).toEqual([stacked, percent]);
    }
  });
});
