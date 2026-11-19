/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * TASK 39 family 3 — combo and the stock charts (HLC/OHLC/VHLC/VOHLC).
 * Every expected value below was measured black-box from the official trial
 * runtime (@mescius/spread-sheets-charts 19.2.5) via `chart.toJSON()`, the
 * public getters and `charts.add()` errors in the apps/compare dual-runtime
 * harness (apps/compare/scripts/chart-comparison.mjs, out dirs f3/f3c/f3e).
 */
import { describe, expect, it } from 'vitest';
import GC from '../src/index.js';
import { buildPaintModel } from '../src/features/charts/paint-model.js';
const { Workbook } = GC.Spread.Sheets;
const { ChartType } = GC.Spread.Sheets.Charts;

// OHLC fixture: A = category, B..F = Open/High/Low/Close/Volume, 3 data rows.
function sheetWithStock() {
  const wb = new Workbook();
  const sheet = wb.getSheet(0);
  sheet.setArray(0, 0, [
    ['', 'Open', 'High', 'Low', 'Close', 'Volume'],
    ['Jan', 2, 8, 1, 6, 40],
    ['Feb', 4, 9, 3, 5, 50],
    ['Mar', 3, 7, 2, 4, 30],
  ]);
  return { wb, sheet };
}

function spaceOf(chart: any): any {
  return chart.toJSON().shapeData.graphicFrame.graphic.graphicData.chart.chartSpace;
}

function addStock(type: 'stockHLC' | 'stockOHLC' | 'stockVHLC' | 'stockVOHLC', range: string, orientation = 0) {
  const { wb, sheet } = sheetWithStock();
  const chart = sheet.charts.add('C', (ChartType as any)[type], 200, 10, 420, 280, range, orientation);
  return { wb, sheet, chart, space: spaceOf(chart), groups: spaceOf(chart).chart.plotArea.chartGroups };
}

describe('combo is not constructible (trial parity)', () => {
  it('charts.add(..., ChartType.combo) throws the trial message', () => {
    const { sheet } = sheetWithStock();
    expect(() => sheet.charts.add('C', (ChartType as any).combo, 10, 10, 300, 200, 'A1:B3'))
      .toThrow('Can not set combo chart type!');
    expect(sheet.charts.all().length).toBe(0);
  });

  it('chart.chartType(0) throws the trial message', () => {
    const { chart } = addStock('stockHLC', 'A1:D4');
    expect(() => chart.chartType(0)).toThrow('Can not set combo chart type!');
  });
});

describe('stock data validation (trial error texts, verbatim)', () => {
  const layoutMsg = (order: string) =>
    `To create this stock chart, arrange the data on your sheet in this order: ${order}. Use dates or stock names as label`;

  it('stockOHLC with only 3 series throws the OHLC layout error', () => {
    const { sheet } = sheetWithStock();
    expect(() => sheet.charts.add('C', (ChartType as any).stockOHLC, 10, 10, 420, 280, 'A1:D4', 1))
      .toThrow(layoutMsg('opening price, high price, low price, closing price'));
  });

  it('stockVHLC with only 3 series throws the VHLC layout error', () => {
    const { sheet } = sheetWithStock();
    expect(() => sheet.charts.add('C', (ChartType as any).stockVHLC, 10, 10, 420, 280, 'A1:D4', 1))
      .toThrow(layoutMsg('volume traded, high price, low price, closing price'));
  });

  it('stockVOHLC with only 4 series throws the VOHLC layout error', () => {
    const { sheet } = sheetWithStock();
    expect(() => sheet.charts.add('C', (ChartType as any).stockVOHLC, 10, 10, 420, 280, 'A1:E4', 1))
      .toThrow(layoutMsg('volume traded, opening price, high price, low price, closing price'));
  });
});

describe('stock templates (trial-observed chartSpace)', () => {
  it('stockHLC: one group {chartType:0, hiLowLines:{}} with 3 line-like series', () => {
    const { groups } = addStock('stockHLC', 'A1:D4');
    expect(groups.length).toBe(1);
    expect(groups[0]).toMatchObject({ chartType: 0, hiLowLines: {} });
    expect(groups[0].upDownBars).toBeUndefined();
    const ser = groups[0].ser;
    expect(ser.map((s: any) => s.seriesType)).toEqual([2, 2, 2]);
    expect(ser[0].spPr).toEqual({ solidFill: { schemeClr: { val: 4 } } });
    expect(ser[0].marker).toEqual({ symbol: 4 });
    expect(ser[0].smooth).toBe(false);
    expect(ser[0].cat.strRef.f).toBe('Sheet1!$B$1:$D$1');
    expect(ser[0].val.numRef.f).toBe('Sheet1!$B$2:$D$2');
    // No bar extras and no `ln` on the stock series.
    expect(ser[0].shape).toBeUndefined();
    expect(ser[0].invertIfNegative).toBeUndefined();
    expect(ser[0].spPr.ln).toBeUndefined();
  });

  it('stockOHLC: 4 series from the columns (orientation 1)', () => {
    const { groups } = addStock('stockOHLC', 'A1:E4', 1);
    expect(groups.length).toBe(1);
    expect(groups[0].ser.length).toBe(4);
    // Candle families carry `upDownBars`; HLC ones do not.
    expect(groups[0]).toMatchObject({ hiLowLines: {}, upDownBars: { gapWidth: 150 } });
    expect(groups[0].ser[0].tx.strRef.f).toBe('Sheet1!$B$1');
    expect(groups[0].ser[0].cat.strRef.f).toBe('Sheet1!$A$2:$A$4');
    expect(groups[0].ser[3].val.numRef.f).toBe('Sheet1!$E$2:$E$4');
  });

  it('stockVHLC: volume bar group (primary) + stock group (secondary axes)', () => {
    const { groups, space } = addStock('stockVHLC', 'A1:E4', 1);
    expect(groups.map((g: any) => g.chartType)).toEqual([6, 0]);
    expect(groups[0]).toMatchObject({ barDir: 1, grouping: 1, gapWidth: 150, overlap: -27, varyColors: false });
    expect(groups[0].ser.length).toBe(1);
    expect(groups[0].ser[0].val.numRef.f).toBe('Sheet1!$B$2:$B$4');
    expect(groups[1].ser.map((s: any) => s.val.numRef.f)).toEqual([
      'Sheet1!$C$2:$C$4', 'Sheet1!$D$2:$D$4', 'Sheet1!$E$2:$E$4',
    ]);
    expect(groups[1].ser.map((s: any) => s.idx)).toEqual([1, 2, 3]);
    const axes = space.chart.plotArea.axes;
    expect(axes.length).toBe(4);
    expect(axes.map((a: any) => [a.axisType, a.axPos, a.AxisGroup, a.delete])).toEqual([
      [0, 0, 0, false], [3, 1, 0, false], [0, 3, 1, true], [3, 2, 1, false],
    ]);
    expect(axes[3].crosses).toBe(2);
    expect(axes[2].majorGridlines).toBeUndefined();
    expect(axes[3].majorGridlines).toBeUndefined();
    // The stock group points at the secondary pair.
    expect(groups[1].axId).toEqual([axes[2].axId, axes[3].axId]);
    expect(groups[0].axId).toEqual([axes[0].axId, axes[1].axId]);
  });

  it('stockVOHLC: bar + 4 stock series', () => {
    const { groups } = addStock('stockVOHLC', 'A1:F4', 1);
    expect(groups.map((g: any) => g.chartType)).toEqual([6, 0]);
    expect(groups[1].ser.length).toBe(4);
    expect(groups[1]).toMatchObject({ hiLowLines: {}, upDownBars: { gapWidth: 150 } });
    expect(groups[1].ser.map((s: any) => s.idx)).toEqual([1, 2, 3, 4]);
  });
});

describe('stock public getters (trial quirks mirrored)', () => {
  it('legend() throws the trial internal JSON error for every stock family', () => {
    for (const [type, range, orient] of [
      ['stockHLC', 'A1:D4', 0], ['stockOHLC', 'A1:E4', 1],
      ['stockVHLC', 'A1:E4', 1], ['stockVOHLC', 'A1:F4', 1],
    ] as const) {
      const { chart } = addStock(type, range, orient);
      expect(() => chart.legend(), type).toThrow('"undefined" is not valid JSON');
      // The serialised legend is still the default bottom one.
      expect(spaceOf(chart).chart.legend.legendPos).toBe(4);
    }
  });

  it('stock series report chartType 9, line border {color:"",width:2} and smooth', () => {
    const { chart } = addStock('stockHLC', 'A1:D4');
    const ser = chart.series().get(0) as any;
    expect(ser.chartType).toBe(9);
    expect(ser.border).toEqual({ color: '', transparency: 0, lineType: 0, width: 2 });
    expect(ser.smooth).toBe(false);
  });

  it('VHLC volume series report the bar shape; stock series carry axisGroup 1', () => {
    const { chart } = addStock('stockVHLC', 'A1:E4', 1);
    const bar = chart.series().get(0) as any;
    const stock = chart.series().get(1) as any;
    expect(bar.chartType).toBe(12);
    expect(bar.axisGroup).toBe(0);
    expect(stock.chartType).toBe(9);
    expect(stock.axisGroup).toBe(1);
  });

  it('chartType() keeps the stock public type after creation', () => {
    expect(addStock('stockHLC', 'A1:D4').chart.chartType()).toBe(49);
    expect(addStock('stockOHLC', 'A1:E4', 1).chart.chartType()).toBe(50);
    expect(addStock('stockVHLC', 'A1:E4', 1).chart.chartType()).toBe(51);
    expect(addStock('stockVOHLC', 'A1:F4', 1).chart.chartType()).toBe(52);
  });
});

describe('stock paint model (trial-measured scales)', () => {
  it('HLC value axis spans 0..10 for data 1..9 (trial gridlines)', () => {
    const { chart, sheet } = addStock('stockHLC', 'A1:D4');
    const model = buildPaintModel(chart as any, sheet as any);
    expect(model.groups[0].kind).toBe('stock');
    expect(model.scale.min).toBe(0);
    expect(model.scale.max).toBe(10);
    expect(model.scale.unit).toBe(2);
  });

  it('VHLC keeps the volume bars on a tight primary axis and glyphs on 0..50', () => {
    const { chart, sheet } = addStock('stockVHLC', 'A1:E4', 1);
    const model = buildPaintModel(chart as any, sheet as any);
    expect(model.groups.map(g => g.kind)).toEqual(['bar', 'stock']);
    // Primary = the volume columns [2,4,3] -> exact top 4 (trial screenshot).
    expect(model.scale.min).toBe(0);
    expect(model.scale.max).toBe(4);
    // Secondary = the stock columns (max 9 -> step 2) plus the unused 30/40/50
    // volume series is NOT part of the stock group, so the top is 10.
    expect(model.secondaryScale?.min).toBe(0);
    expect(model.secondaryScale?.max).toBe(10);
  });

  it('VOHLC puts the volume on 0..4 and the candles exactly on 0..50', () => {
    const { chart, sheet } = addStock('stockVOHLC', 'A1:F4', 1);
    const model = buildPaintModel(chart as any, sheet as any);
    expect(model.groups.map(g => g.kind)).toEqual(['bar', 'stock']);
    expect(model.scale.min).toBe(0);
    expect(model.scale.max).toBe(4);
    // Trial: the secondary top sits exactly on the data max (50), step 10.
    expect(model.secondaryScale?.min).toBe(0);
    expect(model.secondaryScale?.max).toBe(50);
    expect(model.secondaryScale?.unit).toBe(10);
  });

  it('stock charts round-trip through workbook JSON', () => {
    for (const [type, range, orient] of [
      ['stockHLC', 'A1:D4', 0], ['stockVHLC', 'A1:E4', 1], ['stockVOHLC', 'A1:F4', 1],
    ] as const) {
      const { wb } = addStock(type, range, orient);
      const wb2 = new Workbook();
      wb2.fromJSON(wb.toJSON());
      expect(wb2.getSheet(0).charts.get('C')!.chartType()).toBe((ChartType as any)[type]);
    }
  });
});
