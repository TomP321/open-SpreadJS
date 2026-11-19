/* Dialog templates for the PivotTable UI (TASK 47). They render the trial's
 * Create PivotTable / Move PivotTable / Value Field Settings / Field Settings /
 * PivotTable Options dialogs; the bodies are React components mounted by
 * DialogHost through the custom component types below. */
import type { IDialogTemplate } from '../types.js';
import { TemplateNames } from '../names-generated.js';

export const insertPivotTableTemplate: IDialogTemplate = {
  templateName: TemplateNames.InsertPivotTableDialogTemplate ?? 'insertPivotTableDialogTemplate',
  title: 'Create PivotTable', modal: true,
  content: [{ type: 'PivotCreateBody', bindingPath: '' }],
  buttons: [{ text: 'OK', buttonType: 'Ok', closeAfterClick: true }, { text: 'Cancel', buttonType: 'Cancel', closeAfterClick: true }],
};

export const changeDataSourceTemplate: IDialogTemplate = {
  templateName: TemplateNames.PivotTableChangeDataSourceTemplate ?? 'PivotTableChangeDataSourceTemplate',
  title: 'Change Data Source', modal: true,
  content: [{ type: 'PivotCreateBody', bindingPath: '' }],
  buttons: [{ text: 'OK', buttonType: 'Ok', closeAfterClick: true }, { text: 'Cancel', buttonType: 'Cancel', closeAfterClick: true }],
};

export const movePivotTableTemplate: IDialogTemplate = {
  templateName: TemplateNames.MovePivotTableDialogTemplate ?? 'movePivotTableDialogTemplate',
  title: 'Move PivotTable', modal: true,
  content: [{ type: 'PivotMoveBody', bindingPath: '' }],
  buttons: [{ text: 'OK', buttonType: 'Ok', closeAfterClick: true }, { text: 'Cancel', buttonType: 'Cancel', closeAfterClick: true }],
};

export const valueFieldSettingsTemplate: IDialogTemplate = {
  templateName: 'pivotValueFieldSettingsDialogTemplate',
  title: 'Value Field Settings', modal: true, hideFooter: true,
  content: [{ type: 'PivotValueFieldBody', bindingPath: '' }],
};

export const fieldSettingsTemplate: IDialogTemplate = {
  templateName: 'pivotFieldSettingsDialogTemplate',
  title: 'Field Settings', modal: true, hideFooter: true,
  content: [{ type: 'PivotFieldSettingsBody', bindingPath: '' }],
};

export const pivotTableOptionsTemplate: IDialogTemplate = {
  templateName: TemplateNames.PivotTableOptionsDialogTemplate ?? 'pivotTableOptionsDialogTemplate',
  title: 'PivotTable Options', modal: true,
  content: [{ type: 'PivotOptionsBody', bindingPath: '' }],
  buttons: [{ text: 'OK', buttonType: 'Ok', closeAfterClick: true }, { text: 'Cancel', buttonType: 'Cancel', closeAfterClick: true }],
};

export const pivotTemplates: IDialogTemplate[] = [
  insertPivotTableTemplate, changeDataSourceTemplate, movePivotTableTemplate,
  valueFieldSettingsTemplate, fieldSettingsTemplate, pivotTableOptionsTemplate,
];
