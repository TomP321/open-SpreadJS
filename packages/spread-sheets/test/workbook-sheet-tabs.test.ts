import { describe, expect, it } from 'vitest';
import GC from '../src/index.js';
import { Workbook } from '../src/workbook.js';
import { Worksheet } from '../src/worksheet.js';

const { SheetType } = GC.Spread.Sheets;

/**
 * Every expectation here is the value the official 19.2.5 trial answers for the
 * same public call (see .probe/report-tabs*.json). Two trial details cannot be
 * reproduced with our model and are recorded in docs/STATUS.md: the trial keeps
 * sheet tabs out of `Workbook.sheets` (ours stores them in the sheet strip
 * because they are `Worksheet` subclasses) and answers `undefined` from
 * `getActiveSheet` while a sheet tab is active.
 */
describe('Workbook sheet tabs', () => {
  const stripPositions = (workbook: Workbook, names: string[]): Record<string, number> =>
    Object.fromEntries(names.map((name) => [name, workbook.getSheetPosition(name)]));
  const stripNames = (workbook: Workbook): string[] =>
    workbook.sheets.filter((sheet) => !isTab(sheet)).map((sheet) => sheet.name());
  const isTab = (sheet: Worksheet): boolean =>
    sheet instanceof GC.Spread.Sheets.TableSheet.TableSheet ||
    sheet instanceof GC.Spread.Report.ReportSheet;

  it('getSheetTab, getSheetTabCount and getSheetTabIndex ignore worksheets', () => {
    const workbook = new Workbook();
    expect(workbook.getSheetTab(0)).toBeNull();
    expect(workbook.getSheetTab('Sheet1')).toBeNull();
    expect(workbook.getSheetTab('Nope')).toBeNull();
    expect(workbook.getSheetTabCount()).toBe(0);
    expect(workbook.getSheetTabIndex('Sheet1')).toBeNull();
    expect(workbook.getSheetTabIndex('Nope')).toBeNull();
    const tab = workbook.addSheetTab(0, 'Tbl', SheetType.tableSheet);
    expect(workbook.getSheetTabCount()).toBe(1);
    expect(workbook.getSheetTab(0)).toBe(tab);
    expect(workbook.getSheetTab(1)).toBeNull();
    expect(workbook.getSheetTab('Tbl')).toBe(tab);
    expect(workbook.getSheetTabIndex('Tbl')).toBe(0);
    expect(workbook.getSheetTabIndex('Sheet1')).toBeNull();
  });

  it('getActiveSheetTab and getActiveSheetTabIndex follow the active strip entry', () => {
    const workbook = new Workbook(undefined, { sheetCount: 2 });
    // No sheet tabs at all: null and -1.
    expect(workbook.getActiveSheetTab()).toBeNull();
    expect(workbook.getActiveSheetTabIndex()).toBe(-1);
    const tab = workbook.addSheetTab(0, 'Tbl', SheetType.tableSheet);
    // The trial makes the new tab the active entry: getActiveSheetIndex -1 for it.
    expect(workbook.getActiveSheetTab()).toBe(tab);
    expect(workbook.getActiveSheetTabIndex()).toBe(0);
    workbook.setActiveSheetIndex(0);
    // A worksheet is active and the workbook has sheet tabs: undefined, -1.
    expect(workbook.getActiveSheetTab()).toBeUndefined();
    expect(workbook.getActiveSheetTabIndex()).toBe(-1);
    workbook.setActiveSheet('Sheet2');
    expect(workbook.getActiveSheetTab()).toBeUndefined();
    expect(workbook.getActiveSheetTabIndex()).toBe(-1);
    workbook.setActiveSheetIndex(1);
    expect(workbook.getActiveSheetTab()).toBeUndefined();
    workbook.setActiveSheetTab(0);
    expect(workbook.getActiveSheetTab()).toBe(tab);
    expect(workbook.getActiveSheetTabIndex()).toBe(0);
  });

  it('setActiveSheetTab accepts an index or a name and does nothing for invalid ones', () => {
    const workbook = new Workbook(undefined, { sheetCount: 2 });
    const tab = workbook.addSheetTab(0, 'Tbl', SheetType.tableSheet);
    workbook.setActiveSheetIndex(0);
    for (const invalid of [-1, 1, 50, 'Nope', '1', undefined as unknown as string]) {
      expect(workbook.setActiveSheetTab(invalid)).toBeUndefined();
      expect(workbook.getActiveSheetTabIndex()).toBe(-1);
      expect(workbook.getActiveSheet()).toBe(workbook.sheets[0]);
    }
    expect(workbook.setActiveSheetTab(0)).toBeUndefined();
    expect(workbook.getActiveSheet()).toBe(tab);
    expect(workbook.getActiveSheetTabIndex()).toBe(0);
    expect(workbook.setActiveSheetTab('Tbl')).toBeUndefined();
    expect(workbook.getActiveSheet()).toBe(tab);
    workbook.clearSheetTabs();
    // Without sheet tabs an index is still not an error.
    expect(workbook.setActiveSheetTab(0)).toBeUndefined();
    expect(workbook.getActiveSheetTabIndex()).toBe(-1);
  });

  it('getSheetPosition numbers the whole sheet strip, sheets first then sheet tabs', () => {
    const workbook = new Workbook(undefined, { sheetCount: 3 });
    expect(stripPositions(workbook, ['Sheet1', 'Sheet2', 'Sheet3', 'Nope'])).toEqual({
      Sheet1: 0, Sheet2: 1, Sheet3: 2, Nope: -1,
    });
    workbook.addSheetTab(1, 'Tbl', SheetType.tableSheet);
    expect(stripPositions(workbook, ['Sheet1', 'Sheet2', 'Sheet3', 'Tbl', 'Nope'])).toEqual({
      Sheet1: 0, Sheet2: 1, Sheet3: 2, Tbl: 3, Nope: -1,
    });
    expect(workbook.addSheetTab(1, 'Gnt', SheetType.ganttSheet)).toBeTruthy();
    expect(stripPositions(workbook, ['Sheet1', 'Sheet2', 'Sheet3', 'Tbl', 'Gnt'])).toEqual({
      Sheet1: 0, Sheet2: 1, Sheet3: 2, Tbl: 3, Gnt: 4,
    });
    expect(workbook.getSheetTabCount()).toBe(2);
  });

  it('changeSheetPosition moves worksheets and sheet tabs through the strip like the trial', () => {
    const workbook = new Workbook(undefined, { sheetCount: 3 });
    const tab = workbook.addSheetTab(1, 'Tbl', SheetType.tableSheet);
    const pos = () => stripPositions(workbook, ['Sheet1', 'Sheet2', 'Sheet3', 'Tbl']);
    expect(pos()).toEqual({ Sheet1: 0, Sheet2: 1, Sheet3: 2, Tbl: 3 });
    expect(workbook.changeSheetPosition('Sheet3', 0)).toBe(true);
    expect(pos()).toEqual({ Sheet3: 0, Sheet1: 1, Sheet2: 2, Tbl: 3 });
    expect(stripNames(workbook)).toEqual(['Sheet3', 'Sheet1', 'Sheet2']);
    expect(workbook.changeSheetPosition('Tbl', 2)).toBe(true);
    expect(pos()).toEqual({ Sheet3: 0, Sheet1: 1, Tbl: 2, Sheet2: 3 });
    expect(workbook.changeSheetPosition('Tbl', 0)).toBe(true);
    expect(pos()).toEqual({ Tbl: 0, Sheet3: 1, Sheet1: 2, Sheet2: 3 });
    expect(workbook.changeSheetPosition('Sheet2', 2)).toBe(true);
    expect(pos()).toEqual({ Tbl: 0, Sheet3: 1, Sheet2: 2, Sheet1: 3 });
    expect(workbook.changeSheetPosition('Sheet1', 1)).toBe(true);
    expect(pos()).toEqual({ Tbl: 0, Sheet1: 1, Sheet3: 2, Sheet2: 3 });
    expect(workbook.changeSheetPosition('Tbl', 3)).toBe(true);
    expect(pos()).toEqual({ Sheet1: 0, Sheet3: 1, Sheet2: 2, Tbl: 3 });
    // The trial answers false for an unknown name, an index outside the strip,
    // a negative index and the position the entry already has.
    expect(workbook.changeSheetPosition('Nope', 0)).toBe(false);
    expect(workbook.changeSheetPosition('Tbl', 4)).toBe(false);
    expect(workbook.changeSheetPosition('Tbl', -1)).toBe(false);
    expect(workbook.changeSheetPosition('Tbl', 3)).toBe(false);
    expect(pos()).toEqual({ Sheet1: 0, Sheet3: 1, Sheet2: 2, Tbl: 3 });
    expect(workbook.getSheetTab(0)).toBe(tab);
  });

  it('clearSheetTabs removes every sheet tab and keeps the worksheets', () => {
    const workbook = new Workbook(undefined, { sheetCount: 3 });
    workbook.addSheetTab(0, 'Tbl', SheetType.tableSheet);
    workbook.addSheetTab(1, 'Gnt', SheetType.ganttSheet);
    expect(workbook.getSheetTabCount()).toBe(2);
    expect(workbook.clearSheetTabs()).toBeUndefined();
    expect(workbook.getSheetTabCount()).toBe(0);
    expect(workbook.getSheetTab(0)).toBeNull();
    expect(workbook.getSheetTabIndex('Tbl')).toBeNull();
    expect(workbook.getSheetPosition('Tbl')).toBe(-1);
    expect(workbook.getSheetPosition('Gnt')).toBe(-1);
    expect(stripNames(workbook)).toEqual(['Sheet1', 'Sheet2', 'Sheet3']);
    expect(stripPositions(workbook, ['Sheet1', 'Sheet2', 'Sheet3'])).toEqual({ Sheet1: 0, Sheet2: 1, Sheet3: 2 });
    expect(workbook.getActiveSheetTab()).toBeNull();
    expect(workbook.getActiveSheetTabIndex()).toBe(-1);
    // The trial serializes the remaining worksheets and no sheet tabs.
    expect(workbook.toJSON().sheetTabCount ?? 0).toBe(0);
    expect(Object.keys(workbook.toJSON().sheets as object)).toEqual(['Sheet1', 'Sheet2', 'Sheet3']);
    expect(workbook.toJSON().sheetTabs).toBeUndefined();
  });

  it('removeSheetTab drops one tab and rejects unknown indexes and names like the trial', () => {
    const workbook = new Workbook(undefined, { sheetCount: 1 });
    const table = workbook.addSheetTab(0, 'Tbl', SheetType.tableSheet);
    const gantt = workbook.addSheetTab(1, 'Gnt', SheetType.ganttSheet);
    expect(workbook.getSheetTabCount()).toBe(2);
    expect(workbook.removeSheetTab(1)).toBeUndefined();
    expect(workbook.getSheetTabCount()).toBe(1);
    expect(workbook.getSheetTab(0)).toBe(table);
    expect(workbook.removeSheetTab('Tbl')).toBeUndefined();
    expect(workbook.getSheetTabCount()).toBe(0);
    expect(workbook.getSheetTab(0)).toBeNull();
    expect(workbook.sheets.length).toBe(1);
    expect(() => workbook.removeSheetTab('Nope')).toThrow('Index is out of range!');
    expect(() => workbook.removeSheetTab(9)).toThrow('Index is out of range!');
    expect(gantt.getParent?.()).toBeUndefined();
  });

  it('addSheetTab inserts at a sheet-tab index and keeps the active tab when there is one', () => {
    const workbook = new Workbook(undefined, { sheetCount: 3 });
    const first = workbook.addSheetTab(0, 'Tbl', SheetType.tableSheet);
    expect(workbook.getActiveSheetTabIndex()).toBe(0);
    const second = workbook.addSheetTab(0, 'Gnt', SheetType.ganttSheet);
    // Index 0 is the position in the sheet-tab collection, not in the strip.
    expect(workbook.getSheetTab(0)).toBe(second);
    expect(workbook.getSheetTab(1)).toBe(first);
    expect(workbook.getSheetTabIndex('Gnt')).toBe(0);
    expect(workbook.getSheetTabIndex('Tbl')).toBe(1);
    expect(workbook.getSheetPosition('Gnt')).toBe(3);
    expect(workbook.getSheetPosition('Tbl')).toBe(4);
    // The already active tab stays active.
    expect(workbook.getActiveSheetTab()).toBe(first);
    expect(workbook.getActiveSheetTabIndex()).toBe(1);
    // Deviation, recorded in docs/STATUS.md: the trial counts worksheets only
    // (3 here) because its sheet tabs live in a separate collection; ours keeps
    // them in the sheet strip, where `getSheetCount`/`getSheet` index the strip.
    expect(workbook.getSheetCount()).toBe(5);
  });
});
