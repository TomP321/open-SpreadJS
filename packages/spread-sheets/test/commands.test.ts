import { describe, expect, it, vi } from 'vitest';
import GC from '../src/index.js';
import type { CommandOptions } from '../src/commands.js';
const { Workbook } = GC.Spread.Sheets;
describe('commands and undo', () => {
  it('registers and executes custom undoable commands with the workbook context', () => {
    const wb = new Workbook(),
      s = wb.getSheet(0),
      cm = wb.commandManager(),
      um = wb.undoManager();
    const execute = vi.fn((context: unknown, options: CommandOptions, isUndo: boolean) => {
      expect(context).toBe(wb);
      s.setValue(0, 0, isUndo ? null : options.value);
      return true;
    });
    cm.register('put', { canUndo: true, execute });
    expect(cm.execute({ cmd: 'missing' })).toBe(false);
    expect(cm.execute({ cmd: 'put', value: 7 })).toBe(true);
    expect(s.getValue(0, 0)).toBe(7);
    expect(um.canUndo()).toBe(true);
    expect(um.canRedo()).toBe(false);
    expect(um.getUndoStack()[0]).toMatchObject({ cmd: 'put', value: 7 });
    expect(um.undo()).toBe(true);
    expect(s.getValue(0, 0)).toBeNull();
    expect(um.getRedoStack()).toHaveLength(1);
    expect(um.redo()).toBe(true);
    expect(s.getValue(0, 0)).toBe(7);
    expect(execute.mock.calls.map((c) => c[2])).toEqual([false, true, false]);
    um.clear();
    expect(um.canUndo()).toBe(false);
    expect(um.canRedo()).toBe(false);
    expect(um.undo()).toBe(false);
    expect(um.redo()).toBe(false);
  });
  it('undoes and redoes built-in edits including formula state', () => {
    const wb = new Workbook(),
      s = wb.getSheet(0),
      cm = wb.commandManager(),
      um = wb.undoManager();
    s.setValue(0, 0, 'before');
    cm.execute({ cmd: 'editCell', sheetName: s.name(), row: 0, col: 0, newValue: 'after' });
    expect(s.getValue(0, 0)).toBe('after');
    um.undo();
    expect(s.getValue(0, 0)).toBe('before');
    um.redo();
    expect(s.getValue(0, 0)).toBe('after');
    s.setFormula(1, 1, 'A1');
    cm.execute({ cmd: 'editCell', sheetName: s.name(), row: 1, col: 1, newValue: 9 });
    um.undo();
    expect(s.getFormula(1, 1)).toBe('A1');
    um.redo();
    expect(s.getValue(1, 1)).toBe(9);
    expect(s.getFormula(1, 1)).toBeNull();
    um.undo();
    cm.execute({ cmd: 'editCell', row: 2, col: 2, newValue: 3 });
    expect(um.canRedo()).toBe(false);
  });
  it('bounds history, honors allowUndo and failed commands, and configures shortcuts', () => {
    const wb = new Workbook(),
      cm = wb.commandManager(),
      um = wb.undoManager();
    expect(um.maxSize()).toBe(2147483647);
    expect(um.maxSize(2)).toBe(um);
    for (let i = 0; i < 3; i++) cm.execute({ cmd: 'editCell', row: 0, col: 0, newValue: i });
    expect(um.getUndoStack()).toHaveLength(2);
    um.clear();
    wb.options.allowUndo = false;
    cm.execute({ cmd: 'editCell', row: 0, col: 0, newValue: 4 });
    expect(um.canUndo()).toBe(false);
    cm.register('fail', { canUndo: true, execute: () => false }, 65, true);
    expect(cm.execute({ cmd: 'fail' })).toBe(false);
    expect(cm.shortcuts.get('65:1:0:0:0')).toBe('fail');
    cm.setShortcutKey('fail', 66, false, true);
    expect(cm.shortcuts.get('66:0:1:0:0')).toBe('fail');
    cm.setShortcutKey(undefined, 65, true);
    expect(cm.shortcuts.has('65:1:0:0:0')).toBe(false);
    cm.setShortcutKey('fail');
    expect(cm.shortcuts.size).toBe(0);
  });
});
