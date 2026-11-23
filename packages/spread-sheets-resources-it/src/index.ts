/**
 * TASK 88 item 3: the Italian resources package entry (`@opensheets/spread-sheets-resources-it`).
 *
 * The official product localises its spreadsheet UI through per-language
 * resource packages (`@mescius/spread-sheets-resources-ja|ko|zh`; there is no
 * official Italian one). This package is the Italian counterpart: importing it
 * registers the `it-it` culture plus its UI string table on the core it finds,
 * and it may run before any workbook is created — like the official packages.
 *
 *   import '@mescius/spread-sheets';
 *   import '@mescius/spread-sheets-resources-it';   // npm alias -> this package
 *   GC.Spread.Common.CultureManager.culture('it-it');
 *
 * English stays the default: nothing changes until the culture is switched.
 * `CultureManager.culture('it-it')` switches at runtime, the string lookups in
 * the core re-read the current culture on every render.
 *
 * The package declares the core as a peer dependency and resolves it through the
 * host's alias, the same wiring `@opensheets/spread-sheets-io` uses; the
 * script-tag build (`dist/gc.spread.sheets.resources.it.min.js`) attaches to the
 * `window.GC` the core set.
 */
import core from '@mescius/spread-sheets';
import { culture, cultureDisplayName, cultureName, registerItalian, resources } from './register.js';

export { culture, cultureDisplayName, cultureName, registerItalian, resources };

registerItalian(core);

export default resources;
