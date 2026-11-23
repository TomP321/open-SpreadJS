/**
 * Shared jsdom 2D-canvas stub for the designer unit tests (TASK 95).
 *
 * jsdom ships no canvas backend, but several core code paths (text measurement
 * in the List Formulas report, pivot/shape painting checks) call
 * `canvas.getContext('2d')`. The stub answers every 2D call with a no-op; the
 * single typing seam lives here so the test files no longer carry their own
 * `as unknown as` casts (the TASK 93 cleanup).
 */

export function stubCanvas2d(): void {
  (globalThis as Record<string, unknown>).CanvasRenderingContext2D = class {};
  HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, id?: string) {
    if (id !== '2d') return null;
    const target: Record<string, unknown> = { canvas: this };
    return new Proxy(target, {
      get: (t, prop) => {
        if (typeof prop === 'symbol') return undefined;
        if (prop in t) return (t as Record<string, unknown>)[prop];
        if (prop === 'measureText') return (text: unknown) => ({ width: String(text).length * 7, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 });
        if (prop === 'createLinearGradient' || prop === 'createRadialGradient' || prop === 'createPattern') return () => ({ addColorStop: () => undefined });
        return () => undefined;
      },
      set: (t, prop, value) => { (t as Record<string, unknown>)[String(prop)] = value; return true; },
    }) as unknown as CanvasRenderingContext2D;
  } as HTMLCanvasElement['getContext'];
}
