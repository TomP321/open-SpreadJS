// @vitest-environment jsdom
/* TASK 68 dialog sweep: the declarative and inline dialog bodies drop the native
 * <select>/<input type=checkbox|radio> (the "2000s" look the supervisor flagged —
 * the trial renders 0 native selects) and use the designer's own CustomSelect /
 * CustomCheckbox / CustomRadio. These tests pin the widgets the swap relies on:
 * the combobox exposes the same accessible roles the trial does (so the paired
 * Playwright specs keep working), it has NO native <select>, and choosing an
 * option commits the option's real value through onChange. */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { CustomCheckbox, CustomRadio, CustomSelect } from '../src/dialogs/custom-widgets.js';

// act() needs this flag set before React is rendered into.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const options = [{ text: 'General', value: 0 }, { text: 'Number', value: 1 }, { text: 'Date', value: 4 }];

describe('CustomSelect (replaces the native <select>)', () => {
  it('renders no native <select> and exposes the trial combo roles', () => {
    act(() => root.render(React.createElement(CustomSelect, { value: 0, options, onChange: () => undefined, ariaLabel: 'Category' })));
    expect(host.querySelector('select')).toBeNull();
    const field = host.querySelector('[role=combobox]');
    expect(field).not.toBeNull();
    expect(field!.getAttribute('aria-label')).toBe('Category');
    expect(field!.getAttribute('aria-expanded')).toBe('false');
    expect(field!.textContent).toContain('General');
  });

  it('opens on click, marks the current option selected, and commits the picked value', () => {
    const picks: unknown[] = [];
    act(() => root.render(React.createElement(CustomSelect, { value: 1, options, onChange: (value) => picks.push(value), ariaLabel: 'x' })));
    const field = host.querySelector<HTMLElement>('[role=combobox]')!;
    act(() => { field.click(); });
    expect(field.getAttribute('aria-expanded')).toBe('true');
    const items = [...host.querySelectorAll<HTMLElement>('[role=option]')];
    expect(items.map((item) => item.textContent)).toEqual(['General', 'Number', 'Date']);
    expect(items[1]!.getAttribute('aria-selected')).toBe('true');
    act(() => { items[2]!.click(); });
    expect(picks).toEqual([4]);
    // closed again after choosing
    expect(host.querySelector('[role=option]')).toBeNull();
  });

  it('keeps a disabled combo inert', () => {
    const picks: unknown[] = [];
    act(() => root.render(React.createElement(CustomSelect, { value: 0, options, disabled: true, onChange: (value) => picks.push(value), ariaLabel: 'x' })));
    const field = host.querySelector<HTMLElement>('[role=combobox]')!;
    act(() => { field.click(); });
    expect(field.getAttribute('aria-expanded')).toBe('false');
    expect(host.querySelector('[role=option]')).toBeNull();
    expect(picks).toEqual([]);
  });
});

describe('CustomCheckbox / CustomRadio (replace the native inputs)', () => {
  it('renders no native checkbox, is controlled, and reports toggles through onChange', () => {
    let checked = false;
    const onChange = (value: boolean): void => {
      checked = value;
      // A controlled widget only re-reflects the state after the host re-renders.
      act(() => root.render(React.createElement(CustomCheckbox, { checked, onChange, label: 'Wrap text' })));
    };
    act(() => root.render(React.createElement(CustomCheckbox, { checked, onChange, label: 'Wrap text' })));
    expect(host.querySelector('input[type=checkbox]')).toBeNull();
    const box = host.querySelector<HTMLElement>('[role=checkbox]')!;
    expect(box.getAttribute('aria-checked')).toBe('false');
    act(() => { box.click(); });
    expect(checked).toBe(true);
    expect(host.querySelector<HTMLElement>('[role=checkbox]')!.getAttribute('aria-checked')).toBe('true');
  });

  it('renders no native radio and fires onChange when not selected', () => {
    let fires = 0;
    act(() => root.render(React.createElement(CustomRadio, { checked: false, onChange: () => { fires += 1; }, label: 'Delimited' })));
    expect(host.querySelector('input[type=radio]')).toBeNull();
    const radio = host.querySelector<HTMLElement>('[role=radio]')!;
    expect(radio.getAttribute('aria-checked')).toBe('false');
    act(() => { radio.click(); });
    expect(fires).toBe(1);
  });
});
