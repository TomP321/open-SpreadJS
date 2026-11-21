/**
 * TASK 81: designer-side behaviour for the three core parity gaps, measured the same way the
 * 624-command sweep measures them (harness `H.state()` accessors on `apps/designer-compare`,
 * server 5188 — evidence `.probe/t77/run/r4-sweep-*.jsonl` and the 2026-11-20 live-trial
 * re-probes recorded in docs/STATUS.md "TASK 81"):
 * 1. `shapeGroup` with no shape selected — the trial creates an EMPTY `GroupShape 1` at index 0
 *    answering the `-1` box; `shapes.all()` lists the group plus the untouched `rect1`.
 * 2. `pasteLinkedPicture` — the trial's linked-picture handle answers NO `text()` accessor
 *    (state accessor 11 is `ABSENT` on the trial; ours answered `''`).
 * 3. `pivotTableListFormulas` in a session that already created sheets — the trial re-loads
 *    its baseline JSON before every row and the rebased core counter names the report `Sheet2`.
 */
// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from 'vitest';
import GC from '@mescius/spread-sheets';
import { executeShapeCommand } from '../src/designer-shapes.js';
import { applyInsertAction } from '../src/commands/insert.js';
import { insertLinkedPicture } from '../src/commands/clipboard-actions.js';

const DATA = [
  ['Region', 'Q1', 'Q2', 'Q3', 'Q4', 'Total'],
  ['North', 120, 135, 150, 165, 570],
  ['South', 90, 105, 95, 125, 415],
  ['East', 75, 80, 90, 100, 345],
  ['West', 110, 115, 105, 130, 460],
];

function setup(): { sheet: any; designer: any; workbook: any } {
  const workbook = new GC.Spread.Sheets.Workbook();
  const sheet: any = workbook.getActiveSheet();
  sheet.name('Data');
  DATA.forEach((row: (string | number)[], r: number) => row.forEach((value: unknown, c: number) => sheet.setValue(r, c, value)));
  const designer: any = {
    gc: GC,
    getWorkbook: () => workbook,
    spreadsheet: workbook,
    invalidate: () => undefined,
    nextShapeName: (base: string) => sheet.shapes.nextName(base),
  };
  return { sheet, designer, workbook };
}

describe('TASK 81 shapeGroup (the sweep row, reproduced through the designer command)', () => {
  it('creates the trial empty GroupShape 1 at index 0 when no shape is selected', () => {
    const { sheet, designer } = setup();
    const S = GC.Spread.Sheets.Shapes;
    sheet.shapes.add('rect1', S.AutoShapeType.rectangle, 100, 100, 150, 100);
    executeShapeCommand(designer, 'shapeGroup');
    const all = sheet.shapes.all();
    // The exact trial state rows of the sweep line (r4 shapeGroup, official side):
    expect(all.map((item: any) => item.name())).toEqual(['GroupShape 1', 'rect1']);
    const group = all[0];
    expect(group).toBeInstanceOf(S.GroupShape);
    expect([group.x(), group.y(), group.width(), group.height()]).toEqual([-1, -1, -1, -1]);
    expect(group.rotate()).toBe(0);
    expect([group.isVisible(), group.isLocked(), group.canPrint(), group.dynamicMove(), group.allowResize()]).toEqual([true, true, true, true, true]);
    expect(typeof group.text, 'accessor 11 must be ABSENT on a group').toBe('undefined');
    expect(all[1].text()).toBe(''); // rect1 (a Shape) still answers text()
    const shapesJson = JSON.parse(JSON.stringify(sheet.toJSON())).shapes;
    expect(shapesJson.map((entry: any) => entry.name)).toEqual(['GroupShape 1', 'rect1']);
    expect(shapesJson[0].shapeType).toBe(3);
    expect(shapesJson[0].children).toEqual([]);
  });

  it('groups the selected shapes into one handle and shapeUnGroup releases them to the slots', () => {
    const { sheet, designer } = setup();
    const S = GC.Spread.Sheets.Shapes;
    const a = sheet.shapes.add('a', S.AutoShapeType.rectangle, 0, 0, 20, 20);
    const b = sheet.shapes.add('b', S.AutoShapeType.rectangle, 100, 0, 20, 20);
    a.isSelected(true); b.isSelected(true);
    executeShapeCommand(designer, 'shapeGroup');
    expect(sheet.shapes.all().map((item: any) => item.name())).toEqual(['GroupShape 1']);
    const group = sheet.shapes.all()[0];
    expect(group.all().map((item: any) => item.name())).toEqual(['a', 'b']);
    group.isSelected(true);
    executeShapeCommand(designer, 'shapeUnGroup');
    expect(sheet.shapes.all().map((item: any) => item.name())).toEqual(['a', 'b']);
    expect(a.groupId()).toBeNull();
  });

  it('nested grouping + paste carries the group (copy/paste keeps the nested members)', () => {
    const { sheet, designer } = setup();
    const S = GC.Spread.Sheets.Shapes;
    const a = sheet.shapes.add('a', S.AutoShapeType.rectangle, 0, 0, 20, 20);
    const b = sheet.shapes.add('b', S.AutoShapeType.rectangle, 100, 0, 20, 20);
    const c = sheet.shapes.add('c', S.AutoShapeType.rectangle, 200, 0, 20, 20);
    const inner = sheet.shapes.group([a, b]);
    a.isSelected(true); b.isSelected(true);
    const outer = sheet.shapes.group([inner, c]);
    // designer copy/cut stores the serialized tree; paste rebuilds it through the core record builder.
    const clipboard = [JSON.parse(JSON.stringify(outer.toJSON()))];
    applyInsertAction(designer, 'pasteShapes', { items: clipboard });
    const top = sheet.shapes.all();
    expect(top.length).toBe(2); // original group + pasted group
    const pasted = top[1];
    expect(pasted).toBeInstanceOf(S.GroupShape);
    expect(pasted.name()).not.toBe(outer.name());
    const children = pasted.all().map((item: any) => item.name());
    expect(children.length).toBe(2);
    const nested = children.map((name: string) => sheet.shapes.get(name));
    expect(nested.some((item: any) => item && item.all && item.all().length === 2)).toBe(true); // the inner group survived the copy
  });
});

describe('TASK 81 pasteLinkedPicture (accessor surface)', () => {
  it('the linked picture answers NO text() accessor (trial state accessor 11 = ABSENT)', () => {
    const { sheet, designer } = setup();
    sheet._clipboardSource = () => ({ sheetName: sheet.name(), row: 0, col: 1, rowCount: 2, colCount: 4 });
    sheet._clipboardMode = () => 'copy';
    sheet.setSelection(4, 1, 2, 4);
    insertLinkedPicture(designer);
    const shape = sheet.shapes.all()[0];
    expect(shape.name()).toMatch(/^Picture/);
    expect(typeof shape.text, 'trial PictureShape/CameraShape carry no text member').toBe('undefined');
    expect(typeof shape.textColor).toBe('undefined');
    expect(shape.range()).toBe('=Data!$B$1:$E$2');
    expect(shape.allowResize()).toBe(0); // TASK 77 geometry/flag parity unchanged
  });

  it('grouped camera/picture handles never gain a text accessor through the group machinery', () => {
    const { sheet } = setup();
    const picture = sheet.shapes.addPictureShape('P1', 'data:image/png;base64,x', 300, 0, 40, 30);
    const camera = sheet.shapes.addCameraShape('C1', '=Data!$A$1:$B$2', 360, 0, 40, 30);
    const group = sheet.shapes.group([picture, camera]);
    expect(sheet.shapes.all().map((item: any) => item.name())).toEqual(['GroupShape 1']);
    for (const item of [picture, camera, group]) {
      expect(typeof (item as any).text, `${item.name()}.text`).toBe('undefined');
    }
  });
});
