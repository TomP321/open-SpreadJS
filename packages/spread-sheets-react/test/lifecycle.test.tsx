// @vitest-environment jsdom
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { expect, it, vi } from 'vitest';
import { SpreadSheets, Worksheet, Column } from '../src/index.js';
import type GC from '@opensheets/spread-sheets';
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
it('reports unsupported props and configuration updates explicitly', () => {
  expect(() => new SpreadSheets({ allowUndo: true }).componentDidMount()).toThrow('NotImplemented: SpreadSheets.allowUndo');
  expect(() => new SpreadSheets({ children: <Worksheet rowCount={100} /> }).componentDidMount()).toThrow('NotImplemented: Worksheet.rowCount');
  expect(() => new SpreadSheets({ children: <Worksheet><Column width={100} /></Worksheet> }).componentDidMount()).toThrow('NotImplemented: Worksheet.children');
  expect(() => new SpreadSheets({ children: <Worksheet name="After" /> }).componentDidUpdate({ children: <Worksheet name="Before" /> })).toThrow('NotImplemented: SpreadSheets.update.children');
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
