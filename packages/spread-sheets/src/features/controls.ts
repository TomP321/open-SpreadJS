import { GeneralFormatter } from '../formatter.js';
import type { Workbook } from '../workbook.js';
import { Events, type EventInfo, type ModelEvent } from '../events.js';
import { sparklineRange } from './sparklines.js';
import { columnLabel } from '../rendering.js';
import { FormulaHints } from './formula-hints.js';
import { colorSpans } from './formula-color.js';
import { ltext } from '../localization.js';

/** Control captions (`controls.*` / `status.*` language namespaces). */
const ctext = (key: string, fallback: string, ...args: (string | number)[]) => ltext(`controls.${key}`, fallback, ...args);
const stext = (key: string, fallback: string, ...args: (string | number)[]) => ltext(`status.${key}`, fallback, ...args);
/**
 * Two registries mirror the trial (probes core46p..core46r): `GC.Spread.Sheets.findControl`
 * resolves workbook hosts only (a FormulaTextBox placed on a child of a workbook host stays
 * invisible to it: trial `onControlHost: "undefined:null"`), while each control namespace
 * (`FormulaTextBox.findControl`, `FormulaPanel.findControl`, ...) keeps its own control map.
 */
const workbooks = new WeakMap<HTMLElement, object | null>();
const controls = new WeakMap<HTMLElement, object>();
function hostElement(host: HTMLElement | string): HTMLElement { const element = typeof host === 'string' ? document.getElementById(host) : host; if (!element) throw new Error('Control host not found'); return element; }
export function findControl<T>(host: HTMLElement | string): T | undefined { return controls.get(hostElement(host)) as T | undefined; }
/**
 * `GC.Spread.Sheets.findControl(host)` (TASK 46, probes core46p/core46q): exact-host
 * lookup of workbook registrations only — canvas/child elements, inner wrappers and
 * workbook objects answer `undefined`; host elements and their id strings map to the
 * workbook; an unknown id answers `undefined`; a destroyed workbook's host answers `null`
 * (trial: `afterDestroy: null`, `unknownId: undefined`, `twoWb: "first"`).
 */
export function findSheetControl(host: HTMLElement | string): object | null | undefined {
  if (typeof host === 'string') {
    const element = typeof document === 'undefined' ? null : document.getElementById(host);
    if (!element) return undefined;
    host = element;
  }
  if (typeof host !== 'object' || host === null || !(host instanceof HTMLElement)) return undefined;
  return workbooks.has(host) ? (workbooks.get(host) ?? null) : undefined;
}
/** Registers a control instance for its host element (used by the namespace findControl lookups). */
export function registerControl(host: HTMLElement, control: object): void { controls.set(host, control); }
/** Registers a workbook for its host; the first registration wins (trial `twoWb: "first"`). */
export function registerWorkbookHost(host: HTMLElement, workbook: object): void {
  if (!workbooks.has(host)) workbooks.set(host, workbook);
}
/** Clears the workbook registration; the host then answers `null` (trial after-destroy value). */
export function unregisterWorkbookHost(host: HTMLElement): void { if (workbooks.has(host)) workbooks.set(host, null); }
/**
 * Removes a workbook-host registration entirely; the host answers `undefined` again
 * (unlike `unregisterWorkbookHost`'s after-destroy `null`). Used by add-on hosts that
 * register a wrapper element only while a workbook lives in it (TableSheetPanel field panel).
 */
export function clearWorkbookHost(host: HTMLElement): void { workbooks.delete(host); }
/** Removes the control registration (destroy()). */
export function unregisterControl(host: HTMLElement): void { controls.delete(host); }
interface FunctionDescription { name?: string; description?: string; parameters?: { name: string; optional?: boolean; repeatable?: boolean }[] }
export class FormulaTextBox {
  private wb?: Workbook;
  private automatic = true;
  private help = true;
  private input?: HTMLInputElement | HTMLTextAreaElement | HTMLElement;
  private hints?: FormulaHints;
  private descriptions = new Map<string, FunctionDescription>();
  private abort = new AbortController();
  private original: Node[];
  private host: HTMLElement;
  private bound = () => this.refresh();
  private editChanged = (_event: ModelEvent, info: EventInfo) => { if (typeof info.editingText === 'string' && this.text() !== info.editingText) { this.text(info.editingText); const input = this.input; if (input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement) input.setSelectionRange(input.value.length, input.value.length); else if (input) { const range = document.createRange(); range.selectNodeContents(input); range.collapse(false); const selection = window.getSelection(); selection?.removeAllRanges(); selection?.addRange(range); } } };
  constructor(host: HTMLElement, readonly options: { rangeSelectMode?: boolean; absoluteReference?: boolean; needSheetName?: boolean } = {}) {
    this.host = hostElement(host); this.original = [...this.host.childNodes]; controls.set(this.host, this);
  }
  autoComplete(value?: boolean): boolean { if (value !== undefined) this.automatic = value; return this.automatic; }
  showHelp(value?: boolean): boolean { if (value !== undefined) this.help = value; return this.help; }
  add(description: FunctionDescription | FunctionDescription[]): void { for (const d of Array.isArray(description) ? description : [description]) if (d.name) this.descriptions.set(d.name.toUpperCase(), d); }
  remove(name: string): void { this.descriptions.delete(name.toUpperCase()); }
  text(value?: string): string {
    if (!this.wb || !this.input) return '';
    if (value !== undefined) {
      if (this.input instanceof HTMLInputElement || this.input instanceof HTMLTextAreaElement) this.input.value = value;
      else {
        const caret = this.caret(), focused = document.activeElement === this.input;
        this.input.textContent = value;
        if (value.startsWith('=')) this.input.replaceChildren(colorSpans(value));
        if (focused) this.setOffset(caret);
      }
    }
    return this.input instanceof HTMLInputElement || this.input instanceof HTMLTextAreaElement ? this.input.value : this.input.textContent ?? '';
  }
  /** Re-render the formula text as syntax-coloured spans, restoring the caret when focused. */
  private paint(caret?: number): void {
    const input = this.input;
    if (!input || input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement) return;
    const text = input.textContent ?? '';
    if (text.startsWith('=')) input.replaceChildren(colorSpans(text));
    else if (input.firstElementChild) input.textContent = text;
    if (caret !== undefined && document.activeElement === input) this.setOffset(caret);
  }
  private setOffset(offset: number): void {
    const input = this.input;
    if (!input) return;
    if (input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement) { input.setSelectionRange(offset, offset); return; }
    const walker = document.createTreeWalker(input, NodeFilter.SHOW_TEXT);
    let remaining = offset, node: Node | null;
    const selection = window.getSelection();
    while ((node = walker.nextNode())) {
      const length = node.textContent?.length ?? 0;
      if (remaining <= length) { const range = document.createRange(); range.setStart(node, remaining); range.collapse(true); selection?.removeAllRanges(); selection?.addRange(range); return; }
      remaining -= length;
    }
    const range = document.createRange(); range.selectNodeContents(input); range.collapse(false);
    selection?.removeAllRanges(); selection?.addRange(range);
  }
  workbook(value?: Workbook): Workbook | undefined {
    if (value === undefined) return this.wb;
    if (this.wb) { for (const event of [Events.SelectionChanged, Events.ActiveSheetChanged, Events.ValueChanged, Events.EditEnded]) this.wb.unbind(event, this.bound); this.wb.unbind(Events.EditChange, this.editChanged); }
    this.wb = value;
    if (!this.input) {
      this.input = this.host instanceof HTMLInputElement || this.host instanceof HTMLTextAreaElement ? this.host : document.createElement('div');
      if (this.input !== this.host) { this.input.contentEditable = 'true'; this.input.className = 'opensheets-formula-input'; this.host.replaceChildren(this.input); }
      this.input.setAttribute('aria-label', ctext('formulaBar', 'Formula bar')); this.input.setAttribute('role', 'textbox'); this.input.spellcheck = false;
      const signal = this.abort.signal;
      this.input.addEventListener('input', () => {
        const sheet = this.wb?.getActiveSheet(), input = this.input;
        if (sheet && input) {
          const value = this.text();
          const caret = this.caret();
          if (!sheet.isEditing()) sheet.startEdit(false, value);
          const editor = sheet._view()?.editor;
          if (editor && sheet.isEditing()) { sheet._view()?.interaction.updateFromFormulaBar(value, input, caret); input.focus(); }
          this.paint(document.activeElement === input ? caret : undefined);
        }
        this.showSuggestions();
      }, { signal });
      this.input.addEventListener('keydown', e => this.key(e as KeyboardEvent), { signal });
      this.input.addEventListener('click', () => this.showSuggestions(), { signal });
      this.input.addEventListener('keyup', e => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes((e as KeyboardEvent).key)) this.showSuggestions(); }, { signal });
      this.input.addEventListener('blur', () => { setTimeout(() => { if (document.activeElement !== this.input) this.hints?.close(); }, 100); }, { signal });
    }
    this.hints?.close();
    this.hints = new FormulaHints(value, this.input, (start, end, replacement) => { const text = this.text(); this.text(text.slice(0, start) + replacement + text.slice(end)); this.input?.dispatchEvent(new Event('input', { bubbles: true })); this.input?.focus(); }, () => [...this.descriptions.values()]);
    for (const event of [Events.SelectionChanged, Events.ActiveSheetChanged, Events.ValueChanged, Events.EditEnded]) this.wb.bind(event, this.bound);
    this.wb.bind(Events.EditChange, this.editChanged);
    this.refresh(); return value;
  }
  refresh(ignoreEditing = false): void {
    if (!this.wb || !this.input || !ignoreEditing && document.activeElement === this.input) return;
    const s = this.wb.getActiveSheet(), row = s.getActiveRowIndex(), col = s.getActiveColumnIndex();
    const formula = s.getFormula(row, col), array = s._arrayFormula(row, col);
    // TASK 91: formula cells keep the leading `=`; array formulas get the trial's `{=...}` braces.
    // Non-formula cells show the trial's bar text: the `General` text of the VALUE (the trial
    // shows `396.5` in the bar even when the cell format is `#,##0.00`), not the formatted text.
    const general = new GeneralFormatter('General').format(s.getValue(row, col));
    this.text(formula ? `${array ? '{' : ''}=${formula}${array ? '}' : ''}` : general === '' ? s.getText(row, col) : general);
  }
  private key(event: KeyboardEvent): void {
    if (event.key === 'Escape') { event.preventDefault(); this.wb?.getActiveSheet().endEdit(true); this.hints?.close(); this.refresh(true); this.wb?.focus(); return; }
    if (this.hints?.key(event)) return;
    if (event.key === 'Enter' && !event.altKey) {
      event.preventDefault(); if (!this.wb) return;
      const sheet = this.wb.getActiveSheet(), row = sheet.getActiveRowIndex(), col = sheet.getActiveColumnIndex(), text = this.text();
      if (sheet.isEditing()) sheet._view()?.interaction.commitFromFormulaBar();
      else this.wb.commandManager().execute({ cmd: 'editCell', row, col, sheetName: sheet.name(), newValue: text.startsWith('=') ? text : new GeneralFormatter().parse(text) });
      this.hints?.close(); this.wb.focus(); this.refresh(true);
    }
  }
  private caret(): number {
    const input = this.input; if (!input) return 0;
    if (input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement) return input.selectionStart ?? this.text().length;
    const selection = window.getSelection();
    if (!selection?.rangeCount || !input.contains(selection.anchorNode)) return this.text().length;
    const range = selection.getRangeAt(0).cloneRange(); range.selectNodeContents(input); range.setEnd(selection.anchorNode!, selection.anchorOffset);
    return range.toString().length;
  }
  private showSuggestions(): void {
    this.hints?.update(this.text(), this.caret(), this.automatic, this.help);
  }
  destroy(): void { if (this.wb) { for (const event of [Events.SelectionChanged, Events.ActiveSheetChanged, Events.ValueChanged, Events.EditEnded]) this.wb.unbind(event, this.bound); this.wb.unbind(Events.EditChange, this.editChanged); } this.abort.abort(); this.hints?.close(); if (this.input !== this.host) this.host.replaceChildren(...this.original); controls.delete(this.host); this.wb = undefined; }
}
export class NameBox {
  options: { dropDownMaxHeight?: number; enableAddCustomName?: boolean; enableNavigateToRange?: boolean; showCustomNameListIndicator?: boolean };
  private host: HTMLElement;
  private input: HTMLInputElement;
  private original: Node[];
  private abort = new AbortController();
  private bound = () => this.refresh();
  constructor(host: HTMLElement | string, private workbook: Workbook, options = {}) {
    this.host = hostElement(host); this.original = [...this.host.childNodes]; this.options = { dropDownMaxHeight: 300, enableAddCustomName: true, enableNavigateToRange: true, showCustomNameListIndicator: true, ...options };
    this.input = document.createElement('input'); this.input.className = 'opensheets-name-input'; this.input.setAttribute('aria-label', ctext('nameBox', 'Name box')); const container = document.createElement('div'); container.className = 'opensheets-name-container'; container.append(this.input); this.host.replaceChildren(container); controls.set(this.host, this);
    if (this.options.showCustomNameListIndicator) { const arrow = document.createElement('button'); arrow.className = 'opensheets-name-arrow'; arrow.setAttribute('aria-label', ctext('names', 'Names')); arrow.addEventListener('click', () => { const existing = this.host.querySelector('.opensheets-name-list'); if (existing) { existing.remove(); return; } const list = document.createElement('div'); list.className = 'opensheets-name-list'; list.setAttribute('role', 'listbox'); list.style.maxHeight = `${this.options.dropDownMaxHeight}px`; for (const name of [...workbook.getCustomNames(), ...workbook.getActiveSheet().getCustomNames()]) { const button = document.createElement('button'); button.textContent = name.getName(); button.setAttribute('role', 'option'); button.addEventListener('click', () => { this.input.value = name.getName(); this.input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); list.remove(); }); list.append(button); } this.host.append(list); }, { signal: this.abort.signal }); container.append(arrow); }
    this.input.addEventListener('keydown', e => { if (e.key === 'Escape') { this.refresh(); workbook.focus(); } if (e.key !== 'Enter') return; e.preventDefault(); const text = this.input.value, sheet = workbook.getActiveSheet();
      try { const name = sheet.getCustomName(text) ?? workbook.getCustomName(text), ref = name ? String(name.getExpression()).replace(/^=/, '') : text; const parsed = sparklineRange(ref); const target = parsed.sheetName ? workbook.getSheetFromName(parsed.sheetName) : sheet; if (target && this.options.enableNavigateToRange) { if (target !== sheet) workbook.setActiveSheet(target.name()); target.setActiveCell(parsed.range.row, parsed.range.col); target.setSelection(parsed.range.row, parsed.range.col, parsed.range.rowCount, parsed.range.colCount); target.showCell(parsed.range.row, parsed.range.col); } }
      catch { if (this.options.enableAddCustomName && /^[A-Za-z_][\w.]*$/.test(text)) { const r = sheet.getSelections()[0]; workbook.addCustomName(text, `${columnLabel(r.col)}${r.row + 1}:${columnLabel(r.col + r.colCount - 1)}${r.row + r.rowCount}`, 0, 0); } }
      this.refresh(); workbook.focus();
    }, { signal: this.abort.signal });
    for (const event of [Events.SelectionChanged, Events.ActiveSheetChanged]) workbook.bind(event, this.bound); this.refresh();
  }
  getHost(): HTMLElement { return this.host; }
  refresh(): void { const s = this.workbook.getActiveSheet(); this.input.value = `${columnLabel(s.getActiveColumnIndex())}${s.getActiveRowIndex() + 1}`; }
  dispose(): void { for (const event of [Events.SelectionChanged, Events.ActiveSheetChanged]) this.workbook.unbind(event, this.bound); this.abort.abort(); this.host.replaceChildren(...this.original); controls.delete(this.host); }
}
export interface StatusItemOptions { menuContent?: string; align?: 'left' | 'right'; tipText?: string; visible?: boolean; showStatusInContexMenu?: boolean; value?: unknown }
export class StatusItem {
  menuContent: string | null = null; align: 'left' | 'right' = 'left'; tipText = ''; visible = true; showStatusInContexMenu = true; value: unknown;
  protected container?: HTMLElement;
  constructor(public name: string, options: StatusItemOptions = {}) { Object.assign(this, options); }
  onBind(_context: Workbook): void {}
  onCreateItemView(container: HTMLElement): void { this.container = container; this.onUpdate(); }
  onDispose(): void { this.container?.remove(); this.container = undefined; }
  onUnbind(): void {}
  onUpdate(content?: string): void { if (!this.container) return; this.container.textContent = content ?? (this.value == null ? '' : String(this.value)); this.container.style.display = this.visible ? '' : 'none'; this.container.title = this.tipText; }
}
export class StatusBar {
  private items: StatusItem[];
  private workbook?: Workbook;
  private host: HTMLElement;
  private view: HTMLElement;
  private original: Node[];
  private bound = () => this.update();
  private mode: 'Ready' | 'Enter' | 'Edit' = 'Ready';
  private editStarted = (_event: ModelEvent, info: EventInfo) => { this.mode = info.editMode === 'Enter' ? 'Enter' : 'Edit'; this.update(); };
  private editEnded = () => { this.mode = 'Ready'; this.update(); };
  constructor(host: HTMLElement, options?: { items?: StatusItem[] }) {
    this.host = hostElement(host); this.original = [...host.childNodes]; controls.set(host, this); this.view = document.createElement('div'); this.view.className = 'opensheets-status-bar'; this.host.replaceChildren(this.view);
    const defaultNames: Record<string, string> = { cellMode: 'Cell Mode', progress: 'Progress', average: 'Average', count: 'Count', numericalCount: 'Numerical Count', min: 'Min', max: 'Max', sum: 'Sum', zoomSlider: 'Zoom Slider', zoomPanel: 'Zoom' };
    this.items = options?.items ?? ['cellMode', 'progress', 'calcProgress', 'average', 'count', 'numericalCount', 'min', 'max', 'sum', 'zoomSlider', 'zoomPanel'].map(name => new StatusItem(name, { menuContent: defaultNames[name], align: name === 'cellMode' || name === 'progress' ? 'left' : 'right', visible: !['numericalCount', 'min', 'max'].includes(name), value: name === 'cellMode' ? 'Ready' : name === 'progress' ? 0 : name === 'zoomSlider' ? 100 : name === 'zoomPanel' ? '100%' : undefined })); this.render();
  }
  private render(): void { this.view.replaceChildren(); for (const item of this.items) { const container = document.createElement('span'); container.className = `opensheets-status-item status-${item.name}`; container.dataset.align = item.align; this.view.append(container); item.onCreateItemView(container); if (['progress', 'calcProgress'].includes(item.name)) container.style.display = 'none'; if (item.name === 'zoomSlider') { const input = document.createElement('input'); input.type = 'range'; input.min = '10'; input.max = '400'; input.value = String(item.value ?? 100); input.setAttribute('aria-label', ctext('zoom', 'Zoom')); input.addEventListener('input', () => { this.workbook?.getActiveSheet().zoom(Number(input.value) / 100); this.update(); }); container.replaceChildren(input); } } }
  all(): StatusItem[] { return [...this.items]; }
  get(name: string): StatusItem | undefined { return this.items.find(item => item.name === name); }
  add(item: StatusItem, position: number): boolean { if (this.get(item.name)) return false; this.items.splice(Math.max(0, position), 0, item); if (this.workbook) item.onBind(this.workbook); this.render(); return true; }
  remove(name: string): boolean { const item = this.get(name); if (!item) return false; item.onUnbind(); item.onDispose(); this.items = this.items.filter(i => i !== item); return true; }
  bind(workbook: Workbook): void { this.unbind(); this.workbook = workbook; for (const event of [Events.SelectionChanged, Events.ActiveSheetChanged, Events.ValueChanged, Events.ViewZoomed]) workbook.bind(event, this.bound); workbook.bind('EditStarted', this.editStarted); workbook.bind(Events.EditEnded, this.editEnded); this.items.forEach(item => item.onBind(workbook)); this.update(); }
  unbind(): void { if (this.workbook) { for (const event of [Events.SelectionChanged, Events.ActiveSheetChanged, Events.ValueChanged, Events.ViewZoomed]) this.workbook.unbind(event, this.bound); this.workbook.unbind('EditStarted', this.editStarted); this.workbook.unbind(Events.EditEnded, this.editEnded); } this.mode = 'Ready'; this.items.forEach(item => item.onUnbind()); this.workbook = undefined; }
  update(): void {
    if (!this.workbook) return; const sheet = this.workbook.getActiveSheet(), selections = sheet.getSelections().map(r => r.normalized(sheet.getRowCount(), sheet.getColumnCount()));
    let count = 0; const values: number[] = [];
    for (const [row, col] of sheet._viewCellStore()?.entries() ?? []) if (selections.some(r => r.contains(row, col))) { const value = sheet.getValue(row, col); if (value != null && value !== '') count++; if (typeof value === 'number' && Number.isFinite(value)) values.push(value); }
    const sum = values.reduce((a, b) => a + b, 0), show = count > 1;
    const computed: Record<string, unknown> = { cellMode: this.mode, count: show ? `Count: ${count}` : '', numericalCount: show ? `Numerical Count: ${values.length}` : '', sum: show && values.length ? `Sum: ${sum}` : '', average: show && values.length ? `Average: ${sum / values.length}` : '', min: show && values.length ? `Min: ${Math.min(...values)}` : '', max: show && values.length ? `Max: ${Math.max(...values)}` : '', zoomPanel: `${Math.round(sheet.zoom() * 100)}%` };
    const painted: Record<string, string> = { cellMode: stext(`mode.${this.mode}`, this.mode), count: show ? stext('count', 'Count: {0}', count) : '', numericalCount: show ? stext('numericalCount', 'Numerical Count: {0}', values.length) : '', sum: show && values.length ? stext('sum', 'Sum: {0}', sum) : '', average: show && values.length ? stext('average', 'Average: {0}', sum / values.length) : '', min: show && values.length ? stext('min', 'Min: {0}', Math.min(...values)) : '', max: show && values.length ? stext('max', 'Max: {0}', Math.max(...values)) : '', zoomPanel: computed.zoomPanel as string };
    for (const item of this.items) { if (item.name === 'zoomSlider') { const input = this.view.querySelector<HTMLInputElement>('.status-zoomSlider input'); if (input) input.value = String(Math.round(sheet.zoom() * 100)); } else if (item.name in computed) { item.value = computed[item.name]; item.onUpdate(painted[item.name] ?? String(item.value)); } else { item.onUpdate(); if (['progress', 'calcProgress'].includes(item.name)) this.view.querySelector<HTMLElement>(`.status-${item.name}`)!.style.display = 'none'; } }
  }
  dispose(): void { this.unbind(); this.items.forEach(item => item.onDispose()); this.host.replaceChildren(...this.original); controls.delete(this.host); }
}
