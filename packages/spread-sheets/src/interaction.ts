import { applyMask, applyMaskInfo, type MaskOptions } from './features/input-mask.js';
import { applyInsets, hitButton, parseInsets, type ButtonRect } from './features/cell-extras.js';
import { filterMenu } from './features/filter-menu.js';
import { compactMenu, renderMenu, type MenuItemData } from './features/context-menu.js';
import { ltext } from './localization.js';
import { CommentUi } from './comment-ui.js';
import { HideRowFilter, type RowFilterBase } from './features/filters.js';
import type { WorkbookRenderer } from './rendering.js';
import type { Worksheet } from './worksheet.js';
import { Range, Style } from './primitives.js';
import { adjustFormula } from './range.js';
import { Events } from './events.js';
import { notImplemented } from './not-implemented.js';
import { GeneralFormatter } from './formatter.js';
import { FormulaHints } from './features/formula-hints.js';
import { referenceAllowed, insertReference, closeFormulaParentheses } from './features/formula-point.js';
import { colorFormula, parseReference } from './features/formula-color.js';
import { FormulaParseError } from './calc/errors.js';
import { columnLabel } from './rendering.js';
import { TableSheet } from './tablesheet/index.js';
import { commandConstants } from './command-constants.js';
import { GC } from './generated/enums.js';

/** Items one wheel event moves, the trial's fixed step (see the wheel handler: TASK 90 C). */
const WHEEL_ITEMS = 3;

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
interface Drag { kind: 'select' | 'resizeRow' | 'resizeCol' | 'fill' | 'move' | 'resizeTable'; start: Cell; range: Range; initial: number; startPixel: number; last: Cell; table?: string; original?: Range }

/** One Gantt chart taskbar hit: the task and the interaction zone under the pointer. */
type GanttHit = { task: unknown; zone: 'move' | 'link' | 'resize' | 'progress' };
/** The GanttSheet members the chart interaction uses (structural to avoid an import cycle). */
type GanttChartApi = {
  _ganttChartHit(x: number, y: number): { task: unknown; row: number; zone: GanttHit['zone'] } | undefined;
  _ganttCursorFor(zone: GanttHit['zone']): string;
  _ganttTipLines(hit: GanttHit, pointerX: number, pointerY: number, dragging?: boolean): string[];
  _applyGanttDrag(hit: GanttHit, fromX: number, toX: number, toY: number): void;
  _chartPreview?: { task: unknown; x: number; y: number } | undefined;
};

export class Interaction {
  private abort = new AbortController();
  private hints: FormulaHints;
  private formulaLayer?: HTMLElement;
  private editorContainer?: HTMLElement;
  private referenceLayers: HTMLElement[] = [];
  private drag?: Drag;
  private anchor: Cell = { row: 0, col: 0 };
  private editing?: { sheet: Worksheet; row: number; col: number; oldValue: unknown; enter: boolean };
  private buttonPress?: { row: number; col: number; index: number };
  private pointReference?: { start: number; end: number; anchor: Cell; last: Cell };
  private pointDragging = false;
  private formulaBar?: HTMLElement;
  private cut = false;
  private clipboard?: { sheet: Worksheet; range: Range; values: unknown[][]; formulas: unknown[][]; styles: (Style | null)[][] };
  private menu?: HTMLElement;
  private ants?: ReturnType<typeof setInterval>;
  private tabDrag?: number;
  private tabPointerX = 0;
  private tabPointerY = 0;
  private touch?: { x: number; y: number; moved: boolean };
  private touchPress?: { x: number; y: number; timer: ReturnType<typeof setTimeout> };
  private ganttDrag?: { hit: GanttHit; fromX: number; fromY: number };
  private ganttTipEl?: HTMLElement;
  readonly commentUi: CommentUi;
  constructor(readonly view: WorkbookRenderer) {
    const { root, overlay, editor, tabs } = view, signal = this.abort.signal;
    this.commentUi = new CommentUi(view);
    this.hints = new FormulaHints(view.workbook, editor, (start, end, value) => { editor.setRangeText(value, start, end, 'end'); editor.dispatchEvent(new Event('input', { bubbles: true })); editor.focus(); });
    root.addEventListener('keydown', event => this.keydown(event), { signal });
    overlay.addEventListener('pointerdown', event => this.pointerDown(event), { signal });
    overlay.addEventListener('pointermove', event => this.pointerMove(event), { signal });
    overlay.addEventListener('pointerleave', () => {
      if (view.hoverCell) { view.hoverCell = undefined; view.schedule(); }
      this.hideGanttTip();
      view.overlay.style.cursor = '';
    }, { signal });
    overlay.addEventListener('pointerup', event => this.pointerUp(event), { signal });
    overlay.addEventListener('pointercancel', () => { this.drag = undefined; this.touch = undefined; this.cancelTouchPress(); }, { signal });
    overlay.addEventListener('dblclick', event => this.doubleClick(event), { signal });
    root.addEventListener('wheel', event => {
      event.preventDefault();
      if (event.ctrlKey && view.workbook.options.allowUserZoom) {
        /* TASK 90 round 4 (`.probe/t90/zoomwheel.mjs`): the trial steps zoom by a FIXED 0.15 per
         * Ctrl+wheel event - independent of the notch size (deltaY 30, 60, 120 and 300 all give
         * 1 -> 1.15 -> 1.3 -> 1.45 ...), clamped to its 0.1..4 range. */
        const s = view.sheet!, oldZoomFactor = s.zoom(), newZoomFactor = Math.max(0.1, Math.min(4, Math.round((oldZoomFactor + (event.deltaY > 0 ? -0.15 : 0.15)) * 100) / 100));
        const info = { sheet: s, oldZoomFactor, newZoomFactor, cancel: false };
        s._emit(Events.ViewZooming, info);
        if (!info.cancel) { s.zoom(newZoomFactor); s._emit(Events.ViewZoomed, info); }
      } else {
        /* TASK 90 C: the trial steps whole items per wheel event (3 rows, 3 columns), whatever the
         * delta magnitude or mode (measured `.probe/t90/wheel3-r1.json`, both with the default 20px
         * rows and with explicit 40px rows / 120px columns, at zoom 1, 1.5 and 4). The pixel
         * formula below it replaces ignored the small deltas a touchpad sends: deltaY 1, 4 and 20
         * scrolled nothing at all, which is the reported "the mouse wheel / touchpad does not
         * scroll". Shift+wheel and deltaX move sideways, like the trial. */
        const step = event.shiftKey ? Math.sign(event.deltaY) : 0;
        const rows = event.shiftKey ? 0 : Math.sign(event.deltaY);
        const columns = step || Math.sign(event.deltaX);
        if (rows) view.scrollItems(true, rows * WHEEL_ITEMS);
        if (columns) view.scrollItems(false, columns * WHEEL_ITEMS);
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
      if (mask?.pattern) {
        // Re-mask from the typed characters only: padding placeholders would otherwise fill slots
        // ahead of the next keystroke (and a removed literal simply comes back).
        const placeholderChar = mask.placeholder || '_';
        const stripped = editor.value.split('').filter((ch) => ch !== placeholderChar).join('');
        const info = applyMaskInfo(stripped, mask, true);
        editor.value = info.value;
        let caret = info.caret;
        while (caret < info.value.length && info.value[caret] !== placeholderChar && !/[0-9a-zA-Z]/.test(info.value[caret])) caret++;
        editor.setSelectionRange(caret, caret);
      }
      this.positionEditor();
      this.hints.update(editor.value, editor.selectionStart);
      const edit = this.editing; if (edit) edit.sheet._emit(Events.EditChange, { sheet: edit.sheet, sheetName: edit.sheet.name(), row: edit.row, col: edit.col, editingText: editor.value });
    }, { signal });
    const updateHintCaret = () => { if (this.editing) this.hints.update(editor.value, editor.selectionStart); };
    editor.addEventListener('click', updateHintCaret, { signal });
    editor.addEventListener('keyup', event => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) updateHintCaret(); }, { signal });
    tabs.addEventListener('pointerdown', event => {
      const hit = this.tabHit(event.clientX, event.clientY); if (!hit) return;
      const pointing = hit.index >= 0 && this.canPoint();
      if (!pointing && !this.endEdit()) return;
      if (pointing) event.preventDefault();
      const wb = view.workbook;
      if (hit.index === -4) { event.stopPropagation(); this.sheetList(); }
      else if (hit.index === -1) { wb.addSheet(wb.getSheetCount()); wb.setActiveSheetIndex(wb.getSheetCount() - 1); }
      else if (hit.index === -2) { if (view.tabStripOverflow) { wb.startSheetIndex(Math.max(0, wb.startSheetIndex() - 1)); wb.repaint(); } }
      else if (hit.index === -3) { if (view.tabStripOverflow) { wb.startSheetIndex(Math.min(wb.getSheetCount() - 1, wb.startSheetIndex() + 1)); wb.repaint(); } }
      else {
        wb._emit(Events.SheetTabClick, { sheet: wb.getSheet(hit.index), sheetName: wb.getSheet(hit.index).name(), sheetTabIndex: hit.index });
        wb.setActiveSheetIndex(hit.index);
        if (event.button === 0) {
          this.tabDrag = hit.index; this.tabPointerX = event.clientX; this.tabPointerY = event.clientY;
          try { tabs.setPointerCapture(event.pointerId); } catch (error) {
            if (!(error instanceof DOMException && error.name === 'NotFoundError')) throw error;
          }
        }
      }
      if (pointing) { this.pointReference = undefined; this.positionEditor(); (this.formulaBar ?? editor).focus(); }
      else if (this.menu) this.menu.focus(); else root.focus();
    }, { signal });
    tabs.addEventListener('pointerup', event => {
      const moved = view.tabVertical ? event.clientY - this.tabPointerY : event.clientX - this.tabPointerX;
      if (this.tabDrag !== undefined && Math.abs(moved) > 5 && view.workbook.options.allowSheetReorder) this.dropTab(event);
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
  private rootPoint(event: MouseEvent): { x: number; y: number } { const rect = this.view.root.getBoundingClientRect(); return { x: event.clientX - rect.left, y: event.clientY - rect.top }; }
  private hit(event: MouseEvent) { const { x, y } = this.point(event); return this.view.hitTest(x, y); }
  private tabHit(clientX: number, clientY: number) {
    const rect = this.view.tabs.getBoundingClientRect();
    if (clientX < rect.left || clientX >= rect.right || clientY < rect.top || clientY >= rect.bottom) return undefined;
    const vertical = this.view.tabVertical;
    const along = vertical ? clientY - rect.top : clientX - rect.left;
    const across = vertical ? clientX - rect.left : clientY - rect.top;
    for (let i = this.view.tabHits.length - 1; i >= 0; i--) {
      const hit = this.view.tabHits[i];
      if (along < hit.x || along >= hit.x + hit.width) continue;
      if (hit.cross && (across < hit.cross[0] || across >= hit.cross[1])) continue;
      return hit;
    }
    return undefined;
  }
  /** The trial drops onto the tab whose slot contains the cursor: the dragged sheet takes that tab's index (inserting before it). */
  private dropTab(event: PointerEvent): void {
    const view = this.view, wb = view.workbook, from = this.tabDrag!;
    const rect = view.tabs.getBoundingClientRect();
    const along = (view.tabVertical ? event.clientY : event.clientX) - (view.tabVertical ? rect.top : rect.left);
    const slots = view.tabSlotRects;
    const slot = slots.find(s => along >= s.x && along < s.x + s.width);
    let target: number;
    if (slot) target = slot.index > from ? slot.index - 1 : slot.index;
    else {
      const first = slots[0], last = slots[slots.length - 1];
      // Past either end of the strip the trial clamps the drop to the first or last slot.
      if (first && along < first.x) target = 0;
      else if (last && along >= last.x + last.width) target = wb.getSheetCount() - 1;
      else return;
    }
    if (target === from) return;
    const sheet = wb.getSheet(from), info = { sheet, sheetName: sheet.name(), fromIndex: from, toIndex: target, cancel: false };
    wb._emit(Events.SheetMoving, info);
    if (!info.cancel && wb.changeSheetIndex(sheet.name(), target)) wb._emit(Events.SheetMoved, info);
  }
  private registerCommands(): void {
    const cm = this.view.workbook.commandManager();
    const keys: [string, number, number, number, boolean?][] = [['navigationLeft', 37, 0, -1], ['navigationUp', 38, -1, 0], ['navigationRight', 39, 0, 1], ['navigationDown', 40, 1, 0], ['moveToNextCell', 9, 0, 1], ['moveToPreviousCell', 9, 0, -1, true], ['commitInputNavigationDown', 13, 1, 0], ['commitInputNavigationUp', 13, -1, 0, true]];
    for (const [name, key, dr, dc, shift] of keys) cm.register(name, { execute: () => { this.navigate(dr, dc); return true; } }, key, false, shift ?? false);
    cm.register('undo', { execute: () => { this.view.workbook.undoManager().undo(); return true; } }, 90, true);
    cm.register('redo', { execute: () => { this.view.workbook.undoManager().redo(); return true; } }, 89, true);
    cm.register('clearValues', { canUndo: true, execute: (context, options, isUndo) => commandConstants.clearValues.execute(context, options, isUndo) === true }, 46);
    cm.register('startEdit', { execute: () => { this.startEdit(); return true; } }, 113);
    const endpoint = (end: boolean, ctrl: boolean, extend: boolean) => {
      const s = this.view.sheet!;
      // Trial probe `cmd:navigate-states`: navigationLast goes to the last row/column of the
      // sheet (row 199 on a fresh 200-row sheet), while Home/End stay in the current row band.
      const used = ctrl && end ? { row: s.getRowCount() - 1, col: s.getColumnCount() - 1 } : s._usedRange();
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
    for (const [name, dr, dc] of [['moveToNextCellThenControl', 0, 1], ['moveToPreviousCellThenControl', 0, -1]] as const) cm.register(name, { execute: () => { this.navigate(dr, dc); return name === 'moveToPreviousCellThenControl' ? { ignoreCancelDefault: true } : true; } }); // trial values (probe `cmd:isolated`)
    cm.register('commitInput', { execute: () => (this.isEditing ? this.endEdit() : false) }); // trial: false when nothing is being edited
    cm.register('cancelInput', { execute: () => { if (this.isEditing) this.endEdit(true); return undefined; } }); // trial: null on a fresh workbook
    cm.register('selectAll', { execute: () => { this.view.sheet!._userSetSelection(-1, -1, -1, -1); return true; } }, 65, true);
    cm.register('navigationNextSheet', { execute: () => { const wb = this.view.workbook, index = wb.getActiveSheetIndex(); if (index >= wb.getSheetCount() - 1) return undefined; wb.setActiveSheetIndex(index + 1); return true; } }, 34, true);
    cm.register('navigationPreviousSheet', { execute: () => { const wb = this.view.workbook, index = wb.getActiveSheetIndex(); if (index <= 0) return undefined; wb.setActiveSheetIndex(index - 1); return true; } }, 33, true);

    for (const [key, dr, dc, direction] of [[37, 0, -1, 'Left'], [38, -1, 0, 'Up'], [39, 0, 1, 'Right'], [40, 1, 0, 'Down']] as const) {
      cm.register(`selection${direction}`, { execute: () => { this.navigate(dr, dc, true); return true; } }, key, false, true);
      cm.register(`navigation${direction === 'Left' ? 'Home2' : direction === 'Right' ? 'End2' : direction === 'Up' ? 'Top' : 'Bottom'}`, { execute: () => { this.navigate(dr, dc, false, true); return true; } }, key, true);
      cm.register(`selection${direction === 'Left' ? 'Home' : direction === 'Right' ? 'End' : direction === 'Up' ? 'Top' : 'Bottom'}`, { execute: () => { this.navigate(dr, dc, true, true); return true; } }, key, true, true);
    }
  }
  startEdit(selectAll = false, defaultText?: string): void {
    const s = this.view.sheet;
    const editRow = s?.getActiveRowIndex() ?? 0, editCol = s?.getActiveColumnIndex() ?? 0;
    if (!s || this.editing || !s._isEditableCell(editRow, editCol)) return;
    const row = editRow, col = editCol, info = { ...this.info({ row, col }), cancel: false };
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
    // Style.cellPadding insets the editor exactly like the painted text (task 62).
    const insets = parseInsets(style.cellPadding);
    const box = applyInsets(rect, insets, this.view.zoom);
    const ctx = this.view.context; ctx.save(); ctx.font = this.view.font(style);
    const softLines = editor.value.split('\n');
    const measured = Math.max(...softLines.map(line => ctx.measureText(line).width));
    // Trial editor sizing (task 56 probe `.probe/t56/probe-t56-editor.json`, cell 62x20):
    // inner width = max(cellWidth - 1, ceil(textWidth) + 1); inner height = max(cellHeight - 1,
    // textLines * 17) with wrapped lines counted at the box width.
    const boxWidth = style.wordWrap ? box.width - 1 : Math.min(this.view.viewWidth - box.x, Math.max(box.width - 1, Math.ceil(measured) + 1));
    const wrapped: string[] = [];
    if (style.wordWrap) {
      const limit = Math.max(1, boxWidth - 2 * this.view.zoom);
      for (const line of softLines) {
        let current = '';
        for (const word of line.split(' ')) {
          const candidate = current ? `${current} ${word}` : word;
          if (!current || ctx.measureText(candidate).width <= limit) current = candidate;
          else { wrapped.push(current); current = word; }
        }
        wrapped.push(current);
      }
    } else wrapped.push(...softLines);
    ctx.restore();
    const width = boxWidth;
    const height = Math.max(box.height - this.view.zoom, wrapped.length * 17 * this.view.zoom);
    if (!this.editorContainer) { this.editorContainer = document.createElement('div'); this.editorContainer.className = 'gc-cell-editor-container'; this.view.root.append(this.editorContainer); }
    Object.assign(this.editorContainer.style, { display: editor.style.display, left: `${rect.x - 2 + this.view.viewportX}px`, top: `${rect.y - 2 + this.view.viewportY}px`, width: `${width + 4}px`, height: `${height + 4}px`, background: String(style.backColor ?? 'white') });
    Object.assign(editor.style, { left: `${box.x + this.view.viewportX}px`, top: `${box.y + this.view.viewportY}px`, width: `${width}px`, height: `${height}px`, font: this.view.font(style), color: String(style.foreColor ?? '#243148'), caretColor: String(style.foreColor ?? '#243148'), background: 'transparent', textAlign: style.hAlign === 2 ? 'right' : style.hAlign === 1 ? 'center' : 'left', padding: '0px' });
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
    const border = document.createElement('div'); Object.assign(border.style, { position: 'absolute', pointerEvents: 'none', zIndex: '3', boxSizing: 'border-box', backgroundImage: `${line('right')}, ${line('right')}, ${line('bottom')}, ${line('bottom')}, linear-gradient(${color}1a, ${color}1a)`, backgroundSize: '100% 2px, 100% 2px, 2px 100%, 2px 100%, calc(100% - 4px) calc(100% - 4px)', backgroundPosition: '1px 0, bottom left, left -1px, right -2px, 2px 2px', backgroundRepeat: 'no-repeat', left: `${a.x - 1 + this.view.viewportX}px`, top: `${a.y - 1 + this.view.viewportY}px`, width: `${b.x + b.width - a.x + 1}px`, height: `${b.y + b.height - a.y + 1}px` });
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
    // The grid commits (Enter/Tab and the formula bar's commitFromFormulaBar) run without going
    // through sheet.endEdit(); return the sheet's editor status to `ready` here so isEditing()
    // reflects the closed editor.
    sheet.editorStatusValue = GC.Spread.Sheets.EditorStatus.ready;
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
    // Keys typed inside a comment overlay (thread card input, note editor) belong to that
    // editor; the grid must never run shortcuts/editing on them.
    if (this.commentUi.consumes(event.target)) return;
    if (event.key === 'Escape' && this.commentUi.isOpen() && !this.commentUi.consumes(event.target)) {
      this.commentUi.keydown(event);
      event.preventDefault();
      return;
    }
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
    if (ctrl && event.key.toLowerCase() === 'a') { event.preventDefault(); s._userSetSelection(-1, -1, -1, -1); return; }
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
      else s._userSetActiveCell(row, col);
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
  /**
   * Long-press on a touch pointer opens the workbook touch toolstrip
   * (`Events.TouchToolStripOpening` first; `handled: true` prevents the popup).
   * Threshold measured against the trial with real CDP touch events (probe
   * segment `touchreal`: no event at a 500 ms hold, event at a 900 ms hold).
   */
  private startTouchPress(x: number, y: number): void {
    this.cancelTouchPress();
    const timer = setTimeout(() => {
      this.touchPress = undefined;
      const strip = this.view.workbook.touchToolStrip;
      if (!strip) return;
      strip._paintOnTouch();
      const args = { x, y, handled: false };
      this.view.workbook._emit(Events.TouchToolStripOpening, args);
      if (!args.handled) strip.open(x, y);
    }, 700);
    this.touchPress = { x, y, timer };
  }
  private cancelTouchPress(): void {
    if (!this.touchPress) return;
    clearTimeout(this.touchPress.timer);
    this.touchPress = undefined;
  }
  private pointerDown(event: PointerEvent): void {
    if (event.button !== 0) return;
    // Clicking anywhere on the sheet drops the selection of floating objects/pictures (official behavior).
    const clickedSheet = this.view.sheet;
    if (clickedSheet) for (const item of [...clickedSheet.floatingObjects.all(), ...clickedSheet.pictures.all(), ...(clickedSheet.shapes?.all() ?? [])]) if (item.isSelected()) item.isSelected(false);
    if (this.canPoint()) {
      const hit = this.hit(event);
      if (hit && (hit.row >= 0 || hit.col >= 0)) {
        event.preventDefault(); this.view.overlay.setPointerCapture(event.pointerId);
        this.pointAt(hit, hit, event.ctrlKey || event.metaKey); this.pointDragging = true; return;
      }
    }
    if (!this.endEdit()) return;
    this.closeMenu(); event.preventDefault(); this.view.root.focus(); this.view.overlay.setPointerCapture(event.pointerId);
    {
      const gp = this.point(event);
      const ganttHit = this.ganttChartHit(gp.x, gp.y);
      if (ganttHit) {
        // Gantt chart part: the taskbar under the pointer takes the gesture (no grid selection).
        this.ganttDrag = { hit: ganttHit.hit, fromX: gp.x, fromY: gp.y };
        this.hideGanttTip();
        if (ganttHit.hit.zone === 'link') { ganttHit.api._chartPreview = { task: ganttHit.hit.task, x: gp.x, y: gp.y }; this.view.schedule(); }
        return;
      }
    }
    const hit = this.hit(event), s = this.view.sheet; if (!hit || !s) return;
    this.commentUi.commit(hit.row, hit.col);
    if (hit.row >= 0 && hit.col >= 0 && hit.sheetArea === 3) this.commentUi.reveal(hit.row, hit.col);
    const { x, y } = this.point(event);
    if (s instanceof TableSheet && hit.row >= 0 && hit.col >= 0) {
      const outline = s._hierarchyOutline(hit.row, hit.col);
      const col = this.view.cols.find(item => item.index === hit.col);
      const row = this.view.rows.find(item => item.index === hit.row);
      const top = row ? row.position + (row.size - 16 * this.view.zoom) / 2 : -1;
      if (outline?.hasChildren && col && x >= col.position + outline.offset * this.view.zoom
        && x < col.position + (outline.offset + 16) * this.view.zoom && y >= top && y < top + 16 * this.view.zoom) {
        s._toggleHierarchyOutline(hit.row);
        return;
      }
    }
    if (s instanceof TableSheet && hit.col >= 0 && (hit.row < 0 || s._groupRowHasOutline(hit.row, hit.col))
      && s._groupColumnHasOutline(hit.col)) {
      const col = this.view.cols.find(item => item.index === hit.col);
      const row = this.view.rows.find(item => item.index === hit.row);
      const top = hit.row < 0 ? (this.view.headerHeight - 16 * this.view.zoom) / 2
        : row ? row.position + (row.size - 16 * this.view.zoom) / 2 : -1;
      if (col && x >= col.position + 6 * this.view.zoom && x < col.position + 22 * this.view.zoom
        && y >= top && y < top + 16 * this.view.zoom) {
        s._toggleGroupOutline(hit.row, hit.col);
        return;
      }
    }
    if (s instanceof TableSheet && hit.row >= 0 && hit.col < 0) {
      const index = Math.floor((x / this.view.zoom - 2) / 18);
      const row = this.view.rows.find(item => item.index === hit.row);
      const top = row ? row.position + (row.size - 16 * this.view.zoom) / 2 : -1;
      const level = Math.floor((x / this.view.zoom - 14) / 32);
      if (level >= 0 && x >= (14 + level * 32) * this.view.zoom && x < (30 + level * 32) * this.view.zoom
        && y >= top && y < top + 16 * this.view.zoom && s._groupHeaderOutlineLevels(hit.row).includes(level)) {
        s._toggleGroupHeaderOutline(hit.row, level);
        return;
      }
      if (index >= 0 && s._executeRowAction(hit.row, index)) return;
    }
    const pressed = hit.row >= 0 && hit.col >= 0 ? this.cellButtonAt(hit.row, hit.col, x, y) : undefined;
    this.buttonPress = pressed ? { row: hit.row, col: hit.col, index: pressed.button.index } : undefined;
    if (this.handleM4Hit(hit, x, y)) { event.stopPropagation(); return; }
    if (event.pointerType === 'touch') {
      this.touch = { x, y, moved: false };
      this.view.workbook.touchToolStrip?._paintOnTouch();
      this.startTouchPress(x, y);
    }
    const table = this.tableHandleHit(x, y);
    if (table) {
      const original = s.tables.findByName(table.name)?.range();
      if (original) { this.drag = { kind: 'resizeTable', start: hit, last: hit, range: original, original, initial: 0, startPixel: 0, table: table.name }; return; }
    }
    const resize = this.resizeHit(event);
    if (resize) {
      this.drag = { kind: resize.row ? 'resizeRow' : 'resizeCol', start: { row: resize.row ? resize.index : 0, col: resize.row ? 0 : resize.index }, range: new Range(), initial: (resize.row ? s.getRowHeight(resize.index) : s.getColumnWidth(resize.index)) ?? 0, startPixel: resize.pixel, last: hit }; return;
    }
    const kind = event.pointerType === 'touch' ? undefined : this.handleHit(event);
    if (kind) { this.drag = { kind, start: hit, range: s.getSelections().at(-1)!, initial: 0, startPixel: 0, last: hit }; return; }
    if (hit.row < 0 || hit.col < 0) {
      // Shift+click on a row/column header extends from the anchor (user report 2026-11-23: click row 2, Shift+click row 5
      // selected row 5 only). The active cell stays on the anchor, like a Shift+click on cells.
      const extend = event.shiftKey && this.anchor && (hit.row < 0) !== (hit.col < 0);
      const range = !extend ? new Range(hit.row < 0 ? -1 : hit.row, hit.col < 0 ? -1 : hit.col, hit.row < 0 ? -1 : 1, hit.col < 0 ? -1 : 1)
        : hit.col < 0
          ? new Range(Math.min(this.anchor!.row, hit.row), -1, Math.abs(this.anchor!.row - hit.row) + 1, -1)
          : new Range(-1, Math.min(this.anchor!.col, hit.col), -1, Math.abs(this.anchor!.col - hit.col) + 1);
      const keep = event.ctrlKey && s.selectionPolicy() === 2 ? s.getSelections().slice(0, extend ? -1 : undefined) : [];
      if (extend) s._setUserSelections([...keep, range], this.anchor!.row, this.anchor!.col);
      else {
        s._setUserSelections([...keep, range], Math.max(0, hit.row), Math.max(0, hit.col));
        this.anchor = { row: Math.max(0, hit.row), col: Math.max(0, hit.col) };
      }
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
    Object.assign(menu.style, { left: `${Math.min(x, this.view.width - 180) + this.view.viewportX}px`, top: `${Math.min(y, this.view.height - 40 - items.length * 26) + this.view.viewportY}px` });
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
    if (this.ganttDrag) {
      const gantt = this.ganttApi();
      if (gantt) {
        if (this.ganttDrag.hit.zone === 'link') { gantt._chartPreview = { task: this.ganttDrag.hit.task, x, y }; this.view.schedule(); }
        this.showGanttTip(this.ganttDrag.hit, x, y, true);
      }
      return;
    }
    if (this.touch) {
      if (Math.abs(x - this.touch.x) + Math.abs(y - this.touch.y) > 4) {
        this.cancelTouchPress();
        this.view.scroll((this.touch.y - y) / this.view.zoom, (this.touch.x - x) / this.view.zoom); this.touch = { x, y, moved: true }; this.drag = undefined;
      }
      return;
    }
    const drag = this.drag;
    if (!drag) {
      const ganttHit = this.ganttChartHit(x, y);
      if (ganttHit) {
        // Hovering the Gantt chart part: zone cursor + info tooltip, no grid hover.
        if (this.view.hoverCell) { this.view.hoverCell = undefined; this.view.schedule(); }
        this.view.overlay.style.cursor = ganttHit.api._ganttCursorFor(ganttHit.hit.zone);
        this.showGanttTip(ganttHit.hit, x, y);
        return;
      }
      this.hideGanttTip();
      const hoverHit = this.view.hitTest(x, y);
      const previousCell = this.view.hoverCell;
      this.view.hoverCell = hoverHit && hoverHit.sheetArea === 3 && hoverHit.row >= 0 && hoverHit.col >= 0
        ? { row: hoverHit.row, col: hoverHit.col } : undefined;
      if (s.cellStates._hasAny() && (previousCell?.row !== this.view.hoverCell?.row
        || previousCell?.col !== this.view.hoverCell?.col)) this.view.schedule();
      const hoverButton = hoverHit && hoverHit.row >= 0 && hoverHit.col >= 0 ? this.cellButtonAt(hoverHit.row, hoverHit.col, x, y) : undefined;
      const previousHover = this.view.hoverButton;
      this.view.hoverButton = hoverButton ? { row: hoverHit!.row, col: hoverHit!.col, index: hoverButton.button.index } : undefined;
      const changed = (!!this.view.hoverButton !== !!previousHover) || (this.view.hoverButton && previousHover && (this.view.hoverButton.row !== previousHover.row || this.view.hoverButton.col !== previousHover.col || this.view.hoverButton.index !== previousHover.index));
      if (changed) this.view.schedule();
      this.view.overlay.style.cursor = hoverButton ? 'pointer' : this.tableHandleHit(x, y) ? 'se-resize' : this.resizeHit(event) ? this.resizeHit(event)!.row ? 'row-resize' : 'col-resize' : this.handleHit(event) === 'fill' ? 'crosshair' : this.handleHit(event) === 'move' ? 'move' : 'cell';
      const hit = this.view.hitTest(x, y); if (hit && hit.row >= 0 && hit.col >= 0 && hit.sheetArea === 3) this.commentUi.hover(hit.row, hit.col); else this.commentUi.hoverOut(); return;
    }
    if (drag.kind === 'resizeRow' || drag.kind === 'resizeCol') {
      const row = drag.kind === 'resizeRow', index = row ? drag.start.row : drag.start.col;
      const size = Math.max(0, drag.initial + ((row ? y : x) - drag.startPixel) / this.view.zoom);
      const info = { ...this.info(drag.start), [row ? 'rowList' : 'colList']: [index], header: false, newSize: size, cancel: false };
      s._emit(row ? Events.RowHeightChanging : Events.ColumnWidthChanging, info);
      if (!info.cancel) { if (row) s.setRowHeight(index, size); else s.setColumnWidth(index, size); }
      if (this.view.workbook.options.showResizeTip) this.view.overlay.title = row ? ltext('status.heightTip', 'Height: {0} pixels', Math.round(size)) : ltext('status.widthTip', 'Width: {0} pixels', Math.round(size));
      return;
    }
    if (y > this.view.viewHeight - 10) this.view.scroll(20, 0); else if (y < this.view.headerHeight) this.view.scroll(-20, 0);
    if (x > this.view.viewWidth - 10) this.view.scroll(0, 20); else if (x < this.view.headerWidth) this.view.scroll(0, -20);
    const hit = this.view.hitTest(Math.max(0, Math.min(this.view.viewWidth - 1, x)), Math.max(0, Math.min(this.view.viewHeight - 1, y)));
    if (!hit) return;
    drag.last = { row: Math.max(0, hit.row), col: Math.max(0, hit.col) };
    if (drag.kind === 'resizeTable' && drag.original) {
      const o = drag.original;
      const next = new Range(o.row, o.col, Math.max(1, drag.last.row - o.row + 1), Math.max(1, drag.last.col - o.col + 1));
      if (!next.equals(drag.range)) { s.tables.resize(String(drag.table), next); drag.range = next; }
      return;
    }
    if (drag.kind === 'select') {
      if (s.selectionPolicy() === 0) return;
      let range = new Range(Math.min(Math.max(0, drag.start.row), drag.last.row), Math.min(Math.max(0, drag.start.col), drag.last.col), Math.abs(drag.last.row - Math.max(0, drag.start.row)) + 1, Math.abs(drag.last.col - Math.max(0, drag.start.col)) + 1);
      if (drag.start.row < 0) range = new Range(-1, range.col, -1, range.colCount);
      if (drag.start.col < 0) range = new Range(range.row, -1, range.rowCount, -1);
      const before = s.getSelections(); if (before.length > 1) before.pop(); else before.length = 0;
      s._setUserSelections([...before, range], this.anchor.row, this.anchor.col); this.applySelectionUnit();
    }
  }
  // ---------------------------------------------------------------------------
  // Gantt chart-part pointer helpers (structural API so `interaction.ts` stays free
  // of a gantt import cycle).
  // ---------------------------------------------------------------------------
  private ganttApi(): GanttChartApi | undefined {
    const s = this.view.sheet as unknown as Partial<GanttChartApi> | undefined;
    return s && typeof s._ganttChartHit === 'function' ? s as GanttChartApi : undefined;
  }
  private ganttChartHit(x: number, y: number): { api: GanttChartApi; hit: GanttHit } | undefined {
    const api = this.ganttApi();
    const hit = api?._ganttChartHit(x, y);
    return api && hit ? { api, hit } : undefined;
  }
  private showGanttTip(hit: GanttHit, x: number, y: number, dragging = false): void {
    const api = this.ganttApi();
    if (!api) return;
    const lines = api._ganttTipLines(hit, x, y, dragging);
    if (!lines.length) { this.hideGanttTip(); return; }
    if (!this.ganttTipEl) {
      const tip = document.createElement('div');
      tip.style.cssText = 'position:absolute;z-index:30;background:#fff;border:1px solid #d0d0d0;'
        + 'box-shadow:1px 2px 3px rgba(0,0,0,0.2);font:12.8px Calibri;color:#000;padding:3px 8px;'
        + 'pointer-events:none;white-space:nowrap';
      this.view.root.appendChild(tip);
      this.ganttTipEl = tip;
    }
    this.ganttTipEl.replaceChildren(...lines.map(line => { const d = document.createElement('div'); d.textContent = line; return d; }));
    const rect = this.view.overlay.getBoundingClientRect();
    const rootRect = this.view.root.getBoundingClientRect();
    const w = this.ganttTipEl.offsetWidth;
    const h = this.ganttTipEl.offsetHeight;
    this.ganttTipEl.style.left = `${Math.max(2, Math.min(rect.left - rootRect.left + x + 12, rootRect.width - w - 4))}px`;
    this.ganttTipEl.style.top = `${Math.max(2, Math.min(rect.top - rootRect.top + y - h / 2, rootRect.height - h - 4))}px`;
  }
  private hideGanttTip(): void {
    this.ganttTipEl?.remove();
    this.ganttTipEl = undefined;
  }
  private pointerUp(event: PointerEvent): void {
    if (this.pointDragging) { this.pointDragging = false; (this.formulaBar ?? this.view.editor).focus(); return; }
    if (this.ganttDrag) {
      const { hit, fromX } = this.ganttDrag;
      this.ganttDrag = undefined;
      const gantt = this.ganttApi();
      if (gantt) {
        if (hit.zone === 'link') { gantt._chartPreview = undefined; this.view.schedule(); }
        const { x, y } = this.point(event);
        gantt._applyGanttDrag(hit, fromX, x, y);
      }
      this.hideGanttTip();
      return;
    }
    const press = this.buttonPress;
    if (press) {
      this.buttonPress = undefined;
      const { x, y } = this.point(event);
      const over = hitButton(this.view.cellButtons(press.row, press.col), x, y);
      if (over && over.button.index === press.index) this.activateCellButton(press.row, press.col, press.index);
    }
    const drag = this.drag; this.drag = undefined; this.touch = undefined; this.cancelTouchPress();
    if (!drag) return;
    if (drag.kind === 'resizeRow' || drag.kind === 'resizeCol') {
      const s = this.view.sheet!, row = drag.kind === 'resizeRow', index = row ? drag.start.row : drag.start.col;
      const next = (row ? s.getRowHeight(index) : s.getColumnWidth(index)) ?? 0;
      this.recordResize(row, index, drag.initial, next);
    } else if (drag.kind === 'fill') this.fill(drag.range, drag.last, event.ctrlKey);
    else if (drag.kind === 'move') this.move(drag.range, drag.last.row - drag.start.row, drag.last.col - drag.start.col);
    else if (drag.kind === 'resizeTable' && drag.original && !drag.original.equals(drag.range)) this.recordTableResize(String(drag.table), drag.original, drag.range);
    this.view.overlay.title = '';
  }
  /** Pointer position over a table resize handle (drawn by the renderer). */
  private tableHandleHit(x: number, y: number): { name: string } | null {
    for (const handle of this.view._tableHandles) {
      if (x >= handle.x - 3 && x <= handle.x + handle.size + 3 && y >= handle.y - 3 && y <= handle.y + handle.size + 3) return handle;
    }
    return null;
  }
  private recordTableResize(name: string, previous: Range, next: Range): void {
    const s = this.view.sheet!;
    let first = true;
    this.view.workbook.commandManager().register('_userTableResize', { canUndo: true, execute: (_ctx, _options, undo) => {
      if (first) { first = false; return true; }
      const table = s.tables.findByName(name);
      if (!table) return true;
      table._resize(undo ? previous : next);
      s._invalidate();
      return true;
    } });
    this.view.workbook.commandManager().execute({ cmd: '_userTableResize' });
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
    if (hit.row >= 0 && hit.col >= 0) { s._userSetActiveCell(hit.row, hit.col); this.startEdit(); }
  }
  private sheetList(hidden = false): void {
    this.closeMenu();
    const wb = this.view.workbook;
    const items: MenuItemData[] = wb.sheets.flatMap((sheet, index) => (hidden ? !!sheet.visible() : !sheet.visible()) ? [] : [{ name: String(index), text: sheet.name(), itemClass: index === wb.getActiveSheetIndex() ? 'opensheets-active-sheet' : undefined }]);
    const menu = renderMenu(wb.contextMenu, items, item => { const index = Number(item.name); if (hidden) wb.getSheet(index).visible(true); wb.setActiveSheetIndex(index); wb.startSheetIndex(index); this.closeMenu(); });
    menu.classList.add('opensheets-sheet-list');
    const wrapper = document.createElement('div'); wrapper.className = 'opensheets-sheet-search';
    Object.assign(wrapper.style, { position: 'absolute', zIndex: '10', left: '80px', bottom: '17px' });
    const label = document.createElement('label'); label.textContent = hidden ? ltext('sheets.unhideSheet', 'Unhide Sheet:') : ltext('sheets.activeSheet', 'Active Sheet:');
    const search = document.createElement('input'); search.setAttribute('aria-label', label.textContent);
    search.addEventListener('input', () => { for (const item of menu.children) { const element = item as HTMLElement; element.hidden = !element.textContent?.toLowerCase().includes(search.value.toLowerCase()); } });
    menu.style.maxHeight = `${this.view.viewHeight - 80}px`; menu.style.overflow = 'auto';
    wrapper.append(label, search, menu); this.view.root.append(wrapper); this.menu = wrapper;
  }
  private renameTab(event: MouseEvent): void {
    const hit = this.tabHit(event.clientX, event.clientY), wb = this.view.workbook;
    if (!hit || hit.index < 0) return;
    const s = wb.getSheet(hit.index);
    wb._emit(Events.SheetTabDoubleClick, { sheet: s, sheetName: s.name(), sheetTabIndex: hit.index });
    if (!wb.options.tabEditable) return;
    const rect = this.view.tabs.getBoundingClientRect(), rootRect = this.view.root.getBoundingClientRect();
    const input = document.createElement('input'); input.className = 'gc-sheetTabEditor'; input.value = s.name();
    const vertical = this.view.tabVertical;
    // The trial's editor hugs the tab text: inset box over the slot, no border, white background.
    Object.assign(input.style, vertical
      ? { left: `${rect.left - rootRect.left + 9}px`, top: `${rect.top - rootRect.top + hit.x}px`, width: '41px', height: '16px' }
      : { left: `${rect.left - rootRect.left + hit.x + 14}px`, top: `${rect.top - rootRect.top + 2}px`, width: `${hit.width - 22}px`, height: '20px' });
    this.view.root.append(input); input.focus(); input.select();
    let done = false;
    const finish = (cancel: boolean) => { if (done) return; done = true; if (!cancel && input.value !== s.name()) { try { s.name(input.value); } catch { done = false; input.focus(); return; } } input.remove(); this.view.schedule(); };
    input.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter' || e.key === 'Escape') finish(e.key === 'Escape'); });
    input.addEventListener('blur', () => finish(false));
  }
  private copy(event: ClipboardEvent | null, cut: boolean): void {
    if (event && (this.editing || this.commentUi.consumes(event.target))) return;
    const s = this.view.sheet!, selected = s.getSelections().at(-1); if (!selected) return;
    const used = s._usedRange();
    const range = selected.normalized(selected.row < 0 ? used.row + 1 : s.getRowCount(), selected.col < 0 ? used.col + 1 : s.getColumnCount());
    const info = { ...this.info(range), cellRange: range, copyData: '', cancel: false, isCutting: cut };
    s._emit(Events.ClipboardChanging, info); if (info.cancel) { event?.preventDefault(); return; }
    const values = s.getArray(range.row, range.col, range.rowCount, range.colCount), text = encodeTSV(values);
    const escape = (value: unknown) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
    event?.clipboardData?.setData('text/plain', text);
    event?.clipboardData?.setData('text/html', '<table>' + values.map(row => '<tr>' + row.map(value => `<td>${escape(value)}</td>`).join('') + '</tr>').join('') + '</table>');
    event?.preventDefault();
    const formulas = s.getArray(range.row, range.col, range.rowCount, range.colCount, true);
    const styles: (Style | null)[][] = [];
    for (let r = 0; r < range.rowCount; r++) {
      const rowStyles: (Style | null)[] = [];
      for (let c = 0; c < range.colCount; c++) {
        const style = s.getStyle(range.row + r, range.col + c);
        rowStyles.push(style instanceof Style ? style.clone() : style ?? null);
      }
      styles.push(rowStyles);
    }
    this.clipboard = { sheet: s, range, values, formulas, styles }; this.cut = cut; this.view.copiedRange = range;
    if (this.ants) clearInterval(this.ants);
    this.ants = setInterval(() => this.view.drawSelection(), 120);
    s._emit(Events.ClipboardChanged, { ...info, copyData: text }); this.view.drawSelection();
  }
  /** Programmatic Copy/Cut (used by the Designer context menu, mirrors Ctrl+C/X). */
  _copySelection(cut: boolean): void { this.copy(null, cut); }
  /** Clear the pending copy/cut state (after a cut-paste completes the move). */
  _clearClipboard(): void {
    this.clipboard = undefined; this.cut = false;
    this.view.copiedRange = undefined;
    if (this.ants) { clearInterval(this.ants); this.ants = 0 as never; }
    this.view.drawSelection();
  }
  private paste(event: ClipboardEvent): void {
    if (this.editing || this.commentUi.consumes(event.target)) return;
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
    if (!s._isEditableCell(row, col)) return;
    const range = new Range(row, col, values.length, Math.max(...values.map(row => row.length)));
    const info = { ...this.info(range), cellRange: range, pasteData: { text: encodeTSV(values) }, cancel: false };
    s._emit(Events.ClipboardPasting, info); if (info.cancel) return;
    if (this.clipboard?.sheet === s && encodeTSV(values) === encodeTSV(this.clipboard.values)) {
      const source = this.clipboard.range;
      this.undoableMutation('clipboardPaste', [source, range], () => { if (this.cut) s.moveTo(source.row, source.col, row, col, source.rowCount, source.colCount); else s.copyTo(source.row, source.col, row, col, source.rowCount, source.colCount); });
      if (this.cut) this.clearCopy();
    } else this.batchValues(range, (r, c) => this.parseText(values[r - row]?.[c - col] ?? '', r, c));
    s._userSetSelection(range.row, range.col, range.rowCount, range.colCount);
    s._emit(Events.ClipboardPasted, info);
  }
  /**
   * Context-menu paste options (`pasteFormula`, `pasteFormatting`,
   * `pasteValuesFormatting`, `pasteFormulaFormatting`): apply the matching
   * subset of the internal clipboard snapshot at the active cell. Same-sheet
   * formulas are re-based to the paste position; values are pasted without the
   * formula for the values-only variants (trial Paste Options behaviour).
   */
  pasteSpecial(option: 'pasteFormula' | 'pasteFormatting' | 'pasteValuesFormatting' | 'pasteFormulaFormatting'): void {
    const s = this.view.sheet!, clip = this.clipboard;
    if (!clip) return; // the trial needs its internal clipboard state for these items
    const withFormula = option === 'pasteFormula' || option === 'pasteFormulaFormatting';
    const withStyle = option === 'pasteFormatting' || option === 'pasteValuesFormatting' || option === 'pasteFormulaFormatting';
    const row = s.getActiveRowIndex(), col = s.getActiveColumnIndex();
    if (!s._isEditableCell(row, col)) return;
    const rowCount = Math.min(clip.range.rowCount, s.getRowCount() - row), colCount = Math.min(clip.range.colCount, s.getColumnCount() - col);
    if (rowCount <= 0 || colCount <= 0) return;
    const range = new Range(row, col, rowCount, colCount);
    const info = { ...this.info(range), cellRange: range, pasteData: { text: '' }, cancel: false };
    s._emit(Events.ClipboardPasting, info); if (info.cancel) return;
    const sameSheet = clip.sheet === s;
    const snapshot = () => {
      const rows: { f: unknown; v: unknown; st: Style | null }[][] = [];
      for (let r = 0; r < rowCount; r++) {
        const line: { f: unknown; v: unknown; st: Style | null }[] = [];
        for (let c = 0; c < colCount; c++) {
          const cellRow = range.row + r, cellCol = range.col + c;
          const style = s.getStyle(cellRow, cellCol);
          line.push({ f: s.getFormula(cellRow, cellCol), v: s.getValue(cellRow, cellCol), st: style instanceof Style ? style.clone() : style ?? null });
        }
        rows.push(line);
      }
      return rows;
    };
    const restore = (rows: { f: unknown; v: unknown; st: Style | null }[][]) => {
      for (let r = 0; r < rowCount; r++) for (let c = 0; c < colCount; c++) {
        const cellRow = range.row + r, cellCol = range.col + c, { f, v, st } = rows[r][c];
        if (typeof f === 'string' && f) { s.setFormula(cellRow, cellCol, f); s._setCalculatedValue(cellRow, cellCol, v); }
        else { s.setFormula(cellRow, cellCol, null); s.setValue(cellRow, cellCol, v ?? null); }
        s.setStyle(cellRow, cellCol, st);
      }
    };
    const before = snapshot();
    this.view.workbook.suspendPaint(); s.suspendCalcService();
    try {
      for (let r = 0; r < rowCount; r++) for (let c = 0; c < colCount; c++) {
        const cellRow = range.row + r, cellCol = range.col + c;
        const sourceRow = clip.range.row + r, sourceCol = clip.range.col + c;
        if (withFormula) {
          const formula = clip.sheet.getFormula(sourceRow, sourceCol);
          if (typeof formula === 'string' && formula) {
            if (sameSheet) s.setFormula(cellRow, cellCol, adjustFormula(formula, cellRow - sourceRow, cellCol - sourceCol));
            else { s.setFormula(cellRow, cellCol, formula); s._setCalculatedValue(cellRow, cellCol, clip.values[r][c]); }
          }
          else { s.setFormula(cellRow, cellCol, null); s.setValue(cellRow, cellCol, clip.values[r][c] ?? null); }
        }
        else if (option !== 'pasteFormatting') { s.setFormula(cellRow, cellCol, null); s.setValue(cellRow, cellCol, clip.values[r][c] ?? null); }
        if (withStyle) {
          const style = clip.styles[r][c];
          s.setStyle(cellRow, cellCol, style instanceof Style ? style.clone() : style);
        }
      }
    } finally { s.resumeCalcService(); this.view.workbook.resumePaint(); }
    const after = snapshot();
    let first = true;
    const wb = this.view.workbook;
    wb.commandManager().register('clipboardPaste', { canUndo: true, execute: (_ctx, _opts, undo) => {
      if (first) { first = false; return true; }
      wb.suspendPaint(); s.suspendCalcService();
      try { restore(undo ? before : after); } finally { s.resumeCalcService(); wb.resumePaint(); }
      return true;
    } });
    wb.commandManager().execute({ cmd: 'clipboardPaste' });
    s._userSetSelection(range.row, range.col, range.rowCount, range.colCount);
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
    if (s.options.isProtected && !s.getSelections().some(range => s._isEditableCell(range.row, range.col))) return;
    const ranges = s.getSelections();
    this.undoableMutation('clearRange', ranges, () => {
      for (const [row, col, oldValue, formula] of s._storedCells()) if ((oldValue != null || formula) && ranges.some(range => range.contains(row, col)) && s._isEditableCell(row, col)) {
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
    s._userSetSelection(target.row, target.col, target.rowCount, target.colCount); s._emit(Events.DragFillBlockCompleted, info);
  }
  private move(source: Range, dr: number, dc: number): void {
    const s = this.view.sheet!; if (!dr && !dc) return;
    const row = Math.max(0, Math.min(s.getRowCount() - source.rowCount, source.row + dr)), col = Math.max(0, Math.min(s.getColumnCount() - source.colCount, source.col + dc));
    const info = { sheet: s, sheetName: s.name(), fromRow: source.row, fromCol: source.col, toRow: row, toCol: col, rowCount: source.rowCount, colCount: source.colCount, cancel: false };
    s._emit(Events.DragDropBlock, info); if (info.cancel) return;
    this.undoableMutation('dragDrop', [source, new Range(row, col, source.rowCount, source.colCount)], () => s.moveTo(source.row, source.col, row, col, source.rowCount, source.colCount)); s._userSetSelection(row, col, source.rowCount, source.colCount); s._emit(Events.DragDropBlockCompleted, info);
  }
  openFilter(filter: RowFilterBase, column: number, x: number, y: number, title: string): void {
    this.closeMenu();
    const root = filterMenu(this.view.sheet!, filter, column, title, () => this.closeMenu(), dialog => {
      this.closeMenu(); this.view.root.append(dialog); this.menu = dialog;
    });
    // The trial aligns to the cell's left and clamps to the host edge.
    Object.assign(root.style, { left: `${Math.max(5, Math.min(x + this.view.cellRect(0, filter.range!.col + column).width - 239, this.view.width - 244)) + this.view.viewportX}px`, top: `${Math.max(0, Math.min(y, this.view.height - 416)) + this.view.viewportY}px` });
    this.view.root.append(root); this.menu = root; root.focus();
  }
  private contextMenu(event: MouseEvent): void {
    const wb = this.view.workbook;
    if (!wb.options.allowContextMenu || this.editing) return;
    event.preventDefault(); this.closeMenu();
    const { x, y } = this.point(event), tab = this.tabHit(event.clientX, event.clientY);
    const rootPoint = this.rootPoint(event);
    if (tab && tab.index >= 0) wb.setActiveSheetIndex(tab.index);
    const s = this.view.sheet!, hit = this.hit(event);
    if (!tab && hit && !s.getSelections().some(range => range.contains(hit.row, hit.col))) {
      if (hit.row < 0 || hit.col < 0) s._setUserSelections([new Range(hit.row, hit.col, hit.row < 0 ? -1 : 1, hit.col < 0 ? -1 : 1)], Math.max(0, hit.row), Math.max(0, hit.col));
      else s._userSetActiveCell(hit.row, hit.col);
    }
    const area = tab ? 'sheetTab' : !hit || hit.row < 0 && hit.col < 0 ? 'corner' : hit.row < 0 ? 'colHeader' : hit.col < 0 ? 'rowHeader' : 'viewport';
    const table = hit && hit.row >= 0 && hit.col >= 0 ? s.tables.find(hit.row, hit.col) : null;
    const comment = s.comments.get(s.getActiveRowIndex(), s.getActiveColumnIndex());
    const thread = s.threadedComments.get(s.getActiveRowIndex(), s.getActiveColumnIndex());
    const excluded = new Set(['gc.spread.pasteSpecial', 'gc.spread.paste', 'gc.spread.ganttSheetPaste', 'gc.spread.insertCopiedCells', 'gc.spread.insertCutCells', 'gc.spread.rowHeaderinsertCopiedCells', 'gc.spread.rowHeaderinsertCutCells', 'gc.spread.colHeaderinsertCopiedCells', 'gc.spread.colHeaderinsertCutCells', 'gc.spread.pinRows', 'gc.spread.pinColumns', 'gc.spread.colHeadermodifyColumn', 'gc.spread.colHeaderremoveColumn', 'gc.spread.colHeadersetPrimaryKey', 'gc.spread.rowHeaderpromote', 'gc.spread.rowHeaderdemote', 'gc.spread.rowHeadermoveUp', 'gc.spread.rowHeadermoveDown', 'gc.spread.rowHeaderaddAfter', 'gc.spread.rowHeaderaddBefore', 'gc.spread.rowHeaderaddAbove', 'gc.spread.rowHeaderaddBelow']);
    const menu = wb.contextMenu;
    const items = compactMenu(menu.menuData.filter(item => {
      if (item.visible === false || excluded.has(item.name ?? '') || item.name?.startsWith('reportSheet')) return false;
      if (/colHeader(?:expand|collapse)/.test(item.name ?? '') && s.columnOutlines.getMaxLevel() < 0) return false;
      if (item.type === 'separator') return true;
      if (['gc.spread.editComment', 'gc.spread.deleteComment', 'gc.spread.toggleComment'].includes(item.name ?? '') && !comment) return false;
      if (item.name === 'gc.spread.insertComment' && (comment || thread || area === 'corner')) return false;
      if (item.name === 'gc.spread.insertThreadedComment' && (thread || comment || area === 'corner')) return false;
      if (['gc.spread.replyToThreadedComment', 'gc.spread.deleteThreadedComment'].includes(item.name ?? '') && !thread) return false;
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
    // The trial right-aligns the menu to the cursor when it would overflow the host, and lets tab menus reach 13px past the strip edge.
    const menuWidth = root.offsetWidth;
    const left = rootPoint.x + menuWidth > this.view.width ? Math.max(0, rootPoint.x - menuWidth + 4) : rootPoint.x;
    root.style.left = `${Math.max(0, left)}px`;
    root.style.top = `${Math.max(0, Math.min(rootPoint.y, (tab ? this.view.viewHeight + this.view.viewportY + 12 : this.view.height) - root.offsetHeight))}px`;
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
      case 'pasteFormula': case 'pasteFormatting': case 'pasteValuesFormatting': case 'pasteFormulaFormatting': this.pasteSpecial(action); return;
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
      case 'insertComment': this.commentUi.insertComment(); return;
      case 'editComment': this.commentUi.editComment(); return;
      case 'deleteComment': this.commentUi.commit(); s.comments.remove(s.getActiveRowIndex(), s.getActiveColumnIndex()); return;
      case 'toggleComment': this.commentUi.toggleComments(); return;
      case 'insertThreadedComment': case 'replyToThreadedComment': this.commentUi.openThread(); return;
      case 'deleteThreadedComment': this.commentUi.deleteThread(); return;
      default: notImplemented(`ContextMenu.${item.command ?? action}`);
    }
  }
  private closeMenu(): void { this.menu?.remove(); this.menu = undefined; }
  /** True while the in-cell editor is open on a cell. */
  editingAt(row: number, col: number): boolean {
    return !!this.editing && this.editing.row === row && this.editing.col === col;
  }
  /** Cell button (style.cellButtons) covering the host point, if any. */
  private cellButtonAt(row: number, col: number, x: number, y: number): ButtonRect | undefined {
    return hitButton(this.view.cellButtons(row, col), x, y);
  }
  /** Run a pressed cell button's command: callback or command name, plus the ButtonClicked event. */
  private activateCellButton(row: number, col: number, index: number): void {
    const s = this.view.sheet;
    if (!s) return;
    const style = s.getActualStyle(row, col) as Record<string, unknown>;
    const list = Array.isArray(style.cellButtons) ? style.cellButtons as unknown[] : [];
    const option = (list[index] ?? {}) as Record<string, unknown>;
    if (option.enabled === false) return;
    s._emit(Events.ButtonClicked, { sheet: s, sheetName: s.name(), row, col, sheetArea: 3, index, command: option.command });
    const command = option.command;
    if (typeof command === 'function') { (command as (sheet: Worksheet, row: number, col: number, option: unknown) => void)(s, row, col, option); return; }
    if (typeof command !== 'string' || !command || command === 'none') return;
    const cm = this.view.workbook.commandManager() as object;
    if (Object.prototype.hasOwnProperty.call(cm, command)) this.view.workbook.commandManager().execute({ cmd: command, sheetName: s.name(), row, col });
  }
  destroy(): void { this.hints.close(); this.formulaLayer?.remove(); for (const layer of this.referenceLayers) layer.remove(); this.abort.abort(); if (this.ants) clearInterval(this.ants); this.closeMenu(); this.commentUi.destroy(); }
}
