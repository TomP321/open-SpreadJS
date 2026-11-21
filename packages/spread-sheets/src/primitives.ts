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
const fonts = new WeakMap<Style, { value: unknown; parts?: Record<string, unknown> }>();
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
function fontPartsOf(style: Style): string | undefined {
  const parts = [style.fontStyle, style.fontWeight, style.fontSize, style.fontFamily].filter(Boolean);
  return parts.length ? parts.join(' ') : undefined;
}
function setFont(style: Style, value: unknown): void {
  const match =
    typeof value === 'string'
      ? value.match(/^(.*?)\s*(\d+(?:\.\d+)?(?:px|pt|em|rem|%))(?:\/[\d.]+)?\s+(.+)$/)
      : null;
  if (!match) {
    // Unparseable: remembered verbatim, `getFont` hands it back unchanged. An
    // explicit `undefined` is remembered too (not dropped): like before TASK 79,
    // clearing the font keeps the getter reporting `undefined` even while the
    // previously parsed parts are still carried.
    fonts.set(style, { value });
    return;
  }
  const parts: Record<string, unknown> = {
    fontSize: internFontPart(match[2]),
    fontFamily: internFontPart(match[3]),
  };
  const fontStyle = internFontPart(match[1].match(/italic|oblique/)?.[0]);
  const fontWeight = internFontPart(match[1].match(/bold|[1-9]00/)?.[0]);
  // TASK 79: a shorthand without italic/bold only clears parts the style actually carries (own
  // properties), so a plain `font = '12px Arial'` leaves the shape at the members it sets instead
  // of materialising two undefined slots per style.
  if (fontStyle !== undefined || Object.hasOwn(style, 'fontStyle')) parts.fontStyle = fontStyle;
  if (fontWeight !== undefined || Object.hasOwn(style, 'fontWeight')) parts.fontWeight = fontWeight;
  Object.assign(style, parts);
  const composed = [fontStyle, fontWeight, parts.fontSize, parts.fontFamily].filter(Boolean).join(' ');
  if (composed === value) fonts.delete(style);
  else fonts.set(style, { value, parts });
}
export function getFont(style: Style): unknown {
  const cached = fonts.get(style);
  if (cached && (!cached.parts || Object.entries(cached.parts).every(([key, value]) => style[key] === value)))
    return cached.value;
  // The trial composes the shorthand from any subset of the font parts (TASK 46 probe:
  // size only -> "11pt", family only -> "Georgia", full combo -> "italic bold 11pt Calibri").
  const composed = fontPartsOf(style);
  return composed !== undefined ? composed : cached?.value;
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
