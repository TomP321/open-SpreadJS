import type { TemplateCell } from './template.js';
import { selectRows } from './data.js';
import { cellAddress } from './address.js';

type Row = Record<string, unknown>;
type Entry = [number, number, TemplateCell];
export type HierarchyCell = { row: number; value: unknown; rowCount: number; extent: number; rows?: Row[] };
type Node = { row: number; col: number; cell: TemplateCell; field: string; children: Node[] };

function aggregate(rows: Row[], field: string, operation: TemplateCell['aggregate']): number {
  const values = rows.map(row => row[field]);
  const numbers = values.filter((value): value is number => typeof value === 'number');
  const sum = numbers.reduce((a, b) => a + b, 0);
  if (operation === 'Count') return values.length;
  if (operation === 'Avg') return sum / numbers.length;
  if (operation === 'Max') return Math.max(...numbers);
  if (operation === 'Min') return Math.min(...numbers);
  return sum;
}

/** Expand vertical context trees, aligning sibling branches at their parent. */
export function expandHierarchy(entries: Entry[], rows: Row[], parameters: Row = {}): Map<string, HierarchyCell[]> | undefined {
  if (entries.length < 2 || entries.some(([, , cell]) =>
    !['Group', 'List', 'Summary'].includes(cell.type) || (cell.spillDirection && cell.spillDirection !== 'Vertical'))) return undefined;
  const nodes = new Map<string, Node>();
  let table: string | undefined;
  const roots: Node[] = [];
  let previous: Node | undefined;
  for (const [row, col, cell] of entries) {
    const binding = cell.binding?.match(/^([^\[]+)\[([^\]]+)\]$/);
    if (!binding || (table && table !== binding[1])) return undefined;
    table = binding[1];
    const node: Node = { row, col, cell, field: binding[2]!, children: [] };
    const context = cell.context?.vertical;
    const parent = context && context !== 'None' ? nodes.get(context.toUpperCase()) : context === 'None' ? undefined : previous;
    if (context && context !== 'None' && !parent) return undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
    nodes.set(cellAddress(row, col), node);
    if (cell.type !== 'Summary') previous = node;
  }
  if (!roots.length || roots.some(node => node.cell.type === 'Summary') ||
    [...nodes.values()].some(node =>
    node.cell.type === 'Summary' && node.children.length > 0)) {
    return undefined;
  }
  const result = new Map<string, HierarchyCell[]>(entries.map(([row, col]) => [cellAddress(row, col), []]));
  let offset = 0;
  function visit(node: Node, subset: Row[]): void {
    subset = selectRows(subset, node.cell, parameters);
    const groups = node.cell.type === 'List' ? subset.map(item => [item]) : [...new Set(subset.map(item => item[node.field]))]
      .map(key => subset.filter(item => Object.is(item[node.field], key)));
    if (!groups.length) { offset++; return; }
    for (const group of groups) {
      const start = offset;
      const children = node.children.filter(item => item.cell.type !== 'Summary');
      let end = start + 1;
      for (const child of children) {
        offset = start + Math.max(0, child.row - node.row);
        visit(child, group);
        end = Math.max(end, offset);
      }
      offset = end;
      const size = children.some(child => child.row === node.row) ? offset - start : 1;
      result.get(cellAddress(node.row, node.col))!.push({ row: start, value: group[0]![node.field], rowCount: size,
        extent: end - start, rows: group });
      for (const summary of node.children.filter(item => item.cell.type === 'Summary')) {
        const selected = selectRows(group, summary.cell, parameters);
        result.get(cellAddress(summary.row, summary.col))!.push({ row: start + Math.max(0, summary.row - node.row),
          value: aggregate(selected, summary.field, summary.cell.aggregate), rowCount: size, extent: end - start });
      }
    }
  }
  for (const root of roots) {
    offset = root.row;
    visit(root, rows);
  }
  return result;
}
