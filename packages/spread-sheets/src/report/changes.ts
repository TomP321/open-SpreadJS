export type Field = { dbColumnName: string; formula: string; isPrimary?: boolean };
export type Rule = { name: string; tableName: string; fields: Field[]; includeUnmodified?: boolean;
  skipRecordWithEmptyValue?: boolean };
export type FieldInfo = { state: 'normal' | 'new' | 'updated'; row: number; col: number; oldValue?: unknown };
export type RecordInfo = { entity: Record<string, unknown>; info: Record<string, FieldInfo> };
export type Change = { records: RecordInfo[]; deleteRecords: RecordInfo[]; rule: Rule };
export type Cell = { field: string; row: number; col: number; value: unknown };
/**
 * How the trial binds a report row to a data record (TASK 48 probes `report-entry-probe`):
 * - `cells` resolves every requested field to the cell that carries the row's record value:
 *   the row's own instance cell, or - for a blank inserted row and for rows covered by a group
 *   span - the covering group header. A blank pending row keeps its own empty cell for a
 *   non-primary field (reported with state `new`) but falls back to the covering header for a
 *   primary field, never to the nearest plain record cell above.
 * - `covering` holds the primary values resolved from above: the group block the record writes
 *   into (a pending insert inside a group block belongs to that group).
 * - `dataIndex` is the index of the data record the row displays in the sheet's data order
 *   (filled instance rows at or above the row).
 */
export type RecordRef = { anchor: number; pendingNew: boolean; cells: Cell[]; covering: Map<string, unknown>;
  dataIndex: number };
type Sheet = { getValue(row: number, col: number): unknown; setValue(row: number, col: number, value: unknown): void;
  /** Report rows that display a data record (the generated cells of every bound vertical field). */
  boundDataRows(): number[] };
export type ResolveRecord = (row: number, fields: Field[], forDelete: boolean) => RecordRef | undefined;
export type TableRows = () => Record<string, unknown>[];
type Pending = { row: number; col: number; dropped: boolean };
type Claim = { rule: string; primaries: { name: string; value: unknown; row: number; col: number }[];
  sig: string; target: number };

const empty = (value: unknown): boolean => value === null || value === undefined || value === '';
const sigOf = (values: Map<string, unknown>): string =>
  [...values].map(([name, value]) => `${name}=${JSON.stringify(value)}`).join('&');

/**
 * The data-entry change set of a report sheet (TASK 48, trial probes e1..e12/ed1..ed9):
 * - A blank row inserted by `addRecordAt` is a pending record. Ungrouped and unedited it is not
 *   a change at all; inside a group block it already resolves the block's primary values, which
 *   makes it dirty with its own empty cells reported as `new`.
 * - Editing a filled cell records `updated` with the previous value as `oldValue`; restoring the
 *   original value clears the change. Editing a pending blank cell turns it to `updated` too.
 * - A record collects the rule fields resolved on its report row (see `RecordRef`); a record is
 *   reported only when it carries a changed cell, the rule has `includeUnmodified`, or the row is
 *   a pending insert that resolves all the rule's primary values.
 * - Records with equal primary values bind the same data record: the first report row (topmost)
 *   wins and later duplicates are dropped (trial e8).
 * - A delete click on a blank pending row discards the pending record and its edits (trial ed1).
 * - Otherwise the click records the rule's primary values (resolved own-cell or covering header,
 *   only when every primary resolves non-empty) and claims the first table row matching them.
 * - Cancel rules (trial e11/ed5/ed6): a delete claim whose primary values match another live
 *   record (an edited row or a pending insert that resolves the primaries) is discarded - the
 *   other record keeps its own claim on that data record. Cancel rule (trial e3/ed9): with a
 *   claim recorded, an edited pending insert that resolves no primary value cancels out with it.
 */
export class ReportChanges {
  private originals = new Map<string, unknown>();
  private pendings: Pending[] = [];
  private deletes: Claim[] = [];
  constructor(private sheet: Sheet, private rules: () => object[] | undefined, private resolve?: ResolveRecord) {}
  update(row: number, col: number, value: unknown): void {
    const key = `${row},${col}`;
    if (!this.originals.has(key)) this.originals.set(key, this.sheet.getValue(row, col));
    this.sheet.setValue(row, col, value);
    if (Object.is(this.originals.get(key), value)) this.originals.delete(key);
  }
  reset(row: number, col: number): void {
    const key = `${row},${col}`;
    if (this.originals.has(key)) this.sheet.setValue(row, col, this.originals.get(key));
    this.originals.delete(key);
  }
  clear(): void { this.originals.clear(); this.pendings = []; this.deletes = []; }
  isInserted(row: number): boolean { return this.pendings.some(item => item.row === row && !item.dropped); }
  isEdited(row: number, col: number): boolean { return this.originals.has(`${row},${col}`); }
  insert(row: number, col: number): void {
    this.shift(row, 1);
    this.pendings.push({ row, col, dropped: false });
  }
  remove(row: number, col: number, tableRows: TableRows): void {
    const pending = this.pendings.find(item => item.row === row && !item.dropped);
    if (pending) {
      // Deleting the blank row itself discards the pending record and its edits (trial ed1/e4).
      pending.dropped = true;
      this.dropEditedCells(row);
    } else {
      const rules = (this.rules() ?? []) as Rule[];
      const claims: Claim[] = [];
      for (const rule of rules) {
        const primaries: { name: string; value: unknown; row: number; col: number }[] = [];
        for (const field of rule.fields.filter(item => item.isPrimary)) {
          const ref = this.resolve?.(row, [field], true);
          const cell = ref?.cells.find(item => item.field === field.dbColumnName) ?? ref?.cells[0];
          if (!cell || !ref) continue;
          const value = !empty(cell.value) ? cell.value : ref.covering.get(field.dbColumnName);
          if (!empty(value)) primaries.push({ name: field.dbColumnName, value, row: cell.row, col: cell.col });
        }
        if (!primaries.length) continue;
        const sig = sigOf(new Map(primaries.map(item => [item.name, item.value])));
        if (claims.some(claim => claim.rule === rule.name && claim.sig === sig)) continue;
        const ref = this.resolve?.(row, rule.fields, true);
        claims.push({ rule: rule.name, primaries, sig, target: ref?.dataIndex ?? row });
      }
      const taken = new Set<number>();
      for (const claim of claims) {
        const match = tableRows().map((row2, index) => ({ row2, index })).find(entry =>
          !taken.has(entry.index) && claim.primaries.every(primary => Object.is(entry.row2[primary.name], primary.value)));
        claim.target = match ? match.index : claim.target;
        taken.add(claim.target);
      }
      // Cancel rule (trial e11/ed5/ed6): another live record already claiming the same primary
      // values wins, and this delete is discarded.
      const sigs = new Map<string, Set<string>>();
      const addSigs = (at: number): void => {
        for (const rule of rules) {
          const values = this.primaryValues(at, rule);
          if (!values.size) continue;
          const set = sigs.get(rule.name) ?? new Set<string>();
          set.add(sigOf(values));
          sigs.set(rule.name, set);
        }
      };
      for (const item of this.pendings) if (!item.dropped && item.row !== row) addSigs(item.row);
      for (const edited of this.editedRows()) if (edited !== row) addSigs(edited);
      const kept = claims.filter(claim => !sigs.get(claim.rule)?.has(claim.sig));
      // Cancel rule (trial e3/ed9): with a claim kept for a rule, an edited pending insert that
      // resolves no primary value of that rule cancels out with the deleted record it filled in.
      if (kept.length) for (const item of this.pendings) {
        if (item.dropped || item.row === row || !this.rowEdited(item.row)) continue;
        if (kept.some(claim => !this.primaryValues(item.row, rules.find(rule => rule.name === claim.rule)!).size)) {
          item.dropped = true;
          this.dropEditedCells(item.row);
        }
      }
      this.deletes.push(...kept);
    }
    this.shift(row, -1);
  }
  /**
   * The rule's primary values a report row resolves (own cell first, else the covering group
   * block); an empty map when the row cannot resolve every primary non-empty (then the row has
   * no claim on any data record).
   */
  private primaryValues(row: number, rule: Rule): Map<string, unknown> {
    const values = new Map<string, unknown>();
    const fields = rule.fields.filter(field => field.isPrimary);
    if (!fields.length || !this.resolve) return values;
    const ref = this.resolve(row, fields, false);
    if (!ref) return values;
    for (const field of fields) {
      const cell = ref.cells.find(item => item.field === field.dbColumnName);
      const value = cell && !empty(cell.value) ? cell.value : ref.covering.get(field.dbColumnName);
      if (!cell || empty(value)) return new Map();
      values.set(field.dbColumnName, value);
    }
    return values;
  }
  private editedRows(): number[] {
    return [...new Set([...this.originals.keys()].map(key => Number(key.split(',')[0])))].sort((a, b) => a - b);
  }
  private rowEdited(row: number): boolean {
    return [...this.originals.keys()].some(key => Number(key.split(',')[0]) === row);
  }
  private dropEditedCells(row: number): void {
    for (const key of [...this.originals.keys()]) if (Number(key.split(',')[0]) === row) this.originals.delete(key);
  }
  private recordCells(row: number, fields: Field[]): Map<string, Cell> {
    const resolved = new Map<string, Cell>();
    if (this.resolve) {
      const ref = this.resolve(row, fields, false);
      if (ref) for (const cell of ref.cells) resolved.set(cell.field, cell);
    }
    if (!resolved.size) {
      for (const field of fields) {
        const pos = address(field.formula);
        if (!pos) continue; // an expression formula binds no report cell (trial e14)
        resolved.set(field.dbColumnName, { field: field.dbColumnName, row, col: pos[1], value: this.sheet.getValue(row, pos[1]) });
      }
    }
    return resolved;
  }
  private shift(row: number, delta: 1 | -1): void {
    const originals = new Map<string, unknown>();
    for (const [key, value] of this.originals) {
      const [r, c] = key.split(',').map(Number) as [number, number];
      if (delta === -1 && r === row) continue;
      originals.set(`${r >= row ? r + delta : r},${c}`, value);
    }
    this.originals = originals;
    const map = (value: number): number => (delta === -1 && value === row ? -1 : value >= row ? value + delta : value);
    for (const pending of this.pendings) pending.row = pending.row >= 0 ? map(pending.row) : pending.row;
    this.pendings = this.pendings.filter(pending => pending.row >= 0);
  }
  /**
   * Table row indexes the recorded deletes remove, resolved against the live table rows in
   * submission order: the first remaining row matching each claim's recorded primary values
   * (trial), falling back to the record index captured when the click happened.
   */
  deleteClaims(tableRows: Record<string, unknown>[]): number[] {
    const taken = new Set<number>();
    for (const claim of this.deletes) {
      const match = tableRows.map((row, index) => ({ row, index })).find(entry => !taken.has(entry.index) &&
        claim.primaries.every(primary => Object.is(entry.row[primary.name], primary.value)));
      taken.add(match ? match.index : claim.target);
    }
    return [...taken].filter(index => index >= 0 && index < tableRows.length).sort((a, b) => b - a);
  }
  get(): Change[] {
    return ((this.rules() ?? []) as Rule[]).map(rule => {
      const records = new Map<string, RecordInfo>();
      const claimed = new Set<string>();
      const rows = new Set<number>(this.editedRows());
      for (const item of this.pendings)
        if (!item.dropped && this.primaryValues(item.row, rule).size) rows.add(item.row);
      if (rule.includeUnmodified) for (const row of this.sheet.boundDataRows()) rows.add(row);
      for (const row of [...rows].sort((a, b) => a - b)) {
        const pendingNew = this.pendings.some(item => item.row === row && !item.dropped);
        const resolved = this.recordCells(row, rule.fields);
        const primaries = this.primaryValues(row, rule);
        const sig = primaries.size ? sigOf(primaries) : undefined;
        const changed = [...resolved.values()].some(cell => this.originals.has(`${cell.row},${cell.col}`));
        // A pending insert binds no data record until it resolves every primary value (trial e3/e12).
        if (pendingNew && !sig) continue;
        if (!changed && !rule.includeUnmodified && !(pendingNew && sig)) continue;
        if (sig) {
          if (claimed.has(sig)) continue;
          claimed.add(sig);
        }
        const entity: Record<string, unknown> = {};
        const info: Record<string, FieldInfo> = {};
        let hasEmpty = false;
        for (const field of rule.fields) {
          const cell = resolved.get(field.dbColumnName);
          if (!cell) continue;
          const cellKey = `${cell.row},${cell.col}`;
          const changedCell = this.originals.has(cellKey);
          const own = cell.row === row;
          const state: FieldInfo['state'] =
            changedCell ? 'updated' : pendingNew && own && empty(cell.value) ? 'new' : 'normal';
          if (empty(cell.value)) hasEmpty = true;
          if (!empty(cell.value) || changedCell) entity[field.dbColumnName] = cell.value;
          const previous = changedCell ? this.originals.get(cellKey) : undefined;
          info[field.dbColumnName] = {
            ...(changedCell && !empty(previous) ? { oldValue: previous } : {}),
            state, row: cell.row, col: cell.col,
          };
        }
        if (rule.skipRecordWithEmptyValue && hasEmpty) continue;
        if (Object.keys(info).length) records.set(sig ?? `row:${row}`, { entity, info });
      }
      const deleteRecords: RecordInfo[] = this.deletes.filter(claim => claim.rule === rule.name).map(claim => {
        const entity: Record<string, unknown> = {};
        const info: Record<string, FieldInfo> = {};
        for (const primary of claim.primaries) {
          entity[primary.name] = primary.value;
          info[primary.name] = { state: 'normal', row: primary.row, col: primary.col };
        }
        return { entity, info };
      });
      return { records: [...records.values()], deleteRecords, rule };
    });
  }
  isDirty(): boolean { return this.get().some(change => change.records.length > 0 || change.deleteRecords.length > 0); }
}

function address(formula: string): [number, number] | undefined {
  const match = /^\$?([A-Z]+)\$?(\d+)$/i.exec(formula);
  if (!match) return undefined;
  const col = [...match[1]!.toUpperCase()].reduce((sum, char) => sum * 26 + char.charCodeAt(0) - 64, 0) - 1;
  return [Number(match[2]) - 1, col];
}
