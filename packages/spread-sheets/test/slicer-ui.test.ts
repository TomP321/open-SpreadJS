// @vitest-environment jsdom
/* Unit tests for the slicer view layer (TASK 29 part 1): canvas panel creation,
 * hit-testing, click-to-filter, ctrl multi-select, clear button, and the
 * DOM-hosted ItemSlicer / DOMTableSlicer flavours. */
import { afterEach, describe, expect, it } from 'vitest';
import GC from '../src/index.js';
import { hitTest } from '../src/features/slicers/view.js';
import { slicerLayout } from '../src/features/slicers/paint.js';
import { DOMTableSlicer, ItemSlicer, TableSlicerData } from '../src/features/slicers/index.js';

const { Workbook } = GC.Spread.Sheets;
const themes = GC.Spread.Sheets.Tables.TableThemes as unknown as Record<string, string>;
const SOURCE = [['Region', 'Amount'], ['East', 10], ['West', 20], ['East', 30], ['South', 40]];

// jsdom has no 2D canvas backend: stub a recording-free context (same trick as print.test.ts).
function stubCanvas2d(): void {
  (globalThis as Record<string, unknown>).CanvasRenderingContext2D = class {};
  HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement) {
    return new Proxy({}, {
      get: (_t, key: string) => {
        if (key === 'canvas') return this;
        if (key === 'measureText') return () => ({ width: 8 });
        if (key === 'createLinearGradient') return () => ({ addColorStop: () => undefined });
        if (key === 'createPattern') return () => ({});
        if (key === 'getTransform') return () => ({ a: 1, d: 1 });
        return () => undefined;
      },
      set: () => true,
    }) as unknown as CanvasRenderingContext2D;
  } as unknown as HTMLCanvasElement['getContext'];
  HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,PROBE';
}
stubCanvas2d();


function makeHarness() {
  const host = document.createElement('div');
  host.style.width = '800px';
  host.style.height = '600px';
  document.body.append(host);
  const wb = new Workbook(host);
  const sheet = wb.getActiveSheet();
  sheet.setArray(0, 0, SOURCE.map(row => row.slice()));
  sheet.tables.add('Sales', 0, 0, 5, 2, themes.light1);
  const slicer = sheet.slicers.add('slicer1', 'Sales', 'Region');
  const view = sheet._view()!;
  view.paint();
  const root = host.querySelector<HTMLElement>('.opensheets-slicer')!;
  const click = (x: number, y: number, ctrl = false): void => {
    root.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: x, clientY: y, ctrlKey: ctrl }));
    view.paint(); // flush the schedule() the click triggered, like the next animation frame would
  };
  return { wb, sheet, slicer, view, root, click };
}

afterEach(() => { document.body.innerHTML = ''; });

describe('slicer canvas panel', () => {
  it('creates the slicer layer with one positioned panel and canvas per slicer', () => {
    const { wb, root, view } = makeHarness();
    const layer = view.root.querySelector('.opensheets-slicer-layer');
    expect(layer).toBeTruthy();
    expect(layer!.querySelectorAll('.opensheets-slicer').length).toBe(1);
    expect(root.querySelector('canvas')).toBeTruthy();
    expect(root.style.width).toBe('186px');
    expect(root.style.height).toBe('258px');
    expect(root.style.display).toBe('');
    wb.getActiveSheet().slicers.get('slicer1')!.isVisible(false);
    view.paint();
    expect(root.style.display).toBe('none');
    wb.destroy();
  });

  it('toImageSrc paints through the shared code path and returns a data URL', async () => {
    const { wb, slicer } = makeHarness();
    expect(slicer.toImageSrc()).toBe('data:image/png;base64,PROBE');
    await expect(slicer.toImageSrcAsync()).resolves.toBe('data:image/png;base64,PROBE');
    wb.destroy();
  });

  it('selecting a slicer marks the panel and deselects the others', () => {
    const { wb, sheet, slicer, root, click } = makeHarness();
    const other = sheet.slicers.add('slicer2', 'Sales', 'Amount');
    other.isSelected(true);
    click(5, 5); // press on the first slicer's header
    expect(slicer.isSelected()).toBe(true);
    expect(other.isSelected()).toBe(false);
    expect(root.classList.contains('selected')).toBe(true);
    wb.destroy();
  });
});

describe('slicer hit-testing and clicking', () => {
  it('layout maps item buttons into columns and rows (trial geometry)', () => {
    const layout = slicerLayout(186, 258, 21, 1, 3);
    expect(layout.rows).toBe(8);
    expect(layout.columns).toBe(1);
    expect(layout.rowPitch).toBe(28); // itemHeight + 7 (trial: rows sit on 28px boundaries)
    const first = layout.button(0);
    expect(first).toMatchObject({ x: 9, y: 29, width: 186 - 9 - 15, height: 25 });
    const second = layout.button(1);
    expect(second).toMatchObject({ y: 56, height: 26 }); // first gap 27, then 28 each (trial scan)
    expect(layout.button(2).y).toBe(84);
    expect(layout.button(3).y).toBe(112);
    const wide = slicerLayout(300, 258, 21, 2, 3);
    expect(wide.columns).toBe(2);
    expect(wide.button(1).x).toBeGreaterThan(wide.button(0).x); // row-major fill: index 1 is column 2
    expect(wide.button(2).x).toBe(wide.button(0).x);
  });

  it('hitTest separates header icons, item buttons and the body', () => {
    const { wb, slicer } = makeHarness();
    const layout = slicerLayout(186, 258, 21, 1, 3);
    expect(hitTest(slicer, 20, 10).kind).toBe('header');
    expect(hitTest(slicer, 186 - 21, 10).kind).toBe('clear'); // funnel icon centre (trial: width-21)
    expect(hitTest(slicer, 186 - 46, 10).kind).toBe('multi'); // multi-select icon centre (trial: width-46)
    const box = layout.button(0);
    expect(hitTest(slicer, box.x + 2, box.y + 2)).toEqual({ kind: 'item', index: 0 });
    expect(hitTest(slicer, box.x + 2, box.y + 28 * 4).kind).toBe('body');
    wb.destroy();
  });

  it('clicking an item filters the table; clicking a second one switches to it', () => {
    const { wb, sheet, slicer, click } = makeHarness();
    const layout = slicerLayout(186, 258, 21, 1, 3);
    const box = layout.button(0);
    click(box.x + 3, box.y + 3); // 'East' (ascending order)
    expect([0, 1, 2, 3, 4].map(r => sheet.getRowVisible(r))).toEqual([true, true, false, true, false]);
    expect(slicer.getItems().map(item => `${item.text}:${item.selected ? 1 : 0}`)).toEqual(['East:1', 'South:0', 'West:0']);
    const box1 = layout.button(1);
    click(box1.x + 3, box1.y + 3); // 'South' replaces the selection
    expect([0, 1, 2, 3, 4].map(r => sheet.getRowVisible(r))).toEqual([true, false, false, false, true]);
    // Ctrl+click adds the third item (multi-select via modifier).
    const box2 = layout.button(2);
    click(box2.x + 3, box2.y + 3, true); // + 'West'
    expect([0, 1, 2, 3, 4].map(r => sheet.getRowVisible(r))).toEqual([true, false, true, false, true]);
    // Ctrl+click on a selected item removes it again.
    click(box2.x + 3, box2.y + 3, true);
    expect(slicer.getItems().filter(item => item.selected).map(item => item.text)).toEqual(['South']);
    wb.destroy();
  });

  it('multiSelect(true) toggles items without the modifier', () => {
    const { wb, sheet, slicer, click } = makeHarness();
    slicer.multiSelect(true);
    const layout = slicerLayout(186, 258, 21, 1, 3);
    click(layout.button(0).x + 3, layout.button(0).y + 3); // deselect East (others stay)
    expect(slicer.getItems().map(item => `${item.text}:${item.selected ? 1 : 0}`)).toEqual(['East:0', 'South:1', 'West:1']);
    expect([0, 1, 2, 3, 4].map(r => sheet.getRowVisible(r))).toEqual([true, false, true, false, true]);
    wb.destroy();
  });

  it('the funnel clears the filter; the check-mark icon toggles multiSelect (trial)', () => {
    const { wb, slicer, click } = makeHarness();
    const layout = slicerLayout(186, 258, 21, 1, 3);
    click(layout.button(0).x + 3, layout.button(0).y + 3);
    expect(slicer.getItems().some(item => !item.selected)).toBe(true);
    click(186 - 21, 10); // funnel → clear the filter
    expect(slicer.getItems().every(item => item.selected)).toBe(true);
    expect(slicer.multiSelect()).toBe(false);
    click(186 - 46, 10); // check-mark icon → multiSelect on (trial behaviour)
    expect(slicer.multiSelect()).toBe(true);
    click(186 - 46, 10); // and off again
    expect(slicer.multiSelect()).toBe(false);
    wb.destroy();
  });

  it('scrollbar buttons scroll the item list within bounds; the wheel falls through', () => {
    const { wb, sheet } = makeHarness();
    const rows: unknown[][] = [['Region', 'Amount']];
    for (let i = 0; i < 40; i++) rows.push([`R${String(i).padStart(2, '0')}`, i]);
    sheet.setArray(60, 0, rows);
    sheet.tables.add('Big', 60, 0, 41, 2, themes.light1);
    const slicer = sheet.slicers.add('big1', 'Big', 'Region');
    const view = sheet._view()!;
    view.paint();
    const panel = view.root.querySelectorAll('.opensheets-slicer')[1] as HTMLElement;
    expect(panel).toBeTruthy();
    expect(slicer.viewState.first).toBe(0);
    const layout = slicerLayout(186, 258, 21, 1, 40);
    const bar = layout.scrollbar;
    expect(bar).toBeTruthy();
    // Trial: the mouse wheel does NOT scroll the item list (it reaches the sheet).
    panel.dispatchEvent(new WheelEvent('wheel', { deltaY: 100, bubbles: true, cancelable: true }));
    expect(slicer.viewState.first).toBe(0);
    const press = (x: number, y: number): void => {
      panel.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: x, clientY: y }));
      view.paint();
    };
    // Down arrow: one row per click, clamped at the last page.
    for (let i = 0; i < 200; i++) press(bar!.x + bar!.width / 2, bar!.y + bar!.height - bar!.buttonHeight / 2);
    expect(slicer.viewState.first).toBe(40 - layout.capacity);
    // Up arrow back to the top.
    for (let i = 0; i < 200; i++) press(bar!.x + bar!.width / 2, bar!.y + bar!.buttonHeight / 2);
    expect(slicer.viewState.first).toBe(0);
    // Track zones per the trial scan: the arrow buttons page the list.
    expect(hitTest(slicer, bar!.x + 2, bar!.y + bar!.buttonHeight / 2).kind).toBe('sb-up');
    expect(hitTest(slicer, bar!.x + 2, bar!.y + bar!.height - bar!.buttonHeight / 2).kind).toBe('sb-down');
    expect(hitTest(slicer, bar!.x + 2, bar!.y + bar!.buttonHeight).kind).toBe('sb-thumb'); // first = 0 → thumb at top
    // Dragging the thumb scrolls proportionally (trial: pointer y maps to offset).
    const thumbY = bar!.y + bar!.buttonHeight + 2;
    panel.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: bar!.x + bar!.width / 2, clientY: thumbY }));
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: bar!.x + bar!.width / 2, clientY: thumbY + 120 }));
    const dragged = slicer.viewState.first;
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: bar!.x + bar!.width / 2, clientY: thumbY }));
    window.dispatchEvent(new MouseEvent('pointerup', {}));
    expect(slicer.viewState.first).toBeLessThan(dragged);
    wb.destroy();
  });
});

describe('slicer painting', () => {
  // Recording 2D context (jsdom has no canvas backend); records the calls the
  // slicer painter uses so tests can assert exact colours and geometry.
  function makeRecorder(): {
    ctx: CanvasRenderingContext2D;
    rects: { color: string; x: number; y: number; w: number; h: number }[];
    texts: { text: string; x: number; y: number }[];
    clips: { x: number; y: number; w: number; h: number }[];
  } {
    const rects: { color: string; x: number; y: number; w: number; h: number }[] = [];
    const texts: { text: string; x: number; y: number }[] = [];
    const clips: { x: number; y: number; w: number; h: number }[] = [];
    const recorder = {
      canvas: document.createElement('canvas'),
      fillStyle: '', strokeStyle: '', font: '', textBaseline: '', textAlign: '', lineWidth: 1,
      save: () => undefined, restore: () => undefined, beginPath: () => undefined, closePath: () => undefined,
      clip: () => undefined,
      moveTo: () => undefined, lineTo: () => undefined, arcTo: () => undefined,
      rect: (x: number, y: number, w: number, h: number) => clips.push({ x, y, w, h }),
      strokeRect: () => undefined, clearRect: () => undefined, setTransform: () => undefined,
      fillRect: (x: number, y: number, w: number, h: number) =>
        rects.push({ color: String(recorder.fillStyle), x, y, w, h }),
      fill: () => undefined, stroke: () => undefined,
      fillText: (text: string, x: number, y: number) => texts.push({ text, x, y }),
      measureText: (text: string) => ({ width: text.length * 7 }),
      createLinearGradient: () => ({ addColorStop: () => undefined }),
    };
    return { ctx: recorder as unknown as CanvasRenderingContext2D, rects, texts, clips };
  }

  it('two-column boxes use the trial floor-boundary grid (79/80 widths)', () => {
    // Trial pixel scan (columnCount 2): box0 x 9..87 (79px), gap 3, box1 x 91..170.
    const layout = slicerLayout(186, 258, 21, 2, 4);
    expect(layout.button(0)).toMatchObject({ x: 9, width: 79 });
    expect(layout.button(1)).toMatchObject({ x: 91, width: 80 });
    expect(layout.button(2).x).toBe(9);
  });

  it('item text is ellipsised against the trial right reserve', async () => {
    const { wb, slicer } = makeHarness();
    const { paintSlicer } = await import('../src/features/slicers/paint.js');
    const { ctx, texts } = makeRecorder();
    paintSlicer(ctx, slicer.resolvedStyle(), {
      items: [{ text: 'Washington', value: 'Washington', selected: true, noData: false }],
      hoverItem: -1, hoverIcon: 'none', first: 0, filtered: false, multiSelect: false, zoom: 1,
      width: 79 + 9 + 15, height: 258, itemHeight: 21, columnCount: 1, showHeader: true, caption: 'R',
    });
    // 79-px-wide text box, 5 left / 8 right reserve → maxWidth 66: 'Washington'
    // does not fit, the loop keeps the longest prefix with '...' (mock: 7px/char).
    expect(texts.find(t => t.text.startsWith('Wash'))?.text).toBe('Washin...');
    wb.destroy();
  });

  it('text centre follows the trial formula per row', async () => {
    const { wb, slicer } = makeHarness();
    const { paintSlicer } = await import('../src/features/slicers/paint.js');
    const { ctx, texts } = makeRecorder();
    paintSlicer(ctx, slicer.resolvedStyle(), {
      items: [
        { text: 'A', value: 'A', selected: true, noData: false },
        { text: 'B', value: 'B', selected: true, noData: false },
      ],
      hoverItem: -1, hoverIcon: 'none', first: 0, filtered: false, multiSelect: false, zoom: 1,
      width: 186, height: 258, itemHeight: 21, columnCount: 1, showHeader: true, caption: 'R',
    });
    // Trial scans (itemHeight 21/32): row 0 text y = boxTop + itemHeight/2 + 1.5,
    // row ≥ 1 = boxTop + itemHeight/2 + 2.5 (boxes sit on rowTop 29 / 56).
    expect(texts[1].y).toBe(41);
    expect(texts[2].y).toBe(69);
    wb.destroy();
  });

  it('gradient items tint the top and bottom ring rows with the gradient ends', async () => {
    // Trial hover scan: amber item top inner ring #c9be7f (border mixed with the
    // FIRST stop) and bottom inner ring #cac7c5 (border mixed with the LAST stop).
    const { wb, slicer } = makeHarness();
    const { paintSlicer } = await import('../src/features/slicers/paint.js');
    const { mixHex } = await import('../src/features/slicers/paint.js');
    const style = slicer.resolvedStyle();
    style.selectedItemWithDataStyle({
      backColor: { degree: 90, stops: [{ position: 0, color: '#f8e26b' }, { position: 1, color: '#fcf6eb' }] },
      foreColor: 'black',
      borderLeft: { borderWidth: 1, borderStyle: 'thin', borderColor: '#999999' },
    } as never);
    const { ctx, rects } = makeRecorder();
    paintSlicer(ctx, style, {
      items: [
        { text: 'A', value: 'A', selected: true, noData: false },
        { text: 'B', value: 'B', selected: true, noData: false },
      ],
      hoverItem: -1, hoverIcon: 'none', first: 0, filtered: false, multiSelect: false, zoom: 1,
      width: 186, height: 258, itemHeight: 21, columnCount: 1, showHeader: true, caption: 'R',
    });
    const row1 = rects.find(r => r.color === mixHex('#999999', '#f8e26b', 0.5));
    expect(row1).toBeTruthy();
    const bottom = rects.find(r => r.color === mixHex('#999999', '#fcf6eb', 0.5));
    expect(bottom).toBeTruthy();
    // Row 0 keeps the plain border colour for its bottom ring (no inner ring).
    expect(rects.some(r => r.y === 53 && r.color === '#999999')).toBe(false);
    wb.destroy();
  });

  it('the header separator follows headerStyle.borderBottom mixed 50% with white', async () => {
    const { wb, slicer } = makeHarness();
    const { paintSlicer, mixHex } = await import('../src/features/slicers/paint.js');
    const { resolveSlicerColor } = await import('../src/features/slicers/styles.js');
    const { ctx, rects } = makeRecorder();
    paintSlicer(ctx, slicer.resolvedStyle(), {
      items: [], hoverItem: -1, hoverIcon: 'none', first: 0, filtered: false, multiSelect: false, zoom: 1,
      width: 186, height: 258, itemHeight: 21, columnCount: 1, showHeader: true, caption: 'R',
    });
    // Light1: borderBottom "Accent 1" → #adcdea in the browser 2013 palette
    // (mix 50%), token-driven so other styles follow their own accent.
    const { SLICER_HEADER_HEIGHT } = await import('../src/features/slicers/types.js');
    const accent1 = String(resolveSlicerColor('Accent 1'));
    const line = rects.find(r => r.y === SLICER_HEADER_HEIGHT - 1 && r.h === 2 && r.x === 9);
    expect(line?.color).toBe(mixHex(accent1, '#ffffff', 0.5));
    wb.destroy();
  });

  it('items are clipped to the list area ending at height-12 (trial)', async () => {
    const { wb, slicer } = makeHarness();
    const { paintSlicer } = await import('../src/features/slicers/paint.js');
    const { ctx, clips } = makeRecorder();
    paintSlicer(ctx, slicer.resolvedStyle(), {
      items: [{ text: 'A', value: 'A', selected: true, noData: false }],
      hoverItem: -1, hoverIcon: 'none', first: 0, filtered: false, multiSelect: false, zoom: 1,
      width: 186, height: 258, itemHeight: 21, columnCount: 1, showHeader: true, caption: 'R',
    });
    expect(clips).toContainEqual({ x: 0, y: 0, w: 186, h: 247 });
    wb.destroy();
  });

  it('the scrollbar thumb height rounds up (trial: 78px for 18 items / 8 rows)', () => {
    const layout = slicerLayout(186, 258, 21, 1, 18);
    expect(layout.capacity).toBe(8);
    expect(layout.scrollbar?.thumbHeight).toBe(78);
  });

  it('paints item buttons with the resolved built-in style colours (slot keys must match)', async () => {
    const { wb, slicer } = makeHarness();
    const { paintSlicer } = await import('../src/features/slicers/paint.js');
    const fills: string[] = [];
    const strokes: string[] = [];
    const recorder = {
      canvas: document.createElement('canvas'),
      fillStyle: '', strokeStyle: '', font: '', textBaseline: '', textAlign: '', lineWidth: 1,
      save: () => undefined, restore: () => undefined, beginPath: () => undefined, closePath: () => undefined,
      clip: () => undefined,
      moveTo: () => undefined, lineTo: () => undefined, arcTo: () => undefined, rect: () => undefined,
      strokeRect: () => strokes.push(String(recorder.strokeStyle)), clearRect: () => undefined, setTransform: () => undefined,
      fillRect: () => undefined, fill: () => fills.push(String(recorder.fillStyle)), stroke: () => strokes.push(String(recorder.strokeStyle)),
      fillText: () => undefined, measureText: () => ({ width: 8 }),
      createLinearGradient: () => ({ addColorStop: () => undefined }),
    } as unknown as CanvasRenderingContext2D;
    paintSlicer(recorder, slicer.resolvedStyle(), {
      items: [
        { text: 'East', value: 'East', selected: true, noData: false },
        { text: 'West', value: 'West', selected: false, noData: false },
      ],
      hoverItem: -1, hoverIcon: 'none', first: 0, filtered: true, multiSelect: false, zoom: 1, width: 186, height: 258,
      itemHeight: 21, columnCount: 1, showHeader: true, caption: 'Region',
    });
    // selected item → "Accent 1 60" resolves to the palette blue; unselected → white.
    // Light1: selected item = the Accent 1 60 tint, unselected = white; row 0 borders #999,
    // row ≥1 rings = the slot colour mixed 50% with the fill (#CCCCCC → #e6e6e6, trial scan).
    expect(fills).toContain('#b8cee4');
    expect(fills).toContain('white');
    expect(strokes).toContain('#999999');
    expect(strokes).toContain('#e6e6e6');
    // Unselected outer ring = the wholeSlicerStyle border (Accent 1).
    const ring = strokes[strokes.length - 1];
    expect(['#5B9BD5', '#5b9bd5', '#4F81BD']).toContain(ring.toUpperCase());
    // Trial: a SELECTED slicer replaces the blue ring with a gray #808080 one.
    paintSlicer(recorder, slicer.resolvedStyle(), {
      items: [{ text: 'East', value: 'East', selected: true, noData: false }],
      hoverItem: -1, hoverIcon: 'none', first: 0, filtered: false, multiSelect: false, selected: true,
      zoom: 1, width: 186, height: 258, itemHeight: 21, columnCount: 1, showHeader: true, caption: 'Region',
    });
    expect(strokes).toContain('#808080');
    wb.destroy();
  });
});

describe('ItemSlicer (DOM hosted)', () => {
  function makeItemSlicer() {
    const wb = new Workbook();
    const sheet = wb.getActiveSheet();
    sheet.setArray(0, 0, SOURCE.map(row => row.slice()));
    const table = sheet.tables.add('Sales', 0, 0, 5, 2, themes.light1);
    const data = new TableSlicerData(table);
    const item = new ItemSlicer('item1', data, 'Region');
    const host = document.createElement('div');
    document.body.append(host);
    host.append(item.getDOMElement());
    return { wb, sheet, item, host };
  }

  it('exposes the declared property surface with defaults', () => {
    const { item } = makeItemSlicer();
    expect(item.name()).toBe('item1');
    expect(item.captionName()).toBe('Region');
    expect(item.columnCount()).toBe(1);
    expect(item.itemHeight()).toBe(21);
    expect(item.width()).toBe(180);
    expect(item.height()).toBe(210);
    expect(item.showHeader()).toBe(true);
    expect(item.sortState()).toBe(GC.Spread.Sheets.SortState.ascending);
    expect(item.showNoDataItems()).toBe(true);
    expect(item.showNoDataItemsInLast()).toBe(true);
    expect(item.visuallyNoDataItems()).toBe(true);
    expect(item.getStyleName()).toBe('SlicerStyleLight1');
    item.columnCount(2);
    expect(item.columnCount()).toBe(2);
    item.showHeader(false);
    expect(item.showHeader()).toBe(false);
    item.sortState(2);
    expect(item.sortState()).toBe(2);
    item.style('SlicerStyleDark2');
    expect(item.getStyleName()).toBe('SlicerStyleDark2');
    expect(item.isLocked()).toBe(false);
    expect(item.disableResizingAndMoving()).toBe(false);
    expect(item.zoomFactor()).toBe(1);
  });

  it('renders header and item buttons into its DOM element and reacts to data events', () => {
    const { item, host } = makeItemSlicer();
    const element = item.getDOMElement();
    expect(element.classList.contains('gc-slicer-container')).toBe(true);
    expect(element.querySelectorAll('.gc-slicer-header').length).toBe(1);
    const texts = [...element.querySelectorAll('.gc-slicer-item')].map(node => node.textContent);
    expect(texts).toEqual(['East', 'South', 'West']);
    expect(item.isRendered).toBe(true);
    item.showHeader(false);
    expect(element.querySelectorAll('.gc-slicer-header').length).toBe(0);
    // Trial: only the array form of onDataChanged writes into the data model.
    item.slicerData?.onDataChanged([{ columnName: 'Region', row: 1, rowIndex: 1, data: { value: 'North', text: 'North' } }]);
    expect([...element.querySelectorAll('.gc-slicer-item')].map(node => node.textContent)).toContain('North');
    item.destroy();
    expect(host.children.length).toBe(0);
  });

  it('handleClick toggles items through the shared data model', () => {
    const { sheet, item } = makeItemSlicer();
    item.handleClick(0); // toggles 'East' off: West + South remain
    expect([0, 1, 2, 3, 4].map(r => sheet.getRowVisible(r))).toEqual([true, false, true, false, true]);
    item.handleClick(0); // back to all items → the filter clears like the trial
    expect([0, 1, 2, 3, 4].map(r => sheet.getRowVisible(r))).toEqual([true, true, true, true, true]);
  });
});

describe('DOMTableSlicer', () => {
  it('is a floating object bound to a table column with the declared surface', () => {
    const wb = new Workbook();
    const sheet = wb.getActiveSheet();
    sheet.setArray(0, 0, SOURCE.map(row => row.slice()));
    const table = sheet.tables.add('Sales', 0, 0, 5, 2, themes.light1);
    const slicer = new DOMTableSlicer('domSlicer', table, 'Region');
    expect(slicer.name()).toBe('domSlicer');
    expect(slicer.getTable()).toBe(table);
    expect(slicer.columnName).toBe('Region');
    expect(slicer.captionName()).toBe('Region');
    expect(slicer.columnCount()).toBe(1);
    expect(slicer.itemHeight()).toBe(21);
    expect(slicer.showHeader()).toBe(true);
    expect(slicer.showNoDataItems()).toBe(true);
    expect(slicer.showNoDataItemsInLast()).toBe(true);
    expect(slicer.visuallyNoDataItems()).toBe(true);
    expect(slicer.disableResizingAndMoving()).toBe(false);
    slicer.captionName('Areas');
    expect(slicer.captionName()).toBe('Areas');
    slicer.sortState(2);
    expect(slicer.sortState()).toBe(2);
    slicer.style('SlicerStyleLight5');
    expect(slicer.style()).toBe('SlicerStyleLight5');
    slicer.name('renamed');
    expect(slicer.name()).toBe('renamed');
    expect(slicer.width()).toBe(186);
    expect(typeof slicer.toImageSrc()).toBe('string');
    return expect(slicer.toImageSrcAsync()).resolves.toBeTypeOf('string');
  });
});
