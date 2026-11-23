/* Dialog templates for the PivotTable UI (TASK 47). They render the trial's
 * Create PivotTable / Move PivotTable / Value Field Settings / Field Settings /
 * PivotTable Options dialogs; the bodies are React components mounted by
 * DialogHost through the custom component types below. */
import type { IDialogTemplate } from '../types.js';
import { TemplateNames } from '../names-generated.js';

/** TASK 87: dialog captions are placeholders under res.dialogs, resolved by the dialog host. */
const sr = (key: string): string => `\${res.dialogs.${key}}`;

export const insertPivotTableTemplate: IDialogTemplate = {
  templateName: TemplateNames.InsertPivotTableDialogTemplate ?? 'insertPivotTableDialogTemplate',
  title: sr('createPivotTable'), modal: true,
  content: [{ type: 'PivotCreateBody', bindingPath: '' }],
  buttons: [{ text: sr('oK'), buttonType: 'Ok', closeAfterClick: true }, { text: sr('cancel'), buttonType: 'Cancel', closeAfterClick: true }],
};

export const changeDataSourceTemplate: IDialogTemplate = {
  templateName: TemplateNames.PivotTableChangeDataSourceTemplate ?? 'PivotTableChangeDataSourceTemplate',
  title: sr('changeDataSource'), modal: true,
  content: [{ type: 'PivotCreateBody', bindingPath: '' }],
  buttons: [{ text: sr('oK'), buttonType: 'Ok', closeAfterClick: true }, { text: sr('cancel'), buttonType: 'Cancel', closeAfterClick: true }],
};

export const movePivotTableTemplate: IDialogTemplate = {
  templateName: TemplateNames.MovePivotTableDialogTemplate ?? 'movePivotTableDialogTemplate',
  title: sr('movePivotTable'), modal: true,
  content: [{ type: 'PivotMoveBody', bindingPath: '' }],
  buttons: [{ text: sr('oK'), buttonType: 'Ok', closeAfterClick: true }, { text: sr('cancel'), buttonType: 'Cancel', closeAfterClick: true }],
};

export const valueFieldSettingsTemplate: IDialogTemplate = {
  templateName: 'pivotValueFieldSettingsDialogTemplate',
  title: sr('valueFieldSettings'), modal: true, hideFooter: true,
  content: [{ type: 'PivotValueFieldBody', bindingPath: '' }],
};

export const fieldSettingsTemplate: IDialogTemplate = {
  templateName: 'pivotFieldSettingsDialogTemplate',
  title: sr('fieldSettings'), modal: true, hideFooter: true,
  content: [{ type: 'PivotFieldSettingsBody', bindingPath: '' }],
};

export const pivotTableOptionsTemplate: IDialogTemplate = {
  templateName: TemplateNames.PivotTableOptionsDialogTemplate ?? 'pivotTableOptionsDialogTemplate',
  title: sr('pivotTableOptions'), modal: true,
  content: [{ type: 'PivotOptionsBody', bindingPath: '' }],
  buttons: [{ text: sr('oK'), buttonType: 'Ok', closeAfterClick: true }, { text: sr('cancel'), buttonType: 'Cancel', closeAfterClick: true }],
};

/* TASK 93: the trial's Grouping dialog (date units / number buckets). */
export const pivotGroupingTemplate: IDialogTemplate = {
  templateName: 'pivotGroupingDialogTemplate',
  title: sr('grouping'), modal: true,
  content: [{ type: 'PivotGroupingBody', bindingPath: '' }],
  buttons: [{ text: sr('oK'), buttonType: 'Ok', closeAfterClick: true }, { text: sr('cancel'), buttonType: 'Cancel', closeAfterClick: true }],
};

/* TASK 77: the PivotTable Analyze ▸ Fields, Items & Sets dialogs + the Show Report Filter
 * Pages confirmation. Template names reuse the trial's registered template names so a user
 * replaces them through `Designer.registerTemplate` exactly like the trial's. */
export const calculatedFieldTemplate: IDialogTemplate = {
  templateName: TemplateNames.CalculatedFieldsDialogTemplate ?? 'calculatedFieldsDialogTemplate',
  title: sr('insertCalculatedField'), modal: true,
  content: [{ type: 'PivotCalcFieldBody', bindingPath: '' }],
  buttons: [{ text: sr('oK'), buttonType: 'Ok', closeAfterClick: true }, { text: sr('cancel'), buttonType: 'Cancel', closeAfterClick: true }],
};

export const calculatedItemTemplate: IDialogTemplate = {
  templateName: TemplateNames.CalculatedItemsDialogTemplate ?? 'calculatedItemsDialogTemplate',
  title: sr('insertCalculatedItem'), modal: true,
  content: [{ type: 'PivotCalcItemBody', bindingPath: '' }],
  buttons: [{ text: sr('oK'), buttonType: 'Ok', closeAfterClick: true }, { text: sr('cancel'), buttonType: 'Cancel', closeAfterClick: true }],
};

export const calcItemSolveOrderTemplate: IDialogTemplate = {
  templateName: TemplateNames.CalculatedItemSolveOrderDialogTemplate ?? 'calculatedItemSolveOrderDialogTemplate',
  title: sr('calculatedItemSolveOrder'), modal: true, hideFooter: true,
  content: [{ type: 'PivotSolveOrderBody', bindingPath: '' }],
};

export const reportFilterPagesTemplate: IDialogTemplate = {
  templateName: TemplateNames.PivotShowReportFilterDialogTemplate ?? 'pivotShowReportFilterDialogTemplate',
  title: sr('showReportFilterPages'), modal: true,
  content: [{ type: 'PivotReportFilterBody', bindingPath: '' }],
  buttons: [{ text: sr('oK'), buttonType: 'Ok', closeAfterClick: true }, { text: sr('cancel'), buttonType: 'Cancel', closeAfterClick: true }],
};

export const pivotTemplates: IDialogTemplate[] = [
  insertPivotTableTemplate, changeDataSourceTemplate, movePivotTableTemplate,
  valueFieldSettingsTemplate, fieldSettingsTemplate, pivotTableOptionsTemplate, pivotGroupingTemplate,
  calculatedFieldTemplate, calculatedItemTemplate, calcItemSolveOrderTemplate, reportFilterPagesTemplate,
];
