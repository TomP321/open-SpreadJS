/**
 * Designer-side PivotTable integration (TASK 47): the shared state helpers the
 * ribbon, the docked field-list panel and the dialogs use to talk to the core
 * `worksheet.pivotTables` API, plus the command routing for the contextual
 * "PivotTable Analyze"/"Design" tabs and the Insert > PivotTable command.
 *
 * Everything here works through the public core contract only
 * (`sheet.pivotTables`, `PivotTable`, `GC.Spread.Pivot.*`); the command ids
 * are the trial's `CommandNames.PivotTable*` strings so user configs keep
 * working.
 */
import type { DesignerApi as Designer } from './designer-api.js';
import { pivotInternals, rangeWriter, recordView } from './core-internals.js';
import { setDockPane } from './dock-panes.js';
import type { Worksheet } from './core-internals.js';
import type GC from '@mescius/spread-sheets';
import { activeSheet, topCell } from './commands/base.js';
import { CommandNames, TemplateNames } from './names-generated.js';

export type PivotTable = GC.Spread.Pivot.PivotTable;
export type PivotFieldInfo = GC.Spread.Pivot.IFieldInfo;

/* ------------------------------------------------------------ active pivot --- */

/** The pivot table under the active cell (the trial's "active" pivot), or null. */
export function activePivot(d: Designer): PivotTable | null {
  const sheet = activeSheet(d);
  const { row, col } = topCell(sheet);
  try {
    return sheet.pivotTables.findPivotTable(row, col) ?? null;
  } catch {
    return null;
  }
}

/** True while the active cell is inside a pivot table (contextual tabs trigger). */
export function hasActivePivot(d: Designer): boolean {
  return activePivot(d) !== null;
}

/** Every pivot table of the workbook, in sheet order. */
export function allPivots(d: Designer): PivotTable[] {
  const wb = d.getWorkbook();
  const out: PivotTable[] = [];
  for (let i = 0; i < wb.getSheetCount(); i++) out.push(...wb.getSheet(i).pivotTables.all());
  return out;
}

/** The pivot the panel/dialogs target: the remembered panel pivot, else the active one. */
export function pivotPanelTable(d: Designer): PivotTable | null {
  if (d._pivotFieldListName) {
    const wb = d.getWorkbook();
    for (let i = 0; i < wb.getSheetCount(); i++) {
      const pivot = wb.getSheet(i).pivotTables.get(d._pivotFieldListName);
      if (pivot) return pivot;
    }
  }
  return activePivot(d);
}

/* --------------------------------------------------------------- naming --- */

/** Unique pivot-table name for a new pivot ('PivotTable1', … like the trial). */
export function nextPivotName(d: Designer): string {
  const used = new Set(allPivots(d).map((pivot) => String(pivot.name()).toLowerCase()));
  for (let n = 1; n < 10_000; n++) {
    const name = `PivotTable${n}`;
    if (!used.has(name.toLowerCase())) return name;
  }
  return 'PivotTable';
}

/* ------------------------------------------------------------ references --- */

export function columnName(col: number): string {
  let out = '';
  for (let n = col + 1; n > 0; n = Math.floor((n - 1) / 26)) out = String.fromCharCode(65 + ((n - 1) % 26)) + out;
  return out;
}

export function columnIndex(label: string): number {
  let col = 0;
  for (const ch of label.toUpperCase()) {
    if (ch < 'A' || ch > 'Z') return NaN;
    col = col * 26 + ch.charCodeAt(0) - 64;
  }
  return col - 1;
}

/** Quote a sheet name the way spreadsheet references do when needed. */
export function sheetRef(name: string): string {
  return /^[A-Za-z_][A-Za-z0-9_.]*$/.test(name) ? name : `'${name.replace(/'/g, "''")}'`;
}

/**
 * Normalize a user-typed source ("A1:F5", "Data!A1:F5", "=Data!$A$1:$F$5",
 * "sourceData") to the trial's canonical form: `=Sheet!$A$1:$F$5` for ranges,
 * `=table` for table names. Returns null when the text is not a valid source.
 */
export function normalizeSourceRef(d: Designer, text: string): string | null {
  const raw = String(text ?? '').trim();
  if (!raw) return null;
  const body = raw.startsWith('=') ? raw.slice(1).trim() : raw;
  // Table name (no colon, not a bare cell reference): keep `=table`.
  if (/^[A-Za-z_][A-Za-z0-9_.]*$/.test(body) && !/^\$?[A-Za-z]{1,3}\$?\d+$/.test(body)) {
    const wb = d.getWorkbook();
    for (let i = 0; i < wb.getSheetCount(); i++) {
      for (const table of wb.getSheet(i).tables.all()) if (table.name() === body) return `=${body}`;
    }
    return null;
  }
  const match = /^(?:(.+)!)?\$?([A-Za-z]{1,3})\$?(\d+)(?::\$?([A-Za-z]{1,3})\$?(\d+))?$/.exec(body);
  if (!match) return null;
  const c1 = columnIndex(match[2]!), r1 = Number(match[3]) - 1;
  const c2 = match[4] ? columnIndex(match[4]) : c1;
  const r2 = match[5] ? Number(match[5]) - 1 : r1;
  if (Number.isNaN(c1) || Number.isNaN(c2) || r1 < 0 || r2 < 0) return null;
  const sheetName = match[1] ? match[1].replace(/^'|'$/g, '').replace(/''/g, "'") : activeSheet(d).name();
  return `=${sheetRef(sheetName)}!$${columnName(c1)}$${r1 + 1}:$${columnName(c2)}$${r2 + 1}`;
}

/** Parse a single-cell location ("A1", "$A$4", "Sheet2!B2") to sheet/row/col. */
export function parseLocation(d: Designer, text: string): { sheet: string; row: number; col: number } | null {
  const match = /^(?:(.+)!)?\$?([A-Za-z]{1,3})\$?(\d+)$/.exec(String(text ?? '').trim());
  if (!match) return null;
  const col = columnIndex(match[2]!);
  const row = Number(match[3]) - 1;
  if (Number.isNaN(col) || row < 0) return null;
  const sheet = match[1] ? match[1].replace(/^'|'$/g, '').replace(/''/g, "'") : activeSheet(d).name();
  return { sheet, row, col };
}

/**
 * The trial's default range text of the Create dialog: the active cell as
 * `=Sheet!$B$2`, or the surrounding table name when it sits inside one.
 */
export function defaultSourceRef(d: Designer): string {
  const sheet = activeSheet(d);
  const { row, col } = topCell(sheet);
  for (const table of sheet.tables.all()) {
    const range = table.range();
    if (row >= range.row && row < range.row + range.rowCount && col >= range.col && col < range.col + range.colCount) return `=${table.name()}`;
  }
  return `=${sheetRef(sheet.name())}!$${columnName(Math.max(0, row))}$${Math.max(0, row) + 1}`;
}

/* ---------------------------------------------------- the active field --- */

/**
 * The "Active Field" of the Analyze tab: the pivot field whose data sits under
 * the active cell (row label column -> that row field; value column -> that
 * value field). Empty string when the cell is not over a field column.
 */
export function pivotActiveFieldName(d: Designer): string {
  const pivot = activePivot(d);
  if (!pivot) return '';
  const sheet = activeSheet(d);
  const { row, col } = topCell(sheet);
  const fields = pivot.getFieldsByArea();
  if (!fields.length) return '';
  const areas = pivot.getRange();
  if (!areas.content || !areas.content.contains(row, col)) return '';
  const labels = fields.filter((f) => f.pivotArea === 0 || f.pivotArea === 1 || f.pivotArea === 2);
  const values = fields.filter((f) => f.pivotArea === 3);
  // Walk the label columns from the content's left edge; every row/column/
  // page field owns one leading column, the rest belong to the value fields.
  const labelCount = Math.max(1, labels.length ? labels.reduce((max, f) => Math.max(max, f.pivotIndex ?? 0), 0) + 1 : 1);
  const offset = col - areas.content.col;
  if (offset < labelCount && labels.length) {
    const orderedFields = ordered(labels);
    return orderedFields[Math.min(offset, orderedFields.length - 1)]?.fieldName ?? '';
  }
  const valueIndex = values.length > 1 ? offset - labelCount : 0;
  return values[Math.max(0, Math.min(valueIndex, values.length - 1))]?.fieldName ?? ordered(labels)[0]?.fieldName ?? '';
}

function ordered(fields: PivotFieldInfo[]): PivotFieldInfo[] {
  return [...fields].sort((a, b) => (a.pivotArea - b.pivotArea) || (a.pivotIndex - b.pivotIndex));
}

/* ------------------------------------------------------------- commands --- */

/** Names handled by `executePivotCommand` (routed by designer-commands.ts). */
const pivotCommandNames = new Set<string>([
  CommandNames.InsertPivotTable, CommandNames.InsertPivotTableFromDataTable,
  CommandNames.PivotTableFieldList, CommandNames.PivotTableRibbonRefresh, CommandNames.PivotTableRefresh,
  CommandNames.PivotTableChangeDataSource, CommandNames.PivotTableMove,
  CommandNames.PivotTableClearAll, CommandNames.PivotTableClearFilters,
  CommandNames.PivotTableFieldSetting, CommandNames.PivotTableValueFieldSetting,
  CommandNames.PivotTableName, CommandNames.PivotTableActiveField, CommandNames.PivotTableOptions,
  CommandNames.PivotTableShowHeaders, CommandNames.PivotTableButtons,
  CommandNames.PivotTableExpandField, CommandNames.PivotTableCollapseField,
  CommandNames.PivotTableGroupSelection, CommandNames.PivotTableUnGroup, CommandNames.PivotTableGroupField,
  CommandNames.PivotFilterConnections,
  CommandNames.PivotTableRowHeaders, CommandNames.PivotTableColumnHeaders,
  CommandNames.PivotTableBandedRows, CommandNames.PivotTableBandedColumns,
  CommandNames.PivotTableStyle, CommandNames.PivotTableAutoFitColumn,
  CommandNames.NewPivotTableStyle, CommandNames.ClearPivotTableStyle,
  /* TASK 77 (probes 3/9/10-14 in .probe/t77/run/): the Fields, Items & Sets family and the two
   * Options/Report dropdown entries. Every one of them opens a dialog on the trial (List Formulas
   * writes a report sheet instead); the trial registers `pivotTableOptionsSub` as the Options
   * dropdown entry that opens the very same PivotTable Options dialog as `pivotTableOptions`. */
  CommandNames.PivotTableCalculatedField, CommandNames.PivotTableCalculatedItem,
  CommandNames.PivotTableSolveOrder, CommandNames.PivotTableListFormulas,
  CommandNames.PivotTableOptionsSub, CommandNames.PivotTableShowReportFilterPages,
  // Layout dropdown menu items.
  CommandNames.PivotTableSubtotalsNotShow, CommandNames.PivotTableSubtotalsAtBottom, CommandNames.PivotTableSubtotalsAtTop,
  CommandNames.PivotTableGrandTotalsOffRowColumn, CommandNames.PivotTableGrandTotalsOnRowColumn,
  CommandNames.PivotTableGrandTotalsOnRowOnly, CommandNames.PivotTableGrandTotalsOnColumnOnly,
  CommandNames.PivotTableReportLayoutShowInCompact, CommandNames.PivotTableReportLayoutShowInOutline,
  CommandNames.PivotTableReportLayoutShowInTabular, CommandNames.PivotTableReportLayoutRepeatAllItemLabels,
  CommandNames.PivotTableReportLayoutNotRepeatAllItemLabels,
  CommandNames.PivotTableInsertBlankRows, CommandNames.PivotTableRemoveBlankRows,
  // Field Setting dialog list items.
  CommandNames.PivotTableSummarizeValuesBySum, CommandNames.PivotTableSummarizeValuesByCount,
  CommandNames.PivotTableSummarizeValuesByAverage, CommandNames.PivotTableSummarizeValuesByMax,
  CommandNames.PivotTableSummarizeValuesByMin, CommandNames.PivotTableSummarizeValuesByProduct,
  // Field-list panel item menu.
  'pivotItemMoveUp', 'pivotItemMoveDown', 'pivotItemMoveBeginning', 'pivotItemMoveEnd',
  'pivotItemToFilter', 'pivotItemToRows', 'pivotItemToColumns', 'pivotItemToValues',
  'pivotItemRemove', 'pivotItemFieldSettings', 'pivotItemValueSettings',
]);

export function isPivotCommand(name: string): boolean {
  return pivotCommandNames.has(name);
}

/** Options of a pivot as a mutable record (our core keeps a plain object). */
function pivotOptions(pivot: PivotTable): Record<string, unknown> {
  return recordView(pivot.options);
}

/** Re-apply after an options change (the trial repaints the whole pivot). */
function reapply(pivot: PivotTable): void {
  pivot.suspendLayout();
  pivot.resumeLayout();
}

/** Run one model change on a pivot with paint batching + invalidation. */
export function withPivot(d: Designer, run: (pivot: PivotTable) => void): boolean {
  const pivot = pivotPanelTable(d);
  if (!pivot) return true;
  d.getWorkbook().suspendPaint();
  try {
    run(pivot);
  } finally {
    d.getWorkbook().resumePaint();
  }
  d.invalidate();
  return true;
}

/**
 * The command body for every pivot command (called from `executeDesignerSpecial`).
 * Dialogs open modally; model commands run directly through `withPivot` (the
 * pivot owns its cells, so the sheet-level undo bridge would fight it).
 */
export function executePivotCommand(d: Designer, name: string, value: unknown): boolean {
  switch (name) {
    case CommandNames.InsertPivotTable:
    case CommandNames.InsertPivotTableFromDataTable:
      d.showInsertPivotTable();
      return true;
    case CommandNames.PivotTableFieldList: {
      /* TASK 77 trial rule (probes t77-manualclose/t77-reopen): with no active pivot while the
       * panel is closed the execution is a no-op AND counts as a manual close — the panel stops
       * following the selection. A toggle on an active pivot opens (re-arming the follow) or
       * closes (disarming) the panel. */
      if (!d._pivotFieldListOpen && !activePivot(d)) {
        d._pivotFieldListFollow = false;
        return true;
      }
      setDockPane(d, 'pivot', !d._pivotFieldListOpen);
      d._pivotFieldListFollow = d._pivotFieldListOpen;
      if (d._pivotFieldListOpen) {
        d._pivotFieldListMounted = true;
        d._pivotFieldListName = pivotPanelTable(d)?.name() ?? activePivot(d)?.name() ?? null;
      } else {
        d._pivotFieldListName = null;
      }
      d.invalidate();
      return true;
    }
    case CommandNames.PivotTableRefresh:
    case CommandNames.PivotTableRibbonRefresh:
      return withPivot(d, (pivot) => pivot.refresh());
    case CommandNames.PivotTableChangeDataSource:
      d.showChangeDataSource();
      return true;
    case CommandNames.PivotTableMove:
      d.showMovePivotTable();
      return true;
    case CommandNames.PivotTableClearAll:
      return withPivot(d, (pivot) => {
        for (const field of pivot.getFieldsByArea()) pivot.updateField(field.fieldName, -1 as never);
      });
    case CommandNames.PivotTableClearFilters:
      return withPivot(d, (pivot) => {
        for (const field of pivot.getFieldsByArea()) {
          pivot.labelFilter(field.fieldName, null);
          pivot.valueFilter(field.fieldName, null);
        }
      });
    case CommandNames.PivotTableFieldSetting:
    case CommandNames.PivotTableValueFieldSetting: {
      const pivot = pivotPanelTable(d);
      if (!pivot) return true;
      const field = pivotActiveFieldName(d) || pivot.getFieldsByArea()[0]?.fieldName || '';
      if (!field) return true;
      const info = pivot.getField(field);
      if (info && info.pivotArea === 3) d.showValueFieldSettings(field);
      else d.showPivotFieldSettings(field);
      return true;
    }
    case CommandNames.PivotTableAutoFitColumn:
      return withPivot(d, (pivot) => pivot.autoFitColumn());
    case CommandNames.PivotTableExpandField:
      return expandCollapseField(d, false);
    case CommandNames.PivotTableCollapseField:
      return expandCollapseField(d, true);
    case CommandNames.PivotTableSummarizeValuesBySum: return applySubtotalType(d, 8);
    case CommandNames.PivotTableSummarizeValuesByCount: return applySubtotalType(d, 1);
    case CommandNames.PivotTableSummarizeValuesByAverage: return applySubtotalType(d, 0);
    case CommandNames.PivotTableSummarizeValuesByMax: return applySubtotalType(d, 3);
    case CommandNames.PivotTableSummarizeValuesByMin: return applySubtotalType(d, 4);
    case CommandNames.PivotTableSummarizeValuesByProduct: return applySubtotalType(d, 5);
    case CommandNames.PivotTableSubtotalsNotShow: return applyDimensionSubtotals(d, false, undefined);
    case CommandNames.PivotTableSubtotalsAtBottom: return applyDimensionSubtotals(d, true, 2);
    case CommandNames.PivotTableSubtotalsAtTop: return applyDimensionSubtotals(d, true, 1);
    case CommandNames.PivotTableGrandTotalsOffRowColumn: return applyOption(d, 'grandTotalPosition', 0);
    case CommandNames.PivotTableGrandTotalsOnRowColumn: return applyOption(d, 'grandTotalPosition', 3);
    case CommandNames.PivotTableGrandTotalsOnRowOnly: return applyOption(d, 'grandTotalPosition', 1);
    case CommandNames.PivotTableGrandTotalsOnColumnOnly: return applyOption(d, 'grandTotalPosition', 2);
    case CommandNames.PivotTableReportLayoutShowInCompact: return applyLayout(d, 0);
    case CommandNames.PivotTableReportLayoutShowInOutline: return applyLayout(d, 1);
    case CommandNames.PivotTableReportLayoutShowInTabular: return applyLayout(d, 2);
    case CommandNames.PivotTableReportLayoutRepeatAllItemLabels: return applyOption(d, 'fillDownLabels', true);
    case CommandNames.PivotTableReportLayoutNotRepeatAllItemLabels: return applyOption(d, 'fillDownLabels', false);
    case CommandNames.PivotTableInsertBlankRows: return applyOption(d, 'insertBlankLineAfterEachItem', true);
    case CommandNames.PivotTableRemoveBlankRows: return applyOption(d, 'insertBlankLineAfterEachItem', false);
    case CommandNames.PivotTableRowHeaders: return toggleOption(d, 'showRowHeader');
    case CommandNames.PivotTableColumnHeaders: return toggleOption(d, 'showColumnHeader');
    case CommandNames.PivotTableBandedRows: return toggleOption(d, 'bandRows');
    case CommandNames.PivotTableBandedColumns: return toggleOption(d, 'bandColumns');
    case CommandNames.PivotTableShowHeaders: return toggleOption(d, 'showHeaders');
    case CommandNames.PivotTableButtons: return toggleOption(d, 'showDrill');
    case CommandNames.PivotTableStyle:
      // The ribbon dropdown (menus.tsx) renders the style gallery; a direct
      // call with a theme key applies it.
      if (typeof value === 'string' && value) return applyOption2(d, (pivot) => pivot.theme(value));
      return true;
    case CommandNames.ClearPivotTableStyle:
      // The gallery's Clear entry resets the report to the neutral style.
      return withPivot(d, (pivot) => pivot.theme('light0'));
    case CommandNames.NewPivotTableStyle:
      d.showMessageBox('NotImplemented: creating custom pivot styles is not part of this milestone.', 'SpreadJS Designer', 1);
      return true;
    case CommandNames.PivotTableOptions:
      d.showPivotTableOptions();
      return true;
    /* TASK 77: the trial's Options dropdown entry opens the same dialog (measured identical
     * title/buttons/size — .probe/t77/run/t77-pivot-probe3.json). */
    case CommandNames.PivotTableOptionsSub:
      d.showPivotTableOptions();
      return true;
    case CommandNames.PivotTableCalculatedField:
      d.showCalculatedField();
      return true;
    case CommandNames.PivotTableCalculatedItem:
      d.showCalculatedItem();
      return true;
    case CommandNames.PivotTableSolveOrder:
      d.showCalcItemSolveOrder();
      return true;
    case CommandNames.PivotTableListFormulas:
      return listPivotFormulas(d);
    case CommandNames.PivotTableShowReportFilterPages:
      d.showReportFilterPages();
      return true;
    case CommandNames.PivotTableGroupSelection:
    case CommandNames.PivotTableGroupField:
      d.showMessageBox('NotImplemented: the pivot grouping dialog is not part of this milestone.', 'SpreadJS Designer', 1);
      return true;
    case CommandNames.PivotTableUnGroup:
      return withPivot(d, (pivot) => {
        const field = pivotActiveFieldName(d);
        if (!field) return;
        pivot.ungroup(field);
        reapply(pivot);
      });
    case CommandNames.PivotFilterConnections:
      return true; // disabled in the trial without the data-manager module
    case CommandNames.PivotTableName: {
      // Editing the ribbon name box renames the active pivot (trial parity).
      const next = typeof value === 'string' ? value.trim() : '';
      const pivot = activePivot(d);
      if (pivot && next && next !== pivot.name()) withPivot(d, (item) => { item.name(next); void item.refresh(); });
      return true;
    }
    case 'pivotItemMoveUp': return panelMoveItem(d, 'up');
    case 'pivotItemMoveDown': return panelMoveItem(d, 'down');
    case 'pivotItemMoveBeginning': return panelMoveItem(d, 'beginning');
    case 'pivotItemMoveEnd': return panelMoveItem(d, 'end');
    case 'pivotItemToFilter': return panelMoveItemTo(d, 0);
    case 'pivotItemToRows': return panelMoveItemTo(d, 1);
    case 'pivotItemToColumns': return panelMoveItemTo(d, 2);
    case 'pivotItemToValues': return panelMoveItemTo(d, 3);
    case 'pivotItemRemove': return panelRemoveItem(d);
    case 'pivotItemFieldSettings': {
      const field = d._pivotItemMenu?.fieldName ?? '';
      if (field) d.showPivotFieldSettings(field);
      return true;
    }
    case 'pivotItemValueSettings': {
      const field = d._pivotItemMenu?.fieldName ?? '';
      if (field) d.showValueFieldSettings(field);
      return true;
    }
    case CommandNames.PivotTableActiveField:
      return true; // ribbon text editors: committed through their own control path
    default:
      return false;
  }
}

/* ------------------------------------------------ option/model primitives --- */

function applyOption(d: Designer, key: string, value: unknown): boolean {
  return withPivot(d, (pivot) => {
    pivotOptions(pivot)[key] = value;
    reapply(pivot);
  });
}

function toggleOption(d: Designer, key: string): boolean {
  return withPivot(d, (pivot) => {
    const options = pivotOptions(pivot);
    options[key] = !options[key];
    reapply(pivot);
  });
}

function applyOption2(d: Designer, run: (pivot: PivotTable) => void): boolean {
  return withPivot(d, run);
}

function applyLayout(d: Designer, layout: number): boolean {
  return withPivot(d, (pivot) => pivot.layoutType(layout as never));
}

function applySubtotalType(d: Designer, subtotal: number): boolean {
  return withPivot(d, (pivot) => {
    const field = pivotActiveFieldName(d);
    if (!field) return;
    pivot.subtotalType(field, subtotal as never);
    reapply(pivot);
  });
}

function applyDimensionSubtotals(d: Designer, show: boolean, position: number | undefined): boolean {
  return withPivot(d, (pivot) => {
    const field = pivotActiveFieldName(d);
    if (!field) return;
    pivot.dimensionSubtotals(field, { show, position } as never);
    reapply(pivot);
  });
}

/** Expand/collapse every item of the active field (trial "Expand/Collapse Field"). */
function expandCollapseField(d: Designer, collapse: boolean): boolean {
  return withPivot(d, (pivot) => {
    const field = pivotActiveFieldName(d);
    if (!field) return;
    const items = pivot.getItemsByField(field) ?? [];
    for (const item of items) pivot.collapse(field, String(item), collapse);
    reapply(pivot);
  });
}

/* -------------------------------------------- field-list panel item ops --- */

function panelField(d: Designer): { pivot: PivotTable; fieldName: string; area: number; index: number } | null {
  const open = d._pivotItemMenu;
  const pivot = pivotPanelTable(d);
  if (!open || !pivot) return null;
  const info = pivot.getField(open.fieldName);
  if (!info) return null;
  return { pivot, fieldName: open.fieldName, area: info.pivotArea, index: info.pivotIndex ?? 0 };
}

function panelMoveItem(d: Designer, direction: 'up' | 'down' | 'beginning' | 'end'): boolean {
  return withPivot(d, (pivot) => {
    const target = panelField(d);
    if (!target) return;
    const siblings = pivot.getFieldsByArea(target.area as never).sort((a, b) => (a.pivotIndex ?? 0) - (b.pivotIndex ?? 0));
    const position = siblings.findIndex((f) => f.fieldName === target.fieldName);
    if (position < 0) return;
    const to = direction === 'up' ? position - 1 : direction === 'down' ? position + 1 : direction === 'beginning' ? 0 : siblings.length - 1;
    if (to < 0 || to >= siblings.length || to === position) return;
    pivot.updateField(target.fieldName, target.area as never, to);
  });
}

function panelMoveItemTo(d: Designer, area: number): boolean {
  return withPivot(d, (pivot) => {
    const target = panelField(d);
    if (!target || target.area === area) return;
    pivot.updateField(target.fieldName, area as never);
  });
}

function panelRemoveItem(d: Designer): boolean {
  return withPivot(d, (pivot) => {
    const target = panelField(d);
    if (!target) return;
    pivot.updateField(target.fieldName, -1 as never);
  });
}

/* --------------------------------------------------------- create / move --- */

/** The trial's defaults for a dialog-created pivot: outline layout, Light16. */
export const PIVOT_DIALOG_DEFAULTS = { layout: 1, theme: 'light16' } as const;

/** Create the pivot described by the Create PivotTable dialog payload. */
export function createPivot(d: Designer, data: { source: string; placement: string; location: string }): void {
  const wb = d.getWorkbook();
  const source = normalizeSourceRef(d, data.source) ?? data.source;
  const name = nextPivotName(d);
  let sheet: Worksheet;
  let row = 2;
  let col = 0;
  if (data.placement === 'existing') {
    const at = parseLocation(d, data.location) ?? { sheet: activeSheet(d).name(), row: 0, col: 0 };
    sheet = wb.getSheetFromName(at.sheet) ?? wb.getActiveSheet();
    row = at.row;
    col = at.col;
  } else {
    // Trial: the new worksheet (auto-named SheetN by the core counter) is
    // inserted first and the report lands on A3.
    wb.addSheet(0);
    sheet = wb.getSheet(0);
    row = 2;
    col = 0;
  }
  sheet.pivotTables.add(name, source, row, col, PIVOT_DIALOG_DEFAULTS.layout as never, PIVOT_DIALOG_DEFAULTS.theme);
  wb.setActiveSheet(sheet.name());
  // The trial leaves the selection on the pivot's top-left cell (contextual tabs appear).
  sheet.setActiveCell(row, col);
  // The trial opens the field list of the freshly created pivot (and arms the selection-follow
  // rule) and activates `PivotTable Analyze` — the trial's only automatic pivot-tab activation:
  // re-entering the pivot by selection later shows the tabs WITHOUT leaving the current tab
  // (probes t77-follow / t77-manualclose; see contextualTabsWithoutActivation).
  d._pivotFieldListMounted = true;
  setDockPane(d, 'pivot', true);
  d._pivotFieldListFollow = true;
  d._pivotFieldListName = name;
  d.activeTab = 'pivotTableAnalyze';
  d.invalidate();
}

/**
 * TASK 77 (probes t77-item2 / t77-reopen): a field-list drag/drop ACTIVATES the pivot in the
 * trial — the grid selection jumps to the pivot's top-left cell after every successful drop
 * (the follow rule then re-opens a hidden panel while follow mode is armed; with follow disarmed
 * the selection still jumps but the panel stays closed). Runs on the panel's `drop` event after
 * the core panel's own drop handlers (bubbling), so the field update is already applied.
 */
export function activatePivotAtPanelDrop(d: Designer, pivot: PivotTable): void {
  const pos = pivot.position();
  if (!pos) return;
  const wb = d.getWorkbook();
  const sheet = wb.getSheetFromName(pos.sheetName ?? '') ?? activeSheet(d);
  if (wb.getActiveSheet() !== sheet) wb.setActiveSheet(sheet.name());
  sheet.setActiveCell(pos.row, pos.col);
  sheet.setSelection(pos.row, pos.col, 1, 1);
}

/** Move the active pivot per the Move PivotTable dialog payload. */
export function movePivot(d: Designer, data: { placement: string; location: string }): void {
  const pivot = pivotPanelTable(d) ?? activePivot(d);
  if (!pivot) return;
  const wb = d.getWorkbook();
  if (data.placement === 'existing') {
    const at = parseLocation(d, data.location);
    if (!at) return;
    const sheet = wb.getSheetFromName(at.sheet) ?? wb.getActiveSheet();
    pivot.position(at.row, at.col, sheet.name());
    wb.setActiveSheet(sheet.name());
  } else {
    wb.addSheet(0);
    const sheetName = wb.getSheet(0).name();
    pivot.position(2, 0, sheetName);
    wb.setActiveSheet(sheetName);
  }
  d._pivotFieldListName = String(pivot.name());
  d.invalidate();
}

/* ------------------------------------------------------------ dialogs ---- */

/** Create-dialog validation: the range must resolve (the trial blocks OK). */
export function validatePivotSource(d: Designer, data: Record<string, unknown>): boolean {
  const ref = String(data.range ?? '').trim();
  return ref.length > 0 && normalizeSourceRef(d, ref) !== null;
}

export function showInsertPivotTable(d: Designer): void {
  d.showDialog(TemplateNames.InsertPivotTableDialogTemplate ?? 'insertPivotTableDialogTemplate', {
    dialogTitle: 'Create PivotTable',
    range: defaultSourceRef(d),
    placement: 'new',
    location: 'A1',
  }, (data) => {
    createPivot(d, { source: String(data.range ?? ''), placement: String(data.placement ?? 'new'), location: String(data.location ?? 'A1') });
  }, (error) => { if ((error as Error)?.message !== 'Cancelled') d.showMessageBox(String(error), 'Create PivotTable', 3); }, (data) => validatePivotSource(d, data as Record<string, unknown>));
}

export function showChangeDataSource(d: Designer): void {
  const pivot = pivotPanelTable(d) ?? activePivot(d);
  if (!pivot) return;
  const source = pivot.getSource();
  d.showDialog(TemplateNames.PivotTableChangeDataSourceTemplate ?? 'PivotTableChangeDataSourceTemplate', {
    dialogTitle: 'Change Data Source',
    range: typeof source === 'string' ? source : String(source.source ?? ''),
  }, (data) => {
    const normalized = normalizeSourceRef(d, String(data.range ?? ''));
    if (!normalized) return;
    withPivot(d, (item) => item.updateSource(normalized as never));
  }, (error) => { if ((error as Error)?.message !== 'Cancelled') d.showMessageBox(String(error), 'Change Data Source', 3); });
}

export function showMovePivotTable(d: Designer): void {
  const pivot = pivotPanelTable(d) ?? activePivot(d);
  if (!pivot) return;
  const pos = pivot.position() as { row: number; col: number } | undefined;
  d.showDialog(TemplateNames.MovePivotTableDialogTemplate ?? 'movePivotTableDialogTemplate', {
    dialogTitle: 'Move PivotTable',
    placement: 'new',
    location: `$${columnName(Math.max(0, pos?.col ?? 0))}$${Math.max(0, pos?.row ?? 0) + 1}`,
  }, (data) => {
    movePivot(d, { placement: String(data.placement ?? 'new'), location: String(data.location ?? 'A1') });
  }, (error) => { if ((error as Error)?.message !== 'Cancelled') d.showMessageBox(String(error), 'Move PivotTable', 3); });
}

/** Options dialog of the active pivot (PivotTable Analyze > Options). */
export function showPivotTableOptions(d: Designer): void {
  const pivot = pivotPanelTable(d) ?? activePivot(d);
  if (!pivot) return;
  d.showDialog(TemplateNames.PivotTableOptionsDialogTemplate ?? 'pivotTableOptionsDialogTemplate', {
    dialogTitle: 'PivotTable Options',
    pivotName: pivot.name(),
    printExpandCollapse: false,
    repeatRowLabels: false,
    setPrintTitles: false,
  }, (data) => {
    const next = String(data.pivotName ?? '').trim();
    if (next && next !== pivot.name()) pivot.name(next);
    d.invalidate();
  });
}

/** Field Settings (non-value field) for one field of the panel menu. */
export function showPivotFieldSettings(d: Designer, fieldName: string): void {
  const pivot = pivotPanelTable(d);
  if (!pivot) return;
  const info = pivot.getField(fieldName);
  const dimension = info ? pivot.dimensionSubtotals(fieldName) as { show?: boolean; position?: number } | undefined : undefined;
  const visible = dimension?.show !== false;
  const position = dimension?.position;
  d.showDialog('pivotFieldSettingsDialogTemplate', {
    dialogTitle: 'Field Settings',
    sourceName: info?.sourceName ?? fieldName,
    customName: fieldName,
    area: info?.pivotArea ?? 1,
    subtotals: !visible ? 'none' : position === 1 ? 'top' : 'automatic',
    customFunctions: [],
    showNoData: false,
    format: pivotInternals(pivot)._fieldFormatter?.(fieldName) ?? '',
  }, (data) => applyFieldSettings(d, fieldName, data));
}

export function showValueFieldSettings(d: Designer, fieldName: string): void {
  const pivot = pivotPanelTable(d);
  if (!pivot) return;
  const info = pivot.getField(fieldName);
  const shown = pivot.showDataAs(fieldName) as { showDataAs?: number; baseFieldName?: string; baseFieldItem?: string } | undefined;
  d.showDialog('pivotValueFieldSettingsDialogTemplate', {
    dialogTitle: 'Value Field Settings',
    sourceName: info?.sourceName ?? fieldName,
    customName: fieldName,
    subtotal: subtotalOfType(pivot, fieldName),
    showDataAs: shown?.showDataAs ?? 0,
    baseField: shown?.baseFieldName ?? '',
    baseItem: shown?.baseFieldItem ?? '',
    format: pivotInternals(pivot)._fieldFormatter?.(fieldName) ?? '',
  }, (data) => applyValueFieldSettings(d, fieldName, data));
}

/** Rename / re-subtotal a field per the Field Settings dialog payload. */
export function applyFieldSettings(d: Designer, fieldName: string, data: Record<string, unknown>): void {
  const pivot = pivotPanelTable(d);
  if (!pivot) return;
  d.getWorkbook().suspendPaint();
  try {
    const custom = String(data.customName ?? '').trim();
    let name = fieldName;
    if (custom && custom !== fieldName) {
      pivot.updateFieldName(fieldName, custom);
      name = custom;
    }
    const subtotals = String(data.subtotals ?? 'automatic');
    if (subtotals === 'none') pivot.subtotalVisible(name, false);
    else {
      pivot.subtotalVisible(name, true);
      if (subtotals === 'top') pivot.subtotalPosition(name, 1 as never);
      else if (subtotals === 'bottom') pivot.subtotalPosition(name, 2 as never);
    }
    if (data.showNoData !== undefined) pivot.showNoData(name, !!data.showNoData);
    const bridge = pivotInternals(pivot);
    if (typeof bridge._fieldFormatter === 'function' && data.format !== undefined) bridge._fieldFormatter(name, String(data.format ?? '') || null);
    reapply(pivot);
  } finally {
    d.getWorkbook().resumePaint();
  }
  d.invalidate();
}

/** Rename / re-aggregate / show-values-as / number-format per the Value Field Settings payload. */
export function applyValueFieldSettings(d: Designer, fieldName: string, data: Record<string, unknown>): void {
  const pivot = pivotPanelTable(d);
  if (!pivot) return;
  d.getWorkbook().suspendPaint();
  try {
    const custom = String(data.customName ?? '').trim();
    let name = fieldName;
    if (custom && custom !== fieldName) {
      pivot.updateFieldName(fieldName, custom);
      name = custom;
    }
    pivot.subtotalType(name, Number(data.subtotal ?? 8) as never);
    const showDataAs = Number(data.showDataAs ?? 0);
    if (showDataAs === 0) pivot.showDataAs(name, null as never);
    else {
      const fields = pivot.getSourceFields().map((field) => field.name);
      pivot.showDataAs(name, {
        showDataAs: showDataAs as never,
        baseFieldName: data.baseField ? String(data.baseField) : fields[0],
        baseFieldItem: data.baseItem ? String(data.baseItem) : '(all)',
      } as never);
    }
    const bridge = pivotInternals(pivot);
    if (typeof bridge._fieldFormatter === 'function' && data.format !== undefined) bridge._fieldFormatter(name, String(data.format ?? '') || null);
    reapply(pivot);
  } finally {
    d.getWorkbook().resumePaint();
  }
  d.invalidate();
}

/** The trial's summarize list, in the dialog's order (GC.Pivot.SubtotalType values). */
export const SUBTOTAL_ITEMS = [
  { text: 'Sum', value: 8 }, { text: 'Count', value: 1 }, { text: 'Average', value: 0 },
  { text: 'Max', value: 3 }, { text: 'Min', value: 4 }, { text: 'Product', value: 5 },
  { text: 'Count Numbers', value: 2 }, { text: 'StdDev', value: 6 }, { text: 'StdDevp', value: 7 },
  { text: 'Var', value: 9 }, { text: 'Varp', value: 10 },
];

/** The trial's `Show Value As` list (dialog captions; GC.Pivot.PivotShowDataAs values). */
export const SHOW_DATA_AS_ITEMS = [
  { text: 'No Calculation', value: 0 }, { text: '% of Grand Total', value: 1 },
  { text: '% of Column Total', value: 3 }, { text: '% of Row Total', value: 2 },
  { text: '% Of ...', value: 4 }, { text: '% of Parent Row Total', value: 5 },
  { text: '% of Parent Column Total', value: 6 }, { text: '% of Parent Total ...', value: 7 },
  { text: 'Difference From ...', value: 8 }, { text: '% Difference From ...', value: 9 },
  { text: 'Running Total In ...', value: 10 }, { text: '% Running Total In ...', value: 11 },
  { text: 'Rank Smallest to Largest ...', value: 12 }, { text: 'Rank Largest to Smallest ...', value: 13 },
  { text: 'Index', value: 14 },
];

function subtotalOfType(pivot: PivotTable, fieldName: string): number {
  try {
    const value = pivot.subtotalType(fieldName) as number | undefined;
    return typeof value === 'number' ? value : 8;
  } catch {
    return 8;
  }
}

/* ------------------------------------------- contextual tab state ---- */

/** Enablement of the pivot commands (mirrors the trial's greyed-out buttons). */
export function pivotCommandEnabled(d: Designer, name: string): boolean | undefined {
  if (!isPivotCommand(name)) return undefined;
  if (name === CommandNames.InsertPivotTable || name === CommandNames.InsertPivotTableFromDataTable) return true;
  const pivot = activePivot(d);
  if (!pivot) return false;
  const options = pivotOptions(pivot);
  switch (name) {
    case CommandNames.PivotTableActiveField: return false; // read-only mirror in the trial
    case CommandNames.PivotTableButtons: return options.showDrill !== undefined ? true : true;
    case CommandNames.PivotTableFieldSetting:
    case CommandNames.PivotTableValueFieldSetting: return !!pivotActiveFieldName(d);
    case CommandNames.PivotTableClearAll: return pivot.getFieldsByArea().length > 0;
    case CommandNames.PivotTableExpandField:
    case CommandNames.PivotTableCollapseField: return !!pivotActiveFieldName(d) && pivot.getFieldsByArea(1 as never).length > 0;
    default: return true;
  }
}

/** Checked/value state of the pivot commands for the ribbon controls. */
export function pivotCommandState(d: Designer, name: string): { checked?: boolean; value?: string | number } | undefined {
  if (!isPivotCommand(name)) return undefined;
  const pivot = activePivot(d);
  if (!pivot) return undefined;
  const options = pivotOptions(pivot);
  switch (name) {
    case CommandNames.PivotTableFieldList: return { checked: d._pivotFieldListOpen };
    case CommandNames.PivotTableRowHeaders: return { checked: options.showRowHeader !== false };
    case CommandNames.PivotTableColumnHeaders: return { checked: options.showColumnHeader !== false };
    case CommandNames.PivotTableBandedRows: return { checked: !!options.bandRows };
    case CommandNames.PivotTableBandedColumns: return { checked: !!options.bandColumns };
    case CommandNames.PivotTableShowHeaders: return { checked: options.showHeaders !== false };
    case CommandNames.PivotTableButtons: return { checked: options.showDrill !== false };
    case CommandNames.PivotTableName: return { value: String(pivot.name()) };
    case CommandNames.PivotTableActiveField: return { value: pivotActiveFieldName(d) };
    default: return undefined;
  }
}

/* =========== TASK 77: calculated fields/items, solve order, list formulas ===========
 * Measured on the trial through the live Designer (apps/designer-compare, server 5188;
 * .probe/t77/run/t77-pivot-probe3.json, t77-pivot-dialogs.json, t77-pivot-semantics.json,
 * t77-calc-open.json and probes 9-14):
 *  - every Fields/Items & Sets entry opens a dialog; List Formulas writes a report sheet;
 *  - the dialogs apply their model change when the inner Add/Modify/Delete is clicked and
 *    OK/Cancel only close them (Cancel does NOT undo an earlier Add — measured);
 *  - the calculated-field Add is reproduced by the two public calls
 *      pivotTable.addCalcField(name, formula)
 *      pivotTable.add(name, 'Sum of ' + name, PivotTableFieldType.valueField, SubtotalType.sum)
 *    which give byte-identical `getCalcFields()`, `getFieldsByArea()` and pivot cell values on
 *    both sides (.probe/t77/run/t77-pivot-semantics.json, probe 8);
 *  - the solve-order list shows one `source[item] = formula` row per calculated item ordered by
 *    priority, Move Up/Move Down swaps the priorities, Delete drops the item. Our core keeps the
 *    priority on `updateCalcItem` (a core-model gap, out of the designer's scope), so the designer
 *    re-orders through the public remove/add API: re-adding writes the items in the new order and
 *    assigns 1..n — the state the trial's own remove/re-add measurement produces
 *    (.probe/t77/run/t77-pivot-semantics.json, probe 5D).
 */

/** The pivots of the sheet that hosts `pivot` (List Formulas works per pivot table). */
export function pivotsOfSheet(d: Designer, pivot: PivotTable): PivotTable[] {
  const wb = d.getWorkbook();
  for (let i = 0; i < wb.getSheetCount(); i++) {
    const pivots = wb.getSheet(i).pivotTables.all();
    if (pivots.some((item) => item.name() === pivot.name())) return pivots;
  }
  return [pivot];
}

/** The pivot the TASK 77 dialogs target: the panel pivot, else the one under the active cell. */
export function dialogPivot(d: Designer): PivotTable | null {
  return pivotPanelTable(d) ?? activePivot(d);
}

/** Calculated fields as the trial lists them: `getCalcFields()` answers the display name. */
export function calcFieldEntries(pivot: PivotTable): { name: string; formula: string }[] {
  return pivot.getCalcFields().map((field) => ({ name: String(field.fieldName), formula: String(field.formula ?? '') }));
}

/** Source fields (Insert Calculated Field's Fields list — measured: source names). */
export function sourceFieldNames(pivot: PivotTable): string[] {
  return pivot.getSourceFields().map((field) => String(field.name));
}

/** Pivot fields (Insert Calculated Item's Fields list — measured: display names). */
export function pivotFieldNames(pivot: PivotTable): string[] {
  return pivot.getFieldsByArea().map((field) => String(field.fieldName));
}

/** The items of one pivot field (Insert Calculated Item's Items list). */
export function pivotItemNames(pivot: PivotTable, fieldName: string): string[] {
  try {
    const items = pivot.getItemsByField(fieldName);
    return Array.isArray(items) ? items.map((item) => String(item)) : [];
  } catch {
    return [];
  }
}

const sumSubtotal = (d: Designer): number => d.gc.Pivot.SubtotalType.sum;
const valueArea = (d: Designer): number => d.gc.Spread.Pivot.PivotTableFieldType.valueField;

/** Trial: Add creates the calculated value field; returns the display name it materialised. */
export function applyCalcFieldAdd(d: Designer, name: string, formula: string): string | null {
  const pivot = dialogPivot(d);
  const field = String(name ?? '').trim();
  const src = String(formula ?? '').trim();
  if (!pivot || !field || !src) return null;
  if (calcFieldEntries(pivot).some((item) => item.name === field || item.name === `Sum of ${field}`)) {
    d.showMessageBox(`Calculated item or field could not be created because another calculated item or field with the same name already exists: "${field}".`, 'Insert Calculated Field', 2);
    return null;
  }
  d.getWorkbook().suspendPaint();
  try {
    pivot.addCalcField(field, src);
    pivot.add(field, `Sum of ${field}`, valueArea(d) as never, sumSubtotal(d) as never);
  } finally {
    d.getWorkbook().resumePaint();
  }
  d.invalidate();
  return `Sum of ${field}`;
}

/** Trial: Modify replaces the formula of an existing calculated field (remove + re-add). */
export function applyCalcFieldModify(d: Designer, name: string, formula: string): string | null {
  const pivot = dialogPivot(d);
  const field = String(name ?? '').trim();
  if (!pivot || !field) return null;
  const src = String(formula ?? '').trim();
  d.getWorkbook().suspendPaint();
  try {
    pivot.removeCalcField(field);
    pivot.removeCalcField(`Sum of ${field}`);
    pivot.addCalcField(field, src);
    pivot.add(field, `Sum of ${field}`, valueArea(d) as never, sumSubtotal(d) as never);
  } finally {
    d.getWorkbook().resumePaint();
  }
  d.invalidate();
  return `Sum of ${field}`;
}

/** Trial: Delete drops the calculated field from the report and the cache. */
export function applyCalcFieldDelete(d: Designer, name: string): void {
  const pivot = dialogPivot(d);
  const field = String(name ?? '').trim();
  if (!pivot || !field) return;
  d.getWorkbook().suspendPaint();
  try {
    pivot.removeCalcField(field);
    pivot.removeCalcField(`Sum of ${field}`);
  } finally {
    d.getWorkbook().resumePaint();
  }
  d.invalidate();
}

/** Trial: Add creates a calculated item in the field the dialog is bound to. */
export function applyCalcItemAdd(d: Designer, sourceName: string, name: string, formula: string): string | null {
  const pivot = dialogPivot(d);
  const source = String(sourceName ?? '').trim();
  const item = String(name ?? '').trim();
  const src = String(formula ?? '').trim();
  if (!pivot || !source || !item || !src) return null;
  if (pivot.getCalcItems(source).some((entry) => String(entry.calcItemName) === item)) {
    d.showMessageBox(`Calculated item or field could not be created because another calculated item or field with the same name already exists: "${item}".`, 'Insert Calculated Item', 2);
    return null;
  }
  d.getWorkbook().suspendPaint();
  try {
    pivot.addCalcItem(source, item, src);
  } finally {
    d.getWorkbook().resumePaint();
  }
  d.invalidate();
  return item;
}

/** Trial: Delete drops one calculated item. */
export function applyCalcItemDelete(d: Designer, sourceName: string, name: string): void {
  const pivot = dialogPivot(d);
  if (!pivot) return;
  d.getWorkbook().suspendPaint();
  try {
    pivot.removeCalcItem(String(sourceName), String(name));
    reapply(pivot);
  } finally {
    d.getWorkbook().resumePaint();
  }
  d.invalidate();
}

/** One solve-order entry: `source[item] = formula`, in the trial's priority order. */
export function solveOrderEntries(pivot: PivotTable): { sourceName: string; calcItemName: string; formula: string; priority: number }[] {
  return pivot.getCalcItems()
    .map((item) => ({
      sourceName: String(item.sourceName),
      calcItemName: String(item.calcItemName),
      formula: String(item.formula ?? ''),
      priority: Number(item.priority) || 0,
    }))
    .sort((a, b) => a.priority - b.priority || a.calcItemName.localeCompare(b.calcItemName));
}

/**
 * Move Up/Move Down of the Solve Order dialog. The trial swaps the priorities (measured probe 9:
 * after Move Up of the second entry `getCalcItems()` answers `[ItemA priority 2, ItemB priority 1]`
 * and its report serialises the items in the new order). Our core's `updateCalcItem` keeps the
 * stored priority, so the designer rewrites the item list through the public API — the same
 * remove/re-add sequence the trial's own public API accepts (probe 5D) — which lands the items in
 * the new order with priorities 1..n.
 */
export function moveCalcItem(d: Designer, entry: { sourceName: string; calcItemName: string; formula: string }, direction: 'up' | 'down'): void {
  const pivot = dialogPivot(d);
  if (!pivot) return;
  const items = solveOrderEntries(pivot);
  const index = items.findIndex((item) => item.sourceName === entry.sourceName && item.calcItemName === entry.calcItemName);
  if (index < 0) return;
  const swap = direction === 'up' ? index - 1 : index + 1;
  if (swap < 0 || swap >= items.length) return;
  const next = items.slice();
  const tmp = next[index];
  next[index] = next[swap];
  next[swap] = tmp;
  d.getWorkbook().suspendPaint();
  try {
    for (const item of items) pivot.removeCalcItem(item.sourceName, item.calcItemName);
    for (const item of next) pivot.addCalcItem(item.sourceName, item.calcItemName, item.formula);
    reapply(pivot);
  } finally {
    d.getWorkbook().resumePaint();
  }
  d.invalidate();
}

/** PivotTable Analyze ▸ Fields, Items & Sets ▸ List Formulas (measured layout, probe 12). */
const LIST_FORMULA_NOTES: [row: number, col: number, text: string][] = [
  [0, 0, 'Note:'],
  [0, 1, 'When a cell is updated by more than one formula,'],
  [1, 1, 'the value is set by the formula with the last solve order.'],
  [3, 1, 'To change the solve order for multiple calculated items or fields,'],
  [4, 1, 'on the Options tab, in the Calculations group, click Fields, Items, & Sets, and then click Solve Order.'],
];

export function listPivotFormulas(d: Designer): boolean {
  const target = dialogPivot(d);
  if (!target) return true;
  const fields: { name: string; formula: string }[] = [];
  const items: { label: string; formula: string; order: number }[] = [];
  for (const pivot of pivotsOfSheet(d, target)) {
    for (const field of calcFieldEntries(pivot)) fields.push(field);
    /* The trial numbers the field block 0..n-1 and the item block by the item's priority
     * (1-based, probe 12: fields 0,1 and items 1,2); our core's priority bookkeeping is a
     * core-model gap, so the rank in the trial's own priority order is used. */
    solveOrderEntries(pivot).forEach((item, index) => {
      const formula = item.formula.startsWith('=') ? item.formula : `=${item.formula}`;
      items.push({ label: `${item.sourceName}[${item.calcItemName}]`, formula, order: index + 1 });
    });
  }
  const wb = d.getWorkbook();
  const index = wb.getSheetCount();
  wb.addSheet(index);
  const sheet = wb.getSheet(index);
  const set = (row: number, col: number, value: string | number): void => sheet.setValue(row, col, value);
  let row = 0;
  set(row++, 0, 'Calculated Field');
  /* Trial: only the calculated-FIELD header row carries the thin bottom border (probe 12:
   * `style: {borderBottom: {style: 1}}` on 1,0/1,1/1,2; the item header row has none). */
  for (const [col, text] of [[0, 'Solve Order'], [1, 'Field'], [2, 'Formula']] as [number, string][]) {
    set(row, col, text);
    rangeWriter(sheet.getRange(row, col, 1, 1)).setBorder({ style: 1 }, { bottom: true });
  }
  row++;
  fields.forEach((field, i) => { set(row, 0, i); set(row, 1, field.name); set(row, 2, field.formula); row++; });
  row++;
  set(row++, 0, 'Calculated Item');
  for (const [col, text] of [[0, 'Solve Order'], [1, 'Item'], [2, 'Formula']] as [number, string][]) set(row, col, text);
  row++;
  items.forEach((item) => { set(row, 0, item.order); set(row, 1, item.label); set(row, 2, item.formula); row++; });
  row += 2;
  for (const [offset, col, text] of LIST_FORMULA_NOTES) set(row + offset, col, text);
  /* Trial geometry (probe 12): column A 100 px, column B 596 px, column C auto-fitted to the
   * longest formula (205 px for `=GetPivotData("Region","North")`, 221 px for `…)+1`). */
  sheet.setColumnWidth(0, 100);
  sheet.setColumnWidth(1, 596);
  sheet.autoFitColumn(2);
  wb.setActiveSheetIndex(index);
  d.invalidate();
  return true;
}

/** PivotTable Analyze ▸ Options ▸ PivotTable Options dropdown entry + Show Report Filter Pages. */
export function showReportFilterPages(d: Designer): void {
  const pivot = dialogPivot(d);
  if (!pivot) return;
  const filterFields = pivot.getFieldsByArea(d.gc.Spread.Pivot.PivotTableFieldType.filterField as never);
  /* Trial (probe 3 vs probe 11): with a report-filter field the command opens its confirmation
   * dialog; a pivot without one changes nothing on either side and no dialog appears. */
  if (!filterFields.length) return;
  d.showDialog(TemplateNames.PivotShowReportFilterDialogTemplate ?? 'pivotShowReportFilterDialogTemplate', {
    dialogTitle: 'Show Report Filter Pages',
    filterFields: filterFields.map((field) => String(field.fieldName)),
  }, () => {
    /* Trial (measured, probe 11): with the report filter at (All) the confirmed dialog leaves the
     * workbook untouched — producing one filtered copy per page item needs a page-filter selection
     * the public contract does not expose (recorded in docs/STATUS.md, TASK 77). */
  });
}

/** Insert Calculated Field (trial title/defaults, probes 4/13/14). */
export function showCalculatedField(d: Designer): void {
  const pivot = dialogPivot(d);
  if (!pivot) return;
  d.showDialog(TemplateNames.CalculatedFieldsDialogTemplate ?? 'calculatedFieldsDialogTemplate', {
    dialogTitle: 'Insert Calculated Field',
    name: 'Field1',
    formula: '= 0',
    sourceFields: sourceFieldNames(pivot),
    calcFields: calcFieldEntries(pivot).map((field) => field.name),
  }, () => undefined);
}

/** Insert Calculated Item in "<active field>" (trial title/defaults, probes 4/14). */
export function showCalculatedItem(d: Designer): void {
  const pivot = dialogPivot(d);
  if (!pivot) return;
  const field = pivotActiveFieldName(d) || pivotFieldNames(pivot)[0] || '';
  d.showDialog(TemplateNames.CalculatedItemsDialogTemplate ?? 'calculatedItemsDialogTemplate', {
    dialogTitle: `Insert Calculated Item in "${field}"`,
    sourceName: field,
    name: 'Formula1',
    formula: '= 0',
    pivotFields: pivotFieldNames(pivot),
    items: pivotItemNames(pivot, field),
  }, () => undefined);
}

/** Calculated Item Solve Order (trial title/list/buttons/note, probe 9). */
export function showCalcItemSolveOrder(d: Designer): void {
  const pivot = dialogPivot(d);
  if (!pivot) return;
  d.showDialog(TemplateNames.CalculatedItemSolveOrderDialogTemplate ?? 'calculatedItemSolveOrderDialogTemplate', {
    dialogTitle: 'Calculated Item Solve Order',
    entries: solveOrderEntries(pivot),
  }, () => undefined);
}
