/*
 * TASK 70 (measured on the trial in paired probes): the trial's selection events.
 * Programmatic `setSelection`/`setActiveCell`/`addSelection`/`clearSelection` never fire
 * `SelectionChanged` there, while interaction-driven selections (mouse click, Shift+arrow,
 * the name box) fire `LeaveCell`, `EnterCell`, `SelectionChanging` and `SelectionChanged`.
 * OpenSheets keeps firing the events on the API path too (hosts rely on them; our unit
 * tests pinned `SelectionChanging` cancellation on that path long before), but marks the
 * args with `byUser` so the Designer can cache the trial's "user selection only" state —
 * see `packages/spread-sheets-designer/src/commands/insert.ts` chartCommandsEnabled.
 */
import { describe, expect, it } from 'vitest';
import GC from '../src/index.js';

const { Workbook, Events } = GC.Spread.Sheets;

type SelArgs = { byUser?: boolean };

function recorder(workbook: InstanceType<typeof Workbook>) {
  const fired: { event: string; byUser?: boolean }[] = [];
  for (const event of [Events.SelectionChanging, Events.SelectionChanged, Events.EnterCell, Events.LeaveCell] as const) {
    workbook.bind(event, (_e: unknown, args: SelArgs) => fired.push({ event, byUser: args?.byUser }));
  }
  return { fired, names: () => fired.map((x) => x.event).join(',') };
}

describe('selection events: byUser marking (trial parity)', () => {
  it('marks API setSelection/addSelection/clearSelection with byUser=false', () => {
    const wb = new Workbook();
    const s = wb.getActiveSheet();
    const { fired, names } = recorder(wb);
    s.setSelection(2, 3, 4, 5);
    s.addSelection(8, 8, 1, 1);
    s.clearSelection();
    expect(names()).toBe(['SelectionChanging', 'SelectionChanged', 'SelectionChanging', 'SelectionChanged', 'SelectionChanging', 'SelectionChanged'].join(','));
    expect(fired.filter((entry) => entry.event === Events.SelectionChanged).every((entry) => entry.byUser === false)).toBe(true);
    expect(fired.filter((entry) => entry.event === Events.SelectionChanging).every((entry) => entry.byUser === undefined)).toBe(true);
    expect(s.getActiveRowIndex()).toBe(2); // API path still moves active cells silently (setSelection sets the active cell)
  });

  it('marks API setActiveCell with byUser=false and keeps LeaveCell/EnterCell', () => {
    const wb = new Workbook();
    const { fired, names } = recorder(wb);
    wb.getActiveSheet().setActiveCell(4, 5);
    expect(names()).toBe(['LeaveCell', 'SelectionChanging', 'SelectionChanged', 'EnterCell'].join(','));
    expect(fired.filter((entry) => entry.event === Events.SelectionChanged).every((entry) => entry.byUser === false)).toBe(true);
  });

  it('marks interaction selections with byUser=true', () => {
    const wb = new Workbook();
    const s = wb.getActiveSheet();
    const { fired, names } = recorder(wb);
    s._userSetSelection(1, 1, 3, 2);
    s._userSetActiveCell(6, 2);
    s._setUserSelections([new GC.Spread.Sheets.Range(0, 0, 2, 2)], 0, 0);
    const changed = fired.filter((entry) => entry.event === Events.SelectionChanged);
    expect(changed).toHaveLength(3);
    expect(changed.every((entry) => entry.byUser === true)).toBe(true);
    expect(names()).toContain('LeaveCell');
    expect(s.getSelections()[0]).toMatchObject({ row: 0, col: 0, rowCount: 2, colCount: 2 });
  });

  it('cancelling SelectionChanging on a user selection prevents the Changed event', () => {
    const wb = new Workbook();
    const s = wb.getActiveSheet();
    s.bind(Events.SelectionChanging, (_e: unknown, info) => { (info as { cancel: boolean }).cancel = true; });
    const { fired } = recorder(wb);
    s._userSetSelection(3, 3, 1, 1);
    expect(fired.filter((entry) => entry.event === Events.SelectionChanged)).toHaveLength(0);
    expect(s.getSelections()[0]).toMatchObject({ row: 0, col: 0 });
  });
});
