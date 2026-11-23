/*
 * Dialog bodies for Home > Find & Select > Go To / Go To Special and
 * Home > Fill > Series, measured against the running v19 trial (black box).
 *
 * Go To: a `Go to:` list of the workbook's defined names (workbook scope
 * first, then sheet scope) and a `Reference:` editor; picking a list item
 * writes the name into the editor, OK selects the range.
 * Go To Special: the trial's `Select` group — Notes / Constants / Formulas
 * (with the Numbers, Text, Logicals, Errors sub-checkboxes), Blanks, Current
 * region, Current array, Objects, Row differences, Column differences,
 * Precedents / Dependents (with Direct only / All levels), Last cell,
 * Visible cells only, Conditional formats and Data validation (with
 * All / Same). OK selects the matching cells inside the current selection
 * (the whole sheet while a single cell is active) or reports
 * `No cells were found.`.
 * Series: `Series in` Rows/Columns, `Type` Linear/Growth/Date/AutoFill, the
 * `Date unit` group (Day/Weekday/Month/Year), the Trend checkbox and the
 * Step/Stop editors; OK fills the selection through the core's
 * `Worksheet.fillAuto`.
 */
import React, { useState } from 'react';
import type { DesignerApi as Designer } from '../designer-api.js';
import { internals, recordView, type Worksheet } from '../core-internals.js';
import type { Bounds } from '../data-engine.js';
import { currentRegion } from '../data-engine.js';
import { definedNames } from '../defined-names.js';
import { T } from './t.js';

/* ------------------------------------------------------- shared helpers -- */

export interface SheetSelectionResult { ranges: Bounds[]; active: { row: number; col: number } }

/** The Go To scope: the active selection, or the whole sheet for a lone cell. */
export function specialScope(sheet: Worksheet): Bounds {
  const selection = sheet.getSelections()[0];
  const row = Math.max(0, selection?.row ?? sheet.getActiveRowIndex());
  const col = Math.max(0, selection?.col ?? sheet.getActiveColumnIndex());
  const rowCount = selection && selection.rowCount > 0 ? selection.rowCount : 1;
  const colCount = selection && selection.colCount > 0 ? selection.colCount : 1;
  if (rowCount === 1 && colCount === 1) return { row: 0, col: 0, rowCount: sheet.getRowCount(), colCount: sheet.getColumnCount() };
  return { row, col, rowCount, colCount };
}

function boundingRange(cells: { row: number; col: number }[], scope: Bounds): SheetSelectionResult | null {
  void scope;
  if (!cells.length) return null;
  let top = cells[0]!.row, left = cells[0]!.col, bottom = top, right = left;
  for (const cell of cells) {
    top = Math.min(top, cell.row); left = Math.min(left, cell.col);
    bottom = Math.max(bottom, cell.row); right = Math.max(right, cell.col);
  }
  return {
    ranges: [{ row: top, col: left, rowCount: bottom - top + 1, colCount: right - left + 1 }],
    active: { row: cells[0]!.row, col: cells[0]!.col },
  };
}

/** Merge per-row/per-column ranges into maximal contiguous vertical strips. */
function stripRanges(rows: number[], scope: Bounds, activeRow: number): SheetSelectionResult | null {
  if (!rows.length) return null;
  const ranges: Bounds[] = [];
  let start = rows[0]!, previous = rows[0]!;
  for (const row of rows.slice(1)) {
    if (row !== previous + 1) { ranges.push({ row: start, col: scope.col, rowCount: previous - start + 1, colCount: scope.colCount }); start = row; }
    previous = row;
  }
  ranges.push({ row: start, col: scope.col, rowCount: previous - start + 1, colCount: scope.colCount });
  return { ranges, active: { row: activeRow, col: scope.col } };
}

function columnStrips(cols: number[], scope: Bounds, activeCol: number): SheetSelectionResult | null {
  if (!cols.length) return null;
  const ranges: Bounds[] = [];
  let start = cols[0]!, previous = cols[0]!;
  for (const col of cols.slice(1)) {
    if (col !== previous + 1) { ranges.push({ row: scope.row, col: start, rowCount: scope.rowCount, colCount: previous - start + 1 }); start = col; }
    previous = col;
  }
  ranges.push({ row: scope.row, col: start, rowCount: scope.rowCount, colCount: previous - start + 1 });
  return { ranges, active: { row: scope.row, col: activeCol } };
}

/* ------------------------------------------------------ reference parse -- */

/** `$B$2`, `B2`, `B2:E5`, an optional `Sheet1!` / `'My Sheet'!` prefix. */
const REFERENCE = /^(?:(?:'([^']+)'|([A-Za-z_][A-Za-z0-9_.]*))!)?\$?([A-Za-z]{1,3})\$?([1-9]\d{0,6})(?::\$?([A-Za-z]{1,3})\$?([1-9]\d{0,6}))?$/;

function columnIndexOf(label: string): number {
  let col = 0;
  for (const ch of label.toUpperCase()) col = col * 26 + ch.charCodeAt(0) - 64;
  return col - 1;
}

/** `{ row, col, rowCount, colCount }` of a reference string, or `null` when it does not parse. */
export function parseReference(text: string): Bounds | null {
  const match = REFERENCE.exec(text.trim().replace(/^=/, ''));
  if (!match) return null;
  const left = columnIndexOf(match[3]!), top = Number(match[4]) - 1;
  const right = match[5] ? columnIndexOf(match[5]) : left;
  const bottom = match[6] ? Number(match[6]) - 1 : top;
  return { row: Math.min(top, bottom), col: Math.min(left, right), rowCount: Math.abs(bottom - top) + 1, colCount: Math.abs(right - left) + 1 };
}

function sheetByName(designer: Designer, name: string | undefined): Worksheet | null {
  if (!name) return null;
  const workbook = designer.getWorkbook();
  for (let index = 0; index < workbook.getSheetCount(); index++) if (workbook.getSheet(index).name() === name) return workbook.getSheet(index);
  return null;
}

/**
 * Resolve a Go To reference: a defined name (workbook scope, then the active
 * sheet's scope) or a plain `Sheet1!B2:E5`-style range. Returns the sheet to
 * select on plus the bounds; `name` is set when a defined name was used.
 */
export function resolveReference(designer: Designer, text: string): { sheet: Worksheet; bounds: Bounds; name?: string } | null {
  const trimmed = text.trim().replace(/^=/, '');
  if (!trimmed) return null;
  const workbook = designer.getWorkbook();
  const active = workbook.getActiveSheet();
  for (const entry of definedNames(workbook)) {
    if (entry.name.toLowerCase() !== trimmed.toLowerCase()) continue;
    if (entry.scope !== 'Workbook' && entry.scope !== active.name()) continue;
    const expression = entry.refersTo.replace(/^=/, '');
    const sheetMatch = /^(?:'([^']+)'|([A-Za-z_][A-Za-z0-9_.]*))!(.+)$/.exec(expression);
    const sheet = (sheetMatch ? sheetByName(designer, sheetMatch[1] ?? sheetMatch[2] ?? undefined) : active) ?? active;
    const bounds = parseReference(sheetMatch ? sheetMatch[3]! : expression);
    return bounds ? { sheet, bounds, name: entry.name } : null;
  }
  const sheetMatch = /^(?:'([^']+)'|([A-Za-z_][A-Za-z0-9_.]*))!(.+)$/.exec(trimmed);
  if (sheetMatch) {
    const sheet = sheetByName(designer, sheetMatch[1] ?? sheetMatch[2] ?? undefined);
    if (!sheet) return null;
    const bounds = parseReference(sheetMatch[3]!);
    return bounds ? { sheet, bounds } : null;
  }
  const bounds = parseReference(trimmed);
  return bounds ? { sheet: active, bounds } : null;
}

/** The Go To / name box list: workbook-scope names first, then sheet names (trial order). */
export function gotoNameItems(designer: Designer): string[] {
  const workbook = designer.getWorkbook();
  const names: string[] = [];
  const push = (owner: { getCustomNames(): { getName(): string }[] }): void => {
    for (const info of owner.getCustomNames()) if (!names.includes(info.getName())) names.push(info.getName());
  };
  push(workbook);
  for (let index = 0; index < workbook.getSheetCount(); index++) push(workbook.getSheet(index));
  return names;
}

/**
 * Select `ranges` with `active` as the cursor. The core's `setActiveCell`
 * collapses the selection, so Go To / name box / Go To Special all apply the
 * selection through the sheet's multi-range primitive instead.
 */
export function applySelection(designer: Designer, sheet: Worksheet, ranges: Bounds[], active: { row: number; col: number }): void {
  if (!ranges.length) {
    // TASK 70: designer-driven jumps move the selection through the core's USER path
    // (selection events fire with byUser; the trial recomputes ribbon caches there).
    const view = internals(sheet);
    if (view._userSetActiveCell) view._userSetActiveCell(active.row, active.col);
    else sheet.setActiveCell(active.row, active.col);
    return;
  }
  const RangeCtor = designer.gc.Spread.Sheets.Range;
  const sheetView = internals(sheet);
  if (sheetView._setUserSelections) {
    sheetView._setUserSelections(ranges.map((range) => new RangeCtor(range.row, range.col, range.rowCount, range.colCount)), active.row, active.col);
  } else {
    for (const range of ranges) sheet.setSelection(range.row, range.col, range.rowCount, range.colCount);
  }
}

/* ------------------------------------------------------ Go To Special ---- */

export interface GoToSpecialData {
  option: string;
  numbers: boolean; text: boolean; logicals: boolean; errors: boolean;
  level: string;
}

export const goToSpecialOptions = [
  'notes', 'constants', 'formulas', 'blanks', 'currentRegion', 'currentArray', 'objects',
  'rowDifferences', 'columnDifferences', 'precedents', 'dependents', 'lastCell',
  'visibleCells', 'conditionalFormats', 'dataValidation',
] as const;

/** Cell kind used by the Constants/Formulas sub-filters. */
function kindOf(value: unknown): 'numbers' | 'text' | 'logicals' | 'errors' | 'empty' {
  if (value === null || value === undefined || value === '') return 'empty';
  if (typeof value === 'number') return 'numbers';
  if (typeof value === 'boolean') return 'logicals';
  if (typeof value === 'object') {
    const error = (value as { error?: string }).error;
    if (error) return 'errors';
    return 'text';
  }
  const text = String(value);
  return /^#(DIV\/0!|REF!|VALUE!|NAME\?|NULL!|NUM!|N\/A|GETTING_DATA)/.test(text) ? 'errors' : 'text';
}

/**
 * The cells `Go To Special` selects for `data`, inside `scope`. `null` means
 * the trial's `No cells were found.` report.
 */
export function computeSpecialSelection(designer: Designer, data: GoToSpecialData): SheetSelectionResult | null {
  const sheet = designer.getWorkbook().getActiveSheet();
  const scope = specialScope(sheet);
  const activeRow = Math.max(0, sheet.getActiveRowIndex());
  const activeCol = Math.max(0, sheet.getActiveColumnIndex());
  const matches: { row: number; col: number }[] = [];
  const anyType = (filter: GoToSpecialData): boolean => filter.numbers || filter.text || filter.logicals || filter.errors;
  const passType = (value: unknown, filter: GoToSpecialData): boolean => {
    const kind = kindOf(value);
    if (kind === 'empty') return false;
    return (kind === 'numbers' && filter.numbers) || (kind === 'text' && filter.text) || (kind === 'logicals' && filter.logicals) || (kind === 'errors' && filter.errors);
  };
  const forEach = (visit: (row: number, col: number) => void): void => {
    for (let r = scope.row; r < scope.row + scope.rowCount; r++) {
      for (let c = scope.col; c < scope.col + scope.colCount; c++) visit(r, c);
    }
  };
  switch (data.option) {
    case 'notes':
      forEach((row, col) => { if (sheet.comments.get(row, col)) matches.push({ row, col }); });
      return boundingRange(matches, scope);
    case 'constants':
      forEach((row, col) => {
        if (sheet.getFormula(row, col)) return;
        if (!anyType(data) || passType(sheet.getValue(row, col), data)) matches.push({ row, col });
      });
      return boundingRange(matches, scope);
    case 'formulas':
      forEach((row, col) => {
        const formula = sheet.getFormula(row, col);
        if (formula == null || formula === '') return;
        const value = sheet.getValue(row, col);
        const kind = kindOf(value);
        const errorValue = kind === 'errors' || /^#(DIV\/0!|REF!|VALUE!|NAME\?|NULL!|NUM!|N\/A|GETTING_DATA)/.test(String(sheet.getText(row, col)));
        const isText = !errorValue && kind === 'text';
        const isLogical = !errorValue && (kind === 'logicals' || /^TRUE$|^FALSE$/i.test(String(value)));
        const isNumber = !errorValue && !isText && !isLogical && (kind === 'numbers' || value instanceof Date);
        if ((isNumber && data.numbers) || (isText && data.text) || (isLogical && data.logicals) || (errorValue && data.errors)) matches.push({ row, col });
      });
      return boundingRange(matches, scope);
    case 'blanks':
      forEach((row, col) => {
        if (sheet.getValue(row, col) == null && !sheet.getFormula(row, col)) matches.push({ row, col });
      });
      return boundingRange(matches, scope);
    case 'currentRegion':
      return { ranges: [currentRegion(sheet, { row: activeRow, col: activeCol, rowCount: 1, colCount: 1 })], active: { row: activeRow, col: activeCol } };
    case 'currentArray': {
      // The trial grows the selection to the whole array-formula block of the active cell.
      const view = recordView(sheet);
      const info = typeof view.getFormulaInformation === 'function'
        ? (view.getFormulaInformation as (row: number, col: number) => { hasFormula?: boolean; isArrayFormula?: boolean; baseRange?: Bounds } | undefined)(activeRow, activeCol)
        : undefined;
      if (!info || (!info.isArrayFormula && !info.baseRange)) return null;
      const base = info.baseRange;
      if (base && base.row >= 0 && base.col >= 0 && base.rowCount > 0 && base.colCount > 0) {
        return { ranges: [{ row: base.row, col: base.col, rowCount: base.rowCount, colCount: base.colCount }], active: { row: activeRow, col: activeCol } };
      }
      const getFormulas = view.getFormulas as ((row: number, col: number, byRow: boolean, rowCount: number, colCount: number) => unknown[]) | undefined;
      const arrayCell = (row: number, col: number): boolean => {
        if (getFormulas) { const infos = getFormulas.call(sheet, row, col, true, 1, 1); if (Array.isArray(infos) && infos.length > 0) return true; }
        const cellInfo = typeof view.getFormulaInformation === 'function'
          ? (view.getFormulaInformation as (row: number, col: number) => { isArrayFormula?: boolean } | undefined)(row, col)
          : undefined;
        return !!cellInfo?.isArrayFormula;
      };
      if (!arrayCell(activeRow, activeCol)) return null;
      if (!arrayCell(activeRow, activeCol)) return null;
      const seen = new Set<string>([`${activeRow}:${activeCol}`]);
      const queue = [{ row: activeRow, col: activeCol }];
      const block = [{ row: activeRow, col: activeCol }];
      while (queue.length) {
        const cell = queue.shift()!;
        for (const [row, col] of [[cell.row - 1, cell.col], [cell.row + 1, cell.col], [cell.row, cell.col - 1], [cell.row, cell.col + 1]] as const) {
          if (row < 0 || col < 0 || row >= sheet.getRowCount() || col >= sheet.getColumnCount() || seen.has(`${row}:${col}`)) continue;
          if (!arrayCell(row, col)) continue;
          seen.add(`${row}:${col}`);
          block.push({ row, col });
          queue.push({ row, col });
        }
      }
      return boundingRange(block, scope);
    }
    case 'objects': {
      const shapes = sheet.shapes.all();
      if (!shapes.length) return null;
      for (const shape of shapes) shape.isSelected(true);
      return { ranges: [], active: { row: activeRow, col: activeCol } };
    }
    case 'rowDifferences': {
      const rows: number[] = [];
      for (let r = scope.row; r < scope.row + scope.rowCount; r++) {
        if (r === scope.row) { rows.push(r); continue; }
        let differs = false;
        for (let c = scope.col; c < scope.col + scope.colCount && !differs; c++) differs = cellDiffers(sheet, r, c, r - 1, c);
        if (differs) rows.push(r);
      }
      return stripRanges(rows, scope, Math.max(rows[0] ?? scope.row, activeRow));
    }
    case 'columnDifferences': {
      const cols: number[] = [];
      for (let c = scope.col; c < scope.col + scope.colCount; c++) {
        if (c === scope.col) { cols.push(c); continue; }
        let differs = false;
        for (let r = scope.row; r < scope.row + scope.rowCount && !differs; r++) differs = cellDiffers(sheet, r, c, r, c - 1);
        if (differs) cols.push(c);
      }
      return columnStrips(cols, scope, Math.max(cols[0] ?? scope.col, activeCol));
    }
    case 'precedents':
    case 'dependents': {
      const read = data.option === 'precedents' ? 'getPrecedents' : 'getDependents';
      const get = recordView(sheet)[read] as ((row: number, col: number) => { row: number; col: number; rowCount?: number; colCount?: number; sheetName?: string }[]) | undefined;
      if (!get) return null;
      const all = data.level === 'all';
      const result: Bounds[] = [];
      const seen = new Set<string>();
      let frontier = [{ row: activeRow, col: activeCol }];
      let depth = 0;
      while (frontier.length && (all || depth < 1)) {
        const next: { row: number; col: number }[] = [];
        for (const cell of frontier) {
          for (const info of get.call(sheet, cell.row, cell.col) ?? []) {
            const key = `${info.row}:${info.col}`;
            if (seen.has(key)) continue;
            seen.add(key);
            result.push({ row: info.row, col: info.col, rowCount: info.rowCount ?? 1, colCount: info.colCount ?? 1 });
            next.push({ row: info.row, col: info.col });
          }
        }
        frontier = next;
        depth++;
      }
      return result.length ? { ranges: result, active: result[0]! } : null;
    }
    case 'lastCell': {
      let lastRow = -1, lastCol = -1;
      for (let r = 0; r < sheet.getRowCount(); r++) {
        for (let c = 0; c < sheet.getColumnCount(); c++) {
          if (sheet.getValue(r, c) != null || sheet.getFormula(r, c)) { lastRow = Math.max(lastRow, r); lastCol = Math.max(lastCol, c); }
        }
      }
      if (lastRow < 0) return null;
      return { ranges: [{ row: lastRow, col: lastCol, rowCount: 1, colCount: 1 }], active: { row: lastRow, col: lastCol } };
    }
    case 'visibleCells': {
      const view = recordView(sheet);
      const rowVisible = (row: number): boolean => typeof view.getRowVisible === 'function' ? view.getRowVisible(row) !== false : true;
      const colVisible = (col: number): boolean => typeof view.getColumnVisible === 'function' ? view.getColumnVisible(col) !== false : true;
      const ranges: Bounds[] = [];
      let start = -1, previous = -1;
      for (let r = scope.row; r < scope.row + scope.rowCount; r++) {
        if (rowVisible(r)) { if (start < 0) start = r; previous = r; continue; }
        if (start >= 0) { ranges.push({ row: start, col: scope.col, rowCount: previous - start + 1, colCount: scope.colCount }); start = -1; }
      }
      if (start >= 0) ranges.push({ row: start, col: scope.col, rowCount: previous - start + 1, colCount: scope.colCount });
      const columns: Bounds[] = [];
      let cStart = -1, cPrevious = -1;
      for (let c = scope.col; c < scope.col + scope.colCount; c++) {
        if (colVisible(c)) { if (cStart < 0) cStart = c; cPrevious = c; continue; }
        if (cStart >= 0) { columns.push({ row: scope.row, col: cStart, rowCount: scope.rowCount, colCount: cPrevious - cStart + 1 }); cStart = -1; }
      }
      if (cStart >= 0) columns.push({ row: scope.row, col: cStart, rowCount: scope.rowCount, colCount: cPrevious - cStart + 1 });
      // The trial intersects the visible row and column bands, like Excel.
      if (columns.length && ranges.length) {
        const bands: Bounds[] = [];
        for (const band of ranges) for (const column of columns) bands.push({ row: band.row, col: column.col, rowCount: band.rowCount, colCount: column.colCount });
        return bands.length ? { ranges: bands, active: { row: bands[0]!.row, col: bands[0]!.col } } : null;
      }
      const chosen = ranges.length ? ranges : columns;
      return chosen.length ? { ranges: chosen, active: chosen[0]! } : null;
    }
    case 'conditionalFormats': {
      const conditionalFormats = recordView(sheet.conditionalFormats);
      const getRules = conditionalFormats.getRules as ((row: number, col: number) => unknown[]) | undefined;
      if (!getRules) return null;
      const rulesFor = (row: number, col: number): unknown[] => getRules.call(sheet.conditionalFormats, row, col) ?? [];
      const activeRules = rulesFor(activeRow, activeCol);
      forEach((row, col) => {
        const rules = rulesFor(row, col);
        if (!rules.length) return;
        if (data.level === 'same') {
          if (!activeRules.length) return;
          if (!rules.some((rule) => activeRules.includes(rule))) return;
        }
        matches.push({ row, col });
      });
      return boundingRange(matches, scope);
    }
    case 'dataValidation': {
      const activeValidator = sheet.getDataValidator(activeRow, activeCol);
      forEach((row, col) => {
        const validator = sheet.getDataValidator(row, col);
        if (!validator) return;
        if (data.level === 'same') {
          if (!activeValidator) return;
          if (validator.type() !== (activeValidator as { type(): unknown }).type()) return;
        }
        matches.push({ row, col });
      });
      return boundingRange(matches, scope);
    }
    default:
      return null;
  }
}

function cellDiffers(sheet: Worksheet, row: number, col: number, aboveRow: number, aboveCol: number): boolean {
  const a = sheet.getValue(row, col);
  const b = sheet.getValue(aboveRow, aboveCol);
  if (a === b) return false;
  if (a == null || b == null) return true;
  return String(a) !== String(b);
}

/* --------------------------------------------------------- dialog UI ----- */

/** One custom radio (trial look: ring + inner dot, our own SVG). */
export function SpecialRadio({ checked, disabled, label, onClick }: {
  checked: boolean; disabled?: boolean; label: string; onClick: () => void;
}): React.ReactElement {
  return (
    <div role="radio" aria-checked={checked} aria-label={label} aria-disabled={disabled || undefined} tabIndex={disabled ? -1 : 0}
      className={`gc-goto-radio${checked ? ' checked' : ''}${disabled ? ' disabled' : ''}`}
      onClick={disabled ? undefined : onClick}
      onKeyDown={(event) => { if (!disabled && (event.key === ' ' || event.key === 'Enter')) onClick(); }}>
      <span className="gc-goto-radio-dot" aria-hidden="true" />
      <span className="gc-goto-radio-label">{label}</span>
    </div>
  );
}

/** One custom checkbox of the Go To Special dialog. */
function SpecialCheck({ checked, disabled, label, onChange }: {
  checked: boolean; disabled?: boolean; label: string; onChange: (value: boolean) => void;
}): React.ReactElement {
  return (
    <div role="checkbox" aria-checked={checked} aria-label={label} aria-disabled={disabled || undefined} tabIndex={disabled ? -1 : 0}
      className={`gc-goto-check${checked ? ' checked' : ''}${disabled ? ' disabled' : ''}`}
      onClick={disabled ? undefined : () => onChange(!checked)}
      onKeyDown={(event) => { if (!disabled && (event.key === ' ' || event.key === 'Enter')) onChange(!checked); }}>
      <span className="gc-goto-check-box" aria-hidden="true"><svg width="10" height="10" viewBox="0 0 10 10"><path d="m1.5 5.2 2.4 2.6 4.6-5.4" fill="none" stroke="currentColor" strokeWidth="1.6" /></svg></span>
      <span>{label}</span>
    </div>
  );
}

/** Go To: the names list (click fills the reference editor) plus the editor. */
export function GoToBody({ data, update }: {
  designer: Designer; data: Record<string, unknown>; update: (path: string | undefined, value: unknown) => void;
}): React.ReactElement {
  const names = (data.names as string[]) ?? [];
  const [selected, setSelected] = useState(-1);
  return (
    <div className="gc-goto-dialog">
      <div className="gc-dialog-label">{T('goTo2', 'Go to:')}</div>
      <div className="gc-dialog-list gc-goto-list" role="listbox" aria-label={T('goTo2', 'Go to:')}>
        {names.map((name, index) => (
          <div key={name} role="option" aria-selected={index === selected} className={`gc-dialog-list-item${index === selected ? ' selected' : ''}`}
            onClick={() => { setSelected(index); update('reference', name); }}>{name}</div>
        ))}
      </div>
      <div className="gc-dialog-label">{T('reference', 'Reference:')}</div>
      <input className="gc-dialog-input gc-goto-reference" aria-label={T('reference', 'Reference:')} value={String(data.reference ?? '')} onChange={(event) => update('reference', event.target.value)} autoFocus />
    </div>
  );
}

/** Go To Special: the trial's two-column `Select` group. */
export function GoToSpecialBody({ data, update }: {
  designer: Designer; data: Record<string, unknown>; update: (path: string | undefined, value: unknown) => void;
}): React.ReactElement {
  const current = (path: string): string => String(data[path] ?? '');
  const option = current('option') || 'notes';
  const isConstants = option === 'constants', isFormulas = option === 'formulas';
  const filtersOn = isConstants || isFormulas;
  const radio = (value: string, label: string): React.ReactElement => (
    <SpecialRadio label={label} checked={option === value} onClick={() => update('option', value)} />
  );
  const levelGroup = (owner: string): React.ReactElement => {
    const disabled = option !== owner;
    const value = String(data[`${owner}Level`] ?? 'direct');
    return (
      <div className={`gc-goto-levels${disabled ? ' disabled' : ''}`}>
        <SpecialRadio label={T('directOnly', 'Direct only')} checked={value === 'direct'} disabled={disabled} onClick={() => setTypeFor(data, update, owner, 'direct')} />
        <SpecialRadio label={T('allLevels', 'All levels')} checked={value === 'all'} disabled={disabled} onClick={() => setTypeFor(data, update, owner, 'all')} />
      </div>
    );
  };
  return (
    <div className="gc-goto-special">
      <div className="gc-dialog-groupbox gc-goto-select-group">
        <legend>{T('select', 'Select')}</legend>
        <div className="gc-goto-columns">
          <div className="gc-goto-column">
            {radio('notes', T('notes', 'Notes'))}
            {radio('constants', T('constants', 'Constants'))}
            {radio('formulas', T('formulas', 'Formulas'))}
            <div className={`gc-goto-filters${filtersOn ? '' : ' disabled'}`}>
              <SpecialCheck label={T('numbers', 'Numbers')} checked={data.numbers !== false} disabled={!isConstants && !isFormulas} onChange={(value) => update('numbers', value)} />
              <SpecialCheck label={T('text', 'Text')} checked={data.text !== false} disabled={!isConstants && !isFormulas} onChange={(value) => update('text', value)} />
              <SpecialCheck label={T('logicals', 'Logicals')} checked={data.logicals !== false} disabled={!isConstants && !isFormulas} onChange={(value) => update('logicals', value)} />
              <SpecialCheck label={T('errors', 'Errors')} checked={data.errors !== false} disabled={!isConstants && !isFormulas} onChange={(value) => update('errors', value)} />
            </div>
            {radio('blanks', T('blanks', 'Blanks'))}
            {radio('currentRegion', T('currentRegion', 'Current region'))}
            {radio('currentArray', T('currentArray', 'Current array'))}
            {radio('objects', T('objects', 'Objects'))}
          </div>
          <div className="gc-goto-column">
            {radio('rowDifferences', T('rowDifferences', 'Row differences'))}
            {radio('columnDifferences', T('columnDifferences', 'Column differences'))}
            {radio('precedents', T('precedents', 'Precedents'))}
            {levelGroup('precedents')}
            {radio('dependents', T('dependents', 'Dependents'))}
            {levelGroup('dependents')}
            {radio('lastCell', T('lastCell', 'Last cell'))}
            {radio('visibleCells', T('visibleCells', 'Visible cells only'))}
            {radio('conditionalFormats', T('conditionalFormats', 'Conditional formats'))}
            {radio('dataValidation', T('dataValidation', 'Data validation'))}
            <div className={`gc-goto-levels${option === 'conditionalFormats' || option === 'dataValidation' ? '' : ' disabled'}`}>
              <SpecialRadio label={T('all', 'All')} checked={String(data.formatLevel ?? 'all') === 'all'} disabled={option !== 'conditionalFormats' && option !== 'dataValidation'} onClick={() => update('formatLevel', 'all')} />
              <SpecialRadio label={T('same', 'Same')} checked={String(data.formatLevel ?? 'all') === 'same'} disabled={option !== 'conditionalFormats' && option !== 'dataValidation'} onClick={() => update('formatLevel', 'same')} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function setTypeFor(data: Record<string, unknown>, update: (path: string | undefined, value: unknown) => void, owner: string, value: string): void {
  void data;
  update(`${owner}Level`, value);
}

/* ------------------------------------------------------------- series ---- */

export interface SeriesFillOptions { seriesIn: string; type: string; unit: string; trend: boolean; step: string; stop: string }

function asDate(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === 'string' && value.trim()) { const d = new Date(value); if (!Number.isNaN(d.getTime())) return d; }
  return null;
}

/** Advance a date by `count * unit` (the trial's Day/Weekday/Month/Year units). */
function addDateUnit(start: Date, count: number, unit: string): Date {
  const next = new Date(start.getTime());
  switch (unit) {
    case 'weekday': {
      const step = Math.sign(count) || 1;
      let remaining = Math.abs(count);
      while (remaining > 0) {
        next.setDate(next.getDate() + step);
        const day = next.getDay();
        if (day !== 0 && day !== 6) remaining--;
      }
      return next;
    }
    case 'month': next.setMonth(next.getMonth() + count); return next;
    case 'year': next.setFullYear(next.getFullYear() + count); return next;
    default: next.setDate(next.getDate() + count); return next;
  }
}

/**
 * The Series dialog's fill. Linear/Growth/Date use the trial's step/stop
 * semantics (the next value is generated from the start cell of every column
 * /row of the selection; the fill stops before the first value past the Stop
 * Value); AutoFill and Trend go through the core's `fillAuto` (fillType auto
 * — the trial's TREND/copy behaviour).
 */
export function applySeriesFill(gc: unknown, sheet: Worksheet, scope: Bounds, options: SeriesFillOptions): void {
  const columns = options.seriesIn !== 'rows';
  const step = Number(options.step);
  const stepValue = Number.isFinite(step) ? step : 1;
  const stopText = String(options.stop ?? '').trim();
  const kind = options.trend ? 'auto' : String(options.type ?? 'linear');
  if (kind === 'autoFill' || kind === 'auto') {
    const root = gc as { Spread: { Sheets: { Range: new (row: number, col: number, rowCount: number, colCount: number) => unknown; Fill: { FillType: Record<string, number>; FillSeries: Record<string, number>; FillDirection: Record<string, number> } } } };
    const fill = root.Spread.Sheets.Fill;
    const start = columns
      ? { row: scope.row, col: scope.col, rowCount: 1, colCount: scope.colCount }
      : { row: scope.row, col: scope.col, rowCount: scope.rowCount, colCount: 1 };
    sheet.fillAuto(new root.Spread.Sheets.Range(start.row, start.col, start.rowCount, start.colCount) as never,
      new root.Spread.Sheets.Range(scope.row, scope.col, scope.rowCount, scope.colCount) as never,
      { fillType: fill.FillType.auto, series: columns ? fill.FillSeries.column : fill.FillSeries.row, direction: columns ? fill.FillDirection.down : fill.FillDirection.right });
    return;
  }
  const lineCount = columns ? scope.colCount : scope.rowCount;
  const lineLength = columns ? scope.rowCount : scope.colCount;
  for (let line = 0; line < lineCount; line++) {
    const at = (position: number): [number, number] => (columns ? [scope.row + position, scope.col + line] : [scope.row + line, scope.col + position]);
    const seed = sheet.getValue(...at(0));
    if (seed === null || seed === undefined) continue;
    if (kind === 'date') {
      let current = asDate(seed);
      const stop = stopText ? asDate(stopText) : null;
      if (!current) continue;
      for (let position = 1; position < lineLength; position++) {
        current = addDateUnit(current, stepValue, options.unit);
        if (stop && current.getTime() > stop.getTime()) break;
        sheet.setValue(...at(position), current);
      }
      continue;
    }
    let current = Number(seed);
    if (!Number.isFinite(current)) {
      for (let position = 1; position < lineLength; position++) sheet.setValue(...at(position), seed);
      continue;
    }
    const stop = stopText && Number.isFinite(Number(stopText)) ? Number(stopText) : null;
    for (let position = 1; position < lineLength; position++) {
      current = kind === 'growth' ? current * stepValue : current + stepValue;
      if (stop !== null && (stepValue >= 0 ? current > stop : current < stop)) break;
      sheet.setValue(...at(position), current);
    }
  }
}

/** Series: the trial's `Series in` / `Type` / `Date unit` groups and step/stop editors. */
export function SeriesBody({ data, update }: {
  designer: Designer; data: Record<string, unknown>; update: (path: string | undefined, value: unknown) => void;
}): React.ReactElement {
  const type = String(data.type ?? 'linear');
  const trend = data.trend === true;
  const isDate = type === 'date';
  const [stepFocused, setStepFocused] = useState(false);
  void stepFocused;
  return (
    <div className="gc-series-dialog">
      <div className="gc-series-groups">
        <div className="gc-dialog-groupbox gc-series-in">
          <legend>{T('seriesIn', 'Series in')}</legend>
          <SpecialRadio label={T('rows', 'Rows')} checked={String(data.seriesIn) === 'rows'} onClick={() => update('seriesIn', 'rows')} />
          <SpecialRadio label={T('columns', 'Columns')} checked={String(data.seriesIn) !== 'rows'} onClick={() => update('seriesIn', 'columns')} />
        </div>
        <div className="gc-dialog-groupbox gc-series-type">
          <legend>{T('type', 'Type')}</legend>
          <SpecialRadio label={T('linear', 'Linear')} checked={type === 'linear'} onClick={() => update('type', 'linear')} />
          <SpecialRadio label={T('growth', 'Growth')} checked={type === 'growth'} onClick={() => update('type', 'growth')} />
          <SpecialRadio label={T('date2', 'Date')} checked={type === 'date'} onClick={() => update('type', 'date')} />
          <SpecialRadio label={T('autoFill', 'AutoFill')} checked={type === 'autoFill'} onClick={() => update('type', 'autoFill')} />
        </div>
        <div className={`gc-dialog-groupbox gc-series-unit${isDate ? '' : ' disabled'}`}>
          <legend>{T('dateUnit', 'Date unit')}</legend>
          {(['day', 'weekday', 'month', 'year'] as const).map((unit) => (
            <SpecialRadio key={unit} label={unit[0]!.toUpperCase() + unit.slice(1)} disabled={!isDate}
              checked={String(data.unit ?? 'day') === unit} onClick={() => update('unit', unit)} />
          ))}
        </div>
      </div>
      <SpecialCheck label={T('trend', 'Trend')} checked={trend} onChange={(value) => update('trend', value)} />
      <div className="gc-series-steps">
        <span className="gc-dialog-label">{T('stepValue', 'Step Value')}</span>
        <input className="gc-dialog-input gc-series-step" aria-label={T('stepValue', 'Step Value')} disabled={trend} value={String(data.step ?? '')}
          onChange={(event) => update('step', event.target.value)} onFocus={() => setStepFocused(true)} />
        <span className="gc-dialog-label">{T('stopValue', 'Stop Value')}</span>
        <input className="gc-dialog-input gc-series-stop" aria-label={T('stopValue', 'Stop Value')} disabled={trend} value={String(data.stop ?? '')}
          onChange={(event) => update('stop', event.target.value)} />
      </div>
    </div>
  );
}
