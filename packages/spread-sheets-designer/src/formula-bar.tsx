import React, { useEffect, useRef, useState } from 'react';
import { useDesigner, useDesignerVersion } from './store.js';
import { shapesOf } from './core-internals.js';
import { columnName } from './app-helpers.js';
import { definedNames } from './defined-names.js';
import { applySelection, resolveReference } from './dialogs/GoToDialogs.js';

/* Formula bar ------------------------------------------------------------ */

export function FormulaBar(): React.ReactElement {
  const d = useDesigner();
  useDesignerVersion();
  const sheet = d.getWorkbook().getActiveSheet();
  const { row, col } = { row: Math.max(0, sheet.getActiveRowIndex()), col: Math.max(0, sheet.getActiveColumnIndex()) };
  const reference = `${columnName(col)}${row + 1}`;
  // The trial shows the clicked name in the name box until the active cell moves.
  const tracked = d.getNameBoxSelection?.();
  const trackedName = tracked && tracked.row === row && tracked.col === col ? tracked.name : undefined;
  // When a shape/picture/camera is selected the name box shows its display name (trial behavior).
  const selected = shapesOf(sheet).all().filter((shape) => shape.isSelected());
  const displayName = selected.length === 1 ? String(selected[0].name()) : selected.length > 1 ? `${selected.length} Shapes` : trackedName ?? reference;
  const formula = sheet.getFormula(row, col) ?? (sheet.getValue(row, col) == null ? '' : String(sheet.getValue(row, col)));
  const [nameValue, setNameValue] = useState(displayName);
  const [formulaValue, setFormulaValue] = useState(formula);
  const [editing, setEditing] = useState(false);
  const [namesOpen, setNamesOpen] = useState(false);
  const [namesAnchor, setNamesAnchor] = useState<{ left: number; top: number; width: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const insertionNonce = useRef(0);
  const lastRef = useRef(`${reference}:${row}:${col}:${displayName}`);
  useEffect(() => {
    const key = `${reference}:${row}:${col}:${displayName}`;
    if (lastRef.current !== key) {
      lastRef.current = key;
      setNameValue(displayName);
      if (!editing) setFormulaValue(formula);
    }
  }, [reference, displayName, row, col, formula, editing]);
  useEffect(() => {
    if (!namesOpen) return;
    const onDown = (event: MouseEvent): void => {
      if ((event.target as HTMLElement | null)?.closest?.('.gc-designer-formula-bar-nameBox')) return;
      setNamesOpen(false);
    };
    document.addEventListener('mousedown', onDown, true);
    return () => document.removeEventListener('mousedown', onDown, true);
  }, [namesOpen]);
  useEffect(() => {
    const insertion = d._formulaInsertion;
    if (insertion && insertion.nonce !== insertionNonce.current) {
      insertionNonce.current = insertion.nonce;
      setFormulaValue(insertion.text);
      setEditing(true);
      requestAnimationFrame(() => { inputRef.current?.focus(); inputRef.current?.setSelectionRange(insertion.text.length, insertion.text.length); });
    }
  }, [d, d.getVersion()]);
  return (
    <div className="gc-designer-panel-container-vertical gc-designer-formula-panel">
      <div className="gc-designer-panel">
        <div className="gc-designer-resize-container">
          <div className="gc-designer-formula-bar">
            <div className="gc-designer-formula-bar-nameBox">
              <input
                className="gc-name-box-selector"
                value={nameValue}
                aria-label="Name Box"
                onChange={(event) => setNameValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') { d.commitReference(nameValue); event.currentTarget.blur(); }
                  if (event.key === 'Escape') setNameValue(displayName);
                }}
              />
              <div className="gc-designer-namebox-arrow" role="button" aria-label="Name Box Dropdown" aria-expanded={namesOpen}
                onClick={(event) => {
                  const box = (event.currentTarget as HTMLElement).closest('.gc-designer-formula-bar-nameBox')?.getBoundingClientRect() ?? event.currentTarget.getBoundingClientRect();
                  setNamesAnchor({ left: box.left, top: box.bottom + 1, width: box.width });
                  setNamesOpen((open) => !open);
                }}><div className="gc-designer-ribbon-list-triangle" /></div>
              {namesOpen && (() => {
                const names = definedNames(d.getWorkbook()).filter((entry) => entry.scope === 'Workbook' || entry.scope === sheet.name());
                const anchor = namesAnchor ?? { left: 8, top: 168, width: 110 };
                return (
                  <div className="gc-name-box-dropdown" role="listbox" aria-label="Name Box Dropdown" style={{ left: anchor.left, top: anchor.top, minWidth: anchor.width }}>
                    {names.length ? names.map((entry) => (
                      <div key={entry.id} role="option" className="gc-name-box-dropdown-item" onClick={() => {
                        setNamesOpen(false);
                        const resolved = resolveReference(d, entry.name);
                        if (!resolved) return;
                        applySelection(d, resolved.sheet, [resolved.bounds], resolved.bounds);
                        d.setNameBoxSelection(entry.name, resolved.bounds.row, resolved.bounds.col);
                        d.invalidate();
                      }}>{entry.name}</div>
                    )) : <div className="gc-name-box-dropdown-empty">There are no names defined.</div>}
                  </div>
                );
              })()}
            </div>
            <span className="gc-designer-formula-bar-splitter" aria-hidden="true"><i /><i /><i /></span>
            <div className="gc-designer-formula-bar-button-group">
              <button className="gc-designer-formula-button cancel" aria-label="Cancel" title="Cancel" onClick={() => { setFormulaValue(formula); setEditing(false); }}>×</button>
              <button className="gc-designer-formula-button commit" aria-label="Enter" title="Enter" onClick={() => { d.commitFormula(formulaValue); setEditing(false); }}>✓</button>
              <button className="gc-designer-formula-button fx" aria-label="Insert Function" title="Insert Function" onClick={() => d.showInsertFunction()}>fx</button>
            </div>
            <div className="gc-designer-formula-bar-text-box">
              <input
                className="gc-designer-formula-input"
                ref={inputRef}
                value={formulaValue}
                aria-label="Formula Bar"
                onFocus={() => setEditing(true)}
                onChange={(event) => setFormulaValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') { d.commitFormula(formulaValue); setEditing(false); event.currentTarget.blur(); }
                  if (event.key === 'Escape') { setFormulaValue(formula); setEditing(false); }
                }}
                onBlur={() => { if (editing) setEditing(false); }}
              />
            </div>
          </div>
          <div className="gc-designer-resize-container-vertical-handle gc-designer-resize-container-bottom-handle" />
        </div>
      </div>
    </div>
  );
}
