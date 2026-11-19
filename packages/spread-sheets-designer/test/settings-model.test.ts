import { describe, expect, it } from 'vitest';
import GC from '@mescius/spread-sheets';
import {
  applySettings, readSettings, settingsTabForCommand, sheetSettingTabs, spreadSettingTabs,
  workbookSettingsOwner, worksheetSettingsOwner,
} from '../src/settings-model.js';

const tabKeys = (tabs: typeof spreadSettingTabs) => tabs.map((tab) => tab.key);

describe('Spread Settings model', () => {
  it('has the trial’s seven tabs', () => {
    expect(tabKeys(spreadSettingTabs)).toEqual(['general', 'scrollBars', 'calculation', 'tabStrip', 'clipboard', 'customList', 'namedPattern']);
    expect(spreadSettingTabs.map((tab) => tab.text)).toEqual(['General', 'ScrollBars', 'Calculation', 'Tab Strip', 'Clipboard', 'Custom Lists', 'Named Patterns']);
    expect(tabKeys(sheetSettingTabs)).toEqual(['general', 'gridlines', 'headers', 'sheetTab']);
    expect(sheetSettingTabs[2].subTabs?.map((entry) => entry.text)).toEqual(['Column Headers', 'Row Headers']);
  });

  it('opens each ribbon command on its own tab', () => {
    expect(settingsTabForCommand).toMatchObject({
      spreadSettingGeneral: 'general', spreadSettingScrollBar: 'scrollBars', spreadSettingCalculation: 'calculation', spreadSettingTabStrip: 'tabStrip',
      sheetSettingGeneral: 'general', sheetSettingGridLine: 'gridlines', sheetSettingHeaders: 'headers',
    });
  });

  it('reads the trial’s default workbook options', () => {
    const workbook = new GC.Spread.Sheets.Workbook();
    const values = readSettings(workbookSettingsOwner(workbook), spreadSettingTabs);
    expect(values).toMatchObject({
      allowUserDragDrop: true, allowUserDragFill: true, allowUndo: true, allowUserDragMerge: false,
      allowAutoCreateHyperlink: true, allowAutoExtendFilterRange: false, formulaFormatHint: true,
      allowUserEditFormula: true, allowUserZoom: true, allowDynamicArray: false, allowInvalidFormula: false,
      enableAccessibility: false, scrollByPixel: false, scrollPixel: 5, dynamicReferences: true, maxUndoRedoStackSize: 2147483647,
      allowDragHeaderToMove: 0, rowResizeMode: 0, columnResizeMode: 0,
      showVerticalScrollbar: true, showHorizontalScrollbar: true, scrollbarShowMax: true, scrollbarMaxAlign: false,
      useMobileScrollbar: false, scrollIgnoreHidden: false,
      referenceStyle: 0, incrementalCalculation: false, calcOnDemand: false, iterativeCalculation: true,
      iterativeCalculationMaximumIterations: 1000, iterativeCalculationMaximumChange: 0.01,
      tabStripVisible: true, tabEditable: true, newTabVisible: true, tabStripRatio: 50, tabStripWidth: 80,
      tabStripPosition: 0, allSheetsListVisible: 2,
      allowCopyPasteExcelStyle: true, allowExtendPasteRange: false, pasteSkipInvisibleRange: false, copyPasteHeaderOptions: 3,
    });
  });

  it('writes edited options back through the public workbook options', () => {
    const workbook = new GC.Spread.Sheets.Workbook();
    const owner = workbookSettingsOwner(workbook);
    const before = readSettings(owner, spreadSettingTabs);
    const after = { ...before, allowUserDragMerge: true, scrollPixel: 7, referenceStyle: 1, tabStripRatio: 25, useMobileScrollbar: true, showHorizontalScrollbar: 'auto', maxUndoRedoStackSize: 12 };
    expect(applySettings(owner, before, after)).toEqual(expect.arrayContaining(['allowUserDragMerge', 'scrollPixel', 'referenceStyle', 'tabStripRatio', 'useMobileScrollbar']));
    expect(workbook.options.allowUserDragMerge).toBe(true);
    expect(workbook.options.scrollPixel).toBe(7);
    expect(workbook.options.referenceStyle).toBe(1);
    expect(workbook.options.tabStripRatio).toBe(0.25);
    expect(workbook.options.scrollbarAppearance).toBe(1);
    expect(workbook.options.showHorizontalScrollbar).toBe('auto');
    expect(workbook.undoManager().maxSize()).toBe(12);
    // Re-reading shows the same values, so reopening the dialog keeps them.
    expect(readSettings(owner, spreadSettingTabs)).toMatchObject({ tabStripRatio: 25, useMobileScrollbar: true, maxUndoRedoStackSize: 12 });
  });
});

describe('Sheet Settings model', () => {
  it('reads the trial’s default worksheet values', () => {
    const sheet = new GC.Spread.Sheets.Workbook().getActiveSheet();
    const values = readSettings(worksheetSettingsOwner(sheet), sheetSettingTabs);
    expect(values).toMatchObject({
      colCount: 20, rowCount: 200, frozenColumnCount: 0, frozenLeftColumn: 0, frozenRowCount: 0, frozenTopRow: 0,
      frozenTrailingColumnCount: 0, frozenTrailingRowCount: 0, frozenTrailingColumnStickToEdge: true, frozenTrailingRowStickToEdge: true,
      selectionPolicy: 2, allowCellOverflow: true, showZeros: true, addColumnButtonVisible: false, addRowButtonVisible: false, rightToLeft: false,
      showHorizontalGridline: true, showVerticalGridline: true, gridlineColor: 'rgb(212, 212, 212)',
      colHeaderRowCount: 1, colHeaderAutoText: 2, colHeaderAutoTextIndex: -1, colHeaderDefRowHeight: 20, colHeaderVisible: true,
      rowHeaderColCount: 1, rowHeaderAutoText: 1, rowHeaderAutoTextIndex: -1, rowHeaderDefColWidth: 40, rowHeaderVisible: true,
    });
  });

  it('applies sizes, frozen panes, gridlines and header options', () => {
    const sheet = new GC.Spread.Sheets.Workbook().getActiveSheet();
    const owner = worksheetSettingsOwner(sheet);
    const before = readSettings(owner, sheetSettingTabs);
    applySettings(owner, before, {
      ...before,
      colCount: 24, rowCount: 240, frozenColumnCount: 1, frozenLeftColumn: 1, frozenRowCount: 2, frozenTopRow: 2,
      frozenTrailingColumnCount: 1, frozenTrailingRowCount: 1, frozenTrailingRowStickToEdge: false,
      showHorizontalGridline: false, gridlineColor: '#ff0000', allowCellOverflow: false, showZeros: false,
      addRowButtonVisible: true, rightToLeft: true, colHeaderVisible: false, rowHeaderVisible: false,
      colHeaderAutoText: 0, rowHeaderAutoText: 2, colHeaderDefRowHeight: 24, rowHeaderDefColWidth: 48, sheetTabColor: '#00ff00',
    });
    expect([sheet.getColumnCount(), sheet.getRowCount()]).toEqual([24, 240]);
    expect([sheet.frozenColumnCount(), sheet.frozenRowCount()]).toEqual([1, 2]);
    expect([sheet.frozenTrailingColumnCount(), sheet.frozenTrailingRowCount()]).toEqual([1, 1]);
    expect(sheet.options.gridline.showHorizontalGridline).toBe(false);
    expect(sheet.options.gridline.color).toBe('#ff0000');
    expect(sheet.options.allowCellOverflow).toBe(false);
    expect(sheet.options.showZeros).toBe(false);
    expect(sheet.options.addRowButtonOption?.visible).toBe(true);
    expect(sheet.options.rightToLeft).toBe(true);
    expect(sheet.options.colHeaderVisible).toBe(false);
    expect(sheet.options.rowHeaderVisible).toBe(false);
    expect(sheet.options.colHeaderAutoText).toBe(0);
    expect(sheet.options.rowHeaderAutoText).toBe(2);
    expect([sheet.defaults.colHeaderRowHeight, sheet.defaults.rowHeaderColWidth]).toEqual([24, 48]);
    expect(sheet.options.sheetTabColor).toBe('#00ff00');
    // The trial keeps stick-to-edge out of `options` and serialises it on the sheet.
    expect((sheet.toJSON() as Record<string, unknown>).frozenTrailingRowStickToEdge).toBe(false);
    expect(owner.get('frozenTrailingRowStickToEdge')).toBe(false);
  });

  it('reads back the frozen anchor and stick-to-edge values it wrote', () => {
    const sheet = new GC.Spread.Sheets.Workbook().getActiveSheet();
    const owner = worksheetSettingsOwner(sheet);
    const before = readSettings(owner, sheetSettingTabs);
    applySettings(owner, before, { ...before, frozenColumnCount: 2, frozenLeftColumn: 3, frozenTrailingColumnStickToEdge: false });
    const after = readSettings(owner, sheetSettingTabs);
    expect(after.frozenColumnCount).toBe(2);
    expect(after.frozenLeftColumn).toBe(3);
    expect(after.frozenTrailingColumnStickToEdge).toBe(false);
  });
});
