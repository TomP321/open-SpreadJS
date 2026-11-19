import { Worksheet } from '../worksheet.js';
import type { SerializationOptions } from '../sheet-common.js';

export interface TemplateCell {
  type: 'List' | 'Group' | 'Summary' | 'Static' | 'Chart';
  binding?: string;
  spillDirection?: 'Vertical' | 'Horizontal' | 'None';
  aggregate?: 'Sum' | 'Avg' | 'Max' | 'Min' | 'Count';
  context?: { vertical?: string; horizontal?: string };
  filter?: unknown;
  sortOptions?: unknown;
  showCollapseButton?: boolean;
  initialExpansionState?: 'Expanded' | 'Collapsed';
  [key: string]: unknown;
}
export type PaginationSetting = {
  rowPagination?: { paginationDataCell: string; rowCountPerPage: number };
  titleRow?: { start: number; end: number };
  endRow?: { start: number; end: number };
  [key: string]: unknown;
};

export class TemplateSheet extends Worksheet {
  private cells = new Map<string, TemplateCell>();
  private pagination?: PaginationSetting;
  private layout?: object;
  private dataEntry?: object[];
  setTemplateCell(row: number, col: number, cell: TemplateCell): void { this.cells.set(`${row},${col}`, structuredClone(cell)); }
  getTemplateCell(row: number, col: number): TemplateCell | undefined { return this.cells.get(`${row},${col}`); }
  entries(): [number, number, TemplateCell][] {
    return [...this.cells].map(([key, cell]) => {
      const [row, col] = key.split(',').map(Number);
      return [row!, col!, cell];
    });
  }
  setPaginationSetting(value: PaginationSetting): void { this.pagination = structuredClone(value); }
  getPaginationSetting(): PaginationSetting | undefined { return this.pagination; }
  setLayoutSetting(value: object): void { this.layout = structuredClone(value); }
  getLayoutSetting(): object | undefined { return this.layout; }
  setDataEntrySetting(value: object[]): void { this.dataEntry = structuredClone(value); }
  getDataEntrySetting(): object[] | undefined { return this.dataEntry; }
  override toJSON(options: SerializationOptions = {}): Record<string, unknown> {
    const result = super.toJSON(options);
    const data = (result.data ??= {}) as Record<string, unknown>;
    const table = (data.dataTable ??= {}) as Record<string, Record<string, Record<string, unknown>>>;
    for (const [row, col, cell] of this.entries()) {
      const rowData = (table[row] ??= {});
      const node = (rowData[col] ??= {});
      node.bindingPath = structuredClone(cell);
    }
    result.templateSetting = { templateOptions: {}, containers: [],
      ...(this.layout ? { layoutSetting: this.layout } : {}),
      ...(this.dataEntry ? { dataEntrySetting: this.dataEntry } : {}),
      ...(this.pagination ? { paginationSetting: this.pagination } : {}) };
    result.type = 1;
    return result;
  }
  override fromJSON(value: object): void {
    const json = structuredClone(value) as Record<string, unknown>;
    const data = json.data as { dataTable?: Record<string, Record<string, Record<string, unknown>>> } | undefined;
    this.cells.clear();
    for (const [row, columns] of Object.entries(data?.dataTable ?? {})) {
      for (const [col, node] of Object.entries(columns)) {
        if (node.bindingPath && typeof node.bindingPath === 'object') {
          this.setTemplateCell(Number(row), Number(col), node.bindingPath as TemplateCell);
          delete node.bindingPath;
        }
      }
    }
    super.fromJSON(json);
    const old = json.reportTemplate as { cells?: [number, number, TemplateCell][]; pagination?: PaginationSetting;
      layout?: object; dataEntry?: object[] } | undefined;
    for (const [row, col, cell] of old?.cells ?? []) this.setTemplateCell(row, col, cell);
    const setting = json.templateSetting as { paginationSetting?: PaginationSetting; layoutSetting?: object;
      dataEntrySetting?: object[] } | undefined;
    this.pagination = setting?.paginationSetting ?? old?.pagination;
    this.layout = setting?.layoutSetting ?? old?.layout;
    this.dataEntry = setting?.dataEntrySetting ?? old?.dataEntry;
  }
}
