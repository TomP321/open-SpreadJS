/**
 * Pivot timeline view (TASK 42 item 4): DOM panel + canvas for the
 * `PivotTableTimelineSlicer`, its bucket layout, painting and pointer
 * interaction. All glyphs and geometry are our own vector code, laid out to
 * match the trial's structure (black-box screenshot observation only):
 *   header (caption + clear funnel), an "All Periods" / "<LEVEL> ▾" row, the
 *   period-of-year label row, the month label row, the block bar with dark
 *   edge caps, and a bottom scrollbar strip. Geometry numbers measured from
 *   trial screenshots at 100% zoom (345x145 default widget).
 */
import { clamp } from './types.js';
import { canvasFont, fillStyle } from './paint.js';
import { resolveSlicerColor } from './styles.js';
import type { SlicerStyle } from './styles.js';
import type { PivotTableTimelineSlicer } from './pivot-slicer.js';
import type { WorkbookRenderer } from '../../rendering.js';
import type { JsonRecord } from '../../serialization.js';
import { GC } from '../../generated/enums.js';
import { CultureManager } from '../../culture.js';
import { ltext } from '../../localization.js';

const TimelineLevel = GC.Spread.Sheets.Slicers.TimelineLevel;

const HEADER_HEIGHT = 24;
const SELECTION_ROW_Y = 34;
const SELECTION_ROW_HEIGHT = 16;
const PERIOD1_ROW_Y = 52;
const PERIOD1_ROW_HEIGHT = 14;
const LABEL_ROW_Y = 66;
const LABEL_ROW_HEIGHT = 14;
const BAND_TOP = 84;
const BAND_HEIGHT = 18;
const SCROLL_TOP = 106;
const SCROLL_HEIGHT = 17;
const SIDE_MARGIN = 8;
const SCROLL_BUTTON = 15;
const ICON_SIZE = 16;

const DAY = 86_400_000;
const DEFAULT_MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
/** Timeline month labels follow the culture's abbreviated month names (en-US: JAN..DEC). */
let monthCacheKey = '';
let monthCache: string[] = DEFAULT_MONTHS;
const MONTHS = (): string[] => {
  const key = `${CultureManager.culture()}#${CultureManager._cultureGeneration()}`;
  if (key === monthCacheKey) return monthCache;
  const names = CultureManager.getCultureInfo()?.DateTimeFormat.abbreviatedMonthNames ?? [];
  const labels = names.slice(0, 12).map((name) => String(name).toUpperCase());
  monthCache = labels.length === 12 && labels.every((name) => name) ? labels : DEFAULT_MONTHS;
  monthCacheKey = key;
  return monthCache;
};
const LEVEL_NAMES: Record<number, string> = {
  [TimelineLevel.years]: 'YEARS', [TimelineLevel.quarters]: 'QUARTERS',
  [TimelineLevel.months]: 'MONTHS', [TimelineLevel.days]: 'DAYS',
};
const LEVEL_KEYS: Record<number, string> = {
  [TimelineLevel.years]: 'years', [TimelineLevel.quarters]: 'quarters',
  [TimelineLevel.months]: 'months', [TimelineLevel.days]: 'days',
};
const itext = (key: string, fallback: string, ...args: (string | number)[]): string => ltext(`slicer.${key}`, fallback, ...args);
/** Block pitch per level, measured from the trial (months: ~52.5px). */
const BLOCK_WIDTH: Record<number, number> = {
  [TimelineLevel.years]: 172, [TimelineLevel.quarters]: 84,
  [TimelineLevel.months]: 52.5, [TimelineLevel.days]: 22,
};

export interface TimelineBucket { start: number; end: number; label: string; hasData: boolean }

export interface TimelineLayout {
  showHeader: boolean;
  showLevels: boolean;
  showSelectionLabel: boolean;
  buckets: TimelineBucket[];
  blockWidth: number;
  barLeft: number;
  barRight: number;
  first: number;
  capacity: number;
  levelLabel: { x: number; right: number; text: string };
  selectionLabel: { x: number; text: string };
  clearIcon: { x: number; y: number };
  leftArrow: { x: number; y: number };
  rightArrow: { x: number; y: number };
  period1(b: TimelineBucket): string;
}

function startOfDay(time: number): number {
  const date = new Date(time);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

/** Bucket start ms of the level containing `time` (local calendar). */
export function bucketStart(time: number, level: number): number {
  const date = new Date(time);
  switch (level) {
    case TimelineLevel.years: return new Date(date.getFullYear(), 0, 1).getTime();
    case TimelineLevel.quarters: return new Date(date.getFullYear(), Math.floor(date.getMonth() / 3) * 3, 1).getTime();
    case TimelineLevel.months: return new Date(date.getFullYear(), date.getMonth(), 1).getTime();
    default: return startOfDay(time);
  }
}

/** Next bucket start after `time` (exclusive end of its bucket). */
export function bucketEnd(time: number, level: number): number {
  const date = new Date(bucketStart(time, level));
  switch (level) {
    case TimelineLevel.years: return new Date(date.getFullYear() + 1, 0, 1).getTime();
    case TimelineLevel.quarters: return new Date(date.getFullYear(), date.getMonth() + 3, 1).getTime();
    case TimelineLevel.months: return new Date(date.getFullYear(), date.getMonth() + 1, 1).getTime();
    default: return startOfDay(time) + DAY;
  }
}

function bucketLabel(start: number, level: number): string {
  const date = new Date(start);
  switch (level) {
    case TimelineLevel.years: return String(date.getFullYear());
    case TimelineLevel.quarters: return `Q${Math.floor(date.getMonth() / 3) + 1}`;
    case TimelineLevel.months: return MONTHS()[date.getMonth()]!;
    default: return String(date.getDate());
  }
}

function periodOf(start: number, level: number): string {
  const date = new Date(start);
  switch (level) {
    case TimelineLevel.quarters:
    case TimelineLevel.months: return String(date.getFullYear());
    case TimelineLevel.days: return `${MONTHS()[date.getMonth()]} ${date.getFullYear()}`;
    default: return '';
  }
}

/**
 * Full calendar of buckets from the first to the last date of the field
 * (the trial shows empty months too, not only months that have data).
 */
export function timelineBuckets(times: number[], level: number): TimelineBucket[] {
  if (!times.length) return [];
  const out: TimelineBucket[] = [];
  let start = bucketStart(times[0]!, level);
  const last = bucketStart(times[times.length - 1]!, level);
  const data = new Set(times.map(time => bucketStart(time, level)));
  for (let guard = 0; guard < 100000; guard++) {
    const end = bucketEnd(start, level) - 1;
    out.push({ start, end, label: bucketLabel(start, level), hasData: data.has(start) });
    if (start >= last) break;
    start = bucketEnd(start, level);
  }
  return out;
}

export function timelineLayout(slicer: PivotTableTimelineSlicer, buckets: TimelineBucket[]): TimelineLayout {
  const width = Number(slicer.width());
  const showHeader = slicer.showHeader() !== false;
  const showLevels = slicer.customProps.showTimeLevel !== false && showHeader;
  const showSelectionLabel = slicer.customProps.showSelectionLabel !== false && showHeader;
  const level = Number(slicer.level());
  const blockWidth = BLOCK_WIDTH[level] ?? 52.5;
  const barLeft = SIDE_MARGIN;
  const barRight = width - SIDE_MARGIN;
  const capacity = Math.max(1, Math.floor((barRight - barLeft) / blockWidth));
  let first = 0;
  if (slicer.scrollTime) {
    const index = buckets.findIndex(bucket => bucket.start >= slicer.scrollTime);
    if (index > 0) first = Math.min(index, Math.max(0, buckets.length - capacity));
  }
  return {
    showHeader, showLevels, showSelectionLabel, buckets, blockWidth, barLeft, barRight, first, capacity,
    levelLabel: { x: barLeft, right: width - SIDE_MARGIN - 12, text: itext(`timeline.${LEVEL_KEYS[level] ?? 'years'}`, LEVEL_NAMES[level] ?? '') },
    selectionLabel: { x: barLeft, text: selectionText(slicer, buckets) },
    clearIcon: { x: width - SIDE_MARGIN - ICON_SIZE - 2, y: 4 },
    leftArrow: { x: SIDE_MARGIN, y: SCROLL_TOP },
    rightArrow: { x: width - SIDE_MARGIN - SCROLL_BUTTON, y: SCROLL_TOP },
    period1: bucket => periodOf(bucket.start, level),
  };
}

function selectionText(slicer: PivotTableTimelineSlicer, buckets: TimelineBucket[]): string {
  if (!buckets.length) return '';
  const from = slicer.selectedFrom;
  const to = slicer.selectedTo;
  const full = from === null || to === null
    || (from <= buckets[0]!.start && to >= buckets[buckets.length - 1]!.end);
  if (full) return itext('timeline.allPeriods', 'All Periods');
  const format = (time: number): string => {
    const date = new Date(time);
    return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
  };
  return `${format(from!)} - ${format(to!)}`;
}

export function isTimelineFiltered(slicer: PivotTableTimelineSlicer): boolean {
  const buckets = timelineBuckets(slicer.timelineData?.times ?? [], Number(slicer.level()));
  if (!buckets.length || slicer.selectedFrom === null || slicer.selectedTo === null) return false;
  return buckets.some(bucket => bucket.end < slicer.selectedFrom! || bucket.start > slicer.selectedTo!);
}

export interface TimelineHit {
  kind: 'block' | 'level' | 'clear' | 'selection' | 'left' | 'right' | 'handle-left' | 'handle-right' | 'other';
  index: number;
  bucket?: TimelineBucket;
}

export function timelineHitTest(slicer: PivotTableTimelineSlicer, x: number, y: number): TimelineHit {
  const layout = timelineLayout(slicer, currentBuckets(slicer));
  if (layout.showHeader) {
    if (x >= layout.clearIcon.x && x <= layout.clearIcon.x + ICON_SIZE && y >= layout.clearIcon.y && y <= layout.clearIcon.y + ICON_SIZE)
      return { kind: 'clear', index: -1 };
    if (layout.showLevels && y >= SELECTION_ROW_Y && y <= SELECTION_ROW_Y + SELECTION_ROW_HEIGHT
      && x >= layout.levelLabel.right - 90) return { kind: 'level', index: -1 };
    if (layout.showSelectionLabel && y >= SELECTION_ROW_Y && y <= SELECTION_ROW_Y + SELECTION_ROW_HEIGHT
      && x < layout.levelLabel.right - 90) return { kind: 'selection', index: -1 };
  }
  if (y >= SCROLL_TOP && y <= SCROLL_TOP + SCROLL_HEIGHT) {
    if (x <= layout.barLeft + SCROLL_BUTTON && layout.first > 0) return { kind: 'left', index: -1 };
    if (x >= layout.rightArrow.x && layout.first + layout.capacity < layout.buckets.length) return { kind: 'right', index: -1 };
  }
  if (y >= LABEL_ROW_Y && y <= BAND_TOP + BAND_HEIGHT) {
    if (y >= BAND_TOP) {
      const left = bandPixel(slicer, layout, 'left');
      const right = bandPixel(slicer, layout, 'right');
      if (left !== null && Math.abs(x - left) <= 5) return { kind: 'handle-left', index: -1 };
      if (right !== null && Math.abs(x - right) <= 5) return { kind: 'handle-right', index: -1 };
    }
    const index = layout.first + Math.floor((x - layout.barLeft) / layout.blockWidth);
    const bucket = layout.buckets[index];
    if (bucket && x >= layout.barLeft && x <= layout.barRight) return { kind: 'block', index, bucket };
  }
  return { kind: 'other', index: -1 };
}

function currentBuckets(slicer: PivotTableTimelineSlicer): TimelineBucket[] {
  return timelineBuckets(slicer.timelineData?.times ?? [], Number(slicer.level()));
}

/** Screen x of a selection edge inside the band (null when out of range). */
function bandPixel(slicer: PivotTableTimelineSlicer, layout: TimelineLayout, edge: 'left' | 'right'): number | null {
  const from = slicer.selectedFrom;
  const to = slicer.selectedTo;
  if (from === null || to === null) return null;
  for (const [index, bucket] of layout.buckets.entries()) {
    if (index < layout.first || index - layout.first > layout.capacity) continue;
    const x = layout.barLeft + (index - layout.first) * layout.blockWidth;
    const span = Math.max(1, bucket.end - bucket.start);
    if (edge === 'left' && bucket.start <= from && bucket.end >= from)
      return clamp(x + ((from - bucket.start) / span) * layout.blockWidth, layout.barLeft, layout.barRight);
    if (edge === 'right' && bucket.start <= to && bucket.end >= to)
      return clamp(x + ((to + 1 - bucket.start) / span) * layout.blockWidth, layout.barLeft, layout.barRight);
  }
  return null;
}

interface Resolved { back: unknown; fore: string; font: string; border: string }

function parts(style: SlicerStyle, key: string, zoom: number): Resolved {
  const json = (style.info?.(key)?.toJSON?.() ?? {}) as JsonRecord;
  const border = (json.borderLeft ?? {}) as JsonRecord;
  return {
    back: resolveBack(json.backColor),
    fore: resolveSlicerColor(json.foreColor ?? 'black'),
    font: canvasFont(json, zoom),
    border: resolveSlicerColor(border.borderColor ?? 'transparent'),
  };
}

/** Resolve palette tokens ("Accent 1 60") inside gradient stops too. */
function resolveBack(value: unknown): unknown {
  if (value && typeof value === 'object') {
    const grad = value as { degree?: number; stops?: { position: number; color: string }[] };
    return { ...grad, stops: (grad.stops ?? []).map(stop => ({ ...stop, color: resolveSlicerColor(stop.color) })) };
  }
  return value;
}

export interface TimelinePaintState {
  zoom: number;
  width: number;
  height: number;
  selected: boolean;
}

export function paintTimeline(
  ctx: CanvasRenderingContext2D, style: SlicerStyle, slicer: PivotTableTimelineSlicer, state: TimelinePaintState,
): void {
  const { zoom, width, height } = state;
  const layout = timelineLayout(slicer, currentBuckets(slicer));
  const whole = parts(style, 'wholeSlicerStyle', zoom);
  ctx.save();
  ctx.fillStyle = fillStyle(ctx, whole.back, { x: 0, y: 0, width, height });
  ctx.fillRect(0, 0, width, height);
  if (layout.showHeader) {
    const header = parts(style, 'headerStyle', zoom);
    ctx.fillStyle = fillStyle(ctx, header.back, { x: 0, y: 0, width, height: HEADER_HEIGHT });
    ctx.fillRect(0, 0, width, HEADER_HEIGHT);
    ctx.strokeStyle = '#d9d9d9';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(1, HEADER_HEIGHT - 0.5);
    ctx.lineTo(width - 1, HEADER_HEIGHT - 0.5);
    ctx.stroke();
    ctx.fillStyle = header.fore || '#000000';
    ctx.font = `bold ${canvasFont({ font: '11pt Calibri' }, zoom)}`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillText(String(slicer.captionName() ?? ''), SIDE_MARGIN + 1, HEADER_HEIGHT / 2);
    drawFunnel(ctx, layout.clearIcon.x, layout.clearIcon.y, isTimelineFiltered(slicer));
  }
  if (layout.showSelectionLabel || layout.showLevels) {
    const label = parts(style, 'selectionLabelStyle', zoom);
    ctx.font = canvasFont({ font: '10pt Calibri' }, zoom);
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillStyle = label.fore || '#4472c4';
    if (layout.showSelectionLabel) ctx.fillText(layout.selectionLabel.text, layout.selectionLabel.x, SELECTION_ROW_Y + SELECTION_ROW_HEIGHT / 2);
    if (layout.showLevels) {
      ctx.textAlign = 'right';
      ctx.fillText(layout.levelLabel.text, layout.levelLabel.right - 10, SELECTION_ROW_Y + SELECTION_ROW_HEIGHT / 2);
      // Own "open level menu" triangle behind the level name.
      ctx.beginPath();
      ctx.moveTo(layout.levelLabel.right - 6, SELECTION_ROW_Y + SELECTION_ROW_HEIGHT / 2 - 2);
      ctx.lineTo(layout.levelLabel.right + 2, SELECTION_ROW_Y + SELECTION_ROW_HEIGHT / 2 - 2);
      ctx.lineTo(layout.levelLabel.right - 2, SELECTION_ROW_Y + SELECTION_ROW_HEIGHT / 2 + 4);
      ctx.closePath();
      ctx.fill();
    }
  }
  // Period-1 labels (years above month blocks), centred per run.
  const period1 = parts(style, 'periodLabel1Style', zoom);
  const period2 = parts(style, 'periodLabel2Style', zoom);
  ctx.font = canvasFont({ font: '9pt Calibri' }, zoom);
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillStyle = period1.fore || '#000000';
  for (const [index, bucket] of layout.buckets.entries()) {
    if (index < layout.first || index - layout.first > layout.capacity) continue;
    const label = layout.period1(bucket);
    if (!label) continue;
    const x = layout.barLeft + (index - layout.first) * layout.blockWidth;
    const previous = layout.buckets[index - 1];
    if (index > layout.first && previous && layout.period1(previous) === label) continue;
    ctx.fillText(label, x + 6, PERIOD1_ROW_Y + PERIOD1_ROW_HEIGHT / 2);
  }
  // Block labels above the band + the band itself.
  const selected = parts(style, 'selectedTimeBlockStyle', zoom);
  const unselected = parts(style, 'unselectedTimeBlockStyle', zoom);
  const from = slicer.selectedFrom;
  const to = slicer.selectedTo;
  ctx.save();
  ctx.beginPath();
  ctx.rect(layout.barLeft, LABEL_ROW_Y - 2, layout.barRight - layout.barLeft, BAND_TOP - LABEL_ROW_Y + BAND_HEIGHT + 4);
  ctx.clip();
  ctx.font = canvasFont({ font: '8pt Calibri' }, zoom);
  for (const [index, bucket] of layout.buckets.entries()) {
    if (index < layout.first || index - layout.first > layout.capacity) continue;
    const x = layout.barLeft + (index - layout.first) * layout.blockWidth;
    const w = layout.blockWidth;
    const isSelected = from !== null && to !== null && bucket.end >= from && bucket.start <= to;
    // label row
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = period2.fore || '#000000';
    ctx.globalAlpha = bucket.hasData ? 1 : 0.45;
    ctx.fillText(bucket.label, x + w / 2, LABEL_ROW_Y + LABEL_ROW_HEIGHT / 2);
    ctx.globalAlpha = 1;
    // band row: gradient fill for selected, paler for unselected/no-data
    const kind = isSelected ? selected : unselected;
    ctx.fillStyle = fillStyle(ctx, kind.back, { x, y: BAND_TOP, width: w, height: BAND_HEIGHT });
    ctx.fillRect(x, BAND_TOP + 0.5, w, BAND_HEIGHT - 1);
    if (!isSelected) {
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.fillRect(x, BAND_TOP + 0.5, w, BAND_HEIGHT - 1);
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(Math.round(x) + 0.5, BAND_TOP + 1);
    ctx.lineTo(Math.round(x) + 0.5, BAND_TOP + BAND_HEIGHT - 1);
    ctx.stroke();
  }
  const leftX = bandPixel(slicer, layout, 'left');
  const rightX = bandPixel(slicer, layout, 'right');
  if (leftX !== null) edgeCap(ctx, leftX, 'left');
  if (rightX !== null) edgeCap(ctx, rightX, 'right');
  ctx.restore();
  // Bottom scrollbar strip.
  const total = layout.buckets.length;
  const trackLeft = layout.barLeft + SCROLL_BUTTON + 2;
  const trackRight = layout.barRight - SCROLL_BUTTON - 2;
  const trackWidth = Math.max(10, trackRight - trackLeft);
  ctx.fillStyle = '#eef3f9';
  ctx.fillRect(trackLeft, SCROLL_TOP + 3, trackWidth, SCROLL_HEIGHT - 6);
  ctx.strokeStyle = '#c9d7e6';
  ctx.strokeRect(trackLeft + 0.5, SCROLL_TOP + 3.5, trackWidth - 1, SCROLL_HEIGHT - 7);
  const thumb = total > layout.capacity
    ? Math.max(28, Math.round(trackWidth * layout.capacity / total))
    : trackWidth - 1;
  const maxFirst = Math.max(1, total - layout.capacity);
  const thumbX = total > layout.capacity
    ? trackLeft + Math.round((trackWidth - thumb) * layout.first / maxFirst)
    : trackLeft;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(thumbX, SCROLL_TOP + 3, thumb, SCROLL_HEIGHT - 6);
  ctx.strokeStyle = '#adb9c6';
  ctx.strokeRect(thumbX + 0.5, SCROLL_TOP + 3.5, thumb - 1, SCROLL_HEIGHT - 7);
  scrollButton(ctx, layout.barLeft, SCROLL_TOP, 1, layout.first > 0);
  scrollButton(ctx, layout.barRight - SCROLL_BUTTON, SCROLL_TOP, -1, layout.first < total - layout.capacity);
  if (state.selected) {
    ctx.strokeStyle = '#4472c4';
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, width - 1, height - 1);
    ctx.strokeStyle = '#a8c4e4';
    ctx.strokeRect(1.5, 1.5, width - 3, height - 3);
  }
  else {
    ctx.strokeStyle = '#969696';
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, width - 1, height - 1);
  }
  ctx.restore();
}

function edgeCap(ctx: CanvasRenderingContext2D, x: number, side: 'left' | 'right'): void {
  const w = 5;
  const cx = side === 'left' ? x : x - w;
  ctx.fillStyle = '#2f6cb5';
  ctx.fillRect(cx, BAND_TOP + 0.5, w, BAND_HEIGHT - 1);
  ctx.fillStyle = '#ffffff';
  const cy = BAND_TOP + BAND_HEIGHT / 2;
  ctx.beginPath();
  if (side === 'left') {
    ctx.moveTo(cx + 3.4, cy - 2.6);
    ctx.lineTo(cx + 1.4, cy);
    ctx.lineTo(cx + 3.4, cy + 2.6);
  } else {
    ctx.moveTo(cx + 1.6, cy - 2.6);
    ctx.lineTo(cx + 3.6, cy);
    ctx.lineTo(cx + 1.6, cy + 2.6);
  }
  ctx.closePath();
  ctx.fill();
}

function scrollButton(ctx: CanvasRenderingContext2D, x: number, y: number, direction: -1 | 1, enabled: boolean): void {
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x, y + 2, SCROLL_BUTTON, SCROLL_HEIGHT - 4);
  ctx.strokeStyle = '#b7c3cf';
  ctx.strokeRect(x + 0.5, y + 2.5, SCROLL_BUTTON - 1, SCROLL_HEIGHT - 5);
  ctx.fillStyle = enabled ? '#666666' : '#c4c4c4';
  const cx = x + SCROLL_BUTTON / 2;
  const cy = y + SCROLL_HEIGHT / 2;
  ctx.beginPath();
  ctx.moveTo(cx + 2.4 * direction, cy - 3);
  ctx.lineTo(cx - 2 * direction, cy);
  ctx.lineTo(cx + 2.4 * direction, cy + 3);
  ctx.closePath();
  ctx.fill();
}

/** Own funnel glyph (trial draws one icon at the header's right edge). */
function drawFunnel(ctx: CanvasRenderingContext2D, x: number, y: number, active: boolean): void {
  ctx.save();
  ctx.strokeStyle = active ? '#4472c4' : '#7f7f7f';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(x + 2, y + 3);
  ctx.lineTo(x + 14, y + 3);
  ctx.lineTo(x + 9, y + 9);
  ctx.lineTo(x + 9, y + 14);
  ctx.lineTo(x + 7, y + 12);
  ctx.lineTo(x + 7, y + 9);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

/* ------------------------------------------------------------------ DOM view */

export interface TimelineView {
  root: HTMLElement;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  signature: string;
}

const views = new WeakMap<PivotTableTimelineSlicer, TimelineView>();

export function renderTimelineView(
  slicer: PivotTableTimelineSlicer, view: WorkbookRenderer, existing: TimelineView | undefined,
): TimelineView {
  const layer = timelineLayer(view);
  let ui = views.get(slicer) ?? existing;
  if (!ui) {
    const root = document.createElement('div');
    root.className = 'opensheets-floating-object opensheets-slicer';
    root.tabIndex = 0;
    const canvas = document.createElement('canvas');
    root.append(canvas);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Timeline canvas is unavailable');
    for (const direction of ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']) {
      const handle = document.createElement('div');
      handle.className = `opensheets-floating-handle handle-${direction}`;
      handle.dataset.direction = direction;
      root.append(handle);
    }
    attach(slicer, root);
    ui = { root, canvas, ctx, signature: '' };
    views.set(slicer, ui);
    layer.append(root);
  }
  if (ui.root.parentElement !== layer) layer.append(ui.root);
  const zoom = view.zoom;
  const width = Math.max(1, Math.round(Number(slicer.width()) * zoom));
  const height = Math.max(1, Math.round(Number(slicer.height()) * zoom));
  const left = view.headerWidth + (Number(slicer.x()) - view.scrollX) * zoom;
  const top = view.headerHeight + (Number(slicer.y()) - view.scrollY) * zoom;
  Object.assign(ui.root.style, {
    display: slicer.isVisible() === false ? 'none' : '',
    left: `${left}px`, top: `${top}px`, width: `${width}px`, height: `${height}px`, zIndex: '900',
  });
  const dpr = (typeof window !== 'undefined' ? window.devicePixelRatio : 1) || 1;
  const pixelWidth = Math.max(1, Math.round(width * dpr)) + Math.round(2 * dpr);
  const pixelHeight = Math.max(1, Math.round(height * dpr)) + Math.round(2 * dpr);
  if (ui.canvas.width !== pixelWidth || ui.canvas.height !== pixelHeight) ui.canvas.width = pixelWidth;
  if (ui.canvas.height !== pixelHeight) ui.canvas.height = pixelHeight;
  const buckets = currentBuckets(slicer);
  const signature = JSON.stringify([width, height, zoom, slicer.level(), slicer.scrollTime,
    slicer.selectedFrom, slicer.selectedTo, slicer.customProps.style, slicer.showHeader(),
    slicer.customProps.showTimeLevel, slicer.customProps.showSelectionLabel,
    slicer.captionName(), !!slicer.isSelected(), buckets.length, buckets[0]?.start, buckets[buckets.length - 1]?.end]);
  if (signature === ui.signature) return ui;
  ui.signature = signature;
  ui.ctx.setTransform(zoom * dpr, 0, 0, zoom * dpr, dpr, dpr);
  ui.ctx.clearRect(-1 / zoom, -1 / zoom, Number(slicer.width()) + 2 / zoom, Number(slicer.height()) + 2 / zoom);
  paintTimeline(ui.ctx, slicer.resolvedStyle() as SlicerStyle, slicer, {
    zoom, width: Number(slicer.width()), height: Number(slicer.height()), selected: !!slicer.isSelected(),
  });
  return ui;
}

function timelineLayer(view: WorkbookRenderer): HTMLElement {
  const holder = view as unknown as { __timelineLayer?: HTMLElement };
  let layer = holder.__timelineLayer;
  if (layer && layer.isConnected) return layer;
  layer = document.createElement('div');
  layer.className = 'opensheets-slicer-layer';
  view.root.append(layer);
  holder.__timelineLayer = layer;
  return layer;
}

function repaint(slicer: PivotTableTimelineSlicer): void {
  const ui = views.get(slicer);
  if (!ui) return;
  ui.signature = '';
  const view = slicer._sheet?._view();
  if (view) renderTimelineView(slicer, view, ui);
}

function attach(slicer: PivotTableTimelineSlicer, root: HTMLElement): void {
  root.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    const zoom = slicer._sheet?._view()?.zoom ?? 1;
    const rect = root.getBoundingClientRect();
    const x = (event.clientX - rect.left) / zoom;
    const y = (event.clientY - rect.top) / zoom;
    const handle = (event.target as HTMLElement).dataset?.direction as string | undefined;
    if (handle && slicer.allowResize() && !slicer.disableResizingAndMoving()) return; // the base handlers drive resizing
    const hit = timelineHitTest(slicer, x, y);
    event.stopPropagation();
    const buckets = currentBuckets(slicer);
    if (hit.kind === 'block' && hit.bucket) {
      const layout = timelineLayout(slicer, buckets);
      startBlockDrag(slicer, root, hit, layout, event);
    } else if (hit.kind === 'handle-left' || hit.kind === 'handle-right') {
      startHandleDrag(slicer, root, hit.kind === 'handle-left', event);
    } else if (hit.kind === 'clear' || hit.kind === 'selection') {
      slicer._clearAll();
    } else if (hit.kind === 'level') {
      const order = [TimelineLevel.years, TimelineLevel.quarters, TimelineLevel.months];
      const next = order[(order.indexOf(Number(slicer.level())) + 1) % order.length]!;
      slicer.level(next);
      const full = timelineBuckets(slicer.timelineData?.times ?? [], next);
      if (full.length) { slicer.scrollTime = full[0]!.start; slicer._selectAllExtent(); }
    } else if (hit.kind === 'left') {
      scroll(slicer, buckets, -1);
    } else if (hit.kind === 'right') {
      scroll(slicer, buckets, 1);
    }
    repaint(slicer);
  });
  root.addEventListener('keydown', event => {
    if (event.key === 'Escape') slicer.isSelected(false);
  });
}

function scroll(slicer: PivotTableTimelineSlicer, buckets: TimelineBucket[], direction: -1 | 1): void {
  const index = Math.max(0, buckets.findIndex(bucket => bucket.start >= slicer.scrollTime));
  const next = clamp(index + direction, 0, Math.max(0, buckets.length - 1));
  slicer.scrollTime = buckets[next]!.start;
}

function startBlockDrag(
  slicer: PivotTableTimelineSlicer, root: HTMLElement, hit: TimelineHit,
  layout: TimelineLayout, event: PointerEvent,
): void {
  const zoom = slicer._sheet?._view()?.zoom ?? 1;
  const index = hit.index;
  let last = index;
  const bucketAt = (x: number): number => {
    const raw = layout.first + Math.floor((x - layout.barLeft) / layout.blockWidth);
    return clamp(raw, 0, layout.buckets.length - 1);
  };
  const apply = (end: number): void => {
    const a = layout.buckets[Math.min(index, end)]!;
    const b = layout.buckets[Math.max(index, end)]!;
    slicer._selectRange(a.start, b.end);
  };
  apply(index);
  const move = (e: PointerEvent): void => {
    const rect = root.getBoundingClientRect();
    const at = bucketAt((e.clientX - rect.left) / zoom);
    if (at !== last) { last = at; apply(at); repaint(slicer); }
  };
  const up = (): void => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    repaint(slicer);
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  void event;
}

function startHandleDrag(slicer: PivotTableTimelineSlicer, root: HTMLElement, left: boolean, event: PointerEvent): void {
  const buckets = currentBuckets(slicer);
  const move = (e: PointerEvent): void => {
    const rect = root.getBoundingClientRect();
    const layout = timelineLayout(slicer, buckets);
    const raw = layout.first + Math.floor((e.clientX - rect.left - layout.barLeft) / layout.blockWidth);
    const index = clamp(raw, 0, buckets.length - 1);
    const bucket = buckets[index]!;
    if (left) slicer._selectRange(bucket.start, Math.max(slicer.selectedTo ?? bucket.end, bucket.end));
    else slicer._selectRange(Math.min(slicer.selectedFrom ?? bucket.start, bucket.start), bucket.end);
    repaint(slicer);
  };
  const up = (): void => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    repaint(slicer);
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  void event;
}
