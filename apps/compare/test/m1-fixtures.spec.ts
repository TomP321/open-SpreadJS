import fs from 'node:fs/promises';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import { configureM1 } from '../src/scenarios/m1.js';

const fixtures = path.resolve('../../packages/spread-sheets/test/fixtures');
test('M1 public model reference and ssjson', async ({ page }) => {
  await page.goto('/?scenario=empty');
  await page.waitForFunction(() => window.__compare?.ready);
  // Pass the function's source, which is our scenario, never vendor code.
  const result = await page.evaluate(async (source) => {
    const run = (0, eval)(`(${source})`) as typeof configureM1;
    const state = window.__compare!,
      ref = window.__referenceGC;
    const blank = JSON.parse(JSON.stringify(state.official.toJSON()));
    run(ref, state.official);
    const model = JSON.parse(JSON.stringify(state.official.toJSON()));
    await state.ours.fromJSON(blank);
    run(window.__implementationGC as unknown as typeof ref, state.ours);
    const independent = JSON.parse(JSON.stringify(state.ours.toJSON()));
    const formulaSheet = state.official.getSheet(0);
    formulaSheet.setFormula(12, 0, '=SUM(B2,2)');
    formulaSheet.comments.add(13, 0, 'Stored note');
    return { blank, model, independent, formulas: JSON.parse(JSON.stringify(state.official.toJSON())) };
  }, configureM1.toString());
  if (process.env.UPDATE_REFERENCE === '1') {
    await fs.mkdir(fixtures, { recursive: true });
    for (const name of ['blank', 'model', 'formulas'] as const)
      await fs.writeFile(
        path.join(fixtures, `official-${name}.json`),
        JSON.stringify(result[name], null, 2) + '\n',
      );
  }
  expect(result.model.sheetCount).toBe(2);
  expect(result.independent).toEqual(result.model);
});

test('Excel format table matches both engines', async ({ page }) => {
  const cases = JSON.parse(
    await fs.readFile(path.resolve('../../packages/spread-sheets/test/format-cases.json'), 'utf8'),
  ) as [string, unknown, string][];
  await page.goto('/?scenario=empty');
  await page.waitForFunction(() => window.__compare?.ready);
  const outputs = await page.evaluate((cases) => {
    const ours = window.__implementationGC;
    return cases.map(([format, value, expected]) => ({
      format,
      value,
      expected,
      official: new window.__referenceGC.Spread.Formatter.GeneralFormatter(format).format(value as object),
      ours: new ours.Spread.Formatter.GeneralFormatter(format).format(value as object),
    }));
  }, cases);
  for (const result of outputs) {
    expect(result.official, JSON.stringify(result)).toBe(result.expected);
    expect(result.ours, JSON.stringify(result)).toBe(result.expected);
  }
});

test('all public option defaults and event constants match the trial', async ({ page }) => {
  const workbook = JSON.parse(
    await fs.readFile(path.resolve('../../packages/spread-sheets/src/workbook-defaults.json'), 'utf8'),
  );
  const worksheet = JSON.parse(
    await fs.readFile(path.resolve('../../packages/spread-sheets/src/worksheet-defaults.json'), 'utf8'),
  );
  await page.goto('/?scenario=empty');
  await page.waitForFunction(() => window.__compare?.ready);
  const result = await page.evaluate(
    ({ workbook, worksheet }) => {
      const state = window.__compare!;
      const project = (value: object, schema: Record<string, unknown>): Record<string, unknown> =>
        Object.fromEntries(
          Object.entries(schema).map(([key, expected]) => {
            const item = (value as Record<string, unknown>)[key];
            return [
              key,
              expected && typeof expected === 'object' && !Array.isArray(expected)
                ? project(item as object, expected as Record<string, unknown>)
                : item,
            ];
          }),
        );
      const reference = window.__referenceGC.Spread.Sheets.Events as unknown as Record<string, string>,
        ours = window.__implementationGC.Spread.Sheets.Events as unknown as Record<string, string>;
      const names = Object.keys(ours).filter((name) => typeof ours[name] === 'string');
      const sheet = state.official.getSheet(0);
      const available = names.filter((name) => reference[name] !== undefined);
      return {
        workbook: project(state.official.options, workbook),
        worksheet: project(sheet.options, worksheet),
        dimensions: {
          rowHeight: sheet.defaults.rowHeight,
          colWidth: sheet.defaults.colWidth,
          colHeaderRowHeight: sheet.defaults.colHeaderRowHeight,
          rowHeaderColWidth: sheet.defaults.rowHeaderColWidth,
        },
        events: Object.fromEntries(available.map((name) => [name, reference[name]])),
        oursEvents: Object.fromEntries(available.map((name) => [name, ours[name]])),
        addonEvents: names.filter((name) => reference[name] === undefined).sort(),
      };
    },
    { workbook, worksheet },
  );
  expect(result.workbook).toEqual(workbook);
  expect(result.worksheet).toEqual(worksheet);
  expect(result.dimensions).toEqual({
    rowHeight: 20,
    colWidth: 62,
    colHeaderRowHeight: 20,
    rowHeaderColWidth: 40,
  });
  expect(result.events).toEqual(result.oursEvents);
  expect(Object.keys(result.events).length).toBeGreaterThan(100);
  expect(result.addonEvents).toEqual([
    'RowOperation',
    'TableSheetFilterCleared',
    'TableSheetFilterClearing',
    'TableSheetFiltered',
    'TableSheetFiltering',
    'TableSheetSortCleared',
    'TableSheetSortClearing',
    'TableSheetSorted',
    'TableSheetSorting',
  ]);
});
