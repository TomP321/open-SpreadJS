import * as React from 'react';
import GC from '@opensheets/spread-sheets';
import type { SpreadSheetsProp, WorksheetProp, ColumnProp } from './props.js';
export type { SpreadSheetsProp, WorksheetProp, ColumnProp, IEventTypeObj } from './props.js';

type RecordValue = Record<string, unknown>;
type Runtime = RecordValue & Record<string, (...args: never[]) => unknown>;
function unsupported(path: string): never { throw new Error(`NotImplemented: ${path}`); }
function markerChildren<P>(children: React.ReactNode, marker: unknown, path: string): React.ReactElement<P>[] {
  const result: React.ReactElement<P>[] = [];
  React.Children.forEach(children, child => {
    if (!React.isValidElement(child)) return;
    if (child.type === React.Fragment) result.push(...markerChildren<P>((child.props as { children?: React.ReactNode }).children, marker, path));
    else if (child.type === marker) result.push(child as React.ReactElement<P>);
    else unsupported(path);
  });
  return result;
}
const hostProps = new Set(['children', 'hostStyle', 'hostClass', 'className', 'workbookInitialized']);
const eventNames = new Map(Object.keys(GC.Spread.Sheets.Events).map(name => [name[0].toLowerCase() + name.slice(1), name]));
eventNames.set('editEnd', 'EditEnded'); eventNames.set('userZooming', 'ViewZooming');
function invoke(target: unknown, name: string, ...args: unknown[]): void {
  const method = (target as RecordValue)[name];
  if (typeof method !== 'function') unsupported(name);
  (method as (...args: unknown[]) => unknown).apply(target, args);
}

export class SpreadSheets extends React.Component<SpreadSheetsProp> {
  private readonly host = React.createRef<HTMLDivElement>();
  private workbook?: GC.Spread.Sheets.Workbook;
  private bindings = new Map<string, (...args: never[]) => unknown>();
  private optionDefaults: RecordValue = {};
  private sheetDefaults = new WeakMap<GC.Spread.Sheets.Worksheet, RecordValue>();

  componentDidMount(): void {
    const sheets = markerChildren<WorksheetProp>(this.props.children, Worksheet, 'SpreadSheets.children');
    const workbook = new GC.Spread.Sheets.Workbook(this.host.current!, { sheetCount: sheets.length || 1 });
    this.workbook = workbook;
    this.optionDefaults = { ...workbook.options };
    try {
      this.applyWorkbook({});
      sheets.forEach((child, index) => this.applyWorksheet(workbook.getSheet(index), child.props, {}));
      this.props.workbookInitialized?.(workbook);
    } catch (error) { workbook.destroy(); this.workbook = undefined; throw error; }
  }
  private applyWorkbook(previous: SpreadSheetsProp): void {
    const wb = this.workbook!;
    for (const key of new Set([...Object.keys(previous), ...Object.keys(this.props)])) {
      if (hostProps.has(key)) continue;
      const value = (this.props as RecordValue)[key], old = (previous as RecordValue)[key];
      if (Object.is(value, old)) continue;
      const event = eventNames.get(key);
      if (event) {
        const binding = this.bindings.get(key);
        if (binding) wb.unbind(`${event}.react-${key}`, binding);
        this.bindings.delete(key);
        if (typeof value === 'function') {
          const handler = value as (...args: never[]) => unknown;
          wb.bind(`${event}.react-${key}`, handler); this.bindings.set(key, handler);
        }
      } else if (key === 'name') (wb as unknown as RecordValue).name = value ?? '';
      else if (key in wb.options) (wb.options as unknown as RecordValue)[key] = value ?? this.optionDefaults[key];
      else unsupported(`SpreadSheets.${key}`);
    }
    wb.refresh();
  }
  private applyWorksheet(sheet: GC.Spread.Sheets.Worksheet, props: WorksheetProp, previous: WorksheetProp): void {
    const methods: Record<string, string> = {
      name: 'name', rowCount: 'setRowCount', colCount: 'setColumnCount', zoom: 'zoom', selectionPolicy: 'selectionPolicy', selectionUnit: 'selectionUnit',
      frozenColumnCount: 'frozenColumnCount', frozenRowCount: 'frozenRowCount', frozenTrailingColumnCount: 'frozenTrailingColumnCount', frozenTrailingRowCount: 'frozenTrailingRowCount',
      showRowOutline: 'showRowOutline', showColumnOutline: 'showColumnOutline', defaultStyle: 'setDefaultStyle', currentTheme: 'currentTheme',
    };
    const aliases: Record<string, string> = { columnHeaderVisible: 'colHeaderVisible', columnHeaderAutoText: 'colHeaderAutoText', columnHeaderAutoTextIndex: 'colHeaderAutoTextIndex' };
    let defaults = this.sheetDefaults.get(sheet);
    if (!defaults) {
      defaults = { ...sheet.options, rowCount: sheet.getRowCount(), colCount: sheet.getColumnCount(), zoom: 1, frozenColumnCount: 0, frozenRowCount: 0, frozenTrailingColumnCount: 0, frozenTrailingRowCount: 0, selectionPolicy: 2, selectionUnit: 0, showRowOutline: true, showColumnOutline: true, autoGenerateColumns: true, defaultStyle: sheet.getDefaultStyle() };
      this.sheetDefaults.set(sheet, defaults);
    }
    sheet.suspendPaint();
    try {
      for (const key of new Set([...Object.keys(previous), ...Object.keys(props)])) {
        if (key === 'children' || key === 'dataSource') continue;
        const next = (props as RecordValue)[key], old = (previous as RecordValue)[key];
        if (Object.is(next, old)) continue;
        const value = next ?? defaults[aliases[key] ?? key];
        if (key === 'autoGenerateColumns') sheet.autoGenerateColumns = value as boolean;
        else if (methods[key]) invoke(sheet, methods[key], value);
        else if ((aliases[key] ?? key) in sheet.options || key === 'selectionBackColor' || key === 'selectionBorderColor' || key === 'sheetTabColor') (sheet.options as unknown as RecordValue)[aliases[key] ?? key] = value;
        else unsupported(`Worksheet.${key}`);
      }
      const columns = markerChildren<ColumnProp>(props.children, Column, 'Worksheet.children');
      const oldColumns = markerChildren<ColumnProp>(previous.children, Column, 'Worksheet.children');
      columns.forEach((column, index) => this.applyColumn(sheet, index, column.props, oldColumns[index]?.props ?? {}));
      if (columns.some(column => column.props.dataField !== undefined) && columns.some((column, index) => column.props.dataField !== oldColumns[index]?.props.dataField)) {
        invoke(sheet, 'bindColumns', columns.map((column, index) => ({ name: column.props.dataField ?? String(index), displayName: column.props.headerText })));
      }
      if (props.dataSource !== previous.dataSource) invoke(sheet, 'setDataSource', props.dataSource ?? null);
      for (let index = 0; index < columns.length; index++) if (columns[index].props.autoFit) sheet.autoFitColumn(index);
      sheet.repaint();
    } finally { sheet.resumePaint(); }
  }
  private applyColumn(sheet: GC.Spread.Sheets.Worksheet, index: number, props: ColumnProp, previous: ColumnProp): void {
    for (const key of new Set([...Object.keys(previous), ...Object.keys(props)])) {
      const next = (props as RecordValue)[key];
      if (Object.is(next, (previous as RecordValue)[key])) continue;
      const columnDefaults: RecordValue = { width: sheet.defaults.colWidth, visible: true, resizable: true, style: null, headerStyle: null, headerText: null, formatter: 'General', cellType: null };
      const value = next ?? columnDefaults[key];
      if (key === 'width') sheet.setColumnWidth(index, value as number);
      else if (key === 'visible') sheet.setColumnVisible(index, value as boolean);
      else if (key === 'resizable') sheet.setColumnResizable(index, value as boolean);
      else if (key === 'style') sheet.setStyle(-1, index, value as GC.Spread.Sheets.Style);
      else if (key === 'headerStyle') sheet.setStyle(0, index, value as GC.Spread.Sheets.Style, GC.Spread.Sheets.SheetArea.colHeader);
      else if (key === 'headerText') sheet.setValue(0, index, value, GC.Spread.Sheets.SheetArea.colHeader);
      else if (key === 'formatter' || key === 'cellType') invoke(sheet.getRange(-1, index, -1, 1) as unknown as Runtime, key, value);
      else if (key === 'children') { if (React.Children.count(value as React.ReactNode)) unsupported('Column.children'); }
      else if (key !== 'dataField' && key !== 'autoFit') unsupported(`Column.${key}`);
    }
  }
  componentDidUpdate(previous: SpreadSheetsProp): void {
    if (!this.workbook) return;
    const wb = this.workbook;
    const before = markerChildren<WorksheetProp>(previous.children, Worksheet, 'SpreadSheets.children');
    const after = markerChildren<WorksheetProp>(this.props.children, Worksheet, 'SpreadSheets.children');
    wb.suspendPaint();
    try {
      this.applyWorkbook(previous);
      const existing = new Map(before.map((child, index) => [String(child.key ?? index), { sheet: wb.getSheet(index), props: child.props }]));
      after.forEach((child, index) => {
        const prior = existing.get(String(child.key ?? index));
        let sheet = prior?.sheet ?? (!before.length && !index ? wb.getSheet(0) : undefined);
        if (!sheet) { wb.addSheet(wb.getSheetCount()); sheet = wb.getSheet(wb.getSheetCount() - 1); }
        if (wb.sheets.indexOf(sheet) !== index) wb.changeSheetIndex(sheet.name(), index);
        this.applyWorksheet(sheet, child.props, prior?.props ?? {});
      });
      wb.setSheetCount(after.length || 1);
    } finally { wb.resumePaint(); }
  }
  componentWillUnmount(): void { this.workbook?.destroy(); this.workbook = undefined; this.bindings.clear(); }
  render(): React.ReactNode {
    const className = ['opensheets-host', this.props.hostClass, this.props.className].filter(Boolean).join(' ') || undefined;
    return <div ref={this.host} className={className} style={this.props.hostStyle as React.CSSProperties} />;
  }
}
export class Worksheet extends React.Component<WorksheetProp> { render(): React.ReactNode { return null; } }
export class Column extends React.Component<ColumnProp> { render(): React.ReactNode { return null; } }
