import { tableSheetCommands } from './tablesheet/commands.js';
import { TableSheet, isDefaultRowActionOptions, tableSheetDefaultOptions, tableViewStyleRules } from './tablesheet/index.js';
import { GanttSheet } from './gantt/sheet/index.js';
import { ReportSheet } from './report/index.js';
import { DataManager, type View } from './data/index.js';
import { NamedCellTemplatesManager } from './named-cell-templates.js';
/**
 * The workbook model: sheet collection and active tab, workbook options,
 * commands/undo, calculation service and serialization. Split out of
 * `model.ts` unchanged; the Worksheet class lives in `worksheet.ts`.
 */
import { ContextMenu } from './features/context-menu.js';
import { createWorkbookTouchToolStrip, TouchToolStrip } from './touch.js';
import { Collaboration } from './collaboration.js';
import { WorkbookRenderer } from './rendering.js';
import { instanceProperties, notImplemented } from './not-implemented.js';
import { clone, NameInfo, Style } from './primitives.js';
import { Condition } from './features/conditions.js';
import { Events, EventHub, type EventHandler, type EventInfo } from './events.js';
import { CommandManager, UndoManager } from './commands.js';
import type { Command } from './commands.js';
import { commandConstants } from './command-constants.js';
import { printWorkbook } from './print-doc.js';
import { WorksheetPaginator } from './print.js';
import { saveWorkbookPdf, type SavePdfOptions } from './pdf/export.js';
import { Worksheet } from './worksheet.js';
import { CalcEngine } from './calc/engine.js';
import { assertCustomFunction } from './calc/functions-api.js';
import { INVALID_CUSTOM_NAME, assertCustomName, assertNameFormula } from './calc/custom-names.js';
import type { CellsInfo } from './calc/engine-introspect.js';
import { ExternalReferenceStore } from './external-refs.js';
import { SearchCondition, SearchResult, searchWorkbook } from './search.js';
import { CustomTableThemeManager, TableTheme, TableThemes, themeByName } from './features/tables.js';
import { CustomPivotTableThemeManager, PivotTableTheme } from './pivot/theme.js';
import { SlicerStyle, TimelineStyle, SlicerStyles, TimelineStyles } from './features/slicers/styles.js';
import { GC } from './generated/enums.js';
import { ScenarioManager } from './features/scenarios.js';
import { BarcodeExValue, SparklineExValue } from './calc/values.js';
import { addSparklineExTo, registeredSparklineFor, removeSparklineExFrom, serializedSparklineExs, type SparklineExObject, type SparklineFunctionEntry } from './features/sparkline-ex.js';
import { DocProps, SheetTabStyleManager } from './features/workbook-managers.js';
import { registerWorkbookHost, unregisterWorkbookHost } from './features/controls.js';
import { attachHostMarkers, detachHostMarkers } from './features/host-markers.js';
import {
  list,
  mergeOptions,
  object,
  optionDifferences,
  serializeValue,
  styleFromJSON,
  styleToJSON,
  type JsonRecord,
} from './serialization.js';
import workbookDefaults from './workbook-defaults.json';
import {
  type LiveWorkbookOptions,
  type SerializationOptions,
  type WorkbookOptions,
  Batching,
  count,
} from './sheet-common.js';

/**
 * Sheet tabs are the workbook's `TableSheet` (which covers `GanttSheet`) and
 * `ReportSheet` entries; plain worksheets are not sheet tabs.
 */
export type SheetTab = TableSheet | ReportSheet;
/** True when the sheet is one of the workbook's sheet tabs (worksheets are not). */
const isTabSheet = (sheet: Worksheet | undefined): sheet is SheetTab =>
  sheet instanceof TableSheet || sheet instanceof ReportSheet;


function defaultMetadata(): JsonRecord {
  return {
    users: [
      {
        id: `{${(
          globalThis.crypto?.randomUUID?.() ??
          'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
            const n = Math.floor(Math.random() * 16);
            return (c === 'x' ? n : (n & 3) | 8).toString(16);
          })
        ).toUpperCase()}}`,
        name: 'Guest',
        color: '#26A69A',
      },
    ],
    sheetTabCount: 0,
    namedPatterns: {},
    scenarioAdditionalInfo: { appliedScenarios: {}, baseValues: {} },
    dataManager: { tables: [], relationships: [] },
  };
}

export class Workbook {
  readonly namedCellTemplates = new NamedCellTemplatesManager();
  contextMenu = new ContextMenu();
  /**
   * The workbook touch toolstrip (`spread.touch_toolbar` in the official docs);
   * created with the host. Trial pre-populates Paste/Cut/Copy + separator +
   * AutoFill (probe `touch:default-items2`). Declared via a prototype accessor
   * (instanceProperties) so headless instances expose `undefined` while hosted
   * workbooks shadow it with the real strip, like other declared data members.
   */
  declare touchToolStrip: TouchToolStrip | undefined;
  /** `nextControl`/`previousControl` targets focused by the `select*Control` commands. */
  private _nextControlEl: HTMLElement | undefined;
  private _previousControlEl: HTMLElement | undefined;
  sheets: Worksheet[] = [];
  readonly options: LiveWorkbookOptions;
  name = '';
  /** The workbook's document properties (`docProps.coreDocProps`, `customDocPropsManager`). */
  readonly docProps = new DocProps(this);
  /** The workbook's per-sheet tab styles (`sheetTabStyles.add/all/remove/clear`). */
  readonly sheetTabStyles = new SheetTabStyleManager(this);
  /** Custom table themes (`customTableThemes.add/all/get/remove/update`). */
  readonly customTableThemes = new CustomTableThemeManager(this);
  /** Custom pivot themes (`customPivotTableThemes.add/all/get/remove/update`). */
  readonly customPivotTableThemes = new CustomPivotTableThemeManager(this);
  /** TASK 46: workbook.defaultPivotTableTheme/defaultSlicerTheme/defaultTimelineTheme storage. */
  private _defaultThemes: { pivot?: PivotTableTheme | string; slicer?: SlicerStyle | string; timeline?: TimelineStyle | string } = {};
  /** TASK 46: workbook.injectAI configuration (no request is issued offline). */
  private _aiSettings: unknown;
  /**
   * The workbook collaboration manager (`spread.collaboration`). Offline model
   * semantics only — see src/collaboration.ts and docs/STATUS.md (add-on-only
   * in the trial runtime).
   */
  readonly collaboration = new Collaboration(this);
  /** Workbook scenarios (`scenarioManager.all/apply/get/getAppliedScenarios/getBaseValues/remove/restore/set/setActiveScenario`). */
  readonly scenarioManager = new ScenarioManager(this);
  /** Hot-path flag mirroring `scenarioManager` capture state (read by the value write path). */
  _scenariosCapturing = false;
  /** `defaultTableTheme()` result: `undefined` until a name is set, `null` for an unknown one. */
  private defaultTheme: TableTheme | null | undefined;
  private host?: HTMLElement;
  private addedHostClass = false;
  private destroyed = false;
  private renderer?: WorkbookRenderer;
  private active = 0;
  private start = 0;
  /** Monotonic per-workbook counter driving generated Sheet<N> names (mirrors the trial). */
  private nameCounter = 0;
  private events = new EventHub(this);
  private batch = new Batching();
  private history = new UndoManager();
  private manager: CommandManager;
  private namedStyles = new Map<string, Style>();
  private names = new Map<string, NameInfo>();
  private extraJSON: JsonRecord = defaultMetadata();
  private calc?: CalcEngine;
  /** Workbooks the formulas of this workbook read (`=[Book1.xlsx]Sheet1!A1`). */
  private externalRefs = new ExternalReferenceStore();
  constructor(host?: HTMLElement | string, options: WorkbookOptions = {}) {
    const sheetCount = options.sheetCount ?? 1;
    count(sheetCount);
    this.options = new Proxy(Object.assign(clone(workbookDefaults), options), {
      set: (target, key, value) => {
        Reflect.set(target, key, value);
        if (key === 'referenceStyle' || key === 'allowDynamicArray') this.calc?.optionsChanged();
        this.invalidateLayout();
        return true;
      },
    });
    delete this.options.sheetCount;
    if (typeof host === 'string') {
      const element = typeof document === 'undefined' ? null : document.getElementById(host);
      if (!element) throw new Error(`Workbook host not found: ${host}`);
      this.host = element;
    } else this.host = host;
    if (this.host) {
      this.addedHostClass = !this.host.classList.contains('opensheets-host');
      this.host.classList.add('opensheets-host');
      // Trial parity (TASK 53 item 2): the trial marks the host with `gc-no-user-select` and an
      // inline `overflow: visible`; see src/features/host-markers.ts for the measurements.
      attachHostMarkers(this.host);
      // `GC.Spread.Sheets.findControl(host)` resolves the outermost host element
      // (trial probe core46q); first registration wins, like the trial `twoWb:"first"`.
      registerWorkbookHost(this.host, this);
    }
    this.calc = new CalcEngine(this);
    this.manager = new CommandManager(this);
    // Built-in `GC.Spread.Sheets.Commands` constants (TASK 44): registered at
    // workbook level so `commandManager().execute({ cmd })` works headless;
    // the interactive view re-registers the names it owns (navigation, Delete,
    // Ctrl+Z, ...) when a renderer is attached.
    for (const [name, command] of Object.entries(commandConstants)) this.manager.register(name, command as Command);
    for (const [name, command] of Object.entries(tableSheetCommands)) this.manager.register(name, command);
    this.setSheetCount(sheetCount);
    this.events.unbindAll();
    if (this.host && typeof CanvasRenderingContext2D !== 'undefined') {
      this.renderer = new WorkbookRenderer(this, this.host);
      this.batch.onInvalidate = layout => this.renderer?.schedule(layout);
    }
    if (this.host) this.touchToolStrip = createWorkbookTouchToolStrip(this, this.host);
  }
  _renderer(): WorkbookRenderer | undefined { return this.renderer; }
  _formulaFunctionNames(sheet: Worksheet): string[] { return this.calc?.formulaFunctionNames(sheet) ?? []; }
  _calcEngine(): CalcEngine | undefined { return this.calc; }
  calculate(type = 0, address?: string): void { this.calc?.calculate(type, address); }
  addCustomFunction(fn: import('./calc/functions-api.js').CalcFunction): void {
    assertCustomFunction(fn);
    this.calc?.addFunction(fn);
  }
  getCustomFunction(name: string): unknown {
    // The trial's workbook getter only sees workbook-scope registrations.
    return this.calc?.getWorkbookFunction?.(name);
  }
  removeCustomFunction(name: string): void {
    this.calc?.removeCustomFunction?.(name);
  }
  clearCustomFunctions(): void {
    this.calc?.clearFunctions?.();
  }
  /**
   * Registers a SparklineEx instance. Its `createFunction()` result becomes
   * callable from formulas (the trial keeps these registrations out of the
   * workbook custom-function table). `removeSparklineEx` takes the function or
   * type name.
   */
  addSparklineEx(sparklineEx: SparklineExObject): void {
    addSparklineExTo(this, sparklineEx);
    const fn = sparklineEx.createFunction?.();
    if (!fn) return;
    const name = String(fn.name ?? sparklineEx.name() ?? '');
    if (!name) return;
    const registered: SparklineFunctionEntry = {
      name,
      minArgs: fn.minArgs,
      maxArgs: fn.maxArgs,
      sparkline: sparklineEx,
      evaluate: (...args: unknown[]) => {
        const value = fn.evaluate(...args);
        if (value instanceof SparklineExValue || value instanceof BarcodeExValue) return value;
        return new SparklineExValue(name, (value && typeof value === 'object' ? value : { value }) as Record<string, unknown>);
      },
    };
    for (const flag of ['acceptsArray', 'acceptsReference', 'acceptsError', 'acceptsMissingArgument', 'isBranch', 'isContextSensitive', 'isVolatile', 'findTestArgument', 'findBranchArgument'] as const) {
      const source = (fn as unknown as Record<string, unknown>)[flag];
      if (typeof source === 'function') (registered as unknown as Record<string, unknown>)[flag] = source.bind(fn);
    }
    this.calc?.addSparklineFunction?.(registered);
  }
  removeSparklineEx(name: string): void {
    for (const sparkline of removeSparklineExFrom(this, name)) {
      const key = String(sparkline.name?.() ?? name);
      this.calc?.removeSparklineFunction?.(key);
    }
  }
  /** The registered SparklineEx whose formula value paints this cell. */
  _sparklineFor(name: string): SparklineExObject | undefined {
    return registeredSparklineFor(this, name);
  }
 /**
   * The other workbooks this workbook's formulas read. Without the detail flag
   * the trial answers only `{ name, filePath }`; with it each entry also lists
   * the reading cell (`target`) and the range it reads (`source`).
   */
  getExternalReferences(includeItemDetail?: boolean): {
    name: string;
    filePath: string;
    items?: {
      target: { row: number; col: number; sheetName: string };
      source: { row: number; col: number; rowCount: number; colCount: number; sheetName: string };
    }[];
  }[] {
    return this.externalRefs.entries().map((entry) => ({
      name: entry.name,
      filePath: entry.path,
      ...(includeItemDetail ? { items: entry.items.map((item) => ({ target: { ...item.target }, source: { ...item.source } })) } : {}),
    }));
  }
  /**
   * Loads values for a referenced workbook. `linkInfo` is either the workbook
   * name or a `{ name: sheetPayloads }` map; a sheet payload is a rectangular
   * array of values or a sparse `{ row: { column: value } }` map. With
   * `isMergeUpdate` the cells the payload does not mention keep their values.
   */
  updateExternalReference(
    linkInfo: string | Record<string, unknown>,
    data?: object,
    filePath?: string,
    isMergeUpdate?: boolean,
  ): void {
    const changed = new Set<string>();
    if (typeof linkInfo === 'string') {
      if (this.externalRefs.update(linkInfo, data, filePath, Boolean(isMergeUpdate))) changed.add(linkInfo);
    } else {
      for (const [name, payload] of Object.entries(linkInfo ?? {}))
        if (this.externalRefs.update(name, payload, undefined, Boolean(isMergeUpdate))) changed.add(name);
    }
    for (const name of changed) this.calc?.externalValuesChanged?.(name);
    // The trial recalculates the formulas that read a referenced workbook as soon
    // as new values for it are loaded - no explicit `calculate()` is needed.
    if (changed.size && !this._isCalcSuspended()) {
      let batching = false;
      for (const sheet of this.sheets) if (sheet.batch.calc) { batching = true; break; }
      if (!batching) this.calc?.recalculate(undefined, false);
    }
  }
  /** Calculation-side accessor of the external reference record. */
  _externalReferences(): ExternalReferenceStore {
    return this.externalRefs;
  }
  /** Cells the calculation engine currently treats as a circular reference. */
  getCircularReference(): CellsInfo[] {
    return this.calc?.circularReferences() ?? [];
  }
  /** Searches every sheet the condition allows, in workbook order. */
  search(searchCondition: SearchCondition): SearchResult {
    if (searchCondition === undefined || searchCondition === null) return null as unknown as SearchResult;
    return searchWorkbook(this, searchCondition);
  }
  /**
   * Resolves after the calculation service has no pending work left.
   * The trial resolves with `undefined`; calculations are synchronous in our
   * engine, so the promise settles on the next microtask after the flush.
   */
  waitForAllCalculations(): Promise<void> {
    const engine = this.calc;
    return new Promise<void>((resolve) => {
      queueMicrotask(() => {
        try {
          // Flush what the calculation service still has queued. The trial does
          // not restart finished work: an iterative cycle keeps its value.
          if (engine && engine.pending.length) engine.recalculate();
        } catch {
          // A failing recalculation must not reject the wait.
        }
        resolve();
      });
    });
  }
  private assertAlive(): void {
    if (this.destroyed) throw new Error('Workbook has been destroyed');
  }
  /**
   * The trial writes a boolean `isSelected` into every sheet whenever the active
   * sheet changes, so a raw value stored with `isSelected(1)` is replaced by the
   * real selection state on the next sheet switch.
   */
  private _syncSheetSelection(): void {
    const active = this.sheets[this.active];
    for (const sheet of this.sheets) sheet.settings.isSelected = sheet === active;
  }
  getHost(): HTMLElement {
    return this.host!;
  }
  private dataManagerInstance = new DataManager();
  dataManager(): DataManager { return this.dataManagerInstance; }
  /** The sheet tabs in strip order. */
  private tabSheets(): SheetTab[] { return this.sheets.filter(isTabSheet); }
  /**
   * Adds a sheet tab (`TableSheet`, `GanttSheet` or `ReportSheet`) at tab index
   * `index` and returns it. The trial keeps the tab collection separate from
   * the worksheets: `index` counts sheet tabs, not the sheet strip, and the new
   * tab only becomes the active entry when no sheet tab was active before.
   */
  addSheetTab(index: number, name: string, type: number): Worksheet {
    if (type !== 0 && type !== 1 && type !== 3) throw new Error(`NotImplemented: SheetType ${type}`);
    const sheet = type === 3 ? new ReportSheet(name, this.dataManagerInstance)
      : type === 1 ? new GanttSheet(name) : new TableSheet(name);
    const tabs = this.tabSheets();
    const at = index >= 0 && index < tabs.length ? this.sheets.indexOf(tabs[index]!) : this.sheets.length;
    // The trial does not fire workbook events when a sheet tab is added.
    this.suspendEvent();
    try {
      this.addSheet(at, sheet);
    } finally {
      this.resumeEvent();
    }
    if (!isTabSheet(this.sheets[this.active])) this.active = this.sheets.indexOf(sheet);
    return sheet;
  }
  /** The sheet tab at `index` (or with this name), `null` when there is none. */
  getSheetTab(indexOrName: number | string): SheetTab | null {
    const tabs = this.tabSheets();
    if (typeof indexOrName === 'number')
      return indexOrName >= 0 && indexOrName < tabs.length ? tabs[indexOrName] : null;
    return tabs.find((sheet) => sheet.name().toLowerCase() === String(indexOrName).toLowerCase()) ?? null;
  }
  /** Number of sheet tabs; worksheets are not sheet tabs (trial `getSheetTabCount`). */
  getSheetTabCount(): number { return this.tabSheets().length; }
  /** Index of the named sheet tab in the tab collection, `null` for worksheets and unknown names. */
  getSheetTabIndex(name: string): number {
    const index = this.tabSheets()
      .findIndex((sheet) => sheet.name().toLowerCase() === String(name).toLowerCase());
    // The trial answers `null` here, although the declaration types the result as a number.
    return index < 0 ? (null as unknown as number) : index;
  }
  /** Position of the named worksheet or sheet tab in the sheet strip, -1 when it is unknown. */
  getSheetPosition(name: string): number {
    return this.sheets.findIndex((sheet) => sheet.name().toLowerCase() === String(name).toLowerCase());
  }
  /**
   * Moves the named worksheet or sheet tab to position `target` of the sheet
   * strip. Like the trial, worksheets and sheet tabs share the strip positions,
   * and the answer is `true` only when something actually moved: unknown names,
   * positions outside the strip and the position the entry already has all
   * answer `false`.
   */
  changeSheetPosition(name: string, target: number): boolean {
    const index = this.sheets.findIndex((sheet) => sheet.name().toLowerCase() === String(name).toLowerCase());
    if (index < 0 || !Number.isInteger(target) || target < 0 || target >= this.sheets.length) return false;
    if (index === target) return false;
    const active = this.sheets[this.active];
    const [sheet] = this.sheets.splice(index, 1);
    this.sheets.splice(target, 0, sheet);
    this.active = active ? Math.max(0, this.sheets.indexOf(active)) : this.active;
    this.start = Math.min(this.start, Math.max(0, this.sheets.length - 1));
    this.invalidateLayout();
    return true;
  }
  /**
   * The active sheet tab: the tab object when a sheet tab is active, `undefined`
   * when a worksheet is active and the workbook has sheet tabs, `null` when it
   * has none (trial `getActiveSheetTab`).
   */
  getActiveSheetTab(): SheetTab | null | undefined {
    const active = this.sheets[this.active];
    if (isTabSheet(active)) return active;
    return this.tabSheets().length ? undefined : null;
  }
  /** Index of the active sheet tab in the tab collection, -1 while a worksheet is active. */
  getActiveSheetTabIndex(): number {
    const active = this.sheets[this.active];
    if (!isTabSheet(active)) return -1;
    return this.tabSheets().indexOf(active);
  }
  /**
   * Makes the sheet tab at `indexOrName` the active entry of the sheet strip.
   * Invalid indexes and unknown names do nothing (trial `setActiveSheetTab`).
   */
  setActiveSheetTab(indexOrName: number | string): void {
    const tabs = this.tabSheets();
    const tab = typeof indexOrName === 'number'
      ? indexOrName >= 0 && indexOrName < tabs.length ? tabs[indexOrName] : undefined
      : tabs.find((sheet) => sheet.name().toLowerCase() === String(indexOrName).toLowerCase());
    if (!tab) return;
    const index = this.sheets.indexOf(tab);
    if (index === this.active) return;
    this.active = index;
    this.start = Math.min(this.start, Math.max(0, this.sheets.length - 1));
    this.invalidateLayout();
  }
  /**
   * Removes every sheet tab, keeping the worksheets (trial `clearSheetTabs`).
   * The trial leaves no active entry behind; ours re-activates the first
   * remaining worksheet because our renderer always needs an active sheet.
   */
  /**
   * Gets or sets the table theme new tables use. With no argument the current
   * default is answered: `undefined` until a name is set, and `null` after a name
   * that resolves to no theme (`defaultTableTheme('nope1')` in the trial answers
   * `null` from then on). A name resolves case-insensitively against the built-in
   * `TableThemes` first and the workbook's `customTableThemes` second; a
   * non-string argument fails inside the trial, which lower-cases it.
   */
  defaultTableTheme(): TableTheme | null | undefined;
  defaultTableTheme(themeName: string): void;
  defaultTableTheme(themeName?: string): TableTheme | null | undefined {
    if (themeName === undefined) return this.defaultTheme;
    const name = (themeName as unknown as string).toLowerCase();
    const found = themeByName(name) ?? this.customTableThemes.get(name);
    this.defaultTheme = found ?? null;
    return undefined;
  }
  clearSheetTabs(): void {
    const tabs = this.tabSheets();
    if (!tabs.length) return;
    const active = this.sheets[this.active];
    for (const tab of tabs) {
      const wasAttached = tab.getParent?.() === this;
      tab._attach();
      if (wasAttached) this.calc?.sheetRemoved(tab);
    }
    const removed = new Set<Worksheet>(tabs);
    const index = this.sheets.indexOf(active);
    this.sheets.splice(0, this.sheets.length, ...this.sheets.filter((sheet) => !removed.has(sheet)));
    this.active = index >= 0 && index < this.sheets.length ? index : Math.min(this.active, this.sheets.length - 1);
    this.start = Math.min(this.start, Math.max(0, this.sheets.length - 1));
    this.invalidateLayout();
  }
  removeSheetTab(indexOrName: number | string): void {
    const tabs = this.tabSheets();
    const tab = typeof indexOrName === 'number'
      ? indexOrName >= 0 && indexOrName < tabs.length ? tabs[indexOrName] : undefined
      : tabs.find((sheet) => sheet.name().toLowerCase() === String(indexOrName).toLowerCase());
    // The trial rejects both an unknown index and an unknown name the same way.
    if (!tab) throw new Error('Index is out of range!');
    this.removeSheet(this.sheets.indexOf(tab));
  }
  getSheet(index: number): Worksheet {
    this.assertAlive();
    return this.sheets[index]!;
  }
  getSheetCount(): number {
    return this.sheets.length;
  }
  /**
   * Prints the sheet at `sheetIndex` through the browser print pipeline, or
   * every visible sheet when the index is omitted (public `Workbook.print`).
   */
  print(sheetIndex?: number): void {
    printWorkbook(this, sheetIndex);
  }
  /**
   * Exports the print pages as a vector PDF and passes the bytes to
   * `successCallback` as an `application/pdf` blob (public
   * `Workbook.savePDF`). `sheetIndex` omitted exports every visible sheet;
   * `options` fills the document's Info dictionary. Failures are reported
   * through `errorCallback` with `{ errorCode, errorMessage }`.
   */
  savePDF(
    successCallback: (blob: Blob) => void,
    errorCallback?: (error: { errorCode: number; errorMessage: string }) => void,
    options?: SavePdfOptions,
    sheetIndex?: number,
  ): void {
    saveWorkbookPdf(this, successCallback, errorCallback, options, sheetIndex);
  }
  getSheetFromName(name: string): Worksheet {
    return this.sheets.find((s) => s.name().toLowerCase() === name.toLowerCase())!;
  }
  getSheetIndex(name: string): number {
    return this.sheets.findIndex((s) => s.name().toLowerCase() === name.toLowerCase());
  }
  addSheet(index: number, sheet?: Worksheet): void {
    this.assertAlive();
    if (!Number.isInteger(index) || index < 0 || index > this.sheets.length)
      throw new RangeError('Invalid sheet index');
    if (sheet?.getParent() && sheet.getParent() !== this)
      throw new Error('Worksheet already belongs to a workbook');
    // The trial keeps a monotonic per-workbook counter: generated names continue after deletions.
    this.nameCounter += 1;
    if (!sheet) {
      let suffix = this.nameCounter;
      while (this.getSheetFromName(`Sheet${suffix}`)) suffix++;
      this.nameCounter = suffix;
      sheet = new Worksheet(`Sheet${suffix}`);
    }
    if (this.getSheetFromName(sheet.name())) throw new Error('Worksheet name already exists');
    const active = this.sheets[this.active];
    this.sheets.splice(index, 0, sheet);
    sheet._attach(this);
    if (active) this.active = this.sheets.indexOf(active);
    else this.active = 0;
    this._emit(Events.SheetChanged, {
      sheetName: sheet.name(),
      sheetIndex: index,
      propertyName: 'insertSheet',
    });
    this._syncSheetSelection();
    this.invalidateLayout();
  }
  removeSheet(index: number): void {
    this.assertAlive();
    if (index < 0 || index >= this.sheets.length) return;
    const sheet = this.sheets[index],
      oldActive = this.getActiveSheet();
    const info = { sheetName: sheet.name(), sheetIndex: index, propertyName: 'removeSheet', cancel: false };
    this._emit(Events.SheetChanging, info);
    if (info.cancel) return;
    this.sheets.splice(index, 1);
    const wasAttached = sheet.getParent?.() === this;
    sheet._attach();
    if (wasAttached) this.calc?.sheetRemoved(sheet);
    this.active =
      oldActive === sheet
        ? Math.min(index, this.sheets.length - 1)
        : Math.max(0, this.sheets.indexOf(oldActive));
    this.start = Math.min(this.start, Math.max(0, this.sheets.length - 1));
    this._emit(Events.SheetChanged, {
      sheetName: sheet.name(),
      sheetIndex: index,
      propertyName: 'removeSheet',
    });
    this._syncSheetSelection();
    this.invalidateLayout();
  }
  setSheetCount(value: number): void {
    count(value);
    while (this.sheets.length > value) {
      const before = this.sheets.length;
      this.removeSheet(before - 1);
      if (this.sheets.length === before) break;
    }
    while (this.sheets.length < value) this.addSheet(this.sheets.length);
    if (!value) this.active = 0;
    this._syncSheetSelection();
  }
  clearSheets(): void {
    this.setSheetCount(0);
  }
  /** The DOM element hosting this workbook (same name the trial exposes). */
  get el(): HTMLElement | undefined { return this.host; }
  /**
   * Hit-tests workbook-relative pixels (like the trial's `Workbook#hitTest`).
   * Returns `worksheetHitInfo` (with `hitTestType`: 0 corner, 1 colHeader, 2 rowHeader, 3 viewport),
   * `floatingObjectHitInfo`/`shapeHitInfo` for charts/shapes/pictures and `tabStripHitInfo` for sheet tabs.
   */
  hitTest(x: number, y: number): JsonRecord {
    const result: JsonRecord = { x, y };
    const view = this.renderer;
    if (!view || typeof document === 'undefined') return result;
    const hostRect = (this.host ?? view.root).getBoundingClientRect();
    const clientX = hostRect.left + x, clientY = hostRect.top + y;
    const sheet = this.getActiveSheet();
    if (sheet) {
      const objects = [...sheet.floatingObjects.all(), ...sheet.pictures.all(), ...sheet.shapes.all(), ...sheet.charts.all()];
      for (const object of objects) {
        let hit = false;
        let elements: Iterable<HTMLElement> | null = null;
        try {
          elements = object.getHost();
        } catch {
          // The v17+ charts plugin removes getHost() (throws by design, like the official package).
          // Fall back to the object's model rectangle (canvas-origin px), which is what the host element
          // would have reported; the trial's hitTest likewise keeps working with charts on the sheet.
          elements = null;
        }
        if (elements) {
          for (const element of elements) {
            const rect = element.getBoundingClientRect();
            if (rect.width && rect.height && clientX >= rect.left && clientX < rect.right && clientY >= rect.top && clientY < rect.bottom) {
              result.floatingObjectHitInfo = { x: clientX - rect.left, y: clientY - rect.top, floatingObject: object };
              result.shapeHitInfo = { x: clientX - rect.left, y: clientY - rect.top, shape: object };
              hit = true;
              break;
            }
          }
          if (hit) return result;
          continue;
        }
        const overlay = view.overlay.getBoundingClientRect();
        const left = overlay.left + Number((object as { x?: () => number }).x?.() ?? NaN);
        const top = overlay.top + Number((object as { y?: () => number }).y?.() ?? NaN);
        const right = left + Number((object as { width?: () => number }).width?.() ?? 0);
        const bottom = top + Number((object as { height?: () => number }).height?.() ?? 0);
        if (right > left && bottom > top && clientX >= left && clientX < right && clientY >= top && clientY < bottom) {
          result.floatingObjectHitInfo = { x: clientX - left, y: clientY - top, floatingObject: object };
          result.shapeHitInfo = { x: clientX - left, y: clientY - top, shape: object };
          return result;
        }
      }
    }
    const overlayRect = view.overlay.getBoundingClientRect();
    const hit = view.hitTest(clientX - overlayRect.left, clientY - overlayRect.top);
    if (hit) {
      result.sheet = sheet;
      result.worksheetHitInfo = { x: clientX - overlayRect.left, y: clientY - overlayRect.top, row: hit.row, col: hit.col, rowViewportIndex: 0, colViewportIndex: 0, hitTestType: hit.sheetArea };
      return result;
    }
    const tabRect = view.tabs.getBoundingClientRect();
    if (clientX >= tabRect.left && clientX < tabRect.right && clientY >= tabRect.top && clientY < tabRect.bottom) {
      const along = view.tabVertical ? clientY - tabRect.top : clientX - tabRect.left;
      const across = view.tabVertical ? clientX - tabRect.left : clientY - tabRect.top;
      for (let i = view.tabHits.length - 1; i >= 0; i--) {
        const tab = view.tabHits[i];
        if (along < tab.x || along >= tab.x + tab.width) continue;
        if (tab.cross && (across < tab.cross[0] || across >= tab.cross[1])) continue;
        const target = tab.index >= 0 ? this.sheets[tab.index] : sheet;
        result.tabStripHitInfo = tab.index < 0
          ? { navButton: tab.index === -2 ? 'prev' : tab.index === -3 ? 'next' : tab.index === -4 ? 'more' : 'menu', x: clientX - tabRect.left, y: clientY - tabRect.top }
          : { sheetTab: { sheetName: target?.name() ?? '', sheetIndex: tab.index }, x: clientX - tabRect.left, y: clientY - tabRect.top };
        return result;
      }
    }
    return result;
  }
  getActiveSheet(): Worksheet {
    return this.getSheet(this.active);
  }
  getActiveSheetIndex(): number {
    return this.active;
  }
  setActiveSheet(sheet: string | number | Worksheet): void {
    // Official accepts a name, an index or a Worksheet instance at runtime.
    const index = typeof sheet === 'number' ? sheet : typeof sheet === 'string' ? this.getSheetIndex(sheet) : this.sheets.indexOf(sheet);
    if (index >= 0) this.setActiveSheetIndex(index);
  }
  setActiveSheetIndex(index: number): void {
    this.assertAlive();
    if (!Number.isInteger(index) || index < 0 || index >= this.sheets.length || index === this.active) return;
    const oldSheet = this.getActiveSheet(),
      newSheet = this.getSheet(index),
      info = { oldSheet, newSheet, cancel: false };
    this._emit(Events.ActiveSheetChanging, info);
    if (info.cancel) return;
    this.active = index;
    this._syncSheetSelection();
    this._emit(Events.ActiveSheetChanged, { oldSheet, newSheet });
    this.repaint();
  }
  activeSheetIndex(): number;
  activeSheetIndex(value: number): this;
  activeSheetIndex(value?: number): number | this {
    if (value === undefined) return this.active;
    this.setActiveSheetIndex(value);
    return this;
  }
  startSheetIndex(): number;
  startSheetIndex(value: number): this;
  startSheetIndex(value?: number): number | this {
    if (value === undefined) return this.start;
    // The trial keeps an out-of-range index as 0 rather than clamping it to the last sheet.
    this.start = Number.isInteger(value) && value >= 0 && value < this.sheets.length ? value : 0;
    this.repaint();
    return this;
  }
  changeSheetIndex(name: string, index: number): boolean {
    const current = this.getSheetIndex(name);
    if (current < 0 || index < 0 || index >= this.sheets.length) return false;
    const active = this.getActiveSheet();
    const [sheet] = this.sheets.splice(current, 1);
    this.sheets.splice(index, 0, sheet);
    this.active = this.sheets.indexOf(active);
    this.invalidateLayout();
    return true;
  }
  addNamedStyle(style: Style): void {
    if (typeof style.name !== 'string' || !style.name) throw new Error('Named style requires a name');
    this.namedStyles.set(style.name.toLowerCase(), style);
  }
  getNamedStyle(name: string): Style {
    return this.namedStyles.get(name.toLowerCase())!;
  }
  getNamedStyles(): Style[] {
    return [...this.namedStyles.values()];
  }
  removeNamedStyle(name: string): void {
    this.namedStyles.delete(name.toLowerCase());
  }
  /**
   * Workbook theme defaults (TASK 46 item 2): getter returns the registered theme object,
   * setter accepts a theme instance or a registered theme name. The trial core does not
   * expose these members at runtime; they appear once the pivot/slicer add-ons attach, so
   * the semantics here follow the public d.ts contract (see docs/STATUS.md).
   */
  defaultPivotTableTheme(): PivotTableTheme | undefined;
  defaultPivotTableTheme(themeName: string | PivotTableTheme | null): void;
  defaultPivotTableTheme(value?: string | PivotTableTheme | null): PivotTableTheme | undefined | void {
    if (value === undefined) return this._resolvedDefaultThemes().pivot;
    this._defaultThemes.pivot = value === null ? undefined : value;
  }
  defaultSlicerTheme(): SlicerStyle | undefined;
  defaultSlicerTheme(themeName: string | SlicerStyle | null): void;
  defaultSlicerTheme(value?: string | SlicerStyle | null): SlicerStyle | undefined | void {
    if (value === undefined) return this._resolvedDefaultThemes().slicer;
    this._defaultThemes.slicer = value === null ? undefined : value;
  }
  defaultTimelineTheme(): TimelineStyle | undefined;
  defaultTimelineTheme(themeName: string | TimelineStyle | null): void;
  defaultTimelineTheme(value?: string | TimelineStyle | null): TimelineStyle | undefined | void {
    if (value === undefined) return this._resolvedDefaultThemes().timeline;
    this._defaultThemes.timeline = value === null ? undefined : value;
  }
  /** Resolved theme objects for serialization and the getters (TASK 46). */
  private _resolvedDefaultThemes(): { pivot?: PivotTableTheme; slicer?: SlicerStyle; timeline?: TimelineStyle } {
    const out: { pivot?: PivotTableTheme; slicer?: SlicerStyle; timeline?: TimelineStyle } = {};
    const stored = this._defaultThemes.pivot;
    if (typeof stored === 'string') {
      const custom = this.customPivotTableThemes.get(stored);
      if (custom) out.pivot = custom;
    } else if (stored) out.pivot = stored;
    const storedSlicer = this._defaultThemes.slicer;
    if (typeof storedSlicer === 'string') {
      const style = findBuiltInSlicerStyle<SlicerStyle>(SlicerStyles, storedSlicer);
      if (style) out.slicer = style;
    } else if (storedSlicer) out.slicer = storedSlicer;
    const storedTimeline = this._defaultThemes.timeline;
    if (typeof storedTimeline === 'string') {
      const style = findBuiltInSlicerStyle<TimelineStyle>(TimelineStyles, storedTimeline);
      if (style) out.timeline = style;
    } else if (storedTimeline) out.timeline = storedTimeline;
    return out;
  }
  /**
   * Print pagination information (TASK 46): `pageInfo(index)` returns
   * `{ pages: [{ row, column, rowCount, columnCount }] }` for one sheet; without an
   * argument the trial answers with the per-sheet objects of the whole workbook.
   */
  pageInfo(sheetIndex?: number): unknown {
    if (sheetIndex === undefined) return this.sheets.map(sheet => ({ pages: sheetPageInfos(sheet) }));
    if (!Number.isSafeInteger(sheetIndex) || sheetIndex < 0 || sheetIndex >= this.getSheetCount())
      // Trial message (verbatim, including the double space): 'Invalid  sheet index.'
      throw new Error('Invalid  sheet index.');
    return { pages: sheetPageInfos(this.getSheet(sheetIndex)) };
  }
  /**
   * Registers the AI request callback or environment used by AI-assisted features
   * (TASK 46 item 5). The trial core (v19.2.5) has no offline AI service: the trial
   * runtime does not expose `injectAI` at all; we store the configuration and issue no
   * request, mirroring what the trial can do offline (see docs/STATUS.md).
   */
  injectAI(callbackOrEnv: AIRequestCallbackLike | AIEnvironmentLike): void {
    if (typeof callbackOrEnv === 'function' || (callbackOrEnv !== null && typeof callbackOrEnv === 'object' && callbackOrEnv !== undefined)) {
      this._aiSettings = callbackOrEnv;
      return;
    }
    throw new TypeError('injectAI expects an AIRequestCallback function or an IAIEnvironment object.');
  }
  addCustomName(
    name: string,
    formula: string,
    baseRow: number,
    baseCol: number,
    comment?: string,
    isReadOnly?: boolean,
  ): void {
    assertCustomName(name, formula);
    assertNameFormula(formula.replace(/^=/, ''), this.options?.referenceStyle === 1);
    const key = name.toLowerCase();
    // Workbook scope enforces the same rules as the sheet scope, including case-insensitive uniqueness.
    const taken = this.names.get(key);
    if (taken) throw new Error(INVALID_CUSTOM_NAME);
    const info = new NameInfo(name, formula.replace(/^=/, ''), baseRow, baseCol, comment, isReadOnly);
    info._onRename = (previous, next) => {
      const existing = this.names.get(next.toLowerCase());
      if (existing && existing !== info) throw new Error('Name already exists');
      this.names.delete(previous.toLowerCase());
      this.names.set(next.toLowerCase(), info);
    };
    this.names.set(key, info);
    info._onChange = () => this.calc?.namesChanged();
    this.calc?.namesChanged();
  }
  getCustomName(name: string): NameInfo {
    return this.names.get(name.toLowerCase())!;
  }
  getCustomNames(): NameInfo[] {
    return [...this.names.values()];
  }
  removeCustomName(name: string): void {
    this.names.delete(name.toLowerCase());
    this.calc?.namesChanged();
  }
  clearCustomNames(): void {
    this.names.clear();
    this.calc?.namesChanged();
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
  _emit(type: string, info: EventInfo): void {
    this.events.emit(type, info);
  }
  _hasEvent(type: string): boolean { return this.events.has(type); }
  _isEventSuspended(): boolean {
    return this.events.depth > 0;
  }
  suspendEvent(): void {
    this.events.depth++;
  }
  resumeEvent(): void {
    this.events.depth = Math.max(0, this.events.depth - 1);
  }
  suspendPaint(): void {
    this.batch.paint++;
  }
  resumePaint(): void {
    this.batch.paint = Math.max(0, this.batch.paint - 1);
    if (!this.batch.paint) {
      for (const sheet of this.sheets) sheet._flushPaint();
      this.batch.flush();
    }
  }
  isPaintSuspended(): boolean {
    return this.batch.paint > 0;
  }
  suspendCalcService(_ignoreDirty = false): void {
    this.batch.calc++;
  }
  resumeCalcService(recalcAll = false): void {
    this.batch.calc = Math.max(0, this.batch.calc - 1);
    if (!this.batch.calc) for (const sheet of this.sheets) sheet._resumeWorkbookCalc(recalcAll);
  }
  _isCalcSuspended(): boolean {
    return this.batch.calc > 0;
  }
  _isUndoing(): boolean {
    return !this.history.recording;
  }
  commandManager(): CommandManager {
    return this.manager;
  }
  undoManager(): UndoManager {
    return this.history;
  }
  refresh(): void {
    this.invalidateLayout();
  }
  invalidateLayout(): void {
    if (!this.destroyed) this.batch.invalidate(true);
  }
  repaint(): void {
    if (!this.destroyed) this.batch.invalidate();
  }
  _onInvalidate(callback: (layout: boolean) => void): void {
    this.batch.onInvalidate = callback;
  }
  /**
   * Gets or sets the control `Actions.selectNextControl` focuses when the sheet
   * has no next control cell (trial probe `wb:nextcontrol-cmd`: a stored element
   * is focused and the `select*Control` commands report the focus attempt).
   */
  nextControl(value?: HTMLElement): HTMLElement | Workbook | undefined {
    if (value === undefined) return this._nextControlEl;
    this._nextControlEl = value;
    return this;
  }
  previousControl(value?: HTMLElement): HTMLElement | Workbook | undefined {
    if (value === undefined) return this._previousControlEl;
    this._previousControlEl = value;
    return this;
  }
  /** Focuses a `nextControl`/`previousControl` element; true when it had the focus method called. */
  _focusWorkbookControl(direction: number): boolean {
    const element = direction > 0 ? this._nextControlEl : this._previousControlEl;
    if (!element || typeof element.focus !== 'function') return false;
    element.focus();
    return true;
  }
  focus(focusIn = true): void {
    if (focusIn) (this.renderer?.root ?? this.host)?.focus();    else this.host?.blur();
  }
  toJSON(options: SerializationOptions = {}): JsonRecord {
    for (const key of [
      'saveAsView',
      'rowHeadersAsFrozenColumns',
      'columnHeadersAsFrozenRows',
      'includeAutoMergedCells',
      'saveR1C1Formula',
      'saveExternalSourcePivotCache',
    ])
      if (options[key]) notImplemented(`Workbook.toJSON(${key})`);
    this.assertAlive();
    const result: JsonRecord = {
      ...clone(this.extraJSON),
      version: '19.2.5',
      name: this.name,
      docProps: this.docProps._toJSON(),
      sheetCount: this.sheets.filter(sheet => !(sheet instanceof TableSheet)).length,
    };
    Object.assign(result, optionDifferences(this.options, workbookDefaults));
    result.customList = clone(this.options.customList);
    result.defaultSheetTabStyles = clone(this.options.defaultSheetTabStyles);
    result.builtInFileIcons = clone(this.options.builtInFileIcons);
    const customTableStyles = this.customTableThemes._toJSON();
    if (customTableStyles) result.tableStyles = customTableStyles;
    if (this.start) result.startSheetIndex = this.start;
    if (this.active) result.activeSheetIndex = this.active;
    const plainSheets = Object.fromEntries(this.sheets.flatMap((sheet, index) => sheet instanceof TableSheet ? [] :
      [[sheet.name(), { ...sheet.toJSON(options), index, order: index }]]));
    // The trial omits the `sheets` section entirely when no plain worksheet exists
    // (probe .probe/api-sweep-item2b.json top-level keys).
    if (Object.keys(plainSheets).length) result.sheets = plainSheets;
    const tableSheets = this.sheets.flatMap((sheet, index) => {
      if (!(sheet instanceof TableSheet)) return [];
      const view = sheet.getDataView();
      const rowFilter = sheet._serializeSortFilter();
      const templates = sheet._namedCellTemplates();
      // Trial addition keys (probe .probe/api-sweep-item2d.json `additionA`): grouping,
      // rowFilter, full options blob, rowActionOptions, currentTheme and defaults.
      // Grouping/sort/filter state travels in view.groupInfo/filterInfo and in
      // rowFilter.sortMap/filterItemMap, exactly like the trial serializes them.
      const addition = { dataView: view && { name: view.name, tableName: view._tableName() },
        freeHeader: sheet.applyFreeHeaderArea(), grouping: { outlinePosition: sheet.groupOutlinePosition() },
        ...(Object.keys(templates).length ? { namedCellTemplates: templates } : {}),
        options: tableSheetDefaultOptions(sheet.getTableTheme()),
        rowActionOptions: clone(sheet.rowActionOptions()),
        currentTheme: clone(sheet.getTableTheme()?.toJSON?.() ?? null),
        defaults: { rowHeight: 30, colHeaderRowHeight: 30 }, rowFilter };
      const sheetJson = sheet.toJSON(options);
      sheet._serializeBoundCells(sheetJson);
      sheet._serializeBuiltInNames(sheetJson);
      if (sheetJson.theme === 'Office') sheetJson.theme = 'Office2007'; // the trial names the default tab theme Office2007
      return [[sheet.name(), { ...sheetJson, rowFilter, sheetType: 0, addition, index, order: index }]];
    });
    if (tableSheets.length) {
      result.sheetTabs = Object.fromEntries(tableSheets);
      result.sheetTabCount = tableSheets.length;
    }
    if (tableSheets.length || Object.keys(this.dataManagerInstance.tables).length) {
      result.dataManager = {
        tables: Object.values(this.dataManagerInstance.tables).map(table => ({
          name: table.name,
          primaryKey: (table as unknown as { primaryKey?: string }).primaryKey ?? '',
          columns: Object.fromEntries(Object.entries((table.columns ?? {}) as Record<string, Record<string, unknown>>)
            .map(([key, column]) => [key, { ...column, isPrimaryKey: column.isPrimaryKey ?? false }])),
          dataSourceOption: { batch: false, ...clone(table.options) },
          views: Object.values(table.views).map(view => {
            const bound = this.sheets.find(sheet => sheet instanceof TableSheet && sheet.getDataView() === view) as TableSheet | undefined;
            const sortInfo = bound?.sort();
            const groups = bound?.groupBy();
            const filterInfo = bound?.filter().flatMap(filter => {
              const values = filter.values ?? [];
              return values.length
                ? values.map(value => ({ field: filter.field, value: value.value }))
                // Trial serializes a condition-only filter as {field} in view filterInfo
                // (probe .probe/api-sweep-item2g.json `conditionFilter`).
                : [{ field: filter.field }];
            });
            // Trial shape (probe .probe/api-sweep-item2d.json): columns in natural order,
            // columnIndexMap maps display position -> natural index, pinned* hold natural
            // indexes, groupInfo carries the sheet grouping, options carries the four
            // default style rules.
            const viewInternals = view as unknown as { columnInfos: Record<string, unknown>[]; pinnedColumns: Set<Record<string, unknown>>; pinnedRows: Set<object> };
            const natural = viewInternals.columnInfos;
            const display = view.getColumn() as Record<string, unknown>[];
            // Trial serializes columnIndexMap only when the display order differs from the
            // natural order (probe .probe/api-sweep-item2i.json: an identity map makes the
            // trial drop the column filter on a grouped sheet).
            const orderMap = display.map(column => natural.indexOf(column));
            const columnIndexMap = orderMap.every((index, position) => index === position) ? [] : orderMap;
            const pinnedRowIndexes = [...viewInternals.pinnedRows].map(row => table.indexOf(row as never)).filter(index => index >= 0);
            const pinnedColumnIndexes = [...viewInternals.pinnedColumns].map(column => natural.indexOf(column)).filter(index => index >= 0);
            return { name: view.name, columns: clone(natural), options: { styleRules: tableViewStyleRules() },
              indexMap: Array.from({ length: view.visibleLength() }, (_, index) =>
                table.indexOf(view.hierarchyRow(index) as Record<string, unknown>)),
              columnIndexMap, pinnedRows: pinnedRowIndexes, pinnedColumns: pinnedColumnIndexes,
              disableAuto: false, autoSort: true, autoFilter: false,
              autoGroup: true, detailColumnsVisible: true, ...(groups?.length ? { groupInfo: clone(groups) } : {}),
              ...(sortInfo?.length ? { sortInfo: clone(sortInfo) } : {}),
              ...(filterInfo?.length ? { filterInfo } : {}) };
          }),
        })),
        relationships: [],
      };
    }
    if (!options.ignoreStyle && this.namedStyles.size)
      result.namedStyles = this.getNamedStyles().map(styleToJSON);
    // TASK 46: the trial add-on writes the resolved default theme objects; we keep the
    // core-only key layout (the keys appear only once a default theme is registered).
    const defaultThemes = this._resolvedDefaultThemes();
    if (defaultThemes.pivot) result.defaultPivotTableStyle = defaultThemes.pivot.toJSON();
    if (defaultThemes.slicer) result.defaultSlicerStyle = defaultThemes.slicer.toJSON();
    if (defaultThemes.timeline) result.defaultTimelineStyle = defaultThemes.timeline.toJSON();
    if (this.names.size) result.names = this.getCustomNames().map((n) => n.toJSON());
    const templates = this.namedCellTemplates.all();
    if (templates.length) result.namedCellTemplates = Object.fromEntries(templates.map(template => [template.name!, template]));
    const external = this.externalRefs.toJSON();
    if (external) result.externalReference = external;
    const tabStyles = this.sheetTabStyles._toJSON();
    if (tabStyles) result.sheetTabStylesMap = tabStyles;
    const pivotCaches: Record<string, unknown> = {};
    for (const sheet of this.sheets)
      for (const table of (sheet as Partial<Worksheet>).pivotTables?._list() ?? []) {
        const cache = table._cacheJSON();
        pivotCaches[String(cache.cacheId)] = cache;
      }
    if (Object.keys(pivotCaches).length) result.pivotCaches = pivotCaches;
    const slicerCaches: unknown[] = [];
    for (const sheet of this.sheets)
      slicerCaches.push(...(sheet as Partial<Worksheet>).slicers?._toPivotCachesJSON?.() ?? []);
    if (slicerCaches.length) result.slicerCaches = slicerCaches;
    const sparklineExs = serializedSparklineExs(this);
    result.sparklineExs = sparklineExs.length ? sparklineExs : undefined;
    const serialized = serializeValue(result) as JsonRecord;
    // The trial keeps both scenario keys on every workbook JSON (probe
    // f40sc7-fresh2: `scenarios` present with an undefined value until the
    // manager has materialized scenarios, `scenarioAdditionalInfo` always an
    // object with the applied-scenario flags and the captured base values).
    // The re-delete keeps the trial key order (`scenarios` first).
    delete serialized.scenarioAdditionalInfo;
    serialized.scenarios = this.scenarioManager._scenariosJSON();
    serialized.scenarioAdditionalInfo = this.scenarioManager._additionalJSON();
    return serialized;
  }
  async fromJSON(data: object, options: JsonRecord = {}): Promise<void> {
    this.assertAlive();
    for (const key of ['frozenColumnsAsRowHeaders', 'frozenRowsAsColumnHeaders', 'incrementalLoading'])
      if (options[key]) notImplemented(`Workbook.fromJSON(${key})`);
    const json = object(data);
    this.suspendPaint();
    this.suspendEvent();
    try {
      for (const sheet of this.sheets) sheet._attach();
      this.sheets = [];
      this.namedStyles.clear();
      this.names.clear();
      this.namedCellTemplates.clear();
      this.externalRefs.clear();
      this.externalRefs.fromJSON(json.externalReference);
      this.history.clear();
      // Drop the previous scenario state before the imported cell writes reach
      // the capture hook; the JSON's own scenario data is applied at the end.
      this.scenarioManager._fromJSON(undefined, undefined);
      this.name = String(json.name ?? '');
      this.docProps._fromJSON(json.docProps);
      this.sheetTabStyles._fromJSON(json.sheetTabStylesMap);
      this.customTableThemes._fromJSON(json.tableStyles);
      // TASK 46: import the workbook default themes written by toJSON().
      this._defaultThemes = {};
      if (json.defaultPivotTableStyle && typeof json.defaultPivotTableStyle === 'object') {
        const theme = new PivotTableTheme();
        theme.fromJSON(json.defaultPivotTableStyle as Record<string, unknown>);
        this._defaultThemes.pivot = theme;
      }
      if (json.defaultSlicerStyle && typeof json.defaultSlicerStyle === 'object') {
        const style = new SlicerStyle();
        style.fromJSON(json.defaultSlicerStyle as Record<string, unknown>);
        this._defaultThemes.slicer = style;
      }
      if (json.defaultTimelineStyle && typeof json.defaultTimelineStyle === 'object') {
        const style = new TimelineStyle();
        style.fromJSON(json.defaultTimelineStyle as Record<string, unknown>);
        this._defaultThemes.timeline = style;
      }
      this.defaultTheme = undefined;
      for (const key of Object.keys(this.options)) delete this.options[key];
      Object.assign(this.options, clone(workbookDefaults));
      for (const key of Object.keys(workbookDefaults))
        if (json[key] !== undefined) mergeOptions(this.options, { [key]: json[key] });
      this.dataManagerInstance = new DataManager();
      const importedViewSorts = new WeakMap<View, unknown[]>();
      const importedViewExtras = new WeakMap<View, { groups?: unknown[]; pinnedRows?: unknown[]; pinnedColumns?: unknown[];
        filters?: { field: string; value: unknown }[] }>();
      for (const entry of list(object(json.dataManager).tables)) {
        const settings = object(entry);
        const table = this.dataManagerInstance.addTable(String(settings.name), object(settings.dataSourceOption));
        if (!list(settings.views).length) {
          // Inline-data tables need one fetch so their rows are readable.
          // Fire-and-forget: sheet restore stays synchronous; the repaint when
          // the rows land is scheduled by the fetch callback.
          try { void Promise.resolve(table.fetch()).then(() => this.repaint()); } catch { /* ignore */ }
        }
        for (const rawView of list(settings.views)) {
          const viewSettings = object(rawView);
          const view = table.addView(String(viewSettings.name), list(viewSettings.columns) as Record<string, unknown>[]);
          await view.fetch();
          if (Array.isArray(viewSettings.sortInfo)) importedViewSorts.set(view, viewSettings.sortInfo);
          importedViewExtras.set(view, {
            groups: Array.isArray(viewSettings.groupInfo) ? viewSettings.groupInfo : undefined,
            pinnedRows: Array.isArray(viewSettings.pinnedRows) ? viewSettings.pinnedRows : undefined,
            pinnedColumns: Array.isArray(viewSettings.pinnedColumns) ? viewSettings.pinnedColumns : undefined,
            filters: Array.isArray(viewSettings.filterInfo) ? viewSettings.filterInfo as { field: string; value: unknown }[] : undefined,
          });
        }
      }
      const sheetEntries = [
        ...Object.entries(object(json.sheets)).map(([name, raw]) => ({ name, raw, table: false })),
        ...Object.entries(object(json.sheetTabs)).map(([name, raw]) => ({ name, raw, table: true })),
      ].sort((a, b) => Number(object(a.raw).index ?? 0) - Number(object(b.raw).index ?? 0));
      // Pivot slicers restore their binding/selection from this section once
      // the pivot tables themselves have been rebuilt (see _restorePivotTables).
      (this as unknown as { _pendingPivotSlicerCaches?: unknown[] })._pendingPivotSlicerCaches =
        Array.isArray(json.slicerCaches) ? json.slicerCaches as unknown[] : [];
      for (const { name, raw, table } of sheetEntries) {
        // The IO parser owns its temporary JSON and can transfer it without a
        // second million-cell object graph. Public fromJSON still copies input.
        const settings = options._ioOwnedData ? object(raw) : clone(object(raw));
        if (options.ignoreStyle) {
          delete settings.namedStyles;
          for (const area of ['data', 'rowHeaderData', 'colHeaderData']) {
            const a = object(settings[area]);
            delete object(a.defaultDataNode).style;
            for (const key of ['rowDataArray', 'columnDataArray'])
              for (const node of list(a[key])) if (node) delete object(node).style;
            for (const row of Object.values(object(a.dataTable)))
              for (const node of Object.values(object(row))) delete object(node).style;
          }
        }
        if (options.ignoreFormula)
          for (const area of ['data', 'rowHeaderData', 'colHeaderData'])
            for (const row of Object.values(object(object(settings[area]).dataTable)))
              for (const node of Object.values(object(row))) delete object(node).formula;
        const sheet = table ? new TableSheet(name) : new Worksheet(name);
        sheet._attach(this);
        sheet.fromJSON(settings);
        if (sheet instanceof TableSheet) {
          const addition = object(settings.addition);
          if (settings.theme === 'Office2007') settings.theme = 'Office'; // our registry registers the default under Office
          const grouping = object(addition.grouping);
          if (grouping.outlinePosition !== undefined) sheet.groupOutlinePosition(Number(grouping.outlinePosition));
          if (Array.isArray(addition.rowActionOptions) && !isDefaultRowActionOptions(addition.rowActionOptions))
            sheet.rowActionOptions((addition.rowActionOptions as Record<string, unknown>[]).map(action => ({ ...action,
              iconSelector: typeof action.iconSelector === 'function' ? action.iconSelector as never : () => true })));
          if (addition.currentTheme) {
            const restored = new TableTheme(addition.currentTheme as Record<string, unknown>);
            if (JSON.stringify(restored.toJSON()) !== JSON.stringify((TableThemes.light2 as TableTheme).toJSON())) sheet.applyTableTheme(restored);
          }
          const binding = object(addition.dataView);
          const view = this.dataManagerInstance.tables[String(binding.tableName)]?.views[String(binding.name)];
          if (view) sheet.setDataView(view);
          if (addition.freeHeader) sheet.applyFreeHeaderArea(object(addition.freeHeader));
          const extras = view ? importedViewExtras.get(view) : undefined;
          if (view && extras?.pinnedColumns?.length) {
            const internals = view as unknown as { columnInfos: Record<string, unknown>[]; pinnedColumns: Set<object> };
            for (const raw of extras.pinnedColumns) {
              const column = internals.columnInfos[Number(raw)];
              if (column) internals.pinnedColumns.add(column);
            }
          }
          if (view && extras?.pinnedRows?.length) {
            const internals = view as unknown as { pinnedRows: Set<object>; table?: { rows?: object[] } };
            const rows = internals.table?.rows ?? [];
            for (const raw of extras.pinnedRows) {
              const row = rows[Number(raw)];
              if (row) internals.pinnedRows.add(row);
            }
          }
          const groups = Array.isArray(addition.groups) && addition.groups.length ? addition.groups : extras?.groups;
          if (groups?.length) sheet.groupBy(groups as Parameters<TableSheet['groupBy']>[0]);
          const importedSorts = Array.isArray(addition.sorts) && addition.sorts.length ? addition.sorts
            : view && importedViewSorts.get(view)?.length ? importedViewSorts.get(view) : undefined;
          const rowFilterJson = object(settings.rowFilter ?? addition.rowFilter);
          const sorts = importedSorts?.length ? importedSorts : (() => {
            // Trial serializes sorts in rowFilter.sortMap/multiSortOrder (probe item2f).
            const sortMap = object(object(rowFilterJson.sortMap)['-1']);
            const order = Array.isArray(rowFilterJson.multiSortOrder) && rowFilterJson.multiSortOrder.length
              ? rowFilterJson.multiSortOrder : Object.keys(sortMap).map(Number);
            const columns = (view?.getColumn() ?? []) as Record<string, unknown>[];
            return order.flatMap(index => {
              const entry = object(sortMap[String(index)]);
              if (!entry || entry.index === undefined) return [];
              const column = columns[Number(entry.index) - sheet._groupColumnCount()];
              const field = column?.value ?? column?.name;
              return typeof field === 'string' ? [{ field, ascending: entry.ascending !== false }] : [];
            });
          })();
          if (sorts?.length) sheet.sort(sorts as Parameters<TableSheet['sort']>[0]);
          let filtersRestored = false;
          if (Array.isArray(addition.filters) && addition.filters.length) {
            sheet.filter(addition.filters as Parameters<TableSheet['filter']>[0]);
            filtersRestored = true;
          } else if (extras?.filters?.length) {
            const byField = new Map<string, { value: unknown }[]>();
            for (const entry of extras.filters) {
              if (entry.value === undefined) continue; // condition-only filters arrive via filterItemMap
              (byField.get(entry.field) ?? byField.set(entry.field, []).get(entry.field)!).push({ value: entry.value });
            }
            if (byField.size) {
              sheet.filter([...byField].map(([field, values]) => ({ field, values })));
              filtersRestored = true;
            }
          }
          if (!filtersRestored && view) {
            const columns = view.getColumn() as Record<string, unknown>[];
            const rowFilter = object(settings.rowFilter ?? addition.rowFilter);
            const filters = list(rowFilter.filterItemMap).flatMap((item): {
              field: string; values?: { value: unknown; type?: string }[]; condition?: Record<string, unknown>; paths?: unknown[];
            }[] => {
              const entry = object(item);
              const column = columns[Number(entry.index) - sheet._groupColumnCount()];
              const field = column?.value ?? column?.name;
              const conditions = list(entry.conditions) as Record<string, unknown>[];
              if (typeof field !== 'string') return [];
              const values = conditions
                .filter(condition => !condition.isCondition && condition.value !== undefined)
                .map(condition => ({ value: condition.value, type: String(condition.type ?? 'value') }));
              if (values.length) return [{ field, values }];
              // Condition-only entries carry the condition object itself (probe item2g:
              // trial writes {relation,operator,value1,isCondition:false} into filterItemMap).
              if (conditions.length) {
                const condition = { ...conditions[0] };
                delete condition.isCondition;
                // Compiled conditions (from our filter UI) serialize via Condition.toJSON
                // and reload through Condition.fromJSON; plain descriptors stay as-is.
                if (condition.conType !== undefined || condition.item1 !== undefined || condition.item2 !== undefined)
                  return [{ field, condition: Condition.fromJSON(condition) as never }];
                return [{ field, condition: condition as never }];
              }
              const paths = entry.paths as unknown[] | undefined;
              if (Array.isArray(paths) && paths.length) return [{ field, paths }];
              return [];
            });
            if (filters.length) sheet.filter(filters as Parameters<TableSheet['filter']>[0]);
          }
        }
        this.sheets.push(sheet);
      }
      if (!sheetEntries.length && Number(json.sheetCount ?? 0) > 0)
        this.setSheetCount(Number(json.sheetCount));
      this.active = Number(json.activeSheetIndex ?? 0);
      this.start = Number(json.startSheetIndex ?? 0);
      this._syncSheetSelection();
      if (!options.ignoreStyle)
        for (const raw of list(json.namedStyles)) {
          const style = styleFromJSON(raw);
          if (typeof style !== 'string') this.addNamedStyle(style);
        }
      for (const raw of list(json.names)) {
        const n = object(raw);
        this.addCustomName(
          String(n.name),
          String(n.formula),
          Number(n.row ?? 0),
          Number(n.col ?? 0),
          n.comment as string | undefined,
          Boolean(n.isReadOnly),
        );
      }
      for (const [name, template] of Object.entries(object(json.namedCellTemplates))) {
        this.namedCellTemplates.add(name, object(template));
      }
      for (const sheet of this.sheets) {
        if (!(sheet instanceof TableSheet)) continue;
        const settings = object(object(json.sheetTabs)[sheet.name()]);
        const templates = object(object(settings.addition).namedCellTemplates);
        for (const [field, name] of Object.entries(templates)) {
          if (typeof name === 'string') sheet.applyNamedCellTemplate(name, [field]);
        }
      }
      this._restorePivotTables(json);
      (this as unknown as { _pendingPivotSlicerCaches?: unknown[] })._pendingPivotSlicerCaches = undefined;
      this.scenarioManager._fromJSON(json.scenarios, json.scenarioAdditionalInfo);
      const known = new Set([
        'version',
        'name',
        'docProps',
        'sheetCount',
        'sheets',
        'sheetTabs',
        'sheetTabCount',
        'sheetTabStylesMap',
        'tableStyles',
        'pivotCaches',
        'slicerCaches',
        'dataManager',
        'namedStyles',
        'namedCellTemplates',
        'names',
        'externalReference',
        'startSheetIndex',
        'activeSheetIndex',
        'sparklineExs',
        'scenarios',
        'scenarioAdditionalInfo',
        ...Object.keys(workbookDefaults),
      ]);
      this.extraJSON = {
        ...defaultMetadata(),
        ...Object.fromEntries(
          Object.entries(json)
            .filter(([key]) => !known.has(key))
            .map(([key, value]) => [key, clone(value)]),
        ),
      };
      this.calc?.loadFormulas();
      this.invalidateLayout();
    } finally {
      this.resumeEvent();
      this.resumePaint();
    }
  }
  /** Rebuild `sheet.pivotTables` from the serialized trial-shape entries. */
  private _restorePivotTables(json: Record<string, unknown>): void {
    const caches = json.pivotCaches as Record<string, Record<string, unknown>> | undefined;
    const sheets = json.sheets as Record<string, Record<string, unknown>> | undefined;
    if (!caches || !sheets) return;
    for (const sheet of this.sheets) {
      const settings = sheets[sheet.name()];
      const entries = settings && Array.isArray(settings.pivotTables) ? settings.pivotTables as Record<string, unknown>[] : [];
      for (const entry of entries) {
        const cache = caches[String(entry.cacheId)] ?? undefined;
        try {
          sheet.pivotTables._restore(entry, cache);
        } catch {
          // a broken entry must not fail the whole workbook load
        }
      }
    }
  }
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.touchToolStrip?._detach();
    this.touchToolStrip = undefined;
    this.renderer?.destroy(); this.renderer = undefined;
    if (this.addedHostClass) this.host?.classList.remove('opensheets-host');
    if (this.host) detachHostMarkers(this.host);
    for (const sheet of this.sheets) {
      sheet.unbindAll();
      sheet._attach();
    }
    this.sheets.length = 0;
    this.events.unbindAll();
    this.history.clear();
    this.calc = undefined;
    if (this.host) unregisterWorkbookHost(this.host); // trial: findControl(host) answers null after destroy
    this.host = undefined;
    this.batch.onInvalidate = undefined;
  }
}
// `touchToolStrip` is a declared data property: the coverage report reads its
// descriptor from the prototype, the hosted constructor shadows it with the
// real strip (see the member doc above).
instanceProperties(Workbook, 'touchToolStrip');

/** Page rectangles of one sheet for Workbook.pageInfo (TASK 46, trial shape). */
function sheetPageInfos(sheet: Worksheet): Record<string, number>[] {
  if (!sheet.getUsedRange(GC.Spread.Sheets.UsedRangeType.all)) return []; // trial: an empty sheet has no pages
  // The trial's `pageInfo` describes the rendered sheet; a paginated report renders one page.
  const paginator = new WorksheetPaginator(sheet);
  paginator.paginate();
  return paginator._models().map(model => ({
    row: model.rowPage.itemStart,
    column: model.columnPage.itemStart,
    rowCount: model.rowPage.itemEnd - model.rowPage.itemStart + 1,
    columnCount: model.columnPage.itemEnd - model.columnPage.itemStart + 1,
  }));
}

/** Finds the built-in slicer/timeline style whose registered name matches (case-insensitive). */
function findBuiltInSlicerStyle<T extends SlicerStyle>(catalogue: unknown, name: string): T | undefined {
  const holder = catalogue as Record<string, unknown>;
  const key = String(name).toLowerCase();
  for (const entry of Object.keys(holder)) {
    const factory = holder[entry];
    if (typeof factory !== 'function' || entry === 'constructor') continue;
    const style = (factory as () => T).call(catalogue);
    if (style && String(style.name?.() ?? '').toLowerCase() === key) return style;
  }
  return undefined;
}

/** Structural aliases for injectAI's contract types (TASK 46; the d.ts types are ambient). */
type AIRequestCallbackLike = (...args: unknown[]) => unknown;
type AIEnvironmentLike = Record<string, unknown>;
