// TASK 44 item 4 — GC.Spread.Sheets.Collaboration offline model.
// The trial core does not expose Collaboration (probes `coll:*`: 'no-ns' /
// 'no-collab'; the feature ships in an add-on that is not installed in
// apps/compare). Expected values are therefore derived from the public core
// d.ts contract and the documented examples — recorded in docs/STATUS.md.
import { describe, expect, it } from 'vitest';
import GC from '../src/index.js';

const { Workbook } = GC.Spread.Sheets;
const NS = GC.Spread.Sheets.Collaboration;
const { Collaboration } = NS;

describe('Collaboration namespace (core d.ts contract)', () => {
  it('exposes the Collaboration class with all thirteen declared members', () => {
    expect(typeof Collaboration).toBe('function');
    expect(NS.BrowsingMode).toMatchObject({ edit: 0, view: 1 });
    expect(NS.PermissionTypes).toMatchObject({
      allowNonDataModifyingOperations: 1, allowHideRowsOrColumns: 2, allowResizeRowsOrColumns: 4, allowFilter: 8, allowSort: 16,
    });
    expect(NS.OpType.setValueForRemoteOp).toBe(75);
    const proto = Object.getOwnPropertyNames(Collaboration.prototype);
    for (const name of ['applyChangeSet', 'endBatchOp', 'fromSnapshot', 'getPermission', 'getPresences', 'getUser', 'onChangeSet', 'registerCollaborationType', 'setPermission', 'setPresences', 'setUser', 'startBatchOp', 'toSnapshot']) {
      expect(proto, name).toContain(name);
    }
  });

  it('Workbook carries a collaboration instance', () => {
    const wb = new Workbook();
    expect(wb.collaboration).toBeInstanceOf(Collaboration);
    wb.destroy();
  });
});

describe('permission / user / presences storage', () => {
  it('getPermission defaults to edit mode and round-trips setPermission', () => {
    const wb = new Workbook();
    const c = wb.collaboration;
    expect(c.getPermission()).toEqual({ mode: 0 });
    c.setPermission({ mode: 1, viewModePermissions: 3 });
    expect(c.getPermission()).toEqual({ mode: 1, viewModePermissions: 3 });
    wb.destroy();
  });

  it('presences start empty and setPresences/getPresences round-trip', () => {
    const wb = new Workbook();
    const c = wb.collaboration;
    expect(c.getPresences()).toEqual([]);
    const presences = [
      { user: { id: '1', name: 'User1', color: '#FF0000' }, status: { selections: { selections: [{ row: 0, col: 0, rowCount: 1, colCount: 1 }], sheetId: 'sheet1' } } },
      { user: { id: '2', name: 'User2' }, status: { selections: { selections: [{ row: 2, col: 2, rowCount: 3, colCount: 5 }], sheetId: 'sheet1' } } },
    ];
    c.setPresences(presences as never);
    expect(c.getPresences()).toEqual(JSON.parse(JSON.stringify(presences)));
    wb.destroy();
  });

  it('setUser/getUser round-trips; unset users fall back to the guest identity plus permission (deprecated getUser semantics)', () => {
    const wb = new Workbook();
    const c = wb.collaboration;
    const initial = c.getUser();
    expect(typeof initial.id).toBe('string');
    expect(initial.permission).toEqual({ mode: 0 });
    c.setUser({ id: 'u1', name: 'Alice', color: '#ff0000', permission: { mode: 1 } } as never);
    expect(c.getUser()).toEqual({ id: 'u1', name: 'Alice', color: '#ff0000', permission: { mode: 1 } });
    // setUser also carries its permission into the workbook (d.ts: "Sets the current user and permission").
    expect(c.getPermission()).toEqual({ mode: 1 });
    wb.destroy();
  });
});

describe('batch operations and change sets', () => {
  it('startBatchOp/setValue/setFormula/endBatchOp merge into one ChangeSet delivered to onChangeSet', () => {
    const wb = new Workbook();
    const s = wb.getActiveSheet();
    const c = wb.collaboration;
    const sets: { ops: unknown[] }[] = [];
    c.onChangeSet((cs) => sets.push(cs));
    s.setValue(0, 0, 'outside'); // not batched: nothing is reported
    expect(sets).toHaveLength(0);
    c.startBatchOp();
    s.setValue(0, 1, 'World');
    s.setFormula(0, 2, '=SUM(A1:B1)');
    c.endBatchOp();
    expect(sets).toHaveLength(1); // the documented merge: both edits land in a single ChangeSet
    const ops = sets[0]!.ops as { type: number; sheetName: string; row: number; col: number; value: unknown }[];
    expect(ops).toHaveLength(2);
    expect(ops.map((o) => [o.type, o.sheetName, o.row, o.col, o.value])).toEqual([
      [NS.OpType.setValueForRemoteOp, s.name(), 0, 1, 'World'],
      [NS.OpType.setValueForRemoteOp, s.name(), 0, 2, '=SUM(A1:B1)'],
    ]);
    wb.destroy();
  });

  it('applyChangeSet replays a captured ChangeSet symmetrically', () => {
    const wb = new Workbook();
    const s = wb.getActiveSheet();
    const c = wb.collaboration;
    const sets: { ops: unknown[] }[] = [];
    c.onChangeSet((cs) => sets.push(cs as never));
    c.startBatchOp();
    s.setValue(1, 1, 'captured');
    c.endBatchOp();
    s.setValue(1, 1, 'overwritten');
    c.applyChangeSet(sets[0] as never);
    expect(s.getValue(1, 1)).toBe('captured');
    c.applyChangeSet({ ops: [] }); // empty change set is a no-op
    expect(s.getValue(1, 1)).toBe('captured');
    wb.destroy();
  });

  it('registerCollaborationType accepts the OT type record without throwing', () => {
    const wb = new Workbook();
    const c = wb.collaboration;
    const transform = (a: unknown) => a;
    c.registerCollaborationType({ uri: 'urn:opensheets:test', transform } as never);
    expect(c._collaborationTypes()).toHaveLength(1);
    wb.destroy();
  });
});

describe('snapshot round-trip', () => {
  it('toSnapshot captures the workbook and fromSnapshot restores it', async () => {
    const wb = new Workbook();
    const s = wb.getActiveSheet();
    const c = wb.collaboration;
    s.setValue(1, 1, 'orig');
    s.setFormula(2, 2, '=1+1');
    const snapshot = c.toSnapshot();
    expect(typeof snapshot).toBe('object');
    s.setValue(1, 1, 'changed');
    c.fromSnapshot(snapshot);
    await new Promise((resolve) => setTimeout(resolve, 50)); // fromSnapshot drives the async JSON load
    // fromJSON rebuilds the sheet list (like the trial), so read through the workbook.
    expect(wb.getActiveSheet().getValue(1, 1)).toBe('orig');
    expect(wb.getActiveSheet().getFormula(2, 2)).toBe('1+1');
    wb.destroy();
  });
});
