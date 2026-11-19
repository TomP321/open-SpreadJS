/**
 * TableSlicerData: a GeneralSlicerData bound to a worksheet table. Filtering
 * through the slicer writes value-equality conditions into the table's
 * HideRowFilter, so the slicer hides table rows exactly like the trial's
 * filter menu does (and stays consistent with it).
 */
import { Range } from '../../primitives.js';
import { Condition } from '../conditions.js';
import { GeneralSlicerData, shortDate } from './general-data.js';
import { SLICER_BLANK_TEXT, type ISlicerConditional, type SlicerCell } from './types.js';
import type { Table } from '../tables.js';
import type { Worksheet } from '../../worksheet.js';

export class TableSlicerData extends GeneralSlicerData {
  private tableRef: Table;

  constructor(table: Table) {
    const sheet = table.sheet as Worksheet;
    super(buildMatrix(table), buildNames(table));
    this.tableRef = table;
    if (sheet && table.filter) table.filter._table(table.name() as string);
  }

  getTable(): Table {
    return this.tableRef;
  }

  get sheet(): Worksheet {
    return this.tableRef.sheet as Worksheet;
  }

  refresh(): void {
    this.data = buildMatrix(this.tableRef);
    this.columnNames = buildNames(this.tableRef);
    this.onFiltered();
  }

  override doFilter(columnName: string, conditional: ISlicerConditional, isPreview = false): void {
    super.doFilter(columnName, conditional, isPreview);
    if (!isPreview) this.syncToTable(columnName);
  }

  override doUnfilter(columnName: string): void {
    super.doUnfilter(columnName);
    this.clearFromTable(columnName);
  }

  /** Exclusive indexes the table filter currently keeps for the column. */
  getSelectedIndexes(columnName: string): number[] | null {
    const colIndex = this.tableColumnIndex(columnName);
    if (colIndex < 0) return null;
    const items = this.rowFilter()?.getFilterItems(colIndex) ?? [];
    if (!items.length) return null;
    const expected = items.map(item => String((item.toJSON() as { expected?: unknown }).expected ?? '').toLowerCase());
    const out: number[] = [];
    this.getExclusiveData(columnName).forEach((text, index) => {
      if (expected.includes(displayTextOf(text).toLowerCase())) out.push(index);
    });
    return out;
  }

  /**
   * True when the exclusive value still has at least one row visible under
   * every other column's filter (the trial's "no data" flag for items).
   */
  hasRowForOtherColumns(columnName: string, exclusiveIndex: number): boolean {
    const rows = this.getRowIndexes(columnName, exclusiveIndex);
    const kept = this.rowsKeptExcept(columnName);
    return rows.some(row => kept.has(row));
  }

  /**
   * Trial parity: the no-data flags reflect the TABLE's real filter state, so a
   * filter applied through the filter menu (or another slicer) greys this
   * slicer's items just like in the trial. This column's OWN filter never greys
   * its own items (the trial keeps the current selection fully coloured).
   */
  protected override rowsKeptExcept(columnName: string): Set<number> {
    const filter = this.rowFilter();
    const colIndex = this.tableColumnIndex(columnName);
    if (!filter || typeof filter.getFilterItems !== 'function' || colIndex < 0)
      return super.rowsKeptExcept(columnName);
    const kept = new Set<number>();
    for (let row = 0; row < this.data.length; row++) {
      let ok = true;
      for (let c = 0; c < this.columnNames.length && ok; c++) {
        if (c === colIndex) continue;
        const conditions = filter.getFilterItems(c) ?? [];
        if (!conditions.length) continue;
        const cell = this.data[row]?.[c] as { text?: string; value?: unknown } | undefined;
        const text = String(cell?.text ?? cell?.value ?? '').toLowerCase();
        ok = conditions.some(condition =>
          String((condition.toJSON() as { expected?: unknown }).expected ?? '').toLowerCase() === text);
      }
      if (ok) kept.add(row);
    }
    return kept;
  }

  rowFilter() {
    return this.tableRef.filter;
  }

  tableColumnIndex(columnName: string): number {
    return this.columnNames.indexOf(columnName);
  }

  /** Re-read table cells (sheet edits) and re-apply every slicer column. */
  _onCellChanged(row: number, col: number): void {
    const data = this.tableRef.dataRange();
    if (!data.contains(row, col)) return;
    this.refresh();
  }

  private syncToTable(columnName: string): void {
    const filter = this.rowFilter();
    const colIndex = this.tableColumnIndex(columnName);
    if (!filter || colIndex < 0) return;
    const texts = this.getExclusiveData(columnName);
    const selected = this.getFilteredIndexes(columnName);
    const conditions = selected.map((index: number) => conditionFor(texts[index]));
    if (selected.length && selected.length < texts.length) {
      filter.addFilterItem(colIndex, conditions);
      filter.filter(colIndex);
    } else {
      filter.removeFilterItems(colIndex);
      filter.filter();
    }
  }

  private clearFromTable(columnName: string): void {
    const filter = this.rowFilter();
    const colIndex = this.tableColumnIndex(columnName);
    if (!filter || colIndex < 0) return;
    filter.removeFilterItems(colIndex);
    filter.filter();
  }

  /** Map a sheet row inside the data range to the slicer data row. */
  toDataRow(sheetRow: number): number {
    const data = this.tableRef.dataRange();
    return sheetRow - data.row;
  }
}

function buildNames(table: Table): string[] {
  return table.columns.map((column, index) => String(column.name() ?? `Column${index + 1}`));
}

function buildMatrix(table: Table): SlicerCell[][] {
  const sheet = table.sheet as Worksheet;
  if (!sheet) return [];
  const names = buildNames(table);
  const data = table.dataRange();
  const rows: SlicerCell[][] = [];
  for (let r = 0; r < data.rowCount; r++) {
    const row: SlicerCell[] = [];
    for (let c = 0; c < names.length; c++) {
      const value = sheet.getValue(data.row + r, data.col + c);
      row.push({ value, text: displayText(value) });
    }
    rows.push(row);
  }
  return rows;
}

/** Display text for a cell value, matching the trial's slicer item labels. */
export function displayText(value: unknown): string {
  if (value === null || value === undefined || value === '') return '';
  if (value instanceof Date) return shortDate(value);
  return String(value);
}

/** Item labels show "(blank)" for empty cells; the filter condition keeps "". */
export function displayTextOf(text: string): string {
  return text === '' ? SLICER_BLANK_TEXT : text;
}

function conditionFor(text: string): Condition {
  return new Condition(2 /* textCondition */, {
    compareType: 0 /* equalsTo */,
    expected: text === SLICER_BLANK_TEXT ? '' : text,
    useWildCards: false,
    ignoreCase: true,
  });
}

/** The filter range of the table (exported for tests / serialisation). */
export function tableDataRowRange(table: Table): Range {
  return table.dataRange();
}
