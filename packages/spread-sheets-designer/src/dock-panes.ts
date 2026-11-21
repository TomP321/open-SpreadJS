/**
 * TASK 77 — the shared right dock stack, reproducing the layout measured live on the running
 * trial (apps/designer-compare, probes under .probe/t77/run/): the Selection pane, the threaded
 * comments panel and the PivotTable field list dock in ONE stack —
 *  * one open pane: 315px flush right (640px compare frame: sheet host 325, grid viewport 263);
 *  * two or more open panes: the active pane keeps its 315px and a 39px vertical tab rail sits
 *    right of it (stack 354, sheet host 286, grid viewport 224); the rail stacks 40x40 tabs
 *    top-down, each carrying the pane's 20x20 icon, the active tab marked by a green left bar;
 *  * opening a pane makes it the visible one; closing the visible pane falls back to the
 *    previous pane of the stack; toggling a pane off removes its tab.
 * Before this layout each panel took its own dock slot, so two open panels crushed the sheet
 * viewport to zero (the root of the TASK 75 zoomSelection harness artifact).
 *
 * The helpers keep the mount order (`_dockPanes`) and the visible pane (`_dockActive`) on any
 * `DesignerApi`-shaped context and sync each pane's own open flag, so command routing, the
 * Designer class and the unit-test mocks all share one implementation.
 */
import type { DesignerApi as Designer, DockPane } from './designer-api.js';

/** Open/close a dock pane slot and move activation (open: newest visible; close: previous pane). */
export function setDockPane(d: Designer, pane: DockPane, open: boolean): void {
  const panes = (d._dockPanes ??= []);
  const at = panes.indexOf(pane);
  if (open) {
    if (at < 0) panes.push(pane);
    d._dockActive = pane;
  } else {
    if (at >= 0) panes.splice(at, 1);
    if (d._dockActive === pane) d._dockActive = panes[panes.length - 1] ?? null;
  }
  if (pane === 'threaded') d._showComments = open;
  if (pane === 'selection') d._selectionPaneOpen = open;
  if (pane === 'pivot') d._pivotFieldListOpen = open;
  d.invalidate();
}

/** True when `pane` is the visible pane of the dock stack. */
export function dockPaneVisible(d: Designer, pane: DockPane): boolean {
  return d._dockActive === pane && (d._dockPanes?.includes(pane) ?? false);
}

/** Show an already open pane (the tab-rail click). */
export function activateDockPane(d: Designer, pane: DockPane): void {
  if ((d._dockPanes?.includes(pane) ?? false) && d._dockActive !== pane) {
    d._dockActive = pane;
    d.invalidate();
  }
}

/** True while any dock pane is open (the stack container holds a visible pane). */
export function dockStackOpen(d: Designer): boolean {
  return (d._dockPanes?.length ?? 0) > 0;
}
