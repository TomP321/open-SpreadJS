/**
 * TASK 80: headless painting of the DataCharts families.
 *
 * paintDataChartSurface (datacharts/paint.ts + paint-extra.ts) and paintChart
 * for the trial's offline data-chart types (features/charts/paint-data-charts.ts)
 * are driven with a recording context on real chart objects built through the
 * public API. Pixel parity stays under the Playwright gates; here we pin that
 * each family paints its characteristic geometry (polar wedges, treemap tiles,
 * scatter marks) and nothing throws on unbound charts.
 */
import { describe, expect, it } from 'vitest';
import GC from '../src/index.js';
import { paintDataChartSurface } from '../src/datacharts/paint.js';
import { paintChart } from '../src/features/charts/paint.js';

const { Workbook } = GC.Spread.Sheets;
const { DataChartType } = GC.Spread.Sheets.DataCharts;
const { ChartType } = GC.Spread.Sheets.Charts;

interface Call { name: string; args: unknown[] }
let log: Call[] = [];
function recordingContext(): CanvasRenderingContext2D {
  const stored: Record<string, unknown> = {};
  return new Proxy({}, {
    get: (_t, key: string) => {
      if (key in stored) return stored[key];
      if (key === 'measureText') return (t: unknown) => ({ width: String(t).length * 6, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 });
      if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => ({ addColorStop: () => undefined });
      if (key === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
      return (...args: unknown[]) => { log.push({ name: key, args }); };
    },
    set: (_t, key: string, value) => { stored[key] = value; log.push({ name: 'set:' + key, args: [value] }); return true; },
  }) as unknown as CanvasRenderingContext2D;
}

async function sheetWithTable() {
  const wb = new Workbook();
  const sheet = wb.getSheet(0);
  await wb.dataManager().addTable('Sales', {
    data: [
      { Region: 'East', Product: 'Juice', Category: 'Drinks', Sales: 140, Qty: 9 },
      { Region: 'East', Product: 'Milk', Category: 'Drinks', Sales: 431, Qty: 38 },
      { Region: 'North', Product: 'Juice', Category: 'Drinks', Sales: 250, Qty: 23 },
      { Region: 'North', Product: 'Milk', Category: 'Drinks', Sales: 666, Qty: 39 },
    ],
  }).fetch();
  return sheet;
}

describe('data-chart surface painter (pie / donut / rose / sunburst / treemap / polar bars)', () => {
  const families = ['pie', 'donut', 'rose', 'sunburst', 'treemap', 'polarCoordinatesBar', 'radialStackedBar', 'polarCoordinatesStackedBar'] as const;
  it.each(families)('paints %s with real ink from the bound table', async (type) => {
    const sheet = await sheetWithTable();
    const dc = sheet.dataCharts.add('DC', 0, 0, 400, 260, type as never);
    dc.setChartConfig({
      tableName: 'Sales',
      plots: [{ type: type as never, encodings: { values: [{ field: 'Sales' }], category: { field: 'Product' } } }],
    } as never);
    log = [];
    paintDataChartSurface(dc, recordingContext(), 400, 260);
    const ops = log.filter((c) => !c.name.startsWith('set:'));
    expect(ops.length, `${type} ink`).toBeGreaterThan(type === 'treemap' ? 3 : 5);
    if (type === 'treemap') expect(ops.filter((c) => c.name === 'fillRect').length).toBeGreaterThan(1); // background + the trial's root block
    else expect(ops.filter((c) => c.name === 'arc' || c.name === 'ellipse').length, `${type} arcs`).toBeGreaterThan(0);
  });
  it('gives every pie slice its wedge and the full circle (sweeps sum to 2π per series)', async () => {
    const sheet = await sheetWithTable();
    const dc = sheet.dataCharts.add('P', 0, 0, 300, 240, DataChartType.pie);
    dc.setChartConfig({
      tableName: 'Sales',
      plots: [{ type: 'pie' as never, encodings: { values: [{ field: 'Sales' }], category: { field: 'Product' } } }],
    } as never);
    log = [];
    paintDataChartSurface(dc, recordingContext(), 300, 240);
    // Trial semantics (documented in paint-extra): one VALUE series paints ONE slice
    // covering the whole circle; per-category wedges need a colour encoding.
    const arcs = log.filter((c) => c.name === 'arc');
    expect(arcs.length).toBeGreaterThanOrEqual(1);
    const total = arcs.reduce((sum, c) => sum + (Number(c.args[4]) - Number(c.args[3])), 0);
    expect(Math.abs(total - 2 * Math.PI)).toBeLessThan(1e-6);
    // Two value series split the circle into one wedge per series (trial semantics).
    log = [];
    dc.setChartConfig({
      tableName: 'Sales',
      plots: [{ type: 'pie' as never, encodings: { values: [{ field: 'Sales' }, { field: 'Qty' }], category: { field: 'Product' } } }],
    } as never);
    paintDataChartSurface(dc, recordingContext(), 300, 240);
    const wedges = log.filter((c) => c.name === 'arc');
    const wedgeTotal = wedges.reduce((sum, c) => sum + (Number(c.args[4]) - Number(c.args[3])), 0);
    expect(wedges.length).toBe(2);
    expect(Math.abs(wedgeTotal - 2 * Math.PI)).toBeLessThan(1e-6);
  });
  it('survives an unbound chart (blank model) and paints the background', async () => {
    const sheet = await sheetWithTable();
    const dc = sheet.dataCharts.add('E', 0, 0, 200, 160, DataChartType.donut);
    log = [];
    expect(() => paintDataChartSurface(dc, recordingContext(), 200, 160)).not.toThrow();
    const rects = log.filter((c) => c.name === 'fillRect').map((c) => c.args.map(Number));
    expect(rects[0]).toEqual([0, 0, 200, 160]); // background first
  });
});

describe('scatter families go through paintScatterMarks', () => {
  it.each(['scatter', 'bubble'] as const)('draws a mark per point for %s', async (type) => {
    const sheet = await sheetWithTable();
    const dc = sheet.dataCharts.add('S', 0, 0, 420, 300, type as never);
    dc.setChartConfig({
      tableName: 'Sales',
      plots: [{ type: type as never, encodings: { values: [{ field: 'Sales' }, { field: 'Qty' }], category: { field: 'Product' } } }],
    } as never);
    log = [];
    paintDataChartSurface(dc, recordingContext(), 420, 300);
    const arcs = log.filter((c) => c.name === 'arc');
    expect(arcs.length).toBeGreaterThanOrEqual(4); // >= one mark per data row
  });
});

describe('offline trial data-chart types (features/charts)', () => {
  const types: Array<[string, keyof typeof ChartType]> = [
    ['boxWhisker', 'boxWhisker'], ['funnel', 'funnel'], ['paretoLine', 'paretoLine'],
    ['regionMap', 'regionMap'], ['sunburst', 'sunburst'], ['treemap', 'treemap'], ['waterfall', 'waterfall'],
  ];
  it.each(types)('%s paints its fallback glyph without throwing', async (_name, type) => {
    const sheet = await sheetWithTable();
    sheet.setArray(0, 0, [['Product', 'Sales'], ['Juice', 140], ['Milk', 431], ['Tea', 250], ['Rye', 666]]);
    const chart = sheet.charts.add('C', ChartType[type] as never, 0, 0, 420, 280, 'A1:B5');
    log = [];
    expect(() => paintChart(chart, recordingContext(), 420, 280)).not.toThrow();
    const ops = log.filter((c) => !c.name.startsWith('set:'));
    expect(ops.length, `${_name} ink`).toBeGreaterThan(5);
    expect(log.some((c) => c.name === 'clearRect')).toBe(true);
  });
});
