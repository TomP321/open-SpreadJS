import { ImageExValue } from './calc/values.js';
import { canvasColor as resolveColor } from './colors.js';
import { sheetChrome } from './sheet-chrome.js';
import type { Workbook } from './workbook.js';
import type { Worksheet } from './worksheet.js';
import { Range, Style, canvasFont } from './primitives.js';
import { Events } from './events.js';
import { GeneralFormatter } from './formatter.js';
import type { AxisLayout } from './structures.js';
import { Interaction } from './interaction.js';
import { type ButtonRect } from './features/cell-extras.js';
import { drawIconGlyph } from './features/glyphs.js';
import { usingThemedDocument } from './features/tables.js';
import { ltext } from './localization.js';

import {
  axisSlots,
  columnLabel,
  element,
  tabStripGeometry,
  type AxisSlot,
  type Rect,
  type ScrollControl,
} from './rendering-geometry.js';

import {
  _paintImageValue,
  _paintPrintLines,
  _paintSheetBackground,
  cellButtons,
  clipCell,
  drawBorders,
  drawCameraOutlines,
  drawCommentIndicator,
  drawDataBar,
  drawFilterButtons,
  drawTableHandles,
  drawText,
  drawValidationHighlight,
  drawValidationUI,
  paint,
  paintBarcodes,
  text,
} from './rendering-draw.js';
import {
  drawHeaders,
  drawHorizontalTabs,
  drawOutlineButton,
  drawOutlines,
  drawSelection,
  drawVerticalTabs,
  filterButtonHit,
  outlineButtonHit,
} from './rendering-tabs.js';

export { sheetTabLabelWidth } from './rendering-tabs.js';

export {
  DEFAULT_CELL_TYPE,
  TAB_STRIP_THICKNESS,
  type AxisSlot,
  type Rect,
  type ScrollControl,
  type TabStripGeometry,
  axisSlots,
  borderWeight,
  columnLabel,
  element,
  fontMetrics,
  horizontalTabSlots,
  selectionBounds,
  strongerBorder,
  tabStripGeometry,
  verticalTabSlots,
  wrappedLines,
} from './rendering-geometry.js';



export class WorkbookRenderer {
  readonly root: HTMLDivElement;
  readonly canvas: HTMLCanvasElement;
  readonly overlay: HTMLCanvasElement;
  readonly tabs: HTMLCanvasElement;
  readonly editor: HTMLTextAreaElement;
  readonly interaction: Interaction;
  readonly context: CanvasRenderingContext2D;
  readonly selectionContext: CanvasRenderingContext2D;
  tabContext: CanvasRenderingContext2D;
  vertical: ScrollControl;
  horizontal: ScrollControl;
  observer?: ResizeObserver;
  abort = new AbortController();
  frame = 0;
  destroyed = false;
  layoutDirty = true;
  fullDirty = true;
  dirtyCells: [number, number][] = [];
  styleCache = new Map<string, Style>();
  formatters = new Map<string, GeneralFormatter>();
  floatingLayer?: HTMLElement;
  contextDepth = 0;
  paintWarnings = new Set<string>();
  width = 0; height = 0; viewWidth = 0; viewHeight = 0;
  /** Cell button currently under the pointer (drawn with its hover background). */
  hoverButton?: { row: number; col: number; index: number };
  hoverCell?: { row: number; col: number };
  viewportX = 0; viewportY = 0; tabVertical = false; tabPosition = 0; hscrollExtent = 0; tabStripOverflow = false;
  /** Tab pitch rectangles along the strip axis (x = start including its separator), used by drag-and-drop. */
  tabSlotRects: { index: number; x: number; width: number }[] = [];
  headerWidth = 40; headerHeight = 20; rowGutter = 0; colGutter = 0; zoom = 1;
  scrollX = 0; scrollY = 0;
  rows: AxisSlot[] = []; cols: AxisSlot[] = [];
  tabHits: { x: number; width: number; index: number; cross?: [number, number] }[] = [];
  copiedRange?: Range;
  currentSheet?: Worksheet;
  offsets = new WeakMap<Worksheet, [number, number]>();
  used?: { row: number; col: number };
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
    this.editor.spellcheck = false; this.editor.setAttribute('aria-label', ltext('controls.cellEditor', 'Cell editor'));
    this.vertical = this.scrollControl(true); this.horizontal = this.scrollControl(false);
    const splitter = element('div', 'gc-hscrollbar-splitter', this.root);
    splitter.addEventListener('pointerdown', e => {
      e.preventDefault(); splitter.setPointerCapture(e.pointerId);
      const move = (event: PointerEvent) => {
        if (this.tabPosition !== 0) return;
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
    // The Focus Cell bands follow the active cell, so incremental row repaints must not skip them.
    if (layout) { this.used = undefined; this.fullDirty = true; this.styleCache.clear(); }
    else if (!this.dirtyCells.length || (this.workbook.options.focusCell as { enabled?: boolean } | undefined)?.enabled) this.fullDirty = true;
    if (!this.frame) this.frame = requestAnimationFrame(() => { this.frame = 0; this.paint(); this.interaction?.commentUi.sync(); });
  }
  sizeCanvas(canvas: HTMLCanvasElement, context: CanvasRenderingContext2D, width: number, height: number): void {
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(0, Math.round(width * dpr)), h = Math.max(0, Math.round(height * dpr));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    canvas.style.width = `${width}px`; canvas.style.height = `${height}px`;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  layout(): void {
    const s = this.sheet;
    if (!s) return;
    if (s !== this.currentSheet) {
      if (this.currentSheet) this.offsets.set(this.currentSheet, [this.scrollX, this.scrollY]);
      [this.scrollX, this.scrollY] = this.offsets.get(s) ?? [0, 0];
      this.currentSheet = s; this.styleCache.clear(); this.fullDirty = true;
    }
    this.width = this.root.clientWidth; this.height = this.root.clientHeight;
    const opts = this.workbook.options;
    // TableSheet/GanttSheet tabs carry the trial's 18px bottom band instead of the classic
    // 28px tab strip + 22px scrollbar band; the trial's own scrollbars there are DOM-only
    // (fully transparent — probe t54-strip54 band/scrollbar dumps).
    const tableSheetBand = '_isTableSheet' in s;
    const geometry = tabStripGeometry(this.width, this.height, opts as Record<string, unknown>, tableSheetBand);
    this.viewportX = geometry.viewportX; this.viewportY = geometry.viewportY;
    this.viewWidth = geometry.viewWidth; this.viewHeight = geometry.viewHeight;
    this.tabVertical = geometry.vertical; this.tabPosition = geometry.position;
    this.hscrollExtent = geometry.hscrollLength;
    this.zoom = s.zoom();
    // TASK 53: a `ReportSheet` in Preview/PaginatedPreview has no header band at all (trial).
    const chrome = sheetChrome(s);
    const rowHeaders = chrome.headers && s.options.rowHeaderVisible;
    const colHeaders = chrome.headers && s.options.colHeaderVisible;
    this.rowGutter = rowHeaders ? this.outlineGutter(s.rowOutlines) : 0;
    this.colGutter = colHeaders ? this.outlineGutter(s.columnOutlines) : 0;
    this.headerWidth = rowHeaders
      ? s._columnLayout(2).prefixSum(s.getColumnCount(2)) * this.zoom + this.rowGutter
      : 0;
    this.headerHeight = colHeaders
      ? s._rowLayout(1).prefixSum(s.getRowCount(1)) * this.zoom + this.colGutter
      : 0;
    this.sizeCanvas(this.canvas, this.context, this.viewWidth, this.viewHeight);
    this.sizeCanvas(this.overlay, this.selectionContext, this.viewWidth, this.viewHeight);
    this.canvas.style.left = `${geometry.viewportX}px`; this.canvas.style.top = `${geometry.viewportY}px`;
    this.overlay.style.left = `${geometry.viewportX}px`; this.overlay.style.top = `${geometry.viewportY}px`;
    this.sizeCanvas(this.tabs, this.tabContext, geometry.stripWidth, geometry.stripHeight);
    this.tabs.style.left = `${geometry.stripX}px`;
    this.tabs.style.top = `${geometry.stripY}px`;
    const stripEdge = this.root.querySelector<HTMLElement>('.gc-tab-strip-edge')!;
    // TASK 56 (`t56-strip-geometry` DOM + canvas read-back): the trial paints the edge line inside the
    // tab-strip canvas up to the allocation, and the rest of the band (over the horizontal scrollbar)
    // carries a plain #ababab hairline that stops where the vertical scrollbar corner begins.
    Object.assign(stripEdge.style, { top: `${geometry.viewportY + this.viewHeight}px`, left: `${geometry.viewportX + geometry.stripWidth}px`, width: `${Math.max(0, this.viewWidth - geometry.stripWidth)}px`, display: opts.tabStripVisible && !tableSheetBand && geometry.stripWidth < this.viewWidth ? '' : 'none' });
    stripEdge.style.background = '#ababab';
    const split = this.root.querySelector<HTMLElement>('.gc-hscrollbar-splitter')!;
    Object.assign(split.style, { top: `${geometry.viewportY + this.viewHeight}px`, left: `${geometry.stripX + geometry.stripLength - 4}px`, height: `${geometry.stripHeight}px`, display: geometry.splitter && opts.tabStripVisible && !tableSheetBand ? '' : 'none' });
    this.vertical.root.style.display = opts.showVerticalScrollbar && !tableSheetBand ? '' : 'none';
    Object.assign(this.vertical.root.style, { left: `${geometry.viewportX + this.viewWidth + 4}px`, top: `${geometry.viewportY}px`, height: `${this.viewHeight}px` });
    this.horizontal.root.style.display = opts.showHorizontalScrollbar && !tableSheetBand ? '' : 'none';
    Object.assign(this.horizontal.root.style, { left: `${geometry.hscrollX}px`, top: `${geometry.viewportY + this.viewHeight + (opts.tabStripVisible ? 7 : 4)}px`, width: `${geometry.hscrollLength}px` });
    this.computeSlots(); this.updateScrollbars();
    this.root.setAttribute('aria-rowcount', String(s.getRowCount())); this.root.setAttribute('aria-colcount', String(s.getColumnCount()));
    this.layoutDirty = false;
  }
  outlineGutter(outline: { getMaxLevel(): number }): number {
    const max = outline.getMaxLevel();
    return max < 0 ? 0 : 21 + 17 * (max + 1);
  }
  /** Hit-test the filter dropdown buttons painted in headers/table headers. */
  filterButtonHit(x: number, y: number): { kind: 'table' | 'sheet'; col: number; table?: unknown } | null {
    return filterButtonHit(this, x, y);
  }
  /** Hit-test expand/collapse buttons in the outline gutter. */
  outlineButtonHit(x: number, y: number): { axis: 'row' | 'col'; index: number } | null {
    return outlineButtonHit(this, x, y);
  }
  /** Outline gutter sizes (CSS pixels) for the current sheet. */
  outlineGutters(): { row: number; col: number } {
    return { row: this.rowGutter, col: this.colGutter };
  }
  computeSlots(): void {
    const s = this.sheet!;
    this.rows = axisSlots(s._rowLayout(), this.headerHeight, this.viewHeight, this.scrollY, this.zoom, s.frozenRowCount(), s.frozenTrailingRowCount());
    this.cols = axisSlots(s._columnLayout(), this.headerWidth, this.viewWidth, this.scrollX, this.zoom, s.frozenColumnCount(), s.frozenTrailingColumnCount());
  }
  style(row: number, col: number): Style {
    const key = `${row}:${col}`;
    let style = this.styleCache.get(key);
    if (!style) {
      const sheet = this.sheet!;
      style = sheet.getActualStyle(row, col);
      if (sheet.cellStates._hasAny()) {
        const entries = sheet.cellStates._at(row, col);
        const requested = entries.reduce((mask, entry) => mask | entry.state, 0);
        let state = 0;
        if (this.hoverCell?.row === row && this.hoverCell.col === col) state |= 1;
        if ((requested & 2) && !sheet.isValid(row, col, sheet.getValue(row, col))) state |= 2;
        if ((requested & 4) && sheet.options.isProtected && style.locked !== false) state |= 4;
        if (this.interaction?.editingAt(row, col)) state |= 8;
        if (sheet.getActiveRowIndex() === row && sheet.getActiveColumnIndex() === col) state |= 16;
        if (sheet.getSelections().some(range => range.normalized(sheet.getRowCount(), sheet.getColumnCount()).contains(row, col))) {
          state |= 32;
        }
        for (const entry of entries) {
          if ((entry.state & state) === entry.state) Object.assign(style, entry.style);
        }
      }
      this.styleCache.set(key, style);
    }
    return style;
  }
  paint(): void {
    // The trial paints no grey right border for a Gantt chart canvas (the chart body reaches the
    // canvas edge); the 1px border stays (white) so the canvas box geometry is unchanged.
    this.canvas.classList.toggle('gc-gantt-canvas', !!this.sheet && '_isGanttSheet' in this.sheet);
    if (this.sheet?.cellStates._hasAny()) this.styleCache.clear();
    paint(this);
  }
  /** Sheet background image: tiled (`repeat`) or stretched into the sheet rect. */
  _paintSheetBackground(
    ctx: CanvasRenderingContext2D,
    image: HTMLImageElement,
    option: { layout?: string },
    x: number,
    y: number,
    width: number,
    height: number,
  ): void {
    _paintSheetBackground(this, ctx, image, option, x, y, width, height);
  }

  /** Dashed page-break lines shown when `isPrintLineVisible()` is on. */
  _paintPrintLines(ctx: CanvasRenderingContext2D, s: Worksheet, right: number, bottom: number): void {
    _paintPrintLines(this, ctx, s, right, bottom);
  }

  _paintImageValue(ctx: CanvasRenderingContext2D, value: ImageExValue, x: number, y: number, w: number, h: number): void {
    _paintImageValue(this, ctx, value, x, y, w, h);
  }

  /** Cell formulas that produce a barcode: each symbol fits and is clipped to its (merged) cell. */
  paintBarcodes(ctx: CanvasRenderingContext2D): void {
    paintBarcodes(this, ctx);
  }
  readonly _barcodeCells: { x: number; y: number; width: number; height: number; value: import('./calc/values.js').BarcodeExValue }[] = [];

  /** Green borders marking the source ranges of camera shapes on this sheet. */
  drawCameraOutlines(): void {
    drawCameraOutlines(this);
  }

  /** Table corner handles (bottom-right triangle) shown when the selection is inside the table. */
  drawTableHandles(): void {
    drawTableHandles(this);
  }
  /** Handle rectangles for table resize hit-testing (view pixels). */
  readonly _tableHandles: { name: string; x: number; y: number; size: number }[] = [];

  columnEdge(index: number): { position: number } | null {
    const s = this.sheet!;
    const layout = s._columnLayout();
    if (index < 0 || index >= layout.count) return null;
    for (const slot of this.cols) if (slot.index === index) return { position: slot.position + slot.size };
    return { position: this.headerWidth + (layout.prefixSum(index + 1) - this.scrollX) * this.zoom };
  }
  rowEdge(index: number): { position: number } | null {
    const s = this.sheet!;
    const layout = s._rowLayout();
    if (index < 0 || index >= layout.count) return null;
    for (const slot of this.rows) if (slot.index === index) return { position: slot.position + slot.size };
    return { position: this.headerHeight + (layout.prefixSum(index + 1) - this.scrollY) * this.zoom };
  }

  clipCell(ctx: CanvasRenderingContext2D, row: AxisSlot, col: AxisSlot, action: () => void): void {
    clipCell(this, ctx, row, col, action);
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
  /** Laid-out visible cell buttons of a cell in host coordinates (identical to the painted ones). */
  cellButtons(row: number, col: number): ButtonRect[] {
    return cellButtons(this, row, col);
  }
  font(style: Style): string {
    const sheet = this.sheet;
    const fonts = sheet ? sheet._themeFonts() : ['Calibri', 'Calibri'];
    // TASK 90: build the canvas value from the style's font PARTS through `canvasFont`, which
    // guarantees a valid CSS shorthand (size in CSS pixels scaled by the zoom, family quoted and
    // never missing). Handing the raw shorthand over was symptom A/B: a family-less `12pt` or a
    // size-less `bold` is invalid for `ctx.font`, Chromium ignores it and the cell is drawn in the
    // previous (default) font.
    const base = canvasFont(style, 1, `11pt ${style.themeFont === 'Heading' ? fonts[0] : fonts[1]}`);
    return canvasFont(style, this.zoom, base);
  }
  text(row: number, col: number, value: unknown, style: Style): string {
    return text(this, row, col, value, style);
  }
  drawText(ctx: CanvasRenderingContext2D, row: number, col: number, value: unknown, style: Style, rect: Rect, overflow: boolean): void {
    drawText(this, ctx, row, col, value, style, rect, overflow);
  }
  drawBorders(ctx: CanvasRenderingContext2D, row: number, col: number, style: Style, rect: Rect, span?: Range): void {
    drawBorders(this, ctx, row, col, style, rect, span);
  }
  drawHyperlinkText(ctx: CanvasRenderingContext2D, row: number, col: number, value: unknown, style: Style, rect: Rect, hyperlink: { linkColor?: string; drawUnderline?: boolean }): void {
    const linkStyle = Object.assign(new Style(), style);
    linkStyle.foreColor = hyperlink.linkColor ?? (usingThemedDocument() ? '#0563c1' : '#0000ff');
    if (hyperlink.drawUnderline !== false) linkStyle.textDecoration = 1;
    this.drawText(ctx, row, col, value, linkStyle, rect, true);
  }
  drawDataBar(ctx: CanvasRenderingContext2D, rect: Rect, bar: NonNullable<ReturnType<Worksheet['conditionalFormats']['_visualFor']>>['bar']): void {
    drawDataBar(this, ctx, rect, bar);
  }
  drawIcon(ctx: CanvasRenderingContext2D, icon: { iconSetType: number; iconIndex: number; iconOnly: boolean }, rect: Rect): number {
    // TASK 56 (measured in `t56-cf-icon-sets` and `m4-icon-sets-gallery`, 20px and 26px rows): the
    // trial anchors the 18x16 icon frame at cell + (1, 2) CSS pixels, independent of row height.
    const z = this.zoom;
    drawIconGlyph(ctx, icon.iconSetType, icon.iconIndex, Math.round(rect.x) + z, Math.round(rect.y) + 2 * z, z);
    return 18 * z;
  }
  drawCommentIndicator(ctx: CanvasRenderingContext2D, row: number, col: number, rect: Rect): void {
    drawCommentIndicator(this, ctx, row, col, rect);
  }
  drawValidationUI(ctx: CanvasRenderingContext2D, row: number, col: number, value: unknown, rect: Rect): void {
    drawValidationUI(this, ctx, row, col, value, rect);
  }
  /**
   * Paints the invalid-data highlight of a cell. The highlight type follows the
   * DataValidation.HighlightType enum: circle (0), dog-ear (1) and icon (2);
   * the icon position follows DataValidation.HighlightPosition (top-left …
   * bottom-left, outside-left (4) and outside-right (5)).
   */
  drawValidationHighlight(ctx: CanvasRenderingContext2D, style: { type?: number; color?: string; position?: number; image?: string }, rect: Rect): void {
    drawValidationHighlight(this, ctx, style, rect);
  }
  drawFilterButtons(ctx: CanvasRenderingContext2D): void {
    drawFilterButtons(this, ctx);
  }
  drawHeaders(ctx: CanvasRenderingContext2D): void {
    drawHeaders(this, ctx);
  }
  drawOutlineButton(ctx: CanvasRenderingContext2D, x: number, y: number, expand: boolean): void {
    drawOutlineButton(this, ctx, x, y, expand);
  }
  drawOutlines(ctx: CanvasRenderingContext2D): void {
    drawOutlines(this, ctx);
  }
  drawFreezeLines(ctx: CanvasRenderingContext2D): void {
    const s = this.sheet!; ctx.fillStyle = resolveColor(s.options.frozenlineColor);
    for (const [slots, count, trailing, isRow] of [[this.rows, s.frozenRowCount(), s.frozenTrailingRowCount(), true], [this.cols, s.frozenColumnCount(), s.frozenTrailingColumnCount(), false]] as const) {
      const axis = isRow ? s._rowLayout() : s._columnLayout();
      for (const boundary of [count ? slots.find(slot => slot.index >= count)?.min : undefined, trailing ? slots.find(slot => slot.index >= axis.count - trailing)?.min : undefined])
        if (boundary !== undefined) ctx.fillRect(isRow ? 0 : boundary - 1, isRow ? boundary - 1 : 0, isRow ? this.viewWidth : 1, isRow ? 1 : this.viewHeight);
    }
  }
  drawSelection(): void {
    drawSelection(this);
  }
  panes(slots: AxisSlot[]): { min: number; max: number }[] { return [...new Map(slots.map(slot => [slot.min, { min: slot.min, max: slot.max }])).values()]; }
  drawTabs(): void {
    const ctx = this.tabContext, options = this.workbook.options;
    if (!options.tabStripVisible) { this.tabStripOverflow = false; return; }
    this.tabHits = [];
    if (this.tabVertical) this.drawVerticalTabs(ctx);
    else this.drawHorizontalTabs(ctx, this.tabPosition === 1);
  }
  /** Horizontal strip. The trial mirrors the bottom strip's rows for Top and shifts its controls 15px left. */
  drawHorizontalTabs(ctx: CanvasRenderingContext2D, top: boolean): void {
    drawHorizontalTabs(this, ctx, top);
  }
  /** Left/Right strip: 22px tab pitch, horizontal text, accent bar on the outer edge. */
  drawVerticalTabs(ctx: CanvasRenderingContext2D): void {
    drawVerticalTabs(this, ctx);
  }
  scrollControl(vertical: boolean): ScrollControl {
    const root = element('div', `gc-scroll-container ${vertical ? 'gc-vertical-scrollbar' : 'gc-horizontal-scrollbar'}`, this.root);
    const track = element('div', 'gc-scrollbar-wrapper', root);
    const handle = element('div', 'gc-scroll-handle gc-scroll-bar', track);
    for (const [direction, increment] of [[vertical ? 'Up' : 'Left', -1], [vertical ? 'Down' : 'Right', 1]] as const) {
      const arrow = element('div', `gc-scroll-arrow gc-scroll-arrow${direction}`, root);
      // TASK 90 C: one arrow click moves exactly one row/column, whatever its size is. The trial
      // measured this on a sheet with a 110px first column (`.probe/t90/hbar-r1.json`): its first
      // Right click already lands on column 1, ours scrolled `defaults.colWidth` (62px) and the
      // half-scrolled column kept the reported origin at 0 — the arrow looked dead on the first
      // click. `scrollItems` snaps the offset to the item boundary, like the trial.
      arrow.addEventListener('pointerdown', event => { event.preventDefault(); this.scrollItems(vertical, increment); });
    }
    handle.addEventListener('pointerdown', event => {
      event.preventDefault();
      /* TASK 90 C: the drag must follow the pointer wherever it goes, not only while it stays
       * inside the 15px bar band (the user's pointer drifts sideways while the button is held).
       * The trial/Excel capture the drag at the document level until the button is released —
       * including releases outside the window — and scroll live on every move event. */
      const start = vertical ? event.clientY : event.clientX, old = vertical ? this.scrollY : this.scrollX;
      let captured = false;
      try { handle.setPointerCapture(event.pointerId); captured = true; } catch { captured = false; }
      const move = (e: PointerEvent) => {
        /* TASK 90 C round 2-4 (`.probe/t90/scroll2-r5-snap.json`, `hfit-r3.json`): the trial maps
         * the pointer's travelled pixels onto the scrollable ITEM-INDEX range — relative item =
         * `round(deltaPx * (lastItem - frozenLead) / (trackLen - thumbLen))` whole items — and
         * lands that whole item at the pane origin. Measured trial trails: `22/40/59/77/96` rows
         * (frozen 3, 20px steps), `19/38/57/76/95` rows (plain, 20px steps), `2/5/7/9` cols
         * (plain h, 30px steps) and `4/6/8/10` cols (frozen 2, 30px steps), identical at zoom 1
         * and 1.5 — the item mapping is zoom-invariant, which is why both zooms give the same
         * rows. Two details matter: the travel uses the DOM rects (`offsetHeight/offsetWidth` —
         * the handle's 1px border must not shrink it the way `clientHeight` did: 213 vs the
         * trial's 211, ours lagged a row per step), and the rounding is in ITEM COUNTS, not to
         * the nearest pixel boundary: the boundary snap (round 3) reproduced the uniform-row
         * trails but broke the non-uniform horizontal one (trial `2/5/7/9`, ours `2/4/6/9`). */
        const s = this.sheet!;
        const axis = vertical ? s._rowLayout() : s._columnLayout();
        const lead = vertical ? s.frozenRowCount() : s.frozenColumnCount();
        const travel = Math.max(1, vertical ? track.offsetHeight - handle.offsetHeight : track.offsetWidth - handle.offsetWidth);
        const startItem = axis.indexAtOffset(axis.prefixSum(lead) + old);
        const maxItem = axis.indexAtOffset(axis.prefixSum(lead) + this.maxScroll(vertical));
        const deltaPx = (vertical ? e.clientY : e.clientX) - start;
        const item = Math.max(lead, Math.min(maxItem, startItem + Math.round((deltaPx * (maxItem - lead)) / travel)));
        const target = axis.prefixSum(item) - axis.prefixSum(lead);
        this.setScroll(vertical ? this.scrollX : target, vertical ? target : this.scrollY);
        if (this.workbook.options.showScrollTip) handle.title = vertical ? ltext('status.rowTip', 'Row: {0}', (this.rows[0]?.index ?? 0) + 1) : ltext('status.columnTip', 'Column: {0}', columnLabel(this.cols[0]?.index ?? 0));
      };
      const stop = (): void => {
        document.removeEventListener('pointermove', move);
        document.removeEventListener('pointerup', stop);
        document.removeEventListener('pointercancel', stop);
        if (captured) { try { handle.releasePointerCapture(event.pointerId); } catch { /* already released */ } }
      };
      /* Document-level listeners catch every move/release regardless of what element the pointer
       * ends up over; the capture above routes the events to the handle (they still bubble here). */
      document.addEventListener('pointermove', move);
      document.addEventListener('pointerup', stop);
      document.addEventListener('pointercancel', stop);
    });
    track.addEventListener('pointerdown', e => {
      if (e.target === handle) return;
      const r = handle.getBoundingClientRect();
      const dir = (vertical ? e.clientY < r.top : e.clientX < r.left) ? -1 : 1;
      /* TASK 90 C round 4 (trial track click from row 3 lands on row 11 with a 171px scroll pane,
       * ours used the full viewport 231px -> row 14): the trial pages by the scrollable pane's
       * extent, the same quantity the thumb sizing uses — frozen/trailing blocks excluded. */
      const page = this.visibleExtent(vertical);
      this.scroll(vertical ? dir * page : 0, vertical ? 0 : dir * page);
    });
    return { root, track, handle };
  }
  updateScrollbars(): void {
    for (const [bar, vertical] of [[this.vertical, true], [this.horizontal, false]] as const) {
      const length = Math.max(0, (vertical ? this.viewHeight : this.hscrollExtent) - 30);
      // TASK 90 C round 2: the scroll pane's visible extent EXCLUDES the frozen blocks. The trial
      // thumb measured 15x12 on the plain 221px track but 15x10 when 3 rows are frozen
      // (`.probe/t90/scroll2-r2.json` dom dumps) — it shrinks the thumb for the scrollable pane
      // only; ours kept the whole viewport and drew 12px in both cases.
      const total = this.scrollRange(vertical), visible = this.visibleExtent(vertical);
      /* TASK 90 C round 4 (`.probe/t90/hfit-r3.json`, trial thumbs rows5 41 / rows20 12 /
       * rows40 10 / frozen 10; ours with the old `total + visible - defaultSize` denominator got
       * 42): the trial sizes the thumb `floor(track * visible / (visible + content))`, floored at
       * 10 px. Horizontal still lands 1-3 px off the trial on extreme column widths (trial 333 vs
       * ours 330 at 10px columns, 98 vs 106 at 120px) — recorded in STATUS as the remaining
       * sub-pixel-fit gap; the drag trails are quantized in ITEM units so they stay aligned. */
      const size = Math.min(length, Math.max(10, Math.floor(length * visible / Math.max(1, visible + total))));
      // The thumb stops at the track ends, and its position maps the FULL scroll range the
      // `setScroll` clamp allows (trial: thumb bottom == track bottom exactly at row 199).
      const pos = Math.max(0, Math.min(length - size, (length - size) * (vertical ? this.scrollY : this.scrollX) / Math.max(1, this.maxScroll(vertical))));
      Object.assign(bar.handle.style, vertical ? { height: `${size}px`, top: `${pos}px` } : { width: `${size}px`, left: `${pos}px` });
    }
  }
  /** Sheet pixels the scrollable pane actually shows: viewport minus chrome minus the frozen
   *  blocks (TASK 90 C round 2, the trial's frozen-bar measurements). */
  visibleExtent(vertical: boolean): number {
    const s = this.sheet!;
    const axis = vertical ? s._rowLayout() : s._columnLayout();
    const extent = (vertical ? this.viewHeight - this.headerHeight : this.viewWidth - this.headerWidth) / this.zoom;
    const trailing = vertical ? s.frozenTrailingRowCount() : s.frozenTrailingColumnCount();
    return Math.max(0, extent - axis.prefixSum(vertical ? s.frozenRowCount() : s.frozenColumnCount()) - axis.sum(axis.count - trailing, trailing));
  }
  /** Total content extent (sheet pixels) the scrollbar covers, beyond the frozen blocks. */
  scrollRange(vertical: boolean): number {
    const s = this.sheet!;
    const axis = vertical ? s._rowLayout() : s._columnLayout();
    const trailing = vertical ? s.frozenTrailingRowCount() : s.frozenTrailingColumnCount();
    return Math.max(0, this.scrollTotal(axis, vertical) - axis.prefixSum(vertical ? s.frozenRowCount() : s.frozenColumnCount()) - axis.sum(axis.count - trailing, trailing));
  }
  /** Largest scroll offset (pixels, relative to the frozen line): the trial lets the drag scroll
   *  until the LAST row/column sits at the pane origin (drag to the track end -> topRow 199 of a
   *  200-row sheet, `.probe/t90/scroll2-r2.json` dragMax); `scrollbarMaxAlign` instead keeps the
   *  last full page visible. Before TASK 90 C round 2 the clamp ignored the frozen block, so a
   *  long drag on a frozen sheet scrolled PAST the content and the viewport degraded to row 0. */
  maxScroll(vertical: boolean): number {
    const s = this.sheet!;
    const axis = vertical ? s._rowLayout() : s._columnLayout();
    const total = this.scrollRange(vertical);
    if (this.workbook.options.scrollbarMaxAlign) return Math.max(0, total - this.visibleExtent(vertical));
    return Math.max(0, total - axis.getSize(axis.indexAtOffset(Math.max(0, total - 1))));
  }
  scrollTotal(axis: AxisLayout, vertical: boolean): number {
    const count = this.workbook.options.scrollbarShowMax ? axis.count : Math.min(axis.count, ((this.used ??= this.sheet!._usedRange())[vertical ? 'row' : 'col']) + 1);
    return axis.prefixSum(count);
  }
  scroll(vPixels: number, hPixels: number): void { this.setScroll(this.scrollX + hPixels, this.scrollY + vPixels); }
  /** TASK 90 C: the trial's wheel step is a whole-item step, not a pixel step — measured
   *  `.probe/t90/wheel3-r1.json`: with explicit 40px rows and 120px columns one wheel event moves
   *  exactly 3 rows (or 3 columns for deltaX / shift+wheel) whatever deltaY is (1, 4, 20, 100, 400,
   *  1200 all give +3; -100 gives -3). A pixel-accumulator ignores the small deltas a touchpad
   *  sends: ours scrolled 0 rows for deltaY 1..20, which is the user's "the wheel does not scroll".
   *  Moves the scroll offset to the edge of the item `count` steps away from the first scrollable
   *  row/column, so the viewport origin lands exactly on an item boundary like the trial's. */
  scrollItems(vertical: boolean, count: number): void {
    const s = this.sheet;
    if (!s || !count) return;
    const axis = vertical ? s._rowLayout() : s._columnLayout();
    const leading = vertical ? s.frozenRowCount() : s.frozenColumnCount();
    const slots = vertical ? this.rows : this.cols;
    const current = slots.find((slot) => slot.index >= leading)?.index ?? leading;
    const target = Math.max(leading, Math.min(axis.count - 1, current + count));
    const offset = axis.prefixSum(target) - axis.prefixSum(leading);
    this.setScroll(vertical ? this.scrollX : offset, vertical ? offset : this.scrollY);
  }
  setScroll(x: number, y: number): void {
    const s = this.sheet; if (!s) return;
    const oldTop = this.rows.find(r => r.index >= s.frozenRowCount())?.index ?? 0;
    const oldLeft = this.cols.find(c => c.index >= s.frozenColumnCount())?.index ?? 0;
    this.scrollX = Math.max(0, Math.min(Number.isFinite(x) ? x : 0, this.maxScroll(false)));
    this.scrollY = Math.max(0, Math.min(Number.isFinite(y) ? y : 0, this.maxScroll(true)));
    this.computeSlots(); this.updateScrollbars();
    const newTop = this.rows.find(r => r.index >= s.frozenRowCount())?.index ?? 0;
    const newLeft = this.cols.find(c => c.index >= s.frozenColumnCount())?.index ?? 0;
    // Trial (TASK 75 r3): the serialised `topCellIndex`/`leftCellIndex` track the visible
    // viewport origin, so keep `settings` in sync on every scroll (JSON after showCell
    // or zoom-to-selection reports the scrolled cell, synchronously).
    s.settings.topCellIndex = newTop;
    s.settings.leftCellIndex = newLeft;
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
