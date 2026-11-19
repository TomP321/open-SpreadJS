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
