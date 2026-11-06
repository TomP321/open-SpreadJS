import { expect, it } from 'vitest';
import GC from '@opensheets/spread-sheets';
import { scenarios, selectScenario } from './index.js';
it('selects registered scenarios and rejects unknown ones', () => {
  expect(selectScenario(null).name).toBe('values');
  expect(() => selectScenario('unknown')).toThrow('Unknown scenario');
  expect(new Set(scenarios.map(s => s.name)).size).toBe(scenarios.length);
  for (const scenario of scenarios) {
    const workbook = new GC.Spread.Sheets.Workbook(undefined, { sheetCount: scenario.sheetCount });
    scenario.run(workbook);
    expect(workbook.sheets).toHaveLength(scenario.sheetCount);
    workbook.destroy();
  }
});
