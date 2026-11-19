/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * TASK 39 family 4 — the DataCharts types (boxWhisker, funnel, paretoLine,
 * regionMap, sunburst, treemap, waterfall). Every expected value below was
 * measured black-box from the official trial runtime
 * (@mescius/spread-sheets-charts 19.2.5) via `chart.toJSON()` and the public
 * getters in the apps/compare dual-runtime harness (out dir
 * .probe/chart-comparison/f3).
 */
import { describe, expect, it } from 'vitest';
import GC from '../src/index.js';
const { Workbook } = GC.Spread.Sheets;
const { ChartType } = GC.Spread.Sheets.Charts;

function sheetWithFruit() {
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
  const { wb, sheet } = sheetWithFruit();
  const chart = sheet.charts.add('C', (ChartType as any)[type], 10, 10, 420, 280, 'A1:D4', 0);
  return { wb, sheet, chart, space: spaceOf(chart) };
}

const LAYOUTS: Record<string, number> = { boxWhisker: 16, funnel: 17, paretoLine: 18, regionMap: 19, sunburst: 20, treemap: 21, waterfall: 22 };

describe('data-chart templates (trial-observed chartSpace)', () => {
  for (const [type, layoutId] of Object.entries(LAYOUTS)) {
    it(`${type}: plotAreaRegion series carry layoutId ${layoutId} and formulaObj refs`, () => {
      const { space } = add(type as keyof typeof ChartType);
      const region = space.chart.plotArea.plotAreaRegion;
      expect(region.plotSurface).toEqual({ spPr: { noFill: true } });
      expect(region.series.length).toBe(3);
      expect(region.series[0]).toMatchObject({
        dataId: { val: 0 }, layoutId, hidden: false,
        tx: { txData: { f: { formula: 'Sheet1!$A$2' } } },
        formulaObj: { strDim: 'Sheet1!$B$1:$D$1', numDim: 'Sheet1!$B$2:$D$2', strDimDir: 1, numDimDir: 1 },
      });
      expect(region.series[2].formulaObj.numDim).toBe('Sheet1!$B$4:$D$4');
      // No legacy chartGroups for the DataCharts model.
      expect(space.chart.plotArea.chartGroups).toBeUndefined();
    });
  }

  it('axes: boxWhisker/funnel write one catScaling axis, waterfall cat+value, the rest none', () => {
    expect(spaceOf(add('boxWhisker').chart).chart.plotArea.axes).toMatchObject([{ catScaling: { gapWidth: 0.06 }, majorTickMarks: 2, minorTickMarks: 2, numFmt: { formatCode: 'General' } }]);
    expect(spaceOf(add('funnel').chart).chart.plotArea.axes).toMatchObject([{ catScaling: { gapWidth: 0.06 } }]);
    const wfAxes = add('waterfall').space.chart.plotArea.axes;
    expect(wfAxes.length).toBe(2);
    expect(wfAxes[0]).toMatchObject({ catScaling: { gapWidth: 0.5 } });
    expect(wfAxes[1]).toMatchObject({
      valScaling: {}, units: { unit: 'percentage' },
      majorGridlines: { spPr: { ln: { solidFill: { srgbClr: { val: [217, 217, 217] } }, w: 1 } } },
    });
    for (const type of ['paretoLine', 'regionMap', 'sunburst', 'treemap'] as const)
      expect(add(type).space.chart.plotArea.axes, type).toBeUndefined();
  });

  it('legend: bottom for boxWhisker/pareto/regionMap, top for treemap/waterfall, absent for funnel/sunburst', () => {
    expect(add('boxWhisker').space.chart.legend.legendPos).toBe(4);
    expect(add('paretoLine').space.chart.legend.legendPos).toBe(4);
    expect(add('regionMap').space.chart.legend.legendPos).toBe(4);
    expect(add('treemap').space.chart.legend.legendPos).toBe(1);
    expect(add('waterfall').space.chart.legend.legendPos).toBe(1);
    expect(add('funnel').space.chart.legend).toBeUndefined();
    expect(add('sunburst').space.chart.legend).toBeUndefined();
  });

  it('dispBlanksAs: 2 for sunburst/treemap, 1 for the rest', () => {
    for (const type of ['sunburst', 'treemap'] as const) expect(add(type).space.chart.dispBlanksAs, type).toBe(2);
    for (const type of ['boxWhisker', 'funnel', 'paretoLine', 'regionMap', 'waterfall'] as const) expect(add(type).space.chart.dispBlanksAs, type).toBe(1);
  });

  it('paretoLine/regionMap series carry accent fills schemeClr 4/5/6', () => {
    for (const type of ['paretoLine', 'regionMap'] as const) {
      const ser = add(type).space.chart.plotArea.plotAreaRegion.series;
      expect(ser.map((s: any) => s.spPr.solidFill.schemeClr.val), type).toEqual([4, 5, 6]);
    }
  });

  it('sunburst/treemap series carry dataPt palette fills, a white ln and category data labels', () => {
    for (const type of ['sunburst', 'treemap'] as const) {
      const ser = add(type).space.chart.plotArea.plotAreaRegion.series[0];
      expect(ser.dataPt.map((p: any) => p.spPr.solidFill.srgbClr.val), type).toEqual([[91, 155, 213], [237, 125, 49], [165, 165, 165]]);
      expect(ser.dataPt[0].spPr.ln).toMatchObject({ solidFill: { srgbClr: { val: [255, 255, 255] } }, w: 2 });
      expect(ser.spPr).toEqual({ ln: { solidFill: { srgbClr: { val: [255, 255, 255] } }, w: 2 } });
      expect(ser.dataLabels).toMatchObject({
        dLblPos: 2, showLeaderLines: false, showBubbleSize: false, showLegendKey: false, showPercent: false,
        visibility: { seriesName: false, categoryName: true, value: false }, separator: ', ',
      });
    }
  });

  it('waterfall writes connectorLines on every series and fmtOvrs 0/1/2', () => {
    const { space } = add('waterfall');
    for (const ser of space.chart.plotArea.plotAreaRegion.series)
      expect(ser.layoutPr).toEqual({ visibility: { connectorLines: '1' } });
    expect(space.fmtOvrs).toEqual([
      { idx: 0, spPr: { ln: { w: 0 } } }, { idx: 1, spPr: { ln: { w: 0 } } }, { idx: 2, spPr: { ln: { w: 0 } } },
    ]);
  });
});

describe('data-chart public getters (trial-measured)', () => {
  it('chartType() keeps the public type and series() report it per row', () => {
    const expects: [string, number][] = [['boxWhisker', 53], ['funnel', 54], ['paretoLine', 55], ['regionMap', 56], ['sunburst', 57], ['treemap', 58], ['waterfall', 59]];
    for (const [type, value] of expects) {
      const { chart } = add(type as keyof typeof ChartType);
      expect(chart.chartType(), type).toBe(value);
      const list = (chart.series() as any).all();
      expect(list.length, type).toBe(3);
      expect(list[0]).toMatchObject({
        name: 'Sheet1!$A$2', xValues: 'Sheet1!$B$1:$D$1', yValues: 'Sheet1!$B$2:$D$2',
        chartType: value, axisGroup: 0, backColorTransparency: 0,
      });
      expect(list[1].backColor, type === 'waterfall' ? type : type).toBe(type === 'waterfall' ? 'auto' : 'accent 2 0');
    }
  });

  it('waterfall series report backColor/border auto, gapWidth 0.5, connector lines and empty subtotals', () => {
    const { chart } = add('waterfall');
    const ser = (chart.series() as any).get(0);
    expect(ser.backColor).toBe('auto');
    expect(ser.border).toEqual({ color: 'auto', transparency: 0, lineType: 0, width: 0 });
    expect(ser.gapWidth).toBe(0.5);
    expect(ser.showConnectorLines).toBe(true);
    expect(ser.subtotals).toEqual([]);
  });

  it('funnel series report the raw catScaling gapWidth 0.06', () => {
    const ser = (add('funnel').chart.series() as any).get(0);
    expect(ser.gapWidth).toBe(0.06);
  });

  it('sunburst/treemap series report the white border, category labels and palette dataPoints', () => {
    for (const type of ['sunburst', 'treemap'] as const) {
      const ser = (add(type).chart.series() as any).get(0);
      expect(ser.border, type).toEqual({ color: 'rgb(255,255,255)', transparency: 0, lineType: 0, width: 2 });
      expect(ser.dataLabels, type).toMatchObject({ showCategoryName: true, position: 2, color: 'rgb(255,255,255)', fontSize: 13.33 });
      expect(Object.keys(ser.dataPoints), type).toEqual(['0', '1', '2']);
      expect(ser.dataPoints['1'], type).toEqual({
        backColor: 'rgb(237,125,49)', backColorTransparency: 0,
        border: { color: 'rgb(255,255,255)', transparency: 0, width: 2, lineType: 0 }, invertIfNegative: false,
      });
    }
  });

  it('legend() reports hidden/default for funnel and sunburst (no legend node)', () => {
    for (const type of ['funnel', 'sunburst'] as const)
      expect((add(type).chart as any).legend(), type).toEqual({ visible: false, position: 2, borderStyle: null });
  });

  it('axes() reports the full default cat+value pair for every data-chart type', () => {
    const axes = (add('sunburst').chart as any).axes();
    expect(Object.keys(axes).sort()).toEqual(['primaryCategory', 'primaryValue']);
    expect(axes.primaryCategory).toMatchObject({ visible: true, tickLabelPosition: 2, format: 'General', majorGridLine: { visible: false }, categoryType: 0, crossPoint: 'auto' });
    expect(axes.primaryValue).toMatchObject({
      visible: true, majorGridLine: { visible: true, width: 1, color: 'rgb(217,217,217)' }, crossPoint: 'auto',
    });
  });

  it('boxWhisker auto-titles with the first series name; the others keep "Chart Title"', () => {
    expect((add('boxWhisker').chart as any).title().text).toBe('Apples');
    expect((add('waterfall').chart as any).title().text).toBe('Chart Title');
  });
});

describe('data-chart round-trip through workbook JSON', () => {
  it('restores type, series refs, title and dataRange for every data-chart type', () => {
    for (const type of Object.keys(LAYOUTS)) {
      const { wb } = add(type as keyof typeof ChartType);
      const wb2 = new Workbook();
      wb2.fromJSON(wb.toJSON());
      const chart = wb2.getSheet(0).charts.get('C')! as any;
      expect(chart.chartType(), type).toBe((ChartType as any)[type]);
      expect(chart.dataRange(), type).toBe('Sheet1!$A$1:$D$4');
      const list = (chart.series() as any).all();
      expect(list.length, type).toBe(3);
      expect(list[2].yValues, type).toBe('Sheet1!$B$4:$D$4');
      expect(chart.title().text, type).toBe(type === 'boxWhisker' ? 'Apples' : 'Chart Title');
    }
  });

  it('series ops on a data chart write the txData/formulaObj shape', () => {
    const { chart } = add('waterfall');
    (chart.series() as any).set(0, { yValues: 'Sheet1!$B$3:$D$3' });
    const ser = spaceOf(chart).chart.plotArea.plotAreaRegion.series[0];
    expect(ser.formulaObj.numDim).toBe('Sheet1!$B$3:$D$3');
    expect(ser.tx.txData.f.formula).toBe('Sheet1!$A$2');
  });
});
