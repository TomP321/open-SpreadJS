import type { Worksheet } from '../model.js';
import type { RowFilterBase } from './filters.js';
import { Condition } from './conditions.js';
import { GC } from '../generated/enums.js';
import { menuIcon } from './menu-icons.js';
import { resolveColor } from '../colors.js';
const CF = GC.Spread.Sheets.ConditionalFormatting;
const operators = ['equals', 'does not equal', 'is greater than', 'is greater than or equal to', 'is less than', 'is less than or equal to', 'begins with', 'does not begin with', 'ends with', 'does not end with', 'contains', 'does not contain'];
function comparison(operator: number, value: string, kind: string): Condition {
  const numeric = [CF.ComparisonOperators.equalsTo, CF.ComparisonOperators.notEqualsTo, CF.ComparisonOperators.greaterThan, CF.ComparisonOperators.greaterThanOrEqualsTo, CF.ComparisonOperators.lessThan, CF.ComparisonOperators.lessThanOrEqualsTo];
  const text = [CF.TextCompareType.beginsWith, CF.TextCompareType.doesNotBeginWith, CF.TextCompareType.endsWith, CF.TextCompareType.doesNotEndWith, CF.TextCompareType.contains, CF.TextCompareType.doesNotContain];
  if (operator >= 6) return new Condition(CF.ConditionType.textCondition, { compareType: text[operator - 6], expected: value });
  return new Condition(CF.ConditionType.cellValueCondition, { compareType: numeric[operator], expected: kind === 'Number' && value !== '' ? Number(value) : kind === 'Date' ? new Date(value) : value });
}
export function filterMenu(sheet: Worksheet, filter: RowFilterBase, column: number, title: string, close: () => void, mount: (element: HTMLElement) => void): HTMLElement {
  const root = document.createElement('div'); root.className = 'opensheets-filter-menu gc-filter-dialog-style'; root.setAttribute('role', 'dialog'); root.setAttribute('aria-label', `Filter ${title}`); root.tabIndex = -1;
  const range = filter.range!;
  const values = new Map<string, unknown>();
  for (let row = range.row; row < range.row + range.rowCount; row++) { const value = sheet.getValue(row, range.col + column); values.set(value instanceof Date ? value.toISOString() : String(value ?? ''), value); }
  const sorted = [...values].sort((a, b) => typeof a[1] === 'number' && typeof b[1] === 'number' ? a[1] - b[1] : a[0].localeCompare(b[0]));
  const kind = sorted.some(([, v]) => v instanceof Date) ? 'Date' : sorted.some(([, v]) => typeof v === 'number') ? 'Number' : 'Text';
  const selected = new Set(sorted.filter(([, value]) => !filter.isFiltered(column) || filter.getFilterItems(column).some(condition => {
    const json = condition.toJSON?.() as { conType?: number; expected?: unknown } | undefined;
    // The trial's list dialog treats an area condition with a comma-joined
    // string as an empty selection (only an array marks values as selected).
    if (json?.conType === CF.ConditionType.areaCondition && typeof json.expected === 'string') return false;
    return condition.evaluate(sheet, range.row, range.col + column, value);
  })).map(([key]) => key));
  const apply = (conditions: Condition[]) => { filter.removeFilterItems(column); filter.addFilterItem(column, conditions); filter.filter(column); close(); };
  const row = (label: string, icon?: string, action?: () => void, disabled = false) => {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'opensheets-filter-command'; const caption = document.createElement('span'); caption.textContent = label; button.append(caption); button.disabled = disabled; button.setAttribute('role', 'menuitem');
    if (icon) button.prepend(menuIcon(icon, /clear|filter/i.test(icon) ? 18 : 16));
    if (action) button.addEventListener('click', action); root.append(button); return button;
  };
  const submenu = (button: HTMLButtonElement, items: { label: string; action: () => void; color?: string; heading?: string }[]) => {
    button.classList.add('opensheets-filter-has-submenu');
    const menu = document.createElement('div'); menu.className = 'opensheets-filter-submenu'; menu.setAttribute('role', 'menu'); menu.style.top = `${button.offsetTop}px`;
    let heading = '';
    for (const item of items) {
      if (item.heading && item.heading !== heading) {
        heading = item.heading; menu.classList.add('opensheets-filter-color-menu');
        const caption = document.createElement('div'); caption.className = 'opensheets-filter-color-caption'; caption.textContent = heading; menu.append(caption);
      }
      const b = document.createElement('div'); b.className = 'opensheets-filter-command'; b.tabIndex = 0; b.setAttribute('role', 'menuitem');
      const caption = document.createElement('span'); caption.textContent = item.label; b.append(caption); b.addEventListener('click', item.action);
      if (item.heading) b.classList.add('opensheets-filter-color-row');
      if (item.color) { const swatch = document.createElement('span'); swatch.className = 'opensheets-filter-swatch'; swatch.style.background = resolveColor(item.color); b.prepend(swatch); }
      menu.append(b);
    }
    // The trial renders its filter submenus in the viewport layer. Besides the
    // exact geometry this keeps Chromium's LCD text rendering on the same layer
    // as the reference (fixed layers are not composited with grayscale text).
    const place = () => { const r = button.getBoundingClientRect(), left = root.getBoundingClientRect().left + root.clientWidth; menu.style.left = `${left}px`; menu.style.top = `${r.top}px`; menu.style.display = 'block'; const height = menu.offsetHeight; if (r.top + height > window.innerHeight - 5) menu.style.top = `${Math.max(5, window.innerHeight - height - 5)}px`; };
    button.addEventListener('pointerenter', () => { root.querySelectorAll<HTMLElement>('.opensheets-filter-submenu').forEach(e => e.style.display = 'none'); if (!button.disabled) { place(); menu.style.display = 'block'; } });
    button.addEventListener('click', () => { if (!button.disabled) { place(); menu.style.display = 'block'; } });
    button.addEventListener('keydown', e => { if (e.key === 'ArrowRight' && !button.disabled) { e.preventDefault(); place(); menu.style.display = 'block'; menu.querySelector<HTMLElement>('[role=menuitem]')?.focus(); } });
    root.append(menu);
  };
  const visible = filter.filterDialogVisibleInfo() as Record<string, boolean>;
  if (visible.sortByValue !== false) {
    row('Sort Ascending', 'asc', () => { filter.sortColumn(column, true); close(); });
    row('Sort Descending', 'desc', () => { filter.sortColumn(column, false); close(); });
  }
  const colors = new Map<string, 'backColor' | 'foreColor'>();
  for (let r = range.row; r < range.row + range.rowCount; r++) { const style = sheet.getStyle(r, range.col + column); for (const key of ['backColor', 'foreColor'] as const) if (style && typeof style[key] === 'string') colors.set(String(style[key]), key); }
  const colorItems = (sort: boolean) => (['backColor', 'foreColor'] as const).flatMap(key => {
    const entries = [...colors].filter(([, type]) => type === key); if (!entries.length) return [];
    const heading = `${sort ? 'Sort' : 'Filter'} By ${key === 'backColor' ? 'Cell' : 'Font'} Color`;
    const action = (color: string) => () => {
      if (sort) { sheet.sortRange(range.row, range.col, range.rowCount, range.colCount, true, [{ index: column, ascending: true, [key === 'backColor' ? 'backColor' : 'fontColor']: color }]); close(); }
      else apply([new Condition(CF.ConditionType.colorCondition, { expected: color, compareType: key === 'backColor' ? 0 : 1 })]);
    };
    return [...entries.map(([color]) => ({ label: '', color, heading, action: action(color) })), { label: key === 'backColor' ? 'No Fill' : 'Automatic', color: '', heading, action: action(key === 'backColor' ? '' : '#000000') }];
  });
  if (visible.sortByColor !== false) submenu(row('Sort By Color', undefined, undefined, !colors.size), colorItems(true));
  row(`Clear Filter From "${title}"`, 'clearFilter', () => { filter.unfilter(column); close(); }, !filter.isFiltered(column));
  if (visible.filterByColor !== false) submenu(row('Filter By Color', undefined, undefined, !colors.size), colorItems(false));
  if (visible.filterByValue !== false) {
    const choices = kind === 'Text' ? ['Equals...', 'Does Not Equal...', 'Begins With...', 'Ends With...', 'Contains...', 'Does Not Contain...', 'Custom Filter...'] : kind === 'Number' ? ['Equals...', 'Does Not Equal...', 'Greater Than...', 'Greater Than Or Equal To...', 'Less Than...', 'Less Than Or Equal To...', 'Between...', 'Top 10...', 'Above Average', 'Below Average', 'Custom Filter...'] : ['Equals...', 'Before...', 'After...', 'Between...', 'Tomorrow', 'Today', 'Yesterday', 'Next Week', 'This Week', 'Last Week', 'Next Month', 'This Month', 'Last Month', 'Next Quarter', 'This Quarter', 'Last Quarter', 'Next Year', 'This Year', 'Last Year', 'Year To Date', 'All Dates in Period', 'Custom Filter...'];
    const filterButton = row(`${kind} Filters`);
    submenu(filterButton, choices.map(label => ({ label, action: () => {
      if (['Top 10...', 'Above Average', 'Below Average', 'Next Week', 'This Week', 'Last Week', 'Next Month', 'This Month', 'Last Month', 'Next Quarter', 'This Quarter', 'Last Quarter', 'Next Year', 'This Year', 'Last Year', 'Year To Date', 'All Dates in Period'].includes(label)) { console.warn(`NotImplemented: FilterMenu.${label}`); return; }
      const predefined: Record<string, number> = { 'Equals...': 0, 'Does Not Equal...': 1, 'Greater Than...': 2, 'After...': 2, 'Greater Than Or Equal To...': 3, 'Less Than...': 4, 'Before...': 4, 'Less Than Or Equal To...': 5, 'Begins With...': 6, 'Ends With...': 8, 'Contains...': 10, 'Does Not Contain...': 11 };
      if (['Today', 'Yesterday', 'Tomorrow'].includes(label)) { const date = new Date(); date.setHours(0, 0, 0, 0); date.setDate(date.getDate() + (label === 'Yesterday' ? -1 : label === 'Tomorrow' ? 1 : 0)); apply([comparison(0, date.toISOString(), kind)]); return; }
      const dialog = customFilterDialog(title, kind, sorted.map(([k]) => k), predefined[label] ?? 0, label === 'Between...', apply, close);
      mount(dialog);
    } })));
    if (kind === 'Date') {
      filterButton.parentElement?.querySelectorAll('.opensheets-filter-submenu').forEach(menu => menu.classList.add('opensheets-filter-date-menu'));
      const nested = [...root.querySelectorAll<HTMLElement>('.opensheets-filter-date-menu .opensheets-filter-command')].find(item => item.textContent === 'All Dates in Period');
      nested?.classList.add('opensheets-filter-has-nested');
    }
  }
  if (visible.listFilterArea !== false) {
    const search = document.createElement('input'); search.type = 'text'; search.placeholder = 'Search'; search.setAttribute('aria-label', 'Search'); search.className = 'opensheets-filter-search'; root.append(search);
    const actions = document.createElement('div'); actions.className = 'opensheets-filter-check-actions'; root.append(actions);
    const canvas = document.createElement('canvas'); canvas.className = 'opensheets-filter-values'; canvas.setAttribute('role', 'group'); canvas.setAttribute('aria-label', 'Filter values'); canvas.tabIndex = 0; root.append(canvas);
    let offset = 0, focus = 0;
    const matches = () => sorted.filter(([key]) => key.toLowerCase().includes(search.value.toLowerCase()));
    const draw = () => {
      const width = Math.max(100, root.clientWidth - 46), height = Math.max(80, root.clientHeight - 260), dpr = window.devicePixelRatio || 1;
      canvas.style.width = `${width}px`; canvas.style.height = `${height}px`; canvas.width = width * dpr; canvas.height = height * dpr;
      const ctx = canvas.getContext('2d'); if (!ctx) return; ctx.scale(dpr, dpr); ctx.fillStyle = 'white'; ctx.fillRect(0, 0, width, height); ctx.font = getComputedStyle(root).font; ctx.textBaseline = 'alphabetic';
      const list = matches(), rows = Math.floor((height - 2) / 20), scrollW = list.length > rows ? 22 : 0;
      offset = Math.max(0, Math.min(offset, Math.max(0, list.length - rows)));
      for (let i = offset; i < Math.min(list.length, offset + rows); i++) {
        const [key, value] = list[i], y = (i - offset) * 20;
        ctx.fillStyle = selected.has(key) ? '#000' : 'white'; ctx.fillRect(11, y + 4, 12, 12); ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.strokeRect(11.5, y + 4.5, 11, 11); if (!selected.has(key)) { ctx.strokeStyle = '#b6b6b6'; ctx.strokeRect(12.5, y + 5.5, 9, 9); }
        if (selected.has(key)) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(13, y + 10); ctx.lineTo(16, y + 13); ctx.lineTo(21, y + 7); ctx.stroke(); }
        ctx.save(); ctx.beginPath(); ctx.rect(0, y, width - scrollW, 20); ctx.clip();
        ctx.fillStyle = 'black'; ctx.fillText(value == null || key === '' ? '(Blanks)' : value instanceof Date ? sheet.getText(range.row + [...values.keys()].indexOf(key), range.col + column) : key, 27, y + 13);
        ctx.restore();
      }
      if (scrollW) {
        const sx = width - 22;
        ctx.fillStyle = '#f6f6f6'; ctx.fillRect(sx + 1, 0, 3, height); ctx.fillRect(sx + 19, 0, 3, height);
        ctx.strokeStyle = '#ababab'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(sx + .5, 0); ctx.lineTo(sx + .5, height); ctx.moveTo(sx + 4.5, 0); ctx.lineTo(sx + 4.5, height); ctx.moveTo(sx + 18.5, 0); ctx.lineTo(sx + 18.5, height); ctx.stroke();
        ctx.fillStyle = 'white'; ctx.fillRect(sx + 5, 0, 13, height);
        ctx.fillStyle = 'white'; ctx.fillRect(sx + 5, 0, 13, 15);
        ctx.strokeStyle = '#ababab'; ctx.beginPath(); ctx.moveTo(sx + 5, 15.5); ctx.lineTo(sx + 18, 15.5); ctx.stroke();
        ctx.fillStyle = '#eaeaea'; ctx.fillRect(sx + 4, height - 16, 15, 16);
        ctx.fillStyle = '#777';
        ctx.beginPath(); ctx.moveTo(sx + 10, 10); ctx.lineTo(sx + 11.5, 5); ctx.lineTo(sx + 13, 10); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(sx + 10, height - 10); ctx.lineTo(sx + 11.5, height - 5); ctx.lineTo(sx + 13, height - 10); ctx.closePath(); ctx.fill();
      }
      ok.disabled = selected.size === 0;
    };
    const toggle = (key: string) => { if (selected.has(key)) selected.delete(key); else selected.add(key); draw(); };
    for (const all of [true, false]) { const b = document.createElement('button'); b.textContent = all ? 'Check all' : 'Uncheck all'; b.prepend(menuIcon(all ? 'check' : 'uncheck')); b.addEventListener('click', () => { for (const [key] of matches()) { if (all) selected.add(key); else selected.delete(key); } draw(); }); actions.append(b); }
    search.addEventListener('input', () => { offset = 0; focus = 0; draw(); });
    canvas.addEventListener('click', e => { const index = offset + Math.floor((e.clientY - canvas.getBoundingClientRect().top) / 20); const entry = matches()[index]; if (entry) { focus = index; toggle(entry[0]); } });
    canvas.addEventListener('wheel', e => { e.preventDefault(); offset += Math.sign(e.deltaY); draw(); }, { passive: false });
    canvas.addEventListener('keydown', e => { if (e.key === ' ' && matches()[focus]) { e.preventDefault(); toggle(matches()[focus][0]); } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); focus = Math.max(0, Math.min(matches().length - 1, focus + (e.key === 'ArrowDown' ? 1 : -1))); if (focus < offset || focus >= offset + canvas.clientHeight / 20) offset = focus; draw(); } });
    const footer = document.createElement('div'); footer.className = 'opensheets-filter-footer'; root.append(footer);
    const ok = document.createElement('button'); ok.textContent = 'OK'; ok.addEventListener('click', () => { if (selected.size === sorted.length) { filter.unfilter(column); close(); } else apply([new Condition(CF.ConditionType.areaCondition, { expected: sorted.filter(([k]) => selected.has(k)).map(([, v]) => v) })]); });
    const cancel = document.createElement('button'); cancel.textContent = 'Cancel'; cancel.addEventListener('click', close); footer.append(ok, cancel);
    requestAnimationFrame(draw);
    if (typeof ResizeObserver !== 'undefined') { const observer = new ResizeObserver(() => { if (root.isConnected) draw(); else observer.disconnect(); }); observer.observe(root); }
  }
  const grip = document.createElement('div'); grip.className = 'opensheets-filter-resize'; grip.setAttribute('aria-label', 'Resize filter'); root.append(grip);
  grip.addEventListener('pointerdown', event => {
    event.preventDefault(); event.stopPropagation(); const x = event.clientX, y = event.clientY, width = root.offsetWidth, height = root.offsetHeight;
    grip.setPointerCapture(event.pointerId);
    const move = (e: PointerEvent) => { root.style.width = `${Math.max(239, width + e.clientX - x)}px`; root.style.height = `${Math.max(350, height + e.clientY - y)}px`; };
    const end = () => { grip.removeEventListener('pointermove', move); grip.removeEventListener('pointerup', end); grip.removeEventListener('pointercancel', end); };
    grip.addEventListener('pointermove', move); grip.addEventListener('pointerup', end); grip.addEventListener('pointercancel', end);
  });
  root.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { const buttons = [...root.querySelectorAll<HTMLButtonElement>(':scope > button:not(:disabled)')]; const index = buttons.indexOf(document.activeElement as HTMLButtonElement); e.preventDefault(); buttons[(index + (e.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus(); }
  });
  return root;
}
function customFilterDialog(title: string, kind: string, values: string[], initial: number, between: boolean, apply: (conditions: Condition[]) => void, close: () => void): HTMLElement {
  const dialog = document.createElement('div'); dialog.className = 'opensheets-custom-filter'; dialog.setAttribute('role', 'dialog'); dialog.setAttribute('aria-label', 'Custom AutoFilter');
  const titleBar = document.createElement('div'); titleBar.className = 'opensheets-custom-title';
  const titleText = document.createElement('span'); titleText.className = 'opensheets-custom-title-text'; titleText.textContent = 'Custom AutoFilter'; titleBar.append(titleText);
  const cross = document.createElement('span'); cross.className = 'opensheets-custom-close'; cross.textContent = '×'; cross.setAttribute('aria-label', 'Close'); cross.addEventListener('click', close); titleBar.append(cross); dialog.append(titleBar);
  const show = document.createElement('div'); show.className = 'opensheets-custom-show'; show.textContent = 'Show rows where:'; dialog.append(show);
  const item = document.createElement('div'); item.className = 'opensheets-custom-item'; item.textContent = title; dialog.append(item);
  const selects: HTMLSelectElement[] = [], inputs: HTMLInputElement[] = [];
  for (let i = 0; i < 2; i++) {
    const row = document.createElement('div'); row.className = 'opensheets-custom-condition'; row.style.top = `${83 + i * 67}px`;
    const select = document.createElement('select'); select.setAttribute('aria-label', `Condition ${i + 1}`); select.add(new Option('', '')); operators.forEach((name, index) => select.add(new Option(name, String(index)))); select.value = i === 0 ? String(between ? 3 : initial) : between ? '5' : '';
    const wrap = document.createElement('div'); wrap.className = 'opensheets-custom-value';
    const list = document.createElement('select'); list.setAttribute('aria-label', `Value list ${i + 1}`); list.add(new Option('', '')); for (const value of values) list.add(new Option(value, value));
    const input = document.createElement('input'); input.setAttribute('aria-label', `Value ${i + 1}`); input.value = '';
    list.addEventListener('change', () => { input.value = list.value; });
    input.addEventListener('input', () => { list.value = [...list.options].some(option => option.value === input.value) ? input.value : ''; });
    wrap.append(list, input); row.append(select, wrap); dialog.append(row); selects.push(select); inputs.push(input);
    if (i === 0) {
      const conjunction = document.createElement('div'); conjunction.className = 'opensheets-custom-conjunction';
      const and = document.createElement('input'); and.type = 'radio'; and.name = `opensheets-filter-${Math.random().toString(36).slice(2)}`; and.checked = true; and.value = 'and';
      const or = document.createElement('input'); or.type = 'radio'; or.name = and.name; or.value = 'or';
      const andLabel = document.createElement('label'); andLabel.append(and, 'And'); const orLabel = document.createElement('label'); orLabel.append(or, 'Or'); conjunction.append(andLabel, orLabel);
      dialog.append(conjunction); (conjunction as HTMLElement & { and?: HTMLInputElement }).and = and; (conjunction as HTMLElement & { or?: HTMLInputElement }).or = or;
    }
  }
  const hint = document.createElement('div'); hint.className = 'opensheets-custom-hint'; hint.innerHTML = '<p>Use ? to represent any single character</p><p>Use * to represent any series of characters</p>'; dialog.append(hint);
  const conjunction = dialog.querySelector<HTMLElement>('.opensheets-custom-conjunction') as HTMLElement & { and?: HTMLInputElement };
  const footer = document.createElement('div'); footer.className = 'opensheets-custom-footer';
  const ok = document.createElement('input'); ok.type = 'button'; ok.value = 'OK';
  ok.addEventListener('click', () => { const conditions = selects.flatMap((s, i) => s.value === '' ? [] : [comparison(Number(s.value), inputs[i].value, kind)]); if (conditions.length === 2 && conjunction.and?.checked) apply([new Condition(CF.ConditionType.relationCondition, { item1: conditions[0], item2: conditions[1] })]); else apply(conditions); });
  const cancel = document.createElement('input'); cancel.type = 'button'; cancel.value = 'Cancel'; cancel.addEventListener('click', close); footer.append(ok, cancel); dialog.append(footer);
  dialog.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } else if (e.key === 'Enter') ok.click(); }); return dialog;
}
