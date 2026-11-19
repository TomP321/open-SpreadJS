/**
 * Cell notes (legacy comments): text, geometry, styling, display mode and
 * serialisation. The comment manager owns one comment per cell.
 */
import { SparseGrid } from './structures.js';
import { serializeValue, deserializeValue, type JsonRecord } from './serialization.js';
import type { Worksheet } from './worksheet.js';
import { Events } from './events.js';
import type { Range } from './primitives.js';
import { Style } from './primitives.js';

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
  private materialized = false;
  private authorId?: string;
  constructor(text = '') {
    this.content = text;
  }
  private prop(key: string, value?: unknown): unknown {
    if (value === undefined) return this.props[key] ?? COMMENT_DEFAULTS[key];
    this.props[key] = value;
    this.explicit.add(key);
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
  /** Clone of the comment including its stored properties and cell position (trial `Comment.prototype.clone`). */
  /**
   * Assigns a stable anonymous author id used when bridging the note into
   * threaded comments (trial exposes `assignId` on `Comment.prototype`).
   */
  assignId(): void {
    this.authorId = `{${(globalThis.crypto?.randomUUID?.() ?? 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx').toUpperCase()}}`;
  }
  clone(): Comment {
    const copy = new Comment(this.content);
    for (const [key, value] of Object.entries(this.props)) copy.props[key] = value;
    copy.explicit = new Set(this.explicit);
    copy.locationValue = { ...this.locationValue };
    copy.locationSet = this.locationSet;
    copy.materialized = this.materialized;
    copy._position(this.row, this.col);
    return copy;
  }
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
  /** Padding of the comment box: reads back exactly what was set (`undefined` when never set). */
  padding(value?: PaddingLike | null): unknown {
    if (value === undefined) return this.props.padding;
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
    };
    // Trial key order (probe f40ct4-comment-padding): the padding sits between the text and the state.
    if (this.props.padding !== undefined) result.padding = serializeValue(this.props.padding);
    result.commentState = Number(this.props.commentState ?? COMMENT_DEFAULTS.commentState);
    result.zIndex = Number(this.props.zIndex ?? COMMENT_DEFAULTS.zIndex);
    for (const [key, value] of Object.entries(this.props)) {
      if (key === 'zIndex' || key === 'commentState' || key === 'padding') continue;
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
  /** Comments created/edited through the UI (or with explicit styling) also serialize into `c`. */
  _materialize(): void {
    this.materialized = true;
  }
  _isMaterialized(): boolean {
    return this.explicit.has('width') || this.explicit.has('height') || this.explicit.has('foreColor') || this.explicit.has('fontFamily') || this.explicit.has('fontStyle') || this.explicit.has('fontSize') || this.explicit.has('fontWeight') || this.explicit.has('displayMode') || this.locationSet;
  }
  /** True when a property was set explicitly (not the built-in default). */
  _explicit(key: string): boolean {
    return this.explicit.has(key);
  }
  /** Serialize into the official sheet `c` record (all defaults present). */
  _toSheetRecord(): JsonRecord {
    const record: JsonRecord = {
      text: this.content,
      visible: this.props.visible === undefined ? true : Boolean(this.props.visible),
      isCostumized: false,
      locked: this.props.locked === undefined ? true : Boolean(this.props.locked),
      aligner: 0,
      hAlign: Number(this.props.horizontalAlign ?? 0),
      vAlign: 0,
    };
    if (this.explicit.has('width')) record.width = Number(this.props.width);
    if (this.explicit.has('height')) record.height = Number(this.props.height);
    if (this.explicit.has('foreColor')) record.fontColor = this.props.foreColor;
    if (this.explicit.has('fontSize')) record.fontSize = Number(this.props.fontSize);
    if (this.explicit.has('fontFamily')) record.fontFamily = this.props.fontFamily;
    if (this.explicit.has('fontStyle')) record.fontStyle = this.props.fontStyle;
    if (this.explicit.has('fontWeight')) record.fontWeight = this.props.fontWeight;
    if (this.explicit.has('displayMode')) record.displayMode = Number(this.props.displayMode);
    if (this.locationSet) record.location = { ...this.locationValue };
    return record;
  }
  /** Load from an official sheet `c` record. */
  _fromSheetRecord(record: JsonRecord): void {
    this.materialized = true;
    this.content = String(record.text ?? '');
    for (const [key, raw] of Object.entries(record)) {
      const value = deserializeValue(raw);
      switch (key) {
        case 'text': break;
        case 'fontColor': this.props.foreColor = value; this.explicit.add('foreColor'); break;
        case 'hAlign': this.props.horizontalAlign = Number(value); this.explicit.add('horizontalAlign'); break;
        case 'aligner': case 'vAlign': this.props[key] = value; break;
        case 'isCostumized': break;
        case 'width': case 'height': this.props[key] = Number(value); this.explicit.add(key); break;
        case 'fontSize': this.props.fontSize = Number(value); this.explicit.add(key); break;
        default: this.props[key] = value; this.explicit.add(key);
      }
    }
    if (record.location) {
      const location = record.location as JsonRecord;
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
/** The padding record a comment accepts: a `Padding` instance or a plain four-side object. */
export interface PaddingLike {
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
}

/**
 * `Comments.Padding`: the reference's four-side holder. Construction stores the sides as own
 * fields (missing sides are 0), and the prototype carries `clone()` and the CSS shorthand
 * `toString()` — trial values from probe f40ct2-padding.
 */
export class Padding implements PaddingLike {
  top: number;
  right: number;
  bottom: number;
  left: number;
  constructor(top?: number, right?: number, bottom?: number, left?: number) {
    this.top = Number(top ?? 0);
    this.right = Number(right ?? 0);
    this.bottom = Number(bottom ?? 0);
    this.left = Number(left ?? 0);
  }
  /** Copy of this padding as a new `Padding` (the reference answers a distinct object). */
  clone(): Padding { return new Padding(this.top, this.right, this.bottom, this.left); }
  /** CSS shorthand: `top right bottom left`, in pixels. */
  toString(): string { return `${this.top}px ${this.right}px ${this.bottom}px ${this.left}px`; }
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
    this.sheet?._invalidate();
    if (this.sheet) this.sheet._emit(Events.CommentChanged, { sheet: this.sheet, sheetName: this.sheet.name(), comment, row, col, propertyName: 'commentState', newValue: comment.commentState() });
  }
  get(row: number, col: number): Comment | null {
    return this.store.get(row, col) ?? null;
  }
  /** Internal: every stored comment with its cell position (used-range scan). */
  *positions(): Generator<[number, number]> {
    for (const [row, col] of this.store.entries()) yield [row, col];
  }
  remove(row: number, col: number): void {
    const comment = this.store.get(row, col);
    if (comment && this.sheet) this.sheet._emit(Events.CommentRemoving, { sheet: this.sheet, sheetName: this.sheet.name(), comment, row, col, cancel: false });
    this.store.set(row, col, undefined);
    this.sheet?._invalidate();
    if (comment && this.sheet) this.sheet._emit(Events.CommentRemoved, { sheet: this.sheet, sheetName: this.sheet.name(), comment, row, col });
  }
  all(): Comment[] {
    return [...this.store.entries()].map(([, , comment]) => comment);
  }
  clear(range?: Range): void {
    if (!range) this.store.clear();
    else for (const [r, c] of this.store.entries()) if (range.contains(r, c)) this.store.set(r, c, undefined);
  }
  _shift(axis: 'row' | 'col', index: number, count: number, remove: boolean, crossStart = Number.NEGATIVE_INFINITY, crossEnd = Number.POSITIVE_INFINITY): void {
    this.store.shift(axis, index, count, remove, crossStart, crossEnd);
    for (const [r, c, comment] of this.store.entries()) comment._position(r, c);
  }
  _hasAny(): boolean {
    return this.store.size > 0;
  }
  /**
   * Bounding cell range of all comments (trial probe `comments:usedrange-json`):
   * `{}` when there is none, `{ minRow, minCol, maxRow, maxCol }` otherwise.
   */
  getUsedRange(): { minRow?: number; minCol?: number; maxRow?: number; maxCol?: number } {
    const out: { minRow?: number; minCol?: number; maxRow?: number; maxCol?: number } = {};
    let any = false;
    for (const [row, col] of this.store.entries()) {
      out.minRow = any ? Math.min(out.minRow!, row) : row;
      out.minCol = any ? Math.min(out.minCol!, col) : col;
      out.maxRow = any ? Math.max(out.maxRow!, row) : row;
      out.maxCol = any ? Math.max(out.maxCol!, col) : col;
      any = true;
    }
    return out;
  }
  /**
   * The comment whose on-screen box contains the given host-relative point,
   * or `null` (trial probe returned `null` for a point over no comment;
   * hit-testing needs the painted comment boxes, so without a view this is null).
   */
  hitTest(x: number, y: number): Comment | null {
    const hit = (this.sheet?._view() as { commentAtPoint?: (x: number, y: number) => Comment | null } | undefined)?.commentAtPoint;
    return hit ? hit(x, y) : null;
  }
  /** Detaches the manager from its sheet and drops all comments (trial exposes `dispose`). */
  dispose(): void {
    this.store.clear();
    this.sheet = undefined;
  }
  /** Serialize into the official nested sheet `c` shape (UI-materialized comments). */
  _toSheetJSON(): JsonRecord {
    const result: JsonRecord = {};
    for (const comment of this.all()) {
      if (!comment._isMaterialized()) continue;
      const byRow = (result[String(comment.rowIndex())] as JsonRecord | undefined) ?? (result[String(comment.rowIndex())] = {});
      byRow[String(comment.colIndex())] = comment._toSheetRecord();
    }
    return result;
  }
  /** Merge official `c` records into (or over) the comments loaded from `comments`. */
  _fromSheetJSON(data: JsonRecord): void {
    for (const [rowKey, byCol] of Object.entries(data ?? {})) {
      for (const [colKey, raw] of Object.entries((byCol as JsonRecord) ?? {})) {
        const row = Number(rowKey), col = Number(colKey);
        const existing = this.get(row, col);
        if (existing) existing._fromSheetRecord(raw as JsonRecord);
        else {
          const comment = new Comment();
          comment._fromSheetRecord(raw as JsonRecord);
          this.set(row, col, comment);
        }
      }
    }
  }
  _styleLike(comment: Comment): Style {
    return Object.assign(new Style(), {
      backColor: comment.backColor() as string,
      foreColor: comment.foreColor() as string,
      font: comment._font(),
    });
  }
}

/**
 * Undo action recording a deleted legacy comment (trial: `Comments` namespace
 * exposes `CommentDeleteUndoAction` with `execute`/`undo`, probe
 * `comments:undo-actions`; constructor arity 2).
 */
export class CommentDeleteUndoAction {
  private row: number;
  private col: number;
  private snapshot: Comment;
  constructor(private sheet: Worksheet, comment: Comment) {
    this.row = comment.rowIndex();
    this.col = comment.colIndex();
    this.snapshot = comment.clone();
  }
  /** Performs the deletion. */
  execute(): boolean {
    this.sheet.comments.remove(this.row, this.col);
    return true;
  }
  /** Restores the deleted comment. */
  undo(): boolean {
    this.sheet.comments.set(this.row, this.col, this.snapshot.clone());
    return true;
  }
}

/**
 * Undo action recording a property change of a legacy comment (trial:
 * `CommentPropertyUndoAction` with `execute`/`undo`/`toJSON`).
 */
export class CommentPropertyUndoAction {
  constructor(private sheet: Worksheet, private state: { row: number; col: number; before: Comment; after: Comment }) {}
  /** Applies the recorded new state. */
  execute(): boolean {
    this.sheet.comments.set(this.state.row, this.state.col, this.state.after.clone());
    return true;
  }
  /** Restores the recorded previous state. */
  undo(): boolean {
    this.sheet.comments.set(this.state.row, this.state.col, this.state.before.clone());
    return true;
  }
  toJSON(): { row: number; col: number; before: JsonRecord; after: JsonRecord } {
    return { row: this.state.row, col: this.state.col, before: this.state.before.toJSON(), after: this.state.after.toJSON() };
  }
}
