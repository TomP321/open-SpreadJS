/**
 * Formula AST node types (the grammar's output shapes). Moved out of
 * `calc/parser.ts` unchanged; `parser.ts` re-exports every name so existing
 * import paths keep working.
 */


export type AstNode =
  | NumberNode
  | StringNode
  | BooleanNode
  | ErrorNode
  | MissingNode
  | NameNode
  | RefNode
  | RangeNode
  | UnionNode
  | IntersectNode
  | BinaryNode
  | UnaryNode
  | PercentNode
  | ParenNode
  | FunctionNode
  | ArrayNode
  | SpillNode
  | StructuredNode
  | CallNode;

export interface NumberNode {
  kind: 'number';
  value: number;
  raw: string;
}
export interface StringNode {
  kind: 'string';
  value: string;
}
export interface BooleanNode {
  kind: 'boolean';
  value: boolean;
}
export interface ErrorNode {
  kind: 'error';
  value: string;
}
export interface MissingNode {
  kind: 'missing';
}
export interface NameNode {
  kind: 'name';
  name: string;
  sheet?: string;
}
export interface RefNode {
  kind: 'ref';
  sheet?: string;
  r1: number;
  c1: number;
  r2: number;
  c2: number;
  /** Relative flags for R1C1 references (and name base translation). */
  r1Rel: boolean;
  c1Rel: boolean;
  r2Rel: boolean;
  c2Rel: boolean;
  /** `$` markers for rendering. */
  r1Abs: boolean;
  c1Abs: boolean;
  r2Abs: boolean;
  c2Abs: boolean;
  wholeRow?: boolean;
  wholeCol?: boolean;
  /** True when written with an explicit colon (`A1:A1`). */
  range?: boolean;
  /**
   * The reference addresses another workbook (`[Book1.xlsx]Sheet1!A1`).
   * `name` is the workbook file name, `path` its path prefix (`''` for the bare
   * form) and `sheet` the sheet name written inside that workbook.
   */
  external?: { name: string; path: string; sheet: string };
  /** R1C1 row-only / column-only reference (`R1`, `C1`). */
  rowOnly?: boolean;
  colOnly?: boolean;
  /** R1C1 mode was used to write this reference. */
  r1c1?: boolean;
  /** Resolved reference cache (engine internal). */
  _cache?: { sheet: unknown; rows: number; cols: number; value: unknown };
}
export interface RangeNode {
  kind: 'range';
  start: AstNode;
  end: AstNode;
}
export interface UnionNode {
  kind: 'union';
  parts: AstNode[];
}
export interface IntersectNode {
  kind: 'intersect';
  left: AstNode;
  right: AstNode;
}
export interface BinaryNode {
  kind: 'binary';
  op: string;
  left: AstNode;
  right: AstNode;
}
export interface UnaryNode {
  kind: 'unary';
  op: '-' | '+' | '@';
  operand: AstNode;
}
export interface PercentNode {
  kind: 'percent';
  operand: AstNode;
}
export interface ParenNode {
  kind: 'paren';
  inner: AstNode;
}
export interface FunctionNode {
  kind: 'function';
  name: string;
  args: AstNode[];
  /** Reusable argument list cache (engine internal). */
  _args?: unknown;
}
export interface ArrayNode {
  kind: 'array';
  rows: AstNode[][];
}
export interface SpillNode {
  kind: 'spill';
  ref: AstNode;
}
export interface StructuredNode {
  kind: 'structured';
  table: string;
  spec: string;
}
export interface CallNode {
  kind: 'call';
  callee: AstNode;
  args: AstNode[];
  _args?: unknown;
}
