/*
 * Dialog bodies for the Formulas tab's function dialogs.
 *
 * Follows the running v19 trial: the Insert Function dialog offers
 * `Search for a function:`, `Function Category:` and `Function List:` galleries
 * plus the signature and description of the selected function; choosing one
 * opens `Function Arguments`, which edits one row per parameter, previews
 * `Formula = NAME(...)` and writes the formula into the active cell on OK.
 */
import React, { useEffect, useMemo, useState } from 'react';
import type { DesignerApi as Designer } from '../designer-api.js';
import {
  allCategory, categoryList, dialogCategories, functionArgumentRows, functionDescription,
  functionSignature, recommendedCategory,
} from '../function-library.js';

export interface FunctionDialogData {
  /** Active gallery of the Insert Function dialog. */
  category?: string;
  search?: string;
  /** Selected function name. */
  function?: string;
  /** Function Arguments rows, one entry per parameter. */
  args?: string[];
}

/** The trial keeps a leading `=` in every argument field. */
function fieldText(raw: unknown): string {
  const text = String(raw ?? '');
  return text.startsWith('=') ? text : `=${text}`;
}

/** Preview line: filled arguments only, without the fields' `=` prefixes. */
function preview(name: string, args: string[]): string {
  const values = args.map((value) => String(value ?? '').replace(/^=/, '').trim()).filter((value) => value.length > 0);
  return `Formula = ${name}(${values.join(',')})`;
}

export function InsertFunctionBody({ designer, data, update }: {
  designer: Designer;
  data: FunctionDialogData;
  update: (path: string | undefined, value: unknown) => void;
}): React.ReactElement {
  const search = String(data.search ?? '');
  const categories = dialogCategories(search);
  const category = categories.includes(String(data.category)) ? String(data.category) : categories[0];
  const names = useMemo(() => categoryList(category, search), [category, search]);
  const selected = names.includes(String(data.function)) ? String(data.function) : names[0] ?? '';
  const signature = selected ? functionSignature(selected) : '';
  const select = (name: string): void => { update('function', name); };
  return (
    <div className="gc-insert-function">
      <div className="gc-insert-function-label">Search for a function:</div>
      <div className="gc-function-search">
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><circle cx="7" cy="7" r="4.4" fill="none" stroke="currentColor" /><path d="m10.4 10.4 3.2 3.2" stroke="currentColor" fill="none" /></svg>
        <input
          className="gc-dialog-input gc-function-search-input"
          aria-label="Search for a function:"
          value={search}
          onChange={(event) => {
            const next = event.target.value;
            update('search', next);
            update('category', next ? recommendedCategory : allCategory);
            const found = categoryList(next ? recommendedCategory : allCategory, next);
            if (found.length) update('function', found[0]);
          }}
        />
        {search ? <button type="button" className="gc-function-search-clear" aria-label="Clear" title="Clear" onClick={() => { update('search', ''); update('category', allCategory); const found = categoryList(allCategory, ''); if (found.length) update('function', found[0]); }}>×</button> : null}
      </div>
      <div className="gc-function-galleries">
        <div className="gc-function-gallery">
          <div className="gc-insert-function-label">Function Category:</div>
          <div className="gc-dialog-list gc-function-category-list" role="listbox" aria-label="Function Category:">
            {categories.map((name) => (
              <div key={name} role="option" aria-selected={name === category} className={`gc-dialog-list-item${name === category ? ' selected' : ''}`}
                onClick={() => {
                  update('category', name);
                  const first = categoryList(name, search)[0];
                  if (first) select(first);
                }}>{name}</div>
            ))}
          </div>
        </div>
        <div className="gc-function-gallery">
          <div className="gc-insert-function-label">Function List:</div>
          <div className="gc-dialog-list gc-function-name-list" role="listbox" aria-label="Function List:">
            {names.map((name) => (
              <div key={name} role="option" aria-selected={name === selected} className={`gc-dialog-list-item${name === selected ? ' selected' : ''}`}
                onClick={() => select(name)} onDoubleClick={() => designer.openFunctionArguments(name)}>{name}</div>
            ))}
          </div>
        </div>
      </div>
      <div className="gc-function-detail">
        <div className="gc-function-signature">{signature}</div>
        <div className="gc-function-description">{selected ? functionDescription(selected) : ''}</div>
      </div>
    </div>
  );
}

export function FunctionArgumentsBody({ designer, data, update }: {
  designer: Designer;
  data: FunctionDialogData;
  update: (path: string | undefined, value: unknown) => void;
}): React.ReactElement {
  const name = String(data.function ?? '');
  const parameters = useMemo(() => functionArgumentRows(name), [name]);
  const args = useMemo(() => parameters.map((_, index) => String((data.args ?? [])[index] ?? '')), [parameters, data.args]);
  const [picking, setPicking] = useState(-1);
  useEffect(() => {
    designer.functionArgumentPicker(picking, (address) => update('args', args.map((value, index) => (index === picking ? `=${address}` : value))));
    return () => designer.functionArgumentPicker(-1, () => undefined);
    // The picker follows the armed row and reads `args` through this closure, so
    // it is re-armed whenever the row or the dialog data changes.
  }, [picking, designer, args, update]);
  const setArg = (index: number, value: string): void => update('args', args.map((current, at) => (at === index ? value : current)));
  return (
    <div className="gc-function-arguments">
      <div className="gc-function-arguments-name">{name}</div>
      <div className="function-arguments-container">
        {parameters.map((parameter, index) => (
          <div key={`${parameter}-${index}`} className="parameter-container">
            <div className="parameter-name">{parameter}</div>
            <div className="gc-range-select">
              <span className="range-select-container">
                <input className="range-input" aria-label={`${parameter}:`} value={fieldText(args[index])}
                  onFocus={() => setPicking(index)} onChange={(event) => setArg(index, event.target.value)} />
              </span>
              <div role="button" tabIndex={0} className={`range-select-button${picking === index ? ' active' : ''}`} title="Select a range in the sheet"
                aria-label={parameter} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setPicking(picking === index ? -1 : index); } }}
                onClick={() => setPicking(picking === index ? -1 : index)}><span /></div>
            </div>
          </div>
        ))}
      </div>
      <div className="gc-function-description">{functionDescription(name)}</div>
      <fieldset className="gc-designer-labelLine"><legend className="gc-designer-labelLine-text" /></fieldset>
      <div className="gc-function-preview-formula">{preview(name, args)}</div>
    </div>
  );
}
