/**
 * Single typed entry point into the parts of the core that its public type
 * contract (`@opensheets/spread-sheets` d.ts) does not declare: the underscore
 * internal members the designer commands call, and a few members our own core
 * implements that the contract has not listed yet (documented per member below).
 *
 * Rules for designer code:
 * - Type workbook/sheet/style values with the aliases exported here (they come
 *   straight from the core's contract, so no structural duplication happens).
 * - Reach every non-contract member through these interfaces and helpers —
 *   never via the `any` escape hatch.
 */
import core from '@mescius/spread-sheets';
import type GC from '@mescius/spread-sheets';
import type { CommentUiFacade } from './designer-api.js';

// TASK 72: the trial registers the `BC_*` barcode formulas when the barcode add-in package
// (`@mescius/spread-sheets-barcode`) loads, never from the core (black-box: core-only evaluates
// `BC_QRCODE("x")` as `#NAME?`; after the add-in loads it evaluates the barcode record). Our
// Designer bundles that add-in feature, so loading the Designer registers the formula layer on
// the paired core — the same point the add-in occupies in the official install. TASK 73 moved
// the registration behind the core's non-enumerable `_registerBarcodeFunctions` hook, which is
// exactly what the published `@opensheets/spread-sheets-barcode` add-in calls.
{
  const register = sheetsNamespace(core)._registerBarcodeFunctions;
  if (typeof register === 'function') register();
  else console.warn('[OpenSheets Designer] the paired core exposes no _registerBarcodeFunctions hook; BC_* formulas stay #NAME?');
}

/* -------------------------------------------------------- contract types --- */

export type Workbook = GC.Spread.Sheets.Workbook;
export type Worksheet = GC.Spread.Sheets.Worksheet;
export type Style = GC.Spread.Sheets.Style;
export type Hyperlink = GC.Spread.Sheets.IHyperlink;
export type PrintInfo = GC.Spread.Sheets.Print.PrintInfo;
export type Table = GC.Spread.Sheets.Tables.Table;
export type DataValidator = GC.Spread.Sheets.DataValidation.DefaultDataValidator;
export type SheetArea = GC.Spread.Sheets.SheetArea;
export type StorageType = GC.Spread.Sheets.StorageType;

/** The GC namespace root, as handed around by `Designer.gc` / `globalThis.GC`. */
export type GCRoot = typeof GC;

/**
 * The core namespace a Designer instance runs against (GAP-52-2).
 *
 * Preference order, so that both supported installs share the workbook class of the core the
 * application actually uses:
 * 1. `globalThis.GC` when it already carries `Spread.Sheets.Workbook` — the script-tag install
 *    (`dist/gc.spread.sheets.designer.all.min.js` against a core `<script>`), where the page's
 *    own `window.GC` created the app's workbooks, and `GC.Spread.Sheets.findControl(host)` must
 *    resolve the designer's workbook through that namespace;
 * 2. otherwise the core namespace this package imports — the bundler install, where the
 *    application imports the aliased core (`@mescius/spread-sheets`) and never sets a global.
 *    With the designer package referencing that same specifier (GAP-52-1) this is literally the
 *    same object the application imported, so no consumer-side alias bridge is needed.
 */
export function designerCore(): GCRoot | undefined {
  const globalGC = (globalThis as { GC?: GCRoot }).GC;
  if (globalGC?.Spread?.Sheets?.Workbook) return globalGC;
  if (core?.Spread?.Sheets?.Workbook) return core;
  return globalGC ?? core;
}

/* ---------------------------------------------------------- view helpers --- */

/**
 * The one bridge the whole package uses to view a core object through a
 * designer-side interface: the *same runtime object*, typed as `V & T`, so the
 * view's members resolve first while the value stays assignable everywhere the
 * contract type is expected. Never converts values — an identity at runtime.
 */
export function extendView<V extends object, T extends object>(value: T): V & T {
  return value as V & T;
}

/** Same object, additionally keyed by any string (settings dialogs, galleries and named styles read and write dynamic keys). */
export function recordView<T extends object>(value: T): T & Record<string, unknown> {
  return value as T & Record<string, unknown>;
}

/** The GC namespace objects the designer reads `DesignerResources` from and mounts `Designer` onto (installed by `installDesigner()`, not part of the core contract). */
export interface SheetsNamespaceExtras {
  Designer?: unknown;
  DesignerResources?: Record<string, unknown>;
  /** Hidden, non-enumerable barcode-layer hook of the core (TASK 73; the add-in package calls it the same way). */
  _registerBarcodeFunctions?: () => void;
  /** Hidden hook of the core that switches on the Designer serialization behaviour (eager printInfo,
   *  shared-formula coalescing — TASK 75); `installDesigner()` calls it, tests use it to measure the
   *  exact trial JSON shape without mounting a Designer. */
  _setDesignerSerialization?: (on: boolean) => void;
}
export function sheetsNamespace(gc: GCRoot): SheetsNamespaceExtras & GCRoot['Spread']['Sheets'] {
  return extendView<SheetsNamespaceExtras, GCRoot['Spread']['Sheets']>(gc.Spread.Sheets);
}

/* -------------------------------------------------------- namespace views --- */

/** `GC.Spread.Common.UserManager` with the core's internal display-name cache (used by the threaded-comments panel for mention blocks). */
export interface UserManagerView { _knownNameSync?(userId?: string): string | undefined }
export function userManager(gc: GCRoot | undefined): UserManagerView & object | undefined {
  const manager = gc?.Spread?.Common?.UserManager;
  return manager === undefined ? undefined : extendView<UserManagerView, NonNullable<typeof manager>>(manager);
}


/* --------------------------------------------------------- shared shapes --- */

/**
 * Row/column window the designer reads back from `getSelections()` (the core
 * returns `Range` instances, which satisfy this) and synthesizes for the
 * active cell when there is no selection.
 */
export interface SelectionRange { row: number; col: number; rowCount: number; colCount: number }

/** The copied/cut rectangle the core clipboard tracks per sheet. */
export interface ClipboardSource { sheetName: string; row: number; col: number; rowCount: number; colCount: number }

/* ------------------------------------------------------ worksheet bridge --- */

/** Renderer view of the workbook (our core's `WorkbookRenderer`, the members the designer reads). */
export interface SheetView {
  scrollX: number; scrollY: number; zoom: number;
  headerWidth: number; headerHeight: number; viewportX: number; viewportY: number;
  /** Pixel width/height of the whole grid surface (canvas incl. the header strips) —
   *  the fallback viewport the Zoom To Selection command measures on headless hosts (TASK 75). */
  viewWidth?: number;
  /** Pixel height of the grid viewport (below it come the sheet tabs). */
  viewHeight?: number;
  /** Grid hit test for a pixel point (context-menu target resolution). */
  hitTest?(x: number, y: number): { row: number; col: number } | null;
  /** Interaction controller: the threaded-comment overlay API lives here. */
  interaction?: { commentUi?: CommentUiFacade };
  /** Queue a repaint of this sheet (used after moving a chart onto another sheet). */
  schedule?: () => void;
}

/** Internal worksheet members the designer commands call. */
export interface SheetInternals {
  /** Write one style property onto a cell's own style (the ribbon applyStyle primitive). */
  _setStyleProperty(row: number, col: number, property: string, value: unknown, sheetArea?: SheetArea): void;
  /** Insert-cell/delete-cell shift over a column band, adjusting formula references pointing into it. */
  _shiftRowsInColumns(row: number, count: number, colStart: number, colEnd: number, remove: boolean): void;
  /** Row-band mirror of `_shiftRowsInColumns`. */
  _shiftColumnsInRows(col: number, count: number, rowStart: number, rowEnd: number, remove: boolean): void;
  /** Core clipboard state of the sheet (designer Paste / Insert Cut Cells menus read it). */
  _clipboardMode(): 'none' | 'copy' | 'cut';
  /** Last `sortRange` result serialized as the sheet's `sortState` (trial parity, TASK 75). */
  sortStateValue: Record<string, unknown> | null | undefined;
  _clipboardSource(): ClipboardSource | null;
  _clipboardClear(): void;
  /** Copy/cut the current selection through the interaction controller (ribbon Copy/Cut). */
  _clipboardCopy(cut: boolean): void;
  /** Last used-range cell, `{ row: -1, col: -1 }`-style when the sheet is empty. */
  _usedRange(): { row: number; col: number };
  /** Fill-copy style record for a source cell (trial parity, TASK 75). */
  _fillStyleRecord(row: number, col: number): Record<string, unknown>;
  /** Re-base a formula's relative references by the given row/column delta. */
  _translateFormula(formula: string, rows: number, columns: number): string;
  /** Row and column indexes with a manual page break. */
  _manualPageBreaks(): { rows: number[]; cols: number[] };
  /** Renderer view of the workbook (pixel scroll/zoom the draw overlay maps pointer events through). */
  _view(): SheetView | undefined;
  /** Last `backgroundImage()` call: source plus layout/paintOrder options. */
  getBackgroundImageInfo(): { backgroundImage: string | null; option: { layout?: 'repeat' | 'none'; paintOrder?: 'normal' | 'over-content' } };
  /** `backgroundImage` viewed with the `null` our core accepts to remove the image (the contract types the value `string`). */
  backgroundImage(value: string | null, option?: { layout?: 'repeat' | 'none'; paintOrder?: 'normal' | 'over-content' }): void;
  /** Merged span covering a cell (the base of `Range`), null when the cell is not merged. */
  getSpan(row: number, col: number, sheetArea?: SheetArea): SelectionRange | null;
  /** Multi-range user selection with the active cell inside (Go To Special selects scattered strips). */
  _setUserSelections(ranges: SelectionRange[], row: number, col: number): void;
  /** Interaction-driven single-range selection: fires `SelectionChanged` with `byUser: true` (TASK 70). */
  _userSetSelection(row: number, col: number, rowCount: number, colCount: number): void;
  /** Interaction-driven active-cell move: fires the selection events with `byUser: true` (TASK 70). */
  _userSetActiveCell(row: number, col: number): void;
  /** Raw frozen-pane state the public API exposes no getter for (the Sheet Settings dialog reads it). */
  readonly settings?: Record<string, unknown>;
  /** Tab color: implemented by our core; not listed in the contract yet. */
  tabColor(value?: string | null): string | undefined;
  /** Indicator options of the Outline Column dialog (designer-side sheet state; the contract lists no member for it). */
  outlineColumnOptions?: Record<string, unknown>;
  /** Default row height of the sheet (Standard Height dialog reads it; the contract only lists the `defaults.rowHeight` record). */
  getDefaultRowHeight(): number;
  /** Workbook the sheet belongs to (implemented by our core; the contract lists no such member).
   *  Read for the workbook-default font when materialising the cleared-cell style record (TASK 75). */
  parent?: Workbook;
}

/** Typed view of a worksheet's non-contract members (same object, broader type). */
export function internals(sheet: Worksheet): SheetInternals & Worksheet {
  return extendView<SheetInternals, Worksheet>(sheet);
}

/* ------------------------------------------------------- print info bridge --- */

/**
 * Internal print-info members. `paperSize(value)` additionally views the
 * plain `{width,height,kind}` record our core's PrintInfo merges — the
 * contract types the parameter as a `PaperSize` instance only.
 */
export interface PrintInfoInternals {
  /** Effective margins in hundredths of an inch (set values merged over the defaults). */
  _marginEffective(): Record<string, number>;
  /** Set the paper from a plain size record (same handling as the core's JSON path). */
  paperSize(value: { width: number; height: number; kind: number }): unknown;
}

export function printInfoInternals(printInfo: PrintInfo): PrintInfoInternals & PrintInfo {
  return extendView<PrintInfoInternals, PrintInfo>(printInfo);
}

/**
 * `sheet.printInfo()` typed: the contract types the call with an `any`-returning
 * getter/setter overload, so the designer pins the object once here.
 */
export function printInfoOf(sheet: Worksheet): PrintInfo {
  return sheet.printInfo() as PrintInfo;
}

/* ------------------------------------------------------ outline internals --- */

/**
 * Row/column outline (`sheet.rowOutlines` / `sheet.columnOutlines`) as our core implements
 * it: the ribbon Show Detail materialises the collapsed group's summary marker through this
 * non-contract member (TASK 75 probe — the trial serialises the marker at the group start).
 */
export interface OutlineInternals {
  _touchSummaryMarker?(index: number): void;
}
export function outlinesOf(outline: GC.Spread.Sheets.Outlines.Outline): OutlineInternals & GC.Spread.Sheets.Outlines.Outline {
  return extendView<OutlineInternals, GC.Spread.Sheets.Outlines.Outline>(outline);
}

/** Table style record returned by `table.style()` / accepted by `table.style(value)`. */
export type TableTheme = GC.Spread.Sheets.Tables.TableTheme;

/**
 * A nameless empty `TableTheme` — the "no table style" state the trial keeps after the Table
 * Styles gallery Clear (TASK 77 probe: `table.style()` then answers a name-less theme and the
 * serialized table omits the `style` key). Passing `null` instead would leave the core paint
 * path a value without `_style` to dereference (the trial's own guard; our core has none yet),
 * so the designer clears a table style by assigning this empty theme.
 */
export function emptyTableTheme(gc: GCRoot): TableTheme {
  return new gc.Spread.Sheets.Tables.TableTheme();
}

/* ------------------------------------------------------ table internals --- */

/** Internal table members the Table Rows/Columns insert/delete commands use. */
export interface TableInternals {
  _growRowCount?(delta: number): void;
  _growColCount?(delta: number): void;
  /** Rebuild the table around a new outer range (the "Resize Table" dialog). */
  _resize?(range: { row: number; col: number; rowCount: number; colCount: number }): void;
}

export function tableInternals(table: Table): TableInternals & Table {
  return extendView<TableInternals, Table>(table);
}

/* ------------------------------------------------------ shape internals --- */

/** Fill record returned by the shape `fill()` getter (our core's `ShapeStyle`). */
export interface ShapeFillRecord { visible?: boolean; color?: string; transparency?: number }
/** Line record returned by the shape `line()` getter. */
export interface ShapeLineRecord { visible?: boolean; color?: string; width?: number; dash?: number }

/**
 * Floating shape as our core implements it: the contract's `Shape` lacks the
 * paint/geometry accessors the Insert galleries and the Format Shape panel call
 * (fill/line/rotation/presetName/control/…), so the designer types shapes
 * through this view of the same runtime object. `fill`/`line` are overloaded
 * getter/setter pairs: the get form returns the plain paint record, the set
 * form takes one and returns the shape (chaining).
 */
export interface DesignerShape {
  name(): string;
  isSelected(value?: boolean): unknown;
  /** Shape visibility (the Selection pane eye toggle; the contract Shape inherits it from FloatingObject). */
  isVisible(value?: boolean): unknown;
  /**
   * Floating-object resize permission (core stores the value verbatim). The trial's Paste Linked
   * Picture shape serializes the numeric `0` — not `false` — and answers `allowResize()` the same
   * way, so the designer writes the trial's own value through this view (TASK 77 probe).
   */
  allowResize(value?: number | boolean): unknown;
  /** Floating-object kind tag ('0' shape, '1' picture, …). */
  typeName?: string;
  x(value?: number | string): unknown;
  y(value?: number | string): unknown;
  width(value?: number | string): unknown;
  height(value?: number | string): unknown;
  rotation(value?: number): unknown;
  fill(): ShapeFillRecord;
  fill(value: unknown): this;
  line(): ShapeLineRecord;
  line(value: unknown): this;
  text(value?: string): unknown;
  hyperlink(value?: Hyperlink | null): unknown;
  control(value?: unknown): unknown;
  presetName(value?: string): unknown;
  setArrowHeads(start: boolean, end: boolean): unknown;
  shapeType(value?: number): unknown;
  groupId(value?: string | null): unknown;
  lockText(value?: boolean): unknown;
  getHost(): HTMLElement[];
  toJSON(): Record<string, unknown>;
  fromJSON(data: unknown): unknown;
  fromShapeJSON?(data: unknown): void;
}

/** `sheet.shapes` as our core implements it (`add()` takes a Shape instance; uniqueName/nextName exist). */
export interface ShapeCollectionInternals {
  add(shape: DesignerShape): unknown;
  all(): DesignerShape[];
  get(name: string): DesignerShape | undefined;
  remove(name: string): void;
  uniqueName(base: string): string;
  nextName(base: string): string;
  bringForward(name: string): void;
  sendBackward(name: string): void;
  bringToFront(name: string): void;
  sendToBack(name: string): void;
  group(shapes: DesignerShape[]): unknown;
  ungroup(shape: DesignerShape): unknown;
  addTextBox(name: string, x: number, y: number, width: number, height: number): DesignerShape;
  addCameraShape(name: string, cellRange: string, x?: number, y?: number, width?: number, height?: number): DesignerShape;
  addFormControl(name: string, control: { objectType: string }, x?: number, y?: number, width?: number, height?: number): DesignerShape;
  addPictureShape(name: string, src: string, x?: number, y?: number, width?: number, height?: number): DesignerShape;
  /** Core-only (like uniqueName/nextName): rebuild nested shape records (TASK 81 group paste). */
  importShapes(records: Record<string, unknown>[]): unknown[];
}

export function shapesOf(sheet: Worksheet): ShapeCollectionInternals & Worksheet['shapes'] {
  return extendView<ShapeCollectionInternals, Worksheet['shapes']>(sheet.shapes);
}

/* ------------------------------------------------------- chart internals --- */

/**
 * Chart members our core implements beyond the contract (`toJSON` is listed by
 * the contract; `svgMarkup`, `data` and `chartAreaStyle` are not). `data` and
 * `chartAreaStyle` are getter/setter pairs like the shape paint accessors.
 */
export interface ChartInternals {
  /** Full chart JSON (Cut/Copy clipboard payload). */
  toJSON(): unknown;
  svgMarkup(): string;
  data(): { formula?: string } | undefined;
  data(value: { formula?: string }): unknown;
  chartAreaStyle(): { fill?: string; stroke?: string } | undefined;
  chartAreaStyle(value: { fill?: string; stroke?: string }): unknown;
  /** The parsed chartSpace payload our core keeps on the chart (Move Chart carries it over verbatim). */
  _space?: unknown;
  /** The sheet the chart lives on (the collection back-reference the designer needs to remove it). */
  _sheet?: GC.Spread.Sheets.Worksheet | null;
}

/** `sheet.charts` as our core implements it (z-order moves are not in the contract). */
export interface ChartCollectionInternals {
  all(): Array<GC.Spread.Sheets.Charts.Chart & ChartInternals>;
  bringForward(name: string): void;
  sendBackward(name: string): void;
  bringToFront(name: string): void;
  sendToBack(name: string): void;
}

export function chartsOf(sheet: Worksheet): ChartCollectionInternals & Worksheet['charts'] {
  return extendView<ChartCollectionInternals, Worksheet['charts']>(sheet.charts);
}

/** One chart with the non-contract paint/serialization members (undefined in, undefined out). */
export function chartInternals(chart: GC.Spread.Sheets.Charts.Chart | undefined): (GC.Spread.Sheets.Charts.Chart & ChartInternals) | undefined {
  return chart === undefined ? undefined : extendView<ChartInternals, GC.Spread.Sheets.Charts.Chart>(chart);
}

/**
 * The `Charts` namespace: its `ChartType` enum is in the contract, but the
 * dialog tables look the type up by the runtime string name, so the designer
 * reads the table as a `Record<string, number>` of the same enum's values.
 */
export interface ChartsNamespaceExtras {
  ChartType: Record<string, number>;
}
export function chartsNamespace(gc: GCRoot): ChartsNamespaceExtras & GCRoot['Spread']['Sheets']['Charts'] {
  return extendView<ChartsNamespaceExtras, GCRoot['Spread']['Sheets']['Charts']>(gc.Spread.Sheets.Charts);
}

/* ------------------------------------------------------ comment internals --- */

/** Legacy comment position accessors our core implements (the contract `Comment` lists none). */
export interface CommentPosition { rowIndex(): number; colIndex(): number }

export function legacyCommentsOf(sheet: Worksheet): Array<GC.Spread.Sheets.Comments.Comment & CommentPosition> {
  return sheet.comments.all() as Array<GC.Spread.Sheets.Comments.Comment & CommentPosition>;
}

/* ----------------------------------------------------- workbook internals --- */

/** Workbook members the designer calls that the contract does not list yet. */
export interface WorkbookInternals {
  /** Run the core print pipeline for one (or the active) sheet index. */
  print?(sheetIndex?: number): void;
  /** Cell templates registered through the Create Cell Template dialog. */
  _cellTemplates?: Record<string, unknown>;
}

export function workbookInternals(workbook: Workbook): WorkbookInternals & Workbook {
  return extendView<WorkbookInternals, Workbook>(workbook);
}

/**
 * `workbook.options` as the designer reads/writes it: the contract interface lists the
 * documented flags only, while the trial keeps ribbon state in extra keys —
 * `highlightInvalidData` (Circle Invalid Data / Clear Invalid Circles; the key exists only
 * while the circles are shown, TASK 75 probe) and the workbook default `font` (the cleared
 * cell style materialises it).
 */
export function workbookOptionsRecord(workbook: Workbook): Record<string, unknown> {
  return recordView(workbook.options) as Record<string, unknown>;
}

/** The workbook default font string, when it carries one (cleared-style record, TASK 75). */
export function workbookDefaultFont(workbook: Workbook | undefined): string | undefined {
  const font = workbook === undefined ? undefined : workbookOptionsRecord(workbook).font;
  return typeof font === 'string' ? font : undefined;
}

/* ---------------------------------------------- relaxed-argument views --- */

/**
 * `Worksheet.setStyle` viewed with the arguments our core really accepts: the
 * contract types the value as a `Style`, while the implementation also merges
 * plain style records and treats `null` as "clear the cell style".
 */
export interface StyleWriter {
  setStyle(row: number, col: number, value: Style | Partial<Style> | null, sheetArea?: SheetArea): void;
}
export function styleWriter(sheet: Worksheet): StyleWriter & Worksheet {
  return extendView<StyleWriter, Worksheet>(sheet);
}

/** `Worksheet.setHyperlink` viewed with the `null` our core accepts to remove a link. */
export interface HyperlinkWriter {
  setHyperlink(row: number, col: number, value: Hyperlink | null, sheetArea?: SheetArea): void;
}
export function hyperlinkWriter(sheet: Worksheet): HyperlinkWriter & Worksheet {
  return extendView<HyperlinkWriter, Worksheet>(sheet);
}

/**
 * A plain border record in the trial's serialized shape. `Range.setBorder` is contracted to take a
 * `LineBorder` instance; the core style layer stores whatever value it is handed and serializes it
 * verbatim, so the designer can write the trial's exact `borderBottom: {style: 1}` record
 * (TASK 77 probe — the List Formulas report header border serializes no color).
 */
export interface BorderRecord { style?: number; color?: string; dashStyle?: number }
export interface RangeWriter {
  setBorder(value: BorderRecord | GC.Spread.Sheets.LineBorder, options: {
    all?: boolean; outline?: boolean; inside?: boolean;
    innerHorizontal?: boolean; innerVertical?: boolean;
    top?: boolean; left?: boolean; right?: boolean; bottom?: boolean;
  }): void;
}
/** Works on `Range` and on the `CellRange` the contract types `sheet.getRange` as returning. */
export function rangeWriter<R extends object>(range: R): RangeWriter & R {
  return extendView<RangeWriter, R>(range);
}

/** `Worksheet.rowFilter` viewed with the `null` our core accepts to remove the filter. */
export interface RowFilterWriter {
  rowFilter(value: GC.Spread.Sheets.Filter.RowFilterBase | null): unknown;
}
export function rowFilterWriter(sheet: Worksheet): RowFilterWriter & Worksheet {
  return extendView<RowFilterWriter, Worksheet>(sheet);
}

/**
 * `sheet.conditionalFormats` viewed with the `null` second rule value the core
 * accepts (the contract types both rule values as non-nullable `Object`).
 */
export interface CellValueRuleWriter {
  addCellValueRule(
    comparisonOperator: GC.Spread.Sheets.ConditionalFormatting.ComparisonOperators,
    value1: unknown, value2: unknown, style: Style,
    ranges: GC.Spread.Sheets.Range[],
  ): GC.Spread.Sheets.ConditionalFormatting.ConditionRuleBase;
}
export function conditionRulesOf(sheet: Worksheet): CellValueRuleWriter & Worksheet['conditionalFormats'] {
  return extendView<CellValueRuleWriter, Worksheet['conditionalFormats']>(sheet.conditionalFormats);
}

/**
 * The Rules Manager / New Rule dialog's view of `sheet.conditionalFormats`: the
 * collection accessors and `add*` rule builders viewed with the plain rule-style
 * and range records the dialogs hand them (the contract types those parameters as
 * concrete `Style`/`Range` instances the dialog cannot build without importing
 * them, and its `getRules` requires row/column while the manager wants every
 * rule). Overrides the contract signatures the same way `CellValueRuleWriter`
 * does, so the CF code needs no local cast.
 */
/** One rule as the manager reads it: `stopIfTrue` is the only member called directly. */
export interface ConditionRuleView { stopIfTrue(value?: boolean): unknown }
/**
 * Data-bar rule as our core implements it: `gradient` is the solid-fill gallery marker the
 * ribbon writes after `addDataBarRule` (TASK 75 probe; the contract's `ConditionRuleBase`
 * return type declares no such member).
 */
export interface DataBarRuleView { gradient(value?: boolean): unknown }
export interface ConditionalFormatsInternals {
  getRules(): unknown[];
  getRule(index: number): ConditionRuleView | undefined;
  removeRule(rule: unknown): void;
  addRule(rule: unknown): unknown;
  addDataBarRule(minType: number, min: unknown, maxType: number, max: unknown, color: string, ranges: unknown[]): DataBarRuleView;
  add2ScaleRule(minType: number, min: unknown, minColor: string, maxType: number, max: unknown, maxColor: string, ranges: unknown[]): unknown;
  add3ScaleRule(minType: number, min: unknown, minColor: string, midType: number, mid: unknown, midColor: string, maxType: number, max: unknown, maxColor: string, ranges: unknown[]): unknown;
  addIconSetRule(iconSetType: number, ranges: unknown[]): unknown;
  addFormulaRule(formula: string, style: unknown, ranges: unknown[]): unknown;
  addCellValueRule(operator: number, value1: unknown, value2: unknown, style: unknown, ranges: unknown[]): unknown;
  addTop10Rule(direction: number, rank: number, style: unknown, ranges: unknown[], isPercent: boolean): unknown;
  addAverageRule(type: number, style: unknown, ranges: unknown[]): unknown;
  addUniqueRule(style: unknown, ranges: unknown[]): unknown;
  addDuplicateRule(style: unknown, ranges: unknown[]): unknown;
  addRowStateRule(state: number, style: unknown, ranges: unknown[]): unknown;
  addColumnStateRule(state: number, style: unknown, ranges: unknown[]): unknown;
}
export function conditionFormatsOf(sheet: Worksheet): ConditionalFormatsInternals {
  return extendView<ConditionalFormatsInternals, Worksheet['conditionalFormats']>(sheet.conditionalFormats);
}

/* ---------------------------------------------------------- pivot views --- */

/**
 * `sheet.pivotTables` viewed with what the Slicer gallery and the context menu
 * read: `getRange()` reports the `page` header block as `null` when the pivot
 * has no report filter, and the source-field records carry the trial's
 * `caption`/`fieldName` (the contract's `ISourceFieldInfo` lists only `name`).
 */
export interface PivotSourceFieldView { name?: string; caption?: string; fieldName?: string }
export interface PivotTableView {
  name(): string;
  getRange(): { page?: { row: number; col: number; rowCount: number; colCount: number } | null; content: { row: number; col: number; rowCount: number; colCount: number } };
  getSourceFields?(): PivotSourceFieldView[];
}
export interface PivotTableManagerView { all(): PivotTableView[] }
export function pivotTablesOf(sheet: Worksheet): PivotTableManagerView {
  // A plain mock sheet (unit tests) may omit the pivot add-on entirely.
  const manager = sheet.pivotTables;
  return manager === undefined ? { all: () => [] } : extendView<PivotTableManagerView, typeof manager>(manager);
}

/** `sheet.slicers.add` viewed with the plain `{x,y}` position our core accepts (the contract types the `position` parameter as a `Point` instance). */
export interface SlicerView { position?(value?: { x: number; y: number }): unknown }
export interface SlicerCollectionWriter {
  add(name: string, target: string, item: string, style?: unknown, type?: unknown): SlicerView;
}
export function slicerWriter(sheet: Worksheet): SlicerCollectionWriter & Worksheet['slicers'] {
  return extendView<SlicerCollectionWriter, Worksheet['slicers']>(sheet.slicers);
}

/* ------------------------------------------------------- pivot internals --- */

/**
 * Internal pivot-table members the designer's Field Settings dialog round-trips
 * the number format through: our core stores the per-field format string behind
 * `_fieldFormatter` (the contract exposes no per-field format accessor).
 */
export interface PivotInternals {
  _fieldFormatter?(fieldName: string, formatter?: string | null): string | undefined;
}
export function pivotInternals(pivot: GC.Spread.Pivot.PivotTable): PivotInternals & GC.Spread.Pivot.PivotTable {
  return extendView<PivotInternals, GC.Spread.Pivot.PivotTable>(pivot);
}

/**
 * The `Spread.Pivot` namespace viewed with the entries the designer looks up by
 * string: `PivotPanel` (the built-in field-list panel the panel host mounts) and
 * `PivotTableThemes` (the built-in gallery the PivotTable Styles menu tiles, read
 * as a name -> theme record). Both are installed by the pivot add-on and are not
 * listed by the designer's core contract import.
 */
export interface PivotNamespaceExtras {
  PivotPanel?: unknown;
}
export function pivotNamespace(gc: GCRoot): PivotNamespaceExtras & GCRoot['Spread']['Pivot'] {
  return extendView<PivotNamespaceExtras, GCRoot['Spread']['Pivot']>(gc.Spread.Pivot);
}

/**
 * One built-in pivot-table style as the PivotTable Styles gallery reads it. The
 * contract's `PivotTableThemes` exposes its entries as `static` class members
 * (not an indexable record), so the gallery enumerates the holder object and
 * reads each theme's `name()` / `toJSON()` through this view.
 */
export interface PivotThemeView { name(): string; toJSON(): Record<string, unknown> }
export function pivotTableThemes(gc: GCRoot): Record<string, PivotThemeView | undefined> {
  return extendView<Record<string, PivotThemeView | undefined>, GCRoot['Spread']['Pivot']['PivotTableThemes']>(gc.Spread.Pivot.PivotTableThemes);
}

/**
 * The active sheet's theme color scheme (the public `sheet.currentTheme().colors()`
 * surface, whose `getColor(name)` resolves accent/text names to `#RRGGBB`). Returns
 * `null` on a sheet whose theme has not loaded yet so the galleries fall back to the
 * base palette.
 */
export function themeColors(sheet: Worksheet): GC.Spread.Sheets.ColorScheme | null {
  const theme = sheet.currentTheme();
  if (!theme || typeof theme.colors !== 'function') return null;
  const colors = theme.colors() as GC.Spread.Sheets.ColorScheme | undefined;
  return colors && typeof colors.getColor === 'function' ? colors : null;
}

/** `DataValidation.createNumberValidator` viewed with the `null` second bound the core accepts. */
export interface NumberValidatorFactory {
  createNumberValidator(
    typeOperator: GC.Spread.Sheets.ConditionalFormatting.ComparisonOperators,
    v1: unknown, v2?: unknown, isIntegerValue?: boolean,
  ): DataValidator;
}
export function dataValidationFactory(gc: GCRoot): NumberValidatorFactory & GCRoot['Spread']['Sheets']['DataValidation'] {
  return extendView<NumberValidatorFactory, GCRoot['Spread']['Sheets']['DataValidation']>(gc.Spread.Sheets.DataValidation);
}

/**
 * `Style` constructor as our core implements it: besides the contract's
 * positional parameters it accepts a single plain-options record.
 */
export function createStyle(gc: GCRoot, options: Record<string, unknown>): Style {
  const Ctor = gc.Spread.Sheets.Style as (new (options: Record<string, unknown>) => Style) & typeof gc.Spread.Sheets.Style;
  return new Ctor(options);
}

/** A fresh empty `Style` from the core the designer runs against (the gallery/paste paths build one and assign the record onto it). */
export function newStyle(gc: GCRoot): Style {
  return createStyle(gc, {});
}

/**
 * The `CellTypes` namespace viewed as a name -> constructor record: the Cell Types gallery
 * resolves the built-in and add-in-registered types by their class name (the contract
 * declares each class individually, which a dynamic lookup cannot index).
 */
export interface CellTypesRecord { [name: string]: (new () => unknown) | undefined }
export function cellTypesNamespace(gc: GCRoot): CellTypesRecord {
  const ns = gc.Spread?.Sheets?.CellTypes ?? {};
  return extendView<CellTypesRecord, object>(ns);
}
