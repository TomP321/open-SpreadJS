// GC.Spread.Sheets.Touch — touch toolstrip model + DOM (TASK 44 item 2).
// Contract: public d.ts Touch namespace (TouchToolStrip, TouchToolStripItem,
// TouchToolStripSeparator). Trial semantics recorded through the black-box probe
// .probe/api-sweep-probe.mjs (segments `touch*`): model defaults, item and
// separator naming counters, render timing, `canExecute` gating, DOM structure
// (tags/classes observed through the public API only — official CSS and icon
// bitmaps are never read or copied). All glyphs are our own SVG paths.

import type { Workbook } from './workbook.js';

// Trial-observed defaults (probes `touch:strip0`, `touch:workbook-strip`, `touch:item`).
const DEFAULT_ITEM_HEIGHT: number | null = null;
const DEFAULT_ITEM_WIDTH = 60;
const DEFAULT_IMAGE_AREA_HEIGHT = 32;
const DEFAULT_SEPARATOR_HEIGHT = 45;
const DEFAULT_ITEM_FONT = 'normal 12px Arial';

interface TouchContext {
  /** Strips built for the workbook: the workbook's own strip is 0 (probe `touch5:standalone-sep`). */
  strips: number;
  /** Next `separator<N>` index; the workbook strip's separator is 0. */
  separators: number;
  /** Popup ordinal used in the `gc-popup-gc-dialog<N>` wrapper class (1-based). */
  popups: number;
}

const contexts = new WeakMap<Workbook, TouchContext>();
let lastTouchContext: TouchContext | undefined;

/** @internal Per-workbook naming counters (trial probe `touch5:standalone-sep`). */
export function touchContextFor(workbook: Workbook): TouchContext {
  let context = contexts.get(workbook);
  if (!context) {
    context = { strips: 0, separators: 0, popups: 0 };
    contexts.set(workbook, context);
  }
  lastTouchContext = context;
  return context;
}

/** Our own 24x24 outline glyphs (SVG paths, clean-room), keyed by built-in item. */
function defaultGlyph(name: string): string {
  const paths: Record<string, string> = {
    paste: 'M8 4h8v4H8zM5 8h14v12H5z',
    cut: 'M6 4l12 12M18 4L6 16M8 16v4M16 16v4M8 20h8',
    copy: 'M9 9h10v11H9zM5 4h10v11',
    autofill: 'M5 5h14v14H5zM5 12h14M12 5v14M16 16h4M16 19h4',
  };
  for (const key of Object.keys(paths)) {
    if (name.toLowerCase().includes(key)) {
      return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" ' +
        'stroke="#444444" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' +
        `<path d="${paths[key]}"/></svg>`
      );
    }
  }
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24"><rect x="4" y="4" width="16" height="16" fill="none" stroke="#444444" stroke-width="1.6"/></svg>';
}

function glyphDataUri(name: string): string {
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(defaultGlyph(name));
}

export class TouchToolStripItem {
  private _name: string | null;
  private _text: string | null;
  private _image: string | null;
  private _font = DEFAULT_ITEM_FONT;
  private _foreColor: string | null = null;
  /** @internal command / visibility gate (constructor args 4 / 5). */
  _command?: (...args: unknown[]) => unknown;
  _canExecute?: () => boolean;

  constructor(name?: string, text?: string, image?: string, command?: unknown, canExecute?: unknown) {
    this._name = name === undefined ? null : String(name);
    this._text = text === undefined ? null : String(text);
    this._image = image === undefined ? null : String(image);
    if (typeof command === 'function') this._command = command as (...args: unknown[]) => unknown;
    if (typeof canExecute === 'function') this._canExecute = canExecute as () => boolean;
  }

  name(value?: string): string | TouchToolStripItem | null {
    if (value === undefined) return this._name;
    this._name = String(value);
    return this;
  }

  text(value?: string): string | TouchToolStripItem | null {
    if (value === undefined) return this._text;
    this._text = String(value);
    return this;
  }

  image(value?: string): string | TouchToolStripItem | null {
    if (value === undefined) return this._image;
    this._image = String(value);
    return this;
  }

  font(value?: string): string | TouchToolStripItem {
    if (value === undefined) return this._font;
    this._font = String(value);
    return this;
  }

  foreColor(value?: string): string | TouchToolStripItem | null {
    if (value === undefined) return this._foreColor;
    this._foreColor = String(value);
    return this;
  }

  /** @internal `canExecute` gates DISPLAY only, evaluated once per render (probes `touch4:canexec`, `touch5:gate-count`). */
  _visible(): boolean {
    return this._canExecute ? this._canExecute() !== false : true;
  }

  /** @internal Tapping runs the command even when the item is gated off (probe `touch4:canexec`: a hidden button's click listener still executes). */
  _exec(): unknown {
    return this._command ? this._command() : undefined;
  }
}

export class TouchToolStripSeparator {
  /** @internal Assigned by the strip at add time (`separator<N>`); `null` = unassigned. */
  _name: string | null = null;
  private _context: TouchContext | undefined;
  /** @internal visibility gate (constructor arg 1), same semantics as item `canExecute`. */
  _canExecute?: () => boolean;

  constructor(canExecute?: unknown) {
    this._context = lastTouchContext;
    if (typeof canExecute === 'function') this._canExecute = canExecute as () => boolean;
  }

  /**
   * Unassigned separators report the workbook's next separator index without
   * consuming it; the strip assigns the final name at add time (probe
   * `touch5:standalone-sep`: peek `separator2`, after add `separator2`).
   */
  name(): string {
    if (this._name !== null) return this._name;
    const next = this._context ? this._context.separators : 1;
    return `separator${next}`;
  }

  /** @internal */
  _visible(): boolean {
    return this._canExecute ? this._canExecute() !== false : true;
  }
}

export type TouchToolStripEntry = TouchToolStripItem | TouchToolStripSeparator;

function isSeparator(item: TouchToolStripEntry): item is TouchToolStripSeparator {
  return item instanceof TouchToolStripSeparator;
}

export class TouchToolStrip {
  private _items: TouchToolStripEntry[] = [];
  private _itemHeight: number | null = DEFAULT_ITEM_HEIGHT;
  private _itemWidth = DEFAULT_ITEM_WIDTH;
  private _imageAreaHeight = DEFAULT_IMAGE_AREA_HEIGHT;
  private _separatorHeight = DEFAULT_SEPARATOR_HEIGHT;
  private _host: HTMLElement;
  private _workbook: Workbook;
  private _context: TouchContext;
  private _wrapper: HTMLElement;
  private _table: HTMLTableElement;
  private _open = false;

  constructor(workbook: Workbook, host: HTMLElement) {
    this._workbook = workbook;
    this._host = host;
    this._context = touchContextFor(workbook);
    const stripIndex = this._context.strips++;
    const popup = this._context.popups++;
    const doc = host.ownerDocument || (this._workbook as { _document?: Document })._document || document;
    // Trial wrapper structure (probe `touch:open-close` DOM dump, black-box):
    // DIV.gc-popup-gc-dialog<N> ui-widget gc-toolstrip-default ui-state-default well
    //   > TABLE > TR > TD.gc-toolstrip-item > BUTTON.gc-toolstrip-button
    //     gc-toolstrip-button-style ui-state-default ui-widget btn btn-default
    //     > SPAN.gc-toolstrip-image + SPAN.gc-toolstrip-text
    //   separator: TD.gc-toolstrip-item > DIV.gc-touch-sperate-line
    const wrapper = doc.createElement('div');
    wrapper.className = `gc-popup-gc-dialog${popup + 1} ui-widget gc-toolstrip-default ui-state-default well`;
    Object.assign(wrapper.style, {
      position: 'absolute',
      display: 'none',
      zIndex: '90',
      borderWidth: '1px',
      borderStyle: 'none',
      borderColor: '#c6c6c6',
      background: '#ffffff',
    } as CSSStyleDeclaration);
    const table = doc.createElement('table');
    table.style.borderCollapse = 'collapse';
    wrapper.appendChild(table);
    host.appendChild(wrapper);
    this._wrapper = wrapper;
    this._table = table;
    this._items = defaultItems(this._workbook, this._context, stripIndex);
    // The trial does not paint a standalone strip until it is opened or touched
    // (probes `touch5:gate-count`: no gate calls before open; `touchui:tap`:
    // empty DOM on a fresh workbook).
  }

  add(item: TouchToolStripEntry): void {
    if (isSeparator(item) && item._name === null) {
      item._name = `separator${this._context.separators++}`;
    }
    this._items.push(item);
    if (this._open) this._paint();
  }

  clear(): void {
    this._items = [];
    if (this._open) this._paint();
  }

  getItem(name: string): TouchToolStripEntry | undefined {
    return this._items.find((item) => item.name() === name);
  }

  /** Trial returns `null` for an empty strip (probes `touch:defaults`, `touch4:id`). */
  getItems(): TouchToolStripEntry[] | null {
    return this._items.length ? this._items.slice() : null;
  }

  remove(name: string): TouchToolStripItem | null {
    const index = this._items.findIndex((item) => item.name() === name);
    if (index < 0) return null;
    const [item] = this._items.splice(index, 1);
    if (this._open) this._paint();
    return item as TouchToolStripItem;
  }

  imageAreaHeight(height?: number): number | TouchToolStrip {
    if (height === undefined) return this._imageAreaHeight;
    this._imageAreaHeight = height;
    return this;
  }

  itemHeight(height?: number): number | TouchToolStrip | null {
    if (height === undefined) return this._itemHeight;
    this._itemHeight = height;
    return this;
  }

  itemWidth(width?: number): number | TouchToolStrip {
    if (width === undefined) return this._itemWidth;
    this._itemWidth = width;
    return this;
  }

  separatorHeight(height?: number): number | TouchToolStrip {
    if (height === undefined) return this._separatorHeight;
    this._separatorHeight = height;
    return this;
  }

  /**
   * Opens the strip. Trial geometry (probes `touch4:geom`, `touch5:pos`): the
   * wrapper docks at the document's left edge (the `x` argument does not move
   * it), the top is `host top + y`, clamped so the strip stays inside the
   * viewport bottom; negative `y` is not clamped.
   */
  open(x: number, y: number): void {
    this._open = true;
    this._paint();
    const wrapper = this._wrapper;
    wrapper.style.display = 'block';
    const hostRect = this._host.getBoundingClientRect();
    const height = wrapper.offsetHeight;
    const viewportHeight = (this._host.ownerDocument?.defaultView || window).innerHeight;
    let top = hostRect.top + y;
    if (top + height > viewportHeight) top = viewportHeight - height;
    wrapper.style.left = `${-hostRect.left}px`;
    wrapper.style.top = `${top}px`;
    void x;
  }

  close(): void {
    this._open = false;
    this._wrapper.style.display = 'none';
  }

  /** @internal */
  _isOpen(): boolean {
    return this._open;
  }

  /** @internal Paint the strip without showing it (trial paints the workbook strip when a touch happens; probe `touchreal`). */
  _paintOnTouch(): void {
    this._paint();
  }

  /** @internal Detach the strip DOM (workbook destroy). */
  _detach(): void {
    this._wrapper.remove();
  }

  private _paint(): void {
    const doc = this._host.ownerDocument || document;
    this._table.replaceChildren();
    const tr = doc.createElement('tr');
    this._table.appendChild(tr);
    for (const item of this._items) {
      const td = doc.createElement('td');
      td.className = 'gc-toolstrip-item';
      td.style.padding = '4px';
      if (isSeparator(item)) {
        const line = doc.createElement('div');
        line.className = 'gc-touch-sperate-line';
        Object.assign(line.style, {
          width: '1px',
          height: `${this._separatorHeight}px`,
          background: '#c4c4c4',
        } as CSSStyleDeclaration);
        if (!item._visible()) line.style.display = 'none';
        td.appendChild(line);
      } else {
        const button = doc.createElement('button');
        button.className = 'gc-toolstrip-button gc-toolstrip-button-style ui-state-default ui-widget btn btn-default';
        Object.assign(button.style, {
          display: 'block',
          width: `${this._itemWidth}px`,
          boxSizing: 'content-box',
          border: '0',
          background: 'transparent',
          cursor: 'pointer',
          textAlign: 'center',
          font: item.font() as string,
          lineHeight: '15px',
          color: (item.foreColor() as string | null) ?? 'rgb(0, 0, 0)',
          padding: '4px',
        } as CSSStyleDeclaration);
        const image = doc.createElement('span');
        image.className = 'gc-toolstrip-image';
        Object.assign(image.style, {
          display: 'block',
          width: `${this._itemWidth}px`,
          height: `${this._imageAreaHeight}px`,
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'center',
        } as CSSStyleDeclaration);
        const uri = item.image();
        if (uri) image.style.backgroundImage = `url("${uri}")`;
        const text = doc.createElement('span');
        text.className = 'gc-toolstrip-text';
        text.textContent = (item.text() as string | null) ?? '';
        button.appendChild(image);
        button.appendChild(text);
        button.addEventListener('click', (event) => {
          event.preventDefault();
          item._exec();
          this.close();
        });
        // `canExecute` hides the button but keeps it in the DOM (probe `touch4:canexec`).
        if (!item._visible()) button.style.display = 'none';
        td.appendChild(button);
      }
      tr.appendChild(td);
    }
  }
}

/**
 * Default item set, with trial names and texts (probe `touch5:standalone-sep`):
 * the workbook strip builds `wijspread_toolstrip_<op>0` + `separator0`; the
 * first standalone strip builds `<op>1` items and takes the next separator index.
 */
function defaultItems(workbook: Workbook, context: TouchContext, stripIndex: number): TouchToolStripEntry[] {
  const run = (command: string) => () => {
    const sheet = workbook.getActiveSheet();
    try {
      workbook.commandManager().execute({ cmd: command, sheetName: sheet.name() });
    } catch {
      /* headless: no clipboard UI */
    }
  };
  const suffix = String(stripIndex);
  const items: TouchToolStripEntry[] = [
    new TouchToolStripItem(`wijspread_toolstrip_paste${suffix}`, 'Paste', glyphDataUri('paste'), run('paste')),
    new TouchToolStripItem(`wijspread_toolstrip_cut${suffix}`, 'Cut', glyphDataUri('cut'), run('cut')),
    new TouchToolStripItem(`wijspread_toolstrip_copy${suffix}`, 'Copy', glyphDataUri('copy'), run('copy')),
  ];
  const separator = new TouchToolStripSeparator();
  separator._name = `separator${context.separators++}`;
  items.push(separator);
  items.push(new TouchToolStripItem(`wijspread_toolstrip_autofill${suffix}`, 'AutoFill', glyphDataUri('autofill'), run('fill')));
  return items;
}

/** @internal Builds the workbook-level strip (`spread.touchToolStrip`, created with the host). */
export function createWorkbookTouchToolStrip(workbook: Workbook, host: HTMLElement): TouchToolStrip {
  const strip = new TouchToolStrip(workbook, host);
  // The workbook's own strip must keep the workbook as the naming context even
  // after standalone strips were built.
  lastTouchContext = touchContextFor(workbook);
  return strip;
}
