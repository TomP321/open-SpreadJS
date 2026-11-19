/**
 * Threaded comments: one thread per cell, each thread holding ordered replies.
 * Reply bodies are content blocks (text / mention / link). The manager owns the
 * per-sheet threads and serialises them in the official `threadedComments`
 * shape: { "<row>": { "<col>": { replies: [...], resolved: boolean } } }.
 */
import type { Worksheet } from './worksheet.js';
import { UserManager } from './user-manager.js';
import { Events } from './events.js';
import type { Range } from './primitives.js';
import type { JsonRecord } from './serialization.js';

/** Type of a threaded-comment content block. */
export enum ContentType {
  text = 0,
  mention = 1,
  link = 2,
}

/**
 * Thread list filter kinds exposed by the trial panel runtime
 * (probe `tc:extras`: `{None:0, MentionsMe:1, ActiveOnly:2, ResolvedOnly:4}`).
 */
export enum ThreadedCommentFilterType {
  None = 0,
  MentionsMe = 1,
  ActiveOnly = 2,
  ResolvedOnly = 4,
}

export interface ITextBlock { type: ContentType.text; value: string; }
export interface IMentionBlock { type: ContentType.mention; userId: string; }
export interface ILinkBlock { type: ContentType.link; href: string; text: string; }
export type IContentBlock = ITextBlock | IMentionBlock | ILinkBlock;

export interface IReply {
  message: IContentBlock[];
  createdAt: Date;
  authorId: string;
}

/** Convert a list of content blocks into the plain text shown by the UI. */
export function blocksToText(blocks: IContentBlock[]): string {
  return (blocks ?? [])
    .map((block) => {
      if (block.type === ContentType.mention) return `@${mentionDisplayName(block.userId)}`;
      if (block.type === ContentType.link) return block.text ?? block.href ?? '';
      return block.value ?? '';
    })
    .join('');
}

/** Wrap plain text as a single text content block list. */
export function textToBlocks(text: string): IContentBlock[] {
  return [{ type: ContentType.text, value: text }];
}

function mentionDisplayName(userId: string): string {
  const user = resolveCachedUser(userId);
  return user?.name ?? userId;
}

/** Best-effort synchronous user name lookup (UserManager async cache). */
const userCache = new Map<string, { id: string; name: string; color?: string }>();
export function _cacheUser(user: { id: string; name: string; color?: string }): void {
  userCache.set(user.id, user);
}
export function resolveCachedUser(userId: string): { id: string; name: string; color?: string } | undefined {
  return userCache.get(userId);
}

/** Avatar background colors assigned to users in first-seen order. */
const USER_COLORS = ['#26a69a', '#5c8ae6', '#ffb54d', '#e06c75', '#7cc47f', '#b48ead', '#56b6c2', '#d19a66'];
const userColorIndex = new Map<string, number>();
export function userColor(userId: string): string {
  let index = userColorIndex.get(userId);
  if (index === undefined) userColorIndex.set(userId, (index = userColorIndex.size % USER_COLORS.length));
  return USER_COLORS[index] ?? '#26a69a';
}

function serializeReply(reply: IReply): JsonRecord {
  return {
    createdAt: reply.createdAt instanceof Date ? reply.createdAt.toISOString() : String(reply.createdAt ?? ''),
    authorId: reply.authorId ?? '',
    message: (reply.message ?? []).map((block) => ({ ...block })),
  };
}

function deserializeReply(raw: JsonRecord): IReply {
  const createdAt = raw.createdAt instanceof Date ? raw.createdAt : new Date(String(raw.createdAt ?? Date.now()));
  return {
    createdAt,
    authorId: String(raw.authorId ?? ''),
    message: (raw.message as IContentBlock[] | undefined)?.map((block) => ({ ...block })) ?? [],
  };
}

/** True when the message mentions `userId`; used for @mentions events. */
export function mentionsUser(blocks: IContentBlock[], userId: string): boolean {
  return (blocks ?? []).some((block) => block.type === ContentType.mention && block.userId === userId);
}

function newAuthorId(): string {
  return `{${(
    globalThis.crypto?.randomUUID?.() ??
    'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const n = Math.floor(Math.random() * 16);
      return (c === 'x' ? n : (n & 3) | 8).toString(16);
    })
  ).toUpperCase()}}`;
}

/**
 * A threaded-comment reply object (trial exposes a `Reply` class with
 * assignId/clone/fromJSON/toJSON; probe `tc:reply-shape` shows the reply
 * instances carry `authorId`, `createdAt` and `message`).
 */
export class Reply {
  message: IContentBlock[] = [];
  createdAt: Date = new Date();
  authorId = '';

  /** (Re-)assigns the author id, optionally to a given id. */
  assignId(id?: string): void {
    this.authorId = typeof id === 'string' && id ? id : newAuthorId();
  }

  clone(): Reply {
    const copy = new Reply();
    copy.message = this.message.map((block) => cloneContentBlock(block));
    copy.createdAt = this.createdAt;
    copy.authorId = this.authorId;
    return copy;
  }

  fromJSON(data: JsonRecord): void {
    const parsed = deserializeReply(data);
    this.message = parsed.message;
    this.createdAt = parsed.createdAt;
    this.authorId = parsed.authorId;
  }

  toJSON(): JsonRecord {
    return serializeReply(this);
  }
}

/**
 * Clones a content block keeping only the fields valid for its type
 * (trial probe `tc:conv`: `{type:0,value:'v'}` stays complete, the unknown
 * `text` field on a type-1 block is dropped).
 */
export function cloneContentBlock(block: IContentBlock): IContentBlock {
  if (!block || typeof block !== 'object') return block;
  const kind = Number((block as { type?: number }).type);
  switch (kind) {
    case ContentType.text: {
      const value = (block as ITextBlock).value;
      return value !== undefined ? { type: ContentType.text, value: String(value) } : { type: ContentType.text } as unknown as IContentBlock;
    }
    case ContentType.mention: {
      const userId = (block as IMentionBlock).userId;
      return userId !== undefined ? { type: ContentType.mention, userId: String(userId) } : { type: ContentType.mention } as unknown as IContentBlock;
    }
    case ContentType.link: {
      const out: { type: ContentType.link; href?: string; text?: string } = { type: ContentType.link };
      if ((block as ILinkBlock).href !== undefined) out.href = String((block as ILinkBlock).href);
      if ((block as ILinkBlock).text !== undefined) out.text = String((block as ILinkBlock).text);
      return out as unknown as IContentBlock;
    }
    default: return { type: kind } as unknown as IContentBlock;
  }
}

/**
 * Converts classic (SJS note) comment data into the threaded reply shape
 * (trial probe `tc:conv`: converting a classic note yields `{message:[], createdAt:null}` -
 * the note text is not part of the threaded blocks in the trial).
 */
export function fromSJSThreadedComment(commentData: JsonRecord): { message: IContentBlock[]; createdAt: Date | null } {
  const raw = (commentData ?? {}) as JsonRecord;
  return {
    message: Array.isArray(raw.message) ? (raw.message as IContentBlock[]).map(cloneContentBlock) : [],
    createdAt: raw.createdAt instanceof Date ? raw.createdAt : raw.createdAt === undefined || raw.createdAt === null ? null : new Date(String(raw.createdAt)),
  };
}

/**
 * Converts a threaded comment (instance or serialized data) back toward the
 * classic record shape using a legacy-user id map (`context.idToUUIDMap`),
 * mirroring the purpose of the trial helper (the trial throws without a
 * context; ours degrades to an empty map).
 */
export function toSJSThreadedComment(comment: ThreadedComment | JsonRecord, context?: { idToUUIDMap?: Record<string, string> }): JsonRecord {
  const data = (comment instanceof ThreadedComment ? comment.toJSON() : comment ?? {}) as JsonRecord;
  const map = context?.idToUUIDMap ?? {};
  const replies = Array.isArray(data.replies) ? data.replies as JsonRecord[] : [];
  const first = replies[0];
  const authorId = String(first?.authorId ?? '');
  return {
    author: map[authorId] ?? authorId,
    createdAt: first?.createdAt ?? null,
    text: first ? blocksToText(((first.message ?? []) as IContentBlock[])) : '',
    resolved: Boolean(data.resolved),
  };
}

/** Normalizes any reply-like value into a plain `IReply` (trial helper exposed on the namespace). */
export function replyToIReply(reply: Partial<IReply> | IReply | undefined): IReply {
  return {
    message: ((reply?.message ?? []) as IContentBlock[]).map(cloneContentBlock),
    createdAt: reply?.createdAt instanceof Date ? reply.createdAt : new Date(),
    authorId: String(reply?.authorId ?? ''),
  };
}

/** The visible text of a reply (trial helper name; used for legacy comment bridging). */
export function replyToCapabilityCommentText(reply: Partial<IReply> | IReply): string {
  return blocksToText(((reply?.message ?? []) as IContentBlock[]));
}

export class ThreadedComment {
  private replies: IReply[] = [];
  private resolvedValue = false;
  private rowValue = 0;
  private colValue = 0;
  _manager?: ThreadedCommentManager;

  /** Add a reply. Missing authorId/createdAt default to the current user and now. */
  add(reply?: Partial<IReply> | string): IReply | null {
    const manager = this._manager;
    const full: IReply = typeof reply === 'string' || reply === undefined
      ? { message: textToBlocks(typeof reply === 'string' ? reply : ''), createdAt: new Date(), authorId: manager?._currentUser() ?? '' }
      : {
        message: reply.message ?? [],
        createdAt: reply.createdAt instanceof Date ? reply.createdAt : new Date(),
        authorId: reply.authorId ?? manager?._currentUser() ?? '',
      };
    if (manager) {
      const args = manager._changingArgs(this, 'reply', this.replies.length, full, undefined);
      manager._fireChanging(args);
      if (args.cancel) return null;
    }
    this.replies.push(full);
    manager?._fireChanged(this._manager ? manager._changingArgs(this, 'reply', this.replies.length - 1, full, undefined) : undefined);
    manager?._notifyMentions(full.message, this);
    return full;
  }

  /** Get all replies, or append the given replies and return the full list. */
  all(replies?: IReply[]): IReply[] {
    if (replies) for (const reply of replies) this.add(reply);
    return this.replies;
  }

  col(): number { return this.colValue; }
  row(): number { return this.rowValue; }
  _position(row: number, col: number): void { this.rowValue = row; this.colValue = col; }

  get(index: number): IReply | undefined {
    return this.replies[index];
  }

  remove(index: number): IReply | null {
    if (index < 0 || index >= this.replies.length) return null;
    const manager = this._manager;
    const removed = this.replies[index];
    const args = manager?._changingArgs(this, 'reply', index, undefined, removed);
    if (args) manager?._fireChanging(args);
    if (args?.cancel) return null;
    this.replies.splice(index, 1);
    if (args) manager?._fireChanged(manager._changingArgs(this, 'reply', index, undefined, removed));
    return removed;
  }

  resolved(): boolean;
  resolved(resolved: boolean): boolean;
  resolved(resolved?: boolean): boolean {
    if (resolved === undefined) return this.resolvedValue;
    const next = Boolean(resolved);
    if (next === this.resolvedValue) return this.resolvedValue;
    const manager = this._manager;
    const args = manager?._changingArgs(this, 'resolved', -1, next, this.resolvedValue);
    if (args) manager?._fireChanging(args);
    if (args?.cancel) return this.resolvedValue;
    this.resolvedValue = next;
    if (args) manager?._fireChanged(manager._changingArgs(this, 'resolved', -1, next, !next));
    manager?._invalidate();
    return this.resolvedValue;
  }

  /**
   * Re-assigns fresh author ids to the thread replies (trial exposes
   * `assignId()`; probe `tc:flow` shows it is a no-op for empty threads).
   */
  assignId(): void {
    for (const reply of this.replies) reply.authorId = newAuthorId();
  }

  set(index: number, reply: Partial<IReply>): void {
    if (index < 0 || index >= this.replies.length) return;
    const manager = this._manager;
    const old = this.replies[index];
    const next: IReply = {
      message: reply.message ?? [],
      createdAt: reply.createdAt ?? old.createdAt,
      authorId: reply.authorId ?? old.authorId,
    };
    const args = manager?._changingArgs(this, 'reply', index, next, old);
    if (args) manager?._fireChanging(args);
    if (args?.cancel) return;
    this.replies[index] = next;
    if (args) manager?._fireChanged(manager._changingArgs(this, 'reply', index, next, old));
    manager?._notifyMentions(next.message, this);
  }

  clone(): ThreadedComment {
    const copy = new ThreadedComment();
    copy.replies = this.replies.map((reply) => ({ ...reply, message: reply.message.map((block) => ({ ...block })) }));
    copy.resolvedValue = this.resolvedValue;
    copy.rowValue = this.rowValue;
    copy.colValue = this.colValue;
    copy._manager = this._manager;
    return copy;
  }

  toJSON(): JsonRecord {
    return { replies: this.replies.map(serializeReply), resolved: this.resolvedValue };
  }

  fromJSON(data: JsonRecord): void {
    this.replies = ((data.replies as JsonRecord[] | undefined) ?? []).map(deserializeReply);
    this.resolvedValue = Boolean(data.resolved);
  }

  /** Replace backing data without events (manager load path). */
  _load(replies: IReply[], resolved: boolean): void {
    this.replies = replies;
    this.resolvedValue = resolved;
  }
}

export class ThreadedCommentManager {
  private threads = new Map<number, Map<number, ThreadedComment>>();
  private sheet?: Worksheet;

  constructor(sheet?: Worksheet) {
    this.sheet = sheet;
  }

  add(row: number, col: number, replies?: IReply[]): ThreadedComment | null {
    let thread = this.threads.get(row)?.get(col);
    if (!thread) {
      thread = new ThreadedComment();
      thread._manager = this;
      thread._position(row, col);
      let byCol = this.threads.get(row);
      if (!byCol) this.threads.set(row, (byCol = new Map()));
      byCol.set(col, thread);
    }
    if (replies) for (const reply of replies) thread.add(reply);
    this._invalidate();
    return thread;
  }

  all(): ThreadedComment[] {
    const result: ThreadedComment[] = [];
    for (const row of [...this.threads.keys()].sort((a, b) => a - b)) {
      const byCol = this.threads.get(row)!;
      for (const col of [...byCol.keys()].sort((a, b) => a - b)) result.push(byCol.get(col)!);
    }
    return result;
  }

  clear(range?: Range): void {
    if (!range) {
      this.threads.clear();
    } else {
      for (const [row, byCol] of [...this.threads]) {
        for (const col of [...byCol.keys()]) {
          if (range.contains(row, col)) {
            byCol.delete(col);
            this.sheet?._emit(Events.ThreadedCommentChanged, this._cellArgs(row, col, undefined, 'reply'));
          }
        }
        if (!byCol.size) this.threads.delete(row);
      }
    }
    this._invalidate();
  }

  get(row: number, col: number): ThreadedComment | undefined {
    return this.threads.get(row)?.get(col);
  }

  remove(row: number, col: number): ThreadedComment | undefined {
    const byCol = this.threads.get(row);
    const thread = byCol?.get(col);
    if (!thread || !byCol) return undefined;
    byCol.delete(col);
    if (!byCol.size) this.threads.delete(row);
    this.sheet?._emit(Events.ThreadedCommentChanged, this._cellArgs(row, col, undefined, 'reply'));
    this._invalidate();
    return thread;
  }

  size(): number {
    let total = 0;
    for (const byCol of this.threads.values()) total += byCol.size;
    return total;
  }
  /** True when the manager holds at least one thread (trial exposes `hasComments`; see docs/STATUS.md for the trial ambiguity). */
  hasComments(): boolean {
    return this.threads.size > 0;
  }

  /** Bounding cells of all threads (trial probe `tc:usedrange-json`: `{}` when empty, else `{ minRow, minCol, maxRow, maxCol }`). */
  getUsedRange(): { minRow?: number; minCol?: number; maxRow?: number; maxCol?: number } {
    const out: { minRow?: number; minCol?: number; maxRow?: number; maxCol?: number } = {};
    let any = false;
    for (const [row, byCol] of this.threads) {
      for (const col of byCol.keys()) {
        out.minRow = any ? Math.min(out.minRow!, row) : row;
        out.minCol = any ? Math.min(out.minCol!, col) : col;
        out.maxRow = any ? Math.max(out.maxRow!, row) : row;
        out.maxCol = any ? Math.max(out.maxCol!, col) : col;
        any = true;
      }
    }
    return out;
  }


  /** Serialize in the official row/col nested shape. */
  toJSON(): JsonRecord {
    const result: JsonRecord = {};
    for (const thread of this.all()) {
      const byRow = (result[String(thread.row())] as JsonRecord | undefined) ?? (result[String(thread.row())] = {});
      byRow[String(thread.col())] = thread.toJSON();
    }
    return result;
  }

  fromJSON(data: JsonRecord): void {
    this.threads.clear();
    for (const [rowKey, byCol] of Object.entries(data ?? {})) {
      const row = Number(rowKey);
      for (const [colKey, raw] of Object.entries((byCol as JsonRecord) ?? {})) {
        const col = Number(colKey);
        const thread = new ThreadedComment();
        thread._manager = this;
        thread._position(row, col);
        thread.fromJSON(raw as JsonRecord);
        let cols = this.threads.get(row);
        if (!cols) this.threads.set(row, (cols = new Map()));
        cols.set(col, thread);
      }
    }
  }

  _shift(axis: 'row' | 'col', index: number, count: number, remove: boolean): void {
    const moved = new Map<number, Map<number, ThreadedComment>>();
    for (const [row, byCol] of this.threads) {
      for (const [col, thread] of byCol) {
        const newRow = axis === 'row' ? _shiftIndex(row, index, count, remove) : row;
        const newCol = axis === 'col' ? _shiftIndex(col, index, count, remove) : col;
        if (newRow === undefined || newCol === undefined) continue;
        let cols = moved.get(newRow);
        if (!cols) moved.set(newRow, (cols = new Map()));
        cols.set(newCol, thread);
        thread._position(newRow, newCol);
      }
    }
    this.threads = moved;
    this._invalidate();
  }

  _hasAny(): boolean {
    return this.size() > 0;
  }

  _currentUser(): string {
    return UserManager.current() ?? defaultCurrentUserId();
  }

  _invalidate(): void {
    this.sheet?._invalidate();
  }

  _changingArgs(thread: ThreadedComment, propertyName: string, replyIndex: number, newValue: unknown, oldValue: unknown): JsonRecord {
    return {
      sheet: this.sheet,
      sheetName: this.sheet?.name() ?? '',
      threadedComment: thread,
      propertyName,
      row: thread.row(),
      col: thread.col(),
      replyIndex,
      newValue,
      oldValue,
      cancel: false,
    };
  }

  _cellArgs(row: number, col: number, thread: ThreadedComment | undefined, propertyName: string): JsonRecord {
    return {
      sheet: this.sheet,
      sheetName: this.sheet?.name() ?? '',
      threadedComment: thread,
      propertyName,
      row,
      col,
    };
  }

  _fireChanging(args: JsonRecord): void {
    this.sheet?._emit(Events.ThreadedCommentChanging, args);
  }

  _fireChanged(args?: JsonRecord): void {
    if (args) this.sheet?._emit(Events.ThreadedCommentChanged, args);
    this._invalidate();
  }

  _notifyMentions(blocks: IContentBlock[], thread: ThreadedComment): void {
    const mentions = (blocks ?? []).filter((block) => block.type === ContentType.mention).map((block) => (block as IMentionBlock).userId);
    if (!mentions.length) return;
    const sheet = this.sheet;
    if (!sheet) return;
    const args = { sheet, sheetName: sheet.name(), threadedComment: thread, row: thread.row(), col: thread.col(), userList: mentions };
    sheet._emit(Events.UserMentioning, args);
    for (const userId of mentions) {
      sheet._emit(Events.UserMentioned, { sheet, sheetName: sheet.name(), threadedComment: thread, row: thread.row(), col: thread.col(), userId });
    }
  }
}

function _shiftIndex(index: number, from: number, count: number, remove: boolean): number | undefined {
  if (remove) {
    if (index < from) return index;
    if (index < from + count) return undefined;
    return index - count;
  }
  if (index >= from) return index + count;
  return index;
}

let defaultUserId: string | undefined;

/** The stable anonymous user used when no user was configured. */
export function defaultCurrentUserId(): string {
  if (!defaultUserId) defaultUserId = '{00000000-0000-4000-8000-000000000001}';
  return defaultUserId;
}

/* ------------------------------------------------------------------------
 * Threaded-comment undo actions (TASK 44). The trial exposes these action
 * classes on the `ThreadedComments` namespace (probe `tc:keys`; they back its
 * undo journal for comment operations). Our equivalents record/replay the
 * corresponding manager operations. The panel-only view classes
 * (`ThreadedCommentList`, `*Component`, `ThreadedCommentFilterDropdown`) are
 * UI internals excluded from this sweep (see docs/STATUS.md).
 * ---------------------------------------------------------------------- */

interface ThreadLocation { row: number; col: number }

function snapshotThread(sheet: Worksheet, row: number, col: number): { replies: IReply[]; resolved: boolean } | undefined {
  const thread = sheet.threadedComments.get(row, col);
  if (!thread) return undefined;
  return { replies: thread.all().map((reply) => ({ ...reply, message: reply.message.map((block) => ({ ...block })) })), resolved: thread.resolved() };
}

function restoreThread(sheet: Worksheet, row: number, col: number, state: { replies: IReply[]; resolved: boolean } | undefined): void {
  if (!state) { sheet.threadedComments.remove(row, col); return; }
  sheet.threadedComments.remove(row, col);
  const thread = sheet.threadedComments.add(row, col);
  if (thread) { thread._load(state.replies.map((reply) => ({ ...reply, message: reply.message.map((block) => ({ ...block })) })), state.resolved); }
}

export class AddThreadedCommentUndoAction {
  private before: { replies: IReply[]; resolved: boolean } | undefined;
  constructor(private sheet: Worksheet, private at: ThreadLocation) { this.before = snapshotThread(sheet, at.row, at.col); }
  execute(): boolean { this.sheet.threadedComments.add(this.at.row, this.at.col); return true; }
  undo(): boolean { restoreThread(this.sheet, this.at.row, this.at.col, this.before); return true; }
}

export class RemoveThreadedCommentUndoAction {
  private before: { replies: IReply[]; resolved: boolean } | undefined;
  constructor(private sheet: Worksheet, private at: ThreadLocation) { this.before = snapshotThread(sheet, at.row, at.col); }
  execute(): boolean { this.sheet.threadedComments.remove(this.at.row, this.at.col); return true; }
  undo(): boolean { restoreThread(this.sheet, this.at.row, this.at.col, this.before); return true; }
}

export class UpdateThreadedCommentUndoAction {
  private before: { replies: IReply[]; resolved: boolean } | undefined;
  constructor(private sheet: Worksheet, private at: ThreadLocation) { this.before = snapshotThread(sheet, at.row, at.col); }
  execute(_after?: JsonRecord): boolean { if (_after) { const thread = this.sheet.threadedComments.get(this.at.row, this.at.col); if (thread) thread.fromJSON(_after); } return true; }
  undo(): boolean { restoreThread(this.sheet, this.at.row, this.at.col, this.before); return true; }
  toJSON(): JsonRecord { return { row: this.at.row, col: this.at.col, before: this.before ? { replies: this.before.replies.map((r) => ({ ...r })), resolved: this.before.resolved } : null }; }
}

export class AddThreadedCommentReplyUndoAction {
  private before: { replies: IReply[]; resolved: boolean } | undefined;
  constructor(private sheet: Worksheet, private at: ThreadLocation) { this.before = snapshotThread(sheet, at.row, at.col); }
  execute(reply?: Partial<IReply> | string): boolean { const thread = this.sheet.threadedComments.add(this.at.row, this.at.col) ?? this.sheet.threadedComments.get(this.at.row, this.at.col); thread?.add(reply ?? ''); return true; }
  undo(): boolean { restoreThread(this.sheet, this.at.row, this.at.col, this.before); return true; }
}

export class RemoveThreadedCommentReplyUndoAction {
  private before: { replies: IReply[]; resolved: boolean } | undefined;
  constructor(private sheet: Worksheet, private at: ThreadLocation) { this.before = snapshotThread(sheet, at.row, at.col); }
  execute(index: number): boolean { this.sheet.threadedComments.get(this.at.row, this.at.col)?.remove(index); return true; }
  undo(): boolean { restoreThread(this.sheet, this.at.row, this.at.col, this.before); return true; }
}

export class UpdateThreadedCommentReplyUndoAction {
  private before: { replies: IReply[]; resolved: boolean } | undefined;
  constructor(private sheet: Worksheet, private at: ThreadLocation) { this.before = snapshotThread(sheet, at.row, at.col); }
  execute(index: number, reply?: Partial<IReply>): boolean { this.sheet.threadedComments.get(this.at.row, this.at.col)?.set(index, reply ?? {}); return true; }
  undo(): boolean { restoreThread(this.sheet, this.at.row, this.at.col, this.before); return true; }
}

function moveThreadSelection(sheet: Worksheet, direction: 1 | -1): boolean {
  const cells: [number, number][] = sheet.threadedComments.all().map((thread) => [thread.row(), thread.col()]);
  if (!cells.length) return false;
  cells.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const activeRow = sheet.getActiveRowIndex(), activeCol = sheet.getActiveColumnIndex();
  let found = -1;
  for (let i = 0; i < cells.length; i++) if (cells[i][0] > activeRow || (cells[i][0] === activeRow && cells[i][1] > activeCol)) { found = i; break; }
  if (direction === -1) {
    found = -1;
    for (let i = cells.length - 1; i >= 0; i--) if (cells[i][0] < activeRow || (cells[i][0] === activeRow && cells[i][1] < activeCol)) { found = i; break; }
  }
  const target = found >= 0 ? cells[found] : cells[direction === 1 ? 0 : cells.length - 1];
  sheet.setSelection(target[0], target[1], 1, 1);
  return true;
}

export class NavigateNextThreadedCommentAction {
  constructor(private sheet: Worksheet) {}
  execute(): boolean { return moveThreadSelection(this.sheet, 1); }
  undo(): boolean { return moveThreadSelection(this.sheet, -1); }
}

export class NavigatePreviousThreadedCommentAction {
  constructor(private sheet: Worksheet) {}
  execute(): boolean { return moveThreadSelection(this.sheet, -1); }
  undo(): boolean { return moveThreadSelection(this.sheet, 1); }
}
