/**
 * Slicer view layer: each slicer owns an absolutely-positioned DOM panel with
 * its own canvas, placed by the renderer hook after every paint (scroll and
 * zoom stay correct without touching the core renderer files). All pointer
 * interaction (select, toggle items, clear filter, move, resize) happens on
 * this element, mirroring the trial's default slicer behaviour.
 */
import { paintSlicer, scrollbarThumbOffset, slicerLayout } from './paint.js';
import { applySelection, orderedEntries } from './state.js';
import type { Slicer } from './slicer.js';
import type { WorkbookRenderer } from '../../rendering.js';
import { clamp } from './types.js';

const ICON_RIGHT = 13;
const ICON_SIZE = 16;
const ICON_GAP = 8;

interface SliceUi {
  root: HTMLElement;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
}

const views = new WeakMap<Slicer, SliceUi>();

function viewRoot(slicer: Slicer, layer: HTMLElement): SliceUi {
  let ui = views.get(slicer);
  if (ui) return ui;
  const root = document.createElement('div');
  root.className = 'opensheets-floating-object opensheets-slicer';
  root.tabIndex = 0;
  const canvas = document.createElement('canvas');
  // The trial's outer border draws 1px outside the slicer rect; the CSS gives
  // the canvas a 1px padding (see .opensheets-slicer > canvas) so the border
  // drawn at (-0.5,-0.5,w,h) is never clipped.
  root.append(canvas);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Slicer canvas is unavailable');
  for (const direction of ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']) {
    const handle = document.createElement('div');
    handle.className = `opensheets-floating-handle handle-${direction}`;
    handle.dataset.direction = direction;
    root.append(handle);
  }
  attachPointerHandlers(slicer, root);
  ui = { root, canvas, ctx };
  views.set(slicer, ui);
  layer.append(root);
  return ui;
}

/**
 * Trial parity: with dynamicMove/dynamicSize the slicer re-derives its geometry
 * from the row/column anchors, so hiding a row inside the span shrinks the
 * slicer (default 186x258 → 238 when one 20px row in the span is filtered out).
 */
function syncDynamicAnchors(slicer: Slicer): void {
  const sheet = slicer._sheet;
  const rows = sheet?._rowLayout(), cols = sheet?._columnLayout();
  if (!rows || !cols) return;
  const a = slicer._anchors();
  const props = slicer.propsValue();
  const left = slicer.dynamicMove() ? cols.prefixSum(a.col) + a.dx : Number(slicer.x());
  const top = slicer.dynamicMove() ? rows.prefixSum(a.row) + a.dy : Number(slicer.y());
  const width = slicer.dynamicSize() ? cols.prefixSum(a.endCol) + a.endDx - left : Number(slicer.width());
  const height = slicer.dynamicSize() ? rows.prefixSum(a.endRow) + a.endDy - top : Number(slicer.height());
  props.x = left; props.y = top; props.width = width; props.height = height;
}

export function renderSlicerView(slicer: Slicer, view: WorkbookRenderer): void {
  syncDynamicAnchors(slicer);
  const layer = slicerLayer(view);
  const ui = viewRoot(slicer, layer);
  if (ui.root.parentElement !== layer) layer.append(ui.root);
  const zoom = view.zoom;
  const width = Math.max(1, Math.round(Number(slicer.width()) * zoom));
  const height = Math.max(1, Math.round(Number(slicer.height()) * zoom));
  const left = view.headerWidth + (Number(slicer.x()) - view.scrollX) * zoom;
  const top = view.headerHeight + (Number(slicer.y()) - view.scrollY) * zoom;
  Object.assign(ui.root.style, {
    display: slicer.isVisible() === false ? 'none' : '',
    left: `${left}px`,
    top: `${top}px`,
    width: `${width}px`,
    height: `${height}px`,
    zIndex: '900',
  });
  ui.root.classList.toggle('selected', !!slicer.isSelected());
  ui.root.classList.toggle('resizable', !!slicer.allowResize() && !slicer.disableResizingAndMoving());
  const dpr = (typeof window !== 'undefined' ? window.devicePixelRatio : 1) || 1;
  const pixelWidth = Math.max(1, Math.round(width * dpr)) + Math.round(2 * dpr);
  const pixelHeight = Math.max(1, Math.round(height * dpr)) + Math.round(2 * dpr);
  if (ui.canvas.width !== pixelWidth || ui.canvas.height !== pixelHeight) {
    ui.canvas.width = pixelWidth;
    ui.canvas.height = pixelHeight;
    slicer.viewState.signature = '';
  }
  paintSlicerCanvas(slicer, ui, zoom, dpr);
}

function repaint(slicer: Slicer): void {
  const ui = views.get(slicer);
  const view = slicer._sheet?._view();
  if (!ui || !view) return;
  paintSlicerCanvas(slicer, ui, view.zoom, (typeof window !== 'undefined' ? window.devicePixelRatio : 1) || 1);
}

function paintSlicerCanvas(slicer: Slicer, ui: SliceUi, zoom: number, dpr: number): void {
  const items = slicer.getVisibleItems();
  const signature = JSON.stringify([slicer.width(), slicer.height(), zoom, Number(slicer.itemHeight()),
    Number(slicer.columnCount()), slicer.showHeader(), slicer.captionName(), slicer.getStyleName(),
    slicer.viewState.hoverItem, slicer.viewState.hoverIcon, slicer.viewState.first,
    slicer.multiSelect(), slicer.visuallyNoDataItems(), slicer.isSelected(),
    items.map(item => `${item.text}${item.selected ? 1 : 0}${item.noData ? 1 : 0}`)]);
  if (signature === slicer.viewState.signature) return;
  slicer.viewState.signature = signature;
  paintSlicerInto(slicer, ui.ctx, zoom, dpr, 1);
}

/** Shared entry so toImageSrc() and the live layer draw with one code path.
 *  `pad` adds CSS pixels of margin (the live canvas uses 1 so the trial's
 *  outer border drawn outside the slicer rect is not clipped). */
export function paintSlicerInto(slicer: Slicer, ctx: CanvasRenderingContext2D, zoom: number, dpr = 1, pad = 0): void {
  const width = Math.max(1, Number(slicer.width()));
  const height = Math.max(1, Number(slicer.height()));
  ctx.setTransform(zoom * dpr, 0, 0, zoom * dpr, pad * dpr, pad * dpr);
  ctx.clearRect(-pad / zoom, -pad / zoom, width + 2 * pad / zoom, height + 2 * pad / zoom);
  paintSlicer(ctx, slicer.resolvedStyle(), {
    items: slicer.getVisibleItems(),
    hoverItem: slicer.viewState.hoverItem,
    hoverIcon: slicer.viewState.hoverIcon,
    first: slicer.viewState.first,
    filtered: isFiltered(slicer),
    multiSelect: !!slicer.multiSelect(),
    visualNoData: slicer.visuallyNoDataItems() !== false,
    selected: !!slicer.isSelected(),
    zoom,
    width,
    height,
    itemHeight: Number(slicer.itemHeight()),
    columnCount: Number(slicer.columnCount()),
    showHeader: slicer.showHeader() !== false,
    caption: String(slicer.captionName() ?? ''),
  });
}

export function isFiltered(slicer: Slicer): boolean {
  const items = slicer.getVisibleItems();
  return items.length > 0 && items.some(item => !item.selected);
}

function slicerLayer(view: WorkbookRenderer): HTMLElement {
  const holder = view as unknown as { __slicerLayer?: HTMLElement };
  let layer = holder.__slicerLayer;
  if (layer && layer.isConnected) return layer;
  layer = document.createElement('div');
  layer.className = 'opensheets-slicer-layer';
  view.root.append(layer);
  holder.__slicerLayer = layer;
  return layer;
}

interface HitResult { kind: 'item' | 'multi' | 'clear' | 'header' | 'body' | 'sb-up' | 'sb-down' | 'sb-thumb'; index: number }

export function hitTest(slicer: Slicer, x: number, y: number): HitResult {
  const items = slicer.getVisibleItems();
  const showHeader = slicer.showHeader() !== false;
  const layout = slicerLayout(Number(slicer.width()), Number(slicer.height()), Number(slicer.itemHeight()),
    Number(slicer.columnCount()), items.length, showHeader);
  if (showHeader && y <= layout.headerHeight + 3) {
    const width = Number(slicer.width());
    const funnelX = width - ICON_RIGHT - ICON_SIZE;
    const sortX = funnelX - ICON_GAP - ICON_SIZE;
    if (x >= funnelX - 4 && x <= funnelX + 19) return { kind: 'clear', index: -1 };
    if (x >= sortX - 4 && x <= sortX + 19) return { kind: 'multi', index: -1 };
    return { kind: 'header', index: -1 };
  }
  const bar = layout.scrollbar;
  if (bar && x >= bar.x && x <= bar.x + bar.width) {
    if (y >= bar.y && y < bar.y + bar.buttonHeight) return { kind: 'sb-up', index: -1 };
    if (y > bar.y + bar.height - bar.buttonHeight && y <= bar.y + bar.height) return { kind: 'sb-down', index: -1 };
    const offset = scrollbarThumbOffset(bar, slicer.viewState.first, items.length, layout.capacity);
    const top = bar.y + bar.buttonHeight + offset;
    if (y >= top && y <= top + bar.thumbHeight) return { kind: 'sb-thumb', index: -1 };
  }
  const index = itemIndexAt(slicer, layout, x, y);
  if (index >= 0) return { kind: 'item', index };
  return { kind: 'body', index: -1 };
}

/** Display index of the item under (x, y), or -1. Shared by click and drag-select. */
function itemIndexAt(slicer: Slicer, layout: ReturnType<typeof slicerLayout>, x: number, y: number): number {
  for (let visible = 0; visible < layout.capacity; visible++) {
    const rect = layout.button(visible);
    if (x >= rect.x - 1 && x <= rect.x + rect.width + 1 && y >= rect.y - 1 && y < rect.y + layout.rowPitch - 1) {
      const index = slicer.viewState.first + visible;
      if (index < slicer.getVisibleItems().length) return index;
      return -1;
    }
  }
  return -1;
}

function attachPointerHandlers(slicer: Slicer, root: HTMLElement): void {
  root.addEventListener('pointerdown', event => {
    if (event.button === 2) { selectOnly(slicer); return; }
    if (event.button !== 0) return;
    const zoom = slicer._sheet?._view()?.zoom ?? 1;
    const rect = root.getBoundingClientRect();
    const x = (event.clientX - rect.left) / zoom;
    const y = (event.clientY - rect.top) / zoom;
    const handle = (event.target as HTMLElement).dataset?.direction as string | undefined;
    if (handle && slicer.allowResize() && !slicer.disableResizingAndMoving()) {
      event.stopPropagation();
      startGeometryDrag(slicer, event, handle);
      return;
    }
    const hit = hitTest(slicer, x, y);
    event.stopPropagation();
    if (hit.kind === 'item') {
      handleItemClick(slicer, hit.index, event);
    } else if (hit.kind === 'clear') {
      slicer.slicerData?.doUnfilter(slicer.columnName());
    } else if (hit.kind === 'multi') {
      slicer.multiSelect(!slicer.multiSelect());
    } else if (hit.kind === 'header' && slicer.allowMove() && !slicer.disableResizingAndMoving()) {
      selectOnly(slicer);
      startGeometryDrag(slicer, event, 'move');
    } else if (hit.kind === 'body') {
      selectOnly(slicer);
    } else if (hit.kind === 'sb-up' || hit.kind === 'sb-down') {
      setFirst(slicer, slicer.viewState.first + (hit.kind === 'sb-down' ? 1 : -1));
    } else if (hit.kind === 'sb-thumb') {
      startThumbDrag(slicer, event);
    }
    repaint(slicer);
  });
  // Trial: the mouse wheel over a slicer is NOT consumed — it scrolls the sheet
  // behind (item lists scroll only via the scrollbar buttons/thumb).
  root.addEventListener('pointermove', event => {
    if (event.buttons !== 0) return;
    const zoom = slicer._sheet?._view()?.zoom ?? 1;
    const rect = root.getBoundingClientRect();
    const hit = hitTest(slicer, (event.clientX - rect.left) / zoom, (event.clientY - rect.top) / zoom);
    const state = slicer.viewState;
    const hoverItem = hit.kind === 'item' ? hit.index : -1;
    const hoverIcon = hit.kind === 'clear' ? 'clear' : hit.kind === 'multi' ? 'multi' : 'none';
    if (hoverItem !== state.hoverItem || hoverIcon !== state.hoverIcon) {
      state.hoverItem = hoverItem;
      state.hoverIcon = hoverIcon;
      repaint(slicer);
    }
  });
  root.addEventListener('pointerleave', () => {
    const state = slicer.viewState;
    if (state.hoverItem !== -1 || state.hoverIcon !== 'none') {
      state.hoverItem = -1;
      state.hoverIcon = 'none';
      repaint(slicer);
    }
  });
  root.addEventListener('keydown', event => {
    if (event.key === 'Escape') slicer.isSelected(false);
  });
}

function handleItemClick(slicer: Slicer, displayIndex: number, event: PointerEvent): void {
  if (slicer.multiSelect() && startDragSelect(slicer, displayIndex, event)) return;
  applyItemClick(slicer, displayIndex, event.ctrlKey || event.metaKey);
}

/** Non-drag item activation, matching the trial's multiSelect/click matrix. */
export function applyItemClick(slicer: Slicer, displayIndex: number, ctrl = false): void {
  const entries = orderedEntries(slicer, false);
  const entry = entries[displayIndex];
  if (!entry || !slicer.slicerData) return;
  const items = slicer.getVisibleItems();
  const exclusiveSelected = items
    .map((item, index) => (item.selected ? entries[index]?.index : undefined))
    .filter((index): index is number => index !== undefined);
  if (slicer.multiSelect() || ctrl) {
    // Trial: multiSelect (or holding ctrl) toggles the clicked item.
    const next = exclusiveSelected.includes(entry.index)
      ? exclusiveSelected.filter(index => index !== entry.index)
      : [...exclusiveSelected, entry.index];
    applySelection(slicer, next);
  } else if (exclusiveSelected.length === 1 && exclusiveSelected[0] === entry.index) {
    return; // single-select: the only selected item stays selected
  } else {
    applySelection(slicer, [entry.index]); // single-select: replace
  }
}

/** Compute the current exclusive-selection indexes from the display items. */
function currentExclusive(slicer: Slicer): number[] {
  const entries = orderedEntries(slicer, false);
  return slicer.getVisibleItems()
    .map((item, index) => (item.selected ? entries[index]?.index : undefined))
    .filter((index): index is number => index !== undefined);
}

/** Toggle the item at display index through the data model. */
function toggleItem(slicer: Slicer, displayIndex: number): void {
  const entry = orderedEntries(slicer, false)[displayIndex];
  if (!entry) return;
  const sel = currentExclusive(slicer);
  const next = sel.includes(entry.index) ? sel.filter(index => index !== entry.index) : [...sel, entry.index];
  applySelection(slicer, next);
}

/**
 * Drag-select across items (multiSelect on): the trial toggles EVERY item the
 * pointer passes once, starting with the pressed one. The pointerdown itself
 * acts as the click, so a plain click still toggles a single item.
 */
function startDragSelect(slicer: Slicer, displayIndex: number, event: PointerEvent): boolean {
  if (!slicer.multiSelect() || !slicer.slicerData) return false;
  const zoom = slicer._sheet?._view()?.zoom ?? 1;
  const root = event.currentTarget as HTMLElement;
  const layout = slicerLayout(Number(slicer.width()), Number(slicer.height()), Number(slicer.itemHeight()),
    Number(slicer.columnCount()), slicer.getVisibleItems().length, slicer.showHeader() !== false);
  const visited = new Set<number>([displayIndex]);
  toggleItem(slicer, displayIndex);
  const move = (e: PointerEvent): void => {
    const rect = root.getBoundingClientRect();
    const index = itemIndexAt(slicer, layout, (e.clientX - rect.left) / zoom, (e.clientY - rect.top) / zoom);
    if (index < 0 || visited.has(index)) return;
    visited.add(index);
    toggleItem(slicer, index);
    repaint(slicer);
  };
  const up = (): void => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    repaint(slicer);
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  return true;
}

/** Scroll the item list so the first visible display index becomes `value`. */
function setFirst(slicer: Slicer, value: number): void {
  const layout = slicerLayout(Number(slicer.width()), Number(slicer.height()), Number(slicer.itemHeight()),
    Number(slicer.columnCount()), 0, slicer.showHeader() !== false);
  const maxFirst = Math.max(0, slicer.getVisibleItems().length - layout.capacity);
  const next = clamp(Math.round(value), 0, maxFirst);
  if (next !== slicer.viewState.first) { slicer.viewState.first = next; repaint(slicer); }
}

/** Drag the scrollbar thumb: maps the pointer y back to a scroll offset. */
function startThumbDrag(slicer: Slicer, event: PointerEvent): void {
  const zoom = slicer._sheet?._view()?.zoom ?? 1;
  const start = event.clientY;
  const startFirst = slicer.viewState.first;
  const layout = slicerLayout(Number(slicer.width()), Number(slicer.height()), Number(slicer.itemHeight()),
    Number(slicer.columnCount()), slicer.getVisibleItems().length, slicer.showHeader() !== false);
  const bar = layout.scrollbar;
  if (!bar) return;
  const count = slicer.getVisibleItems().length;
  const rail = bar.height - 2 * bar.buttonHeight - bar.thumbHeight;
  const move = (e: PointerEvent): void => {
    const dy = (e.clientY - start) / zoom;
    const perRow = count > layout.capacity ? rail / (count - layout.capacity) : rail;
    setFirst(slicer, startFirst + (perRow > 0 ? Math.round(dy / perRow) : 0));
  };
  const up = (): void => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
}

function selectOnly(slicer: Slicer): void {
  const sheet = slicer._sheet;
  if (!sheet) return;
  for (const other of sheet.slicers.all()) if (other !== slicer) (other as unknown as { isSelected(v: boolean): void }).isSelected(false);
  for (const item of [...sheet.floatingObjects.all(), ...sheet.pictures.all(), ...sheet.shapes.all(), ...sheet.charts.all()])
    item.isSelected(false);
  slicer.isSelected(true);
}


function startGeometryDrag(slicer: Slicer, event: PointerEvent, direction: string): void {
  const zoom = slicer._sheet?._view()?.zoom ?? 1;
  const start = {
    x: event.clientX, y: event.clientY,
    left: Number(slicer.x()), top: Number(slicer.y()),
    width: Number(slicer.width()), height: Number(slicer.height()),
  };
  const move = (e: PointerEvent): void => {
    const dx = (e.clientX - start.x) / zoom;
    const dy = (e.clientY - start.y) / zoom;
    if (direction === 'move') {
      slicer.x(Math.max(0, start.left + dx), false);
      slicer.y(Math.max(0, start.top + dy), false);
    } else {
      if (direction.includes('e')) slicer.width(Math.max(20, start.width + dx), false);
      if (direction.includes('s')) slicer.height(Math.max(20, start.height + dy), false);
      if (direction.includes('w')) {
        slicer.x(clamp(start.left + dx, 0, start.left + start.width - 20), false);
        slicer.width(Math.max(20, start.width - dx), false);
      }
      if (direction.includes('n')) {
        slicer.y(clamp(start.top + dy, 0, start.top + start.height - 20), false);
        slicer.height(Math.max(20, start.height - dy), false);
      }
    }
  };
  const up = (): void => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    // The trial emits the changed properties once per gesture (on release).
    if (Number(slicer.x()) !== start.left || Number(slicer.y()) !== start.top) {
      slicer.x(Number(slicer.x()));
      slicer.y(Number(slicer.y()));
    }
    if (Number(slicer.width()) !== start.width) slicer.width(Number(slicer.width()));
    if (Number(slicer.height()) !== start.height) slicer.height(Number(slicer.height()));
    slicer._sheet?._view()?.schedule();
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
}
