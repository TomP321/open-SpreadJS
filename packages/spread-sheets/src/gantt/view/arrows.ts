import type { Task } from '../project.js';
import type { TaskDependency, TaskDependencyType } from '../dependency.js';
import { taskBarSpan, ganttBarKind, ceilToDayForArrows, GANTT_DEFAULT_ROW_HEIGHT } from './chart.js';

/**
 * Dependency-arrow drawing for the Gantt chart part (FS / SS / FF / SF links between taskbars).
 * Every shape is our own canvas code; the routing model, colours and head sizes come from
 * black-box pixel measurement of the trial rendering:
 *
 * - FS: leaves the *from* bar's right edge at its mid-line, runs right by a small pad and drops
 *   vertically onto the *to* bar's top edge, ending in a down-pointing head on the bar.
 * - SS: leaves the left edge (pad to the left), drops to the target mid-line and runs right into
 *   the target's left edge with a right-pointing head.
 * - FF: runs right along the source mid-line to a vertical right of the target bar, drops to the
 *   target mid-line and enters its right edge with a left-pointing head.
 * - SF: leaves the left edge, drops beside the source, and enters the target's right edge with a
 *   left-pointing head; when the target edge lies right of the drop line the trial routes around
 *   the row between (down, right, down) — we reproduce that elbow. SF connectors paint in near
 *   black (measured (35,35,35)), the other three in the task blue #59A0E6.
 * - Lines are 1px wide and the taskbars paint over them (arrows are drawn below the bars).
 */

/** Colour of the FS/SS/FF connector lines and heads (measured core #59A0E6). */
export const GANTT_ARROW_COLOR = '#59A0E6';
/** SF connectors paint in near-black in the trial (measured (35,35,35)). */
export const GANTT_ARROW_COLOR_SF = '#232323';
/** Half the trial's line width is sub-pixel; strokes use raw (non-snapped) coordinates. */

/** Pads (px at the 30px reference row) measured from the trial routing. */
const FS_VPAD = 4.5;   // FS vertical right of the source bar's right edge
const SS_VPAD = 6.5;   // SS vertical left of the source bar's left edge
const FF_VPAD = 2.5;   // FF vertical right of the target bar's right edge
const SF_VPAD = 1.0;   // SF exit vertical left of the source bar's left edge
const SF_ARROUND = 7.5; // SF around-route: vertical right of the target bar's right edge

/** Arrow-head sizes at 30px rows (trial-ink measurements). */
const HEAD_V_HALF = 4;    // FS heads: 8px wide base
const HEAD_V_LEN = 4.5;   // FS heads: ~4px long
const HEAD_H_HALF = 3.75; // horizontal heads: ~7-8px tall base
const HEAD_H_LEN = 4.5;   // horizontal heads: ~4px long

/** The pixel rectangle of a task's bar drawing (leaf/summary/milestone), day-snapped like the bars. */
export function barGeometry(
  task: Task,
  rowTop: number,
  rowHeight: number,
  dateToX: (date: Date) => number,
): { left: number; right: number; midY: number; top: number; bottom: number } | undefined {
  const kind = ganttBarKind(task);
  const scale = rowHeight / GANTT_DEFAULT_ROW_HEIGHT;
  if (kind === 'milestone' || kind === 'manualMilestone') {
    const at = task.finishDisplayed ?? task.finish ?? task.startDisplayed ?? task.start;
    if (!at) return undefined;
    const cx = dateToX(ceilToDayForArrows(at)) + 0.5;
    const cy = Math.round(rowTop + 13 * scale);
    const half = Math.max(3, 5.5 * scale);
    return { left: cx - half, right: cx + half, midY: cy, top: cy - half, bottom: cy + half };
  }
  const span = taskBarSpan(task);
  if (!span) return undefined;
  const left = dateToX(span.start);
  const right = dateToX(span.finish);
  if (kind === 'projectSummary' || kind === 'summary') {
    // The connector lands on the summary's horizontal line (its top pixel).
    const lineY = Math.round(rowTop + 10 * scale);
    return { left, right, midY: lineY + 1.5, top: lineY, bottom: lineY + 2 };
  }
  const barTop = Math.round(rowTop + 10 * scale);
  const barHeight = Math.max(5, Math.round(11 * scale));
  return { left, right, midY: barTop + barHeight / 2, top: barTop, bottom: barTop + barHeight };
}

type Point = { x: number; y: number };
type Head = { x: number; y: number; dir: 'left' | 'right' | 'up' | 'down' };

/** The connector polyline + arrow head for one link, following the trial routing model. */
export function arrowRoute(
  from: { left: number; right: number; midY: number; top: number; bottom: number },
  to: { left: number; right: number; midY: number; top: number; bottom: number },
  type: TaskDependencyType,
  scale: number,
  /** Canvas y of the *to* task's row top (the SF around-route drops just above the row above). */
  toRowTop: number,
): { points: Point[]; head: Head } {
  const p = (v: number): number => v * scale;
  if (type === 'FS') {
    const vx = from.right + 1 + p(FS_VPAD);
    const down = to.top >= from.midY;
    const ey = down ? to.top : to.bottom;
    return {
      points: [{ x: from.right + 1, y: from.midY }, { x: vx, y: from.midY }, { x: vx, y: ey }],
      head: { x: vx, y: ey, dir: down ? 'down' : 'up' },
    };
  }
  if (type === 'SS') {
    const vx = from.left - 1 - p(SS_VPAD);
    return {
      points: [{ x: from.left, y: from.midY }, { x: vx, y: from.midY }, { x: vx, y: to.midY }, { x: to.left + 2, y: to.midY }],
      head: { x: to.left + 2, y: to.midY, dir: 'right' },
    };
  }
  if (type === 'FF') {
    const vx = to.right + 1 + p(FF_VPAD);
    return {
      points: [{ x: from.right + 1, y: from.midY }, { x: vx, y: from.midY }, { x: vx, y: to.midY }, { x: to.right, y: to.midY }],
      head: { x: to.right, y: to.midY, dir: 'left' },
    };
  }
  // SF: exit left, then either a plain drop into the target's right edge, or (when the target
  // edge sits right of the drop line, trial-observed) an elbow around the row between.
  const ex = from.left - 1 - p(SF_VPAD);
  if (to.right + p(SF_ARROUND) < ex) {
    return {
      points: [{ x: from.left, y: from.midY }, { x: ex, y: from.midY }, { x: ex, y: to.midY }, { x: to.right, y: to.midY }],
      head: { x: to.right, y: to.midY, dir: 'left' },
    };
  }
  const detourY = toRowTop - Math.max(1, scale * GANTT_DEFAULT_ROW_HEIGHT) - 0.5;
  const dx = to.right + 1 + p(SF_ARROUND);
  return {
    points: [
      { x: from.left, y: from.midY }, { x: ex, y: from.midY },
      { x: ex, y: detourY }, { x: dx, y: detourY }, { x: dx, y: to.midY },
      { x: to.right + 1, y: to.midY },
    ],
    head: { x: to.right + 1, y: to.midY, dir: 'left' },
  };
}

/** Fills the triangular arrow head at the connector's end point. */
function fillArrowHead(ctx: CanvasRenderingContext2D, head: Head, scale: number, color: string): void {
  const hw = head.dir === 'left' || head.dir === 'right' ? HEAD_H_HALF * scale : HEAD_V_HALF * scale;
  const len = head.dir === 'left' || head.dir === 'right' ? HEAD_H_LEN * scale : HEAD_V_LEN * scale;
  ctx.fillStyle = color;
  ctx.beginPath();
  if (head.dir === 'down') {
    ctx.moveTo(head.x - hw, head.y - len);
    ctx.lineTo(head.x + hw, head.y - len);
    ctx.lineTo(head.x, head.y);
  } else if (head.dir === 'up') {
    ctx.moveTo(head.x - hw, head.y + len);
    ctx.lineTo(head.x + hw, head.y + len);
    ctx.lineTo(head.x, head.y);
  } else if (head.dir === 'right') {
    ctx.moveTo(head.x, head.y);
    ctx.lineTo(head.x - len, head.y - hw);
    ctx.lineTo(head.x - len, head.y + hw);
  } else {
    ctx.moveTo(head.x, head.y);
    ctx.lineTo(head.x + len, head.y - hw);
    ctx.lineTo(head.x + len, head.y + hw);
  }
  ctx.closePath();
  ctx.fill();
}

/** Paints one connector polyline (1px, with the trial's half-pixel anti-aliasing) and its head. */
export function drawArrowPath(
  ctx: CanvasRenderingContext2D,
  points: Point[],
  head: Head,
  scale: number,
  color: string,
): void {
  if (points.length < 2) return;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.lineJoin = 'miter';
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length - 1; i++) ctx.lineTo(points[i].x, points[i].y);
  const last = points[points.length - 1];
  ctx.lineTo(last.x, last.y);
  ctx.stroke();
  fillArrowHead(ctx, head, scale, color);
  ctx.restore();
}

/** A dependency plus the grid rows of its two tasks, as the sheet hands them to the painter. */
export type GanttArrow = {
  dependency: TaskDependency<Task>;
  /** Grid row of the *from* task. */
  fromRow: number;
  /** Grid row of the *to* task. */
  toRow: number;
};

/** Draws the dependency connectors of the visible task set. `under` paints the FS/SS/FF lines
 *  (the trial draws them below the taskbars); `over` paints the SF lines (the trial draws them
 *  above the bars). */
export function drawDependencyArrows(
  ctx: CanvasRenderingContext2D,
  arrows: GanttArrow[],
  options: {
    x: number;
    width: number;
    bodyTop: number;
    bodyBottom: number;
    rowsTop: number;
    rowHeight: number;
    scrollY: number;
    dateToX: (date: Date) => number;
    pass: 'under' | 'over';
  },
): void {
  const { rowHeight } = options;
  const scale = rowHeight / GANTT_DEFAULT_ROW_HEIGHT;
  ctx.save();
  ctx.beginPath();
  ctx.rect(options.x, options.bodyTop, options.width + 2, options.bodyBottom - options.bodyTop);
  ctx.clip();
  for (const { dependency, fromRow, toRow } of arrows) {
    const isSf = dependency.type === 'SF';
    if ((options.pass === 'over') !== isSf) continue;
    const fromTop = options.rowsTop + fromRow * rowHeight - options.scrollY;
    const toTop = options.rowsTop + toRow * rowHeight - options.scrollY;
    if (Math.max(fromTop, toTop) + rowHeight < options.bodyTop || Math.min(fromTop, toTop) > options.bodyBottom) continue;
    const fromGeo = barGeometry(dependency.from, fromTop, rowHeight, options.dateToX);
    const toGeo = barGeometry(dependency.to, toTop, rowHeight, options.dateToX);
    if (!fromGeo || !toGeo) continue;
    const { points, head } = arrowRoute(fromGeo, toGeo, dependency.type, scale, toTop);
    drawArrowPath(ctx, points, head, scale, dependency.type === 'SF' ? GANTT_ARROW_COLOR_SF : GANTT_ARROW_COLOR);
  }
  ctx.restore();
}
