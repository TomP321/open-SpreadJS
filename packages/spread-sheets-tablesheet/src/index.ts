/**
 * TASK 76: the table sheet add-in package (`@opensheets/spread-sheets-tablesheet`).
 *
 * The official trial ships the table sheet type as the separate package
 * `@mescius/spread-sheets-tablesheet` (script file `dist/gc.spread.sheets.tablesheet.min.js`); applications list
 * it in package.json and load it after the core.
 *
 * The core implements the table sheet type (`Sheets.TableSheet.TableSheet`, its bound
 * view, panel and row actions) and exposes it unconditionally, so this package is the
 * install-time counterpart of the official add-in rather than an activator: importing it
 * finds the core and verifies the host, then stays a documented no-op.
 *
 * The add-in is harmless and idempotent: a second load (or a second bundled copy) finds the
 * same core and does nothing again, exactly like the trial's. It is the piece that makes the
 * drop-in alias work:
 *
 *   "@mescius/spread-sheets-tablesheet": "npm:@opensheets/spread-sheets-tablesheet@^0.1.0"
 */
import core from '@mescius/spread-sheets';
import { install } from './install.js';

install(core);

export {};
