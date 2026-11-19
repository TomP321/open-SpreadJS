// @vitest-environment jsdom
/* Name box: shows the active cell reference, and the shape name while a shape
 * is selected (the official shows "S1" after clicking a shape). */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import GC from '@mescius/spread-sheets';
import { DesignerContext } from '../src/store.js';
import { FormulaBar } from '../src/app.js';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', { value: () => null, configurable: true });

const Shapes = GC.Spread.Sheets.Shapes;

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

describe('name box', () => {
  let workbook: GC.Spread.Sheets.Workbook;
  let designer: ReturnType<typeof makeDesigner>;
  let host: HTMLElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
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

  const nameBox = (): HTMLInputElement => host.querySelector<HTMLInputElement>('.gc-name-box-selector')!;

  it('shows the active cell reference and switches to the shape name on selection', () => {
    const sheet = workbook.getActiveSheet();
    act(() => { sheet.setActiveCell(1, 1); designer.invalidate(); }); // B2
    expect(nameBox().value).toBe('B2');
    const shape = sheet.shapes.add('S1', Shapes.AutoShapeType.rectangle, 100, 100, 80, 40);
    act(() => { shape.isSelected(true); designer.invalidate(); });
    expect(nameBox().value).toBe('S1');
    act(() => { shape.isSelected(false); designer.invalidate(); });
    expect(nameBox().value).toBe('B2');
  });

  it('summarises multi-selection like the trial', () => {
    const sheet = workbook.getActiveSheet();
    const a = sheet.shapes.add('A1-shape', Shapes.AutoShapeType.rectangle, 10, 10, 30, 30);
    const b = sheet.shapes.add('B1-shape', Shapes.AutoShapeType.rectangle, 50, 50, 30, 30);
    act(() => { a.isSelected(true); b.isSelected(true); designer.invalidate(); });
    expect(nameBox().value).toBe('2 Shapes');
  });
});
