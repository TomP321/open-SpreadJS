/**
 * DOM overlays for comments: classic note boxes/editors and threaded comment
 * cards. Mirrors the official look (yellow note with connector, 261px thread
 * card with avatar, editor, resolve actions) using our own markup and styles.
 */
import type { WorkbookRenderer } from './rendering.js';
import type { Worksheet } from './worksheet.js';
import type { Comment } from './comments.js';
import type { ThreadedComment, IContentBlock } from './threaded-comments.js';
import { ContentType, blocksToText, userColor, _cacheUser } from './threaded-comments.js';
import { UserManager } from './user-manager.js';
import { Events } from './events.js';

interface CellPos { x: number; y: number; w: number; h: number }

const PANEL_CLASS = 'gc-comment-layoutPanel';
const HOST_CLASS = 'gc-spread-host';
const HOST_CONTAINER_CLASS = 'gc-spread-host-container';

function el(tag: string, className: string, style: Partial<CSSStyleDeclaration> = {}): HTMLElement {
  const node = document.createElement(tag);
  if (className) node.className = className;
  Object.assign(node.style, { boxSizing: 'border-box' } as CSSStyleDeclaration, style);
  return node;
}
const ABSOLUTE: Partial<CSSStyleDeclaration> = { position: 'absolute' };

/** Parse typed editor text into content blocks, turning @name into mentions. */
export function typedTextToBlocks(text: string): IContentBlock[] {
  const blocks: IContentBlock[] = [];
  let rest = text;
  while (rest) {
    const at = rest.indexOf('@');
    if (at < 0) { blocks.push({ type: ContentType.text, value: rest }); break; }
    if (at > 0) blocks.push({ type: ContentType.text, value: rest.slice(0, at) });
    rest = rest.slice(at + 1);
    const match = /^(.+?)(?=$|[\s,;:!?])/.exec(rest);
    const name = match ? match[1] : rest;
    rest = rest.slice(name.length);
    const user = knownUsers().find((u) => u.name.toLowerCase() === name.toLowerCase());
    if (user) blocks.push({ type: ContentType.mention, userId: user.id });
    else blocks.push({ type: ContentType.text, value: `@${name}` });
  }
  return blocks;
}

function knownUsers(): { id: string; name: string }[] {
  return UserManager._knownUsers();
}

/**
 * Reply timestamp as shown by the official card: absolute `M/D/YYYY HH:mm:ss`
 * for recent replies, relative "N hour(s)/day(s) ago" once older.
 */
function formatTime(date: Date): string {
  const diff = Date.now() - date.getTime();
  if (diff >= 3_600_000 && diff < 86_400_000) {
    const h = Math.floor(diff / 3_600_000);
    return `${h} hour${h > 1 ? 's' : ''} ago`;
  }
  if (diff >= 86_400_000) {
    const d = Math.floor(diff / 86_400_000);
    return `${d} day${d > 1 ? 's' : ''} ago`;
  }
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()} ${p(date.getHours())}:${p(date.getMinutes())}:${p(date.getSeconds())}`;
}

/** A1-style label for the card header (e.g. row 3, col 2 -> "C4"). */
function cellRef(row: number, col: number): string {
  let n = col + 1;
  let letters = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    letters = String.fromCharCode(65 + m) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return `${letters}${row + 1}`;
}

type IconName = 'gear' | 'pencil' | 'trash' | 'check' | 'close';

/** Small stroke icons drawn by us (no stock or vendor assets). */
function iconSvg(name: IconName, size = 16, color = 'currentColor'): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('viewBox', '0 0 16 16');
  const paths: Record<IconName, string[]> = {
    gear: ['M8 1.8v2.4M8 11.8v2.4M1.8 8h2.4M11.8 8h2.4M3.6 3.6l1.7 1.7M10.7 10.7l1.7 1.7M12.4 3.6l-1.7 1.7M5.3 10.7l-1.7 1.7'],
    pencil: ['M2.4 11.2 10.6 3l2.8 2.8L5.2 14H2.4v-2.8Z'],
    trash: ['M2.8 4.4h10.4M6.4 4.4V2.8h3.2v1.6M4.4 4.4 5.2 14.2h5.6l.8-9.8'],
    check: ['M3 8.6 6.4 12 13 4.6'],
    close: ['M3.6 3.6l8.8 8.8M12.4 3.6l-8.8 8.8'],
  };
  for (const d of paths[name]) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', color);
    path.setAttribute('stroke-width', '1.5');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    svg.append(path);
  }
  if (name === 'gear') {
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', '8');
    circle.setAttribute('cy', '8');
    circle.setAttribute('r', '2.8');
    circle.setAttribute('fill', 'none');
    circle.setAttribute('stroke', color);
    circle.setAttribute('stroke-width', '1.5');
    svg.append(circle);
  }
  return svg;
}

const EDITOR_STYLE_ID = 'gc-os-comment-editor-styles';

/**
 * Inject the card CSS inline styles cannot express: the editor placeholder is a pure
 * `::before` visual keyed off [data-os-empty][data-placeholder], so it is never part of
 * the input's textContent. An empty input therefore keeps Post disabled, posts nothing,
 * and every keypress inserts a character instead of "deleting" the placeholder.
 */
function ensureEditorStyles(): void {
  if (document.getElementById(EDITOR_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = EDITOR_STYLE_ID;
  style.textContent = [
    '.os-thread-card .editor-input[data-os-empty]::before {',
    ' content: attr(data-placeholder);',
    ' position: absolute;',
    ' color: #999;',
    ' pointer-events: none;',
    ' user-select: none;',
    ' -webkit-user-select: none;',
    '}',
  ].join('\n');
  (document.head ?? document.documentElement).append(style);
}

export class CommentUi {
  private layer?: HTMLElement;
  private box?: { row: number; col: number; host: HTMLElement; textarea?: HTMLTextAreaElement; kind: 'comment' | 'thread' };
  private card?: HTMLElement;
  private cardCell?: { row: number; col: number };
  private pointerInUi = false;
  private pendingNewThread = false;

  constructor(readonly view: WorkbookRenderer) {}

  private get sheet(): Worksheet | undefined {
    return this.view.sheet;
  }

  private ensureLayer(): HTMLElement {
    if (!this.layer) {
      this.layer = el('div', PANEL_CLASS, { ...ABSOLUTE, left: '0', top: '0', width: '0', height: '0', zIndex: '6' });
      this.view.root.append(this.layer);
    }
    return this.layer;
  }

  private cellPos(row: number, col: number): CellPos | undefined {
    if (!this.sheet) return undefined;
    const rect = this.view.cellRect(row, col);
    if (!rect) return undefined;
    return { x: rect.x + this.view.viewportX, y: rect.y + this.view.viewportY, w: rect.width, h: rect.height };
  }

  /** True while the given pointer event targets our overlay (grid must ignore it). */
  consumes(target: EventTarget | null): boolean {
    const node = target as HTMLElement | null;
    return !!(node && this.layer && this.layer.contains(node));
  }

  isOpen(): boolean {
    return !!(this.box || this.card);
  }

  /** Handle hover over a viewport cell from the grid pointer handler. */
  hover(row: number, col: number): void {
    const sheet = this.sheet;
    if (!sheet || row < 0 || col < 0) return;
    const thread = sheet.threadedComments.get(row, col);
    if (thread) {
      if (!this.card || this.cardCell?.row !== row || this.cardCell?.col !== col) this.showCard(row, col);
      return;
    }
    if (this.card && !this.pointerInUi && !this.pendingNewThread && !this.hasCardFocus()) this.closeCard();
    const comment = sheet.comments.get(row, col);
    if (!comment) { if (this.box?.kind === 'comment' && !this.box.textarea) this.closeBox(); return; }
    const state = comment.commentState();
    if (state === 1 || state === 2) { if (this.box?.row !== row || this.box?.col !== col) this.openEditor(row, col, state); return; }
    if (this.box?.kind === 'thread') return;
    if (comment.displayMode() !== 2) return;
    if (this.box?.row !== row || this.box?.col !== col) this.showCommentBox(row, col);
  }

  /** Called when the grid pointer left any comment/thread cell. */
  hoverOut(): void {
    if (this.pointerInUi) return;
    if (this.box && this.box.kind === 'comment' && !this.box.textarea) this.closeBox();
    if (this.card && !this.pendingNewThread && !this.hasCardFocus()) this.closeCard();
  }

  /** Show the comment box / thread card for a clicked cell. */
  reveal(row: number, col: number): void {
    const sheet = this.sheet;
    if (!sheet || row < 0 || col < 0) return;
    if (sheet.threadedComments.get(row, col)) {
      if (!this.card || this.cardCell?.row !== row || this.cardCell?.col !== col) this.showCard(row, col);
      return;
    }
    const comment = sheet.comments.get(row, col);
    if (!comment) return;
    if (this.box && this.box.row === row && this.box.col === col) return;
    const state = comment.commentState();
    if (state === 1 || state === 2) this.openEditor(row, col, state);
    else this.showCommentBox(row, col);
  }

  /** Commit any open classic-comment editor (state -> idle). Clicking the same cell keeps it open. */
  commit(keepRow = -1, keepCol = -1): void {
    const box = this.box;
    if (!box || box.kind !== 'comment') return;
    if (box.row === keepRow && box.col === keepCol) return;
    const sheet = this.sheet;
    const comment = sheet?.comments.get(box.row, box.col);
    if (comment && box.textarea) {
      const value = box.textarea.value;
      if (value !== comment.text()) {
        comment.text(value);
        sheet?._emit(Events.CommentChanged, { sheet, sheetName: sheet.name(), comment, row: box.row, col: box.col, propertyName: 'text', newValue: value });
      }
      if (comment.commentState() !== 3) {
        comment.commentState(3);
        sheet?._emit(Events.CommentChanged, { sheet, sheetName: sheet.name(), comment, row: box.row, col: box.col, propertyName: 'commentState', newValue: 3, oldValue: 1 });
      }
    }
    this.closeBox();
  }

  /** Escape handling; returns true when consumed. */
  keydown(event: KeyboardEvent): boolean {
    if (event.key !== 'Escape' || !this.isOpen()) return false;
    if (this.box?.textarea) {
      this.commit();
      return true;
    }
    if (this.card) { this.closeCard(); return true; }
    this.closeBox();
    return true;
  }

  /** Insert a classic comment at the active cell and open its editor. */
  insertComment(): void {
    const sheet = this.sheet;
    if (!sheet) return;
    const row = sheet.getActiveRowIndex(), col = sheet.getActiveColumnIndex();
    let comment = sheet.comments.get(row, col);
    if (!comment) comment = sheet.comments.add(row, col, '');
    comment._materialize();
    comment.commentState(2);
    sheet._emit(Events.CommentChanged, { sheet, sheetName: sheet.name(), comment, row, col, propertyName: 'commentState', newValue: 2 });
    this.closeCard();
    this.openEditor(row, col, 2);
  }

  /** Edit the classic comment at the active cell (state 2). */
  editComment(): void {
    const sheet = this.sheet;
    if (!sheet) return;
    const row = sheet.getActiveRowIndex(), col = sheet.getActiveColumnIndex();
    const comment = sheet.comments.get(row, col);
    if (!comment) return;
    comment._materialize();
    comment.commentState(2);
    sheet._emit(Events.CommentChanged, { sheet, sheetName: sheet.name(), comment, row, col, propertyName: 'commentState', newValue: 2 });
    this.closeCard();
    this.openEditor(row, col, 2);
  }

  /** Toggle display mode of all comments (Show/Hide Comments command). */
  toggleComments(): void {
    const sheet = this.sheet;
    if (!sheet) return;
    for (const comment of sheet.comments.all()) comment.displayMode(comment.displayMode() === 1 ? 2 : 1);
    this.refreshAlwaysShown();
    sheet._invalidate();
  }

  /** Open the threaded card (New/Reply ribbon commands). */
  openThread(activeCell = true): void {
    const sheet = this.sheet;
    if (!sheet) return;
    const row = sheet.getActiveRowIndex(), col = sheet.getActiveColumnIndex();
    const exists = sheet.threadedComments.get(row, col);
    this.pendingNewThread = !exists;
    this.closeBox();
    this.showCard(row, col, activeCell);
  }

  deleteThread(): void {
    const sheet = this.sheet;
    if (!sheet) return;
    const cell = this.cardCell ?? { row: sheet.getActiveRowIndex(), col: sheet.getActiveColumnIndex() };
    if (!sheet.threadedComments.get(cell.row, cell.col)) return;
    sheet.threadedComments.remove(cell.row, cell.col);
    this.closeCard();
  }

  /** Cycle the active cell to the previous/next thread; returns the thread found. */
  stepThread(next: boolean): ThreadedComment | undefined {
    const sheet = this.sheet;
    if (!sheet) return undefined;
    const threads = sheet.threadedComments.all();
    if (!threads.length) return undefined;
    const active = sheet.getActiveRowIndex() * 100000 + sheet.getActiveColumnIndex();
    let target = next
      ? threads.find((t) => t.row() * 100000 + t.col() > active) ?? threads[0]
      : [...threads].reverse().find((t) => t.row() * 100000 + t.col() < active) ?? threads[threads.length - 1];
    sheet.setActiveCell(target.row(), target.col());
    this.pendingNewThread = false;
    this.showCard(target.row(), target.col());
    target = this.cardCell ? sheet.threadedComments.get(this.cardCell.row, this.cardCell.col) ?? target : target;
    return target;
  }

  /** Reposition overlays after scroll/zoom. */
  sync(): void {
    this.positionBox();
    this.positionCard();
    this.refreshAlwaysShown();
  }

  destroy(): void {
    this.layer?.remove();
    this.layer = undefined;
    this.box = undefined;
    this.card = undefined;
  }

  // ---------------------------------------------------------------- internals

  private showCommentBox(row: number, col: number): void {
    const sheet = this.sheet;
    const comment = sheet?.comments.get(row, col);
    if (!comment || !sheet) return;
    this.closeBox();
    const host = this.buildCommentHost(comment);
    const { left, top } = this.commentAnchor(row, col, host.offsetWidth || 146, host.offsetHeight || 86);
    host.style.left = `${left}px`;
    host.style.top = `${top}px`;
    this.ensureLayer().append(host);
    this.box = { row, col, host, kind: 'comment' };
  }

  private openEditor(row: number, col: number, state: number): void {
    const sheet = this.sheet;
    const comment = sheet?.comments.get(row, col);
    if (!comment || !sheet) return;
    this.closeBox();
    this.closeCard();
    const host = this.buildCommentHost(comment, state === 1 ? '' : comment.text(), (textarea) => {
      setTimeout(() => textarea.focus(), 0);
    });
    const { left, top } = this.commentAnchor(row, col, host.offsetWidth || 146, host.offsetHeight || 86);
    host.style.left = `${left}px`;
    host.style.top = `${top}px`;
    this.ensureLayer().append(host);
    const textarea = host.querySelector<HTMLTextAreaElement>('textarea.gc-comment-editor') ?? undefined;
    this.box = { row, col, host, textarea, kind: 'comment' };
  }

  private buildCommentHost(comment: Comment, edit?: string, onEditor?: (t: HTMLTextAreaElement) => void): HTMLElement {
    const width = comment._explicit('width') ? Number(comment.width()) : 144;
    const height = comment._explicit('height') ? Number(comment.height()) : 84;
    const container = el('div', HOST_CONTAINER_CLASS, { ...ABSOLUTE, border: '1px solid #000000', background: 'transparent', width: `${width + 2}px`, height: `${height + 2}px` });
    const host = el('div', HOST_CLASS, { ...ABSOLUTE, inset: '1px', background: '#FFFFE1', fontFamily: 'Arial', fontSize: '12px', overflow: 'hidden', width: `${width}px`, height: `${height}px` });
    if (edit === undefined) {
      host.textContent = comment.text();
      host.style.whiteSpace = 'pre-wrap';
      host.style.padding = '1px 2px';
    } else {
      const textarea = document.createElement('textarea');
      textarea.className = 'gc-comment-editor';
      Object.assign(textarea.style, {
        width: '100%', height: '100%', border: 'none', outline: 'none', resize: 'none',
        background: '#FFFFE1', fontFamily: 'Arial', fontSize: '12px', padding: '1px 2px', margin: '0',
        position: 'absolute', inset: '0', boxSizing: 'border-box', color: 'black',
      } as CSSStyleDeclaration);
      textarea.value = edit;
      textarea.addEventListener('keydown', (event) => {
        event.stopPropagation();
        if (event.key === 'Escape') { event.preventDefault(); this.commit(); }
      });
      textarea.addEventListener('pointerdown', (event) => event.stopPropagation());
      onEditor?.(textarea);
      host.append(textarea);
    }
    container.append(host);
    container.addEventListener('pointerenter', () => { this.pointerInUi = true; });
    container.addEventListener('pointerleave', () => { this.pointerInUi = false; });
    return container;
  }

  private commentAnchor(row: number, col: number, boxWidth: number, boxHeight: number): { left: number; top: number } {
    const pos = this.cellPos(row, col);
    if (!pos) return { left: 0, top: 0 };
    let left = pos.x + pos.w + 9;
    let top = pos.y - 19;
    if (left + boxWidth > this.view.viewWidth + this.view.viewportX) left = pos.x - boxWidth - 9;
    if (top < this.view.viewportY) top = pos.y;
    if (top + boxHeight > this.view.viewportY + this.view.viewHeight) top = this.view.viewportY + this.view.viewHeight - boxHeight - 2;
    return { left, top };
  }

  private closeBox(): void {
    if (this.box) {
      this.box.host.remove();
      if (this.box.kind === 'comment' && !this.box.textarea) { /* hover box: no state change */ }
      this.box = undefined;
    }
  }

  private refreshAlwaysShown(): void {
    const sheet = this.sheet;
    if (!sheet || !this.layer) return;
    for (const node of [...this.layer.querySelectorAll('[data-os-always]')]) {
      const row = Number((node as HTMLElement).dataset.row), col = Number((node as HTMLElement).dataset.col);
      const comment = sheet.comments.get(row, col);
      const shown = !!comment && comment.displayMode() === 1 && comment.commentState() === 3;
      (node as HTMLElement).style.display = shown ? '' : 'none';
    }
    for (const comment of sheet.comments.all()) {
      if (comment.displayMode() !== 1 || comment.commentState() !== 3) continue;
      const row = comment.rowIndex(), col = comment.colIndex();
      if (this.layer.querySelector(`[data-os-always][data-row="${row}"][data-col="${col}"]`)) continue;
      const host = this.buildCommentHost(comment);
      host.dataset.osAlways = '1';
      host.dataset.row = String(row);
      host.dataset.col = String(col);
      const { left, top } = this.commentAnchor(row, col, 146, 86);
      host.style.left = `${left}px`;
      host.style.top = `${top}px`;
      this.layer.append(host);
    }
  }

  private positionBox(): void {
    if (!this.box) return;
    const { left, top } = this.commentAnchor(this.box.row, this.box.col, this.box.host.offsetWidth || 146, this.box.host.offsetHeight || 86);
    this.box.host.style.left = `${left}px`;
    this.box.host.style.top = `${top}px`;
  }

  // ---------------------------------------------------------------- card

  private showCard(row: number, col: number, focusEditor = true): void {
    const sheet = this.sheet;
    if (!sheet) return;
    // closeCard() clears pendingNewThread; a new, still empty thread card must keep it.
    const pending = this.pendingNewThread;
    this.closeCard();
    this.pendingNewThread = pending;
    this.cardCell = { row, col };
    const card = el('div', 'os-thread-card', {
      ...ABSOLUTE, width: '261px', background: '#ffffff', borderRadius: '2px',
      boxShadow: 'rgba(0, 0, 0, 0.2) 0px 1px 16px 0px, rgb(196, 128, 203) 0px 0px 0px 3px',
      fontFamily: 'Segoe UI, Arial, sans-serif', fontSize: '12px', color: '#333', overflow: 'hidden', zIndex: '2',
    });
    card.addEventListener('pointerenter', () => { this.pointerInUi = true; });
    card.addEventListener('pointerleave', () => { this.pointerInUi = false; if (!this.pendingNewThread && !this.hasCardFocus()) this.closeCard(); });
    card.addEventListener('pointerdown', (event) => event.stopPropagation());
    card.addEventListener('keydown', (event) => event.stopPropagation());
    const thread = sheet.threadedComments.get(row, col);
    if (thread?.resolved()) card.append(this.buildResolvedHeader(thread));
    for (const reply of thread?.all() ?? []) card.append(this.buildReply(reply.authorId, reply.message, reply.createdAt, thread));
    card.append(this.buildEditor(row, col, thread));
    this.ensureLayer().append(card);
    this.card = card;
    this.positionCard();
    if (focusEditor) {
      const input = card.querySelector<HTMLElement>('[contenteditable]');
      setTimeout(() => input?.focus(), 0);
    }
  }

  private buildResolvedHeader(thread: ThreadedComment): HTMLElement {
    const row = el('div', 'os-thread-resolved-bar', {
      display: 'flex', alignItems: 'center', gap: '4px', padding: '8px 8px 0', color: '#333333', cursor: 'pointer',
    });
    row.append(iconSvg('check', 16, '#242424'));
    const title = el('span', 'os-thread-resolved-title');
    title.textContent = 'Resolved';
    row.append(title, el('span', 'os-thread-resolved-spacer', { flex: '1' }));
    row.append(this.svgButton('pencil', 'Edit comment', () => this.editReply(thread)));
    row.append(this.svgButton('trash', 'Delete thread', () => this.deleteThread()));
    row.addEventListener('click', (event) => {
      if ((event.target as HTMLElement).closest('button')) return;
      thread.resolved(false);
      this.reopenCard();
    });
    return row;
  }

  private reopenCard(): void {
    if (this.cardCell) this.showCard(this.cardCell.row, this.cardCell.col, false);
  }

  private buildReply(authorId: string, message: IContentBlock[], createdAt: Date, thread: ThreadedComment | undefined): HTMLElement {
    const name = UserManager._knownNameSync(authorId);
    const reply = el('div', 'os-thread-reply', { display: 'flex', gap: '8px', padding: '8px 8px 6px', alignItems: 'flex-start' });
    const avatar = el('div', 'os-thread-avatar', {
      width: '24px', height: '24px', borderRadius: '50%', flex: '0 0 auto',
      background: userColor(UserManager._isKnown(authorId) ? authorId : UserManager.guestId()), color: '#fff', fontWeight: 'bold',
      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', lineHeight: '1',
    });
    avatar.textContent = (name || '?').slice(0, 1).toUpperCase();
    const body = el('div', 'os-thread-reply-body', { flex: '1', minWidth: '0' });
    const header = el('div', 'os-thread-reply-header', { display: 'flex', alignItems: 'center', gap: '6px' });
    const nameEl = el('span', 'os-thread-reply-name', { fontWeight: 'bold', color: '#333' });
    nameEl.textContent = name;
    header.append(nameEl, el('span', '', { flex: '1' }));
    if (thread) {
      const ref = el('span', 'os-thread-reply-ref', { color: '#999', fontSize: '11px' });
      ref.textContent = cellRef(thread.row(), thread.col());
      header.append(ref);
      if (!thread.resolved()) {
        const gear = this.svgButton('gear', 'Comment options', (event) => this.showThreadMenu(event, thread));
        header.append(gear);
      }
    }
    const text = el('div', 'os-thread-reply-text', { whiteSpace: 'pre-wrap', wordBreak: 'break-word', marginTop: '2px' });
    for (const block of message) {
      if (block.type === ContentType.mention) {
        const pill = el('span', 'os-thread-mention', { color: '#2680c2' });
        pill.textContent = `@${UserManager._knownNameSync(block.userId)}`;
        text.append(pill);
      } else if (block.type === ContentType.link) text.append(block.text ?? block.href ?? '');
      else text.append(document.createTextNode(block.value ?? ''));
    }
    if (thread) {
      text.style.cursor = 'default';
      text.addEventListener('dblclick', () => this.editReply(thread));
    }
    const time = el('div', 'os-thread-reply-time', { color: '#999', fontSize: '11px', marginTop: '4px' });
    time.textContent = formatTime(createdAt);
    body.append(header, text, time);
    reply.append(avatar, body);
    return reply;
  }

  private showThreadMenu(event: MouseEvent, thread: ThreadedComment): void {
    const sheet = this.sheet;
    if (!sheet) return;
    const menu = el('div', 'os-thread-menu', {
      ...ABSOLUTE, background: '#fff', border: '1px solid #d1d1d1', borderRadius: '2px', boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
      padding: '2px 0', zIndex: '20', minWidth: '118px', whiteSpace: 'nowrap',
    });
    const item = (label: string, icon: IconName, fn: () => void) => {
      const button = el('button', 'os-thread-menu-item', {
        display: 'flex', alignItems: 'center', gap: '8px', width: '100%', textAlign: 'left', border: 'none', background: 'transparent',
        padding: '5px 12px', font: 'inherit', color: '#333', cursor: 'pointer',
      });
      button.append(iconSvg(icon, 14, '#5b5b5b'));
      const labelEl = el('span', '');
      labelEl.textContent = label;
      button.append(labelEl);
      button.addEventListener('click', () => { menu.remove(); fn(); });
      button.addEventListener('pointerenter', () => (button.style.background = '#f0f0f0'));
      button.addEventListener('pointerleave', () => (button.style.background = 'transparent'));
      menu.append(button);
    };
    item('Delete Thread', 'trash', () => this.deleteThread());
    if (thread.resolved()) item('Reopen Thread', 'check', () => { thread.resolved(false); this.reopenCard(); });
    else item('Resolve Thread', 'check', () => { thread.resolved(true); this.closeCard(); });
    this.ensureLayer().append(menu);
    const rect = this.view.root.getBoundingClientRect();
    const anchor = (event.currentTarget as HTMLElement | undefined)?.getBoundingClientRect();
    const cardRight = this.card ? this.card.getBoundingClientRect().right : event.clientX + 20;
    const menuWidth = menu.offsetWidth || 118;
    const menuHeight = menu.offsetHeight || 60;
    let left = cardRight - menuWidth - rect.left - 2;
    if (left < 2) left = 2;
    let top = (anchor ? anchor.bottom : event.clientY) - rect.top + 2;
    if (top + menuHeight > this.view.viewportY + this.view.viewHeight) top = (anchor ? anchor.top : event.clientY) - rect.top - menuHeight - 2;
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
    const dismiss = (ev: PointerEvent) => {
      if (!menu.contains(ev.target as Node)) { menu.remove(); document.removeEventListener('pointerdown', dismiss, true); }
    };
    setTimeout(() => document.addEventListener('pointerdown', dismiss, true), 0);
  }

  private editReply(thread: ThreadedComment): void {
    const sheet = this.sheet;
    if (!sheet) return;
    const replies = thread.all();
    const lastIndex = replies.length - 1;
    const input = this.card?.querySelector<HTMLElement>('[contenteditable]');
    if (!input) return;
    input.textContent = blocksToText(replies[lastIndex]?.message ?? []);
    input.dataset.editing = String(lastIndex);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.focus();
  }

  private buildEditor(row: number, col: number, thread?: ThreadedComment): HTMLElement {
    ensureEditorStyles();
    const editor = el('div', 'os-thread-editor', { display: 'flex', flexDirection: 'column', gap: '6px', padding: '6px 8px 8px' });
    const input = el('div', 'editor-input', {
      minHeight: '22px', maxHeight: '88px', overflowY: 'auto', outline: 'none', position: 'relative',
      border: '1px solid #d0d0d0', borderRadius: '2px', padding: '4px 6px',
      font: 'inherit', color: '#333', whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: '16px',
    });
    input.setAttribute('contenteditable', 'true');
    // The placeholder is a CSS ::before visual (ensureEditorStyles): never editable content,
    // never counted by syncPostState()/post(), and it cannot swallow the first keypress.
    input.dataset.placeholder = thread ? '@mention or reply' : '@mention or comment';
    const refreshPlaceholder = (): void => {
      const text = input.textContent ?? '';
      // Browsers leave <br> or empty text nodes after backspacing to nothing; restore a
      // truly empty element so the placeholder reappears and textContent stays clean.
      if (text === '' && input.childNodes.length > 0) input.innerHTML = '';
      if (text === '') input.dataset.osEmpty = '1';
      else delete input.dataset.osEmpty;
    };
    input.addEventListener('keydown', (event) => {
      event.stopPropagation();
      if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); this.post(row, col, input, thread); return; }
      if (event.key === 'Escape') {
        event.preventDefault();
        if (input.textContent?.trim()) { input.textContent = ''; delete input.dataset.editing; refreshPlaceholder(); syncPostState(); }
        else this.closeCard();
      }
    });
    const buttons = el('div', 'os-thread-editor-buttons', { display: 'flex', justifyContent: 'flex-end', gap: '8px' });
    const post = el('button', 'os-thread-post', {
      width: '42px', height: '20px', border: 'none', borderRadius: '2px', background: 'rgb(33, 115, 70)',
      color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0', flex: '0 0 auto',
    });
    const syncPostState = (): void => {
      const empty = !(input.textContent ?? '').trim();
      post.toggleAttribute('disabled', empty);
      post.style.opacity = empty ? '0.55' : '1';
      post.style.cursor = empty ? 'not-allowed' : 'pointer';
    };
    input.addEventListener('input', () => { refreshPlaceholder(); syncPostState(); });
    refreshPlaceholder();
    syncPostState();
    const plane = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    plane.setAttribute('width', '16');
    plane.setAttribute('height', '16');
    plane.setAttribute('viewBox', '0 0 16 16');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('fill', 'currentColor');
    path.setAttribute('d', 'M1.5 1.7 14.5 8 8.6 9.6 6.8 15 4.9 10 1.5 1.7Zm2.1 2.6 3.2 3.7-.1 2.2 3.6-2-6.7-3.9Z');
    plane.append(path);
    post.append(plane);
    post.addEventListener('click', () => this.post(row, col, input, thread));
    const cancel = el('button', 'os-thread-cancel', {
      width: '42px', height: '20px', border: 'none', background: 'transparent', color: '#333',
      cursor: 'pointer', padding: '0', flex: '0 0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center',
    });
    cancel.title = 'Cancel';
    cancel.append(iconSvg('close', 14, '#333333'));
    cancel.addEventListener('click', () => {
      delete input.dataset.editing;
      input.textContent = '';
      refreshPlaceholder();
      syncPostState();
      if (this.pendingNewThread && !thread) this.closeCard();
      this.pendingNewThread = false;
    });
    buttons.append(post, cancel);
    editor.append(input, buttons);
    return editor;
  }

  private post(row: number, col: number, input: HTMLElement, thread?: ThreadedComment): void {
    const sheet = this.sheet;
    if (!sheet) return;
    const fullText = (input.textContent ?? '').replace(/\u00a0/g, ' ');
    const editingIndex = input.dataset.editing !== undefined ? Number(input.dataset.editing) : undefined;
    if (!fullText.trim()) return;
    const message = typedTextToBlocks(fullText);
    let target = thread ?? sheet.threadedComments.get(row, col);
    if (!target) target = sheet.threadedComments.add(row, col) ?? undefined;
    if (target) {
      if (editingIndex !== undefined && target.get(editingIndex)) target.set(editingIndex, { message, createdAt: new Date(), authorId: target.get(editingIndex)?.authorId ?? UserManager.current() ?? '' });
      else target.add({ message, createdAt: new Date(), authorId: UserManager.current() ?? '' });
      if (target.resolved()) target.resolved(false);
    }
    this.pendingNewThread = false;
    this.showCard(row, col, false);
    void row; void col;
  }

  private svgButton(name: IconName, title: string, onClick: (event: MouseEvent) => void): HTMLElement {
    const button = el('button', 'os-thread-icon', {
      border: 'none', background: 'transparent', cursor: 'pointer', color: '#5b5b5b',
      width: '18px', height: '18px', padding: '0',
      display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto',
    });
    button.title = title;
    button.append(iconSvg(name, 16, '#5b5b5b'));
    button.addEventListener('pointerdown', (event) => event.stopPropagation());
    button.addEventListener('click', onClick);
    return button;
  }

  private hasCardFocus(): boolean {
    if (!this.card) return false;
    const active = this.view.root.getRootNode() instanceof Document ? document.activeElement : null;
    return !!(active && this.card.contains(active));
  }

  private closeCard(): void {
    this.card?.remove();
    this.card = undefined;
    this.cardCell = undefined;
    this.pendingNewThread = false;
  }

  private positionCard(): void {
    if (!this.card || !this.cardCell) return;
    const pos = this.cellPos(this.cardCell.row, this.cardCell.col);
    if (!pos) return;
    let left = pos.x + pos.w + 4;
    let top = pos.y - 6;
    const cardHeight = this.card.offsetHeight || 110;
    if (left + 265 > this.view.viewportX + this.view.viewWidth) left = Math.max(this.view.viewportX, pos.x - 265);
    if (top + cardHeight > this.view.viewportY + this.view.viewHeight) top = Math.max(this.view.viewportY, this.view.viewportY + this.view.viewHeight - cardHeight - 4);
    this.card.style.left = `${left}px`;
    this.card.style.top = `${top}px`;
  }
}

/** Resolve mention display names when users were fetched from the manager. */
export function primeUser(user: { id: string; name: string }): void {
  _cacheUser(user);
}
