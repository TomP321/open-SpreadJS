/**
 * TASK 77 — the shared right dock stack (Selection pane / threaded comments panel / pivot field
 * list). Semantics measured live on the running trial (apps/designer-compare, server 5188;
 * evidence .probe/t77/run/t77-dock.json): with the threaded comments panel open, opening the
 * Selection pane keeps the grid viewport at 224 (315px visible pane + 39px tab rail on the
 * 640px frame); closing the visible pane falls back to the previous pane; a pane toggled off
 * loses its tab; the trial never lets the panels crush the sheet viewport — before this layout
 * two open panels took separate dock slots and drove our viewport negative (the TASK 75
 * zoomSelection harness artifact).
 */
// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it } from 'vitest';
import { executeDesignerSpecial } from '../src/designer-commands.js';
import { activateDockPane, dockPaneVisible, dockStackOpen, setDockPane } from '../src/dock-panes.js';

function mockDesigner(): any {
  return {
    invalidate: () => undefined,
    _dockPanes: [],
    _dockActive: null,
    _selectionPaneOpen: false,
    _showComments: false,
    _pivotFieldListOpen: false,
  };
}

describe('TASK 77 dock stack state (trial-measured open/close/fallback semantics)', () => {
  let d: any;
  beforeEach(() => { d = mockDesigner(); });

  it('the ribbon commands open their pane into the stack and make it the visible one', () => {
    expect(executeDesignerSpecial(d, 'selectionPaneButton', undefined)).toBe(true);
    expect(d._dockPanes).toEqual(['selection']);
    expect(d._dockActive).toBe('selection');
    expect(d._selectionPaneOpen).toBe(true);
    expect(dockPaneVisible(d, 'selection')).toBe(true);

    expect(executeDesignerSpecial(d, 'ShowThreadedComments', undefined)).toBe(true);
    expect(d._dockPanes).toEqual(['selection', 'threaded']); // mount order preserved
    expect(d._dockActive).toBe('threaded'); // the newest open pane is visible (trial)
    expect(d._showComments).toBe(true);
    expect(dockPaneVisible(d, 'selection')).toBe(false); // tabbed, not visible
    expect(d._selectionPaneOpen).toBe(true); // still open (trial keeps its tab)
  });

  it('closing the visible pane falls back to the previous pane of the stack (trial-measured)', () => {
    executeDesignerSpecial(d, 'ShowThreadedComments', undefined);
    executeDesignerSpecial(d, 'selectionPaneButton', undefined);
    expect(d._dockActive).toBe('selection');
    executeDesignerSpecial(d, 'selectionPaneButton', undefined); // toggle off
    expect(d._dockPanes).toEqual(['threaded']);
    expect(d._dockActive).toBe('threaded');
    expect(dockStackOpen(d)).toBe(true);
    executeDesignerSpecial(d, 'ShowThreadedComments', undefined); // toggle off
    expect(d._dockPanes).toEqual([]);
    expect(d._dockActive).toBe(null);
    expect(dockStackOpen(d)).toBe(false);
  });

  it('a tab-rail click activates an open pane; an unknown pane is inert', () => {
    setDockPane(d, 'threaded', true);
    setDockPane(d, 'selection', true);
    activateDockPane(d, 'threaded');
    expect(d._dockActive).toBe('threaded');
    expect(dockPaneVisible(d, 'selection')).toBe(false);
    expect(d._selectionPaneOpen).toBe(true); // hidden, still mounted
    activateDockPane(d, 'pivot'); // not open: no change
    expect(d._dockActive).toBe('threaded');
    expect(d._dockPanes).toEqual(['threaded', 'selection']);
  });

  it('the pivot field list joins the stack and its command flag stays in sync', () => {
    setDockPane(d, 'pivot', true);
    d._pivotFieldListMounted = true;
    expect(d._dockPanes).toEqual(['pivot']);
    expect(d._pivotFieldListOpen).toBe(true);
    setDockPane(d, 'selection', true);
    expect(dockPaneVisible(d, 'pivot')).toBe(false);
    setDockPane(d, 'pivot', false);
    expect(d._pivotFieldListOpen).toBe(false);
    expect(d._dockPanes).toEqual(['selection']);
    expect(d._dockActive).toBe('selection');
  });

  it('works on a context without the fields initialized (sweep mocks)', () => {
    const bare: any = { invalidate: () => undefined };
    setDockPane(bare, 'selection', true);
    expect(bare._dockPanes).toEqual(['selection']);
    expect(bare._selectionPaneOpen).toBe(true);
    expect(dockStackOpen(bare)).toBe(true);
  });
});
