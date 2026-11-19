/* Shared builders for the built-in dialog templates: the tiny functions that
 * produce the declarative `IComponentRenderType` trees, plus the button-click
 * context cast every template handler starts with. Leaf module: only types. */
import type { DesignerApi as Designer, DialogData } from '../designer-api.js';
import type { IComponentRenderType } from '../types.js';

/**
 * The context object `DialogHost` passes to a dialog button's `click` handler
 * (spread of the host's internal render context plus the clicked `button`).
 * The button option types the handler context as `unknown` (the official
 * template contract), so every handler here starts with this one cast.
 */
export interface DialogButtonContext {
  designer: Designer;
  data: DialogData;
  update: (path: string | undefined, value: unknown) => void;
  rerender: () => void;
}
export const buttonCtx = (context: unknown): DialogButtonContext => context as DialogButtonContext;
export const text = (value: string, className?: string): IComponentRenderType => ({ type: 'TextBlock', text: value, className });
export const editor = (bindingPath: string, className?: string): IComponentRenderType => ({ type: 'TextEditor', bindingPath, className });
export const number = (bindingPath: string, className?: string): IComponentRenderType => ({ type: 'NumberEditor', bindingPath, className });
export const select = (bindingPath: string, items: { text: string; value: unknown }[], className?: string): IComponentRenderType => ({ type: 'ComboBox', bindingPath, items, className });
export const check = (bindingPath: string, textValue: string): IComponentRenderType => ({ type: 'CheckBox', bindingPath, text: textValue });
export const col = (children: IComponentRenderType[], width?: string): IComponentRenderType => ({ type: 'Column', children, width });
export const row = (children: IComponentRenderType[], className?: string): IComponentRenderType => ({ type: 'ColumnSet', children, className });
