import { expect, it } from 'vitest';
import GC from '../src/index.js';
for (const kind of ['workbook', 'worksheet'])
  it(`${kind} stores, reads and removes custom names`, () => {
    const owner =
      kind === 'workbook' ? new GC.Spread.Sheets.Workbook() : new GC.Spread.Sheets.Worksheet('Names');
    owner.addCustomName('Named', '=A1', 2, 3, 'note', true);
    const name = owner.getCustomName('NAMED');
    expect(owner.getCustomNames()).toEqual([name]);
    expect(name.getName()).toBe('Named');
    expect(name.getExpression()).toBe('A1');
    expect(name.getRow()).toBe(2);
    expect(name.getColumn()).toBe(3);
    expect(name.getComment()).toBe('note');
    expect(name.isReadOnly()).toBe(true);
    name.isReadOnly(false);
    expect(name.isReadOnly()).toBe(false);
    name.set('Renamed', 'B2', 4, 5, 'new');
    expect(name.getName()).toBe('Renamed');
    expect(name.getExpression()).toBe('B2');
    expect(name.getRow()).toBe(4);
    expect(name.getColumn()).toBe(5);
    expect(name.getComment()).toBe('new');
    expect(owner.getCustomName('Renamed')).toBe(name);
    owner.removeCustomName('Renamed');
    expect(owner.getCustomNames()).toEqual([]);
    owner.addCustomName('Other', '42', 0, 0);
    owner.clearCustomNames();
    expect(owner.getCustomName('Other')).toBeUndefined();
  });
it('supports comment text updates and selective clearing', () => {
  const s = new GC.Spread.Sheets.Worksheet('Notes'),
    note = s.comments.add(1, 2, 'before');
  expect(note.text('after')).toBe(note);
  expect(s.comments.get(1, 2)?.text()).toBe('after');
  s.comments.add(4, 5, 'keep');
  s.comments.clear(new GC.Spread.Sheets.Range(0, 0, 3, 3));
  expect(s.comments.get(1, 2)).toBeNull();
  expect(s.comments.all()).toHaveLength(1);
});
