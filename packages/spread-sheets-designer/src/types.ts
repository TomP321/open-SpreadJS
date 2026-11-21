/** Public designer configuration types (compatible subset of the v19 designer contract). */
import type { Workbook } from './core-internals.js';

export type CommandType =
  | 'button'
  | 'dropdown'
  | 'separator'
  | 'checkbox'
  | 'comboBox'
  | 'text'
  | 'spinner'
  | 'list-preview'
  | 'colorPicker'
  | 'groupHeader'
  | 'chartFormat'
  | 'tableFooter'
  | 'SparklineColorPicker'
  | 'textBox'
  | 'listContent'
  | string;

export interface IActivationKey {
  key: string;
  altKey?: boolean;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  metaKey?: boolean;
}

export interface ICommand {
  title?: string;
  text?: string;
  iconClass?: string;
  type?: CommandType;
  bigButton?: boolean | string;
  direction?: string;
  commandName: string;
  keyTip?: string;
  commandOptions?: unknown;
  showDropdownButton?: boolean;
  /**
   * Draws the right-pointing submenu arrow on a dropdown row even without child
   * commands (the trial shows it on the "From Data Table" rows of Insert Table and
   * Insert Pivot Table). TASK 55.
   */
  dropdownArrow?: boolean;
  comboWidth?: number;
  comboHeight?: number;
  group?: string;
  isGroupItem?: boolean;
  textBoxWidth?: number;
  textBoxHeight?: number;
  listContent?: IListGroupItemData[];
  maxWidth?: number;
  maxHeight?: number;
  iconWidth?: number;
  iconHeight?: number;
  needAsyncUpdate?: boolean;
  visibleContext?: string;
  enableContext?: string;
  getState?: (context: IDesignerCommandContext) => CommandState | undefined;
  execute?: (context: IDesignerCommandContext, propertyName?: string, value?: unknown) => void;
  init?: (context: IDesignerCommandContext) => void;
  dropdownList?: IListGroupItemData[];
  subCommands?: string[];
  dropdownMaxWidth?: number;
  dropdownMaxHeight?: number;
  commandMap?: Record<string, unknown>;
  keepFocusInSpread?: boolean;
  visiblePriority?: number;
  hidden?: boolean;
  /** Internal marker: execute through the workbook command manager so undo/redo capture it. */
  undoable?: boolean;
}

export interface CommandState {
  text?: string;
  value?: unknown;
  checked?: boolean;
  enabled?: boolean;
  visible?: boolean;
  iconClass?: string;
  color?: string;
}

export interface ICommandGroup {
  commands?: (string | ICommandGroup)[];
  children?: (ICommandGroup | string)[];
  type?: 'group' | 'separator' | 'dropdown' | string;
  direction?: string;
  command?: string | Partial<ICommand>;
  keyTip?: string;
  dropdownMaxWidth?: number;
  dropdownMaxHeight?: number;
  showDropdownButton?: boolean;
  visiblePriority?: number;
  hidden?: boolean;
  className?: string;
}

export interface IButtonGroup {
  class?: string;
  label?: string;
  keyTip?: string;
  thumbnailClass?: string;
  thumbnailGroupId?: string;
  indicator?: string;
  commandGroup: ICommandGroup;
  overflow?: boolean;
  overflowTitle?: string;
  buttonGroupName?: string;
  visibleWhen?: string;
}

export interface IRibbonPanel {
  id: string;
  text: string;
  buttonGroups: IButtonGroup[];
  keyTip?: string;
  visibleWhen?: string;
  /** Contextual tab (trial's "Shape Format"): only shown while the trigger (a shape selection) holds. */
  contextual?: boolean;
  overflow?: boolean;
  overflowTitle?: string;
  active?: boolean;
}

export interface IRibbonPanelConfig {
  panels: IRibbonPanel[];
  ribbonHeight?: number;
}

export interface ISidePanel {
  position: 'left' | 'right' | 'top' | 'bottom' | 'full' | 'floating' | 'popup';
  width?: string;
  height?: string;
  minWidth?: string;
  maxWidth?: string;
  minHeight?: string;
  maxHeight?: string;
  command?: string;
  allowResize?: boolean;
  showCloseButton?: boolean;
  alwaysRerender?: boolean;
  showResizeLine?: boolean;
  uiTemplate: string;
  classList?: string[];
  canStack?: boolean;
}

export interface IDesignerConfig {
  templateMap?: Record<string, string>;
  commandMap?: Record<string, ICommand>;
  quickAccessBar?: string[];
  ribbon?: IRibbonPanel[] | IRibbonPanelConfig;
  contextMenu?: string[];
  sidePanels?: ISidePanel[];
  fileMenu?: string;
  templatesConfig?: string;
  keyboard?: {
    commands?: { commandName: string; key: string; altKey?: boolean; ctrlKey?: boolean; shiftKey?: boolean; metaKey?: boolean }[];
    [key: string]: unknown;
  };
}

export type CommandMap = Record<string, ICommand>;

export interface IListItemData {
  text?: string;
  value?: unknown;
  iconClass?: string;
  className?: string;
  disabled?: boolean;
  visible?: boolean;
  title?: string;
  [key: string]: unknown;
}

export interface IListSubItemData extends IListItemData {
  items?: IListSubItemData[];
}

export interface IListGroupItemData extends IListSubItemData {
  children?: IListSubItemData[];
}

export interface IColorGroup {
  name: string;
  colors: string[][];
}

export interface ITheme {
  colorForeground?: string;
  colorForegroundDisabled?: string;
  colorBackground?: string;
  colorBackgroundHover?: string;
  colorBackgroundSelected?: string;
  colorBackgroundDisabled?: string;
  colorBackground2?: string;
  colorBackground2Hover?: string;
  colorBackground2Selected?: string;
  colorBrandForeground?: string;
  colorBrandBackground?: string;
  colorBrandBackgroundHover?: string;
  colorBrandBackgroundSelected?: string;
  colorStroke?: string;
  colorStrokeHover?: string;
  colorStrokeSelected?: string;
  colorStrokeDisabled?: string;
  borderRadiusM?: string;
  borderRadiusL?: string;
  borderRadiusXL?: string;
  shadow4?: string;
  shadow8?: string;
}

export interface IComponentBaseOption {
  id?: string;
  className?: string;
  visibleWhen?: string;
  enableWhen?: string;
  margin?: string;
  [key: string]: unknown;
}

export interface IBindingComponentBaseOption extends IComponentBaseOption {
  bindingPath?: string;
  mutexWith?: string;
}

export interface IComponentDialogButtonOption {
  text: string;
  buttonType?: 'Ok' | 'Cancel';
  click?: (context?: unknown) => unknown;
  closeAfterClick?: boolean;
  className?: string;
  disabled?: boolean;
  /** Tab key (`TabControl`) this button belongs to; the footer hides it while another tab is active. */
  visibleWhen?: string;
  /** Tab key(s) while this button gets the primary (green) styling. */
  primaryWhenTab?: string | string[];
  bindingPath?: string;
}

export interface IDialogTemplate {
  templateName: string;
  title?: string;
  modal?: boolean;
  content: IComponentRenderType[];
  buttons?: IComponentDialogButtonOption[];
  /** The body renders its own footer (wizards with dynamic buttons). */
  hideFooter?: boolean;
  resizable?: boolean;
}

export interface IComponentRenderType extends IComponentBaseOption {
  type: string;
  bindingPath?: string;
  placeholder?: string;
  command?: string;
  items?: unknown[];
  text?: string;
  children?: IComponentRenderType[];
  style?: string;
  tip?: string;
  width?: string | number;
  height?: string | number;
  iconClass?: string;
  [key: string]: unknown;
}

export interface ITemplateConfig {
  name: string;
  data?: string | object;
  thumbnail?: string;
}

export type IconType = 'foreColor' | 'backColor' | 'sparklineColor';
export type RuleType = 'Defaults' | 'Float' | 'Currency' | 'Percent';

export enum FileType {
  Json = 1,
  Excel = 2,
  Csv = 3,
  SJS = 4,
  XLSM = 5,
  XLTM = 6,
  XLTX = 7,
}

export enum MessageBoxButtons {
  ok = 0,
  okCancel = 1,
  yesNoCancel = 2,
  yesNo = 3,
}

export enum MessageBoxIcon {
  info = 1,
  warning = 2,
  error = 3,
}

export enum MessageBoxResult {
  none = 0,
  ok = 1,
  yes = 2,
  no = 3,
  cancel = 4,
}

export enum ThemeTokens {
  colorForeground = '--sjs-color-foreground',
  colorForegroundDisabled = '--sjs-color-foreground-disabled',
  colorBackground = '--sjs-color-background',
  colorBackgroundHover = '--sjs-color-background-hover',
  colorBackgroundSelected = '--sjs-color-background-selected',
  colorBackgroundDisabled = '--sjs-color-background-disabled',
  colorBackground2 = '--sjs-color-background-2',
  colorBackground2Hover = '--sjs-color-background-2-hover',
  colorBackground2Selected = '--sjs-color-background-2-selected',
  colorBrandForeground = '--sjs-color-brand-foreground',
  colorBrandBackground = '--sjs-color-brand-background',
  colorBrandBackgroundHover = '--sjs-color-brand-background-hover',
  colorBrandBackgroundSelected = '--sjs-color-brand-background-selected',
  colorStroke = '--sjs-color-stroke',
  colorStrokeHover = '--sjs-color-stroke-hover',
  colorStrokeSelected = '--sjs-color-stroke-selected',
  colorStrokeDisabled = '--sjs-color-stroke-disabled',
  borderRadiusM = '--sjs-border-radius-m',
  borderRadiusL = '--sjs-border-radius-l',
  borderRadiusXL = '--sjs-border-radius-xl',
  shadow4 = '--sjs-shadow-4',
  shadow8 = '--sjs-shadow-8',
}

export interface IRegistry {
  values: Map<string, unknown>;
}

/**
 * The Designer instance handed to command `getState`/`execute`/`init` callbacks
 * (the official d.ts types it as the Designer class). Declared structurally
 * here, covering the public command-facing members of the class, so this
 * public type file stays a dependency-free leaf (importing the class would
 * close a cycle through `designer.ts` -> `types.ts`). `DesignerApi` in
 * designer-api.ts extends this surface.
 */
export interface IDesignerCommandContext {
  getWorkbook(): Workbook;
  getConfig(): IDesignerConfig;
  getData(key: string): unknown;
  setData(key: string, value: unknown): void;
  activeRibbonTab(ribbonTabId?: string): string;
  refresh(): void;
  invalidate(): void;
  bind(type: string, fn?: (...args: never[]) => unknown): void;
  unbind(type: string, fn?: (...args: never[]) => unknown): void;
  getCommand(commandName?: string): ICommand | Record<string, ICommand> | undefined;
  executeCommand(commandName: string, propertyName?: string, value?: unknown): boolean;
  executeBuiltin(commandName: string, propertyName?: string, value?: unknown): void;
  executeSpecial(name: string, value: unknown, propertyName?: string): boolean;
  runUndoable(commandName: string, args: Record<string, unknown>): void;
  getCommandState(commandName: string): CommandState;
  setCommandState(commandName: string, state: CommandState): void;
  showDialog(
    templateName: string, bindingData: Record<string, unknown>, successCallback: (data: Record<string, unknown>) => void,
    errCallback?: (error: unknown) => void, validCallback?: (data: Record<string, unknown>) => boolean | void, popupElement?: HTMLElement,
  ): void;
  closeDialog(templateName: string, submitValue: boolean): void;
  showMessageBox(
    text: string, title: string, icon: MessageBoxIcon, successCallback?: (result: number) => void,
    errCallback?: () => void, buttons?: MessageBoxButtons,
  ): void;
  closeMessageBox(result: number): void;
  getTheme(): ITheme;
  setTheme(theme: Partial<ITheme> | null): void;
  notImplementedPlugin(feature: string): void;
  insertFunctionText(name: string, suffix?: string): void;
}
