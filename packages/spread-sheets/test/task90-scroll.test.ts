// @vitest-environment jsdom
/* TASK 90 C — the user cannot scroll a frozen sheet: "I have to click the scrollbar at specific
 * spots", the thumb does not follow the pointer and a touchpad wheel does nothing.
 * Trial measurements behind every number here: `.probe/t90/wheel3-r1.json` (wheel: 3 rows / 3
 * columns per event whatever deltaY is, with 40px rows and 120px columns too), `.probe/t90/hbar-r1.json`
 * (arrow: one item per click), `.probe/t90/drag2-r1.json` (the trial keeps dragging while the
 * pointer has left the 15px bar, scrolling live on every move). The real pointer behaviour is
 * paired against the trial in `apps/designer-compare/test/task90-scroll.spec.ts`. */
import { describe, expect, it } from 'vitest';
import GC from '../src/index.js';
import { stubCanvas2d } from './fixtures/stub-canvas2d.js';

const { Workbook } = GC.Spread.Sheets;

stubCanvas2d();

function host(width = 500, height = 320, rows = 100, cols = 30) {
  document.body.innerHTML = '<div id="sheet"></div>';
  const element = document.getElementById('sheet')!;
  Object.defineProperties(element, { clientWidth: { configurable: true, value: width }, clientHeight: { configurable: true, value: height } });
  const workbook = new Workbook(element);
  const sheet = workbook.getSheet(0);
  for (let r = 0; r < rows; r++) {
    sheet.setValue(r, 0, `row ${r + 1}`);
    for (let c = 0; c < cols; c++) sheet.setValue(r, c, `c${r + 1}-${c + 1}`);
  }
  const view = workbook._renderer()!;
  // jsdom lays nothing out, and the renderer reads its own root: give it explicit sizes so the viewport slots exist.
  Object.defineProperties(view.root, { clientWidth: { configurable: true, value: width }, clientHeight: { configurable: true, value: height } });
  view.layout();
  view.computeSlots();
  return { workbook, sheet, view, element, root: view.root };
}

/** jsdom has no PointerEvent, so build the same shape our handlers read. */
function pointerEvent(type: string, x: number, y: number): Event {
  const event = new Event(type, { bubbles: true, cancelable: true }) as Event & { clientX: number; clientY: number; pointerId: number };
  event.clientX = x;
  event.clientY = y;
  event.pointerId = 1;
  return event;
}

function wheel(root: HTMLElement, deltaX: number, deltaY: number, shiftKey = false): void {
  // the renderer attaches its wheel handler to its own root, the child of the host element
  root.dispatchEvent(new WheelEvent('wheel', { deltaX, deltaY, shiftKey, bubbles: true, cancelable: true }));
}

const state = (sheet: ReturnType<typeof host>['sheet']): [number, number] => [sheet.getViewportTopRow(1), sheet.getViewportLeftColumn(1)];

describe('TASK 90 wheel scrolling', () => {
  it('moves 3 rows per wheel event whatever the delta (touchpad deltas included)', () => {
    const { sheet, root } = host();
    const steps: number[] = [];
    let previous = state(sheet)[0];
    for (const deltaY of [1, 4, 20, 40, 100, 400, 1200]) {
      wheel(root, 0, deltaY);
      const topRow = state(sheet)[0];
      steps.push(topRow - previous);
      previous = topRow;
    }
    expect(steps).toEqual([3, 3, 3, 3, 3, 3, 3]);
    // and the same backwards
    wheel(root, 0, -100);
    expect(state(sheet)[0]).toBe(previous - 3);
  });

  it('moves sideways for deltaX and shift+wheel, 3 columns per event', () => {
    const { sheet, root } = host();
    const columns: number[] = [];
    let previous = state(sheet)[1];
    for (const deltaX of [1, 4, 60, 200, 500]) {
      wheel(root, deltaX, 0);
      const left = state(sheet)[1];
      columns.push(left - previous);
      previous = left;
    }
    expect(columns).toEqual([3, 3, 3, 3, 3]);
    const before = state(sheet);
    wheel(root, 0, 60, true);
    expect(state(sheet)).toEqual([before[0], before[1] + 3]);
  });

  it('scrolls the scrollable pane only when rows and columns are frozen', () => {
    const { sheet, view, root } = host();
    sheet.frozenRowCount(3);
    sheet.frozenColumnCount(2);
    view.layout();
    view.computeSlots();
    const start = state(sheet);
    expect(start).toEqual([3, 2]);
    wheel(root, 0, 4);
    wheel(root, 4, 0);
    const after = state(sheet);
    expect(after).toEqual([6, 5]);
    // the frozen block itself never moves; its viewport range is the trial's index-0 answer
    expect([sheet.getViewportTopRow(0), sheet.getViewportBottomRow(0), sheet.getViewportLeftColumn(0), sheet.getViewportRightColumn(0)]).toEqual([0, 2, 0, 1]);
    // scrolling back stops at the frozen line, it does not eat into the frozen block
    for (let i = 0; i < 6; i++) wheel(root, 0, -4);
    expect(state(sheet)).toEqual([3, 5]);
    for (let i = 0; i < 6; i++) wheel(root, -4, 0);
    expect(state(sheet)).toEqual([3, 2]);
  });

  it('scrollItems lands the viewport origin exactly on an item boundary (arrows: one item)', () => {
    const { sheet, view } = host();
    view.scrollItems(true, 1);
    expect(sheet.getViewportTopRow(1)).toBe(1);
    view.scrollItems(false, 1);
    expect(sheet.getViewportLeftColumn(1)).toBe(1);
    view.scrollItems(true, -1);
    expect(sheet.getViewportTopRow(1)).toBe(0);
    // a half-scrolled sheet still lands on the next item, like the trial's arrow
    view.scroll(30, 0);
    view.scrollItems(true, 1);
    expect(sheet.getViewportTopRow(1)).toBe(2);
  });

  it('Ctrl+wheel steps the zoom by a fixed 0.15 per event whatever the deltaY (trial)', () => {
    // `.probe/t90/zoomwheel.mjs`: deltaY 30/60/120/300 all step 1 -> 1.15 -> 1.3 -> 1.45 -> 1.6.
    const { sheet, root } = host();
    const ctrlWheel = (deltaY: number) => root.dispatchEvent(new WheelEvent('wheel', { deltaY, ctrlKey: true, bubbles: true, cancelable: true }));
    const seq = [1];
    for (const dy of [-120, -60, -300, -30]) {
      ctrlWheel(dy);
      seq.push(Number(sheet.zoom().toFixed(4)));
    }
    expect(seq).toEqual([1, 1.15, 1.3, 1.45, 1.6]);
    ctrlWheel(120);
    ctrlWheel(120);
    expect(Number(sheet.zoom().toFixed(4))).toBe(1.3);
    for (let i = 0; i < 40; i++) ctrlWheel(-120);
    expect(sheet.zoom()).toBe(4); // the official 0.1..4 clamp
    for (let i = 0; i < 60; i++) ctrlWheel(120);
    expect(sheet.zoom()).toBe(0.1);
  });

  it('a track click pages by the scroll-pane extent, frozen blocks excluded (trial)', () => {
    // `.probe/t90` e2e pairing: the trial paged row 3 -> 11 with a 171px scroll pane while ours
    // used the full 231px viewport (row 14). The click distance is the scrollable pane extent.
    const { sheet, view, root } = host();
    const track = root.querySelector('.gc-vertical-scrollbar .gc-scrollbar-wrapper')!;
    track.dispatchEvent(pointerEvent('pointerdown', 782, 320)); // below the thumb -> page down
    const plainExtent = view.visibleExtent(true); // 300 - 20 header? computed from the live view
    expect(plainExtent).toBeGreaterThan(0);
    expect(view.scrollY).toBeCloseTo(plainExtent, 6);
    track.dispatchEvent(pointerEvent('pointerdown', 782, 320));
    expect(view.scrollY).toBeCloseTo(plainExtent * 2, 6);
    view.setScroll(0, 0);
    // with 3 frozen rows the same click must page only the pane below the frozen block
    sheet.frozenRowCount(3);
    view.layout();
    view.computeSlots();
    const frozenExtent = view.visibleExtent(true);
    expect(frozenExtent).toBeCloseTo(plainExtent - 60, 6); // the 3 x 20px frozen rows cut the pane
    track.dispatchEvent(pointerEvent('pointerdown', 782, 320));
    expect(view.scrollY).toBeCloseTo(frozenExtent, 6);
    expect(sheet.getViewportTopRow(1)).toBe(3 + Math.floor(frozenExtent / 20));
  });
});

describe('TASK 90 scrollbar thumb drag', () => {
  const bars = (root: HTMLElement) => {
    const vertical = root.querySelector('.gc-vertical-scrollbar')!;
    return { track: vertical.querySelector('.gc-scrollbar-wrapper') as HTMLElement, handle: vertical.querySelector('.gc-scroll-handle') as HTMLElement };
  };
  /* The drag mapping measures the thumb's usable travel with DOM rects (offsetHeight/offsetWidth);
   * jsdom lays nothing out, so stub them with the trial-bar geometry. */
  const stubBar = (track: HTMLElement, handle: HTMLElement, trackLen: number, thumbLen: number): void => {
    Object.defineProperties(track, { offsetHeight: { configurable: true, value: trackLen }, offsetWidth: { configurable: true, value: trackLen } });
    Object.defineProperties(handle, { offsetHeight: { configurable: true, value: thumbLen }, offsetWidth: { configurable: true, value: thumbLen } });
  };

  it('keeps tracking after the pointer leaves the 15px bar and stops only on release', () => {
    const { sheet, root } = host();
    const { track, handle } = bars(root);
    stubBar(track, handle, 161, 20);
    const start = state(sheet)[0];
    expect(start).toBe(0);
    handle.dispatchEvent(pointerEvent('pointerdown', 782, 204));
    // the user's pointer drifts to the right, out of the bar, while the button is held:
    // x 782-797 is the bar, so every x below is outside it
    const trail: number[] = [];
    for (let i = 1; i <= 4; i++) {
      document.dispatchEvent(pointerEvent('pointermove', 782 - 60 * i, 204 + 25 * i));
      trail.push(state(sheet)[0]);
    }
    // trial quantization: round(pointerDelta * lastItem(199) / travel(141)) whole rows, live per move
    expect(trail).toEqual([35, 71, 106, 141]);
    expect(handle.style.top).not.toBe('');
    const last = trail[3];
    document.dispatchEvent(pointerEvent('pointerup', 542, 304));
    // released: further pointer motion must not scroll any more
    document.dispatchEvent(pointerEvent('pointermove', 542, 360));
    expect(state(sheet)[0]).toBe(last);
  });

  it('a release far away (outside the bar, outside the host) still ends the drag', () => {
    const { sheet, root } = host();
    const { track, handle } = bars(root);
    stubBar(track, handle, 161, 20);
    handle.dispatchEvent(pointerEvent('pointerdown', 782, 204));
    document.dispatchEvent(pointerEvent('pointermove', 40, 420)); // far left of the bar AND past the sheet end (clamped)
    const moved = state(sheet)[0];
    expect(moved).toBe(199);
    document.dispatchEvent(pointerEvent('pointerup', 40, 640)); // released outside the host
    document.dispatchEvent(pointerEvent('pointermove', 40, 700));
    expect(state(sheet)[0]).toBe(moved);
  });

  it("reproduces the trial's measured drag trails item-for-item", () => {
    // `.probe/t90/scroll2-r7.json`: 20px pointer steps, travel = track - thumb, both bars,
    // frozen and plain, rows AND the non-uniform-look horizontal `2/5/7/9` columns (30px steps).
    const { sheet, view, root } = host();
    const { track, handle } = bars(root);
    const drag = (steps: number[], stepPx: number): number[] => {
      handle.dispatchEvent(pointerEvent('pointerdown', 782, 204));
      const trail: number[] = [];
      for (let i = 1; i <= steps.length; i++) {
        document.dispatchEvent(pointerEvent('pointermove', 782, 204 + stepPx * i));
        trail.push(state(sheet)[0]);
      }
      document.dispatchEvent(pointerEvent('pointerup', 782, 204 + stepPx * steps.length));
      return trail;
    };
    // frozen 3 rows, trial travel 221-10=211 -> topRow 22/40/59/77/96 (trial `frozen-z1`)
    sheet.frozenRowCount(3);
    view.layout(); view.computeSlots(); view.setScroll(0, 0);
    stubBar(track, handle, 221, 10);
    expect(drag([1, 2, 3, 4, 5], 20)).toEqual([22, 40, 59, 77, 96]);
    sheet.frozenRowCount(0);
    view.layout(); view.computeSlots(); view.setScroll(0, 0);
    // plain, trial travel 221-12=209 -> 19/38/57/76/95 (`plain-z1`)
    stubBar(track, handle, 221, 12);
    expect(drag([1, 2, 3, 4, 5], 20)).toEqual([19, 38, 57, 76, 95]);
    // the horizontal bar with 30px steps over a uniform 62px axis maps to the same item rounding
    // the trial's Data-sheet bar measured (`2/5/7/9`, travel 409-158=251): round(30*19/251)=2,
    // round(60*19/251)=5, round(90*19/251)=7, round(120*19/251)=9.
    const hbar = root.querySelector('.gc-horizontal-scrollbar')!;
    const hTrack = hbar.querySelector('.gc-scrollbar-wrapper') as HTMLElement;
    const hHandle = hbar.querySelector('.gc-scroll-handle') as HTMLElement;
    stubBar(hTrack, hHandle, 409, 158);
    hHandle.dispatchEvent(pointerEvent('pointerdown', 600, 437));
    const hTrail: number[] = [];
    for (let i = 1; i <= 4; i++) {
      document.dispatchEvent(pointerEvent('pointermove', 600 + 30 * i, 437 + 60 * i)); // drift DOWN out of the bar
      hTrail.push(state(sheet)[1]);
    }
    document.dispatchEvent(pointerEvent('pointerup', 720, 677));
    expect(hTrail).toEqual([2, 5, 7, 9]);
  });
});

describe('TASK 90 frozen-pane viewport addressing', () => {
  it('answers the viewport index the way the trial does (leading, trailing, none)', () => {
    // trial values: .probe/t90/viewport2-r1.json, measured on the same 200x20 sheet
    const { sheet, view } = host();
    const read = (): [number, number, number, number][] => [0, 1, 2].map((index): [number, number, number, number] => [
      sheet.getViewportTopRow(index),
      sheet.getViewportBottomRow(index),
      sheet.getViewportLeftColumn(index),
      sheet.getViewportRightColumn(index),
    ]);
    const settle = (): void => {
      view.layout();
      view.computeSlots();
    };
    const frozen = (values: [number, number, number, number][]): [number, number, number, number][] => [values[0], values[2]];
    sheet.frozenRowCount(3);
    sheet.frozenColumnCount(2);
    settle();
    sheet.showCell(40, 10, 0, 0);
    settle();
    const leading = read();
    // index 0 = the leading block, index 2 = no trailing block at all (an empty range at the far
    // end): both are viewport-size independent and match the trial exactly
    expect(frozen(leading)).toEqual([[0, 2, 0, 1], [200, 199, 20, 19]]);
    // the scrolling viewport starts at the cell showCell put at the top-left of the scrollable area
    expect(leading[1][0]).toBe(40);
    expect(leading[1][2]).toBe(10);
    expect(leading[1][1]).toBeGreaterThan(40);
    expect(leading[1][3]).toBeGreaterThan(10); // no trailing freeze: the visible columns run on
    sheet.frozenTrailingRowCount(2);
    sheet.frozenTrailingColumnCount(2);
    settle();
    const trailing = read();
    expect(frozen(trailing)).toEqual([[0, 2, 0, 1], [198, 199, 18, 19]]);
    // the trailing block is cut out of the scrolling viewport: exactly 2 rows and 2 columns less,
    // the trial's 45 -> 43 and 19 -> 17
    expect(leading[1][1] - trailing[1][1]).toBe(2);
    expect(leading[1][3] - trailing[1][3]).toBe(2);
    sheet.frozenRowCount(0);
    sheet.frozenColumnCount(0);
    settle();
    // nothing frozen: index 0 is the empty range the trial reports (top 0, bottom -1)
    expect(frozen(read())[0]).toEqual([0, -1, 0, -1]);
  });
});
