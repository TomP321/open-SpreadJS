/**
 * TASK 46 item 1: GC.Spread.Sheets.Style members (applyAlignment/applyBorder/applyFill/
 * applyFont/applyNumberFormat/applyProtection, allowEditInCell, backgroundImage,
 * backgroundImageLayout and the rest of the declared data members).
 *
 * Every expected value below was read from the official trial through its public API
 * (.probe/api-sweep-probe.mjs segments style46/style2/style3); no official internals were read.
 */
import { describe, expect, it } from 'vitest';
import GC from '../src/index.js';

const { Style, Workbook, ImageLayout, HorizontalAlign, VerticalAlign } = GC.Spread.Sheets;

const trialMembers = [
  'allowEditInCell', 'applyAlignment', 'applyBorder', 'applyFill', 'applyFont', 'applyNumberFormat',
  'applyProtection', 'backColor', 'backgroundImage', 'backgroundImageLayout', 'borderBottom', 'borderLeft',
  'borderRadius', 'borderRight', 'borderTop', 'cellButtons', 'cellPadding', 'cellType', 'decoration',
  'diagonalDown', 'diagonalUp', 'dropDowns', 'fontFamily', 'fontSize', 'fontStyle', 'fontWeight',
  'foreColor', 'formatter', 'hAlign', 'hidden', 'imeMode', 'isVerticalText', 'labelOptions', 'locked',
  'mask', 'name', 'parentName', 'showEllipsis', 'shrinkToFit', 'tabStop', 'textDecoration', 'textDirection',
  'textIndent', 'textOrientation', 'themeFont', 'vAlign', 'watermark', 'wordWrap',
];

describe('Style members behave like the trial (TASK 46 probe)', () => {
  it('reads undefined before assignment and becomes an own data property after assignment', () => {
    for (const key of trialMembers) {
      const style = new Style();
      // Trial: a fresh style owns nothing; reads through the prototype yield undefined.
      expect(style[key], key).toBeUndefined();
      expect(Object.hasOwn(style, key), key).toBe(false);
      style[key] = key;
      // Trial: the assignment creates an own writable data property (style2:setter probe).
      const descriptor = Object.getOwnPropertyDescriptor(style, key)!;
      expect(descriptor.writable, key).toBe(true);
      expect(descriptor.value, key).toBe(key);
      expect(style[key], key).toBe(key);
      expect((style.toJSON() as Record<string, unknown>)[key], key).toBe(key);
    }
  });

  it('toJSON() returns undefined for a style without assigned members', () => {
    // Trial: `JSON.stringify(new Style().toJSON())` was `undefined` (style:ctor probe).
    expect(new Style().toJSON()).toBeUndefined();
    expect(new Style().clone().toJSON()).toBeUndefined();
  });

  it('serializes assigned members like the trial setter case', () => {
    const style = new Style();
    style.applyAlignment = false;
    style.allowEditInCell = false;
    style.backgroundImage = 'bg.png';
    style.backgroundImageLayout = ImageLayout.center; // trial stored 1
    style.borderRadius = '4px';
    style.textOrientation = 1;
    style.hidden = true;
    style.cellPadding = '2px';
    style.isVerticalText = true;
    expect(style.toJSON()).toEqual({
      backgroundImage: 'bg.png',
      backgroundImageLayout: 1,
      cellPadding: '2px',
      isVerticalText: true,
      textOrientation: 1,
      hidden: true,
      allowEditInCell: false,
      borderRadius: '4px',
      applyAlignment: false,
    });
    expect(ImageLayout.stretch).toBe(0); // trial stored 0 for stretch in getStyle(1,1)
  });

  it('keeps the constructor positional-argument shape and writes the composite font', () => {
    const style = new Style('red', 'blue', HorizontalAlign.left, VerticalAlign.top, '12px Arial');
    expect(HorizontalAlign.left).toBe(0);
    expect(VerticalAlign.top).toBe(0);
    expect(style.toJSON()).toEqual({
      backColor: 'red',
      foreColor: 'blue',
      hAlign: 0,
      vAlign: 0,
      font: '12px Arial',
      fontSize: '12px',
      fontFamily: 'Arial',
    });
    style.applyAlignment = true;
    expect(style.toJSON()).toEqual({
      backColor: 'red',
      foreColor: 'blue',
      hAlign: 0,
      vAlign: 0,
      font: '12px Arial',
      fontSize: '12px',
      fontFamily: 'Arial',
      applyAlignment: true,
    });
  });

  it('accepts the single-options-object constructor like the trial', () => {
    const style = new Style({ backColor: 'green', applyFill: false, name: 'optstyle' });
    expect(style.toJSON()).toEqual({ backColor: 'green', name: 'optstyle', applyFill: false });
  });

  it('composes the font shorthand from any subset of the font parts (trial values)', () => {
    const cases: [string, (style: InstanceType<typeof Style>) => void, Record<string, unknown>][] = [
      ['sizeOnly', (s) => { s.fontSize = '11pt'; }, { font: '11pt', fontSize: '11pt' }],
      ['styleOnly', (s) => { s.fontStyle = 'italic'; }, { font: 'italic', fontStyle: 'italic' }],
      ['weightOnly', (s) => { s.fontWeight = 'bold'; }, { font: 'bold', fontWeight: 'bold' }],
      ['sizeFamily', (s) => { s.fontSize = '11pt'; s.fontFamily = 'Calibri'; }, { font: '11pt Calibri', fontSize: '11pt', fontFamily: 'Calibri' }],
      ['fullCombo', (s) => { s.fontStyle = 'italic'; s.fontWeight = 'bold'; s.fontSize = '11pt'; s.fontFamily = 'Calibri'; }, { font: 'italic bold 11pt Calibri', fontStyle: 'italic', fontWeight: 'bold', fontSize: '11pt', fontFamily: 'Calibri' }],
      ['fontThenFamily', (s) => { s.font = '12px Arial'; s.fontFamily = 'Georgia'; }, { font: '12px Georgia', fontSize: '12px', fontFamily: 'Georgia' }],
      ['fontThenSize', (s) => { s.font = '12px Arial'; s.fontSize = '20px'; }, { font: '20px Arial', fontSize: '20px', fontFamily: 'Arial' }],
      ['familyThenFont', (s) => { s.fontFamily = 'Georgia'; s.font = '12px Arial'; }, { font: '12px Arial', fontSize: '12px', fontFamily: 'Arial' }],
    ];
    for (const [name, setup, expected] of cases) {
      const style = new Style();
      setup(style);
      expect(style.font, name).toBe(expected.font);
      expect(style.toJSON(), name).toEqual(expected);
    }
  });

  it('exposes the trial runtime extras compose() and fromJSON() (not part of the d.ts contract)', () => {
    // style3:compose probe values.
    const a = new Style();
    a.backColor = 'red';
    a.hAlign = 1;
    const b = new Style();
    b.backColor = 'blue';
    b.fontFamily = 'Arial';
    expect(a.compose(b)).toBeUndefined();
    expect(a.toJSON()).toEqual({ backColor: 'red', hAlign: 1, font: 'Arial', fontFamily: 'Arial' });
    expect(b.toJSON()).toEqual({ backColor: 'blue', font: 'Arial', fontFamily: 'Arial' });
    const a4 = new Style();
    a4.backColor = 'red';
    a4.compose(b, new Style({ foreColor: 'green' })); // truthy second argument: source wins
    expect(a4.toJSON()).toEqual({ backColor: 'blue', font: 'Arial', fontFamily: 'Arial' });
    expect(() => (a as unknown as { compose(): void }).compose()).toThrow(/labelOptions/);
    const a3 = new Style();
    a3.backColor = 'red';
    a3.compose([b] as unknown as InstanceType<typeof Style>);
    expect(a3.toJSON()).toEqual({ backColor: 'red' });
    const target = new Style();
    target.fromJSON({ backColor: 'cyan', hAlign: 1 });
    expect(target.toJSON()).toEqual({ backColor: 'cyan', hAlign: 1 });
  });

  it('clones like the trial (shorthand font kept, prototype preserved)', () => {
    const style = new Style('red', 'blue', HorizontalAlign.center, VerticalAlign.center, '12px Arial');
    const copy = style.clone();
    expect(Object.getPrototypeOf(copy)).toBe(Style.prototype);
    expect(copy.toJSON()).toEqual({
      backColor: 'red',
      foreColor: 'blue',
      hAlign: 1,
      vAlign: 1,
      font: '12px Arial',
      fontSize: '12px',
      fontFamily: 'Arial',
    });
    expect(copy.font).toBe('12px Arial');
    expect(copy.fontFamily).toBe('Arial');
  });

  it('applies cell styles and reads them back like the trial (style:sheet probe)', () => {
    const wb = new Workbook();
    const sheet = wb.getSheet(0);
    const style = new Style();
    style.backColor = 'yellow';
    style.applyAlignment = false;
    style.applyBorder = true;
    style.applyFill = false;
    style.allowEditInCell = false;
    style.backgroundImage = 'bg1';
    style.backgroundImageLayout = ImageLayout.stretch;
    sheet.setStyle(1, 1, style);
    expect(sheet.getStyle(1, 1)!.toJSON()).toEqual({
      backColor: 'yellow',
      backgroundImage: 'bg1',
      backgroundImageLayout: 0,
      allowEditInCell: false,
      applyFill: false,
      applyAlignment: false,
      applyBorder: true,
    });
  });

  it('round-trips workbook named styles like the trial (style:named probe)', () => {
    const wb = new Workbook();
    const ns1 = new Style();
    ns1.name = 'NS1';
    ns1.backColor = 'lime';
    ns1.applyFill = true;
    ns1.allowEditInCell = false;
    wb.addNamedStyle(ns1);
    expect(wb.getNamedStyle('NS1').toJSON()).toEqual({ backColor: 'lime', name: 'NS1', allowEditInCell: false, applyFill: true });
    const parent = new Style();
    parent.name = 'P1';
    parent.foreColor = 'navy';
    wb.addNamedStyle(parent);
    const child = new Style();
    child.name = 'C1';
    child.parentName = 'P1';
    child.hAlign = HorizontalAlign.center;
    wb.addNamedStyle(child);
    const sheet = wb.getSheet(0);
    sheet.setStyle(1, 1, 'C1' as unknown as InstanceType<typeof Style>);
    // Trial: getStyle on a named-style reference returns the named style itself.
    expect(sheet.getStyle(1, 1)!.toJSON()).toEqual({ hAlign: 1, name: 'C1', parentName: 'P1' });
    const named = (wb.toJSON().namedStyles as Record<string, unknown>[]).map((entry) => ({ ...entry }));
    expect(named).toEqual([
      { backColor: 'lime', name: 'NS1', allowEditInCell: false, applyFill: true },
      { foreColor: 'navy', name: 'P1' },
      { hAlign: 1, name: 'C1', parentName: 'P1' },
    ]);
    wb.removeNamedStyle('NS1');
  });

  it('resolves named-style references, cascade and getStyleName like the trial (style2:name / style3:getname probes)', () => {
    const wb = new Workbook();
    const sheet = wb.getSheet(0);
    const base = new Style();
    base.name = 'Base46';
    base.foreColor = 'navy';
    const local = new Style();
    local.name = 'Local46';
    local.parentName = 'Base46';
    local.formatter = '0.00';
    wb.addNamedStyle(base);
    wb.addNamedStyle(local);
    sheet.setStyleName(1, 2, 'Local46');
    expect(sheet.getStyleName(1, 2)).toBe('Local46');
    expect(sheet.getStyle(1, 2)!.toJSON()).toEqual({ formatter: '0.00', name: 'Local46', parentName: 'Base46' });
    sheet.setStyleName(-1, 3, 'Base46');
    expect(sheet.getStyleName(-1, 3)).toBe('Base46');
    expect(sheet.getStyle(-1, 3)!.toJSON()).toEqual({ foreColor: 'navy', name: 'Base46' });
    expect(sheet.getActualStyle(1, 2).toJSON()).toEqual({
      foreColor: 'navy',
      hAlign: 3,
      vAlign: 0,
      font: '14.6667px Calibri',
      themeFont: 'Body',
      formatter: '0.00',
      locked: true,
      imeMode: 1,
      name: 'Local46',
      parentName: 'Base46',
      fontSize: '14.6667px',
      fontFamily: 'Calibri',
      hidden: false,
    });
    // getStyleName on a plain Style object reports undefined in the trial; a cleared cell reports null.
    sheet.setStyle(1, 2, new Style({ backColor: 'red' }));
    expect(sheet.getStyleName(1, 2)).toBeUndefined();
    sheet.setStyle(2, 2, null);
    expect(sheet.getStyleName(2, 2)).toBeNull();
    expect(sheet.getStyle(2, 2)).toBeNull();
    const withParent = new Style();
    withParent.backColor = 'red';
    withParent.name = 'WithParent';
    withParent.parentName = 'Parent46';
    sheet.setStyle(3, 3, withParent);
    expect(sheet.getStyleName(3, 3)).toBe('WithParent');
  });

  it('leaves the apply* flags off CellRange but chains the declared accessors like the trial', () => {
    const wb = new Workbook();
    const sheet = wb.getSheet(0);
    const cell = sheet.getCell(4, 4);
    // style3:getname probe: `c.applyAlignment is not a function` on the trial.
    expect((cell as unknown as Record<string, unknown>).applyAlignment).toBeUndefined();
    expect((cell as unknown as Record<string, unknown>).applyFill).toBeUndefined();
    expect((cell as unknown as Record<string, unknown>).allowEditInCell).toBeTypeOf('function'); // declared by the contract
    expect(cell.backColor('green')).toBe(cell);
    expect(cell.backgroundImage('x1')).toBe(cell);
    expect(cell.backgroundImage()).toBe('x1');
    expect(sheet.getStyle(4, 4)!.toJSON()).toEqual({ backColor: 'green', backgroundImage: 'x1' });
  });
});
