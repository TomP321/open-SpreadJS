import { CellBindingSource, getPath, setPath } from './binding.js';
/**
 * Tables: range model, column metadata, built-in themes, structured-reference
 * support and JSON round-trip. Styles are resolved lazily so table edits are
 * reflected by getActualStyle and the renderer without copying cell styles.
 */
import { Style, LineBorder, Range, clone } from '../primitives.js';
import { Events } from '../events.js';
import type { Worksheet } from '../model.js';
import { HideRowFilter, filterFromJSON, filterToJSON } from './filters.js';
import { deserializeValue, serializeValue, styleToJSON, type JsonRecord } from '../serialization.js';
import { TABLE_THEME_JSON, THEME_COLORS, THEME_COLORS_2013, type ThemeJSON, type ThemeStyleJSON } from './table-theme-data.js';

let themedDocument: boolean | undefined;
/** The bundled theme stylesheet switches the palette to the Excel 2013 one. */
export function usingThemedDocument(): boolean {
  if (themedDocument !== undefined) return themedDocument;
  if (typeof document === 'undefined') return (themedDocument = false);
  themedDocument = !!document.querySelector(
    'link[href*="gc.spread.sheets"], style[data-vite-dev-id*="gc.spread.sheets"]',
  );
  return themedDocument;
}
export function resolveColor(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const palette = usingThemedDocument() ? THEME_COLORS_2013 : THEME_COLORS;
  if (Object.hasOwn(palette, value)) return palette[value];
  if (Object.hasOwn(THEME_COLORS, value)) return THEME_COLORS[value];
  return value;
}

function styleFromTheme(style?: ThemeStyleJSON): Style | undefined {
  if (!style) return undefined;
  const result = new Style();
  for (const [key, raw] of Object.entries(style)) {
    if (raw === undefined || raw === null) continue;
    if (key.startsWith('border') && typeof raw === 'object') {
      const border = raw as { color?: string; style?: number };
      result[key] = new LineBorder(String(border.color ?? 'black'), Number(border.style ?? 0));
    } else result[key] = clone(raw);
  }
  return result;
}
/** Resolves theme colour tokens against the active document palette. */
function resolveThemeStyle(style: Style | undefined, palette?: Record<string, string>): Style | undefined {
  if (!style) return undefined;
  const result = Object.assign(new Style(), style);
  const color = (value: unknown) => {
    if (typeof value !== 'string' || !palette?.[value]) return resolveColor(value);
    const base = value.replace(/ -?\d+(?:\.\d+)?$/, '');
    // Public built-in palette facts include the reference's quantized tints.
    for (const known of [THEME_COLORS, THEME_COLORS_2013])
      if (known[value] && known[base]?.toLowerCase() === palette[base]?.toLowerCase()) return known[value];
    return palette[value];
  };
  for (const key of ['backColor', 'foreColor']) if (typeof result[key] === 'string') result[key] = color(result[key]);
  for (const key of ['borderLeft', 'borderRight', 'borderTop', 'borderBottom', 'borderHorizontal', 'borderVertical']) {
    const border = result[key] as LineBorder | undefined;
    if (!border) continue;
    const resolved = new LineBorder(String(color(border.color)), border.style);
    (resolved as unknown as JsonRecord).level = 20;
    result[key] = resolved;
  }
  return result;
}
function mergeStyle(target: Style, source?: Style): void {
  if (source) Object.assign(target, source);
}

export class TableStyle {
  [key: string]: unknown;
  constructor(
    backColor?: unknown,
    foreColor?: string,
    font?: string,
    public borderLeft?: LineBorder,
    public borderTop?: LineBorder,
    public borderRight?: LineBorder,
    public borderBottom?: LineBorder,
    public borderHorizontal?: LineBorder,
    public borderVertical?: LineBorder,
    textDecoration?: number,
    fontStyle?: string,
    fontWeight?: string,
    fontSize?: string,
    fontFamily?: string,
  ) {
    if (backColor !== undefined) this.backColor = backColor;
    if (foreColor !== undefined) this.foreColor = foreColor;
    if (font !== undefined) this.font = font;
    if (textDecoration !== undefined) this.textDecoration = textDecoration;
    if (fontStyle !== undefined) this.fontStyle = fontStyle;
    if (fontWeight !== undefined) this.fontWeight = fontWeight;
    if (fontSize !== undefined) this.fontSize = fontSize;
    if (fontFamily !== undefined) this.fontFamily = fontFamily;
  }
  toJSON(): JsonRecord {
    return serializeValue({
      ...Object.fromEntries(Object.entries(this).filter(([, value]) => value !== undefined)),
    }) as JsonRecord;
  }
  fromJSON(data: object): void {
    Object.assign(this, deserializeValue(data));
  }
}
for (const key of ['backColor', 'foreColor', 'font', 'borderLeft', 'borderTop', 'borderRight', 'borderBottom', 'borderHorizontal', 'borderVertical', 'textDecoration', 'fontStyle', 'fontWeight', 'fontSize', 'fontFamily'])
  Object.defineProperty(TableStyle.prototype, key, { value: undefined, writable: true, configurable: true });

const THEME_KEYS = [
  'headerRowStyle',
  'footerRowStyle',
  'wholeTableStyle',
  'firstRowStripStyle',
  'secondRowStripStyle',
  'firstColumnStripStyle',
  'secondColumnStripStyle',
  'firstHeaderCellStyle',
  'lastHeaderCellStyle',
  'firstFooterCellStyle',
  'lastFooterCellStyle',
  'highlightFirstColumnStyle',
  'highlightLastColumnStyle',
] as const;
const THEME_SIZES = ['firstRowStripSize', 'secondRowStripSize', 'firstColumnStripSize', 'secondColumnStripSize'] as const;

export class TableTheme {
  private styles = new Map<string, Style>();
  sizes = new Map<string, number>();
  private themeName = '';
  private raw: ThemeJSON = {};
  constructor();
  constructor(data: ThemeJSON);
  constructor(data?: ThemeJSON) {
    if (data) this.load(data);
  }
  private load(data: ThemeJSON): void {
    this.styles.clear();
    this.resolved.clear();
    this.sizes.clear();
    this.raw = JSON.parse(JSON.stringify(data)) as ThemeJSON;
    this.themeName = data.name ?? '';
    for (const key of THEME_KEYS) {
      const style = styleFromTheme(data[key]);
      if (style) this.styles.set(key, style);
    }
    for (const key of THEME_SIZES) if (data[key] !== undefined) this.sizes.set(key, Number(data[key]));
  }
  private resolved = new Map<string, Style>();
  private paletteStyles = new WeakMap<object, Map<string, Style>>();
  _style(key: string, palette?: Record<string, string>): Style | undefined {
    let cache = this.resolved;
    if (palette) {
      let stored = this.paletteStyles.get(palette);
      if (!stored) this.paletteStyles.set(palette, stored = new Map());
      cache = stored;
    }
    let style = cache.get(key);
    if (!style) {
      const resolved = resolveThemeStyle(this.styles.get(key), palette);
      if (!resolved) return undefined;
      cache.set(key, (style = resolved));
    }
    return style;
  }
  _size(key: string): number | undefined {
    return this.sizes.get(key);
  }
  getter(key: string): unknown {
    if (key === 'name') return this.themeName;
    return this.styles.get(key);
  }
  setter(key: string, value: unknown): this {
    if (key === 'name') {
      this.themeName = String(value ?? '');
      this.raw.name = this.themeName;
    } else if (value === undefined) {
      this.styles.delete(key);
      delete (this.raw as Record<string, unknown>)[key];
    } else {
      const style = value instanceof Style ? value : styleFromProps(value);
      this.styles.set(key, style);
      this.resolved.clear();
      this.paletteStyles = new WeakMap();
      (this.raw as Record<string, unknown>)[key] = styleToJSON(style);
    }
    return this;
  }
  name(value?: string): string | this {
    return value === undefined ? (this.themeName as string) : this.setter('name', value);
  }
  toJSON(): JsonRecord {
    return JSON.parse(JSON.stringify(this.raw)) as JsonRecord;
  }
  fromJSON(data: object): void {
    this.load(data as ThemeJSON);
  }
}
for (const key of [...THEME_KEYS, ...THEME_SIZES]) {
  Object.defineProperty(TableTheme.prototype, key, {
    configurable: true,
    enumerable: false,
    get(this: TableTheme) {
      return this.getter(key);
    },
    set(this: TableTheme, value: unknown) {
      if (key.endsWith('Size')) this.sizes.set(key, Number(value));
      else this.setter(key, value);
    },
  });
}
function styleFromProps(value: unknown): Style {
  if (value instanceof Style) return value;
  const style = new Style();
  for (const [key, raw] of Object.entries(value as JsonRecord)) {
    if (raw && typeof raw === 'object' && key.startsWith('border')) {
      const border = raw as JsonRecord;
      style[key] = new LineBorder(String(border.color ?? 'black'), Number(border.style ?? 0));
    } else style[key] = raw;
  }
  return style;
}

const THEME_NAMES = [
  ...Array.from({ length: 21 }, (_, i) => `light${i + 1}`),
  ...Array.from({ length: 28 }, (_, i) => `medium${i + 1}`),
  ...Array.from({ length: 11 }, (_, i) => `dark${i + 1}`),
];
export class TableThemes {
  static [key: string]: unknown;
  constructor() {}
}
for (const name of THEME_NAMES) {
  const data = TABLE_THEME_JSON[name];
  if (!data) continue;
  const theme = new TableTheme(data);
  Object.defineProperty(TableThemes, name, { enumerable: true, value: theme, writable: true });
}
// The declared professional themes are absent from the reference runtime.
for (let i = 1; i <= 24; i++)
  Object.defineProperty(TableThemes, `professional${i}`, { enumerable: false, value: undefined, writable: true });

export function themeByName(name: string): TableTheme | undefined {
  const lower = name.toLowerCase();
  return (TableThemes[lower] as TableTheme | undefined) ?? undefined;
}

export class TableColumn {
  private _id: number;
  private fields: JsonRecord = {};
  constructor(
    id: number,
    dataField?: string,
    name?: string,
    formatter?: string,
    cellType?: unknown,
    value?: (...args: unknown[]) => unknown,
    headerStyle?: string | Style,
    dataStyle?: string | Style,
    footerStyle?: string | Style,
  ) {
    this._id = id;
    if (dataField !== undefined) this.fields.dataField = dataField;
    if (name !== undefined) this.fields.name = name;
    if (formatter !== undefined) this.fields.formatter = formatter;
    if (cellType !== undefined) this.fields.cellType = cellType;
    if (value !== undefined) this.fields.value = value;
    if (headerStyle !== undefined) this.fields.headerStyle = headerStyle;
    if (dataStyle !== undefined) this.fields.dataStyle = dataStyle;
    if (footerStyle !== undefined) this.fields.footerStyle = footerStyle;
  }
  private prop(key: string, value?: unknown): unknown {
    if (value === undefined) return this.fields[key];
    this.fields[key] = value;
    return this;
  }
  id(value?: number): unknown {
    if (value === undefined) return this._id;
    this._id = value;
    return this;
  }
  dataField(value?: string): unknown { return this.prop('dataField', value); }
  name(value?: string): unknown { return this.prop('name', value); }
  formatter(value?: string): unknown { return this.prop('formatter', value); }
  cellType(value?: unknown): unknown { return this.prop('cellType', value); }
  value(value?: (...args: unknown[]) => unknown): unknown { return this.prop('value', value); }
  headerStyle(value?: string | Style): unknown { return this.prop('headerStyle', value); }
  dataStyle(value?: string | Style): unknown { return this.prop('dataStyle', value); }
  footerStyle(value?: string | Style): unknown { return this.prop('footerStyle', value); }
  toJSON(): JsonRecord {
    const result: JsonRecord = { id: this._id };
    for (const key of ['dataField', 'name', 'value', 'formatter', 'cellType', 'headerStyle', 'dataStyle', 'footerStyle', 'dataAreaFormula', 'footerFormula']) {
      const value = this.fields[key];
      if (value === undefined) continue;
      if (typeof value === 'function') continue;
      const jsonKey = key === 'value' ? 'footerValue' : key;
      if (key === 'cellType' && value && typeof value === 'object' && 'toJSON' in value)
        result[jsonKey] = (value as { toJSON(): unknown }).toJSON();
      else result[jsonKey] = serializeValue(value);
    }
    return result;
  }
  fromJSON(data: object): void {
    const json = deserializeValue(data) as JsonRecord;
    if (json.id !== undefined) this._id = Number(json.id);
    for (const key of ['dataField', 'name', 'formatter', 'cellType', 'headerStyle', 'dataStyle', 'footerStyle', 'dataAreaFormula', 'footerFormula'])
      if (json[key] !== undefined) this.fields[key] = json[key];
    if (json.footerValue !== undefined) this.fields.value = json.footerValue;
    if (json.value !== undefined && this.fields.value === undefined) this.fields.value = json.value;
  }
}

export interface TableOptions {
  showHeader?: boolean;
  showFooter?: boolean;
  useFooterDropDownList?: boolean;
  showResizeHandle?: boolean;
}

export class Table {
  private sheet!: Worksheet;
  private tableName = 'Table1';
  private row = 0;
  private col = 0;
  private rowCount = 1;
  private colCount = 1;
  private options: Required<TableOptions> & { bandRows: boolean; bandColumns: boolean; highlightFirstColumn: boolean; highlightLastColumn: boolean; allowAutoExpand: boolean; autoGenerateColumns: boolean; bindingPath: string; expandBoundRows: boolean } = {
    showHeader: true,
    showFooter: false,
    useFooterDropDownList: false,
    showResizeHandle: false,
    bandRows: true,
    bandColumns: false,
    highlightFirstColumn: false,
    highlightLastColumn: false,
    allowAutoExpand: true,
    autoGenerateColumns: true,
    bindingPath: '',
    expandBoundRows: false,
  };
  private tableStyle!: TableTheme;
  private columns: TableColumn[] = [];
  private filter: HideRowFilter;
  private layoutStyles = new Map<number, JsonRecord>();
  private dataSource: unknown = null;
  private parsedFromJSON = false;
  private reservedElement: unknown = undefined;

  constructor(
    name?: string,
    row?: number,
    col?: number,
    rowCount?: number,
    colCount?: number,
    style?: string | TableTheme,
    options?: TableOptions,
  ) {
    this.tableName = name ?? 'Table1';
    this.row = row ?? 0;
    this.col = col ?? 0;
    this.rowCount = rowCount ?? 1;
    this.colCount = colCount ?? 1;
    if (options)
      for (const key of ['showHeader', 'showFooter', 'useFooterDropDownList', 'showResizeHandle'] as const)
        if (options[key] !== undefined) this.options[key] = options[key]!;
    if (this.options.showHeader) {
      this.row += 1;
      this.rowCount = Math.max(0, this.rowCount - 1);
    }
    if (this.options.showFooter) this.rowCount = Math.max(0, this.rowCount - 1);
    this.tableStyle = typeof style === 'string' ? themeByName(style) ?? TableThemes.medium2 as TableTheme : style ?? (TableThemes.medium2 as TableTheme);
    this.filter = new HideRowFilter();
    this.filter.showFilterButton = true;
    this.resetColumns();
  }
  _attach(sheet: Worksheet): void {
    this.sheet = sheet;
    const data = this.dataRange();
    this.filter.range = new Range(data.row, data.col, data.rowCount, data.colCount);
    this.filter.extendedRange = new Range(data.row, data.col, data.rowCount, data.colCount);
    this.filter._attach(sheet);
    for (let c = 0; c < this.colCount; c++) this.filter.filterButtonVisible(c, true);
    if (this.options.showHeader) {
      // Existing header text becomes the column names and must not be overwritten.
      for (let c = 0; c < this.colCount; c++) {
        const existing = sheet.getValue(this.headerIndex(), this.col + c);
        if (existing != null && String(existing) !== '') this.columns[c]?.name(String(existing));
      }
      this.writeHeaderValues();
    }
    if (this.options.showFooter) {
      const footerValueRow = this.footerIndex() - (this.options.showHeader ? 1 : 0);
      for (let c = 0; c < this.colCount; c++) {
        const column = this.columns[c] as unknown as { fields: JsonRecord };
        if (typeof column?.fields.footerFormula === 'string') continue;
        const value = sheet.getValue(footerValueRow, this.col + c);
        if (value != null) column.fields.value = value;
      }
    }
  }
  _isAttached(): boolean {
    return !!this.sheet;
  }
  private writeHeaderValues(): void {
    const header = this.headerIndex();
    if (header < 0) return;
    for (let c = 0; c < this.colCount; c++)
      this.sheet.setValue(header, this.col + c, this.getColumnName(c));
  }
  private resetColumns(): void {
    this.columns = Array.from({ length: this.colCount }, (_, index) => {
      const existing = this.sheet && this.options.showHeader ? this.sheet.getValue(this.headerIndex(), this.col + index) : undefined;
      const name = existing != null && String(existing) !== '' ? String(existing) : `Column${index + 1}`;
      return new TableColumn(index + 1, undefined, name);
    });
  }
  name(value?: string): unknown {
    if (value === undefined) return this.tableName;
    if (!isValidTableName(value)) throw new Error('The table name is not valid.');
    if (this.sheet && this.sheet.tables.findByName(value) && this.sheet.tables.findByName(value) !== this)
      throw new Error('The current worksheet already exists in a table with the same name.');
    this.tableName = value;
    this.sheet?._tablesChanged();
    return this;
  }
  range(): Range {
    const start = this.options.showHeader ? this.row - 1 : this.row;
    return new Range(
      start,
      this.col,
      this.rowCount + (this.options.showHeader ? 1 : 0) + (this.options.showFooter ? 1 : 0),
      this.colCount,
    );
  }
  dataRange(): Range {
    return new Range(this.row, this.col, this.rowCount, this.colCount);
  }
  headerIndex(): number {
    return this.options.showHeader ? this.row - 1 : -1;
  }
  footerIndex(): number {
    return this.options.showFooter ? this.row + this.rowCount : -1;
  }
  showHeader(value?: boolean): unknown {
    if (value === undefined) return this.options.showHeader;
    if (this.options.showHeader === value) return this;
    this.options.showHeader = value;
    if (this.sheet) {
      const data = this.dataRange();
      this.filter.range = new Range(data.row, data.col, data.rowCount, data.colCount);
      if (value) this.writeHeaderValues();
      else this.filter._clearButtons();
    }
    return this;
  }
  showFooter(value?: boolean, isFooterInserted?: boolean): unknown {
    if (value === undefined) return this.options.showFooter;
    if (this.options.showFooter === value) return this;
    this.options.showFooter = value;
    if (value) {
      if (this.sheet && isFooterInserted === false) {
        this.sheet.addRows(this.footerIndex(), 1);
      }
      if (this.sheet) this.writeFooterValues();
    }
    if (this.sheet) {
      const data = this.dataRange();
      this.filter.range = new Range(data.row, data.col, data.rowCount, data.colCount);
    }
    return this;
  }
  useFooterDropDownList(value?: boolean): unknown {
    if (value === undefined) return this.options.useFooterDropDownList;
    this.options.useFooterDropDownList = value;
    return this;
  }
  showResizeHandle(value?: boolean): unknown {
    if (value === undefined) return this.options.showResizeHandle;
    this.options.showResizeHandle = value;
    return this;
  }
  bandRows(value?: boolean): unknown {
    if (value === undefined) return this.options.bandRows;
    this.options.bandRows = value;
    return this;
  }
  bandColumns(value?: boolean): unknown {
    if (value === undefined) return this.options.bandColumns;
    this.options.bandColumns = value;
    return this;
  }
  highlightFirstColumn(value?: boolean): unknown {
    if (value === undefined) return this.options.highlightFirstColumn;
    this.options.highlightFirstColumn = value;
    return this;
  }
  highlightLastColumn(value?: boolean): unknown {
    if (value === undefined) return this.options.highlightLastColumn;
    this.options.highlightLastColumn = value;
    return this;
  }
  allowAutoExpand(value?: boolean): unknown {
    if (value === undefined) return this.options.allowAutoExpand;
    this.options.allowAutoExpand = value;
    return this;
  }
  autoGenerateColumns(value?: boolean): unknown {
    if (value === undefined) return this.options.autoGenerateColumns;
    this.options.autoGenerateColumns = value;
    return this;
  }
  expandBoundRows(value?: boolean): unknown {
    if (value === undefined) return this.options.expandBoundRows;
    this.options.expandBoundRows = value;
    return this;
  }
  bindingPath(value?: string): unknown {
    if (value === undefined) return this.options.bindingPath;
    this.options.bindingPath = value;
    this._refreshBinding();
    return this;
  }
  style(value?: string | TableTheme): unknown {
    if (value === undefined) {
      const copy = new TableTheme(this.tableStyle.toJSON() as ThemeJSON);
      return copy;
    }
    this.tableStyle = typeof value === 'string' ? themeByName(value) ?? this.tableStyle : value;
    this.sheet?.invalidateLayout();
    return this;
  }
  getStyleName(): string | undefined {
    const name = this.tableStyle?.name?.();
    return name ? String(name).toLowerCase() : undefined;
  }
  filterButtonVisible(tableColumnIndex?: number | boolean, value?: boolean): unknown {
    if (tableColumnIndex === undefined) {
      if (!this.options.showHeader) return false;
      let any = false;
      for (let c = 0; c < this.colCount; c++) if (this.filter.filterButtonVisible(c) !== false) any = true;
      return any;
    }
    if (typeof tableColumnIndex === 'boolean') {
      for (let c = 0; c < this.colCount; c++) this.filter.filterButtonVisible(c, tableColumnIndex);
      return this;
    }
    if (value === undefined) return this.filter.filterButtonVisible(tableColumnIndex);
    this.filter.filterButtonVisible(tableColumnIndex, value);
    return this;
  }
  rowFilter(): HideRowFilter {
    this.filter._table(this.tableName);
    return this.filter;
  }
  getColumnName(tableColumnIndex: number): string {
    return String(this.columns[tableColumnIndex]?.name() ?? '');
  }
  setColumnName(tableColumnIndex: number, name: string): this {
    const column = this.columns[tableColumnIndex];
    if (column) {
      column.name(name);
      if (this.options.showHeader) this.sheet?.setValue(this.headerIndex(), this.col + tableColumnIndex, name);
      this.sheet?._tablesChanged();
    }
    return this;
  }
  getColumnDataField(tableColumnIndex: number): string {
    return String(this.columns[tableColumnIndex]?.dataField() ?? '');
  }
  setColumnDataField(tableColumnIndex: number, dataField: string): this {
    this.columns[tableColumnIndex]?.dataField(dataField);
    return this;
  }
  getColumnFormula(tableColumnIndex: number): string {
    const fields = (this.columns[tableColumnIndex] as unknown as { fields: JsonRecord }).fields;
    return String(fields.formula ?? fields.footerFormula ?? '');
  }
  setColumnFormula(tableColumnIndex: number, formula: string): this {
    const column = this.columns[tableColumnIndex] as unknown as { fields: JsonRecord };
    if (column) {
      const canonical = formula.replace(/(^|[^A-Za-z0-9_])\[([^\]]+)\]/g, (_m, prefix: string, inner: string) =>
        /^#|^@/.test(inner) ? `${prefix}[${inner}]` : `${prefix}${this.tableName}[${inner}]`,
      );
      column.fields.formula = formula;
      // The footer formula is qualified only when a footer actually exists.
      column.fields.footerFormula = this.options.showFooter ? canonical : formula;
      if (this.sheet && this.options.showFooter) {
        this.sheet.setFormula(this.footerIndex(), this.col + tableColumnIndex, canonical);
      }
    }
    return this;
  }
  setColumnDataFormula(tableColumnIndex: number, formula: string | null): this {
    const column = this.columns[tableColumnIndex] as unknown as { fields: JsonRecord };
    if (column) {
      if (formula == null) delete column.fields.dataAreaFormula;
      else column.fields.dataAreaFormula = formula;
    }
    return this;
  }
  private writeDataFormulas(): void {
    if (!this.sheet) return;
    const data = this.dataRange();
    for (let c = 0; c < this.colCount; c++) {
      const formula = (this.columns[c] as unknown as { fields: JsonRecord })?.fields.dataAreaFormula;
      if (typeof formula !== 'string') continue;
      for (let r = data.row; r < data.row + data.rowCount; r++)
        this.sheet.setFormula(r, this.col + c, formula);
    }
  }
  getColumnValue(tableColumnIndex: number): unknown {
    const column = this.columns[tableColumnIndex] as unknown as { fields: JsonRecord };
    return column?.fields.value ?? null;
  }
  setColumnValue(tableColumnIndex: number, value: object): this {
    const column = this.columns[tableColumnIndex] as unknown as { fields: JsonRecord };
    if (column) column.fields.value = value;
    return this;
  }
  columnLayoutStyle(tableColumnIndex: number, value?: JsonRecord): unknown {
    if (value === undefined) return this.layoutStyles.get(tableColumnIndex) ?? {};
    this.layoutStyles.set(tableColumnIndex, value);
    return this;
  }
  layoutStyle(value?: JsonRecord): unknown {
    if (value === undefined) return Object.fromEntries(this.layoutStyles);
    for (const [index, style] of Object.entries(value)) this.layoutStyles.set(Number(index), style as JsonRecord);
    return this;
  }
  private writeFooterValues(): void {
    if (!this.sheet || !this.options.showFooter) return;
    const footer = this.footerIndex();
    for (let c = 0; c < this.colCount; c++) {
      const raw = (this.columns[c] as unknown as { fields: JsonRecord })?.fields.footerFormula;
      if (typeof raw === 'string') this.sheet.setFormula(footer, this.col + c, raw);
    }
  }
  getBindingSource(): object | null {
    return (this.dataSource as object) ?? null;
  }
  getDirtyRows(): unknown[] {
    return [];
  }
  clearPendingChanges(): void {}
  isTableLayoutDirty(): boolean {
    return false;
  }
  getSlicerData(): unknown {
    return null;
  }
  adjustTableRangeForBind(): void { this._refreshBinding(); }
  private boundRecords(): Record<string, unknown>[] | null {
    const source = this.dataSource ?? this.sheet?.getDataSource();
    const records = source instanceof CellBindingSource ? source.getValue(this.options.bindingPath) : this.options.bindingPath ? getPath(source, this.options.bindingPath) : source;
    return Array.isArray(records) ? records : null;
  }
  _refreshBinding(): void {
    const records = this.boundRecords(); if (!records || !this.sheet) return;
    this.sheet._enableBindings();
    if (this.options.autoGenerateColumns && !this.columns.some(c => c.dataField())) this.columns = Object.keys(records[0] ?? {}).map((key, i) => new TableColumn(i + 1, key, key));
    this.colCount = Math.max(1, this.columns.length);
    this.rowCount = records.length;
    this.sheet.suspendPaint(); this.sheet.suspendDirty();
    try { this.writeHeaderValues(); const range = this.dataRange(); for (let r = 0; r < records.length; r++) for (let c = 0; c < this.columns.length; c++) { const path = String(this.columns[c].dataField() ?? this.columns[c].name() ?? ''); this.sheet.setValue(range.row + r, range.col + c, getPath(records[r], path)); } }
    finally { this.sheet.resumeDirty(); this.sheet.resumePaint(); }
    this.sheet._tablesChanged();
  }
  _bindingValue(row: number, col: number): { value: unknown } | undefined { const records = this.boundRecords(), range = this.dataRange(); if (!records || !range.contains(row, col)) return undefined; const record = records[row - range.row], column = this.columns[col - range.col]; return { value: record && column ? getPath(record, String(column.dataField() ?? column.name())) : null }; }
  _setBindingValue(row: number, col: number, value: unknown): void { const records = this.boundRecords(), range = this.dataRange(); if (!records || !range.contains(row, col)) return; const record = records[row - range.row], column = this.columns[col - range.col]; if (record && column) setPath(record, String(column.dataField() ?? column.name()), value); }
  bind(columns: TableColumn[], path?: string, dataSource?: object | string): this {
    this.bindColumns(columns);
    if (path !== undefined) this.options.bindingPath = path;
    if (dataSource !== undefined) this.dataSource = dataSource;
    this._refreshBinding();
    return this;
  }
  bindColumns(columns: TableColumn[]): void {
    this.columns = columns;
    if (this.sheet) this.writeHeaderValues();
  }

  /** Internal: auto-expands by rows/columns. */
  _grow(rows: number, cols: number): void {
    this.rowCount += rows;
    this.colCount += cols;
    if (cols > 0)
      while (this.columns.length < this.colCount) {
        const column = new TableColumn(this.columns.length + 1, undefined, `Column${this.columns.length + 1}`);
        this.columns.push(column);
      }
    if (this.sheet) this.writeHeaderValues();
    this.sheet?.invalidateLayout();
  }

  /** Internal: applies a new range (TableManager.resize). */
  _resize(range: Range): void {
    const previousCol = this.col;
    const delta = range.col - previousCol;
    this.col = range.col;
    this.colCount = range.colCount;
    this.row = range.row + (this.options.showHeader ? 1 : 0);
    this.rowCount = Math.max(
      0,
      range.rowCount - (this.options.showHeader ? 1 : 0) - (this.options.showFooter ? 1 : 0),
    );
    if (delta > 0) {
      const dropped = this.columns.splice(0, delta);
      this.columns.push(...dropped);
      while (this.columns.length < this.colCount) {
        const column = new TableColumn(this.columns.length + 1, undefined, `Column${this.columns.length + 1}`);
        this.columns.push(column);
      }
    } else if (delta < 0) {
      for (let i = 0; i < -delta; i++) {
        const column = new TableColumn(i + 1, undefined, `Column${i + 1}`);
        this.columns.unshift(column);
      }
      if (this.columns.length > this.colCount) this.columns.length = this.colCount;
    }
    while (this.columns.length < this.colCount) {
      const column = new TableColumn(this.columns.length + 1, undefined, `Column${this.columns.length + 1}`);
      this.columns.push(column);
    }
    if (this.columns.length > this.colCount) this.columns.length = this.colCount;
    if (this.filter._hasButtons())
      for (let c = 0; c < this.colCount; c++) if (this.filter.filterButtonVisible(c) === undefined) this.filter.filterButtonVisible(c, true);
    if (this.sheet) this.writeHeaderValues();
  }
  /** Internal: repositions the table without reordering its columns. */
  _move(row: number, col: number): void {
    this.row = row + (this.options.showHeader ? 1 : 0);
    this.col = col;
    if (this.sheet) this.writeHeaderValues();
  }
  /** Internal: shifts table bounds after a row/column structural change. */
  _shift(axis: 'row' | 'col', index: number, amount: number, remove: boolean): void {
    const range = this.range();
    const start = axis === 'row' ? range.row : this.col;
    const count = axis === 'row' ? range.rowCount : this.colCount;
    const end = start + count;
    const pos = axis === 'row' ? this.row : this.col;
    const dataEnd = pos + (axis === 'row' ? this.rowCount : this.colCount);
    if (remove) {
      const removed = Math.max(0, Math.min(end, index + amount) - Math.max(start, index));
      if (axis === 'row')
        this.rowCount = Math.max(
          0,
          this.rowCount - Math.max(0, Math.min(dataEnd, index + amount) - Math.max(pos, index)),
        );
      else this.colCount = Math.max(1, this.colCount - removed);
      if (start >= index + amount) {
        if (axis === 'row') this.row -= amount;
        else this.col -= amount;
      }
    } else if (index <= start) {
      if (axis === 'row') this.row += amount;
      else this.col += amount;
    } else if (index < end) {
      if (axis === 'row') this.rowCount += amount;
      else this.colCount += amount;
    }
  }

  /** Resolved role style for a sheet cell; null when the cell is outside this table. */
  _styleFor(row: number, col: number): Style | null {
    const header = this.headerIndex(),
      footer = this.footerIndex();
    const data = this.dataRange();
    if (col < this.col || col >= this.col + this.colCount) return null;
    if (row !== header && row !== footer && !(row >= data.row && row < data.row + data.rowCount)) return null;
    const result = new Style();
    const palette = this.sheet?._ioThemeColors;
    const role = (key: keyof ThemeJSON) => this.tableStyle._style(key, palette);
    const c = col - this.col;
    if (row === header) {
      mergeStyle(result, role('headerRowStyle'));
      if (c === 0) mergeStyle(result, role('firstHeaderCellStyle'));
      if (c === this.colCount - 1) mergeStyle(result, role('lastHeaderCellStyle'));
      if (this.options.highlightFirstColumn && c === 0) mergeStyle(result, role('highlightFirstColumnStyle'));
      if (this.options.highlightLastColumn && c === this.colCount - 1) mergeStyle(result, role('highlightLastColumnStyle'));
      const whole = this.tableStyle._style('wholeTableStyle', palette);
      const borders = result as JsonRecord;
      if (!borders.borderTop && whole?.borderTop) borders.borderTop = cloneBorder(whole.borderTop);
      if (!borders.borderBottom && whole?.borderBottom) borders.borderBottom = cloneBorder(whole.borderBottom);
      if (c === 0 && !borders.borderLeft && whole?.borderLeft) borders.borderLeft = cloneBorder(whole.borderLeft);
      if (c === this.colCount - 1 && !borders.borderRight && whole?.borderRight) borders.borderRight = cloneBorder(whole.borderRight);
    } else if (row === footer) {
      mergeStyle(result, role('footerRowStyle'));
      if (c === 0) mergeStyle(result, role('firstFooterCellStyle'));
      if (c === this.colCount - 1) mergeStyle(result, role('lastFooterCellStyle'));
      const whole = this.tableStyle._style('wholeTableStyle', palette);
      const borders = result as JsonRecord;
      if (!borders.borderTop && whole?.borderTop) borders.borderTop = cloneBorder(whole.borderTop);
      if (!borders.borderBottom && whole?.borderBottom) borders.borderBottom = cloneBorder(whole.borderBottom);
      if (c === 0 && !borders.borderLeft && whole?.borderLeft) borders.borderLeft = cloneBorder(whole.borderLeft);
      if (c === this.colCount - 1 && !borders.borderRight && whole?.borderRight) borders.borderRight = cloneBorder(whole.borderRight);
    } else {
      const whole = this.tableStyle._style('wholeTableStyle', palette);
      if (whole) {
        const backgrounds = Object.assign(new Style(), whole);
        delete backgrounds.borderLeft;
        delete backgrounds.borderTop;
        delete backgrounds.borderRight;
        delete backgrounds.borderBottom;
        delete backgrounds.borderHorizontal;
        delete backgrounds.borderVertical;
        mergeStyle(result, backgrounds);
      }
      const r = row - data.row;
      const isFirstRow = r === 0, isLastRow = r === data.rowCount - 1;
      if (this.options.bandRows)
        mergeStyle(result, role(r % 2 === 0 ? 'firstRowStripStyle' : 'secondRowStripStyle'));
      if (this.options.bandColumns)
        mergeStyle(result, role(c % 2 === 0 ? 'firstColumnStripStyle' : 'secondColumnStripStyle'));
      if (this.options.highlightFirstColumn && c === 0) mergeStyle(result, role('highlightFirstColumnStyle'));
      if (this.options.highlightLastColumn && c === this.colCount - 1) mergeStyle(result, role('highlightLastColumnStyle'));
      const borders = result as JsonRecord;
      const horizontal = whole?.borderHorizontal;
      if (horizontal) {
        borders.borderTop = cloneBorder(horizontal);
        borders.borderBottom = cloneBorder(horizontal);
      }
      if (isFirstRow && whole?.borderTop) borders.borderTop = cloneBorder(whole.borderTop);
      if (isLastRow && whole?.borderBottom) borders.borderBottom = cloneBorder(whole.borderBottom);
      if (c === 0 && whole?.borderLeft) borders.borderLeft = cloneBorder(whole.borderLeft);
      if (c === this.colCount - 1 && whole?.borderRight) borders.borderRight = cloneBorder(whole.borderRight);
    }
    const tableColumn = this.columns[c];
    const layout = this.layoutStyles.get(c);
    if (layout) {
      const kind = row === header ? 'header' : row === footer ? 'footer' : 'data';
      const style = layout[kind];
      if (style) mergeStyle(result, typeof style === 'string' ? undefined : styleFromProps(style));
    } else if (tableColumn) {
      const kind = row === header ? 'headerStyle' : row === footer ? 'footerStyle' : 'dataStyle';
      const style = (tableColumn as unknown as { fields: JsonRecord }).fields[kind];
      if (style instanceof Style) mergeStyle(result, style);
      else if (typeof style === 'object' && style) mergeStyle(result, styleFromProps(style));
    }
    const borders = result as JsonRecord;
    delete borders.borderHorizontal;
    delete borders.borderVertical;
    if (c !== 0) delete borders.borderLeft;
    if (c !== this.colCount - 1) delete borders.borderRight;
    if (!Object.keys(result).length) return null;
    return result;
  }
  toJSON(): JsonRecord {
    const range = this.range();
    const result: JsonRecord = {
      name: this.tableName,
      row: range.row,
      col: range.col,
      rowCount: range.rowCount,
      colCount: range.colCount,
    };
    if (!this.options.showHeader) result.showHeader = false;
    if (this.options.showFooter) result.showFooter = true;
    if (this.options.useFooterDropDownList) result.useFooterDropDownList = true;
    if (!this.options.bandRows) result.bandRows = false;
    if (this.options.bandColumns) result.bandColumns = true;
    if (this.options.highlightFirstColumn) result.highlightFirstColumn = true;
    if (this.options.highlightLastColumn) result.highlightLastColumn = true;
    if (this.options.showResizeHandle) result.showResizeHandle = true;
    if (!this.options.allowAutoExpand) result.allowAutoExpand = false;
    if (!this.options.autoGenerateColumns) result.autoGenerateColumns = false;
    if (this.options.bindingPath) result.bindingPath = this.options.bindingPath;
    if (this.options.expandBoundRows) result.expandBoundRows = true;
    if (Object.keys(this.layoutStyles).length)
      result.layoutStyle = Object.fromEntries(
        [...this.layoutStyles].map(([index, style]) => [
          index,
          Object.fromEntries(Object.entries(style).map(([kind, value]) => [kind, styleToJSON(value as Style)])),
        ]),
      );
    result.reservedElement = this.reservedElement;
    const styleName = this.getStyleName();
    result.style = styleName;
    const dataRange = this.dataRange();
    this.filter.range = new Range(dataRange.row, dataRange.col, dataRange.rowCount, dataRange.colCount);
    const filterJSON = filterToJSON(this.filter, this.tableName);
    if (this.filter._hasButtons()) {
      const visible: Record<string, boolean> = {};
      for (let c = 0; c < this.colCount; c++) visible[c] = this.filter.filterButtonVisible(c) !== false;
      filterJSON.filterButtonVisibleInfo = visible;
    } else delete filterJSON.filterButtonVisibleInfo;
    result.rowFilter = filterJSON;
    result.columns = this.columns.map((column) => column.toJSON());
    return result;
  }
  fromJSON(settings: object): void {
    const json = objectRecord(settings);
    this.parsedFromJSON = true;
    this.reservedElement = json.reservedElement;
    this.tableName = String(json.name ?? this.tableName);
    this.col = Number(json.col ?? 0);
    this.colCount = Number(json.colCount ?? 1);
    this.options.showHeader = json.showHeader !== false;
    this.options.showFooter = json.showFooter === true;
    const totalRows = Number(json.rowCount ?? 1);
    this.row = Number(json.row ?? 0) + (this.options.showHeader ? 1 : 0);
    this.rowCount = Math.max(
      0,
      totalRows - (this.options.showHeader ? 1 : 0) - (this.options.showFooter ? 1 : 0),
    );
    this.options.useFooterDropDownList = json.useFooterDropDownList === true;
    this.options.bandRows = json.bandRows !== false;
    this.options.bandColumns = json.bandColumns === true;
    this.options.highlightFirstColumn = json.highlightFirstColumn === true;
    this.options.highlightLastColumn = json.highlightLastColumn === true;
    this.options.showResizeHandle = json.showResizeHandle === true;
    this.options.allowAutoExpand = json.allowAutoExpand !== false;
    this.options.autoGenerateColumns = json.autoGenerateColumns !== false;
    this.options.bindingPath = String(json.bindingPath ?? '');
    this.options.expandBoundRows = json.expandBoundRows === true;
    this.tableStyle = themeByName(String(json.style ?? 'medium2')) ?? (TableThemes.medium2 as TableTheme);
    this.filter = filterFromJSON(json.rowFilter ?? {}, true);
    this.columns = [];
    for (const raw of Array.isArray(json.columns) ? json.columns : []) {
      const column = new TableColumn(Number(objectRecord(raw).id ?? this.columns.length + 1));
      column.fromJSON(raw as object);
      this.columns.push(column);
    }
    if (!this.columns.length) this.resetColumns();
    const layout = json.layoutStyle as JsonRecord | undefined;
    this.layoutStyles.clear();
    if (layout)
      for (const [index, style] of Object.entries(layout))
        this.layoutStyles.set(Number(index), style as JsonRecord);
  }
}
function cloneBorder(value: unknown): LineBorder {
  const border = value as LineBorder;
  const copy = new LineBorder(border.color, border.style);
  (copy as unknown as JsonRecord).level = 20;
  return copy;
}
function objectRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' ? (value as JsonRecord) : {};
}
export function isValidTableName(name: string): boolean {
  if (!/^[A-Za-z_][A-Za-z0-9_.]*$/.test(name)) return false;
  if (/^(TRUE|FALSE)$/i.test(name)) return false;
  // Names that parse as a cell reference are rejected by the trial.
  if (/^[A-Za-z]{1,3}\d+$/.test(name)) return false;
  if (/^R\d+C\d+$/i.test(name)) return false;
  return true;
}

export class CustomTableThemeManager {
  private themes = new Map<string, TableTheme>();
  constructor(private workbook?: unknown) {}
  add(theme: string | TableTheme): TableTheme | undefined {
    const name = typeof theme === 'string' ? theme : String(theme.name?.() ?? '');
    if (!name || this.themes.has(name.toLowerCase())) return undefined;
    const instance = typeof theme === 'string' ? (themeByName(theme) ?? new TableTheme()) : theme;
    if (typeof theme === 'string') (instance as TableTheme).name(theme);
    this.themes.set(name.toLowerCase(), instance);
    return instance;
  }
  all(): TableTheme[] { return [...this.themes.values()]; }
  get(name: string): TableTheme | undefined { return this.themes.get(name.toLowerCase()); }
  remove(name: string): void { this.themes.delete(name.toLowerCase()); }
  update(oldThemeName: string, newTheme: TableTheme): void {
    this.themes.set(oldThemeName.toLowerCase(), newTheme);
  }
}

export class TableManager {
  private tables: Table[] = [];
  constructor(private sheet: Worksheet) {}
  _hasAny(): boolean { return this.tables.length > 0; }
  add(
    name?: string,
    row?: number,
    column?: number,
    rowCount?: number,
    columnCount?: number,
    style?: string | TableTheme,
    options?: TableOptions,
  ): Table {
    const tableName = name ?? this.nextName();
    if (!isValidTableName(tableName)) throw new Error('The table name is not valid.');
    const r = row ?? 0, c = column ?? 0, rc = rowCount ?? 1, cc = columnCount ?? 1;
    const range = new Range(r, c, rc, cc);
    if (range.row + range.rowCount > this.sheet.getRowCount() || range.col + range.colCount > this.sheet.getColumnCount())
      throw new RangeError('Table range is outside the worksheet');
    for (const existing of this.tables)
      if (existing.range().intersect(r, c, rc, cc)) throw new Error('The tables cannot be intersected.');
    if (this.findByName(tableName)) throw new Error('The current worksheet already exists in a table with the same name.');
    const table = new Table(tableName, r, c, rc, cc, style, options);
    table._attach(this.sheet);
    this.tables.push(table);
    this.sheet._tablesChanged();
    return table;
  }
  addFromDataSource(
    name: string,
    row: number,
    column: number,
    dataSource: unknown,
    style?: TableTheme,
    options?: TableOptions,
  ): Table {
    const rows = Array.isArray(dataSource) ? dataSource : [];
    const columns = rows.length ? Object.keys(rows[0] as object) : [];
    const table = this.add(name, row, column, rows.length + 1, Math.max(1, columns.length), style, options);
    table.bind(
      columns.map((field, index) => new TableColumn(index + 1, field, field)),
      undefined,
      dataSource as object,
    );
    rows.forEach((item, index) => {
      for (let c = 0; c < columns.length; c++)
        this.sheet.setValue(row + 1 + index, column + c, (item as JsonRecord)[columns[c]!]);
    });
    return table;
  }
  private nextName(): string {
    let index = this.tables.length + 1;
    while (this.findByName(`Table${index}`)) index++;
    return `Table${index}`;
  }
  all(): Table[] {
    return [...this.tables];
  }
  find(row: number, column: number): Table | null {
    return this.tables.find((table) => {
      const range = table.range();
      return row >= range.row && row < range.row + range.rowCount && column >= range.col && column < range.col + range.colCount;
    }) ?? null;
  }
  findByName(name: string): Table | null {
    return this.tables.find((table) => String(table.name()).toLowerCase() === name.toLowerCase()) ?? null;
  }
  remove(table: Table | string, options: number): Table | null {
    const target = typeof table === 'string' ? this.findByName(table) : table;
    if (!target) return null;
    const index = this.tables.indexOf(target);
    if (index < 0) return null;
    const range = target.range();
    this.tables.splice(index, 1);
    if (!(options & 1)) {
      for (const [row, col] of rangeCells(range))
        if (row >= 0 && col >= 0) this.sheet.setValue(row, col, null);
    }
    if (!(options & 2))
      for (const [row, col] of rangeCells(range))
        if (row >= 0 && col >= 0) this.sheet.setStyle(row, col, null);
    this.sheet._tablesChanged();
    return target;
  }
  resize(table: Table | string, range: Range): void {
    const target = typeof table === 'string' ? this.findByName(table) : table;
    if (!target) return;
    const info = {
      sheet: this.sheet,
      sheetName: this.sheet.name(),
      table: target,
      newRange: new Range(range.row, range.col, range.rowCount, range.colCount),
      cancel: false,
    };
    this.sheet._emit(Events.TableResizing, info);
    if (info.cancel) return;
    target._resize(range);
    this.sheet._tablesChanged();
    this.sheet._emit(Events.TableResized, info);
  }
  move(table: Table | string, row: number, column: number): void {
    const target = typeof table === 'string' ? this.findByName(table) : table;
    if (!target) return;
    const current = target.range();
    const info = {
      sheet: this.sheet,
      sheetName: this.sheet.name(),
      table: target,
      newRange: new Range(row, column, current.rowCount, current.colCount),
      cancel: false,
    };
    this.sheet._emit(Events.TableResizing, info);
    if (info.cancel) return;
    target._move(row, column);
    this.sheet._tablesChanged();
    this.sheet._emit(Events.TableResized, info);
  }
  convertFromDataTable(table: Table | string): Table { return typeof table === 'string' ? this.findByName(table)! : table; }
  convertToDataTable(table: Table | string): Table { return typeof table === 'string' ? this.findByName(table)! : table; }
  _fromJSON(json: unknown): void {
    for (const raw of Array.isArray(json) ? json : []) {
      const table = new Table();
      table.fromJSON(raw as object);
      table._attach(this.sheet);
      this.tables.push(table);
    }
  }
  _clear(): void {
    this.tables = [];
  }
  _shift(axis: 'row' | 'col', index: number, amount: number, remove: boolean): void {
    for (const table of this.tables) table._shift(axis, index, amount, remove);
  }
}
function* rangeCells(range: Range): Generator<[number, number]> {
  for (let r = 0; r < range.rowCount; r++)
    for (let c = 0; c < range.colCount; c++) yield [range.row + r, range.col + c];
}
