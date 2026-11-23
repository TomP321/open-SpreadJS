import { Worksheet } from '../worksheet.js';
import type { Workbook } from '../workbook.js';
import { View } from '../data/index.js';
import { convertSchemaValue } from '../data/schema.js';
import { Range, Style, clone } from '../primitives.js';
import { TableTheme, TableThemes } from '../features/table-style.js';
import { ruleFromJSON } from '../features/conditional-formatting.js';
import { DefaultDataValidator } from '../features/data-validation.js';

type SortInfo = { field: string; ascending?: boolean; compare?: string | ((a: unknown, b: unknown, ascending: boolean) => number) };
type RowAction = { [key: string]: unknown; name?: string; icons?: (string | number)[];
  iconSelector?: (item: unknown, index: number, context: unknown) => number | boolean;
  iconSize?: number | { width?: number; height?: number }; command?: string; tooltip?: string };
type FilterInfo = { field: string; values?: { value: unknown; type?: string }[]; condition?: unknown;
  paths?: { path: unknown[]; type?: string }[] };

/**
 * Combined getter/setter members return `undefined` in set mode on the trial even
 * though the d.ts declares the getter's type (probed black-box). Typed `never` so
 * every such site reads as one honest, documented assertion instead of a cast pair.
 */
const setModeResult = undefined as never;

/**
 * The composed built-in row action the trial reports for a fresh TableSheet, both in
 * `rowActionOptions()` read-back and in workbook JSON (probe .probe/api-sweep-item2d.json:
 * fresh trial answers [{name:'composedPinDirtyNewWarningRow', icons:[ROW_ACTION_* names]}]).
 * Its icons are internal named constants handled by the row-state renderer, so the user
 * icon pipeline skips this entry.
 */
const COMPOSED_ROW_ACTION: RowAction = { name: 'composedPinDirtyNewWarningRow',
  icons: ['ROW_ACTION_PIN_ROW', 'ROW_ACTION_NEW_ROW', 'ROW_ACTION_INSERTED_ROW', 'ROW_ACTION_UPDATED_ROW', 'ROW_ACTION_WARNING_INFO'] };
/** True when a list is exactly the trial's default composed built-in action. */
export function isDefaultRowActionOptions(options: unknown): boolean {
  return Array.isArray(options) && options.length === 1 && (options[0] as RowAction)?.name === COMPOSED_ROW_ACTION.name
    && JSON.stringify((options[0] as RowAction).icons) === JSON.stringify(COMPOSED_ROW_ACTION.icons);
}

/**
 * The four default column style rules the trial serializes in every data-view JSON
 * (probe .probe/api-sweep-item2d.json `standaloneView.options`; public API data).
 */
export function tableViewStyleRules(): Record<string, unknown> {
  const rule = (state: number) => ({ rule: { area: 1, direction: 2, state }, style: { decoration: { icons: [{ src: '' }] } } });
  return { pin: rule(1024), primaryKey: rule(2048), readonly: rule(4), required: rule(4096) };
}

/**
 * Default `addition.options` blob of a TableSheet tab, reproduced from the trial's
 * workbook JSON (probe .probe/api-sweep-item2d.json `additionA.options`; public API data).
 * `alternatingRowOptions.style[0].backColor` follows the applied table theme's first-row
 * strip token (Light2 -> 'Accent 1 80', dark1 -> 'Text 1 25').
 */
export function tableSheetDefaultOptions(theme?: { toJSON?: () => Record<string, unknown> } | null): Record<string, unknown> {
  const stripStyle = (theme?.toJSON?.() ?? {}) as Record<string, Record<string, unknown>>;
  const alternating = typeof stripStyle.firstRowStripStyle?.backColor === 'string'
    ? stripStyle.firstRowStripStyle.backColor : 'Accent 1 80';
  const item = (name: string, icon: string) => ({ name, text: name, iconClass: `gc-defined-column-type-icon-${icon}` });
  return {
    allowAddNew: true,
    defaultStackRowHeight: null,
    menuItemVisibility: { promoteMenuItemVisible: false, demoteMenuItemVisible: false, moveUpMenuItemVisible: false,
      moveDownMenuItemVisible: false, addBeforeMenuItemVisible: false, addAfterMenuItemVisible: false,
      addAboveMenuItemVisible: false, addBelowMenuItemVisible: false, expandAllLevelMenuItemVisible: false,
      collapseAllLevelMenuItemVisible: false, expandToLevelMenuItemVisible: false },
    alternatingRowOptions: { step: [1, 1], style: [{ backColor: alternating }, null] },
    isDesignMode: false,
    showRowNumber: false,
    enableDefineColumn: false,
    defineColumnCommand: 'gc.spread.contextMenu.defineColumn',
    submitDefineColumnCommand: 'gc.spread.defineColumn.submit',
    columnTypeItems: [item('Number', 'number'), item('Text', 'text'), item('Formula', 'formula'), item('Lookup', 'lookup'),
      item('Date', 'date'), item('Checkbox', 'checkbox'), item('Select', 'select'), item('Currency', 'currency'),
      item('Percent', 'percent'), item('Phone', 'phone'), item('Email', 'email'), item('URL', 'url'),
      item('CreatedTime', 'createdtime'), item('ModifiedTime', 'modifiedtime'), item('Attachment', 'attachment'),
      item('Barcode', 'barcode')],
    groupLayout: { mode: 0 },
    allowSorts: true,
  };
}

/**
 * Evaluate a plain filter-condition descriptor object. The trial accepts these
 * directly in TableSheet.filter (probe .probe/api-sweep-item2g.json: the trial echoes
 * {relation,operator,value1} back from filter() and stores it in filterItemMap).
 * Compiled `Condition` instances take the evaluate() path instead.
 */
export function matchesPlainCondition(value: unknown, condition: Record<string, unknown>): boolean {
  const name = String(condition.operator ?? condition.relation ?? 'equals').toLowerCase().replace(/[\s_]+/g, '');
  const left = value == null ? '' : String(value);
  const target = condition.value1;
  const right = target == null ? '' : String(target);
  const bothNumeric = value != null && target != null && !Number.isNaN(Number(value)) && !Number.isNaN(Number(target));
  const compare = bothNumeric ? Number(value) - Number(target) : left.localeCompare(right);
  switch (name) {
    case 'equals': case 'equalto': case 'eq': return left === right;
    case 'notequals': case 'notequalto': case 'neq': case 'not': return left !== right;
    case 'contains': case 'contain': return left.includes(right);
    case 'doesnotcontain': case 'notcontain': return !left.includes(right);
    case 'beginswith': case 'startswith': return left.startsWith(right);
    case 'endswith': return left.endsWith(right);
    case 'greaterthan': case 'gt': return compare > 0;
    case 'greaterthanorequal': case 'equalsorgreater': case 'greaterequal': case 'gte': return compare >= 0;
    case 'lessthan': case 'lt': return compare < 0;
    case 'lessthanorequal': case 'equalsorless': case 'lessequal': case 'lte': return compare <= 0;
    case 'between': {
      const low = String(condition.value1 ?? ''), high = String(condition.value2 ?? '');
      return bothNumeric ? Number(value) >= Number(low) && Number(value) <= Number(high) : left >= low && left <= high;
    }
    case 'blank': case 'isempty': case 'isblank': return left === '';
    case 'notblank': case 'isnotblank': case 'isnotempty': return left !== '';
    default: return left === right;
  }
}

/** Feature modules register here so a tab JSON can be upgraded to a specialized subclass. */type SheetTabJSONHook = (sheet: TableSheet, settings: Record<string, unknown>) => void;
let sheetTabJSONHook: SheetTabJSONHook | undefined;
export function registerSheetTabJSONHook(hook: SheetTabJSONHook): void { sheetTabJSONHook = hook; }

export class TableSheet extends Worksheet {
  readonly _isTableSheet = true;
  private view?: View;
  private freeHeader?: Worksheet;
  private unsubscribe?: () => void;
  private viewListeners = new Set<() => void>();
  private filters: FilterInfo[] = [];
  private sorts: SortInfo[] = [];
  private groups: { field: string; [key: string]: unknown }[] = [];
  private outlinePosition = 1;
  private baseRowHeaderWidth?: number;
  private detailsVisible = true;
  private columnVisibility = new Map<string, boolean>();
  private collapsedGroups = new Set<string>();
  private hiddenGroupRows = new Set<number>();
  private hiddenHierarchyRows = new Set<number>();
  private collapsedHierarchy = new Set<object>();
  private hierarchyLevels: number[] = [];
  private actions: RowAction[] = [COMPOSED_ROW_ACTION];
  private tableTheme = TableThemes.light2 as TableTheme;
  private templateStyles = new Map<string, Partial<Style>>();
  private templateNames = new Map<string, string>();
  private templateRules = new Map<string, { rules: NonNullable<ReturnType<typeof ruleFromJSON>>[];
    validators: DefaultDataValidator[]; states: { state: number; style: Partial<Style> }[] }>();
  constructor(name = 'TableSheet1', view?: View, _options?: object) {
    super(name);
    this.defaults.rowHeight = 30;
    this.defaults.colHeaderRowHeight = 30;
    this.setRowCount(0);
    this.setColumnCount(0);
    if (view) this.setDataView(view);
  }
  /**
   * Builds the tab from its SSJSON. Before the shared sheet JSON is applied, a feature module's
   * registered hook may upgrade this generic instance to its specialized subclass (a tab JSON
   * carrying a `gantt` section becomes a `GanttSheet`); afterwards the (possibly upgraded)
   * instance gets its `_afterTabJSON` chance to apply the feature section.
   */
  override fromJSON(settings: object): void {
    sheetTabJSONHook?.(this, settings as Record<string, unknown>);
    super.fromJSON(settings);
    (this as { _afterTabJSON?: (settings: object) => void })._afterTabJSON?.(settings);
  }
  setDataView(view: View): void {
    this.unsubscribe?.();
    if (this.view !== view) this.columnVisibility.clear();
    this.view = view;
    if (this.groups.length) view.groupBy(this.groups);
    this.unsubscribe = view.onChanged(() => this.refreshView());
    this.refreshView();
    for (const listener of this.viewListeners) listener();
  }
  _onDataViewChanged(listener: () => void): () => void {
    this.viewListeners.add(listener);
    return () => this.viewListeners.delete(listener);
  }
  applyFreeHeaderArea(sheetJson?: object): object | undefined {
    if (sheetJson === undefined) return this.freeHeader?.toJSON();
    const header = new Worksheet();
    header.fromJSON(sheetJson);
    header.setColumnCount(this.getColumnCount());
    this.freeHeader = header;
    const rows = header.getRowCount();
    for (const span of this.getSpans(undefined, 1)) this.removeSpan(span.row, span.col, 1);
    this.setRowCount(rows + 1, 1);
    for (let row = 0; row < rows; row++) {
      const height = header.getRowHeight(row) ?? 20;
      this.setRowHeight(row, height === 20 ? 30 : height, 1);
    }
    for (const span of header.getSpans()) this.addSpan(span.row, span.col, span.rowCount, span.colCount, 1);
    this._invalidate();
    return undefined;
  }
  getDataView(): View { return this.view!; }
  override _usedRange(): { row: number; col: number } {
    const stored = super._usedRange();
    if (!this.view) return stored;
    return {
      row: Math.max(stored.row, this.view.visibleLength() - 1),
      col: Math.max(stored.col, this.getColumnCount() - 1),
    };
  }
  applyNamedCellTemplate(name: string, fieldNames: string[]): void {
    const template = (this.getParent() as Workbook | undefined)?.namedCellTemplates.get(name);
    if (!template || !this.view) return;
    const style = typeof template.style === 'string' ? this.getNamedStyle(template.style) : template.style;
    const fields = new Set(fieldNames);
    const columns = this.view.getColumn() as Record<string, unknown>[];
    for (const [index, column] of columns.entries()) {
      const field = column.value ?? column.name;
      if (typeof field !== 'string' || !fields.has(field)) continue;
      this.templateNames.set(field, name);
      for (const rule of this.templateRules.get(field)?.rules ?? []) this.conditionalFormats.removeRule(rule);
      if (style) this.templateStyles.set(field, { ...style });
      else this.templateStyles.delete(field);
      const rules: NonNullable<ReturnType<typeof ruleFromJSON>>[] = [];
      const validators: DefaultDataValidator[] = [];
      for (const definition of template.conditionalFormats ?? []) {
        const rule = ruleFromJSON(definition as Record<string, unknown>);
        if (rule) {
          rule.ranges([new Range(0, index + this.groupColumns().length, this.getRowCount(), 1)]);
          this.conditionalFormats.addRule(rule);
          rules.push(rule);
        }
      }
      for (const definition of template.dataValidations ?? []) {
        const validator = new DefaultDataValidator();
        validator.fromJSON(definition);
        validators.push(validator);
      }
      const states = (template.cellStates ?? []) as { state: number; style: Partial<Style> }[];
      this.templateRules.set(field, { rules, validators, states });
    }
    this.refreshTemplateRules();
    this._invalidate();
  }
  _namedCellTemplates(): Record<string, string> { return Object.fromEntries(this.templateNames); }
  _serializeSortFilter(): Record<string, unknown> {
    const columns = this.view?.getColumn() as Record<string, unknown>[] | undefined;
    const entries = this.sorts.flatMap(sort => {
      const index = (columns ?? []).findIndex(column => (column.value ?? column.name) === sort.field);
      return index < 0 ? [] : [{ index: index + this.groupColumns().length, ascending: sort.ascending !== false }];
    });
    const map = Object.fromEntries(entries.map(entry => [entry.index, entry]));
    const filterItems: { index: number; conditions: Record<string, unknown>[]; paths?: unknown }[] = this.filters.flatMap(
      (filter): { index: number; conditions: Record<string, unknown>[]; paths?: unknown }[] => {
      const index = (columns ?? []).findIndex(column => (column.value ?? column.name) === filter.field);
      if (index < 0) return [];
      if (filter.values?.length)
        return [{ index: index + this.groupColumns().length, conditions: filter.values.map(item => ({
          text: String(item.value ?? ''), value: item.value, type: item.type ?? 'value', isCondition: false,
        })) }];
      // Condition-only entries pass the condition object through, like the trial
      // (probe .probe/api-sweep-item2g.json `conditionFilter.filterItemMap`). Compiled
      // conditions serialize via their toJSON; plain descriptors are copied verbatim.
      if (filter.condition) {
        const condition = filter.condition as { toJSON?: () => unknown };
        const serialized = typeof condition.toJSON === 'function'
          ? (condition.toJSON() as Record<string, unknown>) : (clone(filter.condition) as Record<string, unknown>);
        return [{ index: index + this.groupColumns().length,
          conditions: [{ ...serialized, isCondition: false }],
          ...(filter.paths ? { paths: clone(filter.paths) } : {}) }];
      }
      if (filter.paths) return [{ index: index + this.groupColumns().length, conditions: [], paths: clone(filter.paths) }];
      return [];
    });
    // Trial: the rowFilter blob is serialized on every TableSheet tab, and lastGroupCount
    // counts group rows = groupBy fields + their summaryFields entries (probe item2e/item2f:
    // 1 group -> 1, +1 summary -> 2, two groups -> 2, none -> 0).
    const groups = this.groupBy();
    const lastGroupCount = groups.length + groups.reduce((sum, group) => sum + ((group.summaryFields as unknown[] | undefined)?.length ?? 0), 0);
    return { range: { row: -1, col: 0, rowCount: -1, colCount: this.getColumnCount() }, typeName: 'HideRowFilter',
      dialogVisibleInfo: { sortByColor: false, filterByColor: false },
      ...(filterItems.length ? { filterItemMap: filterItems, filteredColumns: filterItems.map((item: { index: number }) => item.index) } : {}),
      filterButtonVisibleInfo: Object.fromEntries(Array.from({ length: this.getColumnCount() }, (_, index) => [index, true])),
      showFilterButton: true, filteredOutRows: [], sortMap: entries.length ? { '-1': map, '-2': { ...map } } : {},
      relatedColFilters: {}, lastGroup: false, lastGroupCount, multiSortOrder: entries.map(entry => entry.index) };
  }
  /** The trial serializes built-in custom names on every TableSheet tab (probe item2b:
   *  `@` and `AutoId` with formulas relative to the sheet). They are not user names. */
  _serializeBuiltInNames(json: Record<string, unknown>): void {
    const own = (Array.isArray(json.names) ? json.names : []) as { name?: string }[];
    const builtIn = [
      { name: '@', formula: `${this.name()}!A1`, row: 0, col: 0, isReadOnly: false },
      { name: 'AutoId', formula: `MAX(OFFSET(${this.name()}!$A$1,0,COLUMN()-1,ROW()-1,1))+1`, row: 0, col: 0, isReadOnly: false },
    ];
    json.names = [...builtIn, ...own.filter(entry => entry.name !== '@' && entry.name !== 'AutoId')];
  }
  /** Built-in names arrive through worksheet JSON loading; like the trial they are not
   *  user-customizable names, so they bypass the custom-name validation. */
  override addCustomName(name: string, formula: string, baseRow: number, baseCol: number, comment?: string, isReadOnly?: boolean): void {
    if (name === '@' || name === 'AutoId') return;
    super.addCustomName(name, formula, baseRow, baseCol, comment, isReadOnly);
  }
  /** Include the bound values in workbook JSON, as well as the data-view binding. */
  _serializeBoundCells(json: Record<string, unknown>): void {
    if (!this.view) return;
    const writeArea = (areaName: string, area: number, rowCount: number): void => {
      const areaJson = (json[areaName] ??= {}) as Record<string, unknown>;
      const dataTable = (areaJson.dataTable ??= {}) as Record<string, Record<string, Record<string, unknown>>>;
      for (let row = 0; row < rowCount; row++) {
        for (let col = 0; col < this.getColumnCount(); col++) {
          const value = this.getValue(row, col, area);
          if (value === undefined || value === null) continue;
          const cells = (dataTable[row] ??= {});
          (cells[col] ??= {}).value = value;
        }
      }
      if (!Object.keys(dataTable).length) delete areaJson.dataTable;
    };
    writeArea('data', 3, this.view.visibleLength());
    writeArea('colHeaderData', 1, this.getRowCount(1));
    const columns = this.view.getColumn() as Record<string, unknown>[];
    const saved = (json.columns ??= []) as Record<string, unknown>[];
    columns.forEach((column, index) => {
      const field = column.value ?? column.name;
      const entry = (saved[index + this.groupColumns().length] ??= {});
      if (field !== undefined) entry.name = field;
      if (column.caption !== undefined) entry.displayName = column.caption;
      if (column.width !== undefined) entry.width = column.width;
    });
  }
  private refreshTemplateRules(): void {
    const columns = this.view?.getColumn() as Record<string, unknown>[] | undefined;
    this.cellStates._clearOwned('template:');
    columns?.forEach((column, index) => {
      const field = column.value ?? column.name;
      const entry = typeof field === 'string' ? this.templateRules.get(field) : undefined;
      if (!entry) return;
      const col = index + this.groupColumns().length;
      this.cellStates._replaceOwned(`template:${field}`, new Range(0, col, this.getRowCount(), 1), entry.states);
      for (const rule of entry.rules) rule.ranges([new Range(0, col, this.getRowCount(), 1)]);
      for (const validator of entry.validators) this.setDataValidator(0, col, this.getRowCount(), 1, validator);
    });
  }
  private refreshView(): void {
    if (!this.view) return;
    const columns = this.view.getColumn() as Record<string, unknown>[];
    this.setRowCount(this.view.visibleLength() + 1);
    const groupColumns = this.groupColumns();
    this.setColumnCount(columns.length + groupColumns.length);
    this.refreshTemplateRules();
    groupColumns.forEach((group, index) => {
      const source = columns.find(column => column.value === this.groups[group.level]?.field);
      this.setColumnWidth(index, !group.summary && typeof source?.width === 'number' ? source.width : 100);
    });
    columns.forEach((column, index) => {
      const actual = index + groupColumns.length;
      if (typeof column.width === 'number') this.setColumnWidth(actual, column.width);
      const field = column.value ?? column.name;
      // Visibility: explicit sheet-level toggles win; otherwise follow the view column's
      // own `visible` state, so trial JSON hiding a field (view columns[].visible=false,
      // probe .probe/api-sweep-item2.json) also hides the table-sheet column (trial behavior).
      const hiddenByToggle = typeof field === 'string' && this.columnVisibility.get(field) === false;
      const hiddenInView = (typeof column.visible === 'function' ? (column.visible as () => unknown)() : column.visible) === false;
      super.setColumnVisible(actual, this.detailsVisible && !hiddenByToggle && !hiddenInView);
    });
    this.hierarchyLevels = this.view.hasHierarchy() ? this.view.hierarchyLevels() : [];
    this.updateGroupVisibility();
    this.updateHierarchyVisibility();
    this.updateGroupHeaderWidth();
    this._invalidate();
  }
  override setColumnVisible(col: number, value: boolean, area = 3): void {
    if (area === 3 && this.view) {
      const column = this.view.getColumn(col - this.groupColumns().length) as Record<string, unknown> | undefined;
      const field = column?.value ?? column?.name;
      if (typeof field === 'string') this.columnVisibility.set(field, value);
    }
    super.setColumnVisible(col, value, area);
  }
  private groupColumns(): { field: string; level: number; caption: string; summary: boolean }[] {
    return this.groups.flatMap((group, level) => [
      { field: `${group.field}__${level}`, level, caption: String(group.caption ?? group.field), summary: false },
      ...((group.summaryFields ?? []) as { formula: string }[]).map((summary, index) => ({
        field: `${summary.formula}__${index}__${group.field}__${level}`, level, caption: summary.formula, summary: true,
      })),
    ]);
  }
  _groupColumnCount(): number { return this.groupColumns().length; }
  private updateGroupHeaderWidth(): void {
    const enabled = (this.outlinePosition === 2 || this.outlinePosition === 3) && this.groups.length > 0;
    if (enabled && this.baseRowHeaderWidth === undefined) this.baseRowHeaderWidth = this.getColumnWidth(0, 2);
    if (this.baseRowHeaderWidth !== undefined) {
      this.setColumnWidth(0, this.baseRowHeaderWidth + (enabled ? this.groups.length * 40 : 0), 2);
      if (!enabled) this.baseRowHeaderWidth = undefined;
    }
  }
  _groupHeaderOutlineLevels(row: number): number[] {
    if (this.outlinePosition !== 2 && this.outlinePosition !== 3) return [];
    if (row < 0 || row >= (this.view?.visibleLength() ?? 0)) return [];
    return this.groups.flatMap((_group, level) =>
      row === 0 || this.groupKey(level, row) !== this.groupKey(level, row - 1) ? [level] : []);
  }
  _groupHeaderOutlineCollapsed(row: number, level: number): boolean {
    return this.collapsedGroups.has(this.groupKey(level, row));
  }
  _toggleGroupHeaderOutline(row: number, level: number): void {
    if (this._groupHeaderOutlineLevels(row).includes(level)) {
      this.expandGroupItem(level, row, this._groupHeaderOutlineCollapsed(row, level));
    }
  }
  _groupColumnHasOutline(col: number): boolean {
    return !!this.groupColumns()[col] && !this.groupColumns()[col]?.summary && (this.outlinePosition === 1 || this.outlinePosition === 3);
  }
  _groupRowHasOutline(row: number, col: number): boolean {
    const group = this.groupColumns()[col];
    return row >= 0 && row < (this.view?.visibleLength() ?? 0) && !!group
      && !this.isGroupAncestorCollapsed(group.level, row) && this._groupColumnHasOutline(col)
      && (row === 0 || this.groupKey(group.level, row) !== this.groupKey(group.level, row - 1));
  }
  private isGroupAncestorCollapsed(level: number, row: number): boolean {
    return this.groups.slice(0, level).some((_group, index) => this.collapsedGroups.has(this.groupKey(index, row)));
  }
  _groupHeaderCollapsed(col: number): boolean {
    const group = this.groupColumns()[col];
    return !!group && (this.view?.visibleLength() ?? 0) > 0
      && Array.from({ length: this.view!.visibleLength() }, (_, row) =>
        this.collapsedGroups.has(this.groupKey(group.level, row))).every(Boolean);
  }
  _groupOutlineCollapsed(row: number, col: number): boolean {
    const group = this.groupColumns()[col];
    return !!group && this.collapsedGroups.has(this.groupKey(group.level, row));
  }
  _toggleGroupOutline(row: number, col: number): void {
    const group = this.groupColumns()[col];
    if (!group) return;
    if (row < 0) {
      const collapsed = Array.from({ length: this.view?.visibleLength() ?? 0 }, (_, index) =>
        this.collapsedGroups.has(this.groupKey(group.level, index))).some(Boolean);
      this.expandGroup(this.groups[group.level]!.field, collapsed);
    } else if (this._groupRowHasOutline(row, col)) {
      this.expandGroupItem(group.level, row, this._groupOutlineCollapsed(row, col));
    }
  }
  private groupKey(level: number, row: number): string {
    const data = this.view?.getRowData(row) ?? {};
    return JSON.stringify(this.groups.slice(0, level + 1).map((group, index) => data[`${group.field}__${index}`]));
  }
  private updateGroupVisibility(): void {
    for (const row of this.hiddenGroupRows) this.setRowVisible(row, true);
    this.hiddenGroupRows.clear();
    if (!this.collapsedGroups.size) return;
    const length = this.view?.visibleLength() ?? 0;
    for (let row = 0; row < length; row++) {
      let visible = true;
      for (let level = 0; level < this.groups.length; level++) {
        const key = this.groupKey(level, row);
        if (this.collapsedGroups.has(key) && row > 0 && this.groupKey(level, row - 1) === key) visible = false;
      }
      if (!visible) { this.setRowVisible(row, false); this.hiddenGroupRows.add(row); }
    }
  }
  private updateHierarchyVisibility(): void {
    for (const row of this.hiddenHierarchyRows) {
      if (!this.hiddenGroupRows.has(row)) this.setRowVisible(row, true);
    }
    this.hiddenHierarchyRows.clear();
    const levels = this.hierarchyLevels;
    const collapsedLevels: number[] = [];
    levels.forEach((level, row) => {
      while (collapsedLevels.length && collapsedLevels[collapsedLevels.length - 1]! >= level) collapsedLevels.pop();
      if (collapsedLevels.length) {
        this.setRowVisible(row, false);
        this.hiddenHierarchyRows.add(row);
      }
      const item = this.view?.hierarchyRow(row);
      if (item && this.collapsedHierarchy.has(item)) collapsedLevels.push(level);
    });
  }
  _hierarchyOutline(row: number, col: number): { offset: number; hasChildren: boolean; collapsed: boolean } | undefined {
    const column = this.view?.getColumn(col - this.groupColumns().length) as Record<string, unknown> | undefined;
    const schemaOutline = this.view?.hierarchyOutlineColumn();
    const columns = this.view?.getColumn() as Record<string, unknown>[] | undefined;
    const hasViewOutline = columns?.some(item => !!item.outlineColumn);
    const outlined = column?.outlineColumn || (!hasViewOutline && schemaOutline && (column?.value ?? column?.name) === schemaOutline);
    if (!outlined || !this.view?.hasHierarchy() || row < 0 || row >= this.view.visibleLength()) return undefined;
    const levels = this.hierarchyLevels;
    const level = levels[row] ?? 0;
    const item = this.view.hierarchyRow(row);
    return { offset: 10 + level * 8, hasChildren: (levels[row + 1] ?? -1) > level,
      collapsed: !!item && this.collapsedHierarchy.has(item) };
  }
  _toggleHierarchyOutline(row: number): void {
    const item = this.view?.hierarchyRow(row);
    if (!item) return;
    if (this.collapsedHierarchy.has(item)) this.collapsedHierarchy.delete(item);
    else this.collapsedHierarchy.add(item);
    this.updateHierarchyVisibility();
    this._invalidate();
  }
  addHierarchyItemAbove(row: number, data: Record<string, unknown>): void { this.editHierarchy('addAbove', row, data); }
  addHierarchyItemAfter(row: number, data: Record<string, unknown>): void { this.editHierarchy('addAfter', row, data); }
  addHierarchyItemBefore(row: number, data: Record<string, unknown>): void { this.editHierarchy('addBefore', row, data); }
  addHierarchyItemBelow(row: number, data: Record<string, unknown>): void { this.editHierarchy('addBelow', row, data); }
  promoteHierarchyLevel(row: number): void { this.editHierarchy('promote', row); }
  demoteHierarchyLevel(row: number, withChildren = true): void { this.editHierarchy('demote', row, undefined, withChildren); }
  moveUp(row: number): void { this.editHierarchy('up', row); }
  moveDown(row: number): void { this.editHierarchy('down', row); }
  private editHierarchy(operation: string, row: number, data?: Record<string, unknown>, withChildren = true): void {
    // Trial gate (.probe/api-sweep-item4d/e/f.json): with no outline column in the bound
    // view, promote/demote leave the table untouched on the trial (same data in/out);
    // inserts and moves run regardless. With an outlineColumn anywhere in the view the
    // trial executes and matches the semantics implemented here.
    if ((operation === 'promote' || operation === 'demote') && !this._hasOutlineColumn()) return;
    this.view?.hierarchyEdit(operation, row, data, withChildren);
    this.refreshView();
  }
  private _hasOutlineColumn(): boolean {
    const view = this.view;
    if (!view) return false;
    if (view.hierarchyOutlineColumn()) return true;
    const columns = view.getColumn() as Record<string, unknown>[] | undefined;
    return !!columns?.some(column => !!column.outlineColumn);
  }
  collapseAllHierarchyLevels(): void {
    this.expandHierarchyLevel(0);
  }
  expandAllHierarchyLevels(): void {
    this.collapsedHierarchy.clear();
    this.updateHierarchyVisibility();
    this._invalidate();
  }
  expandHierarchyLevel(level: number): void {
    this.collapsedHierarchy.clear();
    this.hierarchyLevels.forEach((depth, row) => {
      const item = this.view?.hierarchyRow(row);
      if (item && depth >= Math.max(0, level)) this.collapsedHierarchy.add(item);
    });
    this.updateHierarchyVisibility();
    this._invalidate();
  }
  override getValue(row: number, col: number, area = 3, valueType = 0): unknown {
    if (area === 1 && this.freeHeader && row < this.freeHeader.getRowCount()) {
      return this.freeHeader.getValue(row, col);
    }
    if (!this.view) return super.getValue(row, col, area, valueType);
    const groupColumns = this.groupColumns();
    const groupColumn = groupColumns[col];
    if (groupColumn && (area === 1 || area === 3)) {
      if (area === 1) return groupColumn.caption;
      if (row >= this.view.visibleLength() || this.isGroupAncestorCollapsed(groupColumn.level, row)) return undefined;
      if (row > 0 && this.groupKey(groupColumn.level, row) === this.groupKey(groupColumn.level, row - 1)) return undefined;
      return this.view.getRowData(row)[groupColumn.field];
    }
    const column = this.view.getColumn(col - groupColumns.length) as Record<string, unknown> | undefined;
    if (area === 1) return column?.caption ?? column?.value ?? column?.name;
    if (area === 2) return row === this.view.visibleLength() ? "*" : "";
    if (area !== 3) return super.getValue(row, col, area, valueType);
    const field = column?.value ?? column?.name;
    if (this.isGroupAncestorCollapsed(this.groups.length, row)) return undefined;
    return typeof field === 'string' ? this.view.getRowData(row)[field] : undefined;
  }
  override getActualStyle(row: number, col: number, area = 3, sheetStyleOnly = false): Style {
    if (area === 1 && this.freeHeader && row < this.freeHeader.getRowCount()) {
      return this.freeHeader.getActualStyle(row, col, 3, sheetStyleOnly);
    }
    const style = super.getActualStyle(row, col, area, sheetStyleOnly);
    if (area === 1 && this.tableTheme !== TableThemes.light2) {
      const header = this.tableTheme._style('headerRowStyle', this._themePalette());
      if (header) Object.assign(style, header);
    }
    if (area === 3) {
      const explicit = [this.getDefaultStyle(area), this.getStyle(-1, col, area),
        this.getStyle(row, -1, area), this.getStyle(row, col, area)];
      if (!explicit.some(item => item && Object.keys(item).includes('vAlign'))) style.vAlign = 1;
      const hierarchy = this._hierarchyOutline(row, col);
      if (hierarchy) style.cellPadding = `0 0 0 ${hierarchy.offset + 18}`;
      if (col < this.groupColumns().length) {
        style.backColor = 'white';
        style.foreColor = '#305f9b';
        if (this._groupColumnHasOutline(col)) style.cellPadding = '0 0 0 26';
        return style;
      }
      if (this.isGroupAncestorCollapsed(this.groups.length, row)) {
        style.backColor = 'white';
        return style;
      }
      if (this.tableTheme === TableThemes.light2) {
        style.foreColor = '#305f9b';
        // Trial parity (probe .probe/t54 strips): parity striping covers the data rows AND the
        // trailing add-new row (expandGroup state: new row 2 paints #dce7f1 with blue borders),
        // rows below it stay plain white.
        if (row % 2 === 0 && row <= (this.view?.visibleLength() ?? 0)) style.backColor = '#dce7f0';
      } else {
        const whole = this.tableTheme?._style('wholeTableStyle', this._themePalette());
        const stripe = row % 2 === 0 && row <= (this.view?.visibleLength() ?? 0)
          ? this.tableTheme?._style('firstRowStripStyle', this._themePalette()) : undefined;
        if (whole) Object.assign(style, whole);
        if (stripe) Object.assign(style, stripe);
      }
      const column = this.view?.getColumn(col - this.groupColumns().length) as Record<string, unknown> | undefined;
      const field = column?.value ?? column?.name;
      if (typeof field === 'string') Object.assign(style, this.templateStyles.get(field));
    }
    return style;
  }
  override getText(row: number, col: number, area = 3): string {
    const value = this.getValue(row, col, area);
    return value == null ? '' : String(value);
  }
  override setValue(row: number, col: number, value: unknown, area = 3, ignoreRecalc = false): void {
    if (!this.view || area !== 3) return super.setValue(row, col, value, area, ignoreRecalc);
    const column = this.view.getColumn(col - this.groupColumns().length) as Record<string, unknown> | undefined;
    const field = column?.value ?? column?.name;
    if (typeof field === 'string' && !column?.readonly) {
      if (row === this.view.visibleLength()) this.view.insertItem(this.view.length(), {});
      this.view.updateItem(row, { [field]: convertSchemaValue(value, column ?? {}) });
      this.refreshView();
    }
  }
  setDefaultRowHeight(value: number, area = 3): void {
    this.setRowHeight(-1, value, area);
  }
  /**
   * Table-sheet values live in the bound data view, not the cell store, so the used
   * range follows the sheet dimensions; this is what lets the shared print paginator
   * paginate table sheets like the trial (TASK 49 item 3, probe
   * .probe/api-sweep-item3a.json: the trial's pageInfo splits bound rows/columns into
   * page rectangles and does NOT print the trailing add-new row - 31 rows render as
   * 29+1 or a single 30-row fit-wide page).
   */
  override getUsedRange(type?: number): Range | null {
    if (!this.view) return super.getUsedRange(type);
    const rows = this.getRowCount() - 1, columns = this.getColumnCount();
    return rows > 0 && columns > 0 ? new Range(0, 0, rows, columns) : null;
  }
  async addRow(data: Record<string, unknown>): Promise<void> {
    this.view?.insertItem(this.view.length(), data);
    const inserted = this.view?.getChanges().reverse().find(change => change.type === 'insert');
    if (inserted && inserted.index >= 0) this.view?.saveItem(inserted.index);
    this.refreshView();
  }
  async removeRow(row: number): Promise<void> { this.view?.removeItem(row); this.refreshView(); }
  async saveRow(row: number): Promise<void> { this.view?.saveItem(row); this.refreshView(); }
  resetRow(row: number): void { this.view?.resetItem(row); this.refreshView(); }
  hasRowState(type: number, row: number): boolean {
    if (!this.view) return false;
    const inserted = this.view.isInserted(row), updated = this.view.isUpdated(row);
    return ((type & 16) !== 0 && this.getActiveRowIndex() === row)
      || ((type & 32) !== 0 && this.getSelections().some(range => range.row === -1 || (row >= range.row && row < range.row + range.rowCount)))
      || ((type & 64) !== 0 && (inserted || updated))
      || ((type & 128) !== 0 && inserted) || ((type & 256) !== 0 && updated);
  }
  getChanges(): ReturnType<View['getChanges']> { return this.view?.getChanges() ?? []; }
  async submitChanges(): Promise<void> { await this.view?.submitChanges(); this.refreshView(); }
  async cancelChanges(): Promise<void> { await this.view?.cancelChanges(); this.refreshView(); }
  rowActionOptions(options?: RowAction[]): RowAction[] {
    if (options) { this.actions = options; this._invalidate(); }
    return this.actions;
  }
  _rowAction(row: number, index: number): { icon: string | number; size: number; command?: string } | undefined {
    const action = this.actions[index];
    if (!action || row < 0 || row >= (this.view?.visibleLength() ?? 0)) return undefined;
    // The composed built-in entry is internal state artwork, not a drawable icon slot.
    if (action.name === COMPOSED_ROW_ACTION.name && !action.iconSelector) return undefined;
    const selected = action.iconSelector?.(this.view?.getRowData(row), row, { sheet: this }) ?? 0;
    if (selected === false) return undefined;
    const icon = action.icons?.[typeof selected === 'number' ? selected : 0];
    if (icon === undefined) return undefined;
    const size = typeof action.iconSize === 'number' ? action.iconSize : action.iconSize?.width ?? 16;
    return { icon, size, command: action.command };
  }
  _executeRowAction(row: number, index: number): boolean {
    const action = this._rowAction(row, index);
    if (!action?.command) return false;
    const workbook = this.getParent() as Workbook | undefined;
    return workbook?.commandManager().execute({ cmd: action.command, sheetName: this.name(), row }) ?? false;
  }
  applyTableTheme(theme: TableTheme): void {
    if (theme) { this.tableTheme = theme; this._invalidate(); }
  }
  getTableTheme(): TableTheme { return this.tableTheme; }
  sort(sorts?: SortInfo[]): SortInfo[] {
    if (sorts) {
      const workbook = this.getParent() as Workbook | undefined;
      this.sorts = sorts.map(sort => ({ ...sort }));
      this.view?.sort(sorts.map(sort => {
        const custom = typeof sort.compare === 'string'
          ? workbook?.getCustomFunction(sort.compare) as { evaluate: (...args: unknown[]) => unknown } | undefined
          : undefined;
        const compare = custom ? (a: unknown, b: unknown, ascending: boolean) => Number(custom.evaluate(a, b, ascending))
          : typeof sort.compare === 'function' ? sort.compare : undefined;
        return { ...sort, compare };
      }));
      this.refreshView();
    }
    return this.sorts.map(sort => ({ ...sort }));
  }
  removeSort(): void { this.sort([]); }
  // TASK 97 TS-1: restore a serialized sort spec WITHOUT reordering the rows.
  // The trial does exactly this when a hierarchy view with an active filter is
  // reloaded from JSON: sort() reads the spec back, rowFilter serializes it,
  // but the display order is the natural hierarchy order (probe hier-probe3 I/J/M).
  _restoreSortSpec(sorts: SortInfo[]): void { this.sorts = sorts.map(sort => ({ ...sort })); }
  groupBy(groups?: { field: string; [key: string]: unknown }[]): { field: string; [key: string]: unknown }[] {
    if (groups) {
      this.groups = groups.map(group => ({ ...group }));
      this.collapsedGroups.clear();
      this.view?.groupBy(this.groups);
      this.refreshView();
      for (const listener of this.viewListeners) listener();
      return setModeResult;
    }
    return this.groups.map(group => ({ ...group }));
  }
  removeGroupBy(): void {
    this.groups = [];
    this.collapsedGroups.clear();
    this.view?.removeGroupBy();
    this.refreshView();
    for (const listener of this.viewListeners) listener();
  }
  expandGroup(field: string, expand: boolean): void {
    const level = this.groups.findIndex(group => group.field === field);
    if (level < 0 || !this.view) return;
    for (let row = 0; row < this.view.visibleLength(); row++) {
      const key = this.groupKey(level, row);
      if (expand) this.collapsedGroups.delete(key); else this.collapsedGroups.add(key);
    }
    this.updateGroupVisibility();
    this.updateHierarchyVisibility();
  }
  expandGroupItem(level: number, index: number, expand: boolean): void {
    if (!this.view || level < 0 || level >= this.groups.length || index < 0 || index >= this.view.visibleLength()) return;
    const key = this.groupKey(level, index);
    if (expand) this.collapsedGroups.delete(key); else this.collapsedGroups.add(key);
    this.updateGroupVisibility();
    this.updateHierarchyVisibility();
  }
  groupOutlinePosition(value?: number): number {
    if (value !== undefined) {
      this.outlinePosition = value; this.updateGroupHeaderWidth(); this._invalidate(); return setModeResult;
    }
    return this.outlinePosition;
  }
  detailColumnsVisible(value?: boolean): boolean {
    if (value !== undefined) { this.detailsVisible = value; this.refreshView(); return setModeResult; }
    return this.detailsVisible;
  }
  togglePinnedRows(indexes: number[]): number | undefined {
    // TASK 97 TS-1: hierarchy views make pinned rows inert in the trial; mirror
    // the no-op (undefined return, no frozen-rows change) — probe hier-probe2 F.
    const count = this.view?.togglePinnedRows(indexes);
    if (count === undefined) return undefined;
    this.frozenRowCount(count);
    this.refreshView();
    return count;
  }
  togglePinnedColumns(indexes: number[]): number {
    const count = this.view?.togglePinnedColumns(indexes.map(index => index - this.groupColumns().length)) ?? 0;
    this.frozenColumnCount(count);
    this.refreshView();
    return count;
  }
  filter(filters?: FilterInfo[]): FilterInfo[] {
    if (filters) {
      this.filters = filters.map(filter => ({ ...filter,
        ...(filter.values ? { values: filter.values.map(item => ({ ...item, type: item.type ?? 'value' })) } : {}),
        ...(filter.paths ? { paths: filter.paths.map(item => ({ ...item, type: item.type ?? 'value' })) } : {}) }));
      this.view?.setSheetFilters(this.filters.map(filter => {
        let previousLeaves: unknown[][] | undefined;
        let validPaths: unknown[][] = [];
        const matchesPath = (path: unknown[], leaves: unknown[][]): boolean => {
          if (leaves !== previousLeaves) {
            previousLeaves = leaves;
            validPaths = (filter.paths ?? []).map(item => item.path).filter(candidate => candidate.length === 0
              || leaves.some(leaf => leaf.length === candidate.length
                && leaf.every((part, index) => Object.is(part, candidate[index]))));
          }
          return validPaths.some(candidate => candidate.length === 0 || (candidate.length >= path.length
            && path.every((part, index) => Object.is(part, candidate[index]))));
        };
        return {
        field: filter.field,
        hierarchy: !!filter.paths,
        matches: (value: unknown, path: unknown[], leafPaths: unknown[][]) => filter.paths
          ? matchesPath(path, leafPaths)
          : filter.condition
          ? (typeof (filter.condition as { evaluate?: unknown }).evaluate === 'function'
            ? (filter.condition as { evaluate: (sheet: Worksheet, row: number, col: number, value: unknown) => boolean })
              .evaluate(this, 0, 0, value)
            : matchesPlainCondition(value, filter.condition as Record<string, unknown>))
          : !!filter.values?.some(item => item.type === 'blank' ? value == null || value === ''
            : item.type === 'date' && value instanceof Date ? value.getTime() === new Date(String(item.value)).getTime()
              : Object.is(item.value, value)),
        };
      }));
      this.refreshView();
    }
    return this.filters;
  }
  removeFilter(): void { this.filter([]); }
}

Object.defineProperty(TableSheet.prototype, 'options', { value: undefined, writable: true, configurable: true });
Object.defineProperty(TableSheet.prototype, 'currentTheme', {
  value: Worksheet.prototype.currentTheme, writable: true, configurable: true,
});
/**
 * The trial's TableSheet printInfo ignores print-area range assignment (probe
 * .probe/api-sweep-item3b.json: rowStart(3)/rowEnd(12)/columnStart(1)/columnEnd(2)
 * echo -1 and pagination keeps the full bound range), while the worksheet variant
 * persists them as the Print_Area defined name. Our TableSheet mirrors the trial.
 */
const worksheetPrintInfo = Worksheet.prototype.printInfo as (this: TableSheet, value?: unknown) => unknown;
function tableSheetPrintInfo(this: TableSheet, value?: unknown): unknown {
  const info = worksheetPrintInfo.call(this, value);
  if (info && typeof info === 'object' && typeof (info as Record<string, unknown>).fitPagesWide === 'function'
    && !(info as Record<string, unknown>).__tableSheetPrintArea) {
    (info as Record<string, unknown>).__tableSheetPrintArea = true;
    for (const key of ['rowStart', 'rowEnd', 'columnStart', 'columnEnd'])
      (info as Record<string, (...args: unknown[]) => unknown>)[key] = (arg?: unknown) => (arg === undefined ? -1 : info);
  }
  return info;
}
Object.defineProperty(TableSheet.prototype, 'printInfo', {
  value: tableSheetPrintInfo, writable: true, configurable: true,
});
