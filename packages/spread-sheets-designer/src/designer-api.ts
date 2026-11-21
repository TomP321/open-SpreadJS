/**
 * Shared designer contracts: the dialog/message-box data shapes and the
 * public surface of the Designer used by the command, ribbon and dialog
 * helper modules.
 *
 * This module is a LEAF: it imports types from the core bridge and the
 * public option types only, never from `designer.ts` or the UI, so any
 * module can depend on it without creating an import cycle. `Designer`
 * (in designer.ts) structurally implements `DesignerApi`.
 */
import type { IDesignerCommandContext, IDialogTemplate, MessageBoxIcon, MessageBoxButtons } from './types.js';
import type { DesignerShape, GCRoot, SelectionRange, Style, Worksheet } from './core-internals.js';
import type GC from '@mescius/spread-sheets';
import type { SortLevel } from './data-engine.js';
import type { SettingValue } from './settings-model.js';

/**
 * Dialog binding data: the record the template renderer and the dialog
 * callbacks share (mutated in place by the renderer, read by the callback).
 */
export type DialogData = Record<string, unknown>;

/**
 * The official d.ts declares the dialog/message-box callbacks as `Function`.
 * Each public entry point carries two overloads: the typed
 * first overload serves inline callbacks (parameters inferred as `DialogData`),
 * the loose second one keeps external callbacks that were written with their
 * own narrower parameter types compiling, exactly as `Function` did.
 */
export type DesignerEventHandler = (...args: never[]) => unknown;
export type DialogSuccessCallback = (data: DialogData) => void;
export type DialogValidCallback = (data: DialogData) => boolean | void;
export type DialogErrorCallback = (error: unknown) => void;
export type MessageBoxCallback = (result: number) => void;

/** Right-dock stack panes (TASK 77): the Selection pane, the threaded comments panel and the PivotTable field list. */
export type DockPane = 'threaded' | 'selection' | 'pivot';

export interface DesignerEvents {
  [key: string]: ((...args: unknown[]) => void)[];
}

export interface DialogState {
  name: string;
  template: IDialogTemplate;
  data: DialogData;
  success?: DialogSuccessCallback;
  error?: DialogErrorCallback;
  valid?: DialogValidCallback;
  popupElement?: HTMLElement;
  nonce: number;
  initialTab?: string;
}

export interface MessageBoxState {
  text: string;
  title: string;
  icon: MessageBoxIcon;
  buttons: MessageBoxButtons;
  success?: MessageBoxCallback;
  error?: () => void;
  nonce: number;
}

/** Payload of a right-click on the sheet area / row / col / corner / tab / object. */
export interface ContextMenuState {
  x: number;
  y: number;
  kind: 'cell' | 'row' | 'col' | 'corner' | 'tab' | 'shape' | 'chart';
  row: number;
  col: number;
  objectName?: string;
}

/** Payload of an open ribbon dropdown, anchored at the control's client rect. */
export interface RibbonMenuState {
  command: string;
  anchor: DOMRect;
  level: number;
  nonce: number;
}

/** Set while a ribbon/gallery command waits for the user to drag a rectangle on the sheet. */
export interface DrawTool {
  kind: 'shape' | 'textBox' | 'formControl' | 'range';
  galleryId?: string;
  controlId?: string;
  onDone?: (box: { x: number; y: number; width: number; height: number }) => void;
}

/** Surface of the core comment overlay used by designer commands. */
export interface CommentUiFacade {
  openThread(): void;
  insertComment(): void;
  editComment(): void;
  deleteThread(): void;
  toggleComments(): void;
  stepThread(next: boolean): unknown;
  commit(): void;
}

/** One copied cell of the designer clipboard. */
export interface ClipCell { value: unknown; formula: string | null; style: unknown }

/** Designer clipboard payload (a copied rectangle of the active sheet). */
export interface ClipboardData { cells: ClipCell[][]; cut: boolean; sheet: Worksheet; range: SelectionRange }

/** Payload of the Find/Replace dialog: the search criteria the ribbon dialog collects. */
/** Search options of the Find/Replace dialog (type alias so the dialog's `DialogData` record can be viewed through it with a plain assertion). */
export type FindSearchOptions = {
  searchText?: string;
  replaceText?: string;
  within?: string;
  searchOrder?: string;
  lookIn?: string;
  matchCase?: boolean;
  matchExactly?: boolean;
  useWildcards?: boolean;
  ignoreHidden?: boolean;
  results?: FindSearchResult[];
  resultsLabel?: string;
}

/** One Find All result row. */
export interface FindSearchResult { book: string; sheet: string; cell: string; value: string; row: number; col: number; sheetIndex: number }

/** Surface of the FindReplaceController the Find/Replace dialog template drives (declared structurally to keep designer-api.ts independent of find.ts). */
export interface DesignerFindController {
  open(mode: 'find' | 'replace'): void;
  findNext(data: FindSearchOptions): boolean;
  findAll(data: FindSearchOptions): FindSearchResult[];
  replaceNext(data: FindSearchOptions): boolean;
  replaceAll(data: FindSearchOptions): number;
}

/**
 * The public surface of the Designer class that the command, state, dialog,
 * shape and ribbon helper modules rely on. Keeping it here (instead of
 * importing the class) lets those modules be imported BY designer.ts without
 * an import cycle.
 */
export interface DesignerApi extends IDesignerCommandContext {
  readonly gc: GCRoot;
  readonly host: HTMLElement;
  readonly sheetHost: HTMLElement;
  /** Merged resource (label) table the ribbon, dialogs and message boxes resolve against. */
  resources: Record<string, unknown>;

  /* UI state (mutated by the shell components and the command dispatch) */
  dialog: DialogState | null;
  messageBox: MessageBoxState | null;
  activeTab: string;
  collapsed: boolean;
  fileMenuOpen: boolean;
  openMenu: RibbonMenuState | null;
  /** Control that opened the currently open ribbon popup (TASK 60 item 1: pressing it again
   *  dismisses the popup instead of re-opening it). */
  _menuOwner: HTMLElement | null;
  /** Set by the outside-pointerdown dismissal when the press landed on `_menuOwner`. */
  _menuToggleClosedByPress: boolean;
  openList: string | null;
  contextMenu: ContextMenuState | null;
  drawTool: DrawTool | null;
  /** Name of the shape whose text is edited inline, or whose Format Shape panel is open. */
  _editingShapeName: string | null;
  _formatShapePanel: string | null;
  /** Shape clipboard (names + serialized JSON of the copies). */
  _shapeClipboard: Record<string, unknown>[] | null;
  _formatPainterStyle: Style | null;
  _applyingPainter: boolean;
  /** TASK 70 trial parity: cached enabled state of the eight Insert-tab chart launchers.
   * Computed at designer creation (empty workbook), recomputed only after a user-driven
   * `SelectionChanged` (`byUser: true`) or an active-sheet change — never on data/API
   * writes. Measured with paired probes; see `commands/insert.ts` chartCommandsEnabled. */
  _chartLauncherState?: { value: boolean; dirty: boolean } | undefined;
  _clipboard: ClipboardData | null;
  /** Chart Cut/Copy payload (chart JSON); consumed by paste when a chart is copied. */
  _chartClipboard: { cut: boolean; items: Record<string, unknown>[] } | null;
  /** Custom Sort level list remembered across opens (trial session state). */
  _sortSettings: { levels: SortLevel[]; hasHeaders: boolean; byRows: boolean } | null;
  /** Last `Series` dialog options; the trial reuses them on the next open (not re-derived from the selection). */
  _seriesSettings: { seriesIn: string; type: string; unit: string; trend: boolean; step: string; stop: string } | null;
  /** Sheets whose Page Layout defaults have been synced into printInfo (trial parity). */
  _pageSetupSynced: WeakSet<object>;
  _protectedWorkbook: boolean;
  _structureProtection: { protected: boolean; password: string };
  _focusCell: boolean;
  _focusAutoHighlight: boolean;
  /** Paper menu used at least once this session (TASK 55 checkbox behavior). */
  _paperTouched: boolean;
  _selectionPaneOpen: boolean;
  _commandPaletteOpen: boolean;
  _formulaEditorOpen: boolean;
  /** PivotTable docked field-list panel (TASK 47): open flag + shown pivot name. */
  _pivotFieldListOpen: boolean;
  /** True after the field-list panel has been opened once (stays mounted, hidden). */
  _pivotFieldListMounted: boolean;
  _pivotFieldListName: string | null;
  /**
   * TASK 77 (trial probes t77-follow/t77-manualclose/t77-reopen): while true the panel follows
   * the selection into a pivot; a MANUAL close (Field List toggle, panel X button, or a Field
   * List execution with no active pivot) switches the follow off until a pivot is created or the
   * Field List command opens the panel on an active pivot again.
   */
  _pivotFieldListFollow: boolean;
  /** Open chevron menu of a field-list panel item (page pixel anchor). */
  _pivotItemMenu: { fieldName: string; x: number; y: number; nonce: number } | null;
  /** Command names recently run through executeCommand, most recent first (feeds the Command Palette). */
  _recentCommands: string[];
  _formulaInsertion: { text: string; nonce: number } | null;
  _commentIndex: number;
  _showComments: boolean;
  /** TASK 77: open dock panes in mount order and the visible one (see the trial-measured comment in designer.ts). */
  _dockPanes: DockPane[];
  _dockActive: DockPane | null;
  _settingsBefore: Record<string, SettingValue> | null;
  _rangePick: { index: number; done: (address: string) => void } | null;
  /** Undo-bridge bookkeeping (sheet registry keyed by the numbers sent with command payloads). */
  _undoTarget?: string;
  _undoSheets: Map<number, Worksheet>;
  _undoSheetIds: WeakMap<object, number>;
  /** Workbook event subscriptions (re-bound on setWorkbook, released on destroy). */
  _workbookHandlers: [string, DesignerEventHandler][];

  /* lifecycle & versioning */
  subscribe(callback: () => void): () => void;
  getVersion(): number;

  /* config & commands (the base IDesignerCommandContext supplies getConfig,
   * getCommand, executeCommand, executeBuiltin, executeSpecial, runUndoable,
   * getCommandState, setCommandState, showDialog, closeDialog,
   * closeMessageBox, invalidate, refresh, ...) */
  invalidateNow(): void;
  searchCommands(query: string, limit?: number): { name: string; title: string; iconClass?: string }[];
  readonly recentCommands: string[];

  /* workbook */
  calculate(all: boolean): void;
  setCalculationMode(mode: 'automatic' | 'partial' | 'manual'): void;
  readonly calculationMode: 'automatic' | 'partial' | 'manual';

  findController: DesignerFindController;
  /** Range picker of the Function Arguments dialog (see the class member docs). */
  functionArgumentPicker(index: number, done: (address: string) => void): void;

  /* file operations (Backstage) */
  newWorkbook(): void;
  openFile(file?: File): Promise<void>;
  saveFile(asNew?: boolean): void;
  saveAs(): void;

  /* dialogs & message boxes */
  showMessageBox(
    text: string, title: string, icon: MessageBoxIcon, successCallback?: MessageBoxCallback,
    errCallback?: () => void, buttons?: MessageBoxButtons,
  ): void;
  showMessageBox(
    text: string, title: string, icon: MessageBoxIcon, successCallback?: DesignerEventHandler,
    errCallback?: DesignerEventHandler, buttons?: MessageBoxButtons,
  ): void;
  showPasteSpecial(): void;
  showFormatCells(tab?: string): void;
  showInsertCellsDialog(): void;
  showDeleteCellsDialog(): void;
  showCellTagDialog(row: number, col: number): void;
  showHeaderTag(axis: 'row' | 'col', index: number): void;
  showCornerTag(): void;
  showDefaultValueDialog(row: number, col: number): void;
  showRichTextDialog(row: number, col: number): void;
  showTransformCells(): void;
  showConvertTableDialog(table: string): void;
  showCreateCellTemplateDialog(): void;
  showOutlineColumnDialog(col?: number): void;
  showHeadersDialog(axis?: 'row' | 'col', index?: number): void;
  showNewCellStyleDialog(): void;
  createCustomCellStyle(name: string): void;
  /* TASK 65: Format Table gallery footers and the Cell Styles gallery's manager. */
  /** Working copy of the New Table Style dialog (kept across the Format... round-trip). */
  _tableStyleDraft: import('./dialogs/TableStyleDialogs.js').TableStyleDraft | undefined;
  /** Working copy of the Manage Cell States list (committed on OK). */
  _cellStatesDraft: import('./designer-custom-styles.js').CellStatesDraft | null;
  showNewTableStyleDialog(): void;
  editTableStyleElement(key: string): void;
  clearTableStyleElement(key: string): void;
  clearTableStyleOfSelection(): void;
  showManageCellStatesDialog(): void;
  addCellState(): void;
  removeCellState(): void;
  editCellStateStyle(): void;
  pickCellStateRange(): void;
  /* TASK 65 item 4: the conditional-formatting rule dialogs. */
  /** Draft of the New Formatting Rule dialog (kept across the Format... round-trip). */
  _conditionalRuleDraft: import('./designer-conditional-formatting.js').ConditionalRuleDraft | undefined;
  showNewFormattingRuleDialog(preset?: string): void;
  showConditionalRuleManager(): void;
  newConditionalRule(): void;
  editConditionalRule(index: number): void;
  duplicateConditionalRule(index: number): void;
  /** TASK 68: CF Rules Manager Apply/scope + reorder. */
  refreshConditionalRuleManager(scope?: string): void;
  moveConditionalRule(index: number, delta: number): void;
  deleteConditionalRule(index: number): void;
  toggleConditionalRuleStop(index: number, stop: boolean): void;
  editConditionalRuleStyle(): void;
  showInsertTable(): void;
  /* PivotTable UI (TASK 47). */
  hasActivePivot(): boolean;
  activePivot(): GC.Spread.Pivot.PivotTable | null;
  showInsertPivotTable(): void;
  showChangeDataSource(): void;
  showMovePivotTable(): void;
  showPivotFieldSettings(fieldName: string): void;
  showValueFieldSettings(fieldName: string): void;
  showPivotTableOptions(): void;
  /* TASK 77: PivotTable Analyze ▸ Fields, Items & Sets dialogs (Calculated Field / Calculated
   * Item / Solve Order) and the Show Report Filter Pages confirmation. */
  showCalculatedField(): void;
  showCalculatedItem(): void;
  showCalcItemSolveOrder(): void;
  showReportFilterPages(): void;
  showHyperlink(): void;
  showInsertFunction(): void;
  openFunctionArguments(name: string): void;
  showNameManager(): void;
  showGoTo(): void;
  showGoToSpecial(): void;
  showSeries(): void;
  /** Remember a defined name for the name box (trial: the clicked name stays until the active cell moves). */
  setNameBoxSelection(name: string, row: number, col: number): void;
  getNameBoxSelection(): { name: string; row: number; col: number } | null;
  showNewName(previousId?: string): void;
  showDataValidation(): void;
  showSort(): void;
  showRemoveDuplicates(): void;
  showTextToColumns(): void;
  showSubtotal(): void;
  showAutoOutline(): void;
  showCircleInvalidData(): void;
  showClearInvalidCircles(): void;
  showGoalSeek(): void;
  showZoom(): void;
  showProtectSheet(): void;
  showUnprotectSheet(): void;
  showProtectWorkbook(): void;
  showConfirmPassword(done: (password: string | null) => void): void;
  showFormatComment(): void;
  showInsertPicture(): void;
  showMoveOrCopySheet(): void;
  showUnhideSheet(): void;
  showDimensionDialog(axis: 'row' | 'column'): void;
  showSettings(command: string): void;
  showSheetSettings(command: string): void;
  showBuiltInFileIcons(): void;
  showTabStyleSettings(): void;
  showCameraDialog(): void;
  showBarcodeDialog(): void;
  showSparklineDialog(sparklineFunction: string): void;
  showShapeLinkDialog(): void;
  showShapeSizeDialog(shape: DesignerShape | undefined): void;
  showChangeChartTypeDialog(chart: GC.Spread.Sheets.Charts.Chart): void;
  showSelectDataDialog(chart: GC.Spread.Sheets.Charts.Chart): void;
  showMoveChartDialog(chart: GC.Spread.Sheets.Charts.Chart | null): void;
  showDefaultDimensionDialog(axis: 'row' | 'column'): void;
  showInsertSlicerDialog(): void;
  showChartCommandDialog(kind: 'changeChartType' | 'selectData' | 'moveChart'): void;
  showFormatChartAreaDialog(chart: GC.Spread.Sheets.Charts.Chart): void;
  openFind(mode: 'find' | 'replace', searchText?: string): void;
  openThemeMenu(command: string): void;
  insertFormula(formula: string): void;
  deleteName(id: string): void;
  confirmDeleteName(id: string): void;
  removeSubtotalsNow(data?: DialogData): void;
  navigateComment(direction: number): void;
  ensureStructureEditable(): boolean;
  readonly workbookStructureProtected: boolean;
  commentUi(): CommentUiFacade;
  readonly threadedPanelOpen: boolean;
  readonly selectionPaneOpen: boolean;
  /** True while the PivotTable field-list dock panel is visible. */
  readonly pivotFieldListOpen: boolean;
  /** True after the field-list panel was opened once (mounted but hidden while closed). */
  readonly pivotFieldListMounted: boolean;
  readonly commandPaletteOpen: boolean;
  readonly formulaEditorOpen: boolean;
  readonly focusAutoHighlight: boolean;

  /* shapes & charts */
  nextShapeName(base: string): string;
  armDrawTool(tool: DrawTool): void;
  finishDrawTool(box: { x: number; y: number; width: number; height: number }): void;
  placePicture(mode: 'in' | 'over'): Promise<void>;
  pickImageFile(): Promise<{ src: string; name: string } | null>;
  beginShapeTextEdit(): void;
  executeShapeCommand(name: string, value?: unknown): void;
  executeChartCommand(name: string): void;
  saveShapeAsPicture(): void;
  saveChartAsPicture(chart: GC.Spread.Sheets.Charts.Chart): void;
  hasSelectedShapes(): boolean;
  selectedShapeCount(): number;

  /* Contextual-tab triggers (TASK 74): which object the current selection names. */
  hasActiveTable(): boolean;
  hasSelectedChart(): boolean;
  hasActiveSparkline(): boolean;
  hasActiveFormulaSparkline(): boolean;
  /** Opens the trial's chart "Alt Text" dialog for the selected chart. */
  showChartAltTextDialog(): void;

  /* view & print */
  getSelectionInfo(): { reference: string; formula: string; value: unknown; canUndo: boolean; canRedo: boolean };
  commitFormula(text: string): void;
  commitReference(reference: string): boolean;
  toggleFocusCell(): void;
  clearSelectionCellType(): void;
  applySelectionCellType(commandName: string): void;
  clearSelectionCellDropdown(): void;
  applyFocusCellColor(color: string): void;
  zoomToSelection(): void;
  /**
   * Open/close a pane slot of the shared right dock (TASK 77): keeps the mount order, hands
   * activation to the newest open pane (closing the active one falls back to the previous pane,
   * trial-measured) and syncs the pane's own open flag (`_showComments`, `_selectionPaneOpen`,
   * `_pivotFieldListOpen`).
   */
  setDockPane(pane: DockPane, open: boolean): void;
  /** True when `pane` is the visible pane of the dock stack. */
  dockPaneVisible(pane: DockPane): boolean;
  /** Show an already open pane (tab rail click). */
  activateDockPane(pane: DockPane): void;
  /** True while any dock pane is open (the stack container is mounted). */
  readonly dockStackOpen: boolean;
  print(): void;
  syncPageLayoutDefaults(sheet: Worksheet): void;
  pickWorksheetBackground(): void;
  showPageSetup(initialTab?: 'page' | 'margins' | 'header' | 'print'): void;
  showCustomHeaderFooter(kind: 'header' | 'footer', current: Record<string, string>, done: (values: Record<string, string>) => void): void;
  applyWorkbookTheme(name: string): void;
  applyThemeColors(name: string): void;
  applyThemeFonts(name: string): void;
  registerTemplate(name: string, template: IDialogTemplate): void;
  getTemplate(name: string): IDialogTemplate | null;
}
