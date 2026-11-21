/*
 * Printing model: PaperSize / PrintInfo, page splitting (paginator) and the
 * browser print document. Contract: the public `GC.Spread.Sheets.Print`
 * namespace of @mescius/spread-sheets 19.2.5 (public d.ts plus the trial's
 * public runtime surface; the paper-size table and defaults were read from
 * the trial through that public surface). Linear sizes are hundredths of an
 * inch; the paginator converts to CSS pixels at 96 dpi for page geometry.
 */
import { GC } from './generated/enums.js';
import type { Worksheet } from './worksheet.js';
import type { Workbook } from './workbook.js';

const Print = GC.Spread.Sheets.Print;

/** Hundredths of an inch -> CSS pixels at 96 dpi. */
export const HUNDREDTHS_TO_PX = 0.96;

export function paperSizePx(hundredths: number): number {
  return hundredths * HUNDREDTHS_TO_PX;
}

/** Column index to A1 letters. */
export function colLetters(index: number): string {
  let letters = '', n = index;
  for (; n >= 0; n = Math.floor(n / 26) - 1) letters = String.fromCharCode(65 + (n % 26)) + letters;
  return letters;
}

/** Quote a sheet name for use inside a formula reference. */
export function quoteSheetName(name: string): string {
  return /^[A-Za-z_][A-Za-z0-9_.]*$/.test(name) ? name : `'${name.replaceAll("'", "''")}'`;
}

/** Build the `Sheet!$A$1:$B$2` formula string for an inclusive 0-based range. */
export function printAreaFormula(sheetName: string, row1: number, col1: number, row2: number, col2: number): string {
  const start = `$${colLetters(col1)}$${row1 + 1}`;
  // Trial (TASK 75 sweep): a one-cell print area keeps the single-address form.
  const end = row1 === row2 && col1 === col2 ? '' : `:$${colLetters(col2)}$${row2 + 1}`;
  return `${quoteSheetName(sheetName)}!${start}${end}`;
}

/* ------------------------------------------------------------------ paper */

/**
 * Paper sizes in hundredths of an inch, keyed by `PaperKind` value
 * (width x height in portrait orientation).
 */
const PAPER_SIZES: Record<number, [number, number]> = {
  0: [0, 0], 1: [850, 1100], 2: [850, 1100], 3: [1100, 1700], 4: [1700, 1100],
  5: [850, 1400], 6: [550, 850], 7: [725, 1050], 8: [1169.2913385826773, 1653.5433070866145],
  9: [826.7716535433073, 1169.2913385826773], 10: [826.7716535433073, 1169.2913385826773],
  11: [582.6771653543308, 826.7716535433073], 12: [984.2519685039371, 1389.763779527559],
  13: [692.9133858267717, 984.2519685039371], 14: [850, 1300], 15: [846.456692913386, 1082.6771653543308],
  16: [1000, 1400], 17: [1100, 1700], 18: [850, 1100], 19: [387.5, 887.5], 20: [412.5, 950],
  21: [450, 1037.5], 22: [475, 1100], 23: [500, 1150], 24: [1700, 2200], 25: [2200, 3400],
  26: [3400, 4400], 27: [433.0708661417323, 866.1417322834646], 28: [637.7952755905512, 901.5748031496063],
  29: [1275.5905511811025, 1803.1496062992126], 30: [901.5748031496063, 1275.5905511811025],
  31: [448.81889763779526, 637.7952755905512], 32: [448.81889763779526, 901.5748031496063],
  33: [984.2519685039371, 1389.763779527559], 34: [692.9133858267717, 984.2519685039371],
  35: [692.9133858267717, 492.12598425196853], 36: [433.0708661417323, 905.511811023622],
  37: [387.5, 750], 38: [362.5, 650], 39: [1487.5, 1100], 40: [850, 1200], 41: [850, 1300],
  42: [984.2519685039371, 1389.763779527559], 43: [393.7007874015748, 582.6771653543308],
  44: [900, 1100], 45: [1000, 1100], 46: [1500, 1100], 47: [866.1417322834646, 866.1417322834646],
  49: [850, 1100], 50: [927.5, 1200], 51: [927.5, 1500], 52: [1169, 1800],
  53: [929.1338582677166, 1267.716535433071], 54: [827.5, 1100], 55: [826.7716535433073, 1169.2913385826773],
  56: [927.5, 1200], 57: [893.7007874015749, 1401.5748031496064], 58: [1200.7874015748032, 1917.3228346456692],
  59: [850, 1269], 60: [826.7716535433073, 1299.2125984251968], 61: [582.6771653543308, 826.7716535433073],
  62: [716.5354330708662, 1011.8110236220472], 63: [1267.716535433071, 1751.968503937008],
  64: [685.0393700787401, 925.196850393701], 65: [791.3385826771654, 1086.6141732283465],
  66: [1653.5433070866145, 2338.5826771653547], 67: [1169.2913385826773, 1653.5433070866145],
  68: [1267.716535433071, 1751.968503937008], 69: [787.4015748031496, 582.6771653543308],
  70: [413.3858267716536, 582.6771653543308], 71: [944.8818897637797, 1307.0866141732283],
  72: [850.3937007874017, 1090.5511811023623], 73: [472.44094488188983, 925.196850393701],
  74: [354.33070866141736, 807.0866141732283], 75: [1100, 850], 76: [1653.5433070866145, 1169.2913385826773],
  77: [1169.2913385826773, 826.7716535433073], 78: [826.7716535433073, 582.6771653543308],
  79: [1433.0708661417325, 1011.8110236220472], 80: [1011.8110236220472, 716.5354330708662],
  81: [582.6771653543308, 393.7007874015748], 82: [582.6771653543308, 787.4015748015748],
  83: [582.6771653543308, 413.3858267716536], 84: [1307.0866141732283, 944.8818897637797],
  85: [1090.5511811023623, 850.3937007874017], 86: [925.196850393701, 472.44094488188983],
  87: [807.0866141732283, 354.33070866141736], 88: [503.93700787401576, 716.5354330708662],
  89: [716.5354330708662, 503.93700787401576], 90: [1200, 1100], 91: [925.196850393701, 413.3858267716536],
  92: [413.3858267716536, 925.196850393701], 93: [574.8031496062993, 846.456692913386],
  94: [381.8897637795276, 594.488188976378], 95: [381.8897637795276, 594.488188976378],
  96: [401.5748031496063, 649.6062992125984], 97: [401.5748031496063, 692.9133858267717],
  98: [492.12598425196853, 692.9133858267717], 99: [433.0708661417323, 818.8976377952756],
  100: [433.0708661417323, 866.1417322834646], 101: [472.44094488188983, 905.511811023622],
  102: [629.9212598425197, 905.511811023622], 103: [472.44094488188983, 1216.5354330708662],
  104: [901.5748031496063, 1275.5905511811025], 105: [1275.5905511811025, 1803.1496062992126],
  106: [574.8031496062993, 846.456692913386], 107: [381.8897637795276, 594.488188976378],
  108: [381.8897637795276, 594.488188976378], 109: [649.6062992125984, 401.5748031496063],
  110: [692.9133858267717, 401.5748031496063], 111: [692.9133858267717, 492.12598425196853],
  112: [818.8976377952756, 433.0708661417323], 113: [866.1417322834646, 433.0708661417323],
  114: [905.511811023622, 472.44094488188983], 115: [905.511811023622, 629.9212598425197],
  116: [1216.5354330708662, 472.44094488188983], 117: [1275.5905511811025, 901.5748031496063],
  118: [1803.1496062992126, 1275.5905511811025],
};

/**
 * Paper size in hundredths of an inch. `new PaperSize()` uses the culture
 * default (Letter for en-US); `new PaperSize(kind)` expands through the
 * built-in table; `new PaperSize(width, height)` is a custom size.
 */
export class PaperSize {
  private _kind: number;
  private _width: number;
  private _height: number;
  constructor(widthOrKind?: number, height?: number) {
    if (widthOrKind === undefined) {
      this._kind = Print.PaperKind.letter;
      [this._width, this._height] = PAPER_SIZES[this._kind];
    } else if (height !== undefined) {
      this._kind = Print.PaperKind.custom;
      this._width = widthOrKind;
      this._height = height;
    } else {
      this._kind = widthOrKind;
      const size = PAPER_SIZES[this._kind];
      this._width = size ? size[0] : 0;
      this._height = size ? size[1] : 0;
    }
  }
  getPageSize(kind: number): { width: number; height: number } {
    const size = PAPER_SIZES[kind];
    return { width: size ? size[0] : 0, height: size ? size[1] : 0 };
  }
  kind(): number;
  kind(value: number): this;
  kind(value?: number): number | this {
    if (value === undefined) return this._kind;
    this._kind = value;
    const size = PAPER_SIZES[value];
    if (size && value !== Print.PaperKind.custom) {
      this._width = size[0];
      this._height = size[1];
    }
    return this;
  }
  width(): number;
  width(value: number): this;
  width(value?: number): number | this {
    if (value === undefined) return this._width;
    this._width = value;
    return this;
  }
  height(): number;
  height(value: number): this;
  height(value?: number): number | this {
    if (value === undefined) return this._height;
    this._height = value;
    return this;
  }
  /** Serialise to the sheet JSON shape `{ width, height, kind }`. */
  _toJSON(): { width: number; height: number; kind: number } {
    return { width: this._width, height: this._height, kind: this._kind };
  }
  static _fromJSON(json: Partial<{ width: number; height: number; kind: number }> | undefined): PaperSize {
    const size = new PaperSize();
    if (!json) return size;
    if (json.kind !== undefined) size._kind = Number(json.kind);
    if (json.width !== undefined) size._width = Number(json.width);
    if (json.height !== undefined) size._height = Number(json.height);
    return size;
  }
}

/* -------------------------------------------------------------- print info */

export interface PrintMargins {
  top: number;
  bottom: number;
  left: number;
  right: number;
  header: number;
  footer: number;
}

export interface PageSectionOptions {
  left: string;
  center: string;
  right: string;
  leftImage: string;
  centerImage: string;
  rightImage: string;
}

export interface PageHeaderFooterOptions {
  header: PageSectionOptions;
  footer: PageSectionOptions;
}

export interface PageCustomHeaderFooterOptions {
  normal?: PageHeaderFooterOptions;
  first?: PageHeaderFooterOptions;
  odd?: PageHeaderFooterOptions;
  even?: PageHeaderFooterOptions;
}

export interface WatermarkItem {
  x: number;
  y: number;
  width: number;
  height: number;
  imageSrc: string;
  page: string;
}

const SECTION_KEYS: (keyof PageSectionOptions)[] = ['left', 'center', 'right', 'leftImage', 'centerImage', 'rightImage'];
function cloneSection(section: Partial<PageSectionOptions> | undefined): PageSectionOptions {
  const base = {} as PageSectionOptions;
  for (const key of SECTION_KEYS) base[key] = String(section?.[key] ?? '');
  return base;
}
function cloneHeaderFooter(value: PageHeaderFooterInput | undefined): PageHeaderFooterOptions {
  return { header: cloneSection(value?.header), footer: cloneSection(value?.footer) };
}

/** Defaults verified against the trial (fresh sheet, `new PrintInfo()`). */
export const PRINT_INFO_DEFAULTS = {
  bestFitColumns: false,
  bestFitRows: false,
  blackAndWhite: false,
  centering: 0,
  differentFirstPage: false,
  differentOddAndEvenPages: false,
  firstPageNumber: 1,
  fitPagesTall: -1,
  fitPagesWide: -1,
  orientation: Print.PrintPageOrientation.portrait,
  pageOrder: Print.PrintPageOrder.auto,
  pageRange: '',
  qualityFactor: 2,
  repeatColumnEnd: -1,
  repeatColumnStart: -1,
  repeatRowEnd: -1,
  repeatRowStart: -1,
  showBorder: true,
  showColumnHeader: Print.PrintVisibilityType.inherit,
  showGridLine: false,
  showRowHeader: Print.PrintVisibilityType.inherit,
  useMax: true,
  zoomFactor: 1,
  watermark: [] as WatermarkItem[],
  margin: { top: 75, bottom: 75, left: 70, right: 70, header: 30, footer: 30 } as PrintMargins,
};

/** The print area persists as this sheet-scoped defined name. */
export const PRINT_AREA_NAME = 'Print_Area';

/** Types of the scalar fields kept in `PrintInfo._plain`. */
interface PrintInfoPlain {
  bestFitColumns: boolean;
  bestFitRows: boolean;
  blackAndWhite: boolean;
  centering: number;
  differentFirstPage: boolean;
  differentOddAndEvenPages: boolean;
  firstPageNumber: number;
  fitPagesTall: number;
  fitPagesWide: number;
  orientation: number;
  pageOrder: number;
  pageRange: string;
  qualityFactor: number;
  repeatColumnEnd: number;
  repeatColumnStart: number;
  repeatRowEnd: number;
  repeatRowStart: number;
  showBorder: boolean;
  showColumnHeader: number;
  showGridLine: boolean;
  showRowHeader: number;
  useMax: boolean;
  zoomFactor: number;
  watermark: WatermarkItem[];
}

/** Get/set pair: getter returns the field type, setter returns the instance. */
type PlainAccessor<K extends keyof PrintInfoPlain> = {
  (): PrintInfoPlain[K];
  (value: PrintInfoPlain[K] | number | boolean | string | WatermarkItem[]): PrintInfo;
};

/** Header/footer scope objects accepted by `pageHeaderFooter()` (partial sections allowed). */
export interface PageHeaderFooterInput {
  header?: Partial<PageSectionOptions>;
  footer?: Partial<PageSectionOptions>;
}

/**
 * Printing options for one worksheet. Every accessor is a get/set pair that
 * returns `this` after a set, matching the reference component's chaining.
 * When bound to a sheet the print-area range accessors (`rowStart` and
 * friends) are backed by the sheet's `Print_Area` defined name, which is how
 * the reference component persists the print area; the range fields never
 * appear inside the serialised `printInfo` object in that case.
 */
export class PrintInfo {
  private _sheet: Worksheet | undefined;
  private _touched = new Set<string>();
  private _change?: () => void;
  private _plain: PrintInfoPlain = {
    bestFitColumns: false, bestFitRows: false, blackAndWhite: false, centering: 0,
    differentFirstPage: false, differentOddAndEvenPages: false, firstPageNumber: 1,
    fitPagesTall: -1, fitPagesWide: -1, orientation: 1, pageOrder: 0, pageRange: '',
    qualityFactor: 2, repeatColumnEnd: -1, repeatColumnStart: -1, repeatRowEnd: -1,
    repeatRowStart: -1, showBorder: true, showColumnHeader: 0, showGridLine: false,
    showRowHeader: 0, useMax: true, zoomFactor: 1, watermark: [],
  };
  /** Last object assigned to `margin()`, kept verbatim; null means never assigned. */
  private _marginRaw: Partial<PrintMargins> | null = null;

  /**
   * Effective margins: the assigned object merged over the defaults.
   * @internal Geometry and dialog code use this, not the public getter, which
   * (like the reference) returns exactly what was last assigned.
   */
  _marginEffective(): PrintMargins {
    return { ...PRINT_INFO_DEFAULTS.margin, ...(this._marginRaw ?? {}) };
  }
  private _paperSize = new PaperSize();
  private _pageHeaderFooter: PageCustomHeaderFooterOptions = { normal: cloneHeaderFooter(undefined) };
  /** Unbound fallback for the print-area range. */
  private _range = { rowStart: -1, rowEnd: -1, columnStart: -1, columnEnd: -1 };

  constructor(sheet?: Worksheet) {
    this._sheet = sheet;
  }
  /** @internal Called after any value changes (invalidates page geometry). */
  _onChange(handler?: () => void): void {
    this._change = handler;
  }

  /** Coerce `value` to the type of plain field `name` (by its default) and store it. */
  private _plainStore(name: keyof PrintInfoPlain, value: boolean | number | string | WatermarkItem[]): void {
    const def = PRINT_INFO_DEFAULTS[name];
    let stored: boolean | number | string | WatermarkItem[];
    if (typeof def === 'boolean') stored = !!value;
    else if (typeof def === 'string') stored = String(value ?? '');
    else if (Array.isArray(def)) {
      const items = Array.isArray(value) ? value : [];
      stored = items.map((item: WatermarkItem) => ({
        x: Number(item.x) || 0, y: Number(item.y) || 0,
        width: Number(item.width) || 0, height: Number(item.height) || 0,
        imageSrc: String(item.imageSrc ?? ''), page: String(item.page ?? 'all'),
      }));
    } else stored = Number(value);
    // Same-type key/value pair; Object.assign keeps this type-safe without an assertion.
    Object.assign(this._plain, { [name]: stored });
    // Like the reference: assigning a plain field back to its default value
    // un-dirties it, so it disappears from the serialised output. Only
    // firstPageNumber keeps its assignment (its serialisation baseline is
    // "auto", not the getter's fallback of 1), and arrays always mark.
    if (name !== 'firstPageNumber' && name !== 'watermark' && stored === def) this._touched.delete(name);
    else this._touched.add(name);
    this._change?.();
  }

  private _plainAccessor<K extends keyof PrintInfoPlain>(name: K): PlainAccessor<K> {
    const read = (): PrintInfoPlain[K] => this._plain[name];
    const write = (value: PrintInfoPlain[K] | number | boolean | string | WatermarkItem[]): PrintInfo => {
      this._plainStore(name, value);
      return this;
    };
    // Overloaded declaration: the visible type is exactly PlainAccessor<K>,
    // so no assertion is needed on return.
    function readWrite(): PrintInfoPlain[K];
    function readWrite(value: PrintInfoPlain[K] | number | boolean | string | WatermarkItem[]): PrintInfo;
    function readWrite(value?: PrintInfoPlain[K] | number | boolean | string | WatermarkItem[]): PrintInfoPlain[K] | PrintInfo {
      return value === undefined ? read() : write(value);
    }
    return readWrite;
  }

  bestFitColumns = this._plainAccessor('bestFitColumns');
  bestFitRows = this._plainAccessor('bestFitRows');
  blackAndWhite = this._plainAccessor('blackAndWhite');
  centering = this._plainAccessor('centering');
  differentFirstPage = this._plainAccessor('differentFirstPage');
  differentOddAndEvenPages = this._plainAccessor('differentOddAndEvenPages');
  firstPageNumber = this._plainAccessor('firstPageNumber');
  fitPagesTall = this._plainAccessor('fitPagesTall');
  fitPagesWide = this._plainAccessor('fitPagesWide');
  pageOrder = this._plainAccessor('pageOrder');
  pageRange = this._plainAccessor('pageRange');
  qualityFactor = this._plainAccessor('qualityFactor');
  repeatColumnEnd = this._plainAccessor('repeatColumnEnd');
  repeatColumnStart = this._plainAccessor('repeatColumnStart');
  repeatRowEnd = this._plainAccessor('repeatRowEnd');
  repeatRowStart = this._plainAccessor('repeatRowStart');
  showBorder = this._plainAccessor('showBorder');
  showColumnHeader = this._plainAccessor('showColumnHeader');
  showGridLine = this._plainAccessor('showGridLine');
  showRowHeader = this._plainAccessor('showRowHeader');
  useMax = this._plainAccessor('useMax');
  zoomFactor = this._plainAccessor('zoomFactor');
  watermark = this._plainAccessor('watermark');

  margin(): PrintMargins;
  margin(value: Partial<PrintMargins>): this;
  margin(value?: Partial<PrintMargins>): PrintMargins | this {
    if (value === undefined)
      return this._marginRaw ? { ...this._marginRaw } as PrintMargins : { ...PRINT_INFO_DEFAULTS.margin };
    // The reference stores the assigned object verbatim: later calls replace
    // it entirely (a partial assignment does not merge with the previous one).
    const next: Partial<PrintMargins> = {};
    for (const key of Object.keys(PRINT_INFO_DEFAULTS.margin) as (keyof PrintMargins)[])
      if (value[key] !== undefined) next[key] = Number(value[key]);
    this._marginRaw = next;
    this._touched.add('margin');
    this._change?.();
    return this;
  }
  orientation(): number;
  orientation(value: number): this;
  orientation(value?: number): number | this {
    if (value === undefined) return this._plain.orientation;
    this._plain.orientation = Number(value) === Print.PrintPageOrientation.landscape ? Print.PrintPageOrientation.landscape : Print.PrintPageOrientation.portrait;
    if (this._plain.orientation === PRINT_INFO_DEFAULTS.orientation) this._touched.delete('orientation');
    else this._touched.add('orientation');
    this._change?.();
    return this;
  }
  pageHeaderFooter(): PageCustomHeaderFooterOptions;
  pageHeaderFooter(value: Partial<Record<'normal' | 'first' | 'odd' | 'even', PageHeaderFooterInput>>): this;
  pageHeaderFooter(value?: Partial<Record<'normal' | 'first' | 'odd' | 'even', PageHeaderFooterInput>>): PageCustomHeaderFooterOptions | this {
    if (value === undefined) return structuredClone(this._pageHeaderFooter);
    const next: PageCustomHeaderFooterOptions = {};
    for (const key of ['normal', 'first', 'odd', 'even'] as const)
      if (value[key]) next[key] = cloneHeaderFooter(value[key]);
    if (!next.normal) next.normal = cloneHeaderFooter(undefined);
    this._pageHeaderFooter = next;
    this._touched.add('pageHeaderFooter');
    this._change?.();
    return this;
  }
  paperSize(): PaperSize;
  paperSize(value: PaperSize | Partial<{ width: number; height: number; kind: number }>): this;
  paperSize(value?: PaperSize | Partial<{ width: number; height: number; kind: number }>): PaperSize | this {
    if (value === undefined) return this._paperSize;
    if (value instanceof PaperSize) this._paperSize = value;
    else this._paperSize = PaperSize._fromJSON(value);
    this._touched.add('paperSize');
    this._change?.();
    return this;
  }

  /* ---------------------------------------------------- print-area range */

  /** @internal Parse the bound sheet's `Print_Area` defined name. */
  _printArea(): { row1: number; col1: number; row2: number; col2: number } | null {
    if (!this._sheet) return null;
    const name = this._sheet.getCustomName(PRINT_AREA_NAME);
    if (!name) return null;
    const expression = String(name.getExpression() ?? '');
    const match = /\$?([A-Za-z]{1,3})\$?(\d+):\$?([A-Za-z]{1,3})\$?(\d+)/.exec(expression);
    if (!match) return null;
    const colIndex = (letters: string): number => {
      let index = 0;
      for (const char of letters.toUpperCase()) index = index * 26 + char.charCodeAt(0) - 64;
      return index - 1;
    };
    return { col1: colIndex(match[1]), row1: Number(match[2]) - 1, col2: colIndex(match[3]), row2: Number(match[4]) - 1 };
  }
  private _rangeGet(key: 'rowStart' | 'rowEnd' | 'columnStart' | 'columnEnd'): number {
    const area = this._printArea();
    if (area) return area[key === 'rowStart' ? 'row1' : key === 'rowEnd' ? 'row2' : key === 'columnStart' ? 'col1' : 'col2'];
    return this._range[key];
  }
  private _rangeAccessor(key: 'rowStart' | 'rowEnd' | 'columnStart' | 'columnEnd'): { (): number; (value: number): PrintInfo } {
    const readWrite = (value?: number): number | this => {
      if (value === undefined) return this._rangeGet(key);
      const next = {
        rowStart: this._rangeGet('rowStart'),
        rowEnd: this._rangeGet('rowEnd'),
        columnStart: this._rangeGet('columnStart'),
        columnEnd: this._rangeGet('columnEnd'),
      };
      next[key] = Number(value);
      this._range = next;
      this._touched.add(key);
      this._change?.();
      if (this._sheet) {
        // Keep the defined name in sync; it owns persistence.
        if (next.rowStart < 0 || next.rowEnd < 0 || next.columnStart < 0 || next.columnEnd < 0)
          this._sheet._clearPrintAreaName();
        else
          this._sheet._setPrintAreaRange(
            Math.min(next.rowStart, next.rowEnd), Math.min(next.columnStart, next.columnEnd),
            Math.max(next.rowStart, next.rowEnd), Math.max(next.columnStart, next.columnEnd),
          );
      }
      return this;
    };
    return readWrite as { (): number; (value: number): PrintInfo };
  }
  rowStart = this._rangeAccessor('rowStart');
  rowEnd = this._rangeAccessor('rowEnd');
  columnStart = this._rangeAccessor('columnStart');
  columnEnd = this._rangeAccessor('columnEnd');

  /* ------------------------------------------------------------ internal */

  /** Replace values from a serialised sheet JSON `printInfo` object. */
  _fromJSON(json: Record<string, unknown> | undefined): void {
    if (!json) return;
    for (const key of Object.keys(this._plain))
      if (json[key] !== undefined) {
        Object.assign(this._plain, { [key]: json[key] });
        this._touched.add(key);
      }
    if (json.margin) {
      this._marginRaw = { ...PRINT_INFO_DEFAULTS.margin, ...(json.margin as Partial<PrintMargins>) };
      this._touched.add('margin');
    }
    if (json.paperSize) {
      this._paperSize = PaperSize._fromJSON(json.paperSize as Partial<{ width: number; height: number; kind: number }>);
      this._touched.add('paperSize');
    }
    if (json.pageHeaderFooter) {
      const from = json.pageHeaderFooter as Partial<Record<'normal' | 'first' | 'odd' | 'even', PageHeaderFooterInput>>;
      const next: PageCustomHeaderFooterOptions = {};
      for (const key of ['normal', 'first', 'odd', 'even'] as const)
        if (from[key]) next[key] = cloneHeaderFooter(from[key]);
      this._pageHeaderFooter = next.normal ? next : { normal: cloneHeaderFooter(undefined) };
      this._touched.add('pageHeaderFooter');
    }
    for (const key of ['rowStart', 'rowEnd', 'columnStart', 'columnEnd'] as const)
      if (json[key] !== undefined) {
        this._range[key] = Number(json[key]);
        this._touched.add(key);
      }
    this._change?.();
  }

  /** Serialise for `sheet.toJSON()` and the public `printInfo().toJSON()`. */
  toJSON(): Record<string, unknown> {
    return this._toJSON();
  }
  /** @internal Serialise for `sheet.toJSON()`: always the paper size, plus touched fields. */
  _toJSON(): Record<string, unknown> {
    const result: Record<string, unknown> = { paperSize: this._paperSize._toJSON() };
    for (const key of Object.keys(this._plain) as (keyof PrintInfoPlain)[])
      if (this._touched.has(key)) result[key] = structuredClone(this._plain[key]);
    if (this._touched.has('margin') && this._marginRaw) {
      // The reference serialises the assigned object verbatim (a partial stays
      // partial) and omits it when it still deep-equals the default margins.
      const d = PRINT_INFO_DEFAULTS.margin;
      const m = this._marginRaw as PrintMargins;
      const keys = Object.keys(d) as (keyof PrintMargins)[];
      const isDefault = Object.keys(m).length === keys.length && keys.every((k) => m[k] === d[k]);
      if (!isDefault) result.margin = { ...m };
    }
    if (this._touched.has('pageHeaderFooter')) result.pageHeaderFooter = structuredClone(this._pageHeaderFooter);
    if (!this._sheet)
      for (const key of ['rowStart', 'rowEnd', 'columnStart', 'columnEnd'] as const)
        if (this._touched.has(key)) result[key] = this._range[key];
    return result;
  }

  /** Copy all values onto another instance (used by `sheet.printInfo(pi)`). */
  _copyTo(target: PrintInfo): void {
    target._plain = structuredClone(this._plain);
    target._touched = new Set(this._touched);
    target._marginRaw = this._marginRaw ? { ...this._marginRaw } : null;
    target._paperSize = PaperSize._fromJSON(this._paperSize._toJSON());
    target._pageHeaderFooter = structuredClone(this._pageHeaderFooter);
    target._range = { ...this._range };
  }

  /** True when the named field was explicitly assigned (drives persistence). */
  _hasTouched(name: string): boolean {
    return this._touched.has(name);
  }

  /** Page content bounds: the print area when set, otherwise the used range. */
  _contentBounds(sheet: Worksheet): { row1: number; col1: number; row2: number; col2: number } {
    const area = this._printArea();
    if (area) return area;
    const used = sheet._usedRange();
    return { row1: 0, col1: 0, row2: Math.max(used.row, 0), col2: Math.max(used.col, 0) };
  }
}

/* ------------------------------------------------------------- paginator */

export interface AxisPageModel {
  headerSize: number;
  contentSize: number;
  contentOffset: number;
  itemStart: number;
  itemEnd: number;
  repeatItemStart: number;
  repeatItemEnd: number;
}

export interface PageModel {
  sheetIndex: number;
  pageNumber: number;
  rowPageIndex: number;
  columnPageIndex: number;
  pageNumberInSheet: number;
  rowPageIndexInSheet: number;
  columnPageIndexInSheet: number;
  rowPage: AxisPageModel;
  columnPage: AxisPageModel;
  paperSize: { width: number; height: number };
  pageImageableArea: { x: number; y: number; width: number; height: number };
  workbookName: string;
  worksheetName: string;
  scale: number;
}

/** One page of one sheet; shape follows the trial's `getPage()` result. */
export class SheetPageInfo {
  constructor(private _page: PageModel) {}
  getPageSize(): { width: number; height: number } {
    const { rowPage, columnPage } = this._page;
    return {
      width: columnPage.contentSize + columnPage.headerSize,
      height: rowPage.contentSize + rowPage.headerSize,
    };
  }
  sheetIndex(): number { return this._page.sheetIndex; }
  pageNumber(): number { return this._page.pageNumber; }
  columnPageIndex(): number { return this._page.columnPageIndex; }
  rowPageIndex(): number { return this._page.rowPageIndex; }
  pageNumberInSheet(): number { return this._page.pageNumberInSheet; }
  columnPageIndexInSheet(): number { return this._page.columnPageIndexInSheet; }
  rowPageIndexInSheet(): number { return this._page.rowPageIndexInSheet; }
  columnPage(): AxisPageModel { return { ...this._page.columnPage }; }
  rowPage(): AxisPageModel { return { ...this._page.rowPage }; }
  paperSize(): { width: number; height: number } { return { ...this._page.paperSize }; }
  pageImageableArea(): { x: number; y: number; width: number; height: number } { return { ...this._page.pageImageableArea }; }
  workbookName(): string { return this._page.workbookName; }
  worksheetName(): string { return this._page.worksheetName; }
  /** @internal */
  _model(): PageModel { return this._page; }
}

interface AxisSplit {
  starts: number[];
  ends: number[];
  contentSizes: number[];
}

/** Split one axis of the print range into pages given the page size. */
function splitAxis(
  layout: { getSize(i: number): number; isVisible(i: number): boolean },
  start: number,
  end: number,
  manualBreaks: (i: number) => boolean,
  available: number,
  scale: number,
): AxisSplit {
  const starts: number[] = [];
  const ends: number[] = [];
  const contentSizes: number[] = [];
  let pageStart = start;
  let used = 0;
  let pendingBreak = false;
  for (let i = start; i <= end; i++) {
    if (!layout.isVisible(i)) continue;
    const size = layout.getSize(i) * scale;
    const force = used > 0 && (pendingBreak || used + size > available + 0.5);
    if (force) {
      starts.push(pageStart);
      ends.push(i - 1);
      contentSizes.push(used);
      pageStart = i;
      used = 0;
    }
    used += size;
    pendingBreak = i + 1 <= end && manualBreaks(i + 1);
  }
  starts.push(pageStart);
  ends.push(end);
  contentSizes.push(used);
  return { starts, ends, contentSizes };
}

/**
 * Computes the pages of one worksheet from its printInfo. Public (undocumented
 * in the reference d.ts, but present on the trial's public runtime surface).
 */
export class WorksheetPaginator {
  private _sheet: Worksheet;
  private _pages: SheetPageInfo[] = [];
  private _raw: PageModel[] = [];
  private _vertical = 0;
  private _horizontal = 0;
  private _zoomV = 1;
  private _zoomH = 1;
  constructor(sheet: Worksheet) {
    this._sheet = sheet;
  }
  sheetIndex(): number {
    const parent = this._sheet.parent;
    return parent ? parent.sheets.indexOf(this._sheet) : 0;
  }
  verticalPageCount(): number { return this._vertical; }
  horizontalPageCount(): number { return this._horizontal; }
  verticalZoomFactor(): number { return this._zoomV; }
  horizontalZoomFactor(): number { return this._zoomH; }
  pageCount(): number { return this._pages.length; }
  getPage(index: number): SheetPageInfo | undefined { return this._pages[index]; }
  /** @internal raw page models for the print document and print line. */
  _models(): PageModel[] { return this._raw; }

  paginate(): void {
    this._pages = [];
    this._raw = [];
    const sheet = this._sheet;
    const pi = sheet.printInfo();
    const paper = pi.paperSize();
    const landscape = pi.orientation() === Print.PrintPageOrientation.landscape;
    const paperW = paperSizePx(landscape ? paper.height() : paper.width());
    const paperH = paperSizePx(landscape ? paper.width() : paper.height());
    const margin = pi._marginEffective();
    const area = {
      x: paperSizePx(margin.left),
      y: paperSizePx(margin.top),
      width: Math.max(1, paperW - paperSizePx(margin.left) - paperSizePx(margin.right)),
      height: Math.max(1, paperH - paperSizePx(margin.top) - paperSizePx(margin.bottom)),
    };
    const bounds = pi._contentBounds(sheet);
    const rowLayout = sheet._rowLayout();
    const colLayout = sheet._columnLayout();
    const showRowHeader = resolveVisibility(pi.showRowHeader(), sheet.options.rowHeaderVisible !== false);
    const showColHeader = resolveVisibility(pi.showColumnHeader(), sheet.options.colHeaderVisible !== false);
    const rowHeaderWidth = showRowHeader ? sheet.dimensions.rowHeaderColWidth : 0;
    const colHeaderHeight = showColHeader ? sheet.dimensions.colHeaderRowHeight : 0;
    const repeatRowRange = pi.repeatRowStart() >= 0 && pi.repeatRowEnd() >= pi.repeatRowStart() ? [pi.repeatRowStart(), pi.repeatRowEnd()] as const : null;
    const repeatColRange = pi.repeatColumnStart() >= 0 && pi.repeatColumnEnd() >= pi.repeatColumnStart() ? [pi.repeatColumnStart(), pi.repeatColumnEnd()] as const : null;
    const inRange = (i: number, range: readonly [number, number] | null): boolean => !!range && i >= range[0] && i <= range[1];
    // Skip repeated rows/columns when splitting the page body.
    const bodyRowLayout = {
      getSize: (i: number): number => rowLayout.getSize(i),
      isVisible: (i: number): boolean => rowLayout.isVisible(i) && !inRange(i, repeatRowRange) && !(i < bounds.row1 || i > bounds.row2),
    };
    const bodyColLayout = {
      getSize: (i: number): number => colLayout.getSize(i),
      isVisible: (i: number): boolean => colLayout.isVisible(i) && !inRange(i, repeatColRange) && !(i < bounds.col1 || i > bounds.col2),
    };
    const repeatRowSize = repeatRowRange ? sumRange(rowLayout, repeatRowRange[0], repeatRowRange[1]) : 0;
    const repeatColSize = repeatColRange ? sumRange(colLayout, repeatColRange[0], repeatColRange[1]) : 0;
    const base = pi.zoomFactor();
    let scale = base;
    // Fit-to-page scaling: shrink so the requested page counts hold; fit-to
    // never enlarges beyond the current "Adjust to" scale.
    const fitW = pi.fitPagesWide(), fitH = pi.fitPagesTall();
    if (fitW > 0) {
      const needed = sumRange(colLayout, bounds.col1, bounds.col2) - (repeatColRange ? repeatColSize : 0);
      const avail = area.width - rowHeaderWidth - repeatColSize;
      if (needed > 0) scale = Math.min(scale, (avail * fitW) / needed);
    }
    if (fitH > 0) {
      const needed = sumRange(rowLayout, bounds.row1, bounds.row2) - (repeatRowRange ? repeatRowSize : 0);
      const avail = area.height - colHeaderHeight - repeatRowSize;
      if (needed > 0) scale = Math.min(scale, (avail * fitH) / needed);
    }
    const manualRow = (i: number): boolean => sheet.getRowPageBreak(i);
    const manualCol = (i: number): boolean => sheet.getColumnPageBreak(i);
    const rowSplit = splitAxis(bodyRowLayout, bounds.row1, bounds.row2, manualRow, area.height - colHeaderHeight - repeatRowSize * scale, scale);
    const colSplit = splitAxis(bodyColLayout, bounds.col1, bounds.col2, manualCol, area.width - rowHeaderWidth - repeatColSize * scale, scale);
    this._vertical = rowSplit.starts.length;
    this._horizontal = colSplit.starts.length;
    this._zoomV = scale / base;
    this._zoomH = scale / base;
    const order = pi.pageOrder();
    const first = pi.firstPageNumber();
    const vCount = rowSplit.starts.length;
    const hCount = colSplit.starts.length;
    const combos: [number, number][] = [];
    // "Down, then over": walk the row pages of each column band first.
    if (order === Print.PrintPageOrder.overThenDown) {
      for (let r = 0; r < vCount; r++) for (let c = 0; c < hCount; c++) combos.push([r, c]);
    } else {
      for (let c = 0; c < hCount; c++) for (let r = 0; r < vCount; r++) combos.push([r, c]);
    }
    combos.forEach(([r, c], index) => {
      this._raw.push({
        sheetIndex: this.sheetIndex(),
        pageNumber: first > 0 ? first + index : index + 1,
        rowPageIndex: index,
        columnPageIndex: index,
        pageNumberInSheet: index + 1,
        rowPageIndexInSheet: r,
        columnPageIndexInSheet: c,
        rowPage: {
          headerSize: colHeaderHeight,
          contentSize: rowSplit.contentSizes[r] + repeatRowSize * scale,
          contentOffset: 0,
          itemStart: rowSplit.starts[r],
          itemEnd: rowSplit.ends[r],
          repeatItemStart: repeatRowRange ? repeatRowRange[0] : -1,
          repeatItemEnd: repeatRowRange ? repeatRowRange[1] : -1,
        },
        columnPage: {
          headerSize: rowHeaderWidth,
          contentSize: colSplit.contentSizes[c] + repeatColSize * scale,
          contentOffset: 0,
          itemStart: colSplit.starts[c],
          itemEnd: colSplit.ends[c],
          repeatItemStart: repeatColRange ? repeatColRange[0] : -1,
          repeatItemEnd: repeatColRange ? repeatColRange[1] : -1,
        },
        paperSize: { width: paperW, height: paperH },
        pageImageableArea: area,
        workbookName: sheet.parent?.name ?? '',
        worksheetName: sheet.name(),
        scale,
      });
    });
    this._pages = this._raw.map((p) => new SheetPageInfo(p));
  }
}

function resolveVisibility(value: number, sheetVisible: boolean): boolean {
  switch (value) {
    case Print.PrintVisibilityType.hide: return false;
    case Print.PrintVisibilityType.show:
    case Print.PrintVisibilityType.showOnce: return true;
    default: return sheetVisible;
  }
}

function sumRange(layout: { getSize(i: number): number; isVisible(i: number): boolean }, start: number, end: number): number {
  let total = 0;
  for (let i = start; i <= end; i++) if (layout.isVisible(i)) total += layout.getSize(i);
  return total;
}

/** Paginates every visible sheet of a workbook in sheet order. */
export class WorkbookPaginator {
  private _workbook: Workbook;
  private _paginators: WorksheetPaginator[] = [];
  private _flat: SheetPageInfo[] = [];
  constructor(workbook: Workbook) {
    this._workbook = workbook;
  }
  paginate(): void {
    this._paginators = [];
    this._flat = [];
    const workbook = this._workbook;
    const count = workbook.getSheetCount();
    for (let i = 0; i < count; i++) {
      const sheet = workbook.getSheet(i);
      if (!sheet || sheet.visible() === 0) continue;
      const paginator = new WorksheetPaginator(sheet);
      paginator.paginate();
      this._paginators[i] = paginator;
      for (let p = 0; p < paginator.pageCount(); p++) this._flat.push(paginator.getPage(p)!);
    }
  }
  pageCount(): number { return this._flat.length; }
  getPage(index: number): SheetPageInfo | undefined { return this._flat[index]; }
  getSheetPaginator(index: number): WorksheetPaginator | null { return this._paginators[index] ?? null; }
}

/* ----------------------------------------------------------- page numbers */

/** Parse "1,3,5-7" into explicit page positions (1-based, clamped to total). */
export function parsePageRange(text: string, total: number): number[] {
  const result: number[] = [];
  for (const part of String(text ?? '').split(',')) {
    const chunk = part.trim();
    if (!chunk) continue;
    const dash = chunk.split('-');
    const start = Number.parseInt(dash[0], 10);
    if (!Number.isFinite(start)) continue;
    if (dash.length > 1) {
      const endRaw = dash[1].trim();
      const end = endRaw === '' ? total : Number.parseInt(endRaw, 10);
      const upper = Number.isFinite(end) ? Math.min(total, end) : total;
      for (let i = Math.max(1, start); i <= upper; i++) if (!result.includes(i)) result.push(i);
    } else if (start >= 1 && start <= total && !result.includes(start)) result.push(start);
  }
  return result;
}

/* ------------------------------------------------- header/footer expansion */

export interface HeaderFooterSegment {
  text: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
}

/** Expand the `&P`, `&N`, `&A`, `&D`, `&T` codes and the B/I/U style toggles. */
export function expandHeaderFooter(
  source: string,
  context: { sheetName: string; workbookName: string; pageNumber: number; pageCount: number; date: string; time: string },
): HeaderFooterSegment[] {
  const segments: HeaderFooterSegment[] = [];
  let bold = false, italic = false, underline = false, pending = '';
  const flush = () => {
    if (pending) segments.push({ text: pending, bold, italic, underline });
    pending = '';
  };
  const text = String(source ?? '');
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char !== '&' || i === text.length - 1) {
      pending += char;
      continue;
    }
    const code = text[++i];
    switch (code) {
      case '&': pending += '&'; break;
      case 'P': case 'p': pending += String(context.pageNumber); break;
      case 'N': case 'n': pending += String(context.pageCount); break;
      case 'A': case 'a': pending += context.sheetName; break;
      case 'D': case 'd': pending += context.date; break;
      case 'T': case 't': pending += context.time; break;
      case 'B': case 'b': flush(); bold = code === 'B'; break;
      case 'I': case 'i': flush(); italic = code === 'I'; break;
      case 'U': case 'u': flush(); underline = code === 'U'; break;
      case '"': {
        flush();
        const end = text.indexOf('"', i + 1);
        i = end < 0 ? text.length - 1 : end;
        break;
      }
      default: pending += code; break;
    }
  }
  flush();
  return segments;
}

/* ------------------------------------------------------------- utilities */

/** Row/column indices that start a new printed page (used by the print line). */
export function printPageStarts(sheet: Worksheet): { rows: number[]; cols: number[] } {
  const paginator = new WorksheetPaginator(sheet);
  paginator.paginate();
  const seenRows = new Set<number>();
  const seenCols = new Set<number>();
  for (const page of paginator._models()) {
    if (page.rowPage.itemStart > 0) seenRows.add(page.rowPage.itemStart);
    if (page.columnPage.itemStart > 0) seenCols.add(page.columnPage.itemStart);
  }
  return { rows: [...seenRows].sort((a, b) => a - b), cols: [...seenCols].sort((a, b) => a - b) };
}
