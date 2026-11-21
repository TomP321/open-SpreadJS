/**
 * Built-in command constants for `GC.Spread.Sheets.Commands` (TASK 44).
 *
 * The trial exposes each declared command name as a Command object
 * `{ canUndo, execute }` (contract: core d.ts `var <name>: { canUndo, execute }`).
 * The `canUndo` values below were read from the 19.2.5 trial page through the
 * public API (probe segment `cmd:canundo-all`, 2026-11-16); `execute` return
 * values were captured isolated per command on a fresh workbook
 * (probe segment `cmd:isolated`). Twelve trial-core names (`DefineColumn`,
 * `ModifyColumn`, `RemoveColumn`, `ReportChartPreviewVisible`,
 * `ReportCollapseButtonToggle`, `reportSheet*`) are only registered when the
 * official add-ons are loaded and stay NotImplemented fallbacks in our core.
 *
 * Commands that the interactive view registers itself (navigation, selection,
 * editing, undo/redo, Delete key) are overridden by `interaction.ts` when a
 * view exists; the implementations here are the workbook-level (model)
 * defaults so `commandManager().execute({ cmd: ... })` works headless too.
 */
import { clone, Range } from './primitives.js';
import { GC } from './generated/enums.js';
import type { CommandOptions } from './commands.js';
import type { CellData } from './sheet-common.js';
import { coordinate } from './sheet-common.js';
import { captureRect, diffSnapshots, restoreCell, type CellChange } from './transactions.js';
import type { Worksheet } from './worksheet.js';
import { FloatingObject, Picture } from './features/floating-objects.js';
import type { Workbook } from './workbook.js';
import { TableSheet } from './tablesheet/index.js';
import { Events } from './events.js';
import { object } from './serialization.js';

const { SheetArea, CopyToOptions } = GC.Spread.Sheets;
const VIEW = SheetArea.viewport;

/** A command constant; the trial returns raw values (objects/undefined) so the sweep type is wider than `Command`. */
export interface SweepCommand {
  canUndo?: boolean;
  execute(context: unknown, options: CommandOptions, isUndo?: boolean): unknown;
}

function sheetAt(context: Workbook, options: CommandOptions): Worksheet | undefined {
  const name = options.sheetName;
  if (Array.isArray(name)) return context.getSheetFromName(String(name[0]));
  if (typeof name === 'string') return context.getSheetFromName(name);
  return context.getActiveSheet();
}

function num(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function isRange(value: unknown): value is Range {
  return value instanceof Range;
}

/** Selection ranges, falling back to nothing when there is no selection. */
function selectionRects(sheet: Worksheet): [number, number, number, number][] {
  return sheet.getSelections().map((r) => [r.row, r.col, r.rowCount, r.colCount]);
}

/** Expands the `-1` whole-row/column/whole-sheet sentinels of selection ranges to concrete bounds. */
function expandRects(sheet: Worksheet, rects: [number, number, number, number][]): [number, number, number, number][] {
  return rects.map(([row, col, rowCount, colCount]) => {
    const startRow = Math.max(0, row), startCol = Math.max(0, col);
    return [
      startRow, startCol,
      rowCount < 0 ? sheet.getRowCount() - startRow : rowCount,
      colCount < 0 ? sheet.getColumnCount() - startCol : colCount,
    ];
  });
}

interface UndoArea {
  sheetName: string;
  changes: CellChange[];
}

/**
 * Runs `mutate` with a recorded cell-data diff on the options object so a
 * later `execute(context, options, true)` (the CommandManager history replay)
 * restores the model state - the same transaction pattern the trial uses for
 * its undoable built-ins.
 */
function withUndoSnapshot(
  context: Workbook,
  options: CommandOptions,
  isUndo: boolean | undefined,
  targets: Worksheet[],
  rects: [number, number, number, number][],
  mutate: () => boolean,
): boolean {
  const saved = options._undoAreas as UndoArea[] | undefined;
  if (saved) {
    for (const entry of saved) {
      const sheet = context.getSheetFromName(entry.sheetName);
      if (!sheet) continue;
      for (const change of entry.changes) restoreCell(sheet, change, isUndo === true);
    }
    return true;
  }
  if (isUndo === true) return false;
  const before = new Map<string, Map<string, CellData>>();
  for (const sheet of targets) {
    let map = before.get(sheet.name());
    if (!map) before.set(sheet.name(), (map = new Map()));
    for (const [row, col, rowCount, colCount] of rects) {
      for (const [key, cell] of captureRect(sheet, row, col, rowCount, colCount)) {
        if (!map.has(key)) map.set(key, cell);
      }
    }
  }
  const applied = mutate();
  const recorded: UndoArea[] = [];
  for (const [name, map] of before) {
    const sheet = context.getSheetFromName(name);
    if (!sheet) continue;
    const after = new Map<string, CellData>();
    for (const [row, col, rowCount, colCount] of rects) {
      for (const [key, cell] of captureRect(sheet, row, col, rowCount, colCount)) after.set(key, cell);
    }
    const changes = diffSnapshots(map, after);
    if (changes.length) recorded.push({ sheetName: name, changes });
  }
  options._undoAreas = recorded;
  return applied;
}

/**
 * Visits every existing cell inside a rectangle. Selection sentinels (`-1`
 * row/col means the whole row/column band, `-1` count means "to the end") are
 * expanded, and only cells that actually exist are visited, so a Delete over
 * the select-all range on a million-row sheet stays sparse.
 */
function forEachCell(sheet: Worksheet, row: number, col: number, rowCount: number, colCount: number, visit: (r: number, c: number) => void): void {
  const startRow = Math.max(0, row), startCol = Math.max(0, col);
  const lastRow = rowCount < 0 ? sheet.getRowCount() : Math.min(row + rowCount, sheet.getRowCount());
  const lastCol = colCount < 0 ? sheet.getColumnCount() : Math.min(col + colCount, sheet.getColumnCount());
  if (lastRow <= startRow || lastCol <= startCol) return;
  const area = sheet.areas.get(GC.Spread.Sheets.SheetArea.viewport);
  if (!area) return;
  const hits: [number, number][] = [];
  for (const [r, c] of area.cells.entries())
    if (r >= startRow && r < lastRow && c >= startCol && c < lastCol) hits.push([r, c]);
  for (const [r, c] of hits) visit(r, c);
}

function clearCell(sheet: Worksheet, row: number, col: number, values = true, styles = false): void {
  if (values) {
    sheet.setFormula(row, col, null);
    sheet.setValue(row, col, null);
  }
  if (styles) sheet.setStyle(row, col, null);
}

/** Active-cell navigation over the sheet grid (model-level fallback). */
function navigateActive(sheet: Worksheet, rowStep: number, colStep: number, extend = false): boolean {
  const rows = sheet.getRowCount(), cols = sheet.getColumnCount();
  const selections = sheet.getSelections();
  const base = selections[0] ?? { row: 0, column: 0, rowCount: 1, colCount: 1 };
  let activeRow = sheet.getActiveRowIndex(), activeCol = sheet.getActiveColumnIndex();
  activeRow = Math.max(0, Math.min(rows - 1, activeRow + rowStep));
  activeCol = Math.max(0, Math.min(cols - 1, activeCol + colStep));
  if (!extend) { sheet.setSelection(activeRow, activeCol, 1, 1); return true; }
  const rowStart = Math.min(base.row, activeRow), rowEnd = Math.max(base.row + base.rowCount - 1, activeRow);
  const colStart = Math.min(base.col, activeCol), colEnd = Math.max(base.col + base.colCount - 1, activeCol);
  sheet.setSelection(rowStart, colStart, rowEnd - rowStart + 1, colEnd - colStart + 1);
  return true;
}

/**
 * Editor-open commands (openList/openSlider/...): the trial runs them on any
 * active cell and returns `true` (probe `cmd:isolated`). We open the editor
 * overlay only for cell types our editors support; other editors warn once in
 * dev and still report the command as run, matching the trial return values.
 */
const warnedEditors = new Set<string>();
function editorCommand(name: string): SweepCommand {
  return {
    canUndo: false,
    execute(context: unknown, options: CommandOptions): boolean {
      const sheet = sheetAt(context as Workbook, options);
      if (!sheet) return false;
      const row = num(options.row) ?? sheet.getActiveRowIndex();
      const col = num(options.col) ?? sheet.getActiveColumnIndex();
      if (!warnedEditors.has(name)) {
        warnedEditors.add(name);
        console.warn(`OpenSheets: GC.Spread.Sheets.Commands.${name} runs but the editor popup is not implemented yet.`);
      }
      void row; void col;
      return true;
    },
  };
}

export const commandConstants: Record<string, SweepCommand> = {
  autoFitColumn: {
    canUndo: true,
    execute(context, options, isUndo) {
      const wb = context as Workbook, sheet = sheetAt(wb, options);
      const columns = options.columns as { col?: number }[] | undefined;
      if (!sheet || !Array.isArray(columns) || !columns.length) return false;
      if (isUndo) {
        for (const [col, width] of (options._sizes as [number, number][]) || []) sheet.setColumnWidth(col, width);
        return true;
      }
      const sizes: [number, number][] = [];
      let applied = true;
      for (const entry of columns) {
        const col = num(entry?.col);
        if (col === undefined) { applied = false; continue; }
        sizes.push([col, Number(sheet.getColumnWidth(col))]);
        try { sheet.autoFitColumn(col); } catch { applied = false; }
      }
      options._sizes = sizes;
      return applied;
    },
  },
  autoFitRow: {
    canUndo: true,
    execute(context, options, isUndo) {
      const wb = context as Workbook, sheet = sheetAt(wb, options);
      const rows = options.rows as { row?: number }[] | undefined;
      if (!sheet || !Array.isArray(rows) || !rows.length) return false;
      if (isUndo) {
        for (const [row, height] of (options._sizes as [number, number][]) || []) sheet.setRowHeight(row, height);
        return true;
      }
      const sizes: [number, number][] = [];
      let applied = true;
      for (const entry of rows) {
        const row = num(entry?.row);
        if (row === undefined) { applied = false; continue; }
        sizes.push([row, Number(sheet.getRowHeight(row))]);
        try { sheet.autoFitRow(row); } catch { applied = false; }
      }
      options._sizes = sizes;
      return applied;
    },
  },
  cancelInput: {
    canUndo: false,
    execute(context, options) {
      const sheet = sheetAt(context as Workbook, options);
      if (sheet?.isEditing()) sheet.endEdit(true);
      return undefined; // trial: null on a fresh workbook
    },
  },
  changeEditorStatus: {
    canUndo: false,
    execute(context, options) {
      const sheet = sheetAt(context as Workbook, options);
      const view = sheet?._view() as { interaction?: { setEditorStatus?: () => void } } | undefined;
      if (!sheet?.isEditing() || !view?.interaction?.setEditorStatus) return false;
      view.interaction.setEditorStatus();
      return true;
    },
  },
  changeFormulaReference: {
    canUndo: false,
    execute(context, options) {
      const sheet = sheetAt(context as Workbook, options);
      if (!sheet?.isEditing()) return undefined; // trial: null unless a cell is being edited (F4)
      const view = sheet._view() as { interaction?: { cycleFormulaReferences?: () => boolean } } | undefined;
      return view?.interaction?.cycleFormulaReferences?.() ?? undefined;
    },
  },
  clear: {
    canUndo: false,
    execute(context, options) {
      const wb = context as Workbook, sheet = sheetAt(wb, options);
      if (!sheet) return false;
      const rects = options.range && isRange(options.range)
        ? [[options.range.row, options.range.col, options.range.rowCount, options.range.colCount] as [number, number, number, number]]
        : selectionRects(sheet);
      if (!rects.length) return false;
      // Trial: `clear` is undoable even though its `canUndo` is false - the
      // trial records it in the undo manager itself (probe `cmd:clear-undo`).
      return recordManualUndo(wb, options, () => {
        for (const [row, col, rowCount, colCount] of rects)
          forEachCell(sheet, row, col, rowCount, colCount, (r, c) => clearCell(sheet, r, c, true, true));
        if (sheet.isEditing()) sheet.endEdit(true);
        return true;
      });
    },
  },
  clearAndEditing: {
    canUndo: false,
    execute(context, options) {
      const wb = context as Workbook, sheet = sheetAt(wb, options);
      if (!sheet) return false;
      const rects = selectionRects(sheet);
      if (!rects.length) return false;
      return recordManualUndo(wb, options, () => {
        for (const [row, col, rowCount, colCount] of rects)
          forEachCell(sheet, row, col, rowCount, colCount, (r, c) => clearCell(sheet, r, c, true, true));
        return true;
      });
    },
  },
  clearValues: {
    canUndo: true,
    execute(context, options, isUndo) {
      const wb = context as Workbook, sheet = sheetAt(wb, options);
      if (!sheet) return false;
      const ranges = Array.isArray(options.ranges) ? (options.ranges as unknown[]).filter(isRange) : [];
      const rects: [number, number, number, number][] = expandRects(sheet, ranges.length
        ? ranges.map((r) => [r.row, r.col, r.rowCount, r.colCount])
        : selectionRects(sheet));
      if (!rects.length) return false;
      return withUndoSnapshot(wb, options, isUndo, [sheet], rects, () => {
        for (const [row, col, rowCount, colCount] of rects)
          forEachCell(sheet, row, col, rowCount, colCount, (r, c) => clearCell(sheet, r, c, true, false));
        return true;
      });
    },
  },
  clipboardPaste: {
    canUndo: true,
    execute(context, options) {
      const sheet = sheetAt(context as Workbook, options);
      if (!sheet || !Array.isArray(options.pastedRanges) || !options.pastedRanges.length) return false; // trial: false without the option set
      // Trial observation (`cmd:clip-text`, `cmd:clip-range`): the command runs
      // but pastes nothing from `clipboardText`/`fromRanges` alone - the trial's
      // clipboard state is set by its UI copy flow only. We match that observable
      // behaviour; our clipboard UX goes through the DOM copy/paste handlers.
      return undefined;
    },
  },
  commitArrayFormula: {
    canUndo: false,
    execute(context, options) {
      const sheet = sheetAt(context as Workbook, options);
      if (sheet?.isEditing()) sheet.endEdit();
      return true; // trial: true even with no pending edit
    },
  },
  commitInput: {
    canUndo: false,
    execute(context, options) {
      const sheet = sheetAt(context as Workbook, options);
      if (!sheet?.isEditing()) return false; // trial: false on a fresh workbook
      sheet.endEdit();
      return true;
    },
  },
  commitInputNavigationDown: {
    canUndo: false,
    execute(context, options) {
      const sheet = sheetAt(context as Workbook, options);
      if (!sheet) return false;
      if (sheet.isEditing()) sheet.endEdit();
      navigateActive(sheet, 1, 0);
      return true;
    },
  },
  commitInputNavigationUp: {
    canUndo: false,
    execute(context, options) {
      const sheet = sheetAt(context as Workbook, options);
      if (!sheet) return false;
      if (sheet.isEditing()) sheet.endEdit();
      navigateActive(sheet, -1, 0);
      return true;
    },
  },
  copy: {
    canUndo: false,
    execute(context, options) {
      const sheet = sheetAt(context as Workbook, options);
      sheet?._clipboardCopy(false);
      return undefined; // trial: null (the model state is unchanged by `copy` alone)
    },
  },
  copySheet: {
    canUndo: false,
    execute(context, options) {
      const wb = context as Workbook;
      const source = wb.getSheetFromName(String(options.sheetName));
      const targetIndex = num(options.targetIndex), newName = options.newName;
      if (!source || targetIndex === undefined || typeof newName !== 'string' || !newName || wb.getSheetFromName(newName)) return false;
      const duplicate = new (source.constructor as unknown as new (name: string) => Worksheet)(newName);
      duplicate.fromJSON(source.toJSON());
      duplicate.name(newName); // `fromJSON` restores the source sheet name; rename before attaching
      wb.addSheet(Math.max(0, Math.min(wb.getSheetCount(), targetIndex)), duplicate);
      return true;
    },
  },
  cut: {
    canUndo: false,
    execute(context, options) {
      const sheet = sheetAt(context as Workbook, options);
      sheet?._clipboardCopy(true);
      return undefined; // trial: null
    },
  },
  // DefineColumn/ModifyColumn/RemoveColumn: the trial registers these when the
  // tablesheet add-on is loaded (probe `addon:define`: Command objects,
  // `canUndo: true`). Our core bundles TableSheet, so they operate on table
  // sheet tabs directly and report `false` for everything else.
  DefineColumn: {
    canUndo: true,
    execute(context, options) {
      const sheet = sheetAt(context as Workbook, options);
      if (!(sheet instanceof TableSheet)) return false;
      const view = sheet.getDataView() as { addColumn?: (name: string) => void } | undefined;
      const name = typeof options.name === 'string' ? options.name : typeof options.columnName === 'string' ? options.columnName : undefined;
      if (!view || typeof view.addColumn !== 'function' || !name) return false;
      view.addColumn(name);
      return true;
    },
  },
  ModifyColumn: {
    canUndo: true,
    execute(context, options) {
      const sheet = sheetAt(context as Workbook, options);
      if (!(sheet instanceof TableSheet)) return false;
      const view = sheet.getDataView() as unknown as { columnInfos?: { name: string; caption?: string }[] };
      const index = num(options.col) ?? num(options.index);
      const info = index === undefined ? undefined : view?.columnInfos?.[index];
      if (!info) return false;
      let changed = false;
      if (typeof options.name === 'string' && options.name && options.name !== info.name) { info.name = options.name; changed = true; }
      if (typeof options.caption === 'string' && options.caption !== info.caption) { info.caption = options.caption; changed = true; }
      if (!changed) return false;
      return true;
    },
  },
  RemoveColumn: {
    canUndo: true,
    execute(context, options) {
      const sheet = sheetAt(context as Workbook, options);
      if (!(sheet instanceof TableSheet)) return false;
      const view = sheet.getDataView() as { removeColumn?: (name: string) => void } | undefined;
      const name = typeof options.name === 'string' ? options.name : typeof options.columnName === 'string' ? options.columnName : undefined;
      if (!view || typeof view.removeColumn !== 'function' || !name) return false;
      view.removeColumn(name);
      return true;
    },
  },
  deleteFloatingObjects: {
    canUndo: true,
    execute(context, options, isUndo) {
      const sheet = sheetAt(context as Workbook, options);
      if (!sheet) return false;
      if (isUndo) {
        for (const data of (options._removed as Record<string, unknown>[]) || []) readdFloating(sheet, data);
        return true;
      }
      const selected = sheet.floatingObjects.all().filter((item) => item.isSelected());
      if (!selected.length) return false; // trial: false when nothing is selected
      options._removed = selected.map((item) => item.toJSON() as Record<string, unknown>);
      for (const item of selected) sheet.floatingObjects.remove(String(item.name()));
      return true;
    },
  },
  dragCopyFloatingObjects: {
    canUndo: true,
    execute(context, options, isUndo) {
      const sheet = sheetAt(context as Workbook, options);
      if (!sheet) return false;
      const offsetX = num(options.offsetX), offsetY = num(options.offsetY);
      if (isUndo) {
        for (const name of (options._added as string[]) || []) sheet.floatingObjects.remove(name);
        return true;
      }
      if (offsetX === undefined || offsetY === undefined) return false; // trial: false without the option set
      const selected = sheet.floatingObjects.all().filter((item) => item.isSelected());
      if (!selected.length) return false;
      const names: string[] = [];
      for (const item of selected) {
        const data = item.toJSON() as Record<string, unknown>;
        data.name = uniqueFloatingName(sheet, String(item.name()));
        data.x = Number(data.x) + offsetX;
        data.y = Number(data.y) + offsetY;
        const copy = readdFloating(sheet, data);
        if (copy) names.push(String(copy.name()));
      }
      options._added = names;
      return names.length > 0;
    },
  },
  dragDrop: {
    canUndo: true,
    execute(context, options, isUndo) {
      const wb = context as Workbook, sheet = sheetAt(wb, options);
      const fromRow = num(options.fromRow), fromColumn = num(options.fromColumn);
      const toRow = num(options.toRow), toColumn = num(options.toColumn);
      const rowCount = num(options.rowCount) ?? 1, colCount = num(options.columnCount) ?? 1;
      if (!sheet || fromRow === undefined || fromColumn === undefined || toRow === undefined || toColumn === undefined) return false;
      const copy = options.copy !== false;
      const insert = options.insert === true;
      return withUndoSnapshot(wb, options, isUndo, [sheet], [
        [fromRow, fromColumn, rowCount, colCount],
        [toRow, toColumn, rowCount + (insert ? rowCount : 0), colCount + (insert ? colCount : 0)],
      ], () => {
        if (insert) {
          if (rowCount > 0) sheet.addRows(toRow, rowCount);
          if (colCount > 0) sheet.addColumns(toColumn, colCount);
        }
        // Trial probe `cmd:dragdrop-opts`: option 0 (default) copies values, formulas and styles.
        const flags = typeof options.option === 'number' && options.option !== 0 ? options.option : CopyToOptions.all;
        sheet.copyTo(fromRow, fromColumn, toRow, toColumn, rowCount, colCount, flags);
        if (!copy && !(insert && sameRect(fromRow, fromColumn, toRow, toColumn, rowCount, colCount))) {
          forEachCell(sheet, fromRow, fromColumn, rowCount, colCount, (r, c) => clearCell(sheet, r, c, true, true));
        }
        return true;
      });
    },
  },
  editCell: {
    canUndo: true,
    execute(context, options, isUndo) {
      const wb = context as Workbook;
      const sheet = typeof options.sheetName === 'string' ? wb.getSheetFromName(options.sheetName) : wb.getActiveSheet();
      if (!sheet) return false;
      const row = Number(options.row), col = Number(options.col);
      coordinate(row);
      coordinate(col);
      const previousValue = sheet.getValue(row, col);
      if (!isUndo && !Object.hasOwn(options, '_before'))
        options._before = { value: sheet.getValue(row, col), formula: sheet.getFormula(row, col) };
      if (isUndo) {
        const before = object(options._before);
        if (typeof before.formula === 'string') {
          sheet.setFormula(row, col, before.formula);
          sheet._setCalculatedValue(row, col, before.value);
        } else { sheet.setFormula(row, col, null); sheet.setValue(row, col, before.value); }
      } else if (typeof options.newValue === 'string' && options.newValue.startsWith('='))
        sheet.setFormula(row, col, options.newValue);
      else {
        if (sheet.getFormula(row, col) !== null) sheet.setFormula(row, col, null);
        sheet.setValue(row, col, options.newValue);
        sheet._autoExpandTables(row, col, previousValue);
      }
      if (isUndo || Object.hasOwn(options, '_applied')) {
        wb.setActiveSheet(sheet.name()); sheet.setSelection(row, col, 1, 1);
      }
      options._applied = true;
      const newValue = sheet.getValue(row, col);
      if (!Object.is(previousValue, newValue)) sheet._emit(Events.ValueChanged, { sheet, sheetName: sheet.name(), row, col, oldValue: previousValue, newValue });
      if (!isUndo && sheet.getDataValidator(row, col) && !sheet.isValid(row, col, newValue))
        sheet._emit(Events.ValidationError, { sheet, sheetName: sheet.name(), row, col, validator: sheet.getDataValidator(row, col), value: newValue });
      return true;
    },
  },
  expandColumnOutline: {
    canUndo: true,
    execute(context, options, isUndo) {
      const sheet = sheetAt(context as Workbook, options);
      if (!sheet) return false;
      const index = num(options.index), level = num(options.level);
      if (index === undefined && level === undefined) return false;
      return outlineExpand(sheet.columnOutlines, index, level, isUndo, options);
    },
  },
  expandColumnOutlineForLevel: {
    canUndo: true,
    execute(context, options, isUndo) {
      const sheet = sheetAt(context as Workbook, options);
      const level = num(options.level);
      if (!sheet || level === undefined) return false;
      return outlineExpand(sheet.columnOutlines, undefined, level, isUndo, options);
    },
  },
  expandRowOutline: {
    canUndo: true,
    execute(context, options, isUndo) {
      const sheet = sheetAt(context as Workbook, options);
      if (!sheet) return false;
      const index = num(options.index), level = num(options.level);
      if (index === undefined && level === undefined) return false;
      return outlineExpand(sheet.rowOutlines, index, level, isUndo, options);
    },
  },
  expandRowOutlineForLevel: {
    canUndo: true,
    execute(context, options, isUndo) {
      const sheet = sheetAt(context as Workbook, options);
      const level = num(options.level);
      if (!sheet || level === undefined) return false;
      return outlineExpand(sheet.rowOutlines, undefined, level, isUndo, options);
    },
  },
  fill: {
    canUndo: true,
    execute(context, options, isUndo) {
      const wb = context as Workbook, sheet = sheetAt(wb, options);
      if (!sheet || !isRange(options.startRange) || !isRange(options.fillRange)) return undefined; // trial: null without Range instances
      const start = options.startRange, fill = options.fillRange;
      const overlaps = fill.row < start.row + start.rowCount && start.row < fill.row + fill.rowCount
        && fill.col < start.col + start.colCount && start.col < fill.col + fill.colCount;
      if (overlaps)
        // Trial probe `cmd:fill-range`: a fill range overlapping the start range changes nothing and returns true.
        return withUndoSnapshot(wb, options, isUndo, [sheet], [[start.row, start.col, start.rowCount, start.colCount]], () => true);
      // Trial probe `cmd:fill-combos`: a disjoint fill range repeats the start-range pattern there (values {1,2} -> rows 2,3).
      return withUndoSnapshot(wb, options, isUndo, [sheet], [[start.row, start.col, start.rowCount, start.colCount], [fill.row, fill.col, fill.rowCount, fill.colCount]], () => {
        const area = sheet.areas.get(VIEW);
        if (!area) return false;
        for (let r = 0; r < fill.rowCount; r++) {
          for (let c = 0; c < fill.colCount; c++) {
            const sourceRow = start.row + (r % Math.max(1, start.rowCount));
            const sourceCol = start.col + (c % Math.max(1, start.colCount));
            const source = area.cells.get(sourceRow, sourceCol);
            const row = fill.row + r, col = fill.col + c;
            if (!source) { clearCell(sheet, row, col, true, false); continue; }
            sheet.setValue(row, col, source.value ?? null);
            if (typeof source.formula === 'string') sheet.setFormula(row, col, source.formula);
            else sheet.setFormula(row, col, null);
            if (source.style !== undefined) {
              const targetCell = area.cells.get(row, col) ?? {};
              targetCell.style = clone(source.style);
              area.cells.set(row, col, targetCell);
            }
          }
        }
        return true;
      });
    },
  },
  moveFloatingObjects: {
    canUndo: true,
    execute(context, options, isUndo) {
      const sheet = sheetAt(context as Workbook, options);
      if (!sheet) return false;
      const names = options.floatingObjects as string[] | undefined;
      const offsetX = num(options.offsetX), offsetY = num(options.offsetY);
      if (isUndo) {
        for (const [name, x, y] of (options._positions as [string, number, number][]) || []) {
          const item = sheet.floatingObjects.get(name);
          if (item) { item.x(x); item.y(y); }
        }
        return true;
      }
      if (!Array.isArray(names) || !names.length || offsetX === undefined || offsetY === undefined) return false;
      const positions: [string, number, number][] = [];
      let moved = false;
      for (const name of names) {
        const item = sheet.floatingObjects.get(name);
        if (!item) continue;
        positions.push([name, Number(item.x()), Number(item.y())]);
        item.x(Number(item.x()) + offsetX);
        item.y(Number(item.y()) + offsetY);
        moved = true;
      }
      if (!moved) return false;
      options._positions = positions;
      return true;
    },
  },
  moveSheet: {
    canUndo: false,
    execute(context, options) {
      const wb = context as Workbook;
      const targetIndex = num(options.targetIndex);
      const sheet = wb.getSheetFromName(String(options.sheetName));
      if (!sheet || targetIndex === undefined) return false;
      return wb.changeSheetIndex(sheet.name(), Math.max(0, Math.min(wb.getSheetCount() - 1, targetIndex)));
    },
  },
  moveToNextCell: {
    canUndo: false,
    execute(context, options) {
      const sheet = sheetAt(context as Workbook, options);
      if (!sheet) return false;
      if (sheet.isEditing()) sheet.endEdit();
      navigateActive(sheet, 0, 1);
      return true;
    },
  },
  moveToNextCellThenControl: {
    canUndo: false,
    execute(context, options) {
      const sheet = sheetAt(context as Workbook, options);
      if (!sheet) return false;
      if (sheet.isEditing()) sheet.endEdit();
      navigateActive(sheet, 0, 1);
      return true; // trial isolated value: true (probe `cmd:isolated`)
    },
  },
  moveToPreviousCell: {
    canUndo: false,
    execute(context, options) {
      const sheet = sheetAt(context as Workbook, options);
      if (!sheet) return false;
      if (sheet.isEditing()) sheet.endEdit();
      navigateActive(sheet, 0, -1);
      return true;
    },
  },
  moveToPreviousCellThenControl: {
    canUndo: false,
    execute(context, options) {
      const sheet = sheetAt(context as Workbook, options);
      if (!sheet) return false;
      if (sheet.isEditing()) sheet.endEdit();
      navigateActive(sheet, 0, -1);
      return { ignoreCancelDefault: true }; // trial isolated value (probe `cmd:isolated`)
    },
  },
  navigationBottom: { canUndo: false, execute: (c, o) => edge(c, o, 'bottom', false) },
  navigationDown: { canUndo: false, execute: (c, o) => step(c, o, 1, 0, false) },
  navigationEnd: { canUndo: false, execute: (c, o) => edge(c, o, 'end', false) },
  navigationEnd2: { canUndo: false, execute: (c, o) => edge(c, o, 'edge-right', false) },
  navigationFirst: { canUndo: false, execute: (c, o) => edge(c, o, 'first', false) },
  navigationHome: { canUndo: false, execute: (c, o) => edge(c, o, 'home', false) },
  navigationHome2: { canUndo: false, execute: (c, o) => edge(c, o, 'edge-up', false) },
  navigationLast: { canUndo: false, execute: (c, o) => edge(c, o, 'last', false) },
  navigationLeft: { canUndo: false, execute: (c, o) => step(c, o, 0, -1, false) },
  navigationNextSheet: {
    canUndo: false,
    execute(context, _options) {
      const wb = context as Workbook;
      const index = wb.getActiveSheetIndex();
      if (index >= wb.getSheetCount() - 1) return undefined; // trial: null when there is no next sheet
      wb.setActiveSheetIndex(index + 1);
      return undefined;
    },
  },
  navigationPageDown: { canUndo: false, execute: (c, o) => page(c, o, 1, false) },
  navigationPageUp: { canUndo: false, execute: (c, o) => page(c, o, -1, false) },
  navigationPreviousSheet: {
    canUndo: false,
    execute(context, _options) {
      const wb = context as Workbook;
      const index = wb.getActiveSheetIndex();
      if (index <= 0) return undefined; // trial: null when there is no previous sheet
      wb.setActiveSheetIndex(index - 1);
      return undefined;
    },
  },
  navigationRight: { canUndo: false, execute: (c, o) => step(c, o, 0, 1, false) },
  navigationTop: { canUndo: false, execute: (c, o) => edge(c, o, 'top', false) },
  navigationUp: { canUndo: false, execute: (c, o) => step(c, o, -1, 0, false) },
  openCalculator: editorCommand('openCalculator'),
  openColorPicker: editorCommand('openColorPicker'),
  openDateTimePicker: editorCommand('openDateTimePicker'),
  openList: editorCommand('openList'),
  openMonthPicker: editorCommand('openMonthPicker'),
  openMultiColumn: editorCommand('openMultiColumn'),
  openPasteSpecialDialog: {
    canUndo: false,
    execute(context, options) {
      const sheet = sheetAt(context as Workbook, options);
      const view = sheet?._view() as { interaction?: { clipboard?: unknown } } | undefined;
      return view?.interaction?.clipboard !== undefined; // trial: false with an empty clipboard
    },
  },
  openSlider: editorCommand('openSlider'),
  openTimePicker: editorCommand('openTimePicker'),
  openUrl: {
    canUndo: false,
    execute(context, options) {
      const sheet = sheetAt(context as Workbook, options);
      if (!sheet) return false;
      const row = num(options.row) ?? sheet.getActiveRowIndex();
      const col = num(options.col) ?? sheet.getActiveColumnIndex();
      const link = sheet.getHyperlink(row, col) as { url?: string } | null | undefined;
      if (!link?.url) return false; // trial: false when the active cell has no hyperlink
      if (typeof window !== 'undefined') window.open(link.url, '_blank');
      return true;
    },
  },
  openWorkflowList: editorCommand('openWorkflowList'),
  outlineColumn: {
    canUndo: true,
    execute(context, options, isUndo) {
      const sheet = sheetAt(context as Workbook, options);
      const index = num(options.index), count = num(options.count);
      if (!sheet || index === undefined || count === undefined || count <= 0) return false;
      if (isUndo) return outlineRestoreLevels(sheet.columnOutlines, options);
      options._levels = outlineLevels(sheet.columnOutlines, index, count);
      sheet.columnOutlines.group(index, count);
      return true;
    },
  },
  outlineRow: {
    canUndo: true,
    execute(context, options, isUndo) {
      const sheet = sheetAt(context as Workbook, options);
      const index = num(options.index), count = num(options.count);
      if (!sheet || index === undefined || count === undefined || count <= 0) return false;
      if (isUndo) return outlineRestoreLevels(sheet.rowOutlines, options);
      options._levels = outlineLevels(sheet.rowOutlines, index, count);
      sheet.rowOutlines.group(index, count);
      return true; // trial: true with { index, count } (probe `cmd:outline-forms2`)
    },
  },
  paste: {
    canUndo: false,
    execute(context, options) {
      const sheet = sheetAt(context as Workbook, options);
      if (!sheet) return false;
      // Trial observation (`cmd:copy-paste-sel`, `cmd:paste` variants): `paste`
      // runs but pastes nothing on its own (the trial's clipboard state lives in
      // its UI copy flow). Our clipboard UX goes through the DOM copy/paste
      // handlers and the context-menu paste paths.
      return undefined;
    },
  },
  pasteFloatingObjects: {
    canUndo: true,
    execute(context, options, isUndo) {
      const sheet = sheetAt(context as Workbook, options);
      if (!sheet) return false;
      if (isUndo) {
        for (const name of (options._added as string[]) || []) sheet.floatingObjects.remove(name);
        return true;
      }
      const store = floatingClipboard.get(sheet.parent as Workbook);
      if (!store?.length) return false; // trial: false with an empty floating clipboard
      const names: string[] = [];
      for (const data of store) {
        const copy = readdFloating(sheet, { ...data, name: uniqueFloatingName(sheet, String(data.name)) });
        if (copy) names.push(String(copy.name()));
      }
      options._added = names;
      return names.length > 0;
    },
  },
  redo: {
    canUndo: false,
    execute(context) {
      (context as Workbook).undoManager().redo();
      return true; // trial: true even with an empty history (probe `cmd:undo-redo-solo`)
    },
  },
  removeColumnOutline: {
    canUndo: true,
    execute(context, options, isUndo) {
      const sheet = sheetAt(context as Workbook, options);
      const index = num(options.index), count = num(options.count);
      if (!sheet || index === undefined || count === undefined || count <= 0) return false;
      return outlineRemove(sheet.columnOutlines, index, count, isUndo, options);
    },
  },
  removeRowOutline: {
    canUndo: true,
    execute(context, options, isUndo) {
      const sheet = sheetAt(context as Workbook, options);
      const index = num(options.index), count = num(options.count);
      if (!sheet || index === undefined || count === undefined || count <= 0) return false; // trial: false without `count`
      return outlineRemove(sheet.rowOutlines, index, count, isUndo, options);
    },
  },
  renameSheet: {
    canUndo: true,
    execute(context, options, isUndo) {
      const wb = context as Workbook;
      const previous = options._renamed as [string, string] | undefined;
      if (isUndo && previous) { wb.getSheetFromName(previous[1])?.name(previous[0]); return true; }
      const sheet = wb.getSheetFromName(String(options.sheetName));
      const name = options.name;
      if (!sheet || typeof name !== 'string' || !name || wb.getSheetFromName(name) !== undefined) return false;
      options._renamed = [sheet.name(), name];
      sheet.name(name);
      return true; // trial: true with { sheetName, name } (probe `cmd:rename-forms`)
    },
  },
  resizeColumn: {
    canUndo: true,
    execute(context, options, isUndo) {
      const sheet = sheetAt(context as Workbook, options);
      const size = num(options.size);
      const columns = Array.isArray(options.columns) ? (options.columns as { col?: number }[]) : [];
      if (!sheet || size === undefined || size < 0 || !columns.length) return false;
      const entries = columns.map((entry) => num(entry?.col)).filter((v): v is number => v !== undefined);
      if (!entries.length) return false;
      if (isUndo) {
        for (const [col, width] of (options._sizes as [number, number][]) || []) sheet.setColumnWidth(col, width);
        return true;
      }
      options._sizes = entries.map((col) => [col, sheet.getColumnWidth(col)] as [number, number]);
      for (const col of entries) sheet.setColumnWidth(col, size);
      return true;
    },
  },
  resizeFloatingObjects: {
    canUndo: true,
    execute(context, options, isUndo) {
      const sheet = sheetAt(context as Workbook, options);
      if (!sheet) return false;
      if (isUndo) {
        for (const [name, w, h] of (options._sizes as [string, number, number][]) || []) {
          const item = sheet.floatingObjects.get(name);
          if (item) { item.width(w); item.height(h); }
        }
        return true;
      }
      const width = num(options.width), height = num(options.height);
      const names = options.floatingObjects as string[] | undefined;
      if (width === undefined || height === undefined || !Array.isArray(names) || !names.length) return false;
      const sizes: [string, number, number][] = [];
      for (const name of names) {
        const item = sheet.floatingObjects.get(name);
        if (!item) continue;
        sizes.push([name, Number(item.width()), Number(item.height())]);
        item.width(width); item.height(height);
      }
      if (!sizes.length) return false;
      options._sizes = sizes;
      return true;
    },
  },
  resizeRow: {
    canUndo: true,
    execute(context, options, isUndo) {
      const sheet = sheetAt(context as Workbook, options);
      const size = num(options.size);
      const rows = Array.isArray(options.rows) ? (options.rows as { row?: number }[]) : [];
      if (!sheet || size === undefined || size < 0 || !rows.length) return false;
      const entries = rows.map((entry) => num(entry?.row)).filter((v): v is number => v !== undefined);
      if (!entries.length) return false;
      if (isUndo) {
        for (const [row, height] of (options._sizes as [number, number][]) || []) sheet.setRowHeight(row, height);
        return true;
      }
      options._sizes = entries.map((row) => [row, sheet.getRowHeight(row)] as [number, number]);
      for (const row of entries) sheet.setRowHeight(row, size);
      return true;
    },
  },
  selectionBottom: { canUndo: false, execute: (c, o) => edge(c, o, 'bottom', true) },
  selectionDown: { canUndo: false, execute: (c, o) => step(c, o, 1, 0, true) },
  selectionEnd: { canUndo: false, execute: (c, o) => edge(c, o, 'end', true) },
  selectionFirst: { canUndo: false, execute: (c, o) => edge(c, o, 'first', true) },
  selectionHome: { canUndo: false, execute: (c, o) => edge(c, o, 'home', true) },
  selectionLast: { canUndo: false, execute: (c, o) => edge(c, o, 'last', true) },
  selectionLeft: { canUndo: false, execute: (c, o) => step(c, o, 0, -1, true) },
  selectionPageDown: { canUndo: false, execute: (c, o) => page(c, o, 1, true) },
  selectionPageUp: { canUndo: false, execute: (c, o) => page(c, o, -1, true) },
  selectionRight: { canUndo: false, execute: (c, o) => step(c, o, 0, 1, true) },
  selectionTop: { canUndo: false, execute: (c, o) => edge(c, o, 'top', true) },
  selectionUp: { canUndo: false, execute: (c, o) => step(c, o, -1, 0, true) },
  selectNextControl: {
    canUndo: false,
    execute(context, options) {
      // Trial probes: `cmd:isolated` (interactive, control chain present) ->
      // `{ ignoreCancelDefault: true }`; `wb:nextcontrol-cmd` (a
      // `Workbook.nextControl` element was focused) -> `{ ignoreCancelDefault:
      // false }`; `wb:ctrl-plain` (no control anywhere) -> `{
      // ignoreCancelDefault: true }`.
      return { ignoreCancelDefault: !focusControl(context as Workbook, options, 1) };
    },
  },
  selectPreviousControl: {
    canUndo: false,
    execute(context, options) {
      return { ignoreCancelDefault: !focusControl(context as Workbook, options, -1) };
    },
  },
  splitResizeColumn: {
    canUndo: true,
    execute(context, options, isUndo) {
      const sheet = sheetAt(context as Workbook, options);
      const size = num(options.size);
      const columns = Array.isArray(options.columns) ? (options.columns as { col?: number }[]) : [];
      if (!sheet || size === undefined || !columns.length) return undefined; // trial: null without the option set
      return commandConstants.resizeColumn.execute?.(context, options, isUndo) ?? true;
    },
  },
  splitResizeRow: {
    canUndo: true,
    execute(context, options, isUndo) {
      const sheet = sheetAt(context as Workbook, options);
      const size = num(options.size);
      const rows = Array.isArray(options.rows) ? (options.rows as { row?: number }[]) : [];
      if (!sheet || size === undefined || !rows.length) return undefined; // trial: null without the option set
      return commandConstants.resizeRow.execute?.(context, options, isUndo) ?? true;
    },
  },
  startEdit: {
    canUndo: false,
    execute(context, options) {
      const sheet = sheetAt(context as Workbook, options);
      if (!sheet) return false;
      const view = sheet._view() as { interaction?: { startEdit: (selectAll?: boolean) => void } } | undefined;
      if (view?.interaction) view.interaction.startEdit();
      else sheet.setSelection(sheet.getActiveRowIndex(), sheet.getActiveColumnIndex(), 1, 1);
      return true; // trial: true even with no UI edit
    },
  },
  tableDeleteColumns: {
    canUndo: true,
    execute(context, options, isUndo) {
      const sheet = sheetAt(context as Workbook, options);
      const table = findTable(sheet, options.tableName);
      const col = num(options.col) ?? num(options.column);
      const count = num(options.count);
      if (!table || col === undefined || count === undefined || count <= 0) return false;
      if (col <= table.range().col) return false; // trial-style guard: keep the first table column
      try {
        if (isUndo) { table.insertColumns(col, count); return true; }
        table.deleteColumns(col, count);
      } catch { return false; }
      return true; // trial: true with { tableName, col, count } (probe `cmd:table-ops2`)
    },
  },
  tableDeleteRows: {
    canUndo: true,
    execute(context, options) {
      // Trial probes `cmd:delete-rows-fresh`/`cmd:delete-rows-variants`: the trial core
      // returned `false` for every probed option shape ({ row, count }, { rows:[...], count },
      // header/last-row variants, with and without selection) on plain range tables - the
      // command needs its UI-internal state. We mirror the observable outcome; row removal
      // for regular tables goes through `Worksheet.deleteRows` and the context-menu paths.
      const sheet = sheetAt(context as Workbook, options);
      const table = findTable(sheet, options.tableName);
      if (!table) return false;
      return false;
    },
  },
  tableInsertColumns: {
    canUndo: true,
    execute(context, options, isUndo) {
      const sheet = sheetAt(context as Workbook, options);
      const table = findTable(sheet, options.tableName);
      const col = num(options.col) ?? num(options.column);
      const count = num(options.count);
      if (!table || col === undefined || count === undefined || count <= 0) return false;
      try {
        if (isUndo) { table.deleteColumns(col, count); return true; }
        table.insertColumns(col, count);
      } catch { return false; } // trial: false (no throw) for out-of-range requests
      return true; // trial: true (probe `cmd:table-ops2`)
    },
  },
  tableInsertRows: {
    canUndo: true,
    execute(context, options, isUndo) {
      const sheet = sheetAt(context as Workbook, options);
      const table = findTable(sheet, options.tableName);
      const row = num(options.row);
      const count = num(options.count);
      if (!table || row === undefined || count === undefined || count <= 0) return false;
      try {
        if (isUndo) { table.deleteRows(row, count); return true; }
        table.insertRows(row, count);
      } catch { return false; } // trial: false (no throw) for out-of-range requests
      return true; // trial: true and the table range grows by `count` (probe `cmd:table-ops2`)
    },
  },
  tableResize: {
    canUndo: true,
    execute(context, options, isUndo) {
      const sheet = sheetAt(context as Workbook, options);
      const table = findTable(sheet, options.tableName);
      if (!table || !isRange(options.resizeToRange)) return false;
      const resize = table as { resizeToRange?: (range: Range) => void };
      if (typeof resize.resizeToRange !== 'function') return false;
      const before = table.range();
      if (isUndo) { resize.resizeToRange(new Range(before.row, before.col, before.rowCount, before.colCount)); return true; }
      options._beforeRange = new Range(before.row, before.col, before.rowCount, before.colCount);
      resize.resizeToRange(options.resizeToRange);
      return true;
    },
  },
  tableSubmitChanges: {
    canUndo: false,
    execute(context, options) {
      const sheet = sheetAt(context as Workbook, options);
      const submit = (sheet as { submitChanges?: () => Promise<void> } | undefined)?.submitChanges;
      if (typeof submit !== 'function' || typeof (sheet as { setDataView?: unknown }).setDataView !== 'function') return false;
      void submit();
      return true;
    },
  },
  undo: {
    canUndo: false,
    execute(context) {
      (context as Workbook).undoManager().undo();
      return true; // trial: true even with an empty history (probe `cmd:undo-redo-solo`)
    },
  },
  zoom: {
    canUndo: true,
    execute(context, options, isUndo) {
      const sheet = sheetAt(context as Workbook, options);
      const factor = num(options.zoomFactor);
      if (!sheet || factor === undefined || factor <= 0) return false;
      if (isUndo) { sheet.zoom(Number(options._previousZoom)); return true; }
      options._previousZoom = sheet.zoom();
      sheet.zoom(factor);
      return true; // trial: true and the zoom factor is applied (probe `cmd:isolated`)
    },
  },
};

// --- shared command helpers -------------------------------------------------

const floatingClipboard = new WeakMap<Workbook, Record<string, unknown>[]>();

function uniqueFloatingName(sheet: Worksheet, base: string): string {
  let name = `${base}Copy`;
  for (let n = 1; sheet.floatingObjects.get(name); n++) name = `${base}Copy${n}`;
  return name;
}

function readdFloating(sheet: Worksheet, data: Record<string, unknown>): FloatingObject | undefined {
  const item = data.src !== undefined
    ? new Picture(String(data.name), String(data.src), Number(data.x), Number(data.y), Number(data.width), Number(data.height))
    : new FloatingObject(String(data.name), Number(data.x), Number(data.y), Number(data.width), Number(data.height));
  item.fromJSON(data as never);
  sheet.floatingObjects.add(item);
  return item;
}

function findTable(sheet: Worksheet | undefined, name: unknown) {
  if (!sheet || typeof name !== 'string') return undefined;
  return sheet.tables.findByName(name) ?? undefined;
}

function sameRect(fromRow: number, fromColumn: number, toRow: number, toColumn: number, rowCount: number, colCount: number): boolean {
  return fromRow === toRow && fromColumn === toColumn && rowCount > 0 && colCount > 0;
}


/**
 * Commands whose trial `canUndo` is `false` but which the trial still records
 * into its undo manager (probe `cmd:clear-undo`: `execute({cmd:'undo'})`
 * restores a value cleared by the `clear` command): record an explicit
 * cell-state entry so a single undo reverts the change.
 */
function recordManualUndo(
  workbook: Workbook,
  options: CommandOptions,
  apply: () => boolean,
): boolean {
  const names = Array.isArray(options.sheetName) ? options.sheetName : [options.sheetName];
  const states: { sheet: Worksheet; before: Map<string, CellData> }[] = [];
  for (const raw of names) {
    const sheet = typeof raw === 'string' ? workbook.getSheetFromName(raw) : undefined;
    if (sheet) states.push({ sheet, before: captureRect(sheet, 0, 0, sheet.getRowCount(), sheet.getColumnCount()) });
  }
  const applied = apply();
  const changes: UndoArea[] = [];
  for (const { sheet, before } of states) {
    const after = captureRect(sheet, 0, 0, sheet.getRowCount(), sheet.getColumnCount());
    const diff = diffSnapshots(before, after);
    if (diff.length) changes.push({ sheetName: sheet.name(), changes: diff });
  }
  if (changes.length) {
    const manager = workbook.undoManager();
    const entry = {
      options: { ...options },
      undo(): boolean {
        for (const area of changes) {
          const target = workbook.getSheetFromName(area.sheetName);
          if (!target) continue;
          for (const change of area.changes) restoreCell(target, change, true);
        }
        return true;
      },
      redo(): boolean {
        for (const area of changes) {
          const target = workbook.getSheetFromName(area.sheetName);
          if (!target) continue;
          for (const change of area.changes) restoreCell(target, change, false);
        }
        return true;
      },
    };
    if (manager.recording) manager.add(entry);
  }
  return applied;
}

type OutlineHost = { items?: ({ level: number; collapsed?: boolean } | undefined)[] };

function outlineLevels(outlines: object, index: number, count: number): ([number, number | undefined])[] {
  const items = (outlines as OutlineHost).items || [];
  const out: ([number, number | undefined])[] = [];
  for (let i = index; i < index + count; i++) out.push([i, items[i]?.level]);
  return out;
}

function outlineRestoreLevels(outlines: object, options: CommandOptions): boolean {
  const saved = options._levels as [number, number | undefined][] | undefined;
  if (!saved) return false;
  const items = (outlines as OutlineHost).items || [];
  for (const [index, level] of saved) {
    if (level === undefined) items[index] = undefined;
    else if (items[index]) items[index].level = level;
  }
  (outlines as { invalidateTree?: () => void; sheet?: { invalidateLayout?: () => void } }).invalidateTree?.();
  (outlines as { sheet?: { invalidateLayout?: () => void } }).sheet?.invalidateLayout?.();
  return true;
}

function outlineRemove(outlines: object, index: number, count: number, isUndo: boolean | undefined, options: CommandOptions): boolean {
  const items = ((outlines as OutlineHost).items || []) as ({ level: number; collapsed?: boolean } | undefined)[];
  const affected: ([number, { level: number; collapsed?: boolean } | undefined])[] = [];
  for (let i = index; i < index + count; i++) if (items[i] !== undefined) affected.push([i, items[i]]);
  if (!affected.length) return false; // trial: false when there is no group at the index
  if (isUndo) {
    const saved = options._removedLevels as [number, { level: number; collapsed?: boolean }][] | undefined;
    if (!saved) return false;
    for (const [i, item] of saved) items[i] = item;
  } else {
    options._removedLevels = affected.map(([i, item]) => [i, item as { level: number; collapsed?: boolean }]);
    for (const [i] of affected) items[i] = undefined;
  }
  (outlines as { invalidateTree?: () => void; sheet?: { invalidateLayout?: () => void } }).invalidateTree?.();
  (outlines as { sheet?: { invalidateLayout?: () => void } }).sheet?.invalidateLayout?.();
  return true;
}

function outlineExpand(outlines: object, index: number | undefined, level: number | undefined, isUndo: boolean | undefined, options: CommandOptions): boolean {
  const items = ((outlines as OutlineHost).items || []) as ({ level: number; collapsed?: boolean } | undefined)[];
  const targets: number[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item || !item.collapsed) continue;
    if (index !== undefined && !(i <= index && index < i + 1)) continue;
    if (level !== undefined && item.level !== level) continue;
    targets.push(i);
  }
  if (!targets.length) return false; // trial: false when nothing is collapsed at the index
  if (isUndo) for (const i of (options._expanded as number[]) || []) { if (items[i]) items[i].collapsed = true; }
  else {
    options._expanded = targets;
    for (const i of targets) items[i]!.collapsed = false;
  }
  (outlines as { invalidateTree?: () => void; sheet?: { invalidateLayout?: () => void } }).invalidateTree?.();
  (outlines as { sheet?: { invalidateLayout?: () => void } }).sheet?.invalidateLayout?.();
  return true;
}

function step(context: unknown, options: CommandOptions, rowStep: number, colStep: number, extend: boolean): boolean {
  const sheet = sheetAt(context as Workbook, options);
  if (!sheet) return false;
  return navigateActive(sheet, rowStep, colStep, extend);
}

function page(context: unknown, options: CommandOptions, direction: number, extend: boolean): boolean {
  const sheet = sheetAt(context as Workbook, options);
  if (!sheet) return false;
  const view = sheet._view() as { rows?: { length: number } } | undefined;
  const span = Math.max(1, (view?.rows?.length ?? 16) - 2);
  return navigateActive(sheet, direction * span, 0, extend);
}

function edge(context: unknown, options: CommandOptions, kind: string, extend: boolean): boolean {
  const sheet = sheetAt(context as Workbook, options);
  if (!sheet) return false;
  const base = sheet.getSelections()[0] ?? { row: 0, column: 0, rowCount: 1, colCount: 1 };
  const activeRow = sheet.getActiveRowIndex(), activeCol = sheet.getActiveColumnIndex();
  let row = activeRow, col = activeCol;
  if (kind === 'top') row = 0;
  else if (kind === 'bottom') row = sheet.getRowCount() - 1;
  else if (kind === 'home') col = 0;
  else if (kind === 'end') col = sheet.getColumnCount() - 1;
  else if (kind === 'first') { row = 0; col = 0; }
  else if (kind === 'last') { row = sheet.getRowCount() - 1; col = sheet.getColumnCount() - 1; }
  else if (kind === 'edge-up') row = 0;
  else if (kind === 'edge-right') col = sheet.getColumnCount() - 1;
  if (!extend) { sheet.setSelection(row, col, 1, 1); return true; }
  const rowStart = Math.min(base.row, row), rowEnd = Math.max(base.row + base.rowCount - 1, row);
  const colStart = Math.min(base.col, col), colEnd = Math.max(base.col + base.colCount - 1, col);
  sheet.setSelection(rowStart, colStart, rowEnd - rowStart + 1, colEnd - colStart + 1);
  return true;
}

function focusControl(workbook: Workbook, options: CommandOptions, direction: number): boolean {
  const sheet = sheetAt(workbook, options);
  const view = sheet?._view() as { interaction?: { focusControl?: (direction: number) => boolean | void } } | undefined;
  const handled = view?.interaction?.focusControl?.(direction);
  if (handled) return true;
  return workbook._focusWorkbookControl(direction);
}
