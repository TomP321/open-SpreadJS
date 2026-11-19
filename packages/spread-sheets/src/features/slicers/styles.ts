/**
 * Slicer style objects: SlicerBorder / SlicerStyleInfo / SlicerStyle plus the
 * built-in SlicerStyles and TimelineStyles catalogues. Built-in definitions
 * are stored in `builtin-styles.json` using the token colours ("Accent 1 60")
 * the public API returns from toJSON(); resolveSlicerColor() maps tokens to
 * hex values with the shared table-theme palette.
 */
import type { JsonRecord } from '../../serialization.js';
import { resolveColor } from '../table-style.js';
import type { SlicerBorderStyle } from './types.js';
import styles from './builtin-styles.json';

export const SLICER_BORDER_KEYS = ['borderLeft', 'borderTop', 'borderRight', 'borderBottom'] as const;

/** What a slicer-style slot getter returns: a materialised info, raw JSON or nothing. */
export type SlicerStyleInfoValue = SlicerStyleInfo | JsonRecord | undefined;

export class SlicerBorder {
  private props: JsonRecord;
  constructor(borderWidth: number, borderStyle: SlicerBorderStyle | string, borderColor: string) {
    this.props = { borderWidth, borderStyle, borderColor };
  }
  private prop<T>(key: string, value?: T): T | this {
    if (value === undefined) return this.props[key] as T;
    this.props[key] = value;
    return this;
  }
  borderWidth(value?: number): number | this { return this.prop('borderWidth', value); }
  borderStyle(value?: SlicerBorderStyle | string): SlicerBorderStyle | string | this { return this.prop('borderStyle', value); }
  borderColor(value?: string): string | this { return this.prop('borderColor', value); }
  toJSON(): JsonRecord { return { ...this.props }; }
  fromJSON(json: JsonRecord): void { this.props = { borderWidth: 0, borderStyle: '', borderColor: '', ...json }; }
  clone(): SlicerBorder { const border = new SlicerBorder(0, '', ''); border.fromJSON(this.props); return border; }
}

export class SlicerStyleInfo {
  private props: JsonRecord = {};
  constructor(
    backColor?: string, foreColor?: string, font?: string,
    borderLeft?: SlicerBorder, borderTop?: SlicerBorder, borderRight?: SlicerBorder, borderBottom?: SlicerBorder,
    textDecoration?: unknown, fontStyle?: string, fontWeight?: string, fontSize?: string, fontFamily?: string,
  ) {
    const set = (key: string, value: unknown): void => {
      if (value === undefined) return;
      this.props[key] = value instanceof SlicerBorder ? value.toJSON() : value;
    };
    set('backColor', backColor);
    set('foreColor', foreColor);
    if (font !== undefined) this.setFont(font);
    set('borderLeft', borderLeft?.toJSON());
    set('borderTop', borderTop?.toJSON());
    set('borderRight', borderRight?.toJSON());
    set('borderBottom', borderBottom?.toJSON());
    set('textDecoration', textDecoration);
    set('fontStyle', fontStyle);
    set('fontWeight', fontWeight);
    set('fontSize', fontSize);
    set('fontFamily', fontFamily);
  }
  private prop<T>(key: string, value?: T): T | this {
    if (value === undefined) return this.props[key] as T;
    this.props[key] = value instanceof SlicerBorder ? value.toJSON() as T : value;
    return this;
  }
  backColor(value?: string | null): string | null | this { return this.prop('backColor', value); }
  foreColor(value?: string | null): string | null | this { return this.prop('foreColor', value); }
  textDecoration(value?: string | null): string | null | this { return this.prop('textDecoration', value); }
  fontStyle(value?: string | null): string | null | this { return this.prop('fontStyle', value); }
  fontWeight(value?: string | null): string | null | this { return this.prop('fontWeight', value); }
  fontSize(value?: string | null): string | null | this { return this.prop('fontSize', value); }
  fontFamily(value?: string | null): string | null | this { return this.prop('fontFamily', value); }
  borderLeft(value?: SlicerBorder | JsonRecord | null): SlicerBorder | JsonRecord | null | this { return this.prop('borderLeft', value); }
  borderTop(value?: SlicerBorder | JsonRecord | null): SlicerBorder | JsonRecord | null | this { return this.prop('borderTop', value); }
  borderRight(value?: SlicerBorder | JsonRecord | null): SlicerBorder | JsonRecord | null | this { return this.prop('borderRight', value); }
  borderBottom(value?: SlicerBorder | JsonRecord | null): SlicerBorder | JsonRecord | null | this { return this.prop('borderBottom', value); }
  /** Combined font string; components override it when present. */
  font(value?: string | null): string | null | this {
    if (value === undefined) {
      if (typeof this.props.font === 'string') return this.props.font;
      const parts = [this.props.fontStyle ?? 'normal', this.props.fontWeight ?? 'normal', this.props.fontSize ?? '', this.props.fontFamily ?? ''];
      return parts.filter(part => part !== '').join(' ').trim();
    }
    this.setFont(value);
    return this;
  }
  private setFont(font: string | null): void {
    this.props.font = font;
    if (font === null) return;
    const parts = String(font).split(/\s+/);
    if (parts.length >= 3) {
      const isWeight = (token: string): boolean => /^(bold|bolder|lighter|[1-9]00)$/.test(token);
      // Accept both CSS order ("italic bold ...") and the trial's own ("bold italic ...").
      const weightFirst = isWeight(parts[0]);
      const style = weightFirst ? parts[1] : parts[0];
      const weight = weightFirst ? parts[0] : parts[1];
      this.props.fontStyle = style === 'normal' ? null : style;
      this.props.fontWeight = weight === 'normal' ? null : weight;
      this.props.fontSize = parts[2];
      this.props.fontFamily = parts.slice(3).join(' ') || null;
    }
  }
  setBorders(border: SlicerBorder): void {
    for (const key of SLICER_BORDER_KEYS) this.props[key] = border.toJSON();
  }
  toJSON(): JsonRecord { return { ...this.props }; }
  fromJSON(json: JsonRecord): void { this.props = { ...json }; }
  raw(): JsonRecord { return this.props; }
}

export class SlicerStyle {
  protected bag: Record<string, unknown> = {};
  protected static keys: readonly string[] = [
    'wholeSlicerStyle', 'headerStyle',
    'selectedItemWithDataStyle', 'selectedItemWithNoDataStyle',
    'unSelectedItemWithDataStyle', 'unSelectedItemWithNoDataStyle',
    'hoveredSelectedItemWithDataStyle', 'hoveredSelectedItemWithNoDataStyle',
    'hoveredUnSelectedItemWithDataStyle', 'hoveredUnSelectedItemWithNoDataStyle',
  ];
  constructor() { /* accessors populate the bag */ }
  name(value?: string): string | undefined | this {
    if (value === undefined) return this.bag.name as string | undefined;
    this.bag.name = value;
    return this;
  }
  protected accessor(key: string, value?: SlicerStyleInfo | JsonRecord): SlicerStyleInfo | JsonRecord | undefined | this {
    if (value === undefined) return this.info(key);
    this.bag[key] = value;
    return this;
  }
  /** Materialised style info for the painter (creates it from stored JSON on demand). */
  info(key: string): SlicerStyleInfo | undefined {
    const stored = this.bag[key];
    if (!stored) return undefined;
    if (stored instanceof SlicerStyleInfo) return stored;
    const info = new SlicerStyleInfo();
    info.fromJSON(stored as JsonRecord);
    this.bag[key] = info;
    return info;
  }
  headerStyle(value?: SlicerStyleInfo | JsonRecord): SlicerStyleInfoValue | this { return this.accessor('headerStyle', value); }
  wholeSlicerStyle(value?: SlicerStyleInfo | JsonRecord): SlicerStyleInfoValue | this { return this.accessor('wholeSlicerStyle', value); }
  selectedItemWithDataStyle(value?: SlicerStyleInfo | JsonRecord): SlicerStyleInfoValue | this { return this.accessor('selectedItemWithDataStyle', value); }
  selectedItemWithNoDataStyle(value?: SlicerStyleInfo | JsonRecord): SlicerStyleInfoValue | this {
    return this.accessor('selectedItemWithNoDataStyle', value);
  }
  unSelectedItemWithDataStyle(value?: SlicerStyleInfo | JsonRecord): SlicerStyleInfoValue | this {
    return this.accessor('unSelectedItemWithDataStyle', value);
  }
  unSelectedItemWithNoDataStyle(value?: SlicerStyleInfo | JsonRecord): SlicerStyleInfoValue | this {
    return this.accessor('unSelectedItemWithNoDataStyle', value);
  }
  hoveredSelectedItemWithDataStyle(value?: SlicerStyleInfo | JsonRecord): SlicerStyleInfoValue | this {
    return this.accessor('hoveredSelectedItemWithDataStyle', value);
  }
  hoveredSelectedItemWithNoDataStyle(value?: SlicerStyleInfo | JsonRecord): SlicerStyleInfoValue | this {
    return this.accessor('hoveredSelectedItemWithNoDataStyle', value);
  }
  hoveredUnSelectedItemWithDataStyle(value?: SlicerStyleInfo | JsonRecord): SlicerStyleInfoValue | this {
    return this.accessor('hoveredUnSelectedItemWithDataStyle', value);
  }
  hoveredUnSelectedItemWithNoDataStyle(value?: SlicerStyleInfo | JsonRecord): SlicerStyleInfoValue | this {
    return this.accessor('hoveredUnSelectedItemWithNoDataStyle', value);
  }
  toJSON(): JsonRecord {
    const result: JsonRecord = {};
    if (this.bag.name !== undefined) result.name = this.bag.name as string;
    for (const key of (this.constructor as typeof SlicerStyle).keys) {
      const stored = this.bag[key];
      if (!stored) continue;
      result[key] = stored instanceof SlicerStyleInfo ? stored.toJSON() : stored;
    }
    return result;
  }
  fromJSON(data: JsonRecord): void {
    this.bag = {};
    if (!data || typeof data !== 'object') return;
    if (typeof data.name === 'string') this.bag.name = data.name;
    for (const key of (this.constructor as typeof SlicerStyle).keys) if (data[key]) this.bag[key] = { ...(data[key] as JsonRecord) };
  }
  static _fromBuiltin(json: JsonRecord): SlicerStyle {
    const style = new SlicerStyle();
    style.fromJSON(json);
    return style;
  }
}

export class TimelineStyle extends SlicerStyle {
  protected static override keys = [
    'wholeSlicerStyle', 'headerStyle', 'selectionLabelStyle', 'timeLevelStyle',
    'periodLabel1Style', 'periodLabel2Style', 'selectedTimeBlockStyle',
    'unselectedTimeBlockStyle', 'selectedTimeBlockSpaceStyle',
  ];
  // Own declarations (the contract repeats these on the subclass): delegate up.
  name(value?: string): string | undefined | this { return super.name(value); }
  headerStyle(value?: SlicerStyleInfo | JsonRecord): SlicerStyleInfoValue | this { return super.headerStyle(value); }
  wholeSlicerStyle(value?: SlicerStyleInfo | JsonRecord): SlicerStyleInfoValue | this { return super.wholeSlicerStyle(value); }
  toJSON(): JsonRecord { return super.toJSON(); }
  fromJSON(data: JsonRecord): void { super.fromJSON(data); }
  periodLabel1Style(value?: SlicerStyleInfo | JsonRecord): SlicerStyleInfoValue | this { return this.accessor('periodLabel1Style', value); }
  periodLabel2Style(value?: SlicerStyleInfo | JsonRecord): SlicerStyleInfoValue | this { return this.accessor('periodLabel2Style', value); }
  selectionLabelStyle(value?: SlicerStyleInfo | JsonRecord): SlicerStyleInfoValue | this { return this.accessor('selectionLabelStyle', value); }
  timeLevelStyle(value?: SlicerStyleInfo | JsonRecord): SlicerStyleInfoValue | this { return this.accessor('timeLevelStyle', value); }
  selectedTimeBlockStyle(value?: SlicerStyleInfo | JsonRecord): SlicerStyleInfoValue | this { return this.accessor('selectedTimeBlockStyle', value); }
  unselectedTimeBlockStyle(value?: SlicerStyleInfo | JsonRecord): SlicerStyleInfoValue | this { return this.accessor('unselectedTimeBlockStyle', value); }
  selectedTimeBlockSpaceStyle(value?: SlicerStyleInfo | JsonRecord): SlicerStyleInfoValue | this {
    return this.accessor('selectedTimeBlockSpaceStyle', value);
  }
}

const SLICER_NAMES = ['light1', 'light2', 'light3', 'light4', 'light5', 'light6', 'other1', 'other2', 'dark1', 'dark2', 'dark3', 'dark4', 'dark5', 'dark6'];
const TIMELINE_NAMES = ['light1', 'light2', 'light3', 'light4', 'light5', 'light6', 'dark1', 'dark2', 'dark3', 'dark4', 'dark5', 'dark6'];

const SLICER_STYLES = (styles as { slicer: Record<string, JsonRecord> }).slicer;
const TIMELINE_STYLES = (styles as { timeline: Record<string, JsonRecord> }).timeline;

const builtinKey = (family: string, name: string): string =>
  `${family}${name[0]!.toUpperCase()}${name.slice(1)}`;

export class SlicerStyles {
  constructor() { /* static catalogue */ }
}

for (const name of SLICER_NAMES)
  (SlicerStyles as unknown as Record<string, () => SlicerStyle>)[name] =
    () => SlicerStyle._fromBuiltin(SLICER_STYLES[builtinKey('SlicerStyle', name)]!);

export class TimelineStyles {
  constructor() { /* static catalogue */ }
}

for (const name of TIMELINE_NAMES)
  (TimelineStyles as unknown as Record<string, () => TimelineStyle>)[name] = () => {
    const style = new TimelineStyle();
    style.fromJSON(TIMELINE_STYLES[builtinKey('TimeSlicerStyle', name)]!);
    return style;
  };

/** Resolve a slicer style colour token ("Accent 1 60") against the palettes. */
export function resolveSlicerColor(value: unknown): string {
  if (typeof value !== 'string') return '';
  const resolved = resolveColor(value);
  return typeof resolved === 'string' ? resolved : value;
}
