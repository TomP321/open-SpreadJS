// @vitest-environment jsdom
/**
 * TASK 80: unit coverage for the vector glyph painters (features/glyphs.ts) and
 * the context-menu pictograms (features/menu-icons.ts). The visual parity of
 * these glyphs is gated by the Playwright masks (apps/compare); this file pins
 * their drawing behaviour headlessly: every glyph paints, each state/variant
 * draws a distinguishable picture, and nothing throws on out-of-range indices.
 */
import { describe, expect, it } from 'vitest';
import { drawFilterGlyph, drawIconGlyph, drawIconSet } from '../src/features/glyphs.js';
import { menuIcon } from '../src/features/menu-icons.js';

interface Logged { calls: { name: string; args: unknown[] }[] }

function recordingContext(): CanvasRenderingContext2D & Logged {
  const calls: { name: string; args: unknown[] }[] = [];
  const ctx = new Proxy(
    { calls },
    {
      get: (t, key: string) => {
        if (key === 'calls') return calls;
        if (key === 'measureText') return (text: unknown) => ({ width: String(text).length * 6 });
        if (key === 'createLinearGradient' || key === 'createRadialGradient')
          return () => ({ addColorStop: (stop: number, color: string) => calls.push({ name: 'gradientStop', args: [stop, color] }) });
        if (key === 'canvas') return null;
        return (...args: unknown[]) => { calls.push({ name: key, args }); };
      },
      set: (t, key: string, value) => { calls.push({ name: 'set:' + key, args: [value] }); return true; },
    },
  ) as unknown as CanvasRenderingContext2D & Logged;
  return ctx;
}

const ops = (ctx: Logged) => ctx.calls.filter((c) => !c.name.startsWith('set:'));

describe('icon-set glyphs (features/glyphs.ts)', () => {
  it('paints every icon set and index without throwing, always producing ink', () => {
    for (let iconSet = 0; iconSet <= 18; iconSet++) {
      const count = iconSet <= 9 ? 3 : iconSet <= 14 ? 4 : 5;
      for (let index = 0; index < count; index++) {
        const ctx = recordingContext();
        drawIconSet(ctx, iconSet, index, 0, 0, 18);
        expect(ops(ctx).length, `iconSet ${iconSet} index ${index}`).toBeGreaterThan(3);
      }
    }
  });
  it('clamps out-of-range indices to the first/last shape of the set', () => {
    const clamp = (index: number) => {
      const ctx = recordingContext();
      drawIconSet(ctx, 0, index, 0, 0, 18);
      return JSON.stringify(ctx.calls);
    };
    expect(clamp(-5)).toBe(clamp(0));
    expect(clamp(99)).toBe(clamp(2)); // three-way set: last index is 2
  });
  it('uses red / yellow / green palettes for the three-way traffic-light sets', () => {
    const inksFor = (index: number) => {
      const ctx = recordingContext();
      drawIconSet(ctx, 0, index, 0, 0, 18);
      return ctx.calls.filter((c) => /d86344|ea9a82|9e381c|eac282|f3dcb2|a4802b|76a797|a6c7bc|326f5b/i.test(String(c.args.join(','))));
    };
    expect(inksFor(0).length, 'red palette ink').toBeGreaterThan(0); // RED #d86344 family
    expect(inksFor(1).length, 'yellow palette ink').toBeGreaterThan(0); // YELLOW #eac282 family
    expect(inksFor(2).length, 'green palette ink').toBeGreaterThan(0); // GREEN #76a797 family
    const fam = (index: number) => String(inksFor(index)[0]?.args.join(','));
    expect([fam(0), fam(1), fam(2)]).not.toContain('undefined');
  });
  it('draws each frame glyph of drawIconGlyph with the frame scaled by zoom', () => {
    const capture = (z: number) => {
      const ctx = recordingContext();
      drawIconGlyph(ctx, 0, 0, 4, 3, z);
      return ops(ctx);
    };
    expect(capture(1).length).toBeGreaterThan(3);
    // Zooming in keeps the same geometry family (arcs/paths) with scaled coordinates.
    const z2 = capture(2).filter((c) => c.name === 'arc' || c.name === 'moveTo');
    const z1 = capture(1).filter((c) => c.name === 'arc' || c.name === 'moveTo');
    expect(z2.length).toBe(z1.length);
    if (z1.length && z1[0]!.name === 'arc') expect(Number(z2[0]!.args[2])).toBe(Number(z1[0]!.args[2]) * 2);
  });
});

describe('filter glyph (features/glyphs.ts)', () => {
  const states = [
    {},
    { sort: 1 },
    { sort: -1 },
    { filtered: true },
    { filtered: true, sort: 1 },
  ];
  it('draws a distinct glyph per filter state', () => {
    const shapes = states.map((state) => {
      const ctx = recordingContext();
      drawFilterGlyph(ctx, 10, 10, state);
      return JSON.stringify(ctx.calls);
    });
    expect(new Set(shapes).size).toBe(states.length);
    for (const shape of shapes) expect(JSON.parse(shape).length).toBeGreaterThan(3);
  });
});

describe('menu pictograms (features/menu-icons.ts)', () => {
  const KINDS = ['asc', 'desc', 'clearFilter', 'check', 'uncheck', 'filter'];
  it('returns canvases sized at dpr with the requested CSS size and aria-hidden', () => {
    const dpr = window.devicePixelRatio || 1;
    for (const kind of KINDS) {
      const canvas = menuIcon(kind, 16);
      expect(canvas.tagName).toBe('CANVAS');
      expect(canvas.width).toBe(16 * dpr);
      expect(canvas.style.width).toBe('16px');
      expect(canvas.getAttribute('aria-hidden')).toBe('true');
    }
  });
  it('paints every kind with real ink into the offscreen art', () => {
    const real = HTMLCanvasElement.prototype.getContext;
    try {
      const shapes = new Set<string>();
      for (const kind of KINDS) {
        const recorders: (CanvasRenderingContext2D & Logged)[] = [];
        HTMLCanvasElement.prototype.getContext = function () {
          const c = recordingContext();
          recorders.push(c);
          return c;
        } as unknown as HTMLCanvasElement['getContext'];
        menuIcon(kind, 17);
        const art = recorders[0]; // first canvas created is the 1x art holder
        expect(art, `art context for ${kind}`).toBeDefined();
        expect(ops(art!).length, `ink for ${kind}`).toBeGreaterThan(3);
        shapes.add(JSON.stringify(ops(art!).map((c) => [c.name, c.args])));
      }
      // Each pictogram kind is its own geometry, not one glyph reused; the trial
      // uses the same funnel art for the clear-filter and filter-by-value rows.
      expect(shapes.size).toBe(KINDS.length - 1);
    } finally {
      HTMLCanvasElement.prototype.getContext = real;
    }
  });
  it('caches repeated requests for the same kind/size/dim triple', () => {
    const real = HTMLCanvasElement.prototype.getContext;
    try {
      const recorders: (CanvasRenderingContext2D & Logged)[] = [];
      HTMLCanvasElement.prototype.getContext = function () {
        const c = recordingContext();
        recorders.push(c);
        return c;
      } as unknown as HTMLCanvasElement['getContext'];
      menuIcon('asc', 15, false); // first call: art painted + display blit
      menuIcon('asc', 15, false); // cached art: display blit only
      expect(recorders.length).toBe(3); // 2 + 1 contexts: the art is painted once only
      expect(ops(recorders[0]!).length).toBeGreaterThan(8);
    } finally {
      HTMLCanvasElement.prototype.getContext = real;
    }
  });
});
