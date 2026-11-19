/* The Designer's undo plumbing: the workbook command-manager bridges the
 * designer registers ('__designerUndoable' and '__designerFormulaCommit'),
 * the per-sheet key registry they share, and the run/commit/restore helpers
 * the command routing uses. The class methods are thin wrappers around these
 * functions. */
import type { DesignerApi as Designer } from './designer-api.js';
import { applyBuiltin, activeSheet, topCell } from './commands/actions.js';
import type { Worksheet } from './core-internals.js';

/** Payload of the '__designerUndoable' command the undo bridge registers on the workbook command manager. */
interface UndoBridgeCommand {
  cmd: string;
  actionName: string;
  args?: Record<string, unknown>;
  before?: string;
  after?: string;
  sheetKey: number;
}

/** Payload of the '__designerFormulaCommit' command registered by the formula-bar bridge. */
interface FormulaCommitCommand {
  cmd: string;
  row: number;
  col: number;
  value?: string;
  before?: string;
  sheetKey: number;
}

export function runUndoable(d: Designer, commandName: string, args: Record<string, unknown>): void {
  const sheet = activeSheet(d);
  const before = JSON.stringify(sheet.toJSON());
  d.getWorkbook().commandManager().execute({ cmd: '__designerUndoable', actionName: commandName, args, before, sheetKey: undoSheetKey(d, sheet) });
  d.invalidate();
}
export function applyUndoableAction(d: Designer, name: string, args: Record<string, unknown>): boolean | void {
  return applyBuiltin(d, name, args);
}
export function restoreUndoable(d: Designer, sheetJSON: string): void {
  const sheet = activeSheet(d);
  if (sheetJSON) sheet.fromJSON(JSON.parse(sheetJSON));
  d.invalidate();
}
export function installUndoBridge(d: Designer): void {
  d._undoTarget = '__designerUndoable';
  d.getWorkbook().commandManager().register('__designerUndoable', {
    canUndo: true,
    execute: (_ctx: unknown, options: UndoBridgeCommand, isUndo: boolean) => {
      const sheet = d._undoSheets.get(options.sheetKey);
      if (!sheet) return false;
      if (isUndo) {
        if (options.before) sheet.fromJSON(JSON.parse(options.before));
        d.invalidate();
        return true;
      }
      if (options.after) {
        sheet.fromJSON(JSON.parse(options.after));
        d.invalidate();
        return true;
      }
      const result = applyBuiltin(d, options.actionName, options.args ?? {});
      options.after = JSON.stringify(sheet.toJSON());
      d.invalidate();
      return result !== false;
    },
  });
}
export function undoSheetKey(d: Designer, sheet: Worksheet): number {
  let key = d._undoSheetIds.get(sheet);
  if (key === undefined) {
    key = d._undoSheets.size;
    d._undoSheets.set(key, sheet);
    d._undoSheetIds.set(sheet, key);
  }
  return key;
}
export function installFormulaCommit(d: Designer): void {
  d.getWorkbook().commandManager().register('__designerFormulaCommit', {
    canUndo: true,
    execute: (_ctx: unknown, options: FormulaCommitCommand, isUndo: boolean) => {
      const sheet = d._undoSheets.get(options.sheetKey);
      if (!sheet) return false;
      if (isUndo) { sheet.fromJSON(JSON.parse(options.before as string)); }
      else {
        const text = String(options.value ?? '');
        if (text.startsWith('=')) sheet.setFormula(options.row, options.col, text); else {
          sheet.setFormula(options.row, options.col, null);
          sheet.setValue(options.row, options.col, text === '' ? null : text);
        }
      }
      d.invalidate();
      return true;
    },
  });
}
/** Commits formula-bar text through the undoable bridge (snapshots the sheet JSON first). */
export function commitFormula(d: Designer, text: string): void {
  const sheet = activeSheet(d);
  const { row, col } = topCell(sheet);
  const before = JSON.stringify(sheet.toJSON());
  try {
    d.getWorkbook().commandManager().execute({
      cmd: '__designerFormulaCommit', row, col, value: text, before, sheetKey: undoSheetKey(d, sheet),
    });
  } catch (error) { d.showMessageBox(String(error), 'Error', 3); }
  d.invalidate();
}
