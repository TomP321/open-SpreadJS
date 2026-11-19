// @vitest-environment jsdom
// Unit tests for the two core namespace functions closed in TASK 46
// (`GC.Spread.Sheets.findControl`, `GC.Spread.Sheets.getTypeFromString`).
// All expectations are the trial values recorded by .probe/api-sweep-probe.mjs
// segments core46p..core46s (official core page, public API only):
//  findControl: length 1; host element and id string map to the workbook ("same");
//  a child (inner div / canvas) answers undefined (exact-host lookup only);
//  an unknown id answers undefined; a destroyed workbook's host answers null;
//  a workbook object as argument answers undefined; two workbooks on one host keep
//  the first registration ("first").
//  getTypeFromString: length 1; the confirmed trial names 'Text'/'Image'/'Lock'
//  resolve to the live globals (in the trial page 'Text' is the DOM Text interface,
//  probe core46r: prototype splitText/wholeText); every other name — lowercase
//  variants, cell-type names not on that list, '' and 'garbage' — answers undefined.
import { describe, expect, it } from 'vitest';
import GC from '../src/index.js';

const { Workbook, findControl, getTypeFromString } = GC.Spread.Sheets;

describe('GC.Spread.Sheets.findControl (trial probe core46p/core46q)', () => {
  it('has the trial arity', () => {
    expect(typeof findControl).toBe('function');
    expect(findControl.length).toBe(1);
  });

  it('maps host elements and id strings to the workbook; children and unknown hosts answer undefined', () => {
    const host = document.createElement('div');
    host.id = 'fc-unit-host';
    host.style.cssText = 'position:absolute;left:-2000px;top:0;width:200px;height:120px';
    document.body.appendChild(host);
    const inner = document.createElement('div');
    host.appendChild(inner);
    const wb = new Workbook(host);
    try {
      expect(findControl(host)).toBe(wb);
      expect(findControl('fc-unit-host')).toBe(wb);
      expect(findControl(inner)).toBeUndefined(); // trial nested/inner: undefined (no host-chain walk)
      expect(findControl('nope-unit-unknown')).toBeUndefined();
      expect(findControl(wb as never)).toBeUndefined(); // trial byWbObj: undefined
    } finally {
      wb.destroy();
      host.remove();
    }
  });

  it('a destroyed workbook answers null for its former host; first registration wins', () => {
    const host = document.createElement('div');
    host.id = 'fc-unit-host2';
    host.style.cssText = 'position:absolute;left:-2000px;top:0;width:200px;height:120px';
    document.body.appendChild(host);
    const wb = new Workbook(host);
    const wb2 = new Workbook(host); // trial twoWb: 'first'
    expect(findControl(host)).toBe(wb);
    wb.destroy();
    expect(findControl('fc-unit-host2')).toBeNull(); // trial afterDestroy: null
    expect(findControl(host)).toBeNull();
    wb2.destroy();
    host.remove();
  });
});

describe('GC.Spread.Sheets.getTypeFromString (trial probe core46p..core46s)', () => {
  it('has the trial arity', () => {
    expect(typeof getTypeFromString).toBe('function');
    expect(getTypeFromString.length).toBe(1);
  });

  it('resolves the confirmed trial names to the live globals', () => {
    expect(getTypeFromString('Text')).toBe(globalThis.Text);
    // 'Image'/'Lock' are page globals only where such classes exist; our page has none,
    // so the lookup must answer undefined there (the trial page answers its own globals).
    if ('Image' in globalThis) expect(getTypeFromString('Image')).toBe(globalThis.Image);
    else expect(getTypeFromString('Image')).toBeUndefined();
    if ('Lock' in globalThis) expect(getTypeFromString('Lock')).toBe(globalThis.Lock);
    else expect(getTypeFromString('Lock')).toBeUndefined();
  });

  it('answers undefined for every other name, like the trial (19 names probed)', () => {
    for (const name of ['text', 'combobox', 'button', 'checkbox', 'commandbar', 'shape', 'datamatrix',
      'qrcode', 'pdf417', 'barcode', 'sparkline', 'line', 'image', 'lock', 'none', 'COMBOBOX',
      'garbage', '', 'Button', 'Checkbox', 'Combobox', 'Commandbar', 'Shape', 'Image2', 'ValueType', 'Style', 'Font']) {
      expect(getTypeFromString(name), name).toBeUndefined();
    }
  });
});
