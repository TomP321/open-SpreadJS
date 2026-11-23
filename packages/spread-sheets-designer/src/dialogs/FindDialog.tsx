/* TASK 68: the Find & Replace option section. The trial keeps the dialog
 * collapsed at 508 x 205, grows it when `Option >>` opens the Within / Search /
 * Look in combos with the four checkboxes, and shows the `N cell(s) found`
 * label plus the result list after `Find All`.
 * TASK 87: every label that exists in the resource tree (`findDialog.*`) is
 * resolved through the designer resources, so a language package (e.g. Italian)
 * loaded before designer creation localises the dialog. */
import React from 'react';
import type { DesignerApi as Designer, DialogData } from '../designer-api.js';
import { resolveText, getResources } from '../resolve.js';
import { CustomSelect } from './custom-widgets.js';

/** `Option >>` / `Option <<` toggle of both tabs. */
export function FindOptionsToggle({ data, update, designer }: { data: DialogData; update: (path: string | undefined, value: unknown) => void; designer?: Designer }): React.ReactElement {
  const open = !!data.optionsOpen;
  const option = (designer ? resolveText('${res.findDialog.option}', designer.resources) : '') || 'Option';
  return (
    <div className="gc-find-options-row">
      <button type="button" className="gc-dialog-secondary gc-find-options-button" onClick={() => update('optionsOpen', !open)}>{open ? `${option} <<` : `${option} >>`}</button>
    </div>
  );
}

/** The options block; rendered only while open. Defaults match the trial:
 *  Within = WorkSheet, Search = By Rows, Look in = Formulas. */
export function FindOptions({ data, update, designer }: { data: DialogData; update: (path: string | undefined, value: unknown) => void; designer?: Designer }): React.ReactElement | null {
  if (!data.optionsOpen) return null;
  const res = designer?.resources;
  const t = (key: string, fallback: string): string => (res ? resolveText(`\${res.findDialog.${key}}`, res) : '') || fallback;
  const field = (path: string, labelKey: string, labelFallback: string, items: [string, string][]): React.ReactElement => (
    <div className="gc-dialog-column-set gc-find-option-row" key={path}>
      <span className="gc-dialog-label">{t(labelKey, labelFallback)}</span>
      <CustomSelect className="gc-dialog-select gc-find-select" ariaLabel={t(labelKey, labelFallback)} value={String(data[path] ?? items[0][1])} options={items.map(([text, value]) => ({ text, value }))} onChange={(next) => update(path, String(next))} />
    </div>
  );
  const box = (path: string, label: string): React.ReactElement => (
    <label className="gc-dialog-checkbox" key={path}><input type="checkbox" checked={!!data[path]} onChange={(event) => update(path, event.target.checked)} /><span>{label}</span></label>
  );
  return <div className="gc-find-options">
    <div className="gc-find-options-col">
      {field('within', 'within', 'Within:', [[t('workSheet', 'WorkSheet'), 'sheet'], [t('workBook', 'Workbook'), 'workbook']])}
      {field('searchOrder', 'search', 'Search:', [[t('byRows', 'By Rows'), 'rows'], [t('byColumns', 'By Columns'), 'columns']])}
      <div className="gc-find-option-checks">{box('matchCase', t('matchcase', 'Match case'))}{box('matchExactly', t('matchexactly', 'Match exactly'))}</div>
    </div>
    <div className="gc-find-options-col">
      {field('lookIn', 'lookin', 'Look in:', [[t('values', 'Values'), 'values'], [t('formula', 'Formulas'), 'formulas']])}
      <div className="gc-find-option-checks">{box('useWildcards', t('usewildcards', 'Use wildcards'))}{box('ignoreHidden', t('ignoreHidden', 'Ignore Hidden'))}</div>
    </div>
  </div>;
}

/** The `N cell(s) found` line plus the result list, shown after `Find All`. */
export function FindResultsSection({ data }: { data: DialogData }): React.ReactElement | null {
  if (data.resultsShown !== true) return null;
  const rows = (data.results as { sheet: string; cell: string; value: string }[]) ?? [];
  return <div className="gc-find-results-section">
    <div className="gc-find-results-label">{String(data.resultsLabel ?? '')}</div>
    <div className="gc-find-results" role="table" aria-label={resolveText('${res.dialogs.searchResults}', getResources()) || 'Search results'}>
      {rows.map((row, index) => (
        <div className="gc-find-result-row" role="row" key={index}>
          <span role="cell">{row.sheet}</span><span role="cell">{row.cell}</span><span role="cell">{row.value}</span>
        </div>
      ))}
    </div>
  </div>;
}
