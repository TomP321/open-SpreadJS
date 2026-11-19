import type { Task } from '../project.js';
import type { GanttGridlines, IProgressLine, Timescale, TimescaleTier } from '../appearance.js';
import { drawDependencyArrows, type GanttArrow } from './arrows.js';
import { formatTierDate, tierTickIndexes, tierTickLabel, type TierFormatContext } from './tiers.js';

/**
 * Canvas drawing of the Gantt *chart* part (the area right of the splitter): timescale header,
 * non-working time shading, gridlines and taskbars. All shapes are drawn with our own code —
 * every position/colour below comes from black-box observation of the trial rendering.
 */

/** Pixels per day at zoomFactor 1; the trial measures 46.4px/day at zoom 1.449462890625. */
export const GANTT_BASE_DAY_WIDTH = 32;
/** Height of one timescale tier band (the trial header shows two 20px tiers). */
export const GANTT_TIER_HEIGHT = 20;
export const GANTT_HEADER_HEIGHT = 40;
/** Trial row height the bar/diamond offsets below are measured at (30px at sheet zoom 1). */
export const GANTT_DEFAULT_ROW_HEIGHT = 30;

/** Colours measured from the trial rendering. */
export const GANTT_COLORS = {
  headerText: '#000000',
  headerLine: '#000000',
  bodyBackground: '#FFFFFF',
  nonWorking: '#F7F7F7',
  todayLine: '#8BBF8A',
  projectLine: '#808080',
  barText: '#000000',
};

// The trial paints tier labels and bar texts in 12.8px of the sheet's Calibri (measured ink widths:
// "Mon" 24px, "Sat" 16px, "11/22" 28px, the milestone label 91px -- all match 12.8px, none matches 12px).
export const GANTT_TIER_FONT = '12.8px Calibri';
const HEADER_FONT = GANTT_TIER_FONT;

const startOfDay = (date: Date): Date => new Date(date.getFullYear(), date.getMonth(), date.getDate());
/** Calendar-safe `date + n` days (DST-proof: keeps 00:00). */
const addDays = (date: Date, days: number): Date =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);

/** `MM/dd` of a date, the trial top-tier (week) label at the default tier, e.g. "11/22". */
export function weekLabel(date: Date): string {
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${mm}/${dd}`;
}

/** `yyyy-MM-dd HH:mm`, the trial milestone right-text date format. */
export function barDateLabel(date: Date): string {
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())} ${p(date.getHours())}:${p(date.getMinutes())}`;
}

/** The task date the chart maps a bar start/finish to (displayed dates when present). */
const barStart = (task: Task): Date | undefined => task.startDisplayed ?? task.start ?? undefined;
const barFinish = (task: Task): Date | undefined => task.finishDisplayed ?? task.finish ?? undefined;
/**
 * Bars are drawn day-aligned: the start snaps down to the day start and the finish up to the
 * next midnight when it carries a time (the trial draws a task finishing 17:00 through 00:00).
 */
export const ceilToDayForArrows = (date: Date): Date => {
  const day = startOfDay(date);
  return day.getTime() === date.getTime() ? day : new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1);
};
const ceilToDay = ceilToDayForArrows;

/**
 * The pixel span of a task's bar: a summary rolls up over its leaf descendants (the trial draws
 * the project summary bar across the children's span, not across the summary's own dates).
 */
export function taskBarSpan(task: Task): { start: Date; finish: Date } | undefined {
  if (!task.isSummary) {
    const start = barStart(task);
    const finish = barFinish(task);
    return start && finish ? { start, finish: ceilToDay(finish) } : undefined;
  }
  let start: Date | undefined;
  let finish: Date | undefined;
  const walk = (node: Task): void => {
    const kids = node._childList();
    if (!kids.length) {
      // A milestone child contributes its diamond column (the trial summary bar starts where
      // its 17:00 milestone diamond is painted, not at the raw 11/18 date of the start).
      const s = node.isMilestone
        ? (() => { const at = barFinish(node) ?? barStart(node); return at ? ceilToDay(at) : undefined; })()
        : barStart(node);
      const f = barFinish(node);
      if (s && (!start || s < start)) start = s;
      if (f && (!finish || f > finish)) finish = f;
      return;
    }
    for (const child of kids) walk(child);
  };
  walk(task);
  return start && finish ? { start, finish: finish ? ceilToDay(finish) : finish } : undefined;
}

/** Earliest/latest displayed bar dates over all project rows (the trial's project gridlines). */
export function projectDateRange(tasks: Task[]): { start?: Date; finish?: Date } {
  let start: Date | undefined;
  let finish: Date | undefined;
  for (const task of tasks) {
    const span = taskBarSpan(task);
    if (!span) continue;
    if (!start || span.start < start) start = span.start;
    if (!finish || span.finish > finish) finish = span.finish;
  }
  return { start, finish };
}

export type GanttChartTask = {
  task: Task;
  /** Grid row of the task, i.e. the row band that holds this task's bar. */
  row: number;
};

export type GanttChartDrawOptions = {
  ctx: CanvasRenderingContext2D;
  /** Chart rectangle in canvas coordinates (header + body); x is one pixel right of the splitter. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Timescale whose zoomFactor drives the day width. */
  timescale: Timescale;
  /** Date whose 00:00 sits at the left edge of the chart. */
  originDate: Date;
  /** Horizontal scroll of the chart in pixels. */
  scrollX?: number;
  /** Tasks with their grid rows; rows outside the band are skipped. */
  tasks: GanttChartTask[];
  /** Canvas y of the first visible task row's top edge. */
  rowsTop: number;
  rowHeight: number;
  /** Vertical scroll of the rows in pixels. */
  scrollY?: number;
  /** Total task rows, used for the black border below the last row. */
  rowCount: number;
  /** Pixel height of the timescale header band (two tiers); defaults to 40. */
  headerHeight?: number;
  /** Date of the "today" gridline, or undefined to skip it. */
  currentDate?: Date;
  /** The sheet's gridline styles; drives the current-date line and styled row lines. */
  gridlines?: GanttGridlines;
  /** Project start/finish dates for the dashed vertical gridlines. */
  projectStart?: Date;
  projectFinish?: Date;
  /** Dependency connectors to paint between the gridlines and the taskbars. */
  arrows?: GanttArrow[];
  /** The sheet's progress line; drawn only when its `display` flag is set. */
  progressLine?: IProgressLine;
  /** `project.statusDate` — the reference date for a `statusDate`-based progress line. */
  statusDate?: Date | null;
};

/** Pixels per day for a timescale zoom factor. */
export function dayWidthFor(timescale: Timescale): number {
  return GANTT_BASE_DAY_WIDTH * timescale.zoomFactor;
}

/** Approximate day length of one tick per tier unit, used only to place the label of the last tick. */
const TIER_SPAN_DAYS: Record<number, number> = { 1: 365, 2: 182, 3: 91, 4: 30, 5: 10, 6: 7, 7: 1, 8: 1, 9: 1 };

/**
 * Day <-> pixel geometry of the chart body, shared by the painter and the pointer hit-tests so
 * both agree exactly on where every day column and bar edge sits.
 */
export type GanttChartGeometry = {
  origin: Date;
  dayWidth: number;
  /** Date of day column `i` (0 = the origin day). */
  dayAt: (i: number) => Date;
  /** Whole-day index of a date (DST-proof, calendar based). */
  columnIndex: (date: Date) => number;
  /** Fractional canvas x of day column `i`'s boundary. */
  columnPos: (i: number) => number;
  /** Snapped canvas x of day column `i`'s boundary line (the trial `floor`-snaps it). */
  columnX: (i: number) => number;
  /** Snapped canvas x of a date's day-column line. */
  dateToX: (date: Date) => number;
  /** Fractional day-column index under a canvas x (pointer position to date). */
  xToColumn: (x: number) => number;
};

export function ganttChartGeometry(o: { x: number; scrollX: number; dayWidth: number; originDate: Date }): GanttChartGeometry {
  const origin = startOfDay(o.originDate);
  const originUtc = Date.UTC(origin.getFullYear(), origin.getMonth(), origin.getDate());
  const columnIndex = (date: Date): number => {
    const d = startOfDay(date);
    return Math.round((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - originUtc) / 86400000);
  };
  const columnPos = (i: number): number => o.x - 1 - o.scrollX + i * o.dayWidth;
  const columnX = (i: number): number => Math.floor(columnPos(i));
  return {
    origin,
    dayWidth: o.dayWidth,
    dayAt: (i: number): Date => addDays(origin, i),
    columnIndex,
    columnPos,
    columnX,
    dateToX: (date: Date): number => columnX(columnIndex(date)),
    xToColumn: (px: number): number => (px - (o.x - 1 - o.scrollX)) / o.dayWidth,
  };
}

/**
 * Draws the whole chart part inside the given rectangle: white body, weekend shading, dashed
 * project start/finish lines, solid today line, taskbars with their progress and right texts,
 * and the two-tier timescale header (week labels + weekday letters with day ticks).
 *
 * Trial pixel model (measured natively from the trial rendering): day boundary lines sit at
 * `floor(splitter - scrollX + i * dayWidth)` — the position base is the splitter line itself,
 * one pixel left of the clipped chart rectangle; weekend fills span `[floor(start) + 1,
 * round(end) - 1]`, which leaves the white pixel the trial shows between adjacent columns.
 */
export function drawGanttChart(options: GanttChartDrawOptions): void {
  const { ctx, x, y, width, height, timescale, tasks, rowHeight } = options;
  const dayWidth = dayWidthFor(timescale) * (rowHeight / GANTT_DEFAULT_ROW_HEIGHT);
  const scrollX = options.scrollX ?? 0;
  const scrollY = options.scrollY ?? 0;
  const geometry = ganttChartGeometry({ x, scrollX, dayWidth, originDate: options.originDate });
  const { dayAt, columnPos, columnX, dateToX } = geometry;

  const headerHeight = options.headerHeight ?? GANTT_HEADER_HEIGHT;
  const bodyTop = y + headerHeight;
  const bodyBottom = y + height;
  // The trial fills the body white down to the viewport bottom but paints the weekend strips and
  // every vertical body line only through the task-row band (ending just above its bottom border).
  const rowsEnd = Math.min(bodyBottom, options.rowsTop + options.rowCount * rowHeight - scrollY);

  const firstColumn = Math.max(0, Math.floor((scrollX - 1) / dayWidth));
  const lastColumn = firstColumn + Math.ceil(width / dayWidth) + 1;

  ctx.save();
  ctx.beginPath();
  // +2: the trial's body paint reaches the canvas edge even when the layout viewWidth stops one
  // pixel short (the shared renderer leaves the plain-sheet border pixel uncovered otherwise).
  ctx.rect(x, y, width + 2, height + 2);
  ctx.clip();

  // --- body background ------------------------------------------------------
  ctx.fillStyle = GANTT_COLORS.bodyBackground;
  ctx.fillRect(x, bodyTop, width + 2, bodyBottom - bodyTop + 2);

  // --- non-working time shading (Saturdays and Sundays) ---------------------
  const nonWorking = timescale.nonWorkingTime;
  if (nonWorking.drawMode !== 'None') {
    ctx.fillStyle = nonWorking.color || GANTT_COLORS.nonWorking;
    for (let i = firstColumn; i < lastColumn; i++) {
      const dow = dayAt(i).getDay();
      if (dow !== 0 && dow !== 6) continue;
      const left = columnX(i) + 1;
      const right = Math.round(columnPos(i + 1)) - 1;
      if (right >= left) ctx.fillRect(left, bodyTop, right - left + 1, rowsEnd - bodyTop);
    }
  }

  const bodyLine = (px: number, color: string, dashed: boolean): void => {
    if (px < x - 1 || px > x + width + 1) return;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    if (dashed) ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(px + 0.5, bodyTop);
    ctx.lineTo(px + 0.5, rowsEnd);
    ctx.stroke();
    if (dashed) ctx.setLineDash([]);
  };

  // --- configured gridlines ---------------------------------------------------
  // Trial finding: in a GanttSheet chart none of the project-start/finish/tier gridlines paint
  // with the default styles; only the current-date line and (when styled) the row lines show.
  const gridlines = options.gridlines;
  const rowLines = gridlines?.ganttRows;
  if (rowLines && rowLines.lineColor && rowLines.lineColor !== 'transparent') {
    for (let row = 0; row < options.rowCount; row++) {
      const py = Math.round(options.rowsTop + (row + 1) * rowHeight - scrollY) + 0.5;
      if (py < bodyTop || py > bodyBottom) continue;
      ctx.strokeStyle = rowLines.lineColor;
      ctx.lineWidth = 1;
      if (rowLines.lineType === 4) ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(x, py);
      ctx.lineTo(x + width, py);
      ctx.stroke();
      if (rowLines.lineType === 4) ctx.setLineDash([]);
    }
  }
  if (options.currentDate && (!gridlines || (gridlines.currentDate.lineColor && gridlines.currentDate.lineType !== 0))) {
    bodyLine(dateToX(options.currentDate), gridlines?.currentDate.lineColor || GANTT_COLORS.todayLine, gridlines?.currentDate.lineType === 4);
  }

  // --- progress line (only when the sheet configures one with `display`) ------
  if (options.progressLine?.display && options.progressLine.lineStyle?.lineColor
    && options.progressLine.lineStyle.lineType !== 0) {
    const reference = options.progressLine.referenceDate === 'statusDate' && options.statusDate
      ? options.statusDate
      : options.currentDate;
    if (reference) drawProgressLine(ctx, options, geometry, bodyTop, rowsEnd, reference, options.progressLine);
  }

  // --- dependency connectors (FS/SS/FF paint below the bars, SF above) -----
  const arrowOptions = {
    x, width, bodyTop, bodyBottom: rowsEnd,
    rowsTop: options.rowsTop, rowHeight, scrollY, dateToX,
  };
  if (options.arrows && options.arrows.length) {
    drawDependencyArrows(ctx, options.arrows, { ...arrowOptions, pass: 'under' });
  }

  // --- taskbars ---------------------------------------------------------------
  for (const { task, row } of tasks) {
    const top = options.rowsTop + row * rowHeight - scrollY;
    if (top + rowHeight < bodyTop || top > bodyBottom) continue;
    drawTaskbar(ctx, task, top, rowHeight, dateToX);
  }

  // SF connectors paint over the taskbars (trial-observed).
  if (options.arrows && options.arrows.length) {
    drawDependencyArrows(ctx, options.arrows, { ...arrowOptions, pass: 'over' });
  }

  // --- black border below the last row ---------------------------------------
  const rowsBottom = options.rowsTop + options.rowCount * rowHeight - scrollY;
  if (rowsBottom > bodyTop && rowsBottom <= bodyBottom) {
    ctx.strokeStyle = GANTT_COLORS.headerLine;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, Math.round(rowsBottom) + 0.5);
    ctx.lineTo(x + width, Math.round(rowsBottom) + 0.5);
    ctx.stroke();
  }

  // --- timescale header -------------------------------------------------------
  ctx.fillStyle = GANTT_COLORS.bodyBackground;
  ctx.fillRect(x, y, width + 2, headerHeight);
  ctx.font = HEADER_FONT;
  ctx.textBaseline = 'middle';

  // One tier band: tick lines at the tier unit's calendar boundaries and the tick labels. The
  // lower band's ticks cut only through the band itself, the upper band's lines span the whole
  // header (trial: the week lines cross both tiers, the day ticks only the lower one).
  const bandHeight = Math.min(GANTT_TIER_HEIGHT, headerHeight);
  const tierFormat: TierFormatContext = { projectStart: options.projectStart, projectFinish: options.projectFinish };
  const drawTierBand = (tier: TimescaleTier, bandTop: number, spanFullHeader: boolean): void => {
    const ticks = tierTickIndexes(dayAt, firstColumn, lastColumn, tier);
    const lineTop = spanFullHeader ? y : bandTop + 1;
    const bandBottom = y + headerHeight;
    ctx.textAlign = tier.labelAlign === 'Center' ? 'center' : tier.labelAlign === 'Right' ? 'right' : 'left';
    for (let k = 0; k < ticks.length; k++) {
      const i = ticks[k];
      const left = columnX(i);
      if (left > x + width + 1) break;
      const next = ticks[k + 1] ?? i + TIER_SPAN_DAYS[tier.unit ?? 7] * Math.max(1, tier.count);
      if (columnX(next) <= x - 1) continue;
      if (tier.showTickLines && (i > firstColumn || scrollX > 0) && left >= x - 1) {
        ctx.strokeStyle = GANTT_COLORS.headerLine;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(left + 0.5, lineTop);
        ctx.lineTo(left + 0.5, bandBottom);
        ctx.stroke();
      }
      const label = tierTickLabel(dayAt(i), tier, dayWidth, tierFormat);
      if (!label) continue;
      ctx.fillStyle = GANTT_COLORS.headerText;
      const tx = tier.labelAlign === 'Center'
        ? (left + columnX(next) + 1) / 2
        : tier.labelAlign === 'Right' ? columnX(next) - 5 : left + 5;
      ctx.fillText(label, tx, bandTop + bandHeight / 2 + 3);
    }
  };
  drawTierBand(timescale.tierMode === 3 ? timescale.topTier : timescale.middleTier, y, true);
  drawTierBand(timescale.bottomTier, y + headerHeight - bandHeight, false);

  // header bottom border (the trial's line sits on the first body pixel, y = headerHeight).
  ctx.strokeStyle = GANTT_COLORS.headerLine;
  ctx.beginPath();
  ctx.moveTo(x, y + headerHeight + 0.5);
  ctx.lineTo(x + width, y + headerHeight + 0.5);
  ctx.stroke();

  ctx.restore();
}

/** Which trial built-in rule paints this task. */
export type GanttBarKind = 'projectSummary' | 'summary' | 'milestone' | 'manualMilestone' | 'manual' | 'task';

export function ganttBarKind(task: Task): GanttBarKind {
  if (task.taskNumber === 0) return 'projectSummary';
  if (task.isSummary) return 'summary';
  if (task.isMilestone) return task.mode === 'Manual' ? 'manualMilestone' : 'milestone';
  return task.mode === 'Manual' ? 'manual' : 'task';
}

const COLORS = {
  task: '#8ABBED', taskProgress: '#3B87D4',
  summary: '#545454', projectSummary: '#B6B6B6',
  manual: '#74CCD4', manualEdge: '#2BA3AD',
  milestone: '#636363', manualMilestone: '#2BA3AD',
};

/** Paints one task's bar. Trial geometry at the 30px default row: leaf bars are 11px tall at
 * rowTop + 10; summary bars are a 2px line at rowTop + 10 with 10px caps hanging at both ends
 * (the caps reach 1px past the line); milestone diamonds are 7x10 with their top at rowTop + 8. */
export function drawTaskbar(
  ctx: CanvasRenderingContext2D,
  task: Task,
  rowTop: number,
  rowHeight: number,
  dateToX: (date: Date) => number,
): void {
  const kind = ganttBarKind(task);
  const scale = rowHeight / GANTT_DEFAULT_ROW_HEIGHT;
  const barTop = Math.round(rowTop + 10 * scale);
  const span = taskBarSpan(task);

  if (kind === 'projectSummary' || kind === 'summary') {
    if (!span) return;
    const color = kind === 'projectSummary' ? COLORS.projectSummary : COLORS.summary;
    const left = dateToX(span.start);
    const right = dateToX(span.finish);
    if (right < left) return;
    const capHeight = Math.max(4, Math.round(11 * scale));
    ctx.fillStyle = color;
    ctx.fillRect(left, barTop, right - left + 1, Math.max(1, Math.round(2 * scale)));
    ctx.fillRect(left - 1, barTop, 4, capHeight);
    ctx.fillRect(right - 2, barTop, 4, capHeight);
    return;
  }

  if (kind === 'milestone' || kind === 'manualMilestone') {
    const at = barFinish(task) ?? barStart(task);
    if (!at) return;
    const color = kind === 'milestone' ? COLORS.milestone : COLORS.manualMilestone;
    const cx = dateToX(ceilToDay(at)) + 0.5;
    const cy = Math.round(rowTop + 13 * scale);
    // Trial diamond: 11x11 px at the row's default height (measured ink 986-996 x 137-147).
    const half = Math.max(3, 5.5 * scale);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(cx, cy - half);
    ctx.lineTo(cx + half, cy);
    ctx.lineTo(cx, cy + half);
    ctx.lineTo(cx - half, cy);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = GANTT_COLORS.barText;
    ctx.font = HEADER_FONT;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    // The trial's label inks 1-2px below the diamond's centre (measured y140-147 vs centre 142).
    ctx.fillText(barDateLabel(at), cx + half + 6, cy + 1.5);
    return;
  }

  if (!span) return;
  const left = dateToX(span.start);
  const right = Math.max(left, dateToX(span.finish));
  const barHeight = Math.max(5, Math.round(11 * scale));
  const color = kind === 'manual' ? COLORS.manual : COLORS.task;
  ctx.fillStyle = color;
  ctx.fillRect(left, barTop, right - left + 1, barHeight);
  if (kind === 'manual') {
    ctx.fillStyle = COLORS.manualEdge;
    ctx.fillRect(left, barTop, 2, barHeight);
    ctx.fillRect(right - 1, barTop, 2, barHeight);
  }
  // The engine stores `complete` as a 0..1 fraction (trial semantics), as does the progress fill.
  const complete = Math.max(0, Math.min(1, task.complete ?? 0));
  if (complete > 0) {
    ctx.fillStyle = kind === 'manual' ? COLORS.manualEdge : COLORS.taskProgress;
    ctx.fillRect(left, barTop, Math.max(1, Math.round((right - left + 1) * complete)), barHeight);
  }
}

/**
 * Paints the configured progress line: a vertical reference-date line through the task-row band,
 * one progress point per visible leaf task (at the x the task's `complete` fraction implies along
 * its bar — where the progress fill ends), the points joined per `pathType` (orthogonal segments
 * run horizontally from the reference line, diagonal ones straight point-to-point;
 * `returnToReferenceDate` pulls every point back to the line), and the optional date label at the
 * line's top. The semantics follow the public `IProgressLine` property documentation; the trial's
 * exact look cannot be compared until it renders one (its `progressLine` is undefined by default).
 */
function drawProgressLine(
  ctx: CanvasRenderingContext2D,
  options: GanttChartDrawOptions,
  geometry: GanttChartGeometry,
  bodyTop: number,
  rowsEnd: number,
  reference: Date,
  line: IProgressLine,
): void {
  const { x, width } = options;
  const dayBegin = startOfDay(reference);
  const lineX = geometry.columnPos(geometry.columnIndex(reference))
    + ((reference.getTime() - dayBegin.getTime()) / 86400000) * geometry.dayWidth;
  if (lineX < x - 1 || lineX > x + width + 1) return;
  const color = line.lineStyle.lineColor;

  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  if (line.lineStyle.lineType === 4) ctx.setLineDash([4, 3]);
  ctx.beginPath();
  ctx.moveTo(lineX, bodyTop);
  ctx.lineTo(lineX, rowsEnd);
  ctx.stroke();
  ctx.setLineDash([]);

  // Progress points: the tasks that report progress, in row order.
  const points: { x: number; y: number }[] = [];
  for (const { task, row } of options.tasks) {
    if (task.isSummary) continue;
    const span = taskBarSpan(task);
    if (!span) continue;
    const complete = Math.max(0, Math.min(1, task.complete ?? 0));
    if (complete <= 0) continue;
    const left = geometry.dateToX(span.start);
    const right = Math.max(left, geometry.dateToX(span.finish));
    const py = options.rowsTop + row * options.rowHeight - (options.scrollY ?? 0) + options.rowHeight / 2;
    if (py < bodyTop || py > rowsEnd) continue;
    points.push({ x: left + (right - left + 1) * complete, y: py });
  }

  // Connecting path between the reference line and the progress points.
  if (points.length) {
    ctx.beginPath();
    if (line.pathType?.returnToReferenceDate) {
      for (const p of points) {
        ctx.moveTo(lineX, p.y);
        ctx.lineTo(p.x, p.y);
      }
    } else {
      let fromX = lineX;
      let fromY = points[0].y;
      for (const p of points) {
        ctx.moveTo(fromX, fromY);
        if (line.pathType?.pointConnectionType === 'diagonal') {
          ctx.lineTo(p.x, p.y);
        } else {
          ctx.lineTo(p.x, fromY);
          ctx.lineTo(p.x, p.y);
        }
        fromX = p.x;
        fromY = p.y;
      }
    }
    ctx.stroke();
    const pointColor = line.pointStyle?.color || color;
    for (const p of points) drawProgressPoint(ctx, p.x, p.y, line.pointStyle?.shape, pointColor, options.rowHeight);
  }

  if (line.dateLabelStyle?.display) {
    const text = formatTierDate(reference, line.dateLabelStyle.format || 'yyyy/MM/dd HH:mm',
      { projectStart: options.projectStart, projectFinish: options.projectFinish });
    ctx.font = line.dateLabelStyle.font || GANTT_TIER_FONT;
    ctx.fillStyle = color;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, lineX + 3, bodyTop + 8);
  }
  ctx.restore();
}

/** Paints one progress-line point; unknown `ProgressPointShape` names fall back to a circle. */
function drawProgressPoint(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  shape: string | undefined,
  color: string,
  rowHeight: number,
): void {
  const r = Math.max(2.5, Math.min(5, rowHeight / 8));
  ctx.fillStyle = color;
  ctx.beginPath();
  switch (shape) {
    case 'diamond':
      ctx.moveTo(px, py - r);
      ctx.lineTo(px + r, py);
      ctx.lineTo(px, py + r);
      ctx.lineTo(px - r, py);
      ctx.closePath();
      break;
    case 'square':
      ctx.rect(px - r, py - r, 2 * r, 2 * r);
      break;
    case 'triangleDown':
      ctx.moveTo(px - r, py - r);
      ctx.lineTo(px + r, py - r);
      ctx.lineTo(px, py + r);
      ctx.closePath();
      break;
    case 'triangleLeft':
      ctx.moveTo(px + r, py - r);
      ctx.lineTo(px + r, py + r);
      ctx.lineTo(px - r, py);
      ctx.closePath();
      break;
    case 'triangleRight':
      ctx.moveTo(px - r, py - r);
      ctx.lineTo(px - r, py + r);
      ctx.lineTo(px + r, py);
      ctx.closePath();
      break;
    case 'triangleUp':
    default:
      ctx.moveTo(px, py - r);
      ctx.lineTo(px + r, py + r);
      ctx.lineTo(px - r, py + r);
      ctx.closePath();
      break;
  }
  ctx.fill();
}
