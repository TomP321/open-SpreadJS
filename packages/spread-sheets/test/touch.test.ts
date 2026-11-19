// @vitest-environment jsdom
// TASK 44 item 2 — GC.Spread.Sheets.Touch (TouchToolStrip / TouchToolStripItem /
// TouchToolStripSeparator) + Workbook touch options + the touch long-press flow.
// Expected values are the trial's observed behaviour, recorded by
// .probe/api-sweep-probe.mjs segments `touch`, `touch2`..`touch6`, `touchreal`
// (black-box public API; DOM class structure observed via element inspection).
import { afterEach, describe, expect, it, vi } from 'vitest';
import GC from '../src/index.js';
import type { TouchToolStrip } from '../src/touch.js';

// jsdom ships no 2D canvas backend; the Workbook only builds its renderer (and
// with it the Interaction under test) when CanvasRenderingContext2D exists.
function stubCanvas2d(): void {
  (globalThis as Record<string, unknown>).CanvasRenderingContext2D = class {};
  const makeContext = (canvas: HTMLCanvasElement): CanvasRenderingContext2D => {
    const target: Record<string, unknown> = { canvas };
    return new Proxy(target, {
      get: (t, prop) => {
        if (typeof prop === 'symbol') return undefined;
        if (prop in t) return t[prop as string];
        if (prop === 'measureText') return () => ({ width: 8, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2, fontBoundingBoxAscent: 14, fontBoundingBoxDescent: 3 });
        if (prop === 'createLinearGradient' || prop === 'createRadialGradient' || prop === 'createPattern') return () => ({ addColorStop: () => undefined });
        if (prop === 'getImageData') return () => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 });
        return () => undefined;
      },
      set: (t, prop, value) => { t[prop as string] = value; return true; },
    }) as unknown as CanvasRenderingContext2D;
  };
  HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, id?: string) {
    return id === '2d' ? makeContext(this) : null;
  } as HTMLCanvasElement['getContext'];
}
stubCanvas2d();
// jsdom lacks pointer-capture; the interaction calls it on pointerdown.
if (!Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = function () { /* noop */ } as Element['setPointerCapture'];
  Element.prototype.releasePointerCapture = function () { /* noop */ } as Element['releasePointerCapture'];
  Element.prototype.hasPointerCapture = function () { return false; } as Element['hasPointerCapture'];
}

const { Workbook } = GC.Spread.Sheets;
const { Touch } = GC.Spread.Sheets;
const { TouchToolStrip: Strip, TouchToolStripItem: Item, TouchToolStripSeparator: Separator } = Touch;

interface Harness { host: HTMLElement; wb: InstanceType<typeof Workbook> }
function makeWorkbook(): Harness {
  const host = document.createElement('div');
  host.style.width = '400px';
  host.style.height = '300px';
  document.body.append(host);
  const wb = new Workbook(host);
  return { host, wb };
}
function stripOf(h: Harness): TouchToolStrip {
  return h.wb.touchToolStrip as TouchToolStrip;
}
function buttons(strip: TouchToolStrip, host: HTMLElement): HTMLElement[] {
  const wrap = host.querySelector('.gc-toolstrip-default')!;
  void strip;
  return Array.from(wrap.querySelectorAll('button'));
}
function wrapper(host: HTMLElement): HTMLElement {
  return host.querySelector<HTMLElement>('.gc-toolstrip-default')!;
}

afterEach(() => { document.body.innerHTML = ''; });

describe('Touch namespace shape (trial probe `touch:ns`)', () => {
  it('exposes the three toolstrip classes with the trial constructor arity', () => {
    expect(typeof Strip).toBe('function');
    expect(typeof Item).toBe('function');
    expect(typeof Separator).toBe('function');
    expect(Strip.length).toBe(2); // (workbook, host)
    expect(Item.length).toBe(5); // (name, text, image, command, canExecute)
    expect(Separator.length).toBe(1); // (canExecute)
  });

  it('declares the prototype members the trial declares (public ones)', () => {
    const stripProto = Object.getOwnPropertyNames(Strip.prototype);
    for (const name of ['add', 'clear', 'close', 'getItem', 'getItems', 'imageAreaHeight', 'itemHeight', 'itemWidth', 'open', 'remove', 'separatorHeight']) {
      expect(stripProto, name).toContain(name);
    }
    const itemProto = Object.getOwnPropertyNames(Item.prototype);
    for (const name of ['font', 'foreColor', 'image', 'name', 'text']) expect(itemProto, name).toContain(name);
    expect(Object.getOwnPropertyNames(Separator.prototype)).toContain('name');
  });
});

describe('Workbook.touchToolStrip (trial probes `touch:ns`, `touch:default-items2`)', () => {
  it('is a pre-populated TouchToolStrip instance on a hosted workbook', () => {
    const h = makeWorkbook();
    const strip = h.wb.touchToolStrip;
    expect(strip).toBeInstanceOf(Strip);
    const items = strip!.getItems()!;
    expect(items).toHaveLength(5);
    expect(items.map((i) => i.name())).toEqual([
      'wijspread_toolstrip_paste0',
      'wijspread_toolstrip_cut0',
      'wijspread_toolstrip_copy0',
      'separator0',
      'wijspread_toolstrip_autofill0',
    ]);
    expect(items.map((i) => (i instanceof Item ? i.text() : null))).toEqual(['Paste', 'Cut', 'Copy', null, 'AutoFill']);
  });

  it('has the trial default geometry (itemHeight null, itemWidth 60, imageAreaHeight 32, separatorHeight 45)', () => {
    const h = makeWorkbook();
    const strip = stripOf(h);
    expect(strip.itemHeight()).toBeNull();
    expect(strip.itemWidth()).toBe(60);
    expect(strip.imageAreaHeight()).toBe(32);
    expect(strip.separatorHeight()).toBe(45);
  });

  it('geometry setters return the strip and stick (trial probe `touch:defaults`)', () => {
    const h = makeWorkbook();
    const strip = stripOf(h);
    expect(strip.itemHeight(80)).toBe(strip);
    expect(strip.itemWidth(50)).toBe(strip);
    expect(strip.imageAreaHeight(30)).toBe(strip);
    expect(strip.separatorHeight(10)).toBe(strip);
    expect([strip.itemHeight(), strip.itemWidth(), strip.imageAreaHeight(), strip.separatorHeight()]).toEqual([80, 50, 30, 10]);
  });

  it('add/getItem/getItems/remove/clear behave like the trial (probes `touch4:id`, `touch5:remove-builtin`, `touch6:remove-null`)', () => {
    const h = makeWorkbook();
    const strip = stripOf(h);
    const custom = new Item('Z', 'Zed', 'z.png');
    strip.add(custom);
    expect(strip.getItems()!.length).toBe(6);
    expect(strip.getItem('Z')).toBe(custom);
    expect(strip.getItem('ZZZ')).toBeUndefined();
    const target = strip.getItem('wijspread_toolstrip_cut0');
    const removed = strip.remove('wijspread_toolstrip_cut0');
    expect(removed).toBe(target);
    expect(removed!.name()).toBe('wijspread_toolstrip_cut0');
    expect(strip.getItems()!.map((i) => i.name())).toEqual([
      'wijspread_toolstrip_paste0',
      'wijspread_toolstrip_copy0',
      'separator0',
      'wijspread_toolstrip_autofill0',
      'Z',
    ]);
    expect(strip.remove('nope')).toBeNull();
    strip.clear();
    expect(strip.getItems()).toBeNull();
  });

  it('open shows the trial DOM structure and a button click closes the strip (probes `touch:open-close`, `touch6:strip-click`)', () => {
    const h = makeWorkbook();
    const strip = stripOf(h);
    strip.open(90, 60);
    const wrap = wrapper(h.host);
    expect(wrap.style.display).toBe('block');
    expect(wrap.className).toContain('gc-toolstrip-default');
    expect(wrap.querySelector('table')).not.toBeNull();
    const labels = buttons(strip, h.host).map((b) => b.textContent);
    expect(labels).toEqual(['Paste', 'Cut', 'Copy', 'AutoFill']);
    expect(wrap.querySelectorAll('td.gc-toolstrip-item').length).toBe(5);
    expect(wrap.querySelectorAll('span.gc-toolstrip-image').length).toBe(4);
    expect(wrap.querySelectorAll('span.gc-toolstrip-text').length).toBe(4);
    expect(wrap.querySelector('div.gc-touch-sperate-line')).not.toBeNull();
    const copy = buttons(strip, h.host).find((b) => b.textContent === 'Copy')!;
    h.wb.getActiveSheet().setValue(0, 0, 'A');
    h.wb.getActiveSheet().setSelection(0, 0, 2, 1);
    copy.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(wrap.style.display).toBe('none'); // trial closes on tap (probe `touch6:strip-click`)
    expect(h.wb.getActiveSheet().getValue(1, 0)).toBeNull(); // trial: strip Copy changes no model data
  });

  it('strip buttons run their commands with the trial model effect (probe `touch6:strip-paste`, `touch6:strip-autofill`: no model changes)', () => {
    const h = makeWorkbook();
    const sheet = h.wb.getActiveSheet();
    sheet.setValue(0, 0, 'A');
    sheet.setValue(0, 1, 'B');
    sheet.setSelection(0, 0, 1, 2);
    const strip = stripOf(h);
    const click = (label: string) => {
      strip.open(20, 20);
      const btn = buttons(strip, h.host).find((b) => b.textContent === label)!;
      btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    };
    click('Copy');
    sheet.setSelection(2, 0, 1, 1);
    click('Paste');
    expect(sheet.getValue(2, 0)).toBeNull(); // trial: strip Paste changes no model data
    expect(sheet.getValue(2, 1)).toBeNull();
    sheet.setSelection(4, 0, 1, 1);
    click('Cut');
    expect(sheet.getValue(0, 0)).toBe('A'); // trial: strip Cut deletes nothing
    click('Paste');
    expect(sheet.getValue(4, 0)).toBeNull();
    sheet.setValue(1, 0, 2);
    sheet.setSelection(0, 0, 2, 1);
    click('AutoFill');
    expect(sheet.getValue(2, 0)).toBeNull(); // trial probe `touch6:strip-autofill`
    expect(sheet.getValue(3, 0)).toBeNull();
  });
});

describe('TouchToolStripItem (trial probes `touch:item`, `touch4:seps`)', () => {
  it('reads back the constructor values with the trial font and null foreColor', () => {
    let ran = 0;
    const item = new Item('C', 'Delete', 'tsoutline.png', () => { ran += 1; });
    expect(item.name()).toBe('C');
    expect(item.text()).toBe('Delete');
    expect(item.image()).toBe('tsoutline.png');
    expect(item.font()).toBe('normal 12px Arial');
    expect(item.foreColor()).toBeNull();
    expect(item.name('D')).toBe(item); // setters chain like the trial
    expect(item.name()).toBe('D');
    expect(item.text('T2')).toBe(item);
    expect(item.text()).toBe('T2');
    expect(item.image('x.png')).toBe(item);
    expect(item.font('15px Arial')).toBe(item);
    expect(item.font()).toBe('15px Arial');
    expect(item.foreColor('#ff0000')).toBe(item);
    expect(item.foreColor()).toBe('#ff0000');
    (item as unknown as { _exec: () => unknown })._exec();
    expect(ran).toBe(1);
  });

  it('an argument-less item reports nulls with the default font (trial `itemEmptyCtor`)', () => {
    const item = new Item();
    expect(item.name()).toBeNull();
    expect(item.text()).toBeNull();
    expect(item.image()).toBeNull();
    expect(item.foreColor()).toBeNull();
    expect(item.font()).toBe('normal 12px Arial');
  });
});

describe('TouchToolStripSeparator + naming counters (trial probes `touch4:seps`, `touch5:standalone-sep`)', () => {
  it('names separators `separator<N>` from the workbook counter; unassigned separators peek the next index', () => {
    const h = makeWorkbook(); // the workbook strip consumed index 0 (`separator0`)
    const a = new Separator();
    const b = new Separator();
    expect(a.name()).toBe('separator1');
    expect(b.name()).toBe('separator1'); // peek does not consume
    stripOf(h).add(a);
    expect(a.name()).toBe('separator1');
    stripOf(h).add(b);
    expect(b.name()).toBe('separator2');
    expect(stripOf(h).getItems()!.map((i) => i.name())).toEqual([
      'wijspread_toolstrip_paste0',
      'wijspread_toolstrip_cut0',
      'wijspread_toolstrip_copy0',
      'separator0',
      'wijspread_toolstrip_autofill0',
      'separator1',
      'separator2',
    ]);
  });

  it('a standalone strip carries the next suffix: Paste1/Cut1/Copy1 + separator1 + AutoFill1', () => {
    const h = makeWorkbook();
    const host2 = document.createElement('div');
    document.body.append(host2);
    const strip2 = new Strip(h.wb, host2);
    expect(strip2.getItems()!.map((i) => i.name())).toEqual([
      'wijspread_toolstrip_paste1',
      'wijspread_toolstrip_cut1',
      'wijspread_toolstrip_copy1',
      'separator1',
      'wijspread_toolstrip_autofill1',
    ]);
    expect(strip2.itemHeight()).toBeNull();
    expect(strip2.itemWidth()).toBe(60);
    expect(strip2.imageAreaHeight()).toBe(32);
    expect(strip2.separatorHeight()).toBe(45);
    const added = new Separator();
    expect(added.name()).toBe('separator2'); // peek after the standalone strip consumed index 1
    strip2.add(added);
    expect(added.name()).toBe('separator2');
  });

  it('a separator canExecute gate hides it at render without consuming DOM order', () => {
    const h = makeWorkbook();
    const strip = stripOf(h);
    strip.clear();
    const hidden = new Separator(() => false);
    strip.add(hidden);
    strip.open(0, 0);
    const line = wrapper(h.host).querySelector<HTMLElement>('div.gc-touch-sperate-line')!;
    expect(line.style.display).toBe('none');
  });
});

describe('canExecute gating + render timing (trial probes `touch4:canexec`, `touch5:gate-count`)', () => {
  it('calls each gate exactly once per open, hides gated-off buttons but keeps them clickable', () => {
    const h = makeWorkbook();
    const strip = stripOf(h);
    strip.clear();
    let gates = 0;
    let gatesBlocked = 0;
    let ran = 0;
    strip.add(new Item('RU', 'Run', 'r.png', () => { ran += 1; }, () => { gates += 1; return true; }));
    strip.add(new Item('BL', 'Blocked', 'b.png', () => { ran += 100; }, () => { gatesBlocked += 1; return false; }));
    expect(gates).toBe(0); // add() on a closed strip does not paint (trial `cAfterAdd` 0)
    strip.open(20, 20);
    expect(gates).toBe(1);
    expect(gatesBlocked).toBe(1);
    const btns = buttons(strip, h.host);
    expect(btns.map((b) => b.textContent)).toEqual(['Run', 'Blocked']);
    const blocked = btns[1];
    expect(blocked.style.display).toBe('none'); // hidden but present (trial `touch4:canexec`)
    blocked.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(ran).toBe(100); // trial executes a hidden item's command when clicked
    expect(gatesBlocked).toBe(1); // click does not re-evaluate the gate
    strip.close();
    strip.open(20, 20);
    expect(gates).toBe(2); // each open re-paints (trial `cAfterSecondOpen` 2)
  });

  it('setters while open do not repaint (trial probe `touch5:gate-count`: gate stays at 1)', () => {
    const h = makeWorkbook();
    const strip = stripOf(h);
    strip.clear();
    let gates = 0;
    strip.add(new Item('GA', 'A', 'a.png', undefined, () => { gates += 1; return true; }));
    strip.open(10, 10);
    strip.itemWidth(70);
    strip.itemHeight(80);
    strip.separatorHeight(12);
    expect(gates).toBe(1);
  });

  it('add while open re-paints and grows the DOM (trial probe `touch5:pos`)', () => {
    const h = makeWorkbook();
    const strip = stripOf(h);
    strip.clear();
    strip.add(new Item('O1', 'One', 'o.png'));
    strip.open(0, 0);
    expect(buttons(strip, h.host).map((b) => b.textContent)).toEqual(['One']);
    strip.add(new Item('O2', 'Two', 'o2.png'));
    expect(buttons(strip, h.host).map((b) => b.textContent)).toEqual(['One', 'Two']);
  });
});

describe('open/close positioning (trial probes `touch4:geom`, `touch5:pos`, `touch6:wb-strip-host`)', () => {
  it('docks the wrapper at the document left edge, top = host top + y, hidden by close', () => {
    const h = makeWorkbook();
    const strip = stripOf(h);
    // jsdom reports zero rects for the host: the trial formula (host rect + y,
    // x docked to document left 0) reduces to top = y, left = 0 here.
    strip.open(120, 60);
    const wrap = wrapper(h.host);
    expect(wrap.style.display).toBe('block');
    expect(wrap.style.top).toBe('60px');
    expect(wrap.style.left).toBe('0px');
    strip.close();
    expect(wrap.style.display).toBe('none');
    strip.open(30, 40);
    expect(wrap.style.top).toBe('40px');
    expect(wrap.style.display).toBe('block');
  });
});

describe('Workbook touch options (trial probe `touch4:opts`, `touch6:opts2`)', () => {
  it('useTouchLayout defaults to false and is settable', () => {
    const h = makeWorkbook();
    expect(h.wb.options.useTouchLayout).toBe(false);
    h.wb.options.useTouchLayout = true;
    expect(h.wb.options.useTouchLayout).toBe(true);
  });

  it('carries the trial paste option defaults', () => {
    const h = makeWorkbook();
    expect(h.wb.options.pasteIgnoreSingleBlankCharCell).toBe(false);
    expect(h.wb.options.pasteSkipInvisibleRange).toBe(false);
  });
});

describe('touch long-press opens the strip like the trial (`touchreal`)', () => {
  /**
   * The long-press scheduling lives in Interaction.startTouchPress; the pointer
   * plumbing (overlay hit-testing on the canvas) needs a layouted DOM, which
   * jsdom does not provide. The real-pointer flow is verified against the trial
   * in the probe harness (`touchreal`: identical events/args on both sides at
   * 900 ms hold, none at 450/600 ms, cancelled by movement).
   */
  function press(h: Harness) {
    const interaction = (h.wb._renderer() as unknown as { interaction: object }) as { interaction: object };
    const it = interaction.interaction as unknown as {
      startTouchPress(x: number, y: number): void;
      cancelTouchPress(): void;
    };
    return it;
  }
  it('fires TouchToolStripOpening after the 700 ms hold and opens the strip (handled=false)', () => {
    vi.useFakeTimers();
    try {
      const h = makeWorkbook();
      const events: { x?: number; y?: number; handled?: boolean }[] = [];
      h.wb.bind(GC.Spread.Sheets.Events.TouchToolStripOpening, (_s, e) => events.push(e as never));
      const target = (h.wb._renderer() as unknown as { overlay: HTMLElement }).overlay;
      void target;
      const it = press(h);
      it.startTouchPress(90, 60); // trial CDP touch tap at canvas-relative (90, 60)
      expect(events).toHaveLength(0); // no event before the threshold (trial: none at 450/600 ms)
      vi.advanceTimersByTime(700);
      expect(events).toHaveLength(1);
      expect(events[0].x).toBe(90);
      expect(events[0].y).toBe(60);
      expect(events[0].handled).toBe(false);
      const wrap = wrapper(h.host);
      expect(wrap.style.display).toBe('block'); // documented contract: handled=false pops up
      it.cancelTouchPress();
    } finally {
      vi.useRealTimers();
    }
  });

  it('a handled event prevents the popup', () => {
    vi.useFakeTimers();
    try {
      const h = makeWorkbook();
      h.wb.bind(GC.Spread.Sheets.Events.TouchToolStripOpening, (_s, e) => { (e as Record<string, unknown>).handled = true; });
      press(h).startTouchPress(40, 30);
      vi.advanceTimersByTime(700);
      expect(wrapper(h.host).style.display).toBe('none');
    } finally {
      vi.useRealTimers();
    }
  });

  it('release before the threshold cancels the popup (trial: none at 450/600 ms hold)', () => {
    vi.useFakeTimers();
    try {
      const h = makeWorkbook();
      const events: unknown[] = [];
      h.wb.bind(GC.Spread.Sheets.Events.TouchToolStripOpening, (_s, e) => events.push(e));
      const it = press(h);
      it.startTouchPress(90, 60);
      vi.advanceTimersByTime(450);
      it.cancelTouchPress(); // pointerUp
      vi.advanceTimersByTime(700);
      expect(events).toHaveLength(0);
      expect(wrapper(h.host).style.display).toBe('none');
    } finally {
      vi.useRealTimers();
    }
  });

  it('moving the finger cancels the long press (pointerMove > 4 px path)', () => {
    vi.useFakeTimers();
    try {
      const h = makeWorkbook();
      const events: unknown[] = [];
      h.wb.bind(GC.Spread.Sheets.Events.TouchToolStripOpening, (_s, e) => events.push(e));
      const it = press(h);
      it.startTouchPress(60, 50);
      vi.advanceTimersByTime(120);
      it.cancelTouchPress(); // the pointerMove branch cancels once the finger moved past 4 px
      vi.advanceTimersByTime(700);
      expect(events).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
