/**
 * Formula tokenizer, parser and canonical text renderer.
 *
 * The grammar follows Excel precedence: reference operators bind tightest,
 * followed by negation, percent, exponentiation, multiplication, addition,
 * concatenation and comparisons. `-2^2` therefore parses as `(-2)^2`.
 */
import { isErrorString } from './values.js';


import {
  Lexer,
  columnIndex,
  columnLabel,
  formatSheetName,
  type LexOptions,
  type Token,
  type TokenType,
} from './lexer.js';
import { FormulaParseError } from './errors.js';
import type {
  ArrayNode,
  AstNode,
  BinaryNode,
  BooleanNode,
  CallNode,
  ErrorNode,
  FunctionNode,
  IntersectNode,
  MissingNode,
  NameNode,
  NumberNode,
  ParenNode,
  PercentNode,
  RangeNode,
  RefNode,
  SpillNode,
  StringNode,
  StructuredNode,
  UnaryNode,
  UnionNode,
} from './ast.js';
export {
  Lexer,
  columnLabel,
  formatSheetName,
  FormulaParseError,
  type LexOptions,
  type Token,
  type TokenType,
};
export type {
  ArrayNode,
  AstNode,
  BinaryNode,
  BooleanNode,
  CallNode,
  ErrorNode,
  FunctionNode,
  IntersectNode,
  MissingNode,
  NameNode,
  NumberNode,
  ParenNode,
  PercentNode,
  RangeNode,
  RefNode,
  SpillNode,
  StringNode,
  StructuredNode,
  UnaryNode,
  UnionNode,
};

const BINARY_PRECEDENCE: Record<string, number> = {
  '=': 1,
  '<>': 1,
  '<': 1,
  '>': 1,
  '<=': 1,
  '>=': 1,
  '&': 2,
  '+': 3,
  '-': 3,
  '*': 4,
  '/': 4,
  '^': 5,
};
const COLON_PRECEDENCE = 9;
const INTERSECTION_PRECEDENCE = 8;
const UNION_PRECEDENCE = 0.5;

export class Parser {
  private tokens: Token[];
  private index = 0;
  private readonly text: string;
  private readonly r1c1: boolean;
  constructor(text: string, options: LexOptions = {}) {
    this.text = text;
    this.r1c1 = Boolean(options.r1c1);
    this.tokens = new Lexer(text, options).tokenize();
  }
  parseFormula(): AstNode {
    const node = this.parseExpression(0, true);
    if (this.peek().type !== 'end')
      throw new FormulaParseError(`Unexpected token ${this.peek().text}`, this.peek().start, this.text);
    return node;
  }
  private peek(offset = 0): Token {
    return this.tokens[this.index + offset] ?? this.tokens[this.tokens.length - 1]!;
  }
  private next(): Token {
    return this.tokens[this.index++]!;
  }
  private expect(type: TokenType): Token {
    const token = this.peek();
    if (token.type !== type) throw new FormulaParseError(`Expected ${type}`, token.start, this.text);
    return this.next();
  }
  private parseExpression(minPrecedence: number, allowUnion: boolean): AstNode {
    let left = this.parsePrefix();
    for (;;) {
      const token = this.peek();
      let precedence = -1;
      let operator: string | undefined;
      if (token.type === 'colon') {
        precedence = COLON_PRECEDENCE;
        operator = ':';
      } else if (this.isIntersection()) {
        precedence = INTERSECTION_PRECEDENCE;
        operator = ' ';
      } else if (token.type === 'op' && BINARY_PRECEDENCE[token.text] !== undefined) {
        precedence = BINARY_PRECEDENCE[token.text]!;
        operator = token.text;
      } else if (allowUnion && token.type === 'comma') {
        precedence = UNION_PRECEDENCE;
        operator = ',';
      }
      if (!operator || precedence < minPrecedence) break;
      if (operator !== ' ') this.next();
      if (operator === ',') {
        const parts = [left];
        parts.push(this.parseExpression(UNION_PRECEDENCE + 0.1, false));
        while (this.peek().type === 'comma') {
          this.next();
          parts.push(this.parseExpression(UNION_PRECEDENCE + 0.1, false));
        }
        left = { kind: 'union', parts };
        continue;
      }
      // Exponentiation is left associative like Excel; all other binary
      // operators use their precedence + 1 for the right operand.
      const right = this.parseExpression(precedence + 1, allowUnion);
      if (operator === ':') left = mergeRange(left, right);
      else if (operator === ' ') left = { kind: 'intersect', left, right };
      else left = { kind: 'binary', op: operator, left, right };
    }
    return left;
  }
  private isIntersection(): boolean {
    const token = this.peek();
    if (!token.wsBefore) return false;
    return (
      token.type === 'ref' ||
      token.type === 'ident' ||
      token.type === 'colrange' ||
      token.type === 'rowrange' ||
      token.type === 'structured' ||
      token.type === 'lparen'
    );
  }
  private parsePrefix(): AstNode {
    const token = this.peek();
    if (token.type === 'op' && (token.text === '-' || token.text === '+')) {
      this.next();
      return { kind: 'unary', op: token.text as '-' | '+', operand: this.parseExpression(INTERSECTION_PRECEDENCE, false) };
    }
    if (token.type === 'at') {
      this.next();
      return { kind: 'unary', op: '@', operand: this.parseExpression(INTERSECTION_PRECEDENCE, false) };
    }
    return this.parsePostfix();
  }
  private parsePostfix(): AstNode {
    let node = this.parsePrimary();
    for (;;) {
      const token = this.peek();
      if (token.type === 'percent') {
        this.next();
        node = { kind: 'percent', operand: node };
      } else if (token.type === 'spill') {
        this.next();
        node = { kind: 'spill', ref: node };
      } else if (token.type === 'lparen' && !token.wsBefore) {
        node = { kind: 'call', callee: node, args: this.parseArguments() };
      } else break;
    }
    return node;
  }
  private parsePrimary(): AstNode {
    const token = this.peek();
    switch (token.type) {
      case 'number':
        this.next();
        return { kind: 'number', value: token.value as number, raw: token.text };
      case 'string':
        this.next();
        return { kind: 'string', value: token.value as string };
      case 'error':
        this.next();
        return { kind: 'error', value: token.value as string };
      case 'ref':
      case 'colrange':
      case 'rowrange': {
        this.next();
        const node = this.refNode(token);
        return node;
      }
      case 'sheet': {
        this.next();
        const sheet = (token.value as { name: string }).name;
        const next = this.peek();
        if (next.type === 'ref' || next.type === 'colrange' || next.type === 'rowrange') {
          this.next();
          const node = this.refNode(next);
          if (node.kind === 'ref') node.sheet = sheet;
          return node;
        }
        if (next.type === 'ident' || next.type === 'structured') {
          this.next();
          if (next.type === 'structured') {
            const info = next.value as { table: string; spec: string };
            return { kind: 'structured', table: `${sheet}!${info.table}`, spec: info.spec };
          }
          return { kind: 'name', name: next.text, sheet };
        }
        throw new FormulaParseError('Expected reference after sheet name', next.start, this.text);
      }
      case 'ident': {
        this.next();
        const name = token.text;
        if (this.peek().type === 'lparen') {
          return { kind: 'function', name: name.toUpperCase(), args: this.parseArguments() };
        }
        if (!this.r1c1 && /^(TRUE|FALSE)$/i.test(name)) {
          return { kind: 'boolean', value: name.toUpperCase() === 'TRUE' };
        }
        return { kind: 'name', name };
      }
      case 'structured': {
        this.next();
        const info = token.value as { table: string; spec: string };
        return { kind: 'structured', table: info.table, spec: info.spec };
      }
      case 'external': {
        // `[Book1.xlsx]Sheet1!A1:B2` - a reference into another workbook. The
        // sheet of that workbook is always part of the reference, so a bracketed
        // name that looks like a file but is not followed by `Sheet!` is a
        // structured column reference instead (`[Sales.Qty]` in a data view).
        const info = token.value as { file: string; path: string; spec: string };
        this.next();
        const following = this.peek();
        if (following.type !== 'sheet') return { kind: 'structured', table: '', spec: info.spec };
        this.next();
        const sheet = (following.value as { name: string }).name;
        const reference = this.peek();
        if (reference.type !== 'ref' && reference.type !== 'colrange' && reference.type !== 'rowrange')
          throw new FormulaParseError('Expected reference after external workbook', reference.start, this.text);
        this.next();
        const node = this.refNode(reference);
        node.external = { name: info.file, path: info.path, sheet };
        return node;
      }
      case 'lparen': {
        this.next();
        const inner = this.parseExpression(0, true);
        this.expect('rparen');
        return { kind: 'paren', inner };
      }
      case 'lbrace':
        return this.parseArrayConstant();
      default:
        throw new FormulaParseError(`Unexpected token ${token.text}`, token.start, this.text);
    }
  }
  private parseArguments(): AstNode[] {
    this.expect('lparen');
    const args: AstNode[] = [];
    if (this.peek().type === 'rparen') {
      this.next();
      return args;
    }
    for (;;) {
      if (this.peek().type === 'comma') {
        args.push({ kind: 'missing' });
        this.next();
        continue;
      }
      if (this.peek().type === 'rparen') {
        args.push({ kind: 'missing' });
        this.next();
        break;
      }
      args.push(this.parseExpression(0, false));
      if (this.peek().type === 'comma') {
        this.next();
        if (this.peek().type === 'rparen') {
          args.push({ kind: 'missing' });
          this.next();
          break;
        }
        continue;
      }
      this.expect('rparen');
      break;
    }
    return args;
  }
  private parseArrayConstant(): ArrayNode {
    this.expect('lbrace');
    const rows: AstNode[][] = [];
    let row: AstNode[] = [];
    for (;;) {
      row.push(this.parseArrayElement());
      const token = this.peek();
      if (token.type === 'comma') {
        this.next();
        continue;
      }
      if (token.type === 'semicolon') {
        this.next();
        rows.push(row);
        row = [];
        continue;
      }
      if (token.type === 'rbrace') {
        this.next();
        rows.push(row);
        break;
      }
      throw new FormulaParseError('Invalid array constant', token.start, this.text);
    }
    return { kind: 'array', rows };
  }
  private parseArrayElement(): AstNode {
    let sign = 1;
    while (this.peek().type === 'op' && (this.peek().text === '-' || this.peek().text === '+')) {
      if (this.next().text === '-') sign = -sign;
    }
    const token = this.peek();
    if (token.type === 'number') {
      this.next();
      return { kind: 'number', value: sign * (token.value as number), raw: (sign < 0 ? '-' : '') + token.text };
    }
    if (token.type === 'string') {
      this.next();
      return { kind: 'string', value: token.value as string };
    }
    if (token.type === 'error') {
      this.next();
      return { kind: 'error', value: token.value as string };
    }
    if (token.type === 'ident' && /^(TRUE|FALSE)$/i.test(token.text)) {
      this.next();
      return { kind: 'boolean', value: token.text.toUpperCase() === 'TRUE' };
    }
    throw new FormulaParseError('Invalid array element', token.start, this.text);
  }
  private refNode(token: Token): RefNode {
    const direct = token.value as RefNode | undefined;
    if (direct && (direct as { kind?: string }).kind === 'ref') return direct;
    if (token.type === 'colrange') {
      const value = token.value as {
        c1: number;
        c2: number;
        rel1?: boolean;
        rel2?: boolean;
        abs1: boolean;
        abs2: boolean;
        rc?: boolean;
      };
      return {
        kind: 'ref',
        r1: 0,
        c1: value.c1,
        r2: 0,
        c2: value.c2,
        r1Rel: false,
        c1Rel: value.rc ? Boolean(value.rel1) : !value.abs1,
        r2Rel: false,
        c2Rel: value.rc ? Boolean(value.rel2) : !value.abs2,
        r1Abs: false,
        c1Abs: value.abs1,
        r2Abs: false,
        c2Abs: value.abs2,
        wholeCol: true,
        r1c1: Boolean(value.rc),
      };
    }
    if (token.type === 'rowrange') {
      const value = token.value as {
        r1: number;
        r2: number;
        rel1?: boolean;
        rel2?: boolean;
        abs1: boolean;
        abs2: boolean;
        rc?: boolean;
      };
      return {
        kind: 'ref',
        r1: value.r1,
        c1: 0,
        r2: value.r2,
        c2: 0,
        r1Rel: value.rc ? Boolean(value.rel1) : !value.abs1,
        c1Rel: false,
        r2Rel: value.rc ? Boolean(value.rel2) : !value.abs2,
        c2Rel: false,
        r1Abs: value.abs1,
        c1Abs: false,
        r2Abs: value.abs2,
        c2Abs: false,
        wholeRow: true,
        r1c1: Boolean(value.rc),
      };
    }
    const value = token.value as RefNode & { relRow?: boolean; relCol?: boolean };
    value.kind = 'ref';
    return value;
  }
}

/** Parses a formula (with or without a leading '='). */
export function parseFormula(formula: string, options: LexOptions = {}): AstNode {
  const text = formula.startsWith('=') ? formula.slice(1) : formula;
  return new Parser(text, options).parseFormula();
}

// ---------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------

export function astToText(node: AstNode, options: LexOptions = {}): string {
  return render(node, options);
}

function renderRef(node: RefNode, options: LexOptions): string {
  const r1c1 = options.r1c1 ?? node.r1c1;
  let text: string;
  if (r1c1) {
    const rowPart = (value: number, rel: boolean) => (rel ? (value === 0 ? '' : `[${value}]`) : String(value + 1));
    const colPart = (value: number, rel: boolean) => (rel ? (value === 0 ? '' : `[${value}]`) : String(value + 1));
    if (node.wholeRow) text = `R${rowPart(node.r1, node.r1Rel)}:R${rowPart(node.r2, node.r2Rel)}`;
    else if (node.wholeCol) text = `C${colPart(node.c1, node.c1Rel)}:C${colPart(node.c2, node.c2Rel)}`;
    else if (node.rowOnly) text = `R${rowPart(node.r1, node.r1Rel)}`;
    else if (node.colOnly) text = `C${colPart(node.c1, node.c1Rel)}`;
    else {
      text = `R${rowPart(node.r1, node.r1Rel)}C${colPart(node.c1, node.c1Rel)}`;
      const sameCell = node.r1 === node.r2 && node.c1 === node.c2;
      if (!sameCell) text += `:R${rowPart(node.r2, node.r2Rel)}C${colPart(node.c2, node.c2Rel)}`;
    }
  } else {
    const cell = (row: number, col: number, rowAbs: boolean, colAbs: boolean) =>
      `${colAbs ? '$' : ''}${columnLabel(col)}${rowAbs ? '$' : ''}${row + 1}`;
    if (node.wholeRow) text = `${node.r1Abs ? '$' : ''}${node.r1 + 1}:${node.r2Abs ? '$' : ''}${node.r2 + 1}`;
    else if (node.wholeCol)
      text = `${node.c1Abs ? '$' : ''}${columnLabel(node.c1)}:${node.c2Abs ? '$' : ''}${columnLabel(node.c2)}`;
    else {
      text = cell(node.r1, node.c1, node.r1Abs, node.c1Abs);
      if (node.range || node.r1 !== node.r2 || node.c1 !== node.c2)
        text += ':' + cell(node.r2, node.c2, node.r2Abs, node.c2Abs);
    }
  }
  if (node.external) {
    const workbook = node.external.path
      ? `[${node.external.path}[${node.external.name}]]`
      : `[${node.external.name}]`;
    const externalSheet = node.external.sheet ? `${formatSheetName(node.external.sheet)}!` : '';
    return `${workbook}${externalSheet}${text}`;
  }
  return node.sheet ? `${formatSheetName(node.sheet)}!${text}` : text;
}

function render(node: AstNode, options: LexOptions): string {
  switch (node.kind) {
    case 'number':
      return node.raw;
    case 'string':
      return `"${node.value.replace(/"/g, '""')}"`;
    case 'boolean':
      return node.value ? 'TRUE' : 'FALSE';
    case 'error':
      return node.value;
    case 'missing':
      return '';
    case 'name':
      return node.sheet ? `${formatSheetName(node.sheet)}!${node.name}` : node.name;
    case 'ref':
      return renderRef(node, options);
    case 'range':
      return `${render(node.start, options)}:${render(node.end, options)}`;
    case 'union':
      return node.parts.map((part) => render(part, options)).join(',');
    case 'intersect':
      return `${render(node.left, options)} ${render(node.right, options)}`;
    case 'binary':
      return `${render(node.left, options)}${node.op}${render(node.right, options)}`;
    case 'unary':
      return `${node.op}${render(node.operand, options)}`;
    case 'percent':
      return `${render(node.operand, options)}%`;
    case 'paren':
      return `(${render(node.inner, options)})`;
    case 'function':
      return `${node.name}(${node.args.map((arg) => render(arg, options)).join(',')})`;
    case 'array':
      return `{${node.rows.map((row) => row.map((value) => render(value, options)).join(',')).join(';')}}`;
    case 'spill':
      return `${render(node.ref, options)}#`;
    case 'structured': {
      let spec = node.spec;
      const thisRow = /^\[\[#This Row\],\[([^\]]+)\]\]$/i.exec(spec);
      if (thisRow) spec = `[@${thisRow[1]}]`;
      return `${node.table}${spec}`;
    }
    case 'call':
      return `${render(node.callee, options)}(${node.args.map((arg) => render(arg, options)).join(',')})`;
  }
}

/** Returns every static reference appearing in the tree. */
export function collectRefs(node: AstNode, out: RefNode[] = []): RefNode[] {
  switch (node.kind) {
    case 'ref':
      out.push(node);
      break;
    case 'range':
      collectRefs(node.start, out);
      collectRefs(node.end, out);
      break;
    case 'union':
      for (const part of node.parts) collectRefs(part, out);
      break;
    case 'intersect':
      collectRefs(node.left, out);
      collectRefs(node.right, out);
      break;
    case 'binary':
      collectRefs(node.left, out);
      collectRefs(node.right, out);
      break;
    case 'unary':
    case 'percent':
      collectRefs(node.operand, out);
      break;
    case 'paren':
      collectRefs(node.inner, out);
      break;
    case 'function':
      for (const arg of node.args) collectRefs(arg, out);
      break;
    case 'array':
      for (const row of node.rows) for (const value of row) collectRefs(value, out);
      break;
    case 'spill':
      collectRefs(node.ref, out);
      break;
    case 'call':
      collectRefs(node.callee, out);
      for (const arg of node.args) collectRefs(arg, out);
      break;
    default:
      break;
  }
  return out;
}

/** Returns true when the tree contains one of the given function names. */
export function containsFunction(node: AstNode, names: Set<string>): boolean {
  switch (node.kind) {
    case 'function':
      if (names.has(node.name)) return true;
      return node.args.some((arg) => containsFunction(arg, names));
    case 'binary':
      return containsFunction(node.left, names) || containsFunction(node.right, names);
    case 'unary':
    case 'percent':
      return containsFunction(node.operand, names);
    case 'paren':
      return containsFunction(node.inner, names);
    case 'range':
      return containsFunction(node.start, names) || containsFunction(node.end, names);
    case 'union':
      return node.parts.some((part) => containsFunction(part, names));
    case 'intersect':
      return containsFunction(node.left, names) || containsFunction(node.right, names);
    case 'array':
      return node.rows.some((row) => row.some((value) => containsFunction(value, names)));
    case 'spill':
      return containsFunction(node.ref, names);
    case 'call':
      return containsFunction(node.callee, names) || node.args.some((arg) => containsFunction(arg, names));
    default:
      return false;
  }
}

/** Rewrites relative references; used by copy/fill and name evaluation. */
export function translateRefs(node: AstNode, rows: number, columns: number): AstNode {
  switch (node.kind) {
    case 'ref': {
      if (node.wholeRow) {
        const delta = node.r1Rel ? rows : 0;
        return { ...node, r1: node.r1 + delta, r2: node.r2 + (node.r2Rel ? rows : 0) };
      }
      if (node.wholeCol) {
        const delta = node.c1Rel ? columns : 0;
        return { ...node, c1: node.c1 + delta, c2: node.c2 + (node.c2Rel ? columns : 0) };
      }
      return {
        ...node,
        r1: node.r1Rel ? node.r1 + rows : node.r1,
        r2: node.r2Rel ? node.r2 + rows : node.r2,
        c1: node.c1Rel ? node.c1 + columns : node.c1,
        c2: node.c2Rel ? node.c2 + columns : node.c2,
      };
    }
    case 'range':
      return { ...node, start: translateRefs(node.start, rows, columns), end: translateRefs(node.end, rows, columns) };
    case 'union':
      return { ...node, parts: node.parts.map((part) => translateRefs(part, rows, columns)) };
    case 'intersect':
      return { ...node, left: translateRefs(node.left, rows, columns), right: translateRefs(node.right, rows, columns) };
    case 'binary':
      return { ...node, left: translateRefs(node.left, rows, columns), right: translateRefs(node.right, rows, columns) };
    case 'unary':
      return { ...node, operand: translateRefs(node.operand, rows, columns) };
    case 'percent':
      return { ...node, operand: translateRefs(node.operand, rows, columns) };
    case 'paren':
      return { ...node, inner: translateRefs(node.inner, rows, columns) };
    case 'function':
      return { ...node, args: node.args.map((arg) => translateRefs(arg, rows, columns)) };
    case 'array':
      return node;
    case 'spill':
      return { ...node, ref: translateRefs(node.ref, rows, columns) };
    case 'call':
      return {
        ...node,
        callee: translateRefs(node.callee, rows, columns),
        args: node.args.map((arg) => translateRefs(arg, rows, columns)),
      };
    default:
      return node;
  }
}

/**
 * Adjusts references for a structural row/column change on `sheetName`.
 * Inserted rows shift; deleted rows produce #REF! error nodes.
 */
export function adjustRefsForStructure(
  node: AstNode,
  axis: 'row' | 'col',
  index: number,
  amount: number,
  remove: boolean,
  sheetName: string,
  formulaOnChangedSheet = true,
  cross?: [number, number],
): AstNode {
  const adjust = (start: number, end: number): [number, number] | undefined => {
    const before = remove ? index : index;
    if (remove) {
      const removeEnd = index + amount;
      if (end < before) return [start, end];
      if (start >= removeEnd) return [start - amount, end - amount];
      const newStart = start < before ? start : before;
      const newEnd = end >= removeEnd ? end - amount : before - 1;
      if (newEnd < newStart) return undefined;
      return [newStart, newEnd];
    }
    if (end < before) return [start, end];
    if (start >= before) return [start + amount, end + amount];
    return [start, end + amount];
  };
  const visit = (current: AstNode): AstNode => {
    if (current.kind === 'ref') {
      if (!current.sheet && !formulaOnChangedSheet) return current;
      if (current.sheet && current.sheet.toLowerCase() !== sheetName.toLowerCase()) return current;
      // Band-restricted shifts only move cells inside the cross range, so only
      // references that intersect it may adjust (trial Table-row semantics).
      if (cross && (axis === 'row' ? current.c2 < cross[0] || current.c1 > cross[1] : current.r2 < cross[0] || current.r1 > cross[1])) return current;
      const rows = axis === 'row' ? adjust(current.r1, current.r2) : undefined;
      const cols = axis === 'col' ? adjust(current.c1, current.c2) : undefined;
      if (axis === 'row' && !rows) return { kind: 'error', value: '#REF!' };
      if (axis === 'col' && !cols) return { kind: 'error', value: '#REF!' };
      return {
        ...current,
        r1: rows ? rows[0] : current.r1,
        r2: rows ? rows[1] : current.r2,
        c1: cols ? cols[0] : current.c1,
        c2: cols ? cols[1] : current.c2,
        wholeRow: current.wholeRow,
        wholeCol: current.wholeCol,
      };
    }
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
      default:
        return current;
    }
  };
  return visit(node);
}

/**
 * Re-points references to a moved block. References fully inside the moved
 * rectangle shift by the same delta; a formula that moved with the block keeps
 * its text (SpreadJS preserves it when its cell is cut and pasted).
 */
export function moveRefsForRange(
  node: AstNode,
  fromRow: number,
  fromCol: number,
  fromRowEnd: number,
  fromColEnd: number,
  toRow: number,
  toCol: number,
  dr: number,
  dc: number,
  sheetName: string,
  formulaRow: number,
  formulaCol: number,
  destRowCount: number,
  destColCount: number,
  onMovedSheet: boolean,
): AstNode {
  // The formula's coordinates are already the post-move ones. Formulas now in
  // the destination rectangle were part of the moved block and keep their refs.
  if (
    onMovedSheet &&
    formulaRow >= toRow && formulaRow < toRow + destRowCount &&
    formulaCol >= toCol && formulaCol < toCol + destColCount
  )
    return node;
  const walk = (current: AstNode): AstNode => {
    if (current.kind === 'ref') {
      if (current.sheet && current.sheet.toLowerCase() !== sheetName.toLowerCase()) return current;
      if (
        current.r1 >= fromRow && current.r2 <= fromRowEnd &&
        current.c1 >= fromCol && current.c2 <= fromColEnd
      )
        return { ...current, r1: current.r1 + dr, r2: current.r2 + dr, c1: current.c1 + dc, c2: current.c2 + dc };
      return current;
    }
    switch (current.kind) {
      case 'range':
        return { ...current, start: walk(current.start), end: walk(current.end) };
      case 'union':
        return { ...current, parts: current.parts.map(walk) };
      case 'intersect':
        return { ...current, left: walk(current.left), right: walk(current.right) };
      case 'binary':
        return { ...current, left: walk(current.left), right: walk(current.right) };
      case 'unary':
        return { ...current, operand: walk(current.operand) };
      case 'percent':
        return { ...current, operand: walk(current.operand) };
      case 'paren':
        return { ...current, inner: walk(current.inner) };
      case 'function':
        return { ...current, args: current.args.map(walk) };
      case 'spill':
        return { ...current, ref: walk(current.ref) };
      case 'call':
        return { ...current, callee: walk(current.callee), args: current.args.map(walk) };
      default:
        return current;
    }
  };
  return walk(node);
}

/** Text of a static range reference. */
export function refToText(r1: number, c1: number, r2: number, c2: number, abs = false): string {
  const cell = (row: number, col: number) => `${abs ? '$' : ''}${columnLabel(col)}${abs ? '$' : ''}${row + 1}`;
  return r1 === r2 && c1 === c2 ? cell(r1, c1) : `${cell(r1, c1)}:${cell(r2, c2)}`;
}

export { columnIndex };
export function isErrorLiteral(value: string): boolean {
  return isErrorString(value);
}

/** Merges two static references into a single reference when possible. */
function mergeRange(left: AstNode, right: AstNode): AstNode {
  if (left.kind === 'ref' && right.kind === 'ref' && !left.wholeRow && !right.wholeRow) {
    // `Sheet1!A1:B2` names the sheet once for the whole range, so the sheet of
    // either endpoint belongs to both sides. Only two *different* sheet names
    // (`Sheet1!A1:Sheet2!B2`) keep the range split into two references.
    const sheet = left.sheet ?? right.sheet;
    const sameSheet = (left.sheet ?? '') === (right.sheet ?? '');
    const oneSided = (left.sheet === undefined) !== (right.sheet === undefined);
    if (sameSheet || oneSided) {
      if (sheet !== undefined) {
        if (left.sheet === undefined) left.sheet = sheet;
        if (right.sheet === undefined) right.sheet = sheet;
      }
      left.r2 = right.r2;
      left.c2 = right.c2;
      left.r2Rel = right.r2Rel;
      left.c2Rel = right.c2Rel;
      left.r2Abs = right.r2Abs;
      left.c2Abs = right.c2Abs;
      left.wholeRow = left.wholeRow || right.wholeRow;
      left.wholeCol = left.wholeCol || right.wholeCol;
      left.range = true;
      return left;
    }
  }
  return { kind: 'range', start: left, end: right };
}
