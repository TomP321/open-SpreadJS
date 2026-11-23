// @vitest-environment jsdom
/* User report 2026-11-23 (MacBook): "the delete does not clear all the selected rows / cells". macOS has no Delete key:
 * its "delete" key is Backspace, and Excel for Mac clears every selected cell with it. On a Mac, Backspace on a
 * multi-cell selection must therefore clear the whole selection (like Delete); elsewhere, and with a single cell, it keeps
 * the SpreadJS behaviour (edit the active cell from an empty text). Cmd+click on headers adds ranges like Ctrl+click. */
import { afterEach, describe, expect, it } from 'vitest';
import GC from '../src/index.js';
import { isMacPlatform } from '../src/interaction.js';
import { stubCanvas2d } from './fixtures/stub-canvas2d.js';

const { Workbook } = GC.Spread.Sheets;
stubCanvas2d();

const realPlatform = Object.getOwnPropertyDescriptor(Navigator.prototype, 'platform');
function setPlatform(value: string): void {
  Object.defineProperty(navigator, 'platform', { configurable: true, get: () => value });
}
afterEach(() => {
  delete (navigator as unknown as Record<string, unknown>).platform;
  if (realPlatform) Object.defineProperty(Navigator.prototype, 'platform', realPlatform);
});

function host() {
  document.body.innerHTML = '<div id="sheet"></div>';
  const element = document.getElementById('sheet')!;
  Object.defineProperties(element, { clientWidth: { configurable: true, value: 600 }, clientHeight: { configurable: true, value: 400 } });
  const workbook = new Workbook(element);
  const sheet = workbook.getSheet(0);
  for (let r = 0; r < 5; r++) for (let c = 0; c < 4; c++) sheet.setValue(r, c, r * 10 + c);
  const view = workbook._renderer()!;
  return { sheet, root: view.root };
}

function backspace(root: HTMLElement): void {
  root.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', keyCode: 8, bubbles: true, cancelable: true }));
}

describe('Backspace on a Mac', () => {
  it('detects the platform', () => {
    setPlatform('MacIntel');
    expect(isMacPlatform()).toBe(true);
    setPlatform('Linux x86_64');
    expect(isMacPlatform()).toBe(false);
  });

  it('clears every cell of a multi-cell selection on a Mac', () => {
    setPlatform('MacIntel');
    const { sheet, root } = host();
    sheet.setActiveCell(1, 1);
    sheet.setSelection(1, 1, 2, 2);
    backspace(root);
    expect(sheet.isEditing()).toBe(false);
    expect([sheet.getValue(1, 1), sheet.getValue(1, 2), sheet.getValue(2, 1), sheet.getValue(2, 2)]).toEqual([null, null, null, null]);
    expect(sheet.getValue(0, 0)).toBe(0);
    expect(sheet.getValue(3, 3)).toBe(33);
  });

  it('clears whole selected rows on a Mac', () => {
    setPlatform('MacIntel');
    const { sheet, root } = host();
    sheet.setSelection(2, -1, 2, -1);
    backspace(root);
    expect([sheet.getValue(2, 0), sheet.getValue(3, 3)]).toEqual([null, null]);
    expect(sheet.getValue(1, 0)).toBe(10);
    expect(sheet.getValue(4, 0)).toBe(40);
  });

  it('keeps editing the active cell for a single cell on a Mac and everywhere else', () => {
    setPlatform('MacIntel');
    let h = host();
    h.sheet.setActiveCell(1, 1);
    backspace(h.root);
    expect(h.sheet.isEditing()).toBe(true);
    h.sheet.endEdit(true);
    setPlatform('Linux x86_64');
    h = host();
    h.sheet.setActiveCell(1, 1);
    h.sheet.setSelection(1, 1, 2, 2);
    backspace(h.root);
    expect(h.sheet.isEditing()).toBe(true);
    expect(h.sheet.getValue(2, 2)).toBe(22);
  });
});
