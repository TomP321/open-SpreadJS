// @vitest-environment jsdom
/*
 * TASK 95 item 1 — ThreadedCommentPanel rebuilt on the official DOM measured
 * black-box on the core page (probes .probe/t95/out/panel.json, panel2.json,
 * resolved.json; official web components observed through the public API and
 * their rendered light/shadow DOM structure only):
 *  - the region root carries aria-label "Threaded Comments" (the trial root);
 *  - the card head shows the cell reference ("C3") plus a "More options"
 *    settings button (role=button, aria-haspopup true, aria-expanded state);
 *    every reply of an ACTIVE thread carries its own "More options" button
 *    that opens the same card menu; resolved cards have the card-level button
 *    only (probe2: 3 buttons for 1 card + 2 replies; probe1: resolved replies
 *    have none);
 *  - the card menu (role=menu, aria-label "Threaded comment options menu")
 *    lists "Delete Thread" then "Resolve Thread" — identical on active and
 *    resolved cards (probe2 replyMenuItems, probe3 resolvedMenuItems);
 *  - each reply is an article "Threaded comment reply" with a 24 px avatar,
 *    the author name and a timestamp rendered "1/2/2026 11:00:00" (wall-clock
 *    local fields, probe3 timestamps);
 *  - the reply editor is contenteditable with data-placeholder
 *    "@mention or reply" (probe2 editorDump); its "Post Comment"/"Cancel"
 *    buttons appear while editing (buttons-container hidden → visible, probe2
 *    buttonsBefore/buttonsAfterFocus); Post appends a reply authored by
 *    UserManager.current() (probe3 authorId "{GUID}");
 *  - resolved threads accept replies and stay resolved (probe3
 *    resolvedRepliesAfterPost/resolvedStillResolved);
 *  - typing "@" opens the mention picker; with no matches the trial shows
 *    "Couldn't find any matches" (probe2 mentionTexts), a picked user posts a
 *    ContentType.mention block;
 *  - "New" inserts a draft card for the active cell WITHOUT touching the
 *    model (probe2 afterNew: card "Threaded comment at row 6, column 6" while
 *    threadedComments.size() stayed 2).
 */
import { describe, expect, it } from 'vitest';
import GC from '../src/index.js';
import { ContentType, type IReply } from '../src/threaded-comments.js';
import { UserManager } from '../src/user-manager.js';

const { Workbook } = GC.Spread.Sheets;
const { ThreadedCommentPanel } = GC.Spread.Sheets.ThreadedComments;

let hostCount = 0;
const hosts: HTMLElement[] = [];
function makeHost(width = 320, height = 460): HTMLElement {
  const host = document.createElement('div');
  host.id = `t95panel-host-${hostCount++}`;
  host.style.cssText = `position:absolute;left:0;top:0;width:${width}px;height:${height}px`;
  document.body.appendChild(host);
  hosts.push(host);
  return host;
}

const reply = (text: string, at?: Date): IReply => ({
  message: [{ type: ContentType.text, value: text }],
  createdAt: at ?? new Date(2026, 0, 2, 11, 0, 0),
  authorId: 'u1',
});

function openPanel(threads: { row: number; col: number; replies?: { text: string; at?: Date }[]; resolved?: boolean }[] = []) {
  const wb = new Workbook();
  const sheet = wb.getSheet(0);
  for (const t of threads) {
    const tc = sheet.threadedComments.add(t.row, t.col, (t.replies ?? [{ text: 'thread' }]).map((r) => reply(r.text, r.at)))!;
    if (t.resolved) tc.resolved(true);
  }
  const host = makeHost();
  const panel = new ThreadedCommentPanel(host, wb);
  return { wb, sheet, host, panel };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 10));

describe('ThreadedCommentPanel (TASK 95 trial structure)', () => {
  it('the region root and the header follow the trial aria labels', () => {
    const { host, panel, wb } = openPanel();
    const root = host.querySelector('.opensheets-threaded-comment-panel')!;
    expect(root.getAttribute('role')).toBe('region');
    expect(root.getAttribute('aria-label')).toBe('Threaded Comments');
    expect(host.querySelector('.opensheets-tc-header')!.getAttribute('role')).toBe('banner');
    const filter = host.querySelector<HTMLElement>('.opensheets-tc-filter')!;
    expect(filter.getAttribute('aria-haspopup')).toBe('true');
    expect(filter.getAttribute('aria-expanded')).toBe('false');
    filter.click();
    expect(filter.getAttribute('aria-expanded')).toBe('true');
    filter.click();
    expect(filter.getAttribute('aria-expanded')).toBe('false');
    panel.destroy();
    wb.destroy();
  });

  it('card head: trial cell reference + "More options"; replies: avatar, author, timestamp, own "More options" (active threads)', () => {
    const { host, panel, wb } = openPanel([
      { row: 2, col: 2, replies: [{ text: 'Second thread', at: new Date(2026, 0, 2, 11, 0, 0) }, { text: 'inner reply', at: new Date(2026, 0, 3, 11, 0, 0) }] },
    ]);
    const card = host.querySelector('[data-comment-key="2_2"]')!;
    expect(card.querySelector('.opensheets-tc-ref')!.textContent).toBe('C3');
    // probe2 moreButtonCount 3 = card settings + one per reply on an active thread.
    expect(card.querySelectorAll('[aria-label="More options"]').length).toBe(3);
    const replies = [...card.querySelectorAll('.opensheets-tc-reply')];
    expect(replies.map((r) => r.getAttribute('role'))).toEqual(['article', 'article']);
    expect(replies.map((r) => r.getAttribute('aria-label'))).toEqual(['Threaded comment reply', 'Threaded comment reply']);
    expect([...card.querySelectorAll('.opensheets-tc-avatar')].map((a) => a.textContent)).toEqual(['G', 'G']);
    expect([...card.querySelectorAll('.opensheets-tc-author')].map((a) => a.getAttribute('title'))).toEqual(['Guest', 'Guest']);
    // probe3 timestamps: "1/2/2026 11:00:00" — wall-clock local fields (tests run TZ=UTC).
    expect([...card.querySelectorAll('.opensheets-tc-time')].map((t) => t.textContent))
      .toEqual(['1/2/2026 11:00:00', '1/3/2026 11:00:00']);
    panel.destroy();
    wb.destroy();
  });

  it('resolved cards: trial button set Reopen Thread / Delete Thread / one "More options", no per-reply settings', () => {
    const { host, panel, wb } = openPanel([
      { row: 0, col: 0, replies: [{ text: 'Resolved thread', at: new Date(2026, 0, 1, 11, 0, 0) }], resolved: true },
    ]);
    const card = host.querySelector('[data-comment-key="0_0"]')!;
    expect([...card.querySelectorAll('[role="button"]')].map((b) => b.getAttribute('aria-label')))
      .toEqual(['Reopen Thread', 'Delete Thread', 'More options']);
    expect(card.querySelectorAll('[aria-label="More options"]').length).toBe(1);
    panel.destroy();
    wb.destroy();
  });

  it('post flow: buttons appear on focus/input, Post Comment appends a reply authored by the current user', () => {
    const { host, panel, wb, sheet } = openPanel([{ row: 2, col: 2, replies: [{ text: 'thread' }] }]);
    const card = host.querySelector('[data-comment-key="2_2"]')!;
    const editor = card.querySelector<HTMLElement>('.opensheets-tc-editor')!;
    const buttons = card.querySelector<HTMLElement>('.opensheets-tc-editor-buttons')!;
    expect(buttons.className).not.toContain('visible');
    editor.dispatchEvent(new FocusEvent('focus'));
    expect(buttons.className).toContain('visible');
    editor.textContent = 'nice';
    editor.dispatchEvent(new InputEvent('input'));
    card.querySelector<HTMLElement>('.opensheets-tc-editor-post')!.click();
    const thread = sheet.threadedComments.get(2, 2)!;
    const replies = thread.all();
    expect(replies.length).toBe(2);
    expect(replies[1].authorId).toBe(UserManager.current());
    expect(replies[1].message).toEqual([{ type: ContentType.text, value: 'nice' }]);
    expect(replies[1].createdAt instanceof Date).toBe(true);
    panel.destroy();
    wb.destroy();
  });

  it('Enter posts, Escape/Clear without text posts nothing; the Cancel button drops the typed text', () => {
    const { host, panel, wb, sheet } = openPanel([{ row: 1, col: 1, replies: [{ text: 'thread' }] }]);
    const card = host.querySelector('[data-comment-key="1_1"]')!;
    const editor = card.querySelector<HTMLElement>('.opensheets-tc-editor')!;
    editor.textContent = 'via enter';
    editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(sheet.threadedComments.get(1, 1)!.all().length).toBe(2);
    const card2 = host.querySelector('[data-comment-key="1_1"]')!;
    const editor2 = card2.querySelector<HTMLElement>('.opensheets-tc-editor')!;
    editor2.textContent = 'typed but cancelled';
    editor2.dispatchEvent(new InputEvent('input'));
    card2.querySelector<HTMLElement>('.opensheets-tc-editor-cancel')!.click();
    expect(sheet.threadedComments.get(1, 1)!.all().length).toBe(2);
    expect(card2.querySelector<HTMLElement>('.opensheets-tc-editor')!.textContent).toBe('');
    editor2.textContent = 'escape me';
    editor2.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(editor2.textContent).toBe('');
    panel.destroy();
    wb.destroy();
  });

  it('resolved threads accept replies through the same editor and stay resolved (probe3)', () => {
    const { host, panel, wb, sheet } = openPanel([{ row: 0, col: 0, replies: [{ text: 'resolved' }], resolved: true }]);
    const card = host.querySelector('[data-comment-key="0_0"]')!;
    expect(card.querySelector('.opensheets-tc-editor')).not.toBeNull(); // resolvedHasEditor
    const editor = card.querySelector<HTMLElement>('.opensheets-tc-editor')!;
    editor.dispatchEvent(new FocusEvent('focus'));
    editor.textContent = 'reply into resolved';
    editor.dispatchEvent(new InputEvent('input'));
    card.querySelector<HTMLElement>('.opensheets-tc-editor-post')!.click();
    const thread = sheet.threadedComments.get(0, 0)!;
    expect(thread.all().length).toBe(2); // resolvedRepliesAfterPost
    expect(thread.resolved()).toBe(true); // resolvedStillResolved
    panel.destroy();
    wb.destroy();
  });

  it('the card menu is shared by the reply "More options" buttons and closes on an outside click', () => {
    const { host, panel, wb } = openPanel([{ row: 2, col: 2, replies: [{ text: 'thread' }, { text: 'reply one' }] }]);
    const card = host.querySelector('[data-comment-key="2_2"]')!;
    const replySettings = [...card.querySelectorAll<HTMLElement>('[aria-label="More options"]')].find((b) => b.classList.contains('opensheets-tc-reply-settings'))!;
    replySettings.click();
    const menu = card.querySelector<HTMLElement>('.opensheets-tc-menu')!;
    expect(menu.classList.contains('open')).toBe(true);
    expect(menu.getAttribute('role')).toBe('menu');
    expect(menu.getAttribute('aria-label')).toBe('Threaded comment options menu');
    expect([...menu.querySelectorAll('[role="menuitem"]')].map((i) => i.getAttribute('aria-label')))
      .toEqual(['Delete Thread', 'Resolve Thread']);
    host.click(); // outside click bubbles to the panel document listener
    expect(menu.classList.contains('open')).toBe(false);
    panel.destroy();
    wb.destroy();
  });

  it('mention picker: typed "@query" filters registered users, no match shows the trial empty state, picking posts a mention block', async () => {
    UserManager.register([{ id: 'u-ana', name: 'Ana' }, { id: 'u-wei', name: 'Wei' }]);
    const { host, panel, wb, sheet } = openPanel([{ row: 4, col: 4, replies: [{ text: 'thread' }] }]);
    const card = host.querySelector('[data-comment-key="4_4"]')!;
    const editor = card.querySelector<HTMLElement>('.opensheets-tc-editor')!;
    editor.dispatchEvent(new FocusEvent('focus'));
    editor.textContent = 'hi @an';
    editor.dispatchEvent(new InputEvent('input'));
    await settle();
    const list = card.querySelector<HTMLElement>('.opensheets-tc-mention-list')!;
    expect(list.style.display).not.toBe('none');
    const options = [...list.querySelectorAll<HTMLElement>('[role="option"]')];
    expect(options.map((o) => o.getAttribute('aria-label'))).toEqual(['Ana']);
    options[0].dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect((editor.querySelector<HTMLElement>('.opensheets-tc-mention-chip') as HTMLElement).dataset.userId).toBe('u-ana');
    card.querySelector<HTMLElement>('.opensheets-tc-editor-post')!.click();
    const posted = sheet.threadedComments.get(4, 4)!.all().at(-1)!;
    // "hi " + the mention chip; the editor appends a space after a picked chip
    // so typing can continue (the saved message keeps it as a text block).
    expect(posted.message.slice(0, 2)).toEqual([
      { type: ContentType.text, value: 'hi ' },
      { type: ContentType.mention, userId: 'u-ana' },
    ]);
    // No-match state (probe2 mentionTexts: "Couldn't find any matches").
    const fresh = host.querySelector('[data-comment-key="4_4"]')!;
    const editor2 = fresh.querySelector<HTMLElement>('.opensheets-tc-editor')!;
    editor2.dispatchEvent(new FocusEvent('focus'));
    editor2.textContent = 'x @zz';
    editor2.dispatchEvent(new InputEvent('input'));
    await settle();
    expect(fresh.querySelector('.opensheets-tc-mention-empty')!.textContent).toBe("Couldn't find any matches");
    panel.destroy();
    wb.destroy();
  });

  it('a typed draft survives model auto-updates and posting it creates the thread (New flow, probe2)', () => {
    const { host, panel, wb, sheet } = openPanel();
    sheet.setActiveCell(5, 5);
    host.querySelector<HTMLElement>('button[aria-label="New"]')!.click();
    const draft = host.querySelector<HTMLElement>('.opensheets-tc-list [role="listitem"]')!;
    expect(draft.getAttribute('aria-label')).toBe('Threaded comment at row 6, column 6');
    expect(draft.hasAttribute('data-comment-key')).toBe(false);
    expect(sheet.threadedComments.size()).toBe(0);
    // A model change while the draft is open keeps the draft card and its text.
    sheet.threadedComments.add(0, 0, [reply('other thread')]);
    expect(host.querySelector('[data-comment-key="0_0"]')).not.toBeNull();
    const kept = host.querySelector<HTMLElement>('.opensheets-tc-list [role="listitem"]:not([data-comment-key])')!;
    const editor = kept.querySelector<HTMLElement>('.opensheets-tc-editor')!;
    editor.textContent = 'draft posted';
    kept.querySelector<HTMLElement>('.opensheets-tc-editor-post')!.click();
    expect(sheet.threadedComments.size()).toBe(2);
    expect(sheet.threadedComments.get(5, 5)!.all().at(-1)!.message).toEqual([{ type: ContentType.text, value: 'draft posted' }]);
    expect(host.querySelector('.opensheets-tc-list [role="listitem"]:not([data-comment-key])')).toBeNull();
    panel.destroy();
    wb.destroy();
  });

  it('the draft Cancel removes the draft card without touching the model', () => {
    const { host, panel, wb, sheet } = openPanel();
    sheet.setActiveCell(0, 0);
    host.querySelector<HTMLElement>('button[aria-label="New"]')!.click();
    expect(host.querySelectorAll('.opensheets-tc-list [role="listitem"]').length).toBe(1);
    host.querySelector<HTMLElement>('.opensheets-tc-editor-cancel')!.click();
    expect(host.querySelectorAll('.opensheets-tc-list [role="listitem"]').length).toBe(0);
    expect(sheet.threadedComments.size()).toBe(0);
    panel.destroy();
    wb.destroy();
  });
});
