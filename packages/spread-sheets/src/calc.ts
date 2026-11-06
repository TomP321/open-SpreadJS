import type { Worksheet } from './model.js';
/** M3 can attach a calculator without changing the sparse model or its public API. */
export interface ICalcEngine {
  formulaChanged(sheet: Worksheet, row: number, col: number, formula: string | null): void;
  valueChanged?(sheet: Worksheet, row: number, col: number, value: unknown): void;
  recalculate(sheet: Worksheet, all: boolean): void;
}
