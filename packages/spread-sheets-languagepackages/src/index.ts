/**
 * TASK 76: the calc-engine language packages add-in package (`@opensheets/spread-sheets-languagepackages`).
 *
 * The official trial ships the calc-engine language-package layer as the separate package
 * `@mescius/spread-sheets-languagepackages` (script file `dist/gc.spread.calcengine.languagepackages.min.js`); applications list
 * it in package.json and load it after the core.
 *
 * The core ships the `GC.Spread.CalcEngine.LanguagePackages` surface (declared in the
 * public d.ts) and answers `languagePackages() -> undefined` until a language package is
 * installed — matching the trial core without this add-on. This package is the install-time
 * counterpart of the official add-in: importing it finds the core and verifies the host, then
 * stays a documented no-op (the non-enumerable language data sets the trial's package adds
 * are a tracked content gap, not a namespace gap; see docs/STATUS.md).
 *
 * The add-in is harmless and idempotent: a second load (or a second bundled copy) finds the
 * same core and does nothing again, exactly like the trial's. It is the piece that makes the
 * drop-in alias work:
 *
 *   "@mescius/spread-sheets-languagepackages": "npm:@opensheets/spread-sheets-languagepackages@^0.1.0"
 */
import core from '@mescius/spread-sheets';
import { install } from './install.js';

install(core);

export {};
