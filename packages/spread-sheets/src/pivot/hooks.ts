/**
 * Pivot renderer hooks (TASK 41 item 3).
 * The pivot writes real cell values/styles; this pass adds the decorations
 * the trial draws over them: filter buttons (▾) on header cells and +/−
 * drill buttons on collapsible labels. Registered from src/index.ts via
 * `bindPivotHooks` (same pattern as the slicer host binding).
 */
import type { WorkbookRenderer } from '../rendering.js';
import type { Worksheet } from '../worksheet.js';
import type {} from './pivot-table.js';
import type { LayoutCell } from './layout.js';

interface PivotPatched {
  sheet?: Worksheet;
  cellRect(row: number, col: number): { x: number; y: number; width: number; height: number };
  context: CanvasRenderingContext2D;
  rows: { index: number; position: number; size: number }[];
  cols: { index: number; position: number; size: number }[];
}

/** Cells of every pivot on this sheet that want a glyph, in viewport order. */
function pivotDecorationCells(renderer: PivotPatched): { cell: LayoutCell; anchor: { row: number; col: number } }[] {
  const sheet = renderer.sheet as Worksheet | undefined;
  const manager = sheet?.pivotTables;
  if (!manager?._list) return [];
  const out: { cell: LayoutCell; anchor: { row: number; col: number } }[] = [];
  for (const table of manager._list()) {
    const anchor = table._position();
    for (const cell of table._layoutCells())
      if (cell.filterButton || cell.expand !== undefined) out.push({ cell, anchor });
  }
  return out;
}

function valueOf(renderer: PivotPatched, row: number, col: number): unknown {
  try { return renderer.sheet?.getValue(row, col); } catch { return undefined; }
}

export function drawPivotDecorations(renderer: WorkbookRenderer): void {
  const self = renderer as unknown as PivotPatched;
  const entries = pivotDecorationCells(self);
  if (!entries.length) return;
  const ctx = self.context;
  const slot = (row: number, col: number): { x: number; y: number; width: number; height: number } | null => {
    const r = self.rows.find(s => s.index === row);
    const c = self.cols.find(s => s.index === col);
    if (!r || !c) return null;
    return { x: c.position, y: r.position, width: c.size, height: r.size };
  };
  ctx.save();
  for (const { cell, anchor } of entries) {
    const rect = slot(anchor.row + cell.row, anchor.col + cell.col);
    if (!rect || rect.width < 6 || rect.height < 6) continue;
    if (cell.filterButton) {
      // The trial draws the dropdown right behind the header caption.
      const size = Math.max(6, Math.min(9, rect.height - 4));
      const label = String(valueOf(self, anchor.row + cell.row, anchor.col + cell.col) ?? '');
      let width = 0;
      if (label.length) {
        ctx.font = 'bold 13px Calibri, sans-serif';
        width = ctx.measureText(label).width;
      }
      const after = Math.round(rect.x + Math.min(width + 7, rect.width - 17));
      const x = Math.max(rect.x + 4, Math.min(after, rect.x + rect.width - 17));
      const boxWidth = Math.min(14, Math.max(9, rect.width - 8));
      const boxHeight = Math.min(14, Math.max(9, rect.height - 6));
      const y = Math.round(rect.y + (rect.height - boxHeight) / 2);
      // A small drop-down button: white field, grey frame and a dark chevron.
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x, y, boxWidth, boxHeight);
      ctx.strokeStyle = '#7f7f7f';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, boxWidth - 1, boxHeight - 1);
      const cx = x + boxWidth / 2;
      const cy = y + boxHeight / 2 + 1;
      ctx.fillStyle = '#4d4d4d';
      ctx.beginPath();
      ctx.moveTo(cx - size / 2, cy - size * 0.22);
      ctx.lineTo(cx + size / 2, cy - size * 0.22);
      ctx.lineTo(cx, cy + size * 0.45);
      ctx.closePath();
      ctx.fill();
    }
    if (cell.expand !== undefined) {
      // Excel-like drill buttons: 8 px boxes, indented per label level.
      const x = Math.round(rect.x + (cell.drillOffset ?? 11) + 0.5);
      const y = Math.round(rect.y + rect.height / 2 - 4);
      const box = 8;
      ctx.strokeStyle = '#696969';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, box, box);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x + 1, y + 1, box - 1, box - 1);
      ctx.strokeStyle = '#696969';
      ctx.beginPath();
      ctx.moveTo(x + 2, y + box / 2 + 0.5);
      ctx.lineTo(x + box - 1, y + box / 2 + 0.5);
      if (!cell.collapsed) {
        ctx.moveTo(x + box / 2 + 0.5, y + 2);
        ctx.lineTo(x + box / 2 + 0.5, y + box - 1);
      }
      ctx.stroke();
    }
  }
  ctx.restore();
}

let bound = false;

/** Wrap `WorkbookRenderer.prototype.paint` with the pivot decoration pass. */
export function bindPivotHooks(WorkbookRendererCtor: { prototype: { paint(): void; drawFilterButtons(ctx: CanvasRenderingContext2D): void } }): void {
  if (bound) return;
  bound = true;
  const prototype = WorkbookRendererCtor.prototype;
  const originalPaint = prototype.paint;
  prototype.paint = function (this: WorkbookRenderer): void {
    originalPaint.call(this);
    const manager = this.sheet?.pivotTables;
    if (manager?._list().length) drawPivotDecorations(this);
  };
}
