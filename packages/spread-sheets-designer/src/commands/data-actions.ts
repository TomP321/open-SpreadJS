/* Data Tools / Table / Hyperlink / Validation commands: the table gallery
 * style apply, the Insert Table dialog applier, hyperlink and header-cell
 * writers, data validation, sort/subtotal/duplicates/text-to-columns and the
 * outline helpers they delegate to (data-engine). */
import type { DesignerApi as Designer } from '../designer-api.js';
import type { DataValidator, SheetArea, Worksheet } from '../core-internals.js';
import { dataValidationFactory, hyperlinkWriter, recordView } from '../core-internals.js';
import type GC from '@mescius/spread-sheets';
import {
  applyAutoOutline, applySortToSheet, applySubtotalToSheet, removeDuplicateRows as removeDuplicateRowsIn, removeSubtotalRows,
  sheetHasOutlines, splitRows, writeSplitColumns, parseDestinationAddress,
  type Bounds, type DuplicateData, type DuplicateResult, type SortData, type SubtotalData, type TextToColumnsData,
} from '../data-engine.js';
import { activeRanges, activeSheet, selectionBounds, topCell } from './base.js';

export function applyTable(d: Designer, styleName: string): void {
  const sheet = activeSheet(d);
  const range = activeRanges(sheet)[0];
  if (!range) return;
  const r = Math.max(0, range.row), c = Math.max(0, range.col);
  const rc = range.rowCount < 0 ? sheet.getRowCount() - r : range.rowCount;
  const cc = range.colCount < 0 ? sheet.getColumnCount() - c : range.colCount;
  let name = 'Table1', i = 1;
  while (sheet.tables.findByName(name)) name = `Table${++i}`;
  sheet.tables.add(name, r, c, rc, cc, styleName);
}

export function applyHyperlink(d: Designer, data: Record<string, unknown>): void {
  const sheet = activeSheet(d);
  const { row, col } = topCell(sheet);
  if (data.remove) { hyperlinkWriter(sheet).setHyperlink(row, col, null); return; }
  const targetIndex = ['blank', 'self', 'parent', 'top'].indexOf(String(data.target ?? 'blank'));
  // The dialog's three tabs produce the three address forms of the trial.
  const email = String(data.email ?? '').trim();
  const reference = String(data.reference ?? '').trim();
  const address = String(data.address ?? data.url ?? (email ? `mailto:${email}${String(data.subject ?? '').trim() ? `?subject=${String(data.subject).trim()}` : ''}` : reference ? `#${reference}` : ''));
  if (!address) return;
  const text = String(data.text ?? address);
  sheet.setValue(row, col, text);
  sheet.setHyperlink(row, col, {
    url: address, tooltip: String(data.tooltip ?? ''), target: Math.max(0, targetIndex), linkColor: String(data.linkColor ?? '#0563c1'), visitedLinkColor: String(data.visitedLinkColor ?? '#954f72'),
  });
}
/** Header Cells dialog: writes the header-area style of one row/column header cell. */
const HEADER_H_ALIGN: Record<string, number> = { left: 0, center: 1, right: 2, general: 3 };
const HEADER_V_ALIGN: Record<string, number> = { top: 0, center: 1, bottom: 2 };
const HEADER_LINE_STYLE: Record<string, number> = { none: 0, thin: 1, medium: 2, thick: 3, dotted: 4, dashed: 5 };
export function applyHeaderStyle(d: Designer, args: Record<string, unknown>): void {
  const GC = d.gc;
  const sheet = activeSheet(d);
  const area = Number(args.area) as SheetArea, row = Number(args.row), col = Number(args.col);
  const prefix = String(args.prefix), data = (args.data ?? {}) as Record<string, unknown>;
  const style = sheet.getStyle(row, col, area)?.clone?.() ?? new GC.Spread.Sheets.Style();
  const color = (value: unknown): unknown => (String(value ?? '') ? String(value) : undefined);
  style.backColor = color(data[`${prefix}backColor`]) as string | undefined;
  style.foreColor = color(data[`${prefix}foreColor`]) as string | undefined;
  const font = String(data[`${prefix}font`] ?? '');
  if (font) style.font = font;
  style.formatter = String(data[`${prefix}formatter`] ?? '') || undefined;
  style.hAlign = (HEADER_H_ALIGN[String(data[`${prefix}hAlign`] ?? 'general')] ?? 3) as GC.Spread.Sheets.HorizontalAlign;
  style.vAlign = (HEADER_V_ALIGN[String(data[`${prefix}vAlign`] ?? 'top')] ?? 0) as GC.Spread.Sheets.VerticalAlign;
  style.textIndent = Number(data[`${prefix}textIndent`] ?? 0);
  for (const key of ['borderLeft', 'borderRight', 'borderTop', 'borderBottom', 'diagonalUp', 'diagonalDown']) {
    const name = String(data[`${prefix}${key}`] ?? 'none');
    recordView(style)[key] = name === 'none' ? undefined : new GC.Spread.Sheets.LineBorder('#000000', HEADER_LINE_STYLE[name] ?? 1);
  }
  const radius = String(data[`${prefix}borderRadius`] ?? '').trim();
  if (radius) style.borderRadius = radius;
  style.locked = !!data[`${prefix}locked`];
  style.wordWrap = !!data[`${prefix}wordWrap`];
  style.shrinkToFit = !!data[`${prefix}shrinkToFit`];
  style.isVerticalText = !!data[`${prefix}verticalText`];
  sheet.setStyle(row, col, style, area);
}

export function applyTableCell(d: Designer, data: Record<string, unknown>): void {
  const sheet = activeSheet(d);
  const { row, col, rowCount, colCount } = selectionBounds(sheet);
  let table = sheet.tables.all().find((item) => item.range && item.range().contains(row, col));
  if (!table) {
    let name = 'Table1', i = 1;
    while (sheet.tables.findByName(name)) name = `Table${++i}`;
    table = sheet.tables.add(name, row, col, Math.max(1, rowCount), Math.max(1, colCount), String(data.tableStyle ?? 'medium2'));
  }
  const headers = Array.isArray(data.headers) ? data.headers : null;
  if (data.hasHeaders !== false && headers) for (let c = 0; c < colCount; c++) sheet.setValue(row, col + c, headers[c] ?? `Column${c + 1}`);
}
export function applyDataValidation(d: Designer, data: Record<string, unknown>): void {
  const sheet = activeSheet(d);
  const GC = d.gc;
  const V = dataValidationFactory(GC);
  const kind = String(data.validationType ?? 'Any value');
  let validator: DataValidator | null = null;
  if (kind === 'List') validator = V.createListValidator(String(data.source ?? ''));
  else if (kind === 'Whole number' || kind === 'Decimal') {
    const op = Number(data.operator ?? 0);
    validator = V.createNumberValidator(op, data.source ?? data.formula1 ?? 0, data.formula2 ?? null, kind === 'Whole number');
  } else if (kind === 'Date') validator = V.createDateValidator(Number(data.operator ?? 0), data.source ?? data.formula1 ?? '', data.formula2 ?? '');
  else if (kind === 'Time') validator = V.createTimeValidator(Number(data.operator ?? 0), data.source ?? data.formula1 ?? '', data.formula2 ?? '');
  else if (kind === 'Text length') validator = V.createTextLengthValidator(Number(data.operator ?? 0), data.source ?? data.formula1 ?? 0, data.formula2 ?? 0);
  else if (kind === 'Custom') validator = V.createFormulaValidator(String(data.source ?? ''));
  else if (data.inputTitle || data.inputMessage || data.errorTitle || data.errorMessage) validator = new V.DefaultDataValidator();
  validator?.ignoreBlank?.(data.ignoreBlank !== false);
  validator?.inCellDropdown?.(data.inCellDropdown !== false);
  validator?.showErrorMessage?.(data.showErrorMessage !== false);
  validator?.errorTitle?.(String(data.errorTitle ?? ''));
  validator?.errorMessage?.(String(data.errorMessage ?? ''));
  validator?.errorStyle?.(Number(data.errorStyle ?? 0) as GC.Spread.Sheets.DataValidation.ErrorStyle);
  validator?.showInputMessage?.(data.showInputMessage !== false);
  validator?.inputTitle?.(String(data.inputTitle ?? ''));
  validator?.inputMessage?.(String(data.inputMessage ?? ''));
  if (data.highlightType !== undefined || data.highlightColor !== undefined || data.highlightPosition !== undefined || data.highlightImage) {
    const highlightType = Number(data.highlightType ?? 0);
    const style: GC.Spread.Sheets.DataValidation.IHighLightStyle = { type: highlightType as GC.Spread.Sheets.DataValidation.HighlightType, color: String(data.highlightColor ?? 'red') };
    // The trial stores position/image only for the icon highlight type.
    if (highlightType === 2) {
      style.position = Number(data.highlightPosition ?? 4) as GC.Spread.Sheets.DataValidation.HighlightPosition;
      style.image = String(data.highlightImage ?? '');
    }
    validator?.highlightStyle?.(style);
  }
  const { row, col, rowCount, colCount } = selectionBounds(sheet);
  for (let r = row; r < row + rowCount; r++) for (let c = col; c < col + colCount; c++) sheet.setDataValidator(r, c, validator as DataValidator);
}
export function applySort(d: Designer, data: Record<string, unknown>): void {
  applySortToSheet(activeSheet(d), data as SortData);
}
export function removeDuplicateRows(d: Designer, data: Record<string, unknown>): DuplicateResult | null {
  const sheet = activeSheet(d);
  // The trial refuses to remove duplicates inside a range that has an outline.
  if (sheetHasOutlines(sheet)) return null;
  const payload = data as DuplicateData;
  const columns = Array.isArray(payload.columns) ? payload.columns
    : Array.isArray((data as { checked?: boolean[] }).checked) ? (data as { checked: boolean[] }).checked.map((value: boolean, index: number) => (value ? index : -1)).filter((index: number) => index >= 0)
      : [];
  return removeDuplicateRowsIn(sheet, { ...payload, columns }, d.gc);
}
export function splitTextToColumns(d: Designer, data: Record<string, unknown>, args: Record<string, unknown>): boolean {
  const payload = data as TextToColumnsData;
  const sheet = activeSheet(d);
  const rows = splitRows(payload, readRegionTexts(sheet, payload.region));
  const destination = parseDestinationAddress(String(data.destination ?? '')) ?? { row: payload.region.row, col: payload.region.col };
  const out = writeSplitColumns(sheet, d.gc, payload, destination, rows, data.confirmed === true);
  if (out.replaced && data.confirmed !== true) {
    args.needsReplace = true;
    return false;
  }
  return true;
}
function readRegionTexts(sheet: Worksheet, region: Bounds): string[] {
  const texts: string[] = [];
  for (let r = 0; r < region.rowCount; r++) {
    const value = sheet.getText ? sheet.getText(region.row + r, region.col) : sheet.getValue(region.row + r, region.col);
    texts.push(String(value ?? ''));
  }
  return texts;
}
export function applySubtotal(d: Designer, data: Record<string, unknown>): void {
  const payload = data as SubtotalData & { checked?: boolean[] };
  const columns = Array.isArray(payload.columns) ? payload.columns
    : Array.isArray(payload.checked) ? payload.checked.map((value, index) => (value ? index : -1)).filter((index) => index >= 0)
      : [];
  applySubtotalToSheet(activeSheet(d), { ...payload, columns });
}
export function removeSubtotals(d: Designer): void {
  const sheet = activeSheet(d);
  sheet.rowOutlines.ungroup();
  removeSubtotalRows(sheet);
}
export function applyCircleInvalid(d: Designer): void {
  const sheet = activeSheet(d);
  const { row, col, rowCount, colCount } = selectionBounds(sheet);
  let touched = false;
  for (let r = row; r < row + rowCount; r++) {
    for (let c = col; c < col + colCount; c++) {
      const validator = sheet.getDataValidator(r, c);
      if (!validator) continue;
      validator.highlightStyle({ type: 0, color: 'red' });
      sheet.setDataValidator(r, c, validator);
      touched = true;
    }
  }
  if (touched) d.getWorkbook().options.highlightInvalidData = true;
}
export function applyClearCircles(d: Designer): void {
  d.getWorkbook().options.highlightInvalidData = false;
}
export function applyAutoOutlineCommand(d: Designer, data: Record<string, unknown>): void {
  const sheet = activeSheet(d);
  applyAutoOutline(sheet, (data.region ?? selectionBounds(sheet)) as Bounds);
}
