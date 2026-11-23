/** jsdom ships no 2D canvas backend, and the Workbook only builds its renderer (and with it the
 * Interaction and the scrollbars under test) when `CanvasRenderingContext2D` exists. This installs
 * a recording-free stub context that satisfies the calls the paint and measurement paths make.
 * Same pattern as `test/comment-ui.test.ts` (TASK 60). */
export function stubCanvas2d(): void {
  (globalThis as Record<string, unknown>).CanvasRenderingContext2D ??= class {};
  const makeContext = (canvas: HTMLCanvasElement): CanvasRenderingContext2D => {
    const target: Record<string, unknown> = { canvas };
    return new Proxy(target, {
      get: (t, prop) => {
        if (typeof prop === 'symbol') return undefined;
        if (prop in t) return t[prop as string];
        if (prop === 'measureText')
          return (text: unknown) => ({ width: String(text).length * 7, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2, fontBoundingBoxAscent: 14, fontBoundingBoxDescent: 3 });
        if (prop === 'createLinearGradient' || prop === 'createRadialGradient' || prop === 'createPattern')
          return () => ({ addColorStop: () => undefined });
        if (prop === 'getImageData') return () => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 });
        return () => undefined;
      },
      set: (t, prop, value) => {
        t[prop as string] = value;
        return true;
      },
    }) as unknown as CanvasRenderingContext2D;
  };
  HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, id?: string) {
    return id === '2d' ? makeContext(this) : null;
  } as HTMLCanvasElement['getContext'];
}
