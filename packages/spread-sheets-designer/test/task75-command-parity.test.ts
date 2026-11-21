/* eslint-disable @typescript-eslint/no-explicit-any */
/* TASK 75 r3: ribbon-command behaviour parity with the official Designer, proven by the
 * both-sides `getCommand(name).execute(designer)` sweep on apps/designer-compare. */
import { beforeEach, describe, expect, it } from 'vitest';
import GC from '@mescius/spread-sheets';
import { builtinCommandSpecs } from '../src/commands/index.js';
import { applyBuiltin } from '../src/commands/actions.js';
import { insertChartPreview, insertComboChart } from '../src/commands/insert.js';
import { Designer } from '../src/designer.js';

describe('TASK 75 command parity (trial sweep)', () => {
  let sheet: any, d: any, workbook: any;
  const exec = (name: string, propertyName?: string, value?: unknown): void => {
    (Designer.prototype as any).executeBuiltin.call(d, name, propertyName, value);
  };
  const json = (): string => JSON.stringify(sheet.toJSON());

  beforeEach(() => {
    workbook = new GC.Spread.Sheets.Workbook();
    sheet = workbook.getActiveSheet();
    sheet.setArray(0, 0, [
      ['Region', 'Q1', 'Q2', 'Q3', 'Q4', 'Total'],
      ['North', 120, 135, 150, 165, 570],
      ['South', 90, 105, 95, 125, 415],
      ['North', 120, 135, 150, 165, 570],
      ['East', 75, 80, 90, 100, 345],
    ]);
    d = Object.assign(Object.create(Designer.prototype), {
      gc: GC,
      getWorkbook: () => workbook,
      invalidate: () => undefined,
      runUndoable: (name: string, args: any) => applyBuiltin(d, name, args ?? {}),
      applyUndoableAction: (name: string, args: any) => { applyBuiltin(d, name, args ?? {}); },
      showMessageBox: () => undefined,
    });
  });

  it('registers every trial command name the sweep enumerated', () => {
    const names = [
      'contextMenuCopy', 'contextMenuCut', 'contextMenuPaste', 'contextMenuUnhideSheet',
      'insertCopiedCells', 'insertCutCells', 'sort',
      'designerPasteAll', 'designerPasteFormatting', 'designerPasteValues',
      'columnWidth', 'rowHeight', 'defineName', 'link', 'editHyperlink', 'removeHyperlink',
      'protectSheet', 'unprotectSheet', 'showTabColor', 'fileMenuPanel', 'formulaBarPanel', 'statusBarPanel',
      'gc.spread.contextMenu.insertRows', 'gc.spread.contextMenu.deleteRows',
      'gc.spread.contextMenu.insertColumns', 'gc.spread.contextMenu.deleteColumns',
      'gc.spread.contextMenu.hideRows', 'gc.spread.contextMenu.unhideRows',
      'gc.spread.contextMenu.hideColumns', 'gc.spread.contextMenu.unhideColumns',
      'gc.spread.contextMenu.clearContents', 'gc.spread.contextMenu.insertSheet',
      'gc.spread.contextMenu.deleteSheet', 'gc.spread.contextMenu.hideSheet',
      'gc.spread.contextMenu.filter', 'gc.spread.contextMenu.insertComment',
      'gc.spread.contextMenu.deleteComment', 'gc.spread.contextMenu.toggleComment',
    ];
    for (const name of names) expect(builtinCommandSpecs, name).toHaveProperty(name);
  });

  it('keeps the trial-inert context-menu commands free of model side effects', () => {
    // The trial registers these names without an `execute`; a call must not change anything.
    sheet.setSelection(1, 1, 2, 2);
    const snapshot = json();
    for (const name of [
      'contextMenuPaste', 'insertCopiedCells', 'insertCutCells', 'sort',
      'gc.spread.contextMenu.insertRows', 'gc.spread.contextMenu.deleteRows',
      'gc.spread.contextMenu.hideColumns', 'gc.spread.contextMenu.clearContents',
      'gc.spread.contextMenu.filter', 'gc.spread.contextMenu.toggleComment',
    ]) exec(name);
    expect(json()).toBe(snapshot);
  });

  it('opens the Remove Duplicates dialog on a bare removeDuplicates execute (no data change)', () => {
    /* TASK 84 R1: live re-probe of the trial on `?side=official` (2026-11-21, web-vision,
     * `.probe/t84/`): `GC.Spread.Sheets.Designer.getCommand('removeDuplicates').execute(designer)`
     * OPENS the "Remove Duplicates" dialog and changes NO data. The TASK 75 r3 note that a bare
     * execute de-duplicates immediately does not reproduce (and contradicted the paired spec that
     * was green through RC1), so both the ribbon and the bare path open the dialog. */
    sheet.setSelection(1, 1, 1, 1);
    const snapshot = json();
    const opened: string[] = [];
    d.showRemoveDuplicates = () => opened.push('removeDuplicates');
    exec('removeDuplicates');
    exec('removeDuplicates', 'removeDuplicates'); // the ribbon path does the same
    expect(opened).toEqual(['removeDuplicates', 'removeDuplicates']);
    expect(json()).toBe(snapshot);
  });

  it('sets row AND column page breaks even at index 0', () => {
    // Trial (r3 probe): Insert Page Break on A1 records rows[0].pageBreak + columns[0].pageBreak.
    sheet.setSelection(0, 0, 1, 1);
    sheet.setActiveCell(0, 0);
    exec('insertPageBreak');
    const node = JSON.parse(json());
    expect(node.rows?.[0]?.pageBreak).toBe(true);
    expect(node.columns?.[0]?.pageBreak).toBe(true);
  });

  it('treats bare Cell Types gallery executes as no-ops and applies types on the ribbon path', () => {
    sheet.setSelection(1, 1, 2, 2);
    const snapshot = json();
    for (const name of ['checkboxCellType', 'comboBoxCellType', 'hyperlinkCellType', 'sliderCellType', 'diagonalCellType']) exec(name);
    expect(json()).toBe(snapshot);
    // Ribbon path (the controls pass the command name as propertyName): CheckBox inserts.
    exec('checkboxCellType', 'checkboxCellType');
    expect(sheet.getActualStyle(1, 1).cellType).toBeTruthy();
    expect(String((sheet.getActualStyle(1, 1).cellType as { ctorName?: string }).ctorName ?? (sheet.getActualStyle(1, 1).cellType as { typeName?: string }).typeName)).toMatch(/heck|^5$/);
  });

  it('computes Zoom to Selection like the trial: min((vw+40)/(W+40), (vh+20)/(H+20))', () => {
    // Trial (r3 four-selection probe): width/height fits include the header strips (40/20).
    sheet.getViewportWidth = () => 578;
    sheet.getViewportHeight = () => 471;
    let scrolled: number[] = [];
    sheet.showCell = (row: number, col: number, v: number, h: number) => { scrolled = [row, col, v, h]; };
    sheet.setSelection(1, 1, 2, 2); // B2:C3 -> W=124 H=40 at the default widths
    let applied = 0;
    const realZoom = sheet.zoom.bind(sheet);
    sheet.zoom = (value?: number) => { if (value === undefined) return applied; applied = value as number; return sheet; };
    exec('zoomSelection');
    sheet.zoom = realZoom;
    const width = sheet.getColumnWidth(1) + sheet.getColumnWidth(2);
    const height = sheet.getRowHeight(1) + sheet.getRowHeight(2);
    expect(applied).toBeCloseTo(Math.min((578 + 40) / (width + 40), (471 + 20) / (height + 20)), 6);
    expect(scrolled).toEqual([1, 1, 0, 0]);
  });

  it('copies through contextMenuCopy without touching the model', () => {
    // Trial: contextMenuCopy has its own execute (the internal clipboard copy); the
    // workbook JSON stays untouched, exactly like our `copy` command.
    sheet.setSelection(0, 0, 1, 2);
    const snapshot = json();
    expect(() => exec('contextMenuCopy')).not.toThrow();
    expect(json()).toBe(snapshot);
  });

  it('unhide only shows the hidden part of the selection (Unhide Columns/Rows)', () => {
    // Trial (TASK 75 r5 unhide probe): the selection A7:A8 with only column H hidden leaves the
    // workbook untouched; ours used to materialise `columns[0].visible: true`.
    sheet.setColumnVisible(7, false);
    sheet.setRowVisible(6, false);
    sheet.setSelection(6, 0, 2, 1);
    const hidden = json();
    exec('unHideColumns');
    expect(json()).toBe(hidden);
    // The columns/rows that ARE hidden still get their explicit `visible: true` record.
    sheet.setSelection(0, 7, 1, 1);
    exec('unHideColumns');
    expect((JSON.parse(json()).columns as ({ visible?: boolean } | null)[])[7]).toMatchObject({ visible: true });
    sheet.setSelection(6, 0, 2, 1);
    exec('unHideRows');
    expect((JSON.parse(json()).rows as ({ visible?: boolean } | null)[])[6]).toMatchObject({ visible: true });
  });

  it('clearing the filter leaves no row records (Clear Filter)', () => {
    // Trial (TASK 75 r5 filter probe): the rows a filter hid are restored silently.
    sheet.rowFilter(new (GC.Spread.Sheets as any).Filter.HideRowFilter(new (GC.Spread.Sheets as any).Range(0, 1, 5, 4)));
    exec('setFilter');
    sheet.setSelection(0, 1, 5, 1);
    exec('clearFilter');
    expect(sheet.toJSON().rows).toBeUndefined();
  });

  it('materialises the gallery combo preset series styles', () => {
    // Trial (TASK 75 r5 probe .probe/t75r5/p2.json): every preset series carries its accent
    // fill; bar series a black zero-width line plus the dataObject `extLst`; area series only
    // the line; and the chart's blank policy is `dispBlanksAs: 1`.
    const at = { row: 1, col: 1, rowCount: 3, colCount: 4 }; // B2:E4 — headless 3x4 grid
    expect(insertComboChart(d, 'comboChartColumnAndLine', undefined, at)).toBe(true);
    const chart = sheet.charts.all()[0] as any;
    const groups = chart._space.chart.plotArea.chartGroups;
    expect(chart._space.chart.dispBlanksAs).toBe(1);
    expect(groups[0].ser.map((ser: any) => ser.spPr.ln)).toEqual([
      { solidFill: { srgbClr: { val: [0, 0, 0] } }, w: 0, prstDash: 0 },
      { solidFill: { srgbClr: { val: [0, 0, 0] } }, w: 0, prstDash: 0 },
    ]);
    expect(groups[0].ser[0].extLst.ext[0].dataObject.spPr).toEqual({ solidFill: { srgbClr: { val: [255, 255, 255] } }, ln: { noFill: true } });
    const line = groups[1].ser[0];
    expect(line.spPr).toEqual({ solidFill: { schemeClr: { val: 6 } }, ln: { w: 2 } });
    // The preset series carry no name/category reference at all on a headless grid.
    expect(line.tx).toBeUndefined();
    expect(line.cat).toBeUndefined();
    sheet.charts.remove(String(chart.name()));
    expect(insertComboChart(d, 'comboChartColumnAndArea', undefined, at)).toBe(true);
    const areaChart = sheet.charts.all()[0] as any;
    const areaGroups = areaChart._space.chart.plotArea.chartGroups;
    expect(areaChart._space.chart.dispBlanksAs).toBe(1);
    expect(areaGroups[0].ser[0].spPr.ln).toEqual({ solidFill: { srgbClr: { val: [0, 0, 0] } }, w: 0, prstDash: 0 });
    expect(areaGroups[0].ser[0].extLst).toBeUndefined(); // the line lives on the area series…
    expect(areaGroups[1].ser[0].extLst).toBeTruthy();    // …the dataObject only on the bar one
  });

  it('skips a gallery chart whose data does not fit the type, silently (stock)', () => {
    // Trial (TASK 75 r5 probe .probe/t75r5/p4.json): the stock gallery items insert NOTHING and
    // show nothing (no dialog, no toast) when the selection has the wrong series count.
    sheet.setSelection(1, 1, 1, 1);
    expect(insertChartPreview(d, 'stockHLCChart')).toBe(false);
    expect(sheet.charts.all().length).toBe(0);
    sheet.setSelection(0, 0, 5, 4);
    expect(insertChartPreview(d, 'stockHLCChart')).toBe(true);
    expect(sheet.charts.all().length).toBe(1);
  });

  it('registers the trial context-menu name pasteFormula next to pasteFormulas', () => {    // TASK 75 r5 sweep: `missing-ours` — the executor accepted the name, the registry did not.
    expect(builtinCommandSpecs).toHaveProperty('pasteFormula');
    sheet.setSelection(0, 1, 2, 4);
    exec('copy');
    sheet.setSelection(4, 1, 2, 4);
    expect(() => exec('pasteFormula')).not.toThrow();
  });

  it('materialises the pasted cell style like the trial (all Paste Options modes)', () => {
    // Trial (TASK 75 r5 probe .probe/t75r5/p10.json): a paste writes the source cell's COMPUTED
    // style as a materialised record — even a plain source cell carries
    // `{hAlign:3, vAlign:0, themeFont:"Body", imeMode:1}`; "Keep Source Formatting" keeps the
    // explicit `font`/`locked`/`hidden` instead of `themeFont`; number-format-only modes leave an
    // un-formatted cell with NO style at all.
    const sheetLocal = sheet as any;
    sheetLocal.getRange(0, 1, 1, 4).backColor('#dce6f1');
    // The core owns the internal clipboard the paste reads (the `copy` command fills it in the
    // running app); stub it the way `paste-modes.test.ts` does.
    const clipboard = (row: number, col: number, rowCount: number, colCount: number): void => {
      sheetLocal._clipboardSource = () => ({ sheetName: sheetLocal.name(), row, col, rowCount, colCount });
      sheetLocal._clipboardMode = () => 'copy';
    };
    clipboard(0, 1, 2, 4);
    sheetLocal.setSelection(4, 1, 2, 4);
    exec('pasteAll');
    const node = () => JSON.parse(json()).data.dataTable;
    expect(node()['4']['1'].style).toMatchObject({ backColor: '#dce6f1', hAlign: 3, vAlign: 0, themeFont: 'Body', imeMode: 1 });
    expect(node()['5']['1'].style).toMatchObject({ hAlign: 3, vAlign: 0, themeFont: 'Body', imeMode: 1 });
    // Number-format-only paste over a fresh target leaves no style record.
    clipboard(0, 1, 1, 4);
    sheetLocal.setSelection(12, 1, 1, 1);
    exec('pasteFormulaAndNumberFormat');
    expect((node()['12']?.['1'] ?? {}).style).toBeUndefined();
  });

  it('pastes the whole block for the never-enabled trial paste buttons', () => {
    // Trial (same probe): Keep Source Formatting / No Borders / Keep Source Column Widths paste
    // values and formulas too — ours used to write styles (or widths) only.
    const sheetLocal = sheet as any;
    sheetLocal.getRange(0, 1, 1, 4).backColor('#dce6f1');
    sheetLocal._clipboardSource = () => ({ sheetName: sheetLocal.name(), row: 0, col: 1, rowCount: 1, colCount: 4 });
    sheetLocal._clipboardMode = () => 'copy';
    sheetLocal.setSelection(9, 1, 1, 4);
    exec('pasteKeepSourceFormatting');
    expect(sheetLocal.getValue(9, 1)).toBe('Q1');
    const style = JSON.parse(json()).data.dataTable['9']['1'].style;
    expect(style).toMatchObject({ backColor: '#dce6f1', hAlign: 3, vAlign: 0, imeMode: 1, locked: true });
    expect(style.themeFont).toBeUndefined();
    expect(style.font).toBeTruthy();
    sheetLocal.setSelection(9, 1, 1, 4);
    exec('pasteNoBorders');
    expect(sheetLocal.getValue(9, 1)).toBe('Q1');
  });

  it('ignores a bare formatTableListContent execute (the gallery value does the work)', () => {
    // Trial (TASK 75 r5 probe .probe/t75r5/p9.json): only the gallery tile's value does anything;
    // ours applied `medium2` on a bare execute and threw inside the table layer. The value path is
    // covered by commands.test.ts.
    sheet.tables.add('Table1', 0, 0, 5, 6, true);
    sheet.setSelection(1, 1, 3, 4);
    const snapshot = json();
    expect(() => exec('formatTableListContent')).not.toThrow();
    expect(json()).toBe(snapshot);
  });

  it('keeps the trial\'s execute-less Pivot dropdown names inert', () => {
    // Trial (TASK 75 r5 probe .probe/t75r5/p6.json): these six Pivot-tab names are registered
    // WITHOUT an `execute` (they are dropdown hosts), so nothing may happen or be thrown here.
    sheet.setSelection(8, 1, 1, 1);
    const snapshot = json();
    for (const name of [
      'pivotTableGrandTotals', 'pivotTableSubtotals', 'pivotTableReportLayout',
      'pivotTableBlankRows', 'pivotTableClearList', 'pivotTableFieldsItemsSets',
    ]) expect(() => exec(name), name).not.toThrow();
    expect(json()).toBe(snapshot);
  });
});
