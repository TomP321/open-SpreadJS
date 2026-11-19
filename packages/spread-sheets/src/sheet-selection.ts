/**
 * Selection state of `Worksheet`: the selection ranges and active cell
 * (with SelectionChanging/Changed/Leave/Enter events) plus the pending
 * copy/cut clipboard state. Bodies moved out of `worksheet.ts` unchanged
 * (`this` renamed to the `sheet` parameter).
 */
import { Range } from './primitives.js';
import { coordinate } from './sheet-common.js';
import { Events } from './events.js';
import type { Worksheet } from './worksheet.js';

/**
 * TASK 56 (probe `.probe/api-sweep-probe.mjs t56-sel`): the trial normalizes stored selections over
 * merged spans — a stored selection that intersects a span expands to cover it completely
 * (getSelections reports the expanded range). Whole-row/column selections (negative extent) and the
 * cleared selection are left untouched; import-restored selections bypass `updateSelections` and are
 * NOT expanded, exactly like the trial's imported state.
 */
export function _expandSelectionToSpans(sheet: Worksheet, selections: Range[]): Range[] {
  const spans = sheet.area().spans;
  if (!spans.length) return selections;
  return selections.map((sel) => {
    if (sel.row < 0 || sel.col < 0 || sel.rowCount < 0 || sel.colCount < 0) return sel;
    let { row, col, rowCount, colCount } = sel;
    for (let stable = false; !stable; ) {
      stable = true;
      for (const span of spans) {
        if (!span.intersect(row, col, rowCount, colCount)) continue;
        const top = Math.min(row, span.row), left = Math.min(col, span.col);
        const bottom = Math.max(row + rowCount, span.row + span.rowCount), right = Math.max(col + colCount, span.col + span.colCount);
        if (top !== row || left !== col || bottom !== row + rowCount || right !== col + colCount) {
          row = top; col = left; rowCount = bottom - top; colCount = right - left; stable = false;
        }
      }
    }
    return row === sel.row && col === sel.col && rowCount === sel.rowCount && colCount === sel.colCount ? sel : new Range(row, col, rowCount, colCount);
  });
}

/**
 * TASK 70 (measured on the trial in paired probes): only USER-driven selection changes
 * (grid click/drag, keyboard, header click, the Designer name box) count as interaction
 * selections. Programmatic `setSelection`/`setActiveCell`/`addSelection`/`clearSelection`
 * move the selection without the trial firing `SelectionChanged` (probed: an API selection
 * fired neither Changing nor Changed, while a mouse click fired LeaveCell, EnterCell,
 * SelectionChanging and SelectionChanged). The Designer uses the `byUser` marker on the
 * Changed args to cache ribbon command states exactly like the trial (see the paired
 * gate `apps/designer-compare/test/data-regressions.spec.ts`); our public API stays a
 * conservative superset by still firing the (cancellable) `SelectionChanging` there.
 */
export function setSelection(sheet: Worksheet, row: number, col: number, rowCount: number, colCount: number, byUser = false): void {
    if (!updateSelections(sheet, [new Range(row, col, rowCount, colCount)], byUser)) return;
    sheet.activeRow = Math.max(0, row);
    sheet.activeCol = Math.max(0, col);
    sheet.parent?._renderer()?.schedule();
}

export function updateSelections(sheet: Worksheet, selections: Range[], byUser = false): boolean {
    const info = {
      sheet: sheet,
      sheetName: sheet.sheetName,
      oldSelections: sheet.getSelections(),
      newSelections: selections,
      cancel: false,
    };
    sheet._emit(Events.SelectionChanging, info);
    if (info.cancel) return false;
    sheet.selections = _expandSelectionToSpans(sheet, selections);
    sheet._emit(Events.SelectionChanged, {
      sheet: sheet,
      sheetName: sheet.sheetName,
      oldSelections: info.oldSelections,
      newSelections: sheet.getSelections(),
      byUser,
    });
    sheet.batch.invalidate();
    return true;
}

export function setActiveCell(sheet: Worksheet, row: number, col: number, byUser = false): void {
    coordinate(row);
    coordinate(col);
    if (row === sheet.activeRow && col === sheet.activeCol) { updateSelections(sheet, [new Range(row, col, 1, 1)], byUser); return; }
    const info = {
      sheet: sheet,
      sheetName: sheet.sheetName,
      row: sheet.activeRow,
      col: sheet.activeCol,
      cancel: false,
    };
    sheet._emit(Events.LeaveCell, info);
    if (info.cancel) return;
    if (!updateSelections(sheet, [new Range(row, col, 1, 1)], byUser)) return;
    sheet.activeRow = row;
    sheet.activeCol = col;
    sheet._emit(Events.EnterCell, { sheet: sheet, sheetName: sheet.sheetName, row, col });
}

export function _setUserSelections(sheet: Worksheet, ranges: Range[], row: number, col: number): void {
    if (sheet.policy === 0) ranges = ranges.map(range => new Range(Math.max(0, range.row), Math.max(0, range.col), 1, 1));
    if (!updateSelections(sheet, sheet.policy === 2 ? ranges : ranges.slice(-1), true)) return;
    sheet.activeRow = row; sheet.activeCol = col;
}

export function _clipboardMode(sheet: Worksheet, ): 'none' | 'copy' | 'cut' {
    const interaction = sheet._view()?.interaction as { clipboard?: unknown; cut?: boolean } | undefined;
    if (!interaction?.clipboard) return 'none';
    return interaction.cut ? 'cut' : 'copy';
}

export function _clipboardSource(sheet: Worksheet, ): { sheetName: string; row: number; col: number; rowCount: number; colCount: number } | null {
    const interaction = sheet._view()?.interaction as { clipboard?: { sheet?: { name(): string }; range: { row: number; col: number; rowCount: number; colCount: number } } } | undefined;
    const clip = interaction?.clipboard;
    if (!clip) return null;
    const r = clip.range;
    return { sheetName: clip.sheet?.name() ?? '', row: r.row, col: r.col, rowCount: r.rowCount, colCount: r.colCount };
}

export function getSelections(sheet: Worksheet, ): Range[] {
    return sheet.selections.map((s) => new Range(s.row, s.col, s.rowCount, s.colCount));
}

export function addSelection(sheet: Worksheet, row: number, col: number, rowCount: number, colCount: number): void {
    sheet.updateSelections([...sheet.selections, new Range(row, col, rowCount, colCount)]);
}

export function clearSelection(sheet: Worksheet, ): void {
    sheet.updateSelections([]);
}

export function getActiveRowIndex(sheet: Worksheet, ): number {
    return sheet.activeRow;
}

export function getActiveColumnIndex(sheet: Worksheet, ): number {
    return sheet.activeCol;
}
