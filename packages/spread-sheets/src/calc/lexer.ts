/**
 * Formula tokenizer: reference/number/string/operator scanning for the
 * A1 and R1C1 grammars. Moved out of `calc/parser.ts` unchanged;
 * `parser.ts` re-exports the public helpers so existing import paths keep
 * working.
 */

/** FormulaParseError is re-exported for callers that want position details. */
import { FormulaParseError } from './errors.js';
import { looksExternal, splitExternalReference } from '../external-refs.js';
export { FormulaParseError };

// ---------------------------------------------------------------------------
// Tokenizer
// ---------------------------------------------------------------------------

export type TokenType =
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
  | 'external'
  | 'end';

export interface Token {
  type: TokenType;
  text: string;
  start: number;
  end: number;
  wsBefore: boolean;
  value?: unknown;
}

const MAX_COL = 16384;
const MAX_ROW = 1048576;

export function columnIndex(letters: string): number {
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

export class Lexer {
  private pos = 0;
  private readonly tokens: Token[] = [];
  private readonly hasSheetSeparator: boolean;
  private readonly hasRangeSeparator: boolean;
  constructor(
    private readonly text: string,
    private readonly options: LexOptions = {},
  ) {
    this.hasSheetSeparator = text.includes('!');
    this.hasRangeSeparator = text.includes(':');
  }
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
    const code = text.charCodeAt(this.pos);
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
    const nextCode = text.charCodeAt(this.pos + 1);
    if ((code >= 48 && code <= 57) || (ch === '.' && nextCode >= 48 && nextCode <= 57)) {
      const rowRange = this.hasRangeSeparator && this.hasRowRangeStart() ? this.scanRowRange() : undefined;
      if (rowRange) return rowRange;
      return this.scanNumber();
    }
    if (ch === '$' && nextCode >= 48 && nextCode <= 57) {
      const rowRange = this.hasRangeSeparator && this.hasRowRangeStart() ? this.scanRowRange() : undefined;
      if (rowRange) return rowRange;
    }
    if (ch === '$' || (code >= 65 && code <= 90) || (code >= 97 && code <= 122)
      || ch === '_' || ch === '\\' || code > 127) {
      const sheet = this.hasSheetSeparator ? this.scanSheetPrefix() : undefined;
      if (sheet) return sheet;
      if (this.options.r1c1) {
        const rc = this.scanR1C1();
        if (rc) return rc;
      } else {
        const range = (this.hasRangeSeparator && this.hasColumnRangeStart() ? this.scanColumnRange() : undefined)
          ?? this.scanCellRef();
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
      case '[': {
        // Unqualified structured reference `[Column]`: the table is inferred from the formula cell.
        // A bracketed file name is an external workbook reference instead.
        const start = this.pos;
        let depth = 0;
        while (this.pos < text.length) {
          const bracket = text[this.pos]!;
          if (bracket === '[') depth++;
          else if (bracket === ']') {
            depth--;
            if (depth === 0) {
              this.pos++;
              break;
            }
          }
          this.pos++;
        }
        const spec = text.slice(start, this.pos);
        if (!spec.endsWith(']')) throw new FormulaParseError(`Unexpected character ${ch}`, start, text);
        if (looksExternal(spec)) {
          const { name, path } = splitExternalReference(spec);
          return { type: 'external', text: spec, start, end: this.pos, wsBefore: false, value: { file: name, path, spec } };
        }
        return { type: 'structured', text: spec, start, end: this.pos, wsBefore: false, value: { table: '', spec } };
      }
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
  private hasRowRangeStart(): boolean {
    let index = this.pos + (this.text[this.pos] === '$' ? 1 : 0);
    while (index < this.text.length) {
      const code = this.text.charCodeAt(index);
      if (code < 48 || code > 57) break;
      index++;
    }
    return this.text[index] === ':';
  }
  private hasColumnRangeStart(): boolean {
    let index = this.pos + (this.text[this.pos] === '$' ? 1 : 0);
    const start = index;
    while (index - start < 3) {
      const code = this.text.charCodeAt(index) | 32;
      if (code < 97 || code > 122) break;
      index++;
    }
    return index > start && this.text[index] === ':';
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
    const start = this.pos;
    let index = start;
    const colAbs = text[index] === '$';
    if (colAbs) index++;
    const colStart = index;
    let col = 0;
    while (index - colStart < 3) {
      const code = text.charCodeAt(index) | 32;
      if (code < 97 || code > 122) break;
      col = col * 26 + code - 96;
      index++;
    }
    if (index === colStart || col > MAX_COL) return undefined;
    const rowAbs = text[index] === '$';
    if (rowAbs) index++;
    const rowStart = index;
    let row = 0;
    while (index < text.length) {
      const digit = text.charCodeAt(index) - 48;
      if (digit < 0 || digit > 9) break;
      row = row * 10 + digit;
      index++;
    }
    if (index === rowStart || row < 1 || row > MAX_ROW) return undefined;
    const next = text.charCodeAt(index);
    if ((next >= 48 && next <= 57) || (next >= 65 && next <= 90)
      || (next >= 97 && next <= 122) || next === 95 || next === 40) return undefined;
    this.pos = index;
    col--;
    const node = {
      kind: 'ref',
      type: 'ref' as const,
      text: text.slice(start, index),
      start: this.pos,
      end: this.pos,
      wsBefore: false,
      value: undefined as Token['value'], // completed below: a ref token's value is itself
      r1: row - 1,
      c1: col,
      r2: row - 1,
      c2: col,
      r1Rel: !rowAbs,
      c1Rel: !colAbs,
      r2Rel: !rowAbs,
      c2Rel: !colAbs,
      r1Abs: rowAbs,
      c1Abs: colAbs,
      r2Abs: rowAbs,
      c2Abs: colAbs,
    };
    node.value = node;
    return node;
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
