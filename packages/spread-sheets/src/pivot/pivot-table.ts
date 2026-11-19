/**
 * GC.Spread.Pivot.PivotTable (TASK 41 items 1-4).
 * Owns the field model, builds the virtual grid (layout.ts) and writes it
 * into worksheet cells; the public API follows the v19.2.5 contract.
 */
import { Range } from '../primitives.js';
import type { Style } from '../primitives.js';
import { Events } from '../events.js';
import { themeFromValue } from '../themes.js';
import { resolveSource, ResolvedSource, indexToLetters } from './source.js';
import {
  Aggregator, PivotCache, PivotFieldModel, filterRows, labelFilterAllows, sortItems, valueFilterItems,
} from './engine.js';
import { LayoutCell, PivotLayoutModel } from './layout.js';
import { PivotTableTheme, PivotTableStyle, CustomPivotTableThemeManager } from './theme.js';
import { PivotTableThemes } from './theme-statics.js';
import { ConditionRuleBase } from '../features/cf-base.js';
import {
  DataPosition, GrandTotalPosition, PivotDataType, PivotTableFieldType, PivotTableLayoutType,
  SubtotalType, SubtotalsPosition,
} from './types.js';
import type {
  IDataPosition, IDimensionSubtotalsInfo, IFieldInfo, IPivotArea, IPivotConditionFilterInfo,
  IPivotNodeInfo, IPivotItemInfo, IPivotOverwriteNodeInfo, IPivotStyle, IPivotTableOption,
  IPivotTablePosition, IPivotTableRange, IPivotTextFilterInfo, IValueInfo, ISerializeFieldInfo,
  ISerializeInfo, ISourceFieldInfo, IPivotViewSortInfo, PivotSource,
  ICalcFieldInfo, ICalcItemInfo, IDateGroupsInfo, INumberGroupInfo, ITextGroupInfo,
} from './types.js';
import { evaluateCalcFormula, parseCalcFormula, calcFormulaFieldNames } from './calc.js';
import type { CalcValue } from './calc.js';
import { buildDateGroups, buildNumberGroups, buildTextGroups, dateGroupName } from './grouping.js';
import type { DerivedColumn } from './grouping.js';
import { PivotTableViewManager } from './views.js';

/** Worksheet surface the pivot needs (structural typing avoids the import cycle). */
export interface PivotSheet {
  name(): string;
  parent?: { getSheetFromName(name: string): unknown; customPivotTableThemes?: CustomPivotTableThemeManager } & object;
  getValue(row: number, col: number): unknown;
  setValue(row: number, col: number, value: unknown, sheetArea?: number): void;
  setStyle(row: number, col: number, style: Style | null, sheetArea?: number): void;
  setFormatter?(row: number, col: number, formatter: string, sheetArea?: number): void;
  _emit(type: string, info: Record<string, unknown>): void;
  _invalidate?(): void;
  suspendPaint?(): void;
  resumePaint?(): void;
  tables?: { findByName(name: string): { range(): { row: number; col: number; rowCount: number; colCount: number } } | null | undefined };
  getColumnWidth?(col: number): number | undefined;
  setColumnWidth?(col: number, width: number): void;
}

const DEFAULT_OPTIONS: IPivotTableOption = {
  allowMultipleFiltersPerField: false,
  fillDownLabels: false,
  insertBlankLineAfterEachItem: false,
  grandTotalPosition: GrandTotalPosition.both,
  subtotalsPosition: SubtotalsPosition.bottom,
  displayFieldsInPageFilterArea: 0,
  reportFilterFieldsPerColumn: 0,
  bandRows: false,
  bandColumns: false,
  showRowHeader: true,
  showColumnHeader: true,
  showDrill: true,
  showMissing: true,
  rowLabelIndent: 1,
  showFilter: true,
  showToolTip: true,
  mergeItem: false,
  isShowErrorValue: false,
  showHeaders: true,
  calcItemAggregation: 0,
  enableDataValueEditing: false,
  hideValuesRow: true,
};

const GRAND_TOTAL_CAPTION = 'Grand Total';
const ROW_LABELS_CAPTION = 'Row Labels';
const COLUMN_LABELS_CAPTION = 'Column Labels';
const VALUES_CAPTION = 'Values';
/** The trial writes the bare word; the paint layer draws the parentheses. */
const ALL_CAPTION = 'All';

let cacheIdCounter = 100000000;

export class PivotTable {
  options: IPivotTableOption;
  // `views` (TASK 42) stays on the NotImplemented fallback installed from stubs.json.

  private sheet: PivotSheet;
  private row: number;
  private col: number;
  private pivotName: string;
  private layout: PivotTableLayoutType;
  private themeObject: PivotTableTheme | undefined;
  private themeKey: string;
  private sourceInput: PivotSource;
  private resolved: ResolvedSource | undefined;
  private cache = new PivotCache();
  private models: PivotFieldModel[] = [];
  private collapsed = new Map<string, Set<string>>();
  /** Items that were collapsed once and expanded again (trial keeps `false` entries). */
  private expanded = new Map<string, Set<string>>();
  /** Rows surviving the axis label filters (undefined = all rows). */
  private filteredRows: Set<number> | undefined;
  private overwrite = new Map<string, number>();
  private customStyles: IPivotStyle[] = [];
  /** TASK 46: pivot conditional format rules registered via addConditionalRule. */
  private conditionalRules: { areas: IPivotArea[]; rule: ConditionRuleBase }[] = [];
  private valuePos: IDataPosition = { positionType: DataPosition.col, positionIndex: 0, display: false };
  private layoutModel: PivotLayoutModel | undefined;
  /** Axis geometry remembered for the trial JSON (`firstDataRow` etc.). */
  private axis = {
    headerRows: 1, labelCols: 1, valuesOuter: false, colFields: 0, valueFields: 0, contentTop: 0,
  };
  private written: { row: number; col: number }[] = [];
  private suspendCount = 0;
  private cacheId = String(++cacheIdCounter);
  /** workbook-level pivot cache record (trial JSON shape, `pivotCaches`). */
  _autoRefresh = false;
  _showDataAsList: { valueFieldName: string; showDataAsInfo: unknown }[] = [];
  /** Cells the value formatter was written to (so removing it can reset them). */
  private _formatterWritten = new Set<string>();
  /** Attached PivotPanel instances; re-rendered after every model change (TASK 47). */
  _panelInstances = new Set<{ _onModelChanged(): void }>();
  _showNoData = new Map<string, boolean>();
  // ---- TASK 42 state
  /** Saved pivot views (`pivotTable.views`, trial `pivotTables[].views` JSON). */
  readonly views: PivotTableViewManager;
  /** Field groups in cache order (date/text add fields, number regroups). */
  private groups: { name: string; kind: 'date' | 'number' | 'text'; origin: string; spec: Record<string, unknown> }[] = [];
  /** Calculated value fields (`name -> formula`). */
  private calcFields = new Map<string, string>();
  /** Derived cache data from the last build (labels + `fieldGroup` JSON). */
  private derived = new Map<string, DerivedColumn & { kind: string; origin: string }>();

  constructor(
    name: string,
    sheet?: unknown, row?: number, col?: number,
    layout?: PivotTableLayoutType,
    style?: string | PivotTableTheme,
    options?: IPivotTableOption,
    _layoutModel?: unknown,
  ) {
    this.pivotName = String(name ?? '');
    this.sheet = sheet as PivotSheet;
    this.row = row ?? 0;
    this.col = col ?? 0;
    this.layout = (layout ?? PivotTableLayoutType.compact) as PivotTableLayoutType;
    this.options = { ...DEFAULT_OPTIONS, ...(options ?? {}) };
    this.themeKey = 'light0';
    this.themeObject = resolveTheme(style, this.sheet);
    if (this.themeObject) this.themeKey = themeKeyOf(this.themeObject);
    this.sourceInput = '';
    this.views = new PivotTableViewManager(
      config => this.deserialize(config),
      () => this.serialize(),
    );
  }

  /** @internal initial wiring performed by the manager. */
  _init(source: PivotSource, row: number, col: number): void {
    this.sourceInput = source;
    this.row = row;
    this.col = col;
    this._buildCache();
    this._apply();
  }

  // ---------------------------------------------------------------- fields

  private _buildCache(): void {
    try {
      this.resolved = resolveSource(this.sheet as never, this.sourceInput);
    } catch {
      this.resolved = { ref: '', fields: [], rows: [], autoRefresh: false };
    }
    this._autoRefresh = this.resolved.autoRefresh;
    this.cache.build(this.resolved.fields, this.resolved.rows);
    this.derived.clear();
    this._applyGroupsToCache();
    // calculated value fields live in the cache as formula-only placeholders
    for (const name of this.calcFields.keys())
      this.cache.addDerivedField(name, this.cache.rows.map(() => null), PivotDataType.number);
    // calculated items extend the axis field's item list (trial appends them)
    for (const model of this.models)
      if (model.calcItems?.size) this._materialiseCalcItems(model);
    const names = new Set(this.cache.fields.map(field => field.name));
    const seen = new Set(this.models.map(model => model.sourceName));
    for (const name of names) {
      if (seen.has(name)) continue;
      const cacheField = this.cache.fields[this.cache.fieldIndex.get(name)!];
      this.models.push({
        sourceName: name,
        displayName: name,
        area: -1,
        index: -1,
        dataType: cacheField?.dataType ?? PivotDataType.string,
        isShowSubtotalTop: false,
      });
    }
    for (const model of this.models) {
      const group = this.derived.get(model.sourceName);
      if (group) {
        model.isGroup = true;
        model.groupOrigin = group.origin;
        if (group.kind === 'date') {
          model.dataType = PivotDataType.date;
          if (group.start) model.groupStart = group.start;
          if (group.end) model.groupEnd = group.end;
        } else if (group.kind === 'number') {
          model.groupStart = group.fieldGroup.startNum as number;
          model.groupEnd = group.fieldGroup.endNum as number;
        }
      } else if (this.calcFields.has(model.sourceName)) {
        model.calcFormula = this.calcFields.get(model.sourceName);
        model.dataType = PivotDataType.number;
      }
      // number grouping keeps the raw field name but groups its items
      if (this.derived.has(model.sourceName)) model.isGroup = true;
    }
    this.models = this.models.filter(model =>
      names.has(model.sourceName) || this.calcFields.has(model.sourceName) || model.area !== -1);
  }

  /** Rebuilds the derived cache fields from the registered groups. */
  private _applyGroupsToCache(): void {
    for (const group of this.groups) {
      const originIndex = this.cache.fieldIndex.get(group.origin);
      if (originIndex === undefined) continue;
      const origin = this.cache.fields[originIndex]!;
      const values = this.cache.rows.map(row => row[originIndex]);
      if (group.kind === 'date') {
        const spec = group.spec as { by: number; groupInterval?: number; start?: Date; end?: Date };
        const derived = buildDateGroups(values, spec.by, spec);
        this.cache.addDerivedField(group.name, derived.column, PivotDataType.string, derived.items);
        this.cache.fields[this.cache.fieldIndex.get(group.name)!]!.fieldGroup = derived.fieldGroup;
        // the origin field gains the trial's `fieldGroup: { par: 2 }` marker
        origin.fieldGroup = { par: 2 };
        origin.dataType = PivotDataType.date;
        this.derived.set(group.name, { ...derived, kind: 'date', origin: group.origin });
      } else if (group.kind === 'number') {
        const spec = group.spec as { by: number; start?: number; end?: number };
        const derived = buildNumberGroups(values, spec);
        this.cache.regroupField(group.origin, derived.column, derived.items);
        origin.fieldGroup = { ...derived.fieldGroup, groupItems: (derived.fieldGroup.groupItems as unknown[]) };
        this.derived.set(group.origin, { ...derived, kind: 'number', origin: group.origin });
      } else {
        const spec = group.spec as { fieldName: string; groupItems: Record<string, (string | number)[]> };
        const derived = buildTextGroups(values, spec, origin.items);
        this.cache.addDerivedField(group.name, derived.column, PivotDataType.string);
        this.cache.fields[this.cache.fieldIndex.get(group.name)!]!.fieldGroup = derived.fieldGroup;
        this.derived.set(group.name, { ...derived, kind: 'text', origin: group.origin });
      }
    }
    // `base` is the origin field's cache index; the date origin gains a
    // `fieldGroup: { par }` marker counting its groups (trial JSON).
    for (const derived of this.derived.values()) {
      const originIndex = this.cache.fieldIndex.get(derived.origin);
      if (derived.fieldGroup && originIndex !== undefined)
        derived.fieldGroup.base = originIndex;
      if (derived.kind === 'number') {
        const origin = this.cache.fields[originIndex!]!;
        origin.fieldGroup = derived.fieldGroup;
      }
    }
    for (const origin of new Set(this.groups.filter(g => g.kind === 'date').map(g => g.origin))) {
      const count = this.groups.filter(g => g.kind === 'date' && g.origin === origin).length;
      const field = this.cache.fields[this.cache.fieldIndex.get(origin)!];
      if (field) field.fieldGroup = { par: count + 2 };
    }
  }

  private _materialiseCalcItems(model: PivotFieldModel): void {
    const index = this.cache.fieldIndex.get(model.sourceName);
    if (index === undefined) return;
    const field = this.cache.fields[index]!;
    field.calcItems ??= new Set();
    for (const name of model.calcItems?.keys() ?? []) {
      if (field.itemIndex.has(name)) {
        field.calcItems.add(name);
        continue;
      }
      field.calcItems.add(name);
      field.itemIndex.set(name, field.items.length);
      field.items.push(name);
      field.buckets.push([]);
    }
  }

  private areaFields(area: PivotTableFieldType): PivotFieldModel[] {
    return this.models.filter(model => model.area === area).sort((a, b) => a.index - b.index);
  }

  // ------------------------------------------------------------------ API

  name(name?: string): string | void {
    if (name === undefined) return this.pivotName;
    const manager = (this.sheet as unknown as { pivotTables?: { _rename(oldName: string, newName: string): void } }).pivotTables;
    manager?._rename?.(this.pivotName, String(name));
    this.pivotName = String(name);
  }

  position(row?: number, col?: number, sheetName?: string): IPivotTablePosition | void {
    if (row === undefined && col === undefined) {
      const top = this.layoutModel ? this.row + this.layoutModel.contentTop : this.row;
      const left = this.layoutModel ? this.col + this.layoutModel.contentLeft : this.col;
      return { row: top, col: left, sheetName: this.sheet.name() };
    }
    if (sheetName && this.sheet.parent?.getSheetFromName) {
      const target = this.sheet.parent.getSheetFromName(sheetName) as PivotSheet | null;
      if (target && target !== this.sheet) {
        const manager = (this.sheet as unknown as { pivotTables?: { _detach(p: PivotTable): void } }).pivotTables;
        manager?._detach?.(this);
        this.sheet = target;
        (target as unknown as { pivotTables?: { _attach(p: PivotTable): void } }).pivotTables?._attach?.(this);
      }
    }
    if (typeof row === 'number') this.row = row;
    if (typeof col === 'number') this.col = col;
    this._apply();
  }

  layoutType(type?: PivotTableLayoutType): PivotTableLayoutType {
    if (type === undefined) return this.layout;
    this.layout = type as PivotTableLayoutType;
    this._apply();
    return this.layout;
  }

  theme(theme?: string | PivotTableTheme): void | PivotTableTheme {
    if (theme === undefined) return this.themeObject ?? getBuiltInTheme(this.themeKey);
    const resolved = resolveTheme(theme, this.sheet);
    if (resolved) {
      this.themeObject = resolved;
      this.themeKey = themeKeyOf(resolved);
      this._apply();
    }
  }

  getThemeName(): string | undefined {
    const theme = this.themeObject ?? getBuiltInTheme(this.themeKey);
    return theme ? String(theme.name()) : undefined;
  }

  /**
   * The trial reports a table source as `=name` and a range source verbatim as
   * entered (a dialog-created `=Sheet!$A$1:$F$5` keeps its `=` and `$`).
   */
  getSource(): PivotSource {
    if (typeof this.sourceInput === 'string' && this.sourceInput) {
      const isTable = this.resolved && this.resolved.ref.startsWith('=');
      return isTable ? this.resolved!.ref : this.sourceInput;
    }
    return this.resolved?.ref ?? this.sourceInput;
  }
  get dataSource(): string { return String(this.getSource()); }

  updateSource(source?: PivotSource): void {
    if (source !== undefined) this.sourceInput = source;
    this._buildCache();
    this._apply();
  }

  getSourceFields(): ISourceFieldInfo[] {
    if (!this.resolved) return [];
    return this.cache.fields.map(field => {
      const info: ISourceFieldInfo = { name: field.name };
      if (this.derived.has(field.name)) info.fieldType = 1 /* isGroupField */;
      else if (this.calcFields.has(field.name)) info.fieldType = 0; /* isCalcField */
      return info;
    });
  }

  getField(fieldName: string): IFieldInfo | undefined {
    const model = this.fieldFor(fieldName);
    return model ? this.fieldInfo(model) : undefined;
  }

  private fieldInfo(model: PivotFieldModel): IFieldInfo {
    const info: IFieldInfo = {
      fieldName: model.displayName,
      sourceName: model.sourceName,
      dataType: model.dataType,
      pivotArea: model.area as PivotTableFieldType,
      pivotIndex: model.index,
    };
    const cacheField = this.cache.fields[this.cache.fieldIndex.get(model.sourceName)!];
    const derived = this.derived.get(model.sourceName);
    if (derived?.kind === 'number') {
      info.start = derived.fieldGroup.startNum as number;
      info.end = derived.fieldGroup.endNum as number;
    } else if (derived?.kind === 'date' && derived.start) {
      info.start = derived.start;
      info.end = derived.end as Date;
    } else if (model.area === PivotTableFieldType.valueField && cacheField?.min !== undefined) {
      // Trial: a data field with missing cells reports an empty `start`.
      info.start = (cacheField.blanks ? '' : cacheField.min) as number;
      info.end = cacheField.max;
    }
    return info;
  }

  getFieldsByArea(area?: PivotTableFieldType): IFieldInfo[] {
    const rank: Record<number, number> = { [PivotTableFieldType.rowField]: 0, [PivotTableFieldType.filterField]: 1, [PivotTableFieldType.columnField]: 2, [PivotTableFieldType.valueField]: 3 };
    const models = area === undefined
      ? this.models.filter(model => model.area !== -1).sort((a, b) => rank[a.area as number] - rank[b.area as number] || a.index - b.index)
      : this.areaFields(area);
    return models.map(model => this.fieldInfo(model));
  }

  add(sourceName: string, displayName: string, area: number, subtotal?: SubtotalType, index?: number): void {
    const areaValue = area as PivotTableFieldType;
    let model: PivotFieldModel | undefined;
    if (areaValue === PivotTableFieldType.valueField) {
      // The same source field can sit in the data area several times.
      model = this.models.find(m => m.sourceName === sourceName && m.area === areaValue
        && (displayName === undefined || displayName === null
          ? m.subtotal === (subtotal ?? SubtotalType.sum)
          : m.displayName === displayName));
      if (!model) model = this.models.find(m => m.sourceName === sourceName && m.area === -1);
      if (!model) {
        model = {
          sourceName, displayName: displayName ?? sourceName, area: -1, index: -1,
          dataType: this.cacheType(sourceName), isShowSubtotalTop: false,
        };
        this.models.push(model);
      }
    } else {
      model = this.models.find(m => m.sourceName === sourceName);
      if (!model) {
        model = {
          sourceName, displayName: displayName ?? sourceName, area: -1, index: -1,
          dataType: this.cacheType(sourceName), isShowSubtotalTop: false,
        };
        this.models.push(model);
      }
    }
    model.displayName = displayName ?? sourceName;
    if (areaValue === PivotTableFieldType.valueField && subtotal === undefined && model.subtotal === undefined)
      model.subtotal = SubtotalType.sum;
    else if (subtotal !== undefined) model.subtotal = subtotal;
    const siblings = this.areaFields(areaValue).filter(m => m !== model);
    const at = index === undefined || index < 0 ? siblings.length : Math.min(index, siblings.length);
    for (const sibling of siblings) if (sibling.index >= at) sibling.index++;
    model.area = areaValue;
    model.index = at;
    this._apply();
  }

  private cacheType(sourceName: string): PivotDataType {
    const index = this.cache.fieldIndex.get(sourceName);
    return index === undefined ? PivotDataType.string : this.cache.fields[index]!.dataType;
  }

  /** Moves or removes (`updateField(name, -1)`) a field between areas. */
  updateField(name: string, area: PivotTableFieldType, index?: number): void {
    const model = this.models.find(m => m.sourceName === name || m.displayName === name);
    if (!model) return;
    if (model.area !== -1 && model.area !== area) {
      const oldSiblings = this.areaFields(model.area).filter(m => m !== model);
      oldSiblings.forEach((sibling, i) => { sibling.index = i; });
    }
    if (area === (-1 as PivotTableFieldType)) { model.area = -1; model.index = -1; }
    else this.add(model.sourceName, model.displayName, area, model.subtotal, index);
    this._apply();
  }

  updateFieldName(oldName: string, newName: string): void {
    const model = this.models.find(m => m.sourceName === oldName || m.displayName === oldName);
    if (!model) return;
    model.displayName = newName;
    for (const valueField of this.areaFields(PivotTableFieldType.valueField))
      if (valueField !== model && valueField.displayName === oldName) valueField.displayName = newName;
    this._apply();
  }

  remove(fieldName: string): void {
    const model = this.models.find(m => (m.sourceName === fieldName || m.displayName === fieldName) && m.area !== -1);
    if (!model) return;
    const area = model.area as PivotTableFieldType;
    model.area = -1;
    model.index = -1;
    this.areaFields(area).forEach((sibling, i) => { sibling.index = i; });
    this._apply();
  }

  getItemsByField(fieldName: string, sorted?: boolean): unknown[] {
    const model = this.fieldFor(fieldName);
    // The trial exposes items only for fields placed in an area.
    if (!model || model.area === -1) return undefined as never;
    const cacheIndex = this.cache.fieldIndex.get(model.sourceName);
    if (cacheIndex === undefined) return [];
    const items = this.cache.fields[cacheIndex]!.items.slice();
    if (!sorted) return items;
    if (model) {
      return sortItems(this.cache, model, items);
    }
    return items.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  }

  // ------------------------------------------------------- pivot slicers (TASK 42 item 4)

  /** @internal distinct (cache key, display text) pairs for a slicer over a field. */
  _slicerFieldItems(fieldName: string): { key: string; text: string }[] {
    const index = this.cache.fieldIndex.get(fieldName);
    if (index === undefined) return [];
    const field = this.cache.fields[index]!;
    return field.items.map(key => ({
      key,
      text: field.dataType === PivotDataType.date ? String(usDateFromKey(key)) : key,
    }));
  }

  /** @internal timeline data: sorted unique date times (ms) of a date field. */
  _timelineDates(fieldName: string): number[] {
    const index = this.cache.fieldIndex.get(fieldName);
    if (index === undefined) return [];
    const out: number[] = [];
    for (const key of this.cache.fields[index]!.items) {
      const time = Number(key);
      if (Number.isFinite(time)) out.push(time);
    }
    return out.sort((a, b) => a - b);
  }

  /** @internal applies an item-slicer selection (null = everything selected).
   *  Like the trial, the selection ALSO surfaces as the field's text label
   *  filter (serialize().fieldsInfo, `items[].hidden` in the pivot JSON); the
   *  filter we manage is marked so a user-set dropdown filter is not clobbered. */
  _setSlicerSelection(fieldName: string, keys: readonly string[] | null): void {
    const model = this._ensureFieldModel(fieldName);
    if (!model) return;
    const set = keys === null ? null : new Set(keys);
    model.slicerItems = set;
    const allCount = this._cacheItemCount(model.sourceName);
    const filtered = set !== null && set.size < allCount ? set : null;
    if (model.area !== -1) {
      const managed = (model.labelFilter as { slicerManaged?: boolean } | undefined)?.slicerManaged;
      if (filtered) {
        const index = this.cache.fieldIndex.get(model.sourceName);
        const list = index === undefined ? [] : this.cache.fields[index]!.items.filter(item => filtered.has(item));
        model.labelFilter = { kind: 'text', textItem: { list, isAll: false }, slicerManaged: true } as never;
      }
      else if (managed) delete model.labelFilter;
    }
    this._apply();
  }

  private _cacheItemCount(sourceName: string): number {
    const index = this.cache.fieldIndex.get(sourceName);
    return index === undefined ? 0 : this.cache.fields[index]!.items.length;
  }

  /** @internal applies a timeline date range in cache keys (null = no filter). */
  _setTimelineSelection(fieldName: string, range: { from: string; to: string } | null): void {
    const model = this._ensureFieldModel(fieldName);
    if (!model) return;
    model.timelineRange = range;
    this._apply();
  }

  /** @internal whether a (field,item) still has data rows under the OTHER slicers. */
  _slicerItemHasData(fieldName: string, key: string, exceptField: string): boolean {
    const selectionRows = this._slicerRowFilter(exceptField);
    if (!selectionRows) return true;
    const index = this.cache.fieldIndex.get(fieldName);
    if (index === undefined) return false;
    const field = this.cache.fields[index]!;
    const item = field.itemIndex.get(key);
    if (item === undefined) return false;
    return field.buckets[item]!.some(row => selectionRows.has(row));
  }

  /** Slicer members of the `PivotTable` contract: sheet slicers bound to this table. */
  connectSlicer(name: string): void {
    this._sheetSlicer(name)?._connectPivot(this as unknown as object);
  }

  disconnectSlicer(name: string): void {
    this._sheetSlicer(name)?._disconnectPivot(this as unknown as object);
  }

  isConnectedSlicer(name: string): boolean {
    const slicer = this._sheetSlicer(name);
    return !!slicer && slicer._connectedPivotNames().includes(String(this.pivotName));
  }

  getAllSlicers(): unknown[] {
    const holder = this.sheet as unknown as { slicers?: { all(): unknown[] } };
    const out: unknown[] = [];
    for (const slicer of holder.slicers?.all() ?? [])
      if (this._connectedPivots(slicer).some(pivot => pivot === this)) out.push(slicer);
    return out;
  }

  private _sheetSlicer(name: string): {
    _connectPivot(pivot: object): void; _disconnectPivot(pivot: object): void;
    _connectedPivots(): object[]; _connectedPivotNames(): string[];
  } | undefined {
    const holder = this.sheet as unknown as {
      slicers?: { get(n: string): {
        _connectPivot(pivot: object): void; _disconnectPivot(pivot: object): void;
        _connectedPivots(): object[]; _connectedPivotNames(): string[];
      } | undefined } };
    return holder.slicers?.get(String(name));
  }

  private _connectedPivots(slicer: unknown): object[] {
    const get = (slicer as { _connectedPivots?: () => object[] })._connectedPivots;
    return typeof get === 'function' ? get.call(slicer) : [];
  }

  private _ensureFieldModel(sourceName: string): PivotFieldModel | undefined {
    let model = this.models.find(m => m.sourceName === sourceName);
    if (model) return model;
    const index = this.cache.fieldIndex.get(sourceName);
    if (index === undefined) return undefined;
    model = {
      sourceName, displayName: sourceName, area: -1, index: -1,
      dataType: this.cache.fields[index]!.dataType, isShowSubtotalTop: false,
    };
    this.models.push(model);
    return model;
  }

  /** Rows surviving every item-slicer selection and timeline range (undefined = all). */
  private _slicerRowFilter(exceptField?: string): Set<number> | undefined {
    let out: Set<number> | undefined;
    const keep = (rows: readonly number[]): void => {
      const set = new Set(rows);
      out = out === undefined ? set : new Set([...out].filter(r => set.has(r)));
    };
    for (const model of this.models) {
      if (model.sourceName === exceptField) continue;
      const index = this.cache.fieldIndex.get(model.sourceName);
      if (model.slicerItems?.size) {
        if (index === undefined) { keep([]); continue; }
        const field = this.cache.fields[index]!;
        const rows: number[] = [];
        for (const key of model.slicerItems) {
          const item = field.itemIndex.get(key);
          if (item !== undefined) rows.push(...field.buckets[item]!);
        }
        keep(rows);
      }
      if (model.timelineRange) {
        if (index === undefined) { keep([]); continue; }
        const from = Number(model.timelineRange.from);
        const to = Number(model.timelineRange.to);
        const rows: number[] = [];
        for (let row = 0; row < this.cache.rows.length; row++) {
          const value = this.cache.displayValue(row, index);
          const time = value instanceof Date ? value.getTime() : typeof value === 'number' ? value : Number(value);
          if (Number.isFinite(time) && time >= from && time <= to) rows.push(row);
        }
        keep(rows);
      }
    }
    return out;
  }

  // ------------------------------------------------------------- filters

  private fieldFor(name: string): PivotFieldModel | undefined {
    return this.models.find(model => model.displayName === name)
      ?? this.models.find(model => model.sourceName === name);
  }

  labelFilter(fieldName: string, filterInfo?: (IPivotTextFilterInfo | IPivotConditionFilterInfo) | null): IPivotTextFilterInfo | IPivotConditionFilterInfo | void {
    const model = this.fieldFor(fieldName);
    if (!model) return undefined;
    if (filterInfo === undefined) return model.labelFilter ? stripFilterKind(model.labelFilter) : undefined;
    model.labelFilter = filterInfo ? ({ ...filterInfo, kind: 'textItem' in filterInfo ? 'text' : 'condition' } as never) : undefined;
    this._apply();
  }

  valueFilter(fieldName: string, filterInfo?: IPivotConditionFilterInfo | null): IPivotConditionFilterInfo | void {
    const model = this.fieldFor(fieldName);
    if (!model) return undefined;
    if (filterInfo === undefined) return model.valueFilter ? stripFilterKind(model.valueFilter) : undefined;
    model.valueFilter = filterInfo ? { ...filterInfo, kind: 'condition' } as never : undefined;
    this._apply();
  }

  // --------------------------------------------------------------- sorting

  sort(fieldName: string, sortInfo: IPivotViewSortInfo): IPivotViewSortInfo | void {
    const model = this.fieldFor(fieldName);
    if (!model) return undefined;
    if (sortInfo === undefined) return model.sortInfo as never;
    model.sortInfo = sortInfo;
    this._apply();
    return model.sortInfo;
  }

  autoSortState(fieldName: string, enabled?: boolean): boolean | void {
    const model = this.fieldFor(fieldName);
    if (!model) return undefined;
    if (enabled === undefined) return (model as unknown as { autoSort?: boolean }).autoSort ?? false;
    (model as unknown as { autoSort?: boolean }).autoSort = enabled;
  }

  // ------------------------------------------------------------ subtotals

  subtotalType(fieldName: string, type?: SubtotalType): SubtotalType | void {
    const model = this.fieldFor(fieldName);
    if (!model) return undefined;
    if (type === undefined) return model.subtotal;
    const previous = model.subtotal;
    model.subtotal = type;
    if (model.area !== PivotTableFieldType.valueField) {
      this.add(model.sourceName, model.displayName, PivotTableFieldType.valueField, type);
      return;
    }
    // Trial parity: changing the aggregation renames an auto-named value field ('Sum of Q1' -> 'Count of Q1').
    const suffix = ` of ${model.sourceName}`;
    if (model.displayName.endsWith(suffix)) {
      const labels: Record<number, string> = { 0: 'Average', 1: 'Count', 2: 'Count Numbers', 3: 'Max', 4: 'Min', 5: 'Product', 6: 'StdDev', 7: 'StdDevp', 8: 'Sum', 9: 'Var', 10: 'Varp' };
      const previousLabel = previous === undefined ? undefined : labels[previous];
      if (previousLabel === undefined || model.displayName === `${previousLabel}${suffix}`) model.displayName = `${labels[type] ?? 'Sum'}${suffix}`;
    }
    this._apply();
  }

  subtotalPosition(fieldName: string, position: SubtotalsPosition): SubtotalsPosition | void {
    const model = this.fieldFor(fieldName);
    if (!model) return undefined;
    if (position === undefined) return model.isShowSubtotalTop ? SubtotalsPosition.top : SubtotalsPosition.bottom;
    model.isShowSubtotalTop = position === SubtotalsPosition.top;
    if (position === SubtotalsPosition.none) model.isShowSubtotal = false;
    else if (model.isShowSubtotal === undefined) model.isShowSubtotal = true;
    this._apply();
    return position;
  }

  subtotalVisible(fieldName: string, isVisible: boolean): boolean {
    const model = this.fieldFor(fieldName);
    if (!model) return false;
    if (isVisible === undefined) return this.subtotalShown(model);
    model.isShowSubtotal = !!isVisible;
    this._apply();
    return !!isVisible;
  }

  dimensionSubtotals(sourceName: string, info?: IDimensionSubtotalsInfo): IDimensionSubtotalsInfo | void {
    const model = this.fieldFor(sourceName);
    if (!model) return undefined;
    if (info === undefined) return model.dimensionSubtotals ?? { useDefault: true, types: [] };
    model.dimensionSubtotals = info;
    this._apply();
  }

  showDataAs(fieldName: string, showDataAsInfo?: { showDataAs: number; baseFieldName?: string; baseFieldItemType?: number; baseFieldItem?: string }): unknown {
    const model = this.fieldFor(fieldName);
    if (!model) return undefined;
    if (showDataAsInfo === undefined) return model.showDataAsInfo as never ?? { showDataAs: 0 };
    (model as unknown as { showDataAsInfo?: unknown }).showDataAsInfo = showDataAsInfo;
    this._showDataAsList = this._showDataAsList.filter(entry => entry.valueFieldName !== fieldName);
    this._showDataAsList.push({ valueFieldName: fieldName, showDataAsInfo });
    this._apply();
  }

  /**
   * @internal Designer support (TASK 47): the dialog number format of one field.
   * Value fields: set via Value Field Settings > Number Format (applied to the
   * value/subtotal/grand cells of that value field). Other fields: Field
   * Settings > Label Format (applied to the field's row-label cells — the
   * formatter only, like the trial's label formatter for text columns).
   */
  _fieldFormatter(fieldName: string, formatter?: string | null): string | undefined {
    const model = this.fieldFor(fieldName);
    if (!model) return undefined;
    const store = model as unknown as { formatter?: string | null };
    if (formatter === undefined) return store.formatter ?? undefined;
    store.formatter = formatter && formatter !== 'General' ? formatter : null;
    this._apply();
    return store.formatter ?? undefined;
  }

  /** @internal formatter of the value field a layout node shows (name + subtotal match). */
  private formatterForValue(valueInfo?: { sourceName: string; subtotalType: SubtotalType }): string | undefined {
    if (!valueInfo) return undefined;
    for (const model of this.models) {
      if (model.area === PivotTableFieldType.valueField && model.subtotal === valueInfo.subtotalType
        && (model.sourceName === valueInfo.sourceName || model.displayName === valueInfo.sourceName)) {
        return (model as unknown as { formatter?: string | undefined }).formatter ?? undefined;
      }
    }
    return undefined;
  }

  /** @internal formatter of the row-field model a row-label cell belongs to. */
  private formatterForLabel(fieldInfos?: { fieldName: string }[]): string | undefined {
    for (const info of fieldInfos ?? []) {
      const model = this.models.find((candidate) => candidate.displayName === info.fieldName || candidate.sourceName === info.fieldName);
      const fmt = model && (model as unknown as { formatter?: string | undefined }).formatter;
      if (fmt) return fmt;
    }
    return undefined;
  }

  showNoData(cacheFieldName: string, isShow: boolean): boolean {
    const model = this.fieldFor(cacheFieldName);
    if (!model) return false;
    if (isShow === undefined) return model.showNoData ?? false;
    model.showNoData = !!isShow;
    this._showNoData.set(cacheFieldName, !!isShow);
    return !!isShow;
  }

  dataPosition(positionType?: DataPosition, positionIndex?: number, display?: boolean): IDataPosition | void {
    if (positionType === undefined) return { ...this.valuePos, display: this.valuesRowShown() };
    this.valuePos = { positionType, positionIndex: positionIndex ?? 0, display: display ?? false };
    this._apply();
  }

  // ------------------------------------------------------------ collapsing

  collapse(fieldName: string, item: string, isCollapse?: boolean): boolean | void {
    const model = this.fieldFor(fieldName);
    const key = model?.sourceName ?? fieldName;
    let set = this.collapsed.get(key);
    if (isCollapse === undefined) return !!set?.has(String(item));
    if (!set) { set = new Set(); this.collapsed.set(key, set); }
    if (isCollapse) {
      set.add(String(item));
      this.expanded.get(key)?.delete(String(item));
    } else {
      if (set.delete(String(item)))
        (this.expanded.get(key) ?? this.expanded.set(key, new Set()).get(key)!).add(String(item));
    }
    this._apply();
    return !!isCollapse;
  }

  // ------------------------------------------------------- node accessors

  private nodeKey(fieldInfos: IPivotItemInfo[], valueInfo: IValueInfo): string {
    const fields = (fieldInfos ?? []).map(info => `${info.fieldName}\u0000${info.fieldItem}`).join('\u0001');
    return `${fields}\u0002${valueInfo.sourceName}\u0003${valueInfo.subtotalType}`;
  }

  getRange(): IPivotTableRange {
    if (!this.layoutModel) return { page: null, content: null as never };
    const model = this.layoutModel;
    const contentRange = new Range(this.row + model.contentTop, this.col + model.contentLeft, model.contentRowCount, model.contentColCount);
    const page = model.pageRowCount > 0
      ? new Range(this.row + model.contentTop - model.pageRowCount - 1, this.col + model.pageLeft, model.pageRowCount, model.pageColCount)
      : null;
    return { page, content: contentRange };
  }

  getNodeInfo(row: number, col: number): IPivotNodeInfo | undefined {
    const cell = this.cellAt(row, col);
    return cell?.node ? { fieldInfos: cell.node.fieldInfos.map(info => ({ ...info })), valueInfo: { ...cell.node.valueInfo } } : undefined;
  }

  getNodeValue(nodeInfo: IPivotNodeInfo): number {
    if (!nodeInfo) return undefined as never;
    const key = this.nodeKey(nodeInfo.fieldInfos ?? [], nodeInfo.valueInfo);
    const value = this.overwrite.get(key);
    if (value !== undefined) return value;
    // The trial reports null for calculated fields/items without an overwrite.
    const cell = this.findValueCell(nodeInfo);
    if (cell?.node) {
      const valueModel = this.fieldFor(nodeInfo.valueInfo?.sourceName ?? '');
      if (valueModel?.calcFormula || this.calcFields.has(valueModel?.sourceName ?? '')) return null as never;
      if ((nodeInfo.fieldInfos ?? []).some(info => this.fieldFor(info.fieldName)?.calcItems?.size))
        return null as never;
    }
    return undefined as never;
  }

  setNodeValue(nodeInfo: IPivotNodeInfo, value?: number): void {
    if (!nodeInfo) return;
    const key = this.nodeKey(nodeInfo.fieldInfos ?? [], nodeInfo.valueInfo);
    if (value === undefined) this.overwrite.delete(key);
    else this.overwrite.set(key, Number(value));
    const cell = this.findValueCell(nodeInfo);
    if (cell) this.writeCell(cell);
  }

  getOverwriteList(): IPivotOverwriteNodeInfo[] {
    return [...this.overwrite.entries()].map(([key, value]) => {
      const [fieldsPart, valuePart] = key.split('\u0002');
      const [sourceName, subtotalType] = valuePart!.split('\u0003');
      const fieldInfos = fieldsPart && fieldsPart.length
        ? fieldsPart.split('\u0001').map(entry => {
            const [fieldName, fieldItem] = entry.split('\u0000');
            return { fieldName: fieldName!, fieldItem: fieldItem! };
          })
        : [];
      return { fieldInfos, valueInfo: { sourceName: sourceName!, subtotalType: Number(subtotalType) as SubtotalType }, value };
    });
  }

  clearOverwriteList(): void {
    this.overwrite.clear();
    this._apply();
  }

  private findValueCell(nodeInfo: IPivotNodeInfo): LayoutCell | undefined {
    const key = this.nodeKey(nodeInfo.fieldInfos ?? [], nodeInfo.valueInfo);
    return this.layoutModel?.cells.find(cell => cell.node && this.nodeKey(cell.node.fieldInfos, cell.node.valueInfo) === key && cell.value !== undefined);
  }

  private cellAt(row: number, col: number): LayoutCell | undefined {
    if (!this.layoutModel) return undefined;
    const r = row - this.row, c = col - this.col;
    return this.layoutModel.cells.find(cell => cell.row === r && cell.col === c);
  }

  // --------------------------------------------------------- GETPIVOTDATA

  /** @internal case-insensitive model lookup (GETPIVOTDATA field names). */
  /** @internal whether one data-area node answers a GETPIVOTDATA `data_name`
   * (case-sensitive: the trial rejects `sum of amount`-style captions). */
  private _matchesDataCaption(valueInfo: IValueInfo, dataName: string): boolean {
    return dataName !== '' && valueInfo.sourceName === dataName;
  }

  /**
   * @internal value lookup for the GETPIVOTDATA formula (TASK 42 item 3).
   * Field/item pairs fix the axis positions; axis fields the formula omits
   * fall back to their total level (Excel semantics). A reference into a
   * data cell supplies its whole position when no pairs are passed.
   * The trial is strict: names and items match case-sensitively, numeric
   * item indexes and `(all)` pseudo-items are not accepted, and there is no
   * special `Data` pseudo-field. Returns `undefined` for a lookup the trial
   * answers with `#REF!`.
   */
  _getDataFieldValue(
    dataName: string,
    pairs: readonly (readonly [string, string | number])[],
    refRow?: number,
    refCol?: number,
  ): number | null | undefined {
    if (!this.layoutModel) return undefined;
    const cells = this.layoutModel.cells.filter(cell => cell.node
      && (cell.kind === 'value' || cell.kind === 'subtotalValue' || cell.kind === 'grandValue'));
    if (!cells.length) return undefined;

    let data = String(dataName ?? '');
    const wanted: { model: PivotFieldModel; item: string }[] = [];
    for (const [rawField, rawItem] of pairs) {
      if (typeof rawItem !== 'string') return undefined; // the trial rejects numeric items
      const fieldName = String(rawField);
      const model = this.models.find(m =>
        (m.area === PivotTableFieldType.rowField || m.area === PivotTableFieldType.columnField)
        && (m.displayName === fieldName || m.sourceName === fieldName));
      if (!model) return undefined;
      wanted.push({ model, item: rawItem });
    }

    const refCell = refRow !== undefined && refCol !== undefined ? this.cellAt(refRow, refCol) : undefined;
    const implicit = wanted.length === 0 && refCell?.node
      && (refCell.kind === 'value' || refCell.kind === 'subtotalValue' || refCell.kind === 'grandValue')
      ? refCell.node : undefined;
    if (implicit && !data) data = implicit.valueInfo.sourceName;
    if (!data) return undefined;

    const axis = [...this.areaFields(PivotTableFieldType.rowField), ...this.areaFields(PivotTableFieldType.columnField)];
    const hit = cells.find(cell => {
      const node = cell.node!;
      if (!this._matchesDataCaption(node.valueInfo, data)) return false;
      for (const { model, item } of wanted) {
        const entry = node.fieldInfos.find(info => info.fieldName === model.sourceName);
        if (!entry || String(entry.fieldItem) !== item) return false;
      }
      if (implicit) return node === implicit;
      for (const model of axis) {
        if (wanted.some(w => w.model === model)) continue;
        if (node.fieldInfos.some(info => info.fieldName === model.sourceName)) return false;
      }
      return true;
    });
    if (!hit) return undefined;
    const over = this.overwrite.get(this.nodeKey(hit.node!.fieldInfos, hit.node!.valueInfo));
    if (over !== undefined) return over;
    return hit.value === undefined ? 0 : hit.value;
  }

  /** @internal double-click drill-down (TASK 42 item 2): writes the details
   * of a data cell into a new worksheet, like the trial's show-details. */
  _showDetails(row: number, col: number): boolean {
    const cell = this.cellAt(row, col);
    if (!cell?.node) return false;
    const details = this.getPivotDetails(cell.node.fieldInfos) as unknown[][] | undefined;
    if (!details || !details.length) return false;
    const wb = this.sheet.parent as unknown as {
      addSheet(index: number): void;
      getSheet(index: number): { name(n: string): void; setArray(r: number, c: number, data: unknown[][]): void } | null;
      getActiveSheetIndex(): number;
      setActiveSheet?(index: number): void;
      getSheetFromName(name: string): unknown;
    } | undefined;
    if (!wb?.addSheet) return false;
    const lastItem = String(cell.node.fieldInfos[cell.node.fieldInfos.length - 1]?.fieldItem ?? this.pivotName);
    let name = `${lastItem} Details`;
    for (let n = 2; wb.getSheetFromName(name); n++) name = `${lastItem} Details ${n}`;
    let at = -1;
    for (let i = 0; i < 512; i++) {
      const s = wb.getSheet(i) as unknown;
      if (!s) break;
      if (s === this.sheet) { at = i; break; }
    }
    const index = (at >= 0 ? at : wb.getActiveSheetIndex()) + 1;
    wb.addSheet(index);
    const sheet = wb.getSheet(index);
    if (!sheet) return false;
    sheet.name(name);
    sheet.setArray(0, 0, details);
    wb.setActiveSheet?.(index);
    return true;
  }

  getPivotDetails(pivotItemInfo: IPivotItemInfo[]): unknown[][] | void {
    if (!this.resolved) return;
    const path = (pivotItemInfo ?? []).map(info => [info.fieldName, String(info.fieldItem)] as const);
    const rows = filterRows(this.cache, path);
    const out: unknown[][] = [this.resolved.fields.slice() as unknown[]];
    for (const r of rows) out.push(this.resolved.rows[r]!.slice());
    return out;
  }

  getPivotAreaRanges(pivotArea: IPivotArea): Range[] {
    if (!this.layoutModel) return [];
    const model = this.layoutModel;
    const cells = this.layoutModel.cells.filter(cell => this.matchesArea(cell, pivotArea));
    const ranges: Range[] = [];
    for (const cell of cells)
      ranges.push(new Range(this.row + cell.row, this.col + cell.col, 1, 1));
    void model;
    return mergeRanges(ranges);
  }

  private matchesArea(cell: LayoutCell, area: IPivotArea): boolean {
    if (!area) return false;
    if (area.type !== undefined) {
      if (area.type === 0) { if (cell.kind === 'value' || cell.kind === 'subtotalValue' || cell.kind === 'grandValue') { /* data */ } else if (!cell.text) return false; }
      if (area.type === 5 && !['corner', 'colHeader'].includes(cell.kind)) return false;
      if (area.type === 7 && cell.kind !== 'colHeader') return false;
    }
    if (area.fieldName) {
      const model = this.fieldFor(area.fieldName);
      const name = model?.sourceName;
      // Value cells store the value field's caption in `valueInfo.sourceName`
      // (the trial's node-info shape), so an area may name either the source
      // field (`Amount`) or its data-area caption (`Sum of Amount`).
      const valueName = cell.node?.valueInfo?.sourceName;
      const inNode = cell.node?.fieldInfos.some(info => info.fieldName === name)
        || valueName === name || valueName === model?.displayName;
      const isHeader = (cell.kind === 'colHeader' || cell.kind === 'corner')
        && (this.headerFieldOf(cell)?.sourceName === name);
      if (!inNode && !isHeader) return false;
      if (area.dataOnly && !inNode) return false;
      if (area.labelOnly && !(cell.text !== undefined)) return false;
    }
    if (area.grandRow && cell.kind !== 'grandLabel' && cell.kind !== 'grandValue') return false;
    if (area.grandCol && cell.kind !== 'grandValue' && !(cell.kind === 'colHeader')) return false;
    return true;
  }

  private headerFieldOf(cell: LayoutCell): PivotFieldModel | undefined {
    if (!this.layoutModel) return undefined;
    const isCornerRow = cell.row >= this.layoutModel.contentTop && cell.row === this.layoutModel.contentTop;
    if (!isCornerRow) return undefined;
    const rowFields = this.areaFields(PivotTableFieldType.rowField);
    return rowFields[cell.col];
  }

  // ---------------------------------------------------------------- style

  private stylesFor(cell: LayoutCell): { style?: PivotTableStyle; slot: string } {
    const theme = this.themeObject ?? getBuiltInTheme(this.themeKey);
    let style: PivotTableStyle | undefined;
    if (theme) {
      // Excel style taxonomy: wholeTable underlies every pivot cell, the header
      // block adds the header-row fill and the first-header font.
      const base = theme._style('wholeTableStyle');
      const slot = theme._style(cell.slot);
      const header = cell.kind === 'corner' || cell.kind === 'colHeader';
      style = header
        ? mergePivotStyle(mergePivotStyle(mergePivotStyle(base, theme._style('headerRowStyle')), theme._style('firstHeaderCellStyle')), slot)
        : mergePivotStyle(base, slot);
    }
    for (const entry of this.customStyles)
      if (entry.style && entry.pivotArea && this.matchesArea(cell, entry.pivotArea)) {
        style = style ?? new PivotTableStyle();
        const source = entry.style as unknown as Record<string, unknown>;
        const target = style as unknown as Record<string, unknown>;
        for (const key of Object.keys(source)) if (source[key] !== undefined) target[key] = source[key];
      }
    // TASK 46: pivot conditional rules paint the rule style over matching cells.
    for (const entry of this.conditionalRules) {
      if (!entry.areas.some(area => this.matchesArea(cell, area))) continue;
      const cellRow = this.row + cell.row;
      const cellCol = this.col + cell.col;
      const ruleStyle = entry.rule.evaluate(this.sheet, cellRow, cellCol, this.sheet.getValue(cellRow, cellCol));
      if (!ruleStyle) continue;
      style = style ?? new PivotTableStyle();
      const source = ruleStyle as unknown as Record<string, unknown>;
      const target = style as unknown as Record<string, unknown>;
      for (const key of ['backColor', 'foreColor', 'borderLeft', 'borderTop', 'borderRight', 'borderBottom',
        'borderHorizontal', 'borderVertical', 'textDecoration', 'font', 'fontStyle', 'fontWeight', 'fontSize', 'fontFamily'])
        if (source[key] !== undefined) target[key] = source[key];
    }
    return { style, slot: cell.slot };
  }

  getStyle(pivotArea: IPivotArea): Style | undefined {
    const theme = this.themeObject ?? getBuiltInTheme(this.themeKey);
    if (!theme) return undefined;
    const slot = slotForArea(pivotArea);
    const style = slot ? theme._style(slot) : undefined;
    if (!style) return undefined;
    return style._toSheetStyle(paletteOf(this.sheet));
  }

  setStyle(pivotArea: IPivotArea, style: Style): void {
    this.customStyles.push({ pivotArea, style });
    this._apply();
  }

  /**
   * Registers a conditional format rule for the given pivot areas (TASK 46, members of the
   * public d.ts contract; the trial enforces them from its pivot add-on). The rule's style is
   * applied to every layout cell that matches one of the areas while its condition passes.
   */
  addConditionalRule(pivotArea: IPivotArea[], conditionalRule: ConditionRuleBase): void {
    if (!Array.isArray(pivotArea) || !conditionalRule) return;
    this.conditionalRules.push({ areas: pivotArea.map(area => ({ ...area })), rule: conditionalRule });
    this._apply();
  }

  /** Rules registered for areas equal to the given pivot area. */
  getConditionalRules(pivotArea: IPivotArea): ConditionRuleBase[] {
    const key = stableAreaKey(pivotArea);
    return this.conditionalRules
      .filter(entry => entry.areas.some(area => stableAreaKey(area) === key))
      .map(entry => entry.rule);
  }

  removeConditionalRule(conditionalRule: ConditionRuleBase): void {
    const index = this.conditionalRules.findIndex(entry => entry.rule === conditionalRule);
    if (index < 0) return;
    this.conditionalRules.splice(index, 1);
    this._apply();
  }

  // ------------------------------------------- (42) calc fields / items

  /**
   * Adds a calculated value field. Like the trial the formula may only
   * reference source (or other calculated) field names; an unresolvable
   * reference silently keeps the field un-added.
   */
  addCalcField(fieldName: string, formula: string): void {
    const name = String(fieldName ?? '').trim();
    const src = String(formula ?? '').trim();
    if (!name || !src || this.fieldFor(name) || this.cache.fieldIndex.has(name)) return;
    if (!parseCalcFormula(src)) return;
    for (const ref of calcFormulaFieldNames(src))
      if (!this.cache.fieldIndex.has(ref) && !this.calcFields.has(ref)) return;
    this.calcFields.set(name, src);
    this._buildCache();
    this._apply();
  }

  getCalcFields(): ICalcFieldInfo[] {
    return [...this.calcFields.entries()].map(([fieldName, formula]) => {
      const model = this.models.find(m => m.sourceName === fieldName && m.area !== -1);
      return { fieldName: model?.displayName ?? fieldName, formula };
    });
  }

  removeCalcField(fieldName: string): void {
    this.calcFields.delete(fieldName);
    this.models = this.models.filter(model => model.sourceName !== fieldName);
    this._buildCache();
    this._apply();
  }

  addCalcItem(sourceName: string, calcItemName: string, formula: string): void {
    const model = this.fieldFor(sourceName);
    const name = String(calcItemName ?? '').trim();
    const src = String(formula ?? '').trim();
    if (!model || !name || !src) return;
    model.calcItems ??= new Map();
    if (!model.calcItems.has(name))
      model.calcItems.set(name, { formula: src, priority: model.calcItems.size + 1 });
    this._materialiseCalcItems(model);
    this._apply();
  }

  getCalcItems(sourceName?: string): ICalcItemInfo[] {
    const out: ICalcItemInfo[] = [];
    for (const model of this.models) {
      if (sourceName !== undefined && model.sourceName !== sourceName && model.displayName !== sourceName) continue;
      for (const [calcItemName, info] of model.calcItems ?? [])
        out.push({ sourceName: model.sourceName, calcItemName, formula: info.formula, priority: info.priority });
    }
    return out;
  }

  removeCalcItem(sourceName: string, calcItemName: string): void {
    const model = this.fieldFor(sourceName);
    if (!model?.calcItems?.delete(calcItemName)) return;
    this._buildCache();
    this._apply();
  }

  /** The trial keeps the stored priority on update (verified v19.2.5). */
  updateCalcItem(sourceName: string, calcItemName: string, formula: string, priority?: number): void {
    const model = this.fieldFor(sourceName);
    const existing = model?.calcItems?.get(calcItemName);
    if (!model || !existing) return;
    existing.formula = String(formula ?? existing.formula);
    if (typeof priority === 'number') existing.priority = existing.priority;
    this._apply();
  }

  // ------------------------------------------------------------- (42) group

  /**
   * Groups a field: `dateGroups` creates one `<Unit> (Origin)` field per
   * unit (newest first, like the trial), `numberGroup` buckets the origin
   * field in place and `textGroup` creates the named group field.
   */
  group(groupInfo: ITextGroupInfo | INumberGroupInfo | IDateGroupsInfo): void {
    const info = groupInfo as Partial<IDateGroupsInfo & INumberGroupInfo & ITextGroupInfo>;
    if (!info || !info.originFieldName) return;
    const origin = String(info.originFieldName);
    if (!this.cache.fieldIndex.has(origin)) return;
    if (Array.isArray(info.dateGroups)) {
      for (const spec of info.dateGroups) {
        const name = dateGroupName(Number(spec.by), origin);
        this.groups = this.groups.filter(g => !(g.kind === 'date' && g.origin === origin && g.name === name));
        this.groups.unshift({ name, kind: 'date', origin, spec: { ...spec } as unknown as Record<string, unknown> });
      }
    } else if (info.numberGroup) {
      this.groups = this.groups.filter(g => !(g.kind === 'number' && g.origin === origin));
      this.groups.push({ name: origin, kind: 'number', origin, spec: { ...info.numberGroup } as unknown as Record<string, unknown> });
    } else if (info.textGroup) {
      const name = String(info.textGroup.fieldName);
      this.groups = this.groups.filter(g => g.name !== name);
      this.groups.push({ name, kind: 'text', origin, spec: { ...info.textGroup } as unknown as Record<string, unknown> });
    } else {
      return;
    }
    this._buildCache();
    this._apply();
  }

  /** Removes the groups of an origin field (accepts the group name too). */
  ungroup(fieldName: string): void {
    const name = String(fieldName);
    const match = (group: { name: string; origin: string }): boolean => group.origin === name || group.name === name;
    const removed = this.groups.filter(match);
    if (!removed.length) return;
    this.groups = this.groups.filter(group => !match(group));
    for (const group of removed) {
      const model = this.models.find(m => m.sourceName === group.name);
      if (model) {
        model.area = -1;
        model.index = -1;
      }
    }
    this._buildCache();
    this._apply();
  }

  autoFitColumn(): void {
    if (!this.layoutModel || !this.sheet.setColumnWidth) return;
    const maxCol = this.col + this.layoutModel.colCount;
    const width = (text: string): number => Math.min(400, Math.max(40, Math.round(String(text).length * 7.2 + 12)));
    for (let col = this.col; col < maxCol; col++) {
      let best = 0;
      for (const cell of this.layoutModel.cells)
        if (cell.col === col - this.col) {
          const size = cell.text !== undefined ? width(cell.text) : 48;
          if (size > best) best = size;
        }
      if (best > 0) this.sheet.setColumnWidth(col, best);
    }
  }

  suspendLayout(): void { this.suspendCount++; }
  resumeLayout(): void {
    if (this.suspendCount > 0) this.suspendCount--;
    if (this.suspendCount === 0 && this._stale) { this._stale = false; this._apply(); }
  }

  /** @internal anchor position (grid coordinates). */
  _position(): { row: number; col: number } { return { row: this.row, col: this.col }; }

  /** @internal workbook cache id (trial `pivotCaches` numbering). */
  _setCacheId(id: number): void { this.cacheId = String(id); }

  /** @internal rebuild areas/items from a trial-shape pivotTables entry
   * plus its workbook `pivotCaches` record. */
  _restoreFields(entry: Record<string, unknown>, cache: Record<string, unknown> | undefined): void {
    this.restoreGroupingAndCalc(cache);
    this.views._restore(entry.views);
    const fields = Array.isArray(entry.fields) ? entry.fields as Record<string, unknown>[] : [];
    const sourceNameByIndex = new Map<number, string>();
    for (const field of fields) sourceNameByIndex.set(Number(field.fld), String(field.name));
    const areas: [string, PivotTableFieldType][] = [
      ['rowFields', PivotTableFieldType.rowField],
      ['columnFields', PivotTableFieldType.columnField],
      ['pageFields', PivotTableFieldType.filterField],
    ];
    for (const [key, area] of areas) {
      const list = Array.isArray(entry[key]) ? entry[key] as unknown[] : [];
      list.forEach((raw, order) => {
        // The trial writes `pageFields` as full field definitions.
        const fieldIndex = raw && typeof raw === 'object'
          ? Number((raw as Record<string, unknown>).fld) : Number(raw);
        const sourceName = sourceNameByIndex.get(fieldIndex);
        if (!sourceName) return;
        const model = this.models.find(m => m.sourceName === sourceName);
        if (!model) return;
        model.area = area;
        model.index = order;
      });
    }
    const dataFields = Array.isArray(entry.dataFields) ? entry.dataFields as Record<string, unknown>[] : [];
    dataFields.forEach((dataField, order) => {
      const sourceName = sourceNameByIndex.get(Number(dataField.fld));
      if (!sourceName) return;
      this.add(sourceName, String(dataField.name ?? sourceName), PivotTableFieldType.valueField,
        subtotalFromName(dataField.subtotal), order);
    });
    // item order (trial `fields[].items`) doubles as sort/label-filter state
    for (const field of fields) {
      const sourceName = String(field.name);
      const model = this.models.find(m => m.sourceName === sourceName);
      if (!model || !Array.isArray(field.items)) continue;
      const cacheField = this.cache.fields[this.cache.fieldIndex.get(sourceName)!];
      if (!cacheField) continue;
      const order: string[] = [];
      const visible: string[] = [];
      let collapsedAny = false;
      for (const item of field.items as Record<string, unknown>[]) {
        if (item.type === 'default') continue;
        const text = cacheField.items[Number(item.indexValue)];
        if (text === undefined) continue;
        order.push(text);
        if (item.hidden === true) continue;
        visible.push(text);
        if (item.collapse === true) collapsedAny = true;
      }
      if (order.length) model.itemOrder = order;
      if (visible.length && visible.length !== order.length)
        model.labelFilter = { textItem: { list: visible, isAll: false }, kind: 'text' } as never;
      if (collapsedAny) {
        const set = this.collapsed.get(sourceName) ?? new Set<string>();
        for (const item of field.items as Record<string, unknown>[])
          if (item.collapse === true) set.add(cacheField.items[Number(item.indexValue)]!);
        this.collapsed.set(sourceName, set);
      }
      if (typeof field.sortType === 'string') {
        const sortType = field.sortType === 'descending' ? 1 : field.sortType === 'manual' ? 2 : 0;
        model.sortInfo = { sortType } as never;
      }
      if (typeof field.subtotalTop === 'boolean') model.isShowSubtotalTop = field.subtotalTop;
    }
    this.restorePivotFilters(entry, cache);
    void cache;
    this._apply();
  }

  /** Rebuilds groups, calc fields and calc items from the cache JSON. */
  private restoreGroupingAndCalc(cache: Record<string, unknown> | undefined): void {
    const cacheFields = Array.isArray(cache?.fields) ? cache.fields as Record<string, unknown>[] : [];
    if (!cacheFields.length) return;
    const parOrigin = cacheFields
      .find(field => (field.fieldGroup as Record<string, unknown> | undefined)?.par !== undefined)
      ?.name;
    for (const field of cacheFields) {
      const name = String(field.name ?? '');
      if (typeof field.formula === 'string' && !this.calcFields.has(name)) {
        this.calcFields.set(name, field.formula);
        continue;
      }
      const group = field.fieldGroup as Record<string, unknown> | undefined;
      if (!group) continue;
      if (typeof group.groupBy === 'string' && parOrigin) {
        const unit = group.groupBy === 'years' ? 6 : group.groupBy === 'quarters' ? 5 : group.groupBy === 'months' ? 4 : 3;
        this.group({ originFieldName: String(parOrigin), dateGroups: [{ by: unit }] } as IDateGroupsInfo);
      } else if (typeof group.groupInterval === 'number') {
        this.group({
          originFieldName: name,
          numberGroup: { by: group.groupInterval, start: group.startNum as number, end: group.endNum as number },
        } as INumberGroupInfo);
      } else if (Array.isArray(group.discreteGroup)) {
        const unescape = (value: unknown): string => String(value)
          .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
        const groupNames = (group.groupItems as { value?: unknown }[]).map(item => unescape(item.value));
        const discrete = group.discreteGroup as number[];
        const base = cacheFields.find(other => other.name !== name
          && Array.isArray(other.entities)
          && (other.entities as unknown[]).length === discrete.length
          && other.fieldGroup === undefined && typeof other.formula !== 'string');
        if (base) {
          const entities = base.entities as { value?: unknown }[];
          const map: Record<string, (string | number)[]> = {};
          discrete.forEach((groupIndex, entityIndex) => {
            const groupName = groupNames[groupIndex];
            if (groupName === undefined) return;
            (map[groupName] ??= []).push(String(entities[entityIndex]?.value ?? ''));
          });
          this.group({ originFieldName: String(base.name), textGroup: { fieldName: name, groupItems: map } } as ITextGroupInfo);
        }
      }
    }
    const calculatedItems = Array.isArray(cache?.calculatedItems) ? cache?.calculatedItems as Record<string, unknown>[] : [];
    for (const item of calculatedItems) {
      const formula = String(item.formula ?? '');
      const reference = (item.pivotArea as Record<string, unknown> | undefined)?.references as { field?: number; indexes?: number[] }[] | undefined;
      const fieldIndex = Number(reference?.[0]?.field);
      const entityIndex = Number(reference?.[0]?.indexes?.[0]);
      const field = cacheFields[fieldIndex];
      const entities = Array.isArray(field?.entities) ? field?.entities as { value?: unknown }[] : [];
      const itemName = entities[entityIndex]?.value;
      if (field?.name !== undefined && itemName !== undefined)
        this.addCalcItem(String(field.name), String(itemName), formula);
    }
  }

  /** All items of a field in display order (group fields keep the cache order). */
  private allItemsOrdered(model: PivotFieldModel): string[] {
    const index = this.cache.fieldIndex.get(model.sourceName);
    if (index === undefined) return [];
    const items = this.cache.fields[index]!.items.slice();
    if (model.isGroup && !model.sortInfo) return items;
    // The trial's serialized item list is canonical (ascending), not sorted.
    return sortItems(this.cache, { ...model, sortInfo: undefined } as PivotFieldModel, items);
  }

  /** One trial `pivotFilters[]` entry for a field's value/top-10 filter. */
  private pivotFilterJson(model: PivotFieldModel, cacheFields: string[]): Record<string, unknown> | undefined {
    const filter = model.valueFilter;
    if (!filter) return undefined;
    const condition = filter.condition as Record<string, unknown>;
    const conType = Number(condition.conType);
    const dataFields = this.areaFields(PivotTableFieldType.valueField);
    const measure = Math.max(0, dataFields.findIndex(
      entry => entry.displayName === filter.conditionByName || entry.sourceName === filter.conditionByName));
    const base: Record<string, unknown> = {
      fld: cacheFields.indexOf(model.sourceName),
      id: 2,
      evalOrder: -1,
      iMeasureFld: measure,
      conType,
    };
    if (conType === 3) {
      const top = Number(condition.operator) >= 0;
      base.operator = top ? 0 : 1;
      base.autoFilter = {
        filterItemMap: [{
          conditions: [{
            conType: 3,
            expected: Number(condition.val),
            type: top ? 1 : 0,
            compareType: Number(condition.type ?? 0),
          }],
        }],
      };
      return base;
    }
    const values = Array.isArray(condition.val) ? condition.val as unknown[] : [condition.val];
    base.operator = Number(condition.operator);
    base.autoFilter = {
      filterItemMap: [{
        conditions: [{
          compareType: Number(condition.operator),
          conType,
          item1: { expected: values[0] },
          ...(values.length > 1 ? { item2: { expected: values[1] } } : { item2: {} }),
        }],
      }],
    };
    return base;
  }

  /** Trial `fields[].items`: all cache items in display order with flags. */
  private serialiseItems(model: PivotFieldModel): unknown[] {
    const cacheIndex = this.cache.fieldIndex.get(model.sourceName);
    if (cacheIndex === undefined) return [];
    const field = this.cache.fields[cacheIndex]!;
    const shown = new Set(this.visibleItems(model));
    // The trial writes `items` in display order but indexes `rowItems` on the
    // canonical ascending list (verified with descending sorts).
    const ordered = model.isGroup && !model.sortInfo
      ? this.allItemsOrdered(model)
      : sortItems(this.cache, model, this.cache.fields[cacheIndex]!.items.slice());
    const out = ordered.map(item => {
      const entry: Record<string, unknown> = { calculatedMember: !!field.calcItems?.has(item) };
      if (!model.isGroup && model.labelFilter && !shown.has(item)) entry.hidden = true;
      if (this.collapsed.get(model.sourceName)?.has(item)) entry.collapse = true;
      entry.indexValue = field.itemIndex.get(item);
      return entry;
    });
    out.push({ type: 'default' });
    return out;
  }

  /** Rebuilds `valueFilter` from the trial `pivotFilters[]` entries. */
  private restorePivotFilters(entry: Record<string, unknown>, cache: Record<string, unknown> | undefined): void {
    const list = Array.isArray(entry.pivotFilters) ? entry.pivotFilters as Record<string, unknown>[] : [];
    if (!list.length) return;
    const names = ((cache?.fields as Record<string, unknown>[] | undefined) ?? []).map(field => String(field.name));
    const dataFields = this.areaFields(PivotTableFieldType.valueField);
    for (const filter of list) {
      const sourceName = names[Number(filter.fld)] ?? this.resolved?.fields[Number(filter.fld)];
      const model = sourceName ? this.models.find(m => m.sourceName === sourceName && m.area !== -1) : undefined;
      if (!model) continue;
      const conditions = (filter.autoFilter as Record<string, unknown> | undefined)?.filterItemMap as
        Record<string, unknown>[] | undefined;
      const info = (conditions?.[0]?.conditions as Record<string, unknown>[] | undefined)?.[0];
      if (!info) continue;
      const measure = dataFields[Number(filter.iMeasureFld)] ?? dataFields[0];
      const conType = Number(filter.conType);
      if (conType === 3) {
        model.valueFilter = {
          conditionByName: measure?.displayName,
          condition: {
            conType: 3,
            val: Number(info.expected),
            type: Number(info.compareType ?? 0),
            operator: Number(info.type) === 1 ? 1 : -1,
          },
          kind: 'condition',
        } as never;
      } else {
        const item1 = info.item1 as Record<string, unknown> | undefined;
        const item2 = info.item2 as Record<string, unknown> | undefined;
        const val = item2 && item2.expected !== undefined ? [item1?.expected, item2.expected] : [item1?.expected];
        model.valueFilter = {
          conditionByName: measure?.displayName,
          condition: { conType, val: val.map(Number), operator: Number(info.compareType ?? filter.operator) },
          kind: 'condition',
        } as never;
      }
    }
  }

  /** @internal Pivot areas intersecting a sheet range (trial
   * `getRangePivotAreas` shape: one entry per touched area, fixed order). */
  _rangeAreas(range: Range): IPivotArea[] {
    if (!this.layoutModel) return [];
    const hits = new Set<string>();
    const rowFields = this.areaFields(PivotTableFieldType.rowField);
    const colFields = this.areaFields(PivotTableFieldType.columnField);
    const touched = new Map<string, LayoutCell[]>();
    const touch = (key: string, cell: LayoutCell): void => {
      hits.add(key);
      const list = touched.get(key) ?? [];
      list.push(cell);
      touched.set(key, list);
    };
    for (const cell of this.layoutModel.cells) {
      const r = this.row + cell.row, c = this.col + cell.col;
      if (!range.contains(r, c)) continue;
      if (cell.kind === 'corner' && cell.text !== undefined && cell.filterButton) touch('corner', cell);
      else if (cell.kind === 'corner') touch('first', cell);
      if (cell.filterButton && cell.kind === 'corner') touch('button-row', cell);
      if (cell.filterButton && cell.kind === 'colHeader') touch('button-col', cell);
      if (cell.kind === 'rowLabel' || cell.kind === 'subtotalLabel') touch('rowLabels', cell);
      if (cell.kind === 'grandLabel') touch('grandRow', cell);
      if (cell.kind === 'colHeader' && cell.text !== undefined && cell.text !== COLUMN_LABELS_CAPTION && cell.text !== GRAND_TOTAL_CAPTION && !/^ Total /.test(cell.text))
        touch('colItemLabels', cell);
      if (cell.kind === 'colHeader' && (cell.text === GRAND_TOTAL_CAPTION || /^ Total /.test(String(cell.text ?? '')))) touch('grandCol', cell);
      if (cell.kind === 'colHeader' && cell.text === COLUMN_LABELS_CAPTION) touch('topRight', cell);
      if (cell.kind === 'value' || cell.kind === 'subtotalValue' || cell.kind === 'grandValue') touch('data', cell);
    }
    const out: IPivotArea[] = [];
    if (hits.has('corner')) out.push({ type: 5, labelOnly: true });
    if (hits.has('button-row')) {
      const f = rowFields[rowFields.length - 1];
      if (f) out.push({ type: 1, labelOnly: true, fieldName: f.displayName });
    }
    if (hits.has('button-col')) {
      const f = colFields[0];
      if (f) out.push({ type: 1, labelOnly: true, fieldName: f.displayName });
    }
    if (hits.has('topRight')) out.push({ type: 7 });
    if (hits.has('colItemLabels')) {
      const f = colFields[0];
      if (f) out.push({ labelOnly: true, references: [{ fieldName: f.sourceName, items: this.allItemsOrdered(f) }] });
    }
    if (hits.has('grandCol')) out.push({ labelOnly: true, grandCol: true });
    if (hits.has('rowLabels')) {
      const f = rowFields[rowFields.length - 1];
      if (f) out.push({ labelOnly: true, references: [{ fieldName: f.sourceName, items: this.allItemsOrdered(f) }] });
    }
    if (hits.has('grandRow')) out.push({ labelOnly: true, grandRow: true });
    if (hits.has('data')) out.push({});
    return out;
  }

  /** @internal current virtual cells, for the renderer hooks and the manager. */
  _layoutCells(): LayoutCell[] { return this.layoutModel?.cells ?? []; }

  /** @internal removes every cell the pivot wrote. */
  _dispose(): void {
    for (const cell of this.written) {
      this.sheet.setValue(cell.row, cell.col, null);
      this.sheet.setStyle(cell.row, cell.col, null);
    }
    this.written = [];
    this.layoutModel = undefined;
    this.sheet._invalidate?.();
  }

  refresh(): void {
    this._buildCache();
    this._apply();
  }

  private _stale = false;
  private _markStale(): void {
    if (this.suspendCount > 0) { this._stale = true; return; }
    this._apply();
  }

  // ----------------------------------------------------------- serialize

  serialize(): ISerializeInfo {
    const fieldsInfo: ISerializeFieldInfo[][] = [
      this.areaFields(PivotTableFieldType.filterField).map(entry => this.serializeField(entry)),
      this.areaFields(PivotTableFieldType.rowField).map(entry => this.serializeField(entry)),
      this.areaFields(PivotTableFieldType.columnField).map(entry => this.serializeField(entry)),
      this.areaFields(PivotTableFieldType.valueField).map(entry => this.serializeField(entry)),
    ];
    const sortMaps: Record<string, unknown> = {};
    const sortTypes: Record<string, unknown> = {};
    for (const model of this.models) {
      // The trial keeps the sort direction per field in `sortTypes`; only richer
      // sort information (by value, custom lists, references) lands in `sortMaps`.
      if (model.isGroup && this.derived.get(model.sourceName)?.kind === 'text')
        sortMaps[model.sourceName] = Object.fromEntries(this.allItemsOrdered(model).map((_, i) => [String(i), i]));
      if (!model.sortInfo || model.sortInfo.sortType === undefined) continue;
      sortTypes[model.sourceName] = model.sortInfo.sortType;
      if (Object.keys(model.sortInfo).some(key => key !== 'sortType')) sortMaps[model.sourceName] = model.sortInfo;
    }
    const collapseItems: Record<string, Record<string, boolean>> = {};
    for (const [field, items] of this.collapsed)
      if (items.size) collapseItems[field] = Object.fromEntries([...items].map(item => [item, true]));
    for (const [field, items] of this.expanded) {
      if (!items.size) continue;
      const entry = collapseItems[field] ??= {};
      for (const item of items) if (entry[item] === undefined) entry[item] = false;
    }
    const optionsOut = { ...(this.options as Record<string, unknown>) };
    // The trial writes both spellings of the subtotals-position option.
    if (optionsOut.subtotalsPosition !== undefined && optionsOut.subTotalsPosition === undefined)
      optionsOut.subTotalsPosition = optionsOut.subtotalsPosition;
    const info: ISerializeInfo = {
      options: optionsOut,
      layoutType: this.layout,
      pivotTablePosition: [this.row + this.axis.contentTop, this.col],
      theme: this.themeKey,
      valuePosition: { ...this.valuePos, display: this.valuesRowShown() },
      collapseItems,
      fieldsInfo,
      fieldSortMap: { sortMaps, sortTypes },
    };
    if (this.customStyles.length) info.styles = this.customStyles.map(entry => ({ pivotArea: entry.pivotArea, style: entry.style }));
    if (this._showDataAsList.length) info.showDataAsList = this._showDataAsList.map(entry => ({ ...entry })) as never;
    const dimensionSubtotalsInfo: Record<string, IDimensionSubtotalsInfo> = {};
    for (const model of this.models) if (model.dimensionSubtotals) dimensionSubtotalsInfo[model.sourceName] = model.dimensionSubtotals;
    if (Object.keys(dimensionSubtotalsInfo).length) info.dimensionSubtotalsInfo = dimensionSubtotalsInfo;
    if (this._showNoData.size) {
      info.showNoDataInfo = {};
      for (const [field, shown] of this._showNoData) (info.showNoDataInfo as Record<string, unknown>)[field] = shown;
    }
    return info;
  }

  deserialize(serializeInfo: ISerializeInfo): void {
    if (!serializeInfo) return;
    this.options = { ...DEFAULT_OPTIONS, ...(serializeInfo.options ?? {}) } as IPivotTableOption;
    this.layout = serializeInfo.layoutType ?? PivotTableLayoutType.compact;
    if (Array.isArray(serializeInfo.pivotTablePosition) && serializeInfo.pivotTablePosition.length >= 2) {
      this.row = Number(serializeInfo.pivotTablePosition[0]);
      this.col = Number(serializeInfo.pivotTablePosition[1]);
    }
    this.themeKey = serializeInfo.theme ?? 'light0';
    this.themeObject = getBuiltInTheme(this.themeKey) ?? this.sheet.parent?.customPivotTableThemes?.get(this.themeKey);
    if (serializeInfo.valuePosition) this.valuePos = { ...serializeInfo.valuePosition };
    this.collapsed.clear();
    this.expanded.clear();
    for (const [field, items] of Object.entries(serializeInfo.collapseItems ?? {})) {
      const entries = Array.isArray(items)
        ? items.map(x => [String(x), true] as const)
        : Object.entries(items as Record<string, unknown>).map(([name, on]) => [name, !!on] as const);
      const on = new Set(entries.filter(([, v]) => v).map(([k]) => k));
      const off = new Set(entries.filter(([, v]) => !v).map(([k]) => k));
      if (on.size) this.collapsed.set(field, on);
      if (off.size) this.expanded.set(field, off);
    }
    this.overwrite.clear();
    this.customStyles = serializeInfo.styles ?? [];
    this._showDataAsList = (serializeInfo.showDataAsList ?? []) as never;
    this._showNoData = new Map(Object.entries(serializeInfo.showNoDataInfo ?? {}) as [string, boolean][]);
    for (const model of this.models) {
      model.area = -1; model.index = -1; model.subtotal = undefined; model.labelFilter = undefined;
      model.valueFilter = undefined; model.sortInfo = undefined; model.isShowSubtotalTop = false; model.isShowSubtotal = undefined;
      model.dimensionSubtotals = undefined;
    }
    const areas = [PivotTableFieldType.filterField, PivotTableFieldType.rowField, PivotTableFieldType.columnField, PivotTableFieldType.valueField];
    (serializeInfo.fieldsInfo ?? []).forEach((entries, area) => {
      if (area >= areas.length) return;
      (entries ?? []).forEach((entry, index) => {
        let model = this.models.find(m => m.sourceName === entry.sourceName);
        if (!model) {
          model = {
            sourceName: entry.sourceName, displayName: entry.displayName ?? entry.sourceName, area: -1, index: -1,
            dataType: PivotDataType.string, isShowSubtotalTop: false,
          };
          this.models.push(model);
        }
        model.displayName = entry.displayName ?? entry.sourceName;
        model.area = areas[area]!;
        model.index = index;
        model.subtotal = entry.subtotal;
        model.labelFilter = entry.labelFilter as never;
        model.valueFilter = entry.valueFilter as never;
        model.sortInfo = entry.sortInfo;
        model.isShowSubtotalTop = entry.isShowSubtotalTop === true;
        if (entry.isShowSubtotal !== undefined) model.isShowSubtotal = entry.isShowSubtotal;
        const dimension = serializeInfo.dimensionSubtotalsInfo?.[entry.sourceName];
        if (dimension) model.dimensionSubtotals = dimension;
      });
    });
    this._apply();
  }

  private serializeField(model: PivotFieldModel): ISerializeFieldInfo {
    const out: ISerializeFieldInfo & { sortMap?: Record<string, number> } = { sourceName: model.sourceName, displayName: model.displayName };
    if (model.area === PivotTableFieldType.valueField) {
      if (model.subtotal !== undefined) out.subtotal = model.subtotal;
    } else {
      out.isShowSubtotalTop = model.isShowSubtotalTop;
    }
    if (model.isGroup && this.derived.get(model.sourceName)?.kind === 'text')
      out.sortMap = Object.fromEntries(this.allItemsOrdered(model).map((_, i) => [String(i), i]));
    if (model.labelFilter) out.labelFilter = stripFilterKind(model.labelFilter);
    if (model.valueFilter) out.valueFilter = stripFilterKind(model.valueFilter);
    if (model.sortInfo) out.sortInfo = model.sortInfo;
    if (model.isShowSubtotal !== undefined && model.isShowSubtotal) out.isShowSubtotal = true;
    return out;
  }

  // ---------------------------------------------------- internal OOXML-ish

  /** Trial-compatible `sheet.toJSON().pivotTables[i]` entry. */
  _toJSON(): Record<string, unknown> {
    const options = this.options as IPivotTableOption;
    const range = this.getRange();
    const ref = range.content
      ? `${indexToLetters(range.content.col)}${range.content.row + 1}:${indexToLetters(range.content.col + range.content.colCount - 1)}${range.content.row + range.content.rowCount}`
      : '';
    const axis = this.axis;
    const grandPosition = options.grandTotalPosition ?? GrandTotalPosition.both;
    const tabularLayout = this.layout === PivotTableLayoutType.tabular;
    const compactLayout = this.layout === PivotTableLayoutType.compact;
    const axisOf = (model: PivotFieldModel): string | undefined =>
      model.area === PivotTableFieldType.rowField ? 'axisRow' : model.area === PivotTableFieldType.columnField ? 'axisCol' : model.area === PivotTableFieldType.filterField ? 'axisPage' : undefined;
    const cacheFields = this.cache.fields.map(field => field.name);

    const pivotFilters: Record<string, unknown>[] = [];
    const fields = cacheFields.map((name, index) => {
      const model = this.models.find(m => m.sourceName === name && m.area !== -1);
      const entry: Record<string, unknown> = { insertBlankRow: false, name, fld: index, showAll: false };
      if (!compactLayout) {
        entry.compact = false;
        if (tabularLayout) entry.outline = false;
      }
      const axis = model ? axisOf(model) : undefined;
      if (axis) entry.axis = axis;
      if (model) {
        if (model.sortInfo?.sortType !== undefined) entry.sortType = sortTypeName(model.sortInfo.sortType);
        if (model.area !== PivotTableFieldType.valueField) entry.subtotalTop = model.isShowSubtotalTop;
        if (model.valueFilter) entry.measureFilter = true;
      const pivotFilter = this.pivotFilterJson(model, cacheFields);
      if (pivotFilter) pivotFilters.push(pivotFilter);
      }
      if (this.models.some(m => m.sourceName === name && m.area === PivotTableFieldType.valueField)) {
        if (axis === undefined) entry.axis = 'axisValues';
        entry.dataField = true;
      }
      if (model && model.area !== -1 && model.area !== PivotTableFieldType.valueField)
        entry.items = this.serialiseItems(model);
      return entry;
    });
    const list = (area: PivotTableFieldType): number[] =>
      this.areaFields(area).map(model => cacheFields.indexOf(model.sourceName)).filter(index => index >= 0);
    const columnFields = [...(axis.valuesOuter ? [-2] : []), ...list(PivotTableFieldType.columnField)];
    return {
      outline: !tabularLayout,
      outlineData: !tabularLayout,
      ...(compactLayout ? {} : { compact: false, compactData: false }),
      name: this.pivotName,
      multipleFieldFilters: !!options.allowMultipleFiltersPerField,
      styleName: `PivotStyle${capitalize(this.themeKey)}`,
      showRowHeaders: options.showRowHeader !== false,
      showColHeaders: options.showColumnHeader !== false,
      showRowStripes: !!options.bandRows,
      showColStripes: !!options.bandColumns,
      pageOverThenDown: options.displayFieldsInPageFilterArea === 1,
      pageWrap: options.reportFilterFieldsPerColumn ?? 0,
      showFilter: options.showFilter !== false,
      showDrill: options.showDrill !== false,
      showMissing: options.showMissing !== false,
      ...(options.missingCaption ? { missingCaption: String(options.missingCaption) } : {}),
      showToolTip: options.showToolTip !== false,
      fillDownLabels: !!options.fillDownLabels,
      indent: 0,
      mergeItem: !!options.mergeItem,
      dataCaption: VALUES_CAPTION,
      showError: !!options.isShowErrorValue,
      showDataTips: true,
      showHeaders: options.showHeaders !== false,
      enableDataValueEditing: !!options.enableDataValueEditing,
      hideValuesRow: true,
      views: this.views._list().map(view => ({ name: view.name, config: view.config })),
      altText: '',
      altTextSummary: '',
      createdVersion: 6,
      firstHeaderRow: axis.valueFields > 1 && axis.colFields === 0 ? 0 : 1,
      firstDataRow: axis.headerRows,
      firstDataCol: axis.labelCols,
      ...(grandPosition & GrandTotalPosition.row) === 0 ? { rowGrandTotals: false } : {},
      ...(grandPosition & GrandTotalPosition.col) === 0 ? { colGrandTotals: false } : {},
      rowPageCount: list(PivotTableFieldType.filterField).length,
      colPageCount: 1,
      ref,
      formats: [],
      pivotTableConditionFormats: [],
      cacheId: this.cacheId,
      fields,
      columnFields,
      rowFields: list(PivotTableFieldType.rowField),
      pageFields: this.areaFields(PivotTableFieldType.filterField)
        .map(model => fields[cacheFields.indexOf(model.sourceName)])
        .filter(entry => entry !== undefined),
      dataFields: this.areaFields(PivotTableFieldType.valueField).map(model => ({
        name: model.displayName, subtotal: ooxmlSubtotal(model.subtotal), fld: cacheFields.indexOf(model.sourceName),
      })).filter(entry => entry.fld >= 0),
      ...(pivotFilters.length ? { pivotFilters } : {}),
      rowItems: this.rowItemsJson(),
      columnItems: this.columnItemsJson(),
      subtotalsOnTopDefault: false,
      insertBlankRowDefault: false,
      showLastColumn: true,
    };
  }

  /** Workbook-level `pivotCaches` record entry (trial JSON shape). */
  _cacheJSON(): Record<string, unknown> {
    const source = typeof this.getSource() === 'string' ? String(this.getSource()) : '';
    const cacheId = Number(this.cacheId) || 1;
    // Raw item lists for number-grouped origin fields (auto-bounds keep them).
    const rawItems = new Map<string, { items: string[]; index: Map<string, number> }>();
    const numberGrouped = new Set<string>();
    for (const [name, derived] of this.derived) {
      if (derived.kind !== 'number') continue;
      numberGrouped.add(name);
      const index = this.cache.fieldIndex.get(name);
      if (index === undefined) continue;
      const items: string[] = [];
      const map = new Map<string, number>();
      for (const row of this.cache.rows) {
        const value = row[index];
        if (value == null || value === '') continue;
        const key = value instanceof Date ? String(value.getTime()) : String(value);
        if (!map.has(key)) {
          map.set(key, items.length);
          items.push(key);
        }
      }
      rawItems.set(name, { items, index: map });
    }
    const calculatedItems: Record<string, unknown>[] = [];
    let calcItemCount = 0;
    const fields = this.cache.fields.map(field => {
      const name = field.name;
      const derived = this.derived.get(name);
      if (this.calcFields.has(name))
        return { name, formula: this.calcFields.get(name), databaseField: false, entities: [{ type: 'm' }] };
      if (derived && derived.kind !== 'number')
        return { name, databaseField: false, entities: [], fieldGroup: derived.fieldGroup };
      if (numberGrouped.has(name) && derived!.fieldGroup.autoStart !== true)
        return { name, containsSemiMixedTypes: false, entities: [], fieldGroup: derived!.fieldGroup };
      const raw = rawItems.get(name);
      const entityItems = raw ? raw.items : field.items;
      // Trial semantics: every blank cell becomes a trailing `{type:'m'}` entity
      // referenced from the records; mixed fields type each entity individually.
      const blanks = this.calcFields.has(name) || derived ? 0 : field.blanks ?? 0;
      const entityCount = entityItems.length + blanks;
      const numberEntities = field.dataType === PivotDataType.number
        ? entityItems.map(item => Number(item))
        : [...(field.numericKeys ?? [])].map(Number);
      const numberSet = field.dataType === PivotDataType.number
        ? new Set(entityItems)
        : field.numericKeys ?? new Set<string>();
      const entry: Record<string, unknown> = {
        name,
        ...(field.dataType === PivotDataType.number
          ? {
            containsNumber: true,
            minValue: field.min,
            maxValue: field.max,
            containsInteger: entityItems.every(item => Number.isInteger(Number(item))),
            containsString: false,
            // Trial: a numeric field with missing cells drops the
            // containsSemiMixedTypes key instead of setting it.
            ...(blanks > 0 ? {} : { containsSemiMixedTypes: false }),
          }
          : {}),
        ...(field.dataType === PivotDataType.date
          ? {
            containsDate: true,
            minDate: usDateFromKey(entityItems[0]),
            maxDate: usDateFromKey(entityItems[entityItems.length - 1]),
            containsString: false,
            containsNonDate: false,
            containsSemiMixedTypes: false,
            ...(blanks > 0 ? { containsBlank: true } : {}),
          }
          : {}),
        ...(field.fieldGroup ? { fieldGroup: field.fieldGroup } : {}),
        containsString: field.dataType === PivotDataType.string,
        ...(blanks > 0 ? { containsBlank: true } : {}),
        ...(field.numericKeys?.size && field.dataType === PivotDataType.string
          ? {
            containsNumber: true,
            minValue: Math.min(...numberEntities),
            maxValue: Math.max(...numberEntities),
            containsInteger: numberEntities.every(value => Number.isInteger(value)),
            containsMixedTypes: true,
            containsSemiMixedTypes: true,
          }
          : {}),
        entities: [...entityItems.map(item => ({
          type: numberSet.has(item) ? 'n' : entityKind(field.dataType),
          value: numberSet.has(item) ? Number(item) : entityValue(field.dataType, item),
          isCalculatedItem: field.calcItems?.has(item) === true,
        })),
        ...(blanks > 0 ? Array.from({ length: entityCount - entityItems.length }, () => ({ type: 'm' })) : [])],
      };
      for (const item of field.items)
        if (field.calcItems?.has(item)) {
          const model = this.models.find(m => m.sourceName === name);
          const info = model?.calcItems?.get(item);
          if (!info) continue;
          calcItemCount++;
          calculatedItems.push({
            formula: info.formula,
            pivotArea: { references: [{ field: this.cache.fields.indexOf(field), indexes: [field.itemIndex.get(item) ?? -1] }], outline: true },
          });
        }
      return entry;
    });
    const entityCounts = new Map<string, number>(fields.map(entry => [String(entry.name), (entry.entities as unknown[]).length]));
    const out: Record<string, unknown> = {
      cacheId,
      pivotCacheId: 100000000 + cacheId - 1,
      name: this.pivotName,
      calcItemCount,
      calculatedItems,
      fields,
      pivotCacheRecords: this.cache.rows.map(row => row.map((value, col) => {
        const field = this.cache.fields[col];
        // Blank cells reference the trailing `m` entity when the JSON field
        // has one; calc/grouped fields keep the trial's -1.
        const isBlank = !field || value == null || (value === '' && !field.itemIndex.has(''));
        if (isBlank) {
          if (!field || this.calcFields.has(field.name)) return { type: 'x', value: -1 };
          const n = entityCounts.get(field.name) ?? 0;
          return { type: 'x', value: (field.blanks ?? 0) > 0 ? n - 1 : -1 };
        }
        if (numberGrouped.has(field.name) && this.derived.get(field.name)!.fieldGroup.autoStart !== true)
          return { type: typeof value === 'number' ? 'n' : entityKind(field.dataType), value: value instanceof Date ? usDateFromKey(String(value.getTime())) : value };
        const key = value instanceof Date ? String(value.getTime()) : String(value);
        const index = rawItems.get(field.name)?.index ?? field.itemIndex;
        return { type: 'x', value: index.get(key) ?? -1 };
      })),
      headerList: this.cache.fields
        .filter(field => !this.derived.has(field.name) || numberGrouped.has(field.name))
        .filter(field => !this.calcFields.has(field.name))
        .map((field, index) => ({ name: field.name, dataType: field.dataType, index })),
      sourceType: 'worksheet',
    };
    if (source.startsWith('=')) out.sourceName = source.slice(1);
    else if (this.resolved?.sourceSheet && this.resolved.range) {
      const range = this.resolved.range;
      out.sheet = this.resolved.sourceSheet.name();
      out.ref = `${indexToLetters(range.col)}${range.row + 1}:${indexToLetters(range.col + range.colCount - 1)}${range.row + range.rowCount}`;
    }
    return out;
  }

  private rowItemsJson(): unknown[] {
    const fields = this.areaFields(PivotTableFieldType.rowField);
    if (!fields.length) return [{ pivotItemIndexes: [] }];
    const showDrill = this.options.showDrill !== false;
    const tabular = this.layout === PivotTableLayoutType.tabular;
    const out: Record<string, unknown>[] = [];
    const prev: (number | null)[] = [];
    /**
     * One entry per visible row item/subtotal (trial encoding): when the
     * parent path changed, all new levels go into a single `pivotItemIndexes`
     * array (tabular layout and first occurrences); a deeper new level alone
     * is written as `[index]` with `repeatCount` = level. In compact/outline
     * layouts every level of a fresh path gets its own entry (the trial has
     * one grid row per group there).
     */
    const emit = (path: string[], level: number, type?: 'default'): void => {
      const indexes = path.map((item, l) => this.axisItemIndex(fields[l]!, item));
      let k = 0;
      while (k < level && indexes[k] === prev[k]) k++;
      if (tabular || k === level) {
        const entry: Record<string, unknown> = k === level && level > 0 && k > 0
          ? { pivotItemIndexes: [indexes[level]!], repeatCount: level }
          : { pivotItemIndexes: indexes.slice(k, level + 1) };
        if (type) entry.type = type;
        out.push(entry);
      } else {
        for (let l = k; l <= level; l++) {
          const entry: Record<string, unknown> = { pivotItemIndexes: [indexes[l]!] };
          if (l > 0) entry.repeatCount = l;
          if (l === level && type) entry.type = type;
          out.push(entry);
        }
      }
      prev.length = 0;
      indexes.slice(0, level + 1).forEach((idx, l) => { prev[l] = idx; });
    };
    const walk = (level: number, path: string[]): void => {
      const model = fields[level]!;
      const under = path.map((item, i) => [fields[i]!.sourceName, item] as const);
      const isLeaf = level === fields.length - 1;
      for (const item of this.visibleItems(model, under)) {
        const itemPath = [...path, item];
        const collapsed = !isLeaf && showDrill && this.isCollapsedItem(model.sourceName, item);
        const showSub = !isLeaf && this.subtotalShown(model);
        const onTop = showSub && model.isShowSubtotalTop === true;
        if (onTop) emit(itemPath, level, 'default');
        if (isLeaf || collapsed) emit(itemPath, level);
        else walk(level + 1, itemPath);
        if (showSub && !onTop && !collapsed) emit(itemPath, level, 'default');
      }
    };
    walk(0, []);
    const grandRow = ((this.options.grandTotalPosition ?? GrandTotalPosition.both) & GrandTotalPosition.row) !== 0;
    if (grandRow) out.push({ pivotItemIndexes: [null], type: 'grand' });
    return out;
  }

  private columnItemsJson(): unknown[] {
    if (!this.resolved) return [];
    const colFields = this.areaFields(PivotTableFieldType.columnField);
    if (!colFields.length) {
      // Without column fields the data fields take the place of the axis.
      const valueFields = this.areaFields(PivotTableFieldType.valueField);
      return valueFields.length > 1
        ? valueFields.map((_, index) => ({ pivotItemIndexes: [index] }))
        : [{ pivotItemIndexes: [] }];
    }
    const valueFields = this.areaFields(PivotTableFieldType.valueField);
    const valuesOuter = valueFields.length > 1;
    const showDrill = this.options.showDrill !== false;
    const out: Record<string, unknown>[] = [];
    const groups = valuesOuter ? valueFields : [valueFields[0]!];
    groups.forEach((_value, valueIndex) => {
      const prev: (number | null)[] = [];
      /** Column entries always merge all new levels into one path array. */
      const emit = (indexes: (number | null)[], level: number, type?: 'default'): void => {
        let k = 0;
        while (k < level && indexes[k] === prev[k]) k++;
        const entry: Record<string, unknown> = k === level && level > 0 && k > 0
          ? { pivotItemIndexes: [indexes[level]!], repeatCount: level }
          : { pivotItemIndexes: indexes.slice(k, level + 1) };
        if (type) entry.type = type;
        if (valuesOuter && valueIndex > 0) entry.dataFieldIndex = valueIndex;
        out.push(entry);
        prev.length = 0;
        indexes.slice(0, level + 1).forEach((idx, l) => { prev[l] = idx; });
      };
      const pathIndexes = (path: string[]): (number | null)[] => {
        const indexes: (number | null)[] = [];
        if (valuesOuter) indexes.push(valueIndex === 0 ? null : valueIndex);
        path.forEach((item, l) => indexes.push(this.axisItemIndex(colFields[l]!, item)));
        return indexes;
      };
      const walkCol = (level: number, path: string[]): void => {
        const model = colFields[level]!;
        const under = path.map((item, i) => [colFields[i]!.sourceName, item] as const);
        for (const item of this.visibleItems(model, under)) {
          const child = [...path, item];
          if (showDrill && this.isCollapsedItem(model.sourceName, item)) {
            emit(pathIndexes(child), child.length + (valuesOuter ? 1 : 0) - 1);
            continue;
          }
          const before = out.length;
          if (level === colFields.length - 1) emit(pathIndexes(child), child.length + (valuesOuter ? 1 : 0) - 1);
          else walkCol(level + 1, child);
          if (out.length === before) continue;
          if (level < colFields.length - 1 && this.subtotalShown(model))
            emit(pathIndexes(child), child.length + (valuesOuter ? 1 : 0) - 1, 'default');
        }
      };
      walkCol(0, []);
    });
    const grandColumn = ((this.options.grandTotalPosition ?? GrandTotalPosition.both) & GrandTotalPosition.col) !== 0;
    if (grandColumn)
      groups.forEach((_value, valueIndex) => {
        const entry: Record<string, unknown> = {
          pivotItemIndexes: [valuesOuter ? (valueIndex === 0 ? null : valueIndex) : null],
          type: 'grand',
        };
        if (valuesOuter && valueIndex > 0) entry.dataFieldIndex = valueIndex;
        out.push(entry);
      });
    return out;
  }

  /** Index of one item inside the field's serialized `items` list (0 -> null). */
  private axisItemIndex(model: PivotFieldModel, item: string): number | null {
    const cacheIndex = this.cache.fieldIndex.get(model.sourceName);
    if (cacheIndex === undefined) return null;
    const position = this.allItemsOrdered(model).indexOf(item);
    return position <= 0 ? null : position;
  }

  /** @internal relayout + repaint (public-ish: used by the manager after a JSON restore). */
  _apply(): void {
    if (this.suspendCount > 0) { this._stale = true; return; }
    if (!this.sheet?.setValue) return;
    const previous = this.layoutModel;
    this.layoutModel = this.buildLayout();
    this.clearWritten(previous);
    for (const cell of this.layoutModel.cells) this.writeCell(cell, true);
    if (this.layoutModel.cells.length) this.written = this.layoutModel.cells.map(cell => ({ row: this.row + cell.row, col: this.col + cell.col }));
    this.sheet._invalidate?.();
    for (const panel of this._panelInstances) { try { panel._onModelChanged(); } catch { /* detached while rendering */ } }
    this._refreshSheetSlicers();
    this._emitChanged();
  }

  /** Slicers bound to this pivot adopt new/removed field items after a relayout. */
  private _refreshSheetSlicers(): void {
    const holder = this.sheet as unknown as {
      slicers?: { all(): { _refreshFromPivot?(): void; _connectedPivots?(): object[] }[] } };
    for (const slicer of holder.slicers?.all() ?? []) {
      if (!slicer._refreshFromPivot) continue;
      if ((slicer._connectedPivots?.() ?? []).some(pivot => pivot === this)) slicer._refreshFromPivot();
    }
  }

  /** @internal after a JSON restore (slicers load before pivots): adopt their selections. */
  _resyncSlicers(): void {
    const holder = this.sheet as unknown as {
      slicers?: { all(): { _connectedPivotNames?(): string[]; _resyncFromPivot?(): void }[] } };
    for (const slicer of holder.slicers?.all() ?? []) {
      if (slicer._resyncFromPivot && (slicer._connectedPivotNames?.() ?? []).includes(String(this.pivotName)))
        slicer._resyncFromPivot();
    }
  }

  private _lastEmitted = 0;
  private _emitChanged(): void {
    const now = ++this._lastEmitted;
    void now;
    this.sheet._emit?.(Events.PivotTableChanged, {
      sheet: this.sheet, sheetName: this.sheet.name(), row: this.row, col: this.col, name: this.pivotName,
    });
  }

  /** @internal used when the workbook fires `PivotTableChanging`. */
  _emitChanging(): void {
    this.sheet._emit?.(Events.PivotTableChanging, {
      sheet: this.sheet, sheetName: this.sheet.name(), row: this.row, col: this.col, name: this.pivotName,
    });
  }

  private clearWritten(model: PivotLayoutModel | undefined): void {
    const keep = new Set((this.layoutModel?.cells ?? []).map(cell => `${this.row + cell.row}:${this.col + cell.col}`));
    for (const cell of this.written)
      if (!keep.has(`${cell.row}:${cell.col}`)) {
        this.sheet.setValue(cell.row, cell.col, null);
        this.sheet.setStyle(cell.row, cell.col, null);
      }
    void model;
    this.written = [];
  }

  private writeCell(cell: LayoutCell, batched = false): void {
    const row = this.row + cell.row, col = this.col + cell.col;
    const over = cell.node ? this.overwrite.get(this.nodeKey(cell.node.fieldInfos, cell.node.valueInfo)) : undefined;
    const shown = over !== undefined ? over : cell.value;
    if (cell.text !== undefined) this.sheet.setValue(row, col, cell.text);
    else if (shown !== undefined && shown !== null) this.sheet.setValue(row, col, shown);
    else this.sheet.setValue(row, col, null);
    const { style } = this.stylesFor(cell);
    if (style) {
      const written = style._toSheetStyle(paletteOf(this.sheet)) as Style & { textIndent?: number };
      if (cell.indent) written.textIndent = cell.indent;
      this.sheet.setStyle(row, col, written);
    } else this.sheet.setStyle(row, col, null);
    // Dialog number formats (TASK 47): value cells / row labels of a formatted field.
    if (this.sheet.setFormatter) {
      const fmt = cell.kind === 'value' || cell.kind === 'subtotalValue' || cell.kind === 'grandValue'
        ? this.formatterForValue(cell.node?.valueInfo)
        : cell.kind === 'rowLabel' ? this.formatterForLabel(cell.node?.fieldInfos) : undefined;
      if (fmt) { this.sheet.setFormatter(row, col, fmt); this._formatterWritten.add(`${row},${col}`); }
      else if (this._formatterWritten.has(`${row},${col}`)) { this.sheet.setFormatter(row, col, 'General'); this._formatterWritten.delete(`${row},${col}`); }
    }
    void batched;
  }

  // ------------------------------------------------------ grid construction

  /** Visible items of one axis field, optionally limited to a parent path. */
  private visibleItems(model: PivotFieldModel, under: readonly (readonly [string, string])[] = []): string[] {
    const cacheIndex = this.cache.fieldIndex.get(model.sourceName);
    if (cacheIndex === undefined) return [];
    let items = this.cache.fields[cacheIndex]!.items.slice();
    const allowed = this.filteredItemSet(model);
    items = items.filter(item => allowed.has(item));
    if (under.length) {
      const parents = new Set(this.rowsFor(under));
      items = items.filter(item => this.rowsFor([...under, [model.sourceName, item]]).some(row => parents.has(row)));
    }
    if (model.isGroup) {
      // Group fields keep calendar buckets without data hidden (like the trial).
      items = items.filter(item => this.rowsFor([...under, [model.sourceName, item]]).length > 0);
    }
    else if (this._slicerRowFilter() !== undefined) {
      // Slicer selections remove axis items that have no data rows left (Excel semantics).
      items = items.filter(item => this.rowsFor([...under, [model.sourceName, item]]).length > 0);
    }
    if (model.itemOrder && !model.sortInfo) {
      const order = new Map(model.itemOrder.map((item, i) => [item, i]));
      return items.filter(item => order.has(item)).sort((a, b) => order.get(a)! - order.get(b)!);
    }
    if (model.isGroup && !model.sortInfo) {
      // Group fields keep their calendar/bucket order (trial).
      const cacheIdx = this.cache.fieldIndex.get(model.sourceName);
      const natural = cacheIdx === undefined ? [] : this.cache.fields[cacheIdx]!.items;
      const position = new Map(natural.map((item, i) => [item, i]));
      return items.sort((a, b) => position.get(a)! - position.get(b)!);
    }
    return sortItems(this.cache, model, items);
  }

  /** Items of an axis field that survive its label and value filters. */
  private filteredItemSet(model: PivotFieldModel): Set<string> {
    const cacheIndex = this.cache.fieldIndex.get(model.sourceName);
    let items = cacheIndex === undefined ? [] : this.cache.fields[cacheIndex]!.items.slice();
    if (model.slicerItems) items = items.filter(item => model.slicerItems!.has(item));
    if (model.labelFilter) items = items.filter(item => labelFilterAllows(model.labelFilter, item));
    if (model.valueFilter) {
      const valueField = this.fieldFor(model.valueFilter.conditionByName)
        ?? this.areaFields(PivotTableFieldType.valueField)[0];
      const subtotal = valueField?.subtotal ?? SubtotalType.sum;
      const sourceName = valueField?.sourceName;
      items = valueFilterItems(model.valueFilter as never, items, item => {
        if (!sourceName) return null;
        const rows = this.rowsFor([[model.sourceName, item]]);
        return aggregateRows(this.cache, rows, sourceName, subtotal);
      });
    }
    return new Set(items);
  }

  /** The trial shows the data-field caption row for several data fields. */
  private valuesRowShown(): boolean {
    return this.valuePos.display === true || this.axis.valueFields > 1;
  }

  /** Subtotals are shown for every axis field except the innermost one. */
  private subtotalShown(model: PivotFieldModel): boolean { return model.isShowSubtotal ?? true; }

  private isCollapsedItem(sourceName: string, item: string): boolean {
    return this.collapsed.get(sourceName)?.has(String(item)) === true;
  }

  /** Selected item of a report (page) filter, written exactly like the trial. */
  private pageSelection(model: PivotFieldModel): string {
    const filter = model.labelFilter;
    if (filter && 'textItem' in filter && !filter.textItem.isAll && filter.textItem.list.length === 1)
      return String(filter.textItem.list[0]);
    return ALL_CAPTION;
  }

  /** Source rows matching the page-field selection plus the given path. */
  private rowsFor(path: readonly (readonly [string, string | null])[]): number[] {
    const page: (readonly [string, string | null])[] = [];
    for (const model of this.areaFields(PivotTableFieldType.filterField)) {
      const filter = model.labelFilter;
      if (filter && 'textItem' in filter && !filter.textItem.isAll && filter.textItem.list.length) {
        for (const item of filter.textItem.list) page.push([model.sourceName, String(item)]);
      }
    }
    const rows = filterRows(this.cache, [...page, ...path]);
    let out = rows;
    if (this.filteredRows) out = out.filter(row => this.filteredRows!.has(row));
    const slicerRows = this._slicerRowFilter();
    if (slicerRows) out = out.filter(row => slicerRows.has(row));
    return out;
  }

  /**
   * Rows kept by the label filters of the row and column fields: the trial
   * excludes filtered-out items from every aggregate, grand totals included.
   */
  private computeFilteredRows(): void {
    this.filteredRows = undefined;
    const models = [...this.areaFields(PivotTableFieldType.rowField), ...this.areaFields(PivotTableFieldType.columnField)]
      .filter(model => model.labelFilter !== undefined || model.valueFilter !== undefined);
    if (!models.length) return;
    const allowed = models.map(model => this.filteredItemSet(model));
    const keep = new Set<number>();
    for (let row = 0; row < this.cache.rows.length; row++) {
      let included = true;
      for (const [index, model] of models.entries()) {
        const text = this.cache.rawText(row, model.sourceName);
        if (text == null || !allowed[index]!.has(text)) { included = false; break; }
      }
      if (included) keep.add(row);
    }
    this.filteredRows = keep;
  }

  private buildLayout(): PivotLayoutModel {
    const cells: LayoutCell[] = [];
    const rowFields = this.areaFields(PivotTableFieldType.rowField);
    const colFields = this.areaFields(PivotTableFieldType.columnField);
    const valueFields = this.areaFields(PivotTableFieldType.valueField);
    const pageFields = this.areaFields(PivotTableFieldType.filterField);
    const options = this.options;
    const compact = this.layout === PivotTableLayoutType.compact;
    const tabular = this.layout === PivotTableLayoutType.tabular;
    const showFilter = options.showFilter !== false;
    const showDrill = options.showDrill !== false;
    this.computeFilteredRows();

    const finish = (pageRows: number, contentTop: number, rowCount: number, colCount: number): PivotLayoutModel => {
      const maxRow = cells.reduce((max, cell) => Math.max(max, cell.row), 0);
      const maxCol = cells.reduce((max, cell) => Math.max(max, cell.col), 0);
      return {
        cells,
        pageRowCount: pageRows,
        pageColCount: pageRows ? 2 : 0,
        pageLeft: 0,
        contentTop,
        contentLeft: 0,
        contentRowCount: rowCount,
        contentColCount: colCount,
        rowCount: Math.max(maxRow, contentTop + rowCount - 1) + 1,
        colCount: Math.max(maxCol, colCount - 1) + 1,
      };
    };

    // Without a data field the trial keeps an empty placeholder area.
    if (!valueFields.length) {
      for (let r = 0; r < 18; r++)
        for (let c = 0; c < 3; c++) cells.push({ row: r, col: c, kind: 'value', slot: 'wholeTableStyle' });
      return finish(pageFields.length, Math.max(0, pageFields.length + 1 - this.row), 18, 3);
    }

    const grandRow = ((options.grandTotalPosition ?? GrandTotalPosition.both) & GrandTotalPosition.row) !== 0 && rowFields.length > 0;
    const grandColumn = ((options.grandTotalPosition ?? GrandTotalPosition.both) & GrandTotalPosition.col) !== 0 && colFields.length > 0;
    const valuesOuter = valueFields.length > 1;
    const showValuesRow = colFields.length > 0 && (valuesOuter || options.hideValuesRow === false);
    const headerRows = colFields.length > 0 ? colFields.length + 1 + (showValuesRow ? 1 : 0) : 1;
    const levelRowBase = colFields.length > 0 ? (showValuesRow ? 2 : 1) : 0;
    const labelCols = rowFields.length === 0 ? 1 : compact ? 1 : rowFields.length;
    this.axis = {
      headerRows, labelCols, valuesOuter, colFields: colFields.length, valueFields: valueFields.length,
      contentTop: Math.max(0, pageFields.length + 1 - this.row),
    };

    // ---- column axis: value groups (outermost for several data fields) x paths
    interface ColLeaf {
      kind: 'item' | 'subtotal' | 'grand';
      path: string[];
      level: number;
      depth: number;
      value: PivotFieldModel;
      groupStart: boolean;
    }
    const leaves: ColLeaf[] = [];
    const walkCol = (level: number, path: string[], value: PivotFieldModel): void => {
      if (level >= colFields.length) {
        leaves.push({ kind: 'item', path, level, depth: colFields.length, value, groupStart: false });
        return;
      }
      const model = colFields[level]!;
      const under = path.map((item, i) => [colFields[i]!.sourceName, item] as const);
      for (const item of this.visibleItems(model, under)) {
        const child = [...path, item];
        if (showDrill && this.isCollapsedItem(model.sourceName, item)) {
          leaves.push({ kind: 'item', path: child, level, depth: level + 1, value, groupStart: false });
          continue;
        }
        const before = leaves.length;
        walkCol(level + 1, child, value);
        if (leaves.length === before) continue;
        if (level < colFields.length - 1 && this.subtotalShown(model))
          leaves.push({ kind: 'subtotal', path: child, level, depth: level + 1, value, groupStart: false });
      }
    };
    for (const value of valuesOuter ? valueFields : [valueFields[0]!]) {
      const before = leaves.length;
      walkCol(0, [], value);
      if (leaves.length === before) leaves.push({ kind: 'item', path: [], level: 0, depth: 0, value, groupStart: true });
      else leaves[before]!.groupStart = true;
    }
    if (grandColumn)
      for (const value of valuesOuter ? valueFields : [valueFields[0]!])
        leaves.push({ kind: 'grand', path: [], level: 0, depth: 0, value, groupStart: false });
    const dataCols = leaves.length;

    // ---- column header texts, one row per column field (+ value/labels rows)
    const headerText: string[][] = [];
    for (let r = 0; r < headerRows; r++) headerText.push(new Array<string>(leaves.length).fill(''));
    const groupOf = new Map<PivotFieldModel, number>();
    (valuesOuter ? valueFields : [valueFields[0]!]).forEach((value, index) => groupOf.set(value, index));
    const captioned = new Set<string>();
    leaves.forEach((leaf, index) => {
      const caption = leaf.value.displayName;
      if (colFields.length === 0) {
        headerText[0]![index] = caption;
        return;
      }
      if (showValuesRow) {
        if (leaf.kind === 'grand') headerText[1]![index] = valuesOuter ? ` Total ${caption}` : GRAND_TOTAL_CAPTION;
        else if (leaf.groupStart) headerText[1]![index] = caption;
      }
      for (let level = 0; level < colFields.length; level++) {
        const row = levelRowBase + level;
        if (leaf.kind === 'item') {
          // Like the trial (merged header cells), each caption is written once,
          // in the first column of its group.
          const key = `${groupOf.get(leaf.value)}\u0000${level}\u0000${leaf.path.slice(0, level + 1).join('\u0001')}`;
          if (!captioned.has(key)) {
            captioned.add(key);
            headerText[row]![index] = leaf.path[level] ?? '';
          }
        } else if (leaf.kind === 'subtotal') {
          if (level === leaf.level) headerText[row]![index] = `${leaf.path[level] ?? ''} Total`;
        } else if (!showValuesRow && level === 0) headerText[row]![index] = GRAND_TOTAL_CAPTION;
      }
    });
    if (colFields.length && leaves.length) headerText[0]![0] = COLUMN_LABELS_CAPTION;

    // ---- row axis
    interface RowEntry {
      kind: 'item' | 'group' | 'subtotal' | 'grand' | 'blank';
      path: string[];
      level: number;
      firstOf: boolean[];
      values: boolean;
    }
    const rows: RowEntry[] = [];
    const walkRows = (level: number, path: string[], firstOf: boolean[]): void => {
      const model = rowFields[level]!;
      const under = path.map((item, i) => [rowFields[i]!.sourceName, item] as const);
      const isLeafLevel = level === rowFields.length - 1;
      this.visibleItems(model, under).forEach((item, order) => {
        const itemPath = [...path, item];
        const mine = [...firstOf, order === 0];
        const showSub = !isLeafLevel && this.subtotalShown(model);
        const onTop = showSub && model.isShowSubtotalTop === true;
        const collapsed = !isLeafLevel && showDrill && this.isCollapsedItem(model.sourceName, item);
        if (showSub && onTop) rows.push({ kind: 'subtotal', path: itemPath, level, firstOf: mine, values: true });
        if (isLeafLevel) {
          rows.push({ kind: 'item', path: itemPath, level, firstOf: mine, values: true });
          if (options.insertBlankLineAfterEachItem)
            rows.push({ kind: 'blank', path: itemPath, level, firstOf: mine, values: false });
        } else if (collapsed) {
          // A collapsed group row aggregates its items, like the trial.
          rows.push({ kind: 'group', path: itemPath, level, firstOf: mine, values: true });
        } else {
          if (!tabular) rows.push({ kind: 'group', path: itemPath, level, firstOf: mine, values: false });
          walkRows(level + 1, itemPath, mine);
        }
        if (showSub && !onTop && !collapsed) rows.push({ kind: 'subtotal', path: itemPath, level, firstOf: mine, values: true });
      });
    };
    if (rowFields.length) walkRows(0, [], []);
    else rows.push({ kind: 'item', path: [], level: -1, firstOf: [], values: true });
    if (grandRow) rows.push({ kind: 'grand', path: [], level: 0, firstOf: [], values: true });

    // ---- geometry: the page area sits above the anchor, then one blank line
    const pageRows = pageFields.length;
    const contentTop = Math.max(0, pageRows + 1 - this.row);
    const pageOffset = contentTop - pageRows - 1;
    const bodyTop = contentTop + headerRows;
    const valueLeft = labelCols;

    pageFields.forEach((model, i) => {
      cells.push({ row: pageOffset + i, col: 0, kind: 'pageLabel', text: model.displayName, slot: 'reportFilterLabelsStyle' });
      cells.push({
        row: pageOffset + i, col: 1, kind: 'pageValue', text: this.pageSelection(model),
        slot: 'reportFilterValuesStyle', filterButton: showFilter,
      });
    });

    // ---- header block: the label columns and the column header columns
    for (let r = 0; r < headerRows; r++) {
      for (let c = 0; c < labelCols; c++) {
        const lastRow = r === headerRows - 1;
        let text = '';
        if (lastRow && rowFields.length)
          text = compact ? options.rowHeaderCaption ?? ROW_LABELS_CAPTION : rowFields[c]?.displayName ?? '';
        else if (r === 0 && colFields.length > 0 && !showValuesRow && rowFields.length)
          text = valueFields[0]!.displayName;
        cells.push({
          row: contentTop + r, col: c, kind: 'corner', text: text === '' ? undefined : text,
          slot: 'firstHeaderCellStyle',
          filterButton: lastRow && showFilter && rowFields.length > 0,
        });
      }
    }
    leaves.forEach((leaf, index) => {
      for (let r = 0; r < headerRows; r++) {
        const text = headerText[r]![index]!;
        cells.push({
          row: contentTop + r, col: valueLeft + index, kind: 'colHeader',
          text: text === '' ? undefined : text, slot: 'headerRowStyle',
          filterButton: colFields.length > 0 && r === 0 && index === 0 && showFilter,
        });
      }
    });

    // ---- body rows
    const stripeSlot = (entry: RowEntry): string | undefined => {
      if (!options.bandRows || entry.kind !== 'item') return undefined;
      const position = rows.filter(row => row.kind === 'item').indexOf(entry);
      if (position < 0) return undefined;
      const theme = this.themeObject ?? getBuiltInTheme(this.themeKey);
      const size = Math.max(1, Number(theme?.firstRowStripSize() ?? 1));
      return Math.floor(position / size) % 2 === 0 ? 'firstRowStripeStyle' : 'secondRowStripeStyle';
    };
    const rowLabelSlot = (entry: RowEntry, col: number, stripe: string | undefined): string =>
      entry.kind === 'grand' ? 'grandTotalRowStyle'
        : entry.kind === 'subtotal' ? `subtotalRow${Math.min(3, Math.max(1, entry.level + 1))}Style`
        : entry.kind === 'group' && (compact || col === entry.level) ? `rowSubheading${Math.min(3, entry.level + 1)}Style`
        : stripe ?? 'wholeTableStyle';
    rows.forEach((entry, rowIndex) => {
      const gridRow = bodyTop + rowIndex;
      if (entry.kind === 'blank') {
        for (let c = 0; c < valueLeft + dataCols; c++)
          cells.push({ row: gridRow, col: c, kind: 'value', text: '', slot: 'blankRowStyle' });
        return;
      }
      const own = compact ? 0 : entry.level;
      const stripe = stripeSlot(entry);
      for (let c = 0; c < labelCols; c++) {
        let text = '';
        if (entry.kind === 'grand') text = c === 0 ? GRAND_TOTAL_CAPTION : '';
        else if (entry.kind === 'subtotal') text = c === own ? `${entry.path[entry.level] ?? ''} Total` : '';
        else if (entry.kind === 'group') text = c === own ? String(entry.path[entry.level] ?? '') : '';
        else if (!rowFields.length)
          text = rowIndex === 0 && c === 0 && colFields.length > 0 && !showValuesRow && valueFields.length === 1
            ? valueFields[0]!.displayName : '';
        else if (compact) text = String(entry.path[entry.path.length - 1] ?? '');
        else {
          const item = entry.path[c];
          // Outline: the group row carries the parent label. Tabular has no group
          // rows, so the first item of a group repeats it (`fillDownLabels` all).
          const firstOfGroup = entry.firstOf.slice(c + 1).every(Boolean);
          text = item == null ? missingText(options)
            : c === rowFields.length - 1 || options.fillDownLabels || (tabular && firstOfGroup) ? String(item) : '';
        }
        // Drill buttons: group rows carry them; tabular has no group rows, so the
        // first row of a group carries the button of each of its parent levels.
        const firstOfGroup = entry.kind === 'item' && entry.firstOf.slice(c + 1).every(Boolean);
        const drillLevel = entry.kind === 'group' ? entry.level
          : tabular && !compact && entry.kind === 'item' && firstOfGroup ? c : -1;
        const hasDrill = showDrill && drillLevel >= 0 && drillLevel < rowFields.length - 1;
        cells.push({
          row: gridRow, col: c,
          kind: entry.kind === 'grand' ? 'grandLabel' : entry.kind === 'subtotal' ? 'subtotalLabel' : 'rowLabel',
          text: text === '' ? undefined : text, slot: rowLabelSlot(entry, c, stripe), level: entry.level,
          indent: this.labelIndent(entry.kind, entry.level, rowFields.length, compact),
          expand: hasDrill ? true : undefined,
          drillField: hasDrill ? rowFields[drillLevel]!.sourceName : undefined,
          drillItem: hasDrill ? String(entry.path[drillLevel] ?? '') : undefined,
          collapsed: hasDrill
            ? (entry.kind === 'group' ? entry.values : this.isCollapsedItem(rowFields[drillLevel]!.sourceName, String(entry.path[drillLevel])))
            : undefined,
          drillOffset: compact && drillLevel > 0 ? 11 + 16 * drillLevel : 11,
        });
      }
      const rowDepth = entry.kind === 'item' ? rowFields.length : entry.kind === 'grand' ? 0 : entry.level + 1;
      for (const [index, leaf] of leaves.entries()) {
        if (!entry.values) {
          // Expanded group rows keep their node metadata, without a value.
          const groupPairs: (readonly [string, string])[] = [];
          for (let level = 0; level <= entry.level; level++) groupPairs.push([rowFields[level]!.sourceName, entry.path[level]!]);
          cells.push({
            row: gridRow, col: valueLeft + index, kind: 'value', value: undefined,
            node: {
              fieldInfos: this.nodeFields(groupPairs),
              valueInfo: { sourceName: leaf.value.displayName, subtotalType: leaf.value.subtotal ?? SubtotalType.sum },
            },
            slot: `rowSubheading${Math.min(3, entry.level + 1)}Style`,
          });
          continue;
        }
        const pairs: (readonly [string, string])[] = [];
        for (let level = 0; level < rowDepth; level++) pairs.push([rowFields[level]!.sourceName, entry.path[level]!]);
        for (let level = 0; level < leaf.depth; level++) pairs.push([colFields[level]!.sourceName, leaf.path[level]!]);
        const subtotal = leaf.value.subtotal ?? SubtotalType.sum;
        const rowsIn = this.rowsFor(pairs);
        const isCalcContext = pairs.some(([field, item]) => this.fieldFor(field)?.calcItems?.has(String(item)));
        // An intersection without source rows stays empty, like the trial.
        const value = rowsIn.length || isCalcContext
          ? this.cellValueFor(pairs, leaf.value)
          : undefined;
        const missing = value === undefined || value === null
          ? (options.showMissing !== false && options.missingCaption !== undefined && options.missingCaption !== ''
            ? String(options.missingCaption) : undefined)
          : undefined;
        const slot = entry.kind === 'grand' ? 'grandTotalRowStyle'
          : leaf.kind === 'grand' ? 'grandTotalColumnStyle'
          : entry.kind === 'subtotal' ? `subtotalRow${Math.min(3, Math.max(1, entry.level + 1))}Style`
          : leaf.kind === 'subtotal' ? `subtotalColumn${Math.min(3, leaf.level + 1)}Style`
          : stripe ?? 'wholeTableStyle';
        cells.push({
          row: gridRow, col: valueLeft + index,
          kind: entry.kind === 'grand' ? 'grandValue' : entry.kind === 'subtotal' ? 'subtotalValue' : 'value',
          text: missing, value,
          node: {
            fieldInfos: this.nodeFields(pairs),
            valueInfo: { sourceName: leaf.value.displayName, subtotalType: subtotal },
          },
          slot,
        });
      }
    });

    return finish(pageRows, contentTop, headerRows + rows.length, labelCols + dataCols);
  }

  /**
   * Value of one context (pairs of axis field/items) for one value model:
   * raw aggregation, calculated-field formulas and calculated-item
   * contributions, with the trial's `calcItemAggregation` semantics.
   */
  private cellValueFor(pairs: readonly (readonly [string, string])[], valueModel: PivotFieldModel): number | null {
    const calcLevel = pairs.findIndex(([field, item]) => this.fieldFor(field)?.calcItems?.has(String(item)));
    if (calcLevel >= 0) {
      if (this.options.calcItemAggregation === 1) return null;
      return this.evalCalcItem(pairs, calcLevel, valueModel);
    }
    const base = this.rawAggregate(pairs, valueModel);
    if (this.options.calcItemAggregation === 1) return base;
    let total = base;
    for (const model of this.models) {
      if (!model.calcItems?.size) continue;
      if (pairs.some(([field]) => field === model.sourceName)) continue;
      if (model.area !== PivotTableFieldType.rowField && model.area !== PivotTableFieldType.columnField) continue;
      for (const name of model.calcItems.keys()) {
        const contribution = this.evalCalcItem([...pairs, [model.sourceName, name]], pairs.length, valueModel);
        if (contribution !== null) total = (total ?? 0) + contribution;
      }
    }
    return total;
  }

  /** Evaluates `Field[Item]`-style calculated-item formulas in a context. */
  private evalCalcItem(pairs: readonly (readonly [string, string])[], level: number, valueModel: PivotFieldModel): number | null {
    const [sourceName, item] = pairs[level]!;
    const model = this.fieldFor(sourceName);
    const info = model?.calcItems?.get(String(item));
    if (!info) return null;
    const value = evaluateCalcFormula(info.formula, {
      field: (name): CalcValue => {
        const target = this.fieldFor(name);
        const source = target?.sourceName ?? name;
        if (!this.cache.fieldIndex.has(source)) return null;
        return this.rawAggregate(pairs, this.valueModelNamed(source) ?? { sourceName: source, subtotal: valueModel.subtotal } as PivotFieldModel);
      },
      item: (field, refItem): CalcValue => {
        const target = this.fieldFor(field);
        const source = target?.sourceName ?? field;
        const base = pairs.filter(([name]) => name !== source);
        base.push([source, String(refItem)]);
        return this.cellValueFor(base, valueModel);
      },
    });
    return typeof value === 'number' && Number.isFinite(value) ? roundPivotValue(value) : null;
  }

  /** Aggregation (or calculated-field evaluation) for a plain context. */
  private rawAggregate(pairs: readonly (readonly [string, string])[], valueModel: PivotFieldModel): number | null {
    const formula = valueModel.calcFormula ?? this.calcFields.get(valueModel.sourceName);
    if (formula) {
      const visiting = new Set<string>([valueModel.sourceName]);
      const evalRef = (name: string, refPairs: readonly (readonly [string, string])[]): number | null => {
        if (visiting.has(name)) return null;
        const model = this.valueModelNamed(name);
        if (!model) return null;
        visiting.add(name);
        const result = model.calcFormula || this.calcFields.has(model.sourceName)
          ? this.rawAggregate(refPairs, model)
          : this.rawAggregateValue(refPairs, model);
        visiting.delete(name);
        return result;
      };
      const value = evaluateCalcFormula(formula, {
        field: (name): CalcValue => evalRef(name, pairs),
        item: (field, refItem): CalcValue => {
          const target = this.fieldFor(field);
          const source = target?.sourceName ?? field;
          const refPairs = pairs.filter(([name]) => name !== source);
          refPairs.push([source, String(refItem)]);
          return this.cellValueFor(refPairs, valueModel);
        },
      });
      return typeof value === 'number' && Number.isFinite(value) ? roundPivotValue(value) : null;
    }
    return this.rawAggregateValue(pairs, valueModel);
  }

  private rawAggregateValue(pairs: readonly (readonly [string, string])[], valueModel: PivotFieldModel): number | null {
    const rows = this.rowsFor(pairs);
    if (!rows.length) return null;
    const subtotal = valueModel.subtotal ?? SubtotalType.sum;
    return aggregateRows(this.cache, rows, valueModel.sourceName, subtotal);
  }

  /** Value-area model for a source name (its subtotal), or a sum fallback. */
  private valueModelNamed(name: string): PivotFieldModel | undefined {
    const byDisplay = this.areaFields(PivotTableFieldType.valueField).find(model => model.displayName === name);
    if (byDisplay) return byDisplay;
    const bySource = this.models.find(model => model.sourceName === name && model.area === PivotTableFieldType.valueField);
    if (bySource) return bySource;
    if (this.calcFields.has(name)) return this.models.find(model => model.sourceName === name);
    const plain = this.models.find(model => model.sourceName === name && model.area === -1);
    if (plain || this.cache.fieldIndex.has(name))
      return { sourceName: name, displayName: name, area: -1, index: -1, dataType: PivotDataType.number, isShowSubtotalTop: false, subtotal: SubtotalType.sum } as PivotFieldModel;
    return undefined;
  }

  /** Label indentation of a body cell, in 8 px units (the drill button column). */
  private labelIndent(kind: string, level: number, rowCount: number, compact: boolean): number {
    if (kind === 'grand') return 0;
    if (rowCount < 2) return 0;
    if (!compact) return kind === 'subtotal' || kind === 'item' ? 0 : 2.25;
    if (kind === 'item') return 3 + 2 * (rowCount - 1);
    if (kind === 'subtotal') return 2;
    return 2.25 + 2 * level;
  }

  /** `getNodeInfo` metadata for a node: field display names with their items. */
  private nodeFields(pairs: readonly (readonly [string, string])[]): IPivotItemInfo[] {
    return pairs.map(([sourceName, item]) => ({
      fieldName: this.models.find(model => model.sourceName === sourceName)?.displayName ?? sourceName,
      // Trial: item texts that came from numeric cells of a mixed column are
      // exposed as numbers.
      fieldItem: this._typedItem(sourceName, item) as string,
    }));
  }

  private _typedItem(sourceName: string, item: string): string | number {
    const index = this.cache.fieldIndex.get(sourceName);
    const field = index === undefined ? undefined : this.cache.fields[index];
    return field?.numericKeys?.has(item) ? Number(item) : item;
  }
}

// layout geometry helpers

function missingText(options: IPivotTableOption): string {
  if (options.showMissing && options.missingCaption !== undefined && options.missingCaption !== '') return String(options.missingCaption);
  return '';
}

function aggregateRows(cache: PivotCache, rows: number[], sourceName: string, subtotal: SubtotalType): number | null {
  const index = cache.fieldIndex.get(sourceName);
  if (index === undefined) return null;
  const aggregator = new Aggregator();
  for (const row of rows) aggregator.add(cache.rows[row]?.[index]);
  const value = aggregator.result(subtotal);
  return value === null ? null : roundPivotValue(value);
}

/** The trial stores aggregated values with 14 significant digits. */
function roundPivotValue(value: number): number {
  if (!Number.isFinite(value) || value === 0 || Number.isInteger(value)) return value;
  return Number(value.toPrecision(14));
}

function sortTypeName(sortType: number): string {
  switch (sortType) {
    case 1: return 'descending';
    case 2: return 'manual';
    default: return 'ascending';
  }
}

function capitalize(key: string): string {
  return String(key).replace(/^(light|medium|dark)/i, match => match.charAt(0).toUpperCase() + match.slice(1));
}

function ooxmlSubtotal(subtotal: SubtotalType | undefined): string {
  switch (subtotal) {
    case SubtotalType.count: return 'count';
    case SubtotalType.average: return 'average';
    case SubtotalType.max: return 'max';
    case SubtotalType.min: return 'min';
    case SubtotalType.product: return 'product';
    case SubtotalType.countNums: return 'countNums';
    case SubtotalType.stdDev: return 'stdDev';
    case SubtotalType.stdDevp: return 'stdDevp';
    case SubtotalType.varr: return 'var';
    case SubtotalType.varp: return 'varp';
    default: return 'sum';
  }
}

function entityKind(dataType: PivotDataType): string {
  if (dataType === PivotDataType.number) return 'n';
  if (dataType === PivotDataType.date) return 'd';
  return 's';
}

function entityValue(dataType: PivotDataType, key: string): unknown {
  if (dataType === PivotDataType.number) return Number(key);
  if (dataType === PivotDataType.date) return usDateFromKey(key);
  return key;
}

function usDateFromKey(key: string | undefined): unknown {
  if (key === undefined) return undefined;
  const time = Number(key);
  if (!Number.isFinite(time)) return key;
  const date = new Date(time);
  return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
}

function subtotalFromName(name: unknown): SubtotalType {
  switch (String(name ?? 'sum')) {
    case 'count': return SubtotalType.count;
    case 'average': return SubtotalType.average;
    case 'max': return SubtotalType.max;
    case 'min': return SubtotalType.min;
    case 'product': return SubtotalType.product;
    case 'countNums': return SubtotalType.countNums;
    case 'stdDev': return SubtotalType.stdDev;
    case 'stdDevp': return SubtotalType.stdDevp;
    case 'var': return SubtotalType.varr;
    case 'varp': return SubtotalType.varp;
    default: return SubtotalType.sum;
  }
}

function stripFilterKind<T>(filter: unknown): T {
  const copy = { ...(filter as Record<string, unknown>) };
  delete copy.kind;
  delete copy.slicerManaged;
  return copy as T;
}

/** Every writable style member, in merge order (font parts before shorthand). */
const PIVOT_STYLE_KEYS = ['backColor', 'foreColor', 'borderLeft', 'borderTop', 'borderRight', 'borderBottom',
  'borderHorizontal', 'borderVertical', 'textDecoration', 'fontStyle', 'fontWeight', 'fontSize', 'fontFamily', 'font'] as const;

/** Shallow style merge: entries from `top` win over `base`. */
function mergePivotStyle(base: PivotTableStyle | undefined, top: PivotTableStyle | undefined): PivotTableStyle | undefined {
  if (!base) return top;
  if (!top) return base;
  const out = new PivotTableStyle();
  for (const source of [base, top])
    for (const key of PIVOT_STYLE_KEYS) {
      const value = (source as unknown as Record<string, unknown>)[key];
      if (value !== undefined) (out as unknown as Record<string, unknown>)[key] = value;
    }
  return out;
}

export function resolveTheme(style: string | PivotTableTheme | undefined, sheet: PivotSheet | undefined): PivotTableTheme | undefined {
  if (!style) return undefined;
  if (style instanceof PivotTableTheme) return style;
  const name = String(style).toLowerCase().replace(/\s+/g, '');
  const builtIn = (PivotTableThemes as unknown as Record<string, PivotTableTheme>)[name];
  if (builtIn) return builtIn;
  const custom = sheet?.parent?.customPivotTableThemes;
  return custom?.get(name) ?? custom?.get(String(style));
}

export function themeKeyOf(theme: PivotTableTheme): string {
  const name = String(theme.name() ?? '').toLowerCase();
  const entries = PivotTableThemes as unknown as Record<string, PivotTableTheme>;
  for (const key of Object.keys(entries))
    if (key !== 'prototype' && key !== 'name' && key !== 'length' && entries[key] === theme) return key;
  return name;
}

export function getBuiltInTheme(key: string): PivotTableTheme | undefined {
  return (PivotTableThemes as unknown as Record<string, PivotTableTheme>)[String(key).toLowerCase()];
}

function paletteOf(sheet: PivotSheet): { getColor(name: string): string } | undefined {
  const host = sheet as unknown as { _themeValue?: () => unknown };
  if (typeof host._themeValue !== 'function') return undefined;
  try {
    return themeFromValue(host._themeValue() as never)._colorsValue();
  } catch {
    return undefined;
  }
}

/** Maps a `getStyle`/`setStyle` pivot area to the theme slot it selects. */
function slotForArea(area: IPivotArea): string | undefined {
  if (!area) return undefined;
  if (area.grandRow) return 'grandTotalRowStyle';
  if (area.grandCol) return 'grandTotalColumnStyle';
  if (area.type === 5) return 'firstHeaderCellStyle';
  if (area.type === 7) return 'headerRowStyle';
  if (area.type === 1) return undefined;
  if (area.fieldName) return 'wholeTableStyle';
  if (area.type === 0 || area.type === undefined) return 'wholeTableStyle';
  return undefined;
}

/** Stable serialization key for an IPivotArea object (TASK 46 rule matching). */
function stableAreaKey(area: unknown): string {
  const walk = (value: unknown): unknown =>
    value && typeof value === 'object'
      ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, walk(v)]))
      : value;
  return JSON.stringify(walk(area ?? null));
}

function mergeRanges(ranges: Range[]): Range[] {
  const merged: Range[] = [];
  for (const range of ranges) {
    const hit = merged.find(other =>
      (other.row === range.row && other.col + other.colCount === range.col)
      || (other.row === range.row && other.col - other.colCount === range.col)
    );
    if (hit && hit.row === range.row) {
      if (hit.col + hit.colCount === range.col) hit.colCount++;
      else { hit.col = range.col; hit.colCount++; }
    } else merged.push(new Range(range.row, range.col, range.rowCount, range.colCount));
  }
  return merged;
}
