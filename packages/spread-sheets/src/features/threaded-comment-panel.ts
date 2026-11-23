// GC.Spread.Sheets.ThreadedComments.ThreadedCommentPanel (TASK 46 item 4;
// TASK 95 rebuilt on the official DOM measured black-box, probes .probe/t95):
// Contract: core d.ts ThreadedCommentPanel (constructor(host, workbook),
// attach(workbook), detach(), refresh(), destroy(), findControl(host)).
// Trial structure (probe t95 panel1/panel2 on the official core page):
//  - region root aria-label "Threaded Comments"; fixed header (role=banner):
//    title, New button (75x30 icon+text), "<n> items" count block, filter
//    button (35x30, aria-haspopup "true" + aria-expanded state, badge) and the
//    dropdown ("Reset All" menuitem, "Filter By" separator, three
//    menuitemcheckbox rows "@mentions Me"/"Active Only"/"Resolved Only").
//  - one card per stored thread (`role=listitem`, trial data-comment-key
//    "<row>_<col>", aria-label "Threaded comment at row R, column C"):
//    resolved threads first show the "Resolved" banner (check icon + label +
//    "Reopen Thread" / "Delete Thread" 18 px action buttons); then the card
//    head = cell-reference text ("A1") + a "More options" button
//    (role=button, aria-haspopup/aria-expanded). Each reply is its own article
//    ("Threaded comment reply") with a 24 px avatar (initial, first-seen user
//    colour), the user name (title attribute), the content and a timestamp
//    ("1/2/2026 11:00:00"); replies of ACTIVE threads also carry their own
//    "More options" button that opens the card options menu. The options menu
//    (role=menu, aria-label "Threaded comment options menu") lists
//    "Delete Thread" then "Resolve Thread" on active AND resolved cards alike
//    (probe2 replyMenuItems / probe3 resolvedMenuItems). Below the replies sits
//    the reply editor (contenteditable, data-placeholder "@mention or reply")
//    with hidden "Post Comment"/"Cancel" buttons that appear while editing —
//    resolved threads accept replies too and stay resolved (probe3). Typing
//    "@" opens the mention list (empty state "Couldn't find any matches");
//    picking a user inserts a mention block. "New" does not create a thread:
//    it inserts a draft card for the active cell (probe2 afterNew: a card
//    "Threaded comment at row 6, column 6" without a data-comment-key while
//    `threadedComments.size()` stays 2) whose Post commits to the model.
//  - a "See more comments" footer exists in the DOM (hidden unless the list
//    scrolls past what is rendered; the trial virtualizes — recorded gap).
//  - attach / detach / refresh / destroy answer undefined; destroy empties the
//    host; the panel updates automatically when comments change; detach keeps
//    the rendered DOM; findControl is both a static (trial) and a prototype
//    member (d.ts). The official panel renders through web components; ours
//    builds its own light DOM (like the sibling controls) with our own class
//    names and our own drawn icons — no copied bitmaps.

import { Events, type EventInfo, type ModelEvent } from '../events.js';
import type { Workbook } from '../workbook.js';
import type { Worksheet } from '../worksheet.js';
import { ContentType, resolveCachedUser, ThreadedCommentFilterType, userColor, type IContentBlock, type IMentionBlock, type ThreadedComment, type ThreadedCommentManager } from '../threaded-comments.js';
import { columnLabel } from '../rendering.js';
import { UserManager } from '../user-manager.js';
import { findControl as findRegisteredControl, registerControl, unregisterControl } from './controls.js';
import { ltext } from '../localization.js';

/** Threaded-comment panel captions (`comments.*` language namespace). */
const ctext = (key: string, fallback: string, ...args: (string | number)[]) => ltext(`comments.${key}`, fallback, ...args);

function hostElement(host: HTMLElement | string): HTMLElement {
  const element = typeof host === 'string' ? document.getElementById(host) : host;
  if (!element) throw new Error('Control host not found');
  return element;
}

/** Our own icon glyphs (drawn paths, no bitmaps): `size` is the rendered square. */
function icon(name: 'new' | 'filter' | 'more' | 'dots' | 'reopen' | 'close' | 'check' | 'post', size = 14): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  const d =
    name === 'new' ? 'M3 3h7l3 3v7a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V3zM10 3v3h3'
    : name === 'filter' ? 'M3 4h10l-4 4.5V13L7 11v-3.5L3 4z'
    : name === 'more' ? 'M4 6l4 4 4-4'
    : name === 'dots' ? 'M3 8.5h.01M8 8.5h.01M13 8.5h.01'
    : name === 'reopen' ? 'M13 8a5 5 0 1 0-1.5 3.5M13 5v3.5h-3.5'
    : name === 'close' ? 'M4 4l8 8M12 4l-8 8'
    : name === 'check' ? 'M3 8.5l3.5 3.5L13 5.5'
    : 'M2.5 8.5h9M8.5 5l3.5 3.5-3.5 3.5';
  path.setAttribute('d', d);
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '1.3');
  path.setAttribute('stroke-linejoin', 'round');
  path.setAttribute('stroke-linecap', 'round');
  if (name === 'dots') path.setAttribute('stroke-width', '2.4');
  svg.appendChild(path);
  return svg;
}

/** Reply-editor chip for a mention (carries the user id for serialisation). */
const CHIP_CLASS = 'opensheets-tc-mention-chip';

/** Format like the trial's reply timestamp ("1/2/2026 11:00:00", local fields). */
function trialTimestamp(date: Date): string {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

/** Read the editor DOM (text nodes + mention chips) back into content blocks. */
function editorBlocks(editor: HTMLElement): IContentBlock[] {
  const blocks: IContentBlock[] = [];
  let pending = '';
  const flush = () => { if (pending) { blocks.push({ type: ContentType.text, value: pending }); pending = ''; } };
  for (const node of Array.from(editor.childNodes)) {
    if (node.nodeType === 3) pending += node.textContent ?? '';
    else if (node instanceof HTMLElement && node.classList.contains(CHIP_CLASS)) {
      flush();
      const userId = node.dataset.userId ?? '';
      if (userId) blocks.push({ type: ContentType.mention, userId });
    } else if (node instanceof HTMLElement && node.tagName === 'BR') pending += '\n';
  }
  flush();
  return blocks;
}

const displayName = (id: string): string => resolveCachedUser(id)?.name || ctext('guest', 'Guest');

interface DraftCard { row: number; col: number; element: HTMLElement }

export class ThreadedCommentPanel {
  private host: HTMLElement;
  private root: HTMLElement;
  private listElement?: HTMLElement;
  private countElement?: HTMLElement;
  private badgeElement?: HTMLElement;
  private scrollElement?: HTMLElement;
  private navigateElement?: HTMLElement;
  private filterButton?: HTMLElement;
  private dropdown?: HTMLElement;
  private wb?: Workbook;
  private boundSheet?: Worksheet;
  private filter = ThreadedCommentFilterType.None;
  private draft?: DraftCard;
  private changed = (): void => { this.render(); };
  private sheetChanged = (_event: ModelEvent, _info: EventInfo): void => { this.bindSheet(); this.render(); };
  private documentClosed = (event: Event): void => {
    // Trial behaviour: an open card menu closes on any click outside it.
    const target = event.target as Node | null;
    for (const menu of Array.from(this.root?.querySelectorAll<HTMLElement>('.opensheets-tc-menu') ?? [])) {
      if (menu.classList.contains('open') && target && !menu.contains(target)) {
        const card = menu.closest<HTMLElement>('.opensheets-tc-comment');
        menu.classList.remove('open');
        card?.querySelectorAll<HTMLElement>('.opensheets-tc-settings').forEach((s) => s.setAttribute('aria-expanded', 'false'));
      }
    }
  };

  constructor(host: HTMLElement | string, workbook: Workbook | undefined) {
    this.host = hostElement(host);
    registerControl(this.host, this);
    const root = document.createElement('div');
    root.className = 'opensheets-threaded-comment-panel';
    root.setAttribute('role', 'region');
    root.setAttribute('aria-label', ctext('title', 'Threaded Comments'));

    const header = document.createElement('div');
    header.className = 'opensheets-tc-header';
    header.setAttribute('role', 'banner');
    const title = document.createElement('div');
    title.className = 'opensheets-tc-title';
    title.textContent = ctext('title', 'Threaded Comments');
    const buttons = document.createElement('div');
    buttons.className = 'opensheets-tc-buttons';
    const addButton = document.createElement('button');
    addButton.type = 'button';
    addButton.className = 'opensheets-tc-new';
    addButton.setAttribute('role', 'button');
    addButton.setAttribute('aria-label', ctext('new', 'New'));
    addButton.append(icon('new'), Object.assign(document.createElement('span'), { textContent: ctext('new', 'New') }));
    addButton.addEventListener('click', () => this.openDraftCard());
    const count = document.createElement('span');
    count.className = 'opensheets-tc-count';
    this.countElement = count;
    const filterWrap = document.createElement('div');
    filterWrap.className = 'opensheets-tc-filter-wrap';
    const filterButton = document.createElement('button');
    filterButton.type = 'button';
    filterButton.className = 'opensheets-tc-filter';
    filterButton.setAttribute('aria-label', ctext('filterAria', 'Filter threaded comments'));
    filterButton.setAttribute('aria-haspopup', 'true');
    filterButton.setAttribute('aria-expanded', 'false');
    this.filterButton = filterButton;
    const badge = document.createElement('span');
    badge.className = 'opensheets-tc-filter-badge';
    badge.setAttribute('aria-label', ctext('activeFilters', 'Active filters'));
    this.badgeElement = badge;
    filterButton.append(icon('filter'), badge);
    const dropdown = document.createElement('div');
    dropdown.className = 'opensheets-tc-filter-dropdown';
    dropdown.setAttribute('role', 'menu');
    dropdown.setAttribute('aria-label', ctext('filterOptions', 'Filter options'));
    dropdown.style.display = 'none';
    this.dropdown = dropdown;
    const reset = document.createElement('div');
    reset.className = 'opensheets-tc-filter-option';
    reset.setAttribute('role', 'menuitem');
    reset.setAttribute('aria-label', ctext('resetAll', 'Reset All'));
    reset.textContent = ctext('resetAll', 'Reset All');
    reset.addEventListener('click', () => {
      this.filter = ThreadedCommentFilterType.None;
      this.updateFilterUi();
      this.render();
    });
    const separator = document.createElement('div');
    separator.className = 'opensheets-tc-filter-separator';
    separator.setAttribute('role', 'presentation');
    separator.textContent = ctext('filterBy', 'Filter By');
    const option = (label: string, kind: ThreadedCommentFilterType): HTMLElement => {
      const row = document.createElement('div');
      row.className = 'opensheets-tc-filter-option';
      row.setAttribute('role', 'menuitemcheckbox');
      row.setAttribute('aria-label', label);
      const box = document.createElement('span');
      box.className = 'opensheets-tc-filter-checkbox';
      row.append(box, Object.assign(document.createElement('span'), { textContent: label }));
      row.addEventListener('click', () => {
        this.filter ^= kind;
        this.updateFilterUi();
        this.render();
      });
      return row;
    };
    const options = [
      option(ctext('mentionsMe', '@mentions Me'), ThreadedCommentFilterType.MentionsMe),
      option(ctext('activeOnly', 'Active Only'), ThreadedCommentFilterType.ActiveOnly),
      option(ctext('resolvedOnly', 'Resolved Only'), ThreadedCommentFilterType.ResolvedOnly),
    ];
    dropdown.append(reset, separator, ...options);
    filterButton.addEventListener('click', () => {
      const open = dropdown.style.display === 'none';
      dropdown.style.display = open ? '' : 'none';
      filterButton.setAttribute('aria-expanded', String(open));
    });
    filterWrap.append(filterButton, dropdown);
    buttons.append(addButton, count, filterWrap);
    header.append(title, buttons);

    const scrollable = document.createElement('div');
    scrollable.className = 'opensheets-tc-scrollable';
    scrollable.setAttribute('role', 'main');
    const list = document.createElement('div');
    list.className = 'opensheets-tc-list';
    list.setAttribute('role', 'list');
    list.setAttribute('aria-label', ctext('list', 'Threaded comments list'));
    this.listElement = list;
    const navigate = document.createElement('div');
    navigate.className = 'opensheets-tc-navigate';
    navigate.setAttribute('role', 'button');
    navigate.setAttribute('aria-label', ctext('seeMore', 'See more comments'));
    navigate.append(
      Object.assign(document.createElement('span'), { textContent: ctext('seeMore', 'See more comments') }),
      Object.assign(document.createElement('div'), { className: 'opensheets-tc-navigate-icon' }),
    );
    navigate.addEventListener('click', () => { scrollable.scrollTop = scrollable.scrollHeight; });
    scrollable.append(list, navigate);
    this.scrollElement = scrollable;
    this.navigateElement = navigate;
    scrollable.addEventListener('scroll', () => this.updateNavigate());

    root.append(header, scrollable);
    this.root = root;
    this.host.appendChild(root);
    document.addEventListener('click', this.documentClosed);
    this.updateFilterUi();
    this.render();
    if (workbook) this.attach(workbook);
  }

  private manager(): ThreadedCommentManager | undefined {
    return this.wb?.getActiveSheet().threadedComments;
  }

  private filtered(): ThreadedComment[] {
    const threads = this.manager()?.all() ?? [];
    const me = UserManager.current();
    return threads.filter((thread) => {
      if ((this.filter & ThreadedCommentFilterType.ActiveOnly) !== 0 && thread.resolved()) return false;
      if ((this.filter & ThreadedCommentFilterType.ResolvedOnly) !== 0 && !thread.resolved()) return false;
      if ((this.filter & ThreadedCommentFilterType.MentionsMe) !== 0) {
        if (!me) return false;
        const mentioned = thread.all().some((reply) =>
          (reply.message ?? []).some((block) => block.type === ContentType.mention && (block as IMentionBlock).userId === me));
        if (!mentioned) return false;
      }
      return true;
    });
  }

  /** Attaches the panel to a workbook; comment changes update it automatically. */
  attach(workbook: Workbook): void {
    this.detachEvents();
    this.wb = workbook;
    workbook.bind(Events.ActiveSheetChanged, this.sheetChanged);
    this.bindSheet();
    this.render();
  }

  /** Unbinds the workbook. The trial keeps the rendered DOM after detach. */
  detach(): void {
    this.detachEvents();
  }

  private bindSheet(): void {
    if (!this.wb) return;
    const sheet = this.wb.getActiveSheet();
    if (this.boundSheet === sheet) return;
    this.unbindSheet();
    this.boundSheet = sheet;
    sheet.bind(Events.ThreadedCommentChanged, this.changed);
  }

  private unbindSheet(): void {
    if (this.boundSheet) {
      try { this.boundSheet.unbind(Events.ThreadedCommentChanged, this.changed); } catch { /* ignore */ }
      this.boundSheet = undefined;
    }
  }

  private detachEvents(): void {
    if (this.wb) this.wb.unbind(Events.ActiveSheetChanged, this.sheetChanged);
    this.unbindSheet();
    this.wb = undefined;
  }

  /** Re-renders the comment list. */
  refresh(): void {
    this.render();
  }

  /** Removes the panel DOM from the host and unregisters the control. */
  destroy(): void {
    this.detachEvents();
    document.removeEventListener('click', this.documentClosed);
    this.root.remove();
    unregisterControl(this.host);
  }

  /** Gets the panel for a host element or host element id; null when unknown. */
  static findControl(host: HTMLElement | string): ThreadedCommentPanel | null {
    const element = typeof host === 'string' ? document.getElementById(host) : host;
    if (!element) return null;
    return findRegisteredControl<ThreadedCommentPanel>(element) ?? null;
  }

  /** Prototype member of the d.ts declaration: same lookup as the static. */
  findControl(host: HTMLElement | string): ThreadedCommentPanel | null {
    return ThreadedCommentPanel.findControl(host);
  }

  private updateFilterUi(): void {
    const kinds: [ThreadedCommentFilterType, HTMLElement | undefined][] = [];
    if (this.dropdown) {
      const rows = [...this.dropdown.querySelectorAll<HTMLElement>('.opensheets-tc-filter-option')].slice(1);
      kinds.push([ThreadedCommentFilterType.MentionsMe, rows[0]], [ThreadedCommentFilterType.ActiveOnly, rows[1]], [ThreadedCommentFilterType.ResolvedOnly, rows[2]]);
    }
    let active = 0;
    for (const [kind, row] of kinds) {
      const on = (this.filter & kind) !== 0;
      if (row) {
        row.setAttribute('aria-checked', String(on));
        const box = row.querySelector('.opensheets-tc-filter-checkbox');
        if (box) box.classList.toggle('checked', on);
      }
      if (on) active++;
    }
    if (this.badgeElement) {
      this.badgeElement.textContent = active > 0 ? String(active) : '';
      this.badgeElement.style.display = active > 0 ? '' : 'none';
    }
  }

  /**
   * "New" (trial probe2 afterNew): inserts a draft card for the active cell —
   * no thread exists yet, the card carries the 1-based aria position and no
   * data-comment-key; posting it commits `threadedComments.add(row, col, ...)`.
   */
  private openDraftCard(): void {
    if (!this.wb) return;
    const sheet = this.wb.getActiveSheet();
    const row = sheet.getActiveRowIndex();
    const col = sheet.getActiveColumnIndex();
    const existing = this.listElement?.querySelector<HTMLElement>(`[data-row="${row}"][data-col="${col}"]`);
    if (existing) { existing.querySelector<HTMLElement>('.opensheets-tc-editor')?.focus(); return; }
    if (this.draft) this.draft.element.remove();
    const element = this.buildCard({ row, col, thread: undefined, draft: true });
    this.draft = { row, col, element };
    this.listElement?.appendChild(element);
    element.querySelector<HTMLElement>('.opensheets-tc-editor')?.focus();
    this.updateNavigate();
  }

  /** Posts a reply (or the draft thread) from an editor element. */
  private post(editor: HTMLElement, thread: ThreadedComment | undefined, draft: { row: number; col: number } | undefined): void {
    const blocks = editorBlocks(editor);
    const hasText = blocks.some((block) => block.type !== ContentType.text || String((block as { value?: string }).value ?? '').trim());
    if (!hasText) { editor.textContent = ''; this.hideButtons(editor); return; }
    const authorId = UserManager.current() ?? UserManager.guestId() ?? '';
    const reply = { message: blocks, createdAt: new Date(), authorId };
    if (thread) thread.add(reply);
    else if (draft) this.manager()?.add(draft.row, draft.col, [reply]);
    this.draft = undefined;
    this.render();
  }

  /** Builds one card (stored thread or draft); the trial layout: reference +
   *  "More options", per-reply avatars/names/timestamps, reply editor, menu. */
  private buildCard(spec: { row: number; col: number; thread?: ThreadedComment; draft?: boolean }): HTMLElement {
    const { row, col, thread, draft } = spec;
    const resolved = !!thread?.resolved();
    const item = document.createElement('div');
    item.className = 'opensheets-tc-item';
    item.setAttribute('role', 'listitem');
    item.setAttribute('aria-label', ctext('itemAria', 'Threaded comment at row {0}, column {1}', row + 1, col + 1));
    item.dataset.row = String(row);
    item.dataset.col = String(col);
    // Trial card (probe panels46g): data-comment-key "<row>_<col>" — drafts have none.
    if (!draft) item.dataset.commentKey = `${row}_${col}`;
    const container = document.createElement('div');
    container.className = 'opensheets-tc-comment';
    container.setAttribute('role', 'article');
    container.setAttribute('aria-label', ctext('item', 'Threaded comment'));

    if (resolved) {
      const banner = document.createElement('div');
      banner.className = 'opensheets-tc-resolved';
      banner.setAttribute('role', 'banner');
      banner.setAttribute('aria-label', ctext('resolvedItem', 'Resolved threaded comment'));
      const left = document.createElement('div');
      left.className = 'opensheets-tc-resolved-left';
      const check = document.createElement('div');
      check.className = 'opensheets-tc-resolved-check';
      check.title = ctext('resolved', 'Resolved');
      check.append(icon('check', 18));
      const label = document.createElement('div');
      label.className = 'opensheets-tc-resolved-label';
      label.textContent = ctext('resolved', 'Resolved');
      left.append(check, label);
      const right = document.createElement('div');
      right.className = 'opensheets-tc-resolved-right';
      const reopen = document.createElement('div');
      reopen.className = 'opensheets-tc-resolved-action';
      reopen.setAttribute('role', 'button');
      reopen.setAttribute('aria-label', ctext('reopenThread', 'Reopen Thread'));
      reopen.title = ctext('reopenThread', 'Reopen Thread');
      reopen.append(icon('reopen', 18));
      reopen.addEventListener('click', () => { thread?.resolved(false); this.render(); });
      const remove = document.createElement('div');
      remove.className = 'opensheets-tc-resolved-action';
      remove.setAttribute('role', 'button');
      remove.setAttribute('aria-label', ctext('deleteThread', 'Delete Thread'));
      remove.title = ctext('deleteThread', 'Delete Thread');
      remove.append(icon('close', 18));
      remove.addEventListener('click', () => { this.manager()?.remove(row, col); this.render(); });
      right.append(reopen, remove);
      banner.append(left, right);
      container.appendChild(banner);
    }

    // Card head: cell reference text + the "More options" settings button.
    const head = document.createElement('div');
    head.className = 'opensheets-tc-head';
    const ref = document.createElement('span');
    ref.className = 'opensheets-tc-ref';
    ref.textContent = `${columnLabel(col)}${row + 1}`;
    const settings = document.createElement('div');
    settings.className = 'opensheets-tc-settings';
    settings.setAttribute('role', 'button');
    settings.setAttribute('aria-label', ctext('moreOptions', 'More options'));
    settings.title = ctext('moreOptions', 'More options');
    settings.setAttribute('aria-haspopup', 'true');
    settings.setAttribute('aria-expanded', 'false');
    settings.append(icon('dots', 16));
    head.append(ref, settings);
    container.appendChild(head);

    const repliesBox = document.createElement('div');
    repliesBox.className = 'opensheets-tc-replies';
    for (const reply of thread?.all() ?? []) {
      const author = reply.authorId ?? '';
      const name = displayName(author);
      const rowEl = document.createElement('div');
      rowEl.className = 'opensheets-tc-reply';
      rowEl.setAttribute('role', 'article');
      rowEl.setAttribute('aria-label', ctext('replyItem', 'Threaded comment reply'));
      const avatar = document.createElement('span');
      avatar.className = 'opensheets-tc-avatar';
      avatar.textContent = (name[0] ?? 'G').toUpperCase();
      avatar.style.background = userColor(author);
      const message = document.createElement('div');
      message.className = 'opensheets-tc-message';
      const top = document.createElement('div');
      top.className = 'opensheets-tc-message-head';
      const authorEl = document.createElement('span');
      authorEl.className = 'opensheets-tc-author';
      authorEl.textContent = name;
      authorEl.title = name;
      top.append(authorEl);
      if (!resolved) {
        // Active threads give every reply its own "More options" button; it
        // opens the card options menu (trial probe2: one shared card menu).
        const replySettings = document.createElement('div');
        replySettings.className = 'opensheets-tc-settings opensheets-tc-reply-settings';
        replySettings.setAttribute('role', 'button');
        replySettings.setAttribute('aria-label', ctext('moreOptions', 'More options'));
        replySettings.title = ctext('moreOptions', 'More options');
        replySettings.setAttribute('aria-haspopup', 'true');
        replySettings.setAttribute('aria-expanded', 'false');
        replySettings.append(icon('dots', 16));
        replySettings.addEventListener('click', (event) => {
          event.stopPropagation();
          toggleMenu(replySettings, menu);
        });
        top.append(replySettings);
      }
      message.appendChild(top);
      const text = document.createElement('div');
      text.className = 'opensheets-tc-text';
      for (const block of reply.message ?? []) {
        if (block.type === ContentType.mention) {
          const chip = document.createElement('span');
          chip.className = CHIP_CLASS;
          chip.dataset.userId = block.userId;
          chip.textContent = `@${displayName(block.userId)}`;
          text.appendChild(chip);
        } else if (block.type === ContentType.link) {
          const link = document.createElement('span');
          link.className = 'opensheets-tc-link';
          link.textContent = block.text || block.href || '';
          text.appendChild(link);
        } else {
          const span = document.createElement('span');
          span.textContent = block.value ?? '';
          text.appendChild(span);
        }
      }
      message.appendChild(text);
      const stamp = document.createElement('span');
      stamp.className = 'opensheets-tc-time';
      stamp.textContent = trialTimestamp(reply.createdAt);
      message.appendChild(stamp);
      rowEl.append(avatar, message);
      repliesBox.appendChild(rowEl);
    }
    container.appendChild(repliesBox);

    // Reply editor (the trial shows it on resolved cards too; probe3 posted a
    // reply into a resolved thread and the thread stayed resolved).
    const editorWrap = document.createElement('div');
    editorWrap.className = 'opensheets-tc-editor-wrap';
    const editor = document.createElement('div');
    editor.className = 'opensheets-tc-editor';
    editor.setAttribute('contenteditable', 'true');
    editor.setAttribute('data-placeholder', ctext('mentionReply', '@mention or reply'));
    const buttons = document.createElement('div');
    buttons.className = 'opensheets-tc-editor-buttons';
    const postButton = document.createElement('button');
    postButton.type = 'button';
    postButton.className = 'opensheets-tc-editor-post';
    postButton.title = ctext('postComment', 'Post Comment');
    postButton.setAttribute('aria-label', ctext('postComment', 'Post Comment'));
    postButton.append(icon('post', 16));
    const cancelButton = document.createElement('button');
    cancelButton.type = 'button';
    cancelButton.className = 'opensheets-tc-editor-cancel';
    cancelButton.title = ctext('cancel', 'Cancel');
    cancelButton.setAttribute('aria-label', ctext('cancel', 'Cancel'));
    cancelButton.append(icon('close', 16));
    buttons.append(postButton, cancelButton);
    const mentionList = document.createElement('div');
    mentionList.className = 'opensheets-tc-mention-list';
    mentionList.setAttribute('role', 'listbox');
    mentionList.style.display = 'none';
    editorWrap.append(editor, buttons, mentionList);
    container.appendChild(editorWrap);

    const showButtons = (): void => buttons.classList.add('visible');
    const hideButtons = (clear?: boolean): void => {
      buttons.classList.remove('visible');
      if (clear) editor.textContent = '';
      mentionList.style.display = 'none';
    };
    editor.addEventListener('focus', showButtons);
    editor.addEventListener('input', () => {
      if (editor.textContent?.trim() || editor.querySelector(`.${CHIP_CLASS}`)) showButtons();
      this.updateMentions(editor, mentionList, () => hideButtons(true));
    });
    editor.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        this.post(editor, thread, draft ? { row, col } : undefined);
      }
      if (event.key === 'Escape') hideButtons(true);
    });
    editor.addEventListener('blur', () => {
      // Trial keeps a typed draft; an empty editor just collapses the buttons.
      if (!editor.textContent?.trim() && !editor.querySelector(`.${CHIP_CLASS}`)) hideButtons();
    });
    postButton.addEventListener('click', () => this.post(editor, thread, draft ? { row, col } : undefined));
    cancelButton.addEventListener('click', () => {
      if (draft) { this.draft = undefined; item.remove(); this.updateNavigate(); return; }
      hideButtons(true);
    });

    // Card options menu (trial order: Delete Thread, Resolve Thread; the same
    // menu serves active and resolved cards — probe3 resolvedMenuItems).
    const menu = document.createElement('div');
    menu.className = 'opensheets-tc-menu-items opensheets-tc-menu';
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', ctext('optionsMenu', 'Threaded comment options menu'));
    const menuItem = (labelKey: string, fallback: string, glyph: 'close' | 'check', action: () => void): HTMLElement => {
      const rowItem = document.createElement('div');
      rowItem.className = 'opensheets-tc-menu-item';
      rowItem.setAttribute('role', 'menuitem');
      rowItem.setAttribute('aria-label', ctext(labelKey, fallback));
      rowItem.append(icon(glyph, 16), Object.assign(document.createElement('span'), { textContent: ctext(labelKey, fallback) }));
      rowItem.addEventListener('click', (event) => {
        event.stopPropagation();
        menu.classList.remove('open');
        settings.setAttribute('aria-expanded', 'false');
        action();
      });
      return rowItem;
    };
    menu.append(
      menuItem('deleteThread', 'Delete Thread', 'close', () => { this.manager()?.remove(row, col); this.render(); }),
      menuItem('resolveThread', 'Resolve Thread', 'check', () => { thread?.resolved(!thread.resolved()); this.render(); }),
    );
    const toggleMenu = (trigger: HTMLElement, target: HTMLElement): void => {
      const open = !target.classList.contains('open');
      target.classList.toggle('open', open);
      trigger.setAttribute('aria-expanded', String(open));
      for (const other of Array.from(container.querySelectorAll<HTMLElement>('.opensheets-tc-settings'))) if (other !== trigger) other.setAttribute('aria-expanded', 'false');
    };
    settings.addEventListener('click', (event) => {
      event.stopPropagation();
      toggleMenu(settings, menu);
    });
    container.appendChild(menu);
    item.appendChild(container);
    return item;
  }

  /** '@' mention picker (trial: user list, empty state "Couldn't find any matches"). */
  private updateMentions(editor: HTMLElement, list: HTMLElement, hide: () => void): void {
    const text = editor.textContent ?? '';
    const match = /@([\w.-]*)$/.exec(text);
    if (!match) { list.style.display = 'none'; return; }
    const query = match[1] ?? '';
    void UserManager.search(query).then((users) => {
      const current = this.listElement?.contains(list) ? users : undefined;
      if (!current) return;
      list.replaceChildren();
      if (!current.length) {
        const empty = document.createElement('div');
        empty.className = 'opensheets-tc-mention-empty';
        empty.textContent = ctext('noMatches', "Couldn't find any matches");
        list.appendChild(empty);
      } else {
        for (const user of current.slice(0, 8)) {
          const row = document.createElement('div');
          row.className = 'opensheets-tc-mention-option';
          row.setAttribute('role', 'option');
          row.setAttribute('aria-label', user.name);
          row.textContent = `@${user.name}`;
          row.addEventListener('mousedown', (event) => {
            event.preventDefault();
            this.insertMention(editor, user.id, user.name);
            list.style.display = 'none';
            editor.focus();
          });
          list.appendChild(row);
        }
      }
      list.style.display = '';
    }).catch(hide);
  }

  /** Replace the trailing `@query` in the editor with a mention chip. */
  private insertMention(editor: HTMLElement, userId: string, name: string): void {
    const chip = document.createElement('span');
    chip.className = CHIP_CLASS;
    chip.dataset.userId = userId;
    chip.contentEditable = 'false';
    chip.textContent = `@${name}`;
    const nodes = Array.from(editor.childNodes);
    for (let index = nodes.length - 1; index >= 0; index--) {
      const node = nodes[index]!;
      if (node.nodeType !== 3) continue;
      const data = node.textContent ?? '';
      const at = data.lastIndexOf('@');
      if (at < 0) continue;
      node.textContent = data.slice(0, at);
      for (const after of nodes.slice(index + 1)) {
        const tail = after.nodeType === 3 ? (after.textContent ?? '') : '';
        if (!/^[\w.-]*$/.test(tail)) break; // only the query part belongs to the mention
        after.remove();
      }
      if (!node.textContent) node.remove();
      editor.insertBefore(chip, node ? (node.nextSibling) : null);
      editor.append(document.createTextNode(' '));
      return;
    }
    editor.appendChild(chip);
  }

  private hideButtons(editor: HTMLElement): void {
    const buttons = editor.parentElement?.querySelector<HTMLElement>('.opensheets-tc-editor-buttons');
    buttons?.classList.remove('visible');
  }

  private render(): void {
    const list = this.listElement;
    const count = this.countElement;
    if (!list) return;
    const draft = this.draft && list.contains(this.draft.element) ? this.draft : undefined;
    const threads = this.filtered();
    if (count) count.textContent = threads.length === 1 ? ctext('itemOne', '{0} item', threads.length) : ctext('itemsMany', '{0} items', threads.length);
    list.replaceChildren();
    for (const thread of threads) list.appendChild(this.buildCard({ row: thread.row(), col: thread.col(), thread }));
    if (draft) {
      // Keep the draft card across re-renders (auto-update events arrive while the user types).
      list.appendChild(draft.element);
    }
    this.updateNavigate();
  }

  /**
   * Trial behaviour (probes panels46i/46j/46n): the footer always exists in the DOM; its
   * show/hide follows the add-on's internal paging (observed hidden in every fresh-workbook
   * layout we probed, shown in the panels46e run). We keep it hidden by default and let a
   * click scroll the list to the end; the visibility rule is recorded as a known gap in
   * docs/STATUS.md (TASK 46 item 4).
   */
  private updateNavigate(): void {
    if (this.navigateElement) this.navigateElement.classList.remove('visible');
  }
}
