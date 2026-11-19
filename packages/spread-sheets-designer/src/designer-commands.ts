/* Command routing of the Designer class: `executeCommand` (the command-map
 * entry), `executeBuiltin` (undo-aware routing) and `executeSpecial` (the
 * big switch of dialog / plugin / shape / view commands that need no undo
 * unit). The class methods are thin wrappers around these functions. */
import type { DesignerApi as Designer } from './designer-api.js';
import type { ICommand } from './types.js';
import { internals } from './core-internals.js';
import { applyBuiltin, activeSheet, isUndoableAction, topCell } from './commands/actions.js';
import { executePivotCommand, isPivotCommand } from './pivot-designer.js';

export function executeDesignerCommand(d: Designer, commandName: string, propertyName?: string, value?: unknown): boolean {
  const command = d.getCommand(commandName) as ICommand | undefined;
  if (!command) {
    /* Compatibility (TASK 68): the trial's commandMap routes dialog commands such as
     * `insertCells`, `rowHeight`, `indicatorPage`, `defineName` or `barCodeSetting`
     * through `executeCommand`; ours keeps them in the builtin switch, so reach for
     * it before the plugin / formula-name fallbacks. */
    if (executeDesignerSpecial(d, commandName, value)) {
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
    if (command.execute) command.execute(d, propertyName, value);
    // The palette button itself is a UI toggle, not an "action" worth remembering.
    if (commandName !== 'commandPaletteButton' && !d._recentCommands.includes(commandName)) d._recentCommands.unshift(commandName);
    d._recentCommands.length = Math.min(d._recentCommands.length, 8);
    return true;
  } catch (error) {
    console.error(error);
    d.showMessageBox(String((error as Error)?.message ?? error), 'Error', 3);
    return false;
  }
}

export function executeDesignerBuiltin(d: Designer, commandName: string, propertyName?: string, value?: unknown): void {
  if ((commandName === 'insertSheet' || commandName === 'deleteSheet') && !d.ensureStructureEditable()) return;
  const special = d.executeSpecial(commandName, value);
  if (special) return;
  if (isUndoableAction(commandName)) {
    d.runUndoable(commandName, { propertyName, value });
  } else {
    applyBuiltin(d, commandName, { propertyName, value });
    d.invalidate();
  }
}

export function executeDesignerSpecial(d: Designer, name: string, value: unknown): boolean {
  // PivotTable UI commands (TASK 47): dialogs, panel toggle and Analyze/Design actions.
  if (isPivotCommand(name)) return executePivotCommand(d, name, value);
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
    case 'moreBorder': d.showMessageBox('More Borders is available through the Format Cells dialog.', 'Borders', 1); return true;
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
    case 'workflowList': case 'multiColumnPicker': case 'clearCellType': case 'clearCellDropdown':
    case 'namedCellTemplatesListContent':
      d.showMessageBox('Cell templates and cell editors arrive in M6b.', 'SpreadJS Designer', 1); return true;
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
    case 'sparklinesStackedSparkline': case 'sparklinesCascadeSparkline': case 'sparklinesParetoSparkline':
    case 'sparklinesHistogramSparkline': case 'sparklinesScatterSparkline': case 'sparklinesSpreadsSparkline':
    case 'sparklinesMonthSparkline': case 'sparklinesYearSparkline': case 'sparklinesBoxPlotSparkline':
    case 'sparklinesBulletSparkline': case 'sparklinesVarianceSparkline': case 'sparklinesRangeBlockSparkline':
    case 'sparklinesGaugeKPISparkline': case 'sparklineImageSparkline': case 'sparklinesLollipopVarianceSparkline':
    case 'sparklinesProgressSparkline':
      d.showMessageBox(`NotImplemented: ${name} requires the extended sparkline formula set.`, 'Create Sparklines', 1); return true;
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
    case 'insertFunction': d.showInsertFunction(); return true;
    case 'nameManager': d.showNameManager(); return true;
    case 'newName': case 'newNameCommand': d.showNewName(); return true;
    case 'dataValidation': case 'dropdownDataValidation': case 'dataValidationInReportSheet': d.showDataValidation(); return true;
    case 'customSortData': case 'customSortEditing': d.showSort(); return true;
    case 'removeDuplicates': d.showRemoveDuplicates(); return true;
    case 'textToColumn': d.showTextToColumns(); return true;
    case 'subtotal': d.showSubtotal(); return true;
    case 'autoOutline': d.showAutoOutline(); return true;
    case 'circleInvalidDataCommand': d.showCircleInvalidData(); return true;
    case 'clearInvalidCircles': d.showClearInvalidCircles(); return true;
    case 'goalSeek': d.showGoalSeek(); return true;
    case 'zoom': d.showZoom(); return true;
    case 'rowHeight': case 'cellFormatRowHeight': d.showDimensionDialog('row'); return true;
    case 'columnWidth': case 'cellFormatColumnWidth': d.showDimensionDialog('column'); return true;
    case 'zoomDefault': activeSheet(d).zoom(1); d.invalidate(); return true;
    case 'zoomSelection': d.zoomToSelection(); d.invalidate(); return true;
    case 'focusCell': case 'focusCellMenuItem': d.toggleFocusCell(); return true;
    case 'focusCellColor': d.applyFocusCellColor(String(value ?? '#00b050')); return true;
    case 'focusCellShowAutoHighlight': d._focusAutoHighlight = !d._focusAutoHighlight; d.invalidate(); return true;
    case 'selectionPaneButton': d._selectionPaneOpen = !d._selectionPaneOpen; d.invalidate(); return true;
    case 'commandPaletteButton': d._commandPaletteOpen = !d._commandPaletteOpen; d.invalidate(); return true;
    case 'showFormulaEditorPanel': d._formulaEditorOpen = !d._formulaEditorOpen; d.invalidate(); return true;
    case 'cellFormatProtectSheet': case 'protectSheet': d.showProtectSheet(); return true;
    case 'unProtectSheet': case 'unprotectSheet': d.showUnprotectSheet(); return true;
    case 'protectWorkbook': case 'unprotectWorkbook': d.showProtectWorkbook(); return true;
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
    case 'ShowThreadedComments': d._showComments = !d._showComments; d.invalidate(); return true;
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
