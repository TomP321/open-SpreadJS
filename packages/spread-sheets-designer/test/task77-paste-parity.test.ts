/**
 * TASK 77: paste-family and Table-Style-Clear behaviour parity, decided from the
 * both-sides sweep probes on `apps/designer-compare` (server 5188):
 * `.probe/t77/run/t77-paste.json` (pasteLink / pasteLinkedPicture full slices),
 * `.probe/t77/run/t77-tablefixture.json` (cleared-table state + paint safety),
 * `.probe/t77/run/t77-picture.json` (linked-picture geometry through the public accessors).
 */
// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it } from 'vitest';
import GC from '@mescius/spread-sheets';
import { insertLinkedPicture, pasteClipboard } from '../src/commands/clipboard-actions.js';
import { clearTableStyleOfSelection } from '../src/designer-custom-styles.js';
import { sheetsNamespace } from '../src/core-internals.js';

const DATA = [
  ['Region', 'Q1', 'Q2', 'Q3', 'Q4', 'Total'],
  ['North', 120, 135, 150, 165, 570],
  ['South', 90, 105, 95, 125, 415],
  ['East', 75, 80, 90, 100, 345],
  ['West', 110, 115, 105, 130, 460],
];

function setup(): { sheet: any; designer: any; workbook: any } {
  // The sweep runs against a live Designer; enable the same serialization behaviour
  // (shared-formula coalescing) through the core's documented hook.
  sheetsNamespace(GC)._setDesignerSerialization?.(true);
  const workbook = new GC.Spread.Sheets.Workbook();
  const sheet: any = workbook.getActiveSheet();
  sheet.name('Data');
  sheet.setArray(0, 0, DATA);
  for (let r = 1; r <= 4; r++) sheet.setFormula(r, 5, `SUM(B${r + 1}:E${r + 1})`);
  const designer: any = {
    gc: GC,
    getWorkbook: () => workbook,
    spreadsheet: workbook,
    invalidate: () => undefined,
    nextShapeName: (base: string) => sheet.shapes.nextName(base),
  };
  // The core owns the internal clipboard the `copy` command fills in the running app.
  designer.clipboard = (row: number, col: number, rowCount: number, colCount: number) => {
    sheet._clipboardSource = () => ({ sheetName: sheet.name(), row, col, rowCount, colCount });
    sheet._clipboardMode = () => 'copy';
  };
  return { sheet, designer, workbook };
}

const sheetJson = (sheet: any): any => JSON.parse(JSON.stringify(sheet.toJSON()));

describe('TASK 77 pasteLink (trial writes linked formulas, no styles)', () => {
  it('makes every pasted cell a formula referencing its source cell', () => {
    // Trial (`.probe/t77/run/t77-paste.json`): copying B1:E2 and Paste Link at B5 leaves the
    // target block with per-cell links (`B5` -> `=B1`, …), the materialised link VALUES
    // (`"Q1"` …, SUM(B5:E5) recomputes to 0) and NO style record anywhere.
    const { sheet, designer } = setup();
    designer.clipboard(0, 1, 2, 4);
    sheet.setSelection(4, 1, 2, 4);
    pasteClipboard(designer, 'links');
    expect(sheet.getValue(4, 1)).toBe('Q1');
    expect(sheet.getValue(4, 4)).toBe('Q4');
    expect(sheet.getValue(5, 1)).toBe(120);
    expect(sheet.getValue(5, 4)).toBe(165);
    expect(sheet.getFormula(4, 1)).toBe('B1');
    expect(sheet.getFormula(5, 4)).toBe('E2');
    expect(sheet.getValue(4, 5)).toBe(0); // the existing =SUM(B5:E5) over linked text
    const data = sheetJson(sheet).data.dataTable;
    for (const r of ['4', '5']) for (const c of ['1', '2', '3', '4']) {
      expect(data[r][c].style, `style at r${r}c${c}`).toBeUndefined();
    }
  });

  it('serialises the link block as the trial one shared group ({si:1} + sharedFormulas record)', () => {
    const { sheet, designer } = setup();
    designer.clipboard(0, 1, 2, 4);
    sheet.setSelection(4, 1, 2, 4);
    pasteClipboard(designer, 'links');
    const json = sheetJson(sheet);
    const data = json.data.dataTable;
    for (const r of ['4', '5']) for (const c of ['1', '2', '3', '4']) {
      expect(data[r][c].formula, `formula at r${r}c${c}`).toEqual({ si: 1 });
    }
    // Byte-identical to the trial record set: the baseline SUM block stays si 0, the links si 1.
    expect(json.sharedFormulas['0']).toEqual({ formula: 'SUM(B2:E2)', baseRow: 1, baseColumn: 5, lastRow: 4, lastColumn: 5 });
    expect(json.sharedFormulas['1']).toEqual({ formula: 'B1', baseRow: 4, baseColumn: 1, lastRow: 5, lastColumn: 4 });
    expect(json.sharedFormulas.nextIndex).toBe(2);
  });

  it('qualifies cross-sheet links with the source sheet name', () => {
    const { sheet, designer, workbook } = setup();
    workbook.addSheet(1);
    const other: any = workbook.getSheet(1);
    other.name('Other Sheet');
    other.setValue(0, 0, 7);
    designer.clipboard(0, 0, 1, 1);
    // The clipboard source lives on the other sheet; paste onto the active one.
    sheet._clipboardSource = () => ({ sheetName: 'Other Sheet', row: 0, col: 0, rowCount: 1, colCount: 1 });
    sheet.setSelection(3, 3, 1, 1);
    pasteClipboard(designer, 'links');
    expect(sheet.getFormula(3, 3)).toBe("'Other Sheet'!A1");
    expect(sheet.getValue(3, 3)).toBe(7);
    workbook.removeSheet(1);
  });
});

describe('TASK 77 pasteLinkedPicture (trial inserts a linked camera picture, touches no cells)', () => {
  it('leaves the target block exactly as it was', () => {
    // Trial (`.probe/t77/run/t77-paste.json`): Linked Picture writes NO values/formulas/styles —
    // B5:E6 keep their baseline content; the diff vs the old full-paste mapping was the point.
    const { sheet, designer } = setup();
    designer.clipboard(0, 1, 2, 4);
    sheet.setSelection(4, 1, 2, 4);
    insertLinkedPicture(designer);
    expect(sheet.getValue(4, 1)).toBe(110);
    expect(sheet.getValue(4, 4)).toBe(130);
    expect(sheet.getValue(5, 1)).toBeNull();
    const data = sheetJson(sheet).data.dataTable;
    for (const r of ['4', '5']) for (const c of ['1', '2', '3', '4']) {
      expect(data[r]?.[c]?.style, `style at r${r}c${c}`).toBeUndefined();
      expect(data[r]?.[c]?.formula, `formula at r${r}c${c}`).toBeUndefined();
    }
  });

  it('inserts one camera picture named "Picture N" referencing the COPIED source range absolutely', () => {
    // Trial (TASK 77 probes `.probe/t77/run/t77-picture.json` + `t77-picture-anchor.json`):
    // shape `Picture 1` anchored one row below the paste target's top-left cell, 20 px right of
    // the target column's start, spanning the source range plus its right/bottom gridline.
    const { sheet, designer } = setup();
    designer.clipboard(0, 1, 2, 4);
    sheet.setSelection(4, 1, 2, 4);
    insertLinkedPicture(designer);
    const shapes = sheet.shapes.all();
    expect(shapes.length).toBe(1);
    const shape: any = shapes[0];
    expect(shape.name()).toBe('Picture 1');
    expect(shape.cellRange()).toBe('=Data!$B$1:$E$2');
    const box = sheetJson(sheet).shapes[0];
    // Geometry measured through the public accessors on both sides (trial B5 target, B1:E2 source:
    // x=130, y=100, w=249, h=41 on the compare workbook's 110/62 px columns and 20 px rows).
    expect(box.x).toBe(sheet.getColumnWidth(0) + 20); // target column start + 20 px (trial constant offset)
    expect(box.y).toBe(4 * sheet.getRowHeight(0) + 20); // target cell top + 20 px
    expect(shape.width()).toBe([1, 2, 3, 4].reduce((sum, c) => sum + sheet.getColumnWidth(c), 0) + 1); // copied B1:E2 + gridline
    expect(shape.height()).toBe(2 * sheet.getRowHeight(0) + 1);
    // Trial answers allowResize() with the numeric 0 on this shape (plain paste would be `true`).
    expect(shape.allowResize()).toBe(0);
    expect(sheetJson(sheet).shapes[0].allowResize).toBe(0);
    sheet.shapes.remove('Picture 1');
  });

  it('anchors the trial +20/+1 box off the target cell even for a 3-row block on a taller row', () => {
    // Discriminating probe (`.probe/t77/run/t77-picture-anchor.json`): source B1:E3 pasted with
    // active cell C7, the target row made 30 px tall. The trial kept y = target top + 20 px
    // (140 on 20 px rows 0..5), i.e. the 20 px offset is CONSTANT — not a "+1 row" anchor (which
    // would give 150 once the target row is 30 px). Both sides answered x=192, y=140, w=249, h=61.
    const { sheet, designer } = setup();
    designer.clipboard(0, 1, 3, 4); // B1:E3
    sheet.setRowHeight(6, 34); // target row C7 taller than the trial probe's 30 px
    sheet.setSelection(6, 2, 3, 4);
    insertLinkedPicture(designer);
    const shape: any = sheet.shapes.all()[0];
    const h = sheet.getRowHeight(0);
    const box = sheetJson(sheet).shapes[0];
    expect(box.x).toBe(sheet.getColumnWidth(0) + sheet.getColumnWidth(1) + 20);
    expect(box.y).toBe(6 * h + 20); // rows 0..5 tops the target cell, then the trial's constant 20 px
    expect(shape.width()).toBe([1, 2, 3, 4].reduce((sum, c) => sum + sheet.getColumnWidth(c), 0) + 1);
    expect(shape.height()).toBe(3 * h + 1);
    expect(shape.allowResize()).toBe(0);
    sheet.shapes.remove('Picture 1');
  });
});

describe('TASK 77 clearTableStyle (paint-safe cleared table, trial style-cleared model)', () => {
  let sheet: any, designer: any;
  beforeEach(() => {
    const s = setup();
    sheet = s.sheet;
    designer = s.designer;
    sheet.tables.add('Table1', 0, 0, 5, 6, undefined, { showHeader: true }); // the contract call: both sides serialise `style: "medium2"`
  });

  it('keeps the cleared table style-less in the model like the trial', () => {
    // Trial (`.probe/t77/run/t77-tablefixture.json`): after the Clear the serialized table has
    // no `style` key at all and `table.style()` answers a name-less theme.
    sheet.setSelection(1, 1, 3, 4);
    clearTableStyleOfSelection(designer);
    const table = sheet.tables.all().find((t: any) => t.name() === 'Table1');
    const cleared = sheetJson(sheet).tables.find((t: any) => t.name === 'Table1');
    expect('style' in cleared).toBe(false);
    expect(cleared.showResizeHandle).toBe(true); // materialised default (TASK 75)
    expect(table.style()).toBeTruthy();
    expect(!table.style().name()).toBe(true);
  });

  it('keeps the cell-style cascade readable through the cleared table', () => {
    // The sweep evidence: writing a bare `null` left the core paint path a value without
    // `_style` to dereference — the first Clear Table Style killed the designer grid for the
    // rest of the session (the source of the TASK 75 `zoomSelection` harness artifact).
    sheet.setSelection(1, 1, 3, 4);
    clearTableStyleOfSelection(designer);
    expect(() => sheet.getActualStyle(1, 1)).not.toThrow();
    expect(() => sheet.getActualStyle(0, 0)).not.toThrow(); // through the header row
    expect(() => sheet.getActualStyle(5, 1)).not.toThrow(); // just outside the table block
    // The model itself is untouched by reading styles.
    expect(sheet.getValue(1, 1)).toBe(120);
  });

  it('leaves a selection outside every table without side effects', () => {
    sheet.setSelection(9, 9, 1, 1);
    const before = JSON.stringify(sheetJson(sheet).tables);
    clearTableStyleOfSelection(designer);
    expect(JSON.stringify(sheetJson(sheet).tables)).toBe(before);
  });
});
