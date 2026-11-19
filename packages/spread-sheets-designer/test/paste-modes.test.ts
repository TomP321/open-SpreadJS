/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Task 61 item 4/5: the six Paste Options buttons and the Paste Special dialog
 * modes. The expected effects were measured on the trial through the paired
 * Playwright spec (apps/designer-compare/test/context-entries.spec.ts).
 */
import { describe, expect, it } from 'vitest';
import GC from '@mescius/spread-sheets';
import { pasteClipboard, type PasteOptions } from '../src/commands/actions.js';

/** A sheet with a formula cell, a styled cell and a comment; the clipboard points at A1:C1. */
function setup(): { designer: any; sheet: any } {
  const workbook = new GC.Spread.Sheets.Workbook();
  const sheet = workbook.getActiveSheet();
  sheet.setValue(0, 0, 3);
  sheet.setValue(0, 1, 4);
  sheet.setFormula(0, 2, '=A1+B1');
  const style = new GC.Spread.Sheets.Style();
  style.fontWeight = 'bold';
  style.backColor = '#ffff00';
  style.formatter = '0.00';
  style.borderLeft = new GC.Spread.Sheets.LineBorder('#000000', 1);
  sheet.setStyle(0, 0, style);
  sheet.setStyle(0, 1, style);
  sheet.setStyle(0, 2, style);
  sheet.comments.add(0, 1, 'note');
  const plain = new GC.Spread.Sheets.Style();
  plain.fontWeight = 'normal';
  plain.backColor = '#00ff00';
  plain.formatter = '0';
  for (let col = 4; col < 10; col++) sheet.setStyle(0, col, plain);
  (sheet as any)._clipboardSource = () => ({ sheetName: sheet.name(), row: 0, col: 0, rowCount: 1, colCount: 3 });
  (sheet as any)._clipboardMode = () => 'copy';
  const designer = { gc: GC, getWorkbook: () => workbook, spreadsheet: workbook, invalidate: () => undefined };
  return { designer, sheet };
}

const at = (sheet: any, col: number) => ({
  value: sheet.getValue(0, col),
  formula: sheet.getFormula(0, col),
  weight: sheet.getActualStyle(0, col)?.fontWeight ?? null,
  back: sheet.getActualStyle(0, col)?.backColor ?? null,
  formatter: sheet.getActualStyle(0, col)?.formatter ?? null,
  border: sheet.getActualStyle(0, col)?.borderLeft ? 'line' : 'none',
});

const select = (sheet: any, col: number): void => { sheet.setSelection(0, col, 1, 1); sheet.setActiveCell(0, col); };

describe('context-menu paste modes', () => {
  it('pasteAll copies values, formulas and formatting', () => {
    const { designer, sheet } = setup();
    select(sheet, 4);
    pasteClipboard(designer, 'all');
    expect(at(sheet, 4)).toMatchObject({ value: 3, weight: 'bold', back: '#ffff00', formatter: '0.00' });
    expect(at(sheet, 5).value).toBe(4);
    expect(at(sheet, 6).formula).toBe('A1+B1');
  });

  it('pasteFormula skips cells without a formula, like the trial', () => {
    const { designer, sheet } = setup();
    select(sheet, 4);
    pasteClipboard(designer, 'formulas');
    expect(at(sheet, 4).value).toBeNull();
    expect(at(sheet, 4).back).toBe('#00ff00');
    expect(at(sheet, 6).formula).toBe('A1+B1');
  });

  it('pasteValues drops the formula and keeps the computed value', () => {
    const { designer, sheet } = setup();
    select(sheet, 4);
    pasteClipboard(designer, 'values');
    expect(at(sheet, 6)).toMatchObject({ value: 7, formula: null, back: '#00ff00' });
  });

  it('pasteFormatting writes only the style', () => {
    const { designer, sheet } = setup();
    select(sheet, 4);
    pasteClipboard(designer, 'formatting');
    expect(at(sheet, 4)).toMatchObject({ value: null, formula: null, weight: 'bold', back: '#ffff00' });
  });

  it('values+formatting writes both, like the trial', () => {
    const { designer, sheet } = setup();
    select(sheet, 4);
    pasteClipboard(designer, 'values-format');
    expect(at(sheet, 4)).toMatchObject({ value: 3, weight: 'bold', formatter: '0.00' });
  });

  it('formulas+formatting pastes formulas and formatting only', () => {
    const { designer, sheet } = setup();
    select(sheet, 4);
    pasteClipboard(designer, 'formulas-format');
    expect(at(sheet, 4).value).toBeNull();
    expect(at(sheet, 6)).toMatchObject({ formula: 'A1+B1', weight: 'bold' });
  });

  it('number-format modes keep the rest of the target style', () => {
    const { designer, sheet } = setup();
    select(sheet, 4);
    pasteClipboard(designer, 'values-numberformat');
    expect(at(sheet, 4)).toMatchObject({ value: 3, weight: 'normal', back: '#00ff00', formatter: '0.00' });
  });

  it('all-except-borders leaves the target border untouched', () => {
    const { designer, sheet } = setup();
    const targetBorder = new GC.Spread.Sheets.LineBorder('#ff0000', 2);
    const withBorder = sheet.getStyle(0, 4) as any;
    withBorder.borderLeft = targetBorder;
    sheet.setStyle(0, 4, withBorder);
    select(sheet, 4);
    pasteClipboard(designer, 'no-borders');
    const after = sheet.getActualStyle(0, 4) as any;
    expect(after.fontWeight).toBe('bold');
    expect(after.borderLeft.style).toBe(2);
  });

  it('column widths copies the source widths', () => {
    const { designer, sheet } = setup();
    sheet.setColumnWidth(0, 123);
    select(sheet, 4);
    pasteClipboard(designer, 'column-widths');
    expect(sheet.getColumnWidth(4)).toBe(123);
    expect(sheet.getValue(0, 4)).toBeNull();
  });

  it('comments copies the note only', () => {
    const { designer, sheet } = setup();
    select(sheet, 4);
    pasteClipboard(designer, 'comments');
    expect(sheet.comments.get(0, 5)?.text()).toBe('note');
    expect(sheet.getValue(0, 4)).toBeNull();
  });

  it('operations combine the source value with the target value', () => {
    const options: PasteOptions = { operation: 'add' };
    const { designer, sheet } = setup();
    sheet.setValue(0, 4, 10);
    select(sheet, 4);
    pasteClipboard(designer, 'values', options);
    expect(sheet.getValue(0, 4)).toBe(13);
  });

  it('skip blanks leaves empty source cells alone', () => {
    const { designer, sheet } = setup();
    sheet.setValue(0, 1, null);
    sheet.setValue(0, 5, 'keep me');
    select(sheet, 4);
    pasteClipboard(designer, 'values', { skipBlanks: true } as PasteOptions);
    expect(sheet.getValue(0, 4)).toBe(3);
    expect(sheet.getValue(0, 5)).toBe('keep me');
  });

  it('transpose swaps rows and columns', () => {
    const { designer, sheet } = setup();
    select(sheet, 4);
    pasteClipboard(designer, 'all', { transpose: true } as PasteOptions);
    expect(sheet.getValue(0, 4)).toBe(3);
    expect(sheet.getValue(1, 4)).toBe(4);
    expect(sheet.getValue(2, 4)).not.toBeNull();
  });
});
