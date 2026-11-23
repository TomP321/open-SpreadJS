/**
 * TASK 93 item 4: the Cell Types gallery commands the old build refused with the
 * "requires the cell editors add-in" notice. The public d.ts contract lists
 * CheckBoxList / RadioButtonList / ButtonList / Diagonal / DataObject /
 * RangeTemplate as CORE `GC.Spread.Sheets.CellTypes` classes (and our core
 * implements them), so those gallery items now apply a real cell type over the
 * selection. Only the "Cell Dropdowns" gallery (calculator, color picker, date
 * and time pickers, list, month picker, slider, workflow, multi-column picker)
 * belongs to the cell-editors add-in package, which is out of the core contract
 * (M6b); those keep the notice.
 */
// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it } from 'vitest';
import GC from '@mescius/spread-sheets';
import { Designer } from '../src/designer.js';
import { applySelectionCellType } from '../src/designer-sheet-dialogs.js';
import { englishResources } from '../src/resources.js';

const CellTypes = (GC as any).Spread.Sheets.CellTypes;

let sheet: any, d: any;
const boxes: string[] = [];
beforeEach(() => {
  const workbook = new GC.Spread.Sheets.Workbook();
  workbook.setSheetCount(1);
  sheet = workbook.getActiveSheet();
  sheet.name('Data');
  sheet.setValue(0, 0, 'x');
  sheet.setSelection(0, 0, 2, 2);
  d = Object.assign(Object.create(Designer.prototype), {
    gc: GC, getWorkbook: () => workbook, invalidate: () => undefined, resources: englishResources,
    showMessageBox: (text: string) => { boxes.push(String(text)); },
  });
});

describe('TASK 93 Cell Types gallery', () => {
  it('applies the contract cell types over the selection', () => {
    const expected: [string, string][] = [
      ['rangeTemplateCellType', 'RangeTemplate'],
      ['dataObjectCellType', 'DataObject'],
      ['diagonalCellType', 'Diagonal'],
      ['checkboxListCellType', 'CheckBoxList'],
      ['radioListCellType', 'RadioButtonList'],
      ['buttonListCellType', 'ButtonList'],
      ['checkboxCellType', 'CheckBox'],
      ['fileUploadCellType', 'FileUpload'],
    ];
    for (const [command, className] of expected) {
      applySelectionCellType(d, command);
      const type = sheet.getCellType(0, 0);
      expect(type, command).toBeInstanceOf(CellTypes[className]);
      expect(boxes, command).toHaveLength(0);
    }
  });

  it('keeps the add-in notice only for the cell-dropdown editors', () => {
    const before = sheet.getCellType(0, 0);
    applySelectionCellType(d, 'sliderCellType');
    expect(boxes.join('\n')).toContain('sliderCellType');
    expect(sheet.getCellType(0, 0)).toBe(before);
  });
});
