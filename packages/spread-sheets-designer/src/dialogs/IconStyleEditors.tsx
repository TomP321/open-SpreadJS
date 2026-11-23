/*
 * Small editors for the option objects that the Settings dialogs reach through
 * their `Manage …` buttons: the workbook's built-in file icons
 * (`options.builtInFileIcons`) and the sheet-tab state styles
 * (`options.defaultSheetTabStyles`).
 *
 * Both options are free-form maps in the contract, so these editors keep the
 * shape simple and honest: a name and a value per row, written straight back to
 * the workbook option so `toJSON()` round-trips what the user entered.
 */
import React from 'react';
import { T } from './t.js';

interface IconRow {
  name: string;
  url: string;
}

const toRows = (value: unknown): IconRow[] =>
  Object.entries((value ?? {}) as Record<string, unknown>).map(([name, url]) => ({ name, url: String(url ?? '') }));

const fromRows = (rows: IconRow[]): Record<string, string> =>
  Object.fromEntries(rows.filter((row) => row.name.trim()).map((row) => [row.name.trim(), row.url]));

export function BuiltInFileIconsEditor({ data, update }: {
  data: Record<string, unknown>;
  update: (path: string | undefined, value: unknown) => void;
}): React.ReactElement {
  const rows = toRows(data.icons);
  const write = (next: IconRow[]): void => update('icons', fromRows(next));
  return (
    <div className="gc-file-icons">
      <div className="gc-dialog-text">{T('fileIconsUsedByTheBuiltInFileCells', 'File icons used by the built-in file cells.')}</div>
      <table className="gc-name-table gc-icon-table">
        <thead><tr><th>{T('name', 'Name')}</th><th>{T('image', 'Image')}</th><th /></tr></thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${row.name}-${index}`}>
              <td><input className="gc-dialog-input" aria-label={`Icon name ${index + 1}`} value={row.name} onChange={(event) => write(rows.map((item, at) => (at === index ? { ...item, name: event.target.value } : item)))} /></td>
              <td><input className="gc-dialog-input" aria-label={`Icon image ${index + 1}`} value={row.url} onChange={(event) => write(rows.map((item, at) => (at === index ? { ...item, url: event.target.value } : item)))} /></td>
              <td><button type="button" className="gc-dialog-secondary" onClick={() => write(rows.filter((_, at) => at !== index))}>{T('delete', 'Delete')}</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <button type="button" className="gc-dialog-secondary gc-icon-add" onClick={() => write([...rows, { name: '', url: '' }])}>{T('add', 'Add')}</button>
    </div>
  );
}

const TAB_STATES = ['normal', 'hover', 'selected'] as const;

interface StyleRow {
  state: string;
  backColor: string;
  foreColor: string;
}

export function TabStyleEditor({ data, update }: {
  data: Record<string, unknown>;
  update: (path: string | undefined, value: unknown) => void;
}): React.ReactElement {
  const stored = (data.styles ?? {}) as Record<string, Record<string, string>>;
  const rows: StyleRow[] = TAB_STATES.map((state) => ({ state, backColor: stored[state]?.backColor ?? '', foreColor: stored[state]?.foreColor ?? '' }));
  const write = (next: StyleRow[]): void => {
    const styles: Record<string, Record<string, string>> = {};
    for (const row of next) if (row.backColor || row.foreColor) styles[row.state] = { ...(stored[row.state] ?? {}), backColor: row.backColor, foreColor: row.foreColor };
    update('styles', styles);
  };
  return (
    <div className="gc-tab-styles">
      <div className="gc-dialog-text">{T('coloursOfTheSheetTabStates', 'Colours of the sheet-tab states.')}</div>
      <table className="gc-name-table gc-icon-table">
        <thead><tr><th>{T('state', 'State')}</th><th>{T('background', 'Background')}</th><th>{T('text', 'Text')}</th></tr></thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row.state}>
              <td className="gc-tab-style-state">{row.state}</td>
              <td><input className="gc-dialog-input" aria-label={`${row.state} background`} value={row.backColor} onChange={(event) => write(rows.map((item, at) => (at === index ? { ...item, backColor: event.target.value } : item)))} /></td>
              <td><input className="gc-dialog-input" aria-label={`${row.state} text colour`} value={row.foreColor} onChange={(event) => write(rows.map((item, at) => (at === index ? { ...item, foreColor: event.target.value } : item)))} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
