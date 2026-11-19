// @vitest-environment jsdom
import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { TabColorEditor } from '../src/dialogs/DialogHost.js';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

it('starts with empty channels and selects a color using lightness and spectrum', () => {
  const host = document.createElement('div');
  const root = createRoot(host);
  function Editor(): React.ReactElement {
    const [data, setData] = useState<Record<string, unknown>>({ red: '', green: '', blue: '' });
    return React.createElement(TabColorEditor, { data, update: (key, value) => setData(previous => ({ ...previous, [key]: value })) });
  }
  act(() => root.render(React.createElement(Editor)));
  const inputs = Array.from(host.querySelectorAll('input'));
  expect(inputs.map(input => input.value)).toEqual(['', '', '']);
  const slider = host.querySelector<HTMLElement>('.gc-tab-color-lightness')!;
  const spectrum = host.querySelector<HTMLElement>('.gc-tab-color-spectrum')!;
  slider.getBoundingClientRect = () => ({ left: 0, top: 0, width: 10, height: 160 } as DOMRect);
  spectrum.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 160 } as DOMRect);
  act(() => slider.dispatchEvent(new MouseEvent('click', { bubbles: true, clientY: 80 })));
  act(() => spectrum.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 0, clientY: 0 })));
  expect(inputs.map(input => input.value)).toEqual(['255', '0', '0']);
  act(() => spectrum.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, buttons: 1, clientX: 100, clientY: 0 })));
  expect(inputs.map(input => input.value)).toEqual(['0', '255', '255']);
  act(() => slider.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, buttons: 1, clientY: 160 })));
  expect(inputs.map(input => input.value)).toEqual(['0', '0', '0']);
  act(() => root.unmount());
});
