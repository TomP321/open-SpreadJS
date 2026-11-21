/**
 * Row/column outlines (grouping). The trial stores per-axis entries with a
 * level, collapse flag and view-collapse flag, plus derived group runs that are
 * serialised as itemsData.
 *
 * Collapse state follows the trial: a group is the maximal run of entries whose
 * level is at least the group level, its rows carry `viewCollapsed`, and the
 * collapsed flag is stored on the entry directly after the run (created with
 * level -1 when that entry does not exist yet). `setCollapsed` additionally
 * marks the entry it is called on. `OutlineInfo` instances form a persistent
 * group tree (root -> level 0 groups -> nested groups) that is rebuilt lazily
 * after every mutation, so repeated `find` calls return the same object.
 */
import type { Worksheet } from '../worksheet.js';
import { _setColumnVisible, _setRowVisible } from '../sheet-layout.js';
import { instanceProperties } from '../not-implemented.js';
import { deserializeValue, type JsonRecord } from '../serialization.js';
import { GC } from '../generated/enums.js';

export interface OutlineItem {
  level: number;
  collapsed: boolean;
  viewCollapsed: boolean;
  _summary?: boolean;
}
interface GroupRun {
  index: number;
  count: number;
  info: { level: number; collapsed: boolean };
}

export class OutlineInfo {
  children: OutlineInfo[] = [];
  parent: OutlineInfo | null = null;
  model: Outline;
  start: number;
  end: number;
  level: number;
  constructor(model: Outline, start: number, end: number, level: number) {
    this.model = model;
    this.start = start;
    this.end = end;
    this.level = level;
  }
  addChild(child: object): void {
    const info = child as OutlineInfo;
    info.parent = this;
    this.children.push(child as OutlineInfo);
  }
  contains(index: number): boolean {
    return index >= this.start && index <= this.end;
  }
  state(value?: number): number | this {
    if (value === undefined) return this.model.getState(this);
    this.model.setCollapsed(this.start, value === 1);
    return this;
  }
}
instanceProperties(OutlineInfo, 'children', 'parent', 'model', 'start', 'end', 'level');

export class Outline {
  private items: (OutlineItem | null)[] = [];
  private axis: 'row' | 'col' = 'row';
  private sheet?: Worksheet;
  private suspended = false;
  /** `OutlineDirection.forward` (summary below/right), the trial's default. */
  private directionValue = 1;
  private rootInfo: OutlineInfo | null = null;
  /** Axis length from the constructor; internal, the trial does not expose it. */
  private _count: number;
  constructor(count = 0) {
    this._count = count;
  }
  _attach(sheet: Worksheet, axis: 'row' | 'col'): void {
    this.sheet = sheet;
    this.axis = axis;
    this.rootInfo = null;
  }
  private setVisible(index: number, visible: boolean): void {
    if (!this.sheet) return;
    // TASK 75 (Show/Hide Detail probes): outline mechanics change visibility without
    // materialising a `visible` record — only an explicit user show/hide serialises one.
    if (this.axis === 'row') _setRowVisible(this.sheet, index, visible, undefined, false);
    else _setColumnVisible(this.sheet, index, visible, undefined, false);
  }
  direction(direction?: number): number | this {
    if (direction === undefined) return this.directionValue;
    this.directionValue = direction;
    return this;
  }
  getLevel(index: number): number {
    return this.items[index]?.level ?? -1;
  }
  getCollapsed(index: number): boolean {
    return this.items[index]?.collapsed ?? false;
  }
  isCollapsed(index: number): boolean {
    return this.items[index]?.viewCollapsed ?? false;
  }
  getMaxLevel(): number {
    let max = -1;
    for (const item of this.items) if (item) max = Math.max(max, item.level);
    return max;
  }
  private ensure(index: number): OutlineItem {
    while (this.items.length <= index) this.items.push(null);
    let item = this.items[index];
    if (!item) this.items[index] = item = { level: 0, collapsed: false, viewCollapsed: false };
    return item;
  }
  /** The extent of the group whose level is the level of `index`. */
  private span(index: number): { start: number; end: number; level: number } | null {
    const level = this.getLevel(index);
    if (level < 0) return null;
    let start = index;
    while (start > 0 && this.getLevel(start - 1) >= level) start--;
    let end = index;
    while (this.getLevel(end + 1) >= level) end++;
    return { start, end, level };
  }
  /**
   * The entry that carries a group's collapsed flag. With the default
   * `forward` direction (summary below/right) it is the entry directly after the
   * group run; with `backward` (summary above/left) the one directly before it.
   * `-1` means there is no room for the flag (the group touches the axis start).
   */
  private markerIndex(group: { start: number; end: number }): number {
    return this.directionValue === 0 ? group.start - 1 : group.end + 1;
  }
  /** Rebuilds the group tree lazily (every mutation invalidates it). */
  private tree(): OutlineInfo {
    if (this.rootInfo) return this.rootInfo;
    const size = this.sheet
      ? this.axis === 'row'
        ? this.sheet.getRowCount()
        : this.sheet.getColumnCount()
      : this._count;
    const root = new OutlineInfo(this, 0, Math.max(0, size) - 1, -1);
    const attach = (node: OutlineInfo): void => {
      const childLevel = node.level + 1;
      for (let index = node.start; index <= node.end; index++) {
        if (this.getLevel(index) !== childLevel) continue;
        let end = index;
        while (end + 1 <= node.end && this.getLevel(end + 1) >= childLevel) end++;
        const child = new OutlineInfo(this, index, end, childLevel);
        child.parent = node;
        node.children.push(child);
        attach(child);
        index = end;
      }
    };
    attach(root);
    this.rootInfo = root;
    return root;
  }
  private invalidateTree(): void {
    this.rootInfo = null;
  }
  group(index: number, count: number): void {
    if (count <= 0) return;
    for (let i = index; i < index + count; i++) {
      const existing = this.items[i];
      if (existing && existing.level >= 0) existing.level += 1;
      else {
        const item = this.ensure(i);
        item.level = 0;
        item.collapsed = false;
        item.viewCollapsed = false;
      }
    }
    this.invalidateTree();
    this.sheet?.invalidateLayout();
  }
  ungroup(): void {
    this.items = [];
    this.invalidateTree();
    this.sheet?.invalidateLayout();
  }
  ungroupRange(index: number, count: number): void {
    // The trial drops one grouping level inside the range and keeps the entries
    // (their flags survive), so an outer group around the range stays grouped.
    for (let i = index; i < index + count; i++) {
      const item = this.items[i];
      if (item) item.level = Math.max(-1, item.level - 1);
    }
    this.invalidateTree();
    this.sheet?.invalidateLayout();
  }
  /**
   * Collapses or expands the whole group `index` belongs to. Collapsing hides
   * every entry of the group and stores the collapsed flag on the entry on the
   * summary side of the run (created with level -1 when missing), matching the
   * trial's serialised items; the summary side follows `direction`.
   * `setCollapsed` additionally marks the entry it is called on. Expanding
   * reveals the group except for entries that still belong to a collapsed
   * nested group.
   */
  setCollapsed(index: number, collapsed: boolean): void {
    const item = this.items[index];
    if (!item || (!collapsed && !item.viewCollapsed && !item.collapsed)) return;
    const group = this.span(index) ?? { start: index, end: index, level: item.level };
    const marker = this.markerIndex(group);
    if (collapsed) {
      item.collapsed = true;
      for (let i = group.start; i <= group.end; i++) {
        this.ensure(i).viewCollapsed = true;
        this.setVisible(i, false);
      }
      const existing = marker >= 0 ? this.items[marker] : undefined;
      const summary = existing ?? (marker >= 0 ? Object.assign(this.ensure(marker), { level: -1 }) : undefined);
      // The entry on the summary side carries the collapsed flag; an existing
      // entry keeps its own visibility (it may belong to a still-collapsed group).
      if (summary) {
        summary.collapsed = true;
        summary._summary = true;
        if (!existing) this.setVisible(marker, true);
      }
    } else {
      item.collapsed = false;
      const hidden = this.collapsedNestedRows(group, group.level);
      for (let i = group.start; i <= group.end; i++) {
        const entry = this.items[i];
        if (!entry) continue;
        if (hidden.has(i)) continue;
        entry.viewCollapsed = false;
        this.setVisible(i, true);
      }
      const summary = marker >= 0 ? this.items[marker] : undefined;
      if (summary) summary.collapsed = false;
    }
    this.invalidateTree();
    this.sheet?.invalidateLayout();
  }
  /** Entries inside `group` that belong to a nested group stored as collapsed. */
  private collapsedNestedRows(group: { start: number; end: number }, level: number): Set<number> {
    const hidden = new Set<number>();
    const walk = (from: number, to: number, base: number): void => {
      for (let index = from; index <= to; index++) {
        const entry = this.items[index];
        if (!entry || entry.level <= base) continue;
        let end = index;
        while (end + 1 <= to && (this.items[end + 1]?.level ?? -1) >= entry.level) end++;
        const marker = this.markerIndex({ start: index, end });
        if (marker >= 0 && this.items[marker]?.collapsed) for (let i = index; i <= end; i++) hidden.add(i);
        walk(index, end, entry.level);
        index = end;
      }
    };
    walk(group.start, group.end, level);
    return hidden;
  }
  expand(level: number, expand: boolean): void {
    const starts: number[] = [];
    for (let i = 0; i < this.items.length; i++) {
      const item = this.items[i];
      if (!item || item.level !== level) continue;
      if (i > 0 && this.getLevel(i - 1) >= level) continue;
      starts.push(i);
    }
    for (const index of starts) this.applySpan(this.span(index) ?? { start: index, end: index, level }, expand, level);
    this.invalidateTree();
    this.sheet?.invalidateLayout();
  }
  /**
   * @internal Designer Show-Detail semantics (TASK 75 r3 probe): expanding through the
   * ribbon also materialises the summary-side marker (`level: -1`, `collapsed: false`)
   * even when the group was never collapsed. The public `expand`/`expandGroup` keep the
   * trial's no-new-entry behaviour, so the designer calls this on top of them.
   */
  _touchSummaryMarker(index: number): void {
    const group = this.span(index);
    if (!group) return;
    const marker = this.markerIndex(group);
    if (marker < 0) return;
    const item = this.items[marker];
    if (!item) Object.assign(this.ensure(marker), { level: -1, collapsed: false, viewCollapsed: false });
    else item.collapsed = false;
    this.invalidateTree();
    this.sheet?.invalidateLayout();
  }
  expandGroup(groupInfo: OutlineInfo, expand: boolean): void {
    this.applySpan({ start: groupInfo.start, end: groupInfo.end, level: groupInfo.level }, expand, groupInfo.level);
    this.invalidateTree();
    this.sheet?.invalidateLayout();
  }
  private applySpan(
    group: { start: number; end: number; level: number },
    expand: boolean,
    level: number,
  ): void {
    const marker = this.markerIndex(group);
    if (expand) {
      const hidden = this.collapsedNestedRows(group, level);
      for (let i = group.start; i <= group.end; i++) {
        const entry = this.items[i];
        if (!entry) continue;
        if (hidden.has(i)) continue;
        entry.viewCollapsed = false;
        this.setVisible(i, true);
      }
      const summary = marker >= 0 ? this.items[marker] : undefined;
      if (summary && summary.level < level) summary.collapsed = false;
      return;
    }
    for (let i = group.start; i <= group.end; i++) {
      this.ensure(i).viewCollapsed = true;
      this.setVisible(i, false);
    }
    if (marker < 0) return;
    const existing = this.items[marker];
    const summary = existing ?? Object.assign(this.ensure(marker), { level: -1, viewCollapsed: false });
    summary.collapsed = true;
    if (!existing) this.setVisible(marker, true);
    else summary._summary = true;
  }
  /**
   * The group at `level` that contains `index` (`null` when there is none).
   * Nested groups form a tree, so the same group always yields the same object.
   */
  find(index: number, level: number): OutlineInfo | null {
    const root = this.tree();
    if (level < 0) return root.level === level && index >= root.start && index <= root.end ? root : null;
    let node = root;
    for (let l = 0; l <= level; l++) {
      const next = node.children.find((child) => index >= child.start && index <= child.end);
      if (!next) return null;
      node = next;
    }
    return node;
  }
  getState(groupInfo: OutlineInfo): number {
    // A collapsed group is flagged on the entry on its summary side.
    const marker = this.markerIndex(groupInfo);
    return (marker >= 0 && this.getCollapsed(marker)) || this.getCollapsed(groupInfo.start) ? 1 : 0;
  }
  isGroupEnd(index: number, processLevel: number): boolean {
    const run = this.groupAt(index);
    return !run && processLevel > 0;
  }
  refresh(): void {
    this.invalidateTree();
    this.sheet?.invalidateLayout();
  }
  suspendAdding(): void { this.suspended = true; }
  resumeAdding(): void { this.suspended = false; }
  /** Adjusts outline entries for inserted or removed axes. */
  _shift(index: number, amount: number, remove: boolean): void {
    if (!this.items.length) return;
    const next: (OutlineItem | null)[] = [];
    // Index loop (not for..of): items can be a sparse array after a shift.
    for (let i = 0; i < this.items.length; i++) {
      const item = this.items[i];
      if (!item) continue;
      if (remove && i >= index && i < index + amount) continue;
      const target = i >= index + (remove ? amount : 0) ? i + (remove ? -amount : amount) : i;
      next[target] = item;
    }
    this.items = next;
    this.invalidateTree();
  }
  /** Group runs used for rendering; collapse state does not split a group. */
  _runs(): GroupRun[] {
    const runs: GroupRun[] = [];
    for (let index = 0; index < this.items.length; index++) {
      const item = this.items[index];
      if (!item || item.level < 0) continue;
      const last = runs[runs.length - 1];
      if (last && last.index + last.count === index && last.info.level === item.level) last.count++;
      else runs.push({ index, count: 1, info: { level: item.level, collapsed: item.collapsed } });
    }
    return runs;
  }
  /** True when the group run starting at `index` is currently collapsed. */
  _collapsedAt(index: number): boolean {
    const item = this.items[index];
    return !!item && (item.collapsed || item.viewCollapsed);
  }
  _item(index: number): OutlineItem | null | undefined {
    return this.items[index];
  }
  _hasAny(): boolean {
    return this.items.some((item) => item !== null);
  }
  toJSON(): JsonRecord {
    const result: JsonRecord = this.directionValue === 1 ? {} : { direction: this.directionValue };
    if (!this.items.length) return { ...result, items: [] };
    const items = this.items.map((item) =>
      item ? { level: item.level, collapsed: item.collapsed, viewCollapsed: item.viewCollapsed } : null,
    );
    result.items = items;
    const runs = this.groups();
    if (runs.length) result.itemsData = runs.map((run) => ({ index: run.index, count: run.count, info: run.info }));
    return result;
  }
  fromJSON(data: unknown): void {
    const json = data as JsonRecord;
    const direction = Number(json.direction);
    this.directionValue = Number.isFinite(direction) ? direction : 1;
    this.items = [];
    for (const raw of Array.isArray(json.items) ? json.items : []) {
      if (!raw) {
        this.items.push(null);
        continue;
      }
      const item = deserializeValue(raw) as JsonRecord;
      this.items.push({
        level: Number(item.level ?? -1),
        collapsed: !!item.collapsed,
        viewCollapsed: !!item.viewCollapsed,
      });
    }
    // Restore row visibility for view-collapsed entries.
    this.items.forEach((item, index) => {
      if (item && item.viewCollapsed) this.setVisible(index, false);
    });
    this.invalidateTree();
  }
  _clear(): void {
    this.items = [];
    this.invalidateTree();
  }
  private groups(): GroupRun[] {
    const runs: GroupRun[] = [];
    for (let index = 0; index < this.items.length; index++) {
      const item = this.items[index];
      if (!item) continue;
      const last = runs[runs.length - 1];
      if (
        last &&
        last.index + last.count === index &&
        last.info.level === item.level &&
        last.info.collapsed === item.collapsed
      )
        last.count++;
      else runs.push({ index, count: 1, info: { level: item.level, collapsed: item.collapsed } });
    }
    return runs;
  }
  private groupAt(index: number): GroupRun | undefined {
    return this.groups().find((run) => run.index === index && run.info.level >= 0);
  }
}
void GC;
