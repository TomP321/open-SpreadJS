// @vitest-environment jsdom
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { expect, it, vi } from 'vitest';
import { SpreadSheets, Worksheet, Column } from '../src/index.js';
import GC from '@mescius/spread-sheets';
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
it('creates a workbook, configures children, calls the initializer, and destroys on unmount', () => {
  const host = document.createElement('div');
  const root = createRoot(host);
  let workbook: GC.Spread.Sheets.Workbook | undefined;
  const initialized = vi.fn((value: GC.Spread.Sheets.Workbook) => { workbook = value; value.getSheet(1).setValue(0, 0, 'ready'); });
  act(() => root.render(<SpreadSheets workbookInitialized={initialized} hostClass="sheet" className="extra" hostStyle={{ height: 300 }}><Worksheet name="First" /><Worksheet name="Second" /></SpreadSheets>));
  expect(initialized).toHaveBeenCalledTimes(1);
  expect(workbook!.sheets.map(sheet => sheet.name())).toEqual(['First', 'Second']);
  expect(workbook!.getSheet(1).getValue(0, 0)).toBe('ready');
  expect(host.firstElementChild?.classList.contains('sheet')).toBe(true);
  expect((host.firstElementChild as HTMLElement).style.height).toBe('300px');
  act(() => root.unmount());
  expect(workbook!.sheets).toEqual([]);
});
it('uses one default sheet and has declarative marker components', () => {
  const host = document.createElement('div');
  const root = createRoot(host);
  let workbook: GC.Spread.Sheets.Workbook | undefined;
  act(() => root.render(<SpreadSheets workbookInitialized={value => { workbook = value; }} />));
  expect(workbook!.sheets).toHaveLength(1);
  act(() => root.unmount());
  expect(new Worksheet({}).render()).toBeNull();
  expect(new Column({}).render()).toBeNull();
});

it('fills its parent with the host element, the way the official wrapper does, unless hostStyle overrides it', () => {
  const host = document.createElement('div');
  const root = createRoot(host);
  act(() => root.render(<SpreadSheets><Worksheet name="Fill" /></SpreadSheets>));
  const element = host.firstElementChild as HTMLElement;
  expect(element.style.width).toBe('100%');
  expect(element.style.height).toBe('100%');
  expect(element.style.overflow).toBe('visible');
  act(() => root.render(<SpreadSheets hostStyle={{ width: 480, height: 240 }}><Worksheet name="Fill" /></SpreadSheets>));
  expect((host.firstElementChild as HTMLElement).style.width).toBe('480px');
  expect((host.firstElementChild as HTMLElement).style.height).toBe('240px');
  act(() => root.unmount());
});

it('keeps the workbook across equivalent parent renders and updates host styles', () => {
  const host = document.createElement('div');
  const root = createRoot(host);
  const initialized = vi.fn();
  act(() => root.render(<SpreadSheets workbookInitialized={initialized}><Worksheet name="Stable" /></SpreadSheets>));
  act(() => root.render(<SpreadSheets workbookInitialized={initialized} className="updated" hostStyle={{ height: 400 }}><Worksheet name="Stable" /></SpreadSheets>));
  expect(initialized).toHaveBeenCalledTimes(1);
  expect(host.firstElementChild?.classList.contains('opensheets-host')).toBe(true);
  expect(host.firstElementChild?.classList.contains('updated')).toBe(true);
  expect((host.firstElementChild as HTMLElement).style.height).toBe('400px');
  act(() => root.unmount());
});
it('updates workbook options, events, worksheets and columns without replacing the workbook', () => {
  const host = document.createElement('div'), root = createRoot(host);
  let workbook: GC.Spread.Sheets.Workbook | undefined;
  const first = vi.fn(), second = vi.fn();
  const initialized = (value: GC.Spread.Sheets.Workbook) => { workbook = value; };
  act(() => root.render(<SpreadSheets allowUndo={false} valueChanged={first} workbookInitialized={initialized}><Worksheet name="Before" rowCount={100}><Column width={100} headerText="Label" /></Worksheet></SpreadSheets>));
  const original = workbook;
  expect(workbook!.options.allowUndo).toBe(false);
  expect(workbook!.getSheet(0).getRowCount()).toBe(100);
  expect(workbook!.getSheet(0).getColumnWidth(0)).toBe(100);
  act(() => root.render(<SpreadSheets allowUndo valueChanged={second} workbookInitialized={initialized}><Worksheet name="After" rowCount={200}><Column width={120} headerText="Updated" /></Worksheet><Worksheet name="Added" /></SpreadSheets>));
  expect(workbook).toBe(original);
  expect(workbook!.getSheet(0).getColumnWidth(0)).toBe(120);
  expect(workbook!.getSheet(0).name()).toBe('After');
  expect(workbook!.getSheet(0).getValue(0, 0, GC.Spread.Sheets.SheetArea.colHeader)).toBe('Updated');
  expect(workbook!.getSheetCount()).toBe(2);
  workbook!.commandManager().execute({ cmd: 'editCell', row: 0, col: 0, newValue: 5 });
  expect(first).not.toHaveBeenCalled(); expect(second).toHaveBeenCalledTimes(1);
  act(() => root.unmount());
});
it('applies declarative binding fields and source data', () => {
  const host = document.createElement('div'), root = createRoot(host);
  let workbook: GC.Spread.Sheets.Workbook | undefined;
  act(() => root.render(<SpreadSheets workbookInitialized={value => { workbook = value; }}><Worksheet dataSource={[{ title: 'One', amount: 3 }]}><Column dataField="title" headerText="Title" width={120} /><Column dataField="amount" formatter="0.00" /></Worksheet></SpreadSheets>));
  expect(workbook!.getSheet(0).getValue(0, 0)).toBe('One');
  expect(workbook!.getSheet(0).getText(0, 1)).toBe('3.00');
  act(() => root.unmount());
});
it('releases the workbook if initialization fails', () => {
  const host = document.createElement('div');
  const root = createRoot(host);
  let workbook: GC.Spread.Sheets.Workbook | undefined;
  const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    expect(() => act(() => root.render(<SpreadSheets workbookInitialized={value => { workbook = value; throw new Error('initializer failed'); }} />))).toThrow('initializer failed');
    expect(workbook!.sheets).toEqual([]);
  } finally { act(() => root.unmount()); errorLog.mockRestore(); }
});

it('preserves keyed sheet data through reorder and restores removed option props', () => {
  const host = document.createElement('div'), root = createRoot(host);
  let workbook: GC.Spread.Sheets.Workbook | undefined;
  const initialize = (value: GC.Spread.Sheets.Workbook) => { workbook = value; };
  act(() => root.render(<SpreadSheets allowUndo={false} workbookInitialized={initialize}><Worksheet key="a" name="Alpha"><Column width={100} /></Worksheet><Worksheet key="b" name="Beta" /></SpreadSheets>));
  workbook!.getSheet(0).setValue(0, 0, 'A'); workbook!.getSheet(1).setValue(0, 0, 'B');
  act(() => root.render(<SpreadSheets workbookInitialized={initialize}><Worksheet key="b" name="Beta" /><Worksheet key="a" name="Alpha"><Column /></Worksheet></SpreadSheets>));
  expect(workbook!.sheets.map(sheet => sheet.getValue(0, 0))).toEqual(['B', 'A']);
  expect(workbook!.options.allowUndo).toBe(true);
  expect(workbook!.getSheet(1).getColumnWidth(0)).toBe(62);
  act(() => root.unmount());
});
