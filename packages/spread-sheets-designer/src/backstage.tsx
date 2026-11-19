import React, { useState } from 'react';
import { useDesigner } from './store.js';
import { DesignerIcon } from './icons.js';

/* Backstage -------------------------------------------------------------- */

export function Backstage(): React.ReactElement {
  const d = useDesigner();
  const [category, setCategory] = useState('New');
  const close = (): void => { d.fileMenuOpen = false; d.invalidate(); };
  const items: { group: string[] }[] = [
    { group: ['New'] },
    { group: ['Open', 'Save'] },
    { group: ['Import', 'Export'] },
    { group: ['Print'] },
    { group: ['Info'] },
  ];
  return (
    <div className="gc-designer-panel gc-designer-backstage" role="dialog" aria-label="File">
      <div className="gc-designer-backstage-menu">
        <div className="gc-designer-backstage-back" role="button" aria-label="Back" onClick={close}>
          <div className="gc-designer-backstage-back-icon"><DesignerIcon className="file-menu-back" size={40} /></div>
        </div>
        {items.map((group, index) => (
          <React.Fragment key={index}>
            <div className="gc-designer-backstage-items">
              {group.group.map((name) => (
                <div
                  key={name}
                  role="menuitemradio"
                  aria-checked={category === name}
                  className={`gc-designer-backstage-item${category === name ? ' selected' : ''}`}
                  onClick={() => setCategory(name)}
                >
                  {name}
                </div>
              ))}
            </div>
            {index < items.length - 1 && <div className="gc-designer-backstage-separator"><fieldset><legend /></fieldset></div>}
          </React.Fragment>
        ))}
      </div>
      <div className="gc-designer-backstage-content">
        {category === 'New' ? (
          <div>
            <div className="gc-designer-backstage-title">New</div>
            <div className="gc-designer-backstage-new-list">
              <div className="gc-designer-new-template" role="button" onClick={() => { d.newWorkbook(); }}>
                <div className="gc-designer-new-thumb">
                  <div className="gc-designer-mini-sheet">
                    <div className="gc-designer-mini-corner" />
                    {['A', 'B', 'C'].map((letter) => <div key={letter} className="gc-designer-mini-col">{letter}</div>)}
                    {Array.from({ length: 7 }, (_, row) => (
                      <React.Fragment key={row}>
                        <div className="gc-designer-mini-row">{row + 1}</div>
                        {[0, 1, 2].map((col) => <div key={col} className={`gc-designer-mini-cell${row === 0 && col === 0 ? ' selected' : ''}`} />)}
                      </React.Fragment>
                    ))}
                  </div>
                </div>
                <label>Blank</label>
              </div>
            </div>
          </div>
        ) : (
          <div>
            <div className="gc-designer-backstage-title">{category}</div>
            <div className="gc-designer-backstage-info">
              {category === 'Open' && <button className="gc-designer-backstage-action" onClick={() => void d.openFile()}>Open a SpreadJS file...</button>}
              {category === 'Save' && <button className="gc-designer-backstage-action" onClick={() => d.saveFile(false)}>Save this workbook...</button>}
              {category === 'Save' && <button className="gc-designer-backstage-action" onClick={() => d.saveAs()}>Save a copy...</button>}
              {category === 'Import' && <button className="gc-designer-backstage-action" onClick={() => d.showMessageBox('Excel, CSV and PDF import need the IO plugin and are planned for a later milestone.', 'Import', 1)}>Import Excel/CSV...</button>}
              {category === 'Export' && <button className="gc-designer-backstage-action" onClick={() => d.showMessageBox('Excel, CSV and PDF export need the IO/print plugins and are planned for a later milestone.', 'Export', 1)}>Export Excel/CSV/PDF...</button>}
              {category === 'Print' && <button className="gc-designer-backstage-action" onClick={() => d.print()}>Print...</button>}
              {category === 'Info' && <div className="gc-designer-backstage-info-text">OpenSheets Designer<br />Drop-in compatible SpreadJS Designer foundation.</div>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
