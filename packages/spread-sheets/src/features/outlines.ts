/**
 * Row/column outlines (grouping). The trial stores per-axis entries with a
 * level, collapse flag and view-collapse flag, plus derived group runs that are
 * serialised as itemsData.
 */
import type { Worksheet } from '../model.js';
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
  constructor(
    public model: Outline,
    public start: number,
    public end: number,
    public level: number,
  ) {}
  addChild(child: object): void {
    const info = child as OutlineInfo;
    info.parent = this;
    this.children.push(info);
  }
  contains(index: number): boolean {
    return index >= this.start && index <= this.end;
  }
  state(value?: number): number | this {
    if (value === undefined) return this.model.getCollapsed(this.start) ? 1 : 0;
    this.model.setCollapsed(this.start, value === 1);
    return this;
  }
}

export class Outline {
  private items: (OutlineItem | null)[] = [];
  private axis: 'row' | 'col' = 'row';
  private sheet?: Worksheet;
  private suspended = false;
  private directionValue = 0;
  constructor(public count = 0) {}
  _attach(sheet: Worksheet, axis: 'row' | 'col'): void {
    this.sheet = sheet;
    this.axis = axis;
  }
  private setVisible(index: number, visible: boolean): void {
    if (!this.sheet) return;
    if (this.axis === 'row') this.sheet.setRowVisible(index, visible);
    else this.sheet.setColumnVisible(index, visible);
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
    this.sheet?.invalidateLayout();
  }
  ungroup(): void {
    this.items = [];
    this.sheet?.invalidateLayout();
  }
  ungroupRange(index: number, count: number): void {
    for (let i = index; i < index + count; i++) if (this.items[i]) this.items[i] = null;
    while (this.items.length && !this.items[this.items.length - 1]) this.items.pop();
    this.sheet?.invalidateLayout();
  }
  setCollapsed(index: number, collapsed: boolean): void {
    const item = this.items[index];
    if (!item) return;
    if (!collapsed && !item.viewCollapsed) return;
    // Determine the extent of the group: while collapsing use contiguous rows
    // at the same level, while expanding follow the viewCollapsed flags.
    let count = 0;
    if (collapsed) {
      const level = item.level;
      for (let i = index; i < this.items.length; i++) {
        const entry = this.items[i];
        if (!entry || entry.level !== level) break;
        count++;
      }
    } else {
      for (let i = index; i < this.items.length; i++) {
        const entry = this.items[i];
        if (!entry || !entry.viewCollapsed) break;
        count++;
      }
      if (!count) count = 1;
    }
    item.collapsed = !!collapsed;
    item.viewCollapsed = !!collapsed;
    for (let i = index; i < index + count; i++) {
      const entry = this.items[i];
      if (entry) entry.viewCollapsed = !!collapsed;
      this.setVisible(i, !collapsed);
    }
    const summary = this.ensure(index + count);
    if (summary.level !== -1) summary.level = -1;
    summary.collapsed = !!collapsed;
    summary.viewCollapsed = false;
    summary._summary = true;
    this.setVisible(index + count, true);
    this.sheet?.invalidateLayout();
  }
  expand(level: number, expand: boolean): void {
    for (let i = 0; i < this.items.length; i++) {
      const item = this.items[i];
      if (!item || item.level < 0 || item.level < level) continue;
      this.setCollapsed(i, !expand);
    }
  }
  expandGroup(groupInfo: OutlineInfo, expand: boolean): void {
    this.setCollapsed(groupInfo.start, !expand);
  }
  find(index: number, level: number): OutlineInfo | null {
    const run = this.groupAt(index);
    if (!run || run.info.level !== level) return null;
    return new OutlineInfo(this, run.index, run.index + run.count - 1, level);
  }
  getState(groupInfo: OutlineInfo): number {
    return this.getCollapsed(groupInfo.start) ? 1 : 0;
  }
  isGroupEnd(index: number, processLevel: number): boolean {
    const run = this.groupAt(index);
    return !run && processLevel > 0;
  }
  refresh(): void {
    this.sheet?.invalidateLayout();
  }
  suspendAdding(): void { this.suspended = true; }
  resumeAdding(): void { this.suspended = false; }
  /** Adjusts outline entries for inserted or removed axes. */
  _shift(index: number, amount: number, remove: boolean): void {
    if (!this.items.length) return;
    const entries = this.items.map((item, i) => [i, item] as const);
    const next: (OutlineItem | null)[] = [];
    for (const [i, item] of entries) {
      if (!item) continue;
      if (remove && i >= index && i < index + amount) continue;
      const target = i >= index + (remove ? amount : 0) ? i + (remove ? -amount : amount) : i;
      next[target] = item;
    }
    this.items = next;
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
  _item(index: number): OutlineItem | null | undefined {
    return this.items[index];
  }
  _hasAny(): boolean {
    return this.items.some((item) => item !== null);
  }
  toJSON(): JsonRecord {
    if (!this.items.length) return { items: [] };
    const items = this.items.map((item) =>
      item ? { level: item.level, collapsed: item.collapsed, viewCollapsed: item.viewCollapsed } : null,
    );
    const result: JsonRecord = { items };
    const runs = this.groups();
    if (runs.length) result.itemsData = runs.map((run) => ({ index: run.index, count: run.count, info: run.info }));
    return result;
  }
  fromJSON(data: unknown): void {
    const json = data as JsonRecord;
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
  }
  _clear(): void {
    this.items = [];
  }
}
void GC;
