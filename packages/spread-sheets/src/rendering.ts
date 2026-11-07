import { SparklineExValue } from './calc/values.js';
import { paintFormulaSparkline } from './features/sparklines.js';
import { canvasColor as resolveColor } from './colors.js';
import type { Workbook, Worksheet } from './model.js';
import { Range, Style, type LineBorder } from './primitives.js';
import { Events } from './events.js';
import { GeneralFormatter } from './formatter.js';
import type { AxisLayout } from './structures.js';
import { Interaction } from './interaction.js';
import { defaultCellType, isDefaultCellType } from './features/cell-types.js';
import { drawFilterGlyph, drawIconSet, type FilterGlyphState } from './features/glyphs.js';

const DEFAULT_CELL_TYPE = defaultCellType();
import { usingThemedDocument } from './features/tables.js';

export interface Rect { x: number; y: number; width: number; height: number }
export interface AxisSlot { index: number; position: number; size: number; min: number; max: number }

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

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, parent: HTMLElement): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag); node.className = className; parent.append(node); return node;
}
interface ScrollControl { root: HTMLDivElement; track: HTMLDivElement; handle: HTMLDivElement }

const fontMetricsCache = new Map<string, { height: number; baseline: number }>();
function fontMetrics(font: string): { height: number; baseline: number } {
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
    metrics = { height, baseline: ascent + (height % 2 ? 1.5 : 2) };
    probe.remove(); fontMetricsCache.set(font, metrics);
  }
  return metrics;
}

export class WorkbookRenderer {
  readonly root: HTMLDivElement;
  readonly canvas: HTMLCanvasElement;
  readonly overlay: HTMLCanvasElement;
  readonly tabs: HTMLCanvasElement;
  readonly editor: HTMLTextAreaElement;
  readonly interaction: Interaction;
  readonly context: CanvasRenderingContext2D;
  readonly selectionContext: CanvasRenderingContext2D;
  private tabContext: CanvasRenderingContext2D;
  private vertical: ScrollControl;
  private horizontal: ScrollControl;
  private observer?: ResizeObserver;
  private abort = new AbortController();
  private frame = 0;
  private destroyed = false;
  private layoutDirty = true;
  private fullDirty = true;
  private dirtyCells: [number, number][] = [];
  private styleCache = new Map<string, Style>();
  private formatters = new Map<string, GeneralFormatter>();
  private floatingLayer?: HTMLElement;
  private contextDepth = 0;
  private paintWarnings = new Set<string>();
  width = 0; height = 0; viewWidth = 0; viewHeight = 0;
  headerWidth = 40; headerHeight = 20; rowGutter = 0; colGutter = 0; zoom = 1;
  scrollX = 0; scrollY = 0;
  rows: AxisSlot[] = []; cols: AxisSlot[] = [];
  tabHits: { x: number; width: number; index: number }[] = [];
  copiedRange?: Range;
  private currentSheet?: Worksheet;
  private offsets = new WeakMap<Worksheet, [number, number]>();
  private used?: { row: number; col: number };
  readonly metrics = { frames: 0, lastFrameMs: 0, paintedCells: 0 };

  constructor(readonly workbook: Workbook, host: HTMLElement) {
    this.root = element('div', 'gc-spread-sheets opensheets-viewport', host);
    this.root.tabIndex = 0; this.root.setAttribute('role', 'grid'); this.root.setAttribute('aria-label', 'Spreadsheet');
    this.canvas = element('canvas', 'gc-sheet-canvas', this.root);
    this.overlay = element('canvas', 'gc-selection-canvas', this.root);
    const stripEdge = element('div', 'gc-tab-strip-edge', this.root);
    stripEdge.style.cssText = 'position:absolute;left:0;height:1px;pointer-events:none;background:linear-gradient(to right,#d1d1d1,#ababab)';
    this.tabs = element('canvas', 'gc-tab-strip', this.root);
    this.context = this.canvas.getContext('2d')!;
    const save = this.context.save.bind(this.context), restore = this.context.restore.bind(this.context);
    this.context.save = () => { this.contextDepth++; save(); };
    this.context.restore = () => { if (this.contextDepth > 0) this.contextDepth--; restore(); };
    this.selectionContext = this.overlay.getContext('2d')!;
    this.tabContext = this.tabs.getContext('2d')!;
    this.editor = element('textarea', 'gc-cell-editor', this.root); this.editor.style.display = 'none';
    this.editor.spellcheck = false; this.editor.setAttribute('aria-label', 'Cell editor');
    this.vertical = this.scrollControl(true); this.horizontal = this.scrollControl(false);
    const splitter = element('div', 'gc-hscrollbar-splitter', this.root);
    splitter.addEventListener('pointerdown', e => {
      e.preventDefault(); splitter.setPointerCapture(e.pointerId);
      const move = (event: PointerEvent) => {
        const x = event.clientX - this.root.getBoundingClientRect().left;
        workbook.options.tabStripRatio = Math.max(0.1, Math.min(0.9, x / this.viewWidth)); this.schedule(true);
      };
      splitter.addEventListener('pointermove', move);
      splitter.addEventListener('pointerup', () => splitter.removeEventListener('pointermove', move), { once: true });
    });
    this.interaction = new Interaction(this);
    if (typeof ResizeObserver !== 'undefined') { this.observer = new ResizeObserver(() => this.schedule(true)); this.observer.observe(host); }
    window.addEventListener('resize', () => this.schedule(true), { signal: this.abort.signal });
    this.schedule(true);
  }
  get sheet(): Worksheet | undefined { return this.workbook.getActiveSheet(); }
  invalidateCell(row: number, col: number): void {
    this.used = undefined;
    if (row < 0 || col < 0) { this.styleCache.clear(); this.fullDirty = true; return; }
    this.styleCache.delete(`${row}:${col}`);
    if (this.dirtyCells.length < 100) this.dirtyCells.push([row, col]); else this.fullDirty = true;
  }
  schedule(layout = false): void {
    if (this.destroyed) return;
    this.layoutDirty ||= layout;
    if (layout) { this.used = undefined; this.fullDirty = true; this.styleCache.clear(); }
    else if (!this.dirtyCells.length) this.fullDirty = true;
    if (!this.frame) this.frame = requestAnimationFrame(() => { this.frame = 0; this.paint(); });
  }
  private sizeCanvas(canvas: HTMLCanvasElement, context: CanvasRenderingContext2D, width: number, height: number): void {
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(0, Math.round(width * dpr)), h = Math.max(0, Math.round(height * dpr));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    canvas.style.width = `${width}px`; canvas.style.height = `${height}px`;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  private layout(): void {
    const s = this.sheet;
    if (!s) return;
    if (s !== this.currentSheet) {
      if (this.currentSheet) this.offsets.set(this.currentSheet, [this.scrollX, this.scrollY]);
      [this.scrollX, this.scrollY] = this.offsets.get(s) ?? [0, 0];
      this.currentSheet = s; this.styleCache.clear(); this.fullDirty = true;
    }
    this.width = this.root.clientWidth; this.height = this.root.clientHeight;
    const opts = this.workbook.options;
    this.viewWidth = Math.max(0, this.width - (opts.showVerticalScrollbar ? 22 : 0));
    this.viewHeight = Math.max(0, this.height - (opts.tabStripVisible ? 28 : opts.showHorizontalScrollbar ? 22 : 0));
    this.zoom = s.zoom();
    this.rowGutter = s.options.rowHeaderVisible ? this.outlineGutter(s.rowOutlines) : 0;
    this.colGutter = s.options.colHeaderVisible ? this.outlineGutter(s.columnOutlines) : 0;
    this.headerWidth = s.options.rowHeaderVisible
      ? s._columnLayout(2).prefixSum(s.getColumnCount(2)) * this.zoom + this.rowGutter
      : 0;
    this.headerHeight = s.options.colHeaderVisible
      ? s._rowLayout(1).prefixSum(s.getRowCount(1)) * this.zoom + this.colGutter
      : 0;
    this.sizeCanvas(this.canvas, this.context, this.viewWidth, this.viewHeight);
    this.sizeCanvas(this.overlay, this.selectionContext, this.viewWidth, this.viewHeight);
    const tabWidth = opts.tabStripVisible ? Math.round(this.viewWidth * opts.tabStripRatio) : 0;
    this.sizeCanvas(this.tabs, this.tabContext, tabWidth, opts.tabStripVisible ? 28 : 0);
    this.tabs.style.top = `${this.viewHeight}px`;
    const stripEdge = this.root.querySelector<HTMLElement>('.gc-tab-strip-edge')!;
    Object.assign(stripEdge.style, { top: `${this.viewHeight}px`, width: `${this.viewWidth}px`, display: opts.tabStripVisible ? '' : 'none' });
    const split = this.root.querySelector<HTMLElement>('.gc-hscrollbar-splitter')!;
    Object.assign(split.style, { top: `${this.viewHeight}px`, left: `${tabWidth - 4}px`, height: '28px', display: opts.tabStripVisible ? '' : 'none' });
    this.vertical.root.style.display = opts.showVerticalScrollbar ? '' : 'none';
    Object.assign(this.vertical.root.style, { left: `${this.viewWidth + 4}px`, top: '0px', height: `${this.viewHeight}px` });
    this.horizontal.root.style.display = opts.showHorizontalScrollbar ? '' : 'none';
    Object.assign(this.horizontal.root.style, { left: `${tabWidth}px`, top: `${this.viewHeight + (opts.tabStripVisible ? 7 : 4)}px`, width: `${this.viewWidth - tabWidth}px` });
    this.computeSlots(); this.updateScrollbars();
    this.root.setAttribute('aria-rowcount', String(s.getRowCount())); this.root.setAttribute('aria-colcount', String(s.getColumnCount()));
    this.layoutDirty = false;
  }
  private outlineGutter(outline: { getMaxLevel(): number }): number {
    const max = outline.getMaxLevel();
    return max < 0 ? 0 : 21 + 17 * (max + 1);
  }
  /** Hit-test the filter dropdown buttons painted in headers/table headers. */
  filterButtonHit(x: number, y: number): { kind: 'table' | 'sheet'; col: number; table?: unknown } | null {
    const s = this.sheet;
    if (!s) return null;
    const inside = (x0: number, y0: number, w: number, h: number): boolean => x >= x0 && x < x0 + w && y >= y0 && y < y0 + h;
    const geometry = (cx: number, cy: number, width: number, height: number) => {
      const w = Math.min(18, width - 4), h = Math.min(17, Math.max(6, height - 3));
      if (w < 6 || h < 6) return null;
      const bx = Math.round(cx + width - w - 2), by = Math.round(cy + height - 2 - h);
      return inside(bx, by, w, h) ? { bx, by, w, h } : null;
    };
    for (const table of s.tables.all()) {
      if (!table.showHeader()) continue;
      const header = table.headerIndex(), range = table.range();
      const rowSlot = this.rows.find((slot) => slot.index === header);
      if (!rowSlot) continue;
      for (const col of this.cols) {
        const index = col.index - range.col;
        if (index < 0 || index >= range.colCount || table.filterButtonVisible(index) === false) continue;
        if (geometry(col.position, rowSlot.position, col.size, rowSlot.size)) return { kind: 'table', col: col.index, table };
      }
    }
    const filter = s.rowFilter();
    if (filter && filter.range && this.headerHeight > 0) {
      for (const col of this.cols) {
        const index = col.index - filter.range.col;
        if (index < 0 || index >= filter.range.colCount || filter.filterButtonVisible(index) === false) continue;
        if (geometry(col.position, 0, col.size, this.headerHeight)) return { kind: 'sheet', col: col.index };
      }
    }
    return null;
  }
  /** Hit-test expand/collapse buttons in the outline gutter. */
  outlineButtonHit(x: number, y: number): { axis: 'row' | 'col'; index: number } | null {
    const s = this.sheet;
    if (!s) return null;
    for (const run of s.rowOutlines._runs()) {
      const summary = this.rows.find((slot) => slot.index === run.index + run.count);
      if (!summary) continue;
      const top = summary.position + summary.size / 2 - 9;
      if (x >= 2 && x < 20 && y >= top && y < top + 18) return { axis: 'row', index: run.index };
    }
    for (const run of s.columnOutlines._runs()) {
      const summary = this.cols.find((slot) => slot.index === run.index + run.count);
      if (!summary) continue;
      const left = summary.position + summary.size / 2 - 9;
      if (y >= 2 && y < 20 && x >= left && x < left + 18) return { axis: 'col', index: run.index };
    }
    return null;
  }
  /** Outline gutter sizes (CSS pixels) for the current sheet. */
  outlineGutters(): { row: number; col: number } {
    return { row: this.rowGutter, col: this.colGutter };
  }
  private computeSlots(): void {
    const s = this.sheet!;
    this.rows = axisSlots(s._rowLayout(), this.headerHeight, this.viewHeight, this.scrollY, this.zoom, s.frozenRowCount(), s.frozenTrailingRowCount());
    this.cols = axisSlots(s._columnLayout(), this.headerWidth, this.viewWidth, this.scrollX, this.zoom, s.frozenColumnCount(), s.frozenTrailingColumnCount());
  }
  private style(row: number, col: number): Style {
    const key = `${row}:${col}`;
    let style = this.styleCache.get(key);
    if (!style) { style = this.sheet!.getActualStyle(row, col); this.styleCache.set(key, style); }
    return style;
  }
  paint(): void {
    const s = this.sheet;
    if (this.destroyed || this.workbook.isPaintSuspended() || s?.isPaintSuspended()) return;
    const start = performance.now();
    if (this.layoutDirty || s !== this.currentSheet || this.width !== this.root.clientWidth || this.height !== this.root.clientHeight) this.layout();
    if (!s || !this.width || !this.height) return;
    if (this.styleCache.size > 15000) this.styleCache.clear();
    const ctx = this.context;
    ctx.save();
    if (!this.fullDirty && this.dirtyCells.length) {
      ctx.beginPath();
      // Whole visible row includes both old and new text overflow and shared border edges.
      for (const [row] of this.dirtyCells) {
        const slot = this.rows.find(r => r.index === row);
        if (slot) ctx.rect(this.headerWidth, Math.max(slot.min, slot.position - 3), this.viewWidth - this.headerWidth, slot.size + 6);
      }
      ctx.clip();
    }
    ctx.fillStyle = resolveColor(String(this.workbook.options.grayAreaBackColor ?? '#ababab')); ctx.fillRect(0, 0, this.viewWidth, this.viewHeight);
    const bottom = Math.min(this.viewHeight, this.headerHeight + s._rowLayout().prefixSum(s.getRowCount()) * this.zoom);
    const right = Math.min(this.viewWidth, this.headerWidth + s._columnLayout().prefixSum(s.getColumnCount()) * this.zoom);
    ctx.fillStyle = 'white'; ctx.fillRect(0, 0, right, bottom);
    const spans = s.getSpans();
    const paintedSpans = new Map<Range, Set<string>>();
    const alreadyPainted = (span: Range, row: AxisSlot, col: AxisSlot) => {
      let panes = paintedSpans.get(span);
      if (!panes) paintedSpans.set(span, panes = new Set());
      const key = `${row.min}:${col.min}`;
      if (panes.has(key)) return true;
      panes.add(key); return false;
    };
    const hasRules = s.conditionalFormats._hasRules();
    const hasComments = s.comments._hasAny();
    const hasValidations = (s as unknown as { validationRecords: unknown[] }).validationRecords.length > 0;
    this.metrics.paintedCells = 0;
    // Backgrounds and grid precede all text, allowing text to flow through empty neighbours.
    for (const row of this.rows) for (const col of this.cols) {
      const span = spans.find(span => span.contains(row.index, col.index));
      if (span) {
        if (alreadyPainted(span, row, col)) continue;
      }
      const r = span?.row ?? row.index, c = span?.col ?? col.index;
      const rect = span ? this.rangeRect(span, row, col) : { x: col.position, y: row.position, width: col.size, height: row.size };
      this.clipCell(ctx, row, col, () => {
        const style = this.style(r, c);
        ctx.fillStyle = resolveColor(typeof style.backColor === 'string' ? style.backColor : 'white');
        const hideGrid = !!style.backColor;
        ctx.fillRect(rect.x - (hideGrid ? 1 : 0), rect.y - (hideGrid ? 1 : 0), rect.width + (hideGrid ? 1 : 0), rect.height + (hideGrid ? 1 : 0));
        ctx.fillStyle = resolveColor(s.options.gridline.color);
        if (!hideGrid && s.options.gridline.showVerticalGridline) ctx.fillRect(Math.round(rect.x + rect.width) - 1, rect.y, 1, rect.height);
        if (!hideGrid && s.options.gridline.showHorizontalGridline) ctx.fillRect(rect.x, Math.round(rect.y + rect.height) - 1, rect.width, 1);
      });
    }
    paintedSpans.clear();
    for (const row of this.rows) for (const col of this.cols) {
      const span = spans.find(span => span.contains(row.index, col.index));
      if (span && alreadyPainted(span, row, col)) continue;
      const r = span?.row ?? row.index, c = span?.col ?? col.index;
      const rect = span ? this.rangeRect(span, row, col) : { x: col.position, y: row.position, width: col.size, height: row.size };
      this.clipCell(ctx, row, col, () => {
        const style = this.style(r, c), value = s.getValue(r, c);
        const visual = hasRules ? s.conditionalFormats._visualFor(r, c, value) : null;
        if (visual?.backColor) {
          ctx.fillStyle = resolveColor(visual.backColor);
          ctx.fillRect(rect.x, rect.y, rect.width - 1, rect.height - 1);
        }
        if (visual?.bar) this.drawDataBar(ctx, rect, visual.bar);
        s.getSparkline(r, c)?.paintSparkline(ctx, rect.x, rect.y, rect.width, rect.height);
        if (value instanceof SparklineExValue) paintFormulaSparkline(ctx, value, rect.x, rect.y, rect.width, rect.height);
        const cellType = style.cellType ? s.getCellType(r, c) : DEFAULT_CELL_TYPE;
        const custom = cellType && !isDefaultCellType(cellType) && cellType !== null;
        const hyperlink = s.getHyperlink(r, c) as { linkColor?: string; visitedLinkColor?: string; drawUnderline?: boolean } | null;
        let iconWidth = 0;
        if (visual?.icon) iconWidth = this.drawIcon(ctx, visual.icon, rect);
        if (custom) {
          (cellType as { paint: (ctx: CanvasRenderingContext2D, value: unknown, x: number, y: number, w: number, h: number, style: Style, context: unknown, ...rest: unknown[]) => void }).paint(
            ctx, value, rect.x, rect.y, rect.width, rect.height, style,
            { sheet: s, row: r, col: c, cellStyle: style, hyperlink },
          );
        } else if (value != null || (s.options.showFormulas && s.getFormula(r, c))) {
          if (visual?.icon?.iconOnly) {
            // Icon-only rules suppress the cell text.
          } else if (iconWidth) {
            this.drawText(ctx, r, c, value, style, { ...rect, x: rect.x + iconWidth + 2, width: Math.max(0, rect.width - iconWidth - 2) }, false);
          } else if (hyperlink && s._isFreshHyperlink(r, c)) {
            this.drawHyperlinkText(ctx, r, c, value, style, rect, hyperlink);
          } else this.drawText(ctx, r, c, value, style, rect, !span);
        }
        if (!span) {
          if (hasComments) this.drawCommentIndicator(ctx, r, c, rect);
          if (hasValidations) this.drawValidationUI(ctx, r, c, value, rect);
        }
        this.drawBorders(ctx, r, c, style, rect, span);
      });
      this.metrics.paintedCells++;
    }
    this.drawHeaders(ctx);
    if (s.tables.all().length || s.rowFilter()) this.drawFilterButtons(ctx);
    this.drawFreezeLines(ctx);
    ctx.restore();
    this.drawSelection(); this.drawTabs();
    const objects = [...s.floatingObjects.all(), ...s.pictures.all()];
    if (objects.length || this.floatingLayer) {
      if (!this.floatingLayer) this.floatingLayer = element('div', 'opensheets-floating-layer', this.root);
      this.floatingLayer.style.width = `${this.viewWidth}px`; this.floatingLayer.style.height = `${this.viewHeight}px`;
      this.floatingLayer.querySelectorAll<HTMLElement>('.opensheets-floating-object').forEach(el => el.style.display = 'none');
      objects.forEach((item, index) => item._render(this, this.floatingLayer!, index));
    }
    this.interaction.positionEditor();
    this.fullDirty = false; this.dirtyCells.length = 0;
    this.metrics.frames++; this.metrics.lastFrameMs = performance.now() - start;
  }
  private clipCell(ctx: CanvasRenderingContext2D, row: AxisSlot, col: AxisSlot, action: () => void): void {
    const previousDepth = this.contextDepth;
    ctx.save();
    try {
      ctx.beginPath(); ctx.rect(col.min, row.min, col.max - col.min, row.max - row.min); ctx.clip(); action();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!this.paintWarnings.has(message)) {
        this.paintWarnings.add(message);
        console.warn(`OpenSheets: could not paint cell ${row.index},${col.index}: ${message}`);
      }
    } finally { while (this.contextDepth > previousDepth) ctx.restore(); }
  }
  rangeRect(range: Range, row?: AxisSlot, col?: AxisSlot): Rect {
    const s = this.sheet!, rows = s._rowLayout(), cols = s._columnLayout();
    const r = row ?? this.rows.find(r => r.index === range.row) ?? this.rows[0];
    const c = col ?? this.cols.find(c => c.index === range.col) ?? this.cols[0];
    if (!r || !c) return { x: 0, y: 0, width: 0, height: 0 };
    return { x: c.position + (cols.prefixSum(range.col) - cols.prefixSum(c.index)) * this.zoom,
      y: r.position + (rows.prefixSum(range.row) - rows.prefixSum(r.index)) * this.zoom,
      width: cols.sum(range.col, range.colCount) * this.zoom, height: rows.sum(range.row, range.rowCount) * this.zoom };
  }
  cellRect(row: number, col: number): Rect {
    const span = this.sheet!.getSpan(row, col);
    return this.rangeRect(span ?? new Range(row, col, 1, 1));
  }
  font(style: Style): string {
    const base = String(style.font ?? '11pt Calibri');
    // Scale the numeric size without changing font family/fallback selection.
    return base.replace(/([\d.]+)(px|pt)/, (_, size: string, unit: string) => `${Number((Number((Number(size) * (unit === 'pt' ? 4 / 3 : 1)).toFixed(4)) * this.zoom).toFixed(4))}px`);
  }
  text(row: number, col: number, value: unknown, style: Style): string {
    const s = this.sheet!;
    if (s.options.showFormulas && s.getFormula(row, col)) return '=' + s.getFormula(row, col);
    if (value == null || (value === 0 && !s.options.showZeros)) return '';
    if (!style.formatter && !(value instanceof Date) && typeof value !== 'object') return typeof value === 'boolean' ? String(value).toUpperCase() : String(value);
    if (typeof style.formatter === 'string') {
      let formatter = this.formatters.get(style.formatter);
      if (!formatter) this.formatters.set(style.formatter, formatter = new GeneralFormatter(style.formatter));
      return formatter.format(value);
    }
    return s.getText(row, col);
  }
  private drawText(ctx: CanvasRenderingContext2D, row: number, col: number, value: unknown, style: Style, rect: Rect, overflow: boolean): void {
    const text = this.text(row, col, value, style);
    if (!text) return;
    const z = this.zoom; ctx.font = this.font(style); ctx.fillStyle = resolveColor(String(style.foreColor ?? 'black'));
    const align = style.hAlign === 3 || style.hAlign === undefined ? typeof value === 'number' || value instanceof Date ? 2 : typeof value === 'boolean' ? 1 : 0 : Number(style.hAlign);
    const indent = Number(style.textIndent ?? 0) * 8 * z;
    const pad = 1;
    let left = rect.x, right = rect.x + rect.width - 1;
    const measured = ctx.measureText(text).width;
    if (overflow && this.sheet!.options.allowCellOverflow && !style.wordWrap && !style.shrinkToFit && typeof value === 'string' && measured > rect.width - pad * 2) {
      const axis = this.sheet!._columnLayout();
      if (align !== 2) for (let c = col + 1; c < axis.count && right < this.viewWidth && right - rect.x < measured + pad; c++) {
        const neighbour = this.style(row, c);
        if (this.sheet!._columnLayout().getSize(c) === 0) continue;
        if (this.sheet!.getValue(row, c) != null || this.sheet!.getFormula(row, c) || neighbour.backColor || this.sheet!.getSpan(row, c)) break;
        right += axis.getSize(c) * z;
      }
      if (align !== 0) for (let c = col - 1; c >= 0 && left > this.headerWidth && rect.x + rect.width - left < measured + pad; c--) {
        const neighbour = this.style(row, c);
        if (this.sheet!._columnLayout().getSize(c) === 0) continue;
        if (this.sheet!.getValue(row, c) != null || this.sheet!.getFormula(row, c) || neighbour.backColor || this.sheet!.getSpan(row, c)) break;
        left -= axis.getSize(c) * z;
      }
      ctx.fillStyle = resolveColor(String(style.backColor ?? 'white')); ctx.fillRect(left, rect.y, right - left, rect.height - 1); ctx.fillStyle = resolveColor(String(style.foreColor ?? 'black'));
    }
    ctx.save(); ctx.beginPath(); ctx.rect(left, rect.y, right - left, rect.height - 1); ctx.clip();
    let fontSize = Number((ctx.font.match(/([\d.]+)px/) ?? [0, 14.6667 * z])[1]);
    const fitWidth = Math.max(1, rect.width - 2 * pad - indent);
    if (style.shrinkToFit && measured > fitWidth) { fontSize *= fitWidth / measured; ctx.font = ctx.font.replace(/[\d.]+px/, `${fontSize}px`); }
    const metrics = fontMetrics(ctx.font), lineHeight = metrics.height;
    const baseline = style.shrinkToFit && measured > fitWidth ? fontSize : metrics.baseline;
    const width = Math.max(0, rect.width - 2 * pad - indent);
    const lines = style.wordWrap ? wrappedLines(text, width, t => ctx.measureText(t).width) : text.split('\n');
    const blockHeight = lines.length * lineHeight;
    const y = style.vAlign === 2 ? rect.y + rect.height - blockHeight - 3 : style.vAlign === 1 ? rect.y + (rect.height - blockHeight - 3) / 2 : rect.y;
    ctx.textBaseline = 'alphabetic'; ctx.textAlign = align === 2 ? 'right' : align === 1 ? 'center' : 'left';
    const x = align === 2 ? rect.x + rect.width - 3 - indent : align === 1 ? rect.x + (rect.width - 1) / 2 : rect.x + pad + indent;
    for (let i = 0; i < lines.length; i++) ctx.fillText(lines[i], x, y + baseline + i * lineHeight);
    if (style.textDecoration) {
      const w = Math.min(width, measured), sx = align === 2 ? x - w : align === 1 ? x - w / 2 : x;
      ctx.fillRect(sx, Math.round(y + fontSize + 1), w, 1);
    }
    ctx.restore();
  }
  private drawBorders(ctx: CanvasRenderingContext2D, row: number, col: number, style: Style, rect: Rect, span?: Range): void {
    const endRow = row + (span?.rowCount ?? 1), endCol = col + (span?.colCount ?? 1);
    const sides: [LineBorder | undefined, number, number, number, number][] = [
      [strongerBorder(style.borderTop as LineBorder, row > 0 ? this.style(row - 1, col).borderBottom as LineBorder : undefined), rect.x - 1, rect.y - 1, rect.x + rect.width - 1, rect.y - 1],
      [strongerBorder(style.borderLeft as LineBorder, col > 0 ? this.style(row, col - 1).borderRight as LineBorder : undefined), rect.x - 1, rect.y - 1, rect.x - 1, rect.y + rect.height - 1],
      [strongerBorder(style.borderBottom as LineBorder, this.style(endRow, col).borderTop as LineBorder), rect.x - 1, rect.y + rect.height - 1, rect.x + rect.width - 1, rect.y + rect.height - 1],
      [strongerBorder(style.borderRight as LineBorder, this.style(row, endCol).borderLeft as LineBorder), rect.x + rect.width - 1, rect.y - 1, rect.x + rect.width - 1, rect.y + rect.height - 1],
    ];
    for (const [border, x1, y1, x2, y2] of sides) if (border && border.style) {
      ctx.save(); ctx.fillStyle = resolveColor(border.color);
      const z = this.zoom, horizontal = y1 === y2;
      const weight = border.style === 6 ? 1 : borderWeight(border) >= 30 ? 3 : borderWeight(border) >= 20 ? 2 : 1;
      const patterns: Record<number, number[]> = { 3: [3, 1], 4: [2, 2], 7: [1, 1], 8: [9, 3], 9: [8, 2, 2, 2], 10: [9, 3, 3, 3], 11: [9, 3, 3, 3, 3, 3], 12: [9, 3, 3, 3, 3, 3], 13: [11, 1, 5, 1] };
      const pattern = patterns[border.style];
      const boundaryRow = y1 === rect.y - 1 ? row : endRow, boundaryCol = x1 === rect.x - 1 ? col : endCol;
      const previous = horizontal
        ? col > 0 ? strongerBorder(this.style(boundaryRow - 1, col - 1).borderBottom as LineBorder, this.style(boundaryRow, col - 1).borderTop as LineBorder) : undefined
        : row > 0 ? strongerBorder(this.style(row - 1, boundaryCol - 1).borderRight as LineBorder, this.style(row - 1, boundaryCol).borderLeft as LineBorder) : undefined;
      const continuation = previous instanceof Object && (previous as LineBorder).style === border.style && (previous as LineBorder).color === border.color;
      const startOffset = !horizontal && continuation && border.style !== 13 ? z : 0;
      const length = (horizontal ? x2 - x1 : y2 - y1) + (border.style === 13 ? 0 : z);
      const paint = (offset: number, run: number, delta: number, thickness: number) => {
        const cross = Math.round((horizontal ? y1 : x1) - Math.floor(thickness / 2) * z + delta);
        ctx.fillRect(horizontal ? x1 + offset : cross, horizontal ? cross : y1 + offset + startOffset, horizontal ? run : thickness * z, horizontal ? thickness * z : run);
      };
      const line = (delta: number, thickness: number) => {
        for (let offset = 0, part = 0; offset < length - startOffset;) {
          const run = pattern ? pattern[part % pattern.length] * z : length;
          if (part % 2 === 0) paint(offset, Math.min(run, length - startOffset - offset), delta, thickness);
          offset += run; part++;
        }
      };
      if (pattern) {
        ctx.fillStyle = resolveColor(String(style.backColor ?? 'white')); paint(0, length - startOffset, 0, weight);
        // Slanted dash-dot measures its runs without the trailing cell-edge pixel.
        // Extend the backing far enough to suppress the gridline there too; vertical
        // sides only extend their leading column, like the official raster.
        if (border.style === 13) paint(length - startOffset, z, 0, horizontal ? weight : 1);
        ctx.fillStyle = resolveColor(border.color);
      }
      if (border.style === 6) { ctx.fillStyle = resolveColor(String(style.backColor ?? 'white')); paint(0, length, 0, 1); ctx.fillStyle = resolveColor(border.color); line(-z, 1); line(z, 1); }
      else if (border.style === 13) {
        for (let offset = 0, part = 0; offset < length - startOffset;) {
          const run = pattern![part % pattern!.length] * z;
          if (part % 2 === 0) paint(offset, Math.min(run - z, length - startOffset - offset), 0, 1);
          offset += run; part++;
        }
        // Slanted dash-dot has an upper row one pixel longer than the lower row.
        for (let offset = 0, part = 0; offset < length - startOffset;) {
          const run = pattern![part % pattern!.length] * z;
          if (part % 2 === 0) paint(offset, Math.min(run, length - startOffset - offset), -z, 1);
          offset += run; part++;
        }
      } else line(0, weight);
      ctx.restore();
    }
  }
  private drawHyperlinkText(ctx: CanvasRenderingContext2D, row: number, col: number, value: unknown, style: Style, rect: Rect, hyperlink: { linkColor?: string; drawUnderline?: boolean }): void {
    const linkStyle = Object.assign(new Style(), style);
    linkStyle.foreColor = hyperlink.linkColor ?? (usingThemedDocument() ? '#0563c1' : '#0000ff');
    if (hyperlink.drawUnderline !== false) linkStyle.textDecoration = 1;
    this.drawText(ctx, row, col, value, linkStyle, rect, true);
  }
  private drawDataBar(ctx: CanvasRenderingContext2D, rect: Rect, bar: NonNullable<ReturnType<Worksheet['conditionalFormats']['_visualFor']>>['bar']): void {
    if (!bar) return;
    const width = Math.max(0, Math.min(1, bar.fraction)) * (rect.width - 2);
    const left = rect.x + 1;
    ctx.save();
    ctx.beginPath();
    ctx.rect(rect.x, rect.y, rect.width - 1, rect.height - 1);
    ctx.clip();
    if (bar.gradient) {
      const gradient = ctx.createLinearGradient(left, 0, left + Math.max(1, width), 0);
      gradient.addColorStop(0, resolveColor(bar.color));
      gradient.addColorStop(1, '#ffffff');
      ctx.fillStyle = gradient;
    } else ctx.fillStyle = resolveColor(bar.color);
    ctx.fillRect(left, rect.y + 1, width, rect.height - 3);
    if (bar.showBorder) {
      ctx.strokeStyle = resolveColor(bar.borderColor ?? bar.color);
      ctx.lineWidth = 1;
      ctx.strokeRect(left + 0.5, rect.y + 1.5, width - 1, rect.height - 4);
    }
    ctx.restore();
  }
  private drawIcon(ctx: CanvasRenderingContext2D, icon: { iconSetType: number; iconIndex: number; iconOnly: boolean }, rect: Rect): number {
    const arrows = [0, 1, 10, 11, 15, 16].includes(icon.iconSetType);
    const size = Math.min((arrows || icon.iconSetType === 7 ? 16 : 18) * this.zoom, Math.max(1, rect.height - 2));
    const offset = icon.iconSetType === 3 ? 1 : icon.iconSetType === 4 ? 2 : icon.iconSetType === 13 || icon.iconSetType === 17 ? 3 : icon.iconSetType === 7 || icon.iconSetType === 6 ? 1 : 0;
    const x = Math.round(rect.x) + offset, y = Math.round(rect.y + (rect.height - size) / 2) - 1 + ([3, 6, 13, 17].includes(icon.iconSetType) ? 1 : 0);
    drawIconSet(ctx, icon.iconSetType, icon.iconIndex, x, y, size);
    return size;
  }
  private drawCommentIndicator(ctx: CanvasRenderingContext2D, row: number, col: number, rect: Rect): void {
    const sheet = this.sheet!;
    if (!sheet.comments.all().length) return;
    const comment = sheet.comments.get(row, col);
    if (!comment) return;
    const size = Number(comment.indicatorSize()) || 6;
    ctx.save();
    ctx.fillStyle = resolveColor(String(comment.indicatorColor() ?? 'red'));
    ctx.beginPath();
    ctx.moveTo(rect.x + rect.width - size, rect.y);
    ctx.lineTo(rect.x + rect.width - 1, rect.y);
    ctx.lineTo(rect.x + rect.width - 1, rect.y + size - 1);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  private drawValidationUI(ctx: CanvasRenderingContext2D, row: number, col: number, value: unknown, rect: Rect): void {
    const sheet = this.sheet!;
    const validator = sheet.getDataValidator(row, col) as { type?: () => number; inCellDropdown?: () => boolean; highlightStyle?: () => { type?: number; color?: string; position?: number } } | null;
    if (!validator) return;
    const type = typeof validator.type === 'function' ? validator.type() : 0;
    const editing = this.interaction.editingAt(row, col);
    if (editing && type === 3 && (typeof validator.inCellDropdown !== 'function' || validator.inCellDropdown())) {
      const width = Math.min(18, rect.width);
      ctx.save();
      ctx.fillStyle = '#f0f0f0';
      ctx.fillRect(rect.x + rect.width - width, rect.y, width, rect.height - 1);
      ctx.strokeStyle = '#ababab';
      ctx.strokeRect(rect.x + rect.width - width + 0.5, rect.y + 0.5, width - 1, rect.height - 2);
      ctx.fillStyle = 'black';
      const cx = rect.x + rect.width - width / 2, cy = rect.y + rect.height / 2;
      ctx.beginPath();
      ctx.moveTo(cx - 4, cy - 2);
      ctx.lineTo(cx + 4, cy - 2);
      ctx.lineTo(cx, cy + 3);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    if (this.workbook.options.highlightInvalidData && value != null && typeof sheet.isValid === 'function' && !sheet.isValid(row, col, value)) {
      const style = typeof validator.highlightStyle === 'function' ? validator.highlightStyle() : undefined;
      ctx.save();
      ctx.strokeStyle = resolveColor(style?.color ?? 'red');
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(rect.x + rect.width / 2, rect.y + rect.height / 2, rect.width / 2 + 4, rect.height / 2 + 4, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }
  private drawFilterButtons(ctx: CanvasRenderingContext2D): void {
    const sheet = this.sheet!;
    const draw = (x: number, y: number, width: number, height: number, state: FilterGlyphState) => {
      const w = Math.min(18, width - 4), h = Math.min(17, Math.max(6, height - 3));
      if (w < 6 || h < 6) return;
      const bx = Math.round(x + width - w - 2), by = Math.round(y + height - 2 - h);
      ctx.save();
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(bx, by, w, h);
      ctx.strokeStyle = '#cccccc';
      ctx.lineWidth = 1;
      ctx.strokeRect(bx + 0.5, by + 0.5, w - 1, h - 1);
      drawFilterGlyph(ctx, bx + w / 2, by + h / 2, state);
      ctx.restore();
    };
    for (const table of sheet.tables.all()) {
      if (!table.showHeader()) continue;
      const header = table.headerIndex();
      const range = table.range();
      if (header < 0) continue;
      const rowSlot = this.rows.find((slot) => slot.index === header);
      if (!rowSlot) continue;
      for (const col of this.cols) {
        const index = col.index - range.col;
        if (index < 0 || index >= range.colCount) continue;
        if (table.filterButtonVisible(index) === false) continue;
        const tableFilter = table.rowFilter();
        draw(col.position, rowSlot.position, col.size, rowSlot.size, {
          filtered: tableFilter.isFiltered(index),
          sort: tableFilter.getSortState(index),
        });
      }
    }
    const filter = sheet.rowFilter();
    if (filter && filter.range && this.headerHeight > 0) {
      const range = filter.range;
      for (const col of this.cols) {
        const index = col.index - range.col;
        if (index < 0 || index >= range.colCount) continue;
        if (filter.filterButtonVisible(index) === false) continue;
        draw(col.position, 0, col.size, this.headerHeight, {
          filtered: filter.isFiltered(index),
          sort: filter.getSortState(index),
        });
      }
    }
  }
  private drawHeaders(ctx: CanvasRenderingContext2D): void {
    const s = this.sheet!, selections = s.getSelections();
    const baseFont = Number((14.6667 * this.zoom).toFixed(4));
    ctx.font = `${baseFont}px Calibri`; ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'center';
    const columnBandTop = this.colGutter;
    const columnBandHeight = Math.max(0, this.headerHeight - this.colGutter);
    const rowBandLeft = this.rowGutter;
    const rowBandWidth = Math.max(0, this.headerWidth - this.rowGutter);
    for (const col of this.cols) if (this.headerHeight) {
      const selected = selections.some(r => r.col === -1 || (col.index >= r.col && col.index < r.col + r.colCount));
      ctx.save(); ctx.beginPath(); ctx.rect(col.min, 0, col.max - col.min, this.headerHeight); ctx.clip();
      ctx.fillStyle = selected ? '#e1e1e1' : 'white'; ctx.fillRect(col.position, columnBandTop, col.size, columnBandHeight);
      ctx.fillStyle = '#e1e6e1'; ctx.fillRect(Math.round(col.position + col.size) - 1, columnBandTop, 1, columnBandHeight);
      ctx.fillStyle = '#ababab'; ctx.fillRect(col.position, this.headerHeight - 1, col.size, 1);
      if (selected) { ctx.fillStyle = '#217346'; ctx.fillRect(col.position - 1, this.headerHeight - 2, col.size + 1, 2); }
      ctx.fillStyle = selected ? '#217346' : '#444'; ctx.font = `${selected ? 'bold ' : ''}${baseFont}px Calibri`;
      const text = s.getValue(0, col.index, 1);
      const headerFilter = s.rowFilter();
      let headerLabelWidth = col.size;
      if (headerFilter && headerFilter.range) {
        const index = col.index - headerFilter.range.col;
        if (index >= 0 && index < headerFilter.range.colCount && headerFilter.filterButtonVisible(index) !== false)
          headerLabelWidth -= Math.min(18, col.size - 4) + 2;
      }
      ctx.fillText(text == null ? columnLabel(col.index) : String(text), col.position + headerLabelWidth / 2 - 0.5, columnBandTop + fontMetrics(ctx.font).baseline + (columnBandHeight - fontMetrics(ctx.font).height - 3) / 2);
      ctx.restore();
    }
    for (const row of this.rows) if (this.headerWidth) {
      const selected = selections.some(r => r.row === -1 || (row.index >= r.row && row.index < r.row + r.rowCount));
      ctx.save(); ctx.beginPath(); ctx.rect(0, row.min, this.headerWidth, row.max - row.min); ctx.clip();
      ctx.fillStyle = selected ? '#e1e1e1' : 'white'; ctx.fillRect(rowBandLeft, row.position, rowBandWidth, row.size);
      ctx.fillStyle = '#e1e6e1'; ctx.fillRect(rowBandLeft, Math.round(row.position + row.size) - 1, rowBandWidth, 1);
      ctx.fillStyle = '#ababab'; ctx.fillRect(this.headerWidth - 1, row.position, 1, row.size);
      if (selected) { ctx.fillStyle = '#217346'; ctx.fillRect(this.headerWidth - 2, row.position - 1, 2, row.size + 1); }
      ctx.fillStyle = selected ? '#217346' : '#444'; ctx.font = `${selected ? 'bold ' : ''}${baseFont}px Calibri`;
      const text = s.getValue(row.index, 0, 2);
      ctx.fillText(text == null ? String(row.index + 1) : String(text), rowBandLeft + rowBandWidth / 2 - 0.5, row.position + fontMetrics(ctx.font).baseline + (row.size - fontMetrics(ctx.font).height - 3) / 2);
      ctx.restore();
    }
    if (this.headerWidth && this.headerHeight) {
      ctx.fillStyle = 'white'; ctx.fillRect(0, 0, this.headerWidth - 1, this.headerHeight - 1);
      ctx.fillStyle = '#e1e1e1';
      ctx.beginPath();
      if (this.rowGutter || this.colGutter) {
        const bandHeight = Math.max(0, this.headerHeight - this.colGutter);
        ctx.moveTo(this.headerWidth - 4, columnBandTop + 2);
        ctx.lineTo(this.headerWidth - 4, columnBandTop + bandHeight - 3);
        ctx.lineTo(this.headerWidth - 4 - (bandHeight - 6), columnBandTop + bandHeight - 3);
      } else {
        ctx.moveTo(this.headerWidth - 3, 2);
        ctx.lineTo(this.headerWidth - 3, this.headerHeight - 3);
        ctx.lineTo(this.headerWidth - this.headerHeight + 2, this.headerHeight - 3);
      }
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ababab';
      ctx.fillRect(this.headerWidth - 1, 0, 1, this.headerHeight);
      if (this.rowGutter) ctx.fillRect(0, this.headerHeight - 1, this.headerWidth, 1);
    }
    if (this.colGutter) {
      ctx.fillStyle = '#ababab';
      ctx.fillRect(0, this.colGutter - 1, this.viewWidth, 1);
    }
    if (this.rowGutter) {
      ctx.fillStyle = '#ababab';
      ctx.fillRect(this.rowGutter - 1, 0, 1, this.viewHeight);
    }
    if (s.rowOutlines._hasAny() || s.columnOutlines._hasAny()) this.drawOutlines(ctx);
  }
  private drawOutlineButton(ctx: CanvasRenderingContext2D, x: number, y: number, expand: boolean): void {
    const size = 18;
    ctx.save();
    ctx.fillStyle = '#ffffff'; ctx.fillRect(x, y, size, size);
    ctx.strokeStyle = '#828790'; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1);
    ctx.strokeStyle = '#404040'; ctx.lineWidth = 1;
    const cx = x + size / 2 - 0.5, cy = y + size / 2 - 0.5;
    ctx.beginPath();
    ctx.moveTo(cx - 3.5, cy); ctx.lineTo(cx + 3.5, cy);
    if (expand) { ctx.moveTo(cx, cy - 3.5); ctx.lineTo(cx, cy + 3.5); }
    ctx.stroke();
    ctx.restore();
  }
  private drawOutlines(ctx: CanvasRenderingContext2D): void {
    const s = this.sheet!;
    const rowRuns = s.rowOutlines._runs();
    const colRuns = s.columnOutlines._runs();
    const rowMax = s.rowOutlines.getMaxLevel();
    const colMax = s.columnOutlines.getMaxLevel();
    // Level buttons.
    if (this.rowGutter && this.colGutter) {
      ctx.save();
      ctx.font = `${Number((12 * this.zoom).toFixed(4))}px Calibri`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#666666';
      for (let level = 0; level <= rowMax + 1; level++) {
        const x = 2 + level * 16, y = this.colGutter + 1;
        ctx.fillStyle = '#ffffff'; ctx.fillRect(x, y, 18, 17);
        ctx.strokeStyle = '#828790'; ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, 17, 16);
        ctx.fillStyle = '#666666'; ctx.fillText(String(level + 1), x + 9, y + 8.5);
      }
      for (let level = 0; level <= colMax + 1; level++) {
        const x = this.rowGutter + 11, y = 2 + level * 16;
        ctx.fillStyle = '#ffffff'; ctx.fillRect(x, y, 17, 18);
        ctx.strokeStyle = '#828790'; ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, 16, 17);
        ctx.fillStyle = '#666666'; ctx.fillText(String(level + 1), x + 8.5, y + 9);
      }
      ctx.restore();
    }
    // Row group brackets and expand/collapse buttons.
    for (const run of rowRuns) {
      const startSlot = this.rows.find((slot) => slot.index === run.index);
      const summary = this.rows.find((slot) => slot.index === run.index + run.count);
      if (!startSlot && !summary) continue;
      const x = 11 + run.info.level * 17;
      const collapsed = !!s.rowOutlines._item(run.index)?.collapsed;
      ctx.save();
      ctx.strokeStyle = '#ababab'; ctx.lineWidth = 2;
      const top = (startSlot?.position ?? summary!.position) + 1;
      const bottom = summary ? summary.position + summary.size / 2 : (startSlot?.position ?? 0) + startSlot!.size;
      ctx.beginPath();
      ctx.moveTo(x + 5, top); ctx.lineTo(x, top); ctx.lineTo(x, bottom); ctx.stroke();
      if (summary) {
        this.drawOutlineButton(ctx, 2, summary.position + summary.size / 2 - 9, collapsed);
        ctx.fillStyle = '#ababab';
        for (const slot of this.rows)
          if (slot.index >= run.index && slot.index < run.index + run.count)
            ctx.fillRect(x + 4, slot.position + slot.size / 2 - 1, 2, 2);
      }
      ctx.restore();
    }
    // Column group brackets and buttons.
    for (const run of colRuns) {
      const startSlot = this.cols.find((slot) => slot.index === run.index);
      const summary = this.cols.find((slot) => slot.index === run.index + run.count);
      if (!startSlot && !summary) continue;
      const y = 11 + run.info.level * 17;
      const collapsed = !!s.columnOutlines._item(run.index)?.collapsed;
      ctx.save();
      ctx.strokeStyle = '#ababab'; ctx.lineWidth = 2;
      const left = (startSlot?.position ?? summary!.position) + 1;
      const right = summary ? summary.position + summary.size / 2 : (startSlot?.position ?? 0) + startSlot!.size;
      ctx.beginPath();
      ctx.moveTo(left, y + 5); ctx.lineTo(left, y); ctx.lineTo(right, y); ctx.stroke();
      if (summary) {
        this.drawOutlineButton(ctx, summary.position + summary.size / 2 - 9, 2, collapsed);
        ctx.fillStyle = '#ababab';
        for (const slot of this.cols)
          if (slot.index >= run.index && slot.index < run.index + run.count)
            ctx.fillRect(slot.position + slot.size / 2 - 1, y + 17, 2, 2);
      }
      ctx.restore();
    }
  }
  private drawFreezeLines(ctx: CanvasRenderingContext2D): void {
    const s = this.sheet!; ctx.fillStyle = resolveColor(s.options.frozenlineColor);
    for (const [slots, count, trailing, isRow] of [[this.rows, s.frozenRowCount(), s.frozenTrailingRowCount(), true], [this.cols, s.frozenColumnCount(), s.frozenTrailingColumnCount(), false]] as const) {
      const axis = isRow ? s._rowLayout() : s._columnLayout();
      for (const boundary of [count ? slots.find(slot => slot.index >= count)?.min : undefined, trailing ? slots.find(slot => slot.index >= axis.count - trailing)?.min : undefined])
        if (boundary !== undefined) ctx.fillRect(isRow ? 0 : boundary - 1, isRow ? boundary - 1 : 0, isRow ? this.viewWidth : 1, isRow ? 1 : this.viewHeight);
    }
  }
  drawSelection(): void {
    const ctx = this.selectionContext, s = this.sheet!;
    ctx.clearRect(0, 0, this.viewWidth, this.viewHeight);
    if (this.workbook.options.hideSelection) return;
    ctx.save(); ctx.beginPath(); ctx.rect(Math.max(0, this.headerWidth - 2), Math.max(0, this.headerHeight - 2), this.viewWidth, this.viewHeight); ctx.clip();
    const active = this.cellRect(s.getActiveRowIndex(), s.getActiveColumnIndex());
    for (const selection of s.getSelections()) {
      const range = selectionBounds(selection.normalized(s.getRowCount(), s.getColumnCount()), s.getSpans());
      for (const rowPane of this.panes(this.rows)) for (const colPane of this.panes(this.cols)) {
        const r = this.rows.find(r => r.index >= range.row && r.index < range.row + range.rowCount && r.min === rowPane.min);
        const c = this.cols.find(c => c.index >= range.col && c.index < range.col + range.colCount && c.min === colPane.min);
        if (!r || !c) continue;
        const rect = this.rangeRect(range, r, c);
        ctx.save(); ctx.beginPath(); ctx.rect(Math.max(this.headerWidth - 2, colPane.min - 2), Math.max(this.headerHeight - 2, rowPane.min - 2), colPane.max - colPane.min + 3, rowPane.max - rowPane.min + 3); ctx.clip();
        if (range.rowCount > 1 || range.colCount > 1) {
          ctx.fillStyle = resolveColor(String(s.options.selectionBackColor ?? 'rgba(0,0,0,0.185)'));
          const inset = s.getSelections().length > 1 ? 1 : 0;
          ctx.fillRect(rect.x + inset, rect.y + inset, rect.width - 1 - inset * 2, rect.height - 1 - inset * 2);
          ctx.clearRect(active.x, active.y, active.width, active.height);
        }
        ctx.strokeStyle = resolveColor(s.getSelections().length > 1 ? 'white' : String(s.options.selectionBorderColor ?? '#217346')); ctx.lineWidth = s.getSelections().length > 1 ? 1 : 2;
        if (s.getSelections().length === 1) ctx.strokeRect(Math.round(rect.x) - 1, Math.round(rect.y) - 1, Math.round(rect.width) + 1, Math.round(rect.height) + 1);
        const inTable = !!this.sheet!._tableAt(s.getActiveRowIndex(), s.getActiveColumnIndex());
        if (!inTable && s.getSelections().length === 1 && this.workbook.options.allowUserDragFill && range.rowCount < s.getRowCount() && range.colCount < s.getColumnCount()) {
          ctx.fillStyle = 'white'; ctx.fillRect(rect.x + rect.width - 5, rect.y + rect.height - 5, 7, 7);
          ctx.fillStyle = resolveColor(String(s.options.selectionBorderColor ?? '#217346')); ctx.fillRect(rect.x + rect.width - 3, rect.y + rect.height - 3, 5, 5);
        }
        ctx.restore();
      }
    }
    if (s.getSelections().length > 1) { ctx.strokeStyle = resolveColor(String(s.options.selectionBorderColor ?? '#217346')); ctx.lineWidth = 1; ctx.strokeRect(active.x + 1.5, active.y + 1.5, active.width - 4, active.height - 4); }
    if (this.copiedRange && this.workbook.options.cutCopyIndicatorVisible) {
      const rect = this.rangeRect(this.copiedRange); ctx.strokeStyle = resolveColor(this.workbook.options.cutCopyIndicatorBorderColor); ctx.lineWidth = 1; ctx.setLineDash([4, 3]); ctx.lineDashOffset = -(performance.now() / 120 % 7);
      ctx.strokeRect(rect.x - 1, rect.y - 1, rect.width, rect.height);
    }
    ctx.restore();
  }
  private panes(slots: AxisSlot[]): { min: number; max: number }[] { return [...new Map(slots.map(slot => [slot.min, { min: slot.min, max: slot.max }])).values()]; }
  private drawTabs(): void {
    const ctx = this.tabContext, width = Number.parseFloat(this.tabs.style.width), options = this.workbook.options;
    if (!options.tabStripVisible) return;
    ctx.clearRect(0, 0, width, 28); ctx.fillStyle = '#f6f6f6'; ctx.fillRect(0, 0, width, 28);
    const edge = ctx.createLinearGradient(0, 0, this.viewWidth, 0); edge.addColorStop(0, '#d1d1d1'); edge.addColorStop(1, '#ababab');
    ctx.fillStyle = edge; ctx.fillRect(0, 0, width, 1);
    this.tabHits = [];
    if (options.tabNavigationVisible) {
      for (const [x, reverse] of [[28, true], [57, false]] as const) { const start = this.workbook.startSheetIndex(); const available = this.workbook.sheets.some((sheet, index) => !!sheet.visible() && (reverse ? index < start : index > start)); ctx.fillStyle = resolveColor(available ? '#217346' : '#bfbfbf'); ctx.beginPath(); ctx.moveTo(x + (reverse ? 2 : -2), 11); ctx.lineTo(x + (reverse ? -2 : 2), 14); ctx.lineTo(x + (reverse ? 2 : -2), 17); ctx.fill(); this.tabHits.push({ x: x - 12, width: 24, index: reverse ? -2 : -3 }); }
    }
    ctx.font = 'bold 10pt "Segoe UI"';
    const overflow = this.workbook.sheets.reduce((sum, sheet) => sum + Math.ceil(ctx.measureText(sheet.name()).width + 26), 0) > width - (options.tabNavigationVisible ? 114 : 0) - 81;
    const list = options.tabNavigationVisible && (options.allSheetsListVisible === 1 || (options.allSheetsListVisible === 2 && overflow));
    if (list) { ctx.fillStyle = '#217346'; for (let y = 9; y <= 19; y += 5) ctx.fillRect(71, y, 15, 2); this.tabHits.push({ x: 66, width: 26, index: -4 }); }
    let x = options.tabNavigationVisible ? list ? 114 : 99 : 0;
    ctx.font = 'bold 10pt "Segoe UI"'; ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
    const active = this.workbook.getActiveSheetIndex();
    for (let i = this.workbook.startSheetIndex(); i < this.workbook.sheets.length; i++) {
      const sheet = this.workbook.sheets[i]; if (!sheet.visible()) continue;
      ctx.font = `${i === active ? 'bold ' : ''}10pt "Segoe UI"`;
      const w = i === active ? Math.round(ctx.measureText(sheet.name()).width + 26) : Math.ceil(ctx.measureText(sheet.name()).width + 25);
      if (x + w > width - 40) break;
      const selected = i === active;
      ctx.fillStyle = selected ? 'white' : '#f6f6f6'; ctx.fillRect(x, 0, w, 25);
      if (selected && sheet.options.sheetTabColor) { const gradient = ctx.createLinearGradient(0, 14, 0, 24); gradient.addColorStop(0, '#ffffff'); gradient.addColorStop(1, resolveColor(sheet.options.sheetTabColor)); ctx.fillStyle = gradient; ctx.fillRect(x + 1, 14, w - 2, 10); }
      if (!selected && sheet.options.sheetTabColor) { ctx.fillStyle = resolveColor(sheet.options.sheetTabColor); ctx.fillRect(x + 2, 3, w - 4, 22); }
      if (selected) { ctx.fillStyle = '#ababab'; ctx.fillRect(x, 0, 1, 25); ctx.fillRect(x + w - 1, 0, 1, 25); }
      if (selected) { ctx.fillStyle = '#217346'; ctx.fillRect(x, 23, w, 2); }
      ctx.fillStyle = selected ? '#217346' : sheet.options.sheetTabColor ? 'white' : '#444'; ctx.font = `${selected ? 'bold ' : ''}10pt "Segoe UI"`; ctx.textAlign = 'left'; ctx.fillText(sheet.name(), x + (selected ? 13 : 12), 13); ctx.textAlign = 'center';
      this.tabHits.push({ x, width: w, index: i }); x += w;
    }
    if (options.newTabVisible) {
      if (overflow) { ctx.fillStyle = '#217346'; ctx.font = 'bold 10pt "Segoe UI"'; ctx.fillText('...', width - 71, 13); this.tabHits.push({ x: width - 84, width: 25, index: -4 }); }
      const cx = overflow ? width - 44 : Math.min(width - 20, x + 41); ctx.strokeStyle = '#7f7f7f'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(cx, 14, 6.5, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#7f7f7f'; ctx.fillRect(cx - 3.5, 13, 7, 2); ctx.fillRect(cx - 1, 10.5, 2, 7);
      this.tabHits.push({ x: cx - 12, width: 24, index: -1 });
    }
    ctx.fillStyle = '#217346'; for (let y = 10; y <= 20; y += 4) ctx.fillRect(width - 15, y, 2, 2);
  }
  private scrollControl(vertical: boolean): ScrollControl {
    const root = element('div', `gc-scroll-container ${vertical ? 'gc-vertical-scrollbar' : 'gc-horizontal-scrollbar'}`, this.root);
    const track = element('div', 'gc-scrollbar-wrapper', root);
    const handle = element('div', 'gc-scroll-handle gc-scroll-bar', track);
    for (const [direction, increment] of [[vertical ? 'Up' : 'Left', -1], [vertical ? 'Down' : 'Right', 1]] as const) {
      const arrow = element('div', `gc-scroll-arrow gc-scroll-arrow${direction}`, root);
      arrow.addEventListener('pointerdown', e => { e.preventDefault(); this.scroll(vertical ? increment * this.sheet!.defaults.rowHeight : 0, vertical ? 0 : increment * this.sheet!.defaults.colWidth); });
    }
    handle.addEventListener('pointerdown', event => {
      event.preventDefault(); handle.setPointerCapture(event.pointerId);
      const start = vertical ? event.clientY : event.clientX, old = vertical ? this.scrollY : this.scrollX;
      const move = (e: PointerEvent) => {
        const axis = vertical ? this.sheet!._rowLayout() : this.sheet!._columnLayout();
        const extent = vertical ? this.viewHeight - this.headerHeight : this.viewWidth - this.headerWidth;
        const trackLength = vertical ? track.clientHeight - handle.clientHeight : track.clientWidth - handle.clientWidth;
        const delta = ((vertical ? e.clientY : e.clientX) - start) * Math.max(0, this.scrollTotal(axis, vertical) - extent / this.zoom) / Math.max(1, trackLength);
        this.setScroll(vertical ? this.scrollX : old + delta, vertical ? old + delta : this.scrollY);
        if (this.workbook.options.showScrollTip) handle.title = vertical ? `Row: ${this.rows[0]?.index + 1}` : `Column: ${columnLabel(this.cols[0]?.index ?? 0)}`;
      };
      handle.addEventListener('pointermove', move);
      handle.addEventListener('pointerup', () => handle.removeEventListener('pointermove', move), { once: true });
    });
    track.addEventListener('pointerdown', e => {
      if (e.target === handle) return;
      const r = handle.getBoundingClientRect();
      const dir = (vertical ? e.clientY < r.top : e.clientX < r.left) ? -1 : 1;
      this.scroll(vertical ? dir * (this.viewHeight - this.headerHeight) / this.zoom : 0, vertical ? 0 : dir * (this.viewWidth - this.headerWidth) / this.zoom);
    });
    return { root, track, handle };
  }
  private updateScrollbars(): void {
    const s = this.sheet!;
    for (const [bar, axis, extent, offset, vertical] of [[this.vertical, s._rowLayout(), this.viewHeight - this.headerHeight, this.scrollY, true], [this.horizontal, s._columnLayout(), this.viewWidth - this.headerWidth, this.scrollX, false]] as const) {
      const length = Math.max(0, (vertical ? this.viewHeight : this.viewWidth - Number.parseFloat(this.tabs.style.width)) - 30);
      const total = this.scrollTotal(axis, vertical), visible = extent / this.zoom;
      const size = Math.min(length, Math.max(20, Math.floor(length * visible / Math.max(visible, total + (this.workbook.options.scrollbarShowMax && !this.workbook.options.scrollbarMaxAlign ? visible - axis.defaultSize : 0)))));
      const pos = Math.max(0, (length - size) * offset / Math.max(1, total - visible));
      Object.assign(bar.handle.style, vertical ? { height: `${size}px`, top: `${pos}px` } : { width: `${size}px`, left: `${pos}px` });
    }
  }
  private scrollTotal(axis: AxisLayout, vertical: boolean): number {
    const count = this.workbook.options.scrollbarShowMax ? axis.count : Math.min(axis.count, ((this.used ??= this.sheet!._usedRange())[vertical ? 'row' : 'col']) + 1);
    return axis.prefixSum(count);
  }
  scroll(vPixels: number, hPixels: number): void { this.setScroll(this.scrollX + hPixels, this.scrollY + vPixels); }
  setScroll(x: number, y: number): void {
    const s = this.sheet; if (!s) return;
    const oldTop = this.rows.find(r => r.index >= s.frozenRowCount())?.index ?? 0;
    const oldLeft = this.cols.find(c => c.index >= s.frozenColumnCount())?.index ?? 0;
    const max = (axis: AxisLayout, extent: number, vertical: boolean) => this.workbook.options.scrollbarMaxAlign ? Math.max(0, this.scrollTotal(axis, vertical) - extent / this.zoom) : Math.max(0, this.scrollTotal(axis, vertical) - axis.getSize(axis.indexAtOffset(Math.max(0, this.scrollTotal(axis, vertical) - 1))));
    this.scrollX = Math.max(0, Math.min(x, max(s._columnLayout(), this.viewWidth - this.headerWidth, false)));
    this.scrollY = Math.max(0, Math.min(y, max(s._rowLayout(), this.viewHeight - this.headerHeight, true)));
    this.computeSlots(); this.updateScrollbars();
    const newTop = this.rows.find(r => r.index >= s.frozenRowCount())?.index ?? 0;
    const newLeft = this.cols.find(c => c.index >= s.frozenColumnCount())?.index ?? 0;
    if (newTop !== oldTop) s._emit(Events.TopRowChanged, { sheet: s, sheetName: s.name(), viewportIndex: 1, oldTopRow: oldTop, newTopRow: newTop });
    if (newLeft !== oldLeft) s._emit(Events.LeftColumnChanged, { sheet: s, sheetName: s.name(), viewportIndex: 1, oldLeftCol: oldLeft, newLeftCol: newLeft });
    this.fullDirty = true; this.schedule();
  }
  showCell(row: number, col: number, vertical = 3, horizontal = 3): void {
    const s = this.sheet!;
    const offset = (axis: AxisLayout, index: number, origin: number, extent: number, current: number, leading: number, position: number) => {
      if (index < leading) return current;
      const start = axis.prefixSum(index) - axis.prefixSum(leading), size = axis.getSize(index), available = (extent - origin) / this.zoom - axis.prefixSum(leading);
      if (position === 0) return start;
      if (position === 1) return start - (available - size) / 2;
      if (position === 2) return start - available + size;
      return start < current ? start : start + size > current + available ? start + size - available : current;
    };
    this.setScroll(offset(s._columnLayout(), col, this.headerWidth, this.viewWidth, this.scrollX, s.frozenColumnCount(), horizontal), offset(s._rowLayout(), row, this.headerHeight, this.viewHeight, this.scrollY, s.frozenRowCount(), vertical));
  }
  hitTest(x: number, y: number): { row: number; col: number; sheetArea: number } | null {
    if (x < 0 || y < 0 || x >= this.viewWidth || y >= this.viewHeight) return null;
    const row = y < this.headerHeight ? -1 : this.rows.find(r => y >= Math.max(r.min, r.position) && y < Math.min(r.max, r.position + r.size))?.index;
    const col = x < this.headerWidth ? -1 : this.cols.find(c => x >= Math.max(c.min, c.position) && x < Math.min(c.max, c.position + c.size))?.index;
    if (row === undefined || col === undefined) return null;
    return { row, col, sheetArea: row < 0 && col < 0 ? 0 : row < 0 ? 1 : col < 0 ? 2 : 3 };
  }
  destroy(): void {
    this.destroyed = true; cancelAnimationFrame(this.frame); this.observer?.disconnect(); this.abort.abort(); this.interaction.destroy(); this.root.remove();
  }
}
