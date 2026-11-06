import { expect, it } from 'vitest';
import { Worksheet } from '../src/model.js';
import { CellStore, ValueGrid } from '../src/structures.js';

it('keeps 200k numeric writes and reads within generous regression budgets', () => {
  const before = process.memoryUsage();
  const sheet = new Worksheet();
  const start = performance.now();
  for (let r = 0; r < 200_000; r++) sheet.setValue(r, 0, r);
  const elapsed = performance.now() - start;
  expect(elapsed).toBeLessThan(1500); // permits instrumentation and shared CI load
  expect(process.memoryUsage().arrayBuffers - before.arrayBuffers).toBeLessThan(20 * 1024 * 1024);
  let sum = 0;
  for (let r = 0; r < 200_000; r++) sum += Number(sheet.getValue(r, 0));
  expect(sum).toBe(19_999_900_000);
  sheet.setValue(199_999, 0, 'text');
  sheet.setValue(199_998, 0, null);
  expect(sheet.getValue(199_999, 0)).toBe('text');
  expect(sheet.getValue(199_998, 0)).toBeNull();
});

it('distinguishes holes, special numbers and sparse metadata across chunks', () => {
  const values = new ValueGrid();
  for (const [row, value] of [NaN, Infinity, -Infinity, -0, null, undefined, 'x'].entries()) values.set(row, 16383, value);
  expect(values.size).toBe(7);
  expect(values.has(5, 16383)).toBe(true);
  expect(values.has(7, 16383)).toBe(false);
  expect(values.get(0, 16383)).toBeNaN();
  expect(Object.is(values.get(3, 16383), -0)).toBe(true);
  values.shift('row', 2, 1024, false);
  expect(values.get(1030, 16383)).toBe('x');
  values.delete(1030, 16383);
  expect(values.size).toBe(6);
  const cells = new CellStore<{ value?: unknown; style?: string }>();
  cells.setValue(1023, 0, 42);
  cells.get(1023, 0)!.style = 'styled';
  cells.setValue(1023, 0, 43);
  expect([...cells.entries()]).toEqual([[1023, 0, { value: 43, style: 'styled' }]]);
});

it.each([false, true])('guards retained CJS heap and buffers (scattered rows: %s)', async scattered => {
  const { execFileSync } = await import('node:child_process');
  const result = JSON.parse(execFileSync(process.execPath, ['--expose-gc', '-e', `
    const GC = require('./dist/gc.spread.sheets.cjs');
    global.gc(); const before = process.memoryUsage();
    const sheet = new GC.Spread.Sheets.Worksheet();
    const start = performance.now();
    for (let row = 0; row < 200000; row++) sheet.setValue(row, ${scattered ? 'row % 50' : '0'}, row);
    const elapsed = performance.now() - start;
    global.gc(); const after = process.memoryUsage();
    console.log(JSON.stringify({ elapsed, retained: after.heapUsed + after.arrayBuffers - before.heapUsed - before.arrayBuffers, last: sheet.getValue(199999, ${scattered ? 49 : 0}) }));
  `], { encoding: 'utf8' })) as { elapsed: number; retained: number; last: number };
  expect(result.elapsed).toBeLessThan(350);
  expect(result.retained).toBeLessThan((scattered ? 25 : 35) * 1024 * 1024);
  expect(result.last).toBe(199999);
});


it('packs scattered-column writes and preserves secondary cells after primary-page deletion', () => {
  const grid = new ValueGrid();
  for (let r = 0; r < 4096; r++) grid.set(r, r % 50, r);
  expect(grid.size).toBe(4096);
  for (let r = 0; r < 4096; r++) expect(grid.get(r, r % 50)).toBe(r);
  grid.set(0, 100, 'secondary');
  for (let r = 0; r < 1024; r++) grid.delete(r, r % 50);
  expect(grid.get(0, 100)).toBe('secondary');
  grid.set(0, 100, 42);
  expect([...grid.entries()].filter(([r, c]) => r === 0 && c === 100)).toEqual([[0, 100, 42]]);
  grid.shift('col', 50, 2, false);
  expect(grid.get(0, 102)).toBe(42);
  grid.clear(); expect(grid.size).toBe(0);
});
