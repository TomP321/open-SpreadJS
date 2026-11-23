/* TASK 65 dialog openers: the Format Table gallery's "New Table Style..." / "Clear"
 * and the Cell Styles gallery's "Manage Cell States". The dialog bodies live in
 * `dialogs/TableStyleDialogs.tsx` and `dialogs/CellStatesDialogs.tsx`; the template
 * names are the official ones (`TemplateNames.TableStyleDialogTemplate`,
 * `CellStateManagerTemplate`, `NewCellStateTemplate`) so an application can replace
 * them through `Designer.registerTemplate` exactly like the trial's. */
import type { DesignerApi as Designer, DialogData } from './designer-api.js';
import { emptyTableTheme, pivotTableThemes, recordView, defaultThemeWorkbook, type Worksheet } from './core-internals.js';
import { TemplateNames } from './names-generated.js';
import { activeSheet, selectionBounds } from './commands/base.js';
import { messageText } from './resolve.js';
import { currentRegion } from './data-engine.js';
import { buildFormatData } from './designer-dialogs.js';
import { beginFormatStylePick, styleFromFormatData, takeFormatStyleTarget } from './dialogs/style-bridge.js';
import {
  PIVOT_STYLE_ELEMENTS, TABLE_STYLE_ELEMENTS, buildPivotTheme, buildTableTheme, emptyTableElementStyle, tableElementStyleFromJSON, type TableElementStyle,
} from './dialogs/TableStyleDialogs.js';
import { cellStateRows, commitCellStates, parseCellStateRange, rangeText, type CellStateRow } from './dialogs/CellStatesDialogs.js';

export const TABLE_STYLE_TEMPLATE = TemplateNames.TableStyleDialogTemplate ?? 'tableStyleDialogTemplate';
export const CELL_STATES_TEMPLATE = TemplateNames.CellStateManagerTemplate ?? 'cellStateManagerTemplate';
export const CELL_STATE_TEMPLATE = TemplateNames.NewCellStateTemplate ?? 'newCellStateTemplate';
const FORMAT_TEMPLATE = TemplateNames.FormatDialogTemplate ?? 'formatDialogTemplate';

/** The dialog draft: element key -> the style the user formatted (trial: only the
 *  touched elements are written into the theme). */
export interface TableStyleDraft {
  name: string;
  element: number;
  styles: Record<string, TableElementStyle>;
  sizes: Record<string, number>;
}

const nextThemeName = (designer: Designer): string => {
  const manager = recordView(designer.getWorkbook()).customTableThemes as { get?: (name: string) => unknown };
  let index = 1;
  while (manager.get?.(`New Table Style ${index}`)) index++;
  return `New Table Style ${index}`;
};

/** Opens (or re-opens) the New Table Style dialog with the current draft. */
export function showNewTableStyleDialog(designer: Designer): void {
  const draft: TableStyleDraft = designer._tableStyleDraft ?? { name: nextThemeName(designer), element: 0, styles: {}, sizes: {} };
  designer._tableStyleDraft = draft;
  const data: DialogData = { name: draft.name, element: draft.element, styles: { ...draft.styles }, sizes: { ...draft.sizes } };
  designer.showDialog(TABLE_STYLE_TEMPLATE, data,
    (submitted) => { designer._tableStyleDraft = undefined; applyNewTableStyle(designer, submitted); },
    () => { designer._tableStyleDraft = undefined; });
}

/** Opens the Format Cells dialog for a draft owned by another dialog. */
function openFormatCellsFor(designer: Designer, style: Record<string, unknown> | undefined, tabs: string[] | undefined, tab: string, onDone: (style: Record<string, unknown> | null) => void): void {
  const data = beginFormatStylePick({ onOk: (result) => onDone(result), onCancel: () => onDone(null) }, buildFormatData(designer), style, tabs);
  designer.showDialog(FORMAT_TEMPLATE, data,
    (submitted) => { const target = takeFormatStyleTarget(); target?.onOk(styleFromFormatData(submitted as DialogData)); },
    () => { takeFormatStyleTarget()?.onCancel?.(); });
  const state = designer.dialog;
  if (state) state.initialTab = tab;
  designer.invalidate();
}

/** Format... of the New Table Style dialog: the trial's Font/Border/Fill dialog. */
export function editTableStyleElement(designer: Designer, key: string): void {
  const draft = designer._tableStyleDraft;
  if (!draft) return;
  const current = draft.styles[key] ?? emptyTableElementStyle();
  openFormatCellsFor(designer, tableElementStyleToRecord(current), ['font', 'border', 'fill'], 'font', (style) => {
    const pending = designer._tableStyleDraft;
    if (!pending) return;
    if (style) pending.styles[key] = tableElementStyleFromJSON(style);
    showNewTableStyleDialog(designer);
  });
}

/** Clear of the New Table Style dialog: forgets the selected element's style. */
export function clearTableStyleElement(designer: Designer, key: string): void {
  const draft = designer._tableStyleDraft;
  if (!draft) return;
  const styles = { ...draft.styles };
  delete styles[key];
  designer._tableStyleDraft = { ...draft, styles };
  showNewTableStyleDialog(designer);
}

/** OK of the New Table Style dialog: register the theme through the public API. */
export function applyNewTableStyle(designer: Designer, data: DialogData): void {
  const name = String(data.name ?? '').trim();
  if (!name) return;
  const styles = (data.styles ?? {}) as Record<string, TableElementStyle>;
  const sizes = (data.sizes ?? {}) as Record<string, number>;
  const theme = buildTableTheme(designer.gc, name, styles, sizes);
  const manager = recordView(designer.getWorkbook()).customTableThemes as { add?: (value: unknown) => unknown };
  manager.add?.(theme);
  designer.invalidate();
}

/** The gallery's "Clear" (trial: the table under the cursor loses its style). */
export function clearTableStyleOfSelection(designer: Designer): void {
  const sheet = activeSheet(designer);
  const bounds = selectionBounds(sheet);
  const table = sheet.tables.all().find((item) => item.range().contains(Math.max(0, bounds.row), Math.max(0, bounds.col)));
  if (!table) return;
  /* Trial (TASK 77 probe `.probe/t77/run/t77-tablefixture.json`): after the Clear the table keeps a
   * style object whose `name()` is empty (the serialized table omits the `style` key) and reading the
   * cell styles through the table still works. Writing a bare `null` instead left the core paint path
   * a value without `_style` to dereference — the first Clear Table Style killed our designer's grid
   * for the rest of the sweep session (the TASK 75 zoomSelection harness artifact). */
  table.style(emptyTableTheme(designer.gc));
  /* Trial (TASK 75 sweep): clearing a table style also materialises the default
   * `showResizeHandle: true` in the serialized table. */
  table.showResizeHandle(true);
  designer.invalidate();
}

/* ---------------------------------------------------------- cell states --- */

interface CellStatesDraft { rows: CellStateRow[] | null; creating: CellStateRow | null }
export type { CellStatesDraft };

/** Manage Cell States: the working copy stays on the designer until OK commits it. */
export function showManageCellStatesDialog(designer: Designer, rows?: CellStateRow[]): void {
  const draft: CellStatesDraft = designer._cellStatesDraft ?? { rows: rows ?? cellStateRows(activeSheet(designer)), creating: null };
  if (!draft.rows) draft.rows = cellStateRows(activeSheet(designer));
  designer._cellStatesDraft = draft;
  designer.showDialog(CELL_STATES_TEMPLATE, { rows: draft.rows, selected: -1 },
    (data) => {
      const current = designer._cellStatesDraft;
      designer._cellStatesDraft = null;
      commitCellStates(designer, activeSheet(designer), (data.rows ?? current?.rows ?? []) as CellStateRow[]);
    },
    () => { designer._cellStatesDraft = null; });
}

/** Add Cell States: opens the Create dialog for a new row of the working list.
 *  TASK 68: the trial's standalone `addCellState` command opens the editor with
 *  the current (expanded) selection, so without an open manager we commit OK
 *  straight to the sheet. */
export function addCellState(designer: Designer): void {
  const standalone = !designer._cellStatesDraft;
  if (standalone) designer._cellStatesDraft = { rows: cellStateRows(activeSheet(designer)), creating: null };
  const draft = designer._cellStatesDraft;
  if (!draft || !draft.rows) return;
  const sheet = activeSheet(designer);
  const bounds = selectionBounds(sheet);
  const single = bounds.rowCount <= 1 && bounds.colCount <= 1;
  const region = single ? currentRegion(sheet, { row: Math.max(0, bounds.row), col: Math.max(0, bounds.col), rowCount: 1, colCount: 1 }) : bounds;
  const row: CellStateRow = {
    row: Math.max(0, region.row), col: Math.max(0, region.col),
    rowCount: Math.max(1, region.rowCount), colCount: Math.max(1, region.colCount),
    state: 1, style: {},
  };
  draft.creating = row;
  if (!standalone) { showCreateCellState(designer, row); return; }
  designer.showDialog(CELL_STATE_TEMPLATE, { state: row.state, range: rangeText(row), style: { ...row.style } },
    (data) => {
      designer._cellStatesDraft = null;
      const parsed = parseCellStateRange(String(data.range ?? ''));
      const added: CellStateRow = {
        row: parsed?.row ?? row.row, col: parsed?.col ?? row.col,
        rowCount: parsed?.rowCount ?? row.rowCount, colCount: parsed?.colCount ?? row.colCount,
        state: Number(data.state ?? row.state), style: { ...((data.style ?? {}) as Record<string, unknown>) },
      };
      commitCellStates(designer, sheet, [...(draft.rows ?? []), added]);
    },
    () => { designer._cellStatesDraft = null; });
}

function showCreateCellState(designer: Designer, row: CellStateRow): void {
  designer.showDialog(CELL_STATE_TEMPLATE, { state: row.state, range: rangeText(row), style: { ...row.style } },
    (data) => {
      const current = designer._cellStatesDraft;
      if (!current || !current.rows) return;
      const parsed = parseCellStateRange(String(data.range ?? ''));
      current.rows = [...current.rows, {
        row: parsed?.row ?? row.row, col: parsed?.col ?? row.col,
        rowCount: parsed?.rowCount ?? row.rowCount, colCount: parsed?.colCount ?? row.colCount,
        state: Number(data.state ?? row.state), style: { ...((data.style ?? {}) as Record<string, unknown>) },
      }];
      current.creating = null;
      showManageCellStatesDialog(designer, current.rows);
    },
    () => {
      const current = designer._cellStatesDraft;
      if (current) current.creating = null;
      showManageCellStatesDialog(designer);
    });
}

/** Keeps the Create dialog open with its current editor values (Format... round-trip). */
function keepCreateCellState(designer: Designer): void {
  const current = designer._cellStatesDraft?.creating;
  if (!current) return;
  const dialog = designer.dialog;
  const merged = { ...current.style, ...((dialog?.data.style ?? {}) as Record<string, unknown>) };
  const state = Number(dialog?.data.state ?? current.state);
  const range = String(dialog?.data.range ?? rangeText(current));
  designer.showDialog(CELL_STATE_TEMPLATE, { state, range, style: merged },
    (data) => { dialog?.success?.(data); },
    () => { dialog?.error?.(new Error('Cancelled')); });
}

/** Format... of the Create dialog: the full Format Cells dialog for the state style. */
export function editCellStateStyle(designer: Designer): void {
  const current = designer._cellStatesDraft?.creating;
  const dialog = designer.dialog;
  if (!current || !dialog || dialog.name !== CELL_STATE_TEMPLATE) return;
  const style = { ...current.style, ...((dialog.data.style ?? {}) as Record<string, unknown>) };
  openFormatCellsFor(designer, style, undefined, 'font', (result) => {
    const pending = designer._cellStatesDraft?.creating;
    if (!pending) return;
    if (result) pending.style = result;
    keepCreateCellState(designer);
  });
}

/** Remove Cell State: drops the selected row of the working list. */
export function removeCellState(designer: Designer): void {
  const draft = designer._cellStatesDraft;
  const dialog = designer.dialog;
  if (!draft?.rows || !dialog || dialog.name !== CELL_STATES_TEMPLATE) return;
  const index = Number(dialog.data.selected ?? -1);
  if (index < 0) return;
  draft.rows = draft.rows.filter((_, position) => position !== index);
  dialog.data = { ...dialog.data, rows: draft.rows, selected: -1 };
  designer.invalidate();
}

/** The range-picker button: takes the current grid selection into the dialog. */
export function pickCellStateRange(designer: Designer): void {
  const current = designer._cellStatesDraft?.creating;
  const dialog = designer.dialog;
  if (!current || !dialog || dialog.name !== CELL_STATE_TEMPLATE) return;
  const bounds = selectionBounds(activeSheet(designer));
  const row = { row: Math.max(0, bounds.row), col: Math.max(0, bounds.col), rowCount: Math.max(1, bounds.rowCount), colCount: Math.max(1, bounds.colCount) };
  Object.assign(current, row);
  dialog.data = { ...dialog.data, range: rangeText(row) };
  designer.invalidate();
}

/** The dialog keeps the element style in its own shape; the pick needs a record. */
function tableElementStyleToRecord(style: TableElementStyle): Record<string, unknown> {
  const record: Record<string, unknown> = {
    fontFamily: style.family, fontSize: style.size,
    fontStyle: style.italic ? 'italic' : 'normal', fontWeight: style.bold ? 'bold' : 'normal',
  };
  if (style.backColor) record.backColor = style.backColor;
  if (style.foreColor) record.foreColor = style.foreColor;
  for (const [key, border] of Object.entries(style.borders)) {
    record[`border${key[0]!.toUpperCase()}${key.slice(1)}`] = { style: border.style, ...(border.color ? { color: border.color } : {}) };
  }
  return record;
}

/** Element list key of the draft's current element (used by the dialog bodies). */
export function tableStyleElementKey(index: number): string {
  return TABLE_STYLE_ELEMENTS[Math.max(0, index)]?.key ?? TABLE_STYLE_ELEMENTS[0].key;
}

/* --------------------------------------- TASK 93: New Pivot Table Style --- */

/** The draft `showNewPivotTableStyleDialog` keeps across the Format... round-trip. */
export interface PivotStyleDraft extends TableStyleDraft {
  /** The custom theme being modified (undefined for a fresh style). */
  original?: string;
}

export const PIVOT_STYLE_TEMPLATE = TemplateNames.PivotTableStyleDialogTemplate ?? 'pivoTtableStyleDialogTemplate';

const nextPivotThemeName = (designer: Designer): string => {
  const manager = pivotThemeManager(designer);
  let index = 1;
  while (manager.get?.(`New Pivot Table Style ${index}`)) index++;
  return `New Pivot Table Style ${index}`;
};

function pivotThemeManager(designer: Designer): { add?: (v: unknown) => unknown; get?: (n: string) => unknown; remove?: (n: string) => void; update?: (oldName: string, theme: unknown) => void; all?: () => { name: () => string }[] } {
  return recordView(designer.getWorkbook()).customPivotTableThemes as ReturnType<typeof pivotThemeManager>;
}

/** Draft styles/sizes read back from an existing theme (the Modify / Duplicate flow). */
export function pivotThemeDraft(designer: Designer, name: string, builtIn = false): PivotStyleDraft {
  const theme = builtIn
    ? (pivotTableThemes(designer.gc) as Record<string, unknown>)[name.toLowerCase()]
    : pivotThemeManager(designer).get?.(name);
  const styles: Record<string, TableElementStyle> = {};
  const sizes: Record<string, number> = {};
  const json = recordView((theme as { toJSON?: () => unknown } | undefined)?.toJSON?.() ?? {});
  for (const element of PIVOT_STYLE_ELEMENTS) if (json[element.key]) styles[element.key] = tableElementStyleFromJSON(json[element.key]);
  for (const key of ['firstColumnStripSize', 'firstRowStripSize']) if (json[key] !== undefined) sizes[key] = Number(json[key]);
  return { name, element: 0, styles, sizes, original: name };
}

/** Opens (or re-opens) the New/Modify Pivot Table Style dialog with the current draft. */
export function showNewPivotTableStyleDialog(designer: Designer, draft?: PivotStyleDraft): void {
  const current = draft ?? designer._pivotStyleDraft ?? { name: nextPivotThemeName(designer), element: 0, styles: {}, sizes: {} };
  designer._pivotStyleDraft = current;
  const data: DialogData = { name: current.name, element: current.element, styles: { ...current.styles }, sizes: { ...current.sizes } };
  // Trial (measured): the dialog is titled "Modify Pivot Table Style" when editing an
  // existing style and "New Pivot Table Style" for a fresh one.
  if (current.original) data.dialogTitle = messageText(designer, 'modifyPivotTableStyle', 'Modify Pivot Table Style', []);
  designer.showDialog(PIVOT_STYLE_TEMPLATE, data,
    (submitted) => { const pending = designer._pivotStyleDraft; designer._pivotStyleDraft = undefined; applyNewPivotStyle(designer, submitted, pending?.original); },
    () => { designer._pivotStyleDraft = undefined; });
}

/** OK: register (or re-register through `update`) the theme via the public API. */
export function applyNewPivotStyle(designer: Designer, data: DialogData, original?: string): void {
  const name = String(data.name ?? '').trim();
  if (!name) return;
  const styles = (data.styles ?? {}) as Record<string, TableElementStyle>;
  const sizes = (data.sizes ?? {}) as Record<string, number>;
  const theme = buildPivotTheme(designer.gc, name, styles, sizes);
  const manager = pivotThemeManager(designer);
  if (original && manager.get?.(original)) manager.update?.(original, theme);
  else manager.add?.(theme);
  designer.invalidate();
}

/** Format... of the pivot dialog: the Format Cells dialog for one element. */
export function editPivotStyleElement(designer: Designer, key: string): void {
  const draft = designer._pivotStyleDraft;
  if (!draft) return;
  const current = draft.styles[key] ?? emptyTableElementStyle();
  openFormatCellsFor(designer, tableElementStyleToRecord(current), ['font', 'border', 'fill'], 'font', (style) => {
    const pending = designer._pivotStyleDraft;
    if (!pending) return;
    if (style) pending.styles[key] = tableElementStyleFromJSON(style);
    showNewPivotTableStyleDialog(designer, pending);
  });
}

/** Clear of the pivot dialog: forget the selected element's style. */
export function clearPivotStyleElement(designer: Designer, key: string): void {
  const draft = designer._pivotStyleDraft;
  if (!draft) return;
  const styles = { ...draft.styles };
  delete styles[key];
  showNewPivotTableStyleDialog(designer, { ...draft, styles });
}

/** Duplicate... of the gallery context menu. Trial (measured): opens the style
 *  editor (same dialog as Modify) pre-filled with the source theme clone and a
 *  generated name; OK registers the copy as a custom style. */
export function duplicatePivotTheme(designer: Designer, name: string, builtIn = false): void {
  const draft = pivotThemeDraft(designer, name, builtIn);
  const manager = pivotThemeManager(designer);
  let index = 1;
  let next = `${name} ${index}`;
  while (manager.get?.(next)) { index += 1; next = `${name} ${index}`; }
  showNewPivotTableStyleDialog(designer, { ...draft, name: next, original: undefined });
}

/** Delete of the gallery context menu. */
export function deletePivotTheme(designer: Designer, name: string): void {
  const manager = pivotThemeManager(designer);
  manager.remove?.(name);
  const workbook = defaultThemeWorkbook(designer.getWorkbook());
  if (String(workbook.defaultPivotTableTheme?.()?.name?.() ?? '').toLowerCase() === name.toLowerCase()) workbook.defaultPivotTableTheme?.(null);
  designer.invalidate();
}

/** Set As Default of the gallery context menu (the trial stores the name, lower case). */
export function setDefaultPivotTheme(designer: Designer, name: string): void {
  defaultThemeWorkbook(designer.getWorkbook()).defaultPivotTableTheme?.(name.toLowerCase());
  designer.invalidate();
}

/** The sheet the cell-state dialogs read (exported for the unit tests). */
export function cellStatesSheet(designer: Designer): Worksheet {
  return activeSheet(designer);
}
