// @vitest-environment jsdom
/*
 * TASK 54 item 1 — the trial's chart rendering frame (canvas probe
 * `.probe/t54/probe-t54-canvas54.json`, bar/cluster edge scans `.probe/t54/sweep-chart-*.log`):
 *  - every chart is painted 1 px left/above its declared rect: for a chart added at
 *    (200,10) the trial's chart-area frame lines sit at data columns 199..618 and rows 9..288;
 *  - the frame is a borderW-wide line hugging that box: default 1 px (solid frame pixels),
 *    custom chartArea border width 2 (trial blue pixels cover the outer two columns/rows);
 *  - the chart CONTENT keeps the chart-rect coordinate system (plot left 23, right 398,
 *    floor 202 relative to the chart rect on the 420x280 columnClustered reference), i.e.
 *    paintChart translates +1 inside the shifted canvas;
 *  - switchDataOrientation keeps the switched orientation (trial axis-scale scenario:
 *    series names become $B$1..$D$1 after one switch, $A$2..$A$4 after the switch back).
 */
import { describe, expect, it } from 'vitest';
import GC from '../src/index.js';
import type { Worksheet } from '../src/model.js';
import type { WorkbookRenderer } from '../src/rendering.js';
import { computeLayout, RIGHT_GUTTER } from '../src/features/charts/layout.js';

const { Workbook } = GC.Spread.Sheets;
const ChartType = GC.Spread.Sheets.Charts.ChartType as unknown as Record<string, number>;

interface PaintCall { name: string, args: unknown[] }

// jsdom has no 2D backend: record the painting calls (same trick as shape-base.test.ts).
let calls: PaintCall[] = [];
function recordingContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx: unknown = new Proxy({}, {
    get: (_t, key: string) => {
      if (key === 'canvas') return canvas;
      if (key === 'measureText') return () => ({ width: 8 });
      if (key === 'createLinearGradient') return () => ({ addColorStop: () => undefined });
      if (key === 'getTransform') return () => ({ a: 1, d: 1 });
      if (key === 'lineWidth') return 1;
      return (...args: unknown[]) => { calls.push({ name: key, args }); return undefined; };
    },
    set: (_t, key: string, value) => { calls.push({ name: 'set:' + key, args: [value] }); return true; },
  });
  return ctx as CanvasRenderingContext2D;
}
Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
  value(this: HTMLCanvasElement) { return recordingContext(this); },
  configurable: true,
});

const FIXTURE = [['', 'Q1', 'Q2', 'Q3'], ['Apples', 5, 8, 3], ['Oranges', 4, 6, 1], ['Pears', 7, 2, 5]];

function sheetWithFixture(): Worksheet {
  const host = document.createElement('div');
  host.style.cssText = 'width:800px;height:560px';
  const wb = new Workbook(host, { sheetCount: 1 });
  const sheet = wb.getActiveSheet();
  for (let r = 0; r < FIXTURE.length; r++)
    for (let c = 0; c < FIXTURE[r].length; c++) sheet.setValue(r, c, FIXTURE[r][c]);
  return sheet as unknown as Worksheet;
}

interface ChartInternals {
  element?: HTMLElement;
  _render(view: WorkbookRenderer, layer: HTMLElement, zIndex: number): void;
}

function renderChart(chart: unknown): HTMLElement {
  calls = [];
  const view = { headerWidth: 40, headerHeight: 20, scrollX: 0, scrollY: 0, zoom: 1 } as unknown as WorkbookRenderer;
  const layer = document.createElement('div');
  (chart as ChartInternals)._render(view, layer, 0);
  return (chart as ChartInternals).element!;
}

describe('chart frame box (trial probe t54-canvas54)', () => {
  it('anchors the chart canvas 1 px up-left of the declared rect (trial box 199..618 / 9..288)', () => {
    const sheet = sheetWithFixture();
    const chart = sheet.charts.add('C1', ChartType.columnClustered, 200, 10, 420, 280, 'A1:D4');
    const element = renderChart(chart);
    expect(element.style.left).toBe('239px'); // 40 header + 200 - 1 (trial frame column 199)
    expect(element.style.top).toBe('29px');   // 20 header + 10 - 1 (trial frame row 9)
    expect(element.style.width).toBe('420px');
    expect(element.style.height).toBe('280px');
  });

  it('strokes the 1 px chart-area frame inside the shifted box and translates the content +1', () => {
    const sheet = sheetWithFixture();
    const chart = sheet.charts.add('C2', ChartType.columnClustered, 200, 10, 420, 280, 'A1:D4');
    renderChart(chart);
    const strokeIndex = calls.findIndex(c => c.name === 'strokeRect');
    expect(strokeIndex).toBeGreaterThanOrEqual(0);
    expect(calls[strokeIndex].args).toEqual([0.5, 0.5, 419, 279]); // canvas columns 0..419 = data 199..618
    expect(calls.some(c => c.name === 'set:lineWidth' && c.args[0] === 1)).toBe(true);
    const translate = calls.findIndex(c => c.name === 'translate' && c.args[0] === 1 && c.args[1] === 1);
    expect(translate).toBeGreaterThan(strokeIndex); // frame first, then the content shift
    expect(calls.some(c => c.name === 'save')).toBe(true);
  });

  it('a chartArea border of width w hugs the box (trial 2 px blue at the box edges)', () => {
    const sheet = sheetWithFixture();
    const chart = sheet.charts.add('C3', ChartType.columnClustered, 200, 10, 420, 280, 'A1:D4') as unknown as {
      chartArea(value: unknown): unknown;
    };
    chart.chartArea({ backColor: 'yellow', border: { color: 'blue', width: 2 } });
    renderChart(chart);
    const strokeIndex = calls.findIndex(c => c.name === 'strokeRect');
    expect(calls[strokeIndex].args).toEqual([1, 1, 418, 278]); // 2 px line covering canvas columns 0..1 / 418..419
    expect(calls.some(c => c.name === 'set:lineWidth' && c.args[0] === 2)).toBe(true);
  });

  it('keeps the trial plot gutters on the 420x280 reference (plot 23..398, floor 202)', () => {
    const layout = computeLayout(420, 280, {
      titleText: 'Chart Title', titleFontSize: 18.67, legendVisible: true, legendPosition: 4,
      leftGutter: 23, rightGutter: RIGHT_GUTTER, bottomGutter: 30,
    });
    expect(RIGHT_GUTTER).toBe(22); // trial plot right edge = chart rect + 398
    expect(layout.plot.x).toBe(23);
    expect(layout.plot.x + layout.plot.width).toBe(398);
    // floor: 280 - (30 category band + 48 bottom legend) = 202 relative to the chart rect (trial floor row 212 data)
    expect(layout.plot.y + layout.plot.height).toBe(202);
  });

  it('switchDataOrientation keeps the switched orientation (trial axis-scale scenario)', () => {
    const sheet = sheetWithFixture();
    const chart = sheet.charts.add('C4', ChartType.columnClustered, 200, 10, 420, 280, 'A1:D4') as unknown as {
      series(): { all(): Record<string, unknown>[] };
      switchDataOrientation(): boolean;
    };
    const names = () => chart.series().all().map(s => s.name as string);
    expect(names()).toEqual(['Sheet1!$A$2', 'Sheet1!$A$3', 'Sheet1!$A$4']); // auto: 3x3 data -> rows
    expect(chart.switchDataOrientation()).toBe(true);
    expect(names()).toEqual(['Sheet1!$B$1', 'Sheet1!$C$1', 'Sheet1!$D$1']); // trial: column series
    chart.switchDataOrientation();
    expect(names()).toEqual(['Sheet1!$A$2', 'Sheet1!$A$3', 'Sheet1!$A$4']); // trial: back to rows
  });
});
