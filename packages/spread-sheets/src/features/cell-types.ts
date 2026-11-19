import { canvasColor as resolveColor } from '../colors.js';
/**
 * Cell types. The Base class is extensible exactly like the documented custom
 * cell type tutorial: paint/paintContent draw, getHitInfo/process* handle
 * pointer input and createEditorElement/getEditorValue/setEditorValue bridge
 * the HTML editor.
 */
import { Style, clone } from '../primitives.js';
import { GC } from '../generated/enums.js';
import { instanceProperties } from '../not-implemented.js';
import { cachedImage } from './image-cache.js';
import { GeneralFormatter, serialToDate } from '../formatter.js';
import type { Worksheet } from '../worksheet.js';
import { deserializeValue, type JsonRecord } from '../serialization.js';

const EditorType = GC.Spread.Sheets.CellTypes.EditorType;

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

/** Normal line box of a cell font (matches the renderer's `fontMetrics().height`, which measures
 * a `line-height:normal` span: 19px for the default 11pt Calibri = 14.6667px). */
function fontLineHeight(font: string): number {
  const size = Number((String(font).match(/([\d.]+)px/) ?? [0, 14.6667])[1]);
  return Math.round(size * 1.3);
}

/** Number text the trial accepts: currency sign, groups of three, decimals, exponent, one percent. */
const NUMERIC_TEXT = /^\$?[+-]?(\d{1,3}(,\d{3})*|\d*)(\.\d+)?([eE][+-]?\d+)?%?$/;

/** Reads the trial's number text: group separators, a trailing percent, exponent and sign. */
function parseNumberText(text: string): number | undefined {
  if (!/\d/.test(text) || !NUMERIC_TEXT.test(text)) return undefined;
  const percent = text.endsWith('%');
  const core = (percent ? text.slice(0, -1) : text).replace(/[,$]/g, '');
  const value = Number(core);
  return Number.isFinite(value) ? (percent ? value / 100 : value) : undefined;
}

/** True when a format string is a date/time pattern (ignoring quoted and bracket sections). */
function isDateFormat(format: string): boolean {
  const stripped = format.replace(/"[^"]*"/g, '').replace(/\[[^\]]*\]/g, '').replace(/\\./g, '');
  return /[ymdhs]/i.test(stripped);
}

/** Date text the trial accepts: `yyyy-m-d`, `m/d/yyyy`, an ISO date-time, or a bare time. */
function parseDateText(text: string): Date | undefined {
  const iso = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (iso) return makeDate(+iso[1], +iso[2], +iso[3], +iso[4] || 0, +iso[5] || 0, +iso[6] || 0);
  const slash = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?: (\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (slash) return makeDate(+slash[3], +slash[1], +slash[2], +slash[4] || 0, +slash[5] || 0, +slash[6] || 0);
  const time = text.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  // Trial value (probe f40ct3-parse2): a bare time lands on the 1899-12-30 Excel epoch.
  if (time) {
    const hour = +time[1], minute = +time[2], second = +time[3] || 0;
    if (hour <= 23 && minute <= 59 && second <= 59) return new Date(1899, 11, 30, hour, minute, second);
  }
  return undefined;
}

/** Builds a local date, rejecting the ones the trial leaves as text (`13/13/2024`). */
function makeDate(year: number, month: number, day: number, hour: number, minute: number, second: number): Date | undefined {
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59) return undefined;
  const date = new Date(year, month - 1, day, hour, minute, second);
  if (date.getMonth() !== month - 1 || date.getDate() !== day) return undefined;
  return date;
}

/** Trial default artwork of the toggle switch mode (probe f40ct-checkboxlist). */
const TOGGLE_DEFAULTS: JsonRecord = {
  width: 30, height: 15, trackColorOn: '#4CAF50', trackColorOff: '#bfbfbf',
  sliderColorOn: '#ffffff', sliderColorOff: '#ffffff', sliderMargin: 2, animationDuration: 100, autoSize: false,
};
/** Modes the trial accepts for the check-box cell types; anything else is ignored. */
const CHECK_BOX_MODES = ['checkbox', 'toggle', 'modern'];

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
  /**
   * `parse(text, formatStr, context)` — reads edited cell text back with the cell's format, the way
   * the trial answers it (probe f40ct2-parse / f40ct3-parse2): numeric text becomes a number
   * (`'1,234'` 1234, `'12%'` 0.12), `true`/`TRUE` a boolean, date-shaped text a local `Date`, an
   * empty string `null`, a `@` format keeps the text verbatim, a date format turns a number into the
   * Excel serial date, and a numeric format answers `null` for text it cannot read.
   */
  parse(text: string, formatStr?: string, _context?: unknown): unknown {
    const raw = text === null || text === undefined ? '' : String(text);
    const trimmed = raw.trim();
    if (!trimmed) return null;
    const format = formatStr === null || formatStr === undefined ? '' : String(formatStr);
    if (format === '@') return raw;
    const numeric = parseNumberText(trimmed);
    if (isDateFormat(format)) {
      // A date format reads a number as an Excel serial date and leaves text it cannot read.
      if (numeric !== undefined) return serialToDate(numeric);
      return parseDateText(trimmed) ?? raw;
    }
    if (numeric !== undefined) return numeric;
    if (/^(true|false)$/i.test(trimmed)) return trimmed.toLowerCase() === 'true';
    if (format && format !== 'General') return null;
    const date = parseDateText(trimmed);
    if (date) return date;
    return raw;
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
    // Trial key order (probe f40ct6-registry): `allowOverflow` comes before the type id.
    return { allowOverflow: this.allowOverflow, typeName: this.typeName, editorType: this.editorType };
  }
}
export class ColumnHeader extends Base {
  override typeName = '2';
  allowOverflow = false;
  override toJSON(): JsonRecord { return { allowOverflow: this.allowOverflow, typeName: this.typeName }; }
}
export class RowHeader extends Base {
  override typeName = '3';
  allowOverflow = false;
  override toJSON(): JsonRecord { return { allowOverflow: this.allowOverflow, typeName: this.typeName }; }
}
export class Corner extends Base {
  override typeName = '4';
  allowOverflow = false;
  override toJSON(): JsonRecord { return { allowOverflow: this.allowOverflow, typeName: this.typeName }; }
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
/**
 * Toggle-switch artwork of the check-box cell types (own canvas code): a rounded track filled
 * with `trackColorOn`/`trackColorOff` and a knob in `sliderColorOn`/`sliderColorOff`, drawn from
 * the `toggleOptions` values the trial answers.
 */
function drawToggle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  options: JsonRecord,
  on: boolean,
): { width: number; height: number } {
  const width = Number(options.width ?? TOGGLE_DEFAULTS.width) || 30;
  const height = Number(options.height ?? TOGGLE_DEFAULTS.height) || 15;
  const margin = Number(options.sliderMargin ?? TOGGLE_DEFAULTS.sliderMargin);
  const radius = Math.max(0, Math.min(Number(options.trackRadius ?? height / 2), height / 2));
  const knob = Math.max(1, Number(options.sliderRadius ?? (height - margin * 2) / 2));
  const track = on ? String(options.trackColorOn ?? TOGGLE_DEFAULTS.trackColorOn) : String(options.trackColorOff ?? TOGGLE_DEFAULTS.trackColorOff);
  const knobColor = on ? String(options.sliderColorOn ?? TOGGLE_DEFAULTS.sliderColorOn) : String(options.sliderColorOff ?? TOGGLE_DEFAULTS.sliderColorOff);
  ctx.save();
  ctx.fillStyle = track;
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.arc(x + width - radius, y + radius, radius, -Math.PI / 2, Math.PI / 2);
  ctx.lineTo(x + radius, y + height);
  ctx.arc(x + radius, y + radius, radius, Math.PI / 2, -Math.PI / 2);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = knobColor;
  ctx.beginPath();
  ctx.arc(on ? x + width - margin - knob : x + margin + knob, y + height / 2, knob, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  return { width, height };
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

function drawModernCheckBox(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  state: boolean | null,
  backColor: string,
  markColor: string,
): void {
  ctx.save();
  ctx.beginPath();
  const r = Math.min(2, size / 4);
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + size, y, x + size, y + size, r);
  ctx.arcTo(x + size, y + size, x, y + size, r);
  ctx.arcTo(x, y + size, x, y, r);
  ctx.arcTo(x, y, x + size, y, r);
  ctx.closePath();
  ctx.fillStyle = backColor;
  ctx.fill();
  if (state !== false) {
    ctx.strokeStyle = markColor;
    ctx.lineWidth = 1.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    if (state === null) {
      ctx.moveTo(x + size * 0.25, y + size / 2);
      ctx.lineTo(x + size * 0.75, y + size / 2);
    } else {
      ctx.moveTo(x + size * 0.2, y + size * 0.52);
      ctx.lineTo(x + size * 0.42, y + size * 0.75);
      ctx.lineTo(x + size * 0.8, y + size * 0.28);
    }
    ctx.stroke();
  }
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
  mode(value?: string): unknown {
    if (value === undefined) return this.props.mode;
    if (!CHECK_BOX_MODES.includes(String(value))) return this;
    this.props.mode = String(value);
    return this;
  }
  textAlign(value?: number): unknown { return this.prop('textAlign', value); }
  textEditable(value?: boolean): unknown { return this.prop('textEditable', value); }
  textFalse(value?: string): unknown { return this.prop('textFalse', value); }
  textIndeterminate(value?: string): unknown { return this.prop('textIndeterminate', value); }
  textTrue(value?: string): unknown { return this.prop('textTrue', value); }
  /** Toggle-switch artwork; a partial object is merged over the trial defaults. */
  toggleOptions(value?: JsonRecord): unknown {
    if (value === undefined) return { ...(TOGGLE_DEFAULTS as object), ...((this.props.toggleOptions as object) ?? {}) };
    // Trial behaviour (probe f40ct-checkboxlist): a null artwork is rejected.
    if (value === null) throw new TypeError("Cannot read properties of null (reading 'width')");
    this.props.toggleOptions = { ...((this.props.toggleOptions as object) ?? {}), ...(value as object) };
    return this;
  }
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
    const state = value === true ? true : value === false ? false : this.props.isThreeState ? null : false;
    if (String(this.props.mode) === 'modern') {
      // Modern box (measured from the reference field list): a black rounded 12x12
      // square with a white check at (x + 11, y + 5) in the 28 px checkbox column.
      const size = Number(this.props.boxSize) || 12;
      const left = x + Math.round((w - size) / 2) + 3, top = y + 5;
      drawModernCheckBox(ctx, left, top, size, state, '#000000', '#ffffff');
      return;
    }
    // Trial box geometry (task 56 `.probe/t56` scans of `boxSize` 12 and 18 in a 30px row): the
    // painted square is `boxSize + 1` pixels (a 12 box spans 107..119, an 18 box 109..127) and it
    // keeps the default 5px inset until the box grows past the default 13px square, after which it
    // moves out by floor((boxSize - 13) / 2).
    const boxSize = Number(this.props.boxSize) || 12;
    const size = boxSize + 1;
    const inset = 5 + Math.max(0, Math.floor((boxSize - 13) / 2));
    const left = x + inset;
    const top = y + inset;
    let boxWidth = size, boxHeight = size;
    if (String(this.props.mode) === 'toggle') {
      const box = drawToggle(ctx, left, top, (this.props.toggleOptions as JsonRecord) ?? {}, state === true);
      boxWidth = box.width;
      boxHeight = box.height;
    } else {
      drawCheckBox(ctx, left, top, size, state, '#ffffff', String(style.foreColor ?? '#000000'));
    }
    const caption = this.props.caption ? String(this.props.caption) : '';
    const stateText = state === true ? String(this.props.textTrue ?? '') : state === false ? String(this.props.textFalse ?? '') : String(this.props.textIndeterminate ?? '');
    // Unlike a plain cell, a checkbox never prints its raw boolean value as text.
    const hasStateText = Boolean(caption) || String(this.props.textTrue ?? '') !== ''
      || String(this.props.textFalse ?? '') !== '' || String(this.props.textIndeterminate ?? '') !== '';
    const text = hasStateText ? [caption, stateText].filter(Boolean).join(' ') : '';
    if (text) {
      ctx.save();
      // The cell type paints inside the cell: the trial clips a caption that runs past the row
      // line (measured task 56: the ink of `Unchecked` under a 12px box stops at row 98 of the
      // cell 70..100).
      ctx.beginPath();
      ctx.rect(x, y, Math.max(0, w - 1), Math.max(0, h - 1));
      ctx.clip();
      ctx.font = String(style.font ?? DEFAULT_FONT);
      ctx.fillStyle = resolveColor(String(style.foreColor ?? 'black'));
      const line = fontLineHeight(String(style.font ?? DEFAULT_FONT));
      // `textAlign` puts the caption beside (left/right/inside) or around (top/bottom) the square.
      // The trial hangs the caption 2px of leading below the square plus half the line box
      // (measured: the ink of a caption under a box at 75..87 starts at row 93).
      const align = Number(this.props.textAlign ?? 2);
      if (align === 0) { ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; ctx.fillText(text, left, top - 2 - line / 2); }
      else if (align === 1) { ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; ctx.fillText(text, left, top + boxHeight + 2 + line / 2); }
      else if (align === 3) { ctx.textBaseline = 'middle'; ctx.textAlign = 'right'; ctx.fillText(text, left - 3, top + boxHeight / 2 + 1); }
      else if (align === 4) { ctx.textBaseline = 'middle'; ctx.textAlign = 'center'; ctx.fillText(text, left + boxWidth / 2, top + boxHeight / 2 + 1); }
      else { ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; ctx.fillText(text, left + boxWidth + 2, top + boxHeight / 2 + 1); }
      ctx.restore();
    }
    void context;
  }
}

export class Button extends Base {
  override typeName = '6';
  // Trial default margins (task 56 `.probe/t56` scans): a default button in a 130x26 cell at
  // (40,98) paints its 1px frame from x=41..167 and y=99..121, i.e. `margin - 1` inside each edge.
  private props: JsonRecord = { marginTop: 2, marginRight: 2, marginBottom: 2, marginLeft: 2, text: '', buttonBackColor: undefined };
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
    for (const key of ['marginTop', 'marginRight', 'marginBottom', 'marginLeft', 'text', 'buttonBackColor']) {
      const value = this.props[key];
      if (value === undefined || value === '') continue;
      // Trial values (probe f40ct6-registry): an untouched default margin is not serialised.
      if (key.startsWith('margin') && value === 2) continue;
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
  ): void {
    const left = x + Number(this.props.marginLeft ?? 2) - 1, top = y + Number(this.props.marginTop ?? 2) - 1;
    const right = x + w - Number(this.props.marginRight ?? 2), bottom = y + h - Number(this.props.marginBottom ?? 2);
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
    if (this.props.editable !== undefined && this.props.editable !== true) result.editable = this.props.editable;
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
    ctx.fillText(text, x + 1, y + h / 2 - 4);
    ctx.restore();
    ctx.save();
    ctx.fillStyle = '#000000';
    // Trial arrow (task 56): 6 x 5 px, top edge at the row centre - 2, tip pointing down.
    const cy = y + h / 2 - 2;
    const start = x + w - 14;
    ctx.beginPath();
    ctx.moveTo(start, cy - 2);
    ctx.lineTo(start + 6, cy - 2);
    ctx.lineTo(start + 3, cy + 2.5);
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
    const linkDefaults: JsonRecord = { linkColor: '#0066cc', visitedLinkColor: '#3399ff' };
    for (const key of ['text', 'linkColor', 'visitedLinkColor', 'linkToolTip', 'activeOnClick', 'onClickAction'])
      if (this.props[key] !== undefined && this.props[key] !== '' && this.props[key] !== linkDefaults[key] && !(key === 'activeOnClick' && this.props[key] === true))
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

  constructor() {
    super();
    this.props.mode = 'checkbox';
  }

  /** Switch mode of the check boxes; the trial ignores a mode it does not know. */
  mode(value?: string): unknown {
    if (value === undefined) return this.props.mode;
    if (!CHECK_BOX_MODES.includes(String(value))) return this;
    this.props.mode = String(value);
    return this;
  }
  /** Toggle-switch artwork; a partial object is merged over the trial defaults. */
  toggleOptions(value?: JsonRecord): unknown {
    if (value === undefined) return { ...(TOGGLE_DEFAULTS as object), ...((this.props.toggleOptions as object) ?? {}) };
    // Trial behaviour (probe f40ct-checkboxlist): a null artwork is rejected.
    if (value === null) throw new TypeError("Cannot read properties of null (reading 'width')");
    this.props.toggleOptions = { ...((this.props.toggleOptions as object) ?? {}), ...(value as object) };
    return this;
  }

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
    if (this.props.mode !== 'checkbox') result.mode = this.props.mode;
    if (this.props.toggleOptions) result.toggleOptions = clone(this.toggleOptions() as JsonRecord);
    if (this.props.boxSize) result.boxSize = this.props.boxSize;
    if (this.props.direction) result.direction = this.props.direction;
    if (this.props.isFlowLayout === false) result.isFlowLayout = false;
    if (this.props.maxColumnCount) result.maxColumnCount = this.props.maxColumnCount;
    if (this.props.maxRowCount) result.maxRowCount = this.props.maxRowCount;
    if (this.props.textAlign !== 2) result.textAlign = this.props.textAlign;
    const spacing = this.props.itemSpacing as { horizontal?: number; vertical?: number };
    if (spacing && (spacing.horizontal !== 5 || spacing.vertical !== 5)) result.itemSpacing = clone(spacing);
    return result;
  }
  override fromJSON(settings: unknown): void {
    super.fromJSON(settings);
    const json = deserializeValue(settings) as JsonRecord;
    if (json.mode !== undefined) this.props.mode = json.mode;
    if (json.toggleOptions !== undefined) this.props.toggleOptions = json.toggleOptions;
  }
  override paint(ctx: CanvasRenderingContext2D, value: unknown, x: number, y: number, w: number, h: number, style: Style): void {
    const selected = this.valueSet(value).map(String);
    const items = this.props.items as unknown[];
    const size = Number(this.props.boxSize) || 13;
    const toggleMode = String(this.props.mode) === 'toggle';
    const artwork = (this.props.toggleOptions as JsonRecord) ?? {};
    const boxWidth = toggleMode ? Number(artwork.width ?? TOGGLE_DEFAULTS.width) || 30 : size;
    const boxHeight = toggleMode ? Number(artwork.height ?? TOGGLE_DEFAULTS.height) || 15 : size;
    ctx.save();
    ctx.font = String(style.font ?? DEFAULT_FONT);
    ctx.fillStyle = resolveColor(String(style.foreColor ?? 'black'));
    ctx.textBaseline = 'middle';
    let px = x + 1;
    let line = y + 3;
    items.forEach((item, index) => {
      const text = String((item as JsonRecord)?.text ?? item);
      const checked = selected.includes(String(text)) || selected.includes(String(index));
      const advance = boxWidth + 6 + ctx.measureText(text).width + 18;
      // The trial flows the items to the next line inside the cell and clips what falls out.
      if (px + advance > x + w && px > x + 1) {
        px = x + 1;
        line += Math.max(size, boxHeight) + 6;
      }
      if (line > y + h) return;
      if (toggleMode) drawToggle(ctx, px, line + (size - boxHeight) / 2, artwork, checked);
      else drawCheckBox(ctx, px, line, size, checked, '#ffffff', String(style.foreColor ?? '#000000'));
      ctx.fillStyle = resolveColor(String(style.foreColor ?? 'black'));
      ctx.fillText(text, px + boxWidth + 4, line + size / 2 + 2);
      px += advance;
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
    const spacing = this.props.itemSpacing as { horizontal?: number; vertical?: number };
    if (spacing && (spacing.horizontal !== 5 || spacing.vertical !== 5)) result.itemSpacing = clone(spacing);
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
  // Trial type ids (probe f40ct6-registry): DataObject 18, RangeTemplate 16, Diagonal 20.
  override typeName = '18';
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
  override typeName = '20';
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
/**
 * File-upload cell type (`CellTypes.FileUpload`). The defaults are the trial's answers
 * (probe f40ct-fileupload): a 2 px margin on every side, a 2048 byte limit, every capability
 * enabled and the `dataUrl` value path.
 */
export class FileUpload extends Base {
  override typeName = '19';
  /**
   * `previewCommand` is a declared data property: the accessor lives on the prototype (an
   * unassigned read answers `undefined`, the trial's answer) and a write stores an own field.
   */
  declare previewCommand?: string | ((file: unknown) => void);
  private props: JsonRecord = {
    accept: '',
    isClearEnabled: true,
    isDownloadEnabled: true,
    isPreviewEnabled: true,
    marginTop: 2,
    marginRight: 2,
    marginBottom: 2,
    marginLeft: 2,
    maxSize: 2048,
    valuePath: 'dataUrl',
  };
  private prop(key: string, value?: unknown): unknown {
    if (value === undefined) return this.props[key];
    this.props[key] = typeof value === 'number' ? Number(value) : value;
    return this;
  }
  accept(value?: string): unknown { return this.prop('accept', value); }
  isClearEnabled(value?: boolean): unknown { return this.prop('isClearEnabled', value); }
  isDownloadEnabled(value?: boolean): unknown { return this.prop('isDownloadEnabled', value); }
  isPreviewEnabled(value?: boolean): unknown { return this.prop('isPreviewEnabled', value); }
  marginBottom(value?: number): unknown { return this.prop('marginBottom', value); }
  marginLeft(value?: number): unknown { return this.prop('marginLeft', value); }
  marginRight(value?: number): unknown { return this.prop('marginRight', value); }
  marginTop(value?: number): unknown { return this.prop('marginTop', value); }
  maxSize(value?: number): unknown { return this.prop('maxSize', value); }
  /** Value path of the file info; an explicit `valuePath(undefined)` clears it to `null`. */
  valuePath(value?: string): unknown {
    if (arguments.length === 0) return this.props.valuePath;
    this.props.valuePath = value === undefined ? null : String(value);
    return this;
  }
  override fromJSON(settings: unknown): void {
    const json = deserializeValue(settings) as JsonRecord;
    for (const key of Object.keys(this.props)) if (json[key] !== undefined) this.props[key] = json[key];
    if (json.valuePath === null) this.props.valuePath = null;
    if (json.previewCommand !== undefined) this.previewCommand = json.previewCommand as string | ((file: unknown) => void);
  }
  override toJSON(): JsonRecord {
    const result: JsonRecord = { typeName: this.typeName };
    for (const key of ['marginTop', 'marginRight', 'marginBottom', 'marginLeft', 'maxSize', 'accept', 'isPreviewEnabled', 'isDownloadEnabled', 'isClearEnabled'])
      if (this.props[key] !== undefined && this.props[key] !== ({ ...FileUpload.defaults })[key]) result[key] = this.props[key];
    if (this.props.valuePath !== 'dataUrl') result.valuePath = this.props.valuePath ?? null;
    if (this.previewCommand !== undefined) result.previewCommand = this.previewCommand;
    return result;
  }
  /** Serialisation baseline: the trial only writes what differs from these values. */
  static readonly defaults = { accept: '', isClearEnabled: true, isDownloadEnabled: true, isPreviewEnabled: true, marginBottom: 2, marginLeft: 2, marginRight: 2, marginTop: 2, maxSize: 2048, valuePath: 'dataUrl' } as JsonRecord;
}
// The contract declares `previewCommand` as a data property; the accessor keeps it discoverable
// on the prototype until a value is assigned.
instanceProperties(FileUpload, 'previewCommand');
export class RangeTemplate extends Base {
  constructor(private sheet?: Worksheet, private row = 0, private col = 0, private rowCount = 1, private colCount = 1) {
    super();
    this.typeName = '16';
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

/** In-cell picture: `CellTypes.Picture` (used by the designer's "Place in Cells"). */
export class Picture extends Base {
  override typeName = '15';
  private props: JsonRecord = {
    src: '', altText: '', errorText: '', stretch: 0, alignLeft: 0, alignTop: 0, alignRight: 0, alignBottom: 0,
    keepAspect: true, showInPrint: true,
  };
  private prop(key: string, value?: unknown): unknown {
    if (value === undefined) return this.props[key];
    this.props[key] = value;
    return this;
  }
  src(value?: string): unknown { return this.prop('src', value); }
  altText(value?: string): unknown { return this.prop('altText', value); }
  errorText(value?: string): unknown { return this.prop('errorText', value); }
  stretch(value?: number): unknown { return this.prop('stretch', value); }
  keepAspect(value?: boolean): unknown { return this.prop('keepAspect', value); }
  override paint(ctx: CanvasRenderingContext2D, _value: unknown, x: number, y: number, w: number, h: number): void {
    const src = String(this.props.src ?? '');
    if (!src) return;
    const image = cachedImage(src, () => undefined);
    if (!image || !image.complete || !image.naturalWidth) return;
    const keep = this.props.keepAspect !== false;
    const stretch = Number(this.props.stretch ?? 0);
    let width = w, height = h;
    if (keep) {
      const scale = stretch === 3 ? 1 : Math.min(w / image.naturalWidth, h / image.naturalHeight);
      width = image.naturalWidth * scale;
      height = image.naturalHeight * scale;
    }
    ctx.save();
    ctx.beginPath(); ctx.rect(x - 1, y - 1, w + 2, h + 2); ctx.clip();
    ctx.drawImage(image, x + (w - width) / 2, y + (h - height) / 2, width, height);
    ctx.restore();
  }
  override toJSON(): JsonRecord {
    const result: JsonRecord = { typeName: this.typeName };
    for (const [key, value] of Object.entries(this.props)) if (value !== undefined && value !== '') result[key] = value;
    return result;
  }
  override fromJSON(json: unknown): void {
    const data = json as JsonRecord;
    for (const key of Object.keys(this.props)) if (data[key] !== undefined) this.props[key] = data[key];
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
  '16': () => new RangeTemplate(),
  '18': () => new DataObject(''),
  '11': () => new RadioButtonList(),
  '12': () => new CheckBoxList(),
  '13': () => new ButtonList(),
  '15': () => new Picture(),
  '19': () => new FileUpload(),
  '20': () => new Diagonal(),
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
