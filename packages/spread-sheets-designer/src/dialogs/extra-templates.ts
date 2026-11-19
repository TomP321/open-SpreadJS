/* The built-in dialog templates added after the Format Cells and Find/Replace
 * dialogs (M6b onward): tables, hyperlinks, functions, names, data operations,
 * protection, page setup, sheet management, cell types, shapes/charts and the
 * paste-special and style dialogs. Pure declarative template data; the
 * registry wiring lives in templates.ts. */
import type { IDialogTemplate, IComponentRenderType } from '../types.js';
import { TemplateNames } from '../names-generated.js';
import { buttonCtx, check, col, editor, number, row, select, text } from './template-helpers.js';

/* M6b dialogs ------------------------------------------------------------- */
/**
 * TASK 68: the trial's Create Table dialog is tiny — the question, one range
 * editor with the range-picker button and OK/Cancel. The header row is
 * detected from the data (`showInsertTable`), not asked for.
 */
const insertTableTemplate: IDialogTemplate = {
  templateName: TemplateNames.InsertTableDialogTemplate ?? 'insertTableDialogTemplate',
  title: 'Create Table', modal: true,
  content: [
    text('Where is the data for your table?', 'gc-create-table-question'),
    row([editor('range', 'gc-insert-table-range gc-create-table-range'), { type: 'RangePickButton', target: 'range', className: 'gc-create-table-pick' }], 'gc-create-table-range-row'),
  ],
  buttons: [{ text: 'OK', buttonType: 'Ok', closeAfterClick: true }, { text: 'Cancel', buttonType: 'Cancel', closeAfterClick: true }],
};

const hyperlinkTemplate: IDialogTemplate = {
  templateName: TemplateNames.HyperlinkDialogTemplate ?? 'hyperlinkDialogTemplate',
  title: 'Hyperlink', modal: true,
  content: [
    row([text('Text to display:', 'gc-dialog-label'), editor('text', 'gc-hyperlink-text')]),
    row([text('ScreenTip:', 'gc-dialog-label'), editor('tooltip', 'gc-hyperlink-tooltip')]),
    row([text('Target:', 'gc-dialog-label'), select('target', [
      { text: 'blank', value: 'blank' }, { text: 'self', value: 'self' }, { text: 'parent', value: 'parent' }, { text: 'top', value: 'top' },
    ], 'gc-hyperlink-target')]),
    row([text('Link Color:', 'gc-dialog-label'), { type: 'ColorPicker', bindingPath: 'linkColor', className: 'gc-hyperlink-color' }, { type: 'Button', text: 'Reset', command: 'resetLinkColor' }]),
    row([text('Visited Link Color:', 'gc-dialog-label'), { type: 'ColorPicker', bindingPath: 'visitedLinkColor', className: 'gc-hyperlink-color' }, { type: 'Button', text: 'Reset', command: 'resetVisitedLinkColor' }]),
    {
      type: 'TabControl', className: 'gc-hyperlink-tabs', items: [
        { key: 'web', text: 'Web Page', children: [text('Link to a web page.'), row([text('Address:', 'gc-dialog-label'), editor('address', 'gc-hyperlink-address')])] },
        { key: 'document', text: 'This Document', children: [text('Type the cell reference:'), row([text('Location:', 'gc-dialog-label'), editor('reference', 'gc-hyperlink-reference')])] },
        { key: 'email', text: 'Email Address', children: [row([text('E-mail address:', 'gc-dialog-label'), editor('email', 'gc-hyperlink-email')]), row([text('Subject:', 'gc-dialog-label'), editor('subject', 'gc-hyperlink-subject')])] },
      ],
    },
  ],
  buttons: [
    { text: 'Remove', closeAfterClick: false, click: (context) => { const ctx = buttonCtx(context); ctx.data.remove = true; ctx.designer.closeDialog(TemplateNames.HyperlinkDialogTemplate ?? 'hyperlinkDialogTemplate', true); return false; } },
    { text: 'OK', buttonType: 'Ok', closeAfterClick: true },
    { text: 'Cancel', buttonType: 'Cancel', closeAfterClick: true },
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
  title: 'Insert Function', modal: true,
  content: [{ type: 'InsertFunctionEditor', className: 'gc-insertFunction-dialog' }],
  buttons: [{ text: 'OK', buttonType: 'Ok', closeAfterClick: true }, { text: 'Cancel', buttonType: 'Cancel', closeAfterClick: true }],
};

/**
 * Function Arguments — the trial calls this dialog's template
 * `moreFunctionDialogTemplate`: function name, one row per argument, the
 * description and the `Formula = NAME(...)` preview.
 */
const functionArgumentsTemplate: IDialogTemplate = {
  templateName: TemplateNames.MoreFunctionDialogTemplate ?? 'moreFunctionDialogTemplate',
  title: 'Function Arguments', modal: true,
  content: [{ type: 'FunctionArgumentsEditor' }],
  buttons: [{ text: 'OK', buttonType: 'Ok', closeAfterClick: true }, { text: 'Cancel', buttonType: 'Cancel', closeAfterClick: true }],
};

/** Name Manager: toolbar, filter combo and the names grid; only a Close button. */
const nameManagerTemplate: IDialogTemplate = {
  templateName: TemplateNames.NameManagerDialogTemplate ?? 'nameManagerDialogTemplate',
  title: 'Name Manager', modal: true, resizable: true,
  content: [{ type: 'NameManager' }],
  buttons: [{ text: 'Close', buttonType: 'Cancel', closeAfterClick: true }],
};

const newNameTemplate: IDialogTemplate = {
  templateName: TemplateNames.NewNameTemplate ?? 'newNameTemplate', title: 'New Name', modal: true,
  content: [
    row([text('Name:', 'gc-dialog-label'), editor('name', 'gc-name-editor')]),
    row([text('Scope:', 'gc-dialog-label'), { type: 'ComboBox', bindingPath: 'scope', itemsPath: 'scopes', className: 'gc-name-scope' }]),
    row([text('Refer to:', 'gc-dialog-label'), editor('refersTo', 'gc-name-refers')]),
    row([text('Comment:', 'gc-dialog-label'), { type: 'TextArea', bindingPath: 'comment', className: 'gc-name-comment' }]),
  ],
  buttons: [{ text: 'OK', buttonType: 'Ok', closeAfterClick: true }, { text: 'Cancel', buttonType: 'Cancel', closeAfterClick: true }],
};

/** Spread Settings: the seven tabs of the trial's workbook settings window. */
const spreadSettingTemplate: IDialogTemplate = {
  templateName: TemplateNames.SpreadSettingDialogTemplate ?? 'spreadSettingDialogTemplate',
  title: 'Spread Settings', modal: true,
  content: [{ type: 'SpreadSettingsEditor', bindingPath: 'tabOption', className: 'tab-control' }],
  buttons: [{ text: 'OK', buttonType: 'Ok', closeAfterClick: true }, { text: 'Cancel', buttonType: 'Cancel', closeAfterClick: true }],
};

/** Sheet Settings: the four tabs of the trial's worksheet settings window. */
const sheetSettingTemplate: IDialogTemplate = {
  templateName: TemplateNames.SheetSettingDialogTemplate ?? 'sheetSettingDialogTemplate',
  title: 'Sheet Settings', modal: true,
  content: [{ type: 'SheetSettingsEditor', bindingPath: 'tabOption' }],
  buttons: [{ text: 'OK', buttonType: 'Ok', closeAfterClick: true }, { text: 'Cancel', buttonType: 'Cancel', closeAfterClick: true }],
};

/** Built-in file icon manager behind the General tab's `Manage Icons` button. */
const builtInFileIconsTemplate: IDialogTemplate = {
  templateName: TemplateNames.BuiltInFileIconsDialogTemplate ?? 'BuiltInFileIconsDialogTemplate',
  title: 'Built In File Icon Setting', modal: true,
  content: [{ type: 'BuiltInFileIconsEditor', bindingPath: 'icons' }],
  buttons: [{ text: 'OK', buttonType: 'Ok', closeAfterClick: true }, { text: 'Cancel', buttonType: 'Cancel', closeAfterClick: true }],
};

/** Sheet-tab state style manager behind the `Manage Style` buttons. */
const tabStyleSettingTemplate: IDialogTemplate = {
  templateName: TemplateNames.TabStyleSettingDialogTemplate ?? 'TabStyleSettingDialogTemplate',
  title: 'Style', modal: true,
  content: [{ type: 'TabStyleEditor', bindingPath: 'styles' }],
  buttons: [{ text: 'OK', buttonType: 'Ok', closeAfterClick: true }, { text: 'Cancel', buttonType: 'Cancel', closeAfterClick: true }],
};

export const validationDefaults = {
  validationType: 'Any value', operator: 6, source: '', formula2: '', ignoreBlank: true, inCellDropdown: true,
  showInputMessage: true, inputTitle: '', inputMessage: '', showErrorMessage: true,
  errorStyle: 0, errorTitle: '', errorMessage: '', highlightType: 0, highlightColor: 'red',
  highlightPosition: 4, highlightImage: '', iconPickerOpen: false,
};
const dataValidationTemplate: IDialogTemplate = {
  templateName: TemplateNames.DataValidationDialogTemplate ?? 'dataValidationDialogTemplate', title: 'Data Validation', modal: true,
  content: [{ type: 'TabControl', className: 'gc-validation-tabs', items: [
    { key: 'settings', text: 'Settings', children: [{ type: 'ValidationCriteria' }] },
    { key: 'input', text: 'Input Message', children: [
      check('showInputMessage', 'Show input message when cell is selected'),
      text('When cell is selected, show this input message:'),
      text('Title:'), editor('inputTitle', 'gc-dv-input-title'),
      text('Input Message:'), { type: 'TextArea', bindingPath: 'inputMessage', className: 'gc-dv-input-message' },
    ] },
    { key: 'error', text: 'Error Alert', children: [
      check('showErrorMessage', 'Show error alert after invalid data is entered'),
      text('When user enters invalid data, show this error alert:'),
      text('Style:'), select('errorStyle', ['Stop', 'Warning', 'Information'].map((text, value) => ({ text, value })), 'gc-dv-error-style'),
      text('Title:'), editor('errorTitle', 'gc-dv-error-title'),
      text('Error Message:'), { type: 'TextArea', bindingPath: 'errorMessage', className: 'gc-dv-error-message' },
    ] },
    { key: 'highlight', text: 'Highlight Style', children: [{ type: 'ValidationHighlight' }] },
  ] }],
  buttons: [
    { text: 'Clear All', click: (context) => { const ctx = buttonCtx(context); for (const [key, value] of Object.entries(validationDefaults)) ctx.update(key, value); return false; } },
    { text: 'OK', buttonType: 'Ok', closeAfterClick: true }, { text: 'Cancel', buttonType: 'Cancel', closeAfterClick: true },
  ],
};

const sortTemplate: IDialogTemplate = {
  templateName: TemplateNames.CustomSortDialogTemplate ?? 'customSortDialogTemplate', title: 'Sort', modal: true,
  content: [{ type: 'CustomSortBody', className: 'gc-custom-sort-body' }],
  buttons: [{ text: 'OK', buttonType: 'Ok', closeAfterClick: true }, { text: 'Cancel', buttonType: 'Cancel', closeAfterClick: true }],
};

const removeDuplicatesTemplate: IDialogTemplate = {
  templateName: TemplateNames.RemoveDuplicatesTemplate ?? 'removeDuplicatesTemplate', title: 'Remove Duplicates', modal: true,
  content: [{ type: 'RemoveDuplicatesBody' }],
  buttons: [{ text: 'OK', buttonType: 'Ok', closeAfterClick: true }, { text: 'Cancel', buttonType: 'Cancel', closeAfterClick: true }],
};

const textToColumnsTemplate: IDialogTemplate = {
  templateName: TemplateNames.TextToColumnDialogWizardStep1Template ?? 'textToColumnDialogWizardStep1Template',
  title: 'Convert Text to Columns Wizard', modal: true, hideFooter: true,
  content: [{ type: 'TextToColumnsWizard' }],
  buttons: [],
};

const subtotalTemplate: IDialogTemplate = {
  templateName: TemplateNames.SubTotalDialogTemplate ?? 'subTotalDialogTemplate', title: 'Subtotal', modal: true,
  content: [{ type: 'SubtotalBody' }],
  buttons: [
    { text: 'Remove', closeAfterClick: false, click: (context) => { const ctx = buttonCtx(context); ctx.designer.removeSubtotalsNow(ctx.data); return false; } },
    { text: 'OK', buttonType: 'Ok', closeAfterClick: true }, { text: 'Cancel', buttonType: 'Cancel', closeAfterClick: true },
  ],
};

const goalSeekTemplate: IDialogTemplate = {
  templateName: TemplateNames.GoalSeekDialogTemplate ?? 'GoalSeekDialogTemplate', title: 'Goal Seek', modal: true,
  content: [
    row([text('Set cell:', 'gc-dialog-label'), editor('formulaCell', 'gc-goal-cell'), { type: 'RangePickButton', target: 'formulaCell', className: 'gc-goal-pick' }]),
    row([text('To value:', 'gc-dialog-label'), editor('goal', 'gc-goal-value')]),
    row([text('By changing cell:', 'gc-dialog-label'), editor('changingCell', 'gc-goal-changing'), { type: 'RangePickButton', target: 'changingCell', className: 'gc-goal-pick' }]),
    { type: 'LabelLine', className: 'gc-goal-separator' },
    row([text('Maximum iterations:', 'gc-dialog-label'), number('maxIterations', 'gc-goal-iterations')]),
    row([text('Tolerance:', 'gc-dialog-label'), number('tolerance', 'gc-goal-tolerance')]),
  ],
  buttons: [{ text: 'OK', buttonType: 'Ok', closeAfterClick: true }, { text: 'Cancel', buttonType: 'Cancel', closeAfterClick: true }],
};

/** TASK 68: the trial's Zoom dialog is a narrow single column: a bordered
 *  "Magnification" group with the presets, Fit selection and Custom + %. */
const zoomTemplate: IDialogTemplate = {
  templateName: TemplateNames.ZoomDialogTemplate ?? 'zoomDialogTemplate', title: 'Zoom', modal: true,
  content: [
    { type: 'GroupBox', text: 'Magnification', className: 'gc-zoom-group', children: [
      { type: 'ZoomMagnification', bindingPath: 'choice', className: 'gc-zoom-radio-group' },
    ] },
  ],
  buttons: [{ text: 'OK', buttonType: 'Ok', closeAfterClick: true }, { text: 'Cancel', buttonType: 'Cancel', closeAfterClick: true }],
};

/** The official dialog lists these 18 permission rows in this exact order. */
const protectSheetTemplate: IDialogTemplate = {
  templateName: TemplateNames.ProtectSheetDialogTemplate ?? 'protectSheetDialogTemplate', title: 'Protect Sheet', modal: true,
  content: [
    text('Password to unprotect sheet (optional)', 'gc-dialog-label gc-protect-password-label'),
    { type: 'TextEditor', bindingPath: 'password', className: 'gc-protect-password' },
    text('Allow all users of this worksheet to:', 'gc-dialog-label gc-protect-allow-label'),
    check('allowSelectLockedCells', 'Select locked cells'), check('allowSelectUnlockedCells', 'Select unlocked cells'),
    check('formatCells', 'Format cells'), check('allowSort', 'Sort'), check('allowFilter', 'Use autoFilter'),
    check('allowResizeRows', 'Resize rows'), check('allowResizeColumns', 'Resize columns'), check('allowUsePivotTable', 'Use PivotTable'),
    check('allowEditObjects', 'Edit objects'), check('allowEditScenarios', 'Edit scenarios'),
    check('allowDragInsertRows', 'Drag insert rows'), check('allowDragInsertColumns', 'Drag insert columns'),
    check('allowInsertRows', 'Insert rows'), check('allowInsertColumns', 'Insert columns'),
    check('allowDeleteRows', 'Delete rows'), check('allowDeleteColumns', 'Delete columns'),
    check('formatRows', 'Format rows'), check('formatColumns', 'Format columns'),
  ],
  buttons: [{ text: 'OK', buttonType: 'Ok', closeAfterClick: true }, { text: 'Cancel', buttonType: 'Cancel', closeAfterClick: true }],
};

const unprotectSheetTemplate: IDialogTemplate = {
  templateName: TemplateNames.UnprotectSheetDialogTemplate ?? 'unprotectSheetDialogTemplate', title: 'Unprotect Sheet', modal: true,
  content: [
    row([text('Password:', 'gc-dialog-label'), { type: 'TextEditor', bindingPath: 'password', className: 'gc-unprotect-password' }]),
  ],
  buttons: [{ text: 'OK', buttonType: 'Ok', closeAfterClick: true }, { text: 'Cancel', buttonType: 'Cancel', closeAfterClick: true }],
};

const confirmPasswordTemplate: IDialogTemplate = {
  templateName: TemplateNames.ConfirmPasswordDialogTemplate ?? 'confirmPasswordDialogTemplate', title: 'Confirm Password', modal: true,
  content: [
    text('Reenter password to proceed.', 'gc-confirm-password-context'),
    text('Caution: If you lose or forget the password, it cannot be recovered. It is advisable to keep a list of passwords and their corresponding workbook and sheet names in a safe place. After you create a password, be aware of all the following information: ', 'gc-confirm-password-caution'),
    { type: 'TextEditor', bindingPath: 'password', className: 'gc-confirm-password' },
  ],
  buttons: [{ text: 'OK', buttonType: 'Ok', closeAfterClick: true }, { text: 'Cancel', buttonType: 'Cancel', closeAfterClick: true }],
};

const protectWorkbookTemplate: IDialogTemplate = {
  templateName: 'protectWorkbookDialog', title: 'Protect Structure and Windows', modal: true,
  content: [
    row([text('Password:', 'gc-dialog-label'), { type: 'TextEditor', bindingPath: 'password', className: 'gc-protect-password' }]),
    check('structure', 'Protect workbook structure'), check('windows', 'Protect windows'),
  ],
  buttons: [{ text: 'OK', buttonType: 'Ok', closeAfterClick: true }, { text: 'Cancel', buttonType: 'Cancel', closeAfterClick: true }],
};

const commentTemplate: IDialogTemplate = {
  templateName: TemplateNames.FormatCommentDialogTemplate ?? 'formatCommentDialogTemplate', title: 'Comment', modal: true,
  content: [
    row([text('Author:', 'gc-dialog-label'), editor('author', 'gc-comment-author')]),
    { type: 'TextArea', bindingPath: 'text', className: 'gc-comment-text' },
  ],
  buttons: [{ text: 'OK', buttonType: 'Ok', closeAfterClick: true }, { text: 'Cancel', buttonType: 'Cancel', closeAfterClick: true }],
};

/**
 * Page Setup dialog: the trial's four tabs (Page / Margins / Header & Footer /
 * Sheet). Every field is bound into the `draft` object, which `page-setup.ts`
 * reads from and writes back to the sheet's `printInfo()`.
 */
const pageSetupTemplate: IDialogTemplate = {
  templateName: 'pageSetupDialog', title: 'Page Setup', modal: true,
  content: [
    {
      type: 'TabControl', className: 'gc-page-setup-tabs', items: [
        {
          key: 'page', text: 'Page', children: [
            { type: 'PageSetupPage' },
          ],
        },
        {
          key: 'margins', text: 'Margins', children: [
            { type: 'PageMargins' },
          ],
        },
        {
          key: 'header', text: 'Header/Footer', children: [
            { type: 'PageHeaderFooter' },
          ],
        },
        {
          key: 'print', text: 'Sheet', children: [
            { type: 'PageSheetTab' },
          ],
        },
      ],
    },
  ],
  buttons: [{ text: 'OK', buttonType: 'Ok', closeAfterClick: true }, { text: 'Cancel', buttonType: 'Cancel', closeAfterClick: true }],
};

const renameSheetTemplate: IDialogTemplate = {
  templateName: 'renameSheetDialog', title: 'Rename Sheet', modal: true,
  content: [row([text('Sheet name:', 'gc-dialog-label'), editor('name', 'gc-name-editor')])],
  buttons: [{ text: 'OK', buttonType: 'Ok', closeAfterClick: true }, { text: 'Cancel', buttonType: 'Cancel', closeAfterClick: true }],
};

const sheetTagTemplate: IDialogTemplate = {
  templateName: 'sheetTagDialog', title: 'Sheet Tag Dialog', modal: true,
  content: [text('Tag:'), { type: 'TextArea', bindingPath: 'tag', placeholder: 'Tag:' }],
  buttons: [
    { text: 'OK', buttonType: 'Ok', closeAfterClick: true },
    { text: 'Cancel', buttonType: 'Cancel', closeAfterClick: true },
    { text: 'Clear', closeAfterClick: false, click: (context) => {
      const ctx = buttonCtx(context);
      ctx.designer.getWorkbook().getActiveSheet().tag(null);
      ctx.designer.closeDialog('sheetTagDialog', false);
      return false;
    } },
  ],
};

const moveOrCopySheetTemplate: IDialogTemplate = {
  templateName: 'moveOrCopySheetDialog', title: 'Move or Copy', modal: true,
  content: [text('Move selected sheets'), text('Before sheet:'), { type: 'MoveOrCopySheetList' }, check('copy', 'Create a copy')],
};

const tabColorDialogTemplate: IDialogTemplate = {
  templateName: 'tabColorDialog', title: 'Color', modal: true,
  content: [{ type: 'TabColorEditor' }],
};

const unhideSheetTemplate: IDialogTemplate = {
  templateName: TemplateNames.UnhideSheetTemplate, title: 'Unhide', modal: true,
  content: [text('Unhide one or more sheets:'), { type: 'UnhideSheetList' }],
};

const sizeTemplates: IDialogTemplate[] = (['Row', 'Column'] as const).map((axis) => ({
  templateName: axis === 'Row' ? TemplateNames.RowHeightDialogTemplate : TemplateNames.ColumnWidthDialogTemplate,
  title: axis === 'Row' ? 'Row Height' : 'Column Width', modal: true,
  content: [row([text(axis === 'Row' ? 'Row height:' : 'Column width:', 'gc-dialog-label'), {
    type: 'TextEditor', bindingPath: 'size', placeholder: axis === 'Row' ? 'Row height:' : 'Column width:',
  }])],
  buttons: [{ text: 'OK', buttonType: 'Ok', closeAfterClick: true }, { text: 'Cancel', buttonType: 'Cancel', closeAfterClick: true }],
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
  buttons: [{ text: 'OK', buttonType: 'Ok', closeAfterClick: true }, { text: 'Cancel', buttonType: 'Cancel', closeAfterClick: true }],
}));

/** TASK 68: Insert Slicer — the trial lists the pivot fields that can get a slicer. */
const insertSlicerTemplate: IDialogTemplate = {
  templateName: TemplateNames.InsertSlicerDialogTemplate ?? 'insertSlicerDialogTemplate', title: 'Insert Slicer', modal: true,
  content: [{ type: 'SlicerFieldList' }],
  buttons: [{ text: 'OK', buttonType: 'Ok', closeAfterClick: true }, { text: 'Cancel', buttonType: 'Cancel', closeAfterClick: true }],
};

/** Barcode dialog (TASK 68): the trial's nine common fields; per-type options
 *  appear after a Barcode Type is chosen. Rendered by our `BarcodeBody` widget. */
const barcodeTemplate: IDialogTemplate = {
  templateName: 'barcodeDialogTemplate', title: 'Barcode Dialog', modal: true,
  content: [{ type: 'BarcodeBody' }],
  buttons: [{ text: 'OK', buttonType: 'Ok', closeAfterClick: true }, { text: 'Cancel', buttonType: 'Cancel', closeAfterClick: true }],
};

/** "Size and Position" dialog for the selected shape (Shape Format tab, Size dropdown). */
const shapeSizeTemplate: IDialogTemplate = {
  templateName: 'shapeSizeDialogTemplate', title: 'Size and Position', modal: true,
  content: [
    row([text('Left (px)', 'gc-dialog-label'), { type: 'NumberEditor', bindingPath: 'left', className: 'gc-shape-size-left' }]),
    row([text('Top (px)', 'gc-dialog-label'), { type: 'NumberEditor', bindingPath: 'top', className: 'gc-shape-size-top' }]),
    row([text('Width (px)', 'gc-dialog-label'), { type: 'NumberEditor', bindingPath: 'width', className: 'gc-shape-size-width' }]),
    row([text('Height (px)', 'gc-dialog-label'), { type: 'NumberEditor', bindingPath: 'height', className: 'gc-shape-size-height' }]),
  ],
  buttons: [{ text: 'OK', buttonType: 'Ok', closeAfterClick: true }, { text: 'Cancel', buttonType: 'Cancel', closeAfterClick: true }],
};

/** Camera dialog ("Create camera shape"): choose the range the camera mirrors. */
const cameraTemplate: IDialogTemplate = {
  templateName: 'cameraShapeDialogTemplate', title: 'Create camera shape', modal: true,
  content: [
    text('Where is the data for your camera shape?', 'gc-camera-question'),
    row([editor('reference', 'gc-camera-reference'), { type: 'RangePickButton', target: 'reference', className: 'gc-camera-pick' }], 'gc-camera-range-row'),
  ],
  buttons: [{ text: 'OK', buttonType: 'Ok', closeAfterClick: true }, { text: 'Cancel', buttonType: 'Cancel', closeAfterClick: true }],
};

/** "Create Sparklines" dialog: data range + location range (+ formula toggle),
 *  each range with the trial's range-picker button (TASK 68). */
const sparklineTemplate: IDialogTemplate = {
  templateName: 'createSparklinesDialogTemplate', title: 'Create Sparklines', modal: true,
  content: [
    { type: 'GroupBox', text: 'Choose the data that you want', className: 'gc-sparklines-data-group', children: [
      row([text('Data Range:', 'gc-dialog-label'), { type: 'TextEditor', bindingPath: 'dataRange', className: 'gc-sparklines-data' }, { type: 'RangePickButton', target: 'dataRange', className: 'gc-sparklines-pick' }]),
    ] },
    { type: 'GroupBox', text: 'Choose where you want the sparkline to be placed', className: 'gc-sparklines-location-group', children: [
      row([text('Location Range:', 'gc-dialog-label'), { type: 'TextEditor', bindingPath: 'locationRange', className: 'gc-sparklines-location' }, { type: 'RangePickButton', target: 'locationRange', className: 'gc-sparklines-pick' }]),
    ] },
    check('isFormulaSparkline', 'isFormulaSparkline'),
  ],
  buttons: [{ text: 'OK', buttonType: 'Ok', closeAfterClick: true }, { text: 'Cancel', buttonType: 'Cancel', closeAfterClick: true }],
};

/** Shape hyperlink dialog. */
const shapeLinkTemplate: IDialogTemplate = {
  templateName: 'shapeHyperlinkDialogTemplate', title: 'Edit Hyperlink', modal: true,
  content: [
    row([text('Type the web page address', 'gc-dialog-label'), { type: 'TextEditor', bindingPath: 'url', className: 'gc-shape-link-url' }]),
    row([text('Tooltip', 'gc-dialog-label'), { type: 'TextEditor', bindingPath: 'tooltip', className: 'gc-shape-link-tooltip' }]),
  ],
  buttons: [{ text: 'OK', buttonType: 'Ok', closeAfterClick: true }, { text: 'Cancel', buttonType: 'Cancel', closeAfterClick: true }],
};

/** Context menu dialogs (task 61): Insert/Delete cell shifts with trial-style radio options. */
const insertCellsTemplate: IDialogTemplate = {
  templateName: 'insertCellsDialogTemplate', title: 'Insert', modal: true,
  content: [
    text('Insert'),
    { type: 'Radio', bindingPath: 'shift', value: 'right', text: 'Shift cells right' },
    { type: 'Radio', bindingPath: 'shift', value: 'down', text: 'Shift cells down' },
    { type: 'Radio', bindingPath: 'shift', value: 'row', text: 'Entire row' },
    { type: 'Radio', bindingPath: 'shift', value: 'column', text: 'Entire column' },
  ],
  buttons: [{ text: 'OK', buttonType: 'Ok', closeAfterClick: true }, { text: 'Cancel', buttonType: 'Cancel', closeAfterClick: true }],
};
const deleteCellsTemplate: IDialogTemplate = {
  templateName: 'deleteCellsDialogTemplate', title: 'Delete', modal: true,
  content: [
    text('Delete'),
    { type: 'Radio', bindingPath: 'shift', value: 'left', text: 'Shift cells left' },
    { type: 'Radio', bindingPath: 'shift', value: 'up', text: 'Shift cells up' },
    { type: 'Radio', bindingPath: 'shift', value: 'row', text: 'Entire row' },
    { type: 'Radio', bindingPath: 'shift', value: 'column', text: 'Entire column' },
  ],
  buttons: [{ text: 'OK', buttonType: 'Ok', closeAfterClick: true }, { text: 'Cancel', buttonType: 'Cancel', closeAfterClick: true }],
};
const cellTagTemplate: IDialogTemplate = {
  templateName: 'cellTagDialogTemplate', title: 'Cell Tag Dialog', modal: true,
  content: [text('Tag:'), { type: 'TextArea', bindingPath: 'tag', placeholder: 'Tag:' }],
  buttons: [
    { text: 'OK', buttonType: 'Ok', closeAfterClick: true },
    { text: 'Cancel', buttonType: 'Cancel', closeAfterClick: true },
    // Clear removes the tag entirely (the property is gone, like in the trial).
    { text: 'Clear', closeAfterClick: false, click: (context) => { const ctx = buttonCtx(context); ctx.data.tag = undefined; ctx.data.cleared = true; ctx.designer.closeDialog('cellTagDialogTemplate', true); return false; } },
  ],
};
const defaultValueTemplate: IDialogTemplate = {
  templateName: 'defaultValueDialogTemplate', title: 'Default Value Dialog', modal: true,
  content: [row([text('The default value:', 'gc-dialog-label'), { type: 'TextEditor', bindingPath: 'value', placeholder: 'The default value:' }])],
  buttons: [{ text: 'OK', buttonType: 'Ok', closeAfterClick: true }, { text: 'Cancel', buttonType: 'Cancel', closeAfterClick: true }],
};
const transformCellsTemplate: IDialogTemplate = {
  templateName: 'transformCellsDialogTemplate', title: 'Transform Cells', modal: true,
  content: [
    row([text('Formula:', 'gc-dialog-label'), col([
      text('= LAMBDA( x,'),
      { type: 'TextArea', bindingPath: 'formula', placeholder: 'Enter the formula, e.g. UPPER(x)' },
      text(')'),
    ])]),
    row([text('Scope:', 'gc-dialog-label'), select('scope', [{ text: 'By Cell', value: 'cell' }])]),
  ],
  buttons: [{ text: 'OK', buttonType: 'Ok', closeAfterClick: true }, { text: 'Cancel', buttonType: 'Cancel', closeAfterClick: true }],
};
const richTextTemplate: IDialogTemplate = {
  templateName: 'richTextDialogTemplate', title: 'Rich Text Dialog', modal: true,
  content: [
    row([
      select('fontFamily', [{ text: 'Calibri', value: 'Calibri' }, { text: 'Arial', value: 'Arial' }, { text: 'Times New Roman', value: 'Times New Roman' }, { text: 'Tahoma', value: 'Tahoma' }, { text: 'Verdana', value: 'Verdana' }], 'gc-rich-text-font'),
      number('fontSize', 'gc-rich-text-size'),
    ]),
    { type: 'TextArea', bindingPath: 'content', placeholder: 'A', className: 'gc-rich-text-content' },
  ],
  buttons: [{ text: 'OK', buttonType: 'Ok', closeAfterClick: true }, { text: 'Cancel', buttonType: 'Cancel', closeAfterClick: true }],
};

/** One row of the Header Cells property grid (label + editor). */
const headerRow = (label: string, editor: IComponentRenderType): IComponentRenderType =>
  row([text(label, 'gc-dialog-label gc-header-label'), col([editor], '220px')], 'gc-header-row');
const headerBorderItems = [{ text: 'None', value: 'none' }, { text: 'Thin', value: 'thin' }, { text: 'Medium', value: 'medium' }, { text: 'Thick', value: 'thick' }, { text: 'Dotted', value: 'dotted' }, { text: 'Dashed', value: 'dashed' }];
/** The trial's Header Cells dialog: a Row Header / Column Header tab pair over the header cell's style grid. */
const headerFields = (prefix: string): IComponentRenderType[] => [
  headerRow('Value', editor(`${prefix}value`, 'gc-header-value')),
  headerRow('BackColor', { type: 'ColorPicker', bindingPath: `${prefix}backColor` }),
  headerRow('ForeColor', { type: 'ColorPicker', bindingPath: `${prefix}foreColor` }),
  headerRow('Font', editor(`${prefix}font`, 'gc-header-font')),
  headerRow('Formatter', editor(`${prefix}formatter`, 'gc-header-formatter')),
  headerRow('HAlign', select(`${prefix}hAlign`, [{ text: 'General', value: 'general' }, { text: 'Left', value: 'left' }, { text: 'Center', value: 'center' }, { text: 'Right', value: 'right' }], 'gc-header-halign')),
  headerRow('VAlign', select(`${prefix}vAlign`, [{ text: 'Top', value: 'top' }, { text: 'Center', value: 'center' }, { text: 'Bottom', value: 'bottom' }], 'gc-header-valign')),
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
  templateName: 'headerCellsDialogTemplate', title: 'Header Cells', modal: true,
  content: [
    row([text('Index:', 'gc-dialog-label gc-header-index-label'), number('index', 'gc-header-index')], 'gc-header-row'),
    {
      type: 'TabControl', className: 'gc-header-tabs', items: [
        { key: 'rowHeader', text: 'Row Header', children: headerFields('row') },
        { key: 'columnHeader', text: 'Column Header', children: headerFields('col') },
      ],
    },
  ],
  buttons: [{ text: 'OK', buttonType: 'Ok', closeAfterClick: true }, { text: 'Cancel', buttonType: 'Cancel', closeAfterClick: true }],
};
const outlineColumnTemplate: IDialogTemplate = {
  templateName: 'outlineColumnDialogTemplate', title: 'Outline Column', modal: true,
  content: [
    check('showIndicator', 'Show Indicator'),
    check('showImage', 'Show Image'),
    check('customImage', 'Custom Indicator Image'),
    check('showCheckBox', 'Show CheckBox'),
    row([text('Max Level', 'gc-dialog-label'), number('maxLevel', 'gc-outline-maxlevel')]),
  ],
  buttons: [{ text: 'OK', buttonType: 'Ok', closeAfterClick: true }, { text: 'Cancel', buttonType: 'Cancel', closeAfterClick: true }],
};
const pasteSpecialTemplate: IDialogTemplate = {
  templateName: 'pasteSpecialDialogTemplate', title: 'Paste Special', modal: true,
  content: [
    text('Paste'),
    row([
      col([
        { type: 'Radio', bindingPath: 'paste', value: 'all', text: 'All' },
        { type: 'Radio', bindingPath: 'paste', value: 'formulas', text: 'Formulas' },
        { type: 'Radio', bindingPath: 'paste', value: 'values', text: 'Values' },
        { type: 'Radio', bindingPath: 'paste', value: 'formats', text: 'Formats' },
        { type: 'Radio', bindingPath: 'paste', value: 'comments', text: 'Comments' },
        { type: 'Radio', bindingPath: 'paste', value: 'validation', text: 'Validation' },
      ], '175px'),
      col([
        { type: 'Radio', bindingPath: 'paste', value: 'sourceTheme', text: 'All using Source theme' },
        { type: 'Radio', bindingPath: 'paste', value: 'noBorders', text: 'All except borders' },
        { type: 'Radio', bindingPath: 'paste', value: 'columnWidths', text: 'Column widths' },
        { type: 'Radio', bindingPath: 'paste', value: 'formulasNumberFormat', text: 'Formulas and number formats' },
        { type: 'Radio', bindingPath: 'paste', value: 'valuesNumberFormat', text: 'Value and number formats' },
      ]),
    ]),
    text('Operation'),
    row([
      col([
        { type: 'Radio', bindingPath: 'operation', value: 'none', text: 'None' },
        { type: 'Radio', bindingPath: 'operation', value: 'add', text: 'Add' },
        { type: 'Radio', bindingPath: 'operation', value: 'subtract', text: 'Subtract' },
      ], '175px'),
      col([
        { type: 'Radio', bindingPath: 'operation', value: 'multiply', text: 'Multiply' },
        { type: 'Radio', bindingPath: 'operation', value: 'divide', text: 'Divide' },
        { type: 'Radio', bindingPath: 'operation', value: 'transform', text: 'Transform' },
      ]),
    ]),
    row([col([check('skipBlanks', 'Skip blanks')], '175px'), col([check('transpose', 'Transpose')])]),
  ],
  buttons: [
    { text: 'Paste Link', closeAfterClick: false, className: 'gc-paste-link-button', click: (context) => { const ctx = buttonCtx(context); ctx.data.pasteLink = true; ctx.designer.closeDialog('pasteSpecialDialogTemplate', true); return false; } },
    { text: 'OK', buttonType: 'Ok', closeAfterClick: true },
    { text: 'Cancel', buttonType: 'Cancel', closeAfterClick: true },
  ],
};
const cellTemplateTemplate: IDialogTemplate = {
  templateName: 'cellTemplateDialogTemplate', title: 'Create Cell Template', modal: true,
  content: [row([text('Name:', 'gc-dialog-label'), { type: 'TextEditor', bindingPath: 'name', placeholder: 'Cell template name:' }])],
  buttons: [{ text: 'OK', buttonType: 'Ok', closeAfterClick: true }, { text: 'Cancel', buttonType: 'Cancel', closeAfterClick: true }],
};
const newCellStyleTemplate: IDialogTemplate = {
  templateName: 'newCellStyleDialogTemplate', title: 'Style', modal: true,
  content: [row([text('Style name:', 'gc-dialog-label'), { type: 'TextEditor', bindingPath: 'name' }])],
  buttons: [
    { text: 'Format...', closeAfterClick: false, className: 'gc-new-cell-style-format', click: (context) => { const ctx = buttonCtx(context); ctx.designer.closeDialog('newCellStyleDialogTemplate', true); ctx.designer.showFormatCells(); return false; } },
    { text: 'OK', buttonType: 'Ok', closeAfterClick: true },
    { text: 'Cancel', buttonType: 'Cancel', closeAfterClick: true },
  ],
};
const changeChartTypeTemplate: IDialogTemplate = {
  templateName: 'changeChartTypeDialogTemplate', title: 'Change Chart Type', modal: true,
  content: [{ type: 'ChangeChartTypeEditor' }],
  buttons: [{ text: 'OK', buttonType: 'Ok', closeAfterClick: true }, { text: 'Cancel', buttonType: 'Cancel', closeAfterClick: true }],
};
const selectDataTemplate: IDialogTemplate = {
  templateName: 'selectDataDialogTemplate', title: 'Select Data Source', modal: true,
  content: [row([text('Data range:', 'gc-dialog-label'), { type: 'TextEditor', bindingPath: 'range', placeholder: 'Data range:' }])],
  buttons: [{ text: 'OK', buttonType: 'Ok', closeAfterClick: true }, { text: 'Cancel', buttonType: 'Cancel', closeAfterClick: true }],
};
const moveChartTemplate: IDialogTemplate = {
  templateName: 'moveChartDialogTemplate', title: 'Move Chart', modal: true,
  content: [
    text('Choose where you want the chart to be placed:'),
    { type: 'MoveChartBody' },
  ],
  buttons: [{ text: 'OK', buttonType: 'Ok', closeAfterClick: true }, { text: 'Cancel', buttonType: 'Cancel', closeAfterClick: true }],
};
const formatChartAreaTemplate: IDialogTemplate = {
  templateName: 'formatChartAreaDialogTemplate', title: 'Format Chart Area', modal: true,
  content: [
    row([text('Fill color:', 'gc-dialog-label'), { type: 'ColorPicker', bindingPath: 'fill' }]),
    row([text('Border color:', 'gc-dialog-label'), { type: 'ColorPicker', bindingPath: 'stroke' }]),
  ],
  buttons: [{ text: 'OK', buttonType: 'Ok', closeAfterClick: true }, { text: 'Cancel', buttonType: 'Cancel', closeAfterClick: true }],
};

/**
 * Go To (Home > Find & Select): the trial shows a `Go to:` list of the defined
 * names, a `Reference:` editor and a `Special...` button that hands over to
 * the Go To Special dialog.
 */
const gotoTemplate: IDialogTemplate = {
  templateName: TemplateNames.GotoDialogTemplate ?? 'gotoDialogTemplate', title: 'Go To', modal: true,
  content: [{ type: 'GoToEditor' }],
  buttons: [
    { text: 'Special...', closeAfterClick: false, click: (context) => { const ctx = buttonCtx(context); ctx.designer.closeDialog(TemplateNames.GotoDialogTemplate ?? 'gotoDialogTemplate', false); ctx.designer.showGoToSpecial(); return false; } },
    { text: 'OK', buttonType: 'Ok', closeAfterClick: true },
    { text: 'Cancel', buttonType: 'Cancel', closeAfterClick: true },
  ],
};

/** Go To Special: the trial's `Select` radio groups; OK selects the matches. */
const gotoSpecialTemplate: IDialogTemplate = {
  templateName: TemplateNames.GotoSpecialDialogTemplate ?? 'gotoSpecialDialogTemplate', title: 'Go To Special', modal: true,
  content: [{ type: 'GoToSpecialEditor' }],
  buttons: [{ text: 'OK', buttonType: 'Ok', closeAfterClick: true }, { text: 'Cancel', buttonType: 'Cancel', closeAfterClick: true }],
};

/** Series (Home > Fill > Series): direction/type/date-unit radios and step/stop. */
const fillSeriesTemplate: IDialogTemplate = {
  templateName: TemplateNames.FillSeriesDialogTemplate ?? 'fillSeriesDialogTemplate', title: 'Series', modal: true,
  content: [{ type: 'SeriesEditor' }],
  buttons: [{ text: 'OK', buttonType: 'Ok', closeAfterClick: true }, { text: 'Cancel', buttonType: 'Cancel', closeAfterClick: true }],
};

/** TASK 65: Format Table > New Table Style... (name, element list, preview, stripe size). */
const tableStyleTemplate: IDialogTemplate = {
  templateName: TemplateNames.TableStyleDialogTemplate ?? 'tableStyleDialogTemplate', title: 'New Table Style', modal: true,
  content: [{ type: 'NewTableStyleEditor' }],
  buttons: [{ text: 'OK', buttonType: 'Ok', closeAfterClick: true }, { text: 'Cancel', buttonType: 'Cancel', closeAfterClick: true }],
};

/** TASK 65: Cell Styles > Manage Cell States (the working list of `sheet.cellStates`). */
const cellStatesManagerTemplate: IDialogTemplate = {
  templateName: TemplateNames.CellStateManagerTemplate ?? 'cellStateManagerTemplate', title: 'Manage Cell States', modal: true,
  content: [{ type: 'CellStatesManagerEditor' }],
  buttons: [{ text: 'OK', buttonType: 'Ok', closeAfterClick: true }, { text: 'Cancel', buttonType: 'Cancel', closeAfterClick: true }],
};

/** TASK 65: the manager's Add button — Create Cell States. */
const newCellStateTemplate: IDialogTemplate = {
  templateName: TemplateNames.NewCellStateTemplate ?? 'newCellStateTemplate', title: 'Create Cell States', modal: true,
  content: [{ type: 'CreateCellStateEditor' }],
  buttons: [{ text: 'OK', buttonType: 'Ok', closeAfterClick: true }, { text: 'Cancel', buttonType: 'Cancel', closeAfterClick: true }],
};

/** TASK 65 item 4: the New Formatting Rule dialog (all seven rule kinds). */
const newFormattingRuleTemplate: IDialogTemplate = {
  templateName: TemplateNames.NewFormattingRuleDialogTemplate ?? 'newFormattingRuleDialogTemplate', title: 'New Formatting Rule', modal: true,
  content: [{ type: 'NewFormattingRuleEditor' }],
  buttons: [{ text: 'OK', buttonType: 'Ok', closeAfterClick: true }, { text: 'Cancel', buttonType: 'Cancel', closeAfterClick: true }],
};

/** TASK 65 item 4: the Conditional Formatting Rules Manager. */
const ruleManagerTemplate: IDialogTemplate = {
  templateName: 'ruleManagerDialogTemplate', title: 'Conditional Formatting Rules Manager', modal: true,
  content: [{ type: 'RuleManagerEditor' }],
  buttons: [
    { text: 'OK', buttonType: 'Ok', closeAfterClick: true },
    { text: 'Close', buttonType: 'Cancel', closeAfterClick: true },
    { text: 'Apply', closeAfterClick: false, click: (context) => { const ctx = buttonCtx(context); ctx.designer.refreshConditionalRuleManager(); return false; } },
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
  pageSetupTemplate, spreadSettingTemplate, sheetSettingTemplate, builtInFileIconsTemplate, tabStyleSettingTemplate,
  gotoTemplate, gotoSpecialTemplate, fillSeriesTemplate,
  tableStyleTemplate, cellStatesManagerTemplate, newCellStateTemplate, newFormattingRuleTemplate, ruleManagerTemplate,
];
