import { instanceProperties } from './not-implemented.js';

export function clone<T>(value: T): T {
  if (value instanceof Date) return new Date(value.getTime()) as T;
  if (Array.isArray(value)) return value.map(clone) as T;
  if (value && typeof value === 'object') {
    const result = Object.create(Object.getPrototypeOf(value)) as Record<string, unknown>;
    for (const [key, item] of Object.entries(value)) result[key] = clone(item);
    // A Style's `font` shorthand lives on the prototype (TASK 79): carry its composed/raw value
    // across explicitly so clones keep the exact shorthand the source reports.
    if (value instanceof Style) {
      const font = getFont(value);
      if (font !== undefined) (result as unknown as Style).font = font;
    }
    return result as T;
  }
  return value;
}

export class Range {
  constructor(
    public row = 0,
    public col = 0,
    public rowCount = 1,
    public colCount = 1,
  ) {}
  contains(row: number, col: number, rowCount = 1, colCount = 1): boolean {
    return (
      (this.row === -1 || (row >= this.row && row + rowCount <= this.row + this.rowCount)) &&
      (this.col === -1 || (col >= this.col && col + colCount <= this.col + this.colCount))
    );
  }
  containsRange(range: Range): boolean {
    return this.contains(range.row, range.col, range.rowCount, range.colCount);
  }
  equals(range: Range): boolean {
    return (
      !!range &&
      ['row', 'col', 'rowCount', 'colCount'].every((k) => this[k as keyof Range] === range[k as keyof Range])
    );
  }
  getIntersect(range: Range, maxRowCount: number, maxColumnCount: number): Range | null {
    const a = this.normalized(maxRowCount, maxColumnCount),
      b = range.normalized(maxRowCount, maxColumnCount);
    const r = Math.max(a.row, b.row),
      c = Math.max(a.col, b.col);
    const rc = Math.min(a.row + a.rowCount, b.row + b.rowCount) - r,
      cc = Math.min(a.col + a.colCount, b.col + b.colCount) - c;
    return rc > 0 && cc > 0 ? new Range(r, c, rc, cc) : null;
  }
  intersect(row: number, col: number, rowCount: number, colCount: number): boolean {
    return !!this.getIntersect(
      new Range(row, col, rowCount, colCount),
      Number.MAX_SAFE_INTEGER,
      Number.MAX_SAFE_INTEGER,
    );
  }
  offset(x: number, y: number): Range {
    return new Range(
      this.row === -1 ? -1 : this.row + y,
      this.col === -1 ? -1 : this.col + x,
      this.rowCount,
      this.colCount,
    );
  }
  union(range: Range): Range {
    const r = Math.min(this.row, range.row),
      c = Math.min(this.col, range.col);
    return new Range(
      r,
      c,
      r === -1 ? -1 : Math.max(this.row + this.rowCount, range.row + range.rowCount) - r,
      c === -1 ? -1 : Math.max(this.col + this.colCount, range.col + range.colCount) - c,
    );
  }
  normalized(rows: number, columns: number): Range {
    return new Range(
      this.row < 0 ? 0 : this.row,
      this.col < 0 ? 0 : this.col,
      this.row < 0 ? rows : this.rowCount,
      this.col < 0 ? columns : this.colCount,
    );
  }
}
instanceProperties(Range, 'row', 'col', 'rowCount', 'colCount');

export class Point {
  constructor(
    public x = 0,
    public y = 0,
  ) {}
  /** Returns a new point with the same coordinates. */
  clone(): Point {
    return new Point(this.x, this.y);
  }
}

/** A rectangle defined by its top-left corner, width and height. */
export class Rect {
  constructor(
    public x: number,
    public y: number,
    public width: number,
    public height: number,
  ) {}
  /** True when (x, y) falls strictly inside the rectangle. */
  contains(x: number, y: number): boolean {
    return x > this.x && x < this.x + this.width && y > this.y && y < this.y + this.height;
  }
  /** True when the given rectangle shares area with this one. */
  intersect(x: number, y: number, width: number, height: number): boolean {
    return x < this.x + this.width && x + width > this.x && y < this.y + this.height && y + height > this.y;
  }
  /** True when the given rectangle shares area with this one. */
  intersectRect(rect: Rect): boolean {
    return !!rect && this.intersect(rect.x, rect.y, rect.width, rect.height);
  }
  /** The shared area of the two rectangles, or null when they do not intersect. */
  getIntersectRect(rect: Rect): Rect | null {
    if (!this.intersectRect(rect)) return null;
    const x = Math.max(this.x, rect.x),
      y = Math.max(this.y, rect.y);
    return new Rect(x, y, Math.min(this.x + this.width, rect.x + rect.width) - x, Math.min(this.y + this.height, rect.y + rect.height) - y);
  }
}
instanceProperties(Rect, 'x', 'y', 'width', 'height');

export class LineBorder {
  constructor(
    public color = 'black',
    public style = 0,
  ) {}
  /**
   * Internal hint recorded by table theme cloning (Excel border level); not part
   * of the documented public LineBorder contract and never read by the core.
   * @internal
   */
  level?: number;
}

export const styleProperties = [
  'allowEditInCell',
  'applyAlignment',
  'applyBorder',
  'applyFill',
  'applyFont',
  'applyNumberFormat',
  'applyProtection',
  'backColor',
  'backgroundImage',
  'backgroundImageLayout',
  'borderBottom',
  'borderLeft',
  'borderRadius',
  'borderRight',
  'borderTop',
  'cellButtons',
  'cellPadding',
  'cellType',
  'decoration',
  'diagonalDown',
  'diagonalUp',
  'dropDowns',
  'font',
  'fontFamily',
  'fontSize',
  'fontStyle',
  'fontWeight',
  'foreColor',
  'formatter',
  'hAlign',
  'hidden',
  'imeMode',
  'isVerticalText',
  'labelOptions',
  'locked',
  'mask',
  'name',
  'parentName',
  'showEllipsis',
  'shrinkToFit',
  'tabStop',
  'textDecoration',
  'textDirection',
  'textIndent',
  'textOrientation',
  'themeFont',
  'vAlign',
  'watermark',
  'wordWrap',
  'quotePrefix',
] as const;
export type StyleProperty = (typeof styleProperties)[number];
// Shorthand-font bookkeeping (TASK 79): `font` is a *prototype* accessor (like the trial's, so
// assigned styles stay in V8 fast mode — the per-instance accessor we used to define forced every
// Style into dictionary mode and cost ~3 extra objects per styled cell). The WeakMap only remembers
// the original string when re-composing it from the parsed parts would not reproduce it exactly
// (unparseable values or unusual part order); the canonical `style<weight><size> <family>` order
// round-trips, so those styles get no WeakMap entry at all.
const fonts = new WeakMap<Style, { value: unknown; parts?: FontParts }>();
// TASK 79: the regex results are slices of the user's font string, so without interning every
// styled cell pins its own copy of 'bold'/'Calibri'/... (V8 cons-string, ~20 B) plus the source
// string. The part vocabulary is tiny and bounded, so a small cache turns them into shared strings.
const FONT_PART_CACHE_LIMIT = 4096;
const fontParts = new Map<string, string>();
function internFontPart(value: string | undefined): string | undefined {
  if (value === undefined) return value;
  const cached = fontParts.get(value);
  if (cached !== undefined) return cached;
  if (fontParts.size < FONT_PART_CACHE_LIMIT) fontParts.set(value, value);
  return value;
}

/* TASK 90 (measured black-box, `.probe/t90/parse-r1.json` + `.probe/t90/fonts-r1.json`): the trial
 * parses PARTIAL shorthands too — `'18pt'` fills `fontSize`, `'Georgia'` fills `fontFamily`,
 * `'bold'` fills `fontWeight` — and its `font` getter / `toJSON().font` is always the canonical
 * composition of the current long-hand parts (`'bold italic 12pt Arial'` reads back
 * `'italic bold 12pt Arial'`, a multi-word family is quoted: `'14.6667px \'Segoe UI\''`).
 * The old one-shot regex only understood `<size> <family>`, so every ribbon font command left a
 * family-less (`'12pt'`) or size-less (`'bold'`) shorthand; handed to the canvas it is an invalid
 * `font` value, which Chromium silently ignores and the cell is drawn in the previous font
 * (usually the 10px default) — the user's "the font falls back to a default" / "bold glitches". */
const FONT_SIZE_TOKEN = /\d+(?:\.\d+)?(?:px|pt|pc|em|rem|%|ex)/;
const ITALIC_KEYWORD = /^(?:italic|oblique)$/;
const WEIGHT_KEYWORD = /^(?:bold|bolder|lighter|[1-9]00)$/;
const FONT_KEYWORD = /^(?:italic|oblique|small-caps|bold|bolder|lighter|normal|[1-9]00)$/;
const QUOTED = /^['"](.*)['"]$/;
// CSS-wide keywords are not a family name: the trial splinters them over every font member
// (`inherit` -> six `inherit` slots); we keep such a value verbatim instead, which is what a
// canvas can still work with and what keeps `font: 'inherit'` a single member.
const CSS_WIDE_KEYWORD = /^(?:inherit|initial|unset|revert|revert-layer)$/i;

/** `'Segoe UI'` -> `"'Segoe UI'"`; a double-quoted name becomes single-quoted like the trial, and
 *  quoted names and comma lists are otherwise left as written. */
export function quoteFontFamily(family: string): string {
  return family
    .split(',')
    .map((part) => {
      const text = part.trim();
      if (!text) return text;
      const double = /^"(.*)"$/.exec(text);
      if (double) return `'${double[1]}'`;
      return !QUOTED.test(text) && /\s/.test(text) ? `'${text}'` : text;
    })
    .join(', ');
}

export interface FontParts {
  fontStyle?: unknown;
  fontWeight?: unknown;
  fontSize?: unknown;
  fontFamily?: unknown;
}

/**
 * Splits a CSS font shorthand into the trial's four long-hand parts.
 * `residual` is true when the value carries something the four parts cannot represent (a
 * `/line-height` or an unrecognised pre-size token), in which case the caller must keep the
 * original string so a workbook round-trip cannot lose it.
 */
/** Classifies the pre-size keyword run of a shorthand into the style/weight members. A lone
 *  `normal` is a weight (that is how the trial composes a bold-off cell: `normal 20pt Calibri`);
 *  a second one fills the style slot too (`normal normal 11pt Calibri`). */
function assignFontKeywords(parts: FontParts, tokens: string[]): void {
  for (const token of tokens) {
    if (token === 'small-caps') continue;
    if (ITALIC_KEYWORD.test(token)) parts.fontStyle = internFontPart(token);
    else if (WEIGHT_KEYWORD.test(token)) parts.fontWeight = internFontPart(token);
    else if (parts.fontWeight === undefined) parts.fontWeight = internFontPart(token);
    else parts.fontStyle = internFontPart(token);
  }
}

export function parseFontParts(value: unknown): { parts: FontParts; residual: boolean } | undefined {
  if (typeof value !== 'string') return undefined;
  const text = value.trim();
  if (!text) return undefined;
  const size = FONT_SIZE_TOKEN.exec(text);
  if (!size) {
    const tokens = text.split(/\s+/);
    if (tokens.some((token) => CSS_WIDE_KEYWORD.test(token))) return undefined;
    if (tokens.every((token) => FONT_KEYWORD.test(token))) {
      const parts: FontParts = {};
      assignFontKeywords(parts, tokens);
      return { parts, residual: false };
    }
    return { parts: { fontFamily: internFontPart(text) }, residual: false };
  }
  const before = text.slice(0, size.index).trim();
  let after = text.slice(size.index + size[0].length).trim();
  const parts: FontParts = { fontSize: internFontPart(size[0]) };
  let residual = false;
  // `/1.4` line-height: the trial keeps it as its own `lineHeight` member, which the four
  // long-hands cannot express.
  if (after.startsWith('/')) {
    const lineHeight = /^\/\s*[\d.]+/.exec(after);
    if (lineHeight) {
      residual = true;
      after = after.slice(lineHeight[0].length).trim();
    }
  }
  const family: string[] = [];
  const keywords: string[] = [];
  for (const token of before ? before.split(/\s+/) : []) {
    if (FONT_KEYWORD.test(token)) keywords.push(token);
    else family.push(token);
  }
  assignFontKeywords(parts, keywords);
  // Trial measurement (`.probe/t90/odd-r1.json`, `.probe/t90/family-r1.json`): only the name run
  // that FOLLOWS the size is stored quoted (`11pt Calibri Light` -> `'Calibri Light'`,
  // `12pt Georgia bold` -> `'Georgia bold'`), while a name collected from the pre-size tokens is
  // stored as written (`0bold 11px Calibri` -> `0bold Calibri`), and a value with no size at all
  // keeps whatever the caller wrote (`Segoe UI`). The composition quotes it in every case
  // (`14.6667px 'Segoe UI'`), which is what the canvas and the ribbon read.
  if (after) family.push(quoteFontFamily(after));
  if (family.length) parts.fontFamily = internFontPart(family.join(' '));
  return { parts, residual };
}

/** The trial's canonical shorthand order: style, weight, size, family (multi-word families quoted). */
export function composeFontParts(parts: FontParts): string | undefined {
  const composed = [
    parts.fontStyle,
    parts.fontWeight,
    parts.fontSize,
    parts.fontFamily === undefined ? undefined : quoteFontFamily(String(parts.fontFamily)),
  ].filter(Boolean);
  return composed.length ? composed.join(' ') : undefined;
}

/** The shorthand a style reports: the composition of its own current font long-hands. */
export function composeFont(style: Style): string | undefined {
  return composeFontParts(fontPartsSnapshot(style));
}

/** Forget any remembered raw shorthand so the style reports the composition of its current parts
 *  (what the trial's resolved/actual styles always do). A value the parser could not express stays
 *  verbatim. */
export function recomposeFont(style: Style): void {
  const cached = fonts.get(style);
  if (cached && !cached.parts) return;
  fonts.delete(style);
}

/** The sheet default font every canvas and layout measurement falls back to. */
export const DEFAULT_CANVAS_FONT = '14.6667px Calibri';

const SIZE_WITH_UNIT = /^(\d+(?:\.\d+)?)(px|pt|pc|em|rem|%|ex)$/;

/** A `ctx.font` value the canvas accepts: valid CSS font shorthand, size converted to CSS pixels
 *  and multiplied by the sheet zoom, family quoted when it needs it. An invalid `font` assignment
 *  is silently ignored by the canvas (the previous font keeps being used), which is exactly the
 *  "font falls back to a default" symptom under TASK 90 — so nothing may hand a raw shorthand over. */
export function canvasFont(style: Record<string, unknown> | undefined | null, zoom = 1, defaultFont = DEFAULT_CANVAS_FONT): string {
  const shorthand = parseFontParts(style?.font)?.parts;
  const fallback = parseFontParts(defaultFont)?.parts ?? {};
  const part = <K extends keyof FontParts>(key: K): unknown =>
    style && style[key] !== undefined ? style[key] : shorthand?.[key] !== undefined ? shorthand[key] : fallback[key];
  const size = String(part('fontSize') ?? '');
  const unit = SIZE_WITH_UNIT.exec(size);
  const base = Number(unit?.[1] ?? Number.parseFloat(size));
  let px = Number.isFinite(base) && base > 0 ? base : 14.6667;
  if (unit && (unit[2] === 'pt' || unit[2] === 'pc')) px *= 4 / 3;
  else if (unit && (unit[2] === 'em' || unit[2] === 'rem')) px *= 16;
  else if (unit && unit[2] === '%') px = (px / 100) * 14.6667;
  const family = String(part('fontFamily') ?? '').trim() || 'Calibri';
  return [part('fontStyle'), part('fontWeight'), `${Number((px * (Number.isFinite(zoom) ? zoom : 1)).toFixed(4))}px`, quoteFontFamily(family)]
    .filter(Boolean)
    .join(' ');
}

function fontPartsSnapshot(style: Style): FontParts {
  return { fontStyle: style.fontStyle as string, fontWeight: style.fontWeight as string, fontSize: style.fontSize as string, fontFamily: style.fontFamily as string };
}

function setFont(style: Style, value: unknown): void {
  const parsed = parseFontParts(value);
  if (!parsed) {
    // Nothing the four members can express (a non-string, `''`, a CSS-wide keyword): remembered
    // verbatim, `getFont` hands it back unchanged. TASK 90 (`clear-undefined` probe): the trial
    // clears the font members such a value cannot carry, so parts a style holds must not survive
    // it — the own slots go to `undefined`, which is what the trial reports for them.
    for (const key of ['fontStyle', 'fontWeight', 'fontSize', 'fontFamily'] as const)
      if (Object.hasOwn(style, key)) style[key] = undefined;
    fonts.set(style, { value });
    return;
  }
  const { parts, residual } = parsed;
  // TASK 79: a shorthand only clears parts the style actually carries (own properties), so a
  // plain `font = '12px Arial'` leaves the shape at the members it sets instead of materialising
  // undefined slots per style (the 100k-styles benchmark).
  const assign: Record<string, unknown> = { fontSize: parts.fontSize, fontFamily: parts.fontFamily };
  if (parts.fontStyle !== undefined || Object.hasOwn(style, 'fontStyle')) assign.fontStyle = parts.fontStyle;
  if (parts.fontWeight !== undefined || Object.hasOwn(style, 'fontWeight')) assign.fontWeight = parts.fontWeight;
  Object.assign(style, assign);
  const snapshot = fontPartsSnapshot(style);
  // Only values the four parts cannot represent keep their original string (`12px/1.4 Arial`);
  // everything else follows the parts, like the trial (`bold italic 12px Arial` ->
  // `italic bold 12px Arial`), so any long-hand change rebuilds the shorthand.
  if (!residual) fonts.delete(style);
  else fonts.set(style, { value, parts: snapshot });
}
const FONT_MEMBERS = ['fontStyle', 'fontWeight', 'fontSize', 'fontFamily'] as const;

export function getFont(style: Style): unknown {
  const cached = fonts.get(style);
  if (cached) {
    // A value the parser cannot express (`undefined`, `''`, a CSS-wide keyword, a non-string) is
    // reported unchanged; a parsed one only as long as the members still say the same thing.
    if (!cached.parts) return cached.value;
    if (FONT_MEMBERS.every((key) => style[key] === cached.parts![key])) return cached.value;
  }
  return composeFont(style);
}
const styleArguments: StyleProperty[] = [
  'backColor',
  'foreColor',
  'hAlign',
  'vAlign',
  'font',
  'themeFont',
  'formatter',
  'borderLeft',
  'borderTop',
  'borderRight',
  'borderBottom',
  'locked',
  'textIndent',
  'wordWrap',
  'showEllipsis',
  'shrinkToFit',
  'backgroundImage',
  'cellType',
  'backgroundImageLayout',
  'tabStop',
  'textDecoration',
  'imeMode',
  'name',
  'parentName',
  'watermark',
  'cellPadding',
  'labelOptions',
  'quotePrefix' as StyleProperty,
  'diagonalDown',
  'diagonalUp',
  'isVerticalText',
  'cellButtons',
  'dropDowns',
  'textOrientation',
  'decoration',
  'mask',
  'fontStyle',
  'fontWeight',
  'fontSize',
  'fontFamily',
  'hidden',
  'textDirection',
  'borderRadius',
];
export class Style {
  [key: string]: unknown;
  get font(): unknown {
    return getFont(this);
  }
  set font(value: unknown) {
    setFont(this, value);
  }
  constructor(...values: unknown[]) {
    // The official also accepts a single plain-options argument: new Style({ backColor: 'red', ... }).
    if (values.length === 1 && values[0] !== null && typeof values[0] === 'object' && !Array.isArray(values[0]) && !(values[0] instanceof Style)) {
      Object.assign(this, values[0]);
      return;
    }
    values.forEach((value, i) => {
      if (value !== undefined) this[styleArguments[i]] = value;
    });
  }
  clone(): Style {
    return clone(this);
  }
  /**
   * Merges another style's members into this one (trial runtime extra, not declared by the
   * d.ts contract): members this style already defines keep their value; a second truthy
   * argument forces the source members to win (TASK 46 compose probe). Returns undefined;
   * reading members of a missing first argument throws, like the trial.
   */
  compose(style: Style | undefined, override?: unknown): undefined {
    const source = style as Style;
    void source.labelOptions; // trial: `compose()` with no style throws on the first member read
    const sourceJson = typeof source.toJSON === 'function' ? source.toJSON() : undefined;
    const force = arguments.length > 1 && Boolean(override);
    if (sourceJson)
      for (const key of Object.keys(sourceJson)) {
        const current = (this as Record<string, unknown>)[key];
        if (force || current === undefined) (this as Record<string, unknown>)[key] = sourceJson[key];
      }
    return undefined;
  }
  /** Applies the members of a settings object to this style (trial runtime extra). */
  fromJSON(settings: object): void {
    for (const [key, value] of Object.entries(settings ?? {})) {
      if (typeof value === 'function') continue;
      (this as Record<string, unknown>)[key] = value;
    }
  }
  /** Serialize the style's own defined fields (undefined ones stay out, matching the official
   *  named-style `toJSON()` shape used by `workbook.getNamedStyle(name).toJSON()`). The trial
   *  returns `undefined` for a style without any assigned member (TASK 46 probe). */
  toJSON(): Record<string, unknown> | undefined {
    const out: Record<string, unknown> = {};
    for (const key of styleProperties) {
      if (key === 'font') continue; // represented through fontStyle/fontWeight/fontSize/fontFamily
      const value = (this as Record<string, unknown>)[key];
      if (value === undefined) continue;
      out[key] = value && typeof value === 'object' && typeof (value as { toJSON?: unknown }).toJSON === 'function'
        ? (value as { toJSON: () => unknown }).toJSON()
        : clone(value);
    }
    const font = getFont(this);
    if (font !== undefined) out.font = clone(font);
    return Object.keys(out).length ? out : undefined;
  }
}
// Absent style fields remain undefined, and are distinct from resolved defaults. The trial
// declares none of them on the prototype (they appear only as own data properties once
// assigned), but the public contract declares them, so they exist as accessor pairs
// (`instanceProperties`): a read without an assigned value still yields `undefined`, and an
// assignment shadows the accessor with an own enumerable data property - the trial's shape.
instanceProperties(Style, ...styleProperties, 'quotePrefix');

export class NameInfo {
  _onRename?: (previous: string, next: string) => void;
  _onChange?: () => void;
  constructor(
    private n = '',
    private expr: unknown = '',
    private r = 0,
    private c = 0,
    private comment = '',
    private readOnly = false,
  ) {}
  getName(): string {
    return this.n;
  }
  getExpression(): unknown {
    return this.expr;
  }
  getRow(): number {
    return this.r;
  }
  getColumn(): number {
    return this.c;
  }
  getComment(): string {
    return this.comment;
  }
  isReadOnly(value?: boolean): boolean {
    if (value !== undefined) this.readOnly = value;
    return this.readOnly;
  }
  set(name?: string, formula?: string, baseRow?: number, baseCol?: number, comment?: string): void {
    if (name !== undefined) {
      this._onRename?.(this.n, name);
      this.n = name;
    }
    if (formula !== undefined) this.expr = formula;
    if (baseRow !== undefined) this.r = baseRow;
    if (baseCol !== undefined) this.c = baseCol;
    if (comment !== undefined) this.comment = comment;
    this._onChange?.();
  }
  toJSON(): Record<string, unknown> {
    return {
      name: this.n,
      formula: this.expr,
      row: this.r,
      col: this.c,
      ...(this.comment ? { comment: this.comment } : {}),
      isReadOnly: this.readOnly,
    };
  }
}
for (const [constructor, fields] of [
  [Range, ['row', 'col', 'rowCount', 'colCount']],
  [LineBorder, ['color', 'style']],
] as const) {
  for (const name of fields)
    Object.defineProperty(constructor.prototype, name, {
      value: undefined,
      writable: true,
      configurable: true,
    });
}
