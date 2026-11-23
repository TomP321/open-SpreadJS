import type { Worksheet } from '../worksheet.js';
import type { RowFilterBase } from './filters.js';
import { Condition } from './conditions.js';
import { Range } from '../primitives.js';
import { GC } from '../generated/enums.js';
import { menuIcon } from './menu-icons.js';
import { resolveColor } from '../colors.js';
import { ltext } from '../localization.js';
const CF = GC.Spread.Sheets.ConditionalFormatting;
// Custom-dialog condition names: culture-localised, culture-neutral keys.
const operatorEntries: [string, string][] = [
  ['equals', 'equals'],
  ['doesNotEqual', 'does not equal'],
  ['greaterThan', 'is greater than'],
  ['greaterThanOrEqual', 'is greater than or equal to'],
  ['lessThan', 'is less than'],
  ['lessThanOrEqual', 'is less than or equal to'],
  ['beginsWith', 'begins with'],
  ['doesNotBeginWith', 'does not begin with'],
  ['endsWith', 'ends with'],
  ['doesNotEndWith', 'does not end with'],
  ['contains', 'contains'],
  ['doesNotContain', 'does not contain'],
];
const filterChoices: Record<'Text' | 'Number' | 'Date', [string, string][]> = {
  Text: [
    ['equals', 'Equals...'], ['doesNotEqual', 'Does Not Equal...'], ['beginsWith', 'Begins With...'],
    ['endsWith', 'Ends With...'], ['contains', 'Contains...'], ['doesNotContain', 'Does Not Contain...'],
    ['custom', 'Custom Filter...'],
  ],
  Number: [
    ['equals', 'Equals...'], ['doesNotEqual', 'Does Not Equal...'], ['greaterThan', 'Greater Than...'],
    ['greaterThanOrEqual', 'Greater Than Or Equal To...'], ['lessThan', 'Less Than...'],
    ['lessThanOrEqual', 'Less Than Or Equal To...'], ['between', 'Between...'], ['top10', 'Top 10...'],
    ['aboveAverage', 'Above Average'], ['belowAverage', 'Below Average'], ['custom', 'Custom Filter...'],
  ],
  Date: [
    ['equals', 'Equals...'], ['before', 'Before...'], ['after', 'After...'], ['between', 'Between...'],
    ['tomorrow', 'Tomorrow'], ['today', 'Today'], ['yesterday', 'Yesterday'], ['nextWeek', 'Next Week'],
    ['thisWeek', 'This Week'], ['lastWeek', 'Last Week'], ['nextMonth', 'Next Month'],
    ['thisMonth', 'This Month'], ['lastMonth', 'Last Month'], ['nextQuarter', 'Next Quarter'],
    ['thisQuarter', 'This Quarter'], ['lastQuarter', 'Last Quarter'], ['nextYear', 'Next Year'],
    ['thisYear', 'This Year'], ['lastYear', 'Last Year'], ['yearToDate', 'Year To Date'],
    ['allDatesInPeriod', 'All Dates in Period'], ['custom', 'Custom Filter...'],
  ],
};
/**
 * Dynamic date-filter choices (trial AutoFilter): stored as
 * `{conType: dateExCondition, expected: DateOccurringType}` (trial-measured JSON);
 * Year To Date uses `expectTypeId: 6` with the year offset as `expected`.
 */
const dynamicDateTypes: Record<string, number> = {
  today: 0, yesterday: 1, tomorrow: 2, thisMonth: 4, lastMonth: 5, nextMonth: 6,
  thisWeek: 7, lastWeek: 8, nextWeek: 9, nextQuarter: 10, thisQuarter: 11, lastQuarter: 12,
  nextYear: 13, thisYear: 14, lastYear: 15,
};
function dynamicDateCondition(choice: string): Condition | undefined {
  if (choice === 'yearToDate') return new Condition(CF.ConditionType.dateExCondition, { expected: 0, expectTypeId: 6 });
  const type = dynamicDateTypes[choice];
  return type === undefined ? undefined : new Condition(CF.ConditionType.dateExCondition, { expected: type });
}
/** Average filter condition (trial stores `type` = AverageConditionType and the filter range). */
function averageCondition(rect: Range, type: number): Condition {
  return new Condition(CF.ConditionType.averageCondition, { type }).ranges([rect]) as Condition;
}
/** Predefined comparison submenu entry key -> condition operator index. */
const predefinedOperator: Record<string, number> = { equals: 0, doesNotEqual: 1, greaterThan: 2, after: 2, greaterThanOrEqual: 3, lessThan: 4, before: 4, lessThanOrEqual: 5, beginsWith: 6, endsWith: 8, contains: 10, doesNotContain: 11 };
/** Filter-menu string lookup (`filter.*` language namespace). */
const ftext = (key: string, fallback: string, ...args: (string | number)[]) => ltext(`filter.${key}`, fallback, ...args);
function comparison(operator: number, value: string, kind: string): Condition {
  const numeric = [CF.ComparisonOperators.equalsTo, CF.ComparisonOperators.notEqualsTo, CF.ComparisonOperators.greaterThan, CF.ComparisonOperators.greaterThanOrEqualsTo, CF.ComparisonOperators.lessThan, CF.ComparisonOperators.lessThanOrEqualsTo];
  const text = [CF.TextCompareType.beginsWith, CF.TextCompareType.doesNotBeginWith, CF.TextCompareType.endsWith, CF.TextCompareType.doesNotEndWith, CF.TextCompareType.contains, CF.TextCompareType.doesNotContain];
  if (operator >= 6) return new Condition(CF.ConditionType.textCondition, { compareType: text[operator - 6], expected: value });
  return new Condition(CF.ConditionType.cellValueCondition, { compareType: numeric[operator], expected: kind === 'Number' && value !== '' ? Number(value) : kind === 'Date' ? new Date(value) : value });
}
export function filterMenu(sheet: Worksheet, filter: RowFilterBase, column: number, title: string, close: () => void, mount: (element: HTMLElement) => void): HTMLElement {
  const root = document.createElement('div'); root.className = 'opensheets-filter-menu gc-filter-dialog-style'; root.setAttribute('role', 'dialog'); root.setAttribute('aria-label', ftext('title', 'Filter {0}', title)); root.tabIndex = -1;
  const range = filter.range!;
  const values = new Map<string, unknown>();
  for (let row = range.row; row < range.row + range.rowCount; row++) { const value = sheet.getValue(row, range.col + column); values.set(value instanceof Date ? value.toISOString() : String(value ?? ''), value); }
  const sorted = [...values].sort((a, b) => typeof a[1] === 'number' && typeof b[1] === 'number' ? a[1] - b[1] : a[0].localeCompare(b[0]));
  const kind = sorted.some(([, v]) => v instanceof Date) ? 'Date' : sorted.some(([, v]) => typeof v === 'number') ? 'Number' : 'Text';
  const columnRange = new Range(range.row, range.col + column, range.rowCount, 1);
  const selected = new Set(sorted.filter(([, value]) => !filter.isFiltered(column) || filter.getFilterItems(column).some(condition => {
    if (!condition.ranges?.().length) condition._setFilterColumnRange?.(columnRange);
    const json = condition.toJSON?.() as { conType?: number; expected?: unknown } | undefined;
    // The trial's list dialog treats an area condition with a comma-joined
    // string as an empty selection (only an array marks values as selected).
    if (json?.conType === CF.ConditionType.areaCondition && typeof json.expected === 'string') return false;
    return condition.evaluate(sheet, range.row, range.col + column, value);
  })).map(([key]) => key));
  const apply = (conditions: Condition[]) => { filter.removeFilterItems(column); filter.addFilterItem(column, conditions); filter.filter(column); close(); };
  const row = (label: string, icon?: string, action?: () => void, disabled = false) => {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'opensheets-filter-command'; const caption = document.createElement('span'); caption.textContent = label; button.append(caption); button.disabled = disabled; button.setAttribute('role', 'menuitem');
    if (icon) { const canvas = menuIcon(icon, /clear|filter|listCheck/i.test(icon) ? 18 : 16, disabled); if (canvas.width / (window.devicePixelRatio || 1) === 18) canvas.classList.add('opensheets-filter-icon-18'); button.prepend(canvas); }
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
    row(ftext('sortAscending', 'Sort Ascending'), 'asc', () => { filter.sortColumn(column, true); close(); });
    row(ftext('sortDescending', 'Sort Descending'), 'desc', () => { filter.sortColumn(column, false); close(); });
  }
  const colors = new Map<string, 'backColor' | 'foreColor'>();
  for (let r = range.row; r < range.row + range.rowCount; r++) { const style = sheet.getStyle(r, range.col + column); for (const key of ['backColor', 'foreColor'] as const) if (style && typeof style[key] === 'string') colors.set(String(style[key]), key); }
  const colorItems = (sort: boolean) => (['backColor', 'foreColor'] as const).flatMap(key => {
    const entries = [...colors].filter(([, type]) => type === key); if (!entries.length) return [];
    const heading = sort
      ? (key === 'backColor' ? ftext('sortByCellColor', 'Sort By Cell Color') : ftext('sortByFontColor', 'Sort By Font Color'))
      : (key === 'backColor' ? ftext('filterByCellColor', 'Filter By Cell Color') : ftext('filterByFontColor', 'Filter By Font Color'));
    const action = (color: string) => () => {
      if (sort) { sheet.sortRange(range.row, range.col, range.rowCount, range.colCount, true, [{ index: column, ascending: true, [key === 'backColor' ? 'backColor' : 'fontColor']: color }]); close(); }
      else apply([new Condition(CF.ConditionType.colorCondition, { expected: color, compareType: key === 'backColor' ? 0 : 1 })]);
    };
    return [...entries.map(([color]) => ({ label: '', color, heading, action: action(color) })), { label: key === 'backColor' ? ftext('noFill', 'No Fill') : ftext('automatic', 'Automatic'), color: '', heading, action: action(key === 'backColor' ? '' : '#000000') }];
  });
  if (visible.sortByColor !== false) submenu(row(ftext('sortByColor', 'Sort By Color'), undefined, undefined, !colors.size), colorItems(true));
  row(ftext('clearFilterFrom', 'Clear Filter From "{0}"', title), 'clearFilter', () => { filter.unfilter(column); close(); }, !filter.isFiltered(column));
  if (visible.filterByColor !== false) submenu(row(ftext('filterByColor', 'Filter By Color'), undefined, undefined, !colors.size), colorItems(false));
  if (visible.filterByValue !== false) {
    const choices = filterChoices[kind];
    const filterRect = new Range(range.row, range.col, range.rowCount, range.colCount);
    // The trial marks the value-filter row with a check tile only while the column is filtered.
    const filterButton = row(ftext(`${kind.toLowerCase()}Filters`, `${kind} Filters`), filter.isFiltered(column) ? 'listCheck' : undefined);
    submenu(filterButton, choices.map(([choiceKey, label]) => ({ label: ftext(`choice.${choiceKey}`, label), action: () => {
      if (choiceKey === 'top10') { mount(top10Dialog(filterRect, apply, close)); return; }
      if (choiceKey === 'aboveAverage') { apply([averageCondition(filterRect, 0)]); return; }
      if (choiceKey === 'belowAverage') { apply([averageCondition(filterRect, 1)]); return; }
      if (choiceKey === 'allDatesInPeriod') return; // applies through the nested period flyout
      const dynamic = dynamicDateCondition(choiceKey);
      if (dynamic) { apply([dynamic]); return; }
      const dialog = customFilterDialog(title, kind, sorted.map(([k]) => k), predefinedOperator[choiceKey] ?? 0, choiceKey === 'between', apply, close);
      mount(dialog);
    } })));
    if (kind === 'Date') {
      filterButton.parentElement?.querySelectorAll('.opensheets-filter-submenu').forEach(menu => menu.classList.add('opensheets-filter-date-menu'));
      const nested = [...root.querySelectorAll<HTMLElement>('.opensheets-filter-date-menu .opensheets-filter-command')].find(item => item.textContent === ftext('choice.allDatesInPeriod', 'All Dates in Period'));
      nested?.classList.add('opensheets-filter-has-nested');
      if (nested?.parentElement) attachPeriodFlyout(nested.parentElement, nested, (condition) => apply([condition]));
    }
  }
  if (visible.listFilterArea !== false) {
    const search = document.createElement('input'); search.type = 'text'; search.placeholder = ftext('search', 'Search'); search.setAttribute('aria-label', ftext('search', 'Search')); search.className = 'opensheets-filter-search'; root.append(search);
    const actions = document.createElement('div'); actions.className = 'opensheets-filter-check-actions'; root.append(actions);
    const canvas = document.createElement('canvas'); canvas.className = 'opensheets-filter-values'; canvas.setAttribute('role', 'group'); canvas.setAttribute('aria-label', ftext('filterValues', 'Filter values')); canvas.tabIndex = 0; root.append(canvas);
    let offset = 0, focus = 0;
    const matches = () => sorted.filter(([key]) => key.toLowerCase().includes(search.value.toLowerCase()));
    const draw = () => {
      const width = Math.max(100, root.clientWidth - 46), height = Math.max(80, root.clientHeight - 260), dpr = window.devicePixelRatio || 1;
      canvas.style.width = `${width}px`; canvas.style.height = `${height}px`; canvas.width = width * dpr; canvas.height = height * dpr;
      const ctx = canvas.getContext('2d'); if (!ctx) return; ctx.scale(dpr, dpr); ctx.fillStyle = 'white'; ctx.fillRect(0, 0, width, height); ctx.font = getComputedStyle(root).font; ctx.textBaseline = 'alphabetic';
      const list = matches(), rows = Math.floor((height - 2) / 20), scrollW = list.length > rows ? 22 : 0;
      offset = Math.max(0, Math.min(offset, Math.max(0, list.length - rows)));
      // The trial also paints the partially visible row under the last full one (clipped by
      // the canvas box), so the value list fills right down to its bottom border.
      const drawCount = Math.min(list.length, offset + Math.ceil((height - 2) / 20));
      for (let i = offset; i < drawCount; i++) {
        const [key, value] = list[i], y = (i - offset) * 20;
        ctx.fillStyle = selected.has(key) ? '#000' : 'white'; ctx.fillRect(11, y + 4, 12, 12); ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.strokeRect(11.5, y + 4.5, 11, 11);
        if (!selected.has(key)) { ctx.strokeStyle = '#6d6d6d'; ctx.lineWidth = .5; ctx.strokeRect(12.25, y + 5.25, 9.5, 9.5); ctx.lineWidth = 1; }
        if (selected.has(key)) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(13, y + 10); ctx.lineTo(16, y + 13); ctx.lineTo(21, y + 7); ctx.stroke(); }
        ctx.save(); ctx.beginPath(); ctx.rect(0, y, width - scrollW, 20); ctx.clip();
        ctx.fillStyle = 'black'; ctx.fillText(value == null || key === '' ? ftext('blanks', '(Blanks)') : value instanceof Date ? sheet.getText(range.row + [...values.keys()].indexOf(key), range.col + column) : key, 27, y + 13);
        ctx.restore();
      }
      if (scrollW) {
        // Trial: a #f6f6f6 22px gutter at the list's right edge holding a 15px white
        // scrollbar box (#ababab 1px frame): arrow button rows at both ends with a
        // solid #777 triangle, a framed thumb, and #eaeaea track between thumb and buttons.
        const sx = width - 22, cx = sx + 11.5, buttonH = 15, trackH = height - buttonH * 2;
        const thumbH = Math.max(16, Math.round(trackH * rows / list.length));
        const thumbY = buttonH + Math.round((trackH - thumbH) * offset / Math.max(1, list.length - rows));
        ctx.fillStyle = '#f6f6f6'; ctx.fillRect(sx, 0, 22, height);
        ctx.fillStyle = '#ababab'; ctx.fillRect(sx, 0, 1, height);
        ctx.fillStyle = '#eaeaea'; ctx.fillRect(sx + 4, buttonH, 18, trackH);
        const frame = (top: number, bottom: number, thumbTopEdge: number) => {
          ctx.fillStyle = 'white'; ctx.fillRect(sx + 5, top + 1, 13, bottom - top - 1);
          ctx.fillStyle = '#ababab';
          ctx.fillRect(sx + 4, top, 15, thumbTopEdge); ctx.fillRect(sx + 4, bottom - 1, 15, 1);
          ctx.fillRect(sx + 4, top, 1, bottom - top); ctx.fillRect(sx + 18, top, 1, bottom - top);
        };
        frame(0, buttonH, 1); frame(height - buttonH, height, 1); frame(thumbY, thumbY + thumbH, 1);
        ctx.fillStyle = '#777777';
        ctx.beginPath(); ctx.moveTo(cx, 4.5); ctx.lineTo(cx + 4.75, 8.6); ctx.lineTo(cx - 4.75, 8.6); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(cx, height - 5.4); ctx.lineTo(cx + 4.75, height - 9.5); ctx.lineTo(cx - 4.75, height - 9.5); ctx.closePath(); ctx.fill();
      }
      ok.disabled = selected.size === 0;
    };
    const toggle = (key: string) => { if (selected.has(key)) selected.delete(key); else selected.add(key); draw(); };
    for (const all of [true, false]) { const b = document.createElement('button'); const lbl = document.createElement('span'); lbl.textContent = all ? ftext('checkAll', 'Check all') : ftext('uncheckAll', 'Uncheck all'); b.append(lbl); b.prepend(menuIcon(all ? 'check' : 'uncheck')); b.addEventListener('click', () => { for (const [key] of matches()) { if (all) selected.add(key); else selected.delete(key); } draw(); }); actions.append(b); }
    search.addEventListener('input', () => { offset = 0; focus = 0; draw(); });
    canvas.addEventListener('click', e => { const index = offset + Math.floor((e.clientY - canvas.getBoundingClientRect().top) / 20); const entry = matches()[index]; if (entry) { focus = index; toggle(entry[0]); } });
    canvas.addEventListener('wheel', e => { e.preventDefault(); offset += Math.sign(e.deltaY); draw(); }, { passive: false });
    canvas.addEventListener('keydown', e => { if (e.key === ' ' && matches()[focus]) { e.preventDefault(); toggle(matches()[focus][0]); } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); focus = Math.max(0, Math.min(matches().length - 1, focus + (e.key === 'ArrowDown' ? 1 : -1))); if (focus < offset || focus >= offset + canvas.clientHeight / 20) offset = focus; draw(); } });
    const footer = document.createElement('div'); footer.className = 'opensheets-filter-footer'; root.append(footer);
    const ok = document.createElement('button'); ok.type = 'button'; ok.textContent = ftext('ok', 'OK'); ok.addEventListener('click', () => { if (selected.size === sorted.length) { filter.unfilter(column); close(); } else apply([new Condition(CF.ConditionType.areaCondition, { expected: sorted.filter(([k]) => selected.has(k)).map(([, v]) => v) })]); });
    const cancel = document.createElement('button'); cancel.type = 'button'; cancel.textContent = ftext('cancel', 'Cancel'); cancel.addEventListener('click', close); footer.append(ok, cancel);
    requestAnimationFrame(draw);
    if (typeof ResizeObserver !== 'undefined') { const observer = new ResizeObserver(() => { if (root.isConnected) draw(); else observer.disconnect(); }); observer.observe(root); }
  }
  const grip = document.createElement('div'); grip.className = 'opensheets-filter-resize'; grip.setAttribute('aria-label', ftext('resize', 'Resize filter')); root.append(grip);
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
  const dialog = document.createElement('div'); dialog.className = 'opensheets-custom-filter'; dialog.setAttribute('role', 'dialog'); dialog.setAttribute('aria-label', ftext('custom.title', 'Custom AutoFilter'));
  const titleBar = document.createElement('div'); titleBar.className = 'opensheets-custom-title';
  const titleText = document.createElement('span'); titleText.className = 'opensheets-custom-title-text'; titleText.textContent = ftext('custom.title', 'Custom AutoFilter'); titleBar.append(titleText);
  const cross = document.createElement('span'); cross.className = 'opensheets-custom-close'; cross.textContent = '×'; cross.setAttribute('aria-label', ftext('close', 'Close')); cross.addEventListener('click', close); titleBar.append(cross); dialog.append(titleBar);
  const show = document.createElement('div'); show.className = 'opensheets-custom-show'; show.textContent = ftext('custom.showRows', 'Show rows where:'); dialog.append(show);
  const item = document.createElement('div'); item.className = 'opensheets-custom-item'; item.textContent = title; dialog.append(item);
  const selects: HTMLSelectElement[] = [], inputs: HTMLInputElement[] = [];
  for (let i = 0; i < 2; i++) {
    const row = document.createElement('div'); row.className = 'opensheets-custom-condition'; row.style.top = `${83 + i * 67}px`;
    const select = document.createElement('select'); select.setAttribute('aria-label', ftext('custom.condition', 'Condition {0}', i + 1)); select.add(new Option('', '')); operatorEntries.forEach(([key, name], index) => select.add(new Option(ftext(`custom.operator.${key}`, name), String(index)))); select.value = i === 0 ? String(between ? 3 : initial) : between ? '5' : '';
    const wrap = document.createElement('div'); wrap.className = 'opensheets-custom-value';
    const list = document.createElement('select'); list.setAttribute('aria-label', ftext('custom.valueList', 'Value list {0}', i + 1)); list.add(new Option('', '')); for (const value of values) list.add(new Option(value, value));
    const input = document.createElement('input'); input.setAttribute('aria-label', ftext('custom.value', 'Value {0}', i + 1)); input.value = '';
    list.addEventListener('change', () => { input.value = list.value; });
    input.addEventListener('input', () => { list.value = [...list.options].some(option => option.value === input.value) ? input.value : ''; });
    wrap.append(list, input); row.append(select, wrap); dialog.append(row); selects.push(select); inputs.push(input);
    if (i === 0) {
      const conjunction = document.createElement('div'); conjunction.className = 'opensheets-custom-conjunction';
      const and = document.createElement('input'); and.type = 'radio'; and.name = `opensheets-filter-${Math.random().toString(36).slice(2)}`; and.checked = true; and.value = 'and';
      const or = document.createElement('input'); or.type = 'radio'; or.name = and.name; or.value = 'or';
      const andLabel = document.createElement('label'); andLabel.append(and, ftext('custom.and', 'And')); const orLabel = document.createElement('label'); orLabel.append(or, ftext('custom.or', 'Or')); conjunction.append(andLabel, orLabel);
      dialog.append(conjunction); (conjunction as HTMLElement & { and?: HTMLInputElement }).and = and; (conjunction as HTMLElement & { or?: HTMLInputElement }).or = or;
    }
  }
  const hint = document.createElement('div'); hint.className = 'opensheets-custom-hint';
  const hintOne = ltext('filter.custom.hintOne', 'Use ? to represent any single character').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] as string));
  const hintStar = ltext('filter.custom.hintStar', 'Use * to represent any series of characters').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] as string));
  hint.innerHTML = `<p>${hintOne}</p><p>${hintStar}</p>`; dialog.append(hint);
  const conjunction = dialog.querySelector<HTMLElement>('.opensheets-custom-conjunction') as HTMLElement & { and?: HTMLInputElement };
  const footer = document.createElement('div'); footer.className = 'opensheets-custom-footer';
  const ok = document.createElement('input'); ok.type = 'button'; ok.value = ftext('ok', 'OK');
  ok.addEventListener('click', () => { const conditions = selects.flatMap((s, i) => s.value === '' ? [] : [comparison(Number(s.value), inputs[i].value, kind)]); if (conditions.length === 2 && conjunction.and?.checked) apply([new Condition(CF.ConditionType.relationCondition, { item1: conditions[0], item2: conditions[1] })]); else apply(conditions); });
  const cancel = document.createElement('input'); cancel.type = 'button'; cancel.value = ftext('cancel', 'Cancel'); cancel.addEventListener('click', close); footer.append(ok, cancel); dialog.append(footer);
  dialog.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } else if (e.key === 'Enter') ok.click(); }); return dialog;
}
/** Top 10 dialog (trial "Top 10 Auto Filter"): Show top/bottom N Items/Percent. */
function top10Dialog(rect: Range, apply: (conditions: Condition[]) => void, close: () => void): HTMLElement {
  const dialog = document.createElement('div');
  dialog.className = 'opensheets-custom-filter opensheets-top10-dialog';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-label', ftext('top10.title', 'Top 10 Auto Filter'));
  dialog.tabIndex = -1;
  const titleBar = document.createElement('div');
  titleBar.className = 'opensheets-custom-title';
  const titleText = document.createElement('span');
  titleText.className = 'opensheets-custom-title-text';
  titleText.textContent = ftext('top10.title', 'Top 10 Auto Filter');
  titleBar.append(titleText);
  const cross = document.createElement('span');
  cross.className = 'opensheets-custom-close';
  cross.textContent = '\u00d7';
  cross.setAttribute('aria-label', ftext('close', 'Close'));
  cross.addEventListener('click', close);
  titleBar.append(cross);
  dialog.append(titleBar);
  const showRows = document.createElement('div');
  showRows.className = 'opensheets-custom-show';
  showRows.textContent = ftext('top10.show', 'Show');
  dialog.append(showRows);
  const row = document.createElement('div');
  row.className = 'opensheets-top10-row';
  const order = document.createElement('select');
  order.setAttribute('aria-label', ftext('top10.order', 'Order'));
  order.add(new Option(ftext('top10.top', 'top'), '0'));
  order.add(new Option(ftext('top10.bottom', 'bottom'), '1'));
  const count = document.createElement('input');
  count.type = 'text';
  count.value = '10';
  count.className = 'opensheets-top10-count';
  count.setAttribute('aria-label', ftext('top10.count', 'Count'));
  const unit = document.createElement('select');
  unit.setAttribute('aria-label', ftext('top10.unit', 'Unit'));
  unit.add(new Option(ftext('top10.items', 'Items'), '0'));
  unit.add(new Option(ftext('top10.percent', 'Percent'), '1'));
  row.append(order, count, unit);
  dialog.append(row);
  const footer = document.createElement('div');
  footer.className = 'opensheets-custom-footer';
  const ok = document.createElement('input');
  ok.type = 'button';
  ok.value = ftext('ok', 'OK');
  ok.addEventListener('click', () => {
    const rank = Math.max(1, Math.trunc(Number(count.value)) || 10);
    const args: Record<string, unknown> = { expected: rank, type: order.value === '1' ? 1 : 0 };
    if (unit.value === '1') args.isPercent = true; // trial stores isPercent only for Percent mode
    apply([new Condition(CF.ConditionType.top10Condition, args).ranges([rect]) as Condition]);
    close();
  });
  const cancel = document.createElement('input');
  cancel.type = 'button';
  cancel.value = ftext('cancel', 'Cancel');
  cancel.addEventListener('click', close);
  footer.append(ok, cancel);
  dialog.append(footer);
  dialog.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.stopPropagation(); close(); }
    else if (e.key === 'Enter') ok.click();
  });
  return dialog;
}
const monthNames = () => [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(i => new Date(2001, i, 1).toLocaleString(undefined, { month: 'long' }));
/**
 * Nested "All Dates in Period" flyout for the date filter submenu (trial layout:
 * Quarter 1-4 then the month names); items apply the trial's
 * `{conType: dateExCondition, expectTypeId, expected}` period conditions
 * (quarter/month indexes are zero-based, trial-measured).
 */
function attachPeriodFlyout(menu: HTMLElement, row: HTMLElement, applyOne: (condition: Condition) => void): void {
  const flyout = document.createElement('div');
  flyout.className = 'opensheets-filter-period-menu';
  flyout.setAttribute('role', 'menu');
  const quarters = ['Quarter 1', 'Quarter 2', 'Quarter 3', 'Quarter 4'];
  const items: { label: string; make: () => Condition }[] = [
    ...quarters.map((label, quarter) => ({ label: ftext(`period.q${quarter}`, label), make: () => Condition.fromQuarter(quarter) })),
    ...monthNames().map((label, month) => ({ label, make: () => Condition.fromMonth(month) })),
  ];
  for (const item of items) {
    const button = document.createElement('div');
    button.className = 'opensheets-filter-period-item';
    button.tabIndex = 0;
    button.setAttribute('role', 'menuitem');
    button.textContent = item.label;
    button.addEventListener('click', () => applyOne(item.make()));
    flyout.append(button);
  }
  const show = () => {
    flyout.style.display = 'block';
    flyout.style.left = `${menu.offsetWidth + 2}px`;
    flyout.style.top = `${row.offsetTop}px`;
    const overflow = flyout.getBoundingClientRect().right - (window.innerWidth - 5);
    if (overflow > 0) flyout.style.left = `${Math.max(0, menu.offsetLeft - flyout.offsetWidth - overflow)}px`;
    const bottom = flyout.getBoundingClientRect().bottom - (window.innerHeight - 5);
    if (bottom > 0) flyout.style.top = `${Math.max(0, row.offsetTop - bottom)}px`;
  };
  row.addEventListener('pointerenter', show);
  flyout.addEventListener('pointerleave', () => { flyout.style.display = 'none'; });
  menu.append(flyout);
}
