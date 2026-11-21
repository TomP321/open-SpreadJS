// @vitest-environment jsdom
/**
 * TASK 80: headless coverage for the cell painter (rendering-draw.ts).
 * The visual parity of this file is gated by the Playwright pixel gates; these
 * tests pin the drawing behaviour itself: text/formatting paths, borders,
 * comment indicators, the trial data-bar geometry documented in the painter
 * (task 56 `.probe/t56` scans), clip/restore discipline and the full-viewport
 * paint pipeline on a real renderer.
 */
import { describe, expect, it } from 'vitest';
import GC from '../src/index.js';
import type { Worksheet } from '../src/model.js';
import type { WorkbookRenderer } from '../src/rendering.js';
import { cellButtons, clipCell, drawBorders, drawCommentIndicator, drawDataBar, drawText, drawValidationHighlight, paint, text } from '../src/rendering-draw.js';

const { Workbook } = GC.Spread.Sheets;

let log: { name: string; args: unknown[] }[] = [];
function makeRecorder(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const stored: Record<string, unknown> = { canvas };
  const handler: ProxyHandler<object> = {
    get: (_t, key: string) => {
      if (key in stored) return stored[key];
      if (key === 'canvas') return canvas;
      if (key === 'measureText') return (t: unknown) => ({ width: String(t).length * 7, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 });
      if (key === 'createLinearGradient' || key === 'createRadialGradient')
        return () => ({ addColorStop: (stop: number, color: string) => log.push({ name: 'gradientStop', args: [stop, color] }) });
      if (key === 'getTransform') return () => ({ a: 1, d: 1 });
      if (key === 'drawImage') return () => undefined;
      return (...args: unknown[]) => { log.push({ name: key, args }); };
    },
    set: (_t, key: string, value) => { stored[key] = value; log.push({ name: 'set:' + key, args: [value] }); return true; },
  };
  return new Proxy({}, handler) as unknown as CanvasRenderingContext2D;
}
Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
  value(this: HTMLCanvasElement) { return makeRecorder(this); },
  configurable: true,
});
// jsdom ships no 2D canvas backend; Workbook only builds its renderer when this exists.
(globalThis as Record<string, unknown>).CanvasRenderingContext2D ??= class {};

function view(width = 800, height = 400): { renderer: WorkbookRenderer; sheet: Worksheet } {
  const host = document.createElement('div');
  const wb = new Workbook(host);
  const renderer = wb.getActiveSheet()._view()!;
  Object.defineProperty(renderer.root, 'clientWidth', { value: width, configurable: true });
  Object.defineProperty(renderer.root, 'clientHeight', { value: height, configurable: true });
  return { renderer, sheet: wb.getActiveSheet() };
}

describe('full paint pipeline', () => {
  it('paints the viewport of a real renderer including the values of every visible cell', () => {
    const { renderer, sheet } = view();
    sheet.setValue(0, 0, 'Hello');
    sheet.setValue(1, 0, 42);
    sheet.setFormula(2, 0, '=1+2');
    log = [];
    renderer.layoutDirty = true;
    renderer.fullDirty = true;
    paint(renderer);
    const texts = log.filter((c) => c.name === 'fillText').map((c) => String(c.args[0]));
    expect(texts).toContain('Hello');
    expect(texts).toContain('42');
    expect(texts).toContain('3');
    // header text of the row/column strips is painted by the same pass
    expect(texts.some((t) => /^1$/.test(t) || /^A$/.test(t))).toBe(true);
    expect(log.filter((c) => c.name === 'stroke' || c.name === 'fillRect').length).toBeGreaterThan(10);
  });
  it('keeps the cell loop robust: a painter exception is recorded once, not re-thrown', () => {
    const { renderer, sheet } = view();
    sheet.setValue(0, 0, 'x');
    const ctx = makeRecorder(document.createElement('canvas'));
    let warned = 0;
    const warn = console.warn;
    console.warn = () => { warned++; };
    try {
      clipCell(renderer, ctx, { index: 0, min: 0, max: 20 } as never, { index: 0, min: 0, max: 80 } as never, () => {
        throw new Error('boom-one-shot');
      });
      clipCell(renderer, ctx, { index: 0, min: 0, max: 20 } as never, { index: 0, min: 0, max: 80 } as never, () => {
        throw new Error('boom-one-shot');
      });
    } finally {
      console.warn = warn;
    }
    expect(warned).toBe(1); // deduplicated via renderer.paintWarnings
    expect(renderer.paintWarnings.has('boom-one-shot')).toBe(true);
  });
});

describe('text extraction (rendering-draw.text)', () => {
  it('renders plain values, booleans uppercased, formulas when showFormulas is on and hides zeros', () => {
    const { renderer, sheet } = view();
    const style = renderer.style(0, 0);
    expect(text(renderer, 0, 0, 'abc', style)).toBe('abc');
    expect(text(renderer, 0, 0, true, style)).toBe('TRUE');
    expect(text(renderer, 0, 0, null, style)).toBe('');
    sheet.setFormula(5, 5, '=1+1');
    sheet.options.showFormulas = true;
    expect(text(renderer, 5, 5, 2, style)).toBe('=1+1');
    sheet.options.showFormulas = false;
    sheet.options.showZeros = false;
    expect(text(renderer, 0, 0, 0, style)).toBe('');
    sheet.options.showZeros = true;
    expect(text(renderer, 0, 0, 0, style)).toBe('0');
  });
  it('formats with the cell formatter and caches the formatter object', () => {
    const { renderer } = view();
    const style = { formatter: '$#,##0.00' } as never;
    expect(text(renderer, 0, 0, 1234.5, style)).toBe('$1,234.50');
    expect(renderer.formatters.size).toBeGreaterThanOrEqual(1);
    const before = renderer.formatters.get('$#,##0.00');
    text(renderer, 0, 0, 1, style);
    expect(renderer.formatters.get('$#,##0.00')).toBe(before);
  });
});

describe('cell text painting (rendering-draw.drawText)', () => {
  it('aligns numbers right and text left with the header offset baked into x', () => {
    const { renderer, sheet } = view();
    sheet.setValue(0, 0, 'Label');
    sheet.setValue(0, 1, 7.5);
    const rect = { x: 40, y: 20, width: 80, height: 19 };
    log = [];
    drawText(renderer, makeRecorder(document.createElement('canvas')), 0, 0, 'Label', renderer.style(0, 0), rect, false);
    const first = log.find((c) => c.name === 'fillText')!;
    expect(String(first.args[0])).toBe('Label');
    expect(Number(first.args[1])).toBeLessThan(rect.x + rect.width / 2); // left-aligned with a small inset
    log = [];
    drawText(renderer, makeRecorder(document.createElement('canvas')), 0, 1, 7.5, renderer.style(0, 1), rect, false);
    const right = log.find((c) => c.name === 'fillText')!;
    expect(String(right.args[0])).toBe('7.5');
    expect(Number(right.args[1])).toBeGreaterThan(rect.x + rect.width / 2); // right-aligned
  });
  it('skips painting entirely when the cell renders to empty text', () => {
    const { renderer } = view();
    log = [];
    drawText(renderer, makeRecorder(document.createElement('canvas')), 0, 0, null, renderer.style(0, 0), { x: 0, y: 0, width: 50, height: 18 }, false);
    expect(log.filter((c) => c.name === 'fillText')).toHaveLength(0);
  });
});

describe('borders, comments and validation marks', () => {
  it('draws four border sides with the line type from the style', () => {
    const { renderer } = view();
    const ctx = makeRecorder(document.createElement('canvas'));
    // Bottom/right edges read the sheet's own style for the anchor cell's edges, so set a real Style.
    const sheet = renderer.sheet!;
    sheet.setStyle(0, 0, new GC.Spread.Sheets.Style({
      borderLeft: { style: GC.Spread.Sheets.LineStyle.thin, color: '#ff0000' },
      borderRight: { style: GC.Spread.Sheets.LineStyle.thin, color: '#00ff00' },
      borderTop: { style: GC.Spread.Sheets.LineStyle.thin, color: '#0000ff' },
      borderBottom: { style: GC.Spread.Sheets.LineStyle.thin, color: '#000000' },
    } as never));
    const style = sheet.getStyle(0, 0) as never;
    log = [];
    drawBorders(renderer, ctx, 0, 0, style, { x: 0, y: 0, width: 60, height: 20 });
    // The trial rasterises sides as filled 1 px runs, one save/fill/restore per side.
    expect(log.filter((c) => c.name === 'fillRect').length).toBeGreaterThanOrEqual(4);
    const styles = log.filter((c) => c.name === 'set:fillStyle').map((c) => String(c.args[0]));
    expect(styles.some((v) => /ff0000/i.test(v) || /255,\s*0,\s*0/.test(v)), styles.join(',')).toBe(true);
  });
  it('paints the comment triangle only while the cell has a comment', () => {
    const { renderer, sheet } = view();
    const rect = { x: 0, y: 0, width: 60, height: 20 };
    log = [];
    drawCommentIndicator(renderer, makeRecorder(document.createElement('canvas')), 3, 3, rect);
    expect(log.filter((c) => c.name === 'fill' || c.name === 'stroke').length).toBe(0);
    sheet.comments.add(3, 3, 'note');
    log = [];
    drawCommentIndicator(renderer, makeRecorder(document.createElement('canvas')), 3, 3, rect);
    expect(log.filter((c) => c.name === 'fill' || c.name === 'stroke').length).toBeGreaterThan(0);
    expect(renderer.paintWarnings.size).toBe(0);
  });
  it('draws the three trial highlight kinds (circle / dog-ear / ellipse)', () => {
    const { renderer } = view();
    const rect = { x: 0, y: 0, width: 40, height: 18 };
    log = [];
    drawValidationHighlight(renderer, makeRecorder(document.createElement('canvas')), { type: 2, color: 'red', position: 0 }, rect);
    expect(log.some((c) => c.name === 'arc')).toBe(true); // default flag: circle + white cross
    expect(log.some((c) => c.name === 'stroke')).toBe(true);
    log = [];
    drawValidationHighlight(renderer, makeRecorder(document.createElement('canvas')), { type: 1, color: 'red' }, rect);
    const ear = log.find((c) => c.name === 'moveTo')!;
    expect(Number(ear.args[0])).toBeGreaterThan(rect.width / 2); // folded corner is top-RIGHT
    expect(log.some((c) => c.name === 'fill')).toBe(true);
    log = [];
    drawValidationHighlight(renderer, makeRecorder(document.createElement('canvas')), { type: 0, color: 'red' }, rect);
    expect(log.some((c) => c.name === 'ellipse')).toBe(true);
    expect(log.some((c) => c.name === 'stroke')).toBe(true);
  });
});

describe('data bars (trial geometry, task 56 scans)', () => {
  const bar = { color: '#63be7b', axis: 0, signed: 0.5, negative: false, gradient: true };
  it('draws floor(signed * (cellWidth - 3)) pixels starting right of the axis line', () => {
    const { renderer } = view();
    const ctx = makeRecorder(document.createElement('canvas'));
    log = [];
    drawDataBar(renderer, ctx, { x: 1, y: 20, width: 150, height: 26 }, bar as never);
    const fills = log.filter((c) => c.name === 'fillRect').map((c) => c.args.map(Number));
    expect(fills.length).toBeGreaterThan(0);
    const main = fills.find(([, , w]) => Math.abs(w - Math.floor(0.5 * (150 - 3))) < 2)!; // length = floor(0.5 * area)
    expect(main).toBeDefined();
    // gradient runs from the fill colour at the axis to a 90 % white tint at 90 %.
    const stops = log.filter((c) => c.name === 'gradientStop').map((c) => String(c.args[1]));
    expect(stops.some((v) => /99,\s*190,\s*123/.test(v) || /63be7b/i.test(v)), stops.join(',')).toBe(true);
    expect(log.some((c) => c.name === 'gradientStop' && Number(c.args[0]) === 0.9)).toBe(true);
  });
  it('draws nothing when the cell is too narrow or too short', () => {
    const { renderer } = view();
    log = [];
    drawDataBar(renderer, makeRecorder(document.createElement('canvas')), { x: 0, y: 0, width: 2, height: 26 }, bar as never);
    drawDataBar(renderer, makeRecorder(document.createElement('canvas')), { x: 0, y: 0, width: 150, height: 3 }, bar as never);
    expect(log.filter((c) => c.name === 'fillRect')).toHaveLength(0);
  });
});

describe('cell buttons', () => {
  it('returns an empty list for styles without buttons and laid-out rects for visible ones', () => {
    const { renderer, sheet } = view();
    sheet.setActiveCell(1, 1);
    expect(cellButtons(renderer, 1, 1)).toEqual([]);
    sheet.setStyle(1, 1, new GC.Spread.Sheets.Style({ cellButtons: [{ position: 0, visibility: 0 }] } as never));
    const laid = cellButtons(renderer, 1, 1);
    expect(laid).toHaveLength(1);
    expect(Number.isFinite(laid[0]!.x)).toBe(true);
    expect(laid[0]!.width).toBeGreaterThan(0);
  });
});
