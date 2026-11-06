import { WorkbookRenderer, type Rect } from './rendering.js';
import { GC } from './generated/enums.js';
import { notImplemented } from './not-implemented.js';
import { AxisLayout, CellStore, DirtyGrid } from './structures.js';
import { clone, NameInfo, Range, Style } from './primitives.js';
import { adjustFormula, CellRange } from './range.js';
import { Events, EventHub, type EventHandler, type EventInfo } from './events.js';
import { GeneralFormatter } from './formatter.js';
import { Comment, CommentManager } from './comments.js';
import { CommandManager, UndoManager } from './commands.js';
import type { ICalcEngine } from './calc.js';
import {
  deserializeValue,
  list,
  mergeOptions,
  object,
  optionDifferences,
  serializeValue,
  styleFromJSON,
  styleToJSON,
  type JsonRecord,
} from './serialization.js';
import workbookDefaults from './workbook-defaults.json';
import worksheetDefaults from './worksheet-defaults.json';

const { SheetArea, StorageType, CopyToOptions, ValueType } = GC.Spread.Sheets;
const VIEW = SheetArea.viewport;
function coordinate(value: number, sentinel = false): void {
  if (!Number.isSafeInteger(value) || value < (sentinel ? -1 : 0))
    throw new RangeError('Cell coordinates must be non-negative safe integers');
}
function count(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new RangeError('Count must be a non-negative safe integer');
}
function defaultMetadata(): JsonRecord {
  return {
    users: [
      {
        id: `{${(
          globalThis.crypto?.randomUUID?.() ??
          'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
            const n = Math.floor(Math.random() * 16);
            return (c === 'x' ? n : (n & 3) | 8).toString(16);
          })
        ).toUpperCase()}}`,
        name: 'Guest',
        color: '#26A69A',
      },
    ],
    sheetTabCount: 0,
    namedPatterns: {},
    scenarioAdditionalInfo: { appliedScenarios: {}, baseValues: {} },
    dataManager: { tables: [], relationships: [] },
  };
}
interface CellData {
  value?: unknown;
  formula?: string;
  style?: Style | string;
  tag?: unknown;
  bindingPath?: string;
  defaultValue?: unknown;
  altText?: unknown;
  hyperlink?: unknown;
  validator?: unknown;
}
interface AreaData {
  cells: CellStore<CellData>;
  rowStyles: Map<number, Style | string>;
  colStyles: Map<number, Style | string>;
  defaultStyle: Style;
  spans: Range[];
  tag?: unknown;
}
interface DirtyCell {
  row: number;
  col: number;
  oldValue: unknown;
  newValue: unknown;
}
export interface SerializationOptions {
  ignoreStyle?: boolean;
  ignoreFormula?: boolean;
  [key: string]: unknown;
}
type LiveWorkbookOptions = Omit<
  typeof workbookDefaults,
  'backgroundImage' | 'grayAreaBackColor' | 'showHorizontalScrollbar' | 'showVerticalScrollbar' | 'customList'
> & {
  backgroundImage: string | null;
  grayAreaBackColor: string | null;
  showHorizontalScrollbar: boolean | 'auto';
  showVerticalScrollbar: boolean | 'auto';
  customList: string[][];
  font?: string | null;
  [key: string]: unknown;
};
export type WorkbookOptions = Partial<LiveWorkbookOptions> & { sheetCount?: number };
export type WorksheetOptions = typeof worksheetDefaults & {
  sheetTabColor?: string;
  selectionBackColor?: string;
  selectionBorderColor?: string;
  [key: string]: unknown;
};
class Batching {
  constructor(
    private suspended: () => boolean = () => false,
    private onDirty?: (layout: boolean) => void,
  ) {}
  paint = 0;
  calc = 0;
  dirty = false;
  layoutDirty = false;
  onInvalidate?: (layout: boolean) => void;
  invalidate(layout = false): void {
    this.dirty = true;
    this.layoutDirty ||= layout;
    this.onDirty?.(layout);
    if (!this.paint && !this.suspended()) this.flush();
  }
  flush(): void {
    if (!this.dirty || this.paint || this.suspended()) return;
    const layout = this.layoutDirty;
    this.dirty = false;
    this.layoutDirty = false;
    this.onInvalidate?.(layout);
  }
}

export class Worksheet {
  autoGenerateColumns = true;
  readonly options: WorksheetOptions;
  readonly defaults: {
    rowHeight: number;
    colWidth: number;
    colHeaderRowHeight: number;
    rowHeaderColWidth: number;
  };
  readonly comments = new CommentManager(this);
  private sheetName: string;
  private parent?: Workbook;
  private areas = new Map<number, AreaData>();
  private events = new EventHub(this);
  private batch = new Batching(
    () => this.parent?.isPaintSuspended() ?? false,
    (layout) => {
      if (layout) this.parent?.invalidateLayout();
      else this.parent?.repaint();
    },
  );
  private rows = new AxisLayout(200, 20);
  private cols = new AxisLayout(20, 62);
  private headerRows = new AxisLayout(1, 20);
  private headerCols = new AxisLayout(1, 40);
  private dimensions = { rowHeight: 20, colWidth: 62, colHeaderRowHeight: 20, rowHeaderColWidth: 40 };
  private selections = [new Range(0, 0, 1, 1)];
  private activeRow = 0;
  private activeCol = 0;
  private policy = 2;
  private unit = 0;
  private source: Record<string, unknown>[] | null = null;
  private boundColumns = new Map<number, { name: string; displayName?: string; size?: number }>();
  private settings: JsonRecord = {
    visible: 1,
    zoomFactor: 1,
    frozenRowCount: 0,
    frozenColCount: 0,
    frozenTrailingRowCount: 0,
    frozenTrailingColCount: 0,
    showRowOutline: true,
    showColumnOutline: true,
    topCellIndex: 0,
    leftCellIndex: 0,
  };
  private namedStyles = new Map<string, Style>();
  private names = new Map<string, NameInfo>();
  private dirty = new DirtyGrid();
  private dirtyDepth = 0;
  private calcEngine?: ICalcEngine;
  private calcQueue = new Map<
    string,
    { row: number; col: number; formula?: string | null; value?: unknown; kind: 'formula' | 'value' }
  >();
  private extraJSON: JsonRecord = {};

  constructor(name = 'Sheet1') {
    this.sheetName = name;
    this.options = new Proxy(clone(worksheetDefaults), {
      set: (target, key, value) => { Reflect.set(target, key, value); this.invalidateLayout(); return true; },
    });
    this.options.gridline = new Proxy(this.options.gridline, {
      set: (target, key, value) => { Reflect.set(target, key, value); this.invalidateLayout(); return true; },
    });
    this.defaults = new Proxy(this.dimensions, {
      set: (target, key, value) => {
        if (typeof value !== 'number' || !Number.isFinite(value) || value < 0)
          throw new RangeError('Invalid default dimension');
        Reflect.set(target, key, value);
        const axis =
          key === 'rowHeight'
            ? this.rows
            : key === 'colWidth'
              ? this.cols
              : key === 'colHeaderRowHeight'
                ? this.headerRows
                : this.headerCols;
        axis.defaultSize = value;
        this.invalidateLayout();
        return true;
      },
    });
  }
  _attach(parent?: Workbook): void {
    this.parent = parent;
  }
  getParent(): Workbook {
    return this.parent!;
  }
  name(): string;
  name(value: string): this;
  name(value?: string): string | this {
    if (value === undefined) return this.sheetName;
    if (!value || /[\[\]:*?\\/]/.test(value) || value.length > 31) throw new Error('Invalid worksheet name');
    const existing = this.parent?.getSheetFromName(value);
    if (existing && existing !== this) throw new Error('Worksheet name already exists');
    const old = this.sheetName;
    if (old === value) return this;
    const info = { sheet: this, oldValue: old, newValue: value, cancel: false };
    this._emit(Events.SheetNameChanging, info);
    if (info.cancel) return this;
    this.sheetName = value;
    this.batch.invalidate();
    this._emit(Events.SheetNameChanged, { sheet: this, oldValue: old, newValue: value });
    return this;
  }
  private area(area = VIEW): AreaData {
    let data = this.areas.get(area);
    if (!data) {
      const defaultStyle = new Style();
      defaultStyle.themeFont = 'Body';
      this.areas.set(
        area,
        (data = {
          cells: new CellStore(),
          rowStyles: new Map(),
          colStyles: new Map(),
          defaultStyle,
          spans: [],
        }),
      );
    }
    return data;
  }
  private cell(row: number, col: number, area = VIEW): CellData | undefined {
    return this.areas.get(area)?.cells.peek(row, col);
  }
  private ensure(row: number, col: number, area = VIEW): CellData {
    const data = this.area(area);
    let cell = data.cells.get(row, col);
    if (!cell) data.cells.set(row, col, (cell = {}));
    return cell;
  }
  private prune(row: number, col: number, area = VIEW): void {
    const cell = this.areas.get(area)?.cells.peek(row, col);
    if (cell && !Object.keys(cell).length) this.area(area).cells.set(row, col, undefined);
  }
  getValue(row: number, col: number, area = VIEW, valueType = ValueType.normal): unknown {
    coordinate(row);
    coordinate(col);
    if (valueType !== ValueType.normal) notImplemented('GC.Spread.Sheets.Worksheet.getValue(valueType)');
    return this.areas.get(area)?.cells.getValue(row, col) ?? null;
  }
  setValue(row: number, col: number, value: unknown, area = VIEW, ignoreRecalc = false): void {
    coordinate(row);
    coordinate(col);
    const data = this.area(area), oldValue = data.cells.getValue(row, col) ?? null;
    const cell = data.cells.peek(row, col), oldFormula = cell?.formula;
    if (cell) delete cell.formula;
    data.cells.setValue(row, col, value);
    if (area === VIEW && this.source?.[row] && this.boundColumns.has(col)) this.source[row][this.boundColumns.get(col)!.name] = value;
    if (cell) this.prune(row, col, area);
    if (!Object.is(oldValue, value ?? null) || oldFormula !== undefined) {
      if (area === VIEW) this.markDirty(row, col, oldValue, value ?? null);
      if (!ignoreRecalc && area === VIEW && this.calcEngine) this.queueCalc({ kind: 'value', row, col, value });
      this.changed(row, col, area, 'value', oldValue, value ?? null);
    }
  }
  getText(row: number, col: number, area = VIEW): string {
    if (this.options.showFormulas && this.getFormula(row, col, area))
      return '=' + this.getFormula(row, col, area);
    const value = this.getValue(row, col, area);
    if (value == null) return '';
    if (value === 0 && !this.options.showZeros) return '';
    if (value && typeof value === 'object' && 'richText' in value)
      return list(value.richText)
        .map((x) => String(object(x).text ?? ''))
        .join('');
    const formatter = this.getFormatter(row, col, area);
    return (
      formatter instanceof GeneralFormatter
        ? formatter
        : new GeneralFormatter(typeof formatter === 'string' ? formatter : 'General')
    ).format(value);
  }
  setText(row: number, col: number, value: string, area = VIEW): void {
    const formatter = this.getFormatter(row, col, area);
    const parsed = (
      formatter instanceof GeneralFormatter
        ? formatter
        : new GeneralFormatter(typeof formatter === 'string' ? formatter : 'General')
    ).parse(value);
    this.setValue(row, col, parsed ?? value, area);
  }
  getFormula(row: number, col: number, area = VIEW): string | null {
    coordinate(row);
    coordinate(col);
    return this.areas.get(area)?.cells.peek(row, col)?.formula ?? null;
  }
  setFormula(row: number, col: number, value: string | null, area = VIEW): void {
    coordinate(row);
    coordinate(col);
    const cell = this.ensure(row, col, area),
      old = cell.formula ?? null,
      oldValue = cell.value;
    if (value) {
      cell.formula = value.replace(/^=/, '');
      delete cell.value;
    } else {
      delete cell.formula;
      delete cell.value;
    }
    this.prune(row, col, area);
    if (old !== (cell.formula ?? null)) {
      if (area === VIEW) this.markDirty(row, col, oldValue, null);
      this.queueCalc({ kind: 'formula', row, col, formula: cell.formula ?? null });
      this.changed(row, col, area, 'formula', old, value);
    }
  }
  _setCalcEngine(engine?: ICalcEngine): void {
    this.calcEngine = engine;
  }
  _setCalculatedValue(row: number, col: number, value: unknown, area = VIEW): void {
    const oldValue = this.getValue(row, col, area);
    this.ensure(row, col, area).value = value;
    if (area === VIEW) this.dirty.update(row, col, value);
    if (!Object.is(oldValue, value)) {
      this.parent?._renderer()?.invalidateCell(row, col);
      this._emit(Events.ValueChanged, {
        sheet: this,
        sheetName: this.sheetName,
        row,
        col,
        oldValue,
        newValue: value,
      });
      this.batch.invalidate();
    }
  }
  private queueCalc(change: {
    kind: 'formula' | 'value';
    row: number;
    col: number;
    formula?: string | null;
    value?: unknown;
  }): void {
    if (!this.calcEngine) return;
    this.calcQueue.set(`${change.row}:${change.col}`, change);
    if (!this.batch.calc && !this.parent?._isCalcSuspended()) this.flushCalc();
  }
  private flushCalc(all = false): void {
    if (this.batch.calc || this.parent?._isCalcSuspended()) return;
    const queue = [...this.calcQueue.values()];
    this.calcQueue.clear();
    if (!this.calcEngine) return;
    for (const change of queue)
      if (change.kind === 'formula')
        this.calcEngine.formulaChanged(this, change.row, change.col, change.formula ?? null);
      else this.calcEngine.valueChanged?.(this, change.row, change.col, change.value);
    if (queue.length || all) this.calcEngine.recalculate(this, all);
  }
  getDataSource(): Record<string, unknown>[] | null { return this.source; }
  setDataSource(data: Record<string, unknown>[] | null, reset = true): void {
    if (data !== null && !Array.isArray(data)) notImplemented('Worksheet.setDataSource(non-array)');
    this.source = data;
    if (reset && data) this.setRowCount(data.length);
    if (data && this.autoGenerateColumns && !this.boundColumns.size) this.bindColumns(Object.keys(data[0] ?? {}).map(name => ({ name })));
    this.loadBinding();
  }
  bindColumn(index: number, column: string | { name: string; displayName?: string; size?: number }): void {
    this.boundColumns.set(index, typeof column === 'string' ? { name: column } : column); this.loadBinding();
  }
  bindColumns(columns: { name: string; displayName?: string; size?: number }[]): void {
    this.boundColumns.clear(); columns.forEach((column, index) => this.boundColumns.set(index, column));
    this.setColumnCount(columns.length); this.loadBinding();
  }
  private loadBinding(): void {
    this.suspendPaint(); this.suspendDirty();
    try { for (const [col, column] of this.boundColumns) {
      this.setValue(0, col, column.displayName ?? column.name, SheetArea.colHeader);
      if (column.size !== undefined) this.setColumnWidth(col, column.size);
      this.source?.forEach((item, row) => this.setValue(row, col, item[column.name]));
    } } finally { this.resumeDirty(); this.resumePaint(); }
  }
  getArray(row: number, col: number, rowCount: number, colCount: number, getFormula = false): unknown[][] {
    count(rowCount);
    count(colCount);
    return Array.from({ length: rowCount }, (_, r) =>
      Array.from({ length: colCount }, (_, c) =>
        getFormula ? this.getFormula(row + r, col + c) : this.getValue(row + r, col + c),
      ),
    );
  }
  setArray(row: number, col: number, array: unknown[][], setFormula = false): void {
    this.suspendCalcService();
    this.suspendPaint();
    try {
      array.forEach((values, r) =>
        values?.forEach((value, c) => {
          if (setFormula) this.setFormula(row + r, col + c, value == null ? null : String(value));
          else this.setValue(row + r, col + c, value);
        }),
      );
    } finally {
      this.resumeCalcService();
      this.resumePaint();
    }
  }
  getCell(row: number, col: number, area = VIEW): CellRange {
    return new CellRange(this, row, col, 1, 1, area);
  }
  getRange(row: number, col: number, rowCount?: number, colCount?: number, area?: number): CellRange;
  getRange(address: string, area?: number): CellRange;
  getRange(row: number | string, col = 0, rowCount = 1, colCount = 1, area = VIEW): CellRange {
    if (typeof row === 'string') {
      const address = row.replace(/^.*!/, '').replace(/\$/g, '');
      const [start, end = start] = address.split(':');
      const parse = (part: string): [number, number] => {
        const match = part.match(/^([A-Za-z]*)(\d*)$/);
        if (!match || !part) throw new Error('Invalid range address');
        let c = 0;
        for (const ch of match[1].toUpperCase()) c = c * 26 + ch.charCodeAt(0) - 64;
        return [match[2] ? Number(match[2]) - 1 : -1, match[1] ? c - 1 : -1];
      };
      const [r, c] = parse(start),
        [er, ec] = parse(end);
      return new CellRange(this, r, c, r < 0 ? -1 : er - r + 1, c < 0 ? -1 : ec - c + 1, col || VIEW);
    }
    return new CellRange(this, row, col, rowCount, colCount, area);
  }
  getStyle(row: number, col: number, area = VIEW): Style | null {
    coordinate(row, true);
    coordinate(col, true);
    if (row === -1 && col === -1) return this.getDefaultStyle(area);
    const data = this.areas.get(area);
    const style =
      row === -1 && col === -1
        ? data?.defaultStyle
        : row === -1
          ? data?.colStyles.get(col)
          : col === -1
            ? data?.rowStyles.get(row)
            : this.cell(row, col, area)?.style;
    return typeof style === 'string' ? Object.assign(new Style(), { parentName: style }) : (style ?? null);
  }
  setStyle(row: number, col: number, style: Style | null, area = VIEW): void {
    coordinate(row, true);
    coordinate(col, true);
    const data = this.area(area),
      old = this.getStyle(row, col, area);
    if (row === -1 && col === -1) data.defaultStyle = style ?? new Style();
    else if (row === -1 || col === -1) {
      const map = row === -1 ? data.colStyles : data.rowStyles,
        index = row === -1 ? col : row;
      if (style) map.set(index, style);
      else map.delete(index);
    } else {
      const cell = this.ensure(row, col, area);
      if (style) cell.style = style;
      else delete cell.style;
      this.prune(row, col, area);
    }
    this.changed(row, col, area, '[styleinfo]', old ?? undefined, style ?? undefined);
  }
  getDefaultStyle(area = VIEW): Style {
    const style = this.area(area).defaultStyle;
    for (const [key, value] of Object.entries({ hAlign: 3, vAlign: 0, imeMode: 1 }))
      if (style[key] === undefined)
        Object.defineProperty(style, key, {
          configurable: true,
          enumerable: false,
          get: () => value,
          set(next: unknown) {
            Object.defineProperty(this, key, {
              value: next,
              writable: true,
              enumerable: true,
              configurable: true,
            });
          },
        });
    return style;
  }
  setDefaultStyle(style: Style, area = VIEW): void {
    this.setStyle(-1, -1, style, area);
  }
  getActualStyle(row: number, col: number, area = VIEW, _sheetStyleOnly = false): Style {
    const data = this.area(area);
    const result = Object.assign(new Style(), {
      hAlign: 3,
      vAlign: 0,
      font: this.parent?.options.font ?? '14.6667px Calibri',
      themeFont: 'Body',
      locked: true,
      hidden: false,
      imeMode: 1,
    });
    const resolve = (style: Style | string | undefined, seen = new Set<string>()): JsonRecord => {
      if (!style) return {};
      const parentName =
        typeof style === 'string'
          ? style
          : typeof style.parentName === 'string'
            ? style.parentName
            : undefined;
      let parent: JsonRecord = {};
      if (parentName && !seen.has(parentName.toLowerCase())) {
        seen.add(parentName.toLowerCase());
        parent = resolve(this.getNamedStyle(parentName) ?? this.parent?.getNamedStyle(parentName), seen);
      }
      return {
        ...parent,
        ...(typeof style === 'string'
          ? {}
          : Object.fromEntries(Object.entries(style).filter(([, v]) => v !== undefined))),
      };
    };
    for (const style of [
      data.defaultStyle,
      data.colStyles.get(col),
      data.rowStyles.get(row),
      this.cell(row, col, area)?.style,
    ])
      Object.assign(result, resolve(style));
    return result;
  }
  setStyleName(row: number, col: number, name: string, area = VIEW): void {
    if (row === -1) this.area(area).colStyles.set(col, name);
    else if (col === -1) this.area(area).rowStyles.set(row, name);
    else this.ensure(row, col, area).style = name;
    this.changed(row, col, area, 'styleName', undefined, name);
  }
  getStyleName(row: number, col: number, area = VIEW): string | null {
    const style = this.getStyle(row, col, area);
    return typeof style?.parentName === 'string' ? style.parentName : null;
  }
  _setStyleProperty(row: number, col: number, property: string, value: unknown, area = VIEW): void {
    const style = this.getStyle(row, col, area) ?? new Style();
    const oldValue = this.getActualStyle(row, col, area)[property];
    style[property] = value;
    const data = this.area(area);
    if (row === -1 && col === -1) data.defaultStyle = style;
    else if (row === -1) data.colStyles.set(col, style);
    else if (col === -1) data.rowStyles.set(row, style);
    else this.ensure(row, col, area).style = style;
    this.changed(row, col, area, property, oldValue, value);
  }
  getFormatter(row: number, col: number, area = VIEW): unknown {
    return this.getActualStyle(row, col, area).formatter;
  }
  setFormatter(row: number, col: number, value: string | GeneralFormatter, area = VIEW): void {
    this._setStyleProperty(row, col, 'formatter', value, area);
  }
  getCellType(row: number, col: number, area = VIEW): unknown {
    return this.getActualStyle(row, col, area).cellType;
  }
  setCellType(row: number, col: number, value: unknown, area = VIEW): void {
    this._setStyleProperty(row, col, 'cellType', value, area);
  }
  getDataValidator(row: number, col: number, area = VIEW): unknown {
    return this.cell(row, col, area)?.validator;
  }
  setDataValidator(row: number, col: number, value: unknown, area?: number): void;
  setDataValidator(
    row: number,
    col: number,
    rowCount: number,
    colCount: number,
    value: unknown,
    area?: number,
  ): void;
  setDataValidator(
    row: number,
    col: number,
    third: unknown,
    fourth = VIEW,
    fifth?: unknown,
    sixth = VIEW,
  ): void {
    const ranged = arguments.length >= 5;
    const rows = ranged ? Number(third) : 1,
      cols = ranged ? fourth : 1,
      value = ranged ? fifth : third,
      area = ranged ? sixth : fourth;
    for (let r = row; r < row + rows; r++)
      for (let c = col; c < col + cols; c++) this.ensure(r, c, area).validator = value;
  }
  getTag(row: number, col: number, area = VIEW): unknown {
    return this.cell(row, col, area)?.tag;
  }
  setTag(row: number, col: number, value: unknown, area = VIEW): void {
    const cell = this.ensure(row, col, area);
    if (value === undefined) delete cell.tag;
    else cell.tag = value;
    this.prune(row, col, area);
  }
  tag(): unknown;
  tag(value: unknown): this;
  tag(value?: unknown): unknown {
    if (!arguments.length) return this.area().tag;
    this.area().tag = value;
    return this;
  }
  getDefaultValue(row: number, col: number): unknown {
    return this.cell(row, col)?.defaultValue;
  }
  setDefaultValue(row: number, col: number, value: unknown): void {
    this.ensure(row, col).defaultValue = value;
  }
  getBindingPath(row: number, col: number): string {
    return this.cell(row, col)?.bindingPath ?? '';
  }
  setBindingPath(row: number, col: number, value: string): this {
    this.ensure(row, col).bindingPath = value;
    return this;
  }
  getAltText(row: number, col: number, area = VIEW): unknown {
    return this.cell(row, col, area)?.altText;
  }
  setAltText(row: number, col: number, value: string, area = VIEW): void {
    this.ensure(row, col, area).altText = value;
  }
  _rowLayout(area = VIEW): AxisLayout {
    return area === SheetArea.colHeader ? this.headerRows : this.rows;
  }
  _columnLayout(area = VIEW): AxisLayout {
    return area === SheetArea.rowHeader ? this.headerCols : this.cols;
  }
  getRowCount(area = VIEW): number {
    return area === SheetArea.corner ? 0 : this._rowLayout(area).count;
  }
  getColumnCount(area = VIEW): number {
    return area === SheetArea.corner ? 0 : this._columnLayout(area).count;
  }
  rowCount(): number;
  rowCount(value: number, area?: number): this;
  rowCount(value?: number, area = VIEW): number | this {
    if (value === undefined) return this.getRowCount(area);
    this.setRowCount(value, area);
    return this;
  }
  columnCount(): number;
  columnCount(value: number, area?: number): this;
  columnCount(value?: number, area = VIEW): number | this {
    if (value === undefined) return this.getColumnCount(area);
    this.setColumnCount(value, area);
    return this;
  }
  setRowCount(value: number, area = VIEW, guardContent?: number): void {
    this.resize('row', value, area, guardContent);
  }
  setColumnCount(value: number, area = VIEW, guardContent?: number): void {
    this.resize('col', value, area, guardContent);
  }
  private resize(axis: 'row' | 'col', value: number, area: number, guardContent?: number): void {
    count(value);
    if (guardContent) notImplemented('Worksheet.setCount(guardContent)');
    const layout = axis === 'row' ? this._rowLayout(area) : this._columnLayout(area),
      old = layout.count;
    if (value < old) this.shift(axis, value, old - value, area, true, false);
    else layout.resize(value);
    this.invalidateLayout();
  }
  getRowHeight(row: number, area = VIEW, getDynamicSize = false): number | undefined {
    coordinate(row);
    return getDynamicSize ? undefined : this._rowLayout(area).getSize(row);
  }
  setRowHeight(row: number, value: number | string, area = VIEW): void {
    this.setDimension('row', row, value, area);
  }
  getColumnWidth(col: number, area = VIEW, getDynamicSize = false): number | undefined {
    coordinate(col);
    return getDynamicSize ? undefined : this._columnLayout(area).getSize(col);
  }
  setColumnWidth(col: number, value: number | string, area = VIEW): void {
    this.setDimension('col', col, value, area);
  }
  private setDimension(axis: 'row' | 'col', index: number, value: number | string, area: number): void {
    coordinate(index, true);
    if (typeof value === 'string') notImplemented('Worksheet dynamic row/column sizes');
    if (!Number.isFinite(value) || value < 0) throw new RangeError('Invalid row height or column width');
    if (index === -1) {
      if (axis === 'row') {
        if (area === SheetArea.colHeader) this.defaults.colHeaderRowHeight = value;
        else this.defaults.rowHeight = value;
      } else if (area === SheetArea.rowHeader) this.defaults.rowHeaderColWidth = value;
      else this.defaults.colWidth = value;
      return;
    }
    const layout = axis === 'row' ? this._rowLayout(area) : this._columnLayout(area),
      oldValue = layout.getStoredSize(index) ?? null;
    layout.setSize(index, value);
    this.axisChanged(axis, index, area, axis === 'row' ? 'height' : 'width', oldValue, value);
  }
  getRowVisible(row: number, area = VIEW): boolean {
    return this._rowLayout(area).isVisible(row);
  }
  setRowVisible(row: number, value: boolean, area = VIEW): void {
    const layout = this._rowLayout(area),
      old = layout.isVisible(row);
    layout.setVisible(row, value);
    this.axisChanged('row', row, area, 'isVisible', old, value);
  }
  getColumnVisible(col: number, area = VIEW): boolean {
    return this._columnLayout(area).isVisible(col);
  }
  setColumnVisible(col: number, value: boolean, area = VIEW): void {
    const layout = this._columnLayout(area),
      old = layout.isVisible(col);
    layout.setVisible(col, value);
    this.axisChanged('col', col, area, 'isVisible', old, value);
  }
  getRowResizable(row: number, area = VIEW): boolean {
    return this.axisMetadata('row', area).get(row)?.resizable !== false;
  }
  setRowResizable(row: number, value: boolean, area = VIEW): void {
    this.setAxisMetadata('row', row, area, 'resizable', value);
  }
  getColumnResizable(col: number, area = VIEW): boolean {
    return this.axisMetadata('col', area).get(col)?.resizable !== false;
  }
  setColumnResizable(col: number, value: boolean, area = VIEW): void {
    this.setAxisMetadata('col', col, area, 'resizable', value);
  }
  private metadata = new Map<AxisLayout, Map<number, JsonRecord>>();
  private axisMetadata(axis: 'row' | 'col', area: number): Map<number, JsonRecord> {
    const layout = axis === 'row' ? this._rowLayout(area) : this._columnLayout(area);
    let map = this.metadata.get(layout);
    if (!map) this.metadata.set(layout, (map = new Map()));
    return map;
  }
  private setAxisMetadata(
    axis: 'row' | 'col',
    index: number,
    area: number,
    property: string,
    value: unknown,
  ): void {
    const map = this.axisMetadata(axis, area);
    map.set(index, { ...map.get(index), [property]: value });
  }
  addRows(row: number, count: number, area = VIEW): void {
    this.shift('row', row, count, area, false);
  }
  deleteRows(row: number, count: number, area = VIEW): void {
    this.shift('row', row, count, area, true);
  }
  addColumns(col: number, count: number, area = VIEW): void {
    this.shift('col', col, count, area, false);
  }
  deleteColumns(col: number, count: number, area = VIEW): void {
    this.shift('col', col, count, area, true);
  }
  private shift(
    axis: 'row' | 'col',
    index: number,
    amount: number,
    area: number,
    remove: boolean,
    emit = true,
  ): void {
    coordinate(index);
    count(amount);
    const layout = axis === 'row' ? this._rowLayout(area) : this._columnLayout(area),
      old = layout.count;
    if (index > old || (remove && index + amount > old)) throw new RangeError('Invalid structural change');
    if (!amount) return;
    const property = `${remove ? 'delete' : 'add'}${axis === 'row' ? 'Rows' : 'Columns'}`;
    const changing = this.axisInfo(axis, index, area, property, old, amount, amount);
    changing.cancel = false;
    this._emit(axis === 'row' ? Events.RowChanging : Events.ColumnChanging, changing);
    if (changing.cancel) return;
    const translate = (i: number) =>
      remove && i >= index && i < index + amount
        ? -1
        : i >= index + (remove ? amount : 0)
          ? i + (remove ? -amount : amount)
          : i;
    for (const [id, data] of this.areas) {
      if ((axis === 'row' ? this._rowLayout(id) : this._columnLayout(id)) !== layout) continue;
      data.cells.shift(axis, index, amount, remove);
      const styles = axis === 'row' ? data.rowStyles : data.colStyles;
      const next = new Map([...styles].map(([i, s]) => [translate(i), s] as const).filter(([i]) => i >= 0));
      if (axis === 'row') data.rowStyles = next;
      else data.colStyles = next;
      data.spans = data.spans.flatMap((span) => {
        const start = axis === 'row' ? span.row : span.col,
          size = axis === 'row' ? span.rowCount : span.colCount;
        let nextStart = start,
          nextSize = size;
        if (remove) {
          const end = start + size,
            removed = Math.max(0, Math.min(end, index + amount) - Math.max(start, index));
          nextSize -= removed;
          nextStart = start >= index + amount ? start - amount : start >= index ? index : start;
        } else if (index <= start) nextStart += amount;
        else if (index < start + size) nextSize += amount;
        if (nextSize <= 0) return [];
        return [
          new Range(
            axis === 'row' ? nextStart : span.row,
            axis === 'col' ? nextStart : span.col,
            axis === 'row' ? nextSize : span.rowCount,
            axis === 'col' ? nextSize : span.colCount,
          ),
        ];
      });
    }
    const meta = this.metadata.get(layout);
    if (meta)
      this.metadata.set(
        layout,
        new Map([...meta].map(([i, v]) => [translate(i), v] as const).filter(([i]) => i >= 0)),
      );
    layout.shift(index, amount, remove);
    if (layout === (axis === 'row' ? this.rows : this.cols)) {
      this.dirty.shift(axis, index, amount, remove);
      this.comments._shift(axis, index, amount, remove);
    }
    if (emit) this.axisChanged(axis, index, area, property, old, amount, amount);
    else this.invalidateLayout();
  }
  addSpan(row: number, col: number, rowCount: number, colCount: number, area = VIEW): void {
    coordinate(row);
    coordinate(col);
    count(rowCount);
    count(colCount);
    if (!rowCount || !colCount) return;
    const span = new Range(row, col, rowCount, colCount),
      spans = this.area(area).spans;
    if (spans.some((s) => s.intersect(row, col, rowCount, colCount))) throw new Error('Overlapping spans');
    spans.push(span);
    this.batch.invalidate(true);
  }
  addSpans(spans: Range[], area = VIEW): void {
    for (const span of spans) this.addSpan(span.row, span.col, span.rowCount, span.colCount, area);
  }
  removeSpan(row: number, col: number, area = VIEW): void {
    const data = this.area(area);
    data.spans = data.spans.filter((span) => span.row !== row || span.col !== col);
    this.batch.invalidate(true);
  }
  getSpan(row: number, col: number, area = VIEW): Range | null {
    return this.area(area).spans.find((s) => s.contains(row, col)) ?? null;
  }
  getSpans(range?: Range, area = VIEW): Range[] {
    return this.area(area)
      .spans.filter((s) => !range || s.intersect(range.row, range.col, range.rowCount, range.colCount))
      .map((s) => new Range(s.row, s.col, s.rowCount, s.colCount));
  }
  frozenRowCount(): number;
  frozenRowCount(value: number, topRow?: number): void;
  frozenRowCount(value?: number, topRow = 0): number | void {
    if (value === undefined) return Number(this.settings.frozenRowCount);
    count(value);
    this.settings.frozenRowCount = value;
    this.settings.topCellIndex = topRow + value;
    this.invalidateLayout();
  }
  frozenColumnCount(): number;
  frozenColumnCount(value: number, leftCol?: number): void;
  frozenColumnCount(value?: number, leftCol = 0): number | void {
    if (value === undefined) return Number(this.settings.frozenColCount);
    count(value);
    this.settings.frozenColCount = value;
    this.settings.leftCellIndex = leftCol + value;
    this.invalidateLayout();
  }
  frozenTrailingRowCount(): number;
  frozenTrailingRowCount(value: number, stickToEdge?: boolean): void;
  frozenTrailingRowCount(value?: number, stickToEdge?: boolean): number | void {
    if (value === undefined) return Number(this.settings.frozenTrailingRowCount);
    count(value);
    this.settings.frozenTrailingRowCount = value;
    if (stickToEdge !== undefined) this.settings.frozenTrailingRowStickToEdge = stickToEdge;
    this.invalidateLayout();
  }
  frozenTrailingColumnCount(): number;
  frozenTrailingColumnCount(value: number, stickToEdge?: boolean): void;
  frozenTrailingColumnCount(value?: number, stickToEdge?: boolean): number | void {
    if (value === undefined) return Number(this.settings.frozenTrailingColCount);
    count(value);
    this.settings.frozenTrailingColCount = value;
    if (stickToEdge !== undefined) this.settings.frozenTrailingColumnStickToEdge = stickToEdge;
    this.invalidateLayout();
  }
  showRowOutline(): boolean;
  showRowOutline(value: boolean): this;
  showRowOutline(value?: boolean): boolean | this {
    if (value === undefined) return Boolean(this.settings.showRowOutline);
    this.settings.showRowOutline = value;
    return this;
  }
  showColumnOutline(): boolean;
  showColumnOutline(value: boolean): this;
  showColumnOutline(value?: boolean): boolean | this {
    if (value === undefined) return Boolean(this.settings.showColumnOutline);
    this.settings.showColumnOutline = value;
    return this;
  }
  visible(): number;
  visible(value: number | boolean): this;
  visible(value?: number | boolean): number | this {
    if (value === undefined) return Number(this.settings.visible);
    const old = this.settings.visible,
      next = value === true ? 1 : value === false ? 0 : value;
    const info = {
      sheetName: this.sheetName,
      sheetIndex: this.parent?.getSheetIndex(this.sheetName) ?? -1,
      propertyName: 'visible',
      oldValue: old,
      newValue: next,
      cancel: false,
    };
    this._emit(Events.SheetChanging, info);
    if (!info.cancel) {
      this.settings.visible = next;
      this.invalidateLayout();
      this._emit(Events.SheetChanged, info);
    }
    return this;
  }
  zoom(): number;
  zoom(value: number): this;
  zoom(value?: number): number | this {
    if (value === undefined) return Number(this.settings.zoomFactor);
    if (value < 0.1 || value > 4 || !Number.isFinite(value))
      throw new RangeError('Zoom must be between 0.1 and 4');
    this.settings.zoomFactor = value;
    this.invalidateLayout();
    return this;
  }
  tabColor(): string | undefined;
  tabColor(value: string): this;
  tabColor(value?: string): string | undefined | this {
    if (value === undefined) return this.options.sheetTabColor;
    this.options.sheetTabColor = value;
    this.batch.invalidate();
    return this;
  }
  getSelections(): Range[] {
    return this.selections.map((s) => new Range(s.row, s.col, s.rowCount, s.colCount));
  }
  setSelection(row: number, col: number, rowCount: number, colCount: number): void {
    if (!this.updateSelections([new Range(row, col, rowCount, colCount)])) return;
    this.activeRow = Math.max(0, row);
    this.activeCol = Math.max(0, col);
    this.parent?._renderer()?.schedule();
  }
  addSelection(row: number, col: number, rowCount: number, colCount: number): void {
    this.updateSelections([...this.selections, new Range(row, col, rowCount, colCount)]);
  }
  clearSelection(): void {
    this.updateSelections([]);
  }
  private updateSelections(selections: Range[]): boolean {
    const info = {
      sheet: this,
      sheetName: this.sheetName,
      oldSelections: this.getSelections(),
      newSelections: selections,
      cancel: false,
    };
    this._emit(Events.SelectionChanging, info);
    if (info.cancel) return false;
    this.selections = selections;
    this._emit(Events.SelectionChanged, {
      sheet: this,
      sheetName: this.sheetName,
      oldSelections: info.oldSelections,
      newSelections: this.getSelections(),
    });
    this.batch.invalidate();
    return true;
  }
  getActiveRowIndex(): number {
    return this.activeRow;
  }
  getActiveColumnIndex(): number {
    return this.activeCol;
  }
  setActiveCell(row: number, col: number): void {
    coordinate(row);
    coordinate(col);
    if (row === this.activeRow && col === this.activeCol) { this.updateSelections([new Range(row, col, 1, 1)]); return; }
    const info = {
      sheet: this,
      sheetName: this.sheetName,
      row: this.activeRow,
      col: this.activeCol,
      cancel: false,
    };
    this._emit(Events.LeaveCell, info);
    if (info.cancel) return;
    if (!this.updateSelections([new Range(row, col, 1, 1)])) return;
    this.activeRow = row;
    this.activeCol = col;
    this._emit(Events.EnterCell, { sheet: this, sheetName: this.sheetName, row, col });
  }
  clear(
    row: number,
    col: number,
    rowCount: number,
    colCount: number,
    area = VIEW,
    storageType = StorageType.data,
  ): void {
    const range = new Range(row, col, rowCount, colCount).normalized(
        this.getRowCount(area),
        this.getColumnCount(area),
      ),
      data = this.area(area);
    const changedCells: { row: number; col: number; sheetArea: number }[] = [];
    for (const [r, c, cell] of data.cells.entries())
      if (range.contains(r, c)) {
        if (storageType & StorageType.data) {
          const old = cell.value;
          delete cell.value;
          delete cell.formula;
          if (area === VIEW) {
            if (old !== undefined) this.markDirty(r, c, old, null);
            this.queueCalc({ kind: 'value', row: r, col: c, value: null });
          }
        }
        if (storageType & StorageType.style) {
          delete cell.style;
          delete cell.validator;
        }
        if (storageType & StorageType.tag) delete cell.tag;
        if (storageType & StorageType.bindingPath) delete cell.bindingPath;
        if (storageType & StorageType.hyperlink) delete cell.hyperlink;
        if (storageType & StorageType.altText) delete cell.altText;
        data.cells.set(r, c, Object.keys(cell).length ? cell : undefined);
        changedCells.push({ row: r, col: c, sheetArea: area });
      }
    if (storageType & StorageType.style) {
      if (col === -1)
        for (const r of data.rowStyles.keys()) if (range.contains(r, 0)) data.rowStyles.delete(r);
      if (row === -1)
        for (const c of data.colStyles.keys()) if (range.contains(0, c)) data.colStyles.delete(c);
      if (row === -1 && col === -1) data.defaultStyle = Object.assign(new Style(), { themeFont: 'Body' });
    }
    if (area === VIEW && storageType & StorageType.comment)
      for (const comment of this.comments.all())
        if (range.contains(comment.rowIndex(), comment.colIndex()))
          this.comments.remove(comment.rowIndex(), comment.colIndex());
    if (storageType & StorageType.axis) {
      if (col === -1) {
        this._rowLayout(area).reset(range.row, range.rowCount);
        for (const r of this.axisMetadata('row', area).keys())
          if (r >= range.row && r < range.row + range.rowCount) this.axisMetadata('row', area).delete(r);
      }
      if (row === -1) {
        this._columnLayout(area).reset(range.col, range.colCount);
        for (const c of this.axisMetadata('col', area).keys())
          if (c >= range.col && c < range.col + range.colCount) this.axisMetadata('col', area).delete(c);
      }
    }
    this._emit(Events.RangeChanged, {
      sheet: this,
      sheetName: this.sheetName,
      row,
      col,
      rowCount,
      colCount,
      changedCells,
      action: GC.Spread.Sheets.RangeChangedAction.clear,
      isUndo: false,
    });
    this.batch.invalidate();
  }
  copyTo(
    fromRow: number,
    fromCol: number,
    toRow: number,
    toCol: number,
    rowCount: number,
    colCount: number,
    option = CopyToOptions.all,
  ): void {
    this.transfer(fromRow, fromCol, toRow, toCol, rowCount, colCount, option, false);
  }
  moveTo(
    fromRow: number,
    fromCol: number,
    toRow: number,
    toCol: number,
    rowCount: number,
    colCount: number,
    option = CopyToOptions.all,
  ): void {
    this.transfer(fromRow, fromCol, toRow, toCol, rowCount, colCount, option, true);
  }
  private transfer(
    fr: number,
    fc: number,
    tr: number,
    tc: number,
    rc: number,
    cc: number,
    option: number,
    move: boolean,
  ): void {
    const wholeColumns = fr === -1,
      wholeRows = fc === -1;
    tr = Math.max(0, tr);
    tc = Math.max(0, tc);
    const from = new Range(fr, fc, rc, cc).normalized(this.rows.count, this.cols.count),
      target = new Range(tr, tc, from.rowCount, from.colCount),
      data = this.area();
    const flags: [keyof CellData, number][] = [
      ['value', CopyToOptions.value],
      ['formula', CopyToOptions.formula],
      ['style', CopyToOptions.style],
      ['validator', CopyToOptions.style],
      ['tag', CopyToOptions.tag],
      ['bindingPath', CopyToOptions.bindingPath],
      ['defaultValue', CopyToOptions.defaultValue],
      ['altText', CopyToOptions.altText],
      ['hyperlink', CopyToOptions.hyperlink],
    ];
    const oldValues = new Map<string, { r: number; c: number; value: unknown; formula: string | null }>();
    const remember = (r: number, c: number) => {
      const key = `${r}:${c}`;
      if (!oldValues.has(key))
        oldValues.set(key, { r, c, value: this.getValue(r, c), formula: this.getFormula(r, c) });
    };
    if (option & (CopyToOptions.value | CopyToOptions.formula))
      for (const [r, c] of data.cells.entries()) {
        if (target.contains(r, c) || (move && from.contains(r, c))) remember(r, c);
        if (from.contains(r, c)) remember(r - from.row + tr, c - from.col + tc);
      }
    const cells = [...data.cells.entries()]
      .filter(([r, c]) => from.contains(r, c))
      .map(([r, c, v]) => [r, c, clone(v)] as const);
    const spans = data.spans.filter((s) => from.containsRange(s)).map(clone);
    const comments = this.comments
      .all()
      .filter((c) => from.contains(c.rowIndex(), c.colIndex()))
      .map((c) => c.toJSON());
    for (const [r, c, cell] of [...data.cells.entries()])
      if (target.contains(r, c) || (move && from.contains(r, c))) {
        for (const [key, flag] of flags) if (option & flag) delete cell[key];
        if (option & CopyToOptions.value) delete cell.formula;
        data.cells.set(r, c, Object.keys(cell).length ? cell : undefined);
      }
    for (const [r, c, cell] of cells) {
      const nr = r - from.row + tr,
        nc = c - from.col + tc;
      const dest = this.ensure(nr, nc);
      if (option & CopyToOptions.formula && cell.formula) delete dest.value;
      for (const [key, flag] of flags)
        if (option & flag && cell[key] !== undefined)
          Object.assign(dest, {
            [key]: key === 'formula' && !move ? adjustFormula(String(cell[key]), nr - r, nc - c) : cell[key],
          });
      this.prune(nr, nc);
    }
    if (option & CopyToOptions.style)
      for (const [styles, whole, start, end, destination] of [
        [data.colStyles, wholeColumns, from.col, from.col + from.colCount, tc],
        [data.rowStyles, wholeRows, from.row, from.row + from.rowCount, tr],
      ] as const)
        if (whole) {
          const source = [...styles]
            .filter(([i]) => i >= start && i < end)
            .map(([i, s]) => [i, clone(s)] as const);
          for (const i of styles.keys())
            if ((i >= destination && i < destination + end - start) || (move && i >= start && i < end))
              styles.delete(i);
          for (const [i, s] of source) styles.set(i - start + destination, s);
        }
    if (option & CopyToOptions.span) {
      data.spans = data.spans.filter(
        (s) => !target.intersect(s.row, s.col, s.rowCount, s.colCount) && !(move && from.containsRange(s)),
      );
      for (const s of spans) data.spans.push(s.offset(tc - from.col, tr - from.row));
    }
    if (option & CopyToOptions.comment) {
      for (const c of this.comments.all())
        if (
          target.contains(c.rowIndex(), c.colIndex()) ||
          (move && from.contains(c.rowIndex(), c.colIndex()))
        )
          this.comments.remove(c.rowIndex(), c.colIndex());
      for (const raw of comments) {
        const c = new Comment();
        c.fromJSON(raw);
        this.comments.set(Number(raw.rowIndex) - from.row + tr, Number(raw.colIndex) - from.col + tc, c);
      }
    }
    this.suspendCalcService();
    try {
      for (const { r, c, value, formula: oldFormula } of oldValues.values()) {
        const next = this.getValue(r, c);
        if (!Object.is(value, next) || oldFormula !== this.getFormula(r, c))
          this.markDirty(r, c, value, next);
        const formula = this.getFormula(r, c);
        if (formula) this.queueCalc({ kind: 'formula', row: r, col: c, formula });
        else this.queueCalc({ kind: 'value', row: r, col: c, value: next });
      }
    } finally {
      this.resumeCalcService();
    }
    this.batch.invalidate();
  }
  autoFitRow(row: number): void {
    coordinate(row);
    const ctx = this.measureContext(); let height = 20;
    for (const [r, col] of this.area().cells.entries()) if (r === row && !this.getSpan(row, col)) {
      const style = this.getActualStyle(row, col); ctx.font = String(style.font);
      const size = Number((ctx.font.match(/([\d.]+)px/) ?? [0, 14.6667])[1]);
      const text = this.getText(row, col), width = Math.max(1, this.cols.getSize(col) - 6);
      const lines = style.wordWrap ? text.split('\n').reduce((sum, line) => sum + Math.max(1, Math.ceil(ctx.measureText(line).width / width)), 0) : text.split('\n').length;
      height = Math.max(height, Math.ceil(lines * size * 1.2 + 2));
    }
    this.setRowHeight(row, height);
  }
  autoFitColumn(col: number): void {
    coordinate(col);
    const ctx = this.measureContext(); let width = 0;
    for (const [row, c] of this.area().cells.entries()) if (c === col && !this.getSpan(row, col)) {
      const style = this.getActualStyle(row, col); ctx.font = String(style.font);
      width = Math.max(width, ...this.getText(row, col).split('\n').map(text => ctx.measureText(text).width + 8 + Number(style.textIndent ?? 0) * 8));
    }
    this.setColumnWidth(col, Math.ceil(width || this.defaults.colWidth));
  }
  private measureContext(): CanvasRenderingContext2D {
    const context = this.parent?._renderer()?.context ?? (typeof CanvasRenderingContext2D !== 'undefined' ? document.createElement('canvas').getContext('2d') : null);
    if (!context) return notImplemented('Worksheet.autoFit (requires browser text measurement)');
    return context;
  }
  selectionPolicy(): number;
  selectionPolicy(value: number): this;
  selectionPolicy(value?: number): number | this { if (value === undefined) return this.policy; this.policy = value; return this; }
  selectionUnit(): number;
  selectionUnit(value: number): this;
  selectionUnit(value?: number): number | this { if (value === undefined) return this.unit; this.unit = value; return this; }
  _setUserSelections(ranges: Range[], row: number, col: number): void {
    if (this.policy === 0) ranges = ranges.map(range => new Range(Math.max(0, range.row), Math.max(0, range.col), 1, 1));
    if (!this.updateSelections(this.policy === 2 ? ranges : ranges.slice(-1))) return;
    this.activeRow = row; this.activeCol = col;
  }
  *_storedCells(): IterableIterator<[number, number, unknown, string | undefined]> {
    for (const [row, col, cell] of this.area().cells.entries()) yield [row, col, cell.value, cell.formula];
  }
  /** Sparse snapshots cover user operations without allocating empty rectangle contents. */
  _snapshotRanges(ranges: Range[]): () => void {
    const data = this.area(), contains = (row: number, col: number) => ranges.some(range => range.contains(row, col));
    const cells = [...data.cells.entries()].filter(([row, col]) => contains(row, col)).map(([row, col, cell]) => [row, col, clone(cell)] as const);
    const spans = data.spans.filter(span => ranges.some(range => range.intersect(span.row, span.col, span.rowCount, span.colCount))).map(clone);
    const notes = this.comments.all().filter(note => contains(note.rowIndex(), note.colIndex())).map(note => note.toJSON());
    return () => {
      const old = new Map<string, { row: number; col: number; value: unknown }>();
      for (const [row, col, cell] of data.cells.entries()) if (contains(row, col)) {
        old.set(`${row}:${col}`, { row, col, value: cell.value }); data.cells.set(row, col, undefined);
      }
      for (const [row, col, cell] of cells) {
        if (!old.has(`${row}:${col}`)) old.set(`${row}:${col}`, { row, col, value: undefined });
        data.cells.set(row, col, clone(cell));
      }
      data.spans = data.spans.filter(span => !ranges.some(range => range.intersect(span.row, span.col, span.rowCount, span.colCount))).concat(spans.map(clone));
      for (const note of this.comments.all()) if (contains(note.rowIndex(), note.colIndex())) this.comments.remove(note.rowIndex(), note.colIndex());
      for (const raw of notes) { const note = new Comment(); note.fromJSON(raw); this.comments.set(note.rowIndex(), note.colIndex(), note); }
      for (const { row, col, value } of old.values()) {
        const next = this.getValue(row, col);
        if (!Object.is(value ?? null, next)) { this.markDirty(row, col, value, next); this._emit(Events.ValueChanged, { sheet: this, sheetName: this.name(), row, col, oldValue: value ?? null, newValue: next }); }
        const formula = this.getFormula(row, col);
        if (formula) this.queueCalc({ kind: 'formula', row, col, formula }); else this.queueCalc({ kind: 'value', row, col, value: next });
      }
      this.invalidateLayout();
    };
  }
  _usedRange(): { row: number; col: number } {
    let row = 0, col = 0;
    for (const [r, c, cell] of this.area().cells.entries()) if (cell.value != null || cell.formula) { row = Math.max(row, r); col = Math.max(col, c); }
    return { row, col };
  }
  _view(): WorkbookRenderer | undefined { return this.parent?._renderer(); }
  getCellRect(row: number, col: number): Rect { return this._view()?.cellRect(row, col) ?? { x: this.cols.prefixSum(col) + 40, y: this.rows.prefixSum(row) + 20, width: this.cols.getSize(col), height: this.rows.getSize(row) }; }
  startEdit(selectAll = false, defaultText?: string): void { this._view()?.interaction.startEdit(selectAll, defaultText); }
  endEdit(ignoreValueChange = false): boolean { return this._view()?.interaction.endEdit(ignoreValueChange) ?? true; }
  isEditing(): boolean { return this._view()?.interaction.isEditing ?? false; }
  scroll(vPixels: number, hPixels: number): void { this._view()?.scroll(vPixels, hPixels); }
  showCell(row: number, col: number, verticalPosition = 3, horizontalPosition = 3): void { this._view()?.showCell(row, col, verticalPosition, horizontalPosition); }
  showRow(row: number, position = 0): void { this.showCell(row, this.getViewportLeftColumn(1), position, 3); }
  showColumn(col: number, position = 0): void { this.showCell(this.getViewportTopRow(1), col, 3, position); }
  getViewportTopRow(_index: number): number { return this._view()?.rows.find(r => r.index >= this.frozenRowCount())?.index ?? 0; }
  getViewportBottomRow(_index: number): number { return this._view()?.rows.filter(r => r.index < this.rows.count - this.frozenTrailingRowCount()).at(-1)?.index ?? 0; }
  getViewportLeftColumn(_index: number): number { return this._view()?.cols.find(c => c.index >= this.frozenColumnCount())?.index ?? 0; }
  getViewportRightColumn(_index: number): number { return this._view()?.cols.filter(c => c.index < this.cols.count - this.frozenTrailingColumnCount()).at(-1)?.index ?? 0; }
  getViewportHeight(_index: number): number { const view = this._view(); return view ? view.viewHeight - view.headerHeight : 0; }
  getViewportWidth(_index: number): number { const view = this._view(); return view ? view.viewWidth - view.headerWidth : 0; }
  private markDirty(row: number, col: number, oldValue: unknown, newValue: unknown): void {
    if (this.dirtyDepth) return;
    this.dirty.record(row, col, oldValue, newValue);
  }
  isDirty(): boolean {
    return this.dirty.size > 0;
  }
  hasPendingChanges(): boolean {
    return this.isDirty();
  }
  getDirtyCells(row = 0, col = 0, rowCount = this.rows.count, colCount = this.cols.count): DirtyCell[] {
    const range = new Range(row, col, rowCount, colCount);
    return [...this.dirty.entries()].filter(([r, c]) => range.contains(r, c)).map(([, , v]) => ({ ...v }));
  }
  clearPendingChanges(
    info: { row?: number; col?: number; rowCount?: number; colCount?: number; clearType?: number } = {},
  ): void {
    if (info.clearType !== undefined && !(info.clearType & 1)) return;
    const range = new Range(
      info.row ?? 0,
      info.col ?? 0,
      info.rowCount ?? this.rows.count,
      info.colCount ?? this.cols.count,
    );
    for (const [r, c] of this.dirty.entries()) if (range.contains(r, c)) this.dirty.set(r, c, undefined);
  }
  suspendDirty(): void {
    this.dirtyDepth++;
  }
  resumeDirty(): void {
    this.dirtyDepth = Math.max(0, this.dirtyDepth - 1);
  }
  isDirtySuspended(): boolean {
    return this.dirtyDepth > 0;
  }
  addNamedStyle(style: Style): void {
    if (typeof style.name !== 'string' || !style.name) throw new Error('Named style requires a name');
    this.namedStyles.set(style.name.toLowerCase(), style);
  }
  getNamedStyle(name: string): Style {
    return this.namedStyles.get(name.toLowerCase())!;
  }
  getNamedStyles(): Style[] {
    return [...this.namedStyles.values()];
  }
  removeNamedStyle(name: string): void {
    this.namedStyles.delete(name.toLowerCase());
  }
  addCustomName(
    name: string,
    formula: string,
    baseRow: number,
    baseCol: number,
    comment?: string,
    isReadOnly?: boolean,
  ): void {
    const info = new NameInfo(name, formula.replace(/^=/, ''), baseRow, baseCol, comment, isReadOnly);
    info._onRename = (previous, next) => {
      const existing = this.names.get(next.toLowerCase());
      if (existing && existing !== info) throw new Error('Name already exists');
      this.names.delete(previous.toLowerCase());
      this.names.set(next.toLowerCase(), info);
    };
    this.names.set(name.toLowerCase(), info);
  }
  getCustomName(name: string): NameInfo {
    return this.names.get(name.toLowerCase())!;
  }
  getCustomNames(): NameInfo[] {
    return [...this.names.values()];
  }
  removeCustomName(name: string): void {
    this.names.delete(name.toLowerCase());
  }
  clearCustomNames(): void {
    this.names.clear();
  }
  bind(type: string, fn: EventHandler): void;
  bind(type: string, data: unknown, fn: EventHandler): void;
  bind(type: string, data?: unknown, fn?: EventHandler): void {
    this.events.bind(type, data, fn);
  }
  unbind(type: string, fn?: EventHandler): void {
    this.events.unbind(type, fn);
  }
  unbindAll(): void {
    this.events.unbindAll();
  }
  suspendEvent(): void {
    this.events.depth++;
  }
  resumeEvent(): void {
    this.events.depth = Math.max(0, this.events.depth - 1);
  }
  _emit(type: string, info: EventInfo): void {
    if (this.events.depth || this.parent?._isEventSuspended()) return;
    this.events.emit(type, info);
    this.parent?._emit(type, info);
  }
  private changed(
    row: number,
    col: number,
    sheetArea: number,
    propertyName: string,
    oldValue: unknown,
    newValue: unknown,
  ): void {
    this.parent?._renderer()?.invalidateCell(row, col);
    const type = row < 0 ? Events.ColumnChanged : col < 0 ? Events.RowChanged : Events.CellChanged;
    if (this.events.has(type) || this.parent?._hasEvent(type)) this._emit(type, {
      sheet: this,
      sheetName: this.sheetName,
      row,
      col,
      sheetArea,
      propertyName,
      oldValue,
      newValue,
      isUndo: this.parent?._isUndoing() ?? false,
    });
    this.batch.invalidate();
  }
  private axisInfo(
    axis: 'row' | 'col',
    index: number,
    sheetArea: number,
    propertyName: string,
    oldValue: unknown,
    newValue: unknown,
    amount?: number,
  ): EventInfo {
    const info: EventInfo = {
      sheet: this,
      sheetName: this.sheetName,
      [axis]: index,
      sheetArea,
      propertyName,
      oldValue,
      newValue,
      isUndo: this.parent?._isUndoing() ?? false,
    };
    if (amount !== undefined) info.count = amount;
    return info;
  }
  private axisChanged(
    axis: 'row' | 'col',
    index: number,
    area: number,
    property: string,
    old: unknown,
    value: unknown,
    amount?: number,
  ): void {
    this._emit(
      axis === 'row' ? Events.RowChanged : Events.ColumnChanged,
      this.axisInfo(axis, index, area, property, old, value, amount),
    );
    this.invalidateLayout();
  }
  suspendPaint(): void {
    this.batch.paint++;
  }
  resumePaint(): void {
    this.batch.paint = Math.max(0, this.batch.paint - 1);
    if (!this.batch.paint && !this.parent?.isPaintSuspended()) { this.batch.flush(); this.parent?._renderer()?.schedule(); }
  }
  isPaintSuspended(): boolean {
    return this.batch.paint > 0 || !!this.parent?.isPaintSuspended();
  }
  suspendCalcService(_ignoreDirty = false): void {
    this.batch.calc++;
  }
  resumeCalcService(recalcAll = false): void {
    this.batch.calc = Math.max(0, this.batch.calc - 1);
    this.flushCalc(recalcAll);
  }
  _resumeWorkbookCalc(recalcAll = false): void {
    this.flushCalc(recalcAll);
  }
  invalidateLayout(): void {
    this.batch.invalidate(true);
  }
  repaint(_clipRect?: unknown): void {
    this.batch.invalidate();
  }
  _flushPaint(): void {
    this.batch.flush();
  }
  _onInvalidate(callback: (layout: boolean) => void): void {
    this.batch.onInvalidate = callback;
  }
  toJSON(options: SerializationOptions = {}): JsonRecord {
    const result: JsonRecord = {
      ...clone(this.extraJSON),
      name: this.sheetName,
      isSelected: this.settings.isSelected ?? (!this.parent || this.parent.getActiveSheet() === this),
      visible: this.settings.visible,
      theme: this.settings.theme ?? 'Office',
    };
    const put = (key: string, value: unknown, defaultValue: unknown) => {
      if (JSON.stringify(value) !== JSON.stringify(defaultValue)) result[key] = value;
    };
    put('rowCount', this.rows.count, 200);
    put('columnCount', this.cols.count, 20);
    put('rowHeaderColCount', this.headerCols.count, 1);
    put('colHeaderRowCount', this.headerRows.count, 1);
    put('activeRow', this.activeRow, 0);
    put('activeCol', this.activeCol, 0);
    for (const key of [
      'zoomFactor',
      'frozenRowCount',
      'frozenColCount',
      'frozenTrailingRowCount',
      'frozenTrailingColCount',
      'showRowOutline',
      'showColumnOutline',
    ])
      put(key, this.settings[key], key === 'zoomFactor' ? 1 : key.startsWith('show') ? true : 0);
    for (const [area, key] of [
      [VIEW, 'data'],
      [SheetArea.rowHeader, 'rowHeaderData'],
      [SheetArea.colHeader, 'colHeaderData'],
    ] as const) {
      const data = this.area(area),
        serialized: JsonRecord = {},
        table: JsonRecord = {};
      for (const [r, c, cell] of data.cells.entries()) {
        const node: JsonRecord = {};
        for (const [property, value] of Object.entries(cell)) {
          if (property === 'style') {
            if (!options.ignoreStyle) node.style = styleToJSON(cell.style);
          } else if (property === 'formula') {
            if (!options.ignoreFormula) node.formula = value;
          } else node[property] = serializeValue(value);
        }
        if (Object.keys(node).length) {
          const row = object(table[r]);
          row[c] = node;
          table[r] = row;
        }
      }
      if (Object.keys(table).length) serialized.dataTable = table;
      if (!options.ignoreStyle) {
        for (const [styles, name] of [
          [data.rowStyles, 'rowDataArray'],
          [data.colStyles, 'columnDataArray'],
        ] as const)
          if (styles.size) {
            const array: unknown[] = [];
            for (const [index, style] of styles) array[index] = { style: styleToJSON(style) };
            serialized[name] = array;
          }
      }
      const defaultNode: JsonRecord = {};
      if (!options.ignoreStyle) defaultNode.style = styleToJSON(data.defaultStyle);
      if (data.tag !== undefined) defaultNode.tag = serializeValue(data.tag);
      if (Object.keys(defaultNode).length) serialized.defaultDataNode = defaultNode;
      result[key] = serialized;
    }
    for (const [axis, key] of [
      [this.rows, 'rows'],
      [this.cols, 'columns'],
      [this.headerCols, 'rowHeaderColInfos'],
      [this.headerRows, 'colHeaderRowInfos'],
    ] as const) {
      const entries = new Map<number, JsonRecord>(axis.entries()),
        meta = this.metadata.get(axis);
      if (meta) for (const [i, value] of meta) entries.set(i, { ...entries.get(i), ...value });
      if (entries.size) {
        const array: unknown[] = [];
        for (const [i, v] of entries) array[i] = v;
        result[key] = array;
      }
    }
    result.defaultData = {};
    result.leftCellIndex = this.settings.leftCellIndex;
    result.topCellIndex = this.settings.topCellIndex;
    for (const [area, key] of [
      [VIEW, 'spans'],
      [SheetArea.rowHeader, 'rowHeaderSpan'],
      [SheetArea.colHeader, 'colHeaderSpan'],
    ] as const) {
      const spans = this.area(area).spans;
      if (spans.length)
        result[key] = spans.map((s) => ({
          row: s.row,
          col: s.col,
          rowCount: s.rowCount,
          colCount: s.colCount,
        }));
    }
    result.selections = {
      ...Object.fromEntries(
        this.selections.map((s, i) => [
          i,
          { row: s.row, col: s.col, rowCount: s.rowCount, colCount: s.colCount },
        ]),
      ),
      length: this.selections.length,
    };
    result.rowOutlines ??= { items: [] };
    result.columnOutlines ??= { items: [] };
    result.cellStates ??= {};
    result.states ??= {};
    result.outlineColumnOptions ??= {};
    result.autoMergeRangeInfos ??= [];
    if (this.comments.all().length) result.comments = this.comments.all().map((c) => c.toJSON());
    if (this.names.size) result.names = this.getCustomNames().map((n) => n.toJSON());
    Object.assign(result, optionDifferences(this.options, worksheetDefaults));
    if (!options.ignoreStyle && this.namedStyles.size)
      result.namedStyles = this.getNamedStyles().map(styleToJSON);
    const defaults = optionDifferences(this.dimensions, {
      rowHeight: 20,
      colWidth: 62,
      colHeaderRowHeight: 20,
      rowHeaderColWidth: 40,
    });
    if (Object.keys(defaults).length) result.defaults = defaults;
    return serializeValue(result) as JsonRecord;
  }
  fromJSON(settings: object): void {
    const json = object(settings);
    this.areas.clear();
    this.namedStyles.clear();
    this.names.clear();
    this.comments.clear();
    this.dirty.clear();
    this.calcQueue.clear();
    this.metadata.clear();
    this.sheetName = String(json.name ?? this.sheetName);
    this.rows = new AxisLayout(Number(json.rowCount ?? 200), 20);
    this.cols = new AxisLayout(Number(json.columnCount ?? 20), 62);
    this.headerRows = new AxisLayout(Number(json.colHeaderRowCount ?? 1), 20);
    this.headerCols = new AxisLayout(Number(json.rowHeaderColCount ?? 1), 40);
    Object.assign(this.dimensions, {
      rowHeight: 20,
      colWidth: 62,
      colHeaderRowHeight: 20,
      rowHeaderColWidth: 40,
    });
    for (const [key, value] of Object.entries(object(json.defaults))) Reflect.set(this.defaults, key, value);
    this.activeRow = Number(json.activeRow ?? 0);
    this.activeCol = Number(json.activeCol ?? 0);
    this.settings = {
      visible: 1,
      zoomFactor: 1,
      frozenRowCount: 0,
      frozenColCount: 0,
      frozenTrailingRowCount: 0,
      frozenTrailingColCount: 0,
      showRowOutline: true,
      showColumnOutline: true,
      leftCellIndex: 0,
      topCellIndex: 0,
    };
    for (const key of [...Object.keys(this.settings), 'theme'])
      if (json[key] !== undefined) this.settings[key] = json[key];
    if (!this.parent && json.isSelected !== undefined) this.settings.isSelected = json.isSelected;
    for (const key of Object.keys(this.options)) delete this.options[key];
    Object.assign(this.options, clone(worksheetDefaults));
    for (const key of [
      ...Object.keys(worksheetDefaults),
      'sheetTabColor',
      'selectionBackColor',
      'selectionBorderColor',
    ])
      if (json[key] !== undefined) mergeOptions(this.options, { [key]: json[key] });
    for (const [area, key] of [
      [VIEW, 'data'],
      [SheetArea.rowHeader, 'rowHeaderData'],
      [SheetArea.colHeader, 'colHeaderData'],
    ] as const) {
      const raw = object(json[key]),
        data = this.area(area);
      for (const [r, row] of Object.entries(object(raw.dataTable)))
        for (const [c, node] of Object.entries(object(row))) {
          const cell = deserializeValue(node) as CellData;
          if (object(node).style !== undefined) cell.style = styleFromJSON(object(node).style);
          data.cells.set(+r, +c, cell);
        }
      for (const [map, name] of [
        [data.rowStyles, 'rowDataArray'],
        [data.colStyles, 'columnDataArray'],
      ] as const)
        for (const [i, node] of Object.entries(object(raw[name])))
          if (node && object(node).style !== undefined) map.set(+i, styleFromJSON(object(node).style));
      const node = object(raw.defaultDataNode);
      if (node.style !== undefined) {
        const style = styleFromJSON(node.style);
        data.defaultStyle =
          typeof style === 'string' ? Object.assign(new Style(), { parentName: style }) : style;
      }
      data.tag = deserializeValue(node.tag);
    }
    for (const [axis, key] of [
      [this.rows, 'rows'],
      [this.cols, 'columns'],
      [this.headerCols, 'rowHeaderColInfos'],
      [this.headerRows, 'colHeaderRowInfos'],
    ] as const)
      for (const [i, raw] of Object.entries(object(json[key]))) {
        if (!raw) continue;
        const node = object(raw);
        if (typeof node.size === 'number') axis.setSize(+i, node.size);
        if (node.visible === false) axis.setVisible(+i, false);
        const metadata = { ...node };
        delete metadata.size;
        delete metadata.visible;
        if (Object.keys(metadata).length) {
          let map = this.metadata.get(axis);
          if (!map) this.metadata.set(axis, (map = new Map()));
          map.set(+i, metadata);
        }
      }
    for (const [area, key] of [
      [VIEW, 'spans'],
      [SheetArea.rowHeader, 'rowHeaderSpan'],
      [SheetArea.colHeader, 'colHeaderSpan'],
    ] as const)
      for (const raw of list(json[key])) {
        const s = object(raw);
        this.area(area).spans.push(
          new Range(Number(s.row), Number(s.col), Number(s.rowCount), Number(s.colCount)),
        );
      }
    const selections = object(json.selections);
    this.selections =
      json.selections === undefined
        ? [new Range(0, 0, 1, 1)]
        : Object.entries(selections)
            .filter(([key]) => key !== 'length')
            .map(([, raw]) => {
              const s = object(raw);
              return new Range(Number(s.row), Number(s.col), Number(s.rowCount), Number(s.colCount));
            });
    for (const raw of list(json.namedStyles)) {
      const style = styleFromJSON(raw);
      if (typeof style !== 'string') this.addNamedStyle(style);
    }
    for (const raw of list(json.names)) {
      const n = object(raw);
      this.addCustomName(
        String(n.name),
        String(n.formula),
        Number(n.row ?? 0),
        Number(n.col ?? 0),
        n.comment as string | undefined,
        Boolean(n.isReadOnly),
      );
    }
    for (const raw of list(json.comments)) {
      const c = new Comment();
      c.fromJSON(object(raw));
      this.comments.set(c.rowIndex(), c.colIndex(), c);
    }
    const known = new Set([
      'name',
      'rowCount',
      'columnCount',
      'rowHeaderColCount',
      'colHeaderRowCount',
      'activeRow',
      'activeCol',
      'data',
      'rowHeaderData',
      'colHeaderData',
      'rows',
      'columns',
      'rowHeaderColInfos',
      'colHeaderRowInfos',
      'defaultData',
      'spans',
      'rowHeaderSpan',
      'colHeaderSpan',
      'selections',
      'comments',
      'namedStyles',
      'names',
      'defaults',
      'index',
      'order',
      'isSelected',
      ...Object.keys(this.settings),
      ...Object.keys(this.options),
    ]);
    this.extraJSON = Object.fromEntries(
      Object.entries(json)
        .filter(([key]) => !known.has(key))
        .map(([key, value]) => [key, clone(value)]),
    );
    this.invalidateLayout();
  }
}

export class Workbook {
  sheets: Worksheet[] = [];
  readonly options: LiveWorkbookOptions;
  name = '';
  docProps: JsonRecord = { docPropsApp: {}, docPropsCore: {} };
  private host?: HTMLElement;
  private addedHostClass = false;
  private destroyed = false;
  private renderer?: WorkbookRenderer;
  private active = 0;
  private start = 0;
  private events = new EventHub(this);
  private batch = new Batching();
  private history = new UndoManager();
  private manager: CommandManager;
  private namedStyles = new Map<string, Style>();
  private names = new Map<string, NameInfo>();
  private extraJSON: JsonRecord = defaultMetadata();
  constructor(host?: HTMLElement | string, options: WorkbookOptions = {}) {
    const sheetCount = options.sheetCount ?? 1;
    count(sheetCount);
    this.options = new Proxy(Object.assign(clone(workbookDefaults), options), {
      set: (target, key, value) => { Reflect.set(target, key, value); this.invalidateLayout(); return true; },
    });
    delete this.options.sheetCount;
    if (typeof host === 'string') {
      const element = typeof document === 'undefined' ? null : document.getElementById(host);
      if (!element) throw new Error(`Workbook host not found: ${host}`);
      this.host = element;
    } else this.host = host;
    if (this.host) {
      this.addedHostClass = !this.host.classList.contains('opensheets-host');
      this.host.classList.add('opensheets-host');
    }
    this.manager = new CommandManager(this);
    this.manager.register('editCell', {
      canUndo: true,
      execute: (_context, options, isUndo) => {
        const sheet =
          typeof options.sheetName === 'string'
            ? this.getSheetFromName(options.sheetName)
            : this.getActiveSheet();
        if (!sheet) return false;
        const row = Number(options.row),
          col = Number(options.col);
        coordinate(row);
        coordinate(col);
        const previousValue = sheet.getValue(row, col);
        if (!isUndo && !Object.hasOwn(options, '_before'))
          options._before = { value: sheet.getValue(row, col), formula: sheet.getFormula(row, col) };
        if (isUndo) {
          const before = object(options._before);
          if (typeof before.formula === 'string') {
            sheet.setFormula(row, col, before.formula);
            sheet._setCalculatedValue(row, col, before.value);
          } else sheet.setValue(row, col, before.value);
        } else if (typeof options.newValue === 'string' && options.newValue.startsWith('='))
          sheet.setFormula(row, col, options.newValue);
        else sheet.setValue(row, col, options.newValue);
        if (isUndo || Object.hasOwn(options, '_applied')) {
          this.setActiveSheet(sheet.name()); sheet.setSelection(row, col, 1, 1);
        }
        options._applied = true;
        const newValue = sheet.getValue(row, col);
        if (!Object.is(previousValue, newValue)) sheet._emit(Events.ValueChanged, { sheet, sheetName: sheet.name(), row, col, oldValue: previousValue, newValue });
        return true;
      },
    });
    this.setSheetCount(sheetCount);
    this.events.unbindAll();
    if (this.host && typeof CanvasRenderingContext2D !== 'undefined') {
      this.renderer = new WorkbookRenderer(this, this.host);
      this.batch.onInvalidate = layout => this.renderer?.schedule(layout);
    }
  }
  _renderer(): WorkbookRenderer | undefined { return this.renderer; }
  private assertAlive(): void {
    if (this.destroyed) throw new Error('Workbook has been destroyed');
  }
  getHost(): HTMLElement {
    return this.host!;
  }
  getSheet(index: number): Worksheet {
    this.assertAlive();
    return this.sheets[index]!;
  }
  getSheetCount(): number {
    return this.sheets.length;
  }
  getSheetFromName(name: string): Worksheet {
    return this.sheets.find((s) => s.name().toLowerCase() === name.toLowerCase())!;
  }
  getSheetIndex(name: string): number {
    return this.sheets.findIndex((s) => s.name().toLowerCase() === name.toLowerCase());
  }
  addSheet(index: number, sheet?: Worksheet): void {
    this.assertAlive();
    if (!Number.isInteger(index) || index < 0 || index > this.sheets.length)
      throw new RangeError('Invalid sheet index');
    if (sheet?.getParent() && sheet.getParent() !== this)
      throw new Error('Worksheet already belongs to a workbook');
    if (!sheet) {
      let suffix = 1;
      while (this.getSheetFromName(`Sheet${suffix}`)) suffix++;
      sheet = new Worksheet(`Sheet${suffix}`);
    }
    if (this.getSheetFromName(sheet.name())) throw new Error('Worksheet name already exists');
    const active = this.sheets[this.active];
    this.sheets.splice(index, 0, sheet);
    sheet._attach(this);
    if (active) this.active = this.sheets.indexOf(active);
    this._emit(Events.SheetChanged, {
      sheetName: sheet.name(),
      sheetIndex: index,
      propertyName: 'insertSheet',
    });
    this.invalidateLayout();
  }
  removeSheet(index: number): void {
    this.assertAlive();
    if (index < 0 || index >= this.sheets.length) return;
    const sheet = this.sheets[index],
      oldActive = this.getActiveSheet();
    const info = { sheetName: sheet.name(), sheetIndex: index, propertyName: 'removeSheet', cancel: false };
    this._emit(Events.SheetChanging, info);
    if (info.cancel) return;
    this.sheets.splice(index, 1);
    sheet._attach();
    this.active =
      oldActive === sheet
        ? Math.min(index, this.sheets.length - 1)
        : Math.max(0, this.sheets.indexOf(oldActive));
    this.start = Math.min(this.start, Math.max(0, this.sheets.length - 1));
    this._emit(Events.SheetChanged, {
      sheetName: sheet.name(),
      sheetIndex: index,
      propertyName: 'removeSheet',
    });
    this.invalidateLayout();
  }
  setSheetCount(value: number): void {
    count(value);
    while (this.sheets.length > value) {
      const before = this.sheets.length;
      this.removeSheet(before - 1);
      if (this.sheets.length === before) break;
    }
    while (this.sheets.length < value) this.addSheet(this.sheets.length);
    if (!value) this.active = 0;
  }
  clearSheets(): void {
    this.setSheetCount(0);
  }
  getActiveSheet(): Worksheet {
    return this.getSheet(this.active);
  }
  getActiveSheetIndex(): number {
    return this.active;
  }
  setActiveSheet(name: string): void {
    const index = this.getSheetIndex(name);
    if (index >= 0) this.setActiveSheetIndex(index);
  }
  setActiveSheetIndex(index: number): void {
    this.assertAlive();
    if (!Number.isInteger(index) || index < 0 || index >= this.sheets.length || index === this.active) return;
    const oldSheet = this.getActiveSheet(),
      newSheet = this.getSheet(index),
      info = { oldSheet, newSheet, cancel: false };
    this._emit(Events.ActiveSheetChanging, info);
    if (info.cancel) return;
    this.active = index;
    this._emit(Events.ActiveSheetChanged, { oldSheet, newSheet });
    this.repaint();
  }
  activeSheetIndex(): number;
  activeSheetIndex(value: number): this;
  activeSheetIndex(value?: number): number | this {
    if (value === undefined) return this.active;
    this.setActiveSheetIndex(value);
    return this;
  }
  startSheetIndex(): number;
  startSheetIndex(value: number): this;
  startSheetIndex(value?: number): number | this {
    if (value === undefined) return this.start;
    this.start = Math.max(0, Math.min(value, Math.max(0, this.sheets.length - 1)));
    this.repaint();
    return this;
  }
  changeSheetIndex(name: string, index: number): boolean {
    const current = this.getSheetIndex(name);
    if (current < 0 || index < 0 || index >= this.sheets.length) return false;
    const active = this.getActiveSheet();
    const [sheet] = this.sheets.splice(current, 1);
    this.sheets.splice(index, 0, sheet);
    this.active = this.sheets.indexOf(active);
    this.invalidateLayout();
    return true;
  }
  addNamedStyle(style: Style): void {
    if (typeof style.name !== 'string' || !style.name) throw new Error('Named style requires a name');
    this.namedStyles.set(style.name.toLowerCase(), style);
  }
  getNamedStyle(name: string): Style {
    return this.namedStyles.get(name.toLowerCase())!;
  }
  getNamedStyles(): Style[] {
    return [...this.namedStyles.values()];
  }
  removeNamedStyle(name: string): void {
    this.namedStyles.delete(name.toLowerCase());
  }
  addCustomName(
    name: string,
    formula: string,
    baseRow: number,
    baseCol: number,
    comment?: string,
    isReadOnly?: boolean,
  ): void {
    const info = new NameInfo(name, formula.replace(/^=/, ''), baseRow, baseCol, comment, isReadOnly);
    info._onRename = (previous, next) => {
      const existing = this.names.get(next.toLowerCase());
      if (existing && existing !== info) throw new Error('Name already exists');
      this.names.delete(previous.toLowerCase());
      this.names.set(next.toLowerCase(), info);
    };
    this.names.set(name.toLowerCase(), info);
  }
  getCustomName(name: string): NameInfo {
    return this.names.get(name.toLowerCase())!;
  }
  getCustomNames(): NameInfo[] {
    return [...this.names.values()];
  }
  removeCustomName(name: string): void {
    this.names.delete(name.toLowerCase());
  }
  clearCustomNames(): void {
    this.names.clear();
  }
  bind(type: string, fn: EventHandler): void;
  bind(type: string, data: unknown, fn: EventHandler): void;
  bind(type: string, data?: unknown, fn?: EventHandler): void {
    this.events.bind(type, data, fn);
  }
  unbind(type: string, fn?: EventHandler): void {
    this.events.unbind(type, fn);
  }
  unbindAll(): void {
    this.events.unbindAll();
  }
  _emit(type: string, info: EventInfo): void {
    this.events.emit(type, info);
  }
  _hasEvent(type: string): boolean { return this.events.has(type); }
  _isEventSuspended(): boolean {
    return this.events.depth > 0;
  }
  suspendEvent(): void {
    this.events.depth++;
  }
  resumeEvent(): void {
    this.events.depth = Math.max(0, this.events.depth - 1);
  }
  suspendPaint(): void {
    this.batch.paint++;
  }
  resumePaint(): void {
    this.batch.paint = Math.max(0, this.batch.paint - 1);
    if (!this.batch.paint) {
      for (const sheet of this.sheets) sheet._flushPaint();
      this.batch.flush();
    }
  }
  isPaintSuspended(): boolean {
    return this.batch.paint > 0;
  }
  suspendCalcService(_ignoreDirty = false): void {
    this.batch.calc++;
  }
  resumeCalcService(recalcAll = false): void {
    this.batch.calc = Math.max(0, this.batch.calc - 1);
    if (!this.batch.calc) for (const sheet of this.sheets) sheet._resumeWorkbookCalc(recalcAll);
  }
  _isCalcSuspended(): boolean {
    return this.batch.calc > 0;
  }
  _isUndoing(): boolean {
    return !this.history.recording;
  }
  commandManager(): CommandManager {
    return this.manager;
  }
  undoManager(): UndoManager {
    return this.history;
  }
  refresh(): void {
    this.invalidateLayout();
  }
  invalidateLayout(): void {
    if (!this.destroyed) this.batch.invalidate(true);
  }
  repaint(): void {
    if (!this.destroyed) this.batch.invalidate();
  }
  _onInvalidate(callback: (layout: boolean) => void): void {
    this.batch.onInvalidate = callback;
  }
  focus(focusIn = true): void {
    if (focusIn) (this.renderer?.root ?? this.host)?.focus();
    else this.host?.blur();
  }
  toJSON(options: SerializationOptions = {}): JsonRecord {
    for (const key of [
      'saveAsView',
      'rowHeadersAsFrozenColumns',
      'columnHeadersAsFrozenRows',
      'includeAutoMergedCells',
      'saveR1C1Formula',
      'saveExternalSourcePivotCache',
    ])
      if (options[key]) notImplemented(`Workbook.toJSON(${key})`);
    this.assertAlive();
    const result: JsonRecord = {
      ...clone(this.extraJSON),
      version: '19.2.5',
      name: this.name,
      docProps: clone(this.docProps),
      sheetCount: this.sheets.length,
    };
    Object.assign(result, optionDifferences(this.options, workbookDefaults));
    result.customList = clone(this.options.customList);
    result.defaultSheetTabStyles = clone(this.options.defaultSheetTabStyles);
    result.builtInFileIcons = clone(this.options.builtInFileIcons);
    if (this.start) result.startSheetIndex = this.start;
    if (this.active) result.activeSheetIndex = this.active;
    result.sheets = Object.fromEntries(
      this.sheets.map((s, i) => [s.name(), { ...s.toJSON(options), index: i, order: i }]),
    );
    if (!options.ignoreStyle && this.namedStyles.size)
      result.namedStyles = this.getNamedStyles().map(styleToJSON);
    if (this.names.size) result.names = this.getCustomNames().map((n) => n.toJSON());
    return serializeValue(result) as JsonRecord;
  }
  async fromJSON(data: object, options: JsonRecord = {}): Promise<void> {
    this.assertAlive();
    for (const key of ['frozenColumnsAsRowHeaders', 'frozenRowsAsColumnHeaders', 'incrementalLoading'])
      if (options[key]) notImplemented(`Workbook.fromJSON(${key})`);
    const json = object(data);
    this.suspendPaint();
    this.suspendEvent();
    try {
      for (const sheet of this.sheets) sheet._attach();
      this.sheets = [];
      this.namedStyles.clear();
      this.names.clear();
      this.history.clear();
      this.name = String(json.name ?? '');
      this.docProps = clone(object(json.docProps ?? { docPropsApp: {}, docPropsCore: {} }));
      for (const key of Object.keys(this.options)) delete this.options[key];
      Object.assign(this.options, clone(workbookDefaults));
      for (const key of Object.keys(workbookDefaults))
        if (json[key] !== undefined) mergeOptions(this.options, { [key]: json[key] });
      const sheetEntries = Object.entries(object(json.sheets)).sort(
        ([, a], [, b]) => Number(object(a).index ?? 0) - Number(object(b).index ?? 0),
      );
      for (const [name, raw] of sheetEntries) {
        const settings = clone(object(raw));
        if (options.ignoreStyle) {
          delete settings.namedStyles;
          for (const area of ['data', 'rowHeaderData', 'colHeaderData']) {
            const a = object(settings[area]);
            delete object(a.defaultDataNode).style;
            for (const key of ['rowDataArray', 'columnDataArray'])
              for (const node of list(a[key])) if (node) delete object(node).style;
            for (const row of Object.values(object(a.dataTable)))
              for (const node of Object.values(object(row))) delete object(node).style;
          }
        }
        if (options.ignoreFormula)
          for (const area of ['data', 'rowHeaderData', 'colHeaderData'])
            for (const row of Object.values(object(object(settings[area]).dataTable)))
              for (const node of Object.values(object(row))) delete object(node).formula;
        const sheet = new Worksheet(name);
        sheet._attach(this);
        sheet.fromJSON(settings);
        this.sheets.push(sheet);
      }
      if (!sheetEntries.length && Number(json.sheetCount ?? 0) > 0)
        this.setSheetCount(Number(json.sheetCount));
      this.active = Number(json.activeSheetIndex ?? 0);
      this.start = Number(json.startSheetIndex ?? 0);
      if (!options.ignoreStyle)
        for (const raw of list(json.namedStyles)) {
          const style = styleFromJSON(raw);
          if (typeof style !== 'string') this.addNamedStyle(style);
        }
      for (const raw of list(json.names)) {
        const n = object(raw);
        this.addCustomName(
          String(n.name),
          String(n.formula),
          Number(n.row ?? 0),
          Number(n.col ?? 0),
          n.comment as string | undefined,
          Boolean(n.isReadOnly),
        );
      }
      const known = new Set([
        'version',
        'name',
        'docProps',
        'sheetCount',
        'sheets',
        'namedStyles',
        'names',
        'startSheetIndex',
        'activeSheetIndex',
        ...Object.keys(workbookDefaults),
      ]);
      this.extraJSON = {
        ...defaultMetadata(),
        ...Object.fromEntries(
          Object.entries(json)
            .filter(([key]) => !known.has(key))
            .map(([key, value]) => [key, clone(value)]),
        ),
      };
      this.invalidateLayout();
    } finally {
      this.resumeEvent();
      this.resumePaint();
    }
  }
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.renderer?.destroy(); this.renderer = undefined;
    if (this.addedHostClass) this.host?.classList.remove('opensheets-host');
    for (const sheet of this.sheets) {
      sheet.unbindAll();
      sheet._attach();
    }
    this.sheets.length = 0;
    this.events.unbindAll();
    this.history.clear();
    this.host = undefined;
    this.batch.onInvalidate = undefined;
  }
}
