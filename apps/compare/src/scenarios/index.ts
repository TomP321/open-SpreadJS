import { empty } from './empty.js';
import { values } from './values.js';
import { multipleSheets } from './multiple-sheets.js';

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
  run(workbook: Workbook): void;
}
export const scenarios: readonly Scenario[] = [empty, values, multipleSheets];
export function selectScenario(name: string | null): Scenario {
  const scenario = scenarios.find(item => item.name === (name ?? 'values'));
  if (!scenario) throw new Error(`Unknown scenario: ${name}`);
  return scenario;
}
