// @vitest-environment jsdom
/*
 * TASK 40 item 5: `Scenarios.ScenarioManager`, `DataRange.DataRange` /
 * `DataRange.DataRangeManager` and `OutlineColumn.OutlineColumn`.
 * Every expectation is the official 19.2.5 trial's answer, observed through the
 * public API by the black-box probe (.probe/api-sweep-probe.mjs; probes
 * f40sc2-*..f40sc8-*, f40dr1b-*, f40dr2-*, f40dr3-*, f40oc6-* and f40oc7-*,
 * reports .probe/report-item5{b..j}.json).
 */
import { beforeEach, describe, expect, it } from 'vitest';
import GC from '../src/index.js';
import { ScenarioManager } from '../src/features/scenarios.js';
import { DataRange, DataRangeManager } from '../src/features/data-ranges.js';
import { OutlineColumn } from '../src/features/outline-column.js';
import type { EventInfo } from '../src/events.js';
import type { Workbook } from '../src/workbook.js';
import type { Worksheet } from '../src/worksheet.js';

const GUID = /^\{[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}\}$/;

let wb: Workbook;
let sheet: Worksheet;

beforeEach(() => {
  wb = new GC.Spread.Sheets.Workbook();
  sheet = wb.getActiveSheet() as Worksheet;
});

describe('ScenarioManager access and fresh serialization', () => {
  it('exposes the manager on the workbook and the class in the namespace (f40sc6-sc-fresh)', () => {
    expect(typeof wb.scenarioManager).toBe('object');
    expect(wb.scenarioManager).toBeInstanceOf(ScenarioManager);
    expect(typeof GC.Spread.Sheets.Scenarios.ScenarioManager).toBe('function');
  });

  it('writes the scenarios keys on a fresh workbook (f40sc7-fresh2)', () => {
    const json = wb.toJSON() as Record<string, unknown>;
    expect(Object.keys(json).filter((k) => /scenario/i.test(k))).toEqual(['scenarios', 'scenarioAdditionalInfo']);
    expect(json.scenarios).toBeUndefined();
    expect(JSON.parse(JSON.stringify(json.scenarioAdditionalInfo))).toEqual({ appliedScenarios: {}, baseValues: {} });
  });
});

describe('ScenarioManager set/get/all materialization (f40sc5, f40sc7, f40sc8)', () => {
  it('keeps a plain set() invisible until activation', () => {
    const sm = wb.scenarioManager;
    sheet.setValue(0, 0, 1);
    sm.set({ name: 'X', overrides: [{ sheetName: 'Sheet1', cells: [{ ref: 'A1', value: 5 }] }] });
    expect(sm.all()).toEqual([]);
    expect(sm.get('X')).toBeUndefined();
    expect(sm.apply('X')).toBe(false);
    expect(sm.getAppliedScenarios()).toEqual([]);
    expect(sm.getBaseValues()).toEqual([]);
  });

  it('materializes on setActiveScenario with a GUID userId and empty overrides', () => {
    const sm = wb.scenarioManager;
    sheet.setValue(0, 0, 1);
    sm.set({ name: 'X', overrides: [{ sheetName: 'Sheet1', cells: [{ ref: 'A1', value: 5 }] }] });
    expect(sm.setActiveScenario('X')).toBe(true);
    const scenario = sm.get('X')!;
    expect(scenario.name).toBe('X');
    expect(scenario.userId).toMatch(GUID);
    expect(scenario.overrides).toEqual([]);
    expect(sm.all()).toHaveLength(1);
    expect(sm.getAppliedScenarios()).toEqual(['X']);
  });

  it('answers false for unknown names, for the already-active scenario and for switches (f40sc8-activation)', () => {
    const sm = wb.scenarioManager;
    sm.set({ name: 'A', overrides: [] });
    sm.set({ name: 'B', overrides: [] });
    expect(sm.setActiveScenario('A')).toBe(true);
    expect(sm.setActiveScenario('A')).toBe(false); // re-activating the active scenario
    expect(sm.setActiveScenario('B')).toBe(false); // switch refused while A is active
    expect(sm.get('B')).toBeUndefined();
    expect(sm.getAppliedScenarios()).toEqual(['A']);
    expect(sm.setActiveScenario('Y')).toBe(false); // unknown name
    expect(sm.setActiveScenario(null)).toBe(true);
    expect(sm.setActiveScenario('B')).toBe(true); // now the activation succeeds
    expect(sm.get('B')).toBeDefined();
    expect(sm.setActiveScenario('B')).toBe(false);
    expect(sm.setActiveScenario(null)).toBe(true);
  });

  it('tolerates empty names, duplicate names and a null argument (f40sc2-scenarios)', () => {
    const sm = wb.scenarioManager;
    sm.set({ name: 'D', overrides: [] });
    expect(() => sm.set({ name: 'D', overrides: [] })).not.toThrow();
    expect(() => sm.set({ name: '', overrides: [] })).not.toThrow();
    expect(() => sm.set(null as never)).not.toThrow();
  });

  it('returns a fresh copy from get(); mutating it is inert until passed to set() (f40sc6-sc-live)', () => {
    const sm = wb.scenarioManager;
    sheet.setValue(0, 0, 1);
    sm.set({ name: 'L', overrides: [] });
    sm.setActiveScenario('L');
    sheet.setValue(0, 0, 42);
    const a = sm.get('L')!;
    expect(sm.get('L') === a).toBe(false);
    a.overrides[0].comment = 'live-edit';
    a.overrides[0].cells[0].value = 999;
    expect(sm.get('L')!.overrides[0].cells[0].value).toBe(42); // mutation not stored
    sm.set(a);
    const after = sm.get('L')!;
    expect(after.overrides[0].comment).toBe('live-edit');
    expect(after.overrides[0].cells[0].value).toBe(999);
    sm.setActiveScenario(null);
  });
});

describe('ScenarioManager capture, apply, restore, base values', () => {
  it('captures direct value edits: newest override value, first original as base (f40sc6-sc-base)', () => {
    const sm = wb.scenarioManager;
    sheet.setValue(0, 0, 1);
    sm.set({ name: 'B', overrides: [] });
    sm.setActiveScenario('B');
    sheet.setValue(0, 0, 2);
    sheet.setValue(0, 0, 5);
    expect(sm.get('B')!.overrides[0].cells).toEqual([{ ref: 'A1', value: 5 }]);
    expect(sm.getBaseValues()).toEqual([{ sheetName: 'Sheet1', cells: [{ ref: 'A1', value: 1 }] }]);
    sm.setActiveScenario(null);
  });

  it('does not capture formula edits (f40sc7-formula)', () => {
    const sm = wb.scenarioManager;
    sheet.setValue(0, 0, 1);
    sm.set({ name: 'FM', overrides: [] });
    sm.setActiveScenario('FM');
    sheet.setFormula(0, 1, '=5*2');
    expect(sheet.getValue(0, 1)).toBe(10);
    expect(sm.get('FM')!.overrides).toEqual([]);
    sm.setActiveScenario(null);
    expect(sm.apply('FM')).toBe(true);
    expect(sheet.getValue(0, 1)).toBe(10);
    expect(sheet.getFormula(0, 1)).toBe('5*2'); // the trial keeps the formula after a value setValue
    sm.restore('FM');
    expect(sheet.getValue(0, 1)).toBe(10);
    sm.remove();
  });

  it('applies a materialized scenario: writes overrides, records the first base, keeps userId (f40sc5-scenarios3)', () => {
    const sm = wb.scenarioManager;
    sheet.setValue(0, 0, 1);
    sm.set({ name: 'X', overrides: [] });
    sm.setActiveScenario('X');
    sheet.setValue(0, 0, 42);
    const live = sm.get('X')!;
    live.overrides[0].comment = 'updated';
    live.overrides[0].cells[0].value = 77;
    sm.set(live);
    expect(sm.apply('X')).toBe(true);
    expect(sheet.getValue(0, 0)).toBe(77);
    expect(sm.getBaseValues()).toEqual([{ sheetName: 'Sheet1', cells: [{ ref: 'A1', value: 1 }] }]);
    expect(sm.getAppliedScenarios()).toEqual(['X']);
    expect(sm.get('X')!.overrides[0]).toMatchObject({ sheetName: 'Sheet1', comment: 'updated', cells: [{ ref: 'A1', value: 77 }] });
    sm.restore('X');
    expect(sheet.getValue(0, 0)).toBe(1);
    expect(sm.getAppliedScenarios()).toEqual([]);
    expect(sm.getBaseValues()).toEqual([]);
    sm.setActiveScenario(null);
  });

  it('apply() on an unknown or unmaterialized scenario answers false; restore/remove of unknown names answer nothing (f40sc2, f40sc5)', () => {
    const sm = wb.scenarioManager;
    expect(sm.apply('nope')).toBe(false);
    sm.set({ name: 'S2', overrides: [{ sheetName: 'Nope', cells: [{ ref: 'A1', value: 1 }] }] });
    expect(sm.get('S2')).toBeUndefined();
    expect(sm.apply('S2')).toBe(false);
    expect(sm.restore('nope')).toBeUndefined();
    expect(sm.remove('nope')).toBeUndefined();
  });

  it('restore() without name restores all applied scenarios; the scenario itself survives (f40sc8, f40sc5)', () => {
    const sm = wb.scenarioManager;
    sheet.setValue(0, 0, 1);
    sm.set({ name: 'R', overrides: [] });
    sm.setActiveScenario('R');
    sheet.setValue(0, 0, 42);
    sm.restore();
    expect(sheet.getValue(0, 0)).toBe(1);
    expect(sm.getAppliedScenarios()).toEqual([]);
    expect(sm.get('R')).toBeDefined(); // still materialized after restore
    expect(sm.apply('R')).toBe(true); // re-apply allowed, base re-captured at the restored value
    expect(sheet.getValue(0, 0)).toBe(42);
    expect(sm.getBaseValues()).toEqual([{ sheetName: 'Sheet1', cells: [{ ref: 'A1', value: 1 }] }]);
    sm.setActiveScenario(null);
  });

  it('getBaseValues() and getAppliedScenarios() answer snapshots, not live references (f40sc6-sc-base)', () => {
    const sm = wb.scenarioManager;
    sheet.setValue(0, 0, 1);
    sm.set({ name: 'B2', overrides: [] });
    sm.setActiveScenario('B2');
    sheet.setValue(0, 0, 2);
    const base = sm.getBaseValues();
    base[0].cells[0].value = 'mutated';
    expect(sm.getBaseValues()).toEqual([{ sheetName: 'Sheet1', cells: [{ ref: 'A1', value: 1 }] }]);
    const applied = sm.getAppliedScenarios();
    applied.push('fake');
    expect(sm.getAppliedScenarios()).toEqual(['B2']);
    sm.setActiveScenario(null);
  });

  it('keeps one shared base entry per cell across scenarios (f40sc7-overlap)', () => {
    const sm = wb.scenarioManager;
    sheet.setValue(0, 0, 1);
    sm.set({ name: 'A', overrides: [] });
    sm.set({ name: 'B', overrides: [] });
    sm.setActiveScenario('A');
    sheet.setValue(0, 0, 2);
    expect(sm.setActiveScenario('B')).toBe(false); // A still active
    sheet.setValue(0, 0, 3); // captured by A
    expect(sm.get('A')!.overrides[0].cells).toEqual([{ ref: 'A1', value: 3 }]);
    expect(sm.get('B')).toBeUndefined();
    expect(sm.getBaseValues()).toEqual([{ sheetName: 'Sheet1', cells: [{ ref: 'A1', value: 1 }] }]);
    sm.setActiveScenario(null);
  });

  it('removes one scenario or all scenarios (f40sc2, f40sc8)', () => {
    const sm = wb.scenarioManager;
    sm.set({ name: 'A1n', overrides: [] });
    sm.set({ name: 'B1n', overrides: [] });
    sm.setActiveScenario('A1n');
    sm.setActiveScenario(null);
    sm.setActiveScenario('B1n');
    sm.setActiveScenario(null);
    expect(sm.all()).toHaveLength(2);
    sm.remove('A1n');
    expect(sm.all().map((s) => s.name)).toEqual(['B1n']);
    expect(sm.getAppliedScenarios()).toEqual(['B1n']); // A1n dropped from the applied list too
    sm.remove();
    expect(sm.all()).toEqual([]);
    expect(sm.getAppliedScenarios()).toEqual([]);
  });

  it('fires no ScenarioChanged/ScenarioChanging events for any manager call (f40sc6-sc-events)', () => {
    const sm = wb.scenarioManager;
    const log: string[] = [];
    wb.bind(GC.Spread.Sheets.Events.ScenarioChanging, (_s: unknown, a: EventInfo) => log.push(`ING/${a.action}/${(a.scenario as { name?: string })?.name}`));
    wb.bind(GC.Spread.Sheets.Events.ScenarioChanged, (_s: unknown, a: EventInfo) => log.push(`ED/${a.action}/${(a.scenario as { name?: string })?.name}`));
    sheet.setValue(0, 0, 1);
    sm.set({ name: 'E1', overrides: [] });
    sm.setActiveScenario('E1');
    sheet.setValue(0, 0, 42);
    sm.setActiveScenario(null);
    sm.apply('E1');
    sm.restore('E1');
    sm.set({ name: 'E1', overrides: [] });
    sm.remove('E1');
    expect(log).toEqual([]);
  });

  it('serializes scenarios + additional info and round-trips them through fromJSON (f40sc7-fromjson2)', () => {
    const sm = wb.scenarioManager;
    sheet.setValue(0, 0, 1);
    sm.set({ name: 'F', overrides: [] });
    sm.setActiveScenario('F');
    sheet.setValue(0, 0, 42);
    const json = JSON.parse(JSON.stringify(wb.toJSON()));
    const userId = (json.scenarios.F as { userId: string }).userId;
    expect(userId).toMatch(GUID);
    expect(json.scenarios).toEqual({ F: { name: 'F', userId, overrides: [{ sheetName: 'Sheet1', dataTable: { '0': { '0': { value: 42 } } } }] } });
    expect(json.scenarioAdditionalInfo).toEqual({
      appliedScenarios: { F: true },
      baseValues: { Sheet1: { '0': { '0': { value: 1 } } } },
      activeScenario: 'F',
    });
    wb.fromJSON(json);
    const restored = wb.scenarioManager.get('F')!;
    expect(restored.userId).toBe(userId); // the loaded userId is kept, not regenerated
    expect(restored.overrides).toEqual([{ sheetName: 'Sheet1', cells: [{ ref: 'A1', value: 42 }] }]);
    expect(wb.scenarioManager.getAppliedScenarios()).toEqual(['F']);
    expect(wb.scenarioManager.getBaseValues()).toEqual([{ sheetName: 'Sheet1', cells: [{ ref: 'A1', value: 1 }] }]);
    expect(wb.getActiveSheet().getValue(0, 0)).toBe(42);
    expect(wb.scenarioManager.apply('F')).toBe(true); // the trial answers true here before its own crash
    expect(wb.getActiveSheet().getValue(0, 0)).toBe(42);
    wb.scenarioManager.setActiveScenario(null);
    wb.scenarioManager.remove();
    expect((wb.toJSON() as Record<string, unknown>).scenarios).toBeUndefined();
  });
});

describe('DataRangeManager and DataRange', () => {
  const provider = (calls: string[]) => ({
    getValue: (r: number, c: number) => {
      calls.push(`g${r}/${c}`);
      return `P${r}-${c}`;
    },
    setValue: (r: number, c: number, v: unknown) => {
      calls.push(`s${r}/${c}=${String(v)}`);
      return true;
    },
    toJSON: () => ({ kind: 'probe' }),
  });

  it('exposes the manager on the sheet and both classes in the namespace', () => {
    expect(sheet.dataRanges).toBeInstanceOf(DataRangeManager);
    expect(typeof GC.Spread.Sheets.DataRange.DataRangeManager).toBe('function');
    expect(typeof GC.Spread.Sheets.DataRange.DataRange).toBe('function');
  });

  it('add() returns a DataRange whose provider answers the in-range cell values (f40dr1b-map)', () => {
    const calls: string[] = [];
    const dr = sheet.dataRanges.add('d', provider(calls), new GC.Spread.Sheets.Range(1, 2, 3, 4));
    expect(dr).toBeInstanceOf(DataRange);
    expect(sheet.getValue(1, 2)).toBe('P0-0');
    expect(sheet.getValue(3, 5)).toBe('P2-3');
    expect(sheet.getValue(0, 0)).toBeNull(); // outside the range: model answers
    expect(sheet.getValue(1, 1)).toBeNull();
    expect(calls.length).toBeGreaterThanOrEqual(12); // the trial pulls the full 3x4 provider block
  });

  it('blocks model writes inside the range without reaching the provider setValue hook, then re-reads the provider (f40dr1b-map)', () => {
    const calls: string[] = [];
    sheet.dataRanges.add('d', provider(calls), new GC.Spread.Sheets.Range(1, 2, 3, 4));
    sheet.setValue(2, 3, 'user');
    expect(sheet.getValue(2, 3)).toBe('P1-1'); // trial: the model write is dropped
    expect(sheet.getText(2, 3)).toBe('P1-1');
    expect(calls.some((c) => c.startsWith('s'))).toBe(false); // trial recorded no provider.setValue calls
  });

  it('name(value) answers the new name string and only changes the display name; the manager keeps the add() key (f40dr2-rename)', () => {
    const calls: string[] = [];
    const dr = sheet.dataRanges.add('dr1', provider(calls), new GC.Spread.Sheets.Range(0, 0, 2, 2));
    expect(dr.name()).toBe('dr1');
    expect(dr.name('dr2')).toBe('dr2');
    expect(dr.name()).toBe('dr2');
    expect(sheet.dataRanges.get('dr1')!.name()).toBe('dr2'); // keyed by the original name
    expect(sheet.dataRanges.get('dr2')).toBeUndefined();
    expect(sheet.dataRanges.all().map((x) => x.name())).toEqual(['dr2']);
    expect(sheet.dataRanges.remove('dr2')).toBeUndefined(); // no-op: unknown key
    expect(sheet.dataRanges.all().map((x) => x.name())).toEqual(['dr2']);
    expect(sheet.dataRanges.remove('dr1')).toBeUndefined();
    expect(sheet.dataRanges.all()).toEqual([]);
    expect(sheet.dataRanges.get('nope')).toBeUndefined();
    expect(sheet.dataRanges.remove('nope')).toBeUndefined();
  });

  it('range() answers a Range; the setter answers nothing and accepts Range or plain objects; repaint() answers nothing (f40sc5, f40dr1b)', () => {
    const calls: string[] = [];
    const dr = sheet.dataRanges.add('r', provider(calls), { row: 0, col: 0, rowCount: 2, colCount: 2 });
    const box = dr.range();
    expect(box).toBeInstanceOf(GC.Spread.Sheets.Range);
    expect({ row: box.row, col: box.col, rowCount: box.rowCount, colCount: box.colCount }).toEqual({ row: 0, col: 0, rowCount: 2, colCount: 2 });
    expect(dr.range(new GC.Spread.Sheets.Range(1, 1, 3, 3))).toBeUndefined();
    expect(JSON.parse(JSON.stringify(dr.range()))).toEqual({ row: 1, col: 1, rowCount: 3, colCount: 3 });
    expect(sheet.getValue(0, 0)).toBeNull(); // (0,0) left the range
    expect(sheet.getValue(1, 1)).toBe('P0-0'); // the range origin reads the provider at (0,0)
    expect(dr.repaint()).toBeUndefined();
  });

  it('options is an own property normalized to sticky.top; dataProvider is exposed as given (f40dr3-manager-json)', () => {
    const calls: string[] = [];
    const plain = sheet.dataRanges.add('p1', provider(calls), new GC.Spread.Sheets.Range(0, 0, 2, 2));
    expect(JSON.parse(JSON.stringify(plain.options))).toEqual({ sticky: { top: 0 } });
    const sticky = sheet.dataRanges.add('p2', provider(calls), new GC.Spread.Sheets.Range(5, 0, 2, 2), { sticky: { top: 1 } });
    expect(JSON.parse(JSON.stringify(sticky.options))).toEqual({ sticky: { top: 1 } });
    expect(sticky.dataProvider).toBeDefined();
    expect(sheet.getValue(0, 0)).toBe('P0-0');
    expect(sheet.getValue(6, 0)).toBe('P1-0');
  });

  it('all() keeps the insertion order, duplicate names replace, clear() empties (f40dr3, f40sc5)', () => {
    const calls: string[] = [];
    sheet.dataRanges.add('p1', provider(calls), new GC.Spread.Sheets.Range(0, 0, 1, 1));
    sheet.dataRanges.add('p2', provider(calls), new GC.Spread.Sheets.Range(1, 0, 1, 1));
    expect(sheet.dataRanges.all().map((x) => x.name())).toEqual(['p1', 'p2']);
    sheet.dataRanges.add('p2', provider(calls), new GC.Spread.Sheets.Range(2, 0, 1, 1));
    expect(sheet.dataRanges.all().map((x) => x.name())).toEqual(['p1', 'p2']);
    expect(sheet.dataRanges.clear()).toBeUndefined();
    expect(sheet.dataRanges.all()).toEqual([]);
  });

  it('serializes data ranges into the sheet JSON while the provider exposes toJSON (f40dr3-manager-json)', () => {
    const calls: string[] = [];
    sheet.dataRanges.add('p1', provider(calls), new GC.Spread.Sheets.Range(0, 0, 2, 2));
    const record = { name: 'p1', range: { row: 0, col: 0, rowCount: 2, colCount: 2 }, dataProvider: { kind: 'probe' }, options: { sticky: { top: 0 } } };
    expect(JSON.parse(JSON.stringify(sheet.dataRanges.toJSON()))).toEqual([record]);
    expect(JSON.parse(JSON.stringify(sheet.toJSON().dataRanges))).toEqual([record]);
    sheet.dataRanges.clear();
    expect((sheet.toJSON() as Record<string, unknown>).dataRanges).toBeUndefined();
  });

  it('a string dataProvider answers NotImplemented (the trial crashes on its own internals there)', () => {
    expect(() => sheet.dataRanges.add('str', 'x', new GC.Spread.Sheets.Range(6, 0, 1, 1))).toThrow(/NotImplemented/);
  });
});

describe('OutlineColumn', () => {
  const indents = (values: number[], column = 0) => {
    sheet.setRowCount(values.length);
    values.forEach((v, i) => {
      sheet.setValue(i, column, `r${i}`);
      sheet.getRange(i, column, 1, 1).textIndent(v);
    });
    sheet.showRowOutline(true);
  };
  const J = (v: unknown) => JSON.parse(JSON.stringify(v));

  it('answers null check status until an options object with showCheckBox appeared, collapsed always false (f40oc7-combos)', () => {
    indents([0, 1, 2]);
    const oc = sheet.outlineColumn;
    expect(oc).toBeInstanceOf(OutlineColumn);
    expect(oc.getCheckStatus()).toEqual([null, null, null]);
    expect(oc.getCheckStatus(1)).toBeNull();
    expect(oc.getCollapsed()).toEqual([false, false, false]);
    expect(oc.options({ maxLevel: 1 })).toBe(oc); // chains
    expect(oc.getCheckStatus()).toEqual([null, null, null]);
    expect(oc.setCheckStatus(0, true)).toBeUndefined(); // no columnIndex: no-op
    expect(oc.getCheckStatus()).toEqual([null, null, null]);
    oc.options({ columnIndex: 0 }); // REPLACES the options (maxLevel gone)
    expect(oc.setCheckStatus(0, true)).toBeUndefined(); // showCheckBox gone: check stays inert
    expect(oc.getCheckStatus()).toEqual([null, null, null]);
    oc.setCollapsed(0, true); // collapse only needs columnIndex (f40oc7-combos collapsedNoShow)
    expect(J(oc.getCollapsed())).toEqual([true, true, false]);
    expect([0, 1, 2].map((r) => sheet.getRowVisible(r))).toEqual([true, false, false]);
    expect(J(sheet.toJSON().outlineColumnOptions)).toEqual({ columnIndex: 0 });
  });

  it('options() answers the current options object, {} until set (f40sc5-outline3)', () => {
    expect(sheet.outlineColumn.options()).toEqual({});
    sheet.outlineColumn.options({ columnIndex: 0, showImage: true, showCheckBox: true, images: ['a.png'], maxLevel: 2 });
    expect(J(sheet.outlineColumn.options())).toEqual({ columnIndex: 0, showImage: true, showCheckBox: true, images: ['a.png'], maxLevel: 2 });
  });

  it('check status cascades down the group and unchecks all ancestors upward (f40oc7-args)', () => {
    indents([0, 1, 1]);
    const oc = sheet.outlineColumn;
    oc.options({ columnIndex: 0, showCheckBox: true });
    expect(oc.getCheckStatus()).toEqual([false, false, false]);
    oc.setCheckStatus(2, true);
    expect(oc.getCheckStatus()).toEqual([false, false, true]);
    oc.setCheckStatus(0, false); // cascade uncheck reaches the individually checked child
    expect(oc.getCheckStatus()).toEqual([false, false, false]);
    oc.setCheckStatus(0, true); // cascade check reaches the whole group
    expect(oc.getCheckStatus()).toEqual([true, true, true]);
    oc.setCheckStatus(2, false); // unchecking a child also unchecks its ancestors
    expect(oc.getCheckStatus()).toEqual([false, true, false]);
    expect(oc.getCheckStatus(2)).toBe(false);
    expect(oc.getCheckStatus(1)).toBe(true);
  });

  it('cascades over a deep group, stops at siblings and keeps state across option replacement (f40sc5-outline3)', () => {
    indents([0, 1, 2, 1, 2, 1, 1, 0, 1, 1, 1, 1, 1]);
    const oc = sheet.outlineColumn;
    oc.options({ columnIndex: 0, showImage: true, showCheckBox: true, images: ['star2.png', 'box4.png', 'rating4.png'], maxLevel: 2 });
    expect(oc.getCheckStatus()).toHaveLength(13); // one entry per row
    oc.setCollapsed(1, true);
    expect(J(oc.getCollapsed())).toEqual([false, true, false, false, false, false, false, false, false, false, false, false, false]);
    expect(sheet.getRowVisible(2)).toBe(false); // the group child is hidden
    expect(sheet.getRowVisible(3)).toBe(true); // the sibling stays
    oc.setCollapsed(1, false);
    expect(sheet.getRowVisible(2)).toBe(true);
    oc.setCollapsed(7, true);
    expect(J(oc.getCollapsed())).toEqual([false, false, false, false, false, false, false, true, false, false, false, false, false]);
    expect([8, 9, 10].map((r) => sheet.getRowVisible(r))).toEqual([false, false, false]);
    oc.setCheckStatus(1, true);
    oc.setCheckStatus(7, true);
    expect(J(oc.getCheckStatus())).toEqual([false, true, true, false, false, false, false, true, true, true, true, true, true]);
    expect(oc.getCheckStatus(4)).toBe(false); // child of the unchecked r3 sibling
    oc.setCheckStatus(1, false);
    expect(J(oc.getCheckStatus())).toEqual([false, false, false, false, false, false, false, true, true, true, true, true, true]);
    oc.options({ maxLevel: 1 }); // replaced options: the flags persist, new sets are inert
    expect(J(oc.getCheckStatus())).toEqual([false, false, false, false, false, false, false, true, true, true, true, true, true]);
    expect(sheet.getRowVisible(2)).toBe(true);
    expect(oc.refresh()).toBeUndefined();
    expect(J(oc.getCheckStatus())).toEqual([false, false, false, false, false, false, false, true, true, true, true, true, true]);
    expect(J(oc.getCollapsed())).toEqual([false, false, false, false, false, false, false, true, false, false, false, false, false]);
  });

  it('collapsed flags follow the first-child chain while each child is a group start (f40oc7-chain-a/b/c)', () => {
    indents([0, 1, 2, 3, 4]);
    const oc = sheet.outlineColumn;
    oc.options({ columnIndex: 0, showCheckBox: true, maxLevel: 3 });
    oc.setCollapsed(0, true);
    expect(J(oc.getCollapsed())).toEqual([true, true, true, true, false]);
    expect([0, 1, 2, 3, 4].map((r) => sheet.getRowVisible(r))).toEqual([true, false, false, false, false]);
    expect(J(oc.setCheckStatus(0, true) ?? oc.getCheckStatus())).toEqual([true, true, true, true, true]);
    oc.setCollapsed(0, false);
    oc.setCheckStatus(0, false);
    oc.options({ columnIndex: 0, showCheckBox: true }); // replace, maxLevel gone: cascades unchanged
    expect(J(oc.getCheckStatus())).toEqual([false, false, false, false, false]);
  });

  it('a childless first child is not marked collapsed ([0,2] and [0,1,2,2]) (f40oc7-chain-b/c)', () => {
    indents([0, 2]);
    const oc = sheet.outlineColumn;
    oc.options({ columnIndex: 0, showCheckBox: true });
    oc.setCollapsed(0, true);
    expect(J(oc.getCollapsed())).toEqual([true, false]);
    expect([0, 1].map((r) => sheet.getRowVisible(r))).toEqual([true, false]);
    expect(J(oc.setCheckStatus(0, true) ?? oc.getCheckStatus())).toEqual([true, true]);
    sheet.setRowCount(4);
    [0, 1, 2, 2].forEach((v, i) => {
      sheet.getRange(i, 0, 1, 1).textIndent(v);
    });
    oc.options({ columnIndex: 0, showCheckBox: true, maxLevel: 1 });
    oc.setCollapsed(0, true);
    expect(J(oc.getCollapsed())).toEqual([true, true, false, false]);
    expect([0, 1, 2, 3].map((r) => sheet.getRowVisible(r))).toEqual([true, false, false, false]);
    expect(J(oc.setCheckStatus(0, true) ?? oc.getCheckStatus())).toEqual([true, true, true, true]);
  });

  it('reads the hierarchy from options.columnIndex (f40oc6-colindex)', () => {
    indents([0, 1, 2, 1, 0], 1);
    const oc = sheet.outlineColumn;
    oc.options({ columnIndex: 1, showCheckBox: true });
    oc.setCollapsed(0, true);
    expect(J(oc.getCollapsed())).toEqual([true, true, false, false, false]);
    expect([0, 1, 2, 3, 4].map((r) => sheet.getRowVisible(r))).toEqual([true, false, false, false, true]);
    oc.setCheckStatus(0, true);
    expect(J(oc.getCheckStatus())).toEqual([true, true, true, true, false]);
  });

  it('fires OutlineColumnCheckStatusChanged once per setCheckStatus with {sheet, sheetName, row, col, status} (f40oc7-args)', () => {
    indents([0, 1, 1]);
    const oc = sheet.outlineColumn;
    const events: { keys: string[], row: number, col: number, status: boolean, sheetName: string }[] = [];
    wb.bind(GC.Spread.Sheets.Events.OutlineColumnCheckStatusChanged, (_s: unknown, a: EventInfo) => {
      events.push({
        keys: Object.keys(a).sort(),
        row: (a as { row: number }).row,
        col: (a as { col: number }).col,
        status: (a as { status: boolean }).status,
        sheetName: (a as { sheetName: string }).sheetName,
      });
    });
    oc.options({ columnIndex: 0, showCheckBox: true });
    oc.setCheckStatus(2, true);
    oc.setCheckStatus(0, false);
    oc.setCheckStatus(0, true);
    oc.setCheckStatus(2, false);
    expect(events).toHaveLength(4);
    expect(events[0]).toEqual({ keys: ['col', 'row', 'sheet', 'sheetName', 'status'], row: 2, col: 0, status: true, sheetName: 'Sheet1' });
    expect(events[3]).toEqual({ keys: ['col', 'row', 'sheet', 'sheetName', 'status'], row: 2, col: 0, status: false, sheetName: 'Sheet1' });
  });

  it('serializes the options plus checked rows under data; setCheckStatus writes the data, options() drops it; collapsed is never serialized (f40sc5, f40oc7)', () => {
    indents([0, 1, 1]);
    const oc = sheet.outlineColumn;
    oc.options({ columnIndex: 0, showCheckBox: true });
    oc.setCheckStatus(2, true);
    oc.setCheckStatus(0, false);
    oc.setCheckStatus(0, true);
    oc.setCheckStatus(2, false); // leaves [false, true, false]: the trial writes the data snapshot on every setCheckStatus
    expect(J(sheet.toJSON().outlineColumnOptions)).toEqual({ columnIndex: 0, showCheckBox: true, data: { '1': { checked: true } } });
    oc.options({ maxLevel: 1 }); // options replacement drops the data key (trial f40sc5-outline3)
    expect(J(sheet.toJSON().outlineColumnOptions)).toEqual({ maxLevel: 1 });
    oc.options({ columnIndex: 0, showCheckBox: true });
    oc.setCollapsed(0, true);
    expect(J(sheet.toJSON().outlineColumnOptions)).toEqual({ columnIndex: 0, showCheckBox: true }); // no data key: collapse is not serialized
  });

  it('refresh() answers nothing and keeps every flag (f40sc5-afterRefresh)', () => {
    indents([0, 1, 2, 1, 2, 1, 1]);
    const oc = sheet.outlineColumn;
    oc.options({ columnIndex: 0, showCheckBox: true });
    oc.setCheckStatus(0, true);
    oc.setCollapsed(0, true);
    expect(oc.refresh()).toBeUndefined();
    expect(J(oc.getCheckStatus())).toEqual([true, true, true, true, true, true, true]);
    expect(J(oc.getCollapsed())).toEqual([true, true, false, false, false, false, false]); // [0,1,2,1,2,1,1]: r1 is a group start (child r2), r2 is not (r3 is a sibling)
    expect(J(sheet.outlineColumn.options())).toEqual({ columnIndex: 0, showCheckBox: true });
  });
});
