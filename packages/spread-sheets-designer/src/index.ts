import GC from '@mescius/spread-sheets';
import { Designer, DefaultConfig, ToolBarModeConfig, CommandNames, TemplateNames, findControl, getActiveDesigner } from './designer.js';
import { installDesigner, DesignerEventsClass } from './install.js';
import { sheetsNamespace, type GCRoot } from './core-internals.js';
import { englishResources } from './resources.js';

installDesigner(GC);
const globalGC = (globalThis as { GC?: GCRoot }).GC;
if (globalGC && globalGC !== GC) installDesigner(globalGC);
const sheets = sheetsNamespace(GC);
if (!sheets.DesignerResources) sheets.DesignerResources = englishResources;

export default GC;
export {
  GC,
  Designer,
  DefaultConfig,
  ToolBarModeConfig,
  CommandNames,
  TemplateNames,
  findControl,
  getActiveDesigner,
  installDesigner,
};
export const Events = DesignerEventsClass;
export { englishResources };
export * from './types.js';
export type { ICommand, IDesignerConfig, IDialogTemplate, ITheme, ISidePanel, IRibbonPanel, IButtonGroup, ICommandGroup, CommandState } from './types.js';
export { registerTemplate, getTemplate, showDialog, closeDialog, showMessageBox } from './designer.js';
export { getResources, setResources } from './resolve.js';
