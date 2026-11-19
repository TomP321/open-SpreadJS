// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * TASK 64: the former "not implemented in this milestone" stubs — Insert
 * Function (fx), the Name Box dropdown, Go To / Go To Special, Series and the
 * Ctrl+F/Ctrl+H chords. Expectations follow the v19 trial measured black-box
 * (see docs/STATUS.md, TASK 64):
 *  - Go To Special works inside the current selection (whole sheet for a lone
 *    cell), reports `No cells were found.` when nothing matches and selects
 *    the bounding block of the matches (e.g. Formulas in A1:F5 -> F2:F5).
 *  - Series Linear step 1 from B2=120 fills 120..126 (trial parity, paired
 *    spec task64-dialogs.spec.ts).
 *  - The name box dropdown lists workbook- and sheet-scope names; picking one
 *    selects its range and shows the name in the box until the cursor moves.
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import GC from '@mescius/spread-sheets';
import { DesignerContext } from '../src/store.js';
import { FormulaBar } from '../src/app.js';
import { executeDesignerSpecial } from '../src/designer-commands.js';
import { showGoTo, showGoToSpecial, showInsertFunction, showSeries } from '../src/designer-data-dialogs.js';
import { insertFormula, openFunctionArguments } from '../src/designer-data-dialogs.js';
import {
  computeSpecialSelection, gotoNameItems, parseReference, resolveReference, specialScope, type GoToSpecialData,
} from '../src/dialogs/GoToDialogs.js';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', { value: () => null, configurable: true });

function makeSheet(workbook: GC.Spread.Sheets.Workbook) {
  const sheet = workbook.getActiveSheet();
  const rows = [
    ['Region', 'Q1', 'Q2', 'Q3', 'Q4', 'Total'],
    ['North', 120, 135, 150, 165, null],
    ['South', 90, 105, 95, 125, null],
    ['East', 75, 80, 90, 100, null],
    ['West', 110, 115, 105, 130, null],
  ];
  rows.forEach((row, r) => row.forEach((value, c) => { if (value !== null) sheet.setValue(r, c, value); }));
  for (let r = 1; r <= 4; r++) sheet.setFormula(r, 5, `=SUM(B${r + 1}:E${r + 1})`);
  workbook.calculate();
  return sheet;
}

interface Recorded { name: string; data: any; ok: (data: any) => void }

function makeDesigner(workbook: GC.Spread.Sheets.Workbook) {
  const opened: Recorded[] = [];
  const boxes: { text: string; title: string }[] = [];
  const d: any = {
    gc: GC,
    spreadsheet: workbook,
    getWorkbook: () => workbook,
    invalidate: () => undefined,
    opened,
    boxes,
    showDialog: (name: string, data: any, success: (data: any) => void) => {
      const record: Recorded = { name, data, ok: success };
      opened.push(record);
      return record;
    },
    showMessageBox: (text: string, title: string) => { boxes.push({ text, title }); },
    closeDialog: () => undefined,
    setNameBoxSelection: (name: string, row: number, col: number) => { d._nameBox = { name, row, col }; },
    getNameBoxSelection: () => d._nameBox ?? null,
    _nameBox: null as { name: string; row: number; col: number } | null,
    showGoTo: () => showGoTo(d),
    showGoToSpecial: () => showGoToSpecial(d),
    showSeries: () => showSeries(d),
    findController: { open: (mode: string) => { d.findMode = mode; } },
  };
  return d;
}

const special = (data: Partial<GoToSpecialData>): GoToSpecialData =>
  ({ option: 'notes', numbers: true, text: true, logicals: true, errors: true, level: 'direct', ...data });

describe('parseReference / resolveReference', () => {
  let workbook: GC.Spread.Sheets.Workbook;
  beforeEach(() => { workbook = new GC.Spread.Sheets.Workbook(); workbook.setSheetCount(2); });
  afterEach(() => workbook.destroy?.());

  it('parses plain and absolute references', () => {
    expect(parseReference('B2')).toEqual({ row: 1, col: 1, rowCount: 1, colCount: 1 });
    expect(parseReference('$B$2:$B$5')).toEqual({ row: 1, col: 1, rowCount: 4, colCount: 1 });
    expect(parseReference('sheet2!C3:D4')).toEqual({ row: 2, col: 2, rowCount: 2, colCount: 2 });
    expect(parseReference('not a ref')).toBeNull();
  });

  it('resolves workbook- and sheet-scope names and plain references', () => {
    workbook.addCustomName('Sales', "='Sheet1'!$B$2:$B$5", 0, 0);
    workbook.getSheet(0).addCustomName('NorthCell', "='Sheet1'!$B$2", 0, 0);
    const d = makeDesigner(workbook);
    expect(resolveReference(d, 'Sales')).toMatchObject({ bounds: { row: 1, col: 1, rowCount: 4, colCount: 1 }, name: 'Sales' });
    expect(resolveReference(d, 'NorthCell')).toMatchObject({ bounds: { row: 1, col: 1, rowCount: 1, colCount: 1 }, name: 'NorthCell' });
    expect(resolveReference(d, 'D3')).toMatchObject({ bounds: { row: 2, col: 3, rowCount: 1, colCount: 1 } });
    expect(resolveReference(d, '')).toBeNull();
  });

  it('lists Go To names workbook-scope first (trial order)', () => {
    workbook.addCustomName('zeta', '=$A$1', 0, 0);
    workbook.getSheet(0).addCustomName('alpha', '=$B$2', 0, 0);
    workbook.addCustomName('beta', '=$A$2', 0, 0);
    expect(gotoNameItems(makeDesigner(workbook))).toEqual(['zeta', 'beta', 'alpha']);
  });
});

describe('Go To dialog', () => {
  let workbook: GC.Spread.Sheets.Workbook;
  let sheet: GC.Spread.Sheets.Worksheet;
  let d: any;
  beforeEach(() => {
    workbook = new GC.Spread.Sheets.Workbook();
    workbook.setSheetCount(1);
    sheet = makeSheet(workbook);
    d = makeDesigner(workbook);
    sheet.setSelection(1, 1, 1, 1);
  });
  afterEach(() => workbook.destroy?.());

  it('the goto command opens the goto dialog template', () => {
    expect(executeDesignerSpecial(d, 'goto', undefined)).toBe(true);
    expect(d.opened[0].name).toBe('gotoDialogTemplate');
  });

  it('OK with a name selects its range and remembers it for the name box', () => {
    workbook.addCustomName('Sales', "='Sheet1'!$B$2:$B$5", 0, 0);
    showGoTo(d);
    d.opened[0].ok({ reference: 'Sales' });
    expect(sheet.getSelections().map((r) => [r.row, r.col, r.rowCount, r.colCount])).toEqual([[1, 1, 4, 1]]);
    expect(d._nameBox).toEqual({ name: 'Sales', row: 1, col: 1 });
  });

  it('OK with a plain reference selects it; an invalid one reports', () => {
    showGoTo(d);
    d.opened[0].ok({ reference: 'D2:E3' });
    expect(sheet.getSelections().map((r) => [r.row, r.col, r.rowCount, r.colCount])).toEqual([[1, 3, 2, 2]]);
    showGoTo(d);
    d.opened[1].ok({ reference: '???' });
    expect(d.boxes[0]).toMatchObject({ title: 'Go To' });
  });
});

describe('Go To Special selection semantics (trial-measured)', () => {
  let workbook: GC.Spread.Sheets.Workbook;
  let sheet: GC.Spread.Sheets.Worksheet;
  let d: any;
  beforeEach(() => {
    workbook = new GC.Spread.Sheets.Workbook();
    workbook.setSheetCount(1);
    sheet = makeSheet(workbook);
    d = makeDesigner(workbook);
    // setSelection makes the top-left cell active; a following setActiveCell would collapse it.
    sheet.setSelection(0, 0, 5, 6);
  });
  afterEach(() => workbook.destroy?.());

  const run = (data: Partial<GoToSpecialData>) => computeSpecialSelection(d, special(data));

  it('a lone-cell scope searches the whole sheet, larger selections stay inside', () => {
    sheet.setSelection(1, 1, 1, 1);
    expect(specialScope(sheet)).toMatchObject({ row: 0, col: 0, rowCount: 200, colCount: 20 });
    sheet.setSelection(0, 0, 5, 6);
    expect(specialScope(sheet)).toEqual({ row: 0, col: 0, rowCount: 5, colCount: 6 });
  });

  it('Formulas selects the formula block (F2:F5, active F2)', () => {
    expect(run({ option: 'formulas' })).toMatchObject({ ranges: [{ row: 1, col: 5, rowCount: 4, colCount: 1 }], active: { row: 1, col: 5 } });
  });

  it('Constants Numbers-only skips text and formula cells', () => {
    expect(run({ option: 'constants', text: false, logicals: false, errors: false })).toMatchObject({ ranges: [{ row: 1, col: 1, rowCount: 4, colCount: 4 }] });
  });

  it('Blanks, Last cell and Current region', () => {
    sheet.setValue(3, 3, null);
    sheet.setValue(4, 4, null);
    expect(run({ option: 'blanks' })).toMatchObject({ ranges: [{ row: 3, col: 3, rowCount: 2, colCount: 2 }] });
    sheet.setActiveCell(1, 1);
    expect(run({ option: 'lastCell' })).toMatchObject({ ranges: [{ row: 4, col: 5, rowCount: 1, colCount: 1 }], active: { row: 4, col: 5 } });
    expect(run({ option: 'currentRegion' })).toMatchObject({ ranges: [{ row: 0, col: 0, rowCount: 5, colCount: 6 }] });
  });

  it('Precedents (direct) of F2 are B2:E2; All levels walks further', () => {
    sheet.setActiveCell(1, 5);
    expect(run({ option: 'precedents' })).toMatchObject({ ranges: [{ row: 1, col: 1, rowCount: 1, colCount: 4 }] });
    sheet.setActiveCell(1, 1);
    const dependents = run({ option: 'dependents' });
    expect(dependents!.ranges.some((r) => r.col === 5 && r.row === 1)).toBe(true);
  });

  it('Row differences picks the changed rows; Data validation the validated cells', () => {
    sheet.setValue(2, 0, 'North'); // row 3 now equals row 2 in column A
    const rowDiff = run({ option: 'rowDifferences' });
    expect(rowDiff!.ranges.length).toBeGreaterThan(0);
    const between = (GC.Spread.Sheets as any).ConditionalFormatting.ComparisonOperators.between;
    sheet.setDataValidator(2, 1, GC.Spread.Sheets.DataValidation.createNumberValidator(between, '0', '1000', true));
    sheet.setDataValidator(4, 1, GC.Spread.Sheets.DataValidation.createNumberValidator(between, '0', '1000', true));
    const validated = run({ option: 'dataValidation' });
    expect(validated).toMatchObject({ ranges: [{ row: 2, col: 1, rowCount: 3, colCount: 1 }] });
  });

  it('Notes finds commented cells; Objects selects the shapes', () => {
    expect(run({ option: 'notes' })).toBeNull();
    sheet.comments.add(1, 1, 'hi');
    expect(run({ option: 'notes' })).toMatchObject({ ranges: [{ row: 1, col: 1, rowCount: 1, colCount: 1 }] });
    expect(run({ option: 'objects' })).toBeNull();
    sheet.shapes.add('S1', GC.Spread.Sheets.Shapes.AutoShapeType.rectangle, 10, 10, 30, 30);
    run({ option: 'objects' });
    expect(sheet.shapes.all()[0].isSelected()).toBe(true);
  });

  it('the gotoSpecial command opens the template and OK with no match reports No cells were found.', () => {
    sheet.setSelection(1, 1, 1, 1);
    sheet.setActiveCell(0, 0);
    for (let r = 0; r < 200; r++) for (let c = 0; c < 40; c++) sheet.clear(r, c, 1, 1, GC.Spread.Sheets.SheetArea.viewport, GC.Spread.Sheets.StorageType.data);
    expect(executeDesignerSpecial(d, 'gotoSpecial', undefined)).toBe(true);
    expect(d.opened[0].name).toBe('gotoSpecialDialogTemplate');
    d.opened[0].ok(special({ option: 'formulas' }));
    expect(d.boxes[0]).toEqual({ text: 'No cells were found.', title: 'SpreadJS Designer' });
  });
});

describe('Insert Function -> Function Arguments', () => {
  it('OK advances to Function Arguments; its OK writes =NAME(...) into the active cell', () => {
    const workbook = new GC.Spread.Sheets.Workbook();
    workbook.setSheetCount(1);
    const sheet = workbook.getActiveSheet();
    sheet.setValue(0, 1, 7); // B1
    sheet.setValue(0, 3, 5); // D1
    const opened: Recorded[] = [];
    const edits: { command: string; arg: any }[] = [];
    const d: any = {
      gc: GC, getWorkbook: () => workbook, invalidate: () => undefined, _rangePick: null, opened,
      showDialog: (name: string, data: any, ok: (data: any) => void) => { const r = { name, data, ok }; opened.push(r); return r; },
      runUndoable: (command: string, arg: any) => { edits.push({ command, arg }); },
      openFunctionArguments: (name: string) => openFunctionArguments(d, name),
      insertFormula: (formula: string) => insertFormula(d, formula),
    };
    showInsertFunction(d);
    expect(d.opened[0].name).toBe('insertFunctionDialogTemplate');
    d.opened[0].ok({ function: 'SUM' });
    expect(d.opened[1].name).toBe('moreFunctionDialogTemplate');
    d.opened[1].ok({ args: ['=B1', '=D1'] });
    // The trial's `Insert Function -> Function Arguments -> OK` chain lands as one undoable cell edit.
    expect(edits).toEqual([{ command: 'editCell', arg: { row: 0, col: 0, value: '=SUM(B1,D1)' } }]);
    workbook.destroy?.();
  });
});

describe('Series dialog', () => {
  let workbook: GC.Spread.Sheets.Workbook;
  let sheet: GC.Spread.Sheets.Worksheet;
  let d: any;
  beforeEach(() => {
    workbook = new GC.Spread.Sheets.Workbook();
    workbook.setSheetCount(1);
    sheet = workbook.getActiveSheet();
    sheet.setValue(1, 1, 120);
    sheet.setSelection(1, 1, 7, 1);
    d = makeDesigner(workbook);
  });
  afterEach(() => workbook.destroy?.());

  it('the series command opens fillSeriesDialogTemplate defaulting to Columns/Linear', () => {
    expect(executeDesignerSpecial(d, 'series', undefined)).toBe(true);
    expect(d.opened[0].name).toBe('fillSeriesDialogTemplate');
    expect(d.opened[0].data).toMatchObject({ seriesIn: 'columns', type: 'linear', step: '1' });
  });

  it('Linear step 1 fills 120..126 down the selection (trial parity)', () => {
    showSeries(d);
    d.opened[0].ok({ seriesIn: 'columns', type: 'linear', unit: 'day', trend: false, step: '1', stop: '' });
    expect(Array.from({ length: 7 }, (_, i) => sheet.getValue(1 + i, 1))).toEqual([120, 121, 122, 123, 124, 125, 126]);
  });

  it('Growth step 2 and a Stop Value stop the fill before the first value past it', () => {
    showSeries(d);
    d.opened[0].ok({ seriesIn: 'columns', type: 'growth', unit: 'day', trend: false, step: '2', stop: '400' });
    expect(Array.from({ length: 7 }, (_, i) => sheet.getValue(1 + i, 1))).toEqual([120, 240, null, null, null, null, null]);
  });

  it('Rows fills to the right', () => {
    sheet.setSelection(1, 1, 1, 4);
    showSeries(d);
    d.opened[0].ok({ seriesIn: 'rows', type: 'linear', unit: 'day', trend: false, step: '5', stop: '' });
    expect(Array.from({ length: 4 }, (_, i) => sheet.getValue(1, 1 + i))).toEqual([120, 125, 130, 135]);
  });

  it('the trial keeps the last dialog options: after a column fill a 1x4 selection still opens on Columns', () => {
    showSeries(d);
    d.opened[0].ok({ seriesIn: 'columns', type: 'linear', unit: 'day', trend: false, step: '1', stop: '' });
    sheet.setSelection(1, 1, 1, 4);
    showSeries(d);
    expect(d.opened[1].data).toMatchObject({ seriesIn: 'columns', type: 'linear', step: '1' });
  });
});

describe('formula bar: fx button and name box dropdown', () => {
  let workbook: GC.Spread.Sheets.Workbook;
  let designer: any;
  let host: HTMLElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    workbook = new GC.Spread.Sheets.Workbook();
    workbook.setSheetCount(1);
    makeSheet(workbook);
    let version = 0;
    const listeners = new Set<() => void>();
    designer = {
      gc: GC,
      getWorkbook: () => workbook,
      subscribe: (cb: () => void) => { listeners.add(cb); return (): void => { listeners.delete(cb); }; },
      getVersion: () => version,
      invalidate: () => { version++; for (const cb of listeners) cb(); },
      commitReference: () => undefined,
      commitFormula: () => undefined,
      showMessageBox: () => undefined,
      showInsertFunction: () => { designer.insertFunctionCalls = (designer.insertFunctionCalls ?? 0) + 1; },
      insertFunctionCalls: 0,
      setNameBoxSelection: (name: string, row: number, col: number) => { designer._nameBox = { name, row, col }; },
      getNameBoxSelection: () => designer._nameBox ?? null,
      _formulaInsertion: null,
    };
    host = document.createElement('div');
    root = createRoot(host);
    act(() => root.render(React.createElement(DesignerContext.Provider, { value: designer }, React.createElement(FormulaBar))));
  });

  afterEach(() => {
    act(() => root.unmount());
    workbook.destroy?.();
  });

  it('the fx button opens the Insert Function dialog', () => {
    act(() => host.querySelector<HTMLButtonElement>('button.fx')!.click());
    expect(designer.insertFunctionCalls).toBe(1);
  });

  it('the name box dropdown lists the defined names and selecting one ranges + names the box', () => {
    const sheet = workbook.getActiveSheet();
    sheet.setSelection(1, 1, 1, 1);
    workbook.addCustomName('Sales', "='Sheet1'!$B$2:$B$5", 0, 0);
    sheet.addCustomName('NorthCell', "='Sheet1'!$B$2", 0, 0);
    act(() => designer.invalidate());
    expect(host.querySelector('.gc-name-box-dropdown')).toBeNull();
    act(() => host.querySelector<HTMLElement>('.gc-designer-namebox-arrow')!.click());
    const items = [...host.querySelectorAll('.gc-name-box-dropdown-item')];
    expect(items.map((item) => item.textContent)).toEqual(['NorthCell', 'Sales']);
    act(() => (items[1] as HTMLElement).click());
    expect(sheet.getSelections().map((r) => [r.row, r.col, r.rowCount, r.colCount])).toEqual([[1, 1, 4, 1]]);
    expect(designer._nameBox).toEqual({ name: 'Sales', row: 1, col: 1 });
    expect(host.querySelector<HTMLInputElement>('.gc-name-box-selector')!.value).toBe('Sales');
  });
});
