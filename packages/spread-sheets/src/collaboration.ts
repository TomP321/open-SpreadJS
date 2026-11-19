// GC.Spread.Sheets.Collaboration — offline model semantics (TASK 44 item 4).
// Contract: core d.ts `Collaboration` namespace (Collaboration class with the
// 13 declared members, BrowsingMode/OpType/PermissionTypes enums).
// WHY CONTRACT-DERIVED (docs/STATUS.md): the official CORE runtime does not
// expose this namespace at all — probe `coll:ns` shows `GC.Spread.Sheets.
// Collaboration` is `undefined` in the trial page, and `wb.collaboration`
// throws nothing because the property does not exist (`coll:wb`: 'no-ns').
// The real collaboration engine ships in the `@mescius/spread-sheets-
// collaboration` add-on, which is not installed in apps/compare (installing
// new packages is not allowed in this task), so no black-box values exist for
// any member. The implementation below provides the offline-workable model:
// user/permission/presence storage, local batch-op capture (the documented
// startBatchOp/setValue/endBatchOp example), symmetric applyChangeSet for the
// captured op shape, JSON snapshot round-trip, and collaboration-type
// registration. Server-side pieces that cannot work offline (OT transforms
// against a remote history, presence broadcasting, permission ENFORCEMENT of
// remote clients) stay partial and are recorded in docs/STATUS.md.

import type { Workbook } from './workbook.js';
import { GC as Enums } from './generated/enums.js';
import { UserManager } from './user-manager.js';

/** `OpType.setValueForRemoteOp` (core d.ts enum, value 75). */
const SET_VALUE_OP = Enums.Spread.Sheets.Collaboration.OpType.setValueForRemoteOp as number;

export interface CollaborationPermission {
  mode?: number;
  viewModePermissions?: number;
}

export interface CollaborationPresence {
  user?: { id: string; name?: string; color?: string };
  status?: { selections?: { selections?: { row: number; col: number; rowCount: number; colCount: number }[]; sheetId?: string } };
}

export interface CollaborationUser {
  id: string;
  name?: string;
  color?: string;
  permission?: CollaborationPermission;
  [key: string]: unknown;
}

export interface ChangeSetOp {
  type: number;
  sheetName: string;
  row: number;
  col: number;
  value: unknown;
}

export interface ChangeSet {
  ops: ChangeSetOp[];
}

export interface CollaborationType {
  uri?: string;
  transform?: (op1: ChangeSet, op2: ChangeSet, side: 'left' | 'right') => ChangeSet;
  transformX?: (op1: ChangeSet, op2: ChangeSet, side: 'left' | 'right') => ChangeSet[];
}

export class Collaboration {
  private permission: CollaborationPermission = { mode: Enums.Spread.Sheets.Collaboration.BrowsingMode.edit as number };
  private presences: CollaborationPresence[] = [];
  private user?: CollaborationUser;
  private handlers: ((changeSet: ChangeSet) => void)[] = [];
  private types: CollaborationType[] = [];
  private batch: ChangeSetOp[] | undefined;

  constructor(private readonly workbook: Workbook) {}

  applyChangeSet(changeSet: ChangeSet): void {
    for (const op of changeSet?.ops ?? []) {
      if (op.type !== SET_VALUE_OP) continue; // other op kinds: recorded partial (server-side semantics)
      const sheet = this.workbook.getSheetFromName(op.sheetName);
      if (!sheet) continue;
      sheet.setValue(op.row, op.col, op.value);
    }
  }

  endBatchOp(): void {
    if (!this.batch) return;
    const changeSet: ChangeSet = { ops: this.batch };
    this.batch = undefined;
    for (const sheet of this.workbook.sheets) sheet._collabRecord = false;
    for (const handler of [...this.handlers]) handler(changeSet);
  }

  fromSnapshot(snapshot: object): void {
    if (snapshot === undefined || snapshot === null) return;
    void this.workbook.fromJSON(structuredClone(snapshot) as never);
  }

  getPermission(): CollaborationPermission {
    return structuredClone(this.permission);
  }

  getPresences(): CollaborationPresence[] {
    return structuredClone(this.presences);
  }

  getUser(): CollaborationUser {
    if (this.user) return structuredClone(this.user);
    // Deprecated alias: the current user resolved through GC.Spread.Common.
    // UserManager plus the workbook permission.
    const id = UserManager.current()!;
    return { id, name: 'Guest', permission: structuredClone(this.permission) };
  }

  onChangeSet(onOpHandler: (changeSet: ChangeSet) => void): void {
    if (typeof onOpHandler === 'function') this.handlers.push(onOpHandler);
  }

  registerCollaborationType(type: CollaborationType): void {
    this.types.push(type);
  }

  setPermission(permission: CollaborationPermission): void {
    this.permission = { ...permission };
  }

  setPresences(presences: CollaborationPresence[]): void {
    this.presences = structuredClone(presences ?? []);
  }

  setUser(user: CollaborationUser): void {
    this.user = structuredClone(user);
    if (user?.permission) this.permission = { ...user.permission };
  }

  /**
   * Value writes recorded through the public `Worksheet.setValue` /
   * `Worksheet.setFormula` wrappers while a batch is open (mirrors the d.ts
   * example where both calls merge into one ChangeSet).
   */
  startBatchOp(): void {
    this.batch ??= [];
    for (const sheet of this.workbook.sheets) sheet._collabRecord = true;
  }

  toSnapshot(): object {
    return structuredClone(this.workbook.toJSON()) as object;
  }

  /** @internal Registered collaboration types (introspection for tests). */
  _collaborationTypes(): CollaborationType[] {
    return this.types.slice();
  }

  /** @internal Called by the Worksheet value wrappers while a batch is open. */
  _recordValue(sheetName: string, row: number, col: number, value: unknown): void {
    if (!this.batch) return;
    this.batch.push({ type: SET_VALUE_OP, sheetName, row, col, value: cloneValue(value) });
  }
}

function cloneValue(value: unknown): unknown {
  if (value === null || value === undefined) return value ?? null;
  if (typeof value === 'object') {
    try {
      return structuredClone(value);
    } catch {
      return value;
    }
  }
  return value;
}
