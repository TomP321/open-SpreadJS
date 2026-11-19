import { describe, expect, it } from 'vitest';
import { Project } from '../src/gantt/project';

describe('Gantt independent task scheduling', () => {
  it('initializes project dates and sorting state', () => {
    const project = new Project('P');
    expect(project.statusDate).toBeNull();
    expect(project.sorted).toBe(false);
    expect(project.currentDate.getHours()).toBe(8);
    expect(project.currentDate.getMinutes()).toBe(0);
    // Trial-observed initial state of a fresh project (probe 1 `projectInit`, comparison
    // `project:freshDefaults`): the summary bar sits at the project start with a zero duration.
    expect(project.count).toBe(1);
    expect(project.tasks.length).toBe(1);
    expect(project.tasksSorted.length).toBe(1);
    expect(project.dependencies).toHaveLength(0);
    expect(project.root.name).toBe('P');
    expect(project.root.level).toBe(0);
    expect(project.root.taskNumber).toBe(0);
    expect(project.root.rowIndex).toBe(0);
    expect(project.root.parent).toBeUndefined();
    expect(project.root.mode).toBe('Auto');
    expect(project.root.isSummary).toBe(false);
    expect(project.root.isMilestone).toBe(true);
    expect(project.root.complete).toBe(0);
    expect(project.root.duration).toEqual({ value: 0, unit: 'Day', time: 0 });
    expect(project.root.start).toEqual(project.startDate);
    expect(project.root.finish).toEqual(project.startDate);
    expect(project.finishDate).toEqual(project.startDate);
    expect(project.root.startDisplayed).toEqual(project.startDate);
    expect(project.root.finishDisplayed).toEqual(project.startDate);
    expect(project.root.completeThrough).toEqual(project.startDate);
    expect(project.calendar.name).toBe('Standard');
    expect(project.calendar.customWorkWeeks).toHaveLength(0);
    expect(project.taskStyleRules.length).toBe(15);
  });
  it('schedules auto tasks from the project start and retains manual task dates', () => {
    const project = new Project('P');
    project.startDate = new Date(2025, 0, 6, 8);
    const [first, second, manual] = project.addTasks([
      { name: 'A', duration: '2d' }, { name: 'B', duration: '0d' },
      { name: 'M', mode: 'Manual', start: new Date(2025, 0, 8, 8), duration: '2d' },
    ]);
    expect(first!.start).toEqual(new Date(2025, 0, 6, 8));
    expect(first!.finish).toEqual(new Date(2025, 0, 7, 17));
    expect(second!.isMilestone).toBe(true);
    expect(manual!.finish).toEqual(new Date(2025, 0, 9, 17));
    expect(project.count).toBe(4);
    expect(project.root.duration).toEqual({ value: 4, unit: 'Day', time: 115200000 });
    first!.duration = '3d';
    expect(first!.finish).toEqual(new Date(2025, 0, 8, 17));
  });
  it('moves automatic starts to the next working interval', () => {
    const project = new Project('P');
    project.startDate = new Date(2025, 0, 4);
    const [task] = project.addTasks({ duration: '1d' });
    expect(task!.start).toEqual(new Date(2025, 0, 6, 8));
    expect(task!.finish).toEqual(new Date(2025, 0, 6, 17));
    project.startDate = new Date(2025, 0, 6, 12, 30);
    expect(task!.start).toEqual(new Date(2025, 0, 6, 13));
    expect(task!.finish).toEqual(new Date(2025, 0, 7, 12));
  });
});

it('reschedules a finish-to-start successor after editing its predecessor', () => {
  const project = new Project('Model');
  project.startDate = new Date(2025, 0, 6, 8);
  project.addTasks([{ duration: '1d' }, { duration: '1d' }]);
  project.getTask(2).predecessors = '1FS';
  project.getTask(1).duration = '3d';
  expect(project.getTask(2).start).toEqual(new Date(2025, 0, 9, 8));
  expect(project.getTask(2).finish).toEqual(new Date(2025, 0, 9, 17));
  expect(project.root.duration).toEqual({ value: 4, unit: 'Day', time: 115200000 });
});

it('rolls completion up by child duration after edits', () => {
  const project = new Project('test');
  project.startDate = new Date(2025, 0, 6, 8);
  project.addTasks([{ name: 'a', duration: '2d', complete: 50 },
    { name: 'b', duration: '1d', complete: 100 }, { name: 'c', duration: '1d' }]);
  project.indentTasks([2, 3]);
  expect(project.getTask(1).complete).toBe(50);
  project.getTask(2).complete = 25;
  expect(project.getTask(2).complete).toBe(1);
  expect(project.getTask(1).complete).toBe(0.5);
  project.getTask(2).duration = '3d';
  expect(project.root.complete).toBe(0.75);
});

it('weights nested summary completion by leaf work', () => {
  const project = new Project('Model');
  project.startDate = new Date(2025, 0, 6, 8);
  project.addTasks(4);
  project.indentTasks([2, 3]);
  project.getTask(2).complete = 1;
  project.getTask(2).duration = '3d';
  expect(project.getTask(1).complete).toBe(0.75);
  expect(project.root.complete).toBe(0.6);
});

it('uses the last task level when adding tasks unless a level is supplied', () => {
  const project = new Project('p');
  project.addTasks(3);
  project.indentTasks([2, 3]);
  project.addTasks(1);
  project.addTasks(1, 1);
  expect(project.tasks.map(task => task.level)).toEqual([0, 1, 2, 2, 2, 1]);
  expect(project.tasks.slice(1).map(task => task.parent?.taskNumber)).toEqual([0, 1, 1, 1, 0]);
});

it('allows a nonzero-duration task to be marked as a milestone', () => {
  const project = new Project('p');
  project.startDate = new Date(2025, 0, 6, 8);
  const [task] = project.addTasks({ duration: '2d' });
  task!.isMilestone = true;
  expect(task!.isMilestone).toBe(true);
  expect(task!.finish).toEqual(new Date(2025, 0, 7, 17));
});

it('rejects a dependency cycle and formats finish-to-start links without a suffix', () => {
  const project = new Project('p');
  project.startDate = new Date(2025, 0, 6, 8);
  project.addTasks(3);
  project.addDependency({ fromTaskNumber: 1, toTaskNumber: 2 });
  expect(project.getTask(1).successors).toBe('2');
  expect(project.getTask(2).predecessors).toBe('1');
  expect(() => project.addDependency({ fromTaskNumber: 2, toTaskNumber: 1 })).toThrow('invalidDependency');
  expect(project.dependencies).toHaveLength(1);
  expect(project.getTask(2).start).toEqual(new Date(2025, 0, 7, 8));
});

it.each([
  ['FS', new Date(2025, 0, 9, 8), new Date(2025, 0, 9, 17)],
  ['SS', new Date(2025, 0, 6, 8), new Date(2025, 0, 6, 17)],
  ['FF', new Date(2025, 0, 8, 8), new Date(2025, 0, 8, 17)],
  ['SF', new Date(2025, 0, 6, 8), new Date(2025, 0, 6, 17)],
] as const)('schedules a %s dependency added through the model API', (type, start, finish) => {
  const project = new Project('Q');
  project.startDate = new Date(2025, 0, 6, 8);
  project.addTasks([{ duration: '3d' }, { duration: '1d' }]);
  project.addDependency({ fromTaskNumber: 1, toTaskNumber: 2, type });
  expect(project.getTask(2).start).toEqual(start);
  expect(project.getTask(2).finish).toEqual(finish);
});

it('schedules a predecessor appearing later in the task list', () => {
  const project = new Project('Q');
  project.startDate = new Date(2025, 0, 6, 8);
  project.addTasks([{ duration: '1d' }, { duration: '2d' }, { duration: '3d' }]);
  project.addDependency({ fromTaskNumber: 3, toTaskNumber: 1, type: 'FS' });
  expect(project.getTask(1).start).toEqual(new Date(2025, 0, 9, 8));
  expect(project.root.finish).toEqual(new Date(2025, 0, 9, 17));
});

it('uses the latest constraint among mixed dependencies', () => {
  const project = new Project('Q');
  project.startDate = new Date(2025, 0, 6, 8);
  project.addTasks([{ duration: '3d' }, { duration: '1d' }, { duration: '1d' }, { duration: '1d' }]);
  project.addDependency([
    { fromTaskNumber: 1, toTaskNumber: 2, type: 'SS' },
    { fromTaskNumber: 2, toTaskNumber: 3, type: 'FF' },
    { fromTaskNumber: 3, toTaskNumber: 4, type: 'SF' },
    { fromTaskNumber: 1, toTaskNumber: 4, type: 'FS' },
  ]);
  expect(project.getTask(4).start).toEqual(new Date(2025, 0, 9, 8));
  expect(project.getTask(4).finish).toEqual(new Date(2025, 0, 9, 17));
});

it('resets the project summary when its last tasks are removed', () => {
  const project = new Project('R');
  project.startDate = new Date(2025, 0, 6, 8);
  project.addTasks([{ duration: '2d' }, { duration: '3d' }]);
  project.removeTasks([1, 2]);
  expect(project.count).toBe(1);
  expect(project.root.start).toEqual(new Date(2025, 0, 6, 8));
  expect(project.root.finish).toEqual(new Date(2025, 0, 6, 8));
  expect(project.root.duration).toEqual({ value: 0, unit: 'Day', time: 0 });
  expect(project.root.isSummary).toBe(false);
});

it('derives a manual task duration from its supplied start and finish', () => {
  const project = new Project('Probe');
  project.startDate = new Date(2025, 0, 6, 8);
  const [task] = project.addTasks({ mode: 'Manual', start: new Date(2025, 0, 6, 8), finish: new Date(2025, 0, 8, 17) });
  expect(task!.duration).toEqual({ value: 3, unit: 'Day', time: 86400000 });
  expect(task!.finish).toEqual(new Date(2025, 0, 8, 17));
});

it('clears rolled-up completion when all child durations become zero', () => {
  const project = new Project('Probe');
  project.startDate = new Date(2025, 0, 6, 8);
  project.addTasks(3);
  project.indentTasks([2, 3]);
  project.getTask(2).complete = 1;
  project.getTask(2).duration = '0d';
  project.getTask(3).duration = '0d';
  expect(project.tasks.map(task => task.complete)).toEqual([0, 0, 1, 0]);
});

it('recalculates dates and summaries when task dates are edited', () => {
  const project = new Project('p');
  project.startDate = new Date(2025, 0, 6, 8);
  project.addTasks(3);
  const task = project.getTask(2);
  task.start = new Date(2025, 0, 9, 17);
  expect(task.start).toEqual(new Date(2025, 0, 6, 8));
  task.finish = new Date(2025, 0, 9, 17);
  expect(task.duration).toEqual({ value: 4, unit: 'Day', time: 115200000 });
  expect(project.root.finish).toEqual(new Date(2025, 0, 9, 17));
  task.mode = 'Manual';
  task.duration = '1d';
  task.start = new Date(2025, 0, 9, 17);
  expect(task.finish).toEqual(new Date(2025, 0, 10, 17));
  expect(project.root.finish).toEqual(new Date(2025, 0, 10, 17));
});

it('recalculates a manual finish on duration edits and auto tasks on calendar replacement', async () => {
  const { Calendar, CustomWorkWeek } = await import('../src/gantt/calendar');
  const project = new Project('p');
  project.startDate = new Date(2025, 0, 6, 8);
  project.addTasks(3);
  const manual = project.getTask(2);
  manual.mode = 'Manual';
  manual.duration = '3d';
  expect(manual.finish).toEqual(new Date(2025, 0, 8, 17));
  expect(project.root.finish).toEqual(new Date(2025, 0, 8, 17));

  const other = new Project('p');
  other.startDate = new Date(2025, 0, 6, 8);
  other.addTasks(3);
  // Trial probe `.probe/t54/probe-t54-holiday.json` (case `mon_startEqFinish` /
  // `startOnHoliday`): a custom week whose `start` equals its `finish` covers NO day, so the
  // project keeps running on Jan 6. A range that really covers a day (`start <= Jan 6 < finish`,
  // case `mon_asStart` / `r06_08`) does push the task to the next working day.
  const calendar = Calendar.standard.copyTo('holiday');
  calendar.customWorkWeeks.push(new CustomWorkWeek(Array.from({ length: 7 }, () => []),
    new Date(2025, 0, 6), new Date(2025, 0, 6)));
  other.calendar = calendar;
  expect(other.getTask(1).start).toEqual(new Date(2025, 0, 6, 8));
  expect(other.root.finish).toEqual(new Date(2025, 0, 6, 17));

  const covering = Calendar.standard.copyTo('covering');
  covering.customWorkWeeks.push(new CustomWorkWeek(Array.from({ length: 7 }, () => []),
    new Date(2025, 0, 6), new Date(2025, 0, 7)));
  other.calendar = covering;
  expect(other.getTask(1).start).toEqual(new Date(2025, 0, 7, 8));
  expect(other.root.finish).toEqual(new Date(2025, 0, 7, 17));
});
