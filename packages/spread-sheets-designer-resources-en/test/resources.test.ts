/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from 'vitest';
import { resources } from '../src/index.js';
import { getResources } from '@mescius/spread-sheets-designer';

describe('English resources package', () => {
  it('exposes the visible Home labels', () => {
    expect(resources.ribbon.home.bold).toBe('Bold');
    expect(resources.ribbon.home.paste).toBe('Paste');
    expect(resources.ribbon.home.conditionalFormat ?? (resources.ribbon.home as any).conditionFormat).toBe('Conditional Format');
  });
  it('registers itself with the designer resource store', () => {
    expect((getResources().ribbon as any).home.bold).toBe('Bold');
  });
});
