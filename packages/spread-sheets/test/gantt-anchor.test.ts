import { describe, expect, it } from 'vitest';
import { Project, Task } from '../src/gantt/project';
import { TaskDependency } from '../src/gantt/dependency';
import type { Duration } from '../src/gantt/mapping';

/**
 * Scheduling behaviour transcribed from black-box runs of the 19.2.5 official trial
 * (.probe/gantt-probe2-1.json … gantt-probe8-1.json); only the public API was used.
 * All dates are local, the calendar is the built-in Standard work week (Mon-Fri, 8-12, 13-17)
 * and the project start is Monday Jan 6 2025 08:00 unless a case says otherwise.
 */

const DAY = 28800000;
const start = (month: number, day: number, hour = 8, minute = 0, second = 0) => new Date(2025, month - 1, day, hour, minute, second, 0);
const end = (month: number, day: number, hour = 17, minute = 0, second = 0) => new Date(2025, month - 1, day, hour, minute, second, 0);

type DurationValue = { value: number | undefined, unit: Duration['unit'], time: number | undefined } | null;
type Bar = [Date | null, Date | null, DurationValue];

const bar = (task: Task): Bar => {
  const duration = task.duration;
  return [task.start ?? null, task.finish ?? null,
    duration ? { value: duration.value, unit: duration.unit, time: duration.time } : null];
};
const days = (value: number): DurationValue => ({ value, unit: 'Day', time: value * DAY });
/** `row('S', 1, 6, 1, 7)` = the bar Jan 6 08:00 → Jan 7 17:00 with a two-day duration. */
const row = (label: string, from: Date | null, to: Date | null, duration: DurationValue | number = null): [string, Bar] =>
  [label, [from, to, typeof duration === 'number' ? days(duration) : duration]];

const lookup = (project: Project, label: string): Task => {
  if (label === 'root') return project.root;
  const task = project.getTask(Number(label));
  if (!task) throw new Error(`no task ${label}`);
  return task;
};
const expectRows = (project: Project, expected: [string, Bar][]) => {
  for (const [label, value] of expected) expect(bar(lookup(project, label))).toEqual(value);
};

/** `mk([2, 2], [2])`: durations in task order, then indent those task numbers. */
function mk(durations: (string | number)[], indent: number[] = [], name = 'P'): Project {
  const project = new Project(name);
  project.startDate = start(1, 6);
  project.addTasks(durations.map(duration => ({ duration: String(duration) })));
  if (indent.length) project.indentTasks(indent);
  return project;
}

describe('predecessor string grammar (trial probes 5, 4, 3, 2)', () => {
  // Probe 5 V1 wrote each string onto task 5 of a five-task project, so no entry names the task
  // itself and every referenced number exists.
  const accepted: [string, string][] = [
    ['1FS,2SS', '1,2SS'],
    ['1FS+1d,2SS', '1,2SS'],
    ['1FS+1,2SS', '1,2SS'],
    ['1FS+1d,2', '1,2'],
    ['1,2FS', '1,2'],
    ['1FS,2', '1,2'],
    ['1FS+1d,3SS+2d', '1,3SS'],
    ['1SS+1h,2FS', '1SS,2'],
    ['1FS,3FS,4SS', '1,3,4SS'],
    ['1FS+1d,2SS,3FF', '1,2SS,3FF'],
    ['1FS-1d,2SS', '1,2SS'],
    ['1FS+1x,2SS', '1,2SS'],
    ['1FS++1,2SS', '1,2SS'],
    ['1FS+ 1d,2SS', '1,2SS'],
    ['1FS+1d, 2SS', '1,2SS'],
    ['1FS+1d ,2SS', '1,2SS'],
    ['2FS,3SS', '2,3SS'],
    ['1FS,3FS', '1,3'],
  ];
  it.each(accepted)('accepts %q and reads back %q', (text, readBack) => {
    const project = mk([1, 1, 1, 1, 1]);
    project.getTask(5).predecessors = text;
    expect(project.getTask(5).predecessors).toBe(readBack);
    expect(project.dependencies).toHaveLength(text.split(',').length);
  });
  it.each([
    ['1FS,1FS', 'the same task twice'],
    ['1FS,1SS', 'the same task with two types'],
  ])('rejects %q naming one task twice (%s)', text => {
    const project = mk([1, 1, 1, 1, 1]);
    expect(() => { project.getTask(5).predecessors = text; }).toThrow('invalidDependency');
    expect(project.dependencies).toHaveLength(0);
  });
  // Probe 4 U5 used the same strings on task 2 of a three-task project: there, every entry that
  // names 2 (the task itself) or 4 (out of range) is rejected.
  it.each([
    '1FS,2SS', '1FS,2', '1,2FS', '1,2', '1FS+1,2SS', '1FS+1d,2SS', '1FS+1d,2', '1FS+1,2',
    '1FS+1d,2SS+2d', '1SS+1h,2FS', '1FS+ 1d,2SS', '1FS+1d, 2SS', '1FS+1d ,2SS', '1FS,2SS+1',
    '1FS,2SS+1h', '1FS-1d,2SS', '1FS+1.5d,2SS', '1FS++1,2SS', '1FS+1x,2SS', '2FS,3SS',
    '1FS,3FS,4SS', '1FS+1,2SS+1', '1FS+1d,2SS+1', '1FS+1,2SS+1d', '1FS+1d,2SS+1,3FF', '1FS+1d,2SS,3FF',
  ])('rejects %q naming itself or an unknown task', text => {
    const project = mk([1, 1, 1]);
    expect(() => { project.getTask(2).predecessors = text; }).toThrow('invalidDependency');
  });
  it('accepts the one two-entry string that names no task twice there', () => {
    const project = mk([1, 1, 1]);
    project.getTask(2).predecessors = '1FS,3FS';
    expect(project.getTask(2).predecessors).toBe('1,3');
  });

  // Probe 2 S6 and probe 3 T3 spell single entries: whatever is glued behind the type is
  // accepted, a space in front of the sign is not.
  it('accepts every trial-accepted lag suffix and reads back only the type', () => {
    const plain = ['1FS+1 day', '1FS+1 d', '1FS+ d', '1FS+', '1FS- ', '1FS-1mon', '1FS+.5d', '1FS+2h30min',
      '1FS+a', '1FS+1d ', ' 1FS+1d', '1FS+1MON', '1FS+1D', '1FS+15min', '1FS+1week', '1FS+0d', '1FS+0',
      '1FS+1h1m', '1FS+1 days', '1FS+2 day', '1FS+2 days', '1FS+1 das', '1FS+1 dayx', '1FS+2day',
      '1FS+2 d', '1FS+30 mins', '1FS+2 wks', '1FS+2 w', '1FS+2 w x', '1FS+1day2', '1FS+1 d2 h',
      '1FS++ 1d', '1FS+-1d', '1FS-+1d'];
    plain.forEach(text => {
      const project = mk([1, 1]);
      expect(() => { project.getTask(2).predecessors = text; }).not.toThrow();
      expect(project.getTask(2).predecessors).toBe('1');
    });
    for (const [text, readBack] of [['1SS-2h', '1SS'], ['1FF+3d', '1FF'], ['1SF-1h', '1SF']] as const) {
      const project = mk([1, 1]);
      project.getTask(2).predecessors = text;
      expect(project.getTask(2).predecessors).toBe(readBack);
    }
  });
  it('rejects the trial-rejected lag suffixes', () => {
    for (const text of ['1FS +1', '1FS - 1d', '1FS 1 d', '1 FS+1d', '1FS,,2SS', '1FS + 1d', '1FS+1,2SS', '1FS+1d,2']) {
      const project = mk([1, 1]);
      expect(() => { project.getTask(2).predecessors = text; }).toThrow('invalidDependency');
    }
  });
  it('never applies a lag spelled in the string', () => {
    // Probe 5 V1 / probe 8: the read-back carries no lag and the schedule ignores it too.
    const project = mk([1, 1]);
    project.getTask(2).predecessors = '1FS+1d';
    project.resumeSchedule();
    expect(bar(project.getTask(2))).toEqual([start(1, 7), end(1, 7), days(1)]);
    expect(project.dependencies[0]!.lag).toBeUndefined();
  });
  it('rejects a second link between the same task pair, whatever its type', () => {
    // Probe 3 T9 and the comparison cases `dep:dupIdentical` and `dep:existingPairOtherType`:
    // the graph holds one link per task pair, and a rejected batch leaves nothing behind.
    const project = mk([1, 1]);
    expect(() => project.addDependency([
      { fromTaskNumber: 1, toTaskNumber: 2 },
      { fromTaskNumber: 1, toTaskNumber: 2, type: 'FS' },
    ])).toThrow('invalidDependency');
    expect(project.dependencies).toHaveLength(0);
    project.addDependency({ fromTaskNumber: 1, toTaskNumber: 2, type: 'SS' });
    expect(project.dependencies).toHaveLength(1);
    expect(project.getTask(2).predecessors).toBe('1SS');
    const other = mk([1, 1]);
    other.addDependency({ fromTaskNumber: 1, toTaskNumber: 2, type: 'FS' });
    expect(() => other.addDependency({ fromTaskNumber: 1, toTaskNumber: 2, type: 'SS' })).toThrow('invalidDependency');
    expect(other.dependencies).toHaveLength(1);
    expect(other.getTask(2).predecessors).toBe('1');
    expect(() => mk([1]).addDependency({ fromTaskNumber: 1, toTaskNumber: 999 })).toThrow('invalidDependency');
  });
  it('replaces the whole link set through the predecessor string', () => {
    // Comparison `dep:stringReplacesTypedLink`: the string setter drops the task's own links
    // first, so a type change through the string is accepted.
    const project = mk([1, 1]);
    project.addDependency({ fromTaskNumber: 1, toTaskNumber: 2, type: 'FS' });
    project.resumeSchedule();
    project.getTask(2).predecessors = '1SS';
    project.resumeSchedule();
    expect(project.dependencies).toHaveLength(1);
    expect(project.getTask(2).predecessors).toBe('1SS');
  });
  it('validates dependency objects against the project they are removed from', () => {
    // Comparison `dep:removeForeignDependency` (a link of another project is `invalidDependency`)
    // and `dep:removeMissingLink` (a link that is simply absent is ignored).
    const project = mk([1, 1]);
    const other = mk([1, 1]);
    other.addDependency({ fromTaskNumber: 1, toTaskNumber: 2 });
    expect(() => project.removeDependency(other.dependencies[0]!)).toThrow('invalidDependency');
    expect(project.dependencies).toHaveLength(0);
    project.removeDependency(new TaskDependency(project.getTask(1), project.getTask(2), 'FF'));
    expect(project.dependencies).toHaveLength(0);
  });
});

describe('summary anchors and the cascade to their children (trial probes 5, 3, 4, 6, 7, 8)', () => {
  const anchored = () => {
    const project = mk([2, 2, 2], [2, 3]);
    project.getTask(1).start = start(1, 20);
    return project;
  };
  it('anchors an automatic summary and re-derives its children from it', () => {
    expectRows(anchored(), [
      row('root', start(1, 20), end(1, 21), 2),
      row('1', start(1, 20), end(1, 21), 2),
      row('2', start(1, 20), end(1, 21), 2),
      row('3', start(1, 20), end(1, 21), 2),
    ]);
  });
  it('keeps the anchored summary at its own duration when a dependency pushes a child past it', () => {
    const project = anchored();
    project.addDependency({ fromTaskNumber: 2, toTaskNumber: 3, type: 'FS' });
    expectRows(project, [
      row('root', start(1, 20), end(1, 23), 4),
      row('1', start(1, 20), end(1, 21), 2),
      row('2', start(1, 20), end(1, 21), 2),
      row('3', start(1, 22), end(1, 23), 2),
    ]);
  });
  it('releases an outdented child to the project start and stretches the project roll-up', () => {
    const project = anchored();
    project.outdentTasks(3);
    expectRows(project, [
      row('root', start(1, 6), end(1, 21), 12),
      row('1', start(1, 20), end(1, 21), 2),
      row('2', start(1, 20), end(1, 21), 2),
      row('3', start(1, 6), end(1, 7), 2),
    ]);
  });
  it('hangs a newly added child off the anchored summary', () => {
    const project = anchored();
    project.addTasks({ name: 'C', duration: '2d' }, 2);
    expectRows(project, [
      row('root', start(1, 20), end(1, 21), 2),
      row('1', start(1, 20), end(1, 21), 2),
      row('4', start(1, 20), end(1, 21), 2),
    ]);
  });
  it('re-derives a child whose start was cleared at one day inside the anchor', () => {
    const project = anchored();
    project.getTask(2).start = null;
    expectRows(project, [
      row('1', start(1, 20), end(1, 21), 2),
      row('2', start(1, 20), end(1, 20), 1),
      row('3', start(1, 20), end(1, 21), 2),
    ]);
  });
  it('leaves a completion edit alone', () => {
    const project = anchored();
    project.getTask(2).complete = 0.5;
    expectRows(project, [
      row('root', start(1, 20), end(1, 21), 2),
      row('2', start(1, 20), end(1, 21), 2),
    ]);
  });
  it('lets a later project start leave the anchored layout alone', () => {
    // Probe 3 T1 / probe 5 V3: startDate moves past the anchor, nothing moves.
    const project = anchored();
    project.startDate = start(1, 27);
    expectRows(project, [
      row('root', start(1, 20), end(1, 21), 2),
      row('1', start(1, 20), end(1, 21), 2),
      row('2', start(1, 20), end(1, 21), 2),
      row('3', start(1, 20), end(1, 21), 2),
    ]);
  });
  it('keeps a chained layout inside an anchored summary', () => {
    // Probe 5 V9: S with A(2d) finish-to-start B(1d).
    const project = mk([1, 2, 1], [2, 3]);
    project.addDependency({ fromTaskNumber: 2, toTaskNumber: 3, type: 'FS' });
    expectRows(project, [
      row('root', start(1, 6), end(1, 8), 3),
      row('1', start(1, 6), end(1, 8), 3),
      row('2', start(1, 6), end(1, 7), 2),
      row('3', start(1, 8), end(1, 8), 1),
    ]);
    project.getTask(1).start = start(1, 20);
    expectRows(project, [
      row('root', start(1, 20), end(1, 22), 3),
      row('1', start(1, 20), end(1, 22), 3),
      row('2', start(1, 20), end(1, 21), 2),
      row('3', start(1, 22), end(1, 22), 1),
    ]);
  });
  it('lets a predecessor string anchor a summary and moves its children with it', () => {
    // Probe 5 V10: X(3d), S(1d) with A(1d) and B(2d) below S.
    const project = mk([3, 1, 1, 2], [3, 4]);
    project.getTask(2).predecessors = '1FS';
    expectRows(project, [
      row('root', start(1, 6), end(1, 8), 3),
      row('1', start(1, 6), end(1, 8), 3),
      row('2', start(1, 6), end(1, 7), 2),
    ]);
    project.resumeSchedule();
    expectRows(project, [
      row('root', start(1, 6), end(1, 10), 5),
      row('1', start(1, 6), end(1, 8), 3),
      row('2', start(1, 9), end(1, 10), 2),
      row('3', start(1, 9), end(1, 9), 1),
      row('4', start(1, 9), end(1, 10), 2),
    ]);
  });
  it('anchors a summary through a dependency and re-derives its children', () => {
    // Probe 5 V4: S(2d) with A(2d) and B(2d), plus X(2d) linked into S.
    const project = mk([2, 2, 2, 2], [2, 3]);
    expectRows(project, [
      row('root', start(1, 6), end(1, 7), 2),
      row('1', start(1, 6), end(1, 7), 2),
      row('4', start(1, 6), end(1, 7), 2),
    ]);
    project.addDependency({ fromTaskNumber: 4, toTaskNumber: 1, type: 'FS' });
    expectRows(project, [
      row('root', start(1, 6), end(1, 9), 4),
      row('1', start(1, 8), end(1, 9), 2),
      row('2', start(1, 8), end(1, 9), 2),
      row('3', start(1, 8), end(1, 9), 2),
      row('4', start(1, 6), end(1, 7), 2),
    ]);
    expect(project.dependencies).toHaveLength(1);
    // Probe 5 V4b: the same kind of link onto an anchored summary does not pull it back, and the
    // predecessor outside the summary keeps its own derived place.
    const anchoredProject = new Project('V4b');
    anchoredProject.startDate = start(1, 6);
    anchoredProject.addTasks([{ name: 'S', duration: '2d' }, { name: 'A', duration: '2d' }, { name: 'X', duration: '2d' }]);
    anchoredProject.indentTasks([2]);
    anchoredProject.getTask(1).start = start(1, 20);
    expectRows(anchoredProject, [
      row('root', start(1, 6), end(1, 21), 12),
      row('1', start(1, 20), end(1, 21), 2),
      row('2', start(1, 20), end(1, 21), 2),
      row('3', start(1, 6), end(1, 7), 2),
    ]);
    anchoredProject.addDependency({ fromTaskNumber: 3, toTaskNumber: 1, type: 'FS' });
    expectRows(anchoredProject, [
      row('root', start(1, 6), end(1, 21), 12),
      row('1', start(1, 20), end(1, 21), 2),
      row('2', start(1, 20), end(1, 21), 2),
      row('3', start(1, 6), end(1, 7), 2),
    ]);
  });
  it('re-derives children from the working slot of a summary anchored on a weekend', () => {
    // Probe 8 P1, P2, P3, P4: summary 1d carrying 3 days, children 1d and 3d.
    const build = () => {
      const project = new Project('Q');
      project.startDate = start(1, 6);
      project.addTasks([{ name: 'S', duration: '1d' }, { name: 'A', duration: '1d' }, { name: 'B', duration: '3d' }]);
      project.indentTasks([2, 3]);
      return project;
    };
    expectRows((() => { const p = build(); p.getTask(1).start = start(1, 11); return p; })(), [
      row('root', start(1, 11), end(1, 15), 3),
      row('1', start(1, 11), end(1, 14), 3),
      row('2', start(1, 13), end(1, 13), 1),
      row('3', start(1, 13), end(1, 15), 3),
    ]);
    const sunday = build();
    sunday.getTask(1).start = start(1, 12);
    expectRows(sunday, [
      row('1', start(1, 12), end(1, 14), 3),
      row('2', start(1, 13), end(1, 13), 1),
      row('3', start(1, 13), end(1, 15), 3),
    ]);
    // A chained pair inside the weekend anchor follows the slot one step further.
    const chained = build();
    chained.addDependency({ fromTaskNumber: 2, toTaskNumber: 3, type: 'FS' });
    chained.getTask(1).start = start(1, 11);
    expectRows(chained, [
      row('root', start(1, 11), end(1, 16), 4),
      row('1', start(1, 11), end(1, 15), 4),
      row('2', start(1, 13), end(1, 13), 1),
      row('3', start(1, 14), end(1, 16), 3),
    ]);
    const three = new Project('R');
    three.startDate = start(1, 6);
    three.addTasks([{ name: 'S', duration: '1d' }, { name: 'A', duration: '1d' }, { name: 'B', duration: '1d' }, { name: 'C', duration: '1d' }]);
    three.indentTasks([2, 3, 4]);
    three.getTask(1).start = start(1, 11);
    expectRows(three, [
      row('1', start(1, 11), end(1, 11), 1),
      row('2', start(1, 13), end(1, 13), 1),
      row('3', start(1, 13), end(1, 13), 1),
      row('4', start(1, 13), end(1, 13), 1),
    ]);
  });
  it('keeps the mid-day time of an anchored start through the children', () => {
    // Probe 8 P1 at 15:00 and 14:00 on working days.
    const project = mk([1, 1, 3], [2, 3]);
    project.getTask(1).start = start(1, 10, 15);
    expectRows(project, [
      row('root', start(1, 10, 15), end(1, 15, 15), 3),
      row('1', start(1, 10, 15), end(1, 15, 15), 3),
      row('2', start(1, 10, 15), end(1, 13, 15), 1),
      row('3', start(1, 10, 15), end(1, 15, 15), 3),
    ]);
    const noon = mk([1, 1, 3], [2, 3]);
    noon.getTask(1).start = start(1, 13, 14);
    expectRows(noon, [
      row('1', start(1, 13, 14), end(1, 16, 14), 3),
      row('2', start(1, 13, 14), end(1, 14, 14), 1),
      row('3', start(1, 13, 14), end(1, 16, 14), 3),
    ]);
  });
  it('ignores a start assignment on an automatic leaf task', () => {
    // Probe 4 U2 and probe 7 Q: leaf starts stay derived, before or after a dependency.
    const project = mk([1, 1]);
    project.getTask(2).start = start(1, 10);
    expectRows(project, [
      row('root', start(1, 6), end(1, 6), 1),
      row('1', start(1, 6), end(1, 6), 1),
      row('2', start(1, 6), end(1, 6), 1),
    ]);
    project.addDependency({ fromTaskNumber: 1, toTaskNumber: 2, type: 'FS' });
    expectRows(project, [
      row('root', start(1, 6), end(1, 7), 2),
      row('2', start(1, 7), end(1, 7), 1),
    ]);
    const inside = mk([1, 1, 2], [2, 3]);
    inside.getTask(2).start = start(1, 20);
    expect(bar(inside.getTask(2))).toEqual([start(1, 6), end(1, 6), days(1)]);
  });
  it('ignores start and finish assignments on the project root', () => {
    // Probe 4 U4 and probe 8 P8.
    const project = mk([1, 1]);
    project.root.start = start(1, 20);
    expectRows(project, [
      row('root', start(1, 6), end(1, 6), 1),
      row('1', start(1, 6), end(1, 6), 1),
      row('2', start(1, 6), end(1, 6), 1),
    ]);
    const other = mk([1, 1]);
    other.root.finish = end(1, 20);
    expect(other.finishDate).toEqual(end(1, 6));
    const anchoredProject = mk([1, 1, 3], [2, 3]);
    anchoredProject.getTask(1).start = start(1, 13);
    anchoredProject.root.start = start(1, 20);
    expectRows(anchoredProject, [
      row('root', start(1, 13), end(1, 15), 3),
      row('1', start(1, 13), end(1, 15), 3),
      row('2', start(1, 13), end(1, 13), 1),
      row('3', start(1, 13), end(1, 15), 3),
    ]);
  });
  it('re-derives the bar after a duration edit on the anchored summary', () => {
    // Probe 6 W4 and probe 8 P9.
    const project = mk([1, 1, 3], [2, 3]);
    project.getTask(1).start = start(1, 20);
    project.getTask(1).duration = '4d';
    expectRows(project, [
      row('root', start(1, 20), end(1, 23), 4),
      row('1', start(1, 20), end(1, 23), 4),
      row('2', start(1, 20), end(1, 20), 1),
      row('3', start(1, 20), end(1, 22), 3),
    ]);
  });
  it('takes a finish pin on the anchored summary as the bar end', () => {
    // Probe 8 P9.
    const project = mk([1, 1, 3], [2, 3]);
    project.getTask(1).start = start(1, 20);
    project.getTask(1).finish = end(1, 24);
    expectRows(project, [
      row('1', start(1, 20), end(1, 24), 5),
      row('root', start(1, 20), end(1, 24), 5),
    ]);
  });
  it('keeps a child edit at the anchored start and leaves the anchored bar alone', () => {
    // Probe 8 P5: the child keeps the anchor, the summary keeps its duration.
    const project = mk([1, 1, 3], [2, 3]);
    project.getTask(1).start = start(1, 20);
    project.getTask(2)!.duration = '2d';
    expectRows(project, [
      row('1', start(1, 20), end(1, 22), 3),
      row('2', start(1, 20), end(1, 21), 2),
      row('3', start(1, 20), end(1, 22), 3),
    ]);
    project.getTask(3)!.start = start(1, 6);
    expect(bar(project.getTask(3))).toEqual([start(1, 20), end(1, 22), days(3)]);
  });
  it('leaves a manual child of a cascaded summary where it was', () => {
    // Probe 4 U1 and probe 8 P7 with the same result.
    const project = new Project('U1');
    project.startDate = start(1, 6);
    project.addTasks([
      { name: 'S', duration: '1d' },
      { name: 'A', duration: '2d' },
      { name: 'B', mode: 'Manual', start: start(1, 10), duration: '1d' },
    ]);
    project.indentTasks([2, 3]);
    expectRows(project, [
      row('root', start(1, 6), end(1, 10), 5),
      row('1', start(1, 6), end(1, 10), 5),
      row('2', start(1, 6), end(1, 7), 2),
      row('3', start(1, 10), end(1, 10), 1),
    ]);
    project.getTask(1).start = start(1, 20);
    expectRows(project, [
      row('root', start(1, 10), end(1, 24), 11),
      row('1', start(1, 20), end(1, 24), 5),
      row('2', start(1, 20), end(1, 21), 2),
      row('3', start(1, 10), end(1, 10), 1),
    ]);
  });
  it('cascades a manual summary too and keeps its own bar', () => {
    // Probe 3 T6.
    const project = mk([2, 2, 2], [2, 3]);
    project.getTask(1).mode = 'Manual';
    project.getTask(1).start = start(1, 20);
    expectRows(project, [
      row('root', start(1, 20), end(1, 21), 2),
      row('1', start(1, 20), end(1, 21), 2),
      row('2', start(1, 20), end(1, 21), 2),
      row('3', start(1, 20), end(1, 21), 2),
    ]);
  });
  it('anchors the children of a manual summary built from data', () => {
    // Probe 7 X1.
    const project = new Project('X1');
    project.startDate = start(1, 6);
    project.addTasks([
      { name: 'S', mode: 'Manual', start: start(1, 10), duration: '3d' },
      { name: 'A', duration: '1d' },
      { name: 'B', duration: '1d' },
    ]);
    project.indentTasks([2, 3]);
    expectRows(project, [
      row('root', start(1, 10), end(1, 14), 3),
      row('1', start(1, 10), end(1, 14), 3),
      row('2', start(1, 10), end(1, 10), 1),
      row('3', start(1, 10), end(1, 10), 1),
    ]);
  });
  it('pulls a task indented under an anchored summary to that anchor', () => {
    // Probe 7 X5.
    const project = mk([2, 2, 2], [2]);
    project.getTask(1).start = start(1, 20);
    expectRows(project, [
      row('root', start(1, 6), end(1, 21), 12),
      row('1', start(1, 20), end(1, 21), 2),
      row('2', start(1, 20), end(1, 21), 2),
      row('3', start(1, 6), end(1, 7), 2),
    ]);
    project.indentTasks(3);
    expectRows(project, [
      row('root', start(1, 20), end(1, 21), 2),
      row('1', start(1, 20), end(1, 21), 2),
      row('2', start(1, 20), end(1, 21), 2),
      row('3', start(1, 20), end(1, 21), 2),
    ]);
  });
  it('keeps a manual child outside the cascaded bar but inside the project roll-up', () => {
    // Probe 7 X6.
    const project = new Project('X6');
    project.startDate = start(1, 6);
    project.addTasks([
      { name: 'S', duration: '1d' },
      { name: 'M', mode: 'Manual', start: start(1, 8), duration: '1d' },
      { name: 'A', duration: '1d' },
    ]);
    project.indentTasks([2, 3]);
    expectRows(project, [
      row('root', start(1, 6), end(1, 8), 3),
      row('1', start(1, 6), end(1, 8), 3),
      row('2', start(1, 8), end(1, 8), 1),
      row('3', start(1, 6), end(1, 6), 1),
    ]);
    project.getTask(1).start = start(1, 20);
    expectRows(project, [
      row('root', start(1, 8), end(1, 22), 11),
      row('1', start(1, 20), end(1, 22), 3),
      row('2', start(1, 8), end(1, 8), 1),
      row('3', start(1, 20), end(1, 20), 1),
    ]);
  });
  it('drops the anchors of a removed summary together with its children', () => {
    // Probe 7 X7.
    const project = mk([2, 2, 1], [2]);
    project.getTask(1).start = start(1, 20);
    expectRows(project, [
      row('root', start(1, 6), end(1, 21), 12),
      row('1', start(1, 20), end(1, 21), 2),
      row('2', start(1, 20), end(1, 21), 2),
      row('3', start(1, 6), end(1, 6), 1),
    ]);
    project.removeTasks(1);
    expect(project.count).toBe(2);
    expectRows(project, [
      row('root', start(1, 6), end(1, 6), 1),
      row('1', start(1, 6), end(1, 6), 1),
    ]);
  });
  it('derives a finish-only anchor back to the baseline it inherited', () => {
    // Probe 4 U3 and probe 6 W2 (before clearing).
    const project = mk([2, 2], [2]);
    project.getTask(1).finish = end(1, 20);
    expectRows(project, [
      row('root', start(1, 6), end(1, 20), 11),
      row('1', start(1, 6), end(1, 20), 11),
      row('2', start(1, 6), end(1, 7), 2),
    ]);
    project.getTask(2).duration = '1d';
    expectRows(project, [
      row('root', start(1, 6), end(1, 20), 11),
      row('1', start(1, 6), end(1, 20), 11),
      row('2', start(1, 6), end(1, 6), 1),
    ]);
    const manual = mk([1, 2, 2], [2, 3]);
    manual.getTask(1).mode = 'Manual';
    manual.getTask(1).finish = end(1, 20);
    expectRows(manual, [
      row('1', start(1, 6), end(1, 20), 11),
      row('2', start(1, 6), end(1, 7), 2),
      row('3', start(1, 6), end(1, 7), 2),
    ]);
  });
  it('keeps a finish anchor when a start anchor is added on the same day', () => {
    // Probe 7 X8 and probe 8 P10.
    const project = mk([2, 2], [2]);
    project.getTask(1).finish = end(1, 20);
    project.getTask(1).start = start(1, 6);
    expectRows(project, [
      row('root', start(1, 6), end(1, 20), 11),
      row('1', start(1, 6), end(1, 20), 11),
      row('2', start(1, 6), end(1, 7), 2),
    ]);
  });
  it('anchors a summary mid-month and shortens a cleared milestone child in place', () => {
    // Probe 4 U3b: start Jan 13, then the child start is cleared and set to zero duration.
    const project = mk([2, 2], [2]);
    project.getTask(1).start = start(1, 13);
    expectRows(project, [
      row('root', start(1, 13), end(1, 14), 2),
      row('1', start(1, 13), end(1, 14), 2),
      row('2', start(1, 13), end(1, 14), 2),
    ]);
    project.getTask(2).start = null;
    project.getTask(2).duration = '0d';
    expectRows(project, [
      row('root', start(1, 13), end(1, 14), 2),
      row('1', start(1, 13), end(1, 14), 2),
      row('2', start(1, 13), start(1, 13), 0),
    ]);
  });
  it('ignores a predecessor constraint that lands earlier than the anchor', () => {
    // Probe 6 W3.
    const project = new Project('W3');
    project.startDate = start(1, 6);
    project.addTasks([{ name: 'S', duration: '2d' }, { name: 'A', duration: '2d' }, { name: 'B', duration: '2d' }, { name: 'X', duration: '1d' }]);
    project.indentTasks([2, 3]);
    project.getTask(1).start = start(1, 13);
    expectRows(project, [
      row('root', start(1, 6), end(1, 14), 7),
      row('1', start(1, 13), end(1, 14), 2),
      row('2', start(1, 13), end(1, 14), 2),
      row('3', start(1, 13), end(1, 14), 2),
      row('4', start(1, 6), end(1, 6), 1),
    ]);
    project.addDependency({ fromTaskNumber: 4, toTaskNumber: 1, type: 'FS' });
    expectRows(project, [
      row('root', start(1, 6), end(1, 14), 7),
      row('1', start(1, 13), end(1, 14), 2),
      row('2', start(1, 13), end(1, 14), 2),
      row('3', start(1, 13), end(1, 14), 2),
      row('4', start(1, 6), end(1, 6), 1),
    ]);
  });
  it('cascades through a nested summary two levels down', () => {
    // Probe 7 X4.
    const project = new Project('X4');
    project.startDate = start(1, 6);
    project.addTasks([{ name: 'S1', duration: '1d' }, { name: 'S2', duration: '1d' }, { name: 'A', duration: '2d' }, { name: 'B', duration: '2d' }]);
    project.indentTasks(2);
    project.indentTasks([3, 4]);
    expectRows(project, [
      row('root', start(1, 6), end(1, 7), 2),
      row('1', start(1, 6), end(1, 7), 2),
      row('2', start(1, 6), end(1, 6), 1),
      row('3', start(1, 6), end(1, 7), 2),
      row('4', start(1, 6), end(1, 7), 2),
    ]);
    project.getTask(1).start = start(1, 20);
    expectRows(project, [
      row('root', start(1, 20), end(1, 21), 2),
      row('1', start(1, 20), end(1, 21), 2),
      row('2', start(1, 20), end(1, 20), 1),
      row('3', start(1, 20), end(1, 21), 2),
      row('4', start(1, 20), end(1, 21), 2),
    ]);
  });
  it('rolls a summary up over its children and re-derives it after a child edit', () => {
    // Probe 8 P11: a weekend project start snaps the whole layout to Monday.
    const project = mk([1, 1, 3], [2, 3]);
    project.startDate = start(1, 11);
    expectRows(project, [
      row('root', start(1, 13), end(1, 15), 3),
      row('1', start(1, 13), end(1, 15), 3),
      row('2', start(1, 13), end(1, 13), 1),
      row('3', start(1, 13), end(1, 15), 3),
    ]);
  });
});

describe('cleared and one-sided dates (trial probes 6, 7, 2, 3, 5)', () => {
  const summarySetup = () => {
    const project = new Project('W');
    project.startDate = start(1, 6);
    project.addTasks([{ name: 'S', duration: '2d' }, { name: 'A', duration: '2d' }, { name: 'B', duration: '2d' }]);
    project.indentTasks([2, 3]);
    return project;
  };
  it('keeps a cleared summary start cleared and hangs the children on the kept finish day', () => {
    // Probe 6 W1.
    const project = summarySetup();
    project.getTask(1).start = null;
    expectRows(project, [
      row('root', start(1, 7), end(1, 8), 2),
      row('1', null, end(1, 7), null),
      row('2', start(1, 7), end(1, 8), 2),
      row('3', start(1, 7), end(1, 8), 2),
    ]);
  });
  it('re-anchors the children on the kept finish day after a cascade', () => {
    // Probe 5 V3 and probe 6 W5 (manual summary).
    const project = summarySetup();
    project.getTask(1).start = start(1, 20);
    project.getTask(1).start = null;
    expectRows(project, [
      row('root', start(1, 21), end(1, 22), 2),
      row('1', null, end(1, 21), null),
      row('2', start(1, 21), end(1, 22), 2),
      row('3', start(1, 21), end(1, 22), 2),
    ]);
    const manual = summarySetup();
    manual.getTask(1).mode = 'Manual';
    manual.getTask(1).start = start(1, 20);
    manual.getTask(1).start = null;
    expectRows(manual, [
      row('root', start(1, 21), end(1, 22), 2),
      row('1', null, end(1, 21), null),
      row('2', start(1, 21), end(1, 22), 2),
      row('3', start(1, 21), end(1, 22), 2),
    ]);
  });
  it('opens the bar of a cleared summary finish and leaves the children alone', () => {
    // Probe 6 W2.
    const project = summarySetup();
    project.getTask(1).finish = end(1, 20);
    project.getTask(1).finish = null;
    expectRows(project, [
      row('root', start(1, 6), end(1, 7), 2),
      row('1', start(1, 6), null, null),
      row('2', start(1, 6), end(1, 7), 2),
      row('3', start(1, 6), end(1, 7), 2),
    ]);
  });
  it('resets a cleared leaf start to one day and re-derives it from its predecessor', () => {
    // Probe 6 W10.
    const project = new Project('W10');
    project.startDate = start(1, 6);
    project.addTasks([{ name: 'A', duration: '3d' }, { name: 'B', duration: '2d' }]);
    project.addDependency({ fromTaskNumber: 1, toTaskNumber: 2, type: 'FS' });
    expectRows(project, [
      row('root', start(1, 6), end(1, 10), 5),
      row('1', start(1, 6), end(1, 8), 3),
      row('2', start(1, 9), end(1, 10), 2),
    ]);
    project.getTask(2).start = null;
    expectRows(project, [
      row('root', start(1, 6), end(1, 9), 4),
      row('1', start(1, 6), end(1, 8), 3),
      row('2', start(1, 9), end(1, 9), 1),
    ]);
  });
  it('keeps a cleared manual start and drops its duration', () => {
    // Probe 7 X2.
    const project = new Project('X2');
    project.startDate = start(1, 6);
    project.addTasks({ mode: 'Manual', start: start(1, 6), finish: end(1, 10) });
    expectRows(project, [row('1', start(1, 6), end(1, 10), 5)]);
    project.getTask(1).start = null;
    expect(bar(project.getTask(1))).toEqual([null, end(1, 10), null]);
    expect(project.getTask(1).startDisplayed).toEqual(start(1, 10));
    expect(project.getTask(1).finishDisplayed).toEqual(end(1, 10));
  });
  it('completes the missing edge of a manual task from the two it stores', () => {
    // Probe 2 S2.
    const project = new Project('M');
    project.startDate = start(1, 6);
    project.addTasks([
      { name: 'StartOnly', mode: 'Manual', start: start(1, 8) },
      { name: 'FinishOnly', mode: 'Manual', finish: end(1, 8) },
      { name: 'DurOnly', mode: 'Manual', duration: '2d' },
      { name: 'StartDur', mode: 'Manual', start: start(1, 8), duration: '2d' },
      { name: 'FinishDur', mode: 'Manual', finish: end(1, 10), duration: '2d' },
      { name: 'AutoFinish', finish: end(1, 10) },
      { name: 'AutoDurNull', duration: '1d' },
    ]);
    const at = (taskNumber: number) => project.getTask(taskNumber);
    expect(bar(at(1))).toEqual([start(1, 8), null, null]);
    expect(bar(at(2))).toEqual([null, end(1, 8), null]);
    expect(bar(at(3))).toEqual([null, null, days(2)]);
    expect(bar(at(4))).toEqual([start(1, 8), end(1, 9), days(2)]);
    expect(bar(at(5))).toEqual([start(1, 9), end(1, 10), days(2)]);
    expect(bar(at(6))).toEqual([start(1, 6), end(1, 6), days(1)]);
    expect(bar(at(7))).toEqual([start(1, 6), end(1, 6), days(1)]);
    expect(at(1)!.startDisplayed).toEqual(start(1, 8));
    expect(at(1)!.finishDisplayed).toEqual(end(1, 8));
    expect(at(2)!.startDisplayed).toEqual(start(1, 8));
    expect(at(3)!.startDisplayed).toEqual(start(1, 6));
    expect(at(3)!.finishDisplayed).toEqual(end(1, 7));
    expect(at(1)!.isMilestone).toBeUndefined();
    expect(at(3)!.isMilestone).toBe(false);
    // DurOnly.finish = set, then DurOnly.duration = null.
    at(3).finish = end(1, 12);
    expect(bar(at(3))).toEqual([start(1, 10), end(1, 12), days(2)]);
    at(3).duration = null;
    expect(bar(at(3))).toEqual([start(1, 10), null, null]);
    expect(at(3).finishDisplayed).toEqual(end(1, 10));
    at(5).duration = null;
    expect(bar(at(5))).toEqual([start(1, 9), null, null]);
    expect(at(5).startDisplayed).toEqual(start(1, 9));
    expect(at(5).finishDisplayed).toEqual(end(1, 9));
  });
  it('back-computes a manual start over a non-working finish day', () => {
    // Probe 3 T2, transcribed exactly: task 1 is an automatic one-day task, task 2 is manual with
    // a finish and a duration, task 3 manual with a finish only, task 4 manual with a duration only.
    const project = new Project('T');
    project.startDate = start(1, 6);
    project.addTasks({ duration: '1d' });
    project.addTasks({ mode: 'Manual', finish: end(1, 10), duration: '1d' });
    project.addTasks({ mode: 'Manual', finish: end(1, 12) });
    project.addTasks({ mode: 'Manual', duration: '1d' });
    expect(bar(project.getTask(2))).toEqual([start(1, 10), end(1, 10), days(1)]);
    expect(bar(project.getTask(3))).toEqual([null, end(1, 12), null]);
    expect(bar(project.getTask(4))).toEqual([null, null, days(1)]);
    expect(project.getTask(2).startDisplayed).toEqual(start(1, 10));
    expect(project.getTask(3).startDisplayed).toEqual(start(1, 12));
    expect(project.getTask(3).finishDisplayed).toEqual(end(1, 12));
    expect(project.getTask(4).startDisplayed).toEqual(start(1, 6));
    expect(project.getTask(4).finishDisplayed).toEqual(end(1, 6));
    expectRows(project, [row('root', start(1, 6), end(1, 12), 5)]);
    project.getTask(2).duration = null;
    expect(bar(project.getTask(2))).toEqual([start(1, 10), null, null]);
    expect(project.getTask(2).startDisplayed).toEqual(start(1, 10));
    expect(project.getTask(2).finishDisplayed).toEqual(end(1, 10));
    project.getTask(3).duration = '2d';
    expect(bar(project.getTask(3))).toEqual([start(1, 10), end(1, 12), days(2)]);
    project.getTask(3).duration = null;
    expect(bar(project.getTask(3))).toEqual([start(1, 10), null, null]);
    expect(project.getTask(3).startDisplayed).toEqual(start(1, 10));
    expect(project.getTask(3).finishDisplayed).toEqual(end(1, 10));
    project.getTask(4).duration = '2d';
    project.getTask(4).finish = end(1, 14);
    expect(bar(project.getTask(4))).toEqual([start(1, 13), end(1, 14), days(2)]);
    const noon = new Project('W8');
    noon.startDate = start(1, 6);
    noon.addTasks({ mode: 'Manual', finish: new Date(2025, 0, 13, 12, 0, 0, 0) });
    noon.getTask(1).duration = '2d';
    expect(bar(noon.getTask(1))).toEqual([start(1, 9, 13), new Date(2025, 0, 13, 12, 0, 0, 0), days(2)]);
  });
  it('re-derives a manual finish from a duration edit', () => {
    // Probe 5 V5.
    const project = new Project('V5');
    project.startDate = start(1, 6);
    project.addTasks({ mode: 'Manual', start: start(1, 6), finish: end(1, 10) });
    expectRows(project, [
      row('root', start(1, 6), end(1, 10), 5),
      row('1', start(1, 6), end(1, 10), 5),
    ]);
    project.getTask(1).duration = '2d';
    expectRows(project, [
      row('root', start(1, 6), end(1, 7), 2),
      row('1', start(1, 6), end(1, 7), 2),
    ]);
    const zero = new Project('V5b');
    zero.startDate = start(1, 6);
    zero.addTasks({ mode: 'Manual', start: start(1, 6), finish: end(1, 10) });
    zero.getTask(1).duration = '0d';
    expectRows(zero, [row('1', start(1, 6), start(1, 6), 0)]);
  });
  it('re-hangs children on the finish day of a manual summary with a cleared start', () => {
    // Probe 7 X3.
    const project = new Project('X3');
    project.startDate = start(1, 6);
    project.addTasks([{ name: 'S', duration: '2d' }, { name: 'A', duration: '2d' }]);
    project.indentTasks([2]);
    project.getTask(1).start = start(1, 20);
    project.getTask(1).start = null;
    expectRows(project, [
      row('root', start(1, 21), end(1, 22), 2),
      row('1', null, end(1, 21), null),
      row('2', start(1, 21), end(1, 22), 2),
    ]);
    project.addTasks({ name: 'B', duration: '1d' }, 2);
    expectRows(project, [row('3', start(1, 21), end(1, 21), 1)]);
  });
});

describe('sort validation and ordering (trial probes 5, 4, 6, 3, 2)', () => {
  it('accepts the trial sort fields and rejects derived or outline ones', () => {
    const allowed = ['name', 'start', 'finish', 'duration', 'mode', 'complete', 'taskNumber', 'isMilestone',
      'completeThrough', 'predecessors', 'successors', 'startDisplayed', 'finishDisplayed'];
    const rejected = ['level', 'rowIndex', 'isSummary', 'isNormal', 'style', 'parent', 'children', 'value', 'getValue'];
    allowed.forEach(field => {
      const project = new Project('S');
      project.startDate = start(1, 6);
      project.addTasks([{ name: 'b', duration: '1d' }, { name: 'a', duration: '2d' }]);
      expect(() => project.sort([field], [true])).not.toThrow();
    });
    rejected.forEach(field => {
      const project = new Project('S');
      project.startDate = start(1, 6);
      project.addTasks([{ name: 'b', duration: '1d' }]);
      expect(() => project.sort([field], [true])).toThrow('invalidField');
    });
    const tooLong = new Project('S');
    tooLong.startDate = start(1, 6);
    tooLong.addTasks([{ name: 'b', duration: '1d' }]);
    expect(() => tooLong.sort(['name'], [true, false])).toThrow('invalidOperation');
    expect(() => tooLong.sort(['nope'], [true])).toThrow('invalidField');
    expect(() => tooLong.sort(['name'], [], true)).toThrow('invalidOperation');
    expect(() => tooLong.sort(['name'], [true], false, true)).toThrow('invalidOperation');
    tooLong.sort(['name', 'duration'], [true, false]);
    expect(tooLong.sorted).toBe(true);
    expect(tooLong.tasksSorted.map(task => task?.name ?? 'S')).toEqual(['S', 'b']);
  });
  it('sorts dates chronologically with unset dates last, in both directions', () => {
    // Probe 6 W6.
    const project = new Project('W6');
    project.startDate = start(1, 6);
    project.addTasks([
      { name: 'late', mode: 'Manual', start: start(1, 20) },
      { name: 'early', mode: 'Manual', start: start(1, 6) },
      { name: 'nullStart', mode: 'Manual', finish: end(1, 8) },
      { name: 'dur3', duration: '3d' },
      { name: 'dur1', duration: '1d' },
    ]);
    project.sort(['start'], [true]);
    expect(project.tasksSorted.map(task => task?.name ?? 'root')).toEqual(['W6', 'early', 'dur3', 'dur1', 'late', 'nullStart']);
    project.sort(['start'], [false]);
    expect(project.tasksSorted.map(task => task?.name ?? 'root')).toEqual(['W6', 'nullStart', 'late', 'early', 'dur3', 'dur1']);
    const durations = new Project('W6b');
    durations.startDate = start(1, 6);
    durations.addTasks([{ name: 'dur3', duration: '3d' }, { name: 'dur1', duration: '1d' }, { name: 'dur10', duration: '10d' }]);
    durations.sort(['duration'], [true]);
    expect(durations.tasksSorted.map(task => task?.name ?? 'root')).toEqual(['W6b', 'dur1', 'dur3', 'dur10']);
    const completions = new Project('W6c');
    completions.startDate = start(1, 6);
    completions.addTasks([{ name: 'c3', complete: 0.3 }, { name: 'c1', complete: 0.1 }, { name: 'c2', complete: 0.2 }]);
    completions.sort(['complete'], [true]);
    expect(completions.tasksSorted.map(task => task?.name ?? 'root')).toEqual(['W6c', 'c1', 'c2', 'c3']);
    const numbers = new Project('W6d');
    numbers.startDate = start(1, 6);
    numbers.addTasks([{ name: 'n2', duration: '1d' }, { name: 'n10', duration: '1d' }, { name: 'n1', duration: '1d' }]);
    numbers.sort(['taskNumber'], [true]);
    expect(numbers.tasksSorted.map(task => task?.name ?? 'root')).toEqual(['W6d', 'n2', 'n10', 'n1']);
  });
  it('sorts every row, project summary included, when the structure is dropped', () => {
    // Probe 6 W7 and probe 3 T4 (keepStructure = false).
    const project = new Project('W7');
    project.startDate = start(1, 6);
    project.addTasks([{ name: 'b', duration: '1d' }, { name: 'a', duration: '1d' }]);
    project.sort(['name'], [true], false);
    expect([0, 1, 2].map(row => project.getTaskByRow(row)?.name ?? 'null')).toEqual(['a', 'b', 'W7']);
    project.sort(['name'], [true], true);
    expect(project.tasksSorted.map(task => task?.name ?? 'null')).toEqual(['W7', 'a', 'b']);
    const rich = new Project('T');
    rich.startDate = start(1, 6);
    rich.addTasks([{ name: 'zebra', duration: '1d' }, { name: 'yak', duration: '1d' }, { name: 'fox', duration: '1d' }, { name: 'ant', duration: '1d' }]);
    rich.indentTasks([2, 3]);
    rich.sort(['name'], [true], false);
    expect(rich.tasksSorted.map(task => `${task?.name}:${task?.taskNumber}:${task?.rowIndex}`))
      .toEqual(['ant:4:0', 'fox:3:1', 'T:0:2', 'yak:2:3', 'zebra:1:4']);
    expect(rich.getTask(1).name).toBe('zebra');
    rich.sort(['name'], [true], true);
    expect(rich.tasksSorted.map(task => `${task?.name}:${task?.taskNumber}:${task?.rowIndex}`))
      .toEqual(['T:0:0', 'ant:4:1', 'zebra:1:2', 'fox:3:3', 'yak:2:4']);
  });
  it('renumbers only together with the structure and leaves task numbers alone otherwise', () => {
    // Probe 3 T4 and probe 2 S4.
    const build = () => {
      const project = new Project('T');
      project.startDate = start(1, 6);
      project.addTasks([{ name: 'zebra', duration: '1d' }, { name: 'yak', duration: '1d' }, { name: 'fox', duration: '1d' }, { name: 'ant', duration: '1d' }]);
      project.indentTasks([2, 3]);
      return project;
    };
    const renumbered = build();
    renumbered.sort(['name'], [true], true, true);
    expect(renumbered.sorted).toBe(false);
    expect(renumbered.tasks.map(task => `${task.name}:${task.taskNumber}:${task.rowIndex}:${task.level}`))
      .toEqual(['T:0:0:0', 'ant:1:1:1', 'zebra:2:2:1', 'fox:3:3:2', 'yak:4:4:2']);
    const renumberedByDefault = build();
    renumberedByDefault.sort(['name'], undefined, undefined, true);
    expect(renumberedByDefault.sorted).toBe(false);
    expect(renumberedByDefault.tasks.map(task => `${task.name}:${task.taskNumber}:${task.rowIndex}`))
      .toEqual(['T:0:0', 'ant:1:1', 'zebra:2:2', 'fox:3:3', 'yak:4:4']);
    const rowsOnly = build();
    rowsOnly.sort(['name'], [true], true);
    expect(rowsOnly.sorted).toBe(true);
    expect(rowsOnly.tasks.map(task => `${task.name}:${task.taskNumber}`)).toEqual(['T:0', 'zebra:1', 'yak:2', 'fox:3', 'ant:4']);
    const descending = build();
    descending.sort(['name'], [false], true);
    expect(descending.tasksSorted.map(task => `${task?.name}:${task?.taskNumber}:${task?.rowIndex}:${task?.level}`))
      .toEqual(['T:0:0:0', 'zebra:1:1:1', 'yak:2:2:2', 'fox:3:3:2', 'ant:4:4:1']);
    const noFields = build();
    noFields.sort([]);
    expect(noFields.sorted).toBe(true);
    expect(noFields.tasksSorted.map(task => `${task?.name}:${task?.taskNumber}:${task?.rowIndex}:${task?.level}`))
      .toEqual(['T:0:0:0', 'zebra:1:1:1', 'yak:2:2:2', 'fox:3:3:2', 'ant:4:4:1']);
  });
});

describe('insert and remove level rules (trial probes 5, 2)', () => {
  it('validates the level against the row the task is inserted at', () => {
    // Probe 5 V6.
    const project = new Project('V6');
    project.startDate = start(1, 6);
    project.addTasks([{ name: 'A', duration: '1d' }, { name: 'B', duration: '1d' }]);
    expect(() => project.insertTasks(1, { name: 'I2' }, 2)).toThrow('invalidLevel');
    expect(() => project.insertTasks(2, { name: 'K3' }, 3)).toThrow('invalidLevel');
    expect(project.count).toBe(3);
    const added = project.insertTasks(2, { name: 'J2' }, 2);
    expect(`${added[0]!.name}:${added[0]!.level}`).toBe('J2:2');
    expect(project.tasks.map(task => `${task.name ?? 'root'}:${task.level}:${task.taskNumber}`))
      .toEqual(['V6:0:0', 'A:1:1', 'J2:2:2', 'B:1:3']);
  });
  it('defaults the level of an inserted task to the row it takes over', () => {
    // Probe 5 V6 (append keeps the last level, an insert takes over the row's level).
    const project = new Project('V6b');
    project.startDate = start(1, 6);
    project.addTasks([{ name: 'A', duration: '1d' }, { name: 'B', duration: '1d' }, { name: 'C', duration: '1d' }]);
    project.indentTasks([2, 3]);
    const appended = project.addTasks({ name: 'D' });
    expect(appended[0]!.level).toBe(2);
    expect(project.tasks.map(task => `${task.name ?? 'root'}:${task.level}`)).toEqual(['V6b:0', 'A:1', 'B:2', 'C:2', 'D:2']);
    const inserted = project.insertTasks(1, { name: 'E' });
    expect(inserted[0]!.level).toBe(1);
    expect(project.tasks.map(task => `${task.name ?? 'root'}:${task.level}:${task.taskNumber}`))
      .toEqual(['V6b:0:0', 'E:1:1', 'A:1:2', 'B:2:3', 'C:2:4', 'D:2:5']);
  });
  it('inserts at the last row as an append and rejects rows past it', () => {
    // Probe 2 S3.
    const project = mk([1, 1, 1], [2, 3]);
    expect(project.tasks.map(task => `${task.name ?? task.taskNumber}:${task.level}`)).toEqual(['P:0', '1:1', '2:2', '3:2']);
    expect(() => project.insertTasks(0, { name: 'I0' })).toThrow('invalidId');
    expect(() => project.insertTasks(99, { name: 'I99' })).toThrow('invalidId');
    expect(project.count).toBe(4);
    const tail = project.insertTasks(project.count, { name: 'IE' });
    expect(`${tail[0]!.name}:${tail[0]!.level}:${tail[0]!.taskNumber}`).toBe('IE:2:4');
    expect(project.count).toBe(5);
  });
  it('removes a summary with everything below it', () => {
    // Probe 2 S3.
    const project = mk([1, 1, 1], [2, 3]);
    project.removeTasks(1);
    expect(project.count).toBe(1);
    expect(project.tasks.map(task => `${task.name ?? 'root'}:${task.level}:${task.taskNumber}`)).toEqual(['P:0:0']);
    expect(project.dependencies).toHaveLength(0);
    expect(() => project.getTask(1)).toBeDefined();
  });
  it('removes a range and rejects a range past the last task', () => {
    // Probe 5 V8.
    const project = mk([1, 1, 1]);
    project.removeTasksByRange(3, 1);
    expect(project.count).toBe(3);
    expect(() => project.removeTasksByRange(3, 2)).toThrow('invalidId');
    const other = mk([1, 1]);
    other.removeTasks([1, 1]);
    expect(other.count).toBe(2);
    // Probe 5 V8: a numeric string names the task exactly like its number does (the d.ts types the
    // list as numbers, the trial still accepts the strings).
    other.removeTasks(['1'] as unknown as number[]);
    expect(other.count).toBe(1);
  });
  it('keeps an indent of a top-level task under its neighbour', () => {
    // Probe 2 S9.
    const project = mk([1, 1, 1, 1], [2, 3]);
    expect(project.tasks.map(task => task.level)).toEqual([0, 1, 2, 2, 1]);
    project.indentTasks(4);
    expect(project.tasks.map(task => task.level)).toEqual([0, 1, 2, 2, 2]);
    project.outdentTasks(2);
    expect(project.tasks.map(task => task.level)).toEqual([0, 1, 1, 2, 2]);
  });
});

describe('duration pins, leaf defaults and the suspended self-refresh (trial comparison .probe/gantt-comp-r6.json)', () => {
  it('pins a duration assigned through the setter on a summary', () => {
    const project = mk(['1d', '1d'], [2]);
    project.getTask(1).duration = '4d';
    expectRows(project, [
      row('root', start(1, 6), end(1, 9), 4),
      row('1', start(1, 6), end(1, 9), 4),
      row('2', start(1, 6), end(1, 6), 1),
    ]);
  });
  it('keeps the pinned length even when a child reaches further than the bar', () => {
    const project = mk(['1d', '3d'], [2]);
    project.getTask(1).duration = '1d';
    expectRows(project, [
      row('root', start(1, 6), end(1, 8), 3),
      row('1', start(1, 6), end(1, 6), 1),
      row('2', start(1, 6), end(1, 8), 3),
    ]);
  });
  it('does not pin a duration that only came from the task data', () => {
    expectRows(mk(['4d', '1d'], [2]), [
      row('root', start(1, 6), end(1, 6), 1),
      row('1', start(1, 6), end(1, 6), 1),
      row('2', start(1, 6), end(1, 6), 1),
    ]);
    expectRows(mk(['1d', '3d'], [2]), [
      row('root', start(1, 6), end(1, 8), 3),
      row('1', start(1, 6), end(1, 8), 3),
      row('2', start(1, 6), end(1, 8), 3),
    ]);
  });
  it('keeps a duration pin across later child edits', () => {
    const project = mk(['1d', '1d'], [2]);
    project.getTask(1).duration = '4d';
    project.getTask(2).duration = '2d';
    expectRows(project, [
      row('root', start(1, 6), end(1, 9), 4),
      row('1', start(1, 6), end(1, 9), 4),
      row('2', start(1, 6), end(1, 7), 2),
    ]);
    const other = mk(['1d', '1d'], [2]);
    other.getTask(1).duration = '4d';
    // An ignored leaf start edit (automatic leaves stay derived) leaves the pinned bar alone.
    other.getTask(2).start = start(1, 20);
    expectRows(other, [
      row('root', start(1, 6), end(1, 9), 4),
      row('1', start(1, 6), end(1, 9), 4),
      row('2', start(1, 6), end(1, 6), 1),
    ]);
  });
  it('leaves a summary with a cleared duration open-ended instead of rolling it up', () => {
    const project = mk(['1d', '3d'], [2]);
    project.getTask(1).duration = null;
    expectRows(project, [
      row('root', start(1, 6), end(1, 8), 3),
      row('1', start(1, 6), null, null),
      row('2', start(1, 6), end(1, 8), 3),
    ]);
  });
  it('gives an automatic leaf the default one-day length', () => {
    const project = mk(['2d', '1d']);
    project.getTask(2).duration = null;
    expect(bar(project.getTask(2))).toEqual([start(1, 6), end(1, 6), days(1)]);
    expect(project.getTask(2).isMilestone).toBe(false);
    expect(project.getTask(2).isNormal).toBe(true);
    expect(project.getTask(2).startDisplayed).toEqual(start(1, 6));
    expect(project.getTask(2).finishDisplayed).toEqual(end(1, 6));
    const cleared = mk(['2d', '1d']);
    cleared.getTask(1).finish = null;
    expectRows(cleared, [
      row('root', start(1, 6), end(1, 6), 1),
      row('1', start(1, 6), end(1, 6), 1),
      row('2', start(1, 6), end(1, 6), 1),
    ]);
  });
  it('stores a cleared leaf date raw while the schedule is suspended', () => {
    const project = mk(['2d', '2d']);
    project.addDependency({ fromTaskNumber: 1, toTaskNumber: 2, type: 'FS' });
    project.suspendSchedule();
    project.getTask(2).start = null;
    expect(bar(project.getTask(2))).toEqual([null, end(1, 9), null]);
    expect(bar(project.getTask(1))).toEqual([start(1, 6), end(1, 7), days(2)]);
    project.resumeSchedule();
    expect(bar(project.getTask(2))).toEqual([start(1, 8), end(1, 8), days(1)]);
    expect(bar(project.getTask(1))).toEqual([start(1, 6), end(1, 7), days(2)]);
    expect(bar(project.root)).toEqual([start(1, 6), end(1, 8), days(3)]);
  });
  it('refreshes the edited task itself while the schedule is suspended', () => {
    const project = mk(['1d', '1d'], [2]);
    project.suspendSchedule();
    project.getTask(1).duration = '4d';
    expect(bar(project.getTask(1))).toEqual([start(1, 6), end(1, 9), days(4)]);
    expect(bar(project.getTask(2))).toEqual([start(1, 6), end(1, 6), days(1)]);
    expect(bar(project.root)).toEqual([start(1, 6), end(1, 6), days(1)]);
    project.resumeSchedule();
    expect(bar(project.root)).toEqual([start(1, 6), end(1, 9), days(4)]);
    const anchored = mk(['1d', '1d'], [2]);
    anchored.suspendSchedule();
    anchored.getTask(1).start = start(1, 20);
    expect(bar(anchored.getTask(1))).toEqual([start(1, 20), end(1, 20), days(1)]);
    expect(bar(anchored.getTask(2))).toEqual([start(1, 6), end(1, 6), days(1)]);
    expect(bar(anchored.root)).toEqual([start(1, 6), end(1, 6), days(1)]);
    anchored.resumeSchedule();
    expectRows(anchored, [
      row('root', start(1, 20), end(1, 20), 1),
      row('1', start(1, 20), end(1, 20), 1),
      row('2', start(1, 20), end(1, 20), 1),
    ]);
  });
  it('still defers the propagation to successors while suspended (probe 2 S7)', () => {
    const project = mk(['1d', '1d']);
    project.suspendSchedule();
    project.suspendSchedule();
    project.getTask(1).duration = '3d';
    expect(bar(project.getTask(1))).toEqual([start(1, 6), end(1, 8), days(3)]);
    expect(bar(project.getTask(2))).toEqual([start(1, 6), end(1, 6), days(1)]);
    expect(bar(project.root)).toEqual([start(1, 6), end(1, 6), days(1)]);
    project.resumeSchedule();
    expect(bar(project.getTask(2))).toEqual([start(1, 6), end(1, 6), days(1)]);
    project.resumeSchedule();
    expect(bar(project.getTask(1))).toEqual([start(1, 6), end(1, 8), days(3)]);
  });
});
