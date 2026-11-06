import { describe, expect, it } from 'vitest';
import { AxisLayout, SparseGrid } from '../src/structures.js';
describe('sparse structures', () => {
  it('allocates cells only, reclaims empty chunks and shifts across chunk boundaries', () => {
    const grid = new SparseGrid<string>();
    grid.set(255, 3, 'a');
    grid.set(256, 4, 'b');
    grid.set(999999, 16383, 'end');
    expect(grid.size).toBe(3);
    grid.shift('row', 256, 2, false);
    expect(grid.get(258, 4)).toBe('b');
    grid.shift('col', 3, 1, true);
    expect(grid.get(255, 3)).toBeUndefined();
    expect(grid.get(258, 3)).toBe('b');
    grid.set(258, 3, undefined);
    expect(grid.size).toBe(1);
    grid.clear();
    expect([...grid.entries()]).toEqual([]);
  });
  it('handles a million uniform rows without dense allocations', () => {
    const axis = new AxisLayout(1_000_000, 20);
    expect(axis.prefixSum(1_000_000)).toBe(20_000_000);
    axis.setSize(999999, 40);
    expect(axis.sum(999998, 2)).toBe(60);
    expect(axis.indexAtOffset(19_999_999)).toBe(999999);
    expect(axis.indexAtOffset(20_000_020)).toBe(1_000_000);
    axis.setVisible(10, false);
    expect(axis.getSize(10)).toBe(0);
    expect(axis.indexAtOffset(200)).toBe(11);
    axis.setVisible(10, true);
    expect(axis.indexAtOffset(200)).toBe(10);
  });
  it('matches a dense oracle through dimension changes, visibility, resizing and insertion', () => {
    const axis = new AxisLayout(50, 20);
    let dense = Array(50).fill(20) as number[];
    for (let i = 0; i < 50; i += 3) {
      axis.setSize(i, i + 1);
      dense[i] = i + 1;
    }
    for (let i = 1; i < 50; i += 7) {
      axis.setVisible(i, false);
      dense[i] = 0;
    }
    const check = () => {
      for (let i = 0; i <= dense.length; i++)
        expect(axis.prefixSum(i)).toBe(dense.slice(0, i).reduce((a, b) => a + b, 0));
      const total = dense.reduce((a, b) => a + b, 0);
      for (let offset = 0; offset <= total + 2; offset += 7) {
        let index = 0,
          sum = 0;
        while (index < dense.length && sum + dense[index] <= offset) sum += dense[index++];
        expect(axis.indexAtOffset(offset)).toBe(index);
      }
    };
    check();
    axis.shift(12, 3, false);
    dense.splice(12, 0, 20, 20, 20);
    check();
    axis.shift(5, 7, true);
    dense.splice(5, 7);
    check();
    axis.resize(30);
    dense = dense.slice(0, 30);
    check();
    axis.defaultSize = 25;
    expect(axis.defaultSize).toBe(25);
    expect([...axis.entries()].length).toBeLessThan(30);
  });
});
