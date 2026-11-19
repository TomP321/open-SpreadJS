import { coreModuleScenarios } from './m5.js';
import { renderingScenarios } from './m2.js';
import { empty } from './empty.js';
import { values } from './values.js';
import { multipleSheets } from './multiple-sheets.js';
import { dataFeatureScenarios } from './m4.js';
import { coreRenderScenarios } from './m6.js';

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
  /** Only the pictogram box, in CSS pixels relative to its cell. Negative x/y
   * anchor the box to the cell's right/bottom edge. Text stays in content. */
  glyphCells?: { row: number; col: number; x: number; y: number; width: number; height: number }[];
  run(workbook: Workbook): void;
}
export const scenarios: readonly Scenario[] = [empty, values, multipleSheets, ...renderingScenarios, ...dataFeatureScenarios, ...coreModuleScenarios, ...coreRenderScenarios];
export function selectScenario(name: string | null): Scenario {
  const scenario = scenarios.find(item => item.name === (name ?? 'values'));
  if (!scenario) throw new Error(`Unknown scenario: ${name}`);
  return scenario;
}
