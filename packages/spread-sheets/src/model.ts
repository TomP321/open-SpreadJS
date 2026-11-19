/**
 * Public model entry: re-exports the Workbook and Worksheet classes (now
 * living in `workbook.ts` / `worksheet.ts`) plus the shared serialization
 * option types. Kept as the historical import path for tests and tools.
 */
export { Workbook } from './workbook.js';
export { Worksheet } from './worksheet.js';
export { subtractRange } from './sheet-common.js';
export type {
  DirtyCell,
  SerializationOptions,
  WorkbookOptions,
  WorksheetOptions,
} from './sheet-common.js';
