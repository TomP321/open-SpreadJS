import { notImplemented } from '../not-implemented.js';
import { parseFormula, type AstNode } from '../calc/parser.js';
import { Evaluator, type EvalHost } from '../calc/evaluate.js';
import { CalcArray, type Value } from '../calc/values.js';
import { readRemote, sendRemote } from './transport.js';
import { convertSchemaValue } from './schema.js';
import { groupRows, type GroupDescription } from './group.js';
import { matchesFilter, type Filter } from './filter.js';

type Row = Record<string, unknown>;
function fieldParts(path: string): string[] {
  return path.match(/\[[^\]]*\]|[^.]+/g)?.map(part =>
    part.startsWith('[') && part.endsWith(']') ? part.slice(1, -1) : part) ?? [];
}

type Column = { name?: string; value?: string; width?: number | string; [key: string]: unknown };
type Options = {
  data?: unknown; remote?: { read: unknown; create?: unknown; update?: unknown; delete?: unknown; batch?: unknown }; batch?: boolean;
  autoSync?: boolean;
  schema?: { columns?: Record<string, Column>; dataPath?: string; hierarchy?: {
    type: 'Parent' | 'Level' | 'Custom' | 'ChildrenPath'; column: string;
    outlineColumn?: string | { value: string; [key: string]: unknown };
    parse?: (options: { data: Row; index: number }) => unknown;
    unparse?: (options: { data: Row | undefined; index: number; parentData: Row | undefined }) => unknown;
  } };
};
type ViewOptions = { defaultColumnWidth?: number; [key: string]: unknown };
type Relationship = {
  sourceTable: Table; sourceFieldName: string; sourceRelationshipName: string;
  targetTable: Table; targetFieldName: string; targetRelationshipName: string;
};

export class DataManager {
  tables: Record<string, Table> = {};
  relationships: Relationship[] = [];
  addTable(name: string, options: Options): Table {
    const table = new Table(name, options, this);
    this.tables[name] = table;
    return table;
  }
  removeTable(name: string): void { delete this.tables[name]; }
  addRelationship(
    sourceTable: Table, sourceFieldName: string, sourceRelationshipName: string,
    targetTable: Table, targetFieldName: string, targetRelationshipName: string,
  ): Relationship {
    const relationship = { sourceTable, sourceFieldName, sourceRelationshipName, targetTable, targetFieldName, targetRelationshipName };
    this.relationships.push(relationship);
    return relationship;
  }
  removeRelationship(name: string): void {
    const index = this.relationships.findIndex(relationship => relationship.sourceRelationshipName === name);
    if (index !== -1) this.relationships.splice(index, 1);
  }
}

export class Table {
  revision = 0;
  columns: Record<string, Column> | undefined;
  views: Record<string, View> = {};
  private rows: Row[] | undefined;
  /** @internal Live row array for the workbook JSON serializer (TASK 80). */
  get _rowsValue(): Row[] | undefined { return this.rows; }
  /** Trial JSON member: table-level primary key name ('' when unset). */
  primaryKey?: string;
  private sourceRows: Row[] | undefined;
  private sourceItems = new Map<Row, Row>();
  private childParents = new Map<Row, Row>();
  private remoteSnapshot: { row: Row; values: Row; source?: Row; sourceValues?: Row }[] = [];
  private indexes = new Set<string>();
  private formulas = new Map<string, AstNode>();
  private expressionFormulas = new Map<string, AstNode>();
  private changes = new Map<Row, { type: 'insert' | 'update' | 'delete'; oldDataItem?: Row; index?: number }>();
  private sourceIndexes = new Map<Row, number>();
  private nextSourceIndex = 0;
  private tableName: string;
  private tableOptions: Options;
  get name(): string { return this.tableName; }
  set name(value: string) { this.tableName = value; }
  get options(): Options { return this.tableOptions; }
  set options(value: Options) { this.tableOptions = value; }
  constructor(name: string, options: Options, private manager?: DataManager) { this.tableName = name; this.tableOptions = options; }
  relatedTables(): Relationship[] { return this.manager?.relationships.filter(r => r.sourceTable === this || r.targetTable === this) ?? []; }
  fetch(reload?: boolean): Promise<Row[]> { return this.fetchInternal(reload, false); }
  private async fetchInternal(reload: boolean | undefined, fromRefresh: boolean): Promise<Row[]> {
    if (this.rows && !reload) return this.options.schema?.columns ? this.rows.map(row => ({ ...row })) : this.rows;
    let data = this.options.data;
    if (this.options.remote) {
      const read = this.options.remote.read;
      data = typeof read === 'function'
        ? await (read as (options: object) => Promise<unknown>)({
          method: 'GET', ...(fromRefresh ? { fromRefreshRemoteData: true } : {}), reload,
          requestType: undefined, requestData: undefined,
        })
        : await readRemote(read);
    }
    const schema = this.options.schema;
    this.formulas.clear();
    for (const [name, column] of Object.entries(schema?.columns ?? {})) {
      if (column.dataType === 'formula' && typeof column.value === 'string') {
        this.formulas.set(name, parseFormula(column.value));
      }
    }
    if (schema?.dataPath) {
      for (const part of schema.dataPath.split('.')) data = (data as Record<string, unknown> | null)?.[part];
    }
    if (!Array.isArray(data)) return notImplemented('GC.Data.Table.fetch non-array data');
    this.revision++;
    this.sourceRows = data as Row[];
    this.sourceItems.clear();
    this.childParents.clear();
    const hierarchy = schema?.hierarchy;
    const sourceParents = new Map<Row, Row>();
    const sources: Row[] = [];
    const visit = (items: Row[], parent?: Row): void => {
      for (const item of items) {
        sources.push(item);
        if (parent) sourceParents.set(item, parent);
        const children = hierarchy?.type === 'ChildrenPath' ? item[hierarchy.column] : undefined;
        if (Array.isArray(children)) visit(children as Row[], item);
      }
    };
    visit(data as Row[]);
    if (schema?.columns) {
      this.rows = sources.map(source => {
        const aliases = new Map(Object.entries(schema.columns!).map(([name, column]) => [String(column.dataName ?? name), name]));
        const row: Row = Object.fromEntries(Object.entries(source).map(([key, value]) => [aliases.get(key) ?? key, value]));
        for (const [name, column] of Object.entries(schema.columns!)) {
          if (column.dataType === 'formula') continue;
          const sourceName = String(column.dataName ?? name);
          const raw = source[sourceName];
          if (raw === undefined) continue;
          row[name] = convertSchemaValue(raw, column);
        }
        this.sourceItems.set(row, source);
        return row;
      });
    } else {
      this.rows = hierarchy?.type === 'ChildrenPath' ? sources : data as Row[];
      if (hierarchy?.type === 'ChildrenPath') for (const row of sources) this.sourceItems.set(row, row);
    }
    if (hierarchy?.type === 'ChildrenPath') {
      const bySource = new Map(this.rows.map(row => [this.sourceItems.get(row) ?? row, row]));
      for (const [child, parent] of sourceParents) {
        const childRow = bySource.get(child), parentRow = bySource.get(parent);
        if (childRow && parentRow) this.childParents.set(childRow, parentRow);
      }
    }
    this.remoteSnapshot = this.options.remote ? this.rows.map(row => {
      const source = this.sourceItems.get(row);
      return { row, values: { ...row }, source, sourceValues: source && { ...source } };
    }) : [];
    this.changes.clear();
    this.sourceIndexes = new Map(this.rows.map((row, index) => [row, index]));
    this.nextSourceIndex = this.rows.length;
    this.columns = {};
    const names = [...new Set([...this.rows.flatMap(row => Object.keys(row)), ...Object.keys(schema?.columns ?? {})])];
    const viewMetadata = [
      'type', 'caption', 'width', 'style', 'conditionalFormats', 'validator', 'isPrimaryKey', 'readonly', 'required',
      'defaultValue', 'headerStyle', 'visible', 'headerFit', 'dataType', 'dataMap', 'lookup', 'showNullAs', 'showEmptyAs',
    ];
    for (const name of names) {
      const definition = schema?.columns?.[name];
      const metadata = Object.fromEntries(viewMetadata.filter(key => definition?.[key] !== undefined).map(key => [key, definition![key]]));
      if (Array.isArray(definition?.lookup) && !definition.style) {
        metadata.style = { cellType: { type: 'combobox', items: definition.lookup } };
      }
      this.columns[name] = { name, value: name, ...(definition?.dataType === 'formula' ? { readonly: true } : {}), ...metadata };
    }
    return schema?.columns ? this.rows.map(row => ({ ...row })) : this.rows;
  }
  hierarchyParent(row: Row): Row | undefined { return this.childParents.get(row); }
  reparentHierarchyRow(row: Row, parent?: Row, before?: Row): void {
    const hierarchy = this.options.schema?.hierarchy;
    const source = this.sourceItems.get(row);
    if (hierarchy?.type !== 'ChildrenPath' || !source || !this.sourceRows) return;
    const oldParent = this.childParents.get(row);
    const oldSource = oldParent && this.sourceItems.get(oldParent);
    const oldChildren = oldSource?.[hierarchy.column];
    const oldContainer = Array.isArray(oldChildren) ? oldChildren as Row[] : this.sourceRows;
    const oldIndex = oldContainer.indexOf(source);
    if (oldIndex >= 0) oldContainer.splice(oldIndex, 1);
    const parentSource = parent && this.sourceItems.get(parent);
    if (parentSource && !Array.isArray(parentSource[hierarchy.column])) parentSource[hierarchy.column] = [];
    const container = parentSource ? parentSource[hierarchy.column] as Row[] : this.sourceRows;
    const beforeSource = before && this.sourceItems.get(before);
    const position = beforeSource ? container.indexOf(beforeSource) : -1;
    container.splice(position < 0 ? container.length : position, 0, source);
    if (parent) this.childParents.set(row, parent); else this.childParents.delete(row);
    this.revision++;
  }
  addView(name: string, columnInfos?: (string | Column)[], includeDefaultColumns = true, options?: ViewOptions): View {
    const view = new View(name, columnInfos, includeDefaultColumns, options, this);
    this.views[name] = view;
    return view;
  }
  removeView(name: string): void { delete this.views[name]; }
  createIndexes(fields: string[]): void { for (const field of fields) this.indexes.add(field); }
  dropIndexes(fields: string[]): void { for (const field of fields) this.indexes.delete(field); }
  clearIndexes(): void { this.indexes.clear(); }
  getIndexes(): string[] { return [...this.indexes]; }
  search(value: unknown, field: string): Row[] { return (this.rows ?? []).filter(row => row[field] != null && String(row[field]) === String(value)); }
  refreshRemoteData(): Promise<Row[]> { return this.fetchInternal(true, true); }
  rowCount(): number { return this.rows?.length ?? 0; }
  length(): number { return this.rowCount(); }
  get(index: number): Row | undefined { return this.rows?.[index]; }
  indexOf(row: Row): number { return this.rows?.indexOf(row) ?? -1; }
  resolveValue(row: Row, path: string, evaluating = new Set<string>()): unknown {
    if (path === '=[@]') return row;
    if (path.startsWith('=')) {
      let formula = this.expressionFormulas.get(path);
      if (!formula) { formula = parseFormula(path); this.expressionFormulas.set(path, formula); }
      return this.evaluateFormula(row, formula, evaluating);
    }
    const parts = fieldParts(path);
    const resolve = (table: Table, current: Row, offset: number): unknown => {
      const part = parts[offset]!;
      if (offset === parts.length - 1) {
        if (Array.isArray(current) && /^\d+$/.test(part)) return current[Number(part) - 1];
        const formula = table.formulas.get(part);
        if (!formula) return current[part];
        if (evaluating.has(part)) return notImplemented('GC.Data circular calculated column');
        evaluating.add(part);
        try { return table.evaluateFormula(current, formula, evaluating); }
        finally { evaluating.delete(part); }
      }
      const relation = table.relatedTables().find(r => (r.sourceTable === table ? r.sourceRelationshipName : r.targetRelationshipName) === part);
      if (!relation) {
        const nested = Array.isArray(current) && /^\d+$/.test(part) ? current[Number(part) - 1] : current[part];
        return nested != null && typeof nested === 'object' ? resolve(table, nested as Row, offset + 1) : undefined;
      }
      const forward = relation.sourceTable === table;
      const key = current[forward ? relation.sourceFieldName : relation.targetFieldName];
      const next = forward ? relation.targetTable : relation.sourceTable;
      const field = forward ? relation.targetFieldName : relation.sourceFieldName;
      const matches = key == null ? [] : (next.rows ?? []).filter(candidate => candidate[field] === key);
      if (!matches.length) return null;
      return forward || matches.length === 1 ? resolve(next, matches[0]!, offset + 1) : matches.map(match => resolve(next, match, offset + 1));
    };
    return resolve(this, row, 0);
  }
  evaluateFormula(row: Row, formula: AstNode, evaluating: Set<string>, scope?: Row[]): unknown {
    const host: EvalHost = {
      resolveStructured: (tableName: string, spec: string) => {
        if (tableName) return notImplemented('GC.Data calculated column reference');
        const relative = /^\[@([+-]\d+)([^\]]+)\]$/.exec(spec);
        const absolute = /^\[#(\d+|last)\[([^\]]+)\]\]$/i.exec(spec);
        const current = /^\[@((?:\[[^\]]*\]|[^\]\[:,])+)\]$/.exec(spec);
        const column = /^\[([^\]#@]+)\]$/.exec(spec);
        const selection = /^\[([^\[]+)\[([^\]]+)\]\]$/.exec(spec);
        const field = relative?.[2] ?? absolute?.[2] ?? current?.[1] ?? column?.[1] ?? selection?.[2];
        if (!field) return notImplemented('GC.Data calculated column reference');
        const valueAt = (index: number): Value => {
          const target = this.get(index);
          return (target ? this.resolveValue(target, field, evaluating) : undefined) as Value;
        };
        if (column) return new CalcArray(scope
          ? scope.map(item => [this.resolveValue(item, field, evaluating) as Value])
          : Array.from({ length: this.rowCount() }, (_, i) => [valueAt(i)]));
        if (selection && !absolute) {
          const selector = selection[1]!.toLowerCase();
          if (selector === '#odd' || selector === '#even') {
            const start = selector === '#odd' ? 1 : 0;
            return new CalcArray(Array.from({ length: Math.ceil((this.rowCount() - start) / 2) }, (_, i) => [valueAt(start + i * 2)]));
          }
          const position = (part: string): number | undefined => {
            if (part === '@') return this.indexOf(row);
            if (part === '#last') return this.rowCount() - 1;
            if (/^#\d+$/.test(part)) return Number(part.slice(1)) - 1;
            if (/^@[+-]\d+$/.test(part)) return this.indexOf(row) + Number(part.slice(1));
            return undefined;
          };
          const indices: number[] = [];
          for (const part of selector.split(',')) {
            const bounds = part.split(':');
            const from = position(bounds[0]!);
            const to = bounds.length === 1 ? from : position(bounds[1]!);
            if (bounds.length > 2 || from === undefined || to === undefined) {
              return notImplemented('GC.Data calculated column reference');
            }
            for (let i = Math.max(0, from); i <= Math.min(this.rowCount() - 1, to); i++) indices.push(i);
          }
          return new CalcArray(indices.map(index => [valueAt(index)]));
        }
        const index = relative ? this.indexOf(row) + Number(relative[1])
          : absolute ? (absolute[1]!.toLowerCase() === 'last' ? this.rowCount() - 1 : Number(absolute[1]) - 1)
            : this.indexOf(row);
        return valueAt(index);
      },
      getCustomFunction: () => undefined,
      getCellValue: () => notImplemented('GC.Data calculated column cell reference'),
      getSpillRange: () => undefined,
      resolveName: () => undefined,
      sheetFromName: () => undefined,
      hasFormula: () => false,
      getFormulaText: () => null,
      workbookIndex: () => 0,
      sheetCount: () => 0,
      isR1C1: () => false,
      allowDynamicArray: () => false,
    };
    const result = new Evaluator(host).evaluate(formula, {
      host, sheet: undefined as never /* standalone column formula: no owning sheet; the host callbacks above never read it */,
      row: 0, col: 0, arrayMode: false,
    });
    return result instanceof CalcArray ? result.array[0]?.[0] : result;
  }
  insertItem(index: number, item: Row): void {
    this.revision++;
    const row = { ...item };
    this.sourceIndexes.set(row, this.nextSourceIndex++);
    (this.rows ??= []).splice(index, 0, row);
    if (this.options.schema?.columns && this.sourceRows) {
      const source: Row = {};
      this.sourceItems.set(row, source);
      this.writeSource(row, row);
      this.sourceRows.splice(index, 0, source);
    }
    this.changes.set(row, { type: 'insert' });
  }
  private writeSource(row: Row, values: Row): void {
    const source = this.sourceItems.get(row);
    if (!source) return;
    for (const [key, value] of Object.entries(values)) {
      const column = this.options.schema?.columns?.[key];
      source[String(column?.dataName ?? key)] = value;
    }
  }
  updateItem(index: number, values: Row): void {
    this.revision++;
    const row = this.rows?.[index];
    if (!row) return;
    let change = this.changes.get(row);
    if (!change) { change = { type: 'update', oldDataItem: {} }; this.changes.set(row, change); }
    if (change.type === 'update') {
      for (const key of Object.keys(values)) if (!(key in change.oldDataItem!)) change.oldDataItem![key] = row[key];
    }
    Object.assign(row, values);
    this.writeSource(row, values);
  }
  removeItems(indexes: number[]): void {
    this.revision++;
    const removed: Row[] = [];
    for (const index of [...indexes].sort((a, b) => b - a)) {
      const row = this.rows?.splice(index, 1)[0];
      if (row) {
        if (this.changes.get(row)?.type !== 'insert') removed.unshift({ ...row });
        const source = this.sourceItems.get(row);
        if (source && this.sourceRows) {
          const parent = this.childParents.get(row);
          const parentSource = parent && this.sourceItems.get(parent);
          const children = parentSource && this.options.schema?.hierarchy
            ? parentSource[this.options.schema.hierarchy.column] : undefined;
          const container = Array.isArray(children) ? children as Row[] : this.sourceRows;
          const sourceIndex = container.indexOf(source);
          if (sourceIndex >= 0) container.splice(sourceIndex, 1);
          this.sourceItems.delete(row);
          this.childParents.delete(row);
        }
        if (this.options.remote && this.options.batch && this.changes.get(row)?.type !== 'insert') {
          this.changes.set(row, { type: 'delete', index: index - 1 });
        } else this.changes.delete(row);
      }
    }
    if (removed.length && this.options.autoSync && !this.options.batch && this.options.remote?.delete) {
      void sendRemote(this.options.remote.delete, removed, 'DELETE').catch(error => console.warn('GC.Data delete failed', error));
    }
  }
  getChanges(): { type: string; dataItem: Row; oldDataItem?: Row; index: number }[] {
    return [...this.changes].map(([row, change]) => {
      const dataItem = change.type !== 'update' ? { ...row } : Object.fromEntries(Object.keys(change.oldDataItem!).map(key => [key, row[key]]));
      const index = change.type === 'delete' ? change.index! : this.rows?.indexOf(row) ?? -1;
      return { type: change.type, dataItem, ...(change.oldDataItem ? { oldDataItem: { ...change.oldDataItem } } : {}), index };
    });
  }
  isInserted(index: number): boolean { const row = this.rows?.[index]; return !!row && this.changes.get(row)?.type === 'insert'; }
  isUpdated(index: number): boolean { const row = this.rows?.[index]; return !!row && this.changes.get(row)?.type === 'update'; }
  resetItem(index: number): void {
    this.revision++;
    const row = this.rows?.[index];
    const change = row && this.changes.get(row);
    if (row && change?.type === 'update') {
      Object.assign(row, change.oldDataItem);
      this.writeSource(row, change.oldDataItem!);
      this.changes.delete(row);
    }
  }
  saveItem(index: number): void {
    const row = this.rows?.[index];
    if (!row) return;
    if (!this.options.remote) { this.changes.delete(row); return; }
    const change = this.changes.get(row);
    if (!this.options.autoSync || this.options.batch || !change || change.type === 'delete') return;
    const request = this.options.remote[change.type === 'insert' ? 'create' : 'update'];
    if (!request) return;
    const saved = { ...row };
    void sendRemote(request, saved, 'POST').then(response => {
      if (response != null && this.changes.get(row) === change) {
        Object.assign(row, saved);
        if (typeof response === 'object') {
          for (const key of Object.keys(this.columns ?? {})) {
            if (Object.prototype.hasOwnProperty.call(response, key)) row[key] = (response as Row)[key];
          }
        }
        this.writeSource(row, row);
        this.revision++;
        this.changes.delete(row);
      }
    }).catch(error => console.warn('GC.Data save failed', error));
  }
  async cancelChanges(): Promise<void> {
    this.revision++;
    if (!this.options.remote || !this.options.batch) return;
    for (const entry of this.remoteSnapshot) {
      for (const key of Object.keys(entry.row)) delete entry.row[key];
      Object.assign(entry.row, entry.values);
      if (entry.source && entry.sourceValues) {
        for (const key of Object.keys(entry.source)) delete entry.source[key];
        Object.assign(entry.source, entry.sourceValues);
        this.sourceItems.set(entry.row, entry.source);
      }
    }
    this.rows = this.remoteSnapshot.map(entry => entry.row);
    if (this.options.schema?.columns && this.sourceRows) {
      this.sourceRows.splice(0, this.sourceRows.length, ...this.remoteSnapshot.map(entry => entry.source!));
    }
    this.changes.clear();
  }
  async submitChanges(): Promise<{ data: Row[]; cancel: boolean; eventName: string } | undefined> {
    if (!this.options.remote || !this.options.batch || !this.changes.size) return;
    const changes = [...this.changes].map(([row, change]) => ({
      type: change.type, dataItem: { ...row },
      ...(change.oldDataItem ? { oldDataItem: { ...row, ...change.oldDataItem } } : {}),
      sourceIndex: this.sourceIndexes.get(row),
    }));
    const response = await sendRemote(this.options.remote.batch, changes, 'POST');
    if (!Array.isArray(response) || response.length < changes.length || response.some(item => item == null)) return;
    for (const [row, change] of this.changes) {
      if (change.type !== 'delete') continue;
      const index = Math.min(this.sourceIndexes.get(row) ?? this.rows!.length, this.rows!.length);
      this.rows!.splice(index, 0, row);
      const source = this.remoteSnapshot.find(entry => entry.row === row)?.source;
      if (source && this.sourceRows) {
        this.sourceItems.set(row, source);
        this.sourceRows.splice(index, 0, source);
      }
      this.changes.delete(row);
    }
    this.revision++;
    return { data: changes.map(change => change.dataItem), cancel: false, eventName: 'ChangesSubmitted' };
  }
}

type SheetFilter = {
  field: string;
  hierarchy?: boolean;
  matches: (value: unknown, path: unknown[], leafPaths: unknown[][]) => boolean;
};

export class View {
  _tableName(): string | undefined { return this.table?.name; }
  autoFilter = false;
  autoSort = true;
  private columnInfos: Column[];
  private pinnedColumns = new Set<Column>();
  /** @internal Typed seams for the workbook JSON serializer (TASK 80); returns the live structures. */
  get _columnInfos(): Column[] { return this.columnInfos; }
  get _pinnedColumns(): Set<Column> { return this.pinnedColumns; }
  get _pinnedRows(): Set<Row> { return this.pinnedRows; }
  get _rows(): Row[] | undefined { return this.table?._rowsValue; }
  private explicitColumns: (string | Column)[] | undefined;
  private defaultColumns: boolean;
  private styleRules: Record<string, { style?: object; rule?: object }> = Object.fromEntries(
    Object.entries({ pin: 1024, primaryKey: 2048, readonly: 4, required: 4096 }).map(([name, state]) =>
      [name, { rule: { area: 1, direction: 2, state }, style: { decoration: { icons: [{ src: '' }] } } }])
  );
  private sorts: { field: string; ascending?: boolean; compare?: (a: unknown, b: unknown, ascending: boolean) => number }[] | undefined;
  private filters: Filter[] = [];
  private groups: GroupDescription[] = [];
  private pinnedRows = new Set<Row>();
  private sheetFilters: SheetFilter[] = [];
  private hierarchyFilterRows = new Set<Row>();
  private filteredHierarchyInsertions = new Set<Row>();
  private listeners = new Set<() => void>();
  onChanged(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  private cachedRows?: Row[];
  private summaryValues = new WeakMap<Row, Record<string, unknown>>();
  private summaryFormulas = new Map<string, AstNode>();
  private cachedRevision = -1;
  setSheetFilters(filters: SheetFilter[]): void {
    this.sheetFilters = filters; this.hierarchyFilterRows.clear(); this.filteredHierarchyInsertions.clear(); this.cachedRows = undefined;
  }
  constructor(public name: string, columns?: (string | Column)[], includeDefaultColumns = true, private options?: ViewOptions, private table?: Table) {
    this.defaultColumns = !columns || (columns.length === 0 && includeDefaultColumns !== false);
    this.explicitColumns = columns?.map(column => typeof column === 'string' ? column : { ...column });
    const defaults = Object.values(table?.columns ?? {});
    this.columnInfos = (columns?.length ? columns : this.defaultColumns ? defaults : []).map(column =>
      typeof column === 'string' ? { name: column, value: column, width: this.options?.defaultColumnWidth ?? 60 }
        : { ...column, ...(column.value?.startsWith('=') ? { name: column.name ?? column.value, readonly: true } : {}),
          width: column.width ?? this.options?.defaultColumnWidth ?? 60 });
  }
  async fetch(reload?: boolean): Promise<Row[][]> {
    if (!this.table) return notImplemented('GC.Data.View.fetch without table');
    const rows = await this.table.fetch(reload);
    if (this.defaultColumns) {
      this.columnInfos = Object.values(this.table.columns ?? {}).map(column => ({ ...column, width: column.width ?? this.options?.defaultColumnWidth ?? 60 }));
    } else if (this.explicitColumns) {
      this.columnInfos = this.columnInfos.map(column => {
        const original = this.explicitColumns?.find(item => (typeof item === 'string' ? item : item.value ?? item.name) === (column.value ?? column.name));
        const field = typeof original === 'string' ? original : original?.value ?? original?.name;
        const metadata = typeof field === 'string' ? this.table?.columns?.[field] : undefined;
        if (!metadata || !original) return column;
        const explicit = typeof original === 'string' ? {} : original;
        return { ...metadata, ...column, ...explicit, width: explicit.width ?? metadata.width ?? column.width };
      });
    }
    const results = [rows];
    const loaded = new Set<Table>([this.table]);
    const expressions = [
      ...this.columnInfos.map(column => String(column.value ?? column.name ?? '')),
      ...Object.values(this.table.options.schema?.columns ?? {}).map(column => String(column.value ?? '')),
    ];
    const paths = expressions.flatMap(expression => expression.startsWith('=')
      ? [...expression.matchAll(/\[@((?:\[[^\]]*\]|[^\]])+)\]|\[([^\]#@:,[]+)\]/g)]
        .map(match => match[1] ?? match[2]!) : [expression]);
    for (const expression of paths) {
      const path = fieldParts(expression);
      let current = this.table;
      for (const alias of path.slice(0, -1)) {
        const relation = current.relatedTables().find(r => (r.sourceTable === current ? r.sourceRelationshipName : r.targetRelationshipName) === alias);
        if (!relation) break;
        current = relation.sourceTable === current ? relation.targetTable : relation.sourceTable;
        if (!loaded.has(current)) { results.push(await current.fetch(reload)); loaded.add(current); }
      }
    }
    this.cachedRows = undefined;
    for (const listener of this.listeners) listener();
    return results;
  }
  getColumn(index?: number): Column | Column[] {
    const columns = this.pinnedColumns.size
      ? [...this.columnInfos.filter(column => this.pinnedColumns.has(column)),
        ...this.columnInfos.filter(column => !this.pinnedColumns.has(column))] : this.columnInfos;
    return index === undefined ? columns : columns[index]!;
  }
  togglePinnedColumns(indexes: number[]): number {
    const columns = this.getColumn() as Column[];
    for (const index of new Set(indexes)) {
      const column = columns[index];
      if (!column) continue;
      if (this.pinnedColumns.has(column)) this.pinnedColumns.delete(column); else this.pinnedColumns.add(column);
    }
    return this.pinnedColumns.size;
  }
  addColumn(column: string | Column): void {
    this.columnInfos.push(typeof column === 'string' ? { name: column, value: column } : { ...column });
  }
  removeColumn(column: string): void { this.columnInfos = this.columnInfos.filter(info => info.name !== column); }
  _moveColumn(from: number, to: number): void {
    const columns = this.getColumn() as Column[];
    const source = columns[from], target = columns[to];
    if (!source || !target || source === target) return;
    const sourceIndex = this.columnInfos.indexOf(source);
    this.columnInfos.splice(sourceIndex, 1);
    this.columnInfos.splice(this.columnInfos.indexOf(target), 0, source);
    for (const listener of this.listeners) listener();
  }
  addStyleRule(name: string, style?: object, rule?: object): void { this.styleRules[name] = { style, rule }; }
  getStyleRule(name?: string): object | undefined { return name === undefined ? this.styleRules : this.styleRules[name]; }
  removeStyleRule(name: string): void { delete this.styleRules[name]; }
  clearStyleRules(): void { this.styleRules = {}; }
  length(): number { return this.table?.rowCount() ?? 0; }
  visibleLength(): number { return this.orderedRows().length; }
  private hierarchyParents(rows: Row[]): Map<Row, Row> {
    const result = new Map<Row, Row>();
    const hierarchy = this.table?.options.schema?.hierarchy;
    if (!hierarchy || !this.table) return result;
    if (hierarchy.type === 'Level') {
      const stack: { row: Row; level: number }[] = [];
      for (const row of rows) {
        const level = Number(this.table.resolveValue(row, hierarchy.column));
        while (stack.length && stack[stack.length - 1]!.level >= level) stack.pop();
        if (stack.length) result.set(row, stack[stack.length - 1]!.row);
        stack.push({ row, level });
      }
    } else if (hierarchy.type === 'ChildrenPath') {
      for (const row of rows) {
        const parent = this.table.hierarchyParent(row);
        if (parent) result.set(row, parent);
      }
    } else if (hierarchy.type === 'Parent' || hierarchy.type === 'Custom') {
      const key = Object.entries(this.table.options.schema?.columns ?? {}).find(([, col]) => col.isPrimaryKey)?.[0];
      if (!key) return result;
      const byKey = new Map(rows.map(row => [this.table!.resolveValue(row, key), row]));
      rows.forEach((row, index) => {
        const parentKey = hierarchy.type === 'Custom' ? hierarchy.parse?.({ data: row, index })
          : this.table!.resolveValue(row, hierarchy.column);
        const parent = byKey.get(parentKey);
        if (parent && parent !== row) result.set(row, parent);
      });
    }
    return result;
  }
  hierarchyLevels(): number[] {
    const rows = this.orderedRows();
    const all = Array.from({ length: this.length() }, (_, index) => this.table!.get(index)!);
    const parents = this.hierarchyParents(all);
    const levels = new Map<Row, number>();
    return rows.map(row => {
      const path: Row[] = [];
      const visited = new Set<Row>();
      let current: Row | undefined = row;
      while (current && !visited.has(current) && !levels.has(current)) {
        visited.add(current);
        path.push(current);
        current = parents.get(current);
      }
      let level = current && levels.has(current) ? levels.get(current)! + 1 : 0;
      for (let index = path.length - 1; index >= 0; index--) levels.set(path[index]!, level++);
      return levels.get(row) ?? 0;
    });
  }
  hierarchyRow(index: number): object | undefined { return this.orderedRows()[index]; }
  hasHierarchy(): boolean { return !!this.table?.options.schema?.hierarchy; }
  hierarchyOutlineColumn(): string | undefined {
    const outline = this.table?.options.schema?.hierarchy?.outlineColumn;
    return typeof outline === 'string' ? outline : outline?.value;
  }
  private orderedRows(): Row[] {
    if (this.cachedRows && this.cachedRevision === this.table?.revision) return this.cachedRows;
    const rows = Array.from({ length: this.length() }, (_, i) => this.table!.get(i)!);
    const parents = this.hierarchyParents(rows);
    const path = (row: Row, field: string): unknown[] => {
      const values: unknown[] = [];
      const visited = new Set<Row>();
      let current: Row | undefined = row;
      while (current && !visited.has(current)) {
        visited.add(current);
        values.unshift(this.table!.resolveValue(current, field));
        current = parents.get(current);
      }
      return values;
    };
    const parentRows = new Set(parents.values());
    const leafPaths = new Map<string, unknown[][]>();
    for (const filter of this.sheetFilters) {
      if (filter.hierarchy) leafPaths.set(filter.field, rows.filter(row => !parentRows.has(row)).map(row => path(row, filter.field)));
    }
    let visible = rows.filter(row => this.filters.every(filter => matchesFilter(this.table!.resolveValue(row, filter.field), filter))
      && this.sheetFilters.every(filter => filter.matches(
        this.table!.resolveValue(row, filter.field), filter.hierarchy ? path(row, filter.field) : [], leafPaths.get(filter.field) ?? [],
      )));
    if (parents.size && this.sheetFilters.length && this.sheetFilters.every(filter => !filter.hierarchy)) {
      const matches = new Set(visible);
      const included = new Set(visible);
      for (const row of rows) {
        const visited = new Set<Row>();
        let ancestor = parents.get(row);
        while (ancestor && !visited.has(ancestor)) {
          visited.add(ancestor);
          if (matches.has(row)) included.add(ancestor);
          if (matches.has(ancestor)) included.add(row);
          ancestor = parents.get(ancestor);
        }
      }
      for (const row of this.hierarchyFilterRows) included.add(row);
      visible = rows.filter(row => included.has(row));
    }
    if (this.sorts) visible.sort((a, b) => {
      for (const sort of this.sorts!) {
        const left = this.table!.resolveValue(a, sort.field), right = this.table!.resolveValue(b, sort.field);
        if (sort.compare) {
          const comparison = sort.compare(left, right, sort.ascending !== false);
          if (comparison) return comparison;
        } else {
          const comparison = left === right ? 0 : left == null ? -1 : right == null ? 1 : left < right ? -1 : 1;
          if (comparison) return sort.ascending === false ? -comparison : comparison;
        }
      }
      return 0;
    });
    const orderField = Object.entries(this.table?.options.schema?.columns ?? {})
      .find(([, column]) => column.dataType === 'rowOrder')?.[0];
    if (parents.size && (this.sorts || orderField) && !this.groups.length) {
      const children = new Map<Row | undefined, Row[]>();
      const visibleSet = new Set(visible);
      for (const row of visible) {
        const parent = parents.get(row);
        const bucket = children.get(parent && visibleSet.has(parent) ? parent : undefined) ?? [];
        bucket.push(row);
        children.set(parent && visibleSet.has(parent) ? parent : undefined, bucket);
      }
      if (!this.sorts && orderField) {
        // Trial (.probe/api-sweep-item4d/f/g.json): a move that ties the previous sibling's
        // rowOrder puts the moved (later-updated) row first; rows without rowOrder values
        // (nested ChildrenPath children) take their sequence rank within the sibling group.
        const storageIndex = new Map<Row, number>();
        rows.forEach((row, index) => storageIndex.set(row, index));
        for (const bucket of children.values()) {
          const rank = new Map(bucket.map((row, index) => [row, index]));
          const effective = (row: Row): number => {
            const value = Number(row[orderField]);
            return Number.isNaN(value) ? rank.get(row) ?? 0 : value;
          };
          bucket.sort((a, b) => effective(a) - effective(b)
            || (storageIndex.get(b) ?? 0) - (storageIndex.get(a) ?? 0));
        }
      }
      const flattened: Row[] = [];
      const pending = [...(children.get(undefined) ?? [])].reverse();
      while (pending.length) {
        const child = pending.pop()!;
        flattened.push(child);
        const descendants = children.get(child) ?? [];
        for (let i = descendants.length - 1; i >= 0; i--) pending.push(descendants[i]!);
      }
      visible = flattened;
    }
    const ordered = groupRows(visible, this.groups, (row, field) => this.table!.resolveValue(row, field));
    // TASK 97 TS-1: pinned rows keep their natural position on hierarchy views
    // (the trial lists raw pinnedRows in JSON but never moves them, probe
    // .probe/hier-probe3.json case L / richJSONHierarchyImportsOurWorkbook).
    this.cachedRows = this.pinnedRows.size && !this.hasHierarchy()
      ? [...ordered.filter(row => this.pinnedRows.has(row)), ...ordered.filter(row => !this.pinnedRows.has(row))] : ordered;
    this.summaryValues = new WeakMap();
    this.cachedRevision = this.table?.revision ?? -1;
    return this.cachedRows;
  }
  hierarchyEdit(operation: string, index: number, item?: Row, withChildren = true): void {
    const table = this.table;
    const hierarchy = table?.options.schema?.hierarchy;
    if (!table || !hierarchy) return;
    if (this.sheetFilters.length && this.sheetFilters.every(filter => !filter.hierarchy)) {
      for (const row of this.orderedRows()) this.hierarchyFilterRows.add(row);
    }
    if (hierarchy.type === 'Custom' && (operation === 'addBefore' || operation === 'addAfter' || operation === 'addBelow')) {
      this.insertCustomHierarchyItem(operation, index, item);
      return;
    }
    if (hierarchy.type === 'Custom') {
      this.editCustomHierarchy(operation, index, item, withChildren);
      return;
    }
    if (hierarchy.type !== 'Parent' && hierarchy.type !== 'Level' && hierarchy.type !== 'ChildrenPath') {
      return notImplemented(`GC.Data hierarchy editing ${hierarchy.type}`);
    }
    const key = Object.entries(table.options.schema?.columns ?? {}).find(([, column]) => column.isPrimaryKey)?.[0];
    const order = Object.entries(table.options.schema?.columns ?? {}).find(([, column]) => column.dataType === 'rowOrder')?.[0];
    if ((!key && hierarchy.type === 'Parent') || !order) return;
    const rows = this.orderedRows();
    const selected = rows[index];
    if (!selected) return;
    const all = Array.from({ length: table.rowCount() }, (_, i) => table.get(i)!);
    const parents = this.hierarchyParents(all);
    const parent = parents.get(selected);
    const siblings = rows.filter(row => parents.get(row) === parent);
    const siblingIndex = siblings.indexOf(selected);
    const update = (row: Row, values: Row): void => table.updateItem(table.indexOf(row), values);
    const between = (before: Row | undefined, after: Row | undefined): number => {
      // Trial (item4g): rows without a rowOrder value (nested ChildrenPath children) use
      // their sequence rank in the display sibling group as effective order anchor.
      const anchor = (row: Row | undefined): number => {
        if (!row) return NaN;
        const raw = Number(row[order]);
        if (!Number.isNaN(raw)) return raw;
        const rank = siblings.indexOf(row);
        return rank >= 0 ? rank : NaN;
      };
      const a = anchor(before);
      const b = anchor(after);
      return Number.isNaN(a) ? (Number.isNaN(b) ? 0 : b - 1) : Number.isNaN(b) ? a + 1 : (a + b) / 2;
    };
    if (operation.startsWith('add') && item) {
      const after = operation === 'addAfter' || operation === 'addBelow';
      const children = all.filter(row => parents.get(row) === selected)
        .sort((a, b) => Number(a[order]) - Number(b[order]));
      const sourceSiblings = this.sorts?.length || this.sheetFilters.length
        ? all.filter(row => parents.get(row) === parent).sort((a, b) => Number(a[order]) - Number(b[order]))
        : siblings;
      const sourceIndex = sourceSiblings.indexOf(selected);
      const newParent = operation === 'addBelow' ? selected : parent;
      const before = operation === 'addBelow' ? children.at(-1) ?? selected
        : after ? selected : sourceSiblings[sourceIndex - 1] ?? parent;
      let end = index + 1;
      while (end < rows.length) {
        let ancestor = parents.get(rows[end]!);
        while (ancestor && ancestor !== selected) ancestor = parents.get(ancestor);
        if (!ancestor) break;
        end++;
      }
      const next = operation === 'addBelow'
        ? all.filter(row => Number(row[order]) > Number((children.at(-1) ?? selected)[order]))
          .sort((a, b) => Number(a[order]) - Number(b[order]))[0]
        : after ? sourceSiblings[sourceIndex + 1] : selected;
      // Trial key order: hierarchy column, then the rowOrder column (probe
      // .probe/tablesheet-comparison-chunkA/C.json: inserted rows serialize
      // `{...item, parentId|level, order}`).
      const values = { ...item, ...(hierarchy.type === 'Level'
        ? { [hierarchy.column]: Number(selected[hierarchy.column]) + (operation === 'addBelow' ? 1 : 0) }
        : hierarchy.type === 'Parent' ? { [hierarchy.column]: newParent?.[key!] ?? null } : {}),
        [order]: between(before, next) };
      let position = table.indexOf(selected);
      if (after) {
        position++;
        while (position < all.length) {
          let ancestor = parents.get(all[position]!);
          while (ancestor && ancestor !== selected) ancestor = parents.get(ancestor);
          if (!ancestor) break;
          position++;
        }
        if ((this.sorts?.length || this.sheetFilters.length) && siblings[siblingIndex + 1]) {
          position = table.indexOf(siblings[siblingIndex + 1]!);
        }
      }
      table.insertItem(position, values);
      const inserted = table.get(position)!;
      if (hierarchy.type === 'Parent' && this.sheetFilters.length && this.sheetFilters.every(filter => !filter.hierarchy)) {
        this.filteredHierarchyInsertions.add(inserted);
      }
      if (hierarchy.type === 'ChildrenPath') {
        table.reparentHierarchyRow(inserted, newParent, operation === 'addBefore' || operation === 'addAbove' ? selected : next);
      }
      if (operation === 'addAbove') {
        if (hierarchy.type === 'Level') {
          for (const row of rows.slice(index, end)) update(row, { [hierarchy.column]: Number(row[hierarchy.column]) + 1 });
        } else if (hierarchy.type === 'ChildrenPath') table.reparentHierarchyRow(selected, inserted);
        else update(selected, { [hierarchy.column]: values[key!] });
      }
    } else if (operation === 'promote' && parent) {
      if (hierarchy.type === 'Level') {
        const level = Number(selected[hierarchy.column]);
        for (const row of rows.slice(index)) {
          if (row !== selected && Number(row[hierarchy.column]) <= level) break;
          update(row, { [hierarchy.column]: Number(row[hierarchy.column]) - 1 });
        }
      } else if (hierarchy.type === 'ChildrenPath') {
        const grandparent = parents.get(parent);
        const parentSiblings = rows.filter(row => parents.get(row) === grandparent);
        table.reparentHierarchyRow(selected, grandparent, parentSiblings[parentSiblings.indexOf(parent) + 1]);
        // Trial (.probe/api-sweep-item4g.json childrenPathOutline:promote(1)): a promoted row
        // without a rowOrder value gets the midpoint between its old parent and the next
        // row of the grandparent group in the display.
        if (Number.isNaN(Number(selected[order])))
          update(selected, { [order]: between(parent, parentSiblings[parentSiblings.indexOf(parent) + 1]) });
        for (const sibling of siblings.slice(siblingIndex + 1)) table.reparentHierarchyRow(sibling, selected);
      } else {
        for (const sibling of siblings.slice(siblingIndex + 1)) update(sibling, { [hierarchy.column]: selected[key!] });
        update(selected, { [hierarchy.column]: parents.get(parent)?.[key!] ?? null });
      }
    } else if (operation === 'demote' && (siblingIndex > 0 || this.sorts?.length)) {
      // A sorted view selects the row, but the trial chooses its new parent
      // from the underlying row-order sequence rather than the displayed sort.
      const previous = this.sorts?.length
        ? all.filter(row => parents.get(row) === parent && Number(row[order]) < Number(selected[order]))
          .sort((a, b) => Number(b[order]) - Number(a[order]))[0]
        : siblings[siblingIndex - 1];
      if (!previous) return;
      if (hierarchy.type === 'Level') {
        const level = Number(selected[hierarchy.column]);
        for (const row of rows.slice(index)) {
          if (row !== selected && (Number(row[hierarchy.column]) <= level || !withChildren)) break;
          update(row, { [hierarchy.column]: Number(row[hierarchy.column]) + 1 });
        }
      } else if (hierarchy.type === 'ChildrenPath') {
        if (!withChildren) for (const child of rows.filter(row => parents.get(row) === selected)) {
          table.reparentHierarchyRow(child, parent);
        }
        table.reparentHierarchyRow(selected, previous);
      } else {
        if (!withChildren) for (const child of rows.filter(row => parents.get(row) === selected)) {
          update(child, { [hierarchy.column]: parent?.[key!] ?? null });
        }
        update(selected, { [hierarchy.column]: previous[key!] });
      }
    } else if (operation === 'up' && siblingIndex > 0) {
      const previous = siblings[siblingIndex - 1]!;
      const nextOrder = this.sorts?.length
        ? all.filter(row => parents.get(row) === parent && Number(row[order]) > Number(previous[order]))
          .sort((a, b) => Number(a[order]) - Number(b[order]))[0]
        : undefined;
      // Trial (.probe/api-sweep-item4d/f.json parent:moveUp(4)): a root group without a
      // predecessor row anchors at the previous sibling's own order value.
      update(selected, { [order]: this.sorts?.length
        ? between(previous, nextOrder) : between(siblings[siblingIndex - 2] ?? parent ?? previous, previous) });
    } else if (operation === 'down' && siblingIndex >= 0 && siblingIndex + 1 < siblings.length) {
      // Trial (parent/level:moveDown(1)): the upper anchor is the DISPLAY row after the
      // next sibling (a subtree child counts: '1.2'->child '1.2.1' anchors 2.5, '4'->'5' 3.5).
      const nextSibling = siblings[siblingIndex + 1]!;
      update(selected, { [order]: between(nextSibling, rows[rows.indexOf(nextSibling) + 1]) });
    }
    // Sorted hierarchy edits retain the display order until the next refresh.
    // Moves reposition the selected subtree within that existing order.
    if (this.sorts?.length && ((operation === 'up' && siblingIndex > 0)
      || (operation === 'down' && siblingIndex >= 0 && siblingIndex + 1 < siblings.length))) {
      const isDescendant = (row: Row, ancestor: Row): boolean => {
        const visited = new Set<Row>();
        let current = parents.get(row);
        while (current && !visited.has(current)) {
          if (current === ancestor) return true;
          visited.add(current);
          current = parents.get(current);
        }
        return false;
      };
      const subtreeEnd = (start: number): number => {
        let end = start + 1;
        while (end < rows.length && isDescendant(rows[end]!, rows[start]!)) end++;
        return end;
      };
      const end = subtreeEnd(index);
      const moved = rows.splice(index, end - index);
      const target = siblings[siblingIndex + (operation === 'up' ? -1 : 1)]!;
      const targetIndex = rows.indexOf(target);
      rows.splice(operation === 'up' ? targetIndex : subtreeEnd(targetIndex), 0, ...moved);
    }
    this.cachedRows = this.sorts?.length && ['demote', 'up', 'down'].includes(operation) ? rows : undefined;
    if (this.cachedRows) this.cachedRevision = table.revision;
  }
  private editCustomHierarchy(operation: string, index: number, item?: Row, withChildren = true): void {
    const table = this.table;
    const hierarchy = table?.options.schema?.hierarchy;
    const order = Object.entries(table?.options.schema?.columns ?? {}).find(([, col]) => col.dataType === 'rowOrder')?.[0];
    const rows = this.orderedRows();
    const selected = rows[index];
    if (!table || !hierarchy || !order || !selected) return;
    const unparse = hierarchy.unparse;
    if (!unparse) return;
    const all = Array.from({ length: table.rowCount() }, (_, i) => table.get(i)!);
    const parents = this.hierarchyParents(all);
    const children = new Map<Row | undefined, Row[]>();
    for (const row of all) {
      const parent = parents.get(row);
      const siblings = children.get(parent) ?? [];
      siblings.push(row);
      children.set(parent, siblings);
    }
    for (const siblings of children.values()) siblings.sort((a, b) => Number(a[order]) - Number(b[order]));
    const parent = parents.get(selected);
    const siblings = children.get(parent)!;
    const position = siblings.indexOf(selected);
    // Trial: move edits take their neighbors from the DISPLAY sibling sequence and retain
    // the display order afterwards (same rule as the Parent path of hierarchyEdit); ids
    // are re-normalized from the natural (rowOrder) sequence by unparse.
    const displaySiblings = rows.filter(row => parents.get(row) === parent);
    const displayIndex = displaySiblings.indexOf(selected);
    const between = (before?: Row, after?: Row): number => {
      // Trial item4g virtual rank fallback (see hierarchyEdit.between).
      const anchor = (row: Row | undefined): number => {
        if (!row) return NaN;
        const raw = Number(row[order]);
        if (!Number.isNaN(raw)) return raw;
        const rank = displaySiblings.indexOf(row);
        return rank >= 0 ? rank : NaN;
      };
      const a = anchor(before);
      const b = anchor(after);
      return Number.isNaN(a) ? (Number.isNaN(b) ? 0 : b - 1) : Number.isNaN(b) ? a + 1 : (a + b) / 2;
    };
    if (operation === 'addAbove' && item) {
      table.insertItem(table.indexOf(selected), { ...item, [order]: between(siblings[position - 1] ?? parent, selected) });
      const inserted = table.get(table.indexOf(selected) - 1)!;
      siblings[position] = inserted;
      children.set(inserted, [selected]);
    } else if (operation === 'promote' && parent) {
      siblings.splice(position, 1);
      const following = siblings.splice(position);
      children.set(selected, [...(children.get(selected) ?? []), ...following]);
      const upper = children.get(parents.get(parent))!;
      upper.splice(upper.indexOf(parent) + 1, 0, selected);
    } else if (operation === 'demote' && position > 0) {
      const previous = siblings[position - 1]!;
      siblings.splice(position, 1);
      if (!withChildren) siblings.splice(position, 0, ...(children.get(selected) ?? []));
      if (!withChildren) children.set(selected, []);
      children.set(previous, [...(children.get(previous) ?? []), selected]);
    } else if (operation === 'up' && displayIndex > 0) {
      const previous = displaySiblings[displayIndex - 1]!;
      const nextOrder = this.sorts?.length
        ? all.filter(row => parents.get(row) === parent && Number(row[order]) > Number(previous[order]))
          .sort((a, b) => Number(a[order]) - Number(b[order]))[0]
        : undefined;
      table.updateItem(table.indexOf(selected), { [order]: this.sorts?.length
        ? between(previous, nextOrder) : between(displaySiblings[displayIndex - 2] ?? parent ?? previous, previous) });
    } else if (operation === 'down' && displayIndex >= 0 && displayIndex + 1 < displaySiblings.length) {
      const nextSibling = displaySiblings[displayIndex + 1]!;
      table.updateItem(table.indexOf(selected), { [order]: between(nextSibling, rows[rows.indexOf(nextSibling) + 1]) });
    } else return;
    for (const siblingList of children.values()) siblingList.sort((x, y) => Number(x[order]) - Number(y[order]));
    const visit = (parentRow?: Row): void => {
      for (const [siblingIndex, row] of (children.get(parentRow) ?? []).entries()) {
        const id = unparse({ data: row, index: siblingIndex, parentData: parentRow });
        if (row[hierarchy.column] !== id) table.updateItem(table.indexOf(row), { [hierarchy.column]: id });
        visit(row);
      }
    };
    visit();
    // Sorted moves retain the display and reposition the selected subtree inside it
    // (mirrors the Parent path); sorted demotes just keep the display as it was.
    if (this.sorts?.length && ((operation === 'up' && displayIndex > 0)
      || (operation === 'down' && displayIndex >= 0 && displayIndex + 1 < displaySiblings.length))) {
      const isDescendant = (row: Row, ancestor: Row): boolean => {
        const visited = new Set<Row>();
        let current = parents.get(row);
        while (current && !visited.has(current)) {
          if (current === ancestor) return true;
          visited.add(current);
          current = parents.get(current);
        }
        return false;
      };
      const subtreeEnd = (start: number): number => {
        let end = start + 1;
        while (end < rows.length && isDescendant(rows[end]!, rows[start]!)) end++;
        return end;
      };
      const end = subtreeEnd(index);
      const moved = rows.splice(index, end - index);
      const target = displaySiblings[displayIndex + (operation === 'up' ? -1 : 1)]!;
      const targetIndex = rows.indexOf(target);
      rows.splice(operation === 'up' ? targetIndex : subtreeEnd(targetIndex), 0, ...moved);
    }
    this.cachedRows = this.sorts?.length && ['demote', 'up', 'down'].includes(operation) ? rows : undefined;
    if (this.cachedRows) this.cachedRevision = table.revision;
  }
  private insertCustomHierarchyItem(operation: string, index: number, item?: Row): void {
    const table = this.table;
    const hierarchy = table?.options.schema?.hierarchy;
    const unparse = hierarchy?.unparse;
    const order = Object.entries(table?.options.schema?.columns ?? {}).find(([, column]) => column.dataType === 'rowOrder')?.[0];
    if (!table || !hierarchy || !order || !item) return;
    if (!unparse) return;
    const rows = this.orderedRows();
    const selected = rows[index];
    if (!selected) return;
    const all = Array.from({ length: table.rowCount() }, (_, i) => table.get(i)!);
    const parents = this.hierarchyParents(all);
    const parent = operation === 'addBelow' ? selected : parents.get(selected);
    // Trial (TASK 49 item 4, .probe/tablesheet-comparison-chunkD.json): the rowOrder
    // neighbors come from the natural sibling list; the storage slot follows the display
    // next sibling in a filtered/sorted view (same rule as the Parent path); unparse
    // re-normalizes ids from the natural order across hidden siblings too.
    const natural = (row?: Row): Row[] => all
      .filter(candidate => parents.get(candidate) === row)
      .sort((a, b) => Number(a[order]) - Number(b[order]));
    const siblingGroup = natural(parent);
    const childGroup = natural(selected);
    const sourceIndex = siblingGroup.indexOf(selected);
    const after = operation === 'addAfter' || operation === 'addBelow';
    const before = operation === 'addBelow' ? childGroup.at(-1) ?? selected
      : after ? selected : siblingGroup[sourceIndex - 1] ?? parent;
    // Trial (.probe/api-sweep-item4b.json nestedCustom:addHierarchyItemAfter): the successor
    // for the rowOrder allocation is the natural-order row after the anchor across ALL rows
    // (a child counts - '1.2' at 2 gets 2.5 between it and its child '1.2.1' at 3).
    const nextThreshold = Number((operation === 'addBelow' ? childGroup.at(-1) ?? selected : selected)[order]);
    const next = after
      ? all.filter(candidate => Number(candidate[order]) > nextThreshold)
        .sort((a, b) => Number(a[order]) - Number(b[order]))[0]
      : selected;
    const a = before ? Number(before[order]) : undefined;
    const b = next ? Number(next[order]) : undefined;
    const value = a === undefined ? (b ?? 1) - 1 : b === undefined ? a + 1 : (a + b) / 2;
    const siblingIndex = operation === 'addBelow' ? childGroup.length
      : operation === 'addBefore' ? sourceIndex : sourceIndex + 1;
    const id = unparse({ data: undefined, index: siblingIndex, parentData: parent });
    let position = table.indexOf(selected);
    if (after) {
      position++;
      while (position < all.length) {
        let ancestor = parents.get(all[position]!);
        while (ancestor && ancestor !== selected) ancestor = parents.get(ancestor);
        if (!ancestor) break;
        position++;
      }
      const displaySiblings = rows.filter(row => parents.get(row) === parents.get(selected));
      const displayNext = displaySiblings[displaySiblings.indexOf(selected) + 1];
      if ((this.sorts?.length || this.sheetFilters.length) && displayNext) position = table.indexOf(displayNext);
    }
    table.insertItem(position, { ...item, [hierarchy.column]: id, [order]: value });
    const inserted = table.get(position)!;
    parents.set(inserted, parent!);
    if (this.sheetFilters.length && this.sheetFilters.every(filter => !filter.hierarchy)) {
      this.filteredHierarchyInsertions.add(inserted);
    }
    const children = new Map<Row | undefined, Row[]>();
    for (const row of Array.from({ length: table.rowCount() }, (_, i) => table.get(i)!)) {
      const siblings = children.get(parents.get(row));
      if (siblings) siblings.push(row); else children.set(parents.get(row), [row]);
    }
    for (const siblings of children.values()) siblings.sort((x, y) => Number(x[order]) - Number(y[order]));
    const visit = (parentRow?: Row): void => {
      for (const [siblingIndex, row] of (children.get(parentRow) ?? []).entries()) {
        const nextId = unparse({ data: row, index: siblingIndex, parentData: parentRow });
        if (row[hierarchy.column] !== nextId) table.updateItem(table.indexOf(row), { [hierarchy.column]: nextId });
        visit(row);
      }
    };
    visit();
    this.cachedRows = undefined;
  }
  groupBy(groups: GroupDescription[]): void {
    this.cachedRows = undefined;
    this.groups = groups.map(group => ({ ...group }));
  }
  removeGroupBy(): void { this.groups = []; this.cachedRows = undefined; }
  togglePinnedRows(indexes: number[]): number | undefined {
    // TASK 97 TS-1: on hierarchy views the trial's pinned-rows feature is inert —
    // togglePinnedRows changes nothing and returns undefined, while flat views
    // return the pinned-row count (probe .probe/hier-probe2.json cases F/G).
    if (this.hasHierarchy()) return undefined;
    const rows = this.orderedRows();
    for (const index of new Set(indexes)) {
      const row = rows[index];
      if (!row) continue;
      if (this.pinnedRows.has(row)) this.pinnedRows.delete(row); else this.pinnedRows.add(row);
    }
    this.cachedRows = undefined;
    return this.orderedRows().filter(row => this.pinnedRows.has(row)).length;
  }
  filter(filters?: Filter | Filter[]): number {
    this.cachedRows = undefined;
    const next = filters ? (Array.isArray(filters) ? filters : [filters]) : [];
    if (!next.length) this.filters = [];
    else this.filters.push(...next.map(filter => ({ ...filter })));
    return this.visibleLength();
  }
  getRowData(index: number): Row {
    const row = this.orderedRows()[index];
    if (!row || !this.table || this.filteredHierarchyInsertions.has(row)) return {};
    const result: Row = {};
    this.groups.forEach((group, index) => {
      result[`${group.field}__${index}`] = this.table!.resolveValue(row, group.field);
      const summaries = (group.summaryFields ?? []) as { formula: string }[];
      if (!summaries.length) return;
      const existing = this.summaryValues.get(row);
      if (existing && summaries.every((summary, i) => `${summary.formula}__${i}__${group.field}__${index}` in existing)) {
        Object.assign(result, existing);
        return;
      }
      const matching = this.orderedRows().filter(candidate => this.groups.slice(0, index + 1).every(item =>
        Object.is(this.table!.resolveValue(candidate, item.field), this.table!.resolveValue(row, item.field))));
      summaries.forEach((summary, summaryIndex) => {
        if (typeof summary.formula !== 'string') return;
        let formula = this.summaryFormulas.get(summary.formula);
        if (!formula) {
          formula = parseFormula(summary.formula);
          this.summaryFormulas.set(summary.formula, formula);
        }
        const value = this.table!.evaluateFormula(row, formula, new Set(), matching);
        const key = `${summary.formula}__${summaryIndex}__${group.field}__${index}`;
        result[key] = value;
        for (const candidate of matching) {
          const cached = this.summaryValues.get(candidate) ?? {};
          cached[key] = value;
          this.summaryValues.set(candidate, cached);
        }
      });
    });
    for (const column of this.columnInfos) {
      const field = column.value ?? column.name;
      if (typeof field !== 'string') continue;
      const value = this.table.resolveValue(row, field);
      if (value !== undefined) result[field] = value;
    }
    return result;
  }
  sort(sorts?: { field: string; ascending?: boolean; compare?: (a: unknown, b: unknown, ascending: boolean) => number }[]):
    { field: string; ascending?: boolean; compare?: (a: unknown, b: unknown, ascending: boolean) => number }[] | undefined {
    if (sorts !== undefined) { this.sorts = sorts.map(sort => ({ ...sort })); this.cachedRows = undefined; }
    return this.sorts;
  }
  insertItem(index: number, item: Row): void { this.table?.insertItem(index, item); }
  private tableIndex(index: number): number {
    const row = this.orderedRows()[index];
    return row ? this.table?.indexOf(row) ?? -1 : -1;
  }
  updateItem(index: number, item: Row): void { this.table?.updateItem(this.tableIndex(index), item); }
  removeItem(index: number): void {
    const rows = this.orderedRows();
    const selected = rows[index];
    if (!selected || !this.table) return;
    const allRows = Array.from({ length: this.length() }, (_, i) => this.table!.get(i)!);
    const parents = this.hierarchyParents(allRows);
    const children = new Map<Row, Row[]>();
    for (const [child, parent] of parents) {
      const siblings = children.get(parent) ?? [];
      siblings.push(child);
      children.set(parent, siblings);
    }
    const removed = new Set<Row>();
    const pending = [selected];
    while (pending.length) {
      const row = pending.pop()!;
      if (removed.has(row)) continue;
      removed.add(row);
      pending.push(...(children.get(row) ?? []));
    }
    this.table.removeItems(allRows.flatMap((row, i) => removed.has(row) ? [i] : []));
  }
  getChanges(): ReturnType<Table['getChanges']> {
    const rows = this.orderedRows();
    return (this.table?.getChanges() ?? [])
      .map(change => change.type === 'delete' ? change : ({ ...change, index: rows.indexOf(this.table!.get(change.index)!) }))
      .sort((a, b) => a.index - b.index);
  }
  isInserted(index: number): boolean { return this.table?.isInserted(this.tableIndex(index)) ?? false; }
  isUpdated(index: number): boolean { return this.table?.isUpdated(this.tableIndex(index)) ?? false; }
  resetItem(index: number): void { this.table?.resetItem(this.tableIndex(index)); }
  saveItem(index: number): void { this.table?.saveItem(this.tableIndex(index)); }
  async cancelChanges(): Promise<void> { await this.table?.cancelChanges(); }
  async submitChanges(): ReturnType<Table['submitChanges']> { return this.table?.submitChanges(); }
}
