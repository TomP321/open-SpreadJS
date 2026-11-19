/**
 * Structural and serialization operations of `Tables` (`Table` class):
 * attach, resize, shift, banded style resolution and SSJSON import/export.
 * Bodies moved out of `features/tables.ts` unchanged (`this` renamed to the
 * `table` parameter); the class keeps thin delegating methods.
 */

import { Range, Style } from '../primitives.js';
import { styleToJSON, type JsonRecord } from '../serialization.js';
import type { Worksheet } from '../worksheet.js';
import type { Table } from './tables.js';
import { TableColumn, TableThemes, cloneBorder, mergeStyle, objectRecord, styleFromProps, themeByName, type TableTheme } from './table-style.js';

import { filterFromJSON, filterToJSON } from './filters.js';
import type { ThemeJSON } from './table-theme-data.js';

export function _attach(table: Table, sheet: Worksheet): void {
    table.sheet = sheet;
    const data = table.dataRange();
    table.filter.range = new Range(data.row, data.col, data.rowCount, data.colCount);
    table.filter.extendedRange = new Range(data.row, data.col, data.rowCount, data.colCount);
    table.filter._attach(sheet);
    for (let c = 0; c < table.colCount; c++) table.filter.filterButtonVisible(c, true);
    if (table.options.showHeader) {
      // Existing header text becomes the column names and must not be overwritten.
      for (let c = 0; c < table.colCount; c++) {
        const existing = sheet.getValue(table.headerIndex(), table.col + c);
        if (existing != null && String(existing) !== '') table.columns[c]?.name(String(existing));
      }
      table.writeHeaderValues();
    }
    if (table.options.showFooter) {
      const footerValueRow = table.footerIndex() - (table.options.showHeader ? 1 : 0);
      for (let c = 0; c < table.colCount; c++) {
        const column = table.columns[c];
        if (typeof column?.fields.footerFormula === 'string') continue;
        const value = sheet.getValue(footerValueRow, table.col + c);
        if (value != null) column.fields.value = value;
      }
    }
}

export function _resize(table: Table, range: Range): void {
    const previousCol = table.col;
    const delta = range.col - previousCol;
    table.col = range.col;
    table.colCount = range.colCount;
    table.row = range.row + (table.options.showHeader ? 1 : 0);
    table.rowCount = Math.max(
      0,
      range.rowCount - (table.options.showHeader ? 1 : 0) - (table.options.showFooter ? 1 : 0),
    );
    if (delta > 0) {
      const dropped = table.columns.splice(0, delta);
      table.columns.push(...dropped);
      while (table.columns.length < table.colCount) {
        const column = new TableColumn(table.columns.length + 1, undefined, `Column${table.columns.length + 1}`);
        table.columns.push(column);
      }
    } else if (delta < 0) {
      for (let i = 0; i < -delta; i++) {
        const column = new TableColumn(i + 1, undefined, `Column${i + 1}`);
        table.columns.unshift(column);
      }
      if (table.columns.length > table.colCount) table.columns.length = table.colCount;
    }
    while (table.columns.length < table.colCount) {
      const column = new TableColumn(table.columns.length + 1, undefined, `Column${table.columns.length + 1}`);
      table.columns.push(column);
    }
    if (table.columns.length > table.colCount) table.columns.length = table.colCount;
    if (table.filter._hasButtons())
      for (let c = 0; c < table.colCount; c++) if (table.filter.filterButtonVisible(c) === undefined) table.filter.filterButtonVisible(c, true);
    if (table.sheet) table.writeHeaderValues();
}

export function _shift(table: Table, axis: 'row' | 'col', index: number, amount: number, remove: boolean): void {
    const range = table.range();
    const start = axis === 'row' ? range.row : table.col;
    const count = axis === 'row' ? range.rowCount : table.colCount;
    const end = start + count;
    const pos = axis === 'row' ? table.row : table.col;
    const dataEnd = pos + (axis === 'row' ? table.rowCount : table.colCount);
    if (remove) {
      const removed = Math.max(0, Math.min(end, index + amount) - Math.max(start, index));
      if (axis === 'row')
        table.rowCount = Math.max(
          0,
          table.rowCount - Math.max(0, Math.min(dataEnd, index + amount) - Math.max(pos, index)),
        );
      else table.colCount = Math.max(1, table.colCount - removed);
      if (start >= index + amount) {
        if (axis === 'row') table.row -= amount;
        else table.col -= amount;
      }
    } else if (index <= start) {
      if (axis === 'row') table.row += amount;
      else table.col += amount;
    } else if (index < end) {
      if (axis === 'row') table.rowCount += amount;
      else table.colCount += amount;
    }
}

export function _styleFor(table: Table, row: number, col: number): Style | null {
    const header = table.headerIndex(),
      footer = table.footerIndex();
    const data = table.dataRange();
    if (col < table.col || col >= table.col + table.colCount) return null;
    if (row !== header && row !== footer && !(row >= data.row && row < data.row + data.rowCount)) return null;
    const result = new Style();
    const palette = table.sheet?._ioThemeColors;
    const role = (key: keyof ThemeJSON) => table.tableStyle._style(key, palette);
    const c = col - table.col;
    if (row === header) {
      mergeStyle(result, role('headerRowStyle'));
      if (c === 0) mergeStyle(result, role('firstHeaderCellStyle'));
      if (c === table.colCount - 1) mergeStyle(result, role('lastHeaderCellStyle'));
      if (table.options.highlightFirstColumn && c === 0) mergeStyle(result, role('highlightFirstColumnStyle'));
      if (table.options.highlightLastColumn && c === table.colCount - 1) mergeStyle(result, role('highlightLastColumnStyle'));
      const whole = table.tableStyle._style('wholeTableStyle', palette);
      const borders = result as JsonRecord;
      if (!borders.borderTop && whole?.borderTop) borders.borderTop = cloneBorder(whole.borderTop);
      if (!borders.borderBottom && whole?.borderBottom) borders.borderBottom = cloneBorder(whole.borderBottom);
      if (c === 0 && !borders.borderLeft && whole?.borderLeft) borders.borderLeft = cloneBorder(whole.borderLeft);
      if (c === table.colCount - 1 && !borders.borderRight && whole?.borderRight) borders.borderRight = cloneBorder(whole.borderRight);
    } else if (row === footer) {
      mergeStyle(result, role('footerRowStyle'));
      if (c === 0) mergeStyle(result, role('firstFooterCellStyle'));
      if (c === table.colCount - 1) mergeStyle(result, role('lastFooterCellStyle'));
      const whole = table.tableStyle._style('wholeTableStyle', palette);
      const borders = result as JsonRecord;
      if (!borders.borderTop && whole?.borderTop) borders.borderTop = cloneBorder(whole.borderTop);
      if (!borders.borderBottom && whole?.borderBottom) borders.borderBottom = cloneBorder(whole.borderBottom);
      if (c === 0 && !borders.borderLeft && whole?.borderLeft) borders.borderLeft = cloneBorder(whole.borderLeft);
      if (c === table.colCount - 1 && !borders.borderRight && whole?.borderRight) borders.borderRight = cloneBorder(whole.borderRight);
    } else {
      const whole = table.tableStyle._style('wholeTableStyle', palette);
      if (whole) {
        const backgrounds = Object.assign(new Style(), whole);
        delete backgrounds.borderLeft;
        delete backgrounds.borderTop;
        delete backgrounds.borderRight;
        delete backgrounds.borderBottom;
        delete backgrounds.borderHorizontal;
        delete backgrounds.borderVertical;
        mergeStyle(result, backgrounds);
      }
      const r = row - data.row;
      const isFirstRow = r === 0, isLastRow = r === data.rowCount - 1;
      if (table.options.bandRows)
        mergeStyle(result, role(r % 2 === 0 ? 'firstRowStripStyle' : 'secondRowStripStyle'));
      if (table.options.bandColumns)
        mergeStyle(result, role(c % 2 === 0 ? 'firstColumnStripStyle' : 'secondColumnStripStyle'));
      if (table.options.highlightFirstColumn && c === 0) mergeStyle(result, role('highlightFirstColumnStyle'));
      if (table.options.highlightLastColumn && c === table.colCount - 1) mergeStyle(result, role('highlightLastColumnStyle'));
      const borders = result as JsonRecord;
      const horizontal = whole?.borderHorizontal;
      if (horizontal) {
        borders.borderTop = cloneBorder(horizontal);
        borders.borderBottom = cloneBorder(horizontal);
      }
      if (isFirstRow && whole?.borderTop) borders.borderTop = cloneBorder(whole.borderTop);
      if (isLastRow && whole?.borderBottom) borders.borderBottom = cloneBorder(whole.borderBottom);
      if (c === 0 && whole?.borderLeft) borders.borderLeft = cloneBorder(whole.borderLeft);
      if (c === table.colCount - 1 && whole?.borderRight) borders.borderRight = cloneBorder(whole.borderRight);
    }
    const tableColumn = table.columns[c];
    const layout = table.layoutStyles.get(c);
    if (layout) {
      const kind = row === header ? 'header' : row === footer ? 'footer' : 'data';
      const style = layout[kind];
      if (style) mergeStyle(result, typeof style === 'string' ? undefined : styleFromProps(style));
    } else if (tableColumn) {
      const kind = row === header ? 'headerStyle' : row === footer ? 'footerStyle' : 'dataStyle';
      const style = tableColumn.fields[kind];
      if (style instanceof Style) mergeStyle(result, style);
      else if (typeof style === 'object' && style) mergeStyle(result, styleFromProps(style));
    }
    const borders = result as JsonRecord;
    delete borders.borderHorizontal;
    delete borders.borderVertical;
    if (c !== 0) delete borders.borderLeft;
    if (c !== table.colCount - 1) delete borders.borderRight;
    if (!Object.keys(result).length) return null;
    return result;
}

export function toJSON(table: Table, ): JsonRecord {
    // The trial re-reads the header row when a table serialises: a header cell
    // edited through the sheet API renames its table column (probe f40d-header-names).
    table._syncNamesFromHeader();
    const range = table.range();
    const result: JsonRecord = {
      name: table.tableName,
      row: range.row,
      col: range.col,
      rowCount: range.rowCount,
      colCount: range.colCount,
    };
    if (!table.options.showHeader) result.showHeader = false;
    if (table.options.showFooter) result.showFooter = true;
    if (table.options.useFooterDropDownList) result.useFooterDropDownList = true;
    if (!table.options.bandRows) result.bandRows = false;
    if (table.options.bandColumns) result.bandColumns = true;
    if (table.options.highlightFirstColumn) result.highlightFirstColumn = true;
    if (table.options.highlightLastColumn) result.highlightLastColumn = true;
    if (table.options.showResizeHandle) result.showResizeHandle = true;
    if (!table.options.allowAutoExpand) result.allowAutoExpand = false;
    if (!table.options.autoGenerateColumns) result.autoGenerateColumns = false;
    if (table.options.bindingPath) result.bindingPath = table.options.bindingPath;
    if (table.options.expandBoundRows) result.expandBoundRows = true;
    if (Object.keys(table.layoutStyles).length)
      result.layoutStyle = Object.fromEntries(
        [...table.layoutStyles].map(([index, style]) => [
          index,
          Object.fromEntries(Object.entries(style).map(([kind, value]) => [kind, styleToJSON(value as Style)])),
        ]),
      );
    result.reservedElement = table.reservedElement;
    const styleName = table.getStyleName();
    result.style = styleName;
    const dataRange = table.dataRange();
    table.filter.range = new Range(dataRange.row, dataRange.col, dataRange.rowCount, dataRange.colCount);
    const filterJSON = filterToJSON(table.filter, table.tableName);
    if (table.filter._hasButtons()) {
      const visible: Record<string, boolean> = {};
      for (let c = 0; c < table.colCount; c++) visible[c] = table.filter.filterButtonVisible(c) !== false;
      filterJSON.filterButtonVisibleInfo = visible;
    } else delete filterJSON.filterButtonVisibleInfo;
    result.rowFilter = filterJSON;
    result.columns = table.columns.map((column) => column.toJSON());
    return result;
}

export function fromJSON(table: Table, settings: object): void {
    const json = objectRecord(settings);
    table.parsedFromJSON = true;
    table.reservedElement = json.reservedElement;
    table.tableName = String(json.name ?? table.tableName);
    table.col = Number(json.col ?? 0);
    table.colCount = Number(json.colCount ?? 1);
    table.options.showHeader = json.showHeader !== false;
    table.options.showFooter = json.showFooter === true;
    const totalRows = Number(json.rowCount ?? 1);
    table.row = Number(json.row ?? 0) + (table.options.showHeader ? 1 : 0);
    table.rowCount = Math.max(
      0,
      totalRows - (table.options.showHeader ? 1 : 0) - (table.options.showFooter ? 1 : 0),
    );
    table.options.useFooterDropDownList = json.useFooterDropDownList === true;
    table.options.bandRows = json.bandRows !== false;
    table.options.bandColumns = json.bandColumns === true;
    table.options.highlightFirstColumn = json.highlightFirstColumn === true;
    table.options.highlightLastColumn = json.highlightLastColumn === true;
    table.options.showResizeHandle = json.showResizeHandle === true;
    table.options.allowAutoExpand = json.allowAutoExpand !== false;
    table.options.autoGenerateColumns = json.autoGenerateColumns !== false;
    table.options.bindingPath = String(json.bindingPath ?? '');
    table.options.expandBoundRows = json.expandBoundRows === true;
    table.tableStyle = themeByName(String(json.style ?? 'medium2')) ?? (TableThemes.medium2 as TableTheme);
    table.filter = filterFromJSON(json.rowFilter ?? {}, true);
    table.columns = [];
    for (const raw of Array.isArray(json.columns) ? json.columns : []) {
      const column = new TableColumn(Number(objectRecord(raw).id ?? table.columns.length + 1));
      column.fromJSON(raw as object);
      table.columns.push(column);
    }
    if (!table.columns.length) table.resetColumns();
    const layout = json.layoutStyle as JsonRecord | undefined;
    table.layoutStyles.clear();
    if (layout)
      for (const [index, style] of Object.entries(layout))
        table.layoutStyles.set(Number(index), style as JsonRecord);
}
