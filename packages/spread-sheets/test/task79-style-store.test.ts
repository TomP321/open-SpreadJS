/**
 * TASK 79 — compact style storage contracts.
 *
 * The memory work changed three internal shapes; these tests pin the public
 * behaviour that must survive them:
 *  1. `Style.font` is a prototype accessor (assigned styles stay in V8 fast mode):
 *     parse-on-write into the long-hand parts, composed read-back, exact original
 *     kept for non-round-tripping shorthands, unparseable values returned verbatim.
 *  2. `setStyle` keeps the user's `Style` object by reference (trial-verified:
 *     `getStyle(r,c) === st` and border member identity), like the trial does.
 *  3. Per-cell records live in sorted-array rows (SparseGrid) — plus serialization,
 *     undo/redo and used-range behaviour of font-carrying styles.
 */
import { describe, expect, it } from 'vitest';
import GC from '../src/index.js';
import { Style } from '../src/primitives.js';

const { Workbook } = GC.Spread.Sheets;
const UsedRangeType = GC.Spread.Sheets.UsedRangeType;

describe('TASK 79 Style font storage', () => {
  it('keeps `font` off the instance: parsed parts are own, the shorthand is the prototype accessor', () => {
    const st = new Style();
    st.backColor = 'red';
    st.font = 'bold 12px Arial';
    expect(Object.hasOwn(st, 'font')).toBe(false);
    expect(Object.hasOwn(st, 'fontSize')).toBe(true);
    expect(Object.hasOwn(st, 'fontFamily')).toBe(true);
    expect(Object.hasOwn(st, 'fontWeight')).toBe(true);
    // A shorthand without italic has no fontStyle own slot at all (TASK 79 shape).
    expect(Object.hasOwn(st, 'fontStyle')).toBe(false);
    expect(st.fontSize).toBe('12px');
    expect(st.fontFamily).toBe('Arial');
    expect(st.fontWeight).toBe('bold');
    expect(st.font).toBe('bold 12px Arial');
  });
  it('a later plain shorthand clears previously parsed weight/style parts', () => {
    const st = new Style();
    st.font = 'bold italic 12px Arial';
    // TASK 90 (`.probe/t90/odd-fonts.json`, `bold italic 11px Calibri`): the trial recomposes the
    // shorthand from the parsed members in its own canonical order — style, weight, size, family —
    // so a pre-size keyword run in the unusual order reads back normalised.
    expect(st.font).toBe('italic bold 12px Arial');
    st.font = '12px Arial';
    expect(st.font).toBe('12px Arial');
    expect(st.fontWeight).toBeUndefined();
    expect(st.fontStyle).toBeUndefined();
    expect(Object.hasOwn(st, 'fontWeight')).toBe(true); // the previous assignment left the slot, cleared
  });
  it('re-composes the shorthand from changed parts when the original no longer round-trips', () => {
    const st = new Style();
    st.font = 'bold italic 12px Arial'; // not the canonical composition order
    st.fontWeight = 'normal';
    expect(st.font).toBe('italic normal 12px Arial');
  });
  it('remembers unparseable font values verbatim (no own `font` slot, getter still reports them)', () => {
    const st = new Style();
    st.font = 'inherit';
    expect(st.font).toBe('inherit');
    expect(Object.hasOwn(st, 'font')).toBe(false);
    expect(st.toJSON()).toEqual({ font: 'inherit' });
  });
  it('font = undefined clears the font members it cannot express', () => {
    const st = new Style();
    st.font = 'bold 12px Arial';
    st.font = undefined;
    expect(st.font).toBeUndefined();
    // TASK 90 (`.probe/t90/odd-fonts.json`, `clear-undefined`): the trial clears the members a
    // shorthand cannot carry — after `font = undefined` its fontSize/fontFamily/fontWeight all
    // read null, they do not keep the previously parsed values.
    expect(st.fontSize).toBeUndefined();
    expect(st.fontFamily).toBeUndefined();
    expect(st.fontWeight).toBeUndefined();
    expect(st.toJSON()).toBeUndefined();
  });
  it('constructor object options parse the shorthand like the setter', () => {
    const st = new Style({ font: 'bold 9px Verdana', backColor: 'x' });
    expect(st.font).toBe('bold 9px Verdana');
    expect(st.fontSize).toBe('9px');
    expect(st.fontFamily).toBe('Verdana');
    expect(st.toJSON()).toEqual({ backColor: 'x', font: 'bold 9px Verdana', fontWeight: 'bold', fontSize: '9px', fontFamily: 'Verdana' });
  });
  it('clone() carries the font through, including a value the parser normalises', () => {
    const canonical = new Style();
    canonical.font = '11px Calibri';
    const odd = new Style();
    odd.font = 'bold italic 12px Arial';
    const a = canonical.clone(),
      b = odd.clone();
    expect(a).not.toBe(canonical);
    expect(a.font).toBe('11px Calibri');
    expect(b.font).toBe('italic bold 12px Arial'); // the trial's canonical composition (TASK 90 probe)
    expect(b.toJSON()).toEqual(odd.toJSON());
  });
  it('interned font parts share one string instance across styles', () => {
    const a = new Style(),
      b = new Style();
    a.font = 'bold 11px Calibri';
    // Same content as the literal above, built at run time so it is a different string instance.
    b.font = ['bold', '11px', 'Calibri'].join(' ') as string;
    expect(a.fontSize).toBe(b.fontSize);
    // Same slice content and, since TASK 79 interns the parsed parts, the same string instance.
    expect(a.fontFamily === b.fontFamily).toBe(true);
  });
});

describe('TASK 79 cell style records', () => {
  it('getStyle returns the very object setStyle was given (trial reference semantics)', () => {
    const wb = new Workbook(),
      s = wb.getSheet(0);
    const st = new Style();
    st.backColor = 'red';
    s.setStyle(0, 0, st);
    expect(s.getStyle(0, 0)).toBe(st);
    expect(s.getStyle(0, 0)).toBe(s.getStyle(0, 0));
    // Mutating the user object after setStyle re-styles the cell (trial behaviour).
    st.foreColor = 'blue';
    expect(s.getStyle(0, 0)?.foreColor).toBe('blue');
    expect(s.getActualStyle(0, 0).foreColor).toBe('blue');
    const border = new GC.Spread.Sheets.LineBorder('purple', 1);
    st.borderLeft = border;
    expect(s.getActualStyle(0, 0).borderLeft).toBe(border);
    s.setStyle(0, 0, null);
    expect(s.getStyle(0, 0)).toBeNull();
  });
  it('getActualStyle carries the font shorthand through the whole cascade', () => {
    const wb = new Workbook(),
      s = wb.getSheet(0);
    // default font comes from the workbook option
    expect(s.getActualStyle(0, 0).font).toBe('14.6667px Calibri');
    const cellFont = new Style();
    cellFont.font = 'bold 16px Georgia';
    s.setStyle(1, 1, cellFont);
    const actual = s.getActualStyle(1, 1);
    expect(actual.font).toBe('bold 16px Georgia');
    expect(actual.fontSize).toBe('16px');
    expect(actual.fontFamily).toBe('Georgia');
    expect(actual.fontWeight).toBe('bold');
    // named style resolved through the cell: assigned members plus the name
    const named = new Style();
    named.name = 'T79Named';
    named.font = 'italic 10px Consolas';
    s.addNamedStyle(named);
    s.setStyleName(2, 2, 'T79Named');
    const viaName = s.getStyle(2, 2)!;
    expect(viaName.toJSON()).toEqual({ font: 'italic 10px Consolas', name: 'T79Named', fontStyle: 'italic', fontSize: '10px', fontFamily: 'Consolas' });
    expect(s.getActualStyle(2, 2).font).toBe('italic 10px Consolas');
    // a non-canonical shorthand order is recomposed by both sides (TASK 90 trial probe)
    const odd = new Style();
    odd.name = 'T79Odd';
    odd.font = 'bold italic 12px Arial';
    s.addNamedStyle(odd);
    s.setStyleName(2, 3, 'T79Odd');
    expect(s.getStyle(2, 3)!.font).toBe('italic bold 12px Arial');
    expect(s.getActualStyle(2, 3).font).toBe('italic bold 12px Arial');
  });
  it('used-range counts a style that only carries an unparseable font', () => {
    const wb = new Workbook(),
      s = wb.getSheet(0);
    const st = new Style();
    st.font = 'inherit';
    s.setStyle(3, 2, st);
    const box = s.getUsedRange(UsedRangeType.style);
    expect(box).toMatchObject({ row: 3, col: 2, rowCount: 1, colCount: 1 });
  });
  it('serializes and restores font-carrying cell and named styles through JSON', () => {
    const wb = new Workbook(),
      s = wb.getSheet(0);
    const canonical = new Style();
    canonical.font = 'bold 12px Arial';
    canonical.backColor = '#ffee00';
    s.setStyle(0, 0, canonical);
    const odd = new Style();
    odd.font = 'bold italic 12px Arial';
    s.setStyle(1, 1, odd);
    const named = new Style();
    named.name = 'T79RoundTrip';
    named.font = '10.5pt Times New Roman';
    wb.addNamedStyle(named);
    const json = wb.toJSON();
    const wb2 = new Workbook();
    wb2.fromJSON(json);
    const s2 = wb2.getSheet(0);
    expect(s2.getStyle(0, 0)?.toJSON()).toEqual({
      backColor: '#ffee00',
      font: 'bold 12px Arial',
      fontWeight: 'bold',
      fontSize: '12px',
      fontFamily: 'Arial',
    });
    expect(s2.getStyle(1, 1)?.font).toBe('italic bold 12px Arial');
    expect(s2.getActualStyle(1, 1).font).toBe('italic bold 12px Arial');
    // TASK 90 (`.probe/t90/family-r1.json`): the trial quotes a multi-word family in the composed
    // shorthand and stores it quoted in `fontFamily` (`10.5pt Times New Roman` ->
    // `10.5pt 'Times New Roman'`), and ours now produces the same value for the same input.
    expect(wb2.getNamedStyle('T79RoundTrip')?.font).toBe("10.5pt 'Times New Roman'");
    expect(wb2.getNamedStyle('T79RoundTrip')?.toJSON()?.font).toBe("10.5pt 'Times New Roman'");
    // styleToJSON fills the parsed parts from the shorthand (official fixture shape)
    const out = (wb2.toJSON().namedStyles as Record<string, unknown>[])[0];
    expect(out.fontSize).toBe('10.5pt');
    expect(out.fontFamily).toBe("'Times New Roman'");
  });
  it('undo/redo through a store-snapshot command restores a font-carrying style exactly', () => {
    const wb = new Workbook(),
      s = wb.getSheet(0),
      cm = wb.commandManager(),
      um = wb.undoManager();
    const before = new Style();
    before.font = 'bold italic 12px Arial';
    before.backColor = 'red';
    s.setStyle(2, 1, before);
    // `dragDrop` (move) round-trips the cell record through the transaction
    // snapshot's clone() — the exact path the memory work touches.
    expect(cm.execute({ cmd: 'dragDrop', sheetName: s.name(), fromRow: 2, fromColumn: 1, toRow: 5, toColumn: 1, copy: false })).toBe(true);
    expect(s.getStyle(5, 1)?.font).toBe('italic bold 12px Arial');
    expect(s.getStyle(2, 1)).toBeNull();
    um.undo();
    const restored = s.getStyle(2, 1)!;
    expect(restored.font).toBe('italic bold 12px Arial');
    expect(restored.fontSize).toBe('12px');
    expect(restored.fontFamily).toBe('Arial');
    expect(s.getStyle(5, 1)).toBeNull();
    expect(restored.toJSON()).toEqual({
      backColor: 'red',
      font: 'italic bold 12px Arial',
      fontStyle: 'italic',
      fontWeight: 'bold',
      fontSize: '12px',
      fontFamily: 'Arial',
    });
    um.redo();
    expect(s.getStyle(5, 1)?.font).toBe('italic bold 12px Arial');
    expect(s.getStyle(2, 1)).toBeNull();
  });
  it('row and column level styles keep reference identity like cells', () => {
    const wb = new Workbook(),
      s = wb.getSheet(0);
    const rowStyle = new Style();
    rowStyle.font = '11px Calibri';
    s.setStyle(4, -1, rowStyle);
    expect(s.getStyle(4, -1)).toBe(rowStyle);
    const colStyle = new Style();
    colStyle.backColor = 'lime';
    s.setStyle(-1, 6, colStyle);
    expect(s.getStyle(-1, 6)).toBe(colStyle);
    expect(s.getActualStyle(4, 6)).toMatchObject({ backColor: 'lime', font: '11px Calibri' });
  });
});
