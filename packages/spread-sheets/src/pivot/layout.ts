/**
 * Virtual pivot grid types (TASK 41 item 2).
 * The layout is a list of cells the pivot occupies — labels, values, headers,
 * subtotals, grand totals, page (report filter) fields — with node metadata
 * and the theme style slot for every cell. `PivotTable` writes the result
 * into worksheet cells.
 */
import {} from './types.js';
import type { IPivotItemInfo, IValueInfo } from './types.js';

export interface LayoutNodeInfo {
  fieldInfos: IPivotItemInfo[];
  valueInfo: IValueInfo;
}

export type CellKind =
  | 'corner' | 'colHeader' | 'rowLabel' | 'value' | 'subtotalLabel' | 'subtotalValue'
  | 'grandLabel' | 'grandValue' | 'pageLabel' | 'pageValue' | 'valuesCaption';

export interface LayoutCell {
  row: number;
  col: number;
  kind: CellKind;
  /** Displayed text (labels) — undefined for value cells. */
  text?: string;
  /** Aggregated result for value cells. */
  value?: number | null;
  /** Node metadata for value cells (trial-compatible getNodeInfo shape). */
  node?: LayoutNodeInfo;
  /** Theme slot name for the cell style. */
  slot: string;
  /** Row label indent level (compact layout). */
  level?: number;
  /** Text indent (8 px units) used by the compact/outline label columns. */
  indent?: number;
  /** Header cell carrying a filter button. */
  filterButton?: boolean;
  /** Label cell carrying a +/− drill button. */
  expand?: boolean;
  /** x offset (px from the cell's left edge) of the drill button. */
  drillOffset?: number;
  /** Source field + item the drill button toggles (interaction hit data). */
  drillField?: string;
  drillItem?: string;
  collapsed?: boolean;
  formatter?: string;
}

export interface PivotLayoutModel {
  cells: LayoutCell[];
  /** Page area (report filter) size; zero when there are no page fields. */
  pageRowCount: number;
  pageColCount: number;
  /** Content rectangle inside the pivot's virtual grid. */
  contentTop: number;
  contentLeft: number;
  contentRowCount: number;
  contentColCount: number;
  /** Total occupied rectangle (page + content). */
  rowCount: number;
  colCount: number;
  /** Column offset of the page area inside the pivot grid. */
  pageLeft: number;
}
