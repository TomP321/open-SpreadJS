import React from 'react';
import { useDesigner, useDesignerVersion } from './store.js';

export function StatusBar(): React.ReactElement {
  const d = useDesigner();
  useDesignerVersion();
  const sheet = d.getWorkbook().getActiveSheet();
  const ranges = sheet.getSelections();
  let sum = 0, count = 0, numeric = 0, cells = 0;
  for (const range of ranges) {
    const r = Math.max(0, range.row), c = Math.max(0, range.col);
    const rc = range.rowCount < 0 ? sheet.getRowCount() : range.rowCount;
    const cc = range.colCount < 0 ? sheet.getColumnCount() : range.colCount;
    cells += rc * cc;
    for (let row = r; row < r + rc; row++) for (let col = c; col < c + cc; col++) {
      const value = sheet.getValue(row, col);
      if (typeof value === 'number') { numeric++; sum += value; count++; }
      else if (value != null && value !== '') count++;
    }
  }
  const showStats = cells > 1;
  const zoom = Math.round((sheet.zoom?.() ?? 1) * 100);
  const setZoom = (value: number): void => { sheet.zoom(Math.min(4, Math.max(0.1, value))); d.invalidate(); };
  const sliderX = 62;
  return (
    <div className="gc-designer-panel-container-vertical gc-designer-status-panel">
      <div className="gc-designer-panel">
        <div className="gc-designer-resize-container">
          <div className="gc-designer-statusbar gc-statusBar">
            <div className="gc-statusbar">
              <div className="gc-statusbar-statusitem-container gc-statusbar-ready" title="In Ready mode"><span>Ready</span></div>
              {showStats && (
                <div className="gc-statusbar-stats">
                  {numeric > 0 && <span>Sum: {sum}</span>}
                  <span>Count: {count}</span>
                  {numeric > 0 && <span>Average: {count ? sum / count : 0}</span>}
                </div>
              )}
              <div className="gc-statusbar-statusitem-container gc-statusbar-zoom-value" title="Zoom level"><span className="gc-statusbar-zoom-panel">{zoom}%</span></div>
              <div className="gc-statusbar-zoom-group">
                <div className="gc-statusbar-slider-btn-container" title="Zoom Out" onClick={() => setZoom((sheet.zoom?.() ?? 1) - 0.1)}>
                  <div className="gc-statusbar-slider-btn gc-statusbar-slider-out" title="Zoom Out" />
                </div>
                <div className="gc-statusbar-slider-back" title="Zoom" onClick={(event) => {
                  const rect = event.currentTarget.getBoundingClientRect();
                  const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
                  setZoom(0.1 + ratio * 0.9);
                }}>
                  <div className="gc-statusbar-slider-middle-line" style={{ top: 8, left: 61 }} />
                  <div className="gc-statusbar-slider-progress" />
                  <div className="gc-statusbar-slider-drag-bar" style={{ top: 7, left: sliderX }} />
                </div>
                <div className="gc-statusbar-slider-btn-container" title="Zoom In" onClick={() => setZoom((sheet.zoom?.() ?? 1) + 0.1)}>
                  <div className="gc-statusbar-slider-btn gc-statusbar-slider-in" title="Zoom In" />
                </div>
              </div>
              <div className="gc-statusbar-menu-host" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
