import { SparseGrid } from './structures.js';
import type { JsonRecord } from './serialization.js';
import type { Worksheet } from './model.js';
import type { Range } from './primitives.js';
export class Comment {
  private content: string;
  private row = 0;
  private col = 0;
  private extras: JsonRecord = {};
  constructor(text = '') {
    this.content = text;
  }
  text(): string;
  text(value: string): this;
  text(value?: string): string | this {
    if (value === undefined) return this.content;
    this.content = value;
    return this;
  }
  rowIndex(): number {
    return this.row;
  }
  colIndex(): number {
    return this.col;
  }
  _position(row: number, col: number): void {
    this.row = row;
    this.col = col;
  }
  toJSON(): JsonRecord {
    return {
      rowIndex: this.row,
      colIndex: this.col,
      text: this.content,
      commentState: 3,
      zIndex: 898,
      ...this.extras,
    };
  }
  fromJSON(data: JsonRecord): void {
    this.row = Number(data.rowIndex ?? 0);
    this.col = Number(data.colIndex ?? 0);
    this.content = String(data.text ?? '');
    this.extras = { ...data };
    delete this.extras.text;
    delete this.extras.rowIndex;
    delete this.extras.colIndex;
  }
}
export class CommentManager {
  constructor(private sheet?: Worksheet) {}
  private store = new SparseGrid<Comment>();
  add(row: number, col: number, text: string): Comment {
    const comment = new Comment(text);
    this.set(row, col, comment);
    return comment;
  }
  set(row: number, col: number, comment: Comment): void {
    comment._position(row, col);
    this.store.set(row, col, comment);
  }
  get(row: number, col: number): Comment | null {
    return this.store.get(row, col) ?? null;
  }
  remove(row: number, col: number): void {
    this.store.set(row, col, undefined);
  }
  all(): Comment[] {
    return [...this.store.entries()].map(([, , comment]) => comment);
  }
  clear(range?: Range): void {
    if (!range) this.store.clear();
    else for (const [r, c] of this.store.entries()) if (range.contains(r, c)) this.store.set(r, c, undefined);
  }
  _shift(axis: 'row' | 'col', index: number, count: number, remove: boolean): void {
    this.store.shift(axis, index, count, remove);
    for (const [r, c, comment] of this.store.entries()) comment._position(r, c);
  }
}
