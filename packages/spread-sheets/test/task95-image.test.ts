// @vitest-environment jsdom
/*
 * TASK 95 item 2 — `toImageSrc()` renders OFFSCREEN (own canvas, independent of
 * the live viewport/scroll) with the size semantics measured black-box against
 * the official runtime (dual-runtime probes .probe/t95/out/images.json and
 * .probe/t95/out/charts.json, official trial = @mescius/spread-sheets 19.2.5 +
 * the charts/shapes plug-ins, our side = @opensheets/spread-sheets):
 *  - trial core exposes NO Workbook.toImageSrc / Worksheet.toImageSrc (the d.ts
 *    declares toImageSrc only on Chart / ShapeBase / Slicer / DOMTableSlicer);
 *  - chart snapshots use exactly width() x height(): 400x300 -> 400x300,
 *    resized 400x220 -> 400x220; the trial paints the FULL chart when it sits
 *    outside the live canvas (x()=900 in a 600 px host -> same image, len
 *    15366 both times) and when the chart is hidden — our offscreen
 *    `paintChart` answers the same semantics (15358 ours, own artwork);
 *  - shape snapshots cover the shape box plus the painting margin: measured
 *    200x100 -> 206x106 and 400x100 -> 406x106 (a 3 px inset on every side;
 *    the oval 120x60 -> 126x65 in the trial's own raster — recorded in
 *    docs/STATUS.md); hidden shapes are painted too (identical image both
 *    sides);
 *  - degenerate geometry (width/height <= 0) answers the empty string.
 * The DOM harness encodes the painted canvas size into the data URL so the
 * semantics are asserted without comparing pixel payloads.
 */
import { describe, expect, it } from 'vitest';
import GC from '../src/index.js';

const { Workbook } = GC.Spread.Sheets;
const ChartType = GC.Spread.Sheets.Charts.ChartType as unknown as Record<string, number>;
const Shapes = GC.Spread.Sheets.Shapes;

// jsdom has no 2D backend: record the paint target and encode the canvas size.
Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
  value(this: HTMLCanvasElement) {
    const anything: unknown = new Proxy(function () {} as unknown as Record<string | symbol, unknown>, {
      get: (target, key) => {
        if (key === 'canvas') return this;
        if (key === 'measureText') return (text: unknown) => ({ width: String(text).length * 7, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 });
        if (key === 'createLinearGradient' || key === 'createRadialGradient' || key === 'createPattern') return () => ({ addColorStop: () => undefined });
        if (key === 'getTransform') return () => ({ a: 1, d: 1 });
        return anything;
      },
      apply: () => anything,
      set: () => true,
    });
    return anything as CanvasRenderingContext2D;
  },
  configurable: true,
});
Object.defineProperty(HTMLCanvasElement.prototype, 'toDataURL', {
  value(this: HTMLCanvasElement) { return `data:image/png;base64,PROBE-${this.width}x${this.height}`; },
  configurable: true,
});

const FIXTURE = [['', 'Q1', 'Q2', 'Q3'], ['Apples', 5, 8, 3], ['Oranges', 4, 6, 7], ['Pears', 7, 2, 5]];

function sheetWithFixture(width = 600, height = 400) {
  const host = document.createElement('div');
  host.style.cssText = `width:${width}px;height:${height}px`;
  const wb = new Workbook(host, { sheetCount: 1 });
  const sheet = wb.getActiveSheet();
  FIXTURE.forEach((row, r) => row.forEach((v, c) => v !== '' && sheet.setValue(r, c, v)));
  return { wb, sheet, host };
}

describe('toImageSrc offscreen semantics (trial-measured, probes t95 images/charts)', () => {
  it('the trial core exposes no Workbook/Worksheet toImageSrc - neither do we (d.ts parity)', () => {
    const { wb, sheet } = sheetWithFixture();
    expect((wb as unknown as Record<string, unknown>).toImageSrc).toBeUndefined();
    expect((sheet as unknown as Record<string, unknown>).toImageSrc).toBeUndefined();
    wb.destroy();
  });

  it('shape snapshots paint the shape box inside a 3 px margin: 200x100 -> 206x106 (trial measured)', () => {
    const { wb, sheet } = sheetWithFixture();
    const shape = sheet.shapes.add('r1', Shapes.AutoShapeType.rectangle, 10, 10, 200, 100);
    expect(shape.toImageSrc()).toBe('data:image/png;base64,PROBE-206x106');
    shape.width(400); // trial: 406x106
    expect(shape.toImageSrc()).toBe('data:image/png;base64,PROBE-406x106');
    wb.destroy();
  });

  it('hidden shapes snapshot identically and degenerate sizes answer the empty string', () => {
    const { wb, sheet } = sheetWithFixture();
    const shape = sheet.shapes.add('r2', Shapes.AutoShapeType.rectangle, 0, 0, 200, 100);
    const before = shape.toImageSrc();
    shape.isVisible(false);
    expect(shape.toImageSrc()).toBe(before); // trial: identical image while hidden
    shape.width(0);
    expect(shape.toImageSrc()).toBe('');
    wb.destroy();
  });

  it('groups snapshot their bounding box with the same margin', () => {
    const { wb, sheet } = sheetWithFixture();
    const a = sheet.shapes.add('a', Shapes.AutoShapeType.rectangle, 0, 0, 50, 50);
    const b = sheet.shapes.add('b', Shapes.AutoShapeType.rectangle, 100, 0, 50, 50);
    const group = sheet.shapes.group([a, b]) as InstanceType<typeof Shapes.GroupShape>;
    expect(group.toImageSrc()).toBe('data:image/png;base64,PROBE-156x56');
    wb.destroy();
  });

  it('chart snapshots are exactly width() x height() and survive a resize', () => {
    const { wb, sheet } = sheetWithFixture();
    const chart = sheet.charts.add('C1', ChartType.columnClustered, 5, 60, 400, 300, 'A1:D4') as InstanceType<typeof GC.Spread.Sheets.Charts.Chart>;
    expect(chart.toImageSrc()).toBe('data:image/png;base64,PROBE-400x300');
    chart.width(320);
    chart.height(240);
    expect(chart.toImageSrc()).toBe('data:image/png;base64,PROBE-320x240');
    wb.destroy();
  });

  it('charts outside the live canvas and hidden charts still snapshot fully', () => {
    const { wb, sheet } = sheetWithFixture(600, 400);
    const chart = sheet.charts.add('C2', ChartType.columnClustered, 5, 60, 400, 300, 'A1:D4') as InstanceType<typeof GC.Spread.Sheets.Charts.Chart>;
    const base = chart.toImageSrc();
    expect(base).toBe('data:image/png;base64,PROBE-400x300');
    chart.x(900); // fully beyond the 600 px live canvas (trial paints the full image)
    expect(chart.toImageSrc()).toBe(base);
    chart.x(5);
    chart.isVisible(false);
    expect(chart.toImageSrc()).toBe(base);
    wb.destroy();
  });

  it('toImageSrcAsync resolves to the same offscreen snapshot', async () => {
    const { wb, sheet } = sheetWithFixture();
    const shape = sheet.shapes.add('r3', Shapes.AutoShapeType.rectangle, 0, 0, 100, 60);
    await expect(shape.toImageSrcAsync()).resolves.toBe(shape.toImageSrc());
    const chart = sheet.charts.add('C3', ChartType.columnClustered, 0, 0, 300, 200, 'A1:D4') as InstanceType<typeof GC.Spread.Sheets.Charts.Chart>;
    await expect(chart.toImageSrcAsync()).resolves.toBe('data:image/png;base64,PROBE-300x200');
    wb.destroy();
  });
});
