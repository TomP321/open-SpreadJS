import { Collection } from './collection.js';
import type { Task } from './project.js';

/** Options accepted by `GanttSheet.bindGanttView`. Mirrors the trial `IGanttSheetOptions`. */
export type IGanttSheetOptions = {
  enableGanttColumn?: boolean;
  allowAddNew?: boolean;
  sheetTabColor?: string;
  defaultMode?: 'Auto' | 'Manual';
};

/** One gridline descriptor used by the progress-line style. */
export type GanttGridline = { lineColor: string; lineType: number };
/** A single progress point on the progress line. */
export type IProgressPointStyle = { shape: string; color: string };
/** The routing behaviour of a progress-line path. */
export type IProgressLinePathType = {
  returnToReferenceDate: boolean;
  pointConnectionType: 'orthogonal' | 'diagonal';
};
/** The style of the progress-line date label. */
export type IProgressLineDateLabelStyle = { display: boolean; format: string; font: string };
/** Configuration of the progress line drawn across the chart. */
export type IProgressLine = {
  display: boolean;
  referenceDate: 'statusDate' | 'currentDate';
  pathType: IProgressLinePathType;
  lineStyle: GanttGridline;
  pointStyle: IProgressPointStyle;
  dateLabelStyle?: IProgressLineDateLabelStyle;
};

export class GanttGridlines {
  bottomTierColumn = { lineColor: '', lineType: 0 };
  currentDate = { lineColor: '#8BBF8A', lineType: 1 };
  ganttRows = { lineColor: 'transparent', lineType: 1 };
  middleTierColumn = { lineColor: '#FFFFFF', lineType: 1 };
  projectFinish = { lineColor: '#808080', lineType: 4 };
  projectStart = { lineColor: '#808080', lineType: 4 };
  statusDate: { lineColor: string; lineType: number } | undefined;
  topTierColumn = { lineColor: '', lineType: 0 };
}
export class NonWorkingTimeStyle {
  color = '#F7F7F7';
  drawMode: 'Behind' | 'None' = 'Behind';
  pattern = 'solidFill';
}
export class TaskbarLayout {
  barHeight = 12;
  barTextDateFormat = 'yyyy/mm/dd hh:mm';
  linkLineMode: 'noLinks' | 'toEnd' | 'toTop' = 'toTop';
  roundBarsToWholeDays = true;
  tipDateFormat = 'yyyy/mm/dd hh:mm';
}
export class TimescaleTier {
  count = 1;
  formatter: string | ((date: Date, project: unknown) => string) | undefined;
  labelAlign: 'Left' | 'Center' | 'Right' = 'Left';
  showTickLines = true;
  unit: number | undefined;
}

const DEV_NOT_IMPLEMENTED = '[OpenSheets] Not implemented';

/**
 * Timescale of a Gantt chart. The data members reproduce the trial-observed defaults. The
 * scroll and zoom methods depend on the chart viewport (not implemented yet), so they only
 * keep the zoom factor and warn in development builds.
 */
export class Timescale {
  autoFitMode: 'none' | 'project' = 'none';
  bottomTier = new TimescaleTier();
  margin = 0;
  maxDate = new Date(2030, 0, 1);
  middleTier = new TimescaleTier();
  minDate = new Date(2020, 0, 1);
  nonWorkingTime = new NonWorkingTimeStyle();
  showScaleSeparator = true;
  tierMode = 2;
  timescaleBottomTierTextStyle: Record<string, unknown> = {};
  timescaleMiddleTierTextStyle: Record<string, unknown> = {};
  timescaleTopTierTextStyle: Record<string, unknown> = {};
  topTier = new TimescaleTier();
  private zoomValue = 1.449462890625;
  /** Set by the owning sheet so style/zoom changes repaint the Gantt chart part. */
  _onChange: (() => void) | undefined;
  constructor() {
    this.topTier.unit = 1;
    this.middleTier.unit = 6;
    this.bottomTier.unit = 7;
    this.bottomTier.labelAlign = 'Center';
  }
  get currentDate(): Date { return new Date(new Date().setHours(8, 0, 0, 0)); }
  get zoomFactor(): number { return this.zoomValue; }
  scroll(_pixels: number): void { warnTimescale('scroll'); }
  scrollBy(_count: number, _unit: number): void { warnTimescale('scrollBy'); }
  scrollOneTick(_forward: boolean): void { warnTimescale('scrollOneTick'); }
  scrollTo(_date: Date, _percentOfViewport?: number): void { warnTimescale('scrollTo'); }
  zoomAuto(): void { warnTimescale('zoomAuto'); }
  zoomIn(adjustTierUnit = true): void { void adjustTierUnit; this.zoomTo(this.zoomValue * 1.25, false); }
  zoomOut(adjustTierUnit = true): void { void adjustTierUnit; this.zoomTo(this.zoomValue / 1.25, false); }
  zoomTo(zoomFactor: number, adjustTierUnit = true): void {
    void adjustTierUnit;
    if (Number.isFinite(zoomFactor) && zoomFactor > 0) {
      this.zoomValue = zoomFactor;
      this._onChange?.();
    }
  }
  zoomToRange(_start: Date, _end: Date, _adjustTierUnit?: boolean): void { warnTimescale('zoomToRange'); }
}

function warnTimescale(method: string): void {
  if (typeof process === 'undefined' || process.env.NODE_ENV !== 'production')
    console.warn(`${DEV_NOT_IMPLEMENTED}: Timescale.${method} requires the Gantt chart viewport.`);
}

/** The subset of `Task` a style rule reads; keeps hand-made rule inputs compiling. */
export interface TaskbarRuleTask {
  start?: Date;
  finish?: Date;
  startDisplayed?: Date;
  finishDisplayed?: Date;
}

/** Base class for custom task bar appearance rules. */
export class TaskbarStyleRule {
  // Declared as class fields so they become own instance properties and shadow any
  // prototype-level coverage stub installed for the declared members.
  name: string;
  style: Record<string, unknown> | undefined;
  typeName: string | undefined;
  constructor(name: string) { this.name = name; }
  match(_task: Task | TaskbarRuleTask): boolean { return false; }
  getFromDate(task: Task | TaskbarRuleTask): Date | undefined {
    return task.startDisplayed ?? task.start ?? undefined;
  }
  getToDate(task: Task | TaskbarRuleTask): Date | undefined {
    return task.finishDisplayed ?? task.finish ?? undefined;
  }
  fromJSON(styleSetting: unknown): void {
    const value = styleSetting as { style?: Record<string, unknown> } | null | undefined;
    this.style = value?.style;
  }
  toJSON(): { name: string; style?: Record<string, unknown>; typeName?: string } {
    return { name: this.name, ...(this.style === undefined ? {} : { style: this.style }),
      ...(this.typeName === undefined ? {} : { typeName: this.typeName }) };
  }
}

/** A rule whose `match` callback is a predicate over the task. */
class PredicateTaskbarStyleRule extends TaskbarStyleRule {
  constructor(name: string, private readonly condition: (task: Task) => boolean, style: Record<string, unknown>) {
    super(name);
    this.style = { taskbarStyle: style };
  }
  override match(task: Task): boolean { return this.condition(task); }
}

const isRoot = (task: Task): boolean => task.taskNumber === 0;
const isAutoLeaf = (task: Task): boolean => task.mode === 'Auto' && !task.isSummary;
const isManualLeaf = (task: Task): boolean => task.mode === 'Manual' && !task.isSummary;
const hasDate = (value: Date | null | undefined): value is Date => value !== undefined && value !== null;
const hasDates = (task: Task): boolean => hasDate(task.start) && hasDate(task.finish);
const hasOnly = (task: Task, field: 'start' | 'finish'): boolean => {
  const other = field === 'start' ? 'finish' : 'start';
  return hasDate(task[field]) && !hasDate(task[other]) && task.duration == null;
};
const hasDuration = (task: Task): boolean => task.duration != null;

/**
 * Creates the 15 built-in task bar style rules in trial order with trial-observed styles
 * (read from the public `taskStyleRules.toJSON()`) and predicates inferred from calling the
 * public `match` method on the trial with a fixture project.
 */
export function createDefaultTaskStyleRules(): Collection<TaskbarStyleRule> {
  const rules: TaskbarStyleRule[] = [
    new PredicateTaskbarStyleRule('task', task => isAutoLeaf(task) && !task.isMilestone, {
      middlePattern: 'solidFill', middleShape: 'rectangleBar', middleColor: '#8abbed' }),
    new PredicateTaskbarStyleRule('milestone', task => isAutoLeaf(task) && task.isMilestone === true, {
      startColor: '#636363', startShape: 'diamond', startType: 'solid', rightText: 'finish' }),
    new PredicateTaskbarStyleRule('summary', task => task.isSummary && !isRoot(task) && task.mode === 'Auto', {
      startColor: '#545454', startShape: 'lineShape', startType: 'solid', middleColor: '#545454',
      middlePattern: 'solidFill', middleShape: 'lineTop', endShape: 'lineShape', endType: 'solid', endColor: '#545454' }),
    new PredicateTaskbarStyleRule('projectSummary', isRoot, {
      startColor: '#B6B6B6', startShape: 'lineShape', startType: 'solid', middleColor: '#B6B6B6',
      middlePattern: 'solidFill', middleShape: 'lineTop', endShape: 'lineShape', endType: 'solid', endColor: '#B6B6B6' }),
    new PredicateTaskbarStyleRule('manualTask', task => isManualLeaf(task) && task.isMilestone !== true && hasDates(task), {
      startColor: '#2BA3AD', startShape: 'lineShape', startType: 'solid', middleColor: '#74CCD4',
      middlePattern: 'solidFill', middleShape: 'rectangleBar', endShape: 'lineShape', endType: 'solid', endColor: '#2BA3AD' }),
    new PredicateTaskbarStyleRule('manualMilestone', task => isManualLeaf(task) && task.isMilestone === true, {
      startColor: '#2BA3AD', startShape: 'diamond', startType: 'solid', rightText: 'finish' }),
    new PredicateTaskbarStyleRule('durationOnly',
      task => isManualLeaf(task) && task.isMilestone !== true && hasDuration(task) && !hasDate(task.start) && !hasDate(task.finish), {
      startColor: '#FFFFFF', startShape: 'leftFade', startType: 'solid', middleColor: '#74CCD4',
      middlePattern: 'solidFill', middleShape: 'rectangleBar', endShape: 'rightFade', endType: 'solid', endColor: '#FFFFFF' }),
    new PredicateTaskbarStyleRule('manualSummary', task => task.isSummary && !isRoot(task) && task.mode === 'Manual', {
      startColor: '#545454', startShape: 'lineShape', startType: 'solid', middleColor: '#545454',
      middlePattern: 'solidFill', middleShape: 'lineTop', endShape: 'lineShape', endType: 'solid', endColor: '#545454' }),
    new PredicateTaskbarStyleRule('startOnly', task => isManualLeaf(task) && task.isMilestone !== true && hasOnly(task, 'start'), {
      startColor: '#2BA3AD', startShape: 'leftBracket', startType: 'solid' }),
    new PredicateTaskbarStyleRule('finishOnly', task => isManualLeaf(task) && task.isMilestone !== true && hasOnly(task, 'finish'), {
      endShape: 'rightBracket', endType: 'solid', endColor: '#2BA3AD' }),
    new PredicateTaskbarStyleRule('durationOnlyMilestone',
      task => isManualLeaf(task) && task.isMilestone === true && hasDuration(task) && !hasDate(task.start) && !hasDate(task.finish), {
      startColor: '#CED9E8', startShape: 'diamond', startType: 'solid', rightText: 'finishDisplayed' }),
    new PredicateTaskbarStyleRule('startOnlyMilestone', task => isManualLeaf(task) && task.isMilestone === true && hasOnly(task, 'start'), {
      startColor: '#CED9E8', startShape: 'diamond', startType: 'solid', rightText: 'start' }),
    new PredicateTaskbarStyleRule('finishOnlyMilestone', task => isManualLeaf(task) && task.isMilestone === true && hasOnly(task, 'finish'), {
      startColor: '#CED9E8', startShape: 'diamond', startType: 'solid', rightText: 'finish' }),
    new PredicateTaskbarStyleRule('progress', task => isAutoLeaf(task) && !task.isMilestone, {
      middleColor: '#3B87D4', middleShape: 'rectangleMiddle', middlePattern: 'solidFill' }),
    new PredicateTaskbarStyleRule('manualProgress', task => isManualLeaf(task) && task.isMilestone !== true, {
      middleColor: '#2BA3AD', middleShape: 'rectangleMiddle', middlePattern: 'solidFill' }),
  ];
  return new Collection(rules);
}
