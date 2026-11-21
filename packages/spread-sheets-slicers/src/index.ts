/**
 * TASK 76: the slicers add-in package (`@opensheets/spread-sheets-slicers`).
 *
 * The official trial ships the slicer/timeline layer as the separate package
 * `@mescius/spread-sheets-slicers` (script file `dist/gc.spread.sheets.slicers.min.js`); applications list
 * it in package.json and load it after the core.
 *
 * The core implements the slicer layer (`worksheet.slicers`, the pivot/table slicers, the
 * timeline and `GC.Spread.Slicers`' data types) and exposes it unconditionally, so this
 * package is the install-time counterpart of the official add-in rather than an activator:
 * importing it finds the core and verifies the host, then stays a documented no-op.
 *
 * The add-in is harmless and idempotent: a second load (or a second bundled copy) finds the
 * same core and does nothing again, exactly like the trial's. It is the piece that makes the
 * drop-in alias work:
 *
 *   "@mescius/spread-sheets-slicers": "npm:@opensheets/spread-sheets-slicers@^0.1.0"
 */
import core from '@mescius/spread-sheets';
import { install } from './install.js';

install(core);

export {};
