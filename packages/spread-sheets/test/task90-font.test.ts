// @vitest-environment jsdom
/* TASK 90 (user-reported symptoms A "the font falls back to a default" and B "bold glitches", and
 * C frozen-pane scrolling): the font shorthand model and the scroll step.
 *
 * Every expected value below is a black-box measurement of the trial through the public API:
 *   .probe/t90/parse-r1.json      — Style.font parsing / composition / clearing, both sides,
 *   .probe/t90/odd-r1.json        — odd shorthands (`0bold 11px Calibri`, `11pt "Segoe UI"`),
 *   .probe/t90/family-r1.json     — multi-word families (`11pt Calibri Light` -> quoted),
 *   .probe/t90/fonts-r1.json      — the ribbon command sequences (Increase Font Size, Bold, ...),
 *   .probe/t90/wheel3-r1.json     — the trial's wheel step with 40px rows and 120px columns,
 *   .probe/t90/hbar-r1.json       — the trial's scrollbar arrow step.
 */
import { describe, expect, it } from 'vitest';
import GC from '../src/index.js';
import { canvasFont, parseFontParts, Style } from '../src/primitives.js';
import { stubCanvas2d } from './fixtures/stub-canvas2d.js';

const { Workbook } = GC.Spread.Sheets;

stubCanvas2d();

describe('TASK 90 font shorthand parsing (trial values)', () => {
  const cases: [string, Record<string, string | undefined>][] = [
    // the trial fills the member a fragment names and leaves the others unset
    ['18pt', { fontSize: '18pt' }],
    ['18px', { fontSize: '18px' }],
    ['Georgia', { fontFamily: 'Georgia' }],
    ['bold', { fontWeight: 'bold' }],
    ['italic', { fontStyle: 'italic' }],
    ['italic 600 12pt Arial', { fontStyle: 'italic', fontWeight: '600', fontSize: '12pt', fontFamily: 'Arial' }],
    // the composition is canonical, whatever order the value came in
    ['bold italic 12pt Arial', { fontStyle: 'italic', fontWeight: 'bold', fontSize: '12pt', fontFamily: 'Arial' }],
    ['Georgia 12pt', { fontSize: '12pt', fontFamily: 'Georgia' }],
    // a keyword after the size is part of the family, not a weight (trial: family `'Georgia bold'`)
    ['12pt Georgia bold', { fontSize: '12pt', fontFamily: "'Georgia bold'" }],
    // a non-keyword before the size is part of the family too (trial: family `0bold Calibri`)
    ['0bold 11px Calibri', { fontSize: '11px', fontFamily: '0bold Calibri' }],
    ['boldx 11px Calibri', { fontSize: '11px', fontFamily: 'boldx Calibri' }],
    // comma lists stay unquoted, single multi-word names get quoted
    ['Arial, Helvetica, sans-serif', { fontFamily: 'Arial, Helvetica, sans-serif' }],
    ['bold 11px Calibri, Arial', { fontWeight: 'bold', fontSize: '11px', fontFamily: 'Calibri, Arial' }],
    ['11pt Calibri Light', { fontSize: '11pt', fontFamily: "'Calibri Light'" }],
    ['11pt "Segoe UI"', { fontSize: '11pt', fontFamily: "'Segoe UI'" }],
  ];
  for (const [value, expected] of cases) {
    it(`parses ${JSON.stringify(value)}`, () => {
      const parts = parseFontParts(value)!.parts;
      const own = Object.fromEntries(Object.entries(parts).filter(([, v]) => v !== undefined));
      expect(own, value).toEqual(expected);
    });
  }

  it('reports the composed shorthand and rebuilds it when a member changes', () => {
    const st = new Style();
    st.font = 'bold 12pt Calibri';
    expect(st.font).toBe('bold 12pt Calibri');
    st.fontSize = '20pt';
    expect(st.font).toBe('bold 20pt Calibri');
    st.fontFamily = 'Georgia';
    expect(st.font).toBe('bold 20pt Georgia');
    st.fontWeight = 'normal';
    expect(st.font).toBe('normal 20pt Georgia');
    // a value the four members cannot represent (the `/1.4` line box) stays verbatim
    const odd = new Style();
    odd.font = '12px/1.4 Arial';
    expect(odd.font).toBe('12px/1.4 Arial');
    expect(odd.fontSize).toBe('12px');
    expect(odd.fontFamily).toBe('Arial');
    // a CSS-wide keyword is not a family name
    const wide = new Style();
    wide.font = 'inherit';
    expect(wide.font).toBe('inherit');
    expect(wide.fontFamily).toBeUndefined();
  });

  it('clears the members a cleared shorthand cannot express (trial `clear-undefined`)', () => {
    const st = new Style();
    st.font = 'bold 12px Arial';
    st.font = undefined;
    expect(st.font).toBeUndefined();
    expect(st.fontWeight).toBeUndefined();
    expect(st.fontSize).toBeUndefined();
    expect(st.fontFamily).toBeUndefined();
  });
});

describe('TASK 90 canvas font strings', () => {
  // An invalid `ctx.font` assignment is ignored by the canvas, which is symptom A/B: whatever font
  // the context held last keeps being used. Every value we hand over must therefore be a complete
  // CSS font shorthand: a size in CSS pixels and a family.
  const VALID = /^(?:(?:italic|oblique|small-caps|bold|bolder|lighter|normal|[1-9]00) )*[\d.]+px [^\d]/;

  it('completes a fragment with the default size and family', () => {
    expect(canvasFont(new Style({ font: '12pt' }))).toBe('16px Calibri');
    expect(canvasFont(new Style({ font: 'bold' }))).toBe('bold 14.6667px Calibri');
    expect(canvasFont(new Style({ font: 'Georgia' }))).toBe('14.6667px Georgia');
    expect(canvasFont(undefined)).toBe('14.6667px Calibri');
  });
  it('converts units and scales the size by the sheet zoom', () => {
    expect(canvasFont(new Style({ fontSize: '11pt', fontFamily: 'Calibri' }), 1.5)).toBe('22px Calibri');
    expect(canvasFont(new Style({ fontSize: '14.6667px', fontFamily: 'Calibri' }), 1.25)).toBe('18.3334px Calibri');
    expect(canvasFont(new Style({ fontSize: '14.6667px', fontFamily: 'Calibri' }), 2)).toBe('29.3334px Calibri');
    expect(canvasFont(new Style({ fontSize: '12pt', fontFamily: 'Calibri' }), 4)).toBe('64px Calibri');
    expect(canvasFont(new Style({ fontSize: '10px', fontFamily: 'Calibri' }), 1.5)).toBe('15px Calibri');
  });
  it('keeps weight and style and quotes a multi-word family', () => {
    expect(canvasFont(new Style({ fontStyle: 'italic', fontWeight: 'bold', fontSize: '12pt', fontFamily: 'Calibri' }))).toBe('italic bold 16px Calibri');
    expect(canvasFont(new Style({ fontSize: '11pt', fontFamily: 'Calibri Light' }))).toBe("14.6667px 'Calibri Light'");
  });
  it('never yields an invalid shorthand for any font a style can hold', () => {
    const styles = [
      new Style({ font: '12pt' }), new Style({ font: 'bold' }), new Style({ font: 'inherit' }),
      new Style({ font: '12px/1.4 Arial' }), new Style({ font: 'Segoe UI' }), new Style({ fontStyle: 'bold' }),
      new Style({ fontSize: 'nonsense' }), new Style({ fontFamily: 'Times New Roman' }), new Style(),
    ];
    for (const style of styles) {
      const font = canvasFont(style, 1.5);
      expect(font, `${JSON.stringify(style.toJSON() ?? {})} -> ${font}`).toMatch(VALID);
      // the size token is always a plain CSS pixel value: what `renderer.font` and the text
      // measurement regexes expect
      expect(font).toMatch(/\d+(?:\.\d+)?px /);
    }
  });
});

describe('TASK 90 getActualStyle composes a complete font from the whole cascade', () => {
  const sheetOf = (): InstanceType<typeof GC.Spread.Sheets.Worksheet> => new Workbook().getSheet(0);

  it('fills the missing size and family from the sheet default, like the trial', () => {
    const sheet = sheetOf();
    const { Style: StyleClass } = GC.Spread.Sheets;
    sheet.setStyle(1, 1, new StyleClass({ font: '12pt' }));
    let actual = sheet.getActualStyle(1, 1);
    expect(actual.font).toBe('12pt Calibri');
    expect(actual.fontFamily).toBe('Calibri');
    expect(canvasFont(actual)).toMatch(/^\d+(?:\.\d+)?px Calibri$/);

    sheet.setStyle(1, 2, new StyleClass({ font: 'Georgia' }));
    actual = sheet.getActualStyle(1, 2);
    expect(actual.font).toBe('14.6667px Georgia');
    expect(actual.fontSize).toBe('14.6667px');

    sheet.setStyle(1, 3, new StyleClass({ font: 'bold' }));
    actual = sheet.getActualStyle(1, 3);
    expect(actual.font).toBe('bold 14.6667px Calibri');
    expect(actual.fontWeight).toBe('bold');
  });

  it('rebuilds the shorthand after each font command on a cell, row, column or named style', () => {
    const sheet = sheetOf();
    const { Style: StyleClass } = GC.Spread.Sheets;
    // cell with only a size (the user's repro: A3 default -> Increase Font Size -> Bold)
    sheet._setStyleProperty(2, 0, 'fontSize', '12pt');
    expect(sheet.getActualStyle(2, 0).font).toBe('12pt Calibri');
    sheet._setStyleProperty(2, 0, 'fontWeight', 'bold');
    expect(sheet.getActualStyle(2, 0).font).toBe('bold 12pt Calibri');
    expect(sheet.getStyle(2, 0)!.toJSON()).toMatchObject({ font: 'bold 12pt', fontWeight: 'bold', fontSize: '12pt' });
    sheet._setStyleProperty(2, 0, 'fontStyle', 'italic');
    expect(sheet.getActualStyle(2, 0).font).toBe('italic bold 12pt Calibri');
    sheet._setStyleProperty(2, 0, 'fontFamily', 'Arial Black');
    expect(sheet.getActualStyle(2, 0).font).toBe("italic bold 12pt 'Arial Black'");
    expect(canvasFont(sheet.getActualStyle(2, 0), 1.5)).toBe("italic bold 24px 'Arial Black'");

    // named style
    const named = new StyleClass({ name: 't90named', font: 'italic 14pt "Segoe UI"' });
    sheet.addNamedStyle(named);
    sheet.setStyleName(3, 0, 't90named');
    expect(sheet.getActualStyle(3, 0).font).toBe("italic 14pt 'Segoe UI'");
    sheet._setStyleProperty(3, 0, 'fontWeight', 'bold');
    expect(sheet.getActualStyle(3, 0).font).toBe("italic bold 14pt 'Segoe UI'");
    expect(canvasFont(sheet.getActualStyle(3, 0))).toBe("italic bold 18.6667px 'Segoe UI'");
    sheet.setStyleName(3, 0, '');
    sheet.setStyle(3, 0, null);

    // row style
    sheet.setStyle(-1, 4, new StyleClass({ font: '16pt Verdana' }));
    expect(sheet.getActualStyle(6, 4).font).toBe('16pt Verdana');
    sheet._setStyleProperty(6, 4, 'fontWeight', 'normal');
    expect(sheet.getActualStyle(6, 4).font).toBe('normal 16pt Verdana');
    sheet.setStyle(-1, 4, null);

    // column style
    sheet.setStyle(5, -1, new StyleClass({ font: 'bold 10pt Tahoma' }));
    expect(sheet.getActualStyle(5, 7).font).toBe('bold 10pt Tahoma');
    sheet._setStyleProperty(5, 7, 'fontSize', '12pt');
    expect(sheet.getActualStyle(5, 7).font).toBe('bold 12pt Tahoma');
    sheet.setStyle(5, -1, null);

    // area default style — round 4 re-measurement (`.probe/t90/themefont.mjs`, `themefont2.mjs`):
    // the trial's built-in default style carries `themeFont:'Body'`, and a level with a
    // themeFont resolves its family THROUGH the theme - `13pt Trebuchet MS` on the default
    // style resolves as `13pt Calibri` (size kept, family Calibri), and the ribbon command on
    // top of it reports `bold 13pt Calibri` (e2e mirror: task90-font-parity.spec.ts cascade case).
    const areaDefault = sheet.getDefaultStyle();
    areaDefault.font = '13pt Trebuchet MS';
    sheet.setDefaultStyle(areaDefault);
    expect(sheet.getActualStyle(8, 8).font).toBe('13pt Calibri');
    expect(sheet.getActualStyle(8, 8).fontFamily).toBe('Calibri');
    expect(sheet.getActualStyle(8, 8).themeFont).toBe('Body');
    sheet._setStyleProperty(8, 8, 'fontWeight', 'bold');
    expect(sheet.getActualStyle(8, 8).font).toBe('bold 13pt Calibri');
  });

  it('keeps the parts of every cell of a mixed-font range when a command runs over it', () => {    const sheet = sheetOf();
    const { Style: StyleClass } = GC.Spread.Sheets;
    sheet.setStyle(4, 0, new StyleClass({ font: '18pt Arial' }));
    sheet.setStyle(4, 1, new StyleClass({ font: 'bold 9pt Georgia' }));
    sheet.setStyle(4, 2, null);
    for (const col of [0, 1, 2]) sheet._setStyleProperty(4, col, 'fontSize', '20pt');
    expect([0, 1, 2].map((col) => sheet.getActualStyle(4, col).font)).toEqual(['20pt Arial', 'bold 20pt Georgia', '20pt Calibri']);
    for (const col of [0, 1, 2]) sheet._setStyleProperty(4, col, 'fontWeight', 'bold');
    expect([0, 1, 2].map((col) => sheet.getActualStyle(4, col).font)).toEqual(['bold 20pt Arial', 'bold 20pt Georgia', 'bold 20pt Calibri']);
  });

  it('resolves the family through a `themeFont` exactly like the trial (round 4 probe)', () => {
    // `.probe/t90/themefont.mjs`, `themefont2.mjs`, `themejson.mjs` measured on the trial:
    // the family comes from the most specific cascade level that carries a fontFamily or a
    // themeFont; a themeFont resolves THROUGH the theme (Body -> theme body font), unknown
    // tokens pass through verbatim, and an explicit family on a MORE specific level wins and
    // clears the themeFont from the result.
    const sheet = sheetOf();
    const { Style: StyleClass } = GC.Spread.Sheets;
    const read = () => { const a = sheet.getActualStyle(9, 9); return { font: a.font ?? null, family: a.fontFamily ?? null, theme: a.themeFont ?? null }; };

    sheet.addNamedStyle(new StyleClass({ name: 't90plain', fontFamily: 'Georgia', fontSize: '12pt' }));
    sheet.setStyleName(9, 9, 't90plain');
    expect(read(), 'named family, no themeFont').toMatchObject({ font: '12pt Georgia', family: 'Georgia', theme: null });

    sheet.setStyleName(9, 9, '');
    sheet.addNamedStyle(new StyleClass({ name: 't90body', fontFamily: 'Georgia', fontSize: '12pt', themeFont: 'Body' }));
    sheet.setStyleName(9, 9, 't90body');
    expect(read(), 'themeFont Body overrides the style\u0027s own family').toMatchObject({ font: '12pt Calibri', family: 'Calibri', theme: 'Body' });

    sheet.setStyleName(9, 9, '');
    sheet.addNamedStyle(new StyleClass({ name: 't90head', fontFamily: 'Georgia', fontSize: '12pt', themeFont: 'Heading' }));
    sheet.setStyleName(9, 9, 't90head');
    expect(read(), 'themeFont Heading passes the token through (trial: Heading)').toMatchObject({ font: '12pt Heading', family: 'Heading', theme: 'Heading' });
    sheet.setStyleName(9, 9, '');

    sheet.setStyle(9, 9, new StyleClass({ themeFont: 'Whatever', fontSize: '12pt' }));
    expect(read(), 'unknown themeFont token').toMatchObject({ font: '12pt Whatever', family: 'Whatever', theme: 'Whatever' });
    sheet.setStyle(9, 9, null);

    // a more specific explicit family wins and drops the lower level's themeFont
    sheet.setStyle(-1, 9, new StyleClass({ themeFont: 'Heading', fontSize: '10pt' }));
    sheet.setStyle(9, 9, new StyleClass({ fontFamily: 'Verdana' }));
    expect(read(), 'cell Verdana over row themeFont Heading').toMatchObject({ font: '10pt Verdana', family: 'Verdana', theme: null });
    sheet.setStyle(9, 9, null);
    sheet.setStyle(-1, 9, null);

    // the built-in default style carries themeFont Body: its own family member resolves as Calibri
    const d = sheet.getDefaultStyle();
    d.fontSize = '13pt';
    d.fontFamily = 'Trebuchet MS';
    sheet.setDefaultStyle(d);
    expect(read(), 'default style family resolves through theme Body').toMatchObject({ font: '13pt Calibri', family: 'Calibri', theme: 'Body' });
    expect(sheet.getActualStyle(9, 9).fontSize).toBe('13pt');
    const d2 = sheet.getDefaultStyle();
    d2.fontSize = undefined;
    d2.fontFamily = undefined;
    sheet.setDefaultStyle(d2);
  });
});

describe('TASK 90 zoom: the renderer font stays a valid scaled shorthand', () => {
  const hostOf = (width = 500, height = 320) => {
    document.body.innerHTML = '<div id="sheet"></div>';
    const host = document.getElementById('sheet')!;
    Object.defineProperties(host, { clientWidth: { configurable: true, value: width }, clientHeight: { configurable: true, value: height } });
    const workbook = new Workbook(host);
    return { workbook, sheet: workbook.getSheet(0), view: workbook._renderer()! };
  };
  it('scales every font by the sheet zoom and keeps family and weight', () => {
    const { sheet, view } = hostOf();
    const { Style: StyleClass } = GC.Spread.Sheets;
    sheet.setStyle(0, 0, new StyleClass({ font: 'bold 12pt Calibri' }));
    for (const zoom of [1, 1.25, 1.5, 2, 4]) {
      sheet.zoom(zoom);
      view.layout();
      expect(view.font(sheet.getActualStyle(0, 0)), `zoom ${zoom}`).toBe(`bold ${Number((16 * zoom).toFixed(4))}px Calibri`);
    }
    sheet.zoom(1);
    view.layout();
    // an unstyled cell keeps the sheet default, complete with family
    expect(view.font(sheet.getActualStyle(1, 1))).toBe('14.6667px Calibri');
  });
  it('never hands the renderer a fragment (the autofit and editor paths read the same value)', () => {
    const { sheet, view } = hostOf();
    const { Style: StyleClass } = GC.Spread.Sheets;
    for (const value of ['12pt', 'bold', 'Georgia', 'inherit', '12px/1.4 Arial']) {
      sheet.setStyle(2, 0, new StyleClass({ font: value }));
      sheet.zoom(1.5);
      view.layout();
      const font = view.font(sheet.getActualStyle(2, 0));
      expect(font, value).toMatch(/^(?:(?:italic|oblique|bold|bolder|lighter|normal|[1-9]00) )?\d+(?:\.\d+)?px \S/);
    }
  });
});
