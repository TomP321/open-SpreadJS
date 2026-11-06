import { renderingScenarios } from './m2.js';
import { empty } from './empty.js';
import { values } from './values.js';
import { multipleSheets } from './multiple-sheets.js';
import { dataFeatureScenarios } from './m4.js';

export interface Sheet {
  name(value?: string): unknown;
  setValue(row: number, col: number, value: unknown): void;
  getValue(row: number, col: number): unknown;
}
export interface Workbook {
  getActiveSheet(): Sheet;
  getSheet(index: number): Sheet;
  sheets: Sheet[];
  destroy(): void;
}
export interface Scenario {
  name: string;
  title: string;
  sheetCount: number;
  /** Cells whose visible content is a vector glyph drawn by our renderer. */
  glyphCells?: [row: number, col: number, rowCount: number, colCount: number][];
  run(workbook: Workbook): void;
}
export const scenarios: readonly Scenario[] = [empty, values, multipleSheets, ...renderingScenarios, ...dataFeatureScenarios];
export function selectScenario(name: string | null): Scenario {
  const scenario = scenarios.find(item => item.name === (name ?? 'values'));
  if (!scenario) throw new Error(`Unknown scenario: ${name}`);
  return scenario;
}
