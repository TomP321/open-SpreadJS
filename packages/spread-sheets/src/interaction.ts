import { applyMask, type MaskOptions } from './features/input-mask.js';
import { filterMenu } from './features/filter-menu.js';
import { compactMenu, renderMenu, type MenuItemData } from './features/context-menu.js';
import { HideRowFilter, type RowFilterBase } from './features/filters.js';
import type { WorkbookRenderer } from './rendering.js';
import type { Worksheet } from './model.js';
import { Range } from './primitives.js';
import { adjustFormula } from './range.js';
import { Events } from './events.js';
import { notImplemented } from './not-implemented.js';
import { GeneralFormatter } from './formatter.js';
import { FormulaHints } from './features/formula-hints.js';
import { referenceAllowed, insertReference, closeFormulaParentheses } from './features/formula-point.js';
import { colorFormula, parseReference } from './features/formula-color.js';
import { FormulaParseError } from './calc/errors.js';
import { columnLabel } from './rendering.js';

export function encodeTSV(rows: unknown[][]): string {
  return rows.map(row => row.map(value => {
    const text = value == null ? '' : String(value);
    return /[\t\n\r"]/.test(text) ? '"' + text.replaceAll('"', '""') + '"' : text;
  }).join('\t')).join('\r\n');
}
export function decodeTSV(text: string): string[][] {
  const rows: string[][] = [], row: string[] = [];
  let field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"' && (!field || quoted)) {
      if (quoted && text[i + 1] === '"') { field += '"'; i++; } else quoted = !quoted;
    } else if (char === '\t' && !quoted) { row.push(field); field = ''; }
    else if ((char === '\r' || char === '\n') && !quoted) {
      if (char === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push([...row]); row.length = 0; field = '';
    } else field += char;
  }
  if (field || row.length || !rows.length) { row.push(field); rows.push(row); }
  return rows;
}
export function seriesValue(values: unknown[], index: number): unknown {
  if (values.length > 1 && values.every(v => typeof v === 'number')) return Number(values[0]) + index * (Number(values[1]) - Number(values[0]));
  if (values.every(v => v instanceof Date)) {
    const first = (values[0] as Date).getTime();
    return new Date(first + index * (values.length > 1 ? (values[1] as Date).getTime() - first : 86400000));
  }
  return values[((index % values.length) + values.length) % values.length];
}
interface Cell { row: number; col: number }
interface Drag { kind: 'select' | 'resizeRow' | 'resizeCol' | 'fill' | 'move'; start: Cell; range: Range; initial: number; startPixel: number; last: Cell }

export class Interaction {
  private abort = new AbortController();
  private hints: FormulaHints;
  private formulaLayer?: HTMLElement;
  private editorContainer?: HTMLElement;
  private referenceLayers: HTMLElement[] = [];
  private drag?: Drag;
  private anchor: Cell = { row: 0, col: 0 };
  private editing?: { sheet: Worksheet; row: number; col: number; oldValue: unknown; enter: boolean };
  private pointReference?: { start: number; end: number; anchor: Cell; last: Cell };
  private pointDragging = false;
  private formulaBar?: HTMLElement;
  private cut = false;
  private clipboard?: { sheet: Worksheet; range: Range; values: unknown[][] };
  private menu?: HTMLElement;
  private ants?: ReturnType<typeof setInterval>;
  private tabDrag?: number;
  private tabPointerX = 0;
  private touch?: { x: number; y: number; moved: boolean };
  constructor(readonly view: WorkbookRenderer) {
    const { root, overlay, editor, tabs } = view, signal = this.abort.signal;
    this.hints = new FormulaHints(view.workbook, editor, (start, end, value) => { editor.setRangeText(value, start, end, 'end'); editor.dispatchEvent(new Event('input', { bubbles: true })); editor.focus(); });
    root.addEventListener('keydown', event => this.keydown(event), { signal });
    overlay.addEventListener('pointerdown', event => this.pointerDown(event), { signal });
    overlay.addEventListener('pointermove', event => this.pointerMove(event), { signal });
    overlay.addEventListener('pointerup', event => this.pointerUp(event), { signal });
    overlay.addEventListener('pointercancel', () => { this.drag = undefined; this.touch = undefined; }, { signal });
    overlay.addEventListener('dblclick', event => this.doubleClick(event), { signal });
    root.addEventListener('wheel', event => {
      event.preventDefault();
      if (event.ctrlKey && view.workbook.options.allowUserZoom) {
        const s = view.sheet!, oldZoomFactor = s.zoom(), newZoomFactor = Math.max(0.1, Math.min(4, Math.round((oldZoomFactor + (event.deltaY > 0 ? -0.1 : 0.1)) * 10) / 10));
        const info = { sheet: s, oldZoomFactor, newZoomFactor, cancel: false };
        s._emit(Events.ViewZooming, info);
        if (!info.cancel) { s.zoom(newZoomFactor); s._emit(Events.ViewZoomed, info); }
      } else {
        const scale = event.deltaMode === 1 ? 20 : event.deltaMode === 2 ? view.viewHeight : 1;
        view.scroll((event.shiftKey ? 0 : event.deltaY) * scale / view.zoom, (event.deltaX + (event.shiftKey ? event.deltaY : 0)) * scale / view.zoom);
      }
    }, { passive: false, signal });
    root.addEventListener('copy', event => this.copy(event, false), { signal });
    root.addEventListener('cut', event => this.copy(event, true), { signal });
    root.addEventListener('paste', event => this.paste(event), { signal });
    root.addEventListener('contextmenu', event => this.contextMenu(event), { signal });
    editor.addEventListener('input', () => {
      const active = this.editing;
      this.pointReference = undefined;
      const mask = active?.sheet.getActualStyle(active.row, active.col).mask as MaskOptions | undefined;
      if (mask?.pattern) { const position = editor.selectionStart; editor.value = applyMask(editor.value, mask, true); editor.setSelectionRange(position, position); }
      this.positionEditor();
      this.hints.update(editor.value, editor.selectionStart);
      const edit = this.editing; if (edit) edit.sheet._emit(Events.EditChange, { sheet: edit.sheet, sheetName: edit.sheet.name(), row: edit.row, col: edit.col, editingText: editor.value });
    }, { signal });
    const updateHintCaret = () => { if (this.editing) this.hints.update(editor.value, editor.selectionStart); };
    editor.addEventListener('click', updateHintCaret, { signal });
    editor.addEventListener('keyup', event => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) updateHintCaret(); }, { signal });
    tabs.addEventListener('pointerdown', event => {
      const hit = this.tabHit(event.clientX); if (!hit) return;
      const pointing = hit.index >= 0 && this.canPoint();
      if (!pointing && !this.endEdit()) return;
      if (pointing) event.preventDefault();
      const wb = view.workbook;
      if (hit.index === -4) { event.stopPropagation(); this.sheetList(); }
      else if (hit.index === -1) { wb.addSheet(wb.getSheetCount()); wb.setActiveSheetIndex(wb.getSheetCount() - 1); }
      else if (hit.index === -2) { wb.startSheetIndex(Math.max(0, wb.startSheetIndex() - 1)); wb.repaint(); }
      else if (hit.index === -3) { wb.startSheetIndex(Math.min(wb.getSheetCount() - 1, wb.startSheetIndex() + 1)); wb.repaint(); }
      else {
        wb._emit(Events.SheetTabClick, { sheet: wb.getSheet(hit.index), sheetName: wb.getSheet(hit.index).name(), sheetTabIndex: hit.index });
        wb.setActiveSheetIndex(hit.index); this.tabDrag = hit.index; this.tabPointerX = event.clientX; tabs.setPointerCapture(event.pointerId);
      }
      if (pointing) { this.pointReference = undefined; this.positionEditor(); (this.formulaBar ?? editor).focus(); }
      else if (this.menu) this.menu.focus(); else root.focus();
    }, { signal });
    tabs.addEventListener('pointerup', event => {
      if (this.tabDrag !== undefined && Math.abs(event.clientX - this.tabPointerX) > 5 && view.workbook.options.allowSheetReorder) {
        const hit = this.tabHit(event.clientX), wb = view.workbook;
        if (hit && hit.index >= 0 && hit.index !== this.tabDrag) {
          const sheet = wb.getSheet(this.tabDrag), info = { sheet, sheetName: sheet.name(), fromIndex: this.tabDrag, toIndex: hit.index, cancel: false };
          wb._emit(Events.SheetMoving, info);
          if (!info.cancel) { wb.changeSheetIndex(sheet.name(), hit.index); wb._emit(Events.SheetMoved, info); }
        }
      }
      this.tabDrag = undefined;
    }, { signal });
    tabs.addEventListener('dblclick', event => this.renameTab(event), { signal });
    document.addEventListener('keydown', event => { if (this.menu && event.key === 'Escape') { event.preventDefault(); this.closeMenu(); root.focus(); } }, { signal });
    document.addEventListener('pointerdown', event => { if (this.menu && !this.menu.contains(event.target as Node)) this.closeMenu(); }, { signal });
    this.registerCommands();
  }
  get isEditing(): boolean { return !!this.editing; }
  private info(cell: Cell, sheetArea = 3) { const sheet = this.view.sheet!; return { sheet, sheetName: sheet.name(), row: cell.row, col: cell.col, sheetArea }; }
  private point(event: MouseEvent): { x: number; y: number } { const rect = this.view.overlay.getBoundingClientRect(); return { x: event.clientX - rect.left, y: event.clientY - rect.top }; }
  private hit(event: MouseEvent) { const { x, y } = this.point(event); return this.view.hitTest(x, y); }
  private tabHit(clientX: number) { const x = clientX - this.view.tabs.getBoundingClientRect().left; return this.view.tabHits.find(hit => x >= hit.x && x < hit.x + hit.width); }
  private registerCommands(): void {
    const cm = this.view.workbook.commandManager();
    const keys: [string, number, number, number, boolean?][] = [['navigationLeft', 37, 0, -1], ['navigationUp', 38, -1, 0], ['navigationRight', 39, 0, 1], ['navigationDown', 40, 1, 0], ['moveToNextCell', 9, 0, 1], ['moveToPreviousCell', 9, 0, -1, true], ['commitInputNavigationDown', 13, 1, 0], ['commitInputNavigationUp', 13, -1, 0, true]];
    for (const [name, key, dr, dc, shift] of keys) cm.register(name, { execute: () => { this.navigate(dr, dc); return true; } }, key, false, shift ?? false);
    cm.register('undo', { execute: () => this.view.workbook.undoManager().undo() }, 90, true);
    cm.register('redo', { execute: () => this.view.workbook.undoManager().redo() }, 89, true);
    cm.register('clearValues', { execute: () => { this.clearValues(); return true; } }, 46);
    cm.register('startEdit', { execute: () => { this.startEdit(); return true; } }, 113);
    const endpoint = (end: boolean, ctrl: boolean, extend: boolean) => {
      const s = this.view.sheet!;
      const used = s._usedRange();
      this.selectTo(ctrl ? end ? used.row : 0 : s.getActiveRowIndex(), end ? ctrl ? used.col : s.getColumnCount() - 1 : 0, extend);
      this.view.showCell(s.getActiveRowIndex(), s.getActiveColumnIndex()); return true;
    };
    for (const [end, key] of [[false, 36], [true, 35]] as const) for (const ctrl of [false, true]) for (const extend of [false, true]) {
      const name = `${extend ? 'selection' : 'navigation'}${ctrl ? end ? 'Last' : 'First' : end ? 'End' : 'Home'}`;
      cm.register(name, { execute: () => endpoint(end, ctrl, extend) }, key, ctrl, extend);
    }
    for (const [down, key] of [[false, 33], [true, 34]] as const) for (const extend of [false, true]) {
      const name = `${extend ? 'selection' : 'navigation'}Page${down ? 'Down' : 'Up'}`;
      cm.register(name, { execute: () => { this.navigate((down ? 1 : -1) * Math.max(1, this.view.rows.length - 2), 0, extend); return true; } }, key, false, extend);
    }
    for (const [name, dr, dc] of [['moveToNextCellThenControl', 0, 1], ['moveToPreviousCellThenControl', 0, -1]] as const) cm.register(name, { execute: () => { this.navigate(dr, dc); return true; } });
    cm.register('commitInput', { execute: () => this.endEdit() });
    cm.register('cancelInput', { execute: () => this.endEdit(true) });
    cm.register('selectAll', { execute: () => { this.view.sheet!.setSelection(-1, -1, -1, -1); return true; } }, 65, true);
    cm.register('navigationNextSheet', { execute: () => { const wb = this.view.workbook; wb.setActiveSheetIndex(Math.min(wb.getSheetCount() - 1, wb.getActiveSheetIndex() + 1)); return true; } }, 34, true);
    cm.register('navigationPreviousSheet', { execute: () => { const wb = this.view.workbook; wb.setActiveSheetIndex(Math.max(0, wb.getActiveSheetIndex() - 1)); return true; } }, 33, true);

    for (const [key, dr, dc, direction] of [[37, 0, -1, 'Left'], [38, -1, 0, 'Up'], [39, 0, 1, 'Right'], [40, 1, 0, 'Down']] as const) {
      cm.register(`selection${direction}`, { execute: () => { this.navigate(dr, dc, true); return true; } }, key, false, true);
      cm.register(`navigation${direction === 'Left' ? 'Home2' : direction === 'Right' ? 'End2' : direction === 'Up' ? 'Top' : 'Bottom'}`, { execute: () => { this.navigate(dr, dc, false, true); return true; } }, key, true);
      cm.register(`selection${direction === 'Left' ? 'Home' : direction === 'Right' ? 'End' : direction === 'Up' ? 'Top' : 'Bottom'}`, { execute: () => { this.navigate(dr, dc, true, true); return true; } }, key, true, true);
    }
  }
  startEdit(selectAll = false, defaultText?: string): void {
    const s = this.view.sheet;
    if (!s || this.editing || s.options.isProtected) return;
    const row = s.getActiveRowIndex(), col = s.getActiveColumnIndex(), info = { ...this.info({ row, col }), cancel: false };
    s._emit(Events.EditStarting, info); if (info.cancel) return;
    const editor = this.view.editor;
    this.editing = { sheet: s, row, col, oldValue: s.getValue(row, col), enter: defaultText !== undefined };
    this.pointReference = undefined;
    editor.value = defaultText ?? (s.getFormula(row, col) ? '=' + s.getFormula(row, col) : s.getValue(row, col) instanceof Date ? s.getText(row, col) : String(s.getValue(row, col) ?? ''));
    const mask = s.getActualStyle(row, col).mask as MaskOptions | undefined;
    if (mask?.pattern) editor.value = applyMask(editor.value, mask, true);
    editor.style.display = 'block'; this.positionEditor(); editor.focus();
    if (selectAll) editor.select(); else editor.setSelectionRange(editor.value.length, editor.value.length);
    s._emit('EditStarted', { ...this.info({ row, col }), editMode: defaultText === undefined ? 'Edit' : 'Enter' });
    s._emit(Events.EditChange, { sheet: s, sheetName: s.name(), row, col, editingText: editor.value });
    s._emit(Events.EditorStatusChanged, { sheet: s, sheetName: s.name(), oldStatus: 0, newStatus: 2 });
  }
  updateFromFormulaBar(value: string, input: HTMLElement, caret: number): void {
    if (!this.editing) return;
    this.formulaBar = input; this.view.editor.value = value; this.view.editor.setSelectionRange(caret, caret); this.positionEditor(); this.hints.close();
    const edit = this.editing; edit.sheet._emit(Events.EditChange, { sheet: edit.sheet, sheetName: edit.sheet.name(), row: edit.row, col: edit.col, editingText: value });
  }
  positionEditor(): void {
    if (!this.editing) return;
    const { row, col, sheet } = this.editing;
    this.view.editor.style.opacity = sheet === this.view.sheet ? '1' : '0';
    const rect = this.view.cellRect(row, col), style = sheet.getActualStyle(row, col), editor = this.view.editor;
    const ctx = this.view.context; ctx.save(); ctx.font = this.view.font(style);
    const lines = editor.value.split('\n');
    const measured = Math.max(...lines.map(line => ctx.measureText(line).width)); ctx.restore();
    const width = style.wordWrap ? rect.width - 1 : Math.min(this.view.viewWidth - rect.x, Math.max(rect.width + 1, Math.ceil(measured) + 2));
    const height = Math.max(rect.height - (style.wordWrap ? 1 : 0), lines.length * 19 * this.view.zoom) ;
    if (!this.editorContainer) { this.editorContainer = document.createElement('div'); this.editorContainer.className = 'gc-cell-editor-container'; this.view.root.append(this.editorContainer); }
    Object.assign(this.editorContainer.style, { display: editor.style.display, left: `${rect.x - 2}px`, top: `${rect.y - 2}px`, width: `${width + 4}px`, height: `${height + 4}px`, background: String(style.backColor ?? 'white') });
    Object.assign(editor.style, { left: `${rect.x}px`, top: `${rect.y}px`, width: `${width}px`, height: `${height}px`, font: this.view.font(style), color: String(style.foreColor ?? '#243148'), caretColor: String(style.foreColor ?? '#243148'), background: 'transparent', textAlign: style.hAlign === 2 ? 'right' : style.hAlign === 1 ? 'center' : 'left', padding: '0px' });
    editor.scrollLeft = 0;
    this.renderFormulaOverlay();
  }
  private renderFormulaOverlay(): void {
    this.formulaLayer?.remove(); this.formulaLayer = undefined;
    for (const layer of this.referenceLayers) layer.remove(); this.referenceLayers = [];
    const editor = this.view.editor, edit = this.editing, text = editor.value;
    const foreColor = String(edit ? edit.sheet.getActualStyle(edit.row, edit.col).foreColor ?? '#243148' : '#243148');
    if (!edit || !text.startsWith('=')) { editor.style.color = foreColor; return; }
    if (edit.sheet !== this.view.sheet) {
      editor.style.color = foreColor;
      const point = this.pointReference;
      if (point && point.anchor.row >= 0 && point.anchor.col >= 0 && point.last.row >= 0 && point.last.col >= 0) this.drawReference(point.anchor, point.last, '#0000ff');
      return;
    }
    const sheet = edit.sheet, wb = this.view.workbook;
    const { segments, references } = colorFormula(text);
    const layer = document.createElement('div'); layer.className = 'opensheets-formula-color';
    Object.assign(layer.style, { position: 'absolute', zIndex: '4', boxSizing: 'border-box', overflow: 'hidden', whiteSpace: 'pre-wrap', pointerEvents: 'none', left: editor.style.left, top: editor.style.top, width: editor.style.width, height: editor.style.height, font: editor.style.font, textAlign: editor.style.textAlign, background: 'transparent', color: foreColor });
    for (const segment of segments) { const span = document.createElement('span'); span.textContent = segment.text; if (segment.color) span.style.color = segment.color; layer.append(span); }
    this.view.root.append(layer); this.formulaLayer = layer;
    editor.style.color = 'transparent';
    const point = this.pointReference;
    for (const reference of references) {
      let bounds = reference.col1 >= 0 ? reference : undefined;
      if (!bounds && /^[A-Za-z_][A-Za-z0-9_.]*$/.test(reference.text)) { // a defined name resolves through the model
        const name = sheet.getCustomName(reference.text) ?? wb.getCustomName(reference.text);
        const expression = name ? String((name as { getExpression?: () => unknown }).getExpression?.() ?? '') : '';
        const parsed = parseReference(expression.replace(/^=/, ''));
        if (parsed) bounds = { ...reference, ...parsed };
      }
      if (!bounds || (bounds.sheetName && bounds.sheetName !== sheet.name())) continue;
      if (bounds.row1 >= 0 && bounds.col1 >= 0 && bounds.row2 < sheet.getRowCount() && bounds.col2 < sheet.getColumnCount()) {
        // A reference created by the latest point gesture stays dashed until the text changes again.
        const dashed = !!point && point.start === reference.start && point.end === reference.start + reference.text.length;
        this.drawReference({ row: bounds.row1, col: bounds.col1 }, { row: bounds.row2, col: bounds.col2 }, reference.color, !dashed);
      }
    }
  }
  private drawReference(first: Cell, last: Cell, color: string, solid = false): void {
    const a = this.view.cellRect(Math.min(first.row, last.row), Math.min(first.col, last.col)), b = this.view.cellRect(Math.max(first.row, last.row), Math.max(first.col, last.col));
    const line = (direction: 'right' | 'bottom') => solid ? `linear-gradient(${color}, ${color})` : `repeating-linear-gradient(to ${direction}, ${color} 0 6px, transparent 6px 12px)`;
    const border = document.createElement('div'); Object.assign(border.style, { position: 'absolute', pointerEvents: 'none', zIndex: '3', boxSizing: 'border-box', backgroundImage: `${line('right')}, ${line('right')}, ${line('bottom')}, ${line('bottom')}, linear-gradient(${color}1a, ${color}1a)`, backgroundSize: '100% 2px, 100% 2px, 2px 100%, 2px 100%, calc(100% - 4px) calc(100% - 4px)', backgroundPosition: '1px 0, bottom left, left -1px, right -2px, 2px 2px', backgroundRepeat: 'no-repeat', left: `${a.x - 1}px`, top: `${a.y - 1}px`, width: `${b.x + b.width - a.x + 1}px`, height: `${b.y + b.height - a.y + 1}px` });
    for (const [horizontal, vertical] of [['left', 'top'], ['right', 'top'], ['left', 'bottom'], ['right', 'bottom']] as const) {
      const handle = document.createElement('div'); Object.assign(handle.style, { position: 'absolute', width: '5px', height: '5px', background: color, [horizontal]: '-1px', [vertical]: '-1px' }); border.append(handle);
    }
    this.view.root.append(border); this.referenceLayers.push(border);
  }
  endEdit(ignoreValueChange = false): boolean {
    const edit = this.editing; if (!edit) return true;
    const { sheet, row, col } = edit, text = this.view.editor.value;
    const info = { sheet, sheetName: sheet.name(), row, col, editor: this.view.editor, editingText: text, cancel: false, isCancel: ignoreValueChange };
    sheet._emit(Events.EditEnding, info); if (info.cancel && !ignoreValueChange) return false;
    if (!ignoreValueChange) {
      const value = text.startsWith('=') ? closeFormulaParentheses(text) : this.parseText(text, row, col);
      try {
        this.view.workbook.commandManager().execute({ cmd: 'editCell', sheetName: sheet.name(), row, col, newValue: value });
      } catch (error) { if (error instanceof FormulaParseError) return false; throw error; }
      if (text.startsWith('=')) sheet._emit(Events.UserFormulaEntered, { ...info, formula: text.slice(1) });
    }
    if (this.view.sheet !== sheet) this.view.workbook.setActiveSheet(sheet.name());
    this.view.editor.style.opacity = '1';
    this.hints.close(); this.formulaLayer?.remove(); this.formulaLayer = undefined; for (const layer of this.referenceLayers) layer.remove(); this.referenceLayers = []; this.editing = undefined; this.pointReference = undefined; this.formulaBar = undefined; this.view.editor.style.display = 'none'; if (this.editorContainer) this.editorContainer.style.display = 'none'; this.view.root.focus();
    sheet._emit(Events.EditEnded, { ...info, newValue: sheet.getValue(row, col) });
    sheet._emit(Events.EditorStatusChanged, { sheet, sheetName: sheet.name(), oldStatus: 2, newStatus: 0 });
    this.view.schedule(); return true;
  }
  commitFromFormulaBar(): void { if (this.endEdit()) this.navigate(1, 0); }
  private parseText(text: string, row: number, col: number): unknown {
    const mask = this.view.sheet!.getActualStyle(row, col).mask as MaskOptions | undefined;
    if (mask?.pattern) return applyMask(text, mask);
    if (!text) return null;
    const format = this.view.sheet!.getFormatter(row, col);
    const formatter = format instanceof GeneralFormatter ? format : new GeneralFormatter(typeof format === 'string' ? format : 'General');
    return formatter.parse(text) ?? text;
  }
  private keydown(event: KeyboardEvent): void {
    if (event.isComposing) return;
    if (this.editing) {
      if (event.key === 'Escape') { event.preventDefault(); this.endEdit(true); return; }
      if (this.hints.key(event)) return;
      if (event.key === 'F2') { event.preventDefault(); this.editing.enter = !this.editing.enter; this.pointReference = undefined; return; }
      const direction = ({ ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] } as Record<string, number[]>)[event.key];
      if (direction && this.editing.enter && this.canPoint()) {
        event.preventDefault(); const previous = this.pointReference;
        const base = previous?.last ?? { row: this.editing.row, col: this.editing.col };
        const sheet = this.view.sheet!; const next = { row: Math.max(0, Math.min(sheet.getRowCount() - 1, base.row + direction[0])), col: Math.max(0, Math.min(sheet.getColumnCount() - 1, base.col + direction[1])) };
        this.pointAt(event.shiftKey && previous ? previous.anchor : next, next); return;
      }
      if (event.key === 'Escape') { event.preventDefault(); this.endEdit(true); }
      else if ((event.key === 'Enter' && !event.altKey) || event.key === 'Tab') {
        event.preventDefault(); if (this.endEdit()) this.navigate(event.key === 'Enter' ? (event.shiftKey ? -1 : 1) : 0, event.key === 'Tab' ? (event.shiftKey ? -1 : 1) : 0);
      } else if (event.key === 'Enter' && event.altKey) {
        event.preventDefault(); const editor = this.view.editor; editor.setRangeText('\n', editor.selectionStart, editor.selectionEnd, 'end');
      }
      return;
    }
    const cm = this.view.workbook.commandManager(), key = event.keyCode || ({ ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40, F2: 113, Delete: 46, Tab: 9, Enter: 13 }[event.key] ?? event.key.toUpperCase().charCodeAt(0));
    const chord = [key, +(event.ctrlKey || event.metaKey), +event.shiftKey, +event.altKey, 0].join(':');
    const command = cm.shortcuts.get([key, +event.ctrlKey, +event.shiftKey, +event.altKey, +event.metaKey].join(':')) ?? cm.shortcuts.get(chord);
    if (command) { event.preventDefault(); cm.execute({ cmd: command }); return; }
    const s = this.view.sheet; if (!s) return;
    const ctrl = event.ctrlKey || event.metaKey;
    if (event.key === 'Escape') { this.clearCopy(); this.closeMenu(); return; }
    if (ctrl && event.key.toLowerCase() === 'a') { event.preventDefault(); s.setSelection(-1, -1, -1, -1); return; }
    if (event.key === 'Backspace') { event.preventDefault(); this.startEdit(false, ''); return; }
    if (event.key.length === 1 && !ctrl && !event.altKey) { event.preventDefault(); this.startEdit(false, event.key); }
  }
  navigate(dr: number, dc: number, extend = false, edge = false): void {
    const s = this.view.sheet; if (!s) return;
    const ranges = s.getSelections(), previous = ranges.at(-1);
    let row = extend && previous && this.drag?.kind !== 'select' ? this.anchor.row === previous.row ? previous.row + previous.rowCount - 1 : previous.row : s.getActiveRowIndex();
    let col = extend && previous ? this.anchor.col === previous.col ? previous.col + previous.colCount - 1 : previous.col : s.getActiveColumnIndex();
    if (edge) {
      const limit = dr ? s.getRowCount() : s.getColumnCount(), direction = Math.sign(dr || dc);
      let index = dr ? row : col;
      const nonempty = (i: number) => s.getValue(dr ? i : row, dr ? col : i) != null;
      const initial = nonempty(index), next = index + direction;
      if (next >= 0 && next < limit) {
        const contiguous = initial && nonempty(next);
        index = next;
        while (index + direction >= 0 && index + direction < limit && (contiguous ? nonempty(index + direction) : !nonempty(index))) index += direction;
      }
      if (dr) row = index; else col = index;
    } else {
      const span = s.getSpan(row, col);
      row = span && dr ? dr > 0 ? span.row + span.rowCount : span.row - 1 : row + dr;
      col = span && dc ? dc > 0 ? span.col + span.colCount : span.col - 1 : col + dc;
    }
    row = Math.max(0, Math.min(s.getRowCount() - 1, row)); col = Math.max(0, Math.min(s.getColumnCount() - 1, col));
    const raxis = s._rowLayout(), caxis = s._columnLayout();
    while (row >= 0 && row < raxis.count && !raxis.getSize(row)) row += dr < 0 ? -1 : 1;
    while (col >= 0 && col < caxis.count && !caxis.getSize(col)) col += dc < 0 ? -1 : 1;
    if (row < 0 || row >= raxis.count || col < 0 || col >= caxis.count) return;
    this.selectTo(row, col, extend); this.view.showCell(row, col);
  }
  private selectTo(row: number, col: number, extend: boolean, multi = false): void {
    const s = this.view.sheet!;
    if (extend && !this.drag && !s.getSelections().some(range => range.contains(this.anchor.row, this.anchor.col))) this.anchor = { row: s.getActiveRowIndex(), col: s.getActiveColumnIndex() };
    if (!extend) {
      this.anchor = { row, col };
      if (multi && s.selectionPolicy() === 2) {
        const ranges = s.getSelections();
        const existing = ranges.findIndex(range => range.contains(row, col));
        if (existing >= 0 && this.view.workbook.options.allowUserDeselect && ranges.length > 1) ranges.splice(existing, 1);
        else ranges.push(new Range(row, col, 1, 1));
        s._setUserSelections(ranges, row, col);
      }
      else s.setActiveCell(row, col);
    } else {
      const range = new Range(Math.min(this.anchor.row, row), Math.min(this.anchor.col, col), Math.abs(row - this.anchor.row) + 1, Math.abs(col - this.anchor.col) + 1);
      s._setUserSelections([range], this.anchor.row, this.anchor.col);
    }
    this.applySelectionUnit();
  }
  private applySelectionUnit(): void {
    const s = this.view.sheet!, unit = s.selectionUnit();
    if (unit === 1 || unit === 2) s._setUserSelections(s.getSelections().map(r => unit === 1 ? new Range(r.row, -1, r.rowCount, -1) : new Range(-1, r.col, -1, r.colCount)), s.getActiveRowIndex(), s.getActiveColumnIndex());
  }
  private resizeHit(event: MouseEvent): { row: boolean; index: number; pixel: number } | undefined {
    if (!this.view.workbook.options.allowUserResize) return;
    const { x, y } = this.point(event), s = this.view.sheet!;
    if (y < this.view.headerHeight && x >= this.view.headerWidth) {
      const col = this.view.cols.find(c => Math.abs(x - c.position - c.size + 1) <= 3);
      if (col && s.getColumnResizable(col.index)) return { row: false, index: col.index, pixel: x };
    }
    if (x < this.view.headerWidth && y >= this.view.headerHeight) {
      const row = this.view.rows.find(r => Math.abs(y - r.position - r.size + 1) <= 3);
      if (row && s.getRowResizable(row.index)) return { row: true, index: row.index, pixel: y };
    }
  }
  private handleHit(event: MouseEvent): 'fill' | 'move' | undefined {
    const s = this.view.sheet!, range = s.getSelections().at(-1); if (!range || range.row < 0 || range.col < 0) return;
    const rect = this.view.rangeRect(range), { x, y } = this.point(event);
    if (this.view.workbook.options.allowUserDragFill && Math.abs(x - rect.x - rect.width) <= 5 && Math.abs(y - rect.y - rect.height) <= 5) return 'fill';
    if (this.view.workbook.options.allowUserDragDrop && x >= rect.x - 3 && x <= rect.x + rect.width + 3 && y >= rect.y - 3 && y <= rect.y + rect.height + 3 && (Math.min(Math.abs(x - rect.x), Math.abs(x - rect.x - rect.width), Math.abs(y - rect.y), Math.abs(y - rect.y - rect.height)) <= 3)) return 'move';
  }
  private canPoint(): boolean {
    const editor = this.view.editor, point = this.pointReference;
    return !!this.editing && (referenceAllowed(editor.value, editor.selectionStart) || !!point && editor.selectionStart === point.end && editor.selectionEnd === point.end);
  }
  private pointAt(anchor: Cell, last: Cell, append = false): void {
    const editor = this.view.editor, previous = this.pointReference;
    let start = previous && !append ? previous.start : editor.selectionStart;
    let end = previous && !append ? previous.end : editor.selectionEnd;
    const address = (cell: Cell) => cell.row < 0 ? columnLabel(cell.col) : cell.col < 0 ? String(cell.row + 1) : `${columnLabel(cell.col)}${cell.row + 1}`;
    const first = address(anchor), second = address(last);
    const addressText = anchor.row < 0 || anchor.col < 0 || first !== second ? `${first}:${second}` : first;
    const target = this.view.sheet!, source = this.editing!.sheet, name = target.name();
    const sheetPrefix = target === source ? '' : `${/^[A-Za-z_][A-Za-z0-9_.]*$/.test(name) ? name : "'" + name.replaceAll("'", "''") + "'"}!`;
    const reference = sheetPrefix + addressText;
    const prefix = append ? ',' : '';
    editor.value = insertReference(editor.value, start, end, prefix + reference);
    start += prefix.length; end = start + reference.length;
    this.pointReference = { start, end, anchor, last };
    editor.setSelectionRange(end, end); this.positionEditor(); this.hints.update(editor.value, end);
    const edit = this.editing!; edit.sheet._emit(Events.EditChange, { sheet: edit.sheet, sheetName: edit.sheet.name(), row: edit.row, col: edit.col, editingText: editor.value });
  }
  private pointerDown(event: PointerEvent): void {
    if (event.button !== 0) return;
    if (this.canPoint()) {
      const hit = this.hit(event);
      if (hit && (hit.row >= 0 || hit.col >= 0)) {
        event.preventDefault(); this.view.overlay.setPointerCapture(event.pointerId);
        this.pointAt(hit, hit, event.ctrlKey || event.metaKey); this.pointDragging = true; return;
      }
    }
    if (!this.endEdit()) return;
    this.closeMenu(); event.preventDefault(); this.view.root.focus(); this.view.overlay.setPointerCapture(event.pointerId);
    const hit = this.hit(event), s = this.view.sheet; if (!hit || !s) return;
    const { x, y } = this.point(event);
    if (this.handleM4Hit(hit, x, y)) { event.stopPropagation(); return; }
    if (event.pointerType === 'touch') this.touch = { x, y, moved: false };
    const resize = this.resizeHit(event);
    if (resize) {
      this.drag = { kind: resize.row ? 'resizeRow' : 'resizeCol', start: { row: resize.row ? resize.index : 0, col: resize.row ? 0 : resize.index }, range: new Range(), initial: (resize.row ? s.getRowHeight(resize.index) : s.getColumnWidth(resize.index)) ?? 0, startPixel: resize.pixel, last: hit }; return;
    }
    const kind = event.pointerType === 'touch' ? undefined : this.handleHit(event);
    if (kind) { this.drag = { kind, start: hit, range: s.getSelections().at(-1)!, initial: 0, startPixel: 0, last: hit }; return; }
    if (hit.row < 0 || hit.col < 0) {
      const range = new Range(hit.row < 0 ? -1 : hit.row, hit.col < 0 ? -1 : hit.col, hit.row < 0 ? -1 : 1, hit.col < 0 ? -1 : 1);
      s._setUserSelections(event.ctrlKey && s.selectionPolicy() === 2 ? [...s.getSelections(), range] : [range], Math.max(0, hit.row), Math.max(0, hit.col));
      this.anchor = { row: Math.max(0, hit.row), col: Math.max(0, hit.col) };
    } else {
      const span = s.getSpan(hit.row, hit.col);
      this.selectTo(span?.row ?? hit.row, span?.col ?? hit.col, event.shiftKey, event.ctrlKey || event.metaKey);
      if (span) s._setUserSelections([span], span.row, span.col);
    }
    this.drag = { kind: 'select', start: hit, last: hit, range: s.getSelections().at(-1)!, initial: 0, startPixel: 0 };
    s._emit(Events.CellClick, { ...this.info(hit, hit.sheetArea), x, y });
  }
  private showMenu(x: number, y: number, items: [string, () => void][]): void {
    this.closeMenu();
    const menu = document.createElement('div');
    menu.className = 'gc-contextmenu gc-ui-contextmenu-container';
    menu.setAttribute('role', 'menu');
    Object.assign(menu.style, { left: `${Math.min(x, this.view.width - 180)}px`, top: `${Math.min(y, this.view.height - 40 - items.length * 26)}px` });
    for (const [label, action] of items) {
      const item = document.createElement('button');
      item.textContent = label;
      item.className = 'gc-contextmenu-menuitem gc-ui-contextmenu-menuitem gc-ui-contextmenu-menuitem-content gc-ui-contextmenu-text';
      item.setAttribute('role', 'menuitem');
      item.addEventListener('click', () => { this.closeMenu(); action(); this.view.schedule(); });
      menu.append(item);
    }
    this.view.root.append(menu);
    this.menu = menu;
  }
  private itemIndexAt(rect: { x: number; width: number }, x: number, count: number): number {
    if (count <= 0) return 0;
    return Math.max(0, Math.min(count - 1, Math.floor(((x - rect.x) / Math.max(1, rect.width)) * count)));
  }
  private handleM4Hit(hit: { row: number; col: number }, x: number, y: number): boolean {
    const view = this.view, s = view.sheet!;
    const outline = view.outlineButtonHit(x, y);
    if (outline) {
      const model = outline.axis === 'row' ? s.rowOutlines : s.columnOutlines;
      model.setCollapsed(outline.index, !model.isCollapsed(outline.index));
      view.schedule();
      return true;
    }
    const filterHit = view.filterButtonHit(x, y);
    if (filterHit) {
      const filter = filterHit.kind === 'table'
        ? (filterHit.table as { rowFilter(): { sortColumn(c: number, asc: boolean): void; unfilter(c?: number): void; range: { col: number } | null } }).rowFilter()
        : s.rowFilter();
      if (filter && filter.range) {
        const relative = filterHit.col - filter.range.col;
        const cell = filterHit.kind === 'table' ? view.cellRect((filterHit.table as { headerIndex(): number }).headerIndex(), filterHit.col) : { x: view.cellRect(0, filterHit.col).x, y: 0, width: 0, height: view.headerHeight };
        this.openFilter(filter as RowFilterBase, relative, cell.x, cell.y + cell.height, filterHit.kind === 'table' ? s.getText((filterHit.table as { headerIndex(): number }).headerIndex(), filterHit.col) : String.fromCharCode(65 + filterHit.col));
      }
      return true;
    }
    if (hit.row < 0 || hit.col < 0) return false;
    const type = s.getCellType(hit.row, hit.col) as {
      typeName?: string;
      items?: () => unknown[];
      isThreeState?: () => boolean;
    } | null;
    const name = type?.typeName;
    if (!name || name === '1') {
      const hyperlink = s.getHyperlink(hit.row, hit.col) as { url?: string; target?: number } | null;
      if (hyperlink?.url) {
        window.open(hyperlink.url, hyperlink.target === 1 ? '_blank' : '_self');
        return true;
      }
      return false;
    }
    const value = s.getValue(hit.row, hit.col);
    if (name === '5') {
      const three = typeof type?.isThreeState === 'function' && type.isThreeState();
      s.setValue(hit.row, hit.col, value === true ? (three ? null : false) : value === false ? true : false);
      s._emit(Events.ValueChanged, { sheet: s, sheetName: s.name(), row: hit.row, col: hit.col, oldValue: value, newValue: s.getValue(hit.row, hit.col) });
      return true;
    }
    if (name === '8') {
      const hyperlink = s.getHyperlink(hit.row, hit.col) as { url?: string; target?: number } | null;
      const url = hyperlink?.url ?? (typeof value === 'string' && /^(https?:|mailto:|www\.)/.test(value) ? value : undefined);
      if (url) window.open(url, hyperlink?.target === 1 ? '_blank' : '_self');
      return true;
    }
    if (name === '7') {
      const items = type.items?.() ?? [];
      if (!items.length) return false;
      const rect = view.cellRect(hit.row, hit.col);
      const menuItems: [string, () => void][] = items.map((item) => {
        const record = item as { text?: string; value?: unknown };
        const text = String(record?.text ?? item);
        return [text, () => { s.setValue(hit.row, hit.col, record?.value ?? record?.text ?? item); s._emit(Events.ValueChanged, { sheet: s, sheetName: s.name(), row: hit.row, col: hit.col, oldValue: value, newValue: s.getValue(hit.row, hit.col) }); }];
      });
      this.showMenu(rect.x, rect.y + rect.height, menuItems);
      return true;
    }
    const items = type.items?.() ?? [];
    if (name === '12') {
      const rect = view.cellRect(hit.row, hit.col);
      const index = this.itemIndexAt(rect, x, items.length);
      const selected = (Array.isArray(value) ? value.map(String) : String(value ?? '').split(',').map((v) => v.trim())).filter(Boolean);
      const key = String(index);
      const text = String((items[index] as { text?: string })?.text ?? items[index] ?? '');
      const next = selected.includes(key) || selected.includes(text) ? selected.filter((v) => v !== key && v !== text) : [...selected, key];
      s.setValue(hit.row, hit.col, next);
      return true;
    }
    if (name === '11' || name === '13') {
      const rect = view.cellRect(hit.row, hit.col);
      const index = this.itemIndexAt(rect, x, items.length);
      const item = items[index] as { text?: string; value?: unknown };
      s.setValue(hit.row, hit.col, item?.value ?? item?.text ?? item ?? '');
      return true;
    }
    return false;
  }
  private pointerMove(event: PointerEvent): void {
    if (this.pointDragging && this.pointReference) { const hit = this.hit(event); if (hit) { const anchor = this.pointReference.anchor; const last = { row: anchor.row < 0 ? -1 : Math.max(0, hit.row), col: anchor.col < 0 ? -1 : Math.max(0, hit.col) }; this.pointAt(anchor, last); } return; }
    const { x, y } = this.point(event), s = this.view.sheet;
    if (!s) return;
    if (this.touch) {
      if (Math.abs(x - this.touch.x) + Math.abs(y - this.touch.y) > 4) {
        this.view.scroll((this.touch.y - y) / this.view.zoom, (this.touch.x - x) / this.view.zoom); this.touch = { x, y, moved: true }; this.drag = undefined;
      }
      return;
    }
    const drag = this.drag;
    if (!drag) { this.view.overlay.style.cursor = this.resizeHit(event) ? this.resizeHit(event)!.row ? 'row-resize' : 'col-resize' : this.handleHit(event) === 'fill' ? 'crosshair' : this.handleHit(event) === 'move' ? 'move' : 'cell'; return; }
    if (drag.kind === 'resizeRow' || drag.kind === 'resizeCol') {
      const row = drag.kind === 'resizeRow', index = row ? drag.start.row : drag.start.col;
      const size = Math.max(0, drag.initial + ((row ? y : x) - drag.startPixel) / this.view.zoom);
      const info = { ...this.info(drag.start), [row ? 'rowList' : 'colList']: [index], header: false, newSize: size, cancel: false };
      s._emit(row ? Events.RowHeightChanging : Events.ColumnWidthChanging, info);
      if (!info.cancel) { if (row) s.setRowHeight(index, size); else s.setColumnWidth(index, size); }
      if (this.view.workbook.options.showResizeTip) this.view.overlay.title = `${row ? 'Height' : 'Width'}: ${Math.round(size)} pixels`;
      return;
    }
    if (y > this.view.viewHeight - 10) this.view.scroll(20, 0); else if (y < this.view.headerHeight) this.view.scroll(-20, 0);
    if (x > this.view.viewWidth - 10) this.view.scroll(0, 20); else if (x < this.view.headerWidth) this.view.scroll(0, -20);
    const hit = this.view.hitTest(Math.max(0, Math.min(this.view.viewWidth - 1, x)), Math.max(0, Math.min(this.view.viewHeight - 1, y)));
    if (!hit) return;
    drag.last = { row: Math.max(0, hit.row), col: Math.max(0, hit.col) };
    if (drag.kind === 'select') {
      if (s.selectionPolicy() === 0) return;
      let range = new Range(Math.min(Math.max(0, drag.start.row), drag.last.row), Math.min(Math.max(0, drag.start.col), drag.last.col), Math.abs(drag.last.row - Math.max(0, drag.start.row)) + 1, Math.abs(drag.last.col - Math.max(0, drag.start.col)) + 1);
      if (drag.start.row < 0) range = new Range(-1, range.col, -1, range.colCount);
      if (drag.start.col < 0) range = new Range(range.row, -1, range.rowCount, -1);
      const before = s.getSelections(); if (before.length > 1) before.pop(); else before.length = 0;
      s._setUserSelections([...before, range], this.anchor.row, this.anchor.col); this.applySelectionUnit();
    }
  }
  private pointerUp(event: PointerEvent): void {
    if (this.pointDragging) { this.pointDragging = false; (this.formulaBar ?? this.view.editor).focus(); return; }
    const drag = this.drag; this.drag = undefined; this.touch = undefined;
    if (!drag) return;
    if (drag.kind === 'resizeRow' || drag.kind === 'resizeCol') {
      const s = this.view.sheet!, row = drag.kind === 'resizeRow', index = row ? drag.start.row : drag.start.col;
      const next = (row ? s.getRowHeight(index) : s.getColumnWidth(index)) ?? 0;
      this.recordResize(row, index, drag.initial, next);
    } else if (drag.kind === 'fill') this.fill(drag.range, drag.last, event.ctrlKey);
    else if (drag.kind === 'move') this.move(drag.range, drag.last.row - drag.start.row, drag.last.col - drag.start.col);
    this.view.overlay.title = '';
  }
  private recordResize(row: boolean, index: number, previous: number, next: number): void {
    if (previous === next) return;
    const s = this.view.sheet!, event = row ? Events.RowHeightChanged : Events.ColumnWidthChanged;
    const info = { sheet: s, sheetName: s.name(), [row ? 'rowList' : 'colList']: [index], header: false };
    s._emit(event, info);
    let first = true;
    this.view.workbook.commandManager().register('_userResize', { canUndo: true, execute: (_ctx, _options, undo) => {
      if (first) { first = false; return true; }
      if (row) s.setRowHeight(index, undo ? previous : next); else s.setColumnWidth(index, undo ? previous : next);
      s._emit(event, info); return true;
    } });
    this.view.workbook.commandManager().execute({ cmd: '_userResize' });
  }
  private doubleClick(event: MouseEvent): void {
    const resize = this.resizeHit(event), s = this.view.sheet!;
    if (resize) {
      const info = { sheet: s, sheetName: s.name(), [resize.row ? 'rowList' : 'colList']: [resize.index], header: false, cancel: false };
      s._emit(resize.row ? Events.RowHeightChanging : Events.ColumnWidthChanging, info); if (info.cancel) return;
      const before = (resize.row ? s.getRowHeight(resize.index) : s.getColumnWidth(resize.index)) ?? 0;
      if (resize.row) s.autoFitRow(resize.index); else s.autoFitColumn(resize.index);
      this.recordResize(resize.row, resize.index, before, (resize.row ? s.getRowHeight(resize.index) : s.getColumnWidth(resize.index)) ?? 0); return;
    }
    const hit = this.hit(event); if (!hit) return;
    s._emit(Events.CellDoubleClick, this.info(hit, hit.sheetArea));
    if (hit.row >= 0 && hit.col >= 0) { s.setActiveCell(hit.row, hit.col); this.startEdit(); }
  }
  private sheetList(hidden = false): void {
    this.closeMenu();
    const wb = this.view.workbook;
    const items: MenuItemData[] = wb.sheets.flatMap((sheet, index) => (hidden ? !!sheet.visible() : !sheet.visible()) ? [] : [{ name: String(index), text: sheet.name(), itemClass: index === wb.getActiveSheetIndex() ? 'opensheets-active-sheet' : undefined }]);
    const menu = renderMenu(wb.contextMenu, items, item => { const index = Number(item.name); if (hidden) wb.getSheet(index).visible(true); wb.setActiveSheetIndex(index); wb.startSheetIndex(index); this.closeMenu(); });
    menu.classList.add('opensheets-sheet-list');
    const wrapper = document.createElement('div'); wrapper.className = 'opensheets-sheet-search';
    Object.assign(wrapper.style, { position: 'absolute', zIndex: '10', left: '80px', bottom: '17px' });
    const label = document.createElement('label'); label.textContent = hidden ? 'Unhide Sheet:' : 'Active Sheet:';
    const search = document.createElement('input'); search.setAttribute('aria-label', label.textContent);
    search.addEventListener('input', () => { for (const item of menu.children) { const element = item as HTMLElement; element.hidden = !element.textContent?.toLowerCase().includes(search.value.toLowerCase()); } });
    menu.style.maxHeight = `${this.view.viewHeight - 80}px`; menu.style.overflow = 'auto';
    wrapper.append(label, search, menu); this.view.root.append(wrapper); this.menu = wrapper;
  }
  private renameTab(event: MouseEvent): void {
    const hit = this.tabHit(event.clientX), wb = this.view.workbook;
    if (!hit || hit.index < 0) return;
    const s = wb.getSheet(hit.index);
    wb._emit(Events.SheetTabDoubleClick, { sheet: s, sheetName: s.name(), sheetTabIndex: hit.index });
    if (!wb.options.tabEditable) return;
    const input = document.createElement('input'); input.className = 'gc-tab-editor'; input.value = s.name();
    Object.assign(input.style, { left: `${hit.x}px`, top: `${this.view.viewHeight}px`, width: `${hit.width}px`, height: '26px' });
    this.view.root.append(input); input.focus(); input.select();
    const finish = (cancel: boolean) => { if (!cancel && input.value !== s.name()) { try { s.name(input.value); } catch { input.focus(); return; } } input.remove(); this.view.schedule(); };
    input.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter' || e.key === 'Escape') finish(e.key === 'Escape'); });
    input.addEventListener('blur', () => finish(false));
  }
  private copy(event: ClipboardEvent, cut: boolean): void {
    if (this.editing) return;
    const s = this.view.sheet!, selected = s.getSelections().at(-1); if (!selected) return;
    const used = s._usedRange();
    const range = selected.normalized(selected.row < 0 ? used.row + 1 : s.getRowCount(), selected.col < 0 ? used.col + 1 : s.getColumnCount());
    const info = { ...this.info(range), cellRange: range, copyData: '', cancel: false, isCutting: cut };
    s._emit(Events.ClipboardChanging, info); if (info.cancel) { event.preventDefault(); return; }
    const values = s.getArray(range.row, range.col, range.rowCount, range.colCount), text = encodeTSV(values);
    const escape = (value: unknown) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
    event.clipboardData?.setData('text/plain', text);
    event.clipboardData?.setData('text/html', '<table>' + values.map(row => '<tr>' + row.map(value => `<td>${escape(value)}</td>`).join('') + '</tr>').join('') + '</table>');
    event.preventDefault(); this.clipboard = { sheet: s, range, values }; this.cut = cut; this.view.copiedRange = range;
    if (this.ants) clearInterval(this.ants);
    this.ants = setInterval(() => this.view.drawSelection(), 120);
    s._emit(Events.ClipboardChanged, { ...info, copyData: text }); this.view.drawSelection();
  }
  private paste(event: ClipboardEvent): void {
    if (this.editing) return;
    event.preventDefault();
    const html = event.clipboardData?.getData('text/html'), text = event.clipboardData?.getData('text/plain') ?? '';
    let values = decodeTSV(text);
    if (html) {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const rows = [...doc.querySelectorAll('tr')].map(row => [...row.querySelectorAll('td,th')].map(cell => cell.textContent ?? ''));
      if (rows.length) values = rows;
    }
    this.pasteValues(values);
  }
  pasteValues(values: string[][]): void {
    const s = this.view.sheet!, row = s.getActiveRowIndex(), col = s.getActiveColumnIndex();
    if (s.options.isProtected) return;
    const range = new Range(row, col, values.length, Math.max(...values.map(row => row.length)));
    const info = { ...this.info(range), cellRange: range, pasteData: { text: encodeTSV(values) }, cancel: false };
    s._emit(Events.ClipboardPasting, info); if (info.cancel) return;
    if (this.clipboard?.sheet === s && encodeTSV(values) === encodeTSV(this.clipboard.values)) {
      const source = this.clipboard.range;
      this.undoableMutation('clipboardPaste', [source, range], () => { if (this.cut) s.moveTo(source.row, source.col, row, col, source.rowCount, source.colCount); else s.copyTo(source.row, source.col, row, col, source.rowCount, source.colCount); });
      if (this.cut) this.clearCopy();
    } else this.batchValues(range, (r, c) => this.parseText(values[r - row]?.[c - col] ?? '', r, c));
    s.setSelection(range.row, range.col, range.rowCount, range.colCount);
    s._emit(Events.ClipboardPasted, info);
  }
  private batchValues(range: Range, value: (r: number, c: number) => unknown): void {
    const s = this.view.sheet!, wb = this.view.workbook;
    const before = s.getArray(range.row, range.col, range.rowCount, range.colCount), after = before.map((row, r) => row.map((_, c) => value(range.row + r, range.col + c)));
    const formulas = s.getArray(range.row, range.col, range.rowCount, range.colCount, true);
    const commandName = 'clipboardAndFill';
    wb.commandManager().register(commandName, { canUndo: true, execute: (_ctx, _options, undo) => {
      wb.suspendPaint();
      try { for (let r = 0; r < range.rowCount; r++) for (let c = 0; c < range.colCount; c++) {
        const row = range.row + r, col = range.col + c, oldValue = s.getValue(row, col), next = (undo ? before : after)[r][c];
        if (undo && formulas[r][c]) { s.setFormula(row, col, String(formulas[r][c])); s._setCalculatedValue(row, col, next); }
        else if (typeof next === 'string' && next.startsWith('=')) s.setFormula(row, col, next); else s.setValue(row, col, next);
        if (!Object.is(oldValue, next)) s._emit(Events.ValueChanged, { ...this.info({ row, col }), oldValue, newValue: next });
      } } finally { wb.resumePaint(); }
      return true;
    } });
    wb.commandManager().execute({ cmd: commandName });
  }
  private undoableMutation(name: string, ranges: Range[], mutate: () => void): void {
    const s = this.view.sheet!, wb = this.view.workbook;
    const before = s._snapshotRanges(ranges);
    wb.suspendPaint(); s.suspendCalcService();
    try { mutate(); } finally { s.resumeCalcService(); wb.resumePaint(); }
    const after = s._snapshotRanges(ranges);
    let first = true;
    wb.commandManager().register(name, { canUndo: true, execute: (_ctx, _opts, undo) => {
      if (first) { first = false; return true; }
      wb.suspendPaint(); s.suspendCalcService();
      try { (undo ? before : after)(); } finally { s.resumeCalcService(); wb.resumePaint(); }
      return true;
    } });
    wb.commandManager().execute({ cmd: name });
  }
  private clearValues(): void {
    const s = this.view.sheet!;
    if (s.options.isProtected) return;
    const ranges = s.getSelections();
    this.undoableMutation('clearRange', ranges, () => {
      for (const [row, col, oldValue, formula] of s._storedCells()) if ((oldValue != null || formula) && ranges.some(range => range.contains(row, col))) {
        s.setValue(row, col, null); s._emit(Events.ValueChanged, { ...this.info({ row, col }), oldValue: oldValue ?? null, newValue: null });
      }
    });
  }
  private clearCopy(): void { this.view.copiedRange = undefined; this.clipboard = undefined; if (this.ants) clearInterval(this.ants); this.ants = undefined; this.view.drawSelection(); }
  private fill(source: Range, end: Cell, copy = false): void {
    const s = this.view.sheet!;
    const target = source.union(new Range(end.row, end.col));
    if (source.equals(target)) return;
    const info = { sheet: s, sheetName: s.name(), fillRange: target, fillDirection: target.rowCount > source.rowCount ? 0 : 1, autoFillType: this.view.workbook.options.defaultDragFillType, cancel: false };
    s._emit(Events.DragFillBlock, info); if (info.cancel) return;
    const vertical = target.rowCount > source.rowCount;
    const fillType = copy ? 0 : Number(this.view.workbook.options.defaultDragFillType);
    const data = s.getArray(source.row, source.col, source.rowCount, source.colCount);
    const repeat = (n: number, count: number) => ((n % count) + count) % count;
    this.undoableMutation('fill', [target], () => {
      for (let r = target.row; r < target.row + target.rowCount; r++) for (let c = target.col; c < target.col + target.colCount; c++) {
        if (source.contains(r, c)) continue;
        const sr = source.row + repeat(r - source.row, source.rowCount), sc = source.col + repeat(c - source.col, source.colCount);
        const formula = s.getFormula(sr, sc), oldValue = s.getValue(r, c);
        if (fillType !== 2) {
          if (fillType === 4) s.setValue(r, c, null);
          else if (formula) s.setFormula(r, c, adjustFormula(formula, r - sr, c - sc));
          else s.setValue(r, c, fillType === 0 ? data[sr - source.row][sc - source.col] : vertical ? seriesValue(data.map(row => row[sc - source.col]), r - source.row) : seriesValue(data[sr - source.row], c - source.col));
        }
        if (fillType !== 3 && fillType !== 4) s.setStyle(r, c, s.getStyle(sr, sc));
        const next = s.getValue(r, c); if (!Object.is(oldValue, next)) s._emit(Events.ValueChanged, { ...this.info({ row: r, col: c }), oldValue, newValue: next });
      }
    });
    s.setSelection(target.row, target.col, target.rowCount, target.colCount); s._emit(Events.DragFillBlockCompleted, info);
  }
  private move(source: Range, dr: number, dc: number): void {
    const s = this.view.sheet!; if (!dr && !dc) return;
    const row = Math.max(0, Math.min(s.getRowCount() - source.rowCount, source.row + dr)), col = Math.max(0, Math.min(s.getColumnCount() - source.colCount, source.col + dc));
    const info = { sheet: s, sheetName: s.name(), fromRow: source.row, fromCol: source.col, toRow: row, toCol: col, rowCount: source.rowCount, colCount: source.colCount, cancel: false };
    s._emit(Events.DragDropBlock, info); if (info.cancel) return;
    this.undoableMutation('dragDrop', [source, new Range(row, col, source.rowCount, source.colCount)], () => s.moveTo(source.row, source.col, row, col, source.rowCount, source.colCount)); s.setSelection(row, col, source.rowCount, source.colCount); s._emit(Events.DragDropBlockCompleted, info);
  }
  openFilter(filter: RowFilterBase, column: number, x: number, y: number, title: string): void {
    this.closeMenu();
    const root = filterMenu(this.view.sheet!, filter, column, title, () => this.closeMenu(), dialog => {
      this.closeMenu(); this.view.root.append(dialog); this.menu = dialog;
    });
    // The trial aligns to the cell's left and clamps to the host edge.
    Object.assign(root.style, { left: `${Math.max(5, Math.min(x + this.view.cellRect(0, filter.range!.col + column).width - 239, this.view.width - 244))}px`, top: `${Math.max(0, Math.min(y, this.view.height - 416))}px` });
    this.view.root.append(root); this.menu = root; root.focus();
  }
  private contextMenu(event: MouseEvent): void {
    const wb = this.view.workbook;
    if (!wb.options.allowContextMenu || this.editing) return;
    event.preventDefault(); this.closeMenu();
    const { x, y } = this.point(event), tab = y >= this.view.viewHeight ? this.tabHit(event.clientX) : undefined;
    if (tab && tab.index >= 0) wb.setActiveSheetIndex(tab.index);
    const s = this.view.sheet!, hit = this.hit(event);
    if (!tab && hit && !s.getSelections().some(range => range.contains(hit.row, hit.col))) {
      if (hit.row < 0 || hit.col < 0) s._setUserSelections([new Range(hit.row, hit.col, hit.row < 0 ? -1 : 1, hit.col < 0 ? -1 : 1)], Math.max(0, hit.row), Math.max(0, hit.col));
      else s.setActiveCell(hit.row, hit.col);
    }
    const area = tab ? 'sheetTab' : !hit || hit.row < 0 && hit.col < 0 ? 'corner' : hit.row < 0 ? 'colHeader' : hit.col < 0 ? 'rowHeader' : 'viewport';
    const table = hit && hit.row >= 0 && hit.col >= 0 ? s.tables.find(hit.row, hit.col) : null;
    const comment = s.comments.get(s.getActiveRowIndex(), s.getActiveColumnIndex());
    const excluded = new Set(['gc.spread.pasteSpecial', 'gc.spread.paste', 'gc.spread.ganttSheetPaste', 'gc.spread.insertCopiedCells', 'gc.spread.insertCutCells', 'gc.spread.rowHeaderinsertCopiedCells', 'gc.spread.rowHeaderinsertCutCells', 'gc.spread.colHeaderinsertCopiedCells', 'gc.spread.colHeaderinsertCutCells', 'gc.spread.pinRows', 'gc.spread.pinColumns', 'gc.spread.colHeadermodifyColumn', 'gc.spread.colHeaderremoveColumn', 'gc.spread.colHeadersetPrimaryKey', 'gc.spread.rowHeaderpromote', 'gc.spread.rowHeaderdemote', 'gc.spread.rowHeadermoveUp', 'gc.spread.rowHeadermoveDown', 'gc.spread.rowHeaderaddAfter', 'gc.spread.rowHeaderaddBefore', 'gc.spread.rowHeaderaddAbove', 'gc.spread.rowHeaderaddBelow', 'gc.spread.replyToThreadedComment', 'gc.spread.deleteThreadedComment']);
    const menu = wb.contextMenu;
    const items = compactMenu(menu.menuData.filter(item => {
      if (item.visible === false || excluded.has(item.name ?? '') || item.name?.startsWith('reportSheet')) return false;
      if (/colHeader(?:expand|collapse)/.test(item.name ?? '') && s.columnOutlines.getMaxLevel() < 0) return false;
      if (item.type === 'separator') return true;
      if (['gc.spread.editComment', 'gc.spread.deleteComment', 'gc.spread.toggleComment'].includes(item.name ?? '') && !comment) return false;
      if (['gc.spread.insertComment', 'gc.spread.insertThreadedComment'].includes(item.name ?? '') && (comment || area === 'corner')) return false;
      return !item.workArea || item.workArea.includes(area) || !!table && item.workArea.includes('table');
    }).map(item => item.name === 'gc.spread.unhideSheet' ? { ...item, disable: !wb.sheets.some(sheet => !sheet.visible()) } : { ...item }));
    const hitInfo = tab ? { tabStripHitInfo: { sheetTab: { sheetName: s.name(), sheetIndex: wb.getActiveSheetIndex() } }, x, y } : { worksheetHitInfo: { x, y, row: Math.max(0, hit?.row ?? 0), col: Math.max(0, hit?.col ?? 0), rowViewportIndex: hit && hit.row < 0 ? -1 : 1, colViewportIndex: hit && hit.col < 0 ? -1 : 1, hitTestType: area === 'corner' ? 0 : area === 'colHeader' ? 1 : area === 'rowHeader' ? 2 : 3 }, x, y };
    if (menu.onOpenMenu(menu.menuData, items, hitInfo, wb)) return;
    const root = renderMenu(menu, items, (item, host, e) => {
      const options = menu.menuView.getCommandOptions(item, host, e);
      this.closeMenu(); this.menuCommand(item, options, event);
    });
    if (tab) root.classList.add('opensheets-tab-menu');
    this.view.root.append(root); this.menu = root;
    root.style.left = `${Math.max(0, Math.min(x, this.view.width - root.offsetWidth))}px`;
    root.style.top = `${Math.max(0, Math.min(y, (tab ? this.view.viewHeight + 12 : this.view.height) - root.offsetHeight))}px`;
    root.focus();
  }
  private menuCommand(item: MenuItemData, options: unknown, event: MouseEvent): void {
    const wb = this.view.workbook, s = this.view.sheet!, range = s.getSelections().at(-1)!;
    const action = item.name?.replace('gc.spread.', '') ?? '';
    if (typeof item.command === 'function') { item.command(wb, options); return; }
    if (item.command && Object.hasOwn(wb.commandManager(), item.command)) { wb.commandManager().execute({ cmd: item.command, sheetName: s.name(), commandOptions: options }); return; }
    switch (action) {
      case 'copy': document.execCommand('copy'); return;
      case 'cut': document.execCommand('cut'); return;
      case 'pasteFormula': case 'pasteFormatting': case 'pasteValuesFormatting': case 'pasteFormulaFormatting': console.warn(`NotImplemented: ContextMenu.${action}`); return;
      case 'pasteAll': case 'pasteValues':
        if (this.clipboard) this.pasteValues(this.clipboard.values.map(row => row.map(v => v == null ? '' : String(v))));
        else void navigator.clipboard?.readText().then(text => this.pasteValues(decodeTSV(text))); return;
      case 'clearContents': this.clearValues(); return;
      case 'insertRows': s.addRows(Math.max(0, range.row), Math.max(1, range.rowCount)); return;
      case 'insertColumns': s.addColumns(Math.max(0, range.col), Math.max(1, range.colCount)); return;
      case 'deleteRows': s.deleteRows(Math.max(0, range.row), Math.max(1, range.rowCount)); return;
      case 'deleteColumns': s.deleteColumns(Math.max(0, range.col), Math.max(1, range.colCount)); return;
      case 'hideRows': case 'unhideRows': for (let r = Math.max(0, range.row - (action === 'unhideRows' ? 1 : 0)); r < range.row + range.rowCount + (action === 'unhideRows' ? 1 : 0); r++) s.setRowVisible(r, action === 'unhideRows'); return;
      case 'hideColumns': case 'unhideColumns': for (let c = Math.max(0, range.col - (action === 'unhideColumns' ? 1 : 0)); c < range.col + range.colCount + (action === 'unhideColumns' ? 1 : 0); c++) s.setColumnVisible(c, action === 'unhideColumns'); return;
      case 'insertSheet': wb.addSheet(wb.getActiveSheetIndex()); return;
      case 'deleteSheet': if (wb.getSheetCount() > 1) wb.removeSheet(wb.getActiveSheetIndex()); return;
      case 'startEditSheetName': this.renameTab(event); return;
      case 'hideSheet': if (wb.sheets.filter(sheet => sheet.visible()).length > 1) { s.visible(false); wb.setActiveSheetIndex(wb.sheets.findIndex(sheet => !!sheet.visible())); } return;
      case 'unhideSheet': this.sheetList(true); return;
      case 'filter': { const used = s._usedRange(); const filter = new HideRowFilter(new Range(0, 0, used.row + 1, used.col + 1)); s.rowFilter(filter); return; }
      case 'sortAscend': case 'sortDescend': { const used = s._usedRange(); s.sortRange(0, 0, used.row + 1, used.col + 1, true, [{ index: s.getActiveColumnIndex(), ascending: action === 'sortAscend' }]); return; }
      case 'insertComment': { const comment = s.comments.add(s.getActiveRowIndex(), s.getActiveColumnIndex(), ''); comment.displayMode(1); return; }
      case 'deleteComment': s.comments.remove(s.getActiveRowIndex(), s.getActiveColumnIndex()); return;
      case 'toggleComment': { const comment = s.comments.get(s.getActiveRowIndex(), s.getActiveColumnIndex()); if (comment) comment.displayMode(comment.displayMode() === 1 ? 0 : 1); return; }
      default: notImplemented(`ContextMenu.${item.command ?? action}`);
    }
  }
  private closeMenu(): void { this.menu?.remove(); this.menu = undefined; }
  /** True while the in-cell editor is open on a cell. */
  editingAt(row: number, col: number): boolean {
    return !!this.editing && this.editing.row === row && this.editing.col === col;
  }
  destroy(): void { this.hints.close(); this.formulaLayer?.remove(); for (const layer of this.referenceLayers) layer.remove(); this.abort.abort(); if (this.ants) clearInterval(this.ants); this.closeMenu(); }
}
