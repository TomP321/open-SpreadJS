/**
 * Slicer feature contracts and layout constants.
 * Layout numbers were measured black-box against the official trial renderer
 * (screenshot pixel scans, 100% zoom, default light1 style).
 */
import type { Worksheet } from '../../worksheet.js';
import type { Table } from '../tables.js';

export interface ISlicerRangeConditional {
  min: number;
  max: number;
}

export interface ISlicerConditional {
  exclusiveRowIndexes?: number[];
  ranges?: ISlicerRangeConditional[];
}

export interface ISlicerDataItem {
  columnName: string;
  /** @deprecated use `row` */
  rowIndex: number;
  row: number;
  data: unknown;
}

export interface ISlicerFilteredData {
  isPreview: boolean;
  rowIndexes: number[];
}

export interface ISlicerListener {
  onFiltered(data: ISlicerFilteredData): void;
  onDataChanged(data: ISlicerDataItem[]): void;
  onRowsChanged(rowIndex: number, rowCount: number, isAdd: boolean): void;
  onColumnNameChanged(oldName: string, newName: string): void;
  onColumnRemoved(columnName: string): void;
}

/** A slicer data cell: either a raw value or the documented {value, text} record. */
export type SlicerCell = { value?: unknown; text?: string } | string | number | boolean | Date | null;

export interface ISlicerChangedEventArgs {
  sheet: Worksheet;
  sheetName: string;
  slicer: unknown;
  propertyName: string;
}

export type SlicerBorderStyle =
  | 'empty' | 'thin' | 'medium' | 'dashed' | 'dotted' | 'thick' | 'double' | 'hair'
  | 'mediumDashed' | 'dashDot' | 'mediumDashDot' | 'dashDotDot' | 'mediumDashDotDot' | 'slantedDashDot';

/** Built-in slicer geometry observed from the trial (default 186x258 at (50,250)). */
export const SLICER_DEFAULT_X = 50;
export const SLICER_DEFAULT_Y = 250;
export const SLICER_DEFAULT_WIDTH = 186;
export const SLICER_DEFAULT_HEIGHT = 258;
/** Caption bar height (trial: bottom border line sits at y=23/24 with 2px list gap). */
export const SLICER_HEADER_HEIGHT = 24;
/** First item box top when the header is visible (trial pixel scan). */
export const SLICER_LIST_TOP = 29;
/** First item box top when the header is hidden. */
export const SLICER_LIST_TOP_NO_HEADER = 4;
/** Row pitch = itemHeight + 7 (trial pixel scan: rows sit on 28px boundaries at itemHeight 21). */
export const SLICER_ITEM_GAP = 7;
/** Item button horizontal margins (trial: 9px left, 15px right at width 186). */
export const SLICER_ITEM_LEFT = 9;
export const SLICER_ITEM_RIGHT = 15;
/** Text inset inside the item button. */
export const SLICER_TEXT_INSET = 5;
export const SLICER_BUTTON_RADIUS = 3;
export const SLICER_BLANK_TEXT = '(blank)';

export interface SlicerItem {
  text: string;
  value: unknown;
  selected: boolean;
  noData: boolean;
}

export type SlicerHostTable = Table & { _slicerData?: unknown };

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
