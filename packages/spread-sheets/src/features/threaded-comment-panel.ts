// GC.Spread.Sheets.ThreadedComments.ThreadedCommentPanel (TASK 46 item 4).
// Contract: core d.ts ThreadedCommentPanel (constructor(host, workbook),
// attach(workbook), detach(), refresh(), destroy(), findControl(host)).
// Trial reference (probe panels46e/panels46g on the official core page): a
// titled side panel with a "New" button, an "<n> items" count block, a filter
// dropdown ("Reset All", separator "Filter By", checkboxes "@mentions Me",
// "Active Only", "Resolved Only"), one list card per threaded comment
// (aria-label "Threaded comment at row R, column C", resolved cards show a
// "Resolved" banner with "Reopen Thread" and "Delete Thread" actions) and a
// "See more comments" footer. attach / detach / refresh / destroy answer
// undefined; destroy empties the host; the panel updates automatically when
// comments change; detach keeps the rendered DOM. The official panel renders
// through web components; ours builds its own light DOM (like the sibling
// controls) with our own class names and icons. `findControl` exists as a
// static on the trial class (observed) and as a prototype member in the d.ts
// declaration, so both are provided.

import { Events, type EventInfo, type ModelEvent } from '../events.js';
import type { Workbook } from '../workbook.js';
import type { Worksheet } from '../worksheet.js';
import { blocksToText, ContentType, resolveCachedUser, textToBlocks, ThreadedCommentFilterType, userColor, type IMentionBlock, type ThreadedComment, type ThreadedCommentManager } from '../threaded-comments.js';
import { columnLabel } from '../rendering.js';
import { UserManager } from '../user-manager.js';
import { findControl as findRegisteredControl, registerControl, unregisterControl } from './controls.js';

function hostElement(host: HTMLElement | string): HTMLElement {
  const element = typeof host === 'string' ? document.getElementById(host) : host;
  if (!element) throw new Error('Control host not found');
  return element;
}

/** Our own 14 px icon glyphs (drawn paths, no bitmaps). */
function icon(name: 'new' | 'filter' | 'more'): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '14');
  svg.setAttribute('height', '14');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  const d =
    name === 'new' ? 'M3 3h7l3 3v7a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V3zM10 3v3h3'
    : name === 'filter' ? 'M3 4h10l-4 4.5V13L7 11v-3.5L3 4z'
    : 'M4 6l4 4 4-4';
  path.setAttribute('d', d);
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '1.3');
  path.setAttribute('stroke-linejoin', 'round');
  svg.appendChild(path);
  return svg;
}

export class ThreadedCommentPanel {
  private host: HTMLElement;
  private root: HTMLElement;
  private listElement?: HTMLElement;
  private countElement?: HTMLElement;
  private badgeElement?: HTMLElement;
  private scrollElement?: HTMLElement;
  private navigateElement?: HTMLElement;
  private dropdown?: HTMLElement;
  private wb?: Workbook;
  private boundSheet?: Worksheet;
  private filter = ThreadedCommentFilterType.None;
  private changed = (): void => { this.render(); };
  private sheetChanged = (_event: ModelEvent, _info: EventInfo): void => { this.bindSheet(); this.render(); };

  constructor(host: HTMLElement | string, workbook: Workbook | undefined) {
    this.host = hostElement(host);
    registerControl(this.host, this);
    const root = document.createElement('div');
    root.className = 'opensheets-threaded-comment-panel';
    root.setAttribute('role', 'region');
    root.setAttribute('aria-label', 'Threaded comments panel');

    const header = document.createElement('div');
    header.className = 'opensheets-tc-header';
    header.setAttribute('role', 'banner');
    const title = document.createElement('div');
    title.className = 'opensheets-tc-title';
    title.textContent = 'Threaded Comments';
    const buttons = document.createElement('div');
    buttons.className = 'opensheets-tc-buttons';
    const addButton = document.createElement('button');
    addButton.type = 'button';
    addButton.className = 'opensheets-tc-new';
    addButton.setAttribute('aria-label', 'New');
    addButton.append(icon('new'), Object.assign(document.createElement('span'), { textContent: 'New' }));
    addButton.addEventListener('click', () => this.openEditor());
    const count = document.createElement('span');
    count.className = 'opensheets-tc-count';
    this.countElement = count;
    const filterWrap = document.createElement('div');
    filterWrap.className = 'opensheets-tc-filter-wrap';
    const filterButton = document.createElement('button');
    filterButton.type = 'button';
    filterButton.className = 'opensheets-tc-filter';
    filterButton.setAttribute('aria-label', 'Filter threaded comments');
    const badge = document.createElement('span');
    badge.className = 'opensheets-tc-filter-badge';
    badge.setAttribute('aria-label', 'Active filters');
    this.badgeElement = badge;
    filterButton.append(icon('filter'), badge);
    const dropdown = document.createElement('div');
    dropdown.className = 'opensheets-tc-filter-dropdown';
    dropdown.setAttribute('role', 'menu');
    dropdown.setAttribute('aria-label', 'Filter options');
    dropdown.style.display = 'none';
    this.dropdown = dropdown;
    const reset = document.createElement('div');
    reset.className = 'opensheets-tc-filter-option';
    reset.setAttribute('role', 'menuitem');
    reset.setAttribute('aria-label', 'Reset All');
    reset.textContent = 'Reset All';
    reset.addEventListener('click', () => {
      this.filter = ThreadedCommentFilterType.None;
      this.updateFilterUi();
      this.render();
    });
    const separator = document.createElement('div');
    separator.className = 'opensheets-tc-filter-separator';
    separator.setAttribute('role', 'presentation');
    separator.textContent = 'Filter By';
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
      option('@mentions Me', ThreadedCommentFilterType.MentionsMe),
      option('Active Only', ThreadedCommentFilterType.ActiveOnly),
      option('Resolved Only', ThreadedCommentFilterType.ResolvedOnly),
    ];
    dropdown.append(reset, separator, ...options);
    filterButton.addEventListener('click', () => {
      dropdown.style.display = dropdown.style.display === 'none' ? '' : 'none';
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
    list.setAttribute('aria-label', 'Threaded comments list');
    this.listElement = list;
    const navigate = document.createElement('div');
    navigate.className = 'opensheets-tc-navigate';
    navigate.setAttribute('role', 'button');
    navigate.setAttribute('aria-label', 'See more comments');
    navigate.append(
      Object.assign(document.createElement('span'), { textContent: 'See more comments' }),
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

  /** Opens an inline editor to add a comment to the active cell (own DOM). */
  private openEditor(): void {
    if (!this.wb) return;
    const sheet = this.wb.getActiveSheet();
    const row = sheet.getActiveRowIndex();
    const col = sheet.getActiveColumnIndex();
    const existing = this.listElement?.querySelector<HTMLElement>(`[data-row="${row}"][data-col="${col}"] .opensheets-tc-editor`);
    if (existing) { existing.focus(); return; }
    const editor = document.createElement('textarea');
    editor.className = 'opensheets-tc-editor';
    editor.setAttribute('aria-label', 'New threaded comment');
    editor.rows = 2;
    const commit = (): void => {
      const text = editor.value.trim();
      editor.remove();
      if (text) {
        sheet.threadedComments.add(row, col, [{
          message: textToBlocks(text),
          createdAt: new Date(),
          authorId: UserManager.current() ?? UserManager.guestId() ?? 'guest',
        }]);
      }
      this.render();
    };
    editor.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); commit(); }
      if (event.key === 'Escape') editor.remove();
    });
    editor.addEventListener('blur', commit);
    const target = this.listElement?.querySelector<HTMLElement>(`[data-row="${row}"][data-col="${col}"]`);
    if (target) target.appendChild(editor);
    else {
      // No card yet: show the editor above the list; committing creates the comment.
      this.listElement?.prepend(editor);
    }
    editor.focus();
  }

  private render(): void {
    const list = this.listElement;
    const count = this.countElement;
    if (!list) return;
    const threads = this.filtered();
    if (count) count.textContent = `${threads.length} item${threads.length === 1 ? '' : 's'}`;
    list.replaceChildren();
    for (const thread of threads) {
      const item = document.createElement('div');
      item.className = 'opensheets-tc-item';
      item.setAttribute('role', 'listitem');
      item.setAttribute('aria-label', `Threaded comment at row ${thread.row() + 1}, column ${thread.col() + 1}`);
      item.dataset.row = String(thread.row());
      item.dataset.col = String(thread.col());
      // Trial card (probe panels46g): data-comment-key "<row>_<col>".
      item.dataset.commentKey = `${thread.row()}_${thread.col()}`;
      const container = document.createElement('div');
      container.className = 'opensheets-tc-comment';
      container.setAttribute('role', 'article');
      container.setAttribute('aria-label', 'Threaded comment');
      if (thread.resolved()) {
        const banner = document.createElement('div');
        banner.className = 'opensheets-tc-resolved';
        banner.setAttribute('role', 'banner');
        banner.setAttribute('aria-label', 'Resolved threaded comment');
        const label = document.createElement('div');
        label.className = 'opensheets-tc-resolved-label';
        label.textContent = 'Resolved';
        const reopen = document.createElement('div');
        reopen.className = 'opensheets-tc-resolved-action';
        reopen.setAttribute('role', 'button');
        reopen.setAttribute('aria-label', 'Reopen Thread');
        reopen.title = 'Reopen Thread';
        reopen.textContent = '↺';
        reopen.addEventListener('click', () => { thread.resolved(false); this.render(); });
        const remove = document.createElement('div');
        remove.className = 'opensheets-tc-resolved-action';
        remove.setAttribute('role', 'button');
        remove.setAttribute('aria-label', 'Delete Thread');
        remove.title = 'Delete Thread';
        remove.textContent = '×';
        remove.addEventListener('click', () => { this.manager()?.remove(thread.row(), thread.col()); this.render(); });
        banner.append(label, reopen, remove);
        container.appendChild(banner);
      }
      const replies = thread.all();
      const headRow = document.createElement('div');
      headRow.className = 'opensheets-tc-head';
      const firstAuthor = replies[0]?.authorId ?? '';
      const displayName = (id: string): string => resolveCachedUser(id)?.name || 'Guest';
      const initial = (displayName(firstAuthor)[0] ?? 'G').toUpperCase();
      const avatar = document.createElement('span');
      avatar.className = 'opensheets-tc-avatar';
      avatar.textContent = initial;
      avatar.style.background = userColor(firstAuthor);
      const author = document.createElement('span');
      author.className = 'opensheets-tc-author';
      author.textContent = displayName(firstAuthor);
      const tag = document.createElement('span');
      tag.className = 'opensheets-tc-tag';
      tag.textContent = `${columnLabel(thread.col())}${thread.row() + 1}`;
      const menuButton = document.createElement('button');
      menuButton.type = 'button';
      menuButton.className = 'opensheets-tc-menu';
      menuButton.setAttribute('aria-label', 'Threaded comment options menu');
      menuButton.title = 'Threaded comment options menu';
      menuButton.textContent = '⚙';
      headRow.append(avatar, author, tag, menuButton);
      container.appendChild(headRow);
      const repliesBox = document.createElement('div');
      repliesBox.className = 'opensheets-tc-replies';
      for (const reply of replies) {
        const rowEl = document.createElement('div');
        rowEl.className = 'opensheets-tc-reply';
        const text = document.createElement('span');
        text.className = 'opensheets-tc-text';
        text.textContent = blocksToText(reply.message);
        rowEl.append(text);
        repliesBox.appendChild(rowEl);
      }
      container.appendChild(repliesBox);
      if (!thread.resolved()) {
        const editor = document.createElement('input');
        editor.className = 'opensheets-tc-reply-editor';
        editor.setAttribute('aria-label', '@mention or reply');
        editor.placeholder = '@mention or reply';
        editor.addEventListener('keydown', (event) => {
          if (event.key !== 'Enter') return;
          event.preventDefault();
          const value = editor.value.trim();
          if (value) {
            thread.add({ message: textToBlocks(value), createdAt: new Date(), authorId: UserManager.current() ?? UserManager.guestId() ?? '' });
          }
          editor.value = '';
          this.render();
        });
        container.appendChild(editor);
        menuButton.addEventListener('click', () => {
          const existing = container.querySelector('.opensheets-tc-menu-items');
          if (existing) { existing.remove(); return; }
          const menu = document.createElement('div');
          menu.className = 'opensheets-tc-menu-items';
          menu.setAttribute('role', 'menu');
          const resolve = document.createElement('div');
          resolve.setAttribute('role', 'menuitem');
          resolve.textContent = 'Resolve Thread';
          resolve.addEventListener('click', () => { thread.resolved(true); this.render(); });
          const del = document.createElement('div');
          del.setAttribute('role', 'menuitem');
          del.textContent = 'Delete Thread';
          del.addEventListener('click', () => { this.manager()?.remove(thread.row(), thread.col()); this.render(); });
          menu.append(resolve, del);
          container.appendChild(menu);
        });
      }
      item.appendChild(container);
      list.appendChild(item);
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
