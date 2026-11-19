import type { Worksheet } from './worksheet.js';
import type { CellsInfo, FormulaInfo } from './calc/engine-introspect.js';

/** Calculation service attached to worksheets by the workbook. */
export interface ICalcEngine {
  /** Parses and validates a formula, returning its canonical text. */
  parseFormula?(sheet: Worksheet, row: number, col: number, formula: string): string;
  /** The formula compiled by the newest `parseFormula`/`compile` call. */
  lastParsed?: { text: string; r1c1: boolean; ast: import('./calc/parser.js').AstNode } | undefined;
  formulaChanged(
    sheet: Worksheet,
    row: number,
    col: number,
    formula: string | null,
    /** AST already parsed for this exact text by the write-side validation. */
    parsedAst?: import('./calc/parser.js').AstNode,
    parsedR1c1?: boolean,
    /** The caller knows the cell has no engine registration to remove. */
    knownUnregistered?: boolean,
  ): void;
  valueChanged?(sheet: Worksheet, row: number, col: number, value: unknown): void;
  cellWriting?(sheet: Worksheet, row: number, col: number): void;
  recalculate(sheet: Worksheet, all: boolean): void;
  /** `true` when the engine still has queued work from a suspended period. */
  hasPendingWork?(): boolean;
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
    crossStart?: number,
    crossEnd?: number,
  ): void;
  sheetRenamed?(sheet: Worksheet, oldName: string, newName: string): void;
  sheetRemoved?(sheet: Worksheet): void;
  namesChanged?(): void;
  /** `true` when the workbook uses R1C1 reference style. */
  isR1C1?(): boolean;
  /** Registers a user-defined formula function, optionally scoped to one sheet. */
  addFunction?(fn: import('./calc/functions-api.js').CalcFunction, sheet?: Worksheet): void;
  /** Looks up a registered user-defined formula function for a sheet. */
  getCustomFunction?(name: string, sheet: Worksheet): unknown;
  /** Public `Workbook.getCustomFunction`: workbook scope only. */
  getWorkbookFunction?(name: string): unknown;
  /** Public `Worksheet.getCustomFunction`: this sheet's scope only. */
  getSheetFunction?(sheet: Worksheet, name: string): unknown;
  /** Drops a workbook-scope or sheet-scope custom function. */
  removeCustomFunction?(name: string, sheet?: Worksheet): void;
  /** Drops the custom functions of one scope (`clearCustomFunctions`). */
  clearFunctions?(sheet?: Worksheet): void;
  /** Ranges the formula at a cell reads (`Worksheet.getPrecedents`). */
  precedentsOf?(sheet: Worksheet, row: number, col: number): CellsInfo[];
  /** Formula cells reading a cell (`Worksheet.getDependents`). */
  dependentsOfCell?(sheet: Worksheet, row: number, col: number): CellsInfo[];
  /** Stored formula details of a cell (`Worksheet.getFormulaInformation`). */
  formulaInformationOf?(sheet: Worksheet, row: number, col: number, storedFormula?: string | null): FormulaInfo;
  /** Cells currently in a calculation cycle (`Workbook.getCircularReference`). */
  circularReferences?(): CellsInfo[];
  /** Re-creates a cell's custom-function bindings after a same-text `setFormula`. */
  rebindFormula?(sheet: Worksheet, row: number, col: number): void;
  /** Rebuilds the formula graph from stored cell formulas. */
  rebuildFormulas?(): void;
  /** Loads formulas with cached values after a JSON import. */
  loadFormulas?(): void;
  getSpillRange?(sheet: Worksheet, row: number, col: number): { r1: number; c1: number; r2: number; c2: number } | undefined;
  recalcAll?(type?: number): void;
  calculate?(type?: number, address?: string): void;
}
