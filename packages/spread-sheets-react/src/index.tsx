import * as React from 'react';
import GC from '@opensheets/spread-sheets';
import type { SpreadSheetsProp, WorksheetProp, ColumnProp } from './props.js';
export type { SpreadSheetsProp, WorksheetProp, ColumnProp, IEventTypeObj } from './props.js';

function unsupported(path: string): never { throw new Error(`NotImplemented: ${path}`); }
function worksheetChildren(children: React.ReactNode): React.ReactElement<WorksheetProp>[] {
  const result: React.ReactElement<WorksheetProp>[] = [];
  React.Children.forEach(children, child => {
    if (!React.isValidElement(child)) return;
    if (child.type === React.Fragment) result.push(...worksheetChildren((child.props as { children?: React.ReactNode }).children));
    else if (child.type === Worksheet) result.push(child as React.ReactElement<WorksheetProp>);
    else unsupported('SpreadSheets.children');
  });
  return result;
}

export class SpreadSheets extends React.Component<SpreadSheetsProp> {
  private readonly host = React.createRef<HTMLDivElement>();
  private workbook?: GC.Spread.Sheets.Workbook;

  componentDidMount(): void {
    const supported = new Set(['children', 'hostStyle', 'hostClass', 'className', 'workbookInitialized']);
    for (const key of Object.keys(this.props)) if (!supported.has(key)) unsupported(`SpreadSheets.${key}`);
    const sheets = worksheetChildren(this.props.children);
    for (const child of sheets) {
      for (const [key, value] of Object.entries(child.props)) {
        if (key === 'children') { if (React.Children.count(value as React.ReactNode)) unsupported('Worksheet.children'); }
        else if (key !== 'name') unsupported(`Worksheet.${key}`);
      }
    }
    const workbook = new GC.Spread.Sheets.Workbook(this.host.current!, { sheetCount: sheets.length || 1 });
    this.workbook = workbook;
    sheets.forEach((child, index) => {
      if (child.props.name !== undefined) workbook.getSheet(index).name(child.props.name);
    });
    try { this.props.workbookInitialized?.(workbook); }
    catch (error) { workbook.destroy(); this.workbook = undefined; throw error; }
  }

  componentDidUpdate(previous: SpreadSheetsProp): void {
    const before = worksheetChildren(previous.children);
    const after = worksheetChildren(this.props.children);
    if (before.length !== after.length || after.some((sheet, index) => sheet.props.name !== before[index]!.props.name)) unsupported('SpreadSheets.update.children');
    for (const child of after) {
      for (const [key, value] of Object.entries(child.props)) {
        if (key === 'children') { if (React.Children.count(value as React.ReactNode)) unsupported('Worksheet.children'); }
        else if (key !== 'name') unsupported(`Worksheet.${key}`);
      }
    }
    const hostProps = new Set(['hostStyle', 'hostClass', 'className', 'workbookInitialized', 'children']);
    for (const key of new Set([...Object.keys(previous), ...Object.keys(this.props)])) {
      if (!hostProps.has(key) && previous[key as keyof SpreadSheetsProp] !== this.props[key as keyof SpreadSheetsProp]) unsupported(`SpreadSheets.update.${key}`);
    }
  }

  componentWillUnmount(): void { this.workbook?.destroy(); this.workbook = undefined; }

  render(): React.ReactNode {
    const className = ['opensheets-host', this.props.hostClass, this.props.className].filter(Boolean).join(' ') || undefined;
    return <div ref={this.host} className={className} style={this.props.hostStyle as React.CSSProperties} />;
  }
}

export class Worksheet extends React.Component<WorksheetProp> {
  render(): React.ReactNode { return null; }
}
export class Column extends React.Component<ColumnProp> {
  render(): React.ReactNode { return null; }
}
