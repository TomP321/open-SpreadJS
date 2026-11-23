import type { TableSheet } from './index.js';
import { Workbook } from '../workbook.js';
import { CheckBox } from '../features/cell-types.js';
import { clearWorkbookHost, registerWorkbookHost } from '../features/controls.js';
import { Events } from '../events.js';
import { ltext } from '../localization.js';

/** TableSheet panel captions (`tablePanel.*` language namespace). */
const ttext = (key: string, fallback: string, ...args: (string | number)[]) => ltext(`tablePanel.${key}`, fallback, ...args);
import { Style } from '../primitives.js';

type PanelOptions = { showSource?: number; fieldAreaVisible?: boolean; groupAreaVisible?: boolean };
type ViewColumn = { value?: string; name?: string; caption?: string; visible?: boolean };
type SummaryField = { formula: string; caption?: string; slice?: string; relateTo?: string; [key: string]: unknown };
type GroupEntry = { field: string; caption?: string; summaryFields?: SummaryField[]; [key: string]: unknown };

/** Field-list row height of the embedded mini-workbook (measured from the reference panel). */
const MINI_ROW_HEIGHT = 20;
/** Width of the checkbox column in the mini-workbook (measured from the reference panel). */
const MINI_CHECK_WIDTH = 28;
/** Fallback mini-workbook size when the panel is not laid out (hidden host, jsdom, tests). */
const MINI_DEFAULT_SIZE: [number, number] = [280, 170];

/**
 * TableSheet field panel: an embedded mini-workbook listing the data-view fields
 * (checkbox + caption per row, view name on the frozen first row), a row-group
 * area, and a summary editor for the selected group. Structure, sizes, colours
 * and behaviour follow the reference product's panel (measured black-box).
 */
export class TableSheetPanel {
  private static controls = new WeakMap<HTMLElement, TableSheetPanel | null>();
  private sheet?: TableSheet;
  private unsubscribe?: () => void;
  private unsubscribeSheet?: () => void;
  /** HTML5 drag state (kept for programmatic drops). */
  private drag?: { field: string; index: number; group: boolean };
  /** Mouse-drag state started on the field mini-workbook or a group item. */
  private pointerDrag?: { field: string; index: number; group: boolean; x: number; y: number; active: boolean };
  private mini?: Workbook;
  private documentDragCleanup?: () => void;
  private root!: HTMLElement;
  private fieldContainer!: HTMLElement;
  private fieldPanel!: HTMLElement;
  private groupPanel!: HTMLElement;
  private groupList!: HTMLUListElement;
  private summary!: HTMLElement;
  private selectedGroup = 0;
  /** Uncommitted summary rows created through the "Add Summary Field" button. */
  private summaryDrafts: SummaryField[] = [];
  private resize?: ResizeObserver;
  private readonly hostDragOver = (event: DragEvent): void => { if (this.drag?.group) event.preventDefault(); };
  private readonly hostDrop = (event: DragEvent): void => {
    if (!this.drag?.group || !this.sheet) return;
    event.preventDefault();
    this.removeGroup(this.drag.field);
    this.drag = undefined;
    this.renderGroups();
    this.renderSummary();
  };

  constructor(private name: string, sheet: TableSheet, private host: HTMLElement, private options: PanelOptions = {}) {
    TableSheetPanel.controls.set(host, this);
    this.build();
    this.attach(sheet);
  }

  /** Create the panel skeleton once; the content areas are refreshed by render*(). */
  private build(): void {
    this.host.replaceChildren();
    this.root = document.createElement('div');
    this.root.className = 'gc-table-sheet-panel';

    this.fieldContainer = document.createElement('div');
    this.fieldContainer.className = 'gc-table-sheet-field-container';
    const fieldHeader = document.createElement('span');
    fieldHeader.className = 'gc-table-sheet-field-header';
    fieldHeader.textContent = ttext('fields', 'Fields');
    const addCalc = document.createElement('span');
    addCalc.className = 'gc-table-sheet-add-calculate-column';
    addCalc.title = ttext('addCalc', 'Add Calculated Column');
    addCalc.setAttribute('role', 'button');
    addCalc.addEventListener('click', () => this.addCalculateRow());
    fieldHeader.append(addCalc);
    this.fieldPanel = document.createElement('div');
    this.fieldPanel.className = 'gc-table-sheet-field-panel gc-no-user-select';
    this.fieldContainer.append(fieldHeader, this.fieldPanel);

    this.groupPanel = document.createElement('div');
    this.groupPanel.className = 'gc-table-sheet-group-panel';
    const groupHeader = document.createElement('span');
    groupHeader.className = 'gc-table-sheet-group-header';
    groupHeader.textContent = ttext('groups', 'Groups');
    this.groupList = document.createElement('ul');
    this.groupList.className = 'gc-table-sheet-group-list';
    this.groupList.setAttribute('role', 'listbox');
    this.groupList.setAttribute('aria-label', ttext('groups', 'Groups'));
    this.groupPanel.append(groupHeader, this.groupList);

    const cross = document.createElement('div');
    cross.className = 'gc-table-sheet-group-panel gc-table-sheet-cross-panel gc-table-sheet-cross-column gc-table-sheet-hidden';
    const crossHeader = document.createElement('span');
    crossHeader.className = 'gc-table-sheet-group-header';
    crossHeader.textContent = ttext('cross', 'Cross');
    const crossDetail = document.createElement('div');
    crossDetail.className = 'gc-table-sheet-cross-column-detail';
    cross.append(crossHeader, crossDetail);

    this.summary = document.createElement('div');
    this.summary.className = 'gc-table-sheet-summary-container';

    const fake = document.createElement('div');
    fake.className = 'fake-ftb-workbook';
    fake.style.display = 'none';

    this.root.append(this.fieldContainer, this.groupPanel, cross, this.summary, fake);
    this.host.append(this.root);
    this.host.addEventListener('dragover', this.hostDragOver);
    this.host.addEventListener('drop', this.hostDrop);
    this.layout();
    if (typeof ResizeObserver !== 'undefined') {
      this.resize = new ResizeObserver(() => this.layout());
      this.resize.observe(this.host);
    }
    this.bindDocumentDrag();
  }

  /**
   * Region heights follow the host: fields 40%, groups 30%, summary the remaining
   * 30% minus a 10px bottom gap (measured at 300/500, 520/900 and 450/300 hosts).
   */
  private layout(): void {
    const height = this.host.clientHeight || this.root.getBoundingClientRect().height || 500;
    const fieldArea = this.options.fieldAreaVisible !== false;
    const groupArea = this.options.groupAreaVisible !== false;
    let fields = fieldArea ? Math.round(height * 0.4) : 0;
    let groups = groupArea ? Math.round(height * 0.3) : 0;
    if (fieldArea && !groupArea) fields = height;
    if (!fieldArea && groupArea) groups = Math.round(height * 0.5);
    this.fieldContainer.style.height = fields + 'px';
    this.fieldContainer.style.display = fieldArea ? '' : 'none';
    this.groupPanel.style.height = groups + 'px';
    this.groupPanel.style.display = groupArea ? '' : 'none';
    this.summary.style.height = Math.max(0, height - fields - groups - (fieldArea && groupArea ? 10 : 8)) + 'px';
    this.summary.style.display = fieldArea || groupArea ? '' : 'none';
  }

  attach(sheet: TableSheet): void {
    this.unsubscribe?.();
    this.unsubscribeSheet?.();
    this.sheet = sheet;
    this.unsubscribeSheet = sheet._onDataViewChanged(() => this.subscribeView());
    this.subscribeView();
  }

  private subscribeView(): void {
    const view = this.sheet?.getDataView();
    if (this.mini && view && view === this.subscribedView) {
      // The view object is unchanged (e.g. only grouping changed): refresh in place.
      this.updateMini();
      this.renderGroups();
      this.renderSummary();
      return;
    }
    this.unsubscribe?.();
    this.unsubscribe = view?.onChanged(() => {
      this.updateMini();
      this.renderGroups();
      this.renderSummary();
    });
    this.subscribedView = view;
    this.createMini();
    this.renderGroups();
    this.renderSummary();
  }
  private subscribedView?: object;

  /** (Re)create the embedded mini-workbook sized to the current field panel area. */
  private createMini(): void {
    this.destroyMini();
    const sheet = this.sheet;
    const view = sheet?.getDataView();
    if (!sheet || !view) return;
    const box = this.fieldPanel.getBoundingClientRect();
    let width = Math.round(box.width) - 2;
    let height = Math.round(box.height) - 2;
    if (width < 20 || height < 20) [width, height] = MINI_DEFAULT_SIZE;
    const miniHost = document.createElement('div');
    miniHost.style.width = width + 'px';
    miniHost.style.height = height + 'px';
    this.fieldPanel.append(miniHost);
    const workbook = new Workbook(miniHost, {
      sheetCount: 1,
      showHorizontalScrollbar: false,
      showVerticalScrollbar: false,
      scrollbarMaxAlign: true,
      tabStripVisible: false,
      tabNavigationVisible: false,
      grayAreaBackColor: 'white',
      scrollByPixel: true,
      allowUserDragDrop: false,
      allowUserDragFill: false,
      allowUserZoom: false,
      allowUndo: false,
      allowContextMenu: false,
    });
    this.mini = workbook;
    // The reference exposes the mini-workbook through GC.Spread.Sheets.findControl on the
    // field-panel element itself; the workbook's inner host is invisible to findControl,
    // and after the panel is destroyed the field panel answers `undefined` again
    // (probe .probe/api-sweep-item1b.json: findControl(fieldPanel) -> workbook, after
    // destroy -> undefined).
    clearWorkbookHost(miniHost);
    registerWorkbookHost(this.fieldPanel, workbook);
    const mini = workbook.getActiveSheet();
    // Mini-sheet setup observed from the reference implementation.
    mini.options.rowHeaderVisible = false;
    mini.options.colHeaderVisible = false;
    mini.options.gridline = { color: 'rgb(212, 212, 212)', showHorizontalGridline: false, showVerticalGridline: false };
    mini.options.showFormulas = true;
    mini.frozenRowCount(1);
    mini.selectionUnit(1); // rows
    mini.setColumnCount(2);
    mini.setColumnWidth(0, MINI_CHECK_WIDTH);
    mini.setColumnWidth(1, Math.max(0, width - MINI_CHECK_WIDTH));
    let updating = false;
    workbook.bind(Events.ValueChanged, (...args: unknown[]) => {
      const info = args[args.length - 1] as { sheet?: unknown; row?: number; col?: number; newValue?: unknown };
      if (updating || info.sheet !== mini) return;
      updating = true;
      try {
        if (info.col === 0 && typeof info.row === 'number') {
          const checked = info.newValue === true;
          if (info.row === 0) this.setAllVisible(checked);
          else this.setVisible(info.row - 1, checked);
        } else if (info.col === 1 && typeof info.row === 'number') {
          const value = info.newValue;
          // A formula typed into the trailing empty "+" row becomes a calculated field.
          if (info.row === mini.getRowCount() - 1 && typeof value === 'string' && value.startsWith('=')) {
            view.addColumn({ value, caption: value });
            this.summaryDrafts = [];
          }
        }
      } finally {
        this.updateMini();
        this.renderGroups();
        updating = false;
      }
    });
    // Mouse-driven field drag: the reference starts a drag on mousedown + move over a row.
    miniHost.addEventListener('mousedown', (event: MouseEvent) => {
      const canvas = miniHost.querySelector('canvas');
      if (!canvas || !event.target || !(event.target as Element).closest('canvas')) return;
      const rect = canvas.getBoundingClientRect();
      if (rect.width < 1) return;
      const row = Math.floor((event.clientY - rect.top) / MINI_ROW_HEIGHT);
      const column = event.clientX - rect.left < MINI_CHECK_WIDTH ? 0 : 1;
      // Reference: a click inside the checkbox column toggles the checkbox (handled by the
      // cell-type click pipeline), the caption column starts the field drag instead
      // (probe .probe/api-sweep-item1b.json: x=2 and x=25 toggle, x=100 never toggles).
      if (column !== 1) return;
      const field = this.fieldName(this.columns()[row - 1]);
      if (row >= 1 && row <= this.columns().length && field)
        this.pointerDrag = { field, index: row - 1, group: false, x: event.clientX, y: event.clientY, active: false };
    });
    // The reference starts with the view-name row fully selected (spanning both columns)
    // and renders selections with its gray Office-style lines instead of our defaults.
    mini.options.selectionBackColor = 'rgba(0,0,0,0)';
    mini.options.selectionBorderColor = '#242426';
    this.updateMini();
    mini.setSelection(0, 0, 1, 2);
  }

  /** Document-level drag bookkeeping shared by the mini-workbook and the group list. */
  private bindDocumentDrag(): void {
    if (this.documentDragCleanup) return;
    const move = (event: MouseEvent): void => {
      const drag = this.pointerDrag;
      if (drag && !drag.active && (Math.abs(event.clientX - drag.x) > 3 || Math.abs(event.clientY - drag.y) > 3)) drag.active = true;
    };
    const up = (event: MouseEvent): void => {
      const drag = this.pointerDrag;
      this.pointerDrag = undefined;
      if (!drag?.active || !this.sheet) return;
      const target = event.target as Element | null;
      const item = target?.closest?.('.gc-table-sheet-group-item');
      const list = target?.closest?.('.gc-table-sheet-group-list');
      if (!drag.group) {
        if (list && this.hasGroup(drag.field) === -1) {
          this.addGroup(drag.field);
          this.markMoveSpan(String(this.columns()[drag.index]?.caption ?? drag.field));
        }
      } else if (item) {
        const to = [...this.groupList.querySelectorAll('.gc-table-sheet-group-item')].indexOf(item);
        if (to >= 0 && to !== drag.index) {
          const groups = this.sheet.groupBy() as GroupEntry[];
          const next = [...groups];
          const [moved] = next.splice(drag.index, 1);
          next.splice(to, 0, moved!);
          this.selectedGroup = to;
          this.sheet.groupBy(next);
        } else this.renderGroups();
      } else if (!list && target && this.host.contains(target)) {
        this.removeGroup(drag.field);
      }
      this.renderGroups();
      this.renderSummary();
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
    this.documentDragCleanup = () => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
    };
  }

  private destroyMini(): void {
    this.mini?.destroy();
    this.mini = undefined;
    clearWorkbookHost(this.fieldPanel);
    this.fieldPanel.replaceChildren();
  }

  private fieldName(column?: ViewColumn): string {
    return String(column?.value ?? column?.name ?? '');
  }

  private columns(): ViewColumn[] {
    return (this.sheet?.getDataView()?.getColumn() as ViewColumn[] | undefined) ?? [];
  }

  /** Map a base (non-group) column index to the table-sheet viewport column. */
  private viewportColumn(index: number): number {
    return (this.sheet?._groupColumnCount() ?? 0) + index;
  }

  private setVisible(index: number, value: boolean): void {
    const sheet = this.sheet;
    const column = this.columns()[index];
    if (!sheet || !column) return;
    column.visible = value;
    sheet.setColumnVisible(this.viewportColumn(index), value);
  }

  private setAllVisible(value: boolean): void {
    this.columns().forEach((_column, index) => this.setVisible(index, value));
  }

  /** Re-sync the mini-workbook rows with the data view (values only, never resizes). */
  private updateMini(): void {
    const sheet = this.sheet;
    const mini = this.mini?.getActiveSheet();
    if (!sheet || !mini) return;
    const columns = this.columns();
    const rows = columns.length + 1;
    if (mini.getRowCount() !== rows) mini.setRowCount(rows);
    const checkbox = new CheckBox();
    checkbox.mode('modern'); // the reference renders the mini-sheet checkboxes in modern mode
    const checkStyle = new Style();
    checkStyle.hAlign = 2;
    checkStyle.vAlign = 2;
    const labelStyle = new Style();
    labelStyle.vAlign = 2;
    labelStyle.textIndent = 3;
    mini.setRowHeight(0, MINI_ROW_HEIGHT);
    mini.setStyle(0, 0, checkStyle);
    mini.setStyle(0, 1, labelStyle);
    mini.setCellType(0, 0, checkbox);
    // Reference select-all checkbox: checked whenever ANY field is visible (probe
    // .probe/api-sweep-item1b.json: hiding one field keeps the header checkbox true;
    // a header click while mixed sets every field hidden).
    mini.setValue(0, 0, columns.length > 0 && columns.some(column => column.visible !== false));
    mini.setFormula(0, 1, null);
    mini.setValue(0, 1, sheet.getDataView()?.name ?? this.name);
    const showSource = this.options.showSource ?? 0;
    columns.forEach((column, index) => {
      const row = index + 1;
      mini.setRowHeight(row, MINI_ROW_HEIGHT);
      mini.setStyle(row, 0, checkStyle);
      mini.setStyle(row, 1, labelStyle);
      mini.setCellType(row, 0, checkbox);
      mini.setValue(row, 0, sheet.getColumnVisible(this.viewportColumn(index)));
      const field = this.fieldName(column);
      const caption = String(column.caption ?? field);
      if (field.startsWith('=')) {
        const formula = field.slice(1);
        try { mini.setFormula(row, 1, formula); } catch { mini.setValue(row, 1, field); }
      } else {
        mini.setFormula(row, 1, null);
        const text = showSource === 3 || showSource === 1 ? `${caption} (${field})` : caption;
        if (showSource) mini.setValue(row, 1, text);
        else mini.setValue(row, 1, { richText: [{ text }], text });
      }
    });
  }

  /** "+" button in the field header: append an editable calculated-field row. */
  private addCalculateRow(): void {
    const mini = this.mini?.getActiveSheet();
    if (!mini) return;
    const row = mini.getRowCount();
    mini.setRowCount(row + 1);
    mini.setRowHeight(row, MINI_ROW_HEIGHT);
    mini.setSelection(row, 1, 1, 1);
  }

  private groups(): GroupEntry[] {
    return (this.sheet?.groupBy() ?? []) as GroupEntry[];
  }

  private hasGroup(field: string): number {
    return this.groups().findIndex(group => group.field === field);
  }

  private addGroup(field: string): void {
    if (!this.sheet) return;
    const groups = this.groups();
    this.selectedGroup = groups.length;
    this.summaryDrafts = [];
    const caption = this.columns().find(column => this.fieldName(column) === field)?.caption;
    this.sheet.groupBy([...groups, caption ? { field, caption } : { field }]);
  }

  /** Hidden span left behind by a field-to-group drag (matches the reference DOM). */
  private markMoveSpan(caption: string): void {
    let span = this.root.querySelector<HTMLSpanElement>('.gc-table-sheet-move-span');
    if (!span) {
      span = document.createElement('span');
      span.className = 'gc-table-sheet-move-span';
      span.style.display = 'none';
      this.root.append(span);
    }
    span.textContent = caption;
  }

  private removeGroup(field: string): void {
    const sheet = this.sheet;
    if (!sheet) return;
    const groups = this.groups();
    const index = groups.findIndex(group => group.field === field);
    sheet.groupBy(groups.filter(group => group.field !== field));
    if (index >= 0 && this.selectedGroup >= this.groups().length) this.selectedGroup = 0;
  }

  private renderGroups(): void {
    const sheet = this.sheet;
    this.groupList.replaceChildren();
    if (!sheet) return;
    const groups = this.groups();
    if (!groups.length) {
      const tip = document.createElement('span');
      tip.className = 'gc-table-sheet-group-tip';
      tip.setAttribute('role', 'option');
      tip.textContent = ttext('dragGroups', 'Drag here to set row groups');
      this.groupList.append(tip);
      this.selectedGroup = 0;
      return;
    }
    if (this.selectedGroup >= groups.length) this.selectedGroup = 0;
    groups.forEach((group, index) => {
      const item = document.createElement('li');
      item.className = 'gc-table-sheet-group-item' + (index === this.selectedGroup ? ' selected' : '');
      item.setAttribute('role', 'option');
      item.setAttribute('aria-label', String(group.caption ?? group.field));
      item.setAttribute('aria-selected', String(index === this.selectedGroup));
      item.tabIndex = index === this.selectedGroup ? 0 : -1;
      const label = document.createElement('span');
      label.className = 'gc-table-sheet-group-item-label';
      label.textContent = String(group.caption ?? group.field);
      const remove = document.createElement('span');
      remove.className = 'gc-table-sheet-group-item-remove';
      remove.setAttribute('role', 'button');
      remove.setAttribute('aria-label', ttext('remove', 'Remove'));
      remove.title = ttext('remove', 'Remove');
      remove.addEventListener('click', event => {
        event.stopPropagation();
        this.removeGroup(group.field);
        this.renderGroups();
        this.renderSummary();
      });
      item.append(label, remove);
      const input = document.createElement('input');
      input.className = 'gc-table-sheet-group-input';
      input.setAttribute('aria-label', ttext('groupName', 'Group Name'));
      item.addEventListener('click', () => {
        this.selectedGroup = index;
        this.summaryDrafts = [];
        this.renderGroups();
        this.renderSummary();
      });
      item.addEventListener('dblclick', () => this.beginRename(input, group, index));
      item.addEventListener('keydown', event => {
        if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
        event.preventDefault();
        const next = Math.min(Math.max(this.selectedGroup + (event.key === 'ArrowDown' ? 1 : -1), 0), groups.length - 1);
        this.selectedGroup = next;
        this.summaryDrafts = [];
        this.renderGroups();
        this.renderSummary();
        this.groupList.querySelectorAll<HTMLElement>('.gc-table-sheet-group-item')[next]?.focus();
      });
      // HTML5 drag support (kept for programmatic and assistive drag flows).
      item.addEventListener('dragstart', () => { this.drag = { field: group.field, index, group: true }; });
      item.addEventListener('dragend', () => { this.drag = undefined; });
      item.addEventListener('dragover', event => { if (this.drag?.group) event.preventDefault(); });
      item.addEventListener('drop', event => {
        event.preventDefault();
        event.stopPropagation();
        if (!this.drag) return;
        if (this.drag.group) {
          if (this.drag.index !== index) {
            const next = [...groups];
            const [moved] = next.splice(this.drag.index, 1);
            next.splice(index, 0, moved!);
            sheet.groupBy(next);
          }
        } else if (this.hasGroup(this.drag.field) === -1) {
          this.addGroup(this.drag.field);
          this.markMoveSpan(String(this.columns()[this.drag.index]?.caption ?? this.drag.field));
        }
        this.drag = undefined;
        this.renderGroups();
        this.renderSummary();
      });
      item.addEventListener('mousedown', event => {
        if ((event.target as Element).classList.contains('gc-table-sheet-group-item-remove')) return;
        this.pointerDrag = { field: group.field, index, group: true, x: event.clientX, y: event.clientY, active: false };
      });
      this.groupList.append(item, input);
    });
  }

  private beginRename(input: HTMLInputElement, group: GroupEntry, index: number): void {
    const groups = this.groups();
    input.value = String(group.caption ?? group.field);
    input.style.display = 'inline-block';
    input.focus();
    const finish = (commit: boolean): void => {
      input.style.display = 'none';
      if (commit) this.sheet?.groupBy(groups.map((entry, i) => i === index ? { ...entry, caption: input.value } : entry));
      this.renderGroups();
      this.renderSummary();
    };
    input.onblur = () => finish(true);
    input.onkeydown = event => {
      if (event.key === 'Enter') { event.preventDefault(); input.blur(); }
      if (event.key === 'Escape') { event.preventDefault(); finish(false); }
    };
  }

  /** Group summary editor shown under the group list for the selected group. */
  private renderSummary(): void {
    this.summary.replaceChildren();
    if (!this.sheet || !this.groups().length) return;
    const group = this.groups()[Math.min(this.selectedGroup, this.groups().length - 1)]!;
    const header = document.createElement('div');
    header.className = 'gc-table-sheet-summary-header';
    const headerLabel = document.createElement('span');
    headerLabel.className = 'gc-table-sheet-summary-label';
    headerLabel.textContent = group.field;
    const addFunction = document.createElement('span');
    addFunction.className = 'gc-table-sheet-summary-function';
    addFunction.title = ttext('addSummary', 'Add Summary Field');
    const removeAll = document.createElement('span');
    removeAll.className = 'gc-table-sheet-summary-remove';
    removeAll.title = ttext('removeAll', 'Remove All');
    addFunction.addEventListener('click', () => {
      this.summaryDrafts = [...this.summaryDrafts, { formula: '' }];
      this.renderSummary();
    });
    removeAll.addEventListener('click', () => {
      this.summaryDrafts = [];
      this.writeSummaries(group.field, () => []);
      this.renderSummary();
    });
    header.append(headerLabel, addFunction, removeAll);
    this.summary.append(header);

    const committed = (group.summaryFields ?? []) as SummaryField[];
    const summaries = [...committed, ...this.summaryDrafts];
    const list = document.createElement('ul');
    list.className = 'gc-table-sheet-summary-list-container';
    summaries.forEach((summary, summaryIndex) => {
      const item = document.createElement('li');
      item.className = 'gc-table-sheet-summary-item';
      const makeRow = (kind: 'formula' | 'caption' | 'slice', text: string, value: string): HTMLElement => {
        const row = document.createElement('div');
        row.className = `gc-table-sheet-summary-item-${kind}`;
        const label = document.createElement('span');
        label.className = 'gc-table-sheet-summary-item-label';
        label.textContent = text;
        const input = document.createElement('input');
        input.className = `gc-table-sheet-summary-item-input-${kind}`;
        input.setAttribute('aria-label', text);
        input.tabIndex = -1;
        input.value = value;
        input.addEventListener('change', () => this.commitSummary(group.field, summaryIndex, kind, input.value));
        row.append(label, input);
        return row;
      };
      const formulaRow = makeRow('formula', ttext('formula', 'Formula'), summary.formula ?? '');
      const removeIcon = document.createElement('span');
      removeIcon.className = 'gc-table-sheet-summary-item-remove-icon';
      removeIcon.title = ttext('remove', 'Remove');
      removeIcon.addEventListener('click', () => {
        if (summaryIndex < committed.length) {
          this.writeSummaries(group.field, list0 => list0.filter((_, i) => i !== summaryIndex));
        } else {
          this.summaryDrafts = this.summaryDrafts.filter((_, i) => i !== summaryIndex - committed.length);
          this.renderSummary();
        }
      });
      formulaRow.append(removeIcon);
      item.append(
        formulaRow,
        makeRow('caption', ttext('caption', 'Caption'), String(summary.caption ?? summary.formula ?? '')),
        makeRow('slice', ttext('slice', 'Slice'), typeof summary.slice === 'string' ? summary.slice : ''),
      );
      list.append(item);
    });
    this.summary.append(list);
  }

  private commitSummary(field: string, index: number, kind: 'formula' | 'caption' | 'slice', value: string): void {
    const committed = (this.groups().find(group => group.field === field)?.summaryFields ?? []) as SummaryField[];
    if (index >= committed.length) {
      // Editing a draft: the first non-empty formula moves it into the model.
      if (kind !== 'formula' || !value) return;
      this.summaryDrafts = this.summaryDrafts.slice(1);
      this.writeSummaries(field, list0 => [...list0, { formula: value, caption: value }]);
      return;
    }
    this.writeSummaries(field, list0 => list0.map((entry, i) => {
      if (i !== index) return entry;
      const next: SummaryField = { ...entry };
      if (kind === 'formula') next.formula = value;
      if (kind === 'caption') next.caption = value || next.formula;
      if (kind === 'slice') next.slice = value || undefined;
      return next;
    }));
  }

  private writeSummaries(field: string, update: (summaries: SummaryField[]) => SummaryField[]): void {
    const sheet = this.sheet;
    if (!sheet) return;
    sheet.groupBy(this.groups().map(entry => entry.field === field
      ? { ...entry, summaryFields: update((entry.summaryFields ?? []) as SummaryField[]) }
      : entry));
  }

  detach(): void {
    this.unsubscribe?.();
    this.unsubscribeSheet?.();
    this.unsubscribe = undefined;
    this.unsubscribeSheet = undefined;
    this.sheet = undefined;
    this.drag = undefined;
    this.pointerDrag = undefined;
    this.destroyMini();
    this.documentDragCleanup?.();
    this.documentDragCleanup = undefined;
    this.host.removeEventListener('dragover', this.hostDragOver);
    this.host.removeEventListener('drop', this.hostDrop);
    this.resize?.disconnect();
    this.resize = undefined;
    this.host.replaceChildren();
  }

  destroy(): void {
    this.detach();
    // Trial keeps the host key with a null value after panel destroy: findControl(host)
    // then returns null, not undefined (.probe/tablesheet-comparison.json findControlHosts).
    TableSheetPanel.controls.set(this.host, null);
  }

  static findControl(host: HTMLElement | string): TableSheetPanel | null | undefined {
    const element = typeof host === 'string' ? document.getElementById(host) : host;
    return element ? this.controls.get(element) : undefined;
  }

  /** Internal: the embedded field mini-workbook (used by tests and comparison tooling). */
  _miniWorkbook(): Workbook | undefined {
    return this.mini;
  }
}
