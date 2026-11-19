/**
 * The worksheet model: sparse cell/area storage, dimensions, styles, values,
 * formulas, selection, events, dirty tracking and serialization. Split out of
 * `model.ts` unchanged; `workbook.ts` owns the Workbook class. Method groups
 * with non-trivial bodies live in the `sheet-*.ts` helper modules, which take
 * the sheet as their first argument.
 */
import { CellBindingSource } from './features/binding.js';
import { FloatingObjectCollection } from './features/floating-objects.js';
import { ShapeCollection } from './features/shapes.js';
import { ChartCollection } from './features/charts.js';
import { DataChartManager } from './datacharts/manager.js';
import { SlicerCollection } from './features/slicers/index.js';
import { PivotTableManager } from './pivot/manager.js';
import { Sparkline, SparklineGroup, SparklineSetting, getSparkline, setSparkline, removeSparkline, groupSparkline, ungroupSparkline } from './features/sparklines.js';

import { WorkbookRenderer, type Rect } from './rendering.js';
import { GC } from './generated/enums.js';

import { AxisLayout, CellStore, DirtyGrid } from './structures.js';
import { clone, NameInfo, Range, Style } from './primitives.js';
import { autoMerge as autoMergeImpl, type AutoMergeInfo } from './auto-merge.js';
import { fillAuto as fillAutoImpl } from './fill-auto.js';
import { CellRange } from './range.js';
import { applyNamedCellTemplateAddress } from './named-cell-templates.js';
import type { CellsInfo, FormulaInfo } from './calc/engine-introspect.js';
import { SearchCondition, SearchResult, searchSheet } from './search.js';
import { EventHub, type EventHandler, type EventInfo } from './events.js';
import { GeneralFormatter } from './formatter.js';
import { CommentManager } from './comments.js';
import { ThreadedCommentManager } from './threaded-comments.js';
import { TableManager } from './features/tables.js';
import { DataRangeManager } from './features/data-ranges.js';
import { OutlineColumn } from './features/outline-column.js';
import type { ScenarioManager } from './features/scenarios.js';
import { ConditionalFormats } from './features/conditional-formatting.js';
import { CellStateManager } from './features/cell-state.js';
import { DefaultDataValidator } from './features/data-validation.js';
import { Outline } from './features/outlines.js';
import { defaultCellType } from './features/cell-types.js';
import { RowFilterBase, sortRange as sortRangeImpl } from './features/filters.js';
import { usedRange } from './features/used-range.js';
import { getCsv as getCsvImpl, setCsv as setCsvImpl } from './csv.js';
import {
  editorStatus as editorStatusImpl,
  getDeletedRows,
  getDirtyRows,
  getDataColumnName as getDataColumnNameImpl,
  getDataItem as getDataItemImpl,
  getInsertRows,
  getSortState as getSortStateImpl,
  hitTest as hitTestImpl,
  isEditing as isEditingImpl,
  isSelected as isSelectedImpl,
  noteSortRange,
  nextSheetToken,
  reset as resetSheet,
  setEditorStatus as setEditorStatusImpl,
  RowIndexList,
  type HitTestInformation,
  type SortState,
} from './sheet-state.js';

import { PrintInfo } from './print.js';

import { Theme, type ThemeValue } from './themes.js';
import type { ICalcEngine } from './calc.js';
import { type JsonRecord } from './serialization.js';
import worksheetDefaults from './worksheet-defaults.json';
import { type AreaData, type CellData, type DirtyCell, type LiveWorkbookOptions, type SerializationOptions, type WorksheetOptions, Batching, coordinate } from './sheet-common.js';
import { worksheetFromJSON, worksheetToJSON } from './sheet-serialization.js';
import { _arrayFormula, _attach, _autoExpandTables, area as areaImpl, _defaultSheetSettings, _defaultsProxy, _fastValue, _flushPaint, _getFormula, _getValue, _invalidatingProxy, _isEditableCell, _isFreshHyperlink, _isSelectableCell, _onInvalidate, _resumeWorkbookCalc, _setCalculatedValue, _setCalcEngine, _setValue, _setFormulaText, _tag, _translateFormula, _usedRange, _viewCellStore, a1Cell, addCustomFunction, addCustomName, addNamedStyle, axisChanged, axisInfo, bindColumns, cell, changed, clearCustomFunctions, clearCustomNames, clearPendingChanges, ensure, flushCalc, markDirty, prune, getArray, getCell, getCustomFunction, getCustomName, getDependents, getDirtyCells, getFormulaInformation, getHyperlink, getNamedStyle, getNamedStyles, getPrecedents, getRange, getSpan, getSpans, getText, hasPassword, hasPendingChanges, invalidateLayout, isDirty, isDirtySuspended, isPaintSuspended, loadBinding, name, getParent, protect, queueCalc, recalcAll, removeCustomFunction, removeCustomName, resumeCalcService, resumePaint, removeNamedStyle, repaint, rowFilter, setArray, setArrayFormula, setDataSource, setFormula, setHyperlink, setText, resumeDirty, suspendCalcService, suspendDirty, suspendPaint, unprotect } from './sheet-cells.js';
import { _setDataValidator, _setStyleProperty, _setValidatorRecord, _tableStyleAt, getActualStyle, getAltText, getBindingPath, getCellType, getDataValidator, getDefaultStyle, getDefaultValue, getFormatter, getStyle, getStyleName as getStyleNameImpl, getTag, isValid, setAltText, setCellType, setDefaultStyle, setDefaultValue, setFormatter, setStyle, setStyleName, setTag } from './sheet-styles.js';
import { addSpan, autoFitColumn, autoFitRow, axisMetadata, frozenColumnCount, frozenRowCount, frozenTrailingColumnCount, frozenTrailingRowCount, getCellRect, measureContext, removeSpan, setAxisMetadata, setDimension, _columnCount, _outlineGutters, _rowCount, _setColumnVisible, _setRowVisible } from './sheet-layout.js';
import { _backgroundImageJSON, _clearPrintAreaName, _manualPageBreaks, _pageBreakIndices, _setPrintAreaRange, _themeFonts, _themePalette, _themeValue, backgroundImage, currentTheme, getBackgroundImageInfo, getColumnPageBreak, getRowPageBreak, isPrintLineVisible, printInfo, setColumnPageBreak, setRowPageBreak, showColumnOutline, showRowOutline, tabColor, visible, zoom } from './sheet-print.js';
import { _clipboardMode, _clipboardSource, _setUserSelections, addSelection, clearSelection, getActiveColumnIndex, getActiveRowIndex, getSelections, setActiveCell, setSelection, updateSelections } from './sheet-selection.js';
import { clearRange, resizeAxis, shiftAxis, shiftAxisBand, snapshotRanges, transferRange } from './sheet-shifts.js';

const { SheetArea, StorageType, CopyToOptions, ValueType, EditorStatus } = GC.Spread.Sheets;
const VIEW = SheetArea.viewport;

/**
 * The structural surface of `Workbook` that `Worksheet` uses through its
 * parent link. Declared here (instead of importing `workbook.ts`) so the
 * dependency between the two classes stays one-directional: `workbook.ts`
 * imports `Worksheet`, `worksheet.ts` imports nothing from `workbook.ts`.
 * `Workbook` satisfies this interface structurally (checked where it passes
 * itself to `sheet._attach(this)`).
 */
export interface WorkbookHost {
  options: LiveWorkbookOptions;
  /** Workbook display name (used by the print pipeline for `&D`-style fields). */
  name: string;
  /** Attached sheets in tab order (read-only view; the workbook owns the array). */
  readonly sheets: readonly Worksheet[];
  _renderer(): WorkbookRenderer | undefined;
  _calcEngine(): ICalcEngine | undefined;
  getActiveSheet(): Worksheet;
  getSheetFromName(name: string): Worksheet;
  getSheetIndex(name: string): number;
  getNamedStyle(name: string): Style;
  /** True while the scenario manager is capturing value writes (hot-path flag). */
  _scenariosCapturing: boolean;
  invalidateLayout(): void;
  repaint(): void;
  isPaintSuspended(): boolean;
  _isCalcSuspended(): boolean;
  _emit(type: string, info: EventInfo): void;
  _hasEvent(type: string): boolean;
  _isEventSuspended(): boolean;
  _isUndoing(): boolean;
  /** Workbook scenarios (scenario capture hooks on the value path). */
  readonly scenarioManager: ScenarioManager;
  /** Collaboration recorder hook (`Workbook.collaboration`, TASK 44 item 4). */
  collaboration?: { _recordValue(sheetName: string, row: number, col: number, value: unknown): void } | undefined;
  destroy(): void;
}

export class Worksheet {
  readonly floatingObjects = new FloatingObjectCollection(this);
  readonly pictures = new FloatingObjectCollection(this, '1');
  readonly shapes = new ShapeCollection(this);
  readonly charts = new ChartCollection(this);
  readonly dataCharts = new DataChartManager(this);
  /** The slicer collection (`worksheet.slicers`): table slicers filter the bound table. */
  readonly slicers = new SlicerCollection(this);
  /** The pivot table manager (`worksheet.pivotTables`), see `GC.Spread.Pivot`. */
  readonly pivotTables = new PivotTableManager(this);
  sparklineCells = new Map<string, Sparkline>();
  getSparkline(row: number, col: number): Sparkline | null { return getSparkline(this, row, col); }
  setSparkline(row: number, col: number, dataRange: Range | string, orientation: number, type: number, setting = new SparklineSetting(), dateRange?: Range | string, dateOrientation?: number): Sparkline {
    return setSparkline(this, row, col, dataRange, orientation, type, setting, dateRange, dateOrientation);
  }
  removeSparkline(row: number, col: number): void { removeSparkline(this, row, col); }
  groupSparkline(sparklines: Sparkline[]): SparklineGroup { return groupSparkline(this, sparklines); }
  ungroupSparkline(group: SparklineGroup): void { ungroupSparkline(this, group); }

  autoGenerateColumns = true;
  readonly options: WorksheetOptions;
  readonly defaults: {
    rowHeight: number;
    colWidth: number;
    colHeaderRowHeight: number;
    rowHeaderColWidth: number;
  };
  readonly comments = new CommentManager(this);
  readonly threadedComments = new ThreadedCommentManager(this);
  /** Request a repaint (used by sheet-scoped managers). */
  _invalidate(): void {
    this.batch.invalidate();
  }
  readonly tables = new TableManager(this);
  /** Data ranges (`dataRanges.add/all/clear/get/remove` + provider value layer). */
  readonly dataRanges = new DataRangeManager(this);
  /** Hot-path flag mirroring `dataRanges` activity (read by the value read/write path). */
  _dataRangesActive = false;
  /** Outline column (`outlineColumn.options/getCheckStatus/setCheckStatus/getCollapsed/setCollapsed/refresh`). */
  readonly outlineColumn = new OutlineColumn(this);
  readonly conditionalFormats = new ConditionalFormats(this);
  readonly cellStates = new CellStateManager(this);
  readonly rowOutlines = new Outline();
  readonly columnOutlines = new Outline();
  validationRecords: { ranges: Range[]; validator: DefaultDataValidator }[] = [];
  /** TASK 46: worksheet.autoMerge registrations (serialized as autoMergeRangeInfos). */
  _autoMerges: AutoMergeInfo[] = [];
  rowFilterValue: RowFilterBase | null = null;
  /** Workbook-scoped OOXML colours, supplied by the optional IO package. */
  _ioThemeColors?: Record<string, string>;
  sheetName: string;
  parent?: WorkbookHost;
  /** @internal Collaboration batch-recording guard, toggled by `Workbook.collaboration.startBatchOp/endBatchOp`. */
  _collabRecord = false;
  areas = new Map<number, AreaData>();
  events = new EventHub(this);
  batch = new Batching(
    () => this.parent?.isPaintSuspended() ?? false,
    (layout) => {
      if (layout) this.parent?.invalidateLayout();
      else this.parent?.repaint();
    },
  );
  rows = new AxisLayout(200, 20);
  cols = new AxisLayout(20, 62);
  headerRows = new AxisLayout(1, 20);
  headerCols = new AxisLayout(1, 40);
  dimensions = { rowHeight: 20, colWidth: 62, colHeaderRowHeight: 20, rowHeaderColWidth: 40 };
  selections = [new Range(0, 0, 1, 1)];
  activeRow = 0;
  activeCol = 0;
  policy = 2;
  unit = 0;
  source: Record<string, unknown>[] | null = null;
  cellSource?: CellBindingSource;
  hasBoundValues = false;
  _enableBindings(): void { this.hasBoundValues = true; }
  _hasBindingValues(): boolean { return this.hasBoundValues; }
  boundColumns = new Map<number, { name: string; displayName?: string; size?: number }>();
  /** Rows added since the last `clearPendingChanges` (`getInsertRows`). */
  readonly insertedRows = new RowIndexList();
  /** Rows removed since the last `clearPendingChanges` (`getDeletedRows`). */
  readonly deletedRows = new RowIndexList();
  /** `undefined` on a fresh sheet, `null` after `reset`, the last sort otherwise. */
  sortStateValue: SortState | null | undefined;
  editorStatusValue = EditorStatus.ready;
  settings: JsonRecord = _defaultSheetSettings();
  namedStyles = new Map<string, Style>();
  names = new Map<string, NameInfo>();
  dirty = new DirtyGrid();
  dirtyDepth = 0;
  /** Trial-compatible internal identifiers: `__ID__` is the sheet's token, `_id` its monotonic number. */
  private readonly _sheetIdentity = nextSheetToken();
  readonly __ID__: string = this._sheetIdentity.token;
  readonly _id: number = this._sheetIdentity.id;
  calcEngine?: ICalcEngine;
  calcQueue = new Map<
    string,
    {
      row: number;
      col: number;
      formula?: string | null;
      value?: unknown;
      kind: 'formula' | 'value';
      /** AST parsed by the public `setFormula` validation, carried to the flush. */
      ast?: import('./calc/parser.js').AstNode;
      r1c1?: boolean;
      /** The cell had no stored formula when the change was queued. */
      fresh?: boolean;
    }
  >();
  extraJSON: JsonRecord = {};
  /** True while protection was armed with a real password (session or JSON). */
  _passwordRequired = false;
  _printInfo?: PrintInfo;
  _printInfoJSON?: Record<string, unknown>;
  _printLineVisible = false;
  _backgroundImage: { src: string | null; layout?: 'repeat' | 'none'; paintOrder?: 'normal' | 'over-content' } = { src: null };

  constructor(name = 'Sheet1') {
    this.sheetName = name;
    this.options = _invalidatingProxy(this, clone(worksheetDefaults));
    this.options.gridline = _invalidatingProxy(this, this.options.gridline);
    this.rowOutlines._attach(this, 'row');
    this.columnOutlines._attach(this, 'col');
    this.defaults = _defaultsProxy(this, this.dimensions);
    // The trial keeps an explicit per-sheet selection flag: a sheet that belongs
    // to no workbook is never selected (`isSelected()` and `toJSON().isSelected`
    // both answer `false`), and the workbook writes `true` into the active sheet
    // whenever the active sheet changes.
    this.settings.isSelected = false;
  }
  _attach(parent?: WorkbookHost): void {
    _attach(this, parent);
  }
  getParent(): WorkbookHost {
    return getParent(this);
  }
  name(): string;
  name(value: string): this;
  name(value?: string): string | this {
    return name(this, value) as string | this;
  }
  viewCellStore?: CellStore<CellData>;
  viewAreaCache?: AreaData;
  _fastValue(row: number, col: number): unknown {
    return _fastValue(this, row, col);
  }
  _viewCellStore(): CellStore<CellData> | undefined {
    return _viewCellStore(this);
  }
  area(area = VIEW): AreaData {
    return areaImpl(this, area);
  }
  cell(row: number, col: number, area = VIEW): CellData | undefined {
    return cell(this, row, col, area);
  }
  ensure(row: number, col: number, area = VIEW): CellData {
    return ensure(this, row, col, area);
  }
  prune(row: number, col: number, area = VIEW): void {
    prune(this, row, col, area);
  }
  /** Legacy A1-string overloads: getValue('B2') / setValue('B2', v) work at runtime like the official build. */
  private a1Cell(row: unknown, col: unknown, value: unknown): [number, number, unknown] {
    return a1Cell(this, row, col, value);
  }
  getValue(row: number, col: number, area = VIEW, valueType = ValueType.normal): unknown {
    return _getValue(this, row, col, area, valueType);
  }
  setValue(row: number, col: number, value: unknown, area = VIEW, ignoreRecalc = false): void {
    if (this._collabRecord) this.parent?.collaboration?._recordValue(this.name(), row, col, value);
    _setValue(this, row, col, value, area, ignoreRecalc);
  }
  getText(row: number, col: number, area = VIEW): string {
    return getText(this, row, col, area);
  }
  setText(row: number, col: number, value: string, area = VIEW): void {
    setText(this, row, col, value, area);
  }
  getFormula(row: number, col: number, area = VIEW): string | null {
    return _getFormula(this, row, col, area);
  }
  setFormula(row: number, col: number, value: string | null, area = VIEW): void {
    if (this._collabRecord) this.parent?.collaboration?._recordValue(this.name(), row, col, value);
    setFormula(this, row, col, value, area);
  }
  _setCalcEngine(engine?: ICalcEngine): void {
    _setCalcEngine(this, engine);
  }
  /** Updates stored formula text without recalculating (used by ref transforms). */
  _translateFormula(formula: string, rows: number, columns: number): string {
    return _translateFormula(this, formula, rows, columns);
  }
  _setFormulaText(row: number, col: number, formula: string): void {
    _setFormulaText(this, row, col, formula);
  }
  /** Marks a range as a legacy (CSE) array formula anchored at the cell. */
  setArrayFormula(
    row: number,
    col: number,
    rowCount: number,
    colCount: number,
    value: string,
    area = VIEW,
  ): void {
    setArrayFormula(this, row, col, rowCount, colCount, value, area);
  }
  _arrayFormula(row: number, col: number): { rowCount: number; colCount: number } | undefined {
    return _arrayFormula(this, row, col);
  }
  _setCalculatedValue(row: number, col: number, value: unknown, area = VIEW): void {
    _setCalculatedValue(this, row, col, value, area);
  }
  queueCalc(change: {
    kind: 'formula' | 'value';
    row: number;
    col: number;
    formula?: string | null;
    value?: unknown;
    /** AST parsed by the public `setFormula` validation, carried to the flush. */
    ast?: import('./calc/parser.js').AstNode;
    r1c1?: boolean;
    /** The cell had no stored formula when the change was queued. */
    fresh?: boolean;
  }): void {
    queueCalc(this, change);
  }
  flushCalc(all = false): void {
    flushCalc(this, all);
  }
  getDataSource(): Record<string, unknown>[] | CellBindingSource | null { return this.cellSource ?? this.source; }
  setDataSource(data: Record<string, unknown>[] | CellBindingSource | null, reset = true): void {
    setDataSource(this, data, reset);
  }
  bindColumn(index: number, column: string | { name: string; displayName?: string; size?: number }): void {
    this.boundColumns.set(index, typeof column === 'string' ? { name: column } : column); this.loadBinding();
  }
  bindColumns(columns: { name: string; displayName?: string; size?: number }[]): void {
    bindColumns(this, columns);
  }
  loadBinding(): void {
    loadBinding(this);
  }
  getArray(row: number, col: number, rowCount: number, colCount: number, getFormula = false): unknown[][] {
    return getArray(this, row, col, rowCount, colCount, getFormula);
  }
  setArray(row: number, col: number, array: unknown[][], setFormula = false): void {
    setArray(this, row, col, array, setFormula);
  }
  getCell(row: number, col: number, area = VIEW): CellRange {
    return getCell(this, row, col, area);
  }
  getRange(row: number, col: number, rowCount?: number, colCount?: number, area?: number): CellRange;
  getRange(address: string, area?: number): CellRange;
  getRange(row: number | string, col = 0, rowCount = 1, colCount = 1, area = VIEW): CellRange {
    return getRange(this, row, col, rowCount, colCount, area);
  }
  getStyle(row: number, col: number, area = VIEW): Style | null {
    return getStyle(this, row, col, area);
  }
  setStyle(row: number, col: number, style: Style | null, area = VIEW): void {
    setStyle(this, row, col, style, area);
  }
  getDefaultStyle(area = VIEW): Style {
    return getDefaultStyle(this, area);
  }
  setDefaultStyle(style: Style, area = VIEW): void {
    setDefaultStyle(this, style, area);
  }
  getActualStyle(row: number, col: number, area = VIEW, _sheetStyleOnly = false): Style {
    return getActualStyle(this, row, col, area, _sheetStyleOnly);
  }
  _tableStyleAt(row: number, col: number): Style | null {
    return _tableStyleAt(this, row, col);
  }
  _tableAt(row: number, col: number) {
    return this.tables.find(row, col);
  }
  _tablesChanged(): void {
    (this.calcEngine as { tablesChanged?: () => void } | undefined)?.tablesChanged?.();
    this.slicers._refreshForTables();
  }
  setStyleName(row: number, col: number, name: string, area = VIEW): void {
    setStyleName(this, row, col, name, area);
  }
  /**
   * Applies a registered named cell template to an area given as an A1 address
   * (`A1:C3`, `5:6`, `A:A`), a table structured reference (`Table1[[#Data]]`, ...)
   * or an array of those. Unknown template names and unparsable addresses do nothing.
   */
  applyNamedCellTemplate(name: string, ranges: unknown): void {
    applyNamedCellTemplateAddress(this, name, ranges);
  }
  /**
   * Registers an auto-merge request (TASK 46: trial records the request instead of creating
   * spans; returns undefined like the trial). Direction none cancels intersecting entries;
   * re-registering an overlapping range throws.
   */
  autoMerge(range: Range, direction?: number, mode?: number, sheetArea?: number, selectionMode?: number): void {
    autoMergeImpl(this, range, direction, mode, sheetArea, selectionMode);
  }
  /** Pattern fill over `wholeRange` seeded by `startRange` (TASK 46, trial-verified rules). */
  fillAuto(startRange: Range, wholeRange: Range, options: { fillType?: number; series?: number; direction?: number }): void {
    fillAutoImpl(this, startRange, wholeRange, options);
  }
  getStyleName(row: number, col: number, area = VIEW): string | null | undefined {
    return getStyleNameImpl(this, row, col, area);
  }
  _setStyleProperty(row: number, col: number, property: string, value: unknown, area = VIEW): void {
    _setStyleProperty(this, row, col, property, value, area);
  }
  getFormatter(row: number, col: number, area = VIEW): unknown {
    return getFormatter(this, row, col, area);
  }
  setFormatter(row: number, col: number, value: string | GeneralFormatter, area = VIEW): void {
    setFormatter(this, row, col, value, area);
  }
  cachedDefaultCellType?: ReturnType<typeof defaultCellType>;
  getCellType(row: number, col: number, area = VIEW): unknown {
    return getCellType(this, row, col, area);
  }
  setCellType(row: number, col: number, value: unknown, area = VIEW): void {
    setCellType(this, row, col, value, area);
  }
  getDataValidator(row: number, col: number, area = VIEW): unknown {
    return getDataValidator(this, row, col, area);
  }
  setDataValidator(row: number, col: number, value: unknown, area?: number): void;
  setDataValidator(
    row: number,
    col: number,
    rowCount: number,
    colCount: number,
    value: unknown,
    area?: number,
  ): void;
  setDataValidator(
    row: number,
    col: number,
    third: unknown,
    fourth = VIEW,
    fifth?: unknown,
    sixth = VIEW,
  ): void {
    _setDataValidator(this, arguments.length >= 5, row, col, third, fourth, fifth, sixth);
  }
  _setValidatorRecord(range: Range, validator: DefaultDataValidator | null): void {
    _setValidatorRecord(this, range, validator);
  }
  _removeValidatorRanges(range: Range): void {
    this._setValidatorRecord(range, null);
  }
  isValid(row: number, column: number, value: unknown): boolean {
    return isValid(this, row, column, value);
  }
  getTag(row: number, col: number, area = VIEW): unknown {
    return getTag(this, row, col, area);
  }
  setTag(row: number, col: number, value: unknown, area = VIEW): void {
    setTag(this, row, col, value, area);
  }
  tag(): unknown;
  tag(value: unknown): this;
  tag(value?: unknown): unknown {
    return _tag(this, arguments.length, value) as unknown;
  }
  getDefaultValue(row: number, col: number): unknown {
    return getDefaultValue(this, row, col);
  }
  setDefaultValue(row: number, col: number, value: unknown): void {
    setDefaultValue(this, row, col, value);
  }
  getBindingPath(row: number, col: number): string {
    return getBindingPath(this, row, col);
  }
  setBindingPath(row: number, col: number, value: string): this {
    this.ensure(row, col).bindingPath = value;
    return this;
  }
  getAltText(row: number, col: number, area = VIEW): unknown {
    return getAltText(this, row, col, area);
  }
  setAltText(row: number, col: number, value: string, area = VIEW): void {
    setAltText(this, row, col, value, area);
  }
  _rowLayout(area = VIEW): AxisLayout {
    return area === SheetArea.colHeader ? this.headerRows : this.rows;
  }
  _columnLayout(area = VIEW): AxisLayout {
    return area === SheetArea.rowHeader ? this.headerCols : this.cols;
  }
  getRowCount(area = VIEW): number {
    return area === SheetArea.corner ? 0 : this._rowLayout(area).count;
  }
  getColumnCount(area = VIEW): number {
    return area === SheetArea.corner ? 0 : this._columnLayout(area).count;
  }
  rowCount(): number;
  rowCount(value: number, area?: number): this;
  rowCount(value?: number, area = VIEW): number | this {
    return _rowCount(this, value, area) as number | this;
  }
  columnCount(): number;
  columnCount(value: number, area?: number): this;
  columnCount(value?: number, area = VIEW): number | this {
    return _columnCount(this, value, area) as number | this;
  }
  setRowCount(value: number, area = VIEW, guardContent?: number): void {
    this.resize('row', value, area, guardContent);
  }
  setColumnCount(value: number, area = VIEW, guardContent?: number): void {
    this.resize('col', value, area, guardContent);
  }
  resize(axis: 'row' | 'col', value: number, area: number, guardContent?: number): void {
    resizeAxis(this, axis, value, area, guardContent);
  }
  getRowHeight(row: number, area = VIEW, getDynamicSize = false): number | undefined {
    coordinate(row);
    return getDynamicSize ? undefined : this._rowLayout(area).getSize(row);
  }
  setRowHeight(row: number, value: number | string, area = VIEW): void {
    this.setDimension('row', row, value, area);
  }
  /**
   * The height a row without an explicit `setRowHeight` gets (trial runtime member, exercised by
   * plain worksheets as 20 and by TableSheet/GanttSheet as 30 — probe .probe/t54/probe-t54-gantt-grid.json).
   */
  getDefaultRowHeight(): number { return this.defaults.rowHeight; }
  getColumnWidth(col: number, area = VIEW, getDynamicSize = false): number | undefined {
    coordinate(col);
    return getDynamicSize ? undefined : this._columnLayout(area).getSize(col);
  }
  setColumnWidth(col: number, value: number | string, area = VIEW): void {
    this.setDimension('col', col, value, area);
  }
  setDimension(axis: 'row' | 'col', index: number, value: number | string, area: number): void {
    setDimension(this, axis, index, value, area);
  }
  getRowVisible(row: number, area = VIEW): boolean {
    return this._rowLayout(area).isVisible(row);
  }
  setRowVisible(row: number, value: boolean, area = VIEW): void {
    _setRowVisible(this, row, value, area);
  }
  getColumnVisible(col: number, area = VIEW): boolean {
    return this._columnLayout(area).isVisible(col);
  }
  setColumnVisible(col: number, value: boolean, area = VIEW): void {
    _setColumnVisible(this, col, value, area);
  }
  getRowResizable(row: number, area = VIEW): boolean {
    return this.axisMetadata('row', area).get(row)?.resizable !== false;
  }
  setRowResizable(row: number, value: boolean, area = VIEW): void {
    this.setAxisMetadata('row', row, area, 'resizable', value);
  }
  getColumnResizable(col: number, area = VIEW): boolean {
    return this.axisMetadata('col', area).get(col)?.resizable !== false;
  }
  setColumnResizable(col: number, value: boolean, area = VIEW): void {
    this.setAxisMetadata('col', col, area, 'resizable', value);
  }
  metadata = new Map<AxisLayout, Map<number, JsonRecord>>();
  axisMetadata(axis: 'row' | 'col', area: number): Map<number, JsonRecord> {
    return axisMetadata(this, axis, area);
  }
  setAxisMetadata(
    axis: 'row' | 'col',
    index: number,
    area: number,
    property: string,
    value: unknown,
  ): void {
    setAxisMetadata(this, axis, index, area, property, value);
  }
  addRows(row: number, count: number, area = VIEW): void {
    this.shift('row', row, count, area, false);
  }
  /**
   * Internal (Designer table commands): insert/remove whole-row cell shifts limited to a column band.
   * Only cells whose column lies in [crossStart..crossEnd] move; row metadata (heights, visibility,
   * tags) and cells outside the band keep their addresses. Formula references that intersect the
   * shifted band adjust exactly like `addRows`/`deleteRows` would (references into a removed band
   * become `#REF!`). The row/column counts do not change.
   */
  _shiftRowsInColumns(row: number, count: number, colStart: number, colEnd: number, remove: boolean): void {
    this.shiftBand('row', row, count, colStart, colEnd, remove);
  }
  /** Column-band mirror of `_shiftRowsInColumns`. */
  _shiftColumnsInRows(col: number, count: number, rowStart: number, rowEnd: number, remove: boolean): void {
    this.shiftBand('col', col, count, rowStart, rowEnd, remove);
  }
  shiftBand(
    axis: 'row' | 'col',
    index: number,
    amount: number,
    crossStart: number,
    crossEnd: number,
    remove: boolean,
  ): void {
    shiftAxisBand(this, axis, index, amount, crossStart, crossEnd, remove);
  }
  deleteRows(row: number, count: number, area = VIEW): void {
    this.shift('row', row, count, area, true);
  }
  addColumns(col: number, count: number, area = VIEW): void {
    this.shift('col', col, count, area, false);
  }
  deleteColumns(col: number, count: number, area = VIEW): void {
    this.shift('col', col, count, area, true);
  }
  shift(
    axis: 'row' | 'col',
    index: number,
    amount: number,
    area: number,
    remove: boolean,
    emit = true,
    trackChanges = true,
  ): void {
    shiftAxis(this, axis, index, amount, area, remove, emit, trackChanges);
  }
  addSpan(row: number, col: number, rowCount: number, colCount: number, area = VIEW): void {
    addSpan(this, row, col, rowCount, colCount, area);
  }
  addSpans(spans: Range[], area = VIEW): void {
    for (const span of spans) this.addSpan(span.row, span.col, span.rowCount, span.colCount, area);
  }
  removeSpan(row: number, col: number, area = VIEW): void {
    removeSpan(this, row, col, area);
  }
  getSpan(row: number, col: number, area = VIEW): Range | null {
    return getSpan(this, row, col, area);
  }
  getSpans(range?: Range, area = VIEW): Range[] {
    return getSpans(this, range, area);
  }
  frozenRowCount(): number;
  frozenRowCount(value: number, topRow?: number): void;
  frozenRowCount(value?: number, topRow = 0): number | void {
    return frozenRowCount(this, value, topRow);
  }
  frozenColumnCount(): number;
  frozenColumnCount(value: number, leftCol?: number): void;
  frozenColumnCount(value?: number, leftCol = 0): number | void {
    return frozenColumnCount(this, value, leftCol);
  }
  frozenTrailingRowCount(): number;
  frozenTrailingRowCount(value: number, stickToEdge?: boolean): void;
  frozenTrailingRowCount(value?: number, stickToEdge?: boolean): number | void {
    return frozenTrailingRowCount(this, value, stickToEdge);
  }
  frozenTrailingColumnCount(): number;
  frozenTrailingColumnCount(value: number, stickToEdge?: boolean): void;
  frozenTrailingColumnCount(value?: number, stickToEdge?: boolean): number | void {
    return frozenTrailingColumnCount(this, value, stickToEdge);
  }
  showRowOutline(): boolean;
  showRowOutline(value: boolean): this;
  showRowOutline(value?: boolean): boolean | this {
    return showRowOutline(this, value) as boolean | this;
  }
  showColumnOutline(): boolean;
  showColumnOutline(value: boolean): this;
  showColumnOutline(value?: boolean): boolean | this {
    return showColumnOutline(this, value) as boolean | this;
  }
  visible(): number;
  visible(value: number | boolean): this;
  visible(value?: number | boolean): number | this {
    return visible(this, value) as number | this;
  }
  zoom(): number;
  zoom(value: number): this;
  zoom(value?: number): number | this {
    return zoom(this, value) as number | this;
  }
  tabColor(): string | undefined;
  tabColor(value: string): this;
  tabColor(value?: string): string | undefined | this {
    return tabColor(this, value) as string | undefined | this;
  }
  /**
   * Gets or sets the workbook theme of this sheet. The getter returns a
   * `Theme` instance (the shared built-in one for a theme name); the setter
   * accepts a built-in name, a `Theme` or a serialised theme record, which is
   * what `sheet.toJSON().theme` stores.
   */
  currentTheme(): Theme;
  currentTheme(value: string | Theme | Record<string, unknown>): this;
  currentTheme(value?: string | Theme | Record<string, unknown>): Theme | this {
    return currentTheme(this, value) as Theme | this;
  }
  /** @internal The stored theme value: a built-in name or a custom record. */
  _themeValue(): ThemeValue {
    return _themeValue(this);
  }
  /** @internal Resolved theme fonts: `[heading, body]`, Calibri fallback. */
  _themeFonts(): [string, string] {
    return _themeFonts(this);
  }
  /** @internal Theme colours as a `resolveColor` palette (lower-case names). */
  _themePalette(): Record<string, string> {
    return _themePalette(this);
  }
  /** Gets or sets the printing options bound to this sheet. */
  printInfo(): PrintInfo;
  printInfo(value: PrintInfo): this;
  printInfo(value?: PrintInfo): PrintInfo | this {
    return printInfo(this, value) as PrintInfo | this;
  }
  /** @internal Insert or replace the sheet-scoped `Print_Area` name. */
  _setPrintAreaRange(row1: number, col1: number, row2: number, col2: number): void {
    _setPrintAreaRange(this, row1, col1, row2, col2);
  }
  /** @internal Remove the `Print_Area` name (clears the print area). */
  _clearPrintAreaName(): void {
    _clearPrintAreaName(this);
  }
  /** Gets or sets whether a forced page break is printed before the row. */
  setRowPageBreak(row: number, value: boolean): void {
    setRowPageBreak(this, row, value);
  }
  getRowPageBreak(row: number): boolean {
    return getRowPageBreak(this, row);
  }
  /** Gets or sets whether a forced page break is printed before the column. */
  setColumnPageBreak(col: number, value: boolean): void {
    setColumnPageBreak(this, col, value);
  }
  getColumnPageBreak(col: number): boolean {
    return getColumnPageBreak(this, col);
  }
  /** @internal Indices whose metadata carries a manual page break (sparse). */
  _pageBreakIndices(axis: 'row' | 'col'): number[] {
    return _pageBreakIndices(this, axis);
  }
  /** @internal All rows/columns with a manual page break (designer Reset All). */
  _manualPageBreaks(): { rows: number[]; cols: number[] } {
    return _manualPageBreaks(this);
  }
  /** Gets or sets whether the page-break print line is drawn in the sheet. */
  isPrintLineVisible(value?: boolean): boolean {
    return isPrintLineVisible(this, value);
  }
  /**
   * Gets or sets the sheet background image. `option.layout` is `'repeat'` or
   * `'none'` (stretched); `option.paintOrder` is `'normal'` (behind content)
   * or `'over-content'` (above content).
   */
  backgroundImage(src?: string | null, option?: { layout?: 'repeat' | 'none'; paintOrder?: 'normal' | 'over-content' }): string | null {
    return backgroundImage(this, src, option);
  }
  /** @internal Sheet JSON value for the background image. */
  _backgroundImageJSON(): Record<string, unknown> | undefined {
    return _backgroundImageJSON(this);
  }
  getBackgroundImageInfo(): { backgroundImage: string | null; option: Record<string, unknown> } {
    return getBackgroundImageInfo(this);
  }
  getSelections(): Range[] {
    return getSelections(this);
  }
  setSelection(row: number, col: number, rowCount: number, colCount: number): void {
    setSelection(this, row, col, rowCount, colCount);
  }
  addSelection(row: number, col: number, rowCount: number, colCount: number): void {
    addSelection(this, row, col, rowCount, colCount);
  }
  clearSelection(): void {
    clearSelection(this);
  }
  updateSelections(selections: Range[]): boolean {
    return updateSelections(this, selections);
  }
  getActiveRowIndex(): number {
    return getActiveRowIndex(this);
  }
  getActiveColumnIndex(): number {
    return getActiveColumnIndex(this);
  }
  setActiveCell(row: number, col: number): void {
    setActiveCell(this, row, col);
  }
  clear(
    row: number,
    col: number,
    rowCount: number,
    colCount: number,
    area = VIEW,
    storageType = StorageType.data,
  ): void {
    clearRange(this, row, col, rowCount, colCount, area, storageType);
  }
  copyTo(
    fromRow: number,
    fromCol: number,
    toRow: number,
    toCol: number,
    rowCount: number,
    colCount: number,
    option = 0,
  ): void {
    this.transfer(fromRow, fromCol, toRow, toCol, rowCount, colCount, option, false);
  }
  moveTo(
    fromRow: number,
    fromCol: number,
    toRow: number,
    toCol: number,
    rowCount: number,
    colCount: number,
    option = CopyToOptions.all,
  ): void {
    this.transfer(fromRow, fromCol, toRow, toCol, rowCount, colCount, option, true);
  }
  transfer(
    fr: number,
    fc: number,
    tr: number,
    tc: number,
    rc: number,
    cc: number,
    option: number,
    move: boolean,
  ): void {
    transferRange(this, fr, fc, tr, tc, rc, cc, option, move);
  }
  autoFitRow(row: number): void {
    autoFitRow(this, row);
  }
  autoFitColumn(col: number): void {
    autoFitColumn(this, col);
  }
  measureContext(): CanvasRenderingContext2D {
    return measureContext(this);
  }
  selectionPolicy(): number;
  selectionPolicy(value: number): this;
  selectionPolicy(value?: number): number | this { if (value === undefined) return this.policy; this.policy = value; return this; }
  selectionUnit(): number;
  selectionUnit(value: number): this;
  selectionUnit(value?: number): number | this { if (value === undefined) return this.unit; this.unit = value; return this; }
  _setUserSelections(ranges: Range[], row: number, col: number): void {
    _setUserSelections(this, ranges, row, col);
  }
  /** TASK 70: interaction-driven variants of the public `setSelection`/`setActiveCell`.
   * They fire `SelectionChanged` with `byUser: true` — the trial emits its selection
   * events for interaction selections only, never for programmatic ones. */
  _userSetSelection(row: number, col: number, rowCount: number, colCount: number): void {
    setSelection(this, row, col, rowCount, colCount, true);
  }
  _userSetActiveCell(row: number, col: number): void {
    setActiveCell(this, row, col, true);
  }
  *_storedCells(): IterableIterator<[number, number, unknown, string | undefined]> {
    for (const [row, col, cell] of this.area().cells.entries()) yield [row, col, cell.value, cell.formula];
  }
  /** Sparse snapshots cover user operations without allocating empty rectangle contents. */
  _snapshotRanges(ranges: Range[]): () => void {
    return snapshotRanges(this, ranges);
  }
  _usedRange(): { row: number; col: number } {
    return _usedRange(this);
  }
  _view(): WorkbookRenderer | undefined { return this.parent?._renderer(); }
  _outlineGutters(): { row: number; col: number } {
    return _outlineGutters(this);
  }
  getCellRect(row: number, col: number): Rect {
    return getCellRect(this, row, col);
  }
  /** Internal: clipboard state used by the Designer context menu (paste options, marquee). */
  _clipboardMode(): 'none' | 'copy' | 'cut' {
    return _clipboardMode(this);
  }
  /** Internal: clipboard source range of the pending copy/cut (null when empty). */
  _clipboardSource(): { sheetName: string; row: number; col: number; rowCount: number; colCount: number } | null {
    return _clipboardSource(this);
  }
  /** Internal: run the Copy/Cut command on the current selection (Designer menu). */
  _clipboardCopy(cut: boolean): void { (this._view()?.interaction as { _copySelection?: (cut: boolean) => void } | undefined)?._copySelection?.(cut); }
  /** Internal: clear the pending copy/cut state. */
  _clipboardClear(): void { (this._view()?.interaction as { _clearClipboard?: () => void } | undefined)?._clearClipboard?.(); }
  startEdit(selectAll = false, defaultText?: string): void {
    const view = this._view();
    if (view) view.interaction.startEdit(selectAll, defaultText);
    this.editorStatusValue = EditorStatus.enter;
  }
  endEdit(ignoreValueChange = false): boolean {
    const result = this._view()?.interaction.endEdit(ignoreValueChange) ?? true;
    this.editorStatusValue = EditorStatus.ready;
    return result;
  }
  isEditing(): boolean {
    return this._view()?.interaction.isEditing || isEditingImpl(this);
  }
  scroll(vPixels: number, hPixels: number): void { this._view()?.scroll(vPixels, hPixels); }
  showCell(row: number, col: number, verticalPosition = 3, horizontalPosition = 3): void { this._view()?.showCell(row, col, verticalPosition, horizontalPosition); }
  showRow(row: number, position = 0): void { this.showCell(row, this.getViewportLeftColumn(1), position, 3); }
  showColumn(col: number, position = 0): void { this.showCell(this.getViewportTopRow(1), col, 3, position); }
  getViewportTopRow(_index: number): number { return this._view()?.rows.find(r => r.index >= this.frozenRowCount())?.index ?? 0; }
  getViewportBottomRow(_index: number): number { return this._view()?.rows.filter(r => r.index < this.rows.count - this.frozenTrailingRowCount()).at(-1)?.index ?? 0; }
  getViewportLeftColumn(_index: number): number { return this._view()?.cols.find(c => c.index >= this.frozenColumnCount())?.index ?? 0; }
  getViewportRightColumn(_index: number): number { return this._view()?.cols.filter(c => c.index < this.cols.count - this.frozenTrailingColumnCount()).at(-1)?.index ?? 0; }
  getViewportHeight(_index: number): number { const view = this._view(); return view ? view.viewHeight - view.headerHeight : 0; }
  getViewportWidth(_index: number): number { const view = this._view(); return view ? view.viewWidth - view.headerWidth : 0; }
  /**
   * Protect the sheet. `password` is optional: an empty or omitted password
   * protects without a verifier (matches the interop product). A non-empty
   * password stores `{algorithmName, hashValue, saltValue, spinCount}` inside
   * `options.protectionOptions`, which is serialized with the sheet.
   */
  protect(password?: string): void {
    protect(this, password);
  }
  /** Unprotect the sheet; returns false while a password was required and not supplied. */
  unprotect(password?: string): boolean {
    return unprotect(this, password);
  }
  /** True while the sheet is protected with a password. */
  hasPassword(): boolean {
    return hasPassword(this);
  }
  /** True when `row`/`col` may be edited under the current protection state. */
  _isEditableCell(row: number, col: number, area = VIEW): boolean {
    return _isEditableCell(this, row, col, area);
  }
  /** True when the cell may become part of the selection under protection flags. */
  _isSelectableCell(row: number, col: number): boolean {
    return _isSelectableCell(this, row, col);
  }
  markDirty(row: number, col: number, oldValue: unknown, newValue: unknown): void {
    markDirty(this, row, col, oldValue, newValue);
  }
  isDirty(): boolean {
    return isDirty(this);
  }
  hasPendingChanges(): boolean {
    return hasPendingChanges(this);
  }
  getDirtyCells(row = 0, col = 0, rowCount = this.rows.count, colCount = this.cols.count): DirtyCell[] {
    return getDirtyCells(this, row, col, rowCount, colCount);
  }
  clearPendingChanges(
    info: { row?: number; col?: number; rowCount?: number; colCount?: number; clearType?: number } = {},
  ): void {
    clearPendingChanges(this, info);
  }
  suspendDirty(): void {
    suspendDirty(this);
  }
  resumeDirty(): void {
    resumeDirty(this);
  }
  isDirtySuspended(): boolean {
    return isDirtySuspended(this);
  }
  addNamedStyle(style: Style): void {
    addNamedStyle(this, style);
  }
  getNamedStyle(name: string): Style {
    return getNamedStyle(this, name);
  }
  getNamedStyles(): Style[] {
    return getNamedStyles(this);
  }
  removeNamedStyle(name: string): void {
    removeNamedStyle(this, name);
  }
  addCustomName(
    name: string,
    formula: string,
    baseRow: number,
    baseCol: number,
    comment?: string,
    isReadOnly?: boolean,
  ): void {
    addCustomName(this, name, formula, baseRow, baseCol, comment, isReadOnly);
  }
  getCustomName(name: string): NameInfo {
    return getCustomName(this, name);
  }
  getCustomNames(): NameInfo[] {
    return [...this.names.values()];
  }
  removeCustomName(name: string): void {
    removeCustomName(this, name);
  }
  clearCustomNames(): void {
    clearCustomNames(this);
  }
  bind(type: string, fn: EventHandler): void;
  bind(type: string, data: unknown, fn: EventHandler): void;
  bind(type: string, data?: unknown, fn?: EventHandler): void {
    this.events.bind(type, data, fn);
  }
  unbind(type: string, fn?: EventHandler): void {
    this.events.unbind(type, fn);
  }
  unbindAll(): void {
    this.events.unbindAll();
  }
  suspendEvent(): void {
    this.events.depth++;
  }
  resumeEvent(): void {
    this.events.depth = Math.max(0, this.events.depth - 1);
  }
  _emit(type: string, info: EventInfo): void {
    if (this.events.depth || this.parent?._isEventSuspended()) return;
    this.events.emit(type, info);
    this.parent?._emit(type, info);
  }
  /** `true` when this sheet or its workbook listens for `type` (allocation guard). */
  _hasAnyListener(type: string): boolean {
    return this.events.has(type) || (this.parent?._hasEvent(type) ?? false);
  }
  /** Scenario capture hooks (called from the shared value write path). */
  _scenarioCaptureStart(row: number, col: number): boolean {
    return this.parent ? this.parent.scenarioManager._captureStart(this, row, col) : false;
  }
  _scenarioCaptureEnd(row: number, col: number): void {
    if (this.parent) this.parent.scenarioManager._captureEnd(this, row, col);
  }
  changed(
    row: number,
    col: number,
    sheetArea: number,
    propertyName: string,
    oldValue: unknown,
    newValue: unknown,
  ): void {
    changed(this, row, col, sheetArea, propertyName, oldValue, newValue);
  }
  axisInfo(
    axis: 'row' | 'col',
    index: number,
    sheetArea: number,
    propertyName: string,
    oldValue: unknown,
    newValue: unknown,
    amount?: number,
  ): EventInfo {
    return axisInfo(this, axis, index, sheetArea, propertyName, oldValue, newValue, amount);
  }
  axisChanged(
    axis: 'row' | 'col',
    index: number,
    area: number,
    property: string,
    old: unknown,
    value: unknown,
    amount?: number,
  ): void {
    axisChanged(this, axis, index, area, property, old, value, amount);
  }
  suspendPaint(): void {
    suspendPaint(this);
  }
  resumePaint(): void {
    resumePaint(this);
  }
  isPaintSuspended(): boolean {
    return isPaintSuspended(this);
  }
  suspendCalcService(_ignoreDirty = false): void {
    suspendCalcService(this, _ignoreDirty);
  }
  resumeCalcService(recalcAll = false): void {
    resumeCalcService(this, recalcAll);
  }
  _resumeWorkbookCalc(recalcAll = false): void {
    _resumeWorkbookCalc(this, recalcAll);
  }
  recalcAll(_refreshAll = false): void {
    recalcAll(this, _refreshAll);
  }
  addCustomFunction(fn: import('./calc/functions-api.js').CalcFunction): void {
    addCustomFunction(this, fn);
  }
  getCustomFunction(name: string): unknown {
    return getCustomFunction(this, name);
  }
  removeCustomFunction(name: string): void {
    removeCustomFunction(this, name);
  }
  clearCustomFunctions(): void {
    clearCustomFunctions(this);
  }
  getPrecedents(row: number, col: number): CellsInfo[] {
    return getPrecedents(this, row, col);
  }
  getDependents(row: number, col: number): CellsInfo[] {
    return getDependents(this, row, col);
  }
  getFormulaInformation(row: number, col: number): FormulaInfo {
    return getFormulaInformation(this, row, col);
  }
  /** Searches this sheet with the given condition (`Workbook.search` covers the workbook). */
  search(searchCondition: SearchCondition): SearchResult {
    // Without a condition the trial answers `null` (probe items `search-5`, `search-8`).
    if (searchCondition === undefined || searchCondition === null) return null as unknown as SearchResult;
    return searchSheet(this, searchCondition, -1);
  }
  invalidateLayout(): void {
    invalidateLayout(this);
  }
  repaint(_clipRect?: unknown): void {
    repaint(this, _clipRect);
  }
  _flushPaint(): void {
    _flushPaint(this);
  }
  _onInvalidate(callback: (layout: boolean) => void): void {
    _onInvalidate(this, callback);
  }
  rowFilter(value?: RowFilterBase | null): RowFilterBase | null {
    return rowFilter(this, value);
  }
  sortRange(
    row: number,
    column: number,
    rowCount: number,
    columnCount: number,
    byRows: boolean,
    sortInfo: unknown[],
    sortOption?: { sortByValue?: boolean; sortByColor?: boolean },
  ): boolean {
    const sorted = sortRangeImpl(this, row, column, rowCount, columnCount, byRows, sortInfo as never, sortOption);
    noteSortRange(this, row, column, rowCount, columnCount, byRows, sortInfo, sorted);
    return sorted;
  }
  getHyperlink(row: number, col: number, area = VIEW): unknown {
    return getHyperlink(this, row, col, area);
  }
  _isFreshHyperlink(row: number, col: number): boolean {
    return _isFreshHyperlink(this, row, col);
  }
  setHyperlink(row: number, col: number, value: JsonRecord | null, area = VIEW): void {
    setHyperlink(this, row, col, value, area);
  }
  /** Expands a table when an edit lands in the row directly below or column right of it. */
  _autoExpandTables(row: number, col: number, previousValue?: unknown): void {
    _autoExpandTables(this, row, col, previousValue);
  }
  /** Bounding `Range` of everything the sheet uses of the requested `UsedRangeType` kind(s). */
  getUsedRange(type?: number): Range | null {
    return usedRange(this, type);
  }
  /** Exports `rowCount` x `columnCount` cells starting at (`row`, `column`) as quoted CSV text. */
  getCsv(
    row: number,
    column: number,
    rowCount: number,
    columnCount: number,
    rowDelimiter = '\r\n',
    columnDelimiter = '\t',
  ): string {
    return getCsvImpl(this, row, column, rowCount, columnCount, rowDelimiter, columnDelimiter);
  }
  /** Imports CSV text into the sheet starting at (`row`, `column`). */
  setCsv(row: number, column: number, text: string, rowDelimiter = '\r\n', columnDelimiter = '\t'): void {
    setCsvImpl(this, row, column, text, rowDelimiter, columnDelimiter);
  }
  /** Rows whose cells changed since the last `clearPendingChanges` (trial `{ row, item }`). */
  getDirtyRows(): { row: number; item: unknown }[] {
    return getDirtyRows(this);
  }
  /** Rows inserted since the last `clearPendingChanges` (trial `{ row, item }`). */
  getInsertRows(): { row: number; item: unknown }[] {
    return getInsertRows(this);
  }
  /** Rows deleted since the last `clearPendingChanges` (trial `{ row, originalItem }`). */
  getDeletedRows(): { row: number; originalItem: unknown }[] {
    return getDeletedRows(this);
  }
  /** The data record bound to that row, `null` when the sheet has no data source. */
  getDataItem(row: number): unknown {
    return getDataItemImpl(this, row);
  }
  /** The data column name bound to that sheet column. */
  getDataColumnName(column: number): string | null | undefined {
    return getDataColumnNameImpl(this, column);
  }
  /**
   * The sheet's id: the same token the trial keeps in `__ID__`. (The trial
   * declares `getId` in its public type but does not create the method at
   * runtime - see docs/STATUS.md, task 38 item 3.)
   */
  getId(): string {
    return this.__ID__;
  }
  /** The state of the last `sortRange` call (`undefined` before the first one). */
  getSortState(): SortState | null | undefined {
    return getSortStateImpl(this);
  }
  /** Reads the sheet's selection state, or sets it (fluent, like the trial). */
  isSelected(): unknown;
  isSelected(selectedState: unknown): this;
  isSelected(selectedState?: unknown): unknown {
    return isSelectedImpl(this, arguments.length, selectedState);
  }
  /** Back to a freshly created sheet's state; the name and workbook position stay. */
  reset(): void {
    resetSheet(this);
  }
  /** `ready`, `enter` or `edit`: the sheet editor state (trial value, a number). */
  editorStatus(): number {
    return editorStatusImpl(this);
  }
  /** Sets the editor state directly (runtime member of the trial's sheet). */
  setEditorStatus(status: number): void {
    setEditorStatusImpl(this, status);
  }
  /** Hit-tests sheet-viewport pixels into the trial's `IHitTestInformation` core fields. */
  hitTest(x: number, y: number): HitTestInformation {
    return hitTestImpl(this, x, y);
  }
  toJSON(options: SerializationOptions = {}): JsonRecord {
    return worksheetToJSON(this, options);
  }
  fromJSON(settings: object): void {
    worksheetFromJSON(this, settings);
  }
}
