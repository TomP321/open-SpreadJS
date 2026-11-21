// @vitest-environment jsdom
/**
 * TASK 80: headless coverage for the filter column menu (features/filter-menu.ts).
 * Layout/pixels are gated by the Playwright comparisons; this pins the menu's
 * public behaviour: rows, dialogs, check-list state and the effects a click has
 * on the worksheet's HideRowFilter.
 */
import { describe, expect, it } from 'vitest';
import GC from '../src/index.js';
import { filterMenu } from '../src/features/filter-menu.js';

const { Workbook, Range } = GC.Spread.Sheets;
const SS = GC.Spread.Sheets;

// jsdom has no 2D backend; the checklist paints through getContext.
(globalThis as Record<string, unknown>).CanvasRenderingContext2D ??= class {};
Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
  value() {
    return new Proxy({}, {
      get: (t, k: string) => {
        if (k in t) return (t as Record<string, unknown>)[k];
        if (k === 'measureText') return (s: unknown) => ({ width: String(s).length * 6 });
        if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop: () => undefined });
        return (...a: unknown[]) => void a;
      },
      set: (t, k: string, v) => { (t as Record<string, unknown>)[k] = v; return true; },
    });
  },
  configurable: true,
});

function salesSheet() {
  const wb = new Workbook();
  const sheet = wb.getActiveSheet();
  sheet.setArray(0, 0, [['Name'], ['Gamma'], ['alpha'], ['Beta']]);
  // The filter range covers only the data rows; the header stays put (trial dialog semantics).
  const filter = new SS.Filter.HideRowFilter(new Range(1, 0, 3, 1));
  sheet.rowFilter(filter);
  return { sheet, filter };
}

function openMenu(column = 0, existing?: ReturnType<typeof salesSheet>) {
  const state = existing ?? salesSheet();
  let closed = 0;
  const mounted: HTMLElement[] = [];
  const root = filterMenu(state.sheet, state.filter, column, 'Name', () => closed++, (el) => { mounted.push(el); document.body.append(el); });
  document.body.append(root);
  const commands = () => [...root.querySelectorAll<HTMLButtonElement>('button.opensheets-filter-command')];
  const command = (label: string) => commands().find((b) => b.textContent === label);
  return { sheet: state.sheet, filter: state.filter, root, mounted, closed: () => closed, commands, command };
}

describe('filter menu structure', () => {
  it('builds the trial command column with the value checklist', () => {
    const { root, command } = openMenu();
    expect(root.getAttribute('role')).toBe('dialog');
    expect(root.getAttribute('aria-label')).toBe('Filter Name');
    expect(command('Sort Ascending')).toBeTruthy();
    expect(command('Sort Descending')).toBeTruthy();
    const clear = command('Clear Filter From "Name"')!;
    expect(clear.disabled).toBe(true); // nothing filtered yet
    expect(command('Text Filters')).toBeTruthy();
    expect(root.querySelector('input.opensheets-filter-search')).toBeTruthy();
    expect(root.querySelector('canvas.opensheets-filter-values[role=group]')).toBeTruthy();
    expect([...root.querySelectorAll('button')].map((b) => b.textContent)).toEqual(expect.arrayContaining(['Check all', 'Uncheck all', 'OK', 'Cancel']));
  });
});

describe('filter menu actions', () => {
  it('sorts ascending through the filter and closes', () => {
    const { sheet, command, closed } = openMenu();
    command('Sort Ascending')!.click();
    expect(sheet.getValue(0, 0)).toBe('Name'); // header untouched
    expect([1, 2, 3].map((r) => sheet.getValue(r, 0))).toEqual(['alpha', 'Beta', 'Gamma']);
    expect(closed()).toBe(1);
  });
  it('OK with every value checked keeps the column unfiltered; unchecking a value filters it out', () => {
    const { sheet, filter, root, closed } = openMenu();
    const ok = [...root.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === 'OK')!;
    ok.click();
    expect(closed()).toBe(1);
    expect(filter.isFiltered(0)).toBe(false);
    // Click the first row of the painted value list (collated first: 'alpha') to uncheck it.
    const canvas = root.querySelector<HTMLCanvasElement>('canvas.opensheets-filter-values')!;
    canvas.dispatchEvent(new MouseEvent('click', { bubbles: true, clientY: 10 }));
    ok.click();
    expect(filter.isFiltered(0)).toBe(true);
    // The unchecked value ('alpha', sheet row 2) is hidden; the rest stay visible.
    expect([1, 2, 3].map((r) => filter.isRowFilteredOut(r))).toEqual([false, true, false]);
    // A fresh menu on the filtered column exposes an enabled Clear action that resets it.
    const second = openMenu(0, { sheet, filter });
    second.command('Clear Filter From "Name"')!.click();
    expect(second.filter.isFiltered(0)).toBe(false);
    expect(second.closed()).toBe(1);
  });
  it('search narrows the checklist before applying', () => {
    const { root, filter } = openMenu();
    const search = root.querySelector<HTMLInputElement>('input.opensheets-filter-search')!;
    search.value = 'bet'; // only 'Beta' matches -> it is the first row of the list now
    const canvas = root.querySelector<HTMLCanvasElement>('canvas.opensheets-filter-values')!;
    canvas.dispatchEvent(new MouseEvent('click', { bubbles: true, clientY: 10 }));
    const ok = [...root.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === 'OK')!;
    ok.click();
    expect(filter.isFiltered(0)).toBe(true);
    expect([1, 2, 3].map((r) => filter.isRowFilteredOut(r))).toEqual([false, false, true]);
  });
  it('opens the custom value dialog from the Text Filters submenu', () => {
    const { mounted, command } = openMenu();
    const valueRow = command('Text Filters')!;
    valueRow.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    valueRow.parentElement!.querySelector<HTMLDivElement>('.opensheets-filter-submenu [role=menuitem]')!.click(); // Equals...
    expect(mounted.length).toBe(1);
    const dialog = mounted[0]!;
    expect(dialog.textContent?.toLowerCase()).toContain('equals');
    expect(dialog.querySelector('.opensheets-custom-close')).toBeTruthy();
  });
});
