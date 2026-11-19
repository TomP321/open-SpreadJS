/* TASK 68: the Find & Replace option section. The trial keeps the dialog
 * collapsed at 508 x 205, grows it when `Option >>` opens the Within / Search /
 * Look in combos with the four checkboxes, and shows the `N cell(s) found`
 * label plus the result list after `Find All`. */
import React from 'react';
import type { DialogData } from '../designer-api.js';
import { CustomSelect } from './custom-widgets.js';

/** `Option >>` / `Option <<` toggle of both tabs. */
export function FindOptionsToggle({ data, update }: { data: DialogData; update: (path: string | undefined, value: unknown) => void }): React.ReactElement {
  const open = !!data.optionsOpen;
  return (
    <div className="gc-find-options-row">
      <button type="button" className="gc-dialog-secondary gc-find-options-button" onClick={() => update('optionsOpen', !open)}>{open ? 'Option <<' : 'Option >>'}</button>
    </div>
  );
}

/** The options block; rendered only while open. Defaults match the trial:
 *  Within = WorkSheet, Search = By Rows, Look in = Formulas. */
export function FindOptions({ data, update }: { data: DialogData; update: (path: string | undefined, value: unknown) => void }): React.ReactElement | null {
  if (!data.optionsOpen) return null;
  const field = (path: string, label: string, items: [string, string][]): React.ReactElement => (
    <div className="gc-dialog-column-set gc-find-option-row" key={path}>
      <span className="gc-dialog-label">{label}</span>
      <CustomSelect className="gc-dialog-select gc-find-select" ariaLabel={label} value={String(data[path] ?? items[0][1])} options={items.map(([text, value]) => ({ text, value }))} onChange={(next) => update(path, String(next))} />
    </div>
  );
  const box = (path: string, label: string): React.ReactElement => (
    <label className="gc-dialog-checkbox" key={path}><input type="checkbox" checked={!!data[path]} onChange={(event) => update(path, event.target.checked)} /><span>{label}</span></label>
  );
  return <div className="gc-find-options">
    <div className="gc-find-options-col">
      {field('within', 'Within:', [['WorkSheet', 'sheet'], ['Workbook', 'workbook']])}
      {field('searchOrder', 'Search:', [['By Rows', 'rows'], ['By Columns', 'columns']])}
      <div className="gc-find-option-checks">{box('matchCase', 'Match case')}{box('matchExactly', 'Match exactly')}</div>
    </div>
    <div className="gc-find-options-col">
      {field('lookIn', 'Look in:', [['Values', 'values'], ['Formulas', 'formulas']])}
      <div className="gc-find-option-checks">{box('useWildcards', 'Use wildcards')}{box('ignoreHidden', 'Ignore Hidden')}</div>
    </div>
  </div>;
}

/** The `N cell(s) found` line plus the result list, shown after `Find All`. */
export function FindResultsSection({ data }: { data: DialogData }): React.ReactElement | null {
  if (data.resultsShown !== true) return null;
  const rows = (data.results as { sheet: string; cell: string; value: string }[]) ?? [];
  return <div className="gc-find-results-section">
    <div className="gc-find-results-label">{String(data.resultsLabel ?? '')}</div>
    <div className="gc-find-results" role="table" aria-label="Search results">
      {rows.map((row, index) => (
        <div className="gc-find-result-row" role="row" key={index}>
          <span role="cell">{row.sheet}</span><span role="cell">{row.cell}</span><span role="cell">{row.value}</span>
        </div>
      ))}
    </div>
  </div>;
}
