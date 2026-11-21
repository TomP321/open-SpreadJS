/**
 * Pivot table themes and styles (TASK 41 item 3).
 * The 85 built-in themes carry the definitions exposed by the reference
 * `PivotTableThemes` (names and style slots observed through the public
 * `toJSON()`); colours stay theme tokens ("Accent 1 80") and resolve against
 * the workbook palette when written to cells.
 */
import type { Style, LineBorder } from '../primitives.js';
import { instanceProperties } from '../not-implemented.js';
import { asRecord } from '../object-access.js';

/** Splits a CSS font shorthand into the parts the style object exposes. */
function parseFont(value: string): { style?: string; weight?: string; size?: string; family?: string } {
  const out: { style?: string; weight?: string; size?: string; family?: string } = {};
  const tokens = String(value ?? '').trim().split(/\s+/).filter(Boolean);
  let index = 0;
  while (index < tokens.length) {
    const token = tokens[index]!.toLowerCase();
    if (token === 'italic' || token === 'oblique') out.style = tokens[index];
    else if (token === 'bold' || token === 'bolder' || token === 'lighter') out.weight = tokens[index];
    else if (/^[0-9.]+(px|pt|em|%)$/.test(token) || /^x-?(small|large|xx-large)$/.test(token)) { out.size = tokens[index]; index++; break; }
    else break;
    index++;
  }
  const rest = tokens.slice(index).join(' ');
  if (rest) out.family = rest;
  return out;
}

/** Raw per-slot data (also the toJSON shape). */
export interface PivotStyleJSON {
  backColor?: string; foreColor?: string; font?: string; fontFamily?: string;
  fontSize?: string; fontStyle?: string; fontWeight?: string;
  borderLeft?: { color?: string; style?: number }; borderTop?: { color?: string; style?: number };
  borderRight?: { color?: string; style?: number }; borderBottom?: { color?: string; style?: number };
  borderHorizontal?: { color?: string; style?: number }; borderVertical?: { color?: string; style?: number };
}

export interface PivotThemeJSON { name?: string; [slot: string]: unknown }

const SLOT_NAMES = [
  'blankRowStyle', 'columnSubheading1Style', 'columnSubheading2Style', 'columnSubheading3Style',
  'firstColumnStripeStyle', 'firstColumnStyle', 'firstHeaderCellStyle', 'firstRowStripeStyle',
  'grandTotalColumnStyle', 'grandTotalRowStyle', 'headerRowStyle', 'reportFilterLabelsStyle',
  'reportFilterValuesStyle', 'rowSubheading1Style', 'rowSubheading2Style', 'rowSubheading3Style',
  'secondColumnStripeStyle', 'secondRowStripeStyle', 'subtotalColumn1Style', 'subtotalColumn2Style',
  'subtotalColumn3Style', 'subtotalRow1Style', 'subtotalRow2Style', 'subtotalRow3Style',
  'wholeTableStyle',
] as const;
const SIZE_NAMES = ['firstColumnStripSize', 'firstRowStripSize', 'secondColumnStripSize', 'secondRowStripSize'] as const;
type SlotName = typeof SLOT_NAMES[number];
type SizeName = typeof SIZE_NAMES[number];

/**
 * A pivot style: the plain style bag the trial uses for theme slots and for
 * `getStyle`/`setStyle` results. Constructor parameters and writable data
 * properties follow the public contract.
 */
export class PivotTableStyle {
  // The trial exposes these nine as plain data members (TASK 46 coverage probe); they are
  // installed as accessor pairs after the class so unassigned reads stay undefined and an
  // assignment creates an own enumerable data property. `declare` keeps them out of the
  // runtime class fields.
  declare backColor?: string;
  declare foreColor?: string;
  declare borderLeft?: LineBorder;
  declare borderTop?: LineBorder;
  declare borderRight?: LineBorder;
  declare borderBottom?: LineBorder;
  declare borderHorizontal?: LineBorder;
  declare borderVertical?: LineBorder;
  declare textDecoration?: number;
  // The font parts are stored separately and composed into the CSS shorthand,
  // exactly like the reference style object (`font` parses, parts compose).
  private parts: { style?: string; weight?: string; size?: string; family?: string } = {};

  constructor(
    backColor?: string, foreColor?: string, font?: string,
    borderLeft?: LineBorder, borderTop?: LineBorder, borderRight?: LineBorder, borderBottom?: LineBorder,
    borderHorizontal?: LineBorder, borderVertical?: LineBorder,
    textDecoration?: number, fontStyle?: string, fontWeight?: string, fontSize?: string, fontFamily?: string,
  ) {
    if (backColor !== undefined) this.backColor = backColor;
    if (foreColor !== undefined) this.foreColor = foreColor;
    if (font !== undefined) this.font = font;
    if (borderLeft !== undefined) this.borderLeft = borderLeft;
    if (borderTop !== undefined) this.borderTop = borderTop;
    if (borderRight !== undefined) this.borderRight = borderRight;
    if (borderBottom !== undefined) this.borderBottom = borderBottom;
    if (borderHorizontal !== undefined) this.borderHorizontal = borderHorizontal;
    if (borderVertical !== undefined) this.borderVertical = borderVertical;
    if (textDecoration !== undefined) this.textDecoration = textDecoration;
    if (fontStyle !== undefined) this.fontStyle = fontStyle;
    if (fontWeight !== undefined) this.fontWeight = fontWeight;
    if (fontSize !== undefined) this.fontSize = fontSize;
    if (fontFamily !== undefined) this.fontFamily = fontFamily;
  }

  get font(): string | undefined {
    const { style, weight, size, family } = this.parts;
    if (style === undefined && weight === undefined && size === undefined && family === undefined) return undefined;
    return [style, weight, size, family].filter(part => part !== undefined && part !== '').join(' ');
  }
  set font(value: string | undefined) {
    this.parts = value === undefined ? {} : parseFont(value);
  }
  get fontStyle(): string | undefined { return this.parts.style; }
  set fontStyle(value: string | undefined) { this.parts.style = value; }
  get fontWeight(): string | undefined { return this.parts.weight; }
  set fontWeight(value: string | undefined) { this.parts.weight = value; }
  get fontSize(): string | undefined { return this.parts.size; }
  set fontSize(value: string | undefined) { this.parts.size = value; }
  get fontFamily(): string | undefined { return this.parts.family; }
  set fontFamily(value: string | undefined) { this.parts.family = value; }

  /** Public serialisation, in the reference order (font parts then shorthand). */
  toJSON(): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const key of ['backColor', 'foreColor', 'borderLeft', 'borderTop', 'borderRight', 'borderBottom',
      'borderHorizontal', 'borderVertical', 'textDecoration', 'fontStyle', 'fontWeight', 'fontSize', 'fontFamily'] as const) {
      const value = (asRecord(this))[key];
      if (value !== undefined) out[key] = value;
    }
    if (this.font !== undefined) out.font = this.font;
    return out;
  }

  fromJSON(data: Record<string, unknown> | undefined): void {
    if (!data || typeof data !== 'object') return;
    for (const [key, value] of Object.entries(data)) {
      if (key === 'font') this.font = value as string;
      else if (key === 'fontStyle') this.fontStyle = value as string;
      else if (key === 'fontWeight') this.fontWeight = value as string;
      else if (key === 'fontSize') this.fontSize = value as string;
      else if (key === 'fontFamily') this.fontFamily = value as string;
      else if (key === 'backColor' || key === 'foreColor' || key === 'textDecoration')
        (asRecord(this))[key] = value;
      else if (key.startsWith('border')) (asRecord(this))[key] = value;
    }
  }

  /** Plain object copy (theme slot serialisation order). */
  _toJSON(): PivotStyleJSON {
    const out: Record<string, unknown> = {};
    for (const key of ['backColor', 'foreColor', 'borderHorizontal', 'borderVertical', 'borderLeft', 'borderTop', 'borderRight', 'borderBottom', 'fontFamily', 'fontSize', 'fontStyle', 'fontWeight', 'textDecoration'] as const) {
      const value = (asRecord(this))[key];
      if (value !== undefined) out[key] = value;
    }
    if (this.font !== undefined) out.font = this.font;
    return out as PivotStyleJSON;
  }

  static _fromJSON(json: PivotStyleJSON | undefined): PivotTableStyle | undefined {
    if (!json) return undefined;
    const style = new PivotTableStyle();
    style.fromJSON(json as Record<string, unknown>);
    return style;
  }

  /** Convert to a worksheet style; theme tokens resolve against the palette. */
  _toSheetStyle(scheme?: { getColor(name: string): string }): Style {
    const style: Record<string, unknown> = {};
    const color = (value: unknown): unknown =>
      typeof value === 'string' ? resolveThemeColor(value, scheme) : value;
    for (const key of ['backColor', 'foreColor'])
      if ((asRecord(this))[key] !== undefined) style[key] = color((asRecord(this))[key]);
    for (const key of ['fontFamily', 'fontSize', 'fontStyle', 'fontWeight', 'font'])
      if ((asRecord(this))[key] !== undefined) style[key] = (asRecord(this))[key];
    for (const key of ['borderLeft', 'borderTop', 'borderRight', 'borderBottom'] as const) {
      // `borderHorizontal`/`borderVertical` describe the grid lines between
      // cells; the trial paints them once, so they expand to one side only.
      const bottomOrRight = key === 'borderBottom' || key === 'borderRight';
      const border = this[key] ?? (bottomOrRight ? (key === 'borderBottom' ? this.borderHorizontal : this.borderVertical) : undefined);
      if (border) style[key] = { ...border, color: color(border.color) };
    }
    if (this.textDecoration !== undefined) style.textDecoration = this.textDecoration;
    return style as Style;
  }
}
// Accessor pairs for the declared data members (same pattern as Style): reads of an
// unassigned member return undefined, assignment shadows the accessor with own data.
instanceProperties(PivotTableStyle, 'backColor', 'foreColor', 'borderLeft', 'borderTop', 'borderRight',
  'borderBottom', 'borderHorizontal', 'borderVertical', 'textDecoration');

/** `Accent 1 -25`, `Text 1`, ... — the theme colour references of pivot styles. */
const THEME_COLOR_TOKEN = /^(background\s+[12]|text\s+[12]|accent\s+[1-6]|followed\s+hyperlink|hyperlink)(?:\s+(-?\d+(?:\.\d+)?))?$/i;

/**
 * Resolves one pivot colour: literal colours pass through, theme tokens are
 * tinted/shaded the way the reference product does (HSL lightness scaling).
 */
export function resolveThemeColor(value: string, scheme?: { getColor(name: string): string }): string {
  const text = String(value ?? '').trim();
  if (!scheme) return text;
  const match = THEME_COLOR_TOKEN.exec(text);
  if (!match) {
    const rgb = /^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/i.exec(text);
    if (!rgb) return text;
    return `#${rgb.slice(1).map(part => Number(part).toString(16).padStart(2, '0')).join('')}`;
  }
  const tint = Number(match[2] ?? 0) / 100;
  const base = scheme.getColor(match[1]!);
  if (!tint) return base;
  const rgb = hexToRgb(base);
  if (!rgb) return base;
  const [h, s, l] = rgbToHsl(rgb);
  const light = tint > 0 ? l + (1 - l) * tint : l * (1 + tint);
  return hslToHex([h, s, light]);
}

function hexToRgb(hex: string): [number, number, number] | undefined {
  const match = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
  if (!match) return undefined;
  const value = Number.parseInt(match[1]!, 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function rgbToHsl([r, g, b]: [number, number, number]): [number, number, number] {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === rn ? ((gn - bn) / d + (gn < bn ? 6 : 0)) : max === gn ? (bn - rn) / d + 2 : (rn - gn) / d + 4;
  return [h / 6, s, l];
}

function hslToHex([h, s, l]: [number, number, number]): string {
  const channel = (offset: number): string => {
    const k = (offset + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    const value = l - a * Math.max(-1, Math.min(Math.min(k - 3, 9 - k), 1));
    return Math.round(Math.max(0, Math.min(255, value * 255))).toString(16).padStart(2, '0');
  };
  return `#${channel(0)}${channel(8)}${channel(4)}`.toLowerCase();
}

/**
 * A pivot theme: named container with the public slot accessors. Getter when
 * called without an argument, setter (chainable) with one.
 */
export class PivotTableTheme {
  private values = new Map<string, PivotTableStyle | number | string>();

  constructor() { /* plain container, like the trial */ }

  name(): string;
  name(value: string): this;
  name(value?: string): unknown {
    if (value === undefined) return String(this.values.get('name') ?? '');
    this.values.set('name', String(value));
    return this;
  }

  _slot(slot: SlotName, value?: PivotTableStyle): unknown {
    if (value === undefined) return this.values.get(slot);
    this.values.set(slot, value);
    return this;
  }

  _size(slot: SizeName, value?: number): unknown {
    if (value === undefined) return this.values.get(slot);
    this.values.set(slot, Number(value));
    return this;
  }

  toJSON(): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    const name = this.values.get('name');
    if (name !== undefined) out.name = name;
    for (const slot of SLOT_NAMES) {
      const style = this.values.get(slot);
      if (style instanceof PivotTableStyle) out[slot] = style._toJSON();
    }
    for (const slot of SIZE_NAMES) {
      const size = this.values.get(slot);
      if (size !== undefined) out[slot] = size;
    }
    return out;
  }

  fromJSON(data: Record<string, unknown>): void {
    this.values.clear();
    if (!data || typeof data !== 'object') return;
    for (const [key, value] of Object.entries(data)) {
      if (key === 'name') this.values.set('name', String(value));
      else if ((SLOT_NAMES as readonly string[]).includes(key) && value && typeof value === 'object') {
        const style = PivotTableStyle._fromJSON(value as PivotStyleJSON);
        if (style) this.values.set(key, style);
      }
      else if ((SIZE_NAMES as readonly string[]).includes(key) && typeof value === 'number') this.values.set(key, value);
    }
  }

  /** Slot lookup used by the layout writer. */
  _get(slot: string): unknown {
    return this.values.get(slot);
  }

  blankRowStyle(): PivotTableStyle | undefined;
  blankRowStyle(value: PivotTableStyle): this;
  blankRowStyle(value?: PivotTableStyle): unknown { return this._slot('blankRowStyle', value); }
  columnSubheading1Style(): PivotTableStyle | undefined;
  columnSubheading1Style(value: PivotTableStyle): this;
  columnSubheading1Style(value?: PivotTableStyle): unknown { return this._slot('columnSubheading1Style', value); }
  columnSubheading2Style(): PivotTableStyle | undefined;
  columnSubheading2Style(value: PivotTableStyle): this;
  columnSubheading2Style(value?: PivotTableStyle): unknown { return this._slot('columnSubheading2Style', value); }
  columnSubheading3Style(): PivotTableStyle | undefined;
  columnSubheading3Style(value: PivotTableStyle): this;
  columnSubheading3Style(value?: PivotTableStyle): unknown { return this._slot('columnSubheading3Style', value); }
  firstColumnStripeStyle(): PivotTableStyle | undefined;
  firstColumnStripeStyle(value: PivotTableStyle): this;
  firstColumnStripeStyle(value?: PivotTableStyle): unknown { return this._slot('firstColumnStripeStyle', value); }
  firstColumnStyle(): PivotTableStyle | undefined;
  firstColumnStyle(value: PivotTableStyle): this;
  firstColumnStyle(value?: PivotTableStyle): unknown { return this._slot('firstColumnStyle', value); }
  firstHeaderCellStyle(): PivotTableStyle | undefined;
  firstHeaderCellStyle(value: PivotTableStyle): this;
  firstHeaderCellStyle(value?: PivotTableStyle): unknown { return this._slot('firstHeaderCellStyle', value); }
  firstRowStripeStyle(): PivotTableStyle | undefined;
  firstRowStripeStyle(value: PivotTableStyle): this;
  firstRowStripeStyle(value?: PivotTableStyle): unknown { return this._slot('firstRowStripeStyle', value); }
  grandTotalColumnStyle(): PivotTableStyle | undefined;
  grandTotalColumnStyle(value: PivotTableStyle): this;
  grandTotalColumnStyle(value?: PivotTableStyle): unknown { return this._slot('grandTotalColumnStyle', value); }
  grandTotalRowStyle(): PivotTableStyle | undefined;
  grandTotalRowStyle(value: PivotTableStyle): this;
  grandTotalRowStyle(value?: PivotTableStyle): unknown { return this._slot('grandTotalRowStyle', value); }
  headerRowStyle(): PivotTableStyle | undefined;
  headerRowStyle(value: PivotTableStyle): this;
  headerRowStyle(value?: PivotTableStyle): unknown { return this._slot('headerRowStyle', value); }
  reportFilterLabelsStyle(): PivotTableStyle | undefined;
  reportFilterLabelsStyle(value: PivotTableStyle): this;
  reportFilterLabelsStyle(value?: PivotTableStyle): unknown { return this._slot('reportFilterLabelsStyle', value); }
  reportFilterValuesStyle(): PivotTableStyle | undefined;
  reportFilterValuesStyle(value: PivotTableStyle): this;
  reportFilterValuesStyle(value?: PivotTableStyle): unknown { return this._slot('reportFilterValuesStyle', value); }
  rowSubheading1Style(): PivotTableStyle | undefined;
  rowSubheading1Style(value: PivotTableStyle): this;
  rowSubheading1Style(value?: PivotTableStyle): unknown { return this._slot('rowSubheading1Style', value); }
  rowSubheading2Style(): PivotTableStyle | undefined;
  rowSubheading2Style(value: PivotTableStyle): this;
  rowSubheading2Style(value?: PivotTableStyle): unknown { return this._slot('rowSubheading2Style', value); }
  rowSubheading3Style(): PivotTableStyle | undefined;
  rowSubheading3Style(value: PivotTableStyle): this;
  rowSubheading3Style(value?: PivotTableStyle): unknown { return this._slot('rowSubheading3Style', value); }
  secondColumnStripeStyle(): PivotTableStyle | undefined;
  secondColumnStripeStyle(value: PivotTableStyle): this;
  secondColumnStripeStyle(value?: PivotTableStyle): unknown { return this._slot('secondColumnStripeStyle', value); }
  secondRowStripeStyle(): PivotTableStyle | undefined;
  secondRowStripeStyle(value: PivotTableStyle): this;
  secondRowStripeStyle(value?: PivotTableStyle): unknown { return this._slot('secondRowStripeStyle', value); }
  subtotalColumn1Style(): PivotTableStyle | undefined;
  subtotalColumn1Style(value: PivotTableStyle): this;
  subtotalColumn1Style(value?: PivotTableStyle): unknown { return this._slot('subtotalColumn1Style', value); }
  subtotalColumn2Style(): PivotTableStyle | undefined;
  subtotalColumn2Style(value: PivotTableStyle): this;
  subtotalColumn2Style(value?: PivotTableStyle): unknown { return this._slot('subtotalColumn2Style', value); }
  subtotalColumn3Style(): PivotTableStyle | undefined;
  subtotalColumn3Style(value: PivotTableStyle): this;
  subtotalColumn3Style(value?: PivotTableStyle): unknown { return this._slot('subtotalColumn3Style', value); }
  subtotalRow1Style(): PivotTableStyle | undefined;
  subtotalRow1Style(value: PivotTableStyle): this;
  subtotalRow1Style(value?: PivotTableStyle): unknown { return this._slot('subtotalRow1Style', value); }
  subtotalRow2Style(): PivotTableStyle | undefined;
  subtotalRow2Style(value: PivotTableStyle): this;
  subtotalRow2Style(value?: PivotTableStyle): unknown { return this._slot('subtotalRow2Style', value); }
  subtotalRow3Style(): PivotTableStyle | undefined;
  subtotalRow3Style(value: PivotTableStyle): this;
  subtotalRow3Style(value?: PivotTableStyle): unknown { return this._slot('subtotalRow3Style', value); }
  wholeTableStyle(): PivotTableStyle | undefined;
  wholeTableStyle(value: PivotTableStyle): this;
  wholeTableStyle(value?: PivotTableStyle): unknown { return this._slot('wholeTableStyle', value); }
  firstColumnStripSize(): number | undefined;
  firstColumnStripSize(value: number): this;
  firstColumnStripSize(value?: number): unknown { return this._size('firstColumnStripSize', value); }
  firstRowStripSize(): number | undefined;
  firstRowStripSize(value: number): this;
  firstRowStripSize(value?: number): unknown { return this._size('firstRowStripSize', value); }
  secondColumnStripSize(): number | undefined;
  secondColumnStripSize(value: number): this;
  secondColumnStripSize(value?: number): unknown { return this._size('secondColumnStripSize', value); }
  secondRowStripSize(): number | undefined;
  secondRowStripSize(value: number): this;
  secondRowStripSize(value?: number): unknown { return this._size('secondRowStripSize', value); }

  _style(slot: string): PivotTableStyle | undefined {
    const value = this.values.get(slot);
    return value instanceof PivotTableStyle ? value : undefined;
  }
}

// Public slot accessors are declared directly on the class above so that the
// generated .d.ts carries them.

/**
 * Workbook-level store of custom pivot themes
 * (`spread.customPivotTableThemes`).
 */
export class CustomPivotTableThemeManager {
  private themes = new Map<string, PivotTableTheme>();
  constructor(_workbook?: unknown) { /* trial-compatible signature */ }
  add(theme: string | PivotTableTheme): PivotTableTheme | undefined {
    let value: PivotTableTheme;
    if (typeof theme === 'string') {
      value = new PivotTableTheme();
      value.name(theme);
    } else {
      value = theme;
    }
    const name = String(value.name() ?? '');
    if (!name || this.themes.has(name.toLowerCase())) return undefined;
    this.themes.set(name.toLowerCase(), value);
    return value;
  }
  all(): PivotTableTheme[] { return [...this.themes.values()]; }
  get(name: string): PivotTableTheme | undefined { return this.themes.get(String(name).toLowerCase()); }
  remove(name: string): void { this.themes.delete(String(name).toLowerCase()); }
  update(oldThemeName: string, newTheme: PivotTableTheme): void {
    this.themes.delete(String(oldThemeName).toLowerCase());
    const name = String(newTheme?.name?.() ?? '');
    if (name) this.themes.set(name.toLowerCase(), newTheme);
  }
}
