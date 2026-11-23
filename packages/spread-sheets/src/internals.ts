/*
 * Internal drawing helpers of the core, exposed as a separate bundle entry so the
 * designer galleries can paint the same presets without importing the whole GC runtime.
 * These are NOT part of the documented `GC` API surface.
 */
export { addShapePath, paintFormControl, paintShape } from './features/shape-geometry.js';
export type { ShapeControl } from './features/shape-geometry.js';
/** Formula-function metadata (argument names + descriptions) for the designer's dialogs. */
export { functionCatalog } from './calc/function-catalog.js';
export type { FunctionHint } from './calc/function-catalog.js';
/** TASK 89: types for the calc language-package layer. The live registry state lives in the
 *  core bundle (shared with `GC.Spread.CalcEngine.LanguagePackages`); add-ins and the designer
 *  read the active package through the hidden `_activeLanguagePackage` accessor there, never
 *  through a second copy of the registry — the same rule forbids re-exporting the mutator
 *  value here, because bundling it would inline a second registry into the internals bundle. */
export type { LanguagePackage, LanguagePackageData } from './calc/language-packages.js';
