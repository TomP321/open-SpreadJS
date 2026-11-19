/**
 * Pure geometry/text helpers of the canvas renderer (tab strip, axis
 * slots, selection bounds, text wrapping, borders, font metrics). Moved
 * out of `rendering.ts` unchanged; `rendering.ts` re-exports them so
 * existing import paths keep working.
 */
import { Range, type LineBorder } from './primitives.js';
import type { AxisLayout } from './structures.js';
import { defaultCellType } from './features/cell-types.js';

export const DEFAULT_CELL_TYPE = defaultCellType();
export interface Rect { x: number; y: number; width: number; height: number }
export interface AxisSlot { index: number; position: number; size: number; min: number; max: number }

/** Host-area split between the viewport, the tab strip and the scrollbar bands (TabStripPosition). */
export interface TabStripGeometry {
  position: number;
  vertical: boolean;
  viewportX: number; viewportY: number;
  viewWidth: number; viewHeight: number;
  stripX: number; stripY: number; stripWidth: number; stripHeight: number;
  /** Length of the tab strip along its own axis. */
  stripLength: number;
  /** Horizontal scrollbar origin and length in host coordinates. */
  hscrollX: number; hscrollLength: number;
  /** The tabStripRatio splitter only exists while the strip sits at the bottom. */
  splitter: boolean;
}

export const TAB_STRIP_THICKNESS = 28;
/** Trial (probes .probe/t54/probe-t54-strip54.json, gantt-grid): a TableSheet/GanttSheet tab
 *  carries its own bottom band — 18px strip canvas (the trial reserves exactly 18px on the
 *  right edge and 18px for the band; the classic 28px strip / 22px scrollbar bands do not apply). */
export const TABLE_SHEET_BAND_THICKNESS = 18;

export function tabStripGeometry(width: number, height: number, options: Record<string, unknown>, tableSheetBand = false): TabStripGeometry {
  const visible = options.tabStripVisible !== false;
  const thickness = tableSheetBand ? TABLE_SHEET_BAND_THICKNESS : TAB_STRIP_THICKNESS;
  const position = visible ? Number(options.tabStripPosition ?? 0) : 0;
  const vertical = position === 2 || position === 3;
  const top = position === 1;
  const stripWidth = Math.max(80, Number(options.tabStripWidth) || 80);
  const viewWidth = Math.max(0, width - (vertical ? stripWidth : 0) - (tableSheetBand ? TABLE_SHEET_BAND_THICKNESS : options.showVerticalScrollbar ? 22 : 0));
  const band = visible ? thickness : options.showHorizontalScrollbar ? 22 : 0;
  const viewHeight = Math.max(0, height - (top ? thickness : 0) - band);
  const viewportX = position === 2 ? stripWidth : 0;
  const viewportY = top ? thickness : 0;
  const tabLength = vertical ? height : top ? viewWidth : Math.round(viewWidth * Number(options.tabStripRatio ?? 0.5));
  const stripX = position === 3 ? width - stripWidth : 0;
  const stripY = top || vertical ? 0 : viewportY + viewHeight;
  const strip = visible
    ? { stripX, stripY, stripWidth: vertical ? stripWidth : tabLength, stripHeight: vertical ? height : thickness, stripLength: tabLength }
    : { stripX: 0, stripY: viewportY + viewHeight, stripWidth: 0, stripHeight: 0, stripLength: 0 };
  const hscrollLength = strip.stripWidth === 0 || vertical || top ? viewWidth : Math.max(0, viewWidth - strip.stripLength);
  return {
    position: visible ? position : 0, vertical: visible && vertical,
    viewportX, viewportY, viewWidth, viewHeight, ...strip,
    hscrollX: viewportX + (visible && !vertical && !top ? strip.stripLength : 0), hscrollLength,
    splitter: visible && position === 0,
  };
}

/** Horizontal tab placement: every tab is preceded by a 1px separator (trial pitch w+1). */
export function horizontalTabSlots(start: number, widths: number[], limit: number): { slots: { index: number; x: number; width: number }[]; end: number } {
  const slots: { index: number; x: number; width: number }[] = [];
  let x = start;
  for (let i = 0; i < widths.length && x <= limit; i++) {
    slots.push({ index: i, x: x + 1, width: widths[i] });
    x += widths[i] + 1;
  }
  return { slots, end: x };
}

/** Vertical tabs run in a fixed 22px pitch (21px body + 1px separator) from y=29; the bottom 30px band belongs to the navigation arrows. */
export function verticalTabSlots(length: number, start = 29): { index: number; y: number }[] {
  return Array.from({ length: Math.max(0, Math.floor((length - start - 21 - 30) / 22) + 1) }, (_, i) => ({ index: i, y: start + i * 22 }));
}

/** A selected merged cell occupies its full displayed rectangle. */
export function selectionBounds(selection: Range, spans: Range[]): Range {
  let result = selection;
  let changed = true;
  while (changed) {
    changed = false;
    for (const span of spans) {
      if (span.row >= result.row + result.rowCount || result.row >= span.row + span.rowCount ||
          span.col >= result.col + result.colCount || result.col >= span.col + span.colCount) continue;
      const row = Math.min(result.row, span.row), col = Math.min(result.col, span.col);
      const rows = Math.max(result.row + result.rowCount, span.row + span.rowCount) - row;
      const cols = Math.max(result.col + result.colCount, span.col + span.colCount) - col;
      if (row !== result.row || col !== result.col || rows !== result.rowCount || cols !== result.colCount) {
        result = new Range(row, col, rows, cols); changed = true;
      }
    }
  }
  return result;
}

/** Layout visits visible items only, including independently clipped frozen panes. */
export function axisSlots(axis: AxisLayout, origin: number, extent: number, offset: number, zoom: number, leading: number, trailing: number): AxisSlot[] {
  const slots: AxisSlot[] = [];
  leading = Math.min(leading, axis.count); trailing = Math.min(trailing, axis.count - leading);
  const leadEnd = Math.min(extent, origin + axis.prefixSum(leading) * zoom);
  const trailStart = Math.max(leadEnd, extent - axis.sum(axis.count - trailing, trailing) * zoom);
  const append = (start: number, end: number, position: number, min: number, max: number) => {
    for (let i = start; i < end && position < max; i++) {
      const size = axis.getSize(i) * zoom;
      if (size > 0 && position + size > min) slots.push({ index: i, position, size, min, max });
      position += size;
      if (!size) i = Math.max(i, axis.indexAtOffset(axis.prefixSum(i)) - 1);
    }
  };
  append(0, leading, origin, origin, leadEnd);
  const start = Math.max(leading, axis.indexAtOffset(axis.prefixSum(leading) + offset));
  append(start, axis.count - trailing, leadEnd + (axis.prefixSum(start) - axis.prefixSum(leading) - offset) * zoom, leadEnd, trailStart);
  append(axis.count - trailing, axis.count, trailStart, trailStart, extent);
  return slots;
}
export function columnLabel(index: number): string {
  let name = '';
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + (n - 1) % 26) + name;
  return name;
}
export function borderWeight(border?: LineBorder): number {
  return !border || !border.style ? 0 : border.style === 6 ? 40 : [5].includes(border.style) ? 30 : [2, 8, 10, 12, 13].includes(border.style) ? 20 : border.style === 7 ? 5 : 10;
}
export function strongerBorder(first?: LineBorder, second?: LineBorder): LineBorder | undefined {
  return borderWeight(second) > borderWeight(first) ? second : first;
}
export function wrappedLines(text: string, width: number, measure: (text: string) => number): string[] {
  const result: string[] = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const token of paragraph.match(/\S+\s*|\s+/g) ?? ['']) {
      if (line && measure(line + token.trimEnd()) > width) { result.push(line.trimEnd()); line = ''; }
      if (measure(token.trimEnd()) <= width) line += token;
      else for (const char of token) {
        if (line && measure(line + char) > width) { result.push(line); line = ''; }
        line += char;
      }
    }
    result.push(line.trimEnd());
  }
  return result;
}

export function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, parent: HTMLElement): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag); node.className = className; parent.append(node); return node;
}
export interface ScrollControl { root: HTMLDivElement; track: HTMLDivElement; handle: HTMLDivElement }

const fontMetricsCache = new Map<string, { height: number; baseline: number }>();
export function fontMetrics(font: string): { height: number; baseline: number } {
  let metrics = fontMetricsCache.get(font);
  if (!metrics) {
    const probe = document.createElement('span');
    probe.textContent = 'Mg';
    probe.style.cssText = `position:absolute;visibility:hidden;white-space:pre;font:${font};line-height:normal`;
    document.body.append(probe);
    const height = probe.offsetHeight;
    // Measure at a large size to remove device-scale-dependent font hinting.
    const context = document.createElement('canvas').getContext('2d')!;
    context.font = font.replace(/([\d.]+)(px|pt)/, (_, size: string, unit: string) => `${Number(size) * 64}${unit}`);
    const ascent = Math.round(context.measureText('Mg').fontBoundingBoxAscent / 64);
    // TASK 56 (`m7-structure` banner scan): a 22px block (14pt Calibri) sits 1px higher in the trial
    // than the even-height +2 rule gives — the bottom-aligned banner baseline is ascent+1 there.
    metrics = { height, baseline: ascent + (height % 2 ? 1.5 : height === 22 ? 1 : 2) };
    probe.remove(); fontMetricsCache.set(font, metrics);
  }
  return metrics;
}
