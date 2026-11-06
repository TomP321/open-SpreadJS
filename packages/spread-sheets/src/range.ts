import type { Worksheet } from './model.js';
import { Comment } from './comments.js';
import { GC } from './generated/enums.js';
import { LineBorder, Range, Style, styleProperties } from './primitives.js';

interface Accessor {
  (): unknown;
  (value: unknown): CellRange;
}
export class CellRange {
  declare allowEditInCell: Accessor;
  declare applyAlignment: Accessor;
  declare applyBorder: Accessor;
  declare applyFill: Accessor;
  declare applyFont: Accessor;
  declare applyNumberFormat: Accessor;
  declare applyProtection: Accessor;
  declare backColor: Accessor;
  declare backgroundImage: Accessor;
  declare backgroundImageLayout: Accessor;
  declare borderBottom: Accessor;
  declare borderLeft: Accessor;
  declare borderRadius: Accessor;
  declare borderRight: Accessor;
  declare borderTop: Accessor;
  declare cellButtons: Accessor;
  declare cellPadding: Accessor;
  declare cellType: Accessor;
  declare decoration: Accessor;
  declare diagonalDown: Accessor;
  declare diagonalUp: Accessor;
  declare dropDowns: Accessor;
  declare font: Accessor;
  declare fontFamily: Accessor;
  declare fontSize: Accessor;
  declare fontStyle: Accessor;
  declare fontWeight: Accessor;
  declare foreColor: Accessor;
  declare formatter: Accessor;
  declare hAlign: Accessor;
  declare hidden: Accessor;
  declare imeMode: Accessor;
  declare isVerticalText: Accessor;
  declare labelOptions: Accessor;
  declare locked: Accessor;
  declare mask: Accessor;
  declare name: Accessor;
  declare parentName: Accessor;
  declare showEllipsis: Accessor;
  declare shrinkToFit: Accessor;
  declare tabStop: Accessor;
  declare textDecoration: Accessor;
  declare textDirection: Accessor;
  declare textIndent: Accessor;
  declare textOrientation: Accessor;
  declare themeFont: Accessor;
  declare vAlign: Accessor;
  declare watermark: Accessor;
  declare wordWrap: Accessor;
  declare quotePrefix: Accessor;
  constructor(
    public sheet: Worksheet,
    public row: number,
    public col: number,
    public rowCount = 1,
    public colCount = 1,
    public sheetArea: number = GC.Spread.Sheets.SheetArea.viewport,
  ) {}
  private extent(): Range {
    return new Range(this.row, this.col, this.rowCount, this.colCount).normalized(
      this.sheet.getRowCount(this.sheetArea),
      this.sheet.getColumnCount(this.sheetArea),
    );
  }
  _each(callback: (row: number, col: number) => void, style = false): void {
    if (style && this.row === -1 && this.col === -1) {
      callback(-1, -1);
      return;
    }
    if (style && this.row === -1) {
      for (let c = this.col; c < this.col + this.colCount; c++) callback(-1, c);
      return;
    }
    if (style && this.col === -1) {
      for (let r = this.row; r < this.row + this.rowCount; r++) callback(r, -1);
      return;
    }
    const range = this.extent();
    this.sheet.suspendPaint();
    this.sheet.suspendCalcService();
    try {
      for (let r = range.row; r < range.row + range.rowCount; r++)
        for (let c = range.col; c < range.col + range.colCount; c++) callback(r, c);
    } finally {
      this.sheet.resumeCalcService();
      this.sheet.resumePaint();
    }
  }
  value(): unknown;
  value(value: unknown): this;
  value(value?: unknown): unknown {
    if (!arguments.length)
      return this.sheet.getValue(Math.max(0, this.row), Math.max(0, this.col), this.sheetArea);
    this._each((r, c) => this.sheet.setValue(r, c, value, this.sheetArea));
    return this;
  }
  text(): string;
  text(value: string): this;
  text(value?: string): string | this {
    if (value === undefined)
      return this.sheet.getText(Math.max(0, this.row), Math.max(0, this.col), this.sheetArea);
    this._each((r, c) => this.sheet.setText(r, c, value, this.sheetArea));
    return this;
  }
  formula(): string | null;
  formula(value: string, autoAdjustReference?: boolean): this;
  formula(value?: string, autoAdjustReference = false): string | null | this {
    if (value === undefined)
      return this.sheet.getFormula(Math.max(0, this.row), Math.max(0, this.col), this.sheetArea);
    this._each((r, c) =>
      this.sheet.setFormula(
        r,
        c,
        autoAdjustReference
          ? adjustFormula(value, r - Math.max(0, this.row), c - Math.max(0, this.col))
          : value,
        this.sheetArea,
      ),
    );
    return this;
  }
  tag(): unknown;
  tag(value: unknown): this;
  tag(value?: unknown): unknown {
    if (!arguments.length)
      return this.sheet.getTag(Math.max(0, this.row), Math.max(0, this.col), this.sheetArea);
    this._each((r, c) => this.sheet.setTag(r, c, value, this.sheetArea));
    return this;
  }
  comment(): Comment | null;
  comment(value: Comment): this;
  comment(value?: Comment): Comment | null | this {
    if (value === undefined) return this.sheet.comments.get(Math.max(0, this.row), Math.max(0, this.col));
    this._each((r, c) => this.sheet.comments.add(r, c, value.text()));
    return this;
  }
  defaultValue(): unknown;
  defaultValue(value: unknown): this;
  defaultValue(value?: unknown): unknown {
    if (!arguments.length) return this.sheet.getDefaultValue(Math.max(0, this.row), Math.max(0, this.col));
    this._each((r, c) => this.sheet.setDefaultValue(r, c, value));
    return this;
  }
  altText(): unknown;
  altText(value: string): this;
  altText(value?: string): unknown {
    if (value === undefined)
      return this.sheet.getAltText(Math.max(0, this.row), Math.max(0, this.col), this.sheetArea);
    this._each((r, c) => this.sheet.setAltText(r, c, value, this.sheetArea));
    return this;
  }
  bindingPath(): string;
  bindingPath(value: string): this;
  bindingPath(value?: string): string | this {
    if (value === undefined) return this.sheet.getBindingPath(Math.max(0, this.row), Math.max(0, this.col));
    this._each((r, c) => this.sheet.setBindingPath(r, c, value));
    return this;
  }
  validator(): unknown;
  validator(value: unknown): this;
  validator(value?: unknown): unknown {
    if (!arguments.length)
      return this.sheet.getDataValidator(Math.max(0, this.row), Math.max(0, this.col), this.sheetArea);
    this._each((r, c) => this.sheet.setDataValidator(r, c, value, this.sheetArea));
    return this;
  }
  width(): number | undefined;
  width(value: number): this;
  width(value?: number): number | undefined | this {
    if (value === undefined) return this.sheet.getColumnWidth(Math.max(0, this.col), this.sheetArea);
    const range = this.extent();
    for (let c = range.col; c < range.col + range.colCount; c++)
      this.sheet.setColumnWidth(c, value, this.sheetArea);
    return this;
  }
  height(): number | undefined;
  height(value: number): this;
  height(value?: number): number | undefined | this {
    if (value === undefined) return this.sheet.getRowHeight(Math.max(0, this.row), this.sheetArea);
    const range = this.extent();
    for (let r = range.row; r < range.row + range.rowCount; r++)
      this.sheet.setRowHeight(r, value, this.sheetArea);
    return this;
  }
  visible(): boolean;
  visible(value: boolean): this;
  visible(value?: boolean): boolean | this {
    if (value === undefined)
      return this.row === -1
        ? this.sheet.getColumnVisible(Math.max(0, this.col), this.sheetArea)
        : this.sheet.getRowVisible(Math.max(0, this.row), this.sheetArea);
    const range = this.extent();
    if (this.row === -1) {
      for (let c = range.col; c < range.col + range.colCount; c++)
        this.sheet.setColumnVisible(c, value, this.sheetArea);
    } else
      for (let r = range.row; r < range.row + range.rowCount; r++)
        this.sheet.setRowVisible(r, value, this.sheetArea);
    return this;
  }
  resizable(): boolean;
  resizable(value: boolean): this;
  resizable(value?: boolean): boolean | this {
    if (value === undefined)
      return this.row === -1
        ? this.sheet.getColumnResizable(Math.max(0, this.col), this.sheetArea)
        : this.sheet.getRowResizable(Math.max(0, this.row), this.sheetArea);
    const range = this.extent();
    if (this.row === -1) {
      for (let c = range.col; c < range.col + range.colCount; c++)
        this.sheet.setColumnResizable(c, value, this.sheetArea);
    } else
      for (let r = range.row; r < range.row + range.rowCount; r++)
        this.sheet.setRowResizable(r, value, this.sheetArea);
    return this;
  }
  setStyle(value: Style): void {
    this._each((r, c) => this.sheet.setStyle(r, c, value, this.sheetArea), true);
  }
  setStyleName(value: string): void {
    this._each((r, c) => this.sheet.setStyleName(r, c, value, this.sheetArea), true);
  }
  setBorder(
    border: LineBorder,
    options: {
      all?: boolean;
      outline?: boolean;
      inside?: boolean;
      innerHorizontal?: boolean;
      innerVertical?: boolean;
      top?: boolean;
      left?: boolean;
      right?: boolean;
      bottom?: boolean;
    },
  ): void {
    const range = this.extent(),
      lastRow = range.row + range.rowCount - 1,
      lastCol = range.col + range.colCount - 1;
    this._each((r, c) => {
      if (
        options.all ||
        ((options.outline || options.top) && r === range.row) ||
        ((options.inside || options.innerHorizontal) && r > range.row)
      )
        this.sheet._setStyleProperty(r, c, 'borderTop', border, this.sheetArea);
      if (
        options.all ||
        ((options.outline || options.bottom) && r === lastRow) ||
        ((options.inside || options.innerHorizontal) && r < lastRow)
      )
        this.sheet._setStyleProperty(r, c, 'borderBottom', border, this.sheetArea);
      if (
        options.all ||
        ((options.outline || options.left) && c === range.col) ||
        ((options.inside || options.innerVertical) && c > range.col)
      )
        this.sheet._setStyleProperty(r, c, 'borderLeft', border, this.sheetArea);
      if (
        options.all ||
        ((options.outline || options.right) && c === lastCol) ||
        ((options.inside || options.innerVertical) && c < lastCol)
      )
        this.sheet._setStyleProperty(r, c, 'borderRight', border, this.sheetArea);
    });
  }
  setBorderRadius(value: string | undefined, _options: object = {}): void {
    this._each((r, c) => this.sheet._setStyleProperty(r, c, 'borderRadius', value, this.sheetArea));
  }
  clear(type: number): void {
    this.sheet.clear(this.row, this.col, this.rowCount, this.colCount, this.sheetArea, type);
  }
}
for (const key of styleProperties)
  Object.defineProperty(CellRange.prototype, key, {
    configurable: true,
    writable: true,
    value: function (this: CellRange, value?: unknown): unknown {
      if (!arguments.length) return this.sheet.getActualStyle(this.row, this.col, this.sheetArea)[key];
      this._each((r, c) => this.sheet._setStyleProperty(r, c, key, value, this.sheetArea), true);
      return this;
    },
  });
export function adjustFormula(formula: string, rows: number, columns: number): string {
  return formula
    .split(/("(?:[^"]|"")*")/)
    .map((part, i) =>
      i % 2
        ? part
        : part.replace(
            /(?<![\w.])([\$]?)([A-Za-z]{1,3})([\$]?)(\d+)(?![\w(])/g,
            (_all, ca: string, c: string, ra: string, r: string) => {
              let col = 0;
              for (const ch of c.toUpperCase()) col = col * 26 + ch.charCodeAt(0) - 64;
              col += ca ? 0 : columns;
              const row = Number(r) + (ra ? 0 : rows);
              if (col < 1 || row < 1) return '#REF!';
              let label = '';
              for (let n = col; n > 0; n = Math.floor((n - 1) / 26))
                label = String.fromCharCode(65 + ((n - 1) % 26)) + label;
              return `${ca}${label}${ra}${row}`;
            },
          ),
    )
    .join('');
}
for (const key of ['sheet', 'row', 'col', 'rowCount', 'colCount', 'sheetArea'])
  Object.defineProperty(CellRange.prototype, key, { value: undefined, writable: true, configurable: true });
