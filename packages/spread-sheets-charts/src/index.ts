/**
 * TASK 76: the Charts add-in package (`@opensheets/spread-sheets-charts`).
 *
 * The official trial ships the chart layer as the separate package
 * `@mescius/spread-sheets-charts` (script file `dist/gc.spread.sheets.charts.min.js`); applications list
 * it in package.json and load it after the core.
 *
 * The core implements the whole chart layer (`worksheet.charts.add`, every `ChartType`, the chart
 * property tree and the SVG/canvas painting) and exposes it unconditionally, so this package
 * is the install-time counterpart of the official add-in rather than an activator: importing
 * it finds the core and verifies the host, then stays a documented no-op. That keeps the
 * official install recipe — list `@mescius/spread-sheets-charts` in package.json, import it
 * after the core — working unchanged against OpenSheets.
 *
 * The add-in is harmless and idempotent: a second load (or a second bundled copy) finds the
 * same core and does nothing again, exactly like the trial's. It is the piece that makes the
 * drop-in alias work:
 *
 *   "@mescius/spread-sheets-charts": "npm:@opensheets/spread-sheets-charts@^0.1.0"
 */
import core from '@mescius/spread-sheets';
import { install } from './install.js';

install(core);

export {};
