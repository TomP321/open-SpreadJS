/* Page Layout commands: print area, page breaks, paper/margins/orientation,
 * print gridlines/headings, the print-line toggle and the worksheet
 * background layout options. */
import type { DesignerApi as Designer } from '../designer-api.js';
import type { Worksheet } from '../core-internals.js';
import { internals, printInfoInternals, printInfoOf } from '../core-internals.js';
import { selectionBounds } from './base.js';

/**
 * Sheet commands that mutate printing settings all write through the model
 * (`sheet.printInfo()`, `sheet.setRowPageBreak`, `sheet.backgroundImage`) like
 * the official designer does; the ribbon state reads them back in
 * `Designer.getCommandState`. Nothing is kept in a Designer-local store.
 */
/** Set the print area to the selection (or a range), mirroring the official. */
export function setPrintAreaRange(sheet: Worksheet, bounds?: { row: number; col: number; rowCount: number; colCount: number }): void {
  const pi = printInfoOf(sheet);
  const area = bounds ?? selectionBounds(sheet);
  const lastRow = Math.min(sheet.getRowCount() - 1, area.row + Math.max(1, area.rowCount) - 1);
  const lastCol = Math.min(sheet.getColumnCount() - 1, area.col + Math.max(1, area.colCount) - 1);
  pi.rowStart(area.row);
  pi.columnStart(area.col);
  pi.rowEnd(lastRow);
  pi.columnEnd(lastCol);
}
/** Remove the print area: all four range fields go back to -1 (name deleted). */
export function clearPrintAreaRange(sheet: Worksheet): void {
  const pi = printInfoOf(sheet);
  pi.rowStart(-1);
  pi.columnStart(-1);
  pi.rowEnd(-1);
  pi.columnEnd(-1);
}
export function togglePrintLineVisible(sheet: Worksheet): void {
  sheet.isPrintLineVisible(!sheet.isPrintLineVisible());
}
/** Set the paper kind through the PrintInfo setter so page geometry invalidates. */
export function setPaperKind(sheet: Worksheet, kind: number): void {
  const pi = printInfoOf(sheet);
  const dims = pi.paperSize().getPageSize(kind);
  printInfoInternals(pi).paperSize({ width: dims.width, height: dims.height, kind });
}
/** Re-apply the current background image with one layout option flipped. */
export function patchBackground(sheet: Worksheet, patch: { layout?: 'repeat' | 'none'; paintOrder?: 'normal' | 'over-content' }): void {
  const info = internals(sheet).getBackgroundImageInfo();
  if (!info.backgroundImage) return;
  sheet.backgroundImage(info.backgroundImage, {
    layout: patch.layout ?? info.option.layout ?? 'none',
    paintOrder: patch.paintOrder ?? info.option.paintOrder ?? 'normal',
  });
}
/**
 * Seed the print header/heading visibility and first page number like the
 * trial: every Page Layout command touches them the first time one runs.
 */
export function seedPageLayout(d: Designer, sheet: Worksheet): void {
  d.syncPageLayoutDefaults(sheet);
}
/**
 * Page Setup commands that make the trial seed the print header/heading
 * visibility and first page number into printInfo on first execution.
 */
export const PAGE_LAYOUT_SEEDED = new Set(['fitPageScale', 'orientationPortrait', 'orientationLandscape', 'marginNormal', 'marginWide', 'marginNarrow', 'paperLetter', 'paperLegal', 'paperA4', 'paperA3', 'pageLayoutPrintGridlines', 'pageLayoutPrintHeadings']);
