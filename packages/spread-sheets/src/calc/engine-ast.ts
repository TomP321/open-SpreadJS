/**
 * Pure AST helpers for the calculation engine: name-reference detection, the
 * sheet-lifecycle reference transforms and the expression <-> AST conversion.
 * Moved out of `calc/engine.ts` unchanged.
 */
import type { AstNode } from './parser.js';
import { CalcError } from './values.js';

export const NAME_MARKERS = new Set<string>();
export function hasNameNodes(node: AstNode): boolean {
  switch (node.kind) {
    case 'name':
      return true;
    case 'binary':
      return hasNameNodes(node.left) || hasNameNodes(node.right);
    case 'unary':
    case 'percent':
      return hasNameNodes(node.operand);
    case 'paren':
      return hasNameNodes(node.inner);
    case 'range':
      return hasNameNodes(node.start) || hasNameNodes(node.end);
    case 'union':
      return node.parts.some(hasNameNodes);
    case 'intersect':
      return hasNameNodes(node.left) || hasNameNodes(node.right);
    case 'function':
      return node.args.some(hasNameNodes);
    case 'array':
      return node.rows.some((row) => row.some(hasNameNodes));
    case 'spill':
      return hasNameNodes(node.ref);
    case 'call':
      return hasNameNodes(node.callee) || node.args.some(hasNameNodes);
    default:
      return false;
  }
}

export function columnNumber(letters: string): number {
  let col = 0;
  for (const ch of letters.toUpperCase()) col = col * 26 + ch.charCodeAt(0) - 64;
  return col - 1;
}

// ---------------------------------------------------------------------------
// AST transforms for sheet lifecycle
// ---------------------------------------------------------------------------
export function renameSheetRefs(node: AstNode, oldName: string, newName: string): AstNode {
  const rename = (sheet: string | undefined) =>
    sheet && sheet.toLowerCase() === oldName.toLowerCase() ? newName : sheet;
  return mapAst(node, (current) => {
    if (current.kind === 'ref' || current.kind === 'name') return { ...current, sheet: rename(current.sheet) };
    return current;
  });
}

export function invalidateSheetRefs(node: AstNode, sheetName: string): AstNode {
  return mapAst(node, (current) => {
    if (current.kind === 'ref' && current.sheet && current.sheet.toLowerCase() === sheetName.toLowerCase())
      return { kind: 'error', value: '#REF!' };
    return current;
  });
}

function mapAst(node: AstNode, map: (node: AstNode) => AstNode): AstNode {
  const visit = (current: AstNode): AstNode => {
    switch (current.kind) {
      case 'range':
        return { ...current, start: visit(current.start), end: visit(current.end) };
      case 'union':
        return { ...current, parts: current.parts.map(visit) };
      case 'intersect':
        return { ...current, left: visit(current.left), right: visit(current.right) };
      case 'binary':
        return { ...current, left: visit(current.left), right: visit(current.right) };
      case 'unary':
        return { ...current, operand: visit(current.operand) };
      case 'percent':
        return { ...current, operand: visit(current.operand) };
      case 'paren':
        return { ...current, inner: visit(current.inner) };
      case 'function':
        return { ...current, args: current.args.map(visit) };
      case 'spill':
        return { ...current, ref: visit(current.ref) };
      case 'call':
        return { ...current, callee: visit(current.callee), args: current.args.map(visit) };
      case 'array':
        return current;
      default:
        return map(current);
    }
  };
  return visit(node);
}

// ---------------------------------------------------------------------------
// Public expression tree conversion
// ---------------------------------------------------------------------------
export interface PublicExpression {
  type: number;
  [key: string]: unknown;
}

export function toExpression(node: AstNode): PublicExpression {
  switch (node.kind) {
    case 'number':
      return { type: 2, value: node.value };
    case 'string':
      return { type: 3, value: node.value };
    case 'boolean':
      return { type: 4, value: node.value };
    case 'error':
      return { type: 5, value: node.value };
    case 'missing':
      return { type: 11 };
    case 'name':
      return { type: 8, name: node.name, sheet: node.sheet };
    case 'ref':
      return {
        type: 1,
        row: node.r1,
        column: node.c1,
        rowCount: node.r2 - node.r1 + 1,
        columnCount: node.c2 - node.c1 + 1,
        sheet: node.sheet,
        wholeRow: node.wholeRow,
        wholeCol: node.wholeCol,
        _node: node,
      };
    case 'range':
      return { type: 9, operator: ':', left: toExpression(node.start), right: toExpression(node.end) };
    case 'union':
      return { type: 9, operator: ',', arguments: node.parts.map(toExpression) };
    case 'intersect':
      return { type: 9, operator: ' ', left: toExpression(node.left), right: toExpression(node.right) };
    case 'binary':
      return { type: 9, operator: node.op, left: toExpression(node.left), right: toExpression(node.right) };
    case 'unary':
      return { type: 9, operator: node.op, argument: toExpression(node.operand) };
    case 'percent':
      return { type: 9, operator: '%', argument: toExpression(node.operand) };
    case 'paren':
      return { type: 10, argument: toExpression(node.inner) };
    case 'function':
      return {
        type: 7,
        functionName: node.name,
        arguments: node.args.map(toExpression),
        _args: node.args,
        _name: node.name,
      };
    case 'array':
      return { type: 6, value: node.rows.map((row) => row.map(renderArrayValue)) };
    case 'spill':
      return { type: 12, argument: toExpression(node.ref) };
    case 'structured':
      return { type: 13, table: node.table, spec: node.spec };
    case 'call':
      return {
        type: 7,
        functionName: '(call)',
        callee: toExpression(node.callee),
        arguments: node.args.map(toExpression),
      };
  }
}

function renderArrayValue(node: AstNode): unknown {
  if (node.kind === 'number') return node.value;
  if (node.kind === 'string') return node.value;
  if (node.kind === 'boolean') return node.value;
  if (node.kind === 'error') return new CalcError(node.value);
  return null;
}

export function fromExpression(expression: unknown): AstNode | undefined {
  const expr = expression as Record<string, unknown> | undefined;
  if (!expr || typeof expr.type !== 'number') return undefined;
  switch (expr.type) {
    case 2:
      return { kind: 'number', value: Number(expr.value), raw: String(expr.value) };
    case 3:
      return { kind: 'string', value: String(expr.value) };
    case 4:
      return { kind: 'boolean', value: Boolean(expr.value) };
    case 5:
      return { kind: 'error', value: String(expr.value) };
    case 8:
      return { kind: 'name', name: String(expr.name), sheet: expr.sheet as string | undefined };
    case 1: {
      if (expr._node) return expr._node as AstNode;
      const row = Number(expr.row ?? 0);
      const col = Number(expr.column ?? 0);
      const rowCount = Number(expr.rowCount ?? 1);
      const colCount = Number(expr.columnCount ?? 1);
      return {
        kind: 'ref',
        sheet: expr.sheet as string | undefined,
        r1: row,
        c1: col,
        r2: row + rowCount - 1,
        c2: col + colCount - 1,
        r1Rel: false,
        c1Rel: false,
        r2Rel: false,
        c2Rel: false,
        r1Abs: true,
        c1Abs: true,
        r2Abs: true,
        c2Abs: true,
        wholeRow: Boolean(expr.wholeRow),
        wholeCol: Boolean(expr.wholeCol),
      };
    }
    case 7: {
      const args =
        (expr.arguments as unknown[] | undefined)
          ?.map(fromExpression)
          .filter((item): item is AstNode => Boolean(item)) ?? [];
      if (expr.callee) {
        const callee = fromExpression(expr.callee);
        if (!callee) return undefined;
        return { kind: 'call', callee, args };
      }
      return { kind: 'function', name: String(expr.functionName ?? ''), args };
    }
    case 9: {
      const operator = String(expr.operator ?? '');
      const argument = expr.argument ? fromExpression(expr.argument) : undefined;
      if (argument && (operator === '-' || operator === '+' || operator === '@'))
        return { kind: 'unary', op: operator as '-' | '+' | '@', operand: argument };
      if (argument && operator === '%') return { kind: 'percent', operand: argument };
      if (operator === ',') {
        const parts =
          (expr.arguments as unknown[] | undefined)
            ?.map(fromExpression)
            .filter((item): item is AstNode => Boolean(item)) ?? [];
        return parts.length ? { kind: 'union', parts } : undefined;
      }
      const left = expr.left ? fromExpression(expr.left) : undefined;
      const right = expr.right ? fromExpression(expr.right) : undefined;
      if (!left || !right) return undefined;
      if (operator === ':') return { kind: 'range', start: left, end: right };
      if (operator === ' ') return { kind: 'intersect', left, right };
      return { kind: 'binary', op: operator, left, right };
    }
    case 10: {
      const inner = expr.argument ? fromExpression(expr.argument) : undefined;
      return inner ? { kind: 'paren', inner } : undefined;
    }
    case 11:
      return { kind: 'missing' };
    default:
      return undefined;
  }
}
