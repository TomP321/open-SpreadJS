/* Built-in Home/File command actions. The designer routes mutations through
 * the workbook command manager so undo/redo use the workbook's own stack.
 *
 * This module keeps the applyBuiltin dispatcher and the command-enablement
 * rules; the individual action families live in the sibling modules
 * (base, style-actions, cell-styles, clipboard-actions, sheet-actions,
 * page-layout-actions, data-actions) and are re-exported here so every
 * existing import of `commands/actions.js` keeps working. */
import type { DesignerApi as Designer } from '../designer-api.js';
import { applyInsertAction, chartCommandsEnabled } from './insert.js';
import { pivotCommandEnabled } from '../pivot-designer.js';
import { contextualCommandEnabled, setTableFlag } from '../contextual-actions.js';
import { hyperlinkWriter, internals, outlinesOf, printInfoOf, tableInternals } from '../core-internals.js';
import type GC from '@mescius/spread-sheets';
import { fitPagesValue, MARGIN_PRESETS, PAPER_ITEMS } from '../page-setup.js';
import { activeRanges, activeSheet, currentStyle, selectionBounds, topCell } from './base.js';
import {
  adjustDecimals, applyBorder, applyFormatCells, applyFormatPainter, applyStyle, H,
  mergeCenter, setAlignment, setNumberFormat, setOrientation, unmerge,
  fontSizes,
  setBold, setItalic, setUnderline, setDoubleUnderline,
  setFontFamily, setFontSizePt, effectiveFontSizePt,
} from './style-actions.js';
import { applyCellStyle } from './cell-styles.js';
import { insertLinkedPicture, pasteClipboard } from './clipboard-actions.js';
import {
  applyColorScale, applyDataBar, applyIconSet, autoFitColumn, autoFitRow,
  clearAll, clearConditional, clearContent, clearFormat, collapseCells, deleteColumns, deleteRows,
  deleteSheet, fillDirection, freezePanes, hideColumns, hideRows, insertColumns, insertRows, insertSheet,
  pasteShift, shiftCells, sortSelection, toggleFilter, applyTransformCells,
} from './sheet-actions.js';
import {
  clearPrintAreaRange, patchBackground, PAGE_LAYOUT_SEEDED, seedPageLayout, setPaperKind,
  setPrintAreaRange, togglePrintLineVisible,
} from './page-layout-actions.js';
import {
  applyAutoOutlineCommand, applyCircleInvalid, applyClearCircles, applyDataValidation, applyHeaderStyle,
  applyHyperlink, applySort, applySubtotal, applyTable, applyTableCell, removeDuplicateRows, removeSubtotals, splitTextToColumns,
} from './data-actions.js';

/* Re-exports: the public surface of this module is unchanged by the split. */
export { activeSheet, activeRanges, topCell, currentStyle } from './base.js';
export { formatList, fontFamilies, fontSizes, applyFormatCells, normalizeCellButtons, normalizeDecoration } from './style-actions.js';
export { cellTypeStyleTemplate, cellTypeStyleTemplateNames, registerCellStyleTemplate, applyCellStyle, customCellStyles, cellStyleGroups } from './cell-styles.js';
export type { ClipboardData, ClipCell } from '../designer-api.js';
export { copySelection, pasteClipboard, insertLinkedPicture, type PasteOptions } from './clipboard-actions.js';
export { clearConditional } from './sheet-actions.js';

const nonUndoable = new Set([
  'undo', 'redo', 'copy', 'cut', 'formatPainter', 'find', 'replace', 'goto', 'gotoSpecial',
  'formatMore', 'moreBorder', 'conditionFormat', 'formatTable2', 'cellStyles', 'editingFind',
  'editingSortFilter', 'ribbonNumberFormat', 'border', 'orientationList', 'formatCellAlignment',
  'mergeCenter', 'cellsInsert', 'cellsDelete', 'cellsFormat', 'editingAutoSum', 'editingFillDown',
  'clear', 'conditionFormatNewRule', 'conditionFormatManageRule', 'moreDataBarRules',
  'moreColorScaleRules', 'moreIconSetRules', 'newTableStyle', 'clearTableStyle', 'newCellStyle',
  'manageCellState', 'insertCells', 'deleteCells', 'goto', 'replace', 'findCommand', 'replaceCommand',
  'setFilter', 'clearFilter', 'reapplyFilter', 'customSortEditing',
  // Menu-only parents (TASK 75): no model change, hence no undo entry — like the trial.
  'dataBar', 'colorScalesList', 'colorScalesList2', 'iconSetList', 'clearRules', 'highlightCellsRules',
  'topBottomRules', 'namedCellTemplates', 'cellEditors', 'cellType', 'cellDropdowns', 'undoList', 'redoList',
  'formulaFinancial', 'logicalFormula', 'formulaText', 'formulaDateTime', 'formulaLookupReference',
  'formulaMathTrig', 'formulaStatistical', 'formulaEngineering', 'formulaInformation', 'formulaDatabase',
  'formulaWeb', 'moreFunctions', 'gradientFill', 'solidFill', 'directional', 'shapes', 'indicators', 'ratings',
  'whatIfAnalysis', 'group', 'ungroup', 'dataValidation', 'viewportFreezePanes', 'calculationOptionsPanel',
  'sparklineGallery', 'orientationList', 'insertPicture', 'insertShape', 'insertFormControlShape',
  'focusCellColor',
]);

export function isUndoableAction(name: string): boolean {
  return !nonUndoable.has(name) && !name.startsWith('menu:');
}

/** Applies an action directly. Undo/redo snapshots are handled by the designer. */
export function applyBuiltin(d: Designer, name: string, args: Record<string, unknown> = {}): boolean | void {
  const value = args.value;
  const sheet = activeSheet(d);
  switch (name) {
    case 'fontWeight': setBold(d, args.value ?? false); return;
    case 'fontItalic': setItalic(d, args.value ?? false); return;
    case 'fontUnderline': setUnderline(d, args.value); return;
    case 'fontDoubleUnderline': setDoubleUnderline(d, args.value); return;
    /* Trial (TASK 75 sweep): the font combo setters apply the chosen value; a bare
     * execute (no value) is a no-op. The size steppers walk the ribbon size list
     * starting at the rounded current point size. */
    case 'fontFamily': if (value === undefined) return; setFontFamily(d, String(value)); return;
    case 'fontSize': if (value === undefined) return; setFontSizePt(d, typeof value === 'number' ? value : Number.parseFloat(String(value)) || 11); return;
    case 'increaseFontsize': {
      const size = Math.round(effectiveFontSizePt(currentStyle(d)));
      const next = fontSizes.find((s) => s > size) ?? size + 1;
      setFontSizePt(d, next); return;
    }
    case 'decreaseFontsize': {
      const size = Math.round(effectiveFontSizePt(currentStyle(d)));
      const next = [...fontSizes].reverse().find((s) => s < size) ?? Math.max(1, size - 1);
      setFontSizePt(d, next); return;
    }
    /* Trial (TASK 75 sweep): backColor/foreColor are SETTERS driven by the picker value —
     * a bare execute (no value) leaves the workbook untouched. */
    case 'backColor': if (value === undefined) return; applyStyle(d, 'backColor', value); return;
    case 'foreColor': if (value === undefined) return; applyStyle(d, 'foreColor', value); return;
    case 'topAlign': setAlignment(d, 'vAlign', H.top); return;
    case 'middleAlign': setAlignment(d, 'vAlign', H.middle); return;
    case 'bottomAlign': setAlignment(d, 'vAlign', H.bottom); return;
    case 'leftAlign': setAlignment(d, 'hAlign', H.left); return;
    case 'centerAlign': setAlignment(d, 'hAlign', H.center); return;
    case 'rightAlign': setAlignment(d, 'hAlign', H.right); return;
    case 'decreaseIndent': {
      const n = Number(currentStyle(d).textIndent ?? 0);
      applyStyle(d, 'textIndent', Math.max(0, n - 1));
      applyStyle(d, 'textOrientation', 0); return;
    }
    case 'increaseIndent': {
      const n = Number(currentStyle(d).textIndent ?? 0);
      applyStyle(d, 'textIndent', n + 1);
      applyStyle(d, 'textOrientation', 0); return;
    }
    /* Trial (TASK 75 sweep): Wrap Text is a setter driven by the checkbox value;
     * a bare execute (no value) leaves the workbook untouched. */
    case 'wrapText': if (value === undefined) return; applyStyle(d, 'wordWrap', Boolean(value)); return;
    case 'angleCounterclockwise': setOrientation(d, 45); return;
    case 'angleClockwise': setOrientation(d, -45); return;
    case 'verticalText': setOrientation(d, 0, true); return;
    case 'rotateTextUp': setOrientation(d, 90); return;
    case 'rotateTextDown': setOrientation(d, -90); return;
    // Trial (TASK 75): the Number Format combo is applied by the ribbon with a property
    // name; a bare `execute(designer, undefined, value)` does nothing there.
    case 'ribbonNumberFormat': if (args.propertyName === undefined) return; setNumberFormat(d, String(value ?? 'General')); return;
    /* Trial (TASK 75): the Focus Cell colour is applied by the ribbon menu (property name
     * set); a bare execute leaves the workbook alone. */
    case 'focusCellColor': if (args.propertyName === undefined) return; d.applyFocusCellColor(String(value ?? '#00b050')); return;
    case 'formatGeneral': setNumberFormat(d, 'General'); return;
    case 'numberFormat': setNumberFormat(d, '0.00'); return;
    /* Trial formats (TASK 75 probe): currency/accounting/long date/time carry the
     * `[$$-409]` / `[$-409]` locale tokens and the accounting separators. */
    case 'currencyFormat': setNumberFormat(d, '[$$-409]#,##0.00'); return;
    case 'accountingFormat': setNumberFormat(d, '_([$$-409]* #,##0.00_);_([$$-409]* (#,##0.00);_([$$-409]* "-"??_);_(@_)'); return;
    case 'shortDateFormat': setNumberFormat(d, 'm/d/yyyy'); return;
    case 'longDateformat': setNumberFormat(d, '[$-409]dddd, mmmm dd, yyyy'); return;
    case 'timeFormat': setNumberFormat(d, '[$-409]h:mm:ss AM/PM'); return;
    case 'percentageFormat': setNumberFormat(d, '0.00%'); return;
    case 'fractionFormat': setNumberFormat(d, '# ?/?'); return;
    case 'scientificFormat': setNumberFormat(d, '0.00E+00'); return;
    case 'textFormat': setNumberFormat(d, '@'); return;
    /* Trial (TASK 75 sweep): the quick "%" button uses `0%` (no decimals), unlike the
     * Number group's `percentageFormat` which uses `0.00%`. */
    case 'formatPercentage': setNumberFormat(d, '0%'); return;
    case 'formatComma': setNumberFormat(d, '_(* #,##0.00_);_(* (#,##0.00);_(* "-"??_);_(@_)'); return;
    case 'increaseDecimal': adjustDecimals(d, 1); return;
    case 'decreaseDecimal': adjustDecimals(d, -1); return;
    case 'allBorder': case 'outsideBorder': case 'thickBoxBorder': case 'bottomBorder': case 'topBorder':
    case 'leftBorder': case 'rightBorder': case 'noBorder': case 'bottomDoubleBorder':
    case 'thickBottomBorder': case 'topBottomBorder': case 'topThickBottomBorder':
    case 'topDoubleBottomBorder': applyBorder(d, name); return;
    case 'mergeCenterButton': mergeCenter(d, 'center'); return;
    case 'mergeCells': mergeCenter(d, 'merge'); return;
    case 'mergeAcross': mergeCenter(d, 'across'); return;
    case 'unMergeCells': unmerge(d); return;
    case 'clear': case 'clearAll': clearAll(d); return;
    case 'clearFormat': clearFormat(d); return;
    case 'clearContent': clearContent(d); return;
    case 'clearComments': {
      for (const range of activeRanges(sheet)) sheet.comments.remove(range.row, range.col); return;
    }
    case 'insertSheetRows': insertRows(d); return;
    case 'insertSheetColumns': insertColumns(d); return;
    case 'deleteSheetRows': deleteRows(d); return;
    case 'deleteSheetColumns': deleteColumns(d); return;
    case 'insertCellsDialogApply': {
      const direction = String(args.direction ?? 'down');
      if (direction === 'down' || direction === 'right') { shiftCells(d, direction === 'down'); return; }
      const sheet = activeSheet(d);
      for (const range of activeRanges(sheet)) {
        if (direction === 'row') sheet.addRows(Math.max(0, range.row), Math.max(1, range.rowCount));
        else if (direction === 'column') sheet.addColumns(Math.max(0, range.col), Math.max(1, range.colCount));
      }
      return;
    }
    case 'deleteCellsDialogApply': {
      const direction = String(args.direction ?? 'up');
      const sheet = activeSheet(d);
      for (const range of activeRanges(sheet)) {
        if (direction === 'row') sheet.deleteRows(Math.max(0, range.row), Math.max(1, range.rowCount));
        else if (direction === 'column') sheet.deleteColumns(Math.max(0, range.col), Math.max(1, range.colCount));
      }
      if (direction === 'up' || direction === 'left') collapseCells(d, direction === 'up');
      return;
    }
    case 'insertCopiedCellsDirection': pasteShift(d, String(args.direction ?? 'down'), false); return;
    case 'insertCutCellsDirection': pasteShift(d, String(args.direction ?? 'down'), true); return;
    case 'removeHyperlinks': {
      const sheet = activeSheet(d);
      // Trial (TASK 75 r4, Remove Hyperlink probe): the command materialises the cell's
      // computed style with `textDecoration: 0` — on every cell of the range, even one
      // that never had a hyperlink.
      for (const range of activeRanges(sheet))
        for (let row = Math.max(0, range.row); row < range.row + Math.max(1, range.rowCount); row++)
          for (let col = Math.max(0, range.col); col < range.col + Math.max(1, range.colCount); col++) {
            hyperlinkWriter(sheet).setHyperlink(row, col, null);
            const record = internals(sheet)._fillStyleRecord(row, col);
            record.textDecoration = 0;
            sheet.setStyle(row, col, Object.assign(new d.gc.Spread.Sheets.Style(), record));
          }
      return;
    }
    case 'tableInsert': {
      const sheet = activeSheet(d);
      const count = Math.max(1, Number(args.count) || 1);
      const table = sheet.tables.findByName(String(args.table ?? ''));
      const ti = table ? tableInternals(table) : undefined;
      if (args.where === 'columns') {
        if (ti?._growColCount) {
          const rg = table.range();
          internals(sheet)._shiftColumnsInRows(Math.max(0, Number(args.at) || 0), count, rg.row, rg.row + rg.rowCount - 1, false);
          ti._growColCount(count);
        } else sheet.addColumns(Math.max(0, Number(args.at) || 0), count);
      } else if (ti?._growRowCount) {
        // Trial: Table Rows Above inserts inside the table's column band only — cells in other
        // columns keep their addresses (references still adjust) and the sheet row count is
        // unchanged.
        const rg = table.range();
        internals(sheet)._shiftRowsInColumns(Math.max(0, Number(args.at) || 0), count, rg.col, rg.col + rg.colCount - 1, false);
        ti._growRowCount(count);
      } else sheet.addRows(Math.max(0, Number(args.at) || 0), count);
      return;
    }
    case 'tableDelete': {
      const sheet = activeSheet(d);
      const count = Math.max(1, Number(args.count) || 1);
      const table = sheet.tables.findByName(String(args.table ?? ''));
      const ti = table ? tableInternals(table) : undefined;
      const rg = table ? table.range() : null;
      if (args.what === 'columns') {
        if (ti?._growColCount && rg && rg.rowCount > count) {
          internals(sheet)._shiftColumnsInRows(Math.max(0, Number(args.at) || 0), count, rg.row, rg.row + rg.rowCount - 1, true);
          ti._growColCount(-count);
        } else sheet.deleteColumns(Math.max(0, Number(args.at) || 0), count);
      } else if (ti?._growRowCount && rg && rg.rowCount > count) {
        internals(sheet)._shiftRowsInColumns(Math.max(0, Number(args.at) || 0), count, rg.col, rg.col + rg.colCount - 1, true);
        ti._growRowCount(-count);
      } else sheet.deleteRows(Math.max(0, Number(args.at) || 0), count);
      return;
    }
    case 'toggleTableTotalsRow': {
      const sheet = activeSheet(d);
      const table = sheet.tables.findByName(String(args.table ?? ''));
      const ti = table ? tableInternals(table) : undefined;
      if (!ti?._growRowCount && !table?.showFooter) return;
      const showing = !!table.showFooter();
      const rg = table.range();
      const colStart = rg.col, colEnd = rg.col + rg.colCount - 1;
      if (showing) {
        const footer = table.footerIndex();
        table.showFooter(false);
        internals(sheet)._shiftRowsInColumns(footer, 1, colStart, colEnd, true);
      } else {
        const footer = rg.row + rg.rowCount;
        internals(sheet)._shiftRowsInColumns(footer, 1, colStart, colEnd, false);
        table.showFooter(true, true);
        // Trial defaults: "Total" under the first column, a live structured SUBTOTAL under the
        // last column and nothing under the inner data columns.
        sheet.setValue(footer, colStart, 'Total');
        const header = String(sheet.getValue(rg.row, colEnd) ?? `Column${colEnd - colStart + 1}`);
        sheet.setFormula(footer, colEnd, `=SUBTOTAL(109,[${header}])`);
      }
      return;
    }
    case 'convertTableToRange': {
      // Trial keeps the cells (values and styles) and only drops the table object.
      const sheet = activeSheet(d);
      sheet.tables.remove(String(args.table ?? ''), 3 as GC.Spread.Sheets.Tables.TableRemoveOptions);
      return;
    }
    /* TASK 74: Table Design tab. `applyTableFlag` writes one style-option
     * checkbox; `resizeTableRange` applies the "Resize Table" dialog (the caller
     * has already validated that the header row and the overlap hold). */
    case 'applyTableFlag': {
      const table = activeSheet(d).tables.findByName(String(args.table ?? ''));
      if (table) setTableFlag(table, String(args.flag ?? ''), args.value === true);
      return;
    }
    case 'resizeTableRange': {
      const table = activeSheet(d).tables.findByName(String(args.table ?? ''));
      if (!table) return;
      tableInternals(table)._resize?.({
        row: Number(args.row ?? 0),
        col: Number(args.col ?? 0),
        rowCount: Number(args.rowCount ?? 1),
        colCount: Number(args.colCount ?? 1),
      });
      return;
    }
    case 'transformCells': applyTransformCells(d, String(args.expression ?? '')); return;
    case 'insertSheet': insertSheet(d); return;
    case 'deleteSheet': deleteSheet(d); return;
    case 'insertCopiedCells': case 'insertCutCells': shiftCells(d, true); return;
    case 'deleteCells': shiftCells(d, false); return;
    case 'autoFitColumnWidth': autoFitColumn(d); return;
    case 'autoFitRowHeight': autoFitRow(d); return;
    case 'hideRows': hideRows(d, true); return;
    case 'unHideRows': hideRows(d, false); return;
    case 'hideColumns': hideColumns(d, true); return;
    case 'unHideColumns': hideColumns(d, false); return;
    case 'lockCells': applyStyle(d, 'locked', true); return;
    case 'unLockCells': applyStyle(d, 'locked', false); return;
    case 'sortAZ': case 'sortAZData': sortSelection(d, true); return;
    case 'sortZA': case 'sortZAData': sortSelection(d, false); return;
    case 'setFilter': case 'setFilterData': toggleFilter(d); return;
    case 'clearFilter': case 'clearFilterData': sheet.rowFilter()?.unfilter(); return;
    case 'reapplyFilter': case 'reapplyFilterData': {
      const f = sheet.rowFilter(); f?.filter(); return;
    }
    /* Trial (TASK 75 probe): the AutoSum family does not write a formula through
     * `execute` — it collapses the selection to its top-left cell (the inline sum
     * helper stays pending until Enter, which our harness does not press). */
    case 'editingAutoSum': case 'formulaAutoSum': case 'sum': case 'average': case 'countNumbers': case 'max': case 'min': {
      /* Trial (TASK 75 r3, 8-case probe): the AutoSum family inserts the function over
       * the numeric run ABOVE/LEFT of the selection's last cell — a 4x1 empty column
       * selection gets SUM(G2:G4) in G5, a 1x4 row selection SUM(B7:D7) in E7, and a
       * square selection gets the row sums in the column to the right PLUS the column
       * sums in the row below (corner last, summing the new sums). A single-cell or
       * data-inside selection inserts nothing, and the selection is never collapsed. */
      const fn = name === 'average' ? 'AVERAGE' : name === 'max' ? 'MAX' : name === 'min' ? 'MIN' : name === 'countNumbers' ? 'COUNT' : 'SUM';
      const bounds = selectionBounds(sheet);
      if (bounds.rowCount === 1 && bounds.colCount === 1) return;
      const letters = (index: number): string => {
        let out = '';
        let value = index + 1;
        while (value > 0) { const mod = (value - 1) % 26; out = String.fromCharCode(65 + mod) + out; value = Math.floor((value - 1) / 26); }
        return out;
      };
      const a1 = (row: number, col: number): string => `${letters(col)}${row + 1}`;
      const put = (row: number, col: number, from: [number, number][], to: [number, number][]): void =>
        sheet.setFormula(row, col, `=${fn}(${a1(from[0][0], from[0][1])}:${a1(to[to.length - 1][0], to[to.length - 1][1])})`);
      const { row, col, rowCount, colCount } = bounds;
      if (rowCount > 1 && colCount === 1) {
        // Vertical band: the formula lands in the last selected cell over the rest.
        const last = row + rowCount - 1;
        put(last, col, [[row, col]], [[last - 1, col]]);
      }
      else if (colCount > 1 && rowCount === 1) {
        const last = col + colCount - 1;
        put(row, last, [[row, col]], [[row, last - 1]]);
      }
      else {
        // Square: sums to the right of every row and below every column, corner last.
        for (let r = row; r < row + rowCount; r++) put(r, col + colCount, [[r, col]], [[r, col + colCount - 1]]);
        for (let c = col; c < col + colCount; c++) put(row + rowCount, c, [[row, c]], [[row + rowCount - 1, c]]);
        put(row + rowCount, col + colCount, [[row + rowCount, col]], [[row + rowCount, col + colCount - 1]]);
      }
      return;
    }
    case 'down': case 'editingFillDown': fillDirection(d, 'down'); return;
    case 'up': fillDirection(d, 'up'); return;
    case 'left': fillDirection(d, 'left'); return;
    case 'right': fillDirection(d, 'right'); return;
    case 'formatPainter': d._formatPainterStyle = sheet.getActualStyle(topCell(sheet).row, topCell(sheet).col); return;
    case 'applyFormatPainter': applyFormatPainter(d); return;
    case 'pasteAll': pasteClipboard(d, 'all'); return;
    /* Trial (TASK 75 r4): the official registry spells the formula-paste command
     * `pasteFormula` (singular) as well as `pasteFormulas`; both paste the clipboard. */
    case 'pasteFormula': case 'pasteFormulas': pasteClipboard(d, 'formulas'); return;
    case 'pasteFormulasAndFormatting': pasteClipboard(d, 'formulas-format'); return;
    case 'pasteFormulaAndNumberFormat': pasteClipboard(d, 'formulas-numberformat'); return;
    case 'pasteKeepSourceFormatting': pasteClipboard(d, 'source-theme'); return;
    case 'pasteNoBorders': pasteClipboard(d, 'no-borders'); return;
    case 'pasteColumnWidth': case 'pasteColumnWidths': pasteClipboard(d, 'column-widths'); return;
    case 'pasteTranspose': pasteClipboard(d, 'transpose'); return;
    case 'pasteValues': pasteClipboard(d, 'values'); return;
    case 'pasteValuesAndFormatting': pasteClipboard(d, 'values-format'); return;
    case 'pasteValueAndNumberFormat': pasteClipboard(d, 'values-numberformat'); return;
    case 'pasteValueAndSourceFormat': pasteClipboard(d, 'values-sourceformat'); return;
    case 'pasteFormatting': pasteClipboard(d, 'formatting'); return;
    case 'pasteComments': pasteClipboard(d, 'comments'); return;
    case 'pasteValidation': pasteClipboard(d, 'validation'); return;
    case 'pasteLink':
      /* Trial (TASK 77 sweep + probe): Paste Link never writes values/styles of its own — the
       * pasted block becomes per-cell formulas referencing the source cells (shared group in
       * JSON). Both trial buttons in this menu are permanently disabled, so this path is only
       * reachable programmatically. */
      pasteClipboard(d, 'links'); return;
    case 'pasteLinkedPicture': insertLinkedPicture(d); return;
    /* Trial (TASK 75 probe): every Highlight Cells Rules / Top 10 item opens its quick
     * dialog instead of writing the rule from `execute` — the rule only arrives when the
     * dialog is confirmed. The gallery presets below (bars/scales/icons) apply directly. */
    case 'highlightCellsRulesGreaterThan': d.showNewFormattingRuleDialog('contain'); return;
    case 'highlightCellsRulesLessThan': d.showNewFormattingRuleDialog('contain'); return;
    case 'highlightCellsRulesBetween': d.showNewFormattingRuleDialog('contain'); return;
    case 'highlightCellsRulesEqualTo': d.showNewFormattingRuleDialog('contain'); return;
    case 'highlightCellsRulesContains': d.showNewFormattingRuleDialog('contain'); return;
    case 'highlightCellsRulesDateOccurring': d.showNewFormattingRuleDialog('contain'); return;
    case 'highlightCellsRulesDuplicateValues': d.showNewFormattingRuleDialog('contain'); return;
    case 'topBottomRulesTop10': d.showNewFormattingRuleDialog('topBottom'); return;
    case 'topBottomRulesTop10Percent': d.showNewFormattingRuleDialog('topBottom'); return;
    case 'topBottomRulesBottom10': d.showNewFormattingRuleDialog('topBottom'); return;
    case 'topBottomRulesBottom10Percent': d.showNewFormattingRuleDialog('topBottom'); return;
    case 'topBottomRulesAboveAverage': d.showNewFormattingRuleDialog('topBottom'); return;
    case 'topBottomRulesBelowAverage': d.showNewFormattingRuleDialog('topBottom'); return;
    case 'gradientFillBlueDataBar': applyDataBar(d, 'blue'); return;
    case 'gradientFillGreenDataBar': applyDataBar(d, 'green'); return;
    case 'gradientFillRedDataBar': applyDataBar(d, 'red'); return;
    case 'gradientFillOrangeDataBar': applyDataBar(d, 'orange'); return;
    case 'gradientFillLightBlueDataBar': applyDataBar(d, 'lightblue'); return;
    case 'gradientFillPurpleDataBar': applyDataBar(d, 'purple'); return;
    case 'solidFillBlueDataBar': applyDataBar(d, 'blue', false); return;
    case 'solidFillGreenDataBar': applyDataBar(d, 'green', false); return;
    case 'solidFillRedDataBar': applyDataBar(d, 'red', false); return;
    case 'solidFillOrangeDataBar': applyDataBar(d, 'orange', false); return;
    case 'solidFillLightBlueDataBar': applyDataBar(d, 'lightblue', false); return;
    case 'solidFillPurpleDataBar': applyDataBar(d, 'purple', false); return;
    case 'colorScaleGyr': applyColorScale(d, 'gyr'); return;
    case 'colorScaleRyg': applyColorScale(d, 'ryg'); return;
    case 'colorScaleGwr': applyColorScale(d, 'gwr'); return;
    case 'colorScaleRwg': applyColorScale(d, 'rwg'); return;
    case 'colorScaleBwr': applyColorScale(d, 'bwr'); return;
    case 'colorScaleRwb': applyColorScale(d, 'rwb'); return;
    case 'colorScaleWr': applyColorScale(d, 'wr'); return;
    case 'colorScaleRw': applyColorScale(d, 'rw'); return;
    case 'colorScaleGw': applyColorScale(d, 'gw'); return;
    case 'colorScaleWg': applyColorScale(d, 'wg'); return;
    case 'colorScaleGy': applyColorScale(d, 'gy'); return;
    case 'colorScaleYg': applyColorScale(d, 'yg'); return;
    case 'iconSetThreeArrowsColored': applyIconSet(d, 0); return;
    case 'iconSetThreeArrowsGray': applyIconSet(d, 1); return;
    case 'iconSet3Triangles': applyIconSet(d, 2); return;
    case 'iconSetFourArrowsGray': applyIconSet(d, 11); return;
    case 'iconSetFourArrowsColored': applyIconSet(d, 10); return;
    case 'iconSetFiveArrowsGray': applyIconSet(d, 16); return;
    case 'iconSetFiveArrowsColored': applyIconSet(d, 15); return;
    case 'iconSetThreeTrafficLightsUnRimmed': applyIconSet(d, 5); return;
    case 'iconSetThreeTrafficLightsRimmed': applyIconSet(d, 6); return;
    case 'iconSetThreeSigns': applyIconSet(d, 7); return;
    case 'iconSetFourTrafficLights': applyIconSet(d, 14); return;
    case 'iconSetFourRedToBlack': applyIconSet(d, 12); return;
    case 'iconSetThreeSymbolsCircled': applyIconSet(d, 8); return;
    case 'iconSetThreeSymbolsUnCircled': applyIconSet(d, 9); return;
    case 'iconSetThreeFlags': applyIconSet(d, 4); return;
    case 'iconSetThreeStars': applyIconSet(d, 3); return;
    case 'iconSetFourRatings': applyIconSet(d, 13); return;
    case 'iconSetFiveQuarters': applyIconSet(d, 18); return;
    case 'iconSetFiveRatings': applyIconSet(d, 17); return;
    case 'iconSetFiveBoxes': applyIconSet(d, 19); return;
    case 'applyFormatCells': applyFormatCells(d, (args.data ?? {}) as Record<string, unknown>); return;
    case 'editCell': {
      const row = Number(args.row), col = Number(args.col), text = String(args.value ?? '');
      if (text.startsWith('=')) sheet.setFormula(row, col, text); else sheet.setValue(row, col, text === '' ? null : text);
      return;
    }
    case 'clearCellRules': clearConditional(d, false); return;
    case 'clearSheetRules': clearConditional(d, true); return;
    /* Trial (TASK 75 r5 probe `.probe/t75r5/p9.json`): the gallery tile passes the theme as the
     * command value; a BARE execute applies nothing (ours used to apply `medium2`, which then
     * threw "The tables cannot be intersected." on a selection inside an existing table). */
    case 'formatTableListContent': if (value === undefined) return; applyTable(d, String(value)); return;
    /* Trial (TASK 75 sweep): the Cell Styles gallery applies a chosen named style;
     * a bare execute (no name) is a no-op. */
    case 'cellStylesListContent': if (value === undefined) return; applyCellStyle(d, String(value)); return;
    case 'zoomDefault': d.getWorkbook().getActiveSheet().zoom(1); return;
    case 'undo': d.getWorkbook().undoManager().undo(); return;
    case 'redo': d.getWorkbook().undoManager().redo(); return;
    default: return applyExtra(d, name, args);
  }
}


function applyExtra(d: Designer, name: string, args: Record<string, unknown>): boolean | void {
  // Dialog-backed and file commands are handled in designer.ts; here we cover
  // simple sheet commands and leave the rest to the UI layer.
  const sheet = activeSheet(d);
  if (PAGE_LAYOUT_SEEDED.has(name)) seedPageLayout(d, sheet);
  switch (name) {
    case 'zoom': {
      const value = Number(args.value);
      if (Number.isFinite(value) && value >= 0.1 && value <= 4) sheet.zoom(value);
      return;
    }
    /* Trial (TASK 75 probe): dropdown/gallery parents only open their menu — they carry no
     * `execute` there; `border` is the exception and applies the default (thin bottom)
     * border. Registering them as explicit no-ops keeps `executeCommand` quiet. */
    case 'border': applyBorder(d, 'bottomBorder'); return;
    case 'dataBar': case 'colorScalesList': case 'colorScalesList2': case 'iconSetList':
    case 'clearRules': case 'highlightCellsRules': case 'topBottomRules':
    case 'namedCellTemplates': case 'cellEditors': case 'cellType': case 'cellDropdowns':
    case 'undoList': case 'redoList': case 'formulaFinancial': case 'logicalFormula':
    case 'formulaText': case 'formulaDateTime': case 'formulaLookupReference': case 'formulaMathTrig':
    case 'formulaStatistical': case 'formulaEngineering': case 'formulaInformation': case 'formulaDatabase':
    case 'formulaWeb': case 'moreFunctions': case 'gradientFill': case 'solidFill':
    case 'directional': case 'shapes': case 'indicators': case 'ratings':
    case 'whatIfAnalysis': case 'group': case 'ungroup': case 'dataValidation':
    case 'viewportFreezePanes': case 'calculationOptionsPanel': case 'sparklineGallery':
    case 'editingSortFilter':
    case 'orientationList': case 'insertPicture': case 'insertShape': case 'insertFormControlShape':
    case 'areaChartGroup': case 'barChartGroup': case 'bubbleChartGroup': case 'columnChartGroup':
    case 'comboChartGroup': case 'doughnutChartGroup': case 'funnelChartGroup': case 'lineChartGroup':
    case 'pieChartGroup': case 'radarChartGroup': case 'scatterChartGroup': case 'stockChartGroup':
    case 'sunburstChartGroup': case 'treemapChartGroup': case 'waterfallChartGroup':
    case 'barSparklineGroup': case 'calendarSparklineGroup': case 'lineSparklineGroup':
    case 'otherSparklineGroup': case 'pieSparklineGroup': case 'scatterSparklineGroup':
    case 'pivotTableOptionsList':
      return;
    case 'fitPageWidth': case 'fitPageTall': case 'fitPageScale':
      // Trial (TASK 75): applied by the ribbon with a property name; bare execute is ignored.
      if (args.propertyName === undefined) return;
      if (name === 'fitPageWidth') printInfoOf(sheet).fitPagesWide(fitPagesValue(String(args.value ?? 'Automatic')));
      else if (name === 'fitPageTall') printInfoOf(sheet).fitPagesTall(fitPagesValue(String(args.value ?? 'Automatic')));
      else {
      const percent = Math.max(10, Math.min(400, Number(args.value) || 100));
      printInfoOf(sheet).zoomFactor(percent / 100);
      return;
    }
    case 'orientationPortrait': printInfoOf(sheet).orientation(1); return;
    case 'orientationLandscape': printInfoOf(sheet).orientation(2); return;
    /* Trial (TASK 75 sweep): the margins/paper DROPDOWN parents do nothing on a bare
     * execute — only the picked item carries the value through `args.value`. */
    case 'marginSelector': if (args.value === undefined) return; printInfoOf(sheet).margin({ ...MARGIN_PRESETS.Normal }); return;
    case 'marginNormal': printInfoOf(sheet).margin({ ...MARGIN_PRESETS.Normal }); return;
    case 'marginWide': printInfoOf(sheet).margin({ ...MARGIN_PRESETS.Wide }); return;
    case 'marginNarrow': printInfoOf(sheet).margin({ ...MARGIN_PRESETS.Narrow }); return;
    case 'paperKindSelector': {
      if (args.value === undefined) return;
      const paper = PAPER_ITEMS.find((item) => item.text === String(args.value));
      if (paper) { setPaperKind(sheet, paper.kind); d._paperTouched = true; }
      return;
    }
    case 'paperLetter': setPaperKind(sheet, 1); return;
    case 'paperLegal': setPaperKind(sheet, 5); return;
    case 'paperA4': setPaperKind(sheet, 9); return;
    case 'paperA3': setPaperKind(sheet, 8); return;
    case 'setPrintArea': setPrintAreaRange(sheet); return;
    case 'clearPrintArea': clearPrintAreaRange(sheet); return;
    case 'pageLayoutPrintGridlines': {
      // The trial's first Sheet Options interaction seeds header visibility and the
      // first page number into printInfo; those touched fields then persist.
      d.syncPageLayoutDefaults(sheet);
      const pi = printInfoOf(sheet);
      pi.showGridLine(!pi.showGridLine());
      return;
    }
    case 'pageLayoutPrintHeadings': {
      const pi = printInfoOf(sheet);
      // PrintVisibilityType: inherit = 0 (shown, ribbon checked), hide = 1, show = 2.
      // The toggle matches the ribbon state rule (checked unless explicitly hidden), so the
      // first click on a fresh (inherit) sheet writes hide (1), same as the official.
      const wasChecked = pi.showRowHeader() !== 1 && pi.showColumnHeader() !== 1;
      d.syncPageLayoutDefaults(sheet);
      pi.showRowHeader(wasChecked ? 1 : 2);
      pi.showColumnHeader(wasChecked ? 1 : 2);
      return;
    }
    case 'printLineVisible': togglePrintLineVisible(sheet); return;
    case 'insertPageBreak': {
      // Trial (TASK 75 r3 probe): sets both breaks at the active cell unconditionally —
      // even row/column 0 — and leaves PrintLineVisible untouched.
      const { row, col } = topCell(sheet);
      sheet.setRowPageBreak(row, true);
      sheet.setColumnPageBreak(col, true);
      return;
    }
    case 'removePageBreak': {
      const { row, col } = topCell(sheet);
      sheet.setRowPageBreak(row, false);
      sheet.setColumnPageBreak(col, false);
      return;
    }
    case 'resetAllPageBreaks': {
      const breaks = internals(sheet)._manualPageBreaks();
      for (const row of breaks.rows) sheet.setRowPageBreak(row, false);
      for (const col of breaks.cols) sheet.setColumnPageBreak(col, false);
      return;
    }
    case 'worksheetBackgroundRepeat': {
      const info = internals(sheet).getBackgroundImageInfo();
      patchBackground(sheet, { layout: info.option.layout === 'repeat' ? 'none' : 'repeat' });
      return;
    }
    case 'worksheetBackgroundOverContent': {
      const info = internals(sheet).getBackgroundImageInfo();
      patchBackground(sheet, { paintOrder: info.option.paintOrder === 'over-content' ? 'normal' : 'over-content' });
      return;
    }
    case 'calculationOptionAutomatic': d.setCalculationMode('automatic'); return;
    case 'calculationOptionPartial': d.setCalculationMode('partial'); return;
    case 'calculationOptionManual': d.setCalculationMode('manual'); return;
    case 'calculateNow': d.getWorkbook().calculate(0); return;
    case 'calculateSheet': d.getWorkbook().calculate(1); return;
    case 'insertCheckbox': {
      /* Trial (TASK 75 probe): the CheckBox ribbon button does not write a boolean value —
       * it stamps the modern checkbox cell type (plus centring) onto the selection. */
      const cellType = { typeName: '5', boxSize: 'auto', mode: 'modern', hitTestMode: 'checkbox', textEditable: false };
      for (const range of activeRanges(sheet)) {
        const rows = range.rowCount < 0 ? [range.row] : Array.from({ length: range.rowCount }, (_, i) => Math.max(0, range.row) + i);
        const cols = range.colCount < 0 ? [range.col] : Array.from({ length: range.colCount }, (_, i) => Math.max(0, range.col) + i);
        for (const row of rows) for (const col of cols) {
          internals(sheet)._setStyleProperty(row, col, 'cellType', cellType);
          internals(sheet)._setStyleProperty(row, col, 'hAlign', 1);
          internals(sheet)._setStyleProperty(row, col, 'vAlign', 0);
        }
      }
      return;
    }
    case 'templateDesignMode': d.notImplementedPlugin('Data Binding'); return;
    case 'editLinks': d.notImplementedPlugin('Data Binding'); return;
    case 'loadSchema': case 'saveSchema': case 'clearBindingPath': case 'autoGenerateLabel': case 'bindDataManager':
      d.notImplementedPlugin('Data Binding'); return;
    case 'showScenarioPanel': case 'dataTable': d.notImplementedPlugin('What-If Analysis'); return;
    /* Trial (TASK 75 probe): Group... does not group on `execute` — its dialog collects
     * the level first; our quick dialog lands in the follow-up (documented). */
    case 'innerGroup': return;
    case 'innerUngroup':
      /* Trial (TASK 75 r3, five-case probe): bare `execute` never ungroups — like
       * `innerGroup`, the work goes through its dialog; a bare call leaves the sheet alone. */
      return;
    case 'clearOutline': activeSheet(d).rowOutlines.ungroup(); activeSheet(d).columnOutlines.ungroup(); return;
    case 'showDetail': case 'hideDetail': {
      const { row, col, rowCount, colCount } = selectionBounds(sheet);
      for (const [outline, start, count] of [[sheet.rowOutlines, row, rowCount], [sheet.columnOutlines, col, colCount]] as const) {
        const visited = new Set<number>();
        for (let i = start; i < start + count; i++) {
          // Trial (TASK 75 r3 probe): every entry inside a group reacts, level 0 included;
          // only entries outside any group (level -1) leave the sheet alone.
          if (outline.getLevel(i) < 0) continue;
          const group = outline.find(i, outline.getLevel(i));
          if (group && !visited.has(group.start)) {
            visited.add(group.start);
            outline.expandGroup(group, name === 'showDetail');
            // The trial's ribbon Show Detail also materialises the summary marker (r3).
            if (name === 'showDetail') outlinesOf(outline)._touchSummaryMarker?.(group.start);
          }
        }
      }
      return;
    }
    case 'sortAZData': sortSelection(d, true); return;
    case 'sortZAData': sortSelection(d, false); return;
    case 'applySort': applySort(d, (args.data ?? {}) as Record<string, unknown>); return;
    case 'applyTable': applyTableCell(d, (args.data ?? {}) as Record<string, unknown>); return;
    case 'applyHyperlink': applyHyperlink(d, (args.data ?? {}) as Record<string, unknown>); return;
    case 'applyHeaderStyle': applyHeaderStyle(d, args); return;
    case 'applyDataValidation': applyDataValidation(d, (args.data ?? {}) as Record<string, unknown>); return;
    case 'removeDuplicatesApply': args.result = removeDuplicateRows(d, (args.data ?? {}) as Record<string, unknown>); return;
    case 'splitTextToColumns': return splitTextToColumns(d, (args.data ?? {}) as Record<string, unknown>, args);
    case 'applySubtotal': applySubtotal(d, (args.data ?? {}) as Record<string, unknown>); return;
    case 'removeSubtotals': removeSubtotals(d); return;
    case 'circleInvalidData': case 'circleInvalidDataCommand': applyCircleInvalid(d); return;
    case 'clearInvalidCircles': applyClearCircles(d); return;
    case 'autoOutlineApply': applyAutoOutlineCommand(d, (args.data ?? {}) as Record<string, unknown>); return;
    case 'freezePanes': case 'freezeTopRow': case 'freezeFirstColumn': case 'freezeBottomRow': case 'freezeLastColumn': freezePanes(d, name); return;
    case 'unfreezePanes': sheet.frozenRowCount(0); sheet.frozenColumnCount(0); sheet.frozenTrailingRowCount(0); sheet.frozenTrailingColumnCount(0); return;
    /* Trial (TASK 75 sweep): the ribbon applies Show Formulas with the property name;
     * a bare `execute(designer)` leaves the sheet alone. */
    case 'showFormulas': if (args.propertyName === undefined) return; sheet.options.showFormulas = !sheet.options.showFormulas; return;
    case 'pageLayoutViewGridlines': sheet.options.gridline.showVerticalGridline = !sheet.options.gridline.showVerticalGridline; sheet.options.gridline.showHorizontalGridline = sheet.options.gridline.showVerticalGridline; return;
    case 'pageLayoutViewHeadings': {
      const next = !sheet.options.rowHeaderVisible; sheet.options.rowHeaderVisible = next; sheet.options.colHeaderVisible = next; return;
    }
    case 'showHideRowHeader': sheet.options.rowHeaderVisible = !sheet.options.rowHeaderVisible; return;
    case 'showHideColumnHeader': sheet.options.colHeaderVisible = !sheet.options.colHeaderVisible; return;
    case 'showHideVGridLine': sheet.options.gridline.showVerticalGridline = !sheet.options.gridline.showVerticalGridline; return;
    case 'showHideHGridLine': sheet.options.gridline.showHorizontalGridline = !sheet.options.gridline.showHorizontalGridline; return;
    case 'showHideTabStrip': {
      const wb = d.getWorkbook(); wb.options.tabStripVisible = !wb.options.tabStripVisible; return;
    }
    case 'showHideNewTab': {
      const wb = d.getWorkbook(); wb.options.newTabVisible = !wb.options.newTabVisible; return;
    }
    case 'defaultRowHeight': sheet.setRowHeight(Math.max(0, activeRanges(sheet)[0].row), sheet.defaults.rowHeight as number); return;
    case 'defaultColumnWidth': sheet.setColumnWidth(Math.max(0, activeRanges(sheet)[0].col), sheet.defaults.colWidth as number); return;
    case 'setDimensionSize': {
      const isRow = args.axis === 'row';
      for (const range of activeRanges(sheet)) {
        const start = Math.max(0, isRow ? range.row : range.col);
        const count = isRow ? range.rowCount : range.colCount;
        const end = count < 0 ? (isRow ? sheet.getRowCount() : sheet.getColumnCount()) : start + count;
        for (let index = start; index < end; index++) {
          if (isRow) sheet.setRowHeight(index, args.value as number);
          else sheet.setColumnWidth(index, args.value as number);
        }
      }
      return;
    }
    /* TASK 68: Standard Height / Standard Width write the sheet default; the
     * public `setRowHeight(-1)` / `setColumnWidth(-1)` form is the documented way. */
    case 'setDefaultDimensionSize': {
      if (args.axis === 'row') sheet.setRowHeight(-1, args.value as number);
      else sheet.setColumnWidth(-1, args.value as number);
      return;
    }
    default:
      if (applyInsertAction(d, name, args)) return;
      throw new Error(`NotImplemented: Designer command ${name}`);
  }
}

/** Paste modes the trial shows but never enables (see commandEnabled below). */
const PERMANENTLY_DISABLED_PASTE = new Set([
  'pasteFormulaAndNumberFormat', 'pasteKeepSourceFormatting', 'pasteNoBorders', 'pasteColumnWidth', 'pasteTranspose',
  'pasteValueAndNumberFormat', 'pasteValueAndSourceFormat', 'pasteLink', 'pasteLinkedPicture',
]);

export function commandEnabled(d: Designer, name: string): boolean {
  const wb = d.getWorkbook();
  // PivotTable commands carry their own enablement (TASK 47).
  const pivotEnabled = pivotCommandEnabled(d, name);
  if (pivotEnabled !== undefined) return pivotEnabled;
  // Contextual-tab commands are enabled while their object is selected (TASK 74).
  const contextualEnabled = contextualCommandEnabled(d, name);
  if (contextualEnabled !== undefined) return contextualEnabled;
  // TASK 60 item 2 (measured on the trial): the main "Charts" launcher and the seven
  // chart-preview split buttons share one enable rule — the charts feature must be loaded
  // (`?plugins=none` on the trial greys all eight out) and the selection must be usable as a
  // chart source: any multi-cell range (even a fully empty block) or a single cell that holds
  // a value. A single empty cell greys all eight of them out.
  if (name === 'insertChart' || /ChartPreview$/.test(name)) return chartCommandsEnabled(d);
  if (name === 'undo') return wb.undoManager().canUndo();
  if (name === 'redo') return wb.undoManager().canRedo();
  if (name === 'deleteSheet' || name === 'deleteSheetRows' || name === 'deleteSheetColumns') return true;
  const pageLayoutSheet = activeSheet(d);
  if (name === 'clearPrintArea') return Number(printInfoOf(pageLayoutSheet).rowStart()) >= 0;
  // Task 55 pair check: the trial greys the gallery's "Paste Special..." row only while the
  // clipboard is empty (verified live: aria-disabled=true with no copy, clean class with one).
  if (name === 'openPasteSpecialDialog') return internals(activeSheet(d))._clipboardMode() !== 'none';
  if (name === 'insertPageBreak') { const p = topCell(pageLayoutSheet); return Math.max(0, p.row) > 0 || Math.max(0, p.col) > 0; }
  if (name === 'removePageBreak') {
    const p = topCell(pageLayoutSheet);
    return pageLayoutSheet.getRowPageBreak(Math.max(0, p.row)) || pageLayoutSheet.getColumnPageBreak(Math.max(0, p.col));
  }
  if (name === 'resetAllPageBreaks') {
    const breaks = internals(pageLayoutSheet)._manualPageBreaks();
    return breaks.rows.length + breaks.cols.length > 0;
  }
  // The trial keeps "Unmerge Cells" always enabled (it is a no-op without spans),
  // so we do not grey it out.
  // Task 55 pair check (official/menu-Home__ribbon.pasteAll.png): the trial renders these
  // nine paste modes permanently greyed (they are not implemented by the product); only
  // All / Formulas / Formulas&Formatting / Values / Values&Formatting / Formatting toggle
  // with the clipboard.
  if (PERMANENTLY_DISABLED_PASTE.has(name)) return false;
  if (name === 'reapplyFilter') {
    const filter = activeSheet(d).rowFilter() as { range?: unknown } | undefined;
    return !!(filter && filter.range);
  }
  // The trial enables Circle Invalid Data / Clear Invalid Circles unconditionally
  // (they act on the whole sheet's validator circles, not the selection) — TASK 55 pair check.
  return true;
}
