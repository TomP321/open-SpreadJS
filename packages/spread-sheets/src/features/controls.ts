import { GeneralFormatter } from '../formatter.js';
import type { Workbook } from '../model.js';
import { Events, type EventInfo, type ModelEvent } from '../events.js';
import { sparklineRange } from './sparklines.js';
import { columnLabel } from '../rendering.js';
import { builtinNames } from '../calc/evaluate.js';
const controls = new WeakMap<HTMLElement, object>();
function hostElement(host: HTMLElement | string): HTMLElement { const element = typeof host === 'string' ? document.getElementById(host) : host; if (!element) throw new Error('Control host not found'); return element; }
export function findControl<T>(host: HTMLElement | string): T | undefined { return controls.get(hostElement(host)) as T | undefined; }
interface FunctionDescription { name?: string; description?: string; parameters?: { name: string; optional?: boolean; repeatable?: boolean }[] }
const functionParameters: Record<string, string[]> = { SUM: ['number1', '[number2]'], AVERAGE: ['number1', '[number2]'], IF: ['logical_test', 'value_if_true', 'value_if_false'], VLOOKUP: ['lookup_value', 'table_array', 'col_index_num', '[range_lookup]'], COUNTIF: ['range', 'criteria'], SUMIF: ['range', 'criteria', '[sum_range]'] };
export class FormulaTextBox {
  private wb?: Workbook;
  private automatic = true;
  private help = true;
  private input?: HTMLInputElement | HTMLTextAreaElement | HTMLElement;
  private hints?: HTMLElement;
  private descriptions = new Map<string, FunctionDescription>();
  private abort = new AbortController();
  private original: Node[];
  private host: HTMLElement;
  private bound = () => this.refresh();
  private editChanged = (_event: ModelEvent, info: EventInfo) => { if (typeof info.editingText === 'string' && document.activeElement !== this.input) this.text(info.editingText); };
  constructor(host: HTMLElement, readonly options: { rangeSelectMode?: boolean; absoluteReference?: boolean; needSheetName?: boolean } = {}) {
    this.host = hostElement(host); this.original = [...this.host.childNodes]; controls.set(this.host, this);
  }
  autoComplete(value?: boolean): boolean { if (value !== undefined) this.automatic = value; return this.automatic; }
  showHelp(value?: boolean): boolean { if (value !== undefined) this.help = value; return this.help; }
  add(description: FunctionDescription | FunctionDescription[]): void { for (const d of Array.isArray(description) ? description : [description]) if (d.name) this.descriptions.set(d.name.toUpperCase(), d); }
  remove(name: string): void { this.descriptions.delete(name.toUpperCase()); }
  text(value?: string): string {
    if (!this.wb || !this.input) return '';
    if (value !== undefined) { if (this.input instanceof HTMLInputElement || this.input instanceof HTMLTextAreaElement) this.input.value = value; else this.input.textContent = value; }
    return this.input instanceof HTMLInputElement || this.input instanceof HTMLTextAreaElement ? this.input.value : this.input.textContent ?? '';
  }
  workbook(value?: Workbook): Workbook | undefined {
    if (value === undefined) return this.wb;
    if (this.wb) { for (const event of [Events.SelectionChanged, Events.ActiveSheetChanged, Events.ValueChanged, Events.EditEnded]) this.wb.unbind(event, this.bound); this.wb.unbind(Events.EditChange, this.editChanged); }
    this.wb = value;
    if (!this.input) {
      this.input = this.host instanceof HTMLInputElement || this.host instanceof HTMLTextAreaElement ? this.host : document.createElement('div');
      if (this.input !== this.host) { this.input.contentEditable = 'true'; this.input.className = 'opensheets-formula-input'; this.host.replaceChildren(this.input); }
      this.input.setAttribute('aria-label', 'Formula bar'); this.input.setAttribute('role', 'textbox'); this.input.spellcheck = false;
      const signal = this.abort.signal;
      this.input.addEventListener('input', () => this.showSuggestions(), { signal });
      this.input.addEventListener('keydown', e => this.key(e as KeyboardEvent), { signal });
      this.input.addEventListener('blur', () => { setTimeout(() => { if (!this.hints?.contains(document.activeElement)) this.hints?.remove(); }, 100); }, { signal });
    }
    for (const event of [Events.SelectionChanged, Events.ActiveSheetChanged, Events.ValueChanged, Events.EditEnded]) this.wb.bind(event, this.bound);
    this.wb.bind(Events.EditChange, this.editChanged);
    this.refresh(); return value;
  }
  refresh(ignoreEditing = false): void {
    if (!this.wb || !this.input || !ignoreEditing && document.activeElement === this.input) return;
    const s = this.wb.getActiveSheet(), row = s.getActiveRowIndex(), col = s.getActiveColumnIndex();
    this.text(s.getFormula(row, col) ? '=' + s.getFormula(row, col) : s.getText(row, col));
  }
  private key(event: KeyboardEvent): void {
    if (event.key === 'Escape') { event.preventDefault(); this.hints?.remove(); this.refresh(true); this.wb?.focus(); return; }
    const entries = [...this.hints?.querySelectorAll<HTMLButtonElement>('button') ?? []];
    if (entries.length && ['ArrowDown', 'ArrowUp', 'Tab'].includes(event.key)) {
      event.preventDefault(); const index = entries.indexOf(document.activeElement as HTMLButtonElement);
      if (event.key === 'Tab') entries[Math.max(0, index)]?.click(); else entries[(index + (event.key === 'ArrowDown' ? 1 : -1) + entries.length) % entries.length]?.focus(); return;
    }
    if (event.key === 'Enter' && !event.altKey) {
      event.preventDefault(); if (!this.wb) return;
      const sheet = this.wb.getActiveSheet(), row = sheet.getActiveRowIndex(), col = sheet.getActiveColumnIndex(), text = this.text();
      this.wb.commandManager().execute({ cmd: 'editCell', row, col, sheetName: sheet.name(), newValue: text.startsWith('=') ? text : new GeneralFormatter().parse(text) });
      this.hints?.remove(); this.wb.focus(); this.refresh(true);
    }
  }
  private showSuggestions(): void {
    this.hints?.remove(); const text = this.text(); if (!text.startsWith('=')) return;
    const partial = /([A-Za-z][A-Za-z0-9.]*)$/.exec(text), call = /([A-Za-z][A-Za-z0-9.]*)\(([^()]*)$/.exec(text);
    const panel = document.createElement('div'); panel.className = 'opensheets-formula-hints';
    const rect = this.host.getBoundingClientRect(); Object.assign(panel.style, { position: 'fixed', left: `${rect.left}px`, top: `${rect.bottom}px`, zIndex: '100', background: 'white', color: '#333', border: '1px solid #aaa', font: '12px Arial', boxShadow: '1px 2px 5px #0003', maxHeight: '240px', overflow: 'auto', minWidth: '160px' });
    if (partial && this.automatic) {
      panel.setAttribute('role', 'listbox');
      const names = [...new Set([...builtinNames(), ...this.descriptions.keys()])].filter(name => name.startsWith(partial[1].toUpperCase())).sort();
      for (const name of names.slice(0, 50)) { const button = document.createElement('button'); button.textContent = name; button.setAttribute('role', 'option'); button.style.cssText = 'display:block;width:100%;border:0;background:white;text-align:left;padding:4px 8px;font:inherit'; button.addEventListener('click', () => { this.text(text.slice(0, -partial[1].length) + name + '('); this.input?.focus(); this.showSuggestions(); }); button.addEventListener('keydown', e => this.key(e)); panel.append(button); }
      if (!names.length) return;
    } else if (call && this.help) {
      const name = call[1].toUpperCase(), description = this.descriptions.get(name), params = description?.parameters?.map(p => p.name) ?? functionParameters[name];
      if (!params) return;
      panel.setAttribute('role', 'tooltip'); const signature = document.createElement('div'); signature.style.padding = '5px'; const index = call[2].split(',').length - 1;
      signature.append(name + '('); params.forEach((p, i) => { if (i) signature.append(', '); const part = document.createElement(i === Math.min(index, params.length - 1) ? 'b' : 'span'); part.textContent = p; signature.append(part); }); signature.append(')'); panel.append(signature);
    } else return;
    document.body.append(panel); this.hints = panel;
  }
  destroy(): void { if (this.wb) { for (const event of [Events.SelectionChanged, Events.ActiveSheetChanged, Events.ValueChanged, Events.EditEnded]) this.wb.unbind(event, this.bound); this.wb.unbind(Events.EditChange, this.editChanged); } this.abort.abort(); this.hints?.remove(); if (this.input !== this.host) this.host.replaceChildren(...this.original); controls.delete(this.host); this.wb = undefined; }
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
    this.input = document.createElement('input'); this.input.className = 'opensheets-name-input'; this.input.setAttribute('aria-label', 'Name box'); const container = document.createElement('div'); container.className = 'opensheets-name-container'; container.append(this.input); this.host.replaceChildren(container); controls.set(this.host, this);
    if (this.options.showCustomNameListIndicator) { const arrow = document.createElement('button'); arrow.className = 'opensheets-name-arrow'; arrow.setAttribute('aria-label', 'Names'); arrow.addEventListener('click', () => { const existing = this.host.querySelector('.opensheets-name-list'); if (existing) { existing.remove(); return; } const list = document.createElement('div'); list.className = 'opensheets-name-list'; list.setAttribute('role', 'listbox'); list.style.maxHeight = `${this.options.dropDownMaxHeight}px`; for (const name of [...workbook.getCustomNames(), ...workbook.getActiveSheet().getCustomNames()]) { const button = document.createElement('button'); button.textContent = name.getName(); button.setAttribute('role', 'option'); button.addEventListener('click', () => { this.input.value = name.getName(); this.input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); list.remove(); }); list.append(button); } this.host.append(list); }, { signal: this.abort.signal }); container.append(arrow); }
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
  private render(): void { this.view.replaceChildren(); for (const item of this.items) { const container = document.createElement('span'); container.className = `opensheets-status-item status-${item.name}`; container.dataset.align = item.align; this.view.append(container); item.onCreateItemView(container); if (['progress', 'calcProgress'].includes(item.name)) container.style.display = 'none'; if (item.name === 'zoomSlider') { const input = document.createElement('input'); input.type = 'range'; input.min = '10'; input.max = '400'; input.value = String(item.value ?? 100); input.setAttribute('aria-label', 'Zoom'); input.addEventListener('input', () => { this.workbook?.getActiveSheet().zoom(Number(input.value) / 100); this.update(); }); container.replaceChildren(input); } } }
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
    for (const item of this.items) { if (item.name === 'zoomSlider') { const input = this.view.querySelector<HTMLInputElement>('.status-zoomSlider input'); if (input) input.value = String(Math.round(sheet.zoom() * 100)); } else if (item.name in computed) { item.value = computed[item.name]; item.onUpdate(String(item.value)); } else { item.onUpdate(); if (['progress', 'calcProgress'].includes(item.name)) this.view.querySelector<HTMLElement>(`.status-${item.name}`)!.style.display = 'none'; } }
  }
  dispose(): void { this.unbind(); this.items.forEach(item => item.onDispose()); this.host.replaceChildren(...this.original); controls.delete(this.host); }
}
