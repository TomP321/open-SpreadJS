/**
 * TASK 46 item 3: `GC.Spread.Sheets.Barcode` classes and the `BC_*` formula argument layer.
 *
 * All expectations are the values measured on the official trial with its barcode add-on
 * loaded (probe segments bc46d/bc46e/bc46k/bc46p/bc46t/bc46ab/bc46ad in
 * .probe/api-sweep-probe.mjs; raw probe output in .probe/t46-out17..26.txt).  The trial
 * keys the positional formula arguments by the property names of its own `getBarcodeInfo()`
 * descriptor, stores only the arguments it was given inside a `SparklineExValue` record
 * flagged `isBarcode`, and answers `#VALUE!` for arguments it cannot use.
 */
import { describe, expect, it } from 'vitest';
import GC, { Spread } from '../src/index.js';
import type { Args } from '../src/calc/evaluate.js';
import { barcodePaintSpec, barcodeSpec, registerBarcodeFunctions } from '../src/calc/functions/barcodes.js';
import type { Worksheet } from '../src/worksheet.js';

void GC;

// TASK 72: the trial measures with its barcode add-on loaded; the `BC_*` formula layer is
// registered at that add-in's load, so this suite loads it explicitly (see barcode46 header).
registerBarcodeFunctions();

const { Barcode, Sparklines } = Spread.Sheets;

/** The trial's calc-function object handed out by `createFunction()`. */
interface BarcodeFunctionObject {
  name: string;
  minArgs: number;
  maxArgs: number;
  typeName: string;
  acceptsArray(index: number): boolean;
  evaluate(...args: unknown[]): { name: string; typeName: string; value: Record<string, unknown> };
}
interface BarcodeInfoObject {
  fnName: string;
  minimum: number;
  maxmum: number;
  type: string;
  properties: string[];
  acceptsArrayArgIndex?: number;
}
interface BarcodeInstance {
  name(): string | undefined;
  typeName: string;
  createFunction(): BarcodeFunctionObject | null;
  getBarcodeInfo(): BarcodeInfoObject | null;
  paint(context: CanvasRenderingContext2D, value: unknown, x: number, y: number, width: number, height: number): void;
}
type BarcodeClass = (new () => BarcodeInstance) & { prototype: object };
const BarcodeNamespace = Barcode as unknown as Record<string, BarcodeClass>;
const TYPES = ['Codabar', 'Code128', 'Code39', 'Code49', 'Code93', 'DataMatrix', 'EAN13', 'EAN8', 'GS1_128', 'PDF417', 'QRCode'];

const sheet = (): Worksheet => new Spread.Sheets.Workbook().getActiveSheet();
/** The stored value as JSON, shaped like the probe normalises the trial's. */
const stored = (formula: string): { name: string; typeName: string; value: Record<string, unknown> } => {
  const s = sheet();
  s.setFormula(0, 0, formula);
  const value = s.getValue(0, 0) as { name: string; typeName: string; value: Record<string, unknown> };
  return { name: value.name, typeName: value.typeName, value: JSON.parse(JSON.stringify(value.value)) as Record<string, unknown> };
};
/** `true` when the trial paints the call, `false` when it answers `#VALUE!`. */
const paints = (formula: string): boolean => {
  const s = sheet();
  s.setFormula(0, 0, formula);
  return s.getText(0, 0) !== '#VALUE!';
};

/* ------------------------------------------------------------- classes --- */

describe('GC.Spread.Sheets.Barcode classes (trial layout)', () => {
  it('exposes BarcodeBase plus the eleven symbology classes and nothing else', () => {
    expect(Object.keys(BarcodeNamespace).sort()).toEqual([...TYPES, 'BarcodeBase'].sort());
  });
  it('builds zero-argument constructors with no class statics (trial)', () => {
    for (const type of TYPES) {
      const Ctor = BarcodeNamespace[type]!;
      expect(Ctor.length, type).toBe(0);
      expect(Object.keys(Ctor), type).toEqual([]);
      const instance = new Ctor();
      expect(instance instanceof Sparklines.SparklineEx, type).toBe(true);
      expect(instance.typeName, type).toBe('');
      expect(String(instance.name()), type).toBe(`BC_${type.toUpperCase()}`);
      expect(typeof instance.paint, type).toBe('function');
    }
  });
  it('owns getBarcodeInfo on every class prototype and the shared members on BarcodeBase', () => {
    for (const type of TYPES)
      expect(Object.getOwnPropertyNames(BarcodeNamespace[type]!.prototype), type).toEqual(['constructor', 'getBarcodeInfo']);
    const base = BarcodeNamespace.BarcodeBase!;
    expect(Object.getOwnPropertyNames(base.prototype).sort()).toEqual(['constructor', 'createFunction', 'getBarcodeInfo', 'paint']);
    expect(Object.keys(base)).toEqual([]);
    const baseInstance = new base();
    expect(String(baseInstance.name())).toBe('undefined');
    expect(baseInstance.createFunction()).toBeNull();
    expect(baseInstance.getBarcodeInfo()).toBeNull();
  });
  it('reports the trial getBarcodeInfo descriptors verbatim (probe bc46k MATCH)', () => {
    const expected: Record<string, { minimum: number; maxmum: number; type: string; properties: string[]; acceptsArrayArgIndex?: number }> = {
      Codabar: {
        minimum: 1, maxmum: 17, type: 'Codabar',
        properties: ['text', 'color', 'backgroundColor', 'showLabel', 'labelPosition', 'checkDigit', 'nwRatio', 'fontFontFamily', 'fontFontStyle', 'fontFontWeight', 'fontTextDecoration', 'fontTextAlign', 'fontFontSize', 'quietZoneLeft', 'quietZoneRight', 'quietZoneTop', 'quietZoneBottom'],
      },
      Code128: {
        minimum: 1, maxmum: 16, type: 'Code128',
        properties: ['text', 'color', 'backgroundColor', 'showLabel', 'labelPosition', 'codeSet', 'fontFontFamily', 'fontFontStyle', 'fontFontWeight', 'fontTextDecoration', 'fontTextAlign', 'fontFontSize', 'quietZoneLeft', 'quietZoneRight', 'quietZoneTop', 'quietZoneBottom'],
      },
      Code39: {
        minimum: 1, maxmum: 19, type: 'Code39',
        properties: ['text', 'color', 'backgroundColor', 'showLabel', 'labelPosition', 'labelWithStartAndStopCharacter', 'checkDigit', 'nwRatio', 'fullASCII', 'fontFontFamily', 'fontFontStyle', 'fontFontWeight', 'fontTextDecoration', 'fontTextAlign', 'fontFontSize', 'quietZoneLeft', 'quietZoneRight', 'quietZoneTop', 'quietZoneBottom'],
      },
      Code49: {
        minimum: 1, maxmum: 17, type: 'Code49',
        properties: ['text', 'color', 'backgroundColor', 'showLabel', 'labelPosition', 'grouping', 'groupNo', 'fontFontFamily', 'fontFontStyle', 'fontFontWeight', 'fontTextDecoration', 'fontTextAlign', 'fontFontSize', 'quietZoneLeft', 'quietZoneRight', 'quietZoneTop', 'quietZoneBottom'],
      },
      Code93: {
        minimum: 1, maxmum: 17, type: 'Code93',
        properties: ['text', 'color', 'backgroundColor', 'showLabel', 'labelPosition', 'checkDigit', 'fullASCII', 'fontFontFamily', 'fontFontStyle', 'fontFontWeight', 'fontTextDecoration', 'fontTextAlign', 'fontFontSize', 'quietZoneLeft', 'quietZoneRight', 'quietZoneTop', 'quietZoneBottom'],
      },
      DataMatrix: {
        minimum: 1, maxmum: 14, type: 'DataMatrix',
        properties: ['text', 'color', 'backgroundColor', 'eccMode', 'ecc200SymbolSize', 'ecc200EncodingMode', 'ecc00_140SymbolSize', 'structuredAppend', 'structureNumber', 'fileIdentifier', 'quietZoneLeft', 'quietZoneRight', 'quietZoneTop', 'quietZoneBottom'],
      },
      EAN13: {
        minimum: 1, maxmum: 18, type: 'EAN13',
        properties: ['text', 'color', 'backgroundColor', 'showLabel', 'labelPosition', 'addOn', 'addOnLabelPosition', 'fontFontFamily', 'fontFontStyle', 'fontFontWeight', 'fontTextDecoration', 'fontTextAlign', 'fontFontSize', 'quietZoneLeft', 'quietZoneRight', 'quietZoneTop', 'quietZoneBottom'],
      },
      EAN8: {
        minimum: 1, maxmum: 15, type: 'EAN8',
        properties: ['text', 'color', 'backgroundColor', 'showLabel', 'labelPosition', 'fontFontFamily', 'fontFontStyle', 'fontFontWeight', 'fontTextDecoration', 'fontTextAlign', 'fontFontSize', 'quietZoneLeft', 'quietZoneRight', 'quietZoneTop', 'quietZoneBottom'],
      },
      GS1_128: {
        minimum: 1, maxmum: 16, type: 'GS1_128',
        properties: ['text', 'color', 'backgroundColor', 'showLabel', 'labelPosition', 'fontFontFamily', 'fontFontStyle', 'fontFontWeight', 'fontTextDecoration', 'fontTextAlign', 'fontFontSize', 'quietZoneLeft', 'quietZoneRight', 'quietZoneTop', 'quietZoneBottom'],
      },
      PDF417: {
        minimum: 1, maxmum: 11, type: 'PDF417',
        properties: ['text', 'color', 'backgroundColor', 'errorCorrectionLevel', 'rows', 'columns', 'compact', 'quietZoneLeft', 'quietZoneRight', 'quietZoneTop', 'quietZoneBottom'],
      },
      QRCode: {
        minimum: 1, maxmum: 16, type: 'QRCode', acceptsArrayArgIndex: 9,
        properties: ['text', 'color', 'backgroundColor', 'errorCorrectionLevel', 'model', 'version', 'mask', 'connection', 'connectionNo', 'charCode', 'charset', 'quietZoneLeft', 'quietZoneRight', 'quietZoneTop', 'quietZoneBottom', 'quietZoneAddOn'],
      },
    };
    for (const type of TYPES) {
      const info = new BarcodeNamespace[type]().getBarcodeInfo()!;
      expect(info.fnName, type).toBe(`BC_${type.toUpperCase()}`);
      expect({ ...info, fnName: undefined }, type).toEqual({ ...expected[type]!, fnName: undefined });
      // A fresh descriptor per call (the trial hands out a new object each time).
      const again = new BarcodeNamespace[type]().getBarcodeInfo()!;
      expect(again.properties).not.toBe(info.properties);
      expect(again).toEqual(info);
    }
  });
  it('createFunction hands out a BC_<TYPE> calc function that evaluates like the formula', () => {
    const fn = new BarcodeNamespace.Codabar().createFunction()!;
    expect(fn.name).toBe('BC_CODABAR');
    expect(fn.minArgs).toBe(1);
    expect(fn.maxArgs).toBe(17);
    expect(fn.typeName).toBe('');
    const value = fn.evaluate('12345678', '#000000', '#FFFFFF', true, 'top', true, 3);
    expect(value.name).toBe('BC_CODABAR');
    expect(value.value).toEqual(stored('=BC_CODABAR("12345678","#000000","#FFFFFF",true,"top",true,3)').value);
    expect(() => fn.evaluate('HELLO')).toThrow();
  });
  it('QRCode accepts an array argument at the trial index (acceptsArray)', () => {
    const fn = new BarcodeNamespace.QRCode().createFunction()!;
    expect(fn.acceptsArray(9)).toBe(true);
    expect(fn.acceptsArray(0)).toBe(false);
  });
});

/* ------------------------------------------------------------- records --- */

describe('BC_* stored values (trial records, probe bc46p/bc46ad)', () => {
  const cases: [string, string, Record<string, unknown>][] = [
    ['BC_CODABAR("12345678")', 'BC_CODABAR', { text: '12345678', type: 'Codabar', isBarcode: true }],
    ['BC_CODABAR("12345678","#000000","#FFFFFF",true)', 'BC_CODABAR', { text: '12345678', color: '#000000', backgroundColor: '#FFFFFF', showLabel: true, type: 'Codabar', isBarcode: true }],
    ['BC_CODABAR("12345678","#000000","#FFFFFF",true,"top",true,3)', 'BC_CODABAR', { text: '12345678', color: '#000000', backgroundColor: '#FFFFFF', showLabel: true, labelPosition: 'top', checkDigit: true, nwRatio: 3, type: 'Codabar', isBarcode: true }],
    ['BC_CODE128("Abc-123")', 'BC_CODE128', { text: 'Abc-123', type: 'Code128', isBarcode: true }],
    ['BC_CODE128("Abc-123","#000000","#FFFFFF",true,"bottom",2)', 'BC_CODE128', { text: 'Abc-123', color: '#000000', backgroundColor: '#FFFFFF', showLabel: true, labelPosition: 'bottom', codeSet: 2, type: 'Code128', isBarcode: true }],
    ['BC_CODE39("ABC123")', 'BC_CODE39', { text: 'ABC123', type: 'Code39', isBarcode: true }],
    ['BC_CODE39("ABC123","#000000","#FFFFFF",false,true,3,2)', 'BC_CODE39', { text: 'ABC123', color: '#000000', backgroundColor: '#FFFFFF', showLabel: false, labelPosition: true, labelWithStartAndStopCharacter: 3, checkDigit: 2, type: 'Code39', isBarcode: true }],
    ['BC_CODE49("1234")', 'BC_CODE49', { text: '1234', type: 'Code49', isBarcode: true }],
    ['BC_CODE49("1234","#000000","#FFFFFF",true,"bottom",true,2)', 'BC_CODE49', { text: '1234', color: '#000000', backgroundColor: '#FFFFFF', showLabel: true, labelPosition: 'bottom', grouping: true, groupNo: 2, type: 'Code49', isBarcode: true }],
    ['BC_CODE93("ABC123")', 'BC_CODE93', { text: 'ABC123', type: 'Code93', isBarcode: true }],
    ['BC_CODE93("ABC123","#000000","#FFFFFF",true,"bottom",true)', 'BC_CODE93', { text: 'ABC123', color: '#000000', backgroundColor: '#FFFFFF', showLabel: true, labelPosition: 'bottom', checkDigit: true, type: 'Code93', isBarcode: true }],
    ['BC_DATAMATRIX("hello")', 'BC_DATAMATRIX', { text: 'hello', type: 'DataMatrix', isBarcode: true }],
    ['BC_DATAMATRIX("hello","#000000","#FFFFFF","ECC200")', 'BC_DATAMATRIX', { text: 'hello', color: '#000000', backgroundColor: '#FFFFFF', eccMode: 'ECC200', type: 'DataMatrix', isBarcode: true }],
    ['BC_EAN13("4006381333931")', 'BC_EAN13', { text: '4006381333931', type: 'EAN13', isBarcode: true }],
    ['BC_EAN13("4006381333931","#000000","#FFFFFF",true,"top")', 'BC_EAN13', { text: '4006381333931', color: '#000000', backgroundColor: '#FFFFFF', showLabel: true, labelPosition: 'top', type: 'EAN13', isBarcode: true }],
    ['BC_EAN8("96385074")', 'BC_EAN8', { text: '96385074', type: 'EAN8', isBarcode: true }],
    ['BC_EAN8("96385074","#000000","#FFFFFF",false,"top")', 'BC_EAN8', { text: '96385074', color: '#000000', backgroundColor: '#FFFFFF', showLabel: false, labelPosition: 'top', type: 'EAN8', isBarcode: true }],
    ['BC_GS1_128("00310279198643")', 'BC_GS1_128', { text: '00310279198643', type: 'GS1_128', isBarcode: true }],
    ['BC_PDF417("PDF417 test 12345")', 'BC_PDF417', { text: 'PDF417 test 12345', type: 'PDF417', isBarcode: true }],
    ['BC_PDF417("PDF417 test 12345","#000000","#FFFFFF",2,5,4)', 'BC_PDF417', { text: 'PDF417 test 12345', color: '#000000', backgroundColor: '#FFFFFF', errorCorrectionLevel: 2, rows: 5, columns: 4, type: 'PDF417', isBarcode: true }],
    ['BC_PDF417("PDF417 test 12345","#000000","#FFFFFF",2,5,4,true)', 'BC_PDF417', { text: 'PDF417 test 12345', color: '#000000', backgroundColor: '#FFFFFF', errorCorrectionLevel: 2, rows: 5, columns: 4, compact: true, type: 'PDF417', isBarcode: true }],
    ['BC_QRCODE("hello")', 'BC_QRCODE', { text: 'hello', type: 'QRCode', isBarcode: true }],
    ['BC_QRCODE("hello","#000000","#FFFFFF","H",1,4,2)', 'BC_QRCODE', { text: 'hello', color: '#000000', backgroundColor: '#FFFFFF', errorCorrectionLevel: 'H', model: 1, version: 4, mask: 2, type: 'QRCode', isBarcode: true }],
  ];
  it.each(cases)('stores %s as the trial record', (formula, name, value) => {
    const got = stored(formula);
    expect(got.name, formula).toBe(name);
    // The trial reports barcode results as a SparklineExValue record (bc46p).
    expect(got.typeName, formula).toBe('SparklineExValue');
    expect(got.value, formula).toEqual(value);
  });
  it('paints and stores the same record through the class function', () => {
    const viaClass = new BarcodeNamespace.EAN13().createFunction()!.evaluate('4006381333931', '#000000', '#FFFFFF', true, 'top');
    expect(viaClass.value).toEqual(stored('=BC_EAN13("4006381333931","#000000","#FFFFFF",true,"top")').value);
  });
});

/* ------------------------------------------------------------ validity --- */

describe('BC_* argument validity (trial #VALUE! cases)', () => {
  const table: [string, boolean][] = [
    // Codabar alphabet and nwRatio.
    ['=BC_CODABAR("HELLO")', false], ['=BC_CODABAR("AB")', false],
    ['=BC_CODABAR("12345678")', true], ['=BC_CODABAR("1234-5678")', true], ['=BC_CODABAR("+12345678")', true],
    ['=BC_CODABAR("12:34")', true], ['=BC_CODABAR("12$34")', true], ['=BC_CODABAR("123.456")', true], ['=BC_CODABAR("12/34")', true],
    ['=BC_CODABAR("12345678","#000000","#FFFFFF",true,"bottom",true,2)', true],
    ['=BC_CODABAR("12345678","#000000","#FFFFFF",true,"bottom",true,3)', true],
    ['=BC_CODABAR("12345678","#000000","#FFFFFF",true,"bottom",true,4)', false],
    // Code 39 / Code 93: basic alphabet unless fullASCII.
    ['=BC_CODE39("abc")', false], ['=BC_CODE39("ABC123")', true],
    ['=BC_CODE39("abc","#000000","#FFFFFF",true,"bottom",false,false,2,true)', true],
    ['=BC_CODE39("ABC","#000000","#FFFFFF",true,"bottom",false,false,4)', false],
    ['=BC_CODE93("abc")', false], ['=BC_CODE93("ABC123")', true],
    ['=BC_CODE93("abc","#000000","#FFFFFF",true,"bottom",false,true)', true],
    // Code 128 / GS1-128 take the text as it is.
    ['=BC_CODE128("Abc-123")', true], ['=BC_GS1_128("abc")', true],
    ['=BC_CODE128("Abc","#000000","#FFFFFF",true,"bottom",1)', true],
    ['=BC_CODE128("Abc","#000000","#FFFFFF",true,"bottom",2)', true],
    ['=BC_CODE128("Abc","#000000","#FFFFFF",true,"bottom",3)', true],
    // Code 49.
    ['=BC_CODE49("1234")', true], ['=BC_CODE49("1234567890")', true],
    // EAN check digits and lengths.
    ['=BC_EAN13("4006381333931")', true], ['=BC_EAN13("4006381333932")', false],
    ['=BC_EAN13("400638133393")', true], ['=BC_EAN13("40063813339")', false],
    ['=BC_EAN13("1234567890123")', false], ['=BC_EAN13("400638133393A")', false],
    ['=BC_EAN13("40063813339311")', false], ['=BC_EAN13(4006381333931)', true],
    ['=BC_EAN13("400638133393112","#000000","#FFFFFF",true,"bottom",2)', false],
    ['=BC_EAN13("4006381333931","#000000","#FFFFFF",true,"bottom",0)', false],
    ['=BC_EAN8("1234567")', true], ['=BC_EAN8("96385074")', true],
    ['=BC_EAN8("96385075")', false], ['=BC_EAN8("963850741")', false], ['=BC_EAN8("9638507412")', false],
    // DataMatrix: only the ECC200 mode string; measured symbol-size arguments all fail.
    ['=BC_DATAMATRIX("hello")', true], ['=BC_DATAMATRIX("hello","#000000","#FFFFFF","ECC200")', true],
    ['=BC_DATAMATRIX("hello","#000000","#FFFFFF",1)', false], ['=BC_DATAMATRIX("hello","#000000","#FFFFFF",2)', false],
    ['=BC_DATAMATRIX("hello","#000000","#FFFFFF","auto")', false], ['=BC_DATAMATRIX("hello","#000000","#FFFFFF","ECC00_140")', false],
    ['=BC_DATAMATRIX("hello","#000000","#FFFFFF","ECC200",10)', false], ['=BC_DATAMATRIX("hello","#000000","#FFFFFF","ECC200",12)', false],
    ['=BC_DATAMATRIX("hello","#000000","#FFFFFF","ECC200",14)', false], ['=BC_DATAMATRIX("hello","#000000","#FFFFFF","ECC200","12")', false],
    ['=BC_DATAMATRIX("hello","#000000","#FFFFFF","ECC200",0)', false],
    // QR: level letters, model 1..2, version 1..14, mask 0..7.
    ['=BC_QRCODE("hello","#000000","#FFFFFF","L")', true], ['=BC_QRCODE("hello","#000000","#FFFFFF","M",1)', true],
    ['=BC_QRCODE("hello","#000000","#FFFFFF","Q",1)', true], ['=BC_QRCODE("hello","#000000","#FFFFFF","H",1)', true],
    ['=BC_QRCODE("hello","#000000","#FFFFFF","Z")', false], ['=BC_QRCODE("hello","#000000","#FFFFFF","h",1)', false],
    ['=BC_QRCODE("hello","#000000","#FFFFFF",2)', false],
    ['=BC_QRCODE("hello","#000000","#FFFFFF","H",1)', true], ['=BC_QRCODE("hello","#000000","#FFFFFF","H",2)', true],
    ['=BC_QRCODE("hello","#000000","#FFFFFF","H",0)', false], ['=BC_QRCODE("hello","#000000","#FFFFFF","H",3)', false],
    ['=BC_QRCODE("hello","#000000","#FFFFFF","H","square")', false],
    ['=BC_QRCODE("hello","#000000","#FFFFFF","H",1,1)', true], ['=BC_QRCODE("hello","#000000","#FFFFFF","H",1,14)', true],
    ['=BC_QRCODE("hello","#000000","#FFFFFF","H",1,15)', false], ['=BC_QRCODE("hello","#000000","#FFFFFF","H",1,19)', false],
    ['=BC_QRCODE("hello","#000000","#FFFFFF","H",1,0)', false],
    ['=BC_QRCODE("hello","#000000","#FFFFFF","H",1,4,0)', true], ['=BC_QRCODE("hello","#000000","#FFFFFF","H",1,4,7)', true],
    ['=BC_QRCODE("hello","#000000","#FFFFFF","H",1,4,8)', false],
    // PDF417: level 0..8, rows 3..90, columns 1..30 and the codeword capacity.
    ['=BC_PDF417("PDF417 test 12345","#000000","#FFFFFF",0)', true], ['=BC_PDF417("PDF417 test 12345","#000000","#FFFFFF",8)', true],
    ['=BC_PDF417("PDF417 test 12345","#000000","#FFFFFF",9)', false], ['=BC_PDF417("ABC","#000000","#FFFFFF",-1)', false],
    ['=BC_PDF417("ABC","#000000","#FFFFFF",2,3,30)', true], ['=BC_PDF417("ABC","#000000","#FFFFFF",2,90,1)', true],
    ['=BC_PDF417("ABC","#000000","#FFFFFF",2,3,31)', false], ['=BC_PDF417("ABC","#000000","#FFFFFF",2,3,92)', false],
    ['=BC_PDF417("ABC","#000000","#FFFFFF",2,91,1)', false], ['=BC_PDF417("ABC","#000000","#FFFFFF",2,92,1)', false],
    ['=BC_PDF417("ABC","#000000","#FFFFFF",2,1,1)', false], ['=BC_PDF417("ABC","#000000","#FFFFFF",2,2,2)', false],
    ['=BC_PDF417("ABC","#000000","#FFFFFF",2,2,17)', false], ['=BC_PDF417("PDF417 test 12345","#000000","#FFFFFF",2,2,17)', false],
    ['=BC_PDF417("ABC","#000000","#FFFFFF",2,3,4)', false], ['=BC_PDF417("ABC","#000000","#FFFFFF",2,4,3)', false],
    ['=BC_PDF417("ABC","#000000","#FFFFFF",2,3,5)', true], ['=BC_PDF417("ABC","#000000","#FFFFFF",2,4,4)', true],
    ['=BC_PDF417("PDF417 test 12345","#000000","#FFFFFF",2,4,4)', false], ['=BC_PDF417("PDF417 test 12345","#000000","#FFFFFF",2,3,6)', false],
    ['=BC_PDF417("PDF417 test 12345","#000000","#FFFFFF",2,3,7)', true], ['=BC_PDF417("PDF417 test 12345","#000000","#FFFFFF",2,4,5)', true],
    ['=BC_PDF417("PDF417 test 12345","#000000","#FFFFFF",2,5,4)', true], ['=BC_PDF417("PDF417 test 12345","#000000","#FFFFFF",2,6,4)', true],
    ['=BC_PDF417("PDF417 test 12345","#000000","#FFFFFF",2,1,92)', false], ['=BC_PDF417("PDF417 test 12345")', true],
  ];
  it.each(table)('%s paints=%s like the trial', (formula, expected) => {
    expect(paints(formula), formula).toBe(expected);
  });
});

/* ------------------------------------------------------- paint mapping --- */

describe('BC_* paint record follows the trial property order (probe bc46k/bc46p)', () => {
  const fakeArgs = (values: unknown[]): Args => ({
    count: values.length,
    text: (i: number) => String(values[i] ?? ''),
    boolean: (i: number) => Boolean(values[i]),
    safe: (i: number) => values[i] ?? null,
  }) as unknown as Args;

  it('reads the quiet zone from the descriptor positions, not from guessed indices', () => {
    // Codabar: ... nwRatio(6), fontFontFamily(7) .. fontFontSize(12), quietZoneLeft(13..16).
    const codabar = barcodeSpec('CODABAR', fakeArgs(['12345678', '#000000', '#FFFFFF', true, 'bottom', true, 3, 'Arial', '', '', '', '', '12px', 4, 5, 6, 7]));
    expect(codabar.quietZone).toEqual({ left: 4, right: 5, top: 6, bottom: 7 });
    // EAN13: ... addOn(5), addOnLabelPosition(6), fonts(7..12), quietZoneLeft(13..16).
    const ean13 = barcodeSpec('EAN13', fakeArgs(['4006381333931', '#000000', '#FFFFFF', true, 'top', undefined, undefined, '', '', '', '', '', '', 1, 2, 3, 4]));
    expect(ean13.quietZone).toEqual({ left: 1, right: 2, top: 3, bottom: 4 });
    expect(ean13.labelPosition).toBe('top');
    // PDF417: ... compact(6), quietZoneLeft(7..10).
    const pdf = barcodeSpec('PDF417', fakeArgs(['PDF417 test 12345', '#000000', '#FFFFFF', 2, 5, 4, true, 8, 9, 10, 11]));
    expect(pdf.quietZone).toEqual({ left: 8, right: 9, top: 10, bottom: 11 });
    expect(pdf.pdfRows).toBe(5);
    expect(pdf.pdfColumns).toBe(4);
    expect(pdf.pdfLevel).toBe(2);
    expect(pdf.compact).toBe(true);
    // QRCode: ... charset(10), quietZoneLeft(11..14).
    const qr = barcodeSpec('QRCODE', fakeArgs(['hello', '#000000', '#FFFFFF', 'H', 1, 4, 2]));
    expect(qr.errorLevel).toBe('H');
    expect(qr.version).toBe(4);
    expect(qr.mask).toBe(2);
    expect(qr.quietZone).toEqual({ left: 0, right: 0, top: 0, bottom: 0 });
  });
  it('keeps the trial defaults for the arguments the trial does not store', () => {
    const spec = barcodeSpec('CODABAR', fakeArgs(['12345678']));
    expect(spec.color).toBe('#000');
    expect(spec.backColor).toBe('#FFF');
    expect(spec.showLabel).toBe(true);
    expect(spec.labelPosition).toBe('bottom');
    expect(barcodeSpec('QRCODE', fakeArgs(['hello'])).showLabel).toBe(false);
    expect(barcodeSpec('DATAMATRIX', fakeArgs(['hello'])).showLabel).toBe(false);
  });
  it('scales the 3:1 wide elements when nwRatio 2 is given', async () => {
    const { linearModuleString } = await import('../src/features/barcode.js');
    const codabar = linearModuleString({ symbology: 'CODABAR', data: '12345678', nwRatio: 3 })!;
    const narrow = linearModuleString({ symbology: 'CODABAR', data: '12345678', nwRatio: 2 })!;
    expect(codabar.length).toBe(123);
    expect(narrow.length).toBe(101);
    const code39 = linearModuleString({ symbology: 'CODE39', data: 'ABC123', nwRatio: 2 })!;
    expect(code39.length).toBe(103);
  });
  it('stores quiet-zone arguments at the descriptor positions (trial property order)', () => {
    // DataMatrix properties end with quietZoneLeft(11) .. quietZoneBottom(14).
    const spec = barcodePaintSpec('DataMatrix', { text: 'hello', quietZoneLeft: 1, quietZoneRight: 2, quietZoneTop: 3, quietZoneBottom: 4, isBarcode: true });
    expect(spec.quietZone).toEqual({ left: 1, right: 2, top: 3, bottom: 4 });
    expect(spec.symbology).toBe('DATAMATRIX');
    expect(spec.data).toBe('hello');
  });
});
