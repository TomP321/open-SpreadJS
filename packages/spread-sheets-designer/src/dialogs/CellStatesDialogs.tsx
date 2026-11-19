/* Cell States manager (Cell Styles gallery footer) and its Create dialog. Geometry and
 * behaviour follow the running v19 trial measured black-box (docs/STATUS.md, TASK 65):
 *  - "Manage Cell States": 547 x 396 dialog, "Cell State list:" label, the
 *    "Add Cell States"/"Remove Cell State" toolstrip (26 px buttons), a three-column
 *    list (Range 151 px, Style 151 px, State 201 px) and the OK/Cancel footer.
 *  - "Create Cell States": 380 x 268 dialog, a "Select a cell state type" combo
 *    (the eight `CellStatesType` labels), a "Choose Range" fieldset (Range editor +
 *    range-picker button) and a "Set style" fieldset (Preview swatch + Format...).
 *  - Like the trial, both dialogs work on a copy: the sheet's `cellStates` only change
 *    when the manager's OK commits them, through the public `cellStates.clear` +
 *    `cellStates.add` API (`GC.Spread.Sheets.Range`/`Style`/`SheetArea.viewport`). */
import React from 'react';
import type GC from '@mescius/spread-sheets';
import { CustomSelect } from './custom-widgets.js';
import type { DesignerApi as Designer } from '../designer-api.js';
import { recordView, type Worksheet } from '../core-internals.js';

/** The trial's combo entries, in its order, with the public `CellStatesType` value. */
export const CELL_STATE_TYPES: { label: string; value: number }[] = [
  { label: 'hover', value: 1 },
  { label: 'invalid', value: 2 },
  { label: 'readonly', value: 4 },
  { label: 'edit', value: 8 },
  { label: 'active', value: 16 },
  { label: 'selected', value: 32 },
  { label: 'dirty', value: 64 },
  { label: 'invalid formula', value: 128 },
];

export const cellStateTypeLabel = (state: number): string =>
  CELL_STATE_TYPES.find((item) => item.value === Number(state))?.label ?? String(state);

/** One row of the manager list (a working copy of `sheet.cellStates.all()`). */
export interface CellStateRow {
  row: number;
  col: number;
  rowCount: number;
  colCount: number;
  state: number;
  /** The state style in plain style-record keys (what the Format Cells dialog edits). */
  style: Record<string, unknown>;
}

const columnLetters = (col: number): string => {
  let letters = '';
  for (let index = col;;) {
    letters = String.fromCharCode(65 + (index % 26)) + letters;
    index = Math.floor(index / 26) - 1;
    if (index < 0) return letters;
  }
};

/** The trial shows the range in A1 form without the sheet name (`B2`, `B2:E5`). */
export function rangeText(row: Pick<CellStateRow, 'row' | 'col' | 'rowCount' | 'colCount'>): string {
  const left = columnLetters(row.col), right = columnLetters(row.col + Math.max(1, row.colCount) - 1);
  const bottom = row.row + Math.max(1, row.rowCount);
  return row.rowCount <= 1 && row.colCount <= 1 ? `${left}${row.row + 1}` : `${left}${row.row + 1}:${right}${bottom}`;
}

/** Parses the manager's `Range:` editor back into a range (sheet name and `$` allowed). */
export function parseCellStateRange(text: string): { row: number; col: number; rowCount: number; colCount: number } | null {
  const clean = String(text ?? '').trim().replace(/^[^!]*!/, '').replace(/\$/g, '');
  const cell = (value: string): { row: number; col: number } | null => {
    const match = /^([A-Za-z]+)(\d+)$/.exec(value.trim());
    if (!match) return null;
    let col = 0;
    for (const letter of match[1].toUpperCase()) col = col * 26 + (letter.charCodeAt(0) - 64);
    return { row: Number(match[2]) - 1, col: col - 1 };
  };
  const parts = clean.split(':');
  const from = cell(parts[0]);
  if (!from) return null;
  if (parts.length === 1) return { row: from.row, col: from.col, rowCount: 1, colCount: 1 };
  const to = cell(parts[1]);
  if (!to) return null;
  return {
    row: Math.min(from.row, to.row), col: Math.min(from.col, to.col),
    rowCount: Math.abs(to.row - from.row) + 1, colCount: Math.abs(to.col - from.col) + 1,
  };
}

/** The manager's working list, read from the sheet through the public `cellStates.all()`. */
export function cellStateRows(sheet: Worksheet): CellStateRow[] {
  const manager = recordView(sheet.cellStates) as { all?: () => { range: { row: number; col: number; rowCount: number; colCount: number }; style: Record<string, unknown>; state: number }[] };
  return (manager.all?.() ?? []).map((entry) => ({
    row: entry.range.row, col: entry.range.col, rowCount: entry.range.rowCount, colCount: entry.range.colCount,
    state: entry.state, style: { ...entry.style },
  }));
}

/** Commits the working list: `clear` the viewport, then `add()` every row again. */
export function commitCellStates(designer: Designer, sheet: Worksheet, rows: CellStateRow[]): void {
  const sheets = designer.gc.Spread.Sheets;
  const manager = sheet.cellStates;
  const viewport = sheets.SheetArea.viewport;
  manager.clear(new sheets.Range(0, 0, sheet.getRowCount(), sheet.getColumnCount()), viewport);
  for (const row of rows) {
    const style = new sheets.Style();
    Object.assign(style, row.style);
    manager.add(new sheets.Range(row.row, row.col, row.rowCount, row.colCount), row.state as GC.Spread.Sheets.CellStatesType, style, viewport);
  }
  designer.invalidate();
}

/** The CSS of the trial's style swatch (dialog preview and list cell). */
export function cellStateSwatchCss(style: Record<string, unknown>): React.CSSProperties {
  const font = String(style.font ?? '');
  const rawSize = style.fontSize === undefined ? undefined : String(style.fontSize);
  const size = rawSize === undefined ? undefined
    : /px$/i.test(rawSize) ? rawSize : /pt$/i.test(rawSize) ? `${Number(rawSize.replace(/pt$/i, '')) * 4 / 3}px` : rawSize;
  const family = (style.fontFamily as string) ?? /Calibri|Arial|Tahoma|Georgia|Cambria/.exec(font)?.[0];
  return {
    background: (style.backColor as string) ?? '#ffffff',
    color: (style.foreColor as string) ?? '#000000',
    fontWeight: /bold|[6-9]00/.test(String(style.fontWeight ?? font)) ? 'bold' : 'normal',
    fontStyle: /italic|oblique/.test(String(style.fontStyle ?? font)) ? 'italic' : 'normal',
    fontFamily: family,
    fontSize: size,
    textDecoration: Number(style.textDecoration ?? 0) & 2 ? 'line-through' : undefined,
  };
}

interface Props { designer: Designer; data: Record<string, unknown>; update: (path: string | undefined, value: unknown) => void }

/** The manager body: the toolstrip, the three-column list and its selection. */
export function CellStatesManagerBody({ designer, data, update }: Props): React.ReactElement {
  const rows = (data.rows ?? []) as CellStateRow[];
  const selected = Number(data.selected ?? -1);
  return (
    <div className="gc-cell-states-manager">
      <div className="gc-cell-states-title">Cell State list:</div>
      <div className="gc-cell-states-toolbar">
        <button type="button" className="gc-dialog-secondary gc-cell-states-add" onClick={() => designer.addCellState()}>
          <span className="gc-cell-states-icon add" aria-hidden="true" />Add Cell States
        </button>
        <button type="button" className="gc-dialog-secondary gc-cell-states-remove" onClick={() => designer.removeCellState()}>
          <span className="gc-cell-states-icon remove" aria-hidden="true" />Remove Cell State
        </button>
      </div>
      <div className="gc-cell-states-list" role="table" aria-label="Cell State list:">
        <div className="gc-cell-states-row gc-cell-states-head" role="row">
          <span role="columnheader" className="gc-cell-states-range">Range</span>
          <span role="columnheader" className="gc-cell-states-style">Style</span>
          <span role="columnheader" className="gc-cell-states-state">State</span>
        </div>
        <div className="gc-cell-states-body">
          {rows.map((row, index) => (
            <div key={index} role="row" aria-selected={index === selected} tabIndex={0}
              className={`gc-cell-states-row${index === selected ? ' selected' : ''}`}
              onClick={() => update('selected', index)}>
              <span role="cell" className="gc-cell-states-range">{rangeText(row)}</span>
              <span role="cell" className="gc-cell-states-style">
                <span className="gc-cell-states-swatch" style={cellStateSwatchCss(row.style)}>AaBbCcYyZz</span>
              </span>
              <span role="cell" className="gc-cell-states-state">{cellStateTypeLabel(row.state)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** The Create Cell States body (opened by the manager's "Add Cell States"). */
export function CreateCellStateBody({ designer, data, update }: Props): React.ReactElement {
  const style = (data.style ?? {}) as Record<string, unknown>;
  const keys = Object.keys(style);
  const styled = keys.some((key) => ['backColor', 'foreColor', 'font', 'fontFamily', 'fontWeight', 'fontSize'].includes(key) && style[key] !== undefined && style[key] !== '');
  return (
    <div className="gc-create-cell-state">
      <div className="gc-create-cell-state-type">
        <label className="gc-dialog-label">Select a cell state type</label>
        <CustomSelect className="gc-dialog-select" ariaLabel="Select a cell state type"
          value={String(data.state ?? 1)} options={CELL_STATE_TYPES.map((item) => ({ text: item.label, value: item.value }))} onChange={(next) => update('state', Number(next))} />
      </div>
      <fieldset className="gc-create-cell-state-range">
        <legend>Choose Range</legend>
        <div className="gc-create-cell-state-range-row">
          <label className="gc-dialog-label" htmlFor="gc-cell-state-range">Range:</label>
          <input id="gc-cell-state-range" className="gc-dialog-input" aria-label="Range:" value={String(data.range ?? '')} onChange={(event) => update('range', event.target.value)} />
          <button type="button" className="gc-cell-states-picker" aria-label="Range Picker" onClick={() => designer.pickCellStateRange()}><span aria-hidden="true" /></button>
        </div>
      </fieldset>
      <fieldset className="gc-create-cell-state-style">
        <legend>Set style</legend>
        <div className="gc-create-cell-state-style-row">
          <span className="gc-dialog-label">Preview:</span>
          <span className="gc-cell-states-swatch gc-create-cell-state-swatch" style={styled ? cellStateSwatchCss(style) : undefined}>AaBbCcYyZz</span>
          <button type="button" className="gc-dialog-secondary gc-create-cell-state-format" onClick={() => designer.editCellStateStyle()}>Format...</button>
        </div>
      </fieldset>
    </div>
  );
}
