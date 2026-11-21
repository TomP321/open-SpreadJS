// @vitest-environment jsdom
/**
 * TASK 81 core gap 2: the official d.ts declares `text()` ONLY on `Shape` (`PictureShape`,
 * `CameraShape`, `ConnectorShape` and `GroupShape` extend `ShapeBase`), and the live trial
 * confirms it (probe 2026-11-20: `pic.text`/`cam.text`/`conn.text`/`grp.text` answer undefined;
 * this is the accessor-11 diff of the `pasteLinkedPicture` sweep row). Our hierarchy now mirrors
 * the d.ts: `ModelShape` carries the shared model machinery WITHOUT the text accessors,
 * `Shape` (and `FormControlShape` through it) owns `text()`/`textColor()`.
 */
import { describe, expect, it } from 'vitest';
import GC from '../src/index.js';
import type { CameraShape } from '../src/features/shapes.js';
import type { Worksheet } from '../src/model.js';

const Shapes = GC.Spread.Sheets.Shapes;

const surface = (obj: unknown): Record<string, unknown> => obj as Record<string, unknown>;

describe('TASK 81 ShapeBase family: no text() off Shape', () => {
  const sheet = new GC.Spread.Sheets.Worksheet('Data') as Worksheet;
  const picture = sheet.shapes.addPictureShape('P1', 'data:image/png;base64,x', 0, 0, 10, 10);
  const camera = sheet.shapes.addCameraShape('C1', '=Data!$A$1:$B$2', 20, 0, 30, 20);
  const connector = sheet.shapes.addConnector('K1', 0, 40, 0, 90, 40);
  const control = sheet.shapes.addFormControl('F1', 'checkBox', 100, 0, 20, 20);
  const rect = sheet.shapes.add('R1', Shapes.AutoShapeType.rectangle, 140, 0, 20, 20);
  const group = sheet.shapes.group([picture, rect])!;

  it('class hierarchy matches the official d.ts', () => {
    expect(picture).toBeInstanceOf(Shapes.PictureShape);
    expect(picture).toBeInstanceOf(Shapes.ShapeBase);
    expect(picture).not.toBeInstanceOf(Shapes.Shape);
    expect(camera).toBeInstanceOf(Shapes.CameraShape);
    expect(camera).not.toBeInstanceOf(Shapes.Shape);
    expect(connector).toBeInstanceOf(Shapes.ConnectorShape);
    expect(connector).not.toBeInstanceOf(Shapes.Shape);
    expect(control).toBeInstanceOf(Shapes.FormControlShape);
    expect(control).toBeInstanceOf(Shapes.Shape); // official: FormControlShape extends Shape
    expect(group).toBeInstanceOf(Shapes.GroupShape);
    expect(group).toBeInstanceOf(Shapes.ShapeBase);
    expect(group).not.toBeInstanceOf(Shapes.Shape);
  });

  it('text-bearing accessors live only on Shape and FormControlShape', () => {
    for (const item of [picture, camera, connector, group]) {
      expect(typeof surface(item).text, `${item.name()}.text`).toBe('undefined');
      expect(typeof surface(item).textColor, `${item.name()}.textColor`).toBe('undefined');
    }
    for (const item of [rect, control]) {
      expect(typeof surface(item).text, `${item.name()}.text`).toBe('function');
      expect(typeof surface(item).textColor, `${item.name()}.textColor`).toBe('function');
    }
    // The trial's text-bearing handle answers the accessor pair; the others stay functional.
    rect.text('hello');
    expect(rect.text()).toBe('hello');
    expect(picture.src()).toBe('data:image/png;base64,x');
    expect(camera.range()).toBe('=Data!$A$1:$B$2');
    expect(camera.cellRange()).toBe('=Data!$A$1:$B$2');
    expect(connector.preset()).toBe('line');
    expect(group.all().length).toBe(2);
  });

  it('picture/camera keep their trial-class accessors and geometry', () => {
    picture.pictureFormat({ grayscale: true });
    expect(picture.pictureFormat()).toEqual({ grayscale: true });
    picture.geometryType('oval');
    expect(picture.geometryType()).toBe('oval');
    expect([picture.getOriginalWidth(), picture.getOriginalHeight()]).toEqual([0, 0]); // not loaded
    expect([picture.x(), picture.y(), picture.width(), picture.height()]).toEqual([0, 0, 10, 10]);
    expect(camera.doubleClickCommand('openUrl')).toBe(camera);
    camera.rotate(30);
    expect(camera.rotate()).toBe(30);
  });

  it('JSON restore rebuilds the trial classes (a restored camera carries no text either)', () => {
    const other = new GC.Spread.Sheets.Worksheet('Other') as Worksheet;
    other.fromJSON(JSON.parse(JSON.stringify(sheet.toJSON())) as never);
    const entries = other.shapes.all();
    const restoredPicture = other.shapes.get('P1')!;
    const restoredCamera = other.shapes.get('C1')!;
    const restoredControl = other.shapes.get('F1')!;
    const restoredRect = other.shapes.get('R1')!;
    const restoredGroup = other.shapes.get('GroupShape 1')!;
    expect(entries.length).toBe(4); // top level only: group + camera + connector + control... minus? see below
    expect(restoredPicture).toBeInstanceOf(Shapes.PictureShape);
    expect(restoredCamera).toBeInstanceOf(Shapes.CameraShape);
    expect(restoredRect).toBeInstanceOf(Shapes.Shape);
    expect(restoredControl).toBeInstanceOf(Shapes.FormControlShape);
    expect(restoredGroup).toBeInstanceOf(Shapes.GroupShape);
    expect(typeof surface(restoredCamera).text).toBe('undefined');
    expect(typeof surface(restoredPicture).text).toBe('undefined');
    expect(typeof surface(restoredRect).text).toBe('function');
    expect(restoredRect.text()).toBe('hello'); // text written in the fixture above, serialized and restored
    expect((restoredCamera as unknown as CameraShape).range()).toBe('=Data!$A$1:$B$2');
  });

  it('group entries carry the drawing-pipeline probes but no shape-style surface', () => {
    expect(group.isCamera()).toBe(false);
    expect(group.isPicture()).toBe(false);
    expect(group.isFormControl()).toBe(false);
    // The trial group answers no fill()/line()/style()/type() either.
    for (const key of ['fill', 'line', 'style', 'type', 'shapeType']) {
      expect(typeof surface(group)[key], `group.${key}`).toBe('undefined');
    }
  });
});
