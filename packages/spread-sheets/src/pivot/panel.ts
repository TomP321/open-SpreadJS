/**
 * `GC.Spread.Pivot.PivotPanel` (TASK 42 item 5): the "PivotTable Fields" side
 * panel built with our own DOM/CSS/SVG. The class names, `data-*` attributes
 * and section texts follow the trial's customization contract (users style and
 * script against them); every pixel is drawn by our CSS, and the structure was
 * read black-box from the running trial (never from its sources).
 *
 * Sections (bitmask `PivotPanelSection`): fields (1), areas (2), viewList (4).
 * Layouts (`PivotPanelLayoutType`): stack (0, 2x2 area grid) / flow (1, areas
 * stacked in one column).
 */
import { GC } from '../generated/enums.js';
import { PivotDataType, PivotTableFieldType } from './types.js';
import { ltext } from '../localization.js';
import type { PivotTable } from './pivot-table.js';

const PanelSection = GC.Spread.Pivot.PivotPanelSection as unknown as {
  fields: number; area: number; viewList: number;
};
const PanelLayout = GC.Spread.Pivot.PivotPanelLayoutType as unknown as { stack: number; flow: number };

/** Panel CSS, injected once per document (our own stylesheet; the panel is
 *  DOM-based like the trial's, so its look lives here, not on the canvas). */
const PANEL_CSS = `/* ---- PivotTable Fields panel (TASK 42 item 5 / TASK 47 item 2; geometry measured black-box from the running trial at a 1280x720 viewport, our own DOM/CSS) ---- */
.gc-panel-all { font: 12px Calibri, 'Segoe UI', Arial, sans-serif; color: #242424; height: 100%; }
.gc-panel-all * { box-sizing: border-box; }
.gc-panel-left { height: 100%; }
.gc-panel-base { height: 100%; display: flex; flex-direction: column; min-height: 0; }
.gc-panel { height: 100%; position: relative; background: #f5f5f5; overflow: hidden; padding: 15px 5px 24px 15px; display: flex; flex-direction: column; }
.gc-panel-withoutViewList { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
.gc-panel-header { flex: 0 0 27px; }
.gc-panel-header h2 { margin: 0 0 0 -5px; font: 600 16px/18px Calibri, 'Segoe UI', Arial, sans-serif; color: #242424; }
.gc-panel-fields-section { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
.gc-panel-fields-title, .gc-panel-areas-title { flex: 0 0 auto; height: 14px; line-height: 14px; margin: 0; }
.gc-panel-search-box { position: relative; flex: 0 0 24px; margin: 6px 0; }
.gc-panel-all input.gc-panel-search-input { width: 100%; height: 24px; padding: 2px 26px 2px 6px; border: 1px solid #b7b7b7; background: #fff; font: 12px Calibri, Arial, sans-serif; }
.gc-panel-search-icon { position: absolute; right: 6px; top: 5px; width: 14px; height: 14px; pointer-events: none; background: no-repeat center/12px url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'><circle cx='6.6' cy='6.6' r='4.4' fill='none' stroke='%23767676' stroke-width='1.6'/><path d='M10.2 10.2l4 4' stroke='%23767676' stroke-width='1.8' fill='none'/></svg>"); }
.gc-panel-search-clear { position: absolute; right: 22px; top: 5px; width: 12px; height: 12px; display: none; cursor: pointer; background: no-repeat center/10px url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'><path d='M1 1l10 10M11 1L1 11' stroke='%23767676' stroke-width='1.6'/></svg>"); }
.gc-panel-all-field { flex: 1 1 auto; min-height: 0; overflow-y: auto; border-top: 1px solid #cbcbcb; border-bottom: 1px solid #cbcbcb; background: #fdfdfd; }
/* Trial item box model (TASK 54 probe .probe/t54/probe-t54-panel.json): a 280x22 list-item line
   with list-style none, a 12x12 inline-block checkbox at margin-left 13, the 221x19 label
   inline-block and the 20x13 dropdown absolute at the right edge; the children are separated by
   whitespace text nodes, which is what makes the trial item innerText start with a space. */
.gc-panel-all-field-item { position: relative; height: 22px; line-height: 19px; cursor: grab; display: list-item; list-style: none; }
.gc-panel-all-field-item:hover { background: #f2f2f2; }
.gc-panel-checkbox { width: 12px; height: 12px; margin: 3px 4px 0 0; flex: 0 0 auto; }
.gc-panel-all-field-item > .gc-panel-checkbox { display: inline-block; margin: 0 0 0 13px; }
.gc-panel-all-field-unchecked, .gc-panel-all-field-checked { display: inline-block; width: 221px; height: 19px; line-height: 19px; vertical-align: top; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.gc-panel-all-field-checked { font-weight: 700; }
.gc-panel-field-dropdown { position: absolute; right: 0; top: 3px; width: 20px; height: 13px; background: no-repeat center url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 14 14'><path d='M3 5.5h8L7 10 3 5.5Z' fill='%23767676'/></svg>"); }
.gc-panel-all-field-no-matches { display: none; padding: 8px 2px; color: #767676; font-style: italic; }
.gc-panel-areas-section { flex: 0 0 auto; margin-top: 16px; }
.gc-panel-field-area { margin-top: 5px; }
.gc-panel-stack .gc-panel-field-area { display: grid; grid-template-columns: 142px 142px; grid-auto-rows: 91px; }
.gc-panel-flow .gc-panel-field-area { display: block; }
.gc-panel-flow .gc-panel-area-section { min-height: 40px; border-bottom: 1px solid #d9d9d9; }
.gc-panel-area-section { position: relative; border-right: 1px solid #ababab; border-bottom: 1px solid #ababab; padding: 0 4px 0 0; }
.gc-panel-stack .gc-panel-area-section-Columns, .gc-panel-stack .gc-panel-area-section-Values { border-right: 0; padding: 0 0 0 4px; }
/* Trial area title (same probe): a 26px block line, the 15x14 icon inline-block at the left and
   the label as a plain inline span, children separated by whitespace text nodes. */
.gc-panel-area-item-title { position: relative; height: 26px; line-height: 26px; }
.gc-panel-area-item-title > .gc-panel-area-item-title-text { line-height: 14px; vertical-align: top; }
.gc-panel-area-icon { display: inline-block; vertical-align: top; flex: 0 0 auto; width: 15px; height: 14px; background-repeat: no-repeat; background-position: center; background-size: 12px; }
.gc-panel-area-icon-Filters { background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'><path d='M2 3h12L9.3 8.6V13L6.7 11.4V8.6L2 3Z' fill='none' stroke='%23767676' stroke-width='1.5'/></svg>"); }
.gc-panel-area-icon-Columns { background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'><path d='M3.5 2.5h2v11h-2zM7 2.5h2v11H7zM10.5 2.5h2v11h-2z' fill='none' stroke='%23767676' stroke-width='1.3'/></svg>"); }
.gc-panel-area-icon-Rows { background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'><path d='M2.5 3.5h11M2.5 7h11M2.5 10.5h11M2.5 14h11' stroke='%23767676' stroke-width='1.4'/></svg>"); }
.gc-panel-area-icon-Values { background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'><path d='M3 3h10L7 8l6 5H3' fill='none' stroke='%23767676' stroke-width='1.5'/></svg>"); }
.gc-panel-area-item-content { height: 60px; background: #fdfdfd; overflow-x: hidden; overflow-y: auto; outline: none; }
.gc-panel-area-item { position: relative; margin: 1px; height: 23px; line-height: 21px; padding: 0 20px 0 6px; border: 1px solid #c8c8c8; background: #fff; cursor: grab; white-space: nowrap; overflow: hidden; }
.gc-panel-area-item:hover { border-color: #8cb0d8; background: #eef5fc; }
.gc-panel-field-area-list-item-dropdown { position: absolute; right: 3px; top: 5px; width: 14px; height: 14px; background: no-repeat center url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 14 14'><path d='M3 5.5h8L7 10 3 5.5Z' fill='%23767676'/></svg>"); }
.gc-panel-defer-layout-update { display: flex; align-items: center; justify-content: space-between; height: 20px; margin-top: 5px; }
.gc-panel-defer-layout-left-div { display: flex; align-items: center; height: 20px; padding-left: 13px; }
.gc-panel-defer-layout-left-div .gc-panel-checkbox { margin: 0; }
.gc-panel-defer-layout-label { height: 20px; line-height: 20px; margin-left: 4px; }
.gc-panel-all button.gc-panel-defer-layout-right-button { width: 60px; height: 19px; border: 1px solid #b7b7b7; background: #f5f5f5; font: 13.3333px Arial, sans-serif; padding: 0; }
.gc-panel-all button.gc-panel-defer-layout-right-button:disabled { color: #adadad; border-color: #d7d7d7; background: #fbfbfb; }
.gc-panel-views { flex: 0 0 21px; display: flex; align-items: center; margin-top: 29px; }
.gc-panel-views-label { flex: 0 0 48px; padding-left: 4px; font-size: 14px; line-height: 16px; }
.gc-panel-views-content { flex: 1 1 0; min-width: 0; display: flex; align-items: center; height: 21px; }
.gc-panel-collapse { position: relative; flex: 0 0 173px; min-width: 0; overflow: hidden; height: 17px; border: 1px solid #b7b7b7; background: #fdfdfd; display: flex; align-items: center; }
.gc-panel-all input.gc-panel-view-input { flex: 1 1 0; min-width: 0; width: 0; height: 15px; border: 0; outline: none; background: transparent; font: 12px Calibri, Arial, sans-serif; padding: 0; }
.gc-panel-view-arrow { order: -1; flex: 0 0 auto; width: 14px; height: 14px; margin-left: 4px; margin-right: 7px; background: no-repeat center url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 14 14'><path d='M3 5.5h8L7 10 3 5.5Z' fill='%23767676'/></svg>"); }
.gc-panel-all input.gc-panel-button { flex: 0 0 auto; width: 24px; height: 18px; border: 1px solid transparent; background: #fff; font-size: 13px; cursor: pointer; padding: 0; }
.gc-panel-all input.gc-panel-button:hover { border-color: #cfe0f0; background: #eaf3fb; }
.gc-panel-all input.gc-panel-button.gc-panel-apply { margin-left: 11px; }
.gc-panel-all input.gc-panel-button.gc-panel-add { margin-left: 2px; }
.gc-panel-addon, .gc-panel-right { display: none; }`;

function ensureStyles(): void {
  if (typeof document === 'undefined' || document.querySelector('style[data-opensheets-pivot-panel]')) return;
  const tag = document.createElement('style');
  tag.setAttribute('data-opensheets-pivot-panel', '');
  tag.textContent = PANEL_CSS;
  document.head.append(tag);
}

const ptext = (key: string, fallback: string, ...args: (string | number)[]): string => ltext(`pivotPanel.${key}`, fallback, ...args);
/** Built-in (English) panel captions; `text()` localises them per culture. */
const TEXT = {
  title: 'PivotTable Fields',
  choose: 'Choose fields to add to report',
  drag: 'Drag fields between areas below:',
  defer: 'Defer Layout Update',
  update: 'Update',
  views: 'Views',
  search: 'Search',
  noMatches: 'No matches',
};
const panelText = (name: keyof typeof TEXT): string => ptext(name, TEXT[name]);
const AREAS: { area: number; label: string; key: string }[] = [
  { area: PivotTableFieldType.filterField, label: 'Filters', key: 'Filters' },
  { area: PivotTableFieldType.columnField, label: 'Columns', key: 'Columns' },
  { area: PivotTableFieldType.rowField, label: 'Rows', key: 'Rows' },
  { area: PivotTableFieldType.valueField, label: 'Values', key: 'Values' },
];

interface PanelField {
  sourceName: string;
  displayName: string;
  dataType: PivotDataType;
  area: number;
  index: number;
}

export class PivotPanel {
  private static readonly byHost = new Map<HTMLElement, PivotPanel>();

  /** Trial contract: find the panel instance hosted by an element/id/selector. */
  static findControl(host: HTMLElement | string): PivotPanel {
    let element: HTMLElement | null = null;
    if (typeof host === 'string')
      element = document.getElementById(host) ?? document.querySelector<HTMLElement>(host);
    else element = host;
    const panel = element ? PivotPanel.byHost.get(element) : undefined;
    return panel as PivotPanel;
  }

  private nameValue: string;
  private pivot: PivotTable | null;
  private host: HTMLElement;
  private root: HTMLElement | null = null;
  private visibility = PanelSection.fields + PanelSection.area + PanelSection.viewList;
  private layout = PanelLayout.stack;
  private deferred = false;
  private dirty = false;
  private search = '';
  private dragging: { name: string; from: number } | null = null;

  constructor(name: string, pivotTable: PivotTable, host: HTMLElement) {
    this.nameValue = String(name ?? '');
    this.pivot = pivotTable ?? null;
    this.host = host;
    pivotTable?._panelInstances?.add(this);
    this.render();
  }

  /** @internal trial surface: the panel keeps its host element. */
  name(): string { return this.nameValue; }

  panelLayout(value?: number): number | void {
    if (value === undefined) return this.layout;
    if (value !== PanelLayout.stack && value !== PanelLayout.flow) return;
    this.layout = value;
    // Only the CSS class switches; no re-render (the trial keeps the DOM).
    const panel = this.root?.querySelector<HTMLElement>('.gc-panel');
    panel?.classList.toggle('gc-panel-flow', this.layout === PanelLayout.flow);
    panel?.classList.toggle('gc-panel-stack', this.layout === PanelLayout.stack);
  }

  sectionVisibility(value?: number): number | void {
    if (value === undefined) return this.visibility;
    this.visibility = Number(value) | 0;
    this.render();
  }

  attach(pivotTable: PivotTable): void {
    this.pivot = pivotTable;
    // Keep a back-reference so the pivot re-renders the panel when its model
    // changes outside the panel (dialog renames, subtotal changes, ribbon commands).
    pivotTable._panelInstances?.add(this);
    this.render();
  }

  /** @internal called by the pivot after every model change (`_apply`). */
  _onModelChanged(): void {
    if (this.root && this.pivot) this.render();
  }

  detach(): void {
    this.pivot?._panelInstances?.delete(this);
    this.root?.remove();
    this.root = null;
  }

  destroy(): void {
    this.detach();
    PivotPanel.byHost.delete(this.host);
    this.pivot = null;
  }

  /** @internal the panel's outermost element (null after detach). */
  _element(): HTMLElement | null { return this.root; }

  // ------------------------------------------------------------- rendering

  private fields(): PanelField[] {
    if (!this.pivot) return [];
    const out: PanelField[] = [];
    for (const source of this.pivot.getSourceFields()) {
      const info = this.pivot.getField(source.name);
      out.push({
        sourceName: source.name,
        displayName: info?.fieldName ?? source.name,
        dataType: info?.dataType ?? PivotDataType.string,
        area: info ? (info.pivotArea as number) : -1,
        index: info?.pivotIndex ?? -1,
      });
    }
    return out;
  }

  private render(): void {
    if (!this.host || typeof document === 'undefined') return;
    this.host.innerHTML = '';
    if (!this.pivot) return;
    const fields = this.fields();
    const all = el('div', 'gc-panel-all');
    const left = el('div', 'gc-panel-left');
    const base = el('div', 'gc-panel-base');
    const panel = el('div', `gc-panel gc-panel-${this.layout === PanelLayout.flow ? 'flow' : 'stack'}`);
    // The trial keeps this wrapper class regardless of the section flags.
    const withoutViews = el('div', 'gc-panel-withoutViewList');

    if (this.visibility & PanelSection.fields) {
      const header = el('div', 'gc-panel-header');
      // The trial renders the title as an <h2> (16px/600, #242424).
      const title = el('h2', '');
      title.textContent = panelText('title');
      header.append(title);
      withoutViews.append(header);
      withoutViews.append(this.fieldsSection(fields));
    }
    if (this.visibility & PanelSection.area) withoutViews.append(this.areasSection(fields));
    panel.append(withoutViews);
    if (this.visibility & PanelSection.viewList) panel.append(this.viewsSection());
    base.append(panel, el('div', 'gc-panel-addon'));
    left.append(base);
    all.append(left, el('div', 'gc-panel-right'));
    ensureStyles();
    this.host.append(all);
    this.root = all;
    PivotPanel.byHost.set(this.host, this);
  }

  private fieldsSection(fields: PanelField[]): HTMLElement {
    const section = el('div', 'gc-panel-fields-section');
    section.append(textNode(panelText('choose'), 'gc-panel-fields-title'));
    const box = el('div', 'gc-panel-search-box');
    const fieldsList = el('div', 'gc-panel-all-field');
    fieldsList.addEventListener('dragover', event => { if (this.dragging && this.dragging.from !== -1) event.preventDefault(); });
    fieldsList.addEventListener('drop', event => {
      if (!this.dragging || this.dragging.from === -1) return;
      event.preventDefault();
      this.change(() => this.pivot?.updateField(this.dragging!.name, -1 as never));
      this.dragging = null;
    });
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'gc-panel-search-input';
    input.placeholder = panelText('search');
    input.value = this.search;
    input.addEventListener('input', () => {
      this.search = input.value;
      this.refreshFieldList(section, fields);
    });
    box.append(input, el('span', 'gc-panel-search-icon'), el('span', 'gc-panel-search-clear'));
    section.append(box);
    for (const field of fields) fieldsList.append(this.fieldItem(field));
    section.append(fieldsList);
    section.append(textNode(panelText('noMatches'), 'gc-panel-all-field-no-matches'));
    this.refreshFieldList(section, fields);
    return section;
  }

  private fieldItem(field: PanelField): HTMLElement {
    const item = el('div', 'gc-panel-all-field-item');
    item.title = field.displayName;
    item.dataset.name = field.displayName;
    item.dataset.sourcename = field.sourceName;
    item.dataset.displayname = field.displayName;
    item.draggable = true;
    const check = document.createElement('input');
    check.type = 'checkbox';
    check.className = 'gc-panel-all-field-checkbox gc-panel-checkbox';
    check.checked = field.area !== -1;
    check.addEventListener('change', () => {
      if (check.checked) this.placeField(field.sourceName, field.dataType);
      else this.change(() => this.pivot?.updateField(field.sourceName, -1 as never));
    });
    item.append(check, gap(), labelSpan(field.displayName, field.area !== -1 ? 'gc-panel-all-field-checked' : 'gc-panel-all-field-unchecked'), gap(), el('span', 'gc-panel-field-dropdown'));
    item.addEventListener('dragstart', event => {
      this.dragging = { name: field.sourceName, from: -1 };
      event.dataTransfer?.setData('text/plain', field.sourceName);
    });
    item.addEventListener('dragend', () => { this.dragging = null; });
    return item;
  }

  private refreshFieldList(section: HTMLElement, fields: PanelField[]): void {
    const list = section.querySelector('.gc-panel-all-field');
    if (!list) return;
    const needle = this.search.trim().toLowerCase();
    let visible = 0;
    fields.forEach((field, index) => {
      const item = list.children[index] as HTMLElement | undefined;
      if (!item) return;
      const matches = !needle
        || field.displayName.toLowerCase().includes(needle) || field.sourceName.toLowerCase().includes(needle);
      item.style.display = matches ? '' : 'none';
      if (matches) visible++;
    });
    const none = section.querySelector('.gc-panel-all-field-no-matches') as HTMLElement | null;
    if (none) none.style.display = visible ? 'none' : '';
  }

  private areasSection(fields: PanelField[]): HTMLElement {
    const section = el('div', 'gc-panel-areas-section');
    section.append(textNode(panelText('drag'), 'gc-panel-areas-title'));
    const areaWrap = el('div', 'gc-panel-field-area');
    for (const area of AREAS) {
      const box = el('div', `gc-panel-area-section gc-panel-area-section-${area.key}`);
      const title = el('div', 'gc-panel-area-item-title');
      title.append(el('span', `gc-panel-area-icon gc-panel-area-icon-${area.key}`), gap());
      const titleText = el('span', 'gc-panel-area-item-title-text');
      titleText.textContent = ptext(`area.${area.key}`, area.label);
      title.append(titleText);
      const content = el('div', 'gc-panel-area-item-content');
      for (const field of fields.filter(field => field.area === area.area).sort((a, b) => a.index - b.index))
        content.append(this.areaItem(field, area.area));
      content.addEventListener('dragover', event => { event.preventDefault(); });
      content.addEventListener('drop', event => {
        event.preventDefault();
        const name = this.dragging?.name ?? event.dataTransfer?.getData('text/plain') ?? '';
        if (!name) return;
        if (this.dragging?.from === -1) {
          const dataType = this.fields().find(f => f.sourceName === name)?.dataType ?? PivotDataType.string;
          this.placeField(name, dataType, area.area);
        }
        else this.change(() => this.pivot?.updateField(name, area.area as never));
        this.dragging = null;
      });
      box.append(title, content);
      areaWrap.append(box);
    }
    // Dropping a field back on the list removes it from its area.
    const defer = el('div', 'gc-panel-defer-layout-update');
    const deferLeft = el('div', 'gc-panel-defer-layout-left-div');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'gc-panel-checkbox gc-panel-defer-layout-input';
    checkbox.checked = this.deferred;
    const label = document.createElement('label');
    label.className = 'gc-panel-defer-layout-label';
    label.append(document.createTextNode(' ' + panelText('defer')));
    deferLeft.append(checkbox, label);
    const update = el('button', 'gc-panel-defer-layout-right-button') as HTMLButtonElement;
    update.textContent = panelText('update');
    update.disabled = !this.dirty;
    update.addEventListener('click', () => {
      if (!this.deferred) return;
      this.releaseHolds();
      this.render();
    });
    checkbox.addEventListener('change', () => {
      this.deferred = checkbox.checked;
      if (!this.deferred) this.releaseHolds();
      update.disabled = !this.deferred || !this.dirty;
    });
    defer.append(deferLeft, update);
    section.append(areaWrap, defer);
    return section;
  }

  private areaItem(field: PanelField, areaType: number): HTMLElement {
    const item = el('div', 'gc-panel-area-item');
    item.title = field.displayName;
    item.dataset.name = field.displayName;
    item.dataset.area = String(areaType);
    item.dataset.index = String(field.index);
    item.draggable = true;
    const label = el('span', 'gc-panel-area-item-label');
    label.textContent = field.displayName;
    item.append(label);
    const dropdown = el('span', 'gc-panel-area-item-icon gc-panel-field-area-list-item-dropdown');
    dropdown.setAttribute('role', 'button');
    dropdown.setAttribute('aria-haspopup', 'menu');
    dropdown.setAttribute('aria-label', field.displayName);
    item.append(dropdown);
    item.addEventListener('dragstart', event => {
      this.dragging = { name: field.sourceName, from: areaType };
      event.dataTransfer?.setData('text/plain', field.sourceName);
    });
    item.addEventListener('dragend', () => { this.dragging = null; });
    return item;
  }

  /** Place a not-yet-used field: numbers go to Values (captioned `Sum of X`
   *  like the trial), everything else to Row Labels. */
  private placeField(sourceName: string, dataType: PivotDataType, area?: number): void {
    const target = area ?? (dataType === PivotDataType.number ? PivotTableFieldType.valueField : PivotTableFieldType.rowField);
    this.change(() => {
      if (target === PivotTableFieldType.valueField) this.pivot?.add(sourceName, `Sum of ${sourceName}`, target as never);
      else this.pivot?.updateField(sourceName, target as never);
    });
  }

  private viewsSection(): HTMLElement {
    const section = el('div', 'gc-panel-views');
    const label = el('span', 'gc-panel-views-label');
    label.textContent = panelText('views');
    section.append(label);
    const content = el('div', 'gc-panel-views-content');
    const collapse = el('div', 'gc-panel-collapse');
    const combo = document.createElement('input');
    combo.type = 'text';
    combo.className = 'gc-panel-view-input';
    combo.readOnly = false;
    const names = this.pivot?.views.all() ?? [];
    combo.value = names.length ? String(names[names.length - 1]!.name) : '';
    combo.addEventListener('click', () => {
      const next = names.map(view => view.name);
      const index = next.indexOf(combo.value);
      combo.value = next.length ? next[(index + 1) % next.length]! : '';
    });
    collapse.append(combo, el('span', 'gc-panel-view-arrow'));
    const add = document.createElement('input');
    add.type = 'button';
    add.className = 'gc-panel-button gc-panel-add';
    add.value = '\u271a';
    add.title = ptext('addView', 'Add a new view');
    add.addEventListener('click', () => {
      const name = combo.value.trim();
      if (name) { this.pivot?.views.add({ name, config: this.pivot.serialize() }); this.render(); }
    });
    const apply = document.createElement('input');
    apply.type = 'button';
    apply.className = 'gc-panel-button gc-panel-apply';
    apply.value = '\u2714';
    apply.title = ptext('applyView', 'Apply the view');
    apply.addEventListener('click', () => {
      const name = combo.value.trim();
      if (name && this.pivot?.views.get(name)) { this.pivot.views.apply(name); this.render(); }
    });
    // The trial paints Apply (check) left of Add (plus).
    content.append(collapse, apply, add);
    section.append(content);
    return section;
  }

  /** Run a field-area change, honouring the Defer Layout Update switch.
   *  While deferred, every change adds one suspend hold; the Update button
   *  (or switching defer off) releases them all and the pivot repaints once. */
  private change(run: () => void): void {
    if (this.deferred) { this.pivot?.suspendLayout(); this.holds++; this.dirty = true; }
    run();
    this.render();
  }

  private releaseHolds(): void {
    for (let i = 0; i < this.holds; i++) this.pivot?.resumeLayout();
    this.holds = 0;
    this.dirty = false;
  }

  private holds = 0;
}

function el(tag: string, className: string): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  return node;
}

function textNode(text: string, className: string): HTMLElement {
  const node = el('div', className);
  node.textContent = text;
  return node;
}

/** Whitespace between the children of a trial-style panel line (see the CSS note on
 *  `.gc-panel-all-field-item`): inside a `list-item` line it collapses to the space the trial's
 *  `innerText` starts with, without moving any glyph. */
function gap(): Text {
  return document.createTextNode('\n            ');
}

/** Inline label of a panel line (the trial renders it as an inline-block `span`). */
function labelSpan(text: string, className: string): HTMLElement {
  const node = el('span', className);
  node.textContent = text;
  return node;
}
