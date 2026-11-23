/**
 * Data source for the Designer's context menus. Reproduces the reference
 * product's entries, order, submenu flags and disabled state per work area
 * (entries collected black-box in .probe/t6/OFFICIAL-MENUS.md).
 */
import type { DesignerApi as Designer } from './designer-api.js';
import type { Table, Worksheet } from './core-internals.js';
import { chartInternals, internals, pivotTablesOf } from './core-internals.js';
import { resolveText } from './resolve.js';
/** TASK 87: resource placeholder for a context-menu label (`contextMenu.<key>` subtree). */
const cm = (key: string): string => `\${res.contextMenu.${key}}`;

/** TASK 87: menu labels that exist in the resource tree follow the loaded language package. */
const res = (d: Designer, key: string, fallback: string): string => resolveText(`\${res.contextMenu.${key}}`, d.resources) || fallback;

export interface ContextSubItem { id?: string; label: string; disabled?: boolean; icon?: string; action: () => void }
export interface ContextItem {
  id: string;
  label: string;
  disabled?: boolean;
  icon?: string;
  separator?: boolean;
  shortcut?: string;
  action?: () => void;
  submenu?: ContextSubItem[];
  /** Present on the "Paste Options:" icon row (rendered as 6 icon buttons). */
  pasteRow?: { id: string; icon: string; title: string; action: () => void }[];
}
export interface ContextMenuState { kind: 'cell' | 'row' | 'col' | 'corner' | 'tab' | 'shape' | 'chart'; row: number; col: number; objectName?: string }

interface TableRef { table: Table; range: { row: number; col: number; rowCount: number; colCount: number } }

const PASTE_ROW = (d: Designer, anchor: () => void): ContextItem['pasteRow'] => {
  // The trial pastes into the right-clicked cell, so every button re-anchors the selection first.
  const mode = (command: string) => () => { anchor(); d.executeBuiltin(command); };
  // Trial row order (TASK 55): clipboard+page, +fx, +123, +%-brush, +%-123, +%-fx.
  return [
    { id: 'pasteAll', icon: 'context-paste-all', title: cm('pasteAll'), action: mode('pasteAll') },
    { id: 'pasteFormula', icon: 'context-paste-formula', title: cm('pasteFormula'), action: mode('pasteFormulas') },
    { id: 'pasteValues', icon: 'context-paste-values', title: cm('pasteValue'), action: mode('pasteValues') },
    { id: 'pasteFormatting', icon: 'context-paste-formatting', title: cm('pasteFormatting'), action: mode('pasteFormatting') },
    { id: 'pasteValuesFormatting', icon: 'context-paste-values-formatting', title: cm('valuesFormatting'), action: mode('pasteValuesAndFormatting') },
    { id: 'pasteFormulaFormatting', icon: 'context-paste-formula-formatting', title: cm('formulaFormatting'), action: mode('pasteFormulasAndFormatting') },
  ];
};

/** Table whose range contains the cell (null when outside any table). */
export function tableAt(sheet: { tables: { all(): Table[] } }, row: number, col: number): TableRef | null {
  for (const table of sheet.tables.all()) {
    const r = table.range();
    if (row >= r.row && row < r.row + r.rowCount && col >= r.col && col < r.col + r.colCount) return { table, range: { row: r.row, col: r.col, rowCount: r.rowCount, colCount: r.colCount } };
  }
  return null;
}

/** True when the cell lies inside any pivot table's range (public PivotTable.getRange API:
 *  returns { page, content } — the content area is the on-sheet grid of the pivot). */
function pivotAt(sheet: Worksheet, row: number, col: number): boolean {
  for (const pivot of pivotTablesOf(sheet).all()) {
    const ranges = [pivot.getRange()?.content, pivot.getRange()?.page].filter(Boolean) as { row: number; col: number; rowCount: number; colCount: number }[];
    for (const r of ranges) {
      if (row >= r.row && row < r.row + r.rowCount && col >= r.col && col < r.col + r.colCount) return true;
    }
  }
  return false;
}

/** Selection bounds clamped to the table so Insert/Delete submenu actions stay inside it. */
function selectionBounds(sheet: Worksheet, range: TableRef['range']): { startRow: number; endRow: number; startCol: number; endCol: number } {
  const sel = sheet.getSelections()[0] ?? { row: -1, col: -1, rowCount: 0, colCount: 0 };
  const startRow = sel.row >= range.row ? sel.row : range.row;
  const endRow = sel.row >= 0 && sel.rowCount > 0 && sel.row + sel.rowCount - 1 <= range.row + range.rowCount - 1 ? sel.row + sel.rowCount - 1 : range.row + range.rowCount - 1;
  const startCol = sel.col >= range.col ? sel.col : range.col;
  const endCol = sel.col >= 0 && sel.colCount > 0 && sel.col + sel.colCount - 1 <= range.col + range.colCount - 1 ? sel.col + sel.colCount - 1 : range.col + range.colCount - 1;
  return { startRow, endRow, startCol, endCol };
}


/** Builds the menu entries for the given right-click context. */
export function buildContextItems(d: Designer, menu: ContextMenuState): ContextItem[] {
  const sheet: Worksheet = d.getWorkbook().getActiveSheet();
  const clip = internals(sheet)._clipboardMode();
  const anchor = (): void => { if (menu.row >= 0 && menu.col >= 0) { sheet.setActiveCell(menu.row, menu.col); sheet.setSelection(menu.row, menu.col, 1, 1); } };
  const run = (action: () => void): (() => void) => () => { anchor(); action(); };
  const focus = (axis: 'row' | 'col'): (() => void) => () => {
    if (axis === 'row' && menu.row >= 0) { sheet.setSelection(menu.row, -1, 1, -1); }
    if (axis === 'col' && menu.col >= 0) { sheet.setSelection(-1, menu.col, -1, 1); }
  };

  const clipboardHead = (pasteSpecial: boolean): ContextItem[] => {
    const head: ContextItem[] = [
      { id: 'cut', label: cm('cut'), icon: 'ribbon-button-cut', action: () => d.executeBuiltin('cut') },
      { id: 'copy', label: cm('copy'), icon: 'ribbon-button-copy', action: () => d.executeBuiltin('copy') },
      { id: 'pasteOptions', label: cm('pasteOptions'), pasteRow: PASTE_ROW(d, anchor) },
    ];
    if (pasteSpecial && clip === 'copy') head.push({ id: 'pasteSpecial', label: cm('pasteSpecial'), action: () => d.showPasteSpecial() });
    return head;
  };

  if (menu.kind === 'row' || menu.kind === 'col') {
    const isRow = menu.kind === 'row';
    const select = focus(isRow ? 'row' : 'col');
    const items: ContextItem[] = clipboardHead(clip !== 'none');
    if (clip === 'none') items.push({ id: 'insert', label: cm('insert'), action: () => { select(); d.executeBuiltin(isRow ? 'insertSheetRows' : 'insertSheetColumns'); } });
    items.push(
      { id: 'delete', label: cm('delete'), action: () => { select(); d.executeBuiltin(isRow ? 'deleteSheetRows' : 'deleteSheetColumns'); } },
      { id: 'clear', label: cm('clearContents'), action: () => { select(); d.executeBuiltin('clearContent'); } },
    );
    if (clip === 'copy') items.push({ id: 'insertCopiedCells', label: cm('insertCopiedCells'), action: () => { select(); d.runUndoable('insertCopiedCellsDirection', { direction: isRow ? 'down' : 'right' }); } });
    if (clip === 'cut') items.push({ id: 'insertCutCells', label: cm('insertCutCells'), action: () => { select(); d.runUndoable('insertCutCellsDirection', { direction: isRow ? 'down' : 'right' }); } });
    items.push(
      { id: 'format', label: res(d, 'formatCells', 'Format Cells...'), icon: 'ribbon-button-format', action: () => { select(); d.showFormatCells(); } },
    );
    // The trial shows "Transform Cells..." on both header menus; a header fully inside a
    // table behaves like a table cell and the trial suppresses it there (.probe/t51 evidence:
    // live plain-sheet probe shows it on col C, the table-covered pass2 crop did not).
    const headerInTable = isRow ? sheet.tables.all().some((t) => { const r = t.range(); return menu.row >= r.row && menu.row < r.row + r.rowCount; })
      : sheet.tables.all().some((t) => { const r = t.range(); return menu.col >= r.col && menu.col < r.col + r.colCount; });
    if (!headerInTable) items.push({ id: 'transform', label: cm('transformCells'), icon: 'context-transform-cells', action: () => { select(); d.showTransformCells(); } });
    items.push(
      { id: 'tag', label: cm('tag'), action: () => { select(); d.showHeaderTag(isRow ? 'row' : 'col', isRow ? menu.row : menu.col); } },
      { id: 'size', label: isRow ? 'Row Height...' : 'Column Width...', action: () => { select(); d.showDimensionDialog(isRow ? 'row' : 'column'); } },
      { id: 'hide', label: cm('hide'), action: () => { select(); d.executeBuiltin(isRow ? 'hideRows' : 'hideColumns'); } },
      { id: 'unhide', label: cm('unhide'), action: () => { select(); d.executeBuiltin(isRow ? 'unHideRows' : 'unHideColumns'); } },
      { id: 'headers', label: cm('headers'), action: () => { select(); d.showHeadersDialog(isRow ? 'row' : 'col', isRow ? menu.row : menu.col); } },
    );
    if (!isRow) items.push({ id: 'outlineColumn', label: cm('outlineColumn'), action: () => { select(); d.showOutlineColumnDialog(menu.col); } });
    return items;
  }

  if (menu.kind === 'corner') {
    const items: ContextItem[] = clipboardHead(clip !== 'none');
    items.push(
      { id: 'clear', label: cm('clearContents'), action: () => d.executeBuiltin('clearContent') },
      { id: 'filter', label: cm('filter'), action: () => d.executeBuiltin('setFilterData') },
      sortItem(d, sheet, true),
    );
    const cornerTable = sheet.tables.all()[0];
    if (cornerTable) {
      // With a table on the sheet the trial swaps "Transform Cells..." for a Table submenu
      // placed before Format Cells (.probe/t51/out/official/m2-corner.png).
      items.push(tableItem(d, sheet, tableAt(sheet, 0, 0)?.table ?? cornerTable));
      items.push({ id: 'format', label: res(d, 'formatCells', 'Format Cells...'), icon: 'ribbon-button-format', action: () => d.showFormatCells() });
    } else {
      items.push(
        { id: 'format', label: res(d, 'formatCells', 'Format Cells...'), icon: 'ribbon-button-format', action: () => d.showFormatCells() },
        { id: 'transform', label: cm('transformCells'), icon: 'context-transform-cells', action: () => d.showTransformCells() },
      );
    }
    if (hasHyperlinkInRange(sheet)) items.push({ id: 'removeHyperlinks', label: cm('removeHyperlinks'), action: () => d.runUndoable('removeHyperlinks', {}) });
    items.push(
      { id: 'defineName', label: cm('defineName'), action: () => d.showNewName() },
      { id: 'tag', label: cm('tag'), action: () => d.showCornerTag() },
    );
    return items;
  }

  if (menu.kind === 'cell') {
    const inTable = tableAt(sheet, menu.row, menu.col);
    // Pivot-table range behaves like a menu-wise table: the trial suppresses
    // "Transform Cells..." there (.probe/t51/out/official/menu-pivot-sub7.png).
    // T55 pass 2 Custom Sort rule: the live trial keeps "Custom Sort..." ENABLED for plain,
    // empty and table cells (hover-read in ?side=official, 2026-11-18; the greyed items in
    // menu-tablecell/menu-cell-sub7.png belong to dimmed/modal captures), while
    // menu-pivot-sub7.png shows the only genuine grey — inside a pivot range.
    const inPivot = pivotAt(sheet, menu.row, menu.col);
    const items: ContextItem[] = clipboardHead(clip !== 'none');
    if (clip === 'none') {
      if (inTable) {
        items.push(insertTableSubmenu(d, sheet, inTable), deleteTableSubmenu(d, sheet, inTable));
      } else {
        items.push(
          { id: 'insertCells', label: cm('insert2'), action: run(() => d.showInsertCellsDialog()) },
          { id: 'deleteCells', label: cm('delete2'), action: run(() => d.showDeleteCellsDialog()) },
        );
      }
    } else if (clip === 'copy') {
      if (inTable) items.push(insertTableSubmenu(d, sheet, inTable), deleteTableSubmenu(d, sheet, inTable));
      else items.push({ id: 'deleteCells', label: cm('delete2'), action: run(() => d.showDeleteCellsDialog()) });
    } else {
      items.push({ id: 'deleteCells', label: cm('delete2'), action: run(() => d.showDeleteCellsDialog()) });
    }
    items.push({ id: 'clear', label: cm('clearContents'), action: run(() => d.executeBuiltin('clearContent')) });
    if (clip === 'copy' && !inTable) items.push({ id: 'insertCopiedCells', label: cm('insertCopiedCells2'), action: () => undefined, submenu: shiftSubmenu(d, 'copied', run) });
    if (clip === 'cut' && !inTable) items.push({ id: 'insertCutCells', label: cm('insertCutCells2'), action: () => undefined, submenu: shiftSubmenu(d, 'cut', run) });
    items.push(
      { id: 'filter', label: cm('filter'), action: run(() => d.executeBuiltin('setFilterData')) },
      sortItem(d, sheet, inPivot),
    );
    if (inTable) items.push(tableItem(d, sheet, inTable.table));
    const comment = sheet.comments.get(menu.row, menu.col);
    const thread = sheet.threadedComments.get(menu.row, menu.col);
    if (thread) {
      items.push(
        { id: 'replyThreadedComment', label: cm('replyToThreadedComment'), action: run(() => d.commentUi().openThread()) },
        { id: 'deleteThreadedComment', label: cm('deleteThreadedComment'), action: () => { sheet.threadedComments.remove(menu.row, menu.col); d.invalidate(); } },
      );
    } else if (comment) {
      items.push(
        { id: 'editComment', label: cm('editComment'), action: run(() => d.commentUi().editComment()) },
        { id: 'deleteComment', label: cm('deleteComment'), action: () => { sheet.comments.remove(menu.row, menu.col); d.invalidate(); } },
        { id: 'toggleComment', label: cm('showHideComments'), action: () => d.commentUi().toggleComments() },
        { id: 'formatComment', label: cm('formatComment'), action: () => d.showFormatComment() },
      );
    } else {
      items.push(
        { id: 'newThreadedComment', label: cm('newThreadedComment'), icon: 'ribbon-button-review-newThreadedComment', action: run(() => d.commentUi().openThread()) },
        { id: 'insertComment', label: cm('insertComment'), icon: 'context-insert-comment', action: run(() => d.commentUi().insertComment()) },
      );
    }
    items.push(
      { id: 'format', label: res(d, 'formatCells', 'Format Cells...'), icon: 'ribbon-button-format', action: run(() => d.showFormatCells()) },
    );
    if (!inTable && !inPivot) items.push({ id: 'transform', label: cm('transformCells'), icon: 'context-transform-cells', action: run(() => d.showTransformCells()) });
    items.push(
      { id: 'link', label: cm('link'), icon: 'ribbon-button-hyperlink', action: run(() => d.showHyperlink()) },
      { id: 'richText', label: cm('richText'), action: run(() => d.showRichTextDialog(menu.row, menu.col)) },
      { id: 'defineName', label: cm('defineName'), action: run(() => d.showNewName()) },
      { id: 'tag', label: cm('tag'), action: run(() => d.showCellTagDialog(menu.row, menu.col)) },
      { id: 'defaultValue', label: cm('defaultValue'), action: run(() => d.showDefaultValueDialog(menu.row, menu.col)) },
      { id: 'createTemplate', label: cm('createCellTemplate'), action: run(() => d.showCreateCellTemplateDialog()) },
    );
    return items;
  }

  if (menu.kind === 'chart') {
    const chart = sheet.charts.get(String(menu.objectName ?? ""));
    const keep = (): void => { for (const item of sheet.charts.all()) item.isSelected(item.name() === menu.objectName); };
    const sub = (label: string, action: () => void, disabled = false, icon?: string): ContextSubItem => ({ id: label.toLowerCase(), label, disabled, icon, action: () => { keep(); action(); } });
    return [
      { id: 'cutChart', label: cm('cut'), icon: 'ribbon-button-cut', action: () => { keep(); d.executeChartCommand('cut'); } },
      { id: 'copyChart', label: cm('copy'), icon: 'ribbon-button-copy', action: () => { keep(); d.executeChartCommand('copy'); } },
      { id: 'resetChartStyle', label: cm('resetToMatchStyle'), icon: 'context-chart-reset', action: () => { keep(); chart?.colorScheme(undefined); chartInternals(chart)?.chartAreaStyle({ fill: '#ffffff', stroke: '#d9d9d9' }); d.invalidate(); } },
      { id: 'changeChartType', label: cm('changeChartType'), icon: 'context-chart-type', action: () => { keep(); d.showChangeChartTypeDialog(chart); } },
      { id: 'selectChartData', label: cm('selectData'), icon: 'context-chart-selectdata', action: () => { keep(); d.showSelectDataDialog(chart); } },
      { id: 'moveChart', label: cm('moveChart'), icon: 'context-chart-move', action: () => { keep(); d.showMoveChartDialog(chart); } },
      // Known gap (docs/STATUS.md T51): the trial names this row per hit zone inside the chart
      // ("Format Chart Area..." / "Format Plot Area..." / "Format Data Series..."); we use the
      // chart-area name (verified against the paired gate's probe zone).
      { id: 'formatChartArea', label: cm('formatChartArea'), icon: 'context-chart-formatseries', action: () => { keep(); d.showFormatChartAreaDialog(chart); } },
      {
        id: 'chartGroup', label: cm('group'), icon: 'context-chart-group',
        submenu: [sub('Group', () => d.invalidate(), true, 'ribbon-button-shape-group'), sub('Ungroup', () => d.invalidate(), true, 'ribbon-button-shape-ungroup')],
      },
      {
        id: 'bringChartForward', label: cm('bringForward'), icon: 'ribbon-button-shape-bring-forward',
        submenu: [sub('Bring Forward', () => { d.executeChartCommand('bringForward'); }, false, 'context-sub-bring-forward'), sub('Bring To Front', () => { d.executeChartCommand('bringToFront'); }, false, 'context-sub-bring-to-front')],
      },
      {
        id: 'sendChartBackward', label: cm('sendBackward'), icon: 'ribbon-button-shape-send-backward',
        submenu: [sub('Send Backward', () => { d.executeChartCommand('sendBackward'); }, false, 'context-sub-send-backward'), sub('Send To Back', () => { d.executeChartCommand('sendToBack'); }, false, 'context-sub-send-to-back')],
      },
      { id: 'saveChartPicture', label: cm('saveAsPicture'), action: () => { keep(); d.saveChartAsPicture(chart); } },
    ];
  }
  return [];
}


function shiftSubmenu(d: Designer, kind: 'copied' | 'cut', run: (action: () => void) => () => void): ContextSubItem[] {
  return [
    { id: 'shiftRight', label: cm('shiftCellsRight'), icon: 'context-insert-columns-right', action: run(() => d.runUndoable(kind === 'copied' ? 'insertCopiedCellsDirection' : 'insertCutCellsDirection', { direction: 'right' })) },
    { id: 'shiftDown', label: cm('shiftCellsDown'), icon: 'context-insert-rows-below', action: run(() => d.runUndoable(kind === 'copied' ? 'insertCopiedCellsDirection' : 'insertCutCellsDirection', { direction: 'down' })) },
  ];
}

function sortItem(d: Designer, sheet: Worksheet, customDisabled = false): ContextItem {
  const submenu: ContextSubItem[] = [
    { id: 'sortAZ', label: cm('sortAToZ'), icon: 'ribbon-button-sortAZ', action: () => d.executeBuiltin('sortAZData') },
    { id: 'sortZA', label: cm('sortZToA'), icon: 'ribbon-button-sortZA', action: () => d.executeBuiltin('sortZAData') },
    { id: 'customSort', label: cm('customSort'), icon: 'ribbon-button-sort', action: () => d.showSort(), disabled: customDisabled },
  ];
  void sheet;
  return { id: 'sort', label: cm('sort'), submenu };
}

/** True when any cell of the used range carries a hyperlink (drives Remove Hyperlinks visibility). */
function hasHyperlinkInRange(sheet: Worksheet): boolean {
  const used = internals(sheet)._usedRange?.() ?? { row: 0, col: 0 };
  for (let r = 0; r <= used.row; r++) for (let c = 0; c <= used.col; c++) if (sheet.getHyperlink(r, c)) return true;
  return false;
}

function insertTableSubmenu(d: Designer, sheet: Worksheet, ref: TableRef): ContextItem {
  const bounds = selectionBounds(sheet, ref.range);
  const submenu: ContextSubItem[] = [
    { id: 'tableColumnsLeft', label: cm('tableColumnsToTheLeft'), icon: 'context-insert-columns-left', action: () => d.runUndoable('tableInsert', { where: 'columns', at: bounds.startCol, count: Math.max(1, bounds.endCol - bounds.startCol + 1), table: String(ref.table.name()) }) },
  ];
  if (bounds.endCol === ref.range.col + ref.range.colCount - 1) submenu.push({ id: 'tableColumnsRight', label: cm('tableColumnsToTheRight'), icon: 'context-insert-columns-right', action: () => d.runUndoable('tableInsert', { where: 'columns', at: bounds.endCol + 1, count: Math.max(1, bounds.endCol - bounds.startCol + 1), table: String(ref.table.name()) }) });
  submenu.push({ id: 'tableRowsAbove', label: cm('tableRowsAbove'), icon: 'context-insert-rows-above', action: () => d.runUndoable('tableInsert', { where: 'rows', at: bounds.startRow, count: Math.max(1, bounds.endRow - bounds.startRow + 1), table: String(ref.table.name()) }) });
  if (bounds.endRow === ref.range.row + ref.range.rowCount - 1) submenu.push({ id: 'tableRowBelow', label: cm('tableRowBelow'), icon: 'context-insert-rows-below', action: () => d.runUndoable('tableInsert', { where: 'rows', at: bounds.endRow + 1, count: Math.max(1, bounds.endRow - bounds.startRow + 1), table: String(ref.table.name()) }) });
  return { id: 'insert', label: cm('insert'), submenu };
}

function deleteTableSubmenu(d: Designer, sheet: Worksheet, ref: TableRef): ContextItem {
  const bounds = selectionBounds(sheet, ref.range);
  return {
    id: 'delete', label: cm('delete'),
    submenu: [
      { id: 'tableColumns', label: cm('tableColumns'), icon: 'context-delete-columns', action: () => d.runUndoable('tableDelete', { what: 'columns', at: bounds.startCol, count: Math.max(1, bounds.endCol - bounds.startCol + 1), table: String(ref.table.name()) }) },
      { id: 'tableRows', label: cm('tableRows'), icon: 'context-delete-rows', action: () => d.runUndoable('tableDelete', { what: 'rows', at: bounds.startRow, count: Math.max(1, bounds.endRow - bounds.startRow + 1), table: String(ref.table.name()) }) },
    ],
  };
}

function tableItem(d: Designer, sheet: Worksheet, table: Table | null): ContextItem {
  void sheet;
  const name = table ? String(table.name()) : '';
  return {
    id: 'table', label: cm('table'),
    submenu: [
      { id: 'totalsRow', label: cm('totalsRow'), icon: 'context-table-totals', action: () => d.runUndoable('toggleTableTotalsRow', { table: name }) },
      { id: 'convertToRange', label: cm('convertToRange'), icon: 'context-convert-range', action: () => d.showConvertTableDialog(name) },
      // The trial performs no model change here for unbound tables.
      { id: 'convertToDataTable', label: cm('convertToDataTable'), icon: 'context-convert-datatable', action: () => undefined, disabled: !table },
    ],
  };
}
