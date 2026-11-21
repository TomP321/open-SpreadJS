/* TASK 75 r3: core serialisation parity findings from the Designer command sweep
 * (apps/designer-compare, both sides). */
import { describe, expect, it } from 'vitest';
import type { JsonRecord } from '../src/serialization.js';
import { Worksheet } from '../src/worksheet.js';
import { Workbook } from '../src/workbook.js';

describe('TASK 75 outline + autofit serialisation', () => {
  it('does not serialise `visible:false` for rows hidden only by an outline collapse', () => {
    // Trial (Hide Detail probe): the group's rows carry viewCollapsed; the trial does NOT
    // write rows[].visible for them — loading restores visibility from the outline.
    const sheet = new Worksheet('Data');
    sheet.rowOutlines.group(1, 2);
    const info = sheet.rowOutlines.find(2, 0);
    expect(info).not.toBeNull();
    sheet.rowOutlines.expandGroup(info!, false); // the Hide Detail mechanics
    const node = sheet.toJSON();
    expect((node.rowOutlines as { items: unknown[] }).items.length).toBe(4);
    expect(node.rows).toBeUndefined();
    expect(sheet.getRowVisible(1)).toBe(false);
    // A row the USER hid keeps its explicit record even inside a collapsed group.
    sheet.setRowVisible(3, false);
    const node2 = sheet.toJSON();
    expect((node2.rows as unknown[])[3]).toMatchObject({ visible: false });
  });

  it('loads a collapsed outline and restores the hidden rows', () => {
    const sheet = new Worksheet('Data');
    sheet.rowOutlines.group(1, 2);
    sheet.rowOutlines.expandGroup(sheet.rowOutlines.find(2, 0)!, false);
    const json = JSON.parse(JSON.stringify(sheet.toJSON()));
    const copy = new Worksheet('Data');
    copy.fromJSON(json);
    expect(copy.getRowVisible(1)).toBe(false);
    expect(copy.getRowVisible(2)).toBe(false);
    expect(copy.getRowVisible(0)).toBe(true);
  });

  it('_touchSummaryMarker materialises the Show-Detail marker like the trial', () => {
    // Trial (Show Detail probe on a fresh group): items gains {level:-1, collapsed:false}
    // on the summary side; the public expand APIs must keep not creating it.
    const sheet = new Worksheet('Data');
    sheet.rowOutlines.group(1, 2);
    const before = sheet.toJSON().rowOutlines as { items: unknown[] };
    expect(before.items.length).toBe(3);
    (sheet.rowOutlines as unknown as { _touchSummaryMarker(i: number): void })._touchSummaryMarker(1);
    const after = sheet.toJSON().rowOutlines as { items: ({ level: number; collapsed: boolean } | null)[]; itemsData?: { index: number; count: number; info: { level: number } }[] };
    expect(after.items.length).toBe(4);
    expect(after.items[3]).toMatchObject({ level: -1, collapsed: false });
    expect(after.itemsData).toEqual([
      { index: 1, count: 2, info: { level: 0, collapsed: false } },
      { index: 3, count: 1, info: { level: -1, collapsed: false } },
    ]);
  });

  it('AutoFit Row Height leaves rows at the default height unrecorded', () => {
    // Trial (AutoFit Row Height probe): fitting default-height text rows writes no rows[].
    const sheet = new Worksheet('Data');
    // jsdom has no canvas 2D; supply the text-measuring context autoFit needs.
    (sheet as unknown as { measureContext: () => CanvasRenderingContext2D }).measureContext = () =>
      ({ font: '', measureText: (text: string) => ({ width: String(text).length * 6 }) }) as unknown as CanvasRenderingContext2D;
    sheet.setValue(1, 1, 'plain');
    sheet.autoFitRow(1);
    expect(sheet.toJSON().rows).toBeUndefined();
    // A tall content still records its grown height.
    sheet.setValue(1, 1, 'a\nb\nc\nd\ne\nf\ng\nh');
    sheet.autoFitRow(1);
    const rows = sheet.toJSON().rows as ({ size?: number } | null)[];
    expect(Number(rows[1]?.size)).toBeGreaterThan(20);
  });

  it('serialises a cached calculation error with the trial error identity', () => {
    // Trial (Average probe): the stored value of an error cell is
    // `{_calcError: '#!DIV/0!', _code: 7}`, not our internal `{error}` shape.
    const sheet = new Workbook().getActiveSheet();
    sheet.setFormula(0, 0, '=1/0');
    const node = sheet.toJSON();
    const table = (node.data as { dataTable: Record<string, Record<string, JsonRecord>> }).dataTable;
    const value = table['0']['0'].value as JsonRecord;
    expect(table['0']['0'].formula).toBe('1/0');
    expect(Object.keys(value).sort()).toEqual(['_calcError', '_code']);
    expect(String(value._calcError)).toMatch(/DIV\/0!/);
    expect(value._code).toBe(7);
    // Round-trip: loading the trial's shape gives an error cell back.
    const copy = new Worksheet('Data');
    copy.fromJSON(JSON.parse(JSON.stringify(node)));
    expect(String(copy.getValue(0, 0))).toMatch(/DIV\/0!/);
  });
});
