import React from 'react';
import type { DesignerApi as Designer } from '../designer-api.js';
import { resolveText } from '../resolve.js';

const icons: Record<number, string> = { 1: 'i', 2: '!', 3: '×' };

export function MessageBoxHost({ designer }: { designer: Designer }): React.ReactElement {
  const box = designer.messageBox!;
  const buttons = box.buttons;
  // TASK 87: OK/Cancel follow the resource tree (Yes/No are not part of it and stay as-is).
  const list = buttons === 3 ? [
    { text: 'Yes', result: 2, primary: true }, { text: 'No', result: 3 },
  ] : buttons === 1 ? [
    { text: '${res.ok}', result: 1, primary: true }, { text: '${res.cancel}', result: 4 },
  ] : buttons === 2 ? [
    { text: 'Yes', result: 2, primary: true }, { text: 'No', result: 3 }, { text: '${res.cancel}', result: 4 },
  ] : [{ text: '${res.ok}', result: 1, primary: true }];
  return (
    <div className="gc-designer-messagebox-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) designer.closeMessageBox(0); }}>
      <div className="gc-designer-messagebox gc-dialog" role="dialog" aria-modal="true" aria-label={box.title}>
        <div className="gc-messagebox-header">
          <div className={`gc-messagebox-icon gc-messagebox-icon-${box.icon}`}>{icons[box.icon] ?? 'i'}</div>
          <div className="gc-messagebox-title">{resolveText(box.title, designer.resources)}</div>
          <button className="gc-dialog-close" aria-label={resolveText('${res.close}', designer.resources) || 'Close'} onClick={() => designer.closeMessageBox(0)}>×</button>
        </div>
        <div className="gc-messagebox-text">{resolveText(box.text, designer.resources)}</div>
        <div className="gc-dialog-footer">
          {list.map((button) => (
            <button key={button.text} className={`gc-dialog-button${button.primary ? ' gc-dialog-button-primary' : ''}`} onClick={() => designer.closeMessageBox(button.result)}>{resolveText(button.text, designer.resources)}</button>
          ))}
        </div>
      </div>
    </div>
  );
}
