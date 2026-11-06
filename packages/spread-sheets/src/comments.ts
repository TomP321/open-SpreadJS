/**
 * Cell notes (legacy comments): text, geometry, styling, display mode and
 * serialisation. The comment manager owns one comment per cell.
 */
import { SparseGrid } from './structures.js';
import { serializeValue, deserializeValue, type JsonRecord } from './serialization.js';
import type { Worksheet } from './model.js';
import { Events } from './events.js';
import type { Range, Style } from './primitives.js';

const COMMENT_DEFAULTS: JsonRecord = {
  width: 160,
  height: 100,
  autoSize: false,
  backColor: '#FFFFE1',
  foreColor: 'black',
  borderColor: '#000000',
  borderStyle: 'solid',
  borderWidth: 1,
  fontFamily: 'Arial',
  fontSize: '9pt',
  fontStyle: 'normal',
  fontWeight: 'normal',
  textDecoration: 0,
  horizontalAlign: 0,
  opacity: 1,
  showShadow: false,
  locked: true,
  lockText: true,
  dynamicMove: false,
  dynamicSize: false,
  zIndex: 898,
  indicatorColor: 'red',
  indicatorSize: 6,
  displayMode: 2,
  commentState: 3,
};

export class Comment {
  private content: string;
  private row = 0;
  private col = 0;
  private props: JsonRecord = {};
  private locationValue = { x: 9, y: -18 };
  private locationSet = false;
  private explicit = new Set<string>();
  constructor(text = '') {
    this.content = text;
  }
  private prop(key: string, value?: unknown): unknown {
    if (value === undefined) return this.props[key] ?? COMMENT_DEFAULTS[key];
    this.props[key] = value;
    return this;
  }
  text(): string;
  text(value: string): this;
  text(value?: string): string | this {
    if (value === undefined) return this.content;
    this.content = value;
    return this;
  }
  rowIndex(): number { return this.row; }
  colIndex(): number { return this.col; }
  _position(row: number, col: number): void { this.row = row; this.col = col; }
  autoSize(value?: boolean): unknown { return this.prop('autoSize', value); }
  backColor(value?: string): unknown { return this.prop('backColor', value); }
  borderColor(value?: string): unknown { return this.prop('borderColor', value); }
  borderStyle(value?: string): unknown { return this.prop('borderStyle', value); }
  borderWidth(value?: number): unknown { return this.prop('borderWidth', value); }
  commentState(value?: number): number | this {
    if (value === undefined) return Number(this.props.commentState ?? COMMENT_DEFAULTS.commentState);
    this.props.commentState = value;
    return this;
  }
  displayMode(value?: number): number | this {
    if (value === undefined) return Number(this.props.displayMode ?? COMMENT_DEFAULTS.displayMode);
    this.props.displayMode = value;
    return this;
  }
  dynamicMove(value?: boolean): unknown { return this.prop('dynamicMove', value); }
  dynamicSize(value?: boolean): unknown { return this.prop('dynamicSize', value); }
  fontFamily(value?: string): unknown { return this.prop('fontFamily', value); }
  fontSize(value?: string): unknown { return this.prop('fontSize', value); }
  fontStyle(value?: string): unknown { return this.prop('fontStyle', value); }
  fontWeight(value?: string): unknown { return this.prop('fontWeight', value); }
  foreColor(value?: string): unknown { return this.prop('foreColor', value); }
  height(value?: number): unknown { return this.prop('height', value); }
  horizontalAlign(value?: number): unknown { return this.prop('horizontalAlign', value); }
  indicatorColor(value?: string): unknown { return this.prop('indicatorColor', value); }
  indicatorSize(value?: number): unknown { return this.prop('indicatorSize', value); }
  location(value?: { x: number; y: number }): { x: number; y: number } | this {
    if (value === undefined) return { ...this.locationValue };
    this.locationValue = { x: Number(value.x), y: Number(value.y) };
    this.locationSet = true;
    return this;
  }
  locked(value?: boolean): unknown { return this.prop('locked', value); }
  lockText(value?: boolean): unknown { return this.prop('lockText', value); }
  opacity(value?: number): unknown { return this.prop('opacity', value); }
  padding(value?: { top?: number; right?: number; bottom?: number; left?: number } | null): unknown {
    if (value === undefined) return this.props.padding ?? null;
    this.props.padding = value;
    return this;
  }
  showShadow(value?: boolean): unknown { return this.prop('showShadow', value); }
  textDecoration(value?: number): unknown { return this.prop('textDecoration', value); }
  width(value?: number): unknown { return this.prop('width', value); }
  zIndex(value?: number): unknown { return this.prop('zIndex', value); }
  toJSON(): JsonRecord {
    const result: JsonRecord = {
      rowIndex: this.row,
      colIndex: this.col,
      text: this.content,
      commentState: Number(this.props.commentState ?? COMMENT_DEFAULTS.commentState),
      zIndex: Number(this.props.zIndex ?? COMMENT_DEFAULTS.zIndex),
    };
    for (const [key, value] of Object.entries(this.props)) {
      if (key === 'zIndex' || key === 'commentState') continue;
      if (key === 'dynamicMove' || key === 'dynamicSize' || key === 'fontSize') continue;
      if (value === COMMENT_DEFAULTS[key] && key !== 'width' && !this.explicit.has(key)) continue;
      result[key] = serializeValue(value);
    }
    if (this.locationSet) result.location = { ...this.locationValue };
    return result;
  }
  fromJSON(data: JsonRecord): void {
    this.row = Number(data.rowIndex ?? 0);
    this.col = Number(data.colIndex ?? 0);
    this.content = String(data.text ?? '');
    this.props = {};
    this.explicit.clear();
    for (const [key, value] of Object.entries(data)) {
      if (['text', 'rowIndex', 'colIndex', 'location'].includes(key)) continue;
      this.props[key] = deserializeValue(value);
      this.explicit.add(key);
    }
    if (data.location) {
      const location = data.location as JsonRecord;
      this.locationValue = { x: Number(location.x ?? 9), y: Number(location.y ?? -18) };
      this.locationSet = true;
    }
  }
  /** Comment box font shorthand for the renderer. */
  _font(): string {
    return `${String(this.prop('fontStyle'))} ${String(this.prop('fontWeight'))} ${String(this.prop('fontSize'))} ${String(this.prop('fontFamily'))}`;
  }
  _padding(): { top: number; right: number; bottom: number; left: number } {
    const padding = this.props.padding as JsonRecord | undefined;
    return {
      top: Number(padding?.top ?? 4),
      right: Number(padding?.right ?? 4),
      bottom: Number(padding?.bottom ?? 4),
      left: Number(padding?.left ?? 4),
    };
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
  toJSON(): JsonRecord[] {
    return this.all().map((comment) => comment.toJSON());
  }
  set(row: number, col: number, comment: Comment): void {
    comment._position(row, col);
    this.store.set(row, col, comment);
    const entries = [...this.store.entries()];
    entries.forEach(([, , item], index) => item.zIndex(898 - (entries.length - 1 - index)));
    if (this.sheet) this.sheet._emit(Events.CommentChanged, { sheet: this.sheet, sheetName: this.sheet.name(), comment, row, col });
  }
  get(row: number, col: number): Comment | null {
    return this.store.get(row, col) ?? null;
  }
  remove(row: number, col: number): void {
    const comment = this.store.get(row, col);
    if (comment && this.sheet) this.sheet._emit(Events.CommentRemoving, { sheet: this.sheet, sheetName: this.sheet.name(), comment, row, col, cancel: false });
    this.store.set(row, col, undefined);
    if (comment && this.sheet) this.sheet._emit(Events.CommentRemoved, { sheet: this.sheet, sheetName: this.sheet.name(), comment, row, col });
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
  _hasAny(): boolean {
    return this.store.size > 0;
  }
  _styleLike(comment: Comment): Style {
    return {
      backColor: comment.backColor() as string,
      foreColor: comment.foreColor() as string,
      font: comment._font(),
    } as unknown as Style;
  }
}
