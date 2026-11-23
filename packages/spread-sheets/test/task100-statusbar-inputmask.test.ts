// @vitest-environment jsdom
/*
 * TASK 100 — StatusBar and InputMask namespace burn-down: one unit test per declared member.
 * InputMask expectations are the official trial's answers, observed through the public API by
 * the black-box probe (browser probe of the official core, .probe/t100/im-check.ts lists all
 * 48 compared cases).
 */
import { describe, expect, it } from 'vitest';
import GC from '../src/index.js';
import type { Workbook } from '../src/workbook.js';

const StatusBarNs = GC.Spread.Sheets.StatusBar;
const InputMask = GC.Spread.Sheets.InputMask;

function statusHost(): HTMLElement {
  const host = document.createElement('div');
  document.body.append(host);
  return host;
}

describe('StatusBar.StatusBar', () => {
  it('constructs with the default status items in the host', () => {
    const host = statusHost();
    const bar = new StatusBarNs.StatusBar(host);
    expect(bar.all().map(item => item.name)).toContain('count');
    expect(bar.all().map(item => item.name)).toContain('cellMode');
    expect(host.querySelector('.opensheets-status-bar')).not.toBeNull();
    bar.dispose();
  });
  it('add inserts an item at the position and rejects a duplicate name', () => {
    const bar = new StatusBarNs.StatusBar(statusHost());
    const item = new StatusBarNs.StatusItem('probe', { value: 'p' });
    expect(bar.add(item, 1)).toBe(true);
    expect(bar.all()[1]).toBe(item);
    expect(bar.add(new StatusBarNs.StatusItem('probe'), 0)).toBe(false);
  });
  it('all answers the live item list', () => {
    const bar = new StatusBarNs.StatusBar(statusHost());
    const before = bar.all();
    bar.add(new StatusBarNs.StatusItem('extra'), 0);
    expect(bar.all().length).toBe(before.length + 1);
  });
  it('bind attaches the bar to a workbook and refreshes the computed items', () => {
    const bar = new StatusBarNs.StatusBar(statusHost());
    const wb = new GC.Spread.Sheets.Workbook();
    const sheet = wb.getActiveSheet();
    sheet.setValue(0, 0, 1);
    sheet.setValue(0, 1, 2);
    sheet.setValue(0, 2, 3);
    sheet.setSelection(0, 0, 1, 3);
    bar.bind(wb);
    expect(bar.get('sum')!.value).toBe('Sum: 6');
    expect(bar.get('count')!.value).toBe('Count: 3');
    expect(bar.get('average')!.value).toBe('Average: 2');
    expect(bar.get('cellMode')!.value).toBe('Ready');
  });
  it('get answers the item by name and undefined when absent', () => {
    const bar = new StatusBarNs.StatusBar(statusHost());
    expect(bar.get('count')!.name).toBe('count');
    expect(bar.get('nope')).toBeUndefined();
  });
  it('remove drops the item and reports unknown names', () => {
    const bar = new StatusBarNs.StatusBar(statusHost());
    expect(bar.remove('sum')).toBe(true);
    expect(bar.get('sum')).toBeUndefined();
    expect(bar.remove('sum')).toBe(false);
  });
  it('unbind detaches the workbook so later updates stop refreshing', () => {
    const bar = new StatusBarNs.StatusBar(statusHost());
    const wb = new GC.Spread.Sheets.Workbook();
    bar.bind(wb);
    bar.unbind();
    wb.getActiveSheet().setValue(0, 0, 42);
    wb.getActiveSheet().setSelection(0, 0, 1, 1);
    expect(bar.get('count')!.value).not.toBe('Count: 1');
    expect(bar.get('cellMode')!.value).toBe('Ready');
  });
  it('update recomputes the selection statistics', () => {
    const bar = new StatusBarNs.StatusBar(statusHost());
    const wb = new GC.Spread.Sheets.Workbook();
    const sheet = wb.getActiveSheet();
    bar.bind(wb);
    sheet.setValue(0, 0, 5);
    sheet.setValue(0, 1, 7);
    sheet.setSelection(0, 0, 1, 2);
    bar.update();
    expect(bar.get('sum')!.value).toBe('Sum: 12');
    expect(bar.get('max')!.value).toBe('Max: 7');
  });
  it('dispose restores the host and unregisters the control', () => {
    const host = statusHost();
    const bar = new StatusBarNs.StatusBar(host);
    bar.dispose();
    expect(host.querySelector('.opensheets-status-bar')).toBeNull();
    expect(StatusBarNs.findControl(host)).toBeUndefined();
  });
});

describe('StatusBar.StatusItem', () => {
  it('onBind runs when the item joins a bound workbook', () => {
    let bound: unknown;
    class Watched extends StatusBarNs.StatusItem {
      override onBind(workbook: Workbook): void { bound = workbook; }
    }
    const bar = new StatusBarNs.StatusBar(statusHost());
    const wb = new GC.Spread.Sheets.Workbook();
    const item = new Watched('watched');
    bar.add(item, 0);
    bar.bind(wb);
    expect(bound).toBe(wb);
  });
  it('onCreateItemView receives the rendered container element', () => {
    const bar = new StatusBarNs.StatusBar(statusHost());
    let view: HTMLElement | undefined;
    class Watched extends StatusBarNs.StatusItem {
      override onCreateItemView(container: HTMLElement): void { view = container; super.onCreateItemView(container); }
    }
    bar.add(new Watched('watched'), 0);
    expect(view).toBeInstanceOf(HTMLElement);
    expect(bar.all().some(item => item.name === 'watched')).toBe(true);
  });
  it('onDispose runs when the item is removed', () => {
    const bar = new StatusBarNs.StatusBar(statusHost());
    let disposed = false;
    class Watched extends StatusBarNs.StatusItem {
      override onDispose(): void { disposed = true; super.onDispose(); }
    }
    bar.add(new Watched('watched'), 0);
    bar.remove('watched');
    expect(disposed).toBe(true);
  });
  it('onUnbind runs when the workbook detaches', () => {
    const bar = new StatusBarNs.StatusBar(statusHost());
    let unbound = false;
    class Watched extends StatusBarNs.StatusItem {
      override onUnbind(): void { unbound = true; }
    }
    bar.add(new Watched('watched'), 0);
    bar.bind(new GC.Spread.Sheets.Workbook());
    bar.unbind();
    expect(unbound).toBe(true);
  });
  it('onUpdate paints the item value and visibility into its view', () => {
    const host = statusHost();
    const bar = new StatusBarNs.StatusBar(host);
    const item = new StatusBarNs.StatusItem('probe', { value: 'p' });
    bar.add(item, 0);
    item.onUpdate('hello');
    const view = host.querySelector<HTMLElement>('.status-probe')!;
    expect(view.textContent).toBe('hello');
    item.visible = false;
    item.onUpdate();
    expect(view.style.display).toBe('none');
  });
});

describe('StatusBar.findControl', () => {
  it('findControl answers the status bar hosted on an element', () => {
    const host = statusHost();
    const bar = new StatusBarNs.StatusBar(host);
    expect(StatusBarNs.findControl(host)).toBe(bar);
    expect(StatusBarNs.findControl(document.createElement('div'))).toBeUndefined();
    bar.dispose();
  });
});

describe('InputMask', () => {
  it('getNamedPatterns lists the registered name/pattern pairs', () => {
    InputMask.namedPattern('t100zip', '00000');
    expect(InputMask.getNamedPatterns()).toContainEqual({ name: 't100zip', pattern: '00000' });
  });
  it('namedPattern registers, reads, substitutes and removes patterns like the trial', () => {
    expect(InputMask.namedPattern('t100missing')).toBeUndefined();
    InputMask.namedPattern('t100phone', '000-000');
    expect(InputMask.namedPattern('t100phone')).toBe('000-000');
    expect(InputMask.validatePattern('t100phone')).toEqual({ success: true });
    InputMask.namedPattern('t100phone', null);
    expect(InputMask.namedPattern('t100phone')).toBeNull();
    expect(InputMask.getNamedPatterns().some(p => p.name === 't100phone')).toBe(false);
  });
  it('validatePattern accepts restriction patterns', () => {
    expect(InputMask.validatePattern('aaa')).toEqual({ success: true });
    expect(InputMask.validatePattern('000-000')).toEqual({ success: true });
    expect(InputMask.validatePattern('a{2,3}')).toEqual({ success: true });
    expect(InputMask.validatePattern('(ab|cd)')).toEqual({ success: true });
    expect(InputMask.validatePattern('<>#')).toEqual({ success: true });
  });
  it('validatePattern rejects an empty pattern with the trial message', () => {
    expect(InputMask.validatePattern('')).toEqual({ success: false, message: 'Empty Pattern' });
  });
  it('validatePattern rejects patterns without any input restriction', () => {
    expect(InputMask.validatePattern('9')).toEqual({ success: false, message: 'No Restriction Can Be Entered' });
    expect(InputMask.validatePattern('(000)')).toEqual({ success: false, message: 'No Restriction Can Be Entered' });
    expect(InputMask.validatePattern('(a)')).toEqual({ success: false, message: 'No Restriction Can Be Entered' });
  });
  it('validatePattern reports quantifier failures with the trial messages', () => {
    expect(InputMask.validatePattern('a{2,1}')).toEqual({ success: false, message: 'Parse Quantifier Pattern Failure' });
    expect(InputMask.validatePattern('a{0}')).toEqual({ success: false, message: 'Parse Quantifier Pattern Failure' });
    expect(InputMask.validatePattern('{2}')).toEqual({ success: false, message: 'Error Quantifier Position' });
    expect(InputMask.validatePattern('(a|b){2}')).toEqual({ success: false, message: 'Error Quantifier Position' });
  });
  it('validatePattern reports grammar failures with the trial message', () => {
    expect(InputMask.validatePattern('a[')).toEqual({ success: false, message: 'Parse Unknown Pattern Failure' });
    expect(InputMask.validatePattern('(ab')).toEqual({ success: false, message: 'Parse Unknown Pattern Failure' });
    expect(InputMask.validatePattern('a{')).toEqual({ success: false, message: 'Parse Unknown Pattern Failure' });
    expect(InputMask.validatePattern('}')).toEqual({ success: false, message: 'Parse Unknown Pattern Failure' });
  });
  it('validatePattern accepts calendar patterns and rejects repeated fields', () => {
    expect(InputMask.validatePattern('yyyy-MM-dd')).toEqual({ success: true });
    expect(InputMask.validatePattern('h:mm:ss')).toEqual({ success: true });
    expect(InputMask.validatePattern('HH-hh')).toEqual({ success: false, message: 'Duplicated Date Time Pattern' });
    expect(InputMask.validatePattern('MM-dd-MM')).toEqual({ success: false, message: 'Duplicated Date Time Pattern' });
  });
});
