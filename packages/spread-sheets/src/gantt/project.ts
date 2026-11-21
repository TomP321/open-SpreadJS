import { Calendar, CalendarSettings } from './calendar.js';
import { GanttMapping, type Duration } from './mapping.js';
import { addTaskTime, addWorkingTime, workingSlot, workingTimeBetween } from './work-time.js';
import { TaskDependency, type TaskDependencyType } from './dependency.js';
import { createDefaultTaskStyleRules, TaskbarLayout, TaskbarStyleRule, Timescale } from './appearance.js';
import type { Collection } from './collection.js';
import { asRecord } from '../object-access.js';

export type TaskData = {
  name?: string;
  start?: Date;
  finish?: Date;
  duration?: number | string | Duration;
  mode?: TaskScheduleMode;
  complete?: number;
  barStyles?: Record<string, unknown>;
};
export type TaskScheduleMode = 'Auto' | 'Manual';

type OptionalDate = Date | null | undefined;

const hasDate = (value: OptionalDate): value is Date => value !== undefined && value !== null;

/** A task owned by a project. */
export class Task {
  name?: string;
  private modeValue: TaskScheduleMode = 'Auto';
  get mode(): TaskScheduleMode { return this.modeValue; }
  set mode(value: TaskScheduleMode) {
    this.modeValue = value === 'Manual' ? 'Manual' : 'Auto';
    this.project?.schedule(true);
  }
  private completeValue = 0;
  /** The trial setter clamps to [0,1] while addTasks data stores the raw value. */
  get complete(): number { return this.completeValue; }
  set complete(value: number) {
    this.completeValue = Math.max(0, Math.min(1, value));
    this.project?.schedule(false);
  }
  level = 1;
  taskNumber = 0;
  rowIndex = 0;
  private _children: Task[] = [];
  /** A cloned array, as declared by the official d.ts. */
  get children(): Task[] { return this._children.slice(); }
  /** Live child list for the owning project's internal outline operations. */
  _childList(): Task[] { return this._children; }
  parent?: Task;
  private startValue?: OptionalDate;
  private finishValue?: OptionalDate;
  /**
   * Trial-observed: an explicit `start`/`finish` assignment on a summary pins that edge, and the
   * pin survives later passes (`outdentTasks`, `startDate` and child edits leave it alone).
   */
  private startPinned = false;
  private finishPinned = false;
  /**
   * Trial-observed: a duration written through the setter pins the bar length. A summary then
   * keeps exactly that length even when its children reach further (`summary:durationSetter
   * Unpinned`/`Narrower`), while a duration supplied in `addTasks` data does not pin and the bar
   * keeps rolling up over the children (`summary:durationData*`).
   */
  private durationPinned = false;
  /** Start of this task's own bar as the last layout pass computed it; children inherit it. */
  private layoutStart?: Date;
  get start(): OptionalDate { return this.startValue; }
  set start(value: OptionalDate) {
    const project = this.project;
    if (!project) { this.startValue = value; return; }
    // The project root ignores date assignments: its bar is always the roll-up of its tasks.
    if (project.root === this) { project.schedule(true); return; }
    if (hasDate(value)) {
      if (this.modeValue === 'Manual') {
        this.startValue = value;
        this.startPinned = true;
        if (this.durationValue) this.finishValue = addTaskTime(project.calendar, value, this.durationValue.time ?? 0);
      } else if (this.isSummary) {
        this.startValue = value;
        this.startPinned = true;
      }
      // An automatic leaf ignores it: the trial keeps leaf starts derived from the layout.
      project.schedule(true, this);
      return;
    }
    // Clearing keeps the opposite date and drops the duration; an automatic leaf instead
    // resets its duration to one day and re-derives the cleared start.
    this.startValue = null;
    if (this.isSummary || this.modeValue === 'Manual') {
      this.startPinned = true;
      this.durationValue = null;
    } else {
      // Automatic leaf: the trial stores the raw cleared state; the scheduling pass gives the task
      // its default one-day length (probe 6 W10, comparison `schedule:suspendNullStartLeaf`).
      this.startPinned = false;
      this.durationPinned = false;
      this.durationValue = null;
    }
    project.schedule(true, this);
  }
  get finish(): OptionalDate { return this.finishValue; }
  set finish(value: OptionalDate) {
    const project = this.project;
    if (!project) { this.finishValue = value; return; }
    if (project.root === this) { project.schedule(true); return; }
    if (hasDate(value)) {
      this.finishValue = value;
      this.finishPinned = true;
      if (this.modeValue === 'Manual') {
        if (hasDate(this.startValue)) {
          const time = Math.max(0, workingTimeBetween(project.calendar, this.startValue, value));
          this.durationValue = project.mapping.parseDuration({ time, unit: this.durationValue?.unit });
        } else if (this.durationValue) {
          this.startValue = addTaskTime(project.calendar, value, -(this.durationValue.time ?? 0));
        }
      } else if (!this.isSummary && hasDate(this.startValue)) {
        // Trial-observed on an automatic leaf: the finish becomes a duration, not a date pin.
        const time = Math.max(0, workingTimeBetween(project.calendar, this.startValue, value));
        this.durationValue = project.mapping.parseDuration({ time, unit: this.durationValue?.unit });
      }
      project.schedule(true, this);
      return;
    }
    this.finishValue = null;
    this.finishPinned = true;
    this.durationValue = null;
    project.schedule(true, this);
  }
  private durationValue: Duration | null | undefined;
  private milestoneValue?: boolean;
  private styleValue?: Record<string, unknown>;
  constructor(private project?: Project) {}
  get duration(): Duration | null | undefined { return this.durationValue; }
  set duration(value: number | string | Duration | null) {
    if (value === null || value === undefined) {
      // Trial-observed: clearing the duration also clears the finish and keeps the start; a
      // summary then stays open-ended instead of rolling its bar back over the children
      // (`summary:durationSetterCleared`).
      this.durationValue = null;
      this.durationPinned = false;
      this.finishValue = null;
      this.finishPinned = true;
      this.project?.schedule(true, this);
      return;
    }
    const parsed = (this.project?.mapping ?? new GanttMapping()).parseDuration(value);
    if (!parsed) return;
    this.durationValue = parsed;
    this.durationPinned = true;
    const project = this.project;
    if (project && this.modeValue === 'Manual' && !this.isSummary) {
      // The two remaining fields win: the third one is rebuilt from them.
      if (hasDate(this.startValue)) this.finishValue = addTaskTime(project.calendar, this.startValue, parsed.time ?? 0);
      else if (hasDate(this.finishValue)) this.startValue = addTaskTime(project.calendar, this.finishValue, -(parsed.time ?? 0));
    }
    project?.schedule(true, this);
  }
  /** Trial-observed: derived from the displayed start, duration and complete; assignment is ignored. */
  get completeThrough(): OptionalDate {
    const base = this.startDisplayed;
    if (!hasDate(base) || !this.project) return base ?? this.startValue;
    return addWorkingTime(this.project.calendar, base, (this.durationValue?.time ?? 0) * this.completeValue);
  }
  set completeThrough(_value: OptionalDate) { /* the trial ignores assignment and keeps the derived value */ }
  get style(): Record<string, unknown> | undefined { return this.styleValue; }
  set style(value: Record<string, unknown> | undefined) { this.styleValue = value; }
  get predecessorDependencies(): TaskDependency<Task>[] {
    return this.project ? this.project.dependencies.filter(d => d.to === this) : [];
  }
  get successorDependencies(): TaskDependency<Task>[] {
    return this.project ? this.project.dependencies.filter(d => d.from === this) : [];
  }
  get predecessors(): string {
    return this.predecessorDependencies.map(d => `${d.from.taskNumber}${d.type === 'FS' ? '' : d.type}`).join(',');
  }
  set predecessors(value: string) { this.project?.setLinks(this, value, true); }
  get successors(): string {
    return this.successorDependencies.map(d => `${d.to.taskNumber}${d.type === 'FS' ? '' : d.type}`).join(',');
  }
  set successors(value: string) { this.project?.setLinks(this, value, false); }
  get startDisplayed(): OptionalDate {
    if (hasDate(this.startValue)) return this.startValue;
    const project = this.project;
    if (!project) return this.startValue;
    if (hasDate(this.finishValue)) return project.dayTime(this.finishValue, project.calendarSettings.defaultStartTime);
    if (this.durationValue) return project.workingSlot(project.startDate);
    return this.startValue;
  }
  get finishDisplayed(): OptionalDate {
    if (hasDate(this.finishValue)) return this.finishValue;
    const project = this.project;
    if (!project) return this.finishValue;
    if (hasDate(this.startValue)) {
      if (this.durationValue) return addTaskTime(project.calendar, this.startValue, this.durationValue.time);
      return project.dayTime(this.startValue, project.calendarSettings.defaultFinishTime);
    }
    if (this.durationValue) return addTaskTime(project.calendar, project.workingSlot(project.startDate), this.durationValue.time);
    return this.finishValue;
  }
  getValue(property: string): unknown { return (asRecord(this))[property]; }
  /** The trial never applies `setValue` to task fields; mirrored for behavioral parity. */
  setValue(_property: string, _value: unknown): void { /* trial-observed no-op */ }
  get isSummary(): boolean { return this._children.length > 0; }
  get isMilestone(): boolean | undefined {
    if (this.milestoneValue !== undefined) return this.milestoneValue;
    return this.durationValue === undefined || this.durationValue === null
      ? undefined : this.durationValue.time === 0;
  }
  set isMilestone(value: boolean) { this.milestoneValue = value; }
  get isNormal(): boolean { return !this.isSummary && !this.isMilestone; }
  /** Update a duration without triggering another scheduling pass. */
  _setDuration(value: Duration | null | undefined): void { this.durationValue = value; }
  _setComplete(value: number): void { this.completeValue = value; }
  _setDates(start: OptionalDate, finish: OptionalDate): void { this.startValue = start; this.finishValue = finish; }
  _setMode(value: TaskScheduleMode): void { this.modeValue = value; }
  _startPinned(): boolean { return this.startPinned; }
  _finishPinned(): boolean { return this.finishPinned; }
  _durationPinned(): boolean { return this.durationPinned; }
  _layout(): Date | undefined { return this.layoutStart; }
  _setLayout(date: Date | undefined): void { this.layoutStart = date; }
  _clearPins(): void { this.startPinned = false; this.finishPinned = false; this.durationPinned = false; }
}

/** Grammar of one predecessor/successor entry observed on the trial: a number, an optional
 * dependency type, and an optional `+`/`-` suffix. The suffix is accepted and discarded; the
 * trial never applies lag parsed from these strings. */
const linkEntry = /^\s*([1-9][0-9]*)(FS|SS|FF|SF)?([+-][^,]*)?\s*$/i;

/** A project owns its task outline and schedules its dependency graph. */
export class Project {
  currentDate = new Date(new Date().setHours(8, 0, 0, 0));
  statusDate: Date | null = null;
  layout = new TaskbarLayout();
  taskStyleRules: Collection<TaskbarStyleRule>;
  readonly timescale = new Timescale();
  private calendarValue = Calendar.standard.copyTo('Standard');
  get calendar(): Calendar { return this.calendarValue; }
  set calendar(value: Calendar) { this.calendarValue = value; this.schedule(true); }
  readonly calendarSettings = new CalendarSettings();
  readonly mapping = new GanttMapping(this.calendarSettings);
  readonly root: Task;
  private _tasks: Task[];
  private sortedValue = false;
  get sorted(): boolean { return this.sortedValue; }
  /** A cloned array, as declared by the official d.ts. */
  get tasks(): Task[] { return this._tasks.slice(); }
  private linkList: TaskDependency<Task>[] = [];
  /** Successor adjacency index kept in sync with `linkList` for O(1) graph walks. */
  private linkIndex = new Map<Task, TaskDependency<Task>[]>();
  get dependencies(): TaskDependency<Task>[] { return this.linkList.slice(); }
  private startValue = new Date(new Date().setHours(8, 0, 0, 0));
  /** Row order of tasks after `sort`; null entries are blank rows the trial shows in grids. */
  private rowOrder: (Task | null)[] = [];
  private suspended = 0;
  private dirty = false;
  /** Pending predecessor/successor string edit whose schedule the trial defers. */
  private deferred = false;
  constructor(name: string) {
    this.root = new Task(this);
    this.root.name = name;
    this.root.level = 0;
    this._tasks = [this.root];
    this.rowOrder = [this.root];
    this.taskStyleRules = createDefaultTaskStyleRules();
    // Trial-observed (probe 1 `projectInit`): a freshly built project already schedules its empty
    // summary — `root.start`/`root.finish` are the project start, the duration is zero days,
    // `root.isMilestone` is true and `finishDate` reads that same date.
    this.schedule(true);
  }
  get startDate(): Date { return this.startValue; }
  set startDate(value: Date) { this.startValue = value; this.schedule(true); }
  get finishDate(): OptionalDate { return this.root.finish; }
  get count(): number { return this._tasks.length; }
  get tasksSorted(): (Task | null)[] { return this.sortedValue ? this.rowOrder.slice() : this._tasks.slice(); }
  getTask(taskNumber: number): Task { return this._tasks[taskNumber] as Task; }
  getTaskByRow(rowIndex: number): Task {
    return ((this.sortedValue ? this.rowOrder : this._tasks)[rowIndex] ?? undefined) as Task;
  }
  parseDuration(value: unknown): Duration | null { return this.mapping.parseDuration(value); }
  formatDuration(value: unknown): string { return this.mapping.formatDuration(value); }
  /** First working instant at or after the given date (trial snap behavior). */
  workingSlot(date: Date): Date { return workingSlot(this.calendarValue, date); }
  /** A date at the given default time on the same local day as `date`. */
  dayTime(date: Date, time: { hour: number; minute: number }): Date {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate(), time.hour, time.minute, 0, 0);
  }
  addTasks(data: number | TaskData | TaskData[] = 1, level?: number): Task[] {
    return this.addAt(this._tasks.length, data, level);
  }
  /**
   * Inserts at `position` (or appends). The trial measures the level against the row the new task
   * lands on: its level may not exceed the level of the row above it, and with no level given it
   * takes over the level of the row it pushes down (`invalidLevel` otherwise).
   */
  private addAt(position: number, data: number | TaskData | TaskData[], level?: number): Task[] {
    const values: TaskData[] = typeof data === 'number' ? Array.from({ length: data }, () => ({})) : Array.isArray(data) ? data : [data];
    const previous = this._tasks[position - 1];
    const following = this._tasks[position];
    const lastLevel = this._tasks[this._tasks.length - 1]?.level ?? 0;
    if (level !== undefined && (level < 1 || level > (previous?.level ?? 0) + 1)) throw new Error('invalidLevel');
    const requested = level ?? Math.max(1, Math.min(following?.level ?? lastLevel, (previous?.level ?? 0) + 1));
    this.suspendSchedule();
    try {
      const added = values.map(value => {
        const task = new Task(this);
        task.name = value.name;
        task._setMode(value.mode ?? 'Auto');
        task._setComplete(value.complete ?? 0);
        task.level = requested;
        task._setDates(value.start, value.finish);
        task.parent = this.root;
        task.taskNumber = task.rowIndex = this._tasks.length;
        if (value.barStyles !== undefined) task.style = value.barStyles;
        if (value.duration !== undefined) {
          const parsed = this.mapping.parseDuration(value.duration);
          if (parsed) task._setDuration(parsed);
        } else if (value.mode === 'Manual' && hasDate(value.start) && hasDate(value.finish)) {
          const time = Math.max(0, workingTimeBetween(this.calendarValue, value.start, value.finish));
          task._setDuration(this.mapping.parseDuration({ time }));
        } else if (value.mode !== 'Manual') task._setDuration(this.mapping.parseDuration(1));
        this._tasks.push(task);
        this.root._childList().push(task);
        return task;
      });
      const start = this._tasks.length - added.length;
      if (start !== position) {
        this._tasks.splice(start, added.length);
        this._tasks.splice(position, 0, ...added);
      }
      this.rebuild(true);
      return added;
    } finally {
      this.resumeSchedule();
    }
  }
  addDependency(dependencies: TaskDependency<Task> | ITaskDependency | Array<TaskDependency<Task> | ITaskDependency>): void {
    const pending: TaskDependency<Task>[] = [];
    for (const item of Array.isArray(dependencies) ? dependencies : [dependencies as TaskDependency<Task> | ITaskDependency]) {
      const link = item instanceof TaskDependency ? item :
        new TaskDependency(this.getTask(item.fromTaskNumber), this.getTask(item.toTaskNumber), item.type);
      this.validateLink(link, pending);
      pending.push(link);
    }
    // Validated before any mutation, so a rejected batch leaves the graph untouched.
    for (const link of pending) {
      // Trial-observed: the graph holds one link per task pair. The same link twice, a link of
      // another type over an existing one, or the same pair twice inside one batch are all
      // `invalidDependency`.
      const existing = this.findLink(link.from, link.to) ??
        pending.find(other => other !== link && other.from === link.from && other.to === link.to);
      if (existing) throw new Error('invalidDependency');
    }
    for (const link of pending) this.addLink(link);
    this.schedule(true);
  }
  removeDependency(dependencies: TaskDependency<Task> | TaskDependency<Task>[]): void {
    const items = Array.isArray(dependencies) ? dependencies : [dependencies];
    // Trial-observed: the objects must belong to this project's tasks (`invalidDependency` for a
    // dependency of another project), while a link that is simply not present is ignored.
    for (const item of items) {
      if (!this.owns(item.from) || !this.owns(item.to)) throw new Error('invalidDependency');
    }
    for (const item of items) this.dropLink(item);
    this.schedule(true);
  }
  /**
   * Replaces the dependencies of one task from the trial string grammar. The schedule is
   * deferred exactly like the trial: reads keep stale dates until a forcing change or
   * `resumeSchedule()` runs the scheduler again.
   */
  setLinks(task: Task, text: string, predecessor: boolean): void {
    const entries = text.trim() === '' ? [] : text.split(',');
    const stale = new Set(this.linkList.filter(link => (predecessor ? link.to : link.from) === task));
    const links: TaskDependency<Task>[] = [];
    /** Trial-observed: the same task number may only be referenced once per string
     * (`'1FS,1FS'` and `'1FS,1SS'` are both `invalidDependency`). */
    const seen = new Set<Task>();
    for (const entry of entries) {
      const match = linkEntry.exec(entry);
      if (!match) throw new Error('invalidDependency');
      const other = this.getTask(Number(match[1]));
      if (!this.owns(other) || seen.has(other)) throw new Error('invalidDependency');
      seen.add(other);
      const link = new TaskDependency<Task>(predecessor ? other : task, predecessor ? task : other,
        (match[2]?.toUpperCase() ?? 'FS') as TaskDependencyType);
      this.validateLink(link, links, stale);
      links.push(link);
    }
    for (const link of stale) this.dropLink(link);
    for (const link of links) this.addLink(link);
    this.deferred = true;
  }
  /** Dependency validation observed on the trial: no self, ancestor, unknown or cyclic links. */
  private validateLink(link: TaskDependency<Task>, batch: readonly TaskDependency<Task>[], excluding?: ReadonlySet<TaskDependency<Task>>): void {
    const { from, to } = link;
    if (!this.owns(from) || !this.owns(to)) throw new Error('invalidDependency');
    if (from === to) throw new Error('invalidDependency');
    if (isAncestor(from, to) || isAncestor(to, from)) throw new Error('invalidDependency');
    // Adding from→to closes a cycle exactly when `from` is reachable from `to`.
    const seen = new Set<Task>();
    const stack = [to];
    while (stack.length) {
      const node = stack.pop()!;
      if (node === from) throw new Error('invalidDependency');
      if (seen.has(node)) continue;
      seen.add(node);
      for (const edge of this.linkIndex.get(node) ?? []) {
        if (!excluding?.has(edge) && !seen.has(edge.to)) stack.push(edge.to);
      }
      for (const edge of batch) if (edge.from === node && !seen.has(edge.to)) stack.push(edge.to);
    }
  }
  private owns(task: Task | undefined): task is Task {
    return !!task && this._tasks[task.taskNumber] === task;
  }
  private findLink(from: Task, to: Task): TaskDependency<Task> | undefined {
    return (this.linkIndex.get(from) ?? []).find(edge => edge.to === to);
  }
  private addLink(link: TaskDependency<Task>): void {
    this.linkList.push(link);
    const list = this.linkIndex.get(link.from);
    if (list) list.push(link); else this.linkIndex.set(link.from, [link]);
  }
  private dropLink(link: TaskDependency<Task>): void {
    const index = this.linkList.indexOf(link);
    if (index >= 0) this.linkList.splice(index, 1);
    const list = this.linkIndex.get(link.from);
    if (list) {
      const at = list.indexOf(link);
      if (at >= 0) list.splice(at, 1);
    }
  }
  private reindexLinks(): void {
    this.linkIndex = new Map();
    for (const link of this.linkList) {
      const list = this.linkIndex.get(link.from);
      if (list) list.push(link); else this.linkIndex.set(link.from, [link]);
    }
  }
  insertTasks(taskNumber: number, data: number | TaskData | TaskData[] = 1, level?: number): Task[] {
    if (!Number.isInteger(taskNumber) || taskNumber < 1 || taskNumber > this._tasks.length) throw new Error('invalidId');
    return this.addAt(taskNumber, data, level);
  }
  insertTasksByRow(rowIndex: number, data: number | TaskData | TaskData[] = 1, level?: number): Task[] {
    return this.insertTasks(rowIndex, data, level);
  }
  /**
   * Trial-observed task-number lists: a numeric string is accepted like its number
   * (`removeTasks(['1'])` removes task 1), anything that is not a positive whole number is
   * `invalidId`.
   */
  private taskNumbers(values: unknown): number[] {
    const list: unknown[] = Array.isArray(values) ? values : [values];
    return list.map(value => {
      const number = typeof value === 'number' ? value : Number(value);
      if (!Number.isInteger(number) || number < 1) throw new Error('invalidId');
      return number;
    });
  }
  removeTasks(taskNumbers: number | number[]): void {
    const numbers = this.taskNumbers(taskNumbers);
    for (const number of numbers) {
      if (number >= this._tasks.length || !this.getTask(number)) throw new Error('invalidId');
    }
    const selected = new Set(numbers.map(number => this.getTask(number)));
    for (const task of this._tasks.slice(1)) {
      for (let parent = task.parent; parent; parent = parent.parent) if (selected.has(parent)) selected.add(task);
    }
    this.linkList = this.linkList.filter(link => !selected.has(link.from) && !selected.has(link.to));
    for (let i = this._tasks.length - 1; i > 0; i--) {
      const task = this._tasks[i]!;
      if (selected.has(task)) { task._clearPins(); this._tasks.splice(i, 1); }
    }
    this.rebuild(true);
  }
  removeTasksByRange(taskNumber: number, count = 1): void {
    // Trial-observed: a range that reaches past the last task is `invalidCount`; the start row is
    // validated like a task number (`invalidId`).
    if (!Number.isInteger(count) || count < 1) throw new Error('invalidCount');
    if (!Number.isInteger(taskNumber) || taskNumber < 1 || taskNumber >= this._tasks.length) throw new Error('invalidId');
    if (taskNumber + count - 1 >= this._tasks.length) throw new Error('invalidCount');
    this.removeTasks(Array.from({ length: count }, (_, i) => taskNumber + i));
  }
  indentTasks(taskNumbers: number | number[]): void {
    const numbers = this.taskNumbers(taskNumbers);
    for (const number of numbers) {
      if (number >= this._tasks.length) throw new Error('invalidId');
    }
    for (const number of numbers) {
      const task = this.getTask(number), previous = this.getTask(number - 1);
      if (previous !== this.root && task.level <= previous.level) task.level++;
    }
    this.rebuild(false);
  }
  indentTasksByRange(taskNumber: number, count = 1): void {
    this.indentTasks(Array.from({ length: count }, (_, i) => taskNumber + i));
  }
  outdentTasks(taskNumbers: number | number[]): void {
    const numbers = this.taskNumbers(taskNumbers);
    for (const number of numbers) {
      if (number >= this._tasks.length) throw new Error('invalidId');
      const task = this.getTask(number);
      if (task.level > 1) task.level--;
    }
    this.rebuild(true);
  }
  outdentTasksByRange(taskNumber: number, count = 1): void {
    this.outdentTasks(Array.from({ length: count }, (_, i) => taskNumber + i));
  }
  sort(fields: string[], ascendingStates?: boolean[], keepStructure = true, renumber = false): void {
    if (ascendingStates !== undefined && ascendingStates.length !== fields.length) throw new Error('invalidOperation');
    if (!keepStructure && renumber) throw new Error('invalidOperation');
    // Trial-observed allow-list: sorting by a derived or outline field throws `invalidField`.
    const allowed = ['name', 'start', 'finish', 'duration', 'mode', 'complete', 'taskNumber', 'isMilestone',
      'completeThrough', 'predecessors', 'successors', 'startDisplayed', 'finishDisplayed'];
    for (const field of fields) if (!allowed.includes(field)) throw new Error('invalidField');
    const asc = ascendingStates ?? [];
    /** Dates compare chronologically with unset dates last; durations compare by length. */
    const compareValues = (left: unknown, right: unknown): number => {
      const time = (value: unknown): number | undefined =>
        value instanceof Date ? value.getTime()
          : value && typeof value === 'object' && 'time' in value ? Number((value as Duration).time)
          : undefined;
      const leftTime = time(left), rightTime = time(right);
      if (leftTime !== undefined || rightTime !== undefined)
        return (leftTime ?? Number.MAX_SAFE_INTEGER) - (rightTime ?? Number.MAX_SAFE_INTEGER);
      if (typeof left === 'number' && typeof right === 'number') return left - right;
      return String(left).localeCompare(String(right));
    };
    const compare = (a: Task, b: Task): number => {
      for (let i = 0; i < fields.length; i++) {
        const order = compareValues(a.getValue(fields[i]!), b.getValue(fields[i]!));
        if (order) return order * (asc[i] === false ? -1 : 1);
      }
      return 0;
    };
    let ordered: Task[];
    let rows: (Task | null)[];
    if (keepStructure) {
      ordered = [];
      const walk = (parent: Task): void => {
        const children = parent._childList().slice().sort(compare);
        for (const child of children) { ordered.push(child); walk(child); }
      };
      walk(this.root);
      rows = [this.root, ...ordered];
    } else {
      // Without the outline the trial sorts every row, the project summary included.
      rows = this._tasks.slice().sort(compare);
      ordered = rows.filter(task => task !== this.root) as Task[];
    }
    if (renumber) {
      // Trial-observed: renumbering rewrites the physical task order, re-derives the outline from
      // the preserved levels and leaves the project unsorted again.
      this._tasks.splice(1, this._tasks.length - 1, ...ordered);
      this.sortedValue = false;
      this.rebuild(true);
      return;
    }
    this.sortedValue = true;
    this.rowOrder = rows.slice();
    this.rowOrder.forEach((task, row) => { if (task) task.rowIndex = row; });
    this.schedule(true);
  }
  /** Rebuilds parent links, numbering and rows from the level column, then schedules. */
  private rebuild(force: boolean): void {
    const stack: Task[] = [this.root];
    for (const task of this._tasks) task._childList().length = 0;
    this._tasks.forEach((task, index) => {
      task.taskNumber = index;
      if (!this.sortedValue) task.rowIndex = index;
      if (!index) return;
      task.level = Math.max(1, Math.min(task.level, stack.length));
      stack.length = task.level;
      task.parent = stack[task.level - 1];
      task.parent!._childList().push(task);
      stack.push(task);
    });
    if (!this.sortedValue) this.rowOrder = this._tasks.slice();
    // The trial removes links that the outline change turned into ancestor relations
    // (verified: an indenting predecessor string disappears from `predecessors`).
    this.linkList = this.linkList.filter(link => !isAncestor(link.from, link.to) && !isAncestor(link.to, link.from));
    this.reindexLinks();
    this.schedule(force);
  }
  suspendSchedule(): void { this.suspended++; }
  resumeSchedule(): void {
    if (this.suspended > 0) this.suspended--;
    if (!this.suspended) this.schedule(true);
  }
  /**
   * Recomputes one task's own bar after an edit, without propagating to its successors or to the
   * project roll-up. A suspended trial edit still shows the edited task's new bar (probe 2 S7),
   * while the rest of the model stays at its previous dates until `resumeSchedule`.
   */
  private refreshSelf(task: Task): void {
    if (task === this.root) return;
    const time = task.duration?.time;
    if (time === undefined || !hasDate(task.start)) return;
    task._setDates(task.start, addTaskTime(this.calendarValue, task.start, time));
    task._setLayout(task.start);
  }
  /**
   * Runs one full scheduling pass. `force` clears a pending predecessor-string deferral;
   * without it the pass is skipped while a deferral is pending, matching the trial.
   *
   * The pass mirrors the trial's anchor model: an automatic task starts at the layout baseline it
   * inherits (the project start for a top-level task, or its summary's own bar start one level
   * down), pushed by its predecessor constraints; a summary without a pinned edge rolls its bar
   * up over every task below it.
   */
  schedule(force = false, self?: Task): void {
    if (this.suspended) {
      // Trial-observed (probe 2 S7 and the comparison `schedule` cases): while the schedule is
      // suspended the propagation is deferred, but the edited task's own bar is still refreshed.
      this.dirty = true;
      if (self) this.refreshSelf(self);
      return;
    }
    if (this.deferred && !force) return;
    this.deferred = false;
    this.dirty = false;
    const calendar = this.calendarValue;
    const predecessors = new Map<Task, TaskDependency<Task>[]>();
    for (const link of this.linkList) {
      const list = predecessors.get(link.to);
      if (list) list.push(link); else predecessors.set(link.to, [link]);
    }
    // The raw project start is the baseline; each task snaps itself when it has a duration.
    const projectBaseline = new Date(this.startValue);
    const done = new Set<Task>();
    /** The bar edges of every task under `task`, used by the roll-up. */
    const descendantBars = (task: Task): { start: Date; finish: Date }[] => {
      const bars: { start: Date; finish: Date }[] = [];
      const walk = (parent: Task): void => {
        for (const child of parent._childList()) {
          const start = child.start ?? child.startDisplayed;
          const finish = child.finish ?? child.finishDisplayed;
          if (hasDate(start) && hasDate(finish)) bars.push({ start, finish });
          walk(child);
        }
      };
      walk(task);
      return bars;
    };
    /** Baseline a child inherits: its summary's own bar start, or the day of its finish. */
    const inherited = (task: Task, fallback: Date): Date => {
      const parent = task.parent;
      if (!parent || parent === this.root) return projectBaseline;
      return baselineUnder(parent, fallback);
    };
    /** Baseline the children of `parent` inherit from it. */
    const baselineUnder = (parent: Task, fallback: Date): Date => {
      if (parent === this.root) return fallback;
      const own = parent._layout() ?? (hasDate(parent.finish)
        ? this.dayTime(parent.finish, this.calendarSettings.defaultStartTime) : undefined);
      return own ?? fallback;
    };
    /** Earliest starts imposed by the task's predecessors. */
    const constraints = (task: Task, baseline: Date): Date[] => {
      const out: Date[] = [];
      for (const link of predecessors.get(task) ?? []) {
        if (isAncestor(link.from, task) || isAncestor(task, link.from)) continue;
        visit(link.from, inherited(link.from, baseline));
        const anchor = link.type[0] === 'F' ? link.from.finish : link.from.start;
        if (!hasDate(anchor)) continue;
        // Trial probe 11: `TaskDependency.lag` is stored by the trial but never applied — every
        // unit, sign and the fourth constructor argument leave the dates identical to a lag-free
        // link — so the constraint uses the raw predecessor edge.
        let edge = new Date(anchor.getTime());
        // Finish-to-* links fix the task's finish, so its start is computed backwards.
        if (link.type[1] === 'F') edge = addWorkingTime(calendar, edge, -(task.duration?.time ?? 0));
        out.push(edge);
      }
      return out;
    };
    /** Completion of a summary: the duration-weighted mean of the leaf tasks inside it. */
    const rollComplete = (task: Task): void => {
      const leaves = (parent: Task): Task[] => parent.isSummary ? parent._childList().flatMap(leaves) : [parent];
      const descendants = leaves(task);
      const total = descendants.reduce((sum, child) => sum + (child.duration?.time ?? 0), 0);
      task._setComplete(total ? descendants.reduce((sum, child) => sum + (child.duration?.time ?? 0) * child.complete, 0) / total : 0);
    };
    /** Rolls an unpinned summary bar up over every task it contains. */
    const rollUp = (task: Task): void => {
      const bars = descendantBars(task);
      if (!bars.length) return;
      const start = new Date(Math.min(...bars.map(bar => bar.start.getTime())));
      const finish = new Date(Math.max(...bars.map(bar => bar.finish.getTime())));
      task._setDates(start, finish);
      task._setDuration(this.mapping.parseDuration({ time: workingTimeBetween(calendar, start, finish), unit: 'Day' }));
      rollComplete(task);
    };
    const visit = (task: Task, baseline: Date): void => {
      if (done.has(task)) return;
      done.add(task);
      const children = task._childList();
      if (task === this.root) {
        for (const child of children) visit(child, baseline);
        if (!children.length) {
          task._setDates(new Date(this.startValue), new Date(this.startValue));
          task._setDuration(this.mapping.parseDuration(0));
          task._setComplete(0);
          return;
        }
        rollUp(task);
        task._setLayout(hasDate(task.start) ? task.start : undefined);
        return;
      }
      if (task.mode === 'Manual') {
        // A manual task owns its dates; only a field the trial never stored is completed here.
        if (hasDate(task.start) && !hasDate(task.finish) && task.duration)
          task._setDates(task.start, addTaskTime(calendar, task.start, task.duration.time ?? 0));
        else if (!hasDate(task.start) && hasDate(task.finish) && task.duration)
          task._setDates(addTaskTime(calendar, task.finish, -(task.duration.time ?? 0)), task.finish);
        else if (!task.duration && hasDate(task.start) && hasDate(task.finish))
          task._setDuration(this.mapping.parseDuration({ time: workingTimeBetween(calendar, task.start, task.finish), unit: 'Day' }));
        task._setLayout(hasDate(task.start) ? task.start : undefined);
        for (const child of children) visit(child, baselineUnder(task, baseline));
        return;
      }
      if (task.isSummary) {
        const pinnedStart = task._startPinned() ? task.start : undefined;
        const pinnedFinish = task._finishPinned() ? task.finish : undefined;
        if (task._startPinned() && !hasDate(pinnedStart)) {
          // Trial-observed: a cleared summary start stays cleared, the finish survives and the
          // duration is dropped; children then hang off the day of that finish.
          task._setDuration(null);
          task._setLayout(undefined);
          for (const child of children) visit(child, baselineUnder(task, baseline));
          return;
        }
        if (task._finishPinned() && !hasDate(pinnedFinish) && !hasDate(pinnedStart)) {
          // Cleared finish: the bar keeps its start, drops its duration and stays open-ended.
          task._setDuration(null);
          task._setLayout(hasDate(task.start) ? task.start : undefined);
          for (const child of children) visit(child, baselineUnder(task, baseline));
          return;
        }
        // A pinned start wins over predecessor constraints: the trial keeps the anchored day and
        // hangs the children on it (probe 5 V4b, probe 6 W3).
        const candidate = hasDate(pinnedStart) ? pinnedStart
          : new Date(Math.max(baseline.getTime(), ...constraints(task, baseline).map(date => date.getTime())));
        task._setLayout(candidate);
        for (const child of children) visit(child, candidate);
        if (hasDate(pinnedStart) && hasDate(pinnedFinish)) {
          task._setDates(pinnedStart, pinnedFinish);
          task._setDuration(this.mapping.parseDuration({ time: workingTimeBetween(calendar, pinnedStart, pinnedFinish), unit: 'Day' }));
          rollComplete(task);
          return;
        }
        if (hasDate(pinnedStart)) {
          // Trial-observed: an anchored bar keeps the duration it had when it was anchored; a
          // child can hang past its end and only the project roll-up covers it.
          task._setDates(pinnedStart, addTaskTime(calendar, pinnedStart, task.duration?.time ?? 0));
          rollComplete(task);
          return;
        }
        if (hasDate(pinnedFinish)) {
          // Pinned finish only: the bar reaches back to the baseline it inherited from above.
          const start = this.workingSlot(baseline);
          task._setDates(start, pinnedFinish);
          task._setDuration(this.mapping.parseDuration({ time: workingTimeBetween(calendar, start, pinnedFinish), unit: 'Day' }));
          rollComplete(task);
          return;
        }
        if (task._durationPinned()) {
          // Duration pinned without a start: the bar keeps exactly the assigned length, even when
          // a child reaches further than it (`summary:durationSetterNarrower`).
          task._setDates(candidate, addTaskTime(calendar, candidate, task.duration?.time ?? 0));
          rollComplete(task);
          return;
        }
        rollUp(task);
        return;
      }
      // Trial-observed: an automatic leaf always carries a duration; a cleared or missing one
      // becomes the default day (`leaf:finishClearUnpinned`, `leaf:durationNullDefault`).
      if (!task.duration) task._setDuration(this.mapping.parseDuration(1) ?? undefined);
      const durationTime = task.duration?.time ?? 0;
      let start = new Date(Math.max(baseline.getTime(), ...constraints(task, baseline).map(date => date.getTime())));
      // A zero-duration bar sits on the raw edge; a bar with length snaps to a working slot.
      if (durationTime > 0) start = this.workingSlot(start);
      task._setLayout(start);
      task._setDates(start, addTaskTime(calendar, start, durationTime));
    };
    visit(this.root, projectBaseline);
  }
}

interface TaskDependencyLike { fromTaskNumber: number; toTaskNumber: number; type?: TaskDependencyType; }
export type ITaskDependency = TaskDependencyLike;

/** True when `candidate` is `task` or one of its outline ancestors. */
function isAncestor(candidate: Task, task: Task): boolean {
  for (let node: Task | undefined = task; node; node = node.parent) if (node === candidate) return true;
  return false;
}
