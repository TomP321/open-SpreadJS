/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from 'vitest';
import GC from '../src/index.js';
const { Workbook } = GC.Spread.Sheets;
const { ChartType } = GC.Spread.Sheets.Charts;

function fixture() {
  const wb = new Workbook();
  const sheet = wb.getSheet(0);
  sheet.setArray(0, 0, [
    ['', 'Q1', 'Q2', 'Q3'],
    ['Apples', 5, 8, 3],
    ['Oranges', 4, 6, 7],
    ['Pears', 7, 2, 5],
  ]);
  const chart = sheet.charts.add('C1', ChartType.columnClustered, 0, 0, 420, 280, 'A1:D4');
  return { sheet, chart };
}

const spaceOf = (chart: any) =>
  chart.toJSON().shapeData.graphicFrame.graphic.graphicData.chart.chartSpace;

describe('series collection', () => {
  it('lists series with trial getter shapes', () => {
    const { chart } = fixture();
    const all = chart.series().all();
    expect(all).toHaveLength(3);
    const s0 = chart.series().get(0) as Record<string, any>;
    expect(s0.name).toBe('Sheet1!$A$2');
    expect(s0.xValues).toBe('Sheet1!$B$1:$D$1');
    expect(s0.yValues).toBe('Sheet1!$B$2:$D$2');
    expect(s0.chartType).toBe(ChartType.columnClustered);
    expect(s0.axisGroup).toBe(0);
    expect(s0.gapWidth).toBe(1.5);
    expect(s0.overlap).toBe(-0.27);
    expect(s0.backColor).toBe('accent 1 0');
  });

  it('add() appends to the group and mirrors the trial cache corruption', () => {
    const { chart } = fixture();
    chart.series().add({ name: 'Sheet1!$A$2', xValues: 'Sheet1!$B$1:$D$1', yValues: 'Sheet1!$B$2:$D$2' });
    expect(spaceOf(chart).chart.plotArea.chartGroups[0].ser).toHaveLength(4);
    // The trial breaks these getters after the series list was mutated.
    expect(() => chart.dataRange()).toThrow(/"undefined" is not valid JSON/);
    expect(chart.switchDataOrientation()).toBe(false);
    expect(chart.chartType()).toBe(ChartType.columnClustered);
  });

  it('add() with a new chart type creates a second group and zeroes chartType()', () => {
    const { chart } = fixture();
    chart.series().add({ chartType: ChartType.line, name: 'X', xValues: 'Sheet1!$B$1:$D$1', yValues: 'Sheet1!$B$2:$D$2' });
    const groups = spaceOf(chart).chart.plotArea.chartGroups;
    expect(groups).toHaveLength(2);
    expect(groups[1].chartType).toBe(8); // trial's internal line group type
    expect(groups[1].ser[0].seriesType).toBe(2);
    expect(groups[1].ser[0].spPr).toEqual({ ln: { w: 2 } });
    expect(chart.chartType()).toBe(0);
  });

  it('add() with axisGroup 1 creates secondary axes with trial attributes', () => {
    const { chart } = fixture();
    chart.series().add({
      chartType: ChartType.line, axisGroup: 1, name: 'X',
      xValues: 'Sheet1!$B$1:$D$1', yValues: 'Sheet1!$B$2:$D$2',
    });
    const axes = spaceOf(chart).chart.plotArea.axes;
    expect(axes).toHaveLength(4);
    const secondaryCat = axes.find((a: any) => Number(a.AxisGroup) === 1 && Number(a.AxisType) === 0);
    const secondaryVal = axes.find((a: any) => Number(a.AxisGroup) === 1 && Number(a.AxisType) === 1);
    expect(secondaryCat.delete).toBe(true);
    expect(secondaryVal.delete).toBe(false);
    expect(secondaryVal.crosses).toBe(2);
    expect(secondaryVal.majorGridlines).toBeUndefined();
    const axesInfo = chart.axes() as Record<string, any>;
    expect(axesInfo.secondaryCategory.visible).toBe(false);
    expect(axesInfo.secondaryCategory.crossPoint).toBe('max');
    expect(axesInfo.secondaryValue.crossPoint).toBe('auto');
  });

  it('set() rewrites refs and corrupts the cache; style-only set does not', () => {
    const { chart } = fixture();
    chart.series().set(0, { name: 'Sheet1!$D$1', xValues: 'Sheet1!$A$2:$A$4', yValues: 'Sheet1!$D$2:$D$4' });
    const ser0 = spaceOf(chart).chart.plotArea.chartGroups[0].ser[0];
    expect(ser0.tx.strRef.f).toBe('Sheet1!$D$1');
    expect(ser0.val.numRef.f).toBe('Sheet1!$D$2:$D$4');
    expect(() => chart.dataRange()).toThrow(/is not valid JSON/);
    const { chart: chart2 } = fixture();
    chart2.series().set(0, { gapWidth: 0.5, overlap: 0.2 });
    const group = spaceOf(chart2).chart.plotArea.chartGroups[0];
    expect(group.gapWidth).toBe(50);
    expect(group.overlap).toBe(20);
    expect(chart2.dataRange()).toBe('Sheet1!$A$1:$D$4');
  });

  it('remove() drops the series and renumbers the rest', () => {
    const { chart } = fixture();
    chart.series().remove(1);
    const ser = spaceOf(chart).chart.plotArea.chartGroups[0].ser;
    expect(ser).toHaveLength(2);
    expect(chart.chartType()).toBe(0);
    expect(chart.series().all()).toHaveLength(2);
  });

  // TASK 53, measured through the public API on the trial (`.probe/t53/probe-chart-bars.json`):
  // with no `dataOrientation` argument the trial takes the shape of the data range -
  // a range TALLER than wide puts every data COLUMN in its own series, otherwise every data ROW.
  it('chooses the trial data orientation from the range shape', () => {
    const wb = new Workbook();
    const sheet = wb.getSheet(0);
    sheet.setArray(0, 0, [
      ['', 'Q1', 'Q2', 'Q3'],
      ['Apples', 5, 8, 3],
      ['Oranges', 4, 6, 7],
      ['Pears', 7, 2, 5],
    ]);
    const names = (range: string, index: number) =>
      sheet.charts.add(`O${index}`, ChartType.columnClustered, 0, 0, 420, 280, range).series().all().map((s: Record<string, any>) => s.name);
    expect(names('A1:B4', 1)).toEqual(['Sheet1!$B$1']);
    expect(names('A1:C4', 2)).toEqual(['Sheet1!$B$1', 'Sheet1!$C$1']);
    expect(names('A1:D2', 3)).toEqual(['Sheet1!$A$2']);
    expect(names('A1:D3', 4)).toEqual(['Sheet1!$A$2', 'Sheet1!$A$3']);
    expect(names('A1:D4', 5)).toEqual(['Sheet1!$A$2', 'Sheet1!$A$3', 'Sheet1!$A$4']);
    // An explicit orientation is honoured as before (rows, even for a tall range).
    const manual = sheet.charts.add('M', ChartType.columnClustered, 0, 0, 420, 280, 'A1:B4', 0);
    expect(manual.series().all()).toHaveLength(3);
    // A single-series chart reports (and paints) its series name as the title (trial, same probe).
    expect(((sheet.charts.get('O1') as any).title() as Record<string, unknown>).text).toBe('Q1');
    expect(((sheet.charts.get('O5') as any).title() as Record<string, unknown>).text).toBe('Chart Title');
  });

  it('switchDataOrientation rebuilds series without styles and flips back', () => {
    const { chart } = fixture();
    expect(chart.switchDataOrientation()).toBe(true);
    const group = spaceOf(chart).chart.plotArea.chartGroups[0];
    expect(group.ser).toHaveLength(3);
    expect(group.ser[0].spPr).toBeUndefined();
    expect(group.ser[0].val.numRef.f).toBe('Sheet1!$B$2:$B$4');
    expect(chart.switchDataOrientation()).toBe(true);
    expect(spaceOf(chart).chart.plotArea.chartGroups[0].ser[0].val.numRef.f).toBe('Sheet1!$B$2:$D$2');
  });

  it('pie series expose per-point dataPoints with palette colours', () => {
    const wb = new Workbook();
    const sheet = wb.getSheet(0);
    sheet.setArray(0, 0, [['', 'Q1'], ['A', 5], ['B', 4]]);
    const pie = sheet.charts.add('P', ChartType.pie, 0, 0, 300, 200, 'A1:B3');
    // TASK 53 re-measured on the trial (`.probe/t53/probe-chart-bars.json`, case `pie-tall`):
    // a range taller than wide puts every data COLUMN in its own series, so `A1:B3` is ONE series
    // (`Sheet1!$B$1`) carrying both values, and its chart title reads the series name ("Q1").
    const items = pie.series().all();
    expect(items).toHaveLength(1);
    const g0 = items[0] as Record<string, any>;
    expect(g0.name).toBe('Sheet1!$B$1');
    expect(Object.keys(g0.dataPoints)).toEqual(['0', '1']);
    expect(g0.dataPoints['0'].backColor).toBe('accent 1 0');
    expect(g0.dataPoints['1'].backColor).toBe('accent 2 0');
    expect(g0.border.color).toBe('rgb(255,255,255)');
    expect(g0.backColor).toBe('auto');
    expect((pie.title() as Record<string, unknown>).text).toBe('Q1');
  });
});
