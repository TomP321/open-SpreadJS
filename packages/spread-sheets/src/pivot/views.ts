/**
 * `pivotTable.views` — `GC.Spread.Pivot.PivotTable.PivotTableViewManager`
 * (TASK 42 item 3). Names must match the d.ts: add/save/remove/get/all/apply.
 * The trial stores the views on the pivot table and writes them into the
 * sheet JSON `pivotTables[].views` entry.
 */
import type { IPivotTableView, ISerializeInfo } from './types.js';

export class PivotTableViewManager {
  private list: IPivotTableView[] = [];

  constructor(
    private applyCallback: (config: ISerializeInfo) => void,
    private saveCallback: () => ISerializeInfo,
  ) { }

  /** @internal used by the sheet JSON writer. */
  _list(): IPivotTableView[] { return this.list.slice(); }

  /** @internal used by the sheet JSON reader. */
  _restore(views: unknown): void {
    this.list = Array.isArray(views) ? views.filter(view => view && typeof view === 'object') as IPivotTableView[] : [];
  }

  add(view: IPivotTableView): boolean {
    if (!view || typeof view.name !== 'string' || !view.name) return false;
    if (this.get(view.name)) return false;
    this.list.push({ name: view.name, config: view.config });
    return true;
  }

  save(name: string): boolean {
    if (!name) return false;
    const config = this.saveCallback();
    const existing = this.get(name);
    if (existing) { existing.config = config; return true; }
    this.list.push({ name: String(name), config });
    return true;
  }

  remove(name: string): void {
    this.list = this.list.filter(view => view.name !== name);
  }

  get(name: string): IPivotTableView | undefined {
    return this.list.find(view => view.name === name);
  }

  all(): IPivotTableView[] { return this.list.slice(); }

  apply(name: string): void {
    const view = this.get(name);
    if (!view || !view.config) return;
    this.applyCallback(view.config);
  }
}
