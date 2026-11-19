/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * TASK 39 family 5 — chart elements through the public API: data label
 * positions (per-family normalisation) and font styling, axis titles,
 * major/minor gridlines, axis number formats and legend colours.
 * Every expected value was measured black-box from the official trial
 * runtime in the apps/compare dual-runtime harness (out dirs f5..f5d).
 */
import { describe, expect, it } from 'vitest';
import GC from '../src/index.js';
import { normalizeLabelPosition, typeDefaultLabelPosition } from '../src/features/charts/dlabels.js';
const { Workbook } = GC.Spread.Sheets;
const { ChartType } = GC.Spread.Sheets.Charts;

function chartOf(type: keyof typeof ChartType) {
  const wb = new Workbook();
  const sheet = wb.getSheet(0);
  sheet.setArray(0, 0, [
    ['', 'Q1', 'Q2', 'Q3'],
    ['Apples', 5, 8, 3],
    ['Oranges', 4, 6, 7],
    ['Pears', 7, 2, 5],
  ]);
  return sheet.charts.add('C', (ChartType as any)[type], 10, 10, 420, 280, 'A1:D4', 0) as any;
}

function spaceOf(chart: any): any {
  return chart.toJSON().shapeData.graphicFrame.graphic.graphicData.chart.chartSpace;
}

describe('data label position normalisation (trial matrices)', () => {
  it('column family rejects bestFit/below/right/above and maps left to insideEnd', () => {
    for (const type of ['columnClustered', 'columnStacked', 'columnStacked100'] as const) {
      const chart = chartOf(type);
      for (const [written, stored] of [[0, 6], [1, 6], [2, 2], [3, 3], [4, 4], [5, 4], [6, 6], [7, 6], [8, 6]] as const) {
        chart.dataLabels({ showValue: true, position: written });
        const ser = spaceOf(chart).chart.plotArea.chartGroups[0].ser;
        expect(ser.every((s: any) => s.dLbls.dLblPos === stored), `${type} pos ${written}`).toBe(true);
        expect(chart.dataLabels().position, `${type} getter ${written}`).toBe(stored);
      }
    }
  });

  it('horizontal bars map insideEnd/left/right/above to 4', () => {
    const chart = chartOf('barClustered');
    for (const [written, stored] of [[0, 6], [1, 6], [2, 2], [3, 3], [4, 4], [5, 4], [7, 4], [8, 4]] as const) {
      chart.dataLabels({ showValue: true, position: written });
      expect(spaceOf(chart).chart.plotArea.chartGroups[0].ser[0].dLbls.dLblPos, `pos ${written}`).toBe(stored);
    }
  });

  it('line family rejects bestFit (7), insideEnd and outsideEnd (both 2)', () => {
    const chart = chartOf('line');
    for (const [written, stored] of [[0, 7], [1, 1], [2, 2], [4, 2], [6, 2], [8, 8]] as const) {
      chart.dataLabels({ showValue: true, position: written });
      expect(spaceOf(chart).chart.plotArea.chartGroups[0].ser[0].dLbls.dLblPos, `pos ${written}`).toBe(stored);
    }
  });

  it('scatter maps outsideEnd to centre; pie maps below/insideBase to 0 and above to 6', () => {
    const scatter = chartOf('xyScatter');
    for (const [written, stored] of [[0, 7], [1, 1], [2, 2], [6, 2], [8, 8]] as const) {
      scatter.dataLabels({ showValue: true, position: written });
      expect(spaceOf(scatter).chart.plotArea.chartGroups[0].ser[0].dLbls.dLblPos, `scatter pos ${written}`).toBe(stored);
    }
    const pie = chartOf('pie');
    for (const [written, stored] of [[1, 0], [3, 0], [4, 4], [6, 6], [8, 6]] as const) {
      pie.dataLabels({ showValue: true, position: written });
      expect(spaceOf(pie).chart.plotArea.chartGroups[0].ser[0].dLbls.dLblPos, `pie pos ${written}`).toBe(stored);
    }
  });

  it('area charts never write dLblPos; their getter reports position 2', () => {
    const chart = chartOf('area');
    for (const written of [0, 2, 6]) {
      chart.dataLabels({ showValue: true, position: written });
      const ser = spaceOf(chart).chart.plotArea.chartGroups[0].ser;
      expect(ser.every((s: any) => !('dLblPos' in s.dLbls)), `pos ${written}`).toBe(true);
      expect(chart.dataLabels().position).toBe(2);
    }
    expect(typeDefaultLabelPosition(8)).toBe(2);
    expect(normalizeLabelPosition(37, 5)).toBeUndefined();
  });

  it('font options write a txPr template and the getter reflects it', () => {
    const chart = chartOf('columnClustered');
    chart.dataLabels({ showValue: true, fontSize: 16, color: 'red', fontBold: true });
    const d = spaceOf(chart).chart.plotArea.chartGroups[0].ser[0].dLbls;
    expect(d.txPr.p[0].elements[0].rPr).toEqual({
      latin: { typeface: '+mn-lt' }, sz: 16, b: true, solidFill: { srgbClr: { val: [255, 0, 0] } },
    });
    expect(d.txPr.p[0].pPr.defRPr.sz).toBe(16);
    const back = chart.dataLabels();
    expect(back.fontSize).toBe(16);
    expect(back.fontBold).toBe(true);
    expect(back.color).toBe('rgb(255,0,0)');
    const ser = chart.series().get(0);
    expect(ser.dataLabels.fontSize).toBe(16);
    expect(ser.dataLabels.fontBold).toBe(true);
  });

  it('a following flag-only write preserves the txPr template (trial)', () => {
    const chart = chartOf('columnClustered');
    chart.dataLabels({ showValue: true, fontSize: 16, color: 'red', fontBold: true });
    chart.dataLabels({ showCategoryName: true });
    const d = spaceOf(chart).chart.plotArea.chartGroups[0].ser[0].dLbls;
    expect(d.txPr.p[0].elements[0].rPr.sz).toBe(16);
    expect(d.showCatName).toBe(true);
    expect(chart.dataLabels().fontSize).toBe(16);
  });
});

describe('axis elements through chart.axes()', () => {
  it('a number format writes numFmt with sourceLinked false and reads back', () => {
    const chart = chartOf('columnClustered');
    chart.axes({ primaryValue: { format: '0.00' } });
    const axis = spaceOf(chart).chart.plotArea.axes[1];
    expect(axis.numFmt).toEqual({ formatCode: '0.00', sourceLinked: false });
    expect(chart.axes().primaryValue.format).toBe('0.00');
    expect(chart.axes().primaryValue.numberFormatLinked).toBe(false);
  });

  it('major gridline styling nests under spPr.ln', () => {
    const chart = chartOf('columnClustered');
    chart.axes({ primaryValue: { majorGridLine: { visible: true, width: 2, color: 'rgb(255,0,0)', dashStyle: 1 } } });
    // Trial quirk: the gridline `dashStyle` is ignored (no prstDash written).
    expect(spaceOf(chart).chart.plotArea.axes[1].majorGridlines).toMatchObject({
      spPr: { ln: { solidFill: { srgbClr: { val: [255, 0, 0] } }, w: 2 } },
    });
    expect(spaceOf(chart).chart.plotArea.axes[1].majorGridlines.spPr.ln.prstDash).toBeUndefined();
    expect(chart.axes().primaryValue.majorGridLine).toMatchObject({ visible: true, width: 2, color: 'rgb(255,0,0)', dashStyle: 0 });
  });

  it('axis lineStyle colours parse user colours into the axis spPr', () => {
    const chart = chartOf('columnClustered');
    chart.axes({ primaryValue: { lineStyle: { color: 'blue', width: 2 } } });
    expect(spaceOf(chart).chart.plotArea.axes[1].spPr.ln).toMatchObject({ solidFill: { srgbClr: { val: [0, 0, 255] } }, w: 2 });
    expect(chart.axes().primaryValue.lineStyle).toMatchObject({ color: 'rgb(0,0,255)', width: 2 });
  });

  it('minor gridlines default to rgb(242,242,242) with the full getter shape', () => {
    const chart = chartOf('columnClustered');
    chart.axes({ primaryValue: { minorGridLine: { visible: true } } });
    expect(spaceOf(chart).chart.plotArea.axes[1].minorGridlines).toEqual({
      spPr: { ln: { solidFill: { srgbClr: { val: [242, 242, 242] } }, w: 1 }, effectLst: {} },
    });
    expect(chart.axes().primaryValue.minorGridLine).toEqual({
      width: 1, transparency: 0, color: 'rgb(242,242,242)', dashStyle: 0, visible: true,
    });
  });

  it('axis titles write an overlay-less rich node without a default sz', () => {
    const chart = chartOf('columnClustered');
    chart.axes({ primaryValue: { title: { text: 'Sales' } } });
    const title = spaceOf(chart).chart.plotArea.axes[1].title;
    expect(title.overlay).toBe(false);
    expect(title.tx.rich.p[0].elements[0].t).toBe('Sales');
    expect(title.tx.rich.p[0].elements[0].rPr.sz).toBeUndefined();
    expect(chart.axes().primaryValue.title).toEqual({
      text: 'Sales', color: 'rgb(89,89,89)', fontFamily: 'Calibri', fontSize: 13.33, transparency: 0,
    });
    chart.axes({ primaryValue: { title: { text: 'Sales', fontSize: 16, bold: true, color: 'red' } } });
    const rPr = spaceOf(chart).chart.plotArea.axes[1].title.tx.rich.p[0].elements[0].rPr;
    // Trial quirk: `bold` is ignored for axis titles (b stays false).
    expect(rPr).toMatchObject({ sz: 16, b: false, solidFill: { srgbClr: { val: [255, 0, 0] } } });
  });

  it('axis style colour lands in the axis txPr and reads back', () => {
    const chart = chartOf('columnClustered');
    chart.axes({ primaryCategory: { style: { fontSize: 16, color: 'red' } } });
    const txPr = spaceOf(chart).chart.plotArea.axes[0].txPr;
    expect(txPr.p[0].elements[0].rPr.sz).toBe(16);
    expect(txPr.p[0].elements[0].rPr.solidFill).toEqual({ srgbClr: { val: [255, 0, 0] } });
    expect(chart.axes().primaryCategory.style).toMatchObject({ fontSize: 16, color: 'rgb(255,0,0)' });
  });
});

describe('legend styling', () => {
  it('backColor parses rgb colours into the legend spPr and reads back', () => {
    const chart = chartOf('columnClustered');
    chart.legend({ fontSize: 16, backColor: 'rgb(255,255,0)' });
    const legend = spaceOf(chart).chart.legend;
    expect(legend.spPr.solidFill).toEqual({ srgbClr: { val: [255, 255, 0] } });
    expect(legend.spPr.noFill).toBeUndefined();
    expect(chart.legend().backColor).toBe('rgb(255,255,0)');
    expect(chart.legend().fontSize).toBe(16);
  });
});
