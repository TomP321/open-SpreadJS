/**
 * Slicer painting: layout math (shared with hit-testing) and the canvas draw.
 * Every glyph (caption icons, item buttons, check marks) is our own vector
 * code; colours/fonts come from the resolved SlicerStyle, matching the trial.
 * Geometry numbers were measured black-box from trial screenshots:
 *   outer border 1px #5b9bd5 at (-0.5,-0.5,w,h); header line y=23 x9..185 #adcdea;
 *   first item top y=29, row pitch = itemHeight + 6.5; item box x=9 w=162
 *   (h = itemHeight + 4 for the first row, + 5 below), rounded ~3.5px;
 *   selected item: fill #bdd7ee (Accent 1 60), left border #999999, right #b4b9be,
 *   first row top #999999 / bottom #a3a3a3; other rows 2px rings (#cccccc outer,
 *   #abb8c4 inner top, #abb8c3 inner bottom). Unselected: white fill, #cccccc
 *   border, first row bottom #d1d1d1, other rings #e6e6e6 outer / #e5e5e5 inner.
 */
import { resolveSlicerColor, SlicerStyle } from './styles.js';
import type { JsonRecord } from '../../serialization.js';
import type { SlicerItem } from './types.js';
import {
  SLICER_BUTTON_RADIUS, SLICER_HEADER_HEIGHT,
  SLICER_ITEM_GAP, SLICER_ITEM_LEFT, SLICER_ITEM_RIGHT, SLICER_LIST_TOP, SLICER_LIST_TOP_NO_HEADER,
  SLICER_TEXT_INSET,
} from './types.js';

export interface ItemRect { x: number; y: number; width: number; height: number }

export interface ScrollbarRect { x: number; y: number; width: number; height: number;
  thumbY: number; thumbHeight: number; buttonHeight: number }

export interface SlicerLayout {
  headerHeight: number;
  rowPitch: number;
  boxHeight: number;
  rows: number;
  columns: number;
  capacity: number;
  scrollbar: ScrollbarRect | null;
  button(index: number): ItemRect;
}

/** Trial item box: first row 1px shorter; columns separated by a 3px gap. */
const ITEM_BOX_FIRST_EXTRA = 4;
const ITEM_BOX_EXTRA = 5;
const COLUMN_GAP = 3;
/** Trial scrollbar (pixel scan): thumb x 156..174 (19px: #c3c3c3 left edge,
 *  #cdcdcd fill, #bcbcbc right edge, #bbbbbb top row, #bebebe bottom row) over a
 *  18px #f0f0f0 track (157..174); track top = listTop, bottom = height-12;
 *  17px arrow zones (thumb top = listTop+17). Boxes get a 33px right inset. */
const SCROLLBAR_WIDTH = 19;
const SCROLLBAR_INSET = 33;
const SCROLLBAR_BUTTON_HEIGHT = 17;

/**
 * Item grid of the trial (pixel-scanned): row pitch = itemHeight + 7; the first
 * box starts at y=29 (y=4 without header) and is 1px shorter than the following
 * rows, which all sit on exact `listTop - 1 + n * pitch` boundaries (rows 1..n).
 * Row-major fill (left→right then down). When the items overflow, a 19px
 * scrollbar appears on the right and the item boxes shrink by that amount.
 */
export function slicerLayout(width: number, height: number, itemHeight: number, columnCount: number,
  count: number, showHeader = true): SlicerLayout {
  const headerHeight = SLICER_HEADER_HEIGHT;
  const rowPitch = itemHeight + SLICER_ITEM_GAP;
  const listTop = showHeader ? SLICER_LIST_TOP : SLICER_LIST_TOP_NO_HEADER;
  const boxHeight = itemHeight + ITEM_BOX_EXTRA;
  const rowTop = (row: number): number => (row === 0 ? listTop : listTop - 1 + row * rowPitch);
  const boxHeightOf = (row: number): number => (row === 0 ? itemHeight + ITEM_BOX_FIRST_EXTRA : boxHeight);
  let rows = 0;
  while (rows < 4096 && rowTop(rows) + boxHeightOf(rows) - 1 <= height - 1) rows++;
  rows = Math.max(1, rows);
  const columns = Math.max(1, columnCount);
  const capacity = rows * columns;
  const withBar = count > capacity;
  const rightInset = withBar ? SCROLLBAR_INSET : SLICER_ITEM_RIGHT;
  const usable = Math.max(1, width - SLICER_ITEM_LEFT - rightInset - (columns - 1) * COLUMN_GAP);
  const columnWidth = usable / columns;
  const barBottom = height - 12;
  const rail = barBottom - listTop + 1 - 2 * SCROLLBAR_BUTTON_HEIGHT;
  const thumbHeight = Math.max(14, Math.ceil(rail * capacity / (count + 1)));
  const scrollbar: ScrollbarRect | null = withBar
    ? { x: width - SCROLLBAR_WIDTH - 11, y: listTop, width: SCROLLBAR_WIDTH, height: barBottom - listTop + 1,
      thumbY: listTop + SCROLLBAR_BUTTON_HEIGHT, thumbHeight, buttonHeight: SCROLLBAR_BUTTON_HEIGHT }
    : null;
  const button = (index: number): ItemRect => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    // Trial column grid (pixel scan): each column starts at floor(left + i*(w+gap))
    // and ends just before the next cumulative boundary, so a .5-wide column gives
    // widths 79/80 (not 80/80 with a rounded start).
    const x = Math.floor(SLICER_ITEM_LEFT + column * (columnWidth + COLUMN_GAP));
    const end = Math.floor(SLICER_ITEM_LEFT + (column + 1) * columnWidth + column * COLUMN_GAP);
    return { x, y: rowTop(row), width: end - x, height: boxHeightOf(row) };
  };
  return { headerHeight, rowPitch, boxHeight, rows, columns, capacity, scrollbar, button };
}

/** Thumb offset for a scrolled list (trial keeps the thumb proportional). */
export function scrollbarThumbOffset(bar: ScrollbarRect, first: number, count: number, capacity: number): number {
  const rail = bar.height - 2 * bar.buttonHeight - bar.thumbHeight;
  const maxFirst = Math.max(1, count - capacity);
  return Math.round(rail * Math.max(0, Math.min(1, first / maxFirst)));
}

interface ResolvedParts {
  back: unknown;
  fore: string;
  font: string;
  border: string;
}

/** Convert a style font (pt) into a canvas font string scaled by zoom. */
export function canvasFont(styleInfo: JsonRecord | undefined, zoom: number, fallback = '11pt Calibri'): string {
  const raw = String(styleInfo?.font ?? fallback);
  const scaled = raw.replace(/(\d+(?:\.\d+)?)pt/g, (_m, size: string) => `${(Number(size) * 96 / 72 * zoom).toFixed(2)}px`);
  return /[a-z]$/i.test(scaled) ? scaled : `${scaled}px Calibri, sans-serif`;
}

function resolveParts(style: SlicerStyle, key: string): ResolvedParts {
  const json = style.info(key)?.toJSON() ?? {};
  const borderRecord = (json.borderLeft ?? {}) as JsonRecord;
  return {
    back: json.backColor,
    fore: resolveSlicerColor(json.foreColor ?? 'black'),
    font: String(json.font ?? 'normal normal 11pt calibri'),
    border: resolveSlicerColor(borderRecord.borderColor ?? 'transparent'),
  };
}

export function fillStyle(ctx: CanvasRenderingContext2D, value: unknown, rect: ItemRect): string | CanvasGradient {
  if (value && typeof value === 'object') {
    const grad = value as { degree?: number; stops?: { position: number; color: string }[] };
    const stops = grad.stops ?? [];
    const vertical = Number(grad.degree ?? 0) % 180 === 90;
    const gradient = vertical
      ? ctx.createLinearGradient(rect.x, rect.y, rect.x, rect.y + rect.height)
      : ctx.createLinearGradient(rect.x, rect.y, rect.x + rect.width, rect.y);
    for (const stop of stops) gradient.addColorStop(stop.position, stop.color);
    return gradient;
  }
  return resolveSlicerColor(value ?? 'transparent');
}

export interface PaintState {
  items: SlicerItem[];
  hoverItem: number;
  hoverIcon: 'none' | 'multi' | 'clear';
  first: number;
  filtered: boolean;
  multiSelect: boolean;
  /** visuallyNoDataItems(): grey + strike-through the no-data items (trial default). */
  visualNoData?: boolean;
  /** Selected slicers draw a gray #808080 outer ring instead of the blue border (trial). */
  selected?: boolean;
  zoom: number;
  width: number;
  height: number;
  itemHeight: number;
  columnCount: number;
  showHeader: boolean;
  caption: string;
}

export function paintSlicer(ctx: CanvasRenderingContext2D, style: SlicerStyle, state: PaintState): void {
  const { zoom, width, height } = state;
  const whole = resolveParts(style, 'wholeSlicerStyle');
  const layout = slicerLayout(width, height, state.itemHeight, state.columnCount, state.items.length, state.showHeader);
  ctx.save();
  ctx.fillStyle = fillStyle(ctx, whole.back, { x: 0, y: 0, width, height });
  ctx.fillRect(0, 0, width, height);
  if (state.showHeader) paintHeader(ctx, style, state, width, layout);
  // Trial: items live in a list area that ends at height-12 (the scrollbar rail
  // bottom); the last partially visible row is cut there with no bottom ring,
  // leaving a white band before the panel border.
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, width, height - 11);
  ctx.clip();
  const visible = state.items.slice(state.first, state.first + layout.capacity);
  visible.forEach((item, index) => {
    const rect = layout.button(index);
    const key = itemKey(item, state.hoverItem === state.first + index, state.visualNoData !== false);
    const parts = resolveParts(style, key);
    const rawBack = parts.back as unknown;
    const isGrad = !!rawBack && typeof rawBack === 'object';
    const stops = isGrad ? (rawBack as { stops?: { color: string }[] }).stops ?? [] : [];
    const solidColor = isGrad ? undefined : resolveSlicerColor(rawBack ?? 'transparent') || '#ffffff';
    const topColor = isGrad ? stops[0]?.color ?? '#ffffff' : solidColor;
    const bottomColor = isGrad ? stops[stops.length - 1]?.color ?? '#ffffff' : solidColor;
    // mixHex needs #rrggbb: named/transparent/rgb() backgrounds (unselected items)
    // mix against white in the trial, not against black (that darkened the inner rings).
    const clean = (c?: string) => (c && /^#[0-9a-fA-F]{6}$/.test(c) ? c : '#ffffff');
    const rowIndex = Math.floor(index / layout.columns);
    paintItemBox(ctx, rect, rowIndex, fillStyle(ctx, parts.back, rect),
      clean(topColor), clean(bottomColor), parts.border);
    const font = canvasFont(style.info(key)?.raw(), zoom);
    ctx.font = font;
    ctx.fillStyle = parts.fore;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    // Trial text region (pixel scan, 2-column ellipsis): ~8px is reserved on the
    // right of the item text — "Washington" gets cut to "Washingt..." in a 79px box.
    const textMax = rect.width - SLICER_TEXT_INSET - 8;
    const text = ellipsis(ctx, itemDisplay(item), rect.x + SLICER_TEXT_INSET, textMax);
    // Trial scans (itemHeight 21/32, rows 0 and 1): the text centre sits at
    // boxTop + (itemHeight+3)/2 for the first row and + (itemHeight+5)/2 below
    // (the first box is one pixel shorter), i.e. always the box's centre minus
    // the bottom border pixel.
    const textY = rect.y + state.itemHeight / 2 + (rowIndex === 0 ? 1.5 : 2.5);
    ctx.fillText(text, rect.x + SLICER_TEXT_INSET, textY);
    // Trial: visuallyNoDataItems(true) draws a 1px strike-through over no-data item text.
    if (item.noData && state.visualNoData !== false) {
      ctx.fillRect(rect.x + SLICER_TEXT_INSET - 1, Math.round(textY), ctx.measureText(text).width + 2, 1);
    }
  });
  ctx.restore();
  if (layout.scrollbar) paintScrollbar(ctx, layout.scrollbar, state.first, state.items.length, layout.capacity);
  paintOuterBorder(ctx, style, width, height, state.selected === true);
  ctx.restore();
}

/** Trial scrollbar: #f0f0f0 track (1px inside the thumb rect), thumb #cdcdcd with
 *  #c3c3c3 left / #bcbcbc right / #bbbbbb top / #bebebe bottom edges, chevrons #606060. */
function paintScrollbar(ctx: CanvasRenderingContext2D, bar: ScrollbarRect, first: number, count: number, capacity: number): void {
  ctx.save();
  ctx.fillStyle = '#f0f0f0';
  ctx.fillRect(bar.x + 1, bar.y, bar.width - 1, bar.height);
  const offset = scrollbarThumbOffset(bar, first, count, capacity);
  const top = bar.y + bar.buttonHeight + offset;
  ctx.fillStyle = '#cdcdcd';
  ctx.fillRect(bar.x, top, bar.width, bar.thumbHeight);
  ctx.fillStyle = '#c3c3c3';
  ctx.fillRect(bar.x, top, 1, bar.thumbHeight);
  ctx.fillStyle = '#bcbcbc';
  ctx.fillRect(bar.x + bar.width - 1, top, 1, bar.thumbHeight);
  ctx.fillStyle = '#bbbbbb';
  ctx.fillRect(bar.x + 1, top, bar.width - 2, 1);
  ctx.fillStyle = '#bebebe';
  ctx.fillRect(bar.x + 1, top + bar.thumbHeight - 1, bar.width - 2, 1);
  ctx.strokeStyle = '#606060';
  ctx.lineWidth = 2;
  paintChevron(ctx, bar.x + Math.floor(bar.width / 2), bar.y + Math.floor(bar.buttonHeight / 2) + 1, true);
  paintChevron(ctx, bar.x + Math.floor(bar.width / 2), bar.y + bar.height - Math.floor(bar.buttonHeight / 2) - 2, false);
  ctx.restore();
}

function paintChevron(ctx: CanvasRenderingContext2D, cx: number, cy: number, up: boolean): void {
  // Trial scan: 2px arms, ~10px wide, ~5px tall (apex at the centre).
  ctx.beginPath();
  ctx.moveTo(cx - 4.5, cy + (up ? 3 : -3));
  ctx.lineTo(cx, cy + (up ? -1.5 : 1.5));
  ctx.lineTo(cx + 4.5, cy + (up ? 3 : -3));
  ctx.stroke();
}

function paintOuterBorder(ctx: CanvasRenderingContext2D, style: SlicerStyle, width: number, height: number, selected = false): void {
  // Trial: a selected slicer draws a gray #808080 1px ring (the blue border is replaced).
  ctx.strokeStyle = selected ? '#808080' : (resolveSlicerColor(firstBorder(style) || 'Accent 1') || '#5B9BD5');
  ctx.lineWidth = 1;
  ctx.strokeRect(-0.5, -0.5, width, height);
}

function firstBorder(style: SlicerStyle): string {
  const json = style.info('wholeSlicerStyle')?.raw() as JsonRecord | undefined;
  const left = json?.borderLeft as JsonRecord | undefined;
  return String(left?.borderColor ?? '');
}

function itemDisplay(item: SlicerItem): string {
  return item.text === '' ? '(blank)' : item.text;
}

function itemKey(item: SlicerItem, hovered: boolean, visualNoData = true): string {
  // Style slot names: selectedItemWithDataStyle / unSelectedItemWithDataStyle /
  // hoveredSelectedItemWithDataStyle / ... (capital only after the "hovered" prefix).
  // Trial: with visuallyNoDataItems(false) the no-data slots are not applied.
  const data = item.noData && visualNoData ? 'WithNoData' : 'WithData';
  const name = item.selected
    ? (hovered ? 'hoveredSelectedItem' : 'selectedItem')
    : (hovered ? 'hoveredUnSelectedItem' : 'unSelectedItem');
  return `${name}${data}Style`;
}

/**
 * Item button in the trial's rendering (pixel scans): row 0 is a 1px ring in the
 * style's border colour all around. Rows below the first add a horizontal-only
 * 2px ring at the top (outer #cccccc / inner fill-blended) and the mirrored pair
 * at the bottom; the side columns stay the plain 1px borders (dark left, lighter
 * right, faint #d7d7d7 shadow outside the right edge). Side-adjacent ring pixels
 * are left to the rounded-corner anti-aliasing — no full inner stroke (that
 * painted an extra light column along both sides).
 */
function paintItemBox(ctx: CanvasRenderingContext2D, rect: ItemRect, row: number,
  fill: string | CanvasGradient, fillColorTop: string, fillColorBottom: string, border: string): void {
  const { x, width } = rect;
  const y = Math.round(rect.y);
  const h = rect.height;
  const w = Math.round(width);
  const fallback = border && border !== 'transparent' ? border : '#999999';
  const outer = row === 0 ? fallback : mixHex(fallback, '#ffffff', 0.5);
  // Trial scan: the inner ring row is the 50% mix of the border with the fill AT
  // that edge — for gradient fills the top ring is tinted by the first stop, the
  // bottom ring by the last one (olive #c9be7f top, neutral #cac7c5 bottom).
  const innerTop = mixHex(fallback, fillColorTop, 0.5);
  const innerBottom = mixHex(fallback, fillColorBottom, 0.5);
  const radius = SLICER_BUTTON_RADIUS + 0.5;
  ctx.fillStyle = fill;
  roundRectPath(ctx, x + 0.5, y + 0.5, w - 1, h - 1, radius);
  ctx.fill();
  ctx.strokeStyle = outer;
  ctx.lineWidth = 1;
  roundRectPath(ctx, x + 0.5, y + 0.5, w - 1, h - 1, radius);
  ctx.stroke();
  if (row > 0) {
    // Top ring: outer stroke pixel on y, inner on y+1 (both from the corner's end).
    ctx.fillStyle = innerTop;
    ctx.fillRect(x + 3, y + 1, w - 6, 1);
    // Bottom ring: inner on y+h-2, outer stroke pixel on y+h-1.
    ctx.fillStyle = innerBottom;
    ctx.fillRect(x + 3, y + h - 2, w - 6, 1);
  }
  ctx.fillStyle = fallback;
  ctx.fillRect(x, y + 3, 1, h - 6);
  ctx.fillStyle = mixHex(innerBottom, '#ffffff', 0.15);
  ctx.fillRect(x + w - 1, y + 3, 1, h - 6);
  // Trial: a faint 1px shadow column sits just outside the right border.
  ctx.fillStyle = '#d7d7d7';
  ctx.fillRect(x + w, y + 3, 1, h - 6);
  if (row === 0) {
    // Trial: row 0's bottom border is a 2px band — a faint fill-tinted pixel
    // (scans: #b9d0e4 blue, #fafafa white, #f1ecxe7 amber ≈ 10% of the gradient
    // BOTTOM colour over white) one row above the darker border row.
    ctx.fillStyle = mixHex(fillColorBottom, fallback, 0.08);
    ctx.fillRect(x + 3, y + h - 2, w - 6, 1);
    ctx.fillStyle = mixHex(fallback, '#ffffff', 0.12);
    ctx.fillRect(x + 3, y + h - 1, w - 6, 1);
  }
}

/** Linear blend of two #rrggbb colours (t = 0 → a, 1 → b). */
export function mixHex(a: string, b: string, t: number): string {
  const parse = (h: string): number[] => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const ca = parse(a.startsWith('#') ? a : '#000000');
  const cb = parse(b.startsWith('#') ? b : '#000000');
  return '#' + ca.map((v, i) => Math.round(v + (cb[i] - v) * t).toString(16).padStart(2, '0')).join('');
}

function paintHeader(ctx: CanvasRenderingContext2D, style: SlicerStyle, state: PaintState, width: number, layout: SlicerLayout): void {
  const json = style.info('headerStyle')?.raw() as JsonRecord | undefined;
  ctx.font = canvasFont(json, state.zoom, 'bold 11pt calibri');
  ctx.fillStyle = resolveSlicerColor(String(json?.foreColor ?? 'black'));
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  const funnelX = width - 28;
  const multiX = width - 53;
  const centerY = Math.round(layout.headerHeight / 2);
  if (state.multiSelect) paintIconBox(ctx, multiX - 4);
  ctx.fillText(ellipsis(ctx, state.caption, 10, multiX - 14), 10, centerY + state.zoom);
  paintMultiIcon(ctx, multiX, centerY, state.zoom);
  paintFunnel(ctx, funnelX, centerY, state.zoom, state.filtered || state.hoverIcon === 'clear');
  paintHeaderLine(ctx, style, width);
}

/**
 * Amber gradient box behind the multi-select icon while multi-select is ON
 * (trial scan: local x 129..152, y -1..20, top #f8e576 → bottom #fefbe8,
 * 1px #999999 side edges).
 */
function paintIconBox(ctx: CanvasRenderingContext2D, x: number): void {
  const grad = ctx.createLinearGradient(0, -1, 0, 20);
  grad.addColorStop(0, '#f8e576');
  grad.addColorStop(1, '#fefbe8');
  ctx.fillStyle = grad;
  ctx.fillRect(x, -1, 24, 21);
  ctx.fillStyle = '#999999';
  ctx.fillRect(x, 0, 1, 20);
  ctx.fillRect(x + 23, 0, 1, 20);
}

/**
 * Trial header separator (pixel scans): headerStyle.borderBottom resolved to a
 * colour, then 50% mixed with white — light1 #adcdea, light2 #f6be98,
 * dark3/other1 #d2d2d2, light4 #ffdf80; drawn 2px from the item margin.
 */
function paintHeaderLine(ctx: CanvasRenderingContext2D, style: SlicerStyle, width: number): void {
  const json = style.info('headerStyle')?.raw() as JsonRecord | undefined;
  const bottom = json?.borderBottom as JsonRecord | undefined;
  const token = resolveSlicerColor(String(bottom?.borderColor ?? ''));
  const color = /^#[0-9a-fA-F]{6}$/.test(token) ? mixHex(token, '#ffffff', 0.5) : '#adcdea';
  ctx.fillStyle = color;
  ctx.fillRect(SLICER_ITEM_LEFT, SLICER_HEADER_HEIGHT - 1, width - SLICER_ITEM_LEFT - 1, 2);
}

/**
 * Header glyph: multi-select toggle (three check marks + three lines), our own
 * vector drawing. Trial scan (100% zoom): 1px lines #666666 at header y 7 / 12 /
 * 17, x width-45..width-35; each line has a light check mark just left of it
 * (x width-53..width-47). No hover state: the icon only highlights via the
 * amber box when multi-select is ON.
 */
function paintMultiIcon(ctx: CanvasRenderingContext2D, x: number, centerY: number, zoom: number): void {
  const rows = [centerY - 8, centerY - 3, centerY + 2];
  ctx.save();
  ctx.fillStyle = '#666666';
  for (const y of rows) ctx.fillRect(x + 8, Math.round(y), 10, 1);
  ctx.strokeStyle = '#828282';
  ctx.lineWidth = Math.max(1, zoom);
  ctx.beginPath();
  for (const y of rows) {
    ctx.moveTo(Math.round(x) + 0.5, Math.round(y) + 1.5);
    ctx.lineTo(Math.round(x + 2.5) + 0.5, Math.round(y + 2.5));
    ctx.lineTo(Math.round(x + 5.5) + 0.5, Math.round(y - 1.5));
  }
  ctx.stroke();
  ctx.restore();
}

/**
 * Header glyph: filter funnel with an "x" badge (clear filter), our own vector
 * drawing. Trial scan: one closed silhouette — 16px bar (x width-29..width-13,
 * y 3..8) tapering into a 6px stem down to y 19 — fill #dcdcdc, stroke #7b7b7b,
 * plus a light-gray X badge right of the stem; both turn red (#e75a51) while a
 * filter is on or the icon is hovered.
 */
function paintFunnel(ctx: CanvasRenderingContext2D, x: number, centerY: number, zoom: number, active: boolean): void {
  const cy = Math.round(centerY);
  const fx = Math.round(x);
  ctx.save();
  // Trial scan: the silhouette is gray with a #dcdcdc fill while no filter is on
  // and turns white once a filter is on (the clear action is "pressed down");
  // hovering turns the whole glyph red. Only the X badge turns red for the
  // filtered state alone.
  const hovered = zoom < 0; // (unused marker; hover passed via active flags below)
  void hovered;
  ctx.strokeStyle = '#7b7b7b';
  ctx.fillStyle = active ? '#ffffff' : '#dcdcdc';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(fx - 0.5, cy - 9.5);
  ctx.lineTo(fx + 15.5, cy - 9.5);
  ctx.lineTo(fx + 15.5, cy - 5.5);
  ctx.lineTo(fx + 10.5, cy - 1);
  ctx.lineTo(fx + 10.5, cy + 5.5);
  ctx.lineTo(fx + 4.5, cy + 5.5);
  ctx.lineTo(fx + 4.5, cy - 1);
  ctx.lineTo(fx - 0.5, cy - 5.5);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = active ? '#e75a51' : '#c4c4c4';
  ctx.lineWidth = Math.max(1, zoom);
  ctx.beginPath();
  ctx.moveTo(fx + 11.5, cy + 1.5);
  ctx.lineTo(fx + 15.5, cy + 5.5);
  ctx.moveTo(fx + 15.5, cy + 1.5);
  ctx.lineTo(fx + 11.5, cy + 5.5);
  ctx.stroke();
  ctx.restore();
}

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}


function ellipsis(ctx: CanvasRenderingContext2D, text: string, x: number, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth || maxWidth <= 0) return text;
  let out = text;
  while (out.length > 1 && ctx.measureText(`${out}...`).width > maxWidth) out = out.slice(0, -1);
  return `${out}...`;
}
