/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it } from 'vitest';
import GC from '@mescius/spread-sheets';
import { applyFormatCells } from '../src/commands/actions.js';
import { Designer } from '../src/designer.js';

describe('Format Cells tabs (task 62)', () => {
  let sheet: any, d: any, workbook: any;
  beforeEach(() => {
    workbook = new GC.Spread.Sheets.Workbook();
    sheet = workbook.getActiveSheet();
    sheet.setActiveCell(1, 1);
    d = Object.assign(Object.create(Designer.prototype), { gc: GC, getWorkbook: () => workbook, invalidate: () => undefined });
  });

  it('writes padding, watermark and labelOptions in the trial format', () => {
    applyFormatCells(d, {
      paddingTop: 7, paddingRight: 6, paddingBottom: 4, paddingLeft: 5,
      labelText: 'LBL123', labelAlignment: 0, labelVisibility: 2,
      labelFontFamily: 'Calibri', labelFontSize: '11', labelBold: false, labelItalic: false, labelForeColor: '#808080',
      labelMarginTop: 2, labelMarginRight: 3, labelMarginBottom: 5, labelMarginLeft: 4,
    });
    const style = sheet.getStyle(1, 1);
    expect(style.cellPadding).toBe('7 6 4 5');
    expect(style.watermark).toBe('LBL123');
    expect(style.labelOptions).toEqual({ font: 'normal normal 11pt Calibri', foreColor: '#808080', alignment: 0, visibility: 2, margin: '2 3 5 4' });
  });

  it('serializes an untouched button like the trial', () => {
    applyFormatCells(d, {
      cellButtons: [{
        enabled: true, useButtonStyle: false, position: 1, width: 20, caption: '', buttonBackColor: '', hoverBackColor: '',
        imageType: 5, visibility: 0, command: 'none', imageSrc: '', captionAlign: 1, imageSize: { width: 16, height: 16 },
      }],
    });
    expect(sheet.getStyle(1, 1).cellButtons).toEqual([
      { imageType: 5, visibility: 0, position: 1, command: 'none', enabled: true, useButtonStyle: false },
    ]);
  });

  it('keeps changed button fields and drops the ones equal to defaults', () => {
    applyFormatCells(d, {
      cellButtons: [{
        enabled: true, useButtonStyle: true, position: 0, width: 30, caption: 'Go', buttonBackColor: '#ff0000', hoverBackColor: '',
        imageType: 5, visibility: 1, command: 'bold', imageSrc: '', captionAlign: 1, imageSize: { width: 20, height: 20 },
      }],
    });
    expect(sheet.getStyle(1, 1).cellButtons).toEqual([{
      imageType: 5, visibility: 1, position: 0, command: 'bold', enabled: true, useButtonStyle: true,
      width: 30, caption: 'Go', buttonBackColor: '#ff0000', imageSize: { width: 20, height: 20 },
    }]);
  });

  it('writes the corner fold shape the trial produces', () => {
    applyFormatCells(d, { decoration: { cornerFold: { position: 1, size: 0, color: '' } } });
    expect(sheet.getStyle(1, 1).decoration).toEqual({ cornerFold: { position: 1, size: 0, color: '' } });
    applyFormatCells(d, { decoration: {} });
    expect(sheet.getStyle(1, 1).decoration).toBeUndefined();
  });

  it('omits the mask placeholder when it equals the default', () => {
    applyFormatCells(d, { maskPattern: '(000) 000-0000', maskPlaceholder: '', maskExcludeLiteral: false, maskExcludePlaceholder: false });
    expect(sheet.getStyle(1, 1).mask).toEqual({ pattern: '(000) 000-0000', excludeLiteral: false, excludePlaceholder: false });
    applyFormatCells(d, { maskPattern: '000', maskPlaceholder: '-', maskExcludeLiteral: true, maskExcludePlaceholder: true });
    expect(sheet.getStyle(1, 1).mask).toEqual({ pattern: '000', placeholder: '-', excludeLiteral: true, excludePlaceholder: true });
  });

  it('prefills the dialog from an existing style', () => {
    const style = new GC.Spread.Sheets.Style();
    Object.assign(style, { cellPadding: '3 4 5 6', watermark: 'tag', labelOptions: { font: 'italic bold 9pt Arial', foreColor: '#ff0000', alignment: 4, visibility: 0, margin: '1 2 3 4' } });
    sheet.setStyle(1, 1, style);
    let submitted: any;
    d.showDialog = (_name: string, data: any, callback: any) => { submitted = callback; d.dialog = { data }; };
    Designer.prototype.showFormatCells.call(d);
    const data = (d.dialog as any).data;
    expect(data.paddingTop).toBe(3);
    expect(data.paddingLeft).toBe(6);
    expect(data.labelText).toBe('tag');
    expect(data.labelAlignment).toBe(4);
    expect(data.labelVisibility).toBe(0);
    expect(data.labelFontFamily).toBe('Arial');
    expect(data.labelFontSize).toBe('9');
    expect(data.labelBold).toBe(true);
    expect(data.labelItalic).toBe(true);
    expect(data.labelForeColor).toBe('#ff0000');
    expect(data.labelMarginTop).toBe(1);
    expect(data.labelMarginLeft).toBe(4);
    // Submitting without changes must not touch the style.
    submitted(d.dialog.data);
    expect(sheet.getStyle(1, 1).cellPadding).toBe('3 4 5 6');
  });

  // Task 35: Alignment tab, verified black-box against the trial on 2026-11-15.
  it('writes the alignment style properties like the trial', () => {
    applyFormatCells(d, { orientation: 45 });
    let style = sheet.getStyle(1, 1);
    expect(style.textOrientation).toBe(45);
    expect(style.isVerticalText).toBe(false); // the trial writes the pair together
    expect(style.textIndent ?? null).toBe(null);
    applyFormatCells(d, { orientation: -30 });
    expect(sheet.getStyle(1, 1).textOrientation).toBe(-30);
    // Vertical text carries the (reset) angle too.
    applyFormatCells(d, { orientation: 0, verticalText: true });
    style = sheet.getStyle(1, 1);
    expect(style.isVerticalText).toBe(true);
    expect(style.textOrientation).toBe(0);
    // The Indent spinner commits the Orientation pair as well (trial behaviour).
    applyFormatCells(d, { indent: 2 });
    style = sheet.getStyle(1, 1);
    expect(style.textIndent).toBe(2);
    expect(style.textOrientation).toBe(0);
    expect(style.isVerticalText).toBe(false);
    applyFormatCells(d, { showEllipsis: true });
    expect(sheet.getStyle(1, 1).showEllipsis).toBe(true);
    applyFormatCells(d, { textDirection: 2 });
    expect(sheet.getStyle(1, 1).textDirection).toBe(2);
    applyFormatCells(d, { wrapText: true, shrinkToFit: true });
    style = sheet.getStyle(1, 1);
    expect(style.wordWrap).toBe(true);
    expect(style.shrinkToFit).toBe(true);
  });

  it('prefills the alignment fields from an existing style', () => {
    const style = new GC.Spread.Sheets.Style();
    Object.assign(style, { textOrientation: 33, isVerticalText: true, showEllipsis: true, textIndent: 2, textDirection: 1, wordWrap: true });
    sheet.setStyle(1, 1, style);
    d.showDialog = (_name: string, data: any, _callback: any) => { d.dialog = { data }; };
    Designer.prototype.showFormatCells.call(d);
    const data = (d.dialog as any).data;
    expect(data.orientation).toBe(33);
    expect(data.verticalText).toBe(true);
    expect(data.showEllipsis).toBe(true);
    expect(data.indent).toBe(2);
    expect(data.textDirection).toBe(1);
    expect(data.wrapText).toBe(true);
  });
});

describe('Format Cells Number/Font/Border/Fill/Protection tabs (task 43)', () => {
  let sheet: any, d: any, workbook: any;
  beforeEach(() => {
    workbook = new GC.Spread.Sheets.Workbook();
    sheet = workbook.getActiveSheet();
    sheet.setActiveCell(1, 1);
    sheet.setSelection(1, 1, 1, 1);
    d = Object.assign(Object.create(Designer.prototype), { gc: GC, getWorkbook: () => workbook, invalidate: () => undefined });
  });

  it('writes the trial formatter for each Number category', () => {
    const cases: [Record<string, unknown>, string | undefined][] = [
      [{ category: 'General' }, undefined],
      [{ category: 'Number', decimals: 2, separator: false }, '0.00'],
      [{ category: 'Number', decimals: 0, separator: true, negative: 1 }, '#,##0;[Red]-#,##0'],
      [{ category: 'Currency', decimals: 2 }, '[$$-409]#,##0.00'],
      [{ category: 'Currency', decimals: 2, symbol: 0, negative: 3 }, '#,##0.00;[Red](#,##0.00)'],
      [{ category: 'Accounting', decimals: 2, symbol: 1 }, '_([$$-409]* #,##0.00_);_([$$-409]* (#,##0.00);_([$$-409]* "-"??_);_(@_)'],
      [{ category: 'Date', type: 0 }, 'm/d/yyyy'],
      [{ category: 'Date', type: 4 }, 'mm/dd/yy'],
      [{ category: 'Time', type: 1 }, '[$-409]hh:mm'],
      [{ category: 'Percentage', decimals: 2 }, '0.00%'],
      [{ category: 'Fraction', type: 0 }, '# ?/?'],
      [{ category: 'Scientific', decimals: 2 }, '0.00E+00'],
      [{ category: 'Text' }, '@'],
      [{ category: 'Special', type: 0 }, '00000'],
      [{ category: 'Custom', formatCode: '#,##0' }, '#,##0'],
    ];
    for (const [data, expected] of cases) {
      sheet.setStyle(1, 1, new GC.Spread.Sheets.Style());
      applyFormatCells(d, { category: 'General', ...data });
      expect(sheet.getActualStyle(1, 1).formatter, JSON.stringify(data)).toBe(expected);
    }
  });

  it('writes font longhand, foreColor and combined textDecoration like the trial', () => {
    applyFormatCells(d, { font: { family: 'Georgia', style: 'Bold', size: '16', underline: 1, strike: true, color: 'Accent 1' } });
    let style = sheet.getActualStyle(1, 1);
    expect([style.fontFamily, style.fontWeight, style.fontStyle, style.fontSize, style.foreColor, style.textDecoration])
      .toEqual(['Georgia', 'bold', 'normal', '16pt', 'Accent 1', 3]);
    applyFormatCells(d, { font: { family: 'Calibri', style: 'Italic', size: '11', underline: 2, strike: false, color: '#FF0000' } });
    style = sheet.getActualStyle(1, 1);
    expect([style.fontWeight, style.fontStyle, style.textDecoration]).toEqual(['normal', 'italic', 8]);
    applyFormatCells(d, { font: { family: 'Calibri', style: 'Normal', size: '11', underline: 4, strike: false, color: '#000000' } });
    expect(sheet.getActualStyle(1, 1).textDecoration).toBe(32);
  });

  it('writes border presets per cell exactly like the trial probe', () => {
    const edge = { style: 1, color: '#000' };
    // Outline on one cell: all four sides.
    applyFormatCells(d, { border: { edges: { top: edge, bottom: edge, left: edge, right: edge }, style: 1, color: '#000', radiusMode: 'outer', corners: [0, 0, 0, 0], linked: true } });
    let s = sheet.getActualStyle(1, 1);
    expect([s.borderTop.style, s.borderBottom.style, s.borderLeft.style, s.borderRight.style, s.borderHorizontal, s.borderVertical]).toEqual([1, 1, 1, 1, undefined, undefined]);
    // None writes empty (style 0) line borders on the outer and diagonal slots (trial behavior).
    applyFormatCells(d, { border: { edges: { top: null, bottom: null, left: null, right: null, diagonalUp: null, diagonalDown: null }, style: 1, color: '#000', radiusMode: 'outer', corners: [0, 0, 0, 0], linked: true } });
    s = sheet.getActualStyle(1, 1);
    expect(s.borderTop.style).toBe(0);
    expect(s.diagonalUp.style).toBe(0);
    // Inside over a 2x2 selection: each cell gets its two inner edges (probe .probe/t43/official-writes.json).
    sheet.setSelection(1, 1, 2, 2);
    applyFormatCells(d, { border: { edges: { hInside: edge, vInside: edge }, style: 1, color: '#000', radiusMode: 'outer', corners: [0, 0, 0, 0], linked: true } });
    const has = (r: number, c: number) => { const st = sheet.getActualStyle(r, c); return ['borderTop', 'borderBottom', 'borderLeft', 'borderRight'].filter((p) => st[p]).join(','); };
    expect(has(1, 1)).toBe('borderBottom,borderRight');
    expect(has(1, 2)).toBe('borderBottom,borderLeft');
    expect(has(2, 1)).toBe('borderTop,borderRight');
    expect(has(2, 2)).toBe('borderTop,borderLeft');
    // Diagonal buttons write diagonalUp/diagonalDown on every cell.
    sheet.setSelection(1, 1, 1, 1);
    applyFormatCells(d, { border: { edges: { diagonalUp: edge }, style: 1, color: '#000', radiusMode: 'outer', corners: [0, 0, 0, 0], linked: true } });
    expect(sheet.getActualStyle(1, 1).diagonalUp.style).toBe(1);
  });

  it('writes fill background tokens and IPatternFill like the trial', () => {
    applyFormatCells(d, { fill: { bg: 'Accent 1' } });
    expect(sheet.getActualStyle(1, 1).backColor).toBe('Accent 1');
    applyFormatCells(d, { fill: { bg: '#FF0000' } });
    expect(sheet.getActualStyle(1, 1).backColor).toBe('#FF0000');
    applyFormatCells(d, { fill: { bg: null } });
    expect(sheet.getActualStyle(1, 1).backColor).toBeUndefined();
    applyFormatCells(d, { fill: { bg: undefined, patternColor: '', patternType: 4 } });
    expect(sheet.getActualStyle(1, 1).backColor).toEqual({ type: 4, patternColor: '', backgroundColor: '' });
    applyFormatCells(d, { fill: { bg: 'Accent 2', patternColor: '', patternType: 3 } });
    expect(sheet.getActualStyle(1, 1).backColor).toEqual({ type: 3, patternColor: '', backgroundColor: '#ed7d31' });
    applyFormatCells(d, { fill: { bg: 'Background 1', patternColor: 'Accent 2', patternType: 3 } });
    expect(sheet.getActualStyle(1, 1).backColor).toEqual({ type: 3, patternColor: 'Accent 2', backgroundColor: '#ffffff' });
  });

  it('writes locked/hidden and ignores the dialog-only Allow Edit flag', () => {
    applyFormatCells(d, { locked: false, hidden: true, allowEdit: false });
    const style = sheet.getActualStyle(1, 1);
    expect([style.locked, style.hidden]).toEqual([false, true]);
    expect((style as any).allowEdit).toBeUndefined();
  });

  it('prefills font/border/fill/protection fields from an existing style', () => {
    const style = new GC.Spread.Sheets.Style();
    Object.assign(style, {
      fontFamily: 'Georgia', fontWeight: 'bold', fontStyle: 'italic', fontSize: '14pt', foreColor: '#FF0000', textDecoration: 11,
      formatter: '0.00%', borderTop: new GC.Spread.Sheets.LineBorder('#000', 2), locked: false, hidden: true,
      backColor: { type: 3, patternColor: 'Accent 2', backgroundColor: 'Background 1' },
    });
    sheet.setStyle(1, 1, style);
    d.showDialog = (_name: string, data: any, _callback: any) => { d.dialog = { data }; };
    Designer.prototype.showFormatCells.call(d);
    const data = (d.dialog as any).data;
    expect([data.fontFamily, data.fontStyle, data.fontSize, data.color, data.underlineIndex, data.strikethrough]).toEqual(['Georgia', 'Bold Italic', '14', '#FF0000', 2, true]);
    expect([data.category, data.decimals]).toEqual(['Percentage', 2]);
    expect(data.locked).toBe(false);
    expect(data.hidden).toBe(true);
    expect(data.border.edges.top).toEqual({ style: 2, color: '#000' });
    expect(data.border.style).toBe(2);
    expect(data.fill ?? data.backColor).toMatchObject({ type: 3 });
  });
});
