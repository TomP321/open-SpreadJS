import React, { useEffect, useRef } from 'react';
import { useDesigner } from './store.js';
import { internals, shapesOf, type DesignerShape } from './core-internals.js';
import { hostElementsOf, type HostableObject } from './app-helpers.js';

/* Sheet + status --------------------------------------------------------- */

export function SheetArea(): React.ReactElement {
  const d = useDesigner();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const target = ref.current;
    if (!target) return;
    if (d.sheetHost.parentElement !== target) target.appendChild(d.sheetHost);
  }, [d]);
  const onContextMenu = (event: React.MouseEvent): void => {
    if (!d.getWorkbook().options.allowContextMenu) return;
    // Right-click directly on a shape/picture opens the object menu (like the trial).
    const target = event.target as HTMLElement;
    const objectElement = target.closest('.opensheets-floating-object');
    if (objectElement) {
      const sheet = d.getWorkbook().getActiveSheet();
      const all: HostableObject[] = [...sheet.floatingObjects.all(), ...sheet.pictures.all(), ...shapesOf(sheet).all(), ...sheet.charts.all()];
      const item = all.find(obj => hostElementsOf(obj).includes(objectElement as HTMLElement));
      if (item) {
        event.preventDefault();
        const chartItems = sheet.charts.all();
        d.contextMenu = { x: event.clientX, y: event.clientY, kind: chartItems.includes(item as never) ? 'chart' : 'shape', row: 0, col: 0, objectName: String(item.name()) };
        d.openMenu = null;
        d.invalidate();
        return;
      }
    }
    event.preventDefault();
    const host = d.sheetHost.getBoundingClientRect();
    const x = event.clientX - host.left;
    const y = event.clientY - host.top;
    const sheet = d.getWorkbook().getActiveSheet();
    const view = internals(sheet)._view?.();
    let kind: 'cell' | 'row' | 'col' | 'corner' | 'tab' = 'cell';
    let row = sheet.getActiveRowIndex();
    let col = sheet.getActiveColumnIndex();
    if (view && typeof view.hitTest === 'function') {
      const hit = view.hitTest(x, y);
      if (hit) {
        row = hit.row;
        col = hit.col;
        if (y >= (view.viewHeight as number)) kind = 'tab';
        else if (row < 0 && col < 0) kind = 'corner';
        else if (row < 0) kind = 'col';
        else if (col < 0) kind = 'row';
      } else if (y >= (view.viewHeight ?? 0)) kind = 'tab';
    }
    if (kind === 'cell' && row >= 0 && col >= 0) { sheet.setActiveCell(row, col); sheet.setSelection(row, col, 1, 1); }
    else if (kind === 'row' && row >= 0) sheet.setSelection(row, -1, 1, -1);
    else if (kind === 'col' && col >= 0) sheet.setSelection(-1, col, -1, 1);
    d.contextMenu = { x: event.clientX, y: event.clientY, kind, row, col };
    d.openMenu = null;
    d.invalidate();
  };
  const onDoubleClick = (event: React.MouseEvent): void => {
    // Double-click on a shape opens the inline text editor, as in the trial.
    const objectElement = (event.target as HTMLElement).closest('.opensheets-floating-object');
    if (!objectElement) return;
    const sheet = d.getWorkbook().getActiveSheet();
    const all: HostableObject[] = [...sheet.floatingObjects.all(), ...sheet.pictures.all(), ...shapesOf(sheet).all()];
    const item = all.find(obj => obj.getHost().includes(objectElement as HTMLElement));
    if (item && (item.typeName === '0' || shapesOf(sheet).all().includes(item as DesignerShape))) {
      all.forEach(obj => obj.isSelected(obj === item));
      d._formatShapePanel = String(item.name());
      d.invalidate();
    }
  };
  return <div className="gc-designer-sheet-area" ref={ref} onContextMenu={onContextMenu} onDoubleClick={onDoubleClick} />;
}
