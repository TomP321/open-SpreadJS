import { cachedImage } from '../features/image-cache.js';
import type { WorkbookRenderer } from '../rendering.js';
import type { TableSheet } from './index.js';

/**
 * The trial's TableSheet/GanttSheet bottom band (18px), replacing the classic 28px tab strip.
 * Measured from black-box crops/pixel scans of the trial's band (probe .probe/t54/strip-crop.mjs):
 * the left 72px is a steel-blue `#92a5c7` panel carrying four 18px buttons with black triangle
 * glyphs (first `|◀` at x4..11, prev `◀` 25..29, next `▶` 42..46, last `▶|` 60..67; glyph rows
 * 487..494 => band y 5..12); the rest is a continuous `#c1c1c1`→`#fafafa` gradient ending with a
 * 2x10px black tick at stripEnd-7. Sheet tabs sit in cells of `15 + text + 15` px ("Data" text
 * measured 87..113 from cell start 72), the ACTIVE tab outlined in `#92a5c7`: a bottom border
 * plus a "/"-slanted right edge (top at cellEnd+6, bottom at cellEnd-6). A `New…` pseudo-tab
 * (dark text, regular 11pt) follows the last tab cell in a 10+text+20px cell, sharing the
 * slanted separators. The band is canvas-drawn; the trial's scrollbars around it are DOM-only
 * and fully transparent (drawn as nothing).
 */
export function drawTableSheetBand(renderer: WorkbookRenderer, ctx: CanvasRenderingContext2D): void {
  const width = Number.parseFloat(renderer.tabs.style.width);
  const h = 18;
  ctx.clearRect(0, 0, width, h);
  // Navigation panel: steel blue field with four black triangle buttons.
  ctx.fillStyle = '#92a5c7';
  ctx.fillRect(0, 0, 72, h);
  ctx.fillStyle = '#000000';
  const triLeft = (tip: number, base: number): void => {
    ctx.beginPath();
    ctx.moveTo(tip, 9);
    ctx.lineTo(base, 5);
    ctx.lineTo(base, 13);
    ctx.closePath();
    ctx.fill();
  };
  const triRight = (base: number, tip: number): void => {
    ctx.beginPath();
    ctx.moveTo(base, 5);
    ctx.lineTo(tip, 9);
    ctx.lineTo(base, 13);
    ctx.closePath();
    ctx.fill();
  };
  ctx.fillRect(4, 5, 1, 9);
  triLeft(7, 11); triLeft(25, 29); triRight(42, 46); triRight(60, 64);
  ctx.fillRect(67, 5, 1, 9);
  // Body: continuous gradient across the remaining band, light tail behind the tick zone.
  const grad = ctx.createLinearGradient(72, 0, Math.max(73, width - 8), 0);
  grad.addColorStop(0, '#c1c1c1');
  grad.addColorStop(1, '#fafafa');
  ctx.fillStyle = grad;
  ctx.fillRect(72, 0, Math.max(0, width - 72), h);
  ctx.fillStyle = '#fdfdfd';
  if (width > 10) ctx.fillRect(width - 5, 0, 5, h);
  ctx.fillStyle = '#000000';
  ctx.fillRect(width - 7, 4, 2, 10);
  // Sheet tabs: 15px padding each side, active tab outlined with the slanted right edge.
  const options = renderer.workbook.options;
  const active = renderer.workbook.getActiveSheetIndex();
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  // Nav buttons reuse the classic prev/next hit indices (first->prev, last->next).
  renderer.tabHits.push({ x: 0, width: 18, index: -2 }, { x: 18, width: 18, index: -2 });
  renderer.tabHits.push({ x: 36, width: 18, index: -3 }, { x: 54, width: 18, index: -3 });
  ctx.font = 'bold 11pt Calibri';
  let x = 72;
  renderer.tabSlotRects = [];
  for (let i = renderer.workbook.startSheetIndex(); i < renderer.workbook.sheets.length; i++) {
    const sheet = renderer.workbook.sheets[i];
    if (!sheet.visible()) continue;
    const cellWidth = Math.round(ctx.measureText(sheet.name()).width) + 30;
    const selected = i === active;
    ctx.fillStyle = selected ? '#000000' : '#444444';
    ctx.fillText(sheet.name(), x + 15, 9);
    if (selected) {
      ctx.fillStyle = '#92a5c7';
      ctx.fillRect(x, h - 1, Math.min(cellWidth, width - x), 1);
      separator(ctx, x + cellWidth, width);
    }
    renderer.tabHits.push({ x, width: cellWidth, index: i });
    renderer.tabSlotRects.push({ index: i, x, width: cellWidth });
    x += cellWidth;
  }
  // "New…" pseudo-tab: dark regular text in a 10+text+20 cell with a slanted right edge.
  if (options.newTabVisible !== false) {
    ctx.font = '11pt Calibri';
    const label = 'New\u2026';
    const cellWidth = Math.round(ctx.measureText(label).width) + 30;
    ctx.fillStyle = '#161616';
    ctx.fillText(label, x + 10, 9);
    separator(ctx, x + cellWidth, width);
    renderer.tabHits.push({ x, width: cellWidth, index: -1 });
  }
}

/** Trial slanted tab separator: 1px `#92a5c7` line, "/" direction (top at end+6, bottom at end-6). */
function separator(ctx: CanvasRenderingContext2D, end: number, width: number): void {
  if (end > width - 8) return;
  ctx.strokeStyle = '#92a5c7';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(end + 6.5, 0);
  ctx.lineTo(end - 5.5, 17);
  ctx.stroke();
}


export function drawTableSheetHeaders(renderer: WorkbookRenderer, ctx: CanvasRenderingContext2D): void {
  const sheet = renderer.sheet!;
  const z = renderer.zoom;
  const tableSheet = sheet as TableSheet;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // The Gantt trial paints its column headers in regular (not bold) 11pt (measured width).
  ctx.font = '_isGanttSheet' in sheet ? `${14.6667 * z}px Calibri` : `bold ${14.6667 * z}px Calibri`;
  for (const col of renderer.cols) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(col.min, 0, col.max - col.min, renderer.headerHeight);
    ctx.clip();
    const count = sheet.getRowCount(1);
    let top = 0;
    let foreground = '#305f9b';
    for (let row = 0; row < count; row++) {
      const height = (sheet.getRowHeight(row, 1) ?? 30) * z;
      const span = sheet.getSpan(row, col.index, 1);
      if (span && row !== span.row) {
        top += height;
        continue;
      }
      const anchor = span?.col ?? col.index;
      let left = col.position;
      for (let index = anchor; index < col.index; index++) {
        if (sheet.getColumnVisible(index)) left -= (sheet.getColumnWidth(index) ?? 0) * z;
      }
      let width = col.size;
      let cellHeight = height;
      if (span) {
        width = 0;
        cellHeight = 0;
        for (let index = anchor; index < anchor + span.colCount; index++) {
          if (sheet.getColumnVisible(index)) width += (sheet.getColumnWidth(index) ?? 0) * z;
        }
        for (let index = row; index < row + span.rowCount; index++) {
          if (sheet.getRowVisible(index, 1)) cellHeight += (sheet.getRowHeight(index, 1) ?? 30) * z;
        }
      }
      const style = sheet.getActualStyle(row, anchor, 1);
      const background = typeof style.backColor === 'string' ? style.backColor : 'white';
      foreground = typeof style.foreColor === 'string' ? style.foreColor : '#305f9b';
      ctx.fillStyle = background;
      ctx.fillRect(left, top, width, cellHeight);
      ctx.fillStyle = '#000';
      ctx.fillRect(left + width - 1, top, 1, cellHeight);
      // Gantt headers close with a black edge one pixel lower (the row lines of the grid below
      // sit on the first pixel of the next row, and the header border joins them there).
      const gantt = '_isGanttSheet' in sheet;
      // Plain TableSheets close the header band with the same blue row line the data rows use
      // (trial #4f81bd at y29 over the data columns; the rowhdr keeps its black edge).
      ctx.fillStyle = gantt ? '#000' : count === 1 ? '#4d89ce' : '#5b9bd5';
      ctx.fillRect(left, top + cellHeight - (gantt ? 0 : 1), width, 1);
      ctx.fillStyle = foreground;
      // Trial centre offset: the caption sits 10.5px left of the column centre (a 21px button reserve).
      ctx.fillText(String(sheet.getValue(row, anchor, 1) ?? ''),
        left + (width - (row === count - 1 ? (gantt ? 21 : 16) * z : 0)) / 2, top + cellHeight / 2 + (gantt ? 1 : 0));
      top += height;
    }
    if (col.index < tableSheet._groupColumnCount() && tableSheet._groupColumnHasOutline(col.index)) {
      drawOutline(ctx, col.position + 6 * z, (renderer.headerHeight - 16 * z) / 2, z,
        tableSheet._groupHeaderCollapsed(col.index));
    }
    // Trial box (measured): 18x17 px with its right edge 2px inside the column edge; plain
    // TableSheets keep the 18x17 box at 18px from the edge.
    const ganttBtn = '_isGanttSheet' in sheet;
    const x = col.position + col.size - (ganttBtn ? 19 : 18) * z, y = renderer.headerHeight - 18 * z;
    ctx.strokeStyle = '#c4c4c4';
    ctx.strokeRect(x + 0.5, y + 0.5, (ganttBtn ? 17 : 16) * z, 16 * z);
    ctx.fillStyle = foreground;
    ctx.beginPath();
    // Trial glyph: 5-row arrow, top edge on y+6 and tip on y+10 (rows 28..32 of the 40px header).
    ctx.moveTo(x + 4 * z, y + 6 * z);
    ctx.lineTo(x + 12 * z, y + 6 * z);
    ctx.lineTo(x + 8 * z, y + 11 * z);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  for (const row of renderer.rows) for (const col of renderer.cols) {
    const hierarchy = tableSheet._hierarchyOutline(row.index, col.index);
    if (hierarchy?.hasChildren) {
      const x = col.position + hierarchy.offset * z, y = row.position + row.size / 2;
      ctx.strokeStyle = '#555';
      ctx.lineWidth = z;
      ctx.beginPath();
      if (hierarchy.collapsed) {
        ctx.moveTo(x, y - 4 * z); ctx.lineTo(x + 4 * z, y); ctx.lineTo(x, y + 4 * z);
      } else {
        ctx.moveTo(x, y - 2 * z); ctx.lineTo(x + 4 * z, y + 2 * z); ctx.lineTo(x + 8 * z, y - 2 * z);
      }
      ctx.stroke();
    }
    if (col.index < tableSheet._groupColumnCount()) {
      ctx.fillStyle = 'black';
      ctx.fillRect(Math.round(col.position + col.size) - 1, row.position, 1, row.size);
      if (tableSheet._groupRowHasOutline(row.index, col.index)) {
        drawOutline(ctx, col.position + 6 * z, row.position + (row.size - 16 * z) / 2, z,
          tableSheet._groupOutlineCollapsed(row.index, col.index));
      }
    }
  }
  ctx.font = `${14.6667 * z}px Calibri`;
  for (const row of renderer.rows) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, row.min, renderer.headerWidth, row.max - row.min);
    ctx.clip();
    ctx.fillStyle = 'white';
    ctx.fillRect(0, row.position, renderer.headerWidth, row.size);
    ctx.fillStyle = '#000';
    // Gantt: the rowhdr line of a row is the boundary pixel shared with the grid (its top edge,
    // already drawn for row 0 by the corner border); plain TableSheets keep the in-cell bottom edge.
    if ('_isGanttSheet' in sheet) ctx.fillRect(0, row.position, renderer.headerWidth, 1);
    else ctx.fillRect(0, row.position + row.size - 1, renderer.headerWidth, 1);
    ctx.fillRect(renderer.headerWidth - 1, row.position, 1, row.size);
    ctx.fillStyle = '#305f9b';
    const headerValue = String(sheet.getValue(row.index, 0, 2) ?? '');
    // The trial paints the trailing add-new row's star grey (#666/#7c7c7c measured), not the blue
    // it uses for row numbers.
    if (headerValue === '*') ctx.fillStyle = '#666666';
    ctx.fillText(headerValue, renderer.headerWidth / 2, row.position + row.size / 2);
    for (const level of tableSheet._groupHeaderOutlineLevels(row.index)) {
      drawOutline(ctx, (14 + 32 * level) * z, row.position + (row.size - 16 * z) / 2, z,
        tableSheet._groupHeaderOutlineCollapsed(row.index, level));
    }
    tableSheet.rowActionOptions().forEach((_action, index) => {
      const action = tableSheet._rowAction(row.index, index);
      if (!action || typeof action.icon !== 'string') return;
      const image = cachedImage(action.icon, () => sheet._invalidate());
      const size = action.size * z;
      if (image?.naturalWidth) ctx.drawImage(image, 2 * z + index * 18 * z, row.position + (row.size - size) / 2, size, size);
    });
    ctx.restore();
  }
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, renderer.headerWidth, renderer.headerHeight);
  ctx.fillStyle = '#c4c4c4';
  ctx.beginPath();
  ctx.moveTo(renderer.headerWidth - 4, 4);
  ctx.lineTo(renderer.headerWidth - 4, renderer.headerHeight - 4);
  ctx.lineTo(renderer.headerWidth - renderer.headerHeight + 4, renderer.headerHeight - 4);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#000';
  ctx.fillRect(renderer.headerWidth - 1, 0, 1, renderer.headerHeight);
  ctx.fillRect(0, renderer.headerHeight - ('_isGanttSheet' in sheet ? 0 : 1), renderer.headerWidth, 1);
  ctx.restore();
}

function drawOutline(ctx: CanvasRenderingContext2D, x: number, y: number, zoom: number, collapsed = false): void {
  ctx.save();
  ctx.fillStyle = 'white';
  ctx.fillRect(x, y, 16 * zoom, 16 * zoom);
  ctx.strokeStyle = 'black';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, 15 * zoom, 15 * zoom);
  ctx.fillStyle = 'black';
  ctx.fillRect(x + 4 * zoom, y + 7 * zoom, 8 * zoom, 1);
  if (collapsed) ctx.fillRect(x + 7 * zoom, y + 4 * zoom, 1, 8 * zoom);
  ctx.restore();
}
