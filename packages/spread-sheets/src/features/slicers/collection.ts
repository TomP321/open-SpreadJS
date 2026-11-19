/**
 * SlicerCollection: `worksheet.slicers`. Creates table slicers bound to a
 * table column (pivot/timeline slicers are declared but stay NotImplemented
 * until the pivot feature lands), keeps the name map and (de)serialises the
 * `slicers` sheet-JSON section.
 */
import { notImplemented } from '../../not-implemented.js';
import { installSlicers } from './install.js';
import { Slicer } from './slicer.js';
import { PivotTableItemSlicer, PivotTableTimelineSlicer } from './pivot-slicer.js';
import { slicerShapeEntry } from './shapes-section.js';
import { TableSlicerData } from './table-data.js';
import type { Table } from '../tables.js';
import type { Worksheet } from '../../worksheet.js';
import type { JsonRecord } from '../../serialization.js';
import { GC } from '../../generated/enums.js';

const SlicerType = GC.Spread.Sheets.Slicers.SlicerType;

export class SlicerCollection {
  private items: Slicer[] = [];
  constructor(private sheet: Worksheet) {
    // Every Workbook creates its sheets through this constructor, so by the
    // first construction the renderer/workbook modules are fully evaluated and
    // the deferred hooks (paint wrapper, customSlicerThemes) can be wired.
    installSlicers();
  }

  add(slicerName: string, targetName: string, itemName: string,
    style?: unknown, type?: unknown): Slicer {
    const slicerType = (type as string | undefined) ?? SlicerType.table;
    if (slicerType === SlicerType.pivotTable || slicerType === SlicerType.pivotTimeline)
      return this.addPivot(slicerName, targetName, itemName, style, slicerType === SlicerType.pivotTimeline);
    if (slicerType !== SlicerType.table)
      notImplemented('GC.Spread.Sheets.Slicers.SlicerCollection.add(pivot slicers)');
    const table = this.sheet.tables.findByName(targetName);
    if (!table) throw new Error(`The table ${targetName} does not exist.`);
    const existing = this.get(slicerName);
    const slicer = new Slicer(slicerName);
    slicer._bindSheet(this.sheet);
    const data = ensureData(table);
    slicer.bindData(data, itemName);
    slicer.customProps.slicerCacheName = slicer.nameInFormula();
    if (style !== undefined && style !== null) (slicer.style as (v: unknown, cb?: boolean) => unknown)(style, false);
    else slicer.customProps.style = 'SlicerStyleLight1';
    if (existing) this.items = this.items.filter(item => item !== existing);
    this.items.push(slicer);
    slicer._captureAnchors();
    this.sheet._view()?.schedule();
    return slicer;
  }

  private addPivot(slicerName: string, ptName: string, field: string,
    style: unknown, timeline: boolean): Slicer {
    const holder = this.sheet as unknown as { pivotTables?: { get(n: string): unknown } };
    if (!holder.pivotTables?.get(String(ptName)))
      throw new Error(`The pivot table ${ptName} does not exist.`);
    const existing = this.get(slicerName);
    const slicer = timeline
      ? new PivotTableTimelineSlicer(slicerName)
      : new PivotTableItemSlicer(slicerName);
    slicer._bindPivot(this.sheet, String(ptName), String(field));
    if (style !== undefined && style !== null) (slicer.style as (v: unknown, cb?: boolean) => unknown)(style, false);
    else slicer.customProps.style = timeline ? 'TimeSlicerStyleLight1' : 'SlicerStyleLight1';
    if (existing) this.items = this.items.filter(item => item !== existing);
    this.items.push(slicer);
    slicer._captureAnchors();
    this.sheet._view()?.schedule();
    return slicer;
  }

  all(targetName?: string, itemName?: string): Slicer[] {
    if (targetName === undefined && itemName === undefined) return [...this.items];
    return this.items.filter(slicer =>
      (targetName === undefined || matchesTable(slicer, targetName)) &&
      (itemName === undefined || slicer.columnName() === itemName));
  }

  get(name: string): Slicer | undefined {
    return this.items.find(item => item.name() === name);
  }

  remove(name: string): void {
    const item = this.get(name);
    if (!item) return;
    item._dispose();
    this.items = this.items.filter(slicer => slicer !== item);
    this.sheet._view()?.schedule();
  }

  clear(): void {
    for (const item of this.items) item._dispose();
    this.items = [];
    this.sheet._view()?.schedule();
  }

  _rename(previous: string, next: string): void {
    void previous;
    void next;
  }

  _disposeAll(): void {
    this.clear();
  }

  toJSON(): JsonRecord[] {
    return this.items.map(item => item.toJSON());
  }

  fromJSON(list: unknown): void {
    this.clear();
    for (const raw of Array.isArray(list) ? list : []) {
      const json = raw as JsonRecord;
      const type = String(json.type ?? 'table');
      if (type === 'pivot' || type === 'timeline') {
        // The trial keeps the pivot binding + selection in the workbook-level
        // `slicerCaches` section; the sheet entry only carries geometry/state.
        const caches = (this.sheet.parent as unknown as { _pendingPivotSlicerCaches?: JsonRecord[] })
          ._pendingPivotSlicerCaches;
        const cache = Array.isArray(caches)
          ? caches.find(item => String(item.name) === String(json.slicerCacheName ?? ''))
          : undefined;
        const names = (Array.isArray(json.pivotTableNames) ? json.pivotTableNames : [json.pivotTableName])
          .map(String).filter(name => name && name !== 'undefined');
        if (cache && Array.isArray(cache.pivotTables))
          names.push(...(cache.pivotTables as JsonRecord[]).map(t => String(t.name)));
        const ptName = names[0] ?? '';
        const cacheName = String(json.slicerCacheName ?? '');
        let column = String(json.columnName
          ?? (cache && cache.sourceName ? String(cache.sourceName)
            : cacheName.startsWith('SlicerCache_') ? cacheName.slice('SlicerCache_'.length)
              : json.captionName ?? ''));
        if (cache && type === 'timeline' && String(cache.name ?? '').startsWith('NativeTimelineCache_'))
          column = String(cache.sourceName ?? column);
        const timeline = type === 'timeline';
        const slicer = timeline
          ? new PivotTableTimelineSlicer(String(json.name ?? 'pivotTimeline1'))
          : new PivotTableItemSlicer(String(json.name ?? 'pivotSlicer1'));
        slicer._bindPivot(this.sheet, ptName, column);
        slicer.fromJSON(json);
        if (cache) {
          slicer.customProps.pivotTables = (Array.isArray(cache.pivotTables) ? cache.pivotTables : [])
            .map(t => String((t as JsonRecord).name));
          if (cache.sortOrder !== undefined) slicer.customProps.sortState = Number(cache.sortOrder);
          for (const key of ['showNoDataItems', 'showNoDataItemsInLast', 'visuallyNoDataItems'])
            if (cache[key] !== undefined) slicer.customProps[key] = !!cache[key];
          if (!timeline && Array.isArray(cache.items)) {
            const selected = (cache.items as JsonRecord[])
              .filter(item => item.s !== false).map(item => Number(item.x));
            if (selected.length && selected.length < (cache.items as unknown[]).length)
              slicer._restoreSelection(selected);
          }
        }
        this.items.push(slicer);
        slicer._captureAnchors();
        continue;
      }
      const table = this.sheet.tables.findByName(String(json.tableName ?? '')) ?? this.sheet.tables.all()[0];
      const cacheName = String(json.slicerCacheName ?? '');
      const column = String(json.columnName ?? (cacheName.startsWith('TableSlicer_') ? cacheName.slice('TableSlicer_'.length) : json.captionName ?? ''));
      const slicer = new Slicer(String(json.name ?? 'slicer1'));
      slicer._bindSheet(this.sheet);
      if (table) slicer.bindData(ensureData(table), column);
      slicer.fromJSON(json);
      this.items.push(slicer);
      slicer._captureAnchors();
    }
  }

  /** Renderer hook: paint every slicer of this sheet. */
  _paint(view: import('../../rendering.js').WorkbookRenderer): void {
    for (const item of this.items) item._renderSlicer(view);
  }

  /** Trial shape: each pivot slicer also writes a workbook `slicerCaches` entry. */
  _toPivotCachesJSON(): JsonRecord[] {
    const out: JsonRecord[] = [];
    const holder = this.sheet.parent as unknown as { getSheetIndex?(name: string): number } | undefined;
    const tabId = (holder?.getSheetIndex ? holder.getSheetIndex(this.sheet.name()) : 0) + 1;
    for (const item of this.items) {
      const toCache = (item as { _toCacheJSON?(tabId: number): JsonRecord | null })._toCacheJSON;
      if (typeof toCache !== 'function') continue;
      const entry = toCache.call(item, tabId);
      if (entry) out.push(entry);
    }
    return out;
  }

  /** Notify every bound data model about a cell edit inside one of its tables. */
  _onCellChanged(row: number, col: number): void {
    const seen = new Set<TableSlicerData>();
    for (const item of this.items) {
      const data = item.slicerData;
      if (data instanceof TableSlicerData && !seen.has(data)) { seen.add(data); data._onCellChanged(row, col); }
    }
  }

  /** Table structure changed: drop slicers whose table is gone, refresh the rest. */
  _refreshForTables(): void {
    for (const item of [...this.items]) {
      const data = item.slicerData;
      if (!(data instanceof TableSlicerData)) continue;
      const table = data.getTable();
      if (!table || !this.sheet.tables.findByName(String(table.name()))) this.remove(String(item.name()));
      else if ((table.columns.length ?? 0) > 0) data.refresh();
    }
  }

  _count(): number { return this.items.length; }

  /** Trial parity: each slicer is also registered as a shapeType-6 worksheet shape. */
  _toShapesJSON(): JsonRecord[] {
    return this.items.map((item, index) => slicerShapeEntry(item, index));
  }
}

function matchesTable(slicer: Slicer, targetName: string): boolean {
  const names = (slicer as { getConnectedPivotTableNameList?(): string[] }).getConnectedPivotTableNameList;
  if (names) return names.call(slicer).some((name: string) => name.toLowerCase() === targetName.toLowerCase());
  const table = (slicer.slicerData instanceof TableSlicerData ? slicer.slicerData : null)?.getTable();
  return !!table && String(table.name()).toLowerCase() === targetName.toLowerCase();
}

/** One shared TableSlicerData per table (the trial exposes it as table.getSlicerData()). */
export function ensureData(table: Table): TableSlicerData {
  return table.getSlicerData() as TableSlicerData;
}
