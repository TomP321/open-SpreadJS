import { expect, it } from 'vitest';
import { PNG } from 'pngjs';
import { measurePanes } from '../test/pixel-report.js';

it('measures small content separately and excludes masks from each region denominator', () => {
  const a = new PNG({ width: 500, height: 300 }); a.data.fill(255);
  const b = PNG.sync.read(PNG.sync.write(a));
  for (let y = 20; y < 30; y++) for (let x = 20; x < 30; x++) {
    const i = (y * b.width + x) * 4; b.data[i] = b.data[i + 1] = b.data[i + 2] = 0;
  }
  const result = measurePanes(PNG.sync.write(a), PNG.sync.write(b), {
    content: [{ x: 10, y: 10, width: 30, height: 30 }],
    headers: [{ x: 0, y: 0, width: 500, height: 10 }],
    tabs: [{ x: 0, y: 200, width: 500, height: 80 }],
    glyphs: [],
  });
  expect(result.metrics.content).toMatchObject({ pixels: 100, area: 900 });
  expect(result.metrics.content.ratio).toBeGreaterThan(0.005);
  expect(result.metrics.headers.ratio).toBe(0);
  expect(result.metrics.tabs.area).toBe(40000 - 350 * 65);
});

it('rejects nonfinite regions instead of letting an empty denominator pass', () => {
  const png = new PNG({ width: 500, height: 300 }); png.data.fill(255);
  const buffer = PNG.sync.write(png);
  expect(() => measurePanes(buffer, buffer, { content: [{ x: 0, y: 0, width: NaN, height: 20 }], headers: [], tabs: [], glyphs: [] })).toThrow('Invalid comparison region');
});

it('measures glyph rectangles separately and removes them from content and header denominators', () => {
  const a = new PNG({ width: 500, height: 300 }); a.data.fill(255);
  const b = PNG.sync.read(PNG.sync.write(a));
  const stamp = (x0: number, y0: number) => {
    for (let y = y0; y < y0 + 10; y++) for (let x = x0; x < x0 + 10; x++) {
      const i = (y * b.width + x) * 4; b.data[i] = b.data[i + 1] = b.data[i + 2] = 0;
    }
  };
  stamp(20, 20);
  stamp(95, 0);
  const result = measurePanes(PNG.sync.write(a), PNG.sync.write(b), {
    content: [{ x: 10, y: 10, width: 30, height: 30 }],
    headers: [{ x: 0, y: 0, width: 500, height: 10 }],
    tabs: [],
    glyphs: [{ x: 20, y: 20, width: 10, height: 10 }, { x: 95, y: 0, width: 10, height: 10 }],
  });
  expect(result.metrics.content).toMatchObject({ pixels: 0, area: 800 });
  expect(result.metrics.headers).toMatchObject({ pixels: 0, area: 4900 });
  expect(result.metrics.glyphs).toMatchObject({ pixels: 200, area: 200 });
});
