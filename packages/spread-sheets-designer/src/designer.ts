import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type {
  CommandState, ICommand, IDialogTemplate, IDesignerConfig, ITheme, MessageBoxIcon, MessageBoxButtons,
} from './types.js';
import type {
  CommentUiFacade, ContextMenuState, DialogData, DialogErrorCallback, DialogState, DialogSuccessCallback,
  DialogValidCallback, DrawTool, MessageBoxCallback, MessageBoxState, DesignerApi, DesignerEventHandler,
  DesignerEvents, ClipboardData, RibbonMenuState, DockPane,
} from './designer-api.js';
import { CommandNames, TemplateNames } from './names-generated.js';
import { activateDockPane as activateDockPaneHelper, dockPaneVisible, dockStackOpen, setDockPane as setDockPaneHelper } from './dock-panes.js';
import { DefaultConfig, ToolBarModeConfig, resolveRibbon } from './config.js';
import { deepClone, mergeConfig } from './config-merge.js';
import { defaultTheme } from './theme-default.js';
import { getResources, mergeResources, themeToCss } from './resolve.js';
import { activeSheet } from './commands/actions.js';
import { selectedShapes as insertSelectedShapes, snapshotChartLauncherState } from './commands/insert.js';
import { internals, legacyCommentsOf, shapesOf, sheetsNamespace, designerCore, type DesignerShape, type GCRoot, type Style, type Workbook, type Worksheet } from './core-internals.js';
import type GC from '@mescius/spread-sheets';
import { DesignerApp } from './app.js';
import { registerBuiltinTemplates } from './dialogs/templates.js';
import { type SortLevel } from './data-engine.js';
import { type SettingValue } from './settings-model.js';
import { FindReplaceController } from './find.js';
import { DialogHost } from './dialogs/DialogHost.js';
import { takeContextMenu } from './context-menu-owner.js';
import {
  clearActiveDesigner, emitDesignerEvent, getActive, getTemplate, getTemplateRaw, globalEvents, registerTemplate, setActiveDesigner,
} from './designer-registry.js';
import { executeDesignerBuiltin, executeDesignerCommand, executeDesignerSpecial } from './designer-commands.js';
import { computeCommandState, commitDesignerReference, getDesignerSelectionInfo, searchDesignerCommands } from './designer-state.js';
import { bindDesignerWorkbookEvents } from './designer-events.js';
import {
  createCustomCellStyle, showCellTagDialog, showConvertTableDialog, showCornerTag, showCreateCellTemplateDialog,
  showDefaultValueDialog, showDeleteCellsDialog, showFormatCells, showHeaderTag, showHeadersDialog,
  showInsertCellsDialog, showNewCellStyleDialog, showOutlineColumnDialog, showPasteSpecial, showRichTextDialog,
  showTransformCells,
} from './designer-dialogs.js';
import {
  addCellState, clearTableStyleElement, clearTableStyleOfSelection, editCellStateStyle, editTableStyleElement,
  pickCellStateRange, removeCellState, showManageCellStatesDialog, showNewTableStyleDialog, type CellStatesDraft,
} from './designer-custom-styles.js';
import {
  deleteConditionalRule, duplicateConditionalRule, editConditionalRule, editConditionalRuleStyle, moveConditionalRule,
  newConditionalRule, refreshConditionalRuleManager, showNewFormattingRule, showRuleManagerDialog, toggleConditionalRuleStop, type ConditionalRuleDraft,
} from './designer-conditional-formatting.js';
import type { TableStyleDraft } from './dialogs/TableStyleDialogs.js';
import {
  confirmDeleteName, deleteName, insertFormula, openFunctionArguments, removeSubtotalsNow, showAutoOutline,
  showCircleInvalidData, showClearInvalidCircles, showDataValidation, showGoalSeek, showHyperlink,
  showInsertFunction, showInsertTable, showNameManager, showNewName, showRemoveDuplicates, showSort,
  showGoTo, showGoToSpecial, showSeries,
  showSubtotal, showTextToColumns, showZoom, showInsertSlicerDialog,
} from './designer-data-dialogs.js';
import {
  applyFocusCellColor, ensureStructureEditable, showBuiltInFileIcons, showConfirmPassword, showDefaultDimensionDialog, showDimensionDialog, showFormatComment,
  showMoveOrCopySheet, showProtectSheet, showProtectWorkbook, showSettings, showSheetSettings, showTabStyleSettings,
  showUnhideSheet, showUnprotectSheet, toggleFocusCell, clearSelectionCellType, clearSelectionCellDropdown, applySelectionCellType, zoomToSelection, pickWorksheetBackground,
} from './designer-sheet-dialogs.js';
import {
  armDrawTool, beginShapeTextEdit, executeChartCommand, executeShapeCommand, finishDrawTool,
  pickImageFile, placePicture, saveChartAsPicture, saveShapeAsPicture, showBarcodeDialog, showCameraDialog,
  showChangeChartTypeDialog, showFormatChartAreaDialog, showMoveChartDialog, showSelectDataDialog,
  showChartCommandDialog,
  showShapeLinkDialog, showShapeSizeDialog, showSparklineDialog, showChartAltTextDialog,
} from './designer-shapes.js';
import {
  hasActiveFormulaSparkline, hasActiveSparkline, hasActiveTable, hasSelectedChart,
} from './contextual-actions.js';
import {
  applyThemeColors, applyThemeFonts, applyWorkbookTheme, openThemeMenu, printDesigner, showCustomHeaderFooter,
  showPageSetup, syncPageLayoutDefaults,
} from './designer-print.js';
import { applyUndoableAction, commitFormula, installFormulaCommit, installUndoBridge, restoreUndoable, runUndoable } from './designer-undo.js';
import {
  activePivot, hasActivePivot, showCalcItemSolveOrder, showCalculatedField, showCalculatedItem,
  showChangeDataSource, showInsertPivotTable, showMovePivotTable, showPivotFieldSettings,
  showPivotTableOptions, showReportFilterPages, showValueFieldSettings, type PivotTable as PivotTableType,
} from './pivot-designer.js';
import { newWorkbook, openFile, saveFile } from './designer-file.js';

export type {
  CommentUiFacade, DialogData, DialogErrorCallback, DialogState, DialogSuccessCallback, DialogValidCallback,
  MessageBoxCallback, MessageBoxState, DesignerEventHandler, DesignerEvents, RibbonMenuState, ContextMenuState, DrawTool,
};

/* Dialog/message-box entry points and the template registry moved to
 * designer-registry.ts; they are re-exported here so every public import path
 * of this module keeps working unchanged. */
export { registerTemplate, getTemplate, showDialog, closeDialog, showMessageBox } from './designer-registry.js';

export class Designer implements DesignerApi {
  readonly gc: GCRoot;
  readonly host: HTMLElement;
  private workbook: Workbook;
  private ownsWorkbook = false;
  private releaseContextMenu?: () => void;
  private config: IDesignerConfig;
  /** Merged resource (label) table the ribbon, dialogs and message boxes resolve against. */
  resources: Record<string, unknown>;
  private theme: ITheme = { ...defaultTheme };
  private root: Root;
  readonly sheetHost: HTMLElement;
  private version = 0;
  private subscribers = new Set<() => void>();
  private frame = 0;
  private data = new Map<string, unknown>();
  private events: Partial<Record<string, DesignerEventHandler[]>> = {};
  private disposed = false;
  _undoTarget?: string;
  _undoSheets = new Map<number, Worksheet>();
  _undoSheetIds = new WeakMap<object, number>();
  dialog: DialogState | null = null;
  messageBox: MessageBoxState | null = null;
  activeTab = 'home';
  collapsed = false;
  fileMenuOpen = false;
  openMenu: RibbonMenuState | null = null;
  _menuOwner: HTMLElement | null = null;
  _menuToggleClosedByPress = false;
  openList: string | null = null;
  contextMenu: ContextMenuState | null = null;
  findController: FindReplaceController;
  private initialized: Promise<void>;
  private resolveInitialized!: () => void;

  constructor(host: HTMLDivElement | string, config?: IDesignerConfig, spread?: unknown, spreadOptions?: Record<string, unknown>) {
    const element = typeof host === 'string'
      ? (typeof document === 'undefined' ? null : document.getElementById(host))
      : host;
    if (!element) throw new Error(`Designer host not found: ${typeof host === 'string' ? host : ''}`);
    this.host = element;
    this.host.classList.add('gc-designer-container', 'en');
    this.host.style.position = this.host.style.position || 'relative';
    // GAP-52-2: the core is resolved from `globalThis.GC` when the page loaded one (script-tag
    // install) and otherwise from the core namespace this package imports (bundler install), so a
    // bundler app that only imports the aliased core can construct a Designer without any bridge.
    const gc = designerCore();
    if (!gc?.Spread?.Sheets?.Workbook) {
      throw new Error('GC.Spread.Sheets.Workbook is required before creating a Designer');
    }
    this.gc = gc;
    this.resources = getResources();
    const initial = sheetsNamespace(this.gc).DesignerResources;
    if (initial) this.resources = mergeResources(this.resources, initial);
    this.config = mergeConfig(DefaultConfig, config ?? null);
    this.findController = new FindReplaceController(this);

    this.sheetHost = document.createElement('div');
    this.sheetHost.className = 'gc-designer-sheet-host';

    if (spread) {
      this.workbook = spread as Workbook;
      const existingHost = typeof this.workbook.getHost === 'function' ? this.workbook.getHost() : null;
      if (existingHost && existingHost !== this.sheetHost) {
        existingHost.classList.add('gc-designer-sheet');
        this.sheetHost.appendChild(existingHost);
      }
      this.ownsWorkbook = false;
    } else {
      this.workbook = new this.gc.Spread.Sheets.Workbook(this.sheetHost, spreadOptions ?? {});
      this.ownsWorkbook = true;
    }

    this.releaseContextMenu = takeContextMenu(this.workbook.contextMenu);
    installUndoBridge(this);
    installFormulaCommit(this);
    this.bindWorkbookEvents();
    // TASK 70 trial parity: the chart-launcher enabled state is snapshotted with the workbook
    // the Designer was created against (an empty sheet → all eight launchers greyed out, exactly
    // what the trial shows at startup even after the host loads data and selects through the API).
    snapshotChartLauncherState(this);
    this.applyThemeToHost();
    this.initialized = new Promise<void>((resolve) => { this.resolveInitialized = resolve; });
    this.root = createRoot(this.host);
    this.root.render(React.createElement(DesignerApp, { designer: this }));
    registerBuiltinTemplates(this);
    // The registry module keeps the last-created Designer (`getActiveDesigner()`); storing `this` here
    // is the intended registry, not a this-alias workaround.
    setActiveDesigner(this);
    this.updateGlobalCommands();
    queueMicrotask(() => {
      this.resolveInitialized();
      this.emit('DesignerResetDone', { designer: this });
    });
  }

  /* public API ------------------------------------------------------------ */
  getWorkbook(): Workbook { return this.workbook; }
  setWorkbook(spread: Workbook): void {
    this.releaseContextMenu?.();
    this.workbook = spread;
    this.releaseContextMenu = takeContextMenu(spread.contextMenu);
    const existingHost = typeof spread.getHost === 'function' ? spread.getHost() : null;
    if (existingHost) {
      existingHost.classList.add('gc-designer-sheet');
      this.sheetHost.appendChild(existingHost);
    }
    this.bindWorkbookEvents();
    this.invalidate();
  }
  getData(key: string): unknown { return this.data.get(key); }
  setData(key: string, value: unknown): void { this.data.set(key, value); this.invalidate(); }
  activeRibbonTab(ribbonTabId?: string): string {
    if (ribbonTabId !== undefined) {
      this.activeTab = ribbonTabId;
      this.collapsed = false;
      this.fileMenuOpen = false;
      this.invalidate();
    }
    return this.activeTab;
  }
  getConfig(): IDesignerConfig { return this.config; }
  setConfig(config: IDesignerConfig): void {
    this.config = mergeConfig(DefaultConfig, config);
    const tabs = resolveRibbon(this.config).panels;
    if (!tabs.some((tab) => tab.id === this.activeTab)) this.activeTab = tabs[0]?.id ?? 'home';
    this.updateGlobalCommands();
    this.invalidate();
  }
  refresh(): void { this.invalidate(); }
  destroy(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.frame) cancelAnimationFrame(this.frame);
    this.root.unmount();
    this.releaseContextMenu?.();
    this.subscribers.clear();
    this._undoSheets.clear();
    this.sheetHost.remove();
    this.host.classList.remove('gc-designer-container', 'en');
    if (this.ownsWorkbook && typeof this.workbook.destroy === 'function') this.workbook.destroy();
    clearActiveDesigner(this);
    this.unbindAll();
  }
  waitForDefaultTemplateLoaded(): Promise<void> { return this.initialized; }

  bind(type: string, fn?: DesignerEventHandler): void {
    if (!fn) return;
    for (const handler of globalEvents.get(type) ?? []) if (handler === fn) return;
    const set = globalEvents.get(type) ?? new Set<DesignerEventHandler>();
    set.add(fn);
    globalEvents.set(type, set);
    (this.events[type] ??= []).push(fn);
  }
  unbind(type: string, fn?: DesignerEventHandler): void {
    const set = globalEvents.get(type);
    if (!set) return;
    if (fn) set.delete(fn); else set.clear();
    this.events[type] = [...set];
  }
  unbindAll(): void { this.events = {}; }
  private emit(type: string, ...args: unknown[]): void {
    emitDesignerEvent(type, ...args);
  }

  /* command system -------------------------------------------------------- */
  getCommand(commandName?: string): ICommand | Record<string, ICommand> | undefined {
    const map = this.config.commandMap ?? {};
    if (!commandName) return map;
    return map[commandName] ?? DefaultConfig.commandMap?.[commandName];
  }
  executeCommand(commandName: string, propertyName?: string, value?: unknown): boolean {
    return executeDesignerCommand(this, commandName, propertyName, value);
  }
  executeBuiltin(commandName: string, propertyName?: string, value?: unknown): void {
    executeDesignerBuiltin(this, commandName, propertyName, value);
  }
  runUndoable(commandName: string, args: Record<string, unknown>): void {
    runUndoable(this, commandName, args);
  }
  applyUndoableAction(name: string, args: DialogData): boolean | void {
    return applyUndoableAction(this, name, args);
  }
  restoreUndoable(sheetJSON: string): void {
    restoreUndoable(this, sheetJSON);
  }
  executeSpecial(name: string, value: unknown, propertyName?: string): boolean {
    return executeDesignerSpecial(this, name, value, propertyName);
  }
  getCommandState(commandName: string): CommandState {
    return computeCommandState(this, commandName);
  }
  setCommandState(commandName: string, state: CommandState): void {
    const command = this.getCommand(commandName) as ICommand | undefined;
    if (command) (command as ICommand & { _state?: CommandState })._state = state;
    this.invalidate();
  }

  /* workbook events/state ------------------------------------------------- */
  _workbookHandlers: [string, DesignerEventHandler][] = [];
  private boundSheet?: Worksheet;
  private bindWorkbookEvents(): void {
    bindDesignerWorkbookEvents(this);
  }
  subscribe = (callback: () => void): (() => void) => {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  };
  getVersion = (): number => this.version;
  invalidate(): void {
    if (this.disposed || this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      if (this.disposed) return;
      this.version++;
      for (const subscriber of this.subscribers) subscriber();
    });
  }
  /**
   * Immediate (non-rAF) state flush. Dialog open/close and message-box transitions must land in
   * the DOM synchronously: a chained flow (Protect Sheet OK -> Confirm Password dialog) resolves
   * `.gc-designer-dialog` locators right away, and a rAF-delayed swap makes those locators see the
   * dying dialog (the trial's jQuery dialog closes synchronously in the click).
   */
  invalidateNow(): void {
    if (this.disposed) return;
    if (this.frame) { cancelAnimationFrame(this.frame); this.frame = 0; }
    this.version++;
    for (const subscriber of this.subscribers) subscriber();
  }
  // Fields used by commands and the find dialog.
  _formatPainterStyle: Style | null = null;
  _applyingPainter = false;
  _clipboard: ClipboardData | null = null;
  /** Chart Cut/Copy payload (chart JSON); consumed by paste when a chart is copied. */
  _chartClipboard: { cut: boolean; items: Record<string, unknown>[] } | null = null;
  /** Custom Sort level list remembered across opens (trial session state). */
  _sortSettings: { levels: SortLevel[]; hasHeaders: boolean; byRows: boolean } | null = null;
  _seriesSettings: { seriesIn: string; type: string; unit: string; trend: boolean; step: string; stop: string } | null = null;
  /** Sheets whose Page Layout defaults have been synced into printInfo (trial parity). */
  _pageSetupSynced = new WeakSet<object>();
  _protectedWorkbook = false;
  _structureProtection: { protected: boolean; password: string } = { protected: false, password: '' };
  _focusCell = false;
  _focusAutoHighlight = true;
  /** TASK 55: true once the user picks a paper size from the Size menu (drives the check box). */
  _paperTouched = false;
  _selectionPaneOpen = false;
  _commandPaletteOpen = false;
  _formulaEditorOpen = false;
  /** PivotTable docked field-list panel (TASK 47): open flag + shown pivot. */
  _pivotFieldListOpen = false;
  /** TASK 77: the selection-follow rule is armed until a manual panel close (see DesignerApi). */
  _pivotFieldListFollow = true;
  /** Trial keeps the panel mounted after the first open (hidden while closed). */
  _pivotFieldListMounted = false;
  _pivotFieldListName: string | null = null;
  /** Open chevron menu of a field-list panel item (position in page pixels). */
  _pivotItemMenu: { fieldName: string; x: number; y: number; nonce: number } | null = null;
  /** Command names recently run through executeCommand, most recent first (feeds the Command Palette). */
  _recentCommands: string[] = [];
  _formulaInsertion: { text: string; nonce: number } | null = null;
  _commentIndex = 0;
  _showComments = false;
  /**
   * TASK 77 dock stack (trial-measured layout, probed live on the running trial): the Selection
   * pane, the threaded comments panel and the PivotTable field list share one right dock — a
   * 315px active pane flush right (grid viewport 263 on the 640px compare frame), and when two or
   * more panes are open the pane keeps 315px and a further 39px tab rail appears right of it
   * (stack 354, viewport 224). `_dockPanes` keeps the open panes in mount order; `_dockActive` is
   * the visible one; opening a pane activates it, closing the active one falls back to the
   * previous pane of the stack. Before this layout two open panes each took their own dock slot
   * and crushed the sheet viewport (the TASK 75 zoomSelection harness artifact).
   */
  _dockPanes: DockPane[] = [];
  _dockActive: DockPane | null = null;

  /** True while the Selection dock panel is visible. */
  get selectionPaneOpen(): boolean { return this._selectionPaneOpen; }
  /** Open/close a dock pane slot; see `dock-panes.ts` for the trial-measured layout. */
  setDockPane(pane: DockPane, open: boolean): void { setDockPaneHelper(this, pane, open); }
  /** True when `pane` is the visible pane of the dock stack. */
  dockPaneVisible(pane: DockPane): boolean { return dockPaneVisible(this, pane); }
  /** Show an already open pane (the tab rail click). */
  activateDockPane(pane: DockPane): void { activateDockPaneHelper(this, pane); }
  /** True while any dock pane is open (the stack container is mounted). */
  get dockStackOpen(): boolean { return dockStackOpen(this); }
  /** True while the PivotTable field-list dock panel is visible. */
  get pivotFieldListOpen(): boolean { return this._pivotFieldListOpen; }
  /** True after the field-list panel was opened once (trial keeps it in the DOM, hidden). */
  get pivotFieldListMounted(): boolean { return this._pivotFieldListMounted; }
  /** True while the Command Palette overlay is open. */
  get commandPaletteOpen(): boolean { return this._commandPaletteOpen; }
  /** True while the bottom formula-editor dock panel is visible. */
  get formulaEditorOpen(): boolean { return this._formulaEditorOpen; }
  /** Designer-side 'Show Auto-Highlight' preference of the Focus Cell menu. */
  get focusAutoHighlight(): boolean { return this._focusAutoHighlight; }
  /** Read-only copy of the most recently executed command names (feeds the Command Palette). */
  get recentCommands(): string[] { return [...this._recentCommands]; }

  /**
   * Command Palette candidates: every command with a human-readable title, optionally
   * fuzzy-filtered by `query` (substring matches rank before subsequence matches).
   */
  searchCommands(query: string, limit = 8): { name: string; title: string; iconClass?: string }[] {
    return searchDesignerCommands(this, query, limit);
  }

  /* formula bar ----------------------------------------------------------- */
  getSelectionInfo(): { reference: string; formula: string; value: unknown; canUndo: boolean; canRedo: boolean } {
    return getDesignerSelectionInfo(this);
  }
  commitFormula(text: string): void {
    commitFormula(this, text);
  }
  commitReference(reference: string): boolean {
    return commitDesignerReference(this, reference);
  }
  /* dialogs and themes ---------------------------------------------------- */
  /** Set while a ribbon/gallery command waits for the user to drag a rectangle on the sheet. */
  drawTool: DrawTool | null = null;
  /** Name of the shape whose text is edited inline, or whose Format Shape panel is open. */
  _editingShapeName: string | null = null;
  _formatShapePanel: string | null = null;
  /** Shape clipboard (names + serialized JSON of the copies). */
  _shapeClipboard: Record<string, unknown>[] | null = null;

  nextShapeName(base: string): string { return shapesOf(activeSheet(this)).nextName(base); }

  /** Arms the drag-on-sheet placement tool for shapes/text boxes/form controls. */
  armDrawTool(tool: NonNullable<Designer['drawTool']>): void { armDrawTool(this, tool); }
  /** Completes a draw-tool drag with the sheet-pixel rectangle the user drew. */
  finishDrawTool(box: { x: number; y: number; width: number; height: number }): void { finishDrawTool(this, box); }
  async placePicture(mode: 'in' | 'over'): Promise<void> { await placePicture(this, mode); }

  /** Opens the native file picker for picture insertion; resolves with a data URL. */
  pickImageFile(): Promise<{ src: string; name: string } | null> { return pickImageFile(this); }

  /** "Create camera shape" dialog with the current selection pre-filled ($A$1 style like the trial). */
  showCameraDialog(): void { showCameraDialog(this); }

  showBarcodeDialog(): void { showBarcodeDialog(this); }

  /** "Create Sparklines" dialog; `sparklineFunction` selects LINE/AREA/COLUMN/... formulas. */
  showSparklineDialog(sparklineFunction: string): void { showSparklineDialog(this, sparklineFunction); }

  showShapeLinkDialog(): void { showShapeLinkDialog(this); }

  /** Exports the selected shape as a PNG download ("Save as Picture"). */
  saveShapeAsPicture(): void { saveShapeAsPicture(this); }

  /* ===== Context menu dialogs (task 61) ===== */

  /** Cell Insert... dialog: radios like the trial, then the chosen shift on the model. */
  showInsertCellsDialog(): void { showInsertCellsDialog(this); }
  /** Cell Delete... dialog: radios like the trial, then the chosen shift on the model. */
  showDeleteCellsDialog(): void { showDeleteCellsDialog(this); }
  /** Paste Special... dialog (the trial's eleven paste options, five operations, skip blanks/transpose). */
  showPasteSpecial(): void { showPasteSpecial(this); }
  showCellTagDialog(row: number, col: number): void { showCellTagDialog(this, row, col); }
  /** Tag... on a row/column header cell: the trial titles these dialogs per header kind. */
  showHeaderTag(axis: 'row' | 'col', index: number): void { showHeaderTag(this, axis, index); }
  /** Tag... on the sheet corner. */
  showCornerTag(): void { showCornerTag(this); }
  showDefaultValueDialog(row: number, col: number): void { showDefaultValueDialog(this, row, col); }
  /** Rich text... editor for a cell (text + font; per-run styling is a known gap). */
  showRichTextDialog(row: number, col: number): void { showRichTextDialog(this, row, col); }
  /** Transform Cells... dialog: apply a `LAMBDA(x, expr)`-style formula to each selected cell. */
  showTransformCells(): void { showTransformCells(this); }
  /** Trial: Convert to Range asks "Do you want to convert the table to a normal range ?" first. */
  showConvertTableDialog(table: string): void { showConvertTableDialog(this, table); }
  showCreateCellTemplateDialog(): void { showCreateCellTemplateDialog(this); }
  /** New Cell Style... dialog (Cell Styles gallery footer). */
  showNewCellStyleDialog(): void { showNewCellStyleDialog(this); }
  createCustomCellStyle(name: string): void { createCustomCellStyle(this, name); }
  /* TASK 65: Format Table gallery footers (New Table Style... / Clear) and the
   * Cell Styles gallery's Manage Cell States manager with its Create dialog. */
  /** Working copy of the New Table Style dialog, kept across the Format... round-trip. */
  _tableStyleDraft: TableStyleDraft | undefined = undefined;
  /** Working copy of the Manage Cell States list, committed to the sheet on OK. */
  _cellStatesDraft: CellStatesDraft | null = null;
  /** New Table Style... dialog (Format Table gallery footer). */
  showNewTableStyleDialog(): void { showNewTableStyleDialog(this); }
  /** Format... on the New Table Style dialog's element list (Font/Border/Fill tabs). */
  editTableStyleElement(key: string): void { editTableStyleElement(this, key); }
  /** Clear on the New Table Style dialog: forget the selected element's style. */
  clearTableStyleElement(key: string): void { clearTableStyleElement(this, key); }
  /** Format Table gallery's Clear: remove the style of the table under the cursor. */
  clearTableStyleOfSelection(): void { clearTableStyleOfSelection(this); }
  /** Manage Cell States dialog (Cell Styles gallery footer). */
  showManageCellStatesDialog(): void { showManageCellStatesDialog(this); }
  /** Add Cell States: the Create Cell States dialog for a new row of the working list. */
  addCellState(): void { addCellState(this); }
  /** Remove Cell State: drop the selected row of the working list. */
  removeCellState(): void { removeCellState(this); }
  /** Format... of the Create Cell States dialog. */
  editCellStateStyle(): void { editCellStateStyle(this); }
  /** Range-picker button of the Create Cell States dialog. */
  pickCellStateRange(): void { pickCellStateRange(this); }
  /* TASK 65 item 4: the conditional-formatting rule dialogs (gallery footers and
   * the New Rule... / Manage Rules... buttons). */
  _conditionalRuleDraft: ConditionalRuleDraft | undefined = undefined;
  /** New Formatting Rule dialog; `preset` picks the rule kind the gallery opens. */
  showNewFormattingRuleDialog(preset?: string): void { showNewFormattingRule(this, preset); }
  /** Conditional Formatting Rules Manager dialog. */
  showConditionalRuleManager(): void { showRuleManagerDialog(this); }
  /** TASK 68: manager `Apply` / scope dropdown. */
  refreshConditionalRuleManager(scope?: string): void { refreshConditionalRuleManager(this, scope); }
  /** TASK 68: manager ▲/▼ reorder of one rule. */
  moveConditionalRule(index: number, delta: number): void { moveConditionalRule(this, index, delta); }
  /** The manager's New Rule... button. */
  newConditionalRule(): void { newConditionalRule(this); }
  /** The manager's Edit Rule... button. */
  editConditionalRule(index: number): void { editConditionalRule(this, index); }
  /** The manager's Duplicate button. */
  duplicateConditionalRule(index: number): void { duplicateConditionalRule(this, index); }
  /** The manager's Delete button. */
  deleteConditionalRule(index: number): void { deleteConditionalRule(this, index); }
  /** The Stop If True checkbox of a rule row. */
  toggleConditionalRuleStop(index: number, stop: boolean): void { toggleConditionalRuleStop(this, index, stop); }
  /** Format... inside the rule dialog (the Format Cells pick owned by the draft). */
  editConditionalRuleStyle(): void { editConditionalRuleStyle(this); }
  /** Headers... dialog (row/column header cells), entry point for the row/col context menus. */
  showHeadersDialog(axis?: 'row' | 'col', index?: number): void { showHeadersDialog(this, axis, index); }
  /** Outline Column... dialog (indicator options stored on the worksheet). */
  showOutlineColumnDialog(col?: number): void { showOutlineColumnDialog(this, col); }
  /** Chart Cut/Copy/z-order commands from the chart context menu. */
  executeChartCommand(name: string): void { executeChartCommand(this, name); }
  /** "Save as Picture" for charts: rasterize our SVG artwork to PNG and download. */
  saveChartAsPicture(chart: GC.Spread.Sheets.Charts.Chart): void { saveChartAsPicture(this, chart); }
  showChangeChartTypeDialog(chart: GC.Spread.Sheets.Charts.Chart): void { showChangeChartTypeDialog(this, chart); }
  showSelectDataDialog(chart: GC.Spread.Sheets.Charts.Chart): void { showSelectDataDialog(this, chart); }
  showMoveChartDialog(chart: GC.Spread.Sheets.Charts.Chart | null): void { showMoveChartDialog(this, chart); }
  showFormatChartAreaDialog(chart: GC.Spread.Sheets.Charts.Chart): void { showFormatChartAreaDialog(this, chart); }

  /** Inline text editing of a shape: a contentEditable overlay positioned over it. */
  beginShapeTextEdit(): void { beginShapeTextEdit(this); }

  /* Insert-tab shape commands (context menu / ribbon). */
  executeShapeCommand(name: string, value?: unknown): void { executeShapeCommand(this, name, value); }
  /** True when the active sheet has one or more selected floating shapes/pictures. */
  hasSelectedShapes(): boolean { return insertSelectedShapes(this).length > 0; }

  /** "Size and Position" dialog for the active shape (ribbon Size dropdown). */
  showShapeSizeDialog(shape: DesignerShape | undefined): void { showShapeSizeDialog(this, shape); }
  /** Number of selected shapes (the trial enables Group only for a selection of two or more). */
  selectedShapeCount(): number { return insertSelectedShapes(this).length; }

  /* Contextual-tab triggers (TASK 74): Table Design / Chart Design / Sparkline. */
  /** True while the active cell lies inside a table (trial's `TableSelected`). */
  hasActiveTable(): boolean { return hasActiveTable(this); }
  /** True while a floating chart is selected (trial's `CanFormatChart`). */
  hasSelectedChart(): boolean { return hasSelectedChart(this); }
  /** True while the active cell holds a cell sparkline (trial's `SparklineSelected`). */
  hasActiveSparkline(): boolean { return hasActiveSparkline(this); }
  /** True while the active cell holds a sparkline formula (trial's `FormulaSparklineSelected`). */
  hasActiveFormulaSparkline(): boolean { return hasActiveFormulaSparkline(this); }
  /** Chart Design tab: the trial's Alt Text dialog for the selected chart. */
  showChartAltTextDialog(): void { showChartAltTextDialog(this); }

  showFormatCells(tab?: string): void { showFormatCells(this, tab); }
  insertFunctionText(name: string, suffix = '('): void {
    this._formulaInsertion = { text: `=${name}${suffix}`, nonce: Date.now() };
    this.invalidate();
  }
  showInsertTable(): void { showInsertTable(this); }
  /* PivotTable UI (TASK 47). */
  /** True while the active cell is inside a pivot table (contextual tab trigger). */
  hasActivePivot(): boolean { return hasActivePivot(this); }
  /** The pivot table under the active cell (null when there is none). */
  activePivot(): PivotTableType | null { return activePivot(this); }
  showInsertPivotTable(): void { showInsertPivotTable(this); }
  showChangeDataSource(): void { showChangeDataSource(this); }
  showMovePivotTable(): void { showMovePivotTable(this); }
  showPivotFieldSettings(fieldName: string): void { showPivotFieldSettings(this, fieldName); }
  showValueFieldSettings(fieldName: string): void { showValueFieldSettings(this, fieldName); }
  showPivotTableOptions(): void { showPivotTableOptions(this); }
  /* TASK 77: the Fields, Items & Sets dialogs + Show Report Filter Pages. */
  showCalculatedField(): void { showCalculatedField(this); }
  showCalculatedItem(): void { showCalculatedItem(this); }
  showCalcItemSolveOrder(): void { showCalcItemSolveOrder(this); }
  showReportFilterPages(): void { showReportFilterPages(this); }
  showHyperlink(): void { showHyperlink(this); }
  /** Formulas ▸ Insert Function: search, category gallery and function gallery. */
  showInsertFunction(): void { showInsertFunction(this); }
  /** Opens the Function Arguments dialog for one function (see designer-data-dialogs). */
  openFunctionArguments(name: string): void { openFunctionArguments(this, name); }
  /** Writes a finished formula into the active cell through the undoable editor. */
  insertFormula(formula: string): void { insertFormula(this, formula); }
  /**
   * Range picker of the Function Arguments dialog: while a row is armed, the
   * next selection made in the sheet is written into that argument.
   */
  functionArgumentPicker = (index: number, done: (address: string) => void): void => {
    this._rangePick = index < 0 ? null : { index, done };
  };
  _rangePick: { index: number; done: (address: string) => void } | null = null;
  /** Name Manager: the names grid, the trial's filters and its toolbar. */
  showNameManager(): void { showNameManager(this); }
  showGoTo(): void { showGoTo(this); }
  showGoToSpecial(): void { showGoToSpecial(this); }
  showSeries(): void { showSeries(this); }
  private _nameBoxSelection: { name: string; row: number; col: number } | null = null;
  setNameBoxSelection(name: string, row: number, col: number): void { this._nameBoxSelection = { name, row, col }; }
  getNameBoxSelection(): { name: string; row: number; col: number } | null { return this._nameBoxSelection; }
  showNewName(previousId?: string): void { showNewName(this, previousId); }
  deleteName(id: string): void { deleteName(this, id); }
  /**
   * The trial confirms before removing a name: a message box with the name in
   * the sentence. Deleting does not create an undo unit there, so neither do we.
   */
  confirmDeleteName(id: string): void { confirmDeleteName(this, id); }
  showDataValidation(): void { showDataValidation(this); }
  /** Custom Sort dialog. The trial keeps the level list for the whole session. */
  showSort(): void { showSort(this); }
  showRemoveDuplicates(): void { showRemoveDuplicates(this); }
  showTextToColumns(): void { showTextToColumns(this); }
  showSubtotal(): void { showSubtotal(this); }
  /** The Subtotal dialog's Remove button: strip subtotal rows and outlines. */
  removeSubtotalsNow(data?: DialogData): void { removeSubtotalsNow(this, data); }
  /** Group ▸ Auto Outline; the trial asks before touching an existing outline. */
  showAutoOutline(): void { showAutoOutline(this); }
  /** Data Validation ▸ Circle Invalid Data / Clear Validation Circles. */
  showCircleInvalidData(): void { showCircleInvalidData(this); }
  showClearInvalidCircles(): void { showClearInvalidCircles(this); }
  showGoalSeek(): void { showGoalSeek(this); }
  showZoom(): void { showZoom(this); }
  /** Toggle the workbook-level Focus Cell highlight (active row/column tint). */
  toggleFocusCell(): void { toggleFocusCell(this); }
  clearSelectionCellType(): void { clearSelectionCellType(this); }
  applySelectionCellType(commandName: string): void { applySelectionCellType(this, commandName); }
  clearSelectionCellDropdown(): void { clearSelectionCellDropdown(this); }
  /** Set the Focus Cell tint colour (implies enabling the highlight). */
  applyFocusCellColor(color: string): void { applyFocusCellColor(this, color); }
  zoomToSelection(): void { zoomToSelection(this); }
  /** Official Protect Sheet dialog: 18 permission checkboxes plus an optional password. */
  showProtectSheet(): void { showProtectSheet(this); }
  /** Official "Confirm Password" companion dialog; callback receives null on cancel. */
  showConfirmPassword(done: (password: string | null) => void): void { showConfirmPassword(this, done); }
  /** Official Unprotect Sheet dialog: prompts for the password and reports mismatches. */
  showUnprotectSheet(): void { showUnprotectSheet(this); }
  /** Workbook structure protection dialogs (see designer-sheet-dialogs). */
  showProtectWorkbook(): void { showProtectWorkbook(this); }
  /** True while workbook structure protection (designer scope) is active. */
  get workbookStructureProtected(): boolean { return this._structureProtection.protected; }
  /** Returns false (and explains why) while structure protection blocks sheet lifecycle edits. */
  ensureStructureEditable(): boolean { return ensureStructureEditable(this); }
  /** Comment/thread overlay API of the active sheet's renderer (hover cards, editors). */
  commentUi(): CommentUiFacade {
    const view = internals(activeSheet(this))._view?.();
    const ui = view?.interaction?.commentUi;
    const noop = (): undefined => undefined;
    return ui ?? { openThread: noop, insertComment: noop, editComment: noop, deleteThread: noop, toggleComments: noop, stepThread: noop, commit: noop };
  }
  /** True while the threaded comments dock panel is open. */
  get threadedPanelOpen(): boolean {
    return this._showComments;
  }
  showFormatComment(): void { showFormatComment(this); }
  showInsertPicture(): void {
    this.notImplementedPlugin('Picture');
  }
  notImplementedPlugin(feature: string): void {
    this.showMessageBox(`${feature} requires a plugin that is not installed.\nInstall the corresponding SpreadJS plugin to use this feature.`, feature, 1);
  }
  /**
   * The trial's Page Layout tab seeds the print header/heading visibility and
   * the first page number into printInfo the first time the tab is shown, and
   * those values then appear in the saved JSON. Reproduced for parity.
   */
  syncPageLayoutDefaults(sheet: Worksheet): void { syncPageLayoutDefaults(this, sheet); }
  /** Opens the Themes / Colors / Fonts gallery anchored at its ribbon button. */
  openThemeMenu(command: string): void { openThemeMenu(this, command); }
  /**
   * Themes gallery: the trial applies the whole named built-in theme (its
   * colour *and* font scheme) through `sheet.currentTheme(name)`; the sheet
   * JSON then keeps the plain built-in name instead of a custom record.
   */
  applyWorkbookTheme(name: string): void { applyWorkbookTheme(this, name); }
  /** Colors gallery: replaces the colour scheme of every sheet's theme. */
  applyThemeColors(name: string): void { applyThemeColors(this, name); }
  /** Fonts gallery: replaces the font scheme of every sheet's theme. */
  applyThemeFonts(name: string): void { applyThemeFonts(this, name); }
  /** Print button / File > Print: run the core workbook print pipeline. */
  print(): void { printDesigner(this); }
  /** Sheet Background: opens the native file picker and stores the image URL. */
  pickWorksheetBackground(): void { pickWorksheetBackground(this); }
  showPageSetup(initialTab: 'page' | 'margins' | 'header' | 'print' = 'page'): void { showPageSetup(this, initialTab); }
  showCustomHeaderFooter(kind: 'header' | 'footer', current: Record<string, string>, done: (values: Record<string, string>) => void): void {
    showCustomHeaderFooter(this, kind, current, done);
  }
  showMoveOrCopySheet(): void { showMoveOrCopySheet(this); }

  showUnhideSheet(): void { showUnhideSheet(this); }

  showDimensionDialog(axis: 'row' | 'column'): void { showDimensionDialog(this, axis); }
  /** TASK 68: Standard Height / Standard Width (the `defaultRowHeight`/`defaultColumnWidth` commands). */
  showDefaultDimensionDialog(axis: 'row' | 'column'): void { showDefaultDimensionDialog(this, axis); }
  /** TASK 68: Insert Slicer dialog over the active sheet's pivot fields. */
  showInsertSlicerDialog(): void { showInsertSlicerDialog(this); }
  /** TASK 68: chart dialog commands (`changeChartTypeDialog`, `selectData`, `moveChartDialog`). */
  showChartCommandDialog(kind: 'changeChartType' | 'selectData' | 'moveChart'): void { showChartCommandDialog(this, kind); }
  /**
   * Opens the Spread Settings dialog. Every ribbon button of the group opens the
   * same window, each on its own tab (observed in the trial), and like the trial
   * nothing reaches the workbook until OK.
   */
  showSettings(command: string): void { showSettings(this, command); }
  /** Opens the Sheet Settings dialog for the active sheet. */
  showSheetSettings(command: string): void { showSheetSettings(this, command); }
  /** `Manage Icons` on the General tab: the workbook's built-in file icons. */
  showBuiltInFileIcons(): void { showBuiltInFileIcons(this); }
  /** `Manage Style`: the sheet-tab state styles of the workbook. */
  showTabStyleSettings(): void { showTabStyleSettings(this); }
  _settingsBefore: Record<string, SettingValue> | null = null;
  navigateComment(direction: number): void {
    const sheet = activeSheet(this);
    const comments = legacyCommentsOf(sheet);
    comments.sort((a, b) => a.rowIndex() - b.rowIndex() || a.colIndex() - b.colIndex());
    if (!comments.length) return;
    this._commentIndex = (this._commentIndex + direction + comments.length) % comments.length;
    const comment = comments[this._commentIndex];
    sheet.setSelection(comment.rowIndex(), comment.colIndex(), 1, 1);
    this.invalidate();
  }
  /**
   * Calculation mode of the Formulas tab's Calculation Options gallery. The
   * public `options.calculationMode` value is the source of truth (the trial
   * writes it too); suspending the calculation service is how our engine
   * implements the manual mode.
   */
  setCalculationMode(mode: 'automatic' | 'partial' | 'manual'): void {
    const previous = this.calculationMode;
    const wb = this.getWorkbook();
    const modes = this.gc.Spread.Sheets.CalculationMode;
    const value = mode === 'manual' ? modes.manual : mode === 'partial' ? modes.partial : modes.auto;
    if (wb.options) wb.options.calculationMode = value;
    if (mode === 'manual' && previous !== 'manual') wb.suspendCalcService(true);
    else if (previous === 'manual' && mode !== 'manual') wb.resumeCalcService(true);
    this.invalidate();
  }
  /** Calculation mode as the workbook reports it. */
  get calculationMode(): 'automatic' | 'partial' | 'manual' {
    const modes = this.gc.Spread.Sheets.CalculationMode;
    const value = this.getWorkbook().options?.calculationMode;
    if (value === modes.manual) return 'manual';
    if (value === modes.partial) return 'partial';
    return 'automatic';
  }
  /** Recalculates everything (F9 / Calculate Now) or the active sheet (Shift+F9). */
  calculate(all: boolean): void {
    const wb = this.getWorkbook();
    wb.calculate(all ? 0 : 1);
    this.invalidate();
  }

  openFind(mode: 'find' | 'replace', searchText?: string): void {
    this.findController.open(mode, searchText);
  }
  showDialog(
    templateName: string, bindingData: DialogData, successCallback: DialogSuccessCallback,
    errCallback?: DialogErrorCallback, validCallback?: DialogValidCallback, popupElement?: HTMLElement,
  ): void;
  showDialog(
    templateName: string, bindingData: DialogData, successCallback: DesignerEventHandler,
    errCallback?: DesignerEventHandler, validCallback?: DesignerEventHandler, popupElement?: HTMLElement,
  ): void;
  showDialog(
    templateName: string, bindingData: DialogData, successCallback: DesignerEventHandler,
    errCallback?: DesignerEventHandler, validCallback?: DesignerEventHandler, popupElement?: HTMLElement,
  ): void {
    const template = getTemplateRaw(templateName);
    if (!template) { (errCallback as DialogErrorCallback | undefined)?.(new Error(`Template not found: ${templateName}`)); return; }
    this.dialog = {
      name: templateName, template, data: deepClone(bindingData ?? {}),
      success: successCallback as DialogSuccessCallback,
      error: errCallback as DialogErrorCallback | undefined,
      valid: validCallback as DialogValidCallback | undefined,
      popupElement, nonce: Date.now(),
    };
    this.invalidateNow();
  }
  closeDialog(templateName: string, submitValue: boolean): void {
    if (!this.dialog || this.dialog.name !== templateName) return;
    const dialog = this.dialog;
    if (submitValue) {
      let valid = true;
      try { valid = dialog.valid ? dialog.valid(dialog.data) !== false : true; } catch (error) { valid = false; dialog.error?.(error); }
      if (!valid) { this.invalidate(); return; }
      this.dialog = null;
      this.invalidateNow();
      try { dialog.success?.(dialog.data); } catch (error) {
        if (dialog.error) dialog.error(error);
        else this.showMessageBox(String((error as Error)?.message ?? error), 'Error', 3);
      }
    } else {
      this.dialog = null;
      this.invalidateNow();
      dialog.error?.(new Error('Cancelled'));
    }
  }
  showMessageBox(
    text: string, title: string, icon: MessageBoxIcon, successCallback?: MessageBoxCallback,
    errCallback?: () => void, buttons?: MessageBoxButtons,
  ): void;
  showMessageBox(
    text: string, title: string, icon: MessageBoxIcon, successCallback?: DesignerEventHandler,
    errCallback?: DesignerEventHandler, buttons?: MessageBoxButtons,
  ): void;
  showMessageBox(
    text: string, title: string, icon: MessageBoxIcon, successCallback?: DesignerEventHandler,
    errCallback?: DesignerEventHandler, buttons?: MessageBoxButtons,
  ): void {
    this.messageBox = {
      text, title, icon, buttons: buttons ?? 0,
      success: successCallback as MessageBoxCallback | undefined,
      error: errCallback as (() => void) | undefined,
      nonce: Date.now(),
    };
    this.invalidateNow();
  }
  closeMessageBox(result: number): void {
    const box = this.messageBox;
    if (!box) return;
    this.messageBox = null;
    this.invalidateNow();
    if (result === 0) box.error?.(); else box.success?.(result);
  }
  registerTemplate(name: string, template: IDialogTemplate): void { registerTemplate(name, template); }
  getTemplate(name: string): IDialogTemplate | null { return getTemplate(name); }
  setTheme(theme: Partial<ITheme> | null): void {
    this.theme = theme ? { ...this.theme, ...theme } : { ...defaultTheme };
    this.applyThemeToHost();
    this.invalidate();
  }
  getTheme(): ITheme { return { ...this.theme }; }
  applyThemeToHost(): void {
    const css = themeToCss(this.theme);
    for (const [key, value] of Object.entries(css)) this.host.style.setProperty(key, value);
    this.host.dataset.theme = this.theme.colorBackground === '#1f1f1f' || this.theme.colorBackground === '#252526' ? 'dark' : 'light';
  }

  /* file operations ------------------------------------------------------- */
  newWorkbook(): void { newWorkbook(this); }
  async openFile(file?: File): Promise<void> { await openFile(this, file); }
  saveFile(asNew = false): void { saveFile(this, asNew); }
  saveAs(): void { saveFile(this, true); }

  /* helpers --------------------------------------------------------------- */
  private updateGlobalCommands(): void {
    for (const [name, command] of Object.entries(this.config.commandMap ?? {})) {
      if (!command.execute) command.execute = (context, _propertyName, value) => (context as Designer).executeBuiltin(name, _propertyName, value);
    }
  }
}

export function getActiveDesigner(): Designer | undefined { return getActive() as Designer | undefined; }
export function findControl(host: HTMLElement | string): Designer | undefined {
  const element = typeof host === 'string' ? document.getElementById(host) : host;
  if (!element) return undefined;
  for (const designer of [getActive()]) if (designer?.host === element) return designer as Designer | undefined;
  return undefined;
}

/* installDesigner and DesignerEventsClass live in install.ts (the namespace
 * mount point); `src/index.ts` and `src/browser.ts` import them from there.
 * They are deliberately NOT re-exported here: install.ts imports the Designer
 * class as a value, so importing install.ts from this file would be a cycle. */

export { CommandNames, TemplateNames, DefaultConfig, ToolBarModeConfig };
export type { ICommand, IDesignerConfig, IDialogTemplate, ITheme, MessageBoxButtons, MessageBoxIcon, CommandState };
export { DialogHost };
