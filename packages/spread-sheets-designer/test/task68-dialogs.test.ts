// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * TASK 68: the dialog pairwise sweep fixes. Expectations follow the v19 trial
 * measured black-box (docs/STATUS.md, TASK 68; screenshots .probe/t68/pairs*):
 *  - the trial's commandMap names (`insertCells`, `rowHeight`, `defaultRowHeight`,
 *    `indicatorPage`, `defineName`, `barCodeSetting`, `addCellState`,
 *    `insertSlicer`, `moveChartDialog`, ...) open their dialogs through the
 *    public `executeCommand` too;
 *  - closing a dialog with Cancel/Escape is silent: NO "Error: Cancelled"
 *    message box (the systemic pollution the sweep exposed);
 *  - Standard Height/Width write the sheet default via `setRowHeight(-1)` /
 *    `setColumnWidth(-1)`;
 *  - Create Table expands a lone cell to the current region in absolute style;
 *  - Create Sparklines defaults the data range to the current region.
 */
import { describe, expect, it } from 'vitest';
import GC from '@mescius/spread-sheets';
import { executeDesignerCommand, executeDesignerSpecial } from '../src/designer-commands.js';
import { applyBuiltin } from '../src/commands/actions.js';
import { showInsertCellsDialog, showDeleteCellsDialog } from '../src/designer-dialogs.js';
import { showDefaultDimensionDialog, showDimensionDialog, showProtectSheet } from '../src/designer-sheet-dialogs.js';
import {
  showGoalSeek, showInsertSlicerDialog, showInsertTable, showNewName, showSubtotal, showTextToColumns,
} from '../src/designer-data-dialogs.js';
import { showBarcodeDialog, showChartCommandDialog } from '../src/designer-shapes.js';
import { addCellState, showManageCellStatesDialog } from '../src/designer-custom-styles.js';
import { showPageSetup } from '../src/designer-print.js';

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
  sheet.setActiveCell(1, 1);
  return sheet;
}

interface Opened { name: string; data: any; ok: (data: any) => void }

function makeDesigner(workbook: GC.Spread.Sheets.Workbook) {
  const opened: Opened[] = [];
  const boxes: { text: string; title: string }[] = [];
  const d: any = {
    gc: GC,
    spreadsheet: workbook,
    getWorkbook: () => workbook,
    invalidate: () => undefined,
    dialog: null as any,
    _recentCommands: [],
    _cellStatesDraft: null,
    _pageSetupSynced: new WeakSet(),
    _settingsBefore: null,
    opened,
    boxes,
    getCommand: () => undefined,
    executeSpecial: (name: string, value: unknown) => executeDesignerSpecial(d, name, value),
    runUndoable: (_name: string, _args: any) => undefined,
    print: () => undefined,
    showCameraDialog: () => undefined,
    showSparklineDialog: () => undefined,
    showDialog: (name: string, data: any, success: (data: any) => void, error?: (error: unknown) => void) => {
      const record: Opened = { name, data, ok: success };
      opened.push(record);
      d.dialog = { name, data, success, error: error ?? (() => undefined) };
      return record;
    },
    /** Mirrors Designer.closeDialog: submit runs success (failures reach the
     *  error callback like DialogHost does), cancel rejects with 'Cancelled'. */
    closeDialog: (name: string, submit: boolean) => {
      const dialog = d.dialog;
      d.dialog = null;
      if (!dialog) return;
      if (submit) {
        try { dialog.success?.(dialog.data); } catch (error) { dialog.error?.(error); }
      } else dialog.error?.(new Error('Cancelled'));
    },
    showMessageBox: (text: string, title: string) => { boxes.push({ text, title }); },
    executeCommand: (name: string, property?: string, value?: unknown) => executeDesignerCommand(d, name, property, value),
  };
  /* Real openers so the routing test observes the actual template names. */
  const real: Record<string, (...args: any[]) => void> = {
    showInsertCellsDialog, showDeleteCellsDialog, showDimensionDialog, showDefaultDimensionDialog,
    showProtectSheet, showPageSetup, showInsertTable, showGoalSeek, showSubtotal, showTextToColumns,
    showManageCellStatesDialog, showInsertSlicerDialog, showBarcodeDialog, showChartCommandDialog, addCellState,
    showNewName,
  };
  for (const [key, fn] of Object.entries(real)) d[key] = (...args: any[]) => fn(d, ...args);
  return d;
}

function makeAll() {
  const workbook = new GC.Spread.Sheets.Workbook();
  const sheet = makeSheet(workbook);
  return { workbook, sheet, d: makeDesigner(workbook) };
}

describe('TASK 68 executeCommand routing (official commandMap names)', () => {
  it('opens the trial dialogs for the formerly dead command names', () => {
    const { d } = makeAll();
    const expectations: [string, string][] = [
      ['insertCells', 'insertCellsDialogTemplate'],
      ['deleteCells', 'deleteCellsDialogTemplate'],
      ['rowHeight', 'rowHeightDialogTemplate'],
      ['columnWidth', 'columnWidthDialogTemplate'],
      ['defaultRowHeight', 'defaultRowHeightDialogTemplate'],
      ['defaultColumnWidth', 'defaultColumnWidthDialogTemplate'],
      ['indicatorPage', 'pageSetupDialog'],
      ['defineName', 'newNameTemplate'],
      ['cellStates', 'cellStateManagerTemplate'],
      ['manageCellState', 'cellStateManagerTemplate'],
      ['insertSlicer', 'insertSlicerDialogTemplate'],
      ['barCodeSetting', 'barcodeDialogTemplate'],
      ['moveChartDialog', 'moveChartDialogTemplate'],
      ['protectSheet', 'protectSheetDialogTemplate'],
      ['goalSeek', 'GoalSeekDialogTemplate'],
      ['subtotal', 'subTotalDialogTemplate'],
    ];
    for (const [command, template] of expectations) {
      d.opened.length = 0;
      expect(d.executeCommand(command), command).toBe(true);
      expect(d.opened.map((o: Opened) => o.name), command).toContain(template);
    }
  });

  it('chart dialog commands resolve the chart (no chart: only Move Chart opens)', () => {
    const { d } = makeAll();
    d.executeCommand('changeChartTypeDialog');
    expect(d.opened).toHaveLength(0);
    d.executeCommand('selectData');
    expect(d.opened).toHaveLength(0);
    d.executeCommand('moveChartDialog');
    expect(d.opened.map((o: Opened) => o.name)).toContain('moveChartDialogTemplate');
  });

  it('still returns false for unknown names (no accidental routing)', () => {
    const { d } = makeAll();
    expect(d.executeCommand('notARealCommandAtAll')).toBe(false);
  });
});

describe('TASK 68 no error box on Cancel', () => {
  it('closing a dialog does not show an "Error: Cancelled" message box', () => {
    const { d } = makeAll();
    for (const command of ['insertTable', 'goalSeek', 'subtotal', 'textToColumn']) {
      d.opened.length = 0;
      d.boxes.length = 0;
      d.executeCommand(command);
      expect(d.opened.length, command).toBeGreaterThan(0);
      d.closeDialog(d.opened[0]!.name, false);
      expect(d.boxes, command).toEqual([]);
    }
  });

  it('real failures still reach the message box', () => {
    const { d } = makeAll();
    d.executeCommand('goalSeek');
    d.closeDialog('GoalSeekDialogTemplate', true); // changingCell '' is invalid
    expect(d.boxes.length).toBe(1);
    expect(d.boxes[0]!.title).toBe('Goal Seek');
  });
});

describe('TASK 68 dialog defaults', () => {
  it('Create Table expands the active cell to the current region (absolute)', () => {
    const { d } = makeAll();
    d.executeCommand('insertTable');
    expect(d.opened[0]!.data.range).toBe('$A$1:$F$5');
    expect(d.opened[0]!.data.hasHeaders).toBe(true);
  });

  it('Goal Seek defaults Set cell to the absolute active cell', () => {
    const { d } = makeAll();
    d.executeCommand('goalSeek');
    expect(d.opened[0]!.data.formulaCell).toBe('$B$2');
    expect(d.opened[0]!.data.maxIterations).toBe(200);
    expect(d.opened[0]!.data.tolerance).toBe(0.001);
  });

  it('Barcode opens with the trial empty form and no type means no insert', () => {
    const { d } = makeAll();
    showBarcodeDialog(d);
    const record = d.opened[0]!;
    expect(record.data.barcodeType).toBe('');
    let inserted = false;
    d.runUndoable = (name: string) => { if (name === 'applyBarcode') inserted = true; };
    record.ok({ ...record.data });
    expect(inserted).toBe(false);
    record.ok({ ...record.data, barcodeType: 'QRCODE', value: 'hi' });
    expect(inserted).toBe(true);
  });
});

describe('TASK 68 Standard Height / Standard Width', () => {
  it('writes the sheet default through setRowHeight(-1) / setColumnWidth(-1)', () => {
    const { sheet, d } = makeAll();
    showDefaultDimensionDialog(d, 'row');
    expect(d.opened[0]!.name).toBe('defaultRowHeightDialogTemplate');
    expect(d.opened[0]!.data.size).toBe(sheet.getRowHeight(0));
    const applied: [string, any][] = [];
    d.runUndoable = (name: string, args: any) => { applied.push([name, args]); };
    d.opened[0]!.ok({ size: 30 });
    expect(applied).toEqual([['setDefaultDimensionSize', { axis: 'row', value: 30 }]]);
    // The action itself: setRowHeight(-1) changes the default for rows without an explicit height.
    applyBuiltin(d, 'setDefaultDimensionSize', { axis: 'row', value: 30 });
    expect((sheet as any).getDefaultRowHeight()).toBe(30);
    expect(sheet.getRowHeight(3)).toBe(30);
  });
});

describe('TASK 68 cell states standalone', () => {
  it('addCellState without the manager opens the editor with the current region', () => {
    const { d } = makeAll();
    addCellState(d);
    const record = d.opened[0]!;
    expect(record.name).toBe('newCellStateTemplate');
    expect(record.data.range).toBe('A1:F5');
  });
});
