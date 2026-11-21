/**
 * Pivot-bound slicers (TASK 42 item 4): `PivotTableItemSlicer` and
 * `PivotTableTimelineSlicer`, created through `worksheet.slicers.add(...)`
 * with a `SlicerType.pivotTable` / `pivotTimeline`. The item slicer reuses
 * the table slicer's canvas list; the timeline paints its own block bar.
 * Selections are pushed into every connected pivot table, which filters the
 * source rows and re-lays-out its area — like the trial.
 */
import { GeneralSlicerData } from './general-data.js';
import { Slicer } from './slicer.js';
import { renderTimelineView, timelineHitTest, paintTimeline, bucketStart, bucketEnd, type TimelineView } from './timeline-view.js';
import { PivotTableStyle } from '../../pivot/theme.js';
import { GC } from '../../generated/enums.js';
import type { SlicerStyle, TimelineStyle } from './styles.js';
import type { Worksheet } from '../../worksheet.js';
import type { WorkbookRenderer } from '../../rendering.js';
import type { JsonRecord } from '../../serialization.js';
import { asRecord } from '../../object-access.js';

const TimelineLevel = GC.Spread.Sheets.Slicers.TimelineLevel;

/** The workbook-wide pivot-slicer cache id the trial writes into `slicerCaches`. */
export const PIVOT_SLICER_CACHE_ID = 100000000;

/** The pivot-side surface a slicer talks to (duck-typed to avoid an import cycle). */
export interface PivotSlicerTarget {
  name(): string;
  _slicerFieldItems(field: string): { key: string; text: string }[];
  _timelineDates(field: string): number[];
  _setSlicerSelection(field: string, keys: readonly string[] | null): void;
  _setTimelineSelection(field: string, range: { from: string; to: string } | null): void;
  _slicerItemHasData(field: string, key: string, exceptField: string): boolean;
}

/** Resolve a pivot table by name from the worksheet (structural). */
export function findPivotTarget(sheet: Worksheet | undefined, name: string): PivotSlicerTarget | undefined {
  const holder = sheet as unknown as { pivotTables?: { get(n: string): PivotSlicerTarget | undefined } };
  return holder.pivotTables?.get(String(name)) ?? undefined;
}

/** Slicer data backed by one pivot field: exclusive items are the field's distinct values. */
export class PivotSlicerData extends GeneralSlicerData {
  /** Cache key per exclusive display text (same index as the data rows). */
  keys: string[] = [];
  private pushing = false;

  constructor(private target: () => PivotSlicerTarget | undefined, private sourceField: string) {
    super([], [sourceField]);
    this.refresh();
  }

  /** Rebuild the item list from the pivot cache (no event, no pivot push). */
  refresh(): void {
    const items = this.target()?._slicerFieldItems(this.sourceField) ?? [];
    this.keys = items.map(item => item.key);
    this.columnNames = [this.sourceField];
    this.data = items.map(item => [item.text]);
  }

  /** Trial: an item greys out when no row survives the OTHER slicers' selections. */
  hasRowForOtherColumns(columnName: string, exclusiveIndex: number): boolean {
    if (columnName !== this.sourceField) return true;
    const key = this.keys[exclusiveIndex];
    if (key === undefined) return false;
    return this.target()?._slicerItemHasData(this.sourceField, key, this.sourceField) ?? true;
  }

  protected override notifyFiltered(isPreview: boolean): void {
    super.notifyFiltered(isPreview);
    if (this.pushing) return;
    this.pushing = true;
    try {
      const selected = this.getSelectedIndexes(this.sourceField);
      const keys = selected === null
        ? null
        : selected.map(index => this.keys[index]).filter((key): key is string => key !== undefined);
      this.target()?._setSlicerSelection(this.sourceField, keys && keys.length === this.keys.length ? null : keys);
    }
    finally { this.pushing = false; }
  }
}

/** Pivot-bound timeline data: the field's distinct dates, sorted, plus selection push. */
export class PivotTimelineData {
  /** Unique date times (ms) of the bound field, ascending. */
  times: number[] = [];

  constructor(private target: () => PivotSlicerTarget | undefined, readonly sourceField: string) {
    this.refresh();
  }

  refresh(): void {
    this.times = this.target()?._timelineDates(this.sourceField) ?? [];
  }

  /** Push a selection range (ms bounds, inclusive) into the pivot; null clears it. */
  select(from: number | null, to: number | null): void {
    if (from === null || to === null || !this.times.length) {
      this.target()?._setTimelineSelection(this.sourceField, null);
      return;
    }
    this.target()?._setTimelineSelection(this.sourceField, { from: String(from), to: String(to) });
  }
}

/** Common pivot-connection behaviour implemented over the host slicer. */
abstract class PivotBoundSlicer extends Slicer {
  /** Selection saved by fromJSON while the pivot table was not loaded yet. */
  protected abstract fieldName(): string;
  protected abstract pushSelection(): void;
  protected abstract resetSelection(): void;

  protected names(): string[] {
    const list = this.customProps.pivotTables;
    if (!Array.isArray(list)) { this.customProps.pivotTables = []; return []; }
    return list as string[];
  }

  protected pivots(): PivotSlicerTarget[] {
    const out: PivotSlicerTarget[] = [];
    for (const name of this.names()) {
      const pivot = findPivotTarget(this._sheet, name);
      if (pivot) out.push(pivot);
    }
    return out;
  }

  connectPivotTable(ptName: string): void {
    const name = String(ptName);
    if (this.names().includes(name)) return;
    if (!findPivotTarget(this._sheet, name)) throw new Error(`The pivot table ${name} does not exist.`);
    this.names().push(name);
    this.pushSelection();
  }

  disconnectPivotTable(ptName: string): void {
    const name = String(ptName);
    const list = this.names();
    if (!list.includes(name)) return;
    // Trial: disconnecting keeps the pivot's current filter (the slicer keeps
    // its own selection and re-applies it on a later connect).
    this.customProps.pivotTables = list.filter(item => item !== name);
  }

  isConnectedPivotTable(ptName: string): boolean { return this.names().includes(String(ptName)); }
  getConnectedPivotTableNameList(): string[] { return [...this.names()]; }
  getAllConnectedPivotTables(): unknown[] { return this.pivots(); }
  getAllPivotTables(): unknown[] {
    const holder = this._sheet as unknown as { pivotTables?: { all(): unknown[] } };
    return holder.pivotTables?.all() ?? [];
  }
  override sheet(): Worksheet | undefined { return this._sheet; }

  /** @internal PivotTable.connectSlicer() entry points (duck-typed contract). */
  _connectPivot(pivot: object): void {
    const name = (pivot as { name(): string }).name();
    if (this.names().includes(name)) return;
    if (!findPivotTarget(this._sheet, name)) return;
    this.names().push(name);
    this.pushSelection();
  }

  _disconnectPivot(pivot: object): void { this.disconnectPivotTable((pivot as { name(): string }).name()); }
  _connectedPivots(): object[] { return this.pivots(); }
  _connectedPivotNames(): string[] { return [...this.names()]; }

  /** Pivot relayout: adopt new/removed items without touching the selection. */
  _refreshFromPivot(): void {
    this._refreshData();
    this._sheet?._view()?.schedule();
  }

  /** @internal The pivot was restored after this slicer (JSON load): re-apply the selection. */
  _resyncFromPivot(): void {
    this._refreshData();
    const pending = this._pending;
    if (pending) { this._pending = null; this._applySelectionIndexes(pending); }
    this.pushSelection();
  }

  /** Exclusive-index selection saved by fromJSON while the pivot table was
   *  not loaded yet. Accessor-backed (no class field): subclass field
   *  initialisers must not clobber a selection restored before the resync. */
  protected get pendingIndexes(): number[] | null { return this._pending ?? null; }
  protected _pending?: number[] | null;

  /** @internal Restore path: apply the selection saved from `slicerCaches`. */
  _restoreSelection(exclusiveIndexes: number[] | null): void {
    if (exclusiveIndexes === null) { this._pending = null; return; }
    this._refreshData();
    if (this._dataKeys().length) {
      this._applySelectionIndexes(exclusiveIndexes);
    } else {
      this._pending = [...exclusiveIndexes];
    }
  }

  protected _dataKeys(): readonly string[] { return []; }

  protected _applySelectionIndexes(indexes: readonly number[]): void { void indexes; }

  protected abstract _refreshData(): void;

  /** Pivot-style slots: getter/setter pairs over a private store. These mirror
   *  the trial's API state; the visible drawing is driven by `style()`. */
  protected pivotStyle(name: string, value?: unknown): unknown {
    const store = (this.customProps.pivotStyles ??= {}) as Record<string, unknown>;
    if (value === undefined) return store[name];
    store[name] = value instanceof PivotTableStyle ? value : new PivotTableStyle(value as never);
    return this;
  }

  protected stripSize(name: string, value?: number): unknown {
    const store = (this.customProps.pivotStrips ??= {}) as Record<string, number>;
    if (value === undefined) return store[name] ?? 1;
    store[name] = Number(value) || 0;
    return this;
  }

  blankRowStyle(value?: unknown): unknown { return this.pivotStyle('blankRowStyle', value); }
  columnSubheading1Style(value?: unknown): unknown { return this.pivotStyle('columnSubheading1Style', value); }
  columnSubheading2Style(value?: unknown): unknown { return this.pivotStyle('columnSubheading2Style', value); }
  columnSubheading3Style(value?: unknown): unknown { return this.pivotStyle('columnSubheading3Style', value); }
  firstColumnStyle(value?: unknown): unknown { return this.pivotStyle('firstColumnStyle', value); }
  firstHeaderCellStyle(value?: unknown): unknown { return this.pivotStyle('firstHeaderCellStyle', value); }
  firstRowStripeStyle(value?: unknown): unknown { return this.pivotStyle('firstRowStripeStyle', value); }
  firstColumnStripeStyle(value?: unknown): unknown { return this.pivotStyle('firstColumnStripeStyle', value); }
  grandTotalColumnStyle(value?: unknown): unknown { return this.pivotStyle('grandTotalColumnStyle', value); }
  grandTotalRowStyle(value?: unknown): unknown { return this.pivotStyle('grandTotalRowStyle', value); }
  headerRowStyle(value?: unknown): unknown { return this.pivotStyle('headerRowStyle', value); }
  reportFilterLabelsStyle(value?: unknown): unknown { return this.pivotStyle('reportFilterLabelsStyle', value); }
  reportFilterValuesStyle(value?: unknown): unknown { return this.pivotStyle('reportFilterValuesStyle', value); }
  rowSubheading1Style(value?: unknown): unknown { return this.pivotStyle('rowSubheading1Style', value); }
  rowSubheading2Style(value?: unknown): unknown { return this.pivotStyle('rowSubheading2Style', value); }
  rowSubheading3Style(value?: unknown): unknown { return this.pivotStyle('rowSubheading3Style', value); }
  secondColumnStripeStyle(value?: unknown): unknown { return this.pivotStyle('secondColumnStripeStyle', value); }
  secondRowStripeStyle(value?: unknown): unknown { return this.pivotStyle('secondRowStripeStyle', value); }
  subtotalColumn1Style(value?: unknown): unknown { return this.pivotStyle('subtotalColumn1Style', value); }
  subtotalColumn2Style(value?: unknown): unknown { return this.pivotStyle('subtotalColumn2Style', value); }
  subtotalColumn3Style(value?: unknown): unknown { return this.pivotStyle('subtotalColumn3Style', value); }
  subtotalRow1Style(value?: unknown): unknown { return this.pivotStyle('subtotalRow1Style', value); }
  subtotalRow2Style(value?: unknown): unknown { return this.pivotStyle('subtotalRow2Style', value); }
  subtotalRow3Style(value?: unknown): unknown { return this.pivotStyle('subtotalRow3Style', value); }
  wholeTableStyle(value?: unknown): unknown { return this.pivotStyle('wholeTableStyle', value); }
  firstColumnStripSize(value?: number): unknown { return this.stripSize('firstColumnStripSize', value); }
  firstRowStripSize(value?: number): unknown { return this.stripSize('firstRowStripSize', value); }
  secondColumnStripSize(value?: number): unknown { return this.stripSize('secondColumnStripSize', value); }
  secondRowStripSize(value?: number): unknown { return this.stripSize('secondRowStripSize', value); }

  protected connectionToJson(json: JsonRecord): JsonRecord {
    json.pivotTableName = this.names()[0];
    json.pivotTableNames = [...this.names()];
    json.slicerCacheName = this.nameInFormula();
    json.nameInFormula = this.nameInFormula();
    json.columnName = this.fieldName();
    return json;
  }

  protected connectionFromJson(json: JsonRecord): void {
    const names = (Array.isArray(json.pivotTableNames) ? json.pivotTableNames : [json.pivotTableName])
      .map(String).filter(name => name && name !== 'undefined');
    this.customProps.pivotTables = names;
    if (typeof json.columnName === 'string' && json.columnName) this.columnNameValue = json.columnName;
  }
}

export class PivotTableItemSlicer extends PivotBoundSlicer {
  private pivotData: PivotSlicerData | null = null;

  constructor(name?: string) {
    super(name ?? 'pivotSlicer1');
    this.customProps.type = 'pivot';
    this.customProps.pivotTables = [];
    this.customProps.captionName = '';
  }

  /** Bind to a worksheet pivot; the collection calls this after creation. */
  _bindPivot(sheet: Worksheet, ptName: string, field: string): void {
    this._bindSheet(sheet);
    this.pivotData = new PivotSlicerData(
      () => this.pivots()[0] ?? findPivotTarget(this._sheet, ptName), field);
    this.bindData(this.pivotData, field);
    this.customProps.pivotTables = [ptName];
    this.customProps.captionName = field;
    this.customProps.slicerCacheName = this.nameInFormula();
    // Trial: pivot slicers track their anchors by default (dynamicMove true).
    this.propsValue().dynamicMove = true;
    this.pushSelection();
  }

  override nameInFormula(): string { return `SlicerCache_${this.columnNameValue}`; }
  sourceName(): string { return this.columnNameValue; }
  protected fieldName(): string { return this.columnNameValue; }

  protected pushSelection(): void {
    this.pivotData?.refresh();
    const selected = this.pivotData?.getSelectedIndexes(this.columnNameValue);
    const keys = selected === null || selected === undefined
      ? null
      : selected.map(index => this.pivotData!.keys[index]).filter((key): key is string => key !== undefined);
    for (const pivot of this.pivots())
      pivot._setSlicerSelection(this.columnNameValue, keys && keys.length === (this.pivotData?.keys.length ?? 0) ? null : keys);
  }

  protected resetSelection(): void {
    for (const pivot of this.pivots()) pivot._setSlicerSelection(this.columnNameValue, null);
  }

  protected _refreshData(): void { this.pivotData?.refresh(); }

  override refresh(): void {
    this.pivotData?.refresh();
    this.pushSelection();
    this._sheet?._view()?.schedule();
  }

  protected _dataKeys(): readonly string[] { return this.pivotData?.keys ?? []; }

  /** Trial: item slicers cache a `{x, s, nd}` entry per displayed item. */
  _toCacheJSON(tabId: number): JsonRecord | null {
    const data = this.pivotData;
    if (!data) return null;
    const column = this.columnNameValue;
    const exclusive = data.getExclusiveData(column);
    const items = this.getItems().map(item => ({
      x: exclusive.indexOf(String(item.value)), s: item.selected, nd: item.noData,
    }));
    return {
      name: this.nameInFormula(),
      sourceName: column,
      pivotCacheId: PIVOT_SLICER_CACHE_ID,
      pivotTables: this.names().map(name => ({ tabId, name })),
      items,
      sortOrder: Number(this.customProps.sortState ?? 1),
      showNoDataItems: this.customProps.showNoDataItems !== false,
      showNoDataItemsInLast: this.customProps.showNoDataItemsInLast !== false,
      visuallyNoDataItems: this.customProps.visuallyNoDataItems !== false,
    };
  }

  /** @internal Re-apply a selection restored from `slicerCaches` (exclusive indexes). */
  _restoreSelection(exclusiveIndexes: number[] | null): void {
    if (exclusiveIndexes === null) { this._pending = null; return; }
    this._refreshData();
    if (this._dataKeys().length) this._applySelectionIndexes(exclusiveIndexes);
    else this._pending = [...exclusiveIndexes];
  }

  protected _applySelectionIndexes(indexes: readonly number[]): void {
    const data = this.pivotData;
    if (!data) return;
    data.refresh();
    const valid = indexes.filter(index => index >= 0 && index < data.keys.length);
    if (valid.length && valid.length < data.keys.length)
      data.doFilter(this.columnNameValue, { exclusiveRowIndexes: [...valid] });
    else
      data.doUnfilter(this.columnNameValue);
  }

  override toJSON(): JsonRecord {
    const json = super.toJSON();
    json.type = 'pivot';
    delete json.tableName;
    return json;
  }

  override fromJSON(json: JsonRecord): void {
    super.fromJSON(json);
    // The pivot binding and the item selection live in the workbook
    // `slicerCaches` section; explicit keys are only a compatibility fallback.
    const names = (Array.isArray(json.pivotTableNames) ? json.pivotTableNames : [json.pivotTableName])
      .map(String).filter(name => name && name !== 'undefined');
    if (names.length) this.customProps.pivotTables = names;
    if (typeof json.columnName === 'string' && json.columnName) this.columnNameValue = json.columnName;
  }
}

/** Pivot timeline: a date-range slicer drawn as a scrollable block timeline. */
export class PivotTableTimelineSlicer extends PivotBoundSlicer {
  timelineData: PivotTimelineData | null = null;
  /** Selection bounds as timestamps; null = everything selected. */
  selectedFrom: number | null = null;
  selectedTo: number | null = null;
  /** Leftmost displayed bucket start (ms). */
  scrollTime = 0;
  /** Live DOM layer (null in tests / offscreen). */
  timelineView: TimelineView | null = null;

  constructor(name?: string) {
    super(name ?? 'pivotTimeline1');
    this.typeName = '3';
    this.customProps.type = 'timeline';
    this.customProps.pivotTables = [];
    this.customProps.captionName = '';
    this.customProps.level = TimelineLevel.months;
    this.customProps.showTimeLevel = true;
    this.customProps.showSelectionLabel = true;
    this.customProps.showHorizontalScrollbar = true;
    this.customProps.style = 'TimeSlicerStyleLight1';
    this.customProps.alt = '';
    this.customProps.canPrint = true;
    // Trial default timeline geometry (black-box probe v12).
    const props = this.propsValue();
    props.width = 345;
    props.height = 145;
    // The trial timeline object does not expose the item-list members of the
    // base slicer; shadow them so the API surface matches.
    const hidden = asRecord(this);
    for (const member of ['multiSelect', 'itemHeight', 'columnCount', 'sortState',
      'showNoDataItems', 'showNoDataItemsInLast', 'visuallyNoDataItems']) hidden[member] = undefined;
  }

  /** Bind to a worksheet pivot date field; the collection calls this after creation. */
  _bindPivot(sheet: Worksheet, ptName: string, field: string): void {
    this._bindSheet(sheet);
    this.timelineData = new PivotTimelineData(
      () => this.pivots()[0] ?? findPivotTarget(this._sheet, ptName), field);
    this.columnNameValue = field;
    this.customProps.pivotTables = [ptName];
    this.customProps.captionName = field;
    this.customProps.slicerCacheName = this.nameInFormula();
    this.propsValue().dynamicMove = true;
    this.initExtent();
  }

  /** Trial: the timeline cache stores only the field's date bounds. */
  _toCacheJSON(tabId: number): JsonRecord | null {
    const times = this.timelineData?.times ?? [];
    return {
      name: this.nameInFormula(),
      sourceName: this.columnNameValue,
      pivotCacheId: PIVOT_SLICER_CACHE_ID,
      pivotTables: this.names().map(name => ({ tabId, name })),
      boundsStartDate: times.length ? new Date(times[0]!).toString() : null,
      boundsEndDate: times.length ? new Date(times[times.length - 1]!).toString() : null,
    };
  }

  initExtent(): void {
    const times = this.timelineData?.times ?? [];
    if (times.length) {
      const months = TimelineLevel.months;
      const from = bucketStart(times[0]!, months);
      const to = bucketEnd(times[times.length - 1]!, months) - 1;
      if (this.selectedFrom === null || this.selectedTo === null) {
        this.selectedFrom = from;
        this.selectedTo = to;
      }
      if (!this.scrollTime) this.scrollTime = from;
    }
  }

  override nameInFormula(): string { return `NativeTimelineCache_${this.columnNameValue}`; }
  sourceName(): string { return this.columnNameValue; }
  protected fieldName(): string { return this.columnNameValue; }

  protected pushSelection(): void {
    this.timelineData?.select(this.selectedFrom, this.selectedTo);
  }

  protected resetSelection(): void {
    this.initExtent();
  }

  protected _refreshData(): void {
    this.timelineData?.refresh();
    this.initExtent();
  }

  override refresh(): void {
    this.timelineData?.refresh();
    this.initExtent();
    this.pushSelection();
    this._sheet?._view()?.schedule();
  }

  level(value?: number): unknown {
    if (value === undefined) return Number(this.customProps.level ?? TimelineLevel.months);
    const level = Number(value);
    if (level !== TimelineLevel.years && level !== TimelineLevel.quarters
      && level !== TimelineLevel.months && level !== TimelineLevel.days) return this;
    this.customProps.level = level;
    this._changed('level');
    return this;
  }

  scrollPosition(value?: Date): unknown {
    // The trial reports `undefined` until a scroll position has been set.
    if (value === undefined) return this._scrollSet === null ? undefined : new Date(this._scrollSet);
    const time = value instanceof Date ? value.getTime() : Number(value);
    if (Number.isFinite(time)) { this._scrollSet = time; this.scrollTime = time; }
    this._sheet?._view()?.schedule();
    return this;
  }

  private _scrollSet: number | null = null;

  showTimeLevel(value?: boolean): unknown { return this.toggle('showTimeLevel', value); }
  showSelectionLabel(value?: boolean): unknown { return this.toggle('showSelectionLabel', value); }
  showHorizontalScrollbar(value?: boolean): unknown { return this.toggle('showHorizontalScrollbar', value); }

  private toggle(key: string, value?: boolean): unknown {
    if (value === undefined) return this.customProps[key] !== false;
    this.customProps[key] = !!value;
    this._changed(key);
    return this;
  }

  private _changed(propertyName: string): void {
    this._sheet?._view()?.schedule();
    const sheet = this._sheet as unknown as { _emit?: (type: string, info: unknown) => void };
    sheet._emit?.('SlicerChanged', { sheet: this._sheet, sheetName: this._sheet?.name(), slicer: this, propertyName });
  }

  override style(value?: string | SlicerStyle | TimelineStyle, shouldCallback?: boolean): SlicerStyle | this {
    if (value === undefined) return this.resolvedStyle();
    if (typeof value === 'string') {
      this.styleObject = null;
      this.customProps.style = value;
    } else {
      const styleName = value.name();
      this.styleObject = value as import('./styles.js').SlicerStyle;
      if (typeof styleName === 'string' && styleName) this.customProps.style = styleName;
    }
    this._sheet?._view()?.schedule();
    if (shouldCallback !== false) this._changed('style');
    return this;
  }

  /** Paint/update the timeline DOM canvas (renderer hook entry). */
  override _renderSlicer(view: WorkbookRenderer): void {
    this.timelineView = renderTimelineView(this, view, this.timelineView ?? undefined);
  }

  /** Offscreen paint for toImageSrc(). */
  override _paintInto(ctx: CanvasRenderingContext2D, zoom: number, dpr = 1): void {
    const width = Math.max(1, Number(this.width()));
    const height = Math.max(1, Number(this.height()));
    ctx.setTransform(zoom * dpr, 0, 0, zoom * dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    paintTimeline(ctx, this.resolvedStyle() as SlicerStyle, this, { zoom, width, height, selected: false });
  }

  /** Hit test for the compare harness: which block sits at the click offset. */
  _timelineHit(x: number, y: number): unknown {
    return timelineHitTest(this, x, y);
  }

  /** Apply a block click / range selection (ms bounds) and filter the pivots. */
  _selectRange(from: number, to: number): void {
    const times = this.timelineData?.times ?? [];
    if (!times.length) return;
    this.selectedFrom = Math.min(from, to);
    this.selectedTo = Math.max(from, to);
    this.pushSelection();
    this._sheet?._view()?.schedule();
  }

  /** Header funnel / "All Periods": select every date again (removes the filter). */
  _clearAll(): void {
    const times = this.timelineData?.times ?? [];
    const months = TimelineLevel.months;
    this.selectedFrom = times.length ? bucketStart(times[0]!, months) : null;
    this.selectedTo = times.length ? bucketEnd(times[times.length - 1]!, months) - 1 : null;
    this.timelineData?.select(null, null);
    this._sheet?._view()?.schedule();
  }

  /** @internal alias used by the view after a level switch. */
  _selectAllExtent(): void { this._clearAll(); }

  /** The base list JSON is not applicable (hidden members); write the trial shape. */
  override toJSON(): JsonRecord {
    const anchors = this._anchors();
    const props = this.propsValue();
    const custom = this.customProps;
    return {
      type: 'timeline',
      slicerCacheName: this.nameInFormula(),
      captionName: this.captionName(),
      disableResizingAndMoving: !!custom.disableResizingAndMoving,
      showHeader: custom.showHeader !== false,
      name: this.name(),
      isSelected: !!this.isSelected(),
      isVisible: this.isVisible() !== false,
      isLocked: this.isLocked() !== false,
      dynamicMove: !!props.dynamicMove,
      dynamicSize: !!props.dynamicSize,
      x: props.x as number,
      y: props.y as number,
      height: props.height as number,
      width: props.width as number,
      startRow: anchors.row,
      startColumn: anchors.col,
      startRowOffset: anchors.dy,
      startColumnOffset: anchors.dx,
      endRow: anchors.endRow,
      endColumn: anchors.endCol,
      endRowOffset: anchors.endDy,
      endColumnOffset: anchors.endDx,
      allowResize: props.allowResize !== false,
      allowMove: props.allowMove !== false,
      toImageSrc: this.toImageSrc(),
      toImageSrcAsync: {},
      alt: String(custom.alt ?? ''),
      canPrint: custom.canPrint !== false,
      nameInFormula: this.nameInFormula(),
      level: this.level(),
      showHorizontalScrollbar: custom.showHorizontalScrollbar !== false,
      showSelectionLabel: custom.showSelectionLabel !== false,
      showTimeLevel: custom.showTimeLevel !== false,
      selectionLevel: this.level(),
      style: String(custom.style ?? 'TimeSlicerStyleLight1'),
    };
  }

  override fromJSON(json: JsonRecord): void {
    this.fromListJson(json);
    if (json.level !== undefined) this.customProps.level = Number(json.level);
    for (const key of ['showTimeLevel', 'showSelectionLabel', 'showHorizontalScrollbar'])
      if (json[key] !== undefined) this.customProps[key] = !!json[key];
    this.timelineData?.refresh();
  }

  /** Base JSON restore without the (hidden) item-list member reads. */
  private fromListJson(json: JsonRecord): void {
    const custom = this.customProps;
    for (const key of ['type', 'captionName', 'disableResizingAndMoving', 'showHeader', 'isSelected', 'isVisible',
      'isLocked', 'dynamicMove', 'dynamicSize', 'allowResize', 'allowMove', 'alt', 'canPrint'])
      if (json[key] !== undefined) custom[key] = json[key];
    if (typeof json.style === 'string') { custom.style = json.style; this.styleObject = null; }
    if (typeof json.name === 'string' && json.name) this.name(json.name, false);
    const names = (Array.isArray(json.pivotTableNames) ? json.pivotTableNames : [json.pivotTableName])
      .map(String).filter(name => name && name !== 'undefined');
    if (names.length) this.customProps.pivotTables = names;
    if (typeof json.columnName === 'string' && json.columnName) this.columnNameValue = json.columnName;
    const props = this.propsValue();
    for (const key of ['x', 'y', 'width', 'height']) if (typeof json[key] === 'number') props[key] = json[key];
    if (json.startRow !== undefined && json.endRow !== undefined && json.startColumn !== undefined && json.endColumn !== undefined)
      this._setAnchors({
        row: Number(json.startRow), col: Number(json.startColumn),
        dx: Number(json.startColumnOffset ?? 0), dy: Number(json.startRowOffset ?? 0),
        endRow: Number(json.endRow), endCol: Number(json.endColumn),
        endDx: Number(json.endColumnOffset ?? 0), endDy: Number(json.endRowOffset ?? 0),
      });
  }
}
