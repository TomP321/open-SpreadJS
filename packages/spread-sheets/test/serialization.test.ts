import { describe, expect, it } from 'vitest';
import GC from '../src/index.js';
import { differences } from '../src/serialization.js';
import blank from './fixtures/official-blank.json';
import model from './fixtures/official-model.json';
import formulas from './fixtures/official-formulas.json';
import { configureM1 } from '../../../apps/compare/src/scenarios/m1.js';

const { Workbook, SheetArea } = GC.Spread.Sheets;
describe('official 19.2.5 ssjson black-box fixtures', () => {
  for (const [name, fixture] of Object.entries({ blank, model, formulas }))
    it(`loads and round-trips ${name} without differences`, async () => {
      const wb = new Workbook();
      await wb.fromJSON(fixture);
      const diff = differences(wb.toJSON(), fixture);
      expect(diff, diff.join('\n')).toEqual([]);
      if (name !== 'blank') {
        const s = wb.getSheet(0);
        expect(s.getRowCount()).toBe(42);
        expect(s.getColumnCount()).toBe(17);
        expect(s.getValue(1, 2)).toBe(4.5);
        expect(s.getStyle(3, 3)?.backColor).toBe('#fedcba');
        expect(s.getActualStyle(1, 2)).toMatchObject({
          foreColor: '#123456',
          formatter: '#,##0.00',
          wordWrap: true,
          backColor: '#eeeeee',
        });
        expect(s.getValue(1, 1, SheetArea.rowHeader)).toBe('Row label');
        expect(s.getValue(1, 1, SheetArea.colHeader)).toBe('Header');
        expect(s.getValue(5, 3)).toEqual(new Date(2024, 1, 29, 12, 30));
        expect(s.getTag(1, 0)).toEqual({ id: 9 });
        expect(s.tag()).toBe('model-tag');
        expect(s.getRowHeight(1)).toBe(28);
        expect(s.getColumnWidth(2)).toBe(94);
        expect(s.getRowVisible(4)).toBe(false);
        expect(s.getColumnVisible(5)).toBe(false);
        expect(s.getSpan(11, 2)).toMatchObject({ row: 10, col: 1, rowCount: 2, colCount: 3 });
        expect(s.frozenRowCount()).toBe(1);
        expect(s.frozenColumnCount()).toBe(2);
        expect(s.zoom()).toBe(1.25);
      }
      if (name === 'formulas') {
        expect(wb.getSheet(0).getFormula(12, 0)).toBe('SUM(B2,2)');
        expect(wb.getSheet(0).getValue(12, 0)).toBe(14);
        expect(wb.getSheet(0).comments.get(13, 0)?.text()).toBe('Stored note');
      }
    });
  it('independent public operations produce identical official JSON', async () => {
    const wb = new Workbook();
    await wb.fromJSON(blank);
    configureM1(
      GC as unknown as Parameters<typeof configureM1>[0],
      wb as unknown as Parameters<typeof configureM1>[1],
    );
    const diff = differences(wb.toJSON(), model);
    expect(diff, diff.join('\n')).toEqual([]);
  });
  it('replaces prior data, supports serialization flags, and preserves live option references', async () => {
    const wb = new Workbook();
    const options = wb.options;
    await wb.fromJSON(model);
    expect(wb.options).toBe(options);
    await wb.fromJSON(blank);
    expect(wb.getSheetCount()).toBe(1);
    expect(wb.getSheet(0).getValue(1, 2)).toBeNull();
    await wb.fromJSON(formulas);
    const stripped = wb.toJSON({ ignoreStyle: true, ignoreFormula: true });
    const sheets = stripped.sheets as Record<string, { data: unknown }>;
    expect(JSON.stringify(sheets.Model.data)).not.toContain('"formula":');
    expect(JSON.stringify(stripped)).not.toContain('"style":');
    expect(stripped.namedStyles).toBeUndefined();
  });
});
it('honors deserialization flags and rejects unsupported transformations explicitly', async () => {
  const wb = new Workbook();
  await wb.fromJSON(formulas, { ignoreStyle: true, ignoreFormula: true });
  const s = wb.getSheet(0);
  expect(s.getStyle(3, 3)).toBeNull();
  expect(s.getNamedStyles()).toEqual([]);
  expect(wb.getNamedStyles()).toEqual([]);
  expect(s.getFormula(12, 0)).toBeNull();
  expect(s.getValue(12, 0)).toBe(14);
  expect(() => wb.toJSON({ rowHeadersAsFrozenColumns: true })).toThrow('NotImplemented');
  await expect(wb.fromJSON(formulas, { incrementalLoading: true })).rejects.toThrow('NotImplemented');
});
