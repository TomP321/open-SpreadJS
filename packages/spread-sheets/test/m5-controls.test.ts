// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import GC from '../src/index.js';
import { applyMask } from '../src/features/input-mask.js';

describe('M5 external controls', () => {
  it('binds the formula box, commits formulas with undo, refreshes and cleans up', () => {
    const host = document.createElement('div'); document.body.append(host);
    const workbook = new GC.Spread.Sheets.Workbook(), sheet = workbook.getActiveSheet();
    const box = new GC.Spread.Sheets.FormulaTextBox.FormulaTextBox(host);
    expect(box.text()).toBe(''); box.workbook(workbook);
    expect(GC.Spread.Sheets.FormulaTextBox.findControl(host)).toBe(box);
    box.text('=SUM(2,3)'); host.querySelector<HTMLElement>('[role=textbox]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(sheet.getValue(0, 0)).toBe(5); expect(sheet.getFormula(0, 0)).toBe('SUM(2,3)');
    workbook.undoManager().undo(); expect(sheet.getValue(0, 0)).toBeNull();
    sheet.setValue(2, 2, 'Hello'); sheet.setActiveCell(2, 2); box.refresh(); expect(box.text()).toBe('Hello');
    box.destroy(); expect(host.children.length).toBe(0); expect(GC.Spread.Sheets.FormulaTextBox.findControl(host)).toBeUndefined(); host.remove();
  });
  it('navigates ranges from the name box and disposes its subscriptions', () => {
    const host = document.createElement('div'), wb = new GC.Spread.Sheets.Workbook();
    const box = new GC.Spread.Sheets.NameBox.NameBox(host, wb), input = host.querySelector('input')!;
    input.value = 'B3:C5'; input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(wb.getActiveSheet().getSelections()[0]).toMatchObject({ row: 2, col: 1, rowCount: 3, colCount: 2 });
    expect(box.getHost()).toBe(host); box.dispose(); expect(host.children.length).toBe(0);
  });
  it('mirrors edit events and restores the committed value after cancellation', () => {
    const host = document.createElement('div'), wb = new GC.Spread.Sheets.Workbook(), sheet = wb.getActiveSheet();
    const box = new GC.Spread.Sheets.FormulaTextBox.FormulaTextBox(host); box.workbook(wb);
    sheet.setValue(0, 0, 'original');
    sheet._emit(GC.Spread.Sheets.Events.EditChange, { editingText: '=SU' });
    expect(box.text()).toBe('=SU');
    sheet._emit(GC.Spread.Sheets.Events.EditEnded, {});
    expect(box.text()).toBe('original');
    box.destroy();
  });
  it('exposes editing mode on the cellMode status item', () => {
    const host = document.createElement('div'), wb = new GC.Spread.Sheets.Workbook(), sheet = wb.getActiveSheet();
    const bar = new GC.Spread.Sheets.StatusBar.StatusBar(host); bar.bind(wb);
    sheet._emit('EditStarted', { editMode: 'Enter' }); expect(bar.get('cellMode')?.value).toBe('Enter');
    sheet._emit(GC.Spread.Sheets.Events.EditEnded, {}); expect(bar.get('cellMode')?.value).toBe('Ready');
    sheet._emit('EditStarted', { editMode: 'Edit' }); expect(bar.get('cellMode')?.value).toBe('Edit');
    bar.dispose();
  });
  it('updates selection summaries, zoom and custom status item lifecycle', () => {
    const host = document.createElement('div'), wb = new GC.Spread.Sheets.Workbook(), s = wb.getActiveSheet();
    const bar = new GC.Spread.Sheets.StatusBar.StatusBar(host); bar.bind(wb);
    s.setArray(0, 0, [[2], [4], ['x']]); s.setSelection(0, 0, 3, 1); bar.update();
    expect(host.textContent).toContain('Sum: 6'); expect(host.textContent).toContain('Average: 3'); expect(host.textContent).toContain('Count: 3');
    s.zoom(1.5); bar.update(); expect(host.textContent).toContain('150%');
    const item = new GC.Spread.Sheets.StatusBar.StatusItem('custom', { value: 'hello' }); const bind = vi.spyOn(item, 'onBind'), unbind = vi.spyOn(item, 'onUnbind');
    expect(bar.add(item, 0)).toBe(true); expect(bind).toHaveBeenCalledWith(wb); expect(host.textContent).toContain('hello');
    expect(bar.add(item, 0)).toBe(false); expect(bar.remove('custom')).toBe(true); expect(unbind).toHaveBeenCalledOnce();
    bar.dispose(); expect(host.children.length).toBe(0);
  });
  it('keeps menu instances independent and lets MenuView customise items', () => {
    const a = new GC.Spread.Sheets.Workbook(), b = new GC.Spread.Sheets.Workbook();
    a.contextMenu.menuData.push({ name: 'custom', text: 'Custom' }); expect(b.contextMenu.menuData.some(x => x.name === 'custom')).toBe(false);
    const item = a.contextMenu.menuView.createMenuItemElement({ text: 'Custom', disable: true, subMenu: [] });
    expect(item.querySelector('[role=menuitem]')?.getAttribute('aria-disabled')).toBe('true');
    expect(item.querySelector('[role=menuitem]')?.getAttribute('aria-haspopup')).toBe('true');
  });
});
describe('M5 input masks', () => {
  it('validates, registers, substitutes and removes named patterns', () => {
    const M = GC.Spread.Sheets.InputMask;
    expect(M.validatePattern('000-000')).toEqual({ success: true }); expect(M.validatePattern('[').success).toBe(false);
    expect(M.validatePattern('9')).toEqual({ success: false, message: 'No Restriction Can Be Entered' });
    M.namedPattern('phone', '000-000'); expect(M.getNamedPatterns()).toContainEqual({ name: 'phone', pattern: '000-000' });
    expect(applyMask('123456', { pattern: 'phone' })).toBe('123-456'); M.namedPattern('phone', null);
    expect(M.namedPattern('phone')).toBeUndefined();
  });
  it('restricts input, applies letter case, literals and placeholders', () => {
    expect(applyMask('12x34', { pattern: '000-000' })).toBe('123-4__');
    expect(applyMask('12x34', { pattern: '000-000', excludePlaceholder: true })).toBe('123-4');
    expect(applyMask('12x34', { pattern: '000-000', excludeLiteral: true, excludePlaceholder: true })).toBe('1234');
    expect(applyMask('hELLO', { pattern: '><<<<' })).toBe('Hello');
    expect(applyMask('a7oSn', { pattern: '[>0]{5}' })).toBe('A7OSN');
    expect(applyMask('20200101', { pattern: 'yyyy/MM/dd' })).toBe('2020/01/01');
    expect(applyMask('3/4/2001', { pattern: 'MM/dd/yyyy' })).toBe('03/04/2001');
    expect(applyMask('342001', { pattern: 'M/d/yyyy' })).toBe('3/4/2001');
  });
});
