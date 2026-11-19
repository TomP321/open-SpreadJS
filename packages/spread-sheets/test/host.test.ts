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

// Trial measurements: .probe/t53/probe-host53.json (TASK 53 item 2), section B and D.
it('marks the host the way the trial does: gc-no-user-select plus inline overflow: visible', () => {
  document.body.innerHTML = `
    <div id="plain" class="existing" style="width: 800px; height: 400px"></div>
    <div id="nostyle"></div>
    <div id="hidden" style="width: 200px; height: 100px; overflow: hidden"></div>
    <div id="pre" class="existing gc-no-user-select" style="width: 200px; height: 100px"></div>`;
  const plain = document.getElementById('plain')!;
  const nostyle = document.getElementById('nostyle')!;
  const hidden = document.getElementById('hidden')!;
  const pre = document.getElementById('pre')!;

  const workbook = new GC.Spread.Sheets.Workbook(plain);
  // the trial class is added next to the application's own classes (ours stays for our stylesheet)
  expect(Array.from(plain.classList)).toEqual(['existing', 'opensheets-host', 'gc-no-user-select']);
  // the application's inline sizes survive, the trial's overflow is appended
  expect(plain.style.width).toBe('800px');
  expect(plain.style.height).toBe('400px');
  expect(plain.style.overflow).toBe('visible');

  const others = [
    new GC.Spread.Sheets.Workbook(nostyle),
    new GC.Spread.Sheets.Workbook(hidden),
    new GC.Spread.Sheets.Workbook(pre),
  ];
  expect(nostyle.classList.contains('gc-no-user-select')).toBe(true);
  expect(nostyle.style.overflow).toBe('visible');
  // measured on the trial: an inline `overflow: hidden` is overwritten by the component
  expect(hidden.style.overflow).toBe('visible');

  others[0].destroy();
  // destroy removes the class (trial) and leaves the inline overflow it wrote (trial)
  expect(plain.classList.contains('gc-no-user-select')).toBe(true); // still hosted by `workbook`
  expect(nostyle.classList.contains('gc-no-user-select')).toBe(false);
  expect(nostyle.style.overflow).toBe('visible');
  expect(nostyle.style.width).toBe('');

  workbook.destroy();
  others.slice(1).forEach((wb) => wb.destroy());
  expect(plain.className).toBe('existing');
  expect(pre.className).toBe('existing'); // trial removes gc-no-user-select on destroy, even one the app set
  expect(hidden.style.overflow).toBe('visible');
});
