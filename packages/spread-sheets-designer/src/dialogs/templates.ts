import type { DesignerApi as Designer } from '../designer-api.js';
import type { IDialogTemplate, IComponentRenderType } from '../types.js';
import { registerTemplate, getTemplate } from '../designer-registry.js';
import { TemplateNames } from '../names-generated.js';
import type { FindReplaceController } from '../find.js';
import { buttonCtx, type DialogButtonContext, check, col, editor, number, row, select, text } from './template-helpers.js';
import { extraTemplates } from './extra-templates.js';
import { pivotTemplates } from './pivot-templates.js';

/** TASK 87: dialog captions are placeholders under res.dialogs, resolved by the dialog host. */
const sr = (key: string): string => `\${res.dialogs.${key}}`;

export const FORMAT_CELLS_TEMPLATE = TemplateNames.FormatDialogTemplate ?? 'formatDialogTemplate';
export const FIND_REPLACE_TEMPLATE = TemplateNames.FindDialogTemplate ?? 'findDialogTemplate';

/** Search options of the Find/Replace dialog: the same mutable record the renderer writes (the option type is private to find.ts). */
type FindDialogArgs = Parameters<FindReplaceController['findNext']>[0];
const findArgs = (ctx: DialogButtonContext): FindDialogArgs => ctx.data as FindDialogArgs;

const numberTab: IComponentRenderType = {
  type: 'ColumnSet',
  className: 'gc-format-number-tab',
  children: [
    col([
      text('Category:', 'gc-dialog-label gc-format-category-label'),
      { type: 'List', bindingPath: 'category', className: 'gc-format-category-list', items: [['General', 'general'], ['Number', 'number'], ['Currency', 'currency'], ['Accounting', 'accounting'], ['Date', 'date'], ['Time', 'time'], ['Percentage', 'percentage'], ['Fraction', 'fraction'], ['Scientific', 'scientific'], ['Text', 'text'], ['Special', 'special'], ['Custom', 'custom']].map(([name, key]) => ({ text: `\${res.formatDialog.${key}}`, value: name })) },
    ], '154px'),
    col([
      { type: 'GroupBox', text: sr('sample'), className: 'gc-format-sample-group', children: [
        { type: 'Container', className: 'gc-format-sample-value', text: sr('sample2') },
      ] },
      { type: 'TextBlock', className: 'gc-format-description', text: sr('generalFormatCellsHaveNoSpecificNumberFormat') },
      { type: 'NumberOptions', className: 'gc-format-number-options' },
    ], '465px'),
  ],
};

const alignmentTab: IComponentRenderType = {
  type: 'ColumnSet',
  className: 'gc-format-alignment-tab',
  children: [
    col([
      text('Text alignment'),
      row([text('Horizontal:', 'gc-dialog-label'), select('hAlign', [
        { text: sr('general'), value: 3 }, { text: sr('left'), value: 0 }, { text: sr('center'), value: 1 }, { text: sr('right'), value: 2 },
        { text: sr('centerAcrossSelection'), value: 4 }, { text: sr('justify'), value: 6 }, { text: sr('distributed'), value: 5 },
      ], 'gc-format-align-select')]),
      row([text('Vertical:', 'gc-dialog-label'), select('vAlign', [
        { text: sr('top'), value: 0 }, { text: sr('center'), value: 1 }, { text: sr('bottom'), value: 2 }, { text: sr('justify'), value: 3 }, { text: sr('distributed'), value: 4 },
      ], 'gc-format-align-select')]),
      row([text('Indent:', 'gc-dialog-label'), number('indent', 'gc-format-indent-input')]),
      text('Orientation'),
      row([text('Degrees:', 'gc-dialog-label'), number('orientation', 'gc-format-orientation-input')]),
      text('Text control'),
      check('wrapText', 'Wrap text'),
      check('shrinkToFit', 'Shrink to fit'),
      check('mergeCells', 'Merge cells'),
    ], '265px'),
    col([
      text('Text direction:'),
      select('textDirection', [{ text: sr('context'), value: 'context' }, { text: sr('leftToRight'), value: 'ltr' }, { text: sr('rightToLeft'), value: 'rtl' }], 'gc-format-direction-select'),
      { type: 'Container', className: 'gc-format-orientation-preview', text: sr('text') },
    ]),
  ],
};

const fontTab: IComponentRenderType = {
  type: 'ColumnSet',
  className: 'gc-format-font-tab',
  children: [
    col([
      row([text('Font:', 'gc-dialog-label'), editor('fontFamily', 'gc-format-font-family')]),
      row([text('Font style:', 'gc-dialog-label'), select('fontStyle', [
        { text: sr('regular'), value: 'Regular' }, { text: sr('italic'), value: 'Italic' }, { text: sr('bold'), value: 'Bold' }, { text: sr('boldItalic'), value: 'Bold Italic' },
      ], 'gc-format-font-style')]),
      row([text('Size:', 'gc-dialog-label'), number('fontSize', 'gc-format-font-size')]),
      row([text('Underline:', 'gc-dialog-label'), select('underline', [
        { text: sr('none'), value: 'None' }, { text: sr('single'), value: 'Single' }, { text: sr('double'), value: 'Double' },
      ], 'gc-format-font-underline')]),
      row([text('Color:', 'gc-dialog-label'), { type: 'ColorPicker', bindingPath: 'color', className: 'gc-format-font-color' }]),
      text('Effects'),
      row([check('strikethrough', 'Strikethrough'), check('superscript', 'Superscript'), check('subscript', 'Subscript')]),
    ], '250px'),
    col([
      { type: 'Container', className: 'gc-format-font-preview', text: sr('aaBbCcYyZz'), bindingPath: 'fontPreview' },
      text('Preview', 'gc-dialog-label'),
    ]),
  ],
};

const borderTab: IComponentRenderType = {
  type: 'ColumnSet',
  className: 'gc-format-border-tab',
  children: [
    col([
      text('Line'),
      row([text('Style:', 'gc-dialog-label'), { type: 'LineStylePicker', bindingPath: 'borderStyle', className: 'gc-format-line-style' }]),
      row([text('Color:', 'gc-dialog-label'), { type: 'ColorPicker', bindingPath: 'borderColor', className: 'gc-format-border-color' }]),
      text('Presets'),
      row([
        { type: 'Button', text: sr('none'), className: 'gc-format-border-preset', command: 'none' },
        { type: 'Button', text: sr('outline'), className: 'gc-format-border-preset', command: 'outline' },
        { type: 'Button', text: sr('inside'), className: 'gc-format-border-preset', command: 'inside' },
      ]),
      { type: 'BorderPreview', bindingPath: 'borderPreset', className: 'gc-format-border-preview' },
    ]),
  ],
};

const fillTab: IComponentRenderType = {
  type: 'Container',
  className: 'gc-format-fill-tab',
  children: [
    text('Background Color:'),
    { type: 'ColorPicker', bindingPath: 'backColor', className: 'gc-format-fill-color' },
    text('Pattern Color:'),
    { type: 'ColorPicker', bindingPath: 'patternColor', className: 'gc-format-pattern-color' },
    text('Pattern Style:'),
    select('patternStyle', [
      { text: sr('solid'), value: 'solid' }, { text: sr('darkGray'), value: 'darkGray' }, { text: sr('mediumGray'), value: 'mediumGray' },
      { text: sr('lightGray'), value: 'lightGray' }, { text: sr('n125Gray'), value: 'gray125' }, { text: sr('n625Gray'), value: 'gray0625' },
    ], 'gc-format-pattern-select'),
    { type: 'Container', className: 'gc-format-fill-preview', bindingPath: 'backColor', text: sr('sample') },
  ],
};

const protectionTab: IComponentRenderType = {
  type: 'Container',
  className: 'gc-format-protection-tab',
  children: [
    text('Protection'),
    check('locked', 'Locked'),
    check('hidden', 'Hidden'),
    { type: 'TextBlock', className: 'gc-format-protection-note', text: sr('lockingCellsOrHidingFormulasHasNoEffectUntilYouProtectTheWorksheetReviewTabProtectGroupProtectSheetButton') },
  ],
};

function tabItemsFor(): { key: string; text: string; children: IComponentRenderType[] }[] {
  return [
    { key: 'number', text: sr('number'), children: [numberTab] },
    { key: 'alignment', text: sr('alignment'), children: [alignmentTab] },
    { key: 'font', text: sr('font'), children: [fontTab] },
    { key: 'border', text: sr('border'), children: [borderTab] },
    { key: 'fill', text: sr('fill'), children: [fillTab] },
    { key: 'protection', text: sr('protection'), children: [protectionTab] },
    { key: 'cellButton', text: sr('cellButton'), children: [{
      type: 'ColumnSet', className: 'gc-format-cell-button-tab', children: [
        col([
          text('Button'), row([text('Type:', 'gc-dialog-label'), select('buttonType', [
            { text: sr('button'), value: 'button' }, { text: sr('checkBox'), value: 'checkbox' }, { text: sr('comboBox'), value: 'combo' },
          ], 'gc-format-button-type')]),
          row([text('Caption:', 'gc-dialog-label'), editor('buttonCaption', 'gc-format-button-caption')]),
          row([text('Value:', 'gc-dialog-label'), editor('buttonValue', 'gc-format-button-value')]),
          row([text('Tooltip:', 'gc-dialog-label'), editor('buttonTooltip', 'gc-format-button-tooltip')]),
        ], '280px'),
        col([
          row([text('Background:', 'gc-dialog-label'), { type: 'ColorPicker', bindingPath: 'buttonBackColor', className: 'gc-format-button-color' }]),
          row([check('buttonEnabled', 'Enabled'), check('buttonVisible', 'Visible')]),
          { type: 'Container', className: 'gc-format-button-preview', text: sr('buttonCaption') },
        ]),
      ],
    }] },
    { key: 'padding', text: sr('padding'), children: [{
      type: 'ColumnSet', className: 'gc-format-padding-tab', children: [
        col([
          text('Cell padding'), row([text('Left:', 'gc-dialog-label'), number('paddingLeft', 'gc-format-padding-input')]),
          row([text('Top:', 'gc-dialog-label'), number('paddingTop', 'gc-format-padding-input')]),
        ], '220px'),
        col([
          row([text('Right:', 'gc-dialog-label'), number('paddingRight', 'gc-format-padding-input')]),
          row([text('Bottom:', 'gc-dialog-label'), number('paddingBottom', 'gc-format-padding-input')]),
        ]),
      ],
    }] },
    { key: 'decoration', text: sr('decoration'), children: [{
      type: 'Container', className: 'gc-format-decoration-tab', children: [
        text('Text decoration'),
        row([text('Decoration:', 'gc-dialog-label'), select('textDecoration', [
          { text: sr('none'), value: 'none' }, { text: sr('underline'), value: 'underline' }, { text: sr('doubleUnderline'), value: 'double underline' },
          { text: sr('lineThrough'), value: 'line-through' }, { text: sr('overline'), value: 'overline' },
        ], 'gc-format-decoration-select')]),
        row([text('Line color:', 'gc-dialog-label'), { type: 'ColorPicker', bindingPath: 'decorationColor', className: 'gc-format-decoration-color' }]),
        row([text('Line style:', 'gc-dialog-label'), select('decorationStyle', [
          { text: sr('solid'), value: 'solid' }, { text: sr('dashed'), value: 'dashed' }, { text: sr('dotted'), value: 'dotted' }, { text: sr('double'), value: 'double' },
        ], 'gc-format-decoration-style')]),
      ],
    }] },
    { key: 'mask', text: sr('mask'), children: [{
      type: 'Container', className: 'gc-format-mask-tab', children: [
        text('Input mask'),
        row([text('Mask type:', 'gc-dialog-label'), select('maskType', [
          { text: sr('none'), value: 'none' }, { text: sr('dateTime'), value: 'dateTime' }, { text: sr('number'), value: 'number' }, { text: sr('custom'), value: 'custom' },
        ], 'gc-format-mask-type')]),
        row([text('Mask:', 'gc-dialog-label'), editor('maskPattern', 'gc-format-mask-pattern')]),
        row([text('Placeholder:', 'gc-dialog-label'), editor('maskPlaceholder', 'gc-format-mask-placeholder')]),
        text('Example: 0000-00-00 or (999) 999-9999'),
      ],
    }] },
  ];
}

const formatTemplate: IDialogTemplate = {
  templateName: FORMAT_CELLS_TEMPLATE,
  title: '${res.formatDialog.title}',
  modal: true,
  content: [{ type: 'TabControl', className: 'gc-format-tabs', items: tabItemsFor() }],
  buttons: [
    { text: '${res.ok}', buttonType: 'Ok', closeAfterClick: true },
    { text: '${res.cancel}', buttonType: 'Cancel', closeAfterClick: true },
  ],
};

const findTemplate: IDialogTemplate = {
  templateName: FIND_REPLACE_TEMPLATE,
  title: '${res.findDialog.title}',
  modal: true,
  content: [
    {
      type: 'TabControl',
      className: 'gc-find-tabs',
      items: [
        {
          key: 'find', text: '${res.findDialog.findTitle}', children: [{
            type: 'Container', children: [
              row([text('${res.findDialog.findwhat}', 'gc-dialog-label'), editor('searchText', 'gc-find-input')]),
              row([col([{ type: 'FindOptionsToggle' }])], 'gc-find-options-row'),
            ],
          }],
        },
        {
          key: 'replace', text: '${res.findDialog.replaceTitle}', children: [{
            type: 'Container', children: [
              row([text('${res.findDialog.findwhat}', 'gc-dialog-label'), editor('searchText', 'gc-find-input')]),
              row([text('${res.findDialog.replaceWith}', 'gc-dialog-label'), editor('replaceText', 'gc-find-input')]),
              row([col([{ type: 'FindOptionsToggle' }])], 'gc-find-options-row'),
            ],
          }],
        },
      ],
    },
    { type: 'FindOptions' },
    { type: 'FindResultsSection' },
  ],
  buttons: [
    { text: '${res.findDialog.replaceAll}', className: 'gc-find-button', visibleWhen: 'replace', click: (context) => buttonCtx(context).designer.findController.replaceAll(findArgs(buttonCtx(context))) },
    { text: '${res.findDialog.replaceNext}', className: 'gc-find-button', visibleWhen: 'replace', click: (context) => buttonCtx(context).designer.findController.replaceNext(findArgs(buttonCtx(context))) },
    { text: '${res.findDialog.findall}', className: 'gc-find-button', click: (context) => buttonCtx(context).designer.findController.findAll(findArgs(buttonCtx(context))) },
    { text: '${res.findDialog.findnext}', className: 'gc-find-button', primaryWhenTab: ['find', 'replace'], click: (context) => buttonCtx(context).designer.findController.findNext(findArgs(buttonCtx(context))) },
    { text: '${res.close}', buttonType: 'Cancel', closeAfterClick: true },
  ],
};



let registered = false;

export function registerBuiltinTemplates(_designer: Designer): void {
  if (registered) return;
  registered = true;
  if (!getTemplate(FORMAT_CELLS_TEMPLATE)) registerTemplate(FORMAT_CELLS_TEMPLATE, formatTemplate);
  if (!getTemplate(FIND_REPLACE_TEMPLATE)) registerTemplate(FIND_REPLACE_TEMPLATE, findTemplate);
  for (const template of extraTemplates) if (!getTemplate(template.templateName!)) registerTemplate(template.templateName!, template);
  for (const template of pivotTemplates) if (!getTemplate(template.templateName!)) registerTemplate(template.templateName!, template);
}

export const findTemplateName = FIND_REPLACE_TEMPLATE;
