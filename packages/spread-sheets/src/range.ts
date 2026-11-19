import type { Worksheet } from './worksheet.js';
import { columnLabel } from './calc/parser.js';
import { Comment } from './comments.js';
import { GC } from './generated/enums.js';
import { LineBorder, Range, Style, styleProperties } from './primitives.js';
import { instanceProperties } from './not-implemented.js';
import { applyNamedCellTemplate } from './named-cell-templates.js';
import { applyFormatter } from './formatter.js';

interface Accessor {
  (): unknown;
  (value: unknown): CellRange;
}
export class CellRange {
  declare allowEditInCell: Accessor;
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
          ? this.sheet._translateFormula(value, r - Math.max(0, this.row), c - Math.max(0, this.col))
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
  /**
   * Serialises the range as an HTML table (`CellRange.toHtml`), following the
   * trial's output: one `<td>` per visible cell, `rowSpan`/`colSpan` for merged
   * cells, the cell's resolved style as an inline `style` attribute and the
   * sheet's gridline colour as the border of unstyled cells.
   * `headerOptions` only applies to whole-row/whole-column ranges;
   * `includeStyle` (default `true`) switches the inline styles off.
   */
  toHtml(headerOptions?: number, includeStyle = true): string {
    return rangeToHtml(this, headerOptions, includeStyle);
  }
  /** Applies a registered named cell template to every cell of the range. */
  applyNamedCellTemplate(name: string): void {
    applyNamedCellTemplate(this.sheet, name, this.row, this.col, this.rowCount, this.colCount, this.sheetArea);
  }
}
instanceProperties(CellRange, 'sheet', 'row', 'col', 'rowCount', 'colCount', 'sheetArea');

const AREAS = GC.Spread.Sheets.SheetArea;
const HEADERS = GC.Spread.Sheets.HeaderOptions;
const { viewport, rowHeader, colHeader } = AREAS;
const DECORATIONS = GC.Spread.Sheets.TextDecorationType;
/** Border width in points and CSS style per `LineStyle` value, as the trial emits them. */
const BORDER_CSS: [string, string][] = [
  ['undefined', 'none'],
  ['0.5', 'solid'],
  ['1', 'solid'],
  ['0.5', 'dashed'],
  ['0.5', 'dotted'],
  ['1.5', 'solid'],
  ['1.5', 'double'],
  ['0.5', 'dotted'],
  ['1', 'dashed'],
  ['0.5', 'dashed'],
  ['1', 'dashed'],
  ['0.5', 'dashed'],
  ['1', 'dashed'],
  ['1', 'dashed'],
];
const BORDER_EDGES = ['top', 'bottom', 'left', 'right'] as const;
const OPPOSITE: Record<string, string> = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };
/** Reference line box: Chromium rounds hhea ascent (1854), descent (434) and line gap (67) per 2048 em. */
function lineBoxHeight(px: number): number {
  const scale = px / 2048;
  return Math.round(1854 * scale) + Math.round(434 * scale) + Math.round(67 * scale);
}
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}
function fontPixels(style: Style): number {
  const value = String(style.fontSize ?? style.font ?? '14.6667px').match(/(\d+(?:\.\d+)?)\s*(pt|px)?/);
  const size = value ? Number(value[1]) : 14.6667;
  return value?.[2] === 'pt' ? (size * 4) / 3 : size;
}
function fontFamily(style: Style): string {
  if (typeof style.fontFamily === 'string' && style.fontFamily) return style.fontFamily;
  const match = String(style.font ?? '').match(/\s\S+$/);
  return match?.[0].trim() ?? 'Calibri';
}
function alignOf(align: unknown, value: unknown, text: string): string {
  const names = ['left', 'center', 'right', 'left', 'center', 'right', 'left'];
  if (typeof align === 'number' && align >= 0 && align < names.length && align !== 3) return names[align];
  if (text === '') return 'left';
  if (typeof value === 'boolean') return 'center';
  if (typeof value === 'number' || value instanceof Date) return 'right';
  return 'left';
}
function verticalOf(align: unknown): string {
  return align === 2 ? 'bottom' : align === 1 ? 'middle' : 'top';
}
/** Sums the sizes of `count` visible axis entries (`toHtml` draws each line 1px thinner). */
function extentSize(sheet: Worksheet, axis: 'row' | 'col', index: number, count: number, area: number): number {
  let total = 0;
  for (let i = index; i < index + count; i++) {
    const size = axis === 'row' ? sheet.getRowHeight(i, area) : sheet.getColumnWidth(i, area);
    if (size) total += size;
  }
  return Math.max(0, total - 1);
}

interface HtmlCell {
  /** `v` for a viewport cell, otherwise the header kind with its axis index. */
  row?: number;
  col?: number;
  header?: 'row' | 'col' | 'corner';
}

function rangeToHtml(range: CellRange, headerOptions: number | undefined, includeStyle: boolean): string {
  const sheet = range.sheet;
  const area = range.sheetArea;
  if (area === AREAS.corner) return '';
  const headers = headerOptions ?? HEADERS.noHeaders;
  const wholeRows = range.row === -1;
  const wholeColumns = range.col === -1;
  const rows: number[] = [];
  if (area !== colHeader) {
    const count = wholeRows ? sheet.getRowCount(viewport) : Math.max(0, range.rowCount);
    for (let i = 0; i < count; i++) {
      const index = wholeRows ? i : range.row + i;
      if (index < sheet.getRowCount(viewport) && sheet.getRowVisible(index, viewport)) rows.push(index);
    }
  }
  const cols: number[] = [];
  if (area !== rowHeader) {
    const count = wholeColumns ? sheet.getColumnCount(viewport) : Math.max(0, range.colCount);
    for (let i = 0; i < count; i++) {
      const index = wholeColumns ? i : range.col + i;
      if (index < sheet.getColumnCount(viewport) && sheet.getColumnVisible(index, viewport)) cols.push(index);
    }
  }
  const whole = wholeRows || wholeColumns;
  const withColumnHeaders = area === viewport && whole && (headers & HEADERS.columnHeaders) !== 0;
  const withRowHeaders = area === viewport && whole && (headers & HEADERS.rowHeaders) !== 0;
  const corner = withColumnHeaders && withRowHeaders && wholeRows && wholeColumns && headers === HEADERS.allHeaders;
  const lines: HtmlCell[][] = [];
  if (area === colHeader) lines.push(cols.map((col) => ({ header: 'col' as const, col })));
  else if (area === rowHeader) lines.push(...rows.map((row) => [{ header: 'row' as const, row }]));
  else {
    if (withColumnHeaders)
      lines.push([
        ...(corner ? [{ header: 'corner' as const }] : []),
        ...cols.map((col) => ({ header: 'col' as const, col })),
      ]);
    for (const row of rows)
      lines.push([
        ...(withRowHeaders ? [{ header: 'row' as const, row }] : []),
        ...cols.map((col) => ({ row, col })),
      ]);
  }
  const cells = lines.map((line) => line.map((cell) => htmlCell(sheet, area, cell, includeStyle)).filter(Boolean));
  return (
    '<table style="border-collapse: collapse">' +
    cells.map((line) => '<tr>' + line.join('') + '</tr>').join('') +
    '</table>'
  );
}

function htmlCell(sheet: Worksheet, area: number, cell: HtmlCell, includeStyle: boolean): string {
  if (cell.header === 'corner') return '<td></td>';
  const isHeader = cell.header === 'row' || cell.header === 'col';
  const rowIndex = cell.row ?? 0;
  const colIndex = cell.col ?? 0;
  const styleArea = cell.header === 'row' ? rowHeader : cell.header === 'col' ? colHeader : area;
  const style = sheet.getActualStyle(rowIndex, colIndex, styleArea);
  let span: { row: number; col: number; rowCount: number; colCount: number } | null = null;
  if (!isHeader) {
    const found = sheet.getSpan(rowIndex, colIndex, area);
    if (found && (found.row !== rowIndex || found.col !== colIndex)) return '';
    span = found;
  }
  const rowCount = span?.rowCount ?? 1;
  const colCount = span?.colCount ?? 1;
  let text = '';
  if (cell.header === 'row') text = String(sheet.getValue(rowIndex, 0, rowHeader) ?? rowIndex + 1);
  else if (cell.header === 'col') text = String(sheet.getValue(0, colIndex, colHeader) ?? columnLabel(colIndex));
  else text = sheet.getText(rowIndex, colIndex, area);
  const decoration = Number(style.textDecoration ?? 0);
  const marked = (decoration & DECORATIONS.underline) !== 0 ? `<u>${escapeHtml(text)}</u>` : escapeHtml(text);
  if (!includeStyle) return `<td>${marked}</td>`;
  const value = isHeader ? '' : sheet.getValue(rowIndex, colIndex, area);
  // Header cells: the labelled axis (row/col) is measured in the viewport band,
  // the header band supplies the thickness of the header itself.
  const height = extentSize(
    sheet,
    'row',
    cell.header === 'col' ? 0 : rowIndex,
    cell.header === 'col' ? 1 : rowCount,
    cell.header === 'col' ? colHeader : viewport,
  );
  const width = extentSize(
    sheet,
    'col',
    cell.header === 'row' ? 0 : colIndex,
    cell.header === 'row' ? 1 : colCount,
    cell.header === 'row' ? rowHeader : viewport,
  );
  const font = fontPixels(style);
  const parts: string[] = ['padding: 0; '];
  // The trial lets the cell's formatter override the text colour: a format (or a
  // `FormatterBase` subclass) that reports a conditional colour wins over
  // `foreColor`, which is how `[Red]0.0;[Blue]-0.0` cells and custom formatters
  // come out with their own colour in `toHtml`.
  const formatted: { conditionalForeColor?: string } = {};
  if (!isHeader && value != null) applyFormatter(sheet.getFormatter(rowIndex, colIndex, area), value, formatted);
  const foreColor = formatted.conditionalForeColor ?? style.foreColor;
  if (style.backColor != null) parts.push(`background-color: ${style.backColor}; `);
  if (foreColor != null) parts.push(`color: ${foreColor}; `);
  const fontStyleText = String(style.fontStyle ?? '');
  const modifiers =
    (fontStyleText === 'italic' || fontStyleText === 'oblique' ? 'italic ' : '') +
    (style.fontWeight === 'bold' || Number(style.fontWeight) >= 600 ? 'bold ' : '');
  parts.push(
    `font: ${modifiers}${(font * 0.75).toFixed(2)}pt ${fontFamily(style)}, 'Helvetica Neue', Arial, sans-serif; `,
  );
  parts.push(style.wordWrap ? 'word-wrap: break-word; white-space: break-spaces; ' : 'white-space: nowrap; ');
  parts.push(`vertical-align: ${verticalOf(style.vAlign)}; `);
  parts.push(`text-align: ${alignOf(style.hAlign, value, text)}; `);
  const borders: Record<string, LineBorder | undefined> = {};
  for (const edge of BORDER_EDGES)
    borders[edge] = style[
      `border${edge[0].toUpperCase()}${edge.slice(1)}` as 'borderTop' | 'borderBottom' | 'borderLeft' | 'borderRight'
    ] as LineBorder | undefined;
  for (const edge of ['left', 'right', 'top', 'bottom']) {
    const border = borders[edge];
    if (!border) continue;
    const [weight, line] = BORDER_CSS[Number(border.style)] ?? BORDER_CSS[1];
    parts.push(`border-${edge}: ${weight}pt ${line} ${border.color}; `);
  }
  const header = isHeader;
  for (const edge of BORDER_EDGES) {
    if (borders[edge] || borders[OPPOSITE[edge]!]) continue;
    // Header cells always show their separators; the viewport follows the gridline options.
    const shown =
      header ||
      (edge === 'top' || edge === 'bottom'
        ? sheet.options.gridline.showHorizontalGridline
        : sheet.options.gridline.showVerticalGridline);
    if (!shown || (!header && style.backColor != null)) continue;
    parts.push(`border-${edge}: 1px solid ${header ? '#d4d4d4' : String(sheet.options.gridline.color)}; `);
  }
  parts.push(`overflow: hidden;height: ${height}px;line-height: ${Math.min(height, lineBoxHeight(font))}px; `);
  parts.push(`width: ${width}px;max-width: ${width}px;min-width: ${width}px;`);
  const attributes =
    (span && rowCount > 1 ? ` rowSpan=${rowCount}` : '') +
    (span && colCount > 1 ? ` colSpan=${colCount}` : '') +
    ' style="' +
    parts.join('') +
    '"';
  return `<td${attributes}>${marked}</td>`;
}
for (const key of styleProperties) {
  // The trial's CellRange does not expose the `apply*` merge flags as accessors (TASK 46 probe;
  // they are also absent from the d.ts CellRange contract).
  if (key.startsWith('apply')) continue;
  Object.defineProperty(CellRange.prototype, key, {
    configurable: true,
    writable: true,
    value: function (this: CellRange, value?: unknown): unknown {
      if (!arguments.length) return this.sheet.getActualStyle(this.row, this.col, this.sheetArea)[key];
      this._each((r, c) => this.sheet._setStyleProperty(r, c, key, value, this.sheetArea), true);
      return this;
    },
  });
}
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
