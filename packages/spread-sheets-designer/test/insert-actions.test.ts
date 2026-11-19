/* Insert-tab maths and model actions: A1 parsing, sparkline formula planning,
 * barcode formula parity with the trial, and undoable Insert commands. */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it } from 'vitest';
import GC from '@mescius/spread-sheets';
import { Designer } from '../src/designer.js';
import { applyInsertAction, barcodeFormula, formControls, parseA1, shapeGalleryGroups, sparklineFormulas, sparklineGroups, toA1 } from '../src/commands/insert.js';

describe('A1 helpers', () => {
  it('round-trips relative and absolute references', () => {
    expect(parseA1('$B$2')).toEqual({ row: 1, col: 1, rowCount: 1, colCount: 1 });
    expect(parseA1('B2:E5')).toEqual({ row: 1, col: 1, rowCount: 4, colCount: 4 });
    expect(toA1({ row: 3, col: 3, rowCount: 3, colCount: 3 })).toBe('D4:F6');
    expect(toA1({ row: 3, col: 3, rowCount: 3, colCount: 3 }, true)).toBe('$D$4:$F$6');
  });
});

describe('sparklineFormulas (trial parity)', () => {
  it('splits block data into one horizontal series per row for LINE/COLUMN/WINLOSS', () => {
    const items = sparklineFormulas('COLUMNSPARKLINE', 'B2:E5', 'H2:H5');
    expect(items.map(i => i.formula)).toEqual([
      '=COLUMNSPARKLINE(B2:E2,1)', '=COLUMNSPARKLINE(B3:E3,1)',
      '=COLUMNSPARKLINE(B4:E4,1)', '=COLUMNSPARKLINE(B5:E5,1)',
    ]);
    expect(items.map(i => `${toA1({ row: i.row, col: i.col, rowCount: 1, colCount: 1 })}`)).toEqual(['H2', 'H3', 'H4', 'H5']);
  });

  it('uses orientation 0 for single-column data', () => {
    expect(sparklineFormulas('LINESPARKLINE', 'B2:B5', 'G2')[0].formula).toBe('=LINESPARKLINE(B2:B5,0)');
  });

  it('requires a single cell for formula sparklines and a line of cells for object kinds', () => {
    expect(sparklineFormulas('AREASPARKLINE', 'B2:E5', 'G2')[0].formula).toBe('=AREASPARKLINE(B2:E5)');
    expect(() => sparklineFormulas('AREASPARKLINE', 'B2:E5', 'G2:G5'))
      .toThrow('Location reference does not support cell range, it should be single cell');
    expect(() => sparklineFormulas('LINESPARKLINE', 'B2:E5', 'G2:J3'))
      .toThrow(/not all in the same column or row/);
  });
});

describe('barcodeFormula (trial parity)', () => {
  it('matches the trial defaults exactly for QRCODE', () => {
    const formula = barcodeFormula({ value: '', color: '#000', backColor: '#FFF', barcodeType: 'QRCODE', errorLevel: 'L', model: '2', version: 'auto', mask: 'auto', connection: false, connectionNo: 0, charset: 'UTF-8' });
    expect(formula).toBe('BC_QRCODE("","#000","#FFF","L",2,"auto","auto",FALSE,0,,"UTF-8",,,,)');
  });

  it('matches the trial defaults for EAN13 (numeric value, lowercase label position)', () => {
    const formula = barcodeFormula({ value: '123456789012', color: '#000', backColor: '#FFF', barcodeType: 'EAN13', labelPosition: 'Top' });
    expect(formula).toBe('BC_EAN13(123456789012,"#000","#FFF",FALSE,,,"top",,,,,,,,,,)');
  });

  it('quotes text payloads for other symbologies', () => {
    expect(barcodeFormula({ value: 'ABC', barcodeType: 'CODE128' }).startsWith('BC_CODE128("ABC","#000","#FFF",FALSE')).toBe(true);
  });
});

describe('applyInsertAction on the model', () => {
  let sheet: any, d: any;
  beforeEach(() => {
    const workbook = new GC.Spread.Sheets.Workbook();
    workbook.setSheetCount(1);
    sheet = workbook.getActiveSheet();
    sheet.name('Data');
    d = Object.assign(Object.create(Designer.prototype), {
      gc: GC, getWorkbook: () => workbook, invalidate: () => undefined,
      nextShapeName: (base: string) => sheet.shapes.nextName(base),
    });
  });

  it('adds gallery shapes with trial-style names and selection', () => {
    applyInsertAction(d, 'addShape', { galleryId: 'rectangle', box: { x: 10, y: 20, width: 100, height: 50 } });
    applyInsertAction(d, 'addShape', { galleryId: 'oval', box: { x: 1, y: 2, width: 30, height: 30 } });
    const shapes = sheet.shapes.all();
    expect(shapes.map((s: any) => s.name())).toEqual(['rectangle 1', 'oval 1']);
    expect(shapes[1].isSelected()).toBe(true);
    expect(shapes[1].shapeType()).toBe(9);
  });

  it('places the camera on the selection with the trial reference form', () => {
    sheet.setActiveCell(10, 5);
    sheet.setSelection(10, 5, 1, 1);
    applyInsertAction(d, 'applyCamera', { data: { reference: 'A1:B2' } });
    const camera = sheet.shapes.all()[0];
    expect(camera.cellRange()).toBe('=Data!A1:B2');
    expect(camera.name()).toBe('Picture 1');
    // Size follows the referenced range (2 columns x 2 rows), position the active cell.
    expect(camera.width()).toBe(sheet.getColumnWidth(0, 1) + sheet.getColumnWidth(1, 1));
    expect(camera.height()).toBe(sheet.getRowHeight(0, 1) * 2);
    expect(camera.x()).toBeGreaterThan(0);
  });

  it('writes barcode formulas into the location cell', () => {
    applyInsertAction(d, 'applyBarcode', { data: { location: '$B$2', value: 'hi', barcodeType: 'QRCODE', color: '#000', backColor: '#FFF' } });
    expect(sheet.getFormula(1, 1)).toBe('BC_QRCODE("hi","#000","#FFF","L",2,"auto","auto",FALSE,0,,"UTF-8",,,,)');
  });

  it('writes sparkline formulas and deletes shapes', () => {
    applyInsertAction(d, 'applySparklines', { data: { sparklineFunction: 'LINESPARKLINE', dataRange: 'B2:E2', locationRange: 'G2' } });
    expect(sheet.getFormula(1, 6)).toBe('LINESPARKLINE(B2:E2,1)');
    applyInsertAction(d, 'addShape', { galleryId: 'rectangle', box: { x: 0, y: 0, width: 10, height: 10 } });
    expect(sheet.shapes.all().length).toBe(1);
    applyInsertAction(d, 'deleteShapes', {});
    expect(sheet.shapes.all().length).toBe(0);
  });
});

describe('Insert-tab galleries (trial parity)', () => {
  it('reproduces the trial shape gallery: 8 groups, 186 presets, trial order', () => {
    expect(shapeGalleryGroups.map(group => [group.title, group.items.length])).toEqual([
      ['Lines', 9], ['Rectangles', 9], ['Basic Shapes', 71], ['Block Arrows', 27],
      ['Equation Shapes', 6], ['Flowchart', 28], ['Stars and Banners', 20], ['Callouts', 16],
    ]);
    const ids = shapeGalleryGroups.flatMap(group => group.items.map(item => item.id));
    expect(ids.length).toBe(186);
    expect(new Set(ids).size).toBe(186);
    expect(ids.slice(0, 3)).toEqual(['noHeadStraight', 'endArrowHeadStraight', 'beginEndArrowHeadStraight']);
    expect(ids.slice(-3)).toEqual(['lineCallout2BorderandAccentBar', 'lineCallout3BorderandAccentBar', 'lineCallout4BorderandAccentBar']);
    // Every preset except the connector/text-box entries is a public AutoShapeType value.
    const types = (GC as any).Spread.Sheets.Shapes.AutoShapeType;
    const unknown = shapeGalleryGroups.flatMap(group => group.items)
      .filter(item => !['line', 'Elbow', 'Curved', 'hor-text-box'].includes(item.preset) && types[item.preset] === undefined)
      .map(item => item.preset);
    expect(unknown).toEqual([]);
  });

  it('keeps the sparkline and form-control galleries at the trial counts', () => {
    expect(sparklineGroups.map(group => [group.title, group.items.length])).toEqual([
      ['Line Sparkline', 2], ['Bar Sparkline', 8], ['Pie Sparkline', 1], ['Scatter Sparkline', 2],
      ['Calendar Sparkline', 2], ['Other Sparkline', 8],
    ]);
    expect(formControls.map(control => control.id)).toEqual(['button', 'combobox', 'checkbox', 'spinbutton', 'listbox', 'optionbutton', 'groupbox', 'label', 'scrollbar']);
  });
});
