/* Workbook event binding of the Designer: (re)binds the event types that make
 * the ribbon, formula bar and panels refresh, the cell-button command bridge
 * and the format-painter / range-pick SelectionChanged handler. The class
 * method is a thin wrapper around `bindDesignerWorkbookEvents`. */
import type { DesignerApi as Designer } from './designer-api.js';
import { invalidateChartLauncherState, toA1 } from './commands/insert.js';
import type GC from '@mescius/spread-sheets';

const insertColumnName = (index: number): string => toA1({ row: 0, col: index, rowCount: 1, colCount: 1 }).replace(/\d+$/, '');

/** `ButtonClicked` event args plus the cell-button `command` our core fills in. */
type ButtonClickedArgs = GC.Spread.Sheets.IButtonClickedEventArgs & { command?: unknown };

/** `SelectionChanged` event args (the designer binds a second, args-only handler). */
type SelectionChangedArgs = GC.Spread.Sheets.ISelectionChangedEventArgs & {
  /** TASK 70: our core marks interaction-driven selections (grid/keyboard/name box) `true`;
   * programmatic `setSelection`/`setActiveCell` calls come through `false`. */
  byUser?: boolean;
};

export function bindDesignerWorkbookEvents(d: Designer): void {
  const schedule = (): void => { d.invalidate(); };
  for (const [type, handler] of d._workbookHandlers) {
    try { d.getWorkbook().unbind(type, handler); } catch { /* ignore */ }
  }
  d._workbookHandlers = [];
  const events = d.gc.Spread.Sheets.Events;
  const types = [
    events.SelectionChanged, events.ActiveSheetChanged, events.ValueChanged, events.CellChanged,
    events.RangeChanged, events.SheetChanged, events.RowChanged, events.ColumnChanged,
    events.EditEnded, events.ClipboardChanged,
    events.FloatingObjectSelectionChanged, events.FloatingObjectChanged, events.FloatingObjectRemoved, events.FloatingObjectLoaded,
    // Pivot changes repaint the contextual ribbon, the docked panel and the Active Field box (TASK 47).
    events.PivotTableChanged, events.PivotTableChanging,
  ].filter(Boolean);
  for (const type of types) {
    const handler = (): void => schedule();
    try { d.getWorkbook().bind(type, handler); d._workbookHandlers.push([type, handler]); } catch { /* ignore */ }
  }
  // TASK 70: an active-sheet switch always takes the new sheet's selection into the chart rule.
  try { d.getWorkbook().bind(events.ActiveSheetChanged, () => { invalidateChartLauncherState(d); }); } catch { /* ignore */ }
  // A cell button (style.cellButtons) command that names a designer command runs through the designer.
  const buttonClicked = (_event: unknown, args: ButtonClickedArgs): void => {
    const name = args?.command;
    if (typeof name !== 'string' || !name || name === 'none') return;
    if (d.getCommand(name)) d.executeCommand(name);
  };
  try { d.getWorkbook().bind(events.ButtonClicked, buttonClicked); d._workbookHandlers.push([events.ButtonClicked, buttonClicked]); } catch { /* ignore */ }
  // TASK 70: dedicated cache listener (the painter/pick handler below keeps its historical
  // single-parameter signature untouched). `info` is the SECOND handler parameter (core
  // `events.ts` emits `(eventObject, info)`).
  const chartLauncherEvents = (event: unknown, args?: SelectionChangedArgs): void => {
    // Trial parity: the eight chart launchers keep their creation-time state until a USER
    // selection change arrives (the trial ignores API selections and data writes here).
    if (args?.byUser === true) invalidateChartLauncherState(d);
    void event;
  };
  try { d.getWorkbook().bind(events.SelectionChanged, chartLauncherEvents); } catch { /* ignore */ }
  d.getWorkbook().bind(events.SelectionChanged, (args: SelectionChangedArgs) => {
    const painter = d._formatPainterStyle;
    if (painter && !d._applyingPainter) {
      d._applyingPainter = true;
      try { d.runUndoable('applyFormatPainter', {}); } finally {
        d._formatPainterStyle = null;
        d._applyingPainter = false;
      }
    }
    const pick = d._rangePick;
    if (pick && args?.sheet) {
      const ranges = args.sheet.getSelections?.() ?? [];
      const range = ranges[0];
      if (range && range.rowCount > 0 && range.colCount > 0) {
        const endRow = range.row + range.rowCount - 1, endCol = range.col + range.colCount - 1;
        const same = range.row === endRow && range.col === endCol;
        const address = `${insertColumnName(range.col)}${range.row + 1}${same ? '' : `:${insertColumnName(endCol)}${endRow + 1}`}`;
        d._rangePick = null;
        pick.done(address);
        d.invalidate();
      }
    }
    void args;
  });
}
