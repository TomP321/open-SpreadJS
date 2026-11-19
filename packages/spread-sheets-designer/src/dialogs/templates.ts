import type { DesignerApi as Designer } from '../designer-api.js';
import type { IDialogTemplate, IComponentRenderType } from '../types.js';
import { registerTemplate, getTemplate } from '../designer-registry.js';
import { TemplateNames } from '../names-generated.js';
import type { FindReplaceController } from '../find.js';
import { buttonCtx, type DialogButtonContext, check, col, editor, number, row, select, text } from './template-helpers.js';
import { extraTemplates } from './extra-templates.js';
import { pivotTemplates } from './pivot-templates.js';

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
      { type: 'List', bindingPath: 'category', className: 'gc-format-category-list', items: ['General', 'Number', 'Currency', 'Accounting', 'Date', 'Time', 'Percentage', 'Fraction', 'Scientific', 'Text', 'Special', 'Custom'].map((name) => ({ text: name, value: name })) },
    ], '154px'),
    col([
      { type: 'GroupBox', text: 'Sample', className: 'gc-format-sample-group', children: [
        { type: 'Container', className: 'gc-format-sample-value', text: '{sample}' },
      ] },
      { type: 'TextBlock', className: 'gc-format-description', text: 'General format cells have no specific number format.' },
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
        { text: 'General', value: 3 }, { text: 'Left', value: 0 }, { text: 'Center', value: 1 }, { text: 'Right', value: 2 },
        { text: 'Center Across Selection', value: 4 }, { text: 'Justify', value: 6 }, { text: 'Distributed', value: 5 },
      ], 'gc-format-align-select')]),
      row([text('Vertical:', 'gc-dialog-label'), select('vAlign', [
        { text: 'Top', value: 0 }, { text: 'Center', value: 1 }, { text: 'Bottom', value: 2 }, { text: 'Justify', value: 3 }, { text: 'Distributed', value: 4 },
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
      select('textDirection', [{ text: 'Context', value: 'context' }, { text: 'Left-to-right', value: 'ltr' }, { text: 'Right-to-left', value: 'rtl' }], 'gc-format-direction-select'),
      { type: 'Container', className: 'gc-format-orientation-preview', text: 'Text' },
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
        { text: 'Regular', value: 'Regular' }, { text: 'Italic', value: 'Italic' }, { text: 'Bold', value: 'Bold' }, { text: 'Bold Italic', value: 'Bold Italic' },
      ], 'gc-format-font-style')]),
      row([text('Size:', 'gc-dialog-label'), number('fontSize', 'gc-format-font-size')]),
      row([text('Underline:', 'gc-dialog-label'), select('underline', [
        { text: 'None', value: 'None' }, { text: 'Single', value: 'Single' }, { text: 'Double', value: 'Double' },
      ], 'gc-format-font-underline')]),
      row([text('Color:', 'gc-dialog-label'), { type: 'ColorPicker', bindingPath: 'color', className: 'gc-format-font-color' }]),
      text('Effects'),
      row([check('strikethrough', 'Strikethrough'), check('superscript', 'Superscript'), check('subscript', 'Subscript')]),
    ], '250px'),
    col([
      { type: 'Container', className: 'gc-format-font-preview', text: 'AaBbCcYyZz', bindingPath: 'fontPreview' },
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
        { type: 'Button', text: 'None', className: 'gc-format-border-preset', command: 'none' },
        { type: 'Button', text: 'Outline', className: 'gc-format-border-preset', command: 'outline' },
        { type: 'Button', text: 'Inside', className: 'gc-format-border-preset', command: 'inside' },
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
      { text: 'Solid', value: 'solid' }, { text: 'Dark Gray', value: 'darkGray' }, { text: 'Medium Gray', value: 'mediumGray' },
      { text: 'Light Gray', value: 'lightGray' }, { text: '12.5% Gray', value: 'gray125' }, { text: '6.25% Gray', value: 'gray0625' },
    ], 'gc-format-pattern-select'),
    { type: 'Container', className: 'gc-format-fill-preview', bindingPath: 'backColor', text: 'Sample' },
  ],
};

const protectionTab: IComponentRenderType = {
  type: 'Container',
  className: 'gc-format-protection-tab',
  children: [
    text('Protection'),
    check('locked', 'Locked'),
    check('hidden', 'Hidden'),
    { type: 'TextBlock', className: 'gc-format-protection-note', text: 'Locking cells or hiding formulas has no effect until you protect the worksheet (Review tab, Protect group, Protect Sheet button).' },
  ],
};

function tabItemsFor(): { key: string; text: string; children: IComponentRenderType[] }[] {
  return [
    { key: 'number', text: 'Number', children: [numberTab] },
    { key: 'alignment', text: 'Alignment', children: [alignmentTab] },
    { key: 'font', text: 'Font', children: [fontTab] },
    { key: 'border', text: 'Border', children: [borderTab] },
    { key: 'fill', text: 'Fill', children: [fillTab] },
    { key: 'protection', text: 'Protection', children: [protectionTab] },
    { key: 'cellButton', text: 'Cell Button', children: [{
      type: 'ColumnSet', className: 'gc-format-cell-button-tab', children: [
        col([
          text('Button'), row([text('Type:', 'gc-dialog-label'), select('buttonType', [
            { text: 'Button', value: 'button' }, { text: 'CheckBox', value: 'checkbox' }, { text: 'ComboBox', value: 'combo' },
          ], 'gc-format-button-type')]),
          row([text('Caption:', 'gc-dialog-label'), editor('buttonCaption', 'gc-format-button-caption')]),
          row([text('Value:', 'gc-dialog-label'), editor('buttonValue', 'gc-format-button-value')]),
          row([text('Tooltip:', 'gc-dialog-label'), editor('buttonTooltip', 'gc-format-button-tooltip')]),
        ], '280px'),
        col([
          row([text('Background:', 'gc-dialog-label'), { type: 'ColorPicker', bindingPath: 'buttonBackColor', className: 'gc-format-button-color' }]),
          row([check('buttonEnabled', 'Enabled'), check('buttonVisible', 'Visible')]),
          { type: 'Container', className: 'gc-format-button-preview', text: '{buttonCaption}' },
        ]),
      ],
    }] },
    { key: 'padding', text: 'Padding', children: [{
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
    { key: 'decoration', text: 'Decoration', children: [{
      type: 'Container', className: 'gc-format-decoration-tab', children: [
        text('Text decoration'),
        row([text('Decoration:', 'gc-dialog-label'), select('textDecoration', [
          { text: 'None', value: 'none' }, { text: 'Underline', value: 'underline' }, { text: 'Double Underline', value: 'double underline' },
          { text: 'Line Through', value: 'line-through' }, { text: 'Overline', value: 'overline' },
        ], 'gc-format-decoration-select')]),
        row([text('Line color:', 'gc-dialog-label'), { type: 'ColorPicker', bindingPath: 'decorationColor', className: 'gc-format-decoration-color' }]),
        row([text('Line style:', 'gc-dialog-label'), select('decorationStyle', [
          { text: 'Solid', value: 'solid' }, { text: 'Dashed', value: 'dashed' }, { text: 'Dotted', value: 'dotted' }, { text: 'Double', value: 'double' },
        ], 'gc-format-decoration-style')]),
      ],
    }] },
    { key: 'mask', text: 'Mask', children: [{
      type: 'Container', className: 'gc-format-mask-tab', children: [
        text('Input mask'),
        row([text('Mask type:', 'gc-dialog-label'), select('maskType', [
          { text: 'None', value: 'none' }, { text: 'Date & Time', value: 'dateTime' }, { text: 'Number', value: 'number' }, { text: 'Custom', value: 'custom' },
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
  title: 'Format Cells',
  modal: true,
  content: [{ type: 'TabControl', className: 'gc-format-tabs', items: tabItemsFor() }],
  buttons: [
    { text: 'OK', buttonType: 'Ok', closeAfterClick: true },
    { text: 'Cancel', buttonType: 'Cancel', closeAfterClick: true },
  ],
};

const findTemplate: IDialogTemplate = {
  templateName: FIND_REPLACE_TEMPLATE,
  title: 'Find and Replace',
  modal: true,
  content: [
    {
      type: 'TabControl',
      className: 'gc-find-tabs',
      items: [
        {
          key: 'find', text: 'Find', children: [{
            type: 'Container', children: [
              row([text('Find what:', 'gc-dialog-label'), editor('searchText', 'gc-find-input')]),
              row([col([{ type: 'FindOptionsToggle' }])], 'gc-find-options-row'),
            ],
          }],
        },
        {
          key: 'replace', text: 'Replace', children: [{
            type: 'Container', children: [
              row([text('Find what:', 'gc-dialog-label'), editor('searchText', 'gc-find-input')]),
              row([text('Replace with:', 'gc-dialog-label'), editor('replaceText', 'gc-find-input')]),
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
    { text: 'Replace All', className: 'gc-find-button', visibleWhen: 'replace', click: (context) => buttonCtx(context).designer.findController.replaceAll(findArgs(buttonCtx(context))) },
    { text: 'Replace', className: 'gc-find-button', visibleWhen: 'replace', click: (context) => buttonCtx(context).designer.findController.replaceNext(findArgs(buttonCtx(context))) },
    { text: 'Find All', className: 'gc-find-button', click: (context) => buttonCtx(context).designer.findController.findAll(findArgs(buttonCtx(context))) },
    { text: 'Find Next', className: 'gc-find-button', primaryWhenTab: ['find', 'replace'], click: (context) => buttonCtx(context).designer.findController.findNext(findArgs(buttonCtx(context))) },
    { text: 'Close', buttonType: 'Cancel', closeAfterClick: true },
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
