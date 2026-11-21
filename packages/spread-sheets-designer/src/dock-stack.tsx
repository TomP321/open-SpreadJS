/**
 * TASK 77 — the shared right dock stack (see `dock-panes.ts` for the measured semantics):
 * the visible pane (315px) plus a 39px tab rail of the open panes when two or more are mounted.
 * The rail reproduces the trial's `dv-stack` markup: 40x40 tabs top-down, each holding the pane's
 * 20x20 icon (our own vectors from `icons.tsx`), the visible pane's tab carrying the green left bar.
 */
import React from 'react';
import { useDesigner, useDesignerVersion } from './store.js';
import { DesignerIcon } from './icons.js';
import { ThreadedCommentPanel } from './threaded-comments.js';
import { SelectionPanePanel } from './selection-pane.js';
import { PivotFieldListPanel } from './pivot-panel.js';
import { activateDockPane, dockPaneVisible } from './dock-panes.js';
import type { DockPane } from './designer-api.js';

const TAB_ICON: Record<DockPane, string> = {
  threaded: 'ribbon-button-review-showThreadedComments',
  selection: 'gc-designer-selection-pane-ribbon',
  pivot: 'ribbon-button-pivot-table-field-list',
};

export function DockStack(): React.ReactElement | null {
  const d = useDesigner();
  useDesignerVersion();
  const panes = d._dockPanes ?? [];
  if (!panes.length && !d.pivotFieldListMounted) return null;
  return (
    <div className="gc-designer-dv-stack-container gc-designer-component-container">
      {d.pivotFieldListMounted && <PivotFieldListPanel />}
      {dockPaneVisible(d, 'threaded') && <ThreadedCommentPanel />}
      {dockPaneVisible(d, 'selection') && <SelectionPanePanel />}
      {panes.length > 1 && (
        <div className="gc-designer-dv-stack-tab-container">
          {panes.map((pane) => (
            <div
              key={pane}
              className={`gc-designer-dv-stack-tab${dockPaneVisible(d, pane) ? ' gc-designer-dv-stack-tab-selected' : ''}`}
              onClick={() => activateDockPane(d, pane)}
            >
              <div className={`gc-designer-dv-stack-icon ${TAB_ICON[pane]}`}>
                <DesignerIcon className={TAB_ICON[pane]} size={20} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
