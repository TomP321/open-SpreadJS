// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import GC from '../src/index.js';
import type { CommentUi } from '../src/comment-ui.js';

const { Workbook } = GC.Spread.Sheets;

// jsdom ships no 2D canvas backend; the Workbook only builds its renderer (and with it
// the Interaction/CommentUi under test) when CanvasRenderingContext2D exists, so stub a
// recording-free no-op context that satisfies the few measured calls the paint makes.
function stubCanvas2d(): void {
  (globalThis as Record<string, unknown>).CanvasRenderingContext2D = class {};
  const makeContext = (canvas: HTMLCanvasElement): CanvasRenderingContext2D => {
    const target: Record<string, unknown> = { canvas };
    return new Proxy(target, {
      get: (t, prop) => {
        if (typeof prop === 'symbol') return undefined;
        if (prop in t) return t[prop as string];
        if (prop === 'measureText') {
          return (text: unknown) => ({ width: String(text).length * 7, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2, fontBoundingBoxAscent: 14, fontBoundingBoxDescent: 3 });
        }
        if (prop === 'createLinearGradient' || prop === 'createRadialGradient' || prop === 'createPattern') {
          return () => ({ addColorStop: () => undefined });
        }
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

interface Harness {
  wb: InstanceType<typeof Workbook>;
  sheet: ReturnType<InstanceType<typeof Workbook>['getActiveSheet']>;
  ui: CommentUi;
  host: HTMLElement;
  card: () => HTMLElement;
  input: () => HTMLElement;
  post: () => HTMLButtonElement;
  /** Append text the way typing does, firing one input event per character. */
  type: (text: string) => void;
}

function openCard(row = 1, col = 1): Harness {
  const host = document.createElement('div');
  host.style.width = '640px';
  host.style.height = '480px';
  document.body.append(host);
  const wb = new Workbook(host);
  const sheet = wb.getActiveSheet();
  sheet.setActiveCell(row, col);
  const ui = sheet._view()!.interaction.commentUi;
  ui.openThread();
  const card = (): HTMLElement => host.querySelector<HTMLElement>('.os-thread-card')!;
  const input = (): HTMLElement => card().querySelector<HTMLElement>('[contenteditable]')!;
  const post = (): HTMLButtonElement => card().querySelector<HTMLButtonElement>('.os-thread-post')!;
  const type = (text: string): void => {
    for (const char of text) {
      input().appendChild(document.createTextNode(char));
      input().dispatchEvent(new Event('input', { bubbles: true }));
    }
  };
  return { wb, sheet, ui, host, card, input, post, type };
}

afterEach(() => { document.body.innerHTML = ''; document.querySelectorAll('style[id]').forEach((s) => s.remove()); });

describe('threaded comment card editor', () => {
  it('shows the placeholder as a CSS-only visual, not as editor text', () => {
    const h = openCard();
    expect(h.input().textContent).toBe('');
    expect(h.input().children.length).toBe(0); // no placeholder span inside the input
    expect(h.input().dataset.placeholder).toBe('@mention or comment');
    expect(h.input().hasAttribute('data-os-empty')).toBe(true);
    const css = document.getElementById('gc-os-comment-editor-styles')?.textContent ?? '';
    expect(css).toContain('.editor-input[data-os-empty]::before');
    expect(css).toContain('content: attr(data-placeholder)');
    h.wb.destroy();
  });

  it('uses the reply placeholder when a thread already exists', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const wb = new Workbook(host);
    const sheet = wb.getActiveSheet();
    sheet.threadedComments.add(1, 1)!.add({ message: [{ type: GC.Spread.Sheets.ThreadedComments.ContentType.text, value: 'first' }] });
    sheet.setActiveCell(1, 1);
    sheet._view()!.interaction.commentUi.openThread();
    const input = host.querySelector<HTMLElement>('.os-thread-card [contenteditable]')!;
    expect(input.dataset.placeholder).toBe('@mention or reply');
    expect(input.textContent).toBe('');
    wb.destroy();
  });

  it('keeps Post disabled while empty or whitespace and enabled only for real text', () => {
    const h = openCard();
    expect(h.post().disabled).toBe(true);
    expect(h.post().style.opacity).toBe('0.55');
    h.type('   ');
    expect(h.post().disabled).toBe(true); // whitespace-only stays disabled
    h.input().textContent = '';
    h.input().dispatchEvent(new Event('input', { bubbles: true }));
    h.type('hi');
    expect(h.post().disabled).toBe(false);
    expect(h.post().style.opacity).toBe('1');
    expect(h.input().hasAttribute('data-os-empty')).toBe(false);
    h.input().textContent = '';
    h.input().dispatchEvent(new Event('input', { bubbles: true }));
    expect(h.post().disabled).toBe(true);
    expect(h.input().hasAttribute('data-os-empty')).toBe(true);
    h.wb.destroy();
  });

  it('keeps every typed character: an input event never rewrites the text', () => {
    const h = openCard();
    h.type('hello');
    expect(h.input().textContent).toBe('hello'); // first char not swallowed by placeholder removal
    expect(h.input().hasAttribute('data-os-empty')).toBe(false);
    h.wb.destroy();
  });

  it('posts nothing (and stays open) when Post or Enter is used on an empty input', () => {
    const h = openCard();
    h.post().click(); // disabled: browsers suppress the click; jsdom must too
    h.input().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(h.sheet.threadedComments.size()).toBe(0);
    expect(h.card()).toBeTruthy(); // card still open
    h.wb.destroy();
  });

  it('posts exactly the typed text with no placeholder leaking into the thread', () => {
    const h = openCard();
    h.type('keep me');
    h.input().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    const thread = h.sheet.threadedComments.get(1, 1);
    expect(thread).toBeTruthy();
    const text = (thread!.get(0)!.message as { value?: string }[]).map((b) => b.value ?? '').join('');
    expect(text).toBe('keep me');
    h.wb.destroy();
  });

  it('restores the empty placeholder state after backspacing browser leftovers', () => {
    const h = openCard();
    h.type('x');
    h.input().innerHTML = '<br>'; // what Chrome leaves behind after deleting all text
    h.input().dispatchEvent(new Event('input', { bubbles: true }));
    expect(h.input().textContent).toBe('');
    expect(h.input().children.length).toBe(0);
    expect(h.input().hasAttribute('data-os-empty')).toBe(true);
    expect(h.post().disabled).toBe(true);
    h.wb.destroy();
  });

  it('never lets the grid keyboard handler steal keys typed in the card', () => {
    const h = openCard();
    expect(h.ui.consumes(h.input())).toBe(true);
    // A key typed in the card bubbles to the host like any DOM event would.
    h.input().dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
    expect(h.sheet.getValue(1, 1)).toBeNull(); // no "type-to-edit" on the grid
    expect(h.sheet.isEditing()).toBe(false);
    h.wb.destroy();
  });
  it('keeps a new, empty thread card open while the pointer moves over other cells', () => {
    const h = openCard(1, 1);
    h.ui.hover(5, 5);
    h.ui.hoverOut();
    h.card().dispatchEvent(new Event('pointerleave'));
    expect(h.host.querySelector('.os-thread-card')).not.toBeNull();
    h.wb.destroy();
  });

  it('closes a new, empty thread card with the Cancel (X) button', () => {
    const h = openCard(1, 1);
    h.card().querySelector<HTMLButtonElement>('.os-thread-cancel')!.click();
    expect(h.host.querySelector('.os-thread-card')).toBeNull();
    h.wb.destroy();
  });
});

describe('classic comment connector line (TASK 92 item 3)', () => {
  function classic(row: number, col: number, text = 'Hello'): { wb: InstanceType<typeof Workbook>; sheet: ReturnType<InstanceType<typeof Workbook>['getActiveSheet']>; host: HTMLElement; ui: CommentUi } {
    const host = document.createElement('div');
    host.style.width = '640px';
    host.style.height = '480px';
    document.body.append(host);
    const wb = new Workbook(host);
    const sheet = wb.getActiveSheet();
    sheet.comments.add(row, col, text);
    const view = sheet._view()!;
    // jsdom has no layout: give the renderer a measured viewport so cell rects are real.
    Object.defineProperty(view.root, 'clientWidth', { value: 640, configurable: true });
    Object.defineProperty(view.root, 'clientHeight', { value: 480, configurable: true });
    view.paint();
    const ui = view.interaction.commentUi;
    return { wb, sheet, host, ui };
  }
  const svg = (host: HTMLElement): SVGSVGElement | null => host.querySelector('.gc-comment-layoutPanel svg.os-comment-connector');
  const boxHost = (host: HTMLElement): HTMLElement => host.querySelector<HTMLElement>('.gc-comment-layoutPanel .gc-spread-host-container')!;

  it('draws the connector (line + arrowhead) from the shown box corner to the cell corner', () => {
    const { wb, host, ui } = classic(1, 1);
    ui.reveal(1, 1);
    const paths = svg(host)?.querySelectorAll('path') ?? [];
    expect(paths.length).toBe(2);
    // Line starts exactly at the comment box's top-left corner (trial: m4-comments probe).
    const box = boxHost(host);
    const d = paths[0].getAttribute('d')!;
    expect(d.startsWith(`M${parseFloat(box.style.left).toFixed(1)} ${parseFloat(box.style.top).toFixed(1)}`)).toBe(true);
    expect(paths[0].getAttribute('stroke')).toBe('#000000');
    expect(paths[0].getAttribute('stroke-width')).toBe('1');
    // Arrowhead: a closed filled triangle at the other (cell) end, pointing down-left.
    const head = paths[1].getAttribute('d')!;
    expect(head.endsWith('Z')).toBe(true);
    expect(paths[1].getAttribute('fill')).toBe('#000000');
    const tip = /M(-?[\d.]+)/.exec(head)![1];
    expect(Number(tip)).toBeLessThan(parseFloat(box.style.left));
    wb.destroy();
  });

  it('anchors the box at the trial offsets: 17 px right of the cell, 16 px above its top (TASK 98 item 3)', () => {
    const { wb, sheet, host, ui } = classic(3, 1);
    ui.reveal(3, 1);
    const rect = sheet.getCellRect(3, 1);
    const box = boxHost(host);
    expect(parseFloat(box.style.left)).toBeCloseTo(rect.x + rect.width + 17, 6);
    expect(parseFloat(box.style.top)).toBeCloseTo(rect.y - 16, 6);
    // The connector runs from that box corner down to the cell's top-right corner.
    const paths = svg(host)!.querySelectorAll('path');
    const d = paths[0].getAttribute('d')!;
    expect(d.startsWith(`M${parseFloat(box.style.left).toFixed(1)} ${parseFloat(box.style.top).toFixed(1)}`)).toBe(true);
    // Arrowhead tip at the cell's top-right corner (the trial's line-canvas corner ink).
    expect(paths[1].getAttribute('d')!.startsWith(`M${(rect.x + rect.width - 1).toFixed(1)} ${(rect.y + 2).toFixed(1)}`)).toBe(true);
    wb.destroy();
  });

  it('keeps the connector while the box is repositioned and removes it when the box closes', () => {
    const { wb, host, ui } = classic(2, 2);
    ui.reveal(2, 2);
    expect(svg(host)!.querySelectorAll('path').length).toBe(2);
    ui.hoverOut();
    expect(svg(host)!.querySelectorAll('path').length).toBe(0);
    wb.destroy();
  });

  it('always-shown comments carry a connector; hiding removes it', () => {
    const { wb, sheet, host, ui } = classic(3, 1);
    const comment = sheet.comments.get(3, 1)!;
    comment.displayMode(GC.Spread.Sheets.Comments.DisplayMode.alwaysShown);
    ui.sync();
    expect(host.querySelector('[data-os-always]')).toBeTruthy();
    expect(svg(host)!.querySelectorAll('path').length).toBe(2);
    comment.displayMode(GC.Spread.Sheets.Comments.DisplayMode.hoverShown);
    ui.sync();
    expect(svg(host)!.querySelectorAll('path').length).toBe(0);
    wb.destroy();
  });

  it('thread cards get no connector (only classic comments do)', () => {
    const { wb, host, ui } = classic(1, 1);
    ui.openThread();
    expect(host.querySelector('.os-thread-card')).toBeTruthy();
    expect(svg(host)).toBeNull();
    wb.destroy();
  });
});
