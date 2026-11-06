/**
 * Error raised by the formula lexer and parser. `position` is a zero based
 * UTF-16 offset into the original formula text, including any leading '='.
 */
export class FormulaParseError extends SyntaxError {
  readonly position: number;
  readonly end: number;
  readonly formula: string;

  constructor(message: string, position: number, formula = '', end = position + 1) {
    super(`${message} (at position ${position})`);
    this.name = 'FormulaParseError';
    this.position = position;
    this.end = end;
    this.formula = formula;
  }

  /** One based line number of the failure, for multi-line pasted formulas. */
  get line(): number {
    let line = 1;
    for (let i = 0; i < this.position && i < this.formula.length; i++) {
      if (this.formula.charCodeAt(i) === 10) line++;
    }
    return line;
  }

  /** One based column number of the failure. */
  get column(): number {
    const start = this.formula.lastIndexOf('\n', Math.max(0, this.position - 1));
    return this.position - start;
  }
}
