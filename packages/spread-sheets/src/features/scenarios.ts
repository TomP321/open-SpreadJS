// Workbook scenarios (`GC.Spread.Sheets.Scenarios.ScenarioManager`).
//
// Trial semantics (probes f40sc2..f40sc8, .probe/report-item5{b-h}.json):
// - `set(scenario)` stores a name definition; the override cells of a new
//   definition are NOT carried over. The scenario becomes visible in
//   `all()/get()/apply()` only after it has been materialized by
//   `setActiveScenario(name)` (activation assigns the GUID `userId` and marks
//   the scenario applied). Updating a materialized scenario through
//   `set(scenario)` (e.g. with the object returned by `get()`) writes its
//   `overrides[].cells` into the stored state.
// - While a scenario is active, subsequent direct cell value writes are
//   captured: the override cell keeps the newest value and the first original
//   value per cell is remembered as a base value (formula edits are not
//   captured — the trial leaves them out of the overrides).
// - `apply(name)` works only on materialized scenarios, stores a base value
//   for every touched cell that has none yet and writes the override values.
// - `restore(name?)` puts the base values back, drops the base entries and
//   removes the scenario from the applied list; the scenario itself stays.
// - The trial does not fire `ScenarioChanging`/`ScenarioChanged` for any of
//   these calls (probe f40sc6-sc-events recorded an empty log); we match.
import type { Workbook } from '../workbook.js';
import type { Worksheet } from '../worksheet.js';
import { parseReference } from './formula-color.js';

export type ScenarioOverrideValue = string | number | boolean | Date | null | undefined | Record<string, unknown>;
export type ScenarioActionType = 'add' | 'update' | 'remove' | 'apply' | 'restore' | 'activate' | 'deactivate';

export interface IScenarioOverride {
  ref: string;
  value: ScenarioOverrideValue;
}

export interface IScenarioOverrides {
  sheetName: string;
  comment?: string;
  hidden?: boolean;
  locked?: boolean;
  cells: IScenarioOverride[];
}

export interface IScenario {
  name: string;
  userId?: string;
  overrides: IScenarioOverrides[];
}

interface RuntimeGroup {
  sheetName: string;
  comment?: string;
  hidden?: boolean;
  locked?: boolean;
  cells: Map<string, ScenarioOverrideValue>;
}

interface RuntimeScenario {
  name: string;
  userId: string;
  overrides: Map<string, RuntimeGroup>;
}

function guid(): string {
  const hex = '0123456789ABCDEF';
  const part = (n: number) => Array.from({ length: n }, () => hex[(Math.random() * 16) | 0]).join('');
  return `{${part(8)}-${part(4)}-4${part(3)}-${hex[8 + ((Math.random() * 4) | 0)]}${part(3)}-${part(12)}}`;
}

/** A1-style ref used by scenarios (single cell, no sheet prefix). */
export function scenarioRef(row: number, col: number): string {
  let colName = '';
  let c = col;
  do {
    colName = String.fromCharCode(65 + (c % 26)) + colName;
    c = Math.floor(c / 26) - 1;
  } while (c >= 0);
  return `${colName}${row + 1}`;
}

function parseScenarioRef(ref: string): { row: number; col: number } | undefined {
  const parsed = parseReference(ref);
  return parsed && parsed.row1 === parsed.row2 && parsed.col1 === parsed.col2
    ? { row: parsed.row1, col: parsed.col1 }
    : undefined;
}

export class ScenarioManager {
  /** Names passed to `set()`; invisible until activated. */
  private definitions = new Set<string>();  /** Materialized scenarios (activation or JSON load), in creation order. */
  private runtime = new Map<string, RuntimeScenario>();
  private applied: string[] = [];
  /** Base values: sheet name -> A1 ref -> original value (first capture wins). */
  private base = new Map<string, Map<string, unknown>>();
  private active: string | null = null;
  private muted = false;

  constructor(private workbook: Workbook) {}

  all(): IScenario[] {
    return [...this.runtime.values()].map((scenario) => this.publicScenario(scenario));
  }

  get(name: string): IScenario | undefined {
    const scenario = this.runtime.get(name);
    return scenario ? this.publicScenario(scenario) : undefined;
  }

  getAppliedScenarios(): string[] {
    return [...this.applied];
  }

  getBaseValues(): IScenarioOverrides[] {
    const result: IScenarioOverrides[] = [];
    for (const [sheetName, cells] of this.base) {
      if (!cells.size) continue;
      result.push({
        sheetName,
        cells: [...cells.entries()].map(([ref, value]) => ({ ref, value: value as ScenarioOverrideValue })),
      });
    }
    return result;
  }

  set(scenario: IScenario): void {
    const name = String((scenario as IScenario | null)?.name ?? '');
    const live = this.runtime.get(name);
    if (live) {
      const groups = new Map<string, RuntimeGroup>();
      for (const group of (scenario.overrides ?? []) as IScenarioOverrides[]) {
        if (!group || typeof group.sheetName !== 'string') continue;
        const entry = groups.get(group.sheetName) ?? { sheetName: group.sheetName, cells: new Map<string, ScenarioOverrideValue>() };
        entry.comment = group.comment;
        entry.hidden = group.hidden;
        entry.locked = group.locked;
        for (const cell of group.cells ?? []) {
          if (!cell || typeof cell.ref !== 'string') continue;
          entry.cells.set(String(cell.ref), cell.value);
        }
        for (const [ref, value] of dataTableCells(group)) entry.cells.set(ref, value);
        groups.set(group.sheetName, entry);
      }
      live.overrides = groups;
      return;
    }
    if (name) this.definitions.add(name);
  }

  apply(name: string): boolean {
    const scenario = this.runtime.get(name);
    if (!scenario) return false;
    for (const group of scenario.overrides.values()) {
      const sheet = this.workbook.getSheetFromName(group.sheetName);
      if (!sheet) continue;
      for (const [ref, value] of group.cells) {
        const cell = parseScenarioRef(ref);
        if (!cell) continue;
        const baseSheet = this.ensureBase(group.sheetName);
        if (!baseSheet.has(ref)) baseSheet.set(ref, sheet.getValue(cell.row, cell.col));
        this.muted = true;
        try {
          sheet.setValue(cell.row, cell.col, value === undefined ? null : value);
        } finally {
          this.muted = false;
        }
      }
    }
    if (!this.applied.includes(name)) this.applied.push(name);
    return true;
  }

  restore(name?: string): void {
    const names = name === undefined ? [...this.applied] : [name];
    for (const scenarioName of names) {
      const scenario = this.runtime.get(scenarioName);
      if (!scenario) continue;
      for (const group of scenario.overrides.values()) {
        const baseSheet = this.base.get(group.sheetName);
        if (!baseSheet) continue;
        const sheet = this.workbook.getSheetFromName(group.sheetName);
        if (!sheet) continue;
        for (const ref of group.cells.keys()) {
          if (!baseSheet.has(ref)) continue;
          const cell = parseScenarioRef(ref);
          if (!cell) continue;
          this.muted = true;
          try {
            sheet.setValue(cell.row, cell.col, baseSheet.get(ref) ?? null);
          } finally {
            this.muted = false;
          }
          baseSheet.delete(ref);
        }
      }
      this.applied = this.applied.filter((appliedName) => appliedName !== scenarioName);
    }
  }

  remove(name?: string): void {
    const names = name === undefined ? [...[...this.runtime.keys(), ...this.definitions]] : [name];
    for (const scenarioName of names) {
      this.runtime.delete(scenarioName);
      this.definitions.delete(scenarioName);
      if (this.active === scenarioName) {
        this.active = null;
        this.workbook._scenariosCapturing = false;
      }
      this.applied = this.applied.filter((appliedName) => appliedName !== scenarioName);
    }
  }

  setActiveScenario(name: string | null): boolean {
    if (name === null || name === undefined) {
      this.active = null;
      this.workbook._scenariosCapturing = false;
      return true;
    }
    if (this.active !== null) return false; // only one active scenario at a time
    if (!this.runtime.has(name) && !this.definitions.has(name)) return false;
    const scenario = this.materialize(name);
    this.active = name;
    this.workbook._scenariosCapturing = true;
    if (!this.applied.includes(scenario.name)) this.applied.push(scenario.name);
    return true;
  }

  // --- capture hooks (workbook value path) ------------------------------------
  /** Records the pre-write base value for the active scenario; `true` when a write follows. */
  _captureStart(sheet: Worksheet, row: number, col: number): boolean {
    if (!this.active || this.muted) return false;
    const scenario = this.runtime.get(this.active);
    if (!scenario) return false;
    const ref = scenarioRef(row, col);
    const baseSheet = this.ensureBase(sheet.name());
    if (!baseSheet.has(ref)) baseSheet.set(ref, sheet.getValue(row, col));
    return true;
  }

  /** Stores the post-write value as the active scenario's override. */
  _captureEnd(sheet: Worksheet, row: number, col: number): void {
    if (!this.active || this.muted) return;
    const scenario = this.runtime.get(this.active);
    if (!scenario) return;
    const ref = scenarioRef(row, col);
    let group = scenario.overrides.get(sheet.name());
    if (!group) {
      group = { sheetName: sheet.name(), cells: new Map<string, ScenarioOverrideValue>() };
      scenario.overrides.set(sheet.name(), group);
    }
    group.cells.set(ref, sheet.getValue(row, col) as ScenarioOverrideValue);
  }

  _activeScenario(): string | null {
    return this.active;
  }

  // --- serialization -----------------------------------------------------------
  /** `wb.toJSON().scenarios`: object keyed by scenario name (undefined when none). */
  _scenariosJSON(): Record<string, unknown> | undefined {
    if (!this.runtime.size) return undefined;
    const result: Record<string, unknown> = {};
    for (const scenario of this.runtime.values()) {
      result[scenario.name] = {
        name: scenario.name,
        userId: scenario.userId,
        overrides: [...scenario.overrides.values()].map((group) => ({
          sheetName: group.sheetName,
          ...(group.comment === undefined ? {} : { comment: group.comment }),
          ...(group.hidden === undefined ? {} : { hidden: group.hidden }),
          ...(group.locked === undefined ? {} : { locked: group.locked }),
          dataTable: dataTableJSON(group),
        })),
      };
    }
    return result;
  }

  /** `wb.toJSON().scenarioAdditionalInfo` (trial always writes this object). */
  _additionalJSON(): Record<string, unknown> {
    const active = this.active;
    return {
      appliedScenarios: Object.fromEntries(this.applied.map((name) => [name, true])),
      baseValues: Object.fromEntries([...this.base].map(([sheetName, cells]) => [sheetName, baseValuesJSON(cells)])),
      ...(active === null ? {} : { activeScenario: active }),
    };
  }

  _fromJSON(scenarios: unknown, additional: unknown): void {
    this.runtime.clear();
    this.definitions.clear();
    this.applied = [];
    this.base.clear();
    this.active = null;
    this.workbook._scenariosCapturing = false;
    if (scenarios && typeof scenarios === 'object') {
      for (const [name, raw] of Object.entries(scenarios as Record<string, Record<string, unknown>>)) {
        const scenario: RuntimeScenario = {
          name,
          userId: typeof (raw as { userId?: unknown }).userId === 'string' ? (raw as { userId: string }).userId : guid(),
          overrides: new Map<string, RuntimeGroup>(),
        };
        for (const group of (raw as { overrides?: unknown[] }).overrides ?? []) {
          const entry = group as { sheetName?: string; comment?: string; hidden?: boolean; locked?: boolean };
          if (!entry || typeof entry.sheetName !== 'string') continue;
          const cells = new Map<string, ScenarioOverrideValue>();
          for (const cell of (entry as { cells?: { ref: string; value: ScenarioOverrideValue }[] }).cells ?? [])
            if (cell && typeof cell.ref === 'string') cells.set(cell.ref, cell.value);
          for (const [ref, value] of dataTableCells(entry)) cells.set(ref, value);
          scenario.overrides.set(entry.sheetName, { sheetName: entry.sheetName, comment: entry.comment, hidden: entry.hidden, locked: entry.locked, cells });
        }
        this.runtime.set(name, scenario);
        this.definitions.add(name);
      }
    }
    const info = additional as { appliedScenarios?: Record<string, unknown>; baseValues?: Record<string, Record<string, Record<string, { value?: unknown }>>>; activeScenario?: string } | null;
    if (info && typeof info === 'object') {
      if (info.appliedScenarios && typeof info.appliedScenarios === 'object')
        this.applied = Object.keys(info.appliedScenarios).filter((name) => this.runtime.has(name));
      if (info.baseValues && typeof info.baseValues === 'object') {
        for (const [sheetName, rows] of Object.entries(info.baseValues)) {
          const cells = this.ensureBase(sheetName);
          for (const [rowKey, columns] of Object.entries(rows ?? {}))
            for (const [colKey, entry] of Object.entries(columns ?? {}))
              cells.set(scenarioRef(Number(rowKey), Number(colKey)), (entry as { value?: unknown }).value);
        }
      }
      if (typeof info.activeScenario === 'string' && this.runtime.has(info.activeScenario)) {
        this.active = info.activeScenario;
        this.workbook._scenariosCapturing = true;
      }
    }
  }

  private materialize(name: string): RuntimeScenario {
    let scenario = this.runtime.get(name);
    if (!scenario) {
      scenario = { name, userId: guid(), overrides: new Map<string, RuntimeGroup>() };
      this.runtime.set(name, scenario);
    }
    return scenario;
  }

  private ensureBase(sheetName: string): Map<string, unknown> {
    let cells = this.base.get(sheetName);
    if (!cells) {
      cells = new Map<string, unknown>();
      this.base.set(sheetName, cells);
    }
    return cells;
  }

  private publicScenario(scenario: RuntimeScenario): IScenario {
    return {
      name: scenario.name,
      userId: scenario.userId,
      overrides: [...scenario.overrides.values()].map((group) => ({
        sheetName: group.sheetName,
        ...(group.comment === undefined ? {} : { comment: group.comment }),
        ...(group.hidden === undefined ? {} : { hidden: group.hidden }),
        ...(group.locked === undefined ? {} : { locked: group.locked }),
        cells: [...group.cells.entries()].map(([ref, value]) => ({ ref, value })),
      })),
    };
  }
}

function dataTableJSON(group: RuntimeGroup): Record<string, Record<string, { value: unknown }>> {
  const rows: Record<string, Record<string, { value: unknown }>> = {};
  for (const [ref, value] of group.cells) {
    const cell = parseScenarioRef(ref);
    if (!cell) continue;
    const row = (rows[String(cell.row)] ??= {});
    row[String(cell.col)] = { value };
  }
  return rows;
}

function dataTableCells(group: unknown): Map<string, ScenarioOverrideValue> {
  const cells = new Map<string, ScenarioOverrideValue>();
  const table = (group as { dataTable?: Record<string, Record<string, { value?: unknown }>> }).dataTable;
  if (!table || typeof table !== 'object') return cells;
  for (const [rowKey, columns] of Object.entries(table))
    for (const [colKey, entry] of Object.entries(columns ?? {}))
      cells.set(scenarioRef(Number(rowKey), Number(colKey)), (entry as { value?: ScenarioOverrideValue } | undefined)?.value);
  return cells;
}

function baseValuesJSON(cells: Map<string, unknown>): Record<string, Record<string, { value: unknown }>> {
  const rows: Record<string, Record<string, { value: unknown }>> = {};
  for (const [ref, value] of cells) {
    const cell = parseScenarioRef(ref);
    if (!cell) continue;
    const row = (rows[String(cell.row)] ??= {});
    row[String(cell.col)] = { value };
  }
  return rows;
}
