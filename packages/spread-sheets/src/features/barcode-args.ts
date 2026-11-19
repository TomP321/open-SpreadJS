/**
 * TASK 46 item 3: the trial's `BC_*` argument layer.
 *
 * The trial (probe segments bc46k/bcx:record/bc46t on the official core page with the
 * barcode add-on loaded, observed only through the public API) treats the positional
 * formula arguments as the named properties its own `getBarcodeInfo()` descriptor lists:
 * `text, color, backgroundColor, showLabel, labelPosition, ...` in that order.  Only the
 * arguments that were actually passed appear in the value record, which always ends with
 * `type` (the descriptor's type name) and `isBarcode: true`, and the values keep the type
 * they were passed with (`nwRatio: 3`, `labelPosition: "top"`, `showLabel: false`).
 *
 * The trial also answers `#VALUE!` for arguments it cannot use.  The rules below are the
 * combinations observed on the trial (see docs/STATUS.md, TASK 46 item 3); they are
 * deliberately limited to what was measured.
 */
import type { Args } from '../calc/evaluate.js';
import type { BarcodePaintSpec } from './barcode.js';
import { pdf417EcCodewordCount, pdf417HighLevel } from './barcode-pdf417.js';

/** Data codewords our PDF417 compaction produces for `text` (capacity checks only). */
const pdf417DataCodewords = (text: string): number => pdf417HighLevel(text).length;

/** Trial `getBarcodeInfo()` descriptors (probe bc46k: byte-for-byte match on the trial). */
export interface BarcodeInfo {
  fnName: string;
  minimum: number;
  /** The trial's own (misspelled) key name; kept for exact API parity. */
  maxmum: number;
  type: string;
  properties: string[];
  acceptsArrayArgIndex?: number;
}

/** Symbology keys are the upper-case encoder names (`CODABAR`, `GS1_128`, ...). */
export const BARCODE_INFOS: Record<string, BarcodeInfo> = {
  Codabar: {
    fnName: 'BC_CODABAR', minimum: 1, maxmum: 17, type: 'Codabar',
    properties: ['text', 'color', 'backgroundColor', 'showLabel', 'labelPosition', 'checkDigit', 'nwRatio', 'fontFontFamily', 'fontFontStyle', 'fontFontWeight', 'fontTextDecoration', 'fontTextAlign', 'fontFontSize', 'quietZoneLeft', 'quietZoneRight', 'quietZoneTop', 'quietZoneBottom'],
  },
  Code128: {
    fnName: 'BC_CODE128', minimum: 1, maxmum: 16, type: 'Code128',
    properties: ['text', 'color', 'backgroundColor', 'showLabel', 'labelPosition', 'codeSet', 'fontFontFamily', 'fontFontStyle', 'fontFontWeight', 'fontTextDecoration', 'fontTextAlign', 'fontFontSize', 'quietZoneLeft', 'quietZoneRight', 'quietZoneTop', 'quietZoneBottom'],
  },
  Code39: {
    fnName: 'BC_CODE39', minimum: 1, maxmum: 19, type: 'Code39',
    properties: ['text', 'color', 'backgroundColor', 'showLabel', 'labelPosition', 'labelWithStartAndStopCharacter', 'checkDigit', 'nwRatio', 'fullASCII', 'fontFontFamily', 'fontFontStyle', 'fontFontWeight', 'fontTextDecoration', 'fontTextAlign', 'fontFontSize', 'quietZoneLeft', 'quietZoneRight', 'quietZoneTop', 'quietZoneBottom'],
  },
  Code49: {
    fnName: 'BC_CODE49', minimum: 1, maxmum: 17, type: 'Code49',
    properties: ['text', 'color', 'backgroundColor', 'showLabel', 'labelPosition', 'grouping', 'groupNo', 'fontFontFamily', 'fontFontStyle', 'fontFontWeight', 'fontTextDecoration', 'fontTextAlign', 'fontFontSize', 'quietZoneLeft', 'quietZoneRight', 'quietZoneTop', 'quietZoneBottom'],
  },
  Code93: {
    fnName: 'BC_CODE93', minimum: 1, maxmum: 17, type: 'Code93',
    properties: ['text', 'color', 'backgroundColor', 'showLabel', 'labelPosition', 'checkDigit', 'fullASCII', 'fontFontFamily', 'fontFontStyle', 'fontFontWeight', 'fontTextDecoration', 'fontTextAlign', 'fontFontSize', 'quietZoneLeft', 'quietZoneRight', 'quietZoneTop', 'quietZoneBottom'],
  },
  DataMatrix: {
    fnName: 'BC_DATAMATRIX', minimum: 1, maxmum: 14, type: 'DataMatrix',
    properties: ['text', 'color', 'backgroundColor', 'eccMode', 'ecc200SymbolSize', 'ecc200EncodingMode', 'ecc00_140SymbolSize', 'structuredAppend', 'structureNumber', 'fileIdentifier', 'quietZoneLeft', 'quietZoneRight', 'quietZoneTop', 'quietZoneBottom'],
  },
  EAN13: {
    fnName: 'BC_EAN13', minimum: 1, maxmum: 18, type: 'EAN13',
    properties: ['text', 'color', 'backgroundColor', 'showLabel', 'labelPosition', 'addOn', 'addOnLabelPosition', 'fontFontFamily', 'fontFontStyle', 'fontFontWeight', 'fontTextDecoration', 'fontTextAlign', 'fontFontSize', 'quietZoneLeft', 'quietZoneRight', 'quietZoneTop', 'quietZoneBottom'],
  },
  EAN8: {
    fnName: 'BC_EAN8', minimum: 1, maxmum: 15, type: 'EAN8',
    properties: ['text', 'color', 'backgroundColor', 'showLabel', 'labelPosition', 'fontFontFamily', 'fontFontStyle', 'fontFontWeight', 'fontTextDecoration', 'fontTextAlign', 'fontFontSize', 'quietZoneLeft', 'quietZoneRight', 'quietZoneTop', 'quietZoneBottom'],
  },
  GS1_128: {
    fnName: 'BC_GS1_128', minimum: 1, maxmum: 16, type: 'GS1_128',
    properties: ['text', 'color', 'backgroundColor', 'showLabel', 'labelPosition', 'fontFontFamily', 'fontFontStyle', 'fontFontWeight', 'fontTextDecoration', 'fontTextAlign', 'fontFontSize', 'quietZoneLeft', 'quietZoneRight', 'quietZoneTop', 'quietZoneBottom'],
  },
  PDF417: {
    fnName: 'BC_PDF417', minimum: 1, maxmum: 11, type: 'PDF417',
    properties: ['text', 'color', 'backgroundColor', 'errorCorrectionLevel', 'rows', 'columns', 'compact', 'quietZoneLeft', 'quietZoneRight', 'quietZoneTop', 'quietZoneBottom'],
  },
  QRCode: {
    fnName: 'BC_QRCODE', minimum: 1, maxmum: 16, type: 'QRCode', acceptsArrayArgIndex: 9,
    properties: ['text', 'color', 'backgroundColor', 'errorCorrectionLevel', 'model', 'version', 'mask', 'connection', 'connectionNo', 'charCode', 'charset', 'quietZoneLeft', 'quietZoneRight', 'quietZoneTop', 'quietZoneBottom', 'quietZoneAddOn'],
  },
};

/** `CODABAR` -> the descriptor `Codabar`; also the reverse lookup. */
export const infoForSymbology = (symbology: string): BarcodeInfo | undefined => {
  const key = symbology.toUpperCase();
  for (const info of Object.values(BARCODE_INFOS))
    if (info.fnName === `BC_${key}` || info.type.toUpperCase() === key) return info;
  return undefined;
};

/** symbology key (`CODABAR`) <-> descriptor type (`Codabar`). */
export const symbologyKey = (type: string): string => type.toUpperCase();

/** The barcode symbologies whose payload the trial validates character by character. */
export const LINEAR_SYMBOLOGIES = ['EAN13', 'EAN8', 'CODABAR', 'CODE39', 'CODE93', 'CODE128', 'GS1_128'];



/** Read one positional argument as the trial stores it (no coercion of the value type). */
function argValue(args: Args, index: number): unknown {
  if (args.count <= index) return undefined;
  const raw = args.safe(index);
  if (raw === null || raw === undefined) return undefined;
  if (typeof raw === 'object') {
    const record = raw as { error?: string };
    if (typeof record.error === 'string') return undefined;
    const inner = (raw as { value?: unknown }).value;
    return typeof inner === 'object' && inner !== null ? String(inner) : inner;
  }
  return raw;
}

const asNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value))) return Number(value);
  return undefined;
};

const asText = (value: unknown): string => value === undefined || value === null ? '' : String(value);

/**
 * The trial's argument record: the passed properties keyed by the descriptor names, in
 * descriptor order, followed by `type` and `isBarcode`.
 */
export function barcodeRecord(symbology: string, args: Args): Record<string, unknown> {
  const info = infoForSymbology(symbology);
  if (!info) return { text: asText(argValue(args, 0)), isBarcode: true };
  const record: Record<string, unknown> = { text: asText(argValue(args, 0)) };
  for (let index = 1; index < info.properties.length; index++) {
    const value = argValue(args, index);
    if (value === undefined) continue;
    record[info.properties[index]!] = value;
  }
  record.type = info.type;
  record.isBarcode = true;
  return record;
}

/**
 * Trial-observed argument validation.  Returns `true` when the trial paints the symbol and
 * `false` when it answers `#VALUE!` for the same call.
 */
export function barcodeArgsAccepted(symbology: string, record: Record<string, unknown>): boolean {
  const text = asText(record.text);
  switch (symbology.toUpperCase()) {
    case 'CODABAR':
      // Codabar alphabet (the trial paints `1234-5678`, `+12345678`, `12:34`, `12$34`,
      // `123.456`, `12/34` and rejects `HELLO`/`AB`).
      if (!/^[0-9\-$:/.+]*$/.test(text)) return false;
      if (record.nwRatio !== undefined && ![2, 3].includes(asNumber(record.nwRatio) as number)) return false;
      return true;
    case 'CODE39': {
      const fullAscii = !!record.fullASCII;
      const alphabet = fullAscii ? /^[ -~]*$/ : /^[0-9A-Z\-.$/+% ]*$/;
      if (!alphabet.test(text)) return false;
      if (record.nwRatio !== undefined && ![2, 3].includes(asNumber(record.nwRatio) as number)) return false;
      return true;
    }
    case 'CODE93':
      if (record.fullASCII) return !text || /^[\x00-\x7F]*$/.test(text);
      return /^[0-9A-Z\-.$/+% ]*$/.test(text);
    case 'CODE49':
      return /^[0-9A-Za-z\-.$/+% ]*$/.test(text);
    case 'EAN13': {
      // The trial validates the GS1 check digit on a 13-digit payload; a 12-digit payload
      // is completed.  Passing the `addOn` argument answers `#VALUE!` in every measured
      // form (0, 2, 3, 5, numeric or string, with or without the add-on digits).
      if (!/^[0-9]+$/.test(text)) return false;
      if (record.addOn !== undefined) return false;
      if (text.length === 12) return true;
      if (text.length === 13) return gs1Check(text.slice(0, 12)) === Number(text[12]);
      return false;
    }
    case 'EAN8':
      if (!/^[0-9]+$/.test(text)) return false;
      if (text.length === 7) return true;
      if (text.length === 8) return ean8Check(text.slice(0, 7)) === Number(text[7]);
      return false;
    case 'GS1_128':
      return /^[\x00-\x7F]*$/.test(text);
    case 'CODE128':
      if (record.codeSet !== undefined && ![0, 1, 2, 3, 4].includes(asNumber(record.codeSet) as number)) return false;
      return /^[\x00-\x7F]*$/.test(text);
    case 'DATAMATRIX':
      // Only the `ECC200` mode string is accepted.  The trial answers `#VALUE!` for numeric
      // `eccMode` values, `auto`, `ECC00_140`, and for every measured symbol-size argument
      // (0, 2, 10, 12, 14 numeric and "12"/"Automatic" strings).
      if (record.eccMode !== undefined && record.eccMode !== 'ECC200') return false;
      for (const key of ['ecc200SymbolSize', 'ecc200EncodingMode', 'ecc00_140SymbolSize', 'structuredAppend', 'structureNumber', 'fileIdentifier'])
        if (record[key] !== undefined) return false;
      return true;
    case 'PDF417': {
      const level = asNumber(record.errorCorrectionLevel);
      if (record.errorCorrectionLevel !== undefined) {
        if (level === undefined) return typeof record.errorCorrectionLevel === 'string';
        if (level < 0 || level > 8) return false;
      }
      const rows = asNumber(record.rows);
      if (rows !== undefined && (rows < 3 || rows > 90)) return false;
      const columns = asNumber(record.columns);
      if (columns !== undefined && (columns < 1 || columns > 30)) return false;
      // Both given: the trial also checks the codeword capacity.  Measured rejections and
      // acceptances (probe bc46ab, all 40 combinations): "ABC" fails 3x3/3x4/4x3 (9/12
      // slots) and passes 3x5/4x4 (15/16); "PDF417 test 12345" fails 4x4/3x6 (16/18) and
      // passes 4x5/3x7/5x4/6x6/90x1 (20/21/20/36/90); "123456789" fails 3x4 and passes 3x5.
      // The rule that fits every measured point is
      // `rows * columns >= max(15, data codewords + EC codewords + 1)` with the data
      // codeword count of our own high-level compaction (see .probe/bc46-fitrule.mts).
      if (rows !== undefined && columns !== undefined) {
        const ecCount = pdf417EcCodewordCount(Math.max(0, Math.min(8, level ?? 2)));
        if (rows * columns < Math.max(15, pdf417DataCodewords(text) + ecCount + 1)) return false;
      }
      return true;
    }
    case 'QRCODE': {
      const level = record.errorCorrectionLevel;
      if (level !== undefined && !['L', 'M', 'Q', 'H'].includes(asText(level))) return false;
      const model = asNumber(record.model);
      if (record.model !== undefined && (model === undefined || model < 1 || model > 2)) return false;
      // Measured: versions 1..14 paint, 0 and 15..19 answer `#VALUE!`.
      const version = asNumber(record.version);
      if (record.version !== undefined && (version === undefined || version < 1 || version > 14)) return false;
      const mask = asNumber(record.mask);
      if (record.mask !== undefined && (mask === undefined || mask < 0 || mask > 7)) return false;
      return true;
    }
    default:
      return true;
  }
}

/** GS1 mod-10 check digit of the first 12 EAN-13 digits (weights 1/3 from the left). */
export function gs1Check(body12: string): number {
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(body12[i]) * (i % 2 === 0 ? 1 : 3);
  return (10 - (sum % 10)) % 10;
}

/** EAN-8 check digit of the first 7 digits. */
export function ean8Check(body7: string): number {
  let sum = 0;
  for (let i = 0; i < 7; i++) sum += Number(body7[i]) * ((7 - i) % 2 === 0 ? 3 : 1);
  return (10 - (sum % 10)) % 10;
}

/**
 * Turn the trial's argument record into our paint record.  Everything the trial stores is
 * kept; the paint defaults (colours, label visibility, quiet zone) are applied here so the
 * renderer keeps its own defaults exactly as before.
 */
export function barcodePaintSpec(symbology: string, record: Record<string, unknown>): BarcodePaintSpec {
  const info = infoForSymbology(symbology);
  const key = symbologyKey(info?.type ?? symbology);
  const spec: BarcodePaintSpec = {
    symbology: key,
    data: asText(record.text),
    color: asText(record.color) || '#000',
    backColor: asText(record.backgroundColor) || '#FFF',
  };
  const zone = {
    left: asNumber(record.quietZoneLeft) ?? 0,
    right: asNumber(record.quietZoneRight) ?? 0,
    top: asNumber(record.quietZoneTop) ?? 0,
    bottom: asNumber(record.quietZoneBottom) ?? 0,
  };
  if (key === 'QRCODE') {
    spec.showLabel = typeof record.showLabel === 'boolean' ? record.showLabel : false;
    spec.errorLevel = asText(record.errorCorrectionLevel) || 'L';
    const version = asNumber(record.version);
    spec.version = version === undefined ? 'auto' : version;
    const mask = asNumber(record.mask);
    spec.mask = mask === undefined ? 'auto' : mask;
    spec.quietZone = zone;
    return spec;
  }
  const linear = LINEAR_SYMBOLOGIES.includes(key);
  spec.showLabel = typeof record.showLabel === 'boolean' ? record.showLabel : linear;
  spec.labelPosition = asText(record.labelPosition) || 'bottom';
  if (record.checkDigit !== undefined) spec.checkDigit = !!record.checkDigit;
  const ratio = asNumber(record.nwRatio);
  if (ratio !== undefined) spec.nwRatio = ratio;
  if (record.fullASCII !== undefined) spec.fullASCII = !!record.fullASCII;
  const codeSet = asNumber(record.codeSet);
  if (codeSet !== undefined) spec.codeSet = codeSet;
  if (key === 'PDF417') {
    const level = asNumber(record.errorCorrectionLevel);
    if (level !== undefined) spec.pdfLevel = level;
    const rows = asNumber(record.rows);
    if (rows !== undefined) spec.pdfRows = rows;
    const columns = asNumber(record.columns);
    if (columns !== undefined) spec.pdfColumns = columns;
    if (record.compact !== undefined) spec.compact = !!record.compact;
  }
  spec.quietZone = zone;
  return spec;
}

/** The parse + validate + paint-spec pipeline used by both the formula and the classes. */
export function barcodeSpecFromArgs(symbology: string, args: Args): { record: Record<string, unknown>; spec: BarcodePaintSpec } | null {
  const info = infoForSymbology(symbology);
  if (!info) return null;
  const record = barcodeRecord(info.type, args);
  if (!barcodeArgsAccepted(info.type, record)) return null;
  return { record, spec: barcodePaintSpec(info.type, record) };
}

/**
 * Paint record of a stored barcode value (`{ name: "BC_CODABAR", value: record }`),
 * or `null` when the record cannot be drawn.
 */
export function barcodePaintValue(value: unknown): BarcodePaintSpec | null {
  const record = (value as { value?: Record<string, unknown> } | null | undefined)?.value;
  if (!record || record.isBarcode !== true || typeof record.type !== 'string') return null;
  return barcodePaintSpec(record.type, record);
}
