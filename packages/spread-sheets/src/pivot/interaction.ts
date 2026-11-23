/**
 * Pivot area interaction (TASK 42 item 2).
 * Wraps the core `Interaction` so clicks on the pivot decorations drawn by
 * hooks.ts toggle expand/collapse or open the label/value filter dropdown
 * ("Select field" panel, like the trial), and double-clicks on data cells
 * drill down (show details) into a new worksheet. Installed from
 * `bindPivotHooks` (src/index.ts registers the class).
 */
import type { PivotTable } from './pivot-table.js';
import type { LayoutCell } from './layout.js';
import { PivotTableFieldType } from './types.js';
import type { PivotCaptionFilterOperator, PivotValueFilterOperator } from './types.js';
import { asRecord } from '../object-access.js';
import { ltext } from '../localization.js';

interface Rect { x: number; y: number; width: number; height: number }

interface PivotView {
  sheet?: object;
  cellRect(row: number, col: number): Rect;
  root: HTMLElement;
  clientWidth?: number;
  width: number;
}

interface InteractionPatched {
  view: PivotView & { sheet?: { pivotTables?: { _list(): PivotTable[] } } & object };
  point(event: MouseEvent): { x: number; y: number };
}

interface PivotHit { table: PivotTable; cell: LayoutCell; rect: Rect; kind: 'drill' | 'filter' }

/** Hit math must match the drawing geometry in hooks.ts. */
export function pivotHit(self: InteractionPatched, x: number, y: number): PivotHit | null {
  const manager = self.view.sheet?.pivotTables;
  if (!manager?._list) return null;
  for (const table of manager._list()) {
    const anchor = table._position();
    for (const cell of table._layoutCells()) {
      if (!cell.filterButton && cell.expand === undefined) continue;
      const rect = self.view.cellRect(anchor.row + cell.row, anchor.col + cell.col);
      if (cell.expand !== undefined) {
        const bx = rect.x + (cell.drillOffset ?? 11);
        const by = rect.y + rect.height / 2 - 4;
        if (x >= bx - 2 && x <= bx + 11 && y >= by - 2 && y <= by + 11)
          return { table, cell, rect, kind: 'drill' };
      }
      if (cell.filterButton && rect.width >= 6 && rect.height >= 6) {
        const boxWidth = Math.min(14, Math.max(9, rect.width - 8));
        const boxHeight = Math.min(14, Math.max(9, rect.height - 6));
        const value = readCell(self, anchor.row + cell.row, anchor.col + cell.col);
        const width = String(value ?? '').length * 7;
        const after = Math.max(rect.x + 4, Math.min(rect.x + Math.min(width + 7, rect.width - 17), rect.x + rect.width - 17));
        const by = Math.round(rect.y + (rect.height - boxHeight) / 2);
        if (x >= after && x <= after + boxWidth && y >= by && y <= by + boxHeight)
          return { table, cell, rect, kind: 'filter' };
      }
    }
  }
  return null;
}

function readCell(self: InteractionPatched, row: number, col: number): unknown {
  const sheet = self.view.sheet as { getValue?(r: number, c: number): unknown } | undefined;
  try { return sheet?.getValue?.(row, col); } catch { return undefined; }
}

/** The filter-field name a header button belongs to. */
function fieldForButtonCell(table: PivotTable, cell: LayoutCell): string | null {
  const fields = table.getFieldsByArea();
  const rowFields = fields.filter(f => f.pivotArea === PivotTableFieldType.rowField);
  const colFields = fields.filter(f => f.pivotArea === PivotTableFieldType.columnField);
  const pageFields = fields.filter(f => f.pivotArea === PivotTableFieldType.filterField);
  if (cell.kind === 'pageValue') return pageFields[0]?.fieldName ?? null;
  if (cell.kind === 'colHeader') return colFields[cell.level ?? 0]?.fieldName ?? colFields[0]?.fieldName ?? null;
  if (cell.kind === 'corner') return rowFields[rowFields.length - 1]?.fieldName ?? null;
  return null;
}

/* ---------------------------------------------------------------- dropdown */

const FONT = '13px Calibri, Candara, Segoe, "Segoe UI", Optima, Arial, sans-serif';

function styleDropdown(panel: HTMLElement): void {
  Object.assign(panel.style, {
    position: 'absolute', zIndex: '90', background: '#ffffff', border: '1px solid #c0c0c0',
    boxShadow: '2px 3px 6px rgba(0,0,0,0.25)', font: FONT, color: '#333', padding: '6px 8px',
    boxSizing: 'border-box', userSelect: 'none', lineHeight: '22px', minWidth: '240px',
  } as CSSStyleDeclaration);
}

function dropRow(text: string, opts: { disabled?: boolean; indent?: number; icon?: string } = {}): HTMLDivElement {
  const row = document.createElement('div');
  row.style.cssText = `padding:2px 6px;cursor:${opts.disabled ? 'default' : 'pointer'};color:${opts.disabled ? '#a6a6a6' : '#333'};`
    + 'white-space:nowrap;display:flex;align-items:center;gap:6px;';
  if (opts.indent) row.style.paddingLeft = `${6 + opts.indent * 16}px`;
  if (opts.icon) {
    const icon = document.createElement('span');
    icon.textContent = opts.icon;
    icon.style.cssText = 'width:16px;text-align:center;color:#5b7fae;font-size:11px;';
    row.append(icon);
  }
  const label = document.createElement('span');
  label.textContent = text;
  row.append(label);
  if (!opts.disabled)
    row.addEventListener('mouseenter', () => { row.style.background = '#e8f0f8'; });
  row.addEventListener('mouseleave', () => { row.style.background = ''; });
  return row;
}

function addSubmenuArrow(row: HTMLElement): void {
  const arrow = document.createElement('span');
  arrow.textContent = '▸';
  arrow.style.cssText = 'margin-left:auto;color:#666;';
  row.append(arrow);
}

const ptext = (key: string, fallback: string, ...args: (string | number)[]): string => ltext(`pivotMenu.${key}`, fallback, ...args);
/** [resource key, built-in English caption, condition operator code]. */
const CAPTION_OPERATORS: [string, string, number][] = [
  ['equals', 'Equals', 0], ['doesNotEqual', 'Does Not Equal', 1], ['beginsWith', 'Begins With', 2], ['doesNotBeginWith', 'Does Not Begin With', 3],
  ['endsWith', 'Ends With', 4], ['doesNotEndWith', 'Does Not End With', 5], ['contains', 'Contains', 6], ['doesNotContain', 'Does Not Contain', 7],
];
const VALUE_OPERATORS: [string, string, number][] = [
  ['equals', 'Equals', 0], ['doesNotEqual', 'Does Not Equal', 1], ['greaterThan', 'Greater Than', 2], ['greaterThanOrEqual', 'Greater Than Or Equal To', 3],
  ['lessThan', 'Less Than', 4], ['lessThanOrEqual', 'Less Than Or Equal To', 5], ['between', 'Between', 6], ['notBetween', 'Not Between', 7],
];

/** The "Select field" filter/sort dropdown of a pivot header button. */
export function openPivotFilterDropdown(table: PivotTable, fieldName: string, host: HTMLElement, x: number, y: number): void {
  const panel = document.createElement('div');
  panel.className = 'gc-pivot-filter-panel opensheets-pivot-filter';
  styleDropdown(panel);
  panel.style.left = `${Math.min(x, (host.clientWidth ?? host.offsetWidth) - 260)}px`;
  panel.style.top = `${y}px`;

  const title = document.createElement('div');
  title.textContent = ptext('selectField', 'Select field');
  title.style.cssText = 'padding:2px 6px 4px;';
  const select = document.createElement('select');
  select.style.cssText = 'width:calc(100% - 12px);margin:0 6px 4px;font:' + FONT + ';';
  for (const info of table.getFieldsByArea()) {
    if (info.pivotArea === PivotTableFieldType.valueField) continue;
    const option = document.createElement('option');
    option.value = option.textContent = info.fieldName;
    select.append(option);
  }
  select.value = fieldName;
  panel.append(title, select);

  let openSub: HTMLElement | null = null;
  const addRow = (text: string, icon: string | undefined, indent: number, handler: (() => void) | null): HTMLDivElement => {
    const row = dropRow(text, { disabled: !handler, icon, indent });
    if (handler) row.addEventListener('click', handler);
    panel.append(row);
    return row;
  };
  addRow(ptext('sortAsc', 'Sort A to Z'), 'A\u2193', 0, () => { table.sort(select.value, { sortType: 0 /* asc */ }); panel.remove(); });
  addRow(ptext('sortDesc', 'Sort Z to A'), 'Z\u2191', 0, () => { table.sort(select.value, { sortType: 1 /* desc */ }); panel.remove(); });
  addRow(ptext('moreSort', 'More Sort Options...'), undefined, 1, () => openMoreSortDialog(table, select.value, panel, host));
  const hasFilter = (name: string): boolean => {
    const label = table.labelFilter(name) as { textItem?: { isAll: boolean } } | undefined;
    const value = table.valueFilter(name) as unknown;
    return !!(label && label.textItem && !label.textItem.isAll) || !!value;
  };
  const clearRow = addRow(ptext('clearFilterFrom', 'Clear Filter From "{0}"', select.value), '⧩', 1, () => {
    if (!hasFilter(select.value)) return;
    table.labelFilter(select.value, null);
    table.valueFilter(select.value, null);
    panel.remove();
  });
  const refreshClear = (): void => {
    const on = hasFilter(select.value);
    clearRow.style.color = on ? '#333' : '#a6a6a6';
    clearRow.style.cursor = on ? 'pointer' : 'default';
  };
  const labelRow = addRow(ptext('labelFilters', 'Label Filters'), undefined, 1, null);
  addSubmenuArrow(labelRow);
  const valueRow = addRow(ptext('valueFilters', 'Value Filters'), undefined, 1, null);
  addSubmenuArrow(valueRow);
  const submenuFor = (kind: 'label' | 'value'): (() => void) => () => {
    openSub?.remove();
    const submenu = document.createElement('div');
    submenu.className = 'gc-pivot-filter-submenu opensheets-pivot-filter';
    styleDropdown(submenu);
    submenu.style.left = `${panel.offsetWidth - 6}px`;
    submenu.style.top = `${(kind === 'label' ? labelRow : valueRow).offsetTop}px`;
    for (const [opKey, caption, op] of (kind === 'label' ? CAPTION_OPERATORS : VALUE_OPERATORS)) {
      const text = ptext(`operator.${opKey}`, caption);
      const row = dropRow(text, {});
      row.addEventListener('click', () => {
        const value = window.prompt(ptext('enterValue', '{0} — enter value:', text), kind === 'value' ? '100' : 'Mom');
        if (value === null) return;
        if (kind === 'label')
          table.labelFilter(select.value, { conType: 1 /* caption */, val: [value], operator: op as PivotCaptionFilterOperator } as never);
        else {
          const valueFields = table.getFieldsByArea(PivotTableFieldType.valueField);
          table.valueFilter(select.value, {
            conditionByName: valueFields[0]?.fieldName,
            condition: { conType: 2 /* value */, val: [Number(value)], operator: op as PivotValueFilterOperator },
          } as never);
        }
        panel.remove();
      });
      submenu.append(row);
    }
    panel.append(submenu);
    openSub = submenu;
  };
  labelRow.addEventListener('mouseenter', submenuFor('label'));
  valueRow.addEventListener('mouseenter', submenuFor('value'));

  const search = document.createElement('input');
  search.placeholder = ptext('search', 'Search');
  search.style.cssText = 'width:calc(100% - 12px);margin:6px;padding:3px 4px;font:' + FONT + ';box-sizing:border-box;';
  panel.append(search);
  const checkRow = document.createElement('div');
  checkRow.style.cssText = 'display:flex;gap:14px;padding:0 6px;';
  const mkCheckAll = (text: string, mark: string, on: boolean): HTMLSpanElement => {
    const span = document.createElement('span');
    span.style.cssText = 'cursor:pointer;display:flex;align-items:center;gap:4px;';
    const icon = document.createElement('span');
    icon.textContent = mark;
    icon.style.cssText = 'color:' + (on ? '#2e8b57' : '#c33') + ';font-weight:bold;';
    const label = document.createElement('span');
    label.textContent = text;
    span.append(icon, label);
    span.addEventListener('click', () => {
      list.querySelectorAll('input[type=checkbox]').forEach(cb => { (cb as HTMLInputElement).checked = on; });
    });
    return span;
  };
  checkRow.append(mkCheckAll(ptext('checkAll', 'Check All'), '✔', true), mkCheckAll(ptext('uncheckAll', 'Uncheck All'), '✖', false));
  panel.append(checkRow);

  const list = document.createElement('div');
  list.style.cssText = 'max-height:180px;overflow:auto;margin:6px;padding:2px 4px;border:1px solid #d8d8d8;';
  const render = (): void => {
    list.textContent = '';
    const filter = search.value.trim().toLowerCase();
    const previous = table.labelFilter(select.value) as { textItem?: { isAll: boolean; list: string[] } } | undefined;
    const selected = previous?.textItem && !previous.textItem.isAll ? new Set(previous.textItem.list.map(String)) : null;
    const items = (table.getItemsByField(select.value, true) ?? []) as unknown[];
    for (const item of items) {
      const text = String(item);
      if (filter && !text.toLowerCase().includes(filter)) continue;
      const rowLabel = document.createElement('label');
      rowLabel.style.cssText = 'display:flex;align-items:center;gap:6px;padding:1px 2px;';
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.checked = selected ? selected.has(text) : true;
      box.value = text;
      rowLabel.append(box, document.createTextNode(text));
      list.append(rowLabel);
    }
    refreshClear();
  };
  search.addEventListener('input', render);
  select.addEventListener('change', render);
  render();
  panel.append(list);

  const buttons = document.createElement('div');
  buttons.style.cssText = 'display:flex;justify-content:flex-end;gap:8px;padding:4px 6px;';
  const mkButton = (text: string, primary: boolean): HTMLButtonElement => {
    const button = document.createElement('button');
    button.textContent = text;
    button.style.cssText = 'font:' + FONT + ';padding:2px 16px;cursor:pointer;'
      + (primary ? 'border:2px solid #3c89d9;background:#fff;color:#333;' : 'border:1px solid #adadad;background:#e4e4e4;color:#333;');
    return button;
  };
  const ok = mkButton(ptext('ok', 'OK'), true);
  ok.addEventListener('click', () => {
    const boxes = [...list.querySelectorAll('input[type=checkbox]')] as HTMLInputElement[];
    const all = boxes.length > 0 && boxes.every(box => box.checked);
    const none = boxes.length > 0 && boxes.every(box => !box.checked);
    if (all) table.labelFilter(select.value, null);
    else if (!none) table.labelFilter(select.value, { textItem: { list: boxes.filter(b => b.checked).map(b => b.value), isAll: false } });
    else table.labelFilter(select.value, { textItem: { list: [], isAll: false } });
    panel.remove();
  });
  const cancel = mkButton(ptext('cancel', 'Cancel'), false);
  cancel.addEventListener('click', () => panel.remove());
  buttons.append(ok, cancel);
  panel.append(buttons);
  host.append(panel);
  // Like the trial, a click outside the panel closes it.
  setTimeout(() => {
    const away = (e: Event): void => {
      if (!panel.contains(e.target as Node)) {
        panel.remove();
        document.removeEventListener('pointerdown', away, true);
      }
    };
    document.addEventListener('pointerdown', away, true);
  }, 0);
}

function openMoreSortDialog(table: PivotTable, fieldName: string, panel: HTMLElement, host: HTMLElement): void {
  panel.querySelector('.gc-pivot-sort-dialog')?.remove();
  const dialog = document.createElement('div');
  dialog.className = 'gc-pivot-sort-dialog opensheets-pivot-filter';
  styleDropdown(dialog);
  dialog.style.left = '40px';
  dialog.style.top = '60px';
  dialog.style.width = '210px';
  const title = document.createElement('div');
  title.textContent = ptext('sortBy', 'Sort "{0}" By', fieldName);
  title.style.cssText = 'padding:4px 6px;';
  dialog.append(title);
  const makeRadio = (labelText: string, checked: boolean): HTMLLabelElement => {
    const label = document.createElement('label');
    label.style.cssText = 'display:flex;align-items:center;gap:6px;padding:2px 10px;';
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = `pivot-sort-${fieldName}`;
    input.checked = checked;
    label.append(input, document.createTextNode(labelText));
    return label;
  };
  const current = ((table.sort as (n: string, i?: unknown) => unknown)(fieldName) as { sortType?: number } | undefined)?.sortType ?? 0;
  const manual = makeRadio(ptext('sortManual', 'Manual'), current === 2);
  const asc = makeRadio(ptext('sortAscending', 'Ascending (A to Z)'), current === 0);
  const desc = makeRadio(ptext('sortDescending', 'Descending (Z to A)'), current === 1);
  dialog.append(manual, asc, desc);
  const buttons = document.createElement('div');
  buttons.style.cssText = 'display:flex;justify-content:flex-end;gap:8px;padding:6px;';
  const ok = document.createElement('button');
  ok.textContent = ptext('ok', 'OK');
  ok.style.cssText = 'font:' + FONT + ';padding:2px 16px;cursor:pointer;border:1px solid #adadad;background:#e4e4e4;';
  ok.addEventListener('click', () => {
    const sortType = asc.querySelector('input')!.checked ? 0 : desc.querySelector('input')!.checked ? 1 : 2;
    if (sortType === 2)
      table.sort(fieldName, { sortType: 2, customSortList: ((table.getItemsByField(fieldName) ?? []) as unknown[]).map(String) });
    else table.sort(fieldName, { sortType });
    dialog.remove();
    panel.remove();
  });
  const cancel = document.createElement('button');
  cancel.textContent = ptext('cancel', 'Cancel');
  cancel.style.cssText = ok.style.cssText;
  cancel.addEventListener('click', () => dialog.remove());
  buttons.append(ok, cancel);
  dialog.append(buttons);
  host.append(dialog);
}

/* -------------------------------------------------------------- installation */

let installed = false;

export function installPivotInteraction(InteractionClass: { prototype: Record<string, unknown> }): void {
  if (installed) return;
  installed = true;
  const proto = asRecord(InteractionClass.prototype);
  const originalPointerDown = proto.pointerDown as (event: Event) => void;
  const originalDoubleClick = proto.doubleClick as (event: Event) => void;
  proto.pointerDown = function (this: InteractionPatched, event: Event): void {
    const mouse = event as MouseEvent;
    if (mouse.button === 0 || mouse.button === undefined) {
      const { x, y } = this.point(mouse);
      const hit = pivotHit(this, x, y);
      if (hit) {
        event.stopPropagation();
        event.preventDefault();
        if (hit.kind === 'drill') {
          if (hit.cell.drillField && hit.cell.drillItem !== undefined)
            hit.table.collapse(hit.cell.drillField, hit.cell.drillItem, !(hit.cell.collapsed ?? false));
        } else {
          const fieldName = fieldForButtonCell(hit.table, hit.cell);
          if (fieldName)
            openPivotFilterDropdown(hit.table, fieldName, this.view.root, hit.rect.x, hit.rect.y + hit.rect.height + 1);
        }
        return;
      }
    }
    originalPointerDown.call(this, event);
  };
  proto.doubleClick = function (this: InteractionPatched, event: Event): void {
    const mouse = event as MouseEvent;
    const { x, y } = this.point(mouse);
    const manager = this.view.sheet?.pivotTables;
    if (manager?._list) {
      const hit = pivotHitValue(manager._list(), this, x, y);
      if (hit) {
        event.stopPropagation();
        hit.table._showDetails(hit.r, hit.c);
        return;
      }
    }
    originalDoubleClick.call(this, event);
  };
}

function pivotHitValue(tables: PivotTable[], self: InteractionPatched, x: number, y: number): { table: PivotTable; r: number; c: number } | null {
  for (const table of tables) {
    const anchor = table._position();
    for (const cell of table._layoutCells()) {
      if (!cell.node) continue;
      if (cell.kind !== 'value' && cell.kind !== 'subtotalValue' && cell.kind !== 'grandValue') continue;
      const rect = self.view.cellRect(anchor.row + cell.row, anchor.col + cell.col);
      if (x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height)
        return { table, r: anchor.row + cell.row, c: anchor.col + cell.col };
    }
  }
  return null;
}
