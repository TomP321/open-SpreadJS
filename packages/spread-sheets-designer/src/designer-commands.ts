/* Command routing of the Designer class: `executeCommand` (the command-map
 * entry), `executeBuiltin` (undo-aware routing) and `executeSpecial` (the
 * big switch of dialog / plugin / shape / view commands that need no undo
 * unit). The class methods are thin wrappers around these functions. */
import type { DesignerApi as Designer } from './designer-api.js';
import type { ICommand } from './types.js';
import { setDockPane } from './dock-panes.js';
import { internals, workbookOptionsRecord } from './core-internals.js';
import { applyBuiltin, activeSheet, currentStyle, isUndoableAction, topCell } from './commands/actions.js';
import { executeContextualCommand, isContextualCommand } from './contextual-actions.js';
import { executePivotCommand, isPivotCommand } from './pivot-designer.js';
import { messageText } from './resolve.js';

export function executeDesignerCommand(d: Designer, commandName: string, propertyName?: string, value?: unknown): boolean {
  const command = d.getCommand(commandName) as ICommand | undefined;
  if (!command) {
    /* Compatibility (TASK 68): the trial's commandMap routes dialog commands such as
     * `insertCells`, `rowHeight`, `indicatorPage`, `defineName` or `barCodeSetting`
     * through `executeCommand`; ours keeps them in the builtin switch, so reach for
     * it before the plugin / formula-name fallbacks. */
    if (executeDesignerSpecial(d, commandName, value, propertyName)) {
      if (!d._recentCommands.includes(commandName)) d._recentCommands.unshift(commandName);
      d._recentCommands.length = Math.min(d._recentCommands.length, 8);
      return true;
    }
    if (/^[A-Z][A-Z0-9.]*$/.test(commandName)) { d.insertFunctionText(commandName); return true; }
    if (/chart|sparkline|shape|picture|camera|formControl|placeInCells|placeOverCells|schema|Binding|dataTable|scenario/i.test(commandName)) {
      d.notImplementedPlugin(commandName.replace(/([a-z0-9])([A-Z])/g, '$1 $2'));
      return true;
    }
    return false;
  }
  try {
    /* TASK 84 R2 — `Designer.executeCommand` is OUR extension API (the official Designer exposes
     * neither `executeCommand` nor `Designer.execute`: `.probe/t84/r1-r2-probe.json`, R2 facts),
     * and its bare-call contract since RC1 is a toggle: `executeCommand('fontWeight')` — used by
     * `style.cellButtons` commands (designer-events.ts) — bolds a normal cell. So hand the command
     * the same shape the ribbon checkbox produces (property name + the NEXT state, read the way
     * designer-state.ts computes `checked`). The trial-measured builtin path is untouched:
     * `getCommand(name).execute(designer)` → `executeBuiltin` with no value still writes `normal`
     * exactly as the TASK 75 sweep recorded ("fontWeight materialising"). */
    const toggled = propertyName === undefined && value === undefined && (commandName === 'fontWeight' || commandName === 'fontItalic');
    if (command.execute) command.execute(d, toggled ? commandName : propertyName, toggled ? nextFontToggle(d, commandName) : value);
    // The palette button itself is a UI toggle, not an "action" worth remembering.
    if (commandName !== 'commandPaletteButton' && !d._recentCommands.includes(commandName)) d._recentCommands.unshift(commandName);
    d._recentCommands.length = Math.min(d._recentCommands.length, 8);
    return true;
  } catch (error) {
    console.error(error);
    d.showMessageBox(String((error as Error)?.message ?? error), messageText(d, 'error', 'Error'), 3);
    return false;
  }
}

/* TASK 75 r3: trial command names that just re-enter an existing canonical command
 * (paste-variant / dialog aliases). */
const COMMAND_ALIASES: Record<string, string> = {
  contextMenuCopy: 'copy', contextMenuCut: 'cut',
  designerPasteAll: 'pasteAll', designerPasteFormatting: 'pasteFormatting', designerPasteValues: 'pasteValues',
  link: 'insertHyperLink', editHyperlink: 'insertHyperLink',
  // TASK 75 r5 sweep (`missing-ours`): the trial's big Paste button is named `paste` and re-enters
  // the same paste-all code as `pasteAll`.
  paste: 'pasteAll',
};
/* TASK 75 r3 probe: the trial registers these names but without an `execute` — the
 * context-menu actions call internal code instead. A bare `getCommand(name).execute()`
 * is impossible there and must not change the model on our side either. */
const INERT_COMMAND_NAMES = new Set([
  'contextMenuPaste', 'insertCopiedCells', 'insertCutCells', 'sort',
  'gc.spread.contextMenu.insertRows', 'gc.spread.contextMenu.deleteRows',
  'gc.spread.contextMenu.insertColumns', 'gc.spread.contextMenu.deleteColumns',
  'gc.spread.contextMenu.hideRows', 'gc.spread.contextMenu.unhideRows',
  'gc.spread.contextMenu.hideColumns', 'gc.spread.contextMenu.unhideColumns',
  'gc.spread.contextMenu.clearContents', 'gc.spread.contextMenu.insertSheet',
  'gc.spread.contextMenu.deleteSheet', 'gc.spread.contextMenu.hideSheet',
  'gc.spread.contextMenu.filter', 'gc.spread.contextMenu.insertComment',
  'gc.spread.contextMenu.deleteComment', 'gc.spread.contextMenu.toggleComment',
  /* TASK 75 r5 probe (.probe/t75r5/p9.json): the trial registers these Pivot-tab names as
   * dropdown/group hosts with NO `execute` at all — clicking them cannot run anything, so a
   * bare execute must stay inert here too instead of throwing NotImplemented. */
  'pivotTableGrandTotals', 'pivotTableSubtotals', 'pivotTableReportLayout',
  'pivotTableBlankRows', 'pivotTableClearList', 'pivotTableFieldsItemsSets',
  /* Same probe: every one of these ribbon parents (gallery split buttons, the Cells / Editing /
   * styles dropdowns, the Page Layout text toggles and the Scale-to-Fit labels) is registered by
   * the trial WITHOUT an `execute` — the real work is done by their children (`mergeCenterButton`,
   * `columnClusteredChart`, `marginNormal`, …). Ours routes the children already. */
  'cellStyles', 'cellsDelete', 'cellsFormat', 'cellsInsert',
  'columnOrBarChartPreview', 'comboChartPreview', 'funnelOrStockChartPreview', 'lineOrAreaChartPreview',
  'pieOrDoughnutChartPreview', 'scatterOrBubbleChartPreview', 'treeMapOrSunburstChartPreview',
  'conditionFormat', 'formatTable2',
  'pageLayoutGridLineSeparator', 'pageLayoutGridlinesText', 'pageLayoutHeadingsText',
  'scaleToFitHeightText', 'scaleToFitScaleText', 'scaleToFitWidthText',
  /* `mergeCenter` is the trial's dropdown parent: its own `execute` exists but changes nothing on
   * a bare call (`.probe/t75r5/p9.json`) — the children (`mergeCenterButton`, `mergeCells`,
   * `mergeAcross`, `unmerge`) do the merging, and our ribbon opens the dropdown for this name. */
  'mergeCenter',
  /* TASK 77 probe (.probe/t77/run/t77-pivot-probe3.json): the trial's `pivotTableStyleListContent`
   * has an `execute`, but a bare call changes nothing and opens nothing — the PivotTable Styles
   * gallery is rendered by the dropdown host (`tabSpecs.pivotTableStyleListContent`), so a bare
   * execute stays inert here too. */
  'pivotTableStyleListContent',
]);

/* TASK 84 R2: next state of the bold/italic toggles, read the same way the ribbon checkbox
 * computes its `checked` state (see designer-state.ts) so a toggle always flips what the UI shows. */
function nextFontToggle(d: Designer, commandName: 'fontWeight' | 'fontItalic'): boolean {
  const style = currentStyle(d);
  if (commandName === 'fontWeight') return !/bold|[6-9]00/.test(String(style.fontWeight ?? ''));
  return !/italic|oblique/.test(String(style.fontStyle ?? ''));
}

export function executeDesignerBuiltin(d: Designer, commandName: string, propertyName?: string, value?: unknown): void {
  if (INERT_COMMAND_NAMES.has(commandName)) return;
  const aliased = COMMAND_ALIASES[commandName];
  if (aliased && aliased !== commandName) { executeDesignerBuiltin(d, aliased, propertyName ?? commandName, value); return; }
  if ((commandName === 'insertSheet' || commandName === 'deleteSheet') && !d.ensureStructureEditable()) return;
  /* Trial (TASK 75 sweep): New Threaded Comment on a bare execute (no ribbon property
   * name) creates an EMPTY thread record at the active cell without opening the composer. */
  if (commandName === 'NewThreadedComment' && propertyName === undefined) {
    const s = activeSheet(d);
    s.threadedComments.add(Math.max(0, s.getActiveRowIndex()), Math.max(0, s.getActiveColumnIndex()));
    d.invalidate();
    return;
  }
  const special = d.executeSpecial(commandName, value, propertyName);
  if (special) return;
  if (isUndoableAction(commandName)) {
    d.runUndoable(commandName, { propertyName, value });
  } else {
    applyBuiltin(d, commandName, { propertyName, value });
    d.invalidate();
  }
}

/* TASK 75: `propertyName` distinguishes the ribbon path (the controls pass the command
 * name) from a bare `getCommand(name).execute(designer)` — several trial commands are
 * no-ops or apply directly on the bare path (the Cell Types gallery). TASK 84 R1 removed
 * the one Remove Duplicates exception: every path opens the dialog, like the live trial. */
export function executeDesignerSpecial(d: Designer, name: string, value: unknown, propertyName?: string): boolean {
  // PivotTable UI commands (TASK 47): dialogs, panel toggle and Analyze/Design actions.
  if (isPivotCommand(name)) return executePivotCommand(d, name, value);
  // Contextual-tab commands (TASK 74): Table Design / Chart Design / Sparkline.
  if (isContextualCommand(name)) return executeContextualCommand(d, name, value);
  switch (name) {
    case 'formatCells': d.showFormatCells(); return true;
    /* TASK 68: the trial routes these commandMap names through executeCommand, too. */
    case 'insertCells': d.showInsertCellsDialog(); return true;
    case 'deleteCells': d.showDeleteCellsDialog(); return true;
    case 'defaultRowHeight': d.showDefaultDimensionDialog('row'); return true;
    case 'defaultColumnWidth': d.showDefaultDimensionDialog('column'); return true;
    case 'indicatorPage': d.showPageSetup(typeof value === 'string' ? value as 'page' | 'margins' | 'header' | 'print' : 'page'); return true;
    case 'defineName': d.showNewName(); return true;
    case 'cellStates': d.showManageCellStatesDialog(); return true;
    case 'addCellState': d.addCellState(); return true;
    case 'insertSlicer': d.showInsertSlicerDialog(); return true;
    case 'barCodeSetting': d.showBarcodeDialog(); return true;
    case 'changeChartTypeDialog': d.showChartCommandDialog('changeChartType'); return true;
    case 'selectData': d.showChartCommandDialog('selectData'); return true;
    case 'moveChartDialog': d.showChartCommandDialog('moveChart'); return true;
    case 'formatMore': d.showFormatCells('number'); return true;
    case 'formatCellAlignment': d.showFormatCells('alignment'); return true;
    case 'moreBorder': d.showMessageBox(messageText(d, 'moreBordersNote', 'More Borders is available through the Format Cells dialog.'), messageText(d, 'borders', 'Borders'), 1); return true;
    case 'find': case 'editingFind': case 'findCommand': d.openFind('find'); return true;
    case 'replace': case 'replaceCommand': d.openFind('replace'); return true;
    case 'goto': d.showGoTo(); return true;
    case 'gotoSpecial': d.showGoToSpecial(); return true;
    case 'openPasteSpecialDialog': d.showPasteSpecial(); return true;
    case 'series': d.showSeries(); return true;
    case 'headers': d.showHeadersDialog(); return true;
    case 'newCellStyle': d.showNewCellStyleDialog(); return true;
    /* TASK 65: the Format Table / Cell Styles gallery footers. */
    case 'newTableStyle': d.showNewTableStyleDialog(); return true;
    case 'clearTableStyle': d.clearTableStyleOfSelection(); return true;
    case 'manageCellState': d.showManageCellStatesDialog(); return true;
    /* TASK 65 item 4: the conditional-formatting gallery footers and buttons —
     * every "More Rules..." opens the New Formatting Rule dialog with the rule
     * kind the gallery stands for, exactly like the trial's presets. */
    case 'highlightCellsMoreRules': d.showNewFormattingRuleDialog('contain'); return true;
    case 'topBottomRulesMoreRules': d.showNewFormattingRuleDialog('topBottom'); return true;
    case 'moreDataBarRules': d.showNewFormattingRuleDialog('dataBar'); return true;
    case 'moreColorScaleRules': d.showNewFormattingRuleDialog('colorScale'); return true;
    case 'moreIconSetRules': d.showNewFormattingRuleDialog('iconSet'); return true;
    case 'conditionFormatNewRule': d.showNewFormattingRuleDialog('style'); return true;
    case 'conditionFormatManageRule': d.showConditionalRuleManager(); return true;
    case 'ribbonButtonButtonCellType': case 'checkboxCellType': case 'comboBoxCellType':
    case 'fileUploadCellType': case 'hyperlinkCellType': case 'rangeTemplateCellType':
    case 'dataObjectCellType': case 'diagonalCellType': case 'checkboxListCellType':
    case 'radioListCellType': case 'buttonListCellType': case 'calculatorCellType':
    case 'colorPickerCellType': case 'dateTimePickerCellType': case 'listCellType':
    case 'monthPickerCellType': case 'sliderCellType': case 'timePickerCellType':
      /* TASK 75 r3 probe: on the trial a BARE execute of the Cell Types gallery commands is
       * a no-op (the JSON stays untouched); only the ribbon path (propertyName set) inserts
       * the type. */
      if (propertyName === undefined) return true;
      d.applySelectionCellType(name); return true;
    /* TASK 75: the trial clears the cell's type / dropdown buttons through the style
     * (serialized as `cellType: null` / `cellButtons: []`). */
    case 'clearCellType': d.clearSelectionCellType(); return true;
    case 'clearCellDropdown': d.clearSelectionCellDropdown(); return true;
    case 'workflowList': case 'multiColumnPicker': case 'namedCellTemplatesListContent':
      d.showMessageBox(messageText(d, 'cellEditorsNote', 'Cell templates and cell editors arrive in M6b.'), 'SpreadJS Designer', 1); return true;
    case 'undo': d.getWorkbook().undoManager().undo(); d.invalidate(); return true;
    case 'redo': d.getWorkbook().undoManager().redo(); d.invalidate(); return true;
    case 'formatTableListContent': d.runUndoable(name, { value }); return true;
    case 'cellStylesListContent': d.runUndoable(name, { value }); return true;
    case 'insertTable': case 'insertTableFromDataTable': d.showInsertTable(); return true;
    case 'placeInCells': void d.placePicture('in'); return true;
    case 'placeOverCells': void d.placePicture('over'); return true;
    case 'insertCameraShape': d.showCameraDialog(); return true;
    case 'insertBarCode': d.showBarcodeDialog(); return true;
    case 'InsertTextBox': d.armDrawTool({ kind: 'textBox' }); return true;
    case 'insertShape': d.armDrawTool({ kind: 'shape', galleryId: 'rectangle' }); return true;
    case 'insertShapeRectangle': d.armDrawTool({ kind: 'shape', galleryId: 'rectangle' }); return true;
    case 'insertShapeEllipse': d.armDrawTool({ kind: 'shape', galleryId: 'oval' }); return true;
    case 'insertShapeLine': d.armDrawTool({ kind: 'shape', galleryId: 'noHeadStraight' }); return true;
    case 'insertShapeArrow': d.armDrawTool({ kind: 'shape', galleryId: 'endArrowHeadStraight' }); return true;
    case 'insertShapeTriangle': d.armDrawTool({ kind: 'shape', galleryId: 'isoscelesTriangle' }); return true;
    case 'insertShapeDiamond': d.armDrawTool({ kind: 'shape', galleryId: 'diamond' }); return true;
    case 'insertFormControlButton': d.armDrawTool({ kind: 'formControl', controlId: 'button' }); return true;
    case 'insertFormControlCheckbox': d.armDrawTool({ kind: 'formControl', controlId: 'checkbox' }); return true;
    case 'insertFormControlCombo': d.armDrawTool({ kind: 'formControl', controlId: 'combobox' }); return true;
    case 'insertFormControlList': d.armDrawTool({ kind: 'formControl', controlId: 'listbox' }); return true;
    case 'sparklinesLineSparkline': d.showSparklineDialog('LINESPARKLINE'); return true;
    case 'sparklinesAreaSparkline': d.showSparklineDialog('AREASPARKLINE'); return true;
    case 'sparklinesColumnSparkline': d.showSparklineDialog('COLUMNSPARKLINE'); return true;
    case 'sparklinesWinLossSparkline': d.showSparklineDialog('WINLOSSSPARKLINE'); return true;
    case 'sparklinesHBarSparkline': d.showSparklineDialog('HBARSPARKLINE'); return true;
    case 'sparklinesVBarSparkline': d.showSparklineDialog('VBARSPARKLINE'); return true;
    case 'sparklinesPieSparkline': d.showSparklineDialog('PIESPARKLINE'); return true;
    /* TASK 93 item 3: the extended formula sparklines. The trial opens the
     * generic Create Sparklines dialog for STACKED/CASCADE/PARETO/HISTOGRAM/
     * SCATTER/SPREADS/BOXPLOT and a dedicated per-argument dialog for
     * MONTH/YEAR/BULLET/GAUGE/PROGRESS/RANGEBLOCK/VARIANCE/LOLLIPOP/IMAGE
     * (all sizes/fields measured black-box); OK writes the formula and the
     * core draws it (features/sparkline-draw.ts). */
    case 'sparklinesStackedSparkline': d.showSparklineDialog('STACKEDSPARKLINE'); return true;
    case 'sparklinesCascadeSparkline': d.showSparklineDialog('CASCADESPARKLINE'); return true;
    case 'sparklinesParetoSparkline': d.showSparklineDialog('PARETOSPARKLINE'); return true;
    case 'sparklinesHistogramSparkline': d.showSparklineDialog('HISTOGRAMSPARKLINE'); return true;
    case 'sparklinesScatterSparkline': d.showSparklineDialog('SCATTERSPARKLINE'); return true;
    case 'sparklinesSpreadsSparkline': d.showSparklineDialog('SPREADSPARKLINE'); return true;
    case 'sparklinesMonthSparkline': d.showSparklineDialog('MONTHSPARKLINE'); return true;
    case 'sparklinesYearSparkline': d.showSparklineDialog('YEARSPARKLINE'); return true;
    case 'sparklinesBoxPlotSparkline': d.showSparklineDialog('BOXPLOTSPARKLINE'); return true;
    case 'sparklinesBulletSparkline': d.showSparklineDialog('BULLETSPARKLINE'); return true;
    case 'sparklinesVarianceSparkline': d.showSparklineDialog('VARISPARKLINE'); return true;
    case 'sparklinesRangeBlockSparkline': d.showSparklineDialog('RANGEBLOCKSPARKLINE'); return true;
    case 'sparklinesGaugeKPISparkline': d.showSparklineDialog('GAUGEKPISPARKLINE'); return true;
    case 'sparklineImageSparkline': d.showSparklineDialog('IMAGE'); return true;
    case 'sparklinesLollipopVarianceSparkline': d.showSparklineDialog('LOLLIPOPVARISPARKLINE'); return true;
    case 'sparklinesProgressSparkline': d.showSparklineDialog('PROGRESSSPARKLINE'); return true;
    case 'insertShapeGalleryItem': d.armDrawTool({ kind: 'shape', galleryId: String(value ?? 'rectangle') }); return true;
    case 'insertFormControlGalleryItem': d.armDrawTool({ kind: 'formControl', controlId: String(value ?? 'button') }); return true;
    case 'formatShapes': case 'editShapeText': case 'editShapeHyperlink': case 'removeShapeHyperlink':
    case 'saveAsPicture': case 'bringShapeForward': case 'sendShapeBackward': case 'bringShapeToFront':
    case 'sendShapeToBack': case 'shapeGroup': case 'shapeUnGroup': case 'deleteShapes':
    case 'shapeFormatInsertShapes': case 'changeShape': case 'shapeAltText': case 'shapeRotate':
    case 'shapeArrange': case 'shapeAlign': case 'shapeSize': case 'shapeFormatPane':
    case 'shapeStyle1': case 'shapeStyle2': case 'shapeStyle3': case 'shapeStyle4': case 'shapeStyle5': case 'shapeStyle6': case 'shapeStyle7':
    case 'contextMenuCutShapes': case 'contextMenuCopyShapes': case 'pasteShapes':
      d.executeShapeCommand(name, value); return true;
    case 'copy': case 'cut': {
      internals(activeSheet(d))._clipboardCopy(name === 'cut');
      d.invalidate();
      return true;
    }
    case 'insertHyperLink': d.showHyperlink(); return true;
    /* TASK 75 r3: trial command names with their own execute — unhide dialog, tab colour
     * picker, hyperlink removal over the selection; the panel toggles change no model. */
    case 'contextMenuUnhideSheet': d.showUnhideSheet(); return true;
    case 'showTabColor': d.showTabStyleSettings(); return true;
    case 'removeHyperlink': d.runUndoable('removeHyperlinks', {}); return true;
    case 'fileMenuPanel': d.fileMenuOpen = !d.fileMenuOpen; d.invalidate(); return true;
    case 'formulaBarPanel': case 'statusBarPanel': d.invalidate(); return true;
    case 'insertFunction': d.showInsertFunction(); return true;
    case 'nameManager': d.showNameManager(); return true;
    case 'newName': case 'newNameCommand': d.showNewName(); return true;
    case 'dataValidation': case 'dropdownDataValidation': case 'dataValidationInReportSheet': d.showDataValidation(); return true;
    case 'customSortData': case 'customSortEditing': d.showSort(); return true;
    case 'removeDuplicates':
      /* TASK 84 R1 (live re-probe on `?side=official`, 2026-11-21): a bare
       * `getCommand('removeDuplicates').execute(designer)` OPENS the "Remove Duplicates"
       * dialog and changes no data — every path opens the dialog. The TASK 75 r3
       * "bare = immediate de-dup" probe no longer reproduces and contradicted the paired
       * spec that was green through RC1, so the immediate branch is gone. */
      d.showRemoveDuplicates(); return true;
    case 'textToColumn': d.showTextToColumns(); return true;
    case 'subtotal': d.showSubtotal(); return true;
    case 'autoOutline': d.showAutoOutline(); return true;
    /* Trial (TASK 75 probe): Circle Invalid Data does not open a dialog — it sets the
     * workbook-wide `highlightInvalidData` flag (the renderer draws the ovals);
     * Clear Invalid Circles drops it again (key absent from the JSON). */
    case 'circleInvalidDataCommand': workbookOptionsRecord(d.getWorkbook()).highlightInvalidData = true; d.invalidate(); return true;
    case 'clearInvalidCircles': delete workbookOptionsRecord(d.getWorkbook()).highlightInvalidData; d.invalidate(); return true;
    case 'goalSeek': d.showGoalSeek(); return true;
    case 'zoom': d.showZoom(); return true;
    case 'rowHeight': case 'cellFormatRowHeight': d.showDimensionDialog('row'); return true;
    case 'columnWidth': case 'cellFormatColumnWidth': d.showDimensionDialog('column'); return true;
    case 'zoomDefault': activeSheet(d).zoom(1); d.invalidate(); return true;
    case 'zoomSelection': d.zoomToSelection(); d.invalidate(); return true;
    case 'focusCell': case 'focusCellMenuItem': d.toggleFocusCell(); return true;
    case 'focusCellShowAutoHighlight': d._focusAutoHighlight = !d._focusAutoHighlight; d.invalidate(); return true;
    case 'selectionPaneButton': setDockPane(d, 'selection', !d._selectionPaneOpen); return true;
    case 'commandPaletteButton': d._commandPaletteOpen = !d._commandPaletteOpen; d.invalidate(); return true;
    case 'showFormulaEditorPanel': d._formulaEditorOpen = !d._formulaEditorOpen; d.invalidate(); return true;
    case 'cellFormatProtectSheet': case 'protectSheet': d.showProtectSheet(); return true;
    case 'unProtectSheet': case 'unprotectSheet': d.showUnprotectSheet(); return true;
    case 'protectWorkbook': case 'unprotectWorkbook': d.showProtectWorkbook(); return true;
    /* Trial (TASK 75 sweep): a bare execute creates an EMPTY thread at the active cell
     * (no composer, no dialog); only the ribbon path opens the UI composer. */
    case 'NewThreadedComment': d.commentUi().openThread(); return true;
    case 'gc.spread.contextMenu.insertComment': d.commentUi().insertComment(); return true;
    case 'formatComment': d.showFormatComment(); return true;
    case 'DeleteThreadedComment': {
      const s = activeSheet(d); const p = topCell(s);
      if (s.threadedComments.get(p.row, p.col)) s.threadedComments.remove(p.row, p.col);
      d.invalidate(); return true;
    }
    case 'gc.spread.contextMenu.deleteComment': {
      const s = activeSheet(d); const p = topCell(s);
      s.comments.remove(p.row, p.col); d.invalidate(); return true;
    }
    case 'PreviousThreadedComment': d.commentUi().stepThread(false); d.invalidate(); return true;
    case 'NextThreadedComment': d.commentUi().stepThread(true); d.invalidate(); return true;
    case 'ShowThreadedComments': setDockPane(d, 'threaded', !d._showComments); return true;
    case 'ThemeSetting': d.openThemeMenu('ThemeSetting'); return true;
    case 'ThemeColors': d.openThemeMenu('ThemeColors'); return true;
    case 'ThemeFonts': d.openThemeMenu('ThemeFonts'); return true;
    case 'print': case 'filePrint': d.print(); return true;
    case 'worksheetBackground': d.pickWorksheetBackground(); return true;
    case 'deleteWorksheetBackground': internals(activeSheet(d)).backgroundImage(null); d.invalidate(); return true;
    case 'printTitles': d.showPageSetup('print'); return true;
    // Like the trial, the Page Setup big buttons open their dropdown menu;
    // only the menu items and the group launcher act on the model/dialog.
    case 'margins': case 'printArea': case 'breaks': case 'paperSize': case 'orientation':
      d.openThemeMenu(name); return true;
    case 'customMargins': d.showPageSetup('margins'); return true;
    case 'spreadSettingGeneral': case 'spreadSettingScrollBar': case 'spreadSettingCalculation': case 'spreadSettingTabStrip': d.showSettings(name); return true;
    case 'sheetSettingGeneral': case 'sheetSettingGridLine': case 'sheetSettingHeaders': d.showSheetSettings(name); return true;
    default: return false;
  }
}
