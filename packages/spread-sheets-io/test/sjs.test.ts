import { expect, it } from 'vitest';
import { obj } from '../src/common.js';
import { readSjs, writeSjs } from '../src/sjs.js';

it('round trips basic cells and font families through an SJS archive', () => {
  const source = { sheets: { Data: { name: 'Data', index: 0, data: { dataTable: { 0: { 0: { value: 'hello', style: { fontFamily: 'Arial' } }, 1: { value: 42 } } } } } } };
  const result = readSjs(writeSjs(source).bytes);
  const cells = obj(obj(obj(obj(result.json.sheets).Data).data).dataTable);
  expect(obj(obj(cells[0])[0]).value).toBe('hello');
  expect(obj(obj(cells[0])[1]).value).toBe(42);
  expect(obj(obj(obj(cells[0])[0]).style).fontFamily).toBe('Arial');
});
