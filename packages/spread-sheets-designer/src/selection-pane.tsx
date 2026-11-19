import React, { useRef, useState } from 'react';
import { useDesigner, useDesignerVersion } from './store.js';
import { shapesOf, type Worksheet } from './core-internals.js';
import { type SelectableObject } from './app-helpers.js';

/* Selection Pane ------------------------------------------------------------ */

function SelectionEyeIcon({ visible }: { visible: boolean }): React.ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.1" aria-hidden="true">
      <path d="M1.6 8C3.1 5.4 5.3 4.1 8 4.1s4.9 1.3 6.4 3.9c-1.5 2.6-3.7 3.9-6.4 3.9S3.1 10.6 1.6 8Z" />
      <circle cx="8" cy="8" r="1.9" />
      {!visible && <path d="M2.4 13.6 13.6 2.4" strokeWidth="1.3" />}
    </svg>
  );
}

export function selectionItems(sheet: Worksheet): SelectableObject[] {
  try { return [...sheet.floatingObjects.all(), ...sheet.pictures.all(), ...shapesOf(sheet).all()]; } catch { return []; }
}

export function SelectionPanePanel(): React.ReactElement {
  const d = useDesigner();
  useDesignerVersion();
  const sheet = d.getWorkbook().getActiveSheet();
  const [renaming, setRenaming] = useState<string | null>(null);
  const cancelRename = useRef(false);
  const items = selectionItems(sheet);
  const rows = [...items].reverse(); // front-most first, like the official pane
  const deselectAll = (): void => { for (const item of items) if (item.isSelected()) item.isSelected(false); };
  const close = (): void => { d.executeSpecial('selectionPaneButton', null); };
  const toggleAll = (visible: boolean): void => {
    for (const item of items) if (item.isVisible() !== visible) item.isVisible(visible);
    d.invalidate();
  };
  const move = (item: SelectableObject, step: number): void => {
    if (!item.isSelected()) return;
    const name = String(item.name());
    const collection = sheet.pictures.get(name) ? sheet.pictures : sheet.floatingObjects;
    const index = Number(collection.zIndex(name)) - 700;
    const next = Math.max(0, Math.min(collection.all().length - 1, index + step));
    if (next === index) return;
    collection.zIndex(name, next);
    d.invalidate();
  };
  const commitRename = (item: SelectableObject, text: string): void => {
    cancelRename.current = false;
    setRenaming(null);
    const name = text.trim();
    if (name && name !== item.name()) {
      try { item.name(name); } catch { /* keep the old name on conflict */ }
    }
    d.invalidate();
  };
  return (
    <div className="gc-designer-panel gc-designer-selection-pane gc-designer-dock-panel" data-open="true">
      <div className="gc-designer-panel-dialog-close-button-container" title="Close" onClick={close}>
        <div className="gc-designer-panel-dialog-close-button-image">×</div>
      </div>
      <div className="gc-designer-selection-side-panel gc-designer-component-container">
        <div className="gc-designer-panel-title"><div className="gc-designer-text">Selection</div></div>
        <div className="gc-tab-selection-buttons gc-designer-component-container">
          <div className="gc-tab-selection-pane-show"><button type="button" className="gc-image-button" onClick={() => toggleAll(true)}><span className="button-text">Show All</span></button></div>
          <div className="gc-tab-selection-pane-hide"><button type="button" className="gc-image-button" onClick={() => toggleAll(false)}><span className="button-text">Hide All</span></button></div>
          <div className="gc-tab-selection-pane-up"><button type="button" className="gc-image-button" title="△" onClick={() => { for (const item of items) if (item.isSelected()) move(item, 1); }}><span className="button-text">△</span></button></div>
          <div className="gc-tab-selection-pane-down"><button type="button" className="gc-image-button" title="▽" onClick={() => { for (const item of items) if (item.isSelected()) move(item, -1); }}><span className="button-text">▽</span></button></div>
        </div>
        <div className="gc-designer-selection-panel">
          {rows.map((item) => {
            const name = String(item.name());
            const selected = !!item.isSelected();
            const visible = !!item.isVisible();
            return (
              <div key={name} className="gc-designer-selection-panel-container">
                <div
                  className={`gc-designer-shape-node${selected ? ' select' : ''}`}
                  onClick={() => { deselectAll(); item.isSelected(true); d.invalidate(); }}
                  onDoubleClick={() => { setRenaming(name); }}
                >
                  <div className="gc-designer-shape-node-collapse-button none" />
                  {renaming === name ? (
                    <input
                      className="gc-designer-shape-node-shape-name-edit"
                      autoFocus
                      defaultValue={name}
                      onClick={(event) => event.stopPropagation()}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') commitRename(item, (event.target as HTMLInputElement).value);
                        else if (event.key === 'Escape') { cancelRename.current = true; setRenaming(null); }
                      }}
                      onBlur={(event) => { if (cancelRename.current) { cancelRename.current = false; setRenaming(null); } else commitRename(item, event.target.value); }}
                    />
                  ) : (
                    <div className="gc-designer-shape-node-shape-name" title={name}>{name}</div>
                  )}
                  <div
                    className="gc-designer-shape-node-visible-button"
                    title={visible ? 'Hide' : 'Show'}
                    onClick={(event) => { event.stopPropagation(); item.isVisible(!visible); deselectAll(); d.invalidate(); }}
                  >
                    <SelectionEyeIcon visible={visible} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
