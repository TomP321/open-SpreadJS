/**
 * TASK 76: the Print add-in package (`@opensheets/spread-sheets-print`).
 *
 * The official trial ships the print pipeline as the separate package
 * `@mescius/spread-sheets-print` (script file `dist/gc.spread.sheets.print.min.js`); applications list
 * it in package.json and load it after the core.
 *
 * The core implements the print pipeline (`workbook.print()`, the `Print.PrintInfo`
 * accessor tree and the public `Print.WorksheetPaginator`/`WorkbookPaginator` behind the
 * paginated print preview) and exposes it unconditionally, so this package is the
 * install-time counterpart of the official add-in rather than an activator: importing it
 * finds the core and verifies the host, then stays a documented no-op.
 *
 * The add-in is harmless and idempotent: a second load (or a second bundled copy) finds the
 * same core and does nothing again, exactly like the trial's. It is the piece that makes the
 * drop-in alias work:
 *
 *   "@mescius/spread-sheets-print": "npm:@opensheets/spread-sheets-print@^0.1.0"
 */
import core from '@mescius/spread-sheets';
import { install } from './install.js';

install(core);

export {};
