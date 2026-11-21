// @vitest-environment jsdom
/**
 * TASK 81 core gap 1: nested shape groups (grpSp model). Every rule below was measured on the
 * LIVE trial through the public API (2026-11-20 probe series, apps/designer-compare 5188; the
 * sweep evidence is `.probe/t77/run/` + docs/STATUS.md "TASK 77" item 1):
 * - `shapes.group([a,b])` leaves ONE top-level entry (`GroupShape 1`); the members answer only
 *   `GroupShape.all()`; the group sits at its highest member slot minus the members left of it;
 * - `group([])` creates an EMPTY group at index 0 answering x/y/width/height -1 and rotate 0
 *   (exactly the `shapeGroup` sweep row), `group([a])` groups a single shape;
 * - `ungroup(g)` releases the members back to the group's slot in member order; ungrouping a
 *   NESTED group promotes the inner group (it stays a group);
 * - `group.add(shape)` adopts a top-level shape; `group.remove(shape)` drops it (trial: neither
 *   `all()` nor `get()` answers it afterwards); deleting a group deletes its members;
 * - `shapes.get(name)` still finds nested members;
 * - the JSON round-trip keeps the nesting byte-stable.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import GC from '../src/index.js';
import type { CameraShape, GroupShape, Shape } from '../src/features/shapes.js';
import type { Worksheet } from '../src/model.js';

const Shapes = GC.Spread.Sheets.Shapes;
const RECT = Shapes.AutoShapeType.rectangle;

let sheet: Worksheet;
beforeEach(() => {
  sheet = new GC.Spread.Sheets.Worksheet('Data') as Worksheet;
});

const add = (name: string, x: number, y: number, width = 20, height = 20): Shape =>
  sheet.shapes.add(name, RECT, x, y, width, height);
const names = (): string[] => sheet.shapes.all().map((item) => String(item.name()));

describe('TASK 81 grouping leaves a top-level GroupShape entry', () => {
  it('hides grouped members from all() and answers them through the group handle', () => {
    const a = add('a', 0, 0), b = add('b', 100, 0), c = add('c', 200, 0);
    const group = sheet.shapes.group([a, b]);
    expect(group).toBeInstanceOf(Shapes.GroupShape);
    expect(group?.name()).toBe('GroupShape 1');
    expect(names()).toEqual(['GroupShape 1', 'c']);
    expect(group?.all().map((item) => item.name())).toEqual(['a', 'b']);
    expect(group?.find('b')).toBe(b);
    expect(a.groupId()).toBe('GroupShape 1');
    expect(c.groupId()).toBeNull();
    // Trial group geometry: the member bounding box (probe: 0,0,120,20 for two 20 px rects at 0/100).
    expect([group?.x(), group?.y(), group?.width(), group?.height()]).toEqual([0, 0, 120, 20]);
  });

  it('inserts the group at its highest member slot minus the members left of it (trial rule)', () => {
    const s1 = add('s1', 0, 0), s2 = add('s2', 100, 0), s3 = add('s3', 200, 0), s4 = add('s4', 300, 0);
    let group = sheet.shapes.group([s2, s3]);
    expect(names()).toEqual(['s1', 'GroupShape 1', 's4']); // trial probe: middle pair -> slot 1
    sheet.shapes.ungroup(group as never);
    group = sheet.shapes.group([s1, s4]);
    expect(names()).toEqual(['s2', 's3', 'GroupShape 1']); // trial probe: extremes -> slot 2
    // Ungroup releases the members at the group slot, in member order (trial afterUngroup2).
    sheet.shapes.ungroup(group as never);
    expect(names()).toEqual(['s2', 's3', 's1', 's4']);
  });

  it('group([]) creates the trial empty group: index 0, the -1 box, rotate 0', () => {
    const rect1 = add('rect1', 100, 100, 150, 100);
    const group = sheet.shapes.group([]);
    expect(group).toBeInstanceOf(Shapes.GroupShape);
    expect(group?.name()).toBe('GroupShape 1');
    expect(names()).toEqual(['GroupShape 1', 'rect1']); // the shapeGroup sweep row exactly
    expect([group?.x(), group?.y(), group?.width(), group?.height()]).toEqual([-1, -1, -1, -1]);
    expect(group?.rotate()).toBe(0);
    expect(group?.all()).toEqual([]);
    expect(rect1.groupId()).toBeNull();
    // GroupShape carries no text accessor (trial probe: `grp.text` answers undefined).
    expect((group as unknown as Record<string, unknown>).text).toBeUndefined();
  });

  it('group([a]) groups a single shape (trial probe 2026-11-20)', () => {
    const a = add('a', 0, 0);
    const group = sheet.shapes.group([a]);
    expect(group).toBeInstanceOf(Shapes.GroupShape);
    expect(names()).toEqual(['GroupShape 1']);
    expect(group?.all().map((item) => item.name())).toEqual(['a']);
  });

  it('reuses a freed GroupShape name (trial: group/ungroup/regroup -> GroupShape 1 again)', () => {
    const a = add('a', 0, 0), b = add('b', 100, 0);
    const g1 = sheet.shapes.group([a, b]);
    expect(g1?.name()).toBe('GroupShape 1');
    sheet.shapes.ungroup(g1 as never);
    const g2 = sheet.shapes.group([a, b]);
    expect(g2?.name()).toBe('GroupShape 1');
  });
});

describe('TASK 81 GroupShape auto-name rule (trial probes 2026-11-21, .probe/t77/run/t81-groupnames*.json)', () => {
  // Trial rule: candidate = 1 while no group handle is alive, else (#top-level entries) + 1;
  // a taken candidate walks UP until free; disposed handles free their name.
  it('names the pairwise grouping of five shapes 1, 5, 4 and the empty group 6 (probe S1/X1)', () => {
    const a = add('a', 0, 0), b = add('b', 60, 0), c = add('c', 120, 0), d = add('d', 180, 0), e = add('e', 240, 0);
    expect(sheet.shapes.group([a, b])!.name()).toBe('GroupShape 1');
    expect(sheet.shapes.group([c, d])!.name()).toBe('GroupShape 5');
    expect(sheet.shapes.group([e])!.name()).toBe('GroupShape 4');
    expect(sheet.shapes.group([])!.name()).toBe('GroupShape 6'); // candidate 4 taken -> 5 taken -> 6
  });

  it('a group after four members leaves entry count 3 -> GroupShape 4 then 5 (probe C1/C7)', () => {
    const a = add('a', 0, 0), b = add('b', 60, 0), c = add('c', 120, 0), d = add('d', 180, 0), e = add('e', 240, 0), f = add('f', 300, 0), g = add('g', 360, 0);
    expect(sheet.shapes.group([a, b])!.name()).toBe('GroupShape 1');
    expect(sheet.shapes.group([c, d, e, f])!.name()).toBe('GroupShape 7'); // 3 entries + 1
    expect(sheet.shapes.group([])!.name()).toBe('GroupShape 4'); // 3 entries + 1 (4 free)
    expect(sheet.shapes.group([g])!.name()).toBe('GroupShape 5'); // 4 entries + 1
  });

  it('after ungrouping everything the counter restarts at 1 and the entries rule resumes (probe C10)', () => {
    const a = add('a', 0, 0), b = add('b', 60, 0), c = add('c', 120, 0), d = add('d', 180, 0), e = add('e', 240, 0);
    const g1 = sheet.shapes.group([a, b])!;
    sheet.shapes.ungroup(g1); // no live group left
    const g2 = sheet.shapes.group([c, d])!;
    expect(g2.name()).toBe('GroupShape 1');
    expect(sheet.shapes.group([e])!.name()).toBe('GroupShape 5'); // entries [a,b,G1,e] + 1
  });

  it('deleting every group restarts the counter at GroupShape 1 (probe C3)', () => {
    const a = add('a', 0, 0), b = add('b', 60, 0), c = add('c', 120, 0), d = add('d', 180, 0);
    sheet.shapes.group([a, b]);
    sheet.shapes.group([c, d]);
    sheet.shapes.remove('GroupShape 1');
    sheet.shapes.remove('GroupShape 4');
    expect(sheet.shapes.all()).toEqual([]);
    const x = add('x', 240, 0), y = add('y', 300, 0);
    expect(sheet.shapes.group([x, y])!.name()).toBe('GroupShape 1');
  });

  it('constructor-created groups name 1, 2 and count as alive for later groups (probes C2/C9)', () => {
    const g0 = new Shapes.GroupShape(sheet);
    expect(g0.name()).toBe('GroupShape 1');
    const g1 = new Shapes.GroupShape(sheet);
    expect(g1.name()).toBe('GroupShape 2'); // candidate 1 taken -> 2
    const named = new Shapes.GroupShape(sheet, 'MyGroup');
    expect(named.name()).toBe('MyGroup');
    const a = add('a', 0, 0), b = add('b', 60, 0);
    expect(sheet.shapes.group([a, b])!.name()).toBe('GroupShape 3'); // alive groups -> entries 2 + 1
  });

  it('groups loaded through fromJSON: no live GroupShape 1 -> next name 1 (probe C8c only9/nine12)', () => {
    const other = new GC.Spread.Sheets.Worksheet('Other') as Worksheet;
    other.fromJSON({
      shapes: [
        { name: 'GroupShape 9', shapeType: 3, x: 0, y: 0, width: 100, height: 40, children: [
          { name: 'cx', shapeType: 1, x: 0, y: 0, width: 40, height: 40 },
          { name: 'cy', shapeType: 1, x: 60, y: 0, width: 40, height: 40 } ] },
        { name: 'GroupShape 12', shapeType: 3, x: 120, y: 0, width: 100, height: 40, children: [
          { name: 'cz', shapeType: 1, x: 120, y: 0, width: 40, height: 40 } ] },
      ],
    } as never);
    const S2 = other.shapes;
    expect(S2.all().map((item) => String(item.name()))).toEqual(['GroupShape 9', 'GroupShape 12']);
    const x = other.shapes.add('x', RECT, 240, 0, 40, 40), y = other.shapes.add('y', RECT, 300, 0, 40, 40);
    expect(S2.group([x, y])!.name()).toBe('GroupShape 1'); // no live GroupShape 1 -> 1
  });

  it('groups loaded through fromJSON: live GroupShape 1 -> entries rule continues (probe C8c one4)', () => {
    const other = new GC.Spread.Sheets.Worksheet('Other') as Worksheet;
    other.fromJSON({
      shapes: [
        { name: 'GroupShape 1', shapeType: 3, x: 0, y: 0, width: 100, height: 40, children: [
          { name: 'cx', shapeType: 1, x: 0, y: 0, width: 40, height: 40 },
          { name: 'cy', shapeType: 1, x: 60, y: 0, width: 40, height: 40 } ] },
        { name: 'GroupShape 4', shapeType: 3, x: 120, y: 0, width: 100, height: 40, children: [
          { name: 'cz', shapeType: 1, x: 120, y: 0, width: 40, height: 40 } ] },
      ],
    } as never);
    const S2 = other.shapes;
    const x = S2.add('x', RECT, 240, 0, 40, 40), y = S2.add('y', RECT, 300, 0, 40, 40);
    expect(S2.group([x, y])!.name()).toBe('GroupShape 5'); // entries [G1,G4,x,y] + 1
  });

  it('single-member groups follow the entry-count rule (probe C4)', () => {
    const a = add('a', 0, 0), b = add('b', 60, 0), c = add('c', 120, 0), d = add('d', 180, 0);
    expect(sheet.shapes.group([a, b])!.name()).toBe('GroupShape 1');
    expect(sheet.shapes.group([c])!.name()).toBe('GroupShape 4'); // entries [G1,c,d] + 1
    expect(sheet.shapes.all().map((item) => String(item.name()))).toEqual(['GroupShape 1', 'GroupShape 4', 'd']);
    expect(sheet.shapes.get('d')).toBe(d);
  });

  it('six shapes pairwise then grouping the groups: 1, 6, 5, 4 (probe C6)', () => {
    const a = add('a', 0, 0), b = add('b', 60, 0), c = add('c', 120, 0), d = add('d', 180, 0), e = add('e', 240, 0), f = add('f', 300, 0);
    const g1 = sheet.shapes.group([a, b])!; // no live group -> 1
    expect(g1.name()).toBe('GroupShape 1');
    const g2 = sheet.shapes.group([c, d])!; // entries [G1,c,d,e,f] -> 6
    expect(g2.name()).toBe('GroupShape 6');
    const g3 = sheet.shapes.group([e, f])!; // entries [G1,G6,e,f] -> 5
    expect(g3.name()).toBe('GroupShape 5');
    expect(sheet.shapes.group([g1, g2, g3])!.name()).toBe('GroupShape 4'); // entries [G1,G6,G5] -> 4
    expect(sheet.shapes.all().map((item) => String(item.name()))).toEqual(['GroupShape 4']);
  });
});

describe('TASK 81 nested groups', () => {
  it('group([inner, c]) nests and all() answers only the outer handle', () => {
    const a = add('a', 0, 0), b = add('b', 100, 0), c = add('c', 200, 0);
    const inner = sheet.shapes.group([a, b])!;
    const outer = sheet.shapes.group([inner, c])!;
    expect(outer).toBeInstanceOf(Shapes.GroupShape);
    expect(names()).toEqual(['GroupShape 3']); // trial probe A (2026-11-21): live group + 2 entries -> candidate 3
    expect(outer.all().map((item) => item.name())).toEqual(['GroupShape 1', 'c']);
    expect(inner.all().map((item) => item.name())).toEqual(['a', 'b']);
    // The outer box is the union of everything inside it.
    expect([outer.x(), outer.y(), outer.width(), outer.height()]).toEqual([0, 0, 220, 20]);
    // get() reaches the deepest member (trial: shapes.get('a') true inside the nest).
    expect(sheet.shapes.get('a')).toBe(a);
    // Ungrouping the outer promotes the inner, which STAYS a group (trial probe).
    sheet.shapes.ungroup(outer);
    expect(names()).toEqual(['GroupShape 1', 'c']);
    const promoted = sheet.shapes.get('GroupShape 1')!;
    expect(promoted).toBeInstanceOf(Shapes.GroupShape);
    expect((promoted as unknown as GroupShape).all().map((item) => item.name())).toEqual(['a', 'b']);
  });

  it('moves every member together; resize scales the members from the grouping-time layout', () => {
    const a = add('a', 0, 0), b = add('b', 100, 0);
    const group = sheet.shapes.group([a, b])!;
    group.x(50);
    expect([a.x(), b.x()]).toEqual([50, 150]);
    expect(group.x()).toBe(50);
    group.height(40); // factor 40/20 = 2 on every member
    expect([a.height(), b.height()]).toEqual([40, 40]);
    // Trial rule (probe t81-movechain2): a member moved on its own does NOT drag the siblings or
    // the group frame, and a later group resize re-derives it from the grouping-time layout.
    a.x(100);
    expect([a.x(), b.x(), group.x(), group.width()]).toEqual([100, 150, 50, 120]);
    group.width(240); // factor 2 from the snapshot: a -> frame 50 + 0*2, b -> 50 + 100*2
    expect([a.x(), a.width(), b.x(), b.width()]).toEqual([50, 40, 250, 40]);
  });

  it('the frame is the member box at grouping time and stays static (trial probe t81-movechain)', () => {
    const a = add('a', 20, 20, 120, 80), b = add('b', 150, 60, 100, 70), c = add('c', 40, 140, 140, 50);
    const inner = sheet.shapes.group([a, b])!;
    const outer = sheet.shapes.group([inner, c])!;
    expect([outer.x(), outer.y(), outer.width(), outer.height()]).toEqual([20, 20, 230, 170]);
    outer.x(25); // the whole group translates
    expect([outer.x(), inner.x(), c.x()]).toEqual([25, 25, 45]);
    inner.x(30); // the inner group translates its own members; the outer frame stays put
    expect([inner.x(), a.x(), b.x(), outer.x(), outer.width(), c.x()]).toEqual([30, 30, 160, 25, 230, 45]);
    a.x(60); // a plain member move: only `a` moves (trial probe t81-movechain2)
    expect([a.x(), b.x(), inner.x(), inner.width(), outer.x(), outer.width(), c.x()]).toEqual([60, 160, 30, 230, 25, 230, 45]);
    // Resize scales everything from the snapshot layout — trial's numbers (factor 300/230).
    outer.width(300);
    expect([outer.x(), outer.width()]).toEqual([25, 300]);
    expect([inner.x(), inner.width()]).toEqual([25, 300]);
    expect(a.x()).toBeCloseTo(25, 9); expect(Number(a.width())).toBeCloseTo(156.52173913043478, 9);
    expect(Number(b.x())).toBeCloseTo(194.56521739130434, 9); expect(Number(b.width())).toBeCloseTo(130.43478260869566, 9);
    expect(Number(c.x())).toBeCloseTo(51.086956521739125, 9); expect(Number(c.width())).toBeCloseTo(182.60869565217394, 9);
  });

  it('GroupShape.add adopts a top-level shape and extends the frame (trial probe t81-addmember)', () => {
    const a = add('a', 20, 20, 120, 80), b = add('b', 150, 60, 100, 70);
    const group = sheet.shapes.group([a, b])!;
    expect([group.x(), group.y(), group.width(), group.height()]).toEqual([20, 20, 230, 110]);
    const c = add('c', 400, 300, 50, 40);
    group.add(c);
    expect(sheet.shapes.all().map((item) => String(item.name()))).toEqual(['GroupShape 1']);
    expect([group.x(), group.y(), group.width(), group.height()]).toEqual([20, 20, 430, 320]); // the trial frame extends
    expect(group.all().map((item) => item.name())).toEqual(['a', 'b', 'c']);
    group.remove(c);
    expect(sheet.shapes.get('c')).toBeUndefined(); // trial: the removed shape leaves the sheet
    expect(sheet.shapes.all().map((item) => String(item.name()))).toEqual(['GroupShape 1']);
    expect(group.all().map((item) => item.name())).toEqual(['a', 'b']);
  });

  it('deleting a group deletes its members; hitTest answers the top-level handle', () => {
    add('c', 200, 0);
    const a = add('a', 0, 0), b = add('b', 100, 0);
    sheet.shapes.group([a, b]);
    expect(sheet.shapes.hitTest(10, 10)?.name()).toBe('GroupShape 1');
    expect(sheet.shapes.hitTest(210, 10)?.name()).toBe('c');
    sheet.shapes.remove('GroupShape 1');
    expect(sheet.shapes.get('a')).toBeUndefined();
    expect(sheet.shapes.get('b')).toBeUndefined();
    expect(names()).toEqual(['c']);
  });

  it('renames keep the membership index in step (ungroup by the new name works)', () => {
    const a = add('a', 0, 0), b = add('b', 100, 0);
    const group = sheet.shapes.group([a, b])!;
    group.name('myGroup');
    expect(a.groupId()).toBe('myGroup');
    expect(names()).toEqual(['myGroup']);
    sheet.shapes.ungroup('myGroup');
    expect(names()).toEqual(['a', 'b']);
    expect(a.groupId()).toBeNull();
  });

  it('zIndex reorders members inside the group handle', () => {
    const a = add('a', 0, 0), b = add('b', 100, 0);
    const group = sheet.shapes.group([a, b])!;
    expect(group.zIndex('b')).toBe(1);
    group.zIndex('b', 0);
    expect(group.all().map((item) => item.name())).toEqual(['b', 'a']);
  });
});

describe('TASK 81 group JSON (toJSON/fromJSON of nested groups)', () => {
  const shapeJson = (sh: Worksheet): Record<string, unknown>[] =>
    JSON.parse(JSON.stringify(sh.toJSON())).shapes as Record<string, unknown>[];

  it('serializes the group as ONE entry with nested children and round-trips byte-stably', () => {
    const a = add('a', 0, 0), b = add('b', 100, 0), c = add('c', 200, 0);
    const inner = sheet.shapes.group([a, b])!;
    sheet.shapes.group([inner, c]);
    const json = shapeJson(sheet);
    expect(json.length).toBe(1); // trial rule: only the top-level entry serializes
    expect(json[0].name).toBe('GroupShape 3');
    expect(json[0].shapeType).toBe(3); // our group marker (the trial grpSp entry carries shapeType 3 too)
    const children = json[0].children as Record<string, unknown>[];
    expect(children.map((item) => item.name)).toEqual(['GroupShape 1', 'c']);
    expect((children[0].children as Record<string, unknown>[]).map((item) => item.name)).toEqual(['a', 'b']);
    // Members no longer serialize a flat groupId (membership lives in the nesting).
    for (const child of children) expect(child.groupId ?? null).toBeNull();

    const other = new GC.Spread.Sheets.Worksheet('Other') as Worksheet;
    other.fromJSON(JSON.parse(JSON.stringify(sheet.toJSON())) as never);
    expect(other.shapes.all().map((item) => item.name())).toEqual(['GroupShape 3']);
    const outer = other.shapes.get('GroupShape 3') as unknown as GroupShape;
    expect(outer).toBeInstanceOf(Shapes.GroupShape);
    expect(outer.all().map((item) => item.name())).toEqual(['GroupShape 1', 'c']);
    const innerOther = outer.find('GroupShape 1') as unknown as unknown as GroupShape;
    expect(innerOther.all().map((item) => item.name())).toEqual(['a', 'b']);
    // Byte-stable round-trip.
    expect(JSON.stringify(shapeJson(other))).toBe(JSON.stringify(json));
  });

  it('rebuilds groups from the pre-TASK-81 flat groupId records (back-compat)', () => {
    const other = new GC.Spread.Sheets.Worksheet('Other') as Worksheet;
    other.fromJSON({
      shapes: [
        { name: 'a', shapeType: 1, x: 0, y: 0, width: 20, height: 20, groupId: 'GroupShape 1' },
        { name: 'b', shapeType: 1, x: 100, y: 0, width: 20, height: 20, groupId: 'GroupShape 1' },
        { name: 'c', shapeType: 1, x: 200, y: 0, width: 20, height: 20 },
      ],
    } as never);
    expect(other.shapes.all().map((item) => item.name())).toEqual(['GroupShape 1', 'c']);
    const group = other.shapes.get('GroupShape 1') as unknown as unknown as GroupShape;
    expect(group.all().map((item) => item.name())).toEqual(['a', 'b']);
  });

  it('a group over a camera keeps the camera inside the group entry', () => {
    const rect = add('rect', 0, 0);
    const camera = sheet.shapes.addCameraShape('Picture 1', '=Data!$A$1:$B$2', 60, 0, 40, 30);
    const group = sheet.shapes.group([rect, camera])!;
    expect(names()).toEqual(['GroupShape 1']);
    expect(group.all().map((item) => item.name())).toEqual(['rect', 'Picture 1']);
    const json = shapeJson(sheet);
    const children = json[0].children as Record<string, unknown>[];
    expect(children[1].cellRange).toBe('=Data!$A$1:$B$2');
    const other = new GC.Spread.Sheets.Worksheet('Other') as Worksheet;
    other.fromJSON(JSON.parse(JSON.stringify(sheet.toJSON())) as never);
    const restored = other.shapes.get('Picture 1') as unknown as CameraShape;
    expect(restored).toBeInstanceOf(Shapes.CameraShape);
    expect(restored.range()).toBe('=Data!$A$1:$B$2');
  });
});
