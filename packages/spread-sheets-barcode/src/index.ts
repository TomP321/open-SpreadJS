/**
 * TASK 73: the `BC_*` barcode add-in (`@opensheets/spread-sheets-barcode`).
 *
 * The trial keeps the `BC_*` formula layer out of the core: it registers it only when the
 * separate barcode package loads (black-box: core-only evaluates `BC_QRCODE("x")` as `#NAME?`,
 * after the add-in loads the same formula yields the barcode record). Our core implements the
 * layer (TASK 46) but exposes it only through the hidden, non-enumerable
 * `GC.Spread.Sheets._registerBarcodeFunctions` hook, so this package is the piece an
 * application installs to get `BC_*` — mirroring the official install recipe:
 *
 *   "@mescius/spread-sheets-barcode": "npm:@opensheets/spread-sheets-barcode@^0.1.0"
 *
 * The add-in registers the layer exactly once on the core it finds (the ESM import of
 * `@mescius/spread-sheets`, the CJS require, or `window.GC` for the script-tag build), the
 * same point the trial add-in occupies. Registration is idempotent, so bundling this package
 * next to another bundle that already registered the layer stays harmless.
 */
import core from '@mescius/spread-sheets';
import { install } from './install.js';

install(core);

export {};
