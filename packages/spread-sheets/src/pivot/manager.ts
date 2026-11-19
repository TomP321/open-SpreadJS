/**
 * `worksheet.pivotTables` — the sheet-scoped pivot table manager
 * (TASK 41 item 1). Names must be unique across the whole workbook.
 */
import { Range } from '../primitives.js';
import { PivotTable, PivotSheet } from './pivot-table.js';
import { PivotTableTheme } from './theme.js';
import { lettersToIndex } from './source.js';
import type { IPivotAreasCollection, IPivotTableOption, PivotSource } from './types.js';
import { PivotTableLayoutType } from './types.js';

export class PivotTableManager {
  private tables: PivotTable[] = [];
  private customSortList: string[] = [];
  constructor(private sheet: PivotSheet & object) { /* registered per worksheet */ }

  /** @internal */
  _attach(table: PivotTable): void {
    if (!this.tables.includes(table)) this.tables.push(table);
  }

  /** @internal */
  _detach(table: PivotTable): void {
    const index = this.tables.indexOf(table);
    if (index >= 0) this.tables.splice(index, 1);
  }

  /** @internal */
  _rename(oldName: string, newName: string): void {
    void oldName; void newName;
  }

  /** @internal Whether the sheet has any pivot table (serialization fast path). */
  _hasAny(): boolean { return this.tables.length > 0; }

  /** @internal */
  _list(): PivotTable[] { return this.tables.slice(); }

  add(
    name: string,
    sourceData: PivotSource,
    row: number,
    col: number,
    layout?: PivotTableLayoutType,
    theme?: string | PivotTableTheme,
    options?: IPivotTableOption,
  ): PivotTable {
    const pivotName = String(name);
    if (this.findByName(pivotName)) throw new Error('The pivot table name already exists in the workbook.');
    const table = new PivotTable(pivotName, this.sheet, row, col, layout, theme, options);
    table._setCacheId(nextCacheId(this.sheet.parent as unknown as object));
    this.tables.push(table);
    try {
      table._init(sourceData, row, col);
    } catch (error) {
      this.tables = this.tables.filter(item => item !== table);
      throw error;
    }
    return table;
  }

  all(): PivotTable[] { return this.tables.slice(); }

  get(name: string): PivotTable {
    return this.findByName(name) as PivotTable;
  }

  findPivotTable(r: number, c: number): PivotTable {
    for (const table of this.tables) {
      const range = table.getRange();
      const areas = [range.page, range.content];
      for (const area of areas)
        if (area && area.contains(r, c)) return table;
    }
    return null as never;
  }

  remove(name: string): void {
    const table = this.findByName(name);
    if (!table) return;
    table._dispose();
    this.tables = this.tables.filter(item => item !== table);
  }

  /**
   * @internal Rebuild one pivot from a `sheet.toJSON().pivotTables[i]` entry
   * plus its workbook `pivotCaches` record (trial JSON shapes, item 4).
   */
  _restore(entry: Record<string, unknown>, cache: Record<string, unknown> | undefined): PivotTable | undefined {
    const name = String(entry.name ?? '');
    if (!name || this.findByName(name)) return undefined;
    const source = cacheToSource(cache);
    const ref = /^(.+!)?([A-Za-z]+)(\d+)/.exec(String(entry.ref ?? 'A1'));
    const col = ref ? lettersToIndex(ref[2]!) : 0;
    const row = ref ? Number(ref[3]) - 1 : 0;
    // Trial layout semantics in the JSON: no flags = compact, fields with
    // `compact:false` = outline, fields additionally `outline:false` = tabular.
    const fieldEntries = Array.isArray(entry.fields) ? entry.fields as Record<string, unknown>[] : [];
    const layoutType = fieldEntries.some(f => f.outline === false) ? PivotTableLayoutType.tabular
      : fieldEntries.some(f => f.compact === false) ? PivotTableLayoutType.outline
        : PivotTableLayoutType.compact;
    const theme = String(entry.styleName ?? '').replace(/^PivotStyle/i, '').toLowerCase() || 'light0';
    const options = entryToOptions(entry);
    const table = new PivotTable(name, this.sheet, row, col, layoutType, theme, options);
    const cacheId = Number(entry.cacheId) || nextCacheId(this.sheet.parent as unknown as object);
    table._setCacheId(cacheId);
    this.tables.push(table);
    try {
      table._init(source ?? '', row, col);
      table._restoreFields(entry, cache);
    } catch {
      this.tables = this.tables.filter(item => item !== table);
      throw new Error('invalid pivot table entry');
    }
    table._resyncSlicers();
    table._apply(); // slicer selections were pushed while the pivot was still building
    return table;
  }

  /** Workbook-scoped custom sort list shared with the sort engine. */
  customList(customList?: string[]): string[] | void {
    if (customList === undefined) return this.customSortList.slice();
    this.customSortList = Array.isArray(customList) ? customList.map(String) : [];
  }

  /** Trial shape: `{ [pivotTableName]: IPivotArea[] }` (areas intersecting). */
  getRangePivotAreas(range: Range): IPivotAreasCollection {
    const out: IPivotAreasCollection = {};
    for (const table of this.tables) {
      const areas = table._rangeAreas(range);
      if (areas.length) out[String(table.name())] = areas;
    }
    return out;
  }

  private findByName(name: string): PivotTable | undefined {
    const wanted = String(name).toLowerCase();
    return this.tables.find(table => String(table.name()).toLowerCase() === wanted);
  }
}

/** Per-workbook pivot cache id counter (the trial numbers them 1..N). */
const cacheIds = new WeakMap<object, number>();
export function nextCacheId(workbook: object | undefined): number {
  if (!workbook) return 1;
  const current = cacheIds.get(workbook) ?? 0;
  const next = current + 1;
  cacheIds.set(workbook, next);
  return next;
}

function cacheToSource(cache: Record<string, unknown> | undefined): string | undefined {
  if (!cache) return undefined;
  if (cache.sourceName) return '=' + String(cache.sourceName);
  if (cache.sheet && cache.ref) return `${String(cache.sheet)}!${String(cache.ref)}`;
  return undefined;
}

const OPTION_FLAGS: [string, keyof IPivotTableOption][] = [
  ['multipleFieldFilters', 'allowMultipleFiltersPerField'],
  ['showRowHeaders', 'showRowHeader'],
  ['showColHeaders', 'showColumnHeader'],
  ['showRowStripes', 'bandRows'],
  ['showColStripes', 'bandColumns'],
  ['showFilter', 'showFilter'],
  ['showDrill', 'showDrill'],
  ['showMissing', 'showMissing'],
  ['showToolTip', 'showToolTip'],
  ['fillDownLabels', 'fillDownLabels'],
  ['mergeItem', 'mergeItem'],
  ['showHeaders', 'showHeaders'],
  ['showError', 'isShowErrorValue'],
  ['enableDataValueEditing', 'enableDataValueEditing'],
];

function entryToOptions(entry: Record<string, unknown>): IPivotTableOption {
  const options: Record<string, unknown> = {};
  for (const [from, to] of OPTION_FLAGS)
    if (typeof entry[from] === 'boolean') options[to] = entry[from];
  if (typeof entry.showMissing === 'boolean') options.showMissing = entry.showMissing;
  if (typeof entry.missingCaption === 'string') options.missingCaption = entry.missingCaption;
  if (typeof entry.pageWrap === 'number') options.reportFilterFieldsPerColumn = entry.pageWrap;
  if (entry.pageOverThenDown !== undefined)
    options.displayFieldsInPageFilterArea = entry.pageOverThenDown ? 1 /* overThenDown */ : 0;
  if (typeof entry.rowGrandTotals === 'boolean' || typeof entry.colGrandTotals === 'boolean') {
    const row = entry.rowGrandTotals !== false;
    const col = entry.colGrandTotals !== false;
    options.grandTotalPosition = (row ? 1 : 0) | (col ? 2 : 0);
  }
  return options as IPivotTableOption;
}
