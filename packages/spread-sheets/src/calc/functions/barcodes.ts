/**
 * TASK 46 item 3: the built-in `BC_*` formula layer.
 *
 * The trial (its barcode add-on) keys the positional arguments by the property names its
 * own `getBarcodeInfo()` descriptor lists, and stores the arguments it was given verbatim
 * in the cell value: `{ text, color, backgroundColor, ..., type: "Codabar", isBarcode: true }`
 * inside a `SparklineExValue`-shaped record named `BC_CODABAR` (probe bc46p/bc46t).
 * Arguments the trial cannot use answer `#VALUE!`; those accepted/rejected combinations are
 * the measured ones, implemented in `features/barcode-args.ts`.
 */
import type { Args, BuiltinFunction } from '../evaluate.js';
import { BarcodeExValue, ErrorCode, raise } from '../values.js';
import type { BarcodePaintSpec } from '../../features/barcode.js';
import { linearModuleString } from '../../features/barcode.js';
import {
  barcodePaintSpec, barcodeRecord, barcodeSpecFromArgs,
  infoForSymbology, LINEAR_SYMBOLOGIES, symbologyKey,
} from '../../features/barcode-args.js';

export {
  BARCODE_INFOS, barcodeArgsAccepted, barcodePaintSpec, barcodePaintValue, barcodeRecord,
  barcodeSpecFromArgs, infoForSymbology, LINEAR_SYMBOLOGIES, symbologyKey,
} from '../../features/barcode-args.js';
export type { BarcodeInfo } from '../../features/barcode-args.js';

const BARCODE_TYPES = ['QRCODE', 'EAN13', 'EAN8', 'CODABAR', 'CODE39', 'CODE93', 'CODE128', 'GS1_128', 'CODE49', 'PDF417', 'DATAMATRIX'];

/**
 * Parse a `BC_*` argument list into the trial's stored record and our paint record.
 * `null` when the trial answers `#VALUE!` for the same call.
 */
export function barcodeParse(symbology: string, args: Args): { name: string; record: Record<string, unknown>; spec: BarcodePaintSpec } | null {
  const parsed = barcodeSpecFromArgs(symbology, args);
  if (!parsed) return null;
  // The trial rejects payloads its encoder cannot build (`BC_CODABAR("HELLO")` -> `#VALUE!`,
  // `BC_CODABAR("12345678")` paints); the linear payload check happens in the encoders.
  if (LINEAR_SYMBOLOGIES.includes(parsed.spec.symbology) && linearModuleString(parsed.spec) === null) return null;
  return { name: infoForSymbology(symbology)?.fnName ?? `BC_${symbology}`, ...parsed };
}

/** Paint defaults of a trial argument list (dialog/cell-type path). */
export function barcodeSpec(symbology: string, args: Args): BarcodePaintSpec {
  const parsed = barcodeSpecFromArgs(symbology, args);
  if (parsed) return parsed.spec;
  const info = infoForSymbology(symbology);
  return barcodePaintSpec(info?.type ?? symbologyKey(symbology), barcodeRecord(info?.type ?? symbologyKey(symbology), args));
}

export const BARCODE_FUNCTIONS: BuiltinFunction[] = BARCODE_TYPES.map(symbology => ({
  name: `BC_${symbology}`,
  min: 1,
  max: 16,
  evaluate(args) {
    const parsed = barcodeParse(symbology, args);
    if (!parsed) raise(ErrorCode.value);
    return new BarcodeExValue(parsed.name, parsed.record);
  },
}));
