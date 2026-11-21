/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * TASK 84 — the three RC2 designer regressions, pinned at unit level.
 *
 * R1 (`removeDuplicates`): the live trial opens the "Remove Duplicates" dialog on a bare
 *    `getCommand('removeDuplicates').execute(designer)` and changes no data
 *    (`.probe/t84/r1-r2-probe.json`), so every path routes to the dialog.
 * R2 (`fontWeight`): `Designer.executeCommand` is our own extension API (the official Designer
 *    exposes neither `executeCommand` nor `Designer.execute`) and its bare-call contract since RC1
 *    is a toggle; the trial-measured `executeBuiltin` path keeps writing `normal` (TASK 75 sweep).
 * R3 (adaptive Page Layout): the static-label combo class is scoped to the Sparkline Weight combo,
 *    so the fit-pages labels keep the paint the paired pixel gate measures (see docs/STATUS.md).
 */
import { beforeEach, describe, expect, it } from 'vitest';
import GC from '@mescius/spread-sheets';
import { executeDesignerBuiltin, executeDesignerCommand, executeDesignerSpecial } from '../src/designer-commands.js';
import { applyBuiltin } from '../src/commands/actions.js';
import { builtinCommandSpecs } from '../src/commands/index.js';

function makeDesigner(workbook: GC.Spread.Sheets.Workbook): any {
  const d: any = {
    gc: GC,
    spreadsheet: workbook,
    getWorkbook: () => workbook,
    invalidate: () => undefined,
    _recentCommands: [],
    dialogs: [] as string[],
    /* Mirrors Designer.getCommand + Designer.updateGlobalCommands (designer.ts): a registered
     * command without an `execute` re-enters the builtin routing of ITS OWN context. */
    getCommand: (name?: string) => {
      if (!name) return builtinCommandSpecs;
      const command = builtinCommandSpecs[name];
      if (command && !command.execute) {
        command.execute = (context: any, property?: string, value?: unknown) => context.executeBuiltin(name, property, value);
      }
      return command;
    },
    executeBuiltin: (name: string, property?: string, value?: unknown) => executeDesignerBuiltin(d, name, property, value),
    executeSpecial: (name: string, value: unknown, property?: string) => executeDesignerSpecial(d, name, value, property),
    runUndoable: (name: string, args: any) => applyBuiltin(d, name, args ?? {}),
    showMessageBox: () => undefined,
    showRemoveDuplicates: () => d.dialogs.push('removeDuplicatesTemplate'),
  };
  return d;
}

describe('TASK 84 command paths', () => {
  let workbook: GC.Spread.Sheets.Workbook;
  let sheet: GC.Spread.Sheets.Worksheet;
  let d: any;

  beforeEach(() => {
    workbook = new GC.Spread.Sheets.Workbook();
    sheet = workbook.getActiveSheet();
    sheet.setArray(0, 0, [['Name', 'Count'], ['A', 1], ['A', 1], ['B', 2], ['Outside', 3]]);
    sheet.setValue(2, 3, 'Keep');
    sheet.setSelection(1, 1, 1, 1);
    sheet.setActiveCell(1, 1);
    d = makeDesigner(workbook);
  });

  const weight = (): unknown => sheet.getActualStyle(1, 1).fontWeight;
  const style = (): unknown => sheet.getActualStyle(1, 1).fontStyle;

  it('R1: every removeDuplicates execute opens the dialog and leaves the data alone', () => {
    const before = JSON.stringify(sheet.getArray(0, 0, 5, 4));
    expect(executeDesignerCommand(d, 'removeDuplicates')).toBe(true); // bare (trial path)
    expect(executeDesignerCommand(d, 'removeDuplicates', 'removeDuplicates')).toBe(true); // ribbon
    d.executeBuiltin('removeDuplicates');
    expect(d.dialogs).toEqual(['removeDuplicatesTemplate', 'removeDuplicatesTemplate', 'removeDuplicatesTemplate']);
    expect(JSON.stringify(sheet.getArray(0, 0, 5, 4))).toBe(before);
  });

  it('R2: a bare executeCommand toggles bold/italic from the effective style', () => {
    expect(weight()).toBeUndefined();
    executeDesignerCommand(d, 'fontWeight');
    expect(weight()).toBe('bold');
    executeDesignerCommand(d, 'fontWeight');
    expect(weight()).toBe('normal');
    expect(style()).toBeUndefined();
    executeDesignerCommand(d, 'fontItalic');
    expect(style()).toBe('italic');
    executeDesignerCommand(d, 'fontItalic');
    expect(style()).toBe('normal');
  });

  it('R2: an explicit value is a setter on both public entry points (the ribbon shape)', () => {
    executeDesignerCommand(d, 'fontWeight', 'fontWeight', true);
    expect(weight()).toBe('bold');
    executeDesignerCommand(d, 'fontWeight', 'fontWeight', false);
    expect(weight()).toBe('normal');
    d.executeBuiltin('fontItalic', 'fontItalic', true);
    expect(style()).toBe('italic');
  });

  it('R2: the trial-measured bare builtin path still materialises normal', () => {
    // TASK 75 sweep ("fontWeight materialising"): `getCommand(name).execute()` without a value
    // writes the property instead of reading the selection, so it stays a setter here.
    executeDesignerBuiltin(d, 'fontWeight');
    expect(weight()).toBe('normal');
    executeDesignerBuiltin(d, 'fontItalic');
    expect(style()).toBe('normal');
  });
});
