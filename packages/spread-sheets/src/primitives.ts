export function clone<T>(value: T): T {
  if (value instanceof Date) return new Date(value.getTime()) as T;
  if (Array.isArray(value)) return value.map(clone) as T;
  if (value && typeof value === 'object') {
    const result = Object.create(Object.getPrototypeOf(value)) as Record<string, unknown>;
    for (const [key, item] of Object.entries(value)) result[key] = clone(item);
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

export class LineBorder {
  constructor(
    public color = 'black',
    public style = 0,
  ) {}
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
const fonts = new WeakMap<Style, { value: unknown; parts?: Record<string, unknown> }>();
function setFont(style: Style, value: unknown): void {
  const match =
    typeof value === 'string'
      ? value.match(/^(.*?)\s*(\d+(?:\.\d+)?(?:px|pt|em|rem|%))(?:\/[\d.]+)?\s+(.+)$/)
      : null;
  const parts: Record<string, unknown> = {};
  if (match) {
    parts.fontSize = match[2];
    parts.fontFamily = match[3];
    parts.fontStyle = match[1].match(/italic|oblique/)?.[0];
    parts.fontWeight = match[1].match(/bold|[1-9]00/)?.[0];
    Object.assign(style, parts);
  }
  fonts.set(style, { value, parts: match ? parts : undefined });
  if (!Object.hasOwn(style, 'font'))
    Object.defineProperty(style, 'font', {
      get() {
        return getFont(this as Style);
      },
      set(value: unknown) {
        setFont(this as Style, value);
      },
      enumerable: true,
      configurable: true,
    });
}
function getFont(style: Style): unknown {
  const cached = fonts.get(style);
  if (cached && (!cached.parts || Object.entries(cached.parts).every(([key, value]) => style[key] === value)))
    return cached.value;
  if (style.fontSize && style.fontFamily)
    return [style.fontStyle, style.fontWeight, style.fontSize, style.fontFamily].filter(Boolean).join(' ');
  return cached?.value;
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
    values.forEach((value, i) => {
      if (value !== undefined) this[styleArguments[i]] = value;
    });
  }
  clone(): Style {
    return clone(this);
  }
}
// Absent style fields remain undefined, and are distinct from resolved defaults.
for (const key of [...styleProperties, 'quotePrefix'])
  if (key !== 'font')
    Object.defineProperty(Style.prototype, key, { value: undefined, writable: true, configurable: true });

export class NameInfo {
  _onRename?: (previous: string, next: string) => void;
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
