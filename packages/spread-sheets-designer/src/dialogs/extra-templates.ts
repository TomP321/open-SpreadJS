/* The built-in dialog templates added after the Format Cells and Find/Replace
 * dialogs (M6b onward): tables, hyperlinks, functions, names, data operations,
 * protection, page setup, sheet management, cell types, shapes/charts and the
 * paste-special and style dialogs. Pure declarative template data; the
 * registry wiring lives in templates.ts. */
import type { IDialogTemplate, IComponentRenderType } from '../types.js';
import { TemplateNames } from '../names-generated.js';
import { buttonCtx, check, col, editor, number, row, select, text } from './template-helpers.js';

/** TASK 87: dialog captions are placeholders under res.dialogs, resolved by the dialog host. */
const sr = (key: string): string => `\${res.dialogs.${key}}`;

/* M6b dialogs ------------------------------------------------------------- */
/**
 * TASK 68: the trial's Create Table dialog is tiny — the question, one range
 * editor with the range-picker button and OK/Cancel. The header row is
 * detected from the data (`showInsertTable`), not asked for.
 */
const insertTableTemplate: IDialogTemplate = {
  templateName: TemplateNames.InsertTableDialogTemplate ?? 'insertTableDialogTemplate',
  title: sr('createTable'), modal: true,
  content: [
    text(sr('whereIsTheDataForYourTable'), 'gc-create-table-question'),
    row([editor('range', 'gc-insert-table-range gc-create-table-range'), { type: 'RangePickButton', target: 'range', className: 'gc-create-table-pick' }], 'gc-create-table-range-row'),
  ],
  buttons: [{ text: '${res.ok}', buttonType: 'Ok', closeAfterClick: true }, { text: '${res.cancel}', buttonType: 'Cancel', closeAfterClick: true }],
};

const hyperlinkTemplate: IDialogTemplate = {
  templateName: TemplateNames.HyperlinkDialogTemplate ?? 'hyperlinkDialogTemplate',
  title: sr('hyperlink'), modal: true,
  content: [
    row([text(sr('textToDisplay'), 'gc-dialog-label'), editor('text', 'gc-hyperlink-text')]),
    row([text(sr('screenTip'), 'gc-dialog-label'), editor('tooltip', 'gc-hyperlink-tooltip')]),
    row([text(sr('target'), 'gc-dialog-label'), select('target', [
      { text: sr('blank'), value: 'blank' }, { text: sr('self'), value: 'self' }, { text: sr('parent'), value: 'parent' }, { text: sr('topFrame'), value: 'top' },
    ], 'gc-hyperlink-target')]),
    row([text(sr('linkColor'), 'gc-dialog-label'), { type: 'ColorPicker', bindingPath: 'linkColor', className: 'gc-hyperlink-color' }, { type: 'Button', text: sr('reset'), command: 'resetLinkColor' }]),
    row([text(sr('visitedLinkColor'), 'gc-dialog-label'), { type: 'ColorPicker', bindingPath: 'visitedLinkColor', className: 'gc-hyperlink-color' }, { type: 'Button', text: sr('reset'), command: 'resetVisitedLinkColor' }]),
    {
      type: 'TabControl', className: 'gc-hyperlink-tabs', items: [
        { key: 'web', text: sr('webPage'), children: [text(sr('linkToAWebPage')), row([text(sr('address'), 'gc-dialog-label'), editor('address', 'gc-hyperlink-address')])] },
        { key: 'document', text: sr('thisDocument'), children: [text(sr('typeTheCellReference')), row([text(sr('location2'), 'gc-dialog-label'), editor('reference', 'gc-hyperlink-reference')])] },
        { key: 'email', text: sr('emailAddress'), children: [row([text(sr('eMailAddress'), 'gc-dialog-label'), editor('email', 'gc-hyperlink-email')]), row([text(sr('subject'), 'gc-dialog-label'), editor('subject', 'gc-hyperlink-subject')])] },
      ],
    },
  ],
  buttons: [
    { text: sr('remove'), closeAfterClick: false, click: (context) => { const ctx = buttonCtx(context); ctx.data.remove = true; ctx.designer.closeDialog(TemplateNames.HyperlinkDialogTemplate ?? 'hyperlinkDialogTemplate', true); return false; } },
    { text: '${res.ok}', buttonType: 'Ok', closeAfterClick: true },
    { text: '${res.cancel}', buttonType: 'Cancel', closeAfterClick: true },
  ],
};

/**
 * Insert Function: search box, the two galleries and the signature/description
 * line. Structure follows the trial's dialog (`Designer.getTemplate` shows a
 * FlexContainer with a search editor, a `Function Category:` / `Function List:`
 * column set and a description column).
 */
const insertFunctionTemplate: IDialogTemplate = {
  templateName: TemplateNames.InsertFunctionDialogTemplate ?? 'insertFunctionDialogTemplate',
  title: sr('insertFunction'), modal: true,
  content: [{ type: 'InsertFunctionEditor', className: 'gc-insertFunction-dialog' }],
  buttons: [{ text: '${res.ok}', buttonType: 'Ok', closeAfterClick: true }, { text: '${res.cancel}', buttonType: 'Cancel', closeAfterClick: true }],
};

/**
 * Function Arguments — the trial calls this dialog's template
 * `moreFunctionDialogTemplate`: function name, one row per argument, the
 * description and the `Formula = NAME(...)` preview.
 */
const functionArgumentsTemplate: IDialogTemplate = {
  templateName: TemplateNames.MoreFunctionDialogTemplate ?? 'moreFunctionDialogTemplate',
  title: sr('functionArguments'), modal: true,
  content: [{ type: 'FunctionArgumentsEditor' }],
  buttons: [{ text: '${res.ok}', buttonType: 'Ok', closeAfterClick: true }, { text: '${res.cancel}', buttonType: 'Cancel', closeAfterClick: true }],
};

/** Name Manager: toolbar, filter combo and the names grid; only a Close button. */
const nameManagerTemplate: IDialogTemplate = {
  templateName: TemplateNames.NameManagerDialogTemplate ?? 'nameManagerDialogTemplate',
  title: sr('nameManager'), modal: true, resizable: true,
  content: [{ type: 'NameManager' }],
  buttons: [{ text: '${res.close}', buttonType: 'Cancel', closeAfterClick: true }],
};

const newNameTemplate: IDialogTemplate = {
  templateName: TemplateNames.NewNameTemplate ?? 'newNameTemplate', title: sr('newName'), modal: true,
  content: [
    row([text(sr('name2'), 'gc-dialog-label'), editor('name', 'gc-name-editor')]),
    row([text(sr('scope2'), 'gc-dialog-label'), { type: 'ComboBox', bindingPath: 'scope', itemsPath: 'scopes', className: 'gc-name-scope' }]),
    row([text(sr('referTo'), 'gc-dialog-label'), editor('refersTo', 'gc-name-refers')]),
    row([text(sr('comment2'), 'gc-dialog-label'), { type: 'TextArea', bindingPath: 'comment', className: 'gc-name-comment' }]),
  ],
  buttons: [{ text: '${res.ok}', buttonType: 'Ok', closeAfterClick: true }, { text: '${res.cancel}', buttonType: 'Cancel', closeAfterClick: true }],
};

/** Spread Settings: the seven tabs of the trial's workbook settings window. */
const spreadSettingTemplate: IDialogTemplate = {
  templateName: TemplateNames.SpreadSettingDialogTemplate ?? 'spreadSettingDialogTemplate',
  title: sr('spreadSettings'), modal: true,
  content: [{ type: 'SpreadSettingsEditor', bindingPath: 'tabOption', className: 'tab-control' }],
  buttons: [{ text: '${res.ok}', buttonType: 'Ok', closeAfterClick: true }, { text: '${res.cancel}', buttonType: 'Cancel', closeAfterClick: true }],
};

/** Sheet Settings: the four tabs of the trial's worksheet settings window. */
const sheetSettingTemplate: IDialogTemplate = {
  templateName: TemplateNames.SheetSettingDialogTemplate ?? 'sheetSettingDialogTemplate',
  title: sr('sheetSettings'), modal: true,
  content: [{ type: 'SheetSettingsEditor', bindingPath: 'tabOption' }],
  buttons: [{ text: '${res.ok}', buttonType: 'Ok', closeAfterClick: true }, { text: '${res.cancel}', buttonType: 'Cancel', closeAfterClick: true }],
};

/** Built-in file icon manager behind the General tab's `Manage Icons` button. */
const builtInFileIconsTemplate: IDialogTemplate = {
  templateName: TemplateNames.BuiltInFileIconsDialogTemplate ?? 'BuiltInFileIconsDialogTemplate',
  title: sr('builtInFileIconSetting'), modal: true,
  content: [{ type: 'BuiltInFileIconsEditor', bindingPath: 'icons' }],
  buttons: [{ text: '${res.ok}', buttonType: 'Ok', closeAfterClick: true }, { text: '${res.cancel}', buttonType: 'Cancel', closeAfterClick: true }],
};

/** Sheet-tab state style manager behind the `Manage Style` buttons. */
const tabStyleSettingTemplate: IDialogTemplate = {
  templateName: TemplateNames.TabStyleSettingDialogTemplate ?? 'TabStyleSettingDialogTemplate',
  title: sr('style'), modal: true,
  content: [{ type: 'TabStyleEditor', bindingPath: 'styles' }],
  buttons: [{ text: '${res.ok}', buttonType: 'Ok', closeAfterClick: true }, { text: '${res.cancel}', buttonType: 'Cancel', closeAfterClick: true }],
};

export const validationDefaults = {
  validationType: 'Any value', operator: 6, source: '', formula2: '', ignoreBlank: true, inCellDropdown: true,
  showInputMessage: true, inputTitle: '', inputMessage: '', showErrorMessage: true,
  errorStyle: 0, errorTitle: '', errorMessage: '', highlightType: 0, highlightColor: 'red',
  highlightPosition: 4, highlightImage: '', iconPickerOpen: false,
};
const dataValidationTemplate: IDialogTemplate = {
  templateName: TemplateNames.DataValidationDialogTemplate ?? 'dataValidationDialogTemplate', title: sr('dataValidation'), modal: true,
  content: [{ type: 'TabControl', className: 'gc-validation-tabs', items: [
    { key: 'settings', text: sr('settings'), children: [{ type: 'ValidationCriteria' }] },
    { key: 'input', text: sr('inputMessage'), children: [
      check('showInputMessage', sr('showInputMessageWhenCellIsSelected')),
      text(sr('whenCellIsSelectedShowThisInputMessage')),
      text(sr('title')), editor('inputTitle', 'gc-dv-input-title'),
      text(sr('inputMessage2')), { type: 'TextArea', bindingPath: 'inputMessage', className: 'gc-dv-input-message' },
    ] },
    { key: 'error', text: sr('errorAlert'), children: [
      check('showErrorMessage', sr('showErrorAlertAfterInvalidDataIsEntered')),
      text(sr('whenUserEntersInvalidDataShowThisErrorAlert')),
      text(sr('style2')), select('errorStyle', ['Stop', 'Warning', 'Information'].map((text, value) => ({ text, value })), 'gc-dv-error-style'),
      text(sr('title')), editor('errorTitle', 'gc-dv-error-title'),
      text(sr('errorMessage')), { type: 'TextArea', bindingPath: 'errorMessage', className: 'gc-dv-error-message' },
    ] },
    { key: 'highlight', text: sr('highlightStyle'), children: [{ type: 'ValidationHighlight' }] },
  ] }],
  buttons: [
    { text: sr('clearAll'), click: (context) => { const ctx = buttonCtx(context); for (const [key, value] of Object.entries(validationDefaults)) ctx.update(key, value); return false; } },
    { text: '${res.ok}', buttonType: 'Ok', closeAfterClick: true }, { text: '${res.cancel}', buttonType: 'Cancel', closeAfterClick: true },
  ],
};

const sortTemplate: IDialogTemplate = {
  templateName: TemplateNames.CustomSortDialogTemplate ?? 'customSortDialogTemplate', title: sr('sort'), modal: true,
  content: [{ type: 'CustomSortBody', className: 'gc-custom-sort-body' }],
  buttons: [{ text: '${res.ok}', buttonType: 'Ok', closeAfterClick: true }, { text: '${res.cancel}', buttonType: 'Cancel', closeAfterClick: true }],
};

const removeDuplicatesTemplate: IDialogTemplate = {
  templateName: TemplateNames.RemoveDuplicatesTemplate ?? 'removeDuplicatesTemplate', title: sr('removeDuplicates'), modal: true,
  content: [{ type: 'RemoveDuplicatesBody' }],
  buttons: [{ text: '${res.ok}', buttonType: 'Ok', closeAfterClick: true }, { text: '${res.cancel}', buttonType: 'Cancel', closeAfterClick: true }],
};

const textToColumnsTemplate: IDialogTemplate = {
  templateName: TemplateNames.TextToColumnDialogWizardStep1Template ?? 'textToColumnDialogWizardStep1Template',
  title: sr('convertTextToColumnsWizard'), modal: true, hideFooter: true,
  content: [{ type: 'TextToColumnsWizard' }],
  buttons: [],
};

const subtotalTemplate: IDialogTemplate = {
  templateName: TemplateNames.SubTotalDialogTemplate ?? 'subTotalDialogTemplate', title: sr('subtotal'), modal: true,
  content: [{ type: 'SubtotalBody' }],
  buttons: [
    { text: sr('remove'), closeAfterClick: false, click: (context) => { const ctx = buttonCtx(context); ctx.designer.removeSubtotalsNow(ctx.data); return false; } },
    { text: '${res.ok}', buttonType: 'Ok', closeAfterClick: true }, { text: '${res.cancel}', buttonType: 'Cancel', closeAfterClick: true },
  ],
};

const goalSeekTemplate: IDialogTemplate = {
  templateName: TemplateNames.GoalSeekDialogTemplate ?? 'GoalSeekDialogTemplate', title: sr('goalSeek'), modal: true,
  content: [
    row([text(sr('setCell'), 'gc-dialog-label'), editor('formulaCell', 'gc-goal-cell'), { type: 'RangePickButton', target: 'formulaCell', className: 'gc-goal-pick' }]),
    row([text(sr('toValue'), 'gc-dialog-label'), editor('goal', 'gc-goal-value')]),
    row([text(sr('byChangingCell'), 'gc-dialog-label'), editor('changingCell', 'gc-goal-changing'), { type: 'RangePickButton', target: 'changingCell', className: 'gc-goal-pick' }]),
    { type: 'LabelLine', className: 'gc-goal-separator' },
    row([text(sr('maximumIterations'), 'gc-dialog-label'), number('maxIterations', 'gc-goal-iterations')]),
    row([text(sr('tolerance'), 'gc-dialog-label'), number('tolerance', 'gc-goal-tolerance')]),
  ],
  buttons: [{ text: '${res.ok}', buttonType: 'Ok', closeAfterClick: true }, { text: '${res.cancel}', buttonType: 'Cancel', closeAfterClick: true }],
};

/** TASK 68: the trial's Zoom dialog is a narrow single column: a bordered
 *  "Magnification" group with the presets, Fit selection and Custom + %. */
const zoomTemplate: IDialogTemplate = {
  templateName: TemplateNames.ZoomDialogTemplate ?? 'zoomDialogTemplate', title: sr('zoom'), modal: true,
  content: [
    { type: 'GroupBox', text: sr('magnification'), className: 'gc-zoom-group', children: [
      { type: 'ZoomMagnification', bindingPath: 'choice', className: 'gc-zoom-radio-group' },
    ] },
  ],
  buttons: [{ text: '${res.ok}', buttonType: 'Ok', closeAfterClick: true }, { text: '${res.cancel}', buttonType: 'Cancel', closeAfterClick: true }],
};

/** The official dialog lists these 18 permission rows in this exact order. */
const protectSheetTemplate: IDialogTemplate = {
  templateName: TemplateNames.ProtectSheetDialogTemplate ?? 'protectSheetDialogTemplate', title: sr('protectSheet'), modal: true,
  content: [
    text(sr('passwordToUnprotectSheetOptional'), 'gc-dialog-label gc-protect-password-label'),
    { type: 'TextEditor', bindingPath: 'password', className: 'gc-protect-password' },
    text(sr('allowAllUsersOfThisWorksheetTo'), 'gc-dialog-label gc-protect-allow-label'),
    check('allowSelectLockedCells', sr('selectLockedCells')), check('allowSelectUnlockedCells', sr('selectUnlockedCells')),
    check('formatCells', sr('formatCells2')), check('allowSort', sr('sort')), check('allowFilter', sr('useAutoFilter')),
    check('allowResizeRows', sr('resizeRows')), check('allowResizeColumns', sr('resizeColumns')), check('allowUsePivotTable', sr('usePivotTable')),
    check('allowEditObjects', sr('editObjects')), check('allowEditScenarios', sr('editScenarios')),
    check('allowDragInsertRows', sr('dragInsertRows')), check('allowDragInsertColumns', sr('dragInsertColumns')),
    check('allowInsertRows', sr('insertRows')), check('allowInsertColumns', sr('insertColumns')),
    check('allowDeleteRows', sr('deleteRows')), check('allowDeleteColumns', sr('deleteColumns')),
    check('formatRows', sr('formatRows')), check('formatColumns', sr('formatColumns')),
  ],
  buttons: [{ text: '${res.ok}', buttonType: 'Ok', closeAfterClick: true }, { text: '${res.cancel}', buttonType: 'Cancel', closeAfterClick: true }],
};

const unprotectSheetTemplate: IDialogTemplate = {
  templateName: TemplateNames.UnprotectSheetDialogTemplate ?? 'unprotectSheetDialogTemplate', title: sr('unprotectSheet'), modal: true,
  content: [
    row([text(sr('password'), 'gc-dialog-label'), { type: 'TextEditor', bindingPath: 'password', className: 'gc-unprotect-password' }]),
  ],
  buttons: [{ text: '${res.ok}', buttonType: 'Ok', closeAfterClick: true }, { text: '${res.cancel}', buttonType: 'Cancel', closeAfterClick: true }],
};

const confirmPasswordTemplate: IDialogTemplate = {
  templateName: TemplateNames.ConfirmPasswordDialogTemplate ?? 'confirmPasswordDialogTemplate', title: sr('confirmPassword'), modal: true,
  content: [
    text(sr('reenterPasswordToProceed'), 'gc-confirm-password-context'),
    text(sr('cautionIfYouLoseOrForgetThePasswordItCannotBeRecoveredItIsAdvisableToKeepAListOfPasswordsAndTheirCorrespondingWorkbookAndSheetNamesInASafePlaceAfterYouCreateAPasswordBeAwareOfAllTheFollowingInformation'), 'gc-confirm-password-caution'),
    { type: 'TextEditor', bindingPath: 'password', className: 'gc-confirm-password' },
  ],
  buttons: [{ text: '${res.ok}', buttonType: 'Ok', closeAfterClick: true }, { text: '${res.cancel}', buttonType: 'Cancel', closeAfterClick: true }],
};

const protectWorkbookTemplate: IDialogTemplate = {
  templateName: 'protectWorkbookDialog', title: sr('protectStructureAndWindows'), modal: true,
  content: [
    row([text(sr('password'), 'gc-dialog-label'), { type: 'TextEditor', bindingPath: 'password', className: 'gc-protect-password' }]),
    check('structure', sr('protectWorkbookStructure')), check('windows', sr('protectWindows')),
  ],
  buttons: [{ text: '${res.ok}', buttonType: 'Ok', closeAfterClick: true }, { text: '${res.cancel}', buttonType: 'Cancel', closeAfterClick: true }],
};

const commentTemplate: IDialogTemplate = {
  templateName: TemplateNames.FormatCommentDialogTemplate ?? 'formatCommentDialogTemplate', title: sr('comment'), modal: true,
  content: [
    row([text(sr('author'), 'gc-dialog-label'), editor('author', 'gc-comment-author')]),
    { type: 'TextArea', bindingPath: 'text', className: 'gc-comment-text' },
  ],
  buttons: [{ text: '${res.ok}', buttonType: 'Ok', closeAfterClick: true }, { text: '${res.cancel}', buttonType: 'Cancel', closeAfterClick: true }],
};

/**
 * Page Setup dialog: the trial's four tabs (Page / Margins / Header & Footer /
 * Sheet). Every field is bound into the `draft` object, which `page-setup.ts`
 * reads from and writes back to the sheet's `printInfo()`.
 */
const pageSetupTemplate: IDialogTemplate = {
  templateName: 'pageSetupDialog', title: sr('pageSetup'), modal: true,
  content: [
    {
      type: 'TabControl', className: 'gc-page-setup-tabs', items: [
        {
          key: 'page', text: sr('page'), children: [
            { type: 'PageSetupPage' },
          ],
        },
        {
          key: 'margins', text: sr('margins'), children: [
            { type: 'PageMargins' },
          ],
        },
        {
          key: 'header', text: sr('headerFooter'), children: [
            { type: 'PageHeaderFooter' },
          ],
        },
        {
          key: 'print', text: sr('sheet'), children: [
            { type: 'PageSheetTab' },
          ],
        },
      ],
    },
  ],
  buttons: [{ text: '${res.ok}', buttonType: 'Ok', closeAfterClick: true }, { text: '${res.cancel}', buttonType: 'Cancel', closeAfterClick: true }],
};

const renameSheetTemplate: IDialogTemplate = {
  templateName: 'renameSheetDialog', title: sr('renameSheet'), modal: true,
  content: [row([text(sr('sheetName'), 'gc-dialog-label'), editor('name', 'gc-name-editor')])],
  buttons: [{ text: '${res.ok}', buttonType: 'Ok', closeAfterClick: true }, { text: '${res.cancel}', buttonType: 'Cancel', closeAfterClick: true }],
};

const sheetTagTemplate: IDialogTemplate = {
  templateName: 'sheetTagDialog', title: sr('sheetTagDialog'), modal: true,
  content: [text(sr('tag')), { type: 'TextArea', bindingPath: 'tag', placeholder: sr('tag') }],
  buttons: [
    { text: '${res.ok}', buttonType: 'Ok', closeAfterClick: true },
    { text: '${res.cancel}', buttonType: 'Cancel', closeAfterClick: true },
    { text: sr('clear'), closeAfterClick: false, click: (context) => {
      const ctx = buttonCtx(context);
      ctx.designer.getWorkbook().getActiveSheet().tag(null);
      ctx.designer.closeDialog('sheetTagDialog', false);
      return false;
    } },
  ],
};

const moveOrCopySheetTemplate: IDialogTemplate = {
  templateName: 'moveOrCopySheetDialog', title: sr('moveOrCopy'), modal: true,
  content: [text(sr('moveSelectedSheets')), text(sr('beforeSheet')), { type: 'MoveOrCopySheetList' }, check('copy', sr('createACopy'))],
};

const tabColorDialogTemplate: IDialogTemplate = {
  templateName: 'tabColorDialog', title: sr('color'), modal: true,
  content: [{ type: 'TabColorEditor' }],
};

const unhideSheetTemplate: IDialogTemplate = {
  templateName: TemplateNames.UnhideSheetTemplate, title: sr('unhide'), modal: true,
  content: [text(sr('unhideSheets')), { type: 'UnhideSheetList' }],
};

const sizeTemplates: IDialogTemplate[] = (['Row', 'Column'] as const).map((axis) => ({
  templateName: axis === 'Row' ? TemplateNames.RowHeightDialogTemplate : TemplateNames.ColumnWidthDialogTemplate,
  title: axis === 'Row' ? 'Row Height' : 'Column Width', modal: true,
  content: [row([text(axis === 'Row' ? 'Row height:' : 'Column width:', 'gc-dialog-label'), {
    type: 'TextEditor', bindingPath: 'size', placeholder: axis === 'Row' ? 'Row height:' : 'Column width:',
  }])],
  buttons: [{ text: '${res.ok}', buttonType: 'Ok', closeAfterClick: true }, { text: '${res.cancel}', buttonType: 'Cancel', closeAfterClick: true }],
}));

/* TASK 68: the trial's Standard Height / Standard Width dialogs (commands
 * `defaultRowHeight` / `defaultColumnWidth`) — one labelled editor each. */
const standardTemplates: IDialogTemplate[] = (['Row', 'Column'] as const).map((axis) => ({
  templateName: axis === 'Row'
    ? TemplateNames.DefaultRowHeightDialogTemplate ?? 'defaultRowHeightDialogTemplate'
    : TemplateNames.DefaultColumnWidthDialogTemplate ?? 'defaultColumnWidthDialogTemplate',
  title: axis === 'Row' ? 'Standard Height' : 'Standard Width', modal: true,
  content: [row([text(axis === 'Row' ? 'Standard row height:' : 'Standard column width:', 'gc-dialog-label'), {
    type: 'TextEditor', bindingPath: 'size',
  }])],
  buttons: [{ text: '${res.ok}', buttonType: 'Ok', closeAfterClick: true }, { text: '${res.cancel}', buttonType: 'Cancel', closeAfterClick: true }],
}));

/** TASK 68: Insert Slicer — the trial lists the pivot fields that can get a slicer. */
const insertSlicerTemplate: IDialogTemplate = {
  templateName: TemplateNames.InsertSlicerDialogTemplate ?? 'insertSlicerDialogTemplate', title: sr('insertSlicer'), modal: true,
  content: [{ type: 'SlicerFieldList' }],
  buttons: [{ text: '${res.ok}', buttonType: 'Ok', closeAfterClick: true }, { text: '${res.cancel}', buttonType: 'Cancel', closeAfterClick: true }],
};

/** Barcode dialog (TASK 68): the trial's nine common fields; per-type options
 *  appear after a Barcode Type is chosen. Rendered by our `BarcodeBody` widget. */
const barcodeTemplate: IDialogTemplate = {
  templateName: 'barcodeDialogTemplate', title: sr('barcodeDialog'), modal: true,
  content: [{ type: 'BarcodeBody' }],
  buttons: [{ text: '${res.ok}', buttonType: 'Ok', closeAfterClick: true }, { text: '${res.cancel}', buttonType: 'Cancel', closeAfterClick: true }],
};

/** "Size and Position" dialog for the selected shape (Shape Format tab, Size dropdown). */
const shapeSizeTemplate: IDialogTemplate = {
  templateName: 'shapeSizeDialogTemplate', title: sr('sizeAndPosition'), modal: true,
  content: [
    row([text(sr('leftPx'), 'gc-dialog-label'), { type: 'NumberEditor', bindingPath: 'left', className: 'gc-shape-size-left' }]),
    row([text(sr('topPx'), 'gc-dialog-label'), { type: 'NumberEditor', bindingPath: 'top', className: 'gc-shape-size-top' }]),
    row([text(sr('widthPx'), 'gc-dialog-label'), { type: 'NumberEditor', bindingPath: 'width', className: 'gc-shape-size-width' }]),
    row([text(sr('heightPx'), 'gc-dialog-label'), { type: 'NumberEditor', bindingPath: 'height', className: 'gc-shape-size-height' }]),
  ],
  buttons: [{ text: '${res.ok}', buttonType: 'Ok', closeAfterClick: true }, { text: '${res.cancel}', buttonType: 'Cancel', closeAfterClick: true }],
};

/** Camera dialog ("Create camera shape"): choose the range the camera mirrors. */
const cameraTemplate: IDialogTemplate = {
  templateName: 'cameraShapeDialogTemplate', title: sr('createCameraShape'), modal: true,
  content: [
    text(sr('whereIsTheDataForYourCameraShape'), 'gc-camera-question'),
    row([editor('reference', 'gc-camera-reference'), { type: 'RangePickButton', target: 'reference', className: 'gc-camera-pick' }], 'gc-camera-range-row'),
  ],
  buttons: [{ text: '${res.ok}', buttonType: 'Ok', closeAfterClick: true }, { text: '${res.cancel}', buttonType: 'Cancel', closeAfterClick: true }],
};

/** "Create Sparklines" dialog: data range + location range (+ formula toggle),
 *  each range with the trial's range-picker button (TASK 68). */
const sparklineTemplate: IDialogTemplate = {
  templateName: 'createSparklinesDialogTemplate', title: sr('createSparklines'), modal: true,
  content: [
    { type: 'GroupBox', text: sr('chooseTheDataThatYouWant'), className: 'gc-sparklines-data-group', children: [
      row([text(sr('sparklineDataRange'), 'gc-dialog-label'), { type: 'TextEditor', bindingPath: 'dataRange', className: 'gc-sparklines-data' }, { type: 'RangePickButton', target: 'dataRange', className: 'gc-sparklines-pick' }]),
    ] },
    { type: 'GroupBox', text: sr('chooseWhereYouWantTheSparklineToBePlaced'), className: 'gc-sparklines-location-group', children: [
      row([text(sr('sparklineLocationRange'), 'gc-dialog-label'), { type: 'TextEditor', bindingPath: 'locationRange', className: 'gc-sparklines-location' }, { type: 'RangePickButton', target: 'locationRange', className: 'gc-sparklines-pick' }]),
    ] },
    // TASK 93: the trial's dialog shows the `isFormulaSparkline` checkbox (checked);
    // unchecked with LINE/COLUMN/WINLOSS creates classic sparklines instead of formulas.
    { type: 'CheckBox', bindingPath: 'isFormulaSparkline', text: 'isFormulaSparkline', className: 'gc-sparklines-formula-check' },
  ],
  buttons: [{ text: '${res.ok}', buttonType: 'Ok', closeAfterClick: true }, { text: '${res.cancel}', buttonType: 'Cancel', closeAfterClick: true }],
};

/** TASK 93: the per-type formula-sparkline dialogs (HBar/Bullet/Gauge/Month/...).
 *  The field list comes from `sparkline-dialog-specs.ts` (trial-measured). */
const formulaSparklineTemplate: IDialogTemplate = {
  templateName: 'formulaSparklineDialogTemplate', title: sr('createSparklines'), modal: true,
  content: [{ type: 'FormulaSparklineEditor' }],
  buttons: [{ text: '${res.ok}', buttonType: 'Ok', closeAfterClick: true }, { text: '${res.cancel}', buttonType: 'Cancel', closeAfterClick: true }],
};

/** Shape hyperlink dialog. */
const shapeLinkTemplate: IDialogTemplate = {
  templateName: 'shapeHyperlinkDialogTemplate', title: sr('editHyperlink'), modal: true,
  content: [
    row([text(sr('typeTheWebPageAddress'), 'gc-dialog-label'), { type: 'TextEditor', bindingPath: 'url', className: 'gc-shape-link-url' }]),
    row([text(sr('tooltip'), 'gc-dialog-label'), { type: 'TextEditor', bindingPath: 'tooltip', className: 'gc-shape-link-tooltip' }]),
  ],
  buttons: [{ text: '${res.ok}', buttonType: 'Ok', closeAfterClick: true }, { text: '${res.cancel}', buttonType: 'Cancel', closeAfterClick: true }],
};

/** Context menu dialogs (task 61): Insert/Delete cell shifts with trial-style radio options. */
const insertCellsTemplate: IDialogTemplate = {
  templateName: 'insertCellsDialogTemplate', title: sr('insert'), modal: true,
  content: [
    text(sr('insert')),
    { type: 'Radio', bindingPath: 'shift', value: 'right', text: sr('shiftCellsRight') },
    { type: 'Radio', bindingPath: 'shift', value: 'down', text: sr('shiftCellsDown') },
    { type: 'Radio', bindingPath: 'shift', value: 'row', text: sr('entireRow') },
    { type: 'Radio', bindingPath: 'shift', value: 'column', text: sr('entireColumn') },
  ],
  buttons: [{ text: '${res.ok}', buttonType: 'Ok', closeAfterClick: true }, { text: '${res.cancel}', buttonType: 'Cancel', closeAfterClick: true }],
};
const deleteCellsTemplate: IDialogTemplate = {
  templateName: 'deleteCellsDialogTemplate', title: sr('delete'), modal: true,
  content: [
    text(sr('delete')),
    { type: 'Radio', bindingPath: 'shift', value: 'left', text: sr('shiftCellsLeft') },
    { type: 'Radio', bindingPath: 'shift', value: 'up', text: sr('shiftCellsUp') },
    { type: 'Radio', bindingPath: 'shift', value: 'row', text: sr('entireRow') },
    { type: 'Radio', bindingPath: 'shift', value: 'column', text: sr('entireColumn') },
  ],
  buttons: [{ text: '${res.ok}', buttonType: 'Ok', closeAfterClick: true }, { text: '${res.cancel}', buttonType: 'Cancel', closeAfterClick: true }],
};
const cellTagTemplate: IDialogTemplate = {
  templateName: 'cellTagDialogTemplate', title: sr('cellTagDialog'), modal: true,
  content: [text(sr('tag')), { type: 'TextArea', bindingPath: 'tag', placeholder: sr('tag') }],
  buttons: [
    { text: '${res.ok}', buttonType: 'Ok', closeAfterClick: true },
    { text: '${res.cancel}', buttonType: 'Cancel', closeAfterClick: true },
    // Clear removes the tag entirely (the property is gone, like in the trial).
    { text: sr('clear'), closeAfterClick: false, click: (context) => { const ctx = buttonCtx(context); ctx.data.tag = undefined; ctx.data.cleared = true; ctx.designer.closeDialog('cellTagDialogTemplate', true); return false; } },
  ],
};
const defaultValueTemplate: IDialogTemplate = {
  templateName: 'defaultValueDialogTemplate', title: sr('defaultValueDialog'), modal: true,
  content: [row([text(sr('theDefaultValue'), 'gc-dialog-label'), { type: 'TextEditor', bindingPath: 'value', placeholder: sr('theDefaultValue') }])],
  buttons: [{ text: '${res.ok}', buttonType: 'Ok', closeAfterClick: true }, { text: '${res.cancel}', buttonType: 'Cancel', closeAfterClick: true }],
};
const transformCellsTemplate: IDialogTemplate = {
  templateName: 'transformCellsDialogTemplate', title: sr('transformCells'), modal: true,
  content: [
    row([text(sr('formula'), 'gc-dialog-label'), col([
      text('= LAMBDA( x,'),
      { type: 'TextArea', bindingPath: 'formula', placeholder: sr('enterTheFormulaEGUPPERX') },
      text(')'),
    ])]),
    row([text(sr('scope2'), 'gc-dialog-label'), select('scope', [{ text: sr('byCell'), value: 'cell' }])]),
  ],
  buttons: [{ text: '${res.ok}', buttonType: 'Ok', closeAfterClick: true }, { text: '${res.cancel}', buttonType: 'Cancel', closeAfterClick: true }],
};
const richTextTemplate: IDialogTemplate = {
  templateName: 'richTextDialogTemplate', title: sr('richTextDialog'), modal: true,
  content: [
    row([
      select('fontFamily', [{ text: sr('calibri'), value: 'Calibri' }, { text: sr('arial'), value: 'Arial' }, { text: sr('timesNewRoman'), value: 'Times New Roman' }, { text: sr('tahoma'), value: 'Tahoma' }, { text: sr('verdana'), value: 'Verdana' }], 'gc-rich-text-font'),
      number('fontSize', 'gc-rich-text-size'),
    ]),
    { type: 'TextArea', bindingPath: 'content', placeholder: sr('a'), className: 'gc-rich-text-content' },
  ],
  buttons: [{ text: '${res.ok}', buttonType: 'Ok', closeAfterClick: true }, { text: '${res.cancel}', buttonType: 'Cancel', closeAfterClick: true }],
};

/** One row of the Header Cells property grid (label + editor). */
const headerRow = (label: string, editor: IComponentRenderType): IComponentRenderType =>
  row([text(label, 'gc-dialog-label gc-header-label'), col([editor], '220px')], 'gc-header-row');
const headerBorderItems = [{ text: sr('none'), value: 'none' }, { text: sr('thin'), value: 'thin' }, { text: sr('medium'), value: 'medium' }, { text: sr('thick'), value: 'thick' }, { text: sr('dotted'), value: 'dotted' }, { text: sr('dashed'), value: 'dashed' }];
/** The trial's Header Cells dialog: a Row Header / Column Header tab pair over the header cell's style grid. */
const headerFields = (prefix: string): IComponentRenderType[] => [
  headerRow('Value', editor(`${prefix}value`, 'gc-header-value')),
  headerRow('BackColor', { type: 'ColorPicker', bindingPath: `${prefix}backColor` }),
  headerRow('ForeColor', { type: 'ColorPicker', bindingPath: `${prefix}foreColor` }),
  headerRow('Font', editor(`${prefix}font`, 'gc-header-font')),
  headerRow('Formatter', editor(`${prefix}formatter`, 'gc-header-formatter')),
  headerRow('HAlign', select(`${prefix}hAlign`, [{ text: sr('general'), value: 'general' }, { text: sr('left'), value: 'left' }, { text: sr('center'), value: 'center' }, { text: sr('right'), value: 'right' }], 'gc-header-halign')),
  headerRow('VAlign', select(`${prefix}vAlign`, [{ text: sr('top2'), value: 'top' }, { text: sr('center'), value: 'center' }, { text: sr('bottom'), value: 'bottom' }], 'gc-header-valign')),
  headerRow('TextIndent', number(`${prefix}textIndent`, 'gc-header-indent')),
  headerRow('BorderLeft', select(`${prefix}borderLeft`, headerBorderItems, 'gc-header-border')),
  headerRow('BorderRight', select(`${prefix}borderRight`, headerBorderItems, 'gc-header-border')),
  headerRow('BorderTop', select(`${prefix}borderTop`, headerBorderItems, 'gc-header-border')),
  headerRow('BorderBottom', select(`${prefix}borderBottom`, headerBorderItems, 'gc-header-border')),
  headerRow('DiagonalUp', select(`${prefix}diagonalUp`, headerBorderItems, 'gc-header-border')),
  headerRow('DiagonalDown', select(`${prefix}diagonalDown`, headerBorderItems, 'gc-header-border')),
  headerRow('BorderRadius', editor(`${prefix}borderRadius`, 'gc-header-radius')),
  headerRow('Locked', check(`${prefix}locked`, 'Locked')),
  headerRow('WordWrap', check(`${prefix}wordWrap`, 'WordWrap')),
  headerRow('ShrinkToFit', check(`${prefix}shrinkToFit`, 'ShrinkToFit')),
  headerRow('Vertical Text', check(`${prefix}verticalText`, 'Vertical Text')),
];
const headerCellsTemplate: IDialogTemplate = {
  templateName: 'headerCellsDialogTemplate', title: sr('headerCells'), modal: true,
  content: [
    row([text(sr('index2'), 'gc-dialog-label gc-header-index-label'), number('index', 'gc-header-index')], 'gc-header-row'),
    {
      type: 'TabControl', className: 'gc-header-tabs', items: [
        { key: 'rowHeader', text: sr('rowHeader'), children: headerFields('row') },
        { key: 'columnHeader', text: sr('columnHeader'), children: headerFields('col') },
      ],
    },
  ],
  buttons: [{ text: '${res.ok}', buttonType: 'Ok', closeAfterClick: true }, { text: '${res.cancel}', buttonType: 'Cancel', closeAfterClick: true }],
};
const outlineColumnTemplate: IDialogTemplate = {
  templateName: 'outlineColumnDialogTemplate', title: sr('outlineColumn'), modal: true,
  content: [
    check('showIndicator', sr('showIndicator')),
    check('showImage', sr('showImage')),
    check('customImage', sr('customIndicatorImage')),
    check('showCheckBox', sr('showCheckBox')),
    row([text(sr('maxLevel'), 'gc-dialog-label'), number('maxLevel', 'gc-outline-maxlevel')]),
  ],
  buttons: [{ text: '${res.ok}', buttonType: 'Ok', closeAfterClick: true }, { text: '${res.cancel}', buttonType: 'Cancel', closeAfterClick: true }],
};
const pasteSpecialTemplate: IDialogTemplate = {
  templateName: 'pasteSpecialDialogTemplate', title: sr('pasteSpecial'), modal: true,
  content: [
    text(sr('paste')),
    row([
      col([
        { type: 'Radio', bindingPath: 'paste', value: 'all', text: sr('all') },
        { type: 'Radio', bindingPath: 'paste', value: 'formulas', text: sr('formulas') },
        { type: 'Radio', bindingPath: 'paste', value: 'values', text: sr('values') },
        { type: 'Radio', bindingPath: 'paste', value: 'formats', text: sr('formats') },
        { type: 'Radio', bindingPath: 'paste', value: 'comments', text: sr('comments') },
        { type: 'Radio', bindingPath: 'paste', value: 'validation', text: sr('validation') },
      ], '175px'),
      col([
        { type: 'Radio', bindingPath: 'paste', value: 'sourceTheme', text: sr('allUsingSourceTheme') },
        { type: 'Radio', bindingPath: 'paste', value: 'noBorders', text: sr('allExceptBorders') },
        { type: 'Radio', bindingPath: 'paste', value: 'columnWidths', text: sr('columnWidths') },
        { type: 'Radio', bindingPath: 'paste', value: 'formulasNumberFormat', text: sr('formulasAndNumberFormats') },
        { type: 'Radio', bindingPath: 'paste', value: 'valuesNumberFormat', text: sr('valueAndNumberFormats') },
      ]),
    ]),
    text(sr('operation')),
    row([
      col([
        { type: 'Radio', bindingPath: 'operation', value: 'none', text: sr('none') },
        { type: 'Radio', bindingPath: 'operation', value: 'add', text: sr('add') },
        { type: 'Radio', bindingPath: 'operation', value: 'subtract', text: sr('subtract') },
      ], '175px'),
      col([
        { type: 'Radio', bindingPath: 'operation', value: 'multiply', text: sr('multiply') },
        { type: 'Radio', bindingPath: 'operation', value: 'divide', text: sr('divide') },
        { type: 'Radio', bindingPath: 'operation', value: 'transform', text: sr('transform') },
      ]),
    ]),
    row([col([check('skipBlanks', sr('skipBlanks'))], '175px'), col([check('transpose', sr('transpose'))])]),
  ],
  buttons: [
    { text: sr('pasteLink'), closeAfterClick: false, className: 'gc-paste-link-button', click: (context) => { const ctx = buttonCtx(context); ctx.data.pasteLink = true; ctx.designer.closeDialog('pasteSpecialDialogTemplate', true); return false; } },
    { text: '${res.ok}', buttonType: 'Ok', closeAfterClick: true },
    { text: '${res.cancel}', buttonType: 'Cancel', closeAfterClick: true },
  ],
};
const cellTemplateTemplate: IDialogTemplate = {
  templateName: 'cellTemplateDialogTemplate', title: sr('createCellTemplate'), modal: true,
  content: [row([text(sr('name2'), 'gc-dialog-label'), { type: 'TextEditor', bindingPath: 'name', placeholder: sr('cellTemplateName') }])],
  buttons: [{ text: '${res.ok}', buttonType: 'Ok', closeAfterClick: true }, { text: '${res.cancel}', buttonType: 'Cancel', closeAfterClick: true }],
};
const newCellStyleTemplate: IDialogTemplate = {
  templateName: 'newCellStyleDialogTemplate', title: sr('style'), modal: true,
  content: [row([text(sr('styleName'), 'gc-dialog-label'), { type: 'TextEditor', bindingPath: 'name' }])],
  buttons: [
    { text: sr('format'), closeAfterClick: false, className: 'gc-new-cell-style-format', click: (context) => { const ctx = buttonCtx(context); ctx.designer.closeDialog('newCellStyleDialogTemplate', true); ctx.designer.showFormatCells(); return false; } },
    { text: '${res.ok}', buttonType: 'Ok', closeAfterClick: true },
    { text: '${res.cancel}', buttonType: 'Cancel', closeAfterClick: true },
  ],
};
const changeChartTypeTemplate: IDialogTemplate = {
  templateName: 'changeChartTypeDialogTemplate', title: sr('changeChartType'), modal: true,
  content: [{ type: 'ChangeChartTypeEditor' }],
  buttons: [{ text: '${res.ok}', buttonType: 'Ok', closeAfterClick: true }, { text: '${res.cancel}', buttonType: 'Cancel', closeAfterClick: true }],
};
const selectDataTemplate: IDialogTemplate = {
  templateName: 'selectDataDialogTemplate', title: sr('selectDataSource'), modal: true,
  content: [row([text(sr('dataRange'), 'gc-dialog-label'), { type: 'TextEditor', bindingPath: 'range', placeholder: sr('dataRange') }])],
  buttons: [{ text: '${res.ok}', buttonType: 'Ok', closeAfterClick: true }, { text: '${res.cancel}', buttonType: 'Cancel', closeAfterClick: true }],
};
const moveChartTemplate: IDialogTemplate = {
  templateName: 'moveChartDialogTemplate', title: sr('moveChart'), modal: true,
  content: [
    text(sr('chooseWhereYouWantTheChartToBePlaced')),
    { type: 'MoveChartBody' },
  ],
  buttons: [{ text: '${res.ok}', buttonType: 'Ok', closeAfterClick: true }, { text: '${res.cancel}', buttonType: 'Cancel', closeAfterClick: true }],
};
const formatChartAreaTemplate: IDialogTemplate = {
  templateName: 'formatChartAreaDialogTemplate', title: sr('formatChartArea'), modal: true,
  content: [
    row([text(sr('fillColor'), 'gc-dialog-label'), { type: 'ColorPicker', bindingPath: 'fill' }]),
    row([text(sr('borderColor'), 'gc-dialog-label'), { type: 'ColorPicker', bindingPath: 'stroke' }]),
  ],
  buttons: [{ text: '${res.ok}', buttonType: 'Ok', closeAfterClick: true }, { text: '${res.cancel}', buttonType: 'Cancel', closeAfterClick: true }],
};

/**
 * TASK 74: "Resize Table" (Table Design tab). Labels and the note are transcribed
 * from the running trial: it prefills the table's own range and keeps its header row.
 */
const resizeTableTemplate: IDialogTemplate = {
  templateName: 'resizeTableDialogTemplate', title: sr('resizeTable'), modal: true,
  content: [
    row([text(sr('selectTheNewDataRangeForYourTable'), 'gc-resize-table-question'), { type: 'TextEditor', bindingPath: 'range', className: 'gc-resize-table-range' }]),
    text(sr('noteTheHeadersMustRemainInTheSameRowAndTheResultingTableRangeMustOverlapTheOriginalTableRange'), 'gc-resize-table-note'),
  ],
  buttons: [{ text: '${res.ok}', buttonType: 'Ok', closeAfterClick: true }, { text: '${res.cancel}', buttonType: 'Cancel', closeAfterClick: true }],
};

/**
 * TASK 74: "Sparkline Weight" (the Sparkline ▸ Style ▸ weight combo's Custom
 * Weight... row). Trial structure transcribed from the running dialog: title
 * "Sparkline Weight", the question "Enter the Sparkline weight(pt)", one text
 * input prefilled with the current POINTS value, OK/Cancel.
 */
const sparklineWeightTemplate: IDialogTemplate = {
  templateName: 'sparklineWeightDialogTemplate', title: sr('sparklineWeight'), modal: true,
  content: [
    row([text(sr('enterTheSparklineWeightPt'), 'gc-dialog-label'), { type: 'TextEditor', bindingPath: 'weight', className: 'gc-sparkline-weight-value' }]),
  ],
  buttons: [{ text: '${res.ok}', buttonType: 'Ok', closeAfterClick: true }, { text: '${res.cancel}', buttonType: 'Cancel', closeAfterClick: true }],
};

/** TASK 74: chart "Alt Text" (Chart Design > Accessibility); trial question transcribed. */
const chartAltTextTemplate: IDialogTemplate = {
  templateName: 'chartAltTextDialogTemplate', title: sr('altText'), modal: true,
  content: [
    text(sr('howWouldYouDescribeThisObjectAndItsContextToSomeoneWhoIsBlind'), 'gc-alt-text-question'),
    row([text(sr('altText2'), 'gc-dialog-label'), { type: 'TextEditor', bindingPath: 'alt', className: 'gc-alt-text-value' }]),
  ],
  buttons: [{ text: '${res.ok}', buttonType: 'Ok', closeAfterClick: true }, { text: '${res.cancel}', buttonType: 'Cancel', closeAfterClick: true }],
};

/**
 * Go To (Home > Find & Select): the trial shows a `Go to:` list of the defined
 * names, a `Reference:` editor and a `Special...` button that hands over to
 * the Go To Special dialog.
 */
const gotoTemplate: IDialogTemplate = {
  templateName: TemplateNames.GotoDialogTemplate ?? 'gotoDialogTemplate', title: sr('goTo'), modal: true,
  content: [{ type: 'GoToEditor' }],
  buttons: [
    { text: sr('special'), closeAfterClick: false, click: (context) => { const ctx = buttonCtx(context); ctx.designer.closeDialog(TemplateNames.GotoDialogTemplate ?? 'gotoDialogTemplate', false); ctx.designer.showGoToSpecial(); return false; } },
    { text: '${res.ok}', buttonType: 'Ok', closeAfterClick: true },
    { text: '${res.cancel}', buttonType: 'Cancel', closeAfterClick: true },
  ],
};

/** Go To Special: the trial's `Select` radio groups; OK selects the matches. */
const gotoSpecialTemplate: IDialogTemplate = {
  templateName: TemplateNames.GotoSpecialDialogTemplate ?? 'gotoSpecialDialogTemplate', title: sr('goToSpecial'), modal: true,
  content: [{ type: 'GoToSpecialEditor' }],
  buttons: [{ text: '${res.ok}', buttonType: 'Ok', closeAfterClick: true }, { text: '${res.cancel}', buttonType: 'Cancel', closeAfterClick: true }],
};

/** Series (Home > Fill > Series): direction/type/date-unit radios and step/stop. */
const fillSeriesTemplate: IDialogTemplate = {
  templateName: TemplateNames.FillSeriesDialogTemplate ?? 'fillSeriesDialogTemplate', title: sr('series'), modal: true,
  content: [{ type: 'SeriesEditor' }],
  buttons: [{ text: '${res.ok}', buttonType: 'Ok', closeAfterClick: true }, { text: '${res.cancel}', buttonType: 'Cancel', closeAfterClick: true }],
};

/** TASK 65: Format Table > New Table Style... (name, element list, preview, stripe size). */
const tableStyleTemplate: IDialogTemplate = {
  templateName: TemplateNames.TableStyleDialogTemplate ?? 'tableStyleDialogTemplate', title: sr('newTableStyle'), modal: true,
  content: [{ type: 'NewTableStyleEditor' }],
  buttons: [{ text: '${res.ok}', buttonType: 'Ok', closeAfterClick: true }, { text: '${res.cancel}', buttonType: 'Cancel', closeAfterClick: true }],
};

/** TASK 93: PivotTable Styles > New Pivot Table Style... (the trial's own template name). */
const pivotTableStyleTemplate: IDialogTemplate = {
  templateName: TemplateNames.PivotTableStyleDialogTemplate ?? 'pivoTtableStyleDialogTemplate', title: sr('newPivotTableStyle'), modal: true,
  content: [{ type: 'NewPivotStyleEditor' }],
  buttons: [{ text: '${res.ok}', buttonType: 'Ok', closeAfterClick: true }, { text: '${res.cancel}', buttonType: 'Cancel', closeAfterClick: true }],
};

/** TASK 65: Cell Styles > Manage Cell States (the working list of `sheet.cellStates`). */
const cellStatesManagerTemplate: IDialogTemplate = {
  templateName: TemplateNames.CellStateManagerTemplate ?? 'cellStateManagerTemplate', title: sr('manageCellStates'), modal: true,
  content: [{ type: 'CellStatesManagerEditor' }],
  buttons: [{ text: '${res.ok}', buttonType: 'Ok', closeAfterClick: true }, { text: '${res.cancel}', buttonType: 'Cancel', closeAfterClick: true }],
};

/** TASK 65: the manager's Add button — Create Cell States. */
const newCellStateTemplate: IDialogTemplate = {
  templateName: TemplateNames.NewCellStateTemplate ?? 'newCellStateTemplate', title: sr('createCellStates'), modal: true,
  content: [{ type: 'CreateCellStateEditor' }],
  buttons: [{ text: '${res.ok}', buttonType: 'Ok', closeAfterClick: true }, { text: '${res.cancel}', buttonType: 'Cancel', closeAfterClick: true }],
};

/** TASK 65 item 4: the New Formatting Rule dialog (all seven rule kinds). */
const newFormattingRuleTemplate: IDialogTemplate = {
  templateName: TemplateNames.NewFormattingRuleDialogTemplate ?? 'newFormattingRuleDialogTemplate', title: sr('newFormattingRule'), modal: true,
  content: [{ type: 'NewFormattingRuleEditor' }],
  buttons: [{ text: '${res.ok}', buttonType: 'Ok', closeAfterClick: true }, { text: '${res.cancel}', buttonType: 'Cancel', closeAfterClick: true }],
};

/** TASK 65 item 4: the Conditional Formatting Rules Manager. */
const ruleManagerTemplate: IDialogTemplate = {
  templateName: 'ruleManagerDialogTemplate', title: sr('conditionalFormattingRulesManager'), modal: true,
  content: [{ type: 'RuleManagerEditor' }],
  buttons: [
    { text: '${res.ok}', buttonType: 'Ok', closeAfterClick: true },
    { text: '${res.close}', buttonType: 'Cancel', closeAfterClick: true },
    { text: '${res.apply}', closeAfterClick: false, click: (context) => { const ctx = buttonCtx(context); ctx.designer.refreshConditionalRuleManager(); return false; } },
  ],
};

export const extraTemplates: IDialogTemplate[] = [
  renameSheetTemplate, sheetTagTemplate, unhideSheetTemplate, moveOrCopySheetTemplate, tabColorDialogTemplate, ...sizeTemplates, ...standardTemplates, insertSlicerTemplate,
  insertTableTemplate, hyperlinkTemplate, insertFunctionTemplate, functionArgumentsTemplate, nameManagerTemplate, newNameTemplate,
  dataValidationTemplate, sortTemplate, removeDuplicatesTemplate, textToColumnsTemplate, subtotalTemplate,
  goalSeekTemplate, zoomTemplate, protectSheetTemplate, unprotectSheetTemplate, confirmPasswordTemplate, protectWorkbookTemplate, commentTemplate,
  barcodeTemplate, cameraTemplate, sparklineTemplate, shapeLinkTemplate, shapeSizeTemplate,
  insertCellsTemplate, deleteCellsTemplate, cellTagTemplate, defaultValueTemplate, transformCellsTemplate,
  richTextTemplate, headerCellsTemplate, outlineColumnTemplate, pasteSpecialTemplate, cellTemplateTemplate,
  changeChartTypeTemplate, selectDataTemplate, moveChartTemplate, formatChartAreaTemplate, newCellStyleTemplate,
  resizeTableTemplate, chartAltTextTemplate, sparklineWeightTemplate,
  pageSetupTemplate, spreadSettingTemplate, sheetSettingTemplate, builtInFileIconsTemplate, tabStyleSettingTemplate,
  gotoTemplate, gotoSpecialTemplate, fillSeriesTemplate,
  tableStyleTemplate, pivotTableStyleTemplate, cellStatesManagerTemplate, newCellStateTemplate, newFormattingRuleTemplate, ruleManagerTemplate,
  formulaSparklineTemplate,
];
