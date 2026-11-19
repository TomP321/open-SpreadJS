import React, { useState } from 'react';
import { useDesigner, useDesignerVersion } from './store.js';
import { selectionItems } from './selection-pane.js';

/* Formula Editor Panel -------------------------------------------------------- */

export function FormulaEditorPanel(): React.ReactElement {
  const d = useDesigner();
  useDesignerVersion();
  const sheet = d.getWorkbook().getActiveSheet();
  const info = d.getSelectionInfo();
  const objectSelected = selectionItems(sheet).some((item) => item.isSelected());
  const display = info.formula ? `=${info.formula}` : info.value == null ? '' : String(info.value);
  const key = `${String(sheet.name())}:${info.reference}`;
  const [text, setText] = useState(display);
  const [lastKey, setLastKey] = useState(key);
  if (lastKey !== key) { setLastKey(key); setText(display); }
  const commit = (): void => {
    if (text !== display) d.commitFormula(text);
  };
  return (
    <div className="gc-designer-formula-editor-panel gc-designer-dock-panel">
      <div className="gc-designer-formula-editor-panel-header">
        <span className="gc-designer-formula-editor-panel-title">Formula Editor</span>
        <span className="gc-designer-formula-editor-panel-cell">{info.reference}</span>
      </div>
      <textarea
        className="gc-designer-formula-editor-panel-input"
        value={text}
        disabled={objectSelected}
        spellCheck={false}
        onChange={(event) => setText(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); commit(); (event.target as HTMLTextAreaElement).blur(); }
          else if (event.key === 'Escape') { setText(display); (event.target as HTMLTextAreaElement).blur(); }
          event.stopPropagation();
        }}
      />
    </div>
  );
}
