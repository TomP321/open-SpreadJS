/**
 * TASK 93 item 3: the extended sparkline formulas (Insert > Sparklines).
 * Black-box measurements on the trial (apps/designer-compare `?side=official`):
 *  - the generic Create Sparklines dialog (349x248, Data Range + Location Range
 *    + a checked `isFormulaSparkline` checkbox) is used for LINE/AREA/COLUMN/
 *    WINLOSS/PIE/STACKED/CASCADE/PARETO/HISTOGRAM/SCATTER/SPREADS/BOXPLOT;
 *  - MONTH/YEAR/BULLET/GAUGE/PROGRESS/RANGEBLOCK/VARIANCE/LOLLIPOP/HBAR/VBAR/
 *    IMAGE open a dedicated per-argument dialog (Month 508x251 ->
 *    `=MONTHSPARKLINE(,1,L2,"lightgray","lightgreen","green","darkgreen")`,
 *    GaugeKPI 578x380, Bullet 488x267, HBar 298x167, ... measured);
 *  - unchecked isFormulaSparkline with LINE/COLUMN/WINLOSS creates a CLASSIC
 *    sparkline (no formula, the classic "Sparkline" contextual tab appears).
 */
// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it } from 'vitest';
import GC from '@mescius/spread-sheets';
import { Designer } from '../src/designer.js';
import { executeDesignerSpecial } from '../src/designer-commands.js';
import { applyInsertAction } from '../src/commands/insert.js';
import { showSparklineDialog } from '../src/designer-shapes.js';
import { formulaSparklineText } from '../src/dialogs/FormulaSparklineDialogs.js';
import { SPARKLINE_COMMAND_FUNCTIONS } from '../src/sparkline-dialog-specs.js';
import { englishResources } from '../src/resources.js';
import { stubCanvas2d } from './canvas-stub.js';

stubCanvas2d();

let sheet: any, d: any;
beforeEach(() => {
  const workbook = new GC.Spread.Sheets.Workbook();
  workbook.setSheetCount(1);
  sheet = workbook.getActiveSheet();
  sheet.name('Data');
  [10, 20, 30, 25].forEach((v, c) => sheet.setValue(1, 1 + c, v));
  d = Object.assign(Object.create(Designer.prototype), {
    gc: GC, getWorkbook: () => workbook, invalidate: () => undefined, resources: englishResources,
  });
  sheet.setActiveCell(3, 13);
  sheet.setSelection(3, 13, 1, 1);
});

describe('TASK 93 extended sparklines', () => {
  it('routes every Insert > Sparklines command to its dialog function', () => {
    const seen: [string, string][] = [];
    const designer = Object.assign(Object.create(Designer.prototype), {
      gc: GC, getWorkbook: () => sheet.parent, showSparklineDialog: (fn: string) => seen.push([fn, '']),
    });
    for (const [command, fn] of Object.entries(SPARKLINE_COMMAND_FUNCTIONS)) {
      expect(executeDesignerSpecial(designer as any, command, undefined)).toBe(true);
      seen[seen.length - 1][1] = command;
      void fn;
    }
    expect(Object.fromEntries(seen.map(([fn, command]) => [command, fn]))).toEqual(SPARKLINE_COMMAND_FUNCTIONS);
  });

  it('the custom dialogs write the trial-shaped formula into the location cell', () => {
    // MONTH: trial reference MONTHSPARKLINE(,1,L2,"lightgray","lightgreen","green","darkgreen").
    expect(formulaSparklineText('MONTHSPARKLINE', { fields: { year: '', month: '1', data: 'B2:E2' } }))
      .toBe('=MONTHSPARKLINE(,1,B2:E2,"lightgray","lightgreen","green","darkgreen")');
    const opened: any[] = [];
    const designer: any = Object.assign(Object.create(Designer.prototype), {
      gc: GC, getWorkbook: () => sheet.parent, resources: englishResources,
      showDialog: (name: string, data: any, success: (data: any) => void) => { opened.push({ name, data, ok: success }); },
      runUndoable: (name: string, options: any) => applyInsertAction(designer, name, options),
    });
    showSparklineDialog(designer, 'MONTHSPARKLINE');
    expect(opened[0].name).toBe('formulaSparklineDialogTemplate');
    expect(opened[0].data.fields).toMatchObject({ month: '1' });
    opened[0].ok({ ...opened[0].data, fields: { year: '', month: '1', data: 'B2:E2' }, locationRange: 'N4' });
    expect(sheet.getFormula(3, 13)).toBe('MONTHSPARKLINE(,1,B2:E2,"lightgray","lightgreen","green","darkgreen")');
    // GAUGE: the four value slots + TRUE + the empty label slots + angles/radius.
    expect(formulaSparklineText('GAUGEKPISPARKLINE', { fields: { targetValue: 'B2', currentValue: 'C2', minValue: '0', maxValue: '100', showLabel: 'TRUE', minAngle: '-90', maxAngle: '90', radiusRatio: '0' } }))
      .toBe('=GAUGEKPISPARKLINE(B2,C2,0,100,TRUE,,,,,,-90,90,0)');
    // BULLET: seven arguments like the trial's dialog.
    expect(formulaSparklineText('BULLETSPARKLINE', { fields: { measure: 'B2', target: 'C2', maxi: '100', good: '80', bad: '40', forecast: 'B3', tickUnit: '10' } }))
      .toBe('=BULLETSPARKLINE(B2,C2,100,80,40,B3,10)');
    // HBAR: the 298x167 dialog's two fields.
    expect(formulaSparklineText('HBARSPARKLINE', { fields: { value: 'B2', colorScheme: '"0"' } })).toBe('=HBARSPARKLINE(B2,"0")');
    // IMAGE: "Insert Image Function".
    expect(formulaSparklineText('IMAGE', { fields: { source: '"pic.png"', altText: '""', sizing: '2', height: '20', width: '40' } })).toBe('=IMAGE("pic.png","",2,20,40)');
  });

  it('blank location takes the active cell; extended generics write one formula', () => {
    applyInsertAction(d, 'applyFormulaSparkline', {
      data: { sparklineFunction: 'PROGRESSSPARKLINE', fields: { value: 'B2', mode: '1' }, locationRange: '' },
    });
    expect(sheet.getFormula(3, 13)).toBe('PROGRESSSPARKLINE(B2,1)');
    applyInsertAction(d, 'applySparklines', {
      data: { sparklineFunction: 'SCATTERSPARKLINE', dataRange: 'B2:E2', locationRange: 'P4', isFormulaSparkline: true },
    });
    expect(sheet.getFormula(3, 15)).toBe('SCATTERSPARKLINE(B2:E2)');
  });

  it('the generic dialog opens with isFormulaSparkline checked', () => {
    const opened: any[] = [];
    const designer: any = Object.assign(Object.create(Designer.prototype), {
      gc: GC, getWorkbook: () => sheet.parent, resources: englishResources,
      showDialog: (name: string, data: any) => { opened.push({ name, data }); },
      runUndoable: () => undefined,
    });
    showSparklineDialog(designer, 'AREASPARKLINE');
    expect(opened[0].name).toBe('createSparklinesDialogTemplate');
    expect(opened[0].data.isFormulaSparkline).toBe(true);
  });

  it('unchecked isFormulaSparkline creates CLASSIC sparklines instead of formulas', () => {
    applyInsertAction(d, 'applySparklines', {
      data: { sparklineFunction: 'COLUMNSPARKLINE', dataRange: 'B2:E2', locationRange: 'Q4', isFormulaSparkline: false },
    });
    expect(sheet.getFormula(3, 16)).toBeFalsy();
    const spark = sheet.getSparkline(3, 16);
    expect(spark).toBeTruthy();
    expect(Number(spark.sparklineType())).toBe(1);
  });
});
