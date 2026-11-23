// @vitest-environment jsdom
/*
 * TASK 92 item 1 — chart selection: clicking a chart shows the selection frame and the
 * 8 resize handles (trial: `gc-columnLayout` selection box with `ui-designer-*` handles),
 * dragging the frame moves the chart, dragging a handle resizes it (public x/y/width/height
 * update), the FloatingObjectSelectionChanged / FloatingObjectChanged events the d.ts lists
 * fire, and keyboard Delete removes the selected chart. Measured black-box on the trial
 * (`m7-charts-basic` scenario, click + drag probes).
 */
import { describe, expect, it } from 'vitest';
import GC from '../src/index.js';

const { Workbook, Events } = GC.Spread.Sheets;
const ChartType = GC.Spread.Sheets.Charts.ChartType as unknown as Record<string, number>;

// jsdom has no 2D backend: the renderer only builds when getContext answers.
(globalThis as Record<string, unknown>).CanvasRenderingContext2D = class {};
Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
  value() {
    const target: Record<string, unknown> = { canvas: {} };
    return new Proxy(target, {
      get: (t, prop) => {
        if (typeof prop === 'symbol') return undefined;
        if (prop in t) return t[prop as string];
        if (prop === 'measureText') return (text: unknown) => ({ width: String(text).length * 7, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 });
        if (prop === 'createLinearGradient' || prop === 'createRadialGradient' || prop === 'createPattern') return () => ({ addColorStop: () => undefined });
        if (prop === 'getImageData') return () => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 });
        return () => undefined;
      },
      set: (t, prop, value) => { t[prop as string] = value; return true; },
    });
  },
  configurable: true,
});
// jsdom lacks pointer capture; the drag handler calls it right after selecting.
if (!HTMLElement.prototype.setPointerCapture) {
  HTMLElement.prototype.setPointerCapture = function () { /* no-op */ };
  HTMLElement.prototype.releasePointerCapture = function () { /* no-op */ };
}

function harness() {
  const host = document.createElement('div');
  Object.assign(host.style, { width: '800px', height: '600px' });
  // jsdom has no layout: the renderer gates paint() on the root's measured size.
  Object.defineProperty(host, 'clientWidth', { value: 800, configurable: true });
  Object.defineProperty(host, 'clientHeight', { value: 600, configurable: true });
  document.body.append(host);
  const wb = new Workbook(host);
  const sheet = wb.getActiveSheet();
  sheet.setArray(0, 0, [['A', 'B'], [1, 2], [3, 4], [5, 6]]);
  const chart = sheet.charts.add('C1', ChartType.columnClustered, 40, 30, 300, 200, 'A1:B4');
  const view = sheet._view()!;
  // jsdom has no layout: the renderer gates paint() on the root's measured size.
  Object.defineProperty(view.root, 'clientWidth', { value: 800, configurable: true });
  Object.defineProperty(view.root, 'clientHeight', { value: 600, configurable: true });
  view.paint();
  if (!view.floatingLayer) throw new Error(`no floating layer: charts=${sheet.charts.all().length} children=${[...view.root.children].map(c => String(c.className)).join('|')}`);
  const el = view.floatingLayer!.querySelector('.opensheets-floating-object') as HTMLElement;
  return { wb, sheet, view, chart, el };
}

function pointer(el: HTMLElement, type: string, x: number, y: number): void {
  el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: x, clientY: y }));
}

describe('chart selection (trial: frame + 8 handles + move/resize/delete)', () => {
  it('renders the floating frame with the 8 resize handles for a chart', () => {
    const { wb, el } = harness();
    expect(el).toBeTruthy();
    expect([...el.querySelectorAll<HTMLElement>('.opensheets-floating-handle')].map(h => h.dataset.direction).sort()
      .join(',')).toBe('e,n,ne,nw,s,se,sw,w');
    wb.destroy();
  });

  it('clicking the chart selects it and fires FloatingObjectSelectionChanged', () => {
    const { wb, sheet, view, chart, el } = harness();
    const seen: unknown[] = [];
    sheet.bind(Events.FloatingObjectSelectionChanged, (_e: unknown, info: unknown) => seen.push(info));
    expect(chart.isSelected()).toBe(false);
    pointer(el, 'pointerdown', 200, 100);
    expect(chart.isSelected()).toBe(true);
    view.paint(); // the selected class is applied by the renderer's next frame
    expect(el.classList.contains('selected')).toBe(true);
    expect(seen).toHaveLength(1);
    expect((seen[0] as { selectionType: number }).selectionType).toBe(1);
    pointer(el, 'pointerup', 200, 100);
    wb.destroy();
  });

  it('dragging the frame moves the chart (x/y update, FloatingObjectChanged: position)', () => {
    const { wb, sheet, chart, el } = harness();
    const changed: unknown[] = [];
    sheet.bind(Events.FloatingObjectChanged, (_e: unknown, info: unknown) => changed.push(info));
    pointer(el, 'pointerdown', 200, 100);
    pointer(el, 'pointermove', 250, 140);
    pointer(el, 'pointerup', 250, 140);
    expect(Number(chart.x())).toBeCloseTo(90);
    expect(Number(chart.y())).toBeCloseTo(70);
    expect(changed).toHaveLength(1);
    expect((changed[0] as { propertyName: string }).propertyName).toBe('position');
    wb.destroy();
  });

  it('dragging the SE handle resizes the chart (width/height update, FloatingObjectChanged: size)', () => {
    const { wb, sheet, chart, el } = harness();
    const changed: unknown[] = [];
    sheet.bind(Events.FloatingObjectChanged, (_e: unknown, info: unknown) => changed.push(info));
    const se = el.querySelector<HTMLElement>('.opensheets-floating-handle.handle-se')!;
    pointer(se, 'pointerdown', 340, 230);
    pointer(el, 'pointermove', 370, 250);
    pointer(el, 'pointerup', 370, 250);
    expect(Number(chart.width())).toBeCloseTo(330);
    expect(Number(chart.height())).toBeCloseTo(220);
    expect(Number(chart.x())).toBeCloseTo(40);
    expect(Number(chart.y())).toBeCloseTo(30);
    expect((changed[0] as { propertyName: string }).propertyName).toBe('size');
    wb.destroy();
  });

  it('dragging the NW handle moves the origin while keeping the opposite corner', () => {
    const { wb, chart, el } = harness();
    const nw = el.querySelector<HTMLElement>('.opensheets-floating-handle.handle-nw')!;
    pointer(nw, 'pointerdown', 40, 30);
    pointer(el, 'pointermove', 60, 50);
    pointer(el, 'pointerup', 60, 50);
    expect(Number(chart.x())).toBeCloseTo(60);
    expect(Number(chart.y())).toBeCloseTo(50);
    expect(Number(chart.width())).toBeCloseTo(280);
    expect(Number(chart.height())).toBeCloseTo(180);
    wb.destroy();
  });

  it('Escape deselects; Delete removes the selected chart', () => {
    const { wb, sheet, chart, el } = harness();
    pointer(el, 'pointerdown', 200, 100);
    pointer(el, 'pointerup', 200, 100);
    expect(chart.isSelected()).toBe(true);
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(chart.isSelected()).toBe(false);
    pointer(el, 'pointerdown', 200, 100);
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
    expect(sheet.charts.all().length).toBe(0);
    wb.destroy();
  });

  it('selecting one chart deselects the other (single selection)', () => {
    const { wb, sheet, view, chart } = harness();
    const second = sheet.charts.add('C2', ChartType.line, 400, 300, 300, 200, 'A1:B4');
    view.paint();
    const els = [...view.floatingLayer!.querySelectorAll<HTMLElement>('.opensheets-floating-object')];
    const [firstEl, secondEl] = els;
    pointer(firstEl, 'pointerdown', 200, 100);
    expect(chart.isSelected()).toBe(true);
    pointer(secondEl, 'pointerdown', 500, 400);
    expect(chart.isSelected()).toBe(false);
    expect(second.isSelected()).toBe(true);
    wb.destroy();
  });
});

describe('TASK 94 bug 1: selecting a chart must not shift the floating layer', () => {
  it('the click focus uses preventScroll, and paint pins the layer scroll back to 0', () => {
    const { wb, view, el } = harness();
    const layer = view.floatingLayer!;
    // The real layer is overflow:hidden but programmatically scrollable (jsdom keeps scrollTop at 0);
    // model a scrollable container so the reset path is exercised.
    let scrollTop = 0;
    Object.defineProperty(layer, 'scrollTop', { configurable: true, get: () => scrollTop, set: (value: number) => { scrollTop = value; } });
    const focusCalls: unknown[] = [];
    el.focus = ((options?: unknown) => { focusCalls.push(options); }) as unknown as typeof el.focus;
    pointer(el, 'pointerdown', 200, 100);
    expect(focusCalls).toHaveLength(1);
    expect(focusCalls[0]).toEqual({ preventScroll: true });
    scrollTop = 18; // whatever made the layer scroll (Chromium focus auto-scroll), paint must undo it
    view.paint();
    expect(scrollTop).toBe(0);
    wb.destroy();
  });
});
