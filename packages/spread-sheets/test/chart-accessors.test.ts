/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from 'vitest';
import GC from '../src/index.js';
const { Workbook } = GC.Spread.Sheets;
const { ChartType } = GC.Spread.Sheets.Charts;

function fixture(type = ChartType.columnClustered) {
  const wb = new Workbook();
  const sheet = wb.getSheet(0);
  sheet.setArray(0, 0, [
    ['', 'Q1', 'Q2', 'Q3'],
    ['Apples', 5, 8, 3],
    ['Oranges', 4, 6, 7],
    ['Pears', 7, 2, 5],
  ]);
  const chart = sheet.charts.add('C1', type, 0, 0, 420, 280, 'A1:D4');
  return { sheet, chart };
}

const spaceOf = (chart: any) =>
  chart.toJSON().shapeData.graphicFrame.graphic.graphicData.chart.chartSpace;

describe('title and legend', () => {
  it('title getter/setter round-trips through the rich-text template', () => {
    const { chart } = fixture();
    expect((chart.title() as any).text).toBe('Chart Title');
    chart.title({ text: 'Sales', fontSize: 24, bold: true });
    expect((chart.title() as any).text).toBe('Sales');
    expect((chart.title() as any).fontSize).toBe(24);
    // The trial stores the size but never flags bold in the rich text runs.
    expect(JSON.stringify(spaceOf(chart).chart.title)).not.toMatch(/"b":true/);
    const title = spaceOf(chart).chart.title;
    expect(title.overlay).toBe(false);
    expect(title.spPr.noFill).toBe(true);
  });

  it('legend defaults to the bottom band and moves between positions', () => {
    const { chart } = fixture();
    expect((chart.legend() as any).position).toBe(4);
    expect((chart.legend() as any).visible).toBe(true);
    chart.legend({ position: 3 });
    expect((chart.legend() as any).position).toBe(3);
    expect(spaceOf(chart).chart.legend.legendPos).toBe(3);
    chart.legend({ visible: false });
    expect((chart.legend() as any).visible).toBe(false);
    // Hidden legends drop the whole legend node in the trial's JSON.
    expect(spaceOf(chart).chart.legend).toBeUndefined();
    expect((chart.legend() as any).borderStyle).toBeNull();
  });
});

describe('axes', () => {
  it('exposes trial defaults on both primary axes', () => {
    const { chart } = fixture();
    const axes = chart.axes() as Record<string, any>;
    expect(axes.primaryCategory.visible).toBe(true);
    expect(axes.primaryCategory.tickLabelPosition).toBe(2);
    expect(axes.primaryCategory.format).toBe('General');
    expect(axes.primaryCategory.majorGridLine.visible).toBe(false);
    expect(axes.primaryValue.majorGridLine.visible).toBe(true);
    expect(axes.primaryValue.majorGridLine.color).toBe('rgb(217,217,217)');
    expect(axes.primaryValue.crossPoint).toBe('auto');
  });

  it('hiding an axis marks it deleted in the JSON', () => {
    const { chart } = fixture();
    chart.axes({ primaryCategory: { visible: false } });
    const ax = spaceOf(chart).chart.plotArea.axes.find((a: any) => Number(a.AxisType) === 0);
    expect(ax.delete).toBe(true);
    expect((chart.axes() as any).primaryCategory.visible).toBe(false);
  });
});

describe('data labels', () => {
  it('chart-level getter is minimal until set; set only merges true flags', () => {
    const { chart } = fixture();
    expect(chart.dataLabels()).toEqual({
      showValue: false, showSeriesName: false, showCategoryName: false, showDataLabelsRange: false,
    });
    chart.dataLabels({ showValue: true });
    expect((chart.dataLabels() as any).showValue).toBe(true);
    chart.dataLabels({ showValue: false });
    expect((chart.dataLabels() as any).showValue).toBe(true); // false is ignored on chart-level merge
    const dLbls = spaceOf(chart).chart.plotArea.chartGroups[0].ser[0].dLbls;
    expect(dLbls.showVal).toBe(true);
  });

  it('series-level set overwrites the flags', () => {
    const { chart } = fixture();
    chart.dataLabels({ showValue: true });
    chart.series().set(0, { dataLabels: { showValue: false } });
    expect((chart.series().get(0) as any).dataLabels.showValue).toBe(false);
  });

  it('pie charts expose showPercentage and centre position', () => {
    const { chart } = fixture(ChartType.pie);
    expect((chart.dataLabels() as any).showPercentage).toBe(false);
    chart.dataLabels({ showValue: true, position: 5 });
    const dl = chart.dataLabels() as Record<string, any>;
    expect(dl.showValue).toBe(true);
    expect(dl.position).toBe(5);
    // Pie series-level dLbls keep a label position entry.
    const dLbls = spaceOf(chart).chart.plotArea.chartGroups[0].ser[0].dLbls;
    expect(dLbls.dLblPos).toBe(5);
  });
});

describe('style accessors', () => {
  it('chartArea/plotArea colours serialize as colour objects', () => {
    const { chart } = fixture();
    chart.chartArea({ backColor: 'yellow', border: { color: 'blue', width: 2 } });
    // chartArea styling lives on the chartSpace-level spPr (ECMA-376 layout).
    const spPr = spaceOf(chart).spPr;
    expect(spPr.solidFill.srgbClr.val).toEqual([255, 255, 0]);
    expect(spPr.ln.solidFill.srgbClr.val).toEqual([0, 0, 255]);
    expect((chart.plotArea() as any).backColor).toBe('');
    chart.plotArea({ backColor: 'rgb(240,240,240)' });
    const pa = spaceOf(chart).chart.plotArea.spPr;
    expect(pa.solidFill.srgbClr.val).toEqual([240, 240, 240]);
    expect((chart.plotArea() as any).backColor).toBe('rgb(240,240,240)');
  });

  it('colorScheme/getter round-trips the [index, palette] pair', () => {
    const { chart } = fixture();
    const scheme = chart.colorScheme() as [number, string[]];
    expect(Array.isArray(scheme)).toBe(true);
    expect(scheme[0]).toBe(0);
    expect(scheme[1].length).toBeGreaterThanOrEqual(6);
    chart.colorScheme([0, ['red', 'green', 'blue']]);
    expect((chart.colorScheme() as [number, string[]])[0]).toBe(0);
  });

  it('display/behaviour flags round-trip', () => {
    const { chart } = fixture();
    expect(chart.ignoreHidden()).toBe(true);
    expect(chart.displayBlanksAs()).toBe(1);
    expect(chart.useAnimation()).toBe(false);
    expect(chart.displayNaAsBlank()).toBe(false);
    chart.ignoreHidden(false);
    expect(spaceOf(chart).chart.plotVisOnly).toBe(false);
    expect(chart.ignoreHidden()).toBe(false);
    chart.useAnimation(true);
    const useAnimation = chart.toJSON().shapeData.graphicFrame.graphic.graphicData.chart.useAnimation;
    expect(useAnimation).toBe(true);
    chart.displayBlanksAs(2);
    expect(chart.displayBlanksAs()).toBe(2);
    expect(spaceOf(chart).chart.dispBlanksAs).toBe(2);
    chart.displayNaAsBlank(true);
    expect(chart.displayNaAsBlank()).toBe(true);
  });
});
