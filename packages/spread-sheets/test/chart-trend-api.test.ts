/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * TASK 92 item 2: trendlines and error bars are (a) stored through the public
 * series API into the chartSpace the trial uses, (b) carried into the paint
 * model, and (c) actually painted (trendline polyline + error-bar segments).
 */
import { describe, expect, it } from 'vitest';
import GC from '../src/index.js';
import { buildPaintModel } from '../src/features/charts/paint-model.js';
import { paintChart } from '../src/features/charts/paint.js';
import { drawSeriesDecorations } from '../src/features/charts/paint-decorations.js';
import type { PaintGroup } from '../src/features/charts/paint-model.js';

const { Workbook } = GC.Spread.Sheets;
const { ChartType, TrendlineType, ErrorBarType, ErrorBarValueType } = GC.Spread.Sheets.Charts;

function chartSpaceOf(chart: any) {
  return chart.toJSON().shapeData.graphicFrame.graphic.graphicData.chart.chartSpace;
}
function serOf(chart: any): any {
  const groups = chartSpaceOf(chart).chart.plotArea.chartGroups ?? [];
  return groups[0]?.ser?.[0] ?? {};
}

function sheetWithTrendData() {
  const wb = new Workbook();
  const sheet = wb.getSheet(0);
  sheet.setArray(0, 0, [
    ['X', 'Y', 'P', 'N'],
    [1, 2, 0.5, 0.3],
    [2, 4, 0.4, 0.2],
    [3, 5, 0.6, 0.4],
    [4, 8, 0.7, 0.5],
    [5, 7, 0.5, 0.3],
  ]);
  return sheet;
}

function trendFixture() {
  const wb = new Workbook();
  const sheet = wb.getSheet(0);
  sheet.setArray(0, 0, [
    ['X', 'Y', 'P', 'N'],
    [1, 2, 0.5, 0.3],
    [2, 4, 0.4, 0.2],
    [3, 5, 0.6, 0.4],
    [4, 8, 0.7, 0.5],
    [5, 7, 0.5, 0.3],
  ]);
  return { wb, sheet };
}

describe('trendline/error-bar public API -> chartSpace', () => {
  it('stores a trendline as a chartSpace c:trendline entry and reads it back', () => {
    const sheet = sheetWithTrendData();
    const chart = sheet.charts.add('T1', ChartType.columnClustered, 0, 0, 420, 280, 'A1:B6');
    const s = chart.series().get(0) as any;
    s.trendlines = [{ type: TrendlineType.linear, order: 3, period: 4, forward: 0.5, backward: 0.5, intercept: 2, displayEquation: true, displayRSquared: true, name: 'TL' }];
    chart.series().set(0, s);

    const tl = serOf(chart).trendline[0];
    expect(tl.trendlineType).toBe(TrendlineType.linear);
    expect(tl.order).toBe(3);
    expect(tl.period).toBe(4);
    expect(tl.forward).toBe(0.5);
    expect(tl.backward).toBe(0.5);
    expect(tl.intercept).toBe(2);
    expect(tl.dispEq).toBe(true);
    expect(tl.dispRSqr).toBe(true);
    expect(tl.name).toBe('TL');

    const back =  (chart.series().get(0) as any).trendlines[0];
    expect(back.type).toBe(TrendlineType.linear);
    expect(back.order).toBe(3);
    expect(back.intercept).toBe(2);
    expect(back.displayEquation).toBe(true);
    expect(back.displayRSquared).toBe(true);
    expect(back.style).toMatchObject({ width: 2, dashStyle: 8 });
  });

  it('round-trips a trendline through toJSON/fromJSON', () => {
    const { wb, sheet } = trendFixture();
    const chart = sheet.charts.add('T2', ChartType.columnClustered, 0, 0, 420, 280, 'A1:B6');
    const s = chart.series().get(0) as any;
    s.trendlines = [{ type: TrendlineType.polynomial, order: 4, displayEquation: true }];
    chart.series().set(0, s);
    const json = wb.toJSON();
    const wb2 = new Workbook();
    wb2.fromJSON(JSON.parse(JSON.stringify(json)));
    const chart2 = wb2.getSheet(0).charts.get('T2')!;
    expect(serOf(chart2).trendline[0].trendlineType).toBe(TrendlineType.polynomial);
    expect(serOf(chart2).trendline[0].order).toBe(4);
    expect( (chart2.series().get(0) as any).trendlines[0].order).toBe(4);
  });

  it('stores error bars as chartSpace c:errBars and reads them back as {vertical}', () => {
    const sheet = sheetWithTrendData();
    const chart = sheet.charts.add('E1', ChartType.columnClustered, 0, 0, 420, 280, 'A1:B6');
    const s = chart.series().get(0) as any;
    s.errorBars = { vertical: { type: ErrorBarType.both, valueType: ErrorBarValueType.fixedValue, value: 2, noEndCap: false } };
    chart.series().set(0, s);

    const eb = serOf(chart).errBars[0];
    expect(eb.errDir).toBe(1);
    expect(eb.errBarType).toBe(ErrorBarType.both);
    expect(eb.errValType).toBe(ErrorBarValueType.fixedValue);
    expect(eb.val).toBe(2);

    const back =  (chart.series().get(0) as any).errorBars.vertical;
    expect(back.type).toBe(ErrorBarType.both);
    expect(back.valueType).toBe(ErrorBarValueType.fixedValue);
    expect(back.value).toBe(2);
  });

  it('stores custom error bars with plus/minus refs', () => {
    const sheet = sheetWithTrendData();
    const chart = sheet.charts.add('E2', ChartType.columnClustered, 0, 0, 420, 280, 'A1:B6');
    const s = chart.series().get(0) as any;
    s.errorBars = { vertical: { type: ErrorBarType.both, valueType: ErrorBarValueType.custom, custom: { positive: 'Sheet1!$C$2:$C$6', negative: 'Sheet1!$D$2:$D$6' } } };
    chart.series().set(0, s);
    const eb = serOf(chart).errBars[0];
    expect(eb.errValType).toBe(ErrorBarValueType.custom);
    expect(eb.plus.numRef.f).toBe('Sheet1!$C$2:$C$6');
    expect(eb.minus.numRef.f).toBe('Sheet1!$D$2:$D$6');
    expect( (chart.series().get(0) as any).errorBars.vertical.custom).toEqual({ positive: 'Sheet1!$C$2:$C$6', negative: 'Sheet1!$D$2:$D$6' });
  });

  it('removes trendlines/error bars when set to null', () => {
    const sheet = sheetWithTrendData();
    const chart = sheet.charts.add('R1', ChartType.columnClustered, 0, 0, 420, 280, 'A1:B6');
    let s = chart.series().get(0) as any;
    s.trendlines = [{ type: TrendlineType.linear }];
    s.errorBars = { vertical: { type: ErrorBarType.both, valueType: ErrorBarValueType.fixedValue, value: 1 } };
    chart.series().set(0, s);
    expect(serOf(chart).trendline).toBeTruthy();
    s = chart.series().get(0) as any;
    s.trendlines = null;
    s.errorBars = null;
    chart.series().set(0, s);
    expect(serOf(chart).trendline).toBeUndefined();
    expect(serOf(chart).errBars).toBeUndefined();
  });
});

describe('paint model carries the decorations', () => {
  it('exposes trendlines, errBars and scatter x-domain on PaintSeries', () => {
    const sheet = sheetWithTrendData();
    const chart = sheet.charts.add('M1', ChartType.columnClustered, 0, 0, 420, 280, 'A1:B6');
    const s = chart.series().get(0) as any;
    s.trendlines = [{ type: TrendlineType.linear }];
    s.errorBars = { vertical: { type: ErrorBarType.both, valueType: ErrorBarValueType.percentage, value: 10 } };
    chart.series().set(0, s);
    const model = buildPaintModel(chart as any, sheet as any);
    const ser = model.groups[0].series[0];
    expect(Array.isArray(ser.trendlines)).toBe(true);
    expect(ser.trendlines![0].trendlineType).toBe(TrendlineType.linear);
    expect(Array.isArray(ser.errBars)).toBe(true);
    expect(ser.errBars![0].errValType).toBe(ErrorBarValueType.percentage);
  });
});

/** Minimal recording 2D context: captures strokes and text so we can assert the renderer drew. */
function recorder() {
  const strokes: { segments: [number, number][]; dash: number[] }[] = [];
  const texts: string[] = [];
  const state = { dash: [] as number[], segments: [] as [number, number][], last: null as [number, number] | null };
  const ctx: any = {
    font: '', fillStyle: '', strokeStyle: '', lineWidth: 1, textAlign: '', textBaseline: '',
    save() {}, restore() {}, beginPath() { state.segments = []; state.last = null; },
    moveTo(x: number, y: number) { state.last = [x, y]; },
    lineTo(x: number, y: number) { if (state.last) state.segments.push([state.last[0], state.last[1], x, y] as any); state.last = [x, y]; },
    closePath() {}, rect() {}, clip() {}, arc() {}, fillRect() {}, strokeRect() {}, fill() {}, clearRect() {},
    translate() {}, rotate() {}, scale() {}, ellipse() {}, quadraticCurveTo() {}, bezierCurveTo() {}, arcTo() {}, strokeText() {}, drawImage() {},
    createLinearGradient() { return { addColorStop() {} }; }, createRadialGradient() { return { addColorStop() {} }; },
    setLineDash(d: number[]) { state.dash = d; },
    stroke() { strokes.push({ segments: [...state.segments], dash: [...state.dash] }); },
    fillText(t: string) { texts.push(String(t)); },
    measureText() { return { width: 10 }; },
  };
  return { ctx, strokes, texts };
}

function makePaintContext(sheet: any, chart: any) {
  const model = buildPaintModel(chart as any, sheet as any);
  const plot = { x: 30, y: 20, width: 360, height: 220 };
  const layout = { plot, plotLine: plot, title: { y: 0, height: 0 }, legend: null };
  return { model, layout, pc: { chart, layout, model, sheet } };
}

describe('decorations renderer', () => {
  it('strokes a trendline polyline and error-bar segments on the canvas', () => {
    const sheet = sheetWithTrendData();
    const chart = sheet.charts.add('D1', ChartType.columnClustered, 0, 0, 420, 280, 'A1:B6');
    const s = chart.series().get(0) as any;
    s.trendlines = [{ type: TrendlineType.linear, displayEquation: true, displayRSquared: true }];
    s.errorBars = { vertical: { type: ErrorBarType.both, valueType: ErrorBarValueType.fixedValue, value: 1.5 } };
    chart.series().set(0, s);
    const { pc } = makePaintContext(sheet, chart);
    const { ctx, strokes, texts } = recorder();
    drawSeriesDecorations({ ...(pc as any), ctx }, pc.model.groups[0] as PaintGroup);

    // The trendline draws one dashed polyline (multiple connected segments).
    const dashed = strokes.find(s => s.dash.length > 0 && s.segments.length > 3);
    expect(dashed).toBeTruthy();
    // Error bars: vertical strokes (both caps + 1 line => several short strokes).
    expect(strokes.length).toBeGreaterThan(3);
    // Equation + R-squared labels were written.
    expect(texts.some(t => t.startsWith('y = '))).toBe(true);
    expect(texts.some(t => t.startsWith('R² = '))).toBe(true);
  });

  it('draws the moving-average sequence as a polyline', () => {
    const sheet = sheetWithTrendData();
    const chart = sheet.charts.add('D2', ChartType.line, 0, 0, 420, 280, 'A1:B6');
    const s = chart.series().get(0) as any;
    s.trendlines = [{ type: TrendlineType.movingAverage, period: 3 }];
    chart.series().set(0, s);
    const { pc } = makePaintContext(sheet, chart);
    const { ctx, strokes } = recorder();
    drawSeriesDecorations({ ...(pc as any), ctx }, pc.model.groups[0] as PaintGroup);
    expect(strokes.some(s => s.segments.length >= 3)).toBe(true);
  });

  it('supports every trendline family without throwing', () => {
    const sheet = sheetWithTrendData();
    for (const type of [TrendlineType.linear, TrendlineType.exponential, TrendlineType.logarithmic, TrendlineType.polynomial, TrendlineType.power, TrendlineType.movingAverage]) {
      const chart = sheet.charts.add(`F${type}`, ChartType.columnClustered, 0, 0, 420, 280, 'A1:B6');
      const s = chart.series().get(0) as any;
      s.trendlines = [{ type, order: 3, period: 2, displayEquation: true, displayRSquared: true }];
      chart.series().set(0, s);
      const { pc } = makePaintContext(sheet, chart);
      const { ctx, strokes } = recorder();
      expect(() => drawSeriesDecorations({ ...(pc as any), ctx }, pc.model.groups[0] as PaintGroup)).not.toThrow();
      void strokes;
      sheet.charts.remove(`F${type}`);
    }
  });

  it('renders horizontal error bars on a bar chart', () => {    const sheet = sheetWithTrendData();
    const chart = sheet.charts.add('HB', ChartType.barClustered, 0, 0, 420, 280, 'A1:B6');
    const s = chart.series().get(0) as any;
    s.errorBars = { vertical: { type: ErrorBarType.both, valueType: ErrorBarValueType.fixedValue, value: 1 } };
    chart.series().set(0, s);
    const { pc } = makePaintContext(sheet, chart);
    const { ctx, strokes } = recorder();
    const group = pc.model.groups[0] as PaintGroup;
    expect(group.horizontal).toBe(true);
    expect(() => drawSeriesDecorations({ ...(pc as any), ctx }, group)).not.toThrow();
    expect(strokes.length).toBeGreaterThan(0);
  });
});

describe('trendline legend entry + auto name (trial probe on the live page)', () => {
  it('auto-names unnamed trendlines like the trial: "Linear(Y)", "3period MovingAverage(Y)"', () => {
    const sheet = sheetWithTrendData();
    const chart = sheet.charts.add('AN1', ChartType.columnClustered, 0, 0, 420, 280, 'A1:B6');
    const s = chart.series().get(0) as any;
    s.trendlines = [{ type: TrendlineType.linear }, { type: TrendlineType.movingAverage, period: 3 }];
    chart.series().set(0, s);
    const tls = (chart.series().get(0) as any).trendlines;
    expect(tls[0].name).toBe('Linear(X)');
    expect(tls[1].name).toBe('3period MovingAverage(X)');
  });

  it('the legend lists each trendline after its series with a dashed swatch', () => {
    const sheet = sheetWithTrendData();
    const chart = sheet.charts.add('LG1', ChartType.columnClustered, 0, 0, 420, 280, 'A1:B6');
    const s = chart.series().get(0) as any;
    s.trendlines = [{ type: TrendlineType.linear, displayEquation: true }];
    chart.series().set(0, s);
    const { ctx, strokes, texts } = recorder();
    paintChart(chart as any, ctx, 420, 280);
    // Series entry first, then the trendline entry (trial legend order).
    const iSeries = texts.indexOf('X');
    const iTrend = texts.indexOf('Linear(X)');
    expect(iSeries).toBeGreaterThanOrEqual(0);
    expect(iTrend).toBe(iSeries + 1);
    // The trendline legend swatch strokes with the trendline's dash (prstDash 8 = sysDot).
    const legendDashed = strokes.filter(s => s.dash.length > 0);
    expect(legendDashed.length).toBeGreaterThanOrEqual(2); // plot line + legend swatch
  });
});


describe('TASK 94 bug 2: user colours on trendline/error-bar styles (trial probe on the live page)', () => {
  it('series().set() with style.color "red" stores srgbClr and reads back "rgb(255,0,0)" like the trial', () => {
    const sheet = sheetWithTrendData();
    const chart = sheet.charts.add('TC1', ChartType.columnClustered, 0, 0, 420, 280, 'A1:B6');
    const s = chart.series().get(0) as any;
    s.trendlines = [{ type: TrendlineType.linear, name: 'TL', style: { color: 'red', dashStyle: 8, width: 3 } }];
    chart.series().set(0, s);
    const tl = serOf(chart).trendline[0];
    expect(tl.spPr.ln.solidFill).toEqual({ srgbClr: { val: [255, 0, 0] } });
    const back = (chart.series().get(0) as any).trendlines[0];
    expect(back.style.color).toBe('rgb(255,0,0)');
    expect(back.style.width).toBe(3);
    expect(back.style.dashStyle).toBe(8);
  });
  it('scheme tokens stay schemeClr (no serialisation change for "accent 1 0")', () => {
    const sheet = sheetWithTrendData();
    const chart = sheet.charts.add('TC2', ChartType.columnClustered, 0, 0, 420, 280, 'A1:B6');
    const s = chart.series().get(0) as any;
    s.trendlines = [{ type: TrendlineType.linear, name: 'TL', style: { color: 'accent 1 0' } }];
    chart.series().set(0, s);
    const tl = serOf(chart).trendline[0];
    expect(tl.spPr.ln.solidFill).toEqual({ schemeClr: { val: 4 } });
    expect((chart.series().get(0) as any).trendlines[0].style.color).toBe('accent 1 0');
  });
  it('error-bar style.color "red" stores srgbClr too', () => {
    const sheet = sheetWithTrendData();
    const chart = sheet.charts.add('TC3', ChartType.columnClustered, 0, 0, 420, 280, 'A1:B6');
    const s = chart.series().get(0) as any;
    s.errorBars = { vertical: { type: ErrorBarType.plus, valueType: ErrorBarValueType.standardError, value: 1, style: { color: 'red', width: 2 } } };
    chart.series().set(0, s);
    const eb = Array.isArray(serOf(chart).errBars) ? serOf(chart).errBars[0] : serOf(chart).errBars;
    expect(eb.spPr.ln.solidFill).toEqual({ srgbClr: { val: [255, 0, 0] } });
  });
});
