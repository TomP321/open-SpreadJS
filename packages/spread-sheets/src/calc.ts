import type { Worksheet } from './model.js';

/** Calculation service attached to worksheets by the workbook. */
export interface ICalcEngine {
  /** Parses and validates a formula, returning its canonical text. */
  parseFormula?(sheet: Worksheet, row: number, col: number, formula: string): string;
  formulaChanged(sheet: Worksheet, row: number, col: number, formula: string | null): void;
  valueChanged?(sheet: Worksheet, row: number, col: number, value: unknown): void;
  cellWriting?(sheet: Worksheet, row: number, col: number): void;
  recalculate(sheet: Worksheet, all: boolean): void;
  /** Translates relative references for copy/fill. */
  translateFormula?(formula: string, rows: number, columns: number): string;
  /** Drops array-spill output values before a structural change re-spills them. */
  clearSpills?(sheet: Worksheet): void;
  /** Re-points formulas after a move (cut/paste) operation. */
  moveRange?(
    sheet: Worksheet,
    fromRow: number,
    fromCol: number,
    toRow: number,
    toCol: number,
    rowCount: number,
    colCount: number,
  ): void;
  /** Adjusts stored formulas after rows/columns were inserted or removed. */
  adjustStructure?(
    sheet: Worksheet,
    axis: 'row' | 'col',
    index: number,
    amount: number,
    remove: boolean,
  ): void;
  sheetRenamed?(sheet: Worksheet, oldName: string, newName: string): void;
  sheetRemoved?(sheet: Worksheet): void;
  namesChanged?(): void;
  /** Rebuilds the formula graph from stored cell formulas. */
  rebuildFormulas?(): void;
  /** Loads formulas with cached values after a JSON import. */
  loadFormulas?(): void;
  getSpillRange?(sheet: Worksheet, row: number, col: number): { r1: number; c1: number; r2: number; c2: number } | undefined;
  recalcAll?(type?: number): void;
  calculate?(type?: number, address?: string): void;
}
