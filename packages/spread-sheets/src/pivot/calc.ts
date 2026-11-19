/**
 * Pivot formula engine (TASK 42 item 1).
 * Small tokenizer/parser/evaluator for the expressions used by pivot
 * calculated fields (`=Amount/454`) and calculated items
 * (`=Buyer[Mom]+Buyer[Dad]`). Field names may contain spaces; references of
 * the form `Field[Item]` address a single item of a source field.
 */

export type CalcValue = number | string | boolean | null | undefined;

export interface CalcContext {
  /** Resolve a bare field reference (data field / source field name). */
  field(name: string): CalcValue;
  /** Resolve `Field[Item]`. */
  item(fieldName: string, item: string): CalcValue;
  /** Called when evaluation produced a division-by-zero or invalid value. */
  error?(message?: string): CalcValue;
}

type Node =
  | { kind: 'num'; value: number }
  | { kind: 'str'; value: string }
  | { kind: 'bool'; value: boolean }
  | { kind: 'name'; value: string }
  | { kind: 'item'; field: string; item: string }
  | { kind: 'unary'; op: string; operand: Node }
  | { kind: 'binary'; op: string; left: Node; right: Node }
  | { kind: 'call'; name: string; args: Node[] };

const OPERATORS = new Set(['+', '-', '*', '/', '^', '(', ')', ',', '=', '<', '>', '<=', '>=', '<>', '&']);

function tokenize(source: string): string[] {
  const tokens: string[] = [];
  let i = 0;
  const push = (token: string): void => { tokens.push(token); };
  while (i < source.length) {
    const ch = source[i]!;
    if (/\s/.test(ch)) { i++; continue; }
    if (ch === '"') {
      const end = source.indexOf('"', i + 1);
      push(source.slice(i, end < 0 ? source.length : end + 1));
      i = end < 0 ? source.length : end + 1;
      continue;
    }
    if (ch === '[') {
      const end = source.indexOf(']', i + 1);
      push(source.slice(i, end < 0 ? source.length : end + 1));
      i = end < 0 ? source.length : end + 1;
      continue;
    }
    if (ch === '<' || ch === '>') {
      const next = source[i + 1];
      if (next === '=' || (ch === '<' && next === '>')) { push(source.slice(i, i + 2)); i += 2; continue; }
      push(ch); i++; continue;
    }
    if (OPERATORS.has(ch)) { push(ch); i++; continue; }
    // number: digits with an optional decimal part (leading dot counts as operator)
    const num = /^\d+(\.\d+)?([eE][+-]?\d+)?/.exec(source.slice(i));
    if (num && /^[.+\-*/^(),=&<>]/.test(tokens.length ? tokens[tokens.length - 1]! : '+')) {
      push(num[0]); i += num[0].length; continue;
    }
    // name: everything up to the next operator / bracket / quote
    let end = i;
    while (end < source.length && !/[\s()[\]+\-*/^,=&<>"]/.test(source[end]!)
      && !(source[end] === '.' && /\d/.test(source[end + 1] ?? '')) && !(source[end] === '.' && /[eE]/.test(source[end + 1] ?? ''))) end++;
    if (end === i) end = i + 1;
    let name = source.slice(i, end);
    // allow internal spaces in names (e.g. `Sum of Amount`): absorb
    // `word word` while the next chunk still starts an identifier and the
    // accumulated text is not a complete reference before an operator.
    while (end < source.length && /\s/.test(source[end]!)) {
      let probe = end;
      while (probe < source.length && /\s/.test(source[probe]!)) probe++;
      let word = probe;
      while (word < source.length && !/[\s()[\]+\-*/^,=&<>"]/.test(source[word]!)) word++;
      const chunk = source.slice(probe, word);
      if (!chunk || /^(TRUE|FALSE)$/.test(chunk.toUpperCase()) && false) break;
      if (source[probe] === '"') break;
      // stop absorbing when the chunk is clearly a fresh operand after an operator chain
      if (/[+\-*/^=(,<>&]$/.test(tokens.length ? tokens[tokens.length - 1]! : '')) break;
      // keep absorbing only if the chunk starts an identifier (letters/#)
      if (!/[A-Za-z_$\u0080-\uFFFF]/.test(chunk[0] ?? ' ')) break;
      // A following `(` means a function call — never merge with a previous name.
      if (/^\s*\(/.test(source.slice(word))) { if (name) break; }
      name += ' ' + chunk;
      end = word;
    }
    push(name);
    i = end;
  }
  return tokens;
}

class Parser {
  private pos = 0;
  constructor(private tokens: string[]) { }
  private peek(): string | undefined { return this.tokens[this.pos]; }
  private next(): string { return this.tokens[this.pos++]!; }

  parse(): Node {
    const node = this.expression();
    return node;
  }

  private expression(): Node {
    let left = this.comparison();
    while (this.peek() === '<>') { this.next(); left = { kind: 'binary', op: '<>', left, right: this.comparison() }; }
    return left;
  }

  private comparison(): Node {
    let left = this.concat();
    for (;;) {
      const op = this.peek();
      if (op === '=' || op === '<' || op === '>') { this.next(); left = { kind: 'binary', op, left, right: this.concat() }; }
      else break;
    }
    return left;
  }

  private concat(): Node {
    let left = this.additive();
    while (this.peek() === '&') { this.next(); left = { kind: 'binary', op: '&', left, right: this.additive() }; }
    return left;
  }

  private additive(): Node {
    let left = this.multiplicative();
    for (;;) {
      const op = this.peek();
      if (op === '+' || op === '-') { this.next(); left = { kind: 'binary', op, left, right: this.multiplicative() }; }
      else break;
    }
    return left;
  }

  private multiplicative(): Node {
    let left = this.power();
    for (;;) {
      const op = this.peek();
      if (op === '*' || op === '/') { this.next(); left = { kind: 'binary', op, left, right: this.power() }; }
      else break;
    }
    return left;
  }

  private power(): Node {
    const left = this.unary();
    if (this.peek() === '^') { this.next(); return { kind: 'binary', op: '^', left, right: this.power() }; }
    return left;
  }

  private unary(): Node {
    if (this.peek() === '-') { this.next(); return { kind: 'unary', op: '-', operand: this.unary() }; }
    if (this.peek() === '+') { this.next(); return this.unary(); }
    return this.postfix();
  }

  private postfix(): Node {
    let node = this.primary();
    // trailing percent (Excel style): 50% = 0.5
    while (this.peek() === '%') { this.next(); node = { kind: 'binary', op: '/', left: node, right: { kind: 'num', value: 100 } }; }
    return node;
  }

  private primary(): Node {
    const token = this.peek();
    if (token === undefined) return { kind: 'num', value: 0 };
    if (token === '(') { this.next(); const inner = this.expression(); if (this.peek() === ')') this.next(); return inner; }
    if (/^\d/.test(token)) { this.next(); return { kind: 'num', value: Number(token) }; }
    if (token.startsWith('"')) { this.next(); return { kind: 'str', value: token.slice(1, -1) }; }
    const upper = token.toUpperCase();
    if (upper === 'TRUE' || upper === 'FALSE') { this.next(); return { kind: 'bool', value: upper === 'TRUE' }; }
    this.next();
    if (this.peek() === '(') {
      this.next();
      const args: Node[] = [];
      if (this.peek() !== ')') {
        do { args.push(this.expression()); } while (this.nextIf(','));
      }
      this.nextIf(')');
      return { kind: 'call', name: token.trim(), args };
    }
    if (this.peek()?.startsWith('[')) {
      const bracket = this.next().slice(1, -1);
      return { kind: 'item', field: token.trim(), item: bracket };
    }
    return { kind: 'name', value: token.trim() };
  }

  private nextIf(token: string): boolean {
    if (this.peek() === token) { this.next(); return true; }
    return false;
  }
}

export function parseCalcFormula(formula: string): Node | undefined {
  if (formula === undefined || formula === null) return undefined;
  const trimmed = String(formula).trim().replace(/^=/, '');
  if (!trimmed) return undefined;
  const tokens = tokenize(trimmed);
  if (!tokens.length) return undefined;
  try {
    return new Parser(tokens).parse();
  } catch {
    return undefined;
  }
}

/** Field references used by the expression (bare names), for dependency checks. */
export function calcFormulaFieldNames(formula: string): string[] {
  const node = parseCalcFormula(formula);
  const out = new Set<string>();
  const walk = (n: Node | undefined): void => {
    if (!n) return;
    switch (n.kind) {
      case 'name': out.add(n.value); break;
      case 'item': out.add(n.field); break;
      case 'unary': walk(n.operand); break;
      case 'binary': walk(n.left); walk(n.right); break;
      case 'call': n.args.forEach(walk); break;
      default: break;
    }
  };
  walk(node);
  return [...out];
}

function toNumber(value: CalcValue): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return value;
  if (typeof value === 'boolean') return value ? 1 : 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : NaN;
}

function callFunction(name: string, args: CalcValue[], ctx: CalcContext): CalcValue {
  const nums = args.map(toNumber);
  const flat = args.filter(a => typeof a === 'number' && Number.isFinite(a)) as number[];
  switch (name.toUpperCase()) {
    case 'IF': return toNumber(args[0]) !== 0 ? (args[1] ?? null) : (args[2] ?? null);
    case 'AND': return nums.every(n => n !== 0);
    case 'OR': return nums.some(n => n !== 0);
    case 'NOT': return !(toNumber(args[0]) !== 0);
    case 'SUM': return flat.reduce((s, v) => s + v, 0);
    case 'AVERAGE': case 'AVERAGEA': return flat.length ? flat.reduce((s, v) => s + v, 0) / flat.length : ctx.error?.('#DIV/0!') ?? null;
    case 'COUNT': return args.filter(a => typeof a === 'number').length;
    case 'MIN': return flat.length ? Math.min(...flat) : 0;
    case 'MAX': return flat.length ? Math.max(...flat) : 0;
    case 'ABS': return Math.abs(nums[0] ?? 0);
    case 'ROUND': {
      const digits = Math.trunc(nums[1] ?? 0);
      const factor = 10 ** digits;
      return Math.round((nums[0] ?? 0) * factor) / factor;
    }
    case 'INT': return Math.floor(nums[0] ?? 0);
    case 'MOD': {
      const [a, b] = nums;
      if (!b) return ctx.error?.('#DIV/0!') ?? null;
      return a! - Math.floor(a! / b!) * b!;
    }
    case 'PI': return Math.PI;
    case 'SQRT': return Math.sqrt(nums[0] ?? 0);
    case 'ISERROR': case 'ISERR': {
      const v = args[0];
      return typeof v === 'string' && /^#(DIV\/0!|REF!|VALUE!|NAME\?|NUM!|\?)/.test(v);
    }
    default: return ctx.error?.('#NAME?') ?? null;
  }
}

export function evaluateCalcNode(node: Node, ctx: CalcContext): CalcValue {
  switch (node.kind) {
    case 'num': return node.value;
    case 'str': return node.value;
    case 'bool': return node.value;
    case 'name': return ctx.field(node.value);
    case 'item': return ctx.item(node.field, node.item);
    case 'unary': return -toNumber(evaluateCalcNode(node.operand, ctx));
    case 'call': return callFunction(node.name, node.args.map(arg => evaluateCalcNode(arg, ctx)), ctx);
    case 'binary': {
      const left = evaluateCalcNode(node.left, ctx);
      const right = evaluateCalcNode(node.right, ctx);
      switch (node.op) {
        case '+': return toNumber(left) + toNumber(right);
        case '-': return toNumber(left) - toNumber(right);
        case '*': return toNumber(left) * toNumber(right);
        case '/': {
          const divisor = toNumber(right);
          if (!divisor) return ctx.error?.('#DIV/0!') ?? null;
          return toNumber(left) / divisor;
        }
        case '^': return toNumber(left) ** toNumber(right);
        case '&': return String(left ?? '') + String(right ?? '');
        case '=': return looseEqual(left, right);
        case '<>': return !looseEqual(left, right);
        case '<': return compareValues(left, right) < 0;
        case '>': return compareValues(left, right) > 0;
        case '<=': return compareValues(left, right) <= 0;
        case '>=': return compareValues(left, right) >= 0;
        default: return null;
      }
    }
    default: return null;
  }
}

function looseEqual(a: CalcValue, b: CalcValue): boolean {
  if (typeof a === 'number' || typeof b === 'number') return toNumber(a) === toNumber(b);
  return String(a ?? '').toLowerCase() === String(b ?? '').toLowerCase();
}

function compareValues(a: CalcValue, b: CalcValue): number {
  if (typeof a === 'number' || typeof b === 'number') return toNumber(a) - toNumber(b);
  const as = String(a ?? ''), bs = String(b ?? '');
  return as < bs ? -1 : as > bs ? 1 : 0;
}

/** Parse + evaluate a stored formula string. */
export function evaluateCalcFormula(formula: string, ctx: CalcContext): CalcValue {
  const node = parseCalcFormula(formula);
  if (!node) return null;
  return evaluateCalcNode(node, ctx);
}
