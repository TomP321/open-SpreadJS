import { describe, expect, it } from 'vitest';
import { Project, Task } from '../src/gantt/project';
import type { Duration } from '../src/gantt/mapping';
import { TaskDependency } from '../src/gantt/dependency';
import { TaskbarStyleRule } from '../src/gantt/appearance';
import { Calendar, CustomWorkWeek, WorkWeek } from '../src/gantt/calendar';

// All expected values were observed through the public API of the 19.2.5 official trial
// (apps/compare black-box runs) unless noted as an OpenSheets engine extension.

const DAY8 = 28800000;

function makeProject(durations: (string | number)[] = [1, 1, 1, 1]): Project {
  const project = new Project('Model');
  project.startDate = new Date(2025, 0, 6, 8);
  project.addTasks(durations.map(duration => ({ duration })));
  return project;
}

describe('dependency string grammar (trial-observed)', () => {
  it('accepts case-insensitive types, padded spaces and ignored lag suffixes', () => {
    const project = makeProject();
    project.getTask(4).predecessors = ' 1fs+1d , 2SS+ 1 day ,3ff-2hrs';
    expect(project.dependencies).toHaveLength(3);
    expect(project.getTask(4).predecessors).toBe('1,2SS,3FF');
    expect(project.dependencies.map(d => d.type)).toEqual(['FS', 'SS', 'FF']);
  });
  it('accepts a lone sign suffix and keeps insertion order in the read-back', () => {
    const project = makeProject();
    project.getTask(4).predecessors = '3SS+0,1FS+';
    expect(project.getTask(4).predecessors).toBe('3SS,1');
  });
  it.each(['1FS 1FS', '1 SS', '01FS', '+1FS', '1FS+1d,', ',1FS', '1FSS', '1X', '2FS;1FS'])('rejects %s', text => {
    const project = makeProject();
    expect(() => { project.getTask(3).predecessors = text; }).toThrow('invalidDependency');
    expect(project.dependencies).toHaveLength(0);
  });
  it('keeps the previous links when a new string is rejected (transactional)', () => {
    const project = makeProject();
    project.getTask(2).predecessors = '1FS';
    expect(() => { project.getTask(2).predecessors = '1FS 1FS'; }).toThrow('invalidDependency');
    expect(project.getTask(2).predecessors).toBe('1');
    expect(project.dependencies).toHaveLength(1);
  });
  it('rejects self, unknown, root and forward-of-count references', () => {
    const project = makeProject();
    for (const text of ['2FS', '0FS', '99', '1,2FS']) {
      expect(() => { project.getTask(2).predecessors = text; }).toThrow('invalidDependency');
    }
  });
  it('allows a predecessor that appears later in the task list', () => {
    const project = makeProject();
    project.getTask(2).predecessors = '3FS';
    expect(project.dependencies).toHaveLength(1);
  });
  it('rejects cycles from either the string setter or addDependency', () => {
    const project = makeProject();
    project.getTask(2).predecessors = '1FS';
    expect(() => { project.getTask(1).predecessors = '2FS'; }).toThrow('invalidDependency');
    expect(project.dependencies).toHaveLength(1);
    expect(() => project.addDependency({ fromTaskNumber: 2, toTaskNumber: 1 })).toThrow('invalidDependency');
  });
  it('rejects dependencies between an ancestor and its descendant', () => {
    const project = makeProject();
    project.indentTasks([2, 3]);
    expect(() => project.addDependency({ fromTaskNumber: 1, toTaskNumber: 3 })).toThrow('invalidDependency');
    expect(() => project.addDependency({ fromTaskNumber: 3, toTaskNumber: 1 })).toThrow('invalidDependency');
    expect(() => { project.getTask(3).predecessors = '1FS'; }).toThrow('invalidDependency');
  });
  it('clears all links with an empty string', () => {
    const project = makeProject();
    project.getTask(2).predecessors = '1FS';
    project.getTask(2).predecessors = '';
    expect(project.dependencies).toHaveLength(0);
    expect(project.getTask(2).predecessors).toBe('');
  });
  it('supports the successors mirror string', () => {
    const project = makeProject();
    project.getTask(1).successors = '2FF';
    expect(project.getTask(1).successors).toBe('2FF');
    expect(project.dependencies[0]).toMatchObject({ from: project.getTask(1), to: project.getTask(2), type: 'FF' });
  });
});

describe('trial deferral of predecessor string edits', () => {
  it('keeps stale dates after a string edit until a flush', () => {
    const project = makeProject(['1d', '1d']);
    project.getTask(2).predecessors = '1FS';
    expect(project.getTask(2).start).toEqual(new Date(2025, 0, 6, 8));
    project.resumeSchedule();
    expect(project.getTask(2).start).toEqual(new Date(2025, 0, 7, 8));
  });
  it.each([
    'duration', 'start', 'finish', 'mode', 'startDate', 'calendar', 'addTasks', 'insertTasks',
    'removeTasks', 'outdentTasks', 'addDependency', 'removeDependency', 'sort',
  ] as const)('a %s change flushes the pending edit', kind => {
    const project = makeProject();
    project.getTask(2).predecessors = '1FS';
    switch (kind) {
      case 'duration': project.getTask(3).duration = '2d'; break;
      case 'start': project.getTask(3).start = new Date(2025, 0, 9, 8); break;
      case 'finish': project.getTask(3).finish = new Date(2025, 0, 9, 17); break;
      case 'mode': project.getTask(3).mode = 'Manual'; break;
      case 'startDate': project.startDate = new Date(2025, 0, 6, 8); break;
      case 'calendar': project.calendar = Calendar.standard.copyTo('Copy'); break;
      case 'addTasks': project.addTasks({ duration: '1d' }); break;
      case 'insertTasks': project.insertTasks(3, { duration: '1d' }); break;
      case 'removeTasks': project.removeTasks(4); break;
      case 'outdentTasks': project.outdentTasks(2); break;
      case 'addDependency': project.addDependency({ fromTaskNumber: 3, toTaskNumber: 4 }); break;
      case 'removeDependency': {
        project.getTask(3).predecessors = '1FS';
        const other = project.dependencies.filter(d => d.to === project.getTask(3))[0]!;
        project.removeDependency(other);
        break;
      }
      case 'sort': project.sort(['name']); break;
    }
    expect(project.getTask(2).start).toEqual(new Date(2025, 0, 7, 8));
  });
  it('does not flush on name, complete, indent, status/current date or setValue edits', () => {
    const project = makeProject();
    project.getTask(2).predecessors = '1FS';
    project.getTask(3).name = 'x';
    project.getTask(3).complete = 1;
    project.indentTasks([4]);
    project.statusDate = new Date(2025, 0, 5, 8);
    project.currentDate = new Date(2025, 0, 5, 8);
    project.getTask(3).setValue('duration', '2d');
    void project.finishDate;
    void project.tasks;
    expect(project.getTask(2).start).toEqual(new Date(2025, 0, 6, 8));
    project.resumeSchedule();
    expect(project.getTask(2).start).toEqual(new Date(2025, 0, 7, 8));
  });
  it('removes ancestor links created by a later indent', () => {
    const project = makeProject();
    project.getTask(3).predecessors = '1FS';
    project.indentTasks([2, 3]);
    expect(project.getTask(3).predecessors).toBe('');
    expect(project.dependencies).toHaveLength(0);
    project.resumeSchedule();
    expect(project.getTask(3).start).toEqual(new Date(2025, 0, 6, 8));
  });
});

/**
 * Lag compatibility with the trial (probe `.probe/gantt-lag-matrix-1.json`).
 *
 * The trial keeps whatever is assigned to `TaskDependency.lag` and read it back unchanged, but its
 * scheduler never applies it: for every dependency type, every unit (`d`, `h`, `min`, `w`, `mon`,
 * zero), every hand-built `Duration` object (including negative `time`) and every lag suffix in a
 * predecessor string, the resulting task dates were identical to the same link without lag.
 * `parseDuration` rejects negative magnitudes outright (`-1d`, `-4h`, `-30min`, `-1w`, `-1mon` all
 * return null), so a negative lag can only be spelled as an object. The trial also ignores a
 * fourth `TaskDependency` constructor argument (`dep.lag` stays undefined).
 * All values below are those observed on the trial.
 */
describe('dependency lag is stored but never applied (trial probe 11)', () => {
  const TYPES = ['FS', 'SS', 'FF', 'SF'] as const;
  /** The trial also accepts partial `Duration` objects (only `time`, or only `value` and `unit`). */
  const partial = (object: { value?: number, unit?: 'Month' | 'Week' | 'Day' | 'Hour' | 'Minute', time?: number }): Duration => object as Duration;
  /** T1 lasts 3 days (Jan 6 08:00 -> Jan 8 17:00), T2 2 days; project start Mon Jan 6 08:00. */
  const lagged = (type: typeof TYPES[number], lag: Duration | string | null) => {
    const project = makeProject(['3d', '2d']);
    const dependency = new TaskDependency(project.getTask(1), project.getTask(2), type);
    if (typeof lag === 'string') dependency.lag = project.parseDuration(lag);
    else if (lag !== null) dependency.lag = lag;
    project.addDependency(dependency);
    project.resumeSchedule();
    return project;
  };
  /** The lag-free reference dates each type produces for this pair of tasks. */
  const reference: Record<typeof TYPES[number], [Date, Date]> = {
    FS: [new Date(2025, 0, 9, 8), new Date(2025, 0, 10, 17)],
    SS: [new Date(2025, 0, 6, 8), new Date(2025, 0, 7, 17)],
    FF: [new Date(2025, 0, 7, 8), new Date(2025, 0, 8, 17)],
    SF: [new Date(2025, 0, 6, 8), new Date(2025, 0, 7, 17)],
  };
  const LAGS: (Duration | string | null)[] = ['1d', '4h', '30min', '1w', '1mon', '0d', null,
    partial({ value: 1, unit: 'Day' }), partial({ value: -1, unit: 'Day' }),
    partial({ time: 28800000 }), partial({ time: -28800000 })];
  for (const type of TYPES) for (const lag of LAGS) {
    it(`${type} with lag ${JSON.stringify(lag) ?? 'none'} schedules like the link without it`, () => {
      const project = lagged(type, lag);
      const [start, finish] = reference[type]!;
      expect(project.getTask(1).start).toEqual(new Date(2025, 0, 6, 8));
      expect(project.getTask(1).finish).toEqual(new Date(2025, 0, 8, 17));
      expect(project.getTask(2).start).toEqual(start);
      expect(project.getTask(2).finish).toEqual(finish);
      expect(project.getTask(2).duration).toMatchObject({ value: 2, unit: 'Day', time: 57600000 });
    });
  }
  it('keeps an assigned lag on the live dependency object', () => {
    const project = lagged('FS', '1d');
    expect(project.dependencies[0]!.lag).toMatchObject({ value: 1, unit: 'Day', time: 28800000 });
    const hand = lagged('FS', partial({ value: -2, unit: 'Hour' }));
    expect(hand.dependencies[0]!.lag).toEqual(partial({ value: -2, unit: 'Hour' }));
    expect(lagged('FS', null).dependencies[0]!.lag).toBeUndefined();
  });
  it('rejects negative durations in parseDuration', () => {
    const project = makeProject(['1d']);
    for (const text of ['-1d', '-4h', '-30min', '-1w', '-1mon']) expect(project.parseDuration(text)).toBeNull();
  });
  it('ignores a lag suffix spelled in a predecessor string, after the flush too', () => {
    for (const type of TYPES) for (const suffix of ['+1d', '-4h', '']) {
      const project = makeProject(['3d', '2d']);
      project.getTask(2).predecessors = `1${type}${suffix}`;
      const stale = [project.getTask(2).start, project.getTask(2).finish];
      project.resumeSchedule();
      const [start, finish] = reference[type]!;
      expect([stale[0], stale[1]]).toEqual([new Date(2025, 0, 6, 8), new Date(2025, 0, 7, 17)]);
      expect(project.getTask(2).predecessors).toBe(type === 'FS' ? '1' : `1${type}`);
      expect([project.getTask(2).start, project.getTask(2).finish]).toEqual([start, finish]);
      expect(project.dependencies[0]!.lag).toBeUndefined();
    }
  });
  it('lets the latest constraint win across mixed links, without any lag', () => {
    const project = makeProject(['1d', '1d', '1d', '1d']);
    const later = new TaskDependency(project.getTask(1), project.getTask(4), 'FS');
    later.lag = project.parseDuration('1d');
    const earlier = new TaskDependency(project.getTask(3), project.getTask(4), 'SS');
    project.addDependency([earlier, later]);
    // The FS link through task 1 (Jan 6 08:00 -> 17:00) is the later constraint; its lag is dropped
    // exactly like the trial does, as the trial `multiPred` comparison scenario also shows.
    expect(project.getTask(4).start).toEqual(new Date(2025, 0, 7, 8));
    expect(project.getTask(4).finish).toEqual(new Date(2025, 0, 7, 17));
  });
});

describe('working-time scheduling details (trial-observed)', () => {
  it('chains hour durations across the lunch gap', () => {
    const project = makeProject(['4h', '4h']);
    project.addDependency({ fromTaskNumber: 1, toTaskNumber: 2 });
    expect(project.getTask(2).start).toEqual(new Date(2025, 0, 6, 13));
    expect(project.getTask(2).finish).toEqual(new Date(2025, 0, 6, 17));
  });
  it('keeps a milestone at the predecessor finish edge', () => {
    const project = makeProject(['2d', '0d']);
    project.addDependency({ fromTaskNumber: 1, toTaskNumber: 2 });
    expect(project.getTask(2).start).toEqual(new Date(2025, 0, 7, 17));
    expect(project.getTask(2).finish).toEqual(new Date(2025, 0, 7, 17));
  });
  it('keeps a dependency-free milestone at the raw project start even outside work time', () => {
    const project = new Project('M');
    project.startDate = new Date(2025, 0, 6, 12, 30);
    project.addTasks({ duration: '0d' });
    expect(project.getTask(1).start).toEqual(new Date(2025, 0, 6, 12, 30));
  });
  it('snaps automatic starts to the next working instant', () => {
    const project = new Project('M');
    project.startDate = new Date(2025, 0, 6, 12, 30);
    project.addTasks([{ duration: '3d' }, { duration: '1d' }]);
    project.addDependency({ fromTaskNumber: 1, toTaskNumber: 2, type: 'FS' });
    expect(project.getTask(1).start).toEqual(new Date(2025, 0, 6, 13));
    expect(project.getTask(1).finish).toEqual(new Date(2025, 0, 9, 12));
    expect(project.getTask(2).start).toEqual(new Date(2025, 0, 9, 13));
  });
  it('back-computes FF and SF starts then clamps them to the project start', () => {
    const project = makeProject(['3d', '1d']);
    project.addDependency({ fromTaskNumber: 1, toTaskNumber: 2, type: 'FF' });
    expect(project.getTask(2).start).toEqual(new Date(2025, 0, 8, 8));
    expect(project.getTask(2).finish).toEqual(new Date(2025, 0, 8, 17));
    const other = makeProject(['3d', '1d']);
    other.addDependency({ fromTaskNumber: 1, toTaskNumber: 2, type: 'SF' });
    expect(other.getTask(2).start).toEqual(new Date(2025, 0, 6, 8));
    expect(other.getTask(2).finish).toEqual(new Date(2025, 0, 6, 17));
  });
  it('honours a partial custom work week', () => {
    const project = makeProject();
    const interval = (start: number, end: number) => ({ start: { hour: start, minute: 0 }, end: { hour: end, minute: 0 } });
    const days = Array.from({ length: 7 }, (_, day) => day === 0 ? [] :
      day === 6 ? [interval(8, 12)] : [interval(8, 12), interval(13, 17)]);
    project.calendar = new Calendar('Sat', new WorkWeek(days));
    project.removeTasks([1, 2, 3, 4]);
    project.addTasks({ duration: '5d' });
    expect(project.getTask(1).start).toEqual(new Date(2025, 0, 6, 8));
    expect(project.getTask(1).finish).toEqual(new Date(2025, 0, 10, 17));
  });
  it('uses the first overlapping custom work week', () => {
    const project = makeProject();
    const interval = (start: number, end: number) => ({ start: { hour: start, minute: 0 }, end: { hour: end, minute: 0 } });
    const standardWeek = (emptyDays: number[]) => Array.from({ length: 7 },
      (_, day) => day === 0 || emptyDays.includes(day) ? [] : [interval(8, 12), interval(13, 17)]);
    const calendar = Calendar.standard.copyTo('Overlap');
    calendar.customWorkWeeks.push(new CustomWorkWeek(standardWeek([]), new Date(2025, 0, 7), new Date(2025, 0, 9)));
    calendar.customWorkWeeks.push(new CustomWorkWeek(standardWeek([3]), new Date(2025, 0, 9), new Date(2025, 0, 10)));
    project.calendar = calendar;
    project.removeTasks([1, 2, 3, 4]);
    project.addTasks({ duration: '4d' });
    expect(project.getTask(1).start).toEqual(new Date(2025, 0, 6, 8));
    expect(project.getTask(1).finish).toEqual(new Date(2025, 0, 9, 17));
  });
});

describe('manual scheduling and displayed dates (trial-observed)', () => {
  it('leaves duration and the opposite date unset for one-sided manual tasks', () => {
    const project = new Project('P');
    project.startDate = new Date(2025, 0, 6, 8);
    const [startOnly, finishOnly, durationOnly] = project.addTasks([
      { mode: 'Manual', start: new Date(2025, 0, 8, 8) },
      { mode: 'Manual', finish: new Date(2025, 0, 9, 17) },
      { mode: 'Manual', duration: '2d' },
    ]);
    expect(startOnly!.finish).toBeUndefined();
    expect(startOnly!.duration).toBeUndefined();
    expect(startOnly!.completeThrough).toEqual(new Date(2025, 0, 8, 8));
    expect(finishOnly!.start).toBeUndefined();
    expect(finishOnly!.completeThrough).toEqual(new Date(2025, 0, 9, 8));
    expect(durationOnly!.start).toBeUndefined();
    expect(durationOnly!.completeThrough).toEqual(new Date(2025, 0, 6, 8));
    expect(startOnly!.startDisplayed).toEqual(new Date(2025, 0, 8, 8));
    expect(startOnly!.finishDisplayed).toEqual(new Date(2025, 0, 8, 17));
    expect(finishOnly!.startDisplayed).toEqual(new Date(2025, 0, 9, 8));
    expect(durationOnly!.startDisplayed).toEqual(new Date(2025, 0, 6, 8));
    expect(durationOnly!.finishDisplayed).toEqual(new Date(2025, 0, 7, 17));
    expect(startOnly!.isMilestone).toBeUndefined();
  });
  it('recomputes the manual finish from start and duration', () => {
    const project = new Project('P');
    project.startDate = new Date(2025, 0, 6, 8);
    const [task] = project.addTasks({ mode: 'Manual', start: new Date(2025, 0, 10, 8), duration: '1d' });
    task!.duration = '2d';
    expect(task!.finish).toEqual(new Date(2025, 0, 13, 17));
    task!.start = new Date(2025, 0, 6, 8);
    expect(task!.finish).toEqual(new Date(2025, 0, 7, 17));
  });
  it('keeps a manual summary at its own dates while rescheduling', () => {
    const project = makeProject(['1d', '1d', '2d']);
    project.indentTasks([2, 3]);
    project.getTask(1).mode = 'Manual';
    project.getTask(1).finish = new Date(2025, 0, 20, 17);
    project.getTask(2).duration = '3d';
    expect(project.getTask(1).start).toEqual(new Date(2025, 0, 6, 8));
    expect(project.getTask(1).finish).toEqual(new Date(2025, 0, 20, 17));
    expect(project.getTask(1).duration).toEqual({ value: 11, unit: 'Day', time: 11 * DAY8 });
  });
  it('rolls a summary up over one-sided manual children using their displayed dates', () => {
    const project = makeProject(['1d']);
    project.addTasks({ mode: 'Manual', start: new Date(2025, 0, 8, 8) });
    project.indentTasks([2]);
    expect(project.getTask(1).start).toEqual(new Date(2025, 0, 8, 8));
    expect(project.getTask(1).finish).toEqual(new Date(2025, 0, 8, 17));
    expect(project.getTask(1).duration).toEqual({ value: 1, unit: 'Day', time: DAY8 });
  });
  it('derives the summary duration from working time across weekends', () => {
    const project = makeProject(['1d', '1d', '1d', '1d']);
    project.addTasks({ mode: 'Manual', start: new Date(2024, 11, 27, 8), duration: '1d' });
    project.indentTasks([2, 3, 4, 5]);
    expect(project.getTask(1).start).toEqual(new Date(2024, 11, 27, 8));
    expect(project.getTask(1).finish).toEqual(new Date(2025, 0, 6, 17));
    expect(project.getTask(1).duration).toEqual({ value: 7, unit: 'Day', time: 7 * DAY8 });
  });
  it('ignores completeThrough assignment and clamps complete setter values', () => {
    const project = makeProject(['1d']);
    const task = project.getTask(1);
    task.complete = 0.5;
    expect(task.complete).toBe(0.5);
    expect(task.completeThrough).toEqual(new Date(2025, 0, 6, 12));
    task.complete = 50;
    expect(task.complete).toBe(1);
    task.completeThrough = new Date(2030, 0, 1);
    expect(task.completeThrough).toEqual(new Date(2025, 0, 6, 17));
  });
  it('stores addTasks completion data unclamped like the trial', () => {
    const project = new Project('P');
    project.startDate = new Date(2025, 0, 6, 8);
    project.addTasks({ duration: '1d', complete: 50 });
    expect(project.getTask(1).complete).toBe(50);
  });
  it('mirrors the trial no-op setValue and working getValue', () => {
    const project = makeProject(['1d']);
    const task = project.getTask(1);
    task.setValue('name', 'changed');
    task.setValue('duration', '3d');
    expect(task.name).toBeUndefined();
    expect(task.duration).toEqual({ value: 1, unit: 'Day', time: DAY8 });
    expect(task.getValue('taskNumber')).toBe(1);
  });
});

describe('outline and collection operations (trial-observed)', () => {
  it('rejects out-of-range task numbers with invalidId', () => {
    const project = makeProject();
    expect(() => project.insertTasks(0)).toThrow('invalidId');
    expect(() => project.insertTasks(-1)).toThrow('invalidId');
    expect(() => project.insertTasks(99)).toThrow('invalidId');
    expect(() => project.indentTasks(99)).toThrow('invalidId');
    expect(() => project.outdentTasks(0)).toThrow('invalidId');
    expect(() => project.removeTasks(99)).toThrow('invalidId');
    expect(() => project.removeTasks(0)).toThrow('invalidId');
    // Comparison `range:*`: the start row is validated as a task number (`invalidId`), a range
    // that reaches past the last task or asks for fewer than one task is `invalidCount`.
    expect(() => project.removeTasksByRange(2, 5)).toThrow('invalidCount');
    expect(() => project.removeTasksByRange(2, 0)).toThrow('invalidCount');
    expect(() => project.removeTasksByRange(2, -1)).toThrow('invalidCount');
    expect(() => project.removeTasksByRange(9, 1)).toThrow('invalidId');
    expect(() => project.removeTasksByRange(0, 1)).toThrow('invalidId');
  });
  it('appends when inserting at the task count', () => {
    const project = makeProject(['1d', '1d']);
    const [task] = project.insertTasks(3, { name: 'End' });
    expect(project.tasks.map(t => t.name)).toEqual(['Model', undefined, undefined, 'End']);
    expect(task!.taskNumber).toBe(3);
  });
  it('validates the requested level like the trial', () => {
    const project = makeProject(['1d']);
    expect(() => project.addTasks(1, 3)).toThrow('invalidLevel');
    expect(() => project.addTasks(1, 0)).toThrow('invalidLevel');
    expect(project.addTasks(1, 2)).toHaveLength(1);
    expect(project.tasks.map(t => t.level)).toEqual([0, 1, 2]);
  });
  it('sorts into rows without renumbering unless asked', () => {
    const project = new Project('S');
    project.startDate = new Date(2025, 0, 6, 8);
    project.addTasks([{ name: 'z', duration: '1d' }, { name: 'y', duration: '2d' }, { name: 'x', duration: '1d' }]);
    project.sort(['name'], [true]);
    expect(project.sorted).toBe(true);
    expect(project.tasks.map(t => t.name)).toEqual(['S', 'z', 'y', 'x']);
    expect(project.tasksSorted!.map(t => t && t.name)).toEqual(['S', 'x', 'y', 'z']);
    expect(project.getTaskByRow(1).name).toBe('x');
    expect(project.getTask(1).name).toBe('z');
    project.sort(['name'], [true], true, true);
    expect(project.tasks.map(t => t.name)).toEqual(['S', 'x', 'y', 'z']);
  });
  it('returns cloned arrays from tasks, children and dependencies', () => {
    const project = makeProject();
    expect(project.tasks).not.toBe(project.tasks);
    expect(project.root.children).not.toBe(project.root.children);
    expect(project.dependencies).not.toBe(project.dependencies);
  });
  it('reports the project dates over the manual tail task', () => {
    const project = makeProject(['1d']);
    project.addTasks({ mode: 'Manual', start: new Date(2025, 0, 20, 8), duration: '1d' });
    expect(project.finishDate).toEqual(new Date(2025, 0, 20, 17));
    expect(project.root.duration).toEqual({ value: 11, unit: 'Day', time: 11 * DAY8 });
  });
  it('keeps Task a plain constructible per the d.ts', () => {
    const task = new Task();
    expect(task.isSummary).toBe(false);
    expect(task.predecessorDependencies).toEqual([]);
  });
});

describe('built-in style rules and timescale (trial-observed)', () => {
  const project = makeProject(['1d', '1d', '1d', '1d']);
  it('contains the fifteen trial rules in trial order', () => {
    expect(project.taskStyleRules.length).toBe(15);
    expect(project.taskStyleRules.all().map(rule => rule.name)).toEqual([
      'task', 'milestone', 'summary', 'projectSummary', 'manualTask', 'manualMilestone', 'durationOnly',
      'manualSummary', 'startOnly', 'finishOnly', 'durationOnlyMilestone', 'startOnlyMilestone',
      'finishOnlyMilestone', 'progress', 'manualProgress',
    ]);
    expect(project.taskStyleRules.getRule('projectSummary')!.toJSON()).toEqual({
      name: 'projectSummary',
      style: { taskbarStyle: {
        startColor: '#B6B6B6', startShape: 'lineShape', startType: 'solid', middleColor: '#B6B6B6',
        middlePattern: 'solidFill', middleShape: 'lineTop', endShape: 'lineShape', endType: 'solid', endColor: '#B6B6B6' } },
    });
  });
  it('matches the trial rule predicates on a fixture project', () => {
    const rich = new Project('R');
    rich.startDate = new Date(2025, 0, 6, 8);
    rich.addTasks([
      { name: 'A', duration: '2d' },
      { name: 'B', duration: '1d', mode: 'Manual', start: new Date(2025, 0, 9, 8) },
      { name: 'C', duration: '3d', complete: 50 },
      { name: 'D', duration: '0d' },
      { name: 'E', duration: '1d', mode: 'Manual' },
    ]);
    rich.indentTasks([2, 3]);
    rich.addTasks({ name: 'F', mode: 'Manual', start: new Date(2025, 0, 13, 8) });
    const rules = rich.taskStyleRules;
    const matches = (name: string) => rules.getRule(name)!.match.bind(rules.getRule(name)!);
    expect(matches('task')(rich.getTask(3))).toBe(true);
    expect(matches('summary')(rich.getTask(1))).toBe(true);
    expect(matches('projectSummary')(rich.root)).toBe(true);
    expect(matches('milestone')(rich.getTask(4))).toBe(true);
    expect(matches('manualTask')(rich.getTask(2))).toBe(true);
    expect(matches('durationOnly')(rich.getTask(5))).toBe(true);
    expect(matches('startOnly')(rich.getTask(6))).toBe(true);
    expect(matches('progress')(rich.getTask(3))).toBe(true);
    expect(matches('manualProgress')(rich.getTask(6))).toBe(true);
    expect(matches('manualMilestone')(rich.getTask(2))).toBe(false);
    expect(rules.getRule('task')!.getFromDate(rich.getTask(5))).toEqual(new Date(2025, 0, 6, 8));
    expect(rules.getRule('task')!.getToDate(rich.getTask(5))).toEqual(new Date(2025, 0, 6, 17));
  });
  it('matches the whole built-in rule matrix of the trial fixture', () => {
    // Trial values: apps/compare comparison case `rule:matchFixture` / `rule:matchRoot`
    // (.probe/gantt-comp-r12.json), columns in trial rule order.
    const columns = [
      'task', 'milestone', 'summary', 'projectSummary', 'manualTask', 'manualMilestone', 'durationOnly',
      'manualSummary', 'startOnly', 'finishOnly', 'durationOnlyMilestone', 'startOnlyMilestone',
      'finishOnlyMilestone', 'progress', 'manualProgress',
    ];
    const fixture = new Project('FX');
    fixture.startDate = new Date(2025, 0, 6, 8);
    fixture.addTasks([
      { name: 'Auto', duration: '2d' }, { name: 'Zero', duration: '0d' },
      { name: 'SumHead', duration: '1d' }, { name: 'SumChild', duration: '2d' },
      { name: 'Manual', mode: 'Manual', start: new Date(2025, 0, 9, 8), duration: '2d' },
      { name: 'ManMile', mode: 'Manual', start: new Date(2025, 0, 10, 8), duration: '0d' },
      { name: 'StartOnly', mode: 'Manual', start: new Date(2025, 0, 13, 8) },
      { name: 'FinishOnly', mode: 'Manual', finish: new Date(2025, 0, 15, 17) },
      { name: 'DurOnly', mode: 'Manual', duration: '1d' },
      { name: 'Progress', duration: '2d', complete: 0.5 },
    ]);
    fixture.indentTasks([4]);
    const rules = fixture.taskStyleRules;
    expect(rules.all().map(rule => rule.name)).toEqual(columns);
    const matrix = (task: Task) => columns.map(name => rules.getRule(name)!.match(task) ? '1' : '0').join('');
    expect(Object.fromEntries(fixture.tasks.map(task => [task.name, matrix(task)]))).toEqual({
      FX: '000100000000000',
      Auto: '100000000000010', Zero: '010000000000000', SumHead: '001000000000000',
      SumChild: '100000000000010', Manual: '000010000000001', ManMile: '000001000000000',
      StartOnly: '000000001000001', FinishOnly: '000000000100001', DurOnly: '000000100000001',
      Progress: '100000000000010',
    });
  });
  it('matches progress on automatic task bars regardless of the completion', () => {
    // Trial: an automatic task bar with complete = 0 still matches 'progress' (see the Auto row of
    // the matrix above), while a manual task bar matches 'manualProgress' with any completion.
    const project = makeProject(['2d', '0d', '1d']);
    project.getTask(3).mode = 'Manual';
    const rules = project.taskStyleRules;
    expect(rules.getRule('progress')!.match(project.getTask(1))).toBe(true);
    expect(rules.getRule('progress')!.match(project.getTask(2))).toBe(false);
    expect(rules.getRule('progress')!.match(project.getTask(3))).toBe(false);
    expect(rules.getRule('manualProgress')!.match(project.getTask(3))).toBe(true);
    expect(rules.getRule('manualProgress')!.match(project.getTask(1))).toBe(false);
  });
  it('exposes the trial timescale defaults', () => {
    const timescale = project.timescale;
    expect(timescale.autoFitMode).toBe('none');
    expect(timescale.margin).toBe(0);
    expect(timescale.tierMode).toBe(2);
    expect(timescale.showScaleSeparator).toBe(true);
    expect(timescale.zoomFactor).toBe(1.449462890625);
    expect(timescale.minDate).toEqual(new Date(2020, 0, 1));
    expect(timescale.maxDate).toEqual(new Date(2030, 0, 1));
    expect(timescale.topTier.unit).toBe(1);
    expect(timescale.middleTier.unit).toBe(6);
    expect(timescale.bottomTier.unit).toBe(7);
    expect(timescale.bottomTier.labelAlign).toBe('Center');
    expect(timescale.nonWorkingTime).toMatchObject({ color: '#F7F7F7', drawMode: 'Behind', pattern: 'solidFill' });
    timescale.zoomTo(2);
    expect(timescale.zoomFactor).toBe(2);
    expect([timescale.topTier.count, timescale.middleTier.count, timescale.bottomTier.count]).toEqual([1, 1, 1]);
  });
});

describe('duration parsing and formatting refinements (trial-observed)', () => {
  it('accepts trial suffix words and ignores trailing text', () => {
    const project = makeProject();
    expect(project.parseDuration('24hours')).toEqual({ value: 24, unit: 'Hour', time: 86400000 });
    expect(project.parseDuration('1 day elapsed')).toEqual({ value: 1, unit: 'Day', time: DAY8 });
    expect(project.parseDuration('1edays+2')).toEqual({ value: 1, unit: 'Day', time: DAY8 });
    expect(project.parseDuration('1y')).toEqual({ value: 1, unit: 'Day', time: DAY8 });
    expect(project.parseDuration('7M')).toEqual({ value: 7, unit: 'Minute', time: 420000 });
    expect(project.parseDuration('el 1d')).toBeNull();
    expect(project.parseDuration('e1d')).toBeNull();
    expect(project.parseDuration('xyz')).toBeNull();
  });
  it('formats with trial labels and decimal rounding', () => {
    const project = makeProject();
    expect(project.formatDuration(project.parseDuration('90m'))).toBe('90 mins');
    expect(project.formatDuration(project.parseDuration('1w'))).toBe('1 wk');
    expect(project.formatDuration(project.parseDuration('0.5h'))).toBe('0.5 hrs');
    expect(project.formatDuration(project.parseDuration('1.25d'))).toBe('1.25 days');
    const rounded = project.parseDuration({ time: 1000000 });
    expect(project.formatDuration(rounded)).toBe('0.035 days');
  });
});

/**
 * Behaviour of `Project.taskStyleRules` and of a bare `TaskbarStyleRule`, taken from the
 * side-by-side comparison run `.probe/gantt-comp-r12.json` (cases `coll:*` and `rule:*`): both
 * libraries were handed the same public-API script and produced the same strings.
 */
describe('style rule collection semantics (trial comparison r12)', () => {
  const fresh = () => new Project('C').taskStyleRules;

  it('looks rules up by name only and returns null for every other key', () => {
    const rules = fresh();
    for (const key of ['nope', '', 'Task', null, undefined, 0, true])
      expect(rules.getRule(key as unknown as string)).toBeNull();
    expect(rules.getRule('task')!.name).toBe('task');
    expect(rules.getRule('projectSummary')!.name).toBe('projectSummary');
  });
  it('returns the very objects the collection holds', () => {
    const rules = fresh();
    rules.all().forEach((rule, index) => {
      expect(rules.getRule(rule.name)).toBe(rule);
      expect(rules.getItemAt(index)).toBe(rule);
      expect(rule.typeName).toBeUndefined();
    });
  });
  it('appends added rules, keeps duplicates and finds the first rule of a repeated name', () => {
    const rules = fresh();
    const extra = new TaskbarStyleRule('Extra');
    rules.add(extra);
    expect(rules.length).toBe(16);
    rules.add(extra);
    expect(rules.all().slice(-2)).toEqual([extra, extra]);
    rules.add(new TaskbarStyleRule('task'));
    expect(rules.length).toBe(18);
    expect(rules.getRule('task')).toBe(rules.all()[0]);
    expect(rules.getRule('Extra')).toBe(extra);
    expect(extra.style).toBeUndefined();
    expect(extra.typeName).toBeUndefined();
  });
  it('accepts values that are not rules', () => {
    const rules = fresh();
    for (const value of [null, undefined, 'x', 1, {}, []])
      expect(rules.add(value as unknown as TaskbarStyleRule)).toBeUndefined();
    expect(rules.length).toBe(21);
  });
  it('inserts at the requested index, with the array splice reading of out-of-range indexes', () => {
    const rules = fresh();
    rules.insert(0, new TaskbarStyleRule('At0'));
    expect(rules.all().findIndex(rule => rule.name === 'At0')).toBe(0);
    rules.insert(-1, new TaskbarStyleRule('Neg'));
    expect(rules.all().findIndex(rule => rule.name === 'Neg')).toBe(15);
    rules.insert(999, new TaskbarStyleRule('Tail'));
    expect(rules.all().findIndex(rule => rule.name === 'Tail')).toBe(17);
    expect(rules.length).toBe(18);
    expect(rules.insert(2, null as unknown as TaskbarStyleRule)).toBeUndefined();
    expect(rules.getItemAt(2)).toBeNull();
    expect(rules.length).toBe(19);
  });
  it('reads items by index and yields undefined outside the collection', () => {
    const rules = fresh();
    expect(rules.getItemAt(0).name).toBe('task');
    expect(rules.getItemAt(14).name).toBe('manualProgress');
    for (const index of [999, -1, undefined, NaN])
      expect(rules.getItemAt(index as unknown as number)).toBeUndefined();
    expect(rules.getItemAt('1' as unknown as number).name).toBe('milestone');
  });
  it('reports -1 from getIndexByItem for anything that is not in the collection', () => {
    const rules = fresh();
    expect(rules.getIndexByItem(rules.all()[2])).toBe(2);
    for (const value of [new TaskbarStyleRule('Foreign'), null, 'task', undefined])
      expect(rules.getIndexByItem(value as unknown as TaskbarStyleRule)).toBe(-1);
  });
  it('removes by identity, and drops the last rule when the item is absent (trial quirk)', () => {
    const rules = fresh();
    rules.remove(rules.all()[0]);
    expect(rules.length).toBe(14);
    expect(rules.getItemAt(0).name).toBe('milestone');
    rules.remove(new TaskbarStyleRule('Foreign'));
    expect(rules.length).toBe(13);
    rules.remove(null as unknown as TaskbarStyleRule);
    expect(rules.length).toBe(12);
    expect(rules.getItemAt(11).name).toBe('finishOnlyMilestone');
  });
  it('removeAt ignores an index past the end and removes the last rule for -1', () => {
    const rules = fresh();
    rules.removeAt(0);
    expect(rules.length).toBe(14);
    rules.removeAt(999);
    expect(rules.length).toBe(14);
    rules.removeAt(-1);
    expect(rules.length).toBe(13);
    expect(rules.getItemAt(12).name).toBe('progress');
    expect(rules.getItemAt(13)).toBeUndefined();
  });
  it('setItemAt replaces in place and extends the collection with empty slots', () => {
    const rules = fresh();
    expect(rules.setItemAt(0, new TaskbarStyleRule('Replaced'))).toBeUndefined();
    expect(rules.getItemAt(0).name).toBe('Replaced');
    expect(rules.getRule('task')).toBeNull();
    expect(rules.setItemAt(999, new TaskbarStyleRule('Past'))).toBeUndefined();
    expect(rules.length).toBe(1000);
    expect(rules.getItemAt(999).name).toBe('Past');
    expect(rules.getItemAt(500)).toBeUndefined();
    expect(rules.setItemAt(-1, new TaskbarStyleRule('Negative'))).toBeUndefined();
    expect(rules.length).toBe(1000);
  });
  it('clear empties the collection and rules can be added again', () => {
    const rules = fresh();
    expect(rules.clear()).toBeUndefined();
    expect(rules.length).toBe(0);
    expect(rules.all()).toHaveLength(0);
    expect(rules.getRule('task')).toBeNull();
    rules.add(new TaskbarStyleRule('Added'));
    expect(rules.all().map(rule => rule.name)).toEqual(['Added']);
    expect(rules.length).toBe(1);
  });
  it('all() hands out the live internal array (trial quirk)', () => {
    const rules = fresh();
    const list = rules.all();
    list.push(new TaskbarStyleRule('Pushed'));
    expect(rules.length).toBe(16);
    expect(rules.all().slice(-1)[0].name).toBe('Pushed');
    expect(rules.all()).toBe(list);
  });
  it('mirrors the trial collection shape: numeric length, Array.from-able, not an array', () => {
    // Trial probe (TASK 54, `.probe/t54/probe-gantt-collection.json`, cases
    // `collection:surface` + `coll:shape`): the trial instance reports `length` as a number
    // (`collection.length()` THROWS there), `Array.isArray(c)` is false, there is no
    // `Symbol.iterator` (`[...c]` THROWS on the trial as well), but the instance mirrors its
    // items, so `Array.from(c)` yields all 15 rules. Our previous self-derived test expected
    // zero iterability; the trial measurement replaces it, recorded in docs/STATUS.md.
    const rules = fresh();
    expect(Array.isArray(rules)).toBe(false);
    expect(typeof (rules as unknown as { length: unknown }).length).toBe('number');
    expect(Symbol.iterator in rules).toBe(false);
    expect(Array.from(rules as unknown as ArrayLike<TaskbarStyleRule>)).toHaveLength(15);
    expect(() => [...(rules as unknown as Iterable<TaskbarStyleRule>)]).toThrow();
  });
});

describe('bare task bar style rules (trial comparison r12)', () => {
  it('exposes the trial base-class behaviour', () => {
    const project = makeProject(['2d']);
    const task = project.getTask(1);
    const rule = new TaskbarStyleRule('Base');
    expect(rule.toJSON()).toEqual({ name: 'Base' });
    expect(rule.match(task)).toBe(false);
    expect(rule.getFromDate(task)).toEqual(new Date(2025, 0, 6, 8));
    expect(rule.getToDate(task)).toEqual(new Date(2025, 0, 7, 17));
    rule.style = { taskbarStyle: { middleColor: '#123456' } };
    expect(rule.toJSON()).toEqual({ name: 'Base', style: { taskbarStyle: { middleColor: '#123456' } } });
    expect(rule.fromJSON({ name: 'Loaded', style: { taskbarStyle: { middleColor: '#654321' } } })).toBeUndefined();
    expect(rule.name).toBe('Base');
    expect(rule.toJSON()).toEqual({ name: 'Base', style: { taskbarStyle: { middleColor: '#654321' } } });
  });
  it('round-trips a custom rule through toJSON and fromJSON inside the collection', () => {
    const project = makeProject(['1d']);
    const rules = project.taskStyleRules;
    const custom = new TaskbarStyleRule('Custom');
    custom.style = { taskbarStyle: { middleColor: '#abcdef', middleShape: 'rectangleBar' } };
    rules.add(custom);
    expect(rules.getItemAt(rules.getIndexByItem(custom)).toJSON()).toEqual({
      name: 'Custom', style: { taskbarStyle: { middleColor: '#abcdef', middleShape: 'rectangleBar' } },
    });
    const copy = new TaskbarStyleRule('Copy');
    copy.fromJSON(custom.toJSON());
    expect(copy.toJSON()).toEqual({ name: 'Copy', style: { taskbarStyle: { middleColor: '#abcdef', middleShape: 'rectangleBar' } } });
    expect(rules.length).toBe(16);
  });
});
