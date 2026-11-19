import type { TemplateCell } from './template.js';
import { selectRows } from './data.js';
import { cellAddress } from './address.js';

type Row = Record<string, unknown>;
type Entry = [number, number, TemplateCell];

/** One expanded cell of a cross-axis template: its output position, merged size and block size. */
export type AxisCell = { row: number; col: number; rowCount: number; colCount: number; extent: number;
  colExtent: number; value: unknown; source: TemplateCell; from: [number, number];
  /** Context instances the layout has no room for: reported by `getCells` with a zero row count. */
  phantoms?: { value: unknown; rowCount: number; colCount: number }[] };
export type AxisLayout = { cells: AxisCell[]; height: number; width: number };

type Node = {
  row: number; col: number; cell: TemplateCell; field: string; axis: boolean;
  vParent?: Node; hParent?: Node; children: Node[];
};
type AxisInstance = { value: unknown; rows: Row[]; col: number };

function groups(rows: Row[], field: string): Row[][] {
  return [...new Set(rows.map(row => row[field]))].map(key => rows.filter(row => Object.is(row[field], key)));
}

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

/**
 * Cross-axis (cross-tab) expansion: the template mixes the two axes — a group spills
 * horizontally while another group stacks instances downwards, and cells select a parent on
 * each axis. Each row-group instance reserves every template row below it, and each column
 * group instance reserves the template columns up to its widest column child.
 *
 * When the horizontal group is nested in the row group (`context.vertical` given or defaulted
 * to it) its instances repeat inside every row block and a cell carrying both contexts
 * repeats per pair, aggregating the data rows shared by the two parents. When it is
 * independent of the row group (`context.vertical: 'None'`) it expands once, across the row
 * of the first block, and a cell with both contexts appears once per row instance in that
 * first column block, aggregating the rows shared with the horizontal group's first instance.
 *
 * Returns undefined for templates outside this shape so the caller can fall back.
 */
export function expandAxes(entries: Entry[], dataRows: Row[], parameters: Row = {}): AxisLayout | undefined {
  const nodes: Node[] = [];
  const byAddress = new Map<string, Node>();
  let table: string | undefined;
  for (const [row, col, cell] of [...entries].sort((a, b) => a[0] - b[0] || a[1] - b[1])) {
    const binding = cell.binding?.match(/^([^\[]+)\[([^\]]+)\]$/);
    if (!binding || (table && table !== binding[1]) || !['Group', 'List', 'Summary'].includes(cell.type) ||
      (cell.spillDirection && !['Vertical', 'Horizontal'].includes(cell.spillDirection))) return undefined;
    table = binding[1];
    const node: Node = { row, col, cell, field: binding[2]!,
      axis: cell.spillDirection === 'Horizontal' && cell.type !== 'Summary', children: [] };
    nodes.push(node);
    byAddress.set(cellAddress(row, col), node);
  }
  if (nodes.filter(node => node.axis).length !== 1) return undefined;
  const axis = nodes.find(node => node.axis)!;
  if (axis.cell.type !== 'Group' || axis.cell.context?.horizontal) return undefined;

  const previousAt = (node: Node): Node | undefined => nodes.filter(item => item !== node &&
    item.cell.type !== 'Summary' && (item.row < node.row || item.row === node.row && item.col < node.col)).pop();
  for (const node of nodes) {
    const vertical = node.cell.context?.vertical;
    if (vertical === undefined) {
      const nearest = previousAt(node);
      // A Summary whose default vertical parent would be the horizontal axis cell has none
      // (TASK 48 probe `v7-summary-no-context`: it does not fall back to the row group above).
      node.vParent = nearest && nearest.axis && node.cell.type === 'Summary' ? undefined : nearest;
    } else if (vertical !== 'None') {
      const parent = byAddress.get(vertical.toUpperCase());
      if (!parent || parent === node || parent.cell.type === 'Summary' || parent.row > node.row) return undefined;
      node.vParent = parent;
    }
    const horizontal = node.cell.context?.horizontal;
    if (horizontal !== undefined && horizontal !== 'None') {
      if (byAddress.get(horizontal.toUpperCase()) !== axis) return undefined;
      node.hParent = axis;
    } else if (horizontal === undefined && node.cell.type === 'Summary' && node.vParent === undefined) {
      // A context-free Summary in a cross-tab template defaults to the axis group (probe
      // `v7-summary-no-context`): it expands once per axis instance as a free summary row.
      node.hParent = axis;
    }
  }
  const rowNodes = nodes.filter(node => !node.axis);
  for (const node of nodes) if (node.vParent) node.vParent.children.push(node);
  const roots = rowNodes.filter(node => !node.vParent && !(node.cell.type === 'Summary' && node.hParent));
  const chainToAxis = (node: Node): boolean => {
    for (let parent = node.vParent; parent; parent = parent.vParent) if (parent === axis) return true;
    return false;
  };
  const axisRows = selectRows(dataRows, axis.cell, parameters);
  // Pure horizontal root (TASK 48 probes `hc-horizontal-only/recursive`, `xt-group-h`): the
  // horizontal group is the root and vertical trees hang below its instance columns; every
  // instance owns a block `1 + max(child.col - axis.col)` columns wide.
  const pureSpan = 1 + Math.max(0, ...rowNodes.map(node => node.col - axis.col));
  const pureHorizontal = roots.length === 0 && !axis.vParent && !axis.hParent && rowNodes.length > 0 &&
    rowNodes.every(node => chainToAxis(node) && node.row > axis.row && node.col >= axis.col);
  if (pureHorizontal) {
    const instances: AxisInstance[] = groups(axisRows, axis.field)
      .map((group, index) => ({ value: group[0]![axis.field], rows: group, col: axis.col + index * pureSpan }));
    const cells: AxisCell[] = instances.map(instance => ({ row: axis.row, col: instance.col, rowCount: 1,
      colCount: 1, extent: 1, colExtent: pureSpan, value: instance.value, source: axis.cell,
      from: [axis.row, axis.col] }));
    function visitBlock(node: Node, subset: Row[], from: number, instanceCol: number): number {
      const selected = selectRows(subset, node.cell, parameters);
      const own = node.cell.type === 'List' ? selected.map(row => [row]) : groups(selected, node.field);
      if (!own.length) return from + 1;
      const children = node.children.filter(child => !child.axis && child.cell.type !== 'Summary');
      let cursor = from;
      for (const instance of own) {
        const start = cursor;
        let end = start + 1;
        for (const child of children) {
          cursor = start + Math.max(0, child.row - node.row);
          end = Math.max(end, visitBlock(child, instance, cursor, instanceCol));
        }
        cursor = end;
        cells.push({ row: start, col: instanceCol + (node.col - axis.col),
          rowCount: children.some(child => child.row === node.row) ? end - start : 1, colCount: 1,
          extent: end - start, colExtent: 1, value: instance[0]![node.field], source: node.cell,
          from: [node.row, node.col] });
        for (const summary of node.children.filter(child => child.cell.type === 'Summary')) {
          const chosen = selectRows(instance, summary.cell, parameters);
          cells.push({ row: start + Math.max(0, summary.row - node.row),
            col: instanceCol + (summary.col - axis.col), rowCount: 1, colCount: 1, extent: end - start,
            colExtent: 1, value: aggregate(chosen, summary.field, summary.cell.aggregate),
            source: summary.cell, from: [summary.row, summary.col] });
        }
      }
      return cursor;
    }
    const topChildren = axis.children.slice().sort((a, b) => a.row - b.row || a.col - b.col);
    for (const instance of instances)
      for (const child of topChildren)
        visitBlock(child, instance.rows, axis.row + Math.max(0, child.row - axis.row), instance.col);
    return {
      cells,
      height: Math.max(axis.row + 1, ...cells.map(cell => cell.row + cell.rowCount)),
      width: axis.col + instances.length * pureSpan,
    };
  }
  for (const node of nodes) {
    if (node.vParent && node.vParent.axis) return undefined;
    if (node === axis) continue;
    // Row-tree cells stand left of the axis; axis-bound cells (and any Summary, which the
    // trial resolves per axis column - probes `v4`/`d4`) stand on the axis columns.
    if (node.hParent || node.cell.type === 'Summary' ? node.col < axis.col : node.col >= axis.col) return undefined;
  }
  if (roots.length !== 1 || roots[0]!.cell.type === 'Summary' ||
    nodes.some(node => node.cell.type === 'Summary' && node.children.length) ||
    rowNodes.some(node => node.hParent && node.cell.type !== 'Summary') ||
    nodes.some(node => node.axis && node.hParent)) return undefined;
  if (axis.vParent && axis.vParent !== roots[0]) return undefined;

  const blockWidth = 1 + Math.max(0, ...nodes.filter(node => node.hParent).map(node => node.col - axis.col));
  const globalAxis: AxisInstance[] = groups(axisRows, axis.field)
    .map((group, index) => ({ value: group[0]![axis.field], rows: group, col: axis.col + index * blockWidth }));
  const axisInstances = (subset: Row[]): AxisInstance[] => groups(selectRows(subset, axis.cell, parameters), axis.field)
    .map((group, index) => ({ value: group[0]![axis.field], rows: group, col: axis.col + index * blockWidth }));
  const cells: AxisCell[] = [];
  if (!axis.vParent) {
    for (const instance of globalAxis) cells.push({ row: axis.row, col: instance.col, rowCount: 1, colCount: 1, extent: 1,
      colExtent: blockWidth,
      value: instance.value, source: axis.cell, from: [axis.row, axis.col] });
  }

  let cursor = 0;
  function visit(node: Node, subset: Row[]): void {
    const selected = selectRows(subset, node.cell, parameters);
    const instances = node.cell.type === 'List' ? selected.map(row => [row]) : groups(selected, node.field);
    if (!instances.length) { cursor++; return; }
    for (const instance of instances) {
      const start = cursor;
      const below = node.children.filter(child => !child.axis && child.cell.type !== 'Summary');
      let end = start + 1;
      for (const child of below) {
        cursor = start + Math.max(0, child.row - node.row);
        visit(child, instance);
        end = Math.max(end, cursor);
      }
      const block = axis.vParent === node ? axisInstances(instance) : undefined;
      const depth = Math.max(end - start, 1, ...node.children.map(child => child.row - node.row + 1));
      cursor = start + depth;
      cells.push({ row: start, col: node.col, rowCount: end - start > 1 && below.some(child => child.row === node.row)
        ? end - start : 1, colCount: 1, extent: depth, colExtent: 1, value: instance[0]![node.field],
        source: node.cell, from: [node.row, node.col] });
      if (block) for (const item of block) cells.push({ row: start + Math.max(0, axis.row - node.row), col: item.col,
        rowCount: 1, colCount: 1, extent: depth, colExtent: blockWidth, value: item.value, source: axis.cell, from: [axis.row, axis.col] });
      for (const summary of node.children.filter(child => child.cell.type === 'Summary')) {
        const row = start + Math.max(0, summary.row - node.row);
        const selected = selectRows(instance, summary.cell, parameters);
        const axisInstancesList = block ?? globalAxis;
        const pair = summary.hParent === axis;
        // A Summary standing on the independent axis columns resolves per axis instance but
        // only the instance owning its own template column is laid out (TASK 48 probes
        // `v3-summary-spill`/`v4-summary-vertical-only` and the cross-tab scenario); the
        // others are reported by `getCells` with a zero row count.
        const ownIndex = Math.max(0, Math.min(axisInstancesList.length - 1,
          Math.floor((summary.col - axis.col) / blockWidth)));
        const inAxisBand = !axis.vParent && summary.col >= axis.col && axisInstancesList.length > 0;
        const items = pair || inAxisBand
          ? axisInstancesList.map(item => ({ ...item, col: pair ? item.col + (summary.col - axis.col) : summary.col,
              rows: selected.filter(data => Object.is(data[axis.field], item.value)) }))
          : [{ value: undefined, col: summary.col, rows: selected }];
        const laidOut = inAxisBand ? [pair ? items[0]! : items[ownIndex]!] : items;
        const phantoms = laidOut.length === items.length ? undefined : items
          .filter(item => !laidOut.includes(item))
          .map(item => ({ value: aggregate(item.rows, summary.field, summary.cell.aggregate), rowCount: 0, colCount: 1 }));
        for (const item of laidOut) cells.push({ row, col: item.col, rowCount: 1, colCount: 1, colExtent: 1,
          extent: depth, value: aggregate(item.rows, summary.field, summary.cell.aggregate),
          source: summary.cell, from: [summary.row, summary.col], phantoms });
      }
    }
  }
  cursor = roots[0]!.row;
  visit(roots[0]!, dataRows);
  const freeSummaries = rowNodes.filter(node => node.cell.type === 'Summary' && node.hParent === axis && !node.vParent);
  if (freeSummaries.length) {
    // Free cross-tab summary rows (probes `v5-summary-horizontal-only`, `v6`, `v7`): they bind
    // no row group, expand once per axis instance aggregating the instance's whole column
    // group, and take the layout row at their own template offset from the group's start.
    if (axis.vParent || roots[0]!.children.length) return undefined;
    for (const summary of freeSummaries) {
      const row = roots[0]!.row + Math.max(0, summary.row - roots[0]!.row);
      for (const instance of globalAxis) {
        const selected = selectRows(instance.rows, summary.cell, parameters);
        cells.push({ row, col: instance.col + (summary.col - axis.col), rowCount: 1, colCount: 1, colExtent: 1,
          extent: 1, value: aggregate(selected, summary.field, summary.cell.aggregate),
          source: summary.cell, from: [summary.row, summary.col] });
      }
    }
  }
  return {
    cells,
    height: Math.max(axis.row + 1, ...cells.map(cell => cell.row + cell.rowCount)),
    width: Math.max(axis.col + globalAxis.length * blockWidth, ...cells.map(cell => cell.col + cell.colCount)),
  };
}
