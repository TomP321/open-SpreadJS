/**
 * Formula tokenizer, parser and canonical text renderer.
 *
 * The grammar follows Excel precedence: reference operators bind tightest,
 * followed by negation, percent, exponentiation, multiplication, addition,
 * concatenation and comparisons. `-2^2` therefore parses as `(-2)^2`.
 */
import { isErrorString } from './values.js';

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

/** FormulaParseError is re-exported for callers that want position details. */
import { FormulaParseError } from './errors.js';
export { FormulaParseError };

// ---------------------------------------------------------------------------
// Tokenizer
// ---------------------------------------------------------------------------

type TokenType =
  | 'number'
  | 'string'
  | 'error'
  | 'ident'
  | 'ref'
  | 'colrange'
  | 'rowrange'
  | 'sheet'
  | 'lparen'
  | 'rparen'
  | 'comma'
  | 'semicolon'
  | 'lbrace'
  | 'rbrace'
  | 'colon'
  | 'op'
  | 'percent'
  | 'spill'
  | 'at'
  | 'structured'
  | 'end';

interface Token {
  type: TokenType;
  text: string;
  start: number;
  end: number;
  wsBefore: boolean;
  value?: unknown;
}

const MAX_COL = 16384;
const MAX_ROW = 1048576;

function columnIndex(letters: string): number {
  let col = 0;
  for (const ch of letters.toUpperCase()) {
    col = col * 26 + ch.charCodeAt(0) - 64;
    if (col > MAX_COL) return -1;
  }
  return col - 1;
}
export function columnLabel(col: number): string {
  let label = '';
  for (let n = col + 1; n > 0; n = Math.floor((n - 1) / 26))
    label = String.fromCharCode(65 + ((n - 1) % 26)) + label;
  return label;
}
export function formatSheetName(name: string): string {
  return /^[A-Za-z_][A-Za-z0-9_.]*$/.test(name) ? name : `'${name.replace(/'/g, "''")}'`;
}

const ERROR_LITERALS = [
  '#GETTING_DATA',
  '#DIV/0!',
  '#VALUE!',
  '#SPILL!',
  '#NAME?',
  '#NULL!',
  '#CALC!',
  '#REF!',
  '#NUM!',
  '#N/A',
];

export interface LexOptions {
  r1c1?: boolean;
}

const NUMBER_RE = /(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/y;
const SHEET_RE = /[A-Za-z_\\][A-Za-z0-9_.]*(?:[ \t]+[A-Za-z0-9_.]+)*!/y;
const ROW_RANGE_RE = /\$?(\d+):\$?(\d+)(?![A-Za-z0-9_(])/y;
const COL_RANGE_RE = /(\$?)([A-Za-z]{1,3}):(\$?)([A-Za-z]{1,3})(?![A-Za-z0-9_(])/y;
const CELL_REF_RE = /(\$?)([A-Za-z]{1,3})(\$?)(\d+)(?![A-Za-z0-9_(])/y;
const IDENT_RE = /[A-Za-z_\\\u0080-\uffff][A-Za-z0-9_.\u0080-\uffff]*/y;
const RC_ROW_RANGE_RE = /R(\[-?\d+\]|\d+)?:R(\[-?\d+\]|\d+)?(?![A-Za-z0-9_(])/y;
const RC_COL_RANGE_RE = /C(\[-?\d+\]|\d+)?:C(\[-?\d+\]|\d+)?(?![A-Za-z0-9_(])/y;
const RC_CELL_RE = /R(\[-?\d+\]|\d+)?C(\[-?\d+\]|\d+)?(?![A-Za-z0-9_(])/y;
const RC_ROW_RE = /R(\[-?\d+\]|\d+)?(?![A-Za-z0-9_(])/y;
const RC_COL_RE = /C(\[-?\d+\]|\d+)?(?![A-Za-z0-9_(])/y;
function matchAt(re: RegExp, text: string, pos: number): RegExpExecArray | null {
  re.lastIndex = pos;
  return re.exec(text);
}

class Lexer {
  private pos = 0;
  private readonly tokens: Token[] = [];
  constructor(
    private readonly text: string,
    private readonly options: LexOptions = {},
  ) {}
  tokenize(): Token[] {
    let ws = false;
    while (this.pos < this.text.length) {
      const ch = this.text[this.pos]!;
      if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
        ws = true;
        this.pos++;
        continue;
      }
      const start = this.pos;
      const token = this.scan();
      token.wsBefore = ws;
      ws = false;
      token.start = start;
      token.end = this.pos;
      this.tokens.push(token);
    }
    this.tokens.push({ type: 'end', text: '', start: this.pos, end: this.pos, wsBefore: ws });
    return this.tokens;
  }
  private scan(): Token {
    const text = this.text;
    const ch = text[this.pos]!;
    if (ch === '"') return this.scanString();
    if (ch === '#') {
      for (const literal of ERROR_LITERALS) {
        if (text.startsWith(literal, this.pos)) {
          this.pos += literal.length;
          return { type: 'error', text: literal, start: this.pos, end: this.pos, wsBefore: false, value: literal };
        }
      }
      // A bare '#' is the spill operator (# suffix).
      this.pos++;
      return { type: 'spill', text: ch, start: this.pos, end: this.pos, wsBefore: false };
    }
    if (ch === "'") return this.scanQuotedSheet();
    if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(text[this.pos + 1] ?? ''))) {
      const rowRange = this.scanRowRange();
      if (rowRange) return rowRange;
      return this.scanNumber();
    }
    if (ch === '$' && /[0-9]/.test(text[this.pos + 1] ?? '')) {
      const rowRange = this.scanRowRange();
      if (rowRange) return rowRange;
    }
    if (ch === '$' || /[A-Za-z_\\]/.test(ch) || ch.charCodeAt(0) > 127) {
      const sheet = this.scanSheetPrefix();
      if (sheet) return sheet;
      if (this.options.r1c1) {
        const rc = this.scanR1C1();
        if (rc) return rc;
      } else {
        const range = this.scanColumnRange() ?? this.scanCellRef();
        if (range) return range;
      }
      return this.scanIdent();
    }
    switch (ch) {
      case '(':
        this.pos++;
        return { type: 'lparen', text: ch, start: this.pos, end: this.pos, wsBefore: false };
      case ')':
        this.pos++;
        return { type: 'rparen', text: ch, start: this.pos, end: this.pos, wsBefore: false };
      case ',':
        this.pos++;
        return { type: 'comma', text: ch, start: this.pos, end: this.pos, wsBefore: false };
      case ';':
        this.pos++;
        return { type: 'semicolon', text: ch, start: this.pos, end: this.pos, wsBefore: false };
      case '{':
        this.pos++;
        return { type: 'lbrace', text: ch, start: this.pos, end: this.pos, wsBefore: false };
      case '}':
        this.pos++;
        return { type: 'rbrace', text: ch, start: this.pos, end: this.pos, wsBefore: false };
      case ':':
        this.pos++;
        return { type: 'colon', text: ch, start: this.pos, end: this.pos, wsBefore: false };
      case '%':
        this.pos++;
        return { type: 'percent', text: ch, start: this.pos, end: this.pos, wsBefore: false };
      case '#':
        this.pos++;
        return { type: 'spill', text: ch, start: this.pos, end: this.pos, wsBefore: false };
      case '@':
        this.pos++;
        return { type: 'at', text: ch, start: this.pos, end: this.pos, wsBefore: false };
    }
    let op: string | undefined;
    const next = text[this.pos + 1];
    if (next === '=' || next === '>') {
      const pair = ch + next;
      if (pair === '<=' || pair === '>=' || pair === '<>') op = pair;
    }
    if (!op && '=<> &+-*/^'.includes(ch)) op = ch;
    if (op) {
      this.pos += op.length;
      return { type: 'op', text: op, start: this.pos, end: this.pos, wsBefore: false, value: op };
    }
    throw new FormulaParseError(`Unexpected character ${ch}`, this.pos, text);
  }
  private scanString(): Token {
    const text = this.text;
    const start = this.pos;
    this.pos++;
    let value = '';
    while (this.pos < text.length) {
      const ch = text[this.pos]!;
      if (ch === '"') {
        if (text[this.pos + 1] === '"') {
          value += '"';
          this.pos += 2;
          continue;
        }
        this.pos++;
        return { type: 'string', text: text.slice(start, this.pos), start, end: this.pos, wsBefore: false, value };
      }
      value += ch;
      this.pos++;
    }
    throw new FormulaParseError('Unterminated string literal', start, text);
  }
  private scanQuotedSheet(): Token {
    const text = this.text;
    const start = this.pos;
    this.pos++;
    let name = '';
    while (this.pos < text.length) {
      const ch = text[this.pos]!;
      if (ch === "'") {
        if (text[this.pos + 1] === "'") {
          name += "'";
          this.pos += 2;
          continue;
        }
        this.pos++;
        if (text[this.pos] !== '!') throw new FormulaParseError('Expected ! after sheet name', this.pos, text);
        this.pos++;
        return {
          type: 'sheet',
          text: text.slice(start, this.pos),
          start,
          end: this.pos,
          wsBefore: false,
          value: { name, quoted: true },
        };
      }
      name += ch;
      this.pos++;
    }
    throw new FormulaParseError('Unterminated sheet name', start, text);
  }
  private scanSheetPrefix(): Token | undefined {
    const text = this.text;
    const start = this.pos;
    // Unquoted sheet names may contain spaces; they end at the bang.
    const match = matchAt(SHEET_RE, text, this.pos);
    if (!match) return undefined;
    const raw = match[0];
    if (this.options.r1c1) {
      // R1C1 addresses never contain a bang, so this is always a sheet.
    }
    this.pos += raw.length;
    const name = raw.slice(0, -1).replace(/\s+/g, '');
    return {
      type: 'sheet',
      text: raw,
      start,
      end: this.pos,
      wsBefore: false,
      value: { name, quoted: false },
    };
  }
  private scanNumber(): Token {
    const text = this.text;
    const start = this.pos;
    const match = matchAt(NUMBER_RE, text, this.pos);
    if (!match) throw new FormulaParseError('Invalid number', start, text);
    this.pos += match[0].length;
    return {
      type: 'number',
      text: match[0],
      start,
      end: this.pos,
      wsBefore: false,
      value: Number(match[0]),
    };
  }
  private scanRowRange(): Token | undefined {
    if (this.options.r1c1) return undefined;
    const text = this.text;
    const match = matchAt(ROW_RANGE_RE, text, this.pos);
    if (!match) return undefined;
    const r1 = Number(match[1]),
      r2 = Number(match[2]);
    if (r1 < 1 || r1 > MAX_ROW || r2 < 1 || r2 > MAX_ROW) return undefined;
    this.pos += match[0].length;
    return {
      type: 'rowrange',
      text: match[0],
      start: this.pos,
      end: this.pos,
      wsBefore: false,
      value: { r1: Math.min(r1, r2) - 1, r2: Math.max(r1, r2) - 1, abs1: match[0].startsWith('$'), abs2: match[0].includes(':$') },
    };
  }
  private scanColumnRange(): Token | undefined {
    const text = this.text;
    const match = matchAt(COL_RANGE_RE, text, this.pos);
    if (!match) return undefined;
    const c1 = columnIndex(match[2]!),
      c2 = columnIndex(match[4]!);
    if (c1 < 0 || c2 < 0) return undefined;
    this.pos += match[0].length;
    return {
      type: 'colrange',
      text: match[0],
      start: this.pos,
      end: this.pos,
      wsBefore: false,
      value: {
        c1: Math.min(c1, c2),
        c2: Math.max(c1, c2),
        abs1: match[1] === '$',
        abs2: match[3] === '$',
      },
    };
  }
  private scanCellRef(): Token | undefined {
    const text = this.text;
    const match = matchAt(CELL_REF_RE, text, this.pos);
    if (!match) return undefined;
    const col = columnIndex(match[2]!),
      row = Number(match[4]);
    if (col < 0 || row < 1 || row > MAX_ROW) return undefined;
    this.pos += match[0].length;
    const node = {
      kind: 'ref',
      type: 'ref',
      text: match[0],
      start: this.pos,
      end: this.pos,
      wsBefore: false,
      value: undefined as unknown as Token['value'],
      r1: row - 1,
      c1: col,
      r2: row - 1,
      c2: col,
      r1Rel: match[3] !== '$',
      c1Rel: match[1] !== '$',
      r2Rel: match[3] !== '$',
      c2Rel: match[1] !== '$',
      r1Abs: match[3] === '$',
      c1Abs: match[1] === '$',
      r2Abs: match[3] === '$',
      c2Abs: match[1] === '$',
    };
    node.value = node;
    return node as unknown as Token;
  }
  private scanR1C1(): Token | undefined {
    const text = this.text;
    const rowRange = matchAt(RC_ROW_RANGE_RE, text, this.pos);
    if (rowRange) {
      this.pos += rowRange[0].length;
      return {
        type: 'rowrange',
        text: rowRange[0],
        start: this.pos,
        end: this.pos,
        wsBefore: false,
        value: {
          r1: parseRcPart(rowRange[1]),
          r2: parseRcPart(rowRange[2]),
          rel1: isRelativePart(rowRange[1]),
          rel2: isRelativePart(rowRange[2]),
          abs1: false,
          abs2: false,
          rc: true,
        },
      };
    }
    const colRange = matchAt(RC_COL_RANGE_RE, text, this.pos);
    if (colRange) {
      this.pos += colRange[0].length;
      return {
        type: 'colrange',
        text: colRange[0],
        start: this.pos,
        end: this.pos,
        wsBefore: false,
        value: {
          c1: parseRcPart(colRange[1]),
          c2: parseRcPart(colRange[2]),
          rel1: isRelativePart(colRange[1]),
          rel2: isRelativePart(colRange[2]),
          abs1: false,
          abs2: false,
          rc: true,
        },
      };
    }
    const cell = matchAt(RC_CELL_RE, text, this.pos);
    if (cell) {
      this.pos += cell[0].length;
      return {
        type: 'ref',
        text: cell[0],
        start: this.pos,
        end: this.pos,
        wsBefore: false,
        value: {
          r1: parseRcPart(cell[1]),
          c1: parseRcPart(cell[2]),
          r2: parseRcPart(cell[1]),
          c2: parseRcPart(cell[2]),
          r1Rel: isRelativePart(cell[1]),
          c1Rel: isRelativePart(cell[2]),
          r2Rel: isRelativePart(cell[1]),
          c2Rel: isRelativePart(cell[2]),
          r1Abs: false,
          c1Abs: false,
          r2Abs: false,
          c2Abs: false,
          rc: true,
        },
      };
    }
    const rowOnly = matchAt(RC_ROW_RE, text, this.pos);
    if (rowOnly) {
      this.pos += rowOnly[0].length;
      return {
        type: 'ref',
        text: rowOnly[0],
        start: this.pos,
        end: this.pos,
        wsBefore: false,
        value: {
          r1: parseRcPart(rowOnly[1]),
          c1: 0,
          r2: parseRcPart(rowOnly[1]),
          c2: 0,
          r1Rel: isRelativePart(rowOnly[1]),
          c1Rel: true,
          r2Rel: isRelativePart(rowOnly[1]),
          c2Rel: true,
          r1Abs: false,
          c1Abs: false,
          r2Abs: false,
          c2Abs: false,
          rowOnly: true,
          rc: true,
        },
      };
    }
    const colOnly = matchAt(RC_COL_RE, text, this.pos);
    if (colOnly) {
      this.pos += colOnly[0].length;
      return {
        type: 'ref',
        text: colOnly[0],
        start: this.pos,
        end: this.pos,
        wsBefore: false,
        value: {
          r1: 0,
          c1: parseRcPart(colOnly[1]),
          r2: 0,
          c2: parseRcPart(colOnly[1]),
          r1Rel: true,
          c1Rel: isRelativePart(colOnly[1]),
          r2Rel: true,
          c2Rel: isRelativePart(colOnly[1]),
          r1Abs: false,
          c1Abs: false,
          r2Abs: false,
          c2Abs: false,
          colOnly: true,
          rc: true,
        },
      };
    }
    return undefined;
  }
  private scanIdent(): Token {
    const text = this.text;
    const start = this.pos;
    const match = matchAt(IDENT_RE, text, this.pos);
    if (!match) throw new FormulaParseError('Invalid name', start, text);
    this.pos += match[0].length;
    // Structured reference suffix.
    if (text[this.pos] === '[') {
      const specStart = this.pos;
      let depth = 0;
      while (this.pos < text.length) {
        const ch = text[this.pos]!;
        if (ch === '[') depth++;
        else if (ch === ']') {
          depth--;
          if (depth === 0) {
            this.pos++;
            break;
          }
        }
        this.pos++;
      }
      const spec = text.slice(specStart, this.pos);
      return { type: 'structured', text: match[0] + spec, start, end: this.pos, wsBefore: false, value: { table: match[0], spec } };
    }
    return { type: 'ident', text: match[0], start, end: this.pos, wsBefore: false, value: match[0] };
  }
}

function parseRcPart(part: string | undefined): number {
  if (!part) return 0;
  if (part.startsWith('[')) return Number(part.slice(1, -1));
  return Number(part) - 1;
}
function isRelativePart(part: string | undefined): boolean {
  return !part || part.startsWith('[');
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

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
    return this.tokens[Math.min(this.index + offset, this.tokens.length - 1)]!;
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
    case 'structured':
      return `${node.table}${node.spec}`;
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
    if ((left.sheet ?? '') === (right.sheet ?? '')) {
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
