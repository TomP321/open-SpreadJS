/**
 * TASK 76: the pivot tables add-in package (`@opensheets/spread-sheets-pivot-addon`).
 *
 * The official trial ships the pivot-table engine as the separate package
 * `@mescius/spread-sheets-pivot-addon` (script file `dist/gc.spread.pivot.pivottables.min.js`); applications list
 * it in package.json and load it after the core.
 *
 * The core implements the pivot engine (`worksheet.pivotTables`, the field/filter/layout
 * model and `GC.Spread.Pivot`) and exposes it unconditionally, so this package is the
 * install-time counterpart of the official add-in rather than an activator: importing it
 * finds the core and verifies the host, then stays a documented no-op.
 *
 * The add-in is harmless and idempotent: a second load (or a second bundled copy) finds the
 * same core and does nothing again, exactly like the trial's. It is the piece that makes the
 * drop-in alias work:
 *
 *   "@mescius/spread-sheets-pivot-addon": "npm:@opensheets/spread-sheets-pivot-addon@^0.1.0"
 */
import core from '@mescius/spread-sheets';
import { install } from './install.js';

install(core);

export {};
