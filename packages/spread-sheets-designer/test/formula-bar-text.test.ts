// @vitest-environment jsdom
/* TASK 91: the formula bar shows a selected formula cell as the trial does — with the leading
 * `=` (array formulas with the `{=...}` braces) and the references coloured like the cell editor
 * colours them, while plain cells show their General text (`TRUE` for booleans, culture
 * separators for numbers, `{=...}` painted plain). */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import GC from '@mescius/spread-sheets';
import { DesignerContext } from '../src/store.js';
import { FormulaBar } from '../src/app.js';
import { installFormulaCommit, commitFormula } from '../src/designer-undo.js';
import { extendView, type SheetInternals } from '../src/core-internals.js';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', { value: () => null, configurable: true });

function makeDesigner(workbook: GC.Spread.Sheets.Workbook) {
  let version = 0;
  const listeners = new Set<() => void>();
  return {
    getWorkbook: () => workbook,
    subscribe: (cb: () => void) => { listeners.add(cb); return (): void => { listeners.delete(cb); }; },
    getVersion: () => version,
    invalidate: () => { version++; for (const cb of listeners) cb(); },
    commitReference: () => undefined,
    commitFormula: () => undefined,
    showMessageBox: () => undefined,
    _formulaInsertion: null,
  };
}

describe('formula bar text (TASK 91)', () => {
  let workbook: GC.Spread.Sheets.Workbook;
  let designer: ReturnType<typeof makeDesigner>;
  let host: HTMLElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    GC.Spread.Common.CultureManager.culture('en-us');
    workbook = new GC.Spread.Sheets.Workbook();
    workbook.setSheetCount(1);
    designer = makeDesigner(workbook);
    host = document.createElement('div');
    root = createRoot(host);
    act(() => root.render(React.createElement(DesignerContext.Provider, { value: designer as never }, React.createElement(FormulaBar))));
  });

  afterEach(() => {
    act(() => root.unmount());
    workbook.destroy?.();
  });

  const input = (): HTMLInputElement => host.querySelector<HTMLInputElement>('.gc-designer-formula-input')!;
  const layer = (): HTMLElement | null => host.querySelector('.gc-designer-formula-color-layer');
  const select = (row: number, col: number): void => {
    act(() => { workbook.getActiveSheet().setActiveCell(row, col); designer.invalidate(); });
  };

  it('shows a formula cell with the `=` prefix and coloured references', () => {
    const sheet = workbook.getActiveSheet();
    sheet.setValue(1, 1, 4);
    sheet.setValue(2, 1, 250);
    sheet.setFormula(3, 3, 'B3/B2-1');
    select(3, 3);
    expect(input().value).toBe('=B3/B2-1');
    const spans = [...layer()!.querySelectorAll('span')];
    expect(spans.map((s) => s.textContent)).toEqual(['=', 'B3', '/', 'B2', '-1']);
    expect(spans[1].style.color).toBe('rgb(0, 0, 255)'); // first reference blue...
    expect(spans[3].style.color).toBe('rgb(0, 128, 0)'); // ...second green, like the trial bar
    expect(getComputedStyle(layer()!).visibility).toBe('visible');
  });

  it('shows array formulas with the braces, painted plain (trial: one uncoloured span)', () => {
    const sheet = workbook.getActiveSheet();
    sheet.setArrayFormula(2, 1, 2, 1, 'SUM(A1:A2)');
    select(2, 1);
    expect(input().value).toBe('{=SUM(A1:A2)}');
    expect(getComputedStyle(layer()!).visibility).toBe('hidden');
  });

  it('shows plain values as their General text — TRUE, strings, numbers (and no false `=`)', () => {
    const sheet = workbook.getActiveSheet();
    sheet.setValue(0, 0, true);
    sheet.setValue(1, 0, 'hello');
    sheet.setValue(2, 0, 396.5);
    sheet.setFormatter(2, 0, new GC.Spread.Formatter.GeneralFormatter('#,##0.00') as never);
    select(0, 0);
    expect(input().value).toBe('TRUE');
    select(1, 0);
    expect(input().value).toBe('hello');
    // The trial bar shows the RAW value of a formatted cell (measured: `250`, not `250.00`).
    select(2, 0);
    expect(input().value).toBe('396.5');
    select(9, 9);
    expect(input().value).toBe('');
  });

  it('uses the current culture separators for the bar text (supervisor 2b)', () => {
    GC.Spread.Common.CultureManager.culture('it-it');
    const sheet = workbook.getActiveSheet();
    sheet.setValue(1, 0, 396.5);
    select(1, 0);
    expect(input().value).toBe('396,5');
  });

  it('commits `{=...}` bar text back as an array formula through the undo bridge (TASK 91)', () => {
    const sheet = workbook.getActiveSheet();
    const d = designer as ReturnType<typeof makeDesigner> & { _undoSheets: Map<number, unknown>; _undoSheetIds: Map<unknown, number> };
    d._undoSheets = new Map();
    d._undoSheetIds = new Map();
    d.showMessageBox = ((message: string): undefined => { throw new Error(`commit failed: ${message}`); }) as never;
    installFormulaCommit(d as never);
    act(() => { sheet.setArrayFormula(1, 1, 1, 2, 'SUM(A1:A2)'); sheet.setActiveCell(1, 1); designer.invalidate(); });
    expect(input().value).toBe('{=SUM(A1:A2)}');
    commitFormula(d as never, '{=SUM(A1:A2)+1}');
    expect(sheet.getFormula(1, 1)).toBe('SUM(A1:A2)+1');
    expect(extendView<SheetInternals, object>(sheet)._arrayFormula(1, 1)).toEqual({ rowCount: 1, colCount: 2 });
  });
});
