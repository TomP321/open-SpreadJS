import { canvasColor as resolveColor } from '../colors.js';
/**
 * Cell types. The Base class is extensible exactly like the documented custom
 * cell type tutorial: paint/paintContent draw, getHitInfo/process* handle
 * pointer input and createEditorElement/getEditorValue/setEditorValue bridge
 * the HTML editor.
 */
import { Style, clone } from '../primitives.js';
import { GC } from '../generated/enums.js';
import { GeneralFormatter } from '../formatter.js';
import type { Worksheet } from '../model.js';
import { deserializeValue, type JsonRecord } from '../serialization.js';

const CT = GC.Spread.Sheets.CellTypes as unknown as {
  EditorType: Record<string, number>;
  EditorValueType: Record<string, number>;
  SelectionMode: Record<string, number>;
  Direction: Record<string, number>;
  CheckBoxTextAlign: Record<string, number>;
  TextAlign: Record<string, number>;
  HyperLinkTargetType: Record<string, number>;
};
const EditorType = CT.EditorType;

export interface CellRect {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface CellTypeContext {
  sheet?: Worksheet;
  row?: number;
  col?: number;
  sheetArea?: number;
  cellStyle?: Style;
  sheetName?: string;
}

function formatValue(value: unknown, formatter: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) {
    const format = formatter instanceof GeneralFormatter ? formatter : new GeneralFormatter(typeof formatter === 'string' ? formatter : 'General');
    return format.format(value);
  }
  if (formatter instanceof GeneralFormatter) return formatter.format(value);
  if (typeof formatter === 'string' && formatter) return new GeneralFormatter(formatter).format(value);
  if (typeof value === 'boolean') return String(value).toUpperCase();
  return String(value);
}

const DEFAULT_FONT = '14.6667px Calibri';

export class Base {
  typeName = '0';
  constructor() {}
  createEditorElement(_context?: unknown): HTMLElement {
    const div = document.createElement('div');
    div.contentEditable = 'true';
    div.className = '';
    return div;
  }
  activateEditor(_editorContext: HTMLElement, _cellStyle: Style, _cellRect: CellRect, _context?: unknown): void {}
  deactivateEditor(_editorContext: HTMLElement, _context?: unknown): void {}
  focus(editorContext: HTMLElement, _context?: unknown): void {
    editorContext.focus();
  }
  format(value: unknown, format: GeneralFormatter | string, _formattedData?: unknown, _context?: unknown): string {
    return formatValue(value, format);
  }
  fromJSON(settings: unknown): void {
    if (settings && typeof settings === 'object') for (const [key, value] of Object.entries(settings as JsonRecord)) if (key !== 'typeName') (this as JsonRecord)[key] = deserializeValue(value);
  }
  getAutoFitHeight(_value: unknown, text: string, cellStyle: Style, zoomFactor: number): number {
    const size = Number((String(cellStyle.font ?? DEFAULT_FONT).match(/([\d.]+)px/) ?? [0, 14.6667])[1]);
    return Math.max(1, text.split('\n').length) * size * 1.2 * zoomFactor + 2;
  }
  getAutoFitWidth(_value: unknown, text: string, cellStyle: Style, zoomFactor: number): number {
    const context = document.createElement('canvas').getContext('2d');
    if (!context) return text.length * 7 * zoomFactor;
    context.font = String(cellStyle.font ?? DEFAULT_FONT);
    return context.measureText(text).width * zoomFactor + 8;
  }
  getEditorValue(editorContext: HTMLElement, _context?: unknown): unknown {
    return (editorContext as HTMLInputElement).value ?? editorContext.textContent;
  }
  setEditorValue(editorContext: HTMLElement, value: unknown, _context?: unknown): void {
    (editorContext as HTMLInputElement).value = value == null ? '' : String(value);
    if (editorContext.isContentEditable) editorContext.textContent = value == null ? '' : String(value);
  }
  selectAll(editorContext: HTMLElement, _context?: unknown): void {
    (editorContext as HTMLInputElement).select?.();
  }
  updateEditor(_editorContext: HTMLElement, _cellStyle: Style, cellRect: CellRect): CellRect {
    return cellRect;
  }
  updateEditorContainer(editorContext: HTMLElement, editorBounds: CellRect, _cellStyle: Style): void {
    Object.assign(editorContext.style, {
      left: `${editorBounds.x}px`,
      top: `${editorBounds.y}px`,
      width: `${editorBounds.width}px`,
      height: `${editorBounds.height}px`,
    });
  }
  updateImeMode(_editorContext: HTMLElement, _imeMode: number, _context?: unknown): void {}
  isImeAware(_context?: unknown): boolean {
    return true;
  }
  isReservedKey(_event: KeyboardEvent, _context?: unknown): boolean {
    return false;
  }
  isEditingValueChanged(oldValue: unknown, newValue: unknown, _context?: unknown): boolean {
    return !Object.is(oldValue, newValue);
  }
  processKeyDown(_event: KeyboardEvent, _context?: unknown): boolean { return false; }
  processKeyUp(_event: KeyboardEvent, _context?: unknown): boolean { return false; }
  processMouseDown(_hitInfo: unknown): boolean { return false; }
  processMouseEnter(_hitInfo: unknown): boolean { return false; }
  processMouseLeave(_hitInfo: unknown): boolean { return false; }
  processMouseMove(_hitInfo: unknown): boolean { return false; }
  processMouseUp(_hitInfo: unknown): boolean { return false; }
  getHitInfo(_x: number, _y: number, _cellStyle: Style, _cellRect: CellRect, _context?: unknown): unknown {
    return null;
  }
  paint(
    ctx: CanvasRenderingContext2D,
    value: unknown,
    x: number,
    y: number,
    w: number,
    h: number,
    style: Style,
    context?: unknown,
  ): void {
    this.paintContent(ctx, value, x, y, w, h, style, context);
  }
  paintContent(
    ctx: CanvasRenderingContext2D,
    value: unknown,
    x: number,
    y: number,
    w: number,
    h: number,
    style: Style,
    _context?: unknown,
  ): void {
    const text = this.format(value, (style.formatter as string) ?? 'General');
    if (!text) return;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w - 1, h - 1);
    ctx.clip();
    ctx.font = String(style.font ?? DEFAULT_FONT);
    ctx.fillStyle = resolveColor(String(style.foreColor ?? 'black'));
    ctx.textBaseline = 'middle';
    const align = Number(style.hAlign ?? 0);
    ctx.textAlign = align === 2 ? 'right' : align === 1 ? 'center' : 'left';
    const px = align === 2 ? x + w - 3 : align === 1 ? x + w / 2 : x + 2;
    const lines = text.split('\n');
    const middle = y + h / 2 - ((lines.length - 1) * Number(ctx.font.match(/([\d.]+)px/)?.[1] ?? 14) * 1.2) / 2;
    lines.forEach((line, index) => ctx.fillText(line, px, middle + index * Number(ctx.font.match(/([\d.]+)px/)?.[1] ?? 14) * 1.2));
    ctx.restore();
  }
  toJSON(): JsonRecord {
    const result: JsonRecord = { typeName: this.typeName };
    for (const [key, value] of Object.entries(this))
      if (key !== 'typeName' && value !== undefined && typeof value !== 'function') result[key] = clone(value);
    return result;
  }
}

export class Text extends Base {
  override typeName = '1';
  allowOverflow = true;
  editorType: number;
  constructor(editorType?: number) {
    super();
    this.editorType = editorType ?? EditorType.editableDiv ?? 1;
  }
  override fromJSON(settings: unknown): void {
    const json = deserializeValue(settings) as JsonRecord;
    if (json.allowOverflow !== undefined) this.allowOverflow = !!json.allowOverflow;
    if (json.editorType !== undefined) this.editorType = Number(json.editorType);
  }
  override toJSON(): JsonRecord {
    return { typeName: this.typeName, allowOverflow: this.allowOverflow, editorType: this.editorType };
  }
}
export class ColumnHeader extends Base {
  override typeName = '2';
  allowOverflow = false;
  override toJSON(): JsonRecord { return { typeName: this.typeName, allowOverflow: this.allowOverflow }; }
}
export class RowHeader extends Base {
  override typeName = '3';
  allowOverflow = false;
  override toJSON(): JsonRecord { return { typeName: this.typeName, allowOverflow: this.allowOverflow }; }
}
export class Corner extends Base {
  override typeName = '4';
  allowOverflow = false;
  override toJSON(): JsonRecord { return { typeName: this.typeName, allowOverflow: this.allowOverflow }; }
}

function drawCheckMark(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string): void {
  ctx.save();
  ctx.strokeStyle = resolveColor(color);
  ctx.lineWidth = Math.max(2, size / 7);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x + size * 0.2, y + size * 0.52);
  ctx.lineTo(x + size * 0.42, y + size * 0.75);
  ctx.lineTo(x + size * 0.8, y + size * 0.25);
  ctx.stroke();
  ctx.restore();
}
function drawMixedMark(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, _color: string): void {
  ctx.fillStyle = '#008000';
  ctx.fillRect(x + size * 0.3, y + size * 0.3, size * 0.4, size * 0.4);
}
function drawCheckBox(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  state: boolean | null,
  backColor: string,
  borderColor: string,
): void {
  ctx.save();
  ctx.fillStyle = backColor;
  ctx.fillRect(x, y, size, size);
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1);
  if (state === true) drawCheckMark(ctx, x, y, size, borderColor);
  else if (state === null) drawMixedMark(ctx, x, y, size, borderColor);
  ctx.restore();
}

export class CheckBox extends Base {
  override typeName = '5';
  private props: JsonRecord = {
    isThreeState: false,
    caption: '',
    textTrue: '',
    textFalse: '',
    textIndeterminate: '',
    boxSize: 0,
    textAlign: 2,
    mode: 'checkbox',
    hitTestMode: 'checkbox',
    textEditable: false,
  };
  constructor() { super(); }
  private prop(key: string, value?: unknown): unknown {
    if (value === undefined) return this.props[key];
    this.props[key] = value;
    return this;
  }
  boxSize(value?: number | string): unknown { return this.prop('boxSize', value); }
  caption(value?: string): unknown { return this.prop('caption', value); }
  hitTestMode(value?: string): unknown { return this.prop('hitTestMode', value); }
  isThreeState(value?: boolean): unknown { return this.prop('isThreeState', value); }
  mode(value?: string): unknown { return this.prop('mode', value); }
  textAlign(value?: number): unknown { return this.prop('textAlign', value); }
  textEditable(value?: boolean): unknown { return this.prop('textEditable', value); }
  textFalse(value?: string): unknown { return this.prop('textFalse', value); }
  textIndeterminate(value?: string): unknown { return this.prop('textIndeterminate', value); }
  textTrue(value?: string): unknown { return this.prop('textTrue', value); }
  toggleOptions(value?: JsonRecord): unknown { return this.prop('toggleOptions', value); }
  override fromJSON(settings: unknown): void {
    const json = deserializeValue(settings) as JsonRecord;
    for (const key of ['caption', 'textTrue', 'textIndeterminate', 'textFalse', 'isThreeState', 'boxSize', 'textAlign', 'mode', 'hitTestMode', 'textEditable', 'toggleOptions'])
      if (json[key] !== undefined) this.props[key] = json[key];
  }
  override toJSON(): JsonRecord {
    const result: JsonRecord = { typeName: this.typeName };
    for (const key of ['caption', 'textTrue', 'textIndeterminate', 'textFalse', 'isThreeState', 'boxSize', 'toggleOptions']) {
      const value = this.props[key];
      if (value === undefined) continue;
      if (key === 'isThreeState' && value === false) continue;
      if (key === 'boxSize' && value === 0) continue;
      if (typeof value === 'string' && value === '') continue;
      if (key === 'textAlign' && value === 2) continue;
      if ((key === 'mode' && value === 'checkbox') || (key === 'hitTestMode' && value === 'checkbox')) continue;
      if (key === 'textEditable' && value === false) continue;
      result[key] = clone(value);
    }
    return result;
  }
  override paint(
    ctx: CanvasRenderingContext2D,
    value: unknown,
    x: number,
    y: number,
    w: number,
    h: number,
    style: Style,
    context?: unknown,
  ): void {
    const size = Number(this.props.boxSize) || 13;
    const state = value === true ? true : value === false ? false : this.props.isThreeState ? null : false;
    const left = x + 5;
    const top = y + 5;
    drawCheckBox(ctx, left, top, size, state, '#ffffff', String(style.foreColor ?? '#000000'));
    const caption = this.props.caption ? String(this.props.caption) : '';
    const stateText = state === true ? String(this.props.textTrue ?? '') : state === false ? String(this.props.textFalse ?? '') : String(this.props.textIndeterminate ?? '');
    const text = [caption, stateText].filter(Boolean).join(' ') || this.format(value, (style.formatter as string) ?? 'General');
    if (text) {
      ctx.save();
      ctx.font = String(style.font ?? DEFAULT_FONT);
      ctx.fillStyle = resolveColor(String(style.foreColor ?? 'black'));
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      ctx.fillText(text, left + size + 3, top + size / 2 + 1);
      ctx.restore();
    }
    void context;
  }
}

export class Button extends Base {
  override typeName = '6';
  private props: JsonRecord = { marginTop: 1, marginRight: 1, marginBottom: 1, marginLeft: 1, text: '', buttonBackColor: undefined };
  private prop(key: string, value?: unknown): unknown {
    if (value === undefined) return this.props[key];
    this.props[key] = value;
    return this;
  }
  buttonBackColor(value?: string): unknown { return this.prop('buttonBackColor', value); }
  marginBottom(value?: number): unknown { return this.prop('marginBottom', value); }
  marginLeft(value?: number): unknown { return this.prop('marginLeft', value); }
  marginRight(value?: number): unknown { return this.prop('marginRight', value); }
  marginTop(value?: number): unknown { return this.prop('marginTop', value); }
  text(value?: string): unknown { return this.prop('text', value); }
  override fromJSON(settings: unknown): void {
    const json = deserializeValue(settings) as JsonRecord;
    for (const key of ['marginRight', 'marginBottom', 'marginLeft', 'marginTop', 'text', 'buttonBackColor'])
      if (json[key] !== undefined) this.props[key] = json[key];
  }
  override toJSON(): JsonRecord {
    const result: JsonRecord = { typeName: this.typeName };
    for (const key of ['marginRight', 'marginBottom', 'marginLeft', 'text', 'buttonBackColor'])
      if (this.props[key] !== undefined && this.props[key] !== '') result[key] = clone(this.props[key]);
    return result;
  }
  override paint(
    ctx: CanvasRenderingContext2D,
    value: unknown,
    x: number,
    y: number,
    w: number,
    h: number,
    style: Style,
  ): void {
    const left = x + Number(this.props.marginLeft ?? 1), top = y + Number(this.props.marginTop ?? 1);
    const right = x + w - 1 - Number(this.props.marginRight ?? 1), bottom = y + h - 1 - Number(this.props.marginBottom ?? 1);
    ctx.save();
    ctx.fillStyle = resolveColor(String(this.props.buttonBackColor ?? '#e7eef7'));
    ctx.fillRect(left, top, Math.max(0, right - left), Math.max(0, bottom - top));
    ctx.strokeStyle = '#707070';
    ctx.lineWidth = 1;
    ctx.strokeRect(left + 0.5, top + 0.5, Math.max(0, right - left - 1), Math.max(0, bottom - top - 1));
    const text = String(this.props.text ?? '') || this.format(value, (style.formatter as string) ?? 'General');
    ctx.font = String(style.font ?? DEFAULT_FONT);
    ctx.fillStyle = resolveColor(String(style.foreColor ?? 'black'));
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, left + 2, (top + bottom) / 2 + 2);
    ctx.restore();
  }
}

export class ComboBox extends Base {
  override typeName = '7';
  private props: JsonRecord = {
    items: [] as unknown[],
    editable: true,
    editorValueType: 0,
    itemHeight: 20,
    maxDropDownItems: 20,
    allowFloat: true,
    dataBinding: undefined,
  };
  private prop(key: string, value?: unknown): unknown {
    if (value === undefined) return this.props[key];
    this.props[key] = value;
    return this;
  }
  items(items?: unknown[]): unknown {
    if (items === undefined) return this.props.items;
    this.props.items = items.map((item) =>
      item && typeof item === 'object' ? { ...(item as JsonRecord) } : item,
    );
    return this;
  }
  editable(value?: boolean): unknown { return this.prop('editable', value); }
  editorValueType(value?: number): unknown { return this.prop('editorValueType', value); }
  itemHeight(value?: number): unknown { return this.prop('itemHeight', value); }
  maxDropDownItems(value?: number): unknown { return this.prop('maxDropDownItems', value); }
  allowFloat(value?: boolean): unknown { return this.prop('allowFloat', value); }
  dataBinding(value?: JsonRecord): unknown { return this.prop('dataBinding', value); }
  override fromJSON(settings: unknown): void {
    const json = deserializeValue(settings) as JsonRecord;
    for (const key of ['items', 'editable', 'editorValueType', 'itemHeight', 'maxDropDownItems', 'allowFloat', 'dataBinding'])
      if (json[key] !== undefined) this.props[key] = json[key];
  }
  override toJSON(): JsonRecord {
    const result: JsonRecord = { typeName: this.typeName };
    if (this.props.editorValueType) result.editorValueType = this.props.editorValueType;
    if ((this.props.items as unknown[]).length) result.items = this.props.items;
    if (this.props.editable !== undefined) result.editable = this.props.editable;
    if (this.props.allowFloat === false) result.allowFloat = false;
    if (this.props.dataBinding) result.dataBinding = clone(this.props.dataBinding);
    if (this.props.itemHeight !== 20) result.itemHeight = this.props.itemHeight;
    if (this.props.maxDropDownItems !== 20) result.maxDropDownItems = this.props.maxDropDownItems;
    return result;
  }
  override paint(
    ctx: CanvasRenderingContext2D,
    value: unknown,
    x: number,
    y: number,
    w: number,
    h: number,
    style: Style,
  ): void {
    const text = this.displayText(value);
    ctx.save();
    ctx.font = String(style.font ?? DEFAULT_FONT);
    ctx.fillStyle = resolveColor(String(style.foreColor ?? 'black'));
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillText(text, x + 1, y + h / 2 - 2);
    ctx.restore();
    ctx.save();
    ctx.fillStyle = '#000000';
    const cx = x + w - 11, cy = y + h / 2 - 2;
    ctx.beginPath();
    ctx.moveTo(cx - 4, cy - 2);
    ctx.lineTo(cx + 4, cy - 2);
    ctx.lineTo(cx, cy + 3);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  displayText(value: unknown): string {
    const items = this.props.items as unknown[];
    const editorValueType = Number(this.props.editorValueType ?? 0);
    if (editorValueType === 0) return value == null ? '' : String(value);
    if (editorValueType === 1) {
      const index = Number(value);
      const item = items[index];
      return item == null ? '' : String((item as JsonRecord).text ?? item);
    }
    const item = items.find((candidate) =>
      typeof candidate === 'object' && candidate ? (candidate as JsonRecord).value === value : candidate === value,
    );
    return item == null ? String(value ?? '') : String((item as JsonRecord).text ?? item);
  }
}

export class HyperLink extends Base {
  override typeName = '8';
  private props: JsonRecord = {
    text: '',
    linkColor: '#0066cc',
    visitedLinkColor: '#3399ff',
    linkToolTip: '',
    target: 0,
    activeOnClick: true,
  };
  private prop(key: string, value?: unknown): unknown {
    if (value === undefined) return this.props[key];
    this.props[key] = value;
    return this;
  }
  text(value?: string): unknown { return this.prop('text', value); }
  linkColor(value?: string): unknown { return this.prop('linkColor', value); }
  visitedLinkColor(value?: string): unknown { return this.prop('visitedLinkColor', value); }
  linkToolTip(value?: string): unknown { return this.prop('linkToolTip', value); }
  target(value?: number): unknown { return this.prop('target', value); }
  activeOnClick(value?: boolean): unknown { return this.prop('activeOnClick', value); }
  onClickAction(value?: (...args: unknown[]) => unknown): unknown { return this.prop('onClickAction', value); }
  override fromJSON(settings: unknown): void {
    const json = deserializeValue(settings) as JsonRecord;
    for (const key of ['text', 'linkColor', 'visitedLinkColor', 'linkToolTip', 'target', 'activeOnClick'])
      if (json[key] !== undefined) this.props[key] = json[key];
  }
  override toJSON(): JsonRecord {
    const result: JsonRecord = { typeName: this.typeName };
    for (const key of ['text', 'linkColor', 'visitedLinkColor', 'linkToolTip', 'activeOnClick', 'onClickAction'])
      if (this.props[key] !== undefined && this.props[key] !== '' && !(key === 'activeOnClick' && this.props[key] === true))
        result[key] = key === 'onClickAction' ? undefined : clone(this.props[key]);
    if (this.props.target) result.target = this.props.target;
    return result;
  }
  override paint(
    ctx: CanvasRenderingContext2D,
    value: unknown,
    x: number,
    y: number,
    w: number,
    h: number,
    style: Style,
    context?: unknown,
  ): void {
    const link = (context as { hyperlink?: { url?: string } } | undefined)?.hyperlink;
    const text = String(this.props.text ?? '') || this.format(value, (style.formatter as string) ?? 'General');
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w - 1, h - 1);
    ctx.clip();
    ctx.font = String(style.font ?? DEFAULT_FONT);
    ctx.fillStyle = resolveColor(String(this.props.linkColor ?? '#0066cc'));
    ctx.textBaseline = 'top';
    ctx.fillText(text, x, y + 3);
    const width = ctx.measureText(text).width;
    ctx.fillRect(x, y + 15, width, 1);
    ctx.restore();
    void link;
  }
}

abstract class ItemListBase extends Base {
  protected props: JsonRecord = {
    items: [] as unknown[],
    direction: 0,
    isFlowLayout: true,
    maxColumnCount: 0,
    maxRowCount: 0,
    itemSpacing: { horizontal: 5, vertical: 5 },
    boxSize: 0,
    textAlign: 2,
  };
  protected prop(key: string, value?: unknown): unknown {
    if (value === undefined) return this.props[key];
    this.props[key] = value;
    return this;
  }
  items(items?: unknown[]): unknown {
    if (items === undefined) return this.props.items;
    this.props.items = items.map((item) =>
      item && typeof item === 'object' ? { ...(item as JsonRecord) } : { text: String(item), value: item },
    );
    return this;
  }
  direction(value?: number): unknown { return this.prop('direction', value); }
  isFlowLayout(value?: boolean): unknown { return this.prop('isFlowLayout', value); }
  maxColumnCount(value?: number): unknown { return this.prop('maxColumnCount', value); }
  maxRowCount(value?: number): unknown { return this.prop('maxRowCount', value); }
  itemSpacing(value?: JsonRecord): unknown { return this.prop('itemSpacing', value); }
  boxSize(value?: number | string): unknown { return this.prop('boxSize', value); }
  textAlign(value?: number): unknown { return this.prop('textAlign', value); }
  override fromJSON(settings: unknown): void {
    const json = deserializeValue(settings) as JsonRecord;
    for (const key of ['items', 'direction', 'isFlowLayout', 'maxColumnCount', 'maxRowCount', 'itemSpacing', 'boxSize', 'textAlign', 'selectedBackColor', 'selectedForeColor', 'padding', 'selectionMode'])
      if (json[key] !== undefined) this.props[key] = json[key];
  }
  protected itemLayout(x: number, y: number, w: number, h: number): { x: number; y: number; size: number }[] {
    const count = (this.props.items as unknown[]).length;
    const spacing = (this.props.itemSpacing as { horizontal?: number; vertical?: number }) ?? {};
    const horizontal = spacing.horizontal ?? 5;
    const vertical = spacing.vertical ?? 5;
    const size = Number(this.props.boxSize) || Math.min(16, Math.max(10, h - 4));
    const direction = Number(this.props.direction ?? 0);
    const result: { x: number; y: number; size: number }[] = [];
    if (direction === 0) {
      let px = x + 2;
      for (let i = 0; i < count; i++) {
        result.push({ x: px, y: y + (h - size) / 2, size });
        px += size + 4 + horizontal;
      }
    } else {
      let py = y + 2;
      for (let i = 0; i < count; i++) {
        result.push({ x: x + 2, y: py, size });
        py += Math.max(size, 16) + vertical;
      }
    }
    return result;
  }
  protected valueSet(value: unknown): unknown[] {
    if (Array.isArray(value)) return value;
    if (typeof value === 'number') return [value];
    if (typeof value === 'string' && value) return value.split(',');
    return [];
  }
}
export class CheckBoxList extends ItemListBase {
  override typeName = '12';

  override items(value?: unknown[]): unknown { return super.items(value); }
  override direction(value?: number): unknown { return super.direction(value); }
  override isFlowLayout(value?: boolean): unknown { return super.isFlowLayout(value); }
  override maxColumnCount(value?: number): unknown { return super.maxColumnCount(value); }
  override maxRowCount(value?: number): unknown { return super.maxRowCount(value); }
  override itemSpacing(value?: JsonRecord): unknown { return super.itemSpacing(value); }
  override boxSize(value?: number | string): unknown { return super.boxSize(value); }
  override textAlign(value?: number): unknown { return super.textAlign(value); }
  override toJSON(): JsonRecord {
    const result: JsonRecord = { typeName: this.typeName };
    if ((this.props.items as unknown[]).length) result.items = clone(this.props.items);
    if (this.props.boxSize) result.boxSize = this.props.boxSize;
    if (this.props.direction) result.direction = this.props.direction;
    if (this.props.isFlowLayout === false) result.isFlowLayout = false;
    if (this.props.maxColumnCount) result.maxColumnCount = this.props.maxColumnCount;
    if (this.props.maxRowCount) result.maxRowCount = this.props.maxRowCount;
    if (this.props.textAlign !== 2) result.textAlign = this.props.textAlign;
    if (this.props.itemSpacing) result.itemSpacing = clone(this.props.itemSpacing);
    return result;
  }
  override paint(ctx: CanvasRenderingContext2D, value: unknown, x: number, y: number, w: number, h: number, style: Style): void {
    const selected = this.valueSet(value).map(String);
    const items = this.props.items as unknown[];
    const size = Number(this.props.boxSize) || 13;
    ctx.save();
    ctx.font = String(style.font ?? DEFAULT_FONT);
    ctx.fillStyle = resolveColor(String(style.foreColor ?? 'black'));
    ctx.textBaseline = 'middle';
    let px = x + 1;
    const top = y + 3;
    items.forEach((item, index) => {
      const text = String((item as JsonRecord)?.text ?? item);
      const checked = selected.includes(String(text)) || selected.includes(String(index));
      drawCheckBox(ctx, px, top, size, checked, '#ffffff', String(style.foreColor ?? '#000000'));
      ctx.fillStyle = resolveColor(String(style.foreColor ?? 'black'));
      ctx.fillText(text, px + size + 4, top + size / 2 + 2);
      px += size + 6 + ctx.measureText(text).width + 18;
    });
    ctx.restore();
  }
}
export class RadioButtonList extends ItemListBase {
  override typeName = '11';

  override items(value?: unknown[]): unknown { return super.items(value); }
  override direction(value?: number): unknown { return super.direction(value); }
  override isFlowLayout(value?: boolean): unknown { return super.isFlowLayout(value); }
  override maxColumnCount(value?: number): unknown { return super.maxColumnCount(value); }
  override maxRowCount(value?: number): unknown { return super.maxRowCount(value); }
  override itemSpacing(value?: JsonRecord): unknown { return super.itemSpacing(value); }
  override boxSize(value?: number | string): unknown { return super.boxSize(value); }
  override textAlign(value?: number): unknown { return super.textAlign(value); }
  override toJSON(): JsonRecord {
    const result: JsonRecord = { typeName: this.typeName };
    if ((this.props.items as unknown[]).length) result.items = clone(this.props.items);
    if (this.props.boxSize) result.boxSize = this.props.boxSize;
    if (this.props.direction) result.direction = this.props.direction;
    if (this.props.textAlign !== 2) result.textAlign = this.props.textAlign;
    if (this.props.maxColumnCount) result.maxColumnCount = this.props.maxColumnCount;
    if (this.props.maxRowCount) result.maxRowCount = this.props.maxRowCount;
    if (this.props.itemSpacing) result.itemSpacing = clone(this.props.itemSpacing);
    return result;
  }
  override paint(ctx: CanvasRenderingContext2D, value: unknown, x: number, y: number, w: number, h: number, style: Style): void {
    const selected = this.valueSet(value).map(String);
    const items = this.props.items as unknown[];
    const size = Number(this.props.boxSize) || 13;
    ctx.save();
    ctx.font = String(style.font ?? DEFAULT_FONT);
    ctx.textBaseline = 'middle';
    let px = x + 1;
    const top = y + 2;
    items.forEach((item, index) => {
      const text = String((item as JsonRecord)?.text ?? item);
      const checked = selected.includes(String(text)) || selected.includes(String(index));
      const cx = px + size / 2, cy = top + size / 2;
      ctx.beginPath();
      ctx.arc(cx, cy, size / 2 - 0.5, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.strokeStyle = resolveColor(String(style.foreColor ?? '#000000'));
      ctx.lineWidth = 1;
      ctx.stroke();
      if (checked) {
        ctx.beginPath();
        ctx.arc(cx, cy, size / 2 - 4, 0, Math.PI * 2);
        ctx.fillStyle = resolveColor(String(style.foreColor ?? '#000000'));
        ctx.fill();
      }
      ctx.fillStyle = resolveColor(String(style.foreColor ?? 'black'));
      ctx.fillText(text, px + size + 4, top + size / 2 + 3);
      px += size + 8 + ctx.measureText(text).width + 16;
    });
    ctx.restore();
  }
}
export class ButtonList extends ItemListBase {
  override typeName = '13';

  override items(value?: unknown[]): unknown { return super.items(value); }
  override direction(value?: number): unknown { return super.direction(value); }
  override isFlowLayout(value?: boolean): unknown { return super.isFlowLayout(value); }
  override maxColumnCount(value?: number): unknown { return super.maxColumnCount(value); }
  override maxRowCount(value?: number): unknown { return super.maxRowCount(value); }
  override itemSpacing(value?: JsonRecord): unknown { return super.itemSpacing(value); }
  override boxSize(value?: number | string): unknown { return super.boxSize(value); }
  override textAlign(value?: number): unknown { return super.textAlign(value); }
  private extra: JsonRecord = { selectedBackColor: 'rgb(227,119,0)', selectedForeColor: 'white', padding: '5', selectionMode: 0 };
  selectedBackColor(value?: string): unknown { return this.prop('__selectedBackColor', value) ?? this.extra.selectedBackColor; }
  selectedForeColor(value?: string): unknown { return this.prop('__selectedForeColor', value) ?? this.extra.selectedForeColor; }
  padding(value?: string): unknown { return this.prop('padding', value) ?? this.extra.padding; }
  selectionMode(value?: number): unknown { return this.prop('selectionMode', value); }
  override toJSON(): JsonRecord {
    const result: JsonRecord = { typeName: this.typeName };
    if ((this.props.items as unknown[]).length) result.items = clone(this.props.items);
    result.itemSpacing = clone(this.props.itemSpacing);
    result.boxSize = this.props.boxSize ?? 0;
    if (this.props.direction) result.direction = this.props.direction;
    if (this.props.maxColumnCount) result.maxColumnCount = this.props.maxColumnCount;
    if (this.props.maxRowCount) result.maxRowCount = this.props.maxRowCount;
    if (this.props.padding !== undefined) result.padding = this.props.padding;
    if (this.props.selectionMode) result.selectionMode = this.props.selectionMode;
    return result;
  }
  override paint(ctx: CanvasRenderingContext2D, value: unknown, x: number, y: number, w: number, h: number, style: Style): void {
    const selected = this.valueSet(value).map(String);
    const items = this.props.items as unknown[];
    ctx.save();
    ctx.font = String(style.font ?? DEFAULT_FONT);
    ctx.textBaseline = 'middle';
    const padding = Number(this.padding()) || 5;
    const spacing = Number((this.itemSpacing() as JsonRecord | undefined)?.horizontal ?? 5);
    let px = x + 1;
    items.forEach((item, index) => {
      const text = String((item as JsonRecord)?.text ?? item);
      const active = selected.includes(String(text)) || selected.includes(String(index));
      const width = ctx.measureText(text).width + padding * 2;
      if (active) {
        ctx.fillStyle = resolveColor(String(this.selectedBackColor()));
        ctx.fillRect(px, y + 2, width, h - 3);
        ctx.fillStyle = resolveColor(String(this.selectedForeColor()));
      } else ctx.fillStyle = resolveColor(String(style.foreColor ?? 'black'));
      ctx.textAlign = 'center';
      ctx.fillText(text, px + width / 2, y + h / 2 + 3);
      px += width + spacing;
    });
    ctx.restore();
  }
}
export class DataObject extends Text {
  private formatStringValue = '';
  constructor(format: string) {
    super();
    this.formatStringValue = format;
  }
  formatString(value?: string): string | this {
    if (value === undefined) return this.formatStringValue;
    this.formatStringValue = value;
    return this;
  }
}
export class Diagonal extends Text {
  override typeName = '10';
  divergeDirection(value?: number): unknown {
    if (value === undefined) return this.divergeDirectionValue ?? 0;
    this.divergeDirectionValue = value;
    return this;
  }
  divergeDirectionValue?: number;
  lineBorder(value?: unknown): unknown {
    if (value === undefined) return this.lineBorderValue;
    this.lineBorderValue = value;
    return this;
  }
  lineBorderValue?: unknown;
}
export class FileUpload extends Base {
  override typeName = '9';
}
export class RangeTemplate extends Base {
  constructor(private sheet?: Worksheet, private row = 0, private col = 0, private rowCount = 1, private colCount = 1) {
    super();
    this.typeName = '14';
  }
  override paint(ctx: CanvasRenderingContext2D, _value: unknown, x: number, y: number, _w: number, _h: number, style: Style): void {
    const sheet = this.sheet;
    if (!sheet) return;
    ctx.save();
    ctx.font = String(style.font ?? DEFAULT_FONT);
    ctx.fillStyle = resolveColor(String(style.foreColor ?? 'black'));
    ctx.textBaseline = 'middle';
    ctx.fillText(String(sheet.getValue(this.row, this.col) ?? ''), x + 2, y + 2);
    ctx.restore();
  }
}

const REGISTRY: Record<string, () => Base> = {
  '1': () => new Text(),
  '2': () => new ColumnHeader(),
  '3': () => new RowHeader(),
  '4': () => new Corner(),
  '5': () => new CheckBox(),
  '6': () => new Button(),
  '7': () => new ComboBox(),
  '8': () => new HyperLink(),
  '9': () => new FileUpload(),
  '10': () => new Diagonal(),
  '11': () => new RadioButtonList(),
  '12': () => new CheckBoxList(),
  '13': () => new ButtonList(),
  '14': () => new RangeTemplate(),
};
export function cellTypeFromJSON(value: unknown): Base | null {
  if (!value) return null;
  if (value instanceof Base) return value;
  if (typeof value !== 'object') return null;
  const json = value as JsonRecord;
  const typeName = String(json.typeName ?? '1');
  const factory = REGISTRY[typeName] ?? (() => new Text());
  const instance = factory();
  if (instance instanceof Text && json.allowOverflow === false) instance.allowOverflow = false;
  instance.fromJSON(value);
  return instance;
}
export function defaultCellType(): Text {
  return new Text();
}
export function isDefaultCellType(value: unknown): boolean {
  return !value || (value as Base).typeName === '1';
}
