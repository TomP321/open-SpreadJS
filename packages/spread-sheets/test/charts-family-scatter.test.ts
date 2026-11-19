/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * TASK 39 family 2 — scatter variants (smooth/lines ± markers), bubble and
 * radar (line/markers/filled).
 * Every expected value below was measured black-box from the official trial
 * runtime (@mescius/spread-sheets-charts 19.2.5) via `chart.toJSON()`, the
 * public getters and pixel measurements in the apps/compare dual-runtime
 * harness (apps/compare/scripts/chart-comparison.mjs, out dir f2).
 */
import { describe, expect, it } from 'vitest';
import GC from '../src/index.js';
import { buildPaintModel } from '../src/features/charts/paint-model.js';
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

/** Replace the per-workbook random axis ids so trees compare literally. */
function normalize(json: unknown): unknown {
  const AX = '<axId>';
  const walk = (node: unknown): void => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach(walk); return; }
    const rec = node as Record<string, unknown>;
    for (const [key, value] of Object.entries(rec)) {
      if ((key === 'axId' || key === 'crossAx') && typeof value === 'number') rec[key] = AX;
      if (key === 'axId' && Array.isArray(value)) rec[key] = [AX, AX];
      else if (key !== 'id') walk(value);
    }
  };
  const copy = JSON.parse(JSON.stringify(json));
  walk(copy);
  // The trial's deferred layout pass stamps `plotArea.spPr.ln = {noFill:true}`
  // ~2 s after creation (timer), so it is not stable across fresh vs restored.
  const plot = copy?.chart?.plotArea?.spPr;
  if (plot) delete plot.ln;
  return copy;
}

describe('scatter variant templates (trial-observed chartSpace)', () => {
  const cases: [keyof typeof ChartType, number][] = [
    ['xyScatterSmooth', 5],
    ['xyScatterSmoothNoMarkers', 4],
    ['xyScatterLines', 2],
    ['xyScatterLinesNoMarkers', 1],
  ];
  for (const [name, scatterStyle] of cases) {
    it(`${name}: group 1 with scatterStyle ${scatterStyle} and xVal/yVal series`, () => {
      const group = add(name).group;
      expect(group.chartType).toBe(1);
      expect(group.scatterStyle).toBe(scatterStyle);
      expect(group.varyColors).toBe(false);
      const ser = group.ser[0];
      expect(ser.seriesType).toBe(5);
      expect(ser.xVal.numRef.f).toBe('Sheet1!$B$1:$D$1');
      expect(ser.yVal.numRef.f).toBe('Sheet1!$B$2:$D$2');
    });
  }

  it('line-drawing scatter series keep a solid ln {w:2}, plain xyScatter keeps noFill', () => {
    const solid = add('xyScatterLines').group.ser[0];
    expect(solid.smooth).toBe(false);
    expect(solid.marker).toEqual({ symbol: 0, size: 7 });
    expect(solid.spPr.ln).toEqual({ w: 2 });
    const smooth = add('xyScatterSmooth').group.ser[0];
    expect(smooth.smooth).toBe(true);
    expect(smooth.spPr.ln).toEqual({ w: 2 });
    expect(add('xyScatter').group.ser[0].spPr.ln).toEqual({ noFill: true, w: 2 });
  });

  it('NoMarkers variants write marker {symbol:4} without a size', () => {
    expect(add('xyScatterSmoothNoMarkers').group.ser[0].marker).toEqual({ symbol: 4 });
    expect(add('xyScatterLinesNoMarkers').group.ser[0].marker).toEqual({ symbol: 4 });
  });

  it('series getters report smooth for every scatter variant except plain xyScatter', () => {
    expect((add('xyScatterLines').chart.series().get(0) as any)?.smooth).toBe(false);
    expect((add('xyScatterSmooth').chart.series().get(0) as any)?.smooth).toBe(true);
    expect('smooth' in (add('xyScatter').chart.series().get(0) as any)).toBe(false);
  });
});

describe('bubble template (trial-observed)', () => {
  it('pairs series rows with the next row as sizes; the last series falls back to literal 1s', () => {
    const { group } = add('bubble');
    expect(group.chartType).toBe(3);
    expect(group.bubbleScale).toBe(100);
    expect(group.sizeRepresents).toBe(0);
    expect(group.varyColors).toBe(false);
    expect(group.ser.length).toBe(2);
    const ser0 = group.ser[0];
    expect(ser0.seriesType).toBe(6);
    expect(ser0.tx.strRef.f).toBe('Sheet1!$A$2');
    expect(ser0.xVal.numRef.f).toBe('Sheet1!$B$1:$D$1');
    expect(ser0.yVal.numRef.f).toBe('Sheet1!$B$2:$D$2');
    expect(ser0.bubbleSize.numRef.f).toBe('Sheet1!$B$3:$D$3');
    expect(ser0.bubble3D).toBe(false);
    expect(ser0.spPr).toEqual({ solidFill: { schemeClr: { val: 4 } } });
    const ser1 = group.ser[1];
    expect(ser1.tx.strRef.f).toBe('Sheet1!$A$4');
    expect(ser1.yVal.numRef.f).toBe('Sheet1!$B$4:$D$4');
    expect(ser1.bubbleSize.numLit).toEqual({ formatCode: 'General', ptCount: 3, pt: ['1', '1', '1'] });
  });

  it('bubble series expose bubbleSizes and bubbleScale through the public getter', () => {
    const chart = add('bubble').chart;
    expect((chart.series().get(0) as any)?.bubbleSizes).toBe('Sheet1!$B$3:$D$3');
    expect((chart.series().get(0) as any)?.bubbleScale).toBe(100);
    // The trial omits `bubbleSizes` for the literal-1 fallback series.
    expect('bubbleSizes' in (chart.series().get(1) as any)).toBe(false);
  });

  it('line-drawing scatter series read back the palette border color; xyScatter stays empty', () => {
    expect((add('xyScatterLines').chart.series().get(0) as any)?.border.color).toBe('accent 1 0');
    expect((add('xyScatterSmoothNoMarkers').chart.series().get(1) as any)?.border.color).toBe('accent 2 0');
  });

  it('bubble axes are both numeric (axisType 3) without x-axis gridlines', () => {
    const axes = add('bubble').space.chart.plotArea.axes;
    expect(axes.map((a: any) => a.axisType)).toEqual([3, 3]);
    expect(axes[0].majorGridlines).toBeUndefined();
    expect(axes[1].majorGridlines).toBeDefined();
    expect(axes[1].crossBetween).toBe(0);
  });
});

describe('radar templates (trial-observed)', () => {
  it('radar / radarMarkers / radarFilled write group 2 with the right radarStyle', () => {
    const radar = add('radar').group;
    expect(radar.chartType).toBe(2);
    expect(radar.radarStyle).toBe(1);
    expect(radar.varyColors).toBe(false);
    expect(radar.ser[0].seriesType).toBe(4);
    expect(radar.ser[0].marker).toEqual({ symbol: 4 });
    expect(radar.ser[0].spPr.ln).toEqual({ w: 2 });
    expect(radar.ser[0].cat.strRef.f).toBe('Sheet1!$B$1:$D$1');
    expect(radar.ser[0].val.numRef.f).toBe('Sheet1!$B$2:$D$2');
    const markers = add('radarMarkers').group;
    expect(markers.radarStyle).toBe(1);
    expect(markers.ser[0].marker).toEqual({ symbol: 0, size: 7 });
    const filled = add('radarFilled').group;
    expect(filled.radarStyle).toBe(2);
    expect(filled.ser[0].marker).toEqual({ symbol: 4 });
    expect(filled.ser[0].spPr.ln).toEqual({ w: 0 });
  });

  it('radar defaults its legend to the top and hides the value axis line', () => {
    const { chart, space } = add('radar');
    expect((chart.legend() as any).position).toBe(1); // LegendPosition.top
    const axes = space.chart.plotArea.axes;
    expect(axes[0].axisType).toBe(0);
    expect(axes[1].axisType).toBe(3);
    expect(axes[1].spPr.ln).toEqual({ noFill: true });
  });

  it('radar value axis lineStyle reads back an empty color (trial)', () => {
    expect((add('radar').chart.axes() as any).primaryValue.lineStyle.color).toBe('');
  });
});

describe('series() public getters of family 2', () => {
  it('maps every family-2 chart type through ChartType', () => {
    const cases: [keyof typeof ChartType, number][] = [
      ['xyScatterSmooth', 33], ['xyScatterSmoothNoMarkers', 34], ['xyScatterLines', 35],
      ['xyScatterLinesNoMarkers', 36], ['bubble', 11], ['radar', 2], ['radarMarkers', 42], ['radarFilled', 43],
    ];
    for (const [type, expected] of cases)
      expect((add(type).chart.series().get(0) as any)?.chartType).toBe(expected);
  });
});

describe('paint model of family 2 (trial-measured geometry)', () => {
  it('scatter/bubble x-axis spans 0..3.5 with whole-unit ticks for data 1..3 (trial)', () => {
    for (const type of ['xyScatterLines', 'bubble'] as const) {
      const { chart, sheet } = add(type);
      const model = buildPaintModel(chart as any, sheet as any);
      expect(model.xScale.min, type).toBe(0);
      expect(model.xScale.max, type).toBe(3.5);
      expect(model.xScale.ticks, type).toEqual([0, 1, 2, 3]);
      expect(model.scale.min, type).toBe(0);
      expect(model.scale.max, type).toBe(8);
      expect(model.scale.unit, type).toBe(2);
    }
  });

  it('bubble model exposes the per-series sizes and the global maximum', () => {
    const { chart, sheet } = add('bubble');
    const model = buildPaintModel(chart as any, sheet as any);
    expect(model.groups[0].kind).toBe('bubble');
    expect(model.bubbleMax).toBe(7);
    expect(model.groups[0].series[0].sizes).toEqual([4, 6, 7]);
    expect(model.groups[0].series[1].sizes).toEqual([1, 1, 1]);
  });

  it('radar keeps the 0..8 / step-2 scale with rings at every tick (trial)', () => {
    const { chart, sheet } = add('radar');
    const model = buildPaintModel(chart as any, sheet as any);
    expect(model.groups[0].kind).toBe('radar');
    expect(model.scale.min).toBe(0);
    expect(model.scale.max).toBe(8);
    expect(model.scale.ticks).toEqual([0, 2, 4, 6, 8]);
  });

  it('scatter variants flag the connector line in the paint model', () => {
    const lines = buildPaintModel(add('xyScatterLines').chart as any, add('xyScatterLines').sheet as any);
    expect(lines.groups[0].series[0].hasLine).toBe(true);
    const plain = buildPaintModel(add('xyScatter').chart as any, add('xyScatter').sheet as any);
    expect(plain.groups[0].series[0].hasLine).toBe(false);
  });

  it('family-2 charts round-trip through workbook JSON', () => {
    for (const type of ['bubble', 'radar', 'radarFilled', 'xyScatterSmooth'] as const) {
      const { wb, chart } = add(type);
      const wb2 = new Workbook();
      wb2.fromJSON(wb.toJSON());
      const restored = wb2.getSheet(0).charts.get('C')!;
      expect(restored.chartType()).toBe((ChartType as any)[type]);
      expect(normalize(spaceOf(restored))).toEqual(normalize(chart.toJSON()
        .shapeData.graphicFrame.graphic.graphicData.chart.chartSpace));
    }
  });
});
