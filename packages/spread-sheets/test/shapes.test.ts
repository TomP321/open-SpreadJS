// @vitest-environment jsdom
/* Shapes: collection API, naming, camera/form controls, JSON round-trip and grouping. */
import { beforeEach, describe, expect, it } from 'vitest';
import GC from '../src/index.js';
import type { Shape, ShapeControl, ShapeFill, ShapeLine } from '../src/features/shapes.js';
import { autoShapeTypeName } from '../src/features/shapes.js';
import type { Worksheet } from '../src/model.js';

const Shapes = GC.Spread.Sheets.Shapes;

// jsdom has no 2D canvas backend; record the painting calls and hand back a PNG data URL.
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
  value() { return 'data:image/png;base64,PROBE'; },
  configurable: true,
});

let sheet: Worksheet;
beforeEach(() => {
  const workbook = new GC.Spread.Sheets.Workbook();
  workbook.setSheetCount(1);
  sheet = workbook.getActiveSheet() as Worksheet;
  workbook.destroy?.();
});

describe('ShapeCollection', () => {
  it('adds, finds, removes and stacks shapes', () => {
    const shapes = sheet.shapes;
    const rect = new Shapes.Shape('rectangle 1', 1, 10, 10, 100, 50);
    const oval = new Shapes.Shape('oval 1', 9, 20, 20, 40, 40);
    shapes.add(rect); shapes.add(oval);
    expect(shapes.all().map((item: Shape) => item.name())).toEqual(['rectangle 1', 'oval 1']);
    expect(shapes.get('oval 1')).toBe(oval);
    expect(shapes.zIndex('oval 1')).toBe(1);
    shapes.bringForward('rectangle 1');
    expect(shapes.zIndex('rectangle 1')).toBe(1);
    shapes.sendBackward('rectangle 1');
    expect(shapes.canBringForward('rectangle 1')).toBe(true);
    expect(shapes.canSendBackward('rectangle 1')).toBe(false);
    shapes.remove('oval 1');
    expect(shapes.all().length).toBe(1);
  });

  it('rejects duplicate names and generates trial-style per-family names', () => {
    const shapes = sheet.shapes;
    shapes.add(new Shapes.Shape('rectangle 1', 1, 0, 0, 10, 10));
    expect(() => shapes.add(new Shapes.Shape('rectangle 1', 1, 0, 0, 10, 10))).toThrow(/already exists/);
    expect(shapes.nextName('rectangle')).toBe('rectangle 2');
    expect(shapes.nextName('oval')).toBe('oval 1');
    expect(shapes.uniqueName('rectangle 1')).toBe('rectangle 1 2');
  });

  it('creates camera, picture, text box and form-control shapes with the trial defaults', () => {
    const shapes = sheet.shapes;
    const camera = shapes.addCameraShape('Picture 1', '=Sheet1!$A$1:$B$2', 5, 6, 100, 40);
    expect(camera.isCamera()).toBe(true);
    expect(camera.cellRange()).toBe('=Sheet1!$A$1:$B$2');
    // Trial value (probe f40sh6-style): a camera shape carries a solid white fill and a hairline black line.
    expect((camera.fill() as ShapeFill).visible).toBe(true);
    expect((camera.fill() as ShapeFill).color).toBe('#ffffff');
    expect((camera.line() as ShapeLine).color).toBe('#000000');
    expect((camera.line() as ShapeLine).width).toBe(0.75);
    const picture = shapes.addPictureShape('Picture 2', 'data:image/png;base64,x', 0, 0, 80, 60);
    expect(picture.isPicture()).toBe(true);
    const box = shapes.addTextBox('rectangle 3', 0, 0, 120, 60);
    expect(box.txBox()).toBe(true);
    expect((box.line() as ShapeLine).visible).toBe(false);
    const check = shapes.addFormControl('Check Box', { objectType: 'CheckBox' }, 0, 0, 120, 24);
    expect(check.isFormControl()).toBe(true);
    expect((check.control() as ShapeControl | null)?.objectType).toBe('CheckBox');
  });

  it('round-trips shapes through the worksheet JSON', () => {
    const shapes = sheet.shapes;
    const rect = new Shapes.Shape('rectangle 1', 1, 12, 13, 140, 90);
    rect.fill({ color: '#ff0000' });
    rect.line({ width: 3, color: '#00ff00' });
    rect.text('hello');
    rect.rotation(30);
    shapes.add(rect);
    shapes.addCameraShape('Picture 1', '=Sheet1!$A$1:$B$2', 1, 2, 30, 40);
    const json = JSON.parse(JSON.stringify(sheet.toJSON())) as { shapes: unknown[] };
    expect(json.shapes.length).toBe(2);
    const other = new GC.Spread.Sheets.Worksheet('Other') as Worksheet;
    other.fromJSON(json as never);
    const restored = other.shapes.all();
    expect(restored.map((item: Shape) => item.name())).toEqual(['rectangle 1', 'Picture 1']);
    expect((restored[0].fill() as ShapeFill).color).toBe('#ff0000');
    expect((restored[0].line() as ShapeLine).width).toBe(3);
    expect(restored[0].text()).toBe('hello');
    expect(restored[0].rotation()).toBe(30);
    expect(restored[1].cellRange()).toBe('=Sheet1!$A$1:$B$2');
  });

  it('a grouped member moves individually; the group handle moves the whole group; ungroup releases', () => {
    const shapes = sheet.shapes;
    const a = new Shapes.Shape('rectangle 1', 1, 10, 10, 50, 50);
    const b = new Shapes.Shape('rectangle 2', 1, 200, 10, 50, 50);
    shapes.add(a); shapes.add(b);
    const group = shapes.group([a, b]);
    expect(group).toBeTruthy();
    expect(a.groupId()).toBe(group?.groupId());
    expect(group?.all().map(item => item.name())).toEqual(['rectangle 1', 'rectangle 2']);
    // Trial rule (probe t81-movechain2, 2026-11-21): `a.x(30)` on a grouped member moves ONLY `a`;
    // the sibling and the group frame stay put (the old TASK 75-era sibling chain was our own rule).
    a.x(30);
    expect(b.x()).toBe(200);
    expect(group?.x()).toBe(10);
    // Moving the GROUP handle translates frame and members together.
    group?.x(20);
    expect([a.x(), b.x(), group?.x()]).toEqual([40, 210, 20]);
    shapes.ungroup(group as never);
    expect(a.groupId()).toBeNull();
    a.x(0);
    expect(b.x()).toBe(210);
  });

  it('hit-tests the top-most shape and reports the used range', () => {
    const shapes = sheet.shapes;
    const bottom = new Shapes.Shape('rectangle 1', 1, 0, 0, 100, 100);
    const top = new Shapes.Shape('rectangle 2', 1, 50, 50, 100, 100);
    shapes.add(bottom); shapes.add(top);
    expect(shapes.hitTest(60, 60)?.name()).toBe('rectangle 2');
    expect(shapes.hitTest(10, 10)?.name()).toBe('rectangle 1');
    expect(shapes.hitTest(500, 500)).toBeUndefined();
    expect(shapes.getUsedRange()).toEqual({ x: 0, y: 0, width: 150, height: 150 });
  });
});

describe('AutoShapeType', () => {
  it('exposes the public enum values used by the trial', () => {
    const types = Shapes.AutoShapeType as unknown as Record<string, number>;
    expect(types.rectangle).toBe(1);
    expect(types.oval).toBe(9);
    expect(types.line).toBe(183);
    expect(Object.keys(types).filter(key => !/^\d+$/.test(key)).length).toBe(183);
    expect(autoShapeTypeName(9)).toBe('oval');
    expect(autoShapeTypeName(183)).toBe('line');
  });
});

describe('public shapes API (drop-in forms)', () => {
  it('creates shapes through the documented constructor and collection signatures', () => {
    const shape = new Shapes.Shape(sheet, 'rect a', Shapes.AutoShapeType.oval, 5, 6, 30, 20);
    sheet.shapes.add(shape);
    const added = sheet.shapes.add('rect b', Shapes.AutoShapeType.roundedRectangle, 40, 5, 60, 30);
    expect(sheet.shapes.all().map(item => item.name())).toEqual(['rect a', 'rect b']);
    expect(added.type()).toBe(5);
    expect(shape.type()).toBe(9);
    shape.type(Shapes.AutoShapeType.diamond);
    expect(shape.shapeType()).toBe(4);
  });

  it('exposes rotate, isTextBox, adjustments, style, formula and snapshot accessors', () => {
    const shape = sheet.shapes.add('rotator', 1, 0, 0, 40, 40);
    shape.rotate(45);
    expect(shape.rotate()).toBe(45);
    expect(shape.rotation()).toBe(45);
    shape.adjustments([16667]);
    expect(shape.adjustments()).toEqual([16667]);
    shape.style({ fill: { color: '#ff0000' }, line: { width: 4 } });
    expect((shape.style() as InstanceType<typeof Shapes.ShapeStyle>).fill).toMatchObject({ color: '#ff0000' });
    expect((shape.fill() as ShapeFill).color).toBe('#ff0000');
    shape.isTextBox(true);
    expect(shape.txBox()).toBe(true);
    shape.setFormula('x', '=10+5');
    expect(shape.getFormula('x')).toBe('=10+5');
    shape.setFormula('width', '50');
    expect(shape.width()).toBe(50);
    // Trial value: `toImageSrc()` answers a PNG data URL of the painted shape (probe f40sh2-image).
    expect(shape.toImageSrc()).toMatch(/^data:image\/png;base64,/);
    return expect(shape.toImageSrcAsync()).resolves.toMatch(/^data:image\/png;base64,/);
  });

  it('adds camera, picture, form-control and connector shapes as their public classes', () => {
    const camera = sheet.shapes.addCameraShape('Picture 1', '=Sheet1!$A$1:$B$2', 1, 2, 30, 40);
    expect(camera).toBeInstanceOf(Shapes.CameraShape);
    expect(camera.range()).toBe('=Sheet1!$A$1:$B$2');
    const picture = sheet.shapes.addPictureShape('Picture 2', 'data:,x', 0, 0, 10, 10);
    expect(picture).toBeInstanceOf(Shapes.PictureShape);
    const control = sheet.shapes.addFormControl('Check Box', 'checkBox', 0, 0, 100, 20);
    expect(control).toBeInstanceOf(Shapes.FormControlShape);
    expect(control.formControlType()).toBe('CheckBox');
    expect(control.enabled()).toBe(true);
    control.enabled(false);
    expect(control.enabled()).toBe(false);
    const connector = sheet.shapes.addConnector('Connector 1', 1, 100, 100, 200, 160);
    expect(connector).toBeInstanceOf(Shapes.ConnectorShape);
    expect([connector.x(), connector.y(), connector.width(), connector.height()]).toEqual([100, 100, 100, 60]);
    expect(connector.preset()).toBe('Elbow');
  });

  it('groups shapes into a GroupShape handle and moves membership', () => {
    const a = sheet.shapes.add('a', 1, 0, 0, 20, 20);
    const b = sheet.shapes.add('b', 1, 100, 0, 20, 20);
    const c = sheet.shapes.add('c', 1, 200, 0, 20, 20);
    const group = sheet.shapes.group([a, b]);
    expect(group).toBeInstanceOf(Shapes.GroupShape);
    expect(group?.all().length).toBe(2);
    expect(group?.find('b')).toBe(b);
    group?.add(c);
    expect(group?.all().map(item => item.name())).toEqual(['a', 'b', 'c']);
    group?.remove(c);
    expect(c.groupId()).toBeNull();
    group?.rotate(30);
    expect(a.rotation()).toBe(30);
    // TASK 81 trial rule (live probe 2026-11-20): group() ALWAYS answers a GroupShape — a single
    // shape groups alone (the trial named it `GroupShape 4`) and the shape leaves the top level.
    const single = sheet.shapes.group([a]);
    expect(single).toBeInstanceOf(Shapes.GroupShape);
    expect(sheet.shapes.all().map((item) => item.name())).not.toContain('a');
    expect(single.all().map((item) => item.name())).toEqual(['a']);
  });
});
