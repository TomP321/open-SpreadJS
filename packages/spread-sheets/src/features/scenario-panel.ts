// GC.Spread.Sheets.Scenarios.ScenarioPanel (TASK 46 item 4).
// Contract: core d.ts ScenarioPanel class (constructor(host, workbook?),
// attach(workbook), detach(), refresh(), destroy(), static findControl).
// Trial reference (probe panels46d/panels46f on the official core page): the
// panel renders a titled side panel with an icon row (Add / Restore All /
// Delete All), an "Activate: <name>" badge, a header Deactivate button and a
// scenario list (one card per scenario, aria roles list/listitem) with the
// empty text "No Scenarios defined. Choose Add to add scenarios". attach /
// detach / refresh / destroy all answer undefined; destroy empties the host
// and detaches; findControl maps the host element or id to the panel (null
// when unknown or destroyed); detach keeps the rendered DOM. The official
// panel renders through web components; ours builds its own light DOM (like
// the sibling controls) with our own class names and icons.

import type { Workbook } from '../workbook.js';
import { ScenarioManager, type IScenario } from './scenarios.js';
import { findControl as findRegisteredControl, registerControl, unregisterControl } from './controls.js';
import { ltext } from '../localization.js';

/** Scenario panel captions (`scenarios.*` language namespace). */
const stext = (key: string, fallback: string, ...args: (string | number)[]) => ltext(`scenarios.${key}`, fallback, ...args);

function hostElement(host: HTMLElement | string): HTMLElement {
  const element = typeof host === 'string' ? document.getElementById(host) : host;
  if (!element) throw new Error('Control host not found');
  return element;
}

/** Our own 14 px icon glyphs (drawn paths, no bitmaps). */
function icon(name: 'add' | 'restore' | 'delete' | 'deactivate' | 'up' | 'down' | 'trash'): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'opensheets-scenario-icon');
  svg.setAttribute('width', '14');
  svg.setAttribute('height', '14');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  const d =
    name === 'add' ? 'M8 3v10M3 8h10'
    : name === 'restore' ? 'M13 8a5 5 0 1 1-1.5-3.6M12 1.5V5h-3.5'
    : name === 'delete' ? 'M4 4l8 8M12 4l-8 8'
    : name === 'up' ? 'M3 10l5-5 5 5'
    : name === 'down' ? 'M3 6l5 5 5-5'
    : name === 'trash' ? 'M3 4h10M6 4V3h4v1M5 4l.6 8h4.8L11 4'
    : 'M4 4l8 8M12 4l-8 8';
  path.setAttribute('d', d);
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '1.4');
  path.setAttribute('stroke-linecap', 'round');
  svg.appendChild(path);
  return svg;
}

export class ScenarioPanel {
  private host: HTMLElement;
  private original: Node[];
  private root: HTMLElement;
  private list: HTMLElement;
  private emptyElement: HTMLElement;
  private badge: HTMLElement;
  private deactivateButton: HTMLElement;
  private addButton: HTMLButtonElement;
  private wb?: Workbook;

  constructor(host: HTMLElement | string, workbook?: Workbook | undefined) {
    this.host = hostElement(host);
    this.original = [...this.host.childNodes];
    registerControl(this.host, this);
    const wrapper = document.createElement('div');
    wrapper.setAttribute('role', 'region');
    wrapper.setAttribute('aria-label', stext('title', 'Scenarios'));
    const panel = document.createElement('div');
    panel.className = 'opensheets-scenario-panel panel-side-panel';

    const header = document.createElement('div');
    header.className = 'fixed-header';
    const titleRow = document.createElement('div');
    titleRow.className = 'title-row';
    const title = document.createElement('div');
    title.className = 'title';
    title.textContent = stext('title', 'Scenarios');
    titleRow.appendChild(title);
    const actionBar = document.createElement('div');
    actionBar.className = 'action-bar';
    const primary = document.createElement('div');
    primary.className = 'primary-actions';
    const addButton = document.createElement('button');
    addButton.type = 'button';
    addButton.className = 'opensheets-scenario-action';
    addButton.title = stext('add', 'Add');
    addButton.setAttribute('aria-label', stext('add', 'Add'));
    addButton.disabled = true; // enabled once the panel is attached to a workbook
    addButton.appendChild(icon('add'));
    addButton.addEventListener('click', () => this.addScenarioFromSelection());
    const restoreButton = document.createElement('button');
    restoreButton.type = 'button';
    restoreButton.className = 'opensheets-scenario-action';
    restoreButton.title = stext('restoreAll', 'Restore All');
    restoreButton.setAttribute('aria-label', stext('restoreAll', 'Restore All'));
    restoreButton.appendChild(icon('restore'));
    restoreButton.addEventListener('click', () => { this.manager()?.restore(); this.refresh(); });
    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'opensheets-scenario-action';
    deleteButton.title = stext('deleteAll', 'Delete All');
    deleteButton.setAttribute('aria-label', stext('deleteAll', 'Delete All'));
    deleteButton.appendChild(icon('delete'));
    deleteButton.addEventListener('click', () => { this.manager()?.remove(); this.refresh(); });
    primary.append(addButton, restoreButton, deleteButton);
    this.addButton = addButton;
    const actions = document.createElement('div');
    actions.className = 'action-bar-actions';
    const badge = document.createElement('span');
    badge.className = 'active-badge';
    actionBar.append(primary, actions, badge);
    this.badge = badge;
    const headerActions = document.createElement('div');
    headerActions.className = 'header-actions';
    const deactivate = document.createElement('button');
    deactivate.type = 'button';
    deactivate.className = 'opensheets-scenario-action';
    deactivate.title = stext('deactivate', 'Deactivate');
    deactivate.setAttribute('aria-label', stext('deactivate', 'Deactivate'));
    deactivate.appendChild(icon('deactivate'));
    deactivate.addEventListener('click', () => { this.manager()?.setActiveScenario(null); this.refresh(); });
    this.deactivateButton = deactivate;
    headerActions.appendChild(deactivate);
    header.append(titleRow, actionBar);

    const scrollable = document.createElement('div');
    scrollable.className = 'scrollable-container';
    const section = document.createElement('div');
    section.className = 'panel-section scenarios-section';
    const list = document.createElement('div');
    list.className = 'scenario-list';
    list.setAttribute('role', 'list');
    this.list = list;
    // The trial keeps a permanent "empty" element in the list, hidden when
    // scenarios exist (probe panels46d/46f: cls "empty visible" vs "empty").
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = stext('empty', 'No Scenarios defined.\nChoose Add to add scenarios');
    this.emptyElement = empty;
    list.appendChild(empty);
    section.appendChild(list);
    scrollable.appendChild(section);

    panel.append(header, headerActions, scrollable);
    wrapper.appendChild(panel);
    this.root = wrapper;
    this.host.appendChild(wrapper);
    this.render();
    if (workbook) this.attach(workbook);
  }

  private manager(): ScenarioManager | undefined {
    return this.wb?.scenarioManager;
  }

  private activeName(): string | undefined {
    const sm = this.manager();
    try {
      for (const scenario of sm?.all() ?? []) {
        const applied = sm?.getAppliedScenarios?.() ?? [];
        if (applied.includes(scenario.name)) return scenario.name;
      }
    } catch { /* ignore */ }
    return undefined;
  }

  /** Attaches the panel to a workbook; it keeps rendering until detached. */
  attach(workbook: Workbook): void {
    this.wb = workbook;
    this.addButton.disabled = false;
    this.render();
  }

  /** Unbinds the workbook. The trial keeps the rendered DOM after detach. */
  detach(): void {
    this.wb = undefined;
  }

  /** Re-renders the scenario list and the active badge. */
  refresh(): void {
    this.render();
  }

  /** Removes the panel DOM from the host and unregisters the control. */
  destroy(): void {
    this.wb = undefined;
    this.root.remove();
    void this.original;
    unregisterControl(this.host);
  }

  /** Gets the ScenarioPanel for a host element or host element id; null when unknown. */
  static findControl(host: HTMLElement | string): ScenarioPanel | null {
    const element = typeof host === 'string' ? document.getElementById(host) : host;
    if (!element) return null;
    const found = findRegisteredControl<ScenarioPanel>(element);
    return found ?? null;
  }

  private addScenarioFromSelection(): void {
    const sm = this.manager();
    if (!sm || !this.wb) return;
    const sheet = this.wb.getActiveSheet();
    const selection = sheet.getSelections()[0];
    if (!selection) return;
    const name = `Scenario ${sm.all().length + 1}`;
    const cells: { ref: string; value: unknown }[] = [];
    const label = (col: number): string => {
      let out = '';
      let n = col;
      do { out = String.fromCharCode(65 + (n % 26)) + out; n = Math.floor(n / 26) - 1; } while (n >= 0);
      return out;
    };
    for (let row = selection.row; row < selection.row + selection.rowCount; row++) {
      for (let col = selection.col; col < selection.col + selection.colCount; col++) {
        cells.push({ ref: `${label(col)}${row + 1}`, value: sheet.getValue(row, col) });
      }
    }
    sm.set({ name, overrides: [{ sheetName: sheet.name(), cells: cells as IScenario['overrides'][number]['cells'] }] });
    sm.setActiveScenario(name);
    this.refresh();
  }

  private render(): void {
    const scenarios: IScenario[] = this.manager()?.all() ?? [];
    const active = this.activeName();
    this.badge.textContent = stext('activateBadge', 'Activate: {0}', active ?? 'undefined');
    if (active) {
      this.badge.classList.add('visible');
      this.badge.title = active;
    } else {
      this.badge.classList.remove('visible');
      this.badge.removeAttribute('title');
    }
    this.deactivateButton.style.visibility = active ? 'visible' : 'hidden';
    this.list.replaceChildren(this.emptyElement);
    this.emptyElement.classList.toggle('visible', scenarios.length === 0);
    for (const scenario of scenarios) {
      const card = document.createElement('div');
      card.className = 'opensheets-scenario-card scenario-card';
      card.setAttribute('role', 'listitem');
      const item = document.createElement('div');
      item.className = 'item';
      const itemHeader = document.createElement('div');
      itemHeader.className = 'item-header';
      const expand = document.createElement('div');
      expand.className = 'expand-container';
      const content = document.createElement('div');
      content.className = 'item-header-content';
      const name = document.createElement('div');
      name.className = 'name';
      name.textContent = scenario.name;
      const overrides = document.createElement('div');
      overrides.className = 'count';
      overrides.textContent = String(scenario.overrides?.length ?? 0);
      content.append(name, overrides);
      itemHeader.append(expand, content);
      const details = document.createElement('div');
      details.className = 'details';
      for (const override of scenario.overrides ?? []) {
        const row = document.createElement('div');
        row.className = 'detail-row';
        row.textContent = override.cells.length === 1
          ? stext('overrideCell', '{0}: {1} cell', override.sheetName, override.cells.length)
          : stext('overrideCells', '{0}: {1} cells', override.sheetName, override.cells.length);
        details.appendChild(row);
      }
      // Trial card footer (probe screenshot): "<n> sheets" / "<n> cells" chips and an
      // "Activate" button; activation goes through the manager (setActiveScenario).
      const footer = document.createElement('div');
      footer.className = 'item-footer';
      const chipSheets = document.createElement('span');
      chipSheets.className = 'chip';
      chipSheets.textContent = stext('sheets', '{0} sheets', scenario.overrides?.length ?? 0);
      const chipCells = document.createElement('span');
      chipCells.className = 'chip';
      let cellCount = 0;
      for (const override of scenario.overrides ?? []) cellCount += override.cells?.length ?? 0;
      chipCells.textContent = stext('cells', '{0} cells', cellCount);
      const activate = document.createElement('button');
      activate.type = 'button';
      activate.className = 'activate';
      activate.textContent = stext('activate', 'Activate');
      activate.addEventListener('click', (event) => {
        event.stopPropagation();
        const manager = this.manager();
        if (manager) { manager.setActiveScenario(scenario.name); this.refresh(); }
      });
      footer.append(chipSheets, chipCells, activate);
      item.append(itemHeader, details, footer);
      card.appendChild(item);
      card.addEventListener('click', () => {
        this.manager()?.setActiveScenario(scenario.name);
        this.refresh();
      });
      if (scenario.name === active) card.classList.add('active');
      this.list.appendChild(card);
    }
  }
}
