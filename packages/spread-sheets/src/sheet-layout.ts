/**
 * Row/column geometry of `Worksheet`: per-index dimensions, axis
 * metadata, merged spans, frozen panes and the browser-measured auto-fit.
 * Bodies moved out of `worksheet.ts` unchanged (`this` renamed to the
 * `sheet` parameter); the class keeps thin delegating methods.
 */
import { GC } from './generated/enums.js';
import { notImplemented } from './not-implemented.js';
import { Range } from './primitives.js';
import type { JsonRecord } from './serialization.js';
import { coordinate, count } from './sheet-common.js';
import { _expandSelectionToSpans } from './sheet-selection.js';
import type { Worksheet } from './worksheet.js';

const { SheetArea } = GC.Spread.Sheets;
const VIEW = SheetArea.viewport;

export function setDimension(sheet: Worksheet, axis: 'row' | 'col', index: number, value: number | string, area: number): void {
    coordinate(index, true);
    if (typeof value === 'string') notImplemented('Worksheet dynamic row/column sizes');
    if (!Number.isFinite(value) || value < 0) throw new RangeError('Invalid row height or column width');
    if (index === -1) {
      if (axis === 'row') {
        if (area === SheetArea.colHeader) sheet.defaults.colHeaderRowHeight = value;
        else sheet.defaults.rowHeight = value;
      } else if (area === SheetArea.rowHeader) sheet.defaults.rowHeaderColWidth = value;
      else sheet.defaults.colWidth = value;
      return;
    }
    const layout = axis === 'row' ? sheet._rowLayout(area) : sheet._columnLayout(area),
      oldValue = layout.getStoredSize(index) ?? null;
    layout.setSize(index, value);
    sheet.axisChanged(axis, index, area, axis === 'row' ? 'height' : 'width', oldValue, value);
}

export function axisMetadata(sheet: Worksheet, axis: 'row' | 'col', area: number): Map<number, JsonRecord> {
    const layout = axis === 'row' ? sheet._rowLayout(area) : sheet._columnLayout(area);
    let map = sheet.metadata.get(layout);
    if (!map) sheet.metadata.set(layout, (map = new Map()));
    return map;
}

export function setAxisMetadata(sheet: Worksheet,
    axis: 'row' | 'col',
    index: number,
    area: number,
    property: string,
    value: unknown,
  ): void {
    const map = sheet.axisMetadata(axis, area);
    map.set(index, { ...map.get(index), [property]: value });
}

export function addSpan(sheet: Worksheet, row: number, col: number, rowCount: number, colCount: number, area = VIEW): void {
    coordinate(row);
    coordinate(col);
    count(rowCount);
    count(colCount);
    if (!rowCount || !colCount) return;
    const span = new Range(row, col, rowCount, colCount),
      spans = sheet.area(area).spans;
    if (spans.some((s) => s.intersect(row, col, rowCount, colCount))) throw new Error('Overlapping spans');
    spans.push(span);
    // TASK 56 (`t56-sel` probe): the trial re-normalizes stored selections when a span is added
    // (default A1 selection + span at A1 => getSelections reports the whole span).
    sheet.selections = _expandSelectionToSpans(sheet, sheet.selections);
    sheet.batch.invalidate(true);
}

export function removeSpan(sheet: Worksheet, row: number, col: number, area = VIEW): void {
    const data = sheet.area(area);
    data.spans = data.spans.filter((span) => span.row !== row || span.col !== col);
    sheet.batch.invalidate(true);
}

export function frozenRowCount(sheet: Worksheet, value?: number, topRow = 0): number | void {
    if (value === undefined) return Number(sheet.settings.frozenRowCount);
    count(value);
    sheet.settings.frozenRowCount = value;
    sheet.settings.topCellIndex = topRow + value;
    sheet.invalidateLayout();
}

export function frozenColumnCount(sheet: Worksheet, value?: number, leftCol = 0): number | void {
    if (value === undefined) return Number(sheet.settings.frozenColCount);
    count(value);
    sheet.settings.frozenColCount = value;
    sheet.settings.leftCellIndex = leftCol + value;
    sheet.invalidateLayout();
}

export function frozenTrailingRowCount(sheet: Worksheet, value?: number, stickToEdge?: boolean): number | void {
    if (value === undefined) return Number(sheet.settings.frozenTrailingRowCount);
    count(value);
    sheet.settings.frozenTrailingRowCount = value;
    if (stickToEdge !== undefined) sheet.settings.frozenTrailingRowStickToEdge = stickToEdge;
    sheet.invalidateLayout();
}

export function frozenTrailingColumnCount(sheet: Worksheet, value?: number, stickToEdge?: boolean): number | void {
    if (value === undefined) return Number(sheet.settings.frozenTrailingColCount);
    count(value);
    sheet.settings.frozenTrailingColCount = value;
    if (stickToEdge !== undefined) sheet.settings.frozenTrailingColumnStickToEdge = stickToEdge;
    sheet.invalidateLayout();
}

export function autoFitRow(sheet: Worksheet, row: number): void {
    coordinate(row);
    const ctx = sheet.measureContext(); let height = 20;
    for (const [r, col] of sheet.area().cells.entries()) if (r === row && !sheet.getSpan(row, col)) {
      const style = sheet.getActualStyle(row, col); ctx.font = String(style.font);
      const size = Number((ctx.font.match(/([\d.]+)px/) ?? [0, 14.6667])[1]);
      const text = sheet.getText(row, col), width = Math.max(1, sheet.cols.getSize(col) - 6);
      const lines = style.wordWrap ? text.split('\n').reduce((sum, line) => sum + Math.max(1, Math.ceil(ctx.measureText(line).width / width)), 0) : text.split('\n').length;
      height = Math.max(height, Math.ceil(lines * size * 1.2 + 2));
    }
    // Trial (TASK 75 r3): a fitted height equal to the current one is not recorded —
    // a default-height row keeps no explicit size after AutoFit Row Height.
    if (sheet.getRowHeight(row) !== height) sheet.setRowHeight(row, height);
}

export function autoFitColumn(sheet: Worksheet, col: number): void {
    coordinate(col);
    const ctx = sheet.measureContext(); let width = 0;
    for (const [row, c] of sheet.area().cells.entries()) if (c === col && !sheet.getSpan(row, col)) {
      const style = sheet.getActualStyle(row, col); ctx.font = String(style.font);
      // Trial (TASK 75 r4, side-by-side canvas probe): the fitted width is the measured
      // text plus 3 px (not 8), and empty text lines do not participate.
      for (const text of sheet.getText(row, col).split('\n'))
        if (text) width = Math.max(width, ctx.measureText(text).width + 3 + Number(style.textIndent ?? 0) * 8);
    }
    // A column without measurable content keeps its current width (trial).
    if (width) sheet.setColumnWidth(col, Math.ceil(width));
}

export function measureContext(sheet: Worksheet, ): CanvasRenderingContext2D {
    const context = sheet.parent?._renderer()?.context ?? (typeof CanvasRenderingContext2D !== 'undefined' ? document.createElement('canvas').getContext('2d') : null);
    if (!context) return notImplemented('Worksheet.autoFit (requires browser text measurement)');
    return context;
}

/* ---- More `Worksheet` method bodies (moved out unchanged; `this` renamed
   to the `sheet` parameter). ---- */

export function _setRowVisible(sheet: Worksheet, row: number, value: boolean, area = VIEW, record = true): void {
    const layout = sheet._rowLayout(area),
      old = layout.isVisible(row);
    layout.setVisible(row, value, record);
    sheet.axisChanged('row', row, area, 'isVisible', old, value);
}

export function _setColumnVisible(sheet: Worksheet, col: number, value: boolean, area = VIEW, record = true): void {
    const layout = sheet._columnLayout(area),
      old = layout.isVisible(col);
    layout.setVisible(col, value, record);
    sheet.axisChanged('col', col, area, 'isVisible', old, value);
}

export function _rowCount(sheet: Worksheet, value?: number, area = VIEW): number | Worksheet {
    if (value === undefined) return sheet.getRowCount(area);
    sheet.setRowCount(value, area);
    return sheet;
}

export function _columnCount(sheet: Worksheet, value?: number, area = VIEW): number | Worksheet {
    if (value === undefined) return sheet.getColumnCount(area);
    sheet.setColumnCount(value, area);
    return sheet;
}

export function _outlineGutters(sheet: Worksheet): { row: number; col: number } {
    const rowMax = sheet.rowOutlines.getMaxLevel();
    const colMax = sheet.columnOutlines.getMaxLevel();
    return { row: rowMax < 0 ? 0 : 21 + 17 * (rowMax + 1), col: colMax < 0 ? 0 : 21 + 17 * (colMax + 1) };
}

export function getCellRect(sheet: Worksheet, row: number, col: number) {
    const view = sheet._view()?.cellRect(row, col);
    if (view) return view;
    const gutter = sheet._outlineGutters();
    return { x: sheet.cols.prefixSum(col) + 40 + gutter.row, y: sheet.rows.prefixSum(row) + 20 + gutter.col, width: sheet.cols.getSize(col), height: sheet.rows.getSize(row) };
}
