import { drawTableSheetBand, drawTableSheetHeaders } from './tablesheet/rendering.js';
/**
 * Chrome painting of the canvas renderer: headers, outline buttons,
 * selection overlay and the sheet tab strips. Bodies moved out of
 * `rendering.ts` unchanged (`this` renamed to the `renderer` parameter);
 * the class keeps thin delegating methods.
 */

import { canvasColor as resolveColor } from './colors.js';
import {
  columnLabel,
  fontMetrics,
  horizontalTabSlots,
  selectionBounds,
  verticalTabSlots,
} from './rendering-geometry.js';
import type { WorkbookRenderer } from './rendering.js';

export function drawHeaders(renderer: WorkbookRenderer, ctx: CanvasRenderingContext2D): void {
    const s = renderer.sheet!, selections = s.getSelections();
    if ('_isTableSheet' in s) { drawTableSheetHeaders(renderer, ctx); return; }
    // TASK 56 (`t56-sel` probe): header marking is pure membership in the STORED selection —
    // merged-span expansion belongs to the selection state itself (sheet-selection.ts), like the trial.
    const marks = selections;
    const baseFont = Number((14.6667 * renderer.zoom).toFixed(4));
    ctx.font = `${baseFont}px Calibri`; ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'center';
    const columnBandTop = renderer.colGutter;
    const columnBandHeight = Math.max(0, renderer.headerHeight - renderer.colGutter);
    const rowBandLeft = renderer.rowGutter;
    const rowBandWidth = Math.max(0, renderer.headerWidth - renderer.rowGutter);
    for (const col of renderer.cols) if (renderer.headerHeight) {
      const selected = marks.some(r => r.col === -1 || (col.index >= r.col && col.index < r.col + r.colCount));
      ctx.save(); ctx.beginPath(); ctx.rect(col.min, 0, col.max - col.min, renderer.headerHeight); ctx.clip();
      ctx.fillStyle = selected ? '#e1e1e1' : 'white'; ctx.fillRect(col.position, columnBandTop, col.size, columnBandHeight);
      ctx.fillStyle = '#e1e6e1'; ctx.fillRect(Math.round(col.position + col.size) - 1, columnBandTop, 1, columnBandHeight);
      ctx.fillStyle = '#ababab'; ctx.fillRect(col.position, renderer.headerHeight - 1, col.size, 1);
      if (selected) { ctx.fillStyle = '#217346'; ctx.fillRect(col.position - 1, renderer.headerHeight - 2, col.size + 1, 2); }
      ctx.fillStyle = selected ? '#217346' : '#444'; ctx.font = `${selected ? 'bold ' : ''}${baseFont}px Calibri`;
      const text = s.getValue(0, col.index, 1);
      const headerFilter = s.rowFilter();
      let headerLabelWidth = col.size;
      if (headerFilter && headerFilter.range) {
        const index = col.index - headerFilter.range.col;
        if (index >= 0 && index < headerFilter.range.colCount && headerFilter.filterButtonVisible(col.index) !== false)
          headerLabelWidth -= Math.min(18, col.size - 4) + 2;
      }
      ctx.fillText(text == null ? columnLabel(col.index) : String(text), col.position + headerLabelWidth / 2 - 0.5, columnBandTop + fontMetrics(ctx.font).baseline + (columnBandHeight - fontMetrics(ctx.font).height - 3) / 2);
      ctx.restore();
    }
    for (const row of renderer.rows) if (renderer.headerWidth) {
      const selected = marks.some(r => r.row === -1 || (row.index >= r.row && row.index < r.row + r.rowCount));
      ctx.save(); ctx.beginPath(); ctx.rect(0, row.min, renderer.headerWidth, row.max - row.min); ctx.clip();
      ctx.fillStyle = selected ? '#e1e1e1' : 'white'; ctx.fillRect(rowBandLeft, row.position, rowBandWidth, row.size);
      ctx.fillStyle = '#e1e6e1'; ctx.fillRect(rowBandLeft, Math.round(row.position + row.size) - 1, rowBandWidth, 1);
      ctx.fillStyle = '#ababab'; ctx.fillRect(renderer.headerWidth - 1, row.position, 1, row.size);
      if (selected) { ctx.fillStyle = '#217346'; ctx.fillRect(renderer.headerWidth - 2, row.position - 1, 2, row.size + 1); }
      ctx.fillStyle = selected ? '#217346' : '#444'; ctx.font = `${selected ? 'bold ' : ''}${baseFont}px Calibri`;
      const text = s.getValue(row.index, 0, 2);
      ctx.fillText(text == null ? String(row.index + 1) : String(text), rowBandLeft + rowBandWidth / 2 - 0.5, row.position + fontMetrics(ctx.font).baseline + (row.size - fontMetrics(ctx.font).height - 3) / 2);
      ctx.restore();
    }
    if (renderer.headerWidth && renderer.headerHeight) {
      ctx.fillStyle = 'white'; ctx.fillRect(0, 0, renderer.headerWidth - 1, renderer.headerHeight - 1);
      ctx.fillStyle = '#e1e1e1';
      ctx.beginPath();
      if (renderer.rowGutter || renderer.colGutter) {
        const bandHeight = Math.max(0, renderer.headerHeight - renderer.colGutter);
        ctx.moveTo(renderer.headerWidth - 4, columnBandTop + 2);
        ctx.lineTo(renderer.headerWidth - 4, columnBandTop + bandHeight - 3);
        ctx.lineTo(renderer.headerWidth - 4 - (bandHeight - 6), columnBandTop + bandHeight - 3);
      } else {
        ctx.moveTo(renderer.headerWidth - 3, 2);
        ctx.lineTo(renderer.headerWidth - 3, renderer.headerHeight - 3);
        ctx.lineTo(renderer.headerWidth - renderer.headerHeight + 2, renderer.headerHeight - 3);
      }
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ababab';
      ctx.fillRect(renderer.headerWidth - 1, 0, 1, renderer.headerHeight);
      if (renderer.rowGutter) ctx.fillRect(0, renderer.headerHeight - 1, renderer.headerWidth, 1);
    }
    if (renderer.colGutter) {
      ctx.fillStyle = '#ababab';
      ctx.fillRect(0, renderer.colGutter - 1, renderer.viewWidth, 1);
    }
    if (renderer.rowGutter) {
      ctx.fillStyle = '#ababab';
      ctx.fillRect(renderer.rowGutter - 1, 0, 1, renderer.viewHeight);
    }
    if (s.rowOutlines._hasAny() || s.columnOutlines._hasAny()) renderer.drawOutlines(ctx);
}

export function drawOutlineButton(renderer: WorkbookRenderer, ctx: CanvasRenderingContext2D, x: number, y: number, expand: boolean): void {
    const z = renderer.zoom;
    const size = Math.round(18 * z);
    const left = Math.round(x), top = Math.round(y);
    ctx.save();
    ctx.fillStyle = '#ffffff'; ctx.fillRect(left, top, size, size);
    ctx.strokeStyle = '#828790'; ctx.lineWidth = 1; ctx.strokeRect(left + 0.5, top + 0.5, size - 1, size - 1);
    // TASK 56 (`t56-outline-buttons` raw-pixel scan, zoom 1): the trial glyph is a 2px-thick #666666
    // cross centered at the 18px box center (cx = left+9, cy = top+9): horizontal bar cx-4..cx+3 at
    // rows cy-1..cy, vertical bar cx-1..cx at rows cy-4..cy+2, each bar closed by 1px #b2b2b2 AA caps.
    const cx = left + Math.round(9 * z), cy = top + Math.round(9 * z);
    ctx.fillStyle = '#666666';
    ctx.fillRect(cx - Math.round(4 * z), cy - Math.round(1 * z), Math.round(8 * z), Math.round(2 * z));
    ctx.fillStyle = '#b2b2b2';
    ctx.fillRect(cx - Math.round(5 * z), cy - Math.round(1 * z), Math.round(1 * z), Math.round(2 * z));
    ctx.fillRect(cx + Math.round(4 * z), cy - Math.round(1 * z), Math.round(1 * z), Math.round(2 * z));
    if (expand) {
        ctx.fillStyle = '#666666';
        ctx.fillRect(cx - Math.round(1 * z), cy - Math.round(4 * z), Math.round(2 * z), Math.round(7 * z));
        ctx.fillStyle = '#b2b2b2';
        ctx.fillRect(cx - Math.round(1 * z), cy - Math.round(5 * z), Math.round(2 * z), Math.round(1 * z));
        ctx.fillRect(cx - Math.round(1 * z), cy + Math.round(3 * z), Math.round(2 * z), Math.round(1 * z));
    }
    ctx.restore();
}

export function drawOutlines(renderer: WorkbookRenderer, ctx: CanvasRenderingContext2D): void {
    const s = renderer.sheet!;
    const rowRuns = s.rowOutlines._runs();
    const colRuns = s.columnOutlines._runs();
    const rowMax = s.rowOutlines.getMaxLevel();
    const colMax = s.columnOutlines.getMaxLevel();
    // Level buttons.
    if (renderer.rowGutter && renderer.colGutter) {
      ctx.save();
      ctx.font = `${Number((12 * renderer.zoom).toFixed(4))}px Calibri`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#666666';
      for (let level = 0; level <= rowMax + 1; level++) {
        // TASK 56 raw scan: trial level buttons are 17px boxes (edges 16 apart) on a 17px pitch —
        // adjacent boxes show double border columns (2|18, 19|35), not a merged single line.
        const x = 2 + level * 17, y = renderer.colGutter + 1;
        ctx.fillStyle = '#ffffff'; ctx.fillRect(x, y, 17, 17);
        ctx.strokeStyle = '#828790'; ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, 16, 16);
        ctx.fillStyle = '#666666'; ctx.fillText(String(level + 1), x + 8.5, y + 8.5);
      }
      for (let level = 0; level <= colMax + 1; level++) {
        const x = renderer.rowGutter + 11, y = 2 + level * 17;
        ctx.fillStyle = '#ffffff'; ctx.fillRect(x, y, 17, 17);
        ctx.strokeStyle = '#828790'; ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, 16, 16);
        ctx.fillStyle = '#666666'; ctx.fillText(String(level + 1), x + 8.5, y + 9);
      }
      ctx.restore();
    }
    // Row group brackets and expand/collapse buttons.
    for (const run of rowRuns) {
      const startSlot = renderer.rows.find((slot) => slot.index === run.index);
      const summary = renderer.rows.find((slot) => slot.index === run.index + run.count);
      if (!startSlot && !summary) continue;
      const x = 11 + run.info.level * 17;
      const collapsed = s.rowOutlines._collapsedAt(run.index);
      ctx.save();
      // TASK 56 (`t56-outline-buttons` raw scan): a fully collapsed group paints its button only —
      // no bracket elbow/stub in the trial.
      if (startSlot) {
        ctx.strokeStyle = '#ababab'; ctx.lineWidth = 2;
        const top = (startSlot?.position ?? summary!.position) + 1;
        const bottom = summary ? summary.position + summary.size / 2 : (startSlot?.position ?? 0) + startSlot!.size;
        ctx.beginPath();
        ctx.moveTo(x + 5, top); ctx.lineTo(x, top); ctx.lineTo(x, bottom); ctx.stroke();
      }
      if (summary) {
        renderer.drawOutlineButton(ctx, 2, summary.position + summary.size / 2 - 9, collapsed);
        ctx.fillStyle = '#ababab';
        for (const slot of renderer.rows)
          if (slot.index >= run.index && slot.index < run.index + run.count)
            ctx.fillRect(x + 16, slot.position + slot.size / 2 - 1, 2, 2);
      }
      ctx.restore();
    }
    // Column group brackets and buttons.
    for (const run of colRuns) {
      const startSlot = renderer.cols.find((slot) => slot.index === run.index);
      const summary = renderer.cols.find((slot) => slot.index === run.index + run.count);
      if (!startSlot && !summary) continue;
      const y = 11 + run.info.level * 17;
      const collapsed = s.columnOutlines._collapsedAt(run.index);
      ctx.save();
      if (startSlot) {
        ctx.strokeStyle = '#ababab'; ctx.lineWidth = 2;
        const left = (startSlot?.position ?? summary!.position) + 1;
        const right = summary ? summary.position + summary.size / 2 : (startSlot?.position ?? 0) + startSlot!.size;
        ctx.beginPath();
        ctx.moveTo(left, y + 5); ctx.lineTo(left, y); ctx.lineTo(right, y); ctx.stroke();
      }
      if (summary) {
        renderer.drawOutlineButton(ctx, summary.position + summary.size / 2 - 9, 2, collapsed);
        ctx.fillStyle = '#ababab';
        for (const slot of renderer.cols)
          if (slot.index >= run.index && slot.index < run.index + run.count)
            ctx.fillRect(slot.position + slot.size / 2 - 1, y + 16, 2, 2);
      }
      ctx.restore();
    }
}

export function drawSelection(renderer: WorkbookRenderer, ): void {
    const ctx = renderer.selectionContext, s = renderer.sheet!;
    ctx.clearRect(0, 0, renderer.viewWidth, renderer.viewHeight);
    if (renderer.workbook.options.hideSelection) return;
    ctx.save(); ctx.beginPath(); ctx.rect(Math.max(0, renderer.headerWidth - 2), Math.max(0, renderer.headerHeight - 2), renderer.viewWidth, renderer.viewHeight); ctx.clip();
    const active = renderer.cellRect(s.getActiveRowIndex(), s.getActiveColumnIndex());
    for (const selection of s.getSelections()) {
      const range = selectionBounds(selection.normalized(s.getRowCount(), s.getColumnCount()), s.getSpans());
      for (const rowPane of renderer.panes(renderer.rows)) for (const colPane of renderer.panes(renderer.cols)) {
        const r = renderer.rows.find(r => r.index >= range.row && r.index < range.row + range.rowCount && r.min === rowPane.min);
        const c = renderer.cols.find(c => c.index >= range.col && c.index < range.col + range.colCount && c.min === colPane.min);
        if (!r || !c) continue;
        const rect = renderer.rangeRect(range, r, c);
        ctx.save(); ctx.beginPath(); ctx.rect(Math.max(renderer.headerWidth - 2, colPane.min - 2), Math.max(renderer.headerHeight - 2, rowPane.min - 2), colPane.max - colPane.min + 3, rowPane.max - rowPane.min + 3); ctx.clip();
        if (renderer.sheet && '_isGanttSheet' in renderer.sheet) {
          // The Gantt trial marks the active cell with a plain 1px grey rect inset in the cell
          // (no green border, no fill, no drag handle; measured x+0..1 / y+1 edges).
          ctx.strokeStyle = '#7f7f7f'; ctx.lineWidth = 1;
          ctx.strokeRect(Math.round(rect.x) + 0.5, Math.round(rect.y) + 1.5, Math.round(rect.width) - 2.5, Math.round(rect.height) - 2.5);
          ctx.restore();
          continue;
        }
        if (range.rowCount > 1 || range.colCount > 1) {
          ctx.fillStyle = resolveColor(String(s.options.selectionBackColor ?? 'rgba(0,0,0,0.185)'));
          const inset = s.getSelections().length > 1 ? 1 : 0;
          ctx.fillRect(rect.x + inset, rect.y + inset, rect.width - 1 - inset * 2, rect.height - 1 - inset * 2);
          ctx.clearRect(active.x, active.y, active.width, active.height);
        }
        if (s.getSelections().length === 1 && '_isTableSheet' in renderer.sheet!) {
          // Trial TableSheet active cell (probe .probe/t54 scans): a 1px `#6e7378` outline hugging
          // the cell edges inside the surrounding grid lines; no tint, no fill handle.
          ctx.strokeStyle = '#6e7378'; ctx.lineWidth = 1;
          ctx.strokeRect(Math.round(rect.x) + 0.5, Math.round(rect.y) + 0.5, Math.round(rect.width) - 1, Math.round(rect.height) - 2);
          ctx.restore();
          continue;
        }
        ctx.strokeStyle = resolveColor(s.getSelections().length > 1 ? 'white' : String(s.options.selectionBorderColor ?? '#217346')); ctx.lineWidth = s.getSelections().length > 1 ? 1 : 2;
        if (s.getSelections().length === 1) ctx.strokeRect(Math.round(rect.x) - 1, Math.round(rect.y) - 1, Math.round(rect.width) + 1, Math.round(rect.height) + 1);
        const inTable = !!renderer.sheet!._tableAt(s.getActiveRowIndex(), s.getActiveColumnIndex());
        if (!inTable && s.getSelections().length === 1 && renderer.workbook.options.allowUserDragFill && range.rowCount < s.getRowCount() && range.colCount < s.getColumnCount()) {
          ctx.fillStyle = 'white'; ctx.fillRect(rect.x + rect.width - 5, rect.y + rect.height - 5, 7, 7);
          ctx.fillStyle = resolveColor(String(s.options.selectionBorderColor ?? '#217346')); ctx.fillRect(rect.x + rect.width - 3, rect.y + rect.height - 3, 5, 5);
        }
        ctx.restore();
      }
    }
    if (s.getSelections().length > 1) { ctx.strokeStyle = resolveColor(String(s.options.selectionBorderColor ?? '#217346')); ctx.lineWidth = 1; ctx.strokeRect(active.x + 1.5, active.y + 1.5, active.width - 4, active.height - 4); }
    if (renderer.copiedRange && renderer.workbook.options.cutCopyIndicatorVisible) {
      const rect = renderer.rangeRect(renderer.copiedRange); ctx.strokeStyle = resolveColor(renderer.workbook.options.cutCopyIndicatorBorderColor); ctx.lineWidth = 1; ctx.setLineDash([4, 3]); ctx.lineDashOffset = -(performance.now() / 120 % 7);
      ctx.strokeRect(rect.x - 1, rect.y - 1, rect.width, rect.height);
    }
    ctx.restore();
}

/**
 * Width of one sheet-tab cell (TASK 56 `t56-tabs` probe).
 *
 * The trial sizes tabs from its own glyph metrics, not from the host font: renaming the single sheet
 * and reading the tab's hit rectangle through the public `Spread.hitTest` gives 'Sheet1'..'Sheet9' 62,
 * 'Sheet10'..'Sheet12' 68, 'Sheet 1'..'Sheet 9' 65, 'Sheet 10'/'Sheet 12' 72, 'Sheet' 55, 'Shee' 51,
 * 'Overview' 79, 'Details' 63, 'Values' 61, 'Model' 60 (probe data `.probe/t56/tab-data.mjs`,
 * `.probe/t56/tab-pairs.mjs`; staircase probes of repeated glyphs 'aaaa'..'aaaaaaaaaa' etc. give the
 * per-glyph advances, the two-letter probe gives the pair corrections).
 *
 * Advance table: the trial's own glyph advances (probe staircases 'aaaa'..'aaaaaaaaaa',
 * '00'..'0000000000', …), plus the measured pair corrections for the kerning capital families
 * T/V/W/Y. Padding 24.6 with whole-pixel truncation reproduces every sheet name measured on the
 * trial. A name containing a glyph the probe did not cover falls back to local `measureText` metrics.
 * The trial is not perfectly additive for a few cases ('Sheet 11' measures 71, a repeated '1' staircase
 * is narrower than a single '1'), which is recorded in docs/STATUS.md instead of being hidden.
 */
const TAB_ADVANCES: Record<string, number> = {
  ' ': 3.3,
  '0': 6.66, '1': 6.66, '2': 6.66, '3': 6.66, '4': 6.66, '5': 6.66, '6': 6.66, '7': 6.66, '8': 6.66, '9': 6.66,
  a: 6.66, b: 7.4, c: 5.86, d: 7.36, e: 5.86, f: 4.36, g: 6.66, h: 7.36, i: 3.66, j: 4.36, k: 7.36, l: 3.66,
  m: 11.09, n: 7.36, o: 6.66, p: 7.36, q: 7.36, r: 5.86, s: 5.16, t: 4.36, u: 7.36, v: 6.66, w: 9.57, x: 6.66,
  y: 6.66, z: 5.86,
  A: 9.57, B: 8.82, C: 9.57, D: 9.57, E: 8.82, F: 8.07, G: 10.37, H: 10.37, I: 5.16, J: 6.66, K: 10.37, L: 8.82,
  M: 12.43, N: 9.57, O: 10.37, P: 8.07, Q: 10.37, R: 9.57, S: 7.36, T: 8.82, U: 9.57, V: 9.57, W: 13.32, X: 9.57,
  Y: 9.57, Z: 8.82,
};
const TAB_PADDING = 24.6;
/** Pair corrections measured on the trial (two-letter sheet names 'Ta'..'Rd'); only the negative
 * kernings that the trial applies consistently for the T/V/W/Y capital families are used. */
const TAB_PAIRS: Record<string, number> = {
  Ta: -1, Te: -1, Ti: -1, To: -1, Tu: -1, Ty: -1, Tc: -1, Tt: -1, Tr: -1, Ts: -1, Td: -1,
  Va: -1, Ve: -1, Vi: -1, Vo: -1, Vu: -1, Vy: -1, Vc: -1, Vt: -1, Vr: -1, Vs: -1, Vd: -1,
  Ya: -1, Ye: -1, Yi: -1, Yo: -1, Yu: -1, Yy: -1, Yc: -1, Yt: -1, Yr: -1, Ys: -1, Yd: -1,
  Wa: -1, We: -1, Wi: -1, Wo: -1, Wu: -1, Wy: -1, Wc: -1, Wt: -1, Wr: -1, Ws: -1, Wd: -1,
};
let tabContext: CanvasRenderingContext2D | undefined;
export function sheetTabLabelWidth(name: string): number {
  let total = TAB_PADDING;
  for (let i = 0; i < name.length; i++) {
    const advance = TAB_ADVANCES[name[i]];
    if (advance === undefined) {
      // Glyph the probe did not cover: fall back to the local font metrics with the old constant.
      if (!tabContext) {
        const context = document.createElement('canvas').getContext('2d');
        if (!context) return Math.max(24, Math.floor(total));
        tabContext = context;
        tabContext.font = '10pt "Segoe UI"';
      }
      return Math.floor(tabContext.measureText(name).width + 26);
    }
    total += advance;
    if (i) total += TAB_PAIRS[name.slice(i - 1, i + 1)] ?? 0;
  }
  return Math.floor(total + 1e-9);
}

export function drawHorizontalTabs(renderer: WorkbookRenderer, ctx: CanvasRenderingContext2D, top: boolean): void {
    // TableSheet/GanttSheet tabs paint the trial's 18px group band, not the classic strip.
    if (renderer.sheet && '_isTableSheet' in renderer.sheet) { drawTableSheetBand(renderer, ctx); return; }
    const width = Number.parseFloat(renderer.tabs.style.width), options = renderer.workbook.options;
    const dx = top ? -15 : 0;
    const bodyY = top ? 5 : 0, bodyHeight = top ? 23 : 25, accentY = top ? 3 : 23;
    // Trial separators: 22px flush with the edge beside the active tab, 20px recessed elsewhere (mirrored for Top).
    // Trial separators: 23px flush with the edge beside the active tab, 20px recessed elsewhere
    // (mirrored for Top). `many-tabs` raw scan: the separator beside the active tab runs through the
    // whole band height up to the accent bar (canvas y 0..22 inclusive).
    const sepNear = top ? [5, 23] : [0, 23], sepFar = top ? [4, 20] : [3, 20];
    ctx.clearRect(0, 0, width, 28); ctx.fillStyle = '#f6f6f6'; ctx.fillRect(0, 0, width, 28);
    if (top) { ctx.fillStyle = '#ababab'; ctx.fillRect(0, 27, width, 1); }
    else {
      // TASK 56 (`t56-strip-geometry` canvas read-back, DPR1 and DPR2): the trial paints the strip
      // edge as a full #ababab line and lays a lighter ramp over its bottom half, fading
      // #f6f6f6 -> #ababab across the strip canvas. At device scale 1 both halves share one pixel
      // row, which reads as the measured #d1d1d1 -> #ababab fade; at scale 2 the raw rows are
      // exactly [#ababab, #f6f6f6 -> #ababab] (canvas rows 0 and 1).
      ctx.fillStyle = '#ababab'; ctx.fillRect(0, 0, width, 1);
      const edge = ctx.createLinearGradient(0, 0.5, Math.max(1, width), 0.5);
      edge.addColorStop(0, '#f6f6f6'); edge.addColorStop(1, '#ababab');
      ctx.fillStyle = edge; ctx.fillRect(0, 0.5, width, 0.5);
    }
    if (options.tabNavigationVisible) {
      for (const [x, reverse] of [[28, true], [57, false]] as const) {
        const start = renderer.workbook.startSheetIndex();
        const available = renderer.workbook.sheets.some((sheet, index) => !!sheet.visible() && (reverse ? index < start : index > start));
        ctx.fillStyle = resolveColor(available ? '#0a6332' : '#c6c6c6');
        ctx.beginPath(); ctx.moveTo(x + dx + (reverse ? 2 : -2), 11); ctx.lineTo(x + dx + (reverse ? -2 : 2), 14); ctx.lineTo(x + dx + (reverse ? 2 : -2), 17); ctx.fill();
        renderer.tabHits.push({ x: x + dx - 12, width: 24, index: reverse ? -2 : -3 });
      }
    }
    ctx.font = 'bold 10pt "Segoe UI"';
    const overflow = renderer.workbook.sheets.reduce((sum, sheet) => sum + Math.ceil(ctx.measureText(sheet.name()).width + 26), 0) > width - (options.tabNavigationVisible ? top ? 99 : 114 : 0) - (top ? 55 : 81);
    const list = options.tabNavigationVisible && (options.allSheetsListVisible === 1 || (options.allSheetsListVisible === 2 && overflow));
    if (list) { ctx.fillStyle = '#217346'; for (let y = 9; y <= 19; y += 5) ctx.fillRect(71 + dx, y, 15, 2); renderer.tabHits.push({ x: 66 + dx, width: 26, index: -4 }); }
    ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
    const active = renderer.workbook.getActiveSheetIndex();
    const indexes: number[] = [], widths: number[] = [];
    for (let i = renderer.workbook.startSheetIndex(); i < renderer.workbook.sheets.length; i++) {
      const sheet = renderer.workbook.sheets[i]; if (!sheet.visible()) continue;
      // The trial tab width follows internal integer font metrics; round(text+26) is the closest single-fit for active and inactive alike (docs/STATUS.md).
      ctx.font = '10pt "Segoe UI"';
      indexes.push(i); widths.push(sheetTabLabelWidth(sheet.name()));
    }
    const clipX = width - (top ? 55 : 84);
    const { slots, end } = horizontalTabSlots((options.tabNavigationVisible ? list ? 114 : 99 : 0) + dx, widths, clipX);
    renderer.tabSlotRects = [];
    for (let i = 0, x = (options.tabNavigationVisible ? list ? 114 : 99 : 0) + dx; i < indexes.length; i++) { renderer.tabSlotRects.push({ index: indexes[i], x, width: widths[i] + 1 }); x += widths[i] + 1; }
    const fits = slots.length === widths.length && end <= clipX;
    renderer.tabStripOverflow = !fits;
    ctx.save();
    if (!fits) { ctx.beginPath(); ctx.rect(0, 0, Math.max(0, clipX + 1), 28); ctx.clip(); }
    for (const slot of slots) {
      const i = indexes[slot.index], sheet = renderer.workbook.sheets[i];
      const w = slot.width, bx = slot.x, selected = i === active;
      if (selected) { ctx.fillStyle = 'white'; ctx.fillRect(bx, bodyY, w, bodyHeight); }
      if (selected && sheet.options.sheetTabColor) {
        // The trial tints the whole active column with a faint blue gradient and rises the tab colour in below the text.
        const bg = ctx.createLinearGradient(0, top ? 25.5 : 1.5, 0, top ? 15 : 12);
        bg.addColorStop(0, '#fcfdfe'); bg.addColorStop(1, '#f1f6fd');
        ctx.fillStyle = bg; ctx.fillRect(bx, bodyY, w, bodyHeight);
        const band = ctx.createLinearGradient(0, top ? 2.8 : 10.6, 0, top ? 16.4 : 24.2);
        if (top) { band.addColorStop(0, resolveColor(sheet.options.sheetTabColor)); band.addColorStop(1, '#ffffff'); }
        else { band.addColorStop(0, '#ffffff'); band.addColorStop(1, resolveColor(sheet.options.sheetTabColor)); }
        ctx.fillStyle = band; ctx.fillRect(bx, top ? 5 : 14, w - 2, 10);
      }
      if (!selected && sheet.options.sheetTabColor) { ctx.fillStyle = resolveColor(sheet.options.sheetTabColor); ctx.fillRect(bx + 1, 3, w - 4, 22); }
      if (selected) { ctx.fillStyle = '#217346'; ctx.fillRect(bx - 1, accentY, w + 2, 2); }
      ctx.fillStyle = selected ? '#217346' : sheet.options.sheetTabColor ? 'white' : '#444';
      ctx.font = `${selected ? 'bold ' : ''}10pt "Segoe UI"`; ctx.textAlign = 'left';
      ctx.fillText(sheet.name(), bx + 12, top ? 15 : 13);
      renderer.tabHits.push({ x: bx, width: w, index: i }); ctx.textAlign = 'center';
    }
    if (slots.length) {
      ctx.fillStyle = '#ababab';
      const boundary = (x: number, near: boolean) => { const [y, height] = near ? sepNear : sepFar; ctx.fillRect(x, y, 1, height); };
      for (let k = 0; k < slots.length; k++) boundary(slots[k].x - 1, active === indexes[k] || (k > 0 && active === indexes[k - 1]));
      if (fits) boundary(end, active === indexes[slots.length - 1]);
    }
    ctx.restore();
    if (options.newTabVisible) {
      if (!fits) { ctx.fillStyle = '#217346'; ctx.font = 'bold 10pt "Segoe UI"'; ctx.fillText('...', width - (top ? 42 : 71), 13); renderer.tabHits.push({ x: width - (top ? 55 : 84), width: 25, index: -4 }); }
      const cx = fits ? Math.min(width - 20, end + (top ? 42 : 41)) : width - (top ? 14 : 44);
      ctx.strokeStyle = '#7f7f7f'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(cx, 14, 7, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#7f7f7f'; ctx.fillRect(cx - 3.5, 13, 7, 2); ctx.fillRect(cx - 1, 10.5, 2, 7);
      renderer.tabHits.push({ x: cx - 12, width: 24, index: -1 });
    }
    if (!top) { ctx.fillStyle = '#217346'; for (let y = 10; y <= 20; y += 4) ctx.fillRect(width - 15, y, 2, 2); }
}

export function drawVerticalTabs(renderer: WorkbookRenderer, ctx: CanvasRenderingContext2D): void {
    const width = Number.parseFloat(renderer.tabs.style.width), height = Number.parseFloat(renderer.tabs.style.height);
    const options = renderer.workbook.options, right = renderer.tabPosition === 3, sheets = renderer.workbook.sheets;
    ctx.clearRect(0, 0, width, height); ctx.fillStyle = '#f6f6f6'; ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#ababab'; ctx.fillRect(right ? 0 : width - 1, 0, 1, height);
    const active = renderer.workbook.getActiveSheetIndex(), start = renderer.workbook.startSheetIndex();
    const slots = verticalTabSlots(height);
    const visibleCount = sheets.reduce((count, sheet, index) => count + (index >= start && sheet.visible() ? 1 : 0), 0);
    const overflow = visibleCount > slots.length;
    renderer.tabStripOverflow = overflow;
    const center = width / 2;
    if (options.newTabVisible) {
      const cx = overflow ? center - 15 : center;
      ctx.strokeStyle = '#7f7f7f'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(cx, 14, 7, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#7f7f7f'; ctx.fillRect(cx - 3.5, 13, 7, 2); ctx.fillRect(cx - 1, 10.5, 2, 7);
      renderer.tabHits.push({ x: 7, width: 14, index: -1, cross: [cx - 7, cx + 7] });
    }
    if (options.allSheetsListVisible === 1 || (options.allSheetsListVisible === 2 && overflow)) {
      ctx.fillStyle = '#217346'; for (let y = 9; y <= 19; y += 5) ctx.fillRect(center + 1, y, 15, 2);
      renderer.tabHits.push({ x: 7, width: 14, index: -4, cross: [center, center + 16] });
    }
    ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    let drawn = 0;
    const visibleIndexes: number[] = [];
    for (let i = start; i < sheets.length; i++) if (sheets[i].visible()) visibleIndexes.push(i);
    renderer.tabSlotRects = visibleIndexes.map((index, k) => ({ index, x: 28 + k * 22, width: 22 }));
    for (let i = start; i < sheets.length && drawn < slots.length; i++) {
      const sheet = sheets[i]; if (!sheet.visible()) continue;
      const u = slots[drawn++].y, selected = i === active;
      ctx.fillStyle = '#ababab'; ctx.fillRect(6, u - 1, width - (right ? 12 : 6), 1);
      if (selected) { ctx.fillRect(5, u - 1, 1, 1); ctx.fillRect(5, u + 21, 1, 1); }
      if (selected) { ctx.fillStyle = 'white'; ctx.fillRect(right ? 0 : 7, u, width - 7, 21); }
      if (selected && sheet.options.sheetTabColor) {
        const x0 = right ? width - 17 : 7, gradient = ctx.createLinearGradient(x0 + 10, 0, x0, 0);
        gradient.addColorStop(0, '#ffffff'); gradient.addColorStop(1, resolveColor(sheet.options.sheetTabColor));
        ctx.fillStyle = gradient; ctx.fillRect(x0, u + 1, 10, 19);
      }
      if (!selected && sheet.options.sheetTabColor) { ctx.fillStyle = resolveColor(sheet.options.sheetTabColor); ctx.fillRect(right ? 2 : 9, u + 2, width - 11, 17); }
      if (selected) { ctx.fillStyle = '#217346'; ctx.fillRect(right ? width - 7 : 5, u - 1, 2, 23); }
      ctx.fillStyle = selected ? '#217346' : sheet.options.sheetTabColor ? 'white' : '#444';
      ctx.font = `${selected ? 'bold ' : ''}10pt "Segoe UI"`;
      ctx.fillText(sheet.name(), 11, u + 12);
      renderer.tabHits.push({ x: u, width: 21, index: i });
    }
    if (drawn) { ctx.fillStyle = '#ababab'; ctx.fillRect(6, 29 + drawn * 22 - 1, width - (right ? 12 : 6), 1); }
    const prevAvailable = sheets.some((sheet, index) => !!sheet.visible() && index < start);
    const ay = height - 17;
    ctx.fillStyle = resolveColor(prevAvailable ? '#0a6332' : '#c6c6c6');
    for (let i = 0; i < 4; i++) ctx.fillRect(26 - i, ay + i, 1 + i * 2, 1);
    ctx.fillStyle = resolveColor(overflow ? '#0a6332' : '#c6c6c6');
    for (let i = 0; i < 4; i++) ctx.fillRect(51 + i, ay + 1 + i, 7 - i * 2, 1);
    renderer.tabHits.push({ x: height - 29, width: 28, index: -2, cross: [13, 40] }, { x: height - 29, width: 28, index: -3, cross: [41, 68] });
}

export function filterButtonHit(renderer: WorkbookRenderer, x: number, y: number): { kind: 'table' | 'sheet'; col: number; table?: unknown } | null {
    const s = renderer.sheet;
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
      const rowSlot = renderer.rows.find((slot) => slot.index === header);
      if (!rowSlot) continue;
      for (const col of renderer.cols) {
        const index = col.index - range.col;
        if (index < 0 || index >= range.colCount || table.filterButtonVisible(index) === false) continue;
        if (geometry(col.position, rowSlot.position, col.size, rowSlot.size)) return { kind: 'table', col: col.index, table };
      }
    }
    const filter = s.rowFilter();
    if (filter && filter.range && renderer.headerHeight > 0) {
      for (const col of renderer.cols) {
        const index = col.index - filter.range.col;
        if (index < 0 || index >= filter.range.colCount || filter.filterButtonVisible(col.index) === false) continue;
        if (geometry(col.position, 0, col.size, renderer.headerHeight)) return { kind: 'sheet', col: col.index };
      }
    }
    return null;
}

export function outlineButtonHit(renderer: WorkbookRenderer, x: number, y: number): { axis: 'row' | 'col'; index: number } | null {
    const s = renderer.sheet;
    if (!s) return null;
    for (const run of s.rowOutlines._runs()) {
      const summary = renderer.rows.find((slot) => slot.index === run.index + run.count);
      if (!summary) continue;
      const top = summary.position + summary.size / 2 - 9;
      if (x >= 2 && x < 20 && y >= top && y < top + 18) return { axis: 'row', index: run.index };
    }
    for (const run of s.columnOutlines._runs()) {
      const summary = renderer.cols.find((slot) => slot.index === run.index + run.count);
      if (!summary) continue;
      const left = summary.position + summary.size / 2 - 9;
      if (y >= 2 && y < 20 && x >= left && x < left + 18) return { axis: 'col', index: run.index };
    }
    return null;
}
