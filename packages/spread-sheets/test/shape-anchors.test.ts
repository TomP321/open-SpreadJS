// @vitest-environment jsdom
/* Shape anchoring: dynamicMove/dynamicSize keep the row/column anchors captured
 * at add time, so resizing rows or columns moves and stretches the shape like
 * the official (and the public accessors report the anchored geometry). */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import GC from '../src/index.js';
import type { Worksheet } from '../src/model.js';
import type { WorkbookRenderer } from '../src/rendering.js';
import type { Shape } from '../src/features/shapes.js';

Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', { value: () => null, configurable: true });

const Shapes = GC.Spread.Sheets.Shapes;
let sheet: Worksheet;

beforeEach(() => {
  const workbook = new GC.Spread.Sheets.Workbook();
  workbook.setSheetCount(1);
  sheet = workbook.getActiveSheet() as Worksheet;
});

afterEach(() => {
  sheet.getParent()?.destroy?.();
});

/** Minimal stand-in for the renderer: _render only reads layout properties. */
function fakeView(): WorkbookRenderer {
  return { sheet, zoom: 1, scrollX: 0, scrollY: 0, headerWidth: 40, headerHeight: 20, root: document.body } as unknown as WorkbookRenderer;
}

function renderShape(shape: Shape): void {
  shape._render(fakeView(), document.createElement('div'), 0);
}

describe('shape dynamic anchors', () => {
  it('captures the anchor at add time and stretches the shape with a resized row', () => {
    const shape = sheet.shapes.add('S1', Shapes.AutoShapeType.rectangle, 620, 120, 160, 90);
    expect(shape.dynamicMove()).toBe(true);
    expect(shape.dynamicSize()).toBe(true);
    renderShape(shape);
    // 120..210 over default 20 px rows: rows 6..10 (the shape ends inside row 10).
    expect([Number(shape.startRow()), Number(shape.startColumn()), Number(shape.endRow()), Number(shape.endColumn())]).toEqual([6, 10, 10, 12]);
    sheet.setRowHeight(7, 100);
    renderShape(shape);
    // The trial reports the anchored (stretched) geometry through the accessors.
    expect(Number(shape.height())).toBe(170);
    expect(Number(shape.y())).toBe(120);
    expect(Number(shape.width())).toBe(160);
    expect(Number(shape.x())).toBe(620);
    // Resizing another row (the same one again, delta +50) stretches it further.
    sheet.setRowHeight(7, 150);
    renderShape(shape);
    expect(Number(shape.height())).toBe(220);
  });

  it('keeps the anchored geometry when the resize happens before the first render', () => {
    // Regression: the anchors must be captured at add time, not on the first
    // paint, otherwise a resize in the same turn is swallowed.
    const shape = sheet.shapes.add('S2', Shapes.AutoShapeType.rectangle, 620, 120, 160, 90);
    sheet.setRowHeight(7, 100);
    renderShape(shape);
    expect(Number(shape.height())).toBe(170);
  });

  it('moves the shape when rows or columns above it are resized', () => {
    const shape = sheet.shapes.add('S3', Shapes.AutoShapeType.rectangle, 620, 120, 160, 90);
    renderShape(shape);
    sheet.setColumnWidth(2, 124); // +62 px before the shape
    sheet.setRowHeight(1, 60);    // +40 px before the shape
    renderShape(shape);
    expect(Number(shape.x())).toBe(682);
    expect(Number(shape.y())).toBe(160);
  });

  it('honours dynamicSize(false): the shape keeps its size when rows resize', () => {
    const shape = sheet.shapes.add('S4', Shapes.AutoShapeType.rectangle, 620, 120, 160, 90);
    renderShape(shape);
    shape.dynamicSize(false);
    sheet.setRowHeight(7, 100);
    renderShape(shape);
    expect(Number(shape.height())).toBe(90);
    expect(Number(shape.y())).toBe(120);
    expect(shape.dynamicMove()).toBe(true); // move is independent; it still follows the anchor
  });

  it('pictures capture their anchors at add time as well', () => {
    const picture = sheet.pictures.add('P1', 'data:image/png;base64,', 100, 100, 80, 40);
    sheet.setRowHeight(5, 60); // the picture covers row 5 (100..140)
    renderShape(picture as never);
    expect(Number(picture.height())).toBe(40 + 40); // row 5 grew by 40 px
  });
});
