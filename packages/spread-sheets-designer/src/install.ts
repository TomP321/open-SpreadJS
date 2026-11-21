/* Installs the designer namespace onto the GC core (GC.Spread.Sheets.Designer),
 * mirroring the official entry points, and the designer event-name constants.
 * This is the package's mount point used by `src/index.ts` and `src/browser.ts`;
 * it is the only module that imports the Designer class as a VALUE from
 * `designer.ts` (nothing in designer.ts imports this file, so there is no cycle). */
import {
  FileType, MessageBoxButtons, MessageBoxIcon, MessageBoxResult, ThemeTokens,
} from './types.js';
import type { ITheme } from './types.js';
import { CommandNames, TemplateNames } from './names-generated.js';
import { DefaultConfig, ToolBarModeConfig } from './config.js';
import { defaultTheme } from './theme-default.js';
import { getResources, setResources as setGlobalResources } from './resolve.js';
import { getActive, registerTemplate, getTemplate, showDialog, closeDialog, showMessageBox } from './designer-registry.js';
import { sheetsNamespace, designerCore, type GCRoot } from './core-internals.js';
import { Designer, findControl } from './designer.js';

export class DesignerEventsClass {
  static FileLoading = 'FileLoading';
  static FileLoaded = 'FileLoaded';
  static DesignerResetDone = 'DesignerResetDone';
}

export function installDesigner(gc?: GCRoot): GCRoot {
  const target = gc ?? designerCore();
  if (!target?.Spread?.Sheets) throw new Error('GC.Spread.Sheets is required to install the Designer');
  // The trial's Designer embeds a core build whose serialiser is more eager; our shared core
  // switches to that behaviour while the Designer is installed (TASK 75, hidden core hook).
  (target.Spread.Sheets as { _setDesignerSerialization?: (on: boolean) => void })._setDesignerSerialization?.(true);
  const DesignerNamespace: Record<string, unknown> = {
    Designer,
    DefaultConfig,
    ToolBarModeConfig,
    CommandNames,
    TemplateNames,
    Events: DesignerEventsClass,
    FileType,
    MessageBoxButtons,
    MessageBoxIcon,
    MessageBoxResult,
    ThemeTokens,
    findControl,
    getCommand: (name?: string) => getActive()?.getCommand(name) ?? DefaultConfig.commandMap?.[name as string] ?? (name ? undefined : DefaultConfig.commandMap),
    getResources,
    setResources: setGlobalResources,
    getTemplate,
    registerTemplate,
    showDialog,
    closeDialog,
    showMessageBox,
    getTheme: () => getActive()?.getTheme() ?? { ...defaultTheme },
    setTheme: (theme: Partial<ITheme> | null) => getActive()?.setTheme(theme),
    LicenseKey: '',
  };
  sheetsNamespace(target).Designer = DesignerNamespace;
  return target;
}
