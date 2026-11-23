// @vitest-environment jsdom
/* User report 2026-11-23: "if I click a row and Shift+click another row, it does not make the multiple selection".
 * A Shift+click on a row (column) header must extend the whole-row (whole-column) selection from the anchor, like
 * Excel and SpreadJS do, and keep the active cell on the anchor. A plain click still selects one row/column. */
import { describe, expect, it } from 'vitest';
import GC from '../src/index.js';
import { stubCanvas2d } from './fixtures/stub-canvas2d.js';

const { Workbook } = GC.Spread.Sheets;

stubCanvas2d();
// jsdom has no pointer capture: the handlers call it on pointerdown.
const proto = Element.prototype as unknown as Record<string, unknown>;
proto.setPointerCapture ??= () => {};
proto.releasePointerCapture ??= () => {};
proto.hasPointerCapture ??= () => false;

function host(width = 600, height = 400) {
  document.body.innerHTML = '<div id="sheet"></div>';
  const element = document.getElementById('sheet')!;
  Object.defineProperties(element, { clientWidth: { configurable: true, value: width }, clientHeight: { configurable: true, value: height } });
  const workbook = new Workbook(element);
  const sheet = workbook.getSheet(0);
  const view = workbook._renderer()!;
  Object.defineProperties(view.root, { clientWidth: { configurable: true, value: width }, clientHeight: { configurable: true, value: height } });
  view.layout();
  view.computeSlots();
  return { sheet, view };
}

/** jsdom has no PointerEvent: build the shape our handlers read. */
function press(target: EventTarget, x: number, y: number, shiftKey = false): void {
  for (const type of ['pointerdown', 'pointerup']) {
    const event = new Event(type, { bubbles: true, cancelable: true }) as Event & Record<string, unknown>;
    Object.assign(event, { clientX: x, clientY: y, pointerId: 1, button: 0, buttons: type === 'pointerdown' ? 1 : 0, shiftKey, ctrlKey: false, metaKey: false, pointerType: 'mouse' });
    target.dispatchEvent(event);
  }
}

describe('Shift+click on row and column headers', () => {
  it('extends a whole-row selection from the anchor row (both directions)', () => {
    const { sheet, view } = host();
    const rowHeaderX = (sheet.getColumnWidth(0, GC.Spread.Sheets.SheetArea.rowHeader) ?? 0) / 2;
    const rowY = (row: number) => (sheet.getRowHeight(0, GC.Spread.Sheets.SheetArea.colHeader) ?? 0) + row * (sheet.getRowHeight(0) ?? 0) + (sheet.getRowHeight(0) ?? 0) / 2;
    press(view.overlay, rowHeaderX, rowY(1));
    expect(sheet.getSelections().map(r => [r.row, r.col, r.rowCount, r.colCount])).toEqual([[1, -1, 1, -1]]);
    press(view.overlay, rowHeaderX, rowY(4), true);
    expect(sheet.getSelections().map(r => [r.row, r.col, r.rowCount, r.colCount])).toEqual([[1, -1, 4, -1]]);
    expect(sheet.getActiveRowIndex()).toBe(1);
    press(view.overlay, rowHeaderX, rowY(0), true);
    expect(sheet.getSelections().map(r => [r.row, r.col, r.rowCount, r.colCount])).toEqual([[0, -1, 2, -1]]);
    expect(sheet.getActiveRowIndex()).toBe(1);
  });

  it('extends a whole-column selection from the anchor column', () => {
    const { sheet, view } = host();
    const headerY = (sheet.getRowHeight(0, GC.Spread.Sheets.SheetArea.colHeader) ?? 0) / 2;
    const colX = (col: number) => (sheet.getColumnWidth(0, GC.Spread.Sheets.SheetArea.rowHeader) ?? 0) + col * (sheet.getColumnWidth(0) ?? 0) + (sheet.getColumnWidth(0) ?? 0) / 2;
    press(view.overlay, colX(1), headerY);
    press(view.overlay, colX(3), headerY, true);
    expect(sheet.getSelections().map(r => [r.row, r.col, r.rowCount, r.colCount])).toEqual([[-1, 1, -1, 3]]);
    expect(sheet.getActiveColumnIndex()).toBe(1);
  });

  it('a plain header click still selects a single row', () => {
    const { sheet, view } = host();
    const rowHeaderX = (sheet.getColumnWidth(0, GC.Spread.Sheets.SheetArea.rowHeader) ?? 0) / 2;
    const rowY = (row: number) => (sheet.getRowHeight(0, GC.Spread.Sheets.SheetArea.colHeader) ?? 0) + row * (sheet.getRowHeight(0) ?? 0) + (sheet.getRowHeight(0) ?? 0) / 2;
    press(view.overlay, rowHeaderX, rowY(1));
    press(view.overlay, rowHeaderX, rowY(4));
    expect(sheet.getSelections().map(r => [r.row, r.col, r.rowCount, r.colCount])).toEqual([[4, -1, 1, -1]]);
  });
});
