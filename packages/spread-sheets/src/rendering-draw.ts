/**
 * Cell painting of the canvas renderer: the viewport paint pass, sheet
 * background, print lines, image/barcode values, cell buttons and text,
 * borders, data bars, comment indicators and validation UI. Bodies moved
 * out of `rendering.ts` unchanged (`this` renamed to the `renderer`
 * parameter); the class keeps thin delegating methods.
 */

import { BarcodeExValue, ImageExValue, SparklineExValue } from './calc/values.js';
import { sheetChrome } from './sheet-chrome.js';
import { drawBarcode } from './features/barcode.js';
import { barcodePaintValue } from './features/barcode-args.js';
import { cachedImage } from './features/image-cache.js';
import { paintFormulaSparkline } from './features/sparklines.js';
import { workbookSparklineOf } from './features/sparkline-ex.js';
import { canvasColor as resolveColor, mixColor, withAlpha } from './colors.js';
import { Range, Style, type LineBorder } from './primitives.js';
import { GeneralFormatter } from './formatter.js';
import { isDefaultCellType } from './features/cell-types.js';
import { applyInsets, buttonBands, drawButton, drawDecoration, drawWatermark, layoutButtons, parseInsets, visibleButtons, type ButtonRect } from './features/cell-extras.js';
import { drawFilterGlyph, type FilterGlyphState } from './features/glyphs.js';
import { getPrintLines } from './print-doc.js';
import type { Worksheet } from './worksheet.js';
import {
  DEFAULT_CELL_TYPE,
  borderWeight,
  element,
  fontMetrics,
  strongerBorder,
  wrappedLines,
  type AxisSlot,
  type Rect,
} from './rendering-geometry.js';
import type { WorkbookRenderer } from './rendering.js';
import { asRecord } from './object-access.js';

/** @internal Worksheet members the painter uses; mounted by the feature modules (TASK 80 seam). */
interface WorksheetPaintHooks {
  validationRecords: unknown[];
  _renderValue(row: number, col: number): unknown;
  _paintChart(renderer: unknown, ctx: CanvasRenderingContext2D): void;
  _ganttTextNudge?(row: number): number;
  _isGanttSheet?: boolean;
}
const paintHooks = (sheet: Worksheet): WorksheetPaintHooks => sheet as unknown as WorksheetPaintHooks;

export function paint(renderer: WorkbookRenderer, ): void {
    const s = renderer.sheet;
    if (renderer.destroyed || renderer.workbook.isPaintSuspended() || s?.isPaintSuspended()) return;
    const start = performance.now();
    if (renderer.layoutDirty || s !== renderer.currentSheet || renderer.width !== renderer.root.clientWidth || renderer.height !== renderer.root.clientHeight) renderer.layout();
    if (!s || !renderer.width || !renderer.height) return;
    if (renderer.styleCache.size > 15000) renderer.styleCache.clear();
    const ctx = renderer.context;
    ctx.save();
    if (!renderer.fullDirty && renderer.dirtyCells.length) {
      ctx.beginPath();
      // Whole visible row includes both old and new text overflow and shared border edges.
      for (const [row] of renderer.dirtyCells) {
        const slot = renderer.rows.find(r => r.index === row);
        if (slot) ctx.rect(renderer.headerWidth, Math.max(slot.min, slot.position - 3), renderer.viewWidth - renderer.headerWidth, slot.size + 6);
      }
      ctx.clip();
    }
    ctx.fillStyle = '_isTableSheet' in s ? 'white' : resolveColor(String(renderer.workbook.options.grayAreaBackColor ?? '#ababab')); ctx.fillRect(0, 0, renderer.viewWidth, renderer.viewHeight);
    const bottom = Math.min(renderer.viewHeight, renderer.headerHeight + s._rowLayout().prefixSum(s.getRowCount()) * renderer.zoom);
    const right = Math.min(renderer.viewWidth, renderer.headerWidth + s._columnLayout().prefixSum(s.getColumnCount()) * renderer.zoom);
    ctx.fillStyle = 'white'; ctx.fillRect(0, 0, right, bottom);
    const bgInfo = s.getBackgroundImageInfo ? s.getBackgroundImageInfo() : { backgroundImage: null, option: {} };
    const bgSrc = bgInfo.backgroundImage;
    const bgImage = bgSrc && bgInfo.option.paintOrder !== 'over-content' ? cachedImage(bgSrc, () => renderer.schedule()) : null;
    if (bgImage) renderer._paintSheetBackground(ctx, bgImage, bgInfo.option, 0, 0, right, bottom);
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
    const hasComments = s.comments._hasAny() || s.threadedComments._hasAny();
    const hasValidations = paintHooks(s).validationRecords.length > 0;
    // A ReportSheet in Preview/PaginatedPreview paints no cell gridlines (see src/sheet-chrome.ts).
    const chrome = sheetChrome(s);
    const showGridlines = chrome.gridlines;
    // Focus Cell: tint the active row/column (Excel-like crosshair highlight).
    const focus = renderer.workbook.options.focusCell as { enabled?: boolean; color?: string; opacity?: number } | undefined;
    const focusActive = !!focus?.enabled;
    const focusRow = s.getActiveRowIndex(), focusCol = s.getActiveColumnIndex();
    const focusAlpha = Math.max(0, Math.min(1, focus?.opacity ?? 0.225));
    const focusFill = focusActive ? withAlpha(String(focus?.color ?? '#00b050'), focusAlpha) : '';
    renderer.metrics.paintedCells = 0;
    // Backgrounds and grid precede all text, allowing text to flow through empty neighbours.
    const paintBackground = (row: AxisSlot, col: AxisSlot, span: Range | undefined): void => {
      const r = span?.row ?? row.index, c = span?.col ?? col.index;
      const rect = span ? renderer.rangeRect(span, row, col) : { x: col.position, y: row.position, width: col.size, height: row.size };
      renderer.clipCell(ctx, row, col, () => {
        const style = renderer.style(r, c);
        ctx.fillStyle = resolveColor(typeof style.backColor === 'string' ? style.backColor : 'white');
        const hideGrid = !!style.backColor;
        // A table-sheet stripe merges sideways (the trial shows no vertical edge inside a striped
        // row) but never paints over the blue row-boundary line above it.
        const up = hideGrid && '_isTableSheet' in s ? 0 : hideGrid ? 1 : 0;
        ctx.fillRect(rect.x - (hideGrid ? 1 : 0), rect.y - up, rect.width + (hideGrid ? 1 : 0), rect.height + (hideGrid ? 1 : 0));
        if (focusFill && (row.index === focusRow || col.index === focusCol) && !(row.index === focusRow && col.index === focusCol)) {
          ctx.fillStyle = focusFill;
          ctx.fillRect(rect.x - (hideGrid ? 1 : 0), rect.y - (hideGrid ? 1 : 0), rect.width + (hideGrid ? 1 : 0), rect.height + (hideGrid ? 1 : 0));
        }
        ctx.fillStyle = resolveColor(s.options.gridline.color);
        if (!hideGrid && showGridlines && s.options.gridline.showVerticalGridline) ctx.fillRect(Math.round(rect.x + rect.width) - 1, rect.y, 1, rect.height);
        if (!hideGrid && showGridlines && s.options.gridline.showHorizontalGridline) ctx.fillRect(rect.x, Math.round(rect.y + rect.height) - 1, rect.width, 1);
        if ('_isGanttSheet' in s) {
          // The trial Gantt grid paints plain black cell edges on every column; the row edges sit
          // on the first pixel of the row (equal to the previous row's bottom, measured y = 40+30n).
          ctx.fillStyle = '#000';
          ctx.fillRect(Math.round(rect.x + rect.width) - 1, rect.y, 1, rect.height);
          ctx.fillRect(rect.x, Math.round(rect.y), rect.width, 1);
        } else if ('_isTableSheet' in s) {
          const grouped = s as typeof s & { _groupColumnCount(): number };
          if (col.index < grouped._groupColumnCount()) {
            ctx.fillStyle = '#000';
            ctx.fillRect(Math.round(rect.x + rect.width) - 1, rect.y, 1, rect.height);
          } else {
            // Trial: every horizontal boundary under the header band is the blue row line
            // (measured #4f81bd at 29/59/89/119...); only the white (odd) rows also close a
            // black right edge — striped rows run borderless sideways.
            ctx.fillStyle = '#4d89ce';
            ctx.fillRect(rect.x, Math.round(rect.y + rect.height) - 1, rect.width, 1);
            if (row.index % 2) ctx.fillRect(Math.round(rect.x + rect.width) - 1, rect.y, 1, rect.height);
          }
        }
      });
    };
    const spanOf = (row: AxisSlot, col: AxisSlot) => spans.find(span => span.contains(row.index, col.index));
    for (const row of renderer.rows) for (const col of renderer.cols) {
      if (spanOf(row, col)) continue;
      paintBackground(row, col, undefined);
    }
    // Merged spans are filled after every plain cell. The trial lets a span's background take the
    // gridline pixels on its top and left edges for the whole extent it covers (measured task 56:
    // the span at rows 3-5 / column B paints gold over the A/B gridline at x=101 for all its
    // rows, while painting it cell by cell leaves the gridlines of the rows below the anchor).
    for (const row of renderer.rows) for (const col of renderer.cols) {
      const span = spanOf(row, col);
      if (!span || alreadyPainted(span, row, col)) continue;
      paintBackground(row, col, span);
    }
    paintedSpans.clear();
    if (s.isPrintLineVisible()) renderer._paintPrintLines(ctx, s, right, bottom);
    for (const row of renderer.rows) for (const col of renderer.cols) {
      const span = spans.find(span => span.contains(row.index, col.index));
      if (span && alreadyPainted(span, row, col)) continue;
      const r = span?.row ?? row.index, c = span?.col ?? col.index;
      const rect = span ? renderer.rangeRect(span, row, col) : { x: col.position, y: row.position, width: col.size, height: row.size };
      renderer.clipCell(ctx, row, col, () => {
        // Gantt sheets paint real Dates on their date columns (formatter text + `#####` overflow).
        const style = renderer.style(r, c);
        const value = '_renderValue' in s
          ? paintHooks(s)._renderValue(r, c)
          : s.getValue(r, c);
        // cellPadding insets the content box; cell buttons then claim the remaining edges.
        const content = applyInsets(rect, parseInsets(style.cellPadding), renderer.zoom);
        const isEditing = !span && !!renderer.interaction?.editingAt(r, c);
        const buttons = Array.isArray(style.cellButtons) && style.cellButtons.length
          ? visibleButtons(asRecord(style), { active: !span && s.getActiveRowIndex() === r && s.getActiveColumnIndex() === c, editing: isEditing })
          : [];
        const laid = buttons.length ? layoutButtons(buttons, content, renderer.font(style), renderer.zoom) : [];
        const bands = laid.length ? buttonBands(laid) : { left: 0, right: 0 };
        const textRect: Rect = laid.length
          ? { x: content.x + bands.left, y: content.y, width: Math.max(0, content.width - bands.left - bands.right), height: content.height }
          : content;
        const visual = hasRules ? s.conditionalFormats._visualFor(r, c, value) : null;
        if (visual?.backColor) {
          ctx.fillStyle = resolveColor(visual.backColor);
          ctx.fillRect(rect.x, rect.y, rect.width - 1, rect.height - 1);
        }
        if (visual?.bar) renderer.drawDataBar(ctx, rect, visual.bar);
        s.getSparkline(r, c)?.paintSparkline(ctx, rect.x, rect.y, rect.width, rect.height);
        if (value instanceof SparklineExValue) {
          const owner = workbookSparklineOf(s, value.name);
          if (owner) owner.paint(ctx, value.value, rect.x, rect.y, rect.width, rect.height);
          else paintFormulaSparkline(ctx, value, rect.x, rect.y, rect.width, rect.height, s);
        }
        if (value instanceof BarcodeExValue) { renderer._barcodeCells.push({ x: rect.x, y: rect.y, width: rect.width, height: rect.height, value }); return; }
        if (value instanceof ImageExValue) { renderer._paintImageValue(ctx, value, rect.x, rect.y, rect.width, rect.height); return; }
        const cellType = style.cellType ? s.getCellType(r, c) : DEFAULT_CELL_TYPE;
        const custom = cellType && !isDefaultCellType(cellType) && cellType !== null;
        const hyperlink = s.getHyperlink(r, c) as { linkColor?: string; visitedLinkColor?: string; drawUnderline?: boolean } | null;
        let iconWidth = 0;
        if (visual?.icon) iconWidth = renderer.drawIcon(ctx, visual.icon, rect);
        if (custom) {
          (cellType as { paint: (ctx: CanvasRenderingContext2D, value: unknown, x: number, y: number, w: number, h: number, style: Style, context: unknown, ...rest: unknown[]) => void }).paint(
            ctx, value, textRect.x, textRect.y, textRect.width, textRect.height, style,
            { sheet: s, row: r, col: c, cellStyle: style, hyperlink },
          );
        } else if (value != null || (s.options.showFormulas && s.getFormula(r, c))) {
          if (visual?.icon?.iconOnly || visual?.bar?.barOnly) {
            // Icon-only rules and `showBarOnly` data bars suppress the cell text.
          } else if (iconWidth) {
            renderer.drawText(ctx, r, c, value, style, { ...textRect, x: textRect.x + iconWidth + 2, width: Math.max(0, textRect.width - iconWidth - 2) }, false);
          } else if (hyperlink && s._isFreshHyperlink(r, c)) {
            renderer.drawHyperlinkText(ctx, r, c, value, style, textRect, hyperlink);
          } else renderer.drawText(ctx, r, c, value, style, textRect, !span);
        }
        if (style.watermark) drawWatermark(ctx, asRecord(style), content, renderer.zoom, value != null, renderer.font(style));
        if (!span) {
          if (hasComments) renderer.drawCommentIndicator(ctx, r, c, rect);
          if (hasValidations) renderer.drawValidationUI(ctx, r, c, value, rect);
        }
        renderer.drawBorders(ctx, r, c, style, rect, span);
        if (style.decoration) drawDecoration(ctx, asRecord(style), rect, renderer.zoom, () => renderer.schedule());
        for (const item of laid)
          drawButton(ctx, item, renderer.font(style), renderer.zoom, !!renderer.hoverButton && renderer.hoverButton.row === r && renderer.hoverButton.col === c && renderer.hoverButton.index === item.button.index);
      });
      renderer.metrics.paintedCells++;
    }
    const bgOver = bgSrc ? cachedImage(bgSrc, () => renderer.schedule()) : null;
    if (bgOver && bgInfo.option.paintOrder === 'over-content') renderer._paintSheetBackground(ctx, bgOver, bgInfo.option, 0, 0, right, bottom);
    renderer.drawHeaders(ctx);
    if ('_isGanttSheet' in s)
      paintHooks(s)._paintChart(renderer, ctx);
    if (s.tables.all().length || s.rowFilter()) renderer.drawFilterButtons(ctx);
    renderer.drawFreezeLines(ctx);
    ctx.restore();
    renderer.drawSelection(); renderer.drawTabs();
    renderer.drawCameraOutlines();
    renderer.drawTableHandles();
    if (renderer._barcodeCells.length) { renderer.paintBarcodes(ctx); renderer._barcodeCells.length = 0; }
    const objects = [...s.floatingObjects.all(), ...s.pictures.all(), ...s.shapes.all(), ...s.charts.all(), ...(s.dataCharts?.all() ?? [])];
    if (objects.length || renderer.floatingLayer) {
      if (!renderer.floatingLayer) renderer.floatingLayer = element('div', 'opensheets-floating-layer', renderer.root);
      renderer.floatingLayer.style.width = `${renderer.viewWidth}px`; renderer.floatingLayer.style.height = `${renderer.viewHeight}px`;
      renderer.floatingLayer.style.left = `${renderer.viewportX}px`; renderer.floatingLayer.style.top = `${renderer.viewportY}px`;
      renderer.floatingLayer.querySelectorAll<HTMLElement>('.opensheets-floating-object').forEach(el => el.style.display = 'none');
      objects.forEach((item, index) => item._render(renderer, renderer.floatingLayer!, index));
    }
    renderer.interaction.positionEditor();
    renderer.fullDirty = false; renderer.dirtyCells.length = 0;
    renderer.metrics.frames++; renderer.metrics.lastFrameMs = performance.now() - start;
}

export function _paintSheetBackground(renderer: WorkbookRenderer,
    ctx: CanvasRenderingContext2D,
    image: HTMLImageElement,
    option: { layout?: string },
    x: number,
    y: number,
    width: number,
    height: number,
  ): void {
    if (!image.complete || !image.naturalWidth || width <= 0 || height <= 0) return;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, width, height);
    ctx.clip();
    if (option.layout === 'repeat') {
      const pattern = ctx.createPattern(image, 'repeat');
      if (pattern) {
        ctx.fillStyle = pattern;
        ctx.fillRect(x, y, width, height);
        ctx.restore();
        return;
      }
    }
    ctx.drawImage(image, x, y, width, height);
    ctx.restore();
}

export function _paintPrintLines(renderer: WorkbookRenderer, ctx: CanvasRenderingContext2D, s: Worksheet, right: number, bottom: number): void {
    const lines = getPrintLines(s);
    if (!lines.rows.length && !lines.cols.length) return;
    const z = renderer.zoom;
    const rows = s._rowLayout(), cols = s._columnLayout();
    ctx.save();
    ctx.strokeStyle = '#a0a0a0';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    for (const row of lines.rows) {
      const y = Math.round(renderer.headerHeight + rows.prefixSum(row) * z) + 0.5;
      ctx.moveTo(renderer.headerWidth, y);
      ctx.lineTo(Math.max(renderer.headerWidth, right), y);
    }
    for (const col of lines.cols) {
      const x = Math.round(renderer.headerWidth + cols.prefixSum(col) * z) + 0.5;
      ctx.moveTo(x, renderer.headerHeight);
      ctx.lineTo(x, Math.max(renderer.headerHeight, bottom));
    }
    ctx.stroke();
    ctx.restore();
}

export function _paintImageValue(renderer: WorkbookRenderer, ctx: CanvasRenderingContext2D, value: ImageExValue, x: number, y: number, w: number, h: number): void {
    const src = String(value.value.src ?? '');
    if (!src) return;
    const image = cachedImage(src, () => renderer.schedule());
    if (!image || !image.complete || !image.naturalWidth) return;
    const sizing = Number(value.value.sizing ?? 0);
    const target = sizing === 1
      ? { x, y, w, h }
      : (() => {
        const scale = Math.min((w - 2) / image.naturalWidth, (h - 2) / image.naturalHeight, sizing === 0 ? 1 : Infinity);
        const width = (value.value.width ? Number(value.value.width) : image.naturalWidth * scale);
        const height = (value.value.height ? Number(value.value.height) : image.naturalHeight * scale);
        return { x: x + (w - width) / 2, y: y + (h - height) / 2, w: width, h: height };
      })();
    ctx.save();
    ctx.beginPath(); ctx.rect(x - 1, y - 1, w + 2, h + 2); ctx.clip();
    ctx.drawImage(image, target.x, target.y, target.w, target.h);
    ctx.restore();
}

export function paintBarcodes(renderer: WorkbookRenderer, ctx: CanvasRenderingContext2D): void {
    ctx.save();
    for (const cell of renderer._barcodeCells) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(cell.x, cell.y, cell.width, cell.height);
      ctx.clip();
      // TASK 46: the stored value is the trial's argument record; the paint record is
      // derived from it here (features/barcode-args.ts).
      const spec = barcodePaintValue(cell.value);
      if (!spec) { ctx.restore(); continue; }
      if (spec.symbology === 'QRCODE' && !String(spec.data ?? '')) {
        // The trial renders eight hash characters for an empty QR payload.
        ctx.fillStyle = resolveColor(String(spec.color ?? '#000000'));
        ctx.font = `${Math.max(8, cell.height - 6)}px Arial, sans-serif`;
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';
        ctx.fillText('########', cell.x + 2, cell.y + cell.height / 2);
        ctx.restore();
        continue;
      }
      drawBarcode(ctx, spec, cell.x, cell.y, cell.width, cell.height, cell.width);
      ctx.restore();
    }
    ctx.restore();
}

export function drawCameraOutlines(renderer: WorkbookRenderer, ): void {
    const s = renderer.sheet;
    if (!s) return;
    const cameras = s.shapes.all().filter(shape => shape.isCamera());
    if (!cameras.length) return;
    const ctx = renderer.selectionContext;
    ctx.save();
    ctx.strokeStyle = '#00913d';
    ctx.lineWidth = 2;
    for (const camera of cameras) {
      const rect = camera._cameraRange(renderer);
      if (!rect) continue;
      const x0 = Math.max(0, rect.x0), y0 = Math.max(0, rect.y0);
      const x1 = Math.min(renderer.viewWidth, rect.x1), y1 = Math.min(renderer.viewHeight, rect.y1);
      if (x1 > x0 && y1 > y0) ctx.strokeRect(x0 + 1, y0 + 1, x1 - x0 - 2, y1 - y0 - 2);
    }
    ctx.restore();
}

export function drawTableHandles(renderer: WorkbookRenderer, ): void {
    const s = renderer.sheet;
    if (!s) { renderer._tableHandles.length = 0; return; }
    const ctx = renderer.selectionContext;
    const selections = s.getSelections().map(r => r.normalized(s.getRowCount(), s.getColumnCount()));
    renderer._tableHandles.length = 0;
    for (const table of s.tables.all()) {
      const range = table.range();
      if (!range) continue;
      if (!selections.some(sel => sel.intersect(range.row, range.col, range.rowCount, range.colCount))) continue;
      const right = renderer.columnEdge(range.col + range.colCount - 1);
      const bottom = renderer.rowEdge(range.row + range.rowCount - 1);
      if (!right || !bottom) continue;
      if (right.position < renderer.headerWidth || bottom.position < renderer.headerHeight || right.position > renderer.viewWidth || bottom.position > renderer.viewHeight) continue;
      const size = 8;
      const x = Math.min(right.position, renderer.viewWidth) - size;
      const y = Math.min(bottom.position, renderer.viewHeight) - size;
      ctx.save();
      ctx.fillStyle = '#4472c4';
      ctx.beginPath();
      ctx.moveTo(x, y + size); ctx.lineTo(x + size, y + size); ctx.lineTo(x + size, y); ctx.closePath();
      ctx.fill();
      ctx.restore();
      renderer._tableHandles.push({ name: String(table.name()), x, y, size });
    }
}

export function clipCell(renderer: WorkbookRenderer, ctx: CanvasRenderingContext2D, row: AxisSlot, col: AxisSlot, action: () => void): void {
    const previousDepth = renderer.contextDepth;
    ctx.save();
    try {
      ctx.beginPath(); ctx.rect(col.min, row.min, col.max - col.min, row.max - row.min); ctx.clip(); action();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!renderer.paintWarnings.has(message)) {
        renderer.paintWarnings.add(message);
        console.warn(`OpenSheets: could not paint cell ${row.index},${col.index}: ${message}`);
      }
    } finally { while (renderer.contextDepth > previousDepth) ctx.restore(); }
}

export function cellButtons(renderer: WorkbookRenderer, row: number, col: number): ButtonRect[] {
    const s = renderer.sheet;
    if (!s) return [];
    const style = renderer.style(row, col);
    if (!Array.isArray(style.cellButtons) || !style.cellButtons.length) return [];
    const span = s.getSpan(row, col);
    const rect = renderer.cellRect(row, col);
    const content = applyInsets(rect, parseInsets(style.cellPadding), renderer.zoom);
    const buttons = visibleButtons(asRecord(style), {
      active: !span && s.getActiveRowIndex() === row && s.getActiveColumnIndex() === col,
      editing: !!renderer.interaction && renderer.interaction.editingAt(row, col),
    });
    return buttons.length ? layoutButtons(buttons, content, renderer.font(style), renderer.zoom) : [];
}

export function text(renderer: WorkbookRenderer, row: number, col: number, value: unknown, style: Style): string {
    const s = renderer.sheet!;
    if (s.options.showFormulas && s.getFormula(row, col)) return '=' + s.getFormula(row, col);
    if (value == null || (value === 0 && !s.options.showZeros)) return '';
    if (!style.formatter && !(value instanceof Date) && typeof value !== 'object') return typeof value === 'boolean' ? String(value).toUpperCase() : String(value);
    if (typeof style.formatter === 'string') {
      let formatter = renderer.formatters.get(style.formatter);
      if (!formatter) renderer.formatters.set(style.formatter, formatter = new GeneralFormatter(style.formatter));
      return formatter.format(value);
    }
    return s.getText(row, col);
}

export function drawText(renderer: WorkbookRenderer, ctx: CanvasRenderingContext2D, row: number, col: number, value: unknown, style: Style, rect: Rect, overflow: boolean): void {
    const text = renderer.text(row, col, value, style);
    if (!text) return;
    const z = renderer.zoom; ctx.font = renderer.font(style); ctx.fillStyle = resolveColor(String(style.foreColor ?? 'black'));
    const align = style.hAlign === 3 || style.hAlign === undefined ? typeof value === 'number' || value instanceof Date ? 2 : typeof value === 'boolean' ? 1 : 0 : Number(style.hAlign);
    const indent = Number(style.textIndent ?? 0) * 8 * z;
    const tableSheet = '_isTableSheet' in renderer.sheet!;
    // The trial Gantt grid right-aligns numbers with a wider (8px) right inset than the plain
    // table sheet's 6 (measured: '1' ink ends at x91 vs the column line at x99).
    const ganttSheet = '_isGanttSheet' in renderer.sheet!;
    const pad = tableSheet ? 6 * z : 1;
    let left = rect.x, right = rect.x + rect.width - 1;
    const measured = ctx.measureText(text).width;
    // Trial vertical text (`isVerticalText`, task 56 `t56-alignment` capture): one upright glyph per
    // line, pen at cell.x + 6, first baseline cell.y + 14, pitch 17 (11pt, top-anchored, clipped).
    if (style.isVerticalText && !Number(style.textOrientation)) {
      ctx.save(); ctx.beginPath(); ctx.rect(rect.x, rect.y, rect.width - 1, rect.height - 1); ctx.clip();
      ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
      for (let i = 0; i < text.length; i++) {
        const yBase = rect.y + 15 * z + i * 17 * z;
        if (yBase - 12 * z > rect.y + rect.height) break;
        ctx.fillText(text[i], rect.x + 6 * z + indent, yBase);
      }
      ctx.restore();
      return;
    }
    // Trial rotated text (`textOrientation`, task 56 `.probe/t56/probe-t56-rot.json`, isolated 140px
    // cells): baseline start P0 = (cell.x + 1.9 + 13.2*sin(th), cell.y + 14.9 + W*sin(th) -
    // 11.1*sin(th)) for th <= 45deg; for 90deg the pen sits at (cell.right - 11, cell.y + W) reading
    // bottom-to-top, top-anchored. Fitted against 'ab' / 'rotated 45' / 'rot 90 text' at 30/45/90deg;
    // clipped to the cell (outsideInk = 0 in every probe; the 20px-row 90deg cell clips the tail).
    const orientation = Number(style.textOrientation ?? 0);
    if (orientation) {
      const rad = (orientation * Math.PI) / 180, sn = Math.sin(rad);
      const verticalFamily = orientation >= 67.5;
      // Anchor fine-tuned against the `t56-alignment` capture pair (trial vs ours bbox diff).
      const p0x = verticalFamily ? rect.x + rect.width - 7 * z : rect.x + (0.4 + 13.2 * sn) * z;
      const p0y = verticalFamily ? rect.y + measured + 1 * z : rect.y + (17.4 - 11.1 * sn) * z + measured * sn;
      ctx.save(); ctx.beginPath(); ctx.rect(rect.x, rect.y, rect.width - 1, rect.height - 1); ctx.clip();
      ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
      ctx.save(); ctx.translate(p0x, p0y); ctx.rotate(-rad);
      for (const line of String(text).split('\n')) ctx.fillText(line, 0, 0);
      ctx.restore();
      ctx.restore();
      return;
    }
    if (overflow && align !== 4 && align !== 5 && align !== 6 && renderer.sheet!.options.allowCellOverflow && !style.wordWrap && !style.shrinkToFit && typeof value === 'string' && measured > rect.width - pad * 2) {
      const axis = renderer.sheet!._columnLayout();
      if (align !== 2) for (let c = col + 1; c < axis.count && right < renderer.viewWidth && right - rect.x < measured + pad; c++) {
        const neighbour = renderer.style(row, c);
        if (renderer.sheet!._columnLayout().getSize(c) === 0) continue;
        if (renderer.sheet!.getValue(row, c) != null || renderer.sheet!.getFormula(row, c) || neighbour.backColor || renderer.sheet!.getSpan(row, c)) break;
        right += axis.getSize(c) * z;
      }
      if (align !== 0) for (let c = col - 1; c >= 0 && left > renderer.headerWidth && rect.x + rect.width - left < measured + pad; c--) {
        const neighbour = renderer.style(row, c);
        if (renderer.sheet!._columnLayout().getSize(c) === 0) continue;
        if (renderer.sheet!.getValue(row, c) != null || renderer.sheet!.getFormula(row, c) || neighbour.backColor || renderer.sheet!.getSpan(row, c)) break;
        left -= axis.getSize(c) * z;
      }
      ctx.fillStyle = resolveColor(String(style.backColor ?? 'white')); ctx.fillRect(left, rect.y, right - left, rect.height - 1); ctx.fillStyle = resolveColor(String(style.foreColor ?? 'black'));
    }
    ctx.save(); ctx.beginPath(); ctx.rect(left, rect.y, right - left, rect.height - 1); ctx.clip();
    let fontSize = Number((ctx.font.match(/([\d.]+)px/) ?? [0, 14.6667 * z])[1]);
    const fitWidth = Math.max(1, rect.width - 2 * pad - indent);
    // The trial ignores `shrinkToFit` for distributed alignment (task 56 `t56-alignment` row 7:
    // the distributed text keeps its font size and its tail word is dropped).
    if (style.shrinkToFit && align !== 5 && measured > fitWidth) { fontSize *= fitWidth / measured; ctx.font = ctx.font.replace(/[\d.]+px/, `${fontSize}px`); }
    const metrics = fontMetrics(ctx.font), lineHeight = metrics.height;
    const baseline = style.shrinkToFit && measured > fitWidth ? fontSize : metrics.baseline;
    const width = Math.max(0, rect.width - 2 * pad - indent);
    // The trial shows a number/date whose text does not fit as a run of '#' filling the
    // available width, left-aligned (hash glyphs advance ~1px wider than their measure).
    const hashes = (value instanceof Date || typeof value === 'number') && !style.wordWrap && !style.shrinkToFit
      && measured > width && width >= 8;
    const shown = hashes ? '#'.repeat(Math.max(1, Math.floor(width / ctx.measureText('#').width))) : text;
    const shownMeasured = hashes ? ctx.measureText(shown).width : measured;
    const alignMode = hashes ? 0 : align;
    const lines = style.wordWrap ? wrappedLines(shown, width, t => ctx.measureText(t).width) : shown.split('\n');
    const blockHeight = lines.length * lineHeight;
    // The trial's Gantt grid sits its vertically-centred text one pixel lower than the plain
    // middle formula (measured: 'Design' ink spans y81-93 in the trial vs y80-92 without the nudge),
    // and summary rows four pixels above that (see GanttSheet._ganttTextNudge).
    const ganttSheetForNudge = renderer.sheet ? paintHooks(renderer.sheet) : undefined;
    const ganttRowNudge = ganttSheetForNudge?._ganttTextNudge ? ganttSheetForNudge._ganttTextNudge.call(renderer.sheet, row) : 0;
    const middleNudge = (renderer.sheet && paintHooks(renderer.sheet)._isGanttSheet && style.vAlign === 1) ? 1 + ganttRowNudge : 0;
    const y = style.vAlign === 2 ? rect.y + rect.height - blockHeight - 3
      : style.vAlign === 1 ? rect.y + (rect.height - blockHeight - 3) / 2 + middleNudge : rect.y;
    ctx.textBaseline = 'alphabetic';
    const drawAlign = alignMode === 4 ? 1 : alignMode; // `centerContinuous` centers in the cell (trial, task 56 `t56-alignment` rows 9-11)
    ctx.textAlign = drawAlign === 2 ? 'right' : drawAlign === 1 ? 'center' : 'left';
    const x = drawAlign === 2 ? rect.x + rect.width - (ganttSheet ? 8 * z : tableSheet ? pad : 3) - indent
      : drawAlign === 1 ? rect.x + (rect.width - 1) / 2 : rect.x + pad + indent;
    if (alignMode === 5) {
      // Trial `distributed`: words are spread over the full cell width (first flush left, last
      // flush right, equal gaps); words that cannot keep at least one space gap are dropped
      // (task 56 `t56-alignment`: 'shrink distributed long text' paints 'shrink distributed long').
      const space = ctx.measureText(' ').width;
      const avail = Math.max(1, rect.width - 1 - 2 * pad - indent);
      for (let i = 0; i < lines.length; i++) {
        const words = lines[i].split(' ');
        while (words.length > 1 && !words[words.length - 1].length) words.pop();
        let n = words.length;
        while (n > 1) {
          const sum = words.slice(0, n).reduce((total, word) => total + ctx.measureText(word).width, 0);
          if (avail - sum >= (n - 1) * space) break;
          n--;
        }
        const kept = words.slice(0, n);
        const sum = kept.reduce((total, word) => total + ctx.measureText(word).width, 0);
        const gap = n > 1 ? (avail - sum) / (n - 1) : 0;
        let cursor = rect.x + pad + indent;
        ctx.textAlign = 'left';
        for (const word of kept) { ctx.fillText(word, cursor, y + baseline + i * lineHeight); cursor += ctx.measureText(word).width + gap; }
      }
    } else for (let i = 0; i < lines.length; i++) ctx.fillText(lines[i], x, y + baseline + i * lineHeight);
    if (style.textDecoration) {
      // Trial decoration offsets, measured task 56 in a 20px row with 12pt Calibri (fontSize 16,
      // line box top `y`): the underline sits at y + fontSize + 1, the strike-through 7px above
      // it, the overline 1px below the line box top, and `doubleUnderline` straddles the
      // underline position (rows y + fontSize and y + fontSize + 2).
      const decoration = Number(style.textDecoration);
      const w = Math.min(width, shownMeasured), sx = alignMode === 2 ? x - w : alignMode === 1 ? x - w / 2 : x;
      const underline = Math.round(y + fontSize + 1);
      const line = (dy: number) => ctx.fillRect(sx, underline + dy, w, 1);
      if (decoration & 1) line(0);
      if (decoration & 8) { line(-1); line(1); }
      if (decoration & 2) line(-7);
      if (decoration & 4) line(-Math.round(fontSize));
      // `accountingUnderline` / `doubleAccountingUnderline` (16/32) paint nothing on their own:
      // the trial leaves a General cell with those flags exactly as plain text (measured task 56,
      // rows 7-8 of `t56-fonts`: no line above the cell's gridline at y=159/179).
    }
    ctx.restore();
}

export function drawBorders(renderer: WorkbookRenderer, ctx: CanvasRenderingContext2D, row: number, col: number, style: Style, rect: Rect, span?: Range): void {
    const endRow = row + (span?.rowCount ?? 1), endCol = col + (span?.colCount ?? 1);
    // The top and left edges of a merged span take the anchor's own borders, the bottom and right
    // edges take the borders of the span's last row / last column cell: the trial paints the
    // anchor's `borderTop` across the whole width of a 4x3 span, but paints nothing at the bottom
    // edge of a 2x5 span whose anchor carries a `dashDot` bottom border (task 56 `.probe/t56`
    // scans, cross-checked against `getCell().borderBottom()` of the span's other cells).
    const bottomStyle = renderer.style(endRow - 1, col), rightStyle = renderer.style(row, endCol - 1);
    const sides: [LineBorder | undefined, number, number, number, number][] = [
      [strongerBorder(style.borderTop as LineBorder, row > 0 ? renderer.style(row - 1, col).borderBottom as LineBorder : undefined), rect.x - 1, rect.y - 1, rect.x + rect.width - 1, rect.y - 1],
      [strongerBorder(style.borderLeft as LineBorder, col > 0 ? renderer.style(row, col - 1).borderRight as LineBorder : undefined), rect.x - 1, rect.y - 1, rect.x - 1, rect.y + rect.height - 1],
      [strongerBorder(bottomStyle.borderBottom as LineBorder, renderer.style(endRow, col).borderTop as LineBorder), rect.x - 1, rect.y + rect.height - 1, rect.x + rect.width - 1, rect.y + rect.height - 1],
      [strongerBorder(rightStyle.borderRight as LineBorder, renderer.style(row, endCol).borderLeft as LineBorder), rect.x + rect.width - 1, rect.y - 1, rect.x + rect.width - 1, rect.y + rect.height - 1],
    ];
    for (const [border, x1, y1, x2, y2] of sides) if (border && border.style) {
      ctx.save(); ctx.fillStyle = resolveColor(border.color);
      const z = renderer.zoom, horizontal = y1 === y2;
      const weight = border.style === 6 ? 1 : borderWeight(border) >= 30 ? 3 : borderWeight(border) >= 20 ? 2 : 1;
      const patterns: Record<number, number[]> = { 3: [3, 1], 4: [2, 2], 7: [1, 1], 8: [9, 3], 9: [8, 2, 2, 2], 10: [9, 3, 3, 3], 11: [9, 3, 3, 3, 3, 3], 12: [9, 3, 3, 3, 3, 3], 13: [11, 1, 5, 1] };
      const pattern = patterns[border.style];
      const boundaryRow = y1 === rect.y - 1 ? row : endRow, boundaryCol = x1 === rect.x - 1 ? col : endCol;
      const previous = horizontal
        ? col > 0 ? strongerBorder(renderer.style(boundaryRow - 1, col - 1).borderBottom as LineBorder, renderer.style(boundaryRow, col - 1).borderTop as LineBorder) : undefined
        : row > 0 ? strongerBorder(renderer.style(row - 1, boundaryCol - 1).borderRight as LineBorder, renderer.style(row - 1, boundaryCol).borderLeft as LineBorder) : undefined;
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
    // TASK 56 (`t56-borders-styles` diagonal scans): diagonalDown runs corner-to-corner from the
    // cell's top-left to its bottom-right, diagonalUp from bottom-left to top-right; both use the
    // same weight/dash engine as the sides (trial: thin blue solid 1px, mediumDashed red 2px).
    const diag = style as unknown as { diagonalDown?: LineBorder; diagonalUp?: LineBorder };
    const dz = renderer.zoom;
    const diagPatterns: Record<number, number[]> = { 3: [3, 1], 4: [2, 2], 8: [9, 3], 9: [8, 2, 2, 2], 10: [9, 3, 3, 3], 11: [9, 3, 3, 3, 3, 3], 12: [9, 3, 3, 3, 3, 3], 13: [11, 1, 5, 1] };
    const dx1 = rect.x - 1, dy1 = rect.y - 1, dx2 = rect.x + rect.width - 1, dy2 = rect.y + rect.height - 1;
    for (const [border, x1, y1, x2, y2] of [[diag.diagonalDown, dx1, dy1, dx2, dy2], [diag.diagonalUp, dx1, dy2, dx2, dy1]] as const) {
      if (!border || !border.style) continue;
      const weight = border.style === 6 ? 1 : borderWeight(border) >= 30 ? 3 : borderWeight(border) >= 20 ? 2 : 1;
      ctx.save();
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
      ctx.strokeStyle = resolveColor(border.color); ctx.lineWidth = weight * dz;
      const dash = diagPatterns[border.style];
      if (dash) ctx.setLineDash(dash.map((run) => run * dz));
      ctx.stroke(); ctx.restore();
    }
}

export function drawDataBar(renderer: WorkbookRenderer, ctx: CanvasRenderingContext2D, rect: Rect, bar: NonNullable<ReturnType<Worksheet['conditionalFormats']['_visualFor']>>['bar']): void {
    if (!bar) return;
    // Trial geometry (task 56, `.probe/t56` scans of the official data bars in a 150x26 cell):
    // the bar area is inset 1px from the cell's left edge and 2px from its right edge, a bar is
    // `floor(|signed| * (cellWidth - 3))` pixels long, its rows run from cellTop+1 to
    // cellBottom-3, the zero line sits at `cellLeft + round(axis * (cellWidth - 2))` and the bar
    // grows from that axis towards its value. The gradient keeps the fill colour at the axis
    // end, reaches a 90% white tint after 90% of the bar length and stays flat until the outer
    // end; the axis line is 1px wide, dashed 1-on/1-off from the top edge, and only painted
    // when the scale reaches negative values.
    const z = renderer.zoom;
    const area = rect.width - 3 * z;
    if (area <= 0) return;
    const top = Math.round(rect.y + z);
    const bottom = Math.round(rect.y + rect.height - 3 * z);
    const height = bottom - top + 1;
    if (height <= 1) return;
    const color = bar.negative ? String(bar.negativeColor ?? bar.color) : String(bar.color);
    const borderColor = (bar.negative ? bar.negativeBorderColor : bar.borderColor) ?? color;
    const axis = Math.round(rect.x + Math.max(0, Math.min(1, bar.axis)) * (rect.width - 2 * z));
    const length = Math.floor(Math.max(0, Math.min(1, Math.abs(bar.signed))) * area);
    const growRight = (bar.signed >= 0) !== !!bar.rightToLeft;
    let left = growRight ? axis + z : axis - length;
    let right = growRight ? axis + length : axis - z;
    left = Math.max(Math.round(rect.x + z), left);
    right = Math.min(Math.round(rect.x + rect.width - 2 * z), right);
    const width = right - left + 1;
    ctx.save();
    ctx.beginPath();
    ctx.rect(rect.x, rect.y, rect.width - 1, rect.height - 1);
    ctx.clip();
    if (width > 0) {
      if (bar.gradient) {
        const tinted = tint(color);
        const gradient = ctx.createLinearGradient(growRight ? left : right + 1, 0, growRight ? right + 1 : left, 0);
        gradient.addColorStop(0, resolveColor(color));
        gradient.addColorStop(0.9, tinted);
        gradient.addColorStop(1, tinted);
        ctx.fillStyle = gradient;
      } else ctx.fillStyle = resolveColor(color);
      ctx.fillRect(left, top, width, height);
      if (bar.showBorder) {
        ctx.fillStyle = resolveColor(borderColor);
        ctx.fillRect(left, top, 1, height);
        ctx.fillRect(right, top, 1, height);
        ctx.fillRect(left, top, width, 1);
        ctx.fillRect(left, bottom, width, 1);
      }
    }
    if (bar.axisVisible) {
      ctx.fillStyle = resolveColor(bar.axisColor ?? 'black');
      for (let y = top; y <= bottom; y += 2 * z) ctx.fillRect(axis, y, z, z);
    }
    ctx.restore();
}

/** The trial's data-bar gradient ends at 90% white instead of pure white. */
function tint(color: string): string {
    try {
      return mixColor(color, '#ffffff', 0.9);
    } catch {
      return resolveColor(color);
    }
}

export function drawCommentIndicator(renderer: WorkbookRenderer, ctx: CanvasRenderingContext2D, row: number, col: number, rect: Rect): void {
    const sheet = renderer.sheet!;
    const thread = sheet.threadedComments.get(row, col);
    if (thread) {
      // Official threaded marker: purple square near the top-right corner; a check hook marks resolved threads.
      const size = 7;
      const x = Math.round(rect.x + rect.width - size - 3);
      const y = Math.round(rect.y);
      ctx.save();
      ctx.fillStyle = '#bd67c9';
      ctx.fillRect(x, y, size, size);
      if (thread.resolved()) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x + 1, y + 4);
        ctx.lineTo(x + 3, y + 6);
        ctx.lineTo(x + 6.5, y + 1.5);
        ctx.stroke();
      }
      ctx.restore();
      return;
    }
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

export function drawValidationUI(renderer: WorkbookRenderer, ctx: CanvasRenderingContext2D, row: number, col: number, value: unknown, rect: Rect): void {
    const sheet = renderer.sheet!;
    const validator = sheet.getDataValidator(row, col) as { type?: () => number; inCellDropdown?: () => boolean; highlightStyle?: () => { type?: number; color?: string; position?: number } } | null;
    if (!validator) return;
    const type = typeof validator.type === 'function' ? validator.type() : 0;
    const editing = renderer.interaction.editingAt(row, col);
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
    if (renderer.workbook.options.highlightInvalidData && value != null && typeof sheet.isValid === 'function' && !sheet.isValid(row, col, value)) {
      const style = typeof validator.highlightStyle === 'function'
        ? validator.highlightStyle() as { type?: number; color?: string; position?: number; image?: string }
        : undefined;
      renderer.drawValidationHighlight(ctx, style ?? {}, rect);
    }
}

export function drawValidationHighlight(renderer: WorkbookRenderer, ctx: CanvasRenderingContext2D, style: { type?: number; color?: string; position?: number; image?: string }, rect: Rect): void {
    const color = resolveColor(style.color ?? 'red');
    const type = style.type ?? 0;
    ctx.save();
    if (type === 1) {
      // Dog-ear: a folded triangle painted into the top-right corner.
      const size = Math.min(10, rect.width, rect.height);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(rect.x + rect.width - size - 1, rect.y + 1);
      ctx.lineTo(rect.x + rect.width - 1, rect.y + 1);
      ctx.lineTo(rect.x + rect.width - 1, rect.y + size + 1);
      ctx.closePath();
      ctx.fill();
    } else if (type === 2) {
      const position = style.position ?? 4;
      const size = Math.min(16, rect.height - 2, rect.width - 2);
      let x = rect.x + 2, y = rect.y + Math.round((rect.height - size) / 2);
      if (position === 0) { x = rect.x + 1; y = rect.y + 1; }
      else if (position === 1) { x = rect.x + rect.width - size - 1; y = rect.y + 1; }
      else if (position === 2) { x = rect.x + rect.width - size - 1; y = rect.y + rect.height - size - 1; }
      else if (position === 3) { x = rect.x + 1; y = rect.y + rect.height - size - 1; }
      else if (position === 5) { x = rect.x + rect.width - size - 2; }
      const image = style.image ? cachedImage(style.image, () => renderer.schedule()) : null;
      if (image && image.complete && image.naturalWidth) {
        ctx.drawImage(image, x, y, size, size);
      } else {
        // Default invalid-data flag: a filled circle with a white cross.
        const cx = x + size / 2, cy = y + size / 2, r = size / 2 - 1;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(cx, cy, Math.max(1, r), 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.6;
        const k = Math.max(1, r * 0.55);
        ctx.beginPath();
        ctx.moveTo(cx - k, cy - k);
        ctx.lineTo(cx + k, cy + k);
        ctx.moveTo(cx + k, cy - k);
        ctx.lineTo(cx - k, cy + k);
        ctx.stroke();
      }
    } else {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(rect.x + rect.width / 2, rect.y + rect.height / 2, rect.width / 2 + 4, rect.height / 2 + 4, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
}

export function drawFilterButtons(renderer: WorkbookRenderer, ctx: CanvasRenderingContext2D): void {
    const sheet = renderer.sheet!;
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
      const rowSlot = renderer.rows.find((slot) => slot.index === header);
      if (!rowSlot) continue;
      for (const col of renderer.cols) {
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
    if (filter && filter.range && renderer.headerHeight > 0) {
      const range = filter.range;
      for (const col of renderer.cols) {
        const index = col.index - range.col;
        if (index < 0 || index >= range.colCount) continue;
        if (filter.filterButtonVisible(col.index) === false) continue;
        draw(col.position, 0, col.size, renderer.headerHeight, {
          filtered: filter.isFiltered(index),
          sort: filter.getSortState(index),
        });
      }
    }
}
