/**
 * TASK 93 item 2: custom pivot styles. The trial's PivotTable Styles gallery
 * answers right-click on a tile with Apply / Modify... / Duplicate... / Delete /
 * Set As Default (measured black-box on apps/designer-compare `?side=official`);
 * custom styles are registered through `workbook.customPivotTableThemes` and
 * survive `toJSON()` as `customPivotTableThemes` + `defaultPivotTableStyle`.
 * The dialog itself reuses the New Table Style dialog structure (Name row,
 * element list, Format/Clear, Preview, Stripe Size) — measured 589x417 with a
 * 25-item element list.
 */
// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from 'vitest';
import GC from '@mescius/spread-sheets';
import { executeDesignerSpecial } from '../src/designer-commands.js';
import {
  deletePivotTheme, duplicatePivotTheme, pivotThemeDraft,
  PIVOT_STYLE_TEMPLATE, setDefaultPivotTheme, showNewPivotTableStyleDialog,
} from '../src/designer-custom-styles.js';
import { buildPivotTheme, customPivotThemeTiles, emptyTableElementStyle } from '../src/dialogs/TableStyleDialogs.js';
import { stubCanvas2d } from './canvas-stub.js';

stubCanvas2d();

const P = (GC as any).Spread.Pivot;

function setup(): { workbook: any; sheet: any; pivot: any; designer: any; opened: any[] } {
  const workbook = new (GC as any).Spread.Sheets.Workbook();
  const sheet: any = workbook.getActiveSheet();
  sheet.name('Data');
  const rows = [['SaleDate', 'Amount'], [new Date(2022, 0, 3), 10], [new Date(2022, 1, 5), 20]];
  rows.forEach((row, r) => row.forEach((value, c) => sheet.setValue(r, c, value)));
  sheet.tables.add('Source1', 0, 0, rows.length, 2, undefined, { showHeader: true });
  sheet.pivotTables.add('PivotTable1', 'Source1', 4, 1, P.PivotTableLayoutType.tabular);
  const pivot = sheet.pivotTables.get('PivotTable1');
  pivot.add('SaleDate', 'SaleDate', P.PivotTableFieldType.rowField);
  pivot.add('Amount', 'Sum of Amount', P.PivotTableFieldType.valueField, 8);
  // The active cell sits inside the pivot so withPivot() resolves it.
  sheet.setActiveCell(4, 1);
  sheet.setSelection(4, 1, 1, 1);
  const opened: any[] = [];
  const designer: any = {
    gc: GC,
    spreadsheet: workbook,
    getWorkbook: () => workbook,
    invalidate: () => undefined,
    showDialog: (name: string, data: any, success: (data: any) => void) => { const record = { name, data, ok: success }; opened.push(record); return record; },
    closeDialog: () => undefined,
    showMessageBox: () => undefined,
    showNewPivotTableStyleDialog: (name?: string) => showNewPivotTableStyleDialog(designer, name ? pivotThemeDraft(designer, name) : undefined),
  };
  return { workbook, sheet, pivot, designer, opened };
}

/** One formatted element (the shape the Format Cells bridge produces). */
function redBold(): any {
  return { ...emptyTableElementStyle(), backColor: '#ff0000', foreColor: '#ffffff', bold: true };
}

describe('TASK 93 custom pivot styles', () => {
  it('the newPivotTableStyle command opens the trial template with an auto name', () => {
    const { designer, opened, workbook } = setup();
    expect(executeDesignerSpecial(designer, 'newPivotTableStyle', undefined)).toBe(true);
    expect(opened[0].name).toBe(PIVOT_STYLE_TEMPLATE);
    expect(opened[0].data.name).toBe('New Pivot Table Style 1');
    workbook.destroy();
  });

  it('OK registers the theme; the gallery lists it and it applies to the pivot', () => {
    const { designer, opened, pivot, workbook } = setup();
    showNewPivotTableStyleDialog(designer);
    const data = { ...opened[0].data, styles: { wholeTableStyle: redBold(), headerRowStyle: { ...emptyTableElementStyle(), backColor: '#0000ff' } }, sizes: { firstRowStripSize: 3 } };
    opened[0].ok(data);
    const manager = workbook.customPivotTableThemes;
    const theme = manager.get('New Pivot Table Style 1');
    expect(theme).toBeTruthy();
    expect(theme.toJSON().headerRowStyle.backColor).toBe('#0000ff');
    expect(theme.toJSON().firstRowStripSize).toBe(3);
    // Gallery tiles + apply through the public pivot.theme(name).
    expect(customPivotThemeTiles(designer).map((t) => t.name)).toEqual(['New Pivot Table Style 1']);
    expect(executeDesignerSpecial(designer, 'pivotTableStyle', 'New Pivot Table Style 1')).toBe(true);
    expect(pivot.getThemeName()).toBe('New Pivot Table Style 1');
    workbook.destroy();
  });

  it('Modify pre-fills the draft from the theme and OK updates in place', () => {
    const { designer, opened, workbook } = setup();
    const manager = workbook.customPivotTableThemes;
    manager.add(buildPivotTheme(GC, 'My Pivot Style', { firstColumnStyle: redBold() }, { firstColumnStripSize: 2 }));
    const draft = pivotThemeDraft(designer, 'My Pivot Style');
    expect(draft.original).toBe('My Pivot Style');
    expect(draft.styles.firstColumnStyle.backColor).toBe('#ff0000');
    expect(draft.sizes.firstColumnStripSize).toBe(2);
    showNewPivotTableStyleDialog(designer, draft);
    expect(opened[0].data.name).toBe('My Pivot Style');
    opened[0].ok({ ...opened[0].data, styles: { firstColumnStyle: { ...redBold(), backColor: '#00ff00' } } });
    expect(manager.all().length).toBe(1); // update, not a second add
    expect(manager.get('My Pivot Style').toJSON().firstColumnStyle.backColor).toBe('#00ff00');
    workbook.destroy();
  });

  it('Duplicate... opens the editor prefilled with the clone; OK registers " 1"', () => {
    const { designer, opened, workbook } = setup();
    const manager = workbook.customPivotTableThemes;
    manager.add(buildPivotTheme(GC, 'Copy Me', { wholeTableStyle: redBold() }));
    duplicatePivotTheme(designer, 'Copy Me');
    expect(opened.at(-1).data.name).toBe('Copy Me 1');
    expect(opened.at(-1).data.styles.wholeTableStyle.backColor).toBe('#ff0000');
    opened.at(-1).ok(opened.at(-1).data);
    expect(manager.get('Copy Me 1')).toBeTruthy();
    // Built-in clone: the editor opens prefilled from the built-in theme.
    duplicatePivotTheme(designer, 'medium2', true);
    const data = opened.at(-1).data;
    expect(data.name).toBe('medium2 1');
    expect(Object.keys(data.styles).length).toBeGreaterThan(0);
    data.name = 'Medium2 Copy';
    opened.at(-1).ok(data);
    expect(manager.get('Medium2 Copy')).toBeTruthy();
    // Set As Default + Delete.
    setDefaultPivotTheme(designer, 'Copy Me 1');
    expect(String(workbook.defaultPivotTableTheme()?.name?.())).toBe('Copy Me 1');
    deletePivotTheme(designer, 'Copy Me 1');
    expect(manager.get('Copy Me 1')).toBeFalsy();
    expect(workbook.defaultPivotTableTheme()).toBeUndefined();
    workbook.destroy();
  });

  it('Set As Default resolves built-in keys, serializes and themes new pivots', () => {
    const { workbook, sheet } = setup();
    workbook.defaultPivotTableTheme('medium2');
    const theme = workbook.defaultPivotTableTheme();
    expect(String(theme?.name?.())).toBe(String(P.PivotTableThemes.medium2.name()));
    // toJSON carries the name string, exactly like the trial's serialization.
    const json = workbook.toJSON();
    expect(json.defaultPivotTableStyle).toBe('medium2');
    // Contract (d.ts): add() without a theme uses the default.
    sheet.pivotTables.add('PivotTable2', 'Source1', 20, 1);
    expect(sheet.pivotTables.get('PivotTable2').getThemeName()).toBe(String(P.PivotTableThemes.medium2.name()));
    // Import round-trip: the string re-resolves, and with no default registered a
    // fresh pivot falls back to Light 16 (trial styleName PivotStyleLight16).
    const wb2 = new (GC as any).Spread.Sheets.Workbook();
    wb2.fromJSON(JSON.parse(JSON.stringify(json)));
    expect(String(wb2.defaultPivotTableTheme()?.name?.())).toBe(String(P.PivotTableThemes.medium2.name()));
    wb2.destroy();
    const wb3 = new (GC as any).Spread.Sheets.Workbook();
    const s3: any = wb3.getActiveSheet();
    s3.name('S3');
    const rows3 = [['SaleDate', 'Amount'], [new Date(2022, 0, 3), 10], [new Date(2022, 1, 5), 20]];
    rows3.forEach((r, i) => r.forEach((v, c) => s3.setValue(i, c, v)));
    s3.pivotTables.add('P', "S3!$A$1:$B$3", 6, 0);
    expect(s3.pivotTables.get('P').getThemeName()).toBe('Light16');
    wb3.destroy();
    workbook.destroy();
  });
});
