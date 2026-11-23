// @vitest-environment jsdom
/* TASK 46 item 4: ScenarioPanel and ThreadedCommentPanel — attach / detach / destroy /
 * refresh / findControl with our own DOM panel.
 *
 * Every expected text, structure and return value here is the trial value recorded by
 * .probe/api-sweep-probe.mjs segments panels46 / panels46d..l (official core page with the
 * corresponding add-on loaded, observed only through the public API):
 *  - both constructors are length 2; attach/detach/refresh answer undefined;
 *  - destroy() empties the host, findControl then returns null, the workbook stays usable;
 *  - detach() keeps the rendered DOM;
 *  - ScenarioPanel: title "Scenarios", Add (disabled until attached) / Restore All /
 *    Delete All, "Activate: <name>" badge (undefined when none), Deactivate button,
 *    scenario list role=list with a permanent "empty" element
 *    ("No Scenarios defined.\nChoose Add to add scenarios") shown only while no scenario is
 *    materialized; cards appear for scenarios materialized by set + setActiveScenario
 *    (probe panels46l: none after set alone, one after activation, sm.all() empty until
 *    activation).
 *  - ThreadedCommentPanel: title "Threaded Comments", New button + "<n> items" count,
 *    filter dropdown ("Reset All", separator "Filter By", checkboxes "@mentions Me",
 *    "Active Only", "Resolved Only"), one list card per thread (role=listitem,
 *    aria-label "Threaded comment at row R, column C", trial data-comment-key "<r>_<c>",
 *    aria-labels row/column 1-based), resolved cards show "Resolved" with "Reopen Thread"
 *    and "Delete Thread", a "See more comments" footer exists and all stored threads are
 *    rendered (probe panels46i/46j: 16 threads, 16 cards; footer hidden when nothing more
 *    scrolls). Adding a comment updates the panel automatically (probe panels46e). */
import { afterEach, describe, expect, it } from 'vitest';
import GC from '../src/index.js';
import { ContentType, textToBlocks, type IContentBlock } from '../src/threaded-comments.js';
import { UserManager } from '../src/user-manager.js';

const { Workbook } = GC.Spread.Sheets;
const { ScenarioPanel } = GC.Spread.Sheets.Scenarios;
const { ThreadedCommentPanel, ThreadedCommentFilterType } = GC.Spread.Sheets.ThreadedComments;

let hostCount = 0;
const hosts: HTMLElement[] = [];
function makeHost(width = 300, height = 460): HTMLElement {
  const host = document.createElement('div');
  host.id = `panel46-host-${hostCount++}`;
  host.style.cssText = `position:absolute;left:0;top:0;width:${width}px;height:${height}px`;
  document.body.appendChild(host);
  hosts.push(host);
  return host;
}

afterEach(() => {
  for (const host of hosts.splice(0)) host.remove();
});

const ownText = (el: Element): string =>
  [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim();

/** Full IReply convenience (the manager fills missing fields itself at runtime). */
const reply = (text: string) => ({ message: textToBlocks(text), createdAt: new Date(), authorId: 'u1' });

/* ------------------------------------------------------------ ScenarioPanel */

describe('ScenarioPanel (trial structure, probe panels46/46d/46f/46l)', () => {
  it('constructor(host, workbook) renders the trial panel structure and returns length 2', () => {
    expect(ScenarioPanel.length).toBe(2);
    const wb = new Workbook();
    const host = makeHost();
    const panel = new ScenarioPanel(host, wb);
    expect(ownText(host.querySelector('.title')!)).toBe('Scenarios');
    const buttons = [...host.querySelectorAll('button')];
    expect(buttons.map((b) => b.getAttribute('aria-label'))).toEqual(['Add', 'Restore All', 'Delete All', 'Deactivate']);
    const addButton = host.querySelector('button[aria-label="Add"]') as HTMLButtonElement;
    expect(addButton.disabled).toBe(false); // constructed with a workbook -> attach ran
    const badge = host.querySelector('.active-badge')!;
    expect(ownText(badge)).toBe('Activate: undefined');
    expect(badge.className).toBe('active-badge');
    const list = host.querySelector('.scenario-list')!;
    expect(list.getAttribute('role')).toBe('list');
    const empty = list.querySelector('.empty')!;
    expect(ownText(empty)).toBe('No Scenarios defined.\nChoose Add to add scenarios');
    expect(empty.className).toBe('empty visible');
    panel.destroy();
    wb.destroy();
  });

  it('constructor(host) without workbook keeps Add disabled until attach()', () => {
    const wb = new Workbook();
    const host = makeHost();
    const panel = new ScenarioPanel(host);
    expect((host.querySelector('button[aria-label="Add"]') as HTMLButtonElement).disabled).toBe(true);
    expect(panel.attach(wb)).toBeUndefined();
    expect((host.querySelector('button[aria-label="Add"]') as HTMLButtonElement).disabled).toBe(false);
    panel.destroy();
    wb.destroy();
  });

  it('accepts a host id string and findControl maps id/element to the panel (null when unknown or destroyed)', () => {
    const wb = new Workbook();
    const host = makeHost();
    const panel = new ScenarioPanel(host.id, wb);
    expect(ScenarioPanel.findControl(host.id)).toBe(panel);
    expect(ScenarioPanel.findControl(host)).toBe(panel);
    expect(ScenarioPanel.findControl('nope-46-unknown')).toBeNull();
    panel.destroy();
    expect(ScenarioPanel.findControl(host.id)).toBeNull();
    wb.destroy();
  });

  it('attach/detach/refresh answer undefined; detach keeps the rendered DOM; destroy empties the host', () => {
    const wb = new Workbook();
    const host = makeHost();
    const panel = new ScenarioPanel(host, wb);
    expect(panel.refresh()).toBeUndefined();
    expect(panel.detach()).toBeUndefined();
    expect(host.querySelectorAll('*').length).toBeGreaterThan(10); // trial keeps the DOM after detach
    expect(panel.attach(wb)).toBeUndefined();
    expect(panel.destroy()).toBeUndefined();
    expect(host.querySelectorAll('*').length).toBe(0);
    wb.destroy();
  });

  it('list follows the trial: no card after set() alone, badge and card after setActiveScenario (probe panels46l)', () => {
    const wb = new Workbook();
    const sheet = wb.getSheet(0);
    sheet.setValue(0, 0, 'base');
    const host = makeHost();
    const panel = new ScenarioPanel(host, wb);
    wb.scenarioManager.set({ name: 'S1', overrides: [{ sheetName: sheet.name(), cells: [{ ref: 'A1', value: 'over1' }] }] });
    panel.refresh();
    expect(wb.scenarioManager.all()).toEqual([]); // trial: set() alone materializes nothing
    expect(host.querySelectorAll('[role="listitem"]').length).toBe(0);
    expect(host.querySelector('.empty')!.className).toBe('empty visible');
    expect(ownText(host.querySelector('.active-badge')!)).toBe('Activate: undefined');
    expect(wb.scenarioManager.setActiveScenario('S1')).toBe(true);
    panel.refresh();
    expect(host.querySelectorAll('[role="listitem"]').length).toBe(1);
    const card = host.querySelector('.scenario-card')!;
    expect(ownText(card.querySelector('.name')!)).toBe('S1');
    expect(card.className).toContain('active');
    expect(ownText(host.querySelector('.active-badge')!)).toBe('Activate: S1');
    expect(host.querySelector('.active-badge')!.className).toBe('active-badge visible');
    expect(host.querySelector<HTMLElement>('.active-badge')!.title).toBe('S1');
    expect(host.querySelector('.empty')!.className).toBe('empty');
    // Trial (probe panels46f/46h): activation alone keeps the cell values; while the
    // scenario is active its override cells are captured from subsequent edits.
    expect(sheet.getValue(0, 0)).toBe('base');
    expect(wb.scenarioManager.getAppliedScenarios()).toEqual(['S1']);
    sheet.setValue(0, 0, 'captured');
    expect(JSON.parse(JSON.stringify(wb.scenarioManager.get('S1')!.overrides))).toEqual(
      [{ sheetName: sheet.name(), cells: [{ ref: 'A1', value: 'captured' }] }],
    );
    wb.scenarioManager.restore('S1');
    expect(sheet.getValue(0, 0)).toBe('base');
    // Deactivate button (header-actions): clears the active badge.
    (host.querySelector('button[aria-label="Deactivate"]') as HTMLButtonElement).click();
    expect(ownText(host.querySelector('.active-badge')!)).toBe('Activate: undefined');
    expect(sheet.getValue(0, 0)).toBe('base');
    panel.destroy();
    wb.destroy();
  });

  it('destroy leaves other panels and the workbook working (trial leavePanel case)', () => {
    const wb = new Workbook();
    const hostA = makeHost();
    const hostB = makeHost();
    const panelA = new ScenarioPanel(hostA, wb);
    const panelB = new ScenarioPanel(hostB, wb);
    panelA.destroy();
    expect(ScenarioPanel.findControl(hostA)).toBeNull();
    expect(ScenarioPanel.findControl(hostB)).toBe(panelB);
    expect(hostB.querySelectorAll('*').length).toBeGreaterThan(10);
    panelB.destroy();
    wb.destroy();
  });
});

/* ------------------------------------------------- ThreadedCommentPanel */

describe('ThreadedCommentPanel (trial structure, probe panels46/46e/46g/46i)', () => {
  it('constructor(host, workbook) renders title, New button, "<n> items" count and the filter menu', () => {
    expect(ThreadedCommentPanel.length).toBe(2);
    const wb = new Workbook();
    const sheet = wb.getSheet(0);
    sheet.setValue(1, 1, 'cell one');
    sheet.threadedComments.add(1, 1, [reply('first thread')]);
    const host = makeHost(320);
    const panel = new ThreadedCommentPanel(host, wb);
    expect(ownText(host.querySelector('.opensheets-tc-title')!)).toBe('Threaded Comments');
    expect(ownText(host.querySelector('.opensheets-tc-count')!)).toBe('1 item');
    const newButton = host.querySelector('button[aria-label="New"]')!;
    expect(newButton.tagName).toBe('BUTTON');
    expect(ownText(host.querySelector('.opensheets-tc-filter-separator')!)).toBe('Filter By');
    const options = [...host.querySelectorAll('[role="menuitemcheckbox"]')];
    expect(options.map((o) => o.getAttribute('aria-label'))).toEqual(['@mentions Me', 'Active Only', 'Resolved Only']);
    const reset = host.querySelector('[role="menuitem"]')!;
    expect(reset.getAttribute('aria-label')).toBe('Reset All');
    expect(ownText(reset)).toBe('Reset All');
    expect(host.getAttribute('id')).not.toBeNull();
    expect(host.querySelector('.opensheets-tc-filter-dropdown')!.getAttribute('role')).toBe('menu');
    panel.destroy();
    wb.destroy();
  });

  it('renders one card per thread with the trial aria-labels and data-comment-key', () => {
    const wb = new Workbook();
    const sheet = wb.getSheet(0);
    sheet.setValue(1, 1, 'cell one');
    sheet.setValue(2, 3, 'cell two');
    sheet.threadedComments.add(1, 1, [reply('first thread text')]);
    sheet.threadedComments.add(2, 3, [reply('second thread'), reply('reply one')]);
    const host = makeHost(320);
    const panel = new ThreadedCommentPanel(host, wb);
    const list = host.querySelector('.opensheets-tc-list')!;
    expect(list.getAttribute('role')).toBe('list');
    expect(list.getAttribute('aria-label')).toBe('Threaded comments list');
    const items = [...list.querySelectorAll('[role="listitem"]')];
    expect(items.map((i) => i.getAttribute('aria-label'))).toEqual([
      'Threaded comment at row 2, column 2',
      'Threaded comment at row 3, column 4',
    ]);
    expect(items.map((i) => i.getAttribute('data-comment-key'))).toEqual(['1_1', '2_3']);
    expect(ownText(host.querySelector('.opensheets-tc-count')!)).toBe('2 items');
    expect(host.querySelectorAll('.opensheets-tc-reply').length).toBe(3); // 1 + (2 replies)
    panel.destroy();
    wb.destroy();
  });

  it('attach/detach/refresh/destroy answer undefined; detach keeps the DOM; destroy empties and unregisters', () => {
    const wb = new Workbook();
    const host = makeHost(320);
    const panel = new ThreadedCommentPanel(host, wb);
    expect(panel.refresh()).toBeUndefined();
    expect(panel.detach()).toBeUndefined();
    expect(host.querySelectorAll('*').length).toBeGreaterThan(10);
    expect(panel.attach(wb)).toBeUndefined();
    expect(panel.findControl(host)).toBe(panel); // d.ts prototype member (trial static also present)
    expect(ThreadedCommentPanel.findControl(host.id)).toBe(panel);
    expect(panel.destroy()).toBeUndefined();
    expect(host.querySelectorAll('*').length).toBe(0);
    expect(ThreadedCommentPanel.findControl(host.id)).toBeNull();
    wb.destroy();
  });

  it('adding a comment updates the rendered list automatically (probe panels46e auto update)', () => {
    const wb = new Workbook();
    const sheet = wb.getSheet(0);
    sheet.threadedComments.add(0, 0, [reply('one')]);
    const host = makeHost(320);
    const panel = new ThreadedCommentPanel(host, wb);
    sheet.threadedComments.add(3, 0, [reply('third auto?')]);
    const items = host.querySelectorAll('.opensheets-tc-list [role="listitem"]');
    expect(items.length).toBe(2);
    expect(ownText(host.querySelector('.opensheets-tc-count')!)).toBe('2 items');
    panel.destroy();
    wb.destroy();
  });

  it('follows the trial on many threads: every stored thread is rendered, footer stays present', () => {
    const wb = new Workbook();
    const sheet = wb.getSheet(0);
    for (let i = 0; i < 16; i++) {
      sheet.setValue(i, 0, `v${i}`);
      sheet.threadedComments.add(i, 0, [reply(`thread ${i}`)]);
    }
    const host = makeHost(320);
    const panel = new ThreadedCommentPanel(host, wb);
    expect(host.querySelectorAll('.opensheets-tc-list [role="listitem"]').length).toBe(16);
    expect(ownText(host.querySelector('.opensheets-tc-count')!)).toBe('16 items');
    const navigate = host.querySelector('.opensheets-tc-navigate')!;
    expect(navigate.getAttribute('aria-label')).toBe('See more comments');
    expect(navigate.textContent).toBe('See more comments');
    expect(host.getAttribute('id')).not.toBeNull();
    panel.destroy();
    wb.destroy();
  });

  it('resolved threads show the trial banner (Resolved / Reopen Thread / Delete Thread)', () => {
    const wb = new Workbook();
    const sheet = wb.getSheet(0);
    const tc = sheet.threadedComments.add(1, 1, [reply('first thread')])!;
    const host = makeHost(320);
    const panel = new ThreadedCommentPanel(host, wb);
    tc.resolved(true);
    panel.refresh();
    const banner = host.querySelector('.opensheets-tc-resolved')!;
    expect(banner.getAttribute('role')).toBe('banner');
    expect(ownText(host.querySelector('.opensheets-tc-resolved-label')!)).toBe('Resolved');
    const reopen = host.querySelector('[aria-label="Reopen Thread"]') as HTMLElement;
    const remove = host.querySelector('[aria-label="Delete Thread"]') as HTMLElement;
    expect(reopen.getAttribute('role')).toBe('button');
    expect(remove.getAttribute('role')).toBe('button');
    reopen.click();
    expect(tc.resolved()).toBe(false);
    expect(host.querySelector('.opensheets-tc-resolved')).toBeNull();
    // Active card: the options menu offers Delete Thread / Resolve Thread in
    // the trial order (TASK 95 probes t95/panel2 + t95/resolved: one shared
    // card menu triggered by "More options" on the head or on a reply).
    const menuButton = host.querySelector('[aria-label="More options"]') as HTMLButtonElement;
    expect(menuButton.getAttribute('aria-haspopup')).toBe('true');
    menuButton.click();
    expect(menuButton.getAttribute('aria-expanded')).toBe('true');
    const menuItems = [...host.querySelectorAll<HTMLElement>('.opensheets-tc-menu-items [role="menuitem"]')];
    expect(menuItems.map((i) => i.textContent)).toEqual(['Delete Thread', 'Resolve Thread']);
    menuItems[1].click(); // Resolve Thread
    expect(tc.resolved()).toBe(true);
    const menuItems2 = [...host.querySelectorAll<HTMLElement>('.opensheets-tc-menu-items [role="menuitem"]')];
    expect(menuItems2.map((i) => i.textContent)).toEqual(['Delete Thread', 'Resolve Thread']); // resolved cards keep the trial menu (probe3)
    [...host.querySelectorAll<HTMLElement>('.opensheets-tc-menu-items [role="menuitem"]')][0].click(); // Delete Thread
    expect(sheet.threadedComments.size()).toBe(0);
    expect(host.querySelector('.opensheets-tc-resolved')).toBeNull();
    panel.destroy();
    wb.destroy();
  });

  it('filter menu options toggle ThreadedCommentFilterType and the badge', () => {
    const wb = new Workbook();
    const sheet = wb.getSheet(0);
    const active = sheet.threadedComments.add(0, 0, [reply('active thread')])!;
    sheet.threadedComments.add(1, 0, [reply('resolved thread')])!.resolved(true);
    const host = makeHost(320);
    const panel = new ThreadedCommentPanel(host, wb);
    const options = [...host.querySelectorAll<HTMLElement>('[role="menuitemcheckbox"]')];
    options[1].click(); // Active Only
    expect(host.querySelectorAll('.opensheets-tc-list [role="listitem"]').length).toBe(1);
    const badge1 = host.querySelector<HTMLElement>('.opensheets-tc-filter-badge')!;
    expect(badge1.textContent).toBe('1');
    options[1].click(); // toggle off
    expect(host.querySelectorAll('.opensheets-tc-list [role="listitem"]').length).toBe(2);
    options[2].click(); // Resolved Only
    expect(host.querySelectorAll('.opensheets-tc-list [role="listitem"]').length).toBe(1);
    expect(active.resolved()).toBe(false);
    host.querySelector<HTMLElement>('[role="menuitem"]')!.click(); // Reset All
    expect(host.querySelectorAll('.opensheets-tc-list [role="listitem"]').length).toBe(2);
    expect(host.querySelector<HTMLElement>('.opensheets-tc-filter-badge')!.style.display).toBe('none');
    // Mentions filter with the current user.
    const me = UserManager.current();
    sheet.threadedComments.add(2, 0, [{ message: [{ type: ContentType.mention, userId: me! }, { type: ContentType.text, value: ' hi' }] as IContentBlock[], createdAt: new Date(), authorId: me! }]);
    panel.refresh();
    const mentions = [...host.querySelectorAll<HTMLElement>('[role="menuitemcheckbox"]')];
    expect(mentions.map((o) => o.getAttribute('aria-label'))).toEqual(['@mentions Me', 'Active Only', 'Resolved Only']);
    mentions[0].click();
    expect(ThreadedCommentFilterType.MentionsMe).toBeGreaterThan(0);
    const shown = [...host.querySelectorAll('.opensheets-tc-list [role="listitem"]')];
    expect(shown.map((i) => i.getAttribute('data-comment-key'))).toContain('2_0');
    panel.destroy();
    wb.destroy();
  });

  it('New inserts a draft card for the active cell (no thread yet) and Post commits it', () => {
    const wb = new Workbook();
    const sheet = wb.getSheet(0);
    sheet.setActiveCell(2, 4);
    const host = makeHost(320);
    const panel = new ThreadedCommentPanel(host, wb);
    (host.querySelector('button[aria-label="New"]') as HTMLButtonElement).click();
    // Trial probe (t95/panel2 afterNew): a card "Threaded comment at row 6,
    // column 6" WITHOUT data-comment-key; threadedComments.size() unchanged.
    expect(sheet.threadedComments.size()).toBe(0);
    const draft = host.querySelector('.opensheets-tc-list [role="listitem"]') as HTMLElement;
    expect(draft.getAttribute('aria-label')).toBe('Threaded comment at row 3, column 5');
    expect(draft.hasAttribute('data-comment-key')).toBe(false);
    const editor = host.querySelector('.opensheets-tc-editor') as HTMLElement;
    expect(editor).not.toBeNull();
    expect(editor.getAttribute('contenteditable')).toBe('true');
    expect(editor.getAttribute('data-placeholder')).toBe('@mention or reply');
    editor.textContent = 'typed via panel';
    editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(sheet.threadedComments.size()).toBe(1);
    expect(sheet.threadedComments.get(2, 4)).not.toBeNull();
    const item = host.querySelector('[data-comment-key="2_4"]')!;
    expect(item.querySelector('.opensheets-tc-text')!.textContent).toBe('typed via panel');
    panel.destroy();
    wb.destroy();
  });
});
