/**
 * TASK 77: the PivotTable Analyze ▸ Fields, Items & Sets family and the Options /
 * Show Report Filter Pages entries.
 *
 * Expectations come from the black-box measurements on the running trial
 * (apps/designer-compare, server 5188; evidence .probe/t77/run/t77-pivot-probe3.json,
 * t77-pivot-dialogs.json, t77-pivot-semantics.json, t77-calc-open.json,
 * t77-dialog-geometry.json, t77-listformulas.json and probes 9-16), and each one was
 * re-measured on OUR Designer through the public accessors in the same session
 * (`t77-listformulas.json`: report-sheet data JSON identical on both sides).
 */
// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from 'vitest';
import GC from '@mescius/spread-sheets';
import { executeDesignerBuiltin, executeDesignerSpecial } from '../src/designer-commands.js';
import { pivotFieldListFollowSelection } from '../src/designer-events.js';
import {
  activatePivotAtPanelDrop, applyCalcFieldAdd, applyCalcFieldDelete, applyCalcFieldModify, applyCalcItemAdd, applyCalcItemDelete,
  calcFieldEntries, listPivotFormulas, moveCalcItem, showCalcItemSolveOrder, showCalculatedField,
  showCalculatedItem, showPivotTableOptions, showReportFilterPages, solveOrderEntries,
} from '../src/pivot-designer.js';

// jsdom ships no 2D canvas backend; the List Formulas report auto-fits its formula column, so
// the measurement path needs a stub (the same one packages/spread-sheets/test/formula-panel-io.test.ts uses).
function stubCanvas2d(): void {
  (globalThis as Record<string, unknown>).CanvasRenderingContext2D = class {};
  HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, id?: string) {
    if (id !== '2d') return null;
    const target: Record<string, unknown> = { canvas: this };
    return new Proxy(target, {
      get: (t, prop) => {
        if (typeof prop === 'symbol') return undefined;
        if (prop in t) return t[prop as string];
        if (prop === 'measureText') return (text: unknown) => ({ width: String(text).length * 7, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 });
        if (prop === 'createLinearGradient' || prop === 'createRadialGradient' || prop === 'createPattern') return () => ({ addColorStop: () => undefined });
        return () => undefined;
      },
      set: (t, prop, value) => { t[prop as string] = value; return true; },
    }) as unknown as CanvasRenderingContext2D;
  } as HTMLCanvasElement['getContext'];
}
stubCanvas2d();

const DATA = [
  ['Region', 'Q1', 'Q2', 'Q3', 'Q4', 'Total'],
  ['North', 120, 135, 150, 165, 570],
  ['South', 90, 105, 95, 125, 415],
  ['East', 75, 80, 90, 100, 345],
  ['West', 110, 115, 105, 130, 460],
];

interface Recorded { name: string; data: any; ok: (data: any) => void }

function setup(): { workbook: any; sheet: any; pivot: any; designer: any; opened: Recorded[]; boxes: string[] } {
  const workbook = new GC.Spread.Sheets.Workbook();
  const sheet: any = workbook.getActiveSheet();
  sheet.name('Data');
  DATA.forEach((row, r) => row.forEach((value, c) => sheet.setValue(r, c, value)));
  sheet.tables.add('Source1', 0, 0, 5, 6, undefined, { showHeader: true });
  const P = GC.Spread.Pivot;
  sheet.pivotTables.add('PivotTable1', 'Source1', 8, 1, P.PivotTableLayoutType.compact, P.PivotTableThemes.medium2, { showRowHeader: true, showColumnHeader: true });
  const pivot = sheet.pivotTables.get('PivotTable1');
  pivot.add('Region', 'Region', P.PivotTableFieldType.rowField);
  pivot.add('Q1', 'Sum of Q1', P.PivotTableFieldType.valueField, GC.Pivot.SubtotalType.sum);
  // The sweep pins the active cell/selection inside the report before every execute.
  sheet.setActiveCell(8, 1);
  sheet.setSelection(8, 1, 1, 1);

  const opened: Recorded[] = [];
  const boxes: string[] = [];
  const designer: any = {
    gc: GC,
    spreadsheet: workbook,
    getWorkbook: () => workbook,
    invalidate: () => undefined,
    dialog: null as any,
    opened,
    showDialog: (name: string, data: any, success: (data: any) => void) => {
      const record = { name, data, ok: success };
      opened.push(record);
      designer.dialog = { name, data, success, error: () => undefined };
      return record;
    },
    closeDialog: () => { designer.dialog = null; },
    showMessageBox: (text: string) => { boxes.push(String(text)); },
    activePivot: () => sheet.pivotTables.findPivotTable(8, 1) ?? null,
  };
  /* The Designer class methods the pivot command routing calls (mirrors the class, like the
   * other dialog tests wire their own). */
  designer.showPivotTableOptions = () => showPivotTableOptions(designer);
  designer.showCalculatedField = () => showCalculatedField(designer);
  designer.showCalculatedItem = () => showCalculatedItem(designer);
  designer.showCalcItemSolveOrder = () => showCalcItemSolveOrder(designer);
  designer.showReportFilterPages = () => showReportFilterPages(designer);
  return { workbook, sheet, pivot, designer, opened, boxes };
}

/** The pivot cells under the report (public accessor view of the rendered report). */
function report(sheet: any, rows: number, cols: number): (string | number | null)[] {
  const out: (string | number | null)[] = [];
  for (let r = 8; r < 8 + rows; r++) for (let c = 1; c < 1 + cols; c++) out.push(sheet.getValue(r, c));
  return out;
}

describe('TASK 77 pivot command routing (no NotImplemented left)', () => {
  it('executes the five Fields/Items & Sets + Options entries the trial opens a dialog for', () => {
    const { designer, opened } = setup();
    for (const name of ['pivotTableCalculatedField', 'PivotTableCalculatedItem', 'PivotTableSolveOrder', 'pivotTableOptionsSub', 'pivotTableShowReportFilterPages']) {
      expect(() => executeDesignerSpecial(designer, name, undefined)).not.toThrow();
    }
    // pivotTableShowReportFilterPages needs a report-filter field (trial: probe 3 vs probe 11).
    expect(opened.map((item) => [item.name, item.data.dialogTitle])).toEqual([
      ['calculatedFieldsDialogTemplate', 'Insert Calculated Field'],
      ['calculatedItemsDialogTemplate', 'Insert Calculated Item in "Region"'],
      ['calculatedItemSolveOrderDialogTemplate', 'Calculated Item Solve Order'],
      ['pivotTableOptionsDialogTemplate', 'PivotTable Options'],
    ]);
  });

  it('pivotTableStyleListContent stays inert like the trial (bare execute changes nothing)', () => {
    const { designer, sheet, opened } = setup();
    const before = JSON.stringify(sheet.toJSON());
    expect(() => executeDesignerBuiltin(designer, 'pivotTableStyleListContent')).not.toThrow();
    expect(JSON.stringify(sheet.toJSON())).toBe(before);
    expect(opened.length).toBe(0);
  });

  it('Show Report Filter Pages opens its confirmation only for a pivot with a report filter', () => {
    const { designer, sheet, pivot, opened } = setup();
    expect(executeDesignerSpecial(designer, 'pivotTableShowReportFilterPages', undefined)).toBe(true);
    expect(opened.length).toBe(0);
    pivot.remove('Region');
    pivot.add('Region', 'Region', GC.Spread.Pivot.PivotTableFieldType.filterField);
    showReportFilterPages(designer);
    expect(opened.length).toBe(1);
    expect(opened[0].name).toBe('pivotShowReportFilterDialogTemplate');
    expect(opened[0].data.dialogTitle).toBe('Show Report Filter Pages');
    expect(opened[0].data.filterFields).toEqual(['Region']);
    const before = JSON.stringify(sheet.toJSON());
    opened[0].ok({});
    /* Trial (probe 11): with the report filter at (All) the confirmed dialog leaves the workbook
     * untouched; producing a filtered copy per page item needs a page-filter selection the public
     * contract does not expose (recorded deviation, docs/STATUS.md TASK 77). */
    expect(JSON.stringify(sheet.toJSON())).toBe(before);
  });

  it('the Options dropdown entry opens the same PivotTable Options dialog as Options', () => {
    const { designer, opened } = setup();
    showPivotTableOptions(designer);
    executeDesignerSpecial(designer, 'pivotTableOptionsSub', undefined);
    const titles = opened.map((item) => item.data.dialogTitle);
    expect(titles).toEqual(['PivotTable Options', 'PivotTable Options']);
  });
});

describe('TASK 77 Insert Calculated Field dialog semantics', () => {
  it('Add creates the calculated value field named like the trial (measured: "Sum of Field1")', () => {
    const { designer, pivot, sheet } = setup();
    showCalculatedField(designer);
    expect(openCalcFieldDefaults(designer)).toEqual({ name: 'Field1', formula: '= 0' });
    const added = applyCalcFieldAdd(designer, 'Field1', '= 0');
    expect(added).toBe('Sum of Field1');
    /* Trial (measured through the dialog + the same two public calls, probe 8): identical
     * getCalcFields(), the same field areas and the same pivot cells. */
    expect(calcFieldEntries(pivot)).toEqual([{ name: 'Sum of Field1', formula: '= 0' }]);
    expect(pivot.getFieldsByArea().map((field: any) => [field.fieldName, field.sourceName, field.pivotArea]))
      .toEqual([['Region', 'Region', 1], ['Sum of Q1', 'Q1', 3], ['Sum of Field1', 'Field1', 3]]);
    expect(report(sheet, 8, 3).slice(0, 3)).toEqual(['Row Labels', 'Sum of Q1', 'Sum of Field1']);
  });

  it('a duplicate name is refused with the trial message instead of silently overwriting', () => {
    const { designer, pivot, boxes } = setup();
    applyCalcFieldAdd(designer, 'Field1', '= 0');
    expect(applyCalcFieldAdd(designer, 'Field1', '= 1')).toBeNull();
    expect(boxes.length).toBe(1);
    expect(boxes[0]).toContain('Calculated item or field could not be created because another');
    expect(calcFieldEntries(pivot).length).toBe(1);
  });

  it('Modify replaces the formula and Delete drops the field', () => {
    const { designer, pivot } = setup();
    applyCalcFieldAdd(designer, 'Field1', '= 0');
    applyCalcFieldModify(designer, 'Field1', 'Q1+Q3');
    expect(calcFieldEntries(pivot)).toEqual([{ name: 'Sum of Field1', formula: 'Q1+Q3' }]);
    applyCalcFieldDelete(designer, 'Field1');
    expect(calcFieldEntries(pivot)).toEqual([]);
  });
});

describe('TASK 77 Insert Calculated Item + Solve Order semantics', () => {
  it('Add creates the item in the field the dialog is bound to; Delete drops it', () => {
    const { designer, pivot, sheet } = setup();
    showCalculatedItem(designer);
    expect(designer.opened[0].data.sourceName).toBe('Region');
    expect(applyCalcItemAdd(designer, 'Region', 'Formula1', '= 0')).toBe('Formula1');
    expect(pivot.getCalcItems('Region').map((item: any) => [item.calcItemName, item.formula])).toEqual([['Formula1', '= 0']]);
    // Trial (measured): the new item appears in the row-field item list with its own value.
    expect(report(sheet, 7, 2)).toEqual(['Row Labels', 'Sum of Q1', 'East', 75, 'Formula1', 0, 'North', 120, 'South', 90, 'West', 110, 'Grand Total', 395]);
    applyCalcItemDelete(designer, 'Region', 'Formula1');
    expect(pivot.getCalcItems('Region')).toEqual([]);
  });

  it('the solve-order list is ordered by priority and Move Up swaps the priorities (trial probe 9)', () => {
    const { designer, pivot } = setup();
    pivot.addCalcItem('Region', 'ItemA', 'GetPivotData("Region","North")+1');
    pivot.addCalcItem('Region', 'ItemB', 'GetPivotData("Region","South")+2');
    showCalcItemSolveOrder(designer);
    expect(solveOrderEntries(pivot).map((item) => [item.calcItemName, item.priority])).toEqual([['ItemA', 1], ['ItemB', 2]]);
    moveCalcItem(designer, solveOrderEntries(pivot)[1], 'up');
    const after = pivot.getCalcItems('Region').map((item: any) => [item.calcItemName, item.priority]);
    // Trial: after Move Up the priorities answer ItemB 1 / ItemA 2 (its array keeps the storage
    // order; the priority mapping and the report order are identical on both sides).
    expect(after.map((pair: any) => pair[1]).sort()).toEqual([1, 2]);
    expect(after.find((pair: any) => pair[0] === 'ItemB')?.[1]).toBe(1);
    expect(after.find((pair: any) => pair[0] === 'ItemA')?.[1]).toBe(2);
    expect(solveOrderEntries(pivot).map((item) => item.calcItemName)).toEqual(['ItemB', 'ItemA']);
  });

  it('Move Up/Move Down at the list edges do nothing, Delete drops the selected entry', () => {
    const { designer, pivot } = setup();
    pivot.addCalcItem('Region', 'ItemA', 'GetPivotData("Region","North")+1');
    moveCalcItem(designer, solveOrderEntries(pivot)[0], 'up');
    expect(solveOrderEntries(pivot).map((item) => item.calcItemName)).toEqual(['ItemA']);
    applyCalcItemDelete(designer, 'Region', 'ItemA');
    expect(solveOrderEntries(pivot)).toEqual([]);
  });
});

describe('TASK 77 List Formulas report sheet (trial-measured layout, byte-parity proven)', () => {
  it('writes the calculated-field and calculated-item tables, the borders and the note block', () => {
    const { designer, workbook, sheet } = setup();
    const pivot = sheet.pivotTables.get('PivotTable1');
    pivot.addCalcField('FieldA', 'Q1+Q2');
    pivot.addCalcField('FieldB', '=Q3*2');
    pivot.addCalcItem('Region', 'ItemA', 'GetPivotData("Region","North")+1');
    pivot.addCalcItem('Region', 'ItemB', 'GetPivotData("Region","South")+2');
    expect(executeDesignerSpecial(designer, 'pivotTableListFormulas', undefined)).toBe(true);

    // Trial (probe 12): a new sheet appended after the report sheet, active, named by the
    // workbook counter (Sheet2 next to the single Data sheet).
    expect(workbook.getSheetCount()).toBe(2);
    expect(workbook.getActiveSheetIndex()).toBe(1);
    const report0: any = workbook.getActiveSheet();
    expect(report0.name()).toBe('Sheet2');

    const values: (string | number | null)[][] = [];
    for (let r = 0; r < 16; r++) values.push([report0.getValue(r, 0), report0.getValue(r, 1), report0.getValue(r, 2)]);
    expect(values).toEqual([
      ['Calculated Field', null, null],
      ['Solve Order', 'Field', 'Formula'],
      [0, 'FieldA', 'Q1+Q2'],
      [1, 'FieldB', '=Q3*2'],
      [null, null, null],
      ['Calculated Item', null, null],
      ['Solve Order', 'Item', 'Formula'],
      [1, 'Region[ItemA]', '=GetPivotData("Region","North")+1'],
      [2, 'Region[ItemB]', '=GetPivotData("Region","South")+2'],
      [null, null, null],
      [null, null, null],
      ['Note:', 'When a cell is updated by more than one formula,', null],
      [null, 'the value is set by the formula with the last solve order.', null],
      [null, null, null],
      [null, 'To change the solve order for multiple calculated items or fields,', null],
      [null, 'on the Options tab, in the Calculations group, click Fields, Items, & Sets, and then click Solve Order.', null],
    ]);

    // Trial geometry (probe 12 + probe 16, identical on both sides): 100 / 596 / auto-fitted C.
    expect([report0.getColumnWidth(0), report0.getColumnWidth(1)]).toEqual([100, 596]);
    expect(report0.getColumnWidth(2)).toBe(autoFitWidthFor(['=GetPivotData("Region","North")+1', '=GetPivotData("Region","South")+2', 'Formula']));

    /* Trial: only the calculated-FIELD header row carries the thin bottom border; the item
     * header row has none (probe 12 dataTable: style borderBottom {style:1} on 1,0/1,1/1,2). */
    for (const col of [0, 1, 2]) {
      const border = (report0.getStyle(1, col) as any)?.borderBottom;
      expect(border?.style, `borderBottom at 1,${col}`).toBe(1);
      expect((report0.getStyle(6, col) as any)?.borderBottom, `borderBottom at 6,${col}`).toBeFalsy();
    }
    const data = JSON.parse(JSON.stringify(report0.toJSON())).data;
    expect(JSON.stringify(data.dataTable[1])).toBe(JSON.stringify({
      0: { value: 'Solve Order', style: { borderBottom: { style: 1 } } },
      1: { value: 'Field', style: { borderBottom: { style: 1 } } },
      2: { value: 'Formula', style: { borderBottom: { style: 1 } } },
    }));
  });

  it('names the report by the REBASED counter after a baseline fromJSON reload (TASK 81 sweep session)', () => {
    /* The sweep re-loads its baseline JSON before every command row. TASK 77 measured the trial
     * naming the report sheet `Sheet2` even in a session that had already created extra sheets
     * (the official `pivotTableListFormulas` row vs our `Sheet3` — core gap 3); the core now
     * rebases the counter on fromJSON, so the designer-side naming follows the trial at 5188. */
    const { designer, workbook } = setup();
    const baseline = JSON.parse(JSON.stringify(workbook.toJSON()));
    workbook.addSheet(1);
    workbook.addSheet(2);
    workbook.removeSheet(2);
    workbook.fromJSON(baseline);
    expect(executeDesignerSpecial(designer, 'pivotTableListFormulas', undefined)).toBe(true);
    expect(workbook.getSheetCount()).toBe(2);
    const report: any = workbook.getActiveSheet();
    expect(report.name()).toBe('Sheet2'); // the trial's sweep answer
  });

  it('lists the calculated fields/items of every pivot of the sheet and still writes the note block when there are none', () => {
    const { designer, workbook, sheet } = setup();
    const P = GC.Spread.Pivot;
    sheet.pivotTables.add('PivotTable2', 'Source1', 20, 1, P.PivotTableLayoutType.compact, P.PivotTableThemes.medium2, { showRowHeader: true, showColumnHeader: true });
    const second = sheet.pivotTables.get('PivotTable2');
    second.add('Q1', 'Q1sum', P.PivotTableFieldType.valueField, GC.Pivot.SubtotalType.sum);
    second.addCalcField('SecondField', 'Q1*3');
    expect(listPivotFormulas(designer)).toBe(true);
    const report0: any = workbook.getActiveSheet();
    // Both pivots of the sheet are listed, the field numbering continues across them (probe 5C).
    expect([report0.getValue(2, 0), report0.getValue(2, 1), report0.getValue(2, 2)]).toEqual([0, 'SecondField', 'Q1*3']);
    expect(report0.getValue(3, 0)).toBe(null);
    expect(report0.getValue(4, 0)).toBe('Calculated Item');
    expect(report0.getValue(5, 1)).toBe('Item');
    expect(report0.getValue(6, 0)).toBe(null);
    expect(report0.getValue(7, 0)).toBe(null);
    expect(report0.getValue(8, 0)).toBe('Note:');
    expect(report0.getValue(8, 1)).toBe('When a cell is updated by more than one formula,');
  });
});

describe('TASK 77 PivotTable Field List follows the selection (trial-measured panel behaviour)', () => {
  function panelDesigner(sheet: any) {
    let invalidations = 0;
    const designer: any = {
      gc: GC,
      spreadsheet: sheet.parent,
      getWorkbook: () => sheet.parent,
      invalidate: () => { invalidations += 1; },
      _pivotFieldListOpen: false,
      _pivotFieldListMounted: false,
      _pivotFieldListFollow: true,
      _pivotFieldListName: null as string | null,
      invalidations: () => invalidations,
    };
    return designer;
  }

  it('opens the panel when the selection moves into a pivot and closes it again outside', () => {
    const { sheet } = setup();
    const designer = panelDesigner(sheet);
    pivotFieldListFollowSelection(designer);
    expect(designer._pivotFieldListOpen).toBe(true);
    expect(designer._pivotFieldListMounted).toBe(true);
    expect(designer._pivotFieldListName).toBe('PivotTable1');
    const opened = designer.invalidations();
    // A selection that stays inside the pivot does not toggle the panel.
    pivotFieldListFollowSelection(designer);
    expect(designer._pivotFieldListOpen).toBe(true);
    expect(designer.invalidations()).toBe(opened);
    sheet.setSelection(1, 1, 1, 1);
    sheet.setActiveCell(1, 1);
    pivotFieldListFollowSelection(designer);
    expect(designer._pivotFieldListOpen).toBe(false);
    expect(designer._pivotFieldListName).toBe(null);
    // An auto-close keeps the follow mode: re-entering the pivot re-opens the panel (trial:
    // probe t77-follow.json `click-into` — panel width back to 314, active tab stays Home).
    sheet.setSelection(8, 1, 1, 1);
    sheet.setActiveCell(8, 1);
    pivotFieldListFollowSelection(designer);
    expect(designer._pivotFieldListOpen).toBe(true);
    expect(designer._pivotFieldListName).toBe('PivotTable1');
  });

  it('does nothing while no pivot is under the active cell', () => {
    const { sheet } = setup();
    const designer = panelDesigner(sheet);
    sheet.setSelection(1, 1, 1, 1);
    sheet.setActiveCell(1, 1);
    pivotFieldListFollowSelection(designer);
    expect(designer._pivotFieldListOpen).toBe(false);
    expect(designer.invalidations()).toBe(0);
  });

  it('a selection into a pivot stays blocked while follow mode is disarmed (trial manual-close rule)', () => {
    const { sheet } = setup();
    const designer = panelDesigner(sheet);
    designer._pivotFieldListFollow = false;
    pivotFieldListFollowSelection(designer);
    expect(designer._pivotFieldListOpen).toBe(false);
    expect(designer.invalidations()).toBe(0);
    // Opening the panel again through the command re-arms the follow mode.
    executeDesignerSpecial(designer, 'pivotTableFieldList', undefined);
    expect(designer._pivotFieldListOpen).toBe(true);
    expect(designer._pivotFieldListFollow).toBe(true);
  });

  it('the Field List command toggles on an active pivot and disarms the follow on a manual close', () => {
    const { sheet } = setup();
    const designer = panelDesigner(sheet);
    executeDesignerSpecial(designer, 'pivotTableFieldList', undefined);
    expect(designer._pivotFieldListOpen).toBe(true);
    expect(designer._pivotFieldListName).toBe('PivotTable1');
    executeDesignerSpecial(designer, 'pivotTableFieldList', undefined);
    expect(designer._pivotFieldListOpen).toBe(false);
    expect(designer._pivotFieldListName).toBe(null);
    // Manual close disarms: a later selection into the pivot does not re-open (trial: probe
    // t77-manualclose.json — Field List toggle close AND the panel X button both keep `click
    // -into pivot` closed, panel width 0).
    pivotFieldListFollowSelection(designer);
    expect(designer._pivotFieldListOpen).toBe(false);
  });

  it('a Field List command without an active pivot is a no-op that also disarms the follow', () => {
    const { sheet } = setup();
    const designer = panelDesigner(sheet);
    sheet.setSelection(1, 1, 1, 1);
    sheet.setActiveCell(1, 1);
    executeDesignerSpecial(designer, 'pivotTableFieldList', undefined);
    expect(designer._pivotFieldListOpen).toBe(false);
    expect(designer._pivotFieldListFollow).toBe(false);
    // ...and the selection-follow stays blocked even when the selection re-enters the pivot
    // (trial: probe t77-reopen.json `v3-official` — cmd no-op then a grid click into the pivot
    // leaves panelW 0).
    sheet.setSelection(8, 1, 1, 1);
    sheet.setActiveCell(8, 1);
    pivotFieldListFollowSelection(designer);
    expect(designer._pivotFieldListOpen).toBe(false);
  });

  it('a field-list drop activates the pivot: the selection jumps to its top-left cell', () => {
    const { sheet, pivot } = setup();
    sheet.setSelection(1, 1, 1, 1);
    sheet.setActiveCell(1, 1);
    activatePivotAtPanelDrop(panelDesigner(sheet), pivot);
    const sel = sheet.getSelections()[0];
    expect([sel.row, sel.col, sel.rowCount, sel.colCount]).toEqual([8, 1, 1, 1]);
    // The panel-hidden drop of the paired pivot-designer.spec `item 2` flow then re-opens the
    // panel through the follow rule (trial t77-reopen `v1-official`).
    const panel = panelDesigner(sheet);
    pivotFieldListFollowSelection(panel);
    expect(panel._pivotFieldListOpen).toBe(true);
  });
});

/** Defaults the trial prefills in the Insert Calculated Field dialog (Name Field1, Formula "= 0"). */
function openCalcFieldDefaults(designer: any): { name: string; formula: string } {
  const record = designer.opened[designer.opened.length - 1];
  return { name: String(record.data.name), formula: String(record.data.formula) };
}

/**
 * The width our core's autoFitColumn gives the longest of these strings - the same public call
 * the command makes, measured on a scratch sheet, so the assertion pins "column C is auto-fitted
 * to the longest formula" without hard-coding one host's text metrics.
 */
function autoFitWidthFor(texts: string[]): number {
  const scratch = new GC.Spread.Sheets.Workbook().getActiveSheet();
  texts.forEach((text, row) => scratch.setValue(row, 0, text));
  scratch.autoFitColumn(0);
  return scratch.getColumnWidth(0);
}
