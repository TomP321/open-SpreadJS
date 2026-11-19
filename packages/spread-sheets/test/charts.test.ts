/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from 'vitest';
import GC from '../src/index.js';
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

describe('sheet.charts collection', () => {
  it('adds, lists, gets and removes charts through the public surface', () => {
    const { sheet } = sheetWithFixture();
    const chart = sheet.charts.add('Chart1', ChartType.columnClustered, 200, 10, 420, 280, 'A1:D4');
    expect(sheet.charts.all()).toHaveLength(1);
    expect(sheet.charts.get('Chart1')).toBe(chart);
    expect(chart.name()).toBe('Chart1');
    expect(chart.chartType()).toBe(ChartType.columnClustered);
    expect(chart.chartType()).toBe(12);
    expect(chart.x()).toBe(200);
    expect(chart.y()).toBe(10);
    expect(chart.width()).toBe(420);
    expect(chart.height()).toBe(280);
    expect(chart.dataRange()).toBe('Sheet1!$A$1:$D$4');
    sheet.charts.remove('Chart1');
    expect(sheet.charts.all()).toHaveLength(0);
    expect(sheet.charts.get('Chart1')).toBeNull();
  });

  it('serializes charts as shapeType-8 shapes with the preserve flag', () => {
    const { sheet } = sheetWithFixture();
    sheet.charts.add('C1', ChartType.columnClustered, 10, 10, 420, 280, 'A1:D4');
    const json = sheet.toJSON() as Record<string, unknown>;
    const shapes = json.shapes as Record<string, unknown>[];
    expect(shapes).toHaveLength(1);
    expect(shapes[0].shapeType).toBe(8);
    expect(shapes[0].name).toBe('C1');
    expect(json.preserveUnsupportedChartFlag).toBe(false);
    const frame = (shapes[0].shapeData as Record<string, unknown>).graphicFrame as Record<string, any>;
    expect(frame.graphic.graphicData.chart.chartSpace.chart.plotArea.chartGroups).toHaveLength(1);
    sheet.charts.remove('C1');
    const json2 = sheet.toJSON() as Record<string, unknown>;
    expect(json2.shapes).toBeUndefined();
    expect(json2.preserveUnsupportedChartFlag).toBeUndefined();
  });

  it('restores charts from workbook JSON and stamps plotArea ln on load', () => {
    const { wb, sheet } = sheetWithFixture();
    sheet.charts.add('C2', ChartType.line, 10, 10, 300, 180, 'A1:D4');
    // Before the deferred layout pass the freshly created chart has no `ln`.
    const fresh = sheet.charts.get('C2')!.toJSON();
    const freshSpace = fresh.shapeData.graphicFrame.graphic.graphicData.chart.chartSpace;
    expect(freshSpace.chart.plotArea.spPr).toEqual({ noFill: true });
    const wb2 = new Workbook();
    wb2.fromJSON(wb.toJSON());
    const restored = wb2.getSheet(0).charts.get('C2');
    expect(restored).not.toBeNull();
    expect(restored!.chartType()).toBe(ChartType.line);
    expect(restored!.chartType()).toBe(9);
    const loaded = restored!.toJSON();
    const loadedSpace = loaded.shapeData.graphicFrame.graphic.graphicData.chart.chartSpace;
    expect(loadedSpace.chart.plotArea.spPr.ln).toEqual({ noFill: true });
    expect(restored!.dataRange()).toBe('Sheet1!$A$1:$D$4');
  });

  it('rejects duplicate chart names like the trial', () => {
    const { sheet } = sheetWithFixture();
    sheet.charts.add('C3', ChartType.pie, 0, 0, 100, 100, 'A1:B3');
    expect(() => sheet.charts.add('C3', ChartType.pie, 0, 0, 100, 100)).toThrow(/already exists/);
  });

  it('exposes the workbook hitTest with worksheet hit info', () => {
    const wb = new Workbook();
    expect(typeof wb.hitTest).toBe('function');
    // Without a browser host the hit test still returns the coordinate object.
    expect(wb.hitTest(5, 5)).toMatchObject({ x: 5, y: 5 });
  });
});
