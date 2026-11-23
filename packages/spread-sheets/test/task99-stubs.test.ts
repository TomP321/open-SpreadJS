// @vitest-environment jsdom
/**
 * TASK 99: the former `NotImplemented` surfaces that users can reach.
 *  - Filter-menu value choices (Top 10, Above/Below Average, dynamic date filters,
 *    All Dates in Period) now filter exactly like the trial.
 *  - Context-menu paste options (pasteFormula, pasteFormatting,
 *    pasteValuesFormatting, pasteFormulaFormatting) apply the matching subset of
 *    the internal clipboard.
 *  - The report-sheet `GC.Spread.Sheets.Commands` constants run against a
 *    `ReportSheet` (and report `false` for every other sheet).
 */
import { describe, expect, it } from 'vitest';
import GC from '../src/index.js';
import { filterMenu } from '../src/features/filter-menu.js';
import type { HideRowFilter } from '../src/features/filters.js';
import type { ReportSheet } from '../src/report/index.js';

const { Workbook, Range } = GC.Spread.Sheets;
const SS = GC.Spread.Sheets;

// jsdom has no 2D backend; the filter checklist paints through getContext.
(globalThis as Record<string, unknown>).CanvasRenderingContext2D ??= class {};
Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
  value() {
    return new Proxy({}, {
      get: (t, k: string) => {
        if (k in t) return (t as Record<string, unknown>)[k];
        if (k === 'measureText') return (s: unknown) => ({ width: String(s).length * 6 });
        if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop: () => undefined });
        return (...a: unknown[]) => void a;
      },
      set: (t, k: string, v) => { (t as Record<string, unknown>)[k] = v; return true; },
    });
  },
  configurable: true,
});

type Sheet = ReturnType<InstanceType<typeof Workbook>['getActiveSheet']>;
function openMenu(sheet: Sheet, filter: HideRowFilter, column: number) {
  let closed = 0;
  const mounted: HTMLElement[] = [];
  const root = filterMenu(sheet, filter, column, 'Value', () => closed++, (el) => { mounted.push(el); document.body.append(el); });
  document.body.append(root);
  const command = (label: string) => [...root.querySelectorAll<HTMLButtonElement>('button.opensheets-filter-command')].find((b) => b.textContent === label);
  const sub = (label: string) => [...root.querySelectorAll<HTMLElement>('.opensheets-filter-submenu .opensheets-filter-command')].find((b) => b.textContent === label);
  return { root, mounted, closed: () => closed, command, sub };
}

function dataSheet(rows: unknown[]) {
  const wb = new Workbook();
  const sheet = wb.getActiveSheet();
  sheet.setArray(0, 0, [['Value'], ...rows.map((value) => [value])]);
  const filter = new SS.Filter.HideRowFilter(new Range(1, 0, rows.length, 1));
  sheet.rowFilter(filter);
  const visible = () => rows.map((_, index) => sheet.getRowVisible(index + 1));
  return { sheet, filter, visible };
}

describe('filter menu: average choices', () => {
  it('Above Average keeps the strictly-greater values', () => {
    const sheetState = dataSheet([1, 2, 3, 4]);
    const menu = openMenu(sheetState.sheet, sheetState.filter, 0);
    menu.command('Number Filters')!.dispatchEvent(new Event('pointerenter'));
    menu.sub('Above Average')!.click();
    expect(sheetState.visible()).toEqual([false, false, true, true]); // mean 2.5
    expect(menu.closed()).toBe(1);
  });
  it('Below Average keeps the strictly-smaller values', () => {
    const sheetState = dataSheet([1, 2, 3, 4]);
    const menu = openMenu(sheetState.sheet, sheetState.filter, 0);
    menu.command('Number Filters')!.dispatchEvent(new Event('pointerenter'));
    menu.sub('Below Average')!.click();
    expect(sheetState.visible()).toEqual([true, true, false, false]);
  });
  it('the stored condition re-evaluates against the current data on every filter run', () => {
    const sheetState = dataSheet([1, 2, 3, 4]);
    const menu = openMenu(sheetState.sheet, sheetState.filter, 0);
    menu.command('Number Filters')!.dispatchEvent(new Event('pointerenter'));
    menu.sub('Above Average')!.click();
    sheetState.sheet.setValue(4, 0, 0); // data changes; the condition stays dynamic
    sheetState.sheet.rowFilter()!.filter(0);
    expect(sheetState.visible()).toEqual([false, true, true, false]); // new mean 1.5
  });
});

describe('filter menu: trial condition shapes (TASK 99 black-box probes)', () => {
  it('Above Average stores {conType:10, type:0, ranges:[filter range]}', () => {
    const sheetState = dataSheet([1, 2, 3, 4]);
    const menu = openMenu(sheetState.sheet, sheetState.filter, 0);
    menu.command('Number Filters')!.dispatchEvent(new Event('pointerenter'));
    menu.sub('Above Average')!.click();
    const json = sheetState.filter.getFilterItems(0)[0].toJSON() as Record<string, unknown>;
    expect(json.conType).toBe(SS.ConditionalFormatting.ConditionType.averageCondition);
    expect(json.type).toBe(0);
    expect(json.ranges).toEqual([{ row: 1, col: 0, rowCount: 4, colCount: 1 }]);
  });
  it('dynamic date choices store {conType:6, expected:DateOccurringType}', () => {
    const now = new Date(); now.setHours(0, 0, 0, 0);
    const sheetState = dataSheet([now]);
    const menu = openMenu(sheetState.sheet, sheetState.filter, 0);
    menu.command('Date Filters')!.dispatchEvent(new Event('pointerenter'));
    menu.sub('This Week')!.click();
    expect(sheetState.filter.getFilterItems(0)[0].toJSON()).toMatchObject({ conType: 6, expected: 7 });
    menu.root.remove();
    const second = openMenu(sheetState.sheet, sheetState.filter, 0);
    second.command('Date Filters')!.dispatchEvent(new Event('pointerenter'));
    second.sub('Year To Date')!.click();
    expect(sheetState.sheet.rowFilter()!.getFilterItems(0)[0].toJSON()).toMatchObject({ conType: 6, expected: 0, expectTypeId: 6 });
  });
});

describe('filter menu: Top 10 dialog', () => {
  const openTop10 = (sheetState: ReturnType<typeof dataSheet>) => {
    const menu = openMenu(sheetState.sheet, sheetState.filter, 0);
    menu.command('Number Filters')!.dispatchEvent(new Event('pointerenter'));
    menu.sub('Top 10...')!.click();
    expect(menu.mounted.length).toBe(1);
    return { dialog: menu.mounted[0], closed: menu.closed };
  };
  it('Top 2 items keeps the two largest values and closes the menu', () => {
    const sheetState = dataSheet([1, 2, 3, 4]);
    const { dialog } = openTop10(sheetState);
    expect(dialog.textContent).toContain('Top 10 Auto Filter');
    (dialog.querySelector('.opensheets-top10-count') as HTMLInputElement).value = '2';
    (dialog.querySelector('.opensheets-custom-footer input') as HTMLInputElement).click();
    expect(sheetState.visible()).toEqual([false, false, true, true]);
  });
  it('Bottom 50 percent keeps the smaller half', () => {
    const sheetState = dataSheet([1, 2, 3, 4]);
    const { dialog } = openTop10(sheetState);
    const selects = [...dialog.querySelectorAll<HTMLSelectElement>('select')];
    selects[0].value = '1'; // bottom
    (dialog.querySelector('.opensheets-top10-count') as HTMLInputElement).value = '50';
    selects[1].value = '1'; // percent
    (dialog.querySelector('.opensheets-custom-footer input') as HTMLInputElement).click();
    expect(sheetState.visible()).toEqual([true, true, false, false]);
  });
  it('stores the trial condition shape {conType:8, expected, type, isPercent, ranges}', () => {
    const sheetState = dataSheet([1, 2, 3, 4]);
    const { dialog } = openTop10(sheetState);
    const selects = [...dialog.querySelectorAll<HTMLSelectElement>('select')];
    selects[1].value = '1';
    (dialog.querySelector('.opensheets-custom-footer input') as HTMLInputElement).click();
    const json = sheetState.filter.getFilterItems(0)[0].toJSON() as Record<string, unknown>;
    expect(json.conType).toBe(SS.ConditionalFormatting.ConditionType.top10Condition);
    expect(json.expected).toBe(10);
    expect(json.type).toBe(0);
    expect(json.isPercent).toBe(true);
    expect(json.ranges).toEqual([{ row: 1, col: 0, rowCount: 4, colCount: 1 }]);
  });
});

describe('filter menu: dynamic date choices', () => {
  const today = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
  const shifted = (days: number) => { const d = today(); d.setDate(d.getDate() + days); return d; };
  it('this/last/next Week split on the calendar week', () => {
    const sheetState = dataSheet([today(), shifted(-7), shifted(7 + (6 - today().getDay()) + 1)]);
    const menu = openMenu(sheetState.sheet, sheetState.filter, 0);
    menu.command('Date Filters')!.dispatchEvent(new Event('pointerenter'));
    menu.sub('This Week')!.click();
    expect(sheetState.visible()).toEqual([true, false, false]);
  });
  it('this Month keeps today and drops the previous month', () => {
    const previousMonth = new Date(today().getFullYear(), today().getMonth() - 1, Math.min(15, today().getDate()));
    const sheetState = dataSheet([today(), previousMonth]);
    const menu = openMenu(sheetState.sheet, sheetState.filter, 0);
    menu.command('Date Filters')!.dispatchEvent(new Event('pointerenter'));
    menu.sub('This Month')!.click();
    expect(sheetState.visible()).toEqual([true, false]);
  });
  it('Year To Date includes January 1 and excludes the next year', () => {
    const year = today().getFullYear();
    const sheetState = dataSheet([new Date(year, 0, 1), new Date(year - 1, 11, 31), new Date(year + 1, 0, 1)]);
    const menu = openMenu(sheetState.sheet, sheetState.filter, 0);
    menu.command('Date Filters')!.dispatchEvent(new Event('pointerenter'));
    menu.sub('Year To Date')!.click();
    expect(sheetState.visible()).toEqual([true, false, false]);
  });
  it('Last Year keeps only last year dates', () => {
    const year = today().getFullYear();
    const sheetState = dataSheet([new Date(year - 1, 5, 15), new Date(year, 5, 15)]);
    const menu = openMenu(sheetState.sheet, sheetState.filter, 0);
    menu.command('Date Filters')!.dispatchEvent(new Event('pointerenter'));
    menu.sub('Last Year')!.click();
    expect(sheetState.visible()).toEqual([true, false]);
  });
  it('All Dates in Period opens the nested picker and filters by the clicked month', () => {
    const d = today();
    const otherMonth = new Date(d.getFullYear(), (d.getMonth() + 6) % 12, 15);
    const sheetState = dataSheet([d, otherMonth]);
    const menu = openMenu(sheetState.sheet, sheetState.filter, 0);
    menu.command('Date Filters')!.dispatchEvent(new Event('pointerenter'));
    const period = menu.sub('All Dates in Period')!;
    expect(period.classList.contains('opensheets-filter-has-nested')).toBe(true);
    period.dispatchEvent(new Event('pointerenter'));
    const items = [...menu.root.querySelectorAll<HTMLElement>('.opensheets-filter-period-item')];
    const monthLabel = d.toLocaleString(undefined, { month: 'long' });
    items.find((item) => item.textContent === monthLabel)!.click();
    expect(sheetState.visible()).toEqual([true, false]);
    // The stored condition is the date-occurring condition (conType dateExCondition).
    const stored = sheetState.filter.getFilterItems(0)[0].toJSON() as { conType: number };
    expect(stored.conType).toBe(SS.ConditionalFormatting.ConditionType.dateExCondition);
  });
});

describe('context-menu paste options', () => {
  function attached() {
    const host = document.createElement('div');
    host.style.width = '640px';
    host.style.height = '480px';
    document.body.append(host);
    const wb = new Workbook(host);
    const sheet = wb.getActiveSheet();
    return { wb, sheet, interaction: sheet._view()!.interaction };
  }
  const styleOf = (sheet: Sheet, row: number, col: number) =>
    sheet.getStyle(row, col, SS.SheetArea.viewport) as { backColor?: string } | null;

  it('pasteFormula copies the re-based formula without the formatting', () => {
    const { sheet, interaction } = attached();
    sheet.setValue(0, 0, 5);
    sheet.setStyle(0, 0, new SS.Style({ backColor: '#ff0000' }));
    sheet.setFormula(0, 1, '=A1*2');
    sheet.setSelection(0, 0, 1, 2);
    interaction._copySelection(false);
    sheet.setSelection(0, 3, 1, 1);
    interaction.pasteSpecial('pasteFormula');
    expect(sheet.getValue(0, 3)).toBe(5); // the plain value column pastes as a value
    expect(sheet.getFormula(0, 4)).toBe('D1*2'); // the formula column is re-based (A1 + 3 columns)
    expect(styleOf(sheet, 0, 3)?.backColor).not.toBe('#ff0000');
  });
  it('pasteFormatting copies only the style', () => {
    const { sheet, interaction } = attached();
    sheet.setStyle(0, 0, new SS.Style({ backColor: '#00ff00' }));
    sheet.setValue(0, 0, 42);
    sheet.setValue(0, 4, 'keep');
    sheet.setSelection(0, 0, 1, 1);
    interaction._copySelection(false);
    sheet.setSelection(0, 4, 1, 1);
    interaction.pasteSpecial('pasteFormatting');
    expect(sheet.getValue(0, 4)).toBe('keep');
    expect(styleOf(sheet, 0, 4)?.backColor).toBe('#00ff00');
  });
  it('pasteValuesFormatting drops the formula and keeps the computed value plus the style', () => {
    const { sheet, interaction } = attached();
    sheet.setValue(0, 0, 5);
    sheet.setStyle(0, 0, new SS.Style({ backColor: '#0000ff' }));
    sheet.setFormula(0, 1, '=A1*2');
    sheet.setSelection(0, 0, 1, 2);
    interaction._copySelection(false);
    sheet.setSelection(0, 5, 1, 1);
    interaction.pasteSpecial('pasteValuesFormatting');
    expect(sheet.getValue(0, 5)).toBe(5);
    expect(sheet.getFormula(0, 5)).toBeNull();
    expect(styleOf(sheet, 0, 5)?.backColor).toBe('#0000ff');
    expect(sheet.getValue(0, 6)).toBe(10); // the formula column pastes as its computed value
    expect(sheet.getFormula(0, 6)).toBeNull();
  });
  it('pasteFormulaFormatting keeps formula, value and style', () => {
    const { sheet, interaction } = attached();
    sheet.setValue(0, 0, 7);
    sheet.setStyle(0, 0, new SS.Style({ backColor: '#123456' }));
    sheet.setSelection(0, 0, 1, 1);
    interaction._copySelection(false);
    sheet.setSelection(0, 2, 1, 1);
    interaction.pasteSpecial('pasteFormulaFormatting');
    expect(sheet.getValue(0, 2)).toBe(7);
    expect(styleOf(sheet, 0, 2)?.backColor).toBe('#123456');
  });
  it('a special paste is undone as one command and an empty clipboard is a no-op', () => {
    const { wb, sheet, interaction } = attached();
    interaction.pasteSpecial('pasteFormula'); // trial: nothing happens with an empty clipboard
    sheet.setStyle(0, 0, new SS.Style({ backColor: '#ff0000' }));
    sheet.setValue(0, 0, 1);
    sheet.setSelection(0, 0, 1, 1);
    interaction._copySelection(false);
    sheet.setSelection(0, 1, 1, 1);
    interaction.pasteSpecial('pasteFormulaFormatting');
    expect(sheet.getValue(0, 1)).toBe(1);
    wb.undoManager().undo();
    expect(sheet.getValue(0, 1)).toBeNull();
    expect(styleOf(sheet, 0, 1)?.backColor).not.toBe('#ff0000');
  });
  it('the captured clipboard is a snapshot: source edits after Copy do not leak into paste', () => {
    const { sheet, interaction } = attached();
    sheet.setValue(0, 0, 1);
    sheet.setSelection(0, 0, 1, 1);
    interaction._copySelection(false);
    sheet.setValue(0, 0, 99);
    sheet.setSelection(0, 1, 1, 1);
    interaction.pasteSpecial('pasteFormula');
    expect(sheet.getValue(0, 1)).toBe(1);
  });
});

describe('report-sheet command constants', () => {
  async function report() {
    const workbook = new Workbook(undefined, { sheetCount: 0 });
    await workbook.dataManager().addTable('T', { data: [
      { region: 'East', city: 'A', amount: 1 }, { region: 'East', city: 'B', amount: 2 },
      { region: 'West', city: 'C', amount: 3 },
    ] }).fetch();
    const sheet = workbook.addSheetTab(0, 'Report', SS.SheetType.reportSheet) as ReportSheet;
    const template = sheet.getTemplate();
    template.setTemplateCell(0, 0, { type: 'Group', binding: 'T[region]' });
    template.setTemplateCell(1, 1, { type: 'List', binding: 'T[city]', context: { vertical: 'A1' } });
    sheet.refresh();
    return { workbook, sheet };
  }
  const run = (workbook: InstanceType<typeof Workbook>, cmd: string, options: Record<string, unknown> = {}) =>
    workbook.commandManager().execute({ cmd, sheetName: 'Report', ...options });

  it('the nine report command constants are command objects, not NotImplemented fallbacks', () => {
    const Commands = GC.Spread.Sheets.Commands as unknown as Record<string, { canUndo?: boolean; execute: unknown }>;
    for (const name of ['ReportChartPreviewVisible', 'ReportCollapseButtonToggle', 'reportSheetAddRecord', 'reportSheetCollapseAll',
      'reportSheetDeleteRecord', 'reportSheetExpandAll', 'reportSheetRegenerateReport', 'reportSheetResetCellValue', 'reportSheetSubmit'])
      expect(typeof Commands[name]?.execute, name).toBe('function');
  });
  it('add/delete record edit the report layout and undo again', async () => {
    const { workbook, sheet } = await report();
    expect(sheet.getRange().rowCount).toBe(5);
    expect(run(workbook, 'reportSheetAddRecord', { activeRow: 1, activeCol: 1 })).toBe(true);
    expect(sheet.getRange().rowCount).toBe(6);
    workbook.undoManager().undo();
    expect(sheet.getRange().rowCount).toBe(5);
    expect(run(workbook, 'reportSheetDeleteRecord', { activeRow: 1, activeCol: 1 })).toBe(true);
    expect(sheet.getRange().rowCount).toBe(4);
    workbook.undoManager().undo();
    expect(sheet.getRange().rowCount).toBe(5);
  });
  it('collapse all / expand all hide and restore the group rows with undo', async () => {
    const { workbook, sheet } = await report();
    expect(run(workbook, 'reportSheetCollapseAll', { selections: [new Range(0, 0, 5, 1)] })).toBe(true);
    expect(sheet.getCollapseState(0, 0)).toBe(true);
    expect(sheet.getCollapseState(3, 0)).toBe(true);
    expect(sheet.getRowVisible(1)).toBe(false);
    workbook.undoManager().undo();
    expect(sheet.getCollapseState(0, 0)).toBe(false);
    expect(sheet.getRowVisible(1)).toBe(true);
    sheet.toggleCollapseState(0, 0, 'Collapsed');
    expect(run(workbook, 'reportSheetExpandAll', { selections: [new Range(0, 0, 5, 1)] })).toBe(true);
    expect(sheet.getCollapseState(0, 0)).toBe(false);
    expect(sheet.getRowVisible(1)).toBe(true);
  });
  it('reset cell value restores bound data and can be undone', async () => {
    const { workbook, sheet } = await report();
    sheet.updateCellValue(1, 1, 'X');
    expect(sheet.getValue(1, 1)).toBe('X');
    expect(run(workbook, 'reportSheetResetCellValue', { selections: [new Range(0, 0, 5, 2)] })).toBe(true);
    expect(sheet.getValue(1, 1)).toBe('A');
    workbook.undoManager().undo();
    expect(sheet.getValue(1, 1)).toBe('X');
  });
  it('submit and regenerate run on report sheets and report false elsewhere', async () => {
    const { workbook, sheet } = await report();
    sheet.updateCellValue(1, 1, 'Y');
    expect(sheet.getValue(1, 1)).toBe('Y');
    expect(run(workbook, 'reportSheetSubmit')).toBe(true);
    expect(sheet.getValue(1, 1)).toBe('Y');
    expect(run(workbook, 'reportSheetRegenerateReport')).toBe(true);
    const plain = new Workbook();
    expect(plain.commandManager().execute({ cmd: 'reportSheetSubmit', sheetName: plain.getActiveSheet().name() })).toBe(false);
  });
  it('the collapse-button and chart-preview toggles flip per-cell state with undo', async () => {
    const { workbook, sheet } = await report();
    expect(run(workbook, 'ReportCollapseButtonToggle', { row: 0, col: 0 })).toBe(true);
    expect(sheet._collapseButtonVisible(0, 0)).toBe(false);
    workbook.undoManager().undo();
    expect(sheet._collapseButtonVisible(0, 0)).toBe(true);
    expect(run(workbook, 'ReportChartPreviewVisible', { row: 0, col: 1 })).toBe(true);
    expect(sheet._chartPreviewVisible(0, 1)).toBe(true);
    workbook.undoManager().undo();
    expect(sheet._chartPreviewVisible(0, 1)).toBe(false);
    expect(run(workbook, 'ReportChartPreviewVisible', { row: 0, col: 1, visible: true })).toBe(true);
    expect(sheet._chartPreviewVisible(0, 1)).toBe(true);
  });
});
