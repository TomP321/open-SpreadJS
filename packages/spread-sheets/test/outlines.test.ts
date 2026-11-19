import { describe, expect, it } from 'vitest';
import GC from '../src/index.js';
import { Workbook } from '../src/workbook.js';
import { Worksheet } from '../src/worksheet.js';

const { OutlineInfo } = GC.Spread.Sheets.Outlines;

/** A sheet with `group(2, 10)` and `group(4, 2)` applied to its rows. */
function groupedSheet(): Worksheet {
  const sheet = new Worksheet('Outlines');
  sheet.rowOutlines.group(2, 10);
  sheet.rowOutlines.group(4, 2);
  return sheet;
}
const mapItems = (sheet: Worksheet): unknown[] =>
  (sheet.toJSON().rowOutlines as { items: ({ level: number } | null)[] }).items
    .map((item, index) => (item ? [index, item.level] : null))
    .filter(Boolean);
/** `[index, level, collapsed, viewCollapsed]` for every serialised outline entry. */
const outlineMap = (sheet: Worksheet, axis: 'rowOutlines' | 'columnOutlines' = 'rowOutlines'): [number, number, number, number][] =>
  (sheet.toJSON()[axis] as { items: ({ level: number; collapsed: boolean; viewCollapsed: boolean } | null)[] }).items
    .map((item, index) => (item ? [index, item.level, item.collapsed ? 1 : 0, item.viewCollapsed ? 1 : 0] : null))
    .filter((row): row is [number, number, number, number] => row !== null);
/** Fails loudly when a group the test expects is missing. */
function need(info: InstanceType<typeof OutlineInfo> | null): InstanceType<typeof OutlineInfo> {
  if (!info) throw new Error('expected an outline group');
  return info;
}

describe('Outline groups', () => {
  it('exposes the trial defaults: forward direction, no groups, level -1 outside groups', () => {
    const sheet = new Worksheet('Plain');
    expect(sheet.rowOutlines.direction()).toBe(1);
    expect(sheet.columnOutlines.direction()).toBe(1);
    expect(sheet.rowOutlines.getMaxLevel()).toBe(-1);
    expect(sheet.rowOutlines.getLevel(0)).toBe(-1);
    expect(sheet.toJSON().rowOutlines).toEqual({ items: [] });
    expect(sheet.toJSON().columnOutlines).toEqual({ items: [] });
  });

  it('direction(value) sets and chains, and is only serialised when it is not the default', () => {
    const sheet = new Worksheet('Direction');
    expect(sheet.rowOutlines.direction(0)).toBe(sheet.rowOutlines);
    expect(sheet.rowOutlines.direction()).toBe(0);
    expect(sheet.toJSON().rowOutlines).toEqual({ direction: 0, items: [] });
    sheet.columnOutlines.direction(1);
    expect(sheet.toJSON().columnOutlines).toEqual({ items: [] });
    const workbook = new Workbook(undefined, { sheetCount: 1 });
    workbook.getActiveSheet().rowOutlines.fromJSON(sheet.toJSON().rowOutlines);
    expect(workbook.getActiveSheet().rowOutlines.direction()).toBe(0);
    workbook.getActiveSheet().columnOutlines.fromJSON(sheet.toJSON().columnOutlines);
    expect(workbook.getActiveSheet().columnOutlines.direction()).toBe(1);
  });

  it('groups levels rows, keeps the maximum level and reports levels outside groups as -1', () => {
    const sheet = groupedSheet();
    const outline = sheet.rowOutlines;
    expect([0, 1, 2, 3, 4, 5, 6, 11, 12].map((index) => outline.getLevel(index))).toEqual([
      -1, -1, 0, 0, 1, 1, 0, 0, -1,
    ]);
    expect(outline.getMaxLevel()).toBe(1);
    expect(mapItems(sheet)).toEqual([[2, 0], [3, 0], [4, 1], [5, 1], [6, 0], [7, 0], [8, 0], [9, 0], [10, 0], [11, 0]]);
    expect(outline.isGroupEnd(2, 0)).toBe(false);
    expect(outline.isGroupEnd(6, 0)).toBe(false);
  });

  it('grouping the same range twice adds one more level', () => {
    const sheet = new Worksheet('Twice');
    sheet.rowOutlines.group(2, 4);
    sheet.rowOutlines.group(2, 4);
    expect([2, 3, 4, 5, 6].map((index) => sheet.rowOutlines.getLevel(index))).toEqual([1, 1, 1, 1, -1]);
    expect(sheet.rowOutlines.getMaxLevel()).toBe(1);
  });
});

describe('Outlines.OutlineInfo', () => {
  it('find() returns the group that holds the index at the requested level', () => {
    const outline = groupedSheet().rowOutlines;
    const group = (index: number, level: number) => {
      const info = outline.find(index, level);
      return info ? [info.start, info.end, info.level] : null;
    };
    expect(group(2, 0)).toEqual([2, 11, 0]);
    expect(group(3, 0)).toEqual([2, 11, 0]);
    expect(group(5, 0)).toEqual([2, 11, 0]);
    expect(group(4, 0)).toEqual([2, 11, 0]);
    expect(group(11, 0)).toEqual([2, 11, 0]);
    expect(group(4, 1)).toEqual([4, 5, 1]);
    expect(group(6, 1)).toBeNull();
    expect(group(12, 0)).toBeNull();
    expect(group(0, 0)).toBeNull();
    expect(group(2, 1)).toBeNull();
  });

  it('caches the group tree, so the same group is always the same object', () => {
    const outline = groupedSheet().rowOutlines;
    const outer = need(outline.find(2, 0));
    expect(outline.find(3, 0)).toBe(outer);
    expect(outline.find(11, 0)).toBe(outer);
    const nested = need(outline.find(4, 1));
    expect(outline.find(5, 1)).toBe(nested);
    expect(need(outline.find(5, 1)).parent).toBe(outer);
    expect(outer.children.map((child) => [child.start, child.end, child.level])).toEqual([[4, 5, 1]]);
    expect(outer.children[0]).toBe(nested);
  });

  it('carries start, end, level, model, parent and children as own properties (trial order)', () => {
    const outline = groupedSheet().rowOutlines;
    const info = need(outline.find(2, 0));
    expect(Object.keys(info)).toEqual(['children', 'parent', 'model', 'start', 'end', 'level']);
    expect(info.model).toBe(outline);
    expect(info.start).toBe(2);
    expect(info.end).toBe(11);
    expect(info.level).toBe(0);
    // The root of the tree covers the whole axis at level -1 and owns the level 0 groups.
    const parent = need(info.parent);
    expect(parent.start).toBe(0);
    expect(parent.end).toBe(199);
    expect(parent.level).toBe(-1);
    expect(parent.model).toBe(outline);
    expect(parent.children).toContain(info);
    expect(outline.find(0, 0)).toBeNull();
    expect(parent.contains(0)).toBe(true);
  });

  it('builds one node per nested group (group(2,10), group(4,2), group(5,1))', () => {
    const sheet = new Worksheet('Deep');
    const outline = sheet.rowOutlines;
    outline.group(2, 10);
    outline.group(4, 2);
    outline.group(5, 1);
    const info = need(outline.find(2, 0));
    expect([info.start, info.end, info.level, info.state()]).toEqual([2, 11, 0, 0]);
    expect(info.children.map((child) => [child.start, child.end, child.level])).toEqual([[4, 5, 1]]);
    expect(info.children[0].children.map((child) => [child.start, child.end, child.level])).toEqual([[5, 5, 2]]);
    expect(outline.getLevel(2)).toBe(0);
    expect(outline.getLevel(5)).toBe(2);
    expect(outline.getMaxLevel()).toBe(2);
  });

  it('contains(index) covers the whole group range', () => {
    const outline = groupedSheet().rowOutlines;
    const info = need(outline.find(4, 1));
    expect([info.contains(3), info.contains(4), info.contains(5), info.contains(6)]).toEqual([false, true, true, false]);
  });

  it('state() and getState(groupInfo) report the collapsed state of the group', () => {
    const outline = groupedSheet().rowOutlines;
    expect(need(outline.find(2, 0)).state()).toBe(0);
    expect(outline.getState(need(outline.find(2, 0)))).toBe(0);
    outline.expand(0, false);
    expect(need(outline.find(2, 0)).state()).toBe(1);
    expect(outline.getState(need(outline.find(2, 0)))).toBe(1);
    // The nested group is only hidden by the outer collapse; its own state stays 0.
    expect(need(outline.find(4, 1)).state()).toBe(0);
    outline.expandGroup(need(outline.find(2, 0)), true);
    expect(need(outline.find(2, 0)).state()).toBe(0);
  });

  it('state(value) collapses and expands the group and returns the info', () => {
    const outline = groupedSheet().rowOutlines;
    const info = need(outline.find(4, 1));
    expect(info.state(1)).toBe(info);
    expect(outline.isCollapsed(4)).toBe(true);
    expect(need(outline.find(4, 1)).state()).toBe(1);
    expect(info.state(0)).toBe(info);
    expect(outline.isCollapsed(4)).toBe(false);
  });

  it('addChild attaches the child to the parent group', () => {
    const outline = groupedSheet().rowOutlines;
    const outer = outline.find(2, 0)!;
    const child = new OutlineInfo(outline, 6, 7, 1);
    outer.addChild(child);
    expect(child.parent).toBe(outer);
    expect(outer.children[outer.children.length - 1]).toBe(child);
  });
});

describe('Outline collapsing, expanding and ungrouping', () => {
  it('setCollapsed(index, true) hides the group and stores the flag on the following entry', () => {
    const sheet = new Worksheet('Collapsed');
    const outline = sheet.rowOutlines;
    outline.group(2, 4);
    outline.setCollapsed(2, true);
    expect([1, 2, 3, 4, 5, 6, 7].map((index) => outline.getLevel(index))).toEqual([-1, 0, 0, 0, 0, -1, -1]);
    expect([1, 2, 3, 4, 5, 6, 7].map((index) => outline.getCollapsed(index))).toEqual([false, true, false, false, false, true, false]);
    expect([1, 2, 3, 4, 5, 6, 7].map((index) => outline.isCollapsed(index))).toEqual([false, true, true, true, true, false, false]);
    expect([1, 2, 3, 4, 5, 6, 7].map((index) => sheet.getRowVisible(index))).toEqual([true, false, false, false, false, true, true]);
    expect((sheet.toJSON().rowOutlines as { items: unknown[] }).items[6]).toEqual({
      level: -1,
      collapsed: true,
      viewCollapsed: false,
    });
    expect(outline.find(2, 0)).toMatchObject({ start: 2, end: 5, level: 0 });
  });

  it('setCollapsed(index, false) restores the group', () => {
    const sheet = new Worksheet('Restored');
    const outline = sheet.rowOutlines;
    outline.group(2, 4);
    outline.setCollapsed(2, true);
    outline.setCollapsed(2, false);
    expect([2, 3, 4, 5, 6, 7].map((index) => outline.getLevel(index))).toEqual([0, 0, 0, 0, -1, -1]);
    expect([2, 3, 4, 5, 6, 7].map((index) => sheet.getRowVisible(index))).toEqual([true, true, true, true, true, true]);
    const info = outline.find(2, 0)!;
    expect([info.start, info.end, info.level, info.state()]).toEqual([2, 5, 0, 0]);
  });

  it('expand(level, expand) and expandGroup follow the trial collapse snapshots', () => {
    const sheet = new Worksheet('Nested');
    const outline = sheet.rowOutlines;
    outline.group(2, 10);
    outline.group(4, 2);
    const visible = () => [2, 3, 4, 5, 6, 11, 12].map((index) => sheet.getRowVisible(index));
    outline.expand(0, false);
    expect(outlineMap(sheet)).toEqual([
      [2, 0, 0, 1], [3, 0, 0, 1], [4, 1, 0, 1], [5, 1, 0, 1], [6, 0, 0, 1], [7, 0, 0, 1], [8, 0, 0, 1], [9, 0, 0, 1],
      [10, 0, 0, 1], [11, 0, 0, 1], [12, -1, 1, 0],
    ]);
    expect(visible()).toEqual([false, false, false, false, false, false, true]);
    outline.expand(1, true);
    expect(outlineMap(sheet)).toEqual([
      [2, 0, 0, 1], [3, 0, 0, 1], [4, 1, 0, 0], [5, 1, 0, 0], [6, 0, 0, 1], [7, 0, 0, 1], [8, 0, 0, 1], [9, 0, 0, 1],
      [10, 0, 0, 1], [11, 0, 0, 1], [12, -1, 1, 0],
    ]);
    expect(visible()).toEqual([false, false, true, true, false, false, true]);
    outline.expandGroup(outline.find(4, 1)!, false);
    expect(outlineMap(sheet)).toEqual([
      [2, 0, 0, 1], [3, 0, 0, 1], [4, 1, 0, 1], [5, 1, 0, 1], [6, 0, 1, 1], [7, 0, 0, 1], [8, 0, 0, 1], [9, 0, 0, 1],
      [10, 0, 0, 1], [11, 0, 0, 1], [12, -1, 1, 0],
    ]);
    expect(visible()).toEqual([false, false, false, false, false, false, true]);
    // Expanding the outer group reveals everything except the still-collapsed nested group.
    outline.expandGroup(outline.find(2, 0)!, true);
    expect(outlineMap(sheet)).toEqual([
      [2, 0, 0, 0], [3, 0, 0, 0], [4, 1, 0, 1], [5, 1, 0, 1], [6, 0, 1, 0], [7, 0, 0, 0], [8, 0, 0, 0], [9, 0, 0, 0],
      [10, 0, 0, 0], [11, 0, 0, 0], [12, -1, 0, 0],
    ]);
    expect(visible()).toEqual([true, true, false, false, true, true, true]);
  });

  it('collapsing an adjacent group keeps both groups serialised like the trial', () => {
    const sheet = new Worksheet('Adjacent');
    const outline = sheet.rowOutlines;
    outline.group(2, 10);
    outline.group(12, 3);
    outline.setCollapsed(2, true);
    expect((sheet.toJSON().rowOutlines as { itemsData: unknown[] }).itemsData).toEqual([
      { index: 2, count: 1, info: { level: 0, collapsed: true } },
      { index: 3, count: 12, info: { level: 0, collapsed: false } },
      { index: 15, count: 1, info: { level: -1, collapsed: true } },
    ]);
    expect([10, 11, 12, 13, 14, 15].map((index) => outline.getLevel(index))).toEqual([0, 0, 0, 0, 0, -1]);
    expect([2, 11, 12, 13, 14, 15].map((index) => outline.getCollapsed(index))).toEqual([true, false, false, false, false, true]);
    expect([11, 12, 13, 14, 15].map((index) => sheet.getRowVisible(index))).toEqual([false, false, false, false, true]);
    // The two adjacent groups at the same level form one group in the trial too.
    expect([outline.find(2, 0)!, outline.find(12, 0)!, outline.find(14, 0)!].map((info) => [info.start, info.end, info.state()])).toEqual([
      [2, 14, 1], [2, 14, 1], [2, 14, 1],
    ]);
  });

  it('ungroup() removes every group; ungroupRange() drops one level and keeps the flags', () => {
    const sheet = new Worksheet('Ungroup');
    const outline = sheet.rowOutlines;
    outline.group(2, 4);
    outline.group(4, 2);
    outline.ungroupRange(4, 2);
    expect([2, 3, 4, 5, 6].map((index) => outline.getLevel(index))).toEqual([0, 0, 0, 0, -1]);
    expect((sheet.toJSON().rowOutlines as { itemsData: unknown[] }).itemsData).toEqual([
      { index: 2, count: 4, info: { level: 0, collapsed: false } },
    ]);
    outline.ungroup();
    expect(sheet.toJSON().rowOutlines).toEqual({ items: [] });

    // Removing the whole outer group leaves the entries one level lower.
    outline.group(2, 10);
    outline.group(2, 10);
    outline.ungroupRange(2, 10);
    expect([2, 3, 11, 12].map((index) => outline.getLevel(index))).toEqual([0, 0, 0, -1]);
    expect(outline.getMaxLevel()).toBe(0);
  });

  it('ungroupRange() in the middle of a group stores the freed entries with level -1', () => {
    const sheet = new Worksheet('UngroupRange');
    const outline = sheet.rowOutlines;
    outline.group(2, 10);
    outline.ungroupRange(4, 3);
    expect([1, 2, 3, 4, 5, 6, 7, 10, 11, 12].map((index) => outline.getLevel(index))).toEqual([
      -1, 0, 0, -1, -1, -1, 0, 0, 0, -1,
    ]);
    expect((sheet.toJSON().rowOutlines as { itemsData: unknown[] }).itemsData).toEqual([
      { index: 2, count: 2, info: { level: 0, collapsed: false } },
      { index: 4, count: 3, info: { level: -1, collapsed: false } },
      { index: 7, count: 5, info: { level: 0, collapsed: false } },
    ]);
    // Partial overlap: only the touched entries lose one level.
    outline.ungroup();
    outline.group(2, 10);
    outline.group(4, 2);
    outline.ungroupRange(3, 2);
    expect([2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((index) => outline.getLevel(index))).toEqual([0, -1, 0, 1, 0, 0, 0, 0, 0, 0]);
    expect(outline.getMaxLevel()).toBe(1);
  });

  it('ungroupRange() keeps a collapsed nested group hidden', () => {
    const sheet = new Worksheet('UngroupCollapsed');
    const outline = sheet.rowOutlines;
    outline.group(2, 10);
    outline.group(4, 2);
    outline.setCollapsed(4, true);
    outline.ungroupRange(4, 2);
    expect([2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((index) => outline.getLevel(index))).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect([2, 4, 5, 6, 11].map((index) => outline.getCollapsed(index))).toEqual([false, true, false, true, false]);
    expect([2, 4, 5, 6, 11].map((index) => outline.isCollapsed(index))).toEqual([false, true, true, false, false]);
    expect([2, 3, 4, 5, 6, 11, 12].map((index) => sheet.getRowVisible(index))).toEqual([true, true, false, false, true, true, true]);
    expect(outline.find(4, 1)).toBeNull();
  });

  it('a backward summary side stores the collapsed flag before the group', () => {
    const sheet = new Worksheet('Backward');
    const outline = sheet.rowOutlines;
    outline.direction(0);
    outline.group(2, 4);
    expect([1, 2, 3, 4, 5, 6, 7].map((index) => outline.getLevel(index))).toEqual([-1, 0, 0, 0, 0, -1, -1]);
    outline.setCollapsed(3, true);
    expect([1, 2, 3, 4, 5, 6].map((index) => outline.getCollapsed(index))).toEqual([true, false, true, false, false, false]);
    expect([1, 2, 3, 4, 5, 6].map((index) => outline.isCollapsed(index))).toEqual([false, true, true, true, true, false]);
    expect([1, 2, 3, 4, 5, 6].map((index) => sheet.getRowVisible(index))).toEqual([true, false, false, false, false, true]);
    expect(outline.find(2, 0)).toMatchObject({ start: 2, end: 5, level: 0 });
    expect(outline.find(2, 0)!.state()).toBe(1);
    expect((sheet.toJSON().rowOutlines as { itemsData: unknown[] }).itemsData).toEqual([
      { index: 1, count: 1, info: { level: -1, collapsed: true } },
      { index: 2, count: 1, info: { level: 0, collapsed: false } },
      { index: 3, count: 1, info: { level: 0, collapsed: true } },
      { index: 4, count: 2, info: { level: 0, collapsed: false } },
    ]);
  });

  it('survives serialisation: collapsed state and levels round-trip through toJSON/fromJSON', () => {
    const sheet = groupedSheet();
    sheet.rowOutlines.setCollapsed(4, true);
    const json = sheet.toJSON();
    const workbook = new Workbook(undefined, { sheetCount: 1 });
    workbook.setActiveSheet(workbook.getActiveSheet());
    workbook.getActiveSheet().rowOutlines.fromJSON(json.rowOutlines);
    const outline = workbook.getActiveSheet().rowOutlines;
    expect([2, 4, 5, 6, 11, 12].map((index) => outline.getCollapsed(index))).toEqual([false, true, false, true, false, false]);
    expect([2, 3, 4, 5, 6, 11, 12].map((index) => workbook.getActiveSheet().getRowVisible(index))).toEqual([
      true, true, false, false, true, true, true,
    ]);
    expect(workbook.getActiveSheet().rowOutlines.toJSON()).toEqual(json.rowOutlines);
    expect(workbook.getActiveSheet().rowOutlines.direction()).toBe(1);
  });
});
