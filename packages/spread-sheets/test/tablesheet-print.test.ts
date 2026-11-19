/**
 * TASK 49 item 3 — TableSheet print pagination through the shared print pipeline.
 * All expected rectangles are trial outputs recorded in .probe/api-sweep-item3a.json
 * and .probe/api-sweep-item3b.json (trial TableSheet print pipeline with the print
 * add-on loaded in apps/compare/data-manager-comparison.html, port 5189).
 */
import { describe, expect, it } from 'vitest';
import GC from '../src/index.js';

type TableSheetInstance = InstanceType<typeof GC.Spread.Sheets.TableSheet.TableSheet>;

async function fixture(rows: number, widths: number[]) {
  const workbook = new GC.Spread.Sheets.Workbook(undefined, { sheetCount: 0 });
  const table = workbook.dataManager().addTable('t', { data: Array.from({ length: rows }, (_, i) => ({
    id: i + 1, name: `Name ${i + 1}`, city: i % 2 ? 'Paris' : 'Rome', score: (i + 1) * 7,
    active: i % 3 === 0, note: 'x'.repeat(30),
  })).map(row => {
    // Keep only as many fields as widths (mirrors the probe fixtures).
    const keys = ['id', 'name', 'city', 'score', 'active', 'note'];
    const out: Record<string, unknown> = {};
    keys.slice(0, widths.length).forEach(key => { out[key] = (row as Record<string, unknown>)[key]; });
    return out;
  }) });
  const keys = ['id', 'name', 'city', 'score', 'active', 'note'].slice(0, widths.length);
  const captions = ['ID', 'Name', 'City', 'Score', 'Active', 'Note'];
  const view = table.addView('v', keys.map((key, index) => ({ value: key, caption: captions[index], width: widths[index] })));
  await view.fetch();
  const sheet = workbook.addSheetTab(0, 'Data', GC.Spread.Sheets.SheetType.tableSheet) as TableSheetInstance;
  sheet.setDataView(view);
  await new Promise(resolve => setTimeout(resolve, 50));
  return { workbook, sheet, view };
}

const pages = (workbook: import('../src/workbook.js').Workbook) =>
  JSON.parse(JSON.stringify(workbook.pageInfo() as object)) as { pages: Record<string, number>[] }[];

describe('TableSheet print pagination', () => {
  it('splits bound rows and columns into the trial page rectangles', async () => {
    const { workbook, sheet } = await fixture(30, [80, 160, 120, 100, 90, 300]);
    expect(sheet.getRowCount()).toBe(31); // 30 data rows + the trailing add-new row
    expect(pages(workbook)[0].pages).toEqual([
      { row: 0, column: 0, rowCount: 29, columnCount: 5 },
      { row: 29, column: 0, rowCount: 1, columnCount: 5 },
      { row: 0, column: 5, rowCount: 29, columnCount: 1 },
      { row: 29, column: 5, rowCount: 1, columnCount: 1 },
    ]);
    workbook.destroy();
  });
  it('does not print the trailing add-new row (fit-wide single page covers 30 rows)', async () => {
    const { workbook, sheet } = await fixture(30, [80, 160, 120, 100, 90, 300]);
    sheet.printInfo().fitPagesWide(1);
    expect(pages(workbook)[0].pages).toEqual([{ row: 0, column: 0, rowCount: 30, columnCount: 6 }]);
    workbook.destroy();
  });
  it('paginates grouped sheets with the group column and 30 printed rows', async () => {
    const { workbook, sheet } = await fixture(30, [80, 160, 120, 100, 90, 300]);
    sheet.printInfo().fitPagesWide(1);
    sheet.groupBy([{ field: 'city' }]);
    expect(sheet.getRowCount()).toBe(31);
    expect(pages(workbook)[0].pages).toEqual([{ row: 0, column: 0, rowCount: 30, columnCount: 7 }]);
    workbook.destroy();
  });
  it('paginates filtered sheets over the remaining rows', async () => {
    const { workbook, sheet } = await fixture(30, [80, 160, 120, 400]);
    sheet.filter([{ field: 'city', values: [{ value: 'Rome' }] }]);
    expect(sheet.getRowCount()).toBe(16);
    expect(pages(workbook)[0].pages).toEqual([
      { row: 0, column: 0, rowCount: 15, columnCount: 3 },
      { row: 0, column: 3, rowCount: 15, columnCount: 1 },
    ]);
    workbook.destroy();
  });
  it('paginates 60 data rows as 29/29/2 vertical bands', async () => {
    const { workbook, sheet } = await fixture(60, [80, 160, 120, 400]);
    expect(sheet.getRowCount()).toBe(61);
    expect(pages(workbook)[0].pages).toEqual([
      { row: 0, column: 0, rowCount: 29, columnCount: 3 },
      { row: 29, column: 0, rowCount: 29, columnCount: 3 },
      { row: 58, column: 0, rowCount: 2, columnCount: 3 },
      { row: 0, column: 3, rowCount: 29, columnCount: 1 },
      { row: 29, column: 3, rowCount: 29, columnCount: 1 },
      { row: 58, column: 3, rowCount: 2, columnCount: 1 },
    ]);
    workbook.destroy();
  });
  it('reports no pages for an empty table sheet', async () => {
    const { workbook, sheet } = await fixture(0, [80, 160, 120, 400]);
    expect(sheet.getRowCount()).toBe(1);
    expect(pages(workbook)[0].pages).toEqual([]);
    workbook.destroy();
  });
  it('ignores print-area assignment like the trial TableSheet (echo -1, full-range pages)', async () => {
    const { workbook, sheet } = await fixture(30, [80, 160, 120, 400]);
    const info = sheet.printInfo();
    info.rowStart(3); info.rowEnd(12); info.columnStart(1); info.columnEnd(2);
    expect([info.rowStart(), info.rowEnd(), info.columnStart(), info.columnEnd()]).toEqual([-1, -1, -1, -1]);
    // Pagination keeps the full bound range (trial item3b printArea rectangles).
    expect(pages(workbook)[0].pages).toEqual([
      { row: 0, column: 0, rowCount: 29, columnCount: 3 },
      { row: 29, column: 0, rowCount: 1, columnCount: 3 },
      { row: 0, column: 3, rowCount: 29, columnCount: 1 },
      { row: 29, column: 3, rowCount: 1, columnCount: 1 },
    ]);
    workbook.destroy();
  });
  it('serializes no printInfo section for an untouched table sheet (trial omission)', async () => {
    const { workbook } = await fixture(2, [80]);
    const json = JSON.parse(JSON.stringify(workbook.toJSON())) as Record<string, Record<string, unknown>>;
    const dataTab = json.sheetTabs.Data as Record<string, unknown>;
    // The trial JSON of an unprinted table sheet carries no printInfo key
    // (.probe/api-sweep-item2.json trial sheet keys / flatten comparison).
    expect(dataTab.printInfo).toBeUndefined();
    workbook.destroy();
  });
});
