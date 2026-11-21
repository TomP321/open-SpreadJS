import { TableSheet, registerSheetTabJSONHook } from '../../tablesheet/index.js';
import { View } from '../../data/index.js';
import { Range, Style } from '../../primitives.js';
import { dateToSerial, serialToDate } from '../../formatter.js';
import { Project, type Task } from '../project.js';
import { GanttMapping } from '../mapping.js';
import { addWorkingTime, workDayLength } from '../work-time.js';
import {
  GanttGridlines, type IGanttSheetOptions, type IProgressLine, TimescaleTier,
} from '../appearance.js';
import {
  drawGanttChart, projectDateRange, GANTT_BASE_DAY_WIDTH, GANTT_DEFAULT_ROW_HEIGHT,
  ganttChartGeometry, type GanttChartGeometry, type GanttChartTask,
} from '../view/chart.js';
import { barGeometry, drawArrowPath, GANTT_ARROW_COLOR, type GanttArrow } from '../view/arrows.js';
import { asRecord } from '../../object-access.js';

/** One column of the task grid on the left part of a GanttSheet. */
export type GanttColumn = {
  /** Task field the column reads and writes. */
  field: string;
  /** Column header caption shown in the trial. */
  caption: string;
  /** Default column width in pixels. */
  width: number;
};

/** The task fields a bound data view may carry, matched case-insensitively by column name. */
const TASK_FIELDS = new Set(['name', 'start', 'finish', 'duration', 'mode', 'complete',
  'predecessors', 'successors', 'ismilestone', 'milestone', 'level', 'tasknumber']);

/** The trial's default task grid columns (widths measured from the trial rendering). */
export const DEFAULT_GANTT_COLUMNS: GanttColumn[] = [
  { field: 'tasknumber', caption: 'NO.', width: 60 },
  { field: 'name', caption: 'Task Name', width: 200 },
  { field: 'duration', caption: 'Duration', width: 90 },
  { field: 'start', caption: 'Start', width: 110 },
  { field: 'finish', caption: 'Finish', width: 110 },
  { field: 'predecessors', caption: 'Predecessors', width: 120 },
];

const isDate = (value: unknown): value is Date => value instanceof Date && !Number.isNaN(value.getTime());

/** The subset of the canvas renderer a GanttSheet paints against (structural to avoid an import cycle). */
export type GanttRenderer = {
  zoom: number;
  headerWidth: number;
  headerHeight: number;
  viewWidth: number;
  viewHeight: number;
  scrollX: number;
  scrollY: number;
};

/**
 * A Gantt sheet: a TableSheet whose left grid is driven by a scheduling {@link Project} and whose
 * right chart area is drawn on the canvas. The project is the single source of truth: grid rows map
 * to project tasks (in row order), grid edits go through the project setters and reschedule.
 */
export class GanttSheet extends TableSheet {
  readonly _isGanttSheet = true;
  private projectValue: Project;
  private boundView?: View;
  private viewUnsubscribe?: () => void;
  private ganttOptions: IGanttSheetOptions = {};
  private columnsValue: GanttColumn[] = [];
  readonly gridlines = new GanttGridlines();
  /** `undefined` while no progress line is defined, matching the trial. */
  progressLine: IProgressLine | undefined;

  get project(): Project { return this.projectValue; }
  /** The project's mapping, exposed as the sheet-level `mapping`. */
  get mapping(): GanttMapping { return this.projectValue.mapping; }

  constructor(name = 'GanttSheet1', dataView?: View) {
    super(name);
    this.defaults.rowHeight = 30;
    this.defaults.colHeaderRowHeight = 40;
    this.projectValue = new Project(name);
    // Timescale changes (zoom, tiers) must repaint the chart part.
    this.projectValue.timescale._onChange = () => this._invalidate();
    // Trial parity (probe .probe/t54/probe-t54-gantt-grid.json): a GanttSheet with NO bound data
    // view carries no task grid at all — `getRowCount()/getColumnCount()` are 0, every `getValue`
    // is empty and the sheet paints nothing beyond its chrome; the task grid exists only for a
    // bound view. The project model APIs keep working on the unbound sheet.
    if (dataView) this.bindGanttView(dataView);
    else this.rebuildGrid();
  }

  /** Repaint when painting resumes: the project may have changed while painting was suspended. */
  override resumePaint(): void {
    super.resumePaint();
    this.rebuildGrid();
  }

  /**
   * Binds a data view to the sheet and builds the scheduling project through the mapping. Every
   * bound row becomes a task; columns whose names match task fields are imported with
   * {@link GanttMapping} conversions. The options select the extra gantt column, new-row policy,
   * tab colour and the default scheduling mode for imported tasks.
   */
  bindGanttView(dataView: View, options?: IGanttSheetOptions): void {
    this.viewUnsubscribe?.();
    this.boundView = dataView;
    if (!this.columnsValue.length) this.columnsValue = DEFAULT_GANTT_COLUMNS.map(column => ({ ...column }));
    this.ganttOptions = options ?? {};
    const defaultMode = this.ganttOptions.defaultMode === 'Manual' ? 'Manual' : 'Auto';
    this.projectValue.suspendSchedule();
    try {
      this.importFromView(dataView, defaultMode);
    } finally {
      this.projectValue.resumeSchedule();
    }
    // Keep the project in sync when the bound data view changes underneath us.
    this.viewUnsubscribe = dataView.onChanged(() => {
      this.projectValue.suspendSchedule();
      try { this.importFromView(dataView, defaultMode); } finally { this.projectValue.resumeSchedule(); }
      this.rebuildGrid();
    });
    this.rebuildGrid();
    if (options?.sheetTabColor)
      (this.options as { sheetTabColor?: string }).sheetTabColor = options.sheetTabColor;
  }

  /** Replaces the project's tasks with the current contents of the bound view. */
  private importFromView(dataView: View, defaultMode: 'Auto' | 'Manual'): void {
    const columns = dataView.getColumn() as Record<string, unknown>[];
    // Map each view column to a task field, if its name matches one of the task fields.
    const fieldByColumn = columns.map(column => {
      const key = String(column.value ?? column.name ?? '').toLowerCase();
      const base = key.replace(/^@/, '').replace(/[[\]]/g, '');
      return TASK_FIELDS.has(base) ? base : undefined;
    });
    const rootName = this.projectValue.root.name;
    // Drop existing tasks so a re-bind does not duplicate them.
    if (this.projectValue.count > 1) this.projectValue.removeTasks(Array.from({ length: this.projectValue.count - 1 }, (_, i) => i + 1));
    const length = dataView.visibleLength();
    const pending: { task: Task; predecessors?: string; successors?: string }[] = [];
    for (let row = 0; row < length; row++) {
      const data = dataView.getRowData(row) as Record<string, unknown>;
      const task: Record<string, unknown> = { mode: defaultMode };
      fieldByColumn.forEach((field, index) => {
        if (!field) return;
        const raw = data[String(columns[index]?.value ?? columns[index]?.name)];
        task[field] = this.importValue(field, raw);
      });
      if (task.name === undefined) task.name = `Task ${this.projectValue.count}`;
      // Dependency strings are applied after every task exists, like a manual edit sequence.
      const predecessors = typeof task.predecessors === 'string' && task.predecessors ? task.predecessors : undefined;
      const successors = typeof task.successors === 'string' && task.successors ? task.successors : undefined;
      delete task.predecessors;
      delete task.successors;
      const [created] = this.projectValue.addTasks(task as Parameters<Project['addTasks']>[0]);
      if (created && (predecessors || successors)) pending.push({ task: created, predecessors, successors });
    }
    for (const { task, predecessors, successors } of pending) {
      if (predecessors) task.predecessors = predecessors;
      if (successors) task.successors = successors;
    }
    this.projectValue.root.name = rootName;
  }

  /** Converts one raw bound value to the value type the task setter expects. */
  private importValue(field: string, raw: unknown): unknown {
    const mapping = this.mapping;
    switch (field) {
      case 'start':
      case 'finish': {
        if (isDate(raw)) return raw;
        return mapping.parseDate(raw) ?? (raw === null ? null : raw);
      }
      case 'duration': return mapping.parseDuration(raw);
      case 'mode': return mapping.parseMode(raw) ?? 'Auto';
      case 'complete': { const value = mapping.parseInt(raw); return value === undefined ? raw : value; }
      case 'predecessors':
      case 'successors': return raw === undefined || raw === null ? undefined : String(raw);
      case 'ismilestone':
      case 'milestone': return mapping.parseBoolean(raw) ?? undefined;
      default: return raw;
    }
  }

  /** True when the extra gantt column should appear next to the task grid. */
  enableGanttColumn(): boolean { return this.ganttOptions.enableGanttColumn ?? true; }
  /** Whether the grid allows adding a trailing empty row. */
  allowAddNew(): boolean { return this.ganttOptions.allowAddNew ?? true; }

  /** The task grid columns currently driving the sheet. */
  _columns(): GanttColumn[] { return this.columnsValue; }
  /** Sets the grid columns and resizes the sheet to the project + chart layout. */
  _setColumns(columns: GanttColumn[]): void {
    this.columnsValue = columns;
    for (const [index, column] of columns.entries()) this.setColumnWidth(index, column.width);
    this.rebuildGrid();
  }

  /** Resizes the sheet rows to match the project's task rows (an unbound sheet keeps no grid). */
  rebuildGrid(): void {
    const rows = this.boundView ? this.projectValue.count : 0;
    this.gridRows = rows;
    this.setRowCount(rows);
    this.setColumnCount(this.columnsValue.length);
    for (const [index, column] of this.columnsValue.entries()) this.setColumnWidth(index, column.width);
    this._applyGridStyles();
    this._invalidate();
  }

  /** Row count the physical grid was last resized to (kept in sync lazily in `_rowLayout`). */
  private gridRows = -1;

  /**
   * The project is the source of truth for row count and every scheduling or task-edit API may
   * change it without notifying the sheet, so the row geometry is refreshed lazily: whenever the
   * grid asks for the viewport row layout, a diverged project row count rebuilds the grid first.
   */
  override _rowLayout(area = 3): ReturnType<TableSheet['_rowLayout']> {
    const base = () => super._rowLayout(area);
    // During construction (field initialisers and the base constructor) the project may not exist yet.
    if (!this.projectValue || this.gridRows === undefined) return base();
    if ((area === undefined || area === 3 || area === -1) && this.boundView && this.gridRows !== this.projectValue.count) {
      this.rebuildGrid();
      return this._rowLayout(area);
    }
    return base();
  }

  /**
   * Trial grid styles: black text everywhere (unlike the blue TableSheet theme), the project
   * row (row 0) bold, nested names indented, and plain dropdown arrows in the date columns —
   * they squeeze the date text so it overflows as `##########`, exactly like the trial.
   */
  override getActualStyle(row: number, col: number, area = 3, sheetStyleOnly = false): Style {
    const style = super.getActualStyle(row, col, area, sheetStyleOnly);
    if (area === 1 || area === 3) style.foreColor = '#000000';
    if (area === 3 && this.columnsValue.length === this.getColumnCount(3)) {
      const field = this.columnsValue[col]?.field;
      if (field === 'start' || field === 'finish') {
        // Trial button geometry: triangle centred 10.5px left of the column edge (glyph centre =
        // right edge - width + 2.5 + 8 with our layout, so width 21 lands it there).
        style.cellButtons = [{ position: 1, imageType: 5, width: 21 }];
      }
    }
    return style;
  }

  /**
   * The trial grid bolds the project row (row 0) at 16px and every summary row at 11pt
   * (measured ink: "GanttSheet1" 84px = bold 16px, "Build" 34px = bold 11pt); names are never
   * indented. Summary rows paint their text 4px above the plain middle line (see `_ganttTextNudge`).
   */
  private _applyGridStyles(): void {
    const rows = this.projectValue.count;
    if (rows > 2000) return;
    for (let row = 0; row < rows; row++) {
      const task = this.projectValue.getTaskByRow(row);
      if (row === 0 || (task && task.isSummary)) {
        const style = new Style();
        style.font = row === 0 ? 'bold 16px Calibri' : 'bold 11pt Calibri';
        for (let col = 0; col < this.columnsValue.length; col++) this.setStyle(row, col, style, 3);
      }
    }
  }

  /** The task shown on a grid row (row order, so it respects `sort`). */
  private _taskAt(row: number): Task | undefined { return this.projectValue.getTaskByRow(row); }

  override getRowCount(area = 3): number {
    if (area === 3 || area === -1) return this.boundView ? this.projectValue.count : 0;
    return super.getRowCount(area);
  }
  override getColumnCount(area = 3): number {
    return area === 3 || area === -1 ? this.columnsValue.length : super.getColumnCount(area);
  }

  override getValue(row: number, col: number, area = 3, valueType = 0): unknown {
    if (area === 1) return this.columnsValue[col]?.caption;
    // The trial leaves the row headers empty; the task numbers live in the NO. column.
    if (area === 2) return '';
    if (area !== 3) return super.getValue(row, col, area, valueType);
    const task = this._taskAt(row);
    const column = this.columnsValue[col];
    if (!task || !column) return undefined;
    return this._formatField(task, column.field);
  }

  override getText(row: number, col: number, area = 3): string {
    const value = this.getValue(row, col, area);
    return value == null ? '' : String(value);
  }

  /** Formats a task field the way the trial grid shows it (dates, durations, numbers, predecessors). */
  private _formatField(task: Task, field: string): unknown {
    switch (field) {
      case 'start':
      case 'finish': { const date = this._formatFieldRaw(task, field); return isDate(date) ? this.mapping.formatDate(date) : undefined; }
      case 'duration': return task.duration === undefined || task.duration === null
        ? undefined : this.mapping.formatDuration(task.duration);
      default: return this._formatFieldRaw(task, field);
    }
  }

  /** The unpainted task value: dates stay real Dates so the canvas paints (and hashes) them. */
  private _formatFieldRaw(task: Task, field: string): unknown {
    switch (field) {
      case 'tasknumber': return task.taskNumber;
      case 'name': return task.name;
      case 'start': return task.startDisplayed ?? task.start ?? undefined;
      case 'finish': return task.finishDisplayed ?? task.finish ?? undefined;
      case 'complete': return task.complete;
      case 'mode': return task.mode;
      case 'predecessors': return task.predecessors;
      case 'successors': return task.successors;
      default: return task.getValue(field);
    }
  }

  /**
   * The value the canvas paints: the trial's date cells hold real Dates (their text comes from a
   * formatter, and a too-narrow cell overflows as `##########`), so the date columns paint Dates
   * while {@link getValue} keeps returning the formatted strings the public grid API shows.
   */
  _renderValue(row: number, col: number): unknown {
    const task = this._taskAt(row);
    const column = this.columnsValue[col];
    if (!task || !column) return undefined;
    return this._formatFieldRaw(task, column.field);
  }

  /**
   * Per-row vertical text nudge (CSS px) the shared cell painter adds to the Gantt middle
   * baseline. The trial paints summary-row text 4px above the middle line of the row
   * (measured: "Build" baseline at rowTop+15 vs rowTop+19 for plain rows); all other rows 0.
   */
  _ganttTextNudge(row: number): number {
    if (row === 0) return 0;
    const task = this.projectValue.getTaskByRow(row);
    return task && task.isSummary ? -4 : 0;
  }

  /** Grid edits (name/duration/start/finish/predecessors) write through the task setters and reschedule. */
  override setValue(row: number, col: number, value: unknown, area = 3, ignoreRecalc = false): void {
    if (area !== 3) { super.setValue(row, col, value, area, ignoreRecalc); return; }
    const task = this._taskAt(row);
    const column = this.columnsValue[col];
    if (!task || !column) return;
    this.applyTaskEdit(task, column.field, value);
    this._invalidate();
  }

  /** Writes one edited grid value into the matching task field, converting through the mapping. */
  applyTaskEdit(task: Task, field: string, value: unknown): void {
    const mapping = this.mapping;
    switch (field) {
      case 'name': task.name = value === undefined || value === null ? undefined : String(value); break;
      case 'duration': task.duration = mapping.parseDuration(value); break;
      case 'start': task.start = isDate(value) ? value : (value === null || value === '' ? null : mapping.parseDate(value) ?? null); break;
      case 'finish': task.finish = isDate(value) ? value : (value === null || value === '' ? null : mapping.parseDate(value) ?? null); break;
      case 'complete': { const parsed = mapping.parseInt(value); if (parsed !== undefined) task.complete = parsed; break; }
      case 'mode': { const parsed = mapping.parseMode(value); if (parsed) task.mode = parsed; break; }
      case 'predecessors': task.predecessors = value === undefined || value === null ? '' : String(value); break;
      case 'successors': task.successors = value === undefined || value === null ? '' : String(value); break;
    }
  }

  /** The task on the active grid row. */
  getActiveTask(): Task { return this.projectValue.getTaskByRow(this.getActiveRowIndex()) as Task; }

  /** The task at a specific grid row. */
  getTaskByRow(rowIndex: number): Task { return this.projectValue.getTaskByRow(rowIndex) as Task; }

  /** Selection ranges in the grid area. */
  override getSelections(): Range[] { return super.getSelections(); }

  // ---------------------------------------------------------------------------
  // Canvas view (chart part right of the splitter, plus the grid extensions the
  // regular cell painter cannot produce: the add-new row and the row-header star).
  // ---------------------------------------------------------------------------

  /** Grid + task rows below the header, including the trial's trailing add-new row. */
  private _visualRowCount(): number {
    return this.projectValue.count + (this.allowAddNew() ? 1 : 0);
  }

  /** Paints the splitter, the add-new row band and the whole Gantt chart part. */
  _paintChart(renderer: GanttRenderer, ctx: CanvasRenderingContext2D): void {
    if (!this.boundView) return; // trial: an unbound GanttSheet paints no chart (probe gantt-grid)
    const zoom = renderer.zoom;
    const headerWidth = renderer.headerWidth;
    const headerHeight = renderer.headerHeight;
    const rowHeight = this.defaults.rowHeight * zoom;
    const taskRows = this.projectValue.count;
    const visualRows = this._visualRowCount();
    const addNew = this.allowAddNew();
    const gridWidth = headerWidth + this._columnLayout().prefixSum(this.columnsValue.length) * zoom;
    // Trial: the 1px black splitter pixel IS the grid's last column edge (gridWidth - 1) and the
    // chart column positions are measured from that same line, with the clip starting one px right.
    const splitter = Math.round(Math.min(gridWidth, renderer.viewWidth)) - 1;
    const scrollY = renderer.scrollY * zoom;

    ctx.save();
    // The 1px black splitter between the task grid and the chart spans the viewport height.
    ctx.fillStyle = '#000000';
    ctx.fillRect(splitter, 0, 1, renderer.viewHeight);

    // Grid extension: the empty add-new row band (white, black cell edges, plain dropdown
    // arrows in the date columns) and its row-header star.
    const bandTop = Math.round(headerHeight + taskRows * rowHeight - scrollY);
    if (addNew && bandTop < renderer.viewHeight) {
      const bandBottom = Math.min(bandTop + Math.round(rowHeight), renderer.viewHeight);
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, bandTop, splitter, bandBottom - bandTop);
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, bandTop, splitter, 1); // closes the last task row (the trial's row edge at bandTop)
      for (let col = 0; col <= this.columnsValue.length; col++) {
        // The trial's band edges sit on the same pixel as the data cell edges (line at left+width-1).
        const edge = Math.round(headerWidth + this._columnLayout().prefixSum(col) * zoom - renderer.scrollX * zoom) - 1;
        if (edge >= 0 && edge < splitter) ctx.fillRect(edge, bandTop, 1, bandBottom - bandTop);
      }
      const center = bandTop + Math.round(rowHeight / 2);
      if (center > bandTop && center < bandBottom) this._paintAddNewStar(ctx, Math.round(headerWidth / 2) - 1, center, zoom);
      if (bandBottom < renderer.viewHeight) {
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, bandBottom, splitter, 1);
        this._paintAddNewButtons(ctx, headerWidth, center, zoom);
      }
    }
    ctx.restore();

    // The chart paints the whole canvas width to its right edge (the trial covers the
    // plain-sheet border pixel the shared renderer leaves at viewWidth - 1).
    const chartX = splitter + 1;
    const chartWidth = renderer.viewWidth - chartX;
    if (chartWidth <= 2) return;
    const chartHeight = renderer.viewHeight;
    if (chartHeight <= headerHeight) return;

    const tasks: GanttChartTask[] = [];
    for (let row = 0; row < taskRows; row++) {
      const task = this.projectValue.getTaskByRow(row);
      if (task) tasks.push({ task, row });
    }
    // Dependency connectors between the visible task rows (painted under the taskbars).
    const rowIndex = new Map<Task, number>();
    for (const { task, row } of tasks) rowIndex.set(task, row);
    const arrows: GanttArrow[] = [];
    for (const dependency of this.projectValue.dependencies) {
      const fromRow = rowIndex.get(dependency.from);
      const toRow = rowIndex.get(dependency.to);
      if (fromRow !== undefined && toRow !== undefined) arrows.push({ dependency, fromRow, toRow });
    }
    const range = projectDateRange(tasks.map(item => item.task));
    const timescale = this.projectValue.timescale;
    // Trial view window: the left edge starts at the Sunday of the earlier of the project's first
    // week and the week containing `timescale.currentDate`, advanced by that date's time-of-day
    // (measured: a 08:00 status edge sits 1/3 of a day column into the Sunday column). The scroll
    // then slides right until the current week reaches that edge, but never so far that a fully
    // visible project would be pushed off screen.
    const dayMs = 86400000;
    const dayBegin = (d: Date): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const sundayOf = (d: Date): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate() - d.getDay());
    const now = timescale.currentDate;
    const nowDay = dayBegin(now);
    const todaySunday = sundayOf(now);
    const firstBarDay = range.start ? dayBegin(range.start) : nowDay;
    const origin = todaySunday < sundayOf(firstBarDay) ? todaySunday : sundayOf(firstBarDay);
    const dayWidth = GANTT_BASE_DAY_WIDTH * timescale.zoomFactor * zoom;
    const originUtc = Date.UTC(origin.getFullYear(), origin.getMonth(), origin.getDate());
    const daysTo = (d: Date): number => Math.round((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - originUtc) / dayMs);
    const frac = (now.getTime() - nowDay.getTime()) / dayMs;
    let scrollX = (daysTo(todaySunday) + frac) * dayWidth;
    const contentWidth = (range.finish
      ? daysTo(new Date(range.finish.getFullYear(), range.finish.getMonth(), range.finish.getDate()))
      : 0) * dayWidth;
    const maxScroll = Math.max(0, contentWidth - (chartWidth - dayWidth));
    if (scrollX > maxScroll) scrollX = maxScroll;
    if (scrollX < 0) scrollX = 0;
    // Cache the drawn geometry so pointer hit-tests agree with the painting pixel for pixel.
    this._chartLayout = {
      geometry: ganttChartGeometry({ x: chartX, scrollX, dayWidth, originDate: origin }),
      rowsTop: headerHeight, rowHeight, scrollY,
    };
    drawGanttChart({
      ctx,
      x: chartX,
      y: 0,
      width: chartWidth,
      height: chartHeight,
      headerHeight,
      timescale,
      originDate: origin,
      scrollX,
      tasks,
      rowsTop: headerHeight,
      rowHeight,
      rowCount: visualRows,
      currentDate: now,
      gridlines: this.gridlines,
      projectStart: range.start,
      projectFinish: range.finish,
      arrows,
      progressLine: this.progressLine,
      statusDate: this.projectValue.statusDate,
    });

    // Link-creation preview: a connector from the source bar's finish edge to the pointer.
    if (this._chartPreview) {
      const preview = this._chartPreview;
      const item = tasks.find(entry => entry.task === preview.task);
      if (item) {
        const geometry = this._chartLayout!.geometry;
        const geo = barGeometry(preview.task, headerHeight + item.row * rowHeight - scrollY, rowHeight, geometry.dateToX);
        if (geo) {
          const ax = geo.right + 1;
          const ay = geo.midY;
          const down = preview.y >= ay;
          drawArrowPath(ctx,
            [{ x: ax, y: ay }, { x: preview.x, y: ay }, { x: preview.x, y: preview.y }],
            { x: preview.x, y: preview.y, dir: down ? 'down' : 'up' },
            rowHeight / GANTT_DEFAULT_ROW_HEIGHT, GANTT_ARROW_COLOR);
          ctx.save();
          ctx.strokeStyle = GANTT_ARROW_COLOR;
          ctx.lineWidth = 1;
          ctx.strokeRect(geo.left - 1.5, geo.top - 1.5, geo.right - geo.left + 3, Math.max(3, geo.bottom - geo.top + 3));
          ctx.restore();
        }
      }
    }
  }

  /**
   * The trial's small dark star in the row header of the add-new row, drawn as our own 5-point path.
   */
  /**
   * The add-new row's row-header marker: the trial paints a grey asterisk with an up arm, a
   * horizontal pair and two 45-degree legs (measured ink 14-24 x 199-210, 64 px), ~11px across.
   */
  private _paintAddNewStar(ctx: CanvasRenderingContext2D, cx: number, cy: number, zoom: number): void {
    const r = 5.5 * zoom;
    ctx.strokeStyle = '#5a5a5a';
    ctx.lineWidth = 2 * zoom;
    for (const deg of [-90, 0, 180, 45, 135]) {
      const a = (deg * Math.PI) / 180;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      ctx.stroke();
    }
  }

  /**
   * Dropdown arrows the trial paints in the Start/Finish cells of the add-new row: plain small
   * grey triangles ~10px left of the column edge (measured), matching the cell-button glyph.
   */
  private _paintAddNewButtons(ctx: CanvasRenderingContext2D, headerWidth: number, centerY: number, zoom: number): void {
    const layout = this._columnLayout();
    ctx.fillStyle = '#6E6E6E';
    this.columnsValue.forEach((column, col) => {
      if (column.field !== 'start' && column.field !== 'finish') return;
      const edge = Math.round(headerWidth + layout.prefixSum(col + 1) * zoom) - 1;
      const cx = edge - Math.round(10.5 * zoom);
      const half = 4.5 * zoom;
      ctx.beginPath();
      ctx.moveTo(cx - half, centerY - 2 * zoom);
      ctx.lineTo(cx + half, centerY - 2 * zoom);
      ctx.lineTo(cx, centerY + 3 * zoom);
      ctx.closePath();
      ctx.fill();
    });
  }

  // ---------------------------------------------------------------------------
  // Chart-part pointer interaction (trial-observed):
  //  - Manual task bar, any point: drag moves the task whole days (floor of the pixel delta).
  //  - Automatic task bar body: drag creates a Finish-to-Start link onto the task dropped on.
  //  - Automatic bar right edge (+/- a few px): drag resizes the duration; the new finish is the
  //    day column under the pointer at 23:00, which the scheduler lands on the work end.
  //  - The progress boundary (±2px): hover shows the progress tooltip; dragging sets the
  //    0..1 fraction of the bar the pointer covers.
  //  Summary and project bars, and the header band, are inert.
  // ---------------------------------------------------------------------------

  /** The chart geometry as the last paint drew it (hit-testing mirrors the drawn pixels). */
  _chartLayout?: { geometry: GanttChartGeometry; rowsTop: number; rowHeight: number; scrollY: number };
  /** Live link-creation preview while a body drag runs. */
  _chartPreview?: { task: Task; x: number; y: number };

  /** The chart task under a canvas point, with the interaction zone it sits in. */
  _ganttChartHit(x: number, y: number): { task: Task; row: number; zone: 'move' | 'link' | 'resize' | 'progress' } | undefined {
    const layout = this._chartLayout;
    if (!layout || y <= layout.rowsTop) return undefined;
    const row = Math.floor((y - layout.rowsTop + layout.scrollY) / layout.rowHeight);
    const task = this.projectValue.getTaskByRow(row);
    if (!task || task.taskNumber === 0 || task.isSummary) return undefined;
    const rowTop = layout.rowsTop + row * layout.rowHeight - layout.scrollY;
    const geo = barGeometry(task, rowTop, layout.rowHeight, layout.geometry.dateToX);
    if (!geo) return undefined;
    const manual = task.mode === 'Manual';
    const milestone = task.isMilestone === true;
    const complete = Math.max(0, Math.min(1, task.complete ?? 0));
    const progressX = geo.left + (geo.right - geo.left + 1) * complete;
    if (!manual && !milestone && Math.abs(x - progressX) <= 2.5 && y >= geo.top - 2 && y <= geo.bottom + 2) return { task, row, zone: 'progress' };
    if (!manual && !milestone && x >= geo.right - 3 && x <= geo.right + 4 && y >= geo.top - 2 && y <= geo.bottom + 2) return { task, row, zone: 'resize' };
    if (x < geo.left || x > geo.right || y < geo.top - 2 || y > geo.bottom + 2) return undefined;
    return { task, row, zone: manual ? 'move' : 'link' };
  }

  /** The CSS cursor the chart shows for a hit zone (the trial uses bitmap cursors; the
   * equivalents below carry the same meaning). */
  _ganttCursorFor(zone: 'move' | 'link' | 'resize' | 'progress'): string {
    switch (zone) {
      case 'move': return 'move';
      case 'resize': return 'ew-resize';
      case 'progress': return 'col-resize';
      default: return 'default';
    }
  }

  /** The hover/drag tooltip lines for a chart hit, as the trial words them. */
  _ganttTipLines(hit: { task: Task; zone: 'move' | 'link' | 'resize' | 'progress' }, pointerX: number, pointerY: number, dragging = false): string[] {
    const task = hit.task;
    const fmt = (d?: Date | null): string => {
      if (!(d instanceof Date) || Number.isNaN(d.getTime())) return '';
      const p = (n: number): string => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
    };
    const durationText = (): string => {
      const duration = task.duration;
      return duration ? `${duration.value ?? 0} ${String(duration.unit ?? 'Day').toLowerCase()}${duration.value === 1 ? '' : 's'}` : '';
    };
    if (hit.zone === 'link' && dragging) {
      const layout = this._chartLayout!;
      const row = Math.floor((pointerY - layout.rowsTop + layout.scrollY) / layout.rowHeight);
      const target = this.projectValue.getTaskByRow(row);
      const to = target && target !== task && target.taskNumber !== 0 ? ` ${target.taskNumber}` : '';
      return ['Finish to Start Link', `From Finish Of: Task ${task.taskNumber}`, `To Start Of: Task${to}`];
    }
    if (hit.zone === 'resize') {
      const layout = this._chartLayout!;
      const day = layout.geometry.dayAt(Math.floor(layout.geometry.xToColumn(pointerX)));
      const start = task.startDisplayed ?? task.start;
      const days = start instanceof Date
        ? Math.round((Date.UTC(day.getFullYear(), day.getMonth(), day.getDate())
            - Date.UTC(start.getFullYear(), start.getMonth(), start.getDate())) / 86400000) + 1
        : 0;
      return ['task', `Finish: ${fmt(new Date(day.getFullYear(), day.getMonth(), day.getDate(), 23, 0, 0))}`, `Duration: ${days} days`];
    }
    if (hit.zone === 'progress') {
      return ['progress', `Task: ${task.name ?? ''}`, `Task Start: ${fmt(task.startDisplayed ?? task.start)}`,
        `Complete Through: ${fmt(task.completeThrough)}`, `Duration: ${durationText()}`, `% Complete: ${Math.round((task.complete ?? 0) * 100)}%`];
    }
    if (task.mode === 'Manual') return ['manualTask', `Task Start: ${fmt(task.startDisplayed ?? task.start)}`, `Task Finish: ${fmt(task.finishDisplayed ?? task.finish)}`];
    return ['task', `Task: ${task.name ?? ''}`, `Task Start: ${fmt(task.startDisplayed ?? task.start)}`,
      `Task Finish: ${fmt(task.finishDisplayed ?? task.finish)}`, `Duration: ${durationText()}`];
  }

  /** Applies a finished chart drag through the project (every value change goes via the model). */
  _applyGanttDrag(hit: { task: Task; zone: 'move' | 'link' | 'resize' | 'progress' }, fromX: number, toX: number, toY: number): void {
    const layout = this._chartLayout;
    if (!layout) return;
    const task = hit.task;
    if (hit.zone === 'move') {
      const days = Math.floor((toX - fromX) / layout.geometry.dayWidth);
      const start = task.start;
      if (days !== 0 && start instanceof Date) {
        task.start = new Date(start.getFullYear(), start.getMonth(), start.getDate() + days, start.getHours(), start.getMinutes());
      }
    } else if (hit.zone === 'resize') {
      // Trial-observed: a resize applies the pointer's pixel offset to the finish as *working
      // time*, truncated to whole hours — a 70px grab at 46.4px/day adds 1.51 days = 12 work
      // hours, landing an 17:00 finish on Friday 12:00 (8-12/13-17 day); the finish setter
      // turns the new finish back into a fractional `4.5 Day` duration for an automatic task.
      const finish = task.finish;
      if (finish instanceof Date && !Number.isNaN(finish.getTime())) {
        const workDayMs = workDayLength(this.projectValue.calendar, finish);
        const days = (toX - fromX) / layout.geometry.dayWidth;
        const hours = Math.floor(Math.abs(days) * workDayMs / 3600000);
        const ms = (days < 0 ? -1 : 1) * hours * 3600000;
        if (ms !== 0) task.finish = addWorkingTime(this.projectValue.calendar, finish, ms);
      }
    } else if (hit.zone === 'progress') {
      const rowTop = layout.rowsTop + Math.floor((toY - layout.rowsTop + layout.scrollY) / layout.rowHeight) * layout.rowHeight - layout.scrollY;
      const geo = barGeometry(task, rowTop, layout.rowHeight, layout.geometry.dateToX);
      if (geo) task.complete = Math.max(0, Math.min(1, Math.round((toX - geo.left) / (geo.right - geo.left + 1) * 100) / 100));
    } else {
      const row = Math.floor((toY - layout.rowsTop + layout.scrollY) / layout.rowHeight);
      const target = this.projectValue.getTaskByRow(row);
      if (target && target !== task && target.taskNumber !== 0) {
        try {
          this.projectValue.addDependency({ fromTaskNumber: task.taskNumber, toTaskNumber: target.taskNumber, type: 'FS' });
        } catch {
          // The trial silently drops a link the model rejects (cycle, self, ancestor).
        }
      }
    }
    this.rebuildGrid();
  }

  // ---------------------------------------------------------------------------
  // Sheet JSON (trial shape): the tab JSON carries a top-level `gantt` section
  // `{ project: { calendarSettings, timescale, layout, defaultMode, taskStyleRules,
  // startDate, currentDate, statusDate, taskView, calendar }, gridlines,
  // taskbarColumn, options }`. The tasks themselves live in the bound data view
  // (`addition.dataView`), which the workbook restores before the gantt section
  // is applied; dates use the trial's `{ oaDate: "/OADate(n)/" }` form and the
  // zoom travels as `pixelPerDay` (= zoomFactor × 32).
  // ---------------------------------------------------------------------------

  /** `gantt` section read by fromJSON, applied once the data view is (re)bound. */
  private _pendingGanttSection: Record<string, unknown> | undefined;
  /** The trial's `gantt.taskbarColumn.width` for the default task grid. */
  private _taskbarColumnWidth = 452;

  override toJSON(options?: Parameters<TableSheet['toJSON']>[0]): ReturnType<TableSheet['toJSON']> {
    const result = super.toJSON(options) as ReturnType<TableSheet['toJSON']>;
    result.gantt = this._ganttSectionJSON();
    return result;
  }

  /** Runs after the shared sheet JSON was applied (`TableSheet.fromJSON` calls it). */
  _afterTabJSON(settings: object): void {
    const section = (settings as { gantt?: Record<string, unknown> }).gantt ?? this._pendingGanttSection;
    this._pendingGanttSection = undefined;
    if (section && !this.boundView) this._applyGanttSection(section);
    else if (section) this._pendingGanttSection = section;
    this.rebuildGrid();
  }

  /** Trial: binding the tab's data view rebinds the GanttSheet itself. */
  override setDataView(view: View): void {
    this.bindGanttView(view);
    const pending = this._pendingGanttSection;
    this._pendingGanttSection = undefined;
    if (pending) this._applyGanttSection(pending);
    else this.rebuildGrid();
  }

  /** The workbook serialises `addition.dataView` through this getter. */
  override getDataView(): View { return this.boundView ?? super.getDataView(); }

  private _ganttSectionJSON(): Record<string, unknown> {
    const project = this.projectValue;
    const timescale = project.timescale;
    const oa = (value: Date | null | undefined): { oaDate: string } | null =>
      value instanceof Date && !Number.isNaN(value.getTime()) ? { oaDate: `/OADate(${dateToSerial(value)})/` } : null;
    const tier = (source: TimescaleTier): Record<string, unknown> => ({
      count: source.count,
      unit: source.unit,
      labelAlign: source.labelAlign,
      showTickLines: source.showTickLines,
      ...(typeof source.formatter === 'string' ? { formatter: source.formatter } : {}),
    });
    const gridlines: Record<string, unknown> = {};
    for (const key of ['topTierColumn', 'middleTierColumn', 'bottomTierColumn', 'currentDate',
      'ganttRows', 'projectFinish', 'projectStart', 'statusDate'] as const) {
      const value = this.gridlines[key];
      if (value) gridlines[key] = { lineColor: value.lineColor, lineType: value.lineType };
    }
    return {
      project: {
        calendarSettings: { ...project.calendarSettings },
        timescale: {
          topTier: tier(timescale.topTier),
          middleTier: tier(timescale.middleTier),
          bottomTier: tier(timescale.bottomTier),
          nonWorkingTime: {
            color: timescale.nonWorkingTime.color,
            drawMode: timescale.nonWorkingTime.drawMode,
            pattern: timescale.nonWorkingTime.pattern,
          },
          tierMode: timescale.tierMode,
          maxDate: oa(timescale.maxDate),
          minDate: oa(timescale.minDate),
          pixelPerDay: timescale.zoomFactor * GANTT_BASE_DAY_WIDTH,
        },
        layout: {
          barHeight: project.layout.barHeight,
          barTextDateFormat: project.layout.barTextDateFormat,
          linkLineMode: project.layout.linkLineMode,
          roundBarsToWholeDays: project.layout.roundBarsToWholeDays,
          tipDateFormat: project.layout.tipDateFormat,
        },
        defaultMode: this.ganttOptions.defaultMode ?? 'Auto',
        taskStyleRules: project.taskStyleRules.all().map(rule => rule.toJSON()),
        startDate: oa(project.startDate),
        currentDate: oa(project.currentDate),
        statusDate: oa(project.statusDate),
        taskView: {},
        calendar: { name: project.calendar.name },
      },
      gridlines,
      taskbarColumn: { width: this._taskbarColumnWidth },
      options: {
        enableGanttColumn: this.enableGanttColumn(),
        ...(this.ganttOptions.defaultMode === undefined ? {} : { defaultMode: this.ganttOptions.defaultMode }),
      },
      ...(this.progressLine === undefined ? {} : { progressLine: { ...this.progressLine } }),
    };
  }

  private _applyGanttSection(section: Record<string, unknown>): void {
    const project = this.projectValue;
    const readDate = (value: unknown): Date | undefined => {
      const match = /^\/OADate\((-?[\d.]+)\)\/$/.exec((value as { oaDate?: string } | null | undefined)?.oaDate ?? '');
      return match ? serialToDate(Number(match[1])) : undefined;
    };
    const part = section.project as Record<string, unknown> | undefined;
    if (part) {
      const timescale = project.timescale;
      const applyTier = (target: TimescaleTier, raw: unknown): void => {
        const source = raw as Record<string, unknown> | undefined;
        if (!source) return;
        if (typeof source.count === 'number') target.count = source.count;
        if (typeof source.unit === 'number') target.unit = source.unit;
        if (source.labelAlign === 'Left' || source.labelAlign === 'Center' || source.labelAlign === 'Right')
          target.labelAlign = source.labelAlign;
        if (typeof source.showTickLines === 'boolean') target.showTickLines = source.showTickLines;
        if (typeof source.formatter === 'string') target.formatter = source.formatter;
      };
      const scale = part.timescale as Record<string, unknown> | undefined;
      if (scale) {
        applyTier(timescale.topTier, scale.topTier);
        applyTier(timescale.middleTier, scale.middleTier);
        applyTier(timescale.bottomTier, scale.bottomTier);
        const nonWorking = scale.nonWorkingTime as Record<string, unknown> | undefined;
        if (nonWorking) {
          if (typeof nonWorking.color === 'string') timescale.nonWorkingTime.color = nonWorking.color;
          if (nonWorking.drawMode === 'Behind' || nonWorking.drawMode === 'None')
            timescale.nonWorkingTime.drawMode = nonWorking.drawMode;
          if (typeof nonWorking.pattern === 'string') timescale.nonWorkingTime.pattern = nonWorking.pattern;
        }
        if (typeof scale.tierMode === 'number') timescale.tierMode = scale.tierMode;
        const min = readDate(scale.minDate);
        if (min) timescale.minDate = min;
        const max = readDate(scale.maxDate);
        if (max) timescale.maxDate = max;
        if (typeof scale.pixelPerDay === 'number' && scale.pixelPerDay > 0)
          timescale.zoomTo(scale.pixelPerDay / GANTT_BASE_DAY_WIDTH, false);
      }
      const layout = part.layout as Record<string, unknown> | undefined;
      if (layout) {
        const target = asRecord(project.layout);
        for (const key of ['barHeight', 'barTextDateFormat', 'linkLineMode', 'roundBarsToWholeDays', 'tipDateFormat'])
          if (layout[key] !== undefined && typeof layout[key] === typeof target[key]) target[key] = layout[key];
      }
      const calendarSettings = part.calendarSettings as Record<string, unknown> | undefined;
      if (calendarSettings) {
        const target = asRecord(project.calendarSettings);
        for (const [key, value] of Object.entries(calendarSettings)) {
          if (key in target && typeof value === typeof target[key]) target[key] = value;
          else if (Array.isArray(value) && Array.isArray(target[key])) target[key] = [...value];
        }
      }
      if ('statusDate' in part) project.statusDate = readDate(part.statusDate) ?? null;
      const currentDate = readDate(part.currentDate);
      if (currentDate) project.currentDate = currentDate;
      const startDate = readDate(part.startDate);
      if (startDate) project.startDate = startDate;
      for (const raw of Array.isArray(part.taskStyleRules) ? part.taskStyleRules : []) {
        const entry = raw as { name?: string };
        const rule = project.taskStyleRules.all().find(item => item.name === entry.name);
        rule?.fromJSON(entry);
      }
    }
    const gridlines = section.gridlines as Record<string, unknown> | undefined;
    if (gridlines) {
      const target = this.gridlines as unknown as Record<string, { lineColor: string; lineType: number } | undefined>;
      for (const [key, value] of Object.entries(gridlines)) {
        if (value === null || value === undefined) { target[key] = undefined; continue; }
        const line = value as { lineColor?: unknown; lineType?: unknown };
        if (key in target && typeof line.lineColor === 'string' && typeof line.lineType === 'number')
          target[key] = { lineColor: line.lineColor, lineType: line.lineType };
      }
    }
    const taskbar = section.taskbarColumn as { width?: unknown } | undefined;
    if (taskbar && typeof taskbar.width === 'number') this._taskbarColumnWidth = taskbar.width;
    const options = section.options as IGanttSheetOptions | undefined;
    if (options) this.ganttOptions = { ...options };
    if (section.progressLine && typeof section.progressLine === 'object')
      this.progressLine = { ...(section.progressLine as IProgressLine) };
    this.rebuildGrid();
  }

  /**
   * @internal `Workbook.fromJSON` constructs every tab JSON as a plain `TableSheet`; the gantt
   * module's registered tab hook upgrades an instance whose JSON carries a `gantt` section here,
   * reproducing the field initialisers the constructor would have run.
   */
  static _upgradeToGanttSheet(sheet: TableSheet, section: Record<string, unknown>): void {
    Object.setPrototypeOf(sheet, GanttSheet.prototype);
    // `gridlines` and `_isGanttSheet` are declared data properties: their prototype
    // descriptors are the coverage stubs, and normal construction shadows them with own
    // class fields. Mirror that here with own enumerable fields so the stub never fires.
    const defineOwn = (name: string, value: unknown): void => {
      Object.defineProperty(sheet, name, { value, writable: true, enumerable: true, configurable: true });
    };
    defineOwn('_isGanttSheet', true);
    defineOwn('projectValue', new Project(sheet.name()));
    (sheet as unknown as { projectValue: Project }).projectValue.timescale._onChange = () => sheet._invalidate();
    defineOwn('progressLine', undefined);
    defineOwn('ganttOptions', {});
    defineOwn('columnsValue', [] as GanttColumn[]);
    defineOwn('gridlines', new GanttGridlines());
    defineOwn('gridRows', -1);
    defineOwn('_taskbarColumnWidth', 452);
    defineOwn('_pendingGanttSection', section);
  }
}

registerSheetTabJSONHook((sheet, settings) => {
  const section = settings.gantt as Record<string, unknown> | undefined;
  if (section && !(sheet instanceof GanttSheet)) GanttSheet._upgradeToGanttSheet(sheet, section);
});
