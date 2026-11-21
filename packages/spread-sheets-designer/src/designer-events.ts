/* Workbook event binding of the Designer: (re)binds the event types that make
 * the ribbon, formula bar and panels refresh, the cell-button command bridge
 * and the format-painter / range-pick SelectionChanged handler. The class
 * method is a thin wrapper around `bindDesignerWorkbookEvents`. */
import type { DesignerApi as Designer } from './designer-api.js';
import { setDockPane } from './dock-panes.js';
import { invalidateChartLauncherState, toA1 } from './commands/insert.js';
import { activeSheet } from './commands/base.js';
import { activePivot } from './pivot-designer.js';
import { chartsOf } from './core-internals.js';
import type GC from '@mescius/spread-sheets';

const insertColumnName = (index: number): string => toA1({ row: 0, col: index, rowCount: 1, colCount: 1 }).replace(/\d+$/, '');

/**
 * TASK 77: the docked PivotTable Field List follows the selection. Measured on the running trial
 * (apps/designer-compare server 5188, probes `.probe/t77/pw-follow.mjs` → t77-follow.json,
 * `pw-reopen.mjs` → t77-reopen.json, `pw-manualclose.mjs` → t77-manualclose.json):
 *  * selection into a pivot: the panel auto-opens (grid 1218 → 903 at 1280px); selection out:
 *    it auto-closes; re-entering re-opens — AS LONG AS the panel has not been closed manually;
 *  * a manual close (Field List command, the panel's X button, or a Field List execution while
 *    no pivot is active) switches the following OFF: later selection changes into the pivot no
 *    longer open the panel;
 *  * a Field List execution with no active pivot does not open the panel at all (no-op).
 * Creating a pivot arms the following again (createPivot), as does opening it on an active pivot.
 * Exported so the rule has a unit test of its own.
 */
export function pivotFieldListFollowSelection(d: Designer): void {
  const pivot = activePivot(d);
  if (pivot && !d._pivotFieldListOpen) {
    if (!d._pivotFieldListFollow) return;
    d._pivotFieldListMounted = true;
    setDockPane(d, 'pivot', true);
    d._pivotFieldListName = String(pivot.name() ?? '');
    d.invalidate();
  } else if (!pivot && d._pivotFieldListOpen) {
    setDockPane(d, 'pivot', false);
    d._pivotFieldListName = null;
    d.invalidate();
  }
}

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
  /* TASK 77 (trial measurements on apps/designer-compare, see `pivotFieldListFollowSelection`
   * above for the full rule): the docked pivot Field List panel follows the selection while its
   * follow mode is armed; a sheet switch re-reads the new sheet's selection the same way. */
  const pivotFieldListAutoShow = (): void => pivotFieldListFollowSelection(d);
  for (const type of [events.SelectionChanged, events.ActiveSheetChanged]) {
    try { d.getWorkbook().bind(type, pivotFieldListAutoShow); d._workbookHandlers.push([type, pivotFieldListAutoShow]); } catch { /* ignore */ }
  }
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
  // TASK 74 (measured on the trial, `.probe/t74/measure9-official.json`): making a cell
  // selection drops the selected floating objects — after a cell click the chart is no
  // longer selected and its Chart Design tab closes. Our core already clears the
  // shape/picture selection on a grid click (`interaction.ts`), but a chart keeps its
  // selection flag because its hit-testing lives on the chart's own host element, so the
  // designer closes it here.
  const closeObjectSelection = (event: unknown, args?: SelectionChangedArgs): void => {
    const info = args?.byUser !== undefined ? args : (event as SelectionChangedArgs);
    if (info?.byUser !== true) return;
    for (const chart of chartsOf(info.sheet ?? activeSheet(d)).all()) if (chart.isSelected?.()) chart.isSelected(false);
  };
  try { d.getWorkbook().bind(events.SelectionChanged, closeObjectSelection); d._workbookHandlers.push([events.SelectionChanged, closeObjectSelection]); } catch { /* ignore */ }
  d.getWorkbook().bind(events.SelectionChanged, (args: SelectionChangedArgs) => {
    const painter = d._formatPainterStyle;
    // Trial (TASK 75 r3 probe): an API-driven selection change does NOT consume the
    // armed format painter — only a user interaction paints.
    if (painter && args?.byUser === true && !d._applyingPainter) {
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
