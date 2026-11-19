/* Module-level registries of the designer: the active Designer instance, the
 * global dialog-template map and the global event subscription map, plus the
 * standalone `registerTemplate` / `getTemplate` / `showDialog` / `closeDialog`
 * / `showMessageBox` entry points of the official API that route through the
 * active designer. `designer.ts` re-exports these so every public import path
 * keeps working. */
import type { MessageBoxIcon, IDialogTemplate, MessageBoxButtons } from './types.js';
import { deepClone } from './config-merge.js';
import type {
  DesignerApi, DialogData, DialogErrorCallback, DialogSuccessCallback, DialogValidCallback,
  DesignerEventHandler, MessageBoxCallback,
} from './designer-api.js';

let activeDesigner: DesignerApi | undefined;
const globalTemplates = new Map<string, IDialogTemplate>();
/** Global event table shared by every Designer instance (official semantics). */
export const globalEvents = new Map<string, Set<DesignerEventHandler>>();

export function setActiveDesigner(designer: DesignerApi | undefined): void { activeDesigner = designer; }
export function getActive(): DesignerApi | undefined { return activeDesigner; }
/** Clears the registry only when `designer` is still the active one (destroy()). */
export function clearActiveDesigner(designer: DesignerApi): void { if (activeDesigner === designer) activeDesigner = undefined; }

export function registerTemplate(templateName: string, template: IDialogTemplate): void {
  if (!templateName || !template) throw new Error('A template name and template are required');
  globalTemplates.set(templateName, template);
  if (!template.templateName) template.templateName = templateName;
}
export function getTemplate(templateName: string): IDialogTemplate | null {
  const found = globalTemplates.get(templateName);
  return found ? deepClone(found) : null;
}
export function getTemplateRaw(templateName: string): IDialogTemplate | undefined {
  return globalTemplates.get(templateName);
}
export function showDialog(
  templateName: string, bindingData: DialogData, successCallback: DialogSuccessCallback,
  errCallback?: DialogErrorCallback, validCallback?: DialogValidCallback, popupElement?: HTMLElement,
): void;
export function showDialog(
  templateName: string, bindingData: DialogData, successCallback: DesignerEventHandler,
  errCallback?: DesignerEventHandler, validCallback?: DesignerEventHandler, popupElement?: HTMLElement,
): void;
export function showDialog(
  templateName: string, bindingData: DialogData, successCallback: DesignerEventHandler,
  errCallback?: DesignerEventHandler, validCallback?: DesignerEventHandler, popupElement?: HTMLElement,
): void {
  const designer = activeDesigner;
  if (!designer) {
    (errCallback as DialogErrorCallback | undefined)?.(new Error('No active designer'));
    return;
  }
  designer.showDialog(templateName, bindingData, successCallback as DialogSuccessCallback, errCallback as DialogErrorCallback | undefined, validCallback as DialogValidCallback | undefined, popupElement);
}
export function closeDialog(templateName: string, submitValue: boolean): void {
  activeDesigner?.closeDialog(templateName, submitValue);
}
export function showMessageBox(
  text: string, title: string, icon: MessageBoxIcon, successCallback?: MessageBoxCallback,
  errCallback?: () => void, buttons?: MessageBoxButtons,
): void;
export function showMessageBox(
  text: string, title: string, icon: MessageBoxIcon, successCallback?: DesignerEventHandler,
  errCallback?: DesignerEventHandler, buttons?: MessageBoxButtons,
): void;
export function showMessageBox(
  text: string, title: string, icon: MessageBoxIcon, successCallback?: DesignerEventHandler,
  errCallback?: DesignerEventHandler, buttons?: MessageBoxButtons,
): void {
  activeDesigner?.showMessageBox(text, title, icon, successCallback, errCallback, buttons);
}

/** Fires a designer event on every global handler registered for `type`. */
export function emitDesignerEvent(type: string, ...args: unknown[]): void {
  for (const fn of globalEvents.get(type) ?? []) {
    try { (fn as (...a: unknown[]) => unknown)(...args); } catch (error) { console.error(error); }
  }
}
