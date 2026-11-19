import { describe, expect, it } from 'vitest';
import { TaskDependency } from '../src/gantt/dependency.js';
import { Collection } from '../src/gantt/collection.js';

describe('Gantt collection', () => {
  it('keeps the ordered live array and supports rule lookup and edits', () => {
    const collection = new Collection<{ name: string }>();
    const a = { name: 'a' };
    const b = { name: 'b' };
    collection.add(a);
    collection.add(b);
    expect(collection.length).toBe(2);
    expect(collection.getIndexByItem(b)).toBe(1);
    expect(collection.getRule('a')).toBe(a);
    expect(collection.getRule('z')).toBeNull();
    expect(collection.getItemAt(99)).toBeUndefined();
    collection.all().push({ name: 'c' });
    expect(collection.length).toBe(3);
    collection.insert(1, { name: 'd' });
    collection.removeAt(0);
    collection.setItemAt(0, { name: 'e' });
    expect(collection.all().map(item => item.name)).toEqual(['e', 'b', 'c']);
    collection.clear();
    collection.add(a);
    collection.add(b);
    collection.remove(a);
    expect(collection.all()).toEqual([b]);
    collection.remove({ name: 'missing' });
    expect(collection.all()).toEqual([]);
    collection.clear();
    expect(collection.length).toBe(0);
  });
});

it('creates a finish-to-start dependency by default', () => {
  const from = {};
  const to = {};
  const dependency = new TaskDependency(from, to);
  expect([dependency.from, dependency.to, dependency.type]).toEqual([from, to, 'FS']);
});
