// @vitest-environment jsdom
import { expect, it } from 'vitest';
import GC from '../src/index.js';
it('accepts an element or element ID and preserves host contents and classes', () => {
  document.body.innerHTML = '<div id="sheet" class="existing"><span>owned by app</span></div>';
  const element = document.getElementById('sheet')!;
  const workbook = new GC.Spread.Sheets.Workbook('sheet');
  expect(element.classList.contains('opensheets-host')).toBe(true);
  workbook.destroy();
  expect(element.className).toBe('existing');
  expect(element.textContent).toBe('owned by app');
  element.classList.add('opensheets-host');
  new GC.Spread.Sheets.Workbook(element).destroy();
  expect(element.classList.contains('opensheets-host')).toBe(true);
  expect(() => new GC.Spread.Sheets.Workbook('missing')).toThrow('host not found');
});
