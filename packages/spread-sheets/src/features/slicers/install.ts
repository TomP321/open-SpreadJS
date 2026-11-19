/**
 * Wires the slicer feature into the library:
 *  - registers the public classes on the GC.Spread.Sheets.Slicers and
 *    GC.Spread.Slicers namespace objects (before installFallbacks runs);
 *  - paints every sheet slicer after each renderer frame (the core renderer
 *    files are untouched; we only wrap WorkbookRenderer.prototype.paint);
 *  - adds the workbook-level pieces declared in the contract
 *    (customSlicerThemes / customTimelineThemes, tableSlicerCaches in JSON).
 * Renderer/workbook bindings are only touched inside functions because the
 * core modules form import cycles that may still be evaluating at import time.
 */
import { GC } from '../../generated/enums.js';
import type { WorkbookRenderer } from '../../rendering.js';
import type { Workbook } from '../../workbook.js';
import { SlicerCollection } from './collection.js';
import { Slicer } from './slicer.js';
import { GeneralSlicerData } from './general-data.js';
import { TableSlicerData } from './table-data.js';
import { ItemSlicer, DOMTableSlicer } from './dom-slicer.js';
import { SlicerBorder, SlicerStyle, SlicerStyleInfo, SlicerStyles, TimelineStyle, TimelineStyles } from './styles.js';
import { CustomSlicerThemeManager, CustomTimelineThemeManager } from './themes-manager.js';
import type { JsonRecord } from '../../serialization.js';
import type { Worksheet } from '../../worksheet.js';

const sheetsNamespace = GC.Spread.Sheets as unknown as Record<string, Record<string, unknown>>;
const topNamespace = GC.Spread as unknown as Record<string, Record<string, unknown>>;
const slicersNamespace = (sheetsNamespace.Slicers ??= {});
const topSlicersNamespace = (topNamespace.Slicers ??= {});

function registerNamespace(): void {
  slicersNamespace.Slicer = Slicer;
  slicersNamespace.SlicerCollection = SlicerCollection;
  slicersNamespace.SlicerBorder = SlicerBorder;
  slicersNamespace.SlicerStyle = SlicerStyle;
  slicersNamespace.SlicerStyleInfo = SlicerStyleInfo;
  slicersNamespace.SlicerStyles = SlicerStyles;
  slicersNamespace.TimelineStyle = TimelineStyle;
  slicersNamespace.TimelineStyles = TimelineStyles;
  slicersNamespace.TableSlicerData = TableSlicerData;
  slicersNamespace.ItemSlicer = ItemSlicer;
  slicersNamespace.DOMTableSlicer = DOMTableSlicer;
  slicersNamespace.CustomSlicerThemeManager = CustomSlicerThemeManager;
  slicersNamespace.CustomTimelineThemeManager = CustomTimelineThemeManager;
  topSlicersNamespace.GeneralSlicerData = GeneralSlicerData;
}

// ---- renderer hook: paint all slicers after the regular frame paint.
let rendererInstalled = false;
let RendererClass: typeof WorkbookRenderer | undefined;
let WorkbookClass: typeof Workbook | undefined;

/** Called once from index.ts after the core modules are evaluated (avoids an import cycle). */
export function bindSlicerHosts(workbook: typeof Workbook, renderer: typeof WorkbookRenderer): void {
  WorkbookClass = workbook;
  RendererClass = renderer;
  installSlicers();
}
function installRendererHook(): void {
  if (rendererInstalled) return;
  if (!RendererClass) return; // bound later by index.ts
  rendererInstalled = true;
  const rendererProto = RendererClass.prototype as unknown as {
    paint(): void;
    __slicersPaintPatched?: boolean;
  };
  if (rendererProto.__slicersPaintPatched) return;
  const originalPaint = rendererProto.paint;
  rendererProto.paint = function patchedPaint(this: WorkbookRenderer): void {
    originalPaint.call(this);
    paintSheetSlicers(this);
  };
  rendererProto.__slicersPaintPatched = true;
}

function paintSheetSlicers(view: WorkbookRenderer): void {
  const sheet = view.sheet;
  if (!sheet || !sheet.slicers || sheet.slicers._count() === 0) return;
  if (view.workbook.isPaintSuspended()) return;
  sheet.slicers._paint(view);
}

// ---- workbook-level members (installed lazily; see the header comment).
let workbookInstalled = false;
function installWorkbookMembers(): void {
  if (workbookInstalled) return;
  if (!WorkbookClass) return; // bound later by index.ts
  workbookInstalled = true;
  const workbookProto = WorkbookClass.prototype as unknown as Record<string, unknown>;
  if (workbookProto.__slicersInstalled) return;
  workbookProto.__slicersInstalled = true;
  for (const [key, Ctor] of [['customSlicerThemes', CustomSlicerThemeManager], ['customTimelineThemes', CustomTimelineThemeManager]] as const)
    Object.defineProperty(workbookProto, key, {
      configurable: true,
      get(this: Workbook): unknown {
        const holder = this as unknown as Record<string, unknown>;
        if (!holder[`__${key}`]) holder[`__${key}`] = new Ctor(this);
        return holder[`__${key}`];
      },
    });
  const originalToJSON = workbookProto.toJSON as (this: Workbook, ...args: unknown[]) => JsonRecord;
  workbookProto.toJSON = function patchedToJSON(this: Workbook, ...args: unknown[]): JsonRecord {
    const json = originalToJSON.apply(this, args) as JsonRecord;
    const caches = collectSlicerCaches(this);
    if (caches.length) json.tableSlicerCaches = caches;
    return json;
  };
  const originalFromJSON = workbookProto.fromJSON as (this: Workbook, ...args: unknown[]) => unknown;
  workbookProto.fromJSON = function patchedFromJSON(this: Workbook, ...args: unknown[]): unknown {
    const result = originalFromJSON.apply(this, args);
    applySlicerCaches(this, args[0] as JsonRecord);
    return result;
  };
}

/** Trial: sortState / showNoDataItems / showNoDataItemsInLast / visuallyNoDataItems
 *  are persisted in the workbook-level tableSlicerCaches, not on the slicer. */
function applySlicerCaches(workbook: Workbook, json: JsonRecord | undefined): void {
  const caches = Array.isArray(json?.tableSlicerCaches) ? (json.tableSlicerCaches as JsonRecord[]) : [];
  if (!caches.length) return;
  const byCacheName = new Map(caches.map(cache => [String(cache.name ?? ''), cache]));
  const sheets = (workbook as unknown as { sheets?: Worksheet[] }).sheets ?? [];
  for (const sheet of sheets) {
    for (const slicer of (sheet?.slicers?.all() ?? [])) {
      const cache = byCacheName.get(slicer.nameInFormula());
      if (!cache) continue;
      if (typeof cache.sortOrder === 'number') slicer.customProps.sortState = cache.sortOrder;
      if (typeof cache.showNoDataItems === 'boolean') slicer.customProps.showNoDataItems = cache.showNoDataItems;
      if (typeof cache.showNoDataItemsInLast === 'boolean') slicer.customProps.showNoDataItemsInLast = cache.showNoDataItemsInLast;
      if (typeof cache.visuallyNoDataItems === 'boolean') slicer.customProps.visuallyNoDataItems = cache.visuallyNoDataItems;
    }
  }
}

/** Trial parity: each table gets an opaque id referenced by its slicer cache. */
function slicerTableId(table: object): string {
  const holder = table as { _slicerTableId?: string };
  if (holder._slicerTableId) return holder._slicerTableId;
  const name = String((table as { name: () => string }).name?.() ?? '');
  let hash = 2166136261;
  for (const ch of name + ':' + Math.random().toString(36).slice(2)) {
    hash ^= ch.charCodeAt(0);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let id = '';
  let value = hash;
  while (id.length < 8) { id += alphabet[value % 62]; value = Math.imul(value, 1103515245) + 12345; value >>>= 0; }
  holder._slicerTableId = id;
  return id;
}

function collectSlicerCaches(workbook: Workbook): JsonRecord[] {
  const out: JsonRecord[] = [];
  const seen = new Set<string>();
  const sheets = (workbook as unknown as { sheets?: Worksheet[] }).sheets ?? [];
  for (const sheet of sheets) {
    if (!sheet) continue;
    for (const slicer of (sheet.slicers?.all() ?? [])) {
      // `tableSlicerCaches` covers table slicers only; pivot slicers/timelines
      // serialize into the workbook `slicerCaches` section instead (trial).
      if (!(slicer.slicerData instanceof TableSlicerData)) continue;
      const name = slicer.nameInFormula();
      if (seen.has(name)) continue;
      seen.add(name);
      const table = (slicer.slicerData instanceof TableSlicerData ? slicer.slicerData : null)?.getTable();
      const tableId = table ? slicerTableId(table) : '';
      out.push({
        name,
        sourceName: slicer.sourceName(),
        tableName: table ? String(table.name()) : '',
        tableId,
        columnName: slicer.columnName(),
        sortOrder: Number(slicer.sortState()),
        showNoDataItems: slicer.showNoDataItems() !== false,
        showNoDataItemsInLast: slicer.showNoDataItemsInLast() !== false,
        visuallyNoDataItems: slicer.visuallyNoDataItems() !== false,
      });
    }
  }
  return out;
}

/** Idempotent; called from the SlicerCollection constructor and a microtask. */
export function installSlicers(): void {
  registerNamespace();
  installRendererHook();
  installWorkbookMembers();
}

registerNamespace();
if (typeof queueMicrotask === 'function') queueMicrotask(installSlicers);
