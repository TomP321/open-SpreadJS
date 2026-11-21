/**
 * TASK 46 item 3: the `GC.Spread.Sheets.Barcode` symbology classes.
 *
 * Trial shape (probe segments bc46d/bc46e/bc46k on the official core page with the barcode
 * add-on loaded, observed only through the public API):
 * - the namespace exposes `BarcodeBase` plus the eleven symbology classes and nothing else;
 * - every instance is a `GC.Spread.Sheets.Sparklines.SparklineEx` subclass
 *   (`instanceof` is true on the trial, matching the d.ts `extends` clause);
 * - zero-argument constructors, no class statics; the instance reports the formula name
 *   through `name()` (`BC_CODABAR`...) with an empty `typeName`;
 * - `createFunction()` returns a calc-function object named `BC_<TYPE>`;
 * - each prototype owns `getBarcodeInfo()`, returning the trial's argument descriptor
 *   (`fnName`, `minimum`, `maxmum` [sic], `type`, `properties[]`, plus
 *   `acceptsArrayArgIndex` on QRCode). The trial's own key spelling `maxmum` is preserved
 *   verbatim for drop-in compatibility.
 *
 * Behaviour delegates to the same argument layer the built-in `BC_*` formulas use
 * (`features/barcode-args.ts`), so a class instance and the formula produce the identical
 * stored record and the identical painted modules for the same inputs.
 */
import { Function as CalcFunctionObject } from '../calc/functions-api.js';
import { BarcodeExValue, ErrorCode, raise } from '../calc/values.js';
import { drawBarcode, linearModuleString } from './barcode.js';
import {
  BARCODE_INFOS, barcodeArgsAccepted, barcodePaintSpec, barcodeRecord, infoForSymbology,
  LINEAR_SYMBOLOGIES, type BarcodeArgsSource, type BarcodeInfo,
} from './barcode-args.js';
import { SparklineExBase, type SparklineExObject } from './sparkline-ex.js';

/** `Codabar` -> `CODABAR`: the encoder symbology key used by the paint record. */
const symbologyOf = (typeName: string): string => typeName.toUpperCase();

/** A direct `function.evaluate(a, b, ...)` call sees plain JavaScript values. */
function listArgs(values: unknown[]): BarcodeArgsSource {
  return {
    count: values.length,
    safe: (index: number) => values[index] ?? null,
  };
}

/** The calc-function object `createFunction()` hands out, evaluated like the `BC_*` formula. */
class BarcodeFunction extends CalcFunctionObject {
  constructor(private readonly info: BarcodeInfo) {
    super(info.fnName, info.minimum, info.maxmum);
    // The trial's barcode function objects report an empty typeName.
    Object.defineProperty(this, 'typeName', { value: '', writable: true, enumerable: true, configurable: true });
    const symbology = symbologyOf(info.type);
    const evaluate = (...values: unknown[]): BarcodeExValue => {
      const args = listArgs(values);
      const record = barcodeRecord(info.type, args);
      if (!barcodeArgsAccepted(info.type, record)) raise(ErrorCode.value);
      const spec = barcodePaintSpec(info.type, record);
      if (LINEAR_SYMBOLOGIES.includes(symbology) && linearModuleString(spec) === null) raise(ErrorCode.value);
      return new BarcodeExValue(info.fnName, record);
    };
    Object.defineProperty(this, 'evaluate', { value: evaluate, writable: true, enumerable: true, configurable: true });
  }

  override acceptsArray(index: number): boolean {
    return this.info.acceptsArrayArgIndex === index;
  }
}

function barcodeInfo(this: SparklineExObject): BarcodeInfo | null {
  const key = typeNameOf(this);
  const info = key ? BARCODE_INFOS[key] : undefined;
  // A fresh copy per call, like the trial descriptor.
  return info ? { ...info, properties: [...info.properties] } : null;
}

function createFunction(this: SparklineExObject): CalcFunctionObject | null {
  const info = barcodeInfo.call(this);
  return info ? new BarcodeFunction(info) : null;
}

/** Draws the stored record exactly like the cell barcode painter. */
function paint(this: SparklineExObject, context: CanvasRenderingContext2D, value: unknown, x: number, y: number, width: number, height: number): void {
  const record = value instanceof BarcodeExValue
    ? value.value
    : value && typeof value === 'object' && (value as { isBarcode?: boolean }).isBarcode === true
      ? value as Record<string, unknown>
      : null;
  if (!record || typeof record.type !== 'string') return;
  drawBarcode(context, barcodePaintSpec(record.type, record), x, y, width, height);
}

/** Class -> descriptor key; kept off the classes so `Object.keys(class)` stays empty (trial). */
const classType = new WeakMap<object, string>();

/** The descriptor key (`Codabar`) an instance belongs to. */
const typeNameOf = (instance: SparklineExObject): string | undefined => {
  const own = typeof instance.barcodeType === 'string' ? instance.barcodeType : undefined;
  return own ?? classType.get(Object.getPrototypeOf(instance));
};

/** Internal base of the symbology classes (the trial's `BarcodeBase`). */
function BarcodeExBase(this: SparklineExObject): void {
  SparklineExBase.call(this);
}
BarcodeExBase.prototype = Object.create(SparklineExBase.prototype);
Object.defineProperty(BarcodeExBase.prototype, 'constructor', { value: BarcodeExBase, writable: true, enumerable: false, configurable: true });
for (const [key, member] of Object.entries({ createFunction, getBarcodeInfo: barcodeInfo, paint }))
  Object.defineProperty(BarcodeExBase.prototype, key, { value: member, writable: true, enumerable: false, configurable: true });

/** A symbology class: the trial layout owns `getBarcodeInfo` on its prototype. */
interface BarcodeClass {
  new (): SparklineExObject;
  prototype: SparklineExObject;
}

/** Prototype-wiring seam: an ES5 function typed as its JS constructor (trial emits classes this way). */
const asClass = (fn: (this: SparklineExObject) => void): BarcodeClass => fn as unknown as BarcodeClass;

function barcodeClass(typeName: string): BarcodeClass {
  const info = BARCODE_INFOS[typeName]!;
  const ctor = asClass(function (this: SparklineExObject) {
    // `SparklineEx`'s own constructor runs `createFunction()` and stores the created
    // function's name, so `name()` reports `BC_<TYPE>` like on the trial.
    BarcodeExBase.call(this);
    Object.defineProperty(this, 'barcodeType', { value: typeName, writable: true, enumerable: false, configurable: true });
  });
  ctor.prototype = Object.create(BarcodeExBase.prototype) as SparklineExObject;
  Object.defineProperty(ctor.prototype, 'constructor', { value: ctor, writable: true, enumerable: false, configurable: true });
  Object.defineProperty(ctor.prototype, 'getBarcodeInfo', {
    value: () => ({ ...info, properties: [...info.properties] }),
    writable: true,
    enumerable: false,
    configurable: true,
  });
  // `SparklineEx`'s constructor calls `createFunction()`; the mapping lets it find the
  // symbology (and therefore the `BC_<TYPE>` name) without a class static.
  classType.set(ctor.prototype, typeName);
  return ctor;
}

export interface BarcodeNamespace {
  BarcodeBase: BarcodeClass;
  Codabar: BarcodeClass;
  Code128: BarcodeClass;
  Code39: BarcodeClass;
  Code49: BarcodeClass;
  Code93: BarcodeClass;
  DataMatrix: BarcodeClass;
  EAN13: BarcodeClass;
  EAN8: BarcodeClass;
  GS1_128: BarcodeClass;
  PDF417: BarcodeClass;
  QRCode: BarcodeClass;
}

export const Barcode: BarcodeNamespace = {
  BarcodeBase: asClass(BarcodeExBase),
  Codabar: barcodeClass('Codabar'),
  Code128: barcodeClass('Code128'),
  Code39: barcodeClass('Code39'),
  Code49: barcodeClass('Code49'),
  Code93: barcodeClass('Code93'),
  DataMatrix: barcodeClass('DataMatrix'),
  EAN13: barcodeClass('EAN13'),
  EAN8: barcodeClass('EAN8'),
  GS1_128: barcodeClass('GS1_128'),
  PDF417: barcodeClass('PDF417'),
  QRCode: barcodeClass('QRCode'),
};

export { infoForSymbology };
