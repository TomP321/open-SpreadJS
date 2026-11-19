/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it } from 'vitest';
import GC from '@mescius/spread-sheets';
import { applyCellStyle, cellTypeStyleTemplate, customCellStyles, cellTypeStyleTemplateNames } from '../src/commands/actions.js';
import { Designer } from '../src/designer.js';

describe('Cell Styles gallery: cell-type tiles', () => {
  let workbook: any, sheet: any, d: any;
  beforeEach(() => {
    workbook = new GC.Spread.Sheets.Workbook();
    sheet = workbook.getActiveSheet();
    d = Object.assign(Object.create(Designer.prototype), { gc: GC, getWorkbook: () => workbook, invalidate: () => undefined });
    sheet.setSelection(1, 1, 1, 1);
  });

  it('DateTime tile registers the template as a workbook named style and points the cell style at it', () => {
    applyCellStyle(d, 'datetimepicker-cellbutton');
    const template = workbook.getNamedStyle('datetimepicker-cellbutton');
    expect(template).toBeTruthy();
    expect(template.cellButtons).toEqual([{ command: 'openDateTimePicker', imageType: 5, position: 1, visibility: 0 }]);
    expect(template.dropDowns).toEqual([{ type: 1, option: { calendarPage: 3, showTime: true, showDateRange: false, startDay: 7 } }]);
    // Trial: the cell style keeps its own fields and links through parentName; the cell type is untouched.
    expect(sheet.getStyle(1, 1).parentName).toBe('datetimepicker-cellbutton');
    expect((sheet.getCellType(1, 1) as any).toJSON()).toEqual({ typeName: '1', allowOverflow: true, editorType: 1 });
    // The button/dropdown resolve onto the actual style.
    const actual = sheet.getActualStyle(1, 1);
    expect(actual.cellButtons.map((b: any) => b.command)).toEqual(['openDateTimePicker']);
    expect(actual.dropDowns[0].option.showTime).toBe(true);
  });

  it('every cell-type tile applies its template through parentName', () => {
    cellTypeStyleTemplateNames.forEach((name, index) => {
      sheet.setSelection(index, 3, 1, 1);
      applyCellStyle(d, name);
      expect(sheet.getStyle(index, 3).parentName).toBe(name);
      expect(sheet.getActualStyle(index, 3).cellButtons.length).toBeGreaterThan(0);
    });
  });

  it('DateRange and NumberRange templates carry their display formatter', () => {
    applyCellStyle(d, 'dateRangePicker-cellbutton');
    expect(sheet.getActualStyle(1, 1).formatter).toBe('=IF(ISBLANK(@), "", TEXT(@.start, "m/d/yyyy")&"~"&TEXT(@.end, "m/d/yyyy"))');
    sheet.setSelection(2, 2, 1, 1);
    applyCellStyle(d, 'sliderRange-cellbutton');
    expect(sheet.getActualStyle(2, 2).formatter).toBe('=IF(ISBLANK(@), "", @.start&"~"&@.end)');
  });

  it('OKCancel uses ok/cancel images shown only on editing; Clear uses the clear image', () => {
    const okCancel = cellTypeStyleTemplate('okcancel-cellbutton') as any;
    expect(okCancel.cellButtons).toEqual([
      { command: 'commitInputNavigationDown', imageType: 4, position: 1, visibility: 2 },
      { command: 'cancelInput', imageType: 3, position: 1, visibility: 2 },
    ]);
    applyCellStyle(d, 'clear-cellbutton');
    expect(sheet.getActualStyle(1, 1).cellButtons).toEqual([{ command: 'clear', imageType: 2, position: 1, visibility: 0 }]);
  });

  it('re-applying another cell-type tile re-points parentName (trial accumulates old buttons; ours replaces)', () => {
    applyCellStyle(d, 'slider-cellbutton');
    applyCellStyle(d, 'datetimepicker-cellbutton');
    const style = sheet.getStyle(1, 1);
    expect(style.parentName).toBe('datetimepicker-cellbutton');
    // The trial materialises the previous resolved buttons into the local style; we keep the local
    // style clean (recorded in Known gaps).
    expect(style.cellButtons).toBeUndefined();
    expect(sheet.getActualStyle(1, 1).cellButtons.map((b: any) => b.command)).toEqual(['openDateTimePicker']);
  });

  it('style tiles still write their explicit style and the cell-type templates stay out of the Custom list', () => {
    applyCellStyle(d, 'Bad');
    expect(sheet.getActualStyle(1, 1).backColor).toBe('#ffc7ce');
    applyCellStyle(d, 'slider-cellbutton');
    expect(customCellStyles(d)).toEqual([]);
  });

  it('New Cell Style... creates a named style, lists a Custom tile and applying it works', () => {
    sheet.setFormatter(1, 1, '$#,##0.00');
    let dialogData: any;
    d.showDialog = (_name: string, data: any, callback: any) => { dialogData = { data, callback }; };
    Designer.prototype.showNewCellStyleDialog.call(d);
    expect(dialogData.data.name).toBe('Style 1');
    dialogData.callback({ name: 'Style 1' });
    const created = workbook.getNamedStyle('Style 1');
    expect(created).toBeTruthy();
    expect(created.formatter).toBe('$#,##0.00');
    expect(customCellStyles(d).map((entry) => entry.name)).toEqual(['Style 1']);
    sheet.setSelection(4, 4, 1, 1);
    applyCellStyle(d, 'Style 1');
    expect(sheet.getStyle(4, 4).parentName).toBe('Style 1');
    expect(sheet.getActualStyle(4, 4).formatter).toBe('$#,##0.00');
  });

  it('New Cell Style... auto-names past existing custom styles', () => {
    const style = new GC.Spread.Sheets.Style();
    style.name = 'Style 1';
    workbook.addNamedStyle(style);
    let dialogData: any;
    d.showDialog = (_name: string, data: any, callback: any) => { dialogData = { data, callback }; };
    Designer.prototype.showNewCellStyleDialog.call(d);
    expect(dialogData.data.name).toBe('Style 2');
    // An empty name creates nothing.
    dialogData.callback({ name: '   ' });
    expect(workbook.getNamedStyle('Style 2')).toBeFalsy();
  });
});
