// @vitest-environment jsdom
/*
 * `GC.Spread.Sheets.Shapes.ShapeBase`: constructor, the 28 declared accessors and the anchor
 * model. Every expectation is the official 19.2.5 trial's answer, observed through the public
 * API by the black-box probe (.probe/api-sweep-probe.mjs; probes f40sh2-*, f40sh3-*, f40sh4-*).
 */
import { beforeEach, describe, expect, it } from 'vitest';
import GC from '../src/index.js';
import { ShapeBase } from '../src/features/shapes.js';
import type { Worksheet } from '../src/model.js';

const Shapes = GC.Spread.Sheets.Shapes;

// jsdom has no 2D canvas backend: record the painting calls and hand back a PNG data URL.
function recordingContext(): CanvasRenderingContext2D {
  const anything: unknown = new Proxy(function () {} as unknown as Record<string | symbol, unknown>, {
    get: (target, key) => (key === 'canvas' ? {} : anything),
    apply: () => anything,
    set: () => true,
  });
  return anything as CanvasRenderingContext2D;
}
Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
  value() { return recordingContext(); },
  configurable: true,
});
Object.defineProperty(HTMLCanvasElement.prototype, 'toDataURL', {
  // Encodes the painted canvas size, which is what the shape code controls (the real
  // browser run compares the PNG bytes against the trial through the screenshot gate).
  value(this: HTMLCanvasElement) { return `data:image/png;base64,PROBE-${this.width}x${this.height}`; },
  configurable: true,
});

let sheet: Worksheet;
beforeEach(() => {
  const workbook = new GC.Spread.Sheets.Workbook();
  workbook.setSheetCount(1);
  sheet = workbook.getActiveSheet() as Worksheet;
});

/** Snapshot of the anchor and geometry accessors (the trial reports the same nine numbers). */
function snapshot(shape: ShapeBase): Record<string, number> {
  const num = (value: unknown) => Number(value);
  return {
    x: num(shape.x()), y: num(shape.y()), width: num(shape.width()), height: num(shape.height()),
    startRow: num(shape.startRow()), startColumn: num(shape.startColumn()),
    endRow: num(shape.endRow()), endColumn: num(shape.endColumn()),
    startRowOffset: num(shape.startRowOffset()), startColumnOffset: num(shape.startColumnOffset()),
    endRowOffset: num(shape.endRowOffset()), endColumnOffset: num(shape.endColumnOffset()),
  };
}

describe('ShapeBase constructor and inheritance', () => {
  it('is constructible and carries the declared accessors on its prototype', () => {
    const base = new Shapes.ShapeBase();
    expect(base).toBeInstanceOf(ShapeBase);
    const declared = ['allowMove', 'allowResize', 'allowRotate', 'alt', 'canPrint', 'dynamicMove', 'dynamicSize',
      'endColumn', 'endColumnOffset', 'endRow', 'endRowOffset', 'getFormula', 'height', 'hyperlink', 'isLocked',
      'isSelected', 'isVisible', 'name', 'showHandle', 'startColumn', 'startColumnOffset', 'startRow',
      'startRowOffset', 'toImageSrc', 'toImageSrcAsync', 'width', 'x', 'y'];
    for (const member of declared) expect(typeof (Shapes.ShapeBase.prototype as unknown as Record<string, unknown>)[member]).toBe('function');
  });

  it('answers the trial defaults on an unattached handle', () => {
    const base = new Shapes.ShapeBase();
    expect(base.name()).toBeUndefined();
    expect(base.alt()).toBe('');
    expect(base.hyperlink()).toBeNull();
    expect(base.getFormula('x')).toBeUndefined();
    expect([base.x(), base.y(), base.width(), base.height()]).toEqual([undefined, undefined, undefined, undefined]);
    expect([base.startRow(), base.startColumn(), base.endRow(), base.endColumn()]).toEqual([-1, -1, -1, -1]);
    expect([base.startRowOffset(), base.startColumnOffset(), base.endRowOffset(), base.endColumnOffset()]).toEqual([0, 0, 0, 0]);
    for (const flag of ['allowMove', 'allowResize', 'allowRotate', 'canPrint', 'dynamicMove', 'dynamicSize', 'isLocked', 'isVisible', 'showHandle'])
      expect((base as unknown as Record<string, () => unknown>)[flag]()).toBe(true);
    expect(base.isSelected()).toBe(false);
  });

  it('is the base class of every shape kind, including groups', () => {
    const rect = sheet.shapes.add('r1', Shapes.AutoShapeType.rectangle, 0, 0, 50, 50);
    const connector = sheet.shapes.addConnector('c1', 0, 0, 0, 10, 10);
    const camera = sheet.shapes.addCameraShape('cam', 'Sheet1!$A$1:$B$2', 0, 0, 10, 10);
    const picture = sheet.shapes.addPictureShape('pic', 'data:,x', 0, 0, 10, 10);
    const control = sheet.shapes.addFormControl('fb', 'checkBox', 0, 0, 10, 10);
    const group = sheet.shapes.group([rect, connector]);
    for (const handle of [rect, connector, camera, picture, control, group]) expect(handle).toBeInstanceOf(Shapes.ShapeBase);
  });
});

describe('ShapeBase behaviour flags', () => {
  it('defaults every flag the way the trial answers them on an added shape', () => {
    const shape = sheet.shapes.add('r1', Shapes.AutoShapeType.rectangle, 10, 20, 100, 50);
    expect([shape.allowMove(), shape.allowResize(), shape.allowRotate()]).toEqual([true, true, true]);
    expect(shape.alt()).toBe('');
    expect([shape.canPrint(), shape.dynamicMove(), shape.dynamicSize()]).toEqual([true, true, true]);
    expect([shape.isLocked(), shape.isVisible(), shape.showHandle()]).toEqual([true, true, true]);
    expect(shape.isSelected()).toBe(false);
    expect(shape.hyperlink()).toBeNull();
  });

  it('chains the flag setters and reads the stored value back', () => {
    const shape = sheet.shapes.add('r1', Shapes.AutoShapeType.rectangle, 10, 20, 100, 50);
    expect(shape.allowMove(false)).toBe(shape);
    expect(shape.allowMove()).toBe(false);
    expect(shape.allowResize(false)).toBe(shape);
    expect(shape.allowResize()).toBe(false);
    expect(shape.allowRotate(true)).toBe(shape);
    expect(shape.allowRotate()).toBe(true);
    expect(shape.alt('hello')).toBe(shape);
    expect(shape.alt()).toBe('hello');
    expect(shape.alt(null as unknown as string)).toBe(shape);
    expect(shape.alt()).toBeNull();
    expect(shape.alt('')).toBe(shape);
    expect(shape.alt()).toBe('');
    expect(shape.canPrint(false)).toBe(shape);
    expect(shape.canPrint()).toBe(false);
    expect(shape.isLocked(true)).toBe(shape);
    expect(shape.isLocked()).toBe(true);
    expect(shape.isVisible(false)).toBe(shape);
    expect(shape.isVisible()).toBe(false);
    expect(shape.isSelected(true)).toBe(shape);
    expect(shape.isSelected()).toBe(true);
    expect(shape.showHandle(false)).toBe(shape);
    expect(shape.showHandle()).toBe(false);
  });

  it('couples dynamicMove and dynamicSize like the trial', () => {
    const info = (shape: ShapeBase) => ({ dynamicMove: shape.dynamicMove(), dynamicSize: shape.dynamicSize() });
    const a = sheet.shapes.add('a', Shapes.AutoShapeType.rectangle, 10, 20, 100, 50);
    a.dynamicSize(false);
    expect(info(a)).toEqual({ dynamicMove: true, dynamicSize: false });
    a.dynamicSize(true);
    expect(info(a)).toEqual({ dynamicMove: true, dynamicSize: true });
    const b = sheet.shapes.add('b', Shapes.AutoShapeType.rectangle, 10, 20, 100, 50);
    b.dynamicMove(false);
    expect(info(b)).toEqual({ dynamicMove: false, dynamicSize: false });
    b.dynamicSize(true);
    expect(info(b)).toEqual({ dynamicMove: false, dynamicSize: false });
    b.dynamicMove(true);
    expect(info(b)).toEqual({ dynamicMove: true, dynamicSize: false });
    const c = sheet.shapes.add('c', Shapes.AutoShapeType.rectangle, 10, 20, 100, 50);
    c.dynamicSize(false);
    c.dynamicMove(false);
    c.dynamicSize(true);
    expect(info(c)).toEqual({ dynamicMove: false, dynamicSize: false });
  });
});

describe('ShapeBase anchors', () => {
  it('captures the start and end anchor of the add box', () => {
    const shape = sheet.shapes.add('r1', Shapes.AutoShapeType.rectangle, 10, 20, 100, 50);
    expect(snapshot(shape)).toEqual({
      x: 10, y: 20, width: 100, height: 50,
      startRow: 1, startColumn: 0, endRow: 3, endColumn: 1,
      startRowOffset: 0, startColumnOffset: 10, endRowOffset: 10, endColumnOffset: 48,
    });
  });

  it('chains the anchor setters', () => {
    const shape = sheet.shapes.add('r1', Shapes.AutoShapeType.rectangle, 10, 20, 100, 50);
    for (const member of ['x', 'y', 'width', 'height', 'name', 'startRow', 'startColumn', 'endRow', 'endColumn',
      'startRowOffset', 'startColumnOffset', 'endRowOffset', 'endColumnOffset'] as const) {
      const value = member === 'name' ? 'renamed' : 1;
      expect((shape as unknown as Record<string, (v: unknown) => unknown>)[member](value), member).toBe(shape);
    }
  });

  it('keeps the size and shifts the far anchor when a start side moves', () => {
    const shape = sheet.shapes.add('r1', Shapes.AutoShapeType.rectangle, 10, 20, 100, 50);
    shape.startRow(2);
    expect(snapshot(shape)).toMatchObject({ y: 40, height: 50, startRow: 2, endRow: 4, endRowOffset: 10 });
    shape.startColumn(1);
    expect(snapshot(shape)).toMatchObject({ x: 72, width: 100, startColumn: 1, endColumn: 2, endColumnOffset: 48 });
  });

  it('keeps the start and re-reads the size when an end side moves', () => {
    const shape = sheet.shapes.add('r1', Shapes.AutoShapeType.rectangle, 10, 20, 100, 50);
    shape.endRow(2);
    expect(snapshot(shape)).toMatchObject({ y: 20, height: 30, startRow: 1, endRow: 2, endRowOffset: 10 });
    const other = sheet.shapes.add('r2', Shapes.AutoShapeType.rectangle, 10, 20, 100, 50);
    other.endRowOffset(0);
    expect(snapshot(other)).toMatchObject({ height: 40, endRow: 3, endRowOffset: 0, endColumn: 1, endColumnOffset: 48 });
  });

  it('reports a zero height when the end anchor lands above the start anchor', () => {
    const shape = sheet.shapes.add('r1', Shapes.AutoShapeType.rectangle, 10, 20, 100, 50);
    shape.startRow(2);
    shape.endRow(1);
    expect(snapshot(shape)).toMatchObject({ y: 40, height: 0, startRow: 2, endRow: 1, endRowOffset: 10 });
    shape.startRow(0);
    expect(snapshot(shape)).toMatchObject({ y: 0, height: 0, startRow: 0, endRow: 0, endRowOffset: 0 });
  });

  it('reads a negative end row back and clamps the size at zero', () => {
    const shape = sheet.shapes.add('r1', Shapes.AutoShapeType.rectangle, 10, 20, 100, 50);
    shape.endRow(-3);
    expect(snapshot(shape)).toMatchObject({ height: 0, endRow: -3, endRowOffset: 10, startRow: 1 });
  });

  it('applies an anchor offset larger than its cell but reads the raw value back', () => {
    const rowSide = sheet.shapes.add('a', Shapes.AutoShapeType.rectangle, 10, 20, 100, 50);
    rowSide.startRowOffset(25);
    expect(snapshot(rowSide)).toMatchObject({ startRowOffset: 25, y: 40, height: 50, endRow: 4, endRowOffset: 10 });
    rowSide.startRowOffset(19);
    expect(snapshot(rowSide)).toMatchObject({ startRowOffset: 19, y: 39, height: 50, endRow: 4, endRowOffset: 9 });
    const columnSide = sheet.shapes.add('b', Shapes.AutoShapeType.rectangle, 10, 20, 100, 50);
    columnSide.startColumnOffset(99999);
    expect(snapshot(columnSide)).toMatchObject({ startColumnOffset: 99999, x: 62, width: 100, endColumn: 2, endColumnOffset: 38 });
    const farSide = sheet.shapes.add('c', Shapes.AutoShapeType.rectangle, 10, 20, 100, 50);
    farSide.endColumnOffset(99999);
    expect(snapshot(farSide)).toMatchObject({ endColumnOffset: 99999, width: 114, endColumn: 1 });
  });

  it('clamps an anchor row outside the sheet to the sheet extent', () => {
    const shape = sheet.shapes.add('r1', Shapes.AutoShapeType.rectangle, 10, 20, 100, 50);
    shape.endRowOffset(10);
    shape.startRow(99999);
    expect(snapshot(shape)).toMatchObject({ startRow: 99999, y: 4000, height: 0, endRow: 199, endRowOffset: 20 });
  });

  it('accepts negative geometry through the direct setters', () => {
    const shape = sheet.shapes.add('r1', Shapes.AutoShapeType.rectangle, 10, 20, 100, 50);
    shape.x(-5);
    expect(snapshot(shape)).toMatchObject({ x: -5, startColumn: 0, startColumnOffset: -5, endColumn: 1, endColumnOffset: 33, width: 100 });
    shape.width(-10);
    expect(Number(shape.width())).toBe(-10);
    expect(snapshot(shape)).toMatchObject({ endColumn: 0, endColumnOffset: -15 });
  });

  it('moves the shape through the geometry setters and re-derives both anchors', () => {
    const shape = sheet.shapes.add('r1', Shapes.AutoShapeType.rectangle, 10, 20, 100, 50);
    shape.x(5);
    expect(snapshot(shape)).toMatchObject({ x: 5, width: 100, startColumn: 0, startColumnOffset: 5, endColumn: 1, endColumnOffset: 43 });
    shape.width(40);
    expect(snapshot(shape)).toMatchObject({ width: 40, endColumn: 0, endColumnOffset: 45 });
  });

  it('stores a geometry string verbatim when it is not a number', () => {
    const shape = sheet.shapes.add('r1', Shapes.AutoShapeType.rectangle, 10, 20, 100, 50);
    expect(shape.width('50%')).toBe(shape);
    expect(shape.width()).toBe('50%');
    expect([shape.endColumn(), shape.endColumnOffset()]).toEqual([0, 0]);
  });
});

describe('ShapeBase formulas', () => {
  it('binds x, y, width and height formulas and evaluates them through the calc service', () => {
    const shape = sheet.shapes.add('r1', Shapes.AutoShapeType.rectangle, 10, 20, 100, 50);
    sheet.setValue(0, 0, 7);
    sheet.setValue(1, 0, 3);
    shape.setFormula('x', '=A1+1');
    expect(shape.x()).toBe(8);
    expect(shape.getFormula('x')).toBe('=Sheet1!A1+1');
    shape.setFormula('y', '=SUM(A1:A2)');
    expect(shape.y()).toBe(10);
    expect(shape.getFormula('y')).toBe('=SUM(Sheet1!A1:A2)');
    sheet.setValue(0, 0, 11);
    expect(shape.x()).toBe(12);
  });

  it('answers nothing from the setters, the way the trial declares them', () => {
    const shape = sheet.shapes.add('r1', Shapes.AutoShapeType.rectangle, 10, 20, 100, 50);
    expect(shape.setFormula('x', '=15')).toBeUndefined();
    expect(shape.hyperlink({ url: 'https://example.com', tooltip: 'tip' })).toBeUndefined();
    expect(shape.rotate(30)).toBeUndefined();
    expect(shape.x()).toBe(15);
    expect(shape.getFormula('x')).toBe('=15');
  });

  it('applies a plain number without creating a formula', () => {
    const shape = sheet.shapes.add('r1', Shapes.AutoShapeType.rectangle, 10, 20, 100, 50);
    shape.setFormula('width', '50');
    expect(shape.width()).toBe(50);
    expect(shape.getFormula('width')).toBeUndefined();
    expect(shape.x('25')).toBe(shape);
    expect(shape.x()).toBe(25);
    expect(shape.getFormula('x')).toBeUndefined();
    expect(shape.y('=10+5')).toBe(shape);
    expect(shape.y()).toBe(15);
    expect(shape.getFormula('y')).toBe('=10+5');
  });

  it('ignores paths the trial does not bind and reads them back as an empty string', () => {
    const shape = sheet.shapes.add('r1', Shapes.AutoShapeType.rectangle, 10, 20, 100, 50);
    expect(shape.getFormula('x')).toBeUndefined();
    expect(shape.getFormula('nope')).toBe('');
    shape.setFormula('nope', '=1');
    expect(shape.getFormula('nope')).toBe('');
    shape.setFormula('startColumn', '=2');
    expect(shape.startColumn()).toBe(0);
    expect(shape.getFormula('startColumn')).toBe('');
    shape.setFormula('isLocked', '=1');
    expect(shape.isLocked()).toBe(true);
  });

  it('clears a formula and reads the geometry back as the trial does', () => {
    const shape = sheet.shapes.add('r1', Shapes.AutoShapeType.rectangle, 10, 20, 100, 50);
    shape.setFormula('x', '=15');
    shape.setFormula('x', '');
    expect(shape.getFormula('x')).toBeUndefined();
    expect(shape.x()).toBe('');
    shape.x('=25');
    expect(shape.x()).toBe(25);
    expect(shape.getFormula('x')).toBe('=25');
  });
});

describe('ShapeBase hyperlink and name', () => {
  it('reads the hyperlink object back and answers null after clearing it', () => {
    const shape = sheet.shapes.add('r1', Shapes.AutoShapeType.rectangle, 10, 20, 100, 50);
    expect(shape.hyperlink()).toBeNull();
    shape.hyperlink({ url: 'https://example.com', tooltip: 'tip' });
    expect(shape.hyperlink()).toEqual({ url: 'https://example.com', tooltip: 'tip' });
    shape.hyperlink(null);
    expect(shape.hyperlink()).toBeNull();
  });

  it('rejects an empty name with the trial message', () => {
    const shape = sheet.shapes.add('r1', Shapes.AutoShapeType.rectangle, 10, 20, 100, 50);
    expect(() => shape.name('')).toThrow('Empty name.');
    expect(shape.name('r9')).toBe(shape);
    expect(shape.name()).toBe('r9');
  });
});

describe('ShapeBase image snapshot', () => {
  it('returns a PNG data URL for the painted shape and resolves the async pair to it', () => {
    const shape = sheet.shapes.add('r1', Shapes.AutoShapeType.rectangle, 10, 20, 100, 50);
    expect(shape.toImageSrc()).toMatch(/^data:image\/png;base64,/);
    return expect(shape.toImageSrcAsync()).resolves.toMatch(/^data:image\/png;base64,/);
  });

  it('paints connectors, pictures, cameras, controls and hidden shapes as well', () => {
    const connector = sheet.shapes.addConnector('c1', 1, 10, 10, 90, 70);
    const picture = sheet.shapes.addPictureShape('p1', 'data:,x', 0, 0, 20, 20);
    const camera = sheet.shapes.addCameraShape('cam', 'Sheet1!$A$1:$B$2', 0, 0, 40, 30);
    const control = sheet.shapes.addFormControl('fb', 'checkBox', 0, 0, 100, 24);
    const hidden = sheet.shapes.add('hidden', Shapes.AutoShapeType.rectangle, 0, 0, 30, 30);
    hidden.isVisible(false);
    for (const handle of [connector, picture, camera, control, hidden])
      expect(handle.toImageSrc(), String(handle.name())).toMatch(/^data:image\/png;base64,/);
  });

  it('redraws when the shape is resized and answers a stable source otherwise', () => {
    const heart = sheet.shapes.add('heart', Shapes.AutoShapeType.heart, 0, 0, 60, 50);
    const before = heart.toImageSrc();
    expect(before).toBe(heart.toImageSrc());
    heart.width(120);
    expect(heart.toImageSrc()).not.toBe(before);
  });
});

describe('GroupShape over ShapeBase', () => {
  it('auto-names the handle GroupShape N and answers the trial group defaults', () => {
    const a = sheet.shapes.add('a', Shapes.AutoShapeType.rectangle, 0, 0, 50, 50);
    const b = sheet.shapes.add('b', Shapes.AutoShapeType.rectangle, 100, 0, 50, 50);
    const group = sheet.shapes.group([a, b]) as InstanceType<typeof Shapes.GroupShape>;
    expect(group.name()).toBe('GroupShape 1');
    expect([group.allowMove(), group.isVisible(), group.canPrint(), group.dynamicMove()]).toEqual([true, true, true, true]);
    expect(group.alt()).toBe('');
    expect(group.isSelected()).toBe(false);
    expect(group.hyperlink()).toBeNull();
    expect([group.x(), group.y(), group.width(), group.height()]).toEqual([0, 0, 150, 50]);
    expect([group.startRow(), group.endRow()]).toEqual([0, 2]);
    expect(group.all().map(item => item.name())).toEqual(['a', 'b']);
    expect(group.find('a')).toBe(a);
    expect(group.toImageSrc()).toMatch(/^data:image\/png;base64,/);
  });

  it('takes the declared (worksheet, name?) constructor', () => {
    const bare = new Shapes.GroupShape(sheet) as InstanceType<typeof Shapes.GroupShape>;
    expect(bare.name()).toBe('GroupShape 1');
    expect(bare.all()).toEqual([]);
    expect(bare.alt()).toBe('');
    const named = new Shapes.GroupShape(sheet, 'MyGroup') as InstanceType<typeof Shapes.GroupShape>;
    expect(named.name()).toBe('MyGroup');
  });

  it('keeps group flags on the group and out of the members', () => {
    const a = sheet.shapes.add('a', Shapes.AutoShapeType.rectangle, 0, 0, 50, 50);
    const b = sheet.shapes.add('b', Shapes.AutoShapeType.rectangle, 100, 0, 50, 50);
    const group = sheet.shapes.group([a, b]) as InstanceType<typeof Shapes.GroupShape>;
    group.alt('group text');
    expect(group.alt()).toBe('group text');
    expect(a.alt()).toBe('');
    group.isVisible(false);
    expect(group.isVisible()).toBe(false);
    expect(a.isVisible()).toBe(true);
  });

  it('reads and moves the member slot through zIndex', () => {
    const a = sheet.shapes.add('a', Shapes.AutoShapeType.rectangle, 0, 0, 50, 50);
    const b = sheet.shapes.add('b', Shapes.AutoShapeType.rectangle, 100, 0, 50, 50);
    const group = sheet.shapes.group([a, b]) as InstanceType<typeof Shapes.GroupShape>;
    expect(group.zIndex('a')).toBe(0);
    expect(group.zIndex('a', 2)).toBeUndefined();
    expect(group.zIndex('a')).toBe(1);
    expect(group.all().map(item => item.name())).toEqual(['b', 'a']);
  });
});
