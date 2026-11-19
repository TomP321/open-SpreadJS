import type { Duration } from './mapping.js';

export type TaskDependencyType = 'FS' | 'SS' | 'FF' | 'SF';

/**
 * A directed relationship between two tasks.
 *
 * `lag` mirrors what the trial tolerates rather than what it schedules: assigning any value to
 * `lag` (a parsed `Duration`, a hand-built one, milliseconds) is kept on the object and read back
 * unchanged, but the trial's scheduler ignores it in every dependency type, unit and sign —
 * verified black-box in `.probe/gantt-lag-matrix-1.json`, together with the lag suffixes of the
 * predecessor strings, which the trial parses and drops as well.
 */
export class TaskDependency<T = unknown> {
  // Declared as class fields so they become own instance properties and shadow any
  // prototype-level coverage stub installed for the declared members.
  from: T;
  to: T;
  type: TaskDependencyType;
  lag?: Duration | null;
  constructor(from: T, to: T, type: TaskDependencyType = 'FS') { this.from = from; this.to = to; this.type = type; }
}
