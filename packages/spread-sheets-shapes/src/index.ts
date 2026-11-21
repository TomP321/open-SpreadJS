/**
 * TASK 76: the Auto Shapes add-in package (`@opensheets/spread-sheets-shapes`).
 *
 * The official trial ships the auto-shape layer as the separate package
 * `@mescius/spread-sheets-shapes` (script file `dist/gc.spread.sheets.shapes.min.js`); applications list
 * it in package.json and load it after the core.
 *
 * The core implements the shape layer (`worksheet.shapes`, the `Shapes.Shape`/`GroupShape`/
 * `Picture` classes and their rendering) and exposes it unconditionally, so this package is
 * the install-time counterpart of the official add-in rather than an activator: importing it
 * finds the core and verifies the host, then stays a documented no-op. The official trial
 * loads `-charts` after this package; the OpenSheets core makes either order work.
 *
 * The add-in is harmless and idempotent: a second load (or a second bundled copy) finds the
 * same core and does nothing again, exactly like the trial's. It is the piece that makes the
 * drop-in alias work:
 *
 *   "@mescius/spread-sheets-shapes": "npm:@opensheets/spread-sheets-shapes@^0.1.0"
 */
import core from '@mescius/spread-sheets';
import { install } from './install.js';

install(core);

export {};
